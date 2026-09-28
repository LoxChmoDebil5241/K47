import * as THREE from 'three';
import { sfx, storm, war as snd } from '../../audio.js';
import TXT from '../../story/raid.json';
import {
  SIZE, WEAPON, SQUAD, BUILDING, ACTION, ACTION_TEXT, SIDE, FACTION, WEATHER, WEATHER_KEYS,
  newSquad, hostile, isClose, squadBE, resolve, casualties, fmtBE, fmtMod,
} from './rules.js';
import { makePawn, pawnIcon } from './pawns.js';
import { SECTORS, BASE, makeSector, buildSectorView, cellXZ, nbrs, dist, N, CELL } from './sector.js';

// Захват планеты (пролог, часть 2). Мы — третья сторона: исполняем запросы НТ и СНК своими рейдерами
// и держим их влияние в равновесии. 4 точки на планете → карта сектора 5×5 → отряды, действия, бои.
const RESERVE = 25, GREEN = 0.25, RED = 0.5, RED_TIME = 60;
const OTHER = { nt: 'snk', snk: 'nt' };
const KIND = { free: 'СВОБОДЕН', nt: 'ЗАНЯТ НТ', snk: 'ЗАНЯТ СНК', unk: 'НЕИЗВЕСТНЫЕ' };
const BLD = { tower: 'В', mine: 'Ш', post: 'П' };
const DUR = { scout: 200, capture: 240, reinforce: 100, transit: 150, clear: 240 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const fmtT = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const withAlly = (sq, ally) => ({ ...sq, ally });

export function startWar(ctx) {
  const { root, scene, camera, orb } = ctx;
  const W = {
    sectors: SECTORS.map((d, i) => makeSector(d, i)),
    reserve: RESERVE, strength: { nt: 100, snk: 100 }, contracts: [], pending: null, queue: null,
    view: -1, sv: null, sel: null, selSide: 'neutral', pick: null, t: 0, nextReq: 12, danger: 0, bal: 0,
    modal: null, fx: [], syncWanted: false, lost: 0, landed: 0, tick: 0, over: false,
  };
  // у каждого отряда — ссылка на сектор и клетку
  W.sectors.forEach((s) => s.cells.forEach((c) => c.units.forEach((u) => { u.sec = s.idx; u.cell = c.i; })));

  // ---------- DOM ----------
  const hud = document.createElement('div'); hud.className = 'rw-hud';
  hud.innerHTML = `<button class="rw-pause">❚❚ ПАУЗА</button><button class="rw-back" hidden>◀ ПЛАНЕТА</button><div class="rw-jobs"></div><div class="rw-toast"></div>
    <div class="rw-modal" hidden><div class="rw-box"></div></div>`;
  root.appendChild(hud);
  const back = hud.querySelector('.rw-back'), jobs = hud.querySelector('.rw-jobs'), toastEl = hud.querySelector('.rw-toast');
  const modalEl = hud.querySelector('.rw-modal'), box = hud.querySelector('.rw-box');
  modalEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  back.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!W.modal) { sfx.back(); overview(); } });
  hud.querySelector('.rw-pause').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (W.modal === 'pause') { sfx.menuClose(); closeModal(); } else if (!W.modal) { sfx.menuOpen(); openPause('goal'); } });
  root.classList.add('war');
  ctx.bottom.innerHTML = `<div class="pr-bal"><span>СНК</span><div><i></i><b></b></div><span>НТ</span></div><p class="pr-units"></p>`;
  const info = ctx.info;
  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(e); });

  function toast(text, cls = '') {
    const p = document.createElement('p'); p.className = cls; p.textContent = text; toastEl.prepend(p);
    while (toastEl.children.length > 4) toastEl.lastChild.remove();
    setTimeout(() => p.classList.add('out'), 5200); setTimeout(() => p.remove(), 6200);
  }
  function openModal(kind, html) { W.modal = kind; box.className = `rw-box ${kind}`; box.innerHTML = html; modalEl.hidden = false; return box; }
  function closeModal() { W.modal = null; modalEl.hidden = true; box.innerHTML = ''; closeMini(); if (W.queue) { const q = W.queue; W.queue = null; arrive(q); } }

  // ---------- 3D пешки ----------
  const meshes = new Map(); // id пешки → { g, target, dying }
  const tracerGeo = new THREE.BufferGeometry(); tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 6), 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracers.frustumCulled = false;
  let tracerList = [];
  const beams = [];
  // один отряд в клетке: пешки строем 3 в ряд (колонна — чужая, едет рядом)
  // строй: джаггернауты впереди отряда, штурмовики линиями по 2–3 за ними, разведчики россыпью по клетке
  function slotPos(c, k, j, u) {
    const [cx, cz] = cellXZ(c.i), p = u.pawns[j], s = CELL * 0.2, off = k * 0.08;
    const idx = u.pawns.filter((q, n) => n < j && q.size === p.size).length;
    if (p.size === 'H') { const nH = u.pawns.filter((q) => q.size === 'H').length; return [cx + (idx - (nH - 1) / 2) * s * 1.3 + off, cz + CELL * 0.34]; }
    if (p.size === 'L') { const r = (p.id * 9301 + 49297) % 233280 / 233280, r2 = (p.id * 4096 + 150889) % 714025 / 714025; return [cx + (r - 0.5) * CELL * 0.85 + off, cz + (r2 - 0.5) * CELL * 0.85]; }
    const row = Math.floor(idx / 3), col = idx % 3;
    return [cx + (col - 1) * s + (row % 2) * s * 0.5 + off, cz + CELL * 0.12 - row * s];
  }
  // свободная клетка для нашего отряда рядом с i (без чужих и без наших)
  function freeNear(sec, i, side) {
    const me = { side: 'us', ally: side }, seen = new Set([i]), q = [i];
    while (q.length) {
      const k = q.shift(), c = sec.cells[k];
      if (!c.units.length || (!c.units.some((u) => u.side === 'us') && !c.units.some((u) => hostile(me, u)))) return k;
      for (const n of nbrs(k)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    return i;
  }
  const hasOurs = (c, sq) => c.units.some((u) => u.side === 'us' && u !== sq);
  const visibleUnits = (c) => c.units.filter((u) => u.side === 'us' || c.scouted);
  function sync(snap = false) {
    if (W.view < 0 || !W.sv) return;
    if (W.fx.length) { W.syncWanted = true; return; }
    const sec = W.sectors[W.view], seen = new Set();
    for (const c of sec.cells) {
      visibleUnits(c).forEach((u, k) => {
        u.pawns.forEach((p, j) => {
          seen.add(p.id);
          let m = meshes.get(p.id);
          const [x, z] = slotPos(c, k, j, u), y = W.sv.h(x, z);
          if (!m) {
            const g = makePawn(p, u.side); W.sv.group.add(g);
            m = { g, target: new THREE.Vector3(), dying: 0 }; meshes.set(p.id, m);
            g.position.set(x, y + (u.dropping ? 4 + Math.random() * 1.5 : 0), z);
          }
          m.g.userData.squad = u; m.target.set(x, y, z);
          if (snap) m.g.position.copy(m.target);
          m.g.userData.pose(u.stance === 'fortify' ? (p.size === 'H' && isClose(c.building, sec.weather) ? 'melee' : 'fire') : 'idle');
          m.g.userData.flash(false);
        });
        u.dropping = false;
      });
    }
    for (const [id, m] of meshes) if (!seen.has(id) && !m.dying) { m.g.removeFromParent(); meshes.delete(id); }
  }
  function markDying(ids) { for (const id of ids) { const m = meshes.get(id); if (m) m.dying = 0.001; } }

  // ---------- обзор планеты ----------
  let sMarkers = [], cellMarkers = [], chips = [];
  function overview() {
    closeSector(); W.view = -1; W.sel = null; W.pick = null;
    ctx.clearMarkers(); ctx.planet(true); ctx.flash();
    orb.locked = true;
    ctx.setOrbit({ target: new THREE.Vector3(0, -0.28, 0), yaw: 0, pitch: 0, dist: 3.7, min: 3.6, max: 3.6, pmin: -1, pmax: 1 });
    ctx.snap();
    back.hidden = true;
    ctx.stage('ЭТАП 4 · ЗАХВАТ · ВЫБЕРИТЕ СЕКТОР');
    sMarkers = W.sectors.map((s, i) => ctx.marker(ctx.onSphere(s.lat, s.lon, 1.05), `sector k-${s.kind}`, '', () => { if (!W.modal) { sfx.click(); enterSector(i); } }));
    refresh();
  }
  function sectorCount(s) {
    const n = { nt: 0, snk: 0, unk: 0, us: 0 };
    for (const c of s.cells) if (n[c.owner] != null) n[c.owner]++;
    return n;
  }
  function overviewInfo() {
    info.innerHTML = `<b>ЗАХВАТ ПЛАНЕТЫ</b>
      <p>РЕЗЕРВ ${W.reserve} · ВЫСАЖЕНО ${W.landed} · ПОТЕРИ ${W.lost}</p>
      <p>СИЛА: НТ ${Math.round(W.strength.nt)} · СНК ${Math.round(W.strength.snk)}</p>
      <p class="rw-small">Держите влияние НТ и СНК в равновесии. Точка — сектор. Правила — в паузе.</p>`;
  }

  // ---------- сектор ----------
  function enterSector(i) {
    if (W.view === i) return;
    closeSector(); W.view = i; W.sel = null; W.pick = null;
    const sec = W.sectors[i];
    ctx.clearMarkers(); ctx.planet(false); ctx.flash();
    W.sv = buildSectorView(sec); scene.add(W.sv.group); W.sv.group.add(tracers);
    orb.locked = false;
    // карта смещена вправо — слева панель отряда
    ctx.setOrbit({ target: new THREE.Vector3(0, 0, 0.6), yaw: 0, pitch: 1.05, dist: 12.5, min: 1.2, max: 18, pmin: 0.3, pmax: 1.45 });
    ctx.snap();
    back.hidden = false;
    cellMarkers = sec.cells.map((c) => { const [x, z] = cellXZ(c.i); return ctx.marker(new THREE.Vector3(x, W.sv.h(x, z) + 0.06, z), 'cell', '', () => tapCell(c.i), W.sv.group); });
    sync(true); refresh();
  }
  function closeSector() {
    if (!W.sv) return;
    W.fx = []; tracerList = []; for (const b of beams) b.m.removeFromParent(); beams.length = 0;
    tracers.removeFromParent();
    meshes.forEach((m) => m.g.removeFromParent()); meshes.clear();
    W.sv.dispose(); W.sv = null; cellMarkers = []; chips = [];
  }
  const cellName = (sec, i) => `${sec.letter}-${i + 1}`;
  const weatherLines = (w) => WEATHER[w].mods.map((m) => {
    const who = [m.size ? SIZE[m.size].mark : '', m.squad ? SQUAD[m.squad].name.toLowerCase() : '', m.act ? { attack: 'атака', defend: 'оборона', scout: 'разведка' }[m.act] : '', m.fort ? 'закреплённые' : ''].filter(Boolean).join(' ') || 'все';
    return `${who} ${fmtMod(m.v)} — ${m.why}`;
  });
  function sectorInfo(sec) {
    const n = sectorCount(sec), W0 = WEATHER[sec.weather];
    info.innerHTML = `<b>СЕКТОР ${sec.letter} · ${KIND[sec.kind]}</b>
      <p>ПОГОДА: ${W0.name}${W0.close ? ' · бой только ближний' : ''}</p>${weatherLines(sec.weather).map((l) => `<p class="rw-small">${esc(l)}</p>`).join('')}
      <p>КЛЕТКИ: НТ ${n.nt} · СНК ${n.snk} · ?? ${n.unk} · НАШИ ${n.us}</p>
      <p class="rw-small">Нажмите клетку или свой отряд (красная плашка). Нажатие на пешку — снаряжение.</p>`;
  }

  // метки клеток и плашки отрядов
  function paintSector() {
    const sec = W.sectors[W.view]; if (!sec || !W.sv) return;
    W.sv.paint();
    const reqCells = new Set();
    for (const c of W.contracts.concat(W.pending ? [W.pending] : [])) if (c.sec === sec.idx) c.cells.forEach((i) => reqCells.add(i));
    cellMarkers.forEach((m, i) => {
      const c = sec.cells[i];
      m.el.className = `pr-mk cell o-${c.scouted ? c.owner || 'none' : 'fog'}`;
      if (W.pick && validPick(i)) m.el.classList.add('can');
      if (W.pick?.picks.includes(i)) m.el.classList.add('picked');
      if (reqCells.has(i)) m.el.classList.add('req');
      const show = c.building || c.base || reqCells.has(i) || m.el.classList.contains('can');
      if (!show) m.el.classList.add('plain');
      m.el.querySelector('span').textContent = show ? `${cellName(sec, i)}${c.building ? ' ' + BLD[c.building] : ''}` : '';
    });
    chips.forEach((m) => ctx.unmark(m)); chips = [];
    sec.cells.forEach((c) => {
      c.units.filter((u) => u.side === 'us').forEach((u, k) => {
        const [x, z] = cellXZ(c.i);
        const m = ctx.marker(new THREE.Vector3(x, W.sv.h(x, z) + 0.12, z), `chip a-${u.ally}${W.sel === u ? ' sel' : ''}${u.cd > 0 ? ' cd' : ''}`,
          `${u.tag} ·${u.pawns.length}${u.stance === 'fortify' ? ' ▣' : ''}`, () => { if (!W.modal && !W.pick) selectSquad(u); }, W.sv.group);
        m.el.style.setProperty('--k', k); chips.push(m);
      });
    });
  }
  function refresh() {
    if (W.view < 0) {
      W.sectors.forEach((s, i) => {
        const n = sectorCount(s), ours = s.cells.reduce((a, c) => a + c.units.filter((u) => u.side === 'us').length, 0);
        const m = sMarkers[i]; if (!m) return;
        m.el.querySelector('span').textContent = `${s.letter} · ${KIND[s.kind]}\n${WEATHER[s.weather].name}${ours ? ` · НАШИХ ${ours}` : ''}`;
      });
      if (!W.modal) overviewInfo();
    } else {
      const sec = W.sectors[W.view];
      ctx.stage(`СЕКТОР ${sec.letter} · ${WEATHER[sec.weather].name}`);
      paintSector(); sync();
      if (W.pick) pickInfo(); else if (W.sel && W.sel.pawns.length && W.sel.sec === sec.idx) squadInfo(W.sel); else if (W.cellSel != null) cellInfo(W.cellSel); else sectorInfo(sec);
    }
    jobsList();
  }

  // ---------- клетка и отряд ----------
  function unitLine(u) {
    const icons = u.pawns.map((p) => `<img src="${pawnIcon(p.size, u.side)}" alt="">`).join('');
    return `<div class="rw-unit f-${u.side}"><span>${FACTION[u.side]} · ${SQUAD[u.type].name} · ${u.pawns.length}${u.stance === 'fortify' ? ' · В ОБОРОНЕ' : ''}</span><div>${icons}</div></div>`;
  }
  function tapCell(i) {
    if (W.modal) return;
    if (W.pick) {
      if (!validPick(i)) { sfx.denied(); return; }
      sfx.click(); W.pick.picks.push(i);
      if (W.pick.picks.length >= W.pick.need) { const P = W.pick; W.pick = null; openConfirm(P.sq, P.act, P.side, P.picks); }
      refresh(); return;
    }
    sfx.click(); W.sel = null; W.cellSel = i; refresh();
  }
  function cellInfo(i) {
    const sec = W.sectors[W.view], c = sec.cells[i];
    const ours = c.units.filter((u) => u.side === 'us'), others = c.units.filter((u) => u.side !== 'us');
    info.innerHTML = `<b>КЛЕТКА ${cellName(sec, i)} · ${c.scouted ? FACTION[c.owner] || 'НИЧЬЯ' : 'НЕ РАЗВЕДАНА'}</b>
      ${c.building ? `<p>${BUILDING[c.building].name} · укрытие +${BUILDING[c.building].fort} закрепившимся</p>` : ''}
      ${c.base ? `<p>БАЗА ${FACTION[c.base]}</p>` : ''}
      ${c.scouted ? (others.length ? others.map(unitLine).join('') : '<p>Чужих отрядов нет.</p>') : '<p>Состав неизвестен. Атака сюда: −4 каждой пешке (кроме внезапной атаки разведки).</p>'}
      ${ours.map((u) => `<button class="rw-pick" data-u="${u.id}">${u.tag} · ${SQUAD[u.type].name} · ${u.pawns.length}</button>`).join('')}`;
    info.querySelectorAll('[data-u]').forEach((b) => tap(b, () => selectSquad(ours.find((u) => u.id === +b.dataset.u))));
  }
  function selectSquad(u) { sfx.click(); W.sel = u; W.selSide = u.ally; W.cellSel = null; refresh(); }
  function squadInfo(u) {
    const sec = W.sectors[W.view];
    info.innerHTML = `<b>${u.tag} · ${SQUAD[u.type].name} · ${cellName(sec, u.cell)}</b>
      <div class="rw-unit f-us"><span>${u.stance === 'fortify' ? 'В ОБОРОНЕ' : 'ОЖИДАЮТ'} · ${SIDE[u.ally].full}${u.retreatT > 0 ? ' · ОТХОДЯТ' : ''}</span><div>${u.pawns.map((p) => `<img src="${pawnIcon(p.size)}" alt="">`).join('')}</div></div>
      <p class="rw-small">СТОРОНА ДЕЙСТВИЯ:</p>
      <div class="rw-sides">${Object.entries(SIDE).map(([k, v]) => `<button data-s="${k}" class="${W.selSide === k ? 'on' : ''} s-${k}">${v.name}</button>`).join('')}</div>
      <p class="rw-small">${SIDE[W.selSide].text}</p>
      <div class="pr-acts three">${Object.entries(ACTION).map(([k, v]) => `<button data-a="${k}"${u.cd > 0 ? ' disabled' : ''}>${v}</button>`).join('')}</div>
      <p class="rw-small">${u.cd > 0 ? `Отряд занят: ${Math.ceil(u.cd)} с` : 'Выберите сторону и действие.'}</p>`;
    info.querySelectorAll('[data-s]').forEach((b) => tap(b, () => { sfx.click(); W.selSide = b.dataset.s; squadInfo(u); }));
    info.querySelectorAll('[data-a]').forEach((b) => tap(b, () => startAction(u, b.dataset.a)));
  }
  function startAction(u, act) {
    if (u.cd > 0) { sfx.denied(); return; }
    sfx.click();
    if (act === 'fortify' || act === 'wait') return openConfirm(u, act, W.selSide, []);
    W.pick = { sq: u, act, side: W.selSide, picks: [], need: act === 'scout' ? 2 : 1 };
    if (!W.sectors[W.view].cells.some((c) => validPick(c.i))) { W.pick = null; sfx.denied(); toast('Нет подходящих клеток для этого действия.', 'warn'); return; }
    refresh();
  }
  function pickInfo() {
    const P = W.pick, sec = W.sectors[W.view];
    const hint = { scout: P.picks.length ? 'Вторая клетка: рядом с первой или дальше в длину.' : 'Первая клетка: соседняя с отрядом.', attack: 'Соседняя клетка с противником или неразведанная.', retreat: 'Соседняя клетка без противника.', move: 'Клетка до 2 шагов, разведанная, без противника.' }[P.act];
    info.innerHTML = `<b>${ACTION[P.act]} · ${P.sq.tag} · ${SIDE[P.side].full}</b><p>${ACTION_TEXT[P.act]}</p><p class="rw-small">${hint}</p>
      ${P.picks.length ? `<p>ВЫБРАНО: ${P.picks.map((i) => cellName(sec, i)).join(', ')}</p>` : ''}<div class="pr-acts one"><button data-x>ОТМЕНА</button></div>`;
    tap(info.querySelector('[data-x]'), () => { sfx.back(); W.pick = null; refresh(); });
  }
  // известные враги в клетке для отряда со стороной side
  const knownHostiles = (c, sq, side) => (c.scouted || c.units.some((u) => u.side === 'us') ? c.units.filter((u) => u !== sq && hostile(withAlly(sq, side), u)) : []);
  function validPick(i) {
    const P = W.pick; if (!P) return false;
    const sec = W.sectors[W.view], c = sec.cells[i], from = P.sq.cell;
    if (P.act === 'scout') {
      if (!P.picks.length) return nbrs(from).includes(i);
      const a = P.picks[0];
      return i !== from && i !== a && nbrs(a).includes(i);
    }
    if (P.act === 'attack') {
      if (!nbrs(from).includes(i) || hasOurs(c, P.sq)) return false;
      if (!c.scouted) return true;
      const owned = c.owner && c.owner !== 'us' && hostile(withAlly(P.sq, P.side), { side: c.owner, ally: c.owner });
      return knownHostiles(c, P.sq, P.side).length > 0 || owned;
    }
    if (P.act === 'retreat') return nbrs(from).includes(i) && c.scouted && !hasOurs(c, P.sq) && !knownHostiles(c, P.sq, P.side).length;
    if (P.act === 'move') {
      if (i === from || dist(from, i) > 2 || !c.scouted || hasOurs(c, P.sq) || knownHostiles(c, P.sq, P.side).length) return false;
      return dist(from, i) === 1 || nbrs(from).some((m) => nbrs(m).includes(i) && sec.cells[m].scouted && !knownHostiles(sec.cells[m], P.sq, P.side).length);
    }
    return false;
  }

  // ---------- подтверждение действия: пешки, бафы и дебафы ----------
  function rowsHTML(rows, act, close, side) {
    return rows.map((r) => {
      const p = r.p, wpn = act === 'attack' || act === 'defend' ? (close && p.size !== 'M' ? p.close : p.main) : p.main;
      const mods = r.mods.length ? r.mods.map((m) => `<em class="${m.v > 0 ? 'up' : 'dn'}">${fmtMod(m.v)} ${esc(m.why)}</em>`).join('') : '<em>без модификаторов</em>';
      return `<tr><td><img src="${pawnIcon(p.size, side)}" alt=""></td><td>${SIZE[p.size].mark} · ${SIZE[p.size].name}<small>${WEAPON[wpn]}</small></td><td>${fmtBE(r.base)}</td><td>${mods}</td><td><b>${fmtBE(r.total)}</b></td></tr>`;
    }).join('');
  }
  function openConfirm(sq, act, side, picks) {
    const sec = W.sectors[W.view], here = sec.cells[sq.cell], w = sec.weather;
    let title = `${ACTION[act]} · ${sq.tag}`, cond = [WEATHER[w].name], calc, extra = '', mode = act;
    const tgt = picks.length ? sec.cells[picks[picks.length - 1]] : here;
    if (picks.length) title += ` → ${picks.map((i) => cellName(sec, i)).join(' + ')}`;
    if (act === 'attack') {
      const close = isClose(tgt.building, w);
      cond.push(close ? `ближний бой${tgt.building ? ` (${BUILDING[tgt.building].name.toLowerCase()})` : ''}` : 'средняя дистанция', tgt.scouted ? 'клетка разведана' : 'клетка НЕ разведана');
      calc = squadBE(sq, { act: 'attack', scouted: tgt.scouted, close, weather: w }); mode = 'attack';
      const defs = knownHostiles(tgt, sq, side);
      if (tgt.scouted) {
        const D = defs.reduce((s, u) => s + squadBE(u, { act: 'defend', close, building: tgt.building, weather: w }).total, 0);
        extra = `ПРОТИВНИК: ${defs.length ? `${defs.length} отр. · ${defs.reduce((s, u) => s + u.pawns.length, 0)} пешек · оборона ≈ ${fmtBE(D)} БЕ` : 'нет — клетка займётся без боя'}`;
      } else extra = 'ПРОТИВНИК: НЕИЗВЕСТНО';
      extra += '<br><span class="rw-small">Исход: сумма БЕ отряда против суммы обороны, разброс ±15%.</span>';
    } else if (act === 'scout') {
      calc = squadBE(sq, { act: 'scout', weather: w });
      const stealth = stealthOf(sq, calc);
      extra = `СКРЫТНОСТЬ: ${fmtBE(stealth)} = средняя БЕ разведки × 3 − ${Math.max(0, sq.pawns.length - 3)} × 1,5 (лишние пешки шумят).<br><span class="rw-small">Если бдительность врага в клетке выше — стычка, потеря пешки. Разведка идёт в зачёт заказчику, только если сторона совпадает.</span>`;
    } else {
      const fort = act === 'fortify', retreating = act === 'retreat', close = isClose(tgt.building, w);
      cond.push(tgt.building ? `${BUILDING[tgt.building].name.toLowerCase()} в клетке` : 'открытая местность');
      calc = squadBE(sq, { act: 'defend', close, building: tgt.building, fortified: fort, retreating, weather: w }); mode = 'defend';
      extra = `ОБОРОНА ОТРЯДА: ${fmtBE(calc.total)} БЕ${act === 'wait' ? ' — оборона не развёрнута' : ''}`;
    }
    const close = act !== 'scout' && isClose(tgt.building, w);
    const b = openModal('confirm', `<h3>${esc(title)}</h3>
      <p class="rw-small">${ACTION_TEXT[act]}</p>
      <div class="rw-sides">${Object.entries(SIDE).map(([k, v]) => `<button data-s="${k}" class="${side === k ? 'on' : ''} s-${k}">${v.full}</button>`).join('')}</div>
      <p class="rw-small">${SIDE[side].text}</p>
      <p>УСЛОВИЯ: ${cond.join(' · ')}</p>
      <div class="rw-table"><table><tr><th></th><th>ПЕШКА</th><th>БАЗА</th><th>БАФЫ И ДЕБАФЫ</th><th>ИТОГ</th></tr>${rowsHTML(calc.rows, mode, close, 'us')}</table></div>
      <p class="rw-sum">ОТРЯД: <b>${fmtBE(calc.total)} БЕ</b></p><p>${extra}</p>
      <div class="rw-btns"><button data-ok>ПОДТВЕРДИТЬ</button><button data-no>ОТМЕНА</button></div>`);
    b.querySelectorAll('[data-s]').forEach((x) => tap(x, () => { sfx.click(); W.selSide = x.dataset.s; openConfirm(sq, act, x.dataset.s, picks); }));
    tap(b.querySelector('[data-ok]'), () => { sfx.confirm(); closeModal(); perform(sq, act, side, picks); });
    tap(b.querySelector('[data-no]'), () => { sfx.back(); closeModal(); refresh(); });
  }
  const stealthOf = (sq, calc) => Math.max(0, (calc.total / Math.max(1, sq.pawns.length)) * 3 - Math.max(0, sq.pawns.length - 3) * 1.5);

  // ---------- исполнение ----------
  function moveUnit(sec, u, to) {
    const from = sec.cells[u.cell]; from.units = from.units.filter((x) => x !== u);
    sec.cells[to].units.push(u); u.cell = to;
  }
  function prune(sec) {
    for (const c of sec.cells) {
      c.units = c.units.filter((u) => u.pawns.length);
      if (c.owner === 'us' && !c.units.some((u) => u.side === 'us')) c.owner = null;
    }
  }
  function perform(sq, act, side, picks) {
    const sec = W.sectors[sq.sec];
    sq.ally = side; sq.cd = act === 'scout' ? 8 : 12;
    const say = (t) => toast(`${sq.tag}: ${t}`);
    if (act === 'fortify') { sq.stance = 'fortify'; storm.lock(); say('закрепились.'); }
    else if (act === 'wait') { sq.stance = 'wait'; say('ожидают.'); }
    else if (act === 'retreat') { sq.stance = 'wait'; sq.retreatT = 20; moveUnit(sec, sq, picks[0]); snd.fall(); say(`отходят на ${cellName(sec, picks[0])}.`); }
    else if (act === 'move') { sq.stance = 'wait'; moveUnit(sec, sq, picks[0]); sq.cd = 6 * dist(sq.cell, picks[0]) || 6; say(`перемещаются на ${cellName(sec, picks[0])}.`); }
    else if (act === 'scout') scout(sec, sq, picks);
    else if (act === 'attack') {
      sq.stance = 'wait';
      const tc = sec.cells[picks[0]], was = tc.scouted;
      tc.scouted = true;
      const res = fight(sec, [sq], picks[0], { scouted: was });
      contractsOnFight(sec, sq, picks[0], res);
      showResult(sq, sec, picks[0], res);
    }
    W.sel = sq.pawns.length ? sq : null;
    checkContracts();
    refresh();
  }
  function scout(sec, sq, cells) {
    const calc = squadBE(sq, { act: 'scout', weather: sec.weather }), stealth = stealthOf(sq, calc);
    let spotted = null;
    for (const i of cells) {
      const c = sec.cells[i]; c.scouted = true; scanFX(i);
      const vig = c.units.filter((u) => hostile(sq, u)).reduce((s, u) => s + u.pawns.reduce((a, p) => a + SIZE[p.size].be, 0), 0) * 0.22;
      if (vig > stealth && !spotted) spotted = { i, vig };
      for (const k of W.contracts) if (k.type === 'scout' && k.sec === sec.idx && k.cells.includes(i) && sq.ally === k.side) k.done.add(i);
    }
    storm.lock();
    if (spotted) {
      const dead = casualties([sq], 0.34, true); W.lost += dead.length; markDying(dead.map((p) => p.id)); prune(sec);
      toast(`${sq.tag}: засекли у ${cellName(sec, spotted.i)} (бдительность ${fmtBE(spotted.vig)} > скрытность ${fmtBE(stealth)}). Потери: ${dead.map((p) => SIZE[p.size].mark).join(', ')}.`, 'warn');
      if (sec.idx === W.view) snd.shot('smg');
    } else toast(`${sq.tag}: разведка ${cells.map((i) => cellName(sec, i)).join(', ')} — не замечены.`);
  }

  // бой: атакующие отряды против враждебных им отрядов в клетке to
  function fight(sec, att, to, o = {}) {
    const tc = sec.cells[to], lead = att[0], w = sec.weather, close = isClose(tc.building, w);
    const defs = tc.units.filter((u) => !att.includes(u) && hostile(lead, u) && att.some((a) => hostile(a, u)));
    const fromCells = att.map((u) => u.cell);
    const attIds = att.flatMap((u) => u.pawns.map((p) => p.id)), defIds = defs.flatMap((u) => u.pawns.map((p) => p.id));
    const Ab = att.map((u) => squadBE(u, { act: 'attack', scouted: u.side === 'us' ? o.scouted ?? true : true, close, weather: w }));
    const Db = defs.map((u) => squadBE(u, { act: 'defend', close, building: tc.building, weather: w }));
    const A = Ab.reduce((s, x) => s + x.total, 0), D = Db.reduce((s, x) => s + x.total, 0);
    const r = resolve(A, D);
    const aDead = r.win ? casualties(att, r.winnerLoss, false) : casualties(att, r.loserLoss, true);
    const dDead = r.win ? casualties(defs, r.loserLoss, true) : casualties(defs, r.winnerLoss, false);
    const ownerBefore = tc.owner;
    if (r.win) {
      for (const u of defs) {
        if (!u.pawns.length) continue;
        const out = nbrs(to).find((n) => !sec.cells[n].units.some((x) => hostile(u, x)) && (sec.cells[n].owner === u.side || u.side === 'us'));
        if (out != null) moveUnit(sec, u, out); else { dDead.push(...u.pawns); u.pawns = []; }
      }
      for (const u of att) if (u.pawns.length && u.cell !== to) moveUnit(sec, u, to);
      if (att.some((u) => u.pawns.length)) {
        if (lead.side !== 'us') tc.owner = lead.side;
        else if (lead.ally !== 'neutral') tc.owner = lead.ally;
        else if (!tc.owner || tc.owner === 'unk') tc.owner = 'us';
      }
    }
    W.lost += aDead.filter(() => lead.side === 'us').length + dDead.filter(() => defs.some((u) => u.side === 'us')).length;
    prune(sec);
    const res = { r, A, D, aDead, dDead, defs, ownerBefore, owner: tc.owner, close };
    if (sec.idx === W.view && W.sv) playFight(sec, att, fromCells, to, attIds, defIds, [...aDead, ...dDead].map((p) => p.id), close);
    return res;
  }

  // анимация боя: сближение, оружие в руках, вспышки, трассеры, падения
  function playFight(sec, att, fromCells, to, attIds, defIds, deadIds, close) {
    const [tx, tz] = cellXZ(to);
    attIds.forEach((id) => {
      const m = meshes.get(id); if (!m) return;
      const k = 0.55; m.target.set(m.g.position.x + (tx - m.g.position.x) * k, 0, m.g.position.z + (tz - m.g.position.z) * k);
      m.target.y = W.sv.h(m.target.x, m.target.z);
    });
    W.fx.push({ t: 0, dur: 2.6, att: attIds, def: defIds, dead: deadIds, close, to, snd: 0 });
  }
  function scanFX(i) {
    if (W.sectors[W.view]?.cells[i] == null || !W.sv) return;
    const [x, z] = cellXZ(i);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 32), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, W.sv.h(x, z) + 0.12, z); W.sv.group.add(m); beams.push({ m, t: 0, dur: 1.6, kind: 'ring' });
  }
  function dropFX(i) {
    if (!W.sv) return;
    const [x, z] = cellXZ(i);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb0a0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, W.sv.h(x, z) + 3, z); W.sv.group.add(m); beams.push({ m, t: 0, dur: 2.4, kind: 'beam' });
  }
  function showResult(sq, sec, to, res) {
    const { r, A, D, aDead, dDead, defs } = res;
    const names = (arr) => arr.length ? arr.map((p) => SIZE[p.size].mark).join(', ') : 'нет';
    setTimeout(() => {
      if (W.over) return;
      const html = `<h3 class="${r.win ? 'win' : 'lose'}">${r.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'} · ${cellName(sec, to)}</h3>
        <p>${sq.tag}: ${fmtBE(A)} БЕ × разброс = ${fmtBE(r.a)} · ПРОТИВНИК: ${fmtBE(D)} × разброс = ${fmtBE(r.d)}</p>
        <p>ПРОТИВНИКОВ: ${defs.length ? defs.map((u) => `${FACTION[u.side]} ${SQUAD[u.type].name}`).join(', ') : 'не было'}</p>
        <p>НАШИ ПОТЕРИ: ${names(aDead)} · ПОТЕРИ ПРОТИВНИКА: ${names(dDead)}</p>
        <p>КЛЕТКА: ${FACTION[res.owner] || 'НИЧЬЯ'}${res.ownerBefore !== res.owner ? ` (была ${FACTION[res.ownerBefore] || 'ничья'})` : ''}</p>
        <div class="rw-btns"><button data-ok>ПОНЯТНО</button></div>`;
      if (W.modal || W.view !== sec.idx) { toast(`${sq.tag}: ${r.win ? 'победа' : 'поражение'} у ${cellName(sec, to)}`, r.win ? 'ok' : 'warn'); return; }
      const b = openModal('result', html); r.win ? storm.captured() : storm.alarm();
      tap(b.querySelector('[data-ok]'), () => { sfx.click(); closeModal(); refresh(); });
    }, sec.idx === W.view ? 2700 : 0);
  }


  // ---------- пауза: справочник по юнитам, действиям и модификаторам ----------
  const TABS = { goal: 'ЦЕЛЬ', units: 'ЮНИТЫ', squads: 'ОТРЯДЫ', actions: 'ДЕЙСТВИЯ', sides: 'СТОРОНЫ', mods: 'МОДИФИКАТОРЫ', weather: 'ПОГОДА', build: 'ПОСТРОЙКИ' };
  const li = (a) => `<ul class="rw-list">${a.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  function handbook(tab) {
    if (tab === 'goal') return li([
      'Мы — третья сторона. Исполняем запросы НТ и СНК своими рейдерами, но держим их влияние в равновесии.',
      'Весь пролог — 30 минут. В конце равновесие должно быть в зелёной зоне (перекос до 25%) — иначе контракт сорван.',
      `Перекос больше 50% дольше ${RED_TIME} с — провал сразу.`,
      'Влияние стороны = её клетки (вышка и блок-пост +1, шахта +2) × сила стороны.',
      'Запросы: разведка, захват, подкрепление, проход колонны, зачистка. Отказ — сила заказчика −12. Успех +10, провал −6.',
      `Резерв — ${RESERVE} отрядов на всю операцию. Состав и число выбираются перед высадкой; высаженные отряды не вернуть.`,
      'Высадка — с базы заказчика или рядом с нашими войсками. В окне подтверждения и в паузе время стоит.']);
    if (tab === 'units') return Object.entries(SIZE).map(([k, S]) => {
      const T = TXT.pawns[k], w = k === 'L' ? 'снайперская винтовка, нож' : k === 'M' ? 'пистолет-пулемёт, дробовик или горелка' : 'пулемёт, кувалда';
      return `<div class="rw-hb"><img src="${pawnIcon(k)}" alt=""><div><b>${S.mark} · ${S.name} · БЕ ${fmtBE(S.be)}</b><p>ОРУЖИЕ: ${w}</p><p>${esc(T.fight)}</p><p class="rw-small">«${esc(T.role)}» ${esc(T.roleSrc)}</p></div></div>`;
    }).join('') + '<p class="rw-small">Нажмите на пешку в секторе — снаряжение и цитаты из книги. В бою и в обороне пешки достают оружие.</p>';
    if (tab === 'squads') return [
      ['assault', ['атака +1 каждой', 'оборона −2', 'разведка −3', 'лучше всего — штурм разведанных клеток']],
      ['hold', ['оборона +2, в строении +3', 'атака −3', 'разведка −5', 'держат строения и принимают атаки без движения']],
      ['recon', ['атака по неразведанной клетке: +5 и без −4 — внезапная атака сразу с разведкой', 'лучшая скрытность в разведке']],
    ].map(([k, m]) => `<div class="rw-hb"><div class="rw-icons">${SQUAD[k].comp.map((s) => `<img src="${pawnIcon(s)}" alt="">`).join('')}</div><div><b>${SQUAD[k].name}</b><p>${SQUAD[k].text}</p>${li(m)}</div></div>`).join('');
    if (tab === 'actions') return li(Object.entries(ACTION).map(([k, v]) => `<b>${v}</b> — ${ACTION_TEXT[k]}`).concat(['Каждое действие подтверждается: в окне видно каждую пешку, её бафы и дебафы и причины.', 'После действия отряд занят: разведка 8 с, остальное 12 с, перемещение 6 с за клетку.']));
    if (tab === 'sides') return li(Object.values(SIDE).map((v) => `<b>${v.full}</b> — ${v.text}`).concat(['Сторона выбирается для каждого действия и определяет, кого отряд атакует, защищает или игнорирует.', 'Неизвестные враждебны всем. Разведка идёт в зачёт заказчику, только если отряд воюет за него.']));
    if (tab === 'mods') return li([
      '<b>База:</b> Л 5 · С 7,5 · Б 10 БЕ за пешку. Все модификаторы — на каждую пешку отдельно.',
      '<b>Атака:</b> неразведанная клетка −4 (кроме разведки) · штурмовой +1 · закрепляющий −3 · разведка по неразведанной +5.',
      '<b>Оборона:</b> штурмовой −2 · закрепляющий +2 (в строении +3) · закрепились +1 · вышка +1, блок-пост +3, шахта +5 (только закрепившимся) · отступающие −1 (20 с).',
      '<b>Ожидание:</b> оборона не развёрнута — бонусов закрепления нет.',
      '<b>Разведка:</b> штурмовой −3 · закрепляющий −5. Скрытность = средняя БЕ × 3 − 1,5 за каждую пешку сверх трёх. Бдительность врага = 22% базовой БЕ его пешек в клетке. Если она выше — стычка и потеря пешки.',
      '<b>Ближний бой</b> (строение в клетке, метель или туман): Л −0,25 (нож вместо винтовки), Б берут кувалду без потерь, С без изменений.',
      '<b>Исход боя:</b> сумма БЕ атаки против суммы обороны, разброс ±15%. Проигравший теряет от 45% пешек, победитель — до 30%. Выжившие защитники отходят на свою соседнюю клетку.']);
    if (tab === 'weather') return Object.values(WEATHER).map((w, i) => `<div class="rw-hb"><div><b>${w.name}${w.close ? ' · бой только ближний' : ''}</b>${li(weatherLines(WEATHER_KEYS[i]))}</div></div>`).join('') + '<p class="rw-small">Погода в секторах меняется каждые 3–6 минут.</p>';
    if (tab === 'build') return li(Object.values(BUILDING).map((b) => `<b>${b.name}</b> — закрепившимся +${b.fort} каждой пешке; влияние +${b.value}; в клетке со строением бой ближний.`).concat(['Метки на карте: В — вышка, Ш — шахта, П — блок-пост.']));
    return '';
  }
  function openPause(tab) {
    const b = openModal('pause', `<h3>ПАУЗА · СПРАВОЧНИК</h3>
      <div class="rw-tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="rw-hbody">${handbook(tab)}</div>
      <div class="rw-btns"><button data-ok>ПРОДОЛЖИТЬ</button></div>`);
    b.querySelectorAll('[data-t]').forEach((x) => tap(x, () => { sfx.click(); openPause(x.dataset.t); }));
    tap(b.querySelector('[data-ok]'), () => { sfx.menuClose(); closeModal(); });
  }

  // ---------- карточка пешки: снаряжение из книги и мини-модель ----------
  let mini = null;
  const GEAR_OF = { smg: 'Вектор', shotgun: 'Бур', burner: 'горелка' };
  function openCard(p, u) {
    const T = TXT.pawns[p.size];
    const gear = T.gear.map((g) => {
      const mine = p.size !== 'M' || !Object.values(GEAR_OF).some((k) => g.item.includes(k)) || g.item.includes(GEAR_OF[p.main]);
      return `<li class="${mine ? 'mine' : 'other'}"><b>${esc(g.item)}${p.size === 'M' && g.item.includes(GEAR_OF[p.main]) ? ' · У ЭТОЙ ПЕШКИ' : ''}</b><span>${esc(g.text)}</span>${g.src ? `<i>${esc(g.src)}</i>` : ''}</li>`;
    }).join('');
    const b = openModal('card', `<h3>${SIZE[p.size].name} · ${SIZE[p.size].mark} · БЕ ${fmtBE(SIZE[p.size].be)}</h3>
      <div class="rw-card"><canvas class="rw-mini"></canvas><div>
        <p class="rw-quote">«${esc(T.role)}» <i>${esc(T.roleSrc)}</i></p>
        <p><b>В БОЮ:</b> ${esc(T.fight)}</p>
        <p><b>ОРУЖИЕ:</b> ${WEAPON[p.main]}${p.close !== p.main ? ` · ${WEAPON[p.close]}` : ''}</p>
        ${u ? `<p><b>ОТРЯД:</b> ${FACTION[u.side]} · ${SQUAD[u.type].name}${u.side === 'us' ? ` · ${u.tag} · ${SIDE[u.ally].full}` : ''}</p>` : ''}
      </div></div>
      <ul class="rw-gear">${gear}</ul>
      <div class="rw-btns"><button data-ok>ЗАКРЫТЬ</button></div>`);
    tap(b.querySelector('[data-ok]'), () => { sfx.back(); closeModal(); });
    sfx.click();
    const cv = b.querySelector('.rw-mini');
    requestAnimationFrame(() => {
      if (W.modal !== 'card') return;
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(cv.clientWidth, cv.clientHeight, false);
      const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0x8090a0, 1.2));
      const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(2, 3, 4); sc.add(dl);
      const cam = new THREE.PerspectiveCamera(30, cv.clientWidth / cv.clientHeight, 0.01, 20); cam.position.set(0, 0.3, 1.3); cam.lookAt(0, 0.19, 0);
      const g = makePawn(p, u?.side || 'us'); g.userData.pose('fire'); sc.add(g);
      mini = { r, sc, cam, g, t: 0 };
    });
  }
  function closeMini() { if (!mini) return; mini.r.dispose(); mini.r.forceContextLoss?.(); mini = null; }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY, performance.now()]; };
  const onUp = (e) => {
    if (!down || W.view < 0 || W.modal || W.pick) { down = null; return; }
    const [x, y, t] = down; down = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 8 || performance.now() - t > 500 || e.target.closest('button, .pr-info, .rw-hud')) return;
    const rc = ctx.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...meshes.values()].filter((m) => !m.dying).map((m) => m.g), true);
    const g = hits[0]?.object.userData.pawnRoot;
    if (g) openCard(g.userData.pawn, g.userData.squad);
  };
  root.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp);

  // ---------- запросы и контракты ----------
  let cid = 0;
  function sideCells(sec, side) { return sec.cells.filter((c) => c.owner === side); }
  function makeRequest() {
    const side = Math.random() < 0.5 ? 'nt' : 'snk', foe = OTHER[side];
    for (const type of shuffle(['scout', 'capture', 'reinforce', 'transit', 'clear', 'capture', 'scout'])) {
      for (const sec of shuffle(W.sectors)) {
        let cells = null;
        if (type === 'scout') {
          const border = sec.cells.filter((c) => !c.scouted && (nbrs(c.i).some((n) => sec.cells[n].owner === side) || Math.random() < 0.2));
          if (!border.length) continue;
          cells = [pick(border).i];
          while (cells.length < 2 + Math.floor(Math.random() * 3)) {
            const next = shuffle(cells.flatMap(nbrs)).find((n) => !cells.includes(n) && !sec.cells[n].scouted);
            if (next == null) break; cells.push(next);
          }
          if (cells.length < 2) continue;
          cells.sort((a, b) => a - b);
        } else if (type === 'capture') {
          const t = sec.cells.filter((c) => (c.owner === foe || c.owner === 'unk') && !c.base && nbrs(c.i).some((n) => sec.cells[n].owner === side));
          if (!t.length) continue; cells = [pick(t).i];
        } else if (type === 'reinforce') {
          const t = sec.cells.filter((c) => c.owner === side && nbrs(c.i).some((n) => [foe, 'unk'].includes(sec.cells[n].owner) && sec.cells[n].units.length));
          if (!t.length) continue; cells = [pick(t).i];
        } else if (type === 'transit') {
          const b = BASE[side]; if (sec.cells[b].owner !== side) continue;
          const dir = side === 'nt' ? 1 : -1, len = 2 + Math.floor(Math.random() * 2);
          cells = Array.from({ length: len }, (_, k) => b + dir * (k + 1));
          if (!cells.some((i) => sec.cells[i].owner !== side)) continue;
        } else if (type === 'clear') {
          const t = sec.cells.filter((c) => c.units.some((u) => u.side === 'unk'));
          if (!t.length) continue; cells = [pick(t).i];
        }
        if (!cells) continue;
        const where = `${sec.letter}-${cells.map((i) => i + 1).join('-')}`;
        return { id: ++cid, type, side, sec: sec.idx, cells, left: DUR[type], dur: DUR[type], done: new Set(), text: pick(TXT.requests[type]).replace('{s}', where), where };
      }
    }
    return null;
  }
  function arrive(req) {
    if (W.modal) { W.queue = req; return; }
    W.pending = req; req.decide = 25;
    storm.radio(); ctx.say(`${TXT.callsign[req.side]}: ${req.text}`);
    W.pick = null;
    if (W.view !== req.sec) enterSector(req.sec);
    requestModal(req);
  }
  function requestModal(req) {
    const b = openModal('req', `<h3 class="s-${req.side}">${FACTION[req.side]} · ${TXT.callsign[req.side]}</h3>
      <p class="rw-radio">«${esc(req.text)}»</p>
      <p>ЗАДАЧА: ${TXT.task[req.type]} · СРОК ${fmtT(req.dur)}</p><p class="rw-small">${esc(TXT.goal[req.type])}</p>
      <p class="rw-small">ОТКАЗ: сила ${FACTION[req.side]} −12 · УСПЕХ: +10 · ПРОВАЛ: −6</p>
      <div class="rw-btns"><button data-yes>${req.type === 'transit' ? 'РАЗРЕШИТЬ' : 'РАЗВЕРНУТЬ ВОЙСКА'}</button><button data-no>ОТКАЗАТЬ</button></div><i class="rw-timer"></i>`);
    tap(b.querySelector('[data-yes]'), () => { sfx.confirm(); deployModal(req); });
    tap(b.querySelector('[data-no]'), () => { sfx.back(); decline(req); });
  }
  function decline(req) {
    W.strength[req.side] = Math.max(20, W.strength[req.side] - 12);
    ctx.say(`${TXT.callsign[req.side]}: ${TXT.declined[req.side]}`);
    toast(`Отказ ${FACTION[req.side]}: сила −12.`, 'warn');
    W.pending = null; closeModal(); refresh();
  }
  function landingCell(sec, side) {
    const b = sec.cells[BASE[side]], me = { side: 'us', ally: side };
    if (b.owner === side && !b.units.some((u) => hostile(me, u))) return b.i;
    const own = sec.cells.find((c) => c.owner === side && !c.units.some((u) => hostile(me, u)));
    if (own) return own.i;
    const ours = sec.cells.find((c) => c.units.some((u) => u.side === 'us' && u.ally === side));
    return ours ? ours.i : b.i;
  }
  function deployModal(req) {
    const sec = W.sectors[req.sec], cnt = { assault: 0, hold: 0, recon: 0 }, land = landingCell(sec, req.side);
    const have = sec.cells.some((c) => c.units.some((u) => u.side === 'us'));
    const render = () => {
      const total = cnt.assault + cnt.hold + cnt.recon;
      const b = openModal('deploy', `<h3 class="s-${req.side}">ВЫСАДКА · ${esc(req.where)} · ЗА ${FACTION[req.side]}</h3>
        <p>МЕСТО ВЫСАДКИ: ${cellName(sec, land)}${sec.cells[land].base === req.side ? ` (база ${FACTION[req.side]})` : ''} · РЕЗЕРВ: ${W.reserve - total} из ${W.reserve}</p>
        <p class="rw-small">Высаженные отряды не вернуть в резерв.</p>
        ${Object.entries(SQUAD).map(([k, S]) => `<div class="rw-dep"><div><b>${S.name}</b><span>${S.text}</span><div>${S.comp.map((s) => `<img src="${pawnIcon(s)}" alt="">`).join('')}</div></div>
          <button data-m="${k}">−</button><em>${cnt[k]}</em><button data-p="${k}">+</button></div>`).join('')}
        <div class="rw-btns"><button data-go${total ? '' : ' disabled'}>ВЫСАДИТЬ ${total || ''}</button>${have || req.type === 'transit' ? '<button data-skip>БЕЗ ВЫСАДКИ</button>' : ''}<button data-no>ОТКАЗАТЬ</button></div>`);
      b.querySelectorAll('[data-m]').forEach((x) => tap(x, () => { if (cnt[x.dataset.m] > 0) { cnt[x.dataset.m]--; sfx.click(); render(); } }));
      b.querySelectorAll('[data-p]').forEach((x) => tap(x, () => { if (total < W.reserve) { cnt[x.dataset.p]++; sfx.click(); render(); } else sfx.denied(); }));
      tap(b.querySelector('[data-go]'), () => { if (!total) return; sfx.confirm(); accept(req, cnt, land); });
      b.querySelector('[data-skip]') && tap(b.querySelector('[data-skip]'), () => { sfx.confirm(); accept(req, { assault: 0, hold: 0, recon: 0 }, land); });
      tap(b.querySelector('[data-no]'), () => { sfx.back(); decline(req); });
    };
    render();
  }
  function accept(req, cnt, land) {
    const sec = W.sectors[req.sec];
    W.pending = null; closeModal();
    let n = 0;
    for (const [type, k] of Object.entries(cnt)) {
      for (let i = 0; i < k; i++) {
        const s = newSquad(type, 'us', req.side), at = freeNear(sec, land, req.side); s.sec = sec.idx; s.cell = at; s.dropping = true; s.cd = 3;
        sec.cells[at].units.push(s); sec.cells[at].scouted = true; n++;
      }
    }
    W.reserve -= n; W.landed += n;
    sec.cells[land].scouted = true;
    if (n) {
      snd.drop(); toast(`Высадка: ${n} отр. на ${cellName(sec, land)}.`);
      if (sec.idx === W.view) dropFX(land);
    }
    W.contracts.push(req);
    if (req.type === 'transit') {
      const cv = newSquad('assault', req.side, req.side); cv.sec = sec.idx; cv.cell = BASE[req.side]; cv.convoy = true;
      sec.cells[BASE[req.side]].units.push(cv); req.convoy = cv; req.step = 0; req.stepT = 8;
    }
    ctx.say(`Актив: принято. ${TXT.task[req.type]} ${req.where}.`);
    refresh();
  }
  function contractsOnFight(sec, sq, to, res) {
    for (const k of W.contracts) if (k.type === 'capture' && k.sec === sec.idx && k.cells[0] === to && res.r.win && sq.ally === k.side && sec.cells[to].owner === k.side) k.captured = true;
  }
  function finishContract(k, ok) {
    W.contracts = W.contracts.filter((x) => x !== k);
    W.strength[k.side] = Math.max(20, Math.min(180, W.strength[k.side] + (ok ? 10 : -6)));
    ctx.say(`${TXT.callsign[k.side]}: ${ok ? TXT.done[k.side] : TXT.failed[k.side]}`);
    toast(`${FACTION[k.side]} · ${TXT.task[k.type]} ${k.where}: ${ok ? 'ВЫПОЛНЕНО, сила +10' : 'ПРОВАЛ, сила −6'}`, ok ? 'ok' : 'warn');
    ok ? storm.captured() : storm.alarm();
  }
  function checkContracts() {
    for (const k of [...W.contracts]) {
      const sec = W.sectors[k.sec];
      if (k.type === 'scout' && k.cells.every((i) => k.done.has(i))) finishContract(k, true);
      else if (k.type === 'capture' && k.captured) finishContract(k, true);
      else if (k.type === 'clear' && sec.cells[k.cells[0]].scouted && !sec.cells[k.cells[0]].units.some((u) => u.side === 'unk') && k.touched) finishContract(k, true);
    }
  }
  function contractsTick(dt) {
    for (const k of [...W.contracts]) {
      const sec = W.sectors[k.sec];
      k.left -= dt;
      if (k.type === 'clear' && sec.cells[k.cells[0]].units.some((u) => u.side === 'us')) k.touched = true;
      if (k.type === 'transit') {
        const cv = k.convoy;
        if (!cv.pawns.length) { finishContract(k, false); continue; }
        k.stepT -= dt;
        if (k.stepT <= 0) {
          k.stepT = 8;
          const next = k.cells[k.step];
          const escorts = sec.cells.filter((c) => c.i === cv.cell || c.i === next).flatMap((c) => c.units.filter((u) => u.side === 'us' && u.ally === k.side));
          const hostiles = sec.cells[next].units.filter((u) => hostile(cv, u));
          if (hostiles.length) {
            const res = fight(sec, [cv, ...escorts], next);
            if (!res.r.win) { toast(`Колонна ${FACTION[k.side]} остановлена у ${cellName(sec, next)}.`, 'warn'); }
          } else { moveUnit(sec, cv, next); if (sec.cells[next].owner !== k.side && !sec.cells[next].units.some((u) => u.side !== k.side && u.side !== 'us')) sec.cells[next].owner = k.side; }
          if (cv.cell === next) k.step++;
          if (k.step >= k.cells.length) { finishContract(k, true); cv.convoy = false; }
          refresh();
        }
      }
      if (k.type === 'reinforce' && k.left <= 0) {
        // атака на клетку: подкрепление должно было успеть
        const c = sec.cells[k.cells[0]], foeSide = nbrs(c.i).map((n) => sec.cells[n].owner).find((o) => o === OTHER[k.side] || o === 'unk') || OTHER[k.side];
        const helped = c.units.some((u) => u.side === 'us' && u.ally === k.side && u.stance === 'fortify');
        const src = nbrs(c.i).find((n) => sec.cells[n].owner === foeSide) ?? c.i;
        const att = ['assault', 'assault'].map((t) => { const s = newSquad(t, foeSide, foeSide); s.sec = sec.idx; s.cell = src; sec.cells[src].units.push(s); return s; });
        const res = fight(sec, att, c.i);
        finishContract(k, helped && !res.r.win);
        refresh();
        continue;
      }
      if (k.left <= 0) finishContract(k, false);
    }
    checkContracts();
  }
  function jobsList() {
    const list = W.contracts.map((k) => `<button data-j="${k.id}" class="rw-job s-${k.side}"><b>${FACTION[k.side]} · ${TXT.task[k.type]}</b><span>${k.where} · ${fmtT(k.left)}</span></button>`).join('');
    const key = list + W.view;
    if (jobs.dataset.key === key) return;
    jobs.dataset.key = key; jobs.innerHTML = list;
    jobs.querySelectorAll('[data-j]').forEach((b) => tap(b, () => { const k = W.contracts.find((x) => x.id === +b.dataset.j); if (k && !W.modal) { sfx.click(); enterSector(k.sec); } }));
  }

  // ---------- ИИ фракций ----------
  function aiTick(sec) {
    // стычки внутри клетки
    for (const c of sec.cells) {
      const u = c.units.find((a) => c.units.some((b) => hostile(a, b)));
      if (u && u.side !== 'us') fight(sec, [u], c.i);
    }
    for (const f of shuffle(['nt', 'snk', 'unk'])) {
      const p = f === 'unk' ? 0.55 : 0.42 * W.strength[f] / 100;
      if (Math.random() > p) continue;
      const me = { side: f, ally: f }, opts = [];
      for (const c of sec.cells) {
        const mine = c.units.filter((u) => u.side === f && !u.convoy);
        if (!mine.length) continue;
        const sq = mine.reduce((a, b) => (b.pawns.length > a.pawns.length ? b : a));
        for (const n of nbrs(c.i)) {
          const tc = sec.cells[n];
          const defs = tc.units.filter((u) => hostile(me, u));
          if (tc.units.some((u) => u.side === f)) continue;
          const ownerHostile = tc.owner && tc.owner !== f && (tc.owner === 'us' ? f === 'unk' : hostile(me, { side: tc.owner, ally: tc.owner }));
          if (!defs.length && !ownerHostile) continue;
          const close = isClose(tc.building, sec.weather);
          const A = squadBE(sq, { act: 'attack', scouted: true, close, weather: sec.weather }).total;
          const D = defs.reduce((s, u) => s + squadBE(u, { act: 'defend', close, building: tc.building, weather: sec.weather }).total, 0);
          if (A < D * 0.8) continue;
          opts.push({ sq, to: n, score: A - D + Math.random() * 15 });
        }
      }
      if (!opts.length) continue;
      const o = opts.sort((a, b) => b.score - a.score)[0];
      const involved = sec.cells[o.to].units.some((u) => u.side === 'us');
      const res = fight(sec, [o.sq], o.to);
      if (involved || (res.r.win && res.ownerBefore !== res.owner)) toast(`СЕКТОР ${sec.letter}: ${FACTION[f]} ${res.r.win ? 'взяли' : 'не взяли'} ${cellName(sec, o.to)}${involved ? ' — там были наши' : ''}.`, involved ? 'warn' : '');
    }
  }
  function spawnTick(sec, dt) {
    for (const f of ['nt', 'snk', 'unk']) {
      sec.spawn[f] -= dt * (f === 'unk' ? 1 : W.strength[f] / 100);
      if (sec.spawn[f] > 0) continue;
      sec.spawn[f] = 80 + Math.random() * 40;
      const count = sec.cells.reduce((a, c) => a + c.units.filter((u) => u.side === f).length, 0);
      if (count >= 30) continue;
      const own = sec.cells.filter((c) => c.owner === f && !c.units.length && (f === 'unk' || dist(c.i, BASE[f]) < 5));
      const at = own.length ? pick(own).i : null;
      if (at == null) continue;
      const s = newSquad(pick(['assault', 'hold', 'assault', 'recon']), f, f); s.sec = sec.idx; s.cell = at; if (sec.cells[at].building) s.stance = 'fortify';
      sec.cells[at].units.push(s);
    }
  }
  function influence() {
    const inf = { nt: 0, snk: 0 };
    for (const s of W.sectors) for (const c of s.cells) if (inf[c.owner] != null) inf[c.owner] += 1 + (c.building ? BUILDING[c.building].value : 0);
    inf.nt *= W.strength.nt / 100; inf.snk *= W.strength.snk / 100;
    W.bal = (inf.nt - inf.snk) / Math.max(1, inf.nt + inf.snk);
  }

  // ---------- цикл ----------
  let secT = 0;
  function update(dt, realDt) {
    // визуал — всегда
    if (mini) { mini.g.rotation.y += realDt * 0.9; mini.r.render(mini.sc, mini.cam); }
    if (W.sv) {
      const sec = W.sectors[W.view];
      W.sv.update(realDt, W.t, sec.weather === 'blizzard' ? 3 : 1.2);
      for (const [id, m] of meshes) {
        if (m.dying) {
          m.dying += realDt; m.g.rotation.x = -Math.min(1, m.dying / 0.5) * Math.PI / 2;
          if (m.dying > 1.2) m.g.position.y -= realDt * 0.2;
          if (m.dying > 2.2) { m.g.removeFromParent(); meshes.delete(id); }
          continue;
        }
        const d = m.target.clone().sub(m.g.position), l = d.length();
        if (l > 0.005) {
          const step = Math.min(l, realDt * (m.g.position.y - m.target.y > 0.5 ? 5 : 0.9));
          m.g.position.addScaledVector(d, step / l);
          if (Math.hypot(d.x, d.z) > 0.02) m.g.rotation.y = Math.atan2(d.x, d.z);
        }
      }
      // бои: вспышки, трассеры, звук
      tracerList = tracerList.filter((t) => (t.life -= realDt) > 0);
      for (const f of [...W.fx]) {
        f.t += realDt; f.snd -= realDt;
        const [tx, tz] = cellXZ(f.to), live = (ids) => ids.map((id) => meshes.get(id)).filter((m) => m && !m.dying);
        const A = live(f.att), D = live(f.def);
        for (const [grp, other] of [[A, D], [D, A]]) {
          for (const m of grp) {
            const o = other.length ? other[Math.floor(Math.random() * other.length)].g.position : new THREE.Vector3(tx, 0, tz);
            m.g.rotation.y = Math.atan2(o.x - m.g.position.x, o.z - m.g.position.z);
            const p = m.g.userData.pawn;
            m.g.userData.pose(f.close && p.size !== 'M' ? 'melee' : 'fire');
            m.g.userData.flash(Math.random() < 0.25);
            if (Math.random() < realDt * 5 && tracerList.length < 60 && other.length) {
              const a = m.g.position, b = other[Math.floor(Math.random() * other.length)].g.position;
              tracerList.push({ a: [a.x, a.y + 0.2, a.z], b: [b.x + (Math.random() - 0.5) * 0.1, b.y + 0.15, b.z], life: 0.07 });
            }
          }
        }
        if (f.snd <= 0 && (A.length || D.length)) {
          const m = pick([...A, ...D]), p = m.g.userData.pawn;
          snd.shot(f.close && p.size !== 'M' ? p.close : p.main); f.snd = 0.3 + Math.random() * 0.25;
        }
        if (f.t >= f.dur) {
          W.fx = W.fx.filter((x) => x !== f);
          for (const m of [...A, ...D]) m.g.userData.flash(false);
          markDying(f.dead); if (f.dead.length) snd.fall();
          if (!W.fx.length && W.syncWanted) { W.syncWanted = false; sync(); } else if (!W.fx.length) sync();
        }
      }
      const tp = tracerGeo.attributes.position.array; tp.fill(0);
      tracerList.forEach((t, i) => tp.set([...t.a, ...t.b], i * 6));
      tracerGeo.attributes.position.needsUpdate = true; tracerGeo.setDrawRange(0, tracerList.length * 2);
      for (const b of [...beams]) {
        b.t += realDt; const k = b.t / b.dur;
        if (b.kind === 'ring') { b.m.scale.setScalar(1 + k * 5); b.m.material.opacity = 1 - k; }
        else b.m.material.opacity = 0.4 * (1 - k);
        if (k >= 1) { b.m.removeFromParent(); b.m.geometry.dispose(); beams.splice(beams.indexOf(b), 1); }
      }
    }
    if (W.pending && W.modal === 'req') {
      W.pending.decide -= realDt;
      const tm = box.querySelector('.rw-timer'); if (tm) tm.style.width = `${Math.max(0, W.pending.decide / 25) * 100}%`;
      if (W.pending.decide <= 0) decline(W.pending);
    }
    if (!dt) return;
    // симуляция
    W.t += dt; secT += dt;
    for (const s of W.sectors) {
      s.cells.forEach((c) => c.units.forEach((u) => { if (u.cd > 0) u.cd -= dt; if (u.retreatT > 0) u.retreatT -= dt; }));
      s.aiT -= dt; if (s.aiT <= 0) { s.aiT = 30 + Math.random() * 25; aiTick(s); if (s.idx === W.view) refresh(); }
      spawnTick(s, dt);
      s.weatherT -= dt;
      if (s.weatherT <= 0) { s.weatherT = 200 + Math.random() * 160; s.weather = pick(WEATHER_KEYS.filter((k) => k !== s.weather)); toast(`СЕКТОР ${s.letter}: погода — ${WEATHER[s.weather].name}.`); }
    }
    contractsTick(dt);
    if (!W.pending && !W.queue && W.t > W.nextReq && W.contracts.length < 3) {
      const req = makeRequest(); W.nextReq = W.t + 50 + Math.random() * 30;
      if (req) arrive(req);
    }
    influence();
    const bad = Math.abs(W.bal) > RED;
    W.danger = bad ? W.danger + dt : Math.max(0, W.danger - dt * 2);
    root.classList.toggle('danger', Math.abs(W.bal) > GREEN);
    if (W.danger > RED_TIME) ctx.end(false, W.bal > 0 ? 'НАНОТРЕЙЗЕН ЗАХВАТИЛИ ПЛАНЕТУ.' : 'СНК ЗАХВАТИЛИ ПЛАНЕТУ.');
    if (secT >= 1) {
      secT = 0;
      const bi = root.querySelector('.pr-bal i'); if (bi) bi.style.left = `${(W.bal + 1) * 50}%`;
      const u = root.querySelector('.pr-units');
      if (u) u.textContent = `РЕЗЕРВ ${W.reserve} · СИЛА НТ ${Math.round(W.strength.nt)} · СНК ${Math.round(W.strength.snk)}${bad ? ` · ПЕРЕКОС! ${Math.ceil(RED_TIME - W.danger)} С` : ''}`;
      if (W.view < 0) refresh(); else { paintSector(); jobsList(); if (W.sel && !W.pick && !W.modal) squadInfo(W.sel); }
    }
  }

  overview();
  ctx.say('Актив на связи. 25 отрядов в резерве. Ждите запросов.');
  return {
    update,
    get paused() { return !!W.modal && W.modal !== 'req'; },
    // итог по времени: равновесие в зелёной зоне — победа
    result() { return Math.abs(W.bal) <= GREEN ? [true, 'РАВНОВЕСИЕ СОХРАНЕНО. АКТИВ ОТОЗВАН.'] : [false, W.bal > 0 ? 'ПЕРЕВЕС НАНОТРЕЙЗЕН. КОНТРАКТ СОРВАН.' : 'ПЕРЕВЕС СНК. КОНТРАКТ СОРВАН.']; },
    dispose() { W.over = true; closeMini(); closeSector(); root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointerup', onUp); hud.remove(); },
    debug: W,
    debugFocus(i, d = 3) { const [x, z] = cellXZ(i); ctx.setOrbit({ target: new THREE.Vector3(x, 0, z), dist: d, pitch: 0.55 }); },
    debugRequest() { const r = makeRequest(); if (r) arrive(r); return !!r; },
    // для автотестов: открыть карточку первой нашей пешки
    debugCard() { const m = [...meshes.values()].find((x) => x.g.userData.squad?.side === 'us') || [...meshes.values()][0]; if (m) openCard(m.g.userData.pawn, m.g.userData.squad); },
  };
}
