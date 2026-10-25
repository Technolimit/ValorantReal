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

// rayAABB without the result object, for the loops below that test hundreds of boxes per ray: returns the entry
// distance (or -1 for a miss) and leaves the exit distance and the entry axis in rayOut/rayAxis.
let rayOut = 0, rayAxis = -1;
function rayHit(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1;
  for (let i = 0; i < 3; i++) {
    const di = d[i];
    if (di < 1e-12 && di > -1e-12) {
      if (o[i] < min[i] || o[i] > max[i]) return -1;
      continue;
    }
    const inv = 1 / di;
    let t1 = (min[i] - o[i]) * inv, t2 = (max[i] - o[i]) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) { tmin = t1; axis = i; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  rayOut = tmax; rayAxis = axis;
  return tmin > 0 ? tmin : 0;
}

// The map's own boxes are filed in a grid of CELL-metre columns (on x and z), so a movement check or a ray only
// tests the boxes near it instead of all of them (Divide has close to 900). Temporary boxes (walls, barriers) are
// few and come and go, so they are always tested. Results are the same as testing every box in list order.
const CELL = 4;

export class World {
  constructor(boxes) {
    this.boxes = boxes;
    this.stamp = 0;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const fixed = boxes.filter(b => !b.temp);
    for (const b of fixed) { x0 = Math.min(x0, b.min[0]); z0 = Math.min(z0, b.min[2]); x1 = Math.max(x1, b.max[0]); z1 = Math.max(z1, b.max[2]); }
    if (!fixed.length) x0 = z0 = x1 = z1 = 0;
    this.gx = x0; this.gz = z0;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / CELL) + 1); this.nz = Math.max(1, Math.ceil((z1 - z0) / CELL) + 1);
    this.cells = Array.from({ length: this.nx * this.nz }, () => []);
    this.fixed = new Set(fixed);
    boxes.forEach((b, i) => { b._order = i; b._seen = 0; });
    for (const b of fixed) {
      const [cx0, cz0] = this.cellOf(b.min[0], b.min[2]), [cx1, cz1] = this.cellOf(b.max[0], b.max[2]);
      for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) this.cells[z * this.nx + x].push(b);
    }
    this.extra = [];
    this.extraKey = null;
    this.nextOrder = boxes.length;
  }

  cellOf(x, z) {
    return [Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.gx) / CELL))), Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.gz) / CELL)))];
  }

  // The boxes that aren't in the grid (pushed on or spliced off this.boxes since), kept in list order.
  temps() {
    const bs = this.boxes, n = bs.length, last = bs[n - 1];
    if (this.extraKey !== last || this.extraLen !== n) {
      this.extra = bs.filter(b => !this.fixed.has(b));
      for (const b of this.extra) if (b._order === undefined) { b._order = this.nextOrder++; b._seen = 0; }
      this.extraKey = last; this.extraLen = n;
    }
    return this.extra;
  }

  // Calls fn(box) once for each box that can touch the x/z rectangle; stops when fn returns true.
  near(minx, minz, maxx, maxz, fn) {
    const st = ++this.stamp;
    const [cx0, cz0] = this.cellOf(minx, minz), [cx1, cz1] = this.cellOf(maxx, maxz);
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
      for (const b of this.cells[z * this.nx + x]) { if (b._seen === st) continue; b._seen = st; if (fn(b)) return; }
    }
    for (const b of this.temps()) if (fn(b)) return;
  }

  // Calls fn(box) for each grid box in the cells the ray passes through, nearest cell first; stops when fn returns
  // true, or after a cell when done(t where the ray leaves it) does. Callers test this.temps() themselves.
  along(o, d, maxT, fn, done) {
    const st = ++this.stamp;
    const fx = (o[0] - this.gx) / CELL, fz = (o[2] - this.gz) / CELL;
    // Clip the ray to the grid's rectangle; outside it there are no grid boxes.
    let t0 = 0, t1 = maxT;
    for (const [p, dd, n] of [[fx, d[0] / CELL, this.nx], [fz, d[2] / CELL, this.nz]]) {
      if (Math.abs(dd) < 1e-12) { if (p < 0 || p >= n) t1 = -1; continue; }
      let a = (0 - p) / dd, b = (n - p) / dd;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
    }
    if (t0 <= t1) {
      const sx = d[0] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
      const px = fx + (d[0] / CELL) * t0, pz = fz + (d[2] / CELL) * t0;
      let cx = Math.min(this.nx - 1, Math.max(0, Math.floor(px))), cz = Math.min(this.nz - 1, Math.max(0, Math.floor(pz)));
      const dx = d[0] / CELL, dz = d[2] / CELL;
      const stepX = Math.abs(dx) < 1e-12 ? Infinity : Math.abs(1 / dx), stepZ = Math.abs(dz) < 1e-12 ? Infinity : Math.abs(1 / dz);
      let nextX = Math.abs(dx) < 1e-12 ? Infinity : t0 + ((sx > 0 ? cx + 1 - px : px - cx) * stepX);
      let nextZ = Math.abs(dz) < 1e-12 ? Infinity : t0 + ((sz > 0 ? cz + 1 - pz : pz - cz) * stepZ);
      for (;;) {
        const exit = Math.min(nextX, nextZ, t1);
        for (const b of this.cells[cz * this.nx + cx]) { if (b._seen === st) continue; b._seen = st; if (fn(b)) return; }
        if (exit >= t1 || (done && done(exit))) break;
        if (nextX < nextZ) { cx += sx; nextX += stepX; if (cx < 0 || cx >= this.nx) break; }
        else { cz += sz; nextZ += stepZ; if (cz < 0 || cz >= this.nz) break; }
      }
    }
  }

  // Movement collision. Boxes marked `passable` (Rift Line) block bullets and sight but not players.
  overlap(minx, miny, minz, maxx, maxy, maxz) {
    const e = 1e-5;
    let found = null;
    this.near(minx, minz, maxx, maxz, (b) => {
      if (b.passable || (found && b._order > found._order)) return false;
      if (minx < b.max[0] - e && maxx > b.min[0] + e &&
          miny < b.max[1] - e && maxy > b.min[1] + e &&
          minz < b.max[2] - e && maxz > b.min[2] + e) found = b;
      return false;
    });
    return found;
  }

  overlapAll(minx, miny, minz, maxx, maxy, maxz, out) {
    const e = 1e-5;
    out.length = 0;
    this.near(minx, minz, maxx, maxz, (b) => {
      if (!b.passable &&
          minx < b.max[0] - e && maxx > b.min[0] + e &&
          miny < b.max[1] - e && maxy > b.min[1] + e &&
          minz < b.max[2] - e && maxz > b.min[2] + e) out.push(b);
      return false;
    });
    if (out.length > 1) out.sort((a, b) => a._order - b._order);
    return out;
  }

  // Nearest solid surface along the ray.
  raycast(o, d, maxT) {
    let best = null, bestT = Infinity, bestAxis = -1;
    const test = (b) => {
      const t = rayHit(o, d, b.min, b.max);
      if (t >= 0 && t <= maxT && (t < bestT || (t === bestT && b._order < best._order))) { best = b; bestT = t; bestAxis = rayAxis; }
    };
    // Once the nearest hit is inside the cell being walked, no box in a later cell can be nearer.
    this.along(o, d, maxT, test, (exit) => best !== null && bestT < exit);
    for (const b of this.temps()) test(b);
    if (!best) return null;
    const hit = { t: bestT, box: best, axis: bestAxis };
    hit.n = normalOf(hit, d);
    return hit;
  }

  // Every box the ray crosses, ordered by entry distance.
  raycastAll(o, d, maxT) {
    const hits = [];
    const test = (b) => {
      const t = rayHit(o, d, b.min, b.max);
      if (t >= 0 && t <= maxT) hits.push({ tIn: t, tOut: Math.min(rayOut, maxT), box: b, n: normalOf({ axis: rayAxis }, d) });
      return false;
    };
    this.along(o, d, maxT, test);
    for (const b of this.temps()) test(b);
    hits.sort((a, b) => a.tIn - b.tIn || a.box._order - b.box._order);
    return hits;
  }

  lineOfSight(a, b) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return true;
    d[0] /= len; d[1] /= len; d[2] /= len;
    let clear = true;
    const test = (box) => {
      const t = rayHit(a, d, box.min, box.max);
      if (t >= 0 && t < len - 0.05) clear = false;
      return !clear;
    };
    this.along(a, d, len, test);
    if (clear) for (const b of this.temps()) if (test(b)) break;
    return clear;
  }
}
