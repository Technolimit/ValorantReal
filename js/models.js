// First-person gun models (original designs, one per weapon) and the skin preview used by the skin menu.
// Axes: -z is forward (muzzle), +y up, +x right; the trigger sits near the origin. Every part is painted by
// one of the skin slots in skins.js: body, trim, metal, grip, glow.
import * as THREE from '../vendor/three.module.min.js';
import { SKINS, TEXTURES, onSkinsChanged, designFor } from './skins.js';
import { MELEE, MODEL_INSPECTS, inspectPose } from './melee.js';

const PI = Math.PI;

// ---------- materials ----------
const texCache = new Map();
function skinTexture(name, color, base) {
  const key = name + (color || '') + (base || '');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  TEXTURES[name](c.getContext('2d'), 256, color || undefined, base || undefined);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const matCache = new Map();
export function skinMaterials(skinId) {
  if (matCache.has(skinId)) return matCache.get(skinId);
  const s = SKINS[skinId] || SKINS.standard;
  const std = (slot) => new THREE.MeshStandardMaterial({
    color: slot.tex ? 0xffffff : slot.color, roughness: slot.rough, metalness: slot.metal, // textures carry their own base colour
    map: slot.tex ? skinTexture(slot.tex, slot.texColor, slot.texBase) : null,
  });
  const mats = {
    body: std(s.body), trim: std(s.trim), metal: std(s.metal), grip: std(s.grip),
    glow: new THREE.MeshStandardMaterial({
      color: s.glow.intensity ? s.glow.color : s.metal.color, roughness: 0.4, metalness: 0.2,
      emissive: s.glow.color, emissiveIntensity: s.glow.intensity,
    }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0a1a22, roughness: 0.05, metalness: 0.6, emissive: s.glow.intensity ? s.glow.color : 0x3a6a80, emissiveIntensity: 0.35 }),
    // Scope parts: open tubes seen from inside when aiming, and see-through glass.
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false }),
    reticle: new THREE.MeshBasicMaterial({ color: s.glow.intensity ? s.glow.color : 0xff3344 }),
    // Model skins' second glow colour (falls back to the glow).
    accent: s.accent ? new THREE.MeshStandardMaterial({ color: s.accent.color, roughness: 0.35, metalness: 0.2, emissive: s.accent.color, emissiveIntensity: s.accent.intensity }) : null,
    sleeve: new THREE.MeshStandardMaterial({ color: 0x30363f, roughness: 0.9 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.85 }),
  };
  mats.accent ||= mats.glow;
  mats.tube = mats.trim.clone(); mats.tube.side = THREE.DoubleSide;
  mats.tubeBody = mats.body.clone(); mats.tubeBody.side = THREE.DoubleSide;
  matCache.set(skinId, mats);
  return mats;
}
// An edited or deleted custom skin gets fresh materials next time it is drawn (models already built keep theirs).
onSkinsChanged((id) => matCache.delete(id));

// Planar UVs in metres (8 tiles per metre), projected along each vertex's dominant normal axis, so skin
// patterns keep the same scale on every part.
function worldUV(geo) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getZ(i); v = p.getX(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * 8; uv[i * 2 + 1] = v * 8;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ---------- part kit ----------
// Moving parts (mag, bolt, slide, cylinder, barrels...) go into named groups so reloads can animate them.
// part(name, pivot) routes the following meshes into that group, rotating about `pivot`; part(null) ends it.
function kit(g, mats) {
  const parts = {};
  let cur = null;
  const put = (geo, slot, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(worldUV(geo), mats[slot]);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    if (cur) { m.position.sub(origin(cur)); cur.add(m); } else g.add(m);
    return m;
  };
  // Where a part group sits in model space (parts can nest; nothing is rotated while building).
  const origin = (o) => { const v = new THREE.Vector3(); for (; o && o !== g; o = o.parent) v.add(o.position); return v; };
  return {
    parts,
    // part(name, pivot, parent): `parent` names a part to nest inside (a balisong blade inside the spinning knife).
    part: (name, pivot = [0, 0, 0], parent = null) => {
      if (!name) { cur = null; return; }
      if (!parts[name]) {
        const p = new THREE.Group(), host = parent ? parts[parent] : null;
        p.position.set(...pivot);
        if (host) p.position.sub(origin(host));
        p.userData.base = { pos: p.position.clone(), rot: p.rotation.clone() };
        (host || g).add(p);
        parts[name] = p;
      }
      cur = parts[name];
    },
    // Box: width (x), height (y), depth (z), centred at x,y,z.
    box: (w, h, d, slot, x, y, z, rx, ry, rz) => put(new THREE.BoxGeometry(w, h, d), slot, x, y, z, rx, ry, rz),
    // Cylinder along z (the barrel axis) unless rotated.
    cyl: (r, len, slot, x, y, z, seg = 14, rx = PI / 2, ry = 0, rz = 0, r2 = r, open = false) =>
      put(new THREE.CylinderGeometry(r, r2, len, seg, 1, open), slot, x, y, z, rx, ry, rz),
    // Side profile: points are [z, y] pairs, extruded `w` wide across x with a soft bevel.
    prof: (pts, w, slot, x = 0, bevel = 0.0025) => {
      const sh = new THREE.Shape();
      pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
      sh.closePath();
      const b = Math.min(bevel, w / 4);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, w - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
      geo.translate(0, 0, -(w - 2 * b) / 2);
      geo.rotateY(-PI / 2);
      return put(geo, slot, x, 0, 0);
    },
    // Sphere of radius r (orbs, cores).
    ball: (r, slot, x, y, z) => put(new THREE.SphereGeometry(r, 18, 14), slot, x, y, z),
    // Ring (finger rings, pommels): radius r, tube thickness t, lying in the x-y plane unless rotated.
    tor: (r, t, slot, x, y, z, rx = 0, ry = 0, rz = 0) => put(new THREE.TorusGeometry(r, t, 8, 20), slot, x, y, z, rx, ry, rz),
    // A row of small blocks (vents, rail teeth, fluting).
    teeth: (n, z0, z1, w, h, d, slot, x, y) => {
      for (let i = 0; i < n; i++) put(new THREE.BoxGeometry(w, h, d), slot, x, y, z0 + (z1 - z0) * (n === 1 ? 0.5 : i / (n - 1)));
    },
  };
}

// Shared fittings
function irons(k, zf, zr, y) {
  k.box(0.006, 0.014, 0.008, 'metal', 0, y + 0.007, zf);
  k.box(0.007, 0.012, 0.008, 'metal', -0.008, y + 0.006, zr);
  k.box(0.007, 0.012, 0.008, 'metal', 0.008, y + 0.006, zr);
  k.box(0.003, 0.004, 0.004, 'glow', 0, y + 0.012, zf);
}
// Charging handle on the left of the receiver; pulled back at the end of a reload.
function charger(k, z, y, x = -0.03) {
  k.part('bolt');
  k.box(0.014, 0.012, 0.022, 'metal', x, y, z);
  k.box(0.006, 0.006, 0.006, 'glow', x - 0.008, y, z);
  k.part(null);
}
// Pistol magazine seated in the grip (mostly hidden); only the base plate shows until it drops.
function pistolMag(k, z, y, ang = -0.26) {
  k.part('mag');
  k.box(0.022, 0.1, 0.03, 'trim', 0, y, z, ang);
  k.box(0.033, 0.009, 0.046, 'trim', 0, y - 0.053, z + 0.014, ang);
  k.part(null);
}
// A loose round for break-action and tube loading, hidden unless a reload shows it.
function shell(k, r = 0.0115, len = 0.06) {
  k.part('shell');
  k.cyl(r, len * 0.75, 'glow', 0, 0, 0, 10);
  k.cyl(r * 1.08, len * 0.25, 'metal', 0, 0, len * 0.5, 10);
  k.part(null);
}
function rail(k, z0, z1, y, w = 0.022) {
  k.box(w, 0.007, z1 - z0, 'metal', 0, y + 0.0035, (z0 + z1) / 2);
  k.teeth(Math.max(2, Math.round((z1 - z0) / 0.012)), z0 + 0.004, z1 - 0.004, w + 0.003, 0.004, 0.005, 'metal', 0, y + 0.008);
}
// Holographic window sight; returns the sight line height.
function holo(k, z, y) {
  k.box(0.03, 0.008, 0.05, 'trim', 0, y + 0.004, z);
  k.box(0.005, 0.03, 0.012, 'trim', -0.0145, y + 0.022, z - 0.012);
  k.box(0.005, 0.03, 0.012, 'trim', 0.0145, y + 0.022, z - 0.012);
  k.box(0.034, 0.006, 0.014, 'trim', 0, y + 0.039, z - 0.012);
  k.box(0.024, 0.024, 0.002, 'glass', 0, y + 0.022, z - 0.012);
  k.box(0.0016, 0.0016, 0.001, 'reticle', 0, y + 0.022, z - 0.0135);
  k.box(0.006, 0.0005, 0.001, 'reticle', 0, y + 0.022 - 0.004, z - 0.0135);
  return y + 0.022;
}
// Tube scope; returns the sight line height. The tube is open and the lenses are clear glass, so aiming down
// it shows the target through the scope with a reticle on the front lens.
function scope(k, z, y, r, len) {
  k.box(0.014, 0.016, 0.03, 'metal', 0, y + 0.008, z - len * 0.28);
  k.box(0.014, 0.016, 0.03, 'metal', 0, y + 0.008, z + len * 0.28);
  const cy = y + 0.016 + r;
  const PI2 = PI / 2;
  k.cyl(r, len * 0.62, 'tube', 0, cy, z, 18, PI2, 0, 0, r, true);
  k.cyl(r * 1.3, len * 0.2, 'tubeBody', 0, cy, z - len * 0.4, 18, PI2, 0, 0, r, true);
  k.cyl(r * 1.15, len * 0.16, 'tubeBody', 0, cy, z + len * 0.38, 18, PI2, 0, 0, r * 1.15, true);
  k.cyl(r * 1.25, 0.002, 'glass', 0, cy, z - len * 0.5, 18);
  k.cyl(r * 1.1, 0.002, 'glass', 0, cy, z + len * 0.46, 18);
  // Reticle on the objective: thin crosshair lines with a gap and a centre dot.
  const rz = z - len * 0.49, w = r * 1.2, t = 0.0007, gap = r * 0.18;
  for (const sgn of [-1, 1]) {
    k.box((w - gap) , t, t, 'reticle', sgn * (gap + (w - gap) / 2), cy, rz);
    k.box(t, (w - gap), t, 'reticle', 0, cy + sgn * (gap + (w - gap) / 2), rz);
  }
  k.box(t * 2.2, t * 2.2, t, 'reticle', 0, cy, rz);
  k.cyl(r * 0.45, 0.022, 'trim', 0, cy + r, z, 10, 0);
  k.box(0.004, 0.003, len * 0.4, 'glow', r + 0.001, cy, z);
  return cy;
}

// A star of `n` tapered points in the side (y-z) plane, facing out along x: Starspur's spur rowels and inlays.
// `hub` paints a small axle through the middle (spur rowels spin on it).
function star(k, x, y, z, r, slot, hub = null, n = 5, t = 0.0035) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    k.cyl(0.0004, r, slot, x, y + Math.cos(a) * r / 2, z + Math.sin(a) * r / 2, 4, a, 0, 0, t);
  }
  if (hub) k.cyl(r * 0.3, 0.007, hub, x, y, z, 10, 0, 0, PI / 2);
}

// Silk cord wrap (Oathblade): a row of diamonds in `slot` down a handle, from (y0, z0) to (y1, z1).
function wrap(k, n, y0, z0, y1, z1, w, d, slot, tilt = 0) {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    k.box(w, d, d, slot, 0, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, PI / 4 + tilt);
  }
}

// Orbital's reactor spire: a hollow cone rising from the top of the gun at z (base y0) to a reactor ring,
// open at the top so you see down into it, lit from the floor, with gold fins down its slope. The orb (part
// `orb`) sits in the mouth: the inspect floats it out and the reload pops it and seats a fresh one.
// `s` scales the whole spire. Returns the height of the top of the ring.
function orbSpire(k, z, y0, s = 1) {
  const h = 0.064 * s, rb = 0.054 * s, rt = 0.03 * s, top = y0 + h, slope = Math.atan((rb - rt) / h);
  k.cyl(rt, h, 'tubeBody', 0, y0 + h / 2, z, 24, 0, 0, 0, rb, true);
  k.cyl(rb * 0.9, 0.003, 'glow', 0, y0 + 0.003, z, 24, 0);
  k.tor(rb, 0.0045 * s, 'metal', 0, y0 + 0.002, z, PI / 2);
  k.tor((rb + rt) / 2 + 0.0012, 0.0018 * s, 'accent', 0, y0 + h / 2, z, PI / 2, 0, 0);
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2, r = (rb + rt) / 2 + 0.0025 * s;
    k.box(0.006 * s, h * 1.04, 0.011 * s, 'metal', Math.cos(a) * r, y0 + h / 2, Math.sin(a) * r + z, 0, -a, slope);
    k.box(0.0065 * s, h * 0.5, 0.004 * s, 'glow', Math.cos(a) * (r + 0.001), y0 + h * 0.45, Math.sin(a) * (r + 0.001) + z, 0, -a, slope);
  }
  k.tor(rt + 0.002 * s, 0.0075 * s, 'trim', 0, top, z, PI / 2);
  k.tor(rt - 0.004 * s, 0.0026 * s, 'glow', 0, top + 0.003 * s, z, PI / 2);
  for (const x of [-1, 1]) k.box(0.01 * s, 0.018 * s, 0.02 * s, 'metal', x * (rt + 0.009 * s), top - 0.004 * s, z);
  const oy = top - 0.02 * s;
  k.part('orb', [0, oy, z]);
  k.ball(0.019 * s, 'glow', 0, oy, z);
  k.tor(0.024 * s, 0.0018 * s, 'accent', 0, oy, z, 0.6, 0.3);
  k.tor(0.024 * s, 0.0018 * s, 'glow', 0, oy, z, -0.5, 1.2);
  k.part(null);
  return top + 0.0075 * s;
}
// Orbital sights, raised so the line of sight clears the spire: a gold ring to look through on a post at the
// back (zr, standing on yr) and a post with a lit tip at the front (zf, on yf), both at height sy.
function orbSights(k, zf, yf, zr, yr, sy) {
  k.box(0.01, sy - 0.0105 - yr, 0.012, 'metal', 0, (sy - 0.0105 + yr) / 2, zr);
  k.box(0.026, 0.006, 0.016, 'trim', 0, yr + 0.003, zr);
  k.tor(0.0085, 0.0024, 'metal', 0, sy, zr);
  k.tor(0.0062, 0.0008, 'glow', 0, sy, zr - 0.002);
  k.prof([[zf + 0.012, yf], [zf + 0.004, sy - 0.002], [zf - 0.004, sy - 0.002], [zf - 0.012, yf]], 0.006, 'metal', 0, 0.001);
  k.box(0.0035, 0.005, 0.005, 'glow', 0, sy, zf);
  return sy;
}

// ---------- weapon designs ----------
// Each returns { muzzle: [x, y, z], sightY } and adds its parts to the kit.
const DESIGNS = {
  knife(k) {
    k.prof([[-0.02, 0.012], [-0.17, 0.016], [-0.235, 0.0], [-0.19, -0.01], [-0.02, -0.012]], 0.006, 'metal', 0, 0.001);
    k.prof([[-0.05, -0.0105], [-0.19, -0.0085], [-0.225, -0.002], [-0.2, -0.004], [-0.05, -0.005]], 0.0065, 'glow', 0, 0.0005);
    k.box(0.03, 0.045, 0.014, 'trim', 0, 0.0, -0.015);
    k.cyl(0.013, 0.1, 'grip', 0, 0, 0.04, 10);
    k.teeth(5, 0.0, 0.08, 0.029, 0.029, 0.004, 'grip', 0, 0);
    k.cyl(0.016, 0.02, 'body', 0, 0, 0.1, 10);
    return { muzzle: [0, 0, -0.24], sightY: 0 };
  },

  // ---- melee types (js/melee.js): the hand grips at the origin, the blade points to -z ----
  axe(k) {
    k.cyl(0.011, 0.36, 'trim', 0, 0, -0.1, 10);
    k.cyl(0.0135, 0.1, 'grip', 0, 0, 0.03, 10);
    k.teeth(4, -0.005, 0.065, 0.029, 0.029, 0.004, 'trim', 0, 0);
    k.cyl(0.016, 0.016, 'body', 0, 0, 0.088, 10);
    k.box(0.024, 0.044, 0.05, 'body', 0, 0.002, -0.262);
    k.box(0.018, 0.028, 0.032, 'trim', 0, -0.034, -0.262);
    k.prof([[-0.24, 0.015], [-0.243, 0.06], [-0.208, 0.102], [-0.25, 0.114], [-0.3, 0.114], [-0.346, 0.098], [-0.292, 0.06], [-0.285, 0.015]], 0.008, 'metal', 0, 0.001);
    k.prof([[-0.206, 0.099], [-0.25, 0.117], [-0.3, 0.117], [-0.348, 0.1], [-0.342, 0.094], [-0.3, 0.109], [-0.25, 0.109], [-0.212, 0.095]], 0.0088, 'glow', 0, 0.0005);
    k.box(0.026, 0.006, 0.054, 'glow', 0, 0.026, -0.262);
    return { muzzle: [0, 0.07, -0.3], sightY: 0 };
  },

  katana(k) {
    k.prof([[-0.045, 0.012], [-0.3, 0.017], [-0.55, 0.022], [-0.68, 0.025], [-0.725, 0.014], [-0.705, -0.003], [-0.55, -0.006], [-0.3, -0.01], [-0.045, -0.012]], 0.0065, 'metal', 0, 0.0012);
    k.prof([[-0.06, -0.006], [-0.3, -0.004], [-0.55, 0.0], [-0.69, 0.006], [-0.718, 0.012], [-0.703, -0.002], [-0.55, -0.0055], [-0.3, -0.0095], [-0.06, -0.0115]], 0.007, 'glow', 0, 0.0004);
    k.box(0.012, 0.03, 0.022, 'metal', 0, 0, -0.04);
    k.cyl(0.036, 0.008, 'body', 0, 0, -0.026, 8);
    k.cyl(0.0145, 0.2, 'grip', 0, 0, 0.075, 8);
    for (let i = 0; i < 6; i++) k.box(0.031, 0.031, 0.008, 'trim', 0, 0, -0.008 + i * 0.033, 0, 0, PI / 4);
    k.cyl(0.017, 0.02, 'body', 0, 0, 0.18, 8);
    return { muzzle: [0, 0, -0.72], sightY: 0 };
  },

  karambit(k) {
    k.prof([[-0.015, 0.01], [-0.07, 0.013], [-0.12, -0.004], [-0.155, -0.04], [-0.168, -0.074], [-0.142, -0.05], [-0.11, -0.026], [-0.06, -0.012], [-0.015, -0.01]], 0.006, 'metal', 0, 0.001);
    k.prof([[-0.06, -0.012], [-0.11, -0.026], [-0.142, -0.05], [-0.166, -0.072], [-0.138, -0.044], [-0.106, -0.02], [-0.06, -0.0075]], 0.0068, 'glow', 0, 0.0004);
    k.box(0.017, 0.028, 0.085, 'grip', 0, 0, 0.032);
    k.box(0.019, 0.01, 0.07, 'trim', 0, 0.012, 0.03);
    k.tor(0.018, 0.0055, 'body', 0, 0, 0.095, 0, PI / 2, 0);
    k.tor(0.0185, 0.0018, 'glow', 0, 0, 0.095, 0, PI / 2, 0);
    return { muzzle: [0, -0.06, -0.16], sightY: 0 };
  },

  // Balisong: the blade and the free ("bite") handle each turn on the pivot pin, so inspects can flip them.
  balisong(k) {
    const pin = -0.012;
    k.box(0.0075, 0.022, 0.125, 'grip', -0.0055, 0, 0.05);
    k.box(0.0078, 0.008, 0.11, 'trim', -0.0058, 0, 0.05);
    k.box(0.016, 0.008, 0.008, 'glow', 0, 0.006, 0.113);
    k.part('h2', [0, 0, pin], 'w');
    k.box(0.0075, 0.022, 0.125, 'grip', 0.0055, 0, 0.05);
    k.box(0.0078, 0.008, 0.11, 'trim', 0.0058, 0, 0.05);
    k.part('blade', [0, 0, pin], 'w');
    k.prof([[-0.005, 0.009], [-0.1, 0.011], [-0.142, 0.0], [-0.12, -0.008], [-0.005, -0.009]], 0.0035, 'metal', 0, 0.0008);
    k.prof([[-0.03, -0.0095], [-0.12, -0.0085], [-0.14, -0.001], [-0.118, -0.005], [-0.03, -0.006]], 0.0042, 'glow', 0, 0.0003);
    k.cyl(0.004, 0.02, 'metal', 0, 0, pin, 8, 0, 0, PI / 2);
    k.part('w');
    return { muzzle: [0, 0, -0.15], sightY: 0 };
  },

  kunai(k) {
    k.prof([[-0.01, 0.012], [-0.055, 0.021], [-0.14, 0.0], [-0.055, -0.021], [-0.01, -0.012]], 0.006, 'metal', 0, 0.0012);
    k.box(0.0068, 0.003, 0.11, 'glow', 0, 0, -0.065);
    k.cyl(0.0085, 0.085, 'grip', 0, 0, 0.035, 8);
    k.teeth(6, -0.002, 0.07, 0.021, 0.021, 0.004, 'trim', 0, 0);
    k.tor(0.015, 0.004, 'body', 0, 0, 0.093, PI / 2, 0, 0);
    k.tor(0.0155, 0.0015, 'glow', 0, 0, 0.093, PI / 2, 0, 0);
    return { muzzle: [0, 0, -0.14], sightY: 0 };
  },

  // Arc Blade: the beam is its own part so it can be dimmed and relit (scaled along its length).
  arc(k) {
    k.cyl(0.016, 0.13, 'body', 0, 0, 0.045, 12);
    k.teeth(5, 0.0, 0.09, 0.035, 0.008, 0.006, 'grip', 0, 0);
    k.cyl(0.019, 0.016, 'trim', 0, 0, 0.115, 12);
    k.box(0.05, 0.014, 0.022, 'trim', 0, 0, -0.03);
    k.box(0.008, 0.026, 0.02, 'glow', 0.026, 0.006, -0.036);
    k.box(0.008, 0.026, 0.02, 'glow', -0.026, 0.006, -0.036);
    k.cyl(0.011, 0.012, 'metal', 0, 0, -0.045, 12);
    k.part('beam', [0, 0, -0.045], 'w');
    k.box(0.006, 0.026, 0.42, 'glow', 0, 0, -0.255);
    k.box(0.0035, 0.012, 0.43, 'lens', 0, 0.0, -0.26);
    k.part('w');
    return { muzzle: [0, 0, -0.45], sightY: 0 };
  },

  // Starspur Bowie: a clip-point blade with a teal edge and copper spine, a copper guard with a spur rowel
  // (part `rowel`) hung under it, bone handle with leather wraps and a copper pommel.
  bowie(k) {
    k.prof([[-0.03, 0.015], [-0.17, 0.017], [-0.2, 0.012], [-0.252, 0.004], [-0.236, -0.006], [-0.2, -0.014], [-0.12, -0.017], [-0.03, -0.015]], 0.006, 'metal', 0, 0.001);
    k.prof([[-0.05, -0.0145], [-0.12, -0.0168], [-0.2, -0.0142], [-0.236, -0.0062], [-0.25, 0.003], [-0.23, -0.002], [-0.2, -0.0105], [-0.12, -0.0128], [-0.05, -0.0112]], 0.0068, 'glow', 0, 0.0004);
    k.box(0.0068, 0.003, 0.13, 'trim', 0, 0.0165, -0.1);
    k.box(0.016, 0.052, 0.012, 'trim', 0, 0, -0.022);
    k.ball(0.006, 'accent', 0, 0.028, -0.022);
    k.part('rowel', [0, -0.042, -0.022], 'w');
    star(k, 0, -0.042, -0.022, 0.014, 'trim', 'accent', 6);
    k.part('w');
    k.cyl(0.0135, 0.1, 'body', 0, 0, 0.035, 8);
    k.teeth(3, 0.005, 0.065, 0.029, 0.029, 0.007, 'grip', 0, 0);
    k.cyl(0.016, 0.018, 'trim', 0, 0, 0.094, 8);
    k.tor(0.0163, 0.0016, 'glow', 0, 0, 0.094);
    return { muzzle: [0, 0, -0.25], sightY: 0 };
  },

  // Oathblade Tanto: a straight blade with an angled chisel tip and a lit edge (part `edge`, pivoting at the
  // gold collar so it can light from the collar to the tip), an oval guard, a crimson cord-wrapped handle, a
  // gold pommel cap and a silk cord hanging from it (part `cord`).
  tanto(k) {
    k.prof([[-0.035, 0.013], [-0.215, 0.013], [-0.245, 0.006], [-0.228, -0.012], [-0.035, -0.012]], 0.0062, 'metal', 0, 0.001);
    k.box(0.0064, 0.0025, 0.18, 'body', 0, 0.0118, -0.125);
    k.part('edge', [0, -0.011, -0.035], 'w');
    k.box(0.0068, 0.0026, 0.19, 'glow', 0, -0.0112, -0.13);
    k.prof([[-0.222, -0.012], [-0.243, 0.004], [-0.239, 0.006], [-0.218, -0.009]], 0.0068, 'glow', 0, 0.0003);
    k.part('w');
    k.box(0.011, 0.03, 0.014, 'trim', 0, 0, -0.03);
    k.cyl(0.026, 0.007, 'body', 0, 0, -0.02, 10);
    k.tor(0.026, 0.0015, 'trim', 0, 0, -0.02);
    k.box(0.024, 0.026, 0.11, 'body', 0, 0, 0.04);
    wrap(k, 7, 0, -0.008, 0, 0.088, 0.026, 0.012, 'grip');
    k.box(0.027, 0.029, 0.016, 'trim', 0, 0, 0.1);
    k.ball(0.004, 'accent', 0, 0, 0.11);
    k.part('cord', [0, -0.006, 0.105], 'w');
    k.box(0.004, 0.004, 0.05, 'grip', 0, -0.0255, 0.1205, 0.9);
    k.box(0.004, 0.004, 0.045, 'grip', 0.004, -0.026, 0.115, 1.1);
    k.ball(0.006, 'accent', 0.002, -0.046, 0.136);
    k.part('w');
    return { muzzle: [0, 0, -0.24], sightY: 0 };
  },

  // Finale: a shoulder-fired launcher, painted like the rest of Blitz's gear. The loaded rocket's warhead
  // shows at the mouth (part 'rocket', hidden once it's fired).
  finale(k) {
    k.cyl(0.056, 0.78, 'body', 0, 0.03, -0.22, 18);                       // main tube
    k.cyl(0.06, 0.06, 'trim', 0, 0.03, -0.6, 18);                         // muzzle ring
    k.cyl(0.062, 0.05, 'trim', 0, 0.03, 0.12, 18);                        // rear ring
    k.cyl(0.075, 0.09, 'metal', 0, 0.03, 0.2, 18, PI / 2, 0, 0, 0.058, true); // exhaust bell, flaring backward
    k.box(0.118, 0.014, 0.5, 'glow', 0, 0.03, -0.25);                     // paint stripe around the tube
    k.box(0.02, 0.05, 0.05, 'glow', 0.055, 0.06, -0.42, 0.3, 0, 0.4);     // paint splats
    k.box(0.02, 0.035, 0.04, 'glow', -0.055, 0.0, -0.05, -0.2, 0, -0.5);
    k.box(0.03, 0.05, 0.12, 'trim', -0.07, 0.09, -0.14);                  // sight on the left
    k.box(0.01, 0.024, 0.01, 'glow', -0.07, 0.122, -0.19);
    k.box(0.03, 0.09, 0.045, 'grip', 0, -0.055, 0.03, -0.25);             // rear grip and trigger guard
    k.box(0.014, 0.03, 0.05, 'metal', 0, -0.035, -0.02);
    k.box(0.03, 0.085, 0.04, 'grip', 0, -0.05, -0.25, 0.15);              // front grip
    k.box(0.06, 0.035, 0.16, 'trim', 0.0, -0.02, 0.06);                   // shoulder rest under the tube
    k.part('rocket', [0, 0.03, -0.62]);
    k.cyl(0.045, 0.05, 'metal', 0, 0.03, -0.64, 16);
    k.cyl(0.045, 0.09, 'glow', 0, 0.03, -0.71, 16, PI / 2, 0, 0, 0.004); // warhead cone
    k.part(null);
    return { muzzle: [0, 0.03, -0.66], sightY: 0.13 };
  },

  // Edgestorm: a fan of throwing blades held in the hand; each is its own part so thrown ones disappear.
  blades(k) {
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.16;
      k.part('b' + i, [0, 0, 0.02]);
      const sx = Math.sin(a), cz = Math.cos(a);
      const len = 0.17, mid = -len / 2 + 0.03;
      k.box(0.005, 0.018, len, 'metal', sx * -mid, 0.004 * Math.abs(i - 2), 0.02 + cz * mid, 0, -a, 0);
      k.box(0.006, 0.004, len * 0.8, 'glow', sx * -mid, -0.009 + 0.004 * Math.abs(i - 2), 0.02 + cz * mid, 0, -a, 0);
      k.part(null);
    }
    k.cyl(0.012, 0.02, 'glow', 0, 0, 0.035, 10);
    return { muzzle: [0, 0, -0.16], sightY: 0 };
  },

  classic(k) {
    k.part('slide');
    k.prof([[0.05, 0.0], [0.05, 0.036], [0.035, 0.043], [-0.15, 0.043], [-0.165, 0.032], [-0.165, 0.0]], 0.03, 'body');
    k.teeth(6, 0.015, 0.045, 0.032, 0.026, 0.003, 'trim', 0, 0.022); // slide serrations
    k.part(null);
    pistolMag(k, 0.034, -0.075);
    k.prof([[0.045, -0.024], [0.045, 0.003], [-0.155, 0.003], [-0.155, -0.012], [-0.03, -0.024]], 0.032, 'trim');
    k.box(0.031, 0.11, 0.044, 'grip', 0, -0.07, 0.03, -0.26);
    k.box(0.022, 0.005, 0.05, 'trim', 0, -0.036, -0.022);
    k.box(0.004, 0.016, 0.005, 'metal', 0, -0.026, -0.006);
    k.box(0.0325, 0.003, 0.11, 'glow', 0, 0.02, -0.07);
    k.cyl(0.0075, 0.012, 'metal', 0, 0.022, -0.167);
    irons(k, -0.155, 0.04, 0.043);
    return { muzzle: [0, 0.022, -0.175], sightY: 0.05 };
  },

  shorty(k) {
    k.box(0.054, 0.05, 0.085, 'body', 0, 0.016, 0.0);
    k.part('barrels', [0, 0.004, -0.04]);
    k.cyl(0.013, 0.2, 'metal', -0.0135, 0.026, -0.14);
    k.cyl(0.013, 0.2, 'metal', 0.0135, 0.026, -0.14);
    k.box(0.008, 0.006, 0.19, 'metal', 0, 0.04, -0.14);
    k.prof([[-0.05, -0.012], [-0.05, 0.012], [-0.17, 0.014], [-0.17, -0.004]], 0.05, 'trim');
    k.cyl(0.016, 0.012, 'glow', -0.0135, 0.026, -0.235);
    k.cyl(0.016, 0.012, 'glow', 0.0135, 0.026, -0.235);
    k.cyl(0.006, 0.01, 'glow', 0, 0.046, -0.23, 8, 0);
    k.part(null);
    shell(k, 0.0125, 0.055);
    k.prof([[0.04, -0.008], [0.08, -0.03], [0.1, -0.11], [0.06, -0.12], [0.03, -0.05], [0.0, -0.01]], 0.034, 'grip');
    k.box(0.022, 0.005, 0.05, 'metal', 0, -0.022, 0.012);
    return { muzzle: [0, 0.026, -0.245], sightY: 0.048 };
  },

  frenzy(k) {
    k.prof([[0.045, -0.012], [0.045, 0.034], [0.02, 0.044], [-0.125, 0.044], [-0.14, 0.026], [-0.14, -0.012]], 0.036, 'body');
    k.box(0.0365, 0.004, 0.08, 'glow', 0, 0.03, -0.06);
    k.teeth(3, -0.1, -0.06, 0.02, 0.004, 0.01, 'glow', 0, 0.046);
    k.box(0.032, 0.075, 0.046, 'grip', 0, -0.05, 0.022, -0.14);
    k.part('mag');
    k.box(0.024, 0.1, 0.03, 'trim', 0, -0.07, 0.024, -0.14);
    k.box(0.026, 0.06, 0.034, 'trim', 0, -0.115, 0.034, -0.14);
    k.part(null);
    charger(k, 0.03, 0.03, -0.022);
    k.box(0.022, 0.005, 0.05, 'trim', 0, -0.03, -0.02);
    k.box(0.028, 0.045, 0.024, 'grip', 0, -0.035, -0.11);
    k.cyl(0.0095, 0.045, 'metal', 0, 0.018, -0.16);
    irons(k, -0.13, 0.03, 0.044);
    return { muzzle: [0, 0.018, -0.185], sightY: 0.051 };
  },

  ghost(k) {
    k.part('slide');
    k.prof([[0.05, 0.0], [0.05, 0.034], [0.03, 0.04], [-0.14, 0.04], [-0.15, 0.03], [-0.15, 0.0]], 0.028, 'body');
    k.part(null);
    pistolMag(k, 0.034, -0.072, -0.24);
    k.prof([[0.045, -0.022], [0.045, 0.003], [-0.14, 0.003], [-0.14, -0.01], [-0.02, -0.022]], 0.03, 'trim');
    k.box(0.03, 0.105, 0.042, 'grip', 0, -0.066, 0.03, -0.24);
    k.box(0.022, 0.005, 0.048, 'trim', 0, -0.034, -0.02);
    k.cyl(0.0165, 0.13, 'metal', 0, 0.02, -0.215, 16);
    k.cyl(0.0172, 0.006, 'glow', 0, 0.02, -0.18, 16);
    k.cyl(0.0172, 0.006, 'trim', 0, 0.02, -0.275, 16);
    k.box(0.029, 0.003, 0.08, 'glow', 0, 0.034, -0.05);
    irons(k, -0.14, 0.04, 0.04);
    return { muzzle: [0, 0.02, -0.285], sightY: 0.047 };
  },

  sheriff(k) {
    k.prof([[-0.035, 0.02], [-0.035, 0.05], [-0.235, 0.046], [-0.235, 0.018]], 0.024, 'body');
    k.box(0.0245, 0.004, 0.18, 'glow', 0, 0.042, -0.14);
    k.cyl(0.006, 0.17, 'metal', 0, 0.008, -0.13);
    k.part('cyl', [0, 0.027, -0.005]);
    k.cyl(0.03, 0.062, 'metal', 0, 0.027, -0.005, 6);
    k.teeth(3, -0.02, 0.01, 0.062, 0.004, 0.006, 'trim', 0, 0.027);
    k.part(null);
    shell(k, 0.006, 0.04);
    k.prof([[0.045, 0.0], [0.045, 0.05], [0.02, 0.058], [-0.04, 0.054], [-0.04, -0.01], [0.03, -0.02]], 0.03, 'trim');
    k.box(0.008, 0.02, 0.014, 'metal', 0, 0.06, 0.05, 0.4);
    k.prof([[0.03, -0.01], [0.075, -0.035], [0.105, -0.11], [0.065, -0.12], [0.03, -0.06], [0.005, -0.02]], 0.034, 'grip');
    k.box(0.022, 0.005, 0.045, 'metal', 0, -0.026, 0.008);
    irons(k, -0.225, 0.04, 0.048);
    return { muzzle: [0, 0.035, -0.24], sightY: 0.056 };
  },

  // Chamber's Headhunter: a heavy gold-plated pistol, square-nosed, two glowing windows up front, a stepped
  // black frame and an ivory grip. Reloads like the Sheriff (swing-out cylinder).
  headhunter(k) {
    k.prof([[0.03, 0.012], [0.03, 0.074], [-0.02, 0.08], [-0.25, 0.076], [-0.262, 0.06], [-0.262, 0.018], [-0.2, 0.012]], 0.036, 'body');
    k.box(0.038, 0.012, 0.13, 'trim', 0, 0.03, -0.17);                 // the black band under the nose
    k.box(0.038, 0.008, 0.05, 'trim', 0, 0.06, -0.06);                 // stepped cut on top
    k.box(0.038, 0.016, 0.012, 'trim', 0, 0.05, -0.088);
    for (const x of [-0.0185, 0.0185]) for (const z of [-0.195, -0.222]) k.box(0.002, 0.034, 0.012, 'glow', x, 0.05, z);
    k.box(0.024, 0.01, 0.05, 'body', 0, 0.084, -0.02);                 // the raised rear sight block
    k.box(0.006, 0.006, 0.01, 'glow', 0, 0.09, -0.04);
    k.cyl(0.007, 0.03, 'metal', 0, 0.04, -0.27);
    k.part('cyl', [0, 0.03, -0.01]);
    k.cyl(0.026, 0.05, 'trim', 0, 0.03, -0.01, 8);
    k.teeth(3, -0.03, 0.01, 0.054, 0.004, 0.006, 'metal', 0, 0.03);
    k.part(null);
    shell(k, 0.006, 0.04);
    k.prof([[0.045, 0.0], [0.045, 0.02], [0.03, 0.022], [-0.06, 0.014], [-0.06, -0.006], [0.03, -0.02]], 0.03, 'trim');
    k.prof([[0.03, -0.01], [0.078, -0.03], [0.11, -0.115], [0.066, -0.125], [0.03, -0.06], [0.005, -0.02]], 0.034, 'grip');
    k.box(0.036, 0.004, 0.022, 'body', 0, -0.012, 0.04);                 // gold collar where the grip meets the frame
    k.box(0.022, 0.005, 0.045, 'trim', 0, -0.03, 0.006);                 // trigger guard
    k.box(0.006, 0.02, 0.006, 'body', 0, -0.016, -0.004, 0.3);           // gold trigger
    return { muzzle: [0, 0.04, -0.285], sightY: 0.09 };
  },

  // Chamber's Tour de Force: a long gold rifle with a black spine, a violet-lit barrel shroud, a slim scope and
  // an open, angular gold stock. Reloads like the Operator (bolt and box magazine).
  tourdeforce(k) {
    k.prof([[0.08, -0.03], [0.08, 0.05], [-0.3, 0.05], [-0.32, 0.02], [-0.32, -0.03]], 0.058, 'body');
    k.box(0.06, 0.008, 0.36, 'trim', 0, 0.012, -0.12);
    k.box(0.06, 0.006, 0.12, 'trim', 0, 0.042, -0.2);
    k.prof([[-0.32, -0.024], [-0.32, 0.05], [-0.98, 0.046], [-0.98, -0.016]], 0.05, 'body');   // the shroud
    k.box(0.052, 0.012, 0.64, 'trim', 0, 0.016, -0.65);
    for (const z of [-0.74, -0.83, -0.92]) for (const x of [-0.0255, 0.0255]) k.box(0.002, 0.022, 0.06, 'glow', x, 0.03, z);
    k.box(0.04, 0.003, 0.2, 'glow', 0, 0.0475, -0.86);
    k.cyl(0.012, 0.04, 'metal', 0, 0.016, -1.0, 10);
    k.part('bolt', [0.015, 0.035, 0.04]);
    k.cyl(0.006, 0.05, 'metal', 0.035, 0.035, 0.04, 8, 0, 0, PI / 2);
    k.cyl(0.011, 0.012, 'glow', 0.06, 0.035, 0.04, 10, 0, 0, PI / 2);
    k.part(null);
    k.part('mag');
    k.box(0.03, 0.075, 0.05, 'trim', 0, -0.06, -0.12);
    k.box(0.031, 0.006, 0.051, 'body', 0, -0.095, -0.12);
    k.part(null);
    shell(k, 0.008, 0.065);
    k.box(0.036, 0.1, 0.046, 'trim', 0, -0.06, 0.06, -0.28);
    k.box(0.026, 0.005, 0.05, 'metal', 0, -0.03, 0.02);
    // Open stock: a gold frame around black cut-outs.
    k.prof([[0.08, 0.044], [0.36, 0.036], [0.38, -0.11], [0.3, -0.11], [0.22, -0.045], [0.12, -0.045], [0.1, -0.08], [0.08, -0.08]], 0.05, 'body');
    k.box(0.052, 0.03, 0.12, 'trim', 0, 0.0, 0.2);
    k.box(0.052, 0.022, 0.05, 'trim', 0, -0.06, 0.32);
    k.box(0.054, 0.15, 0.02, 'trim', 0, -0.035, 0.38);
    rail(k, -0.26, 0.06, 0.05);
    const sy = scope(k, -0.1, 0.058, 0.022, 0.26);
    return { muzzle: [0, 0.016, -1.02], sightY: sy };
  },

  stinger(k) {
    k.prof([[0.08, -0.004], [0.08, 0.05], [-0.19, 0.05], [-0.215, 0.03], [-0.215, -0.004], [-0.05, -0.014]], 0.046, 'body');
    k.box(0.047, 0.004, 0.16, 'glow', 0, 0.018, -0.08);
    k.part('mag');
    k.box(0.028, 0.115, 0.04, 'trim', 0, -0.065, -0.07, 0.26);
    k.part(null);
    charger(k, -0.02, 0.035, -0.03);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.055, 0.035, -0.24);
    k.box(0.024, 0.005, 0.05, 'trim', 0, -0.024, 0.0);
    k.cyl(0.0145, 0.06, 'metal', 0, 0.022, -0.245, 10);
    k.box(0.008, 0.008, 0.17, 'metal', -0.016, 0.03, 0.16);
    k.box(0.008, 0.008, 0.17, 'metal', 0.016, 0.03, 0.16);
    k.box(0.04, 0.06, 0.016, 'grip', 0, 0.01, 0.245);
    rail(k, -0.16, 0.06, 0.05);
    const sy = holo(k, -0.04, 0.058);
    return { muzzle: [0, 0.022, -0.28], sightY: sy };
  },

  spectre(k) {
    k.prof([[0.07, -0.006], [0.07, 0.044], [-0.03, 0.054], [-0.22, 0.05], [-0.22, -0.006]], 0.046, 'body');
    k.box(0.047, 0.003, 0.19, 'glow', 0, 0.026, -0.08);
    k.cyl(0.021, 0.2, 'metal', 0, 0.022, -0.32, 18);
    k.teeth(6, -0.25, -0.39, 0.0435, 0.0435, 0.004, 'trim', 0, 0.022);
    k.cyl(0.0215, 0.006, 'glow', 0, 0.022, -0.42, 18);
    k.part('mag');
    k.box(0.026, 0.12, 0.034, 'trim', 0, -0.065, -0.07, 0.05);
    k.part(null);
    charger(k, -0.03, 0.032, -0.03);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.055, 0.04, -0.24);
    k.box(0.024, 0.005, 0.05, 'trim', 0, -0.024, 0.002);
    k.box(0.024, 0.06, 0.018, 'trim', 0, 0.0, 0.08);
    k.box(0.024, 0.018, 0.15, 'trim', 0, 0.02, 0.15);
    k.box(0.04, 0.075, 0.018, 'grip', 0, -0.01, 0.23);
    rail(k, -0.18, 0.05, 0.05);
    const sy = holo(k, -0.05, 0.058);
    return { muzzle: [0, 0.022, -0.425], sightY: sy };
  },

  bucky(k) {
    k.box(0.052, 0.07, 0.2, 'body', 0, 0.0, -0.02);
    k.box(0.053, 0.004, 0.18, 'glow', 0, 0.016, -0.02);
    k.cyl(0.0175, 0.42, 'metal', 0, 0.022, -0.33, 14);
    k.cyl(0.014, 0.34, 'trim', 0, -0.014, -0.29, 12);
    k.part('pump');
    k.box(0.058, 0.042, 0.13, 'grip', 0, -0.014, -0.3);
    k.teeth(6, -0.25, -0.35, 0.06, 0.044, 0.004, 'grip', 0, -0.014);
    k.part(null);
    shell(k, 0.012, 0.06);
    k.prof([[0.08, 0.034], [0.33, 0.004], [0.33, -0.085], [0.29, -0.085], [0.12, -0.04], [0.08, -0.08], [0.03, -0.08], [0.06, -0.035]], 0.046, 'trim');
    k.box(0.048, 0.1, 0.02, 'grip', 0, -0.04, 0.33);
    k.box(0.022, 0.005, 0.05, 'metal', 0, -0.04, 0.035);
    k.cyl(0.004, 0.008, 'glow', 0, 0.044, -0.53, 8, 0);
    return { muzzle: [0, 0.022, -0.545], sightY: 0.046 };
  },

  judge(k) {
    k.prof([[0.22, -0.03], [0.22, 0.06], [0.02, 0.07], [-0.08, 0.07], [-0.2, 0.05], [-0.2, -0.03]], 0.064, 'body');
    k.box(0.065, 0.004, 0.36, 'glow', 0, 0.02, 0.01);
    shell(k, 0.012, 0.06);
    k.part('mag', [0, -0.066, -0.03]);
    k.cyl(0.05, 0.056, 'trim', 0, -0.066, -0.03, 20, 0, 0, PI / 2);
    k.cyl(0.02, 0.06, 'glow', 0, -0.066, -0.03, 14, 0, 0, PI / 2);
    k.part(null);
    charger(k, -0.06, 0.04, -0.036);
    k.cyl(0.019, 0.21, 'metal', 0, 0.024, -0.3, 14);
    k.box(0.044, 0.016, 0.18, 'trim', 0, 0.05, -0.29);
    k.teeth(5, -0.22, -0.36, 0.046, 0.018, 0.008, 'metal', 0, 0.05);
    k.box(0.036, 0.1, 0.044, 'grip', 0, -0.06, 0.08, -0.22);
    k.box(0.03, 0.06, 0.03, 'grip', 0, -0.05, -0.14);
    k.box(0.048, 0.1, 0.022, 'grip', 0, 0.01, 0.23);
    rail(k, -0.1, 0.12, 0.07);
    const sy = holo(k, 0.0, 0.078);
    return { muzzle: [0, 0.024, -0.41], sightY: sy };
  },

  bulldog(k) {
    k.prof([[0.04, -0.022], [0.04, 0.05], [-0.3, 0.05], [-0.32, 0.03], [-0.32, -0.022]], 0.054, 'body');
    k.box(0.055, 0.004, 0.3, 'glow', 0, 0.02, -0.14);
    k.prof([[-0.32, -0.02], [-0.32, 0.044], [-0.46, 0.038], [-0.46, -0.012]], 0.05, 'trim');
    k.teeth(5, -0.34, -0.44, 0.052, 0.012, 0.01, 'metal', 0, 0.0);
    k.cyl(0.011, 0.1, 'metal', 0, 0.014, -0.5);
    k.box(0.026, 0.026, 0.04, 'metal', 0, 0.014, -0.565);
    k.part('mag');
    k.box(0.028, 0.115, 0.042, 'trim', 0, -0.075, -0.13, 0.12);
    k.part(null);
    charger(k, -0.06, 0.03, -0.031);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.0, -0.26);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.028, -0.04);
    k.prof([[0.04, 0.045], [0.26, 0.04], [0.28, 0.0], [0.28, -0.075], [0.24, -0.075], [0.08, -0.012], [0.04, -0.012]], 0.046, 'trim');
    k.box(0.05, 0.095, 0.018, 'grip', 0, -0.018, 0.285);
    rail(k, -0.3, 0.02, 0.05);
    const sy = holo(k, -0.12, 0.058);
    return { muzzle: [0, 0.014, -0.585], sightY: sy };
  },

  guardian(k) {
    k.prof([[0.05, -0.02], [0.05, 0.048], [-0.04, 0.054], [-0.34, 0.048], [-0.36, 0.02], [-0.36, -0.02]], 0.05, 'body');
    k.box(0.051, 0.003, 0.3, 'glow', 0, 0.018, -0.15);
    k.cyl(0.0105, 0.34, 'metal', 0, 0.014, -0.53);
    k.cyl(0.015, 0.05, 'trim', 0, 0.014, -0.69);
    k.teeth(3, -0.67, -0.71, 0.032, 0.006, 0.006, 'glow', 0, 0.014);
    k.part('mag');
    k.box(0.026, 0.07, 0.04, 'trim', 0, -0.055, -0.12, 0.08);
    k.part(null);
    charger(k, -0.05, 0.03, -0.03);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.02, -0.26);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.026, -0.02);
    k.prof([[0.05, 0.046], [0.3, 0.032], [0.31, -0.085], [0.27, -0.085], [0.2, -0.03], [0.12, -0.03], [0.1, -0.06], [0.06, -0.06], [0.05, -0.02]], 0.044, 'trim');
    rail(k, -0.28, 0.03, 0.05);
    const sy = scope(k, -0.12, 0.058, 0.016, 0.16);
    return { muzzle: [0, 0.014, -0.715], sightY: sy };
  },

  phantom(k) {
    k.prof([[0.05, -0.02], [0.05, 0.048], [-0.06, 0.058], [-0.33, 0.05], [-0.35, 0.012], [-0.35, -0.02]], 0.052, 'body');
    k.prof([[-0.0, 0.002], [-0.3, 0.004], [-0.3, -0.012], [-0.0, -0.014]], 0.053, 'glow', 0, 0.001);
    k.cyl(0.02, 0.22, 'metal', 0, 0.018, -0.46, 18);
    k.teeth(7, -0.37, -0.55, 0.0415, 0.0415, 0.004, 'trim', 0, 0.018);
    k.cyl(0.0205, 0.006, 'glow', 0, 0.018, -0.572, 18);
    k.part('mag');
    k.box(0.028, 0.12, 0.042, 'trim', 0, -0.074, -0.12, 0.18);
    k.part(null);
    charger(k, -0.05, 0.032, -0.031);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.02, -0.26);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.028, -0.02);
    k.box(0.012, 0.012, 0.22, 'trim', 0, 0.035, 0.15);
    k.box(0.012, 0.012, 0.2, 'trim', 0, -0.03, 0.16, -0.12);
    k.box(0.046, 0.1, 0.02, 'grip', 0, 0.0, 0.265);
    rail(k, -0.3, 0.03, 0.054);
    const sy = holo(k, -0.11, 0.062);
    return { muzzle: [0, 0.018, -0.58], sightY: sy };
  },

  vandal(k) {
    k.prof([[0.06, -0.022], [0.06, 0.044], [-0.27, 0.044], [-0.29, 0.024], [-0.29, -0.022]], 0.052, 'body');
    k.box(0.053, 0.004, 0.28, 'glow', 0, 0.012, -0.11);
    k.prof([[-0.29, -0.024], [-0.29, 0.046], [-0.47, 0.036], [-0.47, -0.012]], 0.048, 'trim');
    k.teeth(4, -0.32, -0.44, 0.05, 0.022, 0.012, 'body', 0, 0.026);
    k.cyl(0.0105, 0.08, 'metal', 0, 0.014, -0.51);
    k.prof([[-0.545, 0.002], [-0.545, 0.028], [-0.6, 0.026], [-0.61, 0.014], [-0.6, 0.002]], 0.028, 'metal');
    k.part('mag');
    k.box(0.028, 0.06, 0.04, 'trim', 0, -0.05, -0.115, 0.28);
    k.box(0.028, 0.06, 0.04, 'trim', 0, -0.103, -0.088, 0.55);
    k.part(null);
    charger(k, -0.04, 0.03, -0.031);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.03, -0.3);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.028, -0.03);
    k.prof([[0.06, 0.04], [0.29, 0.03], [0.3, -0.075], [0.26, -0.08], [0.12, -0.022], [0.06, -0.022]], 0.04, 'trim');
    k.prof([[0.17, 0.012], [0.25, 0.008], [0.255, -0.035], [0.17, -0.004]], 0.041, 'body', 0, 0.001);
    k.box(0.046, 0.11, 0.02, 'grip', 0, -0.022, 0.3);
    irons(k, -0.46, -0.12, 0.044);
    return { muzzle: [0, 0.014, -0.615], sightY: 0.054 };
  },

  // ---- Orbital collection (model skins, see skins.js): violet enamel, gunmetal, gold, a live orb ----
  // Each gun carries the reactor spire (orbSpire) on top, so they all inspect and reload the same way
  // (`orb` in reloadanim.js), and raised sights (orbSights) to aim over it.
  // Vandal: a heavier receiver split around the spire, a chunky vented handguard and a glowing muzzle shroud.
  vandalOrb(k) {
    // Receiver, rear and front halves with the reactor bay between them (z -0.115 to -0.185), the spire on top.
    k.prof([[0.06, -0.026], [0.06, 0.048], [-0.02, 0.054], [-0.115, 0.054], [-0.115, -0.026]], 0.058, 'body');
    k.prof([[-0.185, -0.026], [-0.185, 0.054], [-0.3, 0.05], [-0.32, 0.028], [-0.32, -0.026]], 0.058, 'body');
    k.box(0.058, 0.08, 0.07, 'trim', 0, 0.014, -0.15);
    k.box(0.06, 0.004, 0.16, 'accent', 0, 0.002, -0.02);
    k.box(0.06, 0.004, 0.12, 'accent', 0, 0.002, -0.25);
    k.box(0.06, 0.004, 0.07, 'accent', 0, 0.002, -0.15);
    for (const x of [-0.0295, 0.0295]) k.box(0.002, 0.03, 0.05, 'metal', x, 0.03, -0.15);
    // Top spine either side of the spire, gold clamps on it.
    k.box(0.034, 0.012, 0.15, 'trim', 0, 0.06, -0.03);
    k.box(0.034, 0.012, 0.11, 'trim', 0, 0.06, -0.255);
    for (const z of [-0.06, -0.265]) for (const x of [-0.016, 0.016]) {
      k.box(0.008, 0.03, 0.014, 'metal', x, 0.074, z);
      k.box(0.008, 0.008, 0.024, 'metal', x, 0.09, z - 0.005);
    }
    const top = orbSpire(k, -0.15, 0.054);
    // Handguard: chunky shroud with neon vents and a gold name plate on each side.
    k.prof([[-0.32, -0.026], [-0.32, 0.05], [-0.49, 0.04], [-0.5, 0.018], [-0.49, -0.014]], 0.054, 'trim');
    k.teeth(5, -0.34, -0.46, 0.056, 0.018, 0.008, 'accent', 0, 0.026);
    k.box(0.056, 0.012, 0.07, 'metal', 0, -0.004, -0.4);
    k.box(0.062, 0.006, 0.17, 'body', 0, 0.042, -0.41);
    // Barrel and the glowing muzzle: a shroud with a blue ring at the face, gold latches either side.
    k.cyl(0.011, 0.08, 'trim', 0, 0.014, -0.53);
    k.cyl(0.024, 0.07, 'trim', 0, 0.014, -0.6, 16);
    k.cyl(0.026, 0.012, 'body', 0, 0.014, -0.575, 16);
    k.tor(0.02, 0.0045, 'glow', 0, 0.014, -0.636);
    k.cyl(0.012, 0.004, 'glow', 0, 0.014, -0.634, 14);
    for (const x of [-0.026, 0.026]) k.box(0.006, 0.016, 0.03, 'metal', x, 0.014, -0.6);
    // Magazine (fixed: this gun reloads its orb), gold base plate.
    k.box(0.03, 0.06, 0.042, 'trim', 0, -0.052, -0.08, 0.28);
    k.box(0.03, 0.06, 0.042, 'trim', 0, -0.105, -0.053, 0.55);
    k.box(0.034, 0.008, 0.048, 'metal', 0, -0.132, -0.034, 0.55);
    charger(k, -0.04, 0.03, -0.034);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.03, -0.3);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.03, -0.03);
    // Stock: gunmetal frame, purple cheek panel with an accent line, gold butt plate.
    k.prof([[0.06, 0.044], [0.29, 0.034], [0.3, -0.078], [0.26, -0.082], [0.12, -0.024], [0.06, -0.024]], 0.044, 'trim');
    k.prof([[0.15, 0.022], [0.25, 0.016], [0.255, -0.04], [0.15, -0.006]], 0.046, 'body', 0, 0.001);
    k.box(0.047, 0.003, 0.09, 'accent', 0, 0.0, 0.2);
    k.box(0.05, 0.115, 0.02, 'grip', 0, -0.022, 0.305);
    k.box(0.052, 0.012, 0.022, 'metal', 0, 0.03, 0.305);
    const sy = orbSights(k, -0.47, 0.045, 0.02, 0.066, top + 0.009);
    return { muzzle: [0, 0.014, -0.64], sightY: sy };
  },

  // Stinger: a short, sharp SMG: a slim receiver with the spire just ahead of the grip, a stubby shroud with a
  // lit face and gold vents, and a skeleton stock of gold rails around a neon strip.
  stingerOrb(k) {
    k.prof([[0.08, -0.008], [0.08, 0.05], [-0.02, 0.054], [-0.2, 0.05], [-0.225, 0.03], [-0.225, -0.008], [-0.05, -0.02]], 0.05, 'body');
    k.box(0.052, 0.004, 0.2, 'accent', 0, 0.018, -0.09);
    k.box(0.052, 0.003, 0.06, 'glow', 0, 0.004, 0.03);
    k.box(0.03, 0.01, 0.07, 'trim', 0, 0.058, 0.035);
    k.box(0.03, 0.01, 0.06, 'trim', 0, 0.057, -0.17);
    const top = orbSpire(k, -0.08, 0.054, 0.82);
    // Shroud: lit face ring, gold vents down each side.
    k.cyl(0.021, 0.07, 'trim', 0, 0.022, -0.255, 16);
    k.cyl(0.023, 0.01, 'body', 0, 0.022, -0.235, 16);
    k.tor(0.017, 0.004, 'glow', 0, 0.022, -0.29);
    k.cyl(0.01, 0.004, 'glow', 0, 0.022, -0.289, 12);
    for (const x of [-0.022, 0.022]) k.teeth(3, -0.24, -0.275, 0.004, 0.01, 0.006, 'metal', x, 0.022);
    // Magazine (fixed: this gun reloads its orb), gold base plate.
    k.box(0.03, 0.115, 0.042, 'trim', 0, -0.07, -0.075, 0.26);
    k.box(0.034, 0.008, 0.048, 'metal', 0, -0.126, -0.06, 0.26);
    k.box(0.031, 0.003, 0.06, 'accent', 0, -0.066, -0.075, 0.26 + PI / 2);
    charger(k, -0.03, 0.035, -0.03);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.055, 0.035, -0.24);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.026, 0.0);
    // Skeleton stock: gold rails top and bottom, a neon strip between, a padded butt with a gold cap.
    k.box(0.008, 0.008, 0.17, 'metal', -0.016, 0.034, 0.16);
    k.box(0.008, 0.008, 0.17, 'metal', 0.016, 0.034, 0.16);
    k.box(0.008, 0.008, 0.17, 'metal', 0, -0.008, 0.16, -0.12);
    k.box(0.004, 0.004, 0.14, 'accent', 0, 0.014, 0.16, -0.06);
    k.box(0.042, 0.068, 0.018, 'grip', 0, 0.01, 0.25);
    k.box(0.044, 0.01, 0.02, 'metal', 0, 0.048, 0.25);
    const sy = orbSights(k, -0.2, 0.05, 0.06, 0.063, top + 0.008);
    return { muzzle: [0, 0.022, -0.3], sightY: sy };
  },

  // Phantom: a long, smooth receiver with the spire in its middle, a twin accent line down each side and a long
  // suppressor banded in gold with neon rings, lit at the face.
  phantomOrb(k) {
    k.prof([[0.05, -0.024], [0.05, 0.05], [-0.06, 0.058], [-0.33, 0.05], [-0.35, 0.012], [-0.35, -0.024]], 0.056, 'body');
    k.box(0.058, 0.003, 0.3, 'accent', 0, 0.01, -0.16);
    k.box(0.058, 0.003, 0.26, 'glow', 0, -0.004, -0.17);
    k.box(0.036, 0.01, 0.07, 'trim', 0, 0.062, -0.07);
    k.box(0.036, 0.01, 0.08, 'trim', 0, 0.058, -0.28);
    const top = orbSpire(k, -0.17, 0.055);
    // Suppressor: gold bands, neon rings between them, lit face.
    k.cyl(0.022, 0.22, 'trim', 0, 0.018, -0.46, 18);
    for (const z of [-0.37, -0.45, -0.53]) k.cyl(0.024, 0.012, 'metal', 0, 0.018, z, 18);
    for (const z of [-0.41, -0.49]) k.tor(0.0225, 0.0022, 'accent', 0, 0.018, z);
    k.cyl(0.0235, 0.006, 'body', 0, 0.018, -0.568, 18);
    k.tor(0.016, 0.0035, 'glow', 0, 0.018, -0.572);
    k.cyl(0.01, 0.004, 'glow', 0, 0.018, -0.571, 14);
    // Magazine (fixed: this gun reloads its orb), gold base plate.
    k.box(0.03, 0.12, 0.044, 'trim', 0, -0.076, -0.12, 0.18);
    k.box(0.034, 0.008, 0.05, 'metal', 0, -0.137, -0.109, 0.18);
    charger(k, -0.05, 0.032, -0.033);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.02, -0.26);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.03, -0.02);
    // Stock: two gunmetal struts, a violet cheek plate with a neon edge, a gold-capped butt.
    k.box(0.012, 0.012, 0.22, 'trim', 0, 0.035, 0.15);
    k.box(0.012, 0.012, 0.2, 'trim', 0, -0.03, 0.16, -0.12);
    k.prof([[0.08, 0.03], [0.2, 0.028], [0.22, -0.01], [0.09, 0.0]], 0.03, 'body', 0, 0.001);
    k.box(0.031, 0.003, 0.11, 'accent', 0, 0.012, 0.15);
    k.box(0.046, 0.1, 0.02, 'grip', 0, 0.0, 0.265);
    k.box(0.048, 0.012, 0.022, 'metal', 0, 0.05, 0.265);
    const sy = orbSights(k, -0.32, 0.051, 0.03, 0.055, top + 0.009);
    return { muzzle: [0, 0.018, -0.58], sightY: sy };
  },

  // Bulldog: a blocky, heavy receiver with a bigger spire, a vented handguard and a squared gold muzzle brake
  // with neon slots.
  bulldogOrb(k) {
    k.prof([[0.04, -0.026], [0.04, 0.054], [-0.3, 0.054], [-0.32, 0.032], [-0.32, -0.026]], 0.06, 'body');
    k.box(0.062, 0.004, 0.3, 'accent', 0, 0.02, -0.14);
    k.box(0.062, 0.004, 0.1, 'glow', 0, -0.006, -0.07);
    k.box(0.04, 0.012, 0.08, 'trim', 0, 0.06, 0.0);
    k.box(0.04, 0.012, 0.08, 'trim', 0, 0.06, -0.265);
    for (const x of [-0.031, 0.031]) k.box(0.002, 0.034, 0.06, 'metal', x, 0.026, -0.14);
    const top = orbSpire(k, -0.14, 0.054, 1.08);
    // Handguard: gunmetal with neon vent teeth; barrel and the squared muzzle brake.
    k.prof([[-0.32, -0.022], [-0.32, 0.048], [-0.46, 0.042], [-0.46, -0.014]], 0.054, 'trim');
    k.teeth(5, -0.34, -0.44, 0.056, 0.012, 0.01, 'accent', 0, 0.006);
    k.box(0.058, 0.006, 0.12, 'body', 0, 0.046, -0.39);
    k.cyl(0.012, 0.1, 'trim', 0, 0.014, -0.5);
    k.box(0.034, 0.034, 0.05, 'metal', 0, 0.014, -0.57);
    for (const x of [-0.0175, 0.0175]) k.teeth(3, -0.555, -0.585, 0.002, 0.02, 0.006, 'glow', x, 0.014);
    k.tor(0.012, 0.003, 'glow', 0, 0.014, -0.596);
    // Magazine (fixed: this gun reloads its orb), gold base plate.
    k.box(0.03, 0.115, 0.044, 'trim', 0, -0.077, -0.13, 0.12);
    k.box(0.034, 0.008, 0.05, 'metal', 0, -0.135, -0.123, 0.12);
    charger(k, -0.06, 0.03, -0.033);
    k.box(0.036, 0.1, 0.046, 'grip', 0, -0.06, 0.0, -0.26);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.03, -0.04);
    // Stock: heavy gunmetal frame, violet inset with a neon line, gold butt plate.
    k.prof([[0.04, 0.048], [0.26, 0.042], [0.28, 0.0], [0.28, -0.075], [0.24, -0.075], [0.08, -0.014], [0.04, -0.014]], 0.048, 'trim');
    k.prof([[0.1, 0.03], [0.22, 0.027], [0.235, -0.03], [0.12, -0.004]], 0.05, 'body', 0, 0.001);
    k.box(0.051, 0.003, 0.1, 'accent', 0, 0.006, 0.17);
    k.box(0.052, 0.1, 0.018, 'grip', 0, -0.018, 0.288);
    k.box(0.054, 0.012, 0.02, 'metal', 0, 0.036, 0.288);
    const sy = orbSights(k, -0.44, 0.048, 0.03, 0.066, top + 0.009);
    return { muzzle: [0, 0.014, -0.6], sightY: sy };
  },

  // ---- Starspur collection (model skins, see skins.js): bone enamel, copper, teal chambers, spur rowels ----
  // Sheriff: long octagonal barrel with cooling fins, a drum with six lit chambers (part `cyl`) and a spur
  // rowel for a hammer (part `spur`). The whole gun is part `w`, pivoting on the trigger guard, so the
  // inspect can twirl it on your finger.
  sheriffSpur(k) {
    k.part('w', [0, -0.02, 0.008]);
    k.prof([[0.045, 0.0], [0.045, 0.05], [0.02, 0.06], [-0.04, 0.056], [-0.04, -0.008], [0.03, -0.02]], 0.03, 'trim');
    k.box(0.026, 0.01, 0.1, 'body', 0, 0.061, -0.005);
    k.cyl(0.0125, 0.25, 'metal', 0, 0.032, -0.165, 8);
    k.box(0.012, 0.012, 0.25, 'body', 0, 0.047, -0.165);
    k.box(0.0124, 0.003, 0.22, 'glow', 0, 0.0545, -0.16);
    k.box(0.018, 0.014, 0.19, 'body', 0, 0.013, -0.135);
    k.box(0.0185, 0.003, 0.15, 'accent', 0, 0.007, -0.13);
    for (const z of [-0.232, -0.248, -0.264]) k.cyl(0.0175, 0.005, 'trim', 0, 0.032, z, 8);
    k.cyl(0.0145, 0.014, 'trim', 0, 0.032, -0.284, 8);
    k.tor(0.0105, 0.0026, 'glow', 0, 0.032, -0.292);
    k.part('cyl', [0, 0.027, -0.005], 'w');
    k.cyl(0.03, 0.062, 'metal', 0, 0.027, -0.005, 12);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.cyl(0.0058, 0.064, 'glow', Math.cos(a) * 0.019, 0.027 + Math.sin(a) * 0.019, -0.005, 8); }
    k.tor(0.0302, 0.0028, 'accent', 0, 0.027, -0.005);
    k.part('spur', [0, 0.066, 0.05], 'w');
    star(k, 0, 0.066, 0.05, 0.017, 'trim', 'accent', 6);
    k.part('w');
    k.prof([[0.03, -0.01], [0.075, -0.035], [0.105, -0.11], [0.065, -0.12], [0.03, -0.06], [0.005, -0.02]], 0.034, 'grip');
    for (const x of [-0.0175, 0.0175]) star(k, x, -0.065, 0.058, 0.012, 'accent');
    k.box(0.036, 0.01, 0.046, 'trim', 0, -0.117, 0.086, -0.25);
    k.box(0.022, 0.005, 0.045, 'trim', 0, -0.026, 0.008);
    k.box(0.005, 0.018, 0.005, 'metal', 0, -0.015, 0.0, 0.3);
    k.box(0.004, 0.012, 0.01, 'trim', 0, 0.06, -0.276);
    k.box(0.003, 0.004, 0.004, 'glow', 0, 0.067, -0.276);
    for (const x of [-0.006, 0.006]) k.box(0.005, 0.01, 0.008, 'trim', x, 0.07, 0.03);
    k.part(null);
    shell(k, 0.006, 0.04);
    return { muzzle: [0, 0.032, -0.298], sightY: 0.069 };
  },

  // Marshal: copper receiver, long bone forend with copper bands, a teal-lit tube under the barrel, a copper
  // scope, and a star rowel for a bolt knob (part `rowel`, inside `bolt`).
  marshalSpur(k) {
    k.part('w', [0, -0.02, 0.02]); // the whole rifle, so the pullout can spin it round the trigger guard
    k.prof([[0.06, -0.022], [0.06, 0.044], [-0.22, 0.044], [-0.24, 0.018], [-0.24, -0.022]], 0.046, 'trim');
    k.box(0.047, 0.004, 0.2, 'glow', 0, 0.014, -0.09);
    for (const x of [-0.0235, 0.0235]) star(k, x, 0.0, -0.17, 0.014, 'accent');
    k.prof([[-0.04, -0.022], [-0.04, 0.008], [-0.56, 0.008], [-0.56, -0.014], [-0.3, -0.032]], 0.048, 'body');
    for (const z of [-0.3, -0.46]) k.box(0.05, 0.03, 0.012, 'trim', 0, -0.006, z);
    k.cyl(0.0105, 0.5, 'metal', 0, 0.02, -0.56, 8);
    k.cyl(0.0072, 0.22, 'glow', 0, 0.0, -0.67, 10);
    k.box(0.02, 0.034, 0.012, 'trim', 0, 0.01, -0.775);
    k.cyl(0.016, 0.05, 'trim', 0, 0.02, -0.81, 8);
    for (const z of [-0.8, -0.815]) k.box(0.034, 0.005, 0.006, 'metal', 0, 0.02, z);
    k.tor(0.0115, 0.0025, 'glow', 0, 0.02, -0.836);
    k.part('bolt', [0.012, 0.03, 0.03], 'w');
    k.cyl(0.005, 0.04, 'metal', 0.03, 0.03, 0.03, 8, 0, 0, PI / 2);
    k.part('rowel', [0.052, 0.03, 0.03], 'bolt');
    star(k, 0.052, 0.03, 0.03, 0.013, 'trim', 'glow', 6);
    k.part('mag', [0, 0, 0], 'w');
    k.box(0.026, 0.05, 0.04, 'metal', 0, -0.045, -0.1);
    k.box(0.027, 0.006, 0.041, 'trim', 0, -0.07, -0.1);
    k.part('w');
    k.prof([[0.06, 0.03], [0.32, 0.02], [0.33, -0.09], [0.29, -0.09], [0.14, -0.05], [0.09, -0.1], [0.05, -0.09], [0.07, -0.03], [0.06, -0.02]], 0.044, 'body');
    k.box(0.0455, 0.06, 0.032, 'grip', 0, -0.074, 0.114, 0.78);
    k.box(0.046, 0.112, 0.014, 'trim', 0, -0.035, 0.33);
    for (const x of [-0.0225, 0.0225]) star(k, x, -0.02, 0.235, 0.016, 'accent');
    k.box(0.024, 0.005, 0.05, 'trim', 0, -0.03, 0.02);
    const sy = scope(k, -0.08, 0.044, 0.02, 0.24);
    k.part(null);
    shell(k, 0.0065, 0.055);
    return { muzzle: [0, 0.02, -0.84], sightY: sy };
  },

  // Judge: a coach-gun take on the drum shotgun: twin barrels with copper bands, a copper-rimmed drum with
  // five lit chambers (part `mag`), a spur rowel on the left of the receiver (part `spur`), bone and leather.
  judgeSpur(k) {
    k.prof([[0.22, -0.03], [0.22, 0.06], [0.02, 0.07], [-0.08, 0.07], [-0.2, 0.05], [-0.2, -0.03]], 0.064, 'body');
    k.box(0.0655, 0.026, 0.4, 'metal', 0, -0.018, 0.01);
    k.box(0.066, 0.022, 0.2, 'trim', 0, 0.012, 0.05);
    k.box(0.067, 0.004, 0.2, 'glow', 0, 0.025, 0.05);
    shell(k, 0.012, 0.06);
    k.part('mag', [0, -0.066, -0.03]);
    k.cyl(0.048, 0.06, 'metal', 0, -0.066, -0.03, 10, 0, 0, PI / 2);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; k.cyl(0.0085, 0.062, 'glow', 0, -0.066 + Math.cos(a) * 0.029, -0.03 + Math.sin(a) * 0.029, 8, 0, 0, PI / 2); }
    for (const x of [-0.031, 0.031]) k.tor(0.046, 0.0035, 'trim', x, -0.066, -0.03, 0, PI / 2, 0);
    k.part(null);
    charger(k, -0.06, 0.04, -0.036);
    k.part('spur', [-0.036, 0.03, 0.12]);
    star(k, -0.036, 0.03, 0.12, 0.016, 'trim', 'accent', 6);
    k.part(null);
    for (const x of [-0.0125, 0.0125]) {
      k.cyl(0.012, 0.24, 'metal', x, 0.026, -0.31, 10);
      k.tor(0.0092, 0.0022, 'glow', x, 0.026, -0.431);
    }
    k.box(0.05, 0.006, 0.22, 'body', 0, 0.041, -0.3);
    for (const z of [-0.24, -0.39]) k.box(0.052, 0.03, 0.012, 'trim', 0, 0.026, z);
    k.box(0.006, 0.02, 0.008, 'trim', 0, 0.054, -0.41);
    k.box(0.004, 0.005, 0.005, 'glow', 0, 0.066, -0.41);
    k.box(0.03, 0.06, 0.03, 'grip', 0, -0.05, -0.14);
    k.box(0.036, 0.1, 0.044, 'grip', 0, -0.06, 0.08, -0.22);
    k.box(0.024, 0.005, 0.05, 'trim', 0, -0.035, 0.03);
    k.prof([[0.22, 0.05], [0.36, 0.035], [0.37, -0.075], [0.33, -0.08], [0.24, -0.03], [0.22, -0.03]], 0.046, 'body');
    k.box(0.048, 0.112, 0.014, 'trim', 0, -0.02, 0.37);
    for (const x of [-0.0235, 0.0235]) star(k, x, -0.012, 0.3, 0.014, 'accent');
    for (const x of [-0.008, 0.008]) k.box(0.005, 0.012, 0.008, 'trim', x, 0.068, 0.05);
    return { muzzle: [0, 0.026, -0.435], sightY: 0.069 };
  },

  // ---- Oathblade collection (model skins, see skins.js): black lacquer, gold leaf, folded steel, a lit edge ----
  // Vandal: the handguard is a blade, a curved steel spine running from a gold guard ring to a tip past the
  // muzzle, its lit edge underneath (part `edge`, pivoting at the guard so it lights guard-to-tip). The grip is
  // cord-wrapped. A hidden off-hand (part `swipe`) runs along the spine to relight the edge during the reload.
  vandalOath(k) {
    k.prof([[0.06, -0.022], [0.06, 0.044], [-0.03, 0.05], [-0.25, 0.046], [-0.27, 0.024], [-0.27, -0.022]], 0.052, 'body');
    for (const y of [0.03, -0.006]) k.box(0.0532, 0.0022, 0.3, 'trim', 0, y, -0.1);
    k.box(0.0534, 0.004, 0.1, 'accent', 0, 0.012, -0.2);
    // Guard ring between the receiver and the blade.
    k.cyl(0.046, 0.008, 'body', 0, 0.012, -0.275, 16);
    k.tor(0.046, 0.0025, 'trim', 0, 0.012, -0.275);
    for (const a of [0.8, 2.35, 3.9, 5.5]) k.box(0.008, 0.008, 0.009, 'trim', Math.cos(a) * 0.034, 0.012 + Math.sin(a) * 0.034, -0.275, 0, 0, a);
    // The blade: a curved steel spine over the barrel, gold collar at its root, black back strap.
    k.prof([[-0.28, 0.006], [-0.28, 0.04], [-0.45, 0.038], [-0.6, 0.032], [-0.66, 0.022], [-0.69, 0.006], [-0.62, 0.004], [-0.45, 0.008]], 0.014, 'metal', 0, 0.0015);
    k.box(0.0145, 0.004, 0.32, 'body', 0, 0.038, -0.44);
    k.box(0.03, 0.04, 0.02, 'trim', 0, 0.024, -0.29);
    k.part('edge', [0, 0.006, -0.28]);
    k.box(0.0148, 0.003, 0.4, 'glow', 0, 0.0055, -0.48);
    k.box(0.0148, 0.003, 0.04, 'glow', 0, 0.013, -0.68, 0.45);
    k.part(null);
    // Barrel and handguard under the blade.
    k.prof([[-0.28, -0.022], [-0.28, 0.006], [-0.46, 0.006], [-0.47, -0.012]], 0.04, 'body');
    k.teeth(4, -0.3, -0.44, 0.042, 0.004, 0.006, 'accent', 0, -0.008);
    k.cyl(0.0105, 0.16, 'metal', 0, -0.006, -0.54);
    k.cyl(0.016, 0.03, 'body', 0, -0.006, -0.6, 12);
    k.tor(0.012, 0.0028, 'glow', 0, -0.006, -0.616);
    k.part('mag');
    k.box(0.028, 0.06, 0.04, 'body', 0, -0.05, -0.115, 0.28);
    k.box(0.028, 0.06, 0.04, 'body', 0, -0.103, -0.088, 0.55);
    k.box(0.0285, 0.003, 0.03, 'trim', 0, -0.075, -0.104, 0.4);
    k.box(0.032, 0.008, 0.046, 'trim', 0, -0.13, -0.07, 0.55);
    k.part(null);
    charger(k, -0.04, 0.03, -0.031);
    k.part('swipe', [0, 0.05, -0.3]);
    k.part(null);
    // Cord-wrapped grip with a gold cap; lacquered stock with gold hairlines and a crimson crest.
    k.box(0.032, 0.1, 0.042, 'grip', 0, -0.06, 0.03, -0.3);
    wrap(k, 4, -0.025, 0.018, -0.095, 0.04, 0.034, 0.016, 'trim', -0.3);
    k.box(0.036, 0.01, 0.048, 'trim', 0, -0.11, 0.05, -0.3);
    k.box(0.024, 0.005, 0.05, 'trim', 0, -0.028, -0.03);
    k.prof([[0.06, 0.04], [0.29, 0.03], [0.3, -0.075], [0.26, -0.08], [0.12, -0.022], [0.06, -0.022]], 0.04, 'body');
    k.box(0.041, 0.002, 0.2, 'trim', 0, 0.03, 0.17, 0.04);
    k.box(0.041, 0.002, 0.15, 'trim', 0, -0.03, 0.2, -0.36);
    k.ball(0.009, 'accent', 0.02, 0.0, 0.22);
    k.ball(0.009, 'accent', -0.02, 0.0, 0.22);
    k.box(0.046, 0.11, 0.02, 'grip', 0, -0.022, 0.3);
    k.box(0.047, 0.012, 0.022, 'trim', 0, 0.03, 0.3);
    irons(k, -0.25, -0.12, 0.05);
    return { muzzle: [0, -0.006, -0.62], sightY: 0.06 };
  },

  // Sheriff: lacquered frame, a short blade riding on top of the barrel (lit edge, part `edge`), a gold guard
  // ring at the front of the frame, a drum with six crimson chambers (part `cyl`), a cord-wrapped grip with a
  // gold pommel cap. The whole gun is part `w` (pivots on the trigger guard) so inspects can roll it.
  sheriffOath(k) {
    k.part('w', [0, -0.02, 0.008]);
    k.prof([[0.045, 0.0], [0.045, 0.05], [0.02, 0.058], [-0.04, 0.054], [-0.04, -0.01], [0.03, -0.02]], 0.03, 'body');
    k.box(0.0305, 0.002, 0.08, 'trim', 0, 0.04, 0.0);
    k.cyl(0.011, 0.2, 'metal', 0, 0.022, -0.14, 10);
    k.box(0.02, 0.014, 0.19, 'body', 0, 0.0, -0.13);
    k.box(0.0205, 0.002, 0.18, 'trim', 0, -0.006, -0.13);
    k.cyl(0.015, 0.02, 'body', 0, 0.022, -0.235, 10);
    k.tor(0.0105, 0.0024, 'glow', 0, 0.022, -0.246);
    // Guard ring at the front of the frame.
    k.cyl(0.04, 0.006, 'body', 0, 0.022, -0.045, 14);
    k.tor(0.04, 0.0022, 'trim', 0, 0.022, -0.045);
    // The blade on top: steel spine with a chisel tip, its edge lit along the barrel side.
    k.prof([[-0.05, 0.034], [-0.05, 0.06], [-0.2, 0.056], [-0.255, 0.048], [-0.235, 0.034]], 0.009, 'metal', 0, 0.001);
    k.box(0.0094, 0.003, 0.17, 'body', 0, 0.057, -0.13);
    k.part('edge', [0, 0.036, -0.05], 'w');
    k.box(0.0096, 0.0026, 0.19, 'glow', 0, 0.036, -0.145);
    k.part('w');
    k.part('cyl', [0, 0.027, -0.005], 'w');
    k.cyl(0.03, 0.062, 'body', 0, 0.027, -0.005, 12);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.cyl(0.0056, 0.064, 'accent', Math.cos(a) * 0.019, 0.027 + Math.sin(a) * 0.019, -0.005, 8); }
    k.tor(0.0302, 0.0022, 'trim', 0, 0.027, -0.005);
    k.part('w');
    k.prof([[0.03, -0.01], [0.075, -0.035], [0.105, -0.11], [0.065, -0.12], [0.03, -0.06], [0.005, -0.02]], 0.032, 'grip');
    wrap(k, 4, -0.03, 0.04, -0.095, 0.075, 0.034, 0.014, 'trim', 0.45);
    k.box(0.036, 0.012, 0.044, 'trim', 0, -0.118, 0.086, -0.25);
    k.ball(0.006, 'accent', 0, -0.126, 0.1);
    k.box(0.022, 0.005, 0.045, 'trim', 0, -0.026, 0.008);
    k.box(0.005, 0.018, 0.005, 'metal', 0, -0.015, 0.0, 0.3);
    k.box(0.008, 0.02, 0.014, 'trim', 0, 0.062, 0.05, 0.4);
    k.box(0.004, 0.01, 0.008, 'trim', 0, 0.065, -0.04);
    k.box(0.003, 0.004, 0.004, 'glow', 0, 0.071, -0.04);
    k.part('swipe', [0, 0.06, -0.05], 'w');
    k.part(null);
    shell(k, 0.006, 0.04);
    return { muzzle: [0, 0.022, -0.25], sightY: 0.069 };
  },

  warden(k) {
    k.prof([[0.08, -0.024], [0.08, 0.05], [-0.36, 0.05], [-0.38, 0.024], [-0.38, -0.024]], 0.054, 'body');
    k.box(0.055, 0.004, 0.36, 'glow', 0, 0.018, -0.13);
    k.prof([[-0.38, -0.02], [-0.38, 0.04], [-0.52, 0.034], [-0.52, -0.01]], 0.046, 'trim');
    k.teeth(6, -0.4, -0.5, 0.048, 0.016, 0.008, 'metal', 0, 0.016);
    k.cyl(0.011, 0.12, 'metal', 0, 0.014, -0.58);
    k.cyl(0.016, 0.04, 'metal', 0, 0.014, -0.655, 8);
    k.box(0.006, 0.006, 0.12, 'metal', -0.012, -0.02, -0.46);
    k.box(0.006, 0.006, 0.12, 'metal', 0.012, -0.02, -0.46);
    k.part('mag');
    k.box(0.028, 0.09, 0.044, 'trim', 0, -0.065, -0.14, 0.1);
    k.part(null);
    charger(k, -0.06, 0.03, -0.032);
    k.box(0.034, 0.1, 0.044, 'grip', 0, -0.06, 0.03, -0.26);
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.028, -0.02);
    k.prof([[0.08, 0.046], [0.3, 0.04], [0.31, -0.08], [0.27, -0.08], [0.12, -0.024], [0.08, -0.024]], 0.046, 'trim');
    k.box(0.05, 0.11, 0.02, 'grip', 0, -0.02, 0.31);
    rail(k, -0.34, 0.06, 0.05);
    const sy = scope(k, -0.12, 0.058, 0.018, 0.15);
    return { muzzle: [0, 0.014, -0.68], sightY: sy };
  },

  marshal(k) {
    k.prof([[0.06, -0.02], [0.06, 0.042], [-0.22, 0.042], [-0.24, 0.016], [-0.24, -0.02]], 0.044, 'body');
    k.box(0.045, 0.003, 0.24, 'glow', 0, 0.016, -0.09);
    k.prof([[-0.04, -0.02], [-0.04, 0.006], [-0.52, 0.006], [-0.52, -0.016], [-0.3, -0.03]], 0.046, 'trim');
    k.cyl(0.0105, 0.44, 'metal', 0, 0.018, -0.6);
    k.cyl(0.014, 0.03, 'metal', 0, 0.018, -0.82);
    k.part('bolt', [0.012, 0.03, 0.03]);
    k.cyl(0.005, 0.04, 'metal', 0.03, 0.03, 0.03, 8, 0, 0, PI / 2);
    k.cyl(0.009, 0.01, 'glow', 0.05, 0.03, 0.03, 10, 0, 0, PI / 2);
    k.part(null);
    k.part('mag');
    k.box(0.026, 0.05, 0.04, 'trim', 0, -0.045, -0.1);
    k.part(null);
    shell(k, 0.0065, 0.055);
    k.prof([[0.06, 0.03], [0.32, 0.02], [0.33, -0.09], [0.29, -0.09], [0.14, -0.05], [0.09, -0.1], [0.05, -0.09], [0.07, -0.03], [0.06, -0.02]], 0.044, 'trim');
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.03, 0.02);
    const sy = scope(k, -0.08, 0.042, 0.02, 0.24);
    return { muzzle: [0, 0.018, -0.84], sightY: sy };
  },

  outlaw(k) {
    // Break-action: the whole front (receiver, both barrels and the scope) hinges down at a pin just behind
    // the scope, opening the breech there for the slugs.
    k.part('barrels', [0, -0.03, 0.066]);
    k.box(0.05, 0.07, 0.16, 'body', 0, 0.0, -0.03);
    k.box(0.051, 0.003, 0.15, 'glow', 0, 0.014, -0.03);
    k.cyl(0.012, 0.5, 'metal', 0, 0.022, -0.36);
    k.cyl(0.012, 0.5, 'metal', 0, -0.006, -0.36);
    k.box(0.006, 0.026, 0.48, 'trim', 0, 0.008, -0.36);
    k.cyl(0.015, 0.03, 'trim', 0, 0.022, -0.6);
    k.cyl(0.015, 0.03, 'trim', 0, -0.006, -0.6);
    k.prof([[-0.12, -0.02], [-0.12, -0.012], [-0.42, -0.012], [-0.42, -0.03], [-0.2, -0.04]], 0.044, 'trim');
    k.cyl(0.0085, 0.004, 'metal', 0, 0.022, 0.051); // breech mouths, visible when open
    k.cyl(0.0085, 0.004, 'metal', 0, -0.006, 0.051);
    const sy = scope(k, -0.06, 0.035, 0.02, 0.22);
    k.part(null);
    // fixed rear: hinge pin, breech face, stock and grip
    k.cyl(0.01, 0.056, 'metal', 0, -0.03, 0.066, 12, 0, 0, PI / 2);
    k.box(0.052, 0.07, 0.014, 'trim', 0, 0.0, 0.064);
    shell(k, 0.0115, 0.07);
    k.prof([[0.07, 0.03], [0.32, 0.016], [0.33, -0.09], [0.29, -0.09], [0.13, -0.05], [0.08, -0.1], [0.04, -0.09], [0.06, -0.035]], 0.044, 'trim');
    k.box(0.024, 0.005, 0.05, 'metal', 0, -0.04, 0.02);
    return { muzzle: [0, 0.022, -0.615], sightY: sy };
  },

  operator(k) {
    k.prof([[0.08, -0.028], [0.08, 0.05], [-0.28, 0.05], [-0.3, 0.02], [-0.3, -0.028]], 0.058, 'body');
    k.box(0.059, 0.004, 0.32, 'glow', 0, 0.02, -0.1);
    k.prof([[-0.3, -0.026], [-0.3, 0.036], [-0.5, 0.03], [-0.5, -0.016]], 0.054, 'trim');
    k.cyl(0.014, 0.42, 'metal', 0, 0.016, -0.68, 10);
    k.teeth(5, -0.55, -0.82, 0.03, 0.03, 0.04, 'metal', 0, 0.016);
    k.prof([[-0.88, -0.008], [-0.88, 0.04], [-0.96, 0.036], [-0.96, -0.004]], 0.04, 'body');
    k.teeth(3, -0.9, -0.94, 0.042, 0.03, 0.008, 'metal', 0, 0.016);
    k.part('bolt', [0.015, 0.035, 0.04]);
    k.cyl(0.006, 0.05, 'metal', 0.035, 0.035, 0.04, 8, 0, 0, PI / 2);
    k.cyl(0.011, 0.012, 'glow', 0.06, 0.035, 0.04, 10, 0, 0, PI / 2);
    k.part(null);
    k.box(0.006, 0.006, 0.14, 'metal', -0.016, -0.03, -0.44);
    k.box(0.006, 0.006, 0.14, 'metal', 0.016, -0.03, -0.44);
    k.part('mag');
    k.box(0.03, 0.075, 0.05, 'trim', 0, -0.06, -0.12);
    k.part(null);
    shell(k, 0.008, 0.065);
    k.box(0.036, 0.1, 0.046, 'grip', 0, -0.06, 0.06, -0.28);
    k.box(0.026, 0.005, 0.05, 'metal', 0, -0.03, 0.02);
    k.prof([[0.08, 0.044], [0.35, 0.04], [0.36, -0.1], [0.3, -0.1], [0.24, -0.04], [0.15, -0.04], [0.13, -0.075], [0.1, -0.075], [0.08, -0.028]], 0.05, 'trim');
    k.box(0.054, 0.15, 0.022, 'grip', 0, -0.03, 0.36);
    rail(k, -0.26, 0.06, 0.05);
    const sy = scope(k, -0.1, 0.058, 0.026, 0.3);
    return { muzzle: [0, 0.016, -0.97], sightY: sy };
  },

  ares(k) {
    k.prof([[0.1, -0.03], [0.1, 0.06], [-0.32, 0.06], [-0.34, 0.03], [-0.34, -0.03]], 0.07, 'body');
    k.box(0.071, 0.004, 0.4, 'glow', 0, 0.024, -0.12);
    k.part('mag');
    k.box(0.08, 0.085, 0.11, 'trim', 0, -0.075, -0.12);
    k.box(0.081, 0.006, 0.112, 'glow', 0, -0.06, -0.12);
    k.part(null);
    k.cyl(0.024, 0.2, 'trim', 0, 0.018, -0.44, 16);
    k.teeth(6, -0.36, -0.52, 0.05, 0.05, 0.006, 'metal', 0, 0.018);
    k.cyl(0.012, 0.08, 'metal', 0, 0.018, -0.58);
    k.part('lid', [0, 0.062, -0.03]);
    k.box(0.06, 0.008, 0.2, 'body', 0, 0.064, -0.13);
    k.box(0.016, 0.02, 0.16, 'metal', 0, 0.09, -0.12);
    k.box(0.012, 0.03, 0.012, 'metal', 0, 0.072, -0.19);
    k.box(0.012, 0.03, 0.012, 'metal', 0, 0.072, -0.05);
    k.part(null);
    charger(k, -0.24, 0.03, -0.04);
    k.box(0.03, 0.08, 0.034, 'grip', 0, -0.06, -0.3);
    k.box(0.036, 0.1, 0.046, 'grip', 0, -0.065, 0.06, -0.26);
    k.box(0.026, 0.005, 0.05, 'metal', 0, -0.036, 0.02);
    k.prof([[0.1, 0.05], [0.3, 0.045], [0.31, -0.07], [0.27, -0.07], [0.14, -0.03], [0.1, -0.03]], 0.05, 'trim');
    const sy = holo(k, 0.0, 0.06);
    return { muzzle: [0, 0.018, -0.62], sightY: sy };
  },

  odin(k) {
    k.prof([[0.12, -0.04], [0.12, 0.065], [-0.34, 0.065], [-0.36, 0.03], [-0.36, -0.04]], 0.08, 'body');
    k.box(0.081, 0.005, 0.44, 'glow', 0, 0.03, -0.12);
    k.part('mag');
    k.box(0.1, 0.1, 0.14, 'trim', -0.008, -0.09, -0.14);
    k.teeth(4, -0.19, -0.09, 0.102, 0.004, 0.012, 'glow', -0.008, -0.05);
    k.part(null);
    k.cyl(0.04, 0.24, 'trim', 0, 0.016, -0.48, 20);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      k.cyl(0.0095, 0.34, 'metal', Math.cos(a) * 0.017, 0.016 + Math.sin(a) * 0.017, -0.52, 10);
    }
    k.cyl(0.041, 0.01, 'glow', 0, 0.016, -0.6, 20);
    k.cyl(0.03, 0.014, 'metal', 0, 0.016, -0.69, 14);
    k.part('lid', [0, 0.067, -0.01]);
    k.box(0.07, 0.008, 0.24, 'body', 0, 0.069, -0.13);
    k.box(0.018, 0.024, 0.2, 'metal', 0, 0.1, -0.12);
    k.box(0.014, 0.036, 0.014, 'metal', 0, 0.08, -0.2);
    k.box(0.014, 0.036, 0.014, 'metal', 0, 0.08, -0.04);
    k.part(null);
    charger(k, -0.26, 0.03, -0.044);
    k.box(0.034, 0.09, 0.04, 'grip', 0, -0.07, -0.32, 0.15);
    k.box(0.038, 0.1, 0.048, 'grip', 0, -0.07, 0.08, -0.26);
    k.box(0.028, 0.005, 0.05, 'metal', 0, -0.042, 0.04);
    k.prof([[0.12, 0.055], [0.32, 0.05], [0.33, -0.08], [0.28, -0.08], [0.16, -0.04], [0.12, -0.04]], 0.056, 'trim');
    const sy = holo(k, 0.0, 0.065);
    return { muzzle: [0, 0.016, -0.7], sightY: sy };
  },
};

// Left hand + sleeve parented to the mag (it carries the new mag in) and to the loose round (it presses each
// round in), hidden until a reload shows them.
function offHands(g, parts, mats) {
  const hands = [];
  g.updateMatrixWorld(true);
  const add = (group, gx, gy, gz, sleeveDir, sleeveRot = [0.75, sleeveDir[0] > 0 ? -0.45 : 0.45, 0]) => {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.065), mats.glove);
    glove.position.set(gx, gy, gz);
    glove.rotation.set(0.3, 0, -0.3);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.32), mats.sleeve);
    sleeve.position.set(gx + sleeveDir[0], gy + sleeveDir[1], gz + sleeveDir[2]);
    sleeve.rotation.set(...sleeveRot);
    const part = Object.keys(parts).find(n => parts[n] === group); // the reload can show each hand on its own
    for (const m of [glove, sleeve]) { m.visible = false; m.userData.part = part; group.add(m); hands.push(m); }
  };
  if (parts.mag) {
    const b = new THREE.Box3().setFromObject(parts.mag), c = b.getCenter(new THREE.Vector3());
    const o = parts.mag.position;
    add(parts.mag, c.x - o.x - 0.01, b.min.y - o.y - 0.012, c.z - o.z + 0.01, [-0.06, -0.12, 0.13]);
  }
  if (parts.shell) add(parts.shell, 0.014, -0.016, 0.04, [0.06, -0.12, 0.16]);
  if (parts.orb) add(parts.orb, -0.03, 0.022, 0.012, [-0.07, 0.04, 0.15]); // presses the fresh orb in from above-left
  if (parts.swipe) add(parts.swipe, -0.016, 0.01, 0.0, [-0.016, -0.165, 0.04], [1.32, 0, 0]); // Oathblade: runs along the blade, arm hanging below
  return hands;
}

// Hands holding an ability item (no gun): two gloved hands, the right one holding the item in the agent's
// colour. item: orb | flash | grenade | paintshell | device | grab (open hand) | none (running).
export function handsModel(color, item = 'orb') {
  const g = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x30363f, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 });
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(rx, ry, rz); g.add(b); return b; };
  const right = new THREE.Group(), left = new THREE.Group();
  g.add(right, left);
  const rb = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; right.add(b); return b; };
  rb(0.075, 0.075, 0.32, sleeve, 0.02, -0.06, 0.2, 0.35);
  rb(0.06, 0.05, 0.08, glove, 0.01, 0.0, 0.02, -0.1);
  const fingers = rb(0.06, 0.02, 0.06, glove, 0.01, item === 'grab' ? 0.04 : 0.03, -0.035, item === 'grab' ? -0.9 : 0.4);
  let thing = null;
  if (item === 'orb' || item === 'flash') {
    thing = new THREE.Mesh(new THREE.SphereGeometry(item === 'flash' ? 0.035 : 0.042, 16, 12), item === 'flash' ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.2 }) : glow);
    thing.position.set(0.01, 0.045, -0.03);
  } else if (item === 'grenade') {
    thing = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.04, 6, 10), shell);
    thing.position.set(0.01, 0.045, -0.03);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 16), glow); band.rotation.x = Math.PI / 2; thing.add(band);
  } else if (item === 'paintshell') {
    thing = paintShellModel(0.42);
    thing.position.set(0.01, 0.05, -0.03);
  } else if (item === 'device') {
    thing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.06), shell);
    thing.position.set(0.01, 0.045, -0.03);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.008, 0.04), glow); l.position.y = 0.012; thing.add(l);
  }
  if (item === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 24, Math.PI), shell);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2); bow.position.set(-0.08, 0.04, -0.06);
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.22), glow); arrow.position.set(-0.04, 0.04, -0.08);
    g.add(bow, arrow);
  }
  if (item === 'knife') {
    thing = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.16), glow);
    thing.position.set(0.01, 0.03, -0.09);
  }
  if (item === 'beam') {
    // Pointing: fist closed, index finger out, its tip lit (the beam starts there).
    fingers.rotation.x = 1.3; fingers.position.set(0.01, 0.0, -0.04);
    rb(0.016, 0.016, 0.075, glove, 0.03, 0.02, -0.09);
    thing = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 3 }));
    thing.position.set(0.03, 0.02, -0.13);
  }
  if (thing) right.add(thing);
  right.position.set(0.03, 0, 0);
  // left hand, slightly forward, for balance (and to pump while running)
  const lb = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; left.add(b); return b; };
  lb(0.075, 0.075, 0.32, sleeve, -0.02, -0.06, 0.2, 0.35);
  lb(0.06, 0.05, 0.08, glove, -0.01, 0.0, 0.02, -0.1);
  if (item === 'grab' || item === 'orb') { const aura = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), glow); aura.position.set(-0.01, 0.03, -0.03); left.add(aura); }
  left.position.set(-0.22, -0.01, 0.02);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.03, 0.05, -0.05);
  if (item === 'beam') { muzzle.position.set(0.03, 0.02, -0.13); right.add(muzzle); } else g.add(muzzle);
  g.userData = { muzzle, sightY: 0, parts: {}, hands: [], right, left, fingers, item };
  return g;
}

// Chamber's own guns: polished gold over black, whatever skin you run. Headhunter's windows glow ember
// orange, Tour de Force's barrel shroud glows violet.
const goldCache = new Map();
function goldMaterials(glowColor) {
  if (goldCache.has(glowColor)) return goldCache.get(glowColor);
  const base = skinMaterials('standard');
  const mats = {
    ...base,
    body: new THREE.MeshStandardMaterial({ color: 0xd9ad3c, roughness: 0.28, metalness: 0.95 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.45, metalness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8892a, roughness: 0.35, metalness: 0.9 }),
    grip: new THREE.MeshStandardMaterial({ color: glowColor === 0xff5a1f ? 0xece6da : 0x141416, roughness: 0.6, metalness: 0.1 }),
    glow: new THREE.MeshStandardMaterial({ color: glowColor, roughness: 0.3, metalness: 0.1, emissive: glowColor, emissiveIntensity: 1.6 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.05, metalness: 0.6, emissive: glowColor, emissiveIntensity: 0.3 }),
    reticle: new THREE.MeshBasicMaterial({ color: glowColor }),
  };
  mats.accent ||= mats.glow;
  mats.tube = mats.trim.clone(); mats.tube.side = THREE.DoubleSide;
  mats.tubeBody = mats.body.clone(); mats.tubeBody.side = THREE.DoubleSide;
  goldCache.set(glowColor, mats);
  return mats;
}
const OWN_LOOK = { headhunter: 0xff5a1f, tourdeforce: 0xb34dff };

// Blitz's gear, whatever skin you run: sunflower yellow and teal, splashed with hot-pink paint.
let razeMats = null;
function razeMaterials() {
  if (razeMats) return razeMats;
  const base = skinMaterials('standard');
  razeMats = {
    ...base,
    body: new THREE.MeshStandardMaterial({ color: 0xf2b630, roughness: 0.45, metalness: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x1f6f78, roughness: 0.5, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.35, metalness: 0.85 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.8, metalness: 0.1 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.4, metalness: 0.1, emissive: 0xff4fa3, emissiveIntensity: 0.8 }),
  };
  razeMats.tube = razeMats.trim.clone(); razeMats.tube.side = THREE.DoubleSide;
  razeMats.tubeBody = razeMats.body.clone(); razeMats.tubeBody.side = THREE.DoubleSide;
  return razeMats;
}

// A soft round glow texture (white centre fading to nothing), shared by every glow sprite.
let dotTex = null;
function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

// Finale's rocket in flight (world size, nose along +z so lookAt points it at the target).
export function rocketModel() {
  const m = razeMaterials(), g = new THREE.Group();
  const add = (geo, mat, z, rx = PI / 2) => { const o = new THREE.Mesh(geo, mat); o.rotation.x = rx; o.position.z = z; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 14), m.body, 0);
  add(new THREE.CylinderGeometry(0.077, 0.077, 0.08, 14), m.glow, 0.1);
  add(new THREE.CylinderGeometry(0.003, 0.075, 0.22, 14), m.glow, 0.36);                        // nose
  add(new THREE.CylinderGeometry(0.06, 0.045, 0.06, 12), m.metal, -0.28);                        // nozzle
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.14), m.trim);
    const a = i * PI / 2;
    f.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.2); f.rotation.z = a + PI / 2; g.add(f);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 10), new THREE.MeshBasicMaterial({ color: 0xffc061, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -PI / 2; flame.position.z = -0.46; g.add(flame);
  // A bright exhaust glow, so the rocket still reads when you see it from straight behind.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffb04a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.55, 0.55, 1); glow.position.z = -0.35; g.add(glow);
  g.scale.setScalar(1.5);
  g.userData.flame = flame;
  return g;
}

// Splatter (Paint Shells): a paint canister with four bomblets clipped round it. `scale` 1 is world size.
export function paintShellModel(scale = 1) {
  const m = razeMaterials(), g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 14), m.body); g.add(can);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.03, 14), m.trim); band.position.y = 0.035; g.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.03, 12), m.metal); cap.position.y = 0.09; g.add(cap);
  const pin = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), m.metal); pin.position.set(0.03, 0.11, 0); g.add(pin);
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4, b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), m.glow);
    b.position.set(Math.cos(a) * 0.065, -0.04, Math.sin(a) * 0.065); g.add(b);
  }
  const drip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.012), m.glow); drip.position.set(0, 0.0, 0.062); g.add(drip);
  g.scale.setScalar(scale);
  return g;
}

// One of Splatter's bomblets in flight.
export function bombletModel() {
  const m = razeMaterials(), g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m.glow));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), m.trim); ring.rotation.x = PI / 2; g.add(ring);
  return g;
}

// Builds the first-person model for a weapon in a skin. userData: muzzle (Object3D), sightY (top of the sight
// line in model units, before viewmodel scaling).
export function gunModel(weaponId, skinId = 'standard', { noHands = false } = {}) {
  const g = new THREE.Group();
  const mats = OWN_LOOK[weaponId] ? goldMaterials(OWN_LOOK[weaponId]) : weaponId === 'finale' ? razeMaterials() : skinMaterials(skinId);
  const k = kit(g, mats);
  const melee = MELEE[weaponId];
  if (melee) k.part('w', melee.pivot); // the whole weapon, so inspects can spin it in the hand
  const design = designFor(skinId, weaponId);
  const d = (DESIGNS[design] || DESIGNS[weaponId] || DESIGNS.classic)(k);
  k.part(null);
  // Hands
  if (noHands) { /* a gun lying on the floor */ } else if (!melee) {
    k.box(0.072, 0.072, 0.3, 'sleeve', 0.035, -0.09, 0.22, 0.3);
    k.box(0.05, 0.05, 0.07, 'glove', 0.01, -0.04, 0.045, -0.2);
  } else {
    k.box(0.072, 0.072, 0.3, 'sleeve', 0.02, -0.05, 0.24, 0.3);
    k.box(0.05, 0.055, 0.06, 'glove', 0, 0, 0.04);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...d.muzzle);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.sightY = d.sightY;
  g.userData.parts = k.parts;
  g.userData.design = DESIGNS[design] ? design : weaponId; // reloads and inspects follow the model, not just the weapon
  g.userData.hands = offHands(g, k.parts, mats);
  if (k.parts.shell) k.parts.shell.visible = false;
  return g;
}

// Give a model its own glow material, so an inspect can pulse it without lighting up everyone's copy.
// Returns the material and its painted intensity.
export function ownGlow(model, skinId) {
  const shared = skinMaterials(skinId).glow, mat = shared.clone();
  model.traverse(o => { if (o.material === shared) o.material = mat; });
  return { mat, base: shared.emissiveIntensity };
}

// Pose a melee model's parts (and glow) for an inspect at time t; with no inspect, back to rest.
export function poseMeleeParts(model, ins, t, glow) {
  const parts = model.userData.parts, p = ins ? inspectPose(ins, t) : null;
  for (const [name, part] of Object.entries(parts)) {
    const v = p?.parts[name], b = part.userData.base;
    part.rotation.order = 'ZYX'; // spins about the blade axis apply last, so twirls stay in the plane they're shown in
    part.position.set(b.pos.x + (v?.[0] || 0), b.pos.y + (v?.[1] || 0), b.pos.z + (v?.[2] || 0));
    part.rotation.set(b.rot.x + (v?.[3] || 0), b.rot.y + (v?.[4] || 0), b.rot.z + (v?.[5] || 0));
    part.scale.set(1, 1, v?.[6] ?? 1);
  }
  if (glow) {
    const k = p ? p.glow : 1;
    glow.mat.emissiveIntensity = glow.base * k + Math.max(0, k - 1) * 0.35; // a little light even on skins with no glow
  }
  return p;
}

// Soft studio reflections so metallic and glossy skins read as metal rather than flat dark grey.
const envCache = new WeakMap();
export function studioEnv(renderer) {
  if (envCache.has(renderer)) return envCache.get(renderer);
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = room.geometry.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / 5 + 1) / 2;
    cols.push(0.18 + t * 0.75, 0.2 + t * 0.75, 0.22 + t * 0.8);
  }
  room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  s.add(room);
  const panel = (x, y, z, w, h, c) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.lookAt(0, 0, 0); s.add(p);
  };
  panel(2, 3, 2, 3, 1.2, 0xffffff);
  panel(-3, 1, -1, 1.5, 3, 0xbfd8ff);
  panel(0, -1, 3.5, 4, 0.6, 0xfff0d8);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  envCache.set(renderer, tex);
  return tex;
}

// ---------- skin menu thumbnails ----------
// A side-on picture of a weapon in a skin (a data URL), drawn once per weapon and skin on a small renderer of its
// own and cached: the collection grid shows one per weapon.
let thumbKit = null;
const thumbCache = new Map();
export function gunThumb(weaponId, skinId) {
  const key = weaponId + '|' + skinId;
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (!thumbKit) {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(360, 120, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x30302c, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 1.5, 1); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 1.6); rim.position.set(-1.5, 0.6, -1); scene.add(rim);
    scene.environment = studioEnv(r);
    thumbKit = { r, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10) };
  }
  const { r, scene, cam } = thumbKit;
  const m = gunModel(weaponId, skinId, { noHands: true });
  for (const h of m.userData.hands || []) h.parent.remove(h); // hidden meshes still count toward the bounds
  if (m.userData.parts.shell) m.userData.parts.shell.parent.remove(m.userData.parts.shell);
  if (MELEE[weaponId]) m.children.filter(c => c.material === skinMaterials(skinId).sleeve || c.material === skinMaterials(skinId).glove).forEach(c => m.remove(c));
  m.rotation.set(0.05, PI / 2, MELEE[weaponId] ? -0.5 : 0, 'YXZ'); // muzzle to the left, as in the game's collection
  scene.add(m);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const aspect = 3, half = Math.max(size.x / 2 / aspect, size.y / 2) * 1.08;
  Object.assign(cam, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
  cam.position.set(c.x, c.y, c.z + 2);
  cam.lookAt(c);
  cam.updateProjectionMatrix();
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(m);
  m.traverse(o => o.geometry?.dispose());
  thumbCache.set(key, url);
  return url;
}
// A custom skin that is edited or deleted draws fresh pictures.
onSkinsChanged((id) => { for (const k of thumbCache.keys()) if (k.endsWith('|' + id)) thumbCache.delete(k); });

// ---------- skin menu preview ----------
export class GunPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 2, 0.05, 20);
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x30302c, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 1.5, 1); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 1.6); rim.position.set(-1.5, 0.6, -1); this.scene.add(rim);
    this.scene.environment = studioEnv(this.r);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.yaw = PI / 2; this.pitch = 0.12; this.t = 0; this.dragging = false; this.running = false;
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.lx = e.clientX; this.ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lx) * 0.01;
      this.pitch = Math.max(-0.8, Math.min(0.8, this.pitch + (e.clientY - this.ly) * 0.01));
      this.lx = e.clientX; this.ly = e.clientY;
    });
  }

  show(weaponId, skinId) {
    this.pivot.clear();
    this.anim = null;
    const m = gunModel(weaponId, skinId);
    this.model = m;
    this.glow = MELEE[weaponId] || MODEL_INSPECTS[m.userData.design] ? ownGlow(m, skinId) : null;
    // Drop the hands for the showcase.
    m.children.filter(c => c.material && (c.material === skinMaterials(skinId).sleeve || c.material === skinMaterials(skinId).glove)).forEach(c => m.remove(c));
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    m.position.sub(c);
    this.pivot.add(m);
    this.size = size;
  }

  // Play one of a melee type's inspects on the showcase model (parts, glow and a gentle turn).
  inspect(ins) {
    this.anim = { ins, start: performance.now() };
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = (t - last) / 1000; last = t;
      if (!this.dragging) this.t += dt;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (this.canvas.width !== Math.round(w * this.r.getPixelRatio())) this.r.setSize(w, h, false);
      this.cam.aspect = w / Math.max(1, h); this.cam.updateProjectionMatrix();
      // Side-on showcase with a slow sway; dragging turns it freely.
      this.pivot.rotation.set(this.pitch, this.yaw + Math.sin(this.t * 0.6) * 0.45, 0, 'YXZ');
      if (this.model && this.glow) {
        const a = this.anim, at = a && (t - a.start) / 1000;
        if (a && at > a.ins.dur) this.anim = null;
        const p = poseMeleeParts(this.model, this.anim?.ins, at, this.glow);
        if (p) { this.pivot.rotation.x += p.pose[3] * 0.4; this.pivot.rotation.z += p.pose[5] * 0.4; }
      }
      // Fit the gun's length across ~75% of the width (and its height in the frame).
      const s = this.size || new THREE.Vector3(0.3, 0.1, 0.8);
      const tv = Math.tan((this.cam.fov * PI) / 360), th = tv * this.cam.aspect;
      const dist = Math.max((s.z / 2) / (th * 0.75), (s.y / 2) / (tv * 0.7)) + s.x / 2;
      this.cam.position.set(0, 0, dist);
      this.cam.lookAt(0, 0, 0);
      this.r.render(this.scene, this.cam);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
}
