import { sfx } from '../audio.js';

// Общие помощники мини-игр: элементы, таймер, цикл кадров с остановкой.
export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
export function button(label, parent, onClick) {
  const b = el('button', 'px', parent, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); onClick(); });
  return b;
}
export function loop(fn) {
  let on = true, last = performance.now();
  const tick = (now) => { if (!on) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; fn(dt); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return () => { on = false; };
}
export { sfx };
