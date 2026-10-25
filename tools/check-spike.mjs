// Headless checks for the bots' spike play on Divide: the bot that picks up the spike walks out with the others
// in the buy phase, then carries it to the called site and plants it (also when it was given the lurker role).
// Defenders and you are hidden from the attackers and stand still, so nothing interrupts them.
//   node tools/check-spike.mjs     (needs playwright, like check-abilities.mjs)
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

const browser = await chromium.launch();
let failed = 0;
const errors = [];
const report = (name, r) => {
  const ok = r && r.pass;
  if (!ok) failed++;
  const { pass, ...rest } = r || {};
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(rest)}`);
};
const check = async (name, fn) => { try { report(name, await fn()); } catch (e) { report(name, { error: String(e).slice(0, 300) }); } };

const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'def' }); document.getElementById('play').click(); });
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });
await page.evaluate(() => { window.__game.frozen = true; }); // the checks below tick the match themselves

await check('Every plant spot on Divide is open floor inside its site', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, map = g.map, out = {};
  let pass = true;
  for (const [name, s] of Object.entries(map.sites)) {
    const cells = m.plantCells(name);
    const blocked = cells.filter(([cx, cz]) => {
      const c = map.cellCenter(cx, cz), y = map.heights[cz][cx], r = 0.4;
      return g.world.boxes.some(b => !b.passable && !b.temp && !b.floor && c.x - r < b.max[0] && c.x + r > b.min[0] && y + 0.35 < b.max[1] && y + 1.7 > b.min[1] && c.z - r < b.max[2] && c.z + r > b.min[2]);
    });
    const outside = cells.filter(([cx, cz]) => !m.inSite([map.cellCenter(cx, cz).x, 0, map.cellCenter(cx, cz).z]));
    out[name] = { cells: cells.length, blocked: blocked.length, outside: outside.length };
    if (!cells.length || blocked.length || outside.length) pass = false;
  }
  return { pass, ...out };
}));

// Play one round from the start of its buy phase: returns how far the carrier got from the spike's spawn by
// the end of the buy phase, and when (seconds into the live phase) the spike went down.
const playRound = (lurk) => page.evaluate((lurk) => {
  const g = window.__game.game, m = g.mode;
  if (m.phase !== 'buy') m.startRound();
  const hide = () => { for (const c of g.combatants) if (m.side(c) === 'def' || !c.isBot) { c.st.hiddenUntil = g.time + 5; c.hp = 9999; c.input.fwd = c.input.side = 0; if (c.brain) c.brain.mode = 'static'; } };
  const spawn = [...m.spike.pos];
  let carrier = null, buyMoved = 0, plantedAt = null, lurker = null;
  for (let i = 0; i < 128 * 160 && m.phase !== 'end'; i++) {
    hide();
    g.tick();
    const sp = m.spike;
    if (sp.carrier) carrier = sp.carrier;
    if (lurk && carrier && !lurker) { m.plan.atkRoles.set(carrier, 'lurk'); lurker = carrier.name; }
    if (m.phase === 'buy' && carrier) buyMoved = Math.hypot(carrier.pos[0] - spawn[0], carrier.pos[2] - spawn[2]);
    if (sp.state === 'planted') { plantedAt = g.time - m.liveAt; break; }
  }
  return { dead: g.combatants.filter(c => !c.alive).map(c => c.name + ':' + m.side(c)), carrier: carrier?.isBot ? carrier.name : carrier && 'you', lurker, buyMoved: +buyMoved.toFixed(1), plantedAt: plantedAt && +plantedAt.toFixed(1), site: m.spike.site, reason: m.lastResult?.reason };
}, lurk);

for (let r = 1; r <= 4; r++) {
  await check(`Round ${r}: the spike carrier walks out in the buy phase, then plants`, async () => {
    const res = await playRound(false);
    return { pass: !!res.carrier && res.carrier !== 'you' && res.buyMoved > 3 && res.plantedAt !== null && res.plantedAt < 60, ...res };
  });
}
await check('A lurker holding the spike still takes it to the called site and plants', async () => {
  await page.evaluate(() => window.__game.game.mode.startRound());
  const res = await playRound(true);
  return { pass: !!res.lurker && res.plantedAt !== null && res.plantedAt < 60, ...res };
});

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
