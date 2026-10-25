// Makes a box-built map bigger or smaller: every position and size is multiplied by the factor, around the
// centre of the world (0, 0, 0). Heights scale too unless you add --flat.
//   node tools/scale-map.mjs maps/divide.json 0.95 [out.json] [--flat]
// Grid maps are drawn in fixed 2 m squares, so they can't be scaled this way.
import { readFileSync, writeFileSync } from 'node:fs';
import { stringifyMap } from '../js/map.js';

const args = process.argv.slice(2);
const flat = args.includes('--flat');
const [src, factor, dst = src] = args.filter(a => a !== '--flat');
const k = Number(factor);
if (!src || !(k > 0)) { console.error('usage: node tools/scale-map.mjs <map.json> <factor> [out.json] [--flat]'); process.exit(1); }
const j = JSON.parse(readFileSync(src, 'utf8'));
if (j.format !== 'tapfire-map') { console.error('Convert the map first: node tools/upgrade-map.mjs ' + src); process.exit(1); }
if (j.grid) { console.error('Grid maps use fixed 2 m squares and can\'t be scaled.'); process.exit(1); }

const ky = flat ? 1 : k;
const r = (v) => Math.round(v * 1000) / 1000;
const h = (v) => (typeof v === 'number' ? r(v * k) : v); // horizontal distance
const y = (v) => (typeof v === 'number' ? r(v * ky) : v); // height
const p3 = (v) => (Array.isArray(v) && v.length === 3 ? [h(v[0]), y(v[1]), h(v[2])] : Array.isArray(v) && v.length === 2 ? [h(v[0]), h(v[1])] : v);
const box = (b) => {
  const o = { ...b };
  for (const key of ['min', 'max', 'at']) if (o[key]) o[key] = p3(o[key]);
  if (o.size) o.size = p3(o.size);
  return o;
};
const pt = (p) => ({ ...p, x: h(p.x), z: h(p.z), ...(p.y !== undefined && { y: y(p.y) }), ...(p.lookAt && { lookAt: p3(p.lookAt) }) });

if (j.bounds) j.bounds = { x: j.bounds.x.map(h), z: j.bounds.z.map(h) };
for (const key of ['boxes', 'floorSkins', 'decor', 'barriers']) if (j[key]) j[key] = j[key].map(box);
if (j.spawns) j.spawns = j.spawns.map(pt);
if (j.teamSpawns) for (const t of ['atk', 'def']) if (j.teamSpawns[t]) j.teamSpawns[t] = j.teamSpawns[t].map(pt);
if (j.sites) for (const s of Object.values(j.sites)) { s.min = p3(s.min); s.max = p3(s.max); }
if (j.labels) j.labels = j.labels.map(l => ({ ...l, ...(l.x !== undefined && { x: h(l.x), z: h(l.z) }), ...(l.y !== undefined && { y: y(l.y) }) }));
if (j.ropes) j.ropes = j.ropes.map(o => ({ ...o, x: h(o.x), z: h(o.z), top: y(o.top), ...(o.bottom !== undefined && { bottom: y(o.bottom) }) }));
if (j.signs) j.signs = j.signs.map(s => ({ ...s, pos: p3(s.pos) }));
if (j.trees) j.trees = j.trees.map(t => ({ ...t, x: h(t.x), z: h(t.z), y: y(t.y), r: h(t.r) }));
if (j.environment?.lights) j.environment.lights = j.environment.lights.map(l => ({ ...l, at: p3(l.at), ...(l.range !== undefined && { range: h(l.range) }) }));
if (j.nav?.blocked) j.nav.blocked = j.nav.blocked.map(b => b.map(h));
if (j.bots) {
  const list = (a) => a.map(p3);
  for (const s of Object.values(j.bots.holds || {})) s.forEach(o => { o.pos = p3(o.pos); o.look = p3(o.look); });
  for (const key of ['stage', 'buyStage']) for (const s of Object.values(j.bots[key] || {})) for (const lane of Object.keys(s)) s[lane] = list(s[lane]);
}
writeFileSync(dst, stringifyMap(j));
console.log(`${dst}: scaled by ${k}${flat ? ' (heights kept)' : ''}`);
