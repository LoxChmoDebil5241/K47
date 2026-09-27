import { sfx } from '../audio.js';
import { save } from '../state.js';
import { GAMES } from '../minigames/index.js';

// Экран «внутри терминала»: текст главы, затем (в режиме игры) испытание.
// Итог испытания меняет состояние носителя: победа +6, поражение −5.
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
  const setWear = (d) => {
    const v = Math.max(0, Math.min(100, save.get('screen', 100) + d));
    save.set('screen', v);
    el.style.setProperty('--wear', String(1 - v / 100));
    return v;
  };
  const header = () => {
    title.textContent = `${String(chapter).padStart(3, '0')} · ${book[chapter].title.toUpperCase()}`;
    const v = save.get('screen', 100);
    wear.textContent = `НОСИТЕЛЬ ${v}%`;
    el.style.setProperty('--wear', String(1 - v / 100));
  };
  const unlockNext = () => { if (chapter + 1 < book.length) save.set('chapter', Math.max(save.get('chapter', 0), chapter + 1)); };
  const stop = () => { cleanup?.(); cleanup = null; };

  function showText() {
    stop(); header();
    el.className = 'mode-text'; foot.innerHTML = '';
    body.innerHTML = '';
    for (const p of book[chapter].paragraphs) { const e = document.createElement('p'); e.textContent = p; body.appendChild(e); }
    body.scrollTop = 0;
    const game = GAMES[chapter];
    btn('◀ МЕНЮ', close);
    if (save.get('readMode', false) || !game) btn(chapter + 1 < book.length ? 'СЛЕДУЮЩАЯ ▶' : 'КОНЕЦ', () => { unlockNext(); next(); }, 'main');
    else btn('ИСПЫТАНИЕ ▶', showGame, 'main');
  }

  function showGame() {
    stop();
    const game = GAMES[chapter];
    el.className = 'mode-game'; foot.innerHTML = ''; body.innerHTML = '';
    const intro = document.createElement('div'); intro.className = 'mg-intro';
    intro.innerHTML = `<h2></h2><p></p>`;
    intro.querySelector('h2').textContent = game.name.toUpperCase();
    intro.querySelector('p').textContent = game.how;
    body.appendChild(intro);
    btn('◀ К ТЕКСТУ', showText);
    btn('НАЧАТЬ', () => {
      body.innerHTML = ''; foot.innerHTML = '';
      const root = document.createElement('div'); root.className = 'mg-root'; body.appendChild(root);
      let finished = false;
      cleanup = game.run(root, (win) => { if (!finished) { finished = true; result(win); } }) || null;
    }, 'main');
  }

  function result(win) {
    stop();
    const v = setWear(win ? 6 : -5);
    if (win) unlockNext();
    win ? sfx.confirm() : sfx.denied();
    header();
    body.innerHTML = '';
    const r = document.createElement('div'); r.className = `mg-result ${win ? 'win' : 'lose'}`;
    r.innerHTML = `<h2>${win ? 'ИСПЫТАНИЕ ПРОЙДЕНО' : 'ПРОВАЛ'}</h2><p>НОСИТЕЛЬ ${win ? '+6' : '−5'} → ${v}%</p>`;
    body.appendChild(r);
    foot.innerHTML = '';
    btn('ПОВТОРИТЬ', showGame);
    if (win) btn(chapter + 1 < book.length ? 'СЛЕДУЮЩАЯ ▶' : 'КОНЕЦ', next, 'main');
    else btn('◀ МЕНЮ', close, 'main');
  }

  function next() { if (chapter + 1 < book.length) { chapter++; sfx.page(); showText(); } else close(); }
  function close() { stop(); el.hidden = true; onClose?.(); }
  el.querySelector('.rd-x').addEventListener('click', () => { sfx.back(); close(); });

  return {
    open(ch) { chapter = ch; el.hidden = false; showText(); },
    close,
    get isOpen() { return !el.hidden; },
  };
}
