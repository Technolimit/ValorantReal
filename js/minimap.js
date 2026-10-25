// Mini-map (top left). Teammates always show; enemies only while you or a teammate can actually see them
// (in their field of view, with no wall or smoke in the way), or while revealed by an ability. An enemy
// that drops out of sight leaves a fading "last seen" marker for a couple of seconds.
const SMALL = 210; // CSS pixels (corner minimap)
const bigSize = () => Math.round(Math.min(innerHeight * 0.86, innerWidth * 0.62, 820)); // M: the full map
const SEEN_FADE = 2.5; // seconds a last-seen marker lingers
const FOV = Math.cos((103 / 2 + 8) * Math.PI / 180); // a little wider than the screen

export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.base = null; // pre-rendered layout for the current map
    this.seen = new Map(); // enemy -> { pos, at }
    this.nextScan = 0;
    this.big = false; // toggled with M
    this.size = SMALL;
    game.on('map', () => { this.base = null; this.seen.clear(); });
    game.on('start', () => { this.base = null; this.seen.clear(); });
    game.on('roundClear', () => this.seen.clear());
  }

  // Top-down drawing of the map: floor cells, raised floors lighter, walls left dark. Drawn once per map.
  buildBase() {
    const m = this.game.map, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = m.W, H = m.H, cell = 2;
    const SIZE = this.size, k = SIZE / SMALL; // label sizes scale with the map
    const span = Math.max(W, H) * cell;
    this.scale = SIZE / span; // px per metre
    this.offX = (SIZE - W * cell * this.scale) / 2; this.offZ = (SIZE - H * cell * this.scale) / 2;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const px = cell * this.scale;
    for (let z = 0; z < H; z++) for (let cx = 0; cx < W; cx++) {
      const h = m.heights[z]?.[cx];
      if (h === null || h === undefined) continue;
      x.fillStyle = h > 1.5 ? 'rgba(200,210,220,0.62)' : 'rgba(150,165,180,0.5)';
      x.fillRect(this.offX + cx * px, this.offZ + z * px, px + 0.5, px + 0.5);
    }
    // Sites tinted, labels on top.
    for (const s of Object.values(m.sites || {})) {
      const a = this.toMap(s.min[0], s.min[2]), b = this.toMap(s.max[0], s.max[2]);
      x.fillStyle = 'rgba(255,214,90,0.16)';
      x.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      x.fillStyle = 'rgba(255,230,150,0.9)'; x.font = `700 ${Math.round(13 * k)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(s.name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    // Area callouts.
    const siteNames = new Set(Object.values(m.sites || {}).map(s => s.name));
    x.font = `600 ${(7.5 * Math.min(k, 2.2)).toFixed(1)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 2.2; x.strokeStyle = 'rgba(10,14,20,0.85)'; x.fillStyle = 'rgba(235,240,245,0.92)';
    for (const l of m.labels || []) {
      if (siteNames.has(l.text)) continue;
      const p = this.toMap(l.x, l.z);
      x.strokeText(l.text, p[0], p[1]); x.fillText(l.text, p[0], p[1]);
    }
    this.base = { canvas: c, dpr, id: m.id, size: SIZE };
  }

  toMap(wx, wz) {
    const m = this.game.map;
    return [this.offX + (wx - m.ox) * this.scale, this.offZ + (wz - m.oz) * this.scale];
  }

  // Who can be seen by the player's team right now.
  scan(now) {
    const g = this.game, me = g.player;
    const allies = g.combatants.filter(c => c.alive && !g.isEnemy(me, c));
    for (const e of g.combatants) {
      if (!e.alive || !g.isEnemy(me, e)) continue;
      let vis = e.st.revealUntil > now && e.st.hiddenUntil <= now;
      if (!vis && e.st.hiddenUntil <= now) {
        const ee = e.eye();
        for (const a of allies) {
          const ae = a.eye(), dx = ee[0] - ae[0], dz = ee[2] - ae[2], d = Math.hypot(dx, dz);
          if (d > 0.5) { const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw); if ((dx * fx + dz * fz) / d < FOV) continue; }
          if (d > g.sightRange(a)) continue;
          if (g.canSee(ae, ee) || g.canSee(ae, [e.pos[0], e.pos[1] + 0.9, e.pos[2]])) { vis = true; break; }
        }
      }
      if (vis) this.seen.set(e, { pos: [...e.pos], at: now, live: true });
      else { const s = this.seen.get(e); if (s) s.live = false; }
    }
  }

  update() {
    const g = this.game, me = g.player;
    const on = !!(me && g.map?.heights && g.state === 'playing' && !me.kit?.mapPick); // hidden under the big map
    this.canvas.hidden = !on;
    if (!on) return;
    const want = this.big ? bigSize() : SMALL;
    if (want !== this.size) { this.size = want; this.base = null; this.canvas.classList.toggle('big', this.big); this.canvas.style.width = this.canvas.style.height = want + 'px'; }
    const SIZE = this.size, k = Math.min(2.4, SIZE / SMALL); // marker scale
    this.k = k;
    if (!this.base || this.base.id !== g.map.id) this.buildBase();
    const now = g.time;
    if (now >= this.nextScan || now < this.nextScan - 1) { this.nextScan = now + 0.1; this.scan(now); }
    const dpr = this.base.dpr, cv = this.canvas, x = this.ctx;
    if (cv.width !== SIZE * dpr) { cv.width = cv.height = SIZE * dpr; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, SIZE, SIZE);
    x.drawImage(this.base.canvas, 0, 0, SIZE, SIZE);

    // Smokes as grey discs.
    for (const s of g.smokes) {
      if (s.until <= now || s.slab) continue;
      const p = this.toMap(s.pos[0], s.pos[2]);
      x.fillStyle = 'rgba(210,210,225,0.45)';
      x.beginPath(); x.arc(p[0], p[1], Math.max(3 * k, s.radius * this.scale), 0, Math.PI * 2); x.fill();
    }
    // Spike.
    const sp = g.mode?.spike;
    if (sp) {
      const sideAtk = g.mode.side(me) === 'atk';
      const pos = sp.state === 'carried' ? (sideAtk || this.seen.get(sp.carrier)?.live ? sp.carrier?.pos : null) : (sp.state === 'dropped' && !sideAtk ? null : sp.pos);
      if (pos) {
        // The spike: a diamond (red once planted). Attackers always see it, dropped or carried.
        const p = this.toMap(pos[0], pos[2]), r = 4.5 * k;
        x.fillStyle = sp.state === 'planted' ? '#ff4655' : '#ffd54a'; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(p[0], p[1] - r); x.lineTo(p[0] + r, p[1]); x.lineTo(p[0], p[1] + r); x.lineTo(p[0] - r, p[1]); x.closePath(); x.fill(); x.stroke();
        if (sp.state === 'dropped' && this.big) { x.fillStyle = '#ffd54a'; x.font = `700 ${Math.round(5.5 * k)}px system-ui`; x.textAlign = 'center'; x.fillText('SPIKE', p[0], p[1] - r - 6); }
      }
    }
    // Enemies: live sightings solid, recent ones fading.
    for (const [e, s] of this.seen) {
      const age = now - s.at;
      if (!e.alive || (!s.live && age > SEEN_FADE)) { this.seen.delete(e); continue; }
      const pos = s.live ? e.pos : s.pos;
      const p = this.toMap(pos[0], pos[2]);
      x.globalAlpha = s.live ? 1 : Math.max(0.15, 1 - age / SEEN_FADE);
      x.fillStyle = '#ff4655';
      x.beginPath(); x.arc(p[0], p[1], 4 * k, 0, Math.PI * 2); x.fill();
      if (!s.live) { x.strokeStyle = '#ff4655'; x.lineWidth = 1; x.beginPath(); x.arc(p[0], p[1], 6 * k, 0, Math.PI * 2); x.stroke(); }
      x.globalAlpha = 1;
    }
    // Teammates (and you): arrows showing where they're looking.
    for (const c of g.combatants) {
      if (!c.alive || g.isEnemy(me, c)) continue;
      this.arrow(c.pos, c.yaw, c === me ? '#ffffff' : '#4fd1c5', (c === me ? 6 : 5) * k);
      if (this.big && c !== me) { x.fillStyle = '#bdf3ee'; x.font = `600 ${Math.round(5 * k)}px system-ui`; x.textAlign = 'center'; const q = this.toMap(c.pos[0], c.pos[2]); x.fillText(c.kit?.agent.name || c.name, q[0], q[1] + 9 * k); }
    }
    if (!me.alive) { // dead players still see where they fell
      const d = me.deathPos || me.pos, p = this.toMap(d[0], d[2]);
      x.strokeStyle = '#ffffff'; x.lineWidth = 1.5;
      const q = 4 * k; x.beginPath(); x.moveTo(p[0] - q, p[1] - q); x.lineTo(p[0] + q, p[1] + q); x.moveTo(p[0] + q, p[1] - q); x.lineTo(p[0] - q, p[1] + q); x.stroke();
    }
  }

  arrow(pos, yaw, color, r) {
    const x = this.ctx, p = this.toMap(pos[0], pos[2]);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // facing in map space (x right, z down)
    // Field-of-view wedge.
    x.fillStyle = color === '#ffffff' ? 'rgba(255,255,255,0.13)' : 'rgba(79,209,197,0.12)';
    const a = Math.atan2(fz, fx), w = 0.75;
    x.beginPath(); x.moveTo(p[0], p[1]); x.arc(p[0], p[1], r * 4, a - w, a + w); x.closePath(); x.fill();
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(p[0] + fx * r * 1.4, p[1] + fz * r * 1.4);
    x.lineTo(p[0] - fz * r * 0.8 - fx * r * 0.7, p[1] + fx * r * 0.8 - fz * r * 0.7);
    x.lineTo(p[0] + fz * r * 0.8 - fx * r * 0.7, p[1] - fx * r * 0.8 - fz * r * 0.7);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke();
  }
}
