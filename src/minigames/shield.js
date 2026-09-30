import * as THREE from 'three';
import { sfx, storm, war as snd } from '../audio.js';

// Глава 10 «Щит» — К-21 держит коридор, пока учёные уходят к челноку.
// 3D: только коридор (бетон, трубы, аварийные лампы, гермоворота вдали).
// 2D поверх: руки в тяжёлой броне и пистолет-пулемёт на «костях» (плечо → предплечье → кисть → оружие), отдача, покачивание.
// Цель: стрелять по вспышкам выстрелов рейдеров в конце коридора. Пропущенная вспышка — попадание в нас.
const DURATION = 60, MAG = 32, HP = 100;

export default {
  name: 'Щит',
  run(root, done) {
    root.classList.add('sh-root');
    root.innerHTML = `<canvas class="sh-3d"></canvas><canvas class="sh-2d"></canvas>
      <div class="sh-hud"><span class="sh-hp"></span><span class="sh-time"></span><span class="sh-sci"></span></div>
      <button class="sh-reload">ПЕРЕЗАРЯДКА</button><div class="sh-ammo"></div><div class="sh-blood"></div><p class="sh-msg"></p>`;
    const $ = (q) => root.querySelector(q);
    const c3 = $('.sh-3d'), c2 = $('.sh-2d'), g = c2.getContext('2d');

    // ---------- 3D коридор ----------
    const renderer = new THREE.WebGLRenderer({ canvas: c3, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050304); scene.fog = new THREE.Fog(0x050304, 4, 30);
    const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60); camera.position.set(0, 1.6, 0);
    const concrete = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
      x.fillStyle = '#5a5552'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.strokeRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const L = 30, W = 3, H = 3;
    const mat = (rx, ry) => { const t = concrete.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); };
    const plane = (w, h, m) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    const floor = plane(W, L, mat(2, 20)); floor.rotation.x = -Math.PI / 2; floor.position.z = -L / 2; scene.add(floor);
    const ceil = plane(W, L, mat(2, 20)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -L / 2); scene.add(ceil);
    for (const s of [-1, 1]) { const w = plane(L, H, mat(20, 2)); w.rotation.y = -s * Math.PI / 2; w.position.set(s * W / 2, H / 2, -L / 2); scene.add(w); }
    // трубы вдоль стен, рёбра, лампы
    const pipeM = new THREE.MeshStandardMaterial({ color: 0x2e3236, metalness: 0.7, roughness: 0.4 });
    for (const [x, y, r] of [[-1.35, 2.6, 0.08], [-1.35, 2.35, 0.05], [1.38, 2.7, 0.06]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), pipeM); p.rotation.x = Math.PI / 2; p.position.set(x, y, -L / 2); scene.add(p); }
    const lamps = [];
    for (let z = -3; z > -L; z -= 5) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, 0.25), pipeM); rib.position.set(0, H - 0.09, z); scene.add(rib);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xff2010 })); lamp.position.set(0, H - 0.2, z); scene.add(lamp);
      const pl = new THREE.PointLight(0xff2a14, 3, 7, 1.6); pl.position.set(0, H - 0.4, z); scene.add(pl); lamps.push([lamp, pl]);
    }
    // гермоворота в конце: закрыты, ящики-укрытия рейдеров
    const door = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3a34, metalness: 0.6, roughness: 0.5 })); door.position.set(0, H / 2, -L); scene.add(door);
    const crateM = new THREE.MeshStandardMaterial({ color: 0x4a4638, roughness: 0.8 });
    const covers = [[-0.9, -18], [0.8, -21], [-0.6, -25], [0.9, -14]];
    for (const [x, z] of covers) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), crateM); c.position.set(x, 0.45, z); scene.add(c); }
    scene.add(new THREE.AmbientLight(0x301818, 1.2));
    const flashLight = new THREE.PointLight(0xffc070, 0, 8, 1.5); scene.add(flashLight);
    const muzzleLight = new THREE.PointLight(0xffd080, 0, 5, 1.5); muzzleLight.position.set(0.3, 1.3, -0.8); scene.add(muzzleLight);

    // ---------- состояние ----------
    const st = { t: 0, hp: HP, ammo: MAG, reload: 0, kills: 0, over: false, recoil: 0, sway: 0, aim: { x: 0, y: 0 }, fire: false, cool: 0, shake: 0, flashes: [], next: 1.2, blood: 0, sci: 20 };
    const say = (t, cls = '') => { const m = $('.sh-msg'); m.textContent = t; m.className = `sh-msg on ${cls}`; clearTimeout(say.t); say.t = setTimeout(() => (m.className = 'sh-msg'), 1800); };
    const tmp = new THREE.Vector3();

    // вспышка выстрела рейдера — точка в конце коридора (из-за укрытия)
    function spawn() {
      const [cx, cz] = covers[Math.floor(Math.random() * covers.length)];
      const pos = new THREE.Vector3(cx + (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.7, cz + 0.4);
      st.flashes.push({ pos, t: 0, life: 1.1 + Math.random() * 0.7, shots: 0, seed: Math.random() * 10 });
    }
    // прицел: палец/мышь двигают, выстрел — удержание
    const aimAt = (e) => { const r = c2.getBoundingClientRect(); st.aim.x = ((e.clientX - r.left) / r.width) * 2 - 1; st.aim.y = ((e.clientY - r.top) / r.height) * 2 - 1; };
    c2.addEventListener('pointerdown', (e) => { aimAt(e); st.fire = true; c2.setPointerCapture?.(e.pointerId); });
    c2.addEventListener('pointermove', (e) => { if (st.fire || e.pointerType === 'mouse') aimAt(e); });
    const up = () => (st.fire = false); c2.addEventListener('pointerup', up); c2.addEventListener('pointercancel', up);
    const reload = () => { if (st.reload > 0 || st.ammo === MAG) return; st.reload = 1.6; storm.lever(); say('Перезарядка!'); };
    $('.sh-reload').addEventListener('pointerdown', (e) => { e.stopPropagation(); reload(); });
    const kd = (e) => { if (e.key === 'r' || e.key === 'к') reload(); };
    addEventListener('keydown', kd);

    function shoot() {
      if (st.reload > 0) return;
      if (st.ammo <= 0) { sfx.empty?.(); reload(); return; }
      st.ammo--; st.recoil = 1; st.cool = 0.075; muzzleLight.intensity = 6; snd.shot('smg');
      // попадание: ближайшая вспышка у прицела на экране
      const w = c2.clientWidth, h = c2.clientHeight;
      const sx = (st.aim.x + 1) / 2 * w, sy = (st.aim.y + 1) / 2 * h;
      for (const f of st.flashes) {
        tmp.copy(f.pos).project(camera);
        const fx = (tmp.x + 1) / 2 * w, fy = (1 - tmp.y) / 2 * h;
        if (Math.hypot(fx - sx, fy - sy) < Math.min(w, h) * 0.07) { f.dead = true; st.kills++; if (Math.random() < 0.5) say(['Лёг.', 'Минус один.', 'Есть!', 'Держу!'][Math.floor(Math.random() * 4)]); break; }
      }
      st.flashes = st.flashes.filter((f) => !f.dead);
    }

    // ---------- 2D руки на костях ----------
    // кость: [длина, угол] от родителя; рисуем сегменты брони поверх
    function drawArms(w, h) {
      const s = Math.min(w, h) / 400, rec = st.recoil, sway = Math.sin(st.t * 1.7) * 3 + Math.sin(st.t * 0.9) * 2;
      const ax = st.aim.x * 40 * s, ay = st.aim.y * 30 * s;
      // точка хвата оружия
      const gx = w * 0.7 + ax + sway * s, gy = h * 0.82 + ay + rec * 14 * s + Math.cos(st.t * 1.7) * 2 * s;
      const tilt = 0.42 + st.aim.x * 0.08 - rec * 0.06 + (st.reload > 0 ? Math.sin(st.reload * 4) * 0.25 + 0.4 : 0);
      const bone = (x, y, len, ang) => [x + Math.cos(ang) * len, y + Math.sin(ang) * len];
      // правая рука: плечо за кадром справа снизу → локоть → кисть на рукояти
      const rs = [w * 0.98, h * 1.1], rh = [gx + 20 * s, gy + 34 * s];
      const re = ik(rs, rh, 150 * s, 130 * s, 1);
      // левая рука: плечо слева снизу → кисть на цевье
      const fore = bone(gx, gy, -120 * s, tilt);
      const ls = [w * 0.2, h * 1.15], lh = [fore[0] + 10 * s, fore[1] + 16 * s];
      const le = ik(ls, lh, 190 * s, 150 * s, -1);
      limb(ls, le, lh, s, true);
      drawGun(gx, gy, tilt, s);
      limb(rs, re, rh, s, false);
    }
    // двухзвенная ИК: плечо a, кисть c, длины l1 l2
    function ik(a, c, l1, l2, bend) {
      const dx = c[0] - a[0], dy = c[1] - a[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1);
      const ang = Math.atan2(dy, dx), k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
      return [a[0] + Math.cos(ang + bend * k) * l1, a[1] + Math.sin(ang + bend * k) * l1];
    }
    // сегмент брони: толстая пластина с тёмной кромкой и зелёным отблеском, как на референсе
    function plate(a, b, wA, wB, col) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
      g.beginPath();
      g.moveTo(a[0] + nx * wA, a[1] + ny * wA); g.lineTo(b[0] + nx * wB, b[1] + ny * wB);
      g.lineTo(b[0] - nx * wB, b[1] - ny * wB); g.lineTo(a[0] - nx * wA, a[1] - ny * wA); g.closePath();
      const gr = g.createLinearGradient(a[0] + nx * wA, a[1] + ny * wA, a[0] - nx * wA, a[1] - ny * wA);
      gr.addColorStop(0, col[0]); gr.addColorStop(0.5, col[1]); gr.addColorStop(1, col[2]);
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#0a0c0b'; g.lineWidth = 3; g.stroke();
    }
    const ARMOR = ['#3c4a44', '#56675c', '#1c2320'], GLOVE = ['#2a2d2c', '#3e4442', '#141615'];
    function limb(sh, el, hand, s, left) {
      plate(sh, el, 58 * s, 44 * s, ARMOR);                       // плечо — массивная пластина
      g.fillStyle = '#6cff9a'; g.globalAlpha = 0.25; g.beginPath(); g.arc(el[0], el[1], 20 * s, 0, 7); g.fill(); g.globalAlpha = 1; // зелёный отблеск на локте
      plate(el, hand, 40 * s, 30 * s, ARMOR);                      // предплечье
      for (let k = 1; k < 4; k++) { const t = k / 4, x = el[0] + (hand[0] - el[0]) * t, y = el[1] + (hand[1] - el[1]) * t; g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 30 * s, 0, 7); g.stroke(); }
      g.fillStyle = GLOVE[1]; g.strokeStyle = '#0a0c0b'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(hand[0], hand[1], 30 * s, 24 * s, left ? -0.3 : 0.4, 0, 7); g.fill(); g.stroke(); // кулак в перчатке
    }
    function drawGun(x, y, a, s) {
      g.save(); g.translate(x, y); g.rotate(a);
      const R = (px, py, pw, ph, c) => { g.fillStyle = c; g.fillRect(px * s, py * s, pw * s, ph * s); g.strokeStyle = '#050606'; g.lineWidth = 2; g.strokeRect(px * s, py * s, pw * s, ph * s); };
      R(-150, -34, 190, 44, '#262a2c');          // ствольная коробка
      R(-230, -24, 90, 26, '#1d2022');           // цевьё
      R(-262, -18, 36, 14, '#111314');           // ствол-компенсатор
      R(20, -44, 70, 14, '#1a1d1f');             // планка / прицел
      R(-40, 8, 34, 64, '#18191a');              // магазин
      R(34, 4, 30, 50, '#202324');               // рукоять
      R(40, -24, 90, 30, '#232628');             // приклад
      // жёлтый индикатор боезапаса и зелёный светодиод — как на референсе
      const n = Math.ceil((st.ammo / MAG) * 10);
      for (let i = 0; i < 10; i++) { g.fillStyle = i < n ? '#ffd62a' : '#3a3410'; g.fillRect((-140 + i * 12) * s, -30 * s, 8 * s, 5 * s); }
      g.fillStyle = st.reload > 0 ? '#ff4030' : '#40ff70'; g.fillRect(-100 * s, -8 * s, 6 * s, 10 * s);
      // вспышка у дула
      if (st.recoil > 0.7) {
        g.globalCompositeOperation = 'lighter';
        const fx = -270 * s, rg = g.createRadialGradient(fx, -11 * s, 0, fx, -11 * s, 60 * s);
        rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.3, 'rgba(255,170,60,.8)'); rg.addColorStop(1, 'rgba(255,100,20,0)');
        g.fillStyle = rg; g.beginPath(); g.moveTo(fx, -11 * s);
        for (let i = 0; i < 9; i++) { const aa = Math.PI + (i - 4) * 0.25, r = (i % 2 ? 30 : 70) * s * (0.7 + Math.random() * 0.5); g.lineTo(fx + Math.cos(aa) * r, -11 * s + Math.sin(aa) * r); }
        g.fill(); g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }

    // вспышки рейдеров: реалистичная звезда + ореол + дым
    function drawFlashes(w, h) {
      g.globalCompositeOperation = 'lighter';
      for (const f of st.flashes) {
        const on = Math.sin(f.t * 38 + f.seed) > 0.2; if (!on) continue;
        tmp.copy(f.pos).project(camera); if (tmp.z > 1) continue;
        const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h, r = Math.min(w, h) * (0.03 + Math.random() * 0.02);
        const rg = g.createRadialGradient(x, y, 0, x, y, r * 2.5);
        rg.addColorStop(0, 'rgba(255,250,220,1)'); rg.addColorStop(0.2, 'rgba(255,200,90,.9)'); rg.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r * 2.5, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,230,160,.9)'; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const a = f.seed + i * Math.PI / 2 + Math.random() * 0.3, l = r * (1.5 + Math.random() * 2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      }
      g.globalCompositeOperation = 'source-over';
    }

    // ---------- цикл ----------
    let last = performance.now(), raf = 0;
    const hum = storm.start(); hum.set(0.2);
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.over) return;
      st.t += dt;
      const w = c2.clientWidth, h = c2.clientHeight;
      if (c2.width !== w) { c2.width = w; c2.height = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      // стрельба
      st.cool -= dt; if (st.fire && st.cool <= 0) shoot();
      st.recoil = Math.max(0, st.recoil - dt * 9);
      if (st.reload > 0) { st.reload -= dt; if (st.reload <= 0) { st.ammo = MAG; storm.lock(); } }
      // рейдеры: вспышки чаще к концу
      st.next -= dt; if (st.next <= 0) { spawn(); st.next = Math.max(0.35, 1.3 - st.t / 60) * (0.6 + Math.random() * 0.8); }
      for (const f of st.flashes) {
        f.t += dt;
        if (Math.random() < dt * 8) { flashLight.position.copy(f.pos); flashLight.intensity = 4; }
        if (f.t > f.life) { f.dead = true; st.hp -= 7 + Math.random() * 6; st.shake = 1; st.blood = 1; snd.shot('smg'); storm.gust(); }
      }
      st.flashes = st.flashes.filter((f) => !f.dead);
      flashLight.intensity *= 0.8; muzzleLight.intensity *= 0.6;
      st.shake = Math.max(0, st.shake - dt * 3); st.blood = Math.max(0, st.blood - dt * 0.8);
      // камера: отдача, тряска, лёгкий поворот за прицелом
      camera.rotation.set(-st.aim.y * 0.06 + st.recoil * 0.015 + (Math.random() - 0.5) * st.shake * 0.03, -st.aim.x * 0.08 + (Math.random() - 0.5) * st.shake * 0.03, 0);
      lamps.forEach(([m, l], i) => { const on = Math.sin(st.t * 3 + i * 1.3) > -0.7 || Math.random() < 0.5; l.intensity = on ? 3 : 0.3; });
      renderer.render(scene, camera);
      // 2D
      g.clearRect(0, 0, w, h);
      drawFlashes(w, h);
      drawArms(w, h);
      // прицел
      const cx = (st.aim.x + 1) / 2 * w, cy = (st.aim.y + 1) / 2 * h, cr = 10 + st.recoil * 8;
      g.strokeStyle = 'rgba(255,220,200,.8)'; g.lineWidth = 2;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(cx + dx * cr, cy + dy * cr); g.lineTo(cx + dx * (cr + 10), cy + dy * (cr + 10)); g.stroke(); }
      // HUD
      st.sci = Math.max(0, 20 - Math.floor(st.t / (DURATION / 20)));
      $('.sh-hp').textContent = `ТЕЛО ${Math.max(0, Math.round(st.hp))}%`;
      $('.sh-time').textContent = `${Math.ceil(DURATION - st.t)} С`;
      $('.sh-sci').textContent = `У ЧЕЛНОКА: ${20 - st.sci} / 20`;
      $('.sh-ammo').textContent = st.reload > 0 ? '· · ·' : `${st.ammo} / ${MAG}`;
      $('.sh-blood').style.opacity = String(Math.min(1, st.blood * 0.7 + (1 - st.hp / HP) * 0.5));
      if (st.ammo <= 5 && st.ammo > 0 && st.cool < 0 && !say.low) { say.low = 1; say(`Пять патронов. Четыре. Три.`, 'warn'); }
      if (st.ammo > 5) say.low = 0;
      if (st.hp <= 0) return end(false);
      if (st.t >= DURATION) return end(true);
      raf = requestAnimationFrame(frame);
    }
    function end(win) {
      st.over = true; cancelAnimationFrame(raf); hum.stop();
      say(win ? 'Они успели. Все двадцать.' : 'Очередь из пулемёта перебила ему ноги.', win ? '' : 'warn');
      win ? storm.captured() : storm.alarm();
      setTimeout(() => done(win), 2600);
    }
    say('Держать коридор. Пока они не у челнока.');
    raf = requestAnimationFrame(frame);
    return () => { st.over = true; cancelAnimationFrame(raf); hum.stop(); removeEventListener('keydown', kd); renderer.dispose(); };
  },
};
