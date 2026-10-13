// Level definitions. Keep in sync with LEVELS in blender/build_level.py
// (tests/parity.test.mjs checks that both sides produce identical tracks).

export const THEMES = {
  meadow: {
    name: 'Meadow', sky: 0x8fd3ff, fog: 0xbfe6ff, ground: 0x5fbf4a, groundAlt: 0x4aa83a,
    road: 0x4a4a55, curb: [0xffffff, 0xe8413c], wall: 0xf2c94c, props: 'trees', sun: 0xfff3d6,
  },
  desert: {
    name: 'Desert', sky: 0xffd59e, fog: 0xffe2b8, ground: 0xe8b86b, groundAlt: 0xd9a352,
    road: 0x6b5a4a, curb: [0xffffff, 0x2f80ed], wall: 0xb5651d, props: 'cacti', sun: 0xffe0b0,
  },
  snow: {
    name: 'Snow', sky: 0xb8d8f0, fog: 0xe6f2fb, ground: 0xf4f8fc, groundAlt: 0xdde8f2,
    road: 0x5a6578, curb: [0xffffff, 0x2d9cdb], wall: 0x9fc6e8, props: 'pines', sun: 0xffffff,
  },
  candy: {
    name: 'Candy', sky: 0xffc6e8, fog: 0xffe0f2, ground: 0xff9ecf, groundAlt: 0xf78bc2,
    road: 0x7b4fa0, curb: [0xffffff, 0xff5aa5], wall: 0x7ee0d6, props: 'lollipops', sun: 0xfff0fa,
  },
  lava: {
    name: 'Volcano', sky: 0x3a1a1a, fog: 0x5a2418, ground: 0x2b2222, groundAlt: 0x3a2b26,
    road: 0x2a2a30, curb: [0xffd23f, 0x1a1a1a], wall: 0xff6a00, props: 'rocks', sun: 0xffb27a,
  },
  space: {
    name: 'Space', sky: 0x0b0b2b, fog: 0x161645, ground: 0x2a2a5a, groundAlt: 0x35356e,
    road: 0x1c1c3a, curb: [0x00e5ff, 0xff00d4], wall: 0x7b61ff, props: 'crystals', sun: 0xc9c9ff,
  },
};

export const THEME_ORDER = ['meadow', 'desert', 'snow', 'candy', 'lava', 'space'];

// Track generator parameters:
//   points        control points around the loop
//   radius        base loop radius (world units ~ metres)
//   radiusJitter  0..0.5, how far points wander in/out
//   angleJitter   0..0.8, how unevenly points are spread
//   wiggle        perpendicular displacement of inserted mid points (fraction of segment)
//   elevation     max hill height
//   width         road width
export const LEVELS = [
  { id: 1, name: 'Meadow Mile', theme: 'meadow', seed: 1101, laps: 3, ai: 5, aiSkill: 0.80,
    gen: { points: 8, radius: 120, radiusJitter: 0.22, angleJitter: 0.35, wiggle: 0.0, elevation: 3, width: 16 } },
  { id: 2, name: 'Dune Dash', theme: 'desert', seed: 2202, laps: 3, ai: 5, aiSkill: 0.85,
    gen: { points: 9, radius: 135, radiusJitter: 0.28, angleJitter: 0.45, wiggle: 0.08, elevation: 6, width: 15 } },
  { id: 3, name: 'Frosty Peaks', theme: 'snow', seed: 3303, laps: 3, ai: 6, aiSkill: 0.89,
    gen: { points: 10, radius: 145, radiusJitter: 0.30, angleJitter: 0.5, wiggle: 0.12, elevation: 12, width: 14 } },
  { id: 4, name: 'Candy Canyon', theme: 'candy', seed: 4404, laps: 3, ai: 6, aiSkill: 0.92,
    gen: { points: 11, radius: 150, radiusJitter: 0.33, angleJitter: 0.55, wiggle: 0.18, elevation: 9, width: 13.5 } },
  { id: 5, name: 'Lava Loop', theme: 'lava', seed: 5505, laps: 3, ai: 7, aiSkill: 0.95,
    gen: { points: 12, radius: 160, radiusJitter: 0.35, angleJitter: 0.6, wiggle: 0.2, elevation: 16, width: 13 } },
  { id: 6, name: 'Star Circuit', theme: 'space', seed: 6606, laps: 3, ai: 7, aiSkill: 0.99,
    gen: { points: 14, radius: 175, radiusJitter: 0.36, angleJitter: 0.6, wiggle: 0.22, elevation: 20, width: 12 } },
];

// Endless mode: any seed becomes a level with difficulty scaled from 0..1.
export function randomLevel(seed) {
  const d = ((seed * 2654435761) >>> 0) / 4294967296; // stable 0..1 from seed
  const theme = THEME_ORDER[seed % THEME_ORDER.length];
  return {
    id: 0, name: `Random #${seed}`, theme, seed, laps: 3, ai: 6, aiSkill: 0.85 + d * 0.12,
    gen: {
      points: 8 + Math.floor(d * 7), radius: 125 + d * 50, radiusJitter: 0.22 + d * 0.14,
      angleJitter: 0.35 + d * 0.25, wiggle: d * 0.22, elevation: 3 + d * 17, width: 16 - d * 4,
    },
  };
}
