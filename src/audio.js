// 8-битный звук: всё синтезируется в WebAudio (квадрат, треугольник, шум) — без файлов.
let ctx = null, master = null, noiseBuf = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    // «8-битный» шум: ступенчатый, с низкой частотой выборки
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < d.length; i++) { if (i % 6 === 0) v = Math.random() * 2 - 1; d[i] = v; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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

function noise(dur, vol = 0.2, delay = 0, filter = 3000, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = type; f.frequency.value = filter;
  env(g, t, 0.01, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone('square', 880, 0.05, 0.12); tone('square', 1320, 0.04, 0.08, 0.04); },
  back() { tone('square', 660, 0.05, 0.12); tone('square', 440, 0.06, 0.1, 0.045); },
  // поворот головы/корпуса: шорох одежды и скрип стула, растянутые на время поворота
  turn(dur = 1.2) {
    noise(dur * 0.9, 0.07, 0, 700);
    noise(dur * 0.5, 0.05, dur * 0.2, 1600, 'bandpass');
    tone('square', [220, 180], 0.12, 0.035, dur * 0.15); tone('square', [200, 240], 0.1, 0.03, dur * 0.45);
  },
  // один шаг: глухой удар каблука + шарк подошвы
  step(i = 0) {
    const f = i % 2 ? 92 : 104;
    tone('triangle', [f, f * 0.55], 0.09, 0.28); tone('square', f * 0.5, 0.05, 0.06);
    noise(0.07, 0.12, 0, 450); noise(0.1, 0.04, 0.05, 2200, 'bandpass');
  },
  // мягкий «проход» воздуха при смене места
  whoosh(dur = 1) { noise(dur, 0.05, 0, 500); },
  enter() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, 0.07, 0.1, i * 0.06)); },
  boot() { [196, 262, 330, 392, 523].forEach((f, i) => tone('square', f, 0.09, 0.09, i * 0.08)); noise(0.5, 0.05, 0, 6000, 'highpass'); },
  key() { tone('square', 1800 + Math.random() * 600, 0.015, 0.03); },
  page() { noise(0.08, 0.1, 0, 2500, 'bandpass'); tone('square', 520, 0.03, 0.05); },
  flicker() { noise(0.12, 0.12, 0, 5000, 'highpass'); tone('square', 60, 0.1, 0.06); },
  thud() { tone('triangle', [70, 35], 0.5, 0.35); noise(0.25, 0.12, 0, 250); },
  // шлюз: сигнал, шипение пневматики, удар створок
  airlock(open) {
    tone('square', 988, 0.08, 0.1); tone('square', 988, 0.08, 0.1, 0.14);
    noise(0.9, 0.18, 0.4, 1800, 'bandpass');
    tone('square', open ? [140, 70] : [70, 140], 0.8, 0.08, 0.4);
    tone('triangle', [90, 40], 0.25, 0.35, 1.25); noise(0.12, 0.2, 1.25, 300);
  },
  paper() { noise(0.18, 0.12, 0, 3500, 'bandpass'); noise(0.12, 0.08, 0.12, 2500, 'bandpass'); },
  // банка: пластик о стол, откручивание крышки, хруст гранулы
  jar() { tone('square', 330, 0.04, 0.06); noise(0.05, 0.1, 0, 3000, 'bandpass'); },
  lid(open) {
    for (let i = 0; i < 5; i++) { noise(0.03, 0.1, i * 0.06, 4200, 'bandpass'); tone('square', open ? 700 + i * 60 : 1000 - i * 60, 0.02, 0.03, i * 0.06); }
    tone('square', open ? 1200 : 400, 0.05, 0.08, 0.32);
  },
  crunch() {
    for (let i = 0; i < 6; i++) noise(0.04, 0.16 - i * 0.02, i * 0.09 + Math.random() * 0.03, 1800 + Math.random() * 1500, 'bandpass');
    tone('triangle', [140, 80], 0.2, 0.08, 0.6);
  },
  // проглотить: глоток и сухое сглатывание
  swallow() {
    tone('triangle', [220, 90], 0.18, 0.18); noise(0.15, 0.06, 0.05, 600);
    tone('triangle', [160, 70], 0.2, 0.14, 0.35); noise(0.12, 0.05, 0.4, 500);
  },
  // шорох и стук гранул о стенки банки; power 0..1
  rattle(power = 0.5) {
    const n = 1 + Math.round(power * 3);
    for (let i = 0; i < n; i++) {
      const d = Math.random() * 0.07;
      tone('square', 1400 + Math.random() * 1800, 0.012, 0.025 + power * 0.03, d);
      noise(0.025, 0.04 + power * 0.05, d, 3000 + Math.random() * 2500, 'bandpass');
    }
    noise(0.1, 0.03 * power, 0, 1800, 'bandpass');
  },
  empty() { tone('square', 180, 0.12, 0.08); tone('square', 140, 0.16, 0.08, 0.12); },
  // рация: щелчок тангенты, шипение эфира, короткий писк
  ptt() {
    tone('square', 1400, 0.03, 0.08);
    noise(1.8, 0.1, 0.05, 2600, 'bandpass');
    for (let i = 0; i < 8; i++) tone('square', 300 + Math.random() * 1200, 0.03, 0.025, 0.2 + i * 0.2);
    tone('square', 1760, 0.08, 0.07, 1.9); tone('square', 1320, 0.1, 0.07, 1.98);
  },
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

// приглушить всё (пауза) и вернуть
export function duck(on) {
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(on ? 0.18 : 0.5, ctx.currentTime + 0.25);
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
  hum.type = 'square'; hum.frequency.value = 50;
  humF.type = 'lowpass'; humF.frequency.value = 220;
  humG.gain.value = 0.035;
  hum.connect(humF).connect(humG).connect(master); hum.start();

  const drone = ctx.createOscillator(), dG = ctx.createGain();
  drone.type = 'triangle'; drone.frequency.value = 55;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.08; lfoG.gain.value = 0.03;
  lfo.connect(lfoG).connect(dG.gain);
  dG.gain.value = 0.04;
  drone.connect(dG).connect(master); drone.start(); lfo.start();

  const wind = ctx.createBufferSource(), wF = ctx.createBiquadFilter(), wG = ctx.createGain();
  wind.buffer = noiseBuf; wind.loop = true;
  wF.type = 'bandpass'; wF.frequency.value = 400; wF.Q.value = 3;
  wG.gain.value = 0.02;
  wind.connect(wF).connect(wG).connect(master); wind.start();
}
