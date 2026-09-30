// 3D-платформер «Кубы»: игрок с хп и инвентарём бьёт злых кубов электродом.
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('pf'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1026);
scene.fog = new THREE.Fog(0x1a1026, 25, 70);
const camera = new THREE.PerspectiveCamera(60, 1, .1, 200);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight(0x9988ff, 0x221122, 1.1));
const sun = new THREE.DirectionalLight(0xffeedd, 2);
sun.position.set(10, 20, 8); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
scene.add(sun, sun.target);

// --- ввод: джойстик, кнопки, клавиатура ---
const key = { jump: false, attack: false }, move = { x: 0, z: 0 }, kb = {};
addEventListener('keydown', e => { kb[e.code] = true; if (/Digit[1-4]/.test(e.code)) useItem(+e.code[5] - 1); });
addEventListener('keyup', e => { kb[e.code] = false; });
for (const b of document.querySelectorAll('#btns button')) {
  const on = v => e => { e.preventDefault(); key[b.dataset.k] = v; b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', on(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, on(false));
}
const stick = $('stick'), knob = $('knob');
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
  const d = Math.hypot(dx, dy), m = 50;
  if (d > m) { dx *= m / d; dy *= m / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  move.x = dx / m; move.z = dy / m;
}
stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(stickId); stickMove(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
for (const ev of ['pointerup', 'pointercancel']) stick.addEventListener(ev, () => { stickId = null; move.x = move.z = 0; knob.style.transform = ''; });
$('over').addEventListener('pointerdown', () => restart());

// --- текстуры ---
function cubeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b0172a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#300'; g.lineWidth = 8; g.strokeRect(0, 0, 128, 128);
  g.fillStyle = '#ff0'; g.fillRect(24, 20, 24, 14); g.fillRect(80, 20, 24, 14);
  g.fillStyle = '#fff'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center';
  g.fillText('ЗЛОЙ', 64, 72); g.fillText('ХОМЯК', 64, 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function gridTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4a58'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#6a6a7c'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const CUBE_MAT = new THREE.MeshStandardMaterial({ map: cubeTex() });
const GRID = gridTex();

// --- уровень: платформы [x, y(верх), z, ширина, глубина] ---
const plats = [];
function plat(x, top, z, w, d, color) {
  const h = top + 2, tex = GRID.clone(); tex.repeat.set(w / 2, d / 2); tex.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, color: color || 0xffffff }));
  m.position.set(x, top - h / 2, z); m.receiveShadow = m.castShadow = true; scene.add(m);
  plats.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top });
}
plat(0, 0, 0, 16, 16);
plat(0, 1.5, -13, 6, 6); plat(6, 3, -20, 5, 5); plat(0, 4.5, -27, 5, 5);
plat(-7, 3, -34, 8, 8); plat(-7, 3, -46, 12, 12);
plat(2, 5, -55, 4, 4); plat(8, 6.5, -60, 4, 4); plat(8, 5, -70, 10, 10);
plat(8, 7, -82, 6, 6, 0x88ff88);
// финиш — светящийся столб
const goal = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 6), new THREE.MeshBasicMaterial({ color: 0x66ff66 }));
goal.position.set(8, 10, -82); scene.add(goal);
const goalLight = new THREE.PointLight(0x66ff66, 30, 15); goalLight.position.copy(goal.position); scene.add(goalLight);

function groundAt(x, z, y) { // высота опоры под точкой (с учётом текущей высоты)
  let best = -Infinity;
  for (const p of plats) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 && p.top <= y + .3 && p.top > best) best = p.top;
  return best;
}

// --- игрок ---
const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.1, .5), new THREE.MeshStandardMaterial({ color: 0x2b6cd4 }));
body.position.y = .95;
const head = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .6), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 }));
head.position.y = 1.8;
const legs = new THREE.Mesh(new THREE.BoxGeometry(.7, .4, .45), new THREE.MeshStandardMaterial({ color: 0x222233 }));
legs.position.y = .2;
const arm = new THREE.Group(); arm.position.set(.5, 1.2, 0);
const rod = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.2), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: .8, roughness: .3 }));
rod.rotation.x = Math.PI / 2; rod.position.z = -.6;
const tip = new THREE.Mesh(new THREE.SphereGeometry(.12), new THREE.MeshBasicMaterial({ color: 0x66ccff }));
tip.position.z = -1.2;
arm.add(rod, tip);
player.add(body, head, legs, arm);
player.traverse(o => o.castShadow = true);
scene.add(player);
const zapLight = new THREE.PointLight(0x88ccff, 0, 8); scene.add(zapLight);

// --- состояние ---
let P, cubes = [], loot = [], sparks = [], state, kills, t = 0, camYaw = 0;
const LOOT = { 'аптечка': [0xee3333, '➕'], 'батарейка': [0x33ccff, '🔋'], 'электрод': [0xaaaaaa, '⚡'] };

function spawnCube(x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), CUBE_MAT.clone());
  m.castShadow = true; m.position.set(x, y + .7, z); scene.add(m);
  cubes.push({ m, vy: 0, hp: 3, hit: 0, jumpT: Math.random() * 2, dir: Math.random() * 6.28, home: new THREE.Vector3(x, y, z) });
}
function spawnLoot(x, y, z, item) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial({ color: LOOT[item][0], emissive: LOOT[item][0], emissiveIntensity: .4 }));
  m.position.set(x, y + .6, z); scene.add(m);
  loot.push({ m, item, y: y + .6 });
}
function restart() {
  for (const c of cubes) scene.remove(c.m);
  for (const l of loot) scene.remove(l.m);
  cubes = []; loot = [];
  P = { pos: new THREE.Vector3(0, 0, 4), vy: 0, ground: true, yaw: Math.PI, hp: 100, inv: ['электрод', 'аптечка', null, null], cd: 0, swing: 0, hurt: 0, charge: 0 };
  [[3, 0, -3], [-4, 0, -5], [-7, 3, -44], [-4, 3, -48], [-10, 3, -46], [8, 5, -68], [10, 5, -72], [6, 5, -71]].forEach(a => spawnCube(...a));
  spawnLoot(6, 3, -20, 'батарейка'); spawnLoot(-7, 3, -34, 'аптечка'); spawnLoot(8, 6.5, -60, 'аптечка');
  state = 'play'; kills = 0; $('over').hidden = true; camYaw = 0;
  renderInv();
}

// --- звук и «ГОЙДА» ---
let ac, lastShout = -9, shoutT = 0;
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
function say(txt, color = '#ff3') {
  const s = $('shout'); s.textContent = txt; s.style.color = color; s.style.opacity = 1; shoutT = .9;
}
function shout() {
  say('ГООООЙДА!');
  if (t - lastShout < 1.2 || !window.speechSynthesis) return;
  lastShout = t;
  const u = new SpeechSynthesisUtterance('Гоооооойда!');
  u.lang = 'ru-RU'; u.rate = .8; u.pitch = .6;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

function renderInv() {
  $('inv').innerHTML = '';
  P.inv.forEach((it, i) => {
    const d = document.createElement('div'); d.textContent = it ? LOOT[it][1] : '';
    d.addEventListener('pointerdown', e => { e.stopPropagation(); useItem(i); });
    $('inv').append(d);
  });
}
function useItem(i) {
  const it = P.inv[i];
  if (!it || state !== 'play') return;
  if (it === 'аптечка' && P.hp < 100) { P.hp = Math.min(100, P.hp + 40); P.inv[i] = null; say('+40 ХП', '#6f6'); }
  if (it === 'батарейка') { P.charge = 8; P.inv[i] = null; say('ЗАРЯД!', '#6cf'); }
  renderInv();
}

function burst(pos, n, color) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos); scene.add(m);
    sparks.push({ m, v: new THREE.Vector3(Math.random() - .5, Math.random(), Math.random() - .5).multiplyScalar(10), life: .6 });
  }
}

const GRAV = 28, tmp = new THREE.Vector3();
function update(dt) {
  t += dt;
  if ((shoutT -= dt) <= 0) $('shout').style.opacity = 0;
  sparks = sparks.filter(s => {
    s.life -= dt; s.v.y -= GRAV * dt; s.m.position.addScaledVector(s.v, dt);
    if (s.life <= 0) { scene.remove(s.m); return false; } return true;
  });
  goal.rotation.y += dt;
  if (state !== 'play') return;

  // движение относительно камеры
  let mx = move.x + ((kb.KeyD || kb.ArrowRight) ? 1 : 0) - ((kb.KeyA || kb.ArrowLeft) ? 1 : 0);
  let mz = move.z + ((kb.KeyS || kb.ArrowDown) ? 1 : 0) - ((kb.KeyW || kb.ArrowUp) ? 1 : 0);
  const len = Math.hypot(mx, mz);
  if (len > .1) {
    if (len > 1) { mx /= len; mz /= len; }
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    const wx = mx * c + mz * s, wz = -mx * s + mz * c;
    P.pos.x += wx * 7 * dt; P.pos.z += wz * 7 * dt;
    P.yaw = Math.atan2(-wx, -wz);
    legs.scale.y = 1 + Math.sin(t * 15) * .2;
  }
  // камера медленно доворачивает за игроком
  if (len > .1 && Math.abs(mx) > .3) camYaw += Math.sin(P.yaw - camYaw) * dt * 1.2;

  if ((key.jump || kb.Space) && P.ground) { P.vy = 11; P.ground = false; }
  P.vy -= GRAV * dt;
  const gy = groundAt(P.pos.x, P.pos.z, P.pos.y);
  P.pos.y += P.vy * dt;
  if (P.pos.y <= gy) { P.pos.y = gy; P.vy = 0; P.ground = true; } else P.ground = false;
  P.cd -= dt; P.swing -= dt; P.hurt -= dt; P.charge -= dt;

  // удар электродом
  arm.rotation.x = P.swing > 0 ? -.3 : .6;
  zapLight.intensity = P.swing > 0 ? 40 : 0;
  tip.material.color.set(P.charge > 0 ? 0x66ccff : 0xffee66);
  if ((key.attack || kb.KeyF || kb.KeyJ) && P.cd <= 0) {
    P.cd = .35; P.swing = .15; zap(); shout();
    const reach = P.charge > 0 ? 3.5 : 2.2, dmg = P.charge > 0 ? 3 : 1;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    tip.getWorldPosition(zapLight.position);
    burst(zapLight.position, 10, P.charge > 0 ? 0x66ccff : 0xffee66);
    for (const c of cubes) {
      tmp.subVectors(c.m.position, P.pos);
      const dist = Math.hypot(tmp.x, tmp.z), dot = (tmp.x * fx + tmp.z * fz) / (dist || 1);
      if (dist < reach && dot > .3 && Math.abs(tmp.y - .7) < 2) {
        c.hp -= dmg; c.hit = .2; c.vy = 7;
        c.m.position.x += fx * 1.2; c.m.position.z += fz * 1.2;
        burst(c.m.position, 12, 0xffee66);
      }
    }
  }

  // кубы
  for (const c of cubes) {
    const p = c.m.position;
    tmp.subVectors(P.pos, p); tmp.y = 0;
    const d = tmp.length();
    if (d < 9 && Math.abs(P.pos.y - (p.y - .7)) < 3) { tmp.normalize(); c.dir = Math.atan2(tmp.x, tmp.z); }
    else if (p.distanceTo(c.home) > 4) c.dir = Math.atan2(c.home.x - p.x, c.home.z - p.z);
    else c.dir += (Math.random() - .5) * dt * 3;
    const sp = d < 9 ? 3.2 : 1.5;
    const nx = p.x + Math.sin(c.dir) * sp * dt, nz = p.z + Math.cos(c.dir) * sp * dt;
    if (groundAt(nx, nz, p.y - .7) > -Infinity) { p.x = nx; p.z = nz; } // не падает с краёв
    c.m.rotation.y = c.dir;
    c.jumpT -= dt;
    const cg = groundAt(p.x, p.z, p.y - .7);
    if (c.jumpT <= 0 && p.y - .7 <= cg + .01) { c.vy = 8; c.jumpT = 1.5 + Math.random() * 2; }
    c.vy -= GRAV * dt; p.y += c.vy * dt;
    if (p.y - .7 <= cg) { p.y = cg + .7; c.vy = 0; }
    c.hit -= dt;
    c.m.material.emissive.set(c.hit > 0 ? 0xffffff : 0x000000);
    if (p.y < -20) c.hp = 0;
    // урон игроку
    if (P.hurt <= 0 && d < 1.1 && Math.abs(P.pos.y + 1 - p.y) < 1.5) {
      P.hp -= 15; P.hurt = .8; P.vy = 7;
      P.pos.x -= tmp.x * 1.5; P.pos.z -= tmp.z * 1.5;
      say('-15', '#f55');
    }
  }
  cubes = cubes.filter(c => {
    if (c.hp > 0) return true;
    kills++; burst(c.m.position, 30, 0xb0172a); scene.remove(c.m);
    if (Math.random() < .4) spawnLoot(c.m.position.x, c.m.position.y - .7, c.m.position.z, Math.random() < .5 ? 'аптечка' : 'батарейка');
    return false;
  });

  // лут
  loot = loot.filter(l => {
    l.m.rotation.y += dt * 2; l.m.position.y = l.y + Math.sin(t * 3) * .15;
    if (l.m.position.distanceTo(tmp.copy(P.pos).setY(P.pos.y + .6)) < 1.2) {
      const slot = P.inv.indexOf(null);
      if (slot < 0) return true;
      P.inv[slot] = l.item; renderInv(); say('+ ' + l.item, '#ff6'); scene.remove(l.m);
      return false;
    }
    return true;
  });

  if (P.pos.y < -15) P.hp = 0;
  if (P.hp <= 0) end('ТЫ ПОГИБ', '#f44');
  if (Math.hypot(P.pos.x - 8, P.pos.z + 82) < 2.5 && P.pos.y > 6) end('ПОБЕДА! ГОЙДА!', '#6f6');
}
function end(txt, color) {
  state = 'over'; const o = $('over'); o.hidden = false;
  o.querySelector('h1').textContent = txt; o.querySelector('h1').style.color = color;
}

function draw() {
  player.position.copy(P.pos); player.rotation.y = P.yaw;
  player.visible = !(P.hurt > 0 && Math.floor(t * 20) % 2);
  // камера сзади-сверху
  const want = tmp.set(P.pos.x + Math.sin(camYaw) * 8, P.pos.y + 5, P.pos.z + Math.cos(camYaw) * 8);
  camera.position.lerp(want, .1);
  camera.lookAt(P.pos.x, P.pos.y + 1.5, P.pos.z);
  sun.position.set(P.pos.x + 10, P.pos.y + 20, P.pos.z + 8); sun.target.position.copy(P.pos);
  $('hpbar').style.width = Math.max(0, P.hp) + '%';
  $('hptxt').textContent = 'ХП ' + Math.max(0, P.hp);
  $('info').textContent = `Кубов убито: ${kills}` + (P.charge > 0 ? `  ⚡ ${P.charge.toFixed(1)}с` : '');
  renderer.render(scene, camera);
}

restart();
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  update(dt); draw();
});
