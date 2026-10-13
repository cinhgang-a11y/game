import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { THEMES } from './levels.js';
import { terrainHeight } from './trackgen.js';

/** Build all level visuals. Returns { group, boostPads, itemBoxes, procedural, theme }. */
export function buildWorld(scene, track) {
  const theme = THEMES[track.level.theme];
  const group = new THREE.Group();
  const procedural = new THREE.Group(); // everything a Blender-built .glb can replace
  group.add(procedural);
  scene.add(group);

  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 120, 520);

  const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.9);
  const sun = new THREE.DirectionalLight(theme.sun, 2.2);
  sun.position.set(120, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = s.bottom = -80; s.right = s.top = 80; s.near = 10; s.far = 500;
  sun.shadow.bias = -0.0005;
  group.add(hemi, sun, sun.target);
  group.userData.sun = sun;

  const { points: P, rights: R, count: n, halfWidth: half, wallOffset } = track;

  function ribbon(inner, outer, yOff, colorFn) {
    const pos = [], col = [], idx = [], uv = [];
    const c = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const k = i % n, p = P[k], r = R[k];
      pos.push(p[0] + r[0] * inner, p[1] + yOff, p[2] + r[2] * inner, p[0] + r[0] * outer, p[1] + yOff, p[2] + r[2] * outer);
      uv.push(0, i * 0.5, 1, i * 0.5);
      if (colorFn) { c.set(colorFn(k)); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
    }
    for (let i = 0; i < n; i++) {
      const a = 2 * i, b = 2 * (i + 1);
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colorFn) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // Road with dashed centre line texture.
  const roadTex = makeRoadTexture(theme.road);
  const road = new THREE.Mesh(ribbon(-half, half, 0), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
  road.receiveShadow = true;
  procedural.add(road);

  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const curbColor = (k) => theme.curb[Math.floor(k / 3) % 2];
  for (const [a, b] of [[half, half + 1.2], [-half - 1.2, -half]]) {
    const m = new THREE.Mesh(ribbon(a, b, 0.05, curbColor), curbMat);
    m.receiveShadow = true;
    procedural.add(m);
  }
  const groundMat = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 });
  for (const [a, b] of [[half + 1.2, wallOffset], [-wallOffset, -half - 1.2]]) {
    const m = new THREE.Mesh(ribbon(a, b, -0.02), groundMat);
    m.receiveShadow = true;
    procedural.add(m);
  }

  // Walls
  const glow = track.level.theme === 'lava' || track.level.theme === 'space';
  const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.6, emissive: glow ? theme.wall : 0, emissiveIntensity: glow ? 0.6 : 0 });
  for (const side of [-1, 1]) {
    const pos = [], idx = [];
    const o = side * wallOffset;
    const prof = [[o - 0.4, -1.8], [o + 0.4, -1.8], [o + 0.4, 1.1], [o - 0.4, 1.1]];
    for (let i = 0; i <= n; i++) {
      const k = i % n, p = P[k], r = R[k];
      for (const [l, h] of prof) pos.push(p[0] + r[0] * l, p[1] + h, p[2] + r[2] * l);
    }
    for (let i = 0; i < n; i++) {
      const a = 4 * i, b = 4 * (i + 1);
      for (let q = 0; q < 4; q++) {
        const q2 = (q + 1) % 4;
        idx.push(a + q, b + q, a + q2, a + q2, b + q, b + q2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const wall = new THREE.Mesh(geo, wallMat);
    wall.material.side = THREE.DoubleSide;
    wall.castShadow = true;
    procedural.add(wall);
  }

  // Terrain
  const b = track.bounds;
  const res = 120;
  const tGeo = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ, res, res);
  tGeo.rotateX(-Math.PI / 2);
  const tp = tGeo.attributes.position;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const tcol = [];
  const c1 = new THREE.Color(theme.ground), c2 = new THREE.Color(theme.groundAlt), tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + cx, z = tp.getZ(i) + cz;
    tp.setX(i, x); tp.setZ(i, z);
    const h = terrainHeight(track, x, z);
    tp.setY(i, h);
    tmp.copy(c1).lerp(c2, 0.5 + 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.043));
    tcol.push(tmp.r, tmp.g, tmp.b);
  }
  tGeo.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3));
  tGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrain.receiveShadow = true;
  procedural.add(terrain);

  // Outer ground so the world doesn't end abruptly.
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: theme.groundAlt, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = Math.min(...P.map((p) => p[1])) - 12;
  group.add(outer);

  procedural.add(buildProps(track, theme));
  procedural.add(buildStartLine(track, theme));
  if (track.level.theme === 'space') group.add(buildStars());

  const boostPads = buildBoostPads(track, group);
  const itemBoxes = buildItemBoxes(track, group);

  return { group, procedural, boostPads, itemBoxes, theme };
}

/** Swap in a Blender-built level if assets/levels/level_<id>.glb exists. */
export async function tryLoadBlenderLevel(world, track) {
  const name = track.level.id ? `level_${track.level.id}` : `level_seed_${track.level.seed}`;
  const url = `assets/levels/${name}.glb`;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return false;
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = !/Terrain|Road|Shoulder/.test(o.name); } });
    world.procedural.visible = false;
    world.group.add(gltf.scene);
    return true;
  } catch {
    return false;
  }
}

function makeRoadTexture(roadColor) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(roadColor).getHexString();
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(30, 0, 4, 32);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildStartLine(track, theme) {
  const g = new THREE.Group();
  const p = track.points[0], r = track.rights[0], t = track.tangents[0];
  const yaw = Math.atan2(t[0], t[2]);
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 32;
  const c = cv.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    c.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    c.fillRect(x * 8, y * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.halfWidth * 2, 3), new THREE.MeshStandardMaterial({ map: tex }));
  line.rotation.set(-Math.PI / 2, 0, yaw + Math.PI / 2, 'YXZ');
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, yaw, 0);
  line.position.set(p[0], p[1] + 0.04, p[2]);
  line.receiveShadow = true;
  g.add(line);

  const postMat = new THREE.MeshStandardMaterial({ color: theme.wall });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7), postMat);
    post.position.set(p[0] + r[0] * s * (track.wallOffset - 0.5), p[1] + 3.5, p[2] + r[2] * s * (track.wallOffset - 0.5));
    post.castShadow = true;
    g.add(post);
  }
  const bcv = document.createElement('canvas');
  bcv.width = 512; bcv.height = 64;
  const bc = bcv.getContext('2d');
  bc.fillStyle = '#' + new THREE.Color(theme.curb[1]).getHexString();
  bc.fillRect(0, 0, 512, 64);
  bc.fillStyle = '#fff';
  bc.font = 'bold 44px system-ui, sans-serif';
  bc.textAlign = 'center';
  bc.textBaseline = 'middle';
  bc.fillText(track.level.name.toUpperCase(), 256, 34);
  const btex = new THREE.CanvasTexture(bcv);
  btex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(track.wallOffset * 2 + 1, 1.8, 0.4),
    [postMat, postMat, postMat, postMat, new THREE.MeshStandardMaterial({ map: btex }), new THREE.MeshStandardMaterial({ map: btex })]);
  banner.position.set(p[0], p[1] + 7, p[2]);
  banner.rotation.y = yaw;
  banner.castShadow = true;
  g.add(banner);
  return g;
}

const PROP_STYLE = {
  trees: { trunk: 0x8b5a2b, leaf: 0x2e9e4f, leaf2: 0x6cc24a },
  cacti: { trunk: 0x3f8f4a, leaf: 0x2f7a3a, leaf2: 0xc98a4b },
  pines: { trunk: 0x6b4a2b, leaf: 0x2f6b55, leaf2: 0xffffff },
  lollipops: { trunk: 0xffffff, leaf: 0xff4fa3, leaf2: 0x8fe3ff },
  rocks: { trunk: 0x3b3333, leaf: 0xff5a00, leaf2: 0x4a3f3f, glow: ['leaf'] },
  crystals: { trunk: 0x3a3a7a, leaf: 0x00e5ff, leaf2: 0xff00d4, glow: ['leaf', 'leaf2'] },
};

// Mirrors _prop_parts in blender/build_level.py.
function propParts(kind) {
  const cyl = (r, h, y, m, seg = 8, r2 = r) => ({ shape: 'cyl', r, r2, h, y, m, seg });
  const ball = (r, y, m, x = 0) => ({ shape: 'ball', r, y, x, m });
  switch (kind) {
    case 'trees': return [[cyl(0.4, 3, 1.5, 'trunk'), ball(2.4, 4.2, 'leaf')], [cyl(0.35, 2.5, 1.25, 'trunk'), ball(1.8, 3.4, 'leaf2'), ball(1.3, 4.8, 'leaf2')], [cyl(0.5, 4, 2, 'trunk'), cyl(2.6, 4, 5.5, 'leaf', 8, 0)]];
    case 'cacti': return [[cyl(0.7, 6, 3, 'trunk'), cyl(0.45, 2.4, 3.6, 'leaf'), ball(0.7, 6, 'trunk')], [ball(1.6, 0.6, 'leaf2'), ball(1.0, 1.2, 'leaf2', 1.2)], [cyl(0.6, 4, 2, 'trunk'), ball(0.6, 4, 'trunk')]];
    case 'pines': return [[cyl(0.4, 2, 1, 'trunk'), cyl(2.6, 3.5, 3.5, 'leaf', 8, 0), cyl(1.9, 3, 5.5, 'leaf', 8, 0)], [cyl(0.4, 2, 1, 'trunk'), cyl(2.4, 5, 4, 'leaf', 8, 0), cyl(0.9, 1.4, 6.2, 'leaf2', 8, 0)], [ball(1.4, 0.7, 'leaf2'), ball(1.0, 2.2, 'leaf2'), ball(0.7, 3.3, 'leaf2')]];
    case 'lollipops': return [[cyl(0.2, 5, 2.5, 'trunk'), ball(1.6, 5.6, 'leaf')], [cyl(0.2, 4, 2, 'trunk'), ball(1.3, 4.6, 'leaf2')], [ball(1.4, 1.2, 'leaf'), ball(1.0, 2.6, 'leaf2')]];
    case 'rocks': return [[ball(2.2, 0.8, 'trunk'), ball(1.2, 2.2, 'leaf2', 1.0)], [cyl(1.8, 3, 1.5, 'trunk', 6, 0.6), ball(0.8, 3.2, 'leaf')], [ball(1.6, 0.5, 'leaf2'), cyl(0.4, 0.3, 1.9, 'leaf', 6)]];
    default: return [[cyl(1.0, 6, 3, 'leaf', 6, 0), cyl(0.6, 3, 1.5, 'leaf2', 6, 0)], [cyl(0.8, 4, 2, 'leaf2', 5, 0), ball(1.2, 0.4, 'trunk')], [ball(1.6, 0.6, 'trunk'), cyl(0.5, 4, 3, 'leaf', 6, 0)]];
  }
}

function buildProps(track, theme) {
  const g = new THREE.Group();
  const style = PROP_STYLE[theme.props];
  const variants = propParts(theme.props);
  const mats = {};
  for (const k of ['trunk', 'leaf', 'leaf2']) {
    const glow = style.glow && style.glow.includes(k);
    mats[k] = new THREE.MeshStandardMaterial({ color: style[k], roughness: 0.8, flatShading: true, emissive: glow ? style[k] : 0, emissiveIntensity: glow ? 0.9 : 0 });
  }
  const m4 = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  variants.forEach((parts, vi) => {
    const placed = track.props.filter((p) => p.variant === vi);
    if (!placed.length) return;
    const ys = placed.map((p) => terrainHeight(track, p.x, p.z));
    for (const part of parts) {
      const geo = part.shape === 'ball' ? new THREE.IcosahedronGeometry(part.r, 1) : new THREE.CylinderGeometry(part.r2, part.r, part.h, part.seg);
      const inst = new THREE.InstancedMesh(geo, mats[part.m], placed.length);
      inst.castShadow = true;
      placed.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        m4.compose(new THREE.Vector3(p.x, ys[i], p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        local.makeTranslation(part.x || 0, part.y, 0);
        inst.setMatrixAt(i, m4.clone().multiply(local));
      });
      g.add(inst);
    }
  });
  return g;
}

function buildStars() {
  const pos = [];
  for (let i = 0; i < 1500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
    v.y = Math.abs(v.y) + 40;
    pos.push(v.x, v.y, v.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, sizeAttenuation: false, fog: false }));
}

function framePosition(track, index, lateral, lift = 0) {
  const p = track.points[index], r = track.rights[index];
  return new THREE.Vector3(p[0] + r[0] * lateral, p[1] + lift, p[2] + r[2] * lateral);
}

function buildBoostPads(track, group) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#ff8c00';
  c.fillRect(0, 0, 64, 128);
  c.fillStyle = '#ffe14d';
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(8, 110 - i * 40); c.lineTo(32, 80 - i * 40); c.lineTo(56, 110 - i * 40); c.lineTo(56, 96 - i * 40); c.lineTo(32, 66 - i * 40); c.lineTo(8, 96 - i * 40);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff8c00, emissiveIntensity: 0.6, emissiveMap: tex });
  return track.boosts.map((b) => {
    const t = track.tangents[b.index];
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 6), mat);
    pad.position.copy(framePosition(track, b.index, b.lateral, 0.06));
    pad.rotation.set(-Math.PI / 2, 0, 0);
    pad.rotation.order = 'YXZ';
    pad.rotation.y = Math.atan2(t[0], t[2]) + Math.PI;
    group.add(pad);
    return { index: b.index, lateral: b.lateral, mesh: pad, pos: pad.position.clone() };
  });
}

function buildItemBoxes(track, group) {
  const boxes = [];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const grad = c.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, '#ff5aa5'); grad.addColorStop(0.5, '#7b61ff'); grad.addColorStop(1, '#00e5ff');
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#fff';
  c.font = 'bold 48px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('?', 32, 36);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
  const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  for (const row of track.itemRows) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const lat = (i / (count - 1) - 0.5) * (track.halfWidth * 2 - 3);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(framePosition(track, row.index, lat, 1.4));
      m.castShadow = true;
      group.add(m);
      boxes.push({ index: row.index, mesh: m, pos: m.position.clone(), respawn: 0 });
    }
  }
  return boxes;
}
