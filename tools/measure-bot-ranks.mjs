// Plays bot-only deathmatch headless at each bot rank and prints how the bots shoot and move, to compare with
// the real per-rank numbers in js/bot.js (RANKS): headshot rate, time from first seeing an enemy to the first
// shot, how fast the crosshair turns in a fight (flicks), and how much of a fight is spent strafing.
//   node tools/measure-bot-ranks.mjs [seconds=120] [rank,rank,...|all] [--map divide] [--calibrate]     (needs playwright)
// --calibrate re-runs each rank a few times, scaling its `head` chance until the headshot rate matches realHS,
// and prints the values to put in RANKS.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const argv = process.argv.slice(2);
const mapAt = argv.indexOf('--map'), MAP = mapAt >= 0 ? argv[mapAt + 1] : 'divide';
const args = argv.filter((a, i) => !a.startsWith("--") && (mapAt < 0 || i !== mapAt + 1));
const SECONDS = +(args[0] || 120), CALIBRATE = argv.includes('--calibrate');

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
const errors = [];
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
const ALL = await page.evaluate(async () => Object.keys((await import('/js/bot.js')).RANKS));
const ranks = !args[1] || args[1] === 'all' ? ALL : args[1].split(',');

console.log(`rank        HS%   (real)  first shot ms (p25/med/p75)   turn °/s p95  flicks>600°/s  strafing  hits`);
for (const rank of ranks) {
  let head = null, r;
  for (let pass = 0; pass < (CALIBRATE ? 4 : 1); pass++) {
  r = await page.evaluate(async ({ rank, SECONDS, MAP, head }) => {
    const G = window.__game;
    const { Bot, RANKS } = await import('/js/bot.js');
    if (head != null) RANKS[rank].head = head;
    Object.assign(G.settings, { mode: 'dm', map: MAP, botCount: 9, difficulty: rank, botWeapons: 'rifles', killLimit: 9999, timeMinutes: 60 });
    await G.startMatch();
    G.frozen = true;
    const g = G.game, p = g.player;
    p.brain = new Bot(p, g, rank, 'fight'); p.isBot = true; if (!g.bots.includes(p)) g.bots.push(p);
    let heads = 0, hits = 0;
    const onHit = (e) => { if (e.attacker?.isBot && !e.dot && e.def && !e.def.melee && e.def.id !== 'ability') { hits++; if (e.part === "head") heads++; } };
    g.on('hit', onHit);
    const first = [], turn = [], st = new Map();
    let fightTicks = 0, strafeTicks = 0, flicks = 0;
    const DT = 1 / 128;
    for (let i = 0; i < SECONDS * 128; i++) {
      for (const b of g.bots) {
        const br = b.brain;
        let s = st.get(b); if (!s) st.set(b, s = { react: 0, seenAt: null, yaw: b.yaw, shot: b.gun?.lastShot });
        if (br.reactUntil !== s.react) { s.react = br.reactUntil; s.seenAt = g.time; s.shot = b.gun?.lastShot; } // a new sighting
        const fighting = b.alive && br.target?.alive && g.time - br.lastSeen < 0.2;
        if (fighting) {
          fightTicks++;
          if (Math.abs(b.input.side) > 0.5) strafeTicks++;
          const w = Math.abs(Math.atan2(Math.sin(b.yaw - s.yaw), Math.cos(b.yaw - s.yaw))) / DT * 180 / Math.PI;
          turn.push(w); if (w > 600) flicks++;
        }
        if (s.seenAt != null && b.gun && b.gun.lastShot !== s.shot) { first.push(g.time - s.seenAt); s.seenAt = null; }
        if (s.seenAt != null && g.time - s.seenAt > 2) s.seenAt = null;
        s.yaw = b.yaw;
      }
      g.tick();
    }
    g.listeners.hit = g.listeners.hit.filter(f => f !== onHit);
    const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
    G.frozen = false;
    return { head: RANKS[rank].head, hs: heads / Math.max(1, hits) * 100, real: RANKS[rank].realHS, hits, f25: q(first, 0.25) * 1000, f50: q(first, 0.5) * 1000, f75: q(first, 0.75) * 1000, t95: q(turn, 0.95), flick: flicks / Math.max(1, fightTicks) * 100, strafe: strafeTicks / Math.max(1, fightTicks) * 100 };
  }, { rank, SECONDS, MAP, head });
  if (CALIBRATE) { head = Math.max(0.02, Math.min(1, r.head * Math.pow(r.real / Math.max(1, r.hs), 0.8))); console.log(`  ${rank} pass ${pass + 1}: head ${r.head.toFixed(3)} -> HS ${r.hs.toFixed(1)}% (want ${r.real}); next ${head.toFixed(3)}`); }
  }
  console.log(`${rank.padEnd(10)} ${r.hs.toFixed(1).padStart(5)}  ${(r.real ?? NaN).toFixed(1).padStart(5)}   ${[r.f25, r.f50, r.f75].map(v => v.toFixed(0).padStart(4)).join(' / ')}                 ${r.t95.toFixed(0).padStart(5)}      ${r.flick.toFixed(1).padStart(5)}%     ${r.strafe.toFixed(0).padStart(4)}%   ${r.hits}`);
}
if (errors.length) console.log('Page errors:', errors.slice(0, 5));
await browser.close();
server.close();
