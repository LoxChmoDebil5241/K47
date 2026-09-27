import * as THREE from 'three';
import { std, canvasTex } from '../geom.js';
import { plastic } from '../textures.js';

// Банка гранул РПК-3: белый пластик, этикетка с текстом из главы «Быт.»,
// рифлёная крышка, внутри 30 гранул. Банку можно поднять, покрутить, открыть и съесть гранулу.
export const RPK_TOTAL = 30;
export const LID_TIME = 1.4; // секунд на откручивание/закручивание
const R = 0.042, H = 0.105, LID = 0.022;

function labelTexture() {
  return canvasTex(1024, 300, (g, w, h) => {
    g.fillStyle = '#f1efe8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    // лицевая часть этикетки — первые 45% окружности
    g.font = 'bold 118px Arial, "Helvetica Neue", sans-serif'; g.fillText('РПК-3', 30, 130);
    g.fillRect(30, 150, 400, 5);
    g.font = 'bold 26px Arial, sans-serif'; g.fillText('Рацион Питательный', 30, 195); g.fillText('Концентрированный.', 30, 228);
    g.font = '18px Arial, sans-serif'; g.fillStyle = '#444'; g.fillText('30 ГРАНУЛ · ПАРТИЯ 0047-К', 30, 270);
    // оборот: состав и норма
    g.fillStyle = '#111'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('СОСТАВ:', 480, 44);
    g.font = '17px Arial, sans-serif';
    const wrap = (text, x, y, maxW, lh) => {
      let line = '';
      for (const word of text.split(' ')) {
        const t = line ? `${line} ${word}` : word;
        if (g.measureText(t).width > maxW) { g.fillText(line, x, y); y += lh; line = word; } else line = t;
      }
      g.fillText(line, x, y); return y + lh;
    };
    let y = wrap('гидролизованный белок (изолят), модифицированный крахмал, жировой концентрат, витаминно-минеральный комплекс, стабилизаторы, ароматизатор (нейтральный).', 480, 70, 330, 22);
    g.font = 'bold 20px Arial, sans-serif'; g.fillText('НОРМА:', 480, y + 8);
    g.font = '17px Arial, sans-serif';
    y = wrap('3 таблетки в сутки (для штатного персонала). Для клонов класса «Актив» норма не ограничена.', 480, y + 32, 330, 22);
    // штрихкод и логотип
    for (let i = 0; i < 46; i++) { const bw = [2, 3, 5][i % 3]; g.fillRect(850 + i * 3.3, 60, bw * 0.6, 120); }
    g.font = '14px "PT Mono", monospace'; g.fillText('4 607 047 004 817', 850, 200);
    g.font = 'bold 18px Arial, sans-serif'; g.fillText('VITEZSTVI', 862, 250);
    g.font = '12px Arial, sans-serif'; g.fillStyle = '#555'; g.fillText('ПИЩЕВОЙ КОНТУР · СЕКТОР 47', 836, 272);
    // потёртости
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,80,60,${Math.random() * 0.08})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 20, 0, 7); g.fill(); }
  });
}

export function buildJar(eatenInit = 0) {
  const root = new THREE.Group();        // стоит на столе
  const body = new THREE.Group(); root.add(body); // её поднимаем и крутим
  const white = std({ map: plastic(41, '#e9e7e1'), roughness: 0.85 });

  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, H, 40, 1, true), white);
  shell.position.y = H / 2; body.add(shell);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R * 0.97, 40), white);
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.002; body.add(bottom);
  const inside = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.93, H - 0.004, 40, 1, true), std({ color: 0xcfcac0, side: THREE.BackSide, roughness: 0.8 }));
  inside.position.y = H / 2 + 0.002; body.add(inside);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.0022, 8, 40), white);
  rim.rotation.x = Math.PI / 2; rim.position.y = H; body.add(rim);
  // резьба под крышку
  for (let i = 0; i < 2; i++) {
    const th = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, 0.0012, 6, 40), white);
    th.rotation.x = Math.PI / 2; th.position.y = H - 0.005 - i * 0.004; body.add(th);
  }
  // этикетка
  const label = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0008, R * 0.97 + 0.0008, H * 0.66, 48, 1, true, Math.PI * 0.9, Math.PI * 2),
    std({ map: labelTexture(), roughness: 0.6 }));
  label.position.y = H * 0.47; body.add(label);

  // крышка с рифлением
  const lid = new THREE.Group(); lid.position.y = H; body.add(lid);
  const lidMat = std({ map: plastic(42, '#d9d6cf'), roughness: 0.85 });
  const lidGeo = new THREE.CylinderGeometry(R + 0.003, R + 0.003, LID, 60, 1);
  const lp = lidGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), z = lp.getZ(i), rr = Math.hypot(x, z);
    if (rr < R) continue;
    const a = Math.atan2(z, x), k = Math.round((a / (Math.PI * 2)) * 60) % 2 ? 1.03 : 1;
    lp.setX(i, Math.cos(a) * rr * k); lp.setZ(i, Math.sin(a) * rr * k);
  }
  lidGeo.computeVertexNormals();
  const lidMesh = new THREE.Mesh(lidGeo, lidMat); lidMesh.position.y = LID / 2; lid.add(lidMesh);
  const lidTop = new THREE.Mesh(new THREE.CircleGeometry(R * 0.8, 40), std({
    map: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#dcd9d2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#222'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('РПК-3', w / 2, h / 2 + 4);
      g.font = '18px Arial, sans-serif'; g.fillText('ОТКРЫВАТЬ ↺', w / 2, h / 2 + 40);
      g.strokeStyle = '#999'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 110, 0, 7); g.stroke();
    }),
    roughness: 0.5,
  }));
  lidTop.rotation.x = -Math.PI / 2; lidTop.position.y = LID + 0.0005; lid.add(lidTop);

  // гранулы: белые, круглые, как кусочки мела — слоями на дне
  const granGeo = new THREE.SphereGeometry(0.0062, 10, 8); granGeo.scale(1, 0.62, 1);
  const grains = new THREE.InstancedMesh(granGeo, std({ color: 0xece8dc, roughness: 0.9 }), RPK_TOTAL);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < RPK_TOTAL; i++) {
    const layer = Math.floor(i / 10), k = i % 10;
    const a = k * 2.4 + layer, rr = k === 0 ? 0 : 0.012 + (k % 3) * 0.009;
    q.setFromEuler(e.set(Math.random(), Math.random(), Math.random()));
    m.compose(new THREE.Vector3(Math.cos(a) * rr, 0.007 + layer * 0.0075, Math.sin(a) * rr), q, new THREE.Vector3(1, 1, 1));
    grains.setMatrixAt(i, m);
  }
  body.add(grains);

  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.6, R * 1.6, H + LID + 0.02, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (H + LID) / 2; body.add(hit);

  let eaten = eatenInit;
  const showGrains = () => { grains.count = RPK_TOTAL - eaten; };
  showGrains();

  const st = { held: 0, open: 0, wantHeld: false, wantOpen: false, spin: 0.35, tilt: 0.25 };
  const homePos = new THREE.Vector3(), holdPos = new THREE.Vector3();
  // летящая гранула: живёт в корне сцены, чтобы двигаться в мировых координатах
  const flyMesh = new THREE.Mesh(granGeo, grains.material); flyMesh.visible = false;
  const fly = { t: 1, from: new THREE.Vector3(), to: new THREE.Vector3() };
  let rattle = 0, rattleCd = 0;
  const tmp = new THREE.Vector3();

  return {
    root, hit, anchor: shell,
    get eaten() { return eaten; },
    get isOpen() { return st.wantOpen; },
    // hold — точка в мировых координатах, куда поднести банку
    pickUp(hold) { st.wantHeld = true; holdPos.copy(hold); },
    putDown() { st.wantHeld = false; st.wantOpen = false; },
    toggleLid() { st.wantOpen = !st.wantOpen; return st.wantOpen; },
    // гранула вылетает из горлышка к губам камеры; mouth — мировая точка «рта»
    eat(mouth) {
      if (!st.wantOpen || eaten >= RPK_TOTAL || fly.t < 1) return false;
      eaten++; showGrains();
      fly.from.copy(body.localToWorld(new THREE.Vector3(0, H + 0.01, 0)));
      fly.to.copy(mouth); fly.t = 0; flyMesh.visible = true;
      return true;
    },
    onSwallow: null,
    onRattle: null,
    rotate(dx, dy) {
      st.spin += dx; st.tilt = THREE.MathUtils.clamp(st.tilt + dy, -0.2, 1.1);
      rattle += Math.abs(dx) + Math.abs(dy);
    },
    update(dt) {
      const ease = (x) => x * x * (3 - 2 * x);
      if (!flyMesh.parent) { let r = root; while (r.parent) r = r.parent; r.add(flyMesh); }
      if (fly.t < 1) {
        fly.t = Math.min(1, fly.t + dt / 0.7);
        const e = ease(fly.t);
        flyMesh.position.lerpVectors(fly.from, fly.to, e);
        flyMesh.position.y += Math.sin(e * Math.PI) * 0.06;
        flyMesh.rotation.set(fly.t * 9, fly.t * 6, 0);
        flyMesh.scale.setScalar(1.6);
        if (fly.t === 1) { flyMesh.visible = false; this.onSwallow?.(); }
      }
      // гранулы шуршат и стучат, пока банку крутят — чем быстрее, тем чаще
      rattleCd -= dt;
      if (rattle > 0.05 && rattleCd <= 0 && st.held > 0.9 && eaten < RPK_TOTAL) {
        this.onRattle?.(Math.min(1, rattle * 4)); rattle = 0; rattleCd = 0.09;
      }
      rattle *= Math.max(0, 1 - dt * 6);
      st.held = THREE.MathUtils.clamp(st.held + (st.wantHeld ? dt : -dt) * 1.4, 0, 1);
      st.open = THREE.MathUtils.clamp(st.open + (st.wantOpen ? dt : -dt) / LID_TIME, 0, 1);
      const k = ease(st.held);
      root.getWorldPosition(homePos);
      // в поднятом состоянии банка висит перед камерой — переводим мировую точку в локальные координаты стола
      tmp.lerpVectors(homePos, holdPos, k);
      body.position.copy(root.worldToLocal(tmp.clone()));
      body.position.y += Math.sin(k * Math.PI) * 0.05;
      body.rotation.set(st.tilt * k, st.spin * k, 0);
      // крышка поднимается и откидывается в сторону
      // крышка: сначала 2,5 оборота по резьбе (поднимается на шаг резьбы), потом снимается и отводится в сторону
      const screw = Math.min(1, st.open / 0.7), off = ease(Math.max(0, (st.open - 0.7) / 0.3));
      lid.position.set(off * 0.07, H + screw * 0.008 + off * 0.03, 0);
      lid.rotation.set(0, screw * Math.PI * 5, off * 0.9);
    },
  };
}
