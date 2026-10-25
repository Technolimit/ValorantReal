// Per-weapon state machine shared by the player and bots: fire cadence, spread, recoil, recovery,
// ADS/scopes, bursts, spin-up, reload and equip.
import { DT, CROUCH_SPREAD, PLAYER } from './config.js';
import { dirFromAngles } from './entity.js';

const DEG = Math.PI / 180;
const ADS_RECOIL = 0.8; // share of hip recoil while aimed down sights
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  if (b <= a) return x >= b ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Gun {
  constructor(def) {
    this.def = def;
    this.mag = def.mag ?? 0;
    this.reserve = def.reserve ?? 0;
    this.heat = 0; // shots in the current spray, decays during recovery
    this.offP = 0; // recoil offset (radians) the bullets get; the camera shows VIEW_RECOIL of it
    this.offY = 0;
    this.lastKick = { up: 0, side: 0 }; // degrees of the last shot's recoil, read by the renderer
    this.spray = null; // current spray, drawn by the spray trainer overlay
    this.nextFire = 0;
    this.lastShot = -10;
    this.recovering = true;
    this.recRate = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.reloadDur = def.reload ?? 0;
    this.reloadStart = -10;
    this.reloadStopped = -10; // when the last reload ended (finished or cancelled), for the animation fade-out
    this.roundStart = 0; // round-by-round reloads (Marshal, Bucky): when the current round started loading
    this.roundEnd = 0;
    this.equipEnd = 0;
    this.adsT = 0;
    this.adsWant = false;
    this.zoomLevel = 0;
    this.burstLeft = 0;
    this.burst = null;
    this.spinT = 0;
    this.triggerDown = false;
    this.meleePending = null;
    this.lastSpread = 0;
  }

  get alt() { return this.def.alt || { type: 'none' }; }

  // Zoom factor of the current ADS/scope state, ignoring the transition.
  targetZoom() {
    const a = this.alt;
    if (a.type === 'scope') return this.zoomLevel ? a.levels[this.zoomLevel - 1] : 1;
    if (a.type === 'zoom' || a.type === 'zoomBurst') return a.zoom;
    return 1;
  }

  scoped() { return this.alt.type === 'scope' && this.zoomLevel > 0 && this.adsT > 0.85; }

  rate() {
    const d = this.def, a = this.alt;
    let r = d.rate;
    if (d.spin) {
      let t = d.spin.adsInstant && this.adsT > 0.5 ? 1 : this.spinT / d.spin.time;
      if (d.spin.adsHead && this.adsT > 0.5) t = Math.max(t, d.spin.adsHead + this.spinT / d.spin.time);
      r = lerp(d.rate, d.spin.to, clamp(t, 0, 1));
    }
    if ((a.type === 'zoom' || a.type === 'scope') && a.rateMult && this.adsT > 0.5) r *= a.rateMult;
    r *= this.buffRate || 1; // agent buffs (Overheat)
    if (this.stunned) r *= 0.55;
    if (this.hindered) r *= 0.8;
    return r;
  }

  onEquip(now) {
    this.equipEnd = now + this.def.equip;
    this.nextFire = Math.max(this.nextFire, this.equipEnd);
    this.reloading = false;
    this.reloadStopped = -10;
    this.adsT = 0;
    this.adsWant = false;
    this.zoomLevel = 0;
    this.burstLeft = 0;
    this.heat = 0;
    this.offP = 0;
    this.offY = 0;
    this.spinT = 0;
    this.meleePending = null;
  }

  onHolster() {
    this.reloading = false;
    this.reloadStopped = -10;
    this.burstLeft = 0;
    this.adsWant = false;
    this.zoomLevel = 0;
  }

  startReload(owner, now) {
    const d = this.def;
    if (this.reloading || !d.mag || this.mag >= d.mag || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadStart = now;
    if (d.perRound) {
      // One round at a time; each one can be fired as soon as it's chambered.
      const n = Math.min(d.mag - this.mag, this.reserve);
      this.roundStart = now + d.perRound.first;
      this.roundEnd = this.roundStart + d.perRound.each;
      this.reloadDur = d.perRound.first + n * d.perRound.each;
    } else {
      this.reloadDur = d.reloadOne && d.mag - this.mag === 1 ? d.reloadOne : d.reload;
    }
    this.reloadEnd = now + this.reloadDur;
    this.burstLeft = 0;
    this.adsWant = false;
    this.zoomLevel = 0;
    owner.game.emit('reload', { who: owner, gun: this });
  }

  // Spread cone half-angle in degrees for the next shot.
  spread(owner, burst = null) {
    const d = this.def, s = d.spread;
    const base = burst && burst.spread != null ? burst.spread : lerp(s.hip, s.ads, this.adsT);
    const frac = owner.horizSpeed() / d.move;
    const wk = PLAYER.walkMult;
    let move = 0;
    if (frac > s.deadzone) {
      move = frac <= wk
        ? s.walk * (frac - s.deadzone) / (wk - s.deadzone)
        : s.walk + (s.run - s.walk) * Math.min(1, (frac - wk) / (1 - wk));
    }
    const air = owner.grounded ? 0 : s.air;
    const fe = d.fe.max * smoothstep(d.fe.start, d.fe.end, this.heat);
    let total = base + move + air + fe;
    if (owner.crouched && owner.grounded) total *= CROUCH_SPREAD;
    if (owner.st?.stunUntil > owner.game?.time) total = total * 1.6 + 0.03;
    return total;
  }

  tick(owner, now, dt) {
    this.stunned = owner.st?.stunUntil > now; // concussed: slower trigger, wilder spray
    this.hindered = owner.st?.hinderUntil > now; // Hindered: slower fire rate too
    if (this.def.melee) return this.tickMelee(owner, now);
    const d = this.def, a = this.alt, inp = owner.input;

    if (this.reloading) {
      if (inp.firePressed && this.mag > 0) this.stopReload(now); // shooting cancels a reload
      else if (d.perRound) {
        while (this.reloading && now >= this.roundEnd) {
          this.mag++;
          this.reserve--;
          owner.game.emit('reloadRound', { who: owner, gun: this });
          if (this.mag >= d.mag || this.reserve <= 0) this.stopReload(now);
          else { this.roundStart = this.roundEnd; this.roundEnd += d.perRound.each; }
        }
      } else if (now >= this.reloadEnd) {
        const take = Math.min(d.mag - this.mag, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.stopReload(now);
      }
    }
    if (inp.reload && this.burstLeft === 0) this.startReload(owner, now);

    const ready = now >= this.equipEnd && !this.reloading;

    // Aim down sights / scope
    if (a.type === 'zoom' || a.type === 'zoomBurst') {
      if (owner.adsHold) this.adsWant = inp.alt;
      else if (inp.altPressed) this.adsWant = !this.adsWant;
    } else if (a.type === 'scope' && inp.altPressed && ready) {
      this.zoomLevel = (this.zoomLevel + 1) % (a.levels.length + 1);
      this.adsWant = this.zoomLevel > 0;
    }
    if (!ready) { this.adsWant = false; this.zoomLevel = 0; }
    const step = dt / (a.time || 0.2);
    this.adsT = clamp(this.adsT + clamp((this.adsWant ? 1 : 0) - this.adsT, -step, step), 0, 1);

    if (d.spin) {
      if (this.triggerDown) this.spinT = Math.min(d.spin.time, this.spinT + dt);
      else this.spinT = Math.max(0, this.spinT - dt * 2);
    }

    // Fire
    this.triggerDown = false;
    if (this.burstLeft > 0) {
      this.continueBurst(owner, now);
    } else if (ready) {
      let burst = null;
      if (a.type === 'burst' && inp.altPressed) burst = a;
      else if (a.type === 'zoomBurst' && this.adsT > 0.5 && inp.firePressed) burst = a;
      if (burst) {
        if (this.mag <= 0) this.dryFire(owner, now);
        else if (now >= this.nextFire) {
          this.burst = burst;
          this.burstLeft = burst.count;
          this.nextFire = now;
          this.continueBurst(owner, now);
        }
      } else if (!(a.type === 'zoomBurst' && this.adsT > 0.5)) {
        const want = d.auto ? inp.fire : inp.firePressed;
        if (want) {
          if (this.mag <= 0) this.dryFire(owner, now);
          else if (now >= this.nextFire) {
            const interval = 1 / this.rate();
            if (now - this.nextFire > interval) this.nextFire = now; // trigger was idle: restart the cadence
            this.shoot(owner, now, null);
            this.nextFire += interval;
            this.triggerDown = d.auto;
          } else this.triggerDown = d.auto;
        }
      }
    }

    // Recovery: once the trigger has been idle a moment, spread and recoil settle back to zero.
    const delay = Math.min(1 / this.rate(), 0.15) + DT;
    if (this.burstLeft === 0 && now - this.lastShot > delay) {
      if (!this.recovering) {
        this.recovering = true;
        this.recRate = Math.max(1, this.heat) / d.recovery;
      }
      if (this.heat > 0) {
        const nh = Math.max(0, this.heat - this.recRate * dt);
        const k = nh / this.heat;
        this.offP *= k;
        this.offY *= k;
        this.heat = nh;
      } else { this.offP = 0; this.offY = 0; }
    }
    this.lastSpread = this.spread(owner);
  }

  stopReload(now) {
    this.reloading = false;
    this.reloadStopped = now;
  }

  continueBurst(owner, now) {
    const b = this.burst;
    while (this.burstLeft > 0 && now >= this.nextFire) {
      if (this.mag <= 0) { this.burstLeft = 0; break; }
      this.shoot(owner, now, b.spread != null ? b : null);
      this.burstLeft--;
      this.nextFire += this.burstLeft > 0 ? b.interval : b.cooldown;
    }
  }

  dryFire(owner, now) {
    if (this.reserve > 0) this.startReload(owner, now);
    else if (now >= this.nextFire) {
      this.nextFire = now + 0.25;
      owner.game.emit('dry', { who: owner });
    }
  }

  shoot(owner, now, burst) {
    const d = this.def, r = d.recoil, a = this.alt;
    const spread = this.spread(owner, burst);
    const yaw = owner.yaw + this.offY, pitch = owner.pitch + this.offP;
    const dirs = [];
    for (let i = 0; i < (d.pellets || 1); i++) dirs.push(coneDir(yaw, pitch, spread));
    if (this.heat < 0.5 || !this.spray) this.spray = { id: (this.spray?.id || 0) + 1, y0: owner.yaw, p0: owner.pitch, pts: [] };
    if (this.spray.pts.length < 120) {
      const f = dirs[0];
      this.spray.pts.push({
        ry: this.offY, rp: this.offP, // pattern offset this bullet got
        ay: wrapAngle(Math.atan2(-f[0], -f[2]) - this.spray.y0), ap: Math.asin(f[1]) - this.spray.p0, // where it went
      });
    }
    this.mag--;
    owner.stats.shots++;
    owner.game.fireBullets(owner, this, dirs);

    // Recoil: every weapon follows a fixed spray pattern (weapons.js), so the same pull-down works every
    // time. Pitch climbs along `v`; yaw follows the `h` waypoint path; a little jitter keeps it organic.
    const idx = Math.floor(this.heat);
    const up = (idx < r.v.length ? r.v[idx] : r.tail) * (1 + (Math.random() * 2 - 1) * (r.vJit ?? 0.05));
    const side = patternStep(r, idx) + gauss() * (r.hJit ?? 0.05);
    // Aimed in, recoil shrinks (snipers excepted: one shot, then you re-aim anyway).
    const am = (this.adsT > 0.5 && a.type !== 'scope' && a.type !== 'none' ? ADS_RECOIL : 1) * (this.buffRecoil || 1);
    this.lastKick = { up: up * am, side: side * am };
    this.offP += up * am * DEG;
    this.offY += side * am * DEG;
    this.heat += 1;
    this.lastShot = now;
    this.recovering = false;
    owner.game.emit('shot', { who: owner, gun: this });
  }

  tickMelee(owner, now) {
    const m = this.def.melee, inp = owner.input;
    if (this.meleePending && now >= this.meleePending.at) {
      owner.game.meleeHit(owner, this.meleePending.mode);
      this.meleePending = null;
    }
    if (now < this.equipEnd || now < this.nextFire || this.meleePending) return;
    if (inp.fire) {
      this.meleePending = { at: now + 0.06, mode: m.primary };
      this.nextFire = now + m.primary.cycle;
      owner.game.emit('swing', { who: owner, heavy: false });
    } else if (inp.alt) {
      this.meleePending = { at: now + m.alt.windup, mode: m.alt };
      this.nextFire = now + m.alt.cycle;
      owner.game.emit('swing', { who: owner, heavy: true });
    }
  }
}

// Random direction inside a cone of `deg` degrees around (yaw, pitch), uniform over the disk.
export function coneDir(yaw, pitch, deg) {
  const f = dirFromAngles(yaw, pitch);
  if (deg <= 0) return f;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right vector (horizontal)
  // up = right x forward
  const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];
  const a = Math.tan(deg * DEG) * Math.sqrt(Math.random());
  const th = Math.random() * Math.PI * 2;
  const ca = a * Math.cos(th), sa = a * Math.sin(th);
  const x = f[0] + rx * ca + ux * sa, y = f[1] + uy * sa, z = f[2] + rz * ca + uz * sa;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// Horizontal move (degrees) for shot `i` of the spray: the slope of the `h` waypoint path between shots i
// and i+1. Past the last waypoint it repeats from `loop`, or holds still.
export function patternSide(r, i) {
  const h = r.h;
  if (!h || !h.length) return 0;
  if (i <= h[0][0]) return h[0][1];
  for (let k = 1; k < h.length; k++) {
    if (i <= h[k][0]) {
      const [a, va] = h[k - 1], [b, vb] = h[k];
      return va + (vb - va) * (i - a) / (b - a);
    }
  }
  return h[h.length - 1][1];
}

function patternStep(r, i) {
  const h = r.h;
  if (!h || !h.length) return 0;
  const last = h[h.length - 1][0];
  let j = i;
  if (j >= last) {
    if (r.loop == null || r.loop >= last) return 0;
    j = r.loop + ((j - r.loop) % (last - r.loop));
  }
  return patternSide(r, j + 1) - patternSide(r, j);
}

// The weapon's full-magazine pattern with no jitter: [{y, p}] in radians, for the spray trainer overlay.
export function patternPreview(def) {
  const r = def.recoil, out = [];
  if (!r || !def.mag) return out;
  let y = 0, p = 0;
  for (let i = 0; i < def.mag; i++) {
    out.push({ y, p });
    p += (i < r.v.length ? r.v[i] : r.tail) * DEG;
    y += patternStep(r, i) * DEG;
  }
  return out;
}

// Roughly normal noise in [-1, 1]-ish, centred on 0.
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
