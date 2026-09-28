import * as THREE from 'three';
import { noise, fbm, ridge, smooth } from '../noise.js';
import { newSquad, WEATHER_KEYS } from './rules.js';
import { makeBuilding } from './pawns.js';

// Сектор: карта 20×20 клеток (как участок при высадке зонда), владения, постройки, гарнизоны.
export const N = 20, CELL = 0.5, HALF = (N * CELL) / 2;
export const cellXZ = (i) => [-HALF + CELL / 2 + (i % N) * CELL, -HALF + CELL / 2 + Math.floor(i / N) * CELL];
export const nbrs = (i) => {
  const c = i % N, r = Math.floor(i / N), out = [];
  if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1); if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N);
  return out;
};
export const dist = (a, b) => Math.abs((a % N) - (b % N)) + Math.abs(Math.floor(a / N) - Math.floor(b / N));
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
  const cells = Array.from({ length: N * N }, (_, i) => ({ i, owner: null, building: null, base: null, units: [], scouted: false }));
  for (const c of cells) {
    const col = c.i % N;
    if (def.kind === 'nt' && col < N * 0.55) c.owner = 'nt';
    if (def.kind === 'snk' && col >= N * 0.45) c.owner = 'snk';
    if (def.kind === 'unk' && col >= N * 0.25 && col < N * 0.75) c.owner = 'unk';
  }
  for (const [side, i] of Object.entries(BASE)) { cells[i].base = side; cells[i].owner = side; cells[i].building = 'post'; }
  // постройки: случайное количество — вышки, шахты, блок-посты
  const free = cells.filter((c) => !c.base).sort(() => Math.random() - 0.5);
  const nb = 14 + Math.floor(Math.random() * 12);
  for (let k = 0; k < nb; k++) free[k].building = pick(['tower', 'mine', 'post', 'tower', 'mine']);
  // гарнизоны
  for (const c of cells) {
    if (!c.owner) continue;
    const add = (type) => { const s = newSquad(type, c.owner, c.owner); if (c.building || c.base) s.stance = 'fortify'; c.units.push(s); };
    // в одной клетке — один отряд
    if (c.base || c.building) add(c.owner === 'unk' || Math.random() < 0.6 ? 'hold' : 'assault');
    else if (Math.random() < (c.owner === 'unk' ? 0.12 : 0.06)) add(Math.random() < 0.7 ? 'assault' : 'recon');
  }
  return {
    idx, ...def, cells, seed: 3.7 + idx * 5.3,
    weather: pick(WEATHER_KEYS), weatherT: 200 + Math.random() * 160,
    aiT: 25 + Math.random() * 20, spawn: { nt: 70 + Math.random() * 30, snk: 70 + Math.random() * 30, unk: 90 },
  };
}

// ---------- 3D вид сектора ----------
export function buildSectorView(sec) {
  const s = sec.seed, group = new THREE.Group();
  const h = (x, z) => (fbm(x * 0.4 + s, 3.3, z * 0.4 - s, 5) - 0.5) * 0.8 + ridge(x * 0.55 + s * 2, 1, z * 0.55, 4) * 0.3 + (noise(x * 5, 9, z * 5) - 0.5) * 0.04;
  const SEG = 160, geo = new THREE.PlaneGeometry(N * CELL + 0.4, N * CELL + 0.4, SEG, SEG); geo.rotateX(-Math.PI / 2);
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
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 })));
  // сетка клеток по рельефу
  const lp = [];
  for (let k = 0; k <= N; k++) {
    const c = -HALF + k * CELL;
    for (let j = 0; j < 80; j++) {
      const a = -HALF + (j / 80) * N * CELL, b = -HALF + ((j + 1) / 80) * N * CELL;
      lp.push(c, h(c, a) + 0.03, a, c, h(c, b) + 0.03, b, a, h(a, c) + 0.03, c, b, h(b, c) + 0.03, c);
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.22 })));
  // плитки клеток: туман войны и цвет владельца
  const tiles = sec.cells.map((c) => {
    const [cx, cz] = cellXZ(c.i), tg = new THREE.PlaneGeometry(CELL - 0.03, CELL - 0.03, 2, 2); tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position;
    for (let k = 0; k < tp.count; k++) tp.setY(k, h(cx + tp.getX(k), cz + tp.getZ(k)) + 0.035);
    const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    m.position.set(cx, 0, cz); group.add(m); return m;
  });
  // постройки — в углу клетки
  const props = [];
  for (const c of sec.cells) {
    if (!c.building) continue;
    const [cx, cz] = cellXZ(c.i), b = makeBuilding(c.building), x = cx - CELL * 0.22, z = cz - CELL * 0.22;
    b.scale.setScalar(0.32);
    b.position.set(x, h(x, z), z); group.add(b); props.push(b);
  }
  // голографическая рамка и сканирующая полоса
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(N * CELL + 0.4, 2.2, N * CELL + 0.4)), new THREE.LineBasicMaterial({ color: 0x3aa8d8, transparent: true, opacity: 0.3 }));
  edge.position.y = 0.3; group.add(edge);
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(N * CELL + 0.4, 2.4), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  sweep.position.y = 0.3; group.add(sweep);
  // позёмка
  const SN = 700, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) sp.set([(Math.random() - 0.5) * (N * CELL), Math.random() * 1.4 - 0.2, (Math.random() - 0.5) * (N * CELL)], i * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xeaf6ff, size: 0.025, transparent: true, opacity: 0.6, depthWrite: false }));
  group.add(snow);

  const COLORS = { nt: [0xff8a20, 0.2], snk: [0x3a8cff, 0.2], unk: [0x9cff50, 0.16], us: [0xff3040, 0.16] };
  return {
    group, h, tiles,
    // перекрасить плитки: туман, владельцы
    paint() {
      sec.cells.forEach((c, i) => {
        const m = tiles[i].material;
        if (!c.scouted) { m.color.set(0x0c1a26); m.opacity = 0.42; }
        else if (COLORS[c.owner]) { m.color.set(COLORS[c.owner][0]); m.opacity = COLORS[c.owner][1]; }
        else m.opacity = 0;
      });
    },
    update(dt, t, wind) {
      sweep.position.z = ((t * 1.1) % (N * CELL + 2)) - HALF - 1;
      for (let i = 0; i < SN; i++) { let x = sp[i * 3] + dt * wind * (1 + (i % 5) * 0.2); if (x > HALF) x -= N * CELL; sp[i * 3] = x; }
      sg.attributes.position.needsUpdate = true;
      for (const b of props) { if (b.userData.lamp) b.userData.lamp.visible = Math.sin(t * 4) > 0; if (b.userData.wheel) b.userData.wheel.rotation.z += dt * 1.5; }
    },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.userData.pawnRoot && o.material.dispose && o.parent === group) o.material.dispose(); });
      group.removeFromParent();
    },
  };
}
