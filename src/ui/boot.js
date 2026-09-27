import { unlockAudio, sfx } from '../audio.js';

// Заставка: название с глитчем, пепел и помехи на фоне. Касание — вход в игру.
export function runBoot(onStart) {
  const el = document.getElementById('boot');
  const cv = document.getElementById('bootFx');
  const g = cv.getContext('2d');
  let alive = true, started = false;

  // пепел, медленно поднимающийся вверх, и редкие горизонтальные разрывы
  const ash = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), v: 0.008 + Math.random() * 0.02, a: Math.random() }));
  let tear = 0, tearY = 0;
  let last = performance.now();
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
    g.clearRect(0, 0, w, h);
    for (const p of ash) {
      p.y -= p.v * dt * 3; p.x += Math.sin(now / 1500 + p.a * 9) * 0.0003;
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      g.fillStyle = `rgba(255,${40 + p.a * 60},${60 + p.a * 40},${0.12 + p.a * 0.25})`;
      const sz = Math.ceil(p.s * 2);
      g.fillRect(Math.round(p.x * w), Math.round(p.y * h), sz, sz);
    }
    // катящаяся полоса развёртки
    const roll = ((now / 6000) % 1) * (h + 200) - 100;
    const rg = g.createLinearGradient(0, roll - 80, 0, roll + 80);
    rg.addColorStop(0, 'rgba(255,0,40,0)'); rg.addColorStop(0.5, 'rgba(255,0,40,.05)'); rg.addColorStop(1, 'rgba(255,0,40,0)');
    g.fillStyle = rg; g.fillRect(0, roll - 80, w, 160);
    // разрыв кадра
    if (tear <= 0 && Math.random() < dt * 0.35) { tear = 0.12 + Math.random() * 0.15; tearY = Math.random() * h; }
    if (tear > 0) {
      tear -= dt;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `rgba(${i % 2 ? '0,220,255' : '255,0,60'},.14)`;
        g.fillRect((Math.random() - 0.5) * 30, tearY + i * 7 + (Math.random() - 0.5) * 20, w, 2 + Math.random() * 5);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function start(e) {
    if (started) return;
    e?.preventDefault?.();
    started = true;
    unlockAudio(); sfx.start(); setTimeout(() => sfx.glitch(), 250);
    el.classList.add('hit');
    setTimeout(() => { el.classList.add('gone'); onStart(); }, 650);
    setTimeout(() => { alive = false; el.hidden = true; }, 2200);
    el.removeEventListener('pointerdown', start);
    removeEventListener('keydown', start);
  }
  el.addEventListener('pointerdown', start);
  addEventListener('keydown', start);
}
