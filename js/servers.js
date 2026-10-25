// Server browser with no server behind it: a host announces its room on a BroadcastChannel every second,
// so every tab and window of this browser on this site can list it. Rooms hosted on other computers
// (PeerJS) can't be listed without a backend to keep the list, so those are joined by room code.
const CHANNEL = 'tapfire-servers', EVERY = 1000, STALE = 3500;

export class ServerDirectory {
  // info(): what to announce for the room this tab hosts (NetSession.serverInfo), or null when not hosting.
  constructor(info) {
    this.info = info;
    this.list = new Map(); // room -> { room, name, mode, map, players, max, transport, phase, seen }
    this.onchange = null;
    this.last = null; // the room we last announced, to say it's gone
    if (typeof BroadcastChannel !== 'function') return;
    this.ch = new BroadcastChannel(CHANNEL);
    this.ch.onmessage = (e) => this.recv(e.data);
    setInterval(() => this.tick(), EVERY);
    this.refresh();
  }

  recv(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'srv' && m.s && typeof m.s.room === 'string') {
      const s = m.s;
      this.list.set(s.room, {
        room: s.room.slice(0, 12), name: String(s.name || s.room).slice(0, 32), mode: s.mode === 'rounds' ? 'rounds' : 'dm', map: String(s.map || '').slice(0, 40),
        players: Number(s.players) || 0, max: Number(s.max) || 10, transport: s.transport === 'peer' ? 'peer' : 'local', phase: s.phase === 'playing' ? 'playing' : 'pick', seen: performance.now(),
      });
      this.changed();
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

  servers() { return [...this.list.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  changed() { this.onchange?.(); }
}
