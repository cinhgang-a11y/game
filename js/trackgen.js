// Procedural track generator. Pure math, no Three.js, so it runs in Node tests.
// blender/build_level.py contains a line-for-line Python port; both must stay in sync.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

function controlPoints(rng, g) {
  const n = g.points;
  let pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rng() - 0.5) * g.angleJitter * (TAU / n);
    const r = g.radius * (1 + (rng() - 0.5) * 2 * g.radiusJitter);
    const y = (rng() - 0.5) * 2 * g.elevation;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  // Insert wiggled midpoints for twistier tracks.
  if (g.wiggle > 0) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      out.push(p);
      const dx = q[0] - p[0], dz = q[2] - p[2];
      const len = Math.hypot(dx, dz);
      const off = (rng() - 0.5) * 2 * g.wiggle * len;
      out.push([(p[0] + q[0]) / 2 + (-dz / len) * off, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + (dx / len) * off]);
    }
    pts = out;
  }
  // Smooth heights so slopes stay drivable.
  const m = pts.length;
  for (let pass = 0; pass < 2; pass++) {
    const ys = pts.map((p) => p[1]);
    for (let i = 0; i < m; i++) pts[i][1] = (ys[(i - 1 + m) % m] + 2 * ys[i] + ys[(i + 1) % m]) / 4;
  }
  return pts;
}

function sampleSpline(ctrl, spacing) {
  const m = ctrl.length;
  const dense = [];
  const sub = 24;
  for (let i = 0; i < m; i++) {
    const p0 = ctrl[(i - 1 + m) % m], p1 = ctrl[i], p2 = ctrl[(i + 1) % m], p3 = ctrl[(i + 2) % m];
    for (let s = 0; s < sub; s++) dense.push(catmullRom(p0, p1, p2, p3, s / sub));
  }
  // Re-sample at equal arc length.
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = cum[dense.length];
  const count = Math.max(64, Math.round(total / spacing));
  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    while (cum[j + 1] < d) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const t = (d - cum[j]) / (cum[j + 1] - cum[j]);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  // Soften height changes along the road (removes steep spots at tight bends).
  for (let pass = 0; pass < 12; pass++) {
    const ys = out.map((p) => p[1]);
    for (let i = 0; i < count; i++) out[i][1] = (ys[(i - 1 + count) % count] + 2 * ys[i] + ys[(i + 1) % count]) / 4;
  }
  return { points: out, length: total };
}

function valueNoiseFactory(rng) {
  // Sum of a few rotated sine waves; cheap, smooth and identical in Python.
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const ang = rng() * TAU;
    const freq = 0.006 * Math.pow(2.1, i);
    waves.push([Math.cos(ang) * freq, Math.sin(ang) * freq, rng() * TAU, 1 / Math.pow(1.9, i)]);
  }
  return (x, z) => {
    let h = 0;
    for (const w of waves) h += Math.sin(x * w[0] + z * w[1] + w[2]) * w[3];
    return h;
  };
}

/**
 * Generate a full level layout from a level definition.
 * Coordinates: x/z ground plane, y up (Three.js / glTF convention).
 */
export function generateTrack(level) {
  const g = level.gen;
  const rng = mulberry32(level.seed);
  const wallOffset = g.width / 2 + 4;
  // Retry with calmer shapes until the track never folds back onto itself.
  let ctrl, points, length;
  for (let attempt = 0; attempt < 8; attempt++) {
    const calm = Math.pow(0.8, attempt);
    const ga = { ...g, radiusJitter: g.radiusJitter * calm, angleJitter: g.angleJitter * calm, wiggle: g.wiggle * calm };
    ctrl = controlPoints(rng, ga);
    ({ points, length } = sampleSpline(ctrl, 2.0));
    if (!selfOverlaps(points, wallOffset)) break;
  }
  const n = points.length;

  const tangents = [], rights = [];
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl; ty /= tl; tz /= tl;
    tangents.push([tx, ty, tz]);
    const rl = Math.hypot(tx, tz);
    rights.push([-tz / rl, 0, tx / rl]);
  }

  // Make the track run clockwise-ish consistently: right vector should point outward.
  // (Not required for gameplay; kept simple.)

  const half = g.width / 2;
  const shoulder = 4; // grass strip between road edge and wall

  // Boost pads and item box rows, from a separate stream so scenery changes don't move them.
  const rngItems = mulberry32(level.seed + 7);
  const boosts = [];
  const nBoost = 3 + Math.floor(rngItems() * 3);
  for (let i = 0; i < nBoost; i++) {
    const idx = Math.floor(((i + 0.3 + rngItems() * 0.4) / nBoost) * n) % n;
    const lat = (rngItems() - 0.5) * (g.width - 5);
    boosts.push({ index: idx, lateral: lat });
  }
  const itemRows = [];
  const nRows = 3;
  for (let i = 0; i < nRows; i++) {
    const idx = Math.floor(((i + 0.5 + (rngItems() - 0.5) * 0.3) / nRows) * n) % n;
    itemRows.push({ index: idx });
  }

  // Scenery props, rejected if too close to the road.
  const rngProps = mulberry32(level.seed + 13);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const margin = 70;
  const bounds = { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
  const props = [];
  const clearance = half + shoulder + 6;
  for (let tries = 0; tries < 900 && props.length < 260; tries++) {
    const x = bounds.minX + rngProps() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rngProps() * (bounds.maxZ - bounds.minZ);
    const rot = rngProps() * TAU;
    const scale = 0.7 + rngProps() * 0.8;
    const variant = Math.floor(rngProps() * 3);
    if (nearestDistance(points, x, z, 3) < clearance) continue;
    props.push({ x, z, rot, scale, variant });
  }

  const noise = valueNoiseFactory(mulberry32(level.seed + 29));

  return {
    level, points, tangents, rights, length, count: n,
    halfWidth: half, shoulder, wallOffset: half + shoulder,
    boosts, itemRows, props, bounds, noise, ctrl,
  };
}

function selfOverlaps(points, wallOffset) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    if (Math.abs(b[1] - a[1]) > 0.3 * Math.hypot(b[0] - a[0], b[2] - a[2])) return true; // too steep
  }
  const minGap = wallOffset * 2 + 5;
  const skip = Math.ceil(wallOffset * 2.5); // samples are ~2m apart
  for (let i = 0; i < n; i += 2) {
    const a = points[i];
    for (let j = i + skip; j < n; j += 2) {
      if (n - (j - i) < skip) break;
      const dx = points[j][0] - a[0], dz = points[j][2] - a[2];
      if (dx * dx + dz * dz < minGap * minGap) return true;
    }
  }
  return false;
}

export function nearestDistance(points, x, z, stride = 1) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += stride) {
    const dx = points[i][0] - x, dz = points[i][2] - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Nearest track sample index + its height, for terrain shaping. */
export function nearestSample(points, x, z, stride = 1) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < points.length; i += stride) {
    const dx = points[i][0] - x, dz = points[i][2] - z;
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  return { index: bi, dist: Math.sqrt(best) };
}

/** Terrain height at (x, z): hugs the track near the road, rolling hills further away. */
export function terrainHeight(track, x, z) {
  const { index, dist } = nearestSample(track.points, x, z, 2);
  const trackY = track.points[index][1] - 1.2;
  const hills = track.noise(x, z) * (4 + track.level.gen.elevation * 0.6) + trackY * 0.3;
  const t = smoothstep(track.wallOffset + 2, track.wallOffset + 40, dist);
  return trackY + (hills - trackY) * t;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
