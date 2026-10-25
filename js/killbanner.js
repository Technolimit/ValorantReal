// Kill banner: the emblem that punches in under the crosshair when you get a kill. A skull in a ring with a row
// of kill pips over it; each kill in a streak lights one more pip and adds detail (side hashes, wings, a spinning
// outer ring, a burst at five). Colours come from the skin on the weapon that got the kill: its glow, else its
// pattern colour, else its most colourful panel, so every skin (custom ones too) gets a banner of its own.
import { SKINS } from './skins.js';

const NS = 'http://www.w3.org/2000/svg';
const HOLD = 2300; // ms the banner stays up (matches the kb-out delay + duration in index.html)

const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const toInt = (v) => (typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : v);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = (c) => Math.max(...c) - Math.min(...c);
const css = (c) => `rgb(${c.map(Math.round).join(', ')})`;
const WHITE = [255, 255, 255], BLACK = [0, 0, 0], BONE = [236, 240, 242];

// The skin's signature colour, before it's brightened for the HUD.
function signature(s) {
  if (s.glow?.intensity > 0) return rgb(s.glow.color);
  for (const slot of [s.body, s.trim]) if (slot.tex && slot.texColor) return rgb(toInt(slot.texColor));
  return [s.body, s.trim, s.metal, s.grip].map(x => rgb(x.color)).sort((a, b) => sat(b) - sat(a))[0];
}

// Banner colours for a skin id; `override` (a CSS hex) replaces the accent, e.g. an agent's colour for ability kills.
export function bannerColors(skinId, override = null) {
  const s = SKINS[skinId] || SKINS.standard;
  let accent = override ? rgb(toInt(override)) : signature(s);
  // Dark accents (black glow, gunmetal) wash out on the HUD: lift them toward white until they read.
  for (let i = 0; i < 12 && lum(accent) < 0.5; i++) accent = mix(accent, WHITE, 0.15);
  const body = rgb(s.body.color);
  return {
    accent: css(accent),
    face: css(mix(BONE, accent, 0.12)),
    socket: css(mix(mix(body, BLACK, 0.55), accent, 0.12)),
    trim: css(mix(accent, rgb(s.trim.color), 0.35)),
  };
}

const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

// An arc of the circle of radius r, from a0 to a1 degrees (0 = straight up, clockwise).
const arc = (r, a0, a1) => {
  const p = (a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)].map(v => v.toFixed(2)).join(' ');
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
};

const SKULL = 'M -30 -18 L -26 -32 L -12 -40 L 12 -40 L 26 -32 L 30 -18 L 28 2 L 20 10 L 16 24 L 8 34 L 0 38 L -8 34 L -16 24 L -20 10 L -28 2 Z';
const SKULL_SHADE = 'M 0 -40 L 12 -40 L 26 -32 L 30 -18 L 28 2 L 20 10 L 16 24 L 8 34 L 0 38 Z';
const SOCKETS = ['M -25 -7 L -5 -2 L -7 9 L -18 9 Z', 'M 25 -7 L 5 -2 L 7 9 L 18 9 Z'];
const EYES = ['M -20 -3 L -9 0 L -10 5 L -16 5 Z', 'M 20 -3 L 9 0 L 10 5 L 16 5 Z'];
const PIPS = 5;

export class KillBanner {
  constructor(root) {
    this.root = root;
    this.timer = 0;
  }

  // count: kills in the streak (1 = first kill). colors: from bannerColors. caption: HTML shown under the emblem.
  show({ count, colors, caption = '', ace = false }) {
    const tier = Math.min(count, PIPS);
    const wrap = document.createElement('div');
    wrap.className = `kb tier${tier}${ace ? ' ace' : ''}`;
    for (const [k, v] of Object.entries(colors)) wrap.style.setProperty('--kb-' + k, v);
    wrap.style.setProperty('--kb-scale', 1 + (tier - 1) * 0.07);

    const svg = el('svg', { viewBox: '-120 -120 240 240', class: 'kb-emblem' }, null);
    wrap.appendChild(svg);

    // Shockwave and burst behind everything.
    el('circle', { r: 58, class: 'kb-shock' }, svg);
    if (tier >= 5) {
      const rays = el('g', { class: 'kb-rays' }, svg);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, r0 = i % 2 ? 98 : 94, r1 = i % 2 ? 108 : 118;
        el('line', { x1: r0 * Math.sin(a), y1: -r0 * Math.cos(a), x2: r1 * Math.sin(a), y2: -r1 * Math.cos(a) }, rays);
      }
    }

    // Outer frame: faint ring with tick marks at the compass points.
    const frame = el('g', { class: 'kb-frame' }, svg);
    el('circle', { r: 80 }, frame);
    for (const [x1, y1, x2, y2] of [[0, -84, 0, -96], [0, 84, 0, 92], [-84, 0, -96, 0], [84, 0, 96, 0]]) el('line', { x1, y1, x2, y2 }, frame);
    if (tier >= 4) el('circle', { r: 90, class: 'kb-spin' }, svg);

    // Side hashes (2+) and wings (3+).
    if (tier >= 2) {
      const hash = el('g', { class: 'kb-hash' }, svg);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
        const x = sx * (70 + i * 6);
        el('line', { x1: x - sx * 3, y1: -6, x2: x + sx * 3, y2: 6 }, hash);
      }
    }
    if (tier >= 3) {
      const wings = el('g', { class: 'kb-wings' }, svg);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) el('path', { d: `M ${sx * 60} ${sy * 30} L ${sx * 86} ${sy * 48} L ${sx * 110} ${sy * 48}` }, wings);
    }

    // Stem under the ring: two crossed lines with a knot, like the reference's bones.
    const stem = el('g', { class: 'kb-stem' }, svg);
    el('path', { d: 'M -5 60 L 5 76 M 5 60 L -5 76 M -4 76 L -4 112 M 4 76 L 4 112' }, stem);

    // Main ring.
    el('circle', { r: 58, class: 'kb-ring' }, svg);
    el('circle', { r: 52, class: 'kb-inner' }, svg);

    // Kill pips: an arc of five over the ring, one lit per kill.
    const pips = el('g', { class: 'kb-pips' }, svg);
    for (let i = 0; i < PIPS; i++) {
      const c = (i - (PIPS - 1) / 2) * 17;
      el('path', { d: arc(68, c - 6.5, c + 6.5), class: i < tier ? (i === tier - 1 ? 'on new' : 'on') : '' }, pips);
    }

    // Skull.
    const skull = el('g', { class: 'kb-skull' }, svg);
    el('path', { d: SKULL, class: 'kb-face' }, skull);
    el('path', { d: SKULL_SHADE, class: 'kb-shade' }, skull);
    for (const d of SOCKETS) el('path', { d, class: 'kb-socket' }, skull);
    for (const d of EYES) el('path', { d, class: 'kb-eye' }, skull);
    el('path', { d: 'M 0 11 L -4 19 L 4 19 Z', class: 'kb-socket' }, skull);
    el('path', { d: 'M -11 23 L 11 23 M -6 23 L -5 32 M -2 23 L -2 34 M 2 23 L 2 34 M 6 23 L 5 32 M -20 10 L -13 20 M 20 10 L 13 20', class: 'kb-lines' }, skull);

    const cap = document.createElement('div');
    cap.className = 'kb-caption';
    cap.innerHTML = (ace ? '<b class="kb-ace">ACE</b>' : count > PIPS ? `<b class="kb-ace">×${count}</b>` : '') + caption;
    wrap.appendChild(cap);

    this.root.replaceChildren(wrap);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => wrap.remove(), HOLD);
  }

  clear() {
    clearTimeout(this.timer);
    this.root.replaceChildren();
  }
}
