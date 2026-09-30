// 8-битный звук: всё синтезируется в WebAudio (квадрат, треугольник, шум) — без файлов.
let ctx = null, master = null, noiseBuf = null, whiteBuf = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    // «8-битный» шум: ступенчатый, с низкой частотой выборки
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < d.length; i++) { if (i % 6 === 0) v = Math.random() * 2 - 1; d[i] = v; }
    // обычный (не 8-битный) белый шум — для «живых» звуков: шорох, дыхание, сердце
    whiteBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const wd = whiteBuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// реалистичный шум (не 8-бит)
const real = (dur, vol, delay, filter, type) => noise(dur, vol, delay, filter, type, whiteBuf);
// реалистичный тон: синус
function sine(freq, dur, vol, delay = 0) { tone('sine', freq, dur, vol, delay); }

// скрип: быстро модулированный фильтрованный шум
function creak(delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(190, t + 0.3);
  f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
  env(g, t, 0.03, 0.03, 0.35); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.4);
}
// гул тяжёлого привода на время хода створок
function motor(dur, delay, up) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(up ? 48 : 42, t); o.frequency.linearRampToValueAtTime(up ? 42 : 48, t + dur);
  f.type = 'lowpass'; f.frequency.value = 160;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.4); g.gain.setValueAtTime(0.18, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.1);
  real(dur, 0.05, delay, 300);
}

// одна нота: тип волны, частота (или [от, до]), длительность, громкость, задержка
function tone(type, freq, dur, vol = 0.2, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  if (Array.isArray(freq)) {
    o.frequency.setValueAtTime(freq[0], t);
    o.frequency.exponentialRampToValueAtTime(freq[1], t + dur);
  } else o.frequency.setValueAtTime(freq, t);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.2, delay = 0, filter = 3000, type = 'lowpass', buf) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf || noiseBuf; s.loop = true;
  f.type = type; f.frequency.value = filter;
  env(g, t, 0.01, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone('square', 880, 0.05, 0.12); tone('square', 1320, 0.04, 0.08, 0.04); },
  back() { tone('square', 660, 0.05, 0.12); tone('square', 440, 0.06, 0.1, 0.045); },
  // ---- реалистичные звуки (не 8-бит): тело, предметы, окружение ----
  // поворот: шорох одежды и скрип стула, растянутые на время поворота
  turn(dur = 1.2) {
    real(dur * 0.9, 0.06, 0, 900, 'lowpass');
    real(dur * 0.5, 0.04, dur * 0.2, 2200, 'bandpass');
    creak(dur * 0.2); if (Math.random() < 0.5) creak(dur * 0.55);
  },
  // шаг по бетону: глухой удар подошвы + шарк
  step(i = 0) {
    sine(i % 2 ? 70 : 78, 0.09, 0.3); real(0.06, 0.22, 0, 500); real(0.12, 0.05, 0.04, 2400, 'bandpass');
  },
  whoosh(dur = 1) { real(dur, 0.035, 0, 400); },
  enter() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, 0.07, 0.1, i * 0.06)); },
  boot() { [196, 262, 330, 392, 523].forEach((f, i) => tone('square', f, 0.09, 0.09, i * 0.08)); noise(0.5, 0.05, 0, 6000, 'highpass'); },
  key() { tone('square', 1800 + Math.random() * 600, 0.015, 0.03); },
  page() { real(0.12, 0.12, 0, 3000, 'bandpass'); real(0.08, 0.06, 0.08, 5000, 'highpass'); },
  // треск неона: электрический разряд
  flicker() { real(0.1, 0.1, 0, 5000, 'highpass'); sine(100, 0.1, 0.05); },
  // глухой удар за стеной
  thud() { sine(45, 0.6, 0.45); real(0.35, 0.18, 0, 200); },
  // тяжёлый шлюз: сигнал (8-бит — это интерфейс), лязг засовов, долгий гул приводов, удар в конце
  airlock(open, dur = 4) {
    tone('square', 988, 0.1, 0.08); tone('square', 988, 0.1, 0.08, 0.18); tone('square', 740, 0.14, 0.08, 0.36);
    for (let i = 0; i < 3; i++) { sine(90, 0.15, 0.35, 0.6 + i * 0.16); real(0.07, 0.2, 0.6 + i * 0.16, 1400, 'bandpass'); }
    real(0.8, 0.12, 1.0, 1600, 'bandpass'); // сброс давления
    motor(dur, 1.0, open);
    sine(38, 0.8, 0.6, 1.0 + dur); real(0.4, 0.3, 1.0 + dur, 180);
  },
  // металлический ящик на роликах
  drawer(open) { real(0.45, 0.1, 0, open ? 1400 : 1100, 'bandpass'); real(0.3, 0.06, 0.05, 4000, 'highpass'); sine(open ? 180 : 140, 0.12, 0.12, 0.45); real(0.08, 0.18, 0.45, 900); },
  paper() { real(0.2, 0.12, 0, 3500, 'bandpass'); real(0.14, 0.08, 0.12, 2500, 'bandpass'); },
  // банка: пластик о стол
  jar() { real(0.04, 0.12, 0, 2200, 'bandpass'); sine(420, 0.05, 0.04); },
  // крышка: трение резьбы с щелчками, в конце — отрыв/прижим
  lid(open, dur = 1) {
    real(dur, 0.05, 0, 3500, 'bandpass');
    for (let i = 0; i < 7; i++) real(0.015, 0.1, i * dur / 7, 5000, 'highpass');
    real(0.05, 0.14, dur, open ? 2800 : 1500, 'bandpass');
  },
  // гранула падает на бетон: пара мелких отскоков
  tick() { real(0.02, 0.25, 0, 4000, 'bandpass'); real(0.015, 0.14, 0.12, 4500, 'bandpass'); real(0.01, 0.07, 0.2, 5000, 'bandpass'); },
  crunch() { for (let i = 0; i < 6; i++) real(0.04, 0.2 - i * 0.025, i * 0.09 + Math.random() * 0.03, 1800 + Math.random() * 1800, 'bandpass'); },
  // глоток: низкий «гульп» и сухое сглатывание
  swallow() { sine(180, 0.12, 0.2); real(0.12, 0.08, 0.02, 500); sine(130, 0.14, 0.16, 0.3); real(0.1, 0.06, 0.32, 400); },
  // шорох и стук гранул о пластиковые стенки (не 8-бит); power 0..1
  rattle(power = 0.5) {
    const n = 2 + Math.round(power * 4);
    for (let i = 0; i < n; i++) {
      const d = Math.random() * 0.08;
      real(0.018, 0.05 + power * 0.08, d, 2500 + Math.random() * 3500, 'bandpass');
      sine(900 + Math.random() * 1400, 0.02, 0.012 + power * 0.015, d);
    }
    real(0.14, 0.025 + 0.04 * power, 0, 4500, 'bandpass');
  },
  // «речь» 8-бит для надписей: короткий писк на букву
  talk(ch) { if (ch.trim()) tone('square', 330 + ((ch.charCodeAt(0) * 37) % 9) * 40, 0.035, 0.05); },
  // сердце и шёпот для темноты (не 8-бит)
  // рация: щелчок тангенты 8-бит, дальше живой эфир
  ptt() { tone('square', 1400, 0.03, 0.08); real(1.8, 0.1, 0.05, 2600, 'bandpass'); tone('square', 1760, 0.08, 0.06, 1.9); },
  heartbeat(p = 0.5) { sine(58, 0.14, 0.25 + p * 0.35); real(0.08, 0.1 * p, 0, 180); sine(52, 0.12, 0.2 + p * 0.3, 0.2); real(0.07, 0.08 * p, 0.2, 160); },
  whisper() { real(0.9, 0.05, 0, 2600, 'bandpass'); real(0.6, 0.04, 0.3, 3800, 'bandpass'); },
  // выстрел: сухой хлопок, отдача и звон в ушах
  gunshot() {
    real(0.05, 0.9, 0, 9000, 'lowpass'); real(0.35, 0.5, 0.01, 1200); sine(55, 0.3, 0.8);
    real(1.2, 0.08, 0.1, 400);
    sine(3800, 2.2, 0.035, 0.15);
    sine(80, 0.25, 0.5, 0.55); real(0.2, 0.35, 0.55, 300); // тело падает на пол
  },
  death() { real(1.8, 0.4, 0, 900); sine(40, 2, 0.5); tone('square', [300, 40], 1.2, 0.12, 0.1); },
  empty() { tone('square', 180, 0.12, 0.08); tone('square', 140, 0.16, 0.08, 0.12); },
  // меню
  menuOpen() { [880, 660, 440].forEach((f, i) => tone('square', f, 0.05, 0.08, i * 0.05)); },
  menuClose() { [440, 660, 880].forEach((f, i) => tone('square', f, 0.05, 0.08, i * 0.05)); },
  denied() { tone('square', 120, 0.08, 0.08); tone('square', 110, 0.1, 0.08, 0.09); },
  confirm() { tone('square', 523, 0.07, 0.1); tone('square', 392, 0.14, 0.1, 0.08); },
  // заставка: вход в игру
  start() {
    [262, 330, 392, 523, 659, 784].forEach((f, i) => tone('square', f, 0.08, 0.07, i * 0.07));
    tone('triangle', [55, 110], 1.6, 0.25, 0.2); noise(1.4, 0.06, 0.2, 4000, 'highpass');
  },
  glitch() { for (let i = 0; i < 4; i++) tone('square', 200 + Math.random() * 2000, 0.02, 0.04, i * 0.03); noise(0.08, 0.06, 0, 6000, 'highpass'); },
};

// полностью выключить звук (настройки)
let muted = false;
export function setMuted(m) { muted = m; if (ctx) master.gain.value = m ? 0 : 0.5; }

// ---- звуки посадки в бурю (реалистичные; рычаги — 8-бит как взаимодействия) ----
export const storm = {
  // постоянный фон: низкий гул двигателей + вой ветра; вернёт { set(power), stop() }
  start() {
    if (!ctx) return { set() {}, stop() {} };
    const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    out.gain.linearRampToValueAtTime(1, t + 1.5);
    const hum = ctx.createOscillator(), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
    hum.type = 'sawtooth'; hum.frequency.value = 38; hf.type = 'lowpass'; hf.frequency.value = 140; hg.gain.value = 0.22;
    hum.connect(hf).connect(hg).connect(out); hum.start();
    const wind = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
    wind.buffer = whiteBuf; wind.loop = true; wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.8; wg.gain.value = 0.12;
    wind.connect(wf).connect(wg).connect(out); wind.start();
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.3; lg.gain.value = 250;
    lfo.connect(lg).connect(wf.frequency); lfo.start();
    return {
      set(p) { hum.frequency.value = 38 + p * 18; hg.gain.value = 0.22 + p * 0.15; wg.gain.value = 0.12 + p * 0.1; },
      stop() { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); for (const n of [hum, wind, lfo]) n.stop(ctx.currentTime + 0.9); },
    };
  },
  alarm() { for (let i = 0; i < 3; i++) { tone('square', 880, 0.14, 0.06, i * 0.28); tone('square', 660, 0.14, 0.06, i * 0.28 + 0.14); } },
  lock() { tone('square', 1320, 0.06, 0.08); tone('square', 1760, 0.12, 0.08, 0.07); },
  captured() { [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, 0.08, 0.08, i * 0.07)); },
  lever() { real(0.05, 0.25, 0, 1500, 'bandpass'); tone('square', 220, 0.04, 0.06); },
  boost() { real(0.9, 0.3, 0, 900); sine(60, 0.9, 0.35); },
  // порыв: тихий гул и тряска
  gust() { real(1.4, 0.2, 0, 350); sine(45, 1.2, 0.3); },
  // лёд: множество тихих ударов
  ice() { for (let i = 0; i < 26; i++) real(0.02, 0.08 + Math.random() * 0.1, Math.random() * 1.6, 2500 + Math.random() * 3000, 'bandpass'); sine(70, 0.3, 0.2); },
  // термальный пузырь: треск замерзания
  freeze() { for (let i = 0; i < 40; i++) real(0.01, 0.05 + Math.random() * 0.06, Math.random() * 2, 6000 + Math.random() * 3000, 'highpass'); real(2, 0.05, 0, 800); },
  dodge() { real(0.4, 0.12, 0, 2500, 'bandpass'); },
  radio() { real(0.25, 0.08, 0, 2200, 'bandpass'); tone('square', 1200, 0.03, 0.04); },
  // ворота ангара: скрежет, гул приводов
  hangar() { real(5, 0.12, 0, 600, 'bandpass'); sine(42, 5, 0.3); for (let i = 0; i < 10; i++) real(0.1, 0.1, i * 0.5, 3000, 'bandpass'); },
};

// ---- звуки боя рейдеров (реалистичные) ----
export const war = {
  shot(kind) {
    if (kind === 'sniper') { real(0.18, 0.32, 0, 2600, 'bandpass'); sine(90, 0.2, 0.2); real(0.7, 0.05, 0.08, 600); }
    else if (kind === 'smg') { for (let i = 0; i < 6; i++) real(0.04, 0.16, i * 0.065, 2300, 'bandpass'); }
    else if (kind === 'shotgun') { real(0.35, 0.36, 0, 1100); sine(60, 0.3, 0.28); }
    else if (kind === 'burner') { real(1.1, 0.12, 0, 900, 'bandpass'); real(1.1, 0.07, 0, 250); }
    else if (kind === 'mg') { for (let i = 0; i < 9; i++) { real(0.05, 0.22, i * 0.085, 1500, 'bandpass'); sine(55, 0.07, 0.12, i * 0.085); } }
    else if (kind === 'hammer') { sine(70, 0.22, 0.4); real(0.06, 0.25, 0, 3800, 'bandpass'); }
    else if (kind === 'knife') real(0.07, 0.12, 0, 5500, 'highpass');
  },
  // высадка: рёв двигателей и удар о грунт
  drop() { real(2.2, 0.22, 0, 500); sine(40, 2, 0.3); sine(46, 0.5, 0.4, 2); real(0.3, 0.2, 2, 300); },
  fall() { real(0.2, 0.12, 0, 400); },
  // громкий выстрел с басом: удар, хвост, треск
  loud(kind) {
    sine(kind === 'shotgun' ? 45 : 55, 0.35, 0.9); tone('sine', [140, 40], 0.25, 0.8);
    real(0.12, 0.9, 0, 2600, 'bandpass'); real(0.5, 0.5, 0.02, 500); real(0.05, 0.6, 0, 7000, 'highpass');
  },
  // хруст мяса
  meat() { for (let i = 0; i < 4; i++) real(0.03 + Math.random() * 0.04, 0.5, i * 0.025, 900 + Math.random() * 1500, 'bandpass'); sine(80, 0.15, 0.5); real(0.2, 0.25, 0.03, 300); },
};

// гром: далёкий раскат
export function thunder(delay = 0) { real(2.6, 0.3, delay, 180); real(0.4, 0.18, delay, 900); sine(38, 2.4, 0.25, delay); }

// приглушить всё (пауза) и вернуть
export function duck(on) {
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(muted ? 0 : on ? 0.18 : 0.5, ctx.currentTime + 0.25);
}

// гул заставки: низкий дрон, который гаснет при входе в игру
let bootDrone = null;
export function startBootDrone() {
  if (!ctx || bootDrone) return;
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = 41; o2.type = 'square'; o2.frequency.value = 61.5;
  f.type = 'lowpass'; f.frequency.value = 180;
  g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2);
  o.connect(f); o2.connect(f); f.connect(g).connect(master); o.start(); o2.start();
  bootDrone = { o, o2, g };
}
export function stopBootDrone() {
  if (!bootDrone) return;
  const { o, o2, g } = bootDrone; bootDrone = null;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  o.stop(ctx.currentTime + 1.6); o2.stop(ctx.currentTime + 1.6);
}

// фон: низкий гул неона + дрон холода
let ambienceOn = false;
export function startAmbience() {
  if (!ctx || ambienceOn) return;
  ambienceOn = true;
  const hum = ctx.createOscillator(), humG = ctx.createGain(), humF = ctx.createBiquadFilter();
  hum.type = 'sawtooth'; hum.frequency.value = 50;
  humF.type = 'lowpass'; humF.frequency.value = 220;
  humG.gain.value = 0.035;
  hum.connect(humF).connect(humG).connect(master); hum.start();

  const drone = ctx.createOscillator(), dG = ctx.createGain();
  drone.type = 'sine'; drone.frequency.value = 55;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.08; lfoG.gain.value = 0.03;
  lfo.connect(lfoG).connect(dG.gain);
  dG.gain.value = 0.04;
  drone.connect(dG).connect(master); drone.start(); lfo.start();

  const wind = ctx.createBufferSource(), wF = ctx.createBiquadFilter(), wG = ctx.createGain();
  wind.buffer = whiteBuf; wind.loop = true;
  wF.type = 'bandpass'; wF.frequency.value = 400; wF.Q.value = 3;
  wG.gain.value = 0.02;
  wind.connect(wF).connect(wG).connect(master); wind.start();
}

// ---- сэмплы (файлы из public/audio): громко, с сильным басом ----
const bufs = {}, loading = {};
let fxBus = null;
function bus() {
  if (fxBus || !ctx) return fxBus;
  // бас-буст → перегруз → компрессор-лимитер
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 160; low.gain.value = 14;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 2500; mid.gain.value = 4;
  const drive = ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.2); }
  drive.curve = c;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.15;
  const out = ctx.createGain(); out.gain.value = 1.6;
  low.connect(mid).connect(drive).connect(comp).connect(out).connect(master);
  return (fxBus = low);
}
export function preload(names) {
  if (!ctx) return;
  for (const n of names) {
    if (bufs[n] || loading[n]) continue;
    loading[n] = fetch(`audio/${n}.ogg`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => (bufs[n] = b)).catch(() => {});
  }
}
// проиграть сэмпл; false — если ещё не загружен (тогда можно синтез)
export function sample(n, vol = 1, rate = 1) {
  if (!ctx || !bufs[n]) { preload([n]); return false; }
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = bufs[n]; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12); g.gain.value = vol;
  s.connect(g).connect(bus()); s.start();
  return true;
}
