// Checks that the world's box grid (js/world.js) answers every collision and ray query exactly like testing every
// box in order would, on each shipped map, with temporary walls coming and going.
//   node tools/check-world.mjs     (needs playwright, like check-abilities.mjs)
// Exits with code 1 if any query differs.
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
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + 'index.html', { timeout: 90000 });
const result = await page.evaluate(async () => {
  const { World, rayAABB } = await import('./js/world.js');
  const { loadMapIndex, preloadMap, buildMap, mapList } = await import('./js/map.js');
  await loadMapIndex();
  // The reference: every box, in list order (what world.js did before the grid).
  const norm = (h, d) => { const n = [0, 0, 0]; if (h.axis >= 0) n[h.axis] = d[h.axis] > 0 ? -1 : 1; return n; };
  const ref = {
    overlap(boxes, a) { const e = 1e-5; for (const b of boxes) { if (b.passable) continue; if (a[0] < b.max[0] - e && a[3] > b.min[0] + e && a[1] < b.max[1] - e && a[4] > b.min[1] + e && a[2] < b.max[2] - e && a[5] > b.min[2] + e) return b; } return null; },
    raycast(boxes, o, d, maxT) { let best = null; for (const b of boxes) { const h = rayAABB(o, d, b.min, b.max); if (h && h.tIn <= maxT && (!best || h.tIn < best.t)) best = { t: h.tIn, box: b, axis: h.axis }; } if (best) best.n = norm(best, d); return best; },
    raycastAll(boxes, o, d, maxT) { const hits = []; for (const b of boxes) { const h = rayAABB(o, d, b.min, b.max); if (h && h.tIn <= maxT) hits.push({ tIn: h.tIn, tOut: Math.min(h.tOut, maxT), box: b, n: norm(h, d) }); } hits.sort((a, b) => a.tIn - b.tIn); return hits; },
    los(boxes, a, b) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const len = Math.hypot(...d); if (len < 1e-6) return true; d[0] /= len; d[1] /= len; d[2] /= len; for (const box of boxes) { const h = rayAABB(a, d, box.min, box.max); if (h && h.tIn < len - 0.05) return false; } return true; },
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = {};
  for (const { id } of mapList()) {
    await preloadMap(id);
    const map = buildMap(id), w = new World([...map.boxes]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of map.boxes) { x0 = Math.min(x0, b.min[0]); x1 = Math.max(x1, b.max[0]); z0 = Math.min(z0, b.min[2]); z1 = Math.max(z1, b.max[2]); }
    const pt = () => [x0 - 5 + rnd() * (x1 - x0 + 10), -1 + rnd() * 12, z0 - 5 + rnd() * (z1 - z0 + 10)];
    let n = 0, bad = 0; const fails = [];
    const temps = [];
    for (let i = 0; i < 20000; i++) {
      if (i % 500 === 0) { // walls come and go, like abilities and barriers
        if (temps.length && rnd() < 0.5) { const t = temps.splice(Math.floor(rnd() * temps.length), 1)[0]; w.boxes.splice(w.boxes.indexOf(t), 1); }
        const c = pt(), box = { min: [c[0] - 2, -1, c[2] - 0.25], max: [c[0] + 2, 6, c[2] + 0.25], temp: true, passable: rnd() < 0.3 };
        w.boxes.push(box); temps.push(box);
      }
      const a = pt(), b = pt(), d0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      if (i % 7 === 0) { d0[0] = d0[2] = 0; } // straight down/up, as ground checks do
      const len = Math.hypot(...d0) || 1, d = d0.map(v => v / len), maxT = rnd() < 0.5 ? len : 200;
      const box = [a[0] - 0.4, a[1], a[2] - 0.4, a[0] + 0.4, a[1] + 1.8, a[2] + 0.4];
      const same = (x, y) => JSON.stringify(x, (k, v) => (k === 'box' ? v && map.boxes.indexOf(v) + '/' + w.boxes.indexOf(v) : v)) === JSON.stringify(y, (k, v) => (k === 'box' ? v && map.boxes.indexOf(v) + '/' + w.boxes.indexOf(v) : v));
      const checks = [
        ['overlap', w.overlap(...box), ref.overlap(w.boxes, box)],
        ['raycast', w.raycast(a, d, maxT), ref.raycast(w.boxes, a, d, maxT)],
        ['raycastAll', w.raycastAll(a, d, maxT), ref.raycastAll(w.boxes, a, d, maxT)],
        ['lineOfSight', w.lineOfSight(a, b), ref.los(w.boxes, a, b)],
      ];
      for (const [name, got, want] of checks) { n++; if (name === 'overlap' ? got !== want : !same(got, want)) { bad++; if (fails.length < 3) fails.push({ name, a, d, maxT }); } }
    }
    out[id] = { boxes: map.boxes.length, queries: n, mismatches: bad, fails };
  }
  return out;
});
let failed = 0;
for (const [id, r] of Object.entries(result)) { const ok = !r.mismatches; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${JSON.stringify(r)}`); }
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
