import { sfx } from './audio.js';
import { float, clearFloats } from './ui/say.js';

// Страх темноты: если долго смотреть в тёмный угол, экран краснеет, появляются мысли,
// сердце бьётся чаще. На пике персонаж погибает.
export const DARK_THOUGHTS = [
  'С того проёма на меня смотрят...', 'Не сейчас... Не сейчас...', 'Сколько их было?', 'Кто это?',
  'Они знают, что я здесь.', 'Это не моя комната.', 'Кто оставил эти фотографии?', 'Тот, кто это делал — ещё здесь.',
  'Я слышу дыхание.', 'Что если это не сон?', 'Мне нужно выбраться.', 'Свет... он не настоящий.',
  'Здесь что-то не так.', 'Кто-то ходит по ту сторону стены.', 'Не оборачивайся.', 'Это последний раз.',
  'ОН СТОИТ ЗА СПИНОЙ', 'ОБЕРНИСЬ', 'ШАГИ...', 'ОН ЖДЁТ',
];
const RISE = 12;      // секунд темноты до гибели
const THOUGHTS_AT = 0.2;

export function createDread(onDeath) {
  const veil = document.createElement('div'); veil.id = 'dread'; document.body.appendChild(veil);
  const st = { level: 0, dead: false, nextBeat: 0, nextThought: 0 };
  return {
    get level() { return st.level; },
    update(dt, t, dark) {
      if (st.dead) return;
      st.level = Math.max(0, Math.min(1, st.level + (dark ? dt / RISE : -dt / 2)));
      const l = st.level;
      veil.style.opacity = String(Math.min(1, l * 1.1));
      veil.style.setProperty('--pulse', String(0.5 + 0.5 * Math.sin(t * (3 + l * 6))));
      if (l > 0.05 && t > st.nextBeat) { sfx.heartbeat(l); st.nextBeat = t + 1.3 - l * 0.8; }
      if (dark && l > THOUGHTS_AT && t > st.nextThought) {
        float(DARK_THOUGHTS[Math.floor(Math.random() * DARK_THOUGHTS.length)]);
        if (Math.random() < 0.3) sfx.whisper();
        st.nextThought = t + (1.3 - l) * (0.8 + Math.random() * 0.7);
      }
      if (!dark && l === 0) clearFloats();
      if (l >= 1) {
        st.dead = true; sfx.death();
        document.body.classList.add('dying');
        setTimeout(onDeath, 2600);
      }
    },
  };
}
