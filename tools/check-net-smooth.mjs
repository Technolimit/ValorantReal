// Measures how smoothly another player moves on your screen online. Two tabs play over BroadcastChannel; the
// host's player runs in a circle at a steady speed, and the client's copy of the host's messages is delayed by a
// jittery 40-100 ms (in order, like a real connection). On the client it samples where the host's body is drawn
// every frame and reports:
//   speedCV  how much its speed wobbles from frame to frame (0 = perfectly smooth; the real speed never changes)
//   errAvg   how far it is drawn from where the host really was at that moment, in metres (lag + error)
//   node tools/check-net-smooth.mjs [--jitter off]   (needs playwright, like check-abilities.mjs)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const JITTER = !(process.argv.includes('--jitter') && process.argv[process.argv.indexOf('--jitter') + 1] === 'off');
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
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
await ctx.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
const H = await ctx.newPage(), C = await ctx.newPage();
const errors = [];
for (const p of [H, C]) { p.on('pageerror', e => errors.push(String(e))); await p.goto(url); await p.waitForFunction(() => window.__game); }
const form = (agent) => {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set('net-transport', 'local'); set('net-join-transport', 'local'); set('net-room', 'SMOOTH'); set('net-code', 'SMOOTH'); set('net-mode', 'dm'); set('net-agent', agent); set('net-name', agent);
  Object.assign(window.__game.settings, { botCount: 0, botMode: 'static', map: 'arena', agent });
};
await H.evaluate(form, 'cinder'); await C.evaluate(form, 'thistle');
await H.evaluate(() => window.__game.hostOnline({ lobby: false }));
await C.evaluate(() => window.__game.joinOnline({ agent: 'thistle' }));
const joined = () => C.waitForFunction(() => window.__game.net?.role === 'client', null, { timeout: 15000 }).then(() => true, () => false);
if (!await joined()) { await C.evaluate(() => window.__game.joinOnline({ agent: 'thistle' })); if (!await joined()) throw new Error('client never joined the host'); }
await H.waitForTimeout(1500);

// Host: run in a circle (radius 6 m around the spawn) by setting the position each tick; log the true path.
await H.evaluate(() => {
  const h = window.__game, g = h.game, p = g.player, c0 = [...p.pos], R = 6, W = 5.4 / R;
  window.__truth = [];
  const tick = g.tick.bind(g);
  g.tick = () => {
    const a = g.time * W;
    p.prevPos = [...p.pos];
    p.pos = [c0[0] + Math.cos(a) * R, c0[1], c0[2] + Math.sin(a) * R];
    p.vel = [-Math.sin(a) * R * W, 0, Math.cos(a) * R * W];
    tick();
    p.pos = [c0[0] + Math.cos(a) * R, c0[1], c0[2] + Math.sin(a) * R]; // movement code ran too: put it back on the circle
    window.__truth.push([performance.timeOrigin + performance.now(), p.pos[0], p.pos[2]]);
  };
});
// Client: delay what the host sends by 40-100 ms, in order; sample the host's body where it is drawn each frame.
await C.evaluate((jitter) => {
  const h = window.__game, net = h.net, t = net.t, recv = t.onmessage;
  let lastAt = 0;
  if (jitter) t.onmessage = (m) => { const at = Math.max(lastAt, performance.now() + 40 + Math.random() * 60); lastAt = at; setTimeout(() => recv(m), at - performance.now()); };
  window.__seen = [];
  const r = h.renderer;
  const render = r.render.bind(r);
  r.render = (alpha, dt, look) => {
    render(alpha, dt, look);
    const host = h.game.combatants.find(c => c.remote);
    const ch = host && r.characters.get(host);
    if (ch) window.__seen.push([performance.timeOrigin + performance.now(), ch.group.position.x, ch.group.position.z]);
  };
}, JITTER);
await C.waitForTimeout(1000);
await C.evaluate(() => { window.__seen = []; });
await C.waitForTimeout(8000);
const truth = await H.evaluate(() => window.__truth), seen = await C.evaluate(() => window.__seen);
const at = (t) => { // the host's true position at wall time t
  let lo = 0, hi = truth.length - 1;
  if (t <= truth[0][0] || t >= truth[hi][0]) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (truth[m][0] <= t) lo = m; else hi = m; }
  const a = truth[lo], b = truth[hi], k = (t - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const speeds = [], errs = [];
for (let i = 1; i < seen.length; i++) {
  const dt = (seen[i][0] - seen[i - 1][0]) / 1000;
  if (dt > 0.004) speeds.push(Math.hypot(seen[i][1] - seen[i - 1][1], seen[i][2] - seen[i - 1][2]) / dt);
  const tr = at(seen[i][0]);
  if (tr) errs.push(Math.hypot(tr[0] - seen[i][1], tr[1] - seen[i][2]));
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const sorted = [...errs].sort((a, b) => a - b);
console.log(JSON.stringify({ jitter: JITTER, frames: seen.length, speedMean: +mean(speeds).toFixed(2), trueSpeed: 5.4, speedCV: +(sd(speeds) / mean(speeds)).toFixed(3), errAvg: +mean(errs).toFixed(3), errP95: +sorted[Math.floor(0.95 * sorted.length)].toFixed(3), errMax: +sorted[sorted.length - 1].toFixed(3) }));
if (errors.length) console.log('Page errors:', errors.slice(0, 5));
await browser.close();
server.close();
