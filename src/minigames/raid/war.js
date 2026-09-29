import * as THREE from 'three';
import { sfx, storm, war as snd } from '../../audio.js';
import TXT from '../../story/raid.json';
import {
  SIZE, WEAPON, SQUAD, BUILDING, ACTION, ACTION_TEXT, SIDE, FACTION, WEATHER, WEATHER_KEYS, VEHICLE, CLONE_TIME, FAUNA_TYPES,
  newSquad, newPawn, hostile, squadRange, inRange, ctrlSide, squadBE, resolve, fmtBE, fmtMod,
} from './rules.js';
import { pawnIcon, makePawn } from './pawns.js';
import { SECTORS, BASE, makeSector, buildSectorView, cellXZ, nbrs, dist, within, hexAt } from './sector.js';
import { makeCrowd } from './crowd.js';

// Захват планеты (пролог, часть 2). Мы — третья сторона: исполняем запросы НТ и СНК своими рейдерами
// и держим их влияние в равновесии. 4 точки на планете → гексагональная карта сектора 20×20.
// Дальность: отряд вступает в бой целиком на своей дальности (разведка 5, штурм 3, закреп 1),
// пешка бьёт только в пределах своей (Л 5, С 3, Б 2). Видимость: отряды открывают клетки вокруг себя.
// Контроль: занятое строение или оборона контролируют клетки вокруг (+1 БЕ). Тела → клоны. Фауна.
const RESERVE = 25, TRUCKS = 3, SHUTTLES = 2, GREEN = 0.25, RED = 0.5, RED_TIME = 60;
const OTHER = { nt: 'snk', snk: 'nt' };
const KIND = { free: 'СВОБОДЕН', nt: 'ЗАНЯТ НТ', snk: 'ЗАНЯТ СНК', unk: 'НЕИЗВЕСТНЫЕ' };
const BLD = { tower: 'В', mine: 'Ш', post: 'П' };
const DUR = { scout: 200, capture: 240, reinforce: 100, transit: 150, clear: 240 };
const COL = { nt: [1, 0.55, 0.15], snk: [0.25, 0.55, 1], unk: [0.6, 1, 0.3], us: [1, 0.2, 0.26] };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const fmtT = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const withAlly = (sq, ally) => ({ ...sq, ally });
let vid = 0, bid = 0;

export function startWar(ctx) {
  const { root, scene, camera, orb } = ctx;
  const W = {
    sectors: SECTORS.map((d, i) => makeSector(d, i)),
    reserve: RESERVE, trucks: TRUCKS, shuttles: SHUTTLES, clones: 0, bio: [], bioCarry: 0,
    strength: { nt: 100, snk: 100 }, contracts: [], pending: null, queue: null,
    view: -1, sv: null, crowd: null, sel: null, selV: null, selSide: 'neutral', pick: null, cellSel: null,
    t: 0, nextReq: 12, danger: 0, bal: 0, modal: null, lost: 0, landed: 0, over: false,
  };
  W.sectors.forEach((s) => { s.cells.forEach((c) => c.units.forEach((u) => { u.sec = s.idx; u.cell = c.i; })); });

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
  const cellName = (sec, i) => `${sec.letter}-${i + 1}`;
  const known = (c) => c.scouted || c.units.some((u) => u.side === 'us');

  // ---------- реплики: над плашкой отряда, следуют за пешками, печатаются со звуком ----------
  const STYLE = { hit: 'shake', lose: 'shake', blind: 'shake', attack: 'shake', retreat: 'shake', fauna: 'shake', wait: 'soft', move: 'soft', scout: 'soft', board: 'soft', collect: 'soft', fortify: 'sharp', win: 'sharp', drop: 'sharp' };
  const barks = [];
  function bark(u, kind, dying = false) {
    if (!u || u.side !== 'us' || u.sec !== W.view || !W.sv || u.inside || (!dying && Math.random() < 0.15)) return;
    if (!dying && barks.some((b) => b.u === u)) return;
    const list = TXT.barks[kind]; if (!list) return;
    const sec = W.sectors[u.sec], cells = sec.cells.filter((c) => c.owner && c.owner !== 'us');
    let text = pick(list).replace('{c}', cellName(sec, (pick(cells) || sec.cells[0]).i));
    if (dying) text = text.slice(0, Math.max(2, Math.floor(text.length * (0.35 + Math.random() * 0.3)))) + '—';
    const m = ctx.marker(new THREE.Vector3(), `bark b-${kind} st-${dying ? 'cut' : STYLE[kind] || 'soft'}`, '', null, W.sv.group);
    const b = { m, u, text, i: 0, t: 0 }; barks.push(b);
    if (dying) setTimeout(() => {
      const sp = m.el.querySelector('span'); sp.textContent = ''; b.i = 1e9;
      [...text].forEach((ch, i) => { const e = document.createElement('b'); e.textContent = ch; e.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`); e.style.setProperty('--r', `${(Math.random() - 0.5) * 120}deg`); e.style.animationDelay = `${i * 0.03}s`; sp.appendChild(e); });
    }, 900);
    setTimeout(() => { ctx.unmark(m); const k = barks.indexOf(b); if (k >= 0) barks.splice(k, 1); }, dying ? 2600 : 3400);
  }
  function barksFrame(dt) {
    for (const b of barks) {
      const c = W.crowd?.centroid(b.u); if (c) b.m.pos.set(c.x, c.y + 0.06, c.z);
      if (b.i < b.text.length) {
        b.t += dt;
        while (b.t > 0.035 && b.i < b.text.length) { b.t -= 0.035; b.i++; const ch = b.text[b.i - 1]; if (ch && ch.trim() && b.i % 2) sfx.talk(ch); }
        b.m.el.querySelector('span').textContent = b.text.slice(0, b.i);
      }
    }
  }

  // ---------- обзор планеты ----------
  let sMarkers = [], bMarkers = [], chips = [];
  function overview() {
    closeSector(); W.view = -1; W.sel = W.selV = null; W.pick = null;
    ctx.clearMarkers(); ctx.planet(true); ctx.flash();
    orb.locked = true; orb.pan = 0;
    ctx.setOrbit({ target: new THREE.Vector3(0, -0.28, 0), yaw: 0, pitch: 0, dist: 3.7, min: 3.7, max: 3.7, pmin: -1, pmax: 1 });
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
      <p>РЕЗЕРВ ${W.reserve} · ТРУПОВОЗОК ${W.trucks} · ШАТТЛОВ ${W.shuttles} · КЛОНОВ ${W.clones}</p>
      <p>СИЛА: НТ ${Math.round(W.strength.nt)} · СНК ${Math.round(W.strength.snk)} · ПОТЕРИ ${W.lost}</p>
      <p class="rw-small">Держите влияние НТ и СНК в равновесии. Точка — сектор. Правила — в паузе.</p>`;
  }

  // ---------- сектор ----------
  function enterSector(i) {
    if (W.view === i) return;
    closeSector(); W.view = i; W.sel = W.selV = null; W.pick = null; W.cellSel = null;
    const sec = W.sectors[i];
    ctx.clearMarkers(); ctx.planet(false); ctx.flash();
    W.sv = buildSectorView(sec); scene.add(W.sv.group);
    W.crowd = makeCrowd(W.sv, sec, known);
    W.crowd.onIdle = () => refresh();
    orb.locked = false; orb.pan = 5.5; // свободная камера над картой
    ctx.setOrbit({ target: new THREE.Vector3(0, 0, 0.6), yaw: 0, pitch: 1.05, dist: 12.5, min: 1.2, max: 18, pmin: 0.3, pmax: 1.45 });
    ctx.snap();
    back.hidden = false;
    bMarkers = sec.cells.filter((c) => c.building || c.base).map((c) => { const [x, z] = cellXZ(c.i); const m = ctx.marker(new THREE.Vector3(x, W.sv.h(x, z) + 0.06, z), 'cell', '', () => tapCell(c.i), W.sv.group); m.cell = c.i; return m; });
    control(sec); W.crowd.sync(true); refresh();
  }
  function closeSector() {
    if (!W.sv) return;
    W.crowd.dispose(); W.crowd = null;
    for (const b of barks) ctx.unmark(b.m); barks.length = 0;
    W.sv.dispose(); W.sv = null; bMarkers = []; chips = [];
  }
  const weatherLines = (w) => WEATHER[w].mods.map((m) => {
    const who = [m.size ? SIZE[m.size].mark : '', m.squad ? SQUAD[m.squad].name.toLowerCase() : '', m.act ? { attack: 'атака', defend: 'оборона', scout: 'разведка' }[m.act] : '', m.fort ? 'закреплённые' : ''].filter(Boolean).join(' ') || 'все';
    return `${who} ${fmtMod(m.v)} — ${m.why}`;
  }).concat(WEATHER[w].vis ? [`дальность атаки не больше ${WEATHER[w].vis}`] : []);
  function sectorInfo(sec) {
    const n = sectorCount(sec), W0 = WEATHER[sec.weather], bodies = sec.cells.reduce((a, c) => a + (known(c) ? c.corpses.length : 0), 0);
    const bio = W.bio.length ? ` (в работе ${W.bio.reduce((a, b) => a + b.n, 0)} тел, ${fmtT(Math.min(...W.bio.map((b) => b.t)))})` : '';
    info.innerHTML = `<b>СЕКТОР ${sec.letter} · ${KIND[sec.kind]} · ${W0.name}</b>
      <p class="rw-small">${weatherLines(sec.weather).map(esc).join(' · ')}</p>
      <p>КЛЕТКИ: НТ ${n.nt} · СНК ${n.snk} · ?? ${n.unk} · НАШИ ${n.us} · ТЕЛ НА ВИДУ ${bodies} · КЛОНОВ ${W.clones}${bio}</p>
      <p class="rw-small">Нажмите клетку, плашку отряда или технику. Нажатие на пешку — снаряжение.</p>`;
  }

  // покраска гексов: цели, выбор, запросы, туман, контроль (виден, если найден источник), владельцы
  function paintSector() {
    const sec = W.sectors[W.view]; if (!sec || !W.sv) return;
    const reqCells = new Set();
    for (const c of W.contracts.concat(W.pending ? [W.pending] : [])) if (c.sec === sec.idx) c.cells.forEach((i) => reqCells.add(i));
    const selCell = W.sel?.cell ?? W.selV?.cell;
    W.sv.paint((i) => {
      const c = sec.cells[i];
      if (W.pick?.picks.includes(i)) return [1, 1, 1, 0.55];
      if (W.pick && validPick(i)) return [0.45, 0.88, 1, 0.42];
      if (i === selCell) return [1, 0.25, 0.3, 0.4];
      if (i === W.cellSel) return [1, 1, 1, 0.25];
      if (reqCells.has(i)) return [1, 0.82, 0.2, 0.36];
      if (!known(c)) return [0.03, 0.06, 0.1, 0.5];
      const ct = sec.ctrl[i];
      if (ct && sec.ctrlSeen[i] && COL[ct]) return [...COL[ct], 0.24];
      if (COL[c.owner]) return [...COL[c.owner], 0.08];
      return [0, 0, 0, 0];
    });
    bMarkers.forEach((m) => {
      const c = sec.cells[m.cell];
      m.el.className = `pr-mk cell o-${known(c) ? c.owner || 'none' : 'fog'}${reqCells.has(c.i) ? ' req' : ''}`;
      m.el.querySelector('span').textContent = `${cellName(sec, c.i)} ${c.base ? 'БАЗА' : BLD[c.building]}`;
    });
    // плашки наших отрядов и техники
    chips.forEach((m) => ctx.unmark(m)); chips = [];
    for (const c of sec.cells) for (const u of c.units.filter((x) => x.side === 'us')) {
      const m = ctx.marker(new THREE.Vector3(), `chip a-${u.ally}${W.sel === u ? ' sel' : ''}${u.cd > 0 ? ' cd' : ''}`,
        `${u.tag} ·${u.pawns.length}${u.stance === 'fortify' ? ' ▣' : ''}`, () => { if (!W.modal && !W.pick) selectSquad(u); }, W.sv.group);
      m.u = u; chips.push(m);
    }
    for (const v of sec.vehicles) {
      const m = ctx.marker(new THREE.Vector3(), `chip veh${W.selV === v ? ' sel' : ''}`, `${VEHICLE[v.kind].tag}-${v.id}${v.cargo ? ' ◧' : ''}`, () => { if (!W.modal && !W.pick) selectVehicle(v); }, W.sv.group);
      m.v = v; chips.push(m);
    }
    placeChips();
  }
  function placeChips() {
    if (!W.crowd) return;
    for (const m of chips) {
      const p = m.u ? W.crowd.centroid(m.u) : W.crowd.vehiclePos(m.v);
      if (p) m.pos.set(p.x, p.y + (m.v?.kind === 'shuttle' ? 0.1 : 0.06), p.z);
      else if (m.u) { const [x, z] = cellXZ(m.u.cell); m.pos.set(x, W.sv.h(x, z) + 0.06, z); }
    }
  }
  function refresh() {
    if (W.view < 0) {
      W.sectors.forEach((s, i) => {
        const ours = s.cells.reduce((a, c) => a + c.units.filter((u) => u.side === 'us').length, 0), m = sMarkers[i]; if (!m) return;
        m.el.querySelector('span').textContent = `${s.letter} · ${KIND[s.kind]}\n${WEATHER[s.weather].name}${ours ? ` · НАШИХ ${ours}` : ''}`;
      });
      if (!W.modal) overviewInfo();
    } else {
      const sec = W.sectors[W.view];
      ctx.stage(`СЕКТОР ${sec.letter} · ${WEATHER[sec.weather].name}`);
      W.crowd.sync(); paintSector();
      if (W.pick) pickInfo();
      else if (W.sel && W.sel.pawns.length && W.sel.sec === sec.idx && !W.sel.inside) squadInfo(W.sel);
      else if (W.selV && sec.vehicles.includes(W.selV)) vehicleInfo(W.selV);
      else if (W.cellSel != null) cellInfo(W.cellSel); else sectorInfo(sec);
    }
    jobsList();
  }

  // ---------- клетка, отряд, техника ----------
  function unitLine(u) {
    const icons = u.pawns.map((p) => `<img src="${pawnIcon(p.size, u.side)}" alt="">`).join('');
    return `<div class="rw-unit f-${u.side}"><span>${FACTION[u.side]} · ${SQUAD[u.type].name} · ${u.pawns.length}${u.stance === 'fortify' ? ' · В ОБОРОНЕ' : ''}</span><div>${icons}</div></div>`;
  }
  function tapCell(i) {
    if (W.modal || i < 0) return;
    if (W.pick) {
      if (!validPick(i)) { sfx.denied(); return; }
      sfx.click(); W.pick.picks.push(i);
      if (W.pick.picks.length >= W.pick.need) { const P = W.pick; W.pick = null; P.done(P); }
      refresh(); return;
    }
    sfx.click(); W.sel = W.selV = null; W.cellSel = i; refresh();
  }
  function cellInfo(i) {
    const sec = W.sectors[W.view], c = sec.cells[i], k = known(c);
    const ours = c.units.filter((u) => u.side === 'us'), others = c.units.filter((u) => u.side !== 'us');
    const ct = sec.ctrl[i] && sec.ctrlSeen[i] ? ` · КОНТРОЛЬ ${FACTION[sec.ctrl[i]]}` : '';
    info.innerHTML = `<b>КЛЕТКА ${cellName(sec, i)} · ${k ? FACTION[c.owner] || 'НИЧЬЯ' : 'НЕ РАЗВЕДАНА'}${ct}</b>
      ${c.building ? `<p>${BUILDING[c.building].name} · укрытие +${BUILDING[c.building].fort} закрепившимся · занятое — контроль радиус ${BUILDING[c.building].ctrl}</p>` : ''}
      ${k && c.corpses.length ? `<p>ТЕЛ: ${c.corpses.length} — соберите труповозкой, иначе заберёт противник.</p>` : ''}
      ${k ? (others.length ? others.map(unitLine).join('') : '<p>Чужих отрядов нет.</p>') : '<p>Состав неизвестен. Атака впритык: −4 каждой пешке (кроме внезапной атаки разведки).</p>'}
      ${ours.map((u) => `<button class="rw-pick" data-u="${u.id}">${u.tag} · ${SQUAD[u.type].name} · ${u.pawns.length}</button>`).join('')}`;
    info.querySelectorAll('[data-u]').forEach((b) => tap(b, () => selectSquad(ours.find((u) => u.id === +b.dataset.u))));
  }
  function selectSquad(u) { sfx.click(); W.sel = u; W.selV = null; W.selSide = u.ally; W.cellSel = null; refresh(); }
  function selectVehicle(v) { sfx.click(); W.selV = v; W.sel = null; W.cellSel = null; refresh(); }
  const missing = (u) => { const need = {}; SQUAD[u.type].comp.forEach((s) => (need[s] = (need[s] || 0) + 1)); u.pawns.forEach((p) => need[p.size]--); return Object.keys(need).find((s) => need[s] > 0); };
  const carrierNear = (u) => W.sectors[u.sec].vehicles.find((v) => !v.cargo && (v.cell === u.cell || (v.kind === 'truck' && dist(v.cell, u.cell) === 1)));
  function squadInfo(u) {
    const sec = W.sectors[W.view], car = carrierNear(u), miss = missing(u), dis = u.cd > 0 ? ' disabled' : '';
    info.innerHTML = `<b>${u.tag} · ${SQUAD[u.type].name} · ${cellName(sec, u.cell)} · ДАЛЬНОСТЬ ${SQUAD[u.type].range} · ОБЗОР ${SQUAD[u.type].sight}</b>
      <div class="rw-unit f-us"><span>${u.stance === 'fortify' ? 'В ОБОРОНЕ' : 'ОЖИДАЮТ'} · ${SIDE[u.ally].full}${u.retreatT > 0 ? ' · ОТХОДЯТ' : ''}</span><div>${u.pawns.map((p) => `<img src="${pawnIcon(p.size)}" alt="">`).join('')}</div></div>
      <div class="rw-sides">${Object.entries(SIDE).map(([k, v]) => `<button data-s="${k}" class="${W.selSide === k ? 'on' : ''} s-${k}">${v.name}</button>`).join('')}</div>
      <p class="rw-small">${SIDE[W.selSide].text}</p>
      <div class="pr-acts three">${Object.entries(ACTION).map(([k, v]) => `<button data-a="${k}"${dis}>${v}</button>`).join('')}
        ${car ? `<button data-a="board"${dis}>В ${VEHICLE[car.kind].name}</button>` : ''}
        ${miss && W.clones > 0 ? `<button data-a="clone">КЛОН → ${SIZE[miss].mark}</button>` : ''}</div>
      <p class="rw-small">${u.cd > 0 ? `Отряд занят: ${Math.ceil(u.cd)} с` : 'Выберите сторону и действие.'}</p>`;
    info.querySelectorAll('[data-s]').forEach((b) => tap(b, () => { sfx.click(); W.selSide = b.dataset.s; squadInfo(u); }));
    info.querySelectorAll('[data-a]').forEach((b) => tap(b, () => startAction(u, b.dataset.a)));
  }
  function vehicleInfo(v) {
    const sec = W.sectors[W.view], V = VEHICLE[v.kind], dis = v.cd > 0 ? ' disabled' : '';
    info.innerHTML = `<b>${V.name}-${v.id} · ${cellName(sec, v.cell)}</b><p class="rw-small">${V.text}. Ход до ${V.move} клеток.</p>
      <p>${v.cargo ? `ВНУТРИ: ${v.cargo.tag} · ${SQUAD[v.cargo.type].name} · ${v.cargo.pawns.length}` : 'ОТСЕК ПУСТ'}</p>
      ${v.kind === 'truck' ? `<p class="rw-small">«${esc(TXT.corpses.text)}» ${esc(TXT.corpses.src)}</p>` : ''}
      <div class="pr-acts three"><button data-v="move"${dis}>ПЕРЕМЕСТИТЬСЯ</button>${v.kind === 'truck' ? `<button data-v="collect"${dis}>СОБРАТЬ ТЕЛА</button>` : ''}${v.cargo ? `<button data-v="drop"${dis}>ВЫСАДИТЬ ${v.cargo.tag}</button>` : ''}</div>
      <p class="rw-small">${v.cd > 0 ? `Занят: ${Math.ceil(v.cd)} с` : v.kind === 'truck' ? '2 тела → 1 клон через 3 минуты. Собирает в своей и соседних клетках.' : 'Отряд садится в шаттл в той же клетке.'}</p>`;
    info.querySelectorAll('[data-v]').forEach((b) => tap(b, () => vehicleAction(v, b.dataset.v)));
  }
  function startAction(u, act) {
    if (u.cd > 0) { sfx.denied(); return; }
    sfx.click();
    if (act === 'fortify' || act === 'wait') return openConfirm(u, act, W.selSide, []);
    if (act === 'board') { const v = carrierNear(u); if (v) board(u, v); return; }
    if (act === 'clone') { cloneInto(u); return; }
    const need = act === 'scout' ? (u.type === 'recon' ? 3 : 1) : 1;
    W.pick = { sq: u, act, side: W.selSide, picks: [], need, done: (P) => openConfirm(P.sq, P.act, P.side, P.picks) };
    if (!W.sectors[W.view].cells.some((c) => validPick(c.i))) { W.pick = null; sfx.denied(); toast('Нет подходящих клеток для этого действия.', 'warn'); return; }
    refresh();
  }
  function pickInfo() {
    const P = W.pick, sec = W.sectors[W.view];
    const hint = {
      scout: `Любая клетка${P.need > 1 ? ` (до ${P.need}, «ГОТОВО» — раньше)` : ''}. Отряд не двигается.`,
      attack: `Цель в пределах ${P.sq ? squadRange(P.sq, sec.weather) : 0} клеток. Бьют пешки, до которых достаёт оружие.`,
      retreat: 'Соседняя клетка без противника.', move: 'Клетка до 2 шагов, разведанная, без противника.',
      vmove: 'Клетка в пределах хода техники.', drop: 'Клетка для высадки: под шаттлом или рядом с труповозкой.',
    }[P.act];
    const who = P.v ? `${VEHICLE[P.v.kind].name}-${P.v.id}` : `${ACTION[P.act]} · ${P.sq.tag} · ${SIDE[P.side].full}`;
    info.innerHTML = `<b>${who}</b><p>${ACTION_TEXT[P.act] || ''}</p><p class="rw-small">${hint}</p>
      ${P.picks.length ? `<p>ВЫБРАНО: ${P.picks.map((i) => cellName(sec, i)).join(', ')}</p>` : ''}<div class="pr-acts one">${P.act === 'scout' && P.picks.length ? '<button data-f>ГОТОВО</button>' : ''}<button data-x>ОТМЕНА</button></div>`;
    tap(info.querySelector('[data-x]'), () => { sfx.back(); W.pick = null; refresh(); });
    const f = info.querySelector('[data-f]'); if (f) tap(f, () => { const Q = W.pick; W.pick = null; Q.done(Q); refresh(); });
  }
  // известные враги в клетке для отряда со стороной side
  const knownHostiles = (c, sq, side) => (known(c) ? c.units.filter((u) => u !== sq && hostile(withAlly(sq, side), u)) : []);
  const hasOurs = (c, sq) => c.units.some((u) => u.side === 'us' && u !== sq);
  function validPick(i) {
    const P = W.pick; if (!P) return false;
    const sec = W.sectors[W.view], c = sec.cells[i];
    if (P.v) {
      const v = P.v;
      if (P.act === 'vmove') {
        if (i === v.cell || dist(v.cell, i) > VEHICLE[v.kind].move) return false;
        if (sec.vehicles.some((x) => x !== v && x.kind === v.kind && x.cell === i)) return false;
        return v.kind === 'shuttle' || (known(c) && !c.units.some((u) => hostile({ side: 'us', ally: v.ally }, u)));
      }
      if (P.act === 'drop') return (v.kind === 'shuttle' ? i === v.cell : dist(v.cell, i) <= 1) && !hasOurs(c) && !c.units.some((u) => hostile(v.cargo, u));
      return false;
    }
    const from = P.sq.cell;
    if (P.act === 'scout') return i !== from && !P.picks.includes(i);
    if (P.act === 'attack') {
      const d = dist(from, i);
      if (!d || d > squadRange(P.sq, sec.weather) || hasOurs(c, P.sq)) return false;
      if (!P.sq.pawns.some((p) => inRange(p, d, sec.weather))) return false;
      if (!known(c)) return d === 1;
      const owned = d === 1 && c.owner && c.owner !== 'us' && hostile(withAlly(P.sq, P.side), { side: c.owner, ally: c.owner });
      return knownHostiles(c, P.sq, P.side).length > 0 || owned;
    }
    if (P.act === 'retreat') return nbrs(from).includes(i) && known(c) && !hasOurs(c, P.sq) && !knownHostiles(c, P.sq, P.side).length;
    if (P.act === 'move') {
      if (i === from || dist(from, i) > 2 || !known(c) || hasOurs(c, P.sq) || knownHostiles(c, P.sq, P.side).length) return false;
      return dist(from, i) === 1 || nbrs(from).some((m) => nbrs(m).includes(i) && known(sec.cells[m]) && !knownHostiles(sec.cells[m], P.sq, P.side).length);
    }
    return false;
  }

  // ---------- подтверждение действия: пешки, бафы и дебафы ----------
  function rowsHTML(rows, off, close) {
    return rows.map((r) => {
      const p = r.p, wpn = close && p.size !== 'M' ? p.close : p.main;
      const mods = r.mods.length ? r.mods.map((m) => `<em class="${m.v > 0 ? 'up' : 'dn'}">${fmtMod(m.v)} ${esc(m.why)}</em>`).join('') : '<em>без модификаторов</em>';
      return `<tr><td><img src="${pawnIcon(p.size, 'us')}" alt=""></td><td>${SIZE[p.size].mark} · ${SIZE[p.size].name}<small>${WEAPON[wpn]} · дальн. ${SIZE[p.size].range}</small></td><td>${fmtBE(r.base)}</td><td>${mods}</td><td><b>${fmtBE(r.total)}</b></td></tr>`;
    }).join('') + off.map((p) => `<tr class="off"><td><img src="${pawnIcon(p.size, 'us')}" alt=""></td><td>${SIZE[p.size].mark} · ${SIZE[p.size].name}<small>${WEAPON[p.main]} · дальн. ${SIZE[p.size].range}</small></td><td>—</td><td><em>вне дальности — не стреляет</em></td><td>0</td></tr>`).join('');
  }
  const sideOf = (side) => (side === 'neutral' ? 'us' : side);
  function openConfirm(sq, act, side, picks) {
    const sec = W.sectors[W.view], here = sec.cells[sq.cell], w = sec.weather;
    let title = `${ACTION[act]} · ${sq.tag}`, calc, extra = '', off = [], close = false;
    const cond = [WEATHER[w].name], tgt = picks.length ? sec.cells[picks[picks.length - 1]] : here;
    if (picks.length) title += ` → ${picks.map((i) => cellName(sec, i)).join(' + ')}`;
    if (act === 'attack') {
      const d = dist(sq.cell, tgt.i), defs = knownHostiles(tgt, sq, side);
      close = d <= 1;
      const foe = defs[0]?.side, foeFort = defs.some((u) => u.stance === 'fortify'), ctrl = sec.ctrl[sq.cell] === sideOf(side);
      cond.push(`дистанция ${d}`, close ? 'ближний бой — захват клетки' : 'огневой бой — без захвата', known(tgt) ? 'клетка разведана' : 'клетка НЕ разведана');
      const part = { ...sq, pawns: sq.pawns.filter((p) => inRange(p, d, w)) }; off = sq.pawns.filter((p) => !inRange(p, d, w));
      calc = squadBE(part, { act: 'attack', scouted: known(tgt), close, weather: w, ctrl, foe, foeFort });
      if (known(tgt)) {
        const D = defs.reduce((s, u) => s + squadBE({ ...u, pawns: u.pawns.filter((p) => inRange(p, d, w)) }, { act: 'defend', close, building: tgt.building, weather: w, ctrl: sec.ctrl[tgt.i] === ctrlSide(u), foe: 'us' }).total, 0);
        extra = `ПРОТИВНИК: ${defs.length ? `${defs.map((u) => FACTION[u.side]).join(', ')} · ${defs.reduce((s, u) => s + u.pawns.length, 0)} пешек · ответный огонь ≈ ${fmtBE(D)} БЕ` : 'нет — клетка займётся без боя'}`;
      } else extra = 'ПРОТИВНИК: НЕИЗВЕСТНО';
      extra += '<br><span class="rw-small">Исход: сумма БЕ пешек в дальности против суммы ответного огня, разброс ±15%.</span>';
    } else if (act === 'scout') {
      calc = squadBE(sq, { act: 'scout', weather: w });
      extra = `СКРЫТНОСТЬ: ${fmtBE(stealthOf(sq, calc))} = средняя БЕ разведки × 3 − 1,5 за каждую пешку сверх трёх.<br><span class="rw-small">Из отряда выходит разведчик и возвращается. Если бдительность врага выше — его заметят. В зачёт заказчику — только за его сторону.</span>`;
    } else {
      const fort = act === 'fortify', retreating = act === 'retreat';
      cond.push(tgt.building ? `${BUILDING[tgt.building].name.toLowerCase()} в клетке` : 'открытая местность');
      calc = squadBE(sq, { act: 'defend', close: true, building: tgt.building, fortified: fort, retreating, weather: w, ctrl: sec.ctrl[tgt.i] === sideOf(side) });
      extra = `ОБОРОНА ОТРЯДА (впритык): ${fmtBE(calc.total)} БЕ${act === 'wait' ? ' — оборона не развёрнута' : ''}${fort ? `<br><span class="rw-small">Закрепившись, отряд контролирует клетки вокруг (радиус ${tgt.building ? BUILDING[tgt.building].ctrl : 1}) — там +1 БЕ его пешкам.</span>` : ''}`;
    }
    const b = openModal('confirm', `<h3>${esc(title)}</h3>
      <p class="rw-small">${ACTION_TEXT[act]}</p>
      <div class="rw-sides">${Object.entries(SIDE).map(([k, v]) => `<button data-s="${k}" class="${side === k ? 'on' : ''} s-${k}">${v.full}</button>`).join('')}</div>
      <p class="rw-small">${SIDE[side].text}</p>
      <p>УСЛОВИЯ: ${cond.join(' · ')}</p>
      <div class="rw-table"><table><tr><th></th><th>ПЕШКА</th><th>БАЗА</th><th>БАФЫ И ДЕБАФЫ</th><th>ИТОГ</th></tr>${rowsHTML(calc.rows, off, close)}</table></div>
      <p class="rw-sum">ОТРЯД: <b>${fmtBE(calc.total)} БЕ</b></p><p>${extra}</p>
      <div class="rw-btns"><button data-ok>ПОДТВЕРДИТЬ</button><button data-no>ОТМЕНА</button></div>`);
    b.querySelectorAll('[data-s]').forEach((x) => tap(x, () => { sfx.click(); W.selSide = x.dataset.s; openConfirm(sq, act, x.dataset.s, picks); }));
    tap(b.querySelector('[data-ok]'), () => { sfx.confirm(); closeModal(); perform(sq, act, side, picks); });
    tap(b.querySelector('[data-no]'), () => { sfx.back(); closeModal(); refresh(); });
  }
  const stealthOf = (sq, calc) => Math.max(0, (calc.total / Math.max(1, sq.pawns.length)) * 3 - Math.max(0, sq.pawns.length - 3) * 1.5);

  // ---------- исполнение ----------
  function reveal(sec, i, r) { for (const j of within(i, r)) sec.cells[j].scouted = true; }
  const sightOf = (u) => SQUAD[u.type].sight;
  function moveUnit(sec, u, to) {
    const from = sec.cells[u.cell]; from.units = from.units.filter((x) => x !== u);
    sec.cells[to].units.push(u); u.cell = to;
    if (u.side === 'us') reveal(sec, to, sightOf(u));
  }
  function prune(sec) {
    for (const c of sec.cells) {
      c.units = c.units.filter((u) => u.pawns.length);
      if (c.owner === 'us' && !c.units.some((u) => u.side === 'us')) c.owner = null;
    }
  }
  function perform(sq, act, side, picks) {
    const sec = W.sectors[sq.sec], cr = sec.idx === W.view ? W.crowd : null;
    sq.ally = side; sq.cd = act === 'scout' ? 8 : 12;
    const say = (t) => toast(`${sq.tag}: ${t}`);
    bark(sq, act === 'attack' && !known(sec.cells[picks[0]]) && sq.type !== 'recon' ? 'blind' : act);
    if (act === 'fortify') { sq.stance = 'fortify'; cr?.order(sq, 'fortify', { dir: threatDir(sec, sq) }); storm.lock(); say('окапываются.'); }
    else if (act === 'wait') { sq.stance = 'wait'; cr?.order(sq, 'wait'); say('ожидают.'); }
    else if (act === 'retreat') {
      const from = sq.cell; sq.stance = 'wait'; sq.retreatT = 20; cr?.order(sq, 'retreat', { from }); moveUnit(sec, sq, picks[0]); snd.fall();
      say(`отходят на ${cellName(sec, picks[0])}.`); setTimeout(() => { if (W.crowd === cr && cr) cr.order(sq, 'wait'); }, 6000);
    }
    else if (act === 'move') { sq.stance = 'wait'; cr?.order(sq, 'wait'); sq.cd = 6 * dist(sq.cell, picks[0]); moveUnit(sec, sq, picks[0]); say(`перемещаются на ${cellName(sec, picks[0])}.`); }
    else if (act === 'scout') { cr?.scoutWalk(sq, picks[0]); setTimeout(() => { if (!W.over) { scout(sec, sq, picks); refresh(); } }, cr ? 1800 : 0); }
    else if (act === 'attack') {
      sq.stance = 'wait';
      const tc = sec.cells[picks[0]], was = known(tc);
      cr?.order(sq, 'attack', { dir: cr.dirTo(sq.cell, tc.i) }); cr?.sync();
      setTimeout(() => {
        if (W.over || !sq.pawns.length) return;
        tc.scouted = true;
        const res = fight(sec, [sq], picks[0], { scouted: was });
        contractsOnFight(sec, sq, picks[0], res);
        showResult(sq, sec, picks[0], res);
        refresh();
      }, cr ? 1100 : 0);
    }
    W.sel = sq.pawns.length ? sq : null;
    control(sec); checkContracts(); refresh();
  }
  function threatDir(sec, u) {
    const foe = sec.cells.filter((c) => known(c) && c.units.some((x) => hostile(u, x))).sort((a, b) => dist(u.cell, a.i) - dist(u.cell, b.i))[0];
    return foe && W.crowd ? W.crowd.dirTo(u.cell, foe.i) : [0, 1];
  }
  function scout(sec, sq, cells) {
    if (!sq.pawns.length) return;
    const calc = squadBE(sq, { act: 'scout', weather: sec.weather }), stealth = stealthOf(sq, calc);
    let spotted = null;
    for (const i of cells) {
      const c = sec.cells[i]; c.scouted = true;
      const vig = c.units.filter((u) => hostile(sq, u)).reduce((s, u) => s + u.pawns.reduce((a, p) => a + SIZE[p.size].be, 0), 0) * 0.22;
      if (vig > stealth && !spotted) spotted = { i, vig };
      for (const k of W.contracts) if (k.type === 'scout' && k.sec === sec.idx && k.cells.includes(i) && sq.ally === k.side) k.done.add(i);
    }
    storm.lock();
    if (spotted) {
      // заметили разведчика: он и погибает
      const walker = sq.pawns.find((p) => p.size === 'L') || sq.pawns[0];
      sq.pawns = sq.pawns.filter((p) => p !== walker); W.lost++;
      sec.cells[sq.cell].corpses.push({ id: ++bid, side: 'us', size: walker.size });
      if (sec.idx === W.view) { snd.shot('smg'); bark(sq, 'hit', true); }
      prune(sec);
      toast(`${sq.tag}: разведчика засекли у ${cellName(sec, spotted.i)} (бдительность ${fmtBE(spotted.vig)} > скрытность ${fmtBE(stealth)}). Погиб.`, 'warn');
    } else toast(`${sq.tag}: разведка ${cells.map((i) => cellName(sec, i)).join(', ')} — не замечены.`);
    control(sec); checkContracts();
  }

  // бой: атакующие против враждебных им отрядов в клетке to; бьют только пешки в дальности
  function fight(sec, att, to, o = {}) {
    const tc = sec.cells[to], lead = att[0], w = sec.weather;
    const d = o.d ?? Math.max(1, Math.min(...att.map((u) => dist(u.cell, to)))), close = d <= 1;
    const defs = tc.units.filter((u) => !att.includes(u) && att.some((a) => hostile(a, u)));
    const inR = (u) => u.pawns.filter((p) => inRange(p, d, w));
    const attIds = att.flatMap((u) => inR(u).map((p) => p.id)), defIds = defs.flatMap((u) => inR(u).map((p) => p.id));
    const foeFort = defs.some((u) => u.stance === 'fortify');
    const Ab = att.map((u) => squadBE({ ...u, pawns: inR(u) }, { act: 'attack', scouted: u.side === 'us' ? o.scouted ?? true : true, close, weather: w, ctrl: sec.ctrl[u.cell] === ctrlSide(u), foe: defs[0]?.side, foeFort }));
    const Db = defs.map((u) => squadBE({ ...u, pawns: inR(u) }, { act: 'defend', close, building: tc.building, weather: w, ctrl: sec.ctrl[to] === ctrlSide(u), foe: lead.side }));
    const A = Ab.reduce((s, x) => s + x.total, 0), D = Db.reduce((s, x) => s + x.total, 0);
    const r = resolve(A, D);
    // потери: у атакующих — среди стрелявших; у защитников — среди всех
    const kill = (list, frac, one) => {
      let n = Math.round(list.length * frac); if (one && list.length) n = Math.max(1, n);
      const dead = [];
      for (let k = 0; k < n && list.length; k++) { const [u, p] = list.splice(Math.floor(Math.random() * list.length), 1)[0]; u.pawns = u.pawns.filter((x) => x !== p); dead.push([u, p]); }
      return dead;
    };
    const aPool = att.flatMap((u) => inR(u).map((p) => [u, p])), dPool = defs.flatMap((u) => u.pawns.map((p) => [u, p]));
    const aDead = r.win ? kill(aPool, D ? r.winnerLoss : 0, false) : kill(aPool, r.loserLoss, true);
    const dDead = r.win ? kill(dPool, r.loserLoss, true) : kill(dPool, r.winnerLoss, false);
    // тела остаются на месте гибели
    for (const [u, p] of aDead) sec.cells[u.cell].corpses.push({ id: ++bid, side: u.side, size: p.size });
    for (const [u, p] of dDead) tc.corpses.push({ id: ++bid, side: u.side, size: p.size });
    const ownerBefore = tc.owner;
    if (r.win && close) {
      for (const u of defs) {
        if (!u.pawns.length) continue;
        const out = nbrs(to).find((n) => !sec.cells[n].units.length && (sec.cells[n].owner === u.side || u.side === 'us' || u.side === 'fauna'));
        if (out != null) moveUnit(sec, u, out);
        else { for (const p of u.pawns) { tc.corpses.push({ id: ++bid, side: u.side, size: p.size }); dDead.push([u, p]); } u.pawns = []; }
      }
      const mover = att.find((u) => u.pawns.length && u.cell !== to && !tc.units.some((x) => x.side === u.side && x !== u));
      if (mover) moveUnit(sec, mover, to);
      if (att.some((u) => u.pawns.length) && lead.side !== 'fauna') {
        if (lead.side !== 'us') tc.owner = lead.side;
        else if (lead.ally !== 'neutral') tc.owner = lead.ally;
        else if (!tc.owner || tc.owner === 'unk') tc.owner = 'us';
      }
    }
    W.lost += aDead.filter(([u]) => u.side === 'us').length + dDead.filter(([u]) => u.side === 'us').length;
    const deadIds = [...aDead, ...dDead].map(([, p]) => p.id);
    // строй и реплики
    const cr = sec.idx === W.view ? W.crowd : null;
    if (cr) {
      for (const u of defs) if (u.stance !== 'fortify') cr.order(u, 'arc', { dir: cr.dirTo(to, lead.cell === to ? to : lead.cell) });
      for (const u of att) if (cr.state(u).mode !== 'attack') cr.order(u, 'attack', { dir: cr.dirTo(u.cell, to) });
      cr.fight(attIds, defIds, deadIds, to, close);
      setTimeout(() => { if (W.crowd === cr) for (const u of [...att, ...defs]) if (u.pawns.length) cr.order(u, u.stance === 'fortify' ? 'fortify' : 'wait'); }, 5000);
    }
    for (const u of defs) if (u.side === 'us') bark(u, lead.side === 'fauna' ? 'fauna' : 'hit', dDead.some(([x]) => x === u) && Math.random() < 0.6);
    for (const u of att) if (u.side === 'us') { const dd = aDead.some(([x]) => x === u); setTimeout(() => bark(u, r.win ? 'win' : 'lose', dd && Math.random() < 0.6), 2700); }
    prune(sec); control(sec);
    return { r, A, D, aDead: aDead.map(([, p]) => p), dDead: dDead.map(([, p]) => p), defs, ownerBefore, owner: tc.owner, close, d };
  }
  function showResult(sq, sec, to, res) {
    const { r, A, D, aDead, dDead, defs } = res;
    const names = (arr) => arr.length ? arr.map((p) => SIZE[p.size].mark).join(', ') : 'нет';
    setTimeout(() => {
      if (W.over) return;
      if (W.modal || W.view !== sec.idx) { toast(`${sq.tag}: ${r.win ? 'победа' : 'поражение'} у ${cellName(sec, to)}`, r.win ? 'ok' : 'warn'); return; }
      const b = openModal('result', `<h3 class="${r.win ? 'win' : 'lose'}">${r.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'} · ${cellName(sec, to)} · ${res.close ? 'ближний бой' : `огонь на ${res.d}`}</h3>
        <p>${sq.tag}: ${fmtBE(A)} БЕ × разброс = ${fmtBE(r.a)} · ПРОТИВНИК: ${fmtBE(D)} × разброс = ${fmtBE(r.d)}</p>
        <p>ПРОТИВНИКОВ: ${defs.length ? defs.map((u) => `${FACTION[u.side]} ${SQUAD[u.type].name}`).join(', ') : 'не было'}</p>
        <p>НАШИ ПОТЕРИ: ${names(aDead)} · ПОТЕРИ ПРОТИВНИКА: ${names(dDead)}</p>
        <p>КЛЕТКА: ${FACTION[res.owner] || 'НИЧЬЯ'}${res.ownerBefore !== res.owner ? ` (была ${FACTION[res.ownerBefore] || 'ничья'})` : ''}${!res.close ? ' · огневой бой клетку не берёт' : ''}</p>
        <div class="rw-btns"><button data-ok>ПОНЯТНО</button></div>`);
      r.win ? storm.captured() : storm.alarm();
      tap(b.querySelector('[data-ok]'), () => { sfx.click(); closeModal(); refresh(); });
    }, sec.idx === W.view ? 2800 : 0);
  }

  // ---------- техника, тела, клоны ----------
  function vehicleAction(v, a) {
    if (v.cd > 0) { sfx.denied(); return; }
    const sec = W.sectors[v.sec];
    sfx.click();
    if (a === 'move') {
      W.pick = { v, act: 'vmove', picks: [], need: 1, done: (P) => { const to = P.picks[0]; v.cd = 2 * dist(v.cell, to); v.cell = to; reveal(sec, to, v.kind === 'shuttle' ? 2 : 1); if (v.cargo) v.cargo.cell = to; control(sec); refresh(); } };
      refresh(); return;
    }
    if (a === 'drop') {
      W.pick = { v, act: 'drop', picks: [], need: 1, done: (P) => {
        const u = v.cargo, to = P.picks[0]; v.cargo = null; u.inside = null; u.cell = to; u.cd = 4; u.dropping = v.kind === 'shuttle';
        sec.cells[to].units.push(u); reveal(sec, to, sightOf(u)); snd.drop(); bark(u, 'drop'); W.sel = u; W.selV = null; control(sec); refresh();
      } };
      if (!sec.cells.some((c) => validPick(c.i))) { W.pick = null; sfx.denied(); toast('Некуда высадить.', 'warn'); }
      refresh(); return;
    }
    if (a === 'collect') {
      let got = 0;
      for (const j of within(v.cell, 1)) {
        const c = sec.cells[j];
        while (c.corpses.length && got < VEHICLE.truck.cap) { c.corpses.pop(); got++; }
      }
      if (!got) { toast('Рядом нет тел.', 'warn'); return; }
      // тела сразу уходят в переработку: 2 тела → 1 клон через 3 минуты
      W.bio.push({ n: got, t: CLONE_TIME }); v.cd = 6;
      toast(`${VEHICLE.truck.name}-${v.id}: собрано ${got} тел. Клоны будут через ${fmtT(CLONE_TIME)}.`, 'ok');
      const near = within(v.cell, 1).flatMap((j) => sec.cells[j].units).find((u) => u.side === 'us'); if (near) bark(near, 'collect');
      refresh();
    }
  }
  function board(u, v) {
    const sec = W.sectors[u.sec];
    bark(u, 'board');
    sec.cells[u.cell].units = sec.cells[u.cell].units.filter((x) => x !== u);
    v.cargo = u; u.inside = v; u.cell = v.cell;
    toast(`${u.tag} в ${VEHICLE[v.kind].name.toLowerCase()}.`); W.sel = null; W.selV = v; control(sec); refresh();
  }
  function cloneInto(u) {
    const s = missing(u); if (!s || W.clones <= 0) return;
    W.clones--; u.pawns.push(newPawn(s)); storm.captured();
    toast(`${u.tag}: клон ${SIZE[s].name.toLowerCase()} в строю. Осталось клонов: ${W.clones}.`, 'ok'); refresh();
  }

  // ---------- контроль территорий ----------
  function control(sec) {
    const ct = sec.ctrl.fill(null), seen = sec.ctrlSeen.fill(false), cont = new Set();
    for (const c of sec.cells) for (const u of c.units) {
      if (u.side === 'fauna') continue;
      const r = Math.max(c.building ? BUILDING[c.building].ctrl : 0, u.stance === 'fortify' ? 1 : 0);
      if (!r) continue;
      const side = ctrlSide(u), vis = known(c);
      for (const j of within(c.i, r)) {
        if (ct[j] && ct[j] !== side) cont.add(j);
        ct[j] = side; if (vis) seen[j] = true;
      }
    }
    for (const j of cont) ct[j] = null;
  }

  // ---------- пауза: справочник ----------
  const TABS = { goal: 'ЦЕЛЬ', units: 'ЮНИТЫ', squads: 'ОТРЯДЫ', actions: 'ДЕЙСТВИЯ', sides: 'СТОРОНЫ', mods: 'МОДИФИКАТОРЫ', map: 'КАРТА', tech: 'ТЕХНИКА', fauna: 'ФАУНА', weather: 'ПОГОДА' };
  const li = (a) => `<ul class="rw-list">${a.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  function handbook(tab) {
    if (tab === 'goal') return li([
      'Мы — третья сторона. Исполняем запросы НТ и СНК своими рейдерами, но держим их влияние в равновесии.',
      'Весь пролог — 30 минут. В конце равновесие должно быть в зелёной зоне (перекос до 25%).',
      `Перекос больше 50% дольше ${RED_TIME} с — провал сразу.`,
      'Влияние стороны = её клетки (вышка и блок-пост +1, шахта +2) × сила стороны.',
      'Запросы: разведка, захват, подкрепление, проход колонны, зачистка — на любой из 4 точек. Отказ −12 силы заказчика, успех +10, провал −6.',
      `Резерв — ${RESERVE} отрядов, ${TRUCKS} труповозки, ${SHUTTLES} шаттла. Высаженное не вернуть.`,
      'В окне подтверждения и в паузе время стоит.']);
    if (tab === 'units') return ['L', 'M', 'H'].map((k) => {
      const S = SIZE[k], T = TXT.pawns[k], w = k === 'L' ? 'снайперская винтовка, нож' : k === 'M' ? 'пистолет-пулемёт, дробовик или горелка' : 'пулемёт, кувалда';
      return `<div class="rw-hb"><img src="${pawnIcon(k)}" alt=""><div><b>${S.mark} · ${S.name} · БЕ ${fmtBE(S.be)} · ДАЛЬНОСТЬ ${S.range}</b><p>ОРУЖИЕ: ${w}</p><p>${esc(T.fight)}</p><p class="rw-small">«${esc(T.role)}» ${esc(T.roleSrc)}</p></div></div>`;
    }).join('') + '<p class="rw-small">Дальность пешки: 1 — впритык. Нажмите на пешку в секторе — снаряжение и цитаты из книги.</p>';
    if (tab === 'squads') return [
      ['assault', ['дальность отряда 3, обзор 1', 'атака +1 каждой', 'оборона −2', 'разведка −3']],
      ['hold', ['дальность отряда 1, обзор 1', 'оборона +2, в строении +3', 'атака −3', 'разведка −5']],
      ['recon', ['дальность отряда 5, обзор 3, разведка — 3 клетки', 'атака по неразведанной клетке: +5 и без −4 — внезапная атака', 'лучшая скрытность']],
    ].map(([k, m]) => `<div class="rw-hb"><div class="rw-icons">${SQUAD[k].comp.map((s) => `<img src="${pawnIcon(s)}" alt="">`).join('')}</div><div><b>${SQUAD[k].name}</b><p>${SQUAD[k].text}</p>${li(m)}</div></div>`).join('')
      + '<p class="rw-small">Дальность отряда — на ней в бой вступают все пешки. Дальше бьют только пешки с большей дальностью (на 5 клеток — только снайперы). Строй атаки: Б впереди вразнобой, С парами колонной, Л сзади вне строя.</p>';
    if (tab === 'actions') return li(Object.entries(ACTION).map(([k, v]) => `<b>${v}</b> — ${ACTION_TEXT[k]}`).concat(['<b>В ТРАНСПОРТ</b> — сесть в труповозку (рядом) или шаттл (в клетке).', '<b>КЛОН</b> — поставить в отряд пешку из клонов (по составу отряда).', 'Каждое действие подтверждается: видно каждую пешку, её бафы и дебафы и причины.', 'После действия отряд занят: разведка 8 с, остальное 12 с, перемещение 6 с за клетку.']));
    if (tab === 'sides') return li(Object.values(SIDE).map((v) => `<b>${v.full}</b> — ${v.text}`).concat(['Сторона выбирается для каждого действия.', 'Неизвестные и фауна враждебны всем.']));
    if (tab === 'mods') return li([
      '<b>База:</b> Л 5 · С 7,5 · Б 10 БЕ. Все модификаторы — на каждую пешку отдельно.',
      '<b>Атака:</b> неразведанная клетка −4 (кроме разведки) · штурмовой +1 · закрепляющий −3 · разведка по неразведанной +5.',
      '<b>Оборона:</b> штурмовой −2 · закрепляющий +2 (в строении +3) · закрепились +1 · вышка +1, пост +3, шахта +5 (закрепившимся) · отступающие −1 (20 с).',
      '<b>Контроль территории:</b> +1 каждой пешке, если бой идёт на клетке под контролем её стороны.',
      '<b>Ближний бой</b> (впритык): Л −0,25 (нож), Б — кувалда без потерь, С без изменений. Огонь издалека клетку не берёт.',
      '<b>Фауна:</b> горелка против фауны +3 · фауна в метель и туман +2 · фауна против стенок и окопов −2.',
      '<b>Разведка:</b> штурмовой −3 · закрепляющий −5. Скрытность = средняя БЕ × 3 − 1,5 за пешку сверх трёх. Бдительность врага = 22% базовой БЕ его пешек.',
      '<b>Исход:</b> сумма БЕ пешек в дальности против ответного огня, разброс ±15%. Проигравший теряет от 45%, победитель — до 30%.']);
    if (tab === 'map') return li([
      'Поле — гексы 20×20. Каждый наш отряд при перемещении открывает клетки вокруг: обычный — 1, разведка — 3.',
      'РАЗВЕДКА: отряд не двигается, проверяет 1 любую клетку (отряд разведки — 3). Из отряда выходит разведчик и возвращается.',
      'КОНТРОЛЬ: занятое строение контролирует клетки вокруг (вышка 3, блок-пост 2, шахта 1); закрепившийся отряд — 1. Подсветка видна, только если найдена эта позиция.',
      'В клетке — один отряд. Шаттл занимает воздух над клеткой, труповозка стоит рядом с отрядом.',
      'Камера: палец — двигать, два пальца — зум, поворот, наклон.']);
    if (tab === 'tech') return li([
      `<b>${VEHICLE.truck.name}</b> — ${VEHICLE.truck.text}. Ход до ${VEHICLE.truck.move}. Собирает тела в своей и соседних клетках (до ${VEHICLE.truck.cap}).`,
      `<b>${VEHICLE.shuttle.name}</b> — ${VEHICLE.shuttle.text}. Ход до ${VEHICLE.shuttle.move}, летит над противником.`,
      '<b>ТЕЛА:</b> остаются на месте гибели. Не собрать — их заберёт противник (станет сильнее) или сожрёт фауна (станет больше).',
      '<b>КЛОНЫ:</b> 2 собранных тела → 1 пешка через 3 минуты. Ставится в отряд кнопкой «КЛОН».',
      `«${esc(TXT.corpses.text)}» ${esc(TXT.corpses.src)}`]);
    if (tab === 'fauna') return ['T', 'S', 'F'].map((k) => { const S = SIZE[k], T = TXT.pawns[k]; return `<div class="rw-hb"><img src="${pawnIcon(k, 'fauna')}" alt=""><div><b>${S.name} · БЕ ${fmtBE(S.be)} · ДАЛЬНОСТЬ ${S.range}</b><p>${esc(T.fight)}</p><p class="rw-small">«${esc(T.role)}» ${esc(T.roleSrc)}</p></div></div>`; }).join('')
      + '<p class="rw-small">Стаи вылезают из трещин, идут на тела и на отряды, жрут тела и растут. Враждебны всем.</p>';
    if (tab === 'weather') return Object.values(WEATHER).map((w, i) => `<div class="rw-hb"><div><b>${w.name}</b>${li(weatherLines(WEATHER_KEYS[i]))}</div></div>`).join('') + '<p class="rw-small">Погода меняется каждые 3–6 минут.</p>';
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
    const b = openModal('card', `<h3>${SIZE[p.size].name} · ${SIZE[p.size].mark} · БЕ ${fmtBE(SIZE[p.size].be)} · ДАЛЬНОСТЬ ${SIZE[p.size].range}</h3>
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
      const g = makePawn(p, u?.side || 'us'); g.userData.pose('fire'); g.scale.setScalar(g.scale.x * 4); sc.add(g);
      const hgt = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).y;
      const cam = new THREE.PerspectiveCamera(30, cv.clientWidth / cv.clientHeight, 0.001, 20);
      cam.position.set(0, hgt * 0.7, hgt * 3.3); cam.lookAt(0, hgt * 0.45, 0);
      mini = { r, sc, cam, g };
    });
  }
  function closeMini() { if (!mini) return; mini.r.dispose(); mini.r.forceContextLoss?.(); mini = null; }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY, performance.now()]; };
  const onUp = (e) => {
    if (!down || W.view < 0 || W.modal || !W.crowd) { down = null; return; }
    const [x, y, t] = down; down = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 8 || performance.now() - t > 500 || e.target.closest('button, .pr-info, .rw-hud')) return;
    const rc = ctx.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!W.pick) {
      const vh = ray.intersectObjects(W.crowd.vehicleMeshes(), true)[0]?.object.userData.vehicleRoot;
      if (vh) { selectVehicle(vh.userData.vehicle); return; }
      const g = ray.intersectObjects(W.crowd.meshes(), true)[0]?.object.userData.pawnRoot;
      if (g) { openCard(g.userData.pawn, g.userData.squad); return; }
    }
    const hit = ray.intersectObject(W.sv.ground, false)[0];
    if (hit) tapCell(hexAt(hit.point.x, hit.point.z));
  };
  root.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp);

  // ---------- запросы и контракты ----------
  let cid = 0;
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
          const t = sec.cells.filter((c) => c.units.some((u) => u.side === 'unk' || u.side === 'fauna'));
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
  // свободная клетка для нашего отряда рядом с i
  function freeNear(sec, i, side) {
    const me = { side: 'us', ally: side }, seen = new Set([i]), q = [i];
    while (q.length) {
      const k = q.shift(), c = sec.cells[k];
      if (!c.units.length || (!c.units.some((u) => u.side === 'us') && !c.units.some((u) => hostile(me, u)))) return k;
      for (const n of nbrs(k)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    return i;
  }
  function deployModal(req) {
    const sec = W.sectors[req.sec], cnt = { assault: 0, hold: 0, recon: 0, truck: 0, shuttle: 0 }, land = landingCell(sec, req.side);
    const have = sec.cells.some((c) => c.units.some((u) => u.side === 'us'));
    const render = () => {
      const total = cnt.assault + cnt.hold + cnt.recon, all = total + cnt.truck + cnt.shuttle;
      const row = (k, name, text, icons, max) => `<div class="rw-dep"><div><b>${name}</b><span>${text}</span><div>${icons}</div></div><button data-m="${k}">−</button><em>${cnt[k]}</em><button data-p="${k}" data-max="${max}">+</button></div>`;
      const b = openModal('deploy', `<h3 class="s-${req.side}">ВЫСАДКА · ${esc(req.where)} · ЗА ${FACTION[req.side]}</h3>
        <p>МЕСТО: ${cellName(sec, land)}${sec.cells[land].base === req.side ? ` (база ${FACTION[req.side]})` : ''} · ОТРЯДОВ: ${W.reserve - total} из ${W.reserve} · ТРУПОВОЗОК ${W.trucks - cnt.truck} · ШАТТЛОВ ${W.shuttles - cnt.shuttle}</p>
        <p class="rw-small">Высаженное не вернуть. В клетке — один отряд, остальные встанут рядом.</p>
        ${['assault', 'hold', 'recon'].map((k) => row(k, SQUAD[k].name, SQUAD[k].text, SQUAD[k].comp.map((s) => `<img src="${pawnIcon(s)}" alt="">`).join(''), 'r')).join('')}
        ${row('truck', VEHICLE.truck.name, VEHICLE.truck.text, '', 't')}${row('shuttle', VEHICLE.shuttle.name, VEHICLE.shuttle.text, '', 's')}
        <div class="rw-btns"><button data-go${all ? '' : ' disabled'}>ВЫСАДИТЬ ${all || ''}</button>${have || req.type === 'transit' ? '<button data-skip>БЕЗ ВЫСАДКИ</button>' : ''}<button data-no>ОТКАЗАТЬ</button></div>`);
      b.querySelectorAll('[data-m]').forEach((x) => tap(x, () => { if (cnt[x.dataset.m] > 0) { cnt[x.dataset.m]--; sfx.click(); render(); } }));
      b.querySelectorAll('[data-p]').forEach((x) => tap(x, () => {
        const k = x.dataset.p, ok = x.dataset.max === 'r' ? total < W.reserve : x.dataset.max === 't' ? cnt.truck < W.trucks : cnt.shuttle < W.shuttles;
        if (ok) { cnt[k]++; sfx.click(); render(); } else sfx.denied();
      }));
      tap(b.querySelector('[data-go]'), () => { if (!all) return; sfx.confirm(); accept(req, cnt, land); });
      b.querySelector('[data-skip]') && tap(b.querySelector('[data-skip]'), () => { sfx.confirm(); accept(req, { assault: 0, hold: 0, recon: 0, truck: 0, shuttle: 0 }, land); });
      tap(b.querySelector('[data-no]'), () => { sfx.back(); decline(req); });
    };
    render();
  }
  function accept(req, cnt, land) {
    const sec = W.sectors[req.sec];
    W.pending = null; closeModal();
    let n = 0;
    for (const type of ['hold', 'assault', 'recon']) {
      for (let i = 0; i < cnt[type]; i++) {
        const s = newSquad(type, 'us', req.side), at = freeNear(sec, land, req.side); s.sec = sec.idx; s.cell = at; s.dropping = true; s.cd = 3;
        sec.cells[at].units.push(s); reveal(sec, at, sightOf(s)); n++;
      }
    }
    for (const kind of ['truck', 'shuttle']) for (let i = 0; i < cnt[kind]; i++) {
      const taken = (c) => sec.vehicles.some((v) => v.kind === kind && v.cell === c);
      let cell = land; if (taken(cell)) cell = within(land, 3).find((c) => !taken(c) && !sec.cells[c].units.some((u) => hostile({ side: 'us', ally: req.side }, u))) ?? land;
      sec.vehicles.push({ id: ++vid, kind, side: 'us', ally: req.side, sec: sec.idx, cell, cargo: null, cd: 2, dropping: true });
      W[kind === 'truck' ? 'trucks' : 'shuttles']--;
    }
    W.reserve -= n; W.landed += n;
    sec.cells[land].scouted = true;
    if (n || cnt.truck || cnt.shuttle) { snd.drop(); toast(`Высадка: ${n} отр.${cnt.truck ? ` + труповозок ${cnt.truck}` : ''}${cnt.shuttle ? ` + шаттлов ${cnt.shuttle}` : ''} у ${cellName(sec, land)}.`); }
    W.contracts.push(req);
    if (req.type === 'transit') {
      const cv = newSquad('assault', req.side, req.side); cv.sec = sec.idx; cv.cell = BASE[req.side]; cv.convoy = true;
      sec.cells[BASE[req.side]].units.push(cv); req.convoy = cv; req.step = 0; req.stepT = 8;
    }
    ctx.say(`Актив: принято. ${TXT.task[req.type]} ${req.where}.`);
    control(sec); refresh();
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
      const sec = W.sectors[k.sec], c = sec.cells[k.cells[0]];
      if (k.type === 'scout' && k.cells.every((i) => k.done.has(i))) finishContract(k, true);
      else if (k.type === 'capture' && k.captured) finishContract(k, true);
      else if (k.type === 'clear' && known(c) && !c.units.some((u) => u.side === 'unk' || u.side === 'fauna') && k.touched) finishContract(k, true);
    }
  }
  function contractsTick(dt) {
    for (const k of [...W.contracts]) {
      const sec = W.sectors[k.sec];
      k.left -= dt;
      if (k.type === 'clear' && within(k.cells[0], 1).some((i) => sec.cells[i].units.some((u) => u.side === 'us'))) k.touched = true;
      if (k.type === 'transit') {
        const cv = k.convoy;
        if (!cv.pawns.length) { finishContract(k, false); continue; }
        k.stepT -= dt;
        if (k.stepT <= 0) {
          k.stepT = 8;
          const next = k.cells[k.step], nc = sec.cells[next];
          const escorts = within(next, 1).flatMap((i) => sec.cells[i].units.filter((u) => u.side === 'us' && u.ally === k.side));
          if (nc.units.some((u) => hostile(cv, u))) {
            const res = fight(sec, [cv, ...escorts], next, { d: 1 });
            if (!res.r.win) toast(`Колонна ${FACTION[k.side]} остановлена у ${cellName(sec, next)}.`, 'warn');
          } else if (!nc.units.some((u) => u.side === cv.side)) { moveUnit(sec, cv, next); if (!nc.units.some((u) => u.side !== k.side && u.side !== 'us')) nc.owner = k.side; }
          if (cv.cell === next) k.step++;
          if (k.step >= k.cells.length) { finishContract(k, true); cv.convoy = false; }
          refresh();
        }
      }
      if (k.type === 'reinforce' && k.left <= 0) {
        const c = sec.cells[k.cells[0]], foeSide = nbrs(c.i).map((n) => sec.cells[n].owner).find((o) => o === OTHER[k.side] || o === 'unk') || OTHER[k.side];
        const helped = within(c.i, 1).some((i) => sec.cells[i].units.some((u) => u.side === 'us' && u.ally === k.side && u.stance === 'fortify'));
        const src = nbrs(c.i).find((n) => !sec.cells[n].units.length) ?? nbrs(c.i)[0];
        const s = newSquad('assault', foeSide, foeSide); s.sec = sec.idx; s.cell = src; sec.cells[src].units.push(s);
        const res = fight(sec, [s], c.i, { d: 1 });
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

  // ---------- ИИ фракций и фауны ----------
  function aiTick(sec) {
    // стычки внутри клетки
    for (const c of sec.cells) {
      const u = c.units.find((a) => c.units.some((b) => hostile(a, b)));
      if (u && u.side !== 'us') fight(sec, [u], c.i, { d: 1 });
    }
    // тела: противник забирает (сильнее), фауна жрёт (растёт); у нашей труповозки не трогают
    for (const c of sec.cells) for (const u of c.units) {
      if (u.side === 'us') continue;
      for (const j of within(c.i, 1)) {
        const cc = sec.cells[j]; if (!cc.corpses.length || sec.vehicles.some((v) => v.kind === 'truck' && v.cell === j)) continue;
        const n = Math.min(cc.corpses.length, 2); cc.corpses.splice(0, n);
        if (u.side === 'fauna') { if (u.pawns.length < 8) u.pawns.push(newPawn('T')); }
        else if (W.strength[u.side] != null) W.strength[u.side] = Math.min(180, W.strength[u.side] + n * 0.5);
      }
    }
    // фауна: бьёт впритык, идёт на тела и добычу
    for (const c of sec.cells) for (const u of c.units.filter((x) => x.side === 'fauna')) {
      if (u.moved === W.t) continue;
      const prey = nbrs(c.i).find((n) => sec.cells[n].units.some((x) => hostile(u, x)));
      if (prey != null && Math.random() < 0.6) {
        const res = fight(sec, [u], prey, { d: 1 });
        if (res.defs.some((x) => x.side === 'us') && sec.idx !== W.view) toast(`СЕКТОР ${sec.letter}: фауна напала на наших у ${cellName(sec, prey)}.`, 'warn');
        continue;
      }
      const goal = sec.cells.filter((x) => (x.corpses.length || x.units.some((y) => y.side !== 'fauna')) && dist(x.i, c.i) <= 5).sort((a, b) => dist(a.i, c.i) - dist(b.i, c.i))[0];
      if (!goal) continue;
      const step = nbrs(c.i).filter((n) => !sec.cells[n].units.length).sort((a, b) => dist(a, goal.i) - dist(b, goal.i))[0];
      if (step != null) { moveUnit(sec, u, step); u.moved = W.t; }
    }
    for (const f of shuffle(['nt', 'snk', 'unk'])) {
      const p = f === 'unk' ? 0.55 : 0.42 * W.strength[f] / 100;
      if (Math.random() > p) continue;
      const me = { side: f, ally: f }, opts = [];
      for (const c of sec.cells) {
        const sq = c.units.find((u) => u.side === f && !u.convoy);
        if (!sq) continue;
        for (const n of nbrs(c.i)) {
          const tc = sec.cells[n];
          if (tc.units.some((u) => u.side === f)) continue;
          const defs = tc.units.filter((u) => hostile(me, u));
          const ownerHostile = tc.owner && tc.owner !== f && (tc.owner === 'us' ? f === 'unk' : hostile(me, { side: tc.owner, ally: tc.owner }));
          if (!defs.length && !ownerHostile) continue;
          const A = squadBE(sq, { act: 'attack', scouted: true, close: true, weather: sec.weather }).total;
          const D = defs.reduce((s, u) => s + squadBE(u, { act: 'defend', close: true, building: tc.building, weather: sec.weather }).total, 0);
          if (A < D * 0.8) continue;
          opts.push({ sq, to: n, score: A - D + Math.random() * 15 });
        }
      }
      if (!opts.length) continue;
      const o = opts.sort((a, b) => b.score - a.score)[0];
      const involved = sec.cells[o.to].units.some((u) => u.side === 'us');
      const res = fight(sec, [o.sq], o.to, { d: 1 });
      if (involved || (res.r.win && res.ownerBefore !== res.owner)) toast(`СЕКТОР ${sec.letter}: ${FACTION[f]} ${res.r.win ? 'взяли' : 'не взяли'} ${cellName(sec, o.to)}${involved ? ' — там были наши' : ''}.`, involved ? 'warn' : '');
    }
    control(sec);
  }
  function spawnTick(sec, dt) {
    for (const f of ['nt', 'snk', 'unk', 'fauna']) {
      sec.spawn[f] -= dt * (f === 'unk' || f === 'fauna' ? 1 : W.strength[f] / 100);
      if (sec.spawn[f] > 0) continue;
      sec.spawn[f] = f === 'fauna' ? 120 + Math.random() * 80 : 80 + Math.random() * 40;
      const count = sec.cells.reduce((a, c) => a + c.units.filter((u) => u.side === f).length, 0);
      if (count >= (f === 'fauna' ? (sec.kind === 'unk' ? 8 : 4) : 30)) continue;
      const own = f === 'fauna' ? sec.cells.filter((c) => !c.units.length && !c.owner)
        : sec.cells.filter((c) => c.owner === f && !c.units.length && (f === 'unk' || dist(c.i, BASE[f]) < 5));
      if (!own.length) continue;
      const at = pick(own).i;
      const s = newSquad(f === 'fauna' ? pick(FAUNA_TYPES) : pick(['assault', 'hold', 'assault', 'recon']), f, f); s.sec = sec.idx; s.cell = at;
      if (sec.cells[at].building && f !== 'fauna') s.stance = 'fortify';
      sec.cells[at].units.push(s);
      if (f === 'fauna' && sec.idx === W.view && known(sec.cells[at])) toast(`СЕКТОР ${sec.letter}: из трещин у ${cellName(sec, at)} лезет ${SQUAD[s.type].name.toLowerCase()}.`, 'warn');
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
    if (mini) { mini.g.rotation.y += realDt * 0.9; mini.r.render(mini.sc, mini.cam); }
    if (W.sv) {
      const sec = W.sectors[W.view];
      W.sv.update(realDt, W.t, sec.weather === 'blizzard' ? 3 : 1.2);
      W.crowd.update(realDt, W.t);
      placeChips(); barksFrame(realDt);
    }
    if (W.pending && W.modal === 'req') {
      W.pending.decide -= realDt;
      const tm = box.querySelector('.rw-timer'); if (tm) tm.style.width = `${Math.max(0, W.pending.decide / 25) * 100}%`;
      if (W.pending.decide <= 0) decline(W.pending);
    }
    if (!dt) return;
    W.t += dt; secT += dt;
    for (const s of W.sectors) {
      s.cells.forEach((c) => c.units.forEach((u) => { if (u.cd > 0) u.cd -= dt; if (u.retreatT > 0) u.retreatT -= dt; }));
      s.vehicles.forEach((v) => { if (v.cd > 0) v.cd -= dt; });
      s.aiT -= dt; if (s.aiT <= 0) { s.aiT = 30 + Math.random() * 25; aiTick(s); if (s.idx === W.view) refresh(); }
      spawnTick(s, dt);
      s.weatherT -= dt;
      if (s.weatherT <= 0) { s.weatherT = 200 + Math.random() * 160; s.weather = pick(WEATHER_KEYS.filter((k) => k !== s.weather)); toast(`СЕКТОР ${s.letter}: погода — ${WEATHER[s.weather].name}.`); }
    }
    // переработка тел в клоны
    for (const b of [...W.bio]) {
      b.t -= dt;
      if (b.t <= 0) { W.bio.splice(W.bio.indexOf(b), 1); const n = b.n + W.bioCarry; W.clones += Math.floor(n / 2); W.bioCarry = n % 2; if (n >= 2) { toast(`Клоны готовы: +${Math.floor(n / 2)}. Всего: ${W.clones}.`, 'ok'); storm.captured(); } }
    }
    contractsTick(dt);
    if (W.sv && Math.random() < dt * 0.08) {
      const idle = W.sectors[W.view].cells.flatMap((c) => c.units).filter((u) => u.side === 'us');
      const u = pick(idle); if (u) bark(u, u.stance === 'fortify' ? 'fortify' : 'wait');
    }
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
      if (u) u.textContent = `РЕЗЕРВ ${W.reserve} · КЛОНЫ ${W.clones} · СИЛА НТ ${Math.round(W.strength.nt)} · СНК ${Math.round(W.strength.snk)}${bad ? ` · ПЕРЕКОС! ${Math.ceil(RED_TIME - W.danger)} С` : ''}`;
      if (W.view < 0) refresh();
      else { W.crowd.sync(); paintSector(); jobsList(); if (!W.pick && !W.modal) { if (W.sel && W.sel.pawns.length && !W.sel.inside) squadInfo(W.sel); else if (W.selV) vehicleInfo(W.selV); } }
    }
  }

  overview();
  ctx.say('Актив на связи. 25 отрядов в резерве. Ждите запросов.');
  return {
    update,
    get paused() { return !!W.modal && W.modal !== 'req'; },
    result() { return Math.abs(W.bal) <= GREEN ? [true, 'РАВНОВЕСИЕ СОХРАНЕНО. АКТИВ ОТОЗВАН.'] : [false, W.bal > 0 ? 'ПЕРЕВЕС НАНОТРЕЙЗЕН. КОНТРАКТ СОРВАН.' : 'ПЕРЕВЕС СНК. КОНТРАКТ СОРВАН.']; },
    dispose() { W.over = true; closeMini(); closeSector(); root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointerup', onUp); hud.remove(); },
    debug: W,
    debugFocus(i, d = 3) { const [x, z] = cellXZ(i); ctx.setOrbit({ target: new THREE.Vector3(x, 0, z), dist: d, pitch: 0.55 }); },
    debugTap(i) { tapCell(i); },
    debugValid() { return W.pick && W.view >= 0 ? W.sectors[W.view].cells.filter((c) => validPick(c.i)).map((c) => c.i) : []; },
    debugRequest() { const r = makeRequest(); if (r) arrive(r); return !!r; },
    debugCard() { const g = W.crowd?.meshes().find((x) => x.userData.squad?.side === 'us') || W.crowd?.meshes()[0]; if (g) openCard(g.userData.pawn, g.userData.squad); },
  };
}
