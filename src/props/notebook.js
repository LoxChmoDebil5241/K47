import * as THREE from 'three';
import { std, box, canvasTex } from '../geom.js';
import { leather } from '../textures.js';

// Блокнот в кожаной обложке. Лежит закрытым; при открытии обложка поворачивается на корешке,
// справа видна текущая страница с тем, что на ней написал игрок.
export const PAGES = 50;
const NW = 0.2, NL = 0.28, TH = 0.026, COV = 0.004;
export const HAND = '"Caveat", "Segoe Print", cursive';

// рисует страницу: линовка, поля, номер, текст рукописным шрифтом
export function drawPage(g, w, h, text, n) {
  g.fillStyle = '#ddd3bb'; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,50,20,.25)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  const top = h * 0.12, lh = h * 0.052;
  g.strokeStyle = 'rgba(60,80,140,.32)'; g.lineWidth = 2;
  for (let y = top; y < h - lh * 0.5; y += lh) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = 'rgba(170,40,40,.45)'; g.beginPath(); g.moveTo(w * 0.12, 0); g.lineTo(w * 0.12, h); g.stroke();
  g.fillStyle = '#2a2440'; g.font = `${Math.round(lh * 0.82)}px ${HAND}`;
  g.textBaseline = 'alphabetic';
  // перенос по словам внутри полей
  const maxW = w * 0.84, x0 = w * 0.14;
  let y = top - lh * 0.18, line = '';
  const flush = () => { g.fillText(line, x0, y); y += lh; line = ''; };
  y += lh;
  for (const para of (text || '').split('\n')) {
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > maxW && line) { flush(); line = word; } else line = t;
    }
    flush();
    if (y > h - lh * 0.3) break;
  }
  g.fillStyle = 'rgba(40,30,30,.55)'; g.font = `${Math.round(lh * 0.6)}px ${HAND}`; g.textAlign = 'right';
  g.fillText(`${n}`, w - w * 0.05, h - lh * 0.4); g.textAlign = 'left';
}

export function buildNotebook() {
  const root = new THREE.Group();
  const cover = std({ map: leather(4, '#4a1a0e'), roughness: 0.75 });
  const paperSide = std({
    map: canvasTex(64, 64, (g) => { g.fillStyle = '#d8ceb4'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(90,80,60,.35)'; for (let y = 0; y < 64; y += 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); } }),
    roughness: 0.95,
  });

  // задняя обложка и блок страниц
  box(NW, COV, NL, cover, 0, COV / 2, 0, root, 8);
  box(NW - 0.008, TH - COV * 2, NL - 0.01, paperSide, 0.002, COV + (TH - COV * 2) / 2, 0, root, 30);
  // корешок
  box(COV * 1.5, TH, NL, cover, -NW / 2 - COV * 0.5, TH / 2, 0, root, 8);

  // правая страница — текстура обновляется при записи
  const pageCanvas = document.createElement('canvas'); pageCanvas.width = 512; pageCanvas.height = 716;
  const pageTex = new THREE.CanvasTexture(pageCanvas); pageTex.colorSpace = THREE.SRGBColorSpace; pageTex.anisotropy = 8;
  const page = new THREE.Mesh(new THREE.PlaneGeometry(NW - 0.012, NL - 0.014), std({ map: pageTex, roughness: 0.95 }));
  page.rotation.x = -Math.PI / 2; page.position.set(0.002, TH - COV + 0.0006, 0);
  root.add(page);

  // передняя обложка на петле-корешке
  const hinge = new THREE.Group(); hinge.position.set(-NW / 2, TH - COV / 2, 0); root.add(hinge);
  const front = box(NW, COV, NL, cover, NW / 2, 0, 0, hinge, 8);
  // тиснёная табличка на обложке
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.035), std({
    map: canvasTex(256, 90, (g, w, h) => {
      g.fillStyle = '#3a130a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#b08850'; g.font = 'bold 34px "PT Mono", monospace'; g.textAlign = 'center'; g.fillText('ЖУРНАЛ', w / 2, 58);
    }),
    roughness: 0.5, metalness: 0.3,
  }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, COV / 2 + 0.0005, -NL * 0.18);
  front.add(plate);
  // форзац — изнанка обложки
  const endpaper = new THREE.Mesh(new THREE.PlaneGeometry(NW - 0.01, NL - 0.01), std({
    map: canvasTex(256, 358, (g, w, h) => {
      g.fillStyle = '#cfc4a8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a2440'; g.font = `42px ${HAND}`; g.fillText('К-47', 40, 90);
      g.font = `28px ${HAND}`; g.fillText('Цикл 48.', 40, 140); g.fillText('Если найдёшь —', 40, 250); g.fillText('не верь терминалу.', 40, 285);
    }),
    roughness: 0.95,
  }));
  endpaper.rotation.x = Math.PI / 2; endpaper.position.set(0, -COV / 2 - 0.0005, 0);
  front.add(endpaper);
  // резинка-застёжка
  box(0.006, 0.0015, NL + 0.002, std({ color: 0x111111, roughness: 0.9 }), NW * 0.42, COV / 2 + 0.0008, 0, front, 10);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const hit = box(NW + 0.04, TH + 0.03, NL + 0.04, new THREE.MeshBasicMaterial({ visible: false }), 0, TH / 2, 0, root);
  // центр разворота (для камеры): над корешком, когда блокнот открыт
  const spread = new THREE.Object3D(); spread.position.set(-NW / 2, TH, 0); root.add(spread);

  const st = { open: 0, want: false };
  return {
    root, hit, anchor: spread,
    setPage(text, n) {
      const g = pageCanvas.getContext('2d');
      drawPage(g, pageCanvas.width, pageCanvas.height, text, n);
      pageTex.needsUpdate = true;
    },
    open() { st.want = true; },
    close() { st.want = false; },
    update(dt) {
      st.open = THREE.MathUtils.clamp(st.open + (st.want ? dt : -dt) * 1.1, 0, 1);
      const k = st.open * st.open * (3 - 2 * st.open);
      hinge.rotation.z = k * Math.PI * 0.985;
    },
  };
}
