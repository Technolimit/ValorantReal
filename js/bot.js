// Bot brain. Bots press the same inputs a player would, so their guns follow the same spread,
// recoil and movement-accuracy rules: they stop (or counter-strafe) to shoot, burst at range and spray up close.
import { dirFromAngles } from './entity.js';
import { PLAYER } from './config.js';
import { botAbilities } from './botkit.js';
import { hyp } from './vmath.js';
import { SHOOTABLE } from './game.js';

// How close an enemy has to be to make out hidden gadgets (as players see them: render.js STEALTH).
const HIDDEN = { wire: 3, swarm: 5.25, alarm: 7, cam: 8 };

export const BOT_NAMES = ['Kestrel', 'Rook', 'Ember', 'Quill', 'Talon', 'Vesper', 'Drift', 'Nova', 'Hex', 'Moth'];

const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Bot skill, by Valorant rank. Each rank is tuned so its bots land about that rank's real headshot rate
// (realHS: tracker.gg's median HS% for the middle division, e.g. Gold 2), measured with tools/measure-bot-ranks.mjs.
// Simple reaction time hardly differs between ranks (players report ~150-240 ms at every rank); what does is how
// long it takes to spot someone and get the crosshair there, so `react` is that whole "see it, register it" delay.
//   react: seconds from an enemy appearing to starting the flick.  head: chance to go for the head on a burst
//     (calibrated: past Platinum, cleaner aim, not more head attempts, is what lifts the headshot rate).
//   wn / vmax: how fast the aim moves. It's a smooth, critically damped motion (speeds up, slows into the target)
//     with natural frequency wn (1/s) and a top speed of vmax (deg/s), never an instant snap.
//   track: how well they match a moving target's speed (1: no lag behind a strafing enemy; 0: always behind).
//   under / over: the flick stops short by about `under` of the distance (people undershoot, then correct); with
//     chance `over` it overshoots instead.  err: extra random aim error (deg) at first sight.
//   tau: how fast that error settles (s), down to a wobble of about `floor` degrees.
//   tol: how far off (in target widths) they'll still fire.  comp: share of recoil they pull down.
//   stop: chance to stop (counter-strafe) before shooting.  adad: chance to strafe between bursts, for strafeT s.
//   spray: how much longer than ideal they hold the trigger at range.  place: how good their crosshair placement is
//     while moving (1: always at head height on the next corner; low: often at the floor or chest).
//   fov: how wide they notice things (deg either side).
export const RANKS = {
  iron: { label: 'Iron', realHS: 11.4, react: [0.4, 0.6], head: 0.42, wn: 8, vmax: 380, track: 0.4, under: 0.25, over: 0.3, err: 5.5, tau: 0.7, floor: 1.9, tol: 3.8, comp: 0.08, stop: 0.3, adad: 0.35, strafeT: [0.35, 0.8], spray: 1.6, place: 0.25, fov: 55 },
  bronze: { label: 'Bronze', realHS: 13.7, react: [0.37, 0.55], head: 0.45, wn: 9, vmax: 450, track: 0.48, under: 0.22, over: 0.27, err: 4.9, tau: 0.62, floor: 1.7, tol: 3.5, comp: 0.15, stop: 0.42, adad: 0.42, strafeT: [0.3, 0.7], spray: 1.5, place: 0.35, fov: 58 },
  silver: { label: 'Silver', realHS: 17.1, react: [0.34, 0.5], head: 0.59, wn: 10, vmax: 520, track: 0.56, under: 0.19, over: 0.24, err: 4.3, tau: 0.55, floor: 1.5, tol: 3.1, comp: 0.25, stop: 0.55, adad: 0.5, strafeT: [0.28, 0.6], spray: 1.35, place: 0.45, fov: 62 },
  gold: { label: 'Gold', realHS: 20.3, react: [0.31, 0.45], head: 0.7, wn: 11.5, vmax: 600, track: 0.64, under: 0.16, over: 0.21, err: 3.7, tau: 0.48, floor: 1.25, tol: 2.8, comp: 0.38, stop: 0.68, adad: 0.58, strafeT: [0.25, 0.55], spray: 1.2, place: 0.58, fov: 66 },
  platinum: { label: 'Platinum', realHS: 23.2, react: [0.28, 0.41], head: 0.68, wn: 13, vmax: 680, track: 0.71, under: 0.14, over: 0.18, err: 3.2, tau: 0.42, floor: 1.05, tol: 2.5, comp: 0.5, stop: 0.8, adad: 0.65, strafeT: [0.22, 0.5], spray: 1.1, place: 0.68, fov: 70 },
  diamond: { label: 'Diamond', realHS: 25.6, react: [0.26, 0.37], head: 0.65, wn: 14.5, vmax: 760, track: 0.78, under: 0.12, over: 0.16, err: 2.7, tau: 0.36, floor: 0.85, tol: 2.2, comp: 0.6, stop: 0.88, adad: 0.72, strafeT: [0.2, 0.45], spray: 1, place: 0.78, fov: 74 },
  ascendant: { label: 'Ascendant', realHS: 27.8, react: [0.24, 0.33], head: 0.67, wn: 16, vmax: 850, track: 0.84, under: 0.1, over: 0.14, err: 2.3, tau: 0.31, floor: 0.7, tol: 2, comp: 0.7, stop: 0.93, adad: 0.78, strafeT: [0.18, 0.4], spray: 0.95, place: 0.85, fov: 77 },
  immortal: { label: 'Immortal', realHS: 30.5, react: [0.22, 0.3], head: 0.66, wn: 18, vmax: 950, track: 0.9, under: 0.08, over: 0.12, err: 1.9, tau: 0.26, floor: 0.55, tol: 1.8, comp: 0.78, stop: 0.97, adad: 0.83, strafeT: [0.16, 0.36], spray: 0.9, place: 0.92, fov: 80 },
  radiant: { label: 'Radiant', realHS: 31.9, react: [0.2, 0.27], head: 0.6, wn: 20, vmax: 1050, track: 0.94, under: 0.06, over: 0.1, err: 1.5, tau: 0.22, floor: 0.42, tol: 1.6, comp: 0.85, stop: 1, adad: 0.87, strafeT: [0.14, 0.32], spray: 0.85, place: 0.97, fov: 82 },
};
// The old difficulty names (saved settings, an online host on an older build) map onto ranks.
export const LEGACY_RANK = { easy: 'silver', normal: 'gold', hard: 'diamond', pro: 'immortal' };
export const rankOf = (id) => RANKS[id] ? id : LEGACY_RANK[id] || 'gold';
export const DIFFICULTY = RANKS;

// Static walls only (not ability walls or buy-phase barriers), for the nav helpers below.
const solidAt = (g, minx, miny, minz, maxx, maxy, maxz) => {
  for (const b of g.world.boxes) {
    if (b.passable || b.temp || b.floor) continue;
    if (minx < b.max[0] && maxx > b.min[0] && miny < b.max[1] && maxy > b.min[1] && minz < b.max[2] && maxz > b.min[2]) return true;
  }
  return false;
};
const fits = (g, x, y, z, pad = 0.12) => { const r = PLAYER.radius + pad; return !solidAt(g, x - r, y + 0.35, z - r, x + r, y + 1.7, z + r); };
// The free spot nearest p (within 1 m) where a standing body fits; p itself if nothing is free.
function fitNear(g, p) {
  if (fits(g, p[0], p[1], p[2])) return p;
  for (const r of [0.25, 0.5, 0.75, 1.0]) for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, x = p[0] + Math.cos(a) * r, z = p[2] + Math.sin(a) * r;
    if (fits(g, x, p[1], z)) return [x, p[1], z];
  }
  return p;
}
// Where to walk to in a nav cell: its centre, moved off any wall it hugs. Cached per map.
function clearSpot(g, [cx, cz]) {
  const m = g.map, cache = (m.clearSpots ||= new Map()), k = cz * m.W + cx;
  let p = cache.get(k);
  if (!p) { const c = m.cellCenter(cx, cz); p = fitNear(g, [c.x, m.heights[cz][cx] ?? 0, c.z]); cache.set(k, p); }
  return p;
}
// Would a step of 0.45 m along (ux, uz) put the body into a wall? Steps and stairs don't count.
function blockedAhead(g, me, ux, uz) {
  const x = me.pos[0] + ux * 0.45, z = me.pos[2] + uz * 0.45, r = PLAYER.radius;
  return !!g.world.overlap(x - r, me.pos[1] + PLAYER.stepHeight + 0.05, z - r, x + r, me.pos[1] + 1.6, z + r);
}

export class Bot {
  constructor(me, game, difficulty, mode) {
    this.me = me;
    this.game = game;
    this.rank = rankOf(difficulty);
    this.d = RANKS[this.rank];
    this.mode = mode; // 'fight' | 'passive' | 'static'
    this.reset(0);
  }

  reset(now) {
    this.target = null;
    this.lastSeen = -100;
    this.investigate = null; // { pos, until }: last place an enemy was seen, heard or shot from
    this.reactUntil = 0;
    this.errY = 0;
    this.errP = 0;
    this.wobY = 0;
    this.wobP = 0;
    this.aimHead = false;
    this.path = null;
    this.pathIdx = 0;
    this.nextSense = now;
    this.phase = 'shoot';
    this.phaseUntil = 0;
    this.strafeDir = 1;
    this.burstLeft = 0;
    this.lastShotSeen = -1;
    this.alertUntil = 0;
    this.lookAt = null;
    this.stuckCheck = { t: now + 1.5, pos: [...this.me.pos] };
    this.unstickUntil = 0;
    this.crouchSpray = false;
    this.used = new Set(); // abilities already used for a one-per-round purpose
    this.lastSeenPos = null;
    this.pushUntil = 0;
    this.rotateAt = 0; // team AI: when this defender starts a called rotation, and where to
    this.rotatedTo = null;
    this.aggr = 0.35 + Math.random() * 0.5; // how readily this bot pushes a contact instead of holding
    this.lookCheckAt = 0; this.pathLookPt = null; this.pathLookFor = null;
    this.clearFor = null; this.angle = null; this.angleCheckAt = 0;
    this.backOffUntil = 0;
    this.killSeen = this.lastKillAt ?? -1;
    this.wY = 0; this.wP = 0; this.aimGoal = null; // aim motion: angular velocity and where it's heading this tick
    this.placeUntil = 0; this.placing = true;
    this.cut = null; this.cutAt = 0;
  }

  hear(source, now) {
    if (this.mode === 'static' || now - this.lastSeen < 1 || this.me.st.deafUntil > now) return; // deafened: hears nothing
    if (this.game.isEnemy(this.me, source)) this.game.mode?.report?.(this.me, source, source.pos, 'heard');
    this.alert(source.pos, now);
  }

  onDamaged(attacker, now) {
    if (this.mode === 'static' || now - this.lastSeen < 0.5) return;
    if (attacker && attacker !== this.me) this.game.mode?.report?.(this.me, attacker, attacker.pos, 'shot');
    this.alert(attacker.pos, now);
  }

  alert(pos, now) {
    this.alertUntil = now + 2;
    this.lookAt = [...pos];
    this.investigate = { pos: [...pos], until: now + 5 };
    this.path = null;
  }

  think(now, dt) {
    this.aimGoal = null;
    this.decide(now, dt);
    // Standing in enemy fire, acid, a Hive, an orbital strike or a Clampdown about to go off: step out of it,
    // still shooting if there's a fight on. (Not while defusing against the clock.)
    const hz = this.mode === 'fight' && !this.goal?.commit && !this.me.kit?.busy() && this.hazard(now);
    if (hz) {
      const me = this.me;
      this.moveDir(me.pos[0] - hz.pos[0] || 0.01, me.pos[2] - hz.pos[2]);
      me.input.walk = false; me.input.crouch = false;
    }
    this.moveAim(dt);
  }

  // The enemy area-damage zone this bot is standing in, if any. Thin ones (a fire wall, a gas wall) are just
  // crossed: stepping out of those sideways would only keep a bot bouncing off them.
  hazard(now) {
    const me = this.me, g = this.game;
    for (const z of g.zones) {
      if (now >= z.until || z.gas || z.r < 1.5 || !g.isEnemy(z.owner, me)) continue;
      if (!(z.kind === 'fire' && z.dps > 0) && z.kind !== 'lockdown') continue;
      if (hyp(me.pos[0] - z.pos[0], me.pos[2] - z.pos[2]) < z.r + 0.6 && Math.abs(me.pos[1] - z.pos[1]) < 3) return z;
    }
    return null;
  }

  decide(now, dt) {
    const me = this.me, inp = me.input;
    inp.fwd = 0; inp.side = 0; inp.walk = false; inp.fire = false; inp.alt = false; inp.use = false;
    inp.crouch = this.crouchSpray;
    const mode = this.game.mode;
    // A teammate bought us the gun we asked for: go and pick it up (it dropped where we stood).
    const gift = mode && mode.phase !== 'end' && this.game.drops.length && this.game.drops.find(d => d.for === me && d.gun.def.id !== me.inv[d.gun.def.slot]?.def.id);
    if (gift && (mode.phase === 'buy' || now - this.lastSeen > 2)) {
      this.moveTo(gift.pos, now, dt);
      if (!this.path) this.steer(gift.pos[0] - me.pos[0], gift.pos[2] - me.pos[2], now);
      return;
    }
    if (mode && mode.phase === 'buy' && this.goal) { this.target = null; this.pursueGoal(now, dt); inp.fire = false; inp.use = false; return; } // defenders walk to their spots
    if (mode && (mode.phase === 'buy' || mode.phase === 'end')) { this.target = null; return; } // waiting behind the barrier / round over

    if (this.mode === 'static') return;

    if (now >= this.nextSense) {
      this.nextSense = now + rand(0.07, 0.12);
      this.sense(now);
    }
    if (this.mode !== 'passive') botAbilities(this, now);
    if (me.kit?.busy() || me.kit?.armed) return; // mid-ability (map open, etc.)
    const t = this.target;
    // Out of time on the spike: keep defusing even under fire.
    if (this.goal?.commit && hyp(me.pos[0] - this.goal.pos[0], me.pos[2] - this.goal.pos[2]) < 1.2) { inp.use = true; return; }
    if (t && t.alive && now - this.lastSeen < 0.2) {
      this.engage(now, dt);
      return;
    }
    if (t && !t.alive) this.target = null;
    this.crouchSpray = false;
    this.burstLeft = 0;
    // Enemy utility in sight with nobody to fight (a turret, camera, trap wire, alarm bot...): shoot it out.
    if (this.mode === 'fight' && now - this.lastSeen > 1.5 && !this.goal?.commit && !this.goal?.action) {
      if (now >= (this.utilCheck || 0)) { this.utilCheck = now + 0.3; this.util = this.findUtil(); }
      const u = this.util;
      if (u && !u.removed && u.hp > 0 && this.shootUtil(u, now, dt)) return;
    }

    // Reload when it's safe: straight after a fight only if nearly empty, otherwise once nobody's been seen for
    // a moment. A magazine reload can't be cut short, so starting one with an enemy around is how you die.
    const gun = me.gun, full = gun.def.mag, quiet = now - this.lastSeen > 2.5;
    if (full && !gun.reloading && gun.reserve > 0 && (gun.mag < full * 0.25 || (quiet && gun.mag < full * 0.6))) inp.reload = true;
    // Switched to the sidearm mid-fight: back to the primary once it's over.
    const prim = me.inv.primary;
    if (quiet && me.slot === 'secondary' && prim && (prim.mag > 0 || prim.reserve > 0) && !me.kit?.busy()) me.equip('primary', now);

    // Round mode: the team plan gives each bot a goal (hold a spot, stage, entry, plant, defuse, pick up).
    // Active play: after a contact (or right after throwing a flash) push the spot instead of waiting on
    // the assigned position — attackers almost always, defenders depending on temperament.
    const gl = this.goal, side = mode?.side(me), lsp = this.lastSeenPos, ago = now - this.lastSeen;
    // A free ultimate orb a few steps away and nobody around: go take it.
    // Sent for one by the team plan (an orb on our side of the map, early in the round): walk all the way to it.
    const orbReach = gl?.kind === 'orb' ? 60 : 10;
    const orb = mode?.orbs && ago > 4 && !gl?.commit && me.kit && me.kit.ultPoints < me.kit.ultCost && (gl?.kind === 'orb' ? (!gl.orb.taken && gl.orb) : mode.orbs.find(o => !o.taken && hyp(me.pos[0] - o.pos[0], me.pos[2] - o.pos[2]) < orbReach && Math.abs(me.pos[1] - o.pos[1]) < 1.5));
    if (orb) {
      if (mode.orbNear(me) === orb) { inp.use = true; return; }
      this.moveTo(orb.pos, now, dt);
      if (!this.path) this.steer(orb.pos[0] - me.pos[0], orb.pos[2] - me.pos[2], now);
      return;
    }
    // Got a kill holding a spot: often move off it, since the enemy's teammates now know where it is.
    if (this.lastKillAt > this.killSeen) {
      this.killSeen = this.lastKillAt;
      if (gl?.kind === 'hold' && Math.random() < 0.5) this.nextShift = now + rand(0.4, 1.2);
    }
    // Hurt: no pushing a fight (a trade or a flash-and-go still goes). Just out of a fight, back off a few
    // steps with the crosshair still on the angle, like a player who knows one more hit kills them.
    const weak = me.hp + me.armor * 0.5 < 45 && !gl?.commit && !gl?.action;
    if (weak && lsp && ago < 2.5 && now >= this.pushUntil && this.backOffUntil < this.lastSeen) this.backOffUntil = now + rand(0.8, 1.6);
    if (weak && lsp && now < this.backOffUntil) {
      const bx = me.pos[0] - lsp[0], bz = me.pos[2] - lsp[2];
      this.steer(bx, bz, now);
      this.turnToward(lsp, PLAYER.standEye, dt, 0.6);
      return;
    }
    if (gl && lsp && !gl.action && !gl.commit && hyp(me.pos[0] - lsp[0], me.pos[2] - lsp[2]) > 2 &&
        (now < this.pushUntil || (!weak && ago > 0.4 && ago < 3.5 && this.aggr > (side === 'atk' ? 0.3 : 0.6)))) {
      this.moveTo(lsp, now, dt);
      if (!this.path) this.steer(lsp[0] - me.pos[0], lsp[2] - me.pos[2], now);
      this.turnToward(lsp, PLAYER.standEye, dt, 0.6);
      return;
    }
    if (this.goal) { this.pursueGoal(now, dt); return; }

    const inv = this.investigate;
    if (inv && now < inv.until && hyp(me.pos[0] - inv.pos[0], me.pos[2] - inv.pos[2]) > 1.5) {
      this.moveTo(inv.pos, now, dt);
      if (!this.path) { const t = fitNear(this.game, inv.pos); this.steer(t[0] - me.pos[0], t[2] - me.pos[2], now); }
      if (this.lookAt) this.turnToward(this.lookAt, PLAYER.standEye, dt, 0.5);
    } else {
      this.investigate = null;
      this.patrol(now, dt);
      if (this.lookAt && now < this.alertUntil) this.turnToward(this.lookAt, PLAYER.standEye, dt, 0.5);
    }
  }

  sense(now) {
    const me = this.me, g = this.game;
    if (me.st.blindUntil > now) return; // flashed: can't see anything
    const sight = g.sightRange(me);
    const eye = me.eye();
    const fwd = dirFromAngles(me.yaw, 0);
    const cosFov = Math.cos((now < this.alertUntil ? 110 : this.d.fov) * DEG);
    let best = null, bestScore = Infinity, bestHead = false;
    for (const o of g.combatants) {
      if (!o.alive || !g.isEnemy(me, o) || o.st.hiddenUntil > now) continue; // allies and phased-out players are ignored
      const dx = o.pos[0] - me.pos[0], dz = o.pos[2] - me.pos[2];
      const dist = hyp(dx, dz);
      if (dist > 90 || dist > sight) continue;
      if (dist > 2 && (fwd[0] * dx + fwd[2] * dz) / dist < cosFov) continue;
      const hb = o.hitboxes();
      const head = center(hb[0], this._head ||= [0.5, 0.5, 0.5]), body = center(hb[1], this._body ||= [0.5, 0.5, 0.5]);
      const seesHead = g.canSee(eye, head);
      const seesBody = g.canSee(eye, body);
      if (!seesHead && !seesBody) continue;
      const score = dist - (o === this.target ? 8 : 0);
      if (score < bestScore) { bestScore = score; best = o; bestHead = seesHead; }
    }
    if (!best) return;
    if (best !== this.target || now - this.lastSeen > 1.0) {
      // New sighting: reaction time, fresh aim error, decide where to aim. The flick mostly falls short along the
      // way the crosshair has to travel (sometimes it overshoots), plus a little random error either way.
      this.reactUntil = now + rand(this.d.react[0], this.d.react[1]);
      const dx = best.pos[0] - eye[0], dz = best.pos[2] - eye[2], dy = best.pos[1] + PLAYER.standEye - eye[1];
      const fy = wrap(Math.atan2(-dx, -dz) - me.yaw), fp = Math.atan2(dy, hyp(dx, dz)) - me.pitch;
      const miss = (Math.random() < this.d.over ? 0.6 : -1) * this.d.under * rand(0.5, 1.5);
      const e = this.d.err * DEG * rand(0.4, 1.1), th = Math.random() * Math.PI * 2;
      this.errY = fy * miss + Math.cos(th) * e;
      this.errP = fp * miss + Math.sin(th) * e;
      this.aimHead = Math.random() < this.d.head;
      this.phase = 'shoot';
      this.burstLeft = 0;
      this.lastAim = null;
    }
    this.target = best;
    this.headVisible = bestHead;
    this.lastSeen = now;
    this.lastSeenPos = [...best.pos];
    this.investigate = { pos: [...best.pos], until: now + 6 };
    this.lookAt = [...best.pos];
    this.game.mode?.report?.(me, best, best.pos, 'seen'); // call it out to the team
  }

  engage(now, dt) {
    const me = this.me, t = this.target, inp = me.input, gun = me.gun, def = gun.def, g = this.game;
    const eye = me.eye();
    // Re-check sight every tick (sense() only runs every ~0.1 s): aim at the part that's actually visible,
    // and once the target is fully behind cover or smoke, hold on the last spot seen instead of tracking
    // them through the wall.
    const hb = t.hitboxes();
    const head = center(hb[0], this._head ||= [0.5, 0.5, 0.5]), body = center(hb[1], this._body ||= [0.5, 0.5, 0.5]); // reused every tick
    head[1] -= 0.06; // head aim tends to sit a little low (neck / collar)
    body[1] -= 0.12; // body aim sits around the stomach, so recoil climbs into the chest rather than the head
    const headVis = g.canSee(eye, head), bodyVis = g.canSee(eye, body);
    const visible = headVis || bodyVis;
    const useHead = visible ? (this.aimHead ? headVis : !bodyVis) : this.lastAimHead;
    const aim = visible ? (useHead ? head : body) : this.lastAim || (useHead ? head : body);
    if (visible) { // kept in its own array: head and body are overwritten next tick
      const la = this._aimBuf ||= [0.5, 0.5, 0.5];
      la[0] = aim[0]; la[1] = aim[1]; la[2] = aim[2];
      this.lastAim = la; this.lastAimHead = useHead;
    }
    const dx = aim[0] - eye[0], dy = aim[1] - eye[1], dz = aim[2] - eye[2];
    const dist = hyp(dx, dz, dy);

    // Aim error shrinks while tracking, as a player settles their crosshair, but never fully: a small
    // wandering offset (mean-reverting random walk) stays on top.
    const k = Math.exp(-dt / this.d.tau);
    this.errY *= k;
    this.errP *= k;
    const amp = 3.5 * this.d.floor * DEG * Math.sqrt(dt);
    this.wobY += -this.wobY * 2 * dt + (Math.random() * 2 - 1) * amp;
    this.wobP += -this.wobP * 2 * dt + (Math.random() * 2 - 1) * amp;
    if (me.st.stunUntil > now) { this.wobY += (Math.random() - 0.5) * 0.08; this.wobP += (Math.random() - 0.5) * 0.06; }
    const wantYaw = Math.atan2(-dx, -dz) + this.errY + this.wobY - gun.offY * this.d.comp;
    const wantPitch = Math.atan2(dy, hyp(dx, dz)) + this.errP + this.wobP - gun.offP * this.d.comp;
    this.turnTo(wantYaw, wantPitch, dt, 1);
    this.aimGoal.refYaw = Math.atan2(-dx, -dz); this.aimGoal.refPitch = Math.atan2(dy, hyp(dx, dz)); // to follow their movement

    if (this.mode === 'passive') { this.strafe(now); return; }
    if (def.melee) { // knife only: run at them
      this.moveDir(dx, dz);
      if (dist < 2) inp.fire = true;
      return;
    }
    if (gun.mag === 0 && gun.reserve === 0 && me.inv.secondary && me.slot !== 'secondary' && !me.kit?.busy()) me.equip('secondary', now);
    // Caught mid-reload up close: drawing the sidearm is quicker than finishing the reload. Otherwise, while the
    // gun can't fire, keep moving instead of standing still in the open.
    if (gun.reloading && !def.perRound) {
      if (me.slot === 'primary' && gun.reloadEnd - now > 0.9 && dist < 20 && me.inv.secondary?.mag > 0) { me.equip('secondary', now); return; }
      this.strafe(now);
      return;
    }

    // Error between where the bullets will go and the aim point, against the size of what we're aiming at.
    const aimYaw = me.yaw + gun.offY, aimPitch = me.pitch + gun.offP;
    const tYaw = Math.atan2(-dx, -dz), tPitch = Math.atan2(dy, hyp(dx, dz));
    const off = hyp(wrap(aimYaw - tYaw) * Math.cos(tPitch), aimPitch - tPitch);
    const size = Math.atan((useHead ? 0.11 : 0.2) / Math.max(dist, 0.5));
    const onTarget = off < size * this.d.tol;

    // Still reacting: a player who was holding still stays still; one who was moving keeps going the same way
    // (nobody reverses direction before they've even registered the enemy).
    if (now < this.reactUntil) { if (me.horizSpeed() > 1) this.moveDir(me.vel[0], me.vel[2]); return; }

    if (this.phase === 'strafe') {
      this.strafe(now);
      if (now >= this.phaseUntil) { this.phase = 'shoot'; this.burstLeft = 0; }
      return;
    }

    // Shoot phase: stop moving (releasing keys brakes hard), then fire once slow enough.
    const altType = def.alt && def.alt.type;
    if (altType === 'scope' && dist > 8 && gun.zoomLevel === 0 && !gun.reloading) inp.altPressed = true;
    if (altType === 'zoom' && dist > 20) inp.alt = true;
    if (this.burstLeft === 0) {
      // Let spread recover between bursts, strafing meanwhile rather than standing in the open.
      if (gun.heat > (dist > 20 ? 0.3 : 1.5)) { if (this.waitStrafe) this.strafe(now); return; }
      this.waitStrafe = false;
      // Tap far away, burst at mid range, spray up close; lower ranks hold the trigger longer than they should.
      const sp = this.d.spray;
      this.burstLeft = !def.auto ? 1 : dist > 25 ? Math.max(1, Math.round(rand(0.6, 1.4) * sp * (sp > 1.2 ? 2 : 1))) : dist > 14 ? Math.round(rand(2, 3.4) * sp) : Math.round(rand(4, 9) * sp);
      this.crouchSpray = this.burstLeft >= 5 && Math.random() < 0.25;
      if (this.lastShotSeen >= 0) this.aimHead = Math.random() < this.d.head; // re-pick head or body each burst
      this.ignoreStop = Math.random() > this.d.stop; // weaker bots often shoot on the move: strafing, or walking at them
      this.runGun = Math.random() < 0.65 ? 'strafe' : 'push';
      this.lineStrafe = Math.random() < this.d.adad; // keep strafing while the crosshair is still getting there
      this.lastShotSeen = gun.lastShot;
    }
    const speed = me.horizSpeed(), slowEnough = this.ignoreStop || speed <= def.move * def.spread.deadzone;
    // Counter-strafe: tap the opposite direction to stop faster than just letting go, and let go before it
    // turns into movement the other way.
    if (!this.ignoreStop && this.lineStrafe && off > size * this.d.tol * 1.8) this.strafe(now); // stop only once lined up
    else if (!this.ignoreStop && speed > 0.6 && me.grounded) this.moveDir(-me.vel[0], -me.vel[2]);
    else if (this.ignoreStop) { if (this.runGun === 'push' && dist > 4) this.moveDir(dx, dz); else this.strafe(now); }

    if (gun.lastShot !== this.lastShotSeen) {
      this.lastShotSeen = gun.lastShot;
      this.burstLeft--;
      if (this.burstLeft <= 0) {
        this.burstLeft = 0;
        // ADAD: strafe a short way before the next burst, usually back the other way (so the enemy can't just
        // hold where they went), sometimes on in the same direction. Higher ranks do it more and keep it tight.
        if (Math.random() < this.d.adad) {
          this.phase = 'strafe';
          this.phaseUntil = now + rand(this.d.strafeT[0], this.d.strafeT[1]);
          if (Math.random() < 0.7) this.strafeDir *= -1;
        }
        this.waitStrafe = Math.random() < this.d.adad;
        return;
      }
    }
    if (me.st.disarmUntil > now) return; // locked down: can't fire
    if (!visible || !this.clearShot(eye, aimYaw, aimPitch, dist)) return; // never shoot blind into a wall
    if (me.st.stunUntil > now && Math.random() < 0.6) return; // stunned: fumbling shots
    if (slowEnough && onTarget) {
      if (def.auto) inp.fire = true;
      else if (now >= gun.nextFire) inp.firePressed = true;
    }
  }

  // The nearest enemy gadget this bot can see and shoot: in view, in line of sight, within 30 m (hidden ones only
  // from close up, as a player would spot them).
  findUtil() {
    const me = this.me, g = this.game, eye = me.eye(), f = dirFromAngles(me.yaw, 0), cosFov = Math.cos(this.d.fov * DEG);
    let best = null, bd = 30;
    for (const d of g.devices) {
      const sh = SHOOTABLE[d.kind];
      if (!sh || sh.y === undefined || d.removed || !(d.hp > 0) || !d.pos || !g.isEnemy(me, d.owner)) continue;
      const p = [d.pos[0], d.pos[1] + sh.y, d.pos[2]], dx = p[0] - eye[0], dz = p[2] - eye[2], dist = hyp(dx, dz, p[1] - eye[1]);
      if (dist > Math.min(bd, HIDDEN[d.kind] ?? 30) || (f[0] * dx + f[2] * dz) / Math.max(hyp(dx, dz), 0.01) < cosFov) continue;
      if (!g.world.lineOfSight(eye, p)) continue;
      bd = dist; best = d;
    }
    return best;
  }

  // Aim at a gadget and fire once the crosshair is on it and the body has stopped. False if the gun can't fire.
  shootUtil(u, now, dt) {
    const me = this.me, gun = me.gun, def = gun.def, inp = me.input;
    if (def.melee || gun.reloading || gun.mag === 0) return false;
    const sh = SHOOTABLE[u.kind], p = [u.pos[0], u.pos[1] + sh.y, u.pos[2]], e = me.eye();
    const dx = p[0] - e[0], dy = p[1] - e[1], dz = p[2] - e[2], dist = hyp(dx, dz, dy);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, hyp(dx, dz));
    this.turnTo(yaw - gun.offY * this.d.comp, pitch - gun.offP * this.d.comp, dt, 0.8);
    const off = hyp(wrap(me.yaw + gun.offY - yaw), me.pitch + gun.offP - pitch), size = Math.atan((sh.r || 0.25) / Math.max(dist, 0.5));
    if (me.horizSpeed() > 0.6 && me.grounded) this.moveDir(-me.vel[0], -me.vel[2]); // stop to shoot
    if (off < size * 1.5 && me.horizSpeed() <= def.move * def.spread.deadzone && this.clearShot(e, me.yaw + gun.offY, me.pitch + gun.offP, dist)) {
      if (def.auto) inp.fire = true; else if (now >= gun.nextFire) inp.firePressed = true;
    }
    return true;
  }

  // Would a bullet fired along (yaw, pitch) reach range dist without crossing a wall (or an ability wall)?
  clearShot(eye, yaw, pitch, dist) {
    const d = dirFromAngles(yaw, pitch);
    return this.game.world.lineOfSight(eye, [eye[0] + d[0] * dist, eye[1] + d[1] * dist, eye[2] + d[2] * dist]);
  }

  pursueGoal(now, dt) {
    const me = this.me, gl = this.goal, inp = me.input;
    // Head for a spot a body fits in (a planned spot can touch a crate); the spike itself for a defuse.
    const t = gl.action === 'defuse' ? gl.pos : (gl.fit && gl.fitFor === gl.pos ? gl.fit : (gl.fitFor = gl.pos, gl.fit = fitNear(this.game, gl.pos)));
    const d = hyp(me.pos[0] - t[0], me.pos[2] - t[2]);
    // A plant only needs the site: a few steps short of the spot is close enough when a crate is in the way.
    const there = d <= (gl.action === 'defuse' ? 1.0 : 1.3) || (gl.action === 'plant' && d < 3 && this.game.mode?.inSite(me.pos));
    if (!there) {
      this.moveTo(t, now, dt);
      if (!this.path) this.steer(t[0] - me.pos[0], t[2] - me.pos[2], now); // no path (off-grid or the last stretch): walk straight, around corners
      // Walk the last stretch rather than run, like a careful player clearing an angle; a quiet move (a lurk,
      // a default, an info push) is walked from further out so footsteps don't give it away.
      if (gl.hold && d < (gl.quiet ? 14 : 4)) inp.walk = true;
      return;
    }
    this.path = null;
    // Check the angle a teammate just called out; otherwise the spot's own angle.
    const look = this.lookAt && now < this.alertUntil && gl.hold ? this.lookAt : gl.look;
    if (look) this.turnToward(look, PLAYER.standEye * 0.85, dt, 0.35);
    // Plant or defuse once nobody has been seen for a moment.
    if (gl.action && (gl.commit || now - this.lastSeen > 1.2)) { inp.use = true; return; }
    // Holding an angle: mostly still with the crosshair on it (moving ruins the first shot), with a small
    // shuffle, a crouch or a glance now and then. An info push (pushing out for a look) jiggle-peeks instead.
    if (gl.hold) {
      const ha = this.holdAct;
      if (!ha || now >= ha.until) {
        const r = Math.random(), peek = gl.kind === 'push';
        this.holdAct = r < (peek ? 0.6 : 0.14) ? { until: now + rand(0.2, peek ? 0.6 : 0.35), side: Math.random() < 0.5 ? -1 : 1 }
          : r < (peek ? 0.7 : 0.22) ? { until: now + rand(0.6, 1.5), crouch: true }
          : r < (peek ? 0.85 : 0.32) ? { until: now + rand(0.3, 0.7), glance: rand(-0.9, 0.9) }
          : { until: now + rand(0.8, 2.2) };
      }
      const a = this.holdAct;
      if (a.side) inp.side = a.side;
      if (a.crouch) inp.crouch = true;
      if (a.glance) this.turnTo(me.yaw + a.glance * 0.35, me.pitch, dt, 0.4);
      // Drifting too far from the spot while peeking: step back toward it.
      if (d > 2.5) this.moveDir(t[0] - me.pos[0], t[2] - me.pos[2]);
    }
  }

  // Strafe left / right relative to where the bot faces, turning back before a wall stops it dead.
  strafe(now) {
    const me = this.me;
    if (now >= this.phaseUntil && this.phase !== 'strafe') {
      this.phaseUntil = now + rand(this.d.strafeT[0], this.d.strafeT[1] + 0.15);
      if (Math.random() < 0.75) this.strafeDir *= -1;
    }
    const rx = Math.cos(me.yaw) * this.strafeDir, rz = -Math.sin(me.yaw) * this.strafeDir;
    if (blockedAhead(this.game, me, rx, rz)) this.strafeDir *= -1;
    me.input.side = this.strafeDir;
  }

  patrol(now, dt) {
    const me = this.me, map = this.game.map;
    if (!this.path || this.pathIdx >= this.path.length) {
      const here = map.nearestWalkable(...map.cellOf(me.pos[0], me.pos[2]));
      for (let tries = 0; tries < 10 && !this.path; tries++) {
        const goal = map.walkable[Math.floor(Math.random() * map.walkable.length)];
        if (hyp(goal[0] - here[0], goal[1] - here[1]) < 6) continue;
        this.path = map.findPath(here, goal);
        this.pathIdx = 1;
      }
      if (!this.path) return;
    }
    this.followPath(now, dt);
  }

  moveTo(pos, now, dt) {
    const map = this.game.map;
    const goal = map.cellOf(pos[0], pos[2]);
    if (!this.path || !this.pathGoal || this.pathGoal[0] !== goal[0] || this.pathGoal[1] !== goal[1]) {
      this.path = map.findPath(map.nearestWalkable(...map.cellOf(this.me.pos[0], this.me.pos[2])), map.nearestWalkable(...goal));
      this.pathIdx = 1;
      this.pathGoal = goal;
      if (!this.path) { this.investigate = null; return; }
    }
    this.followPath(now, dt);
  }

  followPath(now, dt) {
    const me = this.me;
    if (this.pathIdx >= this.path.length) { this.path = null; return; }
    // Aim for a spot in the next cell that a body actually fits in: a cell centre can sit right against a wall.
    // Where the way ahead is straight and open, head for a cell further along instead, so the bot walks a
    // smooth line rather than zig-zagging from grid cell to grid cell.
    let c = clearSpot(this.game, this.path[this.pathIdx]);
    if (hyp(c[0] - me.pos[0], c[2] - me.pos[2]) < 0.8) { this.pathIdx++; return; }
    const far = this.shortcut(now);
    if (far > this.pathIdx) c = clearSpot(this.game, this.path[far]);
    const dx = c[0] - me.pos[0], dz = c[2] - me.pos[2];
    if (far > this.pathIdx && hyp(dx, dz) < 1.6) this.pathIdx = far; // close enough: aim on from there
    // Crosshair placement: aim at head height where an enemy would show up along the way (the next corner,
    // or down the lane), not at the floor ahead; never more than ~100° off the way we're walking. How often, and
    // how well, depends on rank: lower ranks often walk looking at the floor or aim at chest height.
    if (now >= this.placeUntil) { this.placing = Math.random() < this.d.place; this.placeUntil = now + rand(0.8, 2); }
    const low = (1 - this.d.place) * (this.placing ? 6 : 16) * DEG;
    const moveYaw = Math.atan2(-dx, -dz), L = this.placing ? this.angleLook(now, moveYaw) || this.pathLook(now) : null;
    if (L) {
      const e = me.eye(), ly = Math.atan2(-(L[0] - e[0]), -(L[2] - e[2]));
      if (Math.abs(wrap(ly - moveYaw)) < 1.75) this.turnTo(ly, Math.atan2(L[1] - e[1], hyp(L[0] - e[0], L[2] - e[2])) - low, dt, 0.35);
      else this.turnTo(moveYaw, -low, dt, 0.35);
    } else this.turnTo(moveYaw, -low, dt, 0.35);
    this.steer(dx, dz, now);
  }

  // The furthest cell along the path (up to 5 ahead) the bot can walk to in a straight line: nothing in the way
  // at body height and no drop or climb on the way. Rechecked a few times a second.
  shortcut(now) {
    if (this.cut && this.cut.path === this.path && this.cut.idx === this.pathIdx && now < this.cutAt) return this.cut.far;
    const g = this.game, map = g.map, me = this.me, p = this.path, r = PLAYER.radius + 0.08;
    let far = this.pathIdx;
    for (let j = Math.min(p.length - 1, this.pathIdx + 5); j > this.pathIdx; j--) {
      const c = clearSpot(g, p[j]), dx = c[0] - me.pos[0], dz = c[2] - me.pos[2], L = hyp(dx, dz), n = Math.ceil(L / 0.5);
      let ok = true, h = me.pos[1];
      for (let i = 1; i <= n && ok; i++) {
        const x = me.pos[0] + dx * i / n, z = me.pos[2] + dz * i / n, [cx, cz] = map.cellOf(x, z), hh = map.heights[cz]?.[cx];
        if (hh == null || Math.abs(hh - h) > 0.45) ok = false;
        else if (g.world.overlap(x - r, hh + PLAYER.stepHeight + 0.05, z - r, x + r, hh + 1.6, z + r)) ok = false;
        h = hh ?? h;
      }
      if (ok) { far = j; break; }
    }
    this.cut = { path: p, idx: this.pathIdx, far }; this.cutAt = now + 0.25;
    return far;
  }

  // Going onto a site: check the spots defenders usually hold there, one at a time, the one nearest the way
  // we're walking first. A spot counts as checked once the crosshair has sat on it for a moment.
  angleLook(now, moveYaw) {
    const gl = this.goal, g = this.game, map = g.map;
    if (!gl || (gl.kind !== 'entry' && gl.kind !== 'plant') || !map.holds) return null;
    if (this.clearFor !== gl) {
      this.clearFor = gl; this.clearT = new Map();
      const site = gl.site || g.mode?.zoneOf?.(gl.pos);
      // Common angles, not the exact spots: a player knows roughly where defenders like to stand, and whether
      // they'll be standing or crouched, not where they are.
      this.angles = (map.holds[site] || []).map(h => [h.pos[0] + rand(-1.5, 1.5), h.pos[1] + (Math.random() < 0.3 ? PLAYER.standEye * 0.7 : PLAYER.standEye), h.pos[2] + rand(-1.5, 1.5)]);
      this.angle = null;
    }
    const eye = this.me.eye(), a = this.angle;
    if (a && now < this.angleCheckAt) {
      this.clearT.set(a, (this.clearT.get(a) || 0) + 1 / 128);
      if (this.clearT.get(a) > 0.6) this.angleCheckAt = 0;
      return a;
    }
    this.angleCheckAt = now + 0.15;
    let best = null, bd = 1.75;
    for (const p of this.angles) {
      if ((this.clearT.get(p) || 0) > 0.6 || hyp(p[0] - eye[0], p[2] - eye[2]) > 35) continue;
      const d = Math.abs(wrap(Math.atan2(-(p[0] - eye[0]), -(p[2] - eye[2])) - moveYaw));
      if (d < bd && g.world.lineOfSight(eye, p)) { bd = d; best = p; }
    }
    return (this.angle = best);
  }

  // The point on the path ahead to pre-aim: the first stretch hidden from view (just past a corner's edge),
  // or the furthest point still in sight. Head height of someone standing there. Rechecked a few times a second.
  pathLook(now) {
    if (now < this.lookCheckAt && this.pathLookFor === this.path) return this.pathLookPt;
    this.lookCheckAt = now + 0.15; this.pathLookFor = this.path;
    const g = this.game, map = g.map, eye = this.me.eye(), p = this.path;
    let seen = null, hidden = null;
    for (let i = this.pathIdx, n = 0; i < p.length && n < 14; i++, n++) {
      const [cx, cz] = p[i], c = map.cellCenter(cx, cz), q = [c.x, (map.heights[cz][cx] ?? 0) + PLAYER.standEye, c.z];
      if (hyp(q[0] - eye[0], q[2] - eye[2]) < 3) continue;
      if (g.world.lineOfSight(eye, q)) seen = q; else { hidden = q; break; }
    }
    return (this.pathLookPt = hidden || seen);
  }

  // Walk toward (dx, dz), sliding around whatever corner is in the way. If the body still hasn't moved for
  // a while, back off sideways for a moment and plan again.
  steer(dx, dz, now) {
    const me = this.me;
    if (now < this.unstickUntil) { this.moveDir(...this.unstickDir); me.input.jump = this.unstickJump; return; }
    const l = hyp(dx, dz) || 1, ux = dx / l, uz = dz / l;
    if (blockedAhead(this.game, me, ux, uz)) {
      // Turn along the wall: try angles either side of the way we want to go, closest first.
      for (const a of [0.5, -0.5, 1.0, -1.0, 1.4, -1.4]) {
        const cs = Math.cos(a), sn = Math.sin(a), rx = ux * cs - uz * sn, rz = ux * sn + uz * cs;
        if (!blockedAhead(this.game, me, rx, rz)) { dx = rx; dz = rz; break; }
      }
    }
    this.moveDir(dx, dz);
    if (now >= this.stuckCheck.t) {
      const moved = hyp(me.pos[0] - this.stuckCheck.pos[0], me.pos[2] - this.stuckCheck.pos[2]);
      if (moved < 0.5) {
        const side = Math.random() < 0.5 ? 1 : -1;
        this.unstickDir = [-uz * side - ux * 0.5, ux * side - uz * 0.5];
        this.unstickJump = Math.random() < 0.5;
        this.unstickUntil = now + 0.5;
        this.path = null; this.investigate = null;
      }
      this.stuckCheck = { t: now + 1.5, pos: [...me.pos] };
    }
  }

  // Convert a world-space direction to forward/side input relative to where the bot faces.
  moveDir(dx, dz) {
    const me = this.me, l = hyp(dx, dz) || 1;
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    me.input.fwd = (dx * fx + dz * fz) / l;
    me.input.side = (dx * rx + dz * rz) / l;
  }

  turnToward(p, eyeH, dt, speed) {
    const e = this.me.eye();
    const dx = p[0] - e[0], dy = p[1] + eyeH - e[1], dz = p[2] - e[2];
    this.turnTo(Math.atan2(-dx, -dz), Math.atan2(dy, hyp(dx, dz)), dt, speed);
  }

  // Where the crosshair should head this tick (the last call wins); moveAim does the moving, once per tick.
  turnTo(yaw, pitch, dt, speed) {
    const g = this.aimGoal = this._goal ||= { yaw: 0, pitch: 0, speed: 1 };
    g.yaw = yaw; g.pitch = pitch; g.speed = speed; g.refYaw = undefined;
  }

  // Move the crosshair like a hand on a mouse: a critically damped spring on the angle, so it speeds up, then
  // slows into the target without snapping, with a top speed. `speed` < 1 (walking around, glancing) is a calmer
  // motion. With nowhere to go this tick, the aim just brakes.
  moveAim(dt) {
    const me = this.me, g = this.aimGoal;
    // How fast the enemy is moving across the screen, as a player perceives it (smoothed, a little behind).
    let vy = 0, vp = 0;
    if (g && g.refYaw !== undefined) {
      if (this.refAt === this.target && this.refY !== undefined) {
        const dy = wrap(g.refYaw - this.refY) / dt, dp = (g.refPitch - this.refP) / dt, k = 1 - Math.exp(-dt / 0.12);
        if (Math.abs(dy) < 4 && Math.abs(dp) < 4) { this.refVY += (dy - this.refVY) * k; this.refVP += (dp - this.refVP) * k; }
      } else { this.refVY = 0; this.refVP = 0; this.refAt = this.target; }
      this.refY = g.refYaw; this.refP = g.refPitch;
      vy = this.refVY * this.d.track; vp = this.refVP * this.d.track;
    } else this.refAt = null;
    if (!g) { const k = Math.exp(-dt * 25); this.wY *= k; this.wP *= k; }
    else {
      const wn = this.d.wn * (0.45 + 0.55 * Math.min(1.4, g.speed)), vmax = this.d.vmax * DEG * Math.min(1.4, 0.3 + 0.7 * g.speed);
      const eY = wrap(g.yaw - me.yaw), eP = g.pitch - me.pitch;
      this.wY += (wn * wn * eY - 2 * wn * (this.wY - vy)) * dt;
      this.wP += (wn * wn * eP - 2 * wn * (this.wP - vp)) * dt;
      const v = hyp(this.wY, this.wP);
      if (v > vmax) { this.wY *= vmax / v; this.wP *= vmax / v; }
    }
    me.yaw = wrap(me.yaw + this.wY * dt);
    me.pitch = Math.max(-1.4, Math.min(1.4, me.pitch + this.wP * dt));
  }
}

function center(hb, out) {
  out[0] = (hb.min[0] + hb.max[0]) / 2; out[1] = (hb.min[1] + hb.max[1]) / 2; out[2] = (hb.min[2] + hb.max[2]) / 2;
  return out;
}

