import { sfx } from '../audio.js';
import { save } from '../state.js';
import { GAMES } from '../minigames/index.js';

// Экран «внутри терминала»: полный текст главы. Восстановление файлов — на самом терминале.
export function setupReader(book, { onClose }) {
  const el = document.createElement('section'); el.id = 'reader'; el.hidden = true;
  el.innerHTML = `
    <header class="rd-head"><span class="rd-title"></span><span class="rd-wear"></span><button class="px rd-x">X ВЫЙТИ</button></header>
    <div class="rd-body"></div>
    <footer class="rd-foot"></footer>`;
  document.body.appendChild(el);
  const title = el.querySelector('.rd-title'), wear = el.querySelector('.rd-wear');
  const body = el.querySelector('.rd-body'), foot = el.querySelector('.rd-foot');
  let chapter = 0, cleanup = null;

  const btn = (label, fn, cls = '') => {
    const b = document.createElement('button'); b.className = `px ${cls}`; b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); fn(); });
    foot.appendChild(b); return b;
  };
  const header = () => {
    title.textContent = `${String(chapter).padStart(3, '0')} · ${book[chapter].title.toUpperCase()}`;
    const v = save.get('screen', 100);
    wear.textContent = `НОСИТЕЛЬ ${v}%`;
    el.style.setProperty('--wear', String(1 - v / 100));
  };
  const stop = () => { cleanup?.(); cleanup = null; };

  // повреждённый файл: часть букв выбита, абзацы местами обрываются
  function corrupt(str, seed) {
    let s = seed * 7919 + 13;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return [...str].map((c) => (c !== ' ' && r() < 0.17 ? '▓▒░█#%'[Math.floor(r() * 6)] : c)).join('');
  }

  function showText() {
    stop(); header();
    const damaged = !save.get('restored', []).includes(chapter) && !save.get('readMode', false);
    el.className = `mode-text${damaged ? ' damaged' : ''}`; foot.innerHTML = '';
    body.innerHTML = '';
    if (damaged) { const w = document.createElement('p'); w.className = 'rd-warn'; w.textContent = 'ФАЙЛ ПОВРЕЖДЁН · ДАННЫЕ ВОССТАНОВЛЕНЫ ЧАСТИЧНО'; body.appendChild(w); }
    book[chapter].paragraphs.forEach((p, k) => { const e = document.createElement('p'); e.textContent = damaged ? corrupt(p, chapter * 100 + k) : p; body.appendChild(e); });
    body.scrollTop = 0;
    btn('◀ К ФАЙЛАМ', close);
  }

  function close() { stop(); document.body.classList.remove('immersive'); el.hidden = true; onClose?.(); }
  el.querySelector('.rd-x').addEventListener('click', () => { sfx.back(); close(); });

  // испытание на весь экран: 5 касаний за 5 секунд
  function game(ch, done) {
    chapter = ch; el.hidden = false; stop(); header();
    if (GAMES[ch]) {
      // настоящая мини-игра главы — на весь экран, без шапки
      el.className = 'mode-game full'; foot.innerHTML = ''; body.innerHTML = '';
      document.body.classList.toggle('immersive', !!GAMES[ch].immersive);
      const root = document.createElement('div'); body.appendChild(root);
      let fin = false;
      cleanup = GAMES[ch].run(root, (win) => { if (fin) return; fin = true; done(win); close(); }) || null;
      return;
    }
    el.className = 'mode-game'; foot.innerHTML = ''; body.innerHTML = '';
    const box = document.createElement('div'); box.className = 'tap-game';
    box.innerHTML = '<p class="tg-title">КАСАЙТЕСЬ ЭКРАНА</p><p class="tg-count">0 / 5</p><div class="tg-bar"><i></i></div><p class="tg-time">5.0 С</p>';
    body.appendChild(box);
    const count = box.querySelector('.tg-count'), bar = box.querySelector('.tg-bar i'), time = box.querySelector('.tg-time');
    let taps = 0, left = 5, over = false, last = performance.now(), raf = 0;
    const end = (win) => {
      if (over) return; over = true; cancelAnimationFrame(raf);
      box.classList.add(win ? 'win' : 'lose');
      count.textContent = win ? 'ВОССТАНОВЛЕНО' : 'СБОЙ';
      win ? sfx.confirm() : sfx.denied();
      setTimeout(() => { done(win); close(); }, 1300);
    };
    const hit = (e) => { e.preventDefault(); if (over) return; taps++; sfx.click(); count.textContent = `${taps} / 5`; box.classList.remove('hit'); void box.offsetWidth; box.classList.add('hit'); if (taps >= 5) end(true); };
    box.addEventListener('pointerdown', hit);
    const tick = (now) => { left -= (now - last) / 1000; last = now; bar.style.width = `${Math.max(0, left / 5) * 100}%`; time.textContent = `${Math.max(0, left).toFixed(1)} С`; if (left <= 0) end(false); else raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    cleanup = () => cancelAnimationFrame(raf);
  }

  return {
    game,
    open(ch) { chapter = ch; el.hidden = false; showText(); },
    close,
    get isOpen() { return !el.hidden; },
  };
}
