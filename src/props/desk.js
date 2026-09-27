import * as THREE from 'three';
import { std, box, cyl, canvasTex } from '../geom.js';
import { metal, photoSlot } from '../textures.js';
import { buildRadio } from './radio.js';
import { buildJar } from './jar.js';
import { buildNotebook, HAND } from './notebook.js';

// Металлический офисный стол с тумбой (по референсу), кресло и всё, что на столе.
// Стол развёрнут к комнате: его локальная +Z смотрит в мировую -X.

// фото со стола: положите файл в src/assets/photo.(jpg|png|webp) — подхватится само
const PHOTO_FILE = Object.values(import.meta.glob('../assets/photo.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }))[0];
const TOP = 0.794; // высота столешницы с сукном

function stickyTexture(code) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d6c24e'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,70,0,.18)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f1a3a'; g.font = `44px ${HAND}`; g.fillText('код:', 26, 66);
    g.font = `bold 84px ${HAND}`;
    code.split('').forEach((d, i) => g.fillText(d, 30 + i * 52, 168 + (i % 2) * 4));
    g.strokeStyle = '#1f1a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(26, 190); g.quadraticCurveTo(128, 200, 230, 186); g.stroke();
    g.font = `34px ${HAND}`; g.fillText('не забыть', 60, 236);
  });
}

export function buildDesk(scene, { code, eaten }) {
  const desk = new THREE.Group(); desk.position.set(3.85, 0, -1.4); desk.rotation.y = -Math.PI / 2; scene.add(desk);
  const hits = {}, anchors = {};
  const steel = std({ map: metal(1, '#8a8e92'), roughness: 0.45, metalness: 0.6 });
  const steelDark = std({ map: metal(2, '#55595d'), roughness: 0.55, metalness: 0.55 });
  const chrome = std({ color: 0xcfcfd4, roughness: 0.2, metalness: 0.9 });
  const rubber = std({ color: 0x111113 });

  // ---------- стол ----------
  box(2.9, 0.045, 1.15, steel, 0, 0.76, 0, desk);
  box(2.92, 0.03, 1.17, steelDark, 0, 0.73, 0, desk);
  box(2.86, 0.006, 1.11, std({ color: 0x33382f, roughness: 0.95 }), 0, TOP - 0.003, 0, desk); // зелёное сукно
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

  // ---------- блокнот (закрыт) ----------
  const notebook = buildNotebook();
  notebook.root.position.set(-0.46, TOP, 0.12); notebook.root.rotation.y = 0.12;
  desk.add(notebook.root);
  hits.notebook = notebook.hit; anchors.notebook = notebook.anchor;

  // ---------- фото в рамке ----------
  const ph = new THREE.Group(); ph.position.set(0.32, TOP + 0.2, -0.3); ph.rotation.set(-0.18, -0.15, 0); desk.add(ph);
  const wood = std({ color: 0x3a2c18, roughness: 0.7 });
  box(0.34, 0.42, 0.02, wood, 0, 0, 0, ph, 8);
  box(0.05, 0.1, 0.12, wood, 0, -0.18, -0.07, ph, 8);
  const photoMat = std({ map: photoSlot(), roughness: 0.6 });
  if (PHOTO_FILE) new THREE.TextureLoader().load(PHOTO_FILE, (t) => { t.colorSpace = THREE.SRGBColorSpace; photoMat.map = t; photoMat.needsUpdate = true; });
  const photoPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.35), photoMat);
  photoPlate.position.z = 0.011; ph.add(photoPlate);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.36), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.35, metalness: 0 }));
  glass.position.z = 0.013; ph.add(glass);
  hits.photo = photoPlate; anchors.photo = photoPlate;

  // ---------- рация ----------
  const radio = buildRadio();
  radio.root.position.set(0.64, TOP, 0.26); radio.root.rotation.y = -0.35; desk.add(radio.root);
  hits.radio = radio.hit; anchors.radio = radio.anchor;

  // ---------- банка РПК ----------
  const jar = buildJar(eaten);
  jar.root.position.set(-0.8, TOP, -0.05); jar.root.rotation.y = 0.9; desk.add(jar.root);
  hits.jar = jar.hit; anchors.jar = jar.anchor;

  // ---------- стикер с кодом ----------
  const noteGeo = new THREE.PlaneGeometry(0.076, 0.076, 6, 6);
  const np = noteGeo.attributes.position;
  for (let i = 0; i < np.count; i++) { const x = np.getX(i), y = np.getY(i); if (y < -0.02) np.setZ(i, Math.pow((-0.02 - y) / 0.018, 2) * 0.004 + Math.max(0, x) * 0.02); }
  noteGeo.computeVertexNormals();
  const noteMat = std({ map: stickyTexture(code), roughness: 0.85, side: THREE.DoubleSide });
  const note = new THREE.Mesh(noteGeo, noteMat);
  note.rotation.set(-Math.PI / 2, 0, 0.25); note.position.set(-0.1, TOP + 0.0012, 0.34); desk.add(note);
  // стикер маленький — зона нажатия заметно больше самого листка
  const noteHit = box(0.16, 0.03, 0.16, new THREE.MeshBasicMaterial({ visible: false }), -0.1, TOP + 0.01, 0.34, desk);
  hits.note = noteHit; anchors.note = note;

  // ---------- гарнитура: дуга, амбушюры, штанга микрофона, провод ----------
  const hs = new THREE.Group(); hs.position.set(0.2, TOP + 0.012, 0.3); hs.rotation.set(-Math.PI / 2 + 0.12, 0, 0.5); desk.add(hs);
  const hsMat = std({ color: 0x1a1a1c, roughness: 0.45, metalness: 0.3 });
  const padMat = std({ color: 0x0c0c0d, roughness: 0.95 });
  hs.add(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.009, 8, 32, Math.PI), hsMat));
  const bandPad = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.006, 6, 20, Math.PI * 0.5), padMat);
  bandPad.rotation.z = Math.PI * 0.25; hs.add(bandPad);
  for (const s of [-1, 1]) {
    cyl(0.042, 0.042, 0.032, hsMat, s * 0.095, -0.01, 0, hs, 20).rotation.z = Math.PI / 2;
    cyl(0.036, 0.04, 0.02, padMat, s * 0.07, -0.01, 0, hs, 20).rotation.z = Math.PI / 2;
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
  hits.headset = box(0.26, 0.2, 0.16, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.02, hs);
  anchors.headset = hs;

  // ---------- мелочи ----------
  const mugMat = std({ color: 0x2a1a1a, roughness: 0.4 });
  const mug = cyl(0.045, 0.04, 0.1, mugMat, -1.0, TOP + 0.05, -0.3, desk, 20);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12), mugMat); handle.position.x = 0.05; mug.add(handle);
  cyl(0.04, 0.04, 0.002, std({ color: 0x120804, roughness: 0.1 }), 0, 0.045, 0, mug, 16);
  const pencil = cyl(0.005, 0.005, 0.17, std({ color: 0x9a6622 }), -0.22, TOP + 0.005, 0.22, desk, 6);
  pencil.rotation.set(0, 0.9, Math.PI / 2);
  box(0.3, 0.004, 0.42, std({ color: 0xcfc2a6 }), -0.08, TOP + 0.002, -0.28, desk, 4).rotation.y = -0.4;
  box(0.3, 0.004, 0.42, std({ color: 0xd8cbb0 }), -0.04, TOP + 0.006, -0.26, desk, 4).rotation.y = -0.25;
  const torch = cyl(0.018, 0.02, 0.2, std({ color: 0x222226, metalness: 0.7, roughness: 0.4 }), 0.46, TOP + 0.02, 0.0, desk, 12);
  torch.rotation.set(0, 1.1, Math.PI / 2);
  const tray = cyl(0.06, 0.05, 0.02, std({ color: 0x55585c, metalness: 0.8, roughness: 0.3 }), 1.22, TOP + 0.01, -0.3, desk, 16);
  for (let i = 0; i < 3; i++) {
    const b = cyl(0.004, 0.004, 0.03, std({ color: 0xd8cfb8 }), (i - 1) * 0.015, 0.012, (i % 2) * 0.01, tray, 6);
    b.rotation.z = Math.PI / 2 - 0.2; b.rotation.y = i;
  }

  // ---------- кресло ----------
  const chair = new THREE.Group(); chair.position.set(2.85, 0, -2.85); chair.rotation.y = -Math.PI / 2 + 0.9; scene.add(chair);
  const seatMat = std({ color: 0x1b1b1d, roughness: 0.75 });
  for (let i = 0; i < 5; i++) {
    const leg = box(0.32, 0.03, 0.04, steelDark, 0, 0.07, 0, chair);
    leg.geometry.translate(0.16, 0, 0); leg.rotation.y = (i / 5) * Math.PI * 2;
    const wheel = cyl(0.025, 0.025, 0.025, rubber, Math.cos((i / 5) * Math.PI * 2) * 0.3, 0.025, -Math.sin((i / 5) * Math.PI * 2) * 0.3, chair, 10);
    wheel.rotation.x = Math.PI / 2;
  }
  cyl(0.025, 0.025, 0.34, chrome, 0, 0.26, 0, chair, 10);
  box(0.52, 0.09, 0.5, seatMat, 0, 0.47, 0, chair);
  box(0.48, 0.62, 0.07, seatMat, 0, 0.86, -0.26, chair).rotation.x = -0.12;
  box(0.06, 0.4, 0.04, steelDark, 0, 0.62, -0.25, chair);
  for (const s of [-1, 1]) {
    box(0.04, 0.2, 0.04, steelDark, s * 0.26, 0.6, 0, chair);
    box(0.06, 0.03, 0.3, seatMat, s * 0.26, 0.71, 0.02, chair);
  }
  box(0.5, 0.35, 0.03, std({ color: 0x2a3022, roughness: 1 }), 0, 0.9, -0.31, chair).rotation.x = -0.2;

  return {
    desk, hits, anchors, notebook, radio, jar,
    // рукописный шрифт грузится асинхронно — перерисовать надписи, когда он готов
    refreshFonts() { noteMat.map.dispose(); noteMat.map = stickyTexture(code); noteMat.needsUpdate = true; },
    update(dt, t) {
      notebook.update(dt); radio.update(dt, t); jar.update(dt);
      micLed.visible = Math.floor(t * 0.8) % 2 === 0;
    },
  };
}
