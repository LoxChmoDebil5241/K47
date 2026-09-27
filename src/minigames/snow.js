import { el, loop } from './kit.js';

// Рисовать снег: медленные штрихи роняют снег и растят сугроб, резкие — сдувают его.
export default {
  name: 'Рисовать снег',
  how: 'Веди пальцем по тёмному экрану медленно — пойдёт снег. Резко — сугроб сдует. Засыпь поле до конца.',
  run(root, done) {
    const cv = el('canvas', 'mg-canvas', root);
    const hud = el('p', 'mg-hud', root);
    const g = cv.getContext('2d');
    const flakes = []; let pile = 0, last = null, time = 0;
    const resize = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
    resize();
    cv.addEventListener('pointermove', (e) => {
      if (!e.buttons && e.pointerType === 'mouse') { last = null; return; }
      const r = cv.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
      if (last) {
        const sp = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, p.t - last.t);
        if (sp < 0.6) for (let i = 0; i < 3; i++) flakes.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y, v: 20 + Math.random() * 30 });
        else pile = Math.max(0, pile - sp * 0.4);
      }
      last = p;
    });
    cv.addEventListener('pointerup', () => (last = null));
    const stop = loop((dt) => {
      time += dt;
      if (cv.width !== cv.clientWidth) resize();
      const w = cv.width, h = cv.height;
      g.fillStyle = '#050102'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8e0e0';
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]; f.y += f.v * dt; f.x += Math.sin(time * 2 + i) * 10 * dt;
        g.fillRect(Math.round(f.x), Math.round(f.y), 3, 3);
        if (f.y > h - pile / 100 * h * 0.6) { flakes.splice(i, 1); pile = Math.min(100, pile + 0.35); }
      }
      g.fillStyle = '#d8d0d0'; g.fillRect(0, h - pile / 100 * h * 0.6, w, h);
      hud.textContent = `СУГРОБ ${Math.floor(pile)}% · ${Math.max(0, 60 - Math.floor(time))} С`;
      if (pile >= 100) { stop(); done(true); } else if (time > 60) { stop(); done(false); }
    });
    return stop;
  },
};
