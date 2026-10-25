// Bot brain. Bots press the same inputs a player would, so their guns follow the same spread,
// recoil and movement-accuracy rules: they stop (or counter-strafe) to shoot, burst at range and spray up close.
import { dirFromAngles } from './entity.js';
import { PLAYER } from './config.js';
import { botAbilities } from './botkit.js';

export const BOT_NAMES = ['Kestrel', 'Rook', 'Ember', 'Quill', 'Talon', 'Vesper', 'Drift', 'Nova', 'Hex', 'Moth'];

const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// react: seconds before the first shot at a new target. err: initial aim error (deg) that settles with time
// constant tau down to a wobble of about `floor` degrees. tol: how far off (in target widths) they'll still fire.
// comp: share of recoil they pull down. head: chance to aim for the head. stop: chance to stop before shooting.
export const DIFFICULTY = {
  easy: { react: [0.5, 0.72], err: 6.5, tau: 0.6, floor: 1.6, tol: 3.4, turn: 240, comp: 0.15, head: 0.05, stop: 0.35, fov: 55 },
  normal: { react: [0.34, 0.48], err: 4.8, tau: 0.45, floor: 1.25, tol: 2.8, turn: 420, comp: 0.35, head: 0.14, stop: 0.75, fov: 65 },
  hard: { react: [0.25, 0.34], err: 3.2, tau: 0.32, floor: 0.75, tol: 2.1, turn: 640, comp: 0.6, head: 0.32, stop: 0.95, fov: 75 },
  pro: { react: [0.19, 0.26], err: 2.2, tau: 0.24, floor: 0.4, tol: 1.6, turn: 900, comp: 0.78, head: 0.5, stop: 1, fov: 80 },
};

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
    this.d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
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
    this.aggr = 0.35 + Math.random() * 0.5; // how readily this bot pushes a contact instead of holding
  }

  hear(source, now) {
    if (this.mode === 'static' || now - this.lastSeen < 1 || this.me.st.deafUntil > now) return; // deafened: hears nothing
    this.alert(source.pos, now);
  }

  onDamaged(attacker, now) {
    if (this.mode === 'static' || now - this.lastSeen < 0.5) return;
    this.alert(attacker.pos, now);
  }

  alert(pos, now) {
    this.alertUntil = now + 2;
    this.lookAt = [...pos];
    this.investigate = { pos: [...pos], until: now + 5 };
    this.path = null;
  }

  think(now, dt) {
    const me = this.me, inp = me.input;
    inp.fwd = 0; inp.side = 0; inp.walk = false; inp.fire = false; inp.alt = false; inp.use = false;
    inp.crouch = this.crouchSpray;
    const mode = this.game.mode;
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
    if (this.goal?.commit && Math.hypot(me.pos[0] - this.goal.pos[0], me.pos[2] - this.goal.pos[2]) < 1.2) { inp.use = true; return; }
    if (t && t.alive && now - this.lastSeen < 0.2) {
      this.engage(now, dt);
      return;
    }
    if (t && !t.alive) this.target = null;
    this.crouchSpray = false;
    this.burstLeft = 0;

    if (me.gun.def.mag && me.gun.mag < me.gun.def.mag * 0.5 && !me.gun.reloading) inp.reload = true;

    // Round mode: the team plan gives each bot a goal (hold a spot, stage, entry, plant, defuse, pick up).
    // Active play: after a contact (or right after throwing a flash) push the spot instead of waiting on
    // the assigned position — attackers almost always, defenders depending on temperament.
    const gl = this.goal, side = mode?.side(me), lsp = this.lastSeenPos, ago = now - this.lastSeen;
    // A free ultimate orb a few steps away and nobody around: go take it.
    const orb = mode?.orbs && ago > 4 && !gl?.commit && me.kit && me.kit.ultPoints < me.kit.ultCost && mode.orbs.find(o => !o.taken && Math.hypot(me.pos[0] - o.pos[0], me.pos[2] - o.pos[2]) < 10 && Math.abs(me.pos[1] - o.pos[1]) < 1.5);
    if (orb) {
      if (mode.orbNear(me) === orb) { inp.use = true; return; }
      this.moveTo(orb.pos, now, dt);
      if (!this.path) this.steer(orb.pos[0] - me.pos[0], orb.pos[2] - me.pos[2], now);
      return;
    }
    if (gl && lsp && !gl.action && !gl.commit && Math.hypot(me.pos[0] - lsp[0], me.pos[2] - lsp[2]) > 2 &&
        (now < this.pushUntil || (ago > 0.4 && ago < 3.5 && this.aggr > (side === 'atk' ? 0.3 : 0.6)))) {
      this.moveTo(lsp, now, dt);
      if (!this.path) this.steer(lsp[0] - me.pos[0], lsp[2] - me.pos[2], now);
      this.turnToward(lsp, PLAYER.standEye, dt, 0.6);
      return;
    }
    if (this.goal) { this.pursueGoal(now, dt); return; }

    const inv = this.investigate;
    if (inv && now < inv.until && Math.hypot(me.pos[0] - inv.pos[0], me.pos[2] - inv.pos[2]) > 1.5) {
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
      const dist = Math.hypot(dx, dz);
      if (dist > 90 || dist > sight) continue;
      if (dist > 2 && (fwd[0] * dx + fwd[2] * dz) / dist < cosFov) continue;
      const hb = o.hitboxes();
      const head = center(hb[0]), body = center(hb[1]);
      const seesHead = g.canSee(eye, head);
      const seesBody = g.canSee(eye, body);
      if (!seesHead && !seesBody) continue;
      const score = dist - (o === this.target ? 8 : 0);
      if (score < bestScore) { bestScore = score; best = o; bestHead = seesHead; }
    }
    if (!best) return;
    if (best !== this.target || now - this.lastSeen > 1.0) {
      // New sighting: reaction time, fresh aim error, decide where to aim.
      this.reactUntil = now + rand(this.d.react[0], this.d.react[1]);
      const e = this.d.err * DEG * rand(0.6, 1.2), th = Math.random() * Math.PI * 2;
      this.errY = Math.cos(th) * e;
      this.errP = Math.sin(th) * e;
      this.aimHead = Math.random() < this.d.head;
      this.phase = 'shoot';
      this.burstLeft = 0;
    }
    this.target = best;
    this.headVisible = bestHead;
    this.lastSeen = now;
    this.lastSeenPos = [...best.pos];
    this.investigate = { pos: [...best.pos], until: now + 6 };
    this.lookAt = [...best.pos];
  }

  engage(now, dt) {
    const me = this.me, t = this.target, inp = me.input, gun = me.gun, def = gun.def;
    const hb = t.hitboxes();
    const useHead = this.aimHead && this.headVisible !== false;
    const aim = useHead ? center(hb[0]) : center(hb[1]);
    if (useHead) aim[1] -= 0.06; // head aim tends to sit a little low (neck / collar)
    else aim[1] -= 0.12; // body aim sits around the stomach, so recoil climbs into the chest rather than the head
    const eye = me.eye();
    const dx = aim[0] - eye[0], dy = aim[1] - eye[1], dz = aim[2] - eye[2];
    const dist = Math.hypot(dx, dz, dy);

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
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.errP + this.wobP - gun.offP * this.d.comp;
    this.turnTo(wantYaw, wantPitch, dt, 1);

    if (this.mode === 'passive') { this.strafe(now); return; }
    if (def.melee) { // knife only: run at them
      this.moveDir(dx, dz);
      if (dist < 2) inp.fire = true;
      return;
    }
    if (gun.mag === 0 && gun.reserve === 0 && me.inv.secondary && me.slot !== 'secondary') me.equip('secondary', now);

    // Error between where the bullets will go and the aim point, against the size of what we're aiming at.
    const aimYaw = me.yaw + gun.offY, aimPitch = me.pitch + gun.offP;
    const tYaw = Math.atan2(-dx, -dz), tPitch = Math.atan2(dy, Math.hypot(dx, dz));
    const off = Math.hypot(wrap(aimYaw - tYaw) * Math.cos(tPitch), aimPitch - tPitch);
    const size = Math.atan((useHead ? 0.11 : 0.2) / Math.max(dist, 0.5));
    const onTarget = off < size * this.d.tol;

    if (now < this.reactUntil) { this.strafe(now); return; }

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
      if (gun.heat > (dist > 20 ? 0.3 : 1.5)) return; // let spread recover between bursts
      this.burstLeft = !def.auto ? 1 : dist > 25 ? 1 : dist > 14 ? 2 + (Math.random() < 0.5 ? 1 : 0) : Math.round(rand(4, 9));
      this.crouchSpray = this.burstLeft >= 5 && Math.random() < 0.25;
      this.ignoreStop = Math.random() > this.d.stop; // weaker bots sometimes shoot on the move
      this.lastShotSeen = gun.lastShot;
    }
    const slowEnough = this.ignoreStop || me.horizSpeed() <= def.move * def.spread.deadzone;

    if (gun.lastShot !== this.lastShotSeen) {
      this.lastShotSeen = gun.lastShot;
      this.burstLeft--;
      if (this.burstLeft <= 0) {
        this.burstLeft = 0;
        // Re-peek: strafe a bit before the next burst.
        if (Math.random() < 0.6) {
          this.phase = 'strafe';
          this.phaseUntil = now + rand(0.18, 0.45);
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        return;
      }
    }
    if (me.st.disarmUntil > now) return; // locked down: can't fire
    if (me.st.stunUntil > now && Math.random() < 0.6) return; // stunned: fumbling shots
    if (slowEnough && onTarget) {
      if (def.auto) inp.fire = true;
      else if (now >= gun.nextFire) inp.firePressed = true;
    }
  }

  pursueGoal(now, dt) {
    const me = this.me, gl = this.goal, inp = me.input;
    // Head for a spot a body fits in (a planned spot can touch a crate); the spike itself for a defuse.
    const t = gl.action === 'defuse' ? gl.pos : (gl.fit && gl.fitFor === gl.pos ? gl.fit : (gl.fitFor = gl.pos, gl.fit = fitNear(this.game, gl.pos)));
    const d = Math.hypot(me.pos[0] - t[0], me.pos[2] - t[2]);
    // A plant only needs the site: a few steps short of the spot is close enough when a crate is in the way.
    const there = d <= (gl.action === 'defuse' ? 1.0 : 1.3) || (gl.action === 'plant' && d < 3 && this.game.mode?.inSite(me.pos));
    if (!there) {
      this.moveTo(t, now, dt);
      if (!this.path) this.steer(t[0] - me.pos[0], t[2] - me.pos[2], now); // no path (off-grid or the last stretch): walk straight, around corners
      // Walk the last stretch rather than run, like a careful player clearing an angle.
      if (gl.hold && d < 4) inp.walk = true;
      return;
    }
    this.path = null;
    if (gl.look) this.turnToward(gl.look, PLAYER.standEye * 0.85, dt, 0.35);
    // Plant or defuse once nobody has been seen for a moment.
    if (gl.action && (gl.commit || now - this.lastSeen > 1.2)) { inp.use = true; return; }
    // Holding an angle isn't standing still: jiggle-peek side to side, crouch now and then, glance around.
    if (gl.hold) {
      const ha = this.holdAct;
      if (!ha || now >= ha.until) {
        const r = Math.random();
        this.holdAct = r < 0.6 ? { until: now + rand(0.25, 0.6), side: Math.random() < 0.5 ? -1 : 1 }
          : r < 0.7 ? { until: now + rand(0.4, 0.8), crouch: true }
          : r < 0.85 ? { until: now + rand(0.3, 0.7), glance: rand(-0.9, 0.9), side: Math.random() < 0.5 ? -1 : 1 }
          : { until: now + rand(0.3, 0.8) };
      }
      const a = this.holdAct;
      if (a.side) inp.side = a.side;
      if (a.crouch) inp.crouch = true;
      if (a.glance) this.turnTo(me.yaw + a.glance * dt * 3, me.pitch, dt, 0.4);
      // Drifting too far from the spot while peeking: step back toward it.
      if (d > 2.5) this.moveDir(t[0] - me.pos[0], t[2] - me.pos[2]);
    }
  }

  strafe(now) {
    if (now >= this.phaseUntil && this.phase !== 'strafe') {
      this.phaseUntil = now + rand(0.25, 0.6);
      this.strafeDir *= -1;
    }
    this.me.input.side = this.strafeDir;
  }

  patrol(now, dt) {
    const me = this.me, map = this.game.map;
    if (!this.path || this.pathIdx >= this.path.length) {
      const here = map.nearestWalkable(...map.cellOf(me.pos[0], me.pos[2]));
      for (let tries = 0; tries < 10 && !this.path; tries++) {
        const goal = map.walkable[Math.floor(Math.random() * map.walkable.length)];
        if (Math.hypot(goal[0] - here[0], goal[1] - here[1]) < 6) continue;
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
    const c = clearSpot(this.game, this.path[this.pathIdx]);
    const dx = c[0] - me.pos[0], dz = c[2] - me.pos[2];
    if (Math.hypot(dx, dz) < 0.8) { this.pathIdx++; return; }
    // Look where we're going, keeping the crosshair at head height.
    this.turnTo(Math.atan2(-dx, -dz), 0, dt, 0.35);
    this.steer(dx, dz, now);
  }

  // Walk toward (dx, dz), sliding around whatever corner is in the way. If the body still hasn't moved for
  // a while, back off sideways for a moment and plan again.
  steer(dx, dz, now) {
    const me = this.me;
    if (now < this.unstickUntil) { this.moveDir(...this.unstickDir); me.input.jump = this.unstickJump; return; }
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    if (blockedAhead(this.game, me, ux, uz)) {
      // Turn along the wall: try angles either side of the way we want to go, closest first.
      for (const a of [0.5, -0.5, 1.0, -1.0, 1.4, -1.4]) {
        const cs = Math.cos(a), sn = Math.sin(a), rx = ux * cs - uz * sn, rz = ux * sn + uz * cs;
        if (!blockedAhead(this.game, me, rx, rz)) { dx = rx; dz = rz; break; }
      }
    }
    this.moveDir(dx, dz);
    if (now >= this.stuckCheck.t) {
      const moved = Math.hypot(me.pos[0] - this.stuckCheck.pos[0], me.pos[2] - this.stuckCheck.pos[2]);
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
    const me = this.me, l = Math.hypot(dx, dz) || 1;
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    me.input.fwd = (dx * fx + dz * fz) / l;
    me.input.side = (dx * rx + dz * rz) / l;
  }

  turnToward(p, eyeH, dt, speed) {
    const e = this.me.eye();
    const dx = p[0] - e[0], dy = p[1] + eyeH - e[1], dz = p[2] - e[2];
    this.turnTo(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)), dt, speed);
  }

  // Ease toward the wanted angles with a capped turn rate, like a flick that settles.
  turnTo(yaw, pitch, dt, speed) {
    const me = this.me;
    const maxStep = this.d.turn * DEG * dt * speed;
    const f = 1 - Math.exp(-dt * 18 * speed);
    let dy = wrap(yaw - me.yaw) * f, dp = (pitch - me.pitch) * f;
    const m = Math.hypot(dy, dp);
    if (m > maxStep) { dy *= maxStep / m; dp *= maxStep / m; }
    me.yaw = wrap(me.yaw + dy);
    me.pitch = Math.max(-1.4, Math.min(1.4, me.pitch + dp));
  }
}

function center(hb) {
  return [(hb.min[0] + hb.max[0]) / 2, (hb.min[1] + hb.max[1]) / 2, (hb.min[2] + hb.max[2]) / 2];
}

