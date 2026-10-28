// Weapon shine for the first-person viewmodel and the skin menu showcase: glossier materials (a clear coat over
// painted parts), a fresnel rim light, a sheen that sweeps down the gun on draw and inspect, star-like glints on
// the metal of the top tiers, and a glow pulse. The viewmodel also gets its own HDR pass with bloom, so emissive
// lines and bright highlights glow instead of reading as flat coloured stripes (ViewmodelPost below).
// None of this touches the world or other players' guns, so it only costs on the few pixels the gun covers.
import * as THREE from '../vendor/three.module.min.js';
import { SKINS } from './skins.js';

// How much shine each tier gets: rim light, sheen sweep and glints (0 = none).
const TIER = {
  Default: { rim: 0.05, sweep: 0.45, sparkle: 0 },
  Select: { rim: 0.07, sweep: 0.7, sparkle: 0 },
  Premium: { rim: 0.09, sweep: 0.85, sparkle: 0 },
  Exclusive: { rim: 0.11, sweep: 1, sparkle: 0.7 },
  Ultra: { rim: 0.12, sweep: 1.1, sparkle: 1 },
  Custom: { rim: 0.07, sweep: 0.7, sparkle: 0 },
};

// Uniforms one view of a gun shares across all its materials: the inverse of the model's world matrix (so the
// sweep and glints stay put on the gun as it moves), its length along z, the sweep's progress and the glow gain.
export function shineUniforms() {
  return {
    uShineInv: { value: new THREE.Matrix4() },
    uSpan: { value: new THREE.Vector3(-0.5, 0.3, 0.9) }, // z from the muzzle end to the stock end, and the sweep's slant
    uSweep: { value: -10 }, // 0..1 along the gun while sweeping; far outside that when idle
    uTime: { value: 0 },
    uGlowGain: { value: 1 },
  };
}
export const VM_SHINE = shineUniforms();

const SHINE_VERT = 'varying vec3 vShineW;\n';
const SHINE_FRAG = /* glsl */ `
varying vec3 vShineW;
uniform mat4 uShineInv;
uniform vec3 uSpan;
uniform float uSweep, uTime, uGlowGain, uGlowK, uRim, uSweepAmt, uSparkle;
uniform vec3 uRimColor, uSweepColor;
`;
const SHINE_APPLY = /* glsl */ `
{
  vec3 sp = (uShineInv * vec4(vShineW, 1.0)).xyz;
  float ndv = saturate(dot(normalize(normal), normalize(vViewPosition)));
  float fres = pow(1.0 - ndv, 4.0);
  outgoingLight += uRimColor * fres * uRim;
  // The sheen: a bright slanted band with a soft halo, running from the stock to the muzzle.
  float along = (uSpan.y - sp.z) / max(0.05, uSpan.y - uSpan.x) + sp.y * uSpan.z;
  float d = along - uSweep;
  float band = 0.4 * exp(-d * d * 900.0) + 0.06 * exp(-d * d * 120.0);
  outgoingLight += uSweepColor * band * uSweepAmt * (0.35 + 0.8 * fres);
  // Glints: a few points of the surface flare up now and then, brightest at grazing angles.
  if (uSparkle > 0.0) {
    vec3 q = sp * 260.0, cell = floor(q);
    float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float tw = pow(max(0.0, sin(uTime * 2.2 + h * 80.0)), 30.0);
    float pt = smoothstep(0.32, 0.0, length(fract(q) - 0.5));
    outgoingLight += uSweepColor * step(0.975, h) * tw * pt * uSparkle * (4.0 + 6.0 * fres);
  }
}
`;

const hexColor = (n) => new THREE.Color(n);

// Make a viewmodel material shiny, painted slots (body, trim) get a clear coat, so they must become physical
// materials; the rest keep their type. Returns the material to use (possibly a new one). `U` is the shared
// uniform set (VM_SHINE for the viewmodel).
export function shineMaterial(m, U) {
  if (!m?.isMeshStandardMaterial || m.userData.shine) return m;
  const slot = m.userData.slot, s = SKINS[m.userData.skin], tier = TIER[s?.tier] || TIER.Default;
  if ((slot === 'body' || slot === 'trim' || slot === 'tubeBody' || slot === 'tube') && !m.isMeshPhysicalMaterial) {
    const p = new THREE.MeshPhysicalMaterial({
      color: m.color, roughness: m.roughness, metalness: m.metalness, map: m.map, side: m.side,
      emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
      // Lacquer: glossy parts get a strong coat, matte ones a faint sheen of one, as on Valorant's painted guns.
      clearcoat: m.metalness > 0.7 ? 0.2 : m.roughness < 0.5 ? 0.8 : 0.3, clearcoatRoughness: m.roughness < 0.5 ? 0.05 : 0.25,
    });
    p.userData = { ...m.userData };
    m = p;
  }
  if (slot === 'metal') m.envMapIntensity = 1.35;
  const glow = s?.glow?.intensity ? s.glow.color : 0x9fc8ff;
  const isGlow = slot === 'glow' || slot === 'accent' || slot === 'lens';
  const hands = slot === 'sleeve' || slot === 'glove';
  const own = {
    uGlowK: { value: isGlow ? 1 : 0 },
    uRim: { value: hands ? 0.05 : isGlow ? 0 : tier.rim },
    uSweepAmt: { value: hands || slot === 'grip' ? 0 : tier.sweep * (slot === 'metal' ? 1.2 : 1) },
    uSparkle: { value: slot === 'metal' || slot === 'trim' ? tier.sparkle : 0 },
    uRimColor: { value: hexColor(0xffffff).lerp(hexColor(glow), 0.55) },
    uSweepColor: { value: hexColor(0xffffff).lerp(hexColor(glow), 0.25) },
  };
  m.userData.shine = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, own);
    sh.vertexShader = SHINE_VERT + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vShineW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = SHINE_FRAG + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(1.0, uGlowGain, uGlowK);')
      .replace('#include <opaque_fragment>', SHINE_APPLY + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'shine';
  m.needsUpdate = true;
  return m;
}

// Point the shared uniforms at a freshly built model: its length along z, for the sweep.
export function fitShine(model, U) {
  const box = new THREE.Box3().setFromObject(model, true), inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  box.applyMatrix4(inv);
  U.uSpan.value.set(box.min.z, box.max.z, 0.9);
}

// Per frame: keep the sweep and glints fixed on the gun, move the sweep, pulse the glow.
// `sweep` is the sweep's progress (null when none is playing), `flare` adds to the glow (a shot, a draw).
export function updateShine(model, U, t, sweep, flare = 0) {
  model.updateWorldMatrix(true, false);
  U.uShineInv.value.copy(model.matrixWorld).invert();
  U.uTime.value = t;
  U.uSweep.value = sweep == null ? -10 : sweep * 1.6 - 0.3;
  U.uGlowGain.value = 1 + Math.sin(t * 2.1) * 0.07 + flare; // a slow breath, so glow reads as alive
}

// The ease used by a sweep: fast through the middle, gentle at both ends.
export const sweepAt = (k) => (k < 0 || k > 1 ? null : k * k * (3 - 2 * k));

// ---------- viewmodel HDR pass + bloom ----------
const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Bright pass at quarter size: a 4-tap box filter, keeping what's over the threshold (soft knee).
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
void main() {
  vec4 c = 0.25 * (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0))
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)));
  float l = max(c.r, max(c.g, c.b)), k = clamp(l - uThresh + 0.5, 0.0, 1.0);
  float w = max(l - uThresh, 0.5 * k * k) / max(l, 1e-4);
  gl_FragColor = vec4(c.rgb * w, 1.0);
}`;
// Separable gaussian blur, 9 taps folded into 5 bilinear reads.
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
  c += (texture2D(tSrc, vUv + uDir * 1.384615).rgb + texture2D(tSrc, vUv - uDir * 1.384615).rgb) * 0.316216;
  c += (texture2D(tSrc, vUv + uDir * 3.230769).rgb + texture2D(tSrc, vUv - uDir * 3.230769).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;
// Composite over the world: the viewmodel (premultiplied by its coverage) plus its bloom, tone mapped.
const COMP_FRAG = /* glsl */ `
uniform sampler2D tVm, tB1, tB2; uniform float uBloom; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tVm, vUv);
  vec3 b = (texture2D(tB1, vUv).rgb * 0.7 + texture2D(tB2, vUv).rgb * 0.9) * uBloom;
  gl_FragColor = vec4(c.rgb + b, c.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ViewmodelPost {
  constructor() {
    const hdr = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.b = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(1, 1, hdr)); // quarter size x2, eighth size x2
    const mat = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.bright = mat(BRIGHT_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.1 } }, { toneMapped: false });
    this.blur = mat(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, { toneMapped: false });
    this.comp = mat(COMP_FRAG, { tVm: { value: this.rt.texture }, tB1: { value: this.b[0].texture }, tB2: { value: this.b[2].texture }, uBloom: { value: 0.85 } }, {
      transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene();
    this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.clear = new THREE.Color();
    this.w = this.h = 0;
  }

  setSize(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rt.setSize(w, h);
    const q = [Math.ceil(w / 4), Math.ceil(h / 4)], e = [Math.ceil(w / 8), Math.ceil(h / 8)];
    this.b[0].setSize(...q); this.b[1].setSize(...q); this.b[2].setSize(...e); this.b[3].setSize(...e);
  }

  pass(r, material, target) {
    this.quad.material = material;
    r.setRenderTarget(target);
    r.render(this.qScene, this.qCam);
  }

  // Draw `scene` (the viewmodel) over what's already on screen, with bloom on its bright parts.
  render(r, scene, camera) {
    const size = r.getDrawingBufferSize(this.tmp ||= new THREE.Vector2());
    this.setSize(size.x, size.y);
    r.getClearColor(this.clear);
    const alpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    r.setClearColor(this.clear, alpha);
    const [q1, q2, e1, e2] = this.b, br = this.bright.uniforms, bl = this.blur.uniforms;
    br.tSrc.value = this.rt.texture; br.uTexel.value.set(1 / this.w, 1 / this.h);
    this.pass(r, this.bright, q1);
    const blur = (src, dst, dx, dy) => { bl.tSrc.value = src.texture; bl.uDir.value.set(dx / src.width, dy / src.height); this.pass(r, this.blur, dst); };
    blur(q1, q2, 1, 0); blur(q2, q1, 0, 1);
    br.tSrc.value = q1.texture; br.uTexel.value.set(0.5 / q1.width, 0.5 / q1.height);
    bl.tSrc.value = q1.texture; bl.uDir.value.set(0, 0); this.pass(r, this.blur, e1); // plain downsample
    blur(e1, e2, 1.5, 0); blur(e2, e1, 0, 1.5);
    const tm = r.toneMapping, ex = r.toneMappingExposure;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.25; // keeps skin colours true, rolls off highlights
    this.pass(r, this.comp, null);
    r.toneMapping = tm; r.toneMappingExposure = ex;
  }
}
