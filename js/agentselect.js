// Valorant-style agent select: the pre-match pick (people lock in first, then bots pick from what's left)
// and the screen that draws it (agent grid, big emblem and abilities, lock-in timer, team strip).
// Lobby holds the rules. Online the host owns the Lobby (net.js) and every screen draws the state it
// broadcasts; offline 5v5 runs a Lobby locally with you as the only person.
import { AGENTS, AGENT_ORDER } from './abilities.js';

export const PICK_TIME = 60; // seconds to lock in once the pick starts
const BOT_PICK_GAP = 0.45; // between one bot's pick and the next
const GO_DELAY = 2.5; // everyone picked: this long on the full lineup before the match starts
const ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];
const clock = () => performance.now() / 1000;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Agents someone else has locked: on `team` in 5v5, anywhere in deathmatch.
export function takenAgents(players, team, rounds, self = null) {
  return new Set(players.filter(p => p.n !== self && p.locked && p.a && (!rounds || p.t === team)).map(p => p.a));
}

// ---------- the pick (rules only, no DOM) ----------
// players: { n (id), name, t (team, 0 or 1; always 0 in deathmatch), hover, a (locked agent), locked, bot, host }
export class Lobby {
  constructor({ mode, map, mapName, botCount = 0, pickTime = PICK_TIME }) {
    this.mode = mode; this.map = map; this.mapName = mapName || map;
    this.rounds = mode === 'rounds';
    this.botCount = this.rounds ? 0 : botCount; // 5v5 bots fill whatever slots people leave
    this.pickTime = pickTime;
    this.players = [];
    this.phase = 'wait'; // wait (room open, host hasn't started) -> pick -> bots -> go -> done
    this.endsAt = 0;
    this.botSeq = 0;
  }

  get humans() { return this.players.filter(p => !p.bot); }
  get open() { return this.phase === 'wait' || this.phase === 'pick'; }

  // A new person: in 5v5 they go on the team with fewer people (ties to team 0, the host's).
  add(n, name, host = false) {
    if (!this.open) return null;
    const have = [0, 0];
    for (const p of this.humans) have[p.t]++;
    let t = 0;
    if (this.rounds) {
      if (have[0] >= 5 && have[1] >= 5) return null;
      t = have[1] < have[0] ? 1 : 0;
    }
    const p = { n, name, t, hover: null, a: null, locked: false, bot: false, host };
    this.players.push(p);
    return p;
  }

  remove(n) {
    const i = this.players.findIndex(p => p.n === n);
    if (i >= 0) this.players.splice(i, 1);
  }

  get(n) { return this.players.find(p => p.n === n); }
  free(p) { const t = takenAgents(this.players, p.t, this.rounds, p.n); return AGENT_ORDER.filter(a => !t.has(a)); }

  hover(n, a) {
    const p = this.get(n);
    if (!p || p.locked || !this.open || !AGENTS[a]) return false;
    p.hover = a;
    return true;
  }

  // First to lock an agent gets it; a teammate who was only hovering it has to pick another.
  lock(n, a) {
    const p = this.get(n);
    if (!p || p.locked || !this.open || !AGENTS[a] || !this.free(p).includes(a)) return false;
    p.a = p.hover = a; p.locked = true;
    return true;
  }

  start(now = clock()) {
    if (this.phase !== 'wait') return;
    this.phase = 'pick';
    this.endsAt = now + this.pickTime;
  }

  // Moves the pick along; true once the match should start.
  step(now = clock()) {
    if (this.phase === 'pick' && (this.humans.every(p => p.locked) || now >= this.endsAt)) {
      // Time's up: whatever you were hovering is locked for you, or a random agent if someone took it.
      for (const p of this.humans) if (!p.locked) { const free = this.free(p); this.lock(p.n, free.includes(p.hover) ? p.hover : free[Math.floor(Math.random() * free.length)]); }
      this.addBots();
      this.phase = 'bots';
      this.endsAt = now + 0.6;
    }
    if (this.phase === 'bots' && now >= this.endsAt) {
      const b = this.players.find(p => p.bot && !p.locked);
      if (b) { this.botLock(b, this.botChoice(b)); this.endsAt = now + BOT_PICK_GAP; }
      else { this.phase = 'go'; this.endsAt = now + GO_DELAY; }
    }
    if (this.phase === 'go' && now >= this.endsAt) { this.phase = 'done'; return true; }
    return false;
  }

  addBots() {
    const add = (t) => this.players.push({ n: 'bot' + this.botSeq++, name: 'Bot', t, hover: null, a: null, locked: false, bot: true });
    if (this.rounds) for (const t of [0, 1]) for (let i = this.players.filter(p => p.t === t).length; i < 5; i++) add(t);
    else for (let i = 0; i < this.botCount; i++) add(0);
  }

  // Bots fill the roles their team doesn't have yet, then anything left.
  botChoice(b) {
    let free = this.free(b);
    if (!free.length) return AGENT_ORDER[Math.floor(Math.random() * AGENT_ORDER.length)]; // more players than agents (deathmatch)
    const mates = this.players.filter(p => p.locked && (!this.rounds || p.t === b.t)).map(p => AGENTS[p.a].role);
    const missing = ROLES.filter(r => !mates.includes(r));
    const fit = free.filter(a => missing.includes(AGENTS[a].role));
    if (fit.length) free = fit;
    return shuffle(free)[0];
  }

  // botChoice already kept to free agents (or, past 24 players in deathmatch, had to repeat one).
  botLock(b, a) { b.a = b.hover = a; b.locked = true; }

  state(now = clock()) {
    return { mode: this.mode, map: this.map, mapName: this.mapName, phase: this.phase, left: Math.max(0, this.endsAt - now), bots: this.botCount, players: this.players.map(p => ({ ...p })) };
  }

  // Who plays what, for starting the match: people by id, bots by team.
  lineup() { return this.players.map(p => ({ n: p.n, t: p.t, a: p.a, bot: p.bot, host: !!p.host })); }
}

// Original emblems, one per agent, drawn as simple SVG marks in the agent's colour.
export function emblem(type, color) {
  const paths = {
    wind: '<path d="M14 40c18-14 46-14 70 2" /><path d="M8 58c24-12 54-10 80 6" /><path d="M20 76c16-8 36-7 52 3" /><circle cx="84" cy="34" r="5" />',
    flame: '<path d="M50 10c6 18 26 26 26 50a26 26 0 0 1-52 0c0-14 8-20 12-30 2 10 8 14 12 14-4-10-4-22 2-34z" /><path d="M50 56c4 6 10 10 10 18a10 10 0 0 1-20 0c0-6 6-10 10-18z" />',
    moon: '<path d="M62 14a36 36 0 1 0 22 58 30 30 0 1 1-22-58z" /><path d="M74 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />',
    eye: '<path d="M8 50c22-30 62-30 84 0-22 30-62 30-84 0z" /><circle cx="50" cy="50" r="13" /><path d="M50 8v12M50 80v12" />',
    shield: '<path d="M50 8l34 12v26c0 22-14 38-34 46-20-8-34-24-34-46V20z" /><path d="M50 26v50M30 44h40" />',
    blast: '<circle cx="46" cy="56" r="26" /><path d="M64 36l10-12M74 24l8 2M74 24l-2-8" /><path d="M34 52a12 12 0 0 1 12-12" />',
    strike: '<path d="M50 6v34" /><path d="M36 26l14 14 14-14" /><circle cx="50" cy="66" r="22" /><path d="M50 52v28M36 66h28" />',
    snake: '<path d="M28 84c-14-16 4-30 22-30s36-14 22-30c-8-9-22-8-28 0" /><circle cx="44" cy="22" r="3" /><path d="M76 24l10-6M76 24l10 4" />',
    soul: '<path d="M50 12c14 18 26 28 26 46a26 26 0 0 1-52 0c0-18 12-28 26-46z" /><path d="M40 58l10-10 10 10-10 10z" />',
    quake: '<path d="M8 62h18l8-22 12 40 10-52 10 34 8-14h18" />',
    bolt: '<path d="M56 6L24 56h22l-6 38 34-52H52z" />',
    mask: '<path d="M14 30c12-8 60-8 72 0 0 30-14 52-36 58-22-6-36-28-36-58z" /><path d="M30 46l12 4M70 46l-12 4" />',
    leaf: '<path d="M18 82C18 40 48 14 86 14c0 38-26 68-68 68z" /><path d="M18 82l44-44" />',
    cam: '<path d="M18 34h48l16-10v52l-16-10H18z" /><circle cx="42" cy="50" r="9" />',
    claw: '<path d="M22 84c6-30 16-52 30-70M42 86c4-26 12-46 26-62M62 86c2-20 8-36 20-50" />',
    crystal: '<path d="M50 8l22 22-22 62-22-62z" /><path d="M28 30h44M50 8v84" />',
    star: '<path d="M50 10l9 27h28l-23 17 9 28-23-17-23 17 9-28-23-17h28z" />',
    crown: '<path d="M14 76l8-44 18 22 10-30 10 30 18-22 8 44z" /><path d="M14 86h72" />',
    wave: '<path d="M8 60c14-22 28-22 42 0s28 22 42 0" /><path d="M8 40c14-22 28-22 42 0s28 22 42 0" />',
    prism: '<path d="M50 10L86 80H14z" /><path d="M4 52h34M62 46l34-10M62 56l34 4M62 66l34 18" />',
    hex2: '<path d="M50 8l36 21v42L50 92 14 71V29z" /><path d="M50 30l18 10v20L50 70 32 60V40z" />',
    target: '<circle cx="50" cy="50" r="36" /><circle cx="50" cy="50" r="14" /><path d="M50 4v20M50 76v20M4 50h20M76 50h20" />',
    butterfly: '<path d="M50 30v52" /><path d="M50 44C38 18 12 16 14 38s20 22 36 12" /><path d="M50 44c12-26 38-28 36-6s-20 22-36 12" /><path d="M50 56c-10 6-24 16-20 26s16 0 20-10M50 56c10 6 24 16 20 26s-16 0-20-10" />',
    chip: '<rect x="24" y="24" width="52" height="52" rx="6" /><path d="M36 8v16M50 8v16M64 8v16M36 76v16M50 76v16M64 76v16M8 36h16M8 64h16M76 36h16M76 64h16" />',
  };
  return `<svg viewBox="0 0 100 100" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${paths[type] || paths.wind}</svg>`;
}

const ROLE_ICON = {
  all: '<svg viewBox="0 0 20 20"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" fill="currentColor"/></svg>',
  Duelist: '<svg viewBox="0 0 20 20"><path d="M4 16L15 5M11 4h5v5" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  Initiator: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>',
  Controller: '<svg viewBox="0 0 20 20"><path d="M3 12c2-6 12-6 14 0-4 4-10 4-14 0z" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  Sentinel: '<svg viewBox="0 0 20 20"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
};

const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const abilityTag = (x) => (x.cooldown >= 1e6 ? `${x.charges}× · 2 kills` : x.cooldown ? `${x.charges}× · ${x.cooldown}s` : /soul orb/i.test(x.desc) ? `${x.charges}× · soul orb` : 'toggle');

// ---------- the screen ----------
// Draws a Lobby state for one person (`me`). Picking a card hovers it (teammates see that), LOCK IN locks it.
// cb: onHover(agent), onLock(agent), onStart() (host only), onBack()
export class SelectScreen {
  constructor(root, cb) {
    this.root = root; this.cb = cb;
    this.sel = null; this.tab = 'info'; this.role = 'all';
    root.innerHTML = `
      <div class="sel-bg"></div>
      <div class="sel-art" id="sel-art"></div>
      <div class="sel-left">
        <div class="sel-map"><b id="sel-map"></b><small id="sel-mode"></small></div>
        <div class="sel-roles" id="sel-roles"></div>
        <div class="sel-grid" id="sel-grid"></div>
        <button class="sel-back" id="sel-back">Leave</button>
      </div>
      <div class="sel-info" id="sel-info"></div>
      <div class="sel-center">
        <div class="sel-time" id="sel-time"></div>
        <button class="sel-lock" id="sel-lock">Lock in</button>
        <div class="sel-note" id="sel-note"></div>
        <button class="sel-start" id="sel-start" hidden>Start agent select</button>
      </div>
      <div class="sel-team" id="sel-team"></div>
      <div class="sel-enemy" id="sel-enemy"></div>`;
    this.$ = (id) => root.querySelector('#' + id);
    const roles = this.$('sel-roles');
    for (const r of ['all', ...ROLES]) {
      const b = document.createElement('button');
      b.dataset.role = r; b.title = r === 'all' ? 'All agents' : r + 's';
      b.innerHTML = ROLE_ICON[r];
      b.onclick = () => { this.role = r; this.drawGrid(); };
      roles.appendChild(b);
    }
    const grid = this.$('sel-grid');
    for (const id of AGENT_ORDER) {
      const a = AGENTS[id];
      const b = document.createElement('button');
      b.className = 'sel-card'; b.dataset.id = id; b.title = `${a.name} · ${a.role}`;
      b.style.setProperty('--ac', a.color);
      b.innerHTML = `${emblem(a.emblem, a.color)}<span>${a.name}</span>`;
      b.onclick = () => this.choose(id);
      b.ondblclick = () => { this.choose(id); this.lock(); };
      grid.appendChild(b);
    }
    this.$('sel-lock').onclick = () => this.lock();
    this.$('sel-start').onclick = () => this.cb.onStart?.();
    this.$('sel-back').onclick = () => this.cb.onBack?.();
  }

  // state: Lobby.state(); me: my player id; host: show the host's Start button.
  show(state, me, { host = false, preferred = null } = {}) {
    this.me = me; this.host = host;
    this.sel = null; this.tab = 'info'; this.role = 'all';
    this.update(state);
    const mine = this.mine();
    const free = this.free();
    this.choose(mine?.a || (free.includes(preferred) ? preferred : free[0] || AGENT_ORDER[0]), true);
  }

  mine() { return this.state?.players.find(p => p.n === this.me); }
  free() { const m = this.mine(); const t = takenAgents(this.state.players, m?.t ?? 0, this.state.mode === 'rounds', this.me); return AGENT_ORDER.filter(a => !t.has(a)); }
  canPick() { const m = this.mine(); return !!m && !m.locked && (this.state.phase === 'wait' || this.state.phase === 'pick'); }

  choose(id, quiet = false) {
    if (!AGENTS[id]) return;
    const m = this.mine();
    if (m?.locked) id = m.a;
    else if (!this.free().includes(id)) return;
    if (this.sel !== id) { this.sel = id; this.tab = 'info'; this.drawInfo(); }
    this.drawGrid();
    if (!quiet && this.canPick()) this.cb.onHover?.(id);
    this.drawCenter();
  }

  lock() {
    if (!this.canPick() || !this.sel || !this.free().includes(this.sel)) return;
    this.cb.onLock?.(this.sel);
  }

  update(state) {
    this.state = state;
    const rounds = state.mode === 'rounds';
    this.$('sel-map').textContent = state.mapName || state.map;
    this.$('sel-mode').textContent = (rounds ? '5v5 rounds' : 'Deathmatch') + (state.room ? ` · Room code ${state.room}` : '');
    // Someone locked what I was looking at: move to a free agent.
    const m = this.mine();
    if (m?.locked && this.sel !== m.a) { this.sel = m.a; this.drawInfo(); }
    else if (this.sel && !m?.locked && !this.free().includes(this.sel)) { const f = this.free()[0]; if (f) { this.sel = f; this.drawInfo(); if (this.canPick()) this.cb.onHover?.(f); } }
    this.drawGrid();
    this.drawCenter();
    this.drawTeam();
  }

  drawGrid() {
    if (!this.state) return;
    const free = new Set(this.free()), m = this.mine();
    for (const b of this.$('sel-roles').children) b.classList.toggle('on', b.dataset.role === this.role);
    for (const c of this.$('sel-grid').children) {
      const id = c.dataset.id, a = AGENTS[id];
      c.hidden = this.role !== 'all' && a.role !== this.role;
      c.classList.toggle('sel', id === this.sel);
      c.classList.toggle('taken', !free.has(id));
      c.classList.toggle('locked', !!m?.locked && id === m.a);
      c.disabled = !free.has(id) || (!!m?.locked && id !== m.a);
    }
  }

  drawInfo() {
    const a = AGENTS[this.sel];
    if (!a) return;
    this.root.style.setProperty('--ac', a.color);
    this.$('sel-art').innerHTML = emblem(a.emblem, a.color);
    const keys = [['info', 'Info'], ['c', 'C'], ['q', 'Q'], ['e', 'E'], ['x', 'X'], ...(a.passive ? [['p', 'Passive']] : [])];
    const ab = this.tab === 'p' ? a.passive : a.abilities[this.tab];
    const body = this.tab === 'info'
      ? `<p>${esc(a.blurb)}</p><h4>${esc(a.role)}</h4><p class="sel-muted">${roleBlurb(a.role)}</p>`
      : `<h4>${esc(ab.name)} <em>${this.tab === 'x' ? `${ab.points} ult points` : this.tab === 'p' ? 'passive' : abilityTag(ab)}</em></h4><p>${esc(ab.desc)}</p>`;
    this.$('sel-info').innerHTML = `
      <small>${esc(a.role)}</small><h2>${esc(a.name)}</h2>
      <div class="sel-tabs">${keys.map(([k, label]) => `<button data-k="${k}" class="${k === this.tab ? 'on' : ''}">${label}</button>`).join('')}</div>
      <div class="sel-body">${body}</div>`;
    for (const b of this.$('sel-info').querySelectorAll('.sel-tabs button')) b.onclick = () => { this.tab = b.dataset.k; this.drawInfo(); };
  }

  drawCenter() {
    const s = this.state, m = this.mine();
    if (!s) return;
    const lockBtn = this.$('sel-lock'), note = this.$('sel-note'), time = this.$('sel-time');
    time.textContent = s.phase === 'pick' ? Math.ceil(s.left) : s.phase === 'go' ? Math.ceil(s.left) : '';
    time.classList.toggle('low', s.phase === 'pick' && s.left <= 10);
    lockBtn.hidden = !m || m.locked || !(s.phase === 'wait' || s.phase === 'pick');
    lockBtn.disabled = !this.sel || !this.free().includes(this.sel);
    this.$('sel-start').hidden = !(this.host && s.phase === 'wait');
    const waiting = s.players.filter(p => !p.bot && !p.locked).length;
    note.textContent =
      s.phase === 'wait' ? (this.host ? (s.players.length > 1 ? `${s.players.length} people in the room. Start when everyone's here.` : 'Share the room code. Players who join will show up here.') : 'Waiting for the host to start. You can lock in already.')
      : s.phase === 'pick' ? (m?.locked ? (waiting ? `Waiting for ${waiting} more to lock in` : '') : 'Pick an agent and lock in')
      : s.phase === 'bots' ? 'Bots are picking from the agents that are left'
      : s.phase === 'go' || s.phase === 'done' ? 'Match starting' : '';
  }

  drawTeam() {
    const s = this.state, rounds = s.mode === 'rounds', m = this.mine();
    const myTeam = m?.t ?? 0;
    const mates = s.players.filter(p => !rounds || p.t === myTeam);
    const slots = rounds ? 5 : mates.length + (s.phase === 'wait' || s.phase === 'pick' ? s.bots : 0) - mates.filter(p => p.bot).length;
    const cards = [];
    for (let i = 0; i < Math.max(slots, mates.length); i++) {
      const p = mates[i];
      if (!p) { cards.push(`<div class="sel-slot empty">${emblemBlank()}<b>Bot</b><small>Picks last</small></div>`); continue; }
      const a = AGENTS[p.locked ? p.a : p.hover];
      const status = p.locked ? (a?.name || '') : 'Picking…';
      const who = p.n !== this.me ? p.name : p.name === 'You' ? 'You' : `${p.name} (you)`;
      cards.push(`<div class="sel-slot${p.locked ? ' locked' : ''}${p.n === this.me ? ' me' : ''}" data-agent="${p.locked ? p.a : p.hover || ''}" title="${a ? esc(a.name) : ''}" style="--ac:${a?.color || '#556'}">
        ${a ? emblem(a.emblem, p.locked ? a.color : '#8a96a3') : emblemBlank()}<b>${esc(who)}</b><small>${esc(status)}</small></div>`);
    }
    this.$('sel-team').innerHTML = cards.join('');
    const enemy = this.$('sel-enemy');
    enemy.hidden = !rounds;
    if (rounds) {
      // The other team's picks stay hidden: only how many have locked in.
      const foes = s.players.filter(p => p.t !== myTeam);
      const locked = foes.filter(p => p.locked).length;
      enemy.innerHTML = `<span>${locked >= 5 ? 'Enemy team locked in' : 'Enemy team picking'}</span><div>${[0, 1, 2, 3, 4].map(i => `<i class="${i < locked ? 'on' : ''}"></i>`).join('')}</div>`;
    }
  }
}

const emblemBlank = () => '<svg viewBox="0 0 100 100" fill="none" stroke="#3a4652" stroke-width="5"><circle cx="50" cy="38" r="16"/><path d="M20 88c4-20 16-30 30-30s26 10 30 30"/></svg>';

function roleBlurb(role) {
  return {
    Duelist: 'Duelists are self-sufficient fraggers who take first contact and win the opening fight.',
    Initiator: 'Initiators set up their team to enter contested ground: they find, flush and stun defenders.',
    Controller: 'Controllers cut dangerous territory apart with smokes and walls so the team can take it.',
    Sentinel: 'Sentinels lock down areas and watch flanks, on attack and on defense.',
  }[role] || '';
}
