import { el, button, sfx } from './kit.js';

// Не брак: три проверки реакции. Лампа загорится зелёным — жми сразу, но не раньше.
export default {
  name: 'Не брак',
  how: 'Лампа загорится зелёным — жми сразу. Нажмёшь раньше или позже 0,6 с — брак. Нужно 3 из 3.',
  run(root, done) {
    const lamp = el('div', 'mg-lamp', root);
    const hud = el('p', 'mg-hud', root);
    let round = 0, lit = 0, timer = 0, fails = 0;
    const next = () => {
      if (round === 3) return done(fails === 0);
      round++; lit = 0; lamp.className = 'mg-lamp';
      hud.textContent = `ПРОВЕРКА ${round} / 3`;
      timer = setTimeout(() => { lamp.className = 'mg-lamp on'; lit = performance.now(); sfx.click(); }, 1200 + Math.random() * 2500);
    };
    button('ЖАТЬ', root, () => {
      if (!lit) { clearTimeout(timer); fails++; hud.textContent = 'РАНО. БРАК.'; sfx.denied(); }
      else { const dt = performance.now() - lit; if (dt > 600) { fails++; hud.textContent = `${Math.round(dt)} МС. МЕДЛЕННО.`; sfx.denied(); } else hud.textContent = `${Math.round(dt)} МС. НОРМА.`; }
      lit = 0; setTimeout(next, 1000);
    });
    next();
    return () => clearTimeout(timer);
  },
};
