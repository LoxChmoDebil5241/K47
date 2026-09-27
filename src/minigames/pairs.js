import { el, sfx } from './kit.js';

// Каждый цвет эпипена: карточки рубашкой вверх — найди пары «препарат — примета». Ошибок не больше 8.
const PAIRS = [['ГИПЕРЗИН', 'КРАСНЫЙ'], ['ИМПЕДРИЗИН', 'СИНИЙ'], ['АРАНЕПС', 'ЖЁЛТЫЙ'], ['ДИЗОКСИЭФЕДРИН', 'ЧЁРНЫЙ'], ['БУРАН', 'БЕЛЫЙ'], ['ВЕКТОР', 'ЗЕЛЁНЫЙ']];
export default {
  name: 'Каждый цвет эпипена',
  how: 'Открывай по две карточки. Препарат и его цвет — пара. Найди все пары, ошибок не больше восьми.',
  run(root, done) {
    const grid = el('div', 'mg-grid', root);
    const hud = el('p', 'mg-hud', root);
    const cards = PAIRS.flatMap(([a, b], i) => [{ t: a, id: i }, { t: b, id: i }]).sort(() => Math.random() - 0.5);
    let open = [], found = 0, miss = 0, lock = false;
    const upd = () => (hud.textContent = `ПАР ${found} / ${PAIRS.length} · ОШИБОК ${miss} / 8`);
    cards.forEach((c) => {
      const b = el('button', 'mg-card', grid, '?');
      b.addEventListener('click', () => {
        if (lock || b.classList.contains('open')) return;
        sfx.click(); b.classList.add('open'); b.textContent = c.t; open.push([b, c]);
        if (open.length < 2) return;
        const [[b1, c1], [b2, c2]] = open; open = [];
        if (c1.id === c2.id) { found++; b1.classList.add('done'); b2.classList.add('done'); if (found === PAIRS.length) setTimeout(() => done(true), 500); }
        else { miss++; sfx.denied(); lock = true; setTimeout(() => { b1.classList.remove('open'); b2.classList.remove('open'); b1.textContent = b2.textContent = '?'; lock = false; if (miss >= 8) done(false); }, 800); }
        upd();
      });
    });
    upd();
  },
};
