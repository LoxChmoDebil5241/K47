// Платформер «Кубы»: игрок с хп и инвентарём, бьёт злых кубов электродом.
const cv = document.getElementById('pf');
const ctx = cv.getContext('2d');
let W, H, S; // S — масштаб: мир по высоте 360 единиц
function resize() {
  W = cv.width = innerWidth * devicePixelRatio;
  H = cv.height = innerHeight * devicePixelRatio;
  S = H / 360;
}
addEventListener('resize', resize); resize();

// --- ввод: клавиатура + сенсорные кнопки ---
const key = { left: false, right: false, jump: false, attack: false };
const kmap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyJ: 'attack', KeyF: 'attack' };
addEventListener('keydown', e => { if (kmap[e.code]) key[kmap[e.code]] = true; if (e.code >= 'Digit1' && e.code <= 'Digit4') useItem(+e.code.slice(5) - 1); });
addEventListener('keyup', e => { if (kmap[e.code]) key[kmap[e.code]] = false; });
for (const b of document.querySelectorAll('#pad button')) {
  const k = b.dataset.k;
  const on = v => e => { e.preventDefault(); key[k] = v; b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', on(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, on(false));
}
// тап по слоту инвентаря
cv.addEventListener('pointerdown', e => {
  const x = e.clientX * devicePixelRatio / S, y = e.clientY * devicePixelRatio / S;
  if (y > 8 && y < 36) { const i = Math.floor((x - 150) / 30); if (i >= 0 && i < 4) useItem(i); }
  if (state !== 'play') restart();
});

// --- мир ---
const GRAV = 1400, LEVEL_W = 3200;
const plats = [
  [0, 320, LEVEL_W, 40],
  [200, 250, 120, 12], [380, 200, 120, 12], [600, 260, 160, 12], [820, 210, 100, 12],
  [1000, 160, 140, 12], [1200, 240, 200, 12], [1480, 190, 120, 12], [1680, 140, 120, 12],
  [1900, 230, 220, 12], [2200, 180, 140, 12], [2420, 250, 160, 12], [2650, 200, 140, 12], [2880, 150, 120, 12],
].map(([x, y, w, h]) => ({ x, y, w, h }));

let P, cubes, loot, fx, camX, state, kills, t;
function restart() {
  P = { x: 60, y: 260, w: 22, h: 36, vx: 0, vy: 0, dir: 1, ground: false, hp: 100, maxHp: 100,
    inv: ['электрод', 'аптечка', null, null], cd: 0, swing: 0, hurt: 0, charge: 0 };
  cubes = [];
  for (let x = 450; x < LEVEL_W - 150; x += 230 + Math.random() * 120)
    cubes.push({ x, y: 0, s: 34, vx: (Math.random() < .5 ? -1 : 1) * 55, vy: 0, hp: 3, hit: 0, jumpT: Math.random() * 2 });
  loot = [{ x: 1060, y: 130, item: 'батарейка' }, { x: 1740, y: 110, item: 'аптечка' }, { x: 2280, y: 150, item: 'аптечка' }, { x: 2930, y: 120, item: 'батарейка' }];
  fx = []; camX = 0; state = 'play'; kills = 0; t = 0;
}
restart();

// --- звук: «ГООООЙДА» голосом + треск электрода ---
let ac;
function zap() {
  try {
    ac ??= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(900, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, ac.currentTime + .25);
    g.gain.setValueAtTime(.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .25);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + .25);
  } catch {}
}
let lastShout = 0;
function shout() {
  fx.push({ type: 'text', x: P.x, y: P.y - 20, txt: 'ГООООЙДА!', life: 1 });
  if (t - lastShout < 1.2 || !window.speechSynthesis) return;
  lastShout = t;
  const u = new SpeechSynthesisUtterance('Гоооооойда!');
  u.lang = 'ru-RU'; u.rate = .8; u.pitch = .6; u.volume = 1;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

function useItem(i) {
  const it = P.inv[i];
  if (!it || state !== 'play') return;
  if (it === 'аптечка' && P.hp < P.maxHp) { P.hp = Math.min(P.maxHp, P.hp + 40); P.inv[i] = null; fx.push({ type: 'text', x: P.x, y: P.y - 20, txt: '+40 ХП', life: 1, c: '#6f6' }); }
  if (it === 'батарейка') { P.charge = 8; P.inv[i] = null; fx.push({ type: 'text', x: P.x, y: P.y - 20, txt: 'ЭЛЕКТРОД ЗАРЯЖЕН', life: 1, c: '#6cf' }); }
}

function collide(o, w, h) {
  o.ground = false;
  for (const p of plats) {
    if (o.x + w > p.x && o.x < p.x + p.w && o.vy >= 0 && o.y + h >= p.y && o.y + h - o.vy * (1 / 60) - 2 <= p.y) {
      o.y = p.y - h; o.vy = 0; o.ground = true;
    }
  }
}

function update(dt) {
  t += dt;
  for (const f of fx) { f.life -= dt; f.y -= dt * 30; }
  fx = fx.filter(f => f.life > 0);
  if (state !== 'play') return;

  // игрок
  const sp = 190;
  P.vx = (key.right - key.left) * sp;
  if (P.vx) P.dir = Math.sign(P.vx);
  if (key.jump && P.ground) { P.vy = -560; P.ground = false; }
  P.vy += GRAV * dt;
  P.x = Math.max(0, Math.min(LEVEL_W - P.w, P.x + P.vx * dt));
  P.y += P.vy * dt;
  collide(P, P.w, P.h);
  P.cd -= dt; P.swing -= dt; P.hurt -= dt; P.charge -= dt;

  // удар электродом
  if (key.attack && P.cd <= 0 && P.inv.includes('электрод')) {
    P.cd = .35; P.swing = .18; zap(); shout();
    const reach = P.charge > 0 ? 70 : 42, dmg = P.charge > 0 ? 3 : 1;
    const hx = P.dir > 0 ? P.x + P.w : P.x - reach;
    for (const c of cubes) {
      if (c.x + c.s > hx && c.x < hx + reach && c.y + c.s > P.y - 6 && c.y < P.y + P.h) {
        c.hp -= dmg; c.hit = .2; c.vx = P.dir * Math.abs(c.vx); c.vy = -250; c.x += P.dir * 16;
        for (let i = 0; i < 8; i++) fx.push({ type: 'spark', x: c.x + c.s / 2, y: c.y + c.s / 2, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300, life: .4 });
      }
    }
  }

  // кубы
  for (const c of cubes) {
    const near = Math.abs(c.x - P.x) < 260;
    if (near) c.vx = Math.sign(P.x - c.x || 1) * 85;
    c.jumpT -= dt;
    if (c.ground && c.jumpT <= 0) { c.vy = -380; c.jumpT = 1.5 + Math.random() * 2; }
    c.vy += GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.hit -= dt;
    collide(c, c.s, c.s);
    if (c.x < 0 || c.x > LEVEL_W - c.s) c.vx *= -1;
    if (c.y > 400) c.hp = 0;
    // урон игроку
    if (P.hurt <= 0 && c.x < P.x + P.w && c.x + c.s > P.x && c.y < P.y + P.h && c.y + c.s > P.y) {
      P.hp -= 15; P.hurt = .8; P.vy = -300; P.x += Math.sign(P.x - c.x || 1) * 20;
      fx.push({ type: 'text', x: P.x, y: P.y - 20, txt: '-15', life: .8, c: '#f55' });
    }
  }
  for (const c of cubes) if (c.hp <= 0) {
    kills++;
    for (let i = 0; i < 20; i++) fx.push({ type: 'spark', x: c.x + c.s / 2, y: c.y + c.s / 2, vx: (Math.random() - .5) * 500, vy: (Math.random() - .5) * 500, life: .6 });
    if (Math.random() < .3) loot.push({ x: c.x, y: c.y, item: Math.random() < .5 ? 'аптечка' : 'батарейка', vy: 0 });
  }
  cubes = cubes.filter(c => c.hp > 0);
  for (const f of fx) if (f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; }

  // подбор лута
  loot = loot.filter(l => {
    if (Math.abs(l.x - P.x) < 26 && Math.abs(l.y - P.y) < 40) {
      const slot = P.inv.indexOf(null);
      if (slot < 0) return true;
      P.inv[slot] = l.item;
      fx.push({ type: 'text', x: P.x, y: P.y - 20, txt: '+ ' + l.item, life: 1, c: '#ff6' });
      return false;
    }
    return true;
  });

  if (P.hp <= 0 || P.y > 420) { P.hp = 0; state = 'dead'; }
  if (P.x > LEVEL_W - 80) state = 'win';
  camX += (Math.max(0, Math.min(LEVEL_W - W / S, P.x - W / S / 2.5)) - camX) * Math.min(1, dt * 6);
}

// --- отрисовка ---
function draw() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1024'); g.addColorStop(1, '#05050a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.scale(S, S);

  // фон: дальние башни (параллакс)
  ctx.fillStyle = '#16131f';
  for (let i = 0; i < 40; i++) { const x = i * 140 - camX * .3 % 140; ctx.fillRect(x, 120 + (i * 53 % 90), 80, 300); }
  ctx.translate(-camX, 0);

  for (const p of plats) {
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#5d5d6c'; ctx.fillRect(p.x, p.y, p.w, 3);
  }
  // финиш
  ctx.fillStyle = '#6f6'; ctx.fillRect(LEVEL_W - 60, 250, 6, 70);
  ctx.fillRect(LEVEL_W - 54, 250, 30, 18);

  // лут
  for (const l of loot) {
    const y = l.y + Math.sin(t * 4 + l.x) * 3;
    ctx.fillStyle = l.item === 'аптечка' ? '#e33' : '#3cf';
    ctx.fillRect(l.x, y, 16, 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(l.item === 'аптечка' ? '+' : '⚡', l.x + 8, y + 13);
  }

  // кубы
  for (const c of cubes) {
    ctx.fillStyle = c.hit > 0 ? '#fff' : '#b0172a';
    ctx.fillRect(c.x, c.y, c.s, c.s);
    ctx.strokeStyle = '#300'; ctx.lineWidth = 2; ctx.strokeRect(c.x, c.y, c.s, c.s);
    ctx.fillStyle = '#ff0'; // злые глаза
    ctx.fillRect(c.x + 7, c.y + 6, 6, 4); ctx.fillRect(c.x + c.s - 13, c.y + 6, 6, 4);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ЗЛОЙ', c.x + c.s / 2, c.y + 20); ctx.fillText('ХОМЯК', c.x + c.s / 2, c.y + 28);
  }

  // игрок
  if (!(P.hurt > 0 && Math.floor(t * 20) % 2)) {
    ctx.fillStyle = '#2b6cd4'; ctx.fillRect(P.x, P.y + 12, P.w, P.h - 12);
    ctx.fillStyle = '#f0c8a0'; ctx.fillRect(P.x + 3, P.y, P.w - 6, 13);
    ctx.fillStyle = '#000'; ctx.fillRect(P.x + (P.dir > 0 ? 12 : 5), P.y + 4, 3, 3);
    // электрод
    const ex = P.dir > 0 ? P.x + P.w : P.x, len = P.swing > 0 ? (P.charge > 0 ? 60 : 36) : 14;
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(ex, P.y + 20); ctx.lineTo(ex + P.dir * len, P.y + 20 - (P.swing > 0 ? 0 : 8)); ctx.stroke();
    if (P.swing > 0) { // молния
      ctx.strokeStyle = P.charge > 0 ? '#6cf' : '#ffe066'; ctx.lineWidth = 2; ctx.beginPath();
      let x = ex + P.dir * len, y = P.y + 20; ctx.moveTo(x, y);
      for (let i = 0; i < 5; i++) { x += P.dir * 6; y += (Math.random() - .5) * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }

  // эффекты
  for (const f of fx) {
    if (f.type === 'spark') { ctx.fillStyle = '#ffe066'; ctx.fillRect(f.x, f.y, 3, 3); }
    else {
      ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.c || '#ff3';
      ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x + 11, f.y);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // HUD: хп и инвентарь
  ctx.save(); ctx.scale(S, S);
  ctx.fillStyle = '#000a'; ctx.fillRect(8, 8, 132, 28);
  ctx.fillStyle = '#511'; ctx.fillRect(12, 14, 124, 16);
  ctx.fillStyle = '#e33'; ctx.fillRect(12, 14, 124 * Math.max(0, P.hp) / P.maxHp, 16);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`ХП ${Math.max(0, P.hp)}`, 74, 26);
  const icon = { 'электрод': ['#aaa', '⚡'], 'аптечка': ['#e33', '+'], 'батарейка': ['#3cf', '🔋'] };
  for (let i = 0; i < 4; i++) {
    const x = 150 + i * 30;
    ctx.fillStyle = '#000a'; ctx.fillRect(x, 8, 28, 28);
    ctx.strokeStyle = '#fff4'; ctx.strokeRect(x, 8, 28, 28);
    const it = P.inv[i];
    if (it) { ctx.fillStyle = icon[it][0]; ctx.fillRect(x + 5, 13, 18, 18); ctx.fillStyle = '#fff'; ctx.fillText(icon[it][1], x + 14, 27); }
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(`Кубов убито: ${kills}`, 280, 26);
  if (P.charge > 0) { ctx.fillStyle = '#6cf'; ctx.fillText(`Заряд ${P.charge.toFixed(1)}с`, 390, 26); }

  if (state !== 'play') {
    ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, W / S, 360);
    ctx.fillStyle = state === 'win' ? '#6f6' : '#f44'; ctx.textAlign = 'center'; ctx.font = 'bold 36px sans-serif';
    ctx.fillText(state === 'win' ? 'ПОБЕДА! ГОЙДА!' : 'ТЫ ПОГИБ', W / S / 2, 160);
    ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
    ctx.fillText('Коснись экрана, чтобы начать заново', W / S / 2, 200);
  }
  ctx.restore();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  update(dt); draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
