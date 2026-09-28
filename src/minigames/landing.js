import { storm } from '../audio.js';

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
  cap: ['ПИЛОТ', 'Захват {n}. Держу курс.'], miss: ['ПИЛОТ', 'Не взял. Нужен полный захват.'],
  hull: ['МАРВИН', 'Корпус не выдержит!'], fuel: ['ПИЛОТ', 'Топливо на нуле!'],
};
const SIDE_RU = { left: 'СЛЕВА', right: 'СПРАВА', up: 'СВЕРХУ', down: 'СНИЗУ' };

const html = `
  <canvas class="ld-view"></canvas>
  <div class="ld-vignette"></div>
  <div class="ld-warn" hidden><b></b><span></span><i></i></div>
  <div class="ld-radio"></div>
  <div class="ld-top"><span class="ld-time">2:00</span><span class="ld-caps">ЗАХВАТЫ 0 / ${NEED}</span></div>
  <div class="ld-panel">
    <div class="ld-gauges">
      <div class="ld-g" data-g="fuel"><span>ТОПЛИВО</span><div><i></i></div><em></em></div>
      <div class="ld-g" data-g="hull"><span>КОРПУС</span><div><i></i></div><em></em></div>
      <div class="ld-g" data-g="alt"><span>ВЫСОТА</span><div><i></i></div><em></em></div>
      <div class="ld-g" data-g="lock"><span>ЗАХВАТ</span><div><i></i></div><em></em></div>
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
    root.querySelectorAll('.ld-g').forEach((e) => (gauges[e.dataset.g] = { bar: e.querySelector('i'), val: e.querySelector('em'), el: e }));

    const st = {
      t: 0, fuel: 100, hull: 100, lock: 0, caps: 0, boost: 0, alt: 9400,
      aim: { x: 0, y: 0 }, beacon: { x: 0.25, y: 0.2, vx: 0, vy: 0 },
      stick: { x: 0, y: 0 }, threat: null, nextThreat: 9, red: 0, dark: 0, shake: 0, over: false,
      flakes: Array.from({ length: 260 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() })),
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
      const tick = () => { if (i > text.length || !p.isConnected) return; sp.textContent = text.slice(0, i++); setTimeout(tick, 24); };
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
      if (st.fuel < 4) { storm.alarm(); say(...CREW.fuel); return; }
      st.fuel -= 4; st.boost = 1.6; st.lock *= 0.55; st.alt -= 260; storm.boost(); if (!st.threat) say(...CREW.boost);
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
      warnEl.querySelector('b').textContent = `${THREATS[type].name} ${SIDE_RU[side]}`;
      storm.alarm(); say(...CREW.threat[type], { side: SIDE_RU[side].toLowerCase() });
    }
    function resolveThreat() {
      const T = st.threat, D = THREATS[T.type];
      st.threat = null; warnEl.hidden = true;
      if (T.dodged) return;
      st.hull -= D.hull; st.fuel = Math.max(0, st.fuel - D.fuel); st.lock *= D.lock;
      st.shake = D.shake; st.red = 1; say(...CREW.hit[T.type]);
      if (T.type === 'gust') storm.gust();
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
      const jitter = 0.25 + st.boost * 0.8 + st.shake;
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
      st.alt = Math.max(0, 9400 * (1 - st.t / DURATION) - (9400 - st.alt - 9400 * st.t / DURATION > 0 ? 0 : 0));
      st.alt = Math.max(0, st.alt - dt * (9400 / DURATION));
      st.red = Math.max(st.threat ? 0.5 + 0.3 * Math.sin(st.t * 10) : 0, st.red - dt * 0.8);
      st.dark = Math.max(0, st.dark - dt * 0.35);
      st.bolt = Math.max(0, st.bolt - dt * 4); if (Math.random() < dt * 0.15) st.bolt = 1;
      // угрозы
      if (!st.threat && st.t > st.nextThreat && st.t < DURATION - 4) { spawnThreat(); st.nextThreat = st.t + 9 + Math.random() * 7; }
      if (st.threat) {
        st.threat.left -= dt;
        warnEl.querySelector('span').textContent = st.threat.dodged ? 'УКЛОНЕНИЕ' : `${st.threat.left.toFixed(1)} С · ПРИЦЕЛ ${SIDE_RU[{ left: 'right', right: 'left', up: 'down', down: 'up' }[st.threat.side]]} + ФОРСАЖ`;
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
      const set = (k, v, txt) => { gauges[k].bar.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`; gauges[k].val.textContent = txt; gauges[k].el.classList.toggle('low', v < 0.3); };
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

    function draw() {
      const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
      const sh = (2 + st.boost * 8 + st.shake * 14);
      const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
      g.save(); g.translate(ox, oy);
      // небо бури и земля внизу, приближается с высотой
      const k = 1 - st.alt / 9400;
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0a0d12'); sky.addColorStop(0.55, `rgb(${30 + k * 20},${34 + k * 18},${42 + k * 10})`); sky.addColorStop(1, `rgb(${60 + k * 40},${64 + k * 40},${70 + k * 30})`);
      g.fillStyle = sky; g.fillRect(-20, -20, w + 40, h + 40);
      if (st.bolt > 0) { g.fillStyle = `rgba(200,220,255,${st.bolt * 0.35})`; g.fillRect(-20, -20, w + 40, h + 40); }
      // земля: ледяная равнина с трещинами, растёт по мере снижения
      const gy = h * (0.75 - k * 0.35);
      g.fillStyle = `rgba(150,170,190,${0.25 + k * 0.4})`; g.fillRect(-20, gy, w + 40, h);
      g.strokeStyle = `rgba(40,50,60,${0.3 + k * 0.4})`; g.lineWidth = 1 + k * 2;
      for (let i = 0; i < 12; i++) { const x = ((i * 137) % w); g.beginPath(); g.moveTo(x, gy); g.lineTo(x + (i % 2 ? 1 : -1) * w * 0.3, h); g.stroke(); }
      // облака-полосы
      for (let i = 0; i < 6; i++) {
        const y = ((st.t * (40 + i * 12) + i * 90) % (h + 200)) - 100;
        g.fillStyle = `rgba(90,100,115,${0.08 + i * 0.02})`; g.fillRect(-20, y, w + 40, 30 + i * 10);
      }
      // сигнал на земле
      const cx = w / 2, cy = h / 2, S = Math.min(w, h) * 0.5;
      const bx = cx + st.beacon.x * S * 1.3, by = cy + st.beacon.y * S;
      const pulse = 0.5 + 0.5 * Math.sin(st.t * 6);
      g.strokeStyle = `rgba(255,40,60,${0.4 + pulse * 0.6})`; g.lineWidth = 3;
      g.beginPath(); g.arc(bx, by, 10 + pulse * 18, 0, 7); g.stroke();
      g.fillStyle = '#ff3040'; g.fillRect(bx - 4, by - 4, 8, 8);
      // снег летит на стекло (перспектива)
      g.fillStyle = 'rgba(230,235,245,.8)';
      for (const f of st.flakes) {
        f.z -= (0.5 + st.boost * 1.5) * 0.016; if (f.z <= 0.02) { f.z = 1; f.x = Math.random() * 2 - 1; f.y = Math.random() * 2 - 1; }
        const px = cx + (f.x / f.z) * w * 0.3 + st.t * 30 % 1, py = cy + (f.y / f.z) * h * 0.3;
        const sz = Math.max(1, (1 - f.z) * 4);
        g.fillRect(px, py, sz, sz * (1 + st.boost * 3));
      }
      // прицел
      const ax = cx + st.aim.x * S * 1.3, ay = cy + st.aim.y * S;
      const locked = st.lock >= 1;
      g.strokeStyle = locked ? '#40ff80' : '#ffd0d6'; g.lineWidth = 2;
      g.beginPath(); g.arc(ax, ay, 26, 0, 7); g.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(ax + dx * 16, ay + dy * 16); g.lineTo(ax + dx * 38, ay + dy * 38); g.stroke(); }
      g.beginPath(); g.arc(ax, ay, 32, -Math.PI / 2, -Math.PI / 2 + st.lock * Math.PI * 2); g.lineWidth = 4; g.stroke();
      g.restore();
      // рама фонаря кабины
      g.fillStyle = '#07080a';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.14, 0); g.lineTo(0, h * 0.35); g.fill();
      g.beginPath(); g.moveTo(w, 0); g.lineTo(w * 0.86, 0); g.lineTo(w, h * 0.35); g.fill();
      g.fillRect(0, h * 0.86, w, h);
    }

    // победа: в ледяном фасаде медленно разъезжается панель ангара, изнутри льётся свет
    function hangar(then) {
      const t0 = performance.now(); storm.hangar();
      say('ГОРН-12', 'Сигнал бедствия… кому нужны наши разработки в этой ледяной дыре? Ворота открыты.');
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 5200), w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
        const sh = 3 * (1 - k); g.save(); g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        g.fillStyle = '#0c1016'; g.fillRect(-10, -10, w + 20, h + 20);
        // ледяной фасад
        const fx = w * 0.15, fw = w * 0.7, fy = h * 0.2, fh = h * 0.6;
        const ice = g.createLinearGradient(0, fy, 0, fy + fh); ice.addColorStop(0, '#5a6b7a'); ice.addColorStop(1, '#2a333c');
        g.fillStyle = ice; g.fillRect(fx, fy, fw, fh);
        g.strokeStyle = 'rgba(200,220,240,.2)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(fx + (i * 97) % fw, fy); g.lineTo(fx + ((i * 61) % fw), fy + fh); g.stroke(); }
        // проём и свет
        const open = k * k * fw * 0.3, cx = w / 2, dy = fy + fh * 0.25, dh = fh * 0.75;
        const light = g.createRadialGradient(cx, dy + dh, 10, cx, dy + dh * 0.6, fw * 0.6);
        light.addColorStop(0, `rgba(255,220,140,${0.9 * k})`); light.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = `rgba(255,214,140,${0.85 * k})`; g.fillRect(cx - open, dy, open * 2, dh);
        g.fillStyle = light; g.fillRect(0, 0, w, h);
        // створки уезжают в стороны
        g.fillStyle = '#3c4650';
        g.fillRect(cx - fw * 0.3 - open, dy, fw * 0.3, dh); g.fillRect(cx + open, dy, fw * 0.3, dh);
        g.fillStyle = '#c9a21a'; g.fillRect(cx - open - 6, dy, 6, dh); g.fillRect(cx + open, dy, 6, dh);
        // снег поверх
        g.fillStyle = 'rgba(230,235,245,.7)';
        for (const f of st.flakes) { f.z -= 0.006; if (f.z <= 0.02) f.z = 1; g.fillRect(w / 2 + (f.x / f.z) * w * 0.3, h / 2 + (f.y / f.z) * h * 0.3, 2, 2); }
        g.restore();
        g.fillStyle = '#07080a'; g.fillRect(0, h * 0.86, w, h);
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
      warnEl.querySelector('b').textContent = win ? 'ПОСАДКА' : st.hull <= 0 ? 'КОРПУС РАЗРУШЕН' : 'ПОСАДКА НЕ ОСУЩЕСТВЛЕНА';
      warnEl.querySelector('span').textContent = win ? `ЗАХВАТОВ: ${st.caps}` : `ЗАХВАТОВ: ${st.caps} / ${NEED}`;
      setTimeout(() => done(win), 2200);
    }

    raf = requestAnimationFrame(frame);
    return () => { st.over = true; cancelAnimationFrame(raf); hum.stop(); removeEventListener('keydown', kd); removeEventListener('keyup', kd); };
  },
};
