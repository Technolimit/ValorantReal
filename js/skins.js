// Weapon skins: original collections that can be applied to any gun. Each skin paints the model's
// material slots:
//   body   main shell          trim   secondary panels, stock, handguard
//   metal  barrel, bolts, rail grip   rubber grips and pads
//   glow   emissive accent lines (intensity 0 = no glow)
// A slot may name a procedural texture (`tex`) drawn at load time, see TEXTURES below, tinted with
// `texColor` (the pattern) and `texBase` (the background) where the texture supports it.
// Model skins also replace the gun itself: `models` maps a weapon id to a design in models.js (which brings
// its own inspect and reload), and the skin is only offered on those weapons. They may add an `accent` glow.
// A skin with a `finisher` (an effect id in render.js, FINISHERS) plays it on the body of whoever it kills:
// on every kill in deathmatch, and on the kill that ends the round in 5v5 (as in Valorant).
// Players can also design their own skins in the skin menu; those live in localStorage (CUSTOM_KEY) and are
// merged into SKINS at load, so everything below treats preset and custom skins the same way.

export const SKINS = {
  standard: {
    name: 'Standard Issue', tier: 'Default', blurb: 'Factory gunmetal with a faint cyan status light.',
    body: { color: 0x3b414b, rough: 0.55, metal: 0.25 },
    trim: { color: 0x2a2e35, rough: 0.7, metal: 0.1 },
    metal: { color: 0x1c1f23, rough: 0.35, metal: 0.8 },
    grip: { color: 0x202328, rough: 0.95, metal: 0 },
    glow: { color: 0x7fd6ff, intensity: 0.6 },
  },
  ember: {
    name: 'Ember Circuit', tier: 'Premium', blurb: 'Matte black shell traced with molten orange circuitry.',
    body: { color: 0x17181b, rough: 0.6, metal: 0.2, tex: 'circuit', texColor: '#ff7a1a' },
    trim: { color: 0x2b1a12, rough: 0.5, metal: 0.3 },
    metal: { color: 0x26221f, rough: 0.3, metal: 0.85 },
    grip: { color: 0x141414, rough: 0.95, metal: 0 },
    glow: { color: 0xff6a10, intensity: 1.3 },
  },
  glacier: {
    name: 'Glacier', tier: 'Select', blurb: 'Polar white ceramic with frosted blue panels.',
    body: { color: 0xe9f0f5, rough: 0.35, metal: 0.05 },
    trim: { color: 0x9cc4dd, rough: 0.4, metal: 0.1, tex: 'frost' },
    metal: { color: 0xc7d1d9, rough: 0.25, metal: 0.85 },
    grip: { color: 0x51687a, rough: 0.9, metal: 0 },
    glow: { color: 0x8fe9ff, intensity: 1.6 },
  },
  orbital: {
    name: 'Orbital', tier: 'Ultra', blurb: 'A reactor spire at its heart holds a live orb. Inspect it; reload pops it out for a fresh one.',
    models: { vandal: 'vandalOrb', phantom: 'phantomOrb', bulldog: 'bulldogOrb', stinger: 'stingerOrb' },
    // Glossy: lacquered enamel, polished gunmetal and mirror gold.
    body: { color: 0x3a2152, rough: 0.16, metal: 0.8 },
    trim: { color: 0x2a2b33, rough: 0.2, metal: 0.9 },
    metal: { color: 0xe0b04a, rough: 0.12, metal: 1 },
    grip: { color: 0x17161d, rough: 0.7, metal: 0.1 },
    glow: { color: 0x3fb4ff, intensity: 2.6 },
    accent: { color: 0xb44dff, intensity: 2.2 },
    finisher: 'collapse',
    variant: 'Violet',
    variants: [
      { variant: 'Solar', body: { color: 0x5a2410, rough: 0.16, metal: 0.8 }, glow: { color: 0xffb347, intensity: 2.6 }, accent: { color: 0xff4d2e, intensity: 2.2 } },
      { variant: 'Glacial', body: { color: 0x1d4466, rough: 0.14, metal: 0.78 }, metal: { color: 0xd5dee8, rough: 0.1, metal: 1 }, glow: { color: 0x7fffe0, intensity: 2.6 }, accent: { color: 0x3fb4ff, intensity: 2.2 } },
      { variant: 'Eclipse', body: { color: 0x121218, rough: 0.1, metal: 0.92 }, metal: { color: 0x9a9eaa, rough: 0.1, metal: 1 }, glow: { color: 0xff3355, intensity: 2.8 }, accent: { color: 0xffe2e6, intensity: 1.8 } },
    ],
  },
  starspur: {
    name: 'Starspur', tier: 'Ultra', blurb: 'Frontier iron for the outer rim: bone enamel, burnished copper and a teal star-fire core. Every gun carries a spinning spur rowel.',
    models: { sheriff: 'sheriffSpur', marshal: 'marshalSpur', judge: 'judgeSpur' },
    body: { color: 0xe4d8c3, rough: 0.42, metal: 0.05 },
    trim: { color: 0xb86a34, rough: 0.28, metal: 0.95 },
    metal: { color: 0x2b2e35, rough: 0.3, metal: 0.9 },
    grip: { color: 0x4a1f17, rough: 0.8, metal: 0 },
    glow: { color: 0x3cf0d2, intensity: 2.2 },
    accent: { color: 0xffae42, intensity: 2.0 },
    finisher: 'lastLight',
    sounds: 'starspur', // its sound set: a thunkier shot (FIRE_TONE in audio.js)
    variant: 'Frontier',
    variants: [
      { variant: 'Dusk Rider', body: { color: 0x2b2445, rough: 0.4, metal: 0.15 }, glow: { color: 0xff7ad9, intensity: 2.2 }, accent: { color: 0xffae42, intensity: 2.0 } },
      { variant: 'Silver Dollar', body: { color: 0xdfe3e8, rough: 0.3, metal: 0.3 }, trim: { color: 0xc3c9cf, rough: 0.2, metal: 1 }, glow: { color: 0x5aa8ff, intensity: 2.2 }, accent: { color: 0xdff0ff, intensity: 1.8 } },
      { variant: 'Red Mesa', body: { color: 0x7a2a1c, rough: 0.5, metal: 0.05 }, trim: { color: 0xd9a441, rough: 0.28, metal: 0.95 }, grip: { color: 0x2a1a12, rough: 0.8, metal: 0 }, glow: { color: 0xffd166, intensity: 2.2 }, accent: { color: 0xff6a3d, intensity: 2.0 } },
    ],
  },
  oathblade: {
    name: 'Oathblade', tier: 'Ultra', blurb: 'Black lacquer and gold leaf over folded steel. Every gun carries a blade, and its edge lights as you draw.',
    models: { vandal: 'vandalOath', sheriff: 'sheriffOath' },
    body: { color: 0x0d0d11, rough: 0.14, metal: 0.35 },
    trim: { color: 0xc9a24a, rough: 0.25, metal: 1 },
    metal: { color: 0xffffff, rough: 0.18, metal: 0.95, tex: 'damascus', texColor: '#c9ced6', texBase: '#4a5058' },
    grip: { color: 0x6e0f18, rough: 0.85, metal: 0 },
    glow: { color: 0xbfe4ff, intensity: 2.4 },
    accent: { color: 0xff3b4a, intensity: 2.0 },
    finisher: 'lastStroke',
    sounds: 'oathblade', // its sound set: a crisper shot (FIRE_TONE in audio.js) and the pullout file in sounds/index.json
    variant: 'Ink',
    variants: [
      { variant: 'Crimson Oath', body: { color: 0x5a0b12, rough: 0.14, metal: 0.35 }, grip: { color: 0x15100e, rough: 0.85, metal: 0 }, glow: { color: 0xffd27a, intensity: 2.4 }, accent: { color: 0xff7a2e, intensity: 2.0 } },
      { variant: 'Jade Court', body: { color: 0x0f3b2e, rough: 0.16, metal: 0.3 }, grip: { color: 0x1c1712, rough: 0.85, metal: 0 }, glow: { color: 0xd9fff2, intensity: 2.4 }, accent: { color: 0x5cffc0, intensity: 2.0 } },
      { variant: 'First Snow', body: { color: 0xece6da, rough: 0.2, metal: 0.1 }, trim: { color: 0xb8bec6, rough: 0.2, metal: 1 }, grip: { color: 0x1d2a44, rough: 0.85, metal: 0 }, glow: { color: 0x8fc8ff, intensity: 2.4 }, accent: { color: 0xff5a7a, intensity: 2.0 } },
    ],
  },
  apogee: {
    name: 'Apogee', tier: 'Ultra', blurb: 'White ceramic over black glass, a gilded skeleton and violet inlays. The top of every gun hinges open to take a live energy cell.',
    models: { classic: 'classicApo', spectre: 'spectreApo', vandal: 'vandalApo', guardian: 'guardianApo' },
    // Slots: body = white ceramic shell, metal = black glass panels and barrel, trim = gold, grip = violet panels.
    body: { color: 0xeef0f3, rough: 0.18, metal: 0.08 },
    trim: { color: 0xd9ad45, rough: 0.2, metal: 1 },
    metal: { color: 0x141418, rough: 0.16, metal: 0.7 },
    grip: { color: 0x3c2470, rough: 0.45, metal: 0.2 },
    glow: { color: 0x62e6ff, intensity: 2.4 },
    accent: { color: 0xa25cff, intensity: 2.0 },
    finisher: 'coronation',
    sounds: 'apogee', // its sound set: an energy pulse built on the Vandal's shot (FIRE_TONE in audio.js)
    variant: 'Gilt',
    variants: [
      { variant: 'Onyx', body: { color: 0x1a1a1f, rough: 0.14, metal: 0.4 }, metal: { color: 0x2c2c33, rough: 0.2, metal: 0.8 }, grip: { color: 0x5a0f1c, rough: 0.45, metal: 0.2 }, glow: { color: 0xff4d5e, intensity: 2.4 }, accent: { color: 0xffb04a, intensity: 2.0 } },
      { variant: 'Rosewhite', trim: { color: 0xe6a58e, rough: 0.2, metal: 1 }, grip: { color: 0x7a2a4e, rough: 0.45, metal: 0.2 }, glow: { color: 0xff8fd0, intensity: 2.4 }, accent: { color: 0xffd6e8, intensity: 1.8 } },
      { variant: 'Glacier Crown', body: { color: 0x1d2c4a, rough: 0.16, metal: 0.3 }, trim: { color: 0xc9d2dc, rough: 0.18, metal: 1 }, grip: { color: 0x0f4a5c, rough: 0.45, metal: 0.2 }, glow: { color: 0x9ff7ff, intensity: 2.4 }, accent: { color: 0x4da3ff, intensity: 2.0 } },
    ],
  },
};

// Each melee type comes in exactly one theme of its own (picked with the melee type, not from the skin grid).
// They're registered as skins `melee-<type>` below so models, kill banners and finishers treat them like any
// other skin, but they never show up in the gun skin grid and fit only their own melee type.
export const MELEE_THEMES = {
  knife: {
    name: 'Standard Issue', tier: 'Default', blurb: 'Factory gunmetal with a faint cyan status light.',
    body: { color: 0x3b414b, rough: 0.55, metal: 0.25 },
    trim: { color: 0x2a2e35, rough: 0.7, metal: 0.1 },
    metal: { color: 0x1c1f23, rough: 0.35, metal: 0.8 },
    grip: { color: 0x202328, rough: 0.95, metal: 0 },
    glow: { color: 0x7fd6ff, intensity: 0.6 },
  },
  axe: {
    name: 'Heirloom', tier: 'Select', blurb: 'Bone enamel, walnut and aged brass.',
    body: { color: 0xe8dcc4, rough: 0.6, metal: 0 },
    trim: { color: 0xffffff, rough: 0.55, metal: 0, tex: 'wood' },
    metal: { color: 0xa98336, rough: 0.35, metal: 0.9 },
    grip: { color: 0x4f3520, rough: 0.8, metal: 0 },
    glow: { color: 0xffc46b, intensity: 0.5 },
  },
  katana: {
    name: 'Damascus', tier: 'Exclusive', blurb: 'Folded steel with flowing ripples, bronze furniture.',
    body: { color: 0xffffff, rough: 0.22, metal: 0.9, tex: 'damascus' },
    trim: { color: 0x6b4a2a, rough: 0.5, metal: 0.4 },
    metal: { color: 0xffffff, rough: 0.2, metal: 0.95, tex: 'damascus' },
    grip: { color: 0x2a1c12, rough: 0.85, metal: 0 },
    glow: { color: 0xe8eef5, intensity: 0.4 },
  },
  karambit: {
    name: 'Nightglass', tier: 'Exclusive', blurb: 'Black chrome that drinks the light, edged in violet.',
    body: { color: 0x0c0c13, rough: 0.12, metal: 0.95 },
    trim: { color: 0x251a3d, rough: 0.2, metal: 0.8 },
    metal: { color: 0x3a3450, rough: 0.15, metal: 1 },
    grip: { color: 0x101018, rough: 0.9, metal: 0 },
    glow: { color: 0xb06bff, intensity: 2.6 },
  },
  balisong: {
    name: 'Tiger Stripe', tier: 'Premium', blurb: 'Hand-painted amber and black stripes.',
    body: { color: 0xffffff, rough: 0.5, metal: 0.05, tex: 'tiger', texColor: '#141210', texBase: '#e08a1e' },
    trim: { color: 0x1b1916, rough: 0.6, metal: 0.1 },
    metal: { color: 0x2b2926, rough: 0.35, metal: 0.8 },
    grip: { color: 0xffffff, rough: 0.6, metal: 0.05, tex: 'tiger', texColor: '#141210', texBase: '#e08a1e' },
    glow: { color: 0xffb547, intensity: 0.8 },
  },
  kunai: {
    name: 'Hexcore', tier: 'Exclusive', blurb: 'Armoured hex plating with a red reactor core.',
    body: { color: 0x2a2f3a, rough: 0.45, metal: 0.5, tex: 'hex', texColor: '#ff4655' },
    trim: { color: 0x171a20, rough: 0.5, metal: 0.4 },
    metal: { color: 0x2d2f33, rough: 0.3, metal: 0.9 },
    grip: { color: 0xffffff, rough: 0.6, metal: 0.4, tex: 'hex', texColor: '#ff4655' },
    glow: { color: 0xff4655, intensity: 2.4 },
  },
  arc: {
    name: 'Nebula', tier: 'Exclusive', blurb: 'A slice of deep space: drifting gas clouds and pinpoint stars.',
    body: { color: 0xffffff, rough: 0.2, metal: 0.3, tex: 'nebula', texColor: '#c86bff', texBase: '#0b0a1f' },
    trim: { color: 0x15122e, rough: 0.25, metal: 0.7 },
    metal: { color: 0x3a3560, rough: 0.2, metal: 1 },
    grip: { color: 0x0d0b1a, rough: 0.9, metal: 0 },
    glow: { color: 0x7fd6ff, intensity: 2.4 },
  },
  tanto: { ...SKINS.oathblade, models: undefined, variants: undefined, variant: undefined, blurb: 'The Oathblade collection\'s knife: a lacquered tanto with a gold collar and a silk cord. Its edge lights as it leaves your hand.' },
  bowie: { ...SKINS.starspur, models: undefined, variants: undefined, variant: undefined, blurb: 'The Starspur collection\'s knife: a copper-guarded bowie with a star rowel that spins at the guard.' },
  battleaxe: { ...SKINS.apogee, models: undefined, variants: undefined, variant: undefined, blurb: 'The Apogee collection\'s melee: a white and gold battle axe on a black haft. Its edge gilds itself as it comes out.' },
};

// ---- procedural textures (256 px, tiled across the gun at roughly 8 tiles per metre) ----
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

export const TEXTURES = {
  circuit(g, s, col = '#ff7a1a', base = '#17181b') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rand(7);
    g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'square';
    for (let i = 0; i < 14; i++) {
      let x = Math.floor(r() * 8) * 32, y = Math.floor(r() * 8) * 32;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (r() < 0.5) x += (r() < 0.5 ? -1 : 1) * 32; else y += (r() < 0.5 ? -1 : 1) * 32;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = col; g.fillRect(x - 5, y - 5, 10, 10);
    }
  },
  frost(g, s, col, base = '#9cc4dd') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rand(3);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`; g.lineWidth = 1 + r() * 2;
      const x = r() * s, y = r() * s, a = r() * Math.PI, l = 10 + r() * 40;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  },
  waves(g, s, col = '#4fd6c6', base = '#0f5c63') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.strokeStyle = col; g.lineWidth = 3;
    for (let row = 0; row < 8; row++) {
      g.beginPath();
      for (let x = 0; x <= s; x += 4) {
        const y = row * 32 + 16 + Math.sin((x / s) * Math.PI * 4 + row) * 8;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
  },
  camo(g, s) {
    const cols = ['#56633f', '#3c4a2e', '#7b7a52', '#2a2f22'];
    g.fillStyle = cols[0]; g.fillRect(0, 0, s, s);
    const r = rand(11);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = cols[1 + (i % 3)];
      const x = r() * s, y = r() * s;
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, d = 10 + r() * 22;
        // wrap blobs so the tile repeats without seams
        k ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      g.closePath(); g.fill();
    }
  },
  fade(g, s) {
    // Mirrored so neighbouring tiles meet without a seam.
    const gr = g.createLinearGradient(0, 0, s, 0);
    gr.addColorStop(0, '#ff6b8b'); gr.addColorStop(0.25, '#ff9a5a'); gr.addColorStop(0.5, '#ffd166');
    gr.addColorStop(0.75, '#ff9a5a'); gr.addColorStop(1, '#ff6b8b');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  },
  wood(g, s, col, base = '#7a4f2a') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rand(5);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(${40 + r() * 30},${20 + r() * 15},8,${0.25 + r() * 0.3})`; g.lineWidth = 1 + r() * 3;
      const y = r() * s;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
      g.stroke();
    }
  },
  hex(g, s, col = '#ff4655', base = '#2a2f3a') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const R = 21, w = Math.sqrt(3) * R;
    g.strokeStyle = '#4a5366'; g.lineWidth = 4;
    for (let row = -1; row < 9; row++) for (let c = -1; c < 9; c++) {
      const cx = c * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; k ? g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R) : g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
      g.closePath(); g.stroke();
      if ((row * 7 + c * 3) % 11 === 0) { g.fillStyle = col; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; }
    }
  },
  carbon(g, s, col = '#2b2e33', base = '#141518') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const n = 16, q = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const gr = (x + y) % 2 ? g.createLinearGradient(x * q, 0, x * q + q, 0) : g.createLinearGradient(0, y * q, 0, y * q + q);
      gr.addColorStop(0, base); gr.addColorStop(0.5, col); gr.addColorStop(1, base);
      g.fillStyle = gr; g.fillRect(x * q + 1, y * q + 1, q - 2, q - 2);
    }
  },
  damascus(g, s, col = '#d8dde3', base = '#6f767e') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.strokeStyle = col; g.lineWidth = 2.5; g.globalAlpha = 0.8;
    for (let row = -2; row < 22; row++) {
      g.beginPath();
      for (let x = 0; x <= s; x += 4) {
        const y = row * 13 + Math.sin(x / s * Math.PI * 2 * 2 + row * 0.7) * 9 + Math.sin(x / s * Math.PI * 2 * 5) * 3;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  },
  tiger(g, s, col = '#141210', base = '#e08a1e') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rand(17);
    g.fillStyle = col;
    for (let i = 0; i < 18; i++) {
      const x = (i / 18) * s + r() * 8, w = 4 + r() * 9, len = s * (0.35 + r() * 0.5), y0 = r() * s;
      g.beginPath();
      // tapered stripe, drawn twice so it wraps vertically without a seam
      for (const off of [0, -s]) {
        g.moveTo(x, y0 + off);
        g.quadraticCurveTo(x + w * 2, y0 + off + len / 2, x + w * 0.3, y0 + off + len);
        g.quadraticCurveTo(x - w, y0 + off + len / 2, x, y0 + off);
      }
      g.fill();
    }
  },
  nebula(g, s, col = '#c86bff', base = '#0b0a1f') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rand(23);
    for (let i = 0; i < 14; i++) {
      const x = r() * s, y = r() * s, rad = 30 + r() * 70;
      for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) { // wrap the clouds across the tile edges
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
        g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; const z = r() < 0.9 ? 1 : 2; g.fillRect(r() * s, r() * s, z, z); }
  },
  digital(g, s, col = '#6d7b88', base = '#d9e0e6') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rand(29), q = s / 32, mid = mix(base, col, 0.5);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? col : mid;
      const x = Math.floor(r() * 32), y = Math.floor(r() * 32), w = 1 + Math.floor(r() * 3), h = 1 + Math.floor(r() * 2);
      g.fillRect(x * q, y * q, w * q, h * q);
    }
  },
  stripes(g, s, col = '#f4f4f4', base = '#1d4fd8') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.fillStyle = col;
    g.fillRect(0, s * 0.3, s, s * 0.12); g.fillRect(0, s * 0.58, s, s * 0.12);
  },
};

// Patterns a custom skin can use, with the menu label and whether the pattern takes a colour and a background.
export const PATTERNS = {
  circuit: { label: 'Circuit', color: true, base: true }, frost: { label: 'Frost', base: true },
  waves: { label: 'Waves', color: true, base: true }, camo: { label: 'Woodland camo' }, fade: { label: 'Sunset fade' },
  wood: { label: 'Wood grain', base: true }, hex: { label: 'Hex plating', color: true, base: true },
  carbon: { label: 'Carbon fibre', color: true, base: true }, damascus: { label: 'Damascus steel', color: true, base: true },
  tiger: { label: 'Tiger stripe', color: true, base: true }, nebula: { label: 'Nebula', color: true, base: true },
  digital: { label: 'Digital camo', color: true, base: true }, stripes: { label: 'Racing stripes', color: true, base: true },
};

const PRESETS = Object.keys(SKINS);
export const SKIN_ORDER = [...PRESETS];

// Colour variants of a skin (Valorant's chromas): `variants` lists overrides of the base; each is registered as
// skin `<id>~<n>` (n from 1), outside SKIN_ORDER. Pick them with the swatches in the skin screen.
for (const id of PRESETS) {
  (SKINS[id].variants || []).forEach((v, i) => { SKINS[`${id}~${i + 1}`] = { ...SKINS[id], ...v, variants: undefined, variantOf: id }; });
}
export const baseSkin = (id) => SKINS[id]?.variantOf || id;
export const variantsOf = (id) => {
  const base = baseSkin(id);
  return [base, ...(SKINS[base]?.variants || []).map((_, i) => `${base}~${i + 1}`)];
};

// Melee themes join SKINS after SKIN_ORDER is taken, so they stay out of the skin grid.
export const meleeSkin = (meleeType) => (MELEE_THEMES[meleeType] ? 'melee-' + meleeType : null);
for (const [type, def] of Object.entries(MELEE_THEMES)) SKINS[meleeSkin(type)] = { ...def, melee: type };

// Whether a skin can go on a weapon (model skins only fit the weapons they have a model for; a melee type
// wears only its own theme).
export const skinFits = (id, weaponId) => {
  const s = SKINS[id];
  if (!s) return false;
  if (MELEE_THEMES[weaponId] || s.melee) return s.melee === weaponId;
  return !s.models || !!s.models[weaponId];
};
export const skinFor = (settings, weaponId) => meleeSkin(weaponId) || (skinFits(settings.skins?.[weaponId], weaponId) ? settings.skins[weaponId] : 'standard');
// The model design a weapon is drawn with in a skin: the skin's own model, or the weapon's.
export const designFor = (skinId, weaponId) => SKINS[skinId]?.models?.[weaponId] || weaponId;
export const isCustom = (id) => id.startsWith('custom-');

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
// A colour that stands for a textured slot in menu swatches.
const TEX_SWATCH = { camo: '#56633f', fade: '#ff8a6b', wood: '#7a4f2a', frost: '#9cc4dd', carbon: '#26282c', damascus: '#9aa1a8' };
const slotSwatch = (slot) => (slot.tex ? slot.texBase || TEX_SWATCH[slot.tex] || slot.texColor || hex(slot.color) : hex(slot.color));
// Three colours that sum a skin up, for menu swatches.
export const swatch = (id) => {
  const s = SKINS[id] || SKINS.standard;
  return [slotSwatch(s.body), slotSwatch(s.trim), s.glow.intensity ? hex(s.glow.color) : hex(s.metal.color)];
};

// ---- custom skins (all client-side) ----
const CUSTOM_KEY = 'tapfire-custom-skins-v1';
const listeners = new Set();
export const onSkinsChanged = (fn) => listeners.add(fn);
const changed = (id) => { for (const fn of listeners) fn(id); };

const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const colorInt = (v, d) => {
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) return parseInt(v.replace('#', ''), 16);
  return Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d;
};
const colorStr = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
const text = (v, n, d) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '') || d;

// Turn untrusted JSON (an imported file, a share code, another player's skin) into a valid skin, or null.
export function sanitizeSkin(j) {
  if (!j || typeof j !== 'object') return null;
  const base = SKINS.standard;
  const slot = (src, def) => {
    src = src && typeof src === 'object' ? src : {};
    const out = { color: colorInt(src.color, def.color), rough: clamp(src.rough, 0, 1, def.rough), metal: clamp(src.metal, 0, 1, def.metal) };
    if (typeof src.tex === 'string' && PATTERNS[src.tex]) {
      out.tex = src.tex;
      const c = colorStr(src.texColor), b = colorStr(src.texBase);
      if (c) out.texColor = c;
      if (b) out.texBase = b;
    }
    return out;
  };
  const glow = j.glow && typeof j.glow === 'object' ? j.glow : {};
  return {
    name: text(j.name, 28, 'Custom skin'), tier: text(j.tier, 16, 'Custom'), blurb: text(j.blurb, 90, 'Designed in the skin editor.'),
    body: slot(j.body, base.body), trim: slot(j.trim, base.trim), metal: slot(j.metal, base.metal), grip: slot(j.grip, base.grip),
    glow: { color: colorInt(glow.color, base.glow.color), intensity: clamp(glow.intensity, 0, 4, 0) },
  };
}

// Add or replace a skin at runtime. `temporary` skins (other players', previews) are never saved.
export function registerSkin(id, def, { temporary = false } = {}) {
  SKINS[id] = def;
  if (!temporary && !SKIN_ORDER.includes(id)) SKIN_ORDER.push(id);
  changed(id);
  return id;
}

export const customSkinIds = () => SKIN_ORDER.filter(isCustom);

function readCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}'); } catch { return {}; }
}
function writeCustom() {
  const out = {};
  for (const id of customSkinIds()) out[id] = SKINS[id];
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(out)); } catch { /* storage blocked: skins last this session */ }
}

export function saveCustomSkin(def, id = null) {
  const clean = sanitizeSkin(def);
  if (!clean) return null;
  id ||= 'custom-' + Math.random().toString(36).slice(2, 9);
  registerSkin(id, clean);
  writeCustom();
  return id;
}

export function deleteCustomSkin(id) {
  if (!isCustom(id)) return;
  delete SKINS[id];
  const i = SKIN_ORDER.indexOf(id);
  if (i >= 0) SKIN_ORDER.splice(i, 1);
  writeCustom();
  changed(id);
}

// Share codes: the skin as base64url JSON, prefixed so a pasted code is recognisable.
export function skinCode(id) {
  const json = JSON.stringify(SKINS[id]);
  return 'TFSKIN1.' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function parseSkinCode(code) {
  const m = /^TFSKIN1\.([\w-]+)$/.exec(String(code).trim());
  if (!m) return null;
  try { return sanitizeSkin(JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))))); } catch { return null; }
}

for (const [id, def] of Object.entries(readCustom())) {
  const clean = isCustom(id) && sanitizeSkin(def);
  if (clean) registerSkin(id, clean);
}
