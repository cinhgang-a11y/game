// Checks the JS generator (game) and the Python port (Blender) build identical tracks.
// Run: node tests/parity.test.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LEVELS, randomLevel } from '../js/levels.js';
import { generateTrack, terrainHeight } from '../js/trackgen.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const py = JSON.parse(execFileSync('python3', [path.join(here, 'dump_track.py')], { maxBuffer: 1 << 26 }).toString());
const levels = [...LEVELS, ...[7, 4242, 999999].map(randomLevel)];

let failures = 0;
const close = (a, b, what) => {
  if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) { failures++; if (failures < 20) console.error(`MISMATCH ${what}: js=${a} py=${b}`); }
};
const same = (a, b, what) => { if (a !== b) { failures++; if (failures < 20) console.error(`MISMATCH ${what}: js=${a} py=${b}`); } };

levels.forEach((lv, li) => {
  const p = py[li];
  const t = generateTrack(lv);
  const tag = lv.name;
  for (const k of Object.keys(lv.gen)) close(lv.gen[k], p.level.gen[k], `${tag} gen.${k}`);
  for (const k of ['seed', 'ai', 'laps', 'theme', 'name']) same(lv[k], p.level[k], `${tag} ${k}`);
  close(lv.aiSkill, p.level.aiSkill, `${tag} aiSkill`);
  same(t.count, p.count, `${tag} count`);
  close(t.length, p.length, `${tag} length`);
  t.points.filter((_, i) => i % 7 === 0).forEach((q, i) => q.forEach((v, k) => close(v, p.points[i][k], `${tag} point ${i}`)));
  same(t.boosts.length, p.boosts.length, `${tag} boosts`);
  t.boosts.forEach((b, i) => { same(b.index, p.boosts[i].index, `${tag} boost idx`); close(b.lateral, p.boosts[i].lateral, `${tag} boost lat`); });
  t.itemRows.forEach((r, i) => same(r.index, p.itemRows[i].index, `${tag} item row`));
  const props = t.props.filter((_, i) => i % 5 === 0);
  same(props.length, p.props.length, `${tag} props`);
  props.forEach((q, i) => { close(q.x, p.props[i].x, `${tag} prop x`); same(q.variant, p.props[i].variant, `${tag} prop variant`); });
  [[0, 0], [50, -80], [-200, 120]].forEach(([x, z], i) => close(terrainHeight(t, x, z), p.terrain[i], `${tag} terrain`));
  console.log(`${failures ? '…' : 'ok'} ${tag}: ${t.count} samples, ${t.length.toFixed(0)}m, ${t.props.length} props`);
});

if (failures) { console.error(`${failures} mismatches`); process.exit(1); }
console.log('JS and Blender generators match.');
