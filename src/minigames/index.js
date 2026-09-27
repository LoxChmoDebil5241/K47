// Мини-игры по главам. Каждая: { name, how, run(root, done) } — root: DOM-узел игры,
// done(win) — вызвать один раз по итогу. run может вернуть функцию очистки.
import landing from './landing.js';
import count from './count.js';
import snow from './snow.js';
import reflex from './reflex.js';
import pairs from './pairs.js';

export const GAMES = {
  1: landing,   // Вторжение — посадка в бурю
  17: count,    // Линия — ждать и считать
  20: snow,     // Снег — рисовать снег
  23: reflex,   // Брак — не брак
  32: pairs,    // Лекция — каждый цвет эпипена
};
