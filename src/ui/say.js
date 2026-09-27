import { sfx } from '../audio.js';

// Пиксельные надписи, которые печатаются по буквам с 8-битной «речью».
// say() — реплика персонажа внизу по центру; float() — беспокойная мысль в случайном месте экрана.
const layer = document.createElement('div');
layer.id = 'say';
document.body.appendChild(layer);

function type(el, text, cps, voice, done) {
  let i = 0;
  const tick = () => {
    if (!el.isConnected) return;
    el.textContent = text.slice(0, ++i);
    if (voice) sfx.talk(text[i - 1]);
    if (i < text.length) setTimeout(tick, 1000 / cps);
    else done?.();
  };
  tick();
}

let line = null, lineTimer = 0;
// реплика: печатается быстро (≈45 букв/с), висит пару секунд и гаснет
export function say(text) {
  line?.remove(); clearTimeout(lineTimer);
  line = document.createElement('p'); line.className = 'say-line';
  layer.appendChild(line);
  const el = line;
  type(el, text, 45, true, () => { lineTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, 1600 + text.length * 25); });
}

// мысль в темноте: своя скорость печати, дрожь, медленное исчезновение
export function float(text, { speed = 20 + Math.random() * 40, life = 5 + Math.random() * 3 } = {}) {
  const el = document.createElement('p'); el.className = 'say-float';
  el.style.left = `${8 + Math.random() * 70}%`;
  el.style.top = `${10 + Math.random() * 60}%`;
  el.style.setProperty('--rot', `${(Math.random() - 0.5) * 8}deg`);
  el.style.fontSize = `${9 + Math.random() * 6}px`;
  layer.appendChild(el);
  type(el, text, speed, Math.random() < 0.5);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 900); }, life * 1000);
}

export function clearFloats() { layer.querySelectorAll('.say-float').forEach((e) => e.remove()); }
