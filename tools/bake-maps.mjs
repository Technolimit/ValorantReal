// Bakes the procedural Divide builder (tools/divide.js) into maps/divide.json. The game never runs this:
// it only fetches the JSON. Re-run after editing divide.js:   node tools/bake-maps.mjs
import { writeFileSync } from 'node:fs';
import { buildDivide } from './divide.js';

const m = buildDivide();
const round = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

// Stair flights are shared objects referenced from many cells: store each once, cells hold its index.
const flights = [];
const stairs = m.stairCell.map(row => row.map(f => {
  if (!f) return -1;
  let i = flights.indexOf(f);
  if (i < 0) { i = flights.length; flights.push(f); }
  return i;
}));
const { stairCell, walkable, ...rest } = m;
const out = { format: 'baked', version: 1, ...rest, nav: { dropCost: 1.5, flights, stairs } };
const json = JSON.stringify(out, (k, v) => round(v));
writeFileSync(new URL('../maps/divide.json', import.meta.url), json);
console.log(`maps/divide.json: ${(json.length / 1024).toFixed(0)} KB, ${m.boxes.length} boxes, ${flights.length} stair flights`);
