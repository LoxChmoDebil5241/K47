import * as THREE from 'three';
import { sfx, storm } from '../../audio.js';

// Быстрый режим захвата: планета, 16 узлов влияния СНК ⇄ НТ. Мы шлём актив кнопками:
// штурм за сторону, подкрепление, закрепить, отозвать. Запросы — принять/отклонить. Держим баланс.
const NODES = 16, UNITS = 8, BAD = 0.3, BAD_TIME = 12;
const REQ = [
  ['СНК', 'Просим прикрыть узел {n}. Щедро заплатим.', -1], ['НТ', 'Узел {n} нужен нам к рассвету. Обеспечьте.', 1],
  ['СНК', 'Отзовите актив из {n}, или мы решим вопрос сами.', -1], ['НТ', 'Нужна диверсия в секторе {n}.', 1],
  ['СНК', 'Пропустите наш конвой через {n}.', -1], ['НТ', 'Закройте глаза на {n}. Контракт продлим.', 1],
  ['НТ', 'Разрешите провести отряд через {n}.', 1], ['СНК', 'Узел {n} держим из последних сил. Подкрепление!', -1],
];

export function startQuick(ctx) {
  const { root, orb, info } = ctx;
  const P = { units: UNITS, req: null, nextReq: 10, danger: 0, t: 0, bal: 0, sel: null };
  const name = (n) => `У-${String(n.id + 1).padStart(2, '0')}`;
  root.classList.add('war');
  orb.locked = false; orb.pan = 0;
  ctx.setOrbit({ target: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0.2, dist: 3.8, min: 2.2, max: 5, pmin: -1.2, pmax: 1.2 });
  ctx.stage('ЭТАП 4 · РАЗДЕЛ ВЛИЯНИЯ · СНК ⇄ НАНОТРЕЙЗЕН');
  ctx.bottom.innerHTML = `<div class="pr-bal"><span>СНК</span><div><i></i><b></b></div><span>НТ</span></div><p class="pr-units"></p>`;
  // узлы равномерно по сфере (спираль Фибоначчи)
  const nodes = Array.from({ length: NODES }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / NODES, lon = i * 2.39996;
    const n = { id: i, v: (Math.random() - 0.5) * 1.2, units: 0, side: 0, fort: 0, drift: (Math.random() - 0.5) * 0.02 };
    n.m = ctx.marker(ctx.onSphere(Math.asin(y) * 0.9, lon, 1.05), 'node', name(n), () => select(n));
    return n;
  });
  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); fn(); });
  function select(n) {
    P.sel = n; sfx.click();
    nodes.forEach((k) => k.m.el.classList.toggle('sel', k === n));
    draw();
  }
  function draw() {
    const n = P.sel;
    if (!n) { info.innerHTML = `<b>РАЗДЕЛ ВЛИЯНИЯ</b><p class="rw-small">Вращайте планету. Нажмите на узел и отправьте актив. Держите баланс в зелёной зоне.</p>`; return; }
    const v = Math.round((n.v + 1) * 50);
    info.innerHTML = `<b>УЗЕЛ ${name(n)} · СНК ${100 - v}% · НТ ${v}%</b><p>АКТИВ: ${n.units} ${n.side ? (n.side < 0 ? '→ СНК' : '→ НТ') : ''}${n.fort > 0 ? ' · ЗАКРЕПЛЁН' : ''} · СВОБОДНО ${P.units}</p>
      <div class="pr-acts three"><button data-a="snk">ШТУРМ ЗА СНК</button><button data-a="nt">ШТУРМ ЗА НТ</button><button data-a="rein">ПОДКРЕПЛЕНИЕ</button><button data-a="fort">ЗАКРЕПИТЬ</button><button data-a="recall">ОТОЗВАТЬ</button></div>`;
    info.querySelectorAll('[data-a]').forEach((b) => tap(b, () => act(n, b.dataset.a)));
  }
  function act(n, a) {
    if (a !== 'recall' && P.units <= 0) { sfx.denied(); ctx.say('Свободного актива нет.', 'warn'); return; }
    if (a === 'snk' || a === 'nt') { if (!n.units) { n.units = 1; P.units--; } n.side = a === 'snk' ? -1 : 1; storm.lever(); }
    if (a === 'rein') { if (!n.side) { sfx.denied(); ctx.say('Сначала назначьте штурм.', 'warn'); return; } n.units++; P.units--; storm.lever(); }
    if (a === 'fort') { n.fort = 30; P.units--; setTimeout(() => P.units++, 30000); storm.lock(); }
    if (a === 'recall') { P.units += n.units; n.units = 0; n.side = 0; sfx.back(); }
    draw();
  }
  function request() {
    const [who, text, side] = REQ[Math.floor(Math.random() * REQ.length)], n = nodes[Math.floor(Math.random() * NODES)];
    P.req = { side, n, left: 12 };
    const box = document.createElement('div'); box.className = `pr-req ${side < 0 ? 'snk' : 'nt'}`;
    box.innerHTML = `<b>${who} · ЗАПРОС</b><p></p><div><button data-r="yes">ПРИНЯТЬ</button><button data-r="no">ОТКЛОНИТЬ</button></div><i></i>`;
    box.querySelector('p').textContent = text.replace('{n}', name(n));
    root.appendChild(box); P.req.el = box; storm.radio();
    box.querySelectorAll('[data-r]').forEach((b) => tap(b, () => answer(b.dataset.r === 'yes')));
  }
  function answer(yes) {
    const R = P.req; if (!R) return; P.req = null; R.el.remove();
    if (yes) { R.n.v += R.side * 0.35; sfx.confirm(); }
    else { nodes.forEach((n) => (n.v += R.side * 0.06)); sfx.denied(); ctx.say(R.side < 0 ? 'СНК недовольны. Давят везде.' : 'НТ недовольны. Давят везде.', 'warn'); }
  }
  draw();
  ctx.say('Актив на связи. Держите их в равновесии.');
  let redraw = 0;
  return {
    get paused() { return false; },
    update(dt) {
      if (!dt) return;
      P.t += dt;
      let sum = 0;
      for (const n of nodes) {
        if (n.fort > 0) n.fort -= dt;
        else { n.v += n.drift * dt * 3 + (Math.random() - 0.5) * 0.04 * dt + n.side * n.units * 0.05 * dt; if (Math.random() < dt * 0.02) n.drift = (Math.random() - 0.5) * 0.03; }
        n.v = Math.max(-1, Math.min(1, n.v)); sum += n.v;
        const v = (n.v + 1) / 2;
        n.m.el.style.setProperty('--c', `rgb(${Math.round(60 + v * 195)},${Math.round(140 - v * 30)},${Math.round(255 - v * 205)})`);
        n.m.el.classList.toggle('fort', n.fort > 0); n.m.el.classList.toggle('act', n.units > 0);
      }
      P.bal = sum / NODES;
      root.querySelector('.pr-bal i').style.left = `${(P.bal + 1) * 50}%`;
      root.querySelector('.pr-units').textContent = `СВОБОДНЫЙ АКТИВ: ${P.units} · ДЕРЖИТЕ БАЛАНС В ЗЕЛЁНОЙ ЗОНЕ`;
      const bad = Math.abs(P.bal) > BAD;
      root.classList.toggle('danger', bad);
      P.danger = bad ? P.danger + dt : Math.max(0, P.danger - dt * 2);
      if (bad && Math.floor(P.danger * 2) !== Math.floor((P.danger - dt) * 2)) storm.alarm();
      if (P.danger > BAD_TIME) ctx.end(false, P.bal < 0 ? 'СНК ЗАХВАТИЛИ ПЛАНЕТУ.' : 'НАНОТРЕЙЗЕН ЗАХВАТИЛИ ПЛАНЕТУ.');
      if (!P.req && P.t > P.nextReq) { request(); P.nextReq = P.t + 16 + Math.random() * 10; }
      if (P.req) { P.req.left -= dt; P.req.el.querySelector('i').style.width = `${Math.max(0, P.req.left / 12) * 100}%`; if (P.req.left <= 0) answer(false); }
      if ((redraw += dt) > 0.5) { redraw = 0; if (P.sel) draw(); }
    },
    result() { return Math.abs(P.bal) <= BAD ? [true, 'РАВНОВЕСИЕ СОХРАНЕНО. АКТИВ ОТОЗВАН.'] : [false, P.bal > 0 ? 'ПЕРЕВЕС НАНОТРЕЙЗЕН.' : 'ПЕРЕВЕС СНК.']; },
    dispose() { P.req?.el.remove(); ctx.clearMarkers(); },
    debug: P,
  };
}
