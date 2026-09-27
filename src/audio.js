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
    startAmbience();
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
  turn() { noise(0.35, 0.12, 0, 900); tone('triangle', [180, 90], 0.3, 0.15); },
  approach() { tone('square', 110, 0.08, 0.15); tone('square', 98, 0.08, 0.15, 0.22); noise(0.06, 0.08, 0, 400); noise(0.06, 0.08, 0.22, 400); },
  retreat() { tone('square', 98, 0.08, 0.15); tone('square', 110, 0.08, 0.15, 0.2); },
  enter() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, 0.07, 0.1, i * 0.06)); },
  boot() { [196, 262, 330, 392, 523].forEach((f, i) => tone('square', f, 0.09, 0.09, i * 0.08)); noise(0.5, 0.05, 0, 6000, 'highpass'); },
  key() { tone('square', 1800 + Math.random() * 600, 0.015, 0.03); },
  page() { noise(0.08, 0.1, 0, 2500, 'bandpass'); tone('square', 520, 0.03, 0.05); },
  flicker() { noise(0.12, 0.12, 0, 5000, 'highpass'); tone('square', 60, 0.1, 0.06); },
  thud() { tone('triangle', [70, 35], 0.5, 0.35); noise(0.25, 0.12, 0, 250); },
  // шлюз: сигнал, шипение пневматики, удар створок
  airlock(open) {
    tone('square', 988, 0.08, 0.1); tone('square', 988, 0.08, 0.1, 0.14);
    noise(0.7, 0.18, 0.3, 1800, 'bandpass');
    tone('square', open ? [140, 70] : [70, 140], 0.6, 0.08, 0.3);
    tone('triangle', [90, 40], 0.25, 0.35, open ? 0.95 : 0.95); noise(0.12, 0.2, 0.95, 300);
  },
  paper() { noise(0.18, 0.12, 0, 3500, 'bandpass'); noise(0.12, 0.08, 0.12, 2500, 'bandpass'); },
};

// фон: низкий гул неона + дрон холода
function startAmbience() {
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
