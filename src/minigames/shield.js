import * as THREE from 'three';
import { sfx, storm, war as snd, sample, preload, sampleHeavy, ringing } from '../audio.js';
import smgUrl from '../assets/smg.png';
import muzzleUrl from '../assets/muzzle.png';
import TXT from '../story/shield.json';

// Глава 10 «Щит» — К-21 держит коридор, пока учёные уходят к челноку. Стиль — как Sierra 7:
// серый мир с жирными контурами, яркая только кровь и вспышки.
// 3D: только помещение. 2D: рейдеры за укрытиями, руки на костях (ИК) и пиксельный спрайт ПП.
// Касание — выстрел в точку. «УКРЫТИЕ» (удерживать) — не попадут, но и стрелять нельзя; в укрытии — перезарядка.
const DURATION = 60, MAG = 30, SPARE = 1, HP = 100, SCI = 20;

export default {
  name: 'Щит',
  run(root, done) {
    root.classList.add('sh-root');
    root.innerHTML = `<canvas class="sh-3d"></canvas><canvas class="sh-2d"></canvas>
      <div class="sh-hud"><div class="sh-life"><span>ТЕЛО</span><i><b></b></i></div><span class="sh-time"></span><span class="sh-sci"></span></div>
      <div class="sh-kills"></div><div class="sh-ammo"></div>
      <button class="sh-cover"><i>▼</i> УКРЫТИЕ</button><button class="sh-reload">⟳</button>
      <div class="sh-blood"></div><p class="sh-msg"></p>`;
    const $ = (q) => root.querySelector(q);
    const c3 = $('.sh-3d'), c2 = $('.sh-2d'), g = c2.getContext('2d');
    const gun = new Image(); gun.src = smgUrl;
    // звуки из SS14: наш ПП, стволы рейдеров, мясо, рикошеты, магазин, затвор
    const SND = ['guns/smg', 'guns/c-20r', 'guns/lmg', 'guns/shotgun', 'guns/rifle', 'guns/bullet_meat1', 'guns/bullet_meat2', 'guns/bullet_meat3', 'guns/bullet_meat4', 'guns/ric1', 'guns/ric2', 'guns/ric3', 'guns/smg_magin', 'guns/smg_cock', 'guns/empty', 'guns/casing_fall_1', 'guns/casing_fall_2', 'guns/casing_fall_3', 'guns/lmg_bolt_open', 'guns/lmg_bolt_closed', 'guns/gib1', 'guns/gib2', 'guns/gib3', 'guns/splat', 'guns/meatslap', 'guns/shotgun_insert', 'guns/lmg_magin', 'guns/bullet_hit', 'guns/ric4', 'guns/ric5', 'guns/minigun'];
    preload(SND);
    const pickS = (...a) => a[Math.floor(Math.random() * a.length)];
    const hurt = () => sample(['guns/gib1', 'guns/gib2', 'guns/gib3', 'guns/splat', 'guns/meatslap'][Math.floor(Math.random() * 5)], 1.3) || snd.meat();
    const meat = () => sample(`guns/bullet_meat${1 + Math.floor(Math.random() * 4)}`, 1.4) || snd.meat();

    // ---------- 3D коридор: плоские серые материалы + контуры рёбер ----------
    const renderer = new THREE.WebGLRenderer({ canvas: c3, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050505); scene.fog = new THREE.Fog(0x050505, 3, 20);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
    const L = 28, W = 3.4, H = 3;
    const flat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const EDGE = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
    function block(w, h, d, x, y, z, c) {
      const geo = new THREE.BoxGeometry(w, h, d), m = new THREE.Mesh(geo, flat(c)); m.position.set(x, y, z); scene.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), EDGE); e.position.copy(m.position); scene.add(e);
      return m;
    }
    block(W, 0.1, L, 0, -0.05, -L / 2, 0x6a6a6a);               // пол
    block(W, 0.1, L, 0, H + 0.05, -L / 2, 0x4a4a4a);            // потолок
    block(0.1, H, L, -W / 2, H / 2, -L / 2, 0x8a8a8a);          // стены
    block(0.1, H, L, W / 2, H / 2, -L / 2, 0x7e7e7e);
    // двери, плинтусы, лампы, трубы — чтобы стены читались
    for (let z = -4; z > -L; z -= 6) {
      for (const s of [-1, 1]) {
        block(0.06, 2.1, 1, s * (W / 2 - 0.05), 1.05, z, 0x5a5a5a);
        block(0.04, 0.12, 0.12, s * (W / 2 - 0.1), 1.05, z + 0.35 * s, 0x2a2a2a);
      }
      block(0.5, 0.06, 0.25, 0, H - 0.04, z - 3, 0xeeeeee);
    }
    block(0.14, 0.14, L, -W / 2 + 0.2, H - 0.3, -L / 2, 0x505050);
    block(0.1, 0.1, L, W / 2 - 0.2, H - 0.45, -L / 2, 0x505050);
    block(W, H, 0.2, 0, H / 2, -L, 0x3c3c3c);                  // гермоворота
    block(W * 0.9, 0.1, 0.05, 0, 1.5, -L + 0.13, 0xc9a21a);     // жёлто-чёрная полоса на воротах
    // укрытия рейдеров: ящики, перевёрнутый стол, колонна
    const COVERS = [[-0.95, -5.5, 1, 0.9], [0.9, -7.5, 1.2, 1], [-0.7, -10, 0.9, 1.1], [0.85, -12.5, 1, 0.9], [-0.9, -15, 1.1, 1]];
    for (const [x, z, w, h] of COVERS) block(w, h, 0.6, x, h / 2, z, 0x5e5a52);
    block(1.3, H, 0.5, 1.15, H / 2, -0.6, 0x5c5c5c); // угол, за которым укрываемся
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
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

    // ---------- состояние ----------
    const st = {
      t: 0, hp: HP, ammo: MAG, spare: SPARE, slow: 1, hell: false, hellIntro: 0, walk: 0, reload: 0, kills: 0, over: false, recoil: 0, cover: false, coverK: 0,
      aim: { x: 0, y: -0.05 }, fire: false, cool: 0, shake: 0, blood: 0, sci: 0, splats: [],
      foes: COVERS.map(([x, z, w, h], i) => ({ i, x: x + (x < 0 ? 0.25 : -0.25), z: z - 0.35, coverH: h, state: 'hide', t: 1 + i * 0.8 + Math.random(), up: 0, hp: 1, flip: x < 0 ? 1 : -1, dead: 0, seed: Math.random(), wpn: ['smg', 'shotgun', 'lmg', 'smg', 'rifle'][i], shots: 0 })),
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
    const reload = () => { if (st.reload > 0 || st.ammo === MAG || st.hell) return; if (st.coverK < 0.6) { say('Перезарядка — только за углом.', 'warn'); return; } if (st.spare <= 0) { sample('guns/empty', 1); say('Магазинов больше нет.', 'warn'); return; } st.reload = 1.5; sample('guns/lmg_bolt_open', 1.2); setTimeout(() => sample('guns/smg_magin', 1.3), 550); };
    $('.sh-reload').addEventListener('pointerdown', (e) => { e.stopPropagation(); reload(); });
    const kd = (e) => { if (e.key === 'r' || e.key === 'к') reload(); if (e.key === ' ' || e.key === 'Shift') st.cover = e.type === 'keydown'; };
    addEventListener('keydown', kd); addEventListener('keyup', kd);

    // ---------- рейдер (2D поверх 3D, в духе Sierra 7) ----------
    // точки фигуры в метрах от ног: голова, корпус, руки с оружием
    function foeBox(f, w, h) {
      const y0 = f.coverH * (1 - f.up) - 0.1;          // из-за укрытия поднимается
      const [x, yF] = proj(f.x, Math.max(0, y0), f.z, w, h), [, yH] = proj(f.x, y0 + 1.75, f.z, w, h);
      const s = (yF - yH) / 1.75;                      // пикселей на метр
      return { x, yF, yH, s, top: yH, bottom: proj(f.x, f.coverH, f.z, w, h)[1] };
    }
    function drawFoe(f, w, h) {
      if (f.state === 'hide' && f.up <= 0 && !f.dead) return;
      const b = foeBox(f, w, h), s = b.s, x = b.x, y = b.yF;
      g.save();
      // обрезка по верху укрытия — рейдер «за» ящиком
      g.beginPath(); g.rect(0, 0, w, b.bottom + (f.dead ? 999 : 0)); g.clip();
      g.translate(x, y); if (f.dead) g.rotate(f.flip * Math.min(1.4, f.dead * 3));
      g.lineWidth = Math.max(2, s * 0.03); g.strokeStyle = '#050505'; g.lineJoin = 'round';
      const P = (pts, fill) => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px * s, -py * s) : g.moveTo(px * s, -py * s))); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
      P([[-0.2, 0], [-0.22, 0.85], [-0.02, 0.85], [-0.04, 0]], '#353535'); P([[0.04, 0], [0.02, 0.85], [0.22, 0.85], [0.2, 0]], '#303030'); // ноги
      P([[-0.24, 0], [-0.24, 0.1], [-0.02, 0.1], [0, 0]], '#111'); P([[0.02, 0], [0.02, 0.1], [0.24, 0.1], [0.24, 0]], '#111');       // ботинки
      P([[-0.22, 0.45], [-0.22, 0.6], [-0.03, 0.6], [-0.03, 0.45]], '#555');                                                        // наколенник
      P([[-0.25, 0.85], [-0.28, 1.47], [0.28, 1.47], [0.25, 0.85]], '#6a6a6a');                                                      // корпус
      P([[-0.21, 0.92], [-0.22, 1.4], [0.22, 1.4], [0.21, 0.92]], '#4c4c4c');                                                        // бронежилет
      for (let k = 0; k < 3; k++) P([[-0.17 + k * 0.12, 1.0], [-0.17 + k * 0.12, 1.14], [-0.08 + k * 0.12, 1.14], [-0.08 + k * 0.12, 1.0]], '#3a3a3a'); // подсумки
      P([[-0.25, 0.86], [-0.25, 0.92], [0.25, 0.92], [0.25, 0.86]], '#222');                                                         // ремень
      P([[-0.34, 1.35], [-0.3, 1.5], [-0.16, 1.5], [-0.2, 1.35]], '#5a5a5a'); P([[0.34, 1.35], [0.3, 1.5], [0.16, 1.5], [0.2, 1.35]], '#5a5a5a'); // наплечники
      g.beginPath(); g.ellipse(0, -1.6 * s, 0.13 * s, 0.16 * s, 0, 0, 7); g.fillStyle = '#141414'; g.fill(); g.stroke();             // балаклава
      g.beginPath(); g.arc(0, -1.64 * s, 0.155 * s, Math.PI, 0); g.fillStyle = '#3c3c3c'; g.fill(); g.stroke();                       // каска
      g.fillStyle = '#9a9a9a'; g.fillRect(-0.1 * s, -1.63 * s, 0.2 * s, 0.05 * s); g.strokeRect(-0.1 * s, -1.63 * s, 0.2 * s, 0.05 * s); // визор
      // руки и оружие: целятся, стреляют, в перезарядке опускают ствол
      const aim = f.state === 'aim' || f.state === 'fire', rl = f.state === 'reload';
      const gy = aim ? 1.32 : rl ? 0.95 : 1.1, len = { smg: 0.42, shotgun: 0.55, lmg: 0.62, rifle: 0.6 }[f.wpn], thick = f.wpn === 'lmg' ? 0.13 : 0.09;
      P([[0.22, 1.38], [0.3, gy], [0.14, gy - 0.06]], '#2a2a2a');
      P([[-0.22, 1.38], [-0.1, gy + 0.02], [-0.2, gy - 0.1]], '#2a2a2a');
      g.fillStyle = '#111'; g.fillRect(-0.05 * s, -(gy + 0.02) * s, len * s * f.flip, thick * s); g.strokeRect(-0.05 * s, -(gy + 0.02) * s, len * s * f.flip, thick * s);
      if (f.wpn === 'lmg') { g.fillRect(0.05 * s * f.flip, -(gy - 0.08) * s, 0.14 * s * f.flip, 0.12 * s); }
      if (rl) { g.fillStyle = '#222'; g.fillRect(0.05 * s * f.flip, -(gy - 0.2) * s, 0.06 * s, 0.14 * s); }
      // вспышка выстрела
      if (f.state === 'fire' && Math.sin(st.t * 45 + f.seed * 9) > 0) {
        g.globalCompositeOperation = 'lighter';
        const fx = ({ smg: 0.4, shotgun: 0.52, lmg: 0.6, rifle: 0.58 }[f.wpn]) * s * f.flip, fy = -1.32 * s, r = s * (0.35 + Math.random() * 0.2);
        const rg = g.createRadialGradient(fx, fy, 0, fx, fy, r);
        rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(0.3, 'rgba(255,210,90,.9)'); rg.addColorStop(1, 'rgba(255,140,30,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(fx, fy, r, 0, 7); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }

    // «И ГРЯНУЛ АД»: затемнение, медленная надпись, выход из-за угла, контраст, рейдеры бегут
    function startHell() {
      st.hellIntro = 5.5; st.hellEnd = performance.now() + 5500; st.cover = false; hum.set(0.6);
      const t = document.createElement('div'); t.className = 'sh-hell'; t.textContent = TXT.hell; root.appendChild(t);
      setTimeout(() => t.classList.add('on'), 400); setTimeout(() => t.classList.add('off'), 4600); setTimeout(() => t.remove(), 6000);
      sample('guns/lmg_bolt_closed', 1.5);
    }
    // финал: джаггернаут с одним большим щитком вместо визора и пулемётом
    function juggernaut() {
      st.jug = { t: 0, z: -6, fire: 0, dead: false }; st.fire = false;
      st.foes.forEach((f) => (f.state = 'hide'));
      say('');
    }
    function drawJug(w, h) {
      const J = st.jug, [x, yF] = proj(0.2, 0, J.z, w, h), [, yH] = proj(0.2, 2.1, J.z, w, h), s = (yF - yH) / 2.1;
      g.save(); g.translate(x, yF); g.lineWidth = Math.max(3, s * 0.03); g.strokeStyle = '#000'; g.lineJoin = 'round';
      const P = (pts, c) => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a * s, -b * s) : g.moveTo(a * s, -b * s))); g.closePath(); g.fillStyle = c; g.fill(); g.stroke(); };
      P([[-0.35, 0], [-0.38, 0.9], [0.38, 0.9], [0.35, 0]], '#2a2a2a');
      P([[-0.5, 0.9], [-0.55, 1.75], [0.55, 1.75], [0.5, 0.9]], '#4a4a4a');
      P([[-0.7, 1.55], [-0.62, 1.85], [-0.3, 1.85], [-0.38, 1.5]], '#3a3a3a'); P([[0.7, 1.55], [0.62, 1.85], [0.3, 1.85], [0.38, 1.5]], '#3a3a3a');
      P([[-0.26, 1.75], [-0.28, 2.15], [0.28, 2.15], [0.26, 1.75]], '#333');
      P([[-0.22, 1.82], [-0.23, 2.08], [0.23, 2.08], [0.22, 1.82]], '#b00');                 // один большой щиток
      P([[-0.1, 1.3], [-0.1, 1.45], [0.9, 1.4], [0.9, 1.3]], '#111');                        // пулемёт
      P([[0.1, 1.15], [0.1, 1.3], [0.35, 1.3], [0.35, 1.15]], '#1a1a1a');
      if (J.fire > 0 && Math.random() < 0.7) { g.globalCompositeOperation = 'lighter'; const rg = g.createRadialGradient(0.95 * s, -1.35 * s, 0, 0.95 * s, -1.35 * s, s * 0.7); rg.addColorStop(0, '#fff'); rg.addColorStop(0.3, 'rgba(255,200,80,.9)'); rg.addColorStop(1, 'rgba(255,100,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0.95 * s, -1.35 * s, s * 0.7, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
      g.restore();
    }
    // true — кадр закончен (финал играет сам)
    function jugFrame(dt, now, w, h) {
      const J = st.jug; J.t += dt;
      if (J.t < 2.2) { J.z += dt * 1.2; if ((J.step = (J.step || 0) - dt) <= 0) { J.step = 0.55; snd.heart?.(); st.shake = 0.6; } }
      else if (J.t < 4.2) {
        J.fire = 1; st.slow = 0.35;
        if ((J.b = (J.b || 0) - dt) <= 0) { J.b = 0.07; sampleHeavy('guns/minigun', 1.6) || sampleHeavy('guns/lmg', 1.6); st.shake = 1.4; st.blood = 1; st.flash = 1; st.hp -= 4; if (Math.random() < 0.5) hurt(); }
      } else if (!J.dead) {
        J.dead = true; J.fire = 0; ringing(6); sample('guns/splat', 1.4); setTimeout(() => sample('guns/gib2', 1.2), 700);
        const d = document.createElement('div'); d.className = 'sh-sorry'; d.textContent = TXT.sorry; root.appendChild(d);
        setTimeout(() => d.classList.add('on'), 2500);
        setTimeout(() => { st.over = true; cancelAnimationFrame(raf); hum.stop(); done(st.sci >= SCI); }, 9000);
        root.classList.add('fall');
      }
      return false;
    }
    const shouts = [];
    function shout(f, kind) { const l = TXT.raiders[kind]; shouts.push({ f, text: l[Math.floor(Math.random() * l.length)], t: 0 }); }
    function drawShouts(w, h) {
      for (const q of shouts) {
        q.t += 1 / 60; const b = foeBox(q.f, w, h), a = Math.min(1, (2 - q.t) * 2);
        g.globalAlpha = Math.max(0, a); g.font = `${Math.max(9, Math.min(14, b.s * 0.12))}px "Press Start 2P", monospace`; g.textAlign = 'center';
        g.fillStyle = '#000'; g.fillText(q.text, b.x + 2, b.top - 12 + 2 - q.t * 10); g.fillStyle = '#fff'; g.fillText(q.text, b.x, b.top - 12 - q.t * 10);
        g.globalAlpha = 1;
      }
      for (let i = shouts.length - 1; i >= 0; i--) if (shouts[i].t > 2) shouts.splice(i, 1);
    }
    function shoot() {
      if (st.reload > 0 || st.coverK > 0.3 || st.hellIntro > 0) return;
      if (st.ammo <= 0) { sample('guns/empty', 1); reload(); return; }
      st.ammo--; st.recoil = 1; if (st.hell) st.shake = Math.max(st.shake, 0.5); st.cool = 0.13; (sample('guns/smg', 1.6) || snd.loud('smg')); if (Math.random() < 0.3) setTimeout(() => sample(`guns/casing_fall_${1 + Math.floor(Math.random() * 3)}`, 0.5), 250); st.flash = 1; st.shake = Math.max(st.shake, 0.15);
      const w = c2.clientWidth, h = c2.clientHeight, sx = (st.aim.x + 1) / 2 * w, sy = (st.aim.y + 1) / 2 * h;
      // попадание по видимой части рейдера (ближние — первыми)
      const hit = st.foes.filter((f) => !f.dead && f.up > 0.4).sort((a, b) => b.z - a.z).find((f) => {
        const b = foeBox(f, w, h);
        return Math.abs(sx - b.x) < 0.3 * b.s && sy > b.top - 0.1 * b.s && sy < b.bottom;
      });
      if (hit) {
        const b = foeBox(hit, w, h), head = sy < b.top + 0.35 * b.s;
        hit.hp -= head ? 1 : 0.45;
        splat(sx, sy, head ? 1.4 : 0.8, b.s); meat();
        if (hit.hp <= 0) { hit.dead = 0.001; st.kills++; if (Math.random() < 0.5) shout(hit, 'down'); snd.fall(); }
      } else { st.splats.push({ x: sx, y: sy, r: 3, dust: 1, t: 0 }); sample(Math.random() < 0.6 ? 'guns/bullet_hit' : `guns/ric${1 + Math.floor(Math.random() * 5)}`, 0.9); }
    }
    function splat(x, y, k, s) { for (let i = 0; i < 6 * k; i++) st.splats.push({ x: x + (Math.random() - 0.5) * s * 0.2, y: y + (Math.random() - 0.5) * s * 0.2, r: (0.02 + Math.random() * 0.05) * s * k, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, t: 0 }); }

    // ---------- руки и спрайт оружия ----------
    function ik(a, c, l1, l2, bend) {
      const dx = c[0] - a[0], dy = c[1] - a[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1);
      const ang = Math.atan2(dy, dx), k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
      return [a[0] + Math.cos(ang + bend * k) * l1, a[1] + Math.sin(ang + bend * k) * l1];
    }
    function sleeve(a, b, wA, wB) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
      g.beginPath(); g.moveTo(a[0] + nx * wA, a[1] + ny * wA); g.lineTo(b[0] + nx * wB, b[1] + ny * wB); g.lineTo(b[0] - nx * wB, b[1] - ny * wB); g.lineTo(a[0] - nx * wA, a[1] - ny * wA); g.closePath();
      g.fillStyle = '#1b1d1c'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 4; g.stroke();
      // складки брони
      g.strokeStyle = '#3a403c'; g.lineWidth = 3;
      for (let k = 1; k < 4; k++) { const t = k / 4, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, ww = wA + (wB - wA) * t; g.beginPath(); g.moveTo(x + nx * ww * 0.8, y + ny * ww * 0.8); g.lineTo(x - nx * ww * 0.6, y - ny * ww * 0.6); g.stroke(); }
    }
    function fist(p, r, a) { g.save(); g.translate(p[0], p[1]); g.rotate(a); g.beginPath(); g.ellipse(0, 0, r * 1.2, r, 0, 0, 7); g.fillStyle = '#242624'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 4; g.stroke(); g.strokeStyle = '#444'; g.lineWidth = 2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-r * 0.6, i * r * 0.35); g.lineTo(r * 0.5, i * r * 0.35); g.stroke(); } g.restore(); }
    function drawArms(w, h) {
      const s = Math.min(w, h) / 360, rec = st.recoil, ck = st.coverK;
      const sway = Math.sin(st.t * 1.6) * 3 * s;
      // оружие: спрайт 32×32, крупно, стволом в коридор; в укрытии уходит вниз
      const gx = w * 0.73 + st.aim.x * 30 * s + sway, gy = h * 0.8 + st.aim.y * 22 * s + rec * 12 * s + ck * h * 0.45;
      const ang = 0.4 + st.aim.x * 0.12 - rec * 0.08 + ck * 0.5 + (st.reload > 0 ? 0.5 + Math.sin(st.reload * 6) * 0.15 : 0);
      const S = 6 * s;                               // масштаб пикселя спрайта
      // левая рука под цевьё
      const fore = [gx + Math.cos(ang + Math.PI) * 11 * S, gy + Math.sin(ang + Math.PI) * 11 * S + 3 * S];
      const ls = [w * 0.28, h * 1.25], le = ik(ls, fore, 160 * s, 150 * s, -1);
      sleeve(ls, le, 46 * s, 36 * s); sleeve(le, fore, 36 * s, 26 * s); fist(fore, 22 * s, ang);
      // спрайт: пиксели без сглаживания
      g.save(); g.translate(gx, gy); g.rotate(ang); g.scale(-1, 1);
      g.imageSmoothingEnabled = false;
      if (gun.complete && gun.naturalWidth) g.drawImage(gun, -16 * S, -16 * S, 32 * S, 32 * S);
      g.restore();
      // вспышка у дула
      if (rec > 0.6) {
        const mx = gx + Math.cos(ang + Math.PI) * 17 * S, my = gy + Math.sin(ang + Math.PI) * 17 * S - 2 * S;
        g.globalCompositeOperation = 'lighter';
        const rg = g.createRadialGradient(mx, my, 0, mx, my, 70 * s);
        rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(0.25, 'rgba(255,210,100,.9)'); rg.addColorStop(1, 'rgba(255,130,20,0)');
        g.fillStyle = rg; g.beginPath(); g.moveTo(mx, my);
        for (let i = 0; i < 10; i++) { const a = ang + Math.PI + (i - 4.5) * 0.28, r = (i % 2 ? 26 : 70) * s * (0.7 + Math.random() * 0.5); g.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); }
        g.fill(); g.globalCompositeOperation = 'source-over';
      }
      // правая рука на рукояти
      const grip = [gx + Math.cos(ang) * 2 * S - Math.sin(ang) * 5 * S, gy + Math.sin(ang) * 2 * S + Math.cos(ang) * 5 * S];
      const rs = [w * 1.05, h * 1.2], re = ik(rs, grip, 150 * s, 130 * s, 1);
      sleeve(rs, re, 54 * s, 40 * s); sleeve(re, grip, 40 * s, 28 * s); fist(grip, 24 * s, ang + 0.4);
    }

    // ---------- цикл ----------
    let last = performance.now(), raf = 0;
    const hum = storm.start(); hum.set(0.15);
    function frame(now) {
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.over) return;
      // замедление: последние 5 патронов — слоу-мо и сердце
      const lastShots = st.hell && st.ammo <= 5;
      st.slow += ((lastShots ? 0.35 : 1) - st.slow) * Math.min(1, dt * 4);
      if (lastShots && (st.beat = (st.beat || 0) - dt) <= 0) { st.beat = 0.9; snd.heart?.(); }
      if (st.hellIntro > 0) { st.hellIntro = (st.hellEnd - now) / 1000; if (st.hellIntro <= 0) { st.hell = true; root.classList.add('hell'); st.hp = Math.max(st.hp, 40); } }
      dt *= st.slow;
      st.t += dt;
      const w = c2.clientWidth, h = c2.clientHeight;
      if (c2.width !== w || c2.height !== h) { c2.width = w; c2.height = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      // укрытие и стрельба
      st.coverK += ((st.cover ? 1 : 0) - st.coverK) * Math.min(1, dt * 10);
      cov.classList.toggle('on', st.cover);
      if (st.cover && st.ammo < MAG && st.reload <= 0 && st.spare > 0 && !st.hell) reload();
      st.cool -= dt; if (st.fire && st.cool <= 0) shoot();
      st.recoil = Math.max(0, st.recoil - dt * 9);
      if (st.reload > 0) { st.reload -= dt; if (st.reload <= 0) { st.ammo = MAG; st.spare--; startHell(); sample('guns/lmg_bolt_closed', 1.3) || sample('guns/smg_cock', 1.2); } }
      // рейдеры: прячутся → поднимаются → целятся → стреляют → прячутся
      const hard = 1 + st.t / DURATION;
      for (const f of st.foes) {
        if (f.dead) { f.dead += dt; if (f.dead > 3) { f.dead = 0; f.hp = 1; f.state = 'hide'; f.up = 0; f.t = 2 + Math.random() * 3; } continue; }
        f.t -= dt;
        if (st.hell) { f.z -= dt * 0.8; if (st.hellIntro <= 0 && f.state === 'aim') f.t -= dt; }
        const target = f.state === 'hide' ? 0 : 1;
        f.up += (target - f.up) * Math.min(1, dt * 6);
        if (f.t > 0) continue;
        if (f.state === 'hide') { if (Math.random() < (st.hell ? 0.5 : 0.25)) shout(f, st.hell ? 'hell' : st.kills > 3 ? 'shock' : 'fire'); f.state = 'aim'; f.t = (0.9 + Math.random() * 0.6) / hard; }
        else if (f.state === 'aim') { f.state = 'fire'; f.t = 0.7 + Math.random() * 0.5; f.shot = 0; }
        else if (f.state === 'fire') {
          if (++f.shots % 2 === 0) { f.state = 'reload'; f.t = 1.6; sample(f.wpn === 'shotgun' ? 'guns/shotgun_insert' : f.wpn === 'lmg' ? 'guns/lmg_magin' : 'guns/smg_magin', 0.9, 0.95); setTimeout(() => sample('guns/smg_cock', 0.8), 900); shout(f, 'reload'); }
          else { f.state = 'hide'; f.t = (1.5 + Math.random() * 2.5) / hard; }
        }
        else if (f.state === 'reload') { f.state = 'hide'; f.t = 0.3; }
      }
      // огонь рейдеров: попадают, если мы не в укрытии
      for (const f of st.foes) if (f.state === 'fire' && !f.dead) {
        f.shot = (f.shot || 0) - dt;
        if (f.shot <= 0) {
          if (Math.random() < 0.5) setTimeout(() => sample(Math.random() < 0.7 ? 'guns/bullet_hit' : `guns/ric${1 + Math.floor(Math.random() * 5)}`, 0.6), 80); f.shot = 0.18; const gs = { smg: 'guns/c-20r', shotgun: 'guns/shotgun', lmg: 'guns/lmg', rifle: 'guns/rifle' }[f.wpn]; (sample(gs, 1.2, 0.95) || snd.loud('smg'));
          if (st.coverK < 0.5 && st.hellIntro <= 0 && Math.random() < (st.hell ? 0.12 : 0.28)) { st.hp -= 3 + Math.random() * 3; st.shake = 1; st.blood = 1; st.flash = 1; hurt(); }
        }
      }
      st.shake = Math.max(0, st.shake - dt * 3); st.blood = Math.max(0, st.blood - dt);
      // камера: в укрытии присели, тряска, лёгкий поворот за прицелом
      if (st.hell) st.walk = Math.min(8, st.walk + dt * 0.35);
      const dark = st.hellIntro > 0 ? 1 : 0;
      camera.position.set(st.coverK * 0.62, 1.6 - st.coverK * 0.15 + Math.sin(st.walk * 6) * 0.03, 0.1 + st.coverK * 0.25 - st.walk);
      root.style.setProperty('--dark', String(dark));
      camera.rotation.set(-st.aim.y * 0.05 + st.recoil * 0.012 + (Math.random() - 0.5) * st.shake * 0.04, -st.aim.x * 0.07 + st.coverK * 0.12 + (Math.random() - 0.5) * st.shake * 0.04, st.coverK * 0.04);
      st.flash = Math.max(0, (st.flash || 0) - dt * 6);
      const epic = st.hell ? 1 : 0.4, zoom = 1 + (Math.sin(st.t * 1.3) * 0.03 + Math.sin(st.t * 3.7) * 0.015) * (1 + epic * 2) + st.shake * 0.08 * (1 + epic) + st.recoil * 0.03 * epic;
      if (st.hell && Math.random() < dt * 3) st.flash = Math.max(st.flash, 0.6);
      const blur = Math.max(0, Math.sin(st.t * 0.9) * 1.6 + st.blood * 2) + st.coverK * 4;
      root.style.setProperty('--z', zoom.toFixed(3)); root.style.setProperty('--bl', `${blur.toFixed(1)}px`); root.style.setProperty('--fl', st.flash.toFixed(2));

      // оружие: покачивание, отдача, укрытие, перезарядка
      const ck = st.coverK, rec = st.recoil, rl = st.reload > 0 ? Math.sin(Math.min(1, (1.5 - st.reload) / 1.5) * Math.PI) : 0;
      gunG.position.set(0.13 + Math.sin(st.t * 1.6) * 0.006 + st.aim.x * 0.03, -0.16 + Math.cos(st.t * 3.2) * 0.004 - ck * 0.35 - rl * 0.12 - st.aim.y * 0.02, -0.5 + rec * 0.05);
      gunG.rotation.set(rec * 0.12 + ck * 0.6 + rl * 0.5 - st.aim.y * 0.12, -st.aim.x * 0.15 + 0.04, rl * 0.6 + ck * 0.3);
      flash.visible = rec > 0.6; flash.rotation.z = Math.random() * 6; flash.scale.setScalar(0.7 + Math.random() * 0.6); mlight.intensity = rec > 0.6 ? 5 : 0;
      leds.forEach((l, i) => (l.visible = i < Math.ceil((st.ammo / MAG) * 10)));
      led.material.color.set(st.reload > 0 ? 0xff3020 : 0x40ff70);
      vm.updateMatrixWorld(true);
      aimArm(armR, new THREE.Vector3(0.5, -0.6, 0.1), new THREE.Vector3(0, -0.13, 0.03));
      aimArm(armL, new THREE.Vector3(-0.3, -0.65, -0.1), new THREE.Vector3(0, -0.06, -0.4 + rl * 0.3));
      lampsL.forEach((l, i) => (l.intensity = (Math.sin(st.t * (2 + i * 0.7) + i) > 0.3 || Math.random() < 0.03) ? 2.2 : 0.15));
      renderer.render(scene, camera);
      // 2D
      g.clearRect(0, 0, w, h);
      const edgeX = proj(0.5, 1, -0.35, w, h)[0];
      g.save(); if (st.coverK > 0.05) { g.beginPath(); g.rect(0, 0, Math.max(0, edgeX), h); g.clip(); }
      for (const f of [...st.foes].sort((a, b) => a.z - b.z)) drawFoe(f, w, h);
      drawShouts(w, h);
      g.restore();
      if (st.jug) drawJug(w, h);
      // кровь и пыль от попаданий
      st.splats = st.splats.filter((p) => (p.t += dt) < (p.dust ? 0.4 : 1.2));
      for (const p of st.splats) {
        if (p.dust) { g.fillStyle = `rgba(200,200,200,${0.6 - p.t * 1.5})`; g.beginPath(); g.arc(p.x, p.y, p.r + p.t * 30, 0, 7); g.fill(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
        g.fillStyle = `rgba(190,0,0,${1 - p.t / 1.2})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      }
      // прицел
      if (st.coverK < 0.3) {
        const cx = (st.aim.x + 1) / 2 * w, cy = (st.aim.y + 1) / 2 * h, cr = 9 + st.recoil * 8;
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.stroke();
        g.fillStyle = '#e02020'; g.fillRect(cx - 2, cy - 2, 4, 4);
      }
      // HUD
      st.sci = Math.min(SCI, Math.floor((st.t / (DURATION * 0.6)) * SCI));
      $('.sh-life b').style.width = `${Math.max(0, st.hp)}%`;
      $('.sh-time').textContent = `${Math.ceil(DURATION - st.t)}`;
      $('.sh-sci').textContent = `У ЧЕЛНОКА ${st.sci}/${SCI}`;
      $('.sh-kills').textContent = String(st.kills);
      $('.sh-ammo').innerHTML = st.reload > 0 ? 'ПЕРЕЗАРЯДКА' : `${'▮'.repeat(Math.ceil(st.ammo / 3))}<em>${st.ammo}</em><small> +${st.spare * MAG}</small>`;
      $('.sh-blood').style.opacity = String(Math.min(1, st.blood * 0.8 + (1 - st.hp / HP) * 0.4));
      if (st.hp <= 0 && !st.jug) { if (st.hell) st.hp = 5; else return end(false); }
      if (!st.jug && (st.t >= DURATION || (st.hell && st.ammo <= 0))) juggernaut();
      if (st.jug) { if (jugFrame(dt, now, w, h)) return; }
      raf = requestAnimationFrame(frame);
    }
    function end(win) {
      st.over = true; cancelAnimationFrame(raf); hum.stop();
      say(win ? 'Они успели. Все двадцать.' : 'Очередь из пулемёта перебила ему ноги.', win ? '' : 'warn');
      win ? storm.captured() : storm.alarm();
      setTimeout(() => done(win), 2600);
    }
    say('Держать коридор, пока они не у челнока.');
    root.__jug = () => juggernaut(); // автотест
    const thinkT = setInterval(() => { if (!st.over && Math.random() < 0.6) say(TXT.k21[Math.floor(Math.random() * TXT.k21.length)]); }, 11000);
    raf = requestAnimationFrame(frame);
    return () => { clearInterval(thinkT); st.over = true; cancelAnimationFrame(raf); hum.stop(); removeEventListener('keydown', kd); removeEventListener('keyup', kd); renderer.dispose(); };
  },
};
