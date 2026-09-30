import { sfx } from '../audio.js';

// Движок простых мини-игр глав: 8 типов, параметры и тексты — в story/minigames.json.
// Общее: полноэкранный canvas, заголовок и подсказка, шкала прогресса, итог «восстановлено/сбой».
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const RED = '#ff3a4e', DIM = '#6a0c1a', TXT = '#ffd0d4', OK = '#7dff9a';

const TYPES = {
  // ритм: кольцо сжимается к метке — касание в момент совпадения
  rhythm: {
    init(S, c) { S.need = c.need || 8; S.hits = 0; S.miss = 0; S.r = 1; S.speed = c.speed || 0.9; },
    update(S, dt) { S.r -= dt * S.speed; if (S.r < 0.18) { S.miss++; S.r = 1; S.flash = -1; } S.prog = S.hits / S.need; if (S.miss > (S.c.lives ?? 4)) S.lose = true; if (S.hits >= S.need) S.win = true; },
    down(S) { if (Math.abs(S.r - 0.35) < 0.09) { S.hits++; S.flash = 1; sfx.click(); S.speed *= 1.04; } else { S.miss++; S.flash = -1; sfx.denied(); } S.r = 1; },
    draw(S, g, w, h) {
      const cx = w / 2, cy = h * 0.56, R = Math.min(w, h) * 0.38;
      g.strokeStyle = DIM; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, R * 0.35, 0, 7); g.stroke();
      g.strokeStyle = S.flash > 0 ? OK : S.flash < 0 ? RED : TXT; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * S.r, 0, 7); g.stroke();
      g.fillStyle = RED; g.font = `${Math.round(R * 0.16)}px "Press Start 2P",monospace`; g.textAlign = 'center'; g.fillText(S.c.word || '', cx, cy + R * 0.06);
      lives(S, g, w, h, S.c.lives ?? 4, S.miss);
    },
  },
  // удержание: держите стрелку в зелёной зоне, зона плывёт
  hold: {
    init(S, c) { S.v = 0.5; S.z = 0.5; S.zv = 0; S.in = 0; S.dur = c.dur || 10; S.w = c.zone || 0.22; },
    update(S, dt) {
      S.zv += rnd(-1, 1) * dt * (S.c.chaos || 1.6); S.zv *= 0.98; S.z += S.zv * dt; if (S.z < 0.15 || S.z > 0.85) { S.zv *= -1; S.z = Math.max(0.15, Math.min(0.85, S.z)); }
      S.v += (S.pressed ? 0.7 : -0.6) * dt; S.v = Math.max(0, Math.min(1, S.v));
      const inside = Math.abs(S.v - S.z) < S.w / 2; S.in += inside ? dt : -dt * 0.5; S.in = Math.max(0, S.in);
      S.prog = S.in / S.dur; if (S.in >= S.dur) S.win = true;
    },
    draw(S, g, w, h) {
      const x = w * 0.2, W = w * 0.6, y = h * 0.52;
      g.fillStyle = '#1a0306'; g.fillRect(x, y, W, 28); g.fillStyle = 'rgba(125,255,154,.3)'; g.fillRect(x + (S.z - S.w / 2) * W, y, S.w * W, 28);
      g.fillStyle = TXT; g.fillRect(x + S.v * W - 3, y - 10, 6, 48);
      label(g, w / 2, y + 70, S.pressed ? (S.c.on || 'ДЕРЖУ') : (S.c.off || 'ОТПУЩЕНО'), 11);
    },
  },
  // уклонение: ведите метку пальцем, не касаясь падающего
  dodge: {
    init(S, c) { S.x = 0.5; S.obs = []; S.hp = c.lives ?? 3; S.t2 = 0; S.dur = c.dur || 14; },
    update(S, dt) {
      S.t2 += dt; S.prog = S.t2 / S.dur; if (S.t2 >= S.dur) S.win = true;
      if (Math.random() < dt * (1.6 + S.t2 * 0.15) * (S.c.rate || 1)) S.obs.push({ x: Math.random(), y: -0.05, v: rnd(0.35, 0.7) * (S.c.speed || 1), s: rnd(0.03, 0.07) });
      if (S.px != null) S.x += (S.px - S.x) * Math.min(1, dt * 12);
      for (const o of S.obs) { o.y += o.v * dt; if (!o.hit && Math.abs(o.y - 0.86) < o.s && Math.abs(o.x - S.x) < o.s + 0.03) { o.hit = true; S.hp--; S.flash = -1; sfx.denied(); } }
      S.obs = S.obs.filter((o) => o.y < 1.1); if (S.hp <= 0) S.lose = true;
    },
    move(S, x) { S.px = x; }, down(S, x) { S.px = x; },
    draw(S, g, w, h) {
      g.fillStyle = TXT; g.fillRect(S.x * w - 12, h * 0.86 - 12, 24, 24);
      for (const o of S.obs) { g.fillStyle = o.hit ? DIM : RED; g.fillRect((o.x - o.s) * w, (o.y - o.s) * h, o.s * 2 * w, o.s * 2 * h * 0.6); }
      if (S.c.obj) label(g, w / 2, h * 0.95, S.c.obj, 8, DIM);
      lives(S, g, w, h, S.c.lives ?? 3, (S.c.lives ?? 3) - S.hp);
    },
  },
  // ловля: касайтесь «нужных» слов, не трогайте ложные
  catch: {
    init(S, c) { S.items = []; S.got = 0; S.bad = 0; S.need = c.need || 10; },
    update(S, dt) {
      if (Math.random() < dt * 1.4) { const good = Math.random() < 0.55; S.items.push({ t: pick(good ? S.c.good : S.c.bad), good, x: rnd(0.15, 0.85), y: rnd(0.3, 0.85), life: rnd(1.4, 2.2) }); }
      for (const i of S.items) i.life -= dt; S.items = S.items.filter((i) => i.life > 0 && !i.done);
      S.prog = S.got / S.need; if (S.got >= S.need) S.win = true; if (S.bad > (S.c.lives ?? 3)) S.lose = true;
    },
    down(S, x, y, w, h) {
      const i = S.items.find((q) => Math.abs(q.x - x) * w < 70 && Math.abs(q.y - y) * h < 22); if (!i) return;
      i.done = true; if (i.good) { S.got++; sfx.click(); S.flash = 1; } else { S.bad++; sfx.denied(); S.flash = -1; }
    },
    draw(S, g, w, h) { for (const i of S.items) { g.globalAlpha = Math.min(1, i.life * 2); label(g, i.x * w, i.y * h, i.t, 10, i.good ? TXT : '#ff8a96'); g.globalAlpha = 1; } lives(S, g, w, h, S.c.lives ?? 3, S.bad); },
  },
  // память: запомните последовательность знаков и повторите
  memory: {
    init(S, c) { S.sym = c.symbols || ['▲', '●', '■', '◆']; S.len = c.start || 3; S.round = 0; S.rounds = c.rounds || 4; newSeq(S); },
    update(S, dt) { if (S.show >= 0) { S.st += dt; if (S.st > 0.7) { S.st = 0; S.show++; if (S.show >= S.seq.length) S.show = -1; } } S.prog = S.round / S.rounds; },
    down(S, x, y) {
      if (S.show >= 0 || y < 0.7) return; const k = Math.min(S.sym.length - 1, Math.floor(x * S.sym.length));
      if (k === S.seq[S.inp]) { S.inp++; sfx.click(); S.press = { k, t: 0.2 }; if (S.inp >= S.seq.length) { S.round++; S.flash = 1; if (S.round >= S.rounds) S.win = true; else { S.len++; newSeq(S); } } }
      else { sfx.denied(); S.flash = -1; S.errs = (S.errs || 0) + 1; if (S.errs > 2) S.lose = true; else newSeq(S); }
    },
    draw(S, g, w, h) {
      const cur = S.show >= 0 ? S.sym[S.seq[S.show]] : S.seq.slice(0, S.inp).map((k) => S.sym[k]).join(' ');
      label(g, w / 2, h * 0.47, S.show >= 0 ? cur : (cur || '…'), S.show >= 0 ? 36 : 16, S.show >= 0 ? TXT : RED);
      S.sym.forEach((s, k) => { const x = (k + 0.5) / S.sym.length * w; g.strokeStyle = DIM; g.lineWidth = 2; g.strokeRect(x - w / S.sym.length / 2 + 6, h * 0.72, w / S.sym.length - 12, h * 0.22); label(g, x, h * 0.84, s, 20, S.show >= 0 ? DIM : TXT); });
    },
  },
  // сортировка: предмет — касание слева или справа по его категории
  sort: {
    init(S, c) { S.ok = 0; S.bad = 0; S.need = c.need || 10; next(S); },
    update(S, dt) { S.it.y += dt * (0.25 + S.ok * 0.02); if (S.it.y > 0.9) { S.bad++; sfx.denied(); S.flash = -1; next(S); } S.prog = S.ok / S.need; if (S.ok >= S.need) S.win = true; if (S.bad > (S.c.lives ?? 3)) S.lose = true; },
    down(S, x) { const side = x < 0.5 ? 0 : 1; if (side === S.it.side) { S.ok++; sfx.click(); S.flash = 1; } else { S.bad++; sfx.denied(); S.flash = -1; } next(S); },
    draw(S, g, w, h) {
      g.fillStyle = 'rgba(106,12,26,.25)'; g.fillRect(0, h * 0.25, w / 2 - 2, h * 0.75); g.fillRect(w / 2 + 2, h * 0.25, w / 2, h * 0.75);
      label(g, w * 0.25, h * 0.95, `◀ ${S.c.left}`, 9, DIM); label(g, w * 0.75, h * 0.95, `${S.c.right} ▶`, 9, DIM);
      label(g, w / 2, S.it.y * h, S.it.t, 13, TXT); lives(S, g, w, h, S.c.lives ?? 3, S.bad);
    },
  },
  // скрытность: удерживайте — идёте; когда луч/взгляд открыт — стойте
  stealth: {
    init(S, c) { S.pos = 0; S.eye = 0; S.phase = 2; S.hp = c.lives ?? 2; },
    update(S, dt) {
      S.phase -= dt; if (S.phase <= 0) { S.eye = S.eye ? 0 : 1; S.phase = S.eye ? rnd(0.9, 1.8) : rnd(1.2, 2.6); if (S.eye) S.warn = 0; }
      if (!S.eye && S.phase < 0.45) S.warn = 1;
      if (S.pressed) { S.pos += dt * 0.09; if (S.eye && !S.caught) { S.caught = 0.6; S.hp--; sfx.denied(); S.flash = -1; S.pos = Math.max(0, S.pos - 0.12); } }
      if (S.caught) { S.caught -= dt; if (S.caught <= 0) S.caught = 0; }
      S.prog = S.pos; if (S.pos >= 1) S.win = true; if (S.hp <= 0) S.lose = true;
    },
    draw(S, g, w, h) {
      const y = h * 0.62; g.fillStyle = '#1a0306'; g.fillRect(w * 0.1, y, w * 0.8, 6);
      g.fillStyle = TXT; g.fillRect(w * 0.1 + S.pos * w * 0.8 - 8, y - 24, 16, 24);
      g.fillStyle = S.eye ? RED : S.warn ? '#a02030' : DIM; g.beginPath(); g.ellipse(w / 2, h * 0.36, 60, S.eye ? 22 : 3, 0, 0, 7); g.fill();
      if (S.eye) { g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2, h * 0.36, 12, 0, 7); g.fill(); }
      label(g, w / 2, h * 0.8, S.eye ? (S.c.on || 'СМОТРИТ — ЗАМРИ') : (S.c.off || 'ДЕРЖИТЕ — ИДТИ'), 9, S.eye ? RED : DIM);
      lives(S, g, w, h, S.c.lives ?? 2, (S.c.lives ?? 2) - S.hp);
    },
  },
  // прицел: метка дрожит и плывёт; касание, когда она внутри цели
  aim: {
    init(S, c) { S.x = 0.5; S.y = 0.5; S.vx = 0; S.vy = 0; S.hits = 0; S.need = c.need || 6; S.bad = 0; S.tx = rnd(0.3, 0.7); S.ty = rnd(0.4, 0.7); },
    update(S, dt) {
      const k = S.c.shake || 1; S.vx += rnd(-1, 1) * dt * 3 * k; S.vy += rnd(-1, 1) * dt * 3 * k; S.vx *= 0.97; S.vy *= 0.97;
      if (S.px != null) { S.vx += (S.px - S.x) * dt * 4; S.vy += (S.py - S.y) * dt * 4; }
      S.x = Math.max(0.05, Math.min(0.95, S.x + S.vx * dt)); S.y = Math.max(0.3, Math.min(0.95, S.y + S.vy * dt));
      S.prog = S.hits / S.need; if (S.hits >= S.need) S.win = true; if (S.bad > (S.c.lives ?? 3)) S.lose = true;
    },
    move(S, x, y) { S.px = x; S.py = y; }, up(S) { S.px = null; },
    down(S, x, y) { S.px = x; S.py = y; },
    draw(S, g, w, h) {
      g.strokeStyle = DIM; g.lineWidth = 2; g.beginPath(); g.arc(S.tx * w, S.ty * h, 26, 0, 7); g.stroke();
      g.strokeStyle = TXT; g.beginPath(); g.moveTo(S.x * w - 14, S.y * h); g.lineTo(S.x * w + 14, S.y * h); g.moveTo(S.x * w, S.y * h - 14); g.lineTo(S.x * w, S.y * h + 14); g.stroke();
      label(g, w / 2, h * 0.97, S.c.obj || 'ОТПУСТИТЕ ПАЛЕЦ НАД ЦЕЛЬЮ', 8, DIM); lives(S, g, w, h, S.c.lives ?? 3, S.bad);
    },
    release(S, w, h) { if (Math.hypot((S.x - S.tx) * w, (S.y - S.ty) * h) < 26) { S.hits++; sfx.click(); S.flash = 1; S.tx = rnd(0.2, 0.8); S.ty = rnd(0.4, 0.8); } else { S.bad++; sfx.denied(); S.flash = -1; } },
  },
};
function newSeq(S) { S.seq = Array.from({ length: S.len }, () => Math.floor(Math.random() * S.sym.length)); S.show = 0; S.st = -0.4; S.inp = 0; }
function next(S) { const side = Math.random() < 0.5 ? 0 : 1; S.it = { side, t: pick(side ? S.c.rightItems : S.c.leftItems), y: 0.3 }; }
function label(g, x, y, t, px, col = TXT) { g.font = `${px}px "Press Start 2P",monospace`; g.textAlign = 'center'; g.fillStyle = col; g.fillText(t, x, y); }
function lives(S, g, w, h, max, lost) { for (let i = 0; i < max; i++) { g.fillStyle = i < max - lost ? RED : DIM; g.fillRect(w - 20 - i * 14, 44, 10, 10); } }

export function makeGame(c) {
  return {
    name: c.name,
    run(root, done) {
      root.className = 'ag-root';
      root.innerHTML = `<canvas></canvas><div class="ag-top"><b></b><p></p><i><u></u></i></div><div class="ag-end"></div>`;
      const cv = root.querySelector('canvas'), g = cv.getContext('2d'), T = TYPES[c.type];
      root.querySelector('b').textContent = c.name.toUpperCase(); root.querySelector('p').textContent = c.how;
      const bar = root.querySelector('u'), endEl = root.querySelector('.ag-end');
      const S = { c, prog: 0, flash: 0, pressed: false, t: 0 }; T.init(S, c);
      const limit = c.limit || 45;
      const xy = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); S.pressed = true; const [x, y] = xy(e); T.down?.(S, x, y, cv.clientWidth, cv.clientHeight); });
      cv.addEventListener('pointermove', (e) => { const [x, y] = xy(e); T.move?.(S, x, y); });
      const up = () => { if (!S.pressed) return; S.pressed = false; T.release?.(S, cv.clientWidth, cv.clientHeight); T.up?.(S); };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      let last = performance.now(), raf = 0, over = false;
      const finish = (win) => {
        over = true; endEl.textContent = win ? 'ФАЙЛ ВОССТАНОВЛЕН' : 'СБОЙ'; endEl.className = `ag-end on ${win ? 'win' : 'lose'}`;
        win ? sfx.confirm() : sfx.denied(); setTimeout(() => done(win), 1400);
      };
      function frame(now) {
        const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; S.t += dt;
        const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        if (!over) { T.update(S, dt); if (S.t > limit) S.lose = true; }
        g.clearRect(0, 0, w, h);
        if (S.flash) { g.fillStyle = S.flash > 0 ? 'rgba(125,255,154,.08)' : 'rgba(255,40,60,.15)'; g.fillRect(0, 0, w, h); S.flash *= 0.9; if (Math.abs(S.flash) < 0.05) S.flash = 0; }
        T.draw(S, g, w, h);
        label(g, 40, 54, `${Math.max(0, Math.ceil(limit - S.t))}`, 10, DIM);
        bar.style.width = `${Math.min(1, S.prog) * 100}%`;
        if (!over && (S.win || S.lose)) finish(!!S.win);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    },
  };
}
