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
  function turn(d) {
    const n = page + d;
    if (n < 0 || n >= PAGES) return;
    store(); page = n; sfx.page();
    el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
    setTimeout(show, 170);
  }
  text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(store, 300); });
  prev.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  document.getElementById('nbClose').addEventListener('click', () => { store(); close(); onClose?.(); });

  function open() { show(); el.hidden = false; }
  function close() { text.blur(); el.hidden = true; }
  return { open, close, current: () => [get(page), page + 1], get isOpen() { return !el.hidden; } };
}
