import * as THREE from 'three';
import { std, box, cyl, canvasTex } from '../geom.js';

// Верхний ящик тумбы: выдвигается, внутри — мелочёвка прошлых жильцов.
// Координаты — в системе тумбы: +Z смотрит в комнату, ящик выезжает вдоль +Z.
const W = 0.62, D = 0.46, H = 0.14;

export function buildDrawer(steel, steelDark, chrome) {
  const root = new THREE.Group();
  const slide = new THREE.Group(); root.add(slide);
  // лицевая панель и ручка
  box(0.68, 0.2, 0.02, steel, 0, 0, 0, slide);
  box(0.24, 0.022, 0.03, chrome, 0, 0.03, 0.025, slide);
  // короб: дно, бока, задняя стенка
  const inner = std({ color: 0x2c2e30, roughness: 0.9 });
  box(W, 0.008, D, inner, 0, -H / 2, -D / 2, slide);
  for (const s of [-1, 1]) box(0.01, H, D, steelDark, s * W / 2, 0, -D / 2, slide);
  box(W, H, 0.01, steelDark, 0, 0, -D, slide);

  // мелочёвка на дне (y — от дна)
  const y0 = -H / 2 + 0.004;
  const items = new THREE.Group(); items.position.set(0, y0, -D / 2); slide.add(items);
  const put = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; items.add(m); return m; };
  // блистер с таблетками
  const blister = new THREE.Group(); put(blister, -0.18, 0.004, 0.1, 0.4);
  box(0.09, 0.004, 0.05, std({ color: 0xb8bcc0, roughness: 0.4, metalness: 0.6 }), 0, 0, 0, blister);
  for (let i = 0; i < 8; i++) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xe8e8e8, transparent: true, opacity: 0.7, roughness: 0.2 }));
    cap.position.set(-0.03 + (i % 4) * 0.02, 0.002, i < 4 ? -0.012 : 0.012); blister.add(cap);
  }
  // связка ключей
  const keys = new THREE.Group(); put(keys, 0.12, 0.004, 0.12, 1.2);
  const ringM = std({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0015, 6, 20), ringM); ring.rotation.x = Math.PI / 2; keys.add(ring);
  for (let i = 0; i < 3; i++) {
    const k = box(0.045, 0.002, 0.012, std({ color: [0xb09040, 0x9a9a9a, 0x7a6a50][i], metalness: 0.8, roughness: 0.35 }), 0.035, 0.002 * i, 0, keys);
    k.rotation.y = i * 0.6 - 0.6; k.geometry.translate(0.02, 0, 0);
  }
  // батарейки
  for (let i = 0; i < 3; i++) {
    const b = cyl(0.007, 0.007, 0.05, std({ color: i === 1 ? 0x8a2020 : 0x202428, roughness: 0.5, metalness: 0.4 }), 0.02 + i * 0.016, 0.007, -0.1 + i * 0.01, items, 12);
    b.rotation.z = Math.PI / 2; b.rotation.y = 0.2 * i;
  }
  // жетон на цепочке
  const tag = box(0.028, 0.002, 0.048, std({ color: 0xaeb2b6, metalness: 0.85, roughness: 0.3 }), -0.05, 0.002, -0.12, items); tag.rotation.y = -0.5;
  const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, 0.002, -0.145), new THREE.Vector3(-0.1, 0.002, -0.17), new THREE.Vector3(-0.17, 0.002, -0.12), new THREE.Vector3(-0.2, 0.002, -0.03),
  ]), 30, 0.0012, 4), ringM); items.add(chain);
  // кассета
  const cas = box(0.1, 0.012, 0.064, std({ color: 0x111113, roughness: 0.6 }), 0.16, 0.006, -0.08, items); cas.rotation.y = -0.25;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), std({
    map: canvasTex(160, 60, (g, w, h) => { g.fillStyle = '#d8d0b8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2440'; g.font = '22px "Caveat", cursive'; g.fillText('допрос К-44', 10, 38); }),
  }));
  label.rotation.x = -Math.PI / 2; label.position.y = 0.0065; cas.add(label);
  // спички, огрызок карандаша, монеты
  const match = box(0.05, 0.015, 0.035, std({ color: 0x6a2a18, roughness: 0.8 }), -0.2, 0.0075, -0.08, items); match.rotation.y = 0.9;
  const pen = cyl(0.004, 0.004, 0.07, std({ color: 0x9a6622 }), 0.02, 0.004, 0.16, items, 6); pen.rotation.set(0, 0.3, Math.PI / 2);
  for (let i = 0; i < 4; i++) cyl(0.009, 0.009, 0.002, std({ color: 0x8a7040, metalness: 0.8, roughness: 0.4 }), -0.07 + i * 0.012, 0.001 + i * 0.002, 0.03 + (i % 2) * 0.01, items, 14);
  // сложенная записка
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.05), std({
    map: canvasTex(140, 100, (g, w, h) => { g.fillStyle = '#cfc4a8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2440'; g.font = '20px "Caveat", cursive'; g.fillText('они слышат', 10, 40); g.fillText('через стену', 16, 72); }),
    side: THREE.DoubleSide,
  }));
  note.rotation.set(-Math.PI / 2, 0, 0.3); note.position.set(0.08, 0.001, 0.04); items.add(note);

  items.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const hit = box(0.7, 0.22, 0.06, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.02, slide);
  // точка для камеры — центр дна уже выдвинутого ящика
  const anchor = new THREE.Object3D(); anchor.position.set(0, y0, -D / 2 + (D - 0.06)); root.add(anchor);

  const st = { t: 0, want: false };
  return {
    root, hit, anchor,
    open() { st.want = true; }, close() { st.want = false; },
    get openAmount() { return st.t; },
    update(dt) {
      st.t = THREE.MathUtils.clamp(st.t + (st.want ? dt : -dt) * 1.6, 0, 1);
      const k = st.t * st.t * (3 - 2 * st.t);
      slide.position.z = k * (D - 0.06);
    },
  };
}
