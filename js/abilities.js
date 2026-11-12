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

// Numbers follow VALORANT_SPECS.md (the Valorant ability specs for patch 13.10) unless a comment says otherwise.
export const LIFT_HEIGHT = 5; // Lift (Updraft) carries you about 5 m up
export const DASH = { speed: 24.4, time: 0.45, exit: 7 }; // Tailwind: 11 m in 0.45 s, keep 7 m/s afterwards
export const GLIDE_FALL = 2.5; // max fall speed while gliding, m/s
// Thrown abilities: the VALORANT wiki's projectile classes as [speed in m/s, gravity scale on 9.8 m/s²].
export const THROW = { lob: [6.3, 0.3], c1: [16.5, 0.7], c2: [18, 0.3], c3: [29, 0.45], c4: [41.25, 0.3], c5: [41.25, 0.15] };
export const SMOKE = { radius: 2.8, life: 4.5, range: 14, grow: 0.25 };
export const BLADES = {
  id: 'blades', name: 'Edgestorm', cat: 'Ability', model: 'blades', count: 5, cycle: 0.17,
  dmg: [[50, 150, 50, 42]], spread: 0.15, fan: 2.2, // 50 body, x3 head, x0.85 legs
};
// Overload (Overdrive): 18 to the body out to 20 m, falling to 10 at 43 m; head x3, legs x0.85. 20 shots a second
// from a 40-round magazine that refills by itself.
export const OVERDRIVE = { id: 'overload', name: 'Overload', cat: 'Ability', dmg: [[50, 54, 18, 15]], rate: 20, mag: 40, near: 20, far: 43, farBody: 10 };
export const BEAMS = { id: 'beams', name: 'Talon Strike', cat: 'Ability', count: 3, time: 6, dmg: 80, width: 1.76, range: 66, reveal: 1.2 }; // a capsule 66 m long, 1.76 m in radius
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
// Where Glare's eye goes: 10 m straight along the aim, through walls, kept a little above the floor below it.
function glareSpot(o) {
  const e = o.eye(), d = dirFromAngles(o.yaw, o.pitch), p = [e[0] + d[0] * 10, e[1] + d[1] * 10, e[2] + d[2] * 10];
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
// Throw from the eye along the aim as a real projectile of a wiki class (game.throwProj).
const toss = (o, cls, opts) => o.game.throwProj(o, THROW[cls][0], THROW[cls][1], opts);
// The floor under p (within 6 m below it), or p itself.
function floorUnder(g, p) {
  const f = g.world.raycast([p[0], p[1] + 0.3, p[2]], [0, -1, 0], 6.3);
  return f ? [p[0], p[1] + 0.3 - f.t, p[2]] : [...p];
}
// Hawke's bow: the charge picks how the arrow flies (0, 1, 2 bars or full: the wiki's classes 2, 3, 4 and 5).
const bowClass = (kit) => { const p = kit.power ?? 1; return p >= 0.999 ? 'c5' : p >= 2 / 3 ? 'c4' : p >= 1 / 3 ? 'c3' : 'c2'; };
const bowHint = (kit) => `HOLD LEFT CLICK TO CHARGE · RIGHT CLICK: BOUNCES (${kit.bounces || 0})`;
// Kicker (Blast Pack) going off: it throws everyone near it, and once armed it hurts enemies too.
function blowSatchel(o, d) {
  const g = o.game;
  d.removed = true;
  g.knockback(o, d.pos, 3.8, 16, 12.5);
  if (g.time >= d.armAt) g.explode(o, d.pos, 5, 50, 10, src('kicker', 'Kicker'), 0xffb547, false, false, 1.5);
}
// Nyx's thrown orbs (Grasp, Omen Eye): pressing the key again while one is in the air drops it straight down.
function dropOrbNow(kit) {
  const d = kit.orb;
  if (!d || d.removed || d.rest || d.dropped) return false;
  d.dropped = true; d.vel = [0, Math.min(0, d.vel[1]), 0]; d.g = d.drop.g;
  return true;
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
// It takes 30 fuel to switch on, and a source that was switched off needs `gr.cd` seconds before it can go again.
function gasOn(kit, gr) {
  const g = kit.owner.game;
  if (gr.active || kit.gas.fuel < 30 || kit.now < (gr.readyAt || 0)) return false;
  gr.active = true;
  gr.onAt = kit.now;
  gr.items = [];
  const h = gr.h || SLAB.h;
  for (const p of gr.points) {
    if (gr.slab) gr.items.push(g.addSmoke(kit.owner, [p[0], p[1] + h / 2, p[2]], kit.now, { radius: 1, life: 999, color: 0x58c76a, kind: 'gas', slab: { dir: gr.slab, len: 2.1, th: SLAB.th, h } }));
    else gr.items.push(g.addSmoke(kit.owner, [p[0], p[1] + 1.3, p[2]], kit.now, { radius: gr.r, life: 999, color: 0x58c76a, kind: 'gas' }));
    gr.items.push(g.addZone({ kind: 'fire', color: 0x58c76a, owner: kit.owner, pos: p, r: gr.r, life: 999, dps: 0, heal: 0, toxin: TOXIN, def: src('toxin', 'Toxin'), gas: true }, kit.now));
  }
  g.emit('ability', { who: kit.owner, type: 'gas' });
  return true;
}
// Toxin: 10 Decay on first contact, then 10 a second while inside (game.tickZones).
const TOXIN = { first: 10, rate: 10 };
function gasOff(kit, gr) {
  if (!gr.active) return;
  gr.active = false;
  gr.readyAt = kit.now + (gr.cd || 0);
  for (const it of gr.items) it.until = kit.now;
  gr.items = [];
}

// Placed utility its owner can pick back up with F, by Valorant's rules: which key's charge comes back, after
// how long (in the buy phase it is always straight back), and what can only be picked up in the buy phase.
// Stars are recalled from anywhere you can look at them; everything else has to be within reach.
export const PICKUPS = {
  wire: { k: 'c', cd: 0 },             // Trapwire
  cam: { k: 'e', cd: 20 },             // Spycam (13.10)
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
function allyInView(kit, { dead = false, range = 20, maxDeg = 12, enemy = false, maxAge = 0 } = {}) { // enemy: an enemy instead; maxAge: bodies no older than this
  const o = kit.owner, g = o.game, e = o.eye(), f = dirFromAngles(o.yaw, o.pitch);
  let best = null, bestCos = Math.cos(maxDeg * DEG);
  for (const c of g.combatants) {
    if (c === o || g.isEnemy(o, c) !== enemy || c.alive === dead) continue;
    if (dead && maxAge && g.time - c.diedAt > maxAge) continue;
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
        name: 'Veil', desc: 'Throw a smoke orb (29 m/s). Hold C and it curves toward your crosshair; let go and it falls. It bursts into a 2.5 s smoke on the first surface it touches, or after 2 s in the air.', charges: 2, cooldown: 16, instant: true,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          o.game.addDevice({ kind: 'cloud', owner: o, pos: [e[0] + d[0] * 0.6, e[1] + d[1] * 0.6, e[2] + d[2] * 0.6], dir: d, vel: d.map(v => v * THROW.c3[0]), life: 2, speed: THROW.c3[0], key: 'abCHeld', radius: 3.35, smokeLife: 2.5, color: 0xcfdbe6 });
        },
      },
      q: {
        name: 'Lift', desc: 'Launch yourself about 5 m straight up.', charges: 1, cooldown: 9, instant: true,
        use(kit) {
          const o = kit.owner;
          o.game.emit('ability', { who: o, type: 'windup' });
          mine(kit, 0.1, () => {
            o.vel[1] = Math.sqrt(2 * PLAYER.gravity * LIFT_HEIGHT);
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
        name: 'Edgestorm', desc: 'Draw five throwing blades: left click throws one (150 head / 50 body / 42 legs), right click fans out all of them. Each kill refills the set. Switch to a gun and the blades you have left wait for you: press X to take them out again.', points: 8,
        use(kit) {
          kit.blades = { left: BLADES.count, next: kit.now + 1.02 }; // 1.02 s to draw the blades
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
        item: 'orb', name: 'Firebreak', desc: 'Hold the flame, then left click: a wall of fire races out 13 m ahead (20 m/s). Keep the button held and turn to bend it. It stands 8 s, blocks sight, burns enemies (30/s) and heals you (up to 50).', charges: 1, cooldown: 25, equip: 0.8,
        armHint: 'LEFT CLICK: CAST · KEEP HOLDING AND TURN TO BEND IT',
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'blaze', owner: o, pos: [o.pos[0] + f[0] * 1.2, o.pos[1], o.pos[2] + f[1] * 1.2], yaw: o.yaw, life: 2, speed: 20, maxDist: 13.4, h: 6.75, pool: { left: 50 }, travelled: 0, nextSeg: 0, key: 'fire' });
          o.game.emit('ability', { who: o, type: 'fire' });
        },
      },
      q: {
        item: 'grenade', name: 'Ember', desc: 'Hold a fireball: left click throws it, right click lobs it short. It drops after 1.5 s in the air and bursts on the ground into a pool of fire that spreads to 4.5 m and burns for 4 s (60/s to enemies; heals you, up to 50).', charges: 1, cooldown: 18, equip: 0.8,
        armHint: 'LEFT CLICK: THROW · RIGHT CLICK: LOB', throw: 'c2',
        use(kit, mode) {
          const o = kit.owner, g = o.game;
          toss(o, mode === 'right' ? 'lob' : 'c2', { color: 0xff7a2e, drop: { at: 1.5, g: 2 }, onStop: (d) => {
            d.removed = true;
            g.addZone({ kind: 'fire', owner: o, pos: floorUnder(g, d.pos), r: 4.5, spread: 6, life: 4, dps: 60, heal: 12.5, healPool: { left: 50 }, def: src('ember', 'Ember') }, g.time);
          } });
        },
      },
      e: {
        item: 'flash', name: 'Sunflare', desc: 'Hold a flare in your hand (no gun), then left click to curve it left or right click to curve it right. It bursts around the corner 0.7 s later, blinding anyone facing it for up to 1.5 s. In 5v5 one is free each round and two kills bring a used one back.', charges: 2, cooldown: 14, recharge: 'kills', equip: 0.8,
        arm: true, armHint: 'LEFT CLICK: CURVE LEFT · RIGHT CLICK: CURVE RIGHT',
        use(kit, mode) {
          const o = kit.owner, g = o.game, eye = o.eye();
          const f = fwd2(o.yaw), r = right(o.yaw), side = mode === 'right' ? 1 : -1;
          const mid = [eye[0] + f[0] * 3, eye[1] + 0.2, eye[2] + f[1] * 3];
          let pop = [mid[0] + r[0] * side * 3.2, mid[1], mid[2] + r[1] * side * 3.2];
          if (!g.world.lineOfSight(eye, mid)) pop = aimPoint(o, 3, { back: 0.5 });
          else if (!g.world.lineOfSight(mid, pop)) pop = mid;
          const ft2 = 0.7; // it goes off 0.7 s after the throw
          g.emit('throw', { who: o, from: eye, via: mid, to: pop, time: ft2, color: 0xffc061 });
          later(kit, ft2, () => g.flash(o, pop, 1.5));
        },
      },
      x: {
        name: 'Rekindle', desc: 'Mark where you stand. For 10 s you can fight freely: if you die, or when time runs out, you burn away and re-form at the mark 2.4 s later at full health, with the shields you had. The death does not count.', points: 7,
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
        name: 'Rift', desc: 'Hold it: a marker shows where you will land (up to 15 m) and follows your aim. Left click to go; 0.7 s later you step through the shadows to it, and take another 0.5 s to arrive before you can shoot.', charges: 2, cooldown: 25, equip: 0.5,
        preview(kit) { return landing(kit.owner, 15); },
        use(kit) {
          const o = kit.owner, pos = target(kit, this);
          if (!pos) return false;
          o.game.emit('ability', { who: o, type: 'step', pos });
          o.st.channelUntil = kit.now + 1.2; // 0.7 s wind-up and 0.5 s arriving: no gun for either
          mine(kit, 0.7, () => o.game.teleportNear(o, pos));
        },
      },
      q: {
        name: 'Dread', desc: 'Send a wave of shadow straight ahead (20 m/s, 25 m) that passes through walls. Everyone it touches, teammates included, is nearsighted and deafened for 2 s.', charges: 1, cooldown: 30, equip: 1.1,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const end = [eye[0] + d[0] * 25, eye[1] + d[1] * 25, eye[2] + d[2] * 25];
          g.emit('throw', { who: o, from: eye, to: end, time: 25 / 20, color: 0x7a4dff, wave: true });
          g.sweep(o, eye, d, 20, 25, { r: 4.3, all: true, apply: (c) => { g.status(c, 'near', 2, { near: 7.5 }); g.status(c, 'deaf', 2); } });
        },
      },
      e: {
        name: 'Shade', desc: 'Hold the orb: your view follows the smoke out through walls, and the sphere shows exactly where it will form. It passes through walls: hold right click to push it farther (up to 80 m), press R to make it stop at the first wall instead, left click to cast. The orb flies there at 64 m/s and the smoke lasts 14.7 s.', charges: 2, cooldown: 40, equip: 1,
        armHint: 'LEFT CLICK: CAST · HOLD RIGHT CLICK: FARTHER · R: STOP AT WALLS', shadowSight: true,
        smokePreview: 4.1, distance: { min: 4, max: 80, start: 16, speed: 22 },
        preview(kit) { return smokeTarget(kit, 4.1); },
        use(kit) {
          const o = kit.owner, pos = [...target(kit, this)], e = o.eye();
          const ft = Math.hypot(pos[0] - e[0], pos[1] - e[1], pos[2] - e[2]) / 64; // the orb flies there at 64 m/s...
          o.game.emit('throw', { who: o, from: e, to: pos, time: Math.max(0.05, ft), color: 0xa67bff, straight: true });
          later(kit, ft + 0.3, () => o.game.addSmoke(o, pos, kit.now, { radius: 4.1, life: 14.7, color: 0x5b3f8f })); // ...and blooms 0.3 s after it arrives
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
        name: 'Kestrel', desc: 'Hold the drone, left click to launch it. Fly it with WASD and your mouse for up to 7 s while your body stands exposed (damage to your body ends it). Left click fires a tracking dart (every 5 s): an enemy it hits is revealed in two pings.', charges: 1, cooldown: 40, item: 'device', equip: 0.9,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          kit.pilot = o.game.addDevice({ kind: 'owl', owner: o, pos: [e[0] + d[0] * 0.8, e[1] + 0.3, e[2] + d[2] * 0.8], dir: d, life: 7, fly: true, dartReady: kit.now + 0.4 });
        },
      },
      q: {
        name: 'Arc Dart', desc: 'Draw the bow. Hold left click to charge (three bars over 1 s: each one flies faster and flatter), release to fire. Right click sets 0, 1 or 2 bounces. The dart explodes where it ends up: 75 damage within 1.5 m, down to 30 at 4 m.', charges: 2, cooldown: 25, item: 'bow', charge: 1, equip: 0.8, bounces: true,
        armHint: bowHint, throw: bowClass,
        use(kit) {
          const o = kit.owner, g = o.game;
          const boom = (d) => { d.removed = true; g.explode(o, d.pos, 4, 75, 30, src('arcdart', 'Arc Dart'), 0x6ab7ff, false, false, 1.5); };
          toss(o, bowClass(kit), { rule: 'bounce', bounces: kit.bounces || 0, bounce: 0.7, friction: 1, hitBodies: true, model: 'arrow', color: 0x6ab7ff, fuse: 4, onStop: boom, onFuse: boom });
        },
      },
      e: {
        name: 'Sonar Bolt', desc: 'Draw the bow. Hold left click to charge (three bars over 1 s), release to fire; right click sets 0, 1 or 2 bounces. The bolt sticks where it lands and pulses twice (0.7 s after landing, then 1.6 s later), revealing every enemy in its line of sight within 30 m. Enemies can shoot it out (20 HP).', charges: 1, cooldown: 50, item: 'bow', charge: 1, equip: 0.8, bounces: true,
        armHint: bowHint, throw: bowClass,
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, bowClass(kit), { rule: 'bounce', bounces: kit.bounces || 0, bounce: 0.7, friction: 1, model: 'arrow', color: 0x6ab7ff, onStop: (d) => {
            d.removed = true;
            const bolt = g.addDevice({ kind: 'recon', owner: o, pos: [...d.pos], life: 2.6 });
            // Sonar: a sphere squashed to 0.4 of its height, and only what the bolt can see.
            for (const t of [0.7, 2.3]) later(kit, t, () => { if (!bolt.removed) g.pulse(o, bolt.pos, 30, 'reveal', 2.5, 0x6ab7ff, true, { flat: 0.4 }); });
          } });
        },
      },
      x: {
        name: 'Talon Strike', desc: 'Fire up to three energy beams (66 m long, 3.5 m across) within 6 s, at least 0.75 s apart. They go through every wall, dealing 80 damage and revealing whoever they hit. You stand still while you do.', points: 8,
        use(kit) {
          kit.beams = { left: BEAMS.count, until: kit.now + BEAMS.time + 0.8, next: kit.now + 0.8 }; // 0.8 s to draw
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
        item: 'grenade', name: 'Hive', desc: 'Throw a swarm grenade (left click) or lob it short (right click); it hides where it lands. Once both are out — or you have none left — press C again to set them off: 0.5 s later, 45/s for 5 s in a 4.5 m radius.', charges: 2, cooldown: 40, equip: 0.74,
        armHint: 'LEFT CLICK: THROW · RIGHT CLICK: LOB', throw: 'c2',
        use(kit, mode) {
          const o = kit.owner, g = o.game;
          toss(o, mode === 'right' ? 'lob' : 'c2', { color: 0x4fd1a5, onStop: (d) => { d.removed = true; g.addDevice({ kind: 'swarm', owner: o, pos: floorUnder(g, d.pos), life: 90 }); } });
        },
        reuse(kit) {
          if (kit.charges.c > 0) return false;
          const g = kit.owner.game;
          const mine = g.devices.filter(d => d.kind === 'swarm' && d.owner === kit.owner && !d.removed);
          if (!mine.length) return false;
          for (const d of mine) {
            d.removed = true;
            g.addZone({ kind: 'fire', color: 0x9be15d, owner: kit.owner, pos: d.pos, r: 4.5, life: 5.5, armAt: kit.now + 0.5, dps: 45, heal: 0, def: src('hive', 'Hive') }, kit.now); // damage starts after 0.5 s, then 5 s
          }
          g.emit('ability', { who: kit.owner, type: 'swarm' });
          return true;
        },
      },
      q: {
        item: 'device', name: 'Watchdog', desc: 'Deploy an alarm bot (10 m); it takes 1.5 s to dig in. When an enemy comes within 6 m it chases them and bursts 2.5 m from them: Vulnerable (double damage taken) for 4 s. It switches off while you are more than 40 m away.', charges: 1, cooldown: 40, equip: 0.85,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 10, { floor: true, back: 0.4 });
          o.game.addDevice({ kind: 'alarm', owner: o, pos, life: 90, armAt: kit.now + 1.5 });
        },
      },
      e: {
        item: 'device', name: 'Sentry', desc: 'Deploy a turret (4.5 m) facing where you aim. It fires three-round bursts at enemies in its 100° view out to 40 m (8 damage a shot up close, 6 past 20 m, 4 past 35 m; hits slow) until it is destroyed (45 s to get it back) or picked up (20 s). It switches off while you are more than 40 m away. Placing a new one takes the old one down.', charges: 1, cooldown: 45, equip: 1.1,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 4.5, { floor: true, back: 0.5 });
          for (const d of o.game.devices) if (d.kind === 'turret' && d.owner === o) d.removed = true; // one turret at a time
          o.game.addDevice({ kind: 'turret', owner: o, pos, yaw: o.yaw, aimYaw: o.yaw, life: 1e5, next: kit.now + 0.8 });
        },
      },
      x: {
        name: 'Clampdown', desc: 'Plant a device (200 HP) that charges for 13 s, then detains every enemy within 32 m for 8 s: they cannot fire or use abilities and can barely move.', points: 9,
        use(kit) {
          const o = kit.owner;
          o.game.addZone({ kind: 'lockdown', owner: o, pos: [...o.pos], r: 32, life: 13.1, armAt: kit.now + 13, dur: 8, slow: 0.833 }, kit.now); // detained: move x0.167
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
        item: 'device', name: 'Boomer', desc: 'Deploy a bot that unpacks for 0.5 s, then rolls forward and bounces off walls. It locks onto the first enemy it sees ahead within 15 m and explodes 2.5 m from them: 80 within 2 m, down to 30 at 6 m. It lasts 5 s and has 60 HP.', charges: 1, cooldown: 35, equip: 1.1,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'boombot', owner: o, pos: [o.pos[0] + f[0] * 0.8, o.pos[1], o.pos[2] + f[1] * 0.8], dir: [f[0], 0, f[1]], life: 5 });
        },
      },
      q: {
        instant: true, item: 'device', name: 'Kicker', desc: 'Instantly throws a satchel (16.5 m/s) that sticks to the first thing it hits. Press Q again to blow it, even while it is still in the air; it goes off by itself after 5 s. It launches anyone nearby, you included. Once armed (1.5 s) it also deals 50 within 1.5 m, down to 10 at 5 m, never to you. Enemies can shoot it (20 HP).', charges: 2, cooldown: 12,
        use(kit) {
          // The satchel exists from the moment it leaves your hand, so it can be blown mid-air (satchel jumps).
          const o = kit.owner;
          toss(o, 'c1', { kind: 'satchel', rule: 'stick', life: 6, armAt: kit.now + 1.5, fuse: 5, onFuse: (d) => blowSatchel(o, d) });
        },
        reuse(kit) {
          const d = kit.owner.game.devices.find(d => d.kind === 'satchel' && d.owner === kit.owner && !d.removed);
          if (!d) return false;
          blowSatchel(kit.owner, d);
          return true;
        },
      },
      e: {
        item: 'paintshell', name: 'Splatter', desc: 'Throw a cluster grenade (left click) or lob it short (right click). It bounces, and 2 s after the throw explodes (55 within 2.5 m, down to 1 at 5.5 m), tossing out four bomblets that go off for 55 each. In 5v5 it comes back after two kills.', charges: 1, cooldown: 30, recharge: 'kills', equip: 0.8,
        armHint: 'LEFT CLICK: THROW · RIGHT CLICK: LOB', throw: 'c2',
        use(kit, mode) {
          const o = kit.owner, g = o.game;
          toss(o, mode === 'right' ? 'lob' : 'c2', { rule: 'bounce', bounces: Infinity, model: 'paintshell', color: 0xffb547, fuse: 2, onFuse: (d) => {
            const at = [d.pos[0], d.pos[1] + 0.15, d.pos[2]];
            g.explode(o, at, 5.5, 55, 1, src('splatter', 'Splatter'), 0xffb547, false, false, 2.5);
            // Four bomblets thrown out at 45 degrees (9 m/s, full gravity), popping 0.667 s later, 0.1 s apart.
            const a0 = Math.random() * Math.PI * 2;
            for (let i = 0; i < 4; i++) {
              const a = a0 + i * Math.PI / 2, k = Math.SQRT1_2;
              g.throwProj(o, 9, 1, { from: at, dir: [Math.cos(a) * k, k, Math.sin(a) * k], rule: 'bounce', bounces: Infinity, model: 'bomblet', color: 0xff7ab8, fuse: 0.667 + i * 0.1,
                onFuse: (b) => g.explode(o, [b.pos[0], b.pos[1] + 0.15, b.pos[2]], 5.25, 55, 1, src('splatter', 'Splatter'), 0xff7ab8, false, false, 2.5) });
            }
          } });
        },
      },
      x: {
        name: 'Finale', desc: 'Pull out a rocket launcher and left click to fire one rocket within 10 s. It flies straight (25 m/s) and explodes on whatever it hits: 150 damage within 4.5 m, falling to 30 at 7 m. It hurts you too, so don’t fire it at your feet.', points: 8,
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
        instant: true, item: 'device', name: 'Rally', desc: 'Instantly toss a beacon that sets up a 6 m field for 12 s where it lands. You and teammates in it get Combat Stim (10% faster fire rate, reload, draw and recovery) and 10% faster movement, lasting 4 s after you leave.', charges: 1, cooldown: 30, throw: 'c1',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c1', { color: 0xffb547, onStop: (d) => { d.removed = true; g.addZone({ kind: 'stim', color: 0xffb547, owner: o, pos: floorUnder(g, d.pos), r: 6, life: 12 }, g.time); } });
        },
      },
      q: {
        item: 'grenade', name: 'Napalm', desc: 'Fire an incendiary grenade from the launcher (29 m/s). It bounces off walls and bursts on the floor into a fire that spreads to 4.5 m and burns for 7 s (60/s).', charges: 1, cooldown: 25, equip: 1.1, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { color: 0xff6a1a, onStop: (d) => {
            d.removed = true;
            g.addZone({ kind: 'fire', owner: o, pos: floorUnder(g, d.pos), r: 4.5, spread: 6, life: 7.75, dps: 60, heal: 0, burnsOwner: true, def: src('napalm', 'Napalm') }, g.time);
          } });
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
                o.game.emit('throw', { who: o, from: [p[0], p[1] + 30, p[2]], to: [p[0], p[1] + 2, p[2]], time: 1, color: 0xe0844f });
                later(kit, 1, () => o.game.addSmoke(o, [p[0], p[1] + 2, p[2]], kit.now, { radius: 4.15, life: 19.25, color: 0x9a8f86 })); // lands 1 s after the call
              }
              kit.lastUse.e = kit.now;
            },
          };
          return 'pending';
        },
      },
      x: {
        name: 'Sky Hammer', desc: 'Open the map and click a spot within 60 m: after 2 s a 9 m orbital strike burns it for 3 s (20 every 0.15 s), then shrinks away over 0.75 s.', points: 8,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'SKY HAMMER', hint: 'Click a spot to strike · Right click or X to cancel', max: 1, color: '#ff4655', radius: 9, range: 60,
            confirm: (picks) => {
              kit.ultPoints = 0;
              kit.lastUse.x = kit.now;
              o.game.addZone({ kind: 'fire', color: 0xff3344, orbital: true, owner: o, pos: picks[0], r: 9, life: 5.75, fade: 0.75, armAt: kit.now + 2, dps: 20 / 0.15, heal: 0, burnsOwner: true, def: src('skyhammer', 'Sky Hammer') }, kit.now);
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
        item: 'grenade', name: 'Acid Vial', desc: 'Launch a vial (29 m/s) that bursts on the floor into a 4.5 m pool of acid for 6.5 s: 12.5/s, and Vulnerable (double damage, so 25/s) while you stand in it and for 2 s after.', charges: 2, cooldown: 25, equip: 0.8, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { color: 0x9be15d, onStop: (d) => {
            d.removed = true;
            g.addZone({ kind: 'fire', color: 0x9be15d, acid: true, owner: o, pos: floorUnder(g, d.pos), r: 4.5, life: 6.5, dps: 12.5, heal: 0, burnsOwner: true, def: src('acid', 'Acid Vial') }, g.time);
          } });
        },
      },
      q: {
        item: 'device', name: 'Miasma', desc: 'Throw a gas emitter (left click) or lob it short (right click). Where it lands it releases a 4.5 m toxic cloud; press Q again to switch the cloud off and on (uses fuel; 5.5 s before it can come back on).', charges: 1, cooldown: 0, equip: 0.8,
        armHint: 'LEFT CLICK: THROW · RIGHT CLICK: LOB', throw: 'c2',
        use(kit, mode) {
          const o = kit.owner, g = o.game;
          toss(o, mode === 'right' ? 'lob' : 'c2', { color: 0x58c76a, onStop: (d) => {
            d.removed = true;
            if (!o.alive) return; // the gas needs her alive
            const pos = floorUnder(g, d.pos), gr = { points: [pos], r: 4.5, active: false, items: [], cd: 5.5 };
            kit.gas.groups.cloud = gr;
            g.addDevice({ kind: 'emitter', owner: o, pos, life: 99999 });
            gasOn(kit, gr);
          } });
        },
        reuse(kit) {
          const gr = kit.gas.groups.cloud;
          if (!gr) return false;
          if (gr.active) gasOff(kit, gr); else gasOn(kit, gr);
          return true;
        },
      },
      e: {
        name: 'Toxic Wall', desc: 'Fire a line of emitters straight ahead, through walls, up to 60 m (one every 2 m). A second later they raise a wall of toxic gas 6.75 m high. Press E again to switch it off and on (uses fuel; 5 s before it can come back on).', charges: 1, cooldown: 0, recharge: 'none', equip: 0.8,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), pts = [];
          for (let d = 2; d <= 60; d += 2) {
            const x = o.pos[0] + f[0] * d, z = o.pos[2] + f[1] * d;
            const fl = g.floorAt(x, z);
            if (fl && fl[1] < o.pos[1] + 3) pts.push(fl);
          }
          const gr = { points: pts, r: 0.7, active: false, items: [], slab: f, h: 6.75, cd: 5 };
          kit.gas.groups.wall = gr;
          mine(kit, 1, () => gasOn(kit, gr)); // the emitters fly out and the wall rises 1 s after the cast
        },
        reuse(kit) {
          const gr = kit.gas.groups.wall;
          if (!gr) return false;
          if (gr.active) gasOff(kit, gr); else gasOn(kit, gr);
          return true;
        },
      },
      x: {
        name: 'Nest', desc: 'Flood the area around you with a toxic cloud that spreads to 9 m over 5 s. It lasts as long as you stay inside it, and 8 s after you leave. Enemies inside are nearsighted (8 m) and lose 50 health to Decay at once, then 10 a second; you can see through it and enemies inside are outlined for you.', points: 9,
        use(kit) {
          const o = kit.owner, g = o.game, p = [...o.pos];
          kit.nest = g.addSmoke(o, [p[0], p[1] + 2, p[2]], kit.now, { radius: 1.5, life: 8, color: 0x3f9a50, kind: 'gas', nest: true });
          kit.nestZone = g.addZone({ kind: 'fire', color: 0x58c76a, owner: o, pos: p, r: 1.5, grows: true, life: 8, dps: 0, heal: 0, toxin: { first: 50, rate: 10 }, nearsight: 8.1, def: src('nest', 'Nest') }, kit.now);
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  vex: {
    name: 'Vex', role: 'Duelist', color: '#d65cff', emblem: 'soul',
    blurb: 'Feeds on the fight. Every kill leaves a soul orb she can Devour to heal or Dismiss to vanish, and her ultimate turns her into a frenzy.',
    passive: { name: 'Soul Harvest', desc: 'An enemy who dies within 3 s of taking your damage drops a soul orb for 3 s.' },
    abilities: {
      c: {
        name: 'Glare', desc: 'Hold the eye: a marker shows where it will go, 10 m straight ahead, through walls. Left click to cast it (22.5 m/s). It opens 0.4 s after it arrives and nearsights every enemy who looks at it for the 2 s it lasts. Enemies can shoot it out (60 HP).', charges: 2, cooldown: 20, equip: 0.77,
        smokePreview: 0.45,
        preview(kit) { return glareSpot(kit.owner); },
        use(kit) {
          const o = kit.owner, pos = [...target(kit, this)];
          const ft14 = flight(o.eye(), pos, 22.5);
          o.game.emit('throw', { who: o, from: o.eye(), to: pos, time: ft14, color: 0xd65cff, straight: true });
          later(kit, ft14, () => o.game.addDevice({ kind: 'leer', owner: o, pos, life: 2.4 })); // 0.4 s to open, then 2 s
        },
      },
      q: {
        name: 'Feast', desc: 'Press Q to consume your nearest soul orb, at any distance: heal 50 over 3 s. You can go above 100 HP; the extra stays 10 s, then fades. In Ravenous every kill does this by itself (over 2.5 s), leaves the orb for Vanish, and the extra health stays. Shares its 2 charges with Vanish.', charges: 2, cooldown: 0, item: 'grab', instant: true, free: (kit) => kit.now < kit.empressUntil,
        use(kit) {
          if (!kit.takeOrb()) return false;
          kit.grab = { until: kit.now + 0.35 };
          kit.healOver(50, kit.now < kit.empressUntil ? 2.5 : 3, 150);
          kit.owner.game.emit('ability', { who: kit.owner, type: 'heal' });
        },
      },
      e: {
        name: 'Vanish', desc: 'Press E to consume your nearest soul orb, at any distance: for 1.5 s you’re intangible (and invisible in Ravenous) and move much faster in any direction, but can’t use your gun. Uses Feast’s charges; in Ravenous it costs none.', charges: 2, cooldown: 0, item: 'grab', instant: true, shares: 'q', free: (kit) => kit.now < kit.empressUntil,
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
        name: 'Ravenous', desc: 'Enter a frenzy (1 s to cast) that lasts until you die or the round ends: Combat Stim (10% faster fire rate, reload and draw), every kill Feasts by itself, and Vanish costs no charges.', points: 7,
        use(kit) {
          kit.empressUntil = Infinity; // no timer: until death or the end of the round
          kit.owner.st.channelUntil = kit.now + 1;
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
        name: 'Rubble', desc: 'Fire a charge at a wall up to 35 m ahead (25 m/s). 2.2 s later it blasts the far side three times, 0.6 s apart: 80 damage each to everyone in a strip 10 m deep and 6 m wide behind the wall.', charges: 1, cooldown: 25, equip: 0.9,
        use(kit) {
          const o = kit.owner, g = o.game, p = throughWall(o, 35, 0.3);
          if (!p) return false;
          const e = o.eye(), yaw = o.yaw, f = fwd2(yaw), ft = Math.hypot(p[0] - e[0], p[2] - e[2]) / 25;
          g.emit('throw', { who: o, from: e, to: p, time: Math.max(0.1, ft), color: 0xf28c38, wave: true });
          const a = [p[0], p[1] + 1, p[2]], b = [a[0] + f[0] * 10, a[1], a[2] + f[1] * 10];
          later(kit, ft, () => g.emit('quakeLine', { from: a, to: b, width: 6, life: 3.6 })); // the blast area lights up while it charges
          for (const t of [2.2, 2.8, 3.4]) later(kit, ft + t, () => {
            for (const c of g.inStrip(o, p, yaw, 0, 10, 3, 4)) g.damage(c, o, 80, { part: 'body', def: src('rubble', 'Rubble'), dist: 0, point: c.eye(), wallbang: true });
            g.emit('pulse', { pos: [p[0] + f[0] * 5, p[1] + 0.6, p[2] + f[1] * 5], r: 4, type: 'blast', color: 0xf28c38, owner: o });
          });
        },
      },
      q: {
        name: 'Glimmer', desc: 'Fire a flash charge at a wall up to 35 m ahead (24 m/s). It passes through and bursts on the far side 0.5 s later, blinding for up to 2.25 s.', charges: 2, cooldown: 18, equip: 1.1,
        use(kit) {
          const o = kit.owner, g = o.game, p = throughWall(o, 35, 2.5);
          if (!p) return false;
          p[1] += 1.4;
          const e = o.eye(), ft = Math.hypot(p[0] - e[0], p[2] - e[2]) / 24 + 0.5;
          g.emit('throw', { who: o, from: e, to: p, time: ft, color: 0xffd28a, wave: true });
          later(kit, ft, () => g.flash(o, p, 2.25));
        },
      },
      e: {
        name: 'Fissure', desc: 'Hold left click to charge its length (8 m up to 56 m over 1 s, shown on the ground; you move slower while you charge), release to send a seismic line through walls. It starts 8 m ahead of you, is 8 m wide, and 1.1 s later concusses everyone on it for 2.5 s.', charges: 1, cooldown: 50, item: 'orb', charge: 1, equip: 0.8, chargeSlow: 0.4,
        preview(kit) { const o = kit.owner, f = fwd2(o.yaw), d = 16 + 48 * (kit.power ?? 0); return [o.pos[0] + f[0] * d, o.pos[1], o.pos[2] + f[1] * d]; },
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), len = 8 + 48 * (kit.power ?? 1);
          const a = [o.pos[0] + f[0] * 8, o.pos[1] + 1, o.pos[2] + f[1] * 8], b = [a[0] + f[0] * len, a[1], a[2] + f[1] * len];
          g.emit('quakeLine', { from: a, to: b, width: 8 });
          later(kit, 1.1, () => g.lineEffect(o, a, b, 4, 'stun', 2.5)); // 1.1 s windup, 8 m wide
        },
      },
      x: {
        name: 'Aftershock Wave', desc: 'Send a seismic charge rolling out through every wall: a strip 18 m wide that starts 8 m ahead of you and runs 30 m, going off zone by zone (the first 0.9 s after the cast, then every 0.255 s). Enemies in a zone when it goes are knocked up and concussed for 4 s.', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game, from = [...o.pos], yaw = o.yaw, f = fwd2(yaw), N = 8, step = 30 / N;
          o.st.castLockUntil = kit.now + 1; // an ultimate cast holds your aim and feet for a second
          for (let i = 0; i < N; i++) later(kit, 0.6 + 0.3 + i * 0.255, () => {
            const d0 = 8 + i * step, a = [from[0] + f[0] * d0, from[1] + 1, from[2] + f[1] * d0], b = [a[0] + f[0] * step, a[1], a[2] + f[1] * step];
            g.emit('quakeLine', { from: a, to: b, width: 18, life: 0.5 });
            for (const c of g.inStrip(o, from, yaw, d0, d0 + step, 9)) { g.concuss(c, 4); c.vel[1] = 6; c.grounded = false; }
          });
          g.emit('ability', { who: o, type: 'ult' });
        },
      },
    },
  },

  volt: {
    name: 'Volt', role: 'Duelist', color: '#3fb8ff', emblem: 'bolt',
    blurb: 'Pure speed. Sprints through lanes of her own static, slides into fights and finishes them with a lightning beam.',
    passive: { name: 'Energy', desc: 'Overclock runs on energy: a full bar is 16 s of sprinting and takes 60 s to refill.' },
    abilities: {
      c: {
        instant: true, name: 'Static Lanes', desc: 'Instantly fire two parallel walls of static, 3.5 m apart and 6.75 m high, from 1.5 m behind you to 45 m ahead, through walls. They block sight for 4 s.', charges: 1, cooldown: 25,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), r = right(o.yaw), H = 6.75;
          for (const side of [-1.75, 1.75]) {
            for (let d = -1.5; d <= 45; d += 1.6) {
              const x = o.pos[0] + f[0] * d + r[0] * side, z = o.pos[2] + f[1] * d + r[1] * side;
              const fl = g.floorAt(x, z);
              if (fl && fl[1] < o.pos[1] + 3) g.addSmoke(o, [fl[0], fl[1] + H / 2, fl[2]], kit.now + Math.max(0, d) * 0.01, { radius: 1, life: 4, color: 0x3fb8ff, kind: 'lane', slab: { dir: f, len: 1.7, th: SLAB.th, h: H } });
            }
          }
          g.emit('ability', { who: o, type: 'lane' });
        },
      },
      q: {
        instant: true, name: 'Ricochet', desc: 'Instantly throw a bolt (41 m/s) that bounces once. At each of the two surfaces it hits it charges the ground below, and 1 s later everyone within 5 m of that spot is concussed for 2.5 s.', charges: 2, cooldown: 25, throw: 'c5',
        use(kit) {
          const o = kit.owner, g = o.game;
          const shock = (d) => {
            const pos = floorUnder(g, d.pos);
            pos[1] += 0.3;
            g.emit('pulse', { pos, r: 5, type: 'well', color: 0x3fb8ff, owner: o });
            later(kit, 1, () => g.pulse(o, pos, 5, 'stun', 2.5, 0x3fb8ff));
          };
          toss(o, 'c5', { rule: 'bounce', bounces: 1, bounce: 0.8, friction: 1, color: 0x3fb8ff, life: 5, onBounce: shock, onStop: (d) => { d.removed = true; shock(d); } });
        },
      },
      e: {
        name: 'Overclock', desc: 'Put your gun away and sprint (9.1 m/s) while energy lasts; press E again to stop. Right click mid-sprint, while moving, to slide 7 m (12 m/s for 0.6 s): the slide ends the sprint and your gun comes back out (one slide per round in 5v5, back after two kills; one every 8 s in deathmatch).', charges: 1, cooldown: 0, instant: true, equip: 0.6,
        use(kit) {
          if (kit.energy < 2) return false;
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
        name: 'Overload', desc: 'Fire a lightning beam from your fingertip: hold left click (20 shots a second; 18 body / 54 head out to 20 m, falling to 10 body at 43 m; accurate while running and sliding). It has 40 shots that refill by themselves when you stop firing. Starts your sprint with full energy and a fresh slide. Overload lasts 10 s; kills refill it and give your slide back.', points: 8,
        use(kit) {
          const o = kit.owner;
          kit.overdrive = { fuel: 100, next: kit.now + 0.4, mag: OVERDRIVE.mag, firedAt: -10, loadAt: 0 };
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
        name: 'Double', desc: 'Send out a decoy of yourself that walks forward for 10 s. An enemy who shoots it sets it off: it bursts into a flash that blinds for up to 2 s.', charges: 1, cooldown: 30, equip: 0.8,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'decoy', owner: o, pos: [o.pos[0] + f[0], o.pos[1], o.pos[2] + f[1]], dir: [f[0], 0, f[1]], life: 10, armAt: kit.now + 0.7 });
        },
      },
      q: {
        name: 'Rebound', desc: 'Throw a flash (29 m/s) that bounces off the first surface it hits and bursts 0.7 s later (or 2 s after the throw if it hits nothing), blinding anyone facing it for up to 1.5 s.', charges: 1, cooldown: 18, equip: 0.8, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { rule: 'bounce', bounces: 1, bounce: 0.6, friction: 0.9, color: 0x8f9bff, fuse: 2,
            onBounce: (d) => { d.fuse = Math.min(d.fuse, g.time - d.born + 0.7); },
            onFuse: (d) => g.flash(o, [d.pos[0], d.pos[1] + 0.2, d.pos[2]], 1.5) });
        },
      },
      e: {
        name: 'Riftwalk', desc: 'Hold the rift: left click sends it along the ground (8 m/s), right click leaves it where you stand. Press E again any time in the next 20 s to teleport to it (0.5 s, untouchable on the way). Enemies can shoot it (60 HP). In 5v5 one is free each round, a second costs 150, and two kills bring a used one back.', charges: 2, cooldown: 30, recharge: 'kills', equip: 0.8,
        armHint: 'LEFT CLICK: SEND IT · RIGHT CLICK: LEAVE IT HERE',
        use(kit, mode) {
          const o = kit.owner, f = fwd2(o.yaw), still = mode === 'right';
          const pos = still ? [...o.pos] : [o.pos[0] + f[0] * 0.8, o.pos[1], o.pos[2] + f[1] * 0.8];
          if (kit.gate && !kit.gate.removed) kit.gate.removed = true; // one rift at a time
          kit.gate = o.game.addDevice({ kind: 'gate', owner: o, pos, dir: [f[0], 0, f[1]], life: 20, still });
        },
        reuse(kit) {
          const gt = kit.gate;
          if (!gt || gt.removed) { kit.gate = null; return false; }
          const o = kit.owner;
          kit.gate = null;
          gt.removed = true;
          o.game.emit('ability', { who: o, type: 'step', pos: gt.pos });
          o.st.intangibleUntil = o.st.channelUntil = kit.now + 0.5; // nothing touches him while he steps through
          mine(kit, 0.5, () => o.game.teleportNear(o, [...gt.pos]));
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
        name: 'Bloom', desc: 'Hold C to channel: every hurt teammate you can see within 18 m heals 20 HP/s. One charge holds a 100 HP pool — let go to stop, hold C again to keep spending it. You cannot shoot while channelling, and it cannot heal you.', charges: 1, cooldown: 25, instant: true, equip: 0.5,
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
        name: 'Stalker', desc: 'Hold the tiger, left click to send it. You see through its eyes and steer with the mouse for up to 6 s (6.4 m/s, 80 HP). Left click makes it leap up to 12 m: the first enemy it hits takes 30, and everyone within 3.5 m of where it lands is concussed for up to 4 s.', charges: 1, cooldown: 40, equip: 0.8,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          kit.pilot = o.game.addDevice({ kind: 'tiger', owner: o, pos: [o.pos[0] + f[0], o.pos[1], o.pos[2] + f[1]], dir: [f[0], 0, f[1]], life: 6, steer: true });
        },
      },
      e: {
        name: 'Lantern Hawk', desc: 'Hold the hawk, left click to release it; it flies where you aim (18 m/s, 60 HP). Press E again to make it burst 0.3 s later, blinding anyone facing it for 1 to 2.25 s: the full time once it has flown 0.75 s (it bursts on its own after 2 s). In 5v5 one is free each round and a second costs 250.', charges: 2, cooldown: 50, equip: 0.8,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          kit.hawk = o.game.addDevice({ kind: 'hawk', owner: o, pos: [e[0] + d[0], e[1], e[2] + d[2]], dir: d, life: 2, steer: true, fly: true, speed: 18 });
        },
        reuse(kit) {
          const h = kit.hawk;
          if (!h || h.removed) { kit.hawk = null; return false; }
          h.removed = true;
          kit.hawk = null;
          const len = 1 + 1.25 * Math.min(1, (kit.now - h.born) / 0.75); // the longer it flew, the longer the blind (1-2.25 s, full after 0.75 s)
          later(kit, 0.3, () => kit.owner.game.flash(kit.owner, [...h.pos], len));
          return true;
        },
      },
      x: {
        name: 'Hunters', desc: 'Release three seekers (120 HP each) that track the three closest enemies for up to 15 s, through walls. Each one that reaches its target nearsights them for 3 s.', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game;
          const targets = g.combatants.filter(c => c.alive && g.isEnemy(o, c)).sort((a, b) => Math.hypot(a.pos[0] - o.pos[0], a.pos[2] - o.pos[2]) - Math.hypot(b.pos[0] - o.pos[0], b.pos[2] - o.pos[2])).slice(0, 3);
          for (const t of targets) g.addDevice({ kind: 'seeker', owner: o, pos: o.eye(), target: t, life: 15 });
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
        item: 'device', name: 'Tripline', desc: 'Hold the wire, aim at a wall (up to 20 m) and left click to stretch it across the gap at that height (up to 15 m); it arms 1.5 s later. An enemy who crosses it is tethered and slowed by half. 0.7 s later it zaps them: slowed for another second and revealed for as long as it holds them. Tearing free (6.2 m) costs a zap too; shooting the wire (20 HP) frees them. It resets and can catch again.', charges: 2, cooldown: 30, equip: 0.8,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const hit = g.world.raycast(eye, d, 20);
          if (!hit || hit.box.floor || hit.n[1] !== 0) return false;
          const n = hit.n, a = [eye[0] + d[0] * hit.t + n[0] * 0.05, eye[1] + d[1] * hit.t, eye[2] + d[2] * hit.t + n[2] * 0.05];
          const fl = g.floorAt(a[0] + n[0] * 0.3, a[2] + n[2] * 0.3, a[1] + 0.5);
          if (fl) a[1] = Math.max(a[1], fl[1] + 0.1); // at the height you aim at, never inside the floor
          const h2 = g.world.raycast(a, [n[0], 0, n[2]], 15);
          if (!h2) return false;
          const b = [a[0] + n[0] * h2.t, a[1], a[2] + n[2] * h2.t];
          g.addDevice({ kind: 'wire', owner: o, pos: a, b, life: 120, armAt: kit.now + 1.5 });
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
          g.addSmoke(o, [best.pos[0], best.pos[1] + 1.6, best.pos[2]], kit.now, { radius: 3.45, life: 7.25, color: 0xb9c3d1, kind: 'cage' });
          return true;
        },
      },
      e: {
        item: 'device', name: 'Watcher', desc: 'Hold the camera, left click to stick it on the surface you aim at (20 m). Press E again to look through it; enemies it sees are revealed, and left click fires a tracking dart (pings every 2 s for 8 s). E again to leave. One shot destroys it (45 s to get it back; 20 s if you pick it up).', charges: 1, cooldown: 45, equip: 0.8,
        use(kit) {
          const o = kit.owner, g = o.game, eye = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          const hit = g.world.raycast(eye, d, 20);
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
        name: 'Mindread', desc: 'Look at the body of an enemy who died in the last 20 s (12 m) and press X to read their mind: every living enemy is revealed twice, 2 s apart.', points: 7,
        use(kit) {
          if (!allyInView(kit, { dead: true, enemy: true, range: 12, maxDeg: 18, maxAge: 20 })) return false;
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
        name: 'Hound', desc: 'Send a prowler (10 m/s, 60 HP) that follows your crosshair for 2.5 s. It chases the first enemy it sees within 15 m, or one marked by a terror trail, and bites from 2.5 m: nearsighted for 2.75 s.', charges: 2, cooldown: 25, equip: 1.1,
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'prowler', owner: o, pos: [o.pos[0] + f[0], o.pos[1], o.pos[2] + f[1]], dir: [f[0], 0, f[1]], life: 2.5, steer: true });
        },
      },
      q: {
        name: 'Grasp', desc: 'Throw an orb. It drops straight down after 1.5 s in the air, or when you press Q again, and bursts 0.7 s after landing: enemies within 6.6 m are held in place and deafened for 4.5 s and lose 75 health to Decay (never lethal; it comes back over 5 s).', charges: 1, cooldown: 25, equip: 0.8, throw: 'c2',
        use(kit) {
          const o = kit.owner, g = o.game;
          kit.orb = toss(o, 'c2', { color: 0xb07a9a, drop: { at: 1.5, g: 2.7 }, onStop: (d) => {
            d.removed = true;
            const pos = floorUnder(g, d.pos);
            later(kit, 0.7, () => { for (const c of g.pulse(o, [pos[0], pos[1] + 1, pos[2]], 6.58, 'hold+deaf', 4.5, 0xb07a9a)) g.decay(c, 75, { delay: 0, over: 5 }); });
          } });
        },
        reuse: dropOrbNow,
      },
      e: {
        name: 'Omen Eye', desc: 'Throw an eye. It drops straight down after 1.5 s in the air, or when you press E again, and opens where it lands: for 1.5 s every enemy in its line of sight within 30 m is revealed and marked with a terror trail for 12 s, which prowlers follow. One shot destroys it.', charges: 1, cooldown: 50, equip: 0.85, throw: 'c2',
        use(kit) {
          const o = kit.owner, g = o.game;
          kit.orb = toss(o, 'c2', { color: 0xb07a9a, drop: { at: 1.5, g: 2.7 }, onStop: (d) => {
            d.removed = true;
            const pos = [d.pos[0], d.pos[1] + 0.3, d.pos[2]];
            later(kit, 0.325, () => {
              const eye = g.addDevice({ kind: 'haunt', owner: o, pos, life: 1.5 });
              for (const t of [0, 0.5, 1, 1.45]) later(kit, t, () => { if (!eye.removed) for (const c of g.pulse(o, pos, 30, 'reveal', 0.6, 0xb07a9a, true)) c.st.trailUntil = g.time + 12; });
            });
          } });
        },
        reuse: dropOrbNow,
      },
      x: {
        name: 'Terror', desc: 'Unleash a wave of nightmare through walls, 20 m wide and 40 m long, rolling out zone by zone: everyone it reaches is marked (revealed, with a terror trail) and deafened for 8 s and loses 75 health to Decay (never lethal; it comes back).', points: 8,
        use(kit) {
          const o = kit.owner, g = o.game, from = [...o.pos], yaw = o.yaw, f = fwd2(yaw), N = 8, step = 40 / N;
          o.st.castLockUntil = kit.now + 1;
          for (let i = 0; i < N; i++) later(kit, 0.1 + i * 0.325, () => {
            const a = [from[0] + f[0] * i * step, from[1] + 1, from[2] + f[1] * i * step], b = [a[0] + f[0] * step, a[1], a[2] + f[1] * step];
            g.emit('quakeLine', { from: a, to: b, width: 20, life: 0.6, color: 0xb07a9a });
            for (const c of g.inStrip(o, from, yaw, i * step, (i + 1) * step, 10)) {
              c.st.revealUntil = c.st.trailUntil = c.st.deafUntil = g.time + 8;
              g.decay(c, 75);
            }
          });
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
        item: 'orb', name: 'Frost Wall', desc: 'Hold the crystal: a preview shows the wall where you aim (15 m). Right click rotates it, left click raises a solid ice wall of four pieces (10.4 m × 2.6 m) for 40 s. Each piece has 400 HP, hardening to 600 after 2 s, and enemies can shoot it down. You can stand on it — raise it under yourself to boost up.', charges: 1, cooldown: 40, rotate: true, equip: 0.8,
        preview(kit) { const o = kit.owner; return aimPoint(o, 15, { floor: true, back: 0.4, bodies: false }); },
        wallPreview: { half: 5.2, h: 2.6, th: 0.4 },
        use(kit) {
          const o = kit.owner, pos = target(kit, this);
          return o.game.addWall(o, pos, o.yaw + (kit.rot ? Math.PI / 2 : 0), 40, { half: 5.2, h: 2.6, th: 0.2, style: 'ice', lift: true, segments: 4, hp: 400, fortify: 200 });
        },
      },
      q: {
        item: 'orb', name: 'Chill', desc: 'Hold the orb, left click to throw it (29 m/s). It shatters on the floor into a field up to 9 m across the ground for 7 s that slows enemies by 50%.', charges: 2, cooldown: 25, equip: 0.5, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { color: 0x9ff3ff, onStop: (d) => { d.removed = true; g.addZone({ kind: 'slowfield', color: 0x9ff3ff, owner: o, pos: floorUnder(g, d.pos), r: 9, spread: 12, life: 7, slowField: 0.5 }, g.time); } });
        },
      },
      e: {
        item: 'orb', name: 'Mend', desc: 'Hold the healing orb. Aim at a teammate you can see (20 m) and left click to heal them 60 HP over 5 s (30 s cooldown); aim anywhere else to heal yourself 100 HP over 5 s (45 s cooldown).', charges: 1, cooldown: 45, equip: 0.5,
        use(kit) {
          const o = kit.owner, ally = allyInView(kit, { range: 20 });
          if (ally && ally.hp < PLAYER.hp) { healAlly(ally, 60, 5); kit.ready.e ||= kit.now + 30; o.game.emit('ability', { who: ally, type: 'heal' }); return; } // 13.10: 30 s after healing a teammate
          if (o.hp >= PLAYER.hp) return false;
          kit.healOver(100, 5);
          o.game.emit('ability', { who: o, type: 'heal' });
        },
      },
      x: {
        name: 'Second Dawn', desc: 'Look at a fallen teammate’s body (12 m) and press X: after 3 s of channelling they rise where they fell with full health. They can’t be hurt for 2 s, and take 1.3 s to get moving.', points: 7,
        use(kit) {
          const o = kit.owner, g = o.game, ally = allyInView(kit, { dead: true, range: 12, maxDeg: 18 });
          if (!ally || !g.mode) return false;
          o.st.channelUntil = kit.now + 3;
          o.st.slowUntil = kit.now + 3; o.st.slowAmt = 0.95;
          g.emit('ability', { who: o, type: 'ult' });
          mine(kit, 3, () => {
            if (ally.alive || !g.mode || g.mode.phase === 'end') return;
            g.resurrect(ally, o);
            ally.st.invulnUntil = g.time + 2;
            ally.st.rootUntil = ally.st.channelUntil = g.time + 1.3;
          });
        },
      },
    },
  },

  stella: {
    name: 'Stella', role: 'Controller', color: '#e6b34a', emblem: 'star',
    blurb: 'Plays the whole map from the stars. Place them anywhere, then turn each into a smoke, a stun or a gravity well — and split the map in two.',
    passive: { name: 'Stars', desc: 'You have up to 5 stars (in 5v5 one is free each round and more cost 150). Press E (not looking at a star) to place them on the map, then look at a star and press C, Q or E to turn it into that ability. Each ability has its own charges: Gravity Well and Nova Pulse one each (60 s to come back), Nebula two (35 s each).' },
    abilities: {
      c: {
        name: 'Gravity Well', desc: 'Look at one of your stars and press C: after 1.25 s it pulls nearby enemies (4.75 m) to its centre for 2 s, then makes them Vulnerable (double damage) for 2.5 s. One charge, back after 60 s.', charges: 1, cooldown: 60, instant: true, recharge: 'timer',
        use() { return false; },
        reuse(kit) {
          const st = kit.charges.c > 0 && lookAt(kit, 'star');
          if (!st) return false;
          kit.take('c');
          st.removed = true;
          const g = kit.owner.game, p = [st.pos[0], st.pos[1] + 1, st.pos[2]];
          g.emit('pulse', { pos: p, r: 4.75, type: 'well', color: 0xe6b34a, owner: kit.owner });
          for (let i = 0; i < 8; i++) later(kit, 1.25 + i * 0.25, () => g.pull(kit.owner, p, 4.75, 4.5));
          later(kit, 3.25, () => g.pulse(kit.owner, p, 4.75, 'vuln', 2.5, 0xe6b34a));
          return true;
        },
      },
      q: {
        name: 'Nova Pulse', desc: 'Look at one of your stars and press Q: after 1 s it bursts, concussing enemies within 5.25 m for 2.5 s. One charge, back after 60 s.', charges: 1, cooldown: 60, instant: true, recharge: 'timer',
        use() { return false; },
        reuse(kit) {
          const st = kit.charges.q > 0 && lookAt(kit, 'star');
          if (!st) return false;
          kit.take('q');
          st.removed = true;
          const p = [st.pos[0], st.pos[1] + 1, st.pos[2]];
          kit.owner.game.emit('pulse', { pos: p, r: 1.5, type: 'well', color: 0xe6b34a, owner: kit.owner });
          later(kit, 1.0, () => kit.owner.game.pulse(kit.owner, p, 5.25, 'stun', 2.5, 0xe6b34a));
          return true;
        },
      },
      e: {
        name: 'Astral Form', desc: 'Press E to open the map and click to place your stars (as many as you have). Look at a placed star and press E to turn it into a Nebula: a 14.25 s smoke that forms 0.75 s later (two charges, 35 s each to come back). Pick a star back up (F) and it leaves a 1.75 s fake smoke; the star returns after 25 s.', charges: 5, cooldown: 0, instant: true,
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
          const st = kit.nebulas > 0 && lookAt(kit, 'star');
          if (!st) return false;
          kit.nebulas--;
          mine(kit, 35, () => { kit.nebulas = Math.min(2, kit.nebulas + 1); });
          st.removed = true;
          const at = [st.pos[0], st.pos[1] + 2, st.pos[2]];
          later(kit, 0.75, () => kit.owner.game.addSmoke(kit.owner, at, kit.now, { radius: 4.75, life: 14.25, color: 0x6b4d8f }));
          return true;
        },
      },
      x: {
        name: 'Rift Line', desc: 'Open the map and click two points: a wall of cosmic energy splits the whole map through the first, running toward the second (it snaps to the map’s grid), for 21 s after a 2.7 s windup. It stops bullets and sight; thrown abilities pass through.', points: 7,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'RIFT LINE', hint: 'Click where the wall starts, then a second point it runs toward · right click or X to cancel', max: 2, color: '#e6b34a',
            confirm: (picks) => {
              kit.ultPoints = 0;
              kit.lastUse.x = kit.now;
              // Through the first point toward the second; with only one point it runs the way you face.
              const yaw = picks[1] ? Math.atan2(-(picks[1][0] - picks[0][0]), -(picks[1][2] - picks[0][2])) : o.yaw;
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
        item: 'device', name: 'Snare', desc: 'Hold the trap, left click to place it on the floor (12 m); it arms after 2 s. When it sees an enemy within 10 m, 0.9 s later the ground around it breaks into a 6 m field that slows by half for 6 s. It resets 10 s later. Enemies can shoot it (20 HP).', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 12, { floor: true, back: 0.4 });
          o.game.addDevice({ kind: 'trademark', owner: o, pos, life: 999, armAt: kit.now + 2 });
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
        item: 'device', name: 'Anchor', desc: 'Hold the anchor, left click to place it on the floor (8.5 m). Press E again anywhere within 18 m of it to teleport back (1.3 s, invulnerable on the way; 30 s cooldown between teleports). Enemies can shoot it (50 HP).', charges: 1, cooldown: 0,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 8.5, { floor: true, back: 0.6 });
          if (kit.anchor) kit.anchor.removed = true;
          kit.anchor = o.game.addDevice({ kind: 'anchor', owner: o, pos, life: 99999 });
        },
        reuse(kit) {
          const a = kit.anchor, o = kit.owner;
          if (!a || a.removed) return false;
          if (kit.now < (kit.tpReady || 0) || Math.hypot(o.pos[0] - a.pos[0], o.pos[2] - a.pos[2]) > 18) { o.game.emit('abilityFail', { who: o, key: 'e' }); return true; }
          kit.tpReady = kit.now + 30;
          o.game.emit('ability', { who: o, type: 'step', pos: a.pos });
          o.st.invulnUntil = kit.now + 1.3; // can't be hurt from the press until he has arrived
          o.st.channelUntil = kit.now + 1.3; // and can't shoot while teleporting
          mine(kit, 0.1, () => o.game.teleportNear(o, [...a.pos])); // 0.1 s wind-up, then 1.2 s arriving at the anchor
          return true;
        },
      },
      x: {
        name: 'Coup de Grace', desc: 'Summon a custom sniper rifle (2.3 s; 5 rounds): one hit to the body or head kills, and every kill leaves a 6 m field that slows by half for 4 s where the target fell. Right click to scope.', points: 8,
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
        item: 'orb', name: 'Squall', desc: 'Hold the water, left click to throw it (29 m/s). It bursts into a whirlpool where it lands, and 0.6 s later every enemy within 6 m is nearsighted for 2 s, seen or not.', charges: 1, cooldown: 30, equip: 0.8, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { color: 0x2fb3a8, onStop: (d) => {
            d.removed = true;
            const pos = floorUnder(g, d.pos);
            pos[1] += 0.5;
            g.emit('pulse', { pos, r: 6, type: 'well', color: 0x2fb3a8, owner: o });
            later(kit, 0.6, () => g.pulse(o, pos, 6, 'near', 2, 0x2fb3a8, false, { near: 7.5 }));
          } });
        },
      },
      q: {
        item: 'orb', name: 'Riptide', desc: 'Hold the water, then left click: a wall of water 8 m high races forward along the ground (20 m/s, up to 60 m), through walls. Keep the button held and turn to steer it; right click stops it early. It stands 15 s, blocks sight and slows whoever crosses it.', charges: 1, cooldown: 40, equip: 0.6,
        armHint: 'LEFT CLICK: CAST · KEEP HOLDING AND TURN TO STEER · RIGHT CLICK STOPS IT',
        use(kit) {
          const o = kit.owner, f = fwd2(o.yaw);
          o.game.addDevice({ kind: 'blaze', owner: o, pos: [o.pos[0] + f[0] * 3.1, o.pos[1], o.pos[2] + f[1] * 3.1], yaw: o.yaw, life: 3.5, speed: 20, travelled: 0, nextSeg: 0, key: 'fire', stopKey: 'altPressed', maxDist: 60, h: 8, through: true,
            seg: { spacing: 2, slab: true, smoke: { radius: 1, life: 15, color: 0x2fb3a8, kind: 'water' }, zone: { kind: 'slowfield', color: 0x2fb3a8, r: 1.1, life: 15, slowField: 0.3, slowLinger: 0.6 } } });
        },
      },
      e: {
        item: 'orb', name: 'Lagoon', desc: 'Hold the orb, left click to send it to the spot you aim at (64 m/s, up to 80 m). It becomes a water dome 9.2 m across for 19.25 s that blocks sight; 0.8 s later its shell forms and stops bullets until it takes 680 damage.', charges: 1, cooldown: 30, equip: 1,
        use(kit) {
          const o = kit.owner, g = o.game, e = o.eye(), pos = aimPoint(o, 80, { back: 0.6, bodies: false });
          const fl = floorUnder(g, pos);
          if (pos[1] < fl[1] + 1.4) pos[1] = fl[1] + 1.4; // not sunk into the floor
          const ft = Math.max(0.05, Math.hypot(pos[0] - e[0], pos[1] - e[1], pos[2] - e[2]) / 64);
          g.emit('throw', { who: o, from: e, to: pos, time: ft, color: 0x2fb3a8, straight: true });
          later(kit, ft, () => g.addSmoke(o, pos, kit.now, { radius: 4.6, life: 19.25, color: 0x2fb3a8, kind: 'cove' }));
        },
      },
      x: {
        name: 'Undertow', desc: 'Send a tall wave of water rolling out ahead of you through walls: 28 m wide, 8 m/s, for 40 m. It blocks sight as it goes, and every enemy it washes over is nearsighted for 3 s.', points: 7,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), r = right(o.yaw);
          o.st.castLockUntil = kit.now + 1;
          later(kit, 0.6, () => {
            const at = [o.pos[0] + f[0] * 1.5, o.pos[1] + SLAB.h / 2, o.pos[2] + f[1] * 1.5];
            const wave = g.addSmoke(o, at, kit.now, { radius: 1, life: 5.2, color: 0x2fb3a8, kind: 'water', slab: { dir: r, len: 28, th: SLAB.th * 1.6, h: SLAB.h } });
            g.sweep(o, at, [f[0], 0, f[1]], 8, 40, {
              onMove: (d) => { // the water follows the ground
                const fl = g.floorAt(d.pos[0], d.pos[2], d.pos[1] - SLAB.h / 2 + 1.5);
                if (fl && Math.abs(fl[1] - (d.pos[1] - SLAB.h / 2)) < 1.5) d.pos[1] = fl[1] + SLAB.h / 2;
                wave.pos[0] = d.pos[0]; wave.pos[1] = d.pos[1]; wave.pos[2] = d.pos[2];
              },
              hit: (c, d) => {
                const dx = c.pos[0] - d.pos[0], dz = c.pos[2] - d.pos[2];
                return Math.abs(dx * f[0] + dz * f[1]) < 0.8 && Math.abs(dx * r[0] + dz * r[1]) < 14 && Math.abs(c.pos[1] + 1 - d.pos[1]) < 4;
              },
              apply: (c) => g.status(c, 'near', 3, { near: 7.5 }),
            });
          });
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
        item: 'device', name: 'Push Wall', desc: 'Hold the barrier: left click pushes a wall (5.2 m × 3 m) forward at 3.6 m/s for 3.5 s, right click at half that speed. It blocks bullets and sight and can’t be broken, but players can walk through it; it stops at walls.', charges: 1, cooldown: 30, equip: 0.8,
        armHint: 'LEFT CLICK: PUSH · RIGHT CLICK: PUSH SLOWLY',
        use(kit, mode) {
          const o = kit.owner, f = fwd2(o.yaw);
          const p = [o.pos[0] + f[0] * 2.2, o.pos[1], o.pos[2] + f[1] * 2.2];
          const w = o.game.addWall(o, p, o.yaw, 6, { half: 2.62, style: 'iso', passable: true });
          if (!w) return false;
          o.game.addDevice({ kind: 'pushwall', owner: o, wall: w, speed: mode === 'right' ? 1.8 : 3.6, dir: Math.abs(f[0]) > Math.abs(f[1]) ? [Math.sign(f[0]), 0, 0] : [0, 0, Math.sign(f[1])], life: 3.5 });
        },
      },
      q: {
        item: 'orb', name: 'Sever', desc: 'Hold the bolt, left click to fire it straight ahead (22.5 m/s, 29.5 m), through walls. Every enemy within 3 m of it as it passes is Vulnerable (double damage) for 4 s.', charges: 1, cooldown: 20, equip: 0.8,
        use(kit) {
          const o = kit.owner, g = o.game, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch), end = [e[0] + d[0] * 29.5, e[1] + d[1] * 29.5, e[2] + d[2] * 29.5];
          g.emit('throw', { who: o, from: e, to: end, time: 29.5 / 22.5, color: 0x9b5cff, wave: true });
          g.sweep(o, e, d, 22.5, 29.5, { r: 3, apply: (c) => { c.st.vulnUntil = g.time + 4; g.emit('pulse', { pos: c.eye(), r: 1.2, type: 'vuln', color: 0x9b5cff, owner: o }); } });
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
        name: 'Duel', desc: 'Send a column of energy ahead of you (14 m wide, through walls, 40 m over 4 s, starting 0.8 s after the cast). You and the first enemy it reaches are pulled into a sealed arena: 1.5 s to face off, then up to 13 s to fight. Whoever survives is sent back.', points: 7,
        use(kit) {
          const o = kit.owner, g = o.game, f = fwd2(o.yaw), from = [o.pos[0], o.pos[1] + 1, o.pos[2]];
          if (g.contract) return false;
          later(kit, 0.8, () => {
            g.emit('throw', { who: o, from, to: [from[0] + f[0] * 40, from[1], from[2] + f[1] * 40], time: 4, color: 0x9b5cff, wave: true });
            g.sweep(o, from, [f[0], 0, f[1]], 10, 40, {
              hit: (c, d) => Math.hypot(c.pos[0] - d.pos[0], c.pos[2] - d.pos[2]) < 7,
              apply: (c) => {
                if (!o.alive || g.contract) return 'stop';
                g.startContract(o, c, 13 + 1.5);
                o.st.channelUntil = c.st.channelUntil = g.time + 1.5; // the face-off: no shooting yet
                return 'stop';
              },
            });
          });
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
        item: 'grenade', name: 'Saturate', desc: 'Hold a cluster of light, left click to throw it (29 m/s). It drops straight down after 1 s in the air and bursts where it lands: everyone within 6 m, you and teammates included, is Hindered for 3 s (30% slower, lower jumps, 20% slower fire rate).', charges: 1, cooldown: 30, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { color: 0xffe680, drop: { at: 1, g: 2.5 }, onStop: (d) => { d.removed = true; g.pulse(o, [d.pos[0], d.pos[1] + 0.8, d.pos[2]], 6, 'hinder', 3, 0xffe680, false, { all: true }); } });
        },
      },
      q: {
        name: 'Lightspeed', desc: 'Hold the light: left click dashes twice, right click once. Each dash is about 9 m in 0.45 s, the way you are moving; the first also carries you upward.', charges: 1, cooldown: 25, equip: 0.8,
        armHint: 'LEFT CLICK: TWO DASHES · RIGHT CLICK: ONE',
        use(kit, mode) {
          const o = kit.owner;
          const go = (up) => {
            const inp = o.input, len = Math.hypot(inp.fwd, inp.side), sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
            const dir = len > 0 ? [(-sy * inp.fwd + cy * inp.side) / len, (-cy * inp.fwd - sy * inp.side) / len] : [-sy, -cy];
            o.dash = { until: kit.now + 0.45, dir, speed: 20, exit: 6.5 };
            if (up) { o.vel[1] = 5.2; o.grounded = false; }
            o.game.emit('ability', { who: o, type: 'dash' });
          };
          go(true);
          if (mode !== 'right') mine(kit, 0.5, () => go(false)); // the second dash follows 0.05 s after the first ends
        },
      },
      e: {
        name: 'Refract', desc: 'Drop a beacon of light where you stand. From 1 s later, and within 8 s, press E again to travel back to it (0.35 s from 2.5 m away up to 2 s from 50 m). You are untouchable on the way but can barely see. Recharges after two kills.', charges: 1, cooldown: 1e9, instant: true, recharge: 'kills',
        use(kit) {
          const o = kit.owner;
          kit.refract = o.game.addDevice({ kind: 'anchor', owner: o, pos: [...o.pos], life: 8.2 });
          kit.refract.hp = 0; // a beacon of light: nothing to shoot
          o.game.emit('ability', { who: o, type: 'windup' });
        },
        reuse(kit) {
          const b = kit.refract;
          if (!b || b.removed || kit.now - b.born < 1) return false; // it takes 1 s to arm
          const o = kit.owner, to = [...b.pos];
          const dist = Math.hypot(to[0] - o.pos[0], to[1] - o.pos[1], to[2] - o.pos[2]);
          const travel = 0.35 + 1.65 * Math.min(1, Math.max(0, (dist - 2.5) / 47.5)); // 2.5 m: 0.35 s, 50 m: 2 s
          o.st.intangibleUntil = kit.now + travel;
          o.st.nearUntil = kit.now + travel; o.st.nearRange = 1; // she sees next to nothing on the way
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
            // She and teammates standing in the beam run 10% faster for 7 s.
            for (const c of g.combatants) {
              if (!c.alive || g.isEnemy(o, c)) continue;
              const dx = c.pos[0] - a[0], dz = c.pos[2] - a[2], along = dx * f[0] + dz * f[1];
              if (c === o || (along >= 0 && along <= 36 && Math.abs(dx * f[1] - dz * f[0]) <= 6.75)) { c.st.hasteUntil = kit.now + 7; c.st.hasteAmt = 0.1; }
            }
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
        item: 'device', name: 'Scout Drone', desc: 'Hold the drone, left click to launch it. Fly it with your mouse for up to 6 s (7.5 m/s, 42 HP). Left click pulses (from 0.6 s after launch, then every 1.5 s): enemies within 16 m are revealed and suppressed (no abilities) for 8 s.', charges: 1, cooldown: 40, equip: 0.8,
        use(kit) {
          const o = kit.owner, e = o.eye(), d = dirFromAngles(o.yaw, o.pitch);
          kit.pilot = o.game.addDevice({ kind: 'sdrone', owner: o, pos: [e[0] + d[0], e[1], e[2] + d[2]], dir: d, life: 6, steer: true, fly: true, speed: 7.5 });
        },
      },
      q: {
        item: 'grenade', name: 'Sticky Charge', desc: 'Hold the charge: left click throws it (41 m/s) to stick to the first thing it hits, right click lets it bounce once first. 0.8 s after it sticks it bursts: 35 damage within 1.25 m, down to 20 at 5.25 m, and everyone caught is concussed for 2.5 s.', charges: 1, cooldown: 25, equip: 0.5, throw: 'c5',
        armHint: 'LEFT CLICK: STICK · RIGHT CLICK: BOUNCE ONCE',
        use(kit, mode) {
          const o = kit.owner, g = o.game;
          toss(o, 'c5', { rule: mode === 'right' ? 'bounce' : 'stick', bounces: 1, bounce: 0.6, color: 0xd9a441, size: 0.11, life: 3, onStop: (d) => {
            d.until = g.time + 1; // it only times out in the air
            later(kit, 0.8, () => {
              d.removed = true;
              g.pulse(o, d.pos, 5.25, 'stun', 2.5, 0xd9a441);
              g.explode(o, d.pos, 5.25, 35, 20, src('sticky', 'Sticky Charge'), 0xd9a441, false, false, 1.25);
            });
          } });
        },
      },
      e: {
        name: 'Missile Call', desc: 'Open the map and mark a target per charge (2 charges, 45 m); press E (or right click) to fire. Each missile comes down 1.5 s later and goes off three times, half a second apart: 65 within 2.5 m, down to 50 at 4.5 m, each time.', charges: 2, cooldown: 35, instant: true, recharge: 'none',
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'e', title: 'MISSILE CALL', hint: 'Click up to ' + kit.charges.e + ' targets · E or right click to fire', max: kit.charges.e, color: '#d9a441', radius: 4.5, range: 45,
            confirm: (picks) => {
              kit.lastUse.e = kit.now;
              for (const p of picks) {
                kit.charges.e--; if (!kit.ready.e) kit.ready.e = kit.now + this.cooldown;
                o.game.emit('throw', { who: o, from: [o.pos[0], o.pos[1] + 20, o.pos[2]], to: p, time: 1.5, color: 0xff8c2e, rocket: true });
                for (const t of [1.5, 2, 2.5]) later(kit, t, () => o.game.explode(o, [p[0], p[1] + 0.5, p[2]], 4.5, 65, 50, src('missile', 'Missile Call'), 0xff8c2e, false, false, 2.5));
              }
            },
          };
          return 'pending';
        },
      },
      x: {
        name: 'Barrage', desc: 'Open the map and click where it starts (within 52.5 m), then a second point it runs toward. 3 s later a strike walks 36 m along that line, 2 m at a time: each stretch (12 m wide) is hit four times for 60, a quarter of a second apart.', points: 9,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'x', title: 'BARRAGE', hint: 'Click where the barrage starts, then a point it runs toward · right click or X to cancel', max: 2, color: '#ff4655', radius: 6, range: 52.5,
            confirm: (picks) => {
              kit.ultPoints = 0; kit.lastUse.x = kit.now;
              // From the first point toward the second; with only one point it runs the way you face.
              const g = o.game, s0 = picks[0], yaw = picks[1] ? Math.atan2(-(picks[1][0] - s0[0]), -(picks[1][2] - s0[2])) : o.yaw, f = fwd2(yaw);
              const fl0 = g.floorAt(s0[0], s0[2]) || s0, a = [s0[0], fl0[1] + 1, s0[2]];
              g.emit('quakeLine', { from: a, to: [a[0] + f[0] * 36, a[1], a[2] + f[1] * 36], width: 12, color: 0xff4655, life: 3.1 }); // where it will land
              for (let i = 0; i < 18; i++) {
                const x = s0[0] + f[0] * (i * 2 + 1), z = s0[2] + f[1] * (i * 2 + 1), fl = g.floorAt(x, z) || [x, fl0[1], z];
                for (let k = 0; k < 4; k++) later(kit, 3.08 + (i + k) * 0.25, () => {
                  for (const c of g.inStrip(o, s0, yaw, i * 2, i * 2 + 2, 6, 30)) g.damage(c, o, 60, { part: 'body', def: src('barrage', 'Barrage'), dist: 0, point: c.eye(), wallbang: true });
                  if (k % 2 === 0) g.emit('pulse', { pos: [fl[0], fl[1] + 0.5, fl[2]], r: 4, type: 'blast', color: 0xff8c2e, owner: o });
                });
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
        item: 'grenade', name: 'Fragment', desc: 'Hold the frag, left click to throw it (18 m/s). It bounces off walls and sticks to the floor; 0.5 s later it goes off four times, a second apart: 60 within 1 m, down to 25 at 4 m, each time.', charges: 1, cooldown: 30, equip: 0.7, throw: 'c2',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c2', { color: 0x6fa8ff, size: 0.11, onStop: (d) => {
            d.until = g.time + 3.6; // it lies there until its last blast
            for (let i = 0; i < 4; i++) later(kit, 0.5 + i, () => g.explode(o, [d.pos[0], d.pos[1] + 0.5, d.pos[2]], 4, 60, 25, src('fragment', 'Fragment'), 0x6fa8ff, false, false, 1));
          } });
        },
      },
      q: {
        item: 'flash', name: 'Flashpoint', desc: 'Hold the flash. Left click: overhand throw that pops 1.6 s later. Right click: underhand lob that pops after 1 s. If it bounces off something first, it pops 0.8 s after the bounce. Blinds anyone facing it for up to 2.25 s.', charges: 2, cooldown: 20, equip: 0.8, throw: 'c2',
        armHint: 'LEFT CLICK: OVERHAND · RIGHT CLICK: UNDERHAND LOB',
        use(kit, mode) {
          const o = kit.owner, g = o.game, short = mode === 'right';
          const soon = (d) => { d.fuse = Math.min(d.fuse, g.time - d.born + 0.8); };
          toss(o, short ? 'lob' : 'c2', { rule: 'bounce', bounces: Infinity, color: 0xffffff, fuse: short ? 1 : 1.6, onBounce: soon, onStop: soon,
            onFuse: (d) => g.flash(o, [d.pos[0], d.pos[1] + 0.2, d.pos[2]], 2.25) });
        },
      },
      e: {
        item: 'knife', name: 'Zero Point', desc: 'Hold the knife, left click to throw it (30 m). It sticks to the first surface and after 1 s pulses 15 m: enemies caught are revealed and suppressed (no abilities) for 8 s. Enemies can shoot it out first (20 HP).', charges: 1, cooldown: 50, equip: 0.8,
        use(kit) {
          const o = kit.owner, pos = aimPoint(o, 30, { back: 0.15 });
          const ft = flight(o.eye(), pos, 22), g = o.game;
          g.emit('throw', { who: o, from: o.eye(), to: pos, time: ft, color: 0x6fa8ff });
          later(kit, ft, () => {
            const knife = g.addDevice({ kind: 'zknife', owner: o, pos, life: 2 });
            later(kit, 1, () => { if (!knife.removed) g.pulse(o, pos, 15, 'suppress', 8, 0x6fa8ff); });
          });
        },
      },
      x: {
        name: 'Overload', desc: 'Overload for 12 s: pulses every 2 s reveal and suppress enemies within 42.5 m for 4 s, and you get Combat Stim (10% faster fire rate, reload and draw). If you would die, you go down instead: a teammate within 3 m who holds F for 1.5 s (bots just need to stand there) gets you back up at full health. Nobody comes within 15 s, or the enemy finishes you (850 HP), and you’re dead.', points: 8,
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
        instant: true, name: 'Pick-Me-Up', desc: 'Absorb the life force of an enemy you killed or damaged who died in the last 6 s. It takes 0.7 s, then gives +50 temporary health (it lasts 10 s, then fades) and 10% haste for 3 s.', charges: 1, cooldown: 30,
        use(kit) {
          const o = kit.owner, g = o.game;
          const prey = g.combatants.find(c => !c.alive && g.isEnemy(o, c) && c.diedAt > kit.now - 6 && (c.damagedBy?.has(o) || c.killedBy?.killer === o) && !c.soulTaken);
          if (!prey) return false;
          prey.soulTaken = true;
          g.emit('ability', { who: o, type: 'windup' });
          mine(kit, 0.7, () => {
            kit.healOver(50, 1, 150); // 50 temporary health, at 50 a second
            o.st.hasteUntil = kit.now + 3; o.st.hasteAmt = 0.1;
            g.emit('ability', { who: o, type: 'heal' });
          });
        },
      },
      q: {
        item: 'orb', name: 'Meddle', desc: 'Hold the fragment, left click to throw it (29 m/s). 0.75 s after it lands it erupts in a 4 m burst: enemies caught lose 90 health to Decay (never lethal), which comes back over 5 s.', charges: 1, cooldown: 25, equip: 0.8, throw: 'c3',
        use(kit) {
          const o = kit.owner, g = o.game;
          toss(o, 'c3', { color: 0xe07bd0, onStop: (d) => {
            d.until = g.time + 0.8;
            const pos = floorUnder(g, d.pos);
            later(kit, 0.75, () => {
              d.removed = true;
              g.emit('pulse', { pos: [pos[0], pos[1] + 1, pos[2]], r: 4, type: 'decay', color: 0xe07bd0, owner: o });
              for (const c of g.combatants) if (c.alive && g.isEnemy(o, c) && Math.hypot(c.pos[0] - pos[0], c.pos[2] - pos[2]) < 4 && Math.abs(c.pos[1] - pos[1]) < 3) g.decay(c, 90, { delay: 0, over: 5 });
            });
          } });
        },
      },
      e: {
        name: 'Ruse', desc: 'Open the map and click up to two spots (one per charge, within 55 m); press E or right click to drop smokes there 1 s later (13.5 s). Works while you are dead: one smoke, 5.5 s, within 42.5 m.', charges: 2, cooldown: 40, instant: true,
        use(kit) {
          const o = kit.owner;
          kit.mapPick = {
            key: 'e', title: 'RUSE', hint: 'Click up to ' + kit.charges.e + ' spots · E or right click to drop the smokes', max: o.alive ? kit.charges.e : Math.min(1, kit.charges.e), color: '#e07bd0', radius: 4, range: o.alive ? 55 : 42.5,
            confirm: (picks) => {
              for (const p of picks) {
                kit.charges.e--;
                if (!kit.ready.e) kit.ready.e = kit.now + this.cooldown;
                o.game.emit('throw', { who: o, from: [p[0], p[1] + 25, p[2]], to: [p[0], p[1] + 2, p[2]], time: 1, color: 0xe07bd0 });
                const at = [p[0], p[1] + 2, p[2]];
                const t0 = kit.now, life = o.alive ? 13.5 : 5.5;
                kit.timers.push({ at: t0 + 1, dead: true, fn: () => o.game.addSmoke(o, at, kit.now, { radius: 4, life, color: 0x7a3f74 }) });
              }
              kit.lastUse.e = kit.now;
            },
          };
          return 'pending';
        },
      },
      x: {
        name: 'Not Dead Yet', desc: 'After you die, press X to come back where you fell. Reviving takes 1.5 s, untouchable. You then have 10 s to get a kill or damage an enemy — otherwise you die again.', points: 8,
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

  // Stella's stars in hand are her E charges.
  get starsLeft() { return this.charges.e; }
  set starsLeft(n) { this.charges.e = n; }

  // Use up a charge of ability k outside spend() (abilities set off by a second press, like Stella's stars).
  take(k) {
    this.charges[k]--;
    if (!this.ready[k]) this.ready[k] = this.now + this.agent.abilities[k].cooldown;
    this.lastUse[k] = this.now;
  }

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
    this.nebulas = 2; // Stella: Nebula charges
    this.mustScoreUntil = 0;
    this.dist = undefined; this.phase = false; this.bounces = 0;
    this.secondLife = 0;
    this.focusUntil = 0;
    this.shield = false;
    this.nullUntil = 0;
    this.nullSaved = false;
    this.downed = null;
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
    this.bladesAway = 0;
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
    if (rule.star) g.addSmoke(o, [d.pos[0], d.pos[1] + 2, d.pos[2]], this.now, { radius: 4.75, life: 1.75, color: 0x6b4d8f }); // Dissipate: a brief fake Nebula
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
  roundTimer(k) { const r = this.agent.abilities[k].recharge; return r === 'timer' || (k === 'e' && !r); }

  spend(k, mode) {
    const ab = this.agent.abilities[k];
    const r = ab.use(this, mode);
    if (r === false) { this.owner.game.emit('abilityFail', { who: this.owner, key: k }); return false; } // keep holding it
    this.armed = null;
    if (r === 'pending') return; // spends its own charges once confirmed (map picks)
    const ck = ab.shares || k; // Devour and Dismiss draw on one pool
    if (!ab.free?.(this)) {
      this.charges[ck]--;
      if (!this.ready[ck]) this.ready[ck] = this.now + ab.cooldown;
    }
    this.lastUse[k] = this.now;
    this.owner.game.emit('abilityUsed', { who: this.owner, key: k });
  }

  tick(now) {
    this.now = now;
    const o = this.owner, inp = o.input, ab = this.agent.abilities, g = o.game;
    for (const k of ABILITY_KEYS) this.recharge(k, now);
    if (this.tailwind && now > this.tailwind.until) this.tailwind = null; // unused dash fades

    const buyLock = g.mode?.phase === 'buy';
    if (o.st.disarmUntil > now || this.downed) { // detained (or down in Overload): no abilities, no ability guns
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
      if (this.charges[ab[k].shares || k] <= 0 && !ab[k].free?.(this)) continue;
      if (!ab[k].instant) { this.armed = { k, at: now }; o.gun.onHolster(); g.emit('abilityArm', { who: o, key: k }); continue; } // equip first
      this.spend(k);
    }
    const held = this.armed && ab[this.armed.k];
    this.previewPos = held?.preview ? held.preview(this) : null; // what the player sees is where it lands
    if (this.armed && now - this.armed.at > (held.equip ?? 0.25)) { // its draw time, before it can be used
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
      if (a.bounces && inp.altPressed) { this.bounces = ((this.bounces || 0) + 1) % 3; inp.altPressed = false; } // right click: 0, 1 or 2 bounces
      if (a.charge) {
        // Hold left click to charge, release to fire.
        if (inp.fire) {
          this.chargeT = Math.min(a.charge, (this.chargeT || 0) + 1 / 128); this.power = this.chargeT / a.charge;
          if (a.chargeSlow) { o.st.slowUntil = now + 0.05; o.st.slowAmt = a.chargeSlow; } // Fissure: slower while charging
        }
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
      else if (this.bladesAway > 0 && !this.busy()) {
        // Edgestorm blades put away by switching weapons come back out (0.5 s) with what was left.
        this.armed = null;
        this.blades = { left: this.bladesAway, next: now + 0.5 };
        this.bladesAway = 0;
        o.gun.onHolster();
      }
      else if (this.ultPoints >= this.ultCost && !this.busy() && !this.rebirth) {
        this.armed = null;
        const r = ab.x.use(this, now);
        if (r !== false && r !== 'pending') { this.ultPoints = 0; this.lastUse.x = now; }
      }
    }

    // Delayed effects (fuses, wind-ups, sonar pulses...)
    this.runTimers(now);

    if (this.downed) this.tickDowned(now);
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
    o.st.intangibleUntil = o.st.channelUntil = this.now + 1.5; // 1.5 s to revive: nothing touches her, and no gun yet
    this.mustScoreUntil = this.now + 1.5 + 10;
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
    else if (now < this.nullUntil && !this.nullSaved) {
      // Overload: down, not dead. A teammate has to get him up (tickDowned); he can still be finished off.
      this.nullSaved = true;
      this.downed = { until: now + 15, help: 0, upAt: 0 };
      o.hp = 850; o.armor = 0;
      o.st.downedUntil = o.st.rootUntil = now + 15;
      this.armed = null;
      o.game.emit('ability', { who: o, type: 'downed' });
      return true;
    }
    else return false;
    o.hp = 1; o.armor = 0;
    o.st.downedUntil = now + delay;
    o.st.intangibleUntil = now + delay;
    o.st.slowUntil = now + delay; o.st.slowAmt = 0.9;
    o.game.emit('ability', { who: o, type: 'downed' });
    mine(this, delay, () => { o.hp = PLAYER.hp; o.armor = this.nullArmor ?? PLAYER.armor; o.game.emit('ability', { who: o, type: 'rekindled' }); if (!this.busy()) o.equip(o.slot, this.now, true); });
    return true;
  }

  // Down in Overload: a living teammate within 3 m revives him by holding F for 1.5 s (a bot only has to be
  // there); he is back up 1.35 s after that. Left alone for 15 s, he dies.
  tickDowned(now) {
    const o = this.owner, g = o.game, d = this.downed, DT = 1 / 128;
    if (d.upAt) {
      if (now >= d.upAt) {
        this.downed = null;
        o.hp = PLAYER.hp; o.armor = this.nullArmor ?? PLAYER.armor;
        o.st.downedUntil = o.st.rootUntil = 0;
        g.emit('ability', { who: o, type: 'rekindled' });
        if (!this.busy()) o.equip(o.slot, now, true);
      }
      return;
    }
    const helper = g.combatants.some(c => c !== o && c.alive && !g.isEnemy(o, c) && !(c.st.downedUntil > now) && Math.hypot(c.pos[0] - o.pos[0], c.pos[2] - o.pos[2]) < 3 && Math.abs(c.pos[1] - o.pos[1]) < 2 && (c.isBot || c.input.use));
    d.help = helper ? d.help + DT : 0;
    if (d.help >= 1.5) { d.upAt = now + 1.35; o.st.downedUntil = o.st.rootUntil = d.upAt; o.st.intangibleUntil = d.upAt; return; }
    if (now >= d.until) {
      this.downed = null;
      o.st.downedUntil = o.st.rootUntil = 0;
      g.kill(o, o.lastDowner || o, { part: 'body', def: { id: 'overload', name: 'Overload', cat: 'Ability' }, wallbang: false });
    }
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
    // Coming back takes 2.4 s: 1 s burning away (gone from sight), then 1.4 s re-forming at the mark. Nothing
    // can touch him until it's done, and he can't move or shoot.
    const now = this.now;
    o.st.hiddenUntil = now + 1;
    o.st.intangibleUntil = o.st.channelUntil = o.st.rootUntil = now + 2.4;
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
      b.next = now + 0.45;
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
    o.st.rootUntil = now + 0.05; o.input.jump = false; // no moving or jumping while the beams are out
    if (now < b.next || !o.input.firePressed) return;
    b.left--;
    b.next = now + (b.left > 0 ? 0.75 : 0.6);
    o.game.beam(o, o.eye(), dirFromAngles(o.yaw, o.pitch), BEAMS);
  }

  onKill(def, victim) {
    this.lastKillAt = this.now;
    if (this.now < this.focusUntil && victim) {
      const e = victim.eye();
      this.owner.game.addDevice({ kind: 'focusorb', owner: this.owner, pos: [e[0], e[1] + 0.6, e[2]], life: 3 });
    }
    if (def?.id === 'tourdeforce' && victim) this.owner.game.addZone({ kind: 'slowfield', color: 0xe8c26a, owner: this.owner, pos: [...victim.pos], r: 6, life: 4, slowField: 0.5 }, this.now);
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
      this.dropOrb(victim);
      if (this.now < this.empressUntil) this.healOver(50, 2.5, 150); // Ravenous: every kill Feasts by itself and keeps the orb
    }
  }

  // Soul Harvest: an enemy Vex killed, or hurt in the 3 s before they died, leaves her an orb for 3 s.
  dropOrb(victim) {
    const orb = { pos: victim.eye(), until: this.now + 3, life: 3 };
    this.orbs.push(orb);
    this.owner.game.emit('orb', { kit: this, orb });
  }

  // Third wave: sprint/slide, lightning beam, phase-out, piloted tiger, camera view + dart.
  tickWave3(now) {
    const o = this.owner, inp = o.input, g = o.game, DT = 1 / 128;
    if (this.highGear) {
      if (!this.overdrive) this.energy -= 100 / 16 * DT; // a full bar is 16 s of sprint; in Overload it runs on Overload's meter
      if (this.energy <= 0) { this.energy = 0; this.highGear = null; }
      else if (inp.altPressed && now >= this.slideAt && o.grounded && o.horizSpeed() >= 3 && Math.hypot(inp.fwd, inp.side) > 0) {
        // Slide: right click while moving at 3 m/s or more. 12 m/s for 0.6 s, about 7 m.
        const len = Math.hypot(inp.fwd, inp.side), sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
        const dir = [(-sy * inp.fwd + cy * inp.side) / len, (-cy * inp.fwd - sy * inp.side) / len];
        o.dash = { until: now + 0.6, dir, speed: 12, exit: 8 };
        this.slideAt = g.mode ? Infinity : now + 8; // 5v5: one slide a round, back after two kills
        if (!this.overdrive) { // the slide ends Overclock and the gun comes back out; in Overload you keep running
          this.highGear = null;
          o.equip(o.slot, now, true);
        }
        g.emit('ability', { who: o, type: 'dash' });
      }
    } else this.energy = Math.min(100, this.energy + 100 / 60 * DT); // empty to full in 60 s
    this.prevCrouch = inp.crouch;

    if (this.overdrive) {
      const od = this.overdrive;
      od.fuel -= 10 * DT; // 10 s of Overload unless kills top it up
      // Its 40 shots come back one every 0.05 s, starting 0.5 s after the last shot.
      if (od.mag < OVERDRIVE.mag && now >= od.firedAt + 0.5 && now >= od.loadAt) { od.mag++; od.loadAt = now + 0.05; }
      if (od.fuel <= 0) { this.overdrive = null; this.highGear = null; o.equip(o.slot, now, true); }
      else if (inp.fire && now >= od.next && od.mag > 0) {
        od.next = now + 1 / OVERDRIVE.rate;
        od.mag--; od.firedAt = now;
        const sp = 0.25 * DEG * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
        const d = dirFromAngles(o.yaw + Math.cos(th) * sp, o.pitch + Math.sin(th) * sp), eye = o.eye();
        const res = g.trace(o, eye, d, 0);
        const end = [eye[0] + d[0] * res.endT, eye[1] + d[1] * res.endT, eye[2] + d[2] * res.endT];
        o.stats.shots++;
        g.emit('tracer', { who: o, gun: { def: OVERDRIVE }, from: eye, to: end, finger: true });
        g.emit('overloadShot', { who: o });
        if (res.hit) {
          // 18 to the body out to 20 m, falling to 10 at 43 m; head x3, legs x0.85.
          const O = OVERDRIVE, part = res.hit.part, dist = res.hit.t;
          const body = dist <= O.near ? O.dmg[0][2] : dist >= O.far ? O.farBody : O.dmg[0][2] - (O.dmg[0][2] - O.farBody) * (dist - O.near) / (O.far - O.near);
          g.damage(res.hit.c, o, Math.round(body * (part === 'head' ? 3 : part === 'body' ? 1 : 0.85)), { part, def: O, dist, point: end, wallbang: false });
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
      else if (t.kind === 'tiger' && inp.firePressed && now - t.born > 0.3) t.leap = true; // left click: leap (game.tickDevices)
      else if (t.kind === 'sdrone' && inp.firePressed && now >= (t.pulseAt ?? t.born + 0.6)) {
        // Scout Drone's pulse: a flattened sphere 16 m across the ground; revealed and suppressed for 8 s.
        t.pulseAt = now + 1.5;
        g.pulse(o, t.pos, 16, 'suppress', 8, 0xd9a441, false, { flat: 0.4 });
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
    // Combat Stim (Rally's beacon, Ravenous, Overload): fire rate, reload and draw all 10% faster. It doesn't stack.
    const stim = o.st.stimUntil > now || now < this.empressUntil || now < this.nullUntil ? 1.1 : 1;
    const reload = now < this.focusUntil ? 1.25 : 1; // Focus: 25% faster reload
    for (const slot in o.inv) { const gun = o.inv[slot]; if (gun) { gun.buffRate = stim; gun.buffRecoil = 1; gun.buffHandling = stim; gun.buffReload = reload; } }
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
    if (nz && now < nz.until) { // it spreads from 1.5 m to 9 m over 5 s
      nz.r = Math.min(9, 1.5 + 7.5 * (now - nz.born) / 5);
      if (this.nest) this.nest.radius = nz.r;
      if (o.alive && Math.hypot(o.pos[0] - nz.pos[0], o.pos[2] - nz.pos[2]) < Math.max(nz.r, 2.5)) { nz.until = now + 8; if (this.nest) this.nest.until = now + 8; }
    }
    if (this.launcher && now >= this.launcher.until) this.launcher = null; // Finale: 10 s to fire it
    this.orbs = this.orbs.filter(b => b.until > now);
    // Viper fuel: drains while any gas is on, refills when it's all off
    const groups = Object.values(this.gas.groups);
    const on = groups.filter(gr => gr.active);
    if (on.length) {
      // 8.33 fuel a second with one source up, 12.5 with both; a source starts drawing 0.5 s after it comes on.
      const drawing = on.filter(gr => now >= gr.onAt + 0.5).length;
      this.gas.fuel = Math.max(0, this.gas.fuel - (drawing >= 2 ? 12.5 : drawing ? 100 / 12 : 0) * DT);
      if (this.gas.fuel <= 0) for (const gr of on) gasOff(this, gr);
    } else this.gas.fuel = Math.min(100, this.gas.fuel + 100 / 30 * DT); // empty to full in 30 s
    // Rocket launcher
    if (this.launcher && o.input.firePressed && now >= this.launcher.ready) {
      this.launcher = null;
      // The rocket flies straight at 25 m/s, no gravity, and goes off on the first wall or enemy it meets.
      const boom = (d) => { d.removed = true; g.explode(o, d.pos, 7, 150, 30, src('rocket', 'Finale'), 0xff8c2e, true, false, 4.5); };
      g.throwProj(o, 25, 0, { rule: 'stick', hitBodies: true, model: 'rocket', color: 0xff8c2e, fuse: 8, onStop: boom, onFuse: boom });
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
