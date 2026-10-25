// Maps are JSON files fetched at runtime (maps/index.json lists them; MAPS.md documents the format).
//
//   "tapfire-map" v2  everything about a map in one file: solid boxes and/or a character grid, materials,
//                     sky, fog, sun and lights, spawns for deathmatch and both 5v5 teams, spike sites,
//                     barriers, ultimate orbs, ropes, signs, trees, decoration, labels, bot positions and rule tweaks.
//                     Bot navigation is worked out from the geometry when the map loads, so any edit to
//                     the boxes just works.
//   "grid" / "baked" v1  the older formats; still loaded as before.
//
// All of them are hydrated into the same runtime object the game, bots and renderer read. Maps imported
// from a file or sent by an online host are kept in memory (and imported ones in localStorage) next to the
// catalog. maps/materials.json is the shared material library; a map can add or override materials.
import { CELL, PLAYER } from './config.js';

const INDEX_URL = 'maps/index.json';
const MATERIALS_FILE = 'materials.json'; // next to index.json
const CUSTOM_KEY = 'tapfire-custom-maps-v1';

const catalog = new Map(); // id -> { id, name, file?, modes, blurb, custom? }
const raw = new Map(); // id -> parsed JSON
const built = new Map(); // id -> hydrated map

// id -> display name, for the settings menu. Filled by loadMapIndex().
export const MAPS = {};
// Shared material library (maps/materials.json), name -> definition.
export const MATERIALS = {};

function refreshNames() {
  for (const k of Object.keys(MAPS)) delete MAPS[k];
  for (const m of catalog.values()) MAPS[m.id] = m.name + (m.custom ? ' (imported)' : '');
}

export async function loadMapIndex(url = INDEX_URL) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  const idx = await res.json();
  const base = new URL(url, location.href);
  try {
    const mr = await fetch(new URL(idx.materials || MATERIALS_FILE, base), { cache: 'no-cache' });
    if (mr.ok) Object.assign(MATERIALS, (await mr.json()).materials);
  } catch { /* the renderer falls back to a plain material */ }
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

const isV2 = (j) => j.format === 'tapfire-map';
const roundsReady = (j) => {
  if (j.format === 'baked') return !!(j.teamSpawns && j.sites);
  if (!isV2(j)) return false;
  const legend = Object.values(j.grid?.legend || {});
  const sites = new Set([...Object.keys(j.sites || {}), ...legend.map(d => d.site).filter(Boolean)]);
  const team = (t) => (j.teamSpawns?.[t]?.length || 0) + legend.filter(d => d.spawn === t).length;
  return sites.has('A') && sites.has('B') && team('atk') > 0 && team('def') > 0;
};

// Register a map from JSON (an imported file, or one an online host sent). Returns its id.
export function addMap(json, { custom = false, persist = false } = {}) {
  validate(json);
  const id = String(json.id);
  const modes = roundsReady(json) ? ['dm', 'rounds'] : ['dm'];
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

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(num);

function validate(j) {
  if (!j || typeof j !== 'object') throw new Error('Map file is not a JSON object');
  if (!j.id || !/^[\w-]{1,40}$/.test(String(j.id))) throw new Error('Map needs an "id" of letters, digits, - or _');
  if (isV2(j)) return validateV2(j);
  if (j.format === 'grid') {
    validateGrid(j.layout, j.legend, 'Grid map');
    if (!j.layout.some(r => [...r].some(ch => j.legend[ch]?.spawn))) throw new Error('Grid map needs at least one spawn cell');
  } else if (j.format === 'baked') {
    if (!Array.isArray(j.boxes) || !Array.isArray(j.heights) || !Array.isArray(j.spawns)) throw new Error('Baked map needs boxes, heights and spawns');
  } else throw new Error('Map "format" must be "tapfire-map" (or the older "grid" / "baked")');
}

function validateGrid(layout, legend, what) {
  if (!Array.isArray(layout) || !layout.length || !legend || typeof legend !== 'object') throw new Error(`${what} needs "layout" and "legend"`);
  const w = layout[0].length;
  layout.forEach((r, i) => {
    if (typeof r !== 'string' || r.length !== w) throw new Error(`Every layout row must be a string of the same length (row ${i + 1} is ${typeof r === 'string' ? r.length : 'not a string'}, row 1 is ${w})`);
  });
  for (const r of layout) for (const ch of r) if (!legend[ch]) throw new Error(`Layout uses "${ch}" but the legend doesn't say what it is`);
}

function validateV2(j) {
  if (j.version > 2) throw new Error(`This map needs a newer version of the game (map version ${j.version})`);
  if (!j.grid && !j.boxes?.length) throw new Error('Map needs "boxes", a "grid", or both');
  if (j.grid) validateGrid(j.grid.layout, j.grid.legend, '"grid"');
  const checkBoxes = (list, key) => (list || []).forEach((b, i) => {
    if (!(vec(b.min, 3) && vec(b.max, 3)) && !(vec(b.at, 3) && vec(b.size, 3))) throw new Error(`${key} #${i + 1} needs "min" and "max" (or "at" and "size"), each three numbers [x, y, z]`);
  });
  checkBoxes(j.boxes, 'boxes'); checkBoxes(j.decor, 'decor'); checkBoxes(j.floorSkins, 'floorSkins');
  const pts = (list, key) => (list || []).forEach((s, i) => { if (!num(s.x) || !num(s.z)) throw new Error(`${key} #${i + 1} needs numbers "x" and "z"`); });
  pts(j.spawns, 'spawns'); pts(j.teamSpawns?.atk, 'teamSpawns.atk'); pts(j.teamSpawns?.def, 'teamSpawns.def');
  for (const [k, s] of Object.entries(j.sites || {})) if (!(vec(s.min, 2) || vec(s.min, 3)) || !(vec(s.max, 2) || vec(s.max, 3))) throw new Error(`Site "${k}" needs "min" and "max" corners`);
  const legend = Object.values(j.grid?.legend || {});
  const anySpawn = j.spawns?.length || j.teamSpawns?.atk?.length || j.teamSpawns?.def?.length || legend.some(d => d.spawn);
  if (!anySpawn) throw new Error('Map needs at least one spawn ("spawns", "teamSpawns", or a legend entry with "spawn")');
  if (j.grid && legend.some(d => d.spawn)) {
    const used = new Set(j.grid.layout.join(''));
    if (!j.spawns?.length && !j.teamSpawns && !Object.entries(j.grid.legend).some(([ch, d]) => d.spawn && used.has(ch))) throw new Error('No spawn character is used in the layout');
  }
}

// The hydrated map for `id`. Its JSON must already be loaded (preloadMap / addMap).
export function buildMap(id = 'arena') {
  if (built.has(id)) return built.get(id);
  const j = raw.get(id);
  if (!j) throw new Error(`Map "${id}" isn't loaded yet`);
  const m = isV2(j) ? buildV2(j) : j.format === 'grid' ? buildGrid(j) : buildBaked(j);
  built.set(id, m);
  return m;
}

// ---------------------------------------------------------------------------------------------------
// Colours and materials

// "#rrggbb", "#rgb", "rgb"-less hex strings or plain numbers (0xrrggbb) -> number.
export function colorNum(v, fallback = 0x888888) {
  if (num(v)) return v >>> 0;
  if (typeof v === 'string') {
    let s = v.trim().replace(/^#|^0x/i, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = [...s].map(c => c + c).join('');
    if (/^[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
  }
  return fallback;
}
const css = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const shade = (n, k) => { const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k); };

const PATTERNS = ['grid', 'brick', 'plank', 'panel', 'tile', 'diamond', 'grate', 'none'];
const FALLBACK_MAT = { colors: ['#cfc6b6', '#b6ad9d', '#c3bba9'], pattern: 'grid' };

// A material's full definition for this map: the map's own "materials" first, then the shared library.
export function materialOf(map, name) {
  const d = map?.materials?.[name] || MATERIALS[name] || MATERIALS.wall || FALLBACK_MAT;
  let colors = d.colors;
  if (!Array.isArray(colors) || !colors.length) { const c = colorNum(d.color, 0xcfc6b6); colors = [c, shade(c, 0.86), shade(c, 0.93)]; }
  colors = colors.map(c => css(colorNum(c)));
  while (colors.length < 3) colors.push(colors[colors.length - 1]);
  return {
    colors,
    pattern: PATTERNS.includes(d.pattern) ? d.pattern : d.pattern === 'g' ? 'grid' : 'grid',
    crossed: !!d.crossed,
    tileSize: num(d.tileSize) && d.tileSize > 0 ? d.tileSize : 2,
    glow: num(d.glow) ? Math.max(0, d.glow) : 0,
    castShadows: d.castShadows !== false,
    opacity: num(d.opacity) ? Math.min(1, Math.max(0.05, d.opacity)) : 1,
    noise: num(d.noise) ? Math.max(0, d.noise) : 1,
  };
}

// Sky, fog, sun and lights, with the defaults the game always used.
function environmentOf(e = {}, legacy = {}) {
  const sky = colorNum(e.sky ?? legacy.sky, 0xa9c2d8);
  const hasSky = e.sky !== undefined || legacy.sky !== undefined;
  const fogIn = e.fog ?? legacy.fog;
  const fog = Array.isArray(fogIn) ? { near: fogIn[0], far: fogIn[1] } : fogIn === false ? null : { ...(fogIn || {}) };
  if (fog) {
    fog.color = colorNum(fog.color, sky);
    fog.near = num(fog.near) ? fog.near : hasSky ? 140 : 90;
    fog.far = num(fog.far) ? fog.far : hasSky ? 300 : 220;
  }
  const s = e.sun || {}, a = e.ambient || {};
  return {
    sky,
    fog,
    sun: { color: colorNum(s.color, 0xfff3e0), intensity: num(s.intensity) ? s.intensity : 2.2, from: vec(s.from, 3) ? s.from : [-30, 60, 20], shadows: s.shadows !== false },
    ambient: { sky: colorNum(a.sky, 0xdbe7f3), ground: colorNum(a.ground, 0x5a554c), intensity: num(a.intensity) ? a.intensity : 1.3 },
    lights: (e.lights || []).slice(0, 16).filter(l => vec(l.at, 3)).map(l => ({ at: l.at, color: colorNum(l.color, 0xffe2b0), intensity: num(l.intensity) ? l.intensity : 6, range: num(l.range) ? l.range : 14 })),
  };
}

// Friendly rule names in the JSON -> the game's tuning tables (see Game.applyRules).
const RULE_KEYS = {
  rounds: { buyTime: 'buy', firstBuyTime: 'firstBuy', roundTime: 'round', spikeTime: 'spike', plantTime: 'plant', defuseTime: 'defuse', defuseHalfway: 'defuseHalf', orbTime: 'orb', roundEndTime: 'end', roundsToWin: 'toWin', halftimeAfter: 'half' },
  economy: { startCredits: 'start', maxCredits: 'max', winReward: 'win', lossRewards: 'loss', killReward: 'kill', plantReward: 'plant', saveReward: 'save', overtimeCredits: 'ot' },
  deathmatch: { respawnTime: 'respawn', healOnKill: 'healOnKill' },
  physics: { gravity: 'gravity', jumpSpeed: 'jumpVelocity' },
};
function rulesOf(j) {
  const out = {};
  const src = { ...j.rules, physics: j.physics };
  for (const [group, keys] of Object.entries(RULE_KEYS)) {
    const g = src[group];
    if (!g) continue;
    for (const [k, v] of Object.entries(g)) if (keys[k] && (num(v) || typeof v === 'boolean' || (Array.isArray(v) && v.every(num)))) (out[group] ||= {})[keys[k]] = v;
  }
  if (out.rounds?.buy !== undefined && out.rounds.firstBuy === undefined) out.rounds.firstBuy = out.rounds.buy; // one buy time for every round
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Version 2

const yawToward = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z)); // forward is (-sin yaw, -cos yaw)
const DEG = Math.PI / 180;

// Boxes merged from runs of equal grid cells: calls out(x0, z0, x1, z1, key) for each rectangle.
function mergeRuns(W, H, keyAt, out) {
  const used = Array.from({ length: H }, () => Array(W).fill(false));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const k = keyAt(x, z);
    if (k == null || used[z][x]) continue;
    let x1 = x;
    while (x1 + 1 < W && keyAt(x1 + 1, z) === k && !used[z][x1 + 1]) x1++;
    let z1 = z;
    grow: while (z1 + 1 < H) {
      for (let xx = x; xx <= x1; xx++) if (keyAt(xx, z1 + 1) !== k || used[z1 + 1][xx]) break grow;
      z1++;
    }
    for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[zz][xx] = true;
    out(x, z, x1, z1, k);
  }
}

function boxOf(b) {
  let min, max;
  if (vec(b.min, 3)) { min = [...b.min]; max = [...b.max]; }
  else { const [x, y, z] = b.at, [w, h, d] = b.size; min = [x - w / 2, y, z - d / 2]; max = [x + w / 2, y + h, z + d / 2]; }
  for (let k = 0; k < 3; k++) if (min[k] > max[k]) [min[k], max[k]] = [max[k], min[k]];
  return { min, max };
}

function buildV2(j) {
  const grid = j.grid;
  let W, H, ox, oz;
  if (vec(j.bounds?.x, 2) && vec(j.bounds?.z, 2)) {
    ox = Math.min(...j.bounds.x); oz = Math.min(...j.bounds.z);
    W = Math.ceil((Math.max(...j.bounds.x) - ox) / CELL); H = Math.ceil((Math.max(...j.bounds.z) - oz) / CELL);
  } else if (grid) {
    W = grid.layout[0].length; H = grid.layout.length;
    [ox, oz] = vec(grid.origin, 2) ? grid.origin : [-W * CELL / 2, -H * CELL / 2];
  } else {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of j.boxes) { const { min, max } = boxOf(b); x0 = Math.min(x0, min[0]); z0 = Math.min(z0, min[2]); x1 = Math.max(x1, max[0]); z1 = Math.max(z1, max[2]); }
    ox = Math.floor(x0 / CELL) * CELL; oz = Math.floor(z0 / CELL) * CELL;
    W = Math.ceil((x1 - ox) / CELL); H = Math.ceil((z1 - oz) / CELL);
  }
  const cellCenter = (cx, cz) => ({ x: ox + (cx + 0.5) * CELL, z: oz + (cz + 0.5) * CELL });

  const boxes = [], floorSkins = [], decor = [];
  const solid = (b, def) => {
    const box = { ...boxOf(b), mat: def.mat || 'wall', pen: !!def.pen };
    if (def.passable) box.passable = true;
    if (def.visible === false) box.hidden = true;
    if (def.collide === false) floorSkins.push(box); else boxes.push(box);
  };
  for (const b of j.boxes || []) solid(b, b);
  for (const b of j.floorSkins || []) floorSkins.push({ ...boxOf(b), mat: b.mat || 'floor' });
  for (const d of j.decor || []) decor.push({ ...boxOf(d), color: colorNum(d.color), glow: !!d.glow });

  // ---- the character grid ----
  const gridSpawns = { dm: [], atk: [], def: [] }, siteCells = {}, barrierRects = [], gridOrbs = [];
  if (grid) {
    const { layout, legend } = grid;
    const gw = layout[0].length, gh = layout.length;
    const [gx, gz] = vec(grid.origin, 2) ? grid.origin : [-gw * CELL / 2, -gh * CELL / 2];
    const def = (x, z) => legend[layout[z][x]];
    mergeRuns(gw, gh, (x, z) => (def(x, z).mat ? layout[z][x] : null), (x, z, x1, z1, ch) => {
      const d = legend[ch];
      let minx = gx + x * CELL, maxx = gx + (x1 + 1) * CELL, minz = gz + z * CELL, maxz = gz + (z1 + 1) * CELL;
      if (d.thin) {
        const half = d.thin / 2;
        if (x1 - x >= z1 - z) { const c = (minz + maxz) / 2; minz = c - half; maxz = c + half; }
        else { const c = (minx + maxx) / 2; minx = c - half; maxx = c + half; }
      }
      solid({ min: [minx, d.base ?? 0, minz], max: [maxx, (d.base ?? 0) + (d.h ?? 1), maxz] }, d);
    });
    mergeRuns(gw, gh, (x, z) => def(x, z).paint ?? null, (x, z, x1, z1, mat) => {
      floorSkins.push({ min: [gx + x * CELL, -0.05, gz + z * CELL], max: [gx + (x1 + 1) * CELL, 0.006, gz + (z1 + 1) * CELL], mat });
    });
    mergeRuns(gw, gh, (x, z) => def(x, z).barrier ?? null, (x, z, x1, z1, team) => {
      barrierRects.push({ team, min: [gx + x * CELL, -0.5, gz + z * CELL], max: [gx + (x1 + 1) * CELL, 7, gz + (z1 + 1) * CELL] });
    });
    for (let z = 0; z < gh; z++) for (let x = 0; x < gw; x++) {
      const d = def(x, z), c = { x: gx + (x + 0.5) * CELL, z: gz + (z + 0.5) * CELL };
      if (d.spawn) (gridSpawns[d.spawn === 'atk' || d.spawn === 'def' ? d.spawn : 'dm']).push(c);
      if (d.site) (siteCells[d.site] ||= []).push([c.x - CELL / 2, c.z - CELL / 2, c.x + CELL / 2, c.z + CELL / 2]);
      if (d.orb) gridOrbs.push(c);
    }
  }
  const ground = j.environment?.ground;
  if (ground !== false) boxes.push({ min: [ox, -1, oz], max: [ox + W * CELL, ground?.y ?? 0, oz + H * CELL], mat: ground?.mat || j.environment?.floor || 'floor', pen: false, floor: true });

  // ---- surfaces: where you can stand ----
  const index = boxIndex(boxes, W, H, ox, oz);
  const floorY = (x, z, below = Infinity) => land(index(x, z), x, z, below, HEADROOM);
  const placeY = (p) => (num(p.y) ? p.y : floorY(p.x, p.z) ?? 0);

  // ---- spawns ----
  const teamCenter = (list) => list.length ? [list.reduce((s, p) => s + p.x, 0) / list.length, list.reduce((s, p) => s + p.z, 0) / list.length] : null;
  const rawTeam = { atk: [...(j.teamSpawns?.atk || []), ...gridSpawns.atk], def: [...(j.teamSpawns?.def || []), ...gridSpawns.def] };
  const centers = { atk: teamCenter(rawTeam.atk), def: teamCenter(rawTeam.def) };
  const mapMid = [ox + W * CELL / 2, oz + H * CELL / 2];
  const spawnOf = (p, face) => {
    let yaw;
    if (num(p.yaw)) yaw = p.yaw;
    else if (num(p.yawDeg)) yaw = p.yawDeg * DEG;
    else if (vec(p.lookAt, 2) || vec(p.lookAt, 3)) yaw = yawToward(p.x, p.z, p.lookAt[0], p.lookAt[p.lookAt.length - 1]);
    else yaw = yawToward(p.x, p.z, ...(face || mapMid));
    return { x: p.x, y: placeY(p), z: p.z, yaw };
  };
  const teamSpawns = (rawTeam.atk.length || rawTeam.def.length) ? {
    atk: rawTeam.atk.map(p => spawnOf(p, centers.def)),
    def: rawTeam.def.map(p => spawnOf(p, centers.atk)),
  } : null;
  let spawns = [...(j.spawns || []), ...gridSpawns.dm].map(p => spawnOf(p));
  if (!spawns.length && teamSpawns) spawns = [...teamSpawns.atk, ...teamSpawns.def].map(s => ({ ...s, yaw: yawToward(s.x, s.z, ...mapMid) }));

  // ---- 5v5 data ----
  const sites = {};
  for (const [k, cells] of Object.entries(siteCells)) {
    const x0 = Math.min(...cells.map(c => c[0])), z0 = Math.min(...cells.map(c => c[1])), x1 = Math.max(...cells.map(c => c[2])), z1 = Math.max(...cells.map(c => c[3]));
    sites[k] = { min: [x0, 0, z0], max: [x1, 0, z1] };
  }
  for (const [k, s] of Object.entries(j.sites || {})) {
    const p3 = (v) => (v.length === 2 ? [v[0], 0, v[1]] : [...v]);
    const a = p3(s.min), b = p3(s.max);
    sites[k] = { min: [Math.min(a[0], b[0]), 0, Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), 0, Math.max(a[2], b[2])], ...(s.color !== undefined && { color: colorNum(s.color) }) };
  }
  for (const [k, s] of Object.entries(sites)) {
    s.name = j.sites?.[k]?.name || k;
    s.center = [(s.min[0] + s.max[0]) / 2, 0, (s.min[2] + s.max[2]) / 2];
    s.center[1] = floorY(s.center[0], s.center[2]) ?? 0;
  }
  const barriers = [...barrierRects, ...(j.barriers || []).map(b => ({ team: b.team === 'def' ? 'def' : 'atk', ...boxOf(b) }))];
  for (const b of barrierRects) { // grid barriers start just below the floor they stand on
    const f = floorY((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2) ?? 0;
    b.min[1] = f - 0.5; b.max[1] = f + 7;
  }

  // ---- everything else ----
  const labels = (j.labels || []).map(l => {
    const p = vec(l.cell, 2) && grid ? cellCenter(...l.cell) : { x: l.x ?? 0, z: l.z ?? 0 };
    return { text: String(l.text ?? ''), ...p, y: l.y ?? (floorY(p.x, p.z) ?? 0) + 0.02, size: l.size };
  });
  const ropes = (j.ropes || []).filter(r => num(r.x) && num(r.z) && num(r.top)).map(r => {
    const t = vec(r.toward, 2) ? r.toward : [0, 1], l = Math.hypot(t[0], t[1]) || 1;
    return { x: r.x, z: r.z, bottom: num(r.bottom) ? r.bottom : floorY(r.x, r.z) ?? 0, top: r.top, toward: [t[0] / l, t[1] / l], ...(r.color !== undefined && { color: colorNum(r.color) }) };
  });
  const props = [...(j.signs || []), ...(j.props || []).filter(p => p.type === 'sign')].filter(p => vec(p.pos, 3)).map(p => ({
    type: 'sign', pos: p.pos, n: vec(p.n ?? p.facing, 2) ? (p.n ?? p.facing) : [0, 1], w: p.w ?? 1.2, h: p.h ?? 1.4, color: colorNum(p.color, 0xff4655), ...(p.frame !== undefined && { frame: colorNum(p.frame) }), ...(p.marks === false && { marks: false }),
  }));
  const trees = (j.trees || []).filter(t => num(t.x) && num(t.z)).map(t => ({ x: t.x, z: t.z, y: t.y ?? 6, r: t.r ?? 2.4, color: colorNum(t.color, 0x5f8f45), ...(t.trunk !== undefined && { trunk: colorNum(t.trunk) }) }));
  const display = j.display || {};
  const materials = {};
  for (const [k, v] of Object.entries(j.materials || {})) if (v && typeof v === 'object') materials[k] = v;

  const m = {
    id: String(j.id), name: j.name || String(j.id), W, H, ox, oz, boxes, floorSkins, decor, trees, props, ropes, labels, spawns,
    materials, environment: j.environment || {}, rules: rulesOf(j), groundLabels: !!display.groundLabels,
    ...(display.siteColor !== undefined && { siteColor: colorNum(display.siteColor) }),
  };
  if (teamSpawns?.atk.length && teamSpawns.def.length) m.teamSpawns = teamSpawns;
  if (Object.keys(sites).length) m.sites = sites;
  if (barriers.length) m.barriers = barriers;
  const orbs = [...(j.ultOrbs || []).filter(o => num(o.x) && num(o.z)), ...gridOrbs];
  if (orbs.length) m.ultOrbs = orbs.map(o => [o.x, placeY(o), o.z]);

  // ---- navigation: from the geometry, unless the file spells it out ----
  const nav = j.nav && typeof j.nav === 'object' ? j.nav : {};
  let stairCell = null, links = null;
  if (Array.isArray(nav.heights)) {
    m.heights = nav.heights;
    if (nav.stairs) stairCell = nav.stairs.map(row => row.map(i => (i >= 0 ? nav.flights[i] : null)));
  } else {
    const seeds = [...spawns, ...(teamSpawns?.atk || []), ...(teamSpawns?.def || [])];
    const out = autoNav(index, W, H, ox, oz, seeds, { step: nav.step ?? PLAYER.stepHeight, head: nav.headroom ?? HEADROOM, blocked: nav.blocked });
    m.heights = out.heights; links = out.links;
  }
  finish(m, stairCell, nav.dropCost ?? 1.5, links);
  if (m.sites && m.teamSpawns) {
    const b = j.bots || {};
    const auto = (b.holds && b.stage) ? null : autoBots(m);
    m.holds = b.holds || auto?.holds;
    m.stage = b.stage || auto?.stage;
    m.buyStage = b.buyStage || auto?.buyStage;
    if (!m.sites.A || !m.sites.B) { delete m.holds; } // the bots' 5v5 plan needs sites A and B
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------
// Navigation from geometry
//
// Each 2 m cell gets the floor height a player stands on at its centre. Neighbouring cells are linked when
// walking between their centres works: every rise along the way is a normal step (so stairs made of small
// treads, ramps and gentle slopes work) and there's head room the whole way. Dropping off a ledge is
// allowed. Only floor reachable from a spawn counts, so the tops of walls and closed-off rooms never do.

const HEADROOM = 2.0;
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIR_BIT = []; // (dx + 1) * 3 + dz + 1 -> index into DIRS8
DIRS8.forEach(([dx, dz], i) => { DIR_BIT[(dx + 1) * 3 + dz + 1] = i; });

// Solid boxes bucketed by grid cell, so a point query only looks at the few boxes near it.
function boxIndex(boxes, W, H, ox, oz) {
  const cells = Array.from({ length: W * H }, () => []);
  for (const b of boxes) {
    if (b.passable) continue;
    const x0 = Math.max(0, Math.floor((b.min[0] - ox) / CELL)), x1 = Math.min(W - 1, Math.floor((b.max[0] - ox - 1e-6) / CELL));
    const z0 = Math.max(0, Math.floor((b.min[2] - oz) / CELL)), z1 = Math.min(H - 1, Math.floor((b.max[2] - oz - 1e-6) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells[z * W + x].push(b);
  }
  const none = [];
  return (x, z) => {
    const cx = Math.floor((x - ox) / CELL), cz = Math.floor((z - oz) / CELL);
    return cx < 0 || cz < 0 || cx >= W || cz >= H ? none : cells[cz * W + cx];
  };
}

// The highest surface at (x, z) no higher than `maxY` with `head` metres of free space above it, or null.
function land(list, x, z, maxY, head) {
  let best = null;
  for (const b of list) {
    if (!(x >= b.min[0] && x < b.max[0] && z >= b.min[2] && z < b.max[2])) continue;
    const t = b.max[1];
    if (t > maxY + 1e-6 || (best !== null && t <= best)) continue;
    let free = true;
    for (const o of list) {
      if (o !== b && o.min[1] < t + head && o.max[1] > t + 1e-3 && x >= o.min[0] && x < o.max[0] && z >= o.min[2] && z < o.max[2]) { free = false; break; }
    }
    if (free) best = t;
  }
  return best;
}

function autoNav(index, W, H, ox, oz, seeds, { step, head, blocked }) {
  const center = (cx, cz) => [ox + (cx + 0.5) * CELL, oz + (cz + 0.5) * CELL];
  // Walk from cell a's centre (standing at h) to cell b's centre; the height you arrive at, or null.
  const walk = (ax, az, h, bx, bz) => {
    const [x0, z0] = center(ax, az), [x1, z1] = center(bx, bz);
    const n = ax !== bx && az !== bz ? 12 : 8;
    for (let k = 0; k <= n; k++) {
      const t = k === n ? 1 : (k + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const s = land(index(x, z), x, z, h + step, head);
      if (s === null) return null;
      h = s;
    }
    return h;
  };
  const no = new Set();
  for (const r of blocked || []) if (vec(r, 4)) {
    const [a, b] = [Math.floor((Math.min(r[0], r[2]) - ox) / CELL), Math.floor((Math.max(r[0], r[2]) - ox) / CELL - 1e-6)];
    const [c, d] = [Math.floor((Math.min(r[1], r[3]) - oz) / CELL), Math.floor((Math.max(r[1], r[3]) - oz) / CELL - 1e-6)];
    for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) no.add(z * W + x);
  }
  // Flood from the spawns over (cell, floor height) pairs, so floors under bridges and on top of each other both count.
  const levels = new Map(); // cell -> Set of heights
  const queue = [];
  const visit = (cx, cz, h) => {
    const i = cz * W + cx, r = Math.round(h * 100) / 100;
    if (no.has(i)) return;
    let s = levels.get(i);
    if (!s) levels.set(i, s = new Set());
    if (s.has(r)) return;
    s.add(r); queue.push([cx, cz, h]);
  };
  for (const p of seeds) {
    const cx = Math.floor((p.x - ox) / CELL), cz = Math.floor((p.z - oz) / CELL);
    if (cx < 0 || cz < 0 || cx >= W || cz >= H) continue;
    const [x, z] = center(cx, cz);
    const h = land(index(x, z), x, z, (p.y ?? 0) + step + 0.5, head);
    if (h !== null) visit(cx, cz, h);
  }
  while (queue.length) {
    const [x, z, h] = queue.pop();
    for (const [dx, dz] of DIRS8) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const h2 = walk(x, z, h, nx, nz);
      if (h2 !== null) visit(nx, nz, h2);
    }
  }
  // One floor per cell for the 2D grid the bots path on: the highest one you can get to.
  const heights = Array.from({ length: H }, () => Array(W).fill(null));
  for (const [i, s] of levels) heights[Math.floor(i / W)][i % W] = Math.max(...s);
  const links = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const h = heights[z][x];
    if (h === null) continue;
    DIRS8.forEach(([dx, dz], d) => {
      const nx = x + dx, nz = z + dz, hn = heights[nz]?.[nx];
      if (hn === null || hn === undefined) return;
      const h2 = walk(x, z, h, nx, nz);
      if (h2 !== null && Math.abs(h2 - hn) < 0.02) links[z * W + x] |= 1 << d;
    });
  }
  return { heights, links };
}

// Bot positions for 5v5 when the file doesn't list them: staging spots along the routes from the attackers'
// spawn to each site and to the middle, defender holds just outside each site looking down the way
// attackers come, and buy-phase spots behind the attackers' barriers.
function autoBots(m) {
  const { sites, teamSpawns } = m;
  if (!sites.A || !sites.B) return null;
  const avg = (list) => [list.reduce((s, p) => s + p.x, 0) / list.length, 0, list.reduce((s, p) => s + p.z, 0) / list.length];
  const atk = avg(teamSpawns.atk), def = avg(teamSpawns.def);
  const pt = ([cx, cz]) => { const c = m.cellCenter(cx, cz); return [+c.x.toFixed(2), m.heights[cz][cx], +c.z.toFixed(2)]; };
  const route = (a, b) => m.findPath(m.nearestWalkable(...m.cellOf(a[0], a[2])), m.nearestWalkable(...m.cellOf(b[0], b[2]))) || [];
  const at = (path, f) => pt(path[Math.max(0, Math.min(path.length - 1, Math.round(f * (path.length - 1))))]);
  const mid = [(sites.A.center[0] + sites.B.center[0] + def[0]) / 3, 0, (sites.A.center[2] + sites.B.center[2] + def[2]) / 3];
  const toMid = route(atk, mid);
  const inBarrier = (p) => (m.barriers || []).some(b => b.team === 'atk' && p[0] >= b.min[0] - 1 && p[0] <= b.max[0] + 1 && p[2] >= b.min[2] - 1 && p[2] <= b.max[2] + 1);
  const behindBarrier = (path) => {
    const pts = path.map(pt), i = pts.findIndex(inBarrier);
    const k = i > 0 ? Math.max(0, i - 2) : Math.round(path.length * 0.1);
    return pts.length ? [pts[k], pts[Math.max(0, k - 1)], pts[Math.max(0, k - 2)]] : [];
  };
  const holds = {}, stage = {}, buyStage = {};
  // The last cell of a route out of a site that is still (about) on it: where that entrance is watched from.
  const edge = (s, path) => {
    const on = path.map(pt).filter(p => p[0] >= s.min[0] - 2 && p[0] <= s.max[0] + 2 && p[2] >= s.min[2] - 2 && p[2] <= s.max[2] + 2);
    return on.length ? on[on.length - 1] : null;
  };
  for (const s of ['A', 'B']) {
    const toSite = route(atk, sites[s].center), out = route(sites[s].center, atk), side = route(sites[s].center, mid);
    if (!toSite.length || !out.length || !toMid.length) return null;
    stage[s] = { main: [0.55, 0.62, 0.7].map(f => at(toSite, f)), mid: [0.4, 0.5, 0.6].map(f => at(toMid, f)) };
    buyStage[s] = { main: behindBarrier(toSite), mid: behindBarrier(toMid).slice(0, 2) };
    const watch = at(out, 0.35), c = sites[s].center;
    const center = pt(m.nearestWalkable(...m.cellOf(c[0], c[2])));
    holds[s] = [
      { pos: edge(sites[s], out) || center, look: watch },
      { pos: (side.length && edge(sites[s], side)) || center, look: side.length ? at(side, 0.5) : watch },
      { pos: center, look: watch },
    ];
  }
  const defMid = route(def, mid);
  holds.mid = defMid.length ? [0.6, 0.85].map(f => ({ pos: at(defMid, f), look: at(toMid, 0.5) })) : holds.A.slice(0, 2);
  return { holds, stage, buyStage };
}

// ---------------------------------------------------------------------------------------------------
// Version 1 (older files keep loading exactly as they did)

// Grid layout -> boxes. Runs of the same tile are merged into as few boxes as possible.
function buildGrid(j) {
  const LAYOUT = j.layout, legend = j.legend;
  const W = LAYOUT[0].length, H = LAYOUT.length;
  const ox = -W * CELL / 2, oz = -H * CELL / 2;
  const boxes = [];
  mergeRuns(W, H, (x, z) => (legend[LAYOUT[z][x]]?.mat ? LAYOUT[z][x] : null), (x, z, x1, z1, ch) => {
    const def = legend[ch];
    let minx = ox + x * CELL, maxx = ox + (x1 + 1) * CELL;
    let minz = oz + z * CELL, maxz = oz + (z1 + 1) * CELL;
    if (def.thin) {
      const half = def.thin / 2;
      if (x1 - x >= z1 - z) { const c = (minz + maxz) / 2; minz = c - half; maxz = c + half; }
      else { const c = (minx + maxx) / 2; minx = c - half; maxx = c + half; }
    }
    boxes.push({ min: [minx, 0, minz], max: [maxx, def.h ?? 1, maxz], mat: def.mat, pen: !!def.pen });
  });
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
function finish(m, stairCell, dropCost, links = null) {
  const { W, H, ox, oz, heights } = m;
  m.env = environmentOf(m.environment, { sky: m.sky, fog: m.fog });
  m.rules ||= {};
  m.materials ||= {};
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
  m.findPath = (a, b) => findPath(heights, W, H, a, b, stairCell, dropCost, links);
  m.ropes ||= []; m.props ||= [];
  return m;
}

// A* over the grid. Steps up at most 0.45 m (0.8 m between stair cells, whose fine treads make it walkable),
// drops any height. Diagonals only when both sides are open. Maps with worked-out links use those instead.
const scratch = new Map();
function scratchFor(n) {
  let sc = scratch.get(n);
  if (!sc) {
    sc = { gen: 0, g: new Float64Array(n), came: new Int32Array(n), seen: new Uint32Array(n), shut: new Uint32Array(n), heap: null };
    sc.grow = () => {
      const old = sc.heap, len = old ? old.k.length * 2 : 1024;
      const heap = { k: new Int32Array(len), f: new Float64Array(len), o: new Float64Array(len) };
      if (old) { heap.k.set(old.k); heap.f.set(old.f); heap.o.set(old.o); }
      sc.heap = heap;
    };
    sc.grow();
    scratch.set(n, sc);
  }
  return sc;
}

export function findPath(heights, W, H, start, goal, stairCell = null, dropCost = 0, links = null) {
  const key = (x, z) => z * W + x;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && heights[z][x] !== null;
  if (!ok(start[0], start[1]) || !ok(goal[0], goal[1])) return null;
  // Climbing more than a normal step is only possible along a flight of stairs (its fine treads), not sideways onto it.
  const canStep = links ? (ax, az, bx, bz) => (links[az * W + ax] >> DIR_BIT[(bx - ax + 1) * 3 + bz - az + 1]) & 1 : (ax, az, bx, bz) => {
    const up = heights[bz][bx] - heights[az][ax];
    if (up <= 0.45) return true;
    const f = stairCell && (stairCell[bz][bx] || stairCell[az][ax]);
    if (!f || up > 0.8) return false;
    const along = f.axis === 'x' ? (bz === az) : (bx === ax);
    const same = (stairCell[bz][bx] === f || !stairCell[bz][bx]) && (stairCell[az][ax] === f || !stairCell[az][ax]);
    return along && same;
  };
  // Scratch arrays shared by every search on a grid this size (a generation number marks what this search set),
  // and a binary heap for the open list: no garbage, and long paths across a big map stay fast.
  const n = W * H, sc = scratchFor(n), gen = ++sc.gen;
  const { g, came, seen, shut } = sc;
  let heap = sc.heap;
  const h = (x, z) => Math.hypot(x - goal[0], z - goal[1]);
  let size = 0, order = 0;
  // Heap entries: cell, f, and an insertion counter so equal f pops first-in first.
  const less = (i, j) => heap.f[i] < heap.f[j] || (heap.f[i] === heap.f[j] && heap.o[i] < heap.o[j]);
  const swap = (i, j) => {
    const { k, f, o } = heap;
    let t = k[i]; k[i] = k[j]; k[j] = t;
    t = f[i]; f[i] = f[j]; f[j] = t;
    t = o[i]; o[i] = o[j]; o[j] = t;
  };
  const push = (k, f) => {
    if (size === heap.k.length) { sc.grow(); heap = sc.heap; }
    let i = size++;
    heap.k[i] = k; heap.f[i] = f; heap.o[i] = order++;
    while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; swap(i, p); i = p; }
  };
  const pop = () => {
    const k = heap.k[0];
    size--;
    if (size > 0) {
      heap.k[0] = heap.k[size]; heap.f[0] = heap.f[size]; heap.o[0] = heap.o[size];
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < size && less(l, m)) m = l; if (r < size && less(r, m)) m = r; if (m === i) break; swap(i, m); i = m; }
    }
    return k;
  };
  const s0 = key(start[0], start[1]);
  g[s0] = 0; seen[s0] = gen; came[s0] = -1;
  push(s0, 0);
  while (size) {
    const k = pop(), x = k % W, z = (k - x) / W;
    if (shut[k] === gen) continue;
    shut[k] = gen;
    if (x === goal[0] && z === goal[1]) {
      const path = [[x, z]];
      for (let c = came[k]; c >= 0; c = came[c]) path.push([c % W, Math.floor(c / W)]);
      return path.reverse();
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!ok(nx, nz) || !canStep(x, z, nx, nz)) continue;
      if (dx && dz && (!ok(x + dx, z) || !ok(x, z + dz) || !canStep(x, z, x + dx, z) || !canStep(x, z, x, z + dz))) continue;
      const nk = key(nx, nz);
      if (shut[nk] === gen) continue;
      // Drops are allowed but can cost a little more, so bots prefer stairs over jumping off ledges.
      const drop = dropCost && heights[z][x] - heights[nz][nx] > 0.45 ? dropCost : 0;
      const ng = g[k] + (dx && dz ? 1.414 : 1) + drop;
      if (seen[nk] !== gen || ng < g[nk]) {
        g[nk] = ng; seen[nk] = gen;
        came[nk] = k;
        push(nk, ng + h(nx, nz));
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Converting and saving

const hex = (v) => (num(v) ? css(v) : v);

// An older (v1) map as a version 2 file. Version 2 files come back unchanged.
export function upgradeMap(j) {
  if (isV2(j)) return j;
  validate(j);
  const head = { format: 'tapfire-map', version: 2, id: j.id, name: j.name || j.id, about: j.about || '', modes: j.modes };
  const environment = {};
  if (j.sky !== undefined) environment.sky = hex(j.sky);
  if (Array.isArray(j.fog)) environment.fog = { near: j.fog[0], far: j.fog[1] };
  if (j.format === 'grid') {
    environment.ground = { mat: j.floor || 'floor' };
    const legend = {};
    for (const [ch, d] of Object.entries(j.legend)) { const { walk, ...rest } = d; legend[ch] = rest; }
    return { ...head, environment, grid: { layout: j.layout, legend }, labels: (j.labels || []).map(l => ({ text: l.text, cell: l.cell, ...(l.y !== undefined && { y: l.y }), ...(l.size !== undefined && { size: l.size }) })) };
  }
  const floor = j.boxes.find(b => b.floor);
  environment.ground = { mat: floor?.mat || 'floor' };
  const r3 = (v) => v.map(n => Math.round(n * 1000) / 1000);
  const box = (b) => ({ min: r3(b.min), max: r3(b.max) });
  return {
    ...head,
    bounds: { x: [j.ox, j.ox + j.W * CELL], z: [j.oz, j.oz + j.H * CELL] },
    environment,
    boxes: j.boxes.filter(b => !b.floor).map(b => ({ ...box(b), mat: b.mat, ...(b.pen && { pen: true }) })),
    floorSkins: (j.floorSkins || []).map(b => ({ ...box(b), mat: b.mat })),
    decor: (j.decor || []).map(d => ({ ...box(d), color: hex(d.color), ...(d.glow && { glow: true }) })),
    trees: (j.trees || []).map(t => ({ ...t, color: hex(t.color) })),
    signs: (j.props || []).filter(p => p.type === 'sign').map(({ type, ...p }) => ({ ...p, color: hex(p.color) })),
    ropes: j.ropes || [],
    labels: (j.labels || []).map(l => ({ text: l.text, x: l.x, z: l.z, ...(l.size !== undefined && { size: l.size }) })),
    spawns: j.spawns,
    ...(j.teamSpawns && { teamSpawns: j.teamSpawns }),
    ...(j.sites && { sites: Object.fromEntries(Object.entries(j.sites).map(([k, s]) => [k, { min: [s.min[0], s.min[2]], max: [s.max[0], s.max[2]] }])) }),
    ...(j.barriers && { barriers: j.barriers }),
    ...(j.holds && { bots: { holds: j.holds, stage: j.stage, buyStage: j.buyStage } }),
  };
}

// JSON laid out for people: short things on one line, one box / spawn / layout row per line.
export function stringifyMap(j) {
  const inline = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return e.length ? '{ ' + e.map(([k, x]) => JSON.stringify(k) + ': ' + inline(x)).join(', ') + ' }' : '{}';
  };
  const fmt = (v, ind, depth) => {
    const one = inline(v);
    if (v === null || typeof v !== 'object' || (depth > 0 && ind.length + one.length <= 140)) return one;
    const next = ind + '  ';
    if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => next + fmt(x, next, depth + 1)).join(',\n') + '\n' + ind + ']' : '[]';
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return '{\n' + e.map(([k, x]) => next + JSON.stringify(k) + ': ' + fmt(x, next, depth + 1)).join(',\n') + '\n' + ind + '}';
  };
  return fmt(j, '', 0) + '\n';
}
