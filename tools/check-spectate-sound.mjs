// Headless checks for sound while spectating: once you're dead in 5v5 and watching a teammate, you hear the
// world from their position (listener on their eyes) and their own shots and steps play up close like yours.
//   node tools/check-spectate-sound.mjs     (needs playwright)
// Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(ROOT, path || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
await page.goto(url);
await page.waitForFunction(() => window.__game);

let failed = 0;
const check = async (name, fn) => {
  let r;
  try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 300) }; }
  if (!r?.pass) failed++;
  const { pass, ...rest } = r || {};
  console.log(`${r?.pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(rest)}`);
};

// A 5v5 round with the loop frozen (frames still render, so the listener updates every frame).
await page.evaluate(async () => {
  const h = window.__game; h.frozen = true;
  Object.assign(h.settings, { mode: 'rounds', agent: 'cinder', map: 'divide', botMode: 'static', difficulty: 'normal', side: 'atk' });
  await h.startMatch({}); h.frozen = true;
  h.sound.init();
  // Record where gunshots are placed (null = played up close, as your own).
  window.__shots = [];
  const orig = h.sound.gunshot.bind(h.sound);
  h.sound.gunshot = (def, pos, gun) => { window.__shots.push(pos); return orig(def, pos, gun); };
});
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05;

await check('Alive: you hear from your own eyes', async () => {
  await frames();
  const r = await page.evaluate(() => { const h = window.__game; return { ear: h.sound.listenerPos, eye: h.game.player.eye() }; });
  return { pass: near(r.ear, r.eye), ...r };
});

await check('Dead and spectating a teammate: you hear from their eyes, not your body', async () => {
  await page.evaluate(() => {
    const h = window.__game, g = h.game, p = g.player;
    const enemy = g.combatants.find(c => c.team !== p.team);
    g.kill(p, enemy, { def: { id: 'vandal', name: 'Vandal', cat: 'Rifle' }, part: 'body' });
    h.renderer.deathCam = { t: performance.now() - 10000 }; // skip the death cam
  });
  await frames();
  const r = await page.evaluate(() => {
    const h = window.__game, s = h.renderer.specTarget, p = h.game.player;
    return { spectating: !!s, ear: h.sound.listenerPos, theirEye: s?.eye(), body: p.eye() };
  });
  return { pass: r.spectating && near(r.ear, r.theirEye) && !near(r.ear, r.body), ...r };
});

await check('The spectated teammate\'s shots play up close; an enemy\'s are placed in the world', () => page.evaluate(() => {
  const h = window.__game, g = h.game, s = h.renderer.specTarget, p = g.player;
  const enemy = g.combatants.find(c => c.team !== p.team && c.alive);
  window.__shots = [];
  g.emit('shot', { who: s, gun: s.gun });
  g.emit('shot', { who: enemy, gun: enemy.gun });
  const [mine, theirs] = window.__shots;
  return { pass: mine === null && Array.isArray(theirs), mine, theirs };
}));

console.log(errors.length ? `Page errors: ${errors.join(' | ')}` : 'No page errors');
await browser.close();
server.close();
if (failed || errors.length) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('All checks passed');
