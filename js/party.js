// Party: up to five friends who queue together from the home screen. One browser leads: it holds the party
// code and the roster, and when it presses Find Match it hosts a match room and sends everyone there
// (net.js does the match itself; in 5v5 the host keeps its party on its own team).
//
// The leader listens on both transports at once, so a code works from another tab of this browser
// (BroadcastChannel) and from another computer (PeerJS). Someone joining tries this browser first, then the
// internet. Nothing here runs until someone opens the party panel.
import { LocalTransport, PeerTransport, roomCode } from './net.js';

export const PARTY_MAX = 5;
const BEAT = 2000, GONE = 8000, LOCAL_WAIT = 700;
const newId = () => Math.random().toString(36).slice(2, 10);
const clean = (n) => String(n || 'Player').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export class Party {
  constructor({ onChange = () => {}, onGo = () => {}, onStatus = () => {} } = {}) {
    this.cb = { onChange, onGo, onStatus };
    this.id = newId();
    this.role = null; // null, 'leader' or 'member'
    this.code = null;
    this.members = []; // { id, name, agent, leader }
    this.ts = [];
    this.seen = new Map(); // leader: member id -> last heard (ms); member: 'leader' -> last heard
    this.via = new Map(); // leader: member id -> 'local' | 'peer'
  }

  get active() { return !!this.role; }
  get leader() { return this.role === 'leader'; }
  get full() { return this.members.length >= PARTY_MAX; }
  // The match room goes over the internet if anyone came in that way.
  get transport() { return [...this.via.values()].includes('peer') ? 'peer' : 'local'; }

  // Lead a new party. The internet half is best-effort: offline, the code still works in this browser.
  async create(me) {
    if (this.role) return;
    this.role = 'leader';
    this.code = roomCode();
    this.me = me;
    this.members = [{ id: this.id, name: clean(me.name), agent: me.agent, leader: true }];
    const room = 'party-' + this.code;
    const local = new LocalTransport(room, this.id);
    this.wire(local, 'local');
    this.ts = [local];
    this.changed();
    const peer = new PeerTransport(room, this.id, true);
    try {
      await peer.open();
      if (this.role !== 'leader') { peer.close(); return; }
      this.wire(peer, 'peer');
      this.ts.push(peer);
    } catch { peer.close(); this.cb.onStatus('Only tabs in this browser can join (no internet connection to the broker)'); }
    this.timer = setInterval(() => this.tick(), BEAT);
  }

  // Join a friend's party by its code.
  async join(code, me) {
    code = cleanCode(code);
    if (!code) { this.cb.onStatus('Enter your friend\'s party code'); return false; }
    this.leave();
    this.me = me;
    this.cb.onStatus('Looking for the party…');
    const room = 'party-' + code;
    const hi = (t) => t.send({ k: 'p-hi', name: clean(me.name), agent: me.agent });
    const tryWith = async (t, wait) => {
      let ok = false;
      t.onmessage = (m) => { if (m.k === 'p-roster' || m.k === 'p-full') ok = m; };
      await t.open();
      hi(t);
      const until = performance.now() + wait;
      while (!ok && performance.now() < until) await new Promise(r => setTimeout(r, 50));
      return ok;
    };
    let t = new LocalTransport(room, this.id), got = await tryWith(t, LOCAL_WAIT);
    if (!got) {
      t.close();
      t = new PeerTransport(room, this.id, false);
      try { got = await tryWith(t, 5000); } catch (err) { t.close(); this.cb.onStatus(err.message.replace('room code', 'party code')); return false; }
    }
    if (!got) { t.close(); this.cb.onStatus('No party with that code'); return false; }
    if (got.k === 'p-full') { t.close(); this.cb.onStatus('That party is full'); return false; }
    this.role = 'member';
    this.code = code;
    this.ts = [t];
    this.wire(t, 'host');
    this.seen.set('leader', performance.now());
    this.recv(got);
    this.timer = setInterval(() => this.tick(), BEAT);
    this.cb.onStatus('');
    return true;
  }

  wire(t, via) {
    t.onmessage = (m) => this.recv(m, via);
    t.onpeergone = (id) => (this.leader ? this.drop(id) : this.left('The party leader left'));
  }

  recv(m, via) {
    if (!m || typeof m !== 'object') return;
    if (this.leader) {
      const id = String(m.from || '');
      if (!id || id === this.id) return;
      let p = this.members.find(x => x.id === id);
      if (m.k === 'p-bye') { this.drop(id); return; }
      if (m.k !== 'p-hi' && m.k !== 'p-me') return;
      if (!p) {
        if (this.full) { this.send({ k: 'p-full' }, id, via); return; }
        p = { id, leader: false };
        this.members.push(p);
        this.via.set(id, via);
        this.cb.onStatus(`${clean(m.name)} joined the party`);
      }
      p.name = clean(m.name); p.agent = typeof m.agent === 'string' ? m.agent.slice(0, 20) : null;
      this.seen.set(id, performance.now());
      this.broadcast();
      this.changed();
      return;
    }
    if (this.role !== 'member' || !['p-roster', 'p-go', 'p-end'].includes(m.k)) return; // other members' messages too, on a BroadcastChannel
    this.seen.set('leader', performance.now());
    if (m.k === 'p-roster' && Array.isArray(m.members)) {
      this.members = m.members.slice(0, PARTY_MAX).map(p => ({ id: String(p.id), name: clean(p.name), agent: typeof p.agent === 'string' ? p.agent : null, leader: !!p.leader }));
      if (this.role === 'member' && !this.members.some(p => p.id === this.id)) { this.left('You were removed from the party'); return; }
      this.changed();
    } else if (m.k === 'p-go' && typeof m.room === 'string') {
      this.cb.onGo({ room: cleanCode(m.room), transport: m.transport === 'peer' ? 'peer' : 'local', party: String(m.party || '') });
    } else if (m.k === 'p-end') this.left('The party leader closed the party');
  }

  // My name or agent changed on the home screen.
  update(me) {
    this.me = me;
    if (!this.role) return;
    if (this.leader) { Object.assign(this.members[0], { name: clean(me.name), agent: me.agent }); this.broadcast(); this.changed(); }
    else this.send({ k: 'p-me', name: clean(me.name), agent: me.agent });
  }

  // Leader: everyone into the match room.
  go(room, transport) { if (this.leader) this.send({ k: 'p-go', room, transport, party: this.id }); }

  tick() {
    const now = performance.now();
    if (this.leader) {
      for (const p of this.members.slice(1)) if (now - (this.seen.get(p.id) || 0) > GONE) this.drop(p.id);
      this.broadcast();
    } else if (this.role === 'member') {
      if (now - (this.seen.get('leader') || 0) > GONE) { this.left('Lost the connection to the party'); return; }
      this.send({ k: 'p-me', name: clean(this.me?.name), agent: this.me?.agent });
    }
  }

  drop(id) {
    const i = this.members.findIndex(p => p.id === id && !p.leader);
    if (i < 0) return;
    const [p] = this.members.splice(i, 1);
    this.via.delete(id); this.seen.delete(id);
    this.cb.onStatus(`${p.name} left the party`);
    this.broadcast();
    this.changed();
  }

  broadcast() { this.send({ k: 'p-roster', code: this.code, members: this.members }); }

  send(m, to, via) {
    for (const t of this.ts) {
      if (via && via !== 'host' && t !== this.ts[via === 'peer' ? 1 : 0]) continue;
      try { t.send({ ...m }, to); } catch { /* transport closing */ }
    }
  }

  left(why) { this.leave(true); this.cb.onStatus(why); }

  leave(quiet = false) {
    if (!this.role) return;
    this.send({ k: this.leader ? 'p-end' : 'p-bye' });
    clearInterval(this.timer);
    for (const t of this.ts) t.close();
    this.ts = []; this.seen.clear(); this.via.clear();
    this.role = null; this.code = null; this.members = [];
    if (!quiet) this.cb.onStatus('');
    this.changed();
  }

  changed() { this.cb.onChange(this); }
}
