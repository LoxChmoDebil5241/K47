import { el, button, sfx } from './kit.js';

// Ждать и считать: часов нет. Отсчитай про себя N секунд и нажми. Три попытки, нужно две точные (±0,6 с).
export default {
  name: 'Ждать и считать',
  how: 'Тебе назовут число секунд. Досчитай про себя и нажми. Нужно два точных попадания из трёх.',
  run(root, done) {
    const task = el('p', 'mg-big', root);
    const info = el('p', 'mg-hud', root);
    let round = 0, hits = 0, start = 0, target = 0, beep = 0;
    const next = () => {
      if (round === 3) return done(hits >= 2);
      target = 5 + Math.floor(Math.random() * 6); start = performance.now(); round++;
      task.textContent = `ОТСЧИТАЙ ${target}`; info.textContent = `ПОПЫТКА ${round} / 3 · ТОЧНЫХ: ${hits}`;
      clearInterval(beep); beep = setInterval(() => sfx.key(), 1370); // сбивающий писк монитора
    };
    button('СЕЙЧАС', root, () => {
      const got = (performance.now() - start) / 1000, ok = Math.abs(got - target) <= 0.6;
      if (ok) hits++; else sfx.denied();
      task.textContent = `${got.toFixed(1)} с — ${ok ? 'ТОЧНО' : 'МИМО'}`;
      setTimeout(next, 1200);
    });
    next();
    return () => clearInterval(beep);
  },
};
