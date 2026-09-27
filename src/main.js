import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildRoom } from './room.js';
import { Terminal } from './terminal.js';
import book from './story/book.json';

// ---------- рендер ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x020203, 0.1);

const camera = new THREE.PerspectiveCamera(70, 1, 0.02, 40);
const SEAT = new THREE.Vector3(0, 1.22, 0.35);
camera.position.copy(SEAT);

const terminal = new Terminal(book);
const room = buildRoom(scene, terminal.texture);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // в портретной ориентации расширяем обзор, чтобы терминал помещался
  camera.fov = w < h ? 90 : 70;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- взгляд: поворот головы свайпом / мышью ----------
let yaw = 0, pitch = -0.05;
const PITCH_MAX = 1.0;
let focus = null;          // null | 'terminal' | 'notebook'
let blend = 0;             // 0 — сидим, 1 — приблизились к объекту
const seatQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const focusQ = new THREE.Quaternion();

const backBtn = document.getElementById('back');
const hint = document.getElementById('hint');
let hintTimer = setTimeout(() => hint.classList.add('gone'), 9000);

function setFocus(name) {
  focus = name;
  backBtn.hidden = !name;
  if (name) {
    const f = room.focus[name];
    tmpM.lookAt(f.pos, f.look, new THREE.Vector3(0, 1, 0));
    focusQ.setFromRotationMatrix(tmpM);
  }
}
backBtn.addEventListener('click', (e) => { e.stopPropagation(); setFocus(null); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') setFocus(null); });

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects([room.screen, room.notebook], false)[0];
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (focus === 'terminal') {
    // свайп по экрану терминала листает архив
    drag.acc = (drag.acc || 0) + dy;
    while (Math.abs(drag.acc) > 36) { terminal.scroll(drag.acc > 0 ? -1 : 1); drag.acc -= Math.sign(drag.acc) * 36; }
    return;
  }
  if (focus) return;
  const k = 3.2 / Math.min(innerWidth, innerHeight);
  yaw += dx * k;
  pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch + dy * k));
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const tap = drag.moved < 10;
  drag = null;
  if (!tap) return;
  const hit = pick(e.clientX, e.clientY);
  if (focus === 'terminal') {
    if (hit?.object === room.screen) terminal.tap(hit.uv.x, hit.uv.y);
    else setFocus(null);
  } else if (focus === 'notebook') {
    setFocus(null);
  } else if (hit) {
    setFocus(hit.object === room.screen ? 'terminal' : 'notebook');
    clearTimeout(hintTimer); hint.classList.add('gone');
  }
});
canvas.addEventListener('wheel', (e) => { if (focus === 'terminal') terminal.scroll(Math.sign(e.deltaY)); }, { passive: true });

// ---------- атмосфера ----------
let neonLevel = 1, neonTarget = 1, nextFlicker = 2;
function atmosphere(t, dt) {
  // неон иногда захлёбывается
  if (t > nextFlicker) {
    neonTarget = Math.random() < 0.5 ? 0.05 : 0.4;
    setTimeout(() => (neonTarget = 1), 60 + Math.random() * 180);
    nextFlicker = t + 1.5 + Math.random() * 7;
  }
  neonLevel += (neonTarget - neonLevel) * Math.min(1, dt * 30);
  room.neonLight.intensity = 3 * neonLevel;
  room.neonMat.color.setRGB(1 * neonLevel, 0.06 * neonLevel, 0.19 * neonLevel);
  // далёкая лампа в коридоре медленно дышит
  const e = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 1.9);
  room.emerg.intensity = 0.5 + 2 * e;
  room.emergBulb.material.color.setRGB(0.4 + 0.6 * e, 0.02, 0.02);
  room.screenLight.intensity = 0.5 + 0.1 * Math.sin(t * 50);
}

// ---------- цикл ----------
const clock = new THREE.Clock();
const eye = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  terminal.update(dt);
  atmosphere(t, dt);

  blend += ((focus ? 1 : 0) - blend) * Math.min(1, dt * 5);
  const breathe = Math.sin(t * 1.3) * 0.006;
  seatQ.setFromEuler(new THREE.Euler(-pitch, -yaw, 0, 'YXZ'));
  eye.copy(SEAT).setY(SEAT.y + breathe);
  if (focus || blend > 0.001) {
    const f = focus ? room.focus[focus] : null;
    if (f) camera.position.lerpVectors(eye, f.pos, blend);
    else camera.position.lerp(eye, 1 - blend);
    camera.quaternion.slerpQuaternions(seatQ, focusQ, blend);
  } else {
    camera.position.copy(eye);
    camera.quaternion.copy(seatQ);
  }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
