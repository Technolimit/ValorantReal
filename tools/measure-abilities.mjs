// Plays every ability through the game's own controls and measures what happens, to compare with
// VALORANT_SPECS.md (the results are summed up in VALORANT_DIFFERENCES.md, "Measured in game").
//   node tools/measure-abilities.mjs                      every ability, one line each
//   node tools/measure-abilities.mjs --only nyx,blitz:q   some agents or abilities
//   node tools/measure-abilities.mjs --json               the full record for each ability
// Each ability is used on the Range (deathmatch, two static bots, loop frozen, ticked by hand): press the key,
// click as soon as it lets you (hold to charge where it charges, pick map points where it opens the map), then
// watch for 10 s. Bot A stands where the ability lands and bot B next to it, both facing it. Positions are
// [metres ahead, metres to the right, metres up] from where you stand. The setup for each ability is in PLANS.
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


const PAGE_HELPERS = `
window.__start = async (o) => {
  const h = window.__game; h.frozen = true;
  Object.assign(h.settings, { mode: 'dm', botCount: 1, agent: 'cinder', map: 'arena', botMode: 'static', difficulty: 'normal', side: 'atk' }, o);
  await h.startMatch({}); h.frozen = true;
  return h.game;
};
window.__tick = (g, s) => { for (let i = 0; i < Math.round(s * 128); i++) g.tick(); };
// Tick through the rest of the buy phase (30 s, or 45 s in the first round of a half).
window.__live = (g) => __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1);
// Put c on open ground, facing -z, with 'len' metres of clear sight ahead.
window.__place = (g, c, len = 8, skip = 0) => {
  const b = g.map.boxes.filter(x => !x.floor);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of b) { x0 = Math.min(x0, q.min[0]); x1 = Math.max(x1, q.max[0]); z0 = Math.min(z0, q.min[2]); z1 = Math.max(z1, q.max[2]); }
  let n = 0;
  for (let x = x0 + 2; x < x1 - 2; x += 1.5) for (let z = z0 + 2; z < z1 - 2; z += 1.5) {
    const f = g.floorAt(x, z), f2 = g.floorAt(x, z - len);
    if (!f || !f2 || Math.abs(f[1] - f2[1]) > 0.05 || !g.canStand(c, f)) continue;
    const e = [x, f[1] + 1.6, z];
    if (!g.world.lineOfSight(e, [x, e[1], z - len]) || !g.world.lineOfSight([x, f[1] + 0.3, z], [x, f[1] + 0.3, z - len])) continue;
    if (g.combatants.some(o => o !== c && o.alive && Math.hypot(o.pos[0] - x, o.pos[2] - z) < 25)) continue;
    if (n++ < skip) continue;
    c.pos = [...f]; c.prevPos = [...f]; c.vel = [0, 0, 0]; c.yaw = 0; c.pitch = 0;
    return true;
  }
  return false;
};
// A point d metres in front of c's eyes.
// A solid block that only exists for the check (not drawn).
window.__box = (g, min, max) => { const b = { min, max, pen: false, mat: 'wall', temp: true }; g.world.boxes.push(b); return b; };
// Aim c's crosshair at point t.
window.__aim = (c, t) => { const e = c.eye(), dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2]; c.yaw = Math.atan2(-dx, -dz); c.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
// Steps 0.4 m high and 0.6 m deep, 3 m wide, climbing away from c (who faces -z), starting at metres ahead.
window.__stairs = (g, c, at = 3, n = 4) => { const [x, y, z] = c.pos; for (let i = 0; i < n; i++) __box(g, [x - 1.5, y, z - at - 0.6 * (i + 1)], [x + 1.5, y + 0.4 * (i + 1), z - at - 0.6 * i]); return { top: (i) => [x, y + 0.4 * (i + 1), z - at - 0.6 * i - 0.3] }; };
window.__remote = () => window.__game.game.combatants.find(x => x.remote);
window.__ahead = (c, d) => { const e = c.eye(); return [e[0] - Math.sin(c.yaw) * d, e[1], e[2] - Math.cos(c.yaw) * d]; };
`;

// In the page: play one ability and record what happens.
const MEASURE = String.raw`
// In-game measurement of one ability, played through the real controls.
window.__measure = async (agent, key, P = {}) => {
  const h = window.__game; h.frozen = true; h.noDraw = true;
  Object.assign(h.settings, { mode: 'dm', map: 'arena', botCount: 2, botMode: 'static', agent, difficulty: 'normal' });
  await h.startMatch({}); h.frozen = true; h.noDraw = true;
  const g = h.game, p = g.player, k = p.kit, AB = k.agent.abilities, ab = AB[key];
  if (!__place(g, p, 34)) return { error: 'no ground' };
  p.yaw = 0; p.pitch = P.pitch ?? 0; p.hp = 100; p.armor = 0;
  p.give('vandal'); p.equip('primary', g.time, true);
  __tick(g, 1.3);
  const o = [...p.pos], E = p.eye();
  // local coordinates: [ahead, right, up] from the player's feet, facing -z
  const rel = (q) => q && [+(o[2] - q[2]).toFixed(2), +(q[0] - o[0]).toFixed(2), +(q[1] - o[1]).toFixed(2)];
  const at = (ahead, right = 0, up = 0) => [o[0] + right, o[1] + up, o[2] - ahead];
  if (P.wall) { const w = P.wall; __box(g, [o[0] - 6, o[1], o[2] - w - 0.4], [o[0] + 6, o[1] + 4, o[2] - w]); }
  if (P.sideWalls) { __box(g, [o[0] - 4.2, o[1], o[2] - 12], [o[0] - 4, o[1] + 4, o[2] + 1]); __box(g, [o[0] + 4, o[1], o[2] - 12], [o[0] + 4.2, o[1] + 4, o[2] + 1]); }
  const [A, B] = g.bots;
  const putBot = (b, q, look) => { b.pos = [...q]; b.pos[1] = (g.floorAt(q[0], q[2], o[1] + 2) || q)[1]; b.prevPos = [...b.pos]; b.vel = [0, 0, 0]; b.hp = P.botHp ?? 10000; b.armor = 0; b.yaw = Math.atan2(-(look[0] - b.pos[0]), -(look[2] - b.pos[2])); b.pitch = 0; b.brain.mode = 'static'; };
  const far = (b, n) => putBot(b, at(-200 - n * 10, 50), at(0));
  if (P.botA) putBot(A, at(...P.botA), P.lookA ? at(...P.lookA) : E); else far(A, 1);
  if (P.botB) putBot(B, at(...P.botB), P.lookB ? at(...P.lookB) : E); else far(B, 2);
  for (const kk of ['c', 'q', 'e']) k.charges[kk] = Math.max(1, AB[kk].charges || 1);
  if (key === 'x') k.ultPoints = 99;
  P.setup?.(g, p, k, at, A, B);
  // ---- instrumentation ----
  const t0 = g.time, T = () => +(g.time - t0).toFixed(3);
  const log = [], made = [], hits = { A: [], B: [], self: [] }, who = (c) => c === A ? 'A' : c === B ? 'B' : c === p ? 'self' : null;
  const emit = g.emit.bind(g);
  g.emit = (type, e) => { if (!['footstep', 'tracer', 'shot', 'impact', 'equip', 'reloadRound', 'land', 'jump'].includes(type)) log.push([T(), type, e?.type || e?.kind || '', e?.pos ? rel(e.pos) : e?.to ? rel(e.to) : null, e?.r]); return emit(type, e); };
  const wrap = (name, f) => { const orig = g[name].bind(g); g[name] = (...a) => { const r = orig(...a); f(r, a); return r; }; };
  wrap('addDevice', (d) => { if (d) made.push({ t: T(), what: 'device:' + d.kind, obj: d }); });
  wrap('addSmoke', (s) => made.push({ t: T(), what: 'smoke:' + s.kind, obj: s }));
  wrap('addZone', (z) => made.push({ t: T(), what: 'zone:' + z.kind, obj: z }));
  if (g.addWall) wrap('addWall', (w) => made.push({ t: T(), what: 'wall', obj: w }));
  const dmg = g.damage.bind(g);
  g.damage = (tg, by, amt, info) => { const w = who(tg); const before = tg.hp + tg.armor; const r = dmg(tg, by, amt, info); if (w) hits[w].push([T(), before - (tg.hp + tg.armor), info?.def?.name || '', info?.part || '']); return r; };
  const dec = g.decay.bind(g);
  g.decay = (c, amt, opt) => { const w = who(c); const hp0 = c.hp; dec(c, amt, opt); if (w) hits[w].push([T(), hp0 - c.hp, 'decay', '']); };
  const F = ['blindUntil', 'stunUntil', 'slowUntil', 'nearUntil', 'revealUntil', 'suppressUntil', 'deafUntil', 'vulnUntil', 'hinderUntil', 'disarmUntil', 'stimUntil', 'hasteUntil', 'intangibleUntil', 'hiddenUntil', 'invulnUntil', 'channelUntil', 'castLockUntil', 'downedUntil'];
  const st = { A: {}, B: {}, self: {} };
  const sample = () => { for (const [n, c] of [['A', A], ['B', B], ['self', p]]) for (const f of F) { if (c.st[f] > g.time) { const s = st[n][f] ||= { from: T(), ticks: 0, firstLen: +(c.st[f] - g.time).toFixed(2), extra: '' }; s.ticks++; s.to = T(); if (f === 'slowUntil') s.extra = 'amt ' + c.st.slowAmt; if (f === 'nearUntil') s.extra = 'range ' + c.st.nearRange; if (f === 'blindUntil' && !s.extra) s.extra = 'len ' + (+c.st.blindLen).toFixed(2); if (f === 'hasteUntil') s.extra = 'amt ' + c.st.hasteAmt; } } };
  const pos0 = [...p.pos], hp0 = p.hp;
  const track = []; let fast = null;
  // ---- drive the controls ----
  let used = null, usedVia = '';
  const spend = k.spend.bind(k); k.spend = (kk, m) => { const r = spend(kk, m); if (kk === key && used === null && r !== false) { used = T(); usedVia = 'spend ' + (m || ''); } return r; };
  const xuse = AB.x.use; if (key === 'x') AB.x.use = function (...a) { const r = xuse.apply(this, a); if (used === null && r !== false) { used = T(); usedVia = 'ult'; } return r; };
  const K = 'ab' + key.toUpperCase(), held = 'ab' + key.toUpperCase() + 'Held';
  p.input[K] = true; if (P.hold) p.input[held] = true;
  let charging = false, released = false, picked = false;
  const watch = P.watch ?? 10, steps = Math.round((watch + 2) * 128);
  const acts = (P.after || []).map(a => ({ ...a, done: false }));
  for (let i = 0; i < steps; i++) {
    const now = T();
    // armed: click as soon as it lets you (left, or right with P.mode 'right'); charge: hold, then release
    if (used === null && k.armed && k.armed.k === key) {
      if (ab.charge) { if (!released) { p.input.fire = true; charging = true; if ((k.chargeT || 0) >= ab.charge * (P.power ?? 1) - 1e-6) { p.input.fire = false; released = true; } } }
      else if (P.mode === 'right') p.input.altPressed = true; else p.input.firePressed = true;
    }
    if (k.mapPick && !picked) { picked = true; for (const q of (P.picks || [[12, 0]])) k.mapClick(g.floorAt(...[at(...q)].map(v => v).flatMap((v) => [v[0], v[2], o[1] + 2])) || at(...q)); if (k.mapPick) k.mapConfirm(); }
    if (P.hold && now < (P.holdFor ?? 0.6)) p.input[held] = true; else p.input[held] = false;
    if (P.move) { const on = now < (P.moveFor ?? Infinity); p.input.fwd = on ? P.move[0] : 0; p.input.side = on ? P.move[1] : 0; }
    for (const a of acts) if (!a.done && now >= a.t) { a.done = true; a.fn(g, p, k, at, A, B); }
    const pp = [...p.pos];
    g.tick();
    sample();
    { const sp = Math.hypot(p.pos[0] - pp[0], p.pos[2] - pp[2]) * 128, j = Math.hypot(p.pos[0] - pp[0], p.pos[1] - pp[1], p.pos[2] - pp[2]);
      if (j > 3) track.push(['jump', T(), rel(pp), rel(p.pos)]); // teleport
      if (sp > 7.5) { if (!fast) fast = { from: T(), start: rel(pp), top: 0 }; fast.to = T(); fast.end = rel(p.pos); fast.top = Math.max(fast.top, +sp.toFixed(1)); }
      if (p.pos[1] - o[1] > (track.maxUp || 0)) track.maxUp = +(p.pos[1] - o[1]).toFixed(2); }
  }
  // ---- summarise ----
  const life = (x) => x.until != null ? +(x.until - (x.born ?? 0)).toFixed(2) : x.life != null ? x.life : null;
  const things = made.slice(0, 12).map(m => {
    const x = m.obj, q = x.pos || (x.box && [(x.box.min[0] + x.box.max[0]) / 2, x.box.min[1], (x.box.min[2] + x.box.max[2]) / 2]);
    const r = x.radius ?? x.r ?? (x.box ? [+(x.box.max[0] - x.box.min[0]).toFixed(2), +(x.box.max[1] - x.box.min[1]).toFixed(2), +(x.box.max[2] - x.box.min[2]).toFixed(2)] : undefined);
    return { t: m.t, what: m.what, at: rel(q), r, life: life(x), hp: x.hp };
  });
  const proj = made.filter(m => m.what === 'device:proj');
  return {
    agent, key, name: ab.name, equipSpec: ab.equip ?? (ab.instant ? 0 : 0.25), used, usedVia, chargeUsed: charging,
    things, log: log.slice(0, 14),
    hitsA: hits.A.slice(0, 12).map(x => [x[0], +x[1].toFixed(2), x[2], x[3]]), sumA: +hits.A.reduce((s, x) => s + x[1], 0).toFixed(1), lastA: hits.A.length ? hits.A[hits.A.length - 1][0] : null, namesA: [...new Set(hits.A.map(x => x[2]))], nA: hits.A.length,
    hitsB: hits.B.slice(0, 6).map(x => [x[0], +x[1].toFixed(2), x[2], x[3]]), sumB: +hits.B.reduce((s, x) => s + x[1], 0).toFixed(1), lastB: hits.B.length ? hits.B[hits.B.length - 1][0] : null, nB: hits.B.length,
    selfHits: hits.self.slice(0, 4), stA: st.A, stB: st.B, stSelf: st.self,
    moved: rel(p.pos), teleports: track.slice(0, 3), fast, maxUp: track.maxUp || 0, hpSelf: +(p.hp - hp0).toFixed(1), charges: k.charges[key],
  };
};
`;

// Where the bots stand and how each ability is played (window.__plans[agent:key]).
const PLANS = String.raw`
(() => {
  const POS = {"zephyr:c": {"botA": [20, 0], "botB": [23, 0]}, "zephyr:q": {"botA": [8, 0], "botB": [12, 3]}, "zephyr:e": {"botA": [8, 0], "botB": [12, 3]}, "zephyr:x": {"botA": [10, 0], "botB": [14, 2]}, "cinder:c": {"botA": [15, 0], "botB": [12, 4.5]}, "cinder:q": {"botA": [10.4, 0], "botB": [13.4, 0]}, "cinder:e": {"botA": [7, -3.2], "lookA": [3, -3.2, 1.5], "botB": [15, -3.2], "lookB": [3, -3.2, 1.5]}, "cinder:x": {"botA": [10, 0], "botB": [12, 3]}, "umbra:c": {"botA": [14.89, 0], "botB": [17.89, 0]}, "umbra:q": {"botA": [15, 0], "botB": [12, 4.5]}, "umbra:e": {"botA": [15.88, 0], "botB": [18.880000000000003, 0]}, "umbra:x": {"botA": [15, 0], "botB": [18, 0]}, "hawke:c": {"botA": [0.79, 0], "botB": [3.79, 0]}, "hawke:q": {"botA": [16.39, 0], "botB": [19.39, 0]}, "hawke:e": {"botA": [22, 0], "botB": [16, 20]}, "hawke:x": {"botA": [15, 0], "botB": [30, 1.2]}, "bastion:c": {"botA": [19.63, 0], "botB": [22.63, 0]}, "bastion:q": {"botA": [9.93, 0], "botB": [12.93, 0]}, "bastion:e": {"botA": [4.47, 0], "botB": [7.47, 0]}, "bastion:x": {"botA": [20, 0], "botB": [33, 0]}, "blitz:c": {"botA": [12, 0], "botB": [14, 3]}, "blitz:q": {"botA": [4.66, 0], "botB": [7.66, 0]}, "blitz:e": {"botA": [28.64, 0], "botB": [31.64, 0]}, "blitz:x": {"botA": [15, 0], "botB": [15, 3]}, "granite:c": {"botA": [7.87, 0], "botB": [10.870000000000001, 0]}, "granite:q": {"botA": [11.59, 0], "botB": [14.59, 0]}, "granite:e": {"botA": [14, 0], "botB": [17, 0]}, "granite:x": {"botA": [14, 0], "botB": [17, 0]}, "venom:c": {"botA": [11.59, 0], "botB": [14.59, 0]}, "venom:q": {"botA": [10.4, 0], "botB": [13.4, 0]}, "venom:e": {"botA": [15, 0], "botB": [12, 4.5]}, "venom:x": {"botA": [5, 0], "botB": [9.5, 0]}, "vex:c": {"botA": [9.93, 0], "botB": [12.93, 0]}, "vex:q": {"botA": [8, 0], "botB": [12, 3]}, "vex:e": {"botA": [8, 0], "botB": [12, 3]}, "vex:x": {"botA": [8, 0], "botB": [12, 3]}, "quake:c": {"botA": [6.7, 0], "botB": [9.7, 0]}, "quake:q": {"botA": [12.9, 0], "lookA": [8.9, 0, 1.5], "botB": [20.9, 0], "lookB": [8.9, 0, 1.5]}, "quake:e": {"botA": [15, 0], "botB": [12, 4.5]}, "quake:x": {"botA": [15, 0], "botB": [12, 4.5]}, "volt:c": {"botA": [15, 0], "botB": [12, 4.5]}, "volt:q": {"botA": [13.91, 0], "botB": [16.91, 0]}, "volt:e": {"botA": [8, 0], "botB": [12, 3]}, "volt:x": {"botA": [15, 0], "botB": [30, 3]}, "mirage:c": {"botA": [57, 0], "botB": [60, 0]}, "mirage:q": {"botA": [33.7, 0], "lookA": [29.7, 0, 1.5], "botB": [41.7, 0], "lookB": [29.7, 0, 1.5]}, "mirage:e": {"botA": [14.36, 0], "botB": [17.36, 0]}, "mirage:x": {"botA": [8, 0], "botB": [12, 3]}, "fawn:c": {"botA": [8, 0], "botB": [12, 3]}, "fawn:q": {"botA": [10, 0], "botB": [13, 2]}, "fawn:e": {"botA": [20.07, 0], "lookA": [16.07, 0, 1.5], "botB": [28.07, 0], "lookB": [16.07, 0, 1.5]}, "fawn:x": {"botA": [15, 0], "botB": [20, 5]}, "lattice:c": {"botA": [0.81, -3.95], "botB": [3.81, -3.95]}, "lattice:q": {"botA": [14.89, 0], "botB": [17.89, 0]}, "lattice:e": {"botA": [7.85, 0], "botB": [10.85, 0]}, "lattice:x": {"botA": [0, 0], "botB": [3, 0]}, "nyx:c": {"botA": [12, 0], "botB": [16, 3]}, "nyx:q": {"botA": [14.88, 0], "botB": [17.880000000000003, 0]}, "nyx:e": {"botA": [19.63, 0], "botB": [22.63, 0]}, "nyx:x": {"botA": [15, 0], "botB": [12, 4.5]}, "solace:c": {"botA": [14.89, -3.9], "botB": [17.89, -3.9]}, "solace:q": {"botA": [11.59, 0], "botB": [14.59, 0]}, "solace:e": {"botA": [8, 0], "botB": [12, 3]}, "solace:x": {"botA": [8, 0], "botB": [12, 3]}, "stella:c": {"botA": [10, 0], "botB": [13, 0]}, "stella:q": {"botA": [10, 0], "botB": [13, 0]}, "stella:e": {"botA": [12, 0], "botB": [15, 0]}, "stella:x": {"botA": [8, 0], "botB": [12, 3]}, "regent:c": {"botA": [11.91, 0], "botB": [14.91, 0]}, "regent:q": {"botA": [12, 0], "botB": [20, 3]}, "regent:e": {"botA": [4.29, 0], "botB": [7.29, 0]}, "regent:x": {"botA": [20, 0], "botB": [25, 3]}, "marina:c": {"botA": [11.59, 0], "botB": [14.59, 0]}, "marina:q": {"botA": [15, 0], "botB": [12, 4.5]}, "marina:e": {"botA": [14.5, 0], "botB": [17.5, 0]}, "marina:x": {"botA": [15, 0], "botB": [12, 4.5]}, "vanta:c": {"botA": [14.8, 0], "botB": [17.8, 0]}, "vanta:q": {"botA": [15, 0], "botB": [12, 4.5]}, "vanta:e": {"botA": [8, 0], "botB": [12, 3]}, "vanta:x": {"botA": [15, 0], "botB": [12, 4.5]}, "ballast:c": {"botA": [20, 0], "botB": [30, 0]}, "ballast:q": {"botA": [13.91, 0], "botB": [16.91, 0]}, "ballast:e": {"botA": [14, 0], "botB": [17, 0]}, "ballast:x": {"botA": [15, 0], "botB": [12, 4.5]}, "override:c": {"botA": [10.4, 0], "botB": [13.4, 0]}, "override:q": {"botA": [25.13, 0], "lookA": [21.13, 0, 1.5], "botB": [33.129999999999995, 0], "lookB": [21.13, 0, 1.5]}, "override:e": {"botA": [14.94, 0], "botB": [17.939999999999998, 0]}, "override:x": {"botA": [20, 0], "botB": [45, 0]}, "thistle:c": {"botA": [5, 0], "botB": [12, 3]}, "thistle:q": {"botA": [11.59, 0], "botB": [14.59, 0]}, "thistle:e": {"botA": [14, 0], "botB": [17, 0]}, "thistle:x": {"botA": [8, 0], "botB": [12, 3]}, "lumen:c": {"botA": [11.59, 0], "botB": [14.59, 0]}, "lumen:q": {"botA": [8, 0], "botB": [12, 3]}, "lumen:e": {"botA": [10, 0], "botB": [12, 3]}, "lumen:x": {"botA": [15, 0], "botB": [12, 4.5]}};
  const P = {};
  for (const [k, v] of Object.entries(POS)) P[k] = { pitch: -0.12, ...v };
  const press = (key) => (g, p) => { p.input['ab' + key] = true; };
  const aimA = (g, p, k, at, A) => { __aim(p, [A.pos[0], A.pos[1] + 1.1, A.pos[2]]); };
  const fireAt = (t, n = 1, gap = 0.3) => Array.from({ length: n }, (_, i) => ({ t: t + i * gap, fn: (g, p, k, at, A) => { if (A.alive) __aim(p, [A.pos[0], A.pos[1] + 1.1, A.pos[2]]); p.input.firePressed = true; p.input.fire = true; } }));
  const add = (k, o) => { P[k] = { ...P[k], ...o }; };
  add('zephyr:c', { pitch: -0.05, hold: true, holdFor: 0.3 });
  add('zephyr:e', { move: [1, 0], moveFor: 1.6, after: [{ t: 1.2, fn: press('E') }] });
  add('zephyr:x', { setup: aimA, after: fireAt(1.2, 5, 0.3) });
  add('bastion:c', { after: [{ t: 2.5, fn: (g, p, k) => { k.charges.c = 0; p.input.abC = true; } }], watch: 9 });
  add('bastion:x', { watch: 16 });
  add('blitz:q', { pitch: -0.3, after: [{ t: 1.7, fn: press('Q') }] });
  add('blitz:x', { setup: aimA, after: fireAt(1.6, 1) });
  add('granite:e', { picks: [[14, 0]] }); add('granite:x', { picks: [[14, 0]], watch: 8 });
  add('vex:q', { setup: (g, p, k) => { k.orbs = [{ pos: [...p.pos], until: g.time + 3, life: 3 }]; p.hp = 50; } });
  add('vex:e', { setup: (g, p, k) => { k.orbs = [{ pos: [...p.pos], until: g.time + 3, life: 3 }]; } });
  add('quake:c', { wall: 6, botA: [8, 0], botB: [11, 2] }); add('quake:q', { wall: 6, pitch: 0 });
  add('quake:e', { power: 1 });
  add('mirage:e', { after: [{ t: 2.5, fn: press('E') }] });
  add('lattice:c', { sideWalls: true, pitch: 0, setup: (g, p) => { p.yaw = Math.PI / 2 - 0.2; }, after: [{ t: 2.6, fn: (g, p, k, at, A) => { A.pos = at(1.6, -6); A.prevPos = [...A.pos]; A.input.side = 1; } }], watch: 8 });
  add('lattice:x', { botA: [6, 0], setup: (g, p, k, at, A) => { g.damage(A, p, 99999, { part: 'head', def: { id: 'vandal', name: 'Vandal' }, dist: 6, point: A.eye() }); A.respawnAt = Infinity; p.pitch = -0.25; } });
  add('lattice:e', { wall: 8, pitch: 0 });
  add('stella:e', { picks: [[12, 0], [12, 4]] });
  const star = (g, p, k, at) => { g.addDevice({ kind: 'star', owner: p, pos: at(10, 0), life: 1e5 }); p.yaw = 0; p.pitch = Math.atan2(-(p.eye()[1] - (p.pos[1] + 0.9)), 10); };
  add('stella:c', { setup: star }); add('stella:q', { setup: star });
  add('stella:x', { picks: [[12, 0]], botA: [12, -2], botB: [12, 2] });
  add('regent:q', { setup: aimA, after: fireAt(0.5, 3, 0.3) });
  add('regent:x', { setup: aimA, after: fireAt(2.6, 1) });
  add('regent:e', { pitch: -0.4, after: [{ t: 2.0, fn: (g, p) => { p.pos[2] += 6; p.prevPos = [...p.pos]; } }, { t: 2.3, fn: press('E') }] });
  add('umbra:x', { picks: [[15, 0]], watch: 7, botA: [15, 1.5] });
  add('ballast:e', { picks: [[14, 0]] }); add('ballast:x', { picks: [[10, 0], [30, 0]], watch: 9, botA: [16, 0], botB: [16, 2.5] });
  add('ballast:c', { after: [{ t: 2.0, fn: (g, p) => { p.input.firePressed = true; } }] });
  add('thistle:e', { picks: [[14, 0]] });
  add('thistle:c', { setup: (g, p, k, at, A) => { g.damage(A, p, 99999, { part: 'head', def: { id: 'vandal', name: 'Vandal' }, dist: 5, point: A.eye() }); A.respawnAt = Infinity; } });
  add('lumen:e', { move: [1, 0], moveFor: 1.8, after: [{ t: 2.0, fn: press('E') }] });
  add('hawke:q', { pitch: -0.1 }); add('hawke:e', { pitch: -0.1 });
  add('hawke:x', { setup: aimA, after: fireAt(1.0, 3, 0.8) });
  add('volt:x', { setup: aimA, after: Array.from({ length: 128 }, (_, i) => ({ t: 1.0 + i / 128, fn: (g, p) => { p.input.fire = true; } })) });
  add('fawn:q', { after: [{ t: 1.6, fn: (g, p) => { p.input.firePressed = true; } }] });
  add('nyx:q', { pitch: -0.05 }); add('nyx:e', { pitch: 0 });
  add('solace:e', { setup: (g, p) => { p.hp = 40; }, mode: 'right' });
  window.__plans = P;
})();
`;

// One line per ability: when it was usable, what it made, what it did to the bots (A on the spot, B nearby) and you.
function digest(r) {
  if (r.error) return `${r.agent}:${r.key} ERROR ${r.error}`;
  const out = [`${r.agent}:${r.key} ${r.name}`, `usable at ${r.used ?? 'never'} s`];
  if (r.things.length) out.push('made ' + r.things.slice(0, 6).map(t => `${t.what} at ${t.t}s ${JSON.stringify(t.at)}${t.r != null ? ' r ' + JSON.stringify(t.r) : ''}${t.life != null ? ' life ' + t.life : ''}${t.hp != null ? ' hp ' + t.hp : ''}`).join('; '));
  const ev = r.log.filter(e => !['abilityUsed', 'device', 'smoke', 'zone', 'abilityArm'].includes(e[1]));
  if (ev.length) out.push('events ' + ev.slice(0, 8).map(e => `${e[0]}:${e[1]}/${e[2]}${e[3] ? JSON.stringify(e[3]) : ''}`).join(' '));
  for (const w of ['A', 'B']) if (r['n' + w]) out.push(`bot ${w}: ${r['n' + w]} hits, ${r['sum' + w]} total, first ${JSON.stringify(r['hits' + w].slice(0, 3))}`);
  for (const [w, k] of [['A', 'stA'], ['B', 'stB'], ['you', 'stSelf']]) {
    const s = Object.entries(r[k]);
    if (s.length) out.push(`${w}: ` + s.map(([f, v]) => `${f.replace('Until', '')} ${v.from}-${v.to}s (${v.firstLen}) ${v.extra}`.trim()).join(', '));
  }
  if (r.fast) out.push(`dash ${r.fast.from}-${r.fast.to}s, top ${r.fast.top} m/s, ${JSON.stringify(r.fast.start)} -> ${JSON.stringify(r.fast.end)}`);
  if (r.teleports.length) out.push('teleport ' + JSON.stringify(r.teleports));
  if (r.maxUp) out.push(`rose ${r.maxUp} m`);
  if (r.hpSelf) out.push(`your health ${r.hpSelf > 0 ? '+' : ''}${r.hpSelf}`);
  return out.join(' | ');
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('page error:', String(e).slice(0, 200)));
await page.goto(url);
await page.waitForFunction(() => window.__game);
for (const content of [PAGE_HELPERS, MEASURE, PLANS]) await page.addScriptTag({ content });
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('--only')?.split(','), json = process.argv.includes('--json');
const ids = await page.evaluate(() => Object.keys(window.__plans));
for (const id of ids) {
  if (only && !only.some(w => id.startsWith(w))) continue;
  const r = await page.evaluate(async (id) => { const [agent, key] = id.split(':'); try { return await window.__measure(agent, key, window.__plans[id] || {}); } catch (e) { return { agent, key, error: String(e.stack).slice(0, 400) }; } }, id);
  console.log(json ? JSON.stringify(r) : digest(r));
}
await browser.close();
server.close();
