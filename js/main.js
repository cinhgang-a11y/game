import * as THREE from 'three';
import { LEVELS, THEMES, randomLevel } from './levels.js';
import { generateTrack } from './trackgen.js';
import { buildWorld, tryLoadBlenderLevel } from './world.js';
import { MASCOTS, KARTS, KART_COLORS, buildKart, combinedStats } from './mascots.js';
import { Racer, ITEMS, aiInput, resolveCollisions, rollItem } from './racer.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2500);
const input = new Input();
const sfx = new Sfx();

// ---------------------------------------------------------------- save data
const SAVE_KEY = 'mascotKart.save.v1';
function loadSave() {
  try { return { unlocked: 1, best: {}, mascot: 'fox', kart: 'classic', color: 0, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; }
  catch { return { unlocked: 1, best: {}, mascot: 'fox', kart: 'classic', color: 0 }; }
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } }

// ---------------------------------------------------------------- screens
const SCREENS = ['title', 'help', 'levels', 'garage', 'pause', 'results'];
function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
  $('hud').hidden = !(name === null || name === 'pause');
  $('touch').hidden = !(input.isTouch && name === null);
  if (name === 'levels') renderLevelGrid();
  if (name === 'garage') renderGarage();
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); show(b.dataset.go); }));
$('muteBtn').addEventListener('click', () => { sfx.unlock(); $('muteBtn').textContent = `Sound: ${sfx.toggleMute() ? 'off' : 'on'}`; });

let pendingLevel = LEVELS[0];

function themeIcon(theme) {
  const shapes = {
    meadow: '<circle cx="50" cy="40" r="26" fill="#fff"/><rect x="45" y="60" width="10" height="30" fill="#fff"/>',
    desert: '<rect x="42" y="20" width="16" height="70" rx="8" fill="#fff"/><rect x="18" y="40" width="12" height="30" rx="6" fill="#fff"/><rect x="18" y="62" width="30" height="10" fill="#fff"/>',
    snow: '<polygon points="50,10 80,70 20,70" fill="#fff"/><polygon points="50,35 85,92 15,92" fill="#fff"/>',
    candy: '<circle cx="50" cy="38" r="26" fill="#fff"/><rect x="47" y="60" width="6" height="36" fill="#fff"/>',
    lava: '<polygon points="10,92 40,30 55,45 70,25 92,92" fill="#fff"/>',
    space: '<polygon points="50,8 61,38 94,38 67,57 77,90 50,70 23,90 33,57 6,38 39,38" fill="#fff"/>',
  };
  return `<svg viewBox="0 0 100 100">${shapes[theme]}</svg>`;
}

function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
const ordinal = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

function renderLevelGrid() {
  const grid = $('levelGrid');
  grid.innerHTML = '';
  for (const lv of LEVELS) {
    const th = THEMES[lv.theme];
    const locked = lv.id > save.unlocked;
    const best = save.best[lv.id];
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.disabled = locked;
    btn.style.setProperty('--c1', hex(th.curb[1]));
    btn.style.setProperty('--c2', hex(th.wall));
    const stars = '★'.repeat(lv.id) + '☆'.repeat(6 - lv.id);
    btn.innerHTML = `${themeIcon(lv.theme)}<div class="num">TRACK ${lv.id} · ${th.name.toUpperCase()}</div>
      <div class="name">${lv.name}</div>
      <div class="meta">${stars}<br>${lv.ai + 1} racers · ${lv.laps} laps</div>
      <div class="meta">${best ? `Best: ${best.place}${ordinal(best.place)} · ${fmtTime(best.time)}` : locked ? 'Top 3 on the previous track unlocks' : 'Not raced yet'}</div>
      ${locked ? '<div class="lock">🔒</div>' : ''}`;
    btn.addEventListener('click', () => { pendingLevel = lv; show('garage'); });
    grid.appendChild(btn);
  }
}
$('diceBtn').addEventListener('click', () => { $('seedInput').value = 1 + Math.floor(Math.random() * 999999); });
$('randomGo').addEventListener('click', () => {
  const seed = Math.max(1, Math.min(999999, parseInt($('seedInput').value, 10) || 1));
  pendingLevel = randomLevel(seed);
  show('garage');
});

// ---------------------------------------------------------------- garage + 3D preview
const preview = { scene: new THREE.Scene(), kart: null, turntable: null };
{
  const s = preview.scene;
  s.background = new THREE.Color(0x2a2150);
  s.add(new THREE.HemisphereLight(0xffffff, 0x443366, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 8, 6);
  key.castShadow = true;
  s.add(key);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.4, 48), new THREE.MeshStandardMaterial({ color: 0xffc93c }));
  disc.position.y = -0.2;
  disc.receiveShadow = true;
  preview.turntable = new THREE.Group();
  preview.turntable.add(disc);
  s.add(preview.turntable);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x3a2d6b }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.4;
  floor.receiveShadow = true;
  s.add(floor);
}
function refreshPreviewKart() {
  if (preview.kart) preview.turntable.remove(preview.kart);
  preview.kart = buildKart(save.kart, KART_COLORS[save.color], save.mascot);
  preview.turntable.add(preview.kart);
}

function renderGarage() {
  $('garageTitle').textContent = pendingLevel.name;
  const mc = $('mascotChips');
  mc.innerHTML = '';
  for (const m of MASCOTS) {
    const b = document.createElement('button');
    b.className = 'chip' + (m.id === save.mascot ? ' sel' : '');
    b.innerHTML = `${m.name}`;
    b.onclick = () => { save.mascot = m.id; persist(); renderGarage(); };
    mc.appendChild(b);
  }
  const kc = $('kartChips');
  kc.innerHTML = '';
  for (const k of KARTS) {
    const b = document.createElement('button');
    b.className = 'chip' + (k.id === save.kart ? ' sel' : '');
    b.innerHTML = `${k.name}<small>${k.desc}</small>`;
    b.onclick = () => { save.kart = k.id; persist(); renderGarage(); };
    kc.appendChild(b);
  }
  const sw = $('swatches');
  sw.innerHTML = '';
  KART_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i === save.color ? ' sel' : '');
    b.style.background = hex(c);
    b.setAttribute('aria-label', `Paint ${i + 1}`);
    b.onclick = () => { save.color = i; persist(); renderGarage(); };
    sw.appendChild(b);
  });
  const st = combinedStats(save.mascot, save.kart);
  const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(Math.max(0.1, Math.min(1, (v - 0.75) / 0.6)) * 100)}%"></i></div></div>`;
  $('stats').innerHTML = bar('Speed', st.speed) + bar('Accel', st.accel) + bar('Handling', st.handling) + bar('Weight', st.weight / 1.3);
  refreshPreviewKart();
}
$('raceBtn').addEventListener('click', () => { sfx.unlock(); startRace(pendingLevel); });

// ---------------------------------------------------------------- race setup
let race = null;
let mode = 'menu'; // menu | countdown | race | paused | done
let camMode = 0;

function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

function addKartFx(mesh) {
  const sparks = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    s.userData.side = i % 2 ? 1 : -1;
    sparks.add(s);
  }
  sparks.visible = false;
  mesh.add(sparks);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), new THREE.MeshStandardMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.3, emissive: 0x3fa9ff, emissiveIntensity: 0.4 }));
  shield.position.y = 1;
  shield.visible = false;
  mesh.add(shield);
  mesh.userData.sparks = sparks;
  mesh.userData.shieldMesh = shield;
}

function startRace(level) {
  if (race) { disposeScene(race.scene); }
  const track = generateTrack(level);
  const scene = new THREE.Scene();
  const world = buildWorld(scene, track);
  world.hazards = [];
  world.dropBanana = (r) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.18, 8, 14, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0xffe14d }));
    const back = -3.2;
    m.position.set(r.pos.x + Math.sin(r.heading) * back, r.pos.y + 0.35, r.pos.z + Math.cos(r.heading) * back);
    m.rotation.set(0, r.heading, Math.PI / 2 + 0.6);
    m.castShadow = true;
    scene.add(m);
    const tmp = { pos: m.position, idx: r.idx };
    const t = track, p = t.points[r.idx], rr = t.rights[r.idx];
    world.hazards.push({ mesh: m, pos: m.position, owner: r, arm: 0.6, index: r.idx, lateral: (tmp.pos.x - p[0]) * rr[0] + (tmp.pos.z - p[2]) * rr[2] });
  };

  // Racers: player plus AI with the other mascots.
  const racers = [];
  const others = MASCOTS.filter((m) => m.id !== save.mascot);
  const playerSlot = Math.min(3, level.ai);
  const total = level.ai + 1;
  let aiNum = 0;
  for (let slot = 0; slot < total; slot++) {
    let r;
    if (slot === playerSlot) {
      const mesh = buildKart(save.kart, KART_COLORS[save.color], save.mascot);
      r = new Racer({ track, mesh, stats: combinedStats(save.mascot, save.kart), isPlayer: true, name: MASCOTS.find((m) => m.id === save.mascot).name, slot });
    } else {
      const m = others[aiNum % others.length];
      const k = KARTS[(aiNum + level.seed) % KARTS.length];
      const color = KART_COLORS[(aiNum + 1 + save.color) % KART_COLORS.length];
      const mesh = buildKart(k.id, color, m.id);
      const skill = level.aiSkill * (1 - (aiNum % 4) * 0.025);
      r = new Racer({ track, mesh, stats: combinedStats(m.id, k.id), name: m.name + (aiNum >= others.length ? ' II' : ''), aiSkill: skill, slot });
      aiNum++;
    }
    r.totalLaps = level.laps;
    addKartFx(r.mesh);
    scene.add(r.mesh);
    r.placeOnGrid(slot);
    racers.push(r);
  }
  const player = racers[playerSlot];

  race = { level, track, scene, world, racers, player, time: 0, countdown: 3.6, lastCount: 4, gasAt: null, finishedAt: null, standings: racers.slice() };
  prepareMinimap(track, world.theme);
  mode = 'countdown';
  show(null);
  $('countdown').hidden = false;
  snapCamera();

  if ($('useBlender').checked) {
    tryLoadBlenderLevel(world, track).then((ok) => { if (ok && race && race.world === world) toast('Blender scenery loaded'); });
  }
}

// ---------------------------------------------------------------- minimap
const mini = { ctx: $('minimap').getContext('2d'), base: null, map: null };
function prepareMinimap(track, theme) {
  const W = 340, pad = 22;
  const b = track.points.reduce((a, p) => ({ minX: Math.min(a.minX, p[0]), maxX: Math.max(a.maxX, p[0]), minZ: Math.min(a.minZ, p[2]), maxZ: Math.max(a.maxZ, p[2]) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const s = (W - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (W - (b.maxZ - b.minZ) * s) / 2;
  mini.map = (x, z) => [ox + (x - b.minX) * s, oz + (z - b.minZ) * s];
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(20,16,40,0.55)';
  c.beginPath(); c.roundRect(0, 0, W, W, 36); c.fill();
  c.lineJoin = 'round';
  const path = () => { c.beginPath(); track.points.forEach((p, i) => { const [x, y] = mini.map(p[0], p[2]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
  path(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 16; c.stroke();
  path(); c.strokeStyle = hex(theme.road); c.lineWidth = 10; c.stroke();
  const [sx, sy] = mini.map(track.points[0][0], track.points[0][2]);
  c.fillStyle = '#fff'; c.fillRect(sx - 6, sy - 6, 12, 12);
  mini.base = cv;
}
function drawMinimap() {
  const c = mini.ctx;
  c.clearRect(0, 0, 340, 340);
  c.drawImage(mini.base, 0, 0);
  for (const r of race.racers) {
    if (r.isPlayer) continue;
    const [x, y] = mini.map(r.pos.x, r.pos.z);
    c.fillStyle = hex(r.mesh.userData.color || 0xdddddd);
    c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
  }
  const [x, y] = mini.map(race.player.pos.x, race.player.pos.z);
  c.fillStyle = '#ffc93c'; c.strokeStyle = '#000'; c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill(); c.stroke();
}

// ---------------------------------------------------------------- feedback
let toastTimer = 0;
function toast(msg, secs = 1.6) {
  $('toast').textContent = msg;
  $('toast').style.opacity = 1;
  toastTimer = secs;
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function cameraTarget(r, out, look) {
  const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
  const portrait = camera.aspect < 1 ? 1.45 : 1;
  const dist = (camMode === 1 ? 14 : 8.5) * portrait, h = (camMode === 1 ? 6.5 : 3.8) * portrait;
  out.set(r.pos.x - fx * dist, r.pos.y + h, r.pos.z - fz * dist);
  look.set(r.pos.x + fx * 6, r.pos.y + 1.4, r.pos.z + fz * 6);
}
function snapCamera() {
  cameraTarget(race.player, camPos, camLook);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
function updateCamera(dt) {
  const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
  cameraTarget(race.player, tPos, tLook);
  const k = 1 - Math.exp(-7 * dt);
  camPos.lerp(tPos, k);
  camLook.lerp(tLook, 1 - Math.exp(-12 * dt));
  // Keep the camera above the ground near the kart.
  camPos.y = Math.max(camPos.y, race.player.pos.y + 1.5);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const targetFov = 68 + (race.player.boost > 0 ? 10 : 0) + Math.max(0, race.player.speed) * 0.12;
  camera.fov += (targetFov - camera.fov) * k;
  camera.updateProjectionMatrix();
  const sun = race.world.group.userData.sun;
  sun.position.set(race.player.pos.x + 60, race.player.pos.y + 120, race.player.pos.z + 40);
  sun.target.position.copy(race.player.pos);
}

// ---------------------------------------------------------------- race loop
function step(dt) {
  const { racers, player, world, track } = race;
  const n = track.count;

  if (mode === 'countdown') {
    race.countdown -= dt;
    const c = Math.ceil(race.countdown - 0.6);
    if (c !== race.lastCount && c >= 1 && c <= 3) { sfx.play('count'); race.lastCount = c; }
    $('countdown').textContent = c >= 1 ? c : 'GO!';
    const inp = input.read();
    if (inp.throttle && race.gasAt === null) race.gasAt = race.countdown;
    if (!inp.throttle) race.gasAt = null;
    if (race.countdown <= 0.6) {
      mode = 'race';
      sfx.play('go');
      if (race.gasAt !== null) {
        if (race.gasAt < 2.6 && race.gasAt > 1.2) { player.boost = 1.2; toast('Rocket start!'); sfx.play('boost'); }
        else if (race.gasAt >= 2.6) { player.spin = 0.8; toast('Stalled!'); }
      }
      setTimeout(() => { $('countdown').hidden = true; }, 600);
    }
    for (const r of racers) r.syncMesh(0);
    return;
  }

  race.time += dt;

  for (const r of racers) {
    let inp;
    if (r.isPlayer && !r.finished && !race.autopilot) {
      inp = input.read();
      if (input.consume('KeyR')) r.respawn();
    } else {
      inp = aiInput(r, racers, player, world, race.time, dt);
      if (r.isPlayer) inp.speedMul = 0.85;
    }
    r.update(dt, inp, race.time);
    if (r.itemRoll > 0) r.itemRoll -= dt;
    if (inp.useItem && r.item && !(r.itemRoll > 0)) r.useItem(world);
  }
  resolveCollisions(racers);

  // Boost pads
  for (const pad of world.boostPads) {
    for (const r of racers) {
      if (r.pos.distanceToSquared(pad.pos) < 2.6 * 2.6 + 4 && Math.abs(r.pos.y - pad.pos.y) < 2) {
        if (r.boost < 0.5) r.events.push('boost');
        r.boost = Math.max(r.boost, 1.0);
      }
    }
  }
  // Item boxes
  const standings = race.standings;
  for (const box of world.itemBoxes) {
    if (box.respawn > 0) {
      box.respawn -= dt;
      box.mesh.visible = box.respawn <= 0;
      box.mesh.scale.setScalar(box.respawn <= 0 ? 1 : 0.01);
      continue;
    }
    box.mesh.rotation.y += dt * 1.5;
    box.mesh.rotation.x += dt * 0.7;
    box.mesh.position.y = box.pos.y + Math.sin(race.time * 3 + box.pos.x) * 0.25;
    for (const r of racers) {
      if (r.pos.distanceToSquared(box.pos) < 2.4 * 2.4 + 2) {
        box.respawn = 3;
        box.mesh.visible = false;
        if (!r.item) {
          r.item = rollItem(standings.indexOf(r), racers.length);
          r.itemUses = r.item === 'triple' ? 3 : 1;
          r.itemRoll = r.isPlayer ? 0.9 : 0;
          if (r.isPlayer) sfx.play('item');
        }
        break;
      }
    }
  }
  // Hazards
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    h.arm -= dt;
    for (const r of racers) {
      if ((r !== h.owner || h.arm <= 0) && r.pos.distanceToSquared(h.pos) < 2.0 * 2.0 + 1 && h.arm < 0.45) {
        r.hitHazard();
        race.scene.remove(h.mesh);
        h.mesh.geometry.dispose();
        world.hazards.splice(i, 1);
        break;
      }
    }
  }

  // Standings
  race.standings = racers.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  });

  // Events → sound/toasts
  for (const r of racers) {
    for (const e of r.events) {
      if (!r.isPlayer) continue;
      if (e === 'lap') { const l = Math.min(r.lap, r.totalLaps); toast(l === r.totalLaps ? 'Final lap!' : `Lap ${l}`); }
      if (e === 'finish') {
        const place = race.standings.indexOf(r) + 1;
        toast(`${place}${ordinal(place)} place!`, 3);
        race.finishedAt = race.time;
      }
      sfx.play(e);
    }
    r.events.length = 0;
  }

  if (race.finishedAt !== null && race.time - race.finishedAt > 3 && mode === 'race') showResults();

  // Spark jitter
  for (const r of racers) {
    const sp = r.mesh.userData.sparks;
    if (sp.visible) for (const s of sp.children) s.position.set(s.userData.side * (0.8 + Math.random() * 0.3), 0.15 + Math.random() * 0.4, -1.3 - Math.random() * 0.8);
  }
  void n;
}

function showResults() {
  mode = 'done';
  const { racers, player, level, track } = race;
  // Estimate times for racers still on track.
  const avg = player.finishTime / (level.laps * track.count);
  const rows = race.standings.map((r) => ({ r, time: r.finished ? r.finishTime : race.time + Math.max(0, (level.laps + 1) * track.count - r.progress) * avg * 1.05, est: !r.finished }));
  rows.sort((a, b) => a.time - b.time);
  const place = rows.findIndex((x) => x.r === player) + 1;
  $('resultTitle').textContent = `${place}${ordinal(place)} place · ${level.name}`;
  $('resultTable').innerHTML = rows.map((x, i) => `<tr class="${x.r.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${x.r.name}</td><td style="text-align:right">${x.est ? '~' : ''}${fmtTime(x.time)}</td></tr>`).join('');
  let note = '';
  if (level.id) {
    const prev = save.best[level.id];
    if (!prev || place < prev.place || (place === prev.place && player.finishTime < prev.time)) save.best[level.id] = { place, time: player.finishTime };
    if (place <= 3 && level.id < LEVELS.length && save.unlocked <= level.id) {
      save.unlocked = level.id + 1;
      note = `🔓 Unlocked ${LEVELS[level.id].name}!`;
    } else if (place > 3) note = 'Finish in the top 3 to unlock the next track.';
    persist();
  } else {
    note = `Seed ${level.seed}. Share it with a friend.`;
  }
  $('resultNote').textContent = note;
  const next = level.id ? LEVELS[level.id] : null;
  $('nextBtn').hidden = !(next ? next.id <= save.unlocked : !level.id);
  $('nextBtn').textContent = level.id ? 'Next track' : 'New random track';
  show('results');
  $('hud').hidden = true;
  $('touch').hidden = true;
  void racers;
}
$('nextBtn').addEventListener('click', () => {
  const lv = race.level;
  startRace(lv.id ? LEVELS[lv.id] : randomLevel(1 + Math.floor(Math.random() * 999999)));
});
$('retryBtn').addEventListener('click', () => startRace(race.level));
$('restartBtn').addEventListener('click', () => startRace(race.level));
$('menuBtn').addEventListener('click', quitToMenu);
$('quitBtn').addEventListener('click', quitToMenu);
$('resumeBtn').addEventListener('click', togglePause);

function quitToMenu() {
  mode = 'menu';
  $('countdown').hidden = true;
  sfx.setEngine(0, false);
  show('levels');
}
function togglePause() {
  if (mode === 'race' || mode === 'countdown') { race.pausedFrom = mode; mode = 'paused'; show('pause'); sfx.setEngine(0, false); }
  else if (mode === 'paused') { mode = race.pausedFrom; show(null); }
}

function updateHud() {
  const p = race.player;
  const place = race.standings.indexOf(p) + 1;
  $('hudPos').innerHTML = `${place}<sup>${ordinal(place)}</sup>`;
  $('hudLap').textContent = `Lap ${Math.max(1, Math.min(p.lap, race.level.laps))}/${race.level.laps}`;
  $('hudTime').textContent = fmtTime(p.finished ? p.finishTime : race.time);
  $('hudSpeed').textContent = Math.round(Math.abs(p.speed) * 3.6);
  const item = $('hudItem');
  const rolling = p.itemRoll > 0;
  item.classList.toggle('rolling', rolling);
  const icon = rolling ? Object.values(ITEMS)[Math.floor(performance.now() / 90) % 4].icon.slice(0, 2)
    : p.item ? (p.item === 'triple' ? `🔥<small>×${p.itemUses}</small>` : ITEMS[p.item].icon) : '';
  if (item.innerHTML !== icon) item.innerHTML = icon;
  const d = $('hudDrift');
  const charge = p.drifting ? Math.min(1, p.driftCharge / 1.8) : 0;
  d.style.width = `${charge * 100}%`;
  d.style.background = p.driftCharge > 1.8 ? '#ff7b00' : p.driftCharge > 0.9 ? '#3fa9ff' : '#fff';
  drawMinimap();
}

// ---------------------------------------------------------------- main loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
const previewCam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (input.pressed('Escape', 'KeyP') && race && mode !== 'menu' && mode !== 'done') togglePause();
  if (input.pressed('KeyM')) $('muteBtn').textContent = `Sound: ${sfx.toggleMute() ? 'off' : 'on'}`;
  if (input.pressed('KeyC')) camMode = (camMode + 1) % 2;

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }

  if (race && (mode === 'countdown' || mode === 'race' || mode === 'done')) {
    // Fixed sub-steps keep physics stable at low frame rates.
    const steps = Math.ceil(dt / (1 / 90));
    for (let i = 0; i < steps; i++) step(dt / steps);
    updateCamera(dt);
    if (mode !== 'done') updateHud();
    sfx.setEngine(race.player.speed, mode === 'race' || mode === 'countdown');
    renderer.render(race.scene, camera);
  } else if (race && mode === 'paused') {
    renderer.render(race.scene, camera);
  } else {
    // Menu: garage turntable.
    if (!preview.kart) refreshPreviewKart();
    preview.turntable.rotation.y += dt * 0.6;
    const wide = innerWidth > 700;
    previewCam.aspect = innerWidth / innerHeight;
    if (wide) { previewCam.position.set(3.2, 3.2, 9); previewCam.lookAt(2.2, 0.9, 0); }
    else { previewCam.position.set(0, 6, 17); previewCam.lookAt(0, -2.6, 0); }
    previewCam.updateProjectionMatrix();
    renderer.render(preview.scene, previewCam);
  }
  input.endFrame();
}
requestAnimationFrame(frame);

// Debug hook for automated smoke tests.
window.__mascotKart = {
  get race() { return race; }, get mode() { return mode; }, startRace, LEVELS,
  // Advance the simulation without rendering (headless tests run at a few fps).
  simulate(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds && race && mode !== 'paused' && mode !== 'menu'; t += dt) { step(dt); updateCamera(dt); }
    if (race && mode !== 'done') updateHud();
  },
};

show('title');
