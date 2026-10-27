// A player or bot: movement, collision, hitboxes, health and inventory.
import { PLAYER, TAG, HITBOX } from './config.js';
import { rayAABB } from './world.js';
import { WEAPONS } from './weapons.js';
import { Gun } from './gun.js';
import { MELEE_ORDER } from './melee.js';
import { applyDash, applyGlide } from './abilities.js';

const lerp = (a, b, t) => a + (b - a) * t;
const CROUCH_DIFF = PLAYER.standHeight - PLAYER.crouchHeight;

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export class Combatant {
  constructor(game, { name, isBot = false, color = 0xffffff }) {
    this.game = game;
    this.name = name;
    this.isBot = isBot;
    // Cosmetic model for the knife slot (melee.js). Bots carry a random one; players send theirs.
    this.meleeType = isBot ? MELEE_ORDER[Math.floor(Math.random() * MELEE_ORDER.length)] : 'knife';
    this.color = color;
    this.pos = [0, 0, 0];
    this.prevPos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.crouched = false;
    this.height = PLAYER.standHeight;
    this.grounded = true;
    this.eyeOff = PLAYER.standEye;
    this.stepSmooth = 0;
    this.prevEyeY = 0;
    this.airCap = 0;
    this.jumpBuffer = 0;
    this.stepDist = 0;
    this.tagTime = -100;
    this.tagSlow = 0;
    this.alive = false;
    this.respawnAt = 0;
    this.hp = PLAYER.hp;
    this.armor = PLAYER.armor;
    this.adsHold = true;
    this.input = { fwd: 0, side: 0, walk: false, crouch: false, jump: false, fire: false, alt: false, firePressed: false, altPressed: false, reload: false, use: false, jumpHeld: false, abQ: false, abE: false, abC: false, abX: false };
    this.kit = null; // agent abilities (player only)
    this.st = { slowUntil: 0, slowAmt: 0, blindUntil: 0, blindLen: 1, stunUntil: 0, nearUntil: 0, revealUntil: 0, disarmUntil: 0, suppressUntil: 0, deafUntil: 0, vulnUntil: 0, stimUntil: 0, intangibleUntil: 0, hiddenUntil: 0, downedUntil: 0, channelUntil: 0, hasteUntil: 0, hasteAmt: 0.15, hinderUntil: 0, castLockUntil: 0, invulnUntil: 0 };
    this.dash = null;
    this.inv = { primary: null, secondary: null, melee: new Gun(WEAPONS.knife) };
    this.slot = 'melee';
    this.prevSlot = 'secondary';
    this.loadout = { primary: 'vandal', secondary: 'classic' };
    this.stats = { kills: 0, deaths: 0, shots: 0, hits: 0, head: 0, body: 0, legs: 0, damage: 0 };
    this.report = new Map(); // opponent -> { dealt, dealtHits, taken, takenHits }, cleared on respawn
  }

  get gun() { return this.inv[this.slot]; }

  // Weapon id -> skin id ('all' covers every weapon). The player's comes from settings; bots and other players carry their own.
  skinOf(weaponId) { return this.skinMap?.[weaponId] || this.skinMap?.all || 'standard'; }

  eye() { return [this.pos[0], this.pos[1] + this.eyeOff + this.stepSmooth, this.pos[2]]; }

  horizSpeed() { return Math.hypot(this.vel[0], this.vel[2]); }

  // 0 = standing, 1 = fully crouched; follows the eye so hitboxes and camera move together.
  crouchAmount() {
    return Math.min(1, Math.max(0, (PLAYER.standEye - this.eyeOff) / (PLAYER.standEye - PLAYER.crouchEye)));
  }

  tagAmount(now) {
    const t = now - this.tagTime;
    if (t < TAG.hold) return this.tagSlow;
    if (t < TAG.hold + TAG.fade) return this.tagSlow * (1 - (t - TAG.hold) / TAG.fade);
    return 0;
  }

  tag(now, slow) {
    // A fresh hit refreshes the slow; never weaken a stronger slow still in effect.
    if (slow >= this.tagAmount(now)) { this.tagSlow = slow; this.tagTime = now; }
  }

  maxSpeed(now) {
    const g = this.gun;
    let m = g.def.move;
    if (this.crouched) m *= PLAYER.crouchMult;
    else if (this.input.walk) m *= PLAYER.walkMult;
    const alt = g.def.alt;
    if (alt && alt.moveMult && g.adsT > 0) m *= lerp(1, alt.moveMult, g.adsT);
    if (this.st.slowUntil > now) m *= 1 - this.st.slowAmt; // ability slows (traps, stuns, lockdown)
    if (this.kit?.highGear) m = 9.1; // sprint
    if (this.st.intangibleUntil > now && !this.kit?.drift) m *= 1.5; // Vanish
    if (this.st.stimUntil > now) m *= 1.1; // Stim Beacon: +10% since patch 11.08
    if (this.st.hasteUntil > now) m *= 1 + this.st.hasteAmt;
    if (this.st.castLockUntil > now) m *= 0.4; // casting an ult that holds you in place (Convergent Paths)
    if (this.st.hinderUntil > now) m *= 0.7; // Hindered: slower everything
    return m * (1 - this.tagAmount(now));
  }

  give(id) {
    const def = WEAPONS[id];
    this.inv[def.slot] = new Gun(def);
    return this.inv[def.slot];
  }

  equip(slot, now, force = false) {
    if (this.kit?.blades) this.kit.blades = null; // switching weapons puts the blades away
    if (this.kit?.armed && !force) this.kit.armed = null; // ...and any ability you were holding
    if (this.kit?.highGear && !force) this.kit.highGear = null;
    if (!this.inv[slot] || (slot === this.slot && !force)) return false;
    const old = this.inv[this.slot];
    if (old) old.onHolster();
    if (slot !== this.slot) this.prevSlot = this.slot;
    this.slot = slot;
    this.inv[slot].onEquip(now);
    this.game.emit('equip', { who: this, gun: this.inv[slot] });
    return true;
  }

  spawnAt(sp, now) {
    this.pos = [sp.x, sp.y, sp.z];
    this.prevPos = [...this.pos];
    this.vel = [0, 0, 0];
    this.yaw = sp.yaw;
    this.pitch = 0;
    this.crouched = false;
    this.height = PLAYER.standHeight;
    this.eyeOff = PLAYER.standEye;
    this.stepSmooth = 0;
    this.prevEyeY = this.pos[1] + this.eyeOff;
    this.grounded = true;
    this.hp = PLAYER.hp;
    this.armor = PLAYER.armor;
    this.alive = true;
    this.tagTime = -100;
    this.report.clear();
    this.dash = null;
    this.burn = 0;
    this.damagedBy = new Set();
    this.decay = 0;
    this.deathPos = null;
    this.st = { slowUntil: 0, slowAmt: 0, blindUntil: 0, blindLen: 1, stunUntil: 0, nearUntil: 0, revealUntil: 0, disarmUntil: 0, suppressUntil: 0, deafUntil: 0, vulnUntil: 0, stimUntil: 0, intangibleUntil: 0, hiddenUntil: 0, downedUntil: 0, channelUntil: 0, hasteUntil: 0, hasteAmt: 0.15, hinderUntil: 0, castLockUntil: 0, invulnUntil: 0 };
    if (this.kit) this.kit.reset(now);
    this.inv.primary = this.loadout.primary ? new Gun(WEAPONS[this.loadout.primary]) : null;
    this.inv.secondary = new Gun(WEAPONS[this.loadout.secondary || 'classic']);
    this.inv.melee = new Gun(WEAPONS.knife);
    this.inv.ability = null;
    this.slot = '';
    this.equip(this.inv.primary ? 'primary' : 'secondary', now);
  }

  takeDamage(amount) {
    const before = this.hp + this.armor;
    const a = Math.min(this.armor, amount);
    this.armor -= a;
    this.hp -= amount - a;
    return before - Math.max(0, this.hp + this.armor);
  }

  heal() {
    this.hp = PLAYER.hp;
    this.armor = PLAYER.armor;
    for (const g of Object.values(this.inv)) if (g && g.def.reserve) g.reserve = g.def.reserve;
  }

  reportFor(other) {
    let r = this.report.get(other);
    if (!r) { r = { dealt: 0, dealtHits: 0, taken: 0, takenHits: 0, head: 0, body: 0, legs: 0, tHead: 0, tBody: 0, tLegs: 0, since: this.game.time }; this.report.set(other, r); }
    return r;
  }

  // Hitboxes in world space; interpolate between standing and crouched shapes.
  hitboxes() {
    const c = this.crouchAmount();
    const out = [];
    for (const part of ['head', 'body', 'legs']) {
      const s = HITBOX.stand[part], k = HITBOX.crouch[part];
      const y0 = lerp(s[0], k[0], c), y1 = lerp(s[1], k[1], c), hw = lerp(s[2], k[2], c);
      const base = this.pos[1];
      out.push({ part, min: [this.pos[0] - hw, base + y0, this.pos[2] - hw], max: [this.pos[0] + hw, base + y1, this.pos[2] + hw] });
    }
    return out;
  }

  rayHit(o, d, maxT) {
    // Cheap reject with a bounding sphere around the body.
    const cx = this.pos[0] - o[0], cy = this.pos[1] + PLAYER.standHeight / 2 - o[1], cz = this.pos[2] - o[2];
    const along = cx * d[0] + cy * d[1] + cz * d[2];
    if (along < -1.5 || along > maxT + 1.5) return null;
    const px = cx - d[0] * along, py = cy - d[1] * along, pz = cz - d[2] * along;
    if (px * px + py * py + pz * pz > 1.4 * 1.4) return null;
    let best = null;
    for (const hb of this.hitboxes()) {
      const h = rayAABB(o, d, hb.min, hb.max);
      if (h && h.tIn <= maxT && (!best || h.tIn < best.t)) best = { t: h.tIn, part: hb.part };
    }
    return best;
  }

  // ---- movement (runs at the fixed tick rate) ----
  move(dt, now, world) {
    this.prevPos[0] = this.pos[0]; this.prevPos[1] = this.pos[1]; this.prevPos[2] = this.pos[2];
    this.prevEyeY = this.pos[1] + this.eyeOff + this.stepSmooth;
    const inp = this.input;

    this.updateCrouch(inp.crouch, world);

    let wx = 0, wz = 0;
    const len = Math.hypot(inp.fwd, inp.side);
    if (len > 0) {
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      wx = (-sy * inp.fwd + cy * inp.side) / len;
      wz = (-cy * inp.fwd - sy * inp.side) / len;
    }
    const maxS = this.maxSpeed(now);
    if (inp.jump) this.jumpBuffer = 0.1;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    let jumped = false;
    if (this.grounded) {
      const tx = wx * maxS, tz = wz * maxS;
      const dvx = tx - this.vel[0], dvz = tz - this.vel[2];
      const dl = Math.hypot(dvx, dvz);
      const rate = (len > 0 ? PLAYER.accel : PLAYER.decel) * dt;
      if (dl <= rate) { this.vel[0] = tx; this.vel[2] = tz; }
      else { this.vel[0] += (dvx / dl) * rate; this.vel[2] += (dvz / dl) * rate; }
      if (this.jumpBuffer > 0) {
        this.vel[1] = PLAYER.jumpVelocity * (this.st.hinderUntil > now ? 0.8 : 1);
        this.grounded = false;
        this.jumpBuffer = 0;
        this.airCap = Math.max(this.horizSpeed(), 1.5);
        jumped = true;
        this.game.emit('jump', { who: this });
      }
    } else if (len > 0) {
      // Air strafing like Valorant: holding a direction in the air steers your momentum toward it (you can
      // turn, stop or reverse mid-jump), up to your takeoff speed — or most of your run speed from a standing jump.
      const cap = Math.max(Math.min(this.airCap, maxS), maxS * PLAYER.airStandFrac);
      const tcap = Math.max(cap, Math.min(this.horizSpeed(), this.airCap)); // don't bleed speed from a dash or blast
      const tx = wx * tcap, tz = wz * tcap;
      const dvx = tx - this.vel[0], dvz = tz - this.vel[2], dl = Math.hypot(dvx, dvz), rate = PLAYER.airAccel * dt;
      if (dl <= rate) { this.vel[0] = tx; this.vel[2] = tz; }
      else { this.vel[0] += (dvx / dl) * rate; this.vel[2] += (dvz / dl) * rate; }
    }
    applyDash(this, now, dt);
    this.vel[1] -= PLAYER.gravity * dt;
    applyGlide(this);
    this.climbRope();

    const wasGrounded = this.grounded && !jumped;
    const fallSpeed = this.vel[1];
    this.collideMove(dt, world, wasGrounded, jumped);
    if (this.grounded && !wasGrounded && !jumped && fallSpeed < -4) this.game.emit('land', { who: this, speed: -fallSpeed });

    // Eye height: ease crouch transitions and step-ups.
    const eyeTarget = this.crouched ? PLAYER.crouchEye : PLAYER.standEye;
    this.eyeOff += (eyeTarget - this.eyeOff) * (1 - Math.exp(-dt * 22));
    this.stepSmooth *= Math.exp(-dt * 20);
    if (Math.abs(this.stepSmooth) < 1e-4) this.stepSmooth = 0;

    // Running is loud; walking and crouching are silent.
    const sp = this.horizSpeed();
    if (this.grounded && sp > this.gun.def.move * PLAYER.walkMult + 0.15) {
      this.stepDist += sp * dt;
      if (this.stepDist > 1.9) { this.stepDist = 0; this.game.emit('footstep', { who: this }); }
    } else if (sp < 0.5) this.stepDist = 1.2;
  }

  // Ropes: hold W (or Space) against one to climb; at the top you step off onto the ledge.
  climbRope() {
    const ropes = this.game.map.ropes;
    this.climbing = false;
    if (!ropes || !ropes.length) return;
    const inp = this.input;
    if (!(inp.jumpHeld || inp.fwd > 0)) return;
    for (const r of ropes) {
      const dx = this.pos[0] - r.x, dz = this.pos[2] - r.z;
      if (dx * dx + dz * dz > 0.75 * 0.75 || this.pos[1] < r.bottom - 0.3 || this.pos[1] > r.top + 0.4) continue;
      if (this.pos[1] < r.top + 0.05) {
        this.vel[0] = -dx * 4; this.vel[2] = -dz * 4; // hug the rope
        this.vel[1] = 4.6;
        this.climbing = true;
      } else {
        this.vel[0] = r.toward[0] * 4.5; this.vel[2] = r.toward[1] * 4.5;
        this.vel[1] = Math.max(this.vel[1], 1.2);
        this.airCap = 4.5;
      }
      this.grounded = false;
      return;
    }
  }

  updateCrouch(want, world) {
    const p = this.pos, r = PLAYER.radius;
    if (want && !this.crouched) {
      this.crouched = true;
      this.height = PLAYER.crouchHeight;
      if (!this.grounded) {
        // Tuck the legs: feet rise, head stays put. This is what lets a crouch-jump clear higher ledges.
        p[1] += CROUCH_DIFF;
        this.stepSmooth -= CROUCH_DIFF;
      }
    } else if (!want && this.crouched) {
      const free = (y) => !world.overlap(p[0] - r, y, p[2] - r, p[0] + r, y + PLAYER.standHeight, p[2] + r);
      if (!this.grounded && free(p[1] - CROUCH_DIFF)) {
        p[1] -= CROUCH_DIFF;
        this.stepSmooth += CROUCH_DIFF;
        this.crouched = false;
      } else if (free(p[1])) {
        this.crouched = false;
      }
      if (!this.crouched) this.height = PLAYER.standHeight;
    }
  }

  collideMove(dt, world, wasGrounded, jumped) {
    const p = this.pos, v = this.vel, r = PLAYER.radius;
    const hits = [];
    const box = () => world.overlapAll(p[0] - r, p[1], p[2] - r, p[0] + r, p[1] + this.height, p[2] + r, hits);

    // Vertical
    this.grounded = false;
    const dy = v[1] * dt;
    p[1] += dy;
    box();
    for (const b of hits) {
      if (dy <= 0) { p[1] = Math.max(p[1], b.max[1]); this.grounded = true; }
      else p[1] = Math.min(p[1], b.min[1] - this.height);
    }
    if (hits.length) v[1] = 0;

    // Horizontal, one axis at a time so you slide along walls.
    for (const axis of [0, 2]) {
      const d = v[axis] * dt;
      if (!d) continue;
      p[axis] += d;
      box();
      if (!hits.length) continue;
      if (this.grounded || wasGrounded) {
        let top = -Infinity;
        for (const b of hits) top = Math.max(top, b.max[1]);
        const rise = top - p[1];
        if (rise > 0 && rise <= PLAYER.stepHeight &&
            !world.overlap(p[0] - r, top, p[2] - r, p[0] + r, top + this.height, p[2] + r)) {
          p[1] = top;
          this.stepSmooth -= rise;
          this.grounded = true;
          continue;
        }
      }
      for (const b of hits) {
        if (d > 0) p[axis] = Math.min(p[axis], b.min[axis] - r - 1e-4);
        else p[axis] = Math.max(p[axis], b.max[axis] + r + 1e-4);
      }
      v[axis] = 0;
    }

    // Stick to the ground when walking down steps instead of going airborne.
    if (!this.grounded && wasGrounded && !jumped && v[1] <= 0) {
      world.overlapAll(p[0] - r, p[1] - PLAYER.stepHeight - 0.01, p[2] - r, p[0] + r, p[1], p[2] + r, hits);
      let top = -Infinity;
      for (const b of hits) if (b.max[1] <= p[1] + 1e-4) top = Math.max(top, b.max[1]);
      if (top > -Infinity) {
        this.stepSmooth += p[1] - top;
        p[1] = top;
        v[1] = 0;
        this.grounded = true;
      }
    }
  }
}
