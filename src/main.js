import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildRoom } from './room.js';
import { Terminal } from './terminal.js';
import { VIEWS, BARS, HINTS, KEYS, FREE_LOOK, TAPS, TAP_SOUND } from './views.js';
import { sfx, unlockAudio, startAmbience } from './audio.js';
import { save, stickyCode } from './state.js';
import { runBoot } from './ui/boot.js';
import { setupMenu } from './ui/menu.js';
import { setupNotebookUI } from './ui/notebookUI.js';
import { RPK_TOTAL } from './props/jar.js';
import book from './story/book.json';

// ---------- рендер ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true; // створки шлюза обрезаются, когда уезжают в стену

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x020203, 0.07);

const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 60);
const terminal = new Terminal(book);
const room = buildRoom(scene, terminal.texture, { code: stickyCode(), eaten: save.get('rpkEaten', 0) });
const { desk } = room;

// «глаза привыкли»: мягкий нейтральный свет у лица, когда рассматриваем предмет вблизи
const inspectLight = new THREE.PointLight(0xe4e8f4, 0, 2, 2);
scene.add(inspectLight);
// сила подсветки подобрана под каждый предмет: светлая бумага — чуть-чуть, банка в тени — сильнее
const INSPECT = { note: 0.015, photo: 0.06, radio: 0.08, headset: 0.04, jar: 0.2, notebook: 0.03 };

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.55));
composer.addPass(new OutputPass());

const ui = document.getElementById('ui');
ui.hidden = true;
const game = { started: false, paused: false };

// ---------- позы камеры ----------
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
// вид → { pos, look, up }: для видов на предмет — от положения самого предмета
function resolve(name) {
  const v = VIEWS[name];
  if (!v.anchor) return { pos: v.pos.clone(), look: v.look.clone(), up: v.up || UP, fit: v.fit, custom: !!v.up };
  const a = room.anchors[v.anchor];
  a.updateWorldMatrix(true, false);
  const look = v.lookOffset ? a.localToWorld(tmpV.set(...v.lookOffset)).clone() : a.getWorldPosition(new THREE.Vector3());
  const pos = v.local ? a.localToWorld(new THREE.Vector3(...v.offset)) : look.clone().add(new THREE.Vector3(...v.offset));
  return { pos, look, up: v.up || UP, fit: v.fit, custom: !!v.up };
}
function poseQuat(p) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, p.look, p.up));
}
// для видов с fit — отъехать так, чтобы объект влез в кадр по ширине и высоте
function posePos(p) {
  if (!p.fit) return p.pos.clone();
  const [fw, fh] = p.fit;
  // вписываем в свободную область над кнопками: её высота h − ui из полной высоты кадра h + ui
  const w = innerWidth, h = innerHeight, u = uiTarget;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tvH = tv * (h - u) / (h + u), tvW = tv * w / (h + u);
  const dist = Math.max(fh / 2 / tvH, fw / 2 / tvW) * 1.08;
  return p.look.clone().addScaledVector(p.pos.clone().sub(p.look).normalize(), dist);
}

let view = 'outside';
const lookE = new THREE.Euler(0, 0, 0, 'YXZ');
const start = resolve('outside');
const move = { fromPos: new THREE.Vector3(), fromQ: new THREE.Quaternion(), toPos: new THREE.Vector3(), toQ: poseQuat(start), t: 1, dur: 1, id: 0 };
const basePos = new THREE.Vector3(), baseQ = move.toQ.clone();

// центр кадра — посередине свободной области над кнопками, а не посередине экрана
// высота панели меняется плавно, чтобы кадр не прыгал при смене набора кнопок
let uiH = 0, uiTarget = 0;
function applyOffset() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / (h + uiH);
  camera.fov = w < h ? 88 : 62; // в портрете шире, чтобы предметы помещались
  camera.setViewOffset(w, h + uiH, 0, uiH, w, h);
  camera.updateProjectionMatrix();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  uiTarget = ui.hidden ? 0 : Math.min(h * 0.4, ui.getBoundingClientRect().height);
  if (!game.started || Math.abs(uiTarget - uiH) > h * 0.3) uiH = uiTarget;
  applyOffset();
  move.toPos.copy(posePos(resolve(view)));
  if (move.t >= 1) basePos.copy(move.toPos);
}
addEventListener('resize', resize);
resize();

// шрифты на canvas-текстурах — перерисовать, когда загрузятся
Promise.all(['16px "Press Start 2P"', '16px "PT Mono"', '30px "Caveat"'].map((f) => document.fonts?.load(f, 'АБВ'))).then(() => {
  terminal.dirty = true; desk.refreshFonts(); desk.notebook.setPage(...notebookUI.current());
});

// ---------- состояние игры ----------
const uiState = () => ({ door: room.airlock.state, jar: desk.jar });
const bar = document.getElementById('bar');
const hint = document.getElementById('hint');

const notebookUI = setupNotebookUI({
  onPage: (text, n) => desk.notebook.setPage(text, n),
  onClose: () => go('deskClose', 'paper'),
});
desk.notebook.setPage(...notebookUI.current());

const menu = setupMenu({ onPause: () => (game.paused = true), onResume: () => (game.paused = false) });

// ---------- переходы между видами ----------
const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;           // синусоида: мягкий разгон и торможение
const fwd = new THREE.Vector3();
function yawPitch(q) {
  fwd.set(0, 0, -1).applyQuaternion(q);
  return { yaw: Math.atan2(-fwd.x, -fwd.z), pitch: Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) };
}

// что делать при входе в вид и выходе из него
const ENTER = {
  terminal() {
    terminal.active = true;
    if (!terminal.booted) { terminal.booted = true; setTimeout(() => sfx.boot(), 500); }
  },
  notebook(dur) {
    desk.notebook.open();
    setTimeout(() => { if (view === 'notebook') notebookUI.open(); }, dur * 1000 + 250);
  },
  jar() {
    const p = resolve('jar');
    desk.jar.pickUp(p.pos.clone().add(p.look.clone().sub(p.pos).normalize().multiplyScalar(VIEWS.jar.hold)).add(tmpV.set(0, -0.04, 0)));
  },
};
const LEAVE = {
  terminal() { terminal.active = false; },
  notebook() { notebookUI.close(); desk.notebook.close(); },
  jar() { desk.jar.putDown(); save.set('rpkEaten', desk.jar.eaten); },
};

// шаги во время перемещения: по одному на ~полметра пути
let stepTimers = [];
function footsteps(dist, dur) {
  stepTimers.forEach(clearTimeout); stepTimers = [];
  const n = Math.max(2, Math.round(dist / 0.5));
  for (let i = 0; i < n; i++) stepTimers.push(setTimeout(() => sfx.step(i), (0.1 + 0.8 * (i / Math.max(1, n - 1))) * dur * 1000));
}

const ACTIONS = {
  door() { if (room.airlock.toggle()) { sfx.airlock(room.airlock.state.open); renderBar(); } },
  lid() { sfx.lid(desk.jar.toggleLid()); renderBar(); },
  eat() {
    if (!desk.jar.isOpen) { sfx.denied(); return; }
    if (desk.jar.eat()) { sfx.crunch(); save.set('rpkEaten', desk.jar.eaten); } else sfx.empty();
    renderBar();
  },
  ptt() { desk.radio.ptt(); sfx.ptt(); },
};

function go(name, sound) {
  if (name?.[0] === '@') return ACTIONS[name.slice(1)]?.();
  if (!VIEWS[name] || name === view) return;
  const from = view;
  LEAVE[from]?.();
  view = name;
  const p = resolve(name), fromCustom = resolve(from).custom;
  move.fromPos.copy(basePos); move.fromQ.copy(baseQ);
  move.toPos.copy(posePos(p)); move.toQ.copy(poseQuat(p));
  // поворот головы — рысканье и тангаж отдельно, без крена; для взгляда сверху — обычный slerp
  move.euler = !p.custom && !fromCustom;
  if (move.euler) {
    const a = yawPitch(move.fromQ), b = yawPitch(move.toQ);
    const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    Object.assign(move, { y0: a.yaw, dy, p0: a.pitch, dp: b.pitch - a.pitch });
  }
  const angle = move.fromQ.angleTo(move.toQ), dist = move.fromPos.distanceTo(move.toPos);
  move.dur = 0.8 + angle * 0.6 + dist * 0.75;
  move.dist = dist; move.t = 0;
  look.x = look.y = 0;
  // звук перехода: поворот — шорох и скрип, подход/отход — шаги
  if (sound === 'step') { footsteps(dist, move.dur); sfx.whoosh(move.dur); if (angle > 0.5) sfx.turn(move.dur); }
  else if (sound === 'turn') { sfx.turn(move.dur); sfx.whoosh(move.dur); }
  else sfx[sound]?.();
  ENTER[name]?.(move.dur);
  renderBar();
}

function renderBar() {
  bar.innerHTML = '';
  const s = uiState();
  for (const row of BARS[view]) {
    const r = document.createElement('div'); r.className = 'row';
    for (const [label, to, sound] of row) {
      const b = document.createElement('button');
      b.className = 'px';
      b.textContent = typeof label === 'function' ? label(s) : label;
      if (to === '@eat' && desk.jar.eaten >= RPK_TOTAL) b.disabled = true;
      b.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); if (!sound || sound === 'turn' || sound === 'step') sfx.click(); go(to, sound); });
      r.appendChild(b);
    }
    bar.appendChild(r);
  }
  if (!ui.hidden) requestAnimationFrame(resize);
  const hv = HINTS[view];
  hint.textContent = typeof hv === 'function' ? hv(s) : hv || '';
}
renderBar();

addEventListener('keydown', (e) => {
  if (!game.started || game.paused || e.target.tagName === 'TEXTAREA') return;
  const to = KEYS[view]?.[e.key];
  if (!to) return;
  const defs = BARS[view].flat();
  const i = defs.findIndex((x) => x[1] === to);
  const btn = bar.querySelectorAll('button')[i];
  btn?.classList.add('pressed'); setTimeout(() => btn?.classList.remove('pressed'), 140);
  sfx.click(); go(to, defs[i]?.[2] ?? TAP_SOUND[to]);
});

// ---------- касания: осмотр пальцем, вращение банки, нажатия по предметам ----------
const look = { x: 0, y: 0 };          // смещение взгляда от вида (рад); остаётся, пока не сменится вид
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitList = Object.values(room.hits);
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hitList, false)[0];
  if (!hit) return null;
  hit.name = Object.keys(room.hits).find((k) => room.hits[k] === hit.object);
  return hit;
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!game.started || game.paused) return;
  unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0, acc: 0 };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  const k = 2 / Math.min(innerWidth, innerHeight);
  if (view === 'terminal') {
    drag.acc += dy;
    while (Math.abs(drag.acc) > 36) { terminal.scroll(drag.acc > 0 ? -1 : 1); drag.acc -= Math.sign(drag.acc) * 36; }
    return;
  }
  if (view === 'jar') { desk.jar.rotate(dx * k * 2, dy * k); return; }
  const f = FREE_LOOK[view];
  if (!f) return;
  look.x = THREE.MathUtils.clamp(look.x + dx * k, -0.7 * f, 0.7 * f);
  look.y = THREE.MathUtils.clamp(look.y + dy * k, -0.45 * f, 0.45 * f);
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const tap = drag.moved < 10;
  drag = null;
  if (!tap || move.t < 1) return;
  const hit = pick(e.clientX, e.clientY);
  const to = hit && TAPS[view]?.[hit.name];
  if (!to) return;
  if (to === '@terminal') return terminal.tap(hit.uv.x, hit.uv.y);
  if (to[0] !== '@') sfx.click();
  go(to, view === 'desk' ? 'step' : TAP_SOUND[to]);
});
canvas.addEventListener('wheel', (e) => { if (view === 'terminal') terminal.scroll(Math.sign(e.deltaY)); }, { passive: true });

terminal.onKey = () => sfx.key();
terminal.onPage = () => sfx.page();

// ---------- атмосфера ----------
let neonLevel = 1, neonTarget = 1, nextFlicker = 6, nextThud = 30;
function atmosphere(t, dt) {
  if (t > nextFlicker) {
    neonTarget = Math.random() < 0.5 ? 0.05 : 0.4;
    if (game.started) sfx.flicker();
    setTimeout(() => (neonTarget = 1), 60 + Math.random() * 180);
    nextFlicker = t + 3 + Math.random() * 9;
  }
  if (t > nextThud) { if (game.started && !game.paused) sfx.thud(); nextThud = t + 30 + Math.random() * 60; }
  neonLevel += (neonTarget - neonLevel) * Math.min(1, dt * 30);
  room.neonLight.intensity = 3 * neonLevel;
  room.neonMat.color.setRGB(1 * neonLevel, 0.06 * neonLevel, 0.19 * neonLevel);
  const e = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 1.9);
  room.emerg.intensity = 0.5 + 2 * e;
  room.emergBulb.material.color.setRGB(0.4 + 0.6 * e, 0.02, 0.02);
  room.screenLight.intensity = 0.5 + 0.1 * Math.sin(t * 50);
}

// ---------- цикл ----------
const clock = new THREE.Clock();
let wasBusy = false;
const lookQ = new THREE.Quaternion();
const breath = new THREE.Vector3();
const smoothLook = { x: 0, y: 0 };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  terminal.update(dt);
  atmosphere(t, dt);
  room.airlock.update(dt, t);
  desk.update(dt, t);
  if (room.airlock.state.busy !== wasBusy) { wasBusy = room.airlock.state.busy; if (!wasBusy) renderBar(); }

  if (Math.abs(uiTarget - uiH) > 0.5) { uiH += (uiTarget - uiH) * Math.min(1, dt * 4); applyOffset(); }
  if (move.t < 1) {
    move.t = Math.min(1, move.t + dt / move.dur);
    const k = ease(move.t);
    basePos.lerpVectors(move.fromPos, move.toPos, k);
    basePos.y += Math.sin(k * Math.PI) * 0.025 * Math.min(1, move.dist); // лёгкое покачивание при ходьбе
    if (move.euler) baseQ.setFromEuler(lookE.set(move.p0 + move.dp * k, move.y0 + move.dy * k, 0));
    else baseQ.slerpQuaternions(move.fromQ, move.toQ, k);
  }
  // осмотр пальцем — с инерцией, чтобы голова не дёргалась
  smoothLook.x += (look.x - smoothLook.x) * Math.min(1, dt * 10);
  smoothLook.y += (look.y - smoothLook.y) * Math.min(1, dt * 10);
  lookE.set(-smoothLook.y, -smoothLook.x, 0); lookQ.setFromEuler(lookE);
  const still = ['terminal', 'notebook', 'note', 'photo', 'radio', 'headset', 'jar'].includes(view);
  breath.set(0, still ? 0 : Math.sin(t * 1.3) * 0.006, 0);
  camera.position.copy(basePos).add(breath);
  camera.quaternion.copy(baseQ).multiply(lookQ);
  inspectLight.position.copy(camera.position).add(tmpV.set(0, 0.08, 0));
  inspectLight.intensity += ((move.t > 0.6 ? INSPECT[view] || 0 : 0) - inspectLight.intensity) * Math.min(1, dt * 3);

  composer.render();
  requestAnimationFrame(frame);
}
basePos.copy(move.toPos);
frame();

// для автотестов: экранные координаты предмета (0..1)
window.__k47 = {
  where(name) {
    const o = room.hits[name]; if (!o) return null;
    const v = o.getWorldPosition(new THREE.Vector3()).project(camera);
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  },
  get view() { return view; },
  get moving() { return move.t < 1; },
};

// ---------- заставка → комната ----------
runBoot(() => {
  game.started = true;
  startAmbience();
  document.getElementById('fade').classList.add('off');
  setTimeout(() => { ui.hidden = false; menu.show(); resize(); }, 900);
});
