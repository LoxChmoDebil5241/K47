import { el, loop, sfx } from './kit.js';

// Посадка в бурю: ветер сносит метку курса, держи её в зелёном окне, пока высота не упадёт до нуля.
// Управление: зажать левую/правую половину поля (или стрелки).
export default {
  name: 'Посадка в бурю',
  how: 'Держи метку внутри зелёного окна, пока высота не станет нулём. Зажимай левую или правую половину поля.',
  run(root, done) {
    const field = el('div', 'mg-field', root);
    const win = el('div', 'mg-window', field);
    const mark = el('div', 'mg-mark', field);
    const hud = el('p', 'mg-hud', root);
    let x = 0.5, v = 0, wind = 0, alt = 100, out = 0, hold = 0, t = 0;
    const press = (e) => { const r = field.getBoundingClientRect(); hold = (e.clientX - r.left) / r.width < 0.5 ? -1 : 1; };
    field.addEventListener('pointerdown', press); field.addEventListener('pointermove', (e) => e.buttons && press(e));
    const up = () => (hold = 0); addEventListener('pointerup', up);
    const key = (e) => { if (e.key === 'ArrowLeft') hold = e.type === 'keydown' ? -1 : 0; if (e.key === 'ArrowRight') hold = e.type === 'keydown' ? 1 : 0; };
    addEventListener('keydown', key); addEventListener('keyup', key);
    const stop = loop((dt) => {
      t += dt;
      if (Math.random() < dt * 0.8) wind = (Math.random() - 0.5) * 1.6;
      v += (wind + hold * 1.4 - v * 1.5) * dt;
      x = Math.max(0, Math.min(1, x + v * dt));
      const cx = 0.5 + Math.sin(t * 0.7) * 0.18;
      win.style.left = `${(cx - 0.14) * 100}%`; mark.style.left = `${x * 100}%`;
      const inside = Math.abs(x - cx) < 0.14;
      field.classList.toggle('bad', !inside);
      if (!inside) { out += dt; if (Math.random() < dt * 8) sfx.denied(); }
      alt -= dt * 5;
      hud.textContent = `ВЫСОТА ${Math.max(0, Math.ceil(alt))} · СНОС ${out.toFixed(1)} / 4.0`;
      if (out > 4) { stop(); done(false); }
      else if (alt <= 0) { stop(); done(true); }
    });
    return () => { stop(); removeEventListener('pointerup', up); removeEventListener('keydown', key); removeEventListener('keyup', key); };
  },
};
