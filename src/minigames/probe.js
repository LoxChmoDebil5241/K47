import * as THREE from 'three';
import { sfx, storm } from '../audio.js';
import { noise, fbm, ridge, smooth } from './noise.js';
import { startWar } from './raid/war.js';

// Пролог «Ол-12-П» — разведка и раздел влияния.
// Часть 1 (до 3 мин): голографическая спектрограмма ледяной планеты — вращаем, приближаем.
//   A. 7 точек в атмосфере: касание — данные атмосферы участка, затем запуск зонда. Пригодны 2. Зондов 4.
//   B. Участок поверхности (вращаем/приближаем): 5 площадок, 1 пригодна. Попыток 2.
//   C. 15 поверхностных масс, в одной — осмий. Сканов 8, скан показывает близость по плотности.
//   Стихии планеты периодически дают помехи — спектрограмма и модель искажаются.
// Заставка: «Это... Осмий. Эта планета богата...» растворяется в атмосфере.
// Часть 2 (до 30:00 всего): захват планеты — 4 сектора, запросы НТ и СНК, рейдерские отряды (raid/war.js).
const PART1 = 180, TOTAL = 30 * 60; // разведка до 3 минут, весь пролог — 30 минут
const SITES = [
  { name: 'ГОРНЫЙ МАССИВ', slope: 38, ice: 40, wind: 71, ok: false, why: 'Уклон. Зонд сорвался со склона.' },
  { name: 'РАВНИНА', slope: 3, ice: 120, wind: 22, ok: true },
  { name: 'РАЗЛОМ', slope: 12, ice: 8, wind: 64, ok: false, why: 'Лёд тонкий. Зонд ушёл в трещину.' },
  { name: 'ЛЕДНИК', slope: 9, ice: 300, wind: 88, ok: false, why: 'Ветер. Зонд унесло с ледника.' },
  { name: 'КРАТЕР', slope: 21, ice: 60, wind: 35, ok: false, why: 'Стенки кратера. Связь потеряна.' },
];
const SKY_GLITCH = ['ГРОЗОВОЙ ФРОНТ', 'МАГНИТНАЯ БУРЯ', 'ИОННЫЙ ШТОРМ', 'СНЕЖНЫЙ ЦИКЛОН'];
const GROUND_GLITCH = ['ПОЗЁМКА', 'ЛЕДОВЫЙ СДВИГ', 'СТАТИКА', 'ОБВАЛ КАРНИЗА'];

// карты планеты: цвет, высота (рельеф), облака — равнопромежуточная проекция без шва
function planetMaps() {
  const W = 768, H = 384, CW = 512, CH = 256;
  const col = document.createElement('canvas'); col.width = W; col.height = H;
  const hgt = document.createElement('canvas'); hgt.width = W; hgt.height = H;
  const cld = document.createElement('canvas'); cld.width = CW; cld.height = CH;
  const gc = col.getContext('2d'), gh = hgt.getContext('2d'), gl = cld.getContext('2d');
  const ic = gc.createImageData(W, H), ih = gh.createImageData(W, H), il = gl.createImageData(CW, CH);
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - j / H) * Math.PI, cy = Math.sin(lat), cr = Math.cos(lat);
    for (let i = 0; i < W; i++) {
      const lon = (i / W) * Math.PI * 2, x = Math.sin(lon) * cr, z = Math.cos(lon) * cr;
      const h = fbm(x * 2.2 + 5, cy * 2.2, z * 2.2, 5);
      const cr2 = ridge(x * 3.5 + 11, cy * 3.5, z * 3.5, 4);          // трещины-гряды
      const rock = smooth(0.6, 0.7, fbm(x * 1.6 + 40, cy * 1.6, z * 1.6, 4)); // скальные выходы
      const pole = smooth(0.72, 0.9, Math.abs(cy) + (h - 0.5) * 0.2);
      const crack = smooth(0.55, 0.85, cr2);
      let r = 96 + h * 110, g = 140 + h * 90, b = 178 + h * 60;          // лёд
      r += (40 - r) * crack * 0.55; g += (88 - g) * crack * 0.55; b += (128 - b) * crack * 0.55;
      const rv = 70 + h * 60; r += (rv + 12 - r) * rock * 0.85; g += (rv + 4 - g) * rock * 0.85; b += (rv - b) * rock * 0.85;
      r += (226 - r) * pole; g += (238 - g) * pole; b += (250 - b) * pole;
      const k = (j * W + i) * 4;
      ic.data[k] = r; ic.data[k + 1] = g; ic.data[k + 2] = b; ic.data[k + 3] = 255;
      const hv = Math.max(0, Math.min(255, (h * 0.7 + rock * 0.35 - crack * 0.25 + pole * 0.1) * 255));
      ih.data[k] = ih.data[k + 1] = ih.data[k + 2] = hv; ih.data[k + 3] = 255;
    }
  }
  for (let j = 0; j < CH; j++) {
    const lat = (0.5 - j / CH) * Math.PI, cy = Math.sin(lat), cr = Math.cos(lat);
    const band = 0.6 + 0.4 * Math.cos(lat * 6);
    for (let i = 0; i < CW; i++) {
      const lon = (i / CW) * Math.PI * 2, x = Math.sin(lon) * cr, z = Math.cos(lon) * cr;
      // облака вытянуты ветром вдоль широт
      const f = fbm(x * 3 + 90, cy * 7, z * 3, 5) * band;
      const k = (j * CW + i) * 4;
      il.data[k] = il.data[k + 1] = il.data[k + 2] = 255; il.data[k + 3] = smooth(0.48, 0.75, f) * 190;
    }
  }
  gc.putImageData(ic, 0, 0); gh.putImageData(ih, 0, 0); gl.putImageData(il, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { map: tex(col, true), height: tex(hgt), clouds: tex(cld, true) };
}
// спираль циклона
function vortexTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.translate(128, 128);
  for (let arm = 0; arm < 4; arm++) {
    for (let t = 0; t < 1; t += 0.004) {
      const a = arm * Math.PI / 2 + t * 9, r = 6 + t * 94;
      g.fillStyle = `rgba(255,255,255,${(1 - t) * 0.22})`;
      g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 3 + t * 12, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// точка на сфере по широте/долготе (долгота 0 — к камере по умолчанию)
const onSphere = (lat, lon, r) => new THREE.Vector3(Math.cos(lat) * Math.sin(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.cos(lon) * r);
const visible = onSphere;

export default {
  name: 'Разрез коры',
  run(root, done) {
    root.classList.add('pr-root');
    root.innerHTML = `
      <canvas class="pr-view"></canvas>
      <div class="pr-grid"></div>
      <div class="pr-noise"></div>
      <div class="pr-labels"></div>
      <header class="pr-top"><span class="pr-stage"></span><span class="pr-time"></span></header>
      <p class="pr-glitch"></p>
      <div class="pr-info"></div>
      <div class="pr-bottom"></div>
      <div class="pr-float"></div>`;
    const $ = (q) => root.querySelector(q);
    const cv = $('.pr-view'), labels = $('.pr-labels'), info = $('.pr-info'), bottom = $('.pr-bottom');

    // ---------- 3D ----------
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02060a);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(0, 1, 4.2);
    scene.add(new THREE.AmbientLight(0x6080a0, 0.35));
    scene.add(new THREE.HemisphereLight(0xbfe4ff, 0x10202c, 0.5));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6); sun.position.set(4, 2, 3); scene.add(sun);

    // планета: рельеф смещением вершин + облака + ветер + циклоны
    const planet = new THREE.Group(); scene.add(planet);
    const maps = planetMaps();
    const surf = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), new THREE.MeshStandardMaterial({
      map: maps.map, bumpMap: maps.height, bumpScale: 3, displacementMap: maps.height, displacementScale: 0.045, displacementBias: -0.015, roughness: 0.5, metalness: 0.05,
    }));
    planet.add(surf);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 64), new THREE.MeshStandardMaterial({ map: maps.clouds, transparent: true, depthWrite: false, roughness: 1 }));
    planet.add(clouds);
    // ветер — светящиеся штрихи вдоль широт
    const WN = 420, wind = [];
    for (let i = 0; i < WN; i++) { const lat = (Math.random() - 0.5) * 2.8; wind.push({ lat, lon: Math.random() * 7, sp: (0.12 + Math.random() * 0.1) * (Math.sin(lat * 3) >= 0 ? 1 : -1), len: 0.04 + Math.random() * 0.08 }); }
    const windGeo = new THREE.BufferGeometry(); windGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WN * 6), 3));
    const windLines = new THREE.LineSegments(windGeo, new THREE.LineBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    planet.add(windLines);
    const vortexTex = vortexTexture(), vortices = [];
    function vortex(lat, lon, size) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: vortexTex, transparent: true, depthWrite: false, opacity: 0.85 }));
      const p = onSphere(lat, lon, 1.06); m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2));
      m.userData.sp = (lat > 0 ? 1 : -1) * (0.6 + Math.random() * 0.5); planet.add(m); vortices.push(m); return m;
    }
    // фоновые циклоны
    vortex(1.0, 2.6, 0.5); vortex(-0.8, 3.8, 0.4); vortex(0.3, 4.6, 0.35);
    // голографическая сетка, свечение атмосферы, кольцо сканера
    const holo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 36, 24), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, wireframe: true, transparent: true, opacity: 0.035 }));
    planet.add(holo);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.14, 48, 32), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color(0x6fc8ff) } },
      vertexShader: 'varying float f; void main(){ vec3 n = normalize(normalMatrix*normal); vec4 p = modelViewMatrix*vec4(position,1.); f = pow(max(0.0, -dot(n, normalize(-p.xyz))), 1.3) * 1.6; gl_Position = projectionMatrix*p; }',
      fragmentShader: 'uniform vec3 c; varying float f; void main(){ gl_FragColor = vec4(c, f*0.6); }',
    }));
    scene.add(glow);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color(0x8fd8ff) } },
      vertexShader: 'varying float f; void main(){ vec3 n = normalize(normalMatrix*normal); vec4 p = modelViewMatrix*vec4(position,1.); f = pow(1.0-abs(dot(n, normalize(-p.xyz))), 3.0); gl_Position = projectionMatrix*p; }',
      fragmentShader: 'uniform vec3 c; varying float f; void main(){ gl_FragColor = vec4(c, f*0.45); }',
    }));
        const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.004, 6, 96), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.6 }));
    scanRing.rotation.x = Math.PI / 2; scene.add(scanRing);
    const stars = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 900 }, () => onSphere(Math.asin(Math.random() * 2 - 1), Math.random() * 7, 30 + Math.random() * 20))), new THREE.PointsMaterial({ color: 0x9fcfff, size: 0.08 }));
    scene.add(stars);
    const orbitParts = [planet, glow, scanRing];

    // ---------- участок поверхности (B/C): сложный рельеф из шума ----------
    const terrain = new THREE.Group(); terrain.visible = false; scene.add(terrain);
    const TS = 200, tGeo = new THREE.PlaneGeometry(8, 8, TS, TS); tGeo.rotateX(-Math.PI / 2);
    const sitePos = [[-2.4, -1.6], [0.2, 0.3], [2.3, -1.4], [-1.8, 1.9], [2.2, 1.9]];
    const tp = tGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i);
      const d = (k) => Math.hypot(x - sitePos[k][0], z - sitePos[k][1]);
      let y = (fbm(x * 0.45, 3, z * 0.45, 5) - 0.5) * 0.7 + ridge(x * 0.6 + 7, 1, z * 0.6, 4) * 0.35 + (noise(x * 6, 9, z * 6) - 0.5) * 0.04;
      y += smooth(1.6, 0.2, d(0)) * (0.6 + ridge(x * 1.4, 5, z * 1.4, 5) * 1.3);                   // горы: острые хребты
      y = y * (1 - smooth(1.5, 0.5, d(1))) + (smooth(1.5, 0.5, d(1))) * (0.05 + (noise(x * 3, 2, z * 3) - 0.5) * 0.02); // равнина
      const rift = Math.abs(x - sitePos[2][0] - (z - sitePos[2][1]) * 0.35 + (noise(z * 2.5, 4, 1) - 0.5) * 0.3);
      if (d(2) < 1.8) y -= smooth(0.22, 0.02, rift) * 0.75 * smooth(1.8, 1.0, d(2));             // разлом: рваный каньон
      if (d(3) < 1.6) y += smooth(1.6, 0.2, d(3)) * (0.25 + Math.sin((x + z) * 9 + noise(x * 2, 1, z * 2) * 4) * 0.02); // ледник: купол с бороздами
      const dc = d(4);
      if (dc < 1.3) y += -smooth(0.95, 0, dc) * 0.45 + Math.exp(-((dc - 0.95) ** 2) / 0.02) * 0.3 + Math.exp(-dc * dc / 0.01) * 0.2; // кратер: вал и горка
      tp.setY(i, y);
    }
    tGeo.computeVertexNormals();
    // цвет по уклону и высоте: снег, голубой лёд, скала
    const nrm = tGeo.attributes.normal, tcol = new Float32Array(tp.count * 3);
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i), steep = 1 - nrm.getY(i), n = noise(tp.getX(i) * 4, 0, tp.getZ(i) * 4);
      const rock = smooth(0.25, 0.45, steep + (n - 0.5) * 0.15), snow = smooth(0.1, 0.6, y + (n - 0.5) * 0.3) * (1 - rock);
      let r = 0.55, g = 0.72, b = 0.86;
      r += (0.93 - r) * snow; g += (0.96 - g) * snow; b += (1 - b) * snow;
      r += (0.32 + n * 0.1 - r) * rock; g += (0.33 + n * 0.1 - g) * rock; b += (0.36 + n * 0.1 - b) * rock;
      if (y < -0.2) { const k = smooth(-0.2, -0.6, y); r *= 1 - k * 0.6; g *= 1 - k * 0.45; b *= 1 - k * 0.3; }
      tcol.set([r, g, b], i * 3);
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
    const tBase = Float32Array.from(tp.array);
    terrain.add(new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 })));
    const grid = new THREE.GridHelper(8, 32, 0x2a7aa0, 0x16405a); grid.position.y = -0.9; terrain.add(grid);
    // кромка участка — голографическая рамка
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 2.4, 8)), new THREE.LineBasicMaterial({ color: 0x3aa8d8, transparent: true, opacity: 0.35 }));
    edge.position.y = 0.3; terrain.add(edge);
    // сканирующая полоса
    const sweep = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    sweep.position.y = 0.3; terrain.add(sweep);
    // позёмка: снег несёт ветром
    const SN = 1400, snowGeo = new THREE.BufferGeometry(), snowPos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) snowPos.set([(Math.random() - 0.5) * 8, Math.random() * 1.6 - 0.2, (Math.random() - 0.5) * 8], i * 3);
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    terrain.add(new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xeaf6ff, size: 0.025, transparent: true, opacity: 0.7, depthWrite: false })));
    const heightAt = (x, z) => { let best = 0, bd = 1e9; for (let i = 0; i < tp.count; i += 2) { const dd = (tp.getX(i) - x) ** 2 + (tp.getZ(i) - z) ** 2; if (dd < bd) { bd = dd; best = tp.getY(i); } } return best; };

    // ---------- орбитальная камера: палец/мышь — вращать, щипок/колесо — приближать ----------
    const orb = { target: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, pitch: 0.25, dist: 4.2, min: 1.8, max: 7, pmin: -1.35, pmax: 1.35 };
    function setOrbit(o) { Object.assign(orb, o); if (o.target) orb.target = o.target.clone(); }
    // orb.pan (карта сектора): один палец/ЛКМ — двигать камеру по карте; два пальца — щипок + поворот + наклон; ПКМ — поворот
    const pts = new Map(); let pinch = 0, twist = null, midY = null, btn = 0;
    root.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; pts.set(e.pointerId, [e.clientX, e.clientY]); btn = e.button; root.setPointerCapture?.(e.pointerId); pinch = 0; twist = midY = null; });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    const rotate = (dx, dy) => { orb.yaw -= dx * 0.006; orb.pitch = Math.max(orb.pmin, Math.min(orb.pmax, orb.pitch + dy * 0.006)); };
    root.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p || focus || orb.locked) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      if (pts.size === 1) {
        if (orb.pan && btn !== 2 && !e.shiftKey) {
          const k = orb.dist * 0.0022, c = Math.cos(orb.yaw), s = Math.sin(orb.yaw);
          orb.target.x -= (dx * c + dy * s) * k; orb.target.z -= (-dx * s + dy * c) * k;
          const L = orb.pan; orb.target.x = Math.max(-L, Math.min(L, orb.target.x)); orb.target.z = Math.max(-L, Math.min(L, orb.target.z));
        } else rotate(dx, dy);
      }
      p[0] = e.clientX; p[1] = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(pinch / d); pinch = d;
        if (orb.pan) {
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), my = (a[1] + b[1]) / 2;
          if (twist != null) { let da = ang - twist; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; orb.yaw += da; rotate(0, (my - midY) * 0.8); }
          twist = ang; midY = my;
        }
      }
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; twist = midY = null; };
    root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    root.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    function zoom(k) { if (orb.locked) return; orb.dist = Math.max(orb.min, Math.min(orb.max, orb.dist * k)); }
    const orbPos = (v) => v.set(Math.sin(orb.yaw) * Math.cos(orb.pitch), Math.sin(orb.pitch), Math.cos(orb.yaw) * Math.cos(orb.pitch)).multiplyScalar(orb.dist).add(orb.target);

    // ---------- помехи от стихий ----------
    const gl = { on: 0, next: 7 + Math.random() * 6, band: [0, 0] };
    function glitchStart() {
      gl.on = 0.5 + Math.random() * 1.1; gl.band = [(Math.random() - 0.5) * 7, 0.4 + Math.random() * 1.4];
      root.classList.add('glitch'); sfx.glitch(); storm.gust();
      const causes = terrain.visible ? GROUND_GLITCH : SKY_GLITCH;
      $('.pr-glitch').textContent = `ПОМЕХА · ${causes[Math.floor(Math.random() * causes.length)]}`;
    }
    function glitchEnd() {
      root.classList.remove('glitch'); $('.pr-glitch').textContent = '';
      planet.position.set(0, 0, 0); planet.scale.set(1, 1, 1); holo.material.opacity = 0.035;
      tp.array.set(tBase); tp.needsUpdate = true; terrain.position.set(0, 0, 0);
    }
    function glitchFrame() {
      if (terrain.visible) {
        // модель поверхности рвётся полосой: вершины скачут
        const [z0, w] = gl.band, a = tp.array;
        for (let i = 0; i < tp.count; i++) {
          const z = tBase[i * 3 + 2];
          if (Math.abs(z - z0) < w) { a[i * 3] = tBase[i * 3] + (Math.random() - 0.5) * 0.06; a[i * 3 + 1] = tBase[i * 3 + 1] + (Math.random() < 0.15 ? (Math.random() - 0.3) * 0.4 : 0.12); }
          else { a[i * 3] = tBase[i * 3]; a[i * 3 + 1] = tBase[i * 3 + 1]; }
        }
        tp.needsUpdate = true;
        if (Math.random() < 0.3) gl.band[0] = (Math.random() - 0.5) * 7;
        terrain.position.x = (Math.random() - 0.5) * 0.06;
      } else {
        // спектрограмма дробится: сдвиги и сплющивание
        planet.position.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.04, 0);
        planet.scale.set(1 + (Math.random() - 0.5) * 0.06, 1 + (Math.random() - 0.5) * 0.1, 1);
        holo.material.opacity = Math.random() * 0.5;
      }
    }

    // ---------- состояние ----------
    const st = { t: 0, stage: 'atmo', probes: 4, tries: 2, scans: 8, over: false, part2: false, t2: 0 };
    const markers = []; // { pos, el, parent }
    function clearMarkers() { markers.forEach((m) => m.el.remove()); markers.length = 0; }
    function marker(pos, cls, text, onTap, parent = planet) {
      const el = document.createElement('button'); el.className = `pr-mk ${cls}`; el.innerHTML = `<i></i><span></span>`; el.querySelector('span').textContent = text;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap?.(m); });
      labels.appendChild(el);
      const m = { pos, el, parent }; markers.push(m); return m;
    }
    function setInfo(title, lines = []) { info.innerHTML = `<b></b>${lines.map(() => '<p></p>').join('')}`; info.querySelector('b').textContent = title; info.querySelectorAll('p').forEach((p, i) => (p.textContent = lines[i])); }
    function say(text, cls = '') {
      const p = document.createElement('p'); p.className = `pr-say ${cls}`; $('.pr-float').appendChild(p);
      let i = 0; const tick = () => { if (i > text.length || !p.isConnected) return; if (text[i - 1]) sfx.talk(text[i - 1]); p.textContent = text.slice(0, i++); setTimeout(tick, 34); }; tick();
      setTimeout(() => p.classList.add('out'), 3200 + text.length * 50); setTimeout(() => p.remove(), 4400 + text.length * 50);
    }
    const hum = storm.start(); hum.set(0);

    // ---------- часть A: данные атмосферы и зонды ----------
    const CAUSE = {
      wind: 'Ветер сорвал зонд с траектории.', storm: 'Зонд попал в циклон. Связь потеряна.',
      ice: 'Обледенение зонда. Падение.', turb: 'Турбулентность. Зонд разрушен.',
    };
    function atmoData(good) {
      const d = { wind: 12 + Math.floor(Math.random() * 14), storm: 'НЕТ', cloud: 20 + Math.floor(Math.random() * 40), ice: 'НИЗКОЕ', turb: 1 + Math.floor(Math.random() * 2), temp: -(60 + Math.floor(Math.random() * 40)), press: (0.4 + Math.random() * 0.3).toFixed(2) };
      if (good) return d;
      d.cause = ['wind', 'storm', 'ice', 'turb'][Math.floor(Math.random() * 4)];
      // «почти норма» — отвлекающие средние значения
      if (Math.random() < 0.5) d.wind = 24 + Math.floor(Math.random() * 6);
      if (Math.random() < 0.4) d.ice = 'СРЕДНЕЕ';
      if (d.cause === 'wind') d.wind = 55 + Math.floor(Math.random() * 50);
      if (d.cause === 'storm') { d.storm = Math.random() < 0.5 ? 'ЦИКЛОН' : 'ГРОЗОВОЙ ФРОНТ'; d.cloud = 85 + Math.floor(Math.random() * 15); }
      if (d.cause === 'ice') { d.ice = 'ВЫСОКОЕ'; d.temp = -(120 + Math.floor(Math.random() * 30)); }
      if (d.cause === 'turb') d.turb = 6 + Math.floor(Math.random() * 4);
      return d;
    }
    function stageAtmo() {
      st.stage = 'atmo'; clearMarkers();
      $('.pr-stage').textContent = 'ЭТАП 1 · АТМОСФЕРНОЕ ЗОНДИРОВАНИЕ';
      const intro = () => setInfo('ВЫБЕРИТЕ ТОЧКУ ЗОНДИРОВАНИЯ', [`ЗОНДОВ: ${st.probes}`, 'Коридор: ветер до 30 м/с, без штормов, обледенение низкое, турбулентность до 3', 'Вращайте планету пальцем, щипок — приближение']);
      intro();
      const good = new Set(); while (good.size < 2) good.add(Math.floor(Math.random() * 7));
      for (let i = 0; i < 7; i++) {
        const lat = (Math.random() - 0.5) * 2.2, lon = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const data = atmoData(good.has(i));
        if (data.cause === 'storm') vortex(lat, lon, 0.45);
        marker(onSphere(lat, lon, 1.12), 'atmo', `A-${i + 1}`, (m) => {
          if (m.used || st.busy) return;
          sfx.click(); markers.forEach((k) => k.el.classList.toggle('sel', k === m));
          info.innerHTML = `<b>УЧАСТОК A-${i + 1} · АТМОСФЕРА</b>
            <p>ВЕТЕР: ${data.wind} М/С</p><p>ШТОРМ: ${data.storm}</p><p>ОБЛАЧНОСТЬ: ${data.cloud}%</p><p>ОБЛЕДЕНЕНИЕ: ${data.ice}</p>
            <p>ТУРБУЛЕНТНОСТЬ: ${data.turb} / 10</p><p>T: ${data.temp}°C · P: ${data.press} АТМ</p><p>ЗОНДОВ: ${st.probes}</p>
            <div class="pr-acts one"><button data-a="go">ЗАПУСТИТЬ ЗОНД</button></div>`;
          info.querySelector('[data-a]').addEventListener('pointerdown', (e) => { e.stopPropagation(); launch(m, i, data); });
        });
      }
      function launch(m, i, data) {
        if (m.used || st.busy) return;
        m.used = true; st.probes--; st.busy = true; sfx.click(); storm.lock();
        m.el.classList.add('probing'); setInfo('ЗОНД В АТМОСФЕРЕ…', [`ЗОНДОВ: ${st.probes}`]);
        setTimeout(() => {
          st.busy = false; m.el.classList.remove('probing', 'sel');
          if (!data.cause) { m.el.classList.add('ok'); storm.captured(); say('Коридор найден. Посадка возможна.'); setTimeout(() => stageLanding(m.pos), 1400); }
          else { m.el.classList.add('bad'); sfx.denied(); say(CAUSE[data.cause], 'warn'); intro(); if (st.probes <= 0) fail('Зонды закончились.'); }
        }, 1800);
      }
    }

    // ---------- часть B: площадки посадки ----------
    let focus = null;
    function stageLanding(pos) {
      st.stage = 'zoom'; clearMarkers(); info.innerHTML = '';
      // пролёт сквозь атмосферу к точке, затем участок поверхности
      const target = pos.clone();
      focus = { from: camera.position.clone(), to: target.clone().multiplyScalar(1.25), look: target, t: 0, then: () => {
        orbitParts.forEach((o) => (o.visible = false)); terrain.visible = true;
        setOrbit({ target: new THREE.Vector3(0, 0, 0), yaw: 0.3, pitch: 0.75, dist: 9, min: 3, max: 14, pmin: 0.15, pmax: 1.45 });
        orbPos(camera.position); camera.lookAt(orb.target); orb.look.copy(orb.target);
        st.stage = 'land';
        $('.pr-stage').textContent = 'ЭТАП 2 · ВЫБОР ПЛОЩАДКИ';
        setInfo('ВЫБЕРИТЕ ПЛОЩАДКУ', [`ПОПЫТОК: ${st.tries}`, 'Посадка: уклон до 5°, лёд от 100 м, ветер до 30 м/с', 'Вращайте участок, щипок — приближение']);
        SITES.forEach((S, i) => {
          const [x, z] = sitePos[i];
          const m = marker(new THREE.Vector3(x, heightAt(x, z) + 0.3, z), 'site', S.name, () => {
            if (st.busy || m.used) return; sfx.click(); markers.forEach((k) => k.el.classList.toggle('sel', k === m));
            info.innerHTML = `<b>ПЛОЩАДКА · ${S.name}</b><p>УКЛОН: ${S.slope}°</p><p>ТОЛЩИНА ЛЬДА: ${S.ice} М</p><p>ВЕТЕР У ПОВЕРХНОСТИ: ${S.wind} М/С</p><p>ПОПЫТОК: ${st.tries}</p>
              <div class="pr-acts one"><button data-a="go">ПОСАДИТЬ ЗОНД</button></div>`;
            info.querySelector('[data-a]').addEventListener('pointerdown', (e) => { e.stopPropagation(); land(); });
          }, terrain);
          const land = () => {
            if (st.busy || m.used) return; m.used = true; st.busy = true; sfx.click(); m.el.classList.remove('sel');
            setTimeout(() => {
              st.busy = false;
              if (S.ok) { m.el.classList.add('ok'); storm.captured(); say('Зонд на поверхности. Начинаю сканирование масс.'); setTimeout(() => stageScan(x, z), 1600); }
              else { st.tries--; m.el.classList.add('bad'); storm.gust(); say(S.why, 'warn'); setInfo('ВЫБЕРИТЕ ПЛОЩАДКУ', [`ПОПЫТОК: ${st.tries}`, 'Посадка: уклон до 5°, лёд от 100 м, ветер до 30 м/с']); if (st.tries <= 0) fail('Зонды потеряны на поверхности.'); }
            }, 1400);
          };
          m.el.classList.add(`s${i}`);
        });
      } };
      sfx.whoosh(1.6); storm.gust();
    }

    // ---------- часть C: сканирование масс ----------
    function stageScan(sx, sz) {
      st.stage = 'scan'; clearMarkers();
      setOrbit({ target: new THREE.Vector3(sx, 0, sz), dist: 3.6, pitch: 0.85, min: 1.2, max: 8 });
      $('.pr-stage').textContent = 'ЭТАП 3 · СКАНИРОВАНИЕ ПОВЕРХНОСТНЫХ МАСС';
      setInfo('ВЫБЕРИТЕ МАССУ ДЛЯ СКАНА', [`СКАНОВ: ${st.scans}`, 'Плотность растёт ближе к жиле']);
      const target = Math.floor(Math.random() * 15);
      for (let i = 0; i < 15; i++) {
        const gx = i % 5, gz = Math.floor(i / 5), x = sx - 1.2 + gx * 0.6, z = sz - 0.6 + gz * 0.6;
        const m = marker(new THREE.Vector3(x, heightAt(x, z) + 0.08, z), 'mass', `M-${String(i + 1).padStart(2, '0')}`, () => {
          if (st.busy || m.used) return; m.used = true; st.busy = true; st.scans--; sfx.click(); m.el.classList.add('probing');
          setTimeout(() => {
            st.busy = false; m.el.classList.remove('probing');
            const d = Math.abs(gx - target % 5) + Math.abs(gz - Math.floor(target / 5));
            if (i === target) { m.el.classList.add('ok'); m.el.querySelector('span').textContent = 'Os · 76'; storm.captured(); setTimeout(cutscene, 1500); }
            else {
              const dens = Math.max(5, 95 - d * 20 + Math.floor(Math.random() * 6));
              m.el.classList.add('bad'); m.el.querySelector('span').textContent = `${dens}%`; m.el.style.setProperty('--h', String(dens / 100)); storm.lock();
              setInfo('ВЫБЕРИТЕ МАССУ ДЛЯ СКАНА', [`СКАНОВ: ${st.scans}`, `M-${String(i + 1).padStart(2, '0')}: плотность ${dens}% — ${dens > 70 ? 'рядом' : dens > 40 ? 'теплее' : 'пусто'}`]);
              if (st.scans <= 0) fail('Сканы исчерпаны. Следов нет.');
            }
          }, 1100);
        }, terrain);
      }
    }

    // ---------- заставка ----------
    function cutscene() {
      st.stage = 'cut'; clearMarkers(); info.innerHTML = ''; bottom.innerHTML = '';
      terrain.visible = false; orbitParts.forEach((o) => (o.visible = true));
      setOrbit({ target: new THREE.Vector3(), yaw: orb.yaw, pitch: 0.2, dist: 3.6, min: 1.8, max: 7, pmin: -1.35, pmax: 1.35 });
      $('.pr-stage').textContent = 'СПЕКТРОГРАММА';
      const p = document.createElement('p'); p.className = 'pr-rise'; $('.pr-float').appendChild(p);
      const text = 'Это... Осмий. Эта планета богата...';
      let i = 0; const tick = () => { if (i > text.length) return; if (text[i - 1]) sfx.talk(text[i - 1]); p.textContent = text.slice(0, i++); setTimeout(tick, 90); }; setTimeout(tick, 800);
      setTimeout(() => p.classList.add('up'), 4800);
      setTimeout(() => { p.remove(); part2(); }, 9800);
    }

    // ---------- часть 2: захват планеты ----------
    let warCtl = null;
    function part2() {
      st.part2 = true; st.stage = 'war'; info.innerHTML = '';
      warCtl = startWar({
        root, scene, camera, orb, canvas: cv, info, bottom, onSphere,
        setOrbit, marker, clearMarkers, say,
        unmark(m) { m.el.remove(); const i = markers.indexOf(m); if (i >= 0) markers.splice(i, 1); },
        snap() { orbPos(camera.position); orb.look.copy(orb.target); camera.lookAt(orb.look); },
        planet(show) { orbitParts.forEach((o) => (o.visible = show)); },
        flash() { root.classList.remove('pr-cut'); void root.offsetWidth; root.classList.add('pr-cut'); },
        stage(t) { $('.pr-stage').textContent = t; },
        end: (w, text) => end(w, text),
      });
    }

    // ---------- цикл ----------
    let last = performance.now(), raf = 0;
    const tmp = new THREE.Vector3(), want = new THREE.Vector3();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.over) return;
      const paused = !!warCtl?.paused; // открыто окно подтверждения — время войны стоит
      if (!paused) st.t += dt;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      // стихии: облака, ветер, циклоны, позёмка
      clouds.rotation.y += dt * 0.012;
      const wp = windGeo.attributes.position.array;
      wind.forEach((s, i) => {
        s.lon += s.sp * dt;
        const a = onSphere(s.lat, s.lon, 1.07), b = onSphere(s.lat, s.lon - s.len * Math.sign(s.sp), 1.07);
        wp.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      });
      windGeo.attributes.position.needsUpdate = true;
      vortices.forEach((v) => v.rotateZ(dt * v.userData.sp));
      if (terrain.visible) {
        for (let i = 0; i < SN; i++) { let x = snowPos[i * 3] + dt * (1.4 + (i % 7) * 0.2); if (x > 4) x -= 8; snowPos[i * 3] = x; snowPos[i * 3 + 1] += Math.sin(st.t * 3 + i) * dt * 0.1; }
        snowGeo.attributes.position.needsUpdate = true;
        sweep.position.z = ((st.t * 1.2) % 10) - 5;
      }
      scanRing.position.y = Math.sin(st.t * 0.8) * 1.1; scanRing.scale.setScalar(Math.sqrt(Math.max(0.05, 1 - (scanRing.position.y / 1.2) ** 2)));
      holo.rotation.y -= dt * 0.05;
      // помехи
      if (st.stage !== 'zoom' && st.stage !== 'cut' && st.stage !== 'war') {
        if (gl.on > 0) { gl.on -= dt; glitchFrame(); if (gl.on <= 0) { glitchEnd(); gl.next = st.t + 6 + Math.random() * 9; } }
        else if (st.t > gl.next) glitchStart();
      }
      // камера
      if (focus) {
        focus.t = Math.min(1, focus.t + dt / 1.8); const k = focus.t * focus.t * (3 - 2 * focus.t);
        camera.position.lerpVectors(focus.from, focus.to, k); camera.lookAt(focus.look);
        root.style.setProperty('--dive', String(k));
        if (focus.t >= 1) { const f = focus; focus = null; root.style.setProperty('--dive', '0'); f.then(); }
      } else {
        orbPos(want); camera.position.lerp(want, Math.min(1, dt * 8));
        orb.look.lerp(orb.target, Math.min(1, dt * 6)); camera.lookAt(orb.look);
      }
      // маркеры — поверх 3D; на планете прячем обратную сторону
      for (const m of markers) {
        tmp.copy(m.pos); m.parent.localToWorld(tmp);
        const behind = m.parent === planet && (!planet.visible || tmp.dot(camera.position) < tmp.lengthSq() * 1.02);
        tmp.project(camera);
        m.el.style.transform = `translate(${(tmp.x + 1) / 2 * w}px, ${(1 - tmp.y) / 2 * h}px)`;
        m.el.classList.toggle('hidden', behind || tmp.z > 1 || (m.parent === terrain && !terrain.visible));
      }
      // таймеры частей
      if (!st.part2) {
        const left = PART1 - st.t; $('.pr-time').textContent = fmt(left);
        if (left <= 0 && st.stage !== 'cut') fail('Время на разведку вышло.');
      } else {
        const left = TOTAL - st.t; $('.pr-time').textContent = fmt(left);
        warCtl.update(paused ? 0 : dt, dt);
        if (st.over) return;
        if (left <= 0) { const [w0, text] = warCtl.result(); return end(w0, text); }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

    function end(win, text) {
      if (st.over) return; st.over = true; cancelAnimationFrame(raf); hum.stop(); warCtl?.dispose();
      const box = document.createElement('div'); box.className = `pr-end ${win ? 'win' : 'lose'}`; box.textContent = text; root.appendChild(box);
      win ? storm.captured() : storm.alarm();
      setTimeout(() => done(win), 2600);
    }
    const fail = (why) => end(false, why);

    stageAtmo();
    raf = requestAnimationFrame(frame);
    // для автотестов: пропустить разведку сразу к захвату
    root.__skipToWar = () => { clearMarkers(); terrain.visible = false; orbitParts.forEach((o) => (o.visible = true)); part2(); };
    root.__war = () => warCtl?.debug;
    Object.defineProperty(root, '__ctl', { get: () => warCtl, configurable: true });
    return () => { st.over = true; cancelAnimationFrame(raf); hum.stop(); warCtl?.dispose(); renderer.dispose(); };
  },
};
