import * as THREE from 'three';
import { metal, hazard } from './textures.js';
import { std, box, planeUV, scaleUV, roundPoly, canvasTex } from './geom.js';

// Шлюз в духе SS14. Створки смыкаются ломаным швом (как на эскизе):
// сверху шов левее центра, посередине уходит по диагонали вправо, снизу — правее центра.
// В каждой створке — большое скруглённое окно по форме створки.
// При открытии створки уезжают в стену и обрезаются плоскостями по краям проёма — снаружи их не видно.

export function buildAirlock(scene, { z, w, h }) {
  const g = new THREE.Group(); g.position.z = z; scene.add(g);

  const paint = metal(12, '#6d7278', 0.6);
  const frameMat = std({ map: metal(13, '#474c52'), roughness: 0.55, metalness: 0.55 });
  const darkMat = std({ map: metal(14, '#25282b'), roughness: 0.6, metalness: 0.5 });
  const hazMat = std({ map: hazard(), roughness: 0.8, metalness: 0.1 });

  // ---------- рама ----------
  const T = 0.26, DEPTH = 0.5;
  box(w + T * 2, T, DEPTH, frameMat, 0, h + T / 2, 0, g, 2);
  for (const s of [-1, 1]) box(T, h, DEPTH, frameMat, s * (w / 2 + T / 2), h / 2, 0, g, 2);
  // наличник по периметру со стороны комнаты
  box(w + T * 2 + 0.16, 0.08, 0.06, darkMat, 0, h + T + 0.04, -DEPTH / 2 - 0.03, g, 2);
  for (const s of [-1, 1]) box(0.08, h + T + 0.08, 0.06, darkMat, s * (w / 2 + T + 0.04), (h + T + 0.08) / 2, -DEPTH / 2 - 0.03, g, 2);
  // жёлто-чёрные полосы на внутренних торцах рамы и над проёмом
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(planeUV(new THREE.PlaneGeometry(0.16, h), 3), hazMat);
    strip.position.set(s * (w / 2 + 0.001), h / 2, -DEPTH / 2 + 0.1); strip.rotation.y = -s * Math.PI / 2;
    g.add(strip);
  }
  const lintel = new THREE.Mesh(planeUV(new THREE.PlaneGeometry(w, 0.16), 3), hazMat);
  lintel.position.set(0, h - 0.001, -DEPTH / 2 + 0.1); lintel.rotation.x = Math.PI / 2; g.add(lintel);
  box(w + T * 2, 0.04, DEPTH + 0.3, hazMat, 0, 0.02, -0.05, g, 3).receiveShadow = true;
  // болты
  const boltMat = std({ color: 0x8a9096, metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8), boltMat);
    bolt.position.set(s * (w / 2 + T / 2), 0.2 + i * (h - 0.3) / 6, -DEPTH / 2 - 0.01); bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }
  // лампы состояния
  const lampMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
  [-1, 1].forEach((s, i) => box(0.14, 0.06, 0.04, lampMats[i], s * 0.35, h + T / 2, -DEPTH / 2 - 0.02, g));
  const statusLight = new THREE.PointLight(0xff2020, 0.8, 2.5, 2);
  statusLight.position.set(0, h + 0.05, -DEPTH / 2 - 0.3); g.add(statusLight);
  // табличка
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.12), std({
    map: canvasTex(256, 48, (c) => {
      c.fillStyle = '#1b1d1f'; c.fillRect(0, 0, 256, 48);
      c.fillStyle = '#c9a21a'; c.font = 'bold 24px "PT Mono", monospace'; c.textAlign = 'center';
      c.fillText('ШЛЮЗ · СЕКТОР 47', 128, 32);
    }),
    roughness: 0.7,
  }));
  sign.position.set(0, h + T + 0.16, -DEPTH / 2 - 0.01); sign.rotation.y = Math.PI; g.add(sign);

  // ---------- створки ----------
  // шов по эскизу: u — доля ширины слева направо, как видит игрок из комнаты; y — доля высоты, снизу вверх.
  // Игрок смотрит на шлюз в сторону +Z, поэтому его «лево» — это мировой +X: x = w/2 − u·w
  const seam = [[0.6, 0], [0.62, 0.32], [0.36, 0.56], [0.36, 1]].map(([u, y]) => new THREE.Vector2(w / 2 - u * w, y * h));
  const seamX = (y) => {
    for (let i = 0; i < seam.length - 1; i++) {
      const a = seam[i], b = seam[i + 1];
      if (y >= a.y && y <= b.y) return b.y === a.y ? a.x : a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
    }
    return seam[seam.length - 1].x;
  };
  const OVER = 0.12;          // заход створки в раму
  const GAP = 0.004;          // зазор по шву
  const mOut = 0.1 * w, mSeam = 0.12 * w, yb = 0.08 * h, yt = 0.83 * h;

  // окно: от внешнего поля до шва с отступом, по высоте yb..yt, углы скруглены
  function windowPath(side) {
    const ys = [yb, ...seam.map((p) => p.y).filter((y) => y > yb && y < yt), yt];
    const outer = side < 0 ? -w / 2 + mOut : w / 2 - mOut;
    const inner = ys.map((y) => new THREE.Vector2(seamX(y) + side * mSeam, y));
    const pts = side < 0
      ? [new THREE.Vector2(outer, yb), ...inner, new THREE.Vector2(outer, yt)]
      : [new THREE.Vector2(outer, yb), new THREE.Vector2(outer, yt), ...inner.reverse()];
    return roundPoly(pts, 0.07);
  }

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7fa6c0, transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0.5,
    emissive: 0x06121c, depthWrite: false,
  });
  const sealMat = std({ color: 0x0d0d0e, roughness: 0.95 });
  const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), w / 2), new THREE.Plane(new THREE.Vector3(-1, 0, 0), w / 2)];
  const panelMat = std({ map: paint, roughness: 0.55, metalness: 0.45, clippingPlanes: clip });
  const edgeMat = std({ color: 0x1e2124, roughness: 0.7, metalness: 0.4, clippingPlanes: clip });
  glassMat.clippingPlanes = clip; sealMat.clippingPlanes = clip;
  // тени тоже обрезаются — иначе уехавшая в стену створка отбрасывает тень на стену
  for (const m of [glassMat, sealMat, panelMat, edgeMat]) m.clipShadows = true;

  const PD = 0.1; // толщина створки
  const panels = [-1, 1].map((side) => {
    const outline = side < 0
      ? [new THREE.Vector2(-w / 2 - OVER, 0), ...seam.map((p) => new THREE.Vector2(p.x - GAP, p.y)), new THREE.Vector2(-w / 2 - OVER, h)]
      : [new THREE.Vector2(w / 2 + OVER, 0), new THREE.Vector2(w / 2 + OVER, h), ...[...seam].reverse().map((p) => new THREE.Vector2(p.x + GAP, p.y))];
    const shape = new THREE.Shape(outline);
    const win = windowPath(side);
    shape.holes.push(new THREE.Path(win));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PD, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -PD / 2);
    scaleUV(geo, 1.4);
    const panel = new THREE.Mesh(geo, [panelMat, edgeMat]);
    panel.castShadow = panel.receiveShadow = true;
    const pg = new THREE.Group(); pg.add(panel); g.add(pg);

    // выпуклое стекло с толстым скруглённым краем
    const gshape = new THREE.Shape(win);
    const ggeo = new THREE.ExtrudeGeometry(gshape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.018, bevelSegments: 6, curveSegments: 4 });
    ggeo.translate(0, 0, -0.01);
    // стекло выгнуто наружу по ширине окна — как линза в корабельной двери
    ggeo.computeBoundingBox();
    const bb = ggeo.boundingBox, gcx = (bb.min.x + bb.max.x) / 2, ghw = (bb.max.x - bb.min.x) / 2;
    const gp = ggeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const z = gp.getZ(i);
      if (Math.abs(z) < 0.015) continue; // боковые стенки не трогаем
      const k = Math.max(0, 1 - Math.pow((gp.getX(i) - gcx) / ghw, 2));
      gp.setZ(i, z + Math.sign(z) * 0.03 * k);
    }
    ggeo.computeVertexNormals();
    pg.add(new THREE.Mesh(ggeo, glassMat));
    // резиновый уплотнитель — трубка по контуру окна с обеих сторон створки
    for (const zz of [-PD / 2 - 0.006, PD / 2 + 0.006]) {
      const curve = new THREE.CatmullRomCurve3(win.map((p) => new THREE.Vector3(p.x, p.y, zz)), true);
      pg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, win.length * 2, 0.011, 6, true), sealMat));
    }

    // ребро жёсткости по низу створки
    const plateW = side < 0 ? seamX(0.05 * h) - (-w / 2) - 0.06 : w / 2 - seamX(0.05 * h) - 0.06;
    box(plateW, 0.05, 0.015, edgeMat, side < 0 ? -w / 2 + plateW / 2 + 0.03 : w / 2 - plateW / 2 - 0.03, 0.05 * h, -PD / 2 - 0.012, pg);
    const xs = seam.map((p) => p.x);
    return { g: pg, side, travel: side < 0 ? Math.max(...xs) + w / 2 + 0.03 : w / 2 - Math.min(...xs) + 0.03 };
  });

  // невидимая зона нажатия
  const hit = box(w + T * 2, h + T, 0.2, new THREE.MeshBasicMaterial({ visible: false }), 0, h / 2, -DEPTH / 2 - 0.1, g);

  const state = { open: false, t: 0, busy: false, wait: 0 };
  return {
    hit, state,
    toggle() {
      if (state.busy) return false;
      state.open = !state.open; state.busy = true; state.wait = 0.4; // лампы мигают, затем створки едут
      return true;
    },
    update(dt, time) {
      if (state.wait > 0) state.wait -= dt;
      else if (state.busy) {
        const target = state.open ? 1 : 0;
        state.t += Math.sign(target - state.t) * Math.min(Math.abs(target - state.t), dt * 1.2);
        if (state.t === target) state.busy = false;
      }
      const k = state.t < 0.5 ? 2 * state.t * state.t : 1 - Math.pow(-2 * state.t + 2, 2) / 2;
      for (const p of panels) p.g.position.x = p.side * k * p.travel;
      const blink = Math.floor(time * 6) % 2;
      const c = state.busy ? (blink ? 0xffb020 : 0x301000) : state.open ? 0x20ff40 : 0xff2020;
      lampMats.forEach((m) => m.color.setHex(c));
      statusLight.color.setHex(state.busy ? 0xffa020 : state.open ? 0x20ff40 : 0xff2020);
      statusLight.intensity = state.busy && !blink ? 0.1 : 0.8;
    },
  };
}
