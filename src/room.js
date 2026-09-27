import * as THREE from 'three';
import { concrete, photo, metal, shadowGradient, plastic } from './textures.js';
import { std, box, cyl, canvasTex } from './geom.js';
import { buildAirlock } from './airlock.js';
import { buildDesk } from './props/desk.js';

// Комната: игрок сидит у терминала лицом к -Z.
// Прямо — терминал, справа (+X) — металлический стол с креслом, слева (-X) — бетонная стена с фото,
// сзади (+Z) — шлюз в тёмный коридор.
export const ROOM = { x0: -4.6, x1: 4.6, z0: -3.4, z1: 5.2, h: 3.6, doorW: 1.4, doorH: 2.4, corridorLen: 12 };

// UV по мировым координатам: соседние куски стены продолжают рисунок друг друга — без стыков
function worldUV(mesh, density) {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
  const n = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (Math.abs(n.y) > 0.9) uv.setXY(i, v.x * density, v.z * density);             // пол и потолок
    else if (Math.abs(n.x) > 0.9) uv.setXY(i, v.z * density * Math.sign(n.x), v.y * density);
    else uv.setXY(i, -v.x * density * Math.sign(n.z), v.y * density);
  }
  uv.needsUpdate = true;
}

export function buildRoom(scene, terminalTexture, save) {
  const { x0, x1, z0, z1, h, doorW, doorH, corridorLen } = ROOM;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hits = {}, anchors = {};

  // ---------- стены, пол, потолок ----------
  const wallMat = std({ map: concrete(11), color: 0x9a9a9a, roughness: 0.95 });
  const floorMat = std({ map: concrete(5), color: 0x707070, roughness: 0.7 });
  const ceilMat = std({ map: concrete(23), color: 0x3a3a3a });
  const plane = (w, hh, mat, x, y, z, rx, ry, density) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); scene.add(m);
    if (density) worldUV(m, density);
    return m;
  };
  const CD = 0.45; // плотность бетона: один тайл ≈ 2.2 м
  plane(W, D, floorMat, cx, 0, cz, -Math.PI / 2, 0, CD).receiveShadow = true;
  plane(W, D, ceilMat, cx, h, cz, Math.PI / 2, 0, CD);
  plane(W, h, wallMat, cx, h / 2, z0, 0, 0, CD).receiveShadow = true;
  plane(D, h, wallMat, x0, h / 2, cz, 0, Math.PI / 2, CD).receiveShadow = true;
  plane(D, h, wallMat, x1, h / 2, cz, 0, -Math.PI / 2, CD).receiveShadow = true;
  // задняя стена с проёмом под шлюз
  const side = (W - doorW) / 2;
  plane(side, h, wallMat, x0 + side / 2, h / 2, z1, 0, Math.PI, CD);
  plane(side, h, wallMat, x1 - side / 2, h / 2, z1, 0, Math.PI, CD);
  plane(doorW, h - doorH, wallMat, 0, doorH + (h - doorH) / 2, z1, 0, Math.PI, CD);

  // трубы под потолком и вентрешётка — чтобы пустые стены не были плоскими
  const pipeMat = std({ map: metal(7, '#3c4044'), roughness: 0.5, metalness: 0.6 });
  for (const [x, z, len, ry] of [[cx, z0 + 0.08, W, 0], [x0 + 0.08, cz, D, Math.PI / 2], [x1 - 0.08, cz, D, Math.PI / 2]]) {
    const p = cyl(0.06, 0.06, len, pipeMat, x, h - 0.25, z, scene, 10);
    p.rotation.set(0, ry, Math.PI / 2);
  }
  const vent = box(0.6, 0.35, 0.05, std({ map: metal(8, '#2c2f33'), metalness: 0.5, roughness: 0.6 }), -2.2, h - 0.5, z0 + 0.03, scene);
  for (let i = 0; i < 6; i++) box(0.56, 0.02, 0.03, std({ color: 0x111111 }), 0, -0.14 + i * 0.056, 0.03, vent);

  // ---------- глубокие тени по углам ----------
  const shade = (tex, opacity) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, color: 0x000000 });
  const cornerMat = shade(shadowGradient(true), 0.95), floorEdge = shade(shadowGradient(false), 0.8);
  for (const [x, z, dz] of [[x0, z0, 1], [x1, z0, 1], [x0, z1, -1], [x1, z1, -1]]) {
    const a = plane(1.8, h, cornerMat, x + (x < 0 ? 0.9 : -0.9), h / 2, z + dz * 0.01, 0, dz > 0 ? 0 : Math.PI);
    if ((x > 0) !== (dz < 0)) a.scale.x = -1;
    const b = plane(1.8, h, cornerMat, x + (x < 0 ? 0.01 : -0.01), h / 2, z + dz * 0.9, 0, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    if ((x < 0) === (dz > 0)) b.scale.x = -1;
  }
  for (const [x, z, ry, len] of [[cx, z0 + 0.01, 0, W], [x0 + 0.01, cz, Math.PI / 2, D], [x1 - 0.01, cz, -Math.PI / 2, D], [cx, z1 - 0.01, Math.PI, W]]) {
    plane(len, 0.7, floorEdge, x, 0.35, z, 0, ry);
    plane(len, 0.9, floorEdge, x, h - 0.45, z, 0, ry).scale.y = -1;
  }

  // ---------- терминал (прямо) ----------
  const deskMat = std({ map: metal(4, '#3a3c3f'), roughness: 0.55, metalness: 0.55 });
  const plasticMat = std({ map: plastic(9, '#3b3934'), roughness: 0.7 });
  const tz = z0 + 0.55;
  box(1.5, 0.05, 0.8, deskMat, 0, 0.74, tz, scene);
  for (const x of [-0.7, 0.7]) box(0.05, 0.74, 0.7, deskMat, x, 0.37, tz, scene);
  const crt = new THREE.Group();
  box(0.66, 0.54, 0.55, plasticMat, 0, 0, -0.05, crt, 6);
  box(0.46, 0.4, 0.25, plasticMat, 0, 0, -0.42, crt, 6);
  box(0.58, 0.46, 0.02, std({ color: 0x0c0c0c, roughness: 0.9 }), 0, 0, 0.23, crt);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.39), new THREE.MeshBasicMaterial({ map: terminalTexture, toneMapped: false }));
  screen.position.z = 0.241; crt.add(screen);
  // инвентарный номер на корпусе — первая часть кода
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.035), std({
    map: canvasTex(256, 44, (c, w, hh) => {
      c.fillStyle = '#c8c2b0'; c.fillRect(0, 0, w, hh); c.strokeStyle = '#555'; c.strokeRect(2, 2, w - 4, hh - 4);
      c.fillStyle = '#222'; c.font = 'bold 22px "PT Mono", monospace'; c.fillText(`OBJ-4471 · ${save.monitorCode}`, 12, 30);
    }), roughness: 0.6 }));
  tag.position.set(0.16, 0.25, 0.232); crt.add(tag);
  crt.position.set(0, 1.04, z0 + 0.42); scene.add(crt);
  box(0.5, 0.03, 0.17, plasticMat, 0, 0.78, z0 + 0.82, scene, 6).rotation.x = 0.08;
  hits.screen = screen;
  const screenLight = new THREE.PointLight(0xff2a2a, 0.6, 2.5, 2);
  screenLight.position.set(0, 1.04, z0 + 0.9); scene.add(screenLight);

  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff1030, toneMapped: false });
  const neon = cyl(0.018, 0.018, 1.6, neonMat, 0, 2.15, z0 + 0.06, scene, 10);
  neon.rotation.z = Math.PI / 2;
  const neonLight = new THREE.PointLight(0xff0a28, 3, 6.5, 1.4);
  neonLight.position.set(0, 2.1, z0 + 0.3); scene.add(neonLight);

  // ---------- подвесные лампы ----------
  const lampMat = std({ color: 0x2d3a33, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide });
  function pendant(x, z, color, power, len = 1.1, target) {
    cyl(0.006, 0.006, len, std({ color: 0x0b0b0c }), x, h - len / 2, z, scene, 6);
    const shadeM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.3, 0.24, 24, 1, true), lampMat);
    shadeM.position.set(x, h - len - 0.1, z); scene.add(shadeM);
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

  // ---------- стол, кресло и предметы (справа) ----------
  const desk = buildDesk(scene, save);
  Object.assign(hits, desk.hits); Object.assign(anchors, desk.anchors);

  // ---------- шлюз (сзади) ----------
  const airlock = buildAirlock(scene, { z: z1, w: doorW, h: doorH });
  hits.door = airlock.hit;

  // ---------- коридор за шлюзом ----------
  const corrMat = std({ map: concrete(31), color: 0x505050 });
  const czc = z1 + 0.25 + corridorLen / 2;
  plane(doorW, corridorLen, corrMat, 0, 0, czc, -Math.PI / 2, 0, CD);
  plane(doorW, corridorLen, corrMat, 0, doorH, czc, Math.PI / 2, 0, CD);
  for (const s of [-1, 1]) plane(corridorLen, doorH, corrMat, s * doorW / 2, doorH / 2, czc, 0, -s * Math.PI / 2, CD);
  const emerg = new THREE.PointLight(0xff1a1a, 2, 5, 1.5);
  emerg.position.set(0, doorH - 0.15, z1 + 5); scene.add(emerg);
  const emergBulb = box(0.12, 0.05, 0.12, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, doorH - 0.05, z1 + 5, scene);

  // корабельный плафон над шлюзом и холодный свет с потолка на створки
  const bulk = box(0.4, 0.12, 0.14, std({ map: metal(14, '#2a2d30'), metalness: 0.6, roughness: 0.5 }), 0, doorH + 0.75, z1 - 0.08, scene);
  box(0.32, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0xcfe0ff, toneMapped: false }), 0, -0.04, -0.07, bulk);
  const doorLight = new THREE.SpotLight(0xbcd0ff, 14, 8, 0.6, 0.8, 1.2);
  doorLight.position.set(0, h - 0.05, z1 - 2.2); doorLight.target.position.set(0, 1.1, z1);
  doorLight.castShadow = true; doorLight.shadow.mapSize.set(1024, 1024); doorLight.shadow.bias = -0.0008; doorLight.shadow.normalBias = 0.03;
  scene.add(doorLight, doorLight.target);

  scene.add(new THREE.HemisphereLight(0x243048, 0x100a0a, 2.0));

  // тени отбрасывают и принимают все обычные непрозрачные объекты
  scene.traverse((o) => {
    if (o.isMesh && !Array.isArray(o.material) && o.material?.isMeshStandardMaterial && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; }
  });

  return { screen, hits, anchors, desk, neon, neonLight, neonMat, emerg, emergBulb, screenLight, airlock, deskLamp, wallLamp };
}

