// 5v5 round mode, following Valorant's rules:
//   * Attackers carry the spike and must plant it on site A or B; defenders stop them or defuse it.
//   * Buy phase 30 s (45 s in the first round of each half and in overtime; barriers up), round 100 s, spike
//     timer 45 s, plant 4 s, defuse 7 s (progress is kept once you pass the halfway mark at 3.5 s), 7 s
//     between the end of a round and the next buy phase.
//   * First to 13 rounds. Sides swap after round 12. At 12-12 the match goes to overtime: win by two,
//     sides swap every round and everyone gets 5000 credits each overtime round.
//   * Economy: 800 to start, 9000 cap, +3000 per round win, +1900 / 2400 / 2900 for 1 / 2 / 3+ losses in a
//     row, +200 per kill, +300 to every attacker for planting, and attackers who survive a round they lost
//     on time without planting get only 1000. Halftime resets credits to 800, weapons to the Classic and
//     ultimate points to zero.
//   * Dead players stay dead until the next round. Survivors keep their weapons and remaining shields.
//     Unused ability charges carry over; the signature ability (E) refills every round.
//   * Ultimate orbs come back every round: hold F on one for 3 s for 1 ultimate point.
import { WEAPONS } from './weapons.js';
import { Gun } from './gun.js';
import { Combatant } from './entity.js';
import { Bot, BOT_NAMES } from './bot.js';
import { Kit, AGENTS, AGENT_ORDER } from './abilities.js';
import { PLAYER, DT } from './config.js';

export const ROUND = { buy: 30, round: 100, spike: 45, plant: 4, defuse: 7, defuseHalf: 3.5, orb: 3, end: 7, toWin: 13, half: 12, firstBuy: 45 };
export const ECON = { start: 800, max: 9000, win: 3000, loss: [1900, 2400, 2900], kill: 200, plant: 300, save: 1000, ot: 5000 };
// Regen Shield (patch 9.10): 25 shield that refills from a 50-point reserve after a moment out of combat.
export const SHIELDS = { light: { name: 'Light Shields', cost: 400, armor: 25 }, regen: { name: 'Regen Shield', cost: 650, armor: 25, pool: 50 }, heavy: { name: 'Heavy Shields', cost: 1000, armor: 50 } };
export const REGEN = { delay: 5, rate: 6 }; // seconds without taking damage, then shield per second
import { priceOf, PRICES } from './prices.js';
// Price, max charges and free charges for one of a combatant's ability slots.
export const abilityPrice = (c, k) => priceOf(c.kit.id, c.kit.agent.abilities[k], k);

export const TEAM_COLORS = [0x4fd1c5, 0xff4655]; // your team, enemy team
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class RoundMode {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.kind = 'rounds';
    this.score = [0, 0];
    this.round = 0;
    this.lossStreak = [0, 0];
    this.phase = 'buy';
    this.phaseEnd = 0;
    this.spike = null;
    this.history = []; // [{ winner team, reason, side }]
    this.startSide = opts.side === 'random' || !opts.side ? (Math.random() < 0.5 ? 'atk' : 'def') : opts.side;
  }

  // ---------- setup ----------
  setup() {
    const g = this.game;
    const names = shuffle([...BOT_NAMES]);
    const agents = shuffle(AGENT_ORDER.filter(a => a !== this.opts.agent));
    const agentsB = shuffle([...AGENT_ORDER]);
    // Picked on the agent select screen: each team's slots in pick order (the host's own is the player).
    // A slot that belongs to someone online is held by a bot until net.js hands it to them.
    const line = this.opts.lineup;
    const slots = line ? [0, 1].map(t => line.filter(s => !s.host && s.t === t)) : null;
    const p = g.player;
    p.team = 0;
    p.credits = ECON.start;
    p.agentId = p.kit.id;
    g.combatants = [p];
    g.bots = [];
    for (let i = 0; i < 9; i++) {
      const team = i < 4 ? 0 : 1;
      const c = new Combatant(g, { name: names[i], isBot: true, color: TEAM_COLORS[team] });
      c.team = team;
      c.credits = ECON.start;
      // Agents are unique within a team (your team's four never repeat your pick).
      const slot = slots?.[team].shift();
      c.agentId = slot?.a || (team === 0 ? agents[i] : agentsB[i - 4]);
      if (slot && !slot.bot) c.slotFor = slot.n;
      c.kit = new Kit(c, c.agentId);
      c.loadout = { primary: null, secondary: 'classic' };
      c.brain = new Bot(c, g, this.opts.difficulty, 'fight');
      g.combatants.push(c);
      g.bots.push(c);
    }
    for (const c of g.combatants) { c.inv = { primary: null, secondary: new Gun(WEAPONS.classic), melee: new Gun(WEAPONS.knife), ability: null }; c.armor = 0; c.survived = false; }
    // Abilities start empty except the signature.
    for (const c of g.combatants) if (c.kit) { c.kit.charges.c = 0; c.kit.charges.q = 0; c.kit.charges.e = 0; c.inv.ability = null; }
    this.startRound();
  }

  // Which side a team is on in the current round.
  sideOf(team) {
    const r = this.round; // 1-based
    let swapped;
    if (r <= ROUND.half) swapped = false;
    else if (r <= ROUND.half * 2) swapped = true;
    else swapped = (r - ROUND.half * 2) % 2 === 1; // overtime: swap every round
    const s0 = swapped ? (this.startSide === 'atk' ? 'def' : 'atk') : this.startSide;
    return team === 0 ? s0 : (s0 === 'atk' ? 'def' : 'atk');
  }
  side(c) { return this.sideOf(c.team); }
  teamOnSide(side) { return this.sideOf(0) === side ? 0 : 1; }
  members(side) { return this.game.combatants.filter(c => this.side(c) === side); }
  alive(side) { return this.members(side).filter(c => c.alive); }

  // ---------- round flow ----------
  startRound() {
    const g = this.game, map = g.map, now = g.time;
    this.round++;
    const half = this.round === ROUND.half + 1, ot = this.round > ROUND.half * 2;
    // Clear the world.
    for (const w of g.walls) g.removeWall(w);
    g.walls = []; g.smokes = []; g.zones = []; g.devices = []; g.eventide = null; g.drops = [];
    if (g.contract) g.contract = null;
    this.emit('roundClear');
    for (const c of g.combatants) {
      if (half) { c.credits = ECON.start; c.survived = false; c.inv.primary = null; c.inv.secondary = new Gun(WEAPONS.classic); c.armor = 0; c.inv.ability = null; if (c.kit) { c.kit.charges.c = 0; c.kit.charges.q = 0; c.kit.charges.e = 0; c.kit.ultPoints = 0; } }
      if (ot) c.credits = ECON.ot;
      this.spawn(c, now);
    }
    this.boughtThisRound = new Map();
    // Spike to a random attacker.
    // The spike starts on the floor just in front of the attackers' spawn: whoever walks over it carries it.
    this.spike = { state: 'dropped', carrier: null, pos: this.spikeSpawnPos(), plantProg: 0, defuseProg: 0, defuser: null, plantedAt: 0, site: null };
    this.resetOrbs();
    this.phase = 'buy';
    this.phaseEnd = now + (this.round === 1 || half || ot ? ROUND.firstBuy : ROUND.buy);
    this.setBarriers(true);
    this.buyCall = [this.teamBuyCall(0), this.teamBuyCall(1)];
    for (const c of g.bots) this.botBuy(c);
    this.plan = null;
    this.planBots(true);
    this.emit('round', { round: this.round });
  }

  spikeSpawnPos() {
    const g = this.game, spots = g.map.teamSpawns.atk;
    const n = Math.min(5, spots.length);
    let x = 0, z = 0, y = 0;
    for (let i = 0; i < n; i++) { x += spots[i].x / n; z += spots[i].z / n; y = Math.max(y, spots[i].y); }
    const yaw = spots[0].yaw;
    for (const d of [3, 2, 1, 0]) {
      const px = x - Math.sin(yaw) * d, pz = z - Math.cos(yaw) * d;
      if (!g.world.overlap(px - 0.3, y + 0.05, pz - 0.3, px + 0.3, y + 1.5, pz + 0.3)) {
        const f = g.world.raycast([px, y + 1, pz], [0, -1, 0], 5);
        return [px, f ? y + 1 - f.t : y, pz];
      }
    }
    return [spots[0].x, spots[0].y, spots[0].z];
  }

  // Put a combatant at their spawn, healthy. Survivors keep weapons and shields; the dead get a Classic.
  // Online clients pass the spawn point the host picked.
  spawn(c, now, at = null) {
    const g = this.game, side = this.side(c);
    const spots = g.map.teamSpawns[side];
    const i = g.combatants.filter(o => this.side(o) === side).indexOf(c);
    const sp = at || spots[i % spots.length];
    const keepArmor = c.survived ? c.armor : 0;
    if (!c.survived) { c.armorKind = null; c.regenPool = 0; }
    // Copy the survivor's guns into a fresh object: spawnAt() below rebuilds c.inv from the DM loadout.
    const inv = c.survived ? { primary: c.inv.primary, secondary: c.inv.secondary, melee: c.inv.melee || new Gun(WEAPONS.knife), ability: null } : { primary: null, secondary: new Gun(WEAPONS.classic), melee: new Gun(WEAPONS.knife), ability: null };
    if (c.survived && !inv.secondary) inv.secondary = new Gun(WEAPONS.classic);
    // Refill ammo for the new round.
    for (const gun of [inv.primary, inv.secondary]) if (gun) { gun.mag = gun.def.mag; gun.reserve = gun.def.reserve; gun.reloading = false; }
    const kitCharges = c.kit ? { ...c.kit.charges } : null;
    // Utility picked up this round whose charge hadn't come back yet still belongs to its owner.
    if (c.kit) for (const t of c.kit.timers || []) if (t.refund) kitCharges[t.refund]++;
    // Unfired Headhunter-style bullets go back into the ability's charges.
    const bk = c.kit && PRICES[c.kit.id]?.bullets;
    if (bk && c.inv.ability?.abilityKey === bk) kitCharges[bk] += c.inv.ability.mag;
    const pts = c.kit ? c.kit.ultPoints : 0;
    c.loadout = { primary: null, secondary: 'classic' };
    c.spawnAt(sp, now);
    c.inv = inv;
    inv.ability = null;
    c.armor = keepArmor;
    c.hp = PLAYER.hp;
    c.slot = '';
    c.equip(inv.primary ? 'primary' : 'secondary', now);
    if (c.kit) {
      const ab = c.kit.agent.abilities;
      // Bought charges carry over (even through death, as in Valorant); free charges are topped up.
      for (const k of ['c', 'q', 'e']) {
        const pr = abilityPrice(c, k);
        c.kit.charges[k] = pr.cost === null ? ab[k].charges : Math.max(pr.free, Math.min(pr.max, kitCharges[k]));
      }
      c.kit.ready = { q: 0, e: 0, c: 0 };
      c.kit.ultPoints = pts;
    }
    c.survived = false;
    c.roundKills = 0;
    c.roundDamage = 0;
    if (c.kit) { c.kit.mustScoreUntil = 0; c.kit.mapPick = null; c.kit.timers = (c.kit.timers || []).filter(t => !t.dead); }
    if (c.brain) c.brain.reset(now);
    g.emit('respawn', { who: c, round: true });
  }

  setBarriers(up) {
    const g = this.game;
    if (this.barrierBoxes) for (const b of this.barrierBoxes) { const i = g.world.boxes.indexOf(b); if (i >= 0) g.world.boxes.splice(i, 1); }
    this.barrierBoxes = [];
    if (up) for (const b of g.map.barriers || []) {
      const box = { min: [...b.min], max: [...b.max], pen: false, mat: 'barrier', temp: true, barrier: b.team };
      g.world.boxes.push(box);
      this.barrierBoxes.push(box);
    }
    this.emit('barriers', { up, boxes: this.barrierBoxes });
  }

  emit(type, data = {}) { this.game.emit(type, { mode: this, ...data }); }

  tick(now) {
    const g = this.game;
    // Regen Shields top themselves back up out of combat, while their reserve lasts.
    for (const c of g.combatants) {
      if (!c.alive || c.armorKind !== 'regen' || c.armor >= SHIELDS.regen.armor || !(c.regenPool > 0)) continue;
      if (now - (c.lastHitTime ?? -99) < REGEN.delay) continue;
      const add = Math.min(REGEN.rate * DT, c.regenPool, SHIELDS.regen.armor - c.armor);
      c.armor += add; c.regenPool -= add;
    }
    if (this.phase === 'buy') {
      if (this.spike?.state === 'dropped') this.tickSpike(now); // the spike can be grabbed during the buy phase
      // A rush goes at once; a default takes map control first and executes 12-26 s in.
      if (now >= this.phaseEnd) { this.phase = 'live'; this.liveAt = now; this.phaseEnd = now + ROUND.round; this.setBarriers(false); this.emit('live'); this.goTime = now + (this.plan?.style === 'rush' ? 1 + Math.random() * 2 : 12 + Math.random() * 14); }
      return;
    }
    if (this.phase === 'end') {
      if (now >= this.phaseEnd) this.afterRound();
      return;
    }
    this.tickSpike(now);
    this.tickOrbs(now);
    if (this.phase === 'live' && now >= this.phaseEnd) return this.endRound('def', 'time');
    if (this.phase === 'planted' && now >= this.spike.plantedAt + ROUND.spike) {
      this.detonate();
      return this.endRound('atk', 'detonated');
    }
    // Eliminations
    const atkAlive = this.alive('atk').length, defAlive = this.alive('def').length;
    if (defAlive === 0) return this.endRound('atk', 'eliminated');
    if (atkAlive === 0 && this.phase === 'live') return this.endRound('def', 'eliminated');
    if (!this._nextPlan || now >= this._nextPlan) { this._nextPlan = now + 0.5; this.planBots(false); }
  }

  // ---------- spike ----------
  inSite(pos) {
    for (const s of Object.values(this.game.map.sites || {})) {
      if (pos[0] >= s.min[0] && pos[0] <= s.max[0] && pos[2] >= s.min[2] && pos[2] <= s.max[2]) return s;
    }
    return null;
  }

  // Floor cells of a site a bot can plant on: walkable, at the site's floor level (not on a crate), with open
  // cells on all four sides, preferring the middle of the site. Cached per map.
  plantCells(name) {
    const map = this.game.map, cache = (map.plantCells ||= {});
    if (cache[name]) return cache[name];
    const s = map.sites[name], open = new Set(map.walkable.map(([x, z]) => z * map.W + x));
    const inSite = map.walkable.filter(([x, z]) => { const c = map.cellCenter(x, z); return c.x >= s.min[0] && c.x <= s.max[0] && c.z >= s.min[2] && c.z <= s.max[2]; });
    const floor = Math.min(...inSite.map(([x, z]) => map.heights[z][x]));
    const ok = inSite.filter(([x, z]) => map.heights[z][x] <= floor + 0.3 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => open.has((z + dz) * map.W + x + dx)));
    const mid = ok.filter(([x, z]) => { const c = map.cellCenter(x, z); return Math.abs(c.x - (s.min[0] + s.max[0]) / 2) <= (s.max[0] - s.min[0]) * 0.35 && Math.abs(c.z - (s.min[2] + s.max[2]) / 2) <= (s.max[2] - s.min[2]) * 0.35; });
    return (cache[name] = mid.length ? mid : ok);
  }

  // Keep a channelling player still and their gun down.
  channel(c, now) {
    c.input.fwd = c.input.side = 0; c.input.jump = false; c.input.fire = false; c.input.firePressed = false;
    c.st.channelUntil = now + DT * 1.5;
  }

  tickSpike(now) {
    const sp = this.spike, g = this.game;
    if (!sp) return;
    if (sp.state === 'carried') {
      const c = sp.carrier;
      if (!c || !c.alive) { sp.state = 'dropped'; sp.pos = c ? [c.pos[0], c.pos[1], c.pos[2]] : null; sp.carrier = null; this.emit('spikeDrop', { pos: sp.pos }); return; }
      const site = this.inSite(c.pos);
      if (this.phase === 'live' && site && c.input.use && c.grounded) {
        this.channel(c, now);
        sp.plantProg += DT;
        if (sp.plantProg >= ROUND.plant) this.plant(c, site, now);
      } else sp.plantProg = 0;
    } else if (sp.state === 'dropped') {
      for (const c of this.alive('atk')) {
        if (Math.hypot(c.pos[0] - sp.pos[0], c.pos[2] - sp.pos[2]) < 1.2 && Math.abs(c.pos[1] - sp.pos[1]) < 1.5) {
          sp.state = 'carried'; sp.carrier = c; sp.pos = null; this.emit('spikePickup', { who: c });
          if (c.brain && c.brain.goal?.kind === 'pickup') { c.brain.goal = null; this.planBots(false); } // don't stand where the spike was
          break;
        }
      }
    } else if (sp.state === 'planted') {
      // Defuse: hold Use next to it. Progress past the halfway mark is kept.
      let any = false;
      for (const c of this.alive('def')) {
        if (!c.input.use || Math.hypot(c.pos[0] - sp.pos[0], c.pos[2] - sp.pos[2]) > 1.8 || Math.abs(c.pos[1] - sp.pos[1]) > 1.5) continue;
        if (sp.defuser && sp.defuser !== c && sp.defuser.alive && sp.defuser.input.use) continue;
        any = true;
        if (sp.defuser !== c || now >= (this.defuseHeardAt || 0)) {
          // The defuse is loud: nearby attackers turn toward the spike.
          this.defuseHeardAt = now + 1;
          for (const a of this.alive('atk')) if (a.brain && dist(a.pos, sp.pos) < 35) a.brain.alert(sp.pos, now);
        }
        sp.defuser = c;
        this.channel(c, now);
        sp.defuseProg += DT;
        if (sp.defuseProg >= ROUND.defuseHalf && !sp.halfDone) { sp.halfDone = true; this.emit('defuseHalf'); }
        if (sp.defuseProg >= ROUND.defuse) { sp.state = 'defused'; this.addUlt(c); return this.endRound('def', 'defused'); }
        break;
      }
      if (!any) { sp.defuser = null; sp.defuseProg = sp.halfDone ? ROUND.defuseHalf : 0; }
    }
  }

  plant(c, site, now) {
    const sp = this.spike;
    sp.state = 'planted';
    sp.pos = [c.pos[0], c.pos[1], c.pos[2]];
    sp.site = site.name;
    sp.plantedAt = now;
    sp.carrier = null;
    sp.defuseProg = 0;
    sp.halfDone = false;
    this.phase = 'planted';
    for (const a of this.members('atk')) a.credits = Math.min(ECON.max, a.credits + ECON.plant);
    this.addUlt(c);
    this.emit('planted', { who: c, site: site.name, pos: sp.pos });
    this.planBots(true);
  }

  detonate() {
    const g = this.game, p = this.spike.pos;
    for (const c of g.combatants) {
      if (!c.alive) continue;
      const d = Math.hypot(c.pos[0] - p[0], c.pos[1] - p[1], c.pos[2] - p[2]);
      if (d < 30) {
        const dmg = d < 20 ? 999 : Math.round(150 * (30 - d) / 10);
        g.damage(c, c, dmg, { part: 'body', def: { id: 'spike', name: 'Spike', cat: 'Ability' }, dist: d, point: c.eye(), wallbang: true, spike: true });
      }
    }
    this.spike.state = 'exploded';
    this.emit('detonate', { pos: p });
  }

  addUlt(c) { if (c.kit) c.kit.ultPoints = Math.min(c.kit.ultCost, c.kit.ultPoints + 1); }

  // ---------- ultimate orbs ----------
  resetOrbs() { this.orbs = (this.game.map.ultOrbs || []).map(p => ({ pos: [...p], taken: false, prog: 0, by: null })); }

  // The orb c is close enough to take (none once it's been taken).
  orbNear(c) {
    return this.orbs?.find(o => !o.taken && Math.hypot(c.pos[0] - o.pos[0], c.pos[2] - o.pos[2]) < 1.5 && Math.abs(c.pos[1] - o.pos[1]) < 1.5) || null;
  }

  // Hold Use on an orb for ROUND.orb seconds (standing still, gun down) to take it. One player at a time.
  tickOrbs(now) {
    for (const o of this.orbs || []) {
      if (o.taken) continue;
      const holding = (c) => c.alive && c.input.use && this.orbNear(c) === o && !(this.spike?.carrier === c && this.inSite(c.pos));
      if (!o.by || !holding(o.by)) { o.by = this.game.combatants.find(holding) || null; o.prog = 0; }
      if (!o.by) continue;
      this.channel(o.by, now);
      o.prog += DT;
      if (o.prog >= ROUND.orb) { o.taken = true; this.addUlt(o.by); this.emit('orbTaken', { who: o.by, pos: o.pos }); o.by = null; }
    }
  }

  // ---------- events ----------
  onKill(victim, killer, info) {
    if (killer && killer !== victim && this.game.isEnemy(killer, victim)) {
      killer.credits = Math.min(ECON.max, killer.credits + ECON.kill);
      killer.roundKills = (killer.roundKills || 0) + 1;
    }
    if (!info?.spike) this.addUlt(victim); // a death grants an ultimate point (not to the spike)
  }

  endRound(winnerSide, reason) {
    if (this.phase === 'end') return;
    const g = this.game, now = g.time;
    const winTeam = this.teamOnSide(winnerSide), loseTeam = 1 - winTeam;
    this.score[winTeam]++;
    this.history.push({ winner: winTeam, side: winnerSide, reason });
    this.phase = 'end';
    this.phaseEnd = now + ROUND.end;
    this.lastResult = { winnerSide, winTeam, reason, planted: this.spike && (this.spike.state === 'planted' || this.spike.state === 'exploded' || this.spike.state === 'defused') };
    // Economy
    this.lossStreak[winTeam] = 0;
    this.lossStreak[loseTeam] = Math.min(3, this.lossStreak[loseTeam] + 1);
    const lossBonus = ECON.loss[this.lossStreak[loseTeam] - 1];
    for (const c of g.combatants) {
      c.survived = c.alive;
      let add;
      if (c.team === winTeam) add = ECON.win;
      else if (this.side(c) === 'atk' && reason === 'time' && c.alive && !this.lastResult.planted) add = ECON.save; // saved without planting
      else add = lossBonus;
      c.credits = Math.min(ECON.max, c.credits + add);
    }
    this.emit('roundEnd', this.lastResult);
  }

  afterRound() {
    const g = this.game;
    const [a, b] = this.score;
    const regulation = this.round < ROUND.half * 2;
    const done = (Math.max(a, b) >= ROUND.toWin && regulation) || (!regulation && Math.abs(a - b) >= 2 && Math.max(a, b) >= ROUND.toWin);
    if (done) { this.winner = a > b ? 0 : 1; g.end(); return; }
    this.startRound();
  }

  // ---------- buying ----------
  canBuy(c) {
    return this.phase === 'buy'; // anywhere on the map, until the round starts
  }

  // item: { type: 'weapon', id } | { type: 'shield', id } | { type: 'ability', key }
  buy(c, item) {
    if (!this.canBuy(c)) return 'Buying is only possible during the buy phase';
    const bought = this.boughtThisRound.get(c) || [];
    if (item.type === 'weapon') {
      const def = WEAPONS[item.id];
      const cur = c.inv[def.slot];
      if (cur && cur.def.id === def.id) return 'Already owned';
      if (c.credits < def.cost) return 'Not enough credits';
      // Selling back what you bought this round in that slot first.
      const prev = bought.find(b => b.type === 'weapon' && WEAPONS[b.id].slot === def.slot);
      c.credits -= def.cost;
      if (prev) { c.credits += WEAPONS[prev.id].cost; bought.splice(bought.indexOf(prev), 1); }
      c.give(def.id);
      c.equip(def.slot, this.game.time, true);
    } else if (item.type === 'shield') {
      const s = SHIELDS[item.id];
      if (c.armor >= s.armor && (c.armorKind || 'light') === item.id) return 'Already have that shield';
      const prev = bought.find(b => b.type === 'shield');
      const refund = prev ? SHIELDS[prev.id].cost : 0;
      if (c.credits + refund < s.cost) return 'Not enough credits';
      c.credits += refund - s.cost;
      if (prev) bought.splice(bought.indexOf(prev), 1);
      c.armor = s.armor;
      c.armorKind = item.id; c.regenPool = s.pool || 0;
    } else if (item.type === 'ability') {
      const pr = abilityPrice(c, item.key), cost = pr.cost;
      if (cost === null) return 'Free every round';
      if (c.kit.charges[item.key] >= pr.max) return 'Max charges';
      if (c.credits < cost) return 'Not enough credits';
      c.credits -= cost;
      c.kit.charges[item.key]++;
    }
    bought.push(item);
    this.boughtThisRound.set(c, bought);
    this.emit('bought', { who: c, item });
    return null;
  }

  // Sell back something bought this round (right click in the buy menu).
  sell(c, item) {
    if (!this.canBuy(c)) return 'Can only sell during the buy phase';
    const bought = this.boughtThisRound.get(c) || [];
    const i = bought.findIndex(b => b.type === item.type && (b.id === item.id || (item.key && b.key === item.key)));
    if (i < 0) return 'Nothing to sell';
    const b = bought[i];
    if (b.type === 'weapon') {
      const def = WEAPONS[b.id];
      if (c.inv[def.slot]?.def.id !== b.id) return 'You no longer have that weapon';
      c.credits += def.cost;
      c.inv[def.slot] = def.slot === 'secondary' ? new Gun(WEAPONS.classic) : null;
      c.equip(c.inv.primary ? 'primary' : 'secondary', this.game.time, true);
    } else if (b.type === 'shield') { c.credits += SHIELDS[b.id].cost; c.armor = 0; c.armorKind = null; c.regenPool = 0; }
    else if (b.type === 'ability') { c.credits += abilityPrice(c, b.key).cost; c.kit.charges[b.key]--; }
    bought.splice(i, 1);
    this.emit('bought', { who: c, item });
    return null;
  }

  // Bots buy like a sensible team: full buy at 3900+, half buy at 2000+, a pistol-round buy, or save.
  // Team economy, called the way a team calls it: everyone buys together. 'full' when the team can afford
  // rifles and heavy shields; 'eco' (save) when saving now means a full buy next round; otherwise 'force'.
  // Always force when the round matters too much to save: the last round of a half, overtime, or when the
  // other team is one round from winning.
  teamBuyCall(team) {
    if (this.round === 1 || this.round === ROUND.half + 1) return 'pistol';
    const mates = this.game.combatants.filter(c => c.team === team);
    if (!mates.length) return 'full';
    const FULL = 3900; // Vandal / Phantom and heavy shields
    // A survivor still holding a rifle only needs shields.
    const avg = mates.reduce((s, c) => s + c.credits + (c.inv.primary && c.inv.primary.def.cost >= 2000 ? FULL - 1000 : 0), 0) / mates.length;
    if (avg >= FULL) return 'full';
    if (this.round === ROUND.half || this.round > ROUND.half * 2 || this.score[1 - team] === ROUND.toWin - 1) return 'force';
    const nextBonus = ECON.loss[Math.min(3, this.lossStreak[team] + 1) - 1];
    return avg + nextBonus >= FULL ? 'eco' : 'force';
  }

  botBuy(c) {
    const has = c.inv.primary;
    const cr = () => c.credits;
    const tryBuy = (item) => this.buy(c, item) === null;
    const call = this.buyCall?.[c.team] || 'full';
    const pistolRound = call === 'pistol';
    if (call === 'eco' && !has) {
      // Saving: keep enough for a full buy next round even after a loss; spend only what's above that.
      const keep = Math.max(0, 3900 - ECON.loss[Math.min(3, this.lossStreak[c.team] + 1) - 1]);
      if (cr() - keep >= 800 && Math.random() < 0.5) tryBuy({ type: 'weapon', id: 'sheriff' });
      else if (cr() - keep >= 500) tryBuy({ type: 'weapon', id: 'ghost' });
      if (cr() - keep >= 400) tryBuy({ type: 'shield', id: 'light' });
      this.botBuyAbilities(c, keep);
      return;
    }
    if (pistolRound) {
      if (Math.random() < 0.5) { tryBuy({ type: 'shield', id: 'light' }); tryBuy({ type: 'weapon', id: pick(['ghost', 'frenzy']) }); }
      else tryBuy({ type: 'weapon', id: 'sheriff' });
      this.botBuyAbilities(c);
      return;
    }
    if (!has && cr() >= 3900) { tryBuy({ type: 'weapon', id: pick(['vandal', 'phantom', 'vandal', 'phantom', 'operator', 'odin']) }); tryBuy({ type: 'shield', id: 'heavy' }); }
    else if (!has && cr() >= 2400) { tryBuy({ type: 'weapon', id: pick(['spectre', 'bulldog', 'guardian', 'marshal']) }); tryBuy({ type: 'shield', id: cr() >= 1000 ? 'heavy' : 'light' }); }
    else if (!has && cr() >= 1500) { tryBuy({ type: 'weapon', id: pick(['spectre', 'bucky', 'stinger']) }); tryBuy({ type: 'shield', id: 'light' }); }
    else if (!has && cr() >= 800) tryBuy({ type: 'weapon', id: 'sheriff' });
    if (c.armor < 50 && cr() >= 2000) tryBuy({ type: 'shield', id: 'heavy' });
    if (c.armor < 25 && cr() >= 650 && Math.random() < 0.5) tryBuy({ type: 'shield', id: 'regen' });
    if (c.armor < 25 && cr() >= 400) tryBuy({ type: 'shield', id: 'light' });
    this.botBuyAbilities(c, c.inv.primary ? 0 : 400);
  }

  // Spend what's left on utility (cheapest first), keeping `reserve` credits back.
  botBuyAbilities(c, reserve = 0) {
    if (!c.kit) return;
    for (let guard = 0; guard < 12; guard++) {
      const opts = ['c', 'q', 'e'].map(k => ({ k, pr: abilityPrice(c, k) }))
        .filter(o => o.pr.cost !== null && c.kit.charges[o.k] < o.pr.max && c.credits - o.pr.cost >= reserve)
        .sort((a, b) => a.pr.cost - b.pr.cost);
      if (!opts.length || this.buy(c, { type: 'ability', key: opts[0].k }) !== null) return;
    }
  }

  // ---------- team AI ----------
  // Team comms: a bot that sees, hears or is shot by an enemy tells its team where. Each side keeps the
  // last report per enemy, which is what the team plan reads ("three B main", "spike seen A").
  report(c, enemy, pos, kind) {
    const plan = this.plan, now = this.game.time;
    if (!plan?.intel || !enemy || !pos) return;
    const side = this.side(c), zone = this.zoneOf(pos);
    const prev = plan.intel[side].get(enemy);
    // A sighting is better info than a sound: don't let footsteps overwrite a fresh sighting.
    if (prev && kind === 'heard' && prev.kind === 'seen' && now - prev.t < 1.5) return;
    plan.intel[side].set(enemy, { pos: [...pos], t: now, zone, kind });
    if (kind === 'seen' && side === 'def' && this.spike?.carrier === enemy) plan.spikeSeen = { zone, t: now };
    if (kind !== 'seen') return;
    // The callout: teammates nearby who aren't already fighting check that angle.
    for (const b of this.game.bots) {
      const br = b.brain;
      if (b === c || !b.alive || this.side(b) !== side || !br || now - br.lastSeen < 1 || dist(b.pos, pos) > 30) continue;
      br.lookAt = [...pos];
      br.alertUntil = Math.max(br.alertUntil, now + 1.5);
    }
  }

  // Which part of the map a point is in: site A, site B, or mid.
  zoneOf(pos) {
    const map = this.game.map;
    const mid = map.holds?.mid?.[0]?.pos;
    let best = 'mid', bd = mid ? dist(pos, mid) : Infinity;
    for (const s of ['A', 'B']) {
      const st = map.sites[s];
      if (!st) continue;
      const d = this.inSite(pos) === st ? 0 : dist(pos, st.center);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // How many living enemies this side has had reported in a zone within the last `win` seconds.
  seenIn(side, zone, win) {
    const now = this.game.time;
    let n = 0;
    for (const [e, r] of this.plan?.intel?.[side] || []) if (e.alive && r.zone === zone && now - r.t < win) n++;
    return n;
  }

  // A point on the defenders' way in to `pos` (the spike, or a site taken over), about `back` metres short of
  // it: where a retake groups up.
  retakeSpot(pos, back = 17) {
    const map = this.game.map, sp0 = map.teamSpawns.def;
    const from = sp0?.length ? [sp0[0].x, 0, sp0[0].z] : pos;
    const path = map.findPath(map.nearestWalkable(...map.cellOf(from[0], from[2])), map.nearestWalkable(...map.cellOf(pos[0], pos[2])));
    if (!path) return [pos[0], pos[1], pos[2]];
    for (let i = path.length - 1; i >= 0; i--) {
      const [cx, cz] = path[i], c = map.cellCenter(cx, cz);
      if (Math.hypot(c.x - pos[0], c.z - pos[2]) >= back) return [c.x, map.heights[cz][cx], c.z];
    }
    const [cx, cz] = path[0], c = map.cellCenter(cx, cz);
    return [c.x, map.heights[cz][cx], c.z];
  }

  // Post-plant spots: open floor 7 to 20 m from the spike with a clear view of it, so the attackers can play
  // off the spike from cover instead of standing on it. The ones closest to `near` come first.
  postSpots(sp, near) {
    const g = this.game, map = g.map, target = [sp.pos[0], sp.pos[1] + 0.3, sp.pos[2]];
    if (!this.plan.postCells || this.plan.postFor !== sp.plantedAt) {
      this.plan.postFor = sp.plantedAt;
      this.plan.postCells = map.walkable.map(([cx, cz]) => { const c = map.cellCenter(cx, cz); return [c.x, map.heights[cz][cx], c.z]; })
        .filter(p => { const d = dist(p, sp.pos); return d > 7 && d < 20 && Math.abs(p[1] - sp.pos[1]) < 4; })
        .filter(p => g.world.lineOfSight([p[0], p[1] + 1.5, p[2]], target));
    }
    return this.plan.postCells.slice().sort((a, b) => dist(a, near) - dist(b, near));
  }

  planBots(fresh) {
    const g = this.game, map = g.map, sp = this.spike, now = g.time;
    if (!map.holds) return;
    const bots = g.bots.filter(b => b.alive);
    if (fresh && this.phase === 'buy') {
      // New round: attackers pick a site and split into a main-lane group and a mid group; defenders take
      // two on A, one mid, two on B.
      const site = Math.random() < 0.5 ? 'A' : 'B';
      const defRoles = shuffle(['A', 'A', 'mid', 'B', 'B']);
      // Attack calls: a fast rush now and then, but mostly a default that takes map control and gathers info
      // before calling the site, sometimes with someone lurking the other site.
      const r = Math.random(), style = r < 0.2 ? 'rush' : r < 0.72 ? 'default' : 'lurk';
      this.plan = { site, style, defRoles: new Map(), atkRoles: new Map(), pushed: new Set(), intel: { atk: new Map(), def: new Map() }, spikeSeen: null, defCall: null, leaned: false, called: false, switched: false, stats: { rot: 0, lean: 0, switch: 0, save: 0 } };
      let di = 0, ai = 0;
      for (const c of g.combatants) {
        if (this.side(c) === 'def') this.plan.defRoles.set(c, defRoles[di++ % 5]);
        else { const i = ai++; this.plan.atkRoles.set(c, style === 'lurk' && i === 4 ? 'lurk' : i < 3 ? 'main' : 'mid'); }
      }
    }
    const plan = this.plan;
    if (!plan) return;
    const jitter = (p, r) => [p[0] + (Math.random() - 0.5) * r, p[1], p[2] + (Math.random() - 0.5) * r];
    const siteSpot = (name, r = 0.7) => { const s = map.sites[name]; return [s.min[0] + (s.max[0] - s.min[0]) * (0.5 + (Math.random() - 0.5) * r), 0, s.min[2] + (s.max[2] - s.min[2]) * (0.5 + (Math.random() - 0.5) * r)]; };
    // Where to plant: an open floor cell of the site (a random point in the site's box often lands inside a
    // crate, which the carrier then walks into for the rest of the round).
    const plantSpot = (name) => {
      const cells = this.plantCells(name);
      if (!cells.length) return siteSpot(name, 0.5);
      const [cx, cz] = pick(cells), c = map.cellCenter(cx, cz);
      return [c.x, map.heights[cz][cx], c.z];
    };
    const live = this.phase === 'live', since = now - (this.liveAt || now), left = this.phaseEnd - now;
    const other = (s) => s === 'A' ? 'B' : 'A';
    const atkAlive = this.alive('atk').length, defAlive = this.alive('def').length;

    // ----- Defenders read the info and call a rotation, like a team on comms -----
    // The spike seen, three or more on a site (or most of what's left of them), or a fight two attackers
    // took there: that's the hit, so everyone but the far-site anchor goes. Two seen with no spike: the mid
    // player leans over. One seen: probably a lurk, nobody moves. A site with no contact while the other has
    // it is the one that rotates out.
    if (live && sp.state !== 'planted') {
      let call = null;
      for (const s of ['A', 'B']) {
        const n = this.seenIn('def', s, 10), spike = plan.spikeSeen && plan.spikeSeen.zone === s && now - plan.spikeSeen.t < 20;
        if (spike || n >= 3 || (n >= 2 && n >= atkAlive - 1)) call = call && !spike ? call : s;
      }
      if (call && plan.defCall?.site !== call) {
        // Already on the site in numbers: the rotators don't run into it one at a time, they set up on the
        // way in and hold for the retake.
        plan.defCall = { site: call, at: now, delay: this.seenIn('def', call, 10) >= 3 ? this.retakeSpot(map.sites[call].center, 14) : null };
        const all = this.seenIn('def', call, 10) >= 4 || defAlive <= 2;
        const anchor = [...plan.defRoles.entries()].find(([c, r]) => r === other(call) && c.alive)?.[0];
        for (const [c, r] of plan.defRoles) {
          if (!c.alive || !c.brain || r === call || (c === anchor && !all)) continue;
          plan.defRoles.set(c, call);
          c.brain.rotateAt = now + 0.4 + Math.random(); // a moment to hear the call and turn around
          plan.stats.rot++;
        }
      } else if (!plan.defCall && !plan.leaned) {
        const lean = ['A', 'B'].find(s => this.seenIn('def', s, 8) === 2);
        const midder = lean && [...plan.defRoles.entries()].find(([c, r]) => r === 'mid' && c.alive && c.brain)?.[0];
        if (midder) { plan.leaned = true; plan.defRoles.set(midder, lean); midder.brain.rotateAt = now + 0.5; plan.stats.lean++; }
      }
    }

    // ----- Attackers call the site from what the default showed them -----
    if (live && sp.state !== 'planted') {
      const resist = (s) => this.seenIn('atk', s, 25);
      if (!plan.called && plan.style !== 'rush' && now >= this.goTime - 4) {
        // Hit the site that showed fewer defenders; if both look the same, stick with the plan.
        plan.called = true;
        const s = plan.site, o = other(s);
        if (resist(s) >= resist(o) + 2 || (resist(s) >= 2 && resist(o) === 0)) { plan.site = o; plan.stats.switch++; this.goTime = now + 7; this.restage(); }
      }
      // Up two players or more: no need to wait, go now.
      if (now < this.goTime && atkAlive - defAlive >= 2) this.goTime = now + 1;
      // Never leave the execute so late there's no time to plant.
      if (this.goTime > this.liveAt + 55) this.goTime = this.liveAt + 55;
      // The hit stalled against a stack with plenty of time left: rotate through to the other site, once.
      if (!plan.switched && now > this.goTime + 10 && left > 40 && atkAlive >= 3 && resist(plan.site) >= 3 && resist(other(plan.site)) <= 1) {
        plan.switched = true; plan.site = other(plan.site); plan.stats.switch++; this.goTime = now + 7; this.restage();
      }
    }

    for (const b of bots) {
      const br = b.brain;
      const side = this.side(b);
      // A healer holding her revive walks to a fallen teammate (the human player first) when it's safe.
      if (b.kit?.id === 'solace' && b.kit.ultPoints >= b.kit.ultCost && this.phase !== 'buy' && now - (br.lastSeen ?? -10) > 2) {
        const body = g.combatants.filter(c => c !== b && !c.alive && c.deathPos && !g.isEnemy(b, c) && dist(b.pos, c.deathPos) < 40)
          .sort((x, y) => (x.isBot ? 0 : -25) + dist(b.pos, x.deathPos) - ((y.isBot ? 0 : -25) + dist(b.pos, y.deathPos)))[0];
        if (body) { if (br.goal?.kind !== 'revive' || br.goal.who !== body) br.goal = { kind: 'revive', pos: [...body.deathPos], look: body.deathPos, who: body }; continue; }
      }
      if (br.goal?.kind === 'revive') br.goal = null;
      if (side === 'def') {
        if (sp.state === 'planted') {
          const tleft = sp.plantedAt + ROUND.spike - now, need = sp.halfDone ? ROUND.defuseHalf : ROUND.defuse;
          // No time left to get there and defuse: save the gun, out of the blast.
          if (atkAlive > 0 && tleft < need + dist(b.pos, sp.pos) / 6 + 0.5 && dist(b.pos, sp.pos) > 2) {
            if (br.goal?.kind !== 'save') {
              const s0 = map.teamSpawns.def[0];
              br.goal = { kind: 'save', pos: s0 ? [s0.x, s0.y, s0.z] : jitter(b.pos, 4), look: sp.pos };
              plan.stats.save++;
            }
            continue;
          }
          // Retake together, not one by one: those far from the spike group up on the way in first, and the
          // team goes once two are there (or everyone left is), or the clock says go.
          plan.retake ||= { pos: this.retakeSpot(sp.pos), go: false };
          const rt = plan.retake, team = this.alive('def');
          if (!rt.go) {
            const ready = team.filter(c => dist(c.pos, rt.pos) < 8 || dist(c.pos, sp.pos) < dist(rt.pos, sp.pos)).length;
            if (ready >= Math.min(2, team.length) || tleft < need + 14) rt.go = true;
          }
          if (!rt.go && dist(b.pos, sp.pos) > dist(rt.pos, sp.pos) + 3) {
            if (br.goal?.kind !== 'regroup') br.goal = { kind: 'regroup', pos: jitter(rt.pos, 3), look: sp.pos, hold: true };
            continue;
          }
          // Everyone collapses on the spike; the closest defuses.
          const closest = team.filter(c => c.isBot).sort((x, y) => dist(x.pos, sp.pos) - dist(y.pos, sp.pos))[0];
          // The others spread around it and watch outward, covering the defuser.
          const cover = () => { const p = jitter(sp.pos, 9); return { pos: p, look: [p[0] + (p[0] - sp.pos[0]) * 3, 0, p[2] + (p[2] - sp.pos[2]) * 3] }; };
          if (b === closest) {
            if (!br.goal || br.goal.action !== 'defuse') br.goal = { kind: 'spike', pos: [...sp.pos], look: sp.pos, action: 'defuse' };
            // Out of time: commit to the defuse even with enemies around (needs the whole 7 s, or 3.5 after half).
            br.goal.commit = tleft < need + 1.5;
          } else if (!br.goal || br.goal.kind !== 'spike' || br.goal.action || fresh) { const cv = cover(); br.goal = { kind: 'spike', pos: cv.pos, look: cv.look, hold: true }; }
          continue;
        }
        const role = plan.defRoles.get(b) || 'mid';
        // An aggressive defender looks for info in a lane when nothing has happened for a while.
        if (live && !plan.defCall && since > 16 && since < 40 && br.aggr > 0.65 && !plan.pushed.has(b) && !this.seenIn('def', role, 15)) {
          plan.pushed.add(b);
          const lane = role === 'mid' ? map.stage[pick(['A', 'B'])].mid : map.stage[role].main;
          br.goal = { kind: 'push', pos: jitter(pick(lane), 3), look: map.teamSpawns.atk[0] ? [map.teamSpawns.atk[0].x, 0, map.teamSpawns.atk[0].z] : null, hold: true, quiet: true };
          br.nextShift = now + 14;
          continue;
        }
        // Pushed out but the call went elsewhere: drop it and rotate.
        if (br.goal?.kind === 'push' && now < br.nextShift && !(plan.defCall && plan.defCall.site !== role)) continue;
        if (br.rotateAt && now < br.rotateAt) continue; // still finishing what it was doing before the rotate
        const rotating = br.rotateAt && br.goal?.kind === 'hold' && br.goal.role !== role;
        const dc = plan.defCall;
        const list = dc?.delay && dc.site === role && (br.rotateAt || br.rotatedTo === role) ? [{ pos: dc.delay, look: map.sites[role].center }] : map.holds[role];
        const idx = [...plan.defRoles.entries()].filter(([c, r]) => r === role).findIndex(([c]) => c === b);
        // Holding: swap to another spot on the same site every so often instead of camping one pixel.
        if (!br.goal || br.goal.kind !== 'hold' || rotating || fresh || (live && now >= (br.nextShift || 0))) {
          const k = fresh || !br.goal || rotating ? Math.max(0, idx) : Math.floor(Math.random() * list.length);
          const h = list[k % list.length];
          br.goal = { kind: 'hold', role, pos: jitter(h.pos, 2), look: h.look, hold: true };
          br.nextShift = now + 6 + Math.random() * 7;
          if (br.rotateAt) br.rotatedTo = role;
          br.rotateAt = 0;
        }
      } else {
        if (sp.state === 'planted') {
          // A defuse started: swing on it. Otherwise play off the spike from a spot that sees it.
          if (sp.defuser && br.goal?.kind === 'post' && now - br.lastSeen > 1) { br.lastSeenPos = [...sp.pos]; br.pushUntil = now + 1.5; }
          if (!br.goal || br.goal.kind !== 'post' || fresh || now >= (br.nextShift || 0)) {
            const spots = this.postSpots(sp, b.pos);
            const p = spots.length ? jitter(pick(spots.slice(0, 6)), 1) : [sp.pos[0] + (Math.random() - 0.5) * 16, 0, sp.pos[2] + (Math.random() - 0.5) * 16];
            br.goal = { kind: 'post', pos: p, look: sp.pos, hold: true };
            br.nextShift = now + 9 + Math.random() * 8; // reposition during the post-plant
          }
          continue;
        }
        // Lost round with no way to plant in time (or alone against a full team late): save the gun.
        if (live && left < 20 && (atkAlive === 1 && defAlive >= 3 || (sp.carrier === b || sp.state === 'carried') && left < ROUND.plant + (sp.carrier ? dist(sp.carrier.pos, map.sites[plan.site].center) / 6 : 0) + 1)) {
          if (br.goal?.kind !== 'save') { const s0 = map.teamSpawns.atk[0]; br.goal = { kind: 'save', pos: s0 ? [s0.x, s0.y, s0.z] : jitter(b.pos, 4), look: map.sites[plan.site].center, quiet: true }; plan.stats.save++; }
          continue;
        }
        if (sp.state === 'dropped') {
          const closest = this.alive('atk').filter(c => c.isBot).sort((x, y) => dist(x.pos, sp.pos) - dist(y.pos, sp.pos))[0];
          if (b === closest) { br.goal = { kind: 'pickup', pos: [...sp.pos] }; continue; }
        }
        const role = plan.atkRoles.get(b) || 'main';
        if (this.phase === 'buy') {
          // Buy phase: walk up to the barrier of the lane this player will take, ready to go.
          const site = role === 'lurk' ? other(plan.site) : plan.site;
          const spots = map.buyStage?.[site]?.[role === 'mid' ? 'mid' : 'main'];
          if (!spots) { br.goal = null; continue; }
          if (!br.goal || br.goal.kind !== 'buystage' || fresh) {
            const k = [...plan.atkRoles.entries()].filter(([c, r]) => r === role).findIndex(([c]) => c === b);
            br.goal = { kind: 'buystage', pos: jitter(spots[Math.max(0, k) % spots.length], 1.5), look: map.sites[site].center, hold: true };
          }
          continue;
        }
        // The carrier plants on the called site, whatever role it was given (a lurker holding it would never plant).
        if (sp.carrier === b && now >= this.goTime + 3) {
          if (!br.goal || br.goal.kind !== 'plant' || br.goal.site !== plan.site) br.goal = { kind: 'plant', site: plan.site, pos: plantSpot(plan.site), action: 'plant' };
          continue;
        }
        if (role === 'lurk' && sp.carrier !== b) {
          // The lurker sits quietly in the other site's main, then hits it as the execute starts, catching the
          // defenders who rotate off it (or the spike is down, or it's late).
          const o = other(plan.site);
          if (now > this.goTime + 5 || since > 45) { if (!br.goal || br.goal.kind !== 'entry') br.goal = { kind: 'entry', pos: siteSpot(o, 0.8), look: siteSpot(o, 0.2), hold: true }; }
          else if (!br.goal || br.goal.kind !== 'stage' || now >= (br.nextShift || 0)) { br.goal = { kind: 'stage', pos: jitter(pick(map.stage[o].main), 3), look: map.sites[o].center, hold: true, quiet: true }; br.nextShift = now + 6 + Math.random() * 5; }
          continue;
        }
        const st = map.stage[plan.site][role === 'lurk' ? 'main' : role]; // a lurker holding the spike stages with the main group
        const executing = now >= this.goTime;
        if (!executing) {
          // Staging: keep moving between spots in the lane rather than standing still, quietly.
          if (!br.goal || br.goal.kind !== 'stage' || now >= (br.nextShift || 0)) { br.goal = { kind: 'stage', pos: jitter(pick(st), 3), look: map.sites[plan.site].center, hold: true, quiet: plan.style !== 'rush' }; br.nextShift = now + 3 + Math.random() * 3; }
        } else if (sp.carrier === b) {
          // The carrier lets the entry players go first, then follows to plant (above).
          if (!br.goal || br.goal.kind !== 'stage') br.goal = { kind: 'stage', pos: jitter(pick(st), 2), look: map.sites[plan.site].center, hold: true };
        } else if (!br.goal || br.goal.kind !== 'entry' || br.goal.site !== plan.site) br.goal = { kind: 'entry', site: plan.site, pos: siteSpot(plan.site, 0.9), look: siteSpot(plan.site, 0.2), hold: true };
      }
    }
  }

  // The attack changed its call: everyone drops their spot and stages for the new site.
  restage() {
    for (const c of this.alive('atk')) if (c.brain && c.brain.goal?.kind !== 'pickup') { c.brain.goal = null; c.brain.nextShift = 0; }
  }
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); }

// ---------- online client ----------
// The host runs the real RoundMode. A client mirrors it: phase, timers, score and spike come from the
// host's snapshots (net.js), and only the local player is handled here (spawning, buying through the host,
// freezing while planting or defusing). Teams are relabelled so the local player's team is always team 0,
// which is what the HUD expects; `flip` says whether that swaps the host's numbering.
export class NetRoundMode extends RoundMode {
  constructor(game, opts) {
    super(game, opts);
    this.mirror = true;
    this.flip = !!opts.flip;
    this.startSide = opts.startSide || 'atk';
    this.net = opts.net;
  }

  setup() {
    const p = this.game.player;
    p.team = 0;
    p.credits = this.opts.credits ?? ECON.start;
    p.agentId = p.kit?.id;
    p.inv = { primary: null, secondary: new Gun(WEAPONS.classic), melee: new Gun(WEAPONS.knife), ability: null };
    p.armor = 0; p.survived = false;
    if (p.kit) { p.kit.charges.c = 0; p.kit.charges.q = 0; p.kit.charges.e = 0; }
    this.game.bots = [];
    this.boughtThisRound = new Map();
    this.barrierBoxes = [];
    this.round = 0;
  }

  // Host team number <-> local team number.
  local(t) { return this.flip ? 1 - t : t; }

  // The host started a round: clear the world, apply the halftime / overtime rules to us and spawn where told.
  startRoundNet({ r, sp, ss }) {
    const g = this.game, p = g.player, now = g.time;
    const half = r === ROUND.half + 1, ot = r > ROUND.half * 2;
    this.round = r;
    if (ss) this.startSide = this.flip ? (ss === 'atk' ? 'def' : 'atk') : ss;
    for (const w of g.walls) g.removeWall(w);
    g.walls = []; g.smokes = []; g.zones = []; g.devices = []; g.eventide = null; g.drops = [];
    if (g.contract) g.contract = null;
    this.emit('roundClear');
    if (half) { p.survived = false; p.inv.primary = null; p.inv.secondary = new Gun(WEAPONS.classic); p.armor = 0; p.inv.ability = null; if (p.kit) { p.kit.charges.c = 0; p.kit.charges.q = 0; p.kit.charges.e = 0; p.kit.ultPoints = 0; } }
    this.boughtThisRound = new Map();
    this.resetOrbs();
    this.phase = 'buy';
    this.spawn(p, now, sp);
    this.setBarriers(true);
    this.emit('round', { round: r });
  }

  // Snapshot of the host's mode (see NetSession.modeState).
  applyState(m, byNid) {
    const g = this.game, now = g.time, p = g.player;
    const prev = this.phase;
    if (!this.round) { this.round = m.r; if (m.ph === 'buy') this.setBarriers(true); }
    this.round = Math.max(this.round, m.r);
    this.score = this.flip ? [m.sc[1], m.sc[0]] : [m.sc[0], m.sc[1]];
    if (m.ss) this.startSide = this.flip ? (m.ss === 'atk' ? 'def' : 'atk') : m.ss;
    this.phaseEnd = now + m.pe;
    const s = m.sp;
    const old = this.spike;
    this.spike = s ? {
      state: s.st, pos: s.pos, carrier: byNid(s.car) || null, plantProg: s.pp, defuseProg: s.dp, defuser: byNid(s.df) || null,
      plantedAt: now - s.pa, site: s.site, halfDone: s.hd,
    } : null;
    if (m.ob) {
      if (!this.orbs || this.orbs.length !== m.ob.length) this.resetOrbs();
      m.ob.forEach(([taken, prog, by], i) => {
        const o = this.orbs[i];
        if (!o) return;
        if (taken && !o.taken) this.emit('orbTaken', { who: byNid(by), pos: o.pos });
        o.taken = !!taken; o.prog = prog; o.by = byNid(by) || null;
      });
    }
    this.phase = m.ph;
    if (prev !== m.ph) {
      if (prev === 'buy' && m.ph !== 'buy') { this.setBarriers(false); this.liveAt = now; this.emit('live'); }
      if (m.ph === 'planted' && this.spike) this.emit('planted', { who: this.spike.carrier, site: this.spike.site, pos: this.spike.pos });
      if (m.ph === 'end' && m.lr) {
        p.survived = p.alive;
        this.lastResult = { ...m.lr, winTeam: this.local(m.lr.winTeam) };
        this.history.push({ winner: this.lastResult.winTeam, side: m.lr.winnerSide, reason: m.lr.reason });
        this.emit('roundEnd', this.lastResult);
      }
    }
    if (old && this.spike && old.state !== 'exploded' && this.spike.state === 'exploded') this.emit('detonate', { pos: this.spike.pos });
    if (old && this.spike && !old.halfDone && this.spike.halfDone) this.emit('defuseHalf');
  }

  // Only the local player: hold still while planting or defusing (the host does the real progress).
  tick(now) {
    const g = this.game, p = g.player, sp = this.spike;
    if (!p.alive || !p.input.use) return;
    if (this.orbNear(p) && (this.phase === 'live' || this.phase === 'planted')) this.channel(p, now);
    if (!sp) return;
    if (sp.state === 'carried' && sp.carrier === p && this.phase === 'live' && this.inSite(p.pos) && p.grounded) this.channel(p, now);
    else if (sp.state === 'planted' && this.side(p) === 'def' && Math.hypot(p.pos[0] - sp.pos[0], p.pos[2] - sp.pos[2]) < 1.8) this.channel(p, now);
  }

  // Purchases go through the host, which owns credits; the result comes back to applyPurchase.
  buy(c, item) {
    if (c === this.game.player && !this.applying) { if (!this.canBuy(c)) return 'Buying is only possible during the buy phase'; this.net?.requestBuy(item, false); return null; }
    return super.buy(c, item);
  }
  sell(c, item) {
    if (c === this.game.player && !this.applying) { if (!this.canBuy(c)) return 'Can only sell during the buy phase'; this.net?.requestBuy(item, true); return null; }
    return super.sell(c, item);
  }
  applyPurchase(item, sell, credits) {
    const p = this.game.player;
    this.applying = true;
    p.credits = 99999; // the host already checked the price; credits are set from its answer below
    const err = sell ? super.sell(p, item) : super.buy(p, item);
    this.applying = false;
    p.credits = credits;
    return err;
  }

  // Round flow, economy and bots all live on the host.
  startRound() {}
  endRound() {}
  afterRound() {}
  onKill() {}
  planBots() {}
  botBuy() {}
}
