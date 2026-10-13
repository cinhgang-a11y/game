import * as THREE from 'three';

// Stats are multipliers around 1.0: speed (top speed), accel, handling (turn rate), weight (bumping).
export const MASCOTS = [
  { id: 'bear', name: 'Bruno Bear', color: 0x8b5a2b, stats: { speed: 1.02, accel: 0.96, handling: 0.97, weight: 1.25 } },
  { id: 'penguin', name: 'Pip Penguin', color: 0x222831, stats: { speed: 0.98, accel: 1.04, handling: 1.04, weight: 0.9 } },
  { id: 'fox', name: 'Fizz Fox', color: 0xf2711c, stats: { speed: 1.0, accel: 1.02, handling: 1.03, weight: 0.95 } },
  { id: 'frog', name: 'Hopper Frog', color: 0x4caf50, stats: { speed: 0.97, accel: 1.06, handling: 1.02, weight: 0.85 } },
  { id: 'robot', name: 'Bolt-O Bot', color: 0x9aa5b1, stats: { speed: 1.05, accel: 0.93, handling: 0.96, weight: 1.3 } },
  { id: 'bunny', name: 'Bun Bun', color: 0xf5f0f6, stats: { speed: 0.99, accel: 1.03, handling: 1.06, weight: 0.8 } },
];

export const KARTS = [
  { id: 'classic', name: 'Classic', desc: 'Balanced all-rounder', stats: { speed: 1.0, accel: 1.0, handling: 1.0, weight: 1.0 } },
  { id: 'bolt', name: 'Bolt', desc: 'Fast, but twitchy off the line', stats: { speed: 1.07, accel: 0.9, handling: 0.94, weight: 0.95 } },
  { id: 'monster', name: 'Monster', desc: 'Grippy and heavy', stats: { speed: 0.95, accel: 1.05, handling: 1.1, weight: 1.35 } },
];

export const KART_COLORS = [0xe8413c, 0x2f80ed, 0xf2c94c, 0x27ae60, 0x9b51e0, 0xff7ab6, 0x1abc9c, 0xff8c1a];

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
  return matCache.get(key);
}

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.castShadow = true;
  return m;
}

function eyes(group, y, z, spread, r = 0.11) {
  for (const s of [-1, 1]) {
    const white = mesh(new THREE.SphereGeometry(r, 12, 8), 0xffffff);
    white.position.set(s * spread, y, z);
    const pupil = mesh(new THREE.SphereGeometry(r * 0.55, 10, 6), 0x111111);
    pupil.position.set(s * spread, y, z + r * 0.6);
    group.add(white, pupil);
  }
}

/** Mascot figure, about 1.3 units tall, facing +Z, sitting origin at seat height. */
export function buildMascot(id) {
  const g = new THREE.Group();
  const m = MASCOTS.find((x) => x.id === id) || MASCOTS[0];
  const c = m.color;
  const body = mesh(new THREE.CapsuleGeometry(0.38, 0.35, 6, 12), c);
  body.position.y = 0.45;
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.42, 18, 14), c);
  head.position.y = 1.15;
  g.add(head);
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.15;
  g.add(headGroup);
  const hg = headGroup;

  switch (m.id) {
    case 'bear': {
      for (const s of [-1, 1]) {
        const ear = mesh(new THREE.SphereGeometry(0.15, 10, 8), c);
        ear.position.set(s * 0.3, 0.35, 0);
        hg.add(ear);
      }
      const snout = mesh(new THREE.SphereGeometry(0.18, 12, 8), 0xd9b38c);
      snout.scale.set(1.1, 0.8, 1);
      snout.position.set(0, -0.08, 0.36);
      const nose = mesh(new THREE.SphereGeometry(0.06, 8, 6), 0x111111);
      nose.position.set(0, -0.02, 0.52);
      hg.add(snout, nose);
      eyes(hg, 0.08, 0.34, 0.15, 0.08);
      break;
    }
    case 'penguin': {
      const belly = mesh(new THREE.SphereGeometry(0.33, 14, 10), 0xffffff);
      belly.scale.set(1, 1.2, 0.6);
      belly.position.set(0, 0.45, 0.2);
      const face = mesh(new THREE.SphereGeometry(0.3, 14, 10), 0xffffff);
      face.scale.set(1, 0.9, 0.6);
      face.position.set(0, -0.05, 0.2);
      const beak = mesh(new THREE.ConeGeometry(0.09, 0.25, 8), 0xff9f1c);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, -0.05, 0.5);
      g.add(belly);
      hg.add(face, beak);
      eyes(hg, 0.1, 0.33, 0.13, 0.08);
      break;
    }
    case 'fox': {
      for (const s of [-1, 1]) {
        const ear = mesh(new THREE.ConeGeometry(0.13, 0.35, 4), c);
        ear.position.set(s * 0.24, 0.42, 0);
        hg.add(ear);
      }
      const snout = mesh(new THREE.ConeGeometry(0.17, 0.4, 8), 0xffffff);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, -0.1, 0.42);
      const nose = mesh(new THREE.SphereGeometry(0.05, 8, 6), 0x111111);
      nose.position.set(0, -0.1, 0.62);
      const tail = mesh(new THREE.ConeGeometry(0.18, 0.7, 8), c);
      tail.rotation.x = -Math.PI / 2.6;
      tail.position.set(0, 0.35, -0.55);
      hg.add(snout, nose);
      g.add(tail);
      eyes(hg, 0.08, 0.33, 0.15, 0.08);
      break;
    }
    case 'frog': {
      head.scale.set(1.15, 0.8, 1);
      for (const s of [-1, 1]) {
        const bump = mesh(new THREE.SphereGeometry(0.16, 12, 8), c);
        bump.position.set(s * 0.22, 0.28, 0.12);
        const w = mesh(new THREE.SphereGeometry(0.11, 10, 8), 0xffffff);
        w.position.set(s * 0.22, 0.32, 0.22);
        const p = mesh(new THREE.SphereGeometry(0.06, 8, 6), 0x111111);
        p.position.set(s * 0.22, 0.32, 0.31);
        hg.add(bump, w, p);
      }
      const mouth = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI), 0x1b5e20);
      mouth.rotation.z = Math.PI;
      mouth.position.set(0, -0.05, 0.38);
      hg.add(mouth);
      break;
    }
    case 'robot': {
      head.visible = false;
      const box = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), c, { metalness: 0.6, roughness: 0.3 });
      const visor = mesh(new THREE.BoxGeometry(0.55, 0.18, 0.05), 0x00e5ff, { emissive: 0x00e5ff, emissiveIntensity: 1.2 });
      visor.position.set(0, 0.05, 0.31);
      const ant = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35), 0x333333);
      ant.position.y = 0.45;
      const bulb = mesh(new THREE.SphereGeometry(0.07, 8, 6), 0xff3b3b, { emissive: 0xff3b3b, emissiveIntensity: 1 });
      bulb.position.y = 0.65;
      hg.add(box, visor, ant, bulb);
      break;
    }
    case 'bunny': {
      for (const s of [-1, 1]) {
        const ear = mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 8), c);
        ear.position.set(s * 0.15, 0.6, -0.05);
        ear.rotation.z = s * -0.15;
        const inner = mesh(new THREE.CapsuleGeometry(0.04, 0.4, 4, 8), 0xffb6c8);
        inner.position.set(s * 0.15, 0.6, 0.02);
        inner.rotation.z = s * -0.15;
        hg.add(ear, inner);
      }
      const nose = mesh(new THREE.SphereGeometry(0.05, 8, 6), 0xff7aa2);
      nose.position.set(0, -0.05, 0.42);
      hg.add(nose);
      eyes(hg, 0.08, 0.35, 0.15, 0.09);
      break;
    }
  }
  // Little arms holding the wheel.
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.35, 4, 8), c);
    arm.rotation.x = Math.PI / 2.4;
    arm.position.set(s * 0.32, 0.6, 0.3);
    g.add(arm);
  }
  g.userData.head = headGroup;
  return g;
}

function wheel(radius, width) {
  const w = new THREE.Group();
  const tire = mesh(new THREE.CylinderGeometry(radius, radius, width, 16), 0x1d1d1d, { roughness: 0.9 });
  tire.rotation.z = Math.PI / 2;
  const hub = mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 10), 0xd0d0d0, { metalness: 0.7, roughness: 0.3 });
  hub.rotation.z = Math.PI / 2;
  w.add(tire, hub);
  return w;
}

/** Kart with mascot seated. Facing +Z. Returns group with userData.wheels / frontWheels / mascot. */
export function buildKart(kartId, color, mascotId) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const wheels = [], front = [];
  let seatY = 0.55, seatZ = -0.2;

  const addWheel = (x, y, z, r, w, isFront) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const wh = wheel(r, w);
    pivot.add(wh);
    g.add(pivot);
    wheels.push(wh);
    if (isFront) front.push(pivot);
  };

  if (kartId === 'bolt') {
    const chassis = mesh(new THREE.BoxGeometry(1.5, 0.3, 2.8), color, { metalness: 0.3, roughness: 0.35 });
    chassis.position.y = 0.4;
    const nose = mesh(new THREE.ConeGeometry(0.75, 1.2, 4), color, { metalness: 0.3, roughness: 0.35 });
    nose.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    nose.scale.set(1, 1, 0.4);
    nose.position.set(0, 0.42, 1.9);
    const spoiler = mesh(new THREE.BoxGeometry(1.8, 0.08, 0.45), 0x111111);
    spoiler.position.set(0, 1.05, -1.35);
    for (const s of [-1, 1]) {
      const strut = mesh(new THREE.BoxGeometry(0.06, 0.5, 0.2), 0x111111);
      strut.position.set(s * 0.6, 0.78, -1.3);
      body.add(strut);
    }
    const stripe = mesh(new THREE.BoxGeometry(0.3, 0.31, 2.82), 0xffffff);
    stripe.position.y = 0.41;
    body.add(chassis, nose, spoiler, stripe);
    addWheel(-0.85, 0.35, 1.05, 0.35, 0.3, true);
    addWheel(0.85, 0.35, 1.05, 0.35, 0.3, true);
    addWheel(-0.9, 0.45, -1.0, 0.45, 0.45, false);
    addWheel(0.9, 0.45, -1.0, 0.45, 0.45, false);
    seatY = 0.5;
  } else if (kartId === 'monster') {
    const chassis = mesh(new THREE.BoxGeometry(1.6, 0.6, 2.4), color, { roughness: 0.5 });
    chassis.position.y = 1.0;
    const bumper = mesh(new THREE.BoxGeometry(1.8, 0.25, 0.3), 0x333333);
    bumper.position.set(0, 0.85, 1.3);
    const rollbar = mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 16, Math.PI), 0x333333);
    rollbar.position.set(0, 1.3, -0.75);
    for (const s of [-1, 1]) {
      const light = mesh(new THREE.SphereGeometry(0.12, 8, 6), 0xfff6a0, { emissive: 0xfff6a0, emissiveIntensity: 0.8 });
      light.position.set(s * 0.55, 1.15, 1.2);
      body.add(light);
    }
    body.add(chassis, bumper, rollbar);
    for (const [x, z, f] of [[-1, 0.95, true], [1, 0.95, true], [-1, -0.95, false], [1, -0.95, false]]) addWheel(x, 0.6, z, 0.6, 0.5, f);
    seatY = 1.25;
  } else {
    const chassis = mesh(new THREE.BoxGeometry(1.5, 0.4, 2.6), color, { roughness: 0.45 });
    chassis.position.y = 0.45;
    const front = mesh(new THREE.BoxGeometry(1.3, 0.35, 0.6), color, { roughness: 0.45 });
    front.position.set(0, 0.7, 1.0);
    const bumper = mesh(new THREE.BoxGeometry(1.7, 0.2, 0.3), 0x222222);
    bumper.position.set(0, 0.35, 1.4);
    const engine = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10), 0x777777, { metalness: 0.8, roughness: 0.3 });
    engine.rotation.x = Math.PI / 2;
    engine.position.set(0, 0.75, -1.15);
    const steering = mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), 0x222222);
    steering.position.set(0, 1.0, 0.55);
    steering.rotation.x = -0.6;
    body.add(chassis, front, bumper, engine, steering);
    for (const [x, z, f] of [[-0.85, 0.95, true], [0.85, 0.95, true], [-0.9, -0.95, false], [0.9, -0.95, false]]) addWheel(x, 0.38, z, 0.38, 0.35, f);
  }

  const mascot = buildMascot(mascotId);
  mascot.position.set(0, seatY, seatZ);
  mascot.scale.setScalar(0.9);
  g.add(mascot);

  // Boost flame (hidden by default).
  const flame = mesh(new THREE.ConeGeometry(0.25, 1.0, 10), 0xffa21f, { emissive: 0xff6a00, emissiveIntensity: 2, transparent: true, opacity: 0.85 });
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.6, -1.7);
  flame.visible = false;
  g.add(flame);

  g.userData = { wheels, frontWheels: front, mascot, flame, body, color };
  return g;
}

export function combinedStats(mascotId, kartId) {
  const a = (MASCOTS.find((m) => m.id === mascotId) || MASCOTS[0]).stats;
  const b = (KARTS.find((k) => k.id === kartId) || KARTS[0]).stats;
  return { speed: a.speed * b.speed, accel: a.accel * b.accel, handling: a.handling * b.handling, weight: a.weight * b.weight };
}
