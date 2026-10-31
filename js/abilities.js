// Agents and their abilities. Each agent is an original character, but their kits follow the mechanics of
// the classic tactical-shooter archetypes:
//   Zephyr  wind duelist      armed dash, wind-up updraft, quick smoke, knife-storm ultimate
//   Cinder  fire duelist      fire wall + fire pool that heal him, curving flash, "come back" ultimate
//   Umbra   shadow controller long-range smokes, blinding line, short teleport, teleport-anywhere ultimate
//   Hawke   recon initiator   shock dart, scouting drone, recon bolt, wall-piercing beams
//   Bastion gadget sentinel   detonatable swarm grenades, alarm bot, turret, map-area lockdown
//
// Keys: C, Q, E are basic abilities with charges that refill on a cooldown; X is the ultimate, charged by
// kills. In 5v5 they follow Valorant instead: C and Q are bought and never come back on their own, and the
// signature (E) recharges on its cooldown, after two kills (`recharge: 'kills'`) or not at all
// (`recharge: 'none'`). Some abilities are "armed" first (press the key, then left/right click). Bots never
// use abilities, but they are affected by them (blinded, nearsighted, revealed, vulnerable, detained...).
import { dirFromAngles } from './entity.js';
import { PLAYER } from './config.js';

const DEG = Math.PI / 180;
const ABILITY_KEYS = ['q', 'e', 'c'];

export const LIFT_VELOCITY = 12.5; // ~3.5 m rise
export const DASH = { speed: 24.4, time: 0.45, exit: 7 }; // Tailwind: 11 m in 0.45 s, keep 7 m/s afterwards
export const GLIDE_FALL = 2.3; // max fall speed while gliding, m/s
export const SMOKE = { radius: 2.8, life: 4.5, range: 14, grow: 0.25 };
export const BLADES = {
  id: 'blades', name: 'Edgestorm', cat: 'Ability', model: 'blades', count: 5, cycle: 0.33,
  dmg: [[50, 150, 50, 42]], spread: 0.15, fan: 2.2, // 50 body, x3 head, x0.85 legs
};
export const OVERDRIVE = { id: 'overload', name: 'Overload', cat: 'Ability', dmg: [[50, 54, 27, 22]] };
export const BEAMS = { id: 'beams', name: 'Talon Strike', cat: 'Ability', count: 3, time: 6, dmg: 80, width: 0.88, range: 66, reveal: 1 }; // 66 m x 1.76 m
// Damage sources for the kill feed.
const src = (id, name) => ({ id, name, cat: 'Ability', dmg: [[50, 0, 0, 0]] });

// ---------- shared helpers ----------
// Where the crosshair lands within `range` (stopping short of walls), optionally dropped to the floor.
export function aimPoint(o, range, { floor = false, back = 0.6, bodies = true } = {}) {
  const g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
  const hit = g.world.raycast(eye, d, range);
  // Looking at the top of something (a step, a box, a ledge) lands on it; backing off along the ray there
  // would slide off its edge and drop to the floor below.
  const onTop = floor && hit?.n && hit.n[1] > 0.5;
  let t = hit ? Math.max(0.3, hit.t - (onTop ? 0.02 : back)) : range;
  if (bodies) { // thrown things stop on the first player they hit (and drop at their feet)
    for (const c of g.combatants) {
      if (!c.alive || !g.isEnemy(o, c)) continue;
      const r = c.rayHit(eye, d, t);
      if (r && r.t < t) t = Math.max(0.3, r.t - 0.1);
    }
  }
  const pos = [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t];
  if (floor) {
    const f = g.world.raycast([pos[0], pos[1] + 0.2, pos[2]], [0, -1, 0], 40);
    if (f) pos[1] = pos[1] + 0.2 - f.t;
  }
  return pos;
}
// Thrown or placed utility lands even if its owner dies first; `mine` is for effects on the owner's own body
// (teleports, dashes, shields), which die with them.
// The free standing spot nearest p on the same level (within 0.8 m): a landing marker next to a wall, on a
// stair edge or at a ledge lip still has somewhere to put your feet.
function standSpot(o, p) {
  const g = o.game;
  for (const r of [0, 0.3, 0.55, 0.8]) {
    for (let a = 0; a < (r ? 8 : 1); a++) {
      const f = g.floorAt(p[0] + Math.cos(a * Math.PI / 4) * r, p[2] + Math.sin(a * Math.PI / 4) * r, p[1] + 0.5);
      if (f && Math.abs(f[1] - p[1]) < 0.5 && g.canStand(o, f)) return f;
    }
  }
  return null;
}
// Where a teleport aimed at the crosshair lands (Rift): the surface you look at, the step or ledge whose lip
// you are aiming just under (up to 1.2 m below its top), or the floor in front of a wall.
function landing(o, range) {
  const g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
  const hit = g.world.raycast(eye, d, range);
  if (hit && hit.n[1] === 0) {
    const p = [eye[0] + d[0] * hit.t, eye[1] + d[1] * hit.t, eye[2] + d[2] * hit.t];
    const h = Math.hypot(d[0], d[2]) || 1, ix = p[0] + d[0] / h * 0.45, iz = p[2] + d[2] / h * 0.45;
    const top = g.floorAt(ix, iz, p[1] + 1.25);
    if (top && top[1] > p[1] - 0.05) { const s = standSpot(o, top); if (s) return s; }
  }
  return standSpot(o, aimPoint(o, range, { floor: true, back: 0.7, bodies: false }));
}
// Where Glare's eye goes: 12 m straight along the aim, through walls, kept a little above the floor below it.
function glareSpot(o) {
  const e = o.eye(), d = dirFromAngles(o.yaw, o.pitch), p = [e[0] + d[0] * 12, e[1] + d[1] * 12, e[2] + d[2] * 12];
  const f = o.game.floorAt(p[0], p[2], Math.max(p[1], e[1]) + 0.5);
  if (f && p[1] < f[1] + 0.6) p[1] = f[1] + 0.6;
  return p;
}
// Where a held ability with a preview will land: exactly the spot the preview showed this tick while the
// player is holding it; recomputed for bots and replays, which cast without holding.
const target = (kit, a) => (kit.armed && kit.previewPos) || a.preview(kit);
const later = (kit, delay, fn) => kit.timers.push({ at: kit.now + delay, fn });
const SHADOW_TIME = 4; // Nightwalk: how long the shade stands before you arrive
const mine = (kit, delay, fn) => kit.timers.push({ at: kit.now + delay, fn, self: true });
// Flight time for a thrown ability at `speed` m/s (through an optional bend point), never instant.
function flight(from, to, speed, via) {
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = via ? d(from, via) + d(via, to) : d(from, to);
  return Math.max(0.35, len / speed);
}
const right = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];
const fwd2 = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];

// 5v5 buy phase: only set-up, healing and movement abilities work behind the barrier (as in Valorant);
// anything that flashes, damages, reveals, smokes, teleports or is an ultimate waits for the round to start.
const BUY_PHASE_OK = {
  zephyr: 'qe', blitz: 'q', volt: 'e', bastion: 'cqe', lattice: 'cqe', regent: 'ce', solace: 'ce', granite: 'c',
  fawn: 'c', stella: 'e', thistle: '', vanta: 'e', lumen: 'q',
};
export const buyPhaseAllows = (agentId, k) => (BUY_PHASE_OK[agentId] || '').includes(k);

// The point just beyond the first wall ahead (within `maxWall` m), `beyond` metres past its far side.
function throughWall(o, maxWall = 8, beyond = 2.5) {
  const g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, 0);
  const hits = g.world.raycastAll(eye, d, maxWall + 6).filter(h => !h.box.floor);
  if (!hits.length || hits[0].tIn > maxWall) return null;
  const t = hits[0].tOut + beyond;
  const p = [eye[0] + d[0] * t, eye[1], eye[2] + d[2] * t];
  const f = g.world.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 20);
  if (f) p[1] = p[1] + 0.5 - f.t;
  return p;
}

// Toggleable gas (Venom): a group of gas clouds that can be switched on and off while there is fuel.
function gasOn(kit, gr) {
  const g = kit.owner.game;
  if (gr.active || kit.gas.fuel < 15) return false;
  gr.active = true;
  gr.items = [];
  for (const p of gr.points) {
    if (gr.slab) gr.items.push(g.addSmoke(kit.owner, [p[0], p[1] + SLAB.h / 2, p[2]], kit.now, { radius: 1, life: 999, color: 0x58c76a, kind: 'gas', slab: { dir: gr.slab, len: 1.8, th: SLAB.th, h: SLAB.h } }));
    else gr.items.push(g.addSmoke(kit.owner, [p[0], p[1] + 1.3, p[2]], kit.now, { radius: gr.r, life: 999, color: 0x58c76a, kind: 'gas' }));
    gr.items.push(g.addZone({ kind: 'fire', color: 0x58c76a, owner: kit.owner, pos: p, r: gr.r, life: 999, dps: 10, heal: 0, def: src('toxin', 'Toxin'), gas: true }, kit.now));
  }
  g.emit('ability', { who: kit.owner, type: 'gas' });
  return true;
}
function gasOff(kit, gr) {
  if (!gr.active) return;
  gr.active = false;
  for (const it of gr.items) it.until = kit.now;
  gr.items = [];
}

// Placed utility its owner can pick back up with F, by Valorant's rules: which key's charge comes back, after
// how long (in the buy phase it is always straight back), and what can only be picked up in the buy phase.
// Stars are recalled from anywhere you can look at them; everything else has to be within reach.
export const PICKUPS = {
  wire: { k: 'c', cd: 0 },             // Trapwire
  cam: { k: 'e', cd: 15 },             // Spycam
  cage: { k: 'q', buyOnly: true },     // Cyber Cage
  alarm: { k: 'q', cd: 20 },           // Alarmbot
  turret: { k: 'e', cd: 20 },          // Turret
  trademark: { k: 'c', cd: 30 },       // Trademark
  anchor: { k: 'e', cd: 0 },           // Rendezvous
  emitter: { k: 'q', buyOnly: true },  // Poison Cloud
  star: { star: true, cd: 25, far: true },
};

// Devices that shut off the moment their owner dies (see Kit.onDeath).
const DIES_WITH_OWNER = new Set(['alarm', 'turret', 'swarm', 'wire', 'cam', 'trademark', 'anchor', 'satchel', 'owl', 'tiger', 'sdrone']);

// The player's own device of `kind` closest to the crosshair (within 9 degrees), if any.
function lookAt(kit, kind, maxDeg = 9) {
  const o = kit.owner, e = o.eye(), f = dirFromAngles(o.yaw, o.pitch);
  let best = null, bestCos = Math.cos(maxDeg * DEG);
  for (const d of o.game.devices) {
    if (d.kind !== kind || d.owner !== o || d.removed) continue;
    const c = [d.pos[0], d.pos[1] + 0.3, d.pos[2]], dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2], dist = Math.hypot(dx, dy, dz);
    const cos = (f[0] * dx + f[1] * dy + f[2] * dz) / Math.max(dist, 0.01);
    if (cos > bestCos) { bestCos = cos; best = d; }
  }
  return best;
}

// The teammate (alive, or a body for revives) closest to the crosshair within range and in sight.
function allyInView(kit, { dead = false, range = 20, maxDeg = 12, enemy = false } = {}) { // enemy: an enemy instead
  const o = kit.owner, g = o.game, e = o.eye(), f = dirFromAngles(o.yaw, o.pitch);
  let best = null, bestCos = Math.cos(maxDeg * DEG);
  for (const c of g.combatants) {
    if (c === o || g.isEnemy(o, c) !== enemy || c.alive === dead) continue;
    const t = dead ? (c.deathPos ? [c.deathPos[0], c.deathPos[1] + 0.4, c.deathPos[2]] : null) : [c.pos[0], c.pos[1] + 1.1, c.pos[2]];
    if (!t) continue;
    const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2], dist = Math.hypot(dx, dy, dz);
    if (dist > range) continue;
    const cos = dist < 1.5 ? 1 : (f[0] * dx + f[1] * dy + f[2] * dz) / dist;
    if (cos > bestCos && g.canSee(e, t)) { bestCos = cos; best = c; }
  }
  return best;
}
// Bloom (Skye-style Regrowth): who it would heal right now.
export const BLOOM = { pool: 100, rate: 20, range: 18 };
export function bloomTargets(o) {
  const g = o.game, e = o.eye();
  return g.combatants.filter(c => c !== o && c.alive && !g.isEnemy(o, c) && c.hp < PLAYER.hp && Math.hypot(c.pos[0] - o.pos[0], c.pos[2] - o.pos[2]) < BLOOM.range && g.canSee(e, c.eye()));
}
// Heal a teammate over time (through their own kit's heal-over-time).
function healAlly(c, amount, time) {
  if (c.kit) c.kit.healOver(amount, time);
  else c.hp = Math.min(PLAYER.hp, c.hp + amount);
}

// Ability weapons live in their own 'ability' slot until their rounds run out.
function drawAbilityGun(kit, id) {
  const o = kit.owner;
  kit.armed = null;
  const gun = o.give(id);
  gun.reserve = 0;
  o.equip('ability', kit.now, true);
  return true;
}
function toggleAbilityGun(kit, id) {
  const o = kit.owner, gun = o.inv.ability;
  if (!gun || gun.def.id !== id) return false;
  if (o.slot === 'ability') o.equip(o.prevSlot && o.prevSlot !== 'ability' ? o.prevSlot : 'primary', kit.now) || o.equip('secondary', kit.now);
  else o.equip('ability', kit.now);
  return true;
}

// Where a placed smoke goes: along the aim, `kit.dist` metres out, straight through walls (or, with
// kit.stopAtWalls, in front of the first wall). Dropped onto the floor below, centred 2 m up.
function smokeTarget(kit, radius) {
  const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
  let t = kit.dist ?? 16;
  if (kit.stopAtWalls) { const hit = g.world.raycast(eye, d, t); if (hit) t = Math.max(1.5, hit.t - radius * 0.5); }
  const p = [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t];
  const top = Math.max(p[1], eye[1]) + 0.5; // aiming at the floor can put the point underground
  const f = g.world.raycast([p[0], top, p[2]], [0, -1, 0], 60);
  p[1] = f ? top - f.t + 2.0 : 2.0;
  return p;
}

// ---------- the roster ----------
export const AGENTS = {
  zephyr: {
    name: 'Zephyr', role: 'Duelist', color: '#7fe3ff', emblem: 'wind',
    blurb: 'A wind-runner who wins fights by being where nobody expects. Dashes in, lifts out, and finishes with a storm of blades.',
    passive: { name: 'Drift', desc: 'Hold Space while falling to glide down slowly.' },
    abilities: {
      c: {
        name: 'Veil', desc: 'Throw a smoke orb that flies slowly where you look while you hold C; release C to burst it into a smoke (2.5 s).', charges: 2, cooldown: 16, instant: true,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          o.game.addDevice({ kind: 'cloud', owner: o, pos: [e[0] + d[0] * 0.6, e[1] + d[1] * 0.6, e[2] + d[2] * 0.6], dir: d, life: 2, speed: 7, key: 'abCHeld', radius: 3.35, smokeLife: 2.5, color: 0xcfdbe6 });
        },
      },
      q: {
        name: 'Lift', desc: 'After a short wind-up, launch yourself about 3.5 m straight up.', charges: 2, cooldown: 9, instant: true,
        use(kit) {
          const o = kit.owner;
          o.game.emit('ability', { who: o, type: 'windup' });
          mine(kit, 0.2, () => {
            o.vel[1] = LIFT_VELOCITY;
            o.grounded = false;
            o.airCap = Math.max(o.horizSpeed(), 1.5);
            o.game.emit('ability', { who: o, type: 'lift' });
          });
        },
      },
      e: {
        name: 'Slipstream', desc: 'Press to gather the wind (1 s); press again within 7.5 s to dash ~11 m the way you are moving. Unused, the charge is lost. In 5v5 it comes back after two kills.', charges: 1, cooldown: 12, instant: true, recharge: 'kills',
        use(kit) {
          kit.tailwind = { readyAt: kit.now + 1, until: kit.now + 7.5 };
          kit.owner.game.emit('ability', { who: kit.owner, type: 'windup' });
        },
        reuse(kit) {
          if (!kit.tailwind) return false;
          if (kit.now < kit.tailwind.readyAt) return true; // still gathering
          const o = kit.owner, inp = o.input;
          let dx, dz;
          const len = Math.hypot(inp.fwd, inp.side), sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
          if (len > 0) { dx = (-sy * inp.fwd + cy * inp.side) / len; dz = (-cy * inp.fwd - sy * inp.side) / len; }
          else { dx = -sy; dz = -cy; }
          o.dash = { until: kit.now + DASH.time, dir: [dx, dz] };
          kit.tailwind = null;
          kit.lastUse.e = kit.now;
          o.game.emit('ability', { who: o, type: 'dash' });
          return true;
        },
      },
      x: {
        name: 'Edgestorm', desc: 'Draw five throwing blades: left click throws one (150 head / 50 body), right click fans out all of them. Each kill refills the set.', points: 8,
        use(kit) {
          kit.blades = { left: BLADES.count, next: kit.now + 1.0 }; // 1 s to draw the blades
          kit.owner.gun.onHolster();
          kit.owner.game.emit('ability', { who: kit.owner, type: 'ult' });
        },
      },
    },
  },

  cinder: {
    name: 'Cinder', role: 'Duelist', color: '#ff7a3d', emblem: 'flame',
    blurb: 'A self-sufficient brawler. His fire burns enemies and heals him, and death is only a setback.',
    passive: { name: 'Kindled', desc: 'Your own fire heals you instead of hurting you.' },
    abilities: {
      c: {
        name: 'Firebreak', desc: 'Send out a wall of flame that grows forward (8 m/s, up to 15 m). Hold C and turn to bend it. It blocks sight for 8 s, burns enemies (30/s) and heals you (12.5/s).', charges: 1, cooldown: 25, instant: true,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'blaze', owner: o, pos: [o.pos[0] + f[0] * 1.2, o.pos[1], o.pos[2] + f[1] * 1.2], yaw: o.yaw, life: 3.5, speed: 16, travelled: 0, nextSeg: 0, key: 'abCHeld' });
          o.game.emit('ability', { who: o, type: 'fire' });
        },
      },
      q: {
        item: 'grenade', name: 'Ember', desc: 'Hold a fireball, then left click to lob it. It leaves a 3.5 m pool of fire for 4 s (60/s to enemies; heals you).', charges: 1, cooldown: 18,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          const ft3 = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft3, color: 0xff7a2e });
          later(kit, ft3, () => o.game.addZone({ kind: 'fire', owner: o, pos, r: 3.5, life: 4, dps: 60, heal: 12.5, def: src('ember', 'Ember') }, kit.now));
        },
      },
      e: {
        item: 'flash', name: 'Sunflare', desc: 'Hold a flare in your hand (no gun), then left click to curve it left or right click to curve it right. It bursts around the corner, blinding anyone facing it for up to 1.5 s. In 5v5 one is free each round and two kills bring a used one back.', charges: 2, cooldown: 14, recharge: 'kills',
        arm: true, armHint: 'LEFT CLICK: CURVE LEFT · RIGHT CLICK: CURVE RIGHT',
        use(kit, mode) {
          const o = kit.owner, g = o.game, eye = o.eye();
          const f = fwd2(o.yaw), r = right(o.yaw), side = mode === 'right' ? 1 : -1;
          const mid = [eye[0] + f[0] * 3, eye[1] + 0.2, eye[2] + f[1] * 3];
          let pop = [mid[0] + r[0] * side * 3.2, mid[1], mid[2] + r[1] * side * 3.2];
          if (!g.world.lineOfSight(eye, mid)) pop = aimPoint(o, 3, { back: 0.5 });
          else if (!g.world.lineOfSight(mid, pop)) pop = mid;
          const ft2 = flight(eye, pop, 11, mid);
          g.emit('throw', { who: o, from: eye, via: mid, to: pop, time: ft2, color: 0xffc061 });
          later(kit, ft2, () => g.flash(o, pop, 1.5));
        },
      },
      x: {
        name: 'Rekindle', desc: 'Mark where you stand. For 10 s you can fight freely: if you die, or when time runs out, you return to the mark at full health. The death does not count.', points: 7,
        use(kit) {
          const o = kit.owner;
          kit.rebirth = { pos: [...o.pos], yaw: o.yaw, pitch: o.pitch, until: kit.now + 10, armor: o.armor };
          o.game.emit('ability', { who: o, type: 'rebirth', pos: [...o.pos], kit });
        },
      },
    },
  },

  umbra: {
    name: 'Umbra', role: 'Controller', color: '#a67bff', emblem: 'moon',
    blurb: 'Commands the dark from a distance: long-range smokes, a blinding wave, and he can step out of the shadows anywhere on the map.',
    abilities: {
      c: {
        name: 'Rift', desc: 'Hold it: a marker shows where you will land (up to 15 m) and follows your aim. Left click to go; 0.7 s later you step through the shadows to it.', charges: 2, cooldown: 25,
        preview(kit) { return landing(kit.owner, 15); },
        use(kit) {
          const o = kit.owner, pos = target(kit, this);
          if (!pos) return false;
          o.game.emit('ability', { who: o, type: 'step', pos });
          mine(kit, 0.7, () => o.game.teleportNear(o, pos));
        },
      },
      q: {
        name: 'Dread', desc: 'Send a wave of shadow straight ahead (25 m) that passes through walls, nearsighting and deafening every enemy it touches for 2 s.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const end = [eye[0] + d[0] * 25, eye[1] + d[1] * 25, eye[2] + d[2] * 25];
          const ft4 = flight(eye, end, 20);
          g.emit('throw', { who: o, from: eye, to: end, time: ft4, color: 0x7a4dff, wave: true });
          later(kit, ft4 + -0.3, () => g.lineEffect(o, eye, end, 4.3, 'near+deaf', 2));
        },
      },
      e: {
        name: 'Shade', desc: 'Hold the orb: your view follows the smoke out through walls, and the sphere shows exactly where it will form. It passes through walls: hold right click to push it farther (up to 80 m), press R to make it stop at the first wall instead, left click to cast. Lasts 15 s.', charges: 2, cooldown: 40,
        armHint: 'LEFT CLICK: CAST · HOLD RIGHT CLICK: FARTHER · R: STOP AT WALLS', shadowSight: true,
        smokePreview: 4.1, distance: { min: 4, max: 80, start: 16, speed: 22 },
        preview(kit) { return smokeTarget(kit, 4.1); },
        use(kit) {
          const o = kit.owner, pos = [...target(kit, this)];
          o.game.emit('throw', { who: o, from: [pos[0], pos[1] + 14, pos[2]], to: pos, time: 0.4, color: 0xa67bff });
          later(kit, 0.4, () => o.game.addSmoke(o, pos, kit.now, { radius: 4.1, life: 15, color: 0x5b3f8f }));
        },
      },
      x: {
        name: 'Nightwalk', desc: 'Open the map and click anywhere. You fade out (untouchable) while a shade of you forms there; after 4 s you step out of it. Enemies who shoot the shade first cancel it and you stay where you were.', points: 7,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'NIGHTWALK', hint: 'Click a spot to teleport there · Right click or X to cancel', max: 1, color: '#a67bff',
            valid: (p) => o.game.canStand(o, p),
            confirm: (picks) => kit.chooseShadow(picks[0]),
          };
          return 'pending'; // points are spent when a destination is chosen
        },
      },
    },
  },

  hawke: {
    name: 'Hawke', role: 'Initiator', color: '#6ab7ff', emblem: 'eye',
    blurb: 'A tracker who knows where you are before you do. Scouts with his drone and bolts, then shoots through the walls.',
    abilities: {
      c: {
        name: 'Kestrel', desc: 'Hold the drone, left click to launch it. Fly it with WASD and your mouse for up to 7 s while your body stands exposed (damage to your body ends it). Left click fires a tracking dart (every 5 s): an enemy it hits is revealed in two pings.', charges: 1, cooldown: 40, item: 'device',
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          kit.pilot = o.game.addDevice({ kind: 'owl', owner: o, pos: [e[0] + d[0] * 0.8, e[1] + 0.3, e[2] + d[2] * 0.8], dir: d, life: 7, fly: true, dartReady: kit.now + 0.4 });
        },
      },
      q: {
        name: 'Arc Dart', desc: 'Draw the bow. Hold left click to charge (longer = farther, up to 50 m), release to fire. The dart explodes where it lands, up to 75 damage within 4 m.', charges: 2, cooldown: 25, item: 'bow', charge: 1.2,
        use(kit, mode) {
          const o = kit.owner, pos = aimPoint(o, 12 + 38 * (kit.power ?? 1), { back: 0.3, bodies: true });
          const ft5 = flight(o.eye(), pos, 30);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft5, color: 0x6ab7ff });
          later(kit, ft5 + 0.05, () => o.game.explode(o, pos, 4, 75, 1, src('arcdart', 'Arc Dart'), 0x6ab7ff, false, false, 1.5)); // full damage within 1.5 m
        },
      },
      e: {
        name: 'Sonar Bolt', desc: 'Draw the bow. Hold left click to charge (up to 60 m), release to fire. The bolt pulses twice, 1 s apart, revealing every enemy in its line of sight within 30 m.', charges: 1, cooldown: 50, item: 'bow', charge: 1.2,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 15 + 45 * (kit.power ?? 1), { back: 0.2 });
          const ft6 = flight(o.eye(), pos, 30);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft6, color: 0x6ab7ff });
          later(kit, ft6 + 0.1, () => o.game.pulse(o, pos, 30, 'reveal', 2.5, 0x6ab7ff, true));
          later(kit, ft6 + 1.1, () => o.game.pulse(o, pos, 30, 'reveal', 2.5, 0x6ab7ff, true)); // two scans 1 s apart
        },
      },
      x: {
        name: 'Talon Strike', desc: 'Fire up to three map-wide energy beams within 6 s. They go through every wall, dealing 80 damage and revealing whoever they hit.', points: 8,
        use(kit) {
          kit.beams = { left: BEAMS.count, until: kit.now + BEAMS.time, next: kit.now + 0.5 };
          kit.owner.game.emit('ability', { who: kit.owner, type: 'ult' });
        },
      },
    },
  },

  bastion: {
    name: 'Bastion', role: 'Sentinel', color: '#4fd1a5', emblem: 'shield',
    blurb: 'An inventor who holds ground with machines: hidden swarm grenades, a hunting alarm bot, an automatic turret and a lockdown nobody walks out of.',
    abilities: {
      c: {
        item: 'grenade', name: 'Hive', desc: 'Throw a hidden swarm grenade (15 m). Once both are out — or you have none left — press C again to detonate them: after 1 s, 45/s for 5 s in a 3 m radius.', charges: 2, cooldown: 40,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 15, { floor: true, back: 0.4 });
          const ft7 = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft7, color: 0x4fd1a5 });
          later(kit, ft7, () => o.game.addDevice({ kind: 'swarm', owner: o, pos, life: 90 }));
        },
        reuse(kit) {
          if (kit.charges.c > 0) return false;
          const g = kit.owner.game;
          const mine = g.devices.filter(d => d.kind === 'swarm' && d.owner === kit.owner && !d.removed);
          if (!mine.length) return false;
          for (const d of mine) {
            d.removed = true;
            g.addZone({ kind: 'fire', color: 0x9be15d, owner: kit.owner, pos: d.pos, r: 3, life: 6, armAt: kit.now + 1, dps: 45, heal: 0, def: src('hive', 'Hive') }, kit.now); // 1 s windup, then 5 s
          }
          g.emit('ability', { who: kit.owner, type: 'swarm' });
          return true;
        },
      },
      q: {
        item: 'device', name: 'Watchdog', desc: 'Deploy an alarm bot (10 m). When an enemy comes within 6 m it chases them down and makes them Vulnerable (double damage taken) and revealed for 4 s.', charges: 1, cooldown: 40,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 10, { floor: true, back: 0.4 });
          o.game.addDevice({ kind: 'alarm', owner: o, pos, life: 90, armAt: kit.now + 1 });
        },
      },
      e: {
        item: 'device', name: 'Sentry', desc: 'Deploy a turret (10 m) facing where you aim. It shoots enemies in its 180° view (7 damage a shot) until it is destroyed (60 s to get it back) or picked up (20 s). Placing a new one takes the old one down.', charges: 1, cooldown: 60,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 10, { floor: true, back: 0.5 });
          for (const d of o.game.devices) if (d.kind === 'turret' && d.owner === o) d.removed = true; // one turret at a time
          o.game.addDevice({ kind: 'turret', owner: o, pos, yaw: o.yaw, aimYaw: o.yaw, life: 1e5, next: kit.now + 0.8 });
        },
      },
      x: {
        name: 'Clampdown', desc: 'Plant a device that charges for 13 s, then detains every enemy within 32.5 m for 8 s: they cannot fire and move 60% slower.', points: 9,
        use(kit) {
          const o = kit.owner;
          o.game.addZone({ kind: 'lockdown', owner: o, pos: [...o.pos], r: 32.5, life: 13.1, armAt: kit.now + 13, dur: 8, slow: 0.6 }, kit.now);
          o.game.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  blitz: {
    name: 'Blitz', role: 'Duelist', color: '#ffb547', emblem: 'blast',
    blurb: 'A demolitions fanatic. Launches herself with satchels, clears corners with bots and bombs, and ends fights with a rocket.',
    abilities: {
      c: {
        item: 'device', name: 'Boomer', desc: 'Deploy a bot that rolls forward and bounces off walls. It locks onto the first enemy in front of it and explodes for up to 80. It lasts 5 s.', charges: 1, cooldown: 35,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'boombot', owner: o, pos: [o.pos[0] + f[0] * 0.8, o.pos[1], o.pos[2] + f[1] * 0.8], dir: [f[0], 0, f[1]], life: 5 });
        },
      },
      q: {
        instant: true, item: 'device', name: 'Kicker', desc: 'Instantly throws a satchel that sticks where it lands (12 m) and lasts 5 s. Press Q again to blow it, even while it is still in the air: it launches anyone nearby, you included, and deals 20-50 (only 5-15 in its first 1.5 s).', charges: 2, cooldown: 12,
        use(kit) {
          // The satchel exists from the moment it leaves your hand, so it can be blown mid-air (satchel jumps).
          const o = kit.owner, from = o.eye(), pos = aimPoint(o, 12, { back: 0.3 });
          o.game.addDevice({ kind: 'satchel', owner: o, pos: [...from], life: 5, armAt: kit.now + 1.5, flight: { from, to: pos, time: flight(from, pos, 13) } });
        },
        reuse(kit) {
          const g = kit.owner.game;
          const mine = g.devices.filter(d => d.kind === 'satchel' && d.owner === kit.owner && !d.removed);
          if (!mine.length) return false;
          const d = mine[0], armed = kit.now >= d.armAt;
          d.removed = true;
          g.knockback(kit.owner, d.pos, 3.8, 16, 12.5);
          // 50 within 2 m, down to 20 at 5 m once armed; 15 down to 5 before that.
          g.explode(kit.owner, d.pos, 5, armed ? 50 : 15, armed ? 20 : 5, src('kicker', 'Kicker'), 0xffb547, false, false, 2);
          return true;
        },
      },
      e: {
        item: 'paintshell', name: 'Splatter', desc: 'Throw a cluster grenade (20 m): it explodes for 55, then scatters four bomblets that explode for 55 each. In 5v5 it comes back after two kills.', charges: 1, cooldown: 30, recharge: 'kills',
        use(kit) {
          const o = kit.owner, g = o.game, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          pos[1] += 0.2;
          const ft9 = flight(o.eye(), pos, 13);
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: ft9, color: 0xffb547, model: 'paintshell', stay: Math.max(ft9, 2.25) });
          later(kit, Math.max(ft9, 2.25), () => { // goes off 2.25 s after the throw
            g.explode(o, pos, 5.5, 55, 15, src('splatter', 'Splatter'), 0xffb547);
            for (let i = 0; i < 4; i++) {
              const a = i * Math.PI / 2 + Math.random() * 0.8, dd = 1.5 + Math.random() * 1.8;
              const p = [pos[0] + Math.cos(a) * dd, pos[1], pos[2] + Math.sin(a) * dd];
              const ft10 = flight(pos, p, 13);
              g.emit('throw', { who: o, from: pos, to: p, time: ft10, color: 0xff7ab8, model: 'bomblet', stay: 0.667 + i * 0.05 });
              later(kit, 0.667 + i * 0.05, () => g.explode(o, p, 5.25, 55, 1, src('splatter', 'Splatter'), 0xff7ab8)); // bomblets 0.67 s later
            }
          });
        },
      },
      x: {
        name: 'Finale', desc: 'Pull out a rocket launcher and left click to fire one rocket within 10 s: 150 damage within 4 m, falling to 30 at 7 m. It hurts you too, so don’t fire it at your feet.', points: 8,
        use(kit) {
          kit.launcher = { ready: kit.now + 1.4, until: kit.now + 10 }; // 1.4 s to draw it, 10 s to fire
          kit.owner.game.emit('ability', { who: kit.owner, type: 'ult' });
        },
      },
    },
  },

  granite: {
    name: 'Granite', role: 'Controller', color: '#e0844f', emblem: 'strike',
    blurb: 'An old commander who fights from the map: sky smokes and orbital fire wherever he points, a stim beacon for the push and an incendiary to hold it.',
    abilities: {
      c: {
        item: 'device', name: 'Rally', desc: 'Throw a beacon (10 m) that sets up a field for 12 s. You and teammates standing in it get 10% faster fire rate and 10% faster movement, lasting 4 s after you leave.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 10, { floor: true, back: 0.4 });
          o.game.addZone({ kind: 'stim', color: 0xffb547, owner: o, pos, r: 6, life: 12 }, kit.now);
        },
      },
      q: {
        item: 'grenade', name: 'Napalm', desc: 'Fire an incendiary grenade (20 m) that leaves a 4.5 m fire for 7 s (60/s).', charges: 1, cooldown: 25,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          const ft11 = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft11, color: 0xff6a1a });
          later(kit, ft11, () => o.game.addZone({ kind: 'fire', owner: o, pos, r: 4.5, life: 7, dps: 60, heal: 0, burnsOwner: true, def: src('napalm', 'Napalm') }, kit.now));
        },
      },
      e: {
        instant: true, name: 'Overcast', desc: 'Open the map and click up to three spots (one per charge) for sky smokes; press E again to call them in. Each lasts 19.25 s.', charges: 3, cooldown: 35, recharge: 'none',
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'e', title: 'OVERCAST', hint: 'Click up to ' + kit.charges.e + ' spots · E or right click to call them in', max: kit.charges.e, color: '#e0844f', radius: 4.15, range: 55,
            confirm: (picks) => {
              for (const p of picks) {
                kit.charges.e--;
                if (!kit.ready.e) kit.ready.e = kit.now + this.cooldown;
                o.game.emit('throw', { who: o, from: [p[0], p[1] + 30, p[2]], to: [p[0], p[1] + 2, p[2]], time: 0.8, color: 0xe0844f });
                later(kit, 0.8, () => o.game.addSmoke(o, [p[0], p[1] + 2, p[2]], kit.now, { radius: 4.15, life: 19.25, color: 0x9a8f86 }));
              }
              kit.lastUse.e = kit.now;
            },
          };
          return 'pending';
        },
      },
      x: {
        name: 'Sky Hammer', desc: 'Open the map and click a spot: after 2 s an 8 m orbital strike burns it for 4 s (125/s).', points: 8,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'SKY HAMMER', hint: 'Click a spot to strike · Right click or X to cancel', max: 1, color: '#ff4655', radius: 8,
            confirm: (picks) => {
              kit.ultPoints = 0;
              kit.lastUse.x = kit.now;
              o.game.addZone({ kind: 'fire', color: 0xff3344, orbital: true, owner: o, pos: picks[0], r: 8, life: 6, armAt: kit.now + 2, dps: 125, heal: 0, burnsOwner: true, def: src('skyhammer', 'Sky Hammer') }, kit.now);
              o.game.emit('ability', { who: o, type: 'ult' });
            },
          };
          return 'pending';
        },
      },
    },
  },

  venom: {
    name: 'Venom', role: 'Controller', color: '#58c76a', emblem: 'snake',
    blurb: 'A chemist who drowns the map in toxin. Her gas runs on fuel: switch it on to block sight, off to save fuel.',
    passive: { name: 'Fuel', desc: 'Gas drains fuel while on and refills while everything is off. Toxin decays enemies inside it.' },
    abilities: {
      c: {
        item: 'grenade', name: 'Acid Vial', desc: 'Throw a vial (20 m) that leaves a pool of acid for 6.5 s: 12.5/s and Vulnerable (double damage, so 25/s) while standing in it.', charges: 2, cooldown: 25,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          const ft12 = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft12, color: 0x9be15d });
          later(kit, ft12, () => o.game.addZone({ kind: 'fire', color: 0x9be15d, acid: true, owner: o, pos, r: 3.5, life: 6.5, dps: 12.5, heal: 0, burnsOwner: true, def: src('acid', 'Acid Vial') }, kit.now));
        },
      },
      q: {
        item: 'device', name: 'Miasma', desc: 'Throw a gas emitter (12 m). It releases a toxic cloud; press Q again to switch the cloud off and on (uses fuel).', charges: 1, cooldown: 0,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 12, { floor: true, back: 0.6 });
          const gr = { points: [pos], r: 4.5, active: false, items: [] };
          kit.gas.groups.cloud = gr;
          o.game.addDevice({ kind: 'emitter', owner: o, pos, life: 99999 });
          const ft13 = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft13, color: 0x58c76a });
          later(kit, ft13, () => gasOn(kit, gr));
        },
        reuse(kit) {
          const gr = kit.gas.groups.cloud;
          if (!gr) return false;
          if (gr.active) gasOff(kit, gr); else gasOn(kit, gr);
          return true;
        },
      },
      e: {
        name: 'Toxic Wall', desc: 'Raise a 40 m wall of toxic gas straight ahead, through walls. Press E again to switch it off and on (uses fuel).', charges: 1, cooldown: 0, recharge: 'none',
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), pts = [];
          for (let d = 1.5; d <= 40; d += 1.7) {
            const x = o.pos[0] + f[0] * d, z = o.pos[2] + f[1] * d;
            const fl = g.floorAt(x, z);
            if (fl && fl[1] < o.pos[1] + 3) pts.push(fl);
          }
          const gr = { points: pts, r: 0.6, active: false, items: [], slab: f };
          kit.gas.groups.wall = gr;
          gasOn(kit, gr);
        },
        reuse(kit) {
          const gr = kit.gas.groups.wall;
          if (!gr) return false;
          if (gr.active) gasOff(kit, gr); else gasOn(kit, gr);
          return true;
        },
      },
      x: {
        name: 'Nest', desc: 'Flood the area around you with a huge toxic cloud. It lasts as long as you stay inside it, and 8 s after you leave. Enemies inside are nearsighted and decaying; you can see through it and enemies inside are outlined for you.', points: 9,
        use(kit) {
          const o = kit.owner, g = o.game, p = [...o.pos];
          kit.nest = g.addSmoke(o, [p[0], p[1] + 2, p[2]], kit.now, { radius: 9, life: 8, color: 0x3f9a50, kind: 'gas', nest: true });
          kit.nestZone = g.addZone({ kind: 'fire', color: 0x58c76a, owner: o, pos: p, r: 9, life: 8, dps: 10, heal: 0, nearsight: true, def: src('nest', 'Nest') }, kit.now);
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  vex: {
    name: 'Vex', role: 'Duelist', color: '#d65cff', emblem: 'soul',
    blurb: 'Feeds on the fight. Every kill leaves a soul orb she can Devour to heal or Dismiss to vanish, and her ultimate turns her into a frenzy.',
    passive: { name: 'Soul Harvest', desc: 'Enemies you kill drop a soul orb for 3 s.' },
    abilities: {
      c: {
        name: 'Glare', desc: 'Hold the eye: a marker shows where it will go, 12 m straight ahead, through walls. Left click to cast it. Every enemy who looks at it is nearsighted. The eye lasts 2 s.', charges: 2, cooldown: 20,
        smokePreview: 0.45,
        preview(kit) { return glareSpot(kit.owner); },
        use(kit) {
          const o = kit.owner, pos = [...target(kit, this)];
          const ft14 = flight(o.eye(), pos, 16);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft14, color: 0xd65cff, straight: true });
          later(kit, ft14, () => o.game.addDevice({ kind: 'leer', owner: o, pos, life: 2 }));
        },
      },
      q: {
        name: 'Feast', desc: 'Press Q to consume your nearest soul orb, at any distance: heal 50 over 3 s (2.5 s in Ravenous). You can go above 100 HP; the extra stays 10 s, then fades (it stays for good in Ravenous). Shares its 2 charges with Vanish.', charges: 2, cooldown: 0, item: 'grab', instant: true,
        use(kit) {
          if (!kit.takeOrb()) return false;
          kit.grab = { until: kit.now + 0.35 };
          kit.healOver(50, kit.now < kit.empressUntil ? 2.5 : 3, 150);
          kit.owner.game.emit('ability', { who: kit.owner, type: 'heal' });
        },
      },
      e: {
        name: 'Vanish', desc: 'Press E to consume your nearest soul orb, at any distance: for 1.5 s you’re intangible (and invisible in Ravenous) and move much faster in any direction, but can’t use your gun. Uses Feast’s charges.', charges: 2, cooldown: 0, item: 'grab', instant: true, shares: 'q',
        use(kit) {
          if (!kit.takeOrb()) return false;
          const o = kit.owner;
          kit.grab = { until: kit.now + 0.35 };
          o.st.intangibleUntil = kit.vanishUntil = kit.now + 1.5; // intangible also keeps the gun down
          if (kit.now < kit.empressUntil) o.st.hiddenUntil = kit.now + 1.5;
          o.game.emit('ability', { who: o, type: 'dismiss' });
        },
      },
      x: {
        name: 'Ravenous', desc: 'Enter a frenzy for 30 s: 15% faster fire rate, equip and reload, and every kill heals you 100 and resets the timer.', points: 7,
        use(kit) {
          kit.empressUntil = kit.now + 30;
          kit.owner.game.emit('ability', { who: kit.owner, type: 'ult' });
        },
      },
    },
  },

  quake: {
    name: 'Quake', role: 'Initiator', color: '#f28c38', emblem: 'quake',
    blurb: 'Breaks positions open from the other side of the wall: blasts, flashes and shockwaves that go straight through cover.',
    abilities: {
      c: {
        name: 'Rubble', desc: 'Set a charge on the wall in front of you (8 m): two bursts on the far side, 80 damage each.', charges: 1, cooldown: 25,
        use(kit) {
          const o = kit.owner, g = o.game, p = throughWall(o, 8, 2.2);
          if (!p) return false;
          g.emit('throw', { who: o, from: o.eye(), to: p, time: 0.3, color: 0xf28c38, wave: true });
          for (const t of [1.9, 2.5]) later(kit, t, () => g.explode(o, [p[0], p[1] + 0.6, p[2]], 3, 80, 80, src('rubble', 'Rubble'), 0xf28c38, false, true));
        },
      },
      q: {
        name: 'Glimmer', desc: 'Fire a flash through the wall in front of you (8 m). It bursts on the far side after 0.5 s, blinding for 2.25 s.', charges: 2, cooldown: 18,
        use(kit) {
          const o = kit.owner, g = o.game, p = throughWall(o, 8, 2.5);
          if (!p) return false;
          p[1] += 1.4;
          g.emit('throw', { who: o, from: o.eye(), to: p, time: 0.5, color: 0xffd28a, wave: true });
          later(kit, 0.5, () => g.flash(o, p, 2.25));
        },
      },
      e: {
        name: 'Fissure', desc: 'Hold left click to charge the distance (8 m up to 40 m, shown on the ground), release to send a seismic line through walls. Everyone it reaches is stunned for 2.5 s.', charges: 1, cooldown: 50, item: 'orb', charge: 1.5,
        preview(kit) { const o = kit.owner, f = fwd2(o.yaw), d = 8 + 32 * (kit.power ?? 0); return [o.pos[0] + f[0] * d, o.pos[1], o.pos[2] + f[1] * d]; },
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), len = 8 + 32 * (kit.power ?? 1);
          const a = [o.pos[0], o.pos[1] + 1, o.pos[2]], b = [a[0] + f[0] * len, a[1], a[2] + f[1] * len];
          g.emit('quakeLine', { from: a, to: b, width: 2.2 });
          later(kit, 1.1, () => g.lineEffect(o, a, b, 4, 'stun', 2.5)); // 1.1 s windup, 8 m wide
        },
      },
      x: {
        name: 'Aftershock Wave', desc: 'Unleash a huge 32 m cone of seismic force through every wall: enemies in it are knocked up and stunned for 4 s.', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game;
          g.emit('quakeLine', { from: [o.pos[0], o.pos[1] + 1, o.pos[2]], yaw: o.yaw, cone: true });
          later(kit, 1.2, () => g.cone(o, 32, 15.7 * DEG, (c) => { c.st.stunUntil = kit.now + 4; c.st.slowUntil = kit.now + 4; c.st.slowAmt = 0.4; c.vel[1] = 6; c.grounded = false; }));
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  volt: {
    name: 'Volt', role: 'Duelist', color: '#3fb8ff', emblem: 'bolt',
    blurb: 'Pure speed. Sprints through lanes of her own static, slides into fights and finishes them with a lightning beam.',
    passive: { name: 'Energy', desc: 'High Gear runs on energy, which drains while sprinting and slowly refills.' },
    abilities: {
      c: {
        instant: true, name: 'Static Lanes', desc: 'Instantly fire two parallel walls of static 45 m straight ahead, through walls. They block sight for 4 s.', charges: 1, cooldown: 25,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), r = right(o.yaw);
          for (const side of [-1.8, 1.8]) {
            for (let d = 1.5; d <= 45; d += 1.6) {
              const x = o.pos[0] + f[0] * d + r[0] * side, z = o.pos[2] + f[1] * d + r[1] * side;
              const fl = g.floorAt(x, z);
              if (fl && fl[1] < o.pos[1] + 3) g.addSmoke(o, [fl[0], fl[1] + SLAB.h / 2, fl[2]], kit.now + d * 0.01, { radius: 1, life: 4, color: 0x3fb8ff, kind: 'lane', slab: { dir: f, len: 1.7, th: SLAB.th, h: SLAB.h } });
            }
          }
          g.emit('ability', { who: o, type: 'lane' });
        },
      },
      q: {
        instant: true, name: 'Ricochet', desc: 'Instantly throw a bolt that bounces off the first wall (25 m) and lands. After 1 s it shocks everyone within 5 m: stunned for 3.5 s.', charges: 2, cooldown: 25,
        use(kit) {
          let ftR;
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const hit = g.world.raycast(eye, d, 25);
          let pos;
          if (hit && !hit.box.floor) {
            const p = [eye[0] + d[0] * (hit.t - 0.1), eye[1] + d[1] * (hit.t - 0.1), eye[2] + d[2] * (hit.t - 0.1)], n = hit.n;
            const dot = d[0] * n[0] + d[1] * n[1] + d[2] * n[2], rd = [d[0] - 2 * dot * n[0], d[1] - 2 * dot * n[1], d[2] - 2 * dot * n[2]];
            const h2 = g.world.raycast(p, rd, 10);
            const t2 = h2 ? Math.max(0.2, h2.t - 0.4) : 10;
            pos = [p[0] + rd[0] * t2, p[1] + rd[1] * t2, p[2] + rd[2] * t2];
            ftR = flight(eye, pos, 11, p);
            g.emit('throw', { who: o, from: eye, via: p, to: pos, time: ftR, color: 0x3fb8ff });
          } else {
            pos = aimPoint(o, 25, { back: 0.4 });
            ftR = flight(eye, pos, 11);
            g.emit('throw', { who: o, from: eye, to: pos, time: ftR, color: 0x3fb8ff });
          }
          const f = g.floorAt(pos[0], pos[2]);
          if (f && f[1] <= pos[1] + 0.5) pos[1] = f[1] + 0.3;
          later(kit, ftR + 1.0, () => g.pulse(o, pos, 5, 'stun', 3.5, 0x3fb8ff));
        },
      },
      e: {
        name: 'Overclock', desc: 'Put your gun away and sprint (9 m/s) while energy lasts; press E again to stop. Crouch or right click mid-sprint to slide forward: the slide ends the sprint and your gun comes back out (one slide per round in 5v5, back after two kills; one every 8 s in deathmatch).', charges: 1, cooldown: 0, instant: true,
        use(kit) {
          if (kit.energy < 10) return false;
          kit.highGear = { slideAt: kit.slideAt || 0 };
          kit.owner.gun.onHolster();
          kit.owner.game.emit('ability', { who: kit.owner, type: 'windup' });
        },
        reuse(kit) {
          if (!kit.highGear) return false;
          kit.highGear = null;
          if (!kit.overdrive) kit.owner.equip(kit.owner.slot, kit.now, true); // gun back out (in Overload the beam stays up)
          return true;
        },
      },
      x: {
        name: 'Overload', desc: 'Fire a lightning beam from your fingertip: hold left click (27 body / 54 head, accurate while running and sliding). Starts your sprint with full energy and a fresh slide. Overload runs on its own meter (20 s); kills refill it and give your slide back.', points: 8,
        use(kit) {
          const o = kit.owner;
          kit.overdrive = { fuel: 100, next: kit.now + 0.4 };
          kit.energy = 100;
          kit.slideAt = 0;
          kit.highGear = { slideAt: 0 }; // straight into a sprint
          o.gun.onHolster();
          o.game.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  mirage: {
    name: 'Mirage', role: 'Duelist', color: '#5a6cff', emblem: 'mask',
    blurb: 'A trickster who fights from another dimension. Decoys, ricochet flashes and a rift to step through — or vanish entirely.',
    abilities: {
      c: {
        name: 'Double', desc: 'Send out a decoy of yourself that runs forward. The first enemy to look at it is blinded for 1.75 s.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'decoy', owner: o, pos: [o.pos[0] + f[0], o.pos[1], o.pos[2] + f[1]], dir: [f[0], 0, f[1]], life: 10, armAt: kit.now + 0.4 });
        },
      },
      q: {
        name: 'Rebound', desc: 'Throw a flash that bounces off the first wall (20 m) and bursts 0.5 s later, blinding anyone facing it for 1.5 s.', charges: 2, cooldown: 18,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const hit = g.world.raycast(eye, d, 20);
          if (!hit) return false;
          const p = [eye[0] + d[0] * (hit.t - 0.1), eye[1] + d[1] * (hit.t - 0.1), eye[2] + d[2] * (hit.t - 0.1)], n = hit.n;
          const dot = d[0] * n[0] + d[1] * n[1] + d[2] * n[2], rd = [d[0] - 2 * dot * n[0], d[1] - 2 * dot * n[1], d[2] - 2 * dot * n[2]];
          const h2 = g.world.raycast(p, rd, 2.5), t2 = h2 ? Math.max(0.2, h2.t - 0.3) : 2.5;
          const pop = [p[0] + rd[0] * t2, p[1] + rd[1] * t2 + 0.3, p[2] + rd[2] * t2];
          const ft17 = flight(eye, pop, 11, p);
          g.emit('throw', { who: o, from: eye, via: p, to: pop, time: ft17, color: 0x8f9bff });
          later(kit, ft17, () => g.flash(o, pop, 1.5));
        },
      },
      e: {
        name: 'Riftwalk', desc: 'Hold the rift: left click sends it crawling forward along the ground, right click leaves it where you stand. Press E again any time in the next 20 s to teleport to it. Enemies can shoot it.', charges: 1, cooldown: 30,
        armHint: 'LEFT CLICK: SEND IT · RIGHT CLICK: LEAVE IT HERE',
        use(kit, mode) {
          const o = kit.owner, f = fwd2(o.yaw), still = mode === 'right';
          const pos = still ? [...o.pos] : [o.pos[0] + f[0] * 0.8, o.pos[1], o.pos[2] + f[1] * 0.8];
          kit.gate = o.game.addDevice({ kind: 'gate', owner: o, pos, dir: [f[0], 0, f[1]], life: 20, still });
        },
        reuse(kit) {
          const gt = kit.gate;
          if (!gt || gt.removed) { kit.gate = null; return false; }
          const o = kit.owner;
          kit.gate = null;
          gt.removed = true;
          o.game.emit('ability', { who: o, type: 'step', pos: gt.pos });
          mine(kit, 0.4, () => o.game.teleportNear(o, [...gt.pos]));
          return true;
        },
      },
      x: {
        name: 'Phase Out', desc: 'Slip into another dimension for 10 s: enemies can’t see or hurt you, but you can’t shoot. Press X to come back early.', points: 8,
        use(kit) {
          const o = kit.owner;
          kit.drift = { until: kit.now + 10 };
          o.st.hiddenUntil = o.st.intangibleUntil = kit.now + 10;
          o.game.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  fawn: {
    name: 'Fawn', role: 'Initiator', color: '#9be15d', emblem: 'leaf',
    blurb: 'A ranger who scouts with her animals: a tiger you pilot, a hawk that bursts into light, and seekers that hunt the closest enemies.',
    abilities: {
      c: {
        name: 'Bloom', desc: 'Hold C to channel: every hurt teammate you can see within 18 m heals 20 HP/s. One charge holds a 100 HP pool — let go to stop, hold C again to keep spending it. You cannot shoot while channelling, and it cannot heal you.', charges: 1, cooldown: 25, instant: true,
        use(kit) {
          kit.regrow = { pool: BLOOM.pool, on: true, botUntil: kit.now + 4 };
          kit.owner.game.emit('ability', { who: kit.owner, type: 'heal' });
        },
        reuse(kit) {
          const r = kit.regrow;
          if (!r || r.pool <= 0 || r.on) return false;
          r.on = true; r.botUntil = kit.now + 4;
          return true;
        },
      },
      q: {
        name: 'Stalker', desc: 'Hold the tiger, left click to send it. You see through its eyes and steer with the mouse for up to 6 s. It pounces on the first enemy it gets near (or when time runs out) and dies; anyone within 4 m of the pounce takes 30 and is stunned for 3 s.', charges: 1, cooldown: 40,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          kit.pilot = o.game.addDevice({ kind: 'tiger', owner: o, pos: [o.pos[0] + f[0], o.pos[1], o.pos[2] + f[1]], dir: [f[0], 0, f[1]], life: 6, steer: true });
        },
      },
      e: {
        name: 'Lantern Hawk', desc: 'Hold the hawk, left click to release it; it flies slowly where you aim. Press E again to make it burst, blinding anyone facing it for 1 to 2.25 s, longer the farther it flew (it bursts on its own after 2 s).', charges: 2, cooldown: 60,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          kit.hawk = o.game.addDevice({ kind: 'hawk', owner: o, pos: [e[0] + d[0], e[1], e[2] + d[2]], dir: d, life: 2, steer: true, fly: true, speed: 9 });
        },
        reuse(kit) {
          const h = kit.hawk;
          if (!h || h.removed) { kit.hawk = null; return false; }
          h.removed = true;
          kit.hawk = null;
          const len = 1 + 1.25 * Math.min(1, (kit.now - h.born) / 1.5); // the longer it flew, the longer the blind (1-2.25 s)
          later(kit, 0.3, () => kit.owner.game.flash(kit.owner, [...h.pos], len));
          return true;
        },
      },
      x: {
        name: 'Hunters', desc: 'Release three seekers that track the three closest enemies, through walls. Each one that reaches its target nearsights them for 3 s.', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game;
          const targets = g.combatants.filter(c => c.alive && g.isEnemy(o, c)).sort((a, b) => Math.hypot(a.pos[0] - o.pos[0], a.pos[2] - o.pos[2]) - Math.hypot(b.pos[0] - o.pos[0], b.pos[2] - o.pos[2])).slice(0, 3);
          for (const t of targets) g.addDevice({ kind: 'seeker', owner: o, pos: o.eye(), target: t, life: 12 });
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  lattice: {
    name: 'Lattice', role: 'Sentinel', color: '#d8dde6', emblem: 'cam',
    blurb: 'An information broker. Wires, cages and a camera tell him everything — and his ultimate reads the minds of the fallen.',
    abilities: {
      c: {
        item: 'device', name: 'Tripline', desc: 'Hold the wire, aim at a wall (6 m) and left click to stretch it across the gap at that height. An enemy who crosses it is revealed, held and then stunned for 3 s.', charges: 2, cooldown: 30,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const hit = g.world.raycast(eye, d, 6);
          if (!hit || hit.box.floor || hit.n[1] !== 0) return false;
          const n = hit.n, a = [eye[0] + d[0] * hit.t + n[0] * 0.05, eye[1] + d[1] * hit.t, eye[2] + d[2] * hit.t + n[2] * 0.05];
          const fl = g.floorAt(a[0] + n[0] * 0.3, a[2] + n[2] * 0.3, a[1] + 0.5);
          if (fl) a[1] = Math.max(a[1], fl[1] + 0.1); // at the height you aim at, never inside the floor
          const h2 = g.world.raycast(a, [n[0], 0, n[2]], 12);
          if (!h2) return false;
          const b = [a[0] + n[0] * h2.t, a[1], a[2] + n[2] * h2.t];
          g.addDevice({ kind: 'wire', owner: o, pos: a, b, life: 120 });
        },
      },
      q: {
        item: 'device', name: 'Gridlock', desc: 'Hold a cage, left click to place it where you aim (15 m). To trigger one, look at it and press Q: it becomes a 7.25 s smoke. Each cage is triggered separately.', charges: 2, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 15, { floor: true, back: 0.4 });
          o.game.addDevice({ kind: 'cage', owner: o, pos, life: 300 });
        },
        reuse(kit) {
          // Look at one of your cages and press Q to set off that one.
          const o = kit.owner, g = o.game, e = o.eye(), f = dirFromAngles(o.yaw, o.pitch);
          let best = null, bestCos = Math.cos(9 * DEG);
          for (const d of g.devices) {
            if (d.kind !== 'cage' || d.owner !== o || d.removed) continue;
            const c = [d.pos[0], d.pos[1] + 0.1, d.pos[2]], dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2], dist = Math.hypot(dx, dy, dz);
            const cos = (f[0] * dx + f[1] * dy + f[2] * dz) / dist;
            if (cos > bestCos && dist < 80) { bestCos = cos; best = d; }
          }
          if (!best) return false;
          best.removed = true;
          g.addSmoke(o, [best.pos[0], best.pos[1] + 1.6, best.pos[2]], kit.now, { radius: 3.72, life: 7.25, color: 0xb9c3d1, kind: 'cage' });
          return true;
        },
      },
      e: {
        item: 'device', name: 'Watcher', desc: 'Hold the camera, left click to stick it on the surface you aim at (30 m). Press E again to look through it; enemies it sees are revealed, and left click fires a tracking dart (pings every 2 s for 8 s). E again to leave.', charges: 1, cooldown: 60,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const hit = g.world.raycast(eye, d, 30);
          if (!hit) return false;
          const pos = [eye[0] + d[0] * hit.t + hit.n[0] * 0.15, eye[1] + d[1] * hit.t + hit.n[1] * 0.15, eye[2] + d[2] * hit.t + hit.n[2] * 0.15];
          if (hit.box.floor) pos[1] += 0.3;
          kit.cam = g.addDevice({ kind: 'cam', owner: o, pos, life: 600, dartReady: 0 });
        },
        reuse(kit) {
          if (!kit.cam || kit.cam.removed) { kit.cam = null; return false; }
          kit.view = kit.view ? null : kit.cam;
          return true;
        },
      },
      x: {
        name: 'Mindread', desc: 'Look at an enemy’s body (12 m) and press X to read their mind: every living enemy is revealed twice, 2 s apart.', points: 7,
        use(kit) {
          if (!allyInView(kit, { dead: true, enemy: true, range: 12, maxDeg: 18 })) return false;
          const g = kit.owner.game;
          for (const t of [2, 4]) later(kit, t, () => g.revealAll(kit.owner, 2));
          g.emit('ability', { who: kit.owner, type: 'ult' });
        },
      },
    },
  },

  nyx: {
    name: 'Nyx', role: 'Initiator', color: '#b07a9a', emblem: 'claw',
    blurb: 'Hunts with nightmares. Her prowlers chase down whoever she’s looking at, her orb holds them in place, and her terror wave marks everyone it touches.',
    abilities: {
      c: {
        name: 'Hound', desc: 'Send a prowler that follows your crosshair for 2.5 s; it locks onto the first enemy it sees and nearsights them for 2.5 s.', charges: 2, cooldown: 25,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'prowler', owner: o, pos: [o.pos[0] + f[0], o.pos[1], o.pos[2] + f[1]], dir: [f[0], 0, f[1]], life: 2.5, steer: true });
        },
      },
      q: {
        name: 'Grasp', desc: 'Throw an orb (20 m) that bursts 0.6 s after landing: enemies within 6.6 m are held in place and deafened for 4.5 s and lose 75 health to Decay (never lethal).', charges: 1, cooldown: 25,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          const ft18 = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft18, color: 0xb07a9a });
          later(kit, ft18 + 0.6, () => { for (const c of o.game.pulse(o, [pos[0], pos[1] + 1, pos[2]], 6.58, 'hold+deaf', 4.5, 0xb07a9a)) o.game.decay(c, 75); });
        },
      },
      e: {
        name: 'Omen Eye', desc: 'Throw an eye (30 m) that drops and reveals every enemy in its line of sight within 30 m for 4 s.', charges: 1, cooldown: 50,
        use(kit) {
          const o = kit.owner, g = o.game, pos = aimPoint(o, 30, { back: 0.6 });
          const ft19 = flight(o.eye(), pos, 13);
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: ft19, color: 0xb07a9a });
          later(kit, ft19 + 0.2, () => { g.addDevice({ kind: 'haunt', owner: o, pos, life: 1.5 }); g.pulse(o, pos, 30, 'reveal', 4, 0xb07a9a, true); });
        },
      },
      x: {
        name: 'Terror', desc: 'Unleash a 40 m wave of nightmare through walls: everyone it hits is revealed and deafened for 8 s and decays (loses up to 75 health, never lethal).', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game;
          g.emit('quakeLine', { from: [o.pos[0], o.pos[1] + 1, o.pos[2]], yaw: o.yaw, cone: true, color: 0xb07a9a });
          later(kit, 0.8, () => g.cone(o, 40, 14 * DEG, (c) => { // 40 m long, 20 m wide
            c.st.revealUntil = kit.now + 8;
            c.st.deafUntil = kit.now + 8;
            const n = Math.min(75, c.hp + c.armor - 1);
            if (n > 0) g.damage(c, o, n, { part: 'body', def: src('terror', 'Terror'), dist: 0, point: c.eye(), wallbang: true, dot: true });
          }));
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  solace: {
    name: 'Solace', role: 'Sentinel', color: '#5fe6d0', emblem: 'crystal',
    blurb: 'A healer who shapes ice. Walls off a lane, slows a push, patches herself up — and refuses to stay down.',
    abilities: {
      c: {
        item: 'orb', name: 'Frost Wall', desc: 'Hold the crystal: a preview shows the wall where you aim (12 m). Right click rotates it, left click raises a solid ice wall (6 m × 2.6 m) that stops bullets for 40 s. You can stand on it — raise it under yourself to boost up.', charges: 1, cooldown: 40, rotate: true,
        preview(kit) { const o = kit.owner; return aimPoint(o, 12, { floor: true, back: 0.4, bodies: false }); },
        wallPreview: { half: 3, h: 2.6, th: 0.4 },
        use(kit) {
          const o = kit.owner, pos = target(kit, this);
          return o.game.addWall(o, pos, o.yaw + (kit.rot ? Math.PI / 2 : 0), 40, { half: 3, h: 2.6, th: 0.2, style: 'ice', lift: true });
        },
      },
      q: {
        item: 'orb', name: 'Chill', desc: 'Hold the orb, left click to throw it. It shatters into a 5 m field for 7 s that slows enemies by 50%.', charges: 2, cooldown: 25,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 25, { floor: true, back: 0.4 });
          const ft = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0x9ff3ff });
          later(kit, ft, () => o.game.addZone({ kind: 'slowfield', color: 0x9ff3ff, owner: o, pos, r: 5, life: 7, slowField: 0.5 }, kit.now));
        },
      },
      e: {
        item: 'orb', name: 'Mend', desc: 'Hold the healing orb. Aim at a teammate (20 m) and left click to heal them 100 HP over 5 s; aim anywhere else to heal yourself 50 HP over 5 s.', charges: 1, cooldown: 45,
        use(kit) {
          const o = kit.owner, ally = allyInView(kit, { range: 20 });
          if (ally && ally.hp < PLAYER.hp) { healAlly(ally, 100, 5); o.game.emit('ability', { who: ally, type: 'heal' }); return; }
          if (o.hp >= PLAYER.hp) return false;
          kit.healOver(50, 5);
          o.game.emit('ability', { who: o, type: 'heal' });
        },
      },
      x: {
        name: 'Second Dawn', desc: 'Look at a fallen teammate’s body (12 m) and press X: after 2 s of channelling they rise where they fell with full health.', points: 7,
        use(kit) {
          const o = kit.owner, g = o.game, ally = allyInView(kit, { dead: true, range: 12, maxDeg: 18 });
          if (!ally || !g.mode) return false;
          o.st.channelUntil = kit.now + 2;
          o.st.slowUntil = kit.now + 2; o.st.slowAmt = 0.95;
          g.emit('ability', { who: o, type: 'ult' });
          mine(kit, 2, () => { if (!ally.alive && g.mode && g.mode.phase !== 'end') g.resurrect(ally, o); });
        },
      },
    },
  },

  stella: {
    name: 'Stella', role: 'Controller', color: '#e6b34a', emblem: 'star',
    blurb: 'Plays the whole map from the stars. Place them anywhere, then turn each into a smoke, a stun or a gravity well — and split the map in two.',
    passive: { name: 'Stars', desc: 'You have 4 stars per life. Press E (not looking at a star) to place them on the map, then look at a star and press C, Q or E to activate it.' },
    abilities: {
      c: {
        name: 'Gravity Well', desc: 'Look at one of your stars and press C: after 1.25 s it pulls nearby enemies (4.75 m) to its centre for 2 s, then makes them Vulnerable (double damage) for 2.5 s.', charges: 1, cooldown: 0, instant: true,
        use() { return false; },
        reuse(kit) {
          const st = lookAt(kit, 'star');
          if (!st) return false;
          st.removed = true;
          const g = kit.owner.game, p = [st.pos[0], st.pos[1] + 1, st.pos[2]];
          g.emit('pulse', { pos: p, r: 4.75, type: 'well', color: 0xe6b34a, owner: kit.owner });
          for (let i = 0; i < 8; i++) later(kit, 1.25 + i * 0.25, () => g.pull(kit.owner, p, 4.75, 4.5));
          later(kit, 3.25, () => g.pulse(kit.owner, p, 4.75, 'vuln', 2.5, 0xe6b34a));
          return true;
        },
      },
      q: {
        name: 'Nova Pulse', desc: 'Look at one of your stars and press Q: after 1 s it bursts, stunning enemies within 4.75 m for 2.5 s.', charges: 1, cooldown: 0, instant: true,
        use() { return false; },
        reuse(kit) {
          const st = lookAt(kit, 'star');
          if (!st) return false;
          st.removed = true;
          const p = [st.pos[0], st.pos[1] + 1, st.pos[2]];
          kit.owner.game.emit('pulse', { pos: p, r: 1.5, type: 'well', color: 0xe6b34a, owner: kit.owner });
          later(kit, 1.0, () => kit.owner.game.pulse(kit.owner, p, 4.75, 'stun', 2.5, 0xe6b34a));
          return true;
        },
      },
      e: {
        name: 'Astral Form', desc: 'Press E to open the map and click to place your stars (up to the 4 you have). Look at a placed star and press E to turn it into a 14.25 s smoke (it forms 0.75 s later).', charges: 1, cooldown: 0, instant: true,
        use(kit) {
          if (kit.starsLeft <= 0) return false;
          const o = kit.owner;
          kit.mapPick = {
            key: 'e', title: 'ASTRAL FORM', hint: 'Click to place stars (' + kit.starsLeft + ' left) · E or right click when done', max: kit.starsLeft, color: '#e6b34a', radius: 1,
            confirm: (picks) => {
              for (const p of picks) { o.game.addDevice({ kind: 'star', owner: o, pos: p, life: 9999 }); kit.starsLeft--; }
            },
          };
          return 'pending';
        },
        reuse(kit) {
          const st = lookAt(kit, 'star');
          if (!st) return false;
          st.removed = true;
          const at = [st.pos[0], st.pos[1] + 2, st.pos[2]];
          later(kit, 0.75, () => kit.owner.game.addSmoke(kit.owner, at, kit.now, { radius: 4.75, life: 14.25, color: 0x6b4d8f }));
          return true;
        },
      },
      x: {
        name: 'Rift Line', desc: 'Open the map and click a point: a wall of cosmic energy splits the whole map through it (along the way you face) for 21 s, after a 2.7 s windup. Nothing gets through — not bullets, not sight.', points: 7,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'RIFT LINE', hint: 'Click where the wall goes (it runs the way you are facing) · right click or X to cancel', max: 1, color: '#e6b34a',
            confirm: (picks) => {
              kit.ultPoints = 0;
              kit.lastUse.x = kit.now;
              const yaw = o.yaw;
              later(kit, 2.667, () => o.game.divide(o, picks[0], yaw, 21)); // the wall rises after the windup
              o.game.emit('ability', { who: o, type: 'ult' });
            },
          };
          return 'pending';
        },
      },
    },
  },

  regent: {
    name: 'Regent', role: 'Sentinel', color: '#e8c26a', emblem: 'crown',
    blurb: 'A gentleman marksman with his own guns: a heavy pistol, a teleport anchor, a trap — and a sniper rifle that ends rounds.',
    abilities: {
      c: {
        item: 'device', name: 'Snare', desc: 'Hold the trap, left click to place it on the floor (10 m). When an enemy comes within 6 m it bursts into a 5 m field that slows them by 60% for 6 s.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 10, { floor: true, back: 0.4 });
          o.game.addDevice({ kind: 'trademark', owner: o, pos, life: 999, armAt: kit.now + 1 });
        },
      },
      q: {
        name: 'Sovereign', desc: 'Draw a heavy pistol (8 rounds; 159 to the head, right click to aim). Press Q again to holster it and keep the rest of the rounds.', charges: 1, cooldown: 30, instant: true,
        use(kit) {
          drawAbilityGun(kit, 'headhunter');
          const gun = kit.owner.inv.ability;
          gun.abilityKey = 'q';
          // 5v5: each charge is one bullet bought for 100 — load them all (spend() then takes the last one).
          if (kit.owner.game.mode) { gun.mag = kit.charges.q; kit.charges.q = 1; }
          return true;
        },
        reuse(kit) { return toggleAbilityGun(kit, 'headhunter'); },
      },
      e: {
        item: 'device', name: 'Anchor', desc: 'Hold the anchor, left click to place it on the floor (13 m). Press E again anywhere within 50 m to teleport back to it, invulnerable while you teleport (20 s cooldown between teleports).', charges: 1, cooldown: 0,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 13, { floor: true, back: 0.6 });
          if (kit.anchor) kit.anchor.removed = true;
          kit.anchor = o.game.addDevice({ kind: 'anchor', owner: o, pos, life: 99999 });
        },
        reuse(kit) {
          const a = kit.anchor, o = kit.owner;
          if (!a || a.removed) return false;
          if (kit.now < (kit.tpReady || 0) || Math.hypot(o.pos[0] - a.pos[0], o.pos[2] - a.pos[2]) > 50) { o.game.emit('abilityFail', { who: o, key: 'e' }); return true; }
          kit.tpReady = kit.now + 20;
          o.game.emit('ability', { who: o, type: 'step', pos: a.pos });
          o.st.invulnUntil = kit.now + 0.6; // can't be hurt from the press until he lands
          o.st.channelUntil = kit.now + 0.5; // and can't shoot while teleporting
          mine(kit, 0.5, () => o.game.teleportNear(o, [...a.pos]));
          return true;
        },
      },
      x: {
        name: 'Coup de Grace', desc: 'Draw a custom sniper rifle (5 rounds): one hit to the body or head kills, and every kill leaves a slowing field where the target fell. Right click to scope.', points: 8,
        use(kit) {
          drawAbilityGun(kit, 'tourdeforce');
          kit.owner.game.emit('ability', { who: kit.owner, type: 'ult' });
        },
      },
    },
  },

  marina: {
    name: 'Marina', role: 'Controller', color: '#2fb3a8', emblem: 'wave',
    blurb: 'Bends the sea to her will: walls of water that run through the map, a shielding cove and a crashing wave.',
    abilities: {
      c: {
        item: 'orb', name: 'Breaker', desc: 'Hold the water, left click to send a wave rolling forward (7 m/s) through walls for 18 m. It blocks sight and slows anyone it passes through.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw);
          const s = g.addSmoke(o, [o.pos[0] + f[0] * 1.5, o.pos[1] + SLAB.h / 2, o.pos[2] + f[1] * 1.5], kit.now, { radius: 1, life: 9, color: 0x2fb3a8, kind: 'water', slab: { dir: right(o.yaw), len: 6, th: SLAB.th * 1.4, h: SLAB.h } });
          g.addDevice({ kind: 'cascade', owner: o, pos: [...s.pos], dir: [f[0], 0, f[1]], smoke: s, speed: 7, travelled: 0, life: 9 });
        },
      },
      q: {
        name: 'Riptide', desc: 'Send a wall of water racing forward up to 40 m, through walls. Hold Q and turn to steer it. It blocks sight and slows for 15 s.', charges: 1, cooldown: 40, instant: true,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'blaze', owner: o, pos: [o.pos[0] + f[0] * 1.2, o.pos[1], o.pos[2] + f[1] * 1.2], yaw: o.yaw, life: 3.0, speed: 15, travelled: 0, nextSeg: 0, key: 'abQHeld', maxDist: 40, through: true,
            seg: { spacing: 1.25, slab: true, smoke: { radius: 1, life: 15, color: 0x2fb3a8, kind: 'water' }, zone: { kind: 'slowfield', color: 0x2fb3a8, r: 0.7, life: 15, slowField: 0.3 } } });
        },
      },
      e: {
        item: 'orb', name: 'Lagoon', desc: 'Hold the orb, left click to throw it (20 m). It becomes a water dome 9.2 m across for 19.25 s that blocks sight and stops bullets until it takes 680 damage.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.6 });
          const ft = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0x2fb3a8 });
          later(kit, ft, () => o.game.addSmoke(o, [pos[0], pos[1] + 1.4, pos[2]], kit.now, { radius: 4.6, life: 19.25, color: 0x2fb3a8, kind: 'cove' }));
        },
      },
      x: {
        name: 'Undertow', desc: 'Flood the ground ahead (30 m cone, through walls). Three geysers strike over 3 s; every enemy standing in it when one hits is stunned for 3 s.', points: 7,
        use(kit) {
          const o = kit.owner, g = o.game;
          g.emit('quakeLine', { from: [o.pos[0], o.pos[1] + 1, o.pos[2]], yaw: o.yaw, cone: true, color: 0x2fb3a8 });
          for (const t of [1.0, 2.2, 3.4]) later(kit, t, () => g.cone(o, 30, 30 * DEG, (c) => { c.st.stunUntil = kit.now + 3; c.st.slowUntil = kit.now + 3; c.st.slowAmt = 0.4; g.emit('pulse', { pos: c.eye(), r: 1.5, type: 'stun', color: 0x2fb3a8, owner: o }); }));
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  vanta: {
    name: 'Vanta', role: 'Duelist', color: '#9b5cff', emblem: 'hex2',
    blurb: 'A cold, focused fixer. Pushes a bullet-proof wall into fights, shields himself on the kill, and drags one target into a private arena.',
    abilities: {
      c: {
        item: 'device', name: 'Push Wall', desc: 'Hold the barrier, left click to push a wall (5 m × 3 m) forward for 3.5 s. It blocks bullets and sight but players can walk through it; it stops at walls.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          const p = [o.pos[0] + f[0] * 2.2, o.pos[1], o.pos[2] + f[1] * 2.2];
          const w = o.game.addWall(o, p, o.yaw, 6, { style: 'iso', passable: true });
          if (!w) return false;
          o.game.addDevice({ kind: 'pushwall', owner: o, wall: w, dir: Math.abs(f[0]) > Math.abs(f[1]) ? [Math.sign(f[0]), 0, 0] : [0, 0, Math.sign(f[1])], life: 3.5 });
        },
      },
      q: {
        item: 'orb', name: 'Sever', desc: 'Hold the bolt, left click to fire it straight ahead 30 m, through walls. Every enemy it touches is Vulnerable (double damage) for 4 s.', charges: 2, cooldown: 20,
        use(kit) {
          const o = kit.owner, g = o.game, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch), end = [e[0] + d[0] * 30, e[1] + d[1] * 30, e[2] + d[2] * 30];
          g.emit('throw', { who: o, from: e, to: end, time: 1.2, color: 0x9b5cff, wave: true });
          later(kit, 0.6, () => g.lineEffect(o, e, end, 1.6, 'vuln', 4));
        },
      },
      e: {
        name: 'Focus', desc: 'After a 1 s wind-up you get a shield that blocks one hit, for 12 s. Every enemy you kill in that time drops an orb above their body for 3 s: shoot it to refresh the shield and the 12 s timer.', charges: 1, cooldown: 30, instant: true,
        use(kit) {
          kit.focusWind = kit.now + 1;
          kit.owner.gun.onHolster();
          mine(kit, 1, () => { kit.focusUntil = kit.now + 12; kit.shield = true; kit.owner.game.emit('ability', { who: kit.owner, type: 'heal' }); });
          kit.owner.game.emit('ability', { who: kit.owner, type: 'windup' });
        },
      },
      x: {
        name: 'Duel', desc: 'Look at an enemy (any distance, through walls) and press X: you and they are pulled into a sealed arena for up to 15 s. Whoever survives is sent back.', points: 7,
        use(kit) {
          const o = kit.owner, g = o.game, f = dirFromAngles(o.yaw, o.pitch), e = o.eye();
          let best = null, bestCos = Math.cos(7 * DEG);
          for (const c of g.combatants) {
            if (!c.alive || !g.isEnemy(o, c)) continue;
            const t = c.eye(), dx = t[0] - e[0], dy = t[1] - 0.5 - e[1], dz = t[2] - e[2], dist = Math.hypot(dx, dy, dz);
            const cos = (f[0] * dx + f[1] * dy + f[2] * dz) / dist;
            if (cos > bestCos) { bestCos = cos; best = c; }
          }
          if (!best || g.contract) return false;
          g.startContract(o, best, 15);
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  lumen: {
    name: 'Lumen', role: 'Duelist', color: '#ffe680', emblem: 'prism',
    blurb: 'A duelist made of light. She hinders a whole area, darts in with a double dash, and can snap back to a beacon the moment a fight turns.',
    passive: { name: 'Refraction', desc: 'Refract comes back after two kills instead of on a timer.' },
    abilities: {
      c: {
        item: 'grenade', name: 'Saturate', desc: 'Hold a cluster of light, left click to throw it (20 m). It bursts where it lands: every enemy within 5 m is Hindered for 3 s (30% slower, lower jumps, 20% slower fire rate).', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.5 });
          const ft = flight(o.eye(), pos, 16);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0xffe680 });
          later(kit, ft, () => o.game.pulse(o, [pos[0], pos[1] + 0.8, pos[2]], 5, 'hinder', 3, 0xffe680));
        },
      },
      q: {
        name: 'Lightspeed', desc: 'Dash twice, ~6 m each, the way you are moving: the first dash also carries you upward, the second follows 0.35 s later.', charges: 1, cooldown: 25, instant: true,
        use(kit) {
          const o = kit.owner;
          const go = (up) => {
            const inp = o.input, len = Math.hypot(inp.fwd, inp.side), sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
            const dir = len > 0 ? [(-sy * inp.fwd + cy * inp.side) / len, (-cy * inp.fwd - sy * inp.side) / len] : [-sy, -cy];
            o.dash = { until: kit.now + 0.15, dir, speed: 40, exit: 6.5 };
            if (up) { o.vel[1] = 5.2; o.grounded = false; }
            o.game.emit('ability', { who: o, type: 'dash' });
          };
          go(true);
          mine(kit, 0.35, () => go(false));
        },
      },
      e: {
        name: 'Refract', desc: 'Drop a beacon of light where you stand. Press E again within 8 s to travel back to it (0.35 to 2 s, by distance), untouchable on the way. Recharges after two kills.', charges: 1, cooldown: 1e9, instant: true, recharge: 'kills',
        use(kit) {
          const o = kit.owner;
          kit.refract = o.game.addDevice({ kind: 'anchor', owner: o, pos: [...o.pos], life: 8 });
          o.game.emit('ability', { who: o, type: 'windup' });
        },
        reuse(kit) {
          const b = kit.refract;
          if (!b || b.removed || kit.now - b.born < 0.3) return false;
          const o = kit.owner, to = [...b.pos];
          const travel = Math.min(2, Math.max(0.35, Math.hypot(to[0] - o.pos[0], to[1] - o.pos[1], to[2] - o.pos[2]) / 15));
          o.st.intangibleUntil = kit.now + travel;
          o.st.channelUntil = kit.now + travel; // no shooting on the way
          mine(kit, travel, () => o.game.teleport(o, to));
          b.removed = true; kit.refract = null;
          o.game.emit('ability', { who: o, type: 'dash' });
          return true;
        },
      },
      x: {
        name: 'Convergent Paths', desc: 'Focus your light and cast a beam 36 m ahead, through walls. Casting briefly slows your aim and movement. After 1 s the beam expands to 13.5 m wide: everyone in it is Hindered for 6 s, and you gain 10% speed for 7 s.', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), a = [o.pos[0], o.pos[1] + 1, o.pos[2]], b = [a[0] + f[0] * 36, a[1], a[2] + f[1] * 36];
          g.emit('ability', { who: o, type: 'ult' });
          o.st.castLockUntil = kit.now + 0.6; // like Rolling Thunder: aim and movement held back while casting
          g.emit('quakeLine', { from: a, to: b, width: 1, color: 0xffe680, life: 1 });
          later(kit, 1, () => {
            g.emit('quakeLine', { from: a, to: b, width: 13.5, color: 0xfff2b0, life: 0.8 });
            // The expanded area lingers for 4 ticks, 0.125 s apart, catching anyone who walks in.
            for (let i = 0; i < 4; i++) later(kit, i * 0.125, () => g.lineEffect(o, a, b, 6.75, 'hinder', 6, 4));
            if (o.alive) { o.st.hasteUntil = kit.now + 7; o.st.hasteAmt = 0.1; }
          });
        },
      },
    },
  },

  ballast: {
    name: 'Ballast', role: 'Initiator', color: '#d9a441', emblem: 'target',
    blurb: 'A veteran artillery officer. Scouts with a drone, tags with sticky charges and calls guided missiles onto the map.',
    abilities: {
      c: {
        item: 'device', name: 'Scout Drone', desc: 'Hold the drone, left click to launch it. Fly it with your mouse for up to 6 s; left click to pulse: enemies within 16 m are revealed for 4 s and nearsighted.', charges: 1, cooldown: 40,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          kit.pilot = o.game.addDevice({ kind: 'sdrone', owner: o, pos: [e[0] + d[0], e[1], e[2] + d[2]], dir: d, life: 6, steer: true, fly: true, speed: 6 });
        },
      },
      q: {
        item: 'grenade', name: 'Sticky Charge', desc: 'Hold the charge, left click to throw it (20 m). It sticks where it lands and 1.2 s later bursts: up to 35 damage and a 2.5 s stun within 5.25 m.', charges: 2, cooldown: 25,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { back: 0.3 });
          const ft = flight(o.eye(), pos, 13);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0xd9a441 });
          later(kit, ft, () => o.game.addDevice({ kind: 'satchel', owner: o, pos, life: 1.2 }));
          later(kit, ft + 1.2, () => { o.game.pulse(o, pos, 5.25, 'stun', 2.5, 0xd9a441); o.game.explode(o, pos, 5.25, 35, 20, src('sticky', 'Sticky Charge'), 0xd9a441, false, false, 1.25); });
        },
      },
      e: {
        name: 'Missile Call', desc: 'Open the map and mark a target per charge (2 charges, 45 m); press E (or right click) to fire. Each missile lands 1.5 s later for up to 65 damage in 4.5 m.', charges: 2, cooldown: 35, instant: true, recharge: 'none',
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'e', title: 'MISSILE CALL', hint: 'Click up to ' + kit.charges.e + ' targets · E or right click to fire', max: kit.charges.e, color: '#d9a441', radius: 4.5, range: 45,
            confirm: (picks) => {
              kit.lastUse.e = kit.now;
              for (const p of picks) {
                kit.charges.e--; if (!kit.ready.e) kit.ready.e = kit.now + this.cooldown;
                o.game.emit('throw', { who: o, from: [o.pos[0], o.pos[1] + 20, o.pos[2]], to: p, time: 1.5, color: 0xff8c2e, rocket: true });
                later(kit, 1.5, () => o.game.explode(o, [p[0], p[1] + 0.5, p[2]], 4.5, 65, 25, src('missile', 'Missile Call'), 0xff8c2e));
              }
            },
          };
          return 'pending';
        },
      },
      x: {
        name: 'Barrage', desc: 'Open the map and click a start point: a line of 15 explosions walks 30 m forward from it (the way you face), 150 damage each.', points: 9,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'BARRAGE', hint: 'Click where the barrage starts (it walks the way you are facing) · right click or X to cancel', max: 1, color: '#ff4655', radius: 3.5,
            confirm: (picks) => {
              kit.ultPoints = 0; kit.lastUse.x = kit.now;
              const g = o.game, f = fwd2(o.yaw), s0 = picks[0];
              for (let i = 0; i < 15; i++) {
                const x = s0[0] + f[0] * i * 2, z = s0[2] + f[1] * i * 2, fl = g.floorAt(x, z);
                if (!fl) continue;
                later(kit, 1 + i * 0.15, () => g.explode(o, [fl[0], fl[1] + 0.5, fl[2]], 3.5, 150, 80, src('barrage', 'Barrage'), 0xff8c2e, false, true));
              }
              g.emit('ability', { who: o, type: 'ult' });
            },
          };
          return 'pending';
        },
      },
    },
  },

  override: {
    name: 'Override', role: 'Initiator', color: '#6fa8ff', emblem: 'chip',
    blurb: 'A war machine built to end abilities. Flashes, frags and a suppression knife — and when it overloads, it won’t stay down.',
    abilities: {
      c: {
        item: 'grenade', name: 'Fragment', desc: 'Hold the frag, left click to throw it (20 m). It sticks to the floor and pulses four times over 3 s (up to 60 per pulse, 4 m).', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          const ft = flight(o.eye(), pos, 13), g = o.game;
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0x6fa8ff });
          later(kit, ft, () => g.addDevice({ kind: 'satchel', owner: o, pos, life: 3.2 }));
          for (let i = 0; i < 4; i++) later(kit, ft + 0.4 + i * 0.9, () => g.explode(o, [pos[0], pos[1] + 0.5, pos[2]], 4, 60, 25, src('fragment', 'Fragment'), 0x6fa8ff));
        },
      },
      q: {
        item: 'flash', name: 'Flashpoint', desc: 'Hold the flash. Left click: long throw that pops after 1.6 s. Right click: short lob that pops after 0.7 s. Blinds anyone facing it for 2 s (2.25 s for the lob).', charges: 2, cooldown: 20,
        armHint: 'LEFT CLICK: LONG THROW · RIGHT CLICK: SHORT LOB',
        use(kit, mode) {
          const o = kit.owner, g = o.game, short = mode === 'right';
          const pos = aimPoint(o, short ? 6 : 18, { back: 0.6 });
          const fuse = short ? 0.7 : 1.6;
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: fuse, color: 0xffffff });
          later(kit, fuse, () => g.flash(o, pos, short ? 2.25 : 2.0));
        },
      },
      e: {
        item: 'knife', name: 'Zero Point', desc: 'Hold the knife, left click to throw it (30 m). It sticks to the first surface and after 1 s pulses 15 m: enemies caught are revealed and suppressed (no abilities) for 8 s.', charges: 1, cooldown: 50,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 30, { back: 0.15 });
          const ft = flight(o.eye(), pos, 22), g = o.game;
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0x6fa8ff });
          later(kit, ft, () => g.addDevice({ kind: 'zknife', owner: o, pos, life: 2 }));
          later(kit, ft + 1, () => g.pulse(o, pos, 15, 'suppress', 8, 0x6fa8ff));
        },
      },
      x: {
        name: 'Overload', desc: 'Overload for 12 s: pulses every 2 s reveal and suppress enemies within 42.5 m for 4 s, you fire 10% faster — and if you would die, you go down instead and reboot 3 s later at full health.', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game;
          kit.nullUntil = kit.now + 12;
          kit.nullSaved = false;
          kit.nullArmor = o.armor; // comes back with the shields it had, not free ones
          for (let t = 0; t < 12; t += 2) mine(kit, t, () => g.pulse(o, o.eye(), 42.5, 'suppress', 4, 0x6fa8ff));
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  thistle: {
    name: 'Thistle', role: 'Controller', color: '#e07bd0', emblem: 'butterfly',
    blurb: 'A mischievous immortal who fights on after death: smokes from the map even while dead, life stolen from fallen enemies, and a second life to earn back.',
    deadCast: true,
    passive: { name: 'Afterlife', desc: 'Ruse (E) works even while you are dead, until the round (or your respawn) comes.' },
    abilities: {
      c: {
        instant: true, name: 'Pick-Me-Up', desc: 'Instantly absorb the life force of an enemy who died in the last 10 s that you damaged: +50 temporary health for 10 s (then it fades) and 15% haste for 3 s.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, g = o.game;
          const prey = g.combatants.find(c => !c.alive && g.isEnemy(o, c) && c.diedAt > kit.now - 10 && (c.damagedBy?.has(o) || c.killedBy?.killer === o) && !c.soulTaken);
          if (!prey) return false;
          prey.soulTaken = true;
          o.hp = Math.min(150, o.hp + 50);
          kit.overhealUntil = kit.now + 10;
          o.st.hasteUntil = kit.now + 3; o.st.hasteAmt = 0.15;
          g.emit('ability', { who: o, type: 'heal' });
        },
      },
      q: {
        item: 'orb', name: 'Meddle', desc: 'Hold the fragment, left click to throw it (20 m). 0.75 s after landing it erupts in a 6 m burst: enemies caught lose 90 health to Decay (never lethal), which slowly comes back.', charges: 1, cooldown: 25,
        use(kit) {
          const o = kit.owner, g = o.game, pos = aimPoint(o, 20, { floor: true, back: 0.4 });
          const ft = flight(o.eye(), pos, 13);
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0xe07bd0 });
          later(kit, ft + 0.75, () => {
            g.emit('pulse', { pos: [pos[0], pos[1] + 1, pos[2]], r: 6, type: 'decay', color: 0xe07bd0, owner: o });
            for (const c of g.combatants) if (c.alive && g.isEnemy(o, c) && Math.hypot(c.pos[0] - pos[0], c.pos[2] - pos[2]) < 6 && Math.abs(c.pos[1] - pos[1]) < 3) g.decay(c, 90);
          });
        },
      },
      e: {
        name: 'Ruse', desc: 'Open the map and click up to two spots (one per charge); press E or right click to drop smokes there (14 s; 60 m). Works while you are dead: one smoke, 6 s.', charges: 2, cooldown: 40, instant: true,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'e', title: 'RUSE', hint: 'Click up to ' + kit.charges.e + ' spots · E or right click to drop the smokes', max: o.alive ? kit.charges.e : Math.min(1, kit.charges.e), color: '#e07bd0', radius: 4, range: 60,
            confirm: (picks) => {
              for (const p of picks) {
                kit.charges.e--;
                if (!kit.ready.e) kit.ready.e = kit.now + this.cooldown;
                o.game.emit('throw', { who: o, from: [p[0], p[1] + 25, p[2]], to: [p[0], p[1] + 2, p[2]], time: 0.7, color: 0xe07bd0 });
                const at = [p[0], p[1] + 2, p[2]];
                const t0 = kit.now, life = o.alive ? 14 : 6;
                kit.timers.push({ at: t0 + 0.7, dead: true, fn: () => o.game.addSmoke(o, at, kit.now, { radius: 4, life, color: 0x7a3f74 }) });
              }
              kit.lastUse.e = kit.now;
            },
          };
          return 'pending';
        },
      },
      x: {
        name: 'Not Dead Yet', desc: 'After you die, press X to come back where you fell. You then have 10 s to get a kill or damage an enemy — otherwise you die again.', points: 8,
        use(kit) { kit.owner.game.emit('abilityFail', { who: kit.owner, key: 'x' }); return false; }, // only from the grave
      },
    },
  },
};

export const AGENT_ORDER = ['zephyr', 'cinder', 'umbra', 'hawke', 'bastion', 'blitz', 'granite', 'venom', 'vex', 'quake', 'volt', 'mirage', 'fawn', 'lattice', 'nyx', 'solace', 'stella', 'regent', 'marina', 'vanta', 'ballast', 'override', 'thistle', 'lumen'];

// ---------- kit: charges, cooldowns, ultimate and ongoing effects for one agent ----------
export class Kit {
  constructor(owner, agentId = 'zephyr') {
    this.owner = owner;
    this.id = AGENTS[agentId] ? agentId : 'zephyr';
    this.agent = AGENTS[this.id];
    this.ultPoints = 0;
    this.reset(0);
  }

  get ultCost() { return this.agent.abilities.x.points; }

  // Remove anything this kit left running in the world (gas, emitters) — on respawn or agent swap.
  cleanup() {
    const g = this.owner.game;
    if (this.gas) for (const gr of Object.values(this.gas.groups)) gasOff(this, gr);
    for (const d of g.devices || []) if (d.owner === this.owner && (d.kind === 'emitter' || d.kind === 'satchel')) d.removed = true;
  }

  // The owner just died: take down what Valorant takes down with its agent, on every peer's copy of the kit.
  // Thrown smokes, fire, walls, flashes and ultimates already placed stay (Brimstone, Omen, Sage, Phoenix...);
  // what goes is utility that needs its owner alive:
  //   Venom (Viper)     Miasma, Toxic Wall and Nest linger 2 s, then the gas drops; Acid Vial stays
  //   Bastion (Killjoy) Watchdog, Sentry and undetonated Hive grenades shut off; a running Hive or Clampdown stays
  //   Lattice (Cypher)  Tripline and Watcher are disabled; triggered cages stay
  //   Regent (Chamber)  Snare and Anchor; Blitz (Raze) Kicker satchels; Lumen (Waylay) Refract beacon
  //   anything being piloted or held (drones, the tiger, Overload, blades, beams, a camera view, map picks)
  onDeath(now) {
    const g = this.owner.game, o = this.owner, LINGER = 2;
    const fade = (it) => { it.until = Math.min(it.until, now + LINGER); };
    for (const gr of Object.values(this.gas.groups)) { if (gr.active) gr.items.forEach(fade); gr.active = false; gr.items = []; }
    this.gas.groups = {};
    for (const s of g.smokes) if (s.owner === o && s.nest) fade(s);
    for (const z of g.zones) if (z.owner === o && z.nearsight) fade(z);
    for (const d of g.devices) {
      if (d.owner !== o || d.removed) continue;
      if (d.kind === 'emitter') fade(d);
      else if (DIES_WITH_OWNER.has(d.kind)) d.removed = true;
    }
    for (const t of [this.pilot, this.cam, this.anchor, this.refract]) if (t) t.removed = true;
    if (this.shadow?.shade) this.shadow.shade.removed = true;
    this.pilot = this.view = this.cam = this.anchor = this.refract = this.shadow = null;
    this.armed = this.mapPick = this.blades = this.beams = this.launcher = this.highGear = this.overdrive = null;
    this.timers = this.timers.filter(t => !t.self);
  }

  // On spawn: full charges, ultimate points kept.
  reset(now) {
    this.now = now;
    if (this.gas) this.cleanup();
    this.grab = null;
    this.usedAt = -1;
    this.rot = false;
    this.chargeT = 0;
    this.power = undefined;
    this.focusWind = 0;
    this.nest = null;
    this.nestZone = null;
    this.starsLeft = 4;
    this.mustScoreUntil = 0;
    this.dist = undefined; this.phase = false;
    this.secondLife = 0;
    this.focusUntil = 0;
    this.shield = false;
    this.nullUntil = 0;
    this.nullSaved = false;
    if (this.anchor) this.anchor.removed = true;
    this.anchor = null;
    this.tpReady = 0;
    const ab = this.agent.abilities;
    this.charges = { q: ab.q.charges, e: ab.e.charges, c: ab.c.charges };
    this.ready = { q: 0, e: 0, c: 0 }; // time the next charge comes back (0 = none pending)
    this.killCharge = { q: 0, e: 0, c: 0 }; // kills toward a kill-recharged charge
    this.held = { q: 0, e: 0, c: 0 }; // most charges held since spawning (5v5 recharges stop there)
    this.lastUse = { q: -10, e: -10, c: -10, x: -10 };
    this.blades = null;
    this.beams = null;
    this.armed = null;
    this.tailwind = null;
    this.regrow = null;
    this.shadow = null;
    this.mapPick = null;
    this.rebirth = null;
    this.launcher = null;
    this.gas = { fuel: 100, groups: {} };
    this.orbs = [];
    this.empressUntil = 0;
    this.vanishUntil = 0;
    this.healOverUntil = 0;
    this.energy = 100;
    this.highGear = null;
    this.slideAt = 0;
    this.slideKills = 0;
    this.overdrive = null;
    this.drift = null;
    this.pilot = null;
    this.view = null;
    this.cam = null;
    this.aimBefore = null;
    this.gate = null;
    this.hawk = null;
    this.timers = [];
    this.now = now;
  }

  // While your view is away from your body (a camera, a piloted gadget, Nightwalk's channel, Shade's aiming
  // view), the mouse turns that view. Coming back, you face where you faced before you left.
  keepAim() {
    const o = this.owner, held = this.armed && this.agent.abilities[this.armed.k];
    const away = !!(this.view || this.pilot || this.shadow || held?.shadowSight);
    if (away && !this.aimBefore) this.aimBefore = { yaw: o.yaw, pitch: o.pitch };
    else if (!away && this.aimBefore) { o.yaw = this.aimBefore.yaw; o.pitch = this.aimBefore.pitch; this.aimBefore = null; }
  }

  // Your own placed utility you're looking at and could pick up now (F), if any.
  pickupInView() {
    const o = this.owner, g = o.game, e = o.eye(), f = dirFromAngles(o.yaw, o.pitch);
    let best = null, bestCos = Math.cos(12 * DEG);
    for (const d of g.devices) {
      const rule = PICKUPS[d.kind];
      if (!rule || d.owner !== o || d.removed || !this.canPickUp(d)) continue;
      const c = [d.pos[0], d.pos[1] + 0.2, d.pos[2]], dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2], dist = Math.hypot(dx, dy, dz);
      if (!rule.far && (Math.hypot(d.pos[0] - o.pos[0], d.pos[2] - o.pos[2]) > 2.6 || Math.abs(d.pos[1] - o.pos[1]) > 2.2 || !g.world.lineOfSight(e, c))) continue;
      const near = !rule.far && dist < 1.2; // standing over it counts as looking at it
      const cos = near ? 1 : (f[0] * dx + f[1] * dy + f[2] * dz) / Math.max(dist, 0.01);
      if (cos > bestCos) { bestCos = cos; best = d; }
    }
    return best;
  }

  canPickUp(d) {
    const rule = PICKUPS[d.kind];
    if (rule.buyOnly && this.owner.game.mode?.phase !== 'buy') return false;
    return !d.target; // an alarm bot already chasing someone is spent
  }

  // Pick up your device at `pos` (online peers replay this with the same position).
  pickUp(pos) {
    const o = this.owner, g = o.game;
    let d = null, bestD = 1;
    for (const x of g.devices) {
      if (!PICKUPS[x.kind] || x.owner !== o || x.removed || !this.canPickUp(x)) continue;
      const dd = Math.hypot(x.pos[0] - pos[0], x.pos[1] - pos[1], x.pos[2] - pos[2]);
      if (dd < bestD) { bestD = dd; d = x; }
    }
    if (!d) return false;
    const rule = PICKUPS[d.kind];
    d.removed = true;
    if (d.kind === 'cam') { if (this.view === d) this.view = null; this.cam = null; }
    if (d.kind === 'anchor' && this.anchor === d) this.anchor = null;
    if (d.kind === 'emitter' && this.gas.groups.cloud) { gasOff(this, this.gas.groups.cloud); delete this.gas.groups.cloud; }
    const back = () => { if (rule.star) this.starsLeft++; else this.charges[rule.k]++; };
    if (!rule.cd || g.mode?.phase === 'buy') back();
    else this.timers.push({ at: this.now + rule.cd, fn: back, refund: rule.star ? null : rule.k }); // 5v5: still owed at the next round
    g.emit('pickedUp', { who: o, kind: d.kind, pos: [...d.pos] });
    return true;
  }

  // While true the gun can't fire (blades/beams out, an ability armed, channelling).
  blocking() { return !!(this.now < (this.focusWind || 0) || this.owner.st.downedUntil > this.now || this.usedAt === this.now || this.grab || this.blades || this.beams || this.armed || this.shadow || this.mapPick || this.launcher || this.highGear || this.overdrive || this.drift || this.pilot || this.view || this.owner.st.intangibleUntil > this.now); }
  busy() { return !!(this.blades || this.beams || this.shadow || this.mapPick || this.launcher || this.pilot || this.view || this.drift); }

  // ---- map picker (sky smokes, orbital strike, map teleport) ----
  mapClick(pos) {
    const mp = this.mapPick;
    if (!mp || !pos || (mp.valid && !mp.valid(pos))) return false;
    mp.picks = mp.picks || [];
    mp.picks.push(pos);
    if (mp.picks.length >= mp.max) this.mapConfirm();
    return true;
  }
  mapConfirm() {
    const mp = this.mapPick;
    this.mapPick = null;
    if (mp && mp.picks?.length) mp.confirm(mp.picks);
  }
  mapCancel() { this.mapPick = null; }

  cooldownLeft(k, now) { return this.ready[k] ? Math.max(0, this.ready[k] - now) : 0; }

  // A charge coming back on its timer. In 5v5 only up to what you held this round: Omen gets his free Dark Cover
  // back, not the second one he didn't buy.
  recharge(k, now) {
    const g = this.owner.game, ab = this.agent.abilities[k];
    this.held[k] = Math.max(this.held[k], this.charges[k]);
    if (g.mode && !this.roundTimer(k)) { this.ready[k] = 0; return; } // rounds: only signatures recharge on a timer
    const cap = g.mode ? Math.min(ab.charges, this.held[k]) : ab.charges;
    if (this.ready[k] && now >= this.ready[k]) {
      this.charges[k] = Math.min(cap, this.charges[k] + 1);
      this.ready[k] = this.charges[k] < cap ? now + ab.cooldown : 0;
    }
  }

  // 5v5: does this slot recharge on its cooldown? Only the signature (E) does, as in Valorant — also when extra
  // charges can be bought (Dark Cover, Ruse) — unless it comes back on kills or once a round.
  roundTimer(k) { return k === 'e' && !this.agent.abilities.e.recharge; }

  spend(k, mode) {
    const ab = this.agent.abilities[k];
    const r = ab.use(this, mode);
    if (r === false) { this.owner.game.emit('abilityFail', { who: this.owner, key: k }); return false; } // keep holding it
    this.armed = null;
    if (r === 'pending') return; // spends its own charges once confirmed (map picks)
    const ck = ab.shares || k; // Devour and Dismiss draw on one pool
    this.charges[ck]--;
    if (!this.ready[ck]) this.ready[ck] = this.now + ab.cooldown;
    this.lastUse[k] = this.now;
    this.owner.game.emit('abilityUsed', { who: this.owner, key: k });
  }

  tick(now) {
    this.now = now;
    const o = this.owner, inp = o.input, ab = this.agent.abilities, g = o.game;
    for (const k of ABILITY_KEYS) this.recharge(k, now);
    if (this.tailwind && now > this.tailwind.until) this.tailwind = null; // unused dash fades

    const buyLock = g.mode?.phase === 'buy';
    if (o.st.disarmUntil > now) { // detained: no abilities, no ability guns
      inp.abQ = inp.abE = inp.abC = inp.abX = false;
      inp.fire = inp.firePressed = inp.altPressed = false;
      this.armed = null;
    }
    if (o.st.suppressUntil > now) { // suppressed: guns work, abilities don't
      if (inp.abQ || inp.abE || inp.abC || inp.abX) g.emit('abilityLocked', { who: o, key: 'suppressed' });
      inp.abQ = inp.abE = inp.abC = inp.abX = false;
      if (this.armed) { this.armed = null; o.equip(o.slot, now, true); }
    }
    for (const k of ABILITY_KEYS) {
      if (!inp['ab' + k.toUpperCase()]) continue;
      if (this.armed && this.armed.k === k) { this.armed = null; continue; } // press again to put it away
      if (buyLock && !buyPhaseAllows(this.id, k)) {
        // Buy phase: you can still take it out and line it up; using it waits for the round to start.
        if (!ab[k].instant && !this.busy() && this.charges[k] > 0) { this.armed = { k, at: now }; o.gun.onHolster(); g.emit('abilityArm', { who: o, key: k }); }
        else g.emit('abilityLocked', { who: o, key: k });
        continue;
      }
      if (this.mapPick && this.mapPick.key === k) { this.mapConfirm(); continue; } // press again to confirm map picks
      if (ab[k].reuse && (!this.busy() || this.view || this.pilot) && ab[k].reuse(this)) continue; // second press: detonate / toggle / teleport
      if (this.busy()) continue;
      if (this.charges[ab[k].shares || k] <= 0) continue;
      if (!ab[k].instant) { this.armed = { k, at: now }; o.gun.onHolster(); g.emit('abilityArm', { who: o, key: k }); continue; } // equip first
      this.spend(k);
    }
    const held = this.armed && ab[this.armed.k];
    this.previewPos = held?.preview ? held.preview(this) : null; // what the player sees is where it lands
    if (this.armed && now - this.armed.at > 0.25) { // short draw before the ability can be used
      const k = this.armed.k, a = ab[k];
      if (buyLock && !buyPhaseAllows(this.id, k) && (inp.firePressed || (a.charge ? !inp.fire && this.chargeT > 0 : inp.altPressed && !a.rotate && !a.distance))) {
        g.emit('abilityLocked', { who: o, key: k }); // held, not thrown: keep holding it
        inp.firePressed = inp.altPressed = false; this.chargeT = 0;
      }
      if (a.rotate && inp.altPressed) { this.rot = !this.rot; inp.altPressed = false; } // right click rotates the preview
      if (a.distance) {
        // Hold right click to push the marker out (wraps back in at max range); R makes it stop at walls.
        if (this.dist === undefined || this.distFor !== k) { this.dist = a.distance.start; this.distFor = k; }
        if (inp.alt) { this.dist += a.distance.speed / 128; if (this.dist > a.distance.max) this.dist = a.distance.min; }
        if (inp.reload && !this.prevReload) this.stopAtWalls = !this.stopAtWalls;
        this.prevReload = inp.reload;
        inp.altPressed = false;
      }
      if (a.charge) {
        // Hold left click to charge, release to fire.
        if (inp.fire) { this.chargeT = Math.min(a.charge, (this.chargeT || 0) + 1 / 128); this.power = this.chargeT / a.charge; }
        else if (this.chargeT > 0) {
          this.power = Math.max(0.05, this.chargeT / a.charge);
          this.chargeT = 0;
          this.usedAt = now;
          if (this.spend(k, 'left') !== false && !this.busy()) o.equip(o.slot, now, true);
          this.power = undefined;
        }
      } else if (inp.firePressed || inp.altPressed) {
        this.usedAt = now;
        if (this.spend(k, inp.firePressed ? 'left' : 'right') !== false && !this.busy()) o.equip(o.slot, now, true); // gun comes back out (with its draw time)
      }
    }

    if (inp.abX && buyLock && !this.mapPick) g.emit('abilityLocked', { who: o, key: 'x' });
    else if (inp.abX) {
      if (this.mapPick && this.mapPick.key === 'x') this.mapCancel();
      else if (this.drift) { this.drift = null; o.st.hiddenUntil = o.st.intangibleUntil = 0; g.emit('ability', { who: o, type: 'rekindled' }); }
      else if (this.launcher) this.launcher = null;
      else if (this.ultPoints >= this.ultCost && !this.busy() && !this.rebirth) {
        this.armed = null;
        const r = ab.x.use(this, now);
        if (r !== false && r !== 'pending') { this.ultPoints = 0; this.lastUse.x = now; }
      }
    }

    // Delayed effects (fuses, wind-ups, sonar pulses...)
    this.runTimers(now);

    if (this.blades) this.tickBlades(now);
    if (this.beams) this.tickBeams(now);
    if (this.rebirth && now >= this.rebirth.until) this.revive();
    if (this.grab && now >= this.grab.until) { this.grab = null; if (!this.busy()) o.equip(o.slot, now, true); }
    if (this.mustScoreUntil && now >= this.mustScoreUntil) {
      // Didn't earn the second life: die again (no respawn trick in deathmatch either).
      this.mustScoreUntil = 0;
      g.kill(o, o, { part: 'body', def: { id: 'ndy', name: 'Not Dead Yet', cat: 'Ability' }, wallbang: false });
      return;
    }
    this.tickExtras(now);
    this.tickWave3(now);
    if (this.shadow || this.mapPick || this.pilot || this.view) {
      // Frozen while picking a spot or channelling. A piloted drone takes the movement keys instead.
      this.pilotInput = { fwd: inp.fwd, side: inp.side, jumpHeld: inp.jumpHeld, crouch: inp.crouch };
      inp.fwd = inp.side = 0; inp.jump = false;
      const sh = this.shadow;
      if (sh && sh.phase === 'channel' && sh.shade.removed && now < sh.until) this.endShadow(false); // the shade was shot
      else if (sh && sh.phase === 'channel' && now >= sh.until) {
        sh.shade.removed = true;
        this.endShadow(true);
        g.teleport(o, sh.dest);
      }
    }
  }

  // Umbra's ultimate: called with the spot clicked on the map.
  chooseShadow(dest) {
    const o = this.owner, g = o.game;
    if (!g.canStand(o, dest)) return false;
    // You fade out where you stand (can't be seen or hurt) while a shade forms at the destination. Shooting
    // the shade (enemies) cancels it.
    const shade = g.addDevice({ kind: 'shade', owner: o, pos: [...dest], life: SHADOW_TIME + 0.5 });
    this.shadow = { phase: 'channel', dest, until: this.now + SHADOW_TIME, shade };
    o.st.hiddenUntil = o.st.intangibleUntil = this.now + SHADOW_TIME;
    this.ultPoints = 0;
    this.lastUse.x = this.now;
    g.emit('ability', { who: o, type: 'ult' });
    g.emit('shadowChannel', { who: o, dest });
    return true;
  }

  endShadow(arrived) {
    const o = this.owner;
    this.shadow = null;
    o.st.hiddenUntil = o.st.intangibleUntil = 0;
    o.game.emit('shadowEnd', { who: o, arrived, cancelled: !arrived });
  }

  onDamaged() {
    if (this.pilot && this.pilot.kind === 'owl') { this.pilot.removed = true; this.pilot = null; } // body hit: drone drops
  }

  // Agents that act from the grave (Thistle): smokes from the map and her ultimate.
  tickDead(now) {
    this.now = now;
    const o = this.owner, inp = o.input, ab = this.agent.abilities, g = o.game;
    this.recharge('e', now);
    if (inp.abE) {
      if (this.mapPick && this.mapPick.key === 'e') this.mapConfirm();
      else if (!this.mapPick && this.charges.e > 0) ab.e.use(this, now);
    }
    if (inp.abX && this.ultPoints >= this.ultCost && o.deathPos && !this.mapPick) this.notDeadYet();
    this.runTimers(now);
  }

  // Fire due delayed effects. After death only the ones that don't need the owner's body still go off.
  runTimers(now) {
    this.now = now;
    if (!this.timers.length) return;
    const due = this.timers.filter(t => now >= t.at);
    if (!due.length) return;
    this.timers = this.timers.filter(t => now < t.at);
    for (const t of due) if (this.owner.alive || !t.self) t.fn();
  }

  notDeadYet() {
    const o = this.owner, g = o.game, p = o.deathPos;
    this.ultPoints = 0;
    this.lastUse.x = this.now;
    this.mapPick = null;
    o.alive = true;
    o.hp = PLAYER.hp;
    o.pos = [...p]; o.prevPos = [...p]; o.vel = [0, 0, 0];
    o.prevEyeY = p[1] + o.eyeOff;
    o.respawnAt = Infinity;
    this.mustScoreUntil = this.now + 10;
    o.equip(o.inv.primary ? 'primary' : 'secondary', this.now, true);
    g.emit('respawn', { who: o, revived: true });
    g.emit('ability', { who: o, type: 'rekindled' });
  }

  // Called when this kit's owner damages an enemy: earning back a Not Dead Yet life.
  onDealt() { if (this.mustScoreUntil) this.mustScoreUntil = 0; }

  // Second Dawn and Overload: instead of dying, go down for a moment and get back up at full health.
  saveFromDeath() {
    const o = this.owner, now = this.now;
    let delay = 0;
    if (now < this.secondLife) { this.secondLife = 0; delay = 2; }
    else if (now < this.nullUntil && !this.nullSaved) { this.nullSaved = true; delay = 3; }
    else return false;
    o.hp = 1; o.armor = 0;
    o.st.downedUntil = now + delay;
    o.st.intangibleUntil = now + delay;
    o.st.slowUntil = now + delay; o.st.slowAmt = 0.9;
    o.game.emit('ability', { who: o, type: 'downed' });
    mine(this, delay, () => { o.hp = PLAYER.hp; o.armor = this.nullArmor ?? PLAYER.armor; o.game.emit('ability', { who: o, type: 'rekindled' }); if (!this.busy()) o.equip(o.slot, this.now, true); });
    return true;
  }

  // Cinder's ultimate: back to the mark at full health.
  revive() {
    const o = this.owner, r = this.rebirth, g = o.game;
    this.rebirth = null;
    o.hp = PLAYER.hp;
    o.armor = r.armor ?? PLAYER.armor;
    for (const k of Object.keys(o.st)) if (k.endsWith('Until')) o.st[k] = 0;
    o.yaw = r.yaw; o.pitch = r.pitch;
    g.teleport(o, r.pos);
    g.emit('ability', { who: o, type: 'rekindled' });
  }

  tickBlades(now) {
    const b = this.blades, o = this.owner, inp = o.input;
    if (b.left <= 0) {
      if (now >= b.next) { this.blades = null; o.equip(o.slot, now, true); }
      return;
    }
    if (now < b.next) return;
    if (inp.altPressed) {
      // Fan out every remaining blade at once.
      const n = b.left;
      b.left = 0; // spend them first so a kill during the throw can refill the set
      for (let i = 0; i < n; i++) {
        const off = (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2) * BLADES.fan * DEG;
        this.throwBlade(o.yaw + off, o.pitch);
      }
      b.next = now + (b.left > 0 ? BLADES.cycle : 0.5);
    } else if (inp.firePressed) {
      b.left--;
      this.throwBlade(o.yaw, o.pitch);
      b.next = now + (b.left > 0 ? BLADES.cycle : 0.5);
    }
  }

  throwBlade(yaw, pitch) {
    const o = this.owner, g = o.game;
    const sp = BLADES.spread * DEG * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
    const d = dirFromAngles(yaw + Math.cos(th) * sp, pitch + Math.sin(th) * sp);
    const eye = o.eye();
    const res = g.trace(o, eye, d, 0);
    const end = [eye[0] + d[0] * res.endT, eye[1] + d[1] * res.endT, eye[2] + d[2] * res.endT];
    o.stats.shots++;
    g.emit('tracer', { who: o, gun: { def: BLADES }, from: eye, to: end, blade: true });
    g.emit('blade', { who: o });
    for (const imp of res.impacts) g.emit('impact', { who: o, point: [eye[0] + d[0] * imp.t, eye[1] + d[1] * imp.t, eye[2] + d[2] * imp.t], normal: imp.n, box: imp.box });
    if (res.hit) {
      const { c, part, t } = res.hit;
      const b = BLADES.dmg[0];
      g.damage(c, o, part === 'head' ? b[1] : part === 'body' ? b[2] : b[3], { part, def: BLADES, dist: t, point: end, wallbang: false });
    }
  }

  tickBeams(now) {
    const b = this.beams, o = this.owner;
    if (b.left <= 0 || now >= b.until) { if (now >= b.next) this.beams = null; return; }
    if (now < b.next || !o.input.firePressed) return;
    b.left--;
    b.next = now + (b.left > 0 ? 1.0 : 0.6);
    o.game.beam(o, o.eye(), dirFromAngles(o.yaw, o.pitch), BEAMS);
  }

  onKill(def, victim) {
    this.lastKillAt = this.now;
    if (this.now < this.focusUntil && victim) {
      const e = victim.eye();
      this.owner.game.addDevice({ kind: 'focusorb', owner: this.owner, pos: [e[0], e[1] + 0.6, e[2]], life: 3 });
    }
    if (def?.id === 'tourdeforce' && victim) this.owner.game.addZone({ kind: 'slowfield', color: 0xe8c26a, owner: this.owner, pos: [...victim.pos], r: 4.5, life: 6, slowField: 0.6 }, this.now);
    if (this.overdrive) { this.overdrive.fuel = 100; this.energy = 100; this.slideAt = 0; } // Overload: kills refill it and give the slide back
    else if (this.slideAt === Infinity && ++this.slideKills >= 2) { this.slideAt = 0; this.slideKills = 0; } // 5v5: two kills give the slide back
    // Tailwind, Hot Hands, Paint Shells, Refract: every two kills bring a used charge back.
    for (const k of ABILITY_KEYS) {
      const a = this.agent.abilities[k];
      if (a.recharge !== 'kills' || this.charges[k] >= a.charges) continue;
      if (++this.killCharge[k] >= 2) { this.charges[k]++; this.killCharge[k] = 0; }
    }
    if (this.blades && def === BLADES) this.blades.left = BLADES.count; // a blade kill refills the set
    else if (!this.blades && !this.beams) this.ultPoints = Math.min(this.ultCost, this.ultPoints + 1);
    if (this.id === 'vex' && victim) {
      if (this.now < this.empressUntil) { this.empressUntil = this.now + 30; this.healOver(100, 3, 150); } // Empress: kills feed you
      else this.orbs.push({ pos: victim.eye(), until: this.now + 3, life: 3 }); // soul orb to Devour or Dismiss
      this.owner.game.emit('orb', { kit: this, orb: this.orbs[this.orbs.length - 1] });
    }
  }

  // Third wave: sprint/slide, lightning beam, phase-out, piloted tiger, camera view + dart.
  tickWave3(now) {
    const o = this.owner, inp = o.input, g = o.game, DT = 1 / 128;
    if (this.highGear) {
      if (!this.overdrive) this.energy -= 10 * DT; // in Overload the sprint runs on Overload's meter
      if (this.energy <= 0) { this.energy = 0; this.highGear = null; }
      else if (((inp.crouch && !this.prevCrouch) || inp.altPressed) && now >= this.slideAt && o.grounded) {
        const len = Math.hypot(inp.fwd, inp.side), sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
        const dir = len > 0 ? [(-sy * inp.fwd + cy * inp.side) / len, (-cy * inp.fwd - sy * inp.side) / len] : [-sy, -cy];
        o.dash = { until: now + 0.32, dir, speed: 13, exit: 8 };
        this.slideAt = g.mode ? Infinity : now + 8; // 5v5: one slide a round, back after two kills
        if (!this.overdrive) { // the slide ends Overclock and the gun comes back out; in Overload you keep running
          this.highGear = null;
          o.equip(o.slot, now, true);
        }
        g.emit('ability', { who: o, type: 'dash' });
      }
    } else this.energy = Math.min(100, this.energy + 4 * DT);
    this.prevCrouch = inp.crouch;

    if (this.overdrive) {
      this.overdrive.fuel -= 5 * DT; // 20 s of beam unless kills top it up
      if (this.overdrive.fuel <= 0) { this.overdrive = null; this.highGear = null; o.equip(o.slot, now, true); }
      else if (inp.fire && now >= this.overdrive.next) {
        this.overdrive.next = now + 1 / 15;
        const sp = 0.25 * DEG * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
        const d = dirFromAngles(o.yaw + Math.cos(th) * sp, o.pitch + Math.sin(th) * sp), eye = o.eye();
        const res = g.trace(o, eye, d, 0);
        const end = [eye[0] + d[0] * res.endT, eye[1] + d[1] * res.endT, eye[2] + d[2] * res.endT];
        o.stats.shots++;
        g.emit('tracer', { who: o, gun: { def: OVERDRIVE }, from: eye, to: end, finger: true });
        g.emit('overloadShot', { who: o });
        if (res.hit) {
          const b = OVERDRIVE.dmg[0], part = res.hit.part;
          g.damage(res.hit.c, o, part === 'head' ? b[1] : part === 'body' ? b[2] : b[3], { part, def: OVERDRIVE, dist: res.hit.t, point: end, wallbang: false });
        }
      }
    }

    if (this.drift && now >= this.drift.until) this.drift = null;

    if (this.pilot) {
      const t = this.pilot;
      if (t.removed) this.pilot = null;
      else if (t.leapt) this.pilot = null;
      else if (t.kind === 'owl' && inp.firePressed && now >= t.dartReady) {
        // Tracking dart from the drone: an enemy hit is revealed in two pings.
        t.dartReady = now + 5;
        const d = dirFromAngles(o.yaw, o.pitch), res = g.trace(o, t.pos, d, 0);
        g.emit('tracer', { who: o, gun: { def: BEAMS }, from: t.pos, to: [t.pos[0] + d[0] * res.endT, t.pos[1] + d[1] * res.endT, t.pos[2] + d[2] * res.endT], device: true });
        if (res.hit) {
          const c = res.hit.c;
          g.emit('tag', { pos: c.eye() });
          later(this, 1.6, () => { c.st.revealUntil = this.now + 0.6; g.emit('tag', { pos: c.eye() }); });
          later(this, 2.8, () => { c.st.revealUntil = this.now + 0.6; g.emit('tag', { pos: c.eye() }); });
        }
      }
      else if (t.kind === 'sdrone' && inp.firePressed && now - t.born > 0.25) {
        t.removed = true;
        this.pilot = null;
        g.pulse(o, t.pos, 16, 'reveal', 4, 0xd9a441);
        g.pulse(o, t.pos, 16, 'near', 2.5, 0xd9a441);
      }
    }

    if (this.view) {
      const cam = this.view;
      if (cam.removed) this.view = null;
      else if (inp.firePressed && now >= (cam.dartReady || 0)) {
        cam.dartReady = now + 6;
        const d = dirFromAngles(o.yaw, o.pitch), res = g.trace(o, cam.pos, d, 0);
        g.emit('tracer', { who: o, gun: { def: OVERDRIVE }, from: cam.pos, to: [cam.pos[0] + d[0] * res.endT, cam.pos[1] + d[1] * res.endT, cam.pos[2] + d[2] * res.endT], device: true });
        if (res.hit) cam.dart = { target: res.hit.c, until: now + 8, next: now };
      }
    }
  }

  // Heal `amount` over `time`, up to `cap` health. Overheal above 100 stays for 10 s after the heal, then fades.
  healOver(amount, time, cap = PLAYER.hp) { this.healOverUntil = this.now + time; this.healOverRate = amount / time; this.healCap = cap; this.overhealUntil = this.now + time + 10; }

  // The nearest live soul orb at any distance, consumed if found (Devour and Dismiss find it themselves).
  takeOrb() {
    const e = this.owner.eye();
    let i = -1, best = Infinity;
    this.orbs.forEach((b, j) => {
      const dist = Math.hypot(b.pos[0] - e[0], b.pos[1] - e[1], b.pos[2] - e[2]);
      if (b.until > this.now && dist < best) { best = dist; i = j; }
    });
    if (i < 0) return false;
    this.orbs[i].until = 0;
    this.orbs.splice(i, 1);
    return true;
  }

  // Ongoing per-tick effects for the second wave of agents.
  tickExtras(now) {
    const o = this.owner, g = o.game, DT = 1 / 128;
    // Fire-rate buffs: stim beacon, empress; Ravenous also speeds up equipping and reloading
    let rate = 1;
    if (o.st.stimUntil > now) rate *= 1.1;
    if (now < this.empressUntil) rate *= 1.15;
    if (now < this.nullUntil) rate *= 1.1;
    const handling = now < this.empressUntil ? 1.15 : 1;
    for (const slot in o.inv) { const gun = o.inv[slot]; if (gun) { gun.buffRate = rate; gun.buffRecoil = 1; gun.buffHandling = handling; } }
    // Ability guns are gone once their last round is fired.
    const ag = o.inv.ability;
    if (ag && ag.mag <= 0 && now >= ag.nextFire - 0.05) {
      o.inv.ability = null;
      if (o.slot === 'ability') o.equip(o.inv.primary ? 'primary' : 'secondary', now, true);
    }
    for (const z of g.zones) if (z.kind === 'stim' && o.alive && !g.isEnemy(z.owner, o) && Math.hypot(o.pos[0] - z.pos[0], o.pos[2] - z.pos[2]) < z.r) o.st.stimUntil = now + 4;
    // Bloom channel: heal teammates in sight from the pool while C is held (bots: a few seconds).
    const rg = this.regrow;
    if (rg?.on) {
      const held = o.isBot ? now < rg.botUntil : o.input.abCHeld;
      const tg = o.alive && held ? bloomTargets(o) : [];
      if (!o.alive || !held || (o.isBot && !tg.length)) rg.on = false;
      else {
        o.st.channelUntil = now + DT * 2; // hands busy: no shooting while channelling
        for (const c of tg) { const h = Math.min(BLOOM.rate * DT, rg.pool, PLAYER.hp - c.hp); c.hp += h; rg.pool -= h; }
        rg.healing = tg;
      }
      if (rg.pool <= 0.01) this.regrow = null;
    }
    // Heal over time (Devour), overheal decays back to 100
    if (now < this.healOverUntil) { if (o.hp < this.healCap) o.hp = Math.min(this.healCap, o.hp + this.healOverRate * DT); }
    else if (o.hp > PLAYER.hp && now >= (this.overhealUntil || 0) && !(now < this.empressUntil)) o.hp = Math.max(PLAYER.hp, o.hp - 25 * DT);
    // Viper's Pit holds while Venom stays inside it; once she leaves it ends 8 s later.
    const nz = this.nestZone;
    if (nz && now < nz.until && o.alive && Math.hypot(o.pos[0] - nz.pos[0], o.pos[2] - nz.pos[2]) < nz.r) { nz.until = now + 8; if (this.nest) this.nest.until = now + 8; }
    if (this.launcher && now >= this.launcher.until) this.launcher = null; // Finale: 10 s to fire it
    this.orbs = this.orbs.filter(b => b.until > now);
    // Viper fuel: drains while any gas is on, refills when it's all off
    const groups = Object.values(this.gas.groups);
    const on = groups.filter(gr => gr.active);
    if (on.length) {
      this.gas.fuel = Math.max(0, this.gas.fuel - 7 * on.length * DT);
      if (this.gas.fuel <= 0) for (const gr of on) gasOff(this, gr);
    } else this.gas.fuel = Math.min(100, this.gas.fuel + 12 * DT);
    // Rocket launcher
    if (this.launcher && o.input.firePressed && now >= this.launcher.ready) {
      this.launcher = null;
      const pos = aimPoint(o, 120, { back: 0.3, bodies: true });
      const e = o.eye(), r = right(o.yaw), f = dirFromAngles(o.yaw, o.pitch);
      const muzzle = [e[0] + r[0] * 0.25 + f[0] * 0.6, e[1] - 0.15 + f[1] * 0.6, e[2] + r[1] * 0.25 + f[2] * 0.6]; // leaves the launcher on the right shoulder
      g.emit('throw', { who: o, from: muzzle, to: pos, time: Math.max(0.1, Math.hypot(pos[0] - o.pos[0], pos[2] - o.pos[2]) / 45), color: 0xff8c2e, rocket: true });
      later(this, Math.max(0.1, Math.hypot(pos[0] - o.pos[0], pos[2] - o.pos[2]) / 45), () => g.explode(o, pos, 7, 150, 30, src('rocket', 'Finale'), 0xff8c2e, true, false, 4));
      g.emit('ability', { who: o, type: 'rocket' });
    }
  }
}

// ---------- movement hooks, called from Combatant.move ----------
export function applyDash(c, now, dt) {
  if (!c.dash) return;
  if (now < c.dash.until) {
    c.vel[0] = c.dash.dir[0] * (c.dash.speed || DASH.speed);
    c.vel[2] = c.dash.dir[1] * (c.dash.speed || DASH.speed);
    c.vel[1] = Math.max(0, c.vel[1]) + PLAYER.gravity * dt; // hover: cancels this tick's gravity
  } else {
    const ex = c.dash.exit || DASH.exit;
    c.vel[0] = c.dash.dir[0] * ex;
    c.vel[2] = c.dash.dir[1] * ex;
    c.airCap = ex;
    c.dash = null;
  }
}

export function applyGlide(c) {
  if (c.kit?.id === 'zephyr' && !c.grounded && c.input.jumpHeld && c.vel[1] < -GLIDE_FALL) c.vel[1] = -GLIDE_FALL;
}

// Thin wall-shaped smokes (fire wall, water wall, gas wall, static lanes): an oriented box `len` long along
// `dir`, `th` thick and `h` tall, centred on pos. Segment test in the slab's own frame.
export function segHitsSlab(s, a, b) {
  const { dir, len, th, h } = s.slab, c = s.pos;
  const ux = dir[0], uz = dir[1], vx = -uz, vz = ux; // along, across
  const loc = (p) => [(p[0] - c[0]) * ux + (p[2] - c[2]) * uz, p[1] - c[1], (p[0] - c[0]) * vx + (p[2] - c[2]) * vz];
  const A = loc(a), B = loc(b), half = [len / 2, h / 2, th / 2];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = B[i] - A[i];
    if (Math.abs(d) < 1e-9) { if (Math.abs(A[i]) > half[i]) return false; continue; }
    let ta = (-half[i] - A[i]) / d, tb = (half[i] - A[i]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
export function insideSlab(s, p, pad = 0) {
  const { dir, len, th, h } = s.slab, c = s.pos;
  const a = (p[0] - c[0]) * dir[0] + (p[2] - c[2]) * dir[1], x = (p[0] - c[0]) * -dir[1] + (p[2] - c[2]) * dir[0];
  return Math.abs(a) <= len / 2 + pad && Math.abs(x) <= th / 2 + pad && Math.abs(p[1] - c[1]) <= h / 2;
}
export const SLAB = { h: 3.9, th: 0.35 };

// Does any active smoke (or fire wall) block the segment a -> b?
export function smokeBlocks(smokes, a, b, now) {
  for (const s of smokes) {
    if (now < s.born + SMOKE.grow * 0.6 || now > s.until) continue;
    if (s.slab) { if (segHitsSlab(s, a, b)) return true; continue; }
    const r = s.radius; // the cloud is one sphere of this radius: block exactly what is drawn
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
    let t = ((s.pos[0] - a[0]) * dx + (s.pos[1] - a[1]) * dy + (s.pos[2] - a[2]) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx * t - s.pos[0], py = a[1] + dy * t - s.pos[1], pz = a[2] + dz * t - s.pos[2];
    if (px * px + py * py + pz * pz < r * r) return true;
  }
  return false;
}
