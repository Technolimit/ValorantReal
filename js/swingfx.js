// Knife swing trails: ribbons of light drawn across the screen by a melee swing (SWINGS in melee.js), plus the
// sparks some of them throw. They live in the viewmodel scene, fixed to the screen rather than to the knife, at a
// depth just behind the blade, so the knife cuts in front of its own trail.
//
// Stroke coordinates are in half screen heights from the middle of the screen (y up, x right), so arcs stay round
// at any aspect ratio. Each stroke's head runs along its path from t0 to t1 (seconds after the swing starts), and
// every point it passes fades out over `linger` seconds, so the ribbon thins from the tail as the head moves on.
import * as THREE from '../vendor/three.module.min.js';

const SEG = 64;
const DEPTH = 0.55;
const UNIT = Math.tan((60 / 2) * Math.PI / 180) * DEPTH; // half the view height at DEPTH (the viewmodel camera is 60 degrees)

const ribbonMat = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color() }, uCore: { value: 0.6 } },
  vertexShader: `
    attribute float aSide; attribute float aAlpha;
    varying float vSide; varying float vAlpha;
    void main() { vSide = aSide; vAlpha = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uCore;
    varying float vSide; varying float vAlpha;
    void main() {
      float d = abs(vSide);
      float glow = pow(1.0 - d, 2.4) * 0.85;
      float core = smoothstep(0.28, 0.0, d) * uCore;
      gl_FragColor = vec4((uColor * glow + vec3(core)) * vAlpha, 1.0);
    }`,
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

const sparkMat = () => new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 1 } },
  vertexShader: `
    attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
    uniform float uScale;
    varying float vAlpha; varying vec3 vColor;
    void main() { vAlpha = aAlpha; vColor = aColor; gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    varying float vAlpha; varying vec3 vColor;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float core = exp(-dot(p, p) * 9.0);
      float rays = exp(-abs(p.x) * 14.0 - abs(p.y) * 2.2) + exp(-abs(p.y) * 14.0 - abs(p.x) * 2.2);
      float a = (core + rays * 0.7) * (1.0 - smoothstep(0.85, 1.0, length(p))) * vAlpha;
      gl_FragColor = vec4((vColor + vec3(core * 0.6)) * a, 1.0);
    }`,
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});

// The stroke's path sampled at SEG + 1 points: a Catmull-Rom curve through `pts`, or an `arc` [cx, cy, r, a0, a1]
// (angles in radians, counter-clockwise from +x).
function pathPoints(s) {
  const out = [];
  if (s.arc) {
    const [cx, cy, r, a0, a1] = s.arc;
    for (let i = 0; i <= SEG; i++) { const a = a0 + (a1 - a0) * (i / SEG); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }
  const P = s.pts, n = P.length - 1;
  for (let i = 0; i <= SEG; i++) {
    const f = (i / SEG) * n, k = Math.min(n - 1, Math.floor(f)), u = f - k;
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(n, k + 2)];
    const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u * u * u);
    out.push([c(0), c(1)]);
  }
  return out;
}

// The head moves fast and slows into the end of the cut: head = 1 - (1 - x)^2, so it passed u at x = 1 - sqrt(1 - u).
const headAt = (x) => 1 - (1 - x) * (1 - x);
const passedAt = (u) => 1 - Math.sqrt(Math.max(0, 1 - u));

export class SwingTrails {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
  }

  // Start a swing's strokes. `colors`: { glow, accent, trim } (the knife theme's), which strokes name by key.
  play(strokes, colors) {
    const start = performance.now() / 1000;
    for (const s of strokes || []) {
      const pts = pathPoints(s);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 6), 3));
      geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2).map((_, i) => (i % 2 ? 1 : -1)), 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2), 1));
      const idx = [];
      for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mat = ribbonMat();
      const col = colorOf(s.color, colors);
      mat.uniforms.uColor.value.setHex(col);
      mat.uniforms.uCore.value = s.core ?? 0.6;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const tr = { s, pts, mesh, start, end: start + s.t1 + s.linger, sparks: null };
      if (s.sparks || s.burst) tr.sparks = this.makeSparks(s, pts, colorOf(s.sparkColor || s.color, colors), start);
      if (tr.sparks) tr.end = Math.max(tr.end, tr.sparks.end);
      this.live.push(tr);
    }
    while (this.live.length > 8) this.remove(this.live[0]);
  }

  // Sparks: `sparks` of them shed along the cut as the head passes, and a `burst` thrown out from its end (or from
  // `burstAt` along it).
  makeSparks(s, pts, col, start) {
    const n = (s.sparks || 0) + (s.burst || 0), list = [];
    const c = new THREE.Color(col);
    for (let i = 0; i < n; i++) {
      const burst = i >= (s.sparks || 0);
      const u = burst ? s.burstAt ?? 1 : 0.1 + Math.random() * 0.85;
      const p = pts[Math.round(u * SEG)];
      const a = Math.random() * Math.PI * 2, sp = burst ? 0.35 + Math.random() * 0.6 : 0.05 + Math.random() * 0.15;
      list.push({
        x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (burst ? 0 : 0.04),
        born: s.t0 + (s.t1 - s.t0) * passedAt(u), life: 0.3 + Math.random() * 0.35, size: (s.sparkSize || 14) * (1.1 + Math.random() * 1.2), tw: Math.random() * 6,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
    geo.setAttribute('aColor', new THREE.BufferAttribute(ca, 3));
    const pts3 = new THREE.Points(geo, sparkMat());
    pts3.frustumCulled = false;
    this.scene.add(pts3);
    return { list, obj: pts3, end: start + Math.max(...list.map(k => k.born + k.life)) };
  }

  // Move every live trail on; `heightPx` (the drawing height) sizes the sparks.
  update(heightPx) {
    const now = performance.now() / 1000;
    for (const tr of [...this.live]) {
      if (now > tr.end) { this.remove(tr); continue; }
      const t = now - tr.start, s = tr.s;
      const pos = tr.mesh.geometry.attributes.position.array, al = tr.mesh.geometry.attributes.aAlpha.array;
      const x = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
      const head = t < s.t0 ? -1 : headAt(x);
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG, j = Math.min(i, Math.max(0, Math.floor(head * SEG)));
        // Points the head hasn't reached yet sit folded onto it, invisible.
        const p = tr.pts[u <= head ? i : j], q = tr.pts[Math.min(SEG, (u <= head ? i : j) + 1)], o = tr.pts[Math.max(0, (u <= head ? i : j) - 1)];
        const age = u <= head ? t - (s.t0 + (s.t1 - s.t0) * passedAt(u)) : Infinity;
        const life = Math.max(0, 1 - age / s.linger);
        // Thin at both ends of the cut, and thinning as it fades.
        const w = s.w * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.02, u * (s.taper ?? 1)))), 0.6) * (0.35 + 0.65 * life);
        let dx = q[0] - o[0], dy = q[1] - o[1];
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const nx = -dy * w, ny = dx * w; // the ribbon is twice `w` wide: a soft halo round a `w`-wide stroke
        pos.set([(p[0] - nx) * UNIT, (p[1] - ny) * UNIT, -DEPTH, (p[0] + nx) * UNIT, (p[1] + ny) * UNIT, -DEPTH], i * 6);
        const a = Number.isFinite(age) ? life * life * (s.alpha ?? 1) : 0;
        al[i * 2] = al[i * 2 + 1] = a;
      }
      tr.mesh.geometry.attributes.position.needsUpdate = true;
      tr.mesh.geometry.attributes.aAlpha.needsUpdate = true;
      if (tr.sparks) {
        const g = tr.sparks.obj.geometry, sp = g.attributes.position.array, ss = g.attributes.aSize.array, sa = g.attributes.aAlpha.array;
        tr.sparks.list.forEach((k, i) => {
          const a = t - k.born, on = a >= 0 && a < k.life;
          const drag = 1 - Math.exp(-a * 4);
          sp[i * 3] = (k.x + (k.vx / 4) * drag) * UNIT; sp[i * 3 + 1] = (k.y + (k.vy / 4) * drag) * UNIT; sp[i * 3 + 2] = -DEPTH + 0.01;
          ss[i] = k.size * (on ? 1 - (a / k.life) * 0.5 : 0);
          sa[i] = on ? (1 - a / k.life) * (0.7 + 0.3 * Math.sin(a * 40 + k.tw)) : 0;
        });
        g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
        tr.sparks.obj.material.uniforms.uScale.value = heightPx / 760;
      }
    }
  }

  setVisible(on) { for (const tr of this.live) { tr.mesh.visible = on; if (tr.sparks) tr.sparks.obj.visible = on; } }

  remove(tr) {
    this.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); tr.mesh.material.dispose();
    if (tr.sparks) { this.scene.remove(tr.sparks.obj); tr.sparks.obj.geometry.dispose(); tr.sparks.obj.material.dispose(); }
    this.live.splice(this.live.indexOf(tr), 1);
  }

  clear() { while (this.live.length) this.remove(this.live[0]); }
}

function colorOf(key, colors) {
  if (typeof key === 'number') return key;
  if (key === 'trim' && colors.trim != null) return colors.trim; // the theme's metal (Apogee's gold)
  return (key === 'accent' ? colors.accent ?? colors.glow : colors.glow) ?? 0xffffff;
}
