import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { std, canvasTex } from '../geom.js';
import { plastic } from '../textures.js';

// Портативная рация: корпус с аккумулятором и клипсой, антенна-«резинка» с кольцами,
// рифлёные ручки каналов и громкости, ЖК-экран, клавиатура 4×3, решётка динамика, тангента сбоку.
const W = 0.064, H = 0.135, D = 0.036;

// рифлёная ручка: цилиндр, у которого каждая вторая грань выдавлена наружу
function knurledKnob(r, h, mat) {
  const geo = new THREE.CylinderGeometry(r, r, h, 36, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (rr < r * 0.5) continue;
    const k = (Math.round((a / (Math.PI * 2)) * 36) % 2 === 0) ? 1.08 : 0.96;
    pos.setX(i, Math.cos(a) * r * k); pos.setZ(i, Math.sin(a) * r * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function lcdTexture(lines) {
  return canvasTex(256, 112, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#9fb86a'); bg.addColorStop(1, '#7d9650');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,30,10,.9)';
    g.font = 'bold 22px "PT Mono", monospace'; g.fillText(lines[0], 12, 30);
    g.font = 'bold 40px "PT Mono", monospace'; g.fillText(lines[1], 12, 76);
    g.font = '18px "PT Mono", monospace'; g.fillText(lines[2], 12, 102);
    // уровень сигнала и батареи
    for (let i = 0; i < 4; i++) { g.globalAlpha = i < (lines[3] ?? 1) ? 0.9 : 0.15; g.fillRect(190 + i * 12, 30 - i * 6, 8, 6 + i * 6); }
    g.globalAlpha = 0.9; g.strokeStyle = 'rgba(20,30,10,.9)'; g.lineWidth = 2; g.strokeRect(196, 80, 44, 18); g.fillRect(240, 85, 4, 8); g.fillRect(199, 83, 26, 12);
  });
}

function keyLabel(text) {
  return canvasTex(64, 40, (g, w, h) => {
    g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#cfd2d6'; g.font = 'bold 24px "PT Mono", monospace'; g.textAlign = 'center';
    g.fillText(text, w / 2, 29);
  });
}

export function buildRadio() {
  const root = new THREE.Group();
  const bodyMat = std({ map: plastic(31, '#1c1d1f'), roughness: 0.55 });
  const rubber = std({ color: 0x0f0f10, roughness: 0.95 });
  const metalMat = std({ color: 0x8a8d91, roughness: 0.35, metalness: 0.9 });

  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.007), bodyMat);
  body.position.y = H / 2; root.add(body);
  // аккумулятор сзади и клипса
  const batt = new THREE.Mesh(new RoundedBoxGeometry(W - 0.004, H * 0.66, 0.012, 3, 0.004), std({ map: plastic(32, '#2a2b2e'), roughness: 0.7 }));
  batt.position.set(0, H * 0.36, -D / 2 - 0.004); root.add(batt);
  const clip = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.07, 0.004, 2, 0.0015), rubber);
  clip.position.set(0, H * 0.5, -D / 2 - 0.013); root.add(clip);

  // лицевая панель: решётка динамика
  const grille = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#18191b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#050505';
    for (let y = 8; y < h; y += 11) for (let x = 8 + ((y / 11) % 2) * 5; x < w; x += 11) { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
  });
  const spk = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.78, H * 0.26), std({ map: grille, roughness: 0.8 }));
  spk.position.set(0, H * 0.8, D / 2 + 0.0005); root.add(spk);

  // ЖК-экран
  const lcdMat = new THREE.MeshStandardMaterial({ map: lcdTexture(['CH 04', '147.450', 'ВЕКТОР', 1]), emissive: 0x3a5020, emissiveIntensity: 0.6, roughness: 0.3 });
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.72, W * 0.32), lcdMat);
  lcd.position.set(0, H * 0.555, D / 2 + 0.0008); root.add(lcd);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(W * 0.8, W * 0.4, 0.002, 2, 0.001), rubber);
  bezel.position.set(0, H * 0.555, D / 2 - 0.0002); root.add(bezel);

  // клавиатура 4×3
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const keyGeo = new RoundedBoxGeometry(0.014, 0.0085, 0.004, 2, 0.0015);
  keys.forEach((k, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const key = new THREE.Mesh(keyGeo, [rubber, rubber, rubber, rubber, std({ map: keyLabel(k), roughness: 0.8 }), rubber]);
    key.position.set((col - 1) * 0.018, H * 0.42 - row * 0.0115, D / 2 + 0.0015);
    root.add(key);
  });
  // микрофон и надпись
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.002, 10), std({ color: 0x000000 }));
  mic.rotation.x = Math.PI / 2; mic.position.set(0, H * 0.08, D / 2 + 0.0005); root.add(mic);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, 0.008), std({
    map: canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#1c1d1f'; g.fillRect(0, 0, w, h); g.fillStyle = '#9ea3a8'; g.font = 'bold 20px "PT Mono", monospace'; g.textAlign = 'center'; g.fillText('ВЕКТОР · Р-47', w / 2, 23); }),
  }));
  brand.position.set(0, H * 0.15, D / 2 + 0.0005); root.add(brand);

  // верх: антенна, ручки, светодиод
  const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.014, 16), metalMat);
  antBase.position.set(-0.017, H + 0.007, 0); root.add(antBase);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0058, 0.11, 14), rubber);
  ant.position.set(-0.017, H + 0.014 + 0.055, 0); root.add(ant);
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0056 - i * 0.00025, 0.0009, 6, 16), rubber);
    ring.rotation.x = Math.PI / 2; ring.position.set(-0.017, H + 0.024 + i * 0.012, 0); root.add(ring);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 8), rubber);
  tip.position.set(-0.017, H + 0.124, 0); root.add(tip);
  const knob1 = knurledKnob(0.0075, 0.014, rubber); knob1.position.set(0.004, H + 0.007, 0); root.add(knob1);
  const knob2 = knurledKnob(0.0065, 0.012, rubber); knob2.position.set(0.02, H + 0.006, 0.004); root.add(knob2);
  for (const k of [knob1, knob2]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.001, 12), metalMat);
    cap.position.y = 0.0075; k.add(cap);
  }
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 10, 8), ledMat);
  led.position.set(0.02, H + 0.001, -0.009); root.add(led);

  // бок: тангента и две кнопки
  const ptt = new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.034, 0.02, 2, 0.0025), rubber);
  ptt.position.set(-W / 2 - 0.002, H * 0.62, 0); root.add(ptt);
  for (const y of [0.4, 0.33]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.009, 0.012, 2, 0.0015), rubber);
    b.position.set(-W / 2 - 0.001, H * y, 0); root.add(b);
  }
  // гнездо гарнитуры под резиновой заглушкой
  const jack = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.03, 0.016, 2, 0.0015), rubber);
  jack.position.set(W / 2 + 0.001, H * 0.6, 0); root.add(jack);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const hit = new THREE.Mesh(new THREE.BoxGeometry(W * 1.8, H + 0.13, D * 2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (H + 0.13) / 2; root.add(hit);

  const setLcd = (lines) => { lcdMat.map.dispose(); lcdMat.map = lcdTexture(lines); lcdMat.needsUpdate = true; };
  let talking = 0;
  return {
    root, hit, anchor: body,
    // нажатие тангенты: экран показывает приём, потом «нет сигнала»
    ptt() {
      talking = 2.2;
      setLcd(['CH 04  ПРМ', '···  ···', 'ПРИЁМ', 3]);
      ptt.position.x = -W / 2 - 0.0005;
    },
    update(dt, t) {
      if (talking > 0) {
        talking -= dt;
        ledMat.color.setHex(Math.floor(t * 10) % 2 ? 0x20ff40 : 0x0a4010);
        if (talking <= 0) {
          setLcd(['CH 04', '147.450', 'НЕТ СИГНАЛА', 0]);
          ptt.position.x = -W / 2 - 0.002;
        }
      } else ledMat.color.setHex(Math.floor(t * 1.5) % 3 === 0 ? 0xff2020 : 0x200000);
    },
  };
}
