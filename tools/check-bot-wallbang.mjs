// Headless checks that bots don't shoot through walls: a bot that was just fighting an enemy who stepped behind
// a wall must stop firing and hold the last spot it saw them, while the same bot with a clear view still shoots.
//   node tools/check-bot-wallbang.mjs     (needs playwright, like check-abilities.mjs)
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

// One duel: a hard bot with a Vandal and an enemy 3 m either side of a solid wall (or both on the same side),
// the bot told it saw the enemy this instant. Returns how many shots it fired and how much damage it did.
const duel = (blocked, trials) => page.evaluate(({ blocked, trials }) => {
  const g = window.__game.game, m = g.mode;
  while (m.phase === 'buy') g.tick();
  const [bot, foe] = [g.combatants.find(c => c.isBot && m.side(c) === 'atk'), g.combatants.find(c => c.isBot && m.side(c) === 'def')];
  for (const c of g.combatants) if (c !== bot && c !== foe) { c.st.hiddenUntil = 1e9; if (c.brain) c.brain.mode = 'static'; c.pos = [9999, -50, 9999]; }
  const fitsAt = (x, y, z) => !g.world.boxes.some(b => !b.passable && !b.floor && x - 0.5 < b.max[0] && x + 0.5 > b.min[0] && y + 0.2 < b.max[1] && y + 1.9 > b.min[1] && z - 0.5 < b.max[2] && z + 0.5 > b.min[2]);
  // A tall, thin, solid wall (along either axis) with standing room on both sides.
  let bp, fp, wall;
  for (const b of g.world.boxes) {
    if (b.passable || b.floor || b.temp || b.max[1] - b.min[1] < 2.5) continue;
    for (const ax of [0, 2]) {
      const o = 2 - ax, y = b.min[1];
      if (b.max[ax] - b.min[ax] > 2 || b.max[o] - b.min[o] < 3) continue;
      const at = (a, c) => { const p = [0, y, 0]; p[ax] = a; p[o] = c; return p; };
      const c = (b.min[o] + b.max[o]) / 2;
      const p1 = at(b.min[ax] - 3, c), p2 = at(b.max[ax] + 3, c), p3 = at(b.min[ax] - 8, c);
      if (![p1, p2, p3].every(p => fitsAt(p[0], p[1], p[2]))) continue;
      if (g.world.lineOfSight([p1[0], y + 1.5, p1[2]], [p3[0], y + 1.5, p3[2]]) !== true) continue;
      wall = b; bp = p1; fp = blocked ? p2 : p3; break;
    }
    if (wall) break;
  }
  if (!wall) return { error: 'no wall found' };
  let shots = 0, dmg = 0;
  const onTracer = e => { if (e.who === bot) shots++; };
  const onHit = e => { if (e.attacker === bot) dmg += e.dealt ?? e.amount; };
  g.on('tracer', onTracer); g.on('hit', onHit);
  let sees = false;
  const kit = bot.kit; bot.kit = null; // no abilities: just the gun
  for (let t = 0; t < trials; t++) {
    bot.alive = foe.alive = true; bot.hp = foe.hp = 9999;
    bot.give('vandal'); bot.equip('primary', g.time, true); bot.gun.nextFire = 0; bot.gun.equipEnd = 0; bot.gun.mag = bot.gun.def.mag;
    if (foe.brain) foe.brain.mode = 'static';
    bot.brain.mode = 'fight'; bot.brain.d = { ...bot.brain.d, react: [0, 0] };
    bot.brain.reset(g.time);
    bot.pos = [...bp]; foe.pos = [...fp]; bot.vel = [0, 0, 0];
    const e = bot.eye(), f = foe.eye();
    bot.yaw = Math.atan2(-(f[0] - e[0]), -(f[2] - e[2])); bot.pitch = 0;
    sees = g.canSee(e, f);
    // It saw them a moment ago (they just stepped behind the wall).
    const br = bot.brain;
    br.target = foe; br.lastSeen = g.time; br.lastSeenPos = [...foe.pos]; br.reactUntil = 0; br.aimHead = false; br.lastAim = null;
    br.nextSense = g.time + 0.15;
    for (let i = 0; i < 128 * 0.6; i++) { foe.pos = [...fp]; foe.vel = [0, 0, 0]; g.tick(); }
  }
  bot.kit = kit;
  for (const [k, fn] of [['tracer', onTracer], ['hit', onHit]]) g.listeners[k].splice(g.listeners[k].indexOf(fn), 1);
  return { sees, shots, dmg };
}, { blocked, trials });

await check('Bot does not fire at an enemy who is behind a wall', async () => {
  const r = await duel(true, 10);
  return { pass: !r.error && !r.sees && r.shots === 0 && r.dmg === 0, ...r };
});
await check('Bot still fires at an enemy it can see', async () => {
  const r = await duel(false, 5);
  return { pass: !r.error && r.sees && r.shots > 0, ...r };
});

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
