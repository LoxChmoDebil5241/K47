import * as THREE from 'three';
import { sfx, storm, war as snd, sample, preload, sampleHeavy, ringing } from '../audio.js';
import muzzleUrl from '../assets/muzzle.png';
import TXT from '../story/shield.json';

// спрайты SS14: брызги крови, ошмётки, лужи, искры
const FX = import.meta.glob('../assets/fx/*.png', { eager: true, import: 'default' });

// Глава 10 «Щит» — К-21 держит коридор, пока учёные уходят к челноку. Стиль — как Sierra 7:
// серый мир с жирными контурами, яркие только кровь, свет рейдеров и вспышки.
// 3D: помещение, оружие и руки. 2D: рейдеры, кровь, трассеры, искры.
const DURATION = 60, MAG = 30, SPARE = 1, HP = 100, SCI = 20, RUN = 4.2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default {
  name: 'Щит',
  immersive: true,
  run(root, done) {
    root.classList.add('sh-root');
    root.innerHTML = `<canvas class="sh-3d"></canvas><canvas class="sh-2d"></canvas><canvas class="sh-txt"></canvas>
      <div class="sh-hud"><div class="sh-life"><span>ТЕЛО</span><i><b></b></i></div><span class="sh-time"></span><span class="sh-sci"></span></div>
      <div class="sh-kills"></div><div class="sh-ammo"></div>
      <button class="sh-cover" hidden><i>▼</i> УКРЫТИЕ</button><button class="sh-reload">⟳</button>
      <div class="sh-blood"></div><p class="sh-msg"></p>`;
    const $ = (q) => root.querySelector(q);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const c3 = $('.sh-3d'), c2 = $('.sh-2d'); let g = c2.getContext('2d');
    const timers = [], at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const G = (n) => `guns/${n}`, N = (b, k) => Array.from({ length: k }, (_, i) => `${b}${i + 1}`);
    const SND = ['smg', 'c-20r', 'lmg', 'shotgun', 'rifle', ...N('bullet_meat', 4), ...N('ric', 5), 'smg_magin', 'smg_cock', 'empty', 'casing_fall_1', 'casing_fall_2', 'casing_fall_3', 'lmg_bolt_open', 'lmg_bolt_closed', ...N('gib', 3), 'splat', 'meatslap', 'shotgun_insert', 'lmg_magin', 'bullet_hit', 'minigun', ...N('hull', 5), ...N('blood', 3), ...N('bodyfall', 4), ...N('floor', 5), 'largethud', 'gen_hit', 'bsplash', 'speak_1', 'speak_2', 'speak_1_exclaim', 'speak_2_exclaim', 'speak_1_ask', ...N('malescream_', 6), 'flash_bang'].map(G);
    preload(SND);
    // попадание по нам: мясо пули + иногда хлюп
    const hurt = (v = 1) => { sample(G(`bullet_meat${1 + Math.floor(Math.random() * 4)}`), 1.5 * v) || snd.meat(); if (Math.random() < 0.5) sample(G(pick(['gib1', 'gib2', 'gib3', 'splat', 'meatslap'])), 1.0 * v); };
    const meat = () => sample(G(`bullet_meat${1 + Math.floor(Math.random() * 4)}`), 1.4) || snd.meat();
    // картинки и перекраска белых спрайтов в кровь (светотень сохраняется)
    const img = (u) => { const i = new Image(); i.src = u; return i; }, fx = (n) => img(FX[`../assets/fx/${n}.png`]);
    const POOL = ['splata', 'splatb'].map(fx), SPL = [0, 1, 2, 3, 4, 5].map((k) => fx(`splatter-${k}`)), GIB = [0, 1, 2, 3, 4].map((k) => fx(`gibblet-${k}`)), PUD = [0, 1, 2, 3, 4, 5, 6].map((k) => fx(`splat${k}`));
    const SPARK = fx('sparks'), MUZ = img(muzzleUrl), tints = new Map();
    function tint(i, col) {
      if (!i.complete || !i.naturalWidth) return null;
      const key = i.src + col; let c = tints.get(key); if (c) return c;
      c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(i, 0, 0);
      tints.set(key, c); return c;
    }

    // ---------- 3D коридор: плоские серые материалы + контуры рёбер ----------
    const renderer = new THREE.WebGLRenderer({ canvas: c3, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1a1a); scene.fog = new THREE.Fog(0x1a1a1a, 14, 70);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
    const L = 60, W = 3.4, H = 3;
    const flat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const EDGE = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
    function block(w, h, d, x, y, z, c) {
      const geo = new THREE.BoxGeometry(w, h, d), m = new THREE.Mesh(geo, flat(c)); m.position.set(x, y, z); scene.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), EDGE); m.add(e);
      return m;
    }
    // текстуры SS14: тёмная плитка, стена, плейтинг на потолке, решётка на ящиках
    const texM = (n, rx, ry, c = 0xffffff) => { const t = new THREE.TextureLoader().load(FX[`../assets/fx/${n}.png`]); t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshLambertMaterial({ map: t, color: c }); };
    block(W, 0.1, L, 0, -0.05, -L / 2, 0x6a6a6a).material = texM('floor', W, L);
    block(W, 0.1, L, 0, H + 0.05, -L / 2, 0x4a4a4a).material = texM('plating', W, L, 0x999999);
    const wallM = texM('wall', L / 1.5, H / 1.5);
    block(0.1, H, L, -W / 2, H / 2, -L / 2, 0x8a8a8a).material = wallM;
    block(0.1, H, L, W / 2, H / 2, -L / 2, 0x7e7e7e).material = wallM;
    const crateM = texM('grating', 1, 1, 0xbbbbbb);
    // двери, плинтусы, лампы, трубы — чтобы стены читались
    const doors = [];
    for (let z = -4; z > -L; z -= 6) {
      for (const s of [-1, 1]) {
        doors.push({ m: block(0.06, 2.1, 1, s * (W / 2 - 0.05), 1.05, z, 0x5a5a5a), s, z });
        block(0.04, 0.12, 0.12, s * (W / 2 - 0.1), 1.05, z + 0.35 * s, 0x2a2a2a);
      }
      block(0.5, 0.06, 0.25, 0, H - 0.04, z - 3, 0xeeeeee);
    }
    block(0.14, 0.14, L, -W / 2 + 0.2, H - 0.3, -L / 2, 0x505050);
    block(0.1, 0.1, L, W / 2 - 0.2, H - 0.45, -L / 2, 0x505050);
    block(W, H, 0.2, 0, H / 2, -L, 0x3c3c3c);                  // гермоворота
    block(W * 0.9, 0.1, 0.05, 0, 1.5, -L + 0.13, 0xc9a21a);     // жёлто-чёрная полоса на воротах
    // укрытия рейдеров: ящики, перевёрнутый стол, колонна
    const COVERS = [[-0.95, -30, 1, 1.0], [0.9, -35, 1.2, 1.1], [-0.7, -40, 0.9, 1.1], [0.85, -44, 1, 1], [-0.9, -48, 1.1, 1]];
    for (const [x, z, w, h] of COVERS) block(w, h, 0.6, x, h / 2, z, 0x5e5a52).material = crateM;
    for (const [x, z, w, h, r] of [[0.1, -31.5, 0.7, 0.7, 0.3], [-0.2, -33.2, 0.6, 0.55, -0.2], [1.1, -32.4, 0.6, 0.9, 0.1], [-1.2, -34.4, 0.7, 0.6, 0.4], [0.35, -34.1, 0.5, 1.2, 0]]) { const m = block(w, h, 0.6, x, h / 2, z, 0x595448); m.rotation.y = r; m.material = crateM; }
    block(1.3, H, 0.5, 1.15, H / 2, -0.6, 0x5c5c5c); // угол, за которым укрываемся
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    // коридор сложнее: кабели, решётки вентиляции, ниши, щитки, мусор, лужи; редкие мигающие лампы
    const lampsL = [];
    for (let z = -2; z > -L; z -= 3.2) {
      const s2 = z % 2 ? 1 : -1;
      block(0.03, 0.03, 3.2, s2 * (W / 2 - 0.3), H - 0.12 - Math.random() * 0.2, z - 1.6, 0x202020);
      block(0.5, 0.35, 0.04, -s2 * (W / 2 - 0.04), 0.35, z, 0x3a3a3a);
      if (Math.random() < 0.6) block(0.3 + Math.random() * 0.3, 0.15 + Math.random() * 0.3, 0.3, (Math.random() - 0.5) * W * 0.6, 0.1, z - Math.random() * 2, 0x4a4a4a);
      if (Math.random() < 0.5) block(0.12, 0.5, 0.35, s2 * (W / 2 - 0.1), 1.4, z - 1, 0x2e2e2e);
      const pl = new THREE.PointLight(0xffffff, 0, 6, 1.8); pl.position.set(0, H - 0.3, z); scene.add(pl); lampsL.push(pl);
    }
    for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.3 + Math.random() * 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.9, roughness: 0.05 })); p.rotation.x = -Math.PI / 2; p.position.set((Math.random() - 0.5) * 2, 0.005, -2 - Math.random() * 20); scene.add(p); }
    const gunLight = new THREE.PointLight(0xffffff, 1.5, 2); camera.add(gunLight); gunLight.position.set(0.3, 0.3, 0);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(1, 3, 2); scene.add(sun);


    // ---------- 3D оружие и руки (вид от первого лица, привязаны к камере) ----------
    scene.add(camera);
    const vm = new THREE.Group(); camera.add(vm);
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.3, ...o });
    const BLK = M(0x1c1e1f, { metalness: 0.5 }), DRK = M(0x2c3031), GRN = M(0x3e4c44, { roughness: 0.7 }), GLV = M(0x1a1a1a, { roughness: 0.9 });
    const box = (w, h, d, m, x, y, z, p = vm) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); const e = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), EDGE); b.add(e); return b; };
    const cyl = (r, l, m, x, y, z, p = vm) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); p.add(c); return c; };
    const gunG = new THREE.Group(); vm.add(gunG); gunG.scale.setScalar(0.75);
    // ПП как на референсе: короб, длинный ствол-кожух, рукоять, магазин, планка с прицелом, жёлтая шкала, зелёный диод
    box(0.07, 0.09, 0.42, BLK, 0, 0, -0.1, gunG);
    box(0.055, 0.06, 0.28, DRK, 0, -0.005, -0.42, gunG);
    cyl(0.016, 0.12, BLK, 0, 0.005, -0.61, gunG);
    box(0.04, 0.13, 0.05, DRK, 0, -0.1, 0.02, gunG).rotation.x = -0.25;
    box(0.035, 0.16, 0.06, BLK, 0, -0.12, -0.2, gunG).rotation.x = 0.12;
    box(0.03, 0.05, 0.2, BLK, 0, 0.07, -0.12, gunG);
    cyl(0.022, 0.1, DRK, 0, 0.11, -0.1, gunG);
    box(0.05, 0.08, 0.2, DRK, 0, -0.01, 0.2, gunG);
    const leds = [];
    for (let i = 0; i < 10; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.014), new THREE.MeshBasicMaterial({ color: 0xffd62a })); l.position.set(0.037, 0.03, -0.3 + i * 0.022); gunG.add(l); leds.push(l); }
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0x40ff70 })); led.position.set(0.037, 0, -0.02); gunG.add(led);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => { const t = new THREE.TextureLoader().load(muzzleUrl); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
    flash.position.set(0, 0.005, -0.72); gunG.add(flash);
    const mlight = new THREE.PointLight(0xffc070, 0, 4, 1.5); mlight.position.set(0, 0, -0.8); gunG.add(mlight);
    // руки: бронированные рукава (пластины) и перчатки
    function arm(side, hand) {
      const a = new THREE.Group(); vm.add(a);
      const up = box(0.13, 0.12, 0.4, GRN, 0, 0, 0.2, a);
      box(0.15, 0.05, 0.14, DRK, 0, 0.07, 0.3, a);
      for (let k = 0; k < 3; k++) box(0.14, 0.02, 0.03, DRK, 0, 0.065, 0.05 + k * 0.1, a);
      box(0.09, 0.09, 0.12, GLV, 0, -0.01, -0.05, a);
      for (let k = 0; k < 4; k++) box(0.02, 0.025, 0.05, GLV, -0.035 + k * 0.023, -0.04, -0.1, a);
      a.userData = { side, hand, up }; a.scale.setScalar(0.75);
      return a;
    }
    const armR = arm(1), armL = arm(-1);
    // поставить руку от плеча к кисти
    const tq = new THREE.Vector3(), tq2 = new THREE.Vector3();
    function aimArm(a, shoulder, handLocal) {
      tq.copy(handLocal); gunG.localToWorld(tq); vm.worldToLocal(tq);
      a.position.copy(tq); a.lookAt(tq2.copy(shoulder).applyMatrix4(vm.matrixWorld));
      a.rotateY(Math.PI);
    }
    camera.rotation.order = 'YXZ';
    // свет вспышек рейдеров в коридоре — на каждый выстрел
    const fLight = new THREE.PointLight(0xffc070, 0, 8, 1.6); scene.add(fLight);
    const lit = (x, z, k) => { fLight.position.set(x, 1.3, z + 0.5); fLight.intensity = Math.max(fLight.intensity, k); };

    // ---------- состояние ----------
    const st = {
      t: 0, hp: HP, ammo: MAG, spare: SPARE, slow: 1, hell: false, hellIntro: 0, walk: 0, reload: 0, kills: 0, over: false, recoil: 0, cover: false, coverK: 0,
      aim: { x: 0, y: -0.05 }, fire: false, cool: 0, shake: 0, blood: 0, sci: 0, splats: [], kick: { x: 0, y: 0, r: 0 }, baseZ: 0.1, rushed: false,
      foes: [...COVERS.slice(0, 3).map(([x, z, w, h], i) => { const fx0 = x + (x < 0 ? 0.25 : -0.25); return { i, x: fx0, x0: fx0, z: z - 0.35, cz: z - 0.35, coverH: h, state: 'hide', t: 1 + i * 0.8 + Math.random(), up: 0, hp: 1, flip: x < 0 ? 1 : -1, dead: 0, seed: Math.random(), wpn: ['smg', 'shotgun', 'lmg'][i], shots: 0, fl: 0, flr: 0, run: 0 }; }),
        { i: 3, door: true, x: -1.85, x0: -1.85, z: -16, cz: -999, coverH: 0, state: 'off', t: 0, up: 1, hp: 1, flip: 1, dead: 0, seed: 0.3, wpn: 'rifle', shots: 0, fl: 0, flr: 0, run: 0 }],
    };
    const say = (t, cls = '') => { const m = $('.sh-msg'); m.textContent = t; m.className = `sh-msg on ${cls}`; clearTimeout(say.t); say.t = setTimeout(() => (m.className = 'sh-msg'), 1800); };
    const tmp = new THREE.Vector3();
    const proj = (x, y, z, w, h) => { tmp.set(x, y, z).project(camera); return [(tmp.x + 1) / 2 * w, (1 - tmp.y) / 2 * h, tmp.z]; };

    // ---------- ввод ----------
    const aimAt = (e) => { const r = c2.getBoundingClientRect(); st.aim.x = ((e.clientX - r.left) / r.width) * 2 - 1; st.aim.y = ((e.clientY - r.top) / r.height) * 2 - 1; };
    c2.addEventListener('pointerdown', (e) => { aimAt(e); st.fire = true; c2.setPointerCapture?.(e.pointerId); });
    c2.addEventListener('pointermove', (e) => { if (st.fire || e.pointerType === 'mouse') aimAt(e); });
    const up = () => (st.fire = false); c2.addEventListener('pointerup', up); c2.addEventListener('pointercancel', up);
    const cov = $('.sh-cover');
    const coverOn = (e) => { e.preventDefault(); e.stopPropagation(); if (!st.cover) { st.cover = true; sfx.click(); } };
    const coverOff = (e) => { e?.stopPropagation(); st.cover = false; };
    cov.addEventListener('pointerdown', coverOn); cov.addEventListener('pointerup', coverOff); cov.addEventListener('pointercancel', coverOff); cov.addEventListener('pointerleave', coverOff);
    const reload = () => { if (st.reload > 0 || st.ammo === MAG || st.hell || st.coverK < 0.6) return; if (st.spare <= 0) { sample(G('empty'), 1); return; } st.reload = 1.5; sample(G('lmg_bolt_open'), 1.2); at(550, () => sample(G('smg_magin'), 1.3)); };
    $('.sh-reload').addEventListener('pointerdown', (e) => { e.stopPropagation(); reload(); });
    const kd = (e) => { if (e.key === 'r' || e.key === 'к') reload(); if (e.key === ' ' || e.key === 'Shift') st.cover = e.type === 'keydown'; };
    addEventListener('keydown', kd); addEventListener('keyup', kd);

    // ---------- рейдер на экране: ноги, голова, масштаб и наклон (камера может лежать на боку) ----------
    function foeBox(f, w, h) {
      const away = Math.abs(f.z - f.cz) > 0.8;
      const y0 = f.state === 'vault' ? f.lift || 0 : away ? 0 : -(1 - f.up) * 1.9;
      const [x, yF, nz] = proj(f.x, y0, f.z, w, h), [xH, yH] = proj(f.x, y0 + 1.75, f.z, w, h);
      const ux = xH - x, uy = yH - yF;
      return { x, yF, xH, yH, s: Math.hypot(ux, uy) / 1.75, ang: Math.atan2(ux, -uy), behind: nz > 1, bottom: away ? 1e5 : proj(f.x, f.coverH, f.cz + 0.3, w, h)[1] };
    }
    // точка тела (метры: вбок, вверх) → экран
    const toScr = (b, mx, my) => { const c = Math.cos(b.ang), sn = Math.sin(b.ang), lx = mx * b.s, ly = -my * b.s; return [b.x + lx * c - ly * sn, b.yF + lx * sn + ly * c]; };
    const aimPose = (f) => ['aim', 'fire', 'close', 'finish', 'rush', 'rushPrep'].includes(f.state);
    const muzzlePt = (f, b) => toScr(b, aimPose(f) ? 0.1 : -0.26, aimPose(f) ? 1.35 : 1.42);
    // вспышка дула: спрайт SS14 звездой + ядро
    function muzzle(x, y, size, rot) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.7); rg.addColorStop(0, 'rgba(255,255,235,1)'); rg.addColorStop(0.35, 'rgba(255,200,90,.75)'); rg.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, size * 0.7, 0, 7); g.fill();
      if (MUZ.complete && MUZ.naturalWidth) { g.imageSmoothingEnabled = false; const q = size / 32 * 1.8; for (let k = 0; k < 3; k++) { g.save(); g.rotate(rot + k * 2.09); g.drawImage(MUZ, -9.5 * q, -15.5 * q, 32 * q, 32 * q); g.restore(); } }
      g.restore();
    }
    // рейдер по референсу: чёрный шлем, красные очки, противогаз с красными трубками, тёмная броня,
    // красная полоса света на груди, перчатки: левая светится синим, правая — красным
    function raider(f, s) {
      const P = (pts, fill) => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px * s, -py * s) : g.moveTo(px * s, -py * s))); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
      const E = (x, y, rx, ry, fill) => { g.beginPath(); g.ellipse(x * s, -y * s, rx * s, ry * s, 0, 0, 7); g.fillStyle = fill; g.fill(); g.stroke(); };
      const glow = (x, y, r, rgb, a = 1) => { g.save(); g.globalCompositeOperation = 'lighter'; const rg = g.createRadialGradient(x * s, -y * s, 0, x * s, -y * s, r * s); rg.addColorStop(0, `rgba(${rgb},${a})`); rg.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = rg; g.beginPath(); g.arc(x * s, -y * s, r * s, 0, 7); g.fill(); g.restore(); };
      const limb = (x1, y1, x2, y2, wd, fill) => { const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * wd / 2, ny = dx / L * wd / 2; P([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], fill); };
      const hand = (x, y, blue) => { E(x, y, 0.055, 0.05, '#15161a'); g.fillStyle = blue ? '#8ad0ff' : '#ff5a48'; g.fillRect((x - 0.025) * s, -(y + 0.012) * s, 0.05 * s, 0.024 * s); glow(x, y, 0.14, blue ? '60,150,255' : '255,40,30', 0.9); };
      g.lineWidth = Math.max(1, s * 0.022); g.strokeStyle = '#000'; g.lineJoin = 'round';
      const crouch = (f.state === 'hide' || f.state === 'reload' || f.state === 'peek') && Math.abs(f.z - f.cz) < 0.8 ? 1 : 0, vault = f.state === 'vault' ? f.vk : -1;
      const moving = f.state === 'rush' || f.state === 'walk' || f.state === 'flee', run = moving ? Math.sin(f.run) : 0;
      g.translate(0, -Math.abs(run) * 0.04 * s);
      if (vault >= 0) {                                                            // перекидывает ноги через ящик
        const a = Math.sin(Math.min(1, vault / 0.8) * Math.PI) * 1.35;
        g.save(); g.translate(0, -0.86 * s); g.rotate(-a); g.translate(0, 0.86 * s);
      } else if (crouch) {                                                         // присел: бёдра вперёд, колени согнуты
        for (const sx of [-1, 1]) { const x0 = sx * 0.13; P([[x0 - 0.1, 0], [x0 - 0.11, 0.45], [x0 + 0.1, 0.45], [x0 + 0.09, 0]], '#34373e'); P([[x0 - 0.12, 0.3], [x0 - 0.11, 0.48], [x0 + 0.1, 0.48], [x0 + 0.12, 0.3]], '#4a4e57'); P([[x0 - 0.12, 0], [x0 - 0.11, 0.1], [x0 + 0.1, 0.1], [x0 + 0.12, 0]], '#08080a'); }
        g.translate(0, 0.4 * s); g.rotate(0.08 * f.flip);
      }
      for (const [sx, k] of (crouch && vault < 0 ? [] : [[-1, 1], [1, -1]])) {       // ноги: на бегу колени по очереди вверх
        const l = Math.max(0, k * run) * 0.22, x0 = sx * 0.12;
        P([[x0 - 0.1, 0.1 + l], [x0 - 0.11, 0.86], [x0 + 0.1, 0.86], [x0 + 0.09, 0.1 + l]], '#34373e');
        P([[x0 - 0.1, 0.44 + l * 0.6], [x0 - 0.1, 0.57 + l * 0.5], [x0 + 0.09, 0.57 + l * 0.5], [x0 + 0.09, 0.44 + l * 0.6]], '#4a4e57');
        P([[x0 - 0.12, l], [x0 - 0.11, 0.12 + l], [x0 + 0.1, 0.12 + l], [x0 + 0.12, l]], '#08080a');
      }
      if (vault >= 0) g.restore();
      P([[-0.25, 0.82], [-0.25, 0.93], [0.25, 0.93], [0.25, 0.82]], '#111214');
      for (const px of [-0.18, 0.1]) P([[px, 0.8], [px, 0.9], [px + 0.08, 0.9], [px + 0.08, 0.8]], '#1e2024');
      P([[-0.25, 0.92], [-0.3, 1.46], [0.3, 1.46], [0.25, 0.92]], '#3a3d45');     // торс
      P([[-0.21, 1.1], [-0.24, 1.44], [0.24, 1.44], [0.21, 1.1]], '#4b4f58');     // нагрудник
      g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-0.17 * s, -(0.97 + k * 0.045) * s); g.lineTo(0.17 * s, -(0.97 + k * 0.045) * s); } g.stroke();
      g.fillStyle = '#ff3020'; g.fillRect(-0.15 * s, -1.24 * s, 0.3 * s, 0.035 * s); glow(0, 1.225, 0.24, '255,40,20', 0.55); // полоса света
      if (f.back) { P([[-0.2, 1.0], [-0.2, 1.4], [0.2, 1.4], [0.2, 1.0]], '#2a2c31'); E(0, 1.655, 0.15, 0.16, '#101114'); for (const sx of [-1, 1]) E(sx * 0.31, 1.44, 0.1, 0.075, '#454850'); limb(-0.3, 1.42, -0.36, 1.05, 0.1, '#3c3f46'); limb(0.3, 1.42, 0.36, 1.05, 0.1, '#3c3f46'); return; }  // со спины: ранец, затылок
      // голова: шлем, красные очки, противогаз, трубки
      P([[-0.06, 1.46], [-0.06, 1.52], [0.06, 1.52], [0.06, 1.46]], '#111');
      E(0, 1.655, 0.15, 0.16, '#101114');
      P([[-0.17, 1.6], [-0.17, 1.7], [-0.13, 1.7], [-0.13, 1.6]], '#1b1c20'); P([[0.13, 1.6], [0.13, 1.7], [0.17, 1.7], [0.17, 1.6]], '#1b1c20');
      P([[-0.13, 1.645], [-0.13, 1.69], [0.13, 1.69], [0.13, 1.645]], '#08080a');
      for (const ex of [-0.055, 0.055]) { E(ex, 1.667, 0.042, 0.038, '#2a0000'); g.fillStyle = '#ff2a20'; g.beginPath(); g.ellipse(ex * s, -1.667 * s, 0.028 * s, 0.025 * s, 0, 0, 7); g.fill(); glow(ex, 1.667, 0.1, '255,30,20', 0.8); }
      P([[-0.1, 1.625], [-0.085, 1.54], [0, 1.5], [0.085, 1.54], [0.1, 1.625]], '#0c0d0f');
      E(0, 1.535, 0.04, 0.036, '#1d1f24'); E(-0.088, 1.555, 0.026, 0.026, '#16171b'); E(0.088, 1.555, 0.026, 0.026, '#16171b');
      g.save(); g.lineWidth = Math.max(1.2, s * 0.022); g.strokeStyle = '#a50e0e';
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.088 * s, -1.53 * s); g.bezierCurveTo(sx * 0.17 * s, -1.46 * s, sx * 0.21 * s, -1.38 * s, sx * 0.13 * s, -1.3 * s); g.stroke(); }
      g.restore();
      for (const sx of [-1, 1]) glow(sx * 0.19, 1.41, 0.05, '255,50,30', 0.8);
      // руки и оружие
      const W = { smg: 0.07, shotgun: 0.06, lmg: 0.11, rifle: 0.07 }[f.wpn];
      if (aimPose(f)) {
        // ствол на нас: видим торец, приклад у правого плеча
        limb(0.3, 1.42, 0.36, 1.2, 0.1, '#3c3f46'); limb(0.36, 1.2, 0.17, 1.27, 0.09, '#33363c');
        limb(-0.3, 1.42, -0.27, 1.22, 0.1, '#3c3f46'); limb(-0.27, 1.22, 0.03, 1.31, 0.09, '#33363c');
        P([[0.02, 1.28], [0.02, 1.42], [0.24, 1.42], [0.24, 1.28]], '#0d0e10');
        if (f.wpn === 'lmg') P([[0.06, 1.12], [0.06, 1.28], [0.2, 1.28], [0.2, 1.12]], '#15161a');
        E(0.1, 1.35, W * 0.55, W * 0.55, '#1a1b1f'); g.fillStyle = '#000'; g.beginPath(); g.arc(0.1 * s, -1.35 * s, W * 0.25 * s, 0, 7); g.fill();
        hand(0.03, 1.31, true); hand(0.17, 1.27, false);
      } else {
        const rl = f.state === 'reload', dy = rl ? -0.2 : 0;
        limb(0.3, 1.42, 0.36, 1.18, 0.1, '#3c3f46'); limb(0.36, 1.18, 0.14, 1.1 + dy, 0.09, '#33363c');
        limb(-0.3, 1.42, -0.33, 1.2, 0.1, '#3c3f46'); limb(-0.33, 1.2, rl ? -0.05 : -0.1, rl ? 1.0 : 1.28, 0.09, '#33363c');
        limb(0.27, 1.0 + dy, -0.26, 1.42 + dy, W, '#0d0e10');
        if (rl) P([[-0.09, 0.92], [-0.09, 1.04], [-0.02, 1.04], [-0.02, 0.92]], '#222');
        hand(rl ? -0.05 : -0.1, rl ? 1.0 : 1.28, true); hand(0.14, 1.1 + dy, false);
      }
      for (const sx of [-1, 1]) E(sx * 0.31, 1.44, 0.1, 0.075, '#454850');
      if (vault >= 0 && vault < 0.75) { const hy = f.coverH - (f.lift || 0) + 0.04; limb(-0.3, 1.42, -0.42, hy, 0.09, '#33363c'); hand(-0.42, hy, true); }       // наплечники
      if (f.fl > 0.25) { const [mx, my] = aimPose(f) ? [0.1, 1.35] : [-0.26, 1.42]; muzzle(mx * s, -my * s, Math.max(10, s * 0.9) * (0.8 + f.fl * 0.4), f.flr); }
    }
    function drawFoe(f, w, h) {
      if (f.state === 'off' || (f.state === 'hide' && f.up < 0.03 && !f.dead)) return;
      if (f.dead > 0.6) return;
      const b = foeBox(f, w, h); if (b.behind || !(b.s > 0.5)) return;
      g.save();
      if (b.bottom < 1e5) { g.beginPath(); g.rect(-w, -h, w * 3, b.bottom + h); g.clip(); }
      g.translate(b.x, b.yF); g.rotate(b.ang);
      // убит — падает назад: сжимается к ногам и пропадает
      if (f.dead) { const k = Math.min(1, f.dead / 0.45); g.globalAlpha = Math.max(0, 1 - Math.max(0, f.dead - 0.4) / 0.2); g.rotate(-k * 0.2 * f.flip); g.scale(1, Math.max(0.12, 1 - k * 0.88)); }
      raider(f, b.s);
      g.restore();
    }

    // ---------- кровь, искры, трассеры ----------
    const gore = [];
    function bleed(f, my, head, kill) {
      const base = { cz: Math.abs(f.z - f.cz) > 0.8 ? null : f.cz, ch: f.coverH };
      gore.push({ ...base, k: 'spray', x: f.x, y: my, z: f.z - 0.25, sz: head ? 0.8 : 0.55, t: 0, life: 0.45, im: pick(SPL), rot: Math.random() * 6.3 });
      gore.push({ ...base, k: 'mist', x: f.x, y: my, z: f.z + 0.1, sz: head ? 0.45 : 0.3, t: 0, life: 0.3 });
      for (let i = 0; i < (head ? 9 : 5); i++) gore.push({ ...base, k: 'drop', x: f.x, y: my, z: f.z, vx: (Math.random() - 0.5) * 2.4, vy: Math.random() * 2.6, vz: (Math.random() - 0.6) * 2.4, sz: 0.02 + Math.random() * 0.04, t: 0, life: 5 });
      if (kill || head) for (let i = 0; i < (kill ? 4 : 2); i++) gore.push({ ...base, k: 'gib', im: pick(GIB), x: f.x, y: my, z: f.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.6) * 3, sz: 0.2, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, t: 0, life: 7 });
      if (kill) gore.push({ ...base, k: 'pool', rot: Math.random() * 6, x: f.x, y: 0.01, z: f.z, sz: 0.1, grow: 0.9, im: pick(PUD), t: 0, life: 16 });
      if (gore.length > 180) gore.splice(0, gore.length - 180);
    }
    // картинка, лежащая на полу: 4 угла в мир → экран, два аффинных треугольника
    function tri(im, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
      g.save(); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.clip();
      const d = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
      const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / d, b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / d;
      const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / d, e = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / d;
      const f = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / d, h = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / d;
      g.transform(a, b, c, e, f, h); g.drawImage(im, 0, 0); g.restore();
    }
    function floorImg(im, x, z, r, rot, alpha, w, h) {
      if (!im) return;
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const px = x + (u * Math.cos(rot) - v * Math.sin(rot)) * r, pz = z + (u * Math.sin(rot) + v * Math.cos(rot)) * r; return proj(px, 0.006, pz, w, h); });
      if (cs.some((q) => q[2] > 1)) return;
      const S = im.width; g.save(); g.globalAlpha = alpha; g.imageSmoothingEnabled = true;
      tri(im, cs[0][0], cs[0][1], cs[1][0], cs[1][1], cs[2][0], cs[2][1], 0, 0, S, 0, S, S);
      tri(im, cs[0][0], cs[0][1], cs[2][0], cs[2][1], cs[3][0], cs[3][1], 0, 0, S, S, 0, S);
      g.restore();
    }
    function drawGore(dt, w, h) {
      const cy = camera.position.y;
      for (const p of gore) {
        p.t += dt;
        if (p.vx !== undefined && p.y > 0.006) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 9.8 * dt; if (p.vr) p.rot += p.vr * dt; if (p.y <= 0.006) { p.y = 0.006; p.vx = p.vz = 0; if (p.k === 'drop') p.k = 'spot'; } }
        const [x, y, nz] = proj(p.x, p.y, p.z, w, h); if (nz > 1) continue;
        const [xu, yu] = proj(p.x, p.y + 1, p.z, w, h), pm = Math.hypot(xu - x, yu - y), ang = Math.atan2(xu - x, y - yu);
        const a = Math.max(0, 1 - Math.max(0, p.t - p.life * 0.7) / (p.life * 0.3));
        g.save();
        if (p.cz != null && p.z < p.cz + 0.35) { g.beginPath(); g.rect(-w, -h, w * 3, proj(p.x, p.ch, p.cz + 0.3, w, h)[1] + h); g.clip(); }
        g.translate(x, y); g.rotate(ang); g.globalAlpha = a;
        const flat = Math.max(0.06, Math.min(1, cy / Math.max(0.5, Math.hypot(p.z - camera.position.z, p.x - camera.position.x))));
        if (p.k === 'spray') { const k = Math.min(1, p.t / 0.12), im = tint(p.im, '#b00c0c'), r = p.sz * pm * (0.5 + k * 0.6); if (im) { g.rotate(p.rot); g.drawImage(im, -r, -r, r * 2, r * 2); } }
        else if (p.k === 'mist') { const r = p.sz * pm * (0.6 + p.t * 3), rg = g.createRadialGradient(0, 0, 0, 0, 0, r); rg.addColorStop(0, 'rgba(170,10,10,.8)'); rg.addColorStop(1, 'rgba(120,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); }
        else if (p.k === 'drop') { g.fillStyle = '#8a0606'; g.beginPath(); g.arc(0, 0, Math.max(1, p.sz * pm), 0, 7); g.fill(); }
        else if (p.k === 'spot') { g.fillStyle = '#5e0404'; g.beginPath(); g.ellipse(0, 0, Math.max(1, p.sz * pm * 1.6), Math.max(0.5, p.sz * pm * 1.6 * flat), 0, 0, 7); g.fill(); }
        else if (p.k === 'gib') { const im = tint(p.im, '#9a1010'), r = p.sz * pm; if (im) { g.rotate(p.rot); g.drawImage(im, -r, -r, r * 2, r * 2); } }
        else if (p.k === 'pool') {
          g.restore(); const R0 = p.sz + p.grow * Math.min(1, p.t / (p.slow || 4));
          p.parts ??= Array.from({ length: 5 }, (_, k) => ({ im: k < 2 ? pick(POOL) : pick(SPL), dx: (Math.random() - 0.5) * 0.9, dz: (Math.random() - 0.5) * 0.9, r: k < 2 ? 0.8 : 0.45 + Math.random() * 0.3, rot: Math.random() * 6.3, c: k < 2 ? '#5a0303' : '#7a0808' }));
          for (const q of p.parts) floorImg(tint(q.im, q.c), p.x + q.dx * R0, p.z + q.dz * R0, R0 * q.r, q.rot, a * 0.85, w, h);
          continue;
        }
        g.restore();
      }
      for (let i = gore.length - 1; i >= 0; i--) if (gore[i].t > gore[i].life) gore.splice(i, 1);
    }
    // кровь на «стекле»: брызги SS14 крупно, капли, потёки, блик; медленно сходят
    const screenBlood = [];
    function splatScreen(k = 1, full = false) {
      const w = c2.clientWidth, h = c2.clientHeight, S = Math.min(w, h) / 390, r = (50 + Math.random() * (full ? 110 : 60)) * k * S;
      // обычные попадания — только по краям; весь экран — от пулемёта
      const ex = Math.random() < 0.5 ? Math.random() * w * 0.16 : w * (0.84 + Math.random() * 0.16), ey = Math.random() < 0.5 ? Math.random() * h : (Math.random() < 0.5 ? Math.random() * h * 0.12 : h * (0.88 + Math.random() * 0.12));
      screenBlood.push({ fade: full ? 0.045 : 0.11, x: full ? Math.random() * w : ex, y: full ? Math.random() * h * 0.85 : ey, r, im: pick(SPL), rot: Math.random() * 6.3, a: 1,
        drips: Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({ dx: (Math.random() - 0.5) * r * 0.6, len: 0, max: r * (0.5 + Math.random() * 1.8), v: 10 + Math.random() * 25, w: (2 + Math.random() * 3) * S })),
        dots: Array.from({ length: 5 + Math.floor(Math.random() * 8) }, () => [(Math.random() - 0.5) * r * 2.6, (Math.random() - 0.5) * r * 2.2, (1.5 + Math.random() * 5) * S]) });
      if (screenBlood.length > 18) screenBlood.shift();
    }
    function drawScreenBlood(dt) {
      for (const b of screenBlood) {
        b.a -= dt * b.fade; const A = Math.max(0, Math.min(1, b.a * 1.3));
        const dark = tint(b.im, '#3a0000'), main = tint(b.im, '#9c0c0c');
        g.save(); g.globalAlpha = A * 0.92; g.imageSmoothingEnabled = true; g.translate(b.x, b.y); g.rotate(b.rot);
        if (dark) g.drawImage(dark, -b.r + 2, -b.r + 3, b.r * 2, b.r * 2);
        if (main) g.drawImage(main, -b.r, -b.r, b.r * 2, b.r * 2);
        g.restore();
        g.fillStyle = `rgba(100,0,0,${A * 0.85})`;
        for (const [dx, dy, rr] of b.dots) { g.beginPath(); g.arc(b.x + dx, b.y + dy, rr, 0, 7); g.fill(); }
        for (const d of b.drips) { d.len += d.v * dt * Math.max(0, 1 - d.len / d.max); const x = b.x + d.dx; g.fillRect(x - d.w / 2, b.y, d.w, d.len); g.beginPath(); g.arc(x, b.y + d.len, d.w * 0.9, 0, 7); g.fill(); }
        g.fillStyle = `rgba(255,170,170,${A * 0.16})`; g.beginPath(); g.ellipse(b.x - b.r * 0.15, b.y - b.r * 0.2, b.r * 0.12, b.r * 0.05, -0.5, 0, 7); g.fill();
      }
      for (let i = screenBlood.length - 1; i >= 0; i--) if (screenBlood[i].a <= 0) screenBlood.splice(i, 1);
    }
    const sparks = [];
    const spark = (x, y, sz) => sparks.push({ x, y, sz, t: 0, rot: Math.random() * 6.3 });
    function drawSparks(dt) {
      if (!SPARK.complete || !SPARK.naturalWidth) return;
      g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = false;
      for (const p of sparks) { p.t += dt; const fr = Math.floor(p.t / 0.05); if (fr > 9) continue; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(SPARK, fr * 32, 0, 32, 32, -p.sz / 2, -p.sz / 2, p.sz, p.sz); g.restore(); }
      g.restore();
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t > 0.5) sparks.splice(i, 1);
    }
    const tracers = [];
    const tracer = (x1, y1, x2, y2, c) => tracers.push({ x1, y1, x2, y2, c, t: 0 });
    function drawTracers(dt) {
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      for (const q of tracers) {
        q.t += dt; const k = q.t / 0.09, a = Math.max(0, 1 - k), hx = q.x1 + (q.x2 - q.x1) * Math.min(1, k * 1.4), hy = q.y1 + (q.y2 - q.y1) * Math.min(1, k * 1.4);
        const tx = q.x1 + (q.x2 - q.x1) * Math.max(0, k * 1.4 - 0.5), ty = q.y1 + (q.y2 - q.y1) * Math.max(0, k * 1.4 - 0.5);
        g.strokeStyle = `rgba(${q.c},${a})`; g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
        g.strokeStyle = `rgba(255,255,240,${a})`; g.lineWidth = 1; g.stroke();
      }
      for (let i = tracers.length - 1; i >= 0; i--) if (tracers[i].t > 0.09) tracers.splice(i, 1);
      g.globalCompositeOperation = 'source-over';
    }

    // ---------- реплики: по одной над рейдером, длинные — в несколько строк ----------
    const shouts = [];
    function shout(f, kind, force = false, text = null) {
      if (shouts.some((q) => q.f === f)) return;
      if (shouts.length >= 2) { if (!force) return; shouts.shift(); }
      shouts.push({ f, text: text || pick(TXT.raiders[kind]), t: 0, heard: false, screen: kind === 'screen' });
    }
    function wrap(t, maxW) { const out = []; let cur = ''; for (const wd of t.split(' ')) { const n = cur ? `${cur} ${wd}` : wd; if (cur && g.measureText(n).width > maxW) { out.push(cur); cur = wd; } else cur = n; } if (cur) out.push(cur); return out; }
    const c4 = root.querySelector('.sh-txt'), urge = document.createElement('div'); urge.className = 'sh-urge'; root.appendChild(urge);
    function drawShouts(dt, w, h) {
      const g0 = g; g = c4.getContext('2d'); if (c4.width !== c2.width) { c4.width = c2.width; c4.height = c2.height; } g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); try { shoutsIn(dt, w, h); } finally { g = g0; }
    }
    function shoutsIn(dt, w, h) {
      for (const q of shouts) {
        if (q.f.up < 0.6 && !q.f.dead && !st.hell) continue;          // пока не высунулся — молчит
        if (!q.heard) { q.heard = true; sample(G(pick(['speak_1_exclaim', 'speak_2_exclaim', 'speak_1', 'speak_2', 'speak_1_ask'])), 0.9, 0.8 + Math.random() * 0.4); }
        q.t += dt; const b = q.screen ? { xH: w / 2, yH: h * 0.3 + 12, yF: h, s: 120 } : foeBox(q.f, w, h); if (b.behind) continue;
        if (!q.screen && (q.f.state === 'off' || q.f.dead > 0.6 || b.xH < 0 || b.xH > w || b.yH > h || b.yF < 0 || (st.coverK > 0.5 && b.xH > proj(0.5, 1, -0.35, w, h)[0]))) continue;   // рейдера не видно — нет и текста
        const a = Math.min(1, (2.6 - q.t) * 2, q.t * 8), pop = 1, jx = 0, jy = 0;
        const fs = Math.round(Math.max(10, Math.min(16, b.s * 0.13)) * pop);
        g.globalAlpha = Math.max(0, a); g.font = `${fs}px "Press Start 2P", monospace`; g.textAlign = 'center';
        const lines = wrap(q.text, Math.max(130, Math.min(w * 0.32, 240))), top = Math.min(b.yH, b.yF) - 12 - q.t * 10;
        lines.forEach((ln, k) => {
          const y = top - (lines.length - 1 - k) * fs * 1.5, x = Math.max(80, Math.min(w - 80, b.xH));
          g.fillStyle = '#000'; g.fillText(ln, x + 2 + jx, y + 2 + jy); g.fillStyle = '#ff2a2a'; g.fillText(ln, x + jx, y + jy);
        });
        g.globalAlpha = 1;
      }
      for (let i = shouts.length - 1; i >= 0; i--) if (shouts[i].t > 2.6) shouts.splice(i, 1);
    }

    // ---------- стрельба ----------
    function shoot() {
      if (st.reload > 0 || st.coverK > 0.3 || st.hellIntro > 0) return;
      if (st.ammo <= 0) { sample(G('empty'), 1); reload(); return; }
      st.ammo--; st.recoil = 1; st.cool = 0.13; st.flash = 1; st.shake = Math.max(st.shake, st.hell ? 0.5 : 0.15);
      st.kick.y += 0.007; st.kick.x += (Math.random() - 0.5) * 0.008;
      sample(G('smg'), 1.6) || snd.loud('smg');
      if (Math.random() < 0.3) at(250, () => sample(G(`casing_fall_${1 + Math.floor(Math.random() * 3)}`), 0.5));
      const w = c2.clientWidth, h = c2.clientHeight, sx = (st.aim.x + 1) / 2 * w, sy = (st.aim.y + 1) / 2 * h;
      tracer(w * 0.56, h * 0.72, sx + (Math.random() - 0.5) * 8, sy + (Math.random() - 0.5) * 8, '255,210,120');
      let best = null;
      for (const f of [...st.foes, st.fin].filter((f) => f && !f.dead && f.up > 0.4).sort((a, b) => b.z - a.z)) {
        const b = foeBox(f, w, h); if (b.behind || sy > b.bottom) continue;
        const dx = sx - b.x, dy = sy - b.yF, c = Math.cos(b.ang), sn = Math.sin(b.ang), mx = (dx * c + dy * sn) / b.s, my = (dx * sn - dy * c) / b.s;
        if (Math.abs(mx) < 0.32 && my > 0 && my < 1.85) { best = { f, my, head: my > 1.5 }; break; }
      }
      if (best) {
        const { f, my, head } = best; f.hp -= head ? 0.5 : 0.18; meat();
        const kill = f.hp <= 0;
        const away = Math.abs(f.z - f.cz) > 0.8;
        bleed(f, my + (away ? 0 : -(1 - f.up) * 1.9), head, kill);
        if (kill) { f.dead = 0.001; st.kills++; if (head) sample(G('splat'), 1.1); if (Math.random() < 0.4) shout(f, 'down'); snd.fall(); }
      } else { spark(sx, sy, 34); st.splats.push({ x: sx, y: sy, r: 3, dust: 1, t: 0 }); sample(Math.random() < 0.6 ? G('bullet_hit') : G(`ric${1 + Math.floor(Math.random() * 5)}`), 0.9); }
    }
    // выстрел рейдера: звук, вспышка, свет и трассер — в один момент; мимо — искры у стены рядом с нами
    function foeShot(f, w, h, acc) {
      const b = foeBox(f, w, h), [mx, my] = muzzlePt(f, b);
      f.fl = 1; f.flr = Math.random() * 6;
      const near = Math.max(0, 1 - (camera.position.z - f.z) / 40);
      sample(G({ smg: 'c-20r', shotgun: 'shotgun', lmg: 'lmg', rifle: 'rifle' }[f.wpn]), 1.0 + near * 0.8, 0.95) || snd.loud('smg');
      const hitUs = st.coverK < 0.5 && st.hellIntro <= 0 && Math.random() < acc;
      const side = Math.random() < 0.5, tx = hitUs ? w * (0.3 + Math.random() * 0.4) : (st.coverK > 0.5 ? w * (0.7 + Math.random() * 0.25) : side ? Math.random() * w * 0.12 : w * (0.88 + Math.random() * 0.12));
      const ty = hitUs ? h * (0.55 + Math.random() * 0.4) : h * (0.1 + Math.random() * 0.85);
      tracer(mx, my, tx, ty, '255,170,80');
      at(60, () => { if (st.over) return; if (hitUs) wound(3 + Math.random() * 3); else { spark(tx, ty, 60 + Math.random() * 30); if (Math.random() < 0.7) sample(Math.random() < 0.6 ? G('bullet_hit') : G(`ric${1 + Math.floor(Math.random() * 5)}`), 0.7); } });
    }
    function wound(d) {
      st.hp -= d; st.shake = 1; st.blood = 1; st.flash = 1; hurt(); splatScreen();
      st.kick.x += (Math.random() < 0.5 ? -1 : 1) * 0.035; st.kick.r += (Math.random() - 0.5) * 0.05;
    }

    // рывок: двое выбегают из-за укрытий прямо на нас
    function startRush() {
      st.rushed = true; st.rushT = st.t;
      st.foes.filter((f) => !f.dead && !f.door).slice(0, 2).forEach((f, k) => { f.state = 'rushPrep'; f.t = 0.5 + k * 0.8; f.lane = k ? 0.4 : -0.4; f.hp = 1; if (!k) shout(f, 'rush', true); });
      at(450, () => sample(G('speak_2_exclaim'), 1));
    }
    function rushStep(f, dt, w, h) {
      f.up = 1; const stopZ = st.baseZ - 3.4;
      if (f.state === 'rush') {
        f.z += dt * RUN; f.run += dt * 12;
        f.x += (Math.max(-1.2, Math.min(1.2, f.lane + Math.sin(f.z * 0.9 + f.seed * 6) * 0.55)) - f.x) * Math.min(1, dt * 3);
        if ((f.stepT = (f.stepT || 0) - dt) <= 0) { f.stepT = 0.27; sample(G(`floor${1 + Math.floor(Math.random() * 5)}`), Math.max(0.15, 1.3 - (st.baseZ - f.z) / 25)); }
        if (f.z >= stopZ) { f.z = stopZ; f.state = 'close'; f.shot = 0.25; }
      }
      f.shot = (f.shot ?? 0.4) - dt;
      if (f.shot <= 0) { foeShot(f, w, h, f.state === 'close' ? 0.45 : 0.12); f.shot = f.state === 'close' ? 0.2 : 0.38; }
    }
    // прыжок через ящик: хват рукой, подъём, ноги перекидываются, приземление перед укрытием
    function vaultStep(f, dt) {
      f.vk = (f.vk || 0) + dt; const k = f.vk;
      if (k < 0.25) f.lift = f.coverH * 0.7 * (k / 0.25);
      else if (k < 0.7) { f.lift = f.coverH * (0.7 + 0.3 * Math.sin((k - 0.25) / 0.45 * Math.PI)); f.z = f.cz + (k - 0.25) / 0.45 * 0.9; }
      else { f.lift = Math.max(0, f.coverH * (1 - (k - 0.7) / 0.2)); f.z = f.cz + 0.9 + (k - 0.7) * 1.5; }
      if (k > 0.25 && !f.grab) { f.grab = true; sample(G('gen_hit'), 0.6); }
      if (k >= 0.9) { f.lift = 0; f.vk = 0; f.grab = false; f.z = f.cz + 1.2; sample(G('floor1'), 1); return true; }
      return false;
    }
    const respawn = (f) => { if (f.door) { f.dead = 0; f.state = 'off'; return; } f.dead = 0; f.hp = 1; f.state = 'hide'; f.up = 0; f.z = f.cz; f.x = f.x0; f.t = 2 + Math.random() * 3; };

    // «И ГРЯНУЛ АД»: затемнение, медленная надпись, выход из-за угла, контраст, рейдеры бегут
    function startHell() {
      st.hellIntro = 5.5; st.hellEnd = performance.now() + 5500; hum.set(0.6);
      for (const f of st.foes) if (['rush', 'close', 'rushPrep', 'vault', 'doorOut'].includes(f.state)) { f.state = 'flee'; f.lift = 0; }
      const t = document.createElement('div'); t.className = 'sh-hell'; t.textContent = TXT.hell; root.appendChild(t);
      at(400, () => t.classList.add('on')); at(4600, () => t.classList.add('off')); at(6000, () => t.remove());
      sample(G('lmg_bolt_closed'), 1.5);
    }
    // финал: джаггернаут с одним большим щитком и пулемётом
    function juggernaut() {
      st.jug = { t0: performance.now(), t: 0, z: st.baseZ - st.walk - 26, fire: 0, fl: 0, flr: 0 }; st.cover = false; cov.hidden = true; st.fire = false;
      st.foes.forEach((f) => { if (!f.dead) { f.state = f.door ? 'off' : 'hide'; f.z = f.cz; f.x = f.x0; } });
    }
    function jugBox(w, h) {
      const J = st.jug, [x, yF, nz] = proj(0.2, 0, J.z, w, h), [xH, yH] = proj(0.2, 2.1, J.z, w, h);
      return { x, yF, s: Math.hypot(xH - x, yH - yF) / 2.1, ang: Math.atan2(xH - x, yF - yH), behind: nz > 1 };
    }
    function drawJug(w, h) {
      const J = st.jug, b = jugBox(w, h), s = b.s; if (b.behind || !(s > 1)) return;
      g.save(); g.translate(b.x, b.yF); g.rotate(b.ang); g.lineWidth = Math.max(1.5, s * 0.03); g.strokeStyle = '#000'; g.lineJoin = 'round';
      const P = (pts, c) => { g.beginPath(); pts.forEach(([a, bb], i) => (i ? g.lineTo(a * s, -bb * s) : g.moveTo(a * s, -bb * s))); g.closePath(); g.fillStyle = c; g.fill(); g.stroke(); };
      g.save(); g.scale(1.3, 1.2); raider({ state: 'fire', wpn: 'lmg', flip: 1, fl: 0, run: 0, z: 0, cz: 99, coverH: 0 }, s); g.restore();
      for (const sx of [-1, 1]) P([[sx * 0.62, 1.62], [sx * 0.56, 1.86], [sx * 0.26, 1.86], [sx * 0.3, 1.58]], '#2b2d33');   // тяжёлые наплечники
      P([[-0.23, 1.86], [-0.24, 2.12], [0.24, 2.12], [0.23, 1.86]], '#c00');             // один большой щиток вместо очков и маски
      g.save(); g.globalCompositeOperation = 'lighter'; const rg = g.createRadialGradient(0, -1.95 * s, 0, 0, -1.95 * s, 0.5 * s); rg.addColorStop(0, 'rgba(255,30,20,.7)'); rg.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0, -1.95 * s, 0.5 * s, 0, 7); g.fill(); g.restore();
      P([[-0.1, 1.28], [-0.1, 1.45], [0.9, 1.4], [0.9, 1.3]], '#0b0b0c');                // пулемёт
      P([[0.1, 1.1], [0.1, 1.3], [0.35, 1.3], [0.35, 1.1]], '#151517');
      if (J.fl > 0.25) muzzle(0.95 * s, -1.35 * s, Math.max(14, s * 1.4), J.flr);
      g.restore();
    }
    function jugFrame(dt, now, w, h) {
      const J = st.jug; J.t = (now - J.t0) / 1000; J.fl = Math.max(0, J.fl - dt * 20);
      J.z = Math.min(J.z, st.baseZ - st.walk - 18);
      if (J.fl > 0) lit(0.9, J.z, J.fl * 12);
      if (J.t < 2.2) { J.z += dt * 0.6; if ((J.step = (J.step || 0) - dt) <= 0) { J.step = 0.55; snd.heart?.(); st.shake = 0.6; } }
      else if (J.t < 4.2) {
        st.slow = 0.35;
        if ((J.b = (J.b || 0) - dt) <= 0) {
          J.b = 0.07; J.fl = 1; J.flr = Math.random() * 6;
          const b = jugBox(w, h), c = Math.cos(b.ang), sn = Math.sin(b.ang), lx = 0.95 * b.s, ly = -1.35 * b.s, mx = b.x + lx * c - ly * sn, my = b.yF + lx * sn + ly * c;
          for (let k = 0; k < 2; k++) tracer(mx, my, w * Math.random(), h * (0.5 + Math.random() * 0.6), '255,120,60');
          sampleHeavy(G('minigun'), 5, 2) || sampleHeavy(G('lmg'), 5, 2);
          st.shake = 1.4; st.blood = 1; st.flash = 1; st.hp -= 4; st.kick.x += (Math.random() - 0.5) * 0.06; if (Math.random() < 0.5) hurt(); splatScreen(1, true);
        }
      } else if (!st.fall) startFall(now);
    }

    // ---------- падение (камерой), шаги, «Добить», ещё выстрелы ----------
    const UPL = new THREE.Vector3(-0.98, 0.15, 0).normalize();
    function startFall(now) {
      st.fall = { t0: now, x: camera.position.x, y: camera.position.y, z: camera.position.z, jy: 0, jr: 0, cy: 0, cr: 0 };
      st.slow = 1; vm.visible = false; st.fire = false;
      sample(G('flash_bang'), 1.2); ringing(9); sample(G('splat'), 1.4);
      root.classList.add('fall');
      at(420, () => { sample(G('bodyfall1'), 1.5); sample(G('largethud'), 0.9); st.shake = 1.2; });
      at(640, () => { sample(G('bodyfall3'), 1.1); st.shake = 0.6; });
      at(800, () => sample(G('bodyfall2'), 0.7));
      at(1200, () => gore.push({ k: 'pool', x: st.fall.x + 0.2, y: 0.006, z: st.fall.z - 1.7, sz: 0.15, grow: 1.1, slow: 9, rot: 0.7, im: pick(PUD), t: 0, life: 60, cz: null }));
      at(2600, () => { const [a, b] = st.foes; for (const f of [a, b]) { f.dead = 0; f.z = f.cz; f.x = f.x0; f.state = 'peek'; f.up = 0; } });
      at(3300, () => shout(st.foes[0], 'x', true, TXT.dead));
      at(4700, () => shout(st.foes[1], 'x', true, TXT.go));
      at(5600, () => { const b = st.foes[1]; b.state = 'off'; st.fin = { i: 9, x: b.x, x0: b.x, z: b.cz, cz: b.cz, coverH: b.coverH, state: 'vault', vt: 0, vk: 0, lift: 0, up: 1, hp: 1, flip: b.flip, dead: 0, seed: 0.5, wpn: 'rifle', fl: 0, flr: 0, run: 0 }; });
      at(99999999, () => { st.fin = { i: 9, x: 0.35, x0: 0.35, z: st.fall.z - 16, cz: -999, coverH: 0, state: 'walk', up: 1, hp: 1, flip: -1, dead: 0, seed: 0.5, wpn: 'rifle', fl: 0, flr: 0, run: 0 }; });
      at(11000, () => root.classList.add('pale'));
      const d = document.createElement('div'); d.className = 'sh-sorry'; d.textContent = TXT.sorry; root.appendChild(d);
      at(15000, () => d.classList.add('on'));
      at(24000, () => { st.over = true; cancelAnimationFrame(raf); hum.stop(); done(st.sci >= SCI); });
    }
    function finFrame(dt, now, w, h) {
      const F = st.fin, Fa = st.fall, stop = Fa.z - 1.5; F.fl = Math.max(0, F.fl - dt * 18);
      if (F.state === 'vault') { if (vaultStep(F, dt)) { F.state = 'walk'; F.cz = -999; } return; }
      if (F.fl > 0) lit(F.x, F.z, F.fl * 10);
      const moving = F.state === 'walk' || F.state === 'leave';
      if (moving) {
        F.run += dt * 11; F.z += dt * (F.state === 'walk' ? 4.8 : -2.6);
        if ((F.stepT = (F.stepT || 0) - dt) <= 0) { F.stepT = F.state === 'walk' ? 0.28 : 0.45; sample(G(`floor${1 + Math.floor(Math.random() * 5)}`), Math.max(0.12, 1.5 - (Fa.z - F.z) / 12)); if (Math.random() < 0.25) sample(G(`hull${1 + Math.floor(Math.random() * 5)}`), 0.5); }
        if (F.state === 'walk' && F.z >= stop) { F.z = stop; F.state = 'finish'; F.ta = now; sample(G('floor2'), 1.4); }
      }
      if (F.state === 'finish') {
        const t = (now - F.ta) / 1000;
        if (t > 0.7 && !F.said) { F.said = true; shout(F, 'screen', true, TXT.finish); }
        const shots = [1.6, 2.3, 2.75];
        while ((F.n || 0) < shots.length && t > shots[F.n || 0]) {
          F.n = (F.n || 0) + 1; F.fl = 1; F.flr = Math.random() * 6;
          sample(G('rifle'), 1.8); hurt(1.2); if (Math.random() < 0.6) sample(G('gib2'), 1);
          splatScreen(1.5, true); splatScreen(0.8, true); st.shake = 1.5; st.flash = 1;
          Fa.look = [[F.x, 1.3, F.z], [Fa.x + 0.3, 3, Fa.z - 0.6], [Fa.x + 1.6, 2.4, Fa.z - 0.3]][F.n - 1]; Fa.jt = now; Fa.from = camera.quaternion.clone(); Fa.n = F.n;   // рывок: на рейдера, в потолок, ещё вбок
          const b = foeBox(F, w, h), [mx, my] = muzzlePt(F, b); tracer(mx, my, w * 0.5, h * 0.6, '255,170,80');
        }
        if (t > 5) { F.state = 'leave'; }
      }
    }
    function fallCam(now, dt) {
      const Fa = st.fall, t = (now - Fa.t0) / 1000;
      let y, roll, pitch;
      if (t < 0.42) { const k = t / 0.42; y = Fa.y - (Fa.y - 0.26) * k * k; roll = 1.42 * k * k; pitch = -0.35 * Math.sin(k * Math.PI); }
      else { const u = t - 0.42, b1 = u < 0.22 ? Math.sin(u / 0.22 * Math.PI) * 0.12 : 0, b2 = u >= 0.22 && u < 0.38 ? Math.sin((u - 0.22) / 0.16 * Math.PI) * 0.05 : 0; y = 0.26 + b1 + b2; roll = 1.42 + (b1 + b2) * 0.6; pitch = 0.06 - (b1 + b2) * 0.5; }
      Fa.cy += (Fa.jy - Fa.cy) * Math.min(1, dt * 22); Fa.cr += (Fa.jr - Fa.cr) * Math.min(1, dt * 22);
      const sh = t < 1 ? st.shake * 0.03 : 0;
      camera.position.set(Fa.x, y, Fa.z);
      camera.rotation.set(pitch + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, roll + Fa.cr);
      if (Fa.look) {
        Fa.m ??= new THREE.Matrix4(); Fa.m.lookAt(camera.position, tmp.set(...Fa.look), UPL);
        const T = new THREE.Quaternion().setFromRotationMatrix(Fa.m), e = (now - Fa.jt) / 1000, q = Fa.from.clone();
        if (e < 0.06) q.slerp(T, (e / 0.06) * 1.12);                                    // рывок с перелётом
        else if (Fa.n >= 3) q.slerp(T, 1.12 - Math.min(0.12, (e - 0.06) * 1.2));         // третий — застыл
        else q.slerp(T, 1.12 - Math.min(0.5, (e - 0.06) * 0.9));                         // голова по инерции падает обратно
        camera.quaternion.copy(q);
      }
    }

    // ---------- цикл ----------
    let last = performance.now(), raf = 0;
    const hum = storm.start(); hum.set(0.15);
    function frame(now) {
      let dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (now < introEnd) { dt = 0; st.fire = false; }
      if (st.over) return;
      const lastShots = st.hell && st.ammo <= 5 && !st.fall;       // последние 5 патронов — слоу-мо и сердце
      if (!st.fall) st.slow += ((lastShots ? 0.35 : 1) - st.slow) * Math.min(1, dt * 4);
      if (lastShots && (st.beat = (st.beat || 0) - dt) <= 0) { st.beat = 0.9; snd.heart?.(); }
      if (st.hellIntro > 0) { st.hellIntro = (st.hellEnd - now) / 1000; if (st.hellIntro <= 0) { st.hell = true; root.classList.add('hell'); st.hp = Math.max(st.hp, 40); } }
      dt *= st.slow; st.t += dt;
      const w = c2.clientWidth, h = c2.clientHeight;
      if (c2.width !== Math.round(w * dpr) || c2.height !== Math.round(h * dpr)) { c2.width = Math.round(w * dpr); c2.height = Math.round(h * dpr); renderer.setSize(w, h, false); camera.aspect = w / h; }
      st.coverK += ((st.cover ? 1 : 0) - st.coverK) * Math.min(1, dt * 10);
      cov.classList.toggle('on', st.cover);
      if (st.cover && st.ammo < MAG && st.reload <= 0 && st.spare > 0 && !st.hell) reload();
      st.cool -= dt; if (st.fire && st.cool <= 0 && !st.jug) shoot();
      st.recoil = Math.max(0, st.recoil - dt * 9);
      if (st.reload > 0) { st.reload -= dt; if (st.reload <= 0) { st.ammo = MAG; st.spare--; startHell(); sample(G('lmg_bolt_closed'), 1.3) || sample(G('smg_cock'), 1.2); } }
      // рейдеры: прячутся → поднимаются → целятся → стреляют → прячутся; рывок; бегство
      const hard = 1 + st.t / DURATION;
      for (const f of st.foes) {
        f.fl = Math.max(0, f.fl - dt * 18);
        if (st.jug) { if (f.state === 'peek') continue; if (!f.dead) { f.state = f.door ? 'off' : 'hide'; f.up = 0; } else f.dead += dt; continue; }
        if (f.dead) { f.dead += dt; if (f.dead > 3) respawn(f); continue; }
        if (f.state === 'off') continue;
        if (f.state === 'rushPrep') { f.up += (1 - f.up) * Math.min(1, dt * 8); f.t -= dt; if (f.t <= 0) { f.state = f.door ? 'doorOut' : 'vault'; f.vk = 0; } continue; }
        if (f.state === 'vault') { f.up = 1; if (vaultStep(f, dt)) f.state = 'rush'; continue; }
        if (f.state === 'doorOut') { f.up = 1; f.run += dt * 10; f.x += (f.lane - f.x) * Math.min(1, dt * 4); if (Math.abs(f.x - f.lane) < 0.15) f.state = 'rush'; continue; }
        if (f.state === 'rush' || f.state === 'close') { rushStep(f, dt, w, h); continue; }
        if (f.state === 'flee') { f.up = 1; f.run += dt * 12; f.z -= dt * 3.5; if (f.z <= (f.fleeTo ?? (f.door ? -34 : f.cz))) { if (f.fleeTo) { f.state = 'off'; continue; } f.z = f.cz; f.x = f.x0; f.state = f.door ? 'off' : 'hide'; f.t = 1; } continue; }
        f.t -= dt;
        if (st.hell && Math.random() < dt * 0.12) shout(f, 'hell');
        if (st.hell && st.hellIntro <= 0 && !f.door && Math.random() < dt * 0.15) { f.state = 'flee'; f.back = true; f.fleeTo = f.cz - 12; shout(f, 'hell'); continue; }
        if (st.hell) { f.z -= dt * 0.8; if (st.hellIntro <= 0 && f.state === 'aim') f.t -= dt; }
        f.up += ((f.state === 'hide' ? 0 : 1) - f.up) * Math.min(1, dt * 7);
        if (f.t > 0) continue;
        if (f.state === 'hide') {
          if (!st.hell && Math.random() < 0.22) { shout(f, 'call', true); f.burst = true; f.state = 'aim'; f.t = 0.55; }  // «Клон, проверь!» — и сразу очередь
          else { if (Math.random() < (st.hell ? 0.35 : 0.15)) shout(f, st.hell ? 'hell' : st.kills > 3 ? 'shock' : 'fire'); f.state = 'aim'; f.t = (0.7 + Math.random() * 0.5) / hard; }
        } else if (f.state === 'aim') { f.state = 'fire'; f.t = f.burst ? 1.4 : 0.6 + Math.random() * 0.5; f.shot = 0; }
        else if (f.state === 'fire') {
          f.burst = false;
          if (++f.shots % 2 === 0) { f.state = 'reload'; f.t = 1.4; sample(G(f.wpn === 'shotgun' ? 'shotgun_insert' : f.wpn === 'lmg' ? 'lmg_magin' : 'smg_magin'), 0.9, 0.95); at(900, () => sample(G('smg_cock'), 0.8)); if (Math.random() < 0.3) shout(f, 'reload'); }
          else { f.state = 'hide'; f.t = (1.2 + Math.random() * 2) / hard; }
        } else if (f.state === 'reload') { f.state = 'hide'; f.t = 0.3; }
      }
      for (const f of st.foes) if (f.state === 'fire' && !f.dead && !st.jug) {
        f.shot = (f.shot || 0) - dt;
        if (f.shot <= 0) { foeShot(f, w, h, st.hell ? 0.12 : f.burst ? 0.4 : 0.28); f.shot = f.wpn === 'shotgun' ? 0.9 : f.burst ? 0.085 : 0.18; }
      }
      fLight.intensity *= Math.exp(-dt * 25); st.foes.forEach((f) => { if (f.fl > 0.5) lit(f.x, f.z, f.fl * 8); });
      if (!st.rushed && !st.hell && st.hellIntro <= 0 && !st.jug && (st.t > 11 || st.ammo <= 14)) startRush();
      if (st.rushed && !st.doorDone && !st.hell && st.hellIntro <= 0 && !st.jug && st.t > st.rushT + 7) {
        st.doorDone = true; const D = doors.find((d) => d.z === -16 && d.s < 0), f = st.foes[3];
        if (D) { D.m.position.z -= 0.95; sample(G('gen_hit'), 0.8); }
        f.state = 'rushPrep'; f.t = 0.4; f.dead = 0; f.hp = 1; f.x = -1.85; f.z = -16; f.lane = -0.5; shout(f, 'rush', true);
      }
      // во время бега — подначки, чтобы игрок жёг весь магазин
      if (st.hell && st.hellIntro <= 0 && !st.jug && st.ammo > 0 && (st.urgeT = (st.urgeT || 0) - dt) <= 0) {
        st.urgeT = 0.55 + Math.random() * 0.4; const u = urge; u.textContent = pick(TXT.urge); u.style.left = `${20 + Math.random() * 60}%`; u.style.top = `${25 + Math.random() * 40}%`; u.classList.remove('on'); void u.offsetWidth; u.classList.add('on');
      }
      if (st.ammo === 0 && cov.hidden && !st.jug) { cov.hidden = false; sfx.click(); }
      st.shake = Math.max(0, st.shake - dt * 3); st.blood = Math.max(0, st.blood - dt);
      // камера
      if (st.hell && !st.cover && !st.jug) { st.walk = Math.min(18, st.walk + dt * 4.2); if ((st.stepT = (st.stepT || 0) - dt) <= 0) { st.stepT = st.walk < 18 ? 0.24 : 0.62; sample(G(`hull${1 + Math.floor(Math.random() * 5)}`), 1.1, 0.8); if (Math.random() < 0.3) sample(G(`blood${1 + Math.floor(Math.random() * 3)}`), 0.6); } }
      root.style.setProperty('--dark', String(st.hellIntro > 0 ? 1 : 0));
      const kd2 = Math.exp(-dt * 9); st.kick.x *= kd2; st.kick.y *= kd2; st.kick.r *= kd2;
      if (st.fall) fallCam(now, dt);
      else {
        camera.position.set(st.coverK * 0.62, 1.6 - st.coverK * 0.15 + Math.sin(st.walk * 3.3) * 0.06, st.baseZ + st.coverK * 0.25 - st.walk);
        camera.rotation.set(-st.aim.y * 0.05 + st.kick.y + (Math.random() - 0.5) * st.shake * 0.04, -st.aim.x * 0.07 + st.coverK * 0.12 + st.kick.x + (Math.random() - 0.5) * st.shake * 0.04, st.coverK * 0.04 + st.kick.r);
      }
      st.flash = Math.max(0, (st.flash || 0) - dt * 6);
      const epic = st.hell ? 1 : 0.4, zoom = st.fall ? 1 : 1 + (Math.sin(st.t * 1.3) * 0.03 + Math.sin(st.t * 3.7) * 0.015) * (1 + epic * 2) + st.shake * 0.08 * (1 + epic) + st.recoil * 0.03 * epic;
      camera.fov = 62 / Math.max(0.85, zoom); camera.updateProjectionMatrix();     // «дыхание» — зумом камеры, без рамок
      if (st.hell && Math.random() < dt * 3) st.flash = Math.max(st.flash, 0.6);
      const blur = st.fall ? 0 : Math.max(0, Math.sin(st.t * 0.9) * 1.2 + st.blood * 1.5) + st.coverK * 4;
      root.style.setProperty('--bl', `${blur.toFixed(1)}px`); root.style.setProperty('--fl', st.flash.toFixed(2));
      // оружие
      const ck = st.coverK, rec = st.recoil, rl = st.reload > 0 ? Math.sin(Math.min(1, (1.5 - st.reload) / 1.5) * Math.PI) : 0;
      gunG.position.set(0.25 + Math.sin(st.t * 1.6) * 0.006 + st.aim.x * 0.03, -0.23 + Math.cos(st.t * 3.2) * 0.004 - ck * 0.35 - rl * 0.12 - st.aim.y * 0.02, -0.5 + rec * 0.05);
      gunG.rotation.set(rec * 0.12 + ck * 0.6 + rl * 0.5 - st.aim.y * 0.12, -st.aim.x * 0.15 + 0.04, rl * 0.6 + ck * 0.3);
      flash.visible = rec > 0.6; flash.rotation.z = Math.random() * 6; flash.scale.setScalar(0.7 + Math.random() * 0.6); mlight.intensity = rec > 0.6 ? 5 : 0;
      leds.forEach((l, i) => (l.visible = i < Math.ceil((st.ammo / MAG) * 10)));
      led.material.color.set(st.reload > 0 ? 0xff3020 : 0x40ff70);
      vm.updateMatrixWorld(true);
      aimArm(armR, new THREE.Vector3(0.5, -0.6, 0.1), new THREE.Vector3(0, -0.13, 0.03));
      aimArm(armL, new THREE.Vector3(-0.3, -0.65, -0.1), new THREE.Vector3(0, -0.06, -0.4 + rl * 0.3));
      lampsL.forEach((l, i) => (l.intensity = (Math.sin(st.t * (2 + i * 0.7) + i) > 0.3 || Math.random() < 0.03) ? 2.2 : 0.15));
      if (st.jug) jugFrame(dt, now, w, h);
      if (st.fin) finFrame(dt, now, w, h);
      if (st.fall) for (const f of st.foes) if (f.state === 'peek') f.up += (0.85 - f.up) * Math.min(1, dt * 4);
      renderer.render(scene, camera);
      // 2D
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const edgeX = proj(0.5, 1, -0.35, w, h)[0];
      g.save(); if (st.coverK > 0.05) { g.beginPath(); g.rect(0, 0, Math.max(0, edgeX), h); g.clip(); }
      drawGore(dt, w, h);
      for (const f of [...st.foes, st.fin].filter(Boolean).sort((a, b) => a.z - b.z)) drawFoe(f, w, h);
      g.restore();
      if (st.jug) drawJug(w, h);
      drawShouts(dt, w, h);
      drawTracers(dt); drawSparks(dt); drawScreenBlood(dt);
      st.splats = st.splats.filter((p) => (p.t += dt) < 0.4);
      for (const p of st.splats) { g.fillStyle = `rgba(200,200,200,${0.6 - p.t * 1.5})`; g.beginPath(); g.arc(p.x, p.y, p.r + p.t * 30, 0, 7); g.fill(); }
      if (st.coverK < 0.3 && !st.jug) {
        const cx = (st.aim.x + 1) / 2 * w, cy = (st.aim.y + 1) / 2 * h, cr = 9 + st.recoil * 8;
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.stroke();
        g.fillStyle = '#e02020'; g.fillRect(cx - 2, cy - 2, 4, 4);
      }
      // HUD
      st.sci = Math.min(SCI, Math.floor((st.t / (DURATION * 0.6)) * SCI));
      $('.sh-life b').style.width = `${Math.max(0, st.hp / HP * 100)}%`;
      $('.sh-time').textContent = `${Math.max(0, Math.ceil(DURATION - st.t))}`;
      $('.sh-sci').textContent = `У ЧЕЛНОКА ${st.sci}/${SCI}`;
      $('.sh-kills').textContent = String(st.kills);
      $('.sh-ammo').innerHTML = st.reload > 0 ? 'ПЕРЕЗАРЯДКА' : `${'▮'.repeat(Math.ceil(st.ammo / 3))}<em>${st.ammo}</em><small> +${st.spare * MAG}</small>`;
      $('.sh-blood').style.opacity = String(Math.min(1, st.blood * 0.6 + (1 - st.hp / HP) * 0.3));
      if (st.hp <= 0 && !st.jug) { if (st.hell) st.hp = 5; else return end(false); }
      if (!st.jug && (st.t >= DURATION || (st.hell && st.ammo <= 0))) juggernaut();
      raf = requestAnimationFrame(frame);
    }
    function end(win) {
      st.over = true; cancelAnimationFrame(raf); hum.stop();
      say(win ? 'Они успели. Все двадцать.' : 'Очередь из пулемёта перебила ему ноги.', win ? '' : 'warn');
      win ? storm.captured() : storm.alarm();
      at(2600, () => done(win));
    }
    root.__jug = () => juggernaut(); root.__st = st; root.__fall = () => { juggernaut(); st.jug.t0 -= 4300; }; // автотест
    const intro = document.createElement('div'); intro.className = 'sh-intro'; intro.innerHTML = `<i class="ph"></i><p>${TXT.intro}</p>`; root.appendChild(intro);
    const introEnd = performance.now() + 2600; at(2200, () => intro.classList.add('off')); at(2800, () => intro.remove());
    raf = requestAnimationFrame(frame);
    return () => { timers.forEach(clearTimeout); st.over = true; cancelAnimationFrame(raf); hum.stop(); removeEventListener('keydown', kd); removeEventListener('keyup', kd); renderer.dispose(); };
  },
};
