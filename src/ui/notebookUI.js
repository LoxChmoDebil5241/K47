import { sfx } from '../audio.js';
import { save } from '../state.js';
import { PAGES } from '../props/notebook.js';

// Окно блокнота: 50 страниц, на каждой можно писать; всё сохраняется.
export function setupNotebookUI({ onPage, onClose }) {
  const el = document.getElementById('nb');
  const text = document.getElementById('nbText');
  const num = document.getElementById('nbNum');
  const prev = document.getElementById('nbPrev'), next = document.getElementById('nbNext');
  const pages = save.get('notebook', []);
  let page = save.get('notebookPage', 0), timer = 0;

  const get = (i) => pages[i] || '';
  function show() {
    text.value = get(page);
    num.textContent = `${page + 1} / ${PAGES}`;
    prev.disabled = page === 0; next.disabled = page === PAGES - 1;
    onPage?.(get(page), page + 1);
  }
  function store() {
    pages[page] = text.value; save.set('notebook', pages); save.set('notebookPage', page);
    onPage?.(text.value, page + 1);
  }
  // лист бумаги: копия страницы (шапка + текст), с лицевой и оборотной стороной
  const pageEl = el.querySelector('.nb-page');
  function leaf(i) {
    const l = document.createElement('div'); l.className = 'nb-leaf';
    const front = document.createElement('div'); front.className = 'front nb-page';
    front.innerHTML = `<div class="nb-head"><span>ЖУРНАЛ · К-47</span><span>${i + 1} / ${PAGES}</span></div><div class="txt"></div>`;
    front.querySelector('.txt').textContent = get(i);
    const back = document.createElement('div'); back.className = 'back';
    l.append(front, back);
    pageEl.parentElement.appendChild(l);
    return l;
  }
  let busy = false;
  // конец поворота листа — по окончании анимации (с запасным таймером)
  function finish(l, fn) {
    let done = false;
    const end = () => { if (!done) { done = true; fn(); } };
    l.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 1500);
  }
  function turn(d) {
    const n = page + d;
    if (n < 0 || n >= PAGES || busy) return;
    store(); busy = true; sfx.page();
    if (d > 0) {
      // вперёд: текущий лист уходит влево, под ним уже следующая страница
      const l = leaf(page); page = n; show();
      l.getBoundingClientRect(); // зафиксировать начальное положение, чтобы переход сработал
      l.style.transform = 'rotateY(-180deg)'; l.style.setProperty('--shade', '.35');
      finish(l, () => { l.remove(); busy = false; });
    } else {
      // назад: предыдущий лист возвращается справа налево и ложится сверху
      const l = leaf(n); l.style.transition = 'none'; l.style.transform = 'rotateY(-180deg)';
      l.getBoundingClientRect();
      l.style.transition = ''; l.style.transform = 'rotateY(0deg)';
      finish(l, () => { page = n; show(); l.remove(); busy = false; });
    }
  }
  text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(store, 300); });
  prev.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  document.getElementById('nbClose').addEventListener('click', () => { store(); close(); onClose?.(); });

  function open() { show(); el.hidden = false; }
  function close() { text.blur(); el.hidden = true; }
  return { open, close, current: () => [get(page), page + 1], get isOpen() { return !el.hidden; } };
}
