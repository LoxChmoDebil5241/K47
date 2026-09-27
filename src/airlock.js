import * as THREE from 'three';
import { metal, hazard, airlockPanel } from './textures.js';

// Шлюз в духе SS14: массивная рама, две створки разъезжаются в стороны,
// лампы состояния над проёмом, жёлто-чёрные полосы на пороге.
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.5, ...o });

export function buildAirlock(scene, { z, w, h }) {
  const g = new THREE.Group(); g.position.z = z; scene.add(g);
  const frameMat = std({ map: metal(12, '#4a4f55') });
  const darkMat = std({ map: metal(13, '#26292c') });
  const haz = hazard(); haz.repeat.set(4, 1);
  const hazMat = std({ map: haz, roughness: 0.8, metalness: 0.1 });

  const T = 0.26, DEPTH = 0.5;       // толщина рамы и глубина проёма
  const add = (geo, mat, x, y, zz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); g.add(m); return m; };
  // рама
  add(new THREE.BoxGeometry(w + T * 2, T, DEPTH), frameMat, 0, h + T / 2, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(T, h, DEPTH), frameMat, s * (w / 2 + T / 2), h / 2, 0);
  // скосы-наличники внутрь комнаты
  for (const s of [-1, 1]) {
    const b = add(new THREE.BoxGeometry(0.08, h + T, 0.08), darkMat, s * (w / 2 + T + 0.02), (h + T) / 2, -DEPTH / 2);
    b.rotation.y = s * 0.3;
  }
  // жёлто-чёрная полоса на внутренних торцах рамы и на пороге
  for (const s of [-1, 1]) {
    const strip = add(new THREE.PlaneGeometry(DEPTH - 0.1, h - 0.1), hazMat, s * (w / 2 + 0.001), h / 2, 0);
    strip.rotation.y = -s * Math.PI / 2;
    strip.material = hazMat.clone(); strip.material.map = haz.clone(); strip.material.map.repeat.set(1, 6); strip.material.map.needsUpdate = true;
  }
  const sill = add(new THREE.BoxGeometry(w + T * 2, 0.04, DEPTH + 0.3), hazMat, 0, 0.02, -0.05);
  sill.receiveShadow = true;
  // болты по раме
  const boltMat = std({ color: 0x8a9096, metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const bolt = add(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), boltMat, s * (w / 2 + T / 2), 0.2 + i * (h - 0.3) / 6, -DEPTH / 2 - 0.01);
    bolt.rotation.x = Math.PI / 2;
  }
  // лампы состояния над проёмом
  const lampMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
  const lamps = [-1, 1].map((s, i) => add(new THREE.BoxGeometry(0.14, 0.06, 0.04), lampMats[i], s * 0.35, h + T / 2, -DEPTH / 2 - 0.02));
  const statusLight = new THREE.PointLight(0xff2020, 0.8, 2.5, 2);
  statusLight.position.set(0, h + 0.05, -DEPTH / 2 - 0.3); g.add(statusLight);
  // табличка
  const signC = document.createElement('canvas'); signC.width = 256; signC.height = 48;
  const sg = signC.getContext('2d');
  sg.fillStyle = '#1b1d1f'; sg.fillRect(0, 0, 256, 48);
  sg.fillStyle = '#c9a21a'; sg.font = 'bold 26px "Courier New", monospace'; sg.textAlign = 'center';
  sg.fillText('ШЛЮЗ · СЕКТОР 47', 128, 33);
  const sign = add(new THREE.PlaneGeometry(0.62, 0.12), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(signC), roughness: 0.7 }), 0, h + T + 0.12, -DEPTH / 2 - 0.01);
  sign.rotation.y = Math.PI;
  sign.material.map.colorSpace = THREE.SRGBColorSpace;

  // створки: стоят в глубине рамы, при открытии уезжают внутрь стены
  const panels = ['L', 'R'].map((side, i) => {
    const s = i === 0 ? -1 : 1;
    const pg = new THREE.Group(); g.add(pg);
    const tex = airlockPanel(side);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / 2, h, 0.12), [
      darkMat, darkMat, darkMat, darkMat, std({ map: tex, roughness: 0.55 }), std({ map: tex, roughness: 0.55 }),
    ]);
    m.rotation.y = Math.PI; // лицевая сторона — в комнату
    m.castShadow = m.receiveShadow = true;
    pg.add(m);
    pg.position.set(s * w / 4, h / 2, 0.05);
    return { g: pg, s };
  });
  // зубцы по краю смыкания
  const toothMat = std({ color: 0x2a2d30 });
  for (const p of panels) for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.13), toothMat);
    t.position.set(-p.s * (w / 4 - 0.02), -h / 2 + 0.3 + i * 0.45 + (p.s > 0 ? 0.2 : 0), 0);
    p.g.add(t);
  }

  // невидимая зона нажатия
  const hit = add(new THREE.BoxGeometry(w + T * 2, h + T, 0.2), new THREE.MeshBasicMaterial({ visible: false }), 0, h / 2, -DEPTH / 2 - 0.1);

  const state = { open: false, t: 0, busy: false };
  return {
    hit, state,
    toggle() {
      if (state.busy) return false;
      state.open = !state.open; state.busy = true; state.wait = 0.35; // пауза: лампы мигают, потом створки едут
      return true;
    },
    update(dt, time) {
      if (state.wait > 0) state.wait -= dt;
      else {
        const target = state.open ? 1 : 0;
        const speed = 1.6;
        state.t += Math.sign(target - state.t) * Math.min(Math.abs(target - state.t), dt * speed);
        if (state.t === target) state.busy = false;
      }
      const k = state.t < 0.5 ? 2 * state.t * state.t : 1 - Math.pow(-2 * state.t + 2, 2) / 2;
      for (const p of panels) p.g.position.x = p.s * (w / 4 + k * (w / 2 + 0.05));
      // лампы: мигают жёлтым в движении, зелёные — открыт, красные — закрыт
      const blink = Math.floor(time * 6) % 2;
      const c = state.busy ? (blink ? 0xffb020 : 0x301000) : state.open ? 0x20ff40 : 0xff2020;
      lampMats.forEach((m) => m.color.setHex(c));
      statusLight.color.setHex(state.busy ? 0xffa020 : state.open ? 0x20ff40 : 0xff2020);
      statusLight.intensity = state.busy && !blink ? 0.1 : 0.8;
    },
  };
}
