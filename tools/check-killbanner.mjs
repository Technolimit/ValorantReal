// Headless checks for the kill banner: it shows on your kills only, lights one pip per kill in the streak, takes
// its colours from the killing weapon's skin, resets when a deathmatch life ends, and calls an ace in rounds.
//   node tools/check-killbanner.mjs [shots-dir]     (needs playwright; with a dir, saves a screenshot per tier)
// Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const SHOTS = process.argv[2];

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
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
await page.goto(url);
await page.waitForFunction(() => window.__game);

await page.evaluate(async () => {
  const { WEAPONS } = await import('./js/weapons.js');
  window.__W = WEAPONS;
  window.__start = async (o) => {
    const h = window.__game; h.frozen = true;
    Object.assign(h.settings, { mode: 'dm', botCount: 6, agent: 'cinder', map: 'arena', botMode: 'static', difficulty: 'normal', side: 'atk' }, o);
    await h.startMatch({}); h.frozen = true;
    return h.game;
  };
  // What the banner shows right now.
  window.__banner = () => {
    const kb = document.querySelector('#killbanner .kb');
    if (!kb) return null;
    return { tier: +kb.className.match(/tier(\d)/)[1], ace: kb.classList.contains('ace'), lit: kb.querySelectorAll('.kb-pips .on').length, accent: kb.style.getPropertyValue('--kb-accent'), caption: kb.querySelector('.kb-caption').textContent };
  };
});

let failed = 0;
const check = async (name, fn) => {
  let r;
  try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 300) }; }
  if (!r?.pass) failed++;
  const { pass, ...rest } = r || {};
  console.log(`${r?.pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(rest)}`);
};
const shot = async (name) => { if (SHOTS) await page.locator('#killbanner').screenshot({ path: join(SHOTS, name + '.png') }).catch(() => {}); };

await check('A kill by someone else shows no banner', () => page.evaluate(async () => {
  const g = await __start({});
  const [a, b] = g.bots;
  g.kill(b, a, { def: __W.vandal, part: 'body' });
  return { pass: __banner() === null };
}));

await check('Your kills light one pip each and escalate the tier, in the vandal skin\'s colours', async () => {
  const seen = [];
  for (const [i, skin] of [[0, 'ember'], [1, 'glacier'], [2, 'standard'], [3, 'ember'], [4, 'glacier']]) {
    seen.push(await page.evaluate(async ([i, skin]) => {
      const h = window.__game, g = h.game;
      if (i === 0) await __start({});
      h.settings.skins = { vandal: skin };
      g.kill(g.bots[i], g.player, { def: __W.vandal, part: i === 4 ? 'head' : 'body' });
      return { skin, ...__banner() };
    }, [i, skin]));
    await page.waitForTimeout(450);
    await shot(`tier${i + 1}-${skin}`);
  }
  const accents = Object.fromEntries(seen.map(s => [s.skin, s.accent]));
  return {
    pass: seen.every((s, i) => s.tier === i + 1 && s.lit === i + 1) && accents.ember !== accents.glacier && accents.glacier !== accents.standard && /HEADSHOT/.test(seen[4].caption),
    seen: seen.map(s => `${s.tier}/${s.lit} ${s.skin} ${s.accent}`),
  };
});

await check('Knife kills use your melee type\'s theme; ability kills use your agent colour', () => page.evaluate(async () => {
  const h = window.__game, g = await __start({});
  h.settings.melee = 'karambit'; // Nightglass: violet
  h.settings.skins = { vandal: 'glacier' };
  g.kill(g.bots[0], g.player, { def: __W.knife, part: 'body' });
  const knife = __banner().accent;
  g.kill(g.bots[1], g.player, { def: __W.vandal, part: 'body' });
  const vandal = __banner().accent;
  g.kill(g.bots[2], g.player, { def: { id: 'firebreak', name: 'Firebreak', cat: 'Ability' }, part: 'body' });
  const ability = __banner().accent;
  return { pass: knife !== vandal && ability !== knife && ability !== vandal, knife, vandal, ability };
}));

await check('Dying in deathmatch starts the streak over', () => page.evaluate(async () => {
  const g = await __start({});
  g.kill(g.bots[0], g.player, { def: __W.vandal, part: 'body' });
  g.kill(g.bots[1], g.player, { def: __W.vandal, part: 'body' });
  const before = __banner().tier;
  g.kill(g.player, g.bots[2], { def: __W.vandal, part: 'body' });
  g.player.alive = true;
  g.kill(g.bots[3], g.player, { def: __W.vandal, part: 'body' });
  return { pass: before === 2 && __banner().tier === 1, before, after: __banner().tier };
}));

await check('More than five kills stays on the top tier and shows the count', () => page.evaluate(async () => {
  const g = await __start({});
  for (let i = 0; i < 6; i++) g.kill(g.bots[i], g.player, { def: __W.vandal, part: 'body' });
  const b = __banner();
  return { pass: b.tier === 5 && b.lit === 5 && /×6/.test(b.caption), ...b };
}));

await check('Killing the whole enemy team in a round is an ace', async () => {
  const r = await page.evaluate(async () => {
    const h = window.__game, g = await __start({ mode: 'rounds', map: 'divide', botCount: 9 });
    h.settings.skins = { vandal: 'ember' };
    const foes = g.combatants.filter(c => g.isEnemy(g.player, c));
    const tiers = [];
    for (const f of foes) { g.kill(f, g.player, { def: __W.vandal, part: 'body' }); tiers.push(__banner().tier); }
    return { foes: foes.length, tiers, ...__banner() };
  });
  await page.waitForTimeout(500);
  await shot('ace');
  return { pass: r.foes === 5 && r.ace && r.tiers.join() === '1,2,3,4,5', ...r };
});

await check('No page errors', () => ({ pass: errors.length === 0, errors: errors.slice(0, 3) }));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
