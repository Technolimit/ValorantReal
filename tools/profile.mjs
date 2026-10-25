// Headless performance profile: plays offline 5v5 on Divide with ten bots and reports what a frame costs.
//   node tools/profile.mjs [seconds]     (needs playwright, like check-abilities.mjs)
// Prints the simulation cost per 128 Hz tick, the CPU cost of a render call, draw calls and triangles, how often
// shaders were compiled mid-match, and how much garbage the simulation makes. Headless Chromium draws in software,
// so render times are only good for comparing runs on the same machine.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const NO_RENDER = process.argv.includes('--no-render');
const SECONDS = Number(process.argv.find(a => /^\d+$/.test(a))) || 20;

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

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d; };
const SETTINGS = { shadows: arg('--shadows', 'off') === 'on', renderScale: Number(arg('--scale', 0.5)) };
await page.addInitScript((s) => { window.__profileSettings = s; }, SETTINGS);
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify(window.__profileSettings)); } catch { /* storage blocked */ } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'atk' }); document.getElementById('play').click(); });
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });
await page.evaluate(() => { window.__game.frozen = true; });
// --cpu: also print the functions that take the most time, and where the most garbage is allocated.
const deep = process.argv.includes('--cpu');
const cdp = deep && await page.context().newCDPSession(page);
if (deep) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }

// --spikes: time the main parts of a tick and report the slowest calls of each (finds what makes a tick spike).
if (process.argv.includes('--spikes')) await page.evaluate(async () => {
  const h = window.__game, g = h.game;
  const { Map: _ } = window;
  const slow = window.__slow = {};
  const wrap = (obj, name, label) => {
    const f = obj[name];
    if (typeof f !== 'function' || f.__wrapped) return;
    obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; const s = slow[label] ||= { calls: 0, total: 0, max: 0, over2ms: 0 }; s.calls++; s.total += d; if (d > s.max) s.max = d; if (d > 2) s.over2ms++; } };
    obj[name].__wrapped = true;
  };
  const bot = g.bots[0]?.brain, kit = g.combatants[0]?.kit, c = g.combatants[0];
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(bot))) if (k !== 'constructor') wrap(Object.getPrototypeOf(bot), k, 'bot.' + k);
  wrap(Object.getPrototypeOf(g.map), 'findPath', 'map.findPath');
  wrap(g.map, 'findPath', 'map.findPath');
  for (const k of ['tick', 'tickDevices', 'tickZones', 'tickDrops', 'fire', 'hitscan', 'noise', 'canSee']) wrap(Object.getPrototypeOf(g), k, 'game.' + k);
  wrap(Object.getPrototypeOf(g.mode), 'tick', 'mode.tick');
  wrap(Object.getPrototypeOf(kit), 'tick', 'kit.tick');
  wrap(Object.getPrototypeOf(c), 'move', 'combatant.move');
  wrap(Object.getPrototypeOf(g.world), 'lineOfSight', 'world.lineOfSight');
});

const out = await page.evaluate(async ([SECONDS, NO_RENDER]) => {
  const h = window.__game, g = h.game, r = h.renderer, gl = r.renderer;
  gl.info.autoReset = false; // count the world and the view model together
  const DT = 1 / 128;
  // The player is a bot-proof spectator so the round plays out; bots fight each other.
  const p = g.player; p.hp = 1e9;
  const tickMs = [], renderMs = [], calls = [], tris = [], hitches = [];
  let programs0 = gl.info.programs.length, compiles = 0;
  const heap = () => performance.memory?.usedJSHeapSize || 0;
  let alloc = 0, prevHeap = heap();
  const frames = Math.round(SECONDS * 60);
  for (let f = 0; f < frames; f++) {
    if (g.mode.phase === 'end' || g.state !== 'playing') g.mode.startRound?.();
    p.hp = 1e9;
    // ~2.13 ticks per 60 Hz frame, as main.js does
    const want = Math.floor((f + 1) * 128 / 60) - Math.floor(f * 128 / 60);
    const t0 = performance.now();
    for (let i = 0; i < want; i++) { h.playerInput(); g.tick(); h.net.tick(); }
    const t1 = performance.now();
    gl.info.reset();
    if (!NO_RENDER) r.render(0.5, 1 / 60, { dx: 0, dy: 0 });
    const t2 = performance.now();
    const hz = heap(); if (hz > prevHeap) alloc += hz - prevHeap; prevHeap = hz;
    tickMs.push((t1 - t0) / want); renderMs.push(t2 - t1);
    calls.push(gl.info.render.calls); tris.push(gl.info.render.triangles);
    const np = gl.info.programs.length;
    if (np > programs0) { compiles += np - programs0; hitches.push({ frame: f, newPrograms: np - programs0, ms: +(t2 - t1).toFixed(1) }); programs0 = np; }
    if (f % 30 === 0) await new Promise(res => setTimeout(res, 0));
  }
  const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (k) => +s[Math.min(s.length - 1, Math.floor(k * s.length))].toFixed(3); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(3) }; };
  // What the draw calls are spent on, in the last frame: visible meshes under each top-level object.
  const byGroup = {};
  const chars = new Set([...r.characters.values()].map(c => c.group));
  for (const top of r.scene.children) {
    const name = top === r.worldGroup ? 'map' : chars.has(top) ? 'characters' : top.type;
    let n = 0;
    top.traverseVisible(o => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) n++; });
    if (n) byGroup[name] = (byGroup[name] || 0) + n;
  }
  return { settings: { shadows: gl.shadowMap.enabled, pixelRatio: gl.getPixelRatio() }, byGroup, frames, simSeconds: +(g.time).toFixed(1), tickMs: stat(tickMs), renderCpuMs: stat(renderMs), drawCalls: stat(calls), triangles: stat(tris), midMatchShaderCompiles: compiles, hitches: hitches.slice(0, 12), allocMBPerSec: +(alloc / 1048576 / SECONDS).toFixed(2), programs: gl.info.programs.length, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, sceneObjects: (() => { let n = 0; r.scene.traverse(() => n++); return n; })() };
}, [SECONDS, NO_RENDER]);
console.log(JSON.stringify(out, null, 1));
const slow = await page.evaluate(() => window.__slow);
if (slow) {
  console.log('\nSlowest parts of a tick (ms):');
  for (const [k, v] of Object.entries(slow).sort((a, b) => b[1].max - a[1].max).slice(0, 25)) console.log(`${k.padEnd(28)} calls ${String(v.calls).padStart(7)}  avg ${(v.total / v.calls).toFixed(3)}  max ${v.max.toFixed(2)}  >2ms ${v.over2ms}`);
}
if (deep) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map(n => [n.id, n]));
  profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log('\nTop self time:');
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
  const { profile: hp } = await cdp.send('HeapProfiler.stopSampling');
  const sizes = new Map();
  const walk = (n) => { const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; sizes.set(k, (sizes.get(k) || 0) + n.selfSize); n.children.forEach(walk); };
  walk(hp.head);
  console.log('\nTop allocation sites (sampled, live at end + collected):');
  for (const [k, v] of [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${(v / 1024).toFixed(0).padStart(7)} KB  ${k}`);
}
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
server.close();
