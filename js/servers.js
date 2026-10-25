// Server browser with no server behind it.
//
// This browser: a host announces its room on a BroadcastChannel every second, so every tab and window of this
// browser on this site lists it.
//
// Internet: one player's browser holds the list. Everyone with the server screen open (or hosting an internet
// server) asks the PeerJS broker for the well-known id DIRECTORY. Whoever gets it holds the list: hosts send it
// their room every couple of seconds and it sends the whole list to everyone connected. Everyone else gets
// "id taken" and connects to the holder instead. When the holder closes the game, the others notice the
// dropped connection and race to take the id over; hosts re-announce, so the list fills back in within a few
// seconds. The list is only as trustworthy as the browser holding it: entries are just names and room codes.
import { loadPeerJS, peerOptions } from './net.js';

const CHANNEL = 'tapfire-servers', EVERY = 1000, STALE = 3500;
const DIRECTORY = 'tapfire-directory-v1', ANNOUNCE = 2000, PEER_STALE = 7000, MAX_ROOMS = 100;

// A server entry from another tab or browser: only the known fields, sized down.
function cleanServer(s, transport = s.transport) {
  if (!s || typeof s !== 'object' || typeof s.room !== 'string' || !/^[A-Z0-9]{1,12}$/.test(s.room)) return null;
  return {
    room: s.room, name: String(s.name || s.room).slice(0, 32), mode: s.mode === 'rounds' ? 'rounds' : 'dm', map: String(s.map || '').slice(0, 40),
    players: Math.max(0, Math.min(99, Number(s.players) || 0)), max: Math.max(2, Math.min(10, Number(s.max) || 10)),
    transport: transport === 'peer' ? 'peer' : 'local', phase: s.phase === 'playing' ? 'playing' : 'pick',
  };
}

export class ServerDirectory {
  // info(): what to announce for the room this tab hosts (NetSession.serverInfo), or null when not hosting.
  constructor(info) {
    this.info = info;
    this.list = new Map(); // room -> server entry (+ seen), from this browser's tabs
    this.peerList = new Map(); // room -> server entry, from the internet list
    this.onchange = null;
    this.last = null; // the room we last announced, to say it's gone
    this.internet = new InternetDirectory(this);
    if (typeof BroadcastChannel !== 'function') return;
    this.ch = new BroadcastChannel(CHANNEL);
    this.ch.onmessage = (e) => this.recv(e.data);
    setInterval(() => this.tick(), EVERY);
    this.refresh();
  }

  recv(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'srv') {
      const s = cleanServer(m.s);
      if (s) { this.list.set(s.room, { ...s, seen: performance.now() }); this.changed(); }
    } else if (m.k === 'gone') {
      if (this.list.delete(m.room)) this.changed();
    } else if (m.k === 'query') this.announce();
  }

  tick() {
    this.announce();
    const now = performance.now();
    let gone = false;
    for (const [room, s] of this.list) if (now - s.seen > STALE) { this.list.delete(room); gone = true; }
    if (gone) this.changed();
  }

  announce() {
    if (!this.ch) return;
    const s = this.info();
    if (s) { this.ch.postMessage({ k: 'srv', s }); this.last = s.room; }
    else if (this.last) { this.ch.postMessage({ k: 'gone', room: this.last }); this.last = null; }
  }

  // Forget the list and ask every host to answer now.
  refresh() {
    if (!this.ch) return;
    this.list.clear();
    this.changed();
    this.ch.postMessage({ k: 'query' });
  }

  setPeerList(list) {
    this.peerList = new Map();
    for (const e of Array.isArray(list) ? list.slice(0, MAX_ROOMS) : []) { const s = cleanServer(e, 'peer'); if (s) this.peerList.set(s.room, s); }
    this.changed();
  }

  // Both lists; a room this browser sees directly wins over the internet copy.
  servers() {
    const all = new Map(this.peerList);
    for (const [room, s] of this.list) all.set(room, s);
    return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  changed() { this.onchange?.(); }
}

// The internet list (see the top of this file). start() is safe to call again; it keeps running from then on.
class InternetDirectory {
  constructor(dir) {
    this.dir = dir;
    this.role = null; // null (connecting or offline) | 'holder' | 'member'
    this.state = 'off'; // 'off' | 'connecting' | 'holder' | 'member' | 'offline'
    this.peer = null;
    this.conn = null; // member: the connection to the holder
    this.rooms = new Map(); // holder: connection (or 'self') -> { s, seen }
    this.gen = 0; // bumped on every reconnect, so callbacks from an old attempt do nothing
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), ANNOUNCE);
    this.connect();
  }

  set(state) { this.state = state; this.dir.changed(); }

  async connect() {
    const gen = ++this.gen;
    this.teardown();
    this.set('connecting');
    let Peer;
    try { Peer = await loadPeerJS(); } catch { this.set('offline'); this.retry(gen, 15000); return; }
    if (gen !== this.gen) return;
    // Try to hold the list; if someone already does, join theirs.
    const peer = this.peer = new Peer(DIRECTORY, { debug: 0, ...peerOptions });
    peer.on('open', () => { if (gen === this.gen) this.hold(peer); });
    peer.on('error', (e) => {
      if (gen !== this.gen) return;
      if (e.type === 'unavailable-id' && this.role !== 'holder') { peer.destroy(); this.join(Peer, gen); return; }
      if (this.role === 'holder') { this.retry(gen, 1000); return; }
      this.set('offline'); this.retry(gen, 8000);
    });
  }

  hold(peer) {
    this.role = 'holder';
    this.rooms.clear();
    peer.on('connection', (conn) => {
      conn.on('data', (m) => {
        if (m?.k !== 'srv') return;
        const s = cleanServer(m.s, 'peer');
        if (s && (this.rooms.has(conn) || this.rooms.size < MAX_ROOMS)) this.rooms.set(conn, { s, seen: performance.now() });
      });
      conn.on('open', () => this.sendList(conn));
      conn.on('close', () => this.rooms.delete(conn));
    });
    peer.on('disconnected', () => this.retry(this.gen, 1000)); // lost the broker: someone else may take over
    this.set('holder');
    this.tick();
  }

  join(Peer, gen) {
    const peer = this.peer = new Peer(undefined, { debug: 0, ...peerOptions });
    const fail = () => { if (gen === this.gen) { this.dir.setPeerList([]); this.retry(gen, 300 + Math.random() * 1200); } };
    peer.on('error', fail);
    peer.on('open', () => {
      if (gen !== this.gen) return;
      const conn = this.conn = peer.connect(DIRECTORY, { serialization: 'json', reliable: true });
      const giveUp = setTimeout(fail, 8000);
      conn.on('open', () => { clearTimeout(giveUp); if (gen !== this.gen) return; this.role = 'member'; this.heard = performance.now(); this.fail = fail; this.set('member'); this.tick(); });
      conn.on('data', (m) => { if (gen === this.gen && m?.k === 'list') { this.heard = performance.now(); this.dir.setPeerList(m.list); } });
      conn.on('close', fail); // the holder left: race to take its place
      conn.on('error', fail);
    });
  }

  retry(gen, ms) {
    if (gen !== this.gen) return;
    this.gen++;
    this.teardown();
    clearTimeout(this.again);
    this.again = setTimeout(() => this.connect(), ms);
  }

  teardown() {
    this.role = null;
    try { this.peer?.destroy(); } catch { /* already gone */ }
    this.peer = this.conn = null;
    this.rooms.clear();
  }

  // Our own internet server, if we host one.
  mine() {
    const s = this.dir.info();
    return s && s.transport === 'peer' ? cleanServer(s, 'peer') : null;
  }

  tick() {
    const s = this.mine();
    if (this.role === 'member') {
      // A holder whose browser crashed or lost its network can leave the connection looking open for a long
      // time; it sends the list every ANNOUNCE, so silence means it's gone.
      if (performance.now() - this.heard > PEER_STALE) { this.fail(); return; }
      if (s && this.conn?.open) this.conn.send({ k: 'srv', s });
      return;
    }
    if (this.role !== 'holder') return;
    const now = performance.now();
    for (const [conn, r] of this.rooms) if (now - r.seen > PEER_STALE || !conn.open) this.rooms.delete(conn);
    if (s) this.rooms.set('self', { s, seen: now }); else this.rooms.delete('self');
    const list = this.list();
    this.dir.setPeerList(list);
    for (const conn of Object.values(this.peer?.connections || {}).flat()) this.sendList(conn, list);
  }

  list() {
    const byRoom = new Map();
    for (const { s } of this.rooms.values()) byRoom.set(s.room, s);
    return [...byRoom.values()];
  }

  sendList(conn, list = this.list()) { if (conn.open) conn.send({ k: 'list', list }); }
}
