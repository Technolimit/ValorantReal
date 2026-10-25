// Online play with no game server. One browser hosts: it runs the real match (bots, damage, kills,
// respawns, score) and streams snapshots; everyone else runs their own movement and aim locally and sends
// their state and hit claims to the host (favour-the-shooter, like most browser shooters).
//
// Transports:
//   local  BroadcastChannel: tabs and windows of this browser on the same origin. Nothing leaves the machine.
//   peer   PeerJS (WebRTC data channels): players on other machines. PeerJS is loaded on demand; its public
//          broker only introduces the browsers to each other, game traffic then flows peer to peer.
//
// Online matches are deathmatch with abilities off: smokes, walls and the rest only exist in the host's sim.
import { DT, PLAYER, MATCH } from './config.js';
import { WEAPONS } from './weapons.js';
import { Combatant } from './entity.js';
import { Gun } from './gun.js';
import { sanitizeSkin, registerSkin, SKINS } from './skins.js';

const SNAP_HZ = 20, STATE_HZ = 30, TIMEOUT = 4, PEER_PREFIX = 'tapfire-';
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

let peerLib = null;
function loadPeerJS() {
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
    this.peer = new Peer(this.isHost ? hostPeer : undefined, { debug: 0 });
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

// ---------- session ----------
export class NetSession {
  constructor(game, { onStatus = () => {}, onWelcome = () => {}, onEnd = () => {}, onLeft = () => {}, onRoster = () => {} } = {}) {
    this.game = game;
    this.cb = { onStatus, onWelcome, onEnd, onLeft, onRoster };
    this.role = null;
    this.nid = newId();
    this.peers = new Map(); // nid -> { c, seen, life, name }
    this.byNid = new Map(); // nid -> Combatant (everyone, including me)
    this.fx = [];
    this.lastSnap = 0; this.lastState = 0;
    this.hookGame();
  }

  get active() { return !!this.role; }

  // ---- lifecycle ----
  async host({ transport, room, profile, mapJSON }) {
    this.close();
    this.room = room; this.profile = profile; this.mapJSON = mapJSON;
    this.t = transport === 'peer' ? new PeerTransport(room, this.nid, true) : new LocalTransport(room, this.nid);
    this.cb.onStatus(transport === 'peer' ? 'Connecting to the PeerJS broker…' : 'Opening room…');
    await this.t.open();
    this.role = 'host';
    this.t.onmessage = (m) => this.hostRecv(m);
    this.t.onpeergone = (id) => this.dropPeer(id);
    const g = this.game;
    g.netRole = 'host';
    g.player.nid = this.nid;
    this.byNid.set(this.nid, g.player);
    g.bots.forEach((b, i) => { b.nid = this.nid + ':b' + i; this.byNid.set(b.nid, b); });
    this.cb.onStatus(`Hosting room ${room}`);
    this.cb.onRoster(this.roster());
  }

  async join({ transport, room, profile }) {
    this.close();
    this.room = room; this.profile = profile;
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
    this.joinDeadline = setTimeout(() => { if (this.role === 'joining') { this.cb.onStatus(`No host found in room ${room}`); this.close(); } }, 8000);
  }

  close() {
    clearInterval(this.helloTimer); clearTimeout(this.joinDeadline);
    if (this.t) { try { this.t.send({ k: 'bye' }); } catch { /* transport already closed */ } this.t.close(); }
    this.t = null;
    if (this.game.netRole) {
      for (const p of this.peers.values()) this.removeCombatant(p.c);
    }
    this.peers.clear(); this.byNid.clear();
    this.role = null; this.hostId = null;
    this.game.netRole = null;
  }

  // ---- game hooks (run for both roles; each checks the role) ----
  hookGame() {
    const g = this.game;
    const damage = g.damage.bind(g);
    g.damage = (target, attacker, amount, info) => {
      if (this.role !== 'client') return damage(target, attacker, amount, info);
      // Client: the host owns health. Report our own hits on others and show the hit locally.
      if (attacker !== g.player || !target.remote || !target.alive || amount <= 0) return;
      this.t.send({ k: 'hit', target: target.nid, amount: Math.round(amount), part: info.part, w: info.def.id, dist: r3(info.dist), wb: !!info.wallbang, life: this.life }, this.hostId);
      const s = attacker.stats; s.hits++; s[info.part]++; s.damage += amount;
      const ra = attacker.reportFor(target); ra.dealt += amount; ra.dealtHits++; ra[info.part]++;
      g.emit('hit', { attacker, target, part: info.part, amount, dealt: amount, point: info.point, killed: false, def: info.def, wallbang: info.wallbang, dot: false });
    };
    g.on('tracer', ({ who, gun, from, to, device }) => {
      if (!this.role || this.role === 'joining' || device || who.remote || !who.nid) return;
      let e = this.fx.find(f => f.n === who.nid);
      if (!e) this.fx.push(e = { n: who.nid, w: gun.def.id, tr: [] });
      e.tr.push([from, to].flat().map(r3));
    });
    g.on('hit', (h) => {
      if (this.role !== 'host' || !h.target.remote) return;
      this.t.send({ k: 'hurt', by: h.attacker?.nid, amount: h.dealt, part: h.part, w: h.def?.id, pt: h.point?.map(r3) }, h.target.nid);
    });
    g.on('kill', ({ killer, victim, def, headshot, wallbang }) => {
      if (this.role !== 'host') return;
      this.t.send({ k: 'kill', killer: killer.nid, victim: victim.nid, w: def.id, wn: def.name, hs: headshot, wb: wallbang });
    });
    g.on('respawn', ({ who }) => {
      if (this.role !== 'host' || !who.remote) return;
      const p = this.peers.get(who.nid);
      if (!p) return;
      p.life++;
      this.t.send({ k: 'respawn', life: p.life, sp: { x: who.pos[0], y: who.pos[1], z: who.pos[2], yaw: who.yaw } }, who.nid);
    });
    g.on('end', () => { if (this.role === 'host') this.t.send({ k: 'end', standings: this.standings() }); });
  }

  // Called once per simulation tick, after game.tick().
  tick() {
    if (!this.role || this.role === 'joining') return;
    const g = this.game, now = g.time;
    if (this.role === 'host') {
      for (const [id, p] of this.peers) if (now - p.seen > TIMEOUT && performance.now() - p.seenWall > TIMEOUT * 1000) this.dropPeer(id);
      if (now - this.lastSnap >= 1 / SNAP_HZ) { this.lastSnap = now; this.t.send(this.snapshot()); }
    } else {
      const p = g.player;
      if (p.alive && now - this.lastState >= 1 / STATE_HZ) {
        this.lastState = now;
        this.t.send({ k: 'st', life: this.life, p: p.pos.map(r3), v: p.vel.map(r3), y: r3(p.yaw), pi: r3(p.pitch), ca: r3(p.crouchAmount()), w: p.gun?.def.id }, this.hostId);
      }
      if (performance.now() - this.hostSeen > TIMEOUT * 1000) this.hostGone();
    }
    if (this.fx.length) { this.t.send({ k: 'fx', list: this.fx }, this.role === 'client' ? this.hostId : undefined); this.fx = []; }
  }

  // ---- host side ----
  hostRecv(m) {
    const g = this.game, id = m.from;
    if (m.k === 'hello') {
      if (g.state !== 'playing') return;
      let p = this.peers.get(id);
      if (!p) {
        const c = this.addRemote(id, m);
        p = { c, life: 0, seen: g.time, seenWall: performance.now(), name: c.name };
        this.peers.set(id, p);
        g.respawn(c); // emits respawn -> tells the client where it spawned
        this.cb.onStatus(`${c.name} joined room ${this.room}`);
        this.t.send({ k: 'roster', list: this.roster() });
        this.cb.onRoster(this.roster());
      }
      this.t.send({ k: 'welcome', you: id, map: g.map.id, mapJSON: this.mapJSON, opts: { killLimit: g.killLimit, timeLimit: g.timeLimit, timeLeft: g.timeLimit - g.time }, roster: this.roster(), life: p.life, sp: { x: p.c.pos[0], y: p.c.pos[1], z: p.c.pos[2], yaw: p.c.yaw } }, id);
      return;
    }
    const p = this.peers.get(id);
    if (!p) return;
    p.seen = g.time; p.seenWall = performance.now();
    const c = p.c;
    if (m.k === 'st') {
      if (m.life !== p.life || !c.alive) return; // stale: sent before the client heard about its respawn
      setTarget(c, m.p, m.y, m.pi, m.ca, m.v);
      setWeapon(c, m.w);
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
    } else if (m.k === 'bye') this.dropPeer(id);
  }

  addRemote(nid, info) {
    const g = this.game;
    const c = new Combatant(g, { name: cleanName(info.name), color: cleanColor(info.color) });
    c.remote = true; c.nid = nid;
    c.loadout = { primary: WEAPONS[info.loadout?.primary] ? info.loadout.primary : 'vandal', secondary: WEAPONS[info.loadout?.secondary] ? info.loadout.secondary : 'classic' };
    c.skinMap = importSkins(nid, info.skins, info.skinDefs);
    c.netSkins = { skins: info.skins, skinDefs: info.skinDefs };
    g.combatants.push(c);
    this.byNid.set(nid, c);
    g.emit('roster', {}); // the renderer rebuilds its character list
    return c;
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
    this.removeCombatant(p.c);
    this.cb.onStatus(`${p.name} left room ${this.room}`);
    this.t?.send({ k: 'roster', list: this.roster() });
    this.cb.onRoster(this.roster());
  }

  roster() {
    return this.game.combatants.filter(c => c.nid).map(c => ({
      n: c.nid, name: c === this.game.player ? cleanName(this.profile.name) : c.name, color: c === this.game.player ? cleanColor(this.profile.color) : c.color, bot: !!c.isBot,
      skins: c === this.game.player ? this.profile.skins : c.netSkins?.skins || c.skinMap,
      skinDefs: c === this.game.player ? this.profile.skinDefs : c.netSkins?.skinDefs,
    }));
  }

  snapshot() {
    const g = this.game;
    return {
      k: 'snap', left: r3(g.timeLimit - g.time), state: g.state,
      e: g.combatants.filter(c => c.nid).map(c => [c.nid, ...c.pos.map(r3), r3(c.yaw), r3(c.pitch), r3(c.crouchAmount()), c.alive ? 1 : 0, Math.round(c.hp), Math.round(c.armor), c.gun?.def.id || 'knife', c.stats.kills, c.stats.deaths, ...c.vel.map(r3)]),
    };
  }

  standings() {
    return this.game.combatants.filter(c => c.nid).map(c => ({ n: c.nid, k: c.stats.kills, d: c.stats.deaths }));
  }

  // ---- client side ----
  clientRecv(m) {
    const g = this.game;
    if (this.role === 'joining') {
      if (m.k !== 'welcome' || m.you !== this.nid) return;
      clearInterval(this.helloTimer); clearTimeout(this.joinDeadline);
      this.hostId = m.from; this.hostSeen = performance.now();
      this.role = 'client';
      this.life = m.life;
      this.cb.onWelcome(m); // main.js loads the map, starts a local match, then calls attachClient(m)
      return;
    }
    if (m.from !== this.hostId) return;
    this.hostSeen = performance.now();
    if (m.k === 'snap') this.applySnap(m);
    else if (m.k === 'roster') this.applyRoster(m.list);
    else if (m.k === 'fx') { for (const f of m.list || []) if (f.n !== this.nid) this.playFx(f); }
    else if (m.k === 'hurt') this.onHurt(m);
    else if (m.k === 'kill') this.onKill(m);
    else if (m.k === 'respawn') {
      this.life = m.life;
      g.player.spawnAt(m.sp, g.time);
      g.emit('respawn', { who: g.player });
    } else if (m.k === 'end') {
      for (const s of m.standings || []) { const c = this.byNid.get(s.n); if (c) { c.stats.kills = s.k; c.stats.deaths = s.d; } }
      g.netRole = 'client-ended';
      g.end();
      this.cb.onEnd();
    } else if (m.k === 'bye') this.hostGone();
  }

  // After main.js has started the local match for the host's map.
  attachClient(w) {
    const g = this.game;
    g.netRole = 'client';
    g.player.nid = this.nid;
    this.byNid.set(this.nid, g.player);
    g.timeLimit = g.time + (w.opts.timeLeft ?? w.opts.timeLimit);
    g.killLimit = w.opts.killLimit;
    g.player.spawnAt(w.sp, g.time);
    g.emit('respawn', { who: g.player });
    this.applyRoster(w.roster);
    this.cb.onStatus(`Joined room ${this.room}`);
  }

  applyRoster(list) {
    const g = this.game, seen = new Set([this.nid]);
    let changed = false;
    for (const r of list || []) {
      if (r.n === this.nid) continue;
      seen.add(r.n);
      if (this.byNid.has(r.n)) continue;
      const c = new Combatant(g, { name: cleanName(r.name), isBot: !!r.bot, color: cleanColor(r.color) });
      c.remote = true; c.nid = r.n;
      c.skinMap = importSkins(r.n, r.skins, r.skinDefs);
      c.loadout = { primary: null, secondary: 'classic' };
      c.alive = false;
      g.combatants.push(c);
      this.byNid.set(r.n, c);
      this.peers.set(r.n, { c, name: c.name });
      changed = true;
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
    const g = this.game, me = g.player;
    if (typeof m.left === 'number') g.timeLimit = g.time + m.left;
    for (const e of m.e || []) {
      const [n, x, y, z, yaw, pitch, ca, alive, hp, armor, w, kills, deaths, vx, vy, vz] = e;
      const c = this.byNid.get(n);
      if (!c) continue;
      c.stats.kills = kills; c.stats.deaths = deaths;
      if (c === me) {
        me.hp = hp; me.armor = armor;
        // Missed a respawn message: trust the host's position.
        if (alive && !me.alive && g.time - (me.diedAt || 0) > MATCH.respawn + 1) { me.spawnAt({ x, y, z, yaw }, g.time); g.emit('respawn', { who: me }); }
        continue;
      }
      c.hp = hp; c.armor = armor;
      if (alive && !c.alive) {
        c.alive = true;
        c.pos = [x, y, z]; c.prevPos = [x, y, z]; c.netTarget = null;
        g.emit('respawn', { who: c });
      } else if (!alive && c.alive) c.alive = false;
      setTarget(c, [x, y, z], yaw, pitch, ca, [vx, vy, vz]);
      setWeapon(c, w);
    }
  }

  onHurt(m) {
    const g = this.game, me = g.player;
    const attacker = this.byNid.get(m.by) || null;
    const def = WEAPONS[m.w] || { id: m.w, name: 'Ability', cat: 'Ability' };
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
    if (victim === me) {
      me.alive = false;
      me.diedAt = g.time;
      me.deathPos = [...me.pos];
      me.respawnAt = g.time + MATCH.respawn;
      me.killedBy = { killer, def, headshot: !!m.hs, wallbang: !!m.wb };
      me.vel = [0, 0, 0];
    } else {
      victim.alive = false;
      victim.diedAt = g.time;
      victim.killedBy = { killer, def, headshot: !!m.hs, wallbang: !!m.wb };
    }
    g.emit('kill', { killer, victim, def, headshot: !!m.hs, wallbang: !!m.wb });
  }

  hostGone() {
    if (!this.role) return;
    const wasClient = this.role === 'client';
    this.close();
    if (wasClient) this.cb.onLeft('The host left the match');
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

// ---------- remote combatant helpers ----------
function setTarget(c, p, yaw, pitch, ca, v) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return;
  c.netTarget = { p, yaw: +yaw || 0, pitch: +pitch || 0, ca: Math.max(0, Math.min(1, +ca || 0)) };
  if (Array.isArray(v) && v.every(Number.isFinite)) c.vel = v.slice(0, 3);
}

function setWeapon(c, id) {
  const def = WEAPONS[id];
  if (!def) return;
  if (c.inv[def.slot]?.def !== def) c.inv[def.slot] = new Gun(def);
  c.slot = def.slot;
}

// Move a remote combatant toward its latest networked state (called every tick from Game.tick).
export function netStep(c, dt) {
  const t = c.netTarget;
  c.prevPos[0] = c.pos[0]; c.prevPos[1] = c.pos[1]; c.prevPos[2] = c.pos[2];
  c.prevEyeY = c.pos[1] + c.eyeOff;
  if (!t) return;
  const dx = t.p[0] - c.pos[0], dy = t.p[1] - c.pos[1], dz = t.p[2] - c.pos[2];
  if (dx * dx + dy * dy + dz * dz > 16) { c.pos = [...t.p]; c.prevPos = [...t.p]; }
  else {
    const k = 1 - Math.exp(-dt * 18);
    c.pos[0] += dx * k; c.pos[1] += dy * k; c.pos[2] += dz * k;
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

const cleanName = (n) => String(n || 'Player').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';
const cleanColor = (n) => (Number.isInteger(n) && n >= 0 && n <= 0xffffff ? n : 0x6aa7ff);

// Another player's skins: preset ids are used as they are; their custom skins are registered under a
// namespaced id so they can't overwrite ours.
function importSkins(nid, skins, defs) {
  const out = {};
  if (!skins || typeof skins !== 'object') return out;
  for (const [weapon, sid] of Object.entries(skins).slice(0, 40)) {
    if (!WEAPONS[weapon] || typeof sid !== 'string') continue;
    if (SKINS[sid] && !sid.startsWith('custom-')) { out[weapon] = sid; continue; }
    const def = defs?.[sid] && sanitizeSkin(defs[sid]);
    if (!def) continue;
    const id = `net-${nid}-${sid}`.slice(0, 60);
    registerSkin(id, def, { temporary: true });
    out[weapon] = id;
  }
  return out;
}
