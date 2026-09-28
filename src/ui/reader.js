import { sfx } from '../audio.js';
import { save } from '../state.js';

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

  function showText() {
    stop(); header();
    el.className = 'mode-text'; foot.innerHTML = '';
    body.innerHTML = '';
    for (const p of book[chapter].paragraphs) { const e = document.createElement('p'); e.textContent = p; body.appendChild(e); }
    body.scrollTop = 0;
    btn('◀ К ФАЙЛАМ', close);
  }

  function close() { stop(); el.hidden = true; onClose?.(); }
  el.querySelector('.rd-x').addEventListener('click', () => { sfx.back(); close(); });

  return {
    open(ch) { chapter = ch; el.hidden = false; showText(); },
    close,
    get isOpen() { return !el.hidden; },
  };
}
