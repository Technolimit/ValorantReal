// Match simulation: combatants, hitscan with wall penetration, damage, kills and respawns (free-for-all).
import { DT, MATCH, PEN_DEPTH, MAX_RANGE, TAG, PLAYER } from './config.js';
import { buildMap, supportsMode } from './map.js';
import { RoundMode, NetRoundMode, ROUND, ECON } from './rounds.js';
import { World } from './world.js';
import { Combatant, dirFromAngles } from './entity.js';
import { damageAt, WEAPONS, BUY_GROUPS } from './weapons.js';
import { Bot, BOT_NAMES } from './bot.js';
import { Kit, AGENT_ORDER, smokeBlocks, SMOKE, SLAB } from './abilities.js';
import { dirFromAngles as dirOf } from './entity.js';
import { netStep } from './net.js';
import { SKINS, SKIN_ORDER, variantsOf } from './skins.js';
import { hyp } from './vmath.js';

const TURRET = { id: 'sentry', name: 'Sentry', cat: 'Ability', dmg: [[50, 0, 0, 0]] };
const BOOMER = { id: 'boomer', name: 'Boomer', cat: 'Ability', dmg: [[50, 0, 0, 0]] };
// Utility enemies can shoot down, as in Valorant: health, and a hit sphere (centre height above pos, radius).
export const SHOOTABLE = {
  turret: { hp: 100, y: 0.5, r: 0.45 }, alarm: { hp: 20, y: 0.25, r: 0.3 }, swarm: { hp: 20, y: 0.1, r: 0.25 },
  cam: { hp: 1, y: 0, r: 0.22 }, wire: { hp: 20, y: 0, r: 0.22 }, boombot: { hp: 60, y: 0.25, r: 0.35 },
  tiger: { hp: 80, y: 0.5, r: 0.5 }, decoy: { hp: 1, y: 1, r: 0.45 }, zknife: { hp: 20, y: 0, r: 0.22 },
  prowler: { hp: 60, y: 0.4, r: 0.35 }, haunt: { hp: 1, y: 0.3, r: 0.3 }, owl: { hp: 100, y: 0, r: 0.3 },
  gate: { hp: 60, y: 0.15, r: 0.3 }, shade: { hp: 1, y: 1, r: 0.5 }, // Riftwalk's rift, Nightwalk's shade
  lockdown: { hp: 200, y: 0.5, r: 0.5 }, // the device, while it charges
  cove: { hp: 680 }, // Lagoon's water dome: stops every bullet once its shell has formed, until it breaks
  leer: { hp: 60, y: 0, r: 0.35 }, satchel: { hp: 20, y: 0.05, r: 0.25 }, recon: { hp: 20, y: 0, r: 0.22 },
  hawk: { hp: 60, y: 0, r: 0.35 }, seeker: { hp: 120, y: 0, r: 0.4 }, sdrone: { hp: 42, y: 0, r: 0.3 },
  trademark: { hp: 20, y: 0.1, r: 0.25 }, anchor: { hp: 50, y: 0.15, r: 0.3 },
};
const FLOOR_NY = Math.cos(44.765 * Math.PI / 180); // a projectile that stops on bounce stops on floors flatter than this
// The tuning a map's "rules" and "physics" can change, as shipped; every match starts from these.
const BASE_RULES = { rounds: { ...ROUND }, economy: { ...ECON, loss: [...ECON.loss] }, deathmatch: { ...MATCH }, physics: { gravity: PLAYER.gravity, jumpVelocity: PLAYER.jumpVelocity } };
// A zone's radius right now: fire spreads out from where it lands (z.spread, m/s) and some zones shrink to
// nothing over their last z.fade seconds (Sky Hammer).
export function zoneRadius(z, now) {
  let r = z.r;
  if (z.spread) r = Math.min(r, Math.max(0.5, (now - (z.armAt || z.born)) * z.spread));
  if (z.fade && now > z.until - z.fade) r *= Math.max(0, (z.until - now) / z.fade);
  return r;
}
const BOT_COLORS = [0xff4655, 0xffb547, 0xc86bff, 0x4fd1c5, 0xff7ab8, 0x9be15d, 0x6aa7ff, 0xf28c38, 0xe0e0e0, 0x8e7dff];

export class Game {
  constructor() {
    this.map = buildMap();
    this.world = new World([...this.map.boxes]);
    this.time = 0;
    this.listeners = {};
    this.combatants = [];
    this.bots = [];
    this.player = null;
    this.smokes = [];
    this.zones = [];
    this.walls = [];
    this.devices = [];
    this.eventide = null;
    this.state = 'idle';
    this.on('footstep', ({ who }) => this.noise(who, 22));
    this.on('land', ({ who }) => this.noise(who, 18));
    // Host, offline and online clients all announce deaths with 'kill', so every copy of a kit cleans up.
    this.on('kill', ({ victim }) => victim.kit?.onDeath(this.time));
  }

  // Online: 'host' runs the real match; on a 'client' only the local player is simulated and the host
  // decides health, deaths and respawns (see net.js).
  get netClient() { return this.netRole === 'client' || this.netRole === 'client-ended'; }

  // Teams only exist in round mode; in deathmatch everyone is an enemy.
  isEnemy(a, b) {
    if (!a || !b || a === b) return false;
    if (!this.mode) return true;
    return a.team !== b.team;
  }

  loadMap(id) {
    if (this.map.id === id) {
      // Same map as last match: drop anything the previous match added (barriers, ability walls) —
      // otherwise a restart during the buy phase leaves invisible, solid barriers behind.
      this.world.boxes = this.world.boxes.filter(b => !b.temp);
      return;
    }
    this.map = buildMap(id);
    this.world = new World([...this.map.boxes]); // the world's own list, so temporary boxes never touch the map
    this.emit('map', this.map);
  }

  // Round timers, economy, respawn time and gravity for this map (anything it leaves out stays standard).
  applyRules(rules = {}) {
    Object.assign(ROUND, BASE_RULES.rounds, rules.rounds);
    Object.assign(ECON, BASE_RULES.economy, rules.economy);
    Object.assign(MATCH, BASE_RULES.deathmatch, rules.deathmatch);
    Object.assign(PLAYER, BASE_RULES.physics, rules.physics);
  }

  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }

  start(opts) {
    this.opts = opts;
    this.time = 0;
    this.mode = null;
    this.contract = null;
    this.drops = [];
    this.loadMap(opts.mode === 'rounds' ? (supportsMode(opts.map, 'rounds') ? opts.map : 'divide') : (opts.map || 'arena'));
    this.applyRules(this.map.rules);
    this.killLimit = opts.killLimit;
    this.timeLimit = opts.timeLimit;
    this.combatants = [];
    this.bots = [];
    const player = new Combatant(this, { name: 'You' });
    player.loadout = { ...opts.loadout };
    player.kit = opts.noAbilities ? null : new Kit(player, opts.agent);
    this.smokes = [];
    this.zones = [];
    for (const w of this.walls || []) this.removeWall(w);
    this.walls = [];
    this.devices = [];
    this.eventide = null;
    this.player = player;
    this.combatants.push(player);
    if (opts.mode === 'rounds') {
      this.mode = opts.netRounds ? new NetRoundMode(this, opts) : new RoundMode(this, opts);
      this.state = 'playing';
      this.mode.setup();
      this.emit('start', {});
      return;
    }
    const primaries = BUY_GROUPS.filter(([g]) => g !== 'Sidearms').flatMap(([, ids]) => ids);
    const botSkins = SKIN_ORDER.filter(id => id !== 'standard' && !id.startsWith('custom-') && !SKINS[id].models);
    const modelSkins = SKIN_ORDER.filter(id => SKINS[id].models);
    // Bots picked theirs on the agent select screen (online), or get unused ones at random.
    const dmAgents = opts.lineup?.some(s => s.bot) ? opts.lineup.filter(s => s.bot).map(s => s.a) : AGENT_ORDER.filter(a => a !== opts.agent).sort(() => Math.random() - 0.5);
    for (let i = 0; i < opts.botCount; i++) {
      const c = new Combatant(this, { name: BOT_NAMES[i % BOT_NAMES.length], isBot: true, color: BOT_COLORS[i % BOT_COLORS.length] });
      let primary;
      if (opts.botWeapons === 'match') primary = opts.loadout.primary || 'vandal';
      else if (opts.botWeapons === 'random') primary = primaries[Math.floor(Math.random() * primaries.length)];
      else primary = Math.random() < 0.5 ? 'vandal' : 'phantom';
      c.loadout = { primary, secondary: 'classic' };
      c.brain = new Bot(c, this, opts.difficulty, opts.botMode);
      c.kit = opts.noAbilities ? null : new Kit(c, dmAgents[i % dmAgents.length]); // bots get agents (and use their abilities) too
      // Most bots run a skin: one preset across their guns (cosmetic only).
      if (Math.random() < 0.7) c.skinMap = { all: botSkins[Math.floor(Math.random() * botSkins.length)] };
      // Some also run a model skin on the gun it's made for (an Orbital Vandal).
      for (const sid of modelSkins) {
        if (Math.random() >= 0.2) continue;
        const pick = variantsOf(sid)[Math.floor(Math.random() * variantsOf(sid).length)]; // in any of its colours
        for (const w of Object.keys(SKINS[sid].models)) (c.skinMap ||= {})[w] = pick;
      }
      this.combatants.push(c);
      this.bots.push(c);
    }
    this.state = 'playing';
    for (const c of this.combatants) this.respawn(c);
    this.emit('start', {});
  }

  tick() {
    const now = this.time;
    if (!this.mode && !this.netClient) for (const c of this.combatants) {
      if (!c.alive && this.state === 'playing' && now >= c.respawnAt) this.respawn(c);
    }
    if (this.mode && this.state === 'playing') this.mode.tick(now);
    for (const b of this.bots) if (b.alive) b.brain.think(now, DT);
    this.onInputs?.(); // online: record this tick's ability inputs (net.js)
    for (const c of this.combatants) {
      if (c.remote) {
        // Someone else's player: follows the network, and replays their ability inputs on its kit.
        if (!c.alive) {
          // A dead Thistle still casts (Ruse, Not Dead Yet), and thrown utility still lands.
          if (c.kit?.agent.deadCast && this.state === 'playing') { this.applyNetInput?.(c); c.kit.tickDead(now); }
          else c.kit?.runTimers(now);
          continue;
        }
        netStep(c, DT);
        this.applyNetInput?.(c);
        if (c.kit) c.kit.tick(now);
        continue;
      }
      if (!c.alive) {
        if (c.kit?.agent.deadCast && this.state === 'playing') c.kit.tickDead(now);
        else c.kit?.runTimers(now); // utility already thrown still lands after its owner dies
        // A bot Thistle comes back with Not Dead Yet a moment after falling, when it has the points.
        if (c.isBot && c.kit?.agent.deadCast && c.deathPos && this.mode?.phase !== 'end' && c.kit.ultPoints >= c.kit.ultCost && now - c.diedAt > 1.5) c.kit.notDeadYet();
        continue;
      }
      if (c.decay > 0 && now >= c.decayRegenAt) { const back = Math.min(c.decay, (c.decayRate || 12) * DT); c.decay -= back; c.hp = Math.min(PLAYER.hp, c.hp + back); }
      if (c.kit) { c.kit.tick(now); c.kit.keepAim(); }
      c.move(DT, now, this.world);
      if (!c.kit?.blocking() && !(c.st.channelUntil > now) && !(c.st.disarmUntil > now)) c.gun.tick(c, now, DT); // detained: no gun
    }
    for (const c of this.combatants) {
      const i = c.input;
      i.firePressed = i.altPressed = i.jump = i.reload = false;
      i.abQ = i.abE = i.abC = i.abX = false;
    }
    if (this.smokes.length && this.smokes.some(s => s.until < now)) this.smokes = this.smokes.filter(s => s.until >= now);
    this.tickZones(now);
    this.tickDevices(now);
    this.tickDrops(now);
    this.tickContract(now);
    // Venom sees enemies inside her own Nest.
    for (const s of this.smokes) {
      if (!s.nest || now >= s.until) continue;
      for (const c of this.combatants) if (this.affectable(c) && this.isEnemy(s.owner, c) && hyp(c.pos[0] - s.pos[0], c.pos[1] + 1 - s.pos[1], c.pos[2] - s.pos[2]) < s.radius) c.st.revealUntil = now + 0.15;
    }
    for (const w of this.walls) {
      if (now >= w.until) this.removeWall(w);
      else if (w.fortify && now >= w.born + 2) { w.hp += w.fortify; w.fortify = 0; } // Frost Wall hardens 2 s after it rises
    }
    if (this.walls.length && this.walls.some(w => w.removed)) this.walls = this.walls.filter(w => !w.removed);
    if (this.eventide && now >= this.eventide.until) this.eventide = null;
    this.time += DT;
    if (!this.mode && !this.netClient && this.state === 'playing' && this.time >= this.timeLimit) this.end();
  }

  // Line of sight that smoke also blocks (used for bot vision; bullets ignore smoke).
  canSee(a, b) {
    return this.world.lineOfSight(a, b) && !smokeBlocks(this.smokes, a, b, this.time);
  }

  // Can abilities put a status on c? Not while phased out or intangible (Phase Out, Vanish, downed).
  affectable(c) {
    return c.alive && !(c.st.intangibleUntil > this.time) && !(c.st.hiddenUntil > this.time);
  }

  addSmoke(owner, pos, now, { radius = SMOKE.radius, life = SMOKE.life, color = 0xcfdbe6, kind = 'smoke', nest = false, slab = null } = {}) {
    const s = { owner, pos, born: now, until: now + life, radius, color, kind, nest, slab };
    if (SHOOTABLE[kind]) s.hp = SHOOTABLE[kind].hp;
    this.smokes.push(s);
    this.emit('smoke', s);
    return s;
  }

  // ---------- ability effects ----------
  // Zones: fire (damage enemies, heal the owner), trap (first enemy in gets slowed + revealed),
  // lockdown (arms after a delay, disarms and slows everyone inside).
  addZone(z, now) {
    if (SHOOTABLE[z.kind]) z.hp = SHOOTABLE[z.kind].hp;
    z.born = now;
    z.until = now + z.life;
    this.zones.push(z);
    this.emit('zone', z);
    return z;
  }

  tickZones(now) {
    if (!this.zones.length) return;
    for (const z of this.zones) {
      if (now >= z.until) continue;
      for (const c of this.combatants) {
        if (!c.alive) continue;
        const dx = c.pos[0] - z.pos[0], dz = c.pos[2] - z.pos[2], dy = c.pos[1] - z.pos[1];
        if (dy < -1.0 || dy > 3) continue;
        if (z.slab) { // a strip (Toxic Wall): along its length, and touching its thickness
          const sl = z.slab, along = dx * sl.dir[0] + dz * sl.dir[1], across = dz * sl.dir[0] - dx * sl.dir[1];
          if (Math.abs(along) > sl.len / 2 || Math.abs(across) > sl.th / 2 + PLAYER.radius) continue;
        } else if (hyp(dx, dz) > zoneRadius(z, now)) continue;
        const enemy = this.isEnemy(z.owner, c) || (z.burnsOwner && c === z.owner);
        if (z.armAt && now < z.armAt) continue; // orbital strike still charging
        const fx = this.affectable(c);
        if (fx && z.nearsight && this.isEnemy(z.owner, c)) { c.st.nearUntil = now + 0.3; c.st.nearRange = z.nearsight === true ? 7.5 : z.nearsight; }
        if (fx && z.acid && enemy) c.st.vulnUntil = now + 2; // Vulnerable while inside and for 2 s after
        if (fx && z.slowField && this.isEnemy(z.owner, c)) { c.st.slowUntil = now + (z.slowLinger || 0.2); c.st.slowAmt = z.slowField; }
        if (fx && z.toxin && this.isEnemy(z.owner, c) && c.toxinTick !== now) {
          // Toxin is Decay: a hit on first contact, then a steady drain while inside. It can't kill, and the health
          // climbs back once you've been out of the gas for a moment.
          c.toxinTick = now;
          const first = !(c.toxinUntil > now);
          c.toxinUntil = now + 0.25;
          this.decay(c, (first ? z.toxin.first : 0) + z.toxin.rate * DT, { delay: 1.5, rate: 25 });
        }
        if (z.kind === 'fire') {
          if (enemy) {
            c.burn = (c.burn || 0) + z.dps * DT;
            if (c.burn >= 5) { const n = Math.floor(c.burn); c.burn -= n; this.damage(c, z.owner, n, { part: 'body', def: z.def, dist: 0, point: c.eye(), wallbang: false, dot: true }); }
          } else if (z.heal && (!z.healPool || z.healPool.left > 0)) {
            // The owner's own fire heals him; a pool caps the total one cast can give back.
            const h = Math.max(0, Math.min(z.heal * DT, z.healPool ? z.healPool.left : Infinity, Math.max(PLAYER.hp, c.hp) - c.hp));
            c.hp += h;
            if (z.healPool) z.healPool.left -= h;
          }
        } else if (z.kind === 'trap' && fx && this.isEnemy(z.owner, c) && !z.sprung) {
          z.sprung = true;
          z.until = now + 0.6;
          c.st.slowUntil = now + z.dur; c.st.slowAmt = z.slow;
          c.st.revealUntil = now + z.dur;
          this.emit('trap', { zone: z, who: c });
        }
      }
      if (z.kind === 'lockdown' && !z.fired && now >= z.armAt) {
        z.fired = true;
        for (const c of this.combatants) {
          if (!this.affectable(c) || !this.isEnemy(z.owner, c)) continue;
          if (hyp(c.pos[0] - z.pos[0], c.pos[2] - z.pos[2]) > z.r) continue;
          c.st.disarmUntil = now + z.dur;
          c.st.slowUntil = now + z.dur; c.st.slowAmt = z.slow;
        }
        this.emit('lockdown', { zone: z });
      }
    }
    for (let i = 0; i < this.zones.length; i++) if (now >= this.zones[i].until) { this.zones = this.zones.filter(z => now < z.until); break; } // a new list only when one ran out
  }

  // Blind everyone who can see `pos`. How long depends on distance and on how far off the centre of their view it
  // is, by Valorant's curves (VALORANT_SPECS.md, Global constants): `dur` is the ability's maximum. Smokes block it
  // like walls do. Bots on the thrower's team (the thrower too) hear the callout and look away.
  flash(owner, pos, dur) {
    const now = this.time, R2D = 180 / Math.PI;
    // 1 up to x0 degrees off centre, falling to 0.068 at x1; past that only a glance, and nothing from behind.
    const angle = (x, x0, x1) => (x <= x0 ? 1 : x >= 90 ? 0 : x >= x1 ? 0.068 : 1 - 0.932 * (x - x0) / (x1 - x0));
    for (const c of this.combatants) {
      if (!this.affectable(c)) continue;
      if (c.isBot && !this.isEnemy(owner, c)) continue;
      const e = c.eye(), dx = pos[0] - e[0], dy = pos[1] - e[1], dz = pos[2] - e[2];
      const dist = hyp(dx, dy, dz);
      if (!this.canSee(e, pos)) continue;
      const yawOff = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - c.yaw), Math.cos(Math.atan2(-dx, -dz) - c.yaw))) * R2D;
      const pitchOff = Math.abs(Math.atan2(dy, hyp(dx, dz)) - c.pitch) * R2D;
      const k = Math.min(1, (dist >= 60 ? 0.1 : 1.3 - 1.2 * dist / 60) * angle(yawOff, 50, 80) * angle(pitchOff, 34, 75));
      if (dur * k < 0.1) continue; // looking away, or too far for more than a flicker
      c.st.blindUntil = Math.max(c.st.blindUntil, now + dur * k);
      c.st.blindLen = dur * k;
    }
    this.emit('flash', { pos, owner });
  }

  // Area effect that applies a status to enemies within r of pos: stun, near(sight), reveal, suppress, deaf.
  // Join several with '+' ('hold+deaf'). Gives back everyone it caught.
  // opts.flat: a sphere squashed to that share of its height (sonar pulses, 0.4); opts.all: allies and the owner too.
  pulse(owner, pos, r, types, dur, color, needSight = false, opts = {}) {
    const now = this.time, hit = [], flat = opts.flat || 1;
    for (const c of this.combatants) {
      if (!this.affectable(c) || !(opts.all || this.isEnemy(owner, c))) continue;
      if (hyp(c.pos[0] - pos[0], (c.pos[1] + 1 - pos[1]) / flat, c.pos[2] - pos[2]) > r) continue;
      if (needSight && !this.world.lineOfSight(pos, c.eye()) && !this.world.lineOfSight(pos, [c.pos[0], c.pos[1] + 1, c.pos[2]])) continue;
      hit.push(c);
      for (const type of types.split('+')) this.status(c, type, dur, opts);
    }
    this.emit('pulse', { pos, r, type: types.split('+')[0], color, owner });
    return hit;
  }

  // One named status on c for dur seconds.
  // opts.near: how far a nearsighted player still sees (6 m for Leer and Prowler, 7.5 m otherwise).
  status(c, type, dur, opts = {}) {
    const now = this.time;
    if (type === 'deaf') c.st.deafUntil = now + dur;
    if (type === 'stun') this.concuss(c, dur);
    if (type === 'near') { c.st.nearUntil = now + dur; c.st.nearRange = opts.near || 7.5; }
    if (type === 'reveal') c.st.revealUntil = now + dur;
    if (type === 'suppress') { c.st.suppressUntil = now + dur; c.st.revealUntil = now + dur; }
    if (type === 'vuln') { c.st.vulnUntil = now + dur; c.st.revealUntil = now + dur; }
    if (type === 'hold') { c.st.slowUntil = now + dur; c.st.slowAmt = 0.95; c.st.revealUntil = now + dur; }
    if (type === 'hinder') c.st.hinderUntil = now + dur;
  }

  // Concussed for dur seconds: slowed hard at first and easing off, a slower trigger, wilder spray and no aiming
  // down sights (entity.js and gun.js read stunUntil and stunLen).
  concuss(c, dur) {
    c.st.stunUntil = this.time + dur;
    c.st.stunLen = dur;
  }

  // Enemies standing in a flat strip on the ground: from d0 to d1 metres ahead of `from` along `yaw`, `half`
  // metres to either side, through walls (seismic lines, waves, barrages).
  inStrip(owner, from, yaw, d0, d1, half, up = 6) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), out = [];
    for (const c of this.combatants) {
      if (!this.affectable(c) || !this.isEnemy(owner, c)) continue;
      const dx = c.pos[0] - from[0], dz = c.pos[2] - from[2];
      const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      if (along >= d0 && along < d1 && Math.abs(across) <= half && Math.abs(c.pos[1] - from[1]) <= up) out.push(c); // half-open, so back-to-back strips never both take someone on the line between them
    }
    return out;
  }

  // A thrown ability in flight (kind 'proj', moved in tickDevices): starts at the thrower's eye and leaves along
  // the aim at `speed` m/s, falling at 9.8 m/s² times `g`. What a surface does to it is `rule`:
  //   'stick'  stops on the first thing it touches
  //   'floor'  bounces off walls and steep slopes, comes to rest on a floor
  //   'bounce' bounces off anything `bounces` times, then sticks (Infinity: until it runs out of bounce)
  // opts.kind gives it another device kind's look and rules while it flies the same way (a satchel).
  // drop: { at, g } lets it fall straight down after `at` seconds in the air. hitBodies stops it on an enemy.
  // onStop(d, n), onBounce(d, n) and onFuse(d) (after `fuse` seconds, flying or not) are the ability's own.
  throwProj(owner, speed, g, opts = {}) {
    const e = owner.eye(), dir = opts.dir || dirOf(owner.yaw, owner.pitch);
    return this.addDevice({
      kind: 'proj', physics: true, owner, pos: opts.from ? [...opts.from] : [e[0], e[1] - 0.05, e[2]], vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed], g,
      rule: 'floor', bounces: 0, life: 12, color: 0xffffff, ...opts,
    });
  }

  // Area damage: max within `inner` of the centre, falling off to min at the edge (r); needs a clear line to
  // the target's body.
  explode(owner, pos, r, max, min, def, color, hitSelf = false, throughWalls = false, inner = 0) {
    for (const c of this.combatants) {
      if (!c.alive || (!this.isEnemy(owner, c) && !(hitSelf && c === owner))) continue;
      const body = [c.pos[0], c.pos[1] + 1, c.pos[2]];
      const d = hyp(body[0] - pos[0], body[1] - pos[1], body[2] - pos[2]);
      if (d > r || (!throughWalls && !this.world.lineOfSight(pos, body))) continue;
      this.damage(c, owner, Math.round(d <= inner ? max : max - (max - min) * (d - inner) / (r - inner)), { part: 'body', def, dist: d, point: body, wallbang: false });
    }
    this.emit('pulse', { pos, r, type: 'blast', color, owner });
  }

  // Status on every enemy within `width` of the segment a-b, straight through walls.
  // With `height`, the area is a flat strip instead: `width` sideways, `height` up or down.
  lineEffect(owner, a, b, width, type, dur, height) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    for (const c of this.combatants) {
      if (!this.affectable(c) || !this.isEnemy(owner, c)) continue;
      const p = [c.pos[0], c.pos[1] + 1, c.pos[2]];
      let t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len2;
      t = Math.max(0, Math.min(1, t));
      const dy = a[1] + ab[1] * t - p[1];
      const d = hyp(a[0] + ab[0] * t - p[0], height ? 0 : dy, a[2] + ab[2] * t - p[2]);
      if (d > width || (height && Math.abs(dy) > height)) continue;
      for (const t of type.split('+')) this.status(c, t, dur);
    }
  }

  // Gravity well: drag enemies within r toward pos.
  pull(owner, pos, r, speed) {
    for (const c of this.combatants) {
      if (!this.affectable(c) || !this.isEnemy(owner, c)) continue;
      const dx = pos[0] - c.pos[0], dz = pos[2] - c.pos[2], d = hyp(dx, dz);
      if (d > r || d < 0.3) continue;
      c.vel[0] = dx / d * speed; c.vel[2] = dz / d * speed;
      c.st.slowUntil = this.time + 0.3; c.st.slowAmt = 0.7;
    }
  }

  // A map-length wall through `pos`, running along the facing axis (Rift Line).
  divide(owner, pos, yaw, life) {
    const b = this.map.boxes.filter(x => !x.floor && !x.temp);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of b) { x0 = Math.min(x0, q.min[0]); z0 = Math.min(z0, q.min[2]); x1 = Math.max(x1, q.max[0]); z1 = Math.max(z1, q.max[2]); }
    const alongX = Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)); // facing along x -> wall runs along x
    const th = 0.25;
    const min = alongX ? [x0, -1, pos[2] - th] : [pos[0] - th, -1, z0];
    const max = alongX ? [x1, 40, pos[2] + th] : [pos[0] + th, 40, z1];
    // You can walk through it, but it stops bullets and blocks sight.
    const box = { min, max, pen: false, mat: 'wall', temp: true, passable: true };
    const w = { box, owner, until: this.time + life, born: this.time, style: 'cosmic' };
    this.world.boxes.push(box);
    this.walls.push(w);
    this.emit('wall', w);
  }

  // ---- Duel arena (Vanta) ----
  startContract(a, b, dur) {
    if (!this.arena) {
      // A sealed room far off the map: floor, four walls and a couple of low covers.
      const bx = this.map.boxes.filter(x => !x.floor);
      let x1 = -Infinity, z0 = Infinity;
      for (const q of bx) { x1 = Math.max(x1, q.max[0]); z0 = Math.min(z0, q.min[2]); }
      const cx = x1 + 80, cz = z0 + 20, S = 9;
      const mk = (min, max) => ({ min, max, pen: false, mat: 'wall', temp: true, arena: true });
      this.arena = { center: [cx, 0, cz], boxes: [
        mk([cx - S, -1, cz - S], [cx + S, 0, cz + S]),
        mk([cx - S - 0.5, 0, cz - S], [cx - S, 6, cz + S]), mk([cx + S, 0, cz - S], [cx + S + 0.5, 6, cz + S]),
        mk([cx - S, 0, cz - S - 0.5], [cx + S, 6, cz - S]), mk([cx - S, 0, cz + S], [cx + S, 6, cz + S + 0.5]),
        mk([cx - 3, 0, cz - 0.6], [cx - 1.5, 1.2, cz + 0.6]), mk([cx + 1.5, 0, cz - 0.6], [cx + 3, 1.2, cz + 0.6]),
      ] };
    }
    for (const q of this.arena.boxes) this.world.boxes.push(q);
    const c = this.arena.center;
    this.contract = { a, b, until: this.time + dur, backA: [...a.pos], backB: [...b.pos], walls: [] };
    for (const q of this.arena.boxes) { const w = { box: q, owner: a, until: this.time + dur + 1, born: this.time, style: 'arena' }; this.contract.walls.push(w); this.emit('wall', w); }
    this.teleport(a, [c[0], 0, c[2] + 6]); a.yaw = 0;
    this.teleport(b, [c[0], 0, c[2] - 6]); b.yaw = Math.PI;
    this.emit('contract', { a, b });
  }

  tickContract(now) {
    const k = this.contract;
    if (!k || (k.a.alive && k.b.alive && now < k.until)) return;
    for (const [c, back] of [[k.a, k.backA], [k.b, k.backB]]) if (c.alive) this.teleportNear(c, back);
    for (const q of this.arena.boxes) { const i = this.world.boxes.indexOf(q); if (i >= 0) this.world.boxes.splice(i, 1); }
    for (const w of k.walls) { w.removed = true; this.emit('wallGone', w); }
    this.contract = null;
  }

  // Everyone within `range` and `half` radians of the owner's facing, through walls.
  cone(owner, range, half, fn) {
    for (const c of this.combatants) {
      if (!this.affectable(c) || !this.isEnemy(owner, c)) continue;
      const dx = c.pos[0] - owner.pos[0], dz = c.pos[2] - owner.pos[2], d = hyp(dx, dz);
      if (d > range) continue;
      const ang = Math.atan2(-dx, -dz), off = Math.abs(Math.atan2(Math.sin(ang - owner.yaw), Math.cos(ang - owner.yaw)));
      if (off <= half) fn(c);
    }
  }

  // Push everyone within r of pos away from it (and up): blast satchels.
  knockback(owner, pos, r, power, up) {
    for (const c of this.combatants) {
      if (!c.alive) continue;
      const dx = c.pos[0] - pos[0], dz = c.pos[2] - pos[2], dy = c.pos[1] + 1 - pos[1];
      const d = hyp(dx, dy, dz);
      if (d > r) continue;
      const h = hyp(dx, dz) || 1;
      const k = 1 - 0.5 * d / r;
      c.vel[0] = dx / h * power * k;
      c.vel[2] = dz / h * power * k;
      c.vel[1] = up * (0.6 + 0.4 * k);
      c.grounded = false;
      c.airCap = hyp(c.vel[0], c.vel[2]);
      c.dash = null;
    }
    this.emit('pulse', { pos, r, type: 'blast', color: 0xffb547, owner });
  }

  // A beam across the whole map that ignores walls.
  beam(owner, o, d, B) {
    const now = this.time;
    for (const c of this.combatants) {
      if (!c.alive || !this.isEnemy(owner, c)) continue;
      const p = [c.pos[0], c.pos[1] + 1.1, c.pos[2]];
      const t = (p[0] - o[0]) * d[0] + (p[1] - o[1]) * d[1] + (p[2] - o[2]) * d[2];
      if (t < 0 || t > (B.range || Infinity)) continue;
      const dist = hyp(o[0] + d[0] * t - p[0], (o[1] + d[1] * t - p[1]) * 0.6, o[2] + d[2] * t - p[2]);
      if (dist > B.width) continue;
      if (this.affectable(c)) c.st.revealUntil = now + (B.reveal ?? 2);
      this.damage(c, owner, B.dmg, { part: 'body', def: B, dist: t, point: p, wallbang: true });
    }
    const len = B.range || 140;
    this.emit('beam', { who: owner, from: o, to: [o[0] + d[0] * len, o[1] + d[1] * len, o[2] + d[2] * len] });
  }

  // Free floor for a player at pos (pos is the feet).
  canStand(c, pos) {
    const r = PLAYER.radius;
    if (this.world.overlap(pos[0] - r, pos[1] + 0.05, pos[2] - r, pos[0] + r, pos[1] + PLAYER.standHeight, pos[2] + r)) return false;
    const f = this.world.raycast([pos[0], pos[1] + 0.3, pos[2]], [0, -1, 0], 1.0);
    return !!f;
  }

  // Floor point under map coordinates x, z (highest surface), or null. With `fromY`, the first floor below
  // that height instead: under a roof or a bridge that is the floor you're on, not the roof.
  floorAt(x, z, fromY = 30) {
    const f = this.world.raycast([x, fromY, z], [0, -1, 0], 40);
    return f ? [x, fromY - f.t, z] : null;
  }

  // Placed gadgets: drone (flies and tags), alarm (chases and makes Vulnerable), turret, swarm (hidden).
  addDevice(d) {
    if (SHOOTABLE[d.kind]) d.hp = SHOOTABLE[d.kind].hp;
    d.born = this.time;
    d.until = this.time + d.life;
    d.next = d.next || 0;
    this.devices.push(d);
    this.emit('device', d);
    return d;
  }

  tickDevices(now) {
    if (!this.devices.length) return;
    const enemiesOf = (d) => this.combatants.filter(c => this.affectable(c) && this.isEnemy(d.owner, c));
    for (const d of this.devices) {
      if (now >= d.until) d.removed = true;
      if (d.removed) continue;
      if (d.flight) { // thrown and still in the air: it follows the same arc a thrown ability is drawn on
        const f = d.flight, k = Math.min(1, (now - d.born) / f.time);
        const lift = Math.sin(k * Math.PI) * Math.min(2, hyp(f.to[0] - f.from[0], f.to[2] - f.from[2]) * 0.12);
        d.pos = [f.from[0] + (f.to[0] - f.from[0]) * k, f.from[1] + (f.to[1] - f.from[1]) * k + lift, f.from[2] + (f.to[2] - f.from[2]) * k];
        if (k >= 1) d.flight = null;
      }
      if (d.physics) { this.tickProj(d, now); if (d.kind === 'proj') continue; } // thrown: flies by throwProj's rules
      if (d.kind === 'sweep') {
        // Something that travels through walls and touches each player once as it passes (waves, bolts, columns).
        const step = d.speed * DT;
        d.pos = [d.pos[0] + d.dir[0] * step, d.pos[1] + d.dir[1] * step, d.pos[2] + d.dir[2] * step];
        d.travelled += step;
        d.onMove?.(d);
        for (const c of this.combatants) {
          // d.all: teammates in the way are caught too (allied bots know to step aside, as with flashes).
          if (d.seen.has(c) || !this.affectable(c) || !(this.isEnemy(d.owner, c) || (d.all && c !== d.owner && !c.isBot))) continue;
          if (d.hit ? !d.hit(c, d) : hyp(c.pos[0] - d.pos[0], c.pos[1] + 1 - d.pos[1], c.pos[2] - d.pos[2]) > d.r) continue;
          d.seen.add(c);
          if (d.apply(c, d) === 'stop') { d.removed = true; break; }
        }
        if (d.travelled >= d.range) d.removed = true;
        continue;
      }
      if (d.kind === 'drone') {
        const step = d.speed * DT, nx = [d.pos[0] + d.dir[0] * step, d.pos[1] + d.dir[1] * step, d.pos[2] + d.dir[2] * step];
        const ahead = [d.pos[0] + d.dir[0] * 0.5, d.pos[1] + d.dir[1] * 0.5, d.pos[2] + d.dir[2] * 0.5];
        if (this.world.lineOfSight(d.pos, ahead)) d.pos = nx;
        if (now >= d.next) {
          d.next = now + 0.25;
          for (const c of enemiesOf(d)) {
            if (hyp(c.pos[0] - d.pos[0], c.pos[2] - d.pos[2]) < 25 && this.world.lineOfSight(d.pos, c.eye())) {
              if (c.st.revealUntil < now + 0.5) this.emit('tag', { pos: c.eye() });
              c.st.revealUntil = now + 3;
            }
          }
        }
      } else if (d.kind === 'alarm') {
        if (now < d.armAt || this.sentinelOff(d, now)) continue;
        if (!d.target) {
          for (const c of enemiesOf(d)) {
            if (hyp(c.pos[0] - d.pos[0], c.pos[2] - d.pos[2]) < 6 && this.world.lineOfSight([d.pos[0], d.pos[1] + 0.4, d.pos[2]], c.eye())) {
              d.target = c; d.chaseUntil = now + 4; this.emit('alarm', { pos: d.pos }); break;
            }
          }
        } else {
          const c = d.target, dx = c.pos[0] - d.pos[0], dz = c.pos[2] - d.pos[2], dist = hyp(dx, dz);
          if (!c.alive || now > d.chaseUntil) { d.removed = true; continue; }
          if (dist < 2.5) {
            c.st.vulnUntil = now + 4;
            d.removed = true;
            this.emit('pulse', { pos: [d.pos[0], d.pos[1] + 0.5, d.pos[2]], r: 2, type: 'vuln', color: 0x4fd1a5, owner: d.owner });
          } else {
            d.pos[0] += dx / dist * 9 * DT; // 50% faster since patch 13.00
            d.pos[2] += dz / dist * 9 * DT;
            const f = this.floorAt(d.pos[0], d.pos[2], d.pos[1] + 0.6); // up steps, down drops
            if (f && f[1] - d.pos[1] > -3) d.pos[1] = f[1];
          }
        }
      } else if (d.kind === 'boombot') {
        // Rolls forward, bounces off walls, locks onto the first enemy in front of it (within 15 m) and explodes when
        // it gets within 2.5 m. It takes 0.5 s to unpack first.
        if (now < d.born + 0.5) continue;
        if (!d.target) {
          for (const c of enemiesOf(d)) {
            const dx = c.pos[0] - d.pos[0], dz = c.pos[2] - d.pos[2], dist = hyp(dx, dz);
            if (dist < 15 && (dx * d.dir[0] + dz * d.dir[2]) / dist > 0.5 && this.world.lineOfSight([d.pos[0], d.pos[1] + 0.3, d.pos[2]], c.eye())) { d.target = c; this.emit('alarm', { pos: d.pos }); break; }
          }
        }
        let sp = 6;
        if (d.target) {
          const c = d.target, dx = c.pos[0] - d.pos[0], dz = c.pos[2] - d.pos[2], dist = hyp(dx, dz);
          if (!c.alive) d.target = null;
          else {
            if (dist < 2.5 && Math.abs(c.pos[1] - d.pos[1]) < 5) { d.removed = true; this.explode(d.owner, [d.pos[0], d.pos[1] + 0.4, d.pos[2]], 6, 80, 30, BOOMER, 0xffb547, false, false, 2); continue; }
            d.dir = [dx / dist, 0, dz / dist]; sp = 8;
          }
        }
        // Climbs steps up to 0.45 m and rolls off ledges, checking the body clears walls at the height it ends up at.
        for (const ax of [0, 2]) {
          const np = [...d.pos]; np[ax] += d.dir[ax] * sp * DT;
          // Its front edge reaches a step first and its back edge leaves a ledge last: it rides the highest floor under it.
          const lead = [...np], trail = [...np]; lead[ax] += Math.sign(d.dir[ax]) * 0.2; trail[ax] -= Math.sign(d.dir[ax]) * 0.2;
          const ys = [trail, np, lead].map(q => this.floorAt(q[0], q[2], d.pos[1] + 0.6)).filter(f => f && f[1] - d.pos[1] > -3).map(f => f[1]);
          const y = ys.length ? Math.max(...ys) : d.pos[1];
          if (this.world.overlap(np[0] - 0.2, y + 0.05, np[2] - 0.2, np[0] + 0.2, y + 0.5, np[2] + 0.2)) d.dir[ax] = -d.dir[ax];
          else { d.pos[ax] = np[ax]; d.pos[1] = y; }
        }
      } else if (d.kind === 'cloud') {
        // Veil's orb flies at 29 m/s. While the key is held it steers toward the crosshair; let go and it falls
        // (gravity x0.45). It bursts into smoke on the first surface it meets, or after 2 s in the air.
        const held = !d.released && d.owner.alive && d.owner.input[d.key];
        if (held) {
          const want = dirOf(d.owner.yaw, d.owner.pitch);
          for (let i = 0; i < 3; i++) d.dir[i] += (want[i] - d.dir[i]) * Math.min(1, 6 * DT);
          const l = hyp(d.dir[0], d.dir[1], d.dir[2]); d.dir = d.dir.map(v => v / l);
          d.vel = d.dir.map(v => v * d.speed);
        } else {
          d.released = true;
          d.vel[1] -= 9.8 * 0.45 * DT;
          const l = hyp(d.vel[0], d.vel[1], d.vel[2]) || 1; d.dir = d.vel.map(v => v / l);
        }
        const np = [d.pos[0] + d.vel[0] * DT, d.pos[1] + d.vel[1] * DT, d.pos[2] + d.vel[2] * DT];
        const hit = !this.world.lineOfSight(d.pos, [np[0] + d.dir[0] * 0.4, np[1] + d.dir[1] * 0.4, np[2] + d.dir[2] * 0.4]);
        if (!hit) d.pos = np;
        if (hit || now + DT >= d.until) {
          d.removed = true;
          this.addSmoke(d.owner, [...d.pos], now, { radius: d.radius, life: d.smokeLife, color: d.color });
        }
      } else if (d.kind === 'trademark') {
        // Snare: spots an enemy it can see within 10 m (4 m above it, 10 m below), and 0.9 s later breaks the ground
        // around itself into a slowing field. It resets 10 s after going off.
        if (now < d.armAt) continue;
        if (!d.seenAt) {
          const eye = [d.pos[0], d.pos[1] + 0.4, d.pos[2]];
          const c = enemiesOf(d).find(c => hyp(c.pos[0] - d.pos[0], c.pos[2] - d.pos[2]) < 10 && c.pos[1] - d.pos[1] < 4 && d.pos[1] - c.pos[1] < 10 && this.world.lineOfSight(eye, c.eye()));
          if (c) { d.seenAt = now; this.emit('alarm', { pos: d.pos }); }
        } else if (now >= d.seenAt + 0.9) {
          d.seenAt = 0;
          d.armAt = now + 10;
          this.addZone({ kind: 'slowfield', color: 0xe8c26a, owner: d.owner, pos: [...d.pos], r: 6, life: 6, slowField: 0.5 }, now);
        }
      } else if (d.kind === 'pushwall') {
        // Contingency: the wall slides forward until it hits something.
        const b = d.wall.box, step = (d.speed || 4) * DT;
        if (d.wall.removed) { d.removed = true; continue; }
        const nmin = [b.min[0] + d.dir[0] * step, b.min[1], b.min[2] + d.dir[2] * step], nmax = [b.max[0] + d.dir[0] * step, b.max[1], b.max[2] + d.dir[2] * step];
        const e = 0.02;
        let hit = this.world.boxes.some(q => q !== b && !q.floor && !q.passable && nmin[0] < q.max[0] - e && nmax[0] > q.min[0] + e && nmin[1] + 0.3 < q.max[1] && nmax[1] > q.min[1] && nmin[2] < q.max[2] - e && nmax[2] > q.min[2] + e);
        if (hit) { d.removed = true; continue; } // players don't stop it: they can walk through
        b.min = nmin; b.max = nmax;
      } else if (d.kind === 'blaze') {
        // Growing fire wall: the head moves forward, bending toward where you look while you hold the key.
        if (d.owner.input[d.key] && d.owner.alive) {
          const diff = Math.atan2(Math.sin(d.owner.yaw - d.yaw), Math.cos(d.owner.yaw - d.yaw));
          d.yaw += Math.max(-1.6 * DT, Math.min(1.6 * DT, diff)); // ~90 degrees a second
        }
        const step = d.speed * DT, nx = d.pos[0] - Math.sin(d.yaw) * step, nz = d.pos[2] - Math.cos(d.yaw) * step;
        let f = this.floorAt(nx, nz, d.pos[1] + 0.6);
        if (d.through) { const g0 = this.world.raycast([nx, d.pos[1] + 0.5, nz], [0, -1, 0], 6); f = g0 ? [nx, d.pos[1] + 0.5 - g0.t, nz] : null; } // flows along the ground, through walls
        const blocked = !f || (!d.through && (f[1] > d.pos[1] + 0.5 || this.world.overlap(nx - 0.2, d.pos[1] + 0.5, nz - 0.2, nx + 0.2, d.pos[1] + 1.5, nz + 0.2)));
        if (blocked || d.travelled >= (d.maxDist || 15) || (d.stopKey && d.travelled > 2 && d.owner.input[d.stopKey])) { d.removed = true; continue; } // Riptide: right click stops it
        d.pos = [nx, f[1], nz];
        d.travelled += step;
        if (d.seg && d.travelled >= d.nextSeg) {
          d.nextSeg += d.seg.spacing;
          const h = d.h || SLAB.h;
          this.addSmoke(d.owner, d.seg.slab ? [nx, f[1] + h / 2, nz] : [nx, f[1] + 1.2, nz], now, d.seg.slab ? { ...d.seg.smoke, slab: { dir: [-Math.sin(d.yaw), -Math.cos(d.yaw)], len: d.seg.spacing + 0.2, th: SLAB.th, h } } : d.seg.smoke);
          this.addZone({ ...d.seg.zone, owner: d.owner, pos: [nx, f[1], nz] }, now);
        } else if (!d.seg && d.travelled >= d.nextSeg) {
          d.nextSeg += 1.25;
          const h = d.h || SLAB.h;
          this.addSmoke(d.owner, [nx, f[1] + h / 2, nz], now, { radius: 1, life: 8, color: 0xff7a2e, kind: 'fire', slab: { dir: [-Math.sin(d.yaw), -Math.cos(d.yaw)], len: 1.45, th: SLAB.th, h } });
          // Firebreak heals its owner 1 HP every 0.16 s, up to 50 from one wall.
          this.addZone({ kind: 'fire', owner: d.owner, pos: [nx, f[1], nz], r: 0.75, life: 8, dps: 30, heal: 6.25, healPool: d.pool, def: { id: 'firebreak', name: 'Firebreak', cat: 'Ability', dmg: [[50, 0, 0, 0]] } }, now);
        }
      } else if (d.kind === 'decoy' || d.kind === 'gate' || d.kind === 'tiger' || d.kind === 'prowler') {
        // Ground runners. Steered ones follow the owner's aim.
        if (d.still) continue; // a rift left in place
        if (d.steer && d.owner.alive) { const yaw = d.owner.yaw; d.dir = [-Math.sin(yaw), 0, -Math.cos(yaw)]; }
        let sp = d.kind === 'gate' ? 8 : d.kind === 'decoy' ? 5.6 : d.kind === 'tiger' ? 6.4 : 10;
        if (d.kind === 'prowler') {
          // Hunts the first enemy it sees ahead of it within 15 m (12 m/s), or one marked by a terror trail within
          // 10 m, seen or not (15 m/s). It bites from 2.5 m: nearsighted for 2.75 s.
          if (!d.target) {
            for (const c of enemiesOf(d)) {
              const dx = c.pos[0] - d.pos[0], dz = c.pos[2] - d.pos[2], dist = hyp(dx, dz);
              const trail = c.st.trailUntil > now && dist < 10;
              if (trail || (dist < 15 && (dx * d.dir[0] + dz * d.dir[2]) / dist > 0.5 && this.world.lineOfSight([d.pos[0], d.pos[1] + 0.4, d.pos[2]], c.eye()))) { d.target = c; d.onTrail = trail; d.steer = false; d.until = now + 4; break; }
            }
          }
          if (d.target) {
            const c = d.target, dx = c.pos[0] - d.pos[0], dz = c.pos[2] - d.pos[2], dist = hyp(dx, dz);
            if (!c.alive) { d.removed = true; continue; }
            if (dist < 2.5) {
              if (!d.biteAt) d.biteAt = now + 0.6; // winds up before it bites
              if (now >= d.biteAt) { this.status(c, 'near', 2.75, { near: 6 }); d.removed = true; this.emit('pulse', { pos: c.eye(), r: 1.5, type: 'near', color: 0xb07a9a, owner: d.owner }); }
              continue;
            }
            d.biteAt = 0;
            d.dir = [dx / dist, 0, dz / dist]; sp = d.onTrail ? 15 : 12;
          }
        }
        if (d.kind === 'decoy' && now >= d.armAt) {
          // Shooting the decoy sets it off (breakUtil). Bots take the bait: one that looks at it "shoots" it.
          for (const c of enemiesOf(d)) {
            if (!c.isBot) continue;
            const e = c.eye(), body = [d.pos[0], d.pos[1] + 1, d.pos[2]], dx = body[0] - e[0], dy = body[1] - e[1], dz = body[2] - e[2], dist = hyp(dx, dy, dz);
            if (dist > 25 || !this.world.lineOfSight(e, body)) continue;
            const f = dirOf(c.yaw, c.pitch);
            if ((f[0] * dx + f[1] * dy + f[2] * dz) / dist > 0.6) { this.breakUtil(d); break; }
          }
          if (d.removed) continue;
        }
        if (d.kind === 'tiger' && d.leap) {
          // Leap: up to 12 m along its facing. The first enemy in the way takes 30; everyone within 3.5 m of where
          // it lands is concussed, 4 s at the centre down to 2.5 s at the edge. Then it's gone.
          d.removed = true;
          d.leapt = true;
          const from = [d.pos[0], d.pos[1] + 0.6, d.pos[2]];
          const wall = this.world.raycast(from, d.dir, 12);
          let reach = wall ? Math.max(0, wall.t - 0.3) : 12, struck = null;
          for (const c of enemiesOf(d)) {
            const along = (c.pos[0] - from[0]) * d.dir[0] + (c.pos[2] - from[2]) * d.dir[2];
            if (along < 0 || along > reach || Math.abs(c.pos[1] - d.pos[1]) > 1.5) continue;
            if (hyp(c.pos[0] - from[0] - d.dir[0] * along, c.pos[2] - from[2] - d.dir[2] * along) < 0.9) { reach = along; struck = c; }
          }
          const p = [from[0] + d.dir[0] * reach, from[1], from[2] + d.dir[2] * reach];
          if (struck) this.damage(struck, d.owner, 30, { part: 'body', def: { id: 'stalker', name: 'Stalker', cat: 'Ability', dmg: [[50, 0, 0, 0]] }, dist: reach, point: struck.eye(), wallbang: false });
          for (const c of enemiesOf(d)) {
            const dist = hyp(c.pos[0] - p[0], c.pos[1] + 0.6 - p[1], c.pos[2] - p[2]);
            if (dist <= 3.5) this.concuss(c, 4 - 1.5 * dist / 3.5);
          }
          this.emit('pulse', { pos: p, r: 3.5, type: 'stun', color: 0x9be15d, owner: d.owner });
          continue;
        }
        let blocked = false;
        for (const ax of [0, 2]) {
          const np = [...d.pos]; np[ax] += d.dir[ax] * sp * DT;
          if (this.world.overlap(np[0] - 0.25, np[1] + 0.4, np[2] - 0.25, np[0] + 0.25, np[1] + 1.2, np[2] + 0.25)) blocked = true;
          else d.pos[ax] = np[ax];
        }
        const f = this.floorAt(d.pos[0], d.pos[2], d.pos[1] + 0.6);
        if (f && f[1] - d.pos[1] > -3) d.pos[1] = f[1];
      } else if (d.kind === 'owl') {
        // Flown with WASD (relative to where you look) plus the mouse; Space rises, crouch sinks.
        const pin = d.owner.kit?.pilotInput || {}, yaw = d.owner.yaw, pitch = d.owner.pitch;
        const f = dirOf(yaw, pitch), r = [Math.cos(yaw), 0, -Math.sin(yaw)];
        const v = [0, 0, 0];
        for (let i = 0; i < 3; i++) v[i] = f[i] * (pin.fwd || 0) + r[i] * (pin.side || 0);
        v[1] += (pin.jumpHeld ? 1 : 0) - (pin.crouch ? 1 : 0);
        const l = hyp(v[0], v[1], v[2]);
        if (l > 0) {
          const sp = 7 * DT, np = [d.pos[0] + v[0] / l * sp, d.pos[1] + v[1] / l * sp, d.pos[2] + v[2] / l * sp];
          if (!this.world.overlap(np[0] - 0.2, np[1] - 0.15, np[2] - 0.2, np[0] + 0.2, np[1] + 0.15, np[2] + 0.2)) d.pos = np;
        }
        d.dir = [f[0], f[1], f[2]];
      } else if (d.kind === 'hawk' || d.kind === 'sdrone') {
        if (d.owner.alive) {
          const want = dirOf(d.owner.yaw, d.owner.pitch);
          for (let i = 0; i < 3; i++) d.dir[i] += (want[i] - d.dir[i]) * Math.min(1, 4 * DT);
          const l = hyp(d.dir[0], d.dir[1], d.dir[2]); d.dir = d.dir.map(v => v / l);
        }
        const np = [d.pos[0] + d.dir[0] * d.speed * DT, d.pos[1] + d.dir[1] * d.speed * DT, d.pos[2] + d.dir[2] * d.speed * DT];
        if (this.world.lineOfSight(d.pos, np)) d.pos = np;
        if (d.kind === 'hawk' && now + DT >= d.until) { d.removed = true; this.flash(d.owner, [...d.pos], 2.25); } // bursts on its own, after its full 2 s flight
      } else if (d.kind === 'seeker') {
        const c = d.target;
        if (!c.alive) { d.removed = true; continue; }
        const t = c.eye(), dx = t[0] - d.pos[0], dy = t[1] - 0.4 - d.pos[1], dz = t[2] - d.pos[2], dist = hyp(dx, dy, dz);
        if (dist < 1.2) { this.status(c, 'near', 3, { near: 7.5 }); d.removed = true; this.emit('pulse', { pos: t, r: 1.5, type: 'near', color: 0x9be15d, owner: d.owner }); continue; }
        const sp = 6.4 * DT;
        d.pos = [d.pos[0] + dx / dist * sp, d.pos[1] + dy / dist * sp, d.pos[2] + dz / dist * sp];
      } else if (d.kind === 'wire') {
        // Tripline: an enemy who crosses it is tethered and slowed. 0.7 s later the wire zaps them (a 1 s slow and
        // they stay revealed while held); tearing free by getting more than 6.2 m away costs a zap too. Shooting the
        // wire frees them clean. It resets a second after letting go.
        if (now < (d.armAt || 0)) continue;
        const zap = (c) => { c.st.slowUntil = now + 1; c.st.slowAmt = 0.5; c.st.revealUntil = Math.max(c.st.revealUntil, now + 1); this.emit('pulse', { pos: c.eye(), r: 1.2, type: 'stun', color: 0xd8dde6, owner: d.owner }); };
        const v = d.victim;
        if (v) {
          if (!this.affectable(v)) { d.victim = null; d.armAt = now + 1; continue; }
          if (hyp(v.pos[0] - d.hold[0], v.pos[2] - d.hold[2]) > 6.2) { zap(v); d.victim = null; d.armAt = now + 1; continue; }
          if (!d.zapped && now >= d.caughtAt + 0.7) { d.zapped = true; zap(v); }
          if (d.zapped) v.st.revealUntil = Math.max(v.st.revealUntil, now + 0.3);
          if (!(v.st.slowUntil > now + 0.15)) { v.st.slowUntil = now + 0.15; v.st.slowAmt = 0.5; }
          continue;
        }
        for (const c of enemiesOf(d)) {
          const ax = d.b[0] - d.pos[0], az = d.b[2] - d.pos[2], len2 = ax * ax + az * az;
          let t = ((c.pos[0] - d.pos[0]) * ax + (c.pos[2] - d.pos[2]) * az) / len2;
          if (t < 0 || t > 1) continue;
          const px = d.pos[0] + ax * t - c.pos[0], pz = d.pos[2] + az * t - c.pos[2];
          if (hyp(px, pz) > 0.45 || d.pos[1] < c.pos[1] - 0.05 || d.pos[1] > c.pos[1] + c.height) continue; // the wire has to cross the body
          d.victim = c; d.caughtAt = now; d.zapped = false;
          d.hold = [d.pos[0] + ax * t, d.pos[1], d.pos[2] + az * t];
          this.emit('alarm', { pos: d.pos });
          break;
        }
      } else if (d.kind === 'cam') {
        const ownerView = d.owner.kit?.view === d;
        if (ownerView) {
          for (const c of enemiesOf(d)) if (hyp(c.pos[0] - d.pos[0], c.pos[2] - d.pos[2]) < 40 && this.world.lineOfSight(d.pos, c.eye())) c.st.revealUntil = now + 0.25;
        }
        if (d.dart) {
          if (now >= d.dart.until || !d.dart.target.alive) d.dart = null;
          else if (now >= d.dart.next) { d.dart.next = now + 2; d.dart.target.st.revealUntil = now + 1; this.emit('tag', { pos: d.dart.target.eye() }); }
        }
      } else if (d.kind === 'leer') {
        // Nearsights anyone looking at it from up to 47.5 m, once it has opened (0.4 s after it arrives).
        if (now < d.born + 0.4) continue;
        for (const c of enemiesOf(d)) {
          const e = c.eye(), dx = d.pos[0] - e[0], dy = d.pos[1] - e[1], dz = d.pos[2] - e[2], dist = hyp(dx, dy, dz);
          if (dist > 47.5 || !this.world.lineOfSight(e, d.pos)) continue;
          const f = dirOf(c.yaw, c.pitch);
          if ((f[0] * dx + f[1] * dy + f[2] * dz) / dist > 0.35) this.status(c, 'near', 0.4, { near: 6 });
        }
      } else if (d.kind === 'turret') {
        // Sentry: watches a 100 degree cone out to 40 m and fires three-round bursts (12 shots a second, a second
        // between bursts). 8 damage a shot within 20 m, 6 to 35 m, 4 beyond; each hit slows by half for a moment.
        if (this.sentinelOff(d, now) || now < d.next) continue;
        const head = [d.pos[0], d.pos[1] + 0.75, d.pos[2]];
        let best = null, bestD = 40;
        for (const c of enemiesOf(d)) {
          const body = [c.pos[0], c.pos[1] + 1.1, c.pos[2]];
          const dx = body[0] - head[0], dz = body[2] - head[2], dist = hyp(dx, dz);
          if (dist > bestD) continue;
          const ang = Math.atan2(-dx, -dz), off = Math.abs(Math.atan2(Math.sin(ang - d.yaw), Math.cos(ang - d.yaw)));
          if (off > 50 * Math.PI / 180 || !this.world.lineOfSight(head, body)) continue;
          best = { c, body, ang }; bestD = dist;
        }
        if (!best) { d.burst = 0; continue; }
        d.aimYaw = best.ang;
        d.burst = (d.burst || 0) + 1;
        if (d.burst >= 3) { d.burst = 0; d.next = now + 1; } else d.next = now + 1 / 12;
        const hit = Math.random() < 0.7;
        const to = hit ? best.body : [best.body[0] + (Math.random() - 0.5) * 1.2, best.body[1] + (Math.random() - 0.3) * 0.8, best.body[2] + (Math.random() - 0.5) * 1.2];
        this.emit('tracer', { who: d.owner, gun: { def: TURRET }, from: head, to, device: true });
        this.emit('turretShot', { pos: head });
        if (hit) {
          this.damage(best.c, d.owner, bestD <= 20 ? 8 : bestD <= 35 ? 6 : 4, { part: 'body', def: TURRET, dist: bestD, point: best.body, wallbang: false, dot: true });
          if (!(best.c.st.slowUntil > now + 0.5)) { best.c.st.slowUntil = now + 0.5; best.c.st.slowAmt = 0.5; }
        }
      }
    }
    if (this.devices.some(d => d.removed)) this.devices = this.devices.filter(d => !d.removed);
  }

  // One tick of a thrown ability's flight (see throwProj).
  tickProj(d, now) {
    const t = now - d.born;
    if (d.fuse != null && t >= d.fuse) { d.removed = true; d.onFuse?.(d); return; }
    if (d.rest) return;
    if (d.drop && !d.dropped && t >= d.drop.at) { d.dropped = true; d.vel = [0, Math.min(0, d.vel[1]), 0]; d.g = d.drop.g; }
    d.vel[1] -= 9.8 * d.g * DT;
    const stop = (n, body) => { d.rest = true; d.vel = [0, 0, 0]; d.onStop?.(d, n, body); };
    let left = DT;
    for (let i = 0; i < 4 && left > 1e-6; i++) {
      const sp = hyp(d.vel[0], d.vel[1], d.vel[2]);
      if (sp < 1e-4) break;
      const dir = [d.vel[0] / sp, d.vel[1] / sp, d.vel[2] / sp], len = sp * left;
      const move = (m) => { d.pos = [d.pos[0] + dir[0] * m, d.pos[1] + dir[1] * m, d.pos[2] + dir[2] * m]; };
      const wall = this.world.raycastAll(d.pos, dir, len + 0.06).find(h => !h.box.passable); // energy walls let it through
      let body = null, bt = wall ? wall.tIn : len;
      if (d.hitBodies) for (const c of this.combatants) {
        if (!this.affectable(c) || !this.isEnemy(d.owner, c)) continue;
        const r = c.rayHit(d.pos, dir, bt);
        if (r && r.t <= bt) { bt = r.t; body = c; }
      }
      if (body) { move(Math.max(0, bt - 0.05)); stop(null, body); return; }
      if (!wall) { move(len); return; }
      const tt = Math.max(0, wall.tIn - 0.05), n = wall.n;
      move(tt);
      left -= tt / sp;
      if (d.rule === 'stick' || (d.rule === 'floor' && n[1] > FLOOR_NY) || (d.rule === 'bounce' && d.bounces <= 0)) { stop(n); return; }
      // Bounce: the part of the velocity going into the surface comes back weaker, the rest loses a little to friction.
      const dot = d.vel[0] * n[0] + d.vel[1] * n[1] + d.vel[2] * n[2], e = d.bounce ?? 0.45, f = d.friction ?? 0.75;
      for (let k = 0; k < 3; k++) d.vel[k] = (d.vel[k] - dot * n[k]) * f - e * dot * n[k];
      if (d.rule === 'bounce') d.bounces--;
      d.onBounce?.(d, n);
      if (d.removed || d.rest) return;
      if (n[1] > FLOOR_NY && hyp(d.vel[0], d.vel[1], d.vel[2]) < 1.2) { stop(n); return; } // out of bounce: it lies there
    }
  }

  // Start something travelling through walls from `pos` along `dir` at `speed` for `range` metres (kind 'sweep').
  // It touches each player once: within opts.r of it, or by opts.hit(c, d); opts.apply(c, d) is what it does.
  sweep(owner, pos, dir, speed, range, opts) {
    return this.addDevice({ kind: 'sweep', owner, pos: [...pos], dir, speed, range, travelled: 0, seen: new Set(), life: range / speed + 0.5, ...opts });
  }

  // Bastion's gadgets switch off while she is more than 40 m away, and take 2 s to come back on.
  sentinelOff(d, now) {
    if (hyp(d.owner.pos[0] - d.pos[0], d.owner.pos[2] - d.pos[2]) > 40) d.offUntil = now + 2;
    d.off = now < (d.offUntil || 0);
    return d.off;
  }

  revealAll(owner, dur) {
    for (const c of this.combatants) if (this.affectable(c) && this.isEnemy(owner, c)) c.st.revealUntil = this.time + dur;
    this.emit('pulse', { pos: owner.eye(), r: 90, type: 'reveal', color: 0xffd54a, owner });
  }

  teleport(c, pos) {
    const r = PLAYER.radius;
    if (this.world.overlap(pos[0] - r, pos[1] + 0.05, pos[2] - r, pos[0] + r, pos[1] + c.height, pos[2] + r)) return false;
    const from = [...c.pos];
    c.pos = [...pos];
    c.prevPos = [...pos];
    c.prevEyeY = pos[1] + c.eyeOff;
    c.vel = [0, 0, 0];
    this.emit('teleport', { who: c, from, to: pos });
    return true;
  }

  // Teleport to the closest free standing spot around `pos` (so a rift next to a wall still works).
  teleportNear(c, pos) {
    for (const r of [0, 0.4, 0.8, 1.2]) {
      for (let a = 0; a < (r ? 8 : 1); a++) {
        const p = [pos[0] + Math.cos(a * Math.PI / 4) * r, pos[1], pos[2] + Math.sin(a * Math.PI / 4) * r];
        const f = this.floorAt(p[0], p[2], pos[1] + 0.9);
        if (f && Math.abs(f[1] - pos[1]) < 1 && this.canStand(c, f)) return this.teleport(c, f);
      }
    }
    return false;
  }

  // A solid wall across the aim direction (axis-aligned, like the rest of the map).
  // Walls are thin (0.3 m, about half a player) and tall (3.9 m, about twice a player).
  // Solid deployable walls. `lift`: anyone standing where it rises is carried up onto it (boosting).
  // `segments`: built as that many pieces side by side, each with `hp` health that enemy bullets wear down
  // (Frost Wall); `fortify` more health is added to each piece still standing 2 s after it rises.
  addWall(owner, pos, yaw, life, { half = 2.5, th = 0.2, h = 3, style = 'bulwark', lift = false, passable = false, segments = 0, hp = 0, fortify = 0 } = {}) {
    const alongX = Math.abs(Math.cos(yaw)) > Math.abs(Math.sin(yaw)); // facing along z -> wall spans x
    const min = [pos[0] - (alongX ? half : th), pos[1], pos[2] - (alongX ? th : half)];
    const max = [pos[0] + (alongX ? half : th), pos[1] + h, pos[2] + (alongX ? th : half)];
    const lifted = [];
    for (const c of this.combatants) {
      if (!c.alive) continue;
      const r = PLAYER.radius;
      if (!passable && c.pos[0] + r > min[0] && c.pos[0] - r < max[0] && c.pos[2] + r > min[2] && c.pos[2] - r < max[2] &&
          c.pos[1] + c.height > min[1] && c.pos[1] < max[1]) {
        if (!lift) return false; // would trap someone
        // Only the middle of a lifting wall boosts; a player touching just the edge would get clipped.
        lifted.push(c);
      }
    }
    for (const c of lifted) {
      if (this.world.overlap(c.pos[0] - PLAYER.radius, max[1] + 0.02, c.pos[2] - PLAYER.radius, c.pos[0] + PLAYER.radius, max[1] + c.height, c.pos[2] + PLAYER.radius)) return false;
    }
    for (const c of lifted) { c.stepSmooth -= max[1] - c.pos[1]; c.pos[1] = max[1]; c.prevPos[1] = max[1]; c.vel[1] = 0; c.grounded = true; }
    let first = null;
    const ax = alongX ? 0 : 2, n = segments || 1, len = (max[ax] - min[ax]) / n;
    for (let i = 0; i < n; i++) {
      const bmin = [...min], bmax = [...max];
      bmin[ax] = min[ax] + i * len; bmax[ax] = min[ax] + (i + 1) * len;
      const box = { min: bmin, max: bmax, pen: false, mat: 'wall', temp: true, passable };
      const w = { box, owner, until: this.time + life, born: this.time, style };
      if (hp) { w.kind = 'icewall'; w.hp = hp; w.fortify = fortify; w.pos = [(bmin[0] + bmax[0]) / 2, bmin[1], (bmin[2] + bmax[2]) / 2]; box.wall = w; }
      this.world.boxes.push(box);
      this.walls.push(w);
      this.emit('wall', w);
      first ||= w;
    }
    return first;
  }

  removeWall(w) {
    const i = this.world.boxes.indexOf(w.box);
    if (i >= 0) this.world.boxes.splice(i, 1);
    w.removed = true;
    this.emit('wallGone', w);
  }

  // Bot vision limit from nearsight effects (Infinity = none).
  sightRange(c) {
    const now = this.time;
    let r = Infinity;
    if (c.st.nearUntil > now) r = c.st.nearRange || 7.5;
    if (this.eventide && this.eventide.owner !== c) r = Math.min(r, 8);
    return r;
  }

  end() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.emit('end', {});
  }

  respawn(c) {
    c.spawnAt(this.pickSpawn(c), this.time);
    if (c.brain) c.brain.reset(this.time);
    this.emit('respawn', { who: c });
  }

  pickSpawn(c) {
    const enemies = this.combatants.filter(o => o !== c && o.alive);
    let best = null, bestScore = -Infinity;
    for (const sp of this.map.spawns) {
      let minD = 60, seen = false, crowded = false;
      for (const e of enemies) {
        const d = hyp(e.pos[0] - sp.x, e.pos[2] - sp.z);
        minD = Math.min(minD, d);
        if (d < 2) crowded = true;
        if (!seen && d < 60 && this.world.lineOfSight(e.eye(), [sp.x, PLAYER.standEye, sp.z])) seen = true;
      }
      const score = (crowded ? -2000 : 0) + (seen ? 0 : 1000) + Math.min(minD, 40) + Math.random() * 8;
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    return best;
  }

  // Hitscan along each direction. Penetrable boxes (crates, wooden panels) are crossed while the gun's
  // penetration budget lasts, at a damage cost. Shotgun pellets are summed per target before applying.
  fireBullets(shooter, gun, dirs) {
    const def = gun.def;
    const o = shooter.eye();
    // Focus orbs: shooting your own orb refreshes your shield and the Focus timer.
    if (shooter.kit) for (const orb of this.devices) {
      if (orb.kind !== 'focusorb' || orb.owner !== shooter || orb.removed) continue;
      for (const d of dirs) {
        const vx = orb.pos[0] - o[0], vy = orb.pos[1] - o[1], vz = orb.pos[2] - o[2], t = vx * d[0] + vy * d[1] + vz * d[2];
        if (t <= 0 || hyp(vx - d[0] * t, vy - d[1] * t, vz - d[2] * t) > 0.35 || !this.world.lineOfSight(o, orb.pos)) continue;
        orb.removed = true;
        shooter.kit.shield = true;
        shooter.kit.focusUntil = this.time + 12;
        this.emit('pulse', { pos: orb.pos, r: 1.2, type: 'shield', color: 0x9b5cff, owner: shooter });
        this.emit('ability', { who: shooter, type: 'heal' });
        break;
      }
    }
    const budget = PEN_DEPTH[def.pen] ?? 0;
    const perTarget = new Map();
    for (const d of dirs) {
      const res = this.trace(shooter, o, d, budget);
      const block = this.utilOnRay(shooter, o, d, res.endT);
      if (block) {
        // Utility in the way takes the shot (and its damage) instead of whoever is behind it.
        const end = [o[0] + d[0] * block.t, o[1] + d[1] * block.t, o[2] + d[2] * block.t];
        this.emit('tracer', { who: shooter, gun, from: o, to: end });
        this.emit('impact', { who: shooter, point: end, normal: [-d[0], -d[1], -d[2]], util: block.it });
        if (this.isEnemy(shooter, block.it.owner)) this.hitUtil(block.it, damageAt(def, block.t)[2] * res.mult, shooter);
        continue;
      }
      const end = [o[0] + d[0] * res.endT, o[1] + d[1] * res.endT, o[2] + d[2] * res.endT];
      this.emit('tracer', { who: shooter, gun, from: o, to: end });
      // A shot stopped by a wall that has health (Frost Wall) wears that piece down.
      const stopped = !res.hit && res.impacts.length ? res.impacts[res.impacts.length - 1].box.wall : null;
      if (stopped?.hp > 0 && this.isEnemy(shooter, stopped.owner)) this.hitUtil(stopped, damageAt(def, res.endT)[2], shooter);
      for (const imp of res.impacts) {
        this.emit('impact', { who: shooter, point: [o[0] + d[0] * imp.t, o[1] + d[1] * imp.t, o[2] + d[2] * imp.t], normal: imp.n, box: imp.box });
      }
      if (!res.hit) continue;
      const { c, part, t } = res.hit;
      const b = damageAt(def, t);
      const dmg = (part === 'head' ? b[1] : part === 'body' ? b[2] : b[3]) * res.mult;
      let acc = perTarget.get(c);
      if (!acc) { acc = { dmg: 0, head: 0, body: 0, legs: 0, dist: t, point: end, wallbang: false }; perTarget.set(c, acc); }
      acc.dmg += dmg;
      acc[part]++;
      acc.dist = Math.min(acc.dist, t);
      acc.wallbang ||= res.mult < 1;
      if (part === 'head') acc.point = end;
    }
    for (const [target, acc] of perTarget) {
      const part = acc.head ? 'head' : acc.body ? 'body' : 'legs';
      this.damage(target, shooter, Math.round(acc.dmg), { part, def, dist: acc.dist, point: acc.point, wallbang: acc.wallbang });
    }
    this.noise(shooter, def.suppressed ? 25 : 60);
  }

  // The nearest shootable utility a shot from o along d meets before maxT: enemy devices and charging
  // Lockdowns, and any Lagoon dome (it stops everyone's bullets, from inside too).
  utilOnRay(shooter, o, d, maxT) {
    let best = null;
    const test = (it, c, r, inside) => {
      const vx = c[0] - o[0], vy = c[1] - o[1], vz = c[2] - o[2], tc = vx * d[0] + vy * d[1] + vz * d[2];
      const d2 = vx * vx + vy * vy + vz * vz - tc * tc;
      if (d2 > r * r) return;
      const th = Math.sqrt(r * r - d2);
      let t = tc - th;
      if (t < 0) { if (!inside) return; t = tc + th; } // shooting out of a dome
      if (t > 0 && t < maxT && (!best || t < best.t)) best = { t, it };
    };
    for (const x of this.devices) {
      const s = SHOOTABLE[x.kind];
      if (s && !x.removed && x.hp > 0 && this.isEnemy(shooter, x.owner)) test(x, [x.pos[0], x.pos[1] + s.y, x.pos[2]], s.r, false);
    }
    for (const z of this.zones) {
      const s = SHOOTABLE[z.kind];
      if (s && z.hp > 0 && !z.fired && this.time < z.until && this.isEnemy(shooter, z.owner)) test(z, [z.pos[0], z.pos[1] + s.y, z.pos[2]], s.r, false);
    }
    for (const sm of this.smokes) if (sm.kind === 'cove' && sm.hp > 0 && this.time < sm.until && this.time >= sm.born + 0.8) test(sm, sm.pos, sm.radius, true);
    return best;
  }

  // Damage a piece of utility (the host decides; see net.js); at 0 health it's gone.
  hitUtil(it, amount, shooter) {
    if (!(it.hp > 0) || amount <= 0) return;
    it.hp -= amount;
    if (it.hp <= 0) this.breakUtil(it);
  }

  breakUtil(it) {
    it.hp = 0;
    if (this.devices.includes(it)) it.removed = true;
    else it.until = this.time; // a zone or a dome ends now
    if (it.kind === 'decoy') this.flash(it.owner, [it.pos[0], it.pos[1] + 1, it.pos[2]], 2); // Double: shooting it blinds you
    this.emit('utilBroken', it);
  }

  // A device, zone or dome by owner, kind and rough position (for online messages).
  findUtil(owner, kind, pos) {
    const near = (x) => x.owner === owner && x.kind === kind && hyp(x.pos[0] - pos[0], x.pos[1] - pos[1], x.pos[2] - pos[2]) < 2.5;
    return this.devices.find(x => !x.removed && near(x)) || this.zones.find(near) || this.smokes.find(near) || this.walls.find(x => x.pos && !x.removed && near(x)) || null;
  }

  trace(shooter, o, d, budget) {
    const walls = this.world.raycastAll(o, d, MAX_RANGE);
    let stopT = MAX_RANGE, used = 0;
    const crossed = [];
    const impacts = [];
    for (const h of walls) {
      if (h.tIn > stopT) break;
      const thick = h.tOut - h.tIn;
      if (!h.box.pen || used + thick > budget) {
        stopT = h.tIn;
        impacts.push({ t: h.tIn, n: h.n, box: h.box });
        break;
      }
      used += thick;
      crossed.push(h);
      impacts.push({ t: h.tIn, n: h.n, box: h.box });
    }
    let hit = null;
    for (const c of this.combatants) {
      if (!c.alive || !this.isEnemy(shooter, c)) continue;
      const r = c.rayHit(o, d, stopT);
      if (r && (!hit || r.t < hit.t)) hit = { c, part: r.part, t: r.t };
    }
    if (!hit) return { endT: stopT, impacts, hit: null, mult: 1 };
    let through = 0;
    for (const h of crossed) if (h.tIn < hit.t) through += Math.min(h.tOut, hit.t) - h.tIn;
    const mult = through > 0 ? Math.max(0.3, 0.8 - 0.4 * through / budget) : 1;
    return { endT: hit.t, impacts: impacts.filter(i => i.t < hit.t), hit, mult };
  }

  damage(target, attacker, amount, info) {
    if (!target.alive || amount <= 0) return;
    if (attacker !== target && !this.isEnemy(attacker, target)) return; // no friendly fire
    const now = this.time;
    if (target.st.intangibleUntil > now && !info.spike) return; // Vanish: can't be hurt
    if (target.st.invulnUntil > now && !info.spike) return; // Rendezvous: invulnerable while teleporting
    if (target.kit?.shield && !info.spike) { target.kit.shield = false; this.emit('pulse', { pos: target.eye(), r: 1.2, type: 'shield', color: 0x9b5cff, owner: target }); return; } // Focus shield eats one hit
    if (target.st.vulnUntil > now) amount *= 2; // Vulnerable: double damage
    if (target.kit) target.kit.onDamaged();
    if (target.decay > 0) target.decayRegenAt = now + 2.5; // getting hit pauses Decay recovery
    (target.damagedBy ||= new Set()).add(attacker);
    (target.hurtAt ||= new Map()).set(attacker, now);
    if (attacker !== target && attacker.kit) attacker.kit.onDealt?.();
    const dealt = target.takeDamage(amount);
    const s = attacker.stats;
    s.hits++;
    s[info.part]++;
    s.damage += dealt;
    const ra = attacker.reportFor(target), rt = target.reportFor(attacker);
    ra.dealt += dealt; ra.dealtHits++;
    rt.taken += dealt; rt.takenHits++;
    const pk = info.part === 'head' ? 'head' : info.part === 'legs' ? 'legs' : 'body';
    if (!info.dot) { ra[pk]++; rt['t' + pk[0].toUpperCase() + pk.slice(1)]++; }
    const far = info.def.pellets && info.dist > TAG.shotgunFarRange;
    target.tag(now, far ? TAG.shotgunFarSlow : TAG.slow);
    target.lastHitFrom = attacker.eye();
    target.lastHitTime = now;
    let killed = target.hp <= 0;
    if (killed && !info.spike && (target.lastDowner = attacker) && target.kit?.saveFromDeath()) {
      this.emit('hit', { attacker, target, part: info.part, amount, dealt, point: info.point, killed: false, def: info.def, wallbang: info.wallbang, dot: !!info.dot });
      return;
    }
    if (killed && target.kit?.rebirth) {
      // Rekindle: the death doesn't happen; back to the mark at full health.
      this.emit('hit', { attacker, target, part: info.part, amount, dealt, point: info.point, killed: false, def: info.def, wallbang: info.wallbang, dot: !!info.dot });
      target.kit.revive();
      return;
    }
    this.emit('hit', { attacker, target, part: info.part, amount, dealt, point: info.point, killed, def: info.def, wallbang: info.wallbang, dot: !!info.dot });
    if (target.brain) target.brain.onDamaged(attacker, now);
    if (killed) this.kill(target, attacker, info);
  }

  // ---------- dropped weapons ----------
  // Revive a dead teammate where they fell (Second Dawn). They get back the gun they dropped, if it's still there.
  resurrect(c, by) {
    const p = c.deathPos; if (!p || c.alive) return;
    const d = c.deathDrop, i = d ? this.drops.indexOf(d) : -1;
    if (i >= 0) { this.drops.splice(i, 1); this.emit('pickup', d); c.inv[d.gun.def.slot] = d.gun; }
    c.deathDrop = null;
    c.alive = true; c.hp = PLAYER.hp; c.armor = 0;
    for (const k of Object.keys(c.st)) if (k.endsWith('Until')) c.st[k] = 0;
    c.pos = [...p]; c.prevPos = [...p]; c.vel = [0, 0, 0];
    c.prevEyeY = p[1] + c.eyeOff;
    c.respawnAt = Infinity;
    c.equip(c.inv.primary ? 'primary' : 'secondary', this.time, true);
    if (c.brain) c.brain.goal = null;
    this.emit('respawn', { who: c, revived: true });
    this.emit('ability', { who: c, type: 'rekindled' });
    this.emit('revived', { who: c, by });
  }

  // Drop the gun in `slot` (G, or on death). Tossed guns fly ~2 m forward before landing.
  dropGun(c, slot, toss = true) {
    const gun = c.inv[slot];
    if (!gun || (slot !== 'primary' && slot !== 'secondary') || gun.def.melee) return null;
    gun.onHolster(); gun.reloading = false;
    c.inv[slot] = null;
    const eye = c.eye(), f = dirOf(c.yaw, 0);
    let to = [c.pos[0], c.pos[1], c.pos[2]];
    if (toss) {
      const hit = this.world.raycast(eye, f, 2.2);
      const t = hit ? Math.max(0, hit.t - 0.4) : 2.2;
      to = [eye[0] + f[0] * t, eye[1], eye[2] + f[2] * t];
    }
    const fl = this.world.raycast([to[0], to[1] + 0.2, to[2]], [0, -1, 0], 30);
    to[1] = fl ? to[1] + 0.2 - fl.t + 0.06 : c.pos[1] + 0.06;
    const d = { gun, pos: to, from: toss ? [eye[0], eye[1] - 0.3, eye[2]] : [c.pos[0], c.pos[1] + 1, c.pos[2]], at: this.time, by: c, yaw: c.yaw + (Math.random() - 0.5) * 0.8, skin: c.skinOf?.(gun.def.id) };
    this.drops.push(d);
    if (this.drops.length > 40) this.drops.shift();
    if (c.slot === slot) {
      const next = c.inv.primary ? 'primary' : c.inv.secondary ? 'secondary' : 'melee';
      if (c.alive) c.equip(next, this.time, true);
      else c.slot = next; // the dead keep a valid slot so nothing reads an empty hand
    }
    this.emit('drop', d);
    return d;
  }

  // Take a dropped gun; whatever was in that slot is dropped where you stand.
  pickUp(c, d) {
    const slot = d.gun.def.slot;
    const i = this.drops.indexOf(d);
    if (i < 0) return false;
    this.drops.splice(i, 1);
    this.emit('pickup', d);
    if (c.inv[slot]) this.dropGun(c, slot, false);
    c.inv[slot] = d.gun;
    c.equip(slot, this.time, true);
    return true;
  }

  // The gun you're looking at (within 2.6 m), for "F to pick up".
  dropInView(c) {
    const e = c.eye(), f = dirOf(c.yaw, c.pitch);
    let best = null, bestS = -1;
    for (const d of this.drops) {
      const dx = d.pos[0] - e[0], dy = d.pos[1] + 0.05 - e[1], dz = d.pos[2] - e[2], len = hyp(dx, dy, dz);
      const flat = hyp(d.pos[0] - c.pos[0], d.pos[2] - c.pos[2]);
      if (flat > 2.6 || Math.abs(d.pos[1] - c.pos[1]) > 1.6) continue;
      const cos = (dx * f[0] + dy * f[1] + dz * f[2]) / (len || 1);
      if (flat > 1.1 && cos < 0.93) continue; // look at it unless you're standing on it
      const s = cos - flat * 0.05;
      if (s > bestS && this.world.lineOfSight(e, [d.pos[0], d.pos[1] + 0.1, d.pos[2]])) { bestS = s; best = d; }
    }
    return best;
  }

  tickDrops(now) {
    if (!this.mode) { // deathmatch: guns despawn (filtered only when one is due, so most ticks make no new list)
      let due = false;
      for (const d of this.drops) if (now - d.at >= 25) { due = true; break; }
      if (due) this.drops = this.drops.filter(d => now - d.at < 25);
    }
    for (const c of this.combatants) {
      const pressed = c.input.use && !c.prevUse;
      c.prevUse = c.input.use;
      if (!c.alive || c.remote || c.st.channelUntil > now) continue;
      // F on your own placed utility picks it back up (before any gun lying there).
      if (pressed && !c.isBot && c.kit) { const d = c.kit.pickupInView(); if (d && c.kit.pickUp([...d.pos])) continue; }
      if (!this.drops.length) continue;
      // Walk over a gun with that slot empty: it's picked up automatically (not your own fresh drop).
      const drops = this.drops;
      for (let i = 0; i < drops.length; i++) { // a pickup ends the loop, so the list can't change under it
        const d = drops[i], dx = d.pos[0] - c.pos[0], dz = d.pos[2] - c.pos[2];
        if (dx * dx + dz * dz > 1 || Math.abs(d.pos[1] - c.pos[1]) > 1.2) continue; // not standing on it (nearly always)
        if (now - d.at < (d.by === c ? 1.5 : 0.3)) continue;
        if (d.for && d.for !== c && d.for.alive && now - d.at < 10) continue; // bought for a teammate: theirs for a moment
        const slot = d.gun.def.slot, mine = c.inv[slot];
        const better = c.isBot && slot === 'primary' && (!mine || (d.gun.def.cost || 0) > (mine.def.cost || 0) + 400);
        if (!mine || (better && d.by !== c)) { this.pickUp(c, d); break; }
      }
      if (pressed && !c.isBot) { const d = this.dropInView(c); if (d) this.pickUp(c, d); }
    }
  }

  // Decay: temporary health loss that can't kill and slowly comes back.
  // It starts coming back `delay` seconds later, at `rate` health a second (or evenly over `over` seconds).
  decay(c, amount, { delay = 2.5, rate = 12, over = 0 } = {}) {
    const a = Math.max(0, Math.min(amount, c.hp - 1));
    c.hp -= a;
    c.decay = (c.decay || 0) + a;
    c.decayRegenAt = this.time + delay;
    c.decayRate = over ? Math.max(c.decay, 1) / over : rate;
  }

  kill(victim, killer, info) {
    if (this.netClient) return; // online, the host decides who dies
    victim.alive = false;
    victim.diedAt = this.time;
    victim.deathPos = [...victim.pos];
    victim.soulTaken = false;
    victim.decay = 0;
    victim.killedAt = this.time;
    victim.stats.deaths++;
    victim.respawnAt = this.time + MATCH.respawn;
    victim.killedBy = { killer, def: info.def, headshot: info.part === 'head', wallbang: info.wallbang };
    victim.vel = [0, 0, 0];
    if (killer !== victim) {
      killer.stats.kills++;
      if (killer.brain) killer.brain.lastKillAt = this.time;
      if (killer.kit) killer.kit.onKill(info.def, victim);
      // Soul Harvest: a Vex who hurt them in the last 3 s gets an orb too, whoever got the kill.
      if (victim.hurtAt) for (const [a, t] of victim.hurtAt) if (a !== killer && a.alive && a.kit?.id === 'vex' && this.time - t <= 3 && this.isEnemy(a, victim)) a.kit.dropOrb(victim);
      if (!this.mode && MATCH.healOnKill && killer.alive) killer.heal();
    }
    // The body drops its best gun: the primary, or the sidearm if there's no primary.
    victim.deathDrop = this.dropGun(victim, victim.inv.primary ? 'primary' : 'secondary', false);
    // Teammates nearby react to the death: they turn toward and check where the killer was, and the close
    // ones swing on the killer right away to trade before the killer can reset.
    if (this.mode && killer !== victim) for (const b of this.bots) {
      if (!b.alive || b === victim || this.isEnemy(b, victim)) continue;
      const d = hyp(b.pos[0] - victim.pos[0], b.pos[2] - victim.pos[2]);
      if (d >= 30) continue;
      b.brain.alert(killer.pos, this.time);
      if (d < 16 && this.time - b.brain.lastSeen > 0.5 && !b.brain.goal?.action && Math.random() < 0.4 + b.brain.aggr * 0.6) {
        b.brain.lastSeenPos = [...killer.pos]; b.brain.pushUntil = this.time + 2.5;
      }
    }
    if (this.mode?.report && killer !== victim && this.isEnemy(killer, victim)) this.mode.report(victim, killer, killer.pos, 'shot');
    if (this.mode) this.mode.onKill(victim, killer, info);
    this.emit('kill', { killer, victim, def: info.def, headshot: info.part === 'head', wallbang: info.wallbang });
    if (!this.mode && killer.stats.kills >= this.killLimit) this.end();
  }

  meleeHit(attacker, mode) {
    const o = attacker.eye();
    const range = WEAPONS.knife.melee.range;
    const offsets = [[0, 0], [0.1, 0], [-0.1, 0], [0, 0.08], [0, -0.1]];
    for (const [dy, dp] of offsets) {
      const d = dirFromAngles(attacker.yaw + dy, attacker.pitch + dp);
      const wall = this.world.raycast(o, d, range);
      const maxT = wall ? wall.t : range;
      for (const c of this.combatants) {
        if (!c.alive || !this.isEnemy(attacker, c)) continue;
        const r = c.rayHit(o, d, maxT);
        if (!r) continue;
        const f = dirFromAngles(c.yaw, 0);
        const hx = c.pos[0] - attacker.pos[0], hz = c.pos[2] - attacker.pos[2];
        const hl = hyp(hx, hz) || 1;
        const back = (f[0] * hx + f[2] * hz) / hl > 0.5;
        const point = [o[0] + d[0] * r.t, o[1] + d[1] * r.t, o[2] + d[2] * r.t];
        this.damage(c, attacker, back ? mode.back : mode.dmg, { part: 'body', def: WEAPONS.knife, dist: r.t, point, wallbang: false });
        return;
      }
      if (dy === 0 && dp === 0 && wall) {
        this.emit('impact', { who: attacker, point: [o[0] + d[0] * wall.t, o[1] + d[1] * wall.t, o[2] + d[2] * wall.t], normal: wall.n, box: wall.box, melee: true });
      }
    }
  }

  noise(source, radius) {
    for (const b of this.bots) {
      if (b === source || !b.alive) continue;
      const d = hyp(b.pos[0] - source.pos[0], b.pos[2] - source.pos[2]);
      if (d < radius) b.brain.hear(source, this.time);
    }
  }
}
