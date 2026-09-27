import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildRoom } from './room.js';
import { Terminal } from './terminal.js';
import { VIEWS, BARS, HINTS, KEYS, FREE_LOOK, TAPS } from './views.js';
import { sfx, unlockAudio } from './audio.js';
import book from './story/book.json';

// ---------- рендер ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x020203, 0.07);

const camera = new THREE.PerspectiveCamera(70, 1, 0.02, 60);
const terminal = new Terminal(book);
const room = buildRoom(scene, terminal.texture);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.55));
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // в портретной ориентации расширяем обзор, чтобы объекты помещались
  camera.fov = w < h ? 88 : 62;
  camera.updateProjectionMatrix();
  if (typeof view !== 'undefined') { move.toPos.copy(posePos(VIEWS[view])); if (move.t >= 1) basePos.copy(move.toPos); }
}
addEventListener('resize', resize);

// пиксельный шрифт нужен и на canvas терминала — перерисовать, когда загрузится
document.fonts?.load('16px "Press Start 2P"', 'АБВ').then(() => { terminal.dirty = true; });

// ---------- виды и плавные переходы камеры ----------
const UP = new THREE.Vector3(0, 1, 0);
function poseQuat(view) {
  const m = new THREE.Matrix4().lookAt(view.pos, view.look, view.up || UP);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
// позиция камеры: для видов с fit — отъехать так, чтобы объект влез по ширине и высоте
function posePos(view) {
  if (!view.fit) return view.pos.clone();
  const [fw, fh] = view.fit;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = Math.max(fh / 2 / tv, fw / 2 / (tv * camera.aspect));
  const dir = view.pos.clone().sub(view.look).normalize();
  return view.look.clone().addScaledVector(dir, dist);
}
let view = 'outside';
const lookE = new THREE.Euler(0, 0, 0, 'YXZ');
const move = {
  fromPos: new THREE.Vector3(), fromQ: new THREE.Quaternion(),
  toPos: new THREE.Vector3(), toQ: poseQuat(VIEWS.outside), t: 1, dur: 1,
};
const basePos = new THREE.Vector3(), baseQ = move.toQ.clone();

resize();
basePos.copy(move.toPos.copy(posePos(VIEWS.outside)));

const bar = document.getElementById('bar');
const hint = document.getElementById('hint');

// действия, которые не меняют вид
const ACTIONS = {
  door() {
    if (room.airlock.toggle()) { sfx.airlock(room.airlock.state.open); setTimeout(renderBar, 50); }
  },
};

function go(name, sound) {
  if (name?.[0] === '@') return ACTIONS[name.slice(1)]?.();
  if (!VIEWS[name] || name === view) return;
  sfx[sound]?.();
  const from = view;
  view = name;
  move.fromPos.copy(basePos); move.fromQ.copy(baseQ);
  move.toPos.copy(posePos(VIEWS[name])); move.toQ.copy(poseQuat(VIEWS[name]));
  // поворот головы — по рысканью и тангажу отдельно, без крена;
  // для видов со своим «верхом» (блокнот сверху) — обычный slerp
  move.euler = !VIEWS[name].up && !VIEWS[from].up;
  if (move.euler) {
    const a = yawPitch(move.fromQ), b = yawPitch(move.toQ);
    let dy = b.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    Object.assign(move, { y0: a.yaw, dy, p0: a.pitch, dp: b.pitch - a.pitch });
  }
  const angle = move.fromQ.angleTo(move.toQ);
  move.dur = 0.55 + angle * 0.35 + move.fromPos.distanceTo(move.toPos) * 0.5;
  move.t = 0;
  look.x = look.y = 0;
  if (name === 'terminal') {
    terminal.active = true;
    if (!terminal.booted) { terminal.booted = true; setTimeout(() => sfx.boot(), 300); }
  } else if (from === 'terminal') terminal.active = false;
  renderBar();
}

const fwd = new THREE.Vector3();
function yawPitch(q) {
  fwd.set(0, 0, -1).applyQuaternion(q);
  return { yaw: Math.atan2(-fwd.x, -fwd.z), pitch: Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) };
}

function renderBar() {
  bar.innerHTML = '';
  for (const row of BARS[view]) {
    const r = document.createElement('div'); r.className = 'row';
    for (const [label, to, sound, main] of row) {
      const b = document.createElement('button');
      b.className = 'px' + (main ? ' main' : '');
      b.textContent = typeof label === 'function' ? label({ door: room.airlock.state }) : label;
      b.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); sfx.click(); go(to, sound); });
      r.appendChild(b);
    }
    bar.appendChild(r);
  }
  hint.textContent = HINTS[view] || '';
}
renderBar();

addEventListener('keydown', (e) => {
  unlockAudio();
  const to = KEYS[view]?.[e.key];
  if (!to) return;
  const defs = BARS[view].flat();
  const i = defs.findIndex((x) => x[1] === to);
  const btn = bar.querySelectorAll('button')[i];
  btn?.classList.add('pressed'); setTimeout(() => btn?.classList.remove('pressed'), 120);
  sfx.click(); go(to, defs[i]?.[2]);
});

// ---------- касания: осмотр пальцем и нажатия по объектам ----------
const look = { x: 0, y: 0 };          // смещение взгляда от базового вида (рад), сбрасывается при смене вида
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(Object.values(room.hits), false)[0];
  if (!hit) return null;
  hit.name = Object.keys(room.hits).find((k) => room.hits[k] === hit.object);
  return hit;
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0, acc: 0 };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (view === 'terminal') {
    // свайп по экрану терминала листает архив
    drag.acc += dy;
    while (Math.abs(drag.acc) > 36) { terminal.scroll(drag.acc > 0 ? -1 : 1); drag.acc -= Math.sign(drag.acc) * 36; }
    return;
  }
  const f = FREE_LOOK[view];
  if (!f) return;
  const k = 2 / Math.min(innerWidth, innerHeight);
  look.x = Math.max(-0.7 * f, Math.min(0.7 * f, look.x + dx * k));
  look.y = Math.max(-0.45 * f, Math.min(0.45 * f, look.y + dy * k));
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const tap = drag.moved < 10;
  drag = null;
  if (!tap) return;
  const hit = pick(e.clientX, e.clientY);
  const to = hit && TAPS[view]?.[hit.name];
  if (!to) return;
  if (to === '@terminal') return terminal.tap(hit.uv.x, hit.uv.y);
  const sound = to === 'terminal' ? 'enter' : to === 'deskClose' ? 'approach' : to === 'headset' ? 'click' : 'paper';
  go(to, sound);
});
canvas.addEventListener('wheel', (e) => { if (view === 'terminal') terminal.scroll(Math.sign(e.deltaY)); }, { passive: true });

terminal.onKey = () => sfx.key();
terminal.onPage = () => sfx.page();

// ---------- атмосфера ----------
let neonLevel = 1, neonTarget = 1, nextFlicker = 4, nextThud = 25;
function atmosphere(t, dt) {
  // неон иногда захлёбывается
  if (t > nextFlicker) {
    neonTarget = Math.random() < 0.5 ? 0.05 : 0.4;
    sfx.flicker();
    setTimeout(() => (neonTarget = 1), 60 + Math.random() * 180);
    nextFlicker = t + 3 + Math.random() * 9;
  }
  // глухой удар где-то в коридоре
  if (t > nextThud) { sfx.thud(); nextThud = t + 30 + Math.random() * 60; }
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
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lookQ = new THREE.Quaternion();
const breath = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  terminal.update(dt);
  atmosphere(t, dt);
  room.airlock.update(dt, t);
  if (room.airlock.state.busy !== wasBusy) { wasBusy = room.airlock.state.busy; if (!wasBusy) renderBar(); }
  room.radioLed.visible = Math.floor(t * 1.5) % 3 === 0;
  room.micLed.visible = Math.floor(t * 0.8) % 2 === 0;

  if (move.t < 1) {
    move.t = Math.min(1, move.t + dt / move.dur);
    const k = ease(move.t);
    basePos.lerpVectors(move.fromPos, move.toPos, k);
    // при движении вперёд/назад камера слегка «шагает»
    basePos.y += Math.sin(k * Math.PI) * 0.03 * move.fromPos.distanceTo(move.toPos);
    if (move.euler) baseQ.setFromEuler(lookE.set(move.p0 + move.dp * k, move.y0 + move.dy * k, 0));
    else baseQ.slerpQuaternions(move.fromQ, move.toQ, k);
  }
  lookE.set(-look.y, -look.x, 0); lookQ.setFromEuler(lookE);
  const still = view === 'terminal' || view === 'notebook';
  breath.set(0, still ? 0 : Math.sin(t * 1.3) * 0.006, 0);
  camera.position.copy(basePos).add(breath);
  camera.quaternion.copy(baseQ).multiply(lookQ);

  composer.render();
  requestAnimationFrame(frame);
}
frame();
requestAnimationFrame(() => document.getElementById('fade').classList.add('off'));
