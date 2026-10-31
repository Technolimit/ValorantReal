// Flat white side-on silhouettes of the guns for the buy menu, rendered once from the game's own models
// (models.js) into PNG blob URLs. Muzzle to the right, trimmed to the gun, on a transparent background.
// Drawing all of them took a few hundred ms, which froze the first opening of the buy menu, so warmGunIcons
// draws them in the background (one gun per idle moment) from page load; gunIcons finishes any left over.
import * as THREE from '../vendor/three.module.min.js';
import { gunModel } from './models.js';

const W = 320, H = 112, PAD = 0.06;
const cache = {};
let ctx = null, queue = [], failed = false, timer = 0;

// The offscreen renderer, its scene and camera, made on first use and dropped once every icon is drawn.
function setup() {
  if (ctx || failed) return ctx;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    ctx = { r, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20) };
  } catch { failed = true; } // no WebGL: the cards fall back to names only
  return ctx;
}

function teardown() {
  if (!ctx) return;
  ctx.scene.overrideMaterial.dispose();
  ctx.r.dispose();
  ctx.r.forceContextLoss?.();
  ctx = null;
}

function draw(id) {
  if (!id || cache[id] || !setup()) return;
  const { r, scene, cam } = ctx;
  const m = gunModel(id, 'standard', { noHands: true });
  const pivot = new THREE.Group();
  pivot.rotation.y = -Math.PI / 2; // barrel along +x
  pivot.add(m);
  scene.add(pivot);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  // Fit the longer of length / height into the frame, keeping the canvas aspect.
  const half = Math.max(s.x / 2 / (1 - PAD * 2), (s.y / 2) / (1 - PAD * 2) * (W / H)) || 0.5;
  cam.left = -half; cam.right = half; cam.top = half * H / W; cam.bottom = -half * H / W;
  cam.position.set(c.x, c.y, c.z + 5);
  cam.lookAt(c.x, c.y, c.z);
  cam.updateProjectionMatrix();
  r.clear();
  r.render(scene, cam);
  cache[id] = blobUrl(r.domElement.toDataURL('image/png'));
  scene.remove(pivot);
  pivot.traverse(o => o.geometry?.dispose()); // the model was only needed for this one picture
}

// Starts drawing the icons for these guns in the background. Safe to call more than once.
export function warmGunIcons(ids) {
  for (const id of ids) if (!cache[id] && !queue.includes(id)) queue.push(id);
  if (!timer) schedule();
}

function schedule() {
  timer = typeof requestIdleCallback === 'function' ? requestIdleCallback(step, { timeout: 250 }) : setTimeout(step, 30);
}

function step(idle) {
  timer = 0;
  // One gun per idle moment (more while the browser says it has time), so a frame never waits on more than
  // a few ms of this.
  do draw(queue.shift()); while (queue.length && !failed && idle?.timeRemaining?.() > 12);
  if (!queue.length || failed) { queue = []; teardown(); return; }
  schedule();
}

// The icons for these guns, drawing any the background hasn't reached yet.
export function gunIcons(ids) {
  const missing = ids.filter(id => !cache[id]);
  if (missing.length && !failed) {
    for (const id of missing) draw(id);
    queue = queue.filter(id => !cache[id]);
    if (!queue.length) teardown();
  }
  return cache;
}

// A short blob: URL for the PNG instead of the long data: URL, so the shop's markup stays small to parse
// and every card showing the same gun shares one decoded image.
function blobUrl(dataUrl) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}
