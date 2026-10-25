// Converts an older (version 1 "grid" or "baked") map file to the version 2 format, laid out for editing.
//   node tools/upgrade-map.mjs maps/old.json [maps/new.json]
// Without an output path the input file is overwritten. Boxes and decoration get an "area" note (the
// nearest label), and are grouped by it, so you can find the walls of "A MAIN" with a text search.
import { readFileSync, writeFileSync } from 'node:fs';
import { upgradeMap, stringifyMap } from '../js/map.js';

const [src, dst = src] = process.argv.slice(2);
if (!src) { console.error('usage: node tools/upgrade-map.mjs <map.json> [out.json]'); process.exit(1); }
const j = upgradeMap(JSON.parse(readFileSync(src, 'utf8')));
const labels = (j.labels || []).filter(l => typeof l.x === 'number');
if (labels.length) {
  const areaOf = (b) => {
    const x = (b.min[0] + b.max[0]) / 2, z = (b.min[2] + b.max[2]) / 2;
    return labels.reduce((best, l) => (Math.hypot(l.x - x, l.z - z) < Math.hypot(best.x - x, best.z - z) ? l : best)).text;
  };
  for (const key of ['boxes', 'floorSkins', 'decor']) {
    if (!j[key]) continue;
    j[key] = j[key].map(b => ({ area: areaOf(b), ...b })).sort((a, b) => a.area.localeCompare(b.area));
  }
}
writeFileSync(dst, stringifyMap({ $schema: './map.schema.json', ...j }));
console.log(`${dst}: version 2, ${(j.boxes || []).length} boxes`);
