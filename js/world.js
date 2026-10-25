// Axis-aligned box world: overlap tests for movement and ray casts for bullets and line of sight.

export function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv, t2 = (max[i] - o[i]) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) { tmin = t1; axis = i; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { tIn: Math.max(0, tmin), tOut: tmax, axis };
}

function normalOf(hit, d) {
  const n = [0, 0, 0];
  if (hit.axis >= 0) n[hit.axis] = d[hit.axis] > 0 ? -1 : 1;
  return n;
}

export class World {
  constructor(boxes) {
    this.boxes = boxes;
  }

  // Movement collision. Boxes marked `passable` (Rift Line) block bullets and sight but not players.
  overlap(minx, miny, minz, maxx, maxy, maxz) {
    const e = 1e-5;
    for (const b of this.boxes) {
      if (b.passable) continue;
      if (minx < b.max[0] - e && maxx > b.min[0] + e &&
          miny < b.max[1] - e && maxy > b.min[1] + e &&
          minz < b.max[2] - e && maxz > b.min[2] + e) return b;
    }
    return null;
  }

  overlapAll(minx, miny, minz, maxx, maxy, maxz, out) {
    const e = 1e-5;
    out.length = 0;
    for (const b of this.boxes) {
      if (b.passable) continue;
      if (minx < b.max[0] - e && maxx > b.min[0] + e &&
          miny < b.max[1] - e && maxy > b.min[1] + e &&
          minz < b.max[2] - e && maxz > b.min[2] + e) out.push(b);
    }
    return out;
  }

  // Nearest solid surface along the ray.
  raycast(o, d, maxT) {
    let best = null;
    for (const b of this.boxes) {
      const h = rayAABB(o, d, b.min, b.max);
      if (h && h.tIn <= maxT && (!best || h.tIn < best.t)) best = { t: h.tIn, box: b, axis: h.axis };
    }
    if (best) best.n = normalOf(best, d);
    return best;
  }

  // Every box the ray crosses, ordered by entry distance.
  raycastAll(o, d, maxT) {
    const hits = [];
    for (const b of this.boxes) {
      const h = rayAABB(o, d, b.min, b.max);
      if (h && h.tIn <= maxT) hits.push({ tIn: h.tIn, tOut: Math.min(h.tOut, maxT), box: b, n: normalOf(h, d) });
    }
    hits.sort((a, b) => a.tIn - b.tIn);
    return hits;
  }

  lineOfSight(a, b) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return true;
    d[0] /= len; d[1] /= len; d[2] /= len;
    for (const box of this.boxes) {
      const h = rayAABB(a, d, box.min, box.max);
      if (h && h.tIn < len - 0.05) return false;
    }
    return true;
  }
}
