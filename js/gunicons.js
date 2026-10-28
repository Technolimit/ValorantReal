// Flat white side-on silhouettes of the guns for the buy menu, rendered once from the game's own models
// (models.js) into PNG data URLs. Muzzle to the right, trimmed to the gun, on a transparent background.
import * as THREE from '../vendor/three.module.min.js';
import { gunModel } from './models.js';

const W = 320, H = 112, PAD = 0.06;
let cache = null;

export function gunIcons(ids) {
  if (cache) return cache;
  cache = {};
  let r;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return cache; } // no WebGL: the cards fall back to names only
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  for (const id of ids) {
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
    cache[id] = r.domElement.toDataURL('image/png');
    scene.remove(pivot);
  }
  r.dispose();
  r.forceContextLoss?.();
  return cache;
}
