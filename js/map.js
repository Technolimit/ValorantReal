// Maps are JSON files fetched at runtime (maps/index.json lists them). Two formats:
//   "grid"   a character layout plus a legend, one 2 m cell per character (see maps/arena.json). Easy to
//            write by hand: each legend entry is a solid box ({ mat, h, pen, thin }) and/or a walkable
//            floor height ({ walk }), and { spawn: true } marks spawn points.
//   "baked"  finished geometry, navigation grid and 5v5 data, generated from code (tools/bake-maps.mjs).
// Both are hydrated into the same runtime object the game, bots and renderer read. Maps imported from a
// file or sent by an online host are kept in memory (and imported ones in localStorage) next to the catalog.
import { CELL } from './config.js';

const INDEX_URL = 'maps/index.json';
const CUSTOM_KEY = 'tapfire-custom-maps-v1';

const catalog = new Map(); // id -> { id, name, file?, modes, blurb, custom? }
const raw = new Map(); // id -> parsed JSON
const built = new Map(); // id -> hydrated map

// id -> display name, for the settings menu. Filled by loadMapIndex().
export const MAPS = {};

function refreshNames() {
  for (const k of Object.keys(MAPS)) delete MAPS[k];
  for (const m of catalog.values()) MAPS[m.id] = m.name + (m.custom ? ' (imported)' : '');
}

export async function loadMapIndex(url = INDEX_URL) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  const idx = await res.json();
  const base = new URL(url, location.href);
  for (const m of idx.maps) catalog.set(m.id, { modes: ['dm'], ...m, file: new URL(m.file, base).href });
  for (const json of readCustom()) { try { addMap(json, { custom: true }); } catch { /* skip broken entries */ } }
  refreshNames();
  return [...catalog.values()];
}

export const mapList = () => [...catalog.values()];
export const mapInfo = (id) => catalog.get(id);
export const mapJSON = (id) => raw.get(id);
export const supportsMode = (id, mode) => (catalog.get(id)?.modes || ['dm']).includes(mode);

// Fetch a map's JSON (once) so buildMap() can use it synchronously.
export async function preloadMap(id) {
  if (raw.has(id)) return raw.get(id);
  const info = catalog.get(id);
  if (!info?.file) throw new Error(`Unknown map "${id}"`);
  const res = await fetch(info.file);
  if (!res.ok) throw new Error(`Couldn't load map ${id} (${res.status})`);
  const json = await res.json();
  validate(json);
  raw.set(id, json);
  return json;
}

// Register a map from JSON (an imported file, or one an online host sent). Returns its id.
export function addMap(json, { custom = false, persist = false } = {}) {
  validate(json);
  const id = String(json.id);
  const modes = json.format === 'baked' && json.teamSpawns && json.sites ? ['dm', 'rounds'] : ['dm'];
  const prev = catalog.get(id);
  catalog.set(id, { id, name: json.name || id, modes: json.modes || modes, blurb: json.about || '', custom: custom || prev?.custom, file: prev?.file });
  raw.set(id, json);
  built.delete(id);
  if (persist) {
    const list = readCustom().filter(m => m.id !== id);
    list.push(json);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* storage full or blocked: kept for this session */ }
  }
  refreshNames();
  return id;
}

export function removeCustomMap(id) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(readCustom().filter(m => m.id !== id))); } catch { /* ignore */ }
  if (catalog.get(id)?.custom && !catalog.get(id).file) { catalog.delete(id); raw.delete(id); built.delete(id); }
  refreshNames();
}

function readCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}

function validate(j) {
  if (!j || typeof j !== 'object') throw new Error('Map file is not a JSON object');
  if (!j.id || !/^[\w-]{1,40}$/.test(String(j.id))) throw new Error('Map needs an "id" of letters, digits, - or _');
  if (j.format === 'grid') {
    if (!Array.isArray(j.layout) || !j.layout.length || !j.legend) throw new Error('Grid map needs "layout" and "legend"');
    const w = j.layout[0].length;
    if (j.layout.some(r => typeof r !== 'string' || r.length !== w)) throw new Error('Every layout row must be a string of the same length');
    if (!j.layout.some(r => [...r].some(ch => j.legend[ch]?.spawn))) throw new Error('Grid map needs at least one spawn cell');
  } else if (j.format === 'baked') {
    if (!Array.isArray(j.boxes) || !Array.isArray(j.heights) || !Array.isArray(j.spawns)) throw new Error('Baked map needs boxes, heights and spawns');
  } else throw new Error('Map "format" must be "grid" or "baked"');
}

// The hydrated map for `id`. Its JSON must already be loaded (preloadMap / addMap).
export function buildMap(id = 'arena') {
  if (built.has(id)) return built.get(id);
  const j = raw.get(id);
  if (!j) throw new Error(`Map "${id}" isn't loaded yet`);
  const m = j.format === 'grid' ? buildGrid(j) : buildBaked(j);
  built.set(id, m);
  return m;
}

// Grid layout -> boxes. Runs of the same tile are merged into as few boxes as possible.
function buildGrid(j) {
  const LAYOUT = j.layout, legend = j.legend;
  const W = LAYOUT[0].length, H = LAYOUT.length;
  const ox = -W * CELL / 2, oz = -H * CELL / 2;
  const boxes = [];
  const used = LAYOUT.map(row => Array(row.length).fill(false));
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const ch = LAYOUT[z][x];
      const def = legend[ch];
      if (!def || !def.mat || used[z][x]) continue;
      let x1 = x;
      while (x1 + 1 < W && LAYOUT[z][x1 + 1] === ch && !used[z][x1 + 1]) x1++;
      let z1 = z;
      grow: while (z1 + 1 < H) {
        for (let xx = x; xx <= x1; xx++) if (LAYOUT[z1 + 1][xx] !== ch || used[z1 + 1][xx]) break grow;
        z1++;
      }
      for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[zz][xx] = true;
      let minx = ox + x * CELL, maxx = ox + (x1 + 1) * CELL;
      let minz = oz + z * CELL, maxz = oz + (z1 + 1) * CELL;
      if (def.thin) {
        const half = def.thin / 2;
        if (x1 - x >= z1 - z) { const c = (minz + maxz) / 2; minz = c - half; maxz = c + half; }
        else { const c = (minx + maxx) / 2; minx = c - half; maxx = c + half; }
      }
      boxes.push({ min: [minx, 0, minz], max: [maxx, def.h ?? 1, maxz], mat: def.mat, pen: !!def.pen });
    }
  }
  boxes.push({ min: [ox, -1, oz], max: [ox + W * CELL, 0, oz + H * CELL], mat: j.floor || 'floor', pen: false, floor: true });

  const heights = LAYOUT.map(row => [...row].map(ch => (typeof legend[ch]?.walk === 'number' ? legend[ch].walk : null)));
  const cellCenter = (cx, cz) => ({ x: ox + (cx + 0.5) * CELL, z: oz + (cz + 0.5) * CELL });
  const spawns = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (legend[LAYOUT[z][x]]?.spawn) {
      const c = cellCenter(x, z);
      spawns.push({ x: c.x, y: heights[z][x] || 0, z: c.z, yaw: Math.atan2(c.x, c.z) }); // face the middle of the map
    }
  }
  const labels = (j.labels || []).map(l => ({ text: l.text, ...cellCenter(l.cell[0], l.cell[1]), y: l.y ?? 0.02, size: l.size }));
  return finish({ id: j.id, name: j.name || j.id, ropes: [], props: [], W, H, ox, oz, boxes, heights, spawns, labels, sky: j.sky, fog: j.fog }, null, 0);
}

function buildBaked(j) {
  const { format, version, nav, ...m } = structuredClone(j);
  let stairCell = null;
  if (nav?.stairs) stairCell = nav.stairs.map(row => row.map(i => (i >= 0 ? nav.flights[i] : null)));
  return finish(m, stairCell, nav?.dropCost ?? 0);
}

// Navigation helpers every map gets.
function finish(m, stairCell, dropCost) {
  const { W, H, ox, oz, heights } = m;
  m.cellCenter = (cx, cz) => ({ x: ox + (cx + 0.5) * CELL, z: oz + (cz + 0.5) * CELL });
  m.cellOf = (x, z) => [Math.floor((x - ox) / CELL), Math.floor((z - oz) / CELL)];
  m.walkable = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (heights[z][x] !== null) m.walkable.push([x, z]);
  // Standing beside a thin panel puts you in a cell the grid marks as blocked; path from the closest open one.
  m.nearestWalkable = (cx, cz) => {
    let best = [cx, cz], bestD = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= W || z >= H || heights[z][x] === null) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
    return best;
  };
  m.findPath = (a, b) => findPath(heights, W, H, a, b, stairCell, dropCost);
  m.ropes ||= []; m.props ||= [];
  return m;
}

// A* over the grid. Steps up at most 0.45 m (0.8 m between stair cells, whose fine treads make it walkable),
// drops any height. Diagonals only when both sides are open.
export function findPath(heights, W, H, start, goal, stairCell = null, dropCost = 0) {
  const key = (x, z) => z * W + x;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && heights[z][x] !== null;
  if (!ok(start[0], start[1]) || !ok(goal[0], goal[1])) return null;
  // Climbing more than a normal step is only possible along a flight of stairs (its fine treads), not sideways onto it.
  const canStep = (ax, az, bx, bz) => {
    const up = heights[bz][bx] - heights[az][ax];
    if (up <= 0.45) return true;
    const f = stairCell && (stairCell[bz][bx] || stairCell[az][ax]);
    if (!f || up > 0.8) return false;
    const along = f.axis === 'x' ? (bz === az) : (bx === ax);
    const same = (stairCell[bz][bx] === f || !stairCell[bz][bx]) && (stairCell[az][ax] === f || !stairCell[az][ax]);
    return along && same;
  };
  const g = new Map([[key(...start), 0]]);
  const came = new Map();
  const open = [[start[0], start[1], 0]];
  const h = (x, z) => Math.hypot(x - goal[0], z - goal[1]);
  const closed = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][2] < open[bi][2]) bi = i;
    const [x, z] = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    const k = key(x, z);
    if (closed.has(k)) continue;
    closed.add(k);
    if (x === goal[0] && z === goal[1]) {
      const path = [[x, z]];
      let c = k;
      while (came.has(c)) { c = came.get(c); path.push([c % W, Math.floor(c / W)]); }
      return path.reverse();
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!ok(nx, nz) || !canStep(x, z, nx, nz)) continue;
      if (dx && dz && (!ok(x + dx, z) || !ok(x, z + dz) || !canStep(x, z, x + dx, z) || !canStep(x, z, x, z + dz))) continue;
      const nk = key(nx, nz);
      if (closed.has(nk)) continue;
      // Drops are allowed but can cost a little more, so bots prefer stairs over jumping off ledges.
      const drop = dropCost && heights[z][x] - heights[nz][nx] > 0.45 ? dropCost : 0;
      const ng = g.get(k) + (dx && dz ? 1.414 : 1) + drop;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        open.push([nx, nz, ng + h(nx, nz)]);
      }
    }
  }
  return null;
}
