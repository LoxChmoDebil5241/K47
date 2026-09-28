import { storm, sfx } from '../audio.js';

// Глава 1 «Вторжение» — посадка челнока в бурю.
// Вид из кабины: прицел ведётся джойстиком (справа снизу) к сигналу на земле.
// Прицел на сигнале — шкала ЗАХВАТ растёт; полная — дёрнуть рычаг ЗАХВАТ. Нужно 3 захвата за 2 минуты.
// ФОРСАЖ: быстрее снижение, уклонение от угроз, но сбивает захват и усиливает тряску.
// Угрозы приходят с одной стороны: увести прицел в противоположную и дать форсаж, пока идёт отсчёт.
const DURATION = 120, NEED = 3, LOCK_TIME = 2.6;
const THREATS = {
  gust:   { name: 'ПОРЫВ ВЕТРА', time: 4, hull: 7, fuel: 0, lock: 0.7, shake: 1.2 },
  ice:    { name: 'СКОПЛЕНИЕ ЛЬДА', time: 3, hull: 32, fuel: 0, lock: 0.3, shake: 1.6 },
  bubble: { name: 'ТЕРМАЛЬНЫЙ ПУЗЫРЬ', time: 3.5, hull: 11, fuel: 7, lock: 0.3, shake: 0.8 },
};
const SIDES = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
// переговоры с шахтой «Горн-12» (по тексту главы) — по времени
const RADIO = [
  [4, 'ГОРН-12', '«Невидимый», вы вызывали? Вас не видно на радаре.'],
  [9, 'МАРКУС', 'Аварийная посадка! Отказ гравитации!'],
  [15, 'ГОРН-12', 'Подтвердите аварию. Сколько на борту?'],
  [21, 'МАРКУС', 'Нужен бункерный отсек! У нас раненые!'],
  [30, 'ГОРН-12', 'Принято. Держите на маяк, даю посадочный сигнал.'],
  [44, 'ГОРН-12', '«Невидимый», вас сносит к югу. Выправляйте.'],
  [58, 'МАРКУС', '(в отсек) Тише. Пусть думают, что мы тонем.'],
  [72, 'ГОРН-12', 'Буря усиливается. Видимость — ноль.'],
  [86, 'МАРКУС', 'Горн, мы теряем высоту! Откройте ворота!'],
  [100, 'ГОРН-12', 'Вижу вас. Готовлю ангар.'],
  [114, 'МАРКУС', 'Заходим.'],
];
// реплики экипажа на события
const CREW = {
  threat: { gust: ['ШТУРМАН', 'Порыв {side}!'], ice: ['ШТУРМАН', 'Лёд {side}! Уводи!'], bubble: ['ШТУРМАН', 'Термальный пузырь {side}!'] },
  hit: { gust: ['АЛЬБЕРТ', 'Нас швырнуло, мать его!'], ice: ['МАРВИН', 'Лёд по обшивке! Держись!'], bubble: ['ПИЛОТ', 'Обледенение. Теряем топливо.'] },
  dodge: ['ПИЛОТ', 'Ушли.'], boost: ['ПИЛОТ', 'Форсаж!'], lock: ['ПИЛОТ', 'Маяк в прицеле.'],
  cap: ['ПИЛОТ', 'Захват {n}. Держу курс.'],
  done3: [['ПИЛОТ', 'Горн-12, захват осуществил, сближаюсь.'], ['ГОРН-12', 'Принял, «Невидимый». Коридор чист, ведём вас.'], ['МАРКУС', 'Всем пристегнуться. Садимся.']], miss: ['ПИЛОТ', 'Не взял. Нужен полный захват.'],
  hull: ['МАРВИН', 'Корпус не выдержит!'], fuel: ['ПИЛОТ', 'Топливо на нуле!'],
};
const SIDE_RU = { left: 'СЛЕВА', right: 'СПРАВА', up: 'СВЕРХУ', down: 'СНИЗУ' };

const html = `
  <canvas class="ld-view"></canvas>
  <div class="ld-vignette"></div>
  <div class="ld-warn" hidden><div class="ld-arrow"></div><div class="ld-tri">!</div><b></b><i></i></div>
  <div class="ld-radio"></div>
  <div class="ld-top"><span class="ld-time">2:00</span><span class="ld-caps">ЗАХВАТЫ 0 / ${NEED}</span></div>
  <div class="ld-panel">
    <i class="ld-screw s1"></i><i class="ld-screw s2"></i><i class="ld-screw s3"></i><i class="ld-screw s4"></i>
    <div class="ld-gauges">
      ${['fuel:ТОПЛИВО', 'hull:КОРПУС', 'alt:ВЫСОТА', 'lock:ЗАХВАТ'].map((x) => { const [k, n] = x.split(':'); return `<div class="ld-g" data-g="${k}"><span>${n}</span><em></em><div>${'<b></b>'.repeat(16)}</div><u></u></div>`; }).join('')}
    </div>
    <div class="ld-levers">
      <button class="ld-lever" data-l="boost"><span class="ld-slot"><i class="ld-handle"></i></span><b>ФОРСАЖ</b></button>
      <button class="ld-lever" data-l="grab"><span class="ld-slot"><i class="ld-handle"></i></span><b>ЗАХВАТ</b></button>
    </div>
  </div>
  <div class="ld-stick"><div class="ld-base"><i class="ld-knob"></i></div><span>УПРАВЛЕНИЕ</span></div>`;

export default {
  name: 'Посадка в бурю',
  run(root, done) {
    root.classList.add('ld-root');
    root.innerHTML = html;
    const $ = (s) => root.querySelector(s);
    const cv = $('.ld-view'), g = cv.getContext('2d');
    const warnEl = $('.ld-warn'), gauges = {};
    root.querySelectorAll('.ld-g').forEach((e) => (gauges[e.dataset.g] = { segs: [...e.querySelectorAll('b')], val: e.querySelector('em'), el: e }));

    const st = {
      t: 0, fuel: 100, hull: 100, lock: 0, caps: 0, boost: 0, alt: 9400,
      aim: { x: 0, y: 0 }, beacon: { x: 0.25, y: 0.2, vx: 0, vy: 0 },
      stick: { x: 0, y: 0 }, push: { x: 0, y: 0 }, warp: 0, threat: null, nextThreat: 9, red: 0, dark: 0, shake: 0, over: false,
      flakes: Array.from({ length: 700 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() })),
      bolt: 0,
    };
    const hum = storm.start();
    const radio = $('.ld-radio');
    let lastLine = 0;
    // реплика выплывает из-за края экрана (эфир — справа, экипаж — слева) и подходит ближе к центру;
    // срочные дрожат, спокойные плывут плавно
    const URGENT = /!|Лёд|Порыв|пузырь|швырнуло|не выдержит|нуле/;
    const lanes = { left: [], right: [] };
    function say(who, text, vars = {}) {
      if (st.t - lastLine < 0.8 && who !== 'ГОРН-12' && who !== 'МАРКУС') return; // не заваливать эфир
      lastLine = st.t;
      text = text.replace('{side}', vars.side || '').replace('{n}', vars.n ?? '');
      const side = who === 'ГОРН-12' ? 'right' : 'left';
      const lane = lanes[side].findIndex((x) => !x) >= 0 ? lanes[side].findIndex((x) => !x) : lanes[side].length;
      lanes[side][lane] = true;
      const p = document.createElement('p');
      p.className = `ld-say ${side}${who === 'ГОРН-12' ? ' rx' : ''}${URGENT.test(text) ? ' urgent' : ''}`;
      p.style.top = `${16 + (lane % 4) * 13}%`;
      p.innerHTML = '<b></b><span></span>'; p.querySelector('b').textContent = who;
      radio.appendChild(p);
      if (who === 'ГОРН-12') storm.radio();
      let i = 0; const sp = p.querySelector('span');
      const tick = () => { if (i > text.length || !p.isConnected) return; if (text[i - 1]) sfx.talk(text[i - 1]); sp.textContent = text.slice(0, i++); setTimeout(tick, 32); };
      setTimeout(tick, 350);
      const life = 3500 + text.length * 60;
      setTimeout(() => p.classList.add('out'), life);
      setTimeout(() => { p.remove(); lanes[side][lane] = false; }, life + 900);
    }
    let radioI = 0;

    // ---------- джойстик ----------
    const base = $('.ld-base'), knob = $('.ld-knob');
    let sp = null;
    const stickMove = (e) => {
      const r = base.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      st.stick.x = x; st.stick.y = y;
      knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    };
    base.addEventListener('pointerdown', (e) => { sp = e.pointerId; base.setPointerCapture(sp); stickMove(e); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === sp) stickMove(e); });
    const stickUp = (e) => { if (e.pointerId !== sp) return; sp = null; st.stick.x = st.stick.y = 0; knob.style.transform = ''; };
    base.addEventListener('pointerup', stickUp); base.addEventListener('pointercancel', stickUp);

    // ---------- рычаги ----------
    const pull = (el) => { el.classList.add('down'); storm.lever(); setTimeout(() => el.classList.remove('down'), 420); };
    $('[data-l="boost"]').addEventListener('pointerdown', (e) => {
      e.preventDefault(); pull(e.currentTarget);
      if (st.fuel < 12) { storm.alarm(); say(...CREW.fuel); return; }
      st.fuel -= 12 + Math.round(Math.random()); st.boost = 1.6; st.warp = 1; st.lock *= 0.55; st.alt -= 260; storm.boost(); if (!st.threat) say(...CREW.boost);
      const T = st.threat;
      if (T && !T.dodged) {
        // уклонение: прицел в половине экрана, противоположной угрозе
        const [sx, sy] = SIDES[T.side];
        if (st.aim.x * sx + st.aim.y * sy < -0.25) { T.dodged = true; storm.dodge(); say(...CREW.dodge); }
      }
    });
    $('[data-l="grab"]').addEventListener('pointerdown', (e) => {
      e.preventDefault(); pull(e.currentTarget);
      if (st.lock >= 1) {
        st.caps++; st.lock = 0; storm.captured(); say(...CREW.cap, { n: st.caps });
        if (st.caps === NEED) CREW.done3.forEach((l, i) => setTimeout(() => !st.over && say(...l), 1800 + i * 3200));
        st.beacon.x = (Math.random() - 0.5) * 1.2; st.beacon.y = (Math.random() - 0.5) * 0.9;
      } else { storm.alarm(); say(...CREW.miss); }
    });
    const keys = {};
    const kd = (e) => { keys[e.key] = e.type === 'keydown'; if (e.type === 'keydown' && e.key === ' ') root.querySelector('[data-l="grab"]').dispatchEvent(new Event('pointerdown')); if (e.type === 'keydown' && e.key === 'Shift') root.querySelector('[data-l="boost"]').dispatchEvent(new Event('pointerdown')); };
    addEventListener('keydown', kd); addEventListener('keyup', kd);

    // ---------- угрозы ----------
    function spawnThreat() {
      const type = ['gust', 'ice', 'bubble'][Math.floor(Math.random() * 3)];
      const side = Object.keys(SIDES)[Math.floor(Math.random() * 4)];
      st.threat = { type, side, left: THREATS[type].time, dodged: false };
      warnEl.hidden = false; warnEl.className = `ld-warn side-${side}`;
      warnEl.querySelector('b').textContent = THREATS[type].name;
      storm.alarm(); say(...CREW.threat[type], { side: SIDE_RU[side].toLowerCase() });
    }
    function resolveThreat() {
      const T = st.threat, D = THREATS[T.type];
      st.threat = null; warnEl.hidden = true;
      if (T.dodged) return;
      st.hull -= D.hull; st.fuel = Math.max(0, st.fuel - D.fuel); st.lock *= D.lock;
      st.shake = D.shake; st.red = 1; say(...CREW.hit[T.type]);
      if (T.type === 'gust') { storm.gust(); const [sx, sy] = SIDES[T.side]; st.push.x = -sx * 1.8; st.push.y = -sy * 1.4; }
      if (T.type === 'ice') storm.ice();
      if (T.type === 'bubble') { storm.freeze(); st.dark = 1; }
    }

    // ---------- цикл ----------
    let last = performance.now(), raf = 0, alarmT = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.over) return;
      st.t += dt;
      // управление прицелом: джойстик/стрелки + дрожь
      const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      const jitter = 1.1 + st.boost * 1.6 + st.shake * 2;
      // плавное виляние + снос ветром
      st.aim.x += Math.sin(st.t * 1.7) * 0.12 * dt + st.push.x * dt; st.aim.y += Math.cos(st.t * 1.3) * 0.1 * dt + st.push.y * dt;
      st.aim.x += ((st.stick.x || kx) * 0.9 + (Math.random() - 0.5) * jitter) * dt;
      st.aim.y += ((st.stick.y || ky) * 0.9 + (Math.random() - 0.5) * jitter) * dt;
      st.aim.x = Math.max(-0.9, Math.min(0.9, st.aim.x)); st.aim.y = Math.max(-0.75, Math.min(0.75, st.aim.y));
      // сигнал дрейфует — ветер сносит челнок
      const b = st.beacon;
      b.vx += (Math.random() - 0.5) * 0.6 * dt; b.vy += (Math.random() - 0.5) * 0.5 * dt;
      b.vx *= 0.98; b.vy *= 0.98; b.x += b.vx * dt; b.y += b.vy * dt;
      if (Math.abs(b.x) > 0.8) b.vx = -b.vx * 0.5, b.x = Math.sign(b.x) * 0.8;
      if (Math.abs(b.y) > 0.6) b.vy = -b.vy * 0.5, b.y = Math.sign(b.y) * 0.6;
      // захват: прицел рядом с сигналом
      const d = Math.hypot(st.aim.x - b.x, st.aim.y - b.y);
      const prev = st.lock;
      if (d < 0.12) st.lock = Math.min(1, st.lock + dt / LOCK_TIME * (st.boost > 0 ? 0.3 : 1));
      else st.lock = Math.max(0, st.lock - dt * 0.25);
      if (prev < 1 && st.lock >= 1) { storm.lock(); say(...CREW.lock); }
      // форсаж, тряска, высота
      st.boost = Math.max(0, st.boost - dt);
      st.shake = Math.max(0, st.shake - dt * 0.6);
      st.push.x *= 1 - Math.min(1, dt * 1.2); st.push.y *= 1 - Math.min(1, dt * 1.2);
      st.warp = Math.max(0, st.warp - dt * 0.9);
      if (st.threat?.type === 'gust' && !st.threat.dodged) { const [sx, sy] = SIDES[st.threat.side]; st.push.x -= sx * 0.25 * dt; st.push.y -= sy * 0.2 * dt; }
      st.alt = Math.max(0, 9400 * (1 - st.t / DURATION) - (9400 - st.alt - 9400 * st.t / DURATION > 0 ? 0 : 0));
      st.alt = Math.max(0, st.alt - dt * (9400 / DURATION));
      st.red = Math.max(st.threat ? 0.5 + 0.3 * Math.sin(st.t * 10) : 0, st.red - dt * 0.8);
      st.dark = Math.max(0, st.dark - dt * 0.35);
      st.bolt = Math.max(0, st.bolt - dt * 4); if (Math.random() < dt * 0.15) st.bolt = 1;
      // угрозы
      if (!st.threat && st.t > st.nextThreat && st.t < DURATION - 4) { spawnThreat(); st.nextThreat = st.t + 9 + Math.random() * 7; }
      if (st.threat) {
        st.threat.left -= dt;
        warnEl.classList.toggle('dodged', st.threat.dodged);
        warnEl.querySelector('i').style.width = `${Math.max(0, st.threat.left / THREATS[st.threat.type].time) * 100}%`;
        if (st.threat.left <= 0) resolveThreat();
      }
      // сигнализация при низком корпусе
      alarmT -= dt; if (st.hull < 35 && alarmT <= 0) { storm.alarm(); if (alarmT > -1) say(...CREW.hull); alarmT = 6; }
      while (radioI < RADIO.length && st.t >= RADIO[radioI][0]) { const [, w, l] = RADIO[radioI++]; say(w, l); }
      hum.set(Math.min(1, st.boost + st.shake * 0.5));
      draw(dt);
      hud();
      // итог
      if (st.hull <= 0) return finish(false);
      if (st.t >= DURATION) return finish(st.caps >= NEED);
      raf = requestAnimationFrame(frame);
    }

    function hud() {
      // сегментная шкала: горящих сегментов — по значению
      const set = (k, v, txt) => { const n = Math.round(Math.max(0, Math.min(1, v)) * 16); gauges[k].segs.forEach((b, i) => b.classList.toggle('on', i < n)); gauges[k].val.textContent = txt; gauges[k].el.classList.toggle('low', v < 0.3); };
      set('fuel', st.fuel / 100, `${Math.max(0, Math.round(st.fuel))}%`);
      set('hull', st.hull / 100, `${Math.max(0, Math.round(st.hull))}%`);
      set('alt', st.alt / 9400, `${Math.round(st.alt)} М`);
      set('lock', st.lock, st.lock >= 1 ? 'ГОТОВ' : `${Math.round(st.lock * 100)}%`);
      gauges.lock.el.classList.toggle('ready', st.lock >= 1);
      const left = Math.max(0, DURATION - st.t);
      $('.ld-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      $('.ld-caps').textContent = `ЗАХВАТЫ ${st.caps} / ${NEED}`;
      root.style.setProperty('--red', st.red.toFixed(2));
      root.style.setProperty('--dark', st.dark.toFixed(2));
    }

    // облако угрозы: наползает со своей стороны по мере отсчёта
    function threatCloud(w, h) {
      const T = st.threat; if (!T || T.type === 'gust') return;
      const k = 1 - T.left / THREATS[T.type].time, [sx, sy] = SIDES[T.side];
      const cx = w / 2 + sx * w * (0.75 - k * 0.45), cy = h / 2 + sy * h * (0.75 - k * 0.45), r = Math.max(w, h) * (0.25 + k * 0.35);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      if (T.type === 'bubble') { gr.addColorStop(0, `rgba(4,6,12,${0.85 * k})`); gr.addColorStop(0.6, `rgba(10,14,24,${0.6 * k})`); gr.addColorStop(1, 'rgba(10,14,24,0)'); }
      else { gr.addColorStop(0, `rgba(210,225,240,${0.7 * k})`); gr.addColorStop(0.6, `rgba(170,190,210,${0.4 * k})`); gr.addColorStop(1, 'rgba(170,190,210,0)'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      if (T.type === 'ice') { // вкрапления — осколки льда
        g.fillStyle = `rgba(255,255,255,${0.9 * k})`;
        for (let i = 0; i < 80; i++) { const a = i * 2.39 + st.t * (i % 3 + 1), rr = r * ((i * 0.013) % 0.9); g.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2 + (i % 3), 2 + (i % 2)); }
      } else { // пузырь: мерцающая кромка
        g.strokeStyle = `rgba(120,160,220,${0.25 * k})`; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 0.55 + Math.sin(st.t * 5) * 6, 0, 7); g.stroke();
      }
    }

    function draw() {
      const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
      const sh = (4 + st.boost * 10 + st.shake * 16);
      // порыв уводит весь кадр в сторону
      const ox = (Math.random() - 0.5) * sh + st.push.x * w * 0.08, oy = (Math.random() - 0.5) * sh + st.push.y * h * 0.08;
      const tilt = st.push.x * 0.05 + Math.sin(st.t * 0.9) * 0.01;
      g.save(); g.translate(w / 2 + ox, h / 2 + oy); g.rotate(tilt); g.translate(-w / 2, -h / 2);
      const k = 1 - st.alt / 9400;
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#07090d'); sky.addColorStop(0.55, `rgb(${24 + k * 20},${28 + k * 18},${36 + k * 10})`); sky.addColorStop(1, `rgb(${50 + k * 40},${54 + k * 40},${60 + k * 30})`);
      g.fillStyle = sky; g.fillRect(-60, -60, w + 120, h + 120);
      if (st.bolt > 0) { g.fillStyle = `rgba(200,220,255,${st.bolt * 0.4})`; g.fillRect(-60, -60, w + 120, h + 120); }
      const gy = h * (0.75 - k * 0.35);
      g.fillStyle = `rgba(150,170,190,${0.2 + k * 0.4})`; g.fillRect(-60, gy, w + 120, h);
      g.strokeStyle = `rgba(40,50,60,${0.3 + k * 0.4})`; g.lineWidth = 1 + k * 2;
      for (let i = 0; i < 12; i++) { const x = ((i * 137) % w); g.beginPath(); g.moveTo(x, gy); g.lineTo(x + (i % 2 ? 1 : -1) * w * 0.3, h); g.stroke(); }
      // сигнал
      const cx = w / 2, cy = h / 2, S = Math.min(w, h) * 0.5;
      const bx = cx + st.beacon.x * S * 1.3, by = cy + st.beacon.y * S, pulse = 0.5 + 0.5 * Math.sin(st.t * 6);
      g.strokeStyle = `rgba(255,40,60,${0.4 + pulse * 0.6})`; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, 10 + pulse * 18, 0, 7); g.stroke();
      g.fillStyle = '#ff3040'; g.fillRect(bx - 4, by - 4, 8, 8);
      // буря: плотные слои облаков и позёмка поверх всего
      for (let i = 0; i < 9; i++) {
        const y = ((st.t * (60 + i * 18) * (1 + st.boost) + i * 83) % (h + 260)) - 130;
        const gr = g.createLinearGradient(0, y, 0, y + 90 + i * 12);
        gr.addColorStop(0, 'rgba(100,110,125,0)'); gr.addColorStop(0.5, `rgba(100,110,125,${0.14 + i * 0.025})`); gr.addColorStop(1, 'rgba(100,110,125,0)');
        g.fillStyle = gr; g.fillRect(-60, y, w + 120, 90 + i * 12);
      }
      g.fillStyle = `rgba(80,90,105,${0.25 + 0.1 * Math.sin(st.t * 0.7)})`; g.fillRect(-60, -60, w + 120, h + 120); // общая мгла
      threatCloud(w, h);
      // снег и ледяная крупа летят на стекло, при форсаже вытягиваются в полосы
      g.strokeStyle = 'rgba(230,235,245,.75)';
      for (const f of st.flakes) {
        f.z -= (0.6 + st.boost * 2) * 0.016; if (f.z <= 0.02) { f.z = 1; f.x = Math.random() * 2 - 1; f.y = Math.random() * 2 - 1; }
        const px = cx + (f.x / f.z) * w * 0.3 + st.push.x * 40, py = cy + (f.y / f.z) * h * 0.3;
        const len = 1 + (1 - f.z) * (3 + st.boost * 14), sz = Math.max(1, (1 - f.z) * 3);
        g.lineWidth = sz; g.beginPath(); g.moveTo(px, py); g.lineTo(px - st.push.x * len * 2 + (px - cx) * len * 0.01, py + len); g.stroke();
      }
      // квадратный индикатор захвата
      const ax = cx + st.aim.x * S * 1.3, ay = cy + st.aim.y * S, locked = st.lock >= 1, R = 30, c = 12;
      g.strokeStyle = locked ? '#40ff80' : '#ffd0d6'; g.lineWidth = 3;
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.beginPath(); g.moveTo(ax + dx * R, ay + dy * (R - c)); g.lineTo(ax + dx * R, ay + dy * R); g.lineTo(ax + dx * (R - c), ay + dy * R); g.stroke();
      }
      g.fillStyle = locked ? '#40ff80' : '#ffd0d6'; g.fillRect(ax - 2, ay - 2, 4, 4);
      // полоса заполнения захвата — под квадратом
      g.strokeStyle = 'rgba(255,208,214,.5)'; g.lineWidth = 1; g.strokeRect(ax - R, ay + R + 6, R * 2, 5);
      g.fillStyle = locked ? '#40ff80' : '#ffd040'; g.fillRect(ax - R, ay + R + 6, R * 2 * st.lock, 5);
      g.restore();
      // форсаж: искажение пространства (радиальное растяжение) и потемнение
      if (st.warp > 0.02) {
        const z = 1 + st.warp * 0.12;
        g.globalAlpha = 0.45 * st.warp; g.drawImage(cv, w / 2 - (w * z) / 2, h / 2 - (h * z) / 2, w * z, h * z);
        g.globalAlpha = 0.25 * st.warp; const z2 = 1 + st.warp * 0.25; g.drawImage(cv, w / 2 - (w * z2) / 2, h / 2 - (h * z2) / 2, w * z2, h * z2);
        g.globalAlpha = 1;
        const vg = g.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.7);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.85 * st.warp})`);
        g.fillStyle = vg; g.fillRect(0, 0, w, h);
      }
      // рама фонаря
      g.fillStyle = '#060709';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.14, 0); g.lineTo(0, h * 0.35); g.fill();
      g.beginPath(); g.moveTo(w, 0); g.lineTo(w * 0.86, 0); g.lineTo(w, h * 0.35); g.fill();
      g.fillRect(0, h * 0.86, w, h);
    }

    // победа: круглый ангар — лепестки ирисовой диафрагмы расходятся, изнутри льётся свет
    function hangar(then) {
      const t0 = performance.now(); storm.hangar();
      say('ГОРН-12', 'Сигнал бедствия… кому нужны наши разработки в этой ледяной дыре? Ворота открыты.');
      const N = 10;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 5600), e = k * k * (3 - 2 * k), w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
        const sh = 3 * (1 - k); g.save(); g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        g.fillStyle = '#0b0f15'; g.fillRect(-10, -10, w + 20, h + 20);
        const cx = w / 2, cy = h * 0.5, R = Math.min(w, h) * 0.42;
        // ледяной склон вокруг
        const ice = g.createRadialGradient(cx, cy, R, cx, cy, R * 2.2); ice.addColorStop(0, '#4a5a68'); ice.addColorStop(1, '#141a20');
        g.fillStyle = ice; g.fillRect(0, 0, w, h);
        // свет из ангара
        const open = e * R * 0.92;
        const lg = g.createRadialGradient(cx, cy, 0, cx, cy, R * (0.4 + e * 1.6));
        lg.addColorStop(0, `rgba(255,236,190,${e})`); lg.addColorStop(0.4, `rgba(255,205,130,${0.8 * e})`); lg.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = '#1a140c'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
        g.fillStyle = lg; g.beginPath(); g.arc(cx, cy, open, 0, 7); g.fill();
        // лепестки: каждый — сектор, открытие вращает и оттягивает их к краю
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2 + e * 0.9;
          g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
          g.translate(cx, cy); g.rotate(a0);
          g.beginPath(); g.moveTo(open, 0); g.lineTo(R * 1.1, -R * 0.08); g.lineTo(R * 1.1, R * 0.75); g.lineTo(open * 0.8, R * 0.62 * (1 - e * 0.3)); g.closePath();
          g.fillStyle = i % 2 ? '#4a525a' : '#3e464e'; g.fill();
          g.strokeStyle = '#1a1e22'; g.lineWidth = 3; g.stroke();
          g.fillStyle = '#c9a21a'; g.fillRect(open + 4, -4, R * 0.25, 5);
          g.restore();
        }
        // кольцо рамы с огнями
        g.strokeStyle = '#2a3036'; g.lineWidth = R * 0.12; g.beginPath(); g.arc(cx, cy, R * 1.05, 0, 7); g.stroke();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.fillStyle = (Math.floor(now / 250) + i) % 4 ? '#5a3a10' : '#ffc040'; g.beginPath(); g.arc(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05, 5, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(230,235,245,.7)';
        for (const f of st.flakes) { f.z -= 0.006; if (f.z <= 0.02) f.z = 1; g.fillRect(w / 2 + (f.x / f.z) * w * 0.3, h / 2 + (f.y / f.z) * h * 0.3, 2, 2); }
        g.restore();
        if (k < 1) requestAnimationFrame(step); else setTimeout(then, 1400);
      };
      requestAnimationFrame(step);
    }

    function finish(win) {
      if (st.over) return;
      st.over = true; cancelAnimationFrame(raf); hum.stop();
      if (win) { root.classList.add('ld-end'); return hangar(() => { say('МАРКУС', 'Заходим.'); setTimeout(() => done(true), 1200); }); }
      storm.alarm();
      warnEl.hidden = false; warnEl.className = `ld-warn end ${win ? 'win' : 'lose'}`;
      warnEl.querySelector('b').textContent = `${st.hull <= 0 ? 'КОРПУС РАЗРУШЕН' : 'ПОСАДКА НЕ ОСУЩЕСТВЛЕНА'} · ЗАХВАТОВ ${st.caps} / ${NEED}`;
      setTimeout(() => done(win), 2200);
    }

    raf = requestAnimationFrame(frame);
    return () => { st.over = true; cancelAnimationFrame(raf); hum.stop(); removeEventListener('keydown', kd); removeEventListener('keyup', kd); };
  },
};
