import * as THREE from 'three';

const MAX_SPEED = 34;   // m/s
const ACCEL = 20;
const BRAKE = 38;
const REVERSE_MAX = 9;
const TURN = 2.1;       // rad/s at full lock
const KART_RADIUS = 1.3;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const ITEMS = {
  turbo: { name: 'Turbo', icon: '🔥' },
  triple: { name: 'Triple Turbo', icon: '🔥🔥🔥' },
  banana: { name: 'Banana', icon: '🍌' },
  shield: { name: 'Bubble Shield', icon: '🫧' },
};

export class Racer {
  constructor({ track, mesh, stats, isPlayer = false, name, aiSkill = 0.9, slot = 0 }) {
    this.track = track;
    this.mesh = mesh;
    this.stats = stats;
    this.isPlayer = isPlayer;
    this.name = name;
    this.aiSkill = aiSkill;
    this.seed = slot * 1.7 + 0.3;
    this.lane = ((slot % 3) - 1) * (track.halfWidth * 0.35);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.idx = 0;
    this.lateral = 0;
    this.lap = 0;
    this.checkpoint = true;
    this.finished = false;
    this.finishTime = 0;
    this.boost = 0;
    this.spin = 0;
    this.shield = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.hop = 0;
    this.item = null;
    this.itemUses = 0;
    this.stuck = 0;
    this.aiItemTimer = 2 + Math.random() * 4;
    this.wheelSpin = 0;
    this.visualYaw = 0;
    this.offroad = false;
    this.events = []; // sound/feedback events for main loop
  }

  placeOnGrid(slot) {
    const t = this.track, n = t.count;
    const row = Math.floor(slot / 2), col = slot % 2;
    const idx = (n - 4 - row * 4) % n;
    const lat = (col ? 1 : -1) * t.halfWidth * 0.4;
    const p = t.points[idx], r = t.rights[idx], tg = t.tangents[idx];
    this.pos.set(p[0] + r[0] * lat, p[1], p[2] + r[2] * lat);
    this.heading = Math.atan2(tg[0], tg[2]);
    this.idx = idx;
    this.lateral = lat;
    this.lap = 0;
    this.checkpoint = true;
    this.syncMesh(0);
  }

  get progress() {
    return this.lap * this.track.count + this.idx;
  }

  respawn() {
    const t = this.track;
    const i = this.idx;
    const p = t.points[i], tg = t.tangents[i];
    this.pos.set(p[0], p[1], p[2]);
    this.heading = Math.atan2(tg[0], tg[2]);
    this.speed = 0;
    this.spin = 0;
    this.drifting = false;
    this.stuck = 0;
  }

  update(dt, input, raceTime) {
    const st = this.stats;
    let throttle = input.throttle ? 1 : 0;
    let brake = input.brake ? 1 : 0;
    let steer = input.steer || 0;

    if (this.spin > 0) {
      this.spin -= dt;
      throttle = brake = 0;
      steer = 0;
      this.visualYaw += dt * 14;
      this.speed *= Math.pow(0.2, dt);
    } else {
      this.visualYaw *= Math.pow(0.001, dt);
    }

    let max = MAX_SPEED * st.speed * (input.speedMul || 1);
    if (this.boost > 0) { max *= 1.38; this.boost -= dt; }
    if (this.offroad) max *= 0.55;

    if (throttle) this.speed += ACCEL * st.accel * dt * (this.boost > 0 ? 2.2 : 1) * (this.speed < 0 ? 2 : 1);
    else if (brake) this.speed -= (this.speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 7 * dt);
    if (this.speed > max) this.speed = Math.max(max, this.speed - 28 * dt);
    if (this.speed < -REVERSE_MAX) this.speed = -REVERSE_MAX;

    // Steering & drifting
    const speedFactor = clamp(Math.abs(this.speed) / 10, 0, 1) * (1 - 0.3 * clamp(this.speed / (MAX_SPEED * 1.2), 0, 1));
    let turn = steer * TURN * st.handling * speedFactor;
    if (input.drift && !this.drifting && Math.abs(steer) > 0.3 && this.speed > 14 && !this.offroad) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftCharge = 0;
      this.hop = 0.25;
    }
    if (this.drifting) {
      turn = (this.driftDir * 0.6 + steer * 0.35) * TURN * st.handling * speedFactor;
      this.driftCharge += dt * (Math.sign(steer) === this.driftDir ? 1.3 : 0.7);
      if (!input.drift || this.speed < 10 || this.offroad) {
        if (this.driftCharge > 1.8) { this.boost = Math.max(this.boost, 1.3); this.events.push('miniturbo2'); }
        else if (this.driftCharge > 0.9) { this.boost = Math.max(this.boost, 0.7); this.events.push('miniturbo'); }
        this.drifting = false;
        this.driftCharge = 0;
      }
    }
    this.heading -= turn * dt * Math.sign(this.speed || 1);

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    this.projectOnTrack();
    this.handleWalls();
    this.updateLap(raceTime);

    if (this.hop > 0) this.hop -= dt;
    if (this.shield > 0) this.shield -= dt;
    this.wheelSpin += this.speed * dt * 2.5;
    this.syncMesh(steer);
  }

  projectOnTrack() {
    const t = this.track, n = t.count, P = t.points;
    let best = Infinity, bi = this.idx;
    for (let o = -8; o <= 8; o++) {
      const i = (this.idx + o + n) % n;
      const dx = P[i][0] - this.pos.x, dz = P[i][2] - this.pos.z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    if (best > (t.wallOffset + 6) ** 2) {
      for (let i = 0; i < n; i++) {
        const dx = P[i][0] - this.pos.x, dz = P[i][2] - this.pos.z;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = i; }
      }
    }
    this.prevIdx = this.idx;
    this.idx = bi;
    const p = P[bi], r = t.rights[bi], tg = t.tangents[bi];
    const dx = this.pos.x - p[0], dz = this.pos.z - p[2];
    this.lateral = dx * r[0] + dz * r[2];
    const along = dx * tg[0] + dz * tg[2];
    const j = along >= 0 ? (bi + 1) % n : (bi - 1 + n) % n;
    const seg = Math.hypot(P[j][0] - p[0], P[j][2] - p[2]) || 1;
    const f = Math.min(1, Math.abs(along) / seg);
    this.groundY = p[1] + (P[j][1] - p[1]) * f;
    this.slope = Math.atan2(tg[1], Math.hypot(tg[0], tg[2]));
    this.offroad = Math.abs(this.lateral) > t.halfWidth + 1.2;
  }

  handleWalls() {
    const t = this.track;
    const limit = t.wallOffset - KART_RADIUS;
    if (Math.abs(this.lateral) > limit) {
      const s = Math.sign(this.lateral);
      const push = Math.abs(this.lateral) - limit;
      const r = t.rights[this.idx];
      this.pos.x -= r[0] * s * push;
      this.pos.z -= r[2] * s * push;
      this.lateral = s * limit;
      // Glance off: align heading with the track and scrub speed.
      const tg = t.tangents[this.idx];
      let trackHeading = Math.atan2(tg[0], tg[2]);
      if (Math.cos(wrapAngle(trackHeading - this.heading)) < 0) trackHeading += Math.PI;
      const hit = Math.abs(Math.sin(wrapAngle(trackHeading - this.heading)));
      this.heading += wrapAngle(trackHeading - this.heading) * 0.35;
      this.speed *= 1 - 0.5 * hit;
      if (hit > 0.25 && Math.abs(this.speed) > 8) this.events.push('bump');
    }
  }

  updateLap(raceTime) {
    const n = this.track.count;
    const a = this.prevIdx, b = this.idx;
    if (a > n * 0.8 && b < n * 0.2) {
      if (this.checkpoint) {
        this.lap++;
        this.checkpoint = false;
        if (this.lap > 1) this.events.push('lap');
        if (this.lap > this.totalLaps && !this.finished) {
          this.finished = true;
          this.finishTime = raceTime;
          this.events.push('finish');
        }
      }
    } else if (a < n * 0.2 && b > n * 0.8) {
      if (!this.checkpoint) { this.lap--; this.checkpoint = true; }
    }
    if (b > n * 0.45 && b < n * 0.55) this.checkpoint = true;
  }

  syncMesh(steer) {
    const m = this.mesh;
    const y = (this.groundY ?? this.pos.y) + (this.hop > 0 ? Math.sin((this.hop / 0.25) * Math.PI) * 0.5 : 0);
    this.pos.y = this.groundY ?? this.pos.y;
    m.position.set(this.pos.x, y, this.pos.z);
    const driftYaw = this.drifting ? this.driftDir * -0.38 : 0;
    m.userData.driftYaw = (m.userData.driftYaw || 0) + (driftYaw - (m.userData.driftYaw || 0)) * 0.15;
    m.rotation.order = 'YXZ';
    m.rotation.y = this.heading + m.userData.driftYaw + this.visualYaw;
    m.rotation.x = -(this.slope || 0);
    m.rotation.z = (this.drifting ? this.driftDir * 0.06 : 0) + steer * 0.03;
    const ud = m.userData;
    for (const w of ud.wheels) w.rotation.x = this.wheelSpin;
    for (const f of ud.frontWheels) f.rotation.y = -steer * 0.45;
    if (ud.mascot) ud.mascot.rotation.z = -steer * 0.12;
    if (ud.flame) {
      ud.flame.visible = this.boost > 0;
      ud.flame.scale.setScalar(0.8 + Math.random() * 0.5);
    }
    if (ud.sparks) {
      ud.sparks.visible = this.drifting;
      const c = this.driftCharge > 1.8 ? 0xff7b00 : this.driftCharge > 0.9 ? 0x3fa9ff : 0xffffff;
      for (const s of ud.sparks.children) s.material.color.setHex(c);
    }
    if (ud.shieldMesh) ud.shieldMesh.visible = this.shield > 0;
  }

  useItem(world) {
    if (!this.item) return;
    const it = this.item;
    if (it === 'turbo' || it === 'triple') {
      this.boost = Math.max(this.boost, 1.4);
      this.events.push('boost');
    } else if (it === 'banana') {
      world.dropBanana(this);
    } else if (it === 'shield') {
      this.shield = 6;
      this.events.push('shield');
    }
    this.itemUses--;
    if (this.itemUses <= 0) this.item = null;
  }

  hitHazard() {
    if (this.shield > 0) { this.shield = 0; this.events.push('shieldpop'); return; }
    this.spin = 1.0;
    this.speed *= 0.35;
    this.drifting = false;
    this.events.push('spin');
  }
}

export function rollItem(position, total) {
  // Racers further back get better items.
  const back = total > 1 ? position / (total - 1) : 0;
  const r = Math.random();
  if (r < 0.15 + back * 0.35) return back > 0.5 ? 'triple' : 'turbo';
  if (r < 0.45 + back * 0.2) return 'turbo';
  if (r < 0.75) return 'banana';
  return 'shield';
}

export function aiInput(r, racers, player, world, time, dt) {
  const t = r.track, n = t.count, P = t.points, R = t.rights, T = t.tangents;
  const lookSamples = Math.round(4 + Math.max(0, r.speed) * 0.32);
  const ti = (r.idx + lookSamples) % n;

  // Lane choice: wander a bit, prefer upcoming boost pads / item boxes.
  let lane = r.lane + Math.sin(time * 0.35 + r.seed * 3) * t.halfWidth * 0.25;
  for (const b of world.boostPads) {
    const ahead = (b.index - r.idx + n) % n;
    if (ahead > 2 && ahead < 22) { lane = b.lateral; break; }
  }
  if (!r.item) {
    for (const b of world.itemBoxes) {
      const ahead = (b.index - r.idx + n) % n;
      if (ahead > 2 && ahead < 20 && b.respawn <= 0) { lane = (b.pos.x - P[b.index][0]) * R[b.index][0] + (b.pos.z - P[b.index][2]) * R[b.index][2]; break; }
    }
  }
  // Steer around bananas.
  for (const h of world.hazards) {
    const ahead = (h.index - r.idx + n) % n;
    if (ahead > 0 && ahead < 14 && Math.abs(h.lateral - lane) < 2.5) lane = h.lateral + (h.lateral > 0 ? -4 : 4);
  }
  lane = clamp(lane, -t.halfWidth + 2, t.halfWidth - 2);

  const tx = P[ti][0] + R[ti][0] * lane, tz = P[ti][2] + R[ti][2] * lane;
  const desired = Math.atan2(tx - r.pos.x, tz - r.pos.z);
  const diff = wrapAngle(desired - r.heading);
  const steer = clamp(-diff * 2.8, -1, 1);

  // Corner speed: look further ahead and slow for sharp turns.
  const far = (r.idx + 18) % n;
  const bend = Math.acos(clamp(T[r.idx][0] * T[far][0] + T[r.idx][2] * T[far][2], -1, 1));
  const cornerSpeed = MAX_SPEED * (1.05 - bend * 0.55);

  // Rubber banding relative to the player.
  let speedMul = r.aiSkill;
  if (player && !player.finished) {
    const gap = (r.progress - player.progress) / n;
    if (gap > 0.15) speedMul *= 0.93;
    else if (gap < -0.08) speedMul *= 1.07;
  }

  const throttle = r.speed < cornerSpeed * speedMul || r.speed < 12;
  const brake = !throttle && r.speed > cornerSpeed * speedMul + 6;

  // Items
  let useItem = false;
  if (r.item) {
    r.aiItemTimer -= dt;
    if ((r.item === 'turbo' || r.item === 'triple') && Math.abs(steer) < 0.25 && bend < 0.35) useItem = r.aiItemTimer < 0;
    else if (r.item === 'banana') useItem = r.aiItemTimer < 0 || racers.some((o) => o !== r && o.progress < r.progress && r.progress - o.progress < 10);
    else if (r.item === 'shield') useItem = r.aiItemTimer < 0;
    if (useItem) r.aiItemTimer = 1 + Math.random() * 4;
  }

  // Unstick
  if (Math.abs(r.speed) < 2) r.stuck += dt; else r.stuck = 0;
  if (r.stuck > 2.5) r.respawn();

  return { throttle, brake, steer, drift: false, speedMul, useItem };
}

/** Push overlapping karts apart. */
export function resolveCollisions(racers) {
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = KART_RADIUS * 2;
      if (d > 0 && d < min && Math.abs(a.pos.y - b.pos.y) < 2) {
        const nx = dx / d, nz = dz / d, push = min - d;
        const wa = b.stats.weight / (a.stats.weight + b.stats.weight);
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * (1 - wa); b.pos.z += nz * push * (1 - wa);
        const avg = (a.speed + b.speed) / 2;
        a.speed += (avg - a.speed) * 0.15 * wa * 2;
        b.speed += (avg - b.speed) * 0.15 * (1 - wa) * 2;
        if (a.isPlayer || b.isPlayer) (a.isPlayer ? a : b).events.push('bump');
      }
    }
  }
}
