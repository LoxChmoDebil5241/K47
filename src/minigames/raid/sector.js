import * as THREE from 'three';
import { noise, fbm, ridge, smooth } from '../noise.js';
import { newSquad, WEATHER_KEYS, FAUNA_TYPES } from './rules.js';
import { makeBuilding } from './pawns.js';
import { N, R, SIZE_X, SIZE_Z, cellXZ, nbrs, dist, within, hexAt, corners } from './hex.js';

// Сектор: гексагональная карта 20×20 (как участок при высадке зонда), владения, постройки, гарнизоны, тела.
export { N, R, cellXZ, nbrs, dist, within, hexAt };
export const BASE = { nt: 10 * N, snk: 10 * N + N - 1 };
// 4 точки на планете: одна свободна, одна НТ, одна СНК, одна — неустановленный противник
export const SECTORS = [
  { letter: 'Д', kind: 'free', lat: 0.3, lon: -0.44 },
  { letter: 'Е', kind: 'nt', lat: 0.3, lon: 0.26 },
  { letter: 'Ж', kind: 'snk', lat: -0.16, lon: -0.4 },
  { letter: 'З', kind: 'unk', lat: -0.18, lon: 0.3 },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function makeSector(def, idx) {
  const cells = Array.from({ length: N * N }, (_, i) => ({ i, owner: null, building: null, base: null, units: [], scouted: false, corpses: [] }));
  for (const c of cells) {
    const col = c.i % N;
    if (def.kind === 'nt' && col < N * 0.55) c.owner = 'nt';
    if (def.kind === 'snk' && col >= N * 0.45) c.owner = 'snk';
    if (def.kind === 'unk' && col >= N * 0.25 && col < N * 0.75) c.owner = 'unk';
  }
  for (const [side, i] of Object.entries(BASE)) { cells[i].base = side; cells[i].owner = side; cells[i].building = 'post'; }
  // постройки: вышки, шахты, блок-посты
  const free = cells.filter((c) => !c.base).sort(() => Math.random() - 0.5);
  const nb = 14 + Math.floor(Math.random() * 12);
  for (let k = 0; k < nb; k++) free[k].building = pick(['tower', 'mine', 'post', 'tower', 'mine']);
  // гарнизоны: в клетке — один отряд
  for (const c of cells) {
    if (!c.owner) continue;
    const add = (type) => { const s = newSquad(type, c.owner, c.owner); if (c.building || c.base) s.stance = 'fortify'; c.units.push(s); };
    if (c.base || c.building) add(c.owner === 'unk' || Math.random() < 0.6 ? 'hold' : 'assault');
    else if (Math.random() < (c.owner === 'unk' ? 0.12 : 0.06)) add(Math.random() < 0.7 ? 'assault' : 'recon');
  }
  // стаи фауны: в секторе неизвестных — больше
  const packs = def.kind === 'unk' ? 5 : 2;
  for (let k = 0; k < packs; k++) {
    const c = pick(cells.filter((x) => !x.units.length && !x.owner));
    if (c) c.units.push(newSquad(pick(FAUNA_TYPES), 'fauna', 'fauna'));
  }
  return {
    idx, ...def, cells, vehicles: [], seed: 3.7 + idx * 5.3, ctrl: new Array(N * N).fill(null), ctrlSeen: new Array(N * N).fill(false),
    weather: pick(WEATHER_KEYS), weatherT: 200 + Math.random() * 160,
    aiT: 25 + Math.random() * 20, spawn: { nt: 70 + Math.random() * 30, snk: 70 + Math.random() * 30, unk: 90, fauna: 100 },
  };
}

// ---------- 3D вид сектора ----------
export function buildSectorView(sec) {
  const s = sec.seed, group = new THREE.Group();
  const h = (x, z) => (fbm(x * 0.4 + s, 3.3, z * 0.4 - s, 5) - 0.5) * 0.8 + ridge(x * 0.55 + s * 2, 1, z * 0.55, 4) * 0.3 + (noise(x * 5, 9, z * 5) - 0.5) * 0.04;
  const SEG = 170, geo = new THREE.PlaneGeometry(SIZE_X + 0.6, SIZE_Z + 0.6, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, h(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), steep = 1 - nrm.getY(i), n = noise(pos.getX(i) * 4 + s, 0, pos.getZ(i) * 4);
    const rock = smooth(0.2, 0.4, steep + (n - 0.5) * 0.15), snow = smooth(0, 0.5, y + (n - 0.5) * 0.3) * (1 - rock);
    let r = 0.52, g = 0.68, b = 0.82;
    r += (0.92 - r) * snow; g += (0.95 - g) * snow; b += (0.99 - b) * snow;
    r += (0.33 + n * 0.1 - r) * rock; g += (0.34 + n * 0.1 - g) * rock; b += (0.37 + n * 0.1 - b) * rock;
    col.set([r, g, b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }));
  group.add(ground);
  // контуры гексов по рельефу
  const lp = [];
  for (let i = 0; i < N * N; i++) {
    const cs = corners(i, 0.99);
    for (let k = 0; k < 6; k++) {
      const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 6];
      for (let t = 0; t < 2; t++) {
        const x0 = ax + (bx - ax) * t / 2, z0 = az + (bz - az) * t / 2, x1 = ax + (bx - ax) * (t + 1) / 2, z1 = az + (bz - az) * (t + 1) / 2;
        lp.push(x0, h(x0, z0) + 0.02, z0, x1, h(x1, z1) + 0.02, z1);
      }
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.18 })));
  // подложка гексов одним мешем: цвет и прозрачность на каждый гекс (туман, владельцы, контроль, цели)
  const V = 7, ov = new Float32Array(N * N * V * 3), oc = new Float32Array(N * N * V * 4), idx = [];
  for (let i = 0; i < N * N; i++) {
    const [cx, cz] = cellXZ(i), cs = corners(i, 0.94), b = i * V;
    ov.set([cx, h(cx, cz) + 0.03, cz], b * 3);
    cs.forEach(([x, z], k) => ov.set([x, h(x, z) + 0.03, z], (b + 1 + k) * 3));
    for (let k = 0; k < 6; k++) idx.push(b, b + 1 + ((k + 1) % 6), b + 1 + k);
  }
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.BufferAttribute(ov, 3)); og.setAttribute('color', new THREE.BufferAttribute(oc, 4)); og.setIndex(idx);
  const overlay = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  overlay.renderOrder = 1; group.add(overlay);
  // постройки — в углу гекса
  const props = [];
  for (const c of sec.cells) {
    if (!c.building) continue;
    const [cx, cz] = cellXZ(c.i), b = makeBuilding(c.building), x = cx - R * 0.35, z = cz - R * 0.35;
    b.scale.setScalar(0.3); b.position.set(x, h(x, z), z); group.add(b); props.push(b);
  }
  // голографическая рамка и сканирующая полоса
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE_X + 0.6, 2.2, SIZE_Z + 0.6)), new THREE.LineBasicMaterial({ color: 0x3aa8d8, transparent: true, opacity: 0.3 }));
  edge.position.y = 0.3; group.add(edge);
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(SIZE_X + 0.6, 2.4), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  sweep.position.y = 0.3; group.add(sweep);
  // позёмка
  const SN = 700, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) sp.set([(Math.random() - 0.5) * SIZE_X, Math.random() * 1.2 - 0.2, (Math.random() - 0.5) * SIZE_Z], i * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xeaf6ff, size: 0.02, transparent: true, opacity: 0.6, depthWrite: false })));

  return {
    group, ground, h,
    // покраска гексов: fn(i) → [r, g, b, a] (0..1)
    paint(fn) {
      for (let i = 0; i < N * N; i++) {
        const [r, g, b, a] = fn(i);
        for (let k = 0; k < V; k++) oc.set([r, g, b, k ? a : a * 0.75], (i * V + k) * 4);
      }
      og.attributes.color.needsUpdate = true;
    },
    update(dt, t, wind) {
      sweep.position.z = ((t * 1.1) % (SIZE_Z + 2)) - SIZE_Z / 2 - 1;
      for (let i = 0; i < SN; i++) { let x = sp[i * 3] + dt * wind * (1 + (i % 5) * 0.2); if (x > SIZE_X / 2) x -= SIZE_X; sp[i * 3] = x; }
      sg.attributes.position.needsUpdate = true;
      for (const b of props) { if (b.userData.lamp) b.userData.lamp.visible = Math.sin(t * 4) > 0; if (b.userData.wheel) b.userData.wheel.rotation.z += dt * 1.5; }
    },
    dispose() {
      group.traverse((o) => { if (o.parent === group && o.geometry) { o.geometry.dispose(); if (o.material?.dispose && !o.userData.pawnRoot) o.material.dispose(); } });
      group.removeFromParent();
    },
  };
}
