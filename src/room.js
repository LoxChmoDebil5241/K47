import * as THREE from 'three';
import { concrete, ice, frozenWall, notebookPage } from './textures.js';

// Комната: игрок сидит в центре лицом к -Z.
// Прямо — терминал, справа (+X) — стол с блокнотом, слева (-X) — обледенелая стена,
// сзади (+Z) — проход в тёмный коридор.
export const ROOM = { w: 4.2, d: 4.4, h: 2.8, doorW: 1.2, doorH: 2.2, corridorLen: 14 };

function mat(map, opts = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, ...opts });
}

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export function buildRoom(scene, terminalTexture) {
  const { w, d, h, doorW, doorH, corridorLen } = ROOM;
  const front = -d / 2, back = d / 2;

  const wallMat = mat(concrete(11, 2));
  const floorMat = mat(concrete(5, 3), { color: 0x6a6a6a, roughness: 0.8 });
  const ceilMat = mat(concrete(23, 2), { color: 0x555555 });
  const frostMat = mat(frozenWall(42), { roughness: 0.45, metalness: 0.05 });
  frostMat.map.repeat.set(2, 1);

  // пол и потолок
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = h;
  scene.add(ceil);

  // стены
  const wall = (width, material) => new THREE.Mesh(new THREE.PlaneGeometry(width, h), material);
  const fw = wall(w, wallMat); fw.position.set(0, h / 2, front); scene.add(fw);
  const rw = wall(d, wallMat); rw.rotation.y = -Math.PI / 2; rw.position.set(w / 2, h / 2, 0); scene.add(rw);
  const lw = wall(d, frostMat); lw.rotation.y = Math.PI / 2; lw.position.set(-w / 2, h / 2, 0); scene.add(lw);

  // задняя стена с проёмом
  const side = (w - doorW) / 2;
  for (const s of [-1, 1]) {
    const p = wall(side, wallMat);
    p.rotation.y = Math.PI; p.position.set(s * (doorW / 2 + side / 2), h / 2, back);
    scene.add(p);
  }
  const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorW, h - doorH), wallMat);
  lintel.rotation.y = Math.PI; lintel.position.set(0, doorH + (h - doorH) / 2, back);
  scene.add(lintel);

  // коридор
  const cz = back + corridorLen / 2;
  const cFloor = new THREE.Mesh(new THREE.PlaneGeometry(doorW, corridorLen), floorMat);
  cFloor.rotation.x = -Math.PI / 2; cFloor.position.set(0, 0, cz); scene.add(cFloor);
  const cCeil = new THREE.Mesh(new THREE.PlaneGeometry(doorW, corridorLen), ceilMat);
  cCeil.rotation.x = Math.PI / 2; cCeil.position.set(0, doorH, cz); scene.add(cCeil);
  for (const s of [-1, 1]) {
    const cw = new THREE.Mesh(new THREE.PlaneGeometry(corridorLen, doorH), wallMat);
    cw.rotation.y = -s * Math.PI / 2; cw.position.set(s * doorW / 2, doorH / 2, cz);
    scene.add(cw);
  }
  // далёкая аварийная лампа в глубине коридора
  const emerg = new THREE.PointLight(0xff1a1a, 2, 5, 1.5);
  emerg.position.set(0, doorH - 0.15, back + 5);
  scene.add(emerg);
  const emergBulb = box(0.12, 0.05, 0.12, new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  emergBulb.position.copy(emerg.position).add(new THREE.Vector3(0, 0.12, 0));
  scene.add(emergBulb);

  // трубы под потолком
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.5, metalness: 0.7 });
  for (const [x, r] of [[-1.5, 0.07], [-1.25, 0.045], [1.7, 0.06]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d, 12), pipeMat);
    p.rotation.x = Math.PI / 2; p.position.set(x, h - 0.15, 0);
    scene.add(p);
  }

  // ---------- терминал (прямо) ----------
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.6, metalness: 0.6 });
  const plasticMat = new THREE.MeshStandardMaterial({ color: 0x3b3934, roughness: 0.7 });
  const desk = box(1.5, 0.05, 0.8, deskMat); desk.position.set(0, 0.74, front + 0.55); scene.add(desk);
  for (const x of [-0.7, 0.7]) {
    const leg = box(0.05, 0.74, 0.7, deskMat); leg.position.set(x, 0.37, front + 0.55); scene.add(leg);
  }
  const crt = new THREE.Group();
  const body = box(0.66, 0.54, 0.55, plasticMat); body.position.z = -0.05; crt.add(body);
  const back2 = box(0.46, 0.4, 0.25, plasticMat); back2.position.z = -0.42; crt.add(back2);
  const bezel = box(0.58, 0.46, 0.02, new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 }));
  bezel.position.z = 0.23; crt.add(bezel);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.39),
    new THREE.MeshBasicMaterial({ map: terminalTexture, toneMapped: false }),
  );
  screen.position.z = 0.241; screen.name = 'terminal';
  crt.add(screen);
  crt.position.set(0, 1.04, front + 0.42);
  scene.add(crt);
  const kb = box(0.5, 0.03, 0.17, plasticMat); kb.position.set(0, 0.78, front + 0.82); kb.rotation.x = 0.08; scene.add(kb);
  const screenLight = new THREE.PointLight(0xff2a2a, 0.6, 2.5, 2);
  screenLight.position.set(0, 1.04, front + 0.9); scene.add(screenLight);

  // красный неон над терминалом
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff1030, toneMapped: false });
  const neon = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 10), neonMat);
  neon.rotation.z = Math.PI / 2; neon.position.set(0, 2.05, front + 0.06);
  scene.add(neon);
  const neonLight = new THREE.PointLight(0xff0a28, 3, 6, 1.6);
  neonLight.position.set(0, 2.0, front + 0.3); scene.add(neonLight);

  // ---------- стол с блокнотом (справа) ----------
  const table = box(0.7, 0.05, 1.1, deskMat); table.position.set(1.45, 0.74, -0.1); scene.add(table);
  const tLeg = box(0.6, 0.74, 0.05, deskMat); tLeg.position.set(1.45, 0.37, -0.6); scene.add(tLeg);
  const tLeg2 = tLeg.clone(); tLeg2.position.z = 0.4; scene.add(tLeg2);
  const notebook = new THREE.Group();
  const cover = box(0.24, 0.015, 0.32, new THREE.MeshStandardMaterial({ color: 0x3a1616, roughness: 0.8 }));
  notebook.add(cover);
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.3),
    mat(notebookPage([
      'Цикл 48.', '', 'Холодно. Пальцы', 'не слушаются.', '',
      'Терминал включается', 'сам. Каждый раз.', '', 'Не оборачиваться', 'на коридор.',
    ]), { roughness: 0.9 }),
  );
  page.rotation.x = -Math.PI / 2; page.position.y = 0.009; page.name = 'notebook';
  notebook.add(page);
  notebook.position.set(1.33, 0.775, -0.05); notebook.rotation.y = 0.25;
  scene.add(notebook);
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.6; pen.position.set(1.5, 0.772, 0.2); scene.add(pen);
  // холодная тусклая лампа над столом
  const lamp = new THREE.SpotLight(0xa8c4ff, 7, 3.5, 0.7, 0.8, 1.3);
  lamp.position.set(1.4, 2.3, -0.05); lamp.target = notebook; scene.add(lamp);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.12, 16, 1, true), pipeMat);
  shade.position.set(1.4, 2.36, -0.05); scene.add(shade);

  // ---------- лёд на левой стене ----------
  const iceMat = new THREE.MeshStandardMaterial({
    map: ice(), color: 0xaad8ff, transparent: true, opacity: 0.55,
    roughness: 0.1, metalness: 0.1, emissive: 0x0a1a2a,
  });
  const iceGroup = new THREE.Group();
  const r = (a, b) => a + Math.random() * (b - a);
  // сосульки вдоль стены
  const icicleMat = iceMat.clone(); icicleMat.opacity = 0.75;
  for (let i = 0; i < 26; i++) {
    const len = r(0.08, 0.45);
    const c = new THREE.Mesh(new THREE.ConeGeometry(r(0.015, 0.04), len, 6), icicleMat);
    c.rotation.x = Math.PI;
    c.position.set(-w / 2 + r(0.03, 0.12), h - len / 2, r(-2, 2));
    iceGroup.add(c);
  }
  scene.add(iceGroup);
  // холодная подсветка льда
  const iceLight = new THREE.PointLight(0x4a8cff, 1.4, 4, 1.5);
  iceLight.position.set(-0.7, 2.2, 0.3); scene.add(iceLight);

  scene.add(new THREE.HemisphereLight(0x26304a, 0x100808, 2.2));

  return {
    screen, notebook: page, neon, neonLight, neonMat, emerg, emergBulb, screenLight,
    focus: {
      terminal: { pos: new THREE.Vector3(0, 1.05, front + 0.92), look: new THREE.Vector3(0, 1.04, front + 0.4) },
      notebook: { pos: new THREE.Vector3(1.05, 1.22, -0.05), look: new THREE.Vector3(1.33, 0.78, -0.05) },
    },
  };
}
