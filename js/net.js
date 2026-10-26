// Online play with no game server. One browser hosts: it runs the real match (bots, damage, kills,
// respawns, score) and streams snapshots; everyone else runs their own movement and aim locally and sends
// their state and hit claims to the host (favour-the-shooter, like most browser shooters).
//
// Transports:
//   local  BroadcastChannel: tabs and windows of this browser on the same origin. Nothing leaves the machine.
//   peer   PeerJS (WebRTC data channels): players on other machines. PeerJS is loaded on demand; its public
//          broker only introduces the browsers to each other, game traffic then flows peer to peer.
//
// Both modes work online: deathmatch, and 5v5 rounds where joiners are split evenly across the teams and
// bots fill the empty slots (a joiner takes over a bot; a bot takes over from a player who leaves).
//
// Agent select: a room usually opens on the pick screen (agentselect.js). The host owns the Lobby, everyone
// else sends hover / lock requests and draws the state it broadcasts; when the pick is done the host starts
// the match and welcomes everyone in it. Someone who joins a match already running first gets a 'pick'
// message with the agents they can't have, picks one, and then joins with it.
import { PLAYER, MATCH } from './config.js';
import { WEAPONS } from './weapons.js';
import { Combatant } from './entity.js';
import { Gun } from './gun.js';
import { Kit, AGENTS } from './abilities.js';
import { applyCast } from './botkit.js';
import { Bot, BOT_NAMES } from './bot.js';
import { TEAM_COLORS } from './rounds.js';
import { sanitizeSkin, registerSkin, SKINS } from './skins.js';
import { MELEE, meleeId } from './melee.js';
import { takenAgents } from './agentselect.js';

// TIMEOUT: silence that counts as gone (a closed connection or a 'bye' is noticed at once; this is for a crashed
// tab or a dead network, and has to ride out a few seconds of wifi trouble). LOAD_TIMEOUT: a joiner's first
// match message can take this long, since it downloads and builds the map after the welcome.
// Bump whenever messages change shape or meaning. A host turns away joiners on another version (usually a
// browser still running cached files from before a deploy) instead of letting them half work.
export const NET_VERSION = 3;
const SNAP_HZ = 20, STATE_HZ = 30, TIMEOUT = 15, LOAD_TIMEOUT = 60, PEER_PREFIX = 'tapfire-';
// What a client only sends once its copy of the match is running (anything else may be left over from the
// pick screen, like its last 'lhb', and says nothing about whether it has finished loading).
const IN_MATCH = new Set(['st', 'hb', 'in', 'fx', 'hit', 'drop', 'uhit', 'take', 'buy']);
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const r3 = (v) => Math.round(v * 1000) / 1000;
const newId = () => Math.random().toString(36).slice(2, 10);
export const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ---------- transports: send(msg, to?) / onmessage(msg) / onpeergone(id) / close() ----------
class LocalTransport {
  constructor(room, self) {
    this.self = self;
    this.ch = new BroadcastChannel('tapfire-room:' + room);
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.from === this.self || (m.to && m.to !== this.self)) return;
      this.onmessage?.(m);
    };
  }
  async open() {}
  send(m, to) { m.from = this.self; if (to) m.to = to; else delete m.to; this.ch.postMessage(m); }
  close() { this.ch.close(); }
}

// Extra PeerJS options (host, port, path...) to use a broker other than the public one; the checks point it at a local one.
export const peerOptions = {};

let peerLib = null;
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    // Prefer a copy shipped next to the game (vendor/peerjs.min.js), fall back to the CDN.
    s.src = 'vendor/peerjs.min.js';
    s.onload = () => res(window.Peer);
    s.onerror = () => {
      const c = document.createElement('script');
      c.src = PEERJS_URL; c.crossOrigin = 'anonymous';
      c.onload = () => res(window.Peer);
      c.onerror = () => { peerLib = null; rej(new Error('Could not load PeerJS (offline?)')); };
      document.head.appendChild(c);
    };
    document.head.appendChild(s);
  });
  return peerLib;
}

class PeerTransport {
  constructor(room, self, isHost) {
    this.room = room; this.self = self; this.isHost = isHost;
    this.conns = new Map(); // nid -> DataConnection
  }
  async open() {
    const Peer = await loadPeerJS();
    const hostPeer = PEER_PREFIX + this.room;
    this.peer = new Peer(this.isHost ? hostPeer : undefined, { debug: 0, ...peerOptions });
    await new Promise((res, rej) => {
      this.peer.on('open', res);
      this.peer.on('error', (e) => rej(new Error(e.type === 'unavailable-id' ? 'That room code is already hosted' : e.type === 'peer-unavailable' ? 'No host with that room code' : e.message || String(e))));
    });
    this.peer.on('error', (e) => this.onerror?.(e));
    if (this.isHost) {
      this.peer.on('connection', (conn) => this.wire(conn));
    } else {
      const conn = this.peer.connect(hostPeer, { serialization: 'json', reliable: true });
      await new Promise((res, rej) => {
        conn.on('open', res);
        conn.on('error', rej);
        this.peer.on('error', rej);
        setTimeout(() => rej(new Error('No host with that room code')), 10000);
      });
      this.hostConn = conn;
      this.wire(conn);
    }
  }
  wire(conn) {
    let nid = null;
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (this.isHost) { nid ||= String(m.from || ''); m.from = nid; this.conns.set(nid, conn); } // the host trusts the connection, not the message
      if (m.to && m.to !== this.self) return;
      this.onmessage?.(m);
    });
    conn.on('close', () => { if (nid) { this.conns.delete(nid); this.onpeergone?.(nid); } else if (!this.isHost) this.onpeergone?.('host'); });
  }
  send(m, to) {
    m.from = this.self;
    if (!this.isHost) { if (this.hostConn?.open) this.hostConn.send(m); return; }
    if (to) { m.to = to; const c = this.conns.get(to); if (c?.open) c.send(m); return; }
    delete m.to;
    for (const c of this.conns.values()) if (c.open) c.send(m);
  }
  close() { try { this.peer?.destroy(); } catch { /* already gone */ } }
}

// ---------- ability input replication ----------
// Every peer keeps a Kit for every player and bot. The owner of a combatant (a client for its own player,
// the host for its player and the bots) records the ability inputs it used each tick, and every other peer
// replays them on its copy, so smokes, walls, flashes, blades and the rest happen everywhere. Damage from
// abilities is only applied by the host's copy; statuses (blind, slow, stun...) by each peer's own copy.
const BIT = { abQ: 1, abE: 2, abC: 4, abX: 8, firePressed: 16, altPressed: 32, reload: 64, fire: 128, alt: 256, abCHeld: 512, abQHeld: 1024, abEHeld: 2048, jumpHeld: 4096, crouch: 8192 };
const EDGES = BIT.abQ | BIT.abE | BIT.abC | BIT.abX;
const PRESS = ['abQ', 'abE', 'abC', 'abX', 'firePressed', 'altPressed', 'reload'];
const CTX = ['firePressed', 'altPressed', 'reload', 'fire', 'alt', 'jumpHeld', 'crouch'];
const HELD = ['abCHeld', 'abQHeld', 'abEHeld'];
const KEY_OF = { abQ: 'q', abE: 'e', abC: 'c' };
// The kit is doing something the fire / alt / reload buttons steer (aiming an ability, blades out...).
const inAbility = (k) => !!(k.armed || k.blades || k.beams || k.launcher || k.highGear || k.overdrive || k.drift || k.pilot || k.view || k.mapPick || k.shadow || k.grab || k.tailwind);

// Direct kit calls from the map picker UI (and picking utility back up) are recorded too.
let replaying = false;
for (const name of ['mapClick', 'mapConfirm', 'mapCancel', 'pickUp']) {
  const orig = Kit.prototype[name];
  Kit.prototype[name] = function (...args) {
    if (!replaying) this.owner.game.emit('kitAct', { who: this.owner, act: [name, ...args] });
    return orig.apply(this, args);
  };
}

// ---------- session ----------
export class NetSession {
  constructor(game, { onStatus = () => {}, onWelcome = () => {}, onEnd = () => {}, onLeft = () => {}, onRoster = () => {}, onBuy = () => {}, onLobby = () => {}, onLobbyDone = () => {}, onPick = () => {} } = {}) {
    this.game = game;
    this.cb = { onStatus, onWelcome, onEnd, onLeft, onRoster, onBuy, onLobby, onLobbyDone, onPick };
    this.role = null;
    this.nid = newId();
    this.peers = new Map(); // host: nid -> { c, seen, seenWall, life, name }; client: nid -> { c, name }
    this.byNid = new Map(); // nid -> Combatant (everyone, including me)
    this.fx = [];
    this.frames = []; // [nid, frame] recorded this tick, sent in the next 'in' message
    this.acts = new Map(); // combatant -> actions recorded since its last frame
    this.dropSeq = 0;
    this.botSeq = 0;
    this.lastSnap = 0; this.lastState = 0;
    this.hookGame();
  }

  get active() { return !!this.role; }
  get rounds() { return !!this.game.mode; }
  // In a running match (not on the pick screen, not still joining).
  get live() { return this.role === 'host' ? !this.lobby : this.role === 'client'; }

  // ---- lifecycle ----
  // With a `lobby` (agentselect.js) the room opens on the pick screen and the match starts later, from
  // startFromLobby(). Without one the host's match is already running and people join it directly.
  // `server` is what the server browser shows ({ name, max }); max caps the people in the room, host included.
  async host({ transport, room, profile, mapJSON, lobby = null, server = {} }) {
    this.close();
    this.room = room; this.profile = profile; this.mapJSON = mapJSON; this.transport = transport;
    this.server = { name: cleanName(server.name || `${profile.name}'s server`, 32), max: clampInt(server.max ?? 10, 2, 10) };
    this.t = transport === 'peer' ? new PeerTransport(room, this.nid, true) : new LocalTransport(room, this.nid);
    this.cb.onStatus(transport === 'peer' ? 'Connecting to the PeerJS broker…' : 'Opening room…');
    await this.t.open();
    this.role = 'host';
    this.t.onmessage = (m) => this.hostRecv(m);
    this.t.onpeergone = (id) => (this.lobby ? this.leaveLobby(id) : this.dropPeer(id));
    if (lobby) {
      this.lobby = lobby;
      this.lobbyPeers = new Map(); // nid -> { profile, seenWall }
      lobby.add(this.nid, cleanName(profile.name), true);
      this.lobbyTimer = setInterval(() => this.lobbyTick(), 100);
      this.cb.onStatus(`Hosting room ${room}`);
      this.lobbyChanged();
      return;
    }
    this.attachHost();
  }

  // The host's match is running: take charge of it.
  attachHost() {
    const g = this.game;
    g.netRole = 'host';
    g.onInputs = () => this.recordInputs();
    g.applyNetInput = (c) => this.applyInput(c);
    g.player.nid = this.nid;
    this.byNid.set(this.nid, g.player);
    for (const b of g.bots) { b.nid = this.nid + ':b' + this.botSeq++; this.byNid.set(b.nid, b); }
    this.cb.onStatus(`Hosting room ${this.room}`);
    this.cb.onRoster(this.roster());
  }

  // The pick is over and main.js has started the match from the lineup: let everyone in.
  startFromLobby() {
    const L = this.lobby, peers = this.lobbyPeers;
    clearInterval(this.lobbyTimer);
    this.lobby = this.lobbyPeers = null;
    this.attachHost();
    for (const p of L.humans) {
      const lp = peers.get(p.n);
      if (lp && p.n !== this.nid) this.admit(p.n, { ...lp.profile, agent: p.a });
    }
    for (const b of this.game.bots) delete b.slotFor; // left during the pick: the bot keeps the place
  }

  async join({ transport, room, profile }) {
    this.close();
    this.room = room; this.profile = { ...profile, v: NET_VERSION };
    this.t = transport === 'peer' ? new PeerTransport(room, this.nid, false) : new LocalTransport(room, this.nid);
    this.cb.onStatus(transport === 'peer' ? 'Connecting to the host…' : 'Looking for the host…');
    await this.t.open();
    this.role = 'joining';
    this.t.onmessage = (m) => this.clientRecv(m);
    this.t.onpeergone = () => this.hostGone();
    // Keep asking until a host answers (a BroadcastChannel host may not be listening yet).
    const hello = () => this.t.send({ k: 'hello', ...this.profile });
    hello();
    this.helloTimer = setInterval(() => { if (this.role === 'joining') hello(); }, 1000);
    this.joinDeadline = setTimeout(() => this.noHost(), 8000);
  }

  close() {
    clearInterval(this.helloTimer); clearTimeout(this.joinDeadline); clearInterval(this.lobbyTimer); clearInterval(this.pickTimer);
    this.lobby = this.lobbyPeers = null;
    if (this.t) { try { this.t.send({ k: 'bye' }); } catch { /* transport already closed */ } this.t.close(); }
    this.t = null;
    if (this.game.netRole) for (const p of this.peers.values()) this.removeCombatant(p.c);
    this.peers.clear(); this.byNid.clear(); this.acts.clear();
    this.frames = []; this.fx = [];
    this.role = null; this.hostId = null;
    this.game.netRole = null;
    this.game.onInputs = this.game.applyNetInput = null;
  }

  // Everyone I simulate for real: my player, and on the host the bots.
  owned() {
    const g = this.game;
    return this.role === 'host' ? [g.player, ...g.bots] : [g.player];
  }

  // ---- game hooks (run for both roles; each checks the role) ----
  hookGame() {
    const g = this.game;
    const damage = g.damage.bind(g);
    g.damage = (target, attacker, amount, info) => {
      if (this.role !== 'client') return damage(target, attacker, amount, info);
      // Client: the host owns health. Report our own gun and knife hits; ability damage is dealt by the host's
      // copy of our kit. Show the hit locally.
      if (attacker !== g.player || !target.remote || !target.alive || amount <= 0 || !WEAPONS[info.def.id]) return;
      this.t.send({ k: 'hit', target: target.nid, amount: Math.round(amount), part: info.part, w: info.def.id, dist: r3(info.dist), wb: !!info.wallbang, life: this.life }, this.hostId);
      const s = attacker.stats; s.hits++; s[info.part]++; s.damage += amount;
      const ra = attacker.reportFor(target); ra.dealt += amount; ra.dealtHits++; ra[info.part]++;
      g.emit('hit', { attacker, target, part: info.part, amount, dealt: amount, point: info.point, killed: false, def: info.def, wallbang: info.wallbang, dot: false });
    };
    // Shootable utility: the host keeps its health. A client reports its own hits; the host tells
    // everyone when something breaks.
    const hitUtil = g.hitUtil.bind(g);
    g.hitUtil = (it, amount, shooter) => {
      if (this.role !== 'client') return hitUtil(it, amount, shooter);
      if (shooter === g.player && it.owner?.nid) this.t.send({ k: 'uhit', o: it.owner.nid, kind: it.kind, pos: it.pos.map(r3), amount: Math.round(amount), life: this.life }, this.hostId);
    };
    g.on('utilBroken', (it) => { if (this.role === 'host' && it.owner?.nid) this.t.send({ k: 'ubrk', o: it.owner.nid, kind: it.kind, pos: it.pos.map(r3) }); });
    // Dropped guns: the host owns them; a client's own drops and pickups go through it.
    const dropGun = g.dropGun.bind(g), pickUp = g.pickUp.bind(g);
    g.dropGun = (c, slot, toss = true) => {
      const d = dropGun(c, slot, toss);
      if (d && this.role === 'client') {
        g.drops.splice(g.drops.indexOf(d), 1); // the host's copy comes back with an id
        if (c === g.player) this.t.send({ k: 'drop', w: d.gun.def.id, mag: d.gun.mag, res: d.gun.reserve, pos: d.pos.map(r3), from: d.from.map(r3), yaw: r3(d.yaw), life: this.life }, this.hostId);
      }
      return d;
    };
    g.pickUp = (c, d) => {
      if (this.role === 'client' && c === g.player && d.nid) this.t.send({ k: 'take', id: d.nid }, this.hostId);
      return pickUp(c, d);
    };
    g.on('drop', (d) => {
      if (this.role !== 'host' || d.nid) return;
      d.nid = ++this.dropSeq;
      this.t.send({ k: 'drop', id: d.nid, w: d.gun.def.id, mag: d.gun.mag, res: d.gun.reserve, pos: d.pos.map(r3), from: d.from.map(r3), yaw: r3(d.yaw), by: d.by?.nid, skin: d.skin });
    });
    g.on('pickup', (d) => { if (this.role === 'host' && d.nid) this.t.send({ k: 'pick', id: d.nid }); });
    g.on('tracer', ({ who, gun, from, to, device }) => {
      if (!this.live || device || who.remote || !who.nid || !WEAPONS[gun.def.id]) return;
      let e = this.fx.find(f => f.n === who.nid);
      if (!e) this.fx.push(e = { n: who.nid, w: gun.def.id, tr: [] });
      e.tr.push([from, to].flat().map(r3));
    });
    g.on('hit', (h) => {
      if (this.role !== 'host') return;
      if (h.target.remote) this.t.send({ k: 'hurt', by: h.attacker?.nid, amount: h.dealt, part: h.part, w: h.def?.id, wn: h.def?.name }, h.target.nid);
      // Ability damage from a remote player's kit (dealt here): give them the hit marker.
      if (h.attacker?.remote && h.attacker !== h.target && !WEAPONS[h.def?.id]) this.t.send({ k: 'dealt', target: h.target.nid, amount: h.dealt, part: h.part, killed: h.killed }, h.attacker.nid);
    });
    g.on('kill', ({ killer, victim, def, headshot, wallbang }) => {
      if (this.role !== 'host') return;
      this.t.send({ k: 'kill', killer: killer.nid, victim: victim.nid, w: def.id, wn: def.name, hs: headshot, wb: wallbang });
    });
    g.on('respawn', ({ who, round, revived }) => {
      if (this.role !== 'host' || !who.remote || round) return; // round spawns are sent with the round ('rs')
      const p = this.peers.get(who.nid);
      if (!p) return;
      p.life++;
      this.t.send({ k: 'respawn', life: p.life, revived: !!revived, sp: { x: who.pos[0], y: who.pos[1], z: who.pos[2], yaw: who.yaw } }, who.nid);
    });
    g.on('round', ({ mode }) => {
      if (this.role !== 'host' || !mode || mode.mirror) return;
      for (const [id, p] of this.peers) {
        p.life++;
        const c = p.c;
        this.t.send({ k: 'rs', r: mode.round, life: p.life, ss: mode.startSide, sp: { x: c.pos[0], y: c.pos[1], z: c.pos[2], yaw: c.yaw } }, id);
      }
    });
    g.on('end', () => {
      if (this.role === 'host') this.t.send({ k: 'end', standings: this.standings(), sc: g.mode?.score });
    });
    g.on('kitAct', ({ who, act }) => {
      if (!this.role || who !== g.player) return; // bots' map picks travel inside their cast
      this.queueAct(who, act);
    });
    g.on('botCast', ({ who, k, dist, power, picks }) => {
      if (this.role !== 'host') return;
      this.queueAct(who, ['cast', k, dist ?? null, power ?? null, (picks || []).map(p => p.map(r3))]);
    });
  }

  queueAct(c, act) {
    let a = this.acts.get(c);
    if (!a) this.acts.set(c, a = []);
    a.push(JSON.parse(JSON.stringify(act)));
  }

  // Record this tick's ability inputs of everyone we own (Game.tick calls this after bots think).
  recordInputs() {
    if (!this.live) return;
    for (const c of this.owned()) {
      if ((!c.alive && !c.kit?.agent.deadCast) || !c.kit || !c.nid) continue; // a dead Thistle still casts
      const i = c.input, kit = c.kit;
      let bits = 0;
      for (const k of ['abQ', 'abE', 'abC', 'abX']) if (i[k]) bits |= BIT[k];
      const ctx = inAbility(kit) || (bits & EDGES);
      if (ctx) for (const k of CTX) if (i[k]) bits |= BIT[k];
      for (const k of HELD) if (i[k]) bits |= BIT[k];
      const acts = this.acts.get(c);
      const held = bits & ~(EDGES | BIT.firePressed | BIT.altPressed | BIT.reload);
      if (!(bits & (EDGES | BIT.firePressed | BIT.altPressed | BIT.reload)) && !acts && held === (c.netSentHeld || 0)) continue;
      c.netSentHeld = held;
      const f = [bits, ...c.pos.map(r3), r3(c.yaw), r3(c.pitch), i.fwd, i.side];
      f.push(ctx ? [kit.dist ?? null, r3(kit.chargeT || 0), kit.rot ? 1 : 0, kit.phase ? 1 : 0, kit.armed?.k || null] : null);
      f.push(acts || null);
      this.acts.delete(c);
      this.frames.push([c.nid, f]);
    }
  }

  // Replay queued ability inputs on a remote combatant's kit (Game.tick, before its kit ticks).
  applyInput(c) {
    const q = c.netQ, i = c.input;
    const held = c.netHeld || 0;
    for (const k of [...HELD, 'fire', 'alt', 'jumpHeld', 'crouch']) i[k] = !!(held & BIT[k]);
    if (!q?.length || !c.kit) return;
    let n = q.length > 6 ? q.length - 3 : 1; // fell behind: catch up
    while (n-- > 0 && q.length) this.applyFrame(c, q.shift());
  }

  applyFrame(c, f) {
    const [bits, x, y, z, yaw, pitch, fwd, side, ctx, acts] = f;
    const kit = c.kit, i = c.input;
    if ([x, y, z].every(Number.isFinite)) { c.pos = [x, y, z]; c.yaw = +yaw || 0; c.pitch = +pitch || 0; }
    i.fwd = +fwd || 0; i.side = +side || 0;
    if (Array.isArray(ctx)) {
      const [dist, chargeT, rot, phase, armedK] = ctx;
      if (dist !== null && Number.isFinite(dist)) { kit.dist = dist; kit.distFor = armedK; }
      if (Number.isFinite(chargeT)) kit.chargeT = chargeT;
      kit.rot = !!rot; kit.phase = !!phase;
    }
    replaying = true;
    try {
      for (const a of Array.isArray(acts) ? acts.slice(0, 8) : []) {
        if (a[0] === 'cast' && ['q', 'e', 'c', 'x'].includes(a[1])) {
          this.trustCast(kit, a[1]);
          applyCast(c, a[1], { dist: a[2] ?? undefined, power: a[3] ?? undefined, picks: (a[4] || []).filter(p => Array.isArray(p) && p.length === 3) });
        } else if (a[0] === 'mapClick' && Array.isArray(a[1])) kit.mapClick(a[1]);
        else if (a[0] === 'mapConfirm') kit.mapConfirm();
        else if (a[0] === 'mapCancel') kit.mapCancel();
        else if (a[0] === 'pickUp' && Array.isArray(a[1]) && a[1].length === 3) kit.pickUp(a[1]);
      }
    } catch (err) { console.warn('ability replay failed', err); }
    replaying = false;
    for (const k of PRESS) if (bits & BIT[k]) {
      i[k] = true;
      if (KEY_OF[k]) this.trustCast(kit, KEY_OF[k]);
      if (k === 'abX') this.trustCast(kit, 'x');
    }
    c.netHeld = bits & ~(EDGES | BIT.firePressed | BIT.altPressed | BIT.reload);
    for (const k of [...HELD, 'fire', 'alt', 'jumpHeld', 'crouch']) i[k] = !!(c.netHeld & BIT[k]);
  }

  // The owner already checked charges and ultimate points; make sure our copy can follow.
  trustCast(kit, k) {
    if (k === 'x') kit.ultPoints = Math.max(kit.ultPoints, kit.ultCost);
    else kit.charges[k] = Math.max(kit.charges[k], 1);
  }

  queueFrames(list, from) {
    for (const [n, f] of Array.isArray(list) ? list.slice(0, 64) : []) {
      if (!Array.isArray(f) || n === this.nid) continue;
      if (from && n !== from) continue; // a client may only send its own
      const c = this.byNid.get(n);
      if (!c || !c.remote) continue;
      (c.netQ ||= []).push(f);
      if (c.netQ.length > 40) c.netQ.splice(0, c.netQ.length - 40);
    }
  }

  // Called once per simulation tick, after game.tick().
  tick() {
    if (!this.live) return;
    const g = this.game, now = g.time;
    if (this.frames.length) { this.t.send({ k: 'in', f: this.frames }, this.role === 'client' ? this.hostId : undefined); this.frames = []; }
    if (this.role === 'host') {
      for (const [id, p] of this.peers) {
        const limit = p.loaded ? TIMEOUT : LOAD_TIMEOUT;
        if (now - p.seen > limit && performance.now() - p.seenWall > limit * 1000) this.dropPeer(id);
      }
      if (now - this.lastSnap >= 1 / SNAP_HZ) { this.lastSnap = now; this.t.send(this.snapshot()); }
    } else {
      const p = g.player;
      if (!p.alive && now - this.lastState >= 0.5) { this.lastState = now; this.t.send({ k: 'hb' }, this.hostId); } // dead: still here
      else if (p.alive && now - this.lastState >= 1 / STATE_HZ) {
        this.lastState = now;
        this.t.send({ k: 'st', life: this.life, p: p.pos.map(r3), v: p.vel.map(r3), y: r3(p.yaw), pi: r3(p.pitch), ca: r3(p.crouchAmount()), w: p.gun?.def.id, u: p.input.use ? 1 : 0, gr: p.grounded ? 1 : 0 }, this.hostId);
      }
      if (performance.now() - this.hostSeen > TIMEOUT * 1000) this.hostGone();
    }
    if (this.fx.length) { this.t.send({ k: 'fx', list: this.fx }, this.role === 'client' ? this.hostId : undefined); this.fx = []; }
  }

  // ---- host side ----
  hostRecv(m) {
    const g = this.game, id = m.from;
    if (this.lobby) { this.lobbyRecv(m); return; }
    if (m.k === 'hello' || m.k === 'peek') {
      if (m.v !== NET_VERSION) { this.t.send({ k: 'version', v: NET_VERSION }, id); return; }
      if (g.state !== 'playing') return;
      const p = this.peers.get(id);
      if (p) { if (m.k === 'hello') this.t.send(this.welcome(id, p), id); return; }
      // Joining mid-match: pick an agent first (the ones in use are greyed out), then join with it.
      if ((this.rounds && this.joinTeam() < 0) || this.humanCount() >= this.server.max) { this.t.send({ k: 'full' }, id); return; }
      const taken = this.takenForJoiner();
      if (m.k === 'peek' || !AGENTS[m.agent] || taken.includes(m.agent)) { this.t.send(this.pickInfo(taken, m.k === 'hello' && !!m.agent, m.k === 'hello'), id); return; }
      this.admit(id, m);
      return;
    }
    const p = this.peers.get(id);
    if (!p) {
      // Someone we already dropped is still playing: tell them, instead of leaving them in a match nobody sees.
      if (IN_MATCH.has(m.k)) this.t.send({ k: 'dropped' }, id);
      return;
    }
    p.seen = g.time; p.seenWall = performance.now();
    if (IN_MATCH.has(m.k)) p.loaded = true;
    const c = p.c;
    if (m.k === 'st') {
      if (m.life !== p.life || !c.alive) return; // stale: sent before the client heard about its respawn
      setTarget(c, m.p, m.y, m.pi, m.ca, m.v);
      setWeapon(c, m.w);
      c.input.use = !!m.u; c.grounded = m.gr !== 0;
    } else if (m.k === 'in') {
      this.queueFrames(m.f, id);
      this.t.send({ k: 'in', f: (m.f || []).filter(x => x?.[0] === id) }); // relay to the other clients
    } else if (m.k === 'hit') {
      const target = this.byNid.get(m.target);
      const def = WEAPONS[m.w];
      if (!target || !def || !c.alive || m.life !== p.life) return;
      // Light sanity checks: a known weapon, plausible damage, the target close to where the shooter says.
      const amount = Math.max(0, Math.min(Number(m.amount) || 0, 160 * (def.pellets || 1)));
      const part = ['head', 'body', 'legs'].includes(m.part) ? m.part : 'body';
      const dist = Math.hypot(target.pos[0] - c.pos[0], target.pos[2] - c.pos[2]);
      if (Math.abs(dist - (Number(m.dist) || 0)) > 6) return;
      g.damage(target, c, amount, { part, def, dist, point: target.eye(), wallbang: !!m.wb });
    } else if (m.k === 'fx') {
      const list = (m.list || []).filter(f => f.n === id).slice(0, 4);
      if (!list.length) return;
      for (const f of list) this.playFx(f);
      this.t.send({ k: 'fx', list }); // relay to everyone else (the sender ignores its own)
    } else if (m.k === 'drop') {
      const def = WEAPONS[m.w];
      if (!def || m.life !== p.life || !Array.isArray(m.pos) || !m.pos.every(Number.isFinite)) return;
      const gun = new Gun(def);
      gun.mag = clampInt(m.mag, 0, def.mag || 0); gun.reserve = clampInt(m.res, 0, def.reserve || 0);
      const d = { gun, pos: m.pos, from: Array.isArray(m.from) ? m.from : m.pos, at: g.time, by: c, yaw: +m.yaw || 0, skin: c.skinOf(def.id) };
      g.drops.push(d);
      if (c.inv[def.slot]?.def === def) c.inv[def.slot] = null;
      g.emit('drop', d); // -> broadcast with an id
    } else if (m.k === 'uhit') {
      if (m.life !== p.life || !c.alive || !Array.isArray(m.pos) || !m.pos.every(Number.isFinite)) return;
      const it = g.findUtil(this.byNid.get(m.o), String(m.kind), m.pos);
      if (it && g.isEnemy(c, it.owner)) g.hitUtil(it, Math.max(0, Math.min(Number(m.amount) || 0, 160)), c);
    } else if (m.k === 'take') {
      const d = g.drops.find(x => x.nid === m.id);
      if (!d) return;
      g.drops.splice(g.drops.indexOf(d), 1);
      g.emit('pickup', d); // the gun itself reaches the proxy through the client's state
    } else if (m.k === 'buy' && g.mode && !g.mode.mirror) {
      const item = cleanItem(m.item);
      if (!item) return;
      const err = m.sell ? g.mode.sell(c, item) : g.mode.buy(c, item);
      this.t.send({ k: 'bought', item, sell: !!m.sell, err, cr: c.credits }, id);
    } else if (m.k === 'bye') this.dropPeer(id);
  }

  // A new player in the running match, playing info.agent.
  admit(id, info) {
    const g = this.game;
    const c = this.rounds ? this.takeBotSlot(id, info) : this.addRemote(id, info);
    if (!c) { this.t.send({ k: 'full' }, id); return null; }
    const p = { c, life: 0, seen: g.time, seenWall: performance.now(), name: c.name };
    this.peers.set(id, p);
    if (!this.rounds) g.respawn(c); // emits respawn -> tells the client where it spawned
    this.cb.onStatus(`${c.name} joined room ${this.room}`);
    this.t.send({ k: 'roster', list: this.roster() });
    this.cb.onRoster(this.roster());
    this.t.send(this.welcome(id, p), id);
    return p;
  }

  // People in the room, host included.
  humanCount() { return this.lobby ? this.lobby.humans.length : 1 + this.peers.size; }

  // What the server browser lists for this room (servers.js).
  serverInfo() {
    if (this.role !== 'host') return null;
    const g = this.game, L = this.lobby;
    return {
      room: this.room, transport: this.transport, name: this.server.name, max: this.server.max, players: this.humanCount(),
      mode: L ? L.mode : this.rounds ? 'rounds' : 'dm', map: L ? L.mapName : g.map?.name || g.map?.id || '', phase: L ? 'pick' : 'playing',
    };
  }

  // 5v5: the team a mid-match joiner goes on (fewer people, ties to team 0), or -1 if no bot is left to replace.
  joinTeam() {
    const g = this.game, humans = [0, 0];
    for (const c of g.combatants) if (!c.isBot) humans[c.team]++;
    for (const t of humans[1] < humans[0] ? [1, 0] : [0, 1]) if (g.bots.some(b => b.team === t)) return t;
    return -1;
  }

  // Agents a mid-match joiner can't have: anyone's in deathmatch. In 5v5, the people on the team they'd join;
  // a bot playing the agent they pick gives its place up to them, so bots never block a pick.
  takenForJoiner() {
    const g = this.game, t = this.rounds ? this.joinTeam() : 0;
    const users = this.rounds ? g.combatants.filter(c => !c.isBot && c.team === t) : g.combatants;
    return [...new Set(users.map(c => c.kit?.id).filter(Boolean))];
  }

  pickInfo(taken, retry, withMap) {
    const g = this.game;
    return { k: 'pick', mode: this.rounds ? 'rounds' : 'dm', map: g.map.id, mapJSON: withMap ? this.mapJSON : null, taken, retry };
  }

  // ---- host: the pick screen ----
  lobbyRecv(m) {
    const L = this.lobby, id = m.from;
    if (m.k === 'hello') {
      if (m.v !== NET_VERSION) { this.t.send({ k: 'version', v: NET_VERSION }, id); return; }
      if (!L.get(id)) {
        if (!L.open) { this.t.send({ k: 'wait' }, id); return; } // the pick is finishing: they join the match once it starts
        if (this.humanCount() >= this.server.max || !L.add(id, cleanName(m.name))) { this.t.send({ k: 'full' }, id); return; }
        this.cb.onStatus(`${cleanName(m.name)} joined room ${this.room}`);
      }
      this.lobbyPeers.set(id, { profile: m, seenWall: performance.now() });
      this.lobbyChanged();
      return;
    }
    const lp = this.lobbyPeers.get(id);
    if (!lp) return;
    lp.seenWall = performance.now();
    if (m.k === 'hover' && L.hover(id, m.a)) this.lobbyChanged();
    else if (m.k === 'lock' && L.lock(id, m.a)) this.lobbyChanged();
    else if (m.k === 'bye') this.leaveLobby(id);
  }

  leaveLobby(id) {
    if (!this.lobbyPeers?.has(id)) return;
    this.lobbyPeers.delete(id);
    const p = this.lobby.get(id);
    if (p && this.lobby.open) this.lobby.remove(id); // later than that, a bot takes their slot in the match
    this.cb.onStatus(`${p?.name || 'A player'} left room ${this.room}`);
    this.lobbyChanged();
  }

  lobbyTick() {
    const L = this.lobby;
    if (!L) return;
    const now = performance.now();
    for (const [id, lp] of this.lobbyPeers) if (now - lp.seenWall > TIMEOUT * 1000) this.leaveLobby(id);
    const before = L.phase + L.players.filter(p => p.locked).length;
    if (L.step()) { clearInterval(this.lobbyTimer); this.lobbyChanged(); this.cb.onLobbyDone(L); return; }
    if (before !== L.phase + L.players.filter(p => p.locked).length || now - this.lobbySent > 250) this.lobbyChanged();
  }

  lobbyChanged() {
    const s = this.lobby.state();
    this.lobbySent = performance.now();
    this.t.send({ k: 'lobby', s });
    this.cb.onLobby(s, this.nid, true);
  }

  // From the pick screen, on the host or a client.
  lobbyHover(a) {
    if (this.lobby) { if (this.lobby.hover(this.nid, a)) this.lobbyChanged(); }
    else if (this.role === 'lobby') this.t.send({ k: 'hover', a }, this.hostId);
  }
  lobbyLock(a) {
    if (this.lobby) { if (this.lobby.lock(this.nid, a)) this.lobbyChanged(); }
    else if (this.role === 'lobby') this.t.send({ k: 'lock', a }, this.hostId);
  }
  lobbyStart() {
    if (this.lobby?.phase !== 'wait') return;
    this.lobby.start();
    this.lobbyChanged();
  }

  welcome(id, p) {
    const g = this.game, c = p.c, mode = g.mode;
    const w = {
      k: 'welcome', you: id, agent: c.kit?.id || null, map: g.map.id, mapJSON: this.mapJSON, roster: this.roster(), life: p.life,
      mode: mode ? 'rounds' : 'dm',
      opts: { killLimit: g.killLimit, timeLimit: g.timeLimit, timeLeft: g.timeLimit - g.time },
      sp: { x: c.pos[0], y: c.pos[1], z: c.pos[2], yaw: c.yaw },
    };
    if (mode) {
      Object.assign(w, {
        team: c.team, ss: mode.startSide, m: this.modeState(), alive: c.alive, credits: c.credits,
        inv: { p: c.inv.primary?.def.id || null, s: c.inv.secondary?.def.id || 'classic' }, armor: c.armor,
        charges: c.kit ? { ...c.kit.charges } : null, ult: c.kit?.ultPoints || 0,
      });
    }
    return w;
  }

  // Deathmatch: a new combatant for the joiner.
  addRemote(nid, info) {
    const g = this.game;
    const c = new Combatant(g, { name: cleanName(info.name), color: cleanColor(info.color) });
    this.dress(c, nid, info);
    c.loadout = { primary: WEAPONS[info.loadout?.primary] ? info.loadout.primary : 'vandal', secondary: WEAPONS[info.loadout?.secondary] ? info.loadout.secondary : 'classic' };
    g.combatants.push(c);
    this.byNid.set(nid, c);
    g.emit('roster', {}); // the renderer rebuilds its character list
    return c;
  }

  dress(c, nid, info) {
    c.remote = true; c.nid = nid;
    c.skinMap = importSkins(nid, info.skins, info.skinDefs);
    c.netSkins = { skins: info.skins, skinDefs: info.skinDefs };
    if (info.melee !== undefined || !c.isBot) c.meleeType = meleeId(info.melee);
    c.kit = new Kit(c, AGENTS[info.agent] ? info.agent : 'zephyr');
  }

  // 5v5: the joiner takes over a bot on the team with fewer people, keeping its place in the round
  // (alive or dead, guns, shields, credits).
  // From the pick screen they take the bot holding their slot; mid-match, preferably the bot already playing
  // the agent they picked, so a team never has it twice.
  takeBotSlot(nid, info) {
    const g = this.game;
    let bot = g.bots.find(b => b.slotFor === nid);
    if (!bot) {
      const t = this.joinTeam();
      bot = g.bots.find(b => b.team === t && b.kit?.id === info.agent) || g.bots.find(b => b.team === t);
    }
    if (!bot) return null;
    const c = new Combatant(g, { name: cleanName(info.name), color: bot.color });
    this.dress(c, nid, info);
    const oldKit = bot.kit;
    transferBody(bot, c);
    if (oldKit && c.kit) { c.kit.charges = { ...oldKit.charges }; c.kit.ultPoints = Math.min(oldKit.ultPoints, c.kit.ultCost); }
    c.agentId = c.kit.id;
    this.swapIn(bot, c);
    g.bots.splice(g.bots.indexOf(bot), 1);
    this.byNid.delete(bot.nid);
    this.byNid.set(nid, c);
    return c;
  }

  // Put `next` where `prev` was: same slot in the combatant list, the spike, this round's purchases.
  swapIn(prev, next) {
    const g = this.game, mode = g.mode;
    const i = g.combatants.indexOf(prev);
    if (i >= 0) g.combatants[i] = next; else g.combatants.push(next);
    if (mode?.spike?.carrier === prev) mode.spike.carrier = next;
    if (mode?.spike?.defuser === prev) mode.spike.defuser = null;
    if (mode?.boughtThisRound?.has(prev)) { mode.boughtThisRound.set(next, mode.boughtThisRound.get(prev)); mode.boughtThisRound.delete(prev); }
    for (const d of g.drops) if (d.by === prev) d.by = next;
    g.emit('roster', {});
  }

  removeCombatant(c) {
    const g = this.game;
    const i = g.combatants.indexOf(c);
    if (i >= 0) g.combatants.splice(i, 1);
    this.byNid.delete(c.nid);
    if (g.state === 'playing') g.emit('roster', {});
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (this.rounds && this.game.state === 'playing') this.botTakesOver(p.c);
    else this.removeCombatant(p.c);
    this.cb.onStatus(`${p.name} left room ${this.room}`);
    this.t?.send({ k: 'roster', list: this.roster() });
    this.cb.onRoster(this.roster());
  }

  // 5v5: a bot fills the slot of a player who left, so teams stay five against five.
  botTakesOver(c) {
    const g = this.game, mode = g.mode;
    const used = new Set(g.combatants.map(o => o.name));
    const b = new Combatant(g, { name: BOT_NAMES.find(n => !used.has(n)) || 'Bot', isBot: true, color: c.color });
    transferBody(c, b);
    b.kit = new Kit(b, c.kit?.id || 'zephyr');
    if (c.kit) { b.kit.charges = { ...c.kit.charges }; b.kit.ultPoints = c.kit.ultPoints; }
    b.agentId = b.kit.id;
    b.brain = new Bot(b, g, mode.opts.difficulty || 'normal', 'fight');
    b.brain.reset(g.time);
    b.nid = this.nid + ':b' + this.botSeq++;
    this.byNid.delete(c.nid);
    this.byNid.set(b.nid, b);
    this.swapIn(c, b);
    g.bots.push(b);
  }

  roster() {
    const g = this.game;
    return g.combatants.filter(c => c.nid).map(c => ({
      n: c.nid, name: c === g.player ? cleanName(this.profile.name) : c.name, color: c === g.player ? cleanColor(this.profile.color) : c.color, bot: !!c.isBot,
      a: c.kit?.id || null, t: c.team ?? 0,
      skins: c === g.player ? this.profile.skins : c.netSkins?.skins || c.skinMap,
      skinDefs: c === g.player ? this.profile.skinDefs : c.netSkins?.skinDefs,
      m: c === g.player ? this.profile.melee : c.meleeType,
    }));
  }

  modeState() {
    const mode = this.game.mode, now = this.game.time, sp = mode.spike;
    return {
      ph: mode.phase, pe: r3(mode.phaseEnd - now), r: mode.round, sc: [...mode.score], ss: mode.startSide,
      ob: mode.orbs?.map(o => [o.taken ? 1 : 0, r3(o.prog), o.by?.nid || null]),
      sp: sp ? { st: sp.state, pos: sp.pos?.map(r3) || null, car: sp.carrier?.nid || null, pp: r3(sp.plantProg || 0), dp: r3(sp.defuseProg || 0), df: sp.defuser?.nid || null, site: sp.site, pa: r3(now - (sp.plantedAt || 0)), hd: !!sp.halfDone } : null,
      lr: mode.lastResult || null,
    };
  }

  snapshot() {
    const g = this.game;
    return {
      k: 'snap', left: r3(g.timeLimit - g.time), state: g.state, m: g.mode ? this.modeState() : null,
      e: g.combatants.filter(c => c.nid).map(c => [c.nid, ...c.pos.map(r3), r3(c.yaw), r3(c.pitch), r3(c.crouchAmount()), c.alive ? 1 : 0, Math.round(c.hp), Math.round(c.armor), c.gun?.def.id || 'knife', c.stats.kills, c.stats.deaths, ...c.vel.map(r3), c.team ?? 0, c.credits ?? 0, c.kit?.ultPoints ?? 0]),
    };
  }

  standings() {
    return this.game.combatants.filter(c => c.nid).map(c => ({ n: c.nid, k: c.stats.kills, d: c.stats.deaths }));
  }

  // ---- client side ----
  clientRecv(m) {
    const g = this.game;
    if (this.role === 'joining' || this.role === 'lobby' || this.role === 'picking') {
      if (m.k === 'full' && m.to === this.nid) { this.cb.onStatus('That server is full'); this.close(); return; }
      if (m.k === 'version' && m.to === this.nid) {
        this.cb.onStatus(Number(m.v) > NET_VERSION
          ? 'The host is on a newer version of the game. Refresh this page (Ctrl+Shift+R) and join again.'
          : 'The host is on an older version of the game. Ask them to refresh (Ctrl+Shift+R) and create the server again.');
        this.close();
        return;
      }
      if (m.k === 'bye' && m.from === this.hostId) { this.hostGone(); return; }
      if (m.k === 'wait' && m.to === this.nid) { clearTimeout(this.joinDeadline); this.joinDeadline = setTimeout(() => this.noHost(), 12000); return; }
      if (m.k === 'lobby' && this.role !== 'picking' && m.s?.players?.some(p => p.n === this.nid)) { this.enterLobby(m); return; }
      if (m.k === 'pick' && m.to === this.nid) { this.enterPick(m); return; }
      if (m.k !== 'welcome' || m.you !== this.nid) return;
      clearInterval(this.helloTimer); clearTimeout(this.joinDeadline); clearInterval(this.lobbyTimer); clearInterval(this.pickTimer);
      this.hostId = m.from; this.hostSeen = performance.now();
      this.role = 'client';
      this.life = m.life;
      this.cb.onWelcome(m); // main.js loads the map, starts a local match, then calls attachClient(m)
      return;
    }
    if (m.from !== this.hostId) return;
    this.hostSeen = performance.now(); // even while our copy of the match is still loading
    if (!g.netRole) return;
    if (m.k === 'snap') this.applySnap(m);
    else if (m.k === 'in') this.queueFrames(m.f);
    else if (m.k === 'roster') this.applyRoster(m.list);
    else if (m.k === 'fx') { for (const f of m.list || []) if (f.n !== this.nid) this.playFx(f); }
    else if (m.k === 'hurt') this.onHurt(m);
    else if (m.k === 'dealt') {
      const target = this.byNid.get(m.target);
      if (target) g.emit('hit', { attacker: g.player, target, part: m.part || 'body', amount: m.amount, dealt: m.amount, point: target.eye(), killed: !!m.killed, def: { id: 'ability', name: 'Ability' }, wallbang: false, dot: false });
    } else if (m.k === 'kill') this.onKill(m);
    else if (m.k === 'respawn') {
      this.life = m.life;
      const p = g.player;
      if (m.revived && g.mode) { p.alive = true; p.hp = PLAYER.hp; p.pos = [m.sp.x, m.sp.y, m.sp.z]; p.prevPos = [...p.pos]; p.vel = [0, 0, 0]; }
      else p.spawnAt(m.sp, g.time);
      g.emit('respawn', { who: p, revived: !!m.revived });
    } else if (m.k === 'rs' && g.mode?.mirror) {
      this.life = m.life;
      g.mode.startRoundNet(m);
    } else if (m.k === 'bought' && g.mode?.mirror) {
      const item = cleanItem(m.item);
      if (item && !m.err) g.mode.applyPurchase(item, !!m.sell, clampInt(m.cr, 0, 99999));
      this.cb.onBuy(m.err || null);
    } else if (m.k === 'drop') this.addNetDrop(m);
    else if (m.k === 'ubrk') {
      const it = Array.isArray(m.pos) && g.findUtil(this.byNid.get(m.o), String(m.kind), m.pos);
      if (it) g.breakUtil(it);
    } else if (m.k === 'pick') {
      const d = g.drops.find(x => x.nid === m.id);
      if (d) { g.drops.splice(g.drops.indexOf(d), 1); g.emit('pickup', d); }
    } else if (m.k === 'end') {
      for (const s of m.standings || []) { const c = this.byNid.get(s.n); if (c) { c.stats.kills = s.k; c.stats.deaths = s.d; } }
      if (g.mode?.mirror && Array.isArray(m.sc)) g.mode.score = g.mode.flip ? [m.sc[1], m.sc[0]] : [m.sc[0], m.sc[1]];
      g.netRole = 'client-ended';
      g.end();
      this.cb.onEnd();
    } else if (m.k === 'dropped' && m.to === this.nid) {
      this.close();
      this.cb.onLeft('The host lost contact with you and dropped you from the match. Join again to get back in.');
    } else if (m.k === 'bye') this.hostGone();
  }

  noHost() {
    if (this.role !== 'joining') return;
    this.cb.onStatus(`No host found in room ${this.room}`);
    this.close();
  }

  // On the host's pick screen: draw what it sends, and tell it we're still here.
  enterLobby(m) {
    clearInterval(this.helloTimer); clearTimeout(this.joinDeadline);
    this.hostSeen = performance.now();
    if (this.role !== 'lobby') {
      this.role = 'lobby'; this.hostId = m.from;
      this.lobbyTimer = setInterval(() => {
        this.t?.send({ k: 'lhb' }, this.hostId);
        if (performance.now() - this.hostSeen > TIMEOUT * 1000) this.hostGone();
      }, 1000);
    }
    this.cb.onLobby(m.s, this.nid, false);
  }

  // The match is running: the host says which agents we can't have.
  enterPick(m) {
    if (this.role === 'joining' && this.profile.agent && !m.retry) return; // an answer to an older peek
    clearInterval(this.helloTimer); clearTimeout(this.joinDeadline);
    this.hostId = m.from; this.hostSeen = performance.now();
    if (this.role !== 'picking') {
      this.role = 'picking';
      clearInterval(this.pickTimer);
      this.pickTimer = setInterval(() => {
        this.t?.send({ k: 'peek', ...this.profile }, this.hostId); // keeps the taken list fresh
        if (performance.now() - this.hostSeen > TIMEOUT * 1000) this.hostGone();
      }, 1500);
    }
    this.cb.onPick({ mode: m.mode, map: m.map, mapJSON: m.mapJSON, taken: Array.isArray(m.taken) ? m.taken.filter(a => AGENTS[a]) : [], retry: !!m.retry });
  }

  // Join the running match as `agent` (picked on the deathmatch-style screen).
  pickAgent(agent) {
    if (this.role !== 'picking' || !AGENTS[agent]) return;
    clearInterval(this.pickTimer);
    this.role = 'joining';
    this.profile = { ...this.profile, agent };
    const hello = () => this.t?.send({ k: 'hello', ...this.profile }, this.hostId);
    hello();
    this.helloTimer = setInterval(() => { if (this.role === 'joining') hello(); }, 1000);
    this.joinDeadline = setTimeout(() => this.noHost(), 8000);
  }

  addNetDrop(m) {
    const g = this.game, def = WEAPONS[m.w];
    if (!def || !Array.isArray(m.pos) || g.drops.some(d => d.nid === m.id)) return;
    const gun = new Gun(def);
    gun.mag = clampInt(m.mag, 0, def.mag || 0); gun.reserve = clampInt(m.res, 0, def.reserve || 0);
    const by = this.byNid.get(m.by) || null;
    const d = { nid: m.id, gun, pos: m.pos, from: m.from || m.pos, at: g.time, by, yaw: +m.yaw || 0, skin: typeof m.skin === 'string' && SKINS[m.skin] ? m.skin : by?.skinOf?.(def.id) };
    g.drops.push(d);
    g.emit('drop', d);
  }

  requestBuy(item, sell) {
    if (this.role === 'client') this.t.send({ k: 'buy', item, sell }, this.hostId);
  }

  // After main.js has started the local match for the host's map.
  attachClient(w) {
    const g = this.game, me = g.player;
    g.netRole = 'client';
    this.hostSeen = performance.now(); // building the map can block for seconds before queued messages are read
    g.onInputs = () => this.recordInputs();
    g.applyNetInput = (c) => this.applyInput(c);
    me.nid = this.nid;
    this.byNid.set(this.nid, me);
    g.timeLimit = g.time + (w.opts.timeLeft ?? w.opts.timeLimit);
    g.killLimit = w.opts.killLimit;
    if (g.mode?.mirror) {
      g.mode.applyState(w.m, (n) => this.byNid.get(n));
      g.mode.round = w.m.r;
      g.mode.spawn(me, g.time, w.sp);
      if (w.inv) { me.inv.primary = WEAPONS[w.inv.p] ? new Gun(WEAPONS[w.inv.p]) : null; me.inv.secondary = new Gun(WEAPONS[w.inv.s] || WEAPONS.classic); me.slot = ''; me.equip(me.inv.primary ? 'primary' : 'secondary', g.time); }
      me.armor = w.armor || 0; me.credits = w.credits ?? 800;
      if (me.kit && w.charges) for (const k of ['q', 'e', 'c']) me.kit.charges[k] = clampInt(w.charges[k], 0, 9);
      if (me.kit) me.kit.ultPoints = Math.min(me.kit.ultCost, w.ult || 0);
      if (!w.alive) { me.alive = false; me.diedAt = g.time; me.respawnAt = Infinity; }
    } else {
      me.spawnAt(w.sp, g.time);
      g.emit('respawn', { who: me });
    }
    this.applyRoster(w.roster);
    this.cb.onStatus(`Joined room ${this.room}`);
  }

  applyRoster(list) {
    const g = this.game, seen = new Set([this.nid]), mode = g.mode;
    let changed = false;
    for (const r of list || []) {
      if (r.n === this.nid) continue;
      seen.add(r.n);
      let c = this.byNid.get(r.n);
      if (!c) {
        c = new Combatant(g, { name: cleanName(r.name), isBot: !!r.bot, color: cleanColor(r.color) });
        this.dress(c, r.n, { skins: r.skins, skinDefs: r.skinDefs, agent: r.a, melee: r.m });
        c.loadout = { primary: null, secondary: 'classic' };
        c.alive = false;
        g.combatants.push(c);
        this.byNid.set(r.n, c);
        this.peers.set(r.n, { c, name: c.name });
        changed = true;
      }
      if (mode?.mirror) { c.team = mode.local(r.t); c.color = TEAM_COLORS[c.team]; c.credits = c.credits ?? 0; }
    }
    for (const [n, c] of [...this.byNid]) {
      if (seen.has(n)) continue;
      const i = g.combatants.indexOf(c);
      if (i >= 0) g.combatants.splice(i, 1);
      this.byNid.delete(n); this.peers.delete(n);
      changed = true;
    }
    if (changed) g.emit('roster', {});
    this.cb.onRoster(list);
  }

  applySnap(m) {
    const g = this.game, me = g.player, mode = g.mode;
    if (typeof m.left === 'number') g.timeLimit = g.time + m.left;
    if (m.m && mode?.mirror) mode.applyState(m.m, (n) => this.byNid.get(n));
    for (const e of m.e || []) {
      const [n, x, y, z, yaw, pitch, ca, alive, hp, armor, w, kills, deaths, vx, vy, vz, team, credits, ult] = e;
      const c = this.byNid.get(n);
      if (!c) continue;
      c.stats.kills = kills; c.stats.deaths = deaths;
      if (mode?.mirror) c.team = mode.local(team);
      if (c === me) {
        me.hp = hp; me.armor = armor;
        if (mode?.mirror) me.credits = credits;
        // Ultimate points are the host's call, except right after we used ours (its copy catches up).
        if (me.kit && g.time - (me.kit.lastUse?.x ?? -10) > 1.5) me.kit.ultPoints = Math.min(me.kit.ultCost, ult);
        // Missed a respawn message: trust the host's position.
        if (alive && !me.alive && !mode && g.time - (me.diedAt || 0) > MATCH.respawn + 1) { me.spawnAt({ x, y, z, yaw }, g.time); g.emit('respawn', { who: me }); }
        continue;
      }
      c.hp = hp; c.armor = armor; c.credits = credits;
      if (alive && !c.alive) {
        c.alive = true;
        c.pos = [x, y, z]; c.prevPos = [x, y, z]; c.netTarget = null; c.netQ = []; c.netHeld = 0;
        if (!mode) c.kit?.reset(g.time);
        g.emit('respawn', { who: c, round: !!mode });
      } else if (!alive && c.alive) { c.alive = false; c.kit?.onDeath(g.time); } // missed the kill message
      setTarget(c, [x, y, z], yaw, pitch, ca, [vx, vy, vz]);
      setWeapon(c, w);
    }
  }

  onHurt(m) {
    const g = this.game, me = g.player;
    const attacker = this.byNid.get(m.by) || null;
    const def = WEAPONS[m.w] || { id: m.w, name: String(m.wn || 'Ability').slice(0, 24), cat: 'Ability' };
    const amount = Math.max(0, Number(m.amount) || 0);
    me.lastHitTime = g.time;
    if (attacker) {
      me.lastHitFrom = attacker.eye();
      const rt = me.reportFor(attacker); rt.taken += amount; rt.takenHits++;
    }
    g.emit('hit', { attacker: attacker || me, target: me, part: m.part, amount, dealt: amount, point: me.eye(), killed: false, def, wallbang: false, dot: false });
  }

  onKill(m) {
    const g = this.game, me = g.player;
    const victim = this.byNid.get(m.victim), killer = this.byNid.get(m.killer);
    if (!victim || !killer) return;
    const def = WEAPONS[m.w] || { id: m.w, name: String(m.wn || 'Ability').slice(0, 24), cat: 'Ability' };
    const fields = { alive: false, diedAt: g.time, deathPos: [...victim.pos], killedBy: { killer, def, headshot: !!m.hs, wallbang: !!m.wb } };
    Object.assign(victim, fields);
    if (victim === me) { me.respawnAt = g.mode ? Infinity : g.time + MATCH.respawn; me.vel = [0, 0, 0]; }
    if (killer === me && victim !== me && me.kit) me.kit.onKill(def, victim);
    g.emit('kill', { killer, victim, def, headshot: !!m.hs, wallbang: !!m.wb });
  }

  hostGone() {
    if (!this.role) return;
    const was = this.role;
    this.close();
    if (was === 'client' || was === 'picking') this.cb.onLeft('The host left the match');
    else if (was === 'lobby') this.cb.onLeft('The host closed the room');
  }

  // Tracers and the gunshot for someone else's shot.
  playFx(f) {
    const g = this.game, c = this.byNid.get(f.n);
    if (!c || c === g.player || !c.alive) return;
    setWeapon(c, f.w);
    const gun = c.gun;
    if (!gun) return;
    g.emit('shot', { who: c, gun });
    for (const t of (f.tr || []).slice(0, 12)) if (t.length === 6) g.emit('tracer', { who: c, gun, from: t.slice(0, 3), to: t.slice(3) });
  }
}

// Move a body (bot <-> player) into a new combatant mid-match: team, place, health, guns, money, stats.
function transferBody(from, to) {
  for (const k of ['team', 'credits', 'alive', 'hp', 'armor', 'armorKind', 'regenPool', 'yaw', 'pitch', 'survived', 'diedAt', 'deathPos', 'respawnAt', 'roundKills', 'loadout'])
    if (from[k] !== undefined) to[k] = from[k];
  to.pos = [...from.pos]; to.prevPos = [...from.pos]; to.vel = [0, 0, 0];
  to.inv = { ...from.inv, melee: from.inv.melee || new Gun(WEAPONS.knife) };
  to.slot = from.slot || 'secondary';
  to.stats = { ...from.stats };
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// A buy-menu item from the network: only the known shapes.
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.type === 'weapon' && WEAPONS[it.id] && WEAPONS[it.id].cost !== undefined) return { type: 'weapon', id: it.id };
  if (it.type === 'shield' && ['light', 'regen', 'heavy'].includes(it.id)) return { type: 'shield', id: it.id };
  if (it.type === 'ability' && ['c', 'q', 'e'].includes(it.key)) return { type: 'ability', key: it.key };
  return null;
}

// ---------- remote combatant helpers ----------
function setTarget(c, p, yaw, pitch, ca, v) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return;
  c.netTarget = { p, yaw: +yaw || 0, pitch: +pitch || 0, ca: Math.max(0, Math.min(1, +ca || 0)), at: c.game?.time ?? 0 };
  if (Array.isArray(v) && v.every(Number.isFinite)) c.vel = v.slice(0, 3);
}

function setWeapon(c, id) {
  const def = WEAPONS[id];
  if (!def) return;
  if (c.inv[def.slot]?.def !== def) c.inv[def.slot] = new Gun(def);
  c.slot = def.slot;
}

// Move a remote combatant toward its latest networked state (called every tick from Game.tick).
const EXTRAPOLATE = 0.12;
export function netStep(c, dt) {
  const t = c.netTarget;
  c.prevPos[0] = c.pos[0]; c.prevPos[1] = c.pos[1]; c.prevPos[2] = c.pos[2];
  c.prevEyeY = c.pos[1] + c.eyeOff;
  if (!t) return;
  // Updates come 20-30 times a second, and unevenly over the internet. Chasing the last one made the body speed
  // up and slow down between updates; instead it chases where that update says they are by now, carried on along
  // their velocity (on the ground plane, and at most EXTRAPOLATE seconds, so a stop or turn isn't overshot far).
  // The body moves along that velocity itself, and the gap to the predicted spot closes smoothly.
  const ahead = Math.min(EXTRAPOLATE, Math.max(0, (c.game?.time ?? 0) - (t.at ?? 0)));
  const moving = ahead < EXTRAPOLATE ? 1 : 0; // past that, an update is late: wait at the predicted spot
  const tx = t.p[0] + c.vel[0] * ahead, tz = t.p[2] + c.vel[2] * ahead;
  const px = c.pos[0] + c.vel[0] * dt * moving, pz = c.pos[2] + c.vel[2] * dt * moving;
  const dx = tx - px, dy = t.p[1] - c.pos[1], dz = tz - pz;
  if (dx * dx + dy * dy + dz * dz > 16) { c.pos = [...t.p]; c.prevPos = [...t.p]; }
  else {
    const k = 1 - Math.exp(-dt * 10), ky = 1 - Math.exp(-dt * 18);
    c.pos[0] = px + dx * k; c.pos[1] += dy * ky; c.pos[2] = pz + dz * k;
  }
  let dyaw = t.yaw - c.yaw;
  dyaw -= Math.round(dyaw / (2 * Math.PI)) * 2 * Math.PI;
  c.yaw += dyaw * Math.min(1, dt * 25);
  c.pitch += (t.pitch - c.pitch) * Math.min(1, dt * 25);
  c.eyeOff = PLAYER.standEye - t.ca * (PLAYER.standEye - PLAYER.crouchEye);
  c.crouched = t.ca > 0.5;
  c.height = c.crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
  // Footsteps for running remote players, like Combatant.move would.
  const sp = Math.hypot(c.vel[0], c.vel[2]);
  if (sp > 3.6 && c.pos[1] - (c.lastFootY ?? c.pos[1]) < 0.5) {
    c.stepDist = (c.stepDist || 0) + sp * dt;
    if (c.stepDist > 2.2) { c.stepDist = 0; c.game.emit('footstep', { who: c }); }
  }
  c.lastFootY = c.pos[1];
}

const cleanName = (n, len = 16) => String(n || 'Player').replace(/[\u0000-\u001f]/g, '').trim().slice(0, len) || 'Player';
const cleanColor = (n) => (Number.isInteger(n) && n >= 0 && n <= 0xffffff ? n : 0x6aa7ff);

// Another player's skins: preset ids are used as they are; their custom skins are registered under a
// namespaced id so they can't overwrite ours.
function importSkins(nid, skins, defs) {
  const out = {};
  if (!skins || typeof skins !== 'object') return out;
  for (const [weapon, sid] of Object.entries(skins).slice(0, 60)) {
    if ((!WEAPONS[weapon] && !MELEE[weapon]) || typeof sid !== 'string') continue;
    if (SKINS[sid] && !sid.startsWith('custom-')) { out[weapon] = sid; continue; }
    const def = defs?.[sid] && sanitizeSkin(defs[sid]);
    if (!def) continue;
    const id = `net-${nid}-${sid}`.slice(0, 60);
    registerSkin(id, def, { temporary: true });
    out[weapon] = id;
  }
  return out;
}
