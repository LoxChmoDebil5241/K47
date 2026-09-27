import * as THREE from 'three';
import { metal, hazard } from './textures.js';
import { std, box, planeUV } from './geom.js';

// Гермоворота: две толстые стальные створки с прямым швом по центру, без окон.
// Над проёмом и по бокам — круглые красные лампы индикации. Створки уезжают в стену
// и обрезаются плоскостями по краям проёма, поэтому снаружи их не видно.
export const OPEN_TIME = 5; // секунд на ход створок

export function buildAirlock(scene, { z, w, h }) {
  const g = new THREE.Group(); g.position.z = z; scene.add(g);
  const frameMat = std({ map: metal(13, '#3e4348'), roughness: 0.7, metalness: 0.4 });
  const darkMat = std({ map: metal(14, '#222528'), roughness: 0.75, metalness: 0.35 });
  const hazMat = std({ map: hazard(), roughness: 0.8, metalness: 0.1 });

  // ---------- массивная рама ----------
  const T = 0.46, DEPTH = 1.0;
  box(w + T * 2, T, DEPTH, frameMat, 0, h + T / 2, 0, g, 2);
  for (const s of [-1, 1]) box(T, h, DEPTH, frameMat, s * (w / 2 + T / 2), h / 2, 0, g, 2);
  box(w + T * 2 + 0.2, 0.1, 0.08, darkMat, 0, h + T + 0.05, -DEPTH / 2 - 0.04, g, 2);
  for (const s of [-1, 1]) box(0.1, h + T + 0.1, 0.08, darkMat, s * (w / 2 + T + 0.05), (h + T + 0.1) / 2, -DEPTH / 2 - 0.04, g, 2);
  box(w + T * 2, 0.05, DEPTH + 0.3, hazMat, 0, 0.025, -0.05, g, 3).receiveShadow = true;
  const boltMat = std({ color: 0x7a8086, metalness: 0.8, roughness: 0.4 });
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 6), boltMat);
    bolt.position.set(s * (w / 2 + T / 2), 0.2 + i * (h - 0.3) / 7, -DEPTH / 2 - 0.012); bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }

  // ---------- красные лампы индикации ----------
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a, toneMapped: false });
  const lampOff = new THREE.MeshBasicMaterial({ color: 0x2a0404 });
  const lampGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16);
  const ringGeo = new THREE.TorusGeometry(0.042, 0.009, 6, 16);
  const lamps = [];
  const addLamp = (x, y) => {
    const l = new THREE.Mesh(lampGeo, lampMat); l.rotation.x = Math.PI / 2; l.position.set(x, y, -DEPTH / 2 - 0.02); g.add(l);
    const r = new THREE.Mesh(ringGeo, darkMat); r.position.set(x, y, -DEPTH / 2 - 0.03); g.add(r);
    lamps.push(l);
  };
  for (let i = 0; i < 7; i++) addLamp(-0.54 + i * 0.18, h + T / 2);           // ряд над проёмом
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) addLamp(s * (w / 2 + T / 2), h * 0.55 + i * 0.16); // колонки по бокам
  const statusLight = new THREE.PointLight(0xff1a1a, 1.2, 3, 2);
  statusLight.position.set(0, h + 0.1, -DEPTH / 2 - 0.4); g.add(statusLight);

  // ---------- створки ----------
  const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), w / 2), new THREE.Plane(new THREE.Vector3(-1, 0, 0), w / 2)];
  const mat = (o) => { const m = std({ ...o, clippingPlanes: clip }); m.clipShadows = true; return m; };
  const plate = mat({ map: metal(12, '#5d6268', 0.8), roughness: 0.65, metalness: 0.45 });
  const ribM = mat({ map: metal(15, '#34383c'), roughness: 0.7, metalness: 0.4 });
  const hazM = mat({ map: hazard(), roughness: 0.75, metalness: 0.1 });
  const PD = 0.34, OVER = 0.15;
  const panels = [-1, 1].map((side) => {
    const pg = new THREE.Group(); g.add(pg);
    const pw = w / 2 + OVER;
    const center = side * (pw / 2 + 0.002); // створка от шва (x≈0) наружу, заходит в раму на OVER
    const slab = box(pw, h, PD, plate, center, h / 2, 0, pg, 1.5);
    slab.castShadow = slab.receiveShadow = true;
    // горизонтальные рёбра жёсткости с обеих сторон
    for (const y of [0.12, 0.35, 0.58, 0.81]) for (const zz of [-1, 1]) {
      box(pw - 0.06, 0.1, 0.05, ribM, center, y * h, zz * (PD / 2 + 0.025), pg, 2);
    }
    // вертикальная стойка у шва и жёлто-чёрная полоса
    for (const zz of [-1, 1]) {
      box(0.1, h, 0.06, ribM, side * 0.06, h / 2, zz * (PD / 2 + 0.03), pg, 2);
      const hz = new THREE.Mesh(planeUV(new THREE.PlaneGeometry(0.1, h - 0.05), 4), hazM);
      hz.position.set(side * 0.06, h / 2, zz * (PD / 2 + 0.061)); if (zz > 0) hz.rotation.y = Math.PI;
      pg.add(hz);
    }
    return { g: pg, side, travel: w / 2 + 0.02 };
  });

  const hit = box(w + T * 2, h + T, 0.2, new THREE.MeshBasicMaterial({ visible: false }), 0, h / 2, -DEPTH / 2 - 0.1, g);

  const state = { open: false, t: 0, busy: false, wait: 0 };
  return {
    hit, state,
    toggle() {
      if (state.busy) return false;
      state.open = !state.open; state.busy = true; state.wait = 1.2;
      return true;
    },
    update(dt, time) {
      if (state.wait > 0) state.wait -= dt;
      else if (state.busy) {
        const target = state.open ? 1 : 0;
        state.t += Math.sign(target - state.t) * Math.min(Math.abs(target - state.t), dt / OPEN_TIME);
        if (state.t === target) state.busy = false;
      }
      const k = state.t < 0.5 ? 2 * state.t * state.t : 1 - Math.pow(-2 * state.t + 2, 2) / 2;
      for (const p of panels) p.g.position.x = p.side * k * p.travel;
      // закрыто — горят ровно; в движении — бегущий огонь; открыто — медленно мигают
      lamps.forEach((l, i) => {
        const on = state.busy ? (Math.floor(time * 8) + i) % 3 === 0 : state.open ? Math.floor(time * 1.5) % 2 === 0 : true;
        l.material = on ? lampMat : lampOff;
      });
      statusLight.intensity = state.busy ? 0.6 + 0.6 * Math.abs(Math.sin(time * 8)) : 1.2;
    },
  };
}
