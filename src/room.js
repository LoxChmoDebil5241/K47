import * as THREE from 'three';
import { concrete, notebookPage, photo, metal, photoSlot, stickyNote, shadowGradient } from './textures.js';
import { buildAirlock } from './airlock.js';

// Комната: игрок сидит у терминала лицом к -Z.
// Прямо — терминал, справа (+X) — металлический стол с креслом, слева (-X) — бетонная стена с фото,
// сзади (+Z) — шлюз в тёмный коридор.
export const ROOM = { x0: -4.6, x1: 4.6, z0: -3.4, z1: 5.2, h: 3.6, doorW: 1.4, doorH: 2.4, corridorLen: 12 };

// фото со стола: положите файл в src/assets/photo.(jpg|png|webp) — подхватится само
const PHOTO_FILE = Object.values(import.meta.glob('./assets/photo.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }))[0];

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
function box(w, h, d, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); parent?.add(m); return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z); parent?.add(m); return m;
}

export function buildRoom(scene, terminalTexture) {
  const { x0, x1, z0, z1, h, doorW, doorH, corridorLen } = ROOM;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hits = {};   // объекты, на которые можно нажать

  // ---------- стены, пол, потолок ----------
  const wallTex = concrete(11, 1); wallTex.repeat.set(3, 1.2);
  const wallMat = std({ map: wallTex, color: 0x9a9a9a, roughness: 0.95 });
  const floorTex = concrete(5, 1); floorTex.repeat.set(4, 4);
  const floorMat = std({ map: floorTex, color: 0x707070, roughness: 0.7 });
  const ceilMat = std({ map: concrete(23, 3), color: 0x3a3a3a });

  const plane = (w, hh, mat, x, y, z, rx, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); scene.add(m); return m;
  };
  plane(W, D, floorMat, cx, 0, cz, -Math.PI / 2, 0).receiveShadow = true;
  plane(W, D, ceilMat, cx, h, cz, Math.PI / 2, 0);
  plane(W, h, wallMat, cx, h / 2, z0, 0, 0).receiveShadow = true;
  plane(D, h, wallMat, x0, h / 2, cz, 0, Math.PI / 2).receiveShadow = true;
  plane(D, h, wallMat, x1, h / 2, cz, 0, -Math.PI / 2).receiveShadow = true;
  // задняя стена с проёмом под шлюз
  const side = (W - doorW) / 2;
  plane(side, h, wallMat, x0 + side / 2, h / 2, z1, 0, Math.PI);
  plane(side, h, wallMat, x1 - side / 2, h / 2, z1, 0, Math.PI);
  plane(doorW, h - doorH, wallMat, 0, doorH + (h - doorH) / 2, z1, 0, Math.PI);

  // плинтус-желоб и труба вдоль стен — чтобы пустые стены не были плоскими
  const pipeMat = std({ map: metal(7, '#3c4044'), roughness: 0.5, metalness: 0.6 });
  for (const [x, z, len, ry] of [[cx, z0 + 0.08, W, 0], [x0 + 0.08, cz, D, Math.PI / 2], [x1 - 0.08, cz, D, Math.PI / 2]]) {
    const p = cyl(0.06, 0.06, len, pipeMat, x, h - 0.25, z, scene, 10);
    p.rotation.set(0, ry, Math.PI / 2);
  }
  const vent = box(0.6, 0.35, 0.05, std({ map: metal(8, '#2c2f33'), metalness: 0.5, roughness: 0.6 }), -2.2, h - 0.5, z0 + 0.03, scene);
  for (let i = 0; i < 6; i++) box(0.56, 0.02, 0.03, std({ color: 0x111111 }), 0, -0.14 + i * 0.056, 0.03, vent);

  // ---------- глубокие тени по углам ----------
  const shH = shadowGradient(true), shV = shadowGradient(false);
  const shade = (tex, opacity) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, color: 0x000000 });
  const cornerMat = shade(shH, 0.95), floorEdge = shade(shV, 0.8);
  const corners = [[x0, z0, 0, 1], [x1, z0, Math.PI, 1], [x0, z1, 0, -1], [x1, z1, Math.PI, -1]];
  for (const [x, z, ry, dz] of corners) {
    // по две полосы в каждом углу — на каждую из сходящихся стен
    const a = plane(1.8, h, cornerMat, x + (x < 0 ? 0.9 : -0.9), h / 2, z + dz * 0.01, 0, dz > 0 ? 0 : Math.PI);
    if ((x > 0) !== (dz < 0)) a.scale.x = -1;
    const b = plane(1.8, h, cornerMat, x + (x < 0 ? 0.01 : -0.01), h / 2, z + dz * 0.9, 0, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    if ((x < 0) === (dz > 0)) b.scale.x = -1;
  }
  // затемнение вдоль пола и потолка у стен
  for (const [x, z, ry, len] of [[cx, z0 + 0.01, 0, W], [x0 + 0.01, cz, Math.PI / 2, D], [x1 - 0.01, cz, -Math.PI / 2, D], [cx, z1 - 0.01, Math.PI, W]]) {
    plane(len, 0.7, floorEdge, x, 0.35, z, 0, ry);
    const top = plane(len, 0.9, floorEdge, x, h - 0.45, z, 0, ry); top.scale.y = -1;
  }

  // ---------- терминал (прямо) ----------
  const deskMat = std({ map: metal(4, '#3a3c3f'), roughness: 0.55, metalness: 0.55 });
  const plasticMat = std({ color: 0x3b3934, roughness: 0.7 });
  const tz = z0 + 0.55;
  box(1.5, 0.05, 0.8, deskMat, 0, 0.74, tz, scene);
  for (const x of [-0.7, 0.7]) box(0.05, 0.74, 0.7, deskMat, x, 0.37, tz, scene);
  const crt = new THREE.Group();
  box(0.66, 0.54, 0.55, plasticMat, 0, 0, -0.05, crt);
  box(0.46, 0.4, 0.25, plasticMat, 0, 0, -0.42, crt);
  box(0.58, 0.46, 0.02, std({ color: 0x0c0c0c, roughness: 0.9 }), 0, 0, 0.23, crt);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.39), new THREE.MeshBasicMaterial({ map: terminalTexture, toneMapped: false }));
  screen.position.z = 0.241; crt.add(screen);
  crt.position.set(0, 1.04, z0 + 0.42); scene.add(crt);
  const kb = box(0.5, 0.03, 0.17, plasticMat, 0, 0.78, z0 + 0.82, scene); kb.rotation.x = 0.08;
  hits.screen = screen;
  const screenLight = new THREE.PointLight(0xff2a2a, 0.6, 2.5, 2);
  screenLight.position.set(0, 1.04, z0 + 0.9); scene.add(screenLight);

  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff1030, toneMapped: false });
  const neon = cyl(0.018, 0.018, 1.6, neonMat, 0, 2.15, z0 + 0.06, scene, 10);
  neon.rotation.z = Math.PI / 2;
  const neonLight = new THREE.PointLight(0xff0a28, 3, 9, 1.4);
  neonLight.position.set(0, 2.1, z0 + 0.3); scene.add(neonLight);

  // ---------- подвесные лампы ----------
  const lampMat = std({ color: 0x2d3a33, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide });
  function pendant(x, z, color, power, len = 1.1, target) {
    cyl(0.006, 0.006, len, std({ color: 0x0b0b0c }), x, h - len / 2, z, scene, 6);
    const shadeM = cyl(0.07, 0.3, 0.24, lampMat, x, h - len - 0.1, z, scene, 24);
    shadeM.geometry = new THREE.CylinderGeometry(0.07, 0.3, 0.24, 24, 1, true);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    bulb.position.set(x, h - len - 0.17, z); scene.add(bulb);
    const spot = new THREE.SpotLight(color, power, 7, 0.85, 0.6, 1.3);
    spot.position.set(x, h - len - 0.18, z); spot.target.position.copy(target || new THREE.Vector3(x, 0, z));
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0008; spot.shadow.normalBias = 0.03;
    scene.add(spot, spot.target);
    return { spot, bulb };
  }
  const deskLamp = pendant(3.4, -1.4, 0xb8c8ff, 9);
  const wallLamp = pendant(x0 + 1.1, -1.2, 0xffc890, 3.5, 1.2, new THREE.Vector3(x0, 1.2, -1.2));

  // ---------- стена с фотографиями (слева) ----------
  const board = new THREE.Group(); board.position.set(x0 + 0.01, 1.7, -1.2); board.rotation.y = Math.PI / 2; scene.add(board);
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false });
  const layout = [[-0.7, 0.3, -0.05], [-0.2, 0.42, 0.06], [0.3, 0.25, -0.1], [0.75, 0.38, 0.04], [-0.45, -0.1, 0.08], [0.05, -0.05, -0.03], [0.55, -0.12, 0.1]];
  const pins = [];
  layout.forEach(([x, y, rot], i) => {
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), std({ map: photo(100 + i * 7), roughness: 0.8 }));
    ph.position.set(x, y, 0.004 + i * 0.0005); ph.rotation.z = rot; board.add(ph);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pinMat);
    pin.position.set(x, y + 0.125, 0.018); board.add(pin); pins.push(pin.position);
  });
  board.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pins[0], pins[1], pins[5], pins[2], pins[3], pins[6], pins[5], pins[4]]),
    new THREE.LineBasicMaterial({ color: 0xaa1020 })));

  // ---------- металлический стол из референса (справа) ----------
  const desk = new THREE.Group(); desk.position.set(3.85, 0, -1.4); desk.rotation.y = -Math.PI / 2; scene.add(desk);
  const steel = std({ map: metal(1, '#8a8e92'), roughness: 0.45, metalness: 0.6 });
  const steelDark = std({ map: metal(2, '#55595d'), roughness: 0.55, metalness: 0.55 });
  const chrome = std({ color: 0xcfcfd4, roughness: 0.2, metalness: 0.9 });
  const rubber = std({ color: 0x111113 });
  box(2.9, 0.045, 1.15, steel, 0, 0.76, 0, desk);
  box(2.92, 0.03, 1.17, steelDark, 0, 0.73, 0, desk);
  box(2.9, 0.012, 1.15, std({ color: 0x3b3f36, roughness: 0.9 }), 0, 0.788, 0, desk); // сукно
  for (const z of [-0.52, 0.52]) box(0.05, 0.72, 0.05, steelDark, -1.4, 0.36, z, desk);
  box(0.05, 0.05, 1.05, steelDark, -1.4, 0.06, 0, desk);
  box(2.3, 0.5, 0.02, steelDark, -0.25, 0.46, -0.55, desk);
  const ped = new THREE.Group(); ped.position.set(1.05, 0, 0.02); desk.add(ped);
  box(0.72, 0.72, 1.08, steelDark, 0, 0.36, 0, ped);
  [0.58, 0.36, 0.14].forEach((y) => {
    box(0.68, 0.2, 0.02, steel, 0, y, 0.55, ped);
    box(0.24, 0.022, 0.03, chrome, 0, y + 0.03, 0.575, ped);
  });
  box(0.72, 0.03, 1.08, rubber, 0, 0.015, 0, ped);

  // блокнот в кожаной обложке
  const nb = new THREE.Group(); nb.position.set(-0.75, 0.795, 0.12); nb.rotation.y = 0.28; desk.add(nb);
  const leather = std({ color: 0x5a1e10, roughness: 0.7 });
  box(0.5, 0.025, 0.68, leather, 0, 0.012, 0, nb);
  box(0.47, 0.06, 0.65, std({ color: 0xd8cbb0 }), 0, 0.055, 0, nb);
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.64), std({
    map: notebookPage(['Цикл 48.', '', 'Холодно. Пальцы', 'не слушаются.', '', 'Терминал включается', 'сам. Каждый раз.', '', 'Не открывать', 'шлюз.']),
    roughness: 0.9,
  }));
  page.rotation.x = -Math.PI / 2; page.position.y = 0.086; nb.add(page);
  hits.notebook = page;

  // фото в рамке — плашка под фото пользователя
  const ph = new THREE.Group(); ph.position.set(0.4, 0.99, -0.25); ph.rotation.set(-0.18, -0.15, 0); desk.add(ph);
  const wood = std({ color: 0x3a2c18, roughness: 0.7 });
  box(0.34, 0.42, 0.02, wood, 0, 0, 0, ph);
  box(0.05, 0.1, 0.12, wood, 0, -0.18, -0.07, ph);
  const photoMat = std({ map: photoSlot(), roughness: 0.6 });
  if (PHOTO_FILE) new THREE.TextureLoader().load(PHOTO_FILE, (t) => { t.colorSpace = THREE.SRGBColorSpace; photoMat.map = t; photoMat.needsUpdate = true; });
  const photoPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.35), photoMat);
  photoPlate.position.z = 0.011; ph.add(photoPlate);
  hits.photo = photoPlate;

  // рация
  const radio = new THREE.Group(); radio.position.set(0.95, 0.95, 0.35); radio.rotation.y = -0.55; desk.add(radio);
  const radioMat = std({ color: 0x141418, roughness: 0.5 });
  box(0.16, 0.32, 0.1, radioMat, 0, 0, 0, radio);
  box(0.17, 0.04, 0.11, rubber, 0, -0.17, 0, radio);
  box(0.1, 0.06, 0.002, new THREE.MeshBasicMaterial({ color: 0x1a7a40 }), 0, 0.08, 0.051, radio);
  for (let i = 0; i < 6; i++) box(0.1, 0.006, 0.004, rubber, 0, -0.015 - i * 0.015, 0.052, radio);
  cyl(0.0035, 0.005, 0.3, radioMat, 0.04, 0.3, 0, radio, 8);
  const radioLed = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
  radioLed.position.set(0.05, 0.135, 0.052); radio.add(radioLed);

  // гарнитура: дуга, два амбушюра, штанга микрофона, провод
  const hs = new THREE.Group(); hs.position.set(-0.15, 0.805, 0.2); hs.rotation.set(-Math.PI / 2 + 0.12, 0, 0.5); desk.add(hs);
  const hsMat = std({ color: 0x1a1a1c, roughness: 0.45, metalness: 0.3 });
  const padMat = std({ color: 0x0c0c0d, roughness: 0.95 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.009, 8, 32, Math.PI), hsMat); hs.add(band);
  const bandPad = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.006, 6, 20, Math.PI * 0.5), padMat);
  bandPad.rotation.z = Math.PI * 0.25; hs.add(bandPad);
  for (const s of [-1, 1]) {
    const cup = cyl(0.042, 0.042, 0.032, hsMat, s * 0.095, -0.01, 0, hs, 20); cup.rotation.z = Math.PI / 2;
    const cush = cyl(0.036, 0.04, 0.02, padMat, s * 0.07, -0.01, 0, hs, 20); cush.rotation.z = Math.PI / 2;
    box(0.012, 0.03, 0.02, hsMat, s * 0.094, 0.025, 0, hs);
  }
  const boom = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.11, -0.02, 0.01), new THREE.Vector3(-0.1, -0.07, 0.05), new THREE.Vector3(-0.07, -0.1, 0.09)]);
  hs.add(new THREE.Mesh(new THREE.TubeGeometry(boom, 12, 0.004, 6), hsMat));
  const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.018, 4, 8), padMat); mic.position.set(-0.07, -0.1, 0.092); mic.rotation.x = 1.2; hs.add(mic);
  const micLed = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6), new THREE.MeshBasicMaterial({ color: 0x33ff66, toneMapped: false }));
  micLed.position.set(-0.11, -0.03, 0.03); hs.add(micLed);
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.11, -0.03, 0), new THREE.Vector3(0.2, -0.05, 0.05), new THREE.Vector3(0.3, 0.05, 0.1),
    new THREE.Vector3(0.45, 0.15, 0.05), new THREE.Vector3(0.6, 0.35, 0.02),
  ]);
  hs.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 40, 0.003, 5), padMat));
  const hsHit = box(0.26, 0.2, 0.16, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.02, hs);
  hits.headset = hsHit;

  // мелочи: кружка, карандаш, бумаги, стикер, таблетки, фонарик, окурки
  const mug = cyl(0.045, 0.04, 0.1, std({ color: 0x2a1a1a, roughness: 0.4 }), -1.1, 0.845, 0.4, desk, 20);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12), mug.material);
  handle.position.set(0.05, 0, 0); mug.add(handle);
  cyl(0.04, 0.04, 0.002, std({ color: 0x120804, roughness: 0.1 }), 0, 0.045, 0, mug, 16); // остывший кофе
  const pencil = cyl(0.005, 0.005, 0.17, std({ color: 0x9a6622 }), 0.2, 0.8, 0.42, desk, 6);
  pencil.rotation.set(0, 0.9, Math.PI / 2);
  const papers = box(0.3, 0.012, 0.42, std({ color: 0xcfc2a6 }), -0.15, 0.8, -0.22, desk); papers.rotation.y = -0.4;
  const papers2 = box(0.3, 0.01, 0.42, std({ color: 0xd8cbb0 }), -0.1, 0.812, -0.2, desk); papers2.rotation.y = -0.25;
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), std({ map: stickyNote(['4-4-7', 'не спать']) }));
  note.rotation.set(-Math.PI / 2, 0, 0.3); note.position.set(0.28, 0.796, 0.05); desk.add(note);
  const bottle = cyl(0.022, 0.022, 0.07, std({ color: 0xb0561a, roughness: 0.2, transparent: true, opacity: 0.85 }), -1.25, 0.83, 0.15, desk, 12);
  cyl(0.024, 0.024, 0.02, std({ color: 0xeeeeee }), 0, 0.044, 0, bottle, 12);
  const torch = cyl(0.018, 0.02, 0.2, std({ color: 0x222226, metalness: 0.7, roughness: 0.4 }), 0.55, 0.815, 0.25, desk, 12);
  torch.rotation.set(0, 0, Math.PI / 2); torch.rotation.y = 1.1;
  const tray = cyl(0.06, 0.05, 0.02, std({ color: 0x55585c, metalness: 0.8, roughness: 0.3 }), -1.2, 0.8, -0.3, desk, 16);
  for (let i = 0; i < 3; i++) {
    const b = cyl(0.004, 0.004, 0.03, std({ color: 0xd8cfb8 }), (i - 1) * 0.015, 0.012, (i % 2) * 0.01, tray, 6);
    b.rotation.z = Math.PI / 2 - 0.2; b.rotation.y = i;
  }

  // ---------- кресло у стола ----------
  const chair = new THREE.Group(); chair.position.set(2.75, 0, -1.25); chair.rotation.y = -Math.PI / 2 + 0.35; scene.add(chair);
  const seatMat = std({ color: 0x1b1b1d, roughness: 0.75 });
  for (let i = 0; i < 5; i++) {
    const leg = box(0.32, 0.03, 0.04, steelDark, 0, 0.07, 0, chair);
    leg.geometry.translate(0.16, 0, 0); leg.rotation.y = (i / 5) * Math.PI * 2;
    const wheel = cyl(0.025, 0.025, 0.025, rubber, Math.cos((i / 5) * Math.PI * 2) * 0.3, 0.025, -Math.sin((i / 5) * Math.PI * 2) * 0.3, chair, 10);
    wheel.rotation.x = Math.PI / 2;
  }
  cyl(0.025, 0.025, 0.34, chrome, 0, 0.26, 0, chair, 10);
  box(0.52, 0.09, 0.5, seatMat, 0, 0.47, 0, chair);
  const back = box(0.48, 0.62, 0.07, seatMat, 0, 0.86, -0.26, chair); back.rotation.x = -0.12;
  box(0.06, 0.4, 0.04, steelDark, 0, 0.62, -0.25, chair);
  for (const s of [-1, 1]) {
    box(0.04, 0.2, 0.04, steelDark, s * 0.26, 0.6, 0, chair);
    box(0.06, 0.03, 0.3, seatMat, s * 0.26, 0.71, 0.02, chair);
  }
  // куртка, брошенная на спинку
  const jacket = box(0.5, 0.35, 0.03, std({ color: 0x2a3022, roughness: 1 }), 0, 0.9, -0.31, chair); jacket.rotation.x = -0.2;

  // ---------- шлюз (сзади) ----------
  const airlock = buildAirlock(scene, { z: z1, w: doorW, h: doorH, wallMat });
  hits.door = airlock.hit;

  // ---------- коридор за шлюзом ----------
  const corrMat = std({ map: concrete(31, 1), color: 0x505050 });
  const czc = z1 + corridorLen / 2 + 0.2;
  plane(doorW, corridorLen, corrMat, 0, 0, czc, -Math.PI / 2, 0);
  plane(doorW, corridorLen, corrMat, 0, doorH, czc, Math.PI / 2, 0);
  for (const s of [-1, 1]) plane(corridorLen, doorH, corrMat, s * doorW / 2, doorH / 2, czc, 0, -s * Math.PI / 2);
  const emerg = new THREE.PointLight(0xff1a1a, 2, 5, 1.5);
  emerg.position.set(0, doorH - 0.15, z1 + 5); scene.add(emerg);
  const emergBulb = box(0.12, 0.05, 0.12, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, doorH - 0.05, z1 + 5, scene);

  // корабельный плафон над шлюзом
  const bulk = box(0.4, 0.12, 0.14, std({ map: metal(14, '#2a2d30'), metalness: 0.6, roughness: 0.5 }), 0, doorH + 0.75, z1 - 0.08, scene);
  box(0.32, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0xcfe0ff, toneMapped: false }), 0, -0.04, -0.07, bulk);
  // холодный свет с потолка на створки
  const doorLight = new THREE.SpotLight(0xbcd0ff, 14, 8, 0.6, 0.8, 1.2);
  doorLight.position.set(0, h - 0.05, z1 - 2.2); doorLight.target.position.set(0, 1.1, z1);
  doorLight.castShadow = true; doorLight.shadow.mapSize.set(1024, 1024); doorLight.shadow.bias = -0.0008; doorLight.shadow.normalBias = 0.03;
  scene.add(doorLight, doorLight.target);

  scene.add(new THREE.HemisphereLight(0x243048, 0x100a0a, 2.0));

  // тени отбрасывают и принимают все обычные объекты
  scene.traverse((o) => {
    if (o.isMesh && o.material?.isMeshStandardMaterial && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; }
  });

  return { screen, hits, neon, neonLight, neonMat, emerg, emergBulb, screenLight, airlock, radioLed, micLed, deskLamp, wallLamp };
}
