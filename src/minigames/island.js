import { sfx, sample, preload, sampleHeavy, ringing } from '../audio.js';

// Глава 5 — вымышленный остров-курорт корпорации: 5 зарядов мимо прожекторов, детонатор, взрыв со слоу-мо.
export default {
  name: 'Остров',
  immersive: true,
  run(root, done) {
    root.className = 'ag-root';
    root.innerHTML = '<canvas></canvas><div class="ag-top"><b>ОСТРОВ</b><p>Ставьте заряды на метки. Не попадайтесь в луч прожектора.</p></div><button class="pt-det" hidden>ПОДОРВАТЬ</button>';
    const cv = root.querySelector('canvas'), g = cv.getContext('2d'), det = root.querySelector('.pt-det'), top = root.querySelector('.ag-top');
    preload(['guns/flash_bang', 'guns/largethud', 'guns/gib1', 'guns/bodyfall1', 'guns/empty', 'guns/minigun']);
    const SPOTS = [[0.3, 0.62], [0.42, 0.5], [0.56, 0.48], [0.68, 0.58], [0.5, 0.66]];
    const S = { t: 0, set: [], hits: 0, boom: -1, slow: 1, shake: 0, parts: [], deb: [], over: false };
    const lights = [{ x: 0.35, v: 0.22 }, { x: 0.7, v: -0.28 }];
    const W = () => cv.clientWidth, H = () => cv.clientHeight;
    const inLight = (x) => lights.some((l) => Math.abs(l.x - x) < 0.07);
    cv.addEventListener('pointerdown', (e) => {
      if (S.boom >= 0 || S.over) return;
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const k = SPOTS.findIndex(([sx, sy], i) => !S.set.includes(i) && Math.hypot(sx - x, (sy - y) * 0.6) < 0.06);
      if (k < 0) return;
      if (inLight(SPOTS[k][0])) { S.hits++; S.shake = 0.6; sfx.denied(); sample('guns/empty', 1); if (S.hits >= 3) { S.over = true; top.querySelector('p').textContent = 'ВАС ЗАСЕКЛИ'; setTimeout(() => done(false), 1600); } return; }
      S.set.push(k); sfx.click();
      if (S.set.length === SPOTS.length) { det.hidden = false; top.querySelector('p').textContent = 'Все заряды на месте. Жмите.'; }
    });
    det.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); det.hidden = true; let n = 3; top.querySelector('p').textContent = '3';
      const tick = setInterval(() => { n--; sfx.click(); top.querySelector('p').textContent = n > 0 ? String(n) : ''; if (n <= 0) { clearInterval(tick); boom(); } }, 700);
    });
    function boom() {
      S.boom = 0; S.slow = 0.25; S.shake = 2.5; top.style.opacity = 0;
      sampleHeavy('guns/flash_bang', 3, 10); sample('guns/largethud', 2); setTimeout(() => sample('guns/bodyfall1', 1.5), 300); ringing(5);
      const w = W(), h = H();
      for (const [sx, sy] of SPOTS) for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 420; S.parts.push({ x: sx * w, y: sy * h, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 160, r: 6 + Math.random() * 22, life: 1 + Math.random() * 2, t: 0 }); }
      for (let i = 0; i < 70; i++) { const a = -Math.random() * 3.14, v = 200 + Math.random() * 500; S.deb.push({ x: w * 0.5, y: h * 0.55, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, vr: (Math.random() - 0.5) * 20, s: 3 + Math.random() * 9 }); }
      setTimeout(() => { top.style.opacity = 1; top.querySelector('b').textContent = 'ЦЕЛЬ УНИЧТОЖЕНА'; top.querySelector('p').textContent = ''; }, 5000);
      setTimeout(() => { S.over = true; done(true); }, 7000);
    }
    root.__boom = boom; // автотест
    let last = performance.now(), raf = 0;
    function frame(now) {
      const real = Math.min(0.05, (now - last) / 1000); last = now;
      if (S.boom >= 0) { S.boom += real; S.slow += (1 - S.slow) * real * 0.6; }
      const dt = real * S.slow; S.t += dt;
      const w = W(), h = H(); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      S.shake = Math.max(0, S.shake - real * 0.8);
      g.save(); g.translate((Math.random() - 0.5) * S.shake * 20, (Math.random() - 0.5) * S.shake * 20);
      // ночь, море, остров
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#05060f'); sky.addColorStop(0.55, '#121a2e'); sky.addColorStop(1, '#03060c'); g.fillStyle = sky; g.fillRect(-40, -40, w + 80, h + 80);
      g.fillStyle = '#0a1426'; g.fillRect(-40, h * 0.6, w + 80, h);
      for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(120,160,220,.15)'; g.fillRect(((i * 97 + S.t * 30) % (w + 40)) - 20, h * (0.62 + (i % 7) * 0.05), 24, 2); }
      g.fillStyle = '#1d1a12'; g.beginPath(); g.ellipse(w * 0.5, h * 0.63, w * 0.34, h * 0.09, 0, 0, 7); g.fill();
      g.fillStyle = '#2a2f22'; g.beginPath(); g.ellipse(w * 0.5, h * 0.6, w * 0.28, h * 0.07, 0, 0, 7); g.fill();
      if (S.boom < 0.15) {
        // вилла, пальмы, вышки
        g.fillStyle = '#d8d2c4'; g.fillRect(w * 0.38, h * 0.43, w * 0.24, h * 0.14); g.fillStyle = '#8a7f6a'; g.fillRect(w * 0.36, h * 0.41, w * 0.28, h * 0.025);
        g.fillStyle = '#ffcf6a'; for (let i = 0; i < 6; i++) g.fillRect(w * (0.4 + i * 0.035), h * 0.47, w * 0.018, h * 0.03);
        for (const px of [0.25, 0.75, 0.31]) { g.strokeStyle = '#3a2a18'; g.lineWidth = 5; g.beginPath(); g.moveTo(w * px, h * 0.6); g.quadraticCurveTo(w * (px + 0.02), h * 0.48, w * px, h * 0.4); g.stroke(); g.fillStyle = '#16301c'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(w * px + Math.cos(k * 1.3) * 22, h * 0.4 + 6, 26, 7, k * 1.3, 0, 7); g.fill(); } }
        g.fillStyle = '#444'; g.fillRect(w * 0.22, h * 0.3, 8, h * 0.3); g.fillRect(w * 0.78 - 8, h * 0.3, 8, h * 0.3);
        // прожекторы
        for (const [i, l] of lights.entries()) {
          l.x += l.v * dt; if (l.x < 0.24 || l.x > 0.76) l.v *= -1;
          const ox = i ? w * 0.78 : w * 0.22, oy = h * 0.3;
          const lg = g.createLinearGradient(ox, oy, l.x * w, h * 0.6); lg.addColorStop(0, 'rgba(255,250,200,.5)'); lg.addColorStop(1, 'rgba(255,250,200,.12)');
          g.fillStyle = lg; g.beginPath(); g.moveTo(ox, oy); g.lineTo((l.x - 0.07) * w, h * 0.66); g.lineTo((l.x + 0.07) * w, h * 0.66); g.fill();
        }
        // метки и заряды
        SPOTS.forEach(([sx, sy], i) => {
          const on = S.set.includes(i);
          g.fillStyle = on ? (Math.sin(S.t * 10) > 0 ? '#ff2020' : '#600') : `rgba(255,60,80,${0.4 + Math.sin(S.t * 4 + i) * 0.3})`;
          g.beginPath(); g.arc(sx * w, sy * h, on ? 7 : 14, 0, 7); g.fill();
          if (!on) { g.strokeStyle = '#ff3a4e'; g.lineWidth = 2; g.beginPath(); g.arc(sx * w, sy * h, 20, 0, 7); g.stroke(); }
        });
      }
      // взрыв: вспышка, волна, огонь, дым, обломки
      if (S.boom >= 0) {
        const b = S.boom;
        if (b < 0.6) { g.fillStyle = `rgba(255,250,230,${1 - b / 0.6})`; g.fillRect(-40, -40, w + 80, h + 80); }
        g.strokeStyle = `rgba(255,220,160,${Math.max(0, 0.8 - b * 0.4)})`; g.lineWidth = 10; g.beginPath(); g.ellipse(w * 0.5, h * 0.6, b * w * 0.9, b * h * 0.25, 0, 0, 7); g.stroke();
        const fb = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.35 * Math.min(1, b * 2));
        fb.addColorStop(0, `rgba(255,240,180,${Math.max(0, 1 - b / 5)})`); fb.addColorStop(0.4, `rgba(255,120,20,${Math.max(0, 0.9 - b / 6)})`); fb.addColorStop(1, 'rgba(80,0,0,0)');
        g.fillStyle = fb; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.35, 0, 7); g.fill();
        for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy = p.vy * 0.98 - 30 * dt; const k = p.t / p.life; if (k > 1) continue; g.fillStyle = k < 0.4 ? `rgba(255,${180 - k * 300},40,${1 - k})` : `rgba(40,35,35,${(1 - k) * 0.8})`; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 2), 0, 7); g.fill(); }
        g.fillStyle = '#111'; for (const d of S.deb) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 500 * dt; d.rot += d.vr * dt; g.save(); g.translate(d.x, d.y); g.rotate(d.rot); g.fillRect(-d.s, -d.s / 2, d.s * 2, d.s); g.restore(); }
      }
      g.restore();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  },
};
