// Three.js scene: map, characters, first-person viewmodel and effects (tracers, impacts, flashes).
import * as THREE from '../vendor/three.module.min.js';
import { HFOV, VIEW_RECOIL, HITBOX, GUN_HEIGHT } from './config.js';
import { gunModel, handsModel, studioEnv } from './models.js';
import { skinFor, SKINS } from './skins.js';
import { reloadPose, CYCLE_STYLE } from './reloadanim.js';
import { BLADES, SMOKE, bloomTargets } from './abilities.js';
import { ROUND } from './rounds.js';
import { materialOf } from './map.js';
import { dirFromAngles } from './entity.js';

const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;

// Damped spring for physical recoil. kick(a) adds velocity so the peak displacement is about `a`.
class Spring {
  constructor(k, zeta) {
    this.k = k; this.c = 2 * Math.sqrt(k) * zeta; this.x = 0; this.v = 0;
    const w = Math.sqrt(k), wd = w * Math.sqrt(1 - zeta * zeta);
    // peak of an impulse response, x(t)=v0/wd*e^(-zeta*w*t)*sin(wd*t), at t=atan(wd/(zeta*w))/wd
    const tp = Math.atan2(wd, zeta * w) / wd;
    this.gain = wd / Math.exp(-zeta * w * tp) / Math.sin(wd * tp);
  }
  kick(a) { this.v += a * this.gain; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (-this.k * this.x - this.c * this.v) * h; this.x += this.v * h; }
  }
  reset() { this.x = this.v = 0; }
}

// How hard each gun shoves the view and the gun model. back: metres the model slides back. rot: radians
// the muzzle flips up. roll: random wrist roll. cam: degrees of camera punch (visual only, springs back;
// bullets still follow the spray pattern). camRoll: degrees of camera roll. shake: high-frequency jolt.
// k / z: spring stiffness and damping; lower k feels heavier and slower to settle.
const FEEL_BY_CAT = {
  Sidearm: { back: 0.045, rot: 0.11, roll: 0.06, cam: 0.35, camRoll: 0.35, shake: 0, k: 240, z: 0.55 },
  SMG: { back: 0.022, rot: 0.045, roll: 0.05, cam: 0.16, camRoll: 0.25, shake: 0.05, k: 340, z: 0.6 },
  Rifle: { back: 0.032, rot: 0.06, roll: 0.05, cam: 0.26, camRoll: 0.3, shake: 0.08, k: 280, z: 0.6 },
  Shotgun: { back: 0.09, rot: 0.3, roll: 0.14, cam: 1.4, camRoll: 1.3, shake: 0.45, k: 150, z: 0.5 },
  Sniper: { back: 0.12, rot: 0.34, roll: 0.1, cam: 2.0, camRoll: 1.5, shake: 0.55, k: 120, z: 0.5 },
  Heavy: { back: 0.028, rot: 0.04, roll: 0.04, cam: 0.2, camRoll: 0.25, shake: 0.18, k: 320, z: 0.62 },
};
const FEEL_BY_ID = {
  sheriff: { back: 0.085, rot: 0.3, roll: 0.1, cam: 1.0, camRoll: 1.0, shake: 0.3, k: 170, z: 0.5 },
  shorty: { back: 0.08, rot: 0.28, roll: 0.14, cam: 1.2, camRoll: 1.2, shake: 0.4, k: 160, z: 0.5 },
  guardian: { back: 0.05, rot: 0.13, roll: 0.06, cam: 0.6, camRoll: 0.5, shake: 0.15, k: 210, z: 0.55 },
  warden: { back: 0.048, rot: 0.12, roll: 0.06, cam: 0.55, camRoll: 0.45, shake: 0.15, k: 220, z: 0.55 },
  marshal: { back: 0.09, rot: 0.24, roll: 0.08, cam: 1.4, camRoll: 1.1, shake: 0.35, k: 150, z: 0.52 },
  operator: { back: 0.16, rot: 0.45, roll: 0.12, cam: 2.8, camRoll: 2.0, shake: 0.8, k: 100, z: 0.48 },
  vandal: { back: 0.036, rot: 0.07, roll: 0.05, cam: 0.3, camRoll: 0.32, shake: 0.1, k: 270, z: 0.6 },
  phantom: { back: 0.028, rot: 0.05, roll: 0.04, cam: 0.22, camRoll: 0.26, shake: 0.06, k: 300, z: 0.62 },
};
const feelFor = (def) => FEEL_BY_ID[def.id] || FEEL_BY_CAT[def.cat] || FEEL_BY_CAT.Rifle;

// A surface texture: base colour, a little noise, then the pattern's lines in the two line colours.
function gridTexture(renderer, [base, major, minor], crate = false, pattern = 'grid', noise = 1) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  // subtle noise so surfaces read as surfaces
  for (let i = 0; i < 1400 * noise; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  if (pattern === 'brick') {
    g.fillStyle = major;
    for (let r = 0; r < 8; r++) { g.fillRect(0, r * 32, s, 3); for (let c = 0; c < 4; c++) g.fillRect(((c * 64) + (r % 2) * 32) % s, r * 32, 3, 32); }
  } else if (pattern === 'plank') {
    g.fillStyle = major;
    for (let r = 0; r < 8; r++) { g.fillRect(0, r * 32, s, 2); g.fillRect(((r * 97) % s), r * 32, 2, 32); }
  } else if (pattern === 'panel') {
    g.fillStyle = major; g.fillRect(0, 0, 3, s); g.fillRect(0, 0, s, 3);
    g.fillStyle = minor; g.fillRect(0, s / 2, s, 2);
  } else if (pattern === 'tile') {
    g.fillStyle = major;
    for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 2, s); g.fillRect(0, i * 64, s, 2); }
  } else if (pattern === 'diamond') {
    g.fillStyle = major;
    for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 * 8; x < s; x += 16) { g.save(); g.translate(x, y); g.rotate(0.6); g.fillRect(-4, -1, 8, 2); g.restore(); }
  } else if (pattern === 'grate') {
    g.fillStyle = major;
    for (let i = 0; i < s; i += 12) { g.fillRect(i, 0, 3, s); g.fillRect(0, i, s, 3); }
  } else if (pattern !== 'none') {
    g.fillStyle = minor;
    g.fillRect(s / 2 - 1, 0, 2, s);
    g.fillRect(0, s / 2 - 1, s, 2);
    g.fillStyle = major;
    g.fillRect(0, 0, 4, s);
    g.fillRect(0, 0, s, 4);
  }
  if (crate) {
    g.strokeStyle = major;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// One merged geometry per material. UVs come from world position so the 1 m grid lines up everywhere.
function boxesGeometry(boxes, texMeters) {
  const pos = [], nor = [], uv = [], idx = [];
  const faces = [
    [0, 1, [2, 1]], [0, -1, [2, 1]], [1, 1, [0, 2]], [1, -1, [0, 2]], [2, 1, [0, 1]], [2, -1, [0, 1]],
  ];
  for (const b of boxes) {
    for (const [axis, sign, [ua, va]] of faces) {
      const base = pos.length / 3;
      const fixed = sign > 0 ? b.max[axis] : b.min[axis];
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const [cu, cv] of corners) {
        const p = [0, 0, 0];
        p[axis] = fixed;
        p[ua] = cu ? b.max[ua] : b.min[ua];
        p[va] = cv ? b.max[va] : b.min[va];
        pos.push(...p);
        const n = [0, 0, 0]; n[axis] = sign; nor.push(...n);
        uv.push(p[ua] / texMeters, p[va] / texMeters);
      }
      // Counter-clockwise seen from outside. (x,y) is a right-handed pair around z; (z,y) and (x,z) are not.
      const hand = axis === 2 ? 1 : -1;
      if (hand * sign > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = 'bold 200px Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  gr.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// First-person gun models, built from boxes. The muzzle object marks where flashes and tracers start.
const VM_SCALE = 0.8;
// Hip and aim-down-sights positions (camera space) by weapon class. ADS height is worked out per gun from its
// model's sight line (see updateCamera); the shotgun and knife keep the fixed pose here.
const VM_POSE = {
  knife: { hip: [0.17, -0.17, -0.34], ads: [0.17, -0.17, -0.34] },
  blades: { hip: [0.12, -0.12, -0.3], ads: [0.12, -0.12, -0.3] },
  hands: { hip: [0.13, -0.13, -0.3], ads: [0.13, -0.13, -0.3] },
  pistol: { hip: [0.15, -0.14, -0.34], ads: [0, -0.047, -0.3] },
  revolver: { hip: [0.15, -0.14, -0.34], ads: [0, -0.05, -0.31] },
  smg: { hip: [0.16, -0.15, -0.34], ads: [0, -0.049, -0.32] },
  rifle: { hip: [0.16, -0.15, -0.34], ads: [0, -0.061, -0.33] },
  dmr: { hip: [0.16, -0.15, -0.34], ads: [0, -0.073, -0.33] },
  sniper: { hip: [0.16, -0.15, -0.34], ads: [0, -0.08, -0.24] },
  shotgun: { hip: [0.16, -0.15, -0.34], ads: [0.1, -0.13, -0.3] },
  heavy: { hip: [0.17, -0.14, -0.35], ads: [0, -0.069, -0.34] },
};

// Inspect keyframes: [time s, px, py, pz, rx, ry, rz] offsets added to the viewmodel's resting pose.
const INSPECT = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.45, -0.1, 0.05, -0.05, 0.1, 1.2, -0.25],
  [1.5, -0.1, 0.06, -0.05, 0.16, 1.32, -0.3],
  [2.0, -0.05, 0.09, -0.12, 0.08, 0.35, 0.8],
  [2.8, -0.05, 0.08, -0.12, 0.1, 0.3, 0.75],
  [3.3, 0, 0, 0, 0, 0, 0],
];

export class Renderer {
  constructor(canvas, game, settings) {
    this.game = game;
    this.settings = settings;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.autoClear = false;
    r.shadowMap.enabled = settings.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9c2d8);
    this.scene.fog = new THREE.Fog(0xa9c2d8, 90, 220);
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.04, 400);
    this.camera.rotation.order = 'YXZ';

    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 5);
    this.vmScene.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a3530, 1.6));
    const vmSun = new THREE.DirectionalLight(0xffffff, 1.4);
    vmSun.position.set(0.5, 1, 0.3);
    this.vmScene.add(vmSun);
    this.vmScene.environment = studioEnv(r);

    this.buildWorld();
    this.characters = new Map();
    this.fx = { tracers: [], decals: [], flashes: [], particles: [], dmg: [] };
    this.buildFx();

    this.vm = { group: new THREE.Group(), model: null, kind: null, swayX: 0, swayY: 0, bob: 0, equipStart: -10, equipDur: 1, flashUntil: 0, swingStart: -10, swingHeavy: false };
    this.vmScene.add(this.vm.group);
    this.recoil = { feel: null };
    this.shake = 0;
    this.shakeP = 0;
    this.shakeY = 0;
    this.fovZoom = 1;
    this.deathCam = null;

    this.resize();
    addEventListener('resize', () => this.resize());
    this.hookEvents();
  }

  buildWorld() {
    // Everything that belongs to the map lives in one group, rebuilt when the map changes.
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const wg = this.worldGroup = new THREE.Group();
    this.scene.add(wg);
    const map = this.game.map;
    const ext = Math.max(map.W, map.H) * 1.1 + 6; // half-size of the map in metres, plus a margin
    const env = map.env;
    const sun = new THREE.DirectionalLight(env.sun.color, env.sun.intensity);
    sun.position.set(...env.sun.from);
    sun.castShadow = env.sun.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    wg.add(sun);
    wg.add(new THREE.HemisphereLight(env.ambient.sky, env.ambient.ground, env.ambient.intensity));
    for (const l of env.lights) { // lamps placed by the map (no shadows, to stay cheap)
      const pl = new THREE.PointLight(l.color, l.intensity, l.range, 2);
      pl.position.set(...l.at);
      wg.add(pl);
    }
    this.nearFog = null;
    this.shadowSight = null; // the materials it tinted belonged to the old map
    this.scene.background = new THREE.Color(env.sky);
    this.scene.fog = env.fog ? new THREE.Fog(env.fog.color, env.fog.near, env.fog.far) : null;

    const byMat = {};
    for (const b of this.game.map.boxes) if (!b.hidden) (byMat[b.mat] ||= []).push(b);
    for (const b of this.game.map.floorSkins || []) if (!b.hidden) (byMat[b.mat] ||= []).push(b); // visual-only surfaces (street-level floors, boxes you walk through)
    this.mapMaterials = [];
    for (const [mat, list] of Object.entries(byMat)) {
      const d = materialOf(map, mat);
      const tex = gridTexture(this.renderer, d.colors, d.crossed, d.pattern, d.noise);
      const opts = { map: tex };
      if (d.glow) Object.assign(opts, { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: d.glow }); // e.g. ceilings: undersides only get bounce light
      if (d.opacity < 1) Object.assign(opts, { transparent: true, opacity: d.opacity, depthWrite: false });
      const material = new THREE.MeshLambertMaterial(opts);
      const mesh = new THREE.Mesh(boxesGeometry(list, d.tileSize), material);
      mesh.castShadow = d.castShadows && d.opacity === 1;
      mesh.receiveShadow = true;
      wg.add(mesh);
      this.mapMaterials.push(material);
    }
    // Decoration (visual only): one merged mesh per colour; glowing ones unlit.
    const byCol = {};
    for (const d of map.decor || []) (byCol[d.color + (d.glow ? 'g' : '')] ||= { color: d.color, glow: d.glow, list: [] }).list.push(d);
    for (const { color, glow, list } of Object.values(byCol)) {
      const mat = glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(boxesGeometry(list, 1), mat);
      mesh.castShadow = !glow; mesh.receiveShadow = true;
      wg.add(mesh);
    }
    // Trees behind the walls: a trunk and a few overlapping canopy blobs.
    if (map.trees?.length) {
      const trunkMats = {};
      const canopyMats = {};
      const blob = new THREE.IcosahedronGeometry(1, 1);
      for (const t of map.trees) {
        const tc = t.trunk ?? 0x5a4030;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, t.y, 6), trunkMats[tc] ||= new THREE.MeshLambertMaterial({ color: tc }));
        trunk.position.set(t.x, t.y / 2, t.z);
        wg.add(trunk);
        const m = canopyMats[t.color] ||= new THREE.MeshLambertMaterial({ color: t.color, flatShading: true });
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(blob, m);
          const a = i * 2.1;
          c.position.set(t.x + Math.cos(a) * t.r * 0.45, t.y + 0.4 + (i % 2) * 0.6, t.z + Math.sin(a) * t.r * 0.45);
          c.scale.setScalar(t.r * (0.75 + 0.1 * i));
          c.castShadow = true;
          wg.add(c);
        }
      }
    }
    for (const l of (map.groundLabels ? map.labels : [])) { // area names live on the minimap now
      const k = l.size || 1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6 * k, 3 * k), new THREE.MeshBasicMaterial({ map: labelTexture(l.text), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(l.x, (l.y ?? 0) + 0.02, l.z);
      wg.add(m);
    }
    // Spike sites: a tinted plant zone on the floor with an outline.
    for (const s of Object.values(map.sites || {})) {
      const w = s.max[0] - s.min[0], d = s.max[2] - s.min[2];
      const color = s.color ?? map.siteColor ?? 0xffd54a, y = s.center?.[1] ?? 0;
      const zone = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2; zone.position.set(s.min[0] + w / 2, y + 0.015, s.min[2] + d / 2);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
      edge.position.set(s.min[0] + w / 2, y + 0.02, s.min[2] + d / 2);
      wg.add(zone, edge);
    }
    // Ropes
    for (const r of map.ropes || []) {
      const len = r.top - r.bottom + 1.2;
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), new THREE.MeshLambertMaterial({ color: r.color ?? 0xc9a56a }));
      rope.position.set(r.x + r.toward[0] * 0.25, r.bottom + len / 2, r.z + r.toward[1] * 0.25);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0x5d6670 }));
      bar.position.set(rope.position.x, r.bottom + len, rope.position.z);
      bar.rotation.y = Math.atan2(r.toward[0], r.toward[1]) + Math.PI / 2;
      wg.add(rope, bar);
    }
    // Signs: emissive coloured panels with a darker frame and a few "character" bars.
    for (const pr of map.props || []) {
      if (pr.type !== 'sign') continue;
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(pr.w + 0.12, pr.h + 0.12, 0.06), new THREE.MeshLambertMaterial({ color: pr.frame ?? 0x2b2f36 }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(pr.w, pr.h), new THREE.MeshBasicMaterial({ color: pr.color }));
      face.position.z = 0.035;
      g.add(frame, face);
      const vertical = pr.h > pr.w;
      for (let i = 0; i < (pr.marks === false ? 0 : 3); i++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? pr.w * 0.5 : pr.w * 0.18, vertical ? pr.h * 0.16 : pr.h * 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        bar.position.set(vertical ? 0 : (i - 1) * pr.w * 0.28, vertical ? (1 - i) * pr.h * 0.27 : 0, 0.04);
        g.add(bar);
      }
      g.position.set(...pr.pos);
      g.rotation.y = Math.atan2(pr.n[0], pr.n[1]);
      wg.add(g);
    }
  }

  buildFx() {
    // Tracers: one line-segment buffer with per-vertex alpha.
    const N = 96;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 8), 4).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.tracerLines.frustumCulled = false;
    this.scene.add(this.tracerLines);
    this.tracerSlots = Array.from({ length: N }, () => ({ t: -10, from: new THREE.Vector3(), to: new THREE.Vector3(), color: [1, 0.85, 0.5] }));
    this.tracerNext = 0;

    // Bullet holes
    const DN = 600;
    this.decalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x15171a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), DN);
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < DN; i++) this.decalMesh.setMatrixAt(i, zero);
    this.decalMesh.frustumCulled = false;
    this.scene.add(this.decalMesh);
    this.decalTimes = new Float32Array(DN).fill(-1);
    this.decalNext = 0;

    const ftex = flashTexture();
    this.flashTex = ftex;
    this.flashMat = new THREE.SpriteMaterial({ map: ftex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashPool = Array.from({ length: 16 }, () => { const s = new THREE.Sprite(this.flashMat); s.visible = false; this.scene.add(s); return { s, until: 0 }; });
    this.vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    this.vmFlash.visible = false;

    // Hit sparks
    const PN = 300;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PN * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PN * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, vertexColors: true }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.sparkData = Array.from({ length: PN }, () => ({ life: 0, p: [0, -100, 0], v: [0, 0, 0] }));
    this.sparkNext = 0;
  }

  hookEvents() {
    const g = this.game;
    g.on('tracer', ({ who, gun, from, to, device }) => {
      const own = who === g.player;
      if (gun.def.melee) return;
      if (!own && gun.def.suppressed) return; // suppressed guns hide tracers from others
      const slot = this.tracerSlots[this.tracerNext];
      this.tracerNext = (this.tracerNext + 1) % this.tracerSlots.length;
      slot.t = performance.now();
      if (device) {
        slot.from.set(from[0], from[1], from[2]); // turret: from its own barrel
      } else if (own) {
        // Start at the viewmodel muzzle, converted to world space.
        slot.from.set(0.11, -0.1, -0.6).applyMatrix4(this.camera.matrixWorld);
      } else {
        slot.from.copy(this.characterMuzzle(who));
      }
      slot.to.set(to[0], to[1], to[2]);
      slot.color = gun.def === BLADES ? [0.55, 0.95, 1] : own ? [1, 0.9, 0.6] : [1, 0.55, 0.4];
    });
    g.on('impact', ({ point, normal, melee }) => {
      if (!this.settings.showImpacts || melee) return;
      this.addDecal(point, normal);
      this.burst(point, normal, [0.35, 0.33, 0.3], 3, 1.5);
    });
    g.on('hit', ({ target, part, point, attacker }) => {
      const col = part === 'head' ? [1, 1, 1] : [0.85, 0.1, 0.15];
      this.burst(point, null, col, part === 'head' ? 10 : 6, 2.5);
      const ch = this.characters.get(target);
      if (ch) ch.flash = performance.now();
    });
    g.on('shot', ({ who, gun }) => {
      if (who === g.player) {
        this.recoilKick(gun);
        if (CYCLE_STYLE[gun.def.id]) this.cycle = { start: g.time, dur: (1 / gun.rate()) * 0.85 };
        this.vm.flashUntil = performance.now() + (gun.def.suppressed ? 25 : 40);
        this.vmFlashScale = gun.def.suppressed ? 0.06 : 0.12;
      } else if (!gun.def.suppressed) {
        const f = this.flashPool.find(x => x.until < performance.now()) || this.flashPool[0];
        f.s.position.copy(this.characterMuzzle(who));
        f.s.scale.setScalar(0.45);
        f.s.visible = true;
        f.until = performance.now() + 45;
      }
    });
    g.on('swing', ({ who, heavy }) => {
      if (who === g.player) { this.vm.swingStart = performance.now(); this.vm.swingHeavy = heavy; }
    });
    g.on('equip', ({ who, gun }) => {
      if (who === g.player) { this.vm.equipStart = performance.now(); this.vm.equipDur = gun.def.equip * 1000; this.resetRecoil(); this.cycle = null; }
    });
    g.on('kill', ({ victim, killer }) => {
      const ch = this.characters.get(victim);
      if (ch) ch.deathT = performance.now();
      if (victim === g.player) this.deathCam = { killer, yaw: g.player.yaw, pitch: g.player.pitch, t: performance.now() };
    });
    g.on('respawn', ({ who }) => {
      const ch = this.characters.get(who);
      if (ch) { ch.deathT = 0; ch.group.visible = true; ch.group.rotation.set(0, 0, 0); }
      if (who === g.player) { this.deathCam = null; this.resetRecoil(); }
    });
    g.on('start', () => { this.syncCharacters(); this.clearSmokes(); this.clearDecals(); });
    g.on('roster', () => this.syncCharacters()); // online players joining or leaving
    g.on('map', () => { this.buildWorld(); this.setShadows(this.settings.shadows); });
    g.on('roundClear', () => { this.clearSmokes(); this.clearDecals(); this.deathCam = null; });
    g.on('barriers', ({ boxes }) => this.showBarriers(boxes));
    g.on('smoke', (s) => this.addSmoke(s));
    g.on('zone', (z) => this.fxZone(z));
    g.on('flash', ({ pos }) => this.fxBurst(pos, 0xffffff, 3.5, 0.35, true));
    g.on('pulse', ({ pos, r, color }) => this.fxRing(pos, r, color, 0.7));
    g.on('lockdown', ({ zone }) => this.fxRing(zone.pos, zone.r, 0x4fd1a5, 0.9));
    g.on('trap', ({ zone }) => this.fxRing(zone.pos, 4, 0x4fd1a5, 0.5));
    g.on('throw', (t) => this.fxThrow(t));
    g.on('wall', (w) => this.fxWall(w));
    g.on('drop', (d) => this.fxDrop(d));
    g.on('device', (d) => this.fxDevice(d));
    g.on('quakeLine', (q) => this.fxQuake(q));
    g.on('orb', ({ kit, orb }) => { if (orb) this.fxOrb(orb); });
    g.on('beam', (b) => this.fxBeam(b));
    g.on('tag', ({ pos }) => this.fxRing(pos, 0.8, 0xff3344, 0.4));
    g.on('ability', ({ who, type, pos, kit }) => {
      if (type === 'step') { const t = this.game.time + 1; this.fxMarker(pos, 0xa67bff, () => t); }
      if (type === 'rebirth') this.fxMarker(pos, 0xff7a3d, () => (kit.rebirth ? Infinity : 0));
      if (type === 'rekindled') this.fxBurst(who.eye(), 0xff7a3d, 2.5, 0.5);
    });
    g.on('teleport', ({ from, to }) => { this.fxBurst([from[0], from[1] + 1, from[2]], 0xa67bff, 1.2, 0.4); this.fxBurst([to[0], to[1] + 1, to[2]], 0xa67bff, 1.2, 0.4); });
    g.on('blade', ({ who }) => { if (who === g.player) { this.vm.swingStart = performance.now(); this.vm.swingHeavy = false; } });
    g.on('ability', ({ who, type }) => {
      if (who !== g.player) return;
      if (type === 'ult') { this.vm.equipStart = performance.now(); this.vm.equipDur = 350; }
      if (type === 'lift') this.shake = Math.min(1.5, this.shake + 0.4);
    });
  }

  // Springs are rebuilt when the gun changes so each weapon keeps its own weight.
  springsFor(def) {
    const f = feelFor(def), r = this.recoil;
    if (r.feel === f) return r;
    const vm = (k) => new Spring(f.k * k, f.z);
    const cam = (k) => new Spring(f.k * k, Math.min(0.9, f.z + 0.1));
    Object.assign(r, {
      feel: f,
      back: vm(1), up: vm(0.9), pitch: vm(0.85), yaw: vm(0.8), roll: vm(0.7),
      camP: cam(0.9), camY: cam(0.8), camR: cam(0.7),
    });
    return r;
  }

  resetRecoil() {
    const r = this.recoil;
    for (const k of ['back', 'up', 'pitch', 'yaw', 'roll', 'camP', 'camY', 'camR']) r[k]?.reset();
    this.shake = 0;
  }

  recoilKick(gun) {
    const r = this.springsFor(gun.def), f = r.feel;
    const m = this.settings.recoilFeel ?? 1;
    if (m <= 0) return;
    const ads = gun.adsT;
    const vmM = m * (1 - 0.45 * ads); // braced against the shoulder: the model moves less when aiming
    const camM = m * (1 - 0.25 * ads);
    const rnd = () => Math.random() * 2 - 1;
    // The gun leans the way this shot's pattern pulls (positive side = left = +yaw).
    const side = gun.lastKick?.side || 0;
    const dir = Math.abs(side) > 0.01 ? Math.sign(side) : rnd();
    const hard = Math.min(2, Math.max(0.6, (gun.lastKick?.up || 0.3) / 0.5)); // bigger kicks in the pattern shove harder
    const vmK = vmM * (0.85 + 0.15 * hard);
    r.back.kick(f.back * vmK * (0.9 + 0.2 * Math.random()));
    r.up.kick(f.back * 0.25 * vmK);
    r.pitch.kick(f.rot * vmK * (0.85 + 0.3 * Math.random()));
    r.yaw.kick(f.rot * 0.3 * vmK * (0.6 * dir + 0.4 * rnd()));
    r.roll.kick(f.roll * vmK * (0.5 * dir + 0.5 * rnd()));
    r.camP.kick(f.cam * DEG * camM * (0.85 + 0.3 * Math.random()));
    r.camY.kick(f.cam * 0.35 * DEG * camM * (0.7 * dir + 0.3 * rnd()));
    r.camR.kick(f.camRoll * DEG * camM * (0.6 * dir + 0.4 * rnd()));
    this.shake = Math.min(1.5, this.shake + f.shake * camM);
  }

  // Smoke clouds: a few overlapping soft spheres that swell in and thin out at the end.
  addSmoke(s) {
    if (!this.smokeMat) {
      this.smokeMat = new THREE.MeshLambertMaterial({ color: 0xd8e3ec, emissive: 0x56626e, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
      this.smokeGeo = new THREE.SphereGeometry(1, 28, 18);
      this.smokes = [];
    }
    const group = new THREE.Group();
    const mat = this.smokeMat.clone();
    const R = s.radius || SMOKE.radius, fire = s.kind === 'fire';
    mat.color.set(s.color || 0xd8e3ec);
    if (fire) { mat.color.set(0xff6a1a); mat.emissive.set(0xc23a08); mat.emissiveIntensity = 0.8; }
    if (s.kind === 'gas') { mat.color.set(s.color); mat.emissive.set(0x1d4a24); }
    if (s.kind === 'water' || s.kind === 'cove') { mat.color.set(0x5fd6c8); mat.emissive.set(0x0f5c63); mat.emissiveIntensity = 0.6; }
    if (s.kind === 'lane') { mat.color.set(0x8fd8ff); mat.emissive.set(0x1a6db0); mat.emissiveIntensity = 0.9; }
    else if (s.color && s.color !== 0xcfdbe6) mat.emissive.set(new THREE.Color(s.color).multiplyScalar(0.35));
    if (s.slab) {
      // Thin, tall sheet (fire wall, water wall, gas wall, static lane): a slab with a rippling inner layer.
      const { dir, len, th, h } = s.slab;
      mat.side = THREE.DoubleSide;
      const outer = new THREE.Mesh(new THREE.BoxGeometry(len, h, th), mat);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, h * 0.94, th * 0.4), mat.clone());
      inner.material.emissiveIntensity = (mat.emissiveIntensity || 0.5) * 1.6;
      group.add(outer, inner);
      group.rotation.y = Math.atan2(-dir[1], dir[0]);
      group.userData.slab = inner;
      group.position.set(...s.pos);
      this.scene.add(group);
      this.smokes.push({ s, group, mat, fire, slab: true });
      return;
    }
    const puffs = [[0, 0, 0, 1], [0.42, 0.22, 0.2, 0.72], [-0.38, 0.28, -0.22, 0.74], [0.15, -0.3, -0.38, 0.68], [-0.2, -0.28, 0.42, 0.7], [0.08, 0.46, 0.05, 0.62], [0.5, -0.1, -0.3, 0.55], [-0.5, -0.05, 0.25, 0.55]];
    // Inner shell: shown instead of the puffs while the camera is inside, so the inside of the smoke reads as a
    // clear pocket walled off by the cloud (as in the real game) rather than a solid wall of fog.
    const shellMat = mat.clone(); shellMat.side = THREE.BackSide;
    const shell = new THREE.Mesh(this.smokeGeo, shellMat);
    shell.scale.setScalar(R * 0.98); shell.visible = false; shell.userData.shell = true; shell.userData.spin = 0; shell.frustumCulled = false; shell.renderOrder = 2;
    group.add(shell); group.userData.shell = shell;
    for (const [x, y, z, r] of puffs) {
      const m = new THREE.Mesh(this.smokeGeo, mat);
      m.position.set(x * R, y * R * (fire ? 0.7 : 1), z * R);
      m.scale.set(r * R, r * R * (fire ? 1.3 : 1), r * R);
      m.userData.spin = (Math.random() - 0.5) * 0.4;
      group.add(m);
    }
    group.position.set(...s.pos);
    this.scene.add(group);
    this.smokes.push({ s, group, mat, fire });
  }

  // ---------- ability effects ----------
  // A dropped gun: arcs from the hand (or the body) to the floor, then lies on its side, slowly glinting.
  fxDrop(d) {
    const skin = d.by !== this.game.player && d.skin && SKINS[d.skin] ? d.skin : this.skinOf(d.by, d.gun.def.id);
    const m = gunModel(d.gun.def.id, skin, { noHands: true });
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    if (m.userData.hands) for (const h of m.userData.hands) h.visible = false;
    const g = new THREE.Group();
    g.add(m);
    m.rotation.set(0, 0, Math.PI / 2); // on its side
    m.scale.setScalar(1.25);
    m.position.y = 0.05;
    const t0 = this.game.time, fall = 0.45;
    this.fxAdd(g, () => (this.game.drops.includes(d) ? Infinity : 0), (now) => {
      const k = Math.min(1, (now - t0) / fall);
      const arc = Math.sin(k * Math.PI) * 0.35 * (1 - k);
      g.position.set(lerp(d.from[0], d.pos[0], k), lerp(d.from[1], d.pos[1], k * k) + arc, lerp(d.from[2], d.pos[2], k));
      g.rotation.set(0, d.yaw + (1 - k) * 2.5, 0);
    });
  }

  fxAdd(obj, until, update) {
    (this.fx2 ||= []).push({ obj, until, update });
    this.scene.add(obj);
  }

  updateFx2() {
    if (!this.fx2?.length) return;
    const now = this.game.time;
    this.fx2 = this.fx2.filter(f => {
      const until = typeof f.until === 'function' ? f.until() : f.until;
      if (now >= until) { this.scene.remove(f.obj); return false; }
      if (f.update) f.update(now);
      return true;
    });
  }

  clearFx2() {
    for (const f of this.fx2 || []) this.scene.remove(f.obj);
    this.fx2 = [];
  }

  // Ground disc + rim for fire pools, traps and lockdown.
  fxZone(z) {
    const col = z.color || (z.kind === 'fire' ? 0xff6a1a : 0x4fd1a5);
    const flames = z.kind === 'fire' && !z.gas && !z.acid && !z.color;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(z.r, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: z.gas ? 0.15 : z.kind === 'fire' ? 0.5 : 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.RingGeometry(z.r * 0.94, z.r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2;
    g.add(disc, rim);
    if (z.orbital) {
      // Orbital strike: a column of light from the sky, thin while charging, full once it lands.
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, 40, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 20;
      beam.userData.orbital = true;
      g.add(beam);
    }
    if (flames || z.orbital) {
      // a few flickering flame tongues
      const fm = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
      const n = Math.max(3, Math.round(z.r * 3));
      for (let i = 0; i < n; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 6), fm);
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r * 0.85;
        f.position.set(Math.cos(a) * d, 0.45, Math.sin(a) * d);
        f.userData.ph = Math.random() * 6;
        g.add(f);
      }
    }
    g.position.set(z.pos[0], z.pos[1] + 0.03, z.pos[2]);
    this.fxAdd(g, () => z.until, (now) => {
      const age = now - z.born;
      g.scale.setScalar(Math.min(1, age / 0.25));
      if (z.kind === 'lockdown') { rim.material.opacity = 0.4 + 0.4 * Math.abs(Math.sin(now * 6)); disc.material.opacity = 0.08 + 0.1 * Math.min(1, age / 2.5); }
      if (z.kind === 'trap') rim.material.opacity = 0.35 + 0.25 * Math.sin(now * 3);
      if (z.kind === 'stim') { rim.material.opacity = 0.5 + 0.3 * Math.sin(now * 4); disc.material.opacity = 0.1; }
      if (z.orbital) {
        const armed = !z.armAt || now >= z.armAt;
        for (const c of g.children) { if (c.userData.orbital) { c.scale.x = c.scale.z = armed ? 1 : 0.15 + 0.1 * Math.sin(now * 20); c.material.opacity = armed ? 0.45 : 0.3; } else if (c.userData.ph != null) c.visible = armed; }
        disc.material.opacity = armed ? 0.5 : 0.15;
      }
      for (const c of g.children) if (c.userData.ph != null) c.scale.y = 0.6 + 0.5 * Math.abs(Math.sin(now * 9 + c.userData.ph));
    });
  }

  // A bright pop (flash, teleport).
  fxBurst(pos, color, size, life, flare = false) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, depthTest: !flare }));
    m.position.set(...pos);
    const t0 = this.game.time;
    this.fxAdd(m, t0 + life, (now) => {
      const k = (now - t0) / life;
      m.scale.setScalar(size * (0.4 + k * 1.2));
      m.material.opacity = 1 - k;
    });
  }

  // An expanding ring (pulses, sonar, stun, lockdown).
  fxRing(pos, r, color, life) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, wireframe: r > 15 }));
    m.position.set(...pos);
    const t0 = this.game.time;
    this.fxAdd(m, t0 + life, (now) => {
      const k = (now - t0) / life;
      m.scale.setScalar(Math.max(0.01, r * (0.2 + 0.8 * Math.sqrt(k))));
      m.material.opacity = 0.35 * (1 - k);
    });
  }

  // A thrown projectile flying from `from` to `to` in `time` seconds, with a little arc.
  fxThrow({ from, to, via, time, color, wave }) {
    const m = wave
      ? new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
      : new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color }));
    if (wave) m.lookAt(to[0] - from[0], 0, to[2] - from[2]);
    const t0 = this.game.time;
    const d = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    this.fxAdd(m, t0 + time, (now) => {
      const k = Math.min(1, (now - t0) / time);
      if (via) { // curving throw: quadratic curve through the bend point
        const p = lerp3(lerp3(from, via, k), lerp3(via, to, k), k);
        m.position.set(...p);
      } else if (wave) {
        m.position.set(...lerp3(from, to, k));
        m.lookAt(m.position.x + (to[0] - from[0]), m.position.y, m.position.z + (to[2] - from[2]));
      } else {
        m.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k + Math.sin(k * Math.PI) * Math.min(2, d * 0.12), from[2] + (to[2] - from[2]) * k);
      }
    });
  }

  // Wall-piercing beam: a bright line that fades out.
  fxBeam({ from, to }) {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 0.15, (from[2] + to[2]) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize());
    m.renderOrder = 20;
    const t0 = this.game.time;
    this.fxAdd(m, t0 + 0.7, (now) => { const k = (now - t0) / 0.7; m.material.opacity = 0.9 * (1 - k); m.scale.x = m.scale.z = 1 + k * 3; });
  }

  // A glowing pillar marking a spot while something is pending there (rift target, rekindle mark).
  fxMarker(pos, color, untilFn) {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    pillar.position.y = 1.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    g.add(pillar, ring);
    g.position.set(...pos);
    this.fxAdd(g, untilFn, (now) => { pillar.material.opacity = 0.25 + 0.15 * Math.sin(now * 6); });
  }

  // Seismic line / cone: a ripple of light along the ground.
  fxQuake({ from, to, yaw, cone, color = 0xf28c38 }) {
    const t0 = this.game.time;
    if (cone) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(32, 32, -25 * DEG, 50 * DEG), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.set(-Math.PI / 2, 0, yaw + Math.PI / 2);
      m.position.set(from[0], from[1] - 0.95, from[2]);
      this.fxAdd(m, t0 + 1.0, (now) => { const k = (now - t0) / 1.0; m.scale.setScalar(Math.min(1, k * 2)); m.material.opacity = 0.4 * (1 - k); });
      return;
    }
    const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, len), new THREE.MeshBasicMaterial({ color: 0xf28c38, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.set(-Math.PI / 2, 0, Math.atan2(to[0] - from[0], to[2] - from[2]));
    m.position.set((from[0] + to[0]) / 2, from[1] - 0.95, (from[2] + to[2]) / 2);
    this.fxAdd(m, t0 + 1.2, (now) => { const k = (now - t0) / 1.2; m.material.opacity = 0.5 * Math.sin(Math.min(1, k) * Math.PI); });
  }

  // Soul orb: a floating purple wisp that fades after 3 s.
  fxOrb(orb) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshBasicMaterial({ color: 0xd65cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(...orb.pos);
    this.fxAdd(m, () => orb.until, (now) => { m.position.y = orb.pos[1] + Math.sin(now * 4) * 0.1; m.scale.setScalar(1 + 0.15 * Math.sin(now * 9)); });
  }

  // Aim preview for held abilities: a landing ring (Rift, Fissure range) or a ghost wall (Frost Wall).
  updatePreview(p) {
    if (!this.preview) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.8, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      pillar.position.y = 0.9;
      const marker = new THREE.Group(); marker.add(ring, pillar);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.25, depthWrite: false }));
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xa67bff, transparent: true, opacity: 0.18, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xa67bff, wireframe: true, transparent: true, opacity: 0.35, depthTest: false }));
      sphere.add(shell);
      sphere.renderOrder = 30;
      this.preview = { marker, wall, ring, pillar, sphere };
      this.scene.add(marker, wall, sphere);
    }
    const pv = this.preview, kit = p.kit, a = p.alive && kit?.armed && kit.agent.abilities[kit.armed.k];
    const pos = a && a.preview ? kit.previewPos : null; // the spot the kit will use, worked out this tick
    const col = kit ? parseInt(kit.agent.color.slice(1), 16) : 0xffffff;
    pv.marker.visible = !!pos && !a.wallPreview && !a.smokePreview;
    pv.wall.visible = !!pos && !!a.wallPreview;
    pv.sphere.visible = !!pos && !!a.smokePreview;
    if (!pos) return;
    if (a.smokePreview) {
      // Smoke placement: sphere at the target, purple normally, gold when passing through walls.
      pv.sphere.position.set(...pos);
      pv.sphere.scale.setScalar(a.smokePreview);
      const c = kit.phase ? 0xffd27a : col;
      pv.sphere.material.color.setHex(c); pv.sphere.children[0].material.color.setHex(c);
      return;
    }
    if (a.wallPreview) {
      const yaw = p.yaw + (kit.rot ? Math.PI / 2 : 0), alongX = Math.abs(Math.cos(yaw)) > Math.abs(Math.sin(yaw));
      const w = a.wallPreview;
      pv.wall.scale.set(alongX ? w.half * 2 : (w.th || 0.3), w.h, alongX ? (w.th || 0.3) : w.half * 2);
      pv.wall.position.set(pos[0], pos[1] + w.h / 2, pos[2]);
      pv.wall.material.color.setHex(col);
    } else {
      pv.marker.position.set(pos[0], pos[1] + 0.03, pos[2]);
      pv.ring.material.color.setHex(col);
      pv.pillar.material.color.setHex(col);
    }
  }

  // Gadgets: drone, alarm bot, turret, swarm grenade, boom bot, satchel, glare eye, gas emitter.
  fxDevice(d) {
    if (!d.pos) return; // e.g. a push wall's driver: the wall draws itself
    const g = new THREE.Group();
    const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: e || 0x000000, emissiveIntensity: e ? 1.2 : 0, roughness: 0.5, metalness: 0.4 });
    let light = null, head = null;
    if (d.kind === 'drone') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), mat(0x2b3440));
      body.scale.set(1, 0.6, 1.3);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.12), mat(0x3b4656)); w.position.x = s * 0.25; g.add(w); }
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0x6ab7ff, 0x6ab7ff)); light.position.z = -0.2;
      g.add(body, light);
    } else if (d.kind === 'alarm') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), mat(0x3c4652)); body.position.y = 0.24;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xff3344, 0xff3344)); light.position.set(0, 0.32, -0.18);
      g.add(body, light);
    } else if (d.kind === 'turret') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 12), mat(0x3c4652)); base.position.y = 0.25;
      head = new THREE.Group(); head.position.y = 0.72;
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.34), mat(0x4fd1a5, 0x0c5a45));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), mat(0x1c1f23)); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.3;
      head.add(hb, barrel);
      g.add(base, head);
    } else if (d.kind === 'boombot') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat(0xffb547)); body.position.y = 0.22;
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), mat(0x2b2f36)); w.rotation.z = Math.PI / 2; w.position.set(s * 0.22, 0.14, 0); g.add(w); }
      light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xff3344, 0xff3344)); light.position.set(0, 0.32, -0.16);
      g.add(body, light);
    } else if (d.kind === 'satchel') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), mat(0xff7ab8)); body.position.y = 0.08;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xffb547, 0xffb547)); light.position.y = 0.18;
      g.add(body, light);
    } else if (d.kind === 'leer') {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat(0x2a1038, 0x8a2bd6));
      light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat(0xffffff, 0xd65cff)); light.position.z = 0;
      g.add(eye, light);
    } else if (d.kind === 'emitter') {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 12), mat(0x2b3a2e)); can.position.y = 0.18;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0x58c76a, 0x58c76a)); light.position.y = 0.38;
      g.add(can, light);
    } else if (d.kind === 'decoy') {
      // A shimmering silhouette of you
      const sil = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.8, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a6cff, emissive: 0x2a3399, emissiveIntensity: 0.8, transparent: true, opacity: 0.75 }));
      sil.position.y = 0.95; g.add(sil);
      light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0xffffff, 0x8f9bff)); light.position.y = 1.75; g.add(light);
    } else if (d.kind === 'gate') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 20), mat(0x2a2f6e, 0x5a6cff)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xffffff, 0x5a6cff)); light.position.y = 0.2;
      g.add(ring, light);
    } else if (d.kind === 'tiger' || d.kind === 'prowler') {
      const col = d.kind === 'tiger' ? 0x9be15d : 0xb07a9a;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.9), mat(0x2b3a2e, col)); body.position.y = 0.4;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(0x2b3a2e, col)); head.position.set(0, 0.62, -0.5);
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffffff, col)); light.position.set(0, 0.68, -0.66);
      g.add(body, head, light);
    } else if (d.kind === 'hawk' || d.kind === 'seeker') {
      const col = d.kind === 'hawk' ? 0xffd28a : 0x9be15d;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat(0xffffff, col)); body.scale.set(1, 0.7, 1.4);
      if (d.kind === 'hawk') for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.18), mat(0xffffff, col)); w.position.x = sd * 0.3; g.add(w); }
      light = body; g.add(body);
    } else if (d.kind === 'wire') {
      const len = Math.hypot(d.b[0] - d.pos[0], d.b[2] - d.pos[2]);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), new THREE.MeshBasicMaterial({ color: 0xd8dde6, transparent: true, opacity: 0.6 }));
      w.rotation.z = Math.PI / 2; w.rotation.y = -Math.atan2(d.b[2] - d.pos[2], d.b[0] - d.pos[0]);
      w.position.set((d.b[0] - d.pos[0]) / 2, 0, (d.b[2] - d.pos[2]) / 2);
      g.add(w);
      for (const p of [[0, 0, 0], [d.b[0] - d.pos[0], 0, d.b[2] - d.pos[2]]]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(0x3c4652, 0x8fa3b8)); n.position.set(...p); g.add(n); }
    } else if (d.kind === 'cage') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 6), mat(0x3c4652, 0xd8dde6)); ring.position.y = 0.03; g.add(ring);
      light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xffffff, 0xd8dde6)); light.position.y = 0.08; g.add(light);
    } else if (d.kind === 'cam') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat(0x2b2f36)); g.add(body);
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffffff, 0xd8dde6)); light.position.z = -0.12; g.add(light);
    } else if (d.kind === 'haunt') {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat(0x2a1020, 0xb07a9a)); g.add(eye);
      light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0xffffff, 0xff5a8a)); g.add(light);
    } else if (d.kind === 'star') {
      const s1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), mat(0xffe9a8, 0xe6b34a)); s1.position.y = 0.9;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 24), mat(0xffe9a8, 0xe6b34a)); halo.position.y = 0.9;
      g.add(s1, halo); light = s1; head = null;
      g.userData.spin = [s1, halo];
    } else if (d.kind === 'trademark') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8), mat(0x2b2f36)); body.position.y = 0.06;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffd27a, 0xe8c26a)); light.position.y = 0.15;
      g.add(body, light);
    } else if (d.kind === 'anchor') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 24), mat(0x3a3020, 0xe8c26a)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.4, 8), mat(0x2b2f36)); post.position.y = 0.2;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffffff, 0xe8c26a)); light.position.y = 0.42;
      g.add(ring, post, light);
    } else if (d.kind === 'zknife') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.25, 0.08), mat(0x6fa8ff, 0x3f6fff));
      g.add(blade); light = blade;
    } else if (d.kind === 'focusorb') {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat(0xd6b8ff, 0x9b5cff));
      g.add(orb); light = orb; g.userData.spin = [orb];
    } else if (d.kind === 'owl') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), mat(0x2b3440)); body.scale.set(1.2, 0.7, 1.4);
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.14), mat(0x3b4656, 0x6ab7ff)); w.position.x = sx * 0.3; g.add(w); }
      light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffffff, 0x6ab7ff)); light.position.z = -0.22; g.add(body, light);
    } else if (d.kind === 'sdrone') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), mat(0x3b3420)); body.scale.set(1.4, 0.6, 1.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12), mat(0x2b2f36, 0xd9a441)); r.position.set(sx * 0.22, 0.04, sz * 0.22); g.add(r); }
      light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xffffff, 0xd9a441)); light.position.z = -0.2; g.add(body, light);
    } else if (d.kind === 'swarm') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 12), mat(0x2b3440)); disc.position.y = 0.03;
      light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x9be15d, 0x9be15d)); light.position.y = 0.08;
      g.add(disc, light);
    }
    this.fxAdd(g, () => (d.removed ? 0 : d.until), (now) => {
      g.position.set(...d.pos);
      if (d.kind === 'drone') g.rotation.y = Math.atan2(-d.dir[0], -d.dir[2]);
      if (d.kind === 'boombot' || d.kind === 'decoy' || d.kind === 'tiger' || d.kind === 'prowler' || d.kind === 'gate') g.rotation.y = Math.atan2(-d.dir[0], -d.dir[2]);
      if (d.kind === 'hawk') g.rotation.set(0, Math.atan2(-d.dir[0], -d.dir[2]), 0);
      if (d.kind === 'wire') { g.position.set(...d.pos); g.visible = true; }
      if (d.kind === 'cam') { const ow = d.owner; g.rotation.set(0, ow.yaw, 0); g.visible = !(ow.kit?.view === d); }
      if (d.kind === 'tiger' || d.kind === 'sdrone' || d.kind === 'owl') g.visible = !(d.owner.kit?.pilot === d);
      if (d.kind === 'sdrone' || d.kind === 'owl') g.rotation.set(0, Math.atan2(-d.dir[0], -d.dir[2]), 0);
      if (g.userData.spin) for (const m of g.userData.spin) m.rotation.y += 0.03;
      if (d.kind === 'leer') { const e = this.camera.position; g.lookAt(e.x, e.y, e.z); }
      if (d.kind === 'alarm' && d.target) g.rotation.y = Math.atan2(-(d.target.pos[0] - d.pos[0]), -(d.target.pos[2] - d.pos[2]));
      if (head) head.rotation.y += Math.atan2(Math.sin(d.aimYaw - head.rotation.y), Math.cos(d.aimYaw - head.rotation.y)) * 0.2;
      if (light) light.visible = Math.sin(now * (d.target ? 20 : 5)) > -0.3;
    });
  }

  // Deployable wall: a translucent energy slab that rises out of the floor.
  fxWall(w) {
    const b = w.box;
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const g = new THREE.Group();
    const STY = {
      bulwark: [0x2a8f74, 0x1d6b56, 0x7fffd4, 0.85], ice: [0xbfefff, 0x4fb8d8, 0xe8fbff, 0.8], iso: [0x5a2fa8, 0x9b5cff, 0xd6b8ff, 0.7],
      cosmic: [0x2a1450, 0xb06bff, 0xffd27a, 0.92], arena: [0x24183d, 0x5a2fa8, 0xb48cff, 0.95],
    }[w.style] || [0x2a8f74, 0x1d6b56, 0x7fffd4, 0.85];
    const op = STY[3];
    const slab = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color: STY[0], emissive: STY[1], emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2, transparent: op < 1, opacity: op, side: THREE.DoubleSide }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), new THREE.LineBasicMaterial({ color: STY[2] }));
    g.add(slab, edge);
    g.position.set((b.min[0] + b.max[0]) / 2, b.min[1] + size[1] / 2, (b.min[2] + b.max[2]) / 2);
    const t0 = this.game.time;
    this.fxAdd(g, () => (w.removed ? 0 : Infinity), (now) => {
      const k = w.style === 'arena' ? 1 : Math.min(1, (now - t0) / 0.3);
      g.scale.y = Math.max(0.01, k);
      g.position.set((b.min[0] + b.max[0]) / 2, b.min[1] + size[1] * k / 2, (b.min[2] + b.max[2]) / 2); // follows a pushed wall
      const left = w.until - now;
      slab.material.opacity = left < 1.5 ? op * Math.max(0.2, left / 1.5) : op;
    });
  }

  clearSmokes() {
    for (const sm of this.smokes || []) this.scene.remove(sm.group);
    if (this.smokes) this.smokes.length = 0;
    this.clearFx2();
  }

  updateSmokes() {
    if (!this.smokes?.length) return;
    const now = this.game.time;
    this.smokes = this.smokes.filter(sm => {
      if (now >= sm.s.until) { this.scene.remove(sm.group); return false; }
      const grow = Math.min(1, (now - sm.s.born) / SMOKE.grow);
      const fade = Math.min(1, (sm.s.until - now) / 0.4);
      if (sm.slab) { // a wall grows up out of the floor
        const k = 1 - (1 - grow) ** 3;
        sm.group.scale.set(1, Math.max(0.02, k), 1);
        sm.group.position.set(sm.s.pos[0], sm.s.pos[1] - sm.s.slab.h / 2 * (1 - k), sm.s.pos[2]);
        sm.mat.opacity = (sm.fire ? 0.55 + 0.1 * Math.sin(now * 23 + sm.s.pos[0]) : 0.82) * fade;
        sm.group.userData.slab.material.opacity = sm.mat.opacity * 0.9;
        sm.group.userData.slab.scale.y = 0.92 + 0.08 * Math.sin(now * 7 + sm.s.pos[2]);
        return true;
      }
      sm.group.scale.setScalar(0.2 + 0.8 * (1 - (1 - grow) ** 3));
      sm.group.position.set(sm.s.pos[0], sm.s.pos[1], sm.s.pos[2]); // rolling water moves
      let op = sm.fire ? 0.38 + 0.08 * Math.sin(now * 23 + sm.s.pos[0]) : 1; // smokes can't be seen through
      if (sm.s.nest && sm.s.owner === this.game.player && this.camera.position.distanceTo(new THREE.Vector3(...sm.s.pos)) < sm.s.radius) op = 0.12; // Venom sees through her own Nest
      sm.mat.opacity = op * fade;
      const shell = sm.group.userData.shell;
      if (shell && !sm.fire) {
        const R = (sm.s.radius || SMOKE.radius) * sm.group.scale.x, cp = this.camera.position;
        const inside = Math.hypot(cp.x - sm.s.pos[0], cp.y - sm.s.pos[1], cp.z - sm.s.pos[2]) < R * 0.95;
        shell.visible = inside;
        shell.material.opacity = op * fade; // from inside you see the pocket, not the world beyond the cloud
        for (const m of sm.group.children) if (m !== shell) m.visible = !inside;
      }
      for (const m of sm.group.children) m.rotation.y += m.userData.spin * 0.016;
      return true;
    });
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    for (const m of this.mapMaterials) m.needsUpdate = true;
    for (const ch of this.characters.values()) ch.group.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * (this.settings.renderScale || 1));
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.camera.aspect = this.vmCamera.aspect = this.aspect;
    this.vmCamera.updateProjectionMatrix();
  }

  // Vertical FOV from the fixed horizontal FOV and the current zoom.
  vfov(zoom = this.fovZoom) {
    return 2 * Math.atan(Math.tan((HFOV * DEG) / 2) / zoom / this.aspect);
  }

  // The skin a combatant shows on a weapon: yours from settings, bots' and other players' from their skinMap.
  skinOf(c, weaponId) {
    if (!c) return 'standard';
    if (c === this.game.player) return skinFor(this.settings, weaponId);
    const id = c.skinMap?.[weaponId] || c.skinMap?.all;
    return id && SKINS[id] ? id : 'standard';
  }

  syncCharacters() {
    for (const ch of this.characters.values()) this.scene.remove(ch.group);
    this.characters.clear();
    for (const c of this.game.combatants) {
      if (c === this.game.player) continue;
      this.characters.set(c, this.makeCharacter(c));
    }
  }

  makeCharacter(c) {
    const group = new THREE.Group();
    const col = new THREE.Color(c.color);
    const mk = (color) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color, emissive: 0x000000 }));
      m.castShadow = true;
      group.add(m);
      return m;
    };
    const legs = mk(col.clone().multiplyScalar(0.45));
    const body = mk(col);
    const head = mk(col.clone().lerp(new THREE.Color(0xffffff), 0.25));
    const gun = mk(0x24282e);
    gun.visible = false; // replaced by the real weapon model below
    const visor = mk(0x101318);
    const held = new THREE.Group(); // the weapon this player is holding, rebuilt when it changes
    group.add(held);
    this.scene.add(group);
    return { c, group, legs, body, head, gun, visor, held, heldKey: '', flash: 0, deathT: 0 };
  }

  characterMuzzle(c) {
    const crouch = c.crouchAmount();
    const y = c.pos[1] + lerp(GUN_HEIGHT[0], GUN_HEIGHT[1], crouch);
    const f = [-Math.sin(c.yaw), -Math.cos(c.yaw)];
    const r = [Math.cos(c.yaw), -Math.sin(c.yaw)];
    return new THREE.Vector3(c.pos[0] + f[0] * 0.75 + r[0] * 0.18, y, c.pos[2] + f[1] * 0.75 + r[1] * 0.18);
  }

  addDecal(p, n) {
    const i = this.decalNext;
    this.decalNext = (i + 1) % this.decalTimes.length;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]));
    const s = 0.055;
    m.compose(new THREE.Vector3(p[0] + n[0] * 0.004, p[1] + n[1] * 0.004, p[2] + n[2] * 0.004), q, new THREE.Vector3(s, s, s));
    this.decalMesh.setMatrixAt(i, m);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalTimes[i] = performance.now();
  }

  clearDecals() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.decalTimes.length; i++) { this.decalMesh.setMatrixAt(i, zero); this.decalTimes[i] = -1; }
    this.decalMesh.instanceMatrix.needsUpdate = true;
  }

  burst(p, n, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const s = this.sparkData[this.sparkNext];
      this.sparkNext = (this.sparkNext + 1) % this.sparkData.length;
      s.life = 0.25 + Math.random() * 0.2;
      s.p = [...p];
      const v = [Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5];
      if (n) { v[0] += n[0]; v[1] += n[1]; v[2] += n[2]; }
      s.v = v.map(x => x * speed);
      s.c = color;
    }
  }

  setViewmodel(def) {
    const skin = def.hands ? '' : skinFor(this.settings, def.id);
    const key = def.id + '|' + skin;
    if (this.vm.key === key) return;
    if (this.vm.model) this.vm.group.remove(this.vm.model);
    this.vm.model = def.hands ? handsModel(def.color, def.item) : gunModel(def.id, skin);
    if (def.hands) { this.vm.equipStart = performance.now(); this.vm.equipDur = 250; }
    this.vm.model.scale.setScalar(VM_SCALE);
    this.vm.model.userData.muzzle.add(this.vmFlash);
    this.vm.group.add(this.vm.model);
    this.vm.key = key;
    this.vm.kind = def.model;
  }

  render(alpha, dt, look) {
    const g = this.game, p = g.player;
    const now = performance.now();
    if (p) this.updateCamera(p, alpha, dt, look);
    this.updateCharacters(alpha, now);
    this.updateFx(dt, now);
    this.updateSmokes();
    this.updateFx2();
    this.updateSpike();
    this.updateNearsight(p);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (p && (p.alive || this.specTarget) && this.vmVisible) {
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCamera);
    }
  }

  // Shadow sight (aiming Shade): every surface of the map turns to translucent violet glass on a dark sky.
  setShadowSight(on) {
    if (!!this.shadowSight === on) return;
    if (on) {
      const mats = new Set();
      this.worldGroup?.traverse(o => { if (o.material) for (const m of [o.material].flat()) mats.add(m); });
      this.shadowSight = { bg: this.scene.background, fog: this.scene.fog, mats: [...mats].map(m => ({ m, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, color: m.color?.getHex() })) };
      for (const { m } of this.shadowSight.mats) { m.transparent = true; m.opacity = 0.3; m.depthWrite = false; m.color?.setHex(0x9a7cff); m.needsUpdate = true; }
      this.scene.background = new THREE.Color(0x150d33);
      this.scene.fog = null;
    } else {
      const s = this.shadowSight;
      for (const { m, transparent, opacity, depthWrite, color } of s.mats) { m.transparent = transparent; m.opacity = opacity; m.depthWrite = depthWrite; if (color !== undefined) m.color.setHex(color); m.needsUpdate = true; }
      this.scene.background = s.bg;
      this.scene.fog = s.fog;
      this.shadowSight = null;
    }
  }

  // Nearsighted (Dread, Hound, Glare, Nest...): the world fades into murk a few metres out, like bots see it.
  updateNearsight(p) {
    if (this.shadowSight) return;
    const range = p?.alive ? this.game.sightRange(p) : Infinity;
    const want = range < Infinity ? range : 0;
    if (want === (this.nearFog?.range || 0)) return;
    if (!this.nearFog) this.nearFog = { fog: this.scene.fog, bg: this.scene.background };
    if (want) {
      this.scene.fog = new THREE.Fog(0x120d18, want * 0.3, want + 1);
      this.scene.background = new THREE.Color(0x120d18);
      this.nearFog.range = want;
    } else {
      this.scene.fog = this.nearFog.fog;
      this.scene.background = this.nearFog.bg;
      this.nearFog = null;
    }
  }

  // Slow orbit over the map behind the main menu.
  // Buy-phase barriers: translucent coloured walls at the spawn exits.
  showBarriers(boxes) {
    if (this.barrierGroup) this.scene.remove(this.barrierGroup);
    this.barrierGroup = new THREE.Group();
    for (const b of boxes) {
      const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color: b.barrier === 'atk' ? 0xff4655 : 0x4fd1c5, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(b.min[0] + size[0] / 2, b.min[1] + size[1] / 2, b.min[2] + size[2] / 2);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), new THREE.LineBasicMaterial({ color: b.barrier === 'atk' ? 0xff8a95 : 0x8ff0e6 }));
      e.position.copy(m.position);
      this.barrierGroup.add(m, e);
    }
    this.scene.add(this.barrierGroup);
  }

  // The spike: on the carrier's back, on the floor when dropped, or planted with a blinking light.
  // Where the spike is right now (for the all-dead camera).
  spikeFocus() {
    const sp = this.game.mode?.spike;
    if (!sp) return null;
    if (sp.state === 'carried' && sp.carrier) return [sp.carrier.pos[0], sp.carrier.pos[1] + 1, sp.carrier.pos[2]];
    return sp.pos || null;
  }

  updateSpike() {
    const m = this.game.mode;
    if (!this.spikeObj) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.5, roughness: 0.4 }));
      body.position.y = 0.25;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 16), new THREE.MeshStandardMaterial({ color: 0xff4655, emissive: 0xff4655, emissiveIntensity: 1.2 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4655 }));
      light.position.y = 0.56;
      const glow = new THREE.PointLight(0xff4655, 0, 6);
      glow.position.y = 0.6;
      g.add(body, ring, light, glow);
      g.userData = { light, glow };
      this.spikeObj = g;
      this.scene.add(g);
    }
    const g = this.spikeObj, sp = m?.spike;
    if (!sp || sp.state === 'exploded') { g.visible = false; return; }
    const now = this.game.time;
    g.visible = true;
    g.scale.setScalar(1);
    if (sp.state === 'carried') {
      const c = sp.carrier;
      if (!c || c === this.game.player) { g.visible = false; return; }
      g.position.set(c.pos[0] + Math.sin(c.yaw) * 0.32, c.pos[1] + 1.05, c.pos[2] + Math.cos(c.yaw) * 0.32);
      g.scale.setScalar(0.7);
      g.userData.light.visible = true; g.userData.glow.intensity = 0;
    } else {
      g.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
      let on = true, inten = 0;
      if (sp.state === 'planted') {
        const left = sp.plantedAt + ROUND.spike - now;
        const rate = left > 20 ? 1 : left > 10 ? 2 : left > 5 ? 4 : 8; // beeps faster near the end
        on = Math.sin(now * Math.PI * 2 * rate) > 0;
        inten = on ? 2.5 : 0.4;
      }
      g.userData.light.visible = on;
      g.userData.glow.intensity = inten;
    }
  }

  renderIdle(t) {
    const cam = this.camera, a = t * 0.05;
    const R = Math.max(this.game.map.W, this.game.map.H) * 1.05;
    cam.position.set(Math.sin(a) * R, R * 0.75, Math.cos(a) * R);
    cam.lookAt(0, 0, 0);
    this.fovZoom = 1;
    cam.fov = this.vfov() / DEG;
    cam.updateProjectionMatrix();
    for (const ch of this.characters.values()) ch.group.visible = false;
    this.updateFx(0.016, performance.now());
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
  }

  // Start (or restart) inspecting the gun in hand.
  inspect() {
    const p = this.game.player;
    if (!p?.alive || p.gun.reloading) return;
    this.inspecting = { start: performance.now(), gun: p.gun };
  }

  updateCamera(p, alpha, dt, look) {
    const cam = this.camera;
    // Spectating a teammate (5v5, after the death cam): their eyes, their gun, and their own body hidden.
    const spec = !p.alive && this.game.mode && this.spectate && (!this.deathCam || performance.now() - this.deathCam.t > 2500) ? this.spectate() : null;
    this.specTarget = spec;
    const gun = (spec && spec.gun) || p.gun || p.inv.secondary || p.inv.melee;
    const x = lerp(p.prevPos[0], p.pos[0], alpha);
    const z = lerp(p.prevPos[2], p.pos[2], alpha);
    const eyeY = lerp(p.prevEyeY, p.pos[1] + p.eyeOff + p.stepSmooth, alpha);
    cam.position.set(x, eyeY, z);
    // Piloting a gadget (tiger) or looking through a spy camera: the view rides on the device.
    // Nightwalk: while channelling, your view is already at the destination; your body stays behind.
    const shade = p.alive && p.kit?.shadow?.phase === 'channel' ? { pos: p.kit.shadow.dest, kind: 'shade' } : null;
    const ride = p.alive && (p.kit?.pilot || p.kit?.view || shade);
    if (ride) cam.position.set(ride.pos[0], ride.pos[1] + (ride.kind === 'cam' || ride.kind === 'sdrone' || ride.kind === 'owl' ? 0 : ride.kind === 'shade' ? 1.7 : 0.7), ride.pos[2]);
    // Shade: the view flies out with the smoke marker, through walls, and the world turns to shadow so you
    // can see where it will land (characters are hidden: it shows the map, not enemies).
    const held = !ride && !spec && p.alive && p.kit?.armed && p.kit.agent.abilities[p.kit.armed.k];
    const sight = held?.shadowSight && p.kit.previewPos;
    this.setShadowSight(!!sight);
    if (sight) {
      const t = p.kit.previewPos, d = dirFromAngles(p.yaw, p.pitch);
      const back = Math.min(Math.hypot(t[0] - x, t[1] - eyeY, t[2] - z), held.smokePreview * 3.5 + 4);
      cam.position.set(t[0] - d[0] * back, t[1] - d[1] * back + 0.6, t[2] - d[2] * back);
    }
    this.updatePreview(p);
    if (spec) {
      // Spectating a teammate: their eyes, their aim.
      const sy = lerp(spec.prevPos[1], spec.pos[1], alpha) + spec.eyeOff;
      cam.position.set(lerp(spec.prevPos[0], spec.pos[0], alpha), sy, lerp(spec.prevPos[2], spec.pos[2], alpha));
      cam.rotation.set(spec.pitch, spec.yaw, 0);
      // Their zoom too: a scoped bot's view is the scope view (the HUD draws the scope overlay).
      const zt = gun?.targetZoom ? 1 + (gun.targetZoom() - 1) * gun.adsT : 1;
      this.fovZoom += (zt - this.fovZoom) * Math.min(1, dt * 30);
    } else if (!p.alive && this.game.mode && this.game.mode.spike && (!this.deathCam || performance.now() - this.deathCam.t > 2500) && this.spikeFocus()) {
      // Whole team dead: the camera circles the spike (planted, dropped, or on its carrier).
      const f = this.spikeFocus(), a = performance.now() / 6000;
      cam.position.set(f[0] + Math.sin(a) * 7, f[1] + 4.5, f[2] + Math.cos(a) * 7);
      cam.lookAt(f[0], f[1] + 0.6, f[2]);
      this.fovZoom = 1;
    } else if (!p.alive && this.deathCam) {
      // Death cam: turn to face whoever killed you.
      const k = this.deathCam.killer;
      if (k && k !== p) {
        const dx = k.pos[0] - x, dy = k.eye()[1] - eyeY, dz = k.pos[2] - z;
        const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
        const f = 1 - Math.exp(-dt * 6);
        this.deathCam.yaw += Math.atan2(Math.sin(ty - this.deathCam.yaw), Math.cos(ty - this.deathCam.yaw)) * f;
        this.deathCam.pitch += (tp - this.deathCam.pitch) * f;
      }
      cam.rotation.set(this.deathCam.pitch, this.deathCam.yaw, 0);
      cam.position.y -= 0.6;
      this.fovZoom = 1;
    } else {
      // Physical recoil: spring punch + shake on top of the spray pattern the crosshair follows.
      const r = this.springsFor(gun.def);
      // Aimed in, the view follows the whole recoil climb so the crosshair stays on the bullets.
      const vr = lerp(VIEW_RECOIL, 1, gun.def.alt && gun.def.alt.type !== 'none' ? gun.adsT : 0);
      for (const k of ['back', 'up', 'pitch', 'yaw', 'roll', 'camP', 'camY', 'camR']) r[k].step(dt);
      this.shake *= Math.exp(-dt * 18);
      const sa = this.shake * 0.12 * DEG;
      this.shakeP = lerp(this.shakeP, (Math.random() * 2 - 1) * sa, Math.min(1, dt * 60));
      this.shakeY = lerp(this.shakeY, (Math.random() * 2 - 1) * sa, Math.min(1, dt * 60));
      cam.rotation.set(
        p.pitch + gun.offP * vr + r.camP.x + this.shakeP,
        p.yaw + gun.offY * vr + r.camY.x + this.shakeY,
        r.camR.x,
      );
      const target = 1 + (gun.targetZoom() - 1) * gun.adsT;
      this.fovZoom += (target - this.fovZoom) * Math.min(1, dt * 30);
    }
    // Dash: a quick FOV widen; lift: a smaller one.
    const kit = p.kit, gt = this.game.time;
    const kick = kit && kit.id === 'zephyr' ? Math.max(0, 1 - (gt - kit.lastUse.e) / 0.4) * 0.1 + Math.max(0, 1 - (gt - kit.lastUse.q) / 0.5) * 0.05 : 0;
    cam.fov = this.vfov(this.fovZoom * (1 - kick)) / DEG;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // Viewmodel
    // Spectating: the hands and weapon are the spectated teammate's (so you see them pull out abilities).
    const vp = spec || p;
    const blades = vp.kit?.blades;
    // Holding an ability (or sprinting / grabbing an orb): hands only, no gun.
    const kitc = vp.kit, armedAb = kitc?.armed && kitc.agent.abilities[kitc.armed.k];
    const handItem = vp.st.channelUntil > this.game.time ? 'device' : armedAb ? (armedAb.item || 'orb') : kitc?.grab ? 'grab' : kitc?.highGear ? 'none' : null;
    const handsDef = handItem && { id: `hand:${kitc.id}:${handItem}`, hands: true, model: 'hands', color: vp.st.channelUntil > this.game.time ? 0xff4655 : parseInt(kitc.agent.color.slice(1), 16), item: handItem, melee: true };
    const def = blades ? BLADES : handsDef || gun.def;
    const kind = def.model;
    this.setViewmodel(def);
    const vm = this.vm;
    const scoped = gun.scoped();
    this.vmVisible = !scoped && !ride && !sight;
    if (blades) for (let i = 0; i < BLADES.count; i++) { const b = vm.model.userData.parts['b' + i]; if (b) b.visible = i < blades.left; }
    const pose = VM_POSE[kind];
    const a = def.alt && (def.alt.type === 'zoom' || def.alt.type === 'zoomBurst' || def.alt.type === 'scope') ? gun.adsT : 0;
    // Line the model's sight up with the crosshair when aiming.
    const adsY = kind === 'shotgun' || kind === 'knife' || kind === 'blades' ? pose.ads[1] : -(vm.model.userData.sightY * VM_SCALE) - 0.003;
    const adsZ = kind === 'dmr' ? -0.24 : kind === 'shotgun' || kind === 'knife' || kind === 'sniper' || kind === 'blades' ? pose.ads[2] : pose.ads[2] - 0.05; // scoped rifles: eye close to the eyepiece
    let px = lerp(pose.hip[0], pose.ads[0], a), py = lerp(pose.hip[1], adsY, a), pz = lerp(pose.hip[2], adsZ, a);
    let rx = 0, ry = 0, rz = 0;

    // Movement bob
    const sp = p.horizSpeed();
    if (p.grounded && sp > 0.3) vm.bob += dt * sp * 1.9;
    const bobAmt = Math.min(1, sp / 5.4) * (1 - a * 0.85);
    px += Math.cos(vm.bob) * 0.008 * bobAmt;
    py += Math.abs(Math.sin(vm.bob)) * 0.01 * bobAmt;
    if (!p.grounded) py += 0.015;

    // Sway against mouse movement
    vm.swayX = lerp(vm.swayX, -look.dx * 0.0006, Math.min(1, dt * 12));
    vm.swayY = lerp(vm.swayY, look.dy * 0.0006, Math.min(1, dt * 12));
    px += vm.swayX * (1 - a * 0.8);
    py += vm.swayY * (1 - a * 0.8);

    // Hands animations: pumping arms while sprinting, a reach forward when grabbing an orb, a gentle idle bob.
    if (def.hands) {
      const ud = vm.model.userData, t = performance.now() / 1000;
      if (def.item === 'none') {
        const ph = vm.bob * 1.4;
        ud.right.position.set(0.03, Math.sin(ph) * 0.05, Math.cos(ph) * 0.05);
        ud.left.position.set(-0.22, -0.01 - Math.sin(ph) * 0.05, 0.02 - Math.cos(ph) * 0.05);
        py -= 0.04;
      } else {
        ud.right.position.set(0.03, Math.sin(t * 2) * 0.004, 0);
        ud.left.position.set(-0.22, -0.01 + Math.cos(t * 2) * 0.004, 0.02);
        if (kitc?.grab) { const k = Math.sin(Math.min(1, (kitc.grab.until - this.game.time) / 0.35) * Math.PI); pz -= 0.12 * k; py += 0.04 * k; }
      }
    }
    // Physical recoil: the model slides back into the shoulder, the muzzle flips up and the wrist rolls.
    const rc = this.recoil;
    if (rc.back) {
      pz += rc.back.x;
      py += rc.up.x;
      px -= rc.yaw.x * 0.06;
      rx += rc.pitch.x;
      ry += rc.yaw.x;
      rz += rc.roll.x;
    }

    // Equip / reload / knife swing
    const et = Math.min(1, (performance.now() - vm.equipStart) / Math.max(1, vm.equipDur));
    if (et < 1) { const e = 1 - Math.pow(1 - et, 3); py -= (1 - e) * 0.25; rx -= (1 - e) * 0.6; }
    if (!def.melee && !blades) {
      // Per-gun reload and bolt/pump animations (reloadanim.js); the gun is lowered a touch while aiming.
      const rp = reloadPose(vm.model, def, gun, this.game.time, this.cycle);
      px += rp.px || 0; py += rp.py || 0; pz += rp.pz || 0;
      rx += rp.rx || 0; ry += rp.ry || 0; rz += rp.rz || 0;
    }
    const st = (performance.now() - vm.swingStart) / (vm.swingHeavy ? 500 : 280);
    if (st >= 0 && st < 1) {
      const k = Math.sin(st * Math.PI);
      if (vm.swingHeavy) { px -= k * 0.14; rx += k * 0.4; ry += k * 0.9; }
      else { px -= k * 0.12; rz += k * 0.6; ry += k * 0.6; }
    }
    // Inspect (Y): turn the gun to show one side, then flip it to show the other, then settle back.
    const ins = this.inspecting;
    if (ins) {
      const t = ins.fixedT ?? (performance.now() - ins.start) / 1000; // fixedT: a frozen pose (testing)
      if (ins.gun !== gun || t > INSPECT[INSPECT.length - 1][0] || !p.alive || p.input.fire || p.input.alt || gun.reloading || gun.adsT > 0.05 || handsDef || blades) this.inspecting = null;
      else {
        let i = 1; while (i < INSPECT.length - 1 && INSPECT[i][0] < t) i++;
        const A = INSPECT[i - 1], B = INSPECT[i], u = Math.min(1, Math.max(0, (t - A[0]) / (B[0] - A[0])));
        const s = u * u * (3 - 2 * u);
        const k = (j) => A[j] + (B[j] - A[j]) * s;
        const m = def.melee ? 0.6 : 1;
        px += k(1); py += k(2); pz += k(3); rx += k(4) * m; ry += k(5) * m; rz += k(6) * m;
      }
    }
    vm.group.position.set(px, py, pz);
    vm.group.rotation.set(rx, ry, rz);
    this.vmCamera.fov = 60;
    this.vmCamera.updateProjectionMatrix();

    const flashOn = performance.now() < vm.flashUntil;
    this.vmFlash.visible = flashOn;
    if (flashOn) { this.vmFlash.scale.setScalar(this.vmFlashScale * (0.8 + Math.random() * 0.4)); this.vmFlash.material.rotation = Math.random() * 6; }
  }

  updateCharacters(alpha, now) {
    // Playing Fawn: teammates Bloom would heal right now glow green.
    const pk = this.game.player?.kit;
    this.bloomSet = pk?.id === 'fawn' && this.game.player.alive && (pk.regrow || pk.charges.c > 0) ? new Set(bloomTargets(this.game.player)) : null;
    for (const ch of this.characters.values()) {
      const c = ch.c;
      if (!c.alive) {
        if (ch.deathT) {
          const t = (now - ch.deathT) / 450;
          ch.group.rotation.x = -Math.min(1, t) * Math.PI / 2 * 0.9;
          if (t > 2.5 && !this.game.mode) ch.group.visible = false; // in 5v5 bodies stay for the round
        } else ch.group.visible = false;
        continue;
      }
      // Spectating: don't render the body we're looking out of, or anyone pressed right up against the camera.
      // Shadow sight sees through walls, so it shows nobody.
      const st = this.specTarget;
      ch.group.visible = !this.shadowSight && (!st || (c !== st && Math.hypot(c.pos[0] - st.pos[0], c.pos[2] - st.pos[2]) > 1.3));
      const x = lerp(c.prevPos[0], c.pos[0], alpha), y = lerp(c.prevPos[1], c.pos[1], alpha), z = lerp(c.prevPos[2], c.pos[2], alpha);
      ch.group.position.set(x, y, z);
      ch.group.rotation.set(0, c.yaw, 0);
      const cr = c.crouchAmount();
      const part = (mesh, name, shrink) => {
        const s = HITBOX.stand[name], k = HITBOX.crouch[name];
        const y0 = lerp(s[0], k[0], cr), y1 = lerp(s[1], k[1], cr), hw = lerp(s[2], k[2], cr) - shrink;
        mesh.position.set(0, (y0 + y1) / 2, 0);
        mesh.scale.set(hw * 2, (y1 - y0) - shrink, name === 'body' ? hw * 1.3 : hw * 2);
      };
      part(ch.legs, 'legs', 0.02);
      part(ch.body, 'body', 0.0);
      part(ch.head, 'head', 0.0);
      const hy = ch.head.position.y;
      ch.visor.position.set(0, hy + 0.02, -0.12);
      ch.visor.scale.set(0.2, 0.07, 0.04);
      ch.gun.position.set(0.17, lerp(GUN_HEIGHT[0], GUN_HEIGHT[1], cr), -0.35);
      ch.gun.scale.set(0.07, 0.1, 0.75);
      // Show the weapon they're actually holding, in their skin; an ability in hand shows nothing.
      const heldDef = c.kit?.armed || c.kit?.blades ? null : c.gun?.def;
      const heldSkin = heldDef ? this.skinOf(c, heldDef.id) : '';
      const hk = heldDef ? heldDef.id + ':' + heldSkin : '';
      if (hk !== ch.heldKey) {
        ch.heldKey = hk;
        for (const o of [...ch.held.children]) { ch.held.remove(o); o.traverse(m => m.geometry?.dispose()); }
        if (heldDef && !heldDef.hands) {
          const m = gunModel(heldDef.id, heldSkin, { noHands: true });
          if (m.userData.hands) for (const hh of m.userData.hands) hh.visible = false;
          m.traverse(o => { if (o.isMesh) o.castShadow = true; });
          m.scale.setScalar(1.15);
          ch.held.add(m);
        }
      }
      ch.held.position.set(0.2, lerp(GUN_HEIGHT[0], GUN_HEIGHT[1], cr), -0.28);
      ch.held.rotation.set(Math.max(-0.6, Math.min(0.6, c.pitch || 0)) * 0.8, 0, 0);
      const hot = now - ch.flash < 80;
      // Revealed (sonar, traps, lockdown): glowing red silhouette drawn through walls.
      const shown = c.st && c.st.revealUntil > this.game.time && !(c.st.hiddenUntil > this.game.time) && this.game.isEnemy(this.game.player, c);
      for (const m of [ch.body, ch.head, ch.legs, ch.gun, ch.visor]) {
        m.material.emissive.setHex(shown ? 0xff2244 : hot ? 0x553333 : this.bloomSet?.has(c) ? (pk.regrow?.on ? 0x3f9a1f : 0x1f5a12) : 0x000000);
        if (m.material.depthTest === shown) { m.material.depthTest = !shown; m.material.transparent = shown; m.material.opacity = shown ? 0.9 : 1; m.renderOrder = shown ? 10 : 0; }
      }
    }
  }

  updateFx(dt, now) {
    // tracers
    const pos = this.tracerLines.geometry.attributes.position, col = this.tracerLines.geometry.attributes.color;
    const life = 70;
    this.tracerSlots.forEach((s, i) => {
      const age = now - s.t;
      const a = age < life ? 1 - age / life : 0;
      if (a > 0) {
        // Draw a streak that travels along the path instead of a full-length beam.
        const t0 = Math.min(1, age / life * 1.4), t1 = Math.min(1, t0 + 0.35);
        const fx = lerp(s.from.x, s.to.x, t0 * 0.6), fy = lerp(s.from.y, s.to.y, t0 * 0.6), fz = lerp(s.from.z, s.to.z, t0 * 0.6);
        const tx = lerp(s.from.x, s.to.x, t1), ty = lerp(s.from.y, s.to.y, t1), tz = lerp(s.from.z, s.to.z, t1);
        pos.setXYZ(i * 2, fx, fy, fz);
        pos.setXYZ(i * 2 + 1, tx, ty, tz);
      } else {
        pos.setXYZ(i * 2, 0, -100, 0);
        pos.setXYZ(i * 2 + 1, 0, -100, 0);
      }
      col.setXYZW(i * 2, s.color[0], s.color[1], s.color[2], a * 0.15);
      col.setXYZW(i * 2 + 1, s.color[0], s.color[1], s.color[2], a * 0.9);
    });
    pos.needsUpdate = col.needsUpdate = true;

    // bullet holes fade out after the configured time
    const keep = (this.settings.impactSeconds || 6) * 1000;
    let dirty = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.decalTimes.length; i++) {
      if (this.decalTimes[i] > 0 && now - this.decalTimes[i] > keep) { this.decalMesh.setMatrixAt(i, zero); this.decalTimes[i] = -1; dirty = true; }
    }
    if (dirty) this.decalMesh.instanceMatrix.needsUpdate = true;

    for (const f of this.flashPool) if (f.s.visible && now > f.until) f.s.visible = false;

    const sp = this.sparks.geometry.attributes.position, sc = this.sparks.geometry.attributes.color;
    this.sparkData.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v[1] -= 9 * dt;
        s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
        sp.setXYZ(i, s.p[0], s.p[1], s.p[2]);
        sc.setXYZ(i, s.c[0], s.c[1], s.c[2]);
      } else sp.setXYZ(i, 0, -100, 0);
    });
    sp.needsUpdate = sc.needsUpdate = true;
  }

  // Screen position (CSS px) of a world point, or null when behind the camera.
  project(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }
}
