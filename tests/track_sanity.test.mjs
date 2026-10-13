// Ensures generated tracks don't overlap themselves and slopes are drivable.
// Run: node tests/track_sanity.test.mjs
import { LEVELS, randomLevel } from '../js/levels.js';
import { generateTrack } from '../js/trackgen.js';

const seeds = Array.from({ length: 60 }, (_, i) => 1 + i * 16661);
const levels = [...LEVELS, ...seeds.map(randomLevel)];
let bad = 0;
for (const lv of levels) {
  const t = generateTrack(lv);
  const n = t.count, P = t.points;
  let minGap = Infinity, maxSlope = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    maxSlope = Math.max(maxSlope, Math.abs(b[1] - a[1]) / Math.hypot(b[0] - a[0], b[2] - a[2]));
    for (let j = i + 1; j < n; j++) {
      const sep = Math.min(j - i, n - (j - i));
      if (sep < Math.ceil(t.wallOffset * 2.5)) continue; // neighbours along the track
      minGap = Math.min(minGap, Math.hypot(P[j][0] - a[0], P[j][2] - a[2]));
    }
  }
  const ok = minGap > t.wallOffset * 2 + 2 && maxSlope < 0.35;
  if (!ok) { bad++; console.log(`FAIL ${lv.name}: gap ${minGap.toFixed(1)} (need ${(t.wallOffset * 2 + 2).toFixed(1)}), slope ${maxSlope.toFixed(2)}`); }
}
console.log(`${levels.length - bad}/${levels.length} tracks OK`);
process.exit(bad ? 1 : 0);
