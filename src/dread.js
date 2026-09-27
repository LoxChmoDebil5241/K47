import * as THREE from 'three';
import { sfx } from './audio.js';

// Страх темноты. Пока взгляд в темноте — экран краснеет, в самой комнате (в тёмном углу)
// проступают дрожащие пиксельные фразы, каждая печатается со своей скоростью.
// Отвернулся — буквы резко рассыпаются. На пике — выстрел, падение на пол, заставка.
export const DARK_THOUGHTS = [
  'Не сейчас... Не сейчас...', 'Сколько их было?', 'Кто это?', 'Они знают.', 'Это не моя комната.',
  'Кто оставил фото?', 'Он ещё здесь.', 'Я слышу дыхание.', 'Это не сон.', 'Надо выбраться.',
  'Свет не настоящий.', 'Что-то не так.', 'За стеной ходят.', 'Не оборачивайся.', 'Последний раз.',
  'ОН ЗА СПИНОЙ', 'ОБЕРНИСЬ', 'ШАГИ...', 'ОН ЖДЁТ', 'СЗАДИ', 'Не дыши.', 'Тише.', 'Уходи.',
  'Там кто-то есть.', 'Смотрит.', 'Не моргай.', 'Я не один.', 'Холодно...', 'Кто стучал?',
  'Это был я?', 'Номер сорок семь.', 'ОНИ ИДУТ', 'Не смотри туда.', 'Пусти.', 'Хватит.',
  'Я помню это.', 'Опять.', 'Снова цикл.', 'Кто ты?', 'ПОЗДНО',
  'Не смотри.', 'Оно ближе.', 'Кто дышит?', 'Я слышал.', 'Не здесь.', 'ТЫ ВИДИШЬ?', 'Стой.',
  'Там глаза.', 'Он улыбается.', 'Не шевелись.', 'Кто зовёт?', 'ОТВЕРНИСЬ', 'Уже близко.', 'Это конец?', 'Мне страшно.',
];
const RISE = 12;         // секунд темноты до выстрела
const LINGER = 1;        // сколько фразы висят после того, как отвернулся
const THOUGHTS_AT = 0.15;
const CELL = 32;         // ширина буквы на холсте (моноширинный пиксельный шрифт)
const FONT = `26px "Press Start 2P", monospace`;
const LETTER_M = 0.07;   // размер буквы в мире, м

// одна фраза: строка букв-плоскостей, общая текстура, у каждой буквы свой кусок UV
function makeThought(text) {
  const c = document.createElement('canvas'); c.width = CELL * text.length; c.height = 40;
  const g = c.getContext('2d');
  g.font = FONT; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.shadowColor = '#ff0020'; g.shadowBlur = 8; g.fillStyle = '#ff3a52';
  [...text].forEach((ch, i) => g.fillText(ch, i * CELL + CELL / 2, 21));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
  const group = new THREE.Group();
  const letters = [...text].map((ch, i) => {
    const geo = new THREE.PlaneGeometry(LETTER_M, LETTER_M * 1.25);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / text.length);
    const m = new THREE.Mesh(geo, mat);
    m.position.x = (i - (text.length - 1) / 2) * LETTER_M;
    m.visible = false; m.renderOrder = 20;
    group.add(m);
    return { m, home: m.position.clone(), vel: new THREE.Vector3(), spin: 0, ch };
  });
  return { group, letters, mat, tex, text };
}

export function createDread(scene, camera, onDeath, secret) {
  const veil = document.createElement('div'); veil.id = 'dread'; document.body.appendChild(veil);
  const flash = document.createElement('div'); flash.id = 'shot'; document.body.appendChild(flash);
  const st = { level: 0, dying: 0, nextBeat: 0, nextThought: 0 };
  const thoughts = [];
  const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();

  function spawn(forced) {
    const text = forced || DARK_THOUGHTS[Math.floor(Math.random() * DARK_THOUGHTS.length)];
    const th = makeThought(text);
    // место — впереди, в той темноте, куда смотрит игрок: 1.4–2.6 м, с разбросом по кадру
    camera.getWorldDirection(dir);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    // треть фраз — прямо перед лицом, остальные — разбросаны по комнате
    const close = !forced && Math.random() < 0.35;
    const d = forced ? 1.6 : close ? 1.3 + Math.random() * 0.4 : 2.0 + Math.random() * 1.8;
    const spread = close ? 0.35 : 1;
    th.group.position.copy(camera.position).addScaledVector(dir, d)
      .addScaledVector(right, (Math.random() - 0.5) * d * 0.9 * spread).addScaledVector(up, (Math.random() - 0.4) * d * 0.7 * spread);
    th.group.quaternion.copy(camera.quaternion);
    th.group.rotateZ((Math.random() - 0.5) * 0.25);
    th.group.scale.setScalar(forced ? 2.2 : 0.9 + Math.random() * 1.0);
    th.cps = Math.random() < 0.4 ? 3 + Math.random() * 4 : 12 + Math.random() * 20; // одни ползут, другие вспыхивают
    th.shown = 0; th.age = 0; th.shake = 0.004 + Math.random() * 0.01; th.scatter = 0;
    th.voice = Math.random() < 0.5;
    if (forced) { th.cps = 4; th.shake = 0.006; th.voice = true; th.secret = true; }
    scene.add(th.group); thoughts.push(th);
  }

  function scatterAll() {
    for (const th of thoughts) if (!th.scatter) {
      th.scatter = 0.001;
      for (const L of th.letters) {
        L.vel.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.2) * 1.4, (Math.random() - 0.5) * 1.2);
        L.spin = (Math.random() - 0.5) * 20;
      }
    }
  }
  function dispose(th) { scene.remove(th.group); th.tex.dispose(); th.mat.dispose(); th.letters.forEach((L) => L.m.geometry.dispose()); }

  function die() {
    st.dying = 0.0001;
    scatterAll();
    sfx.gunshot();
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 90);
    setTimeout(onDeath, 2200);
  }

  return {
    get level() { return st.level; },
    get dying() { return st.dying > 0; },
    // codeOnly — у терминала: в темноте слева проступает только код, без мыслей и без гибели
    update(dt, t, dark, codeOnly = false) {
      if (st.dying) {
        st.dying += dt;
        veil.style.opacity = '1';
      } else {
        st.level = Math.max(0, Math.min(codeOnly ? 0.45 : 1, st.level + (dark ? dt / RISE : -dt / 1.2)));
        const l = st.level;
        veil.style.opacity = String(Math.min(1, l * 1.15));
        veil.style.setProperty('--pulse', String(0.5 + 0.5 * Math.sin(t * (4 + l * 8))));
        if (l > 0.05 && t > st.nextBeat) { sfx.heartbeat(l); st.nextBeat = t + 1.0 - l * 0.65; }
        // часть кода: на 4-й секунде темноты медленно проступают четыре цифры
        st.darkT = dark ? (st.darkT || 0) + dt : 0;
        if (codeOnly && secret && st.darkT >= 4 && !st.secretShown) { st.secretShown = true; spawn(secret); sfx.whisper(); }
        if (!dark) st.secretShown = false;
        if (!codeOnly && dark && l > THOUGHTS_AT && t > st.nextThought && thoughts.length < 14) {
          spawn();
          if (Math.random() < 0.25) sfx.whisper();
          st.nextThought = t + (0.9 - l * 0.6) * (0.5 + Math.random());
        }
        // отвернулся — фразы ещё висят секунду, потом рассыпаются
        st.away = dark ? 0 : (st.away || 0) + dt;
        if (st.away > LINGER) scatterAll();
        if (l >= 1 && !codeOnly) die();
      }
      // буквы: печать, дрожь, рассыпание
      for (let i = thoughts.length - 1; i >= 0; i--) {
        const th = thoughts[i];
        th.age += dt;
        if (th.scatter) {
          th.scatter += dt;
          th.mat.opacity = Math.max(0, 1 - th.scatter / 0.45);
          for (const L of th.letters) {
            L.vel.y -= 2.5 * dt;
            L.m.position.addScaledVector(L.vel, dt * 0.5);
            L.m.rotation.z += L.spin * dt;
          }
          if (th.scatter > 0.45) { dispose(th); thoughts.splice(i, 1); }
          continue;
        }
        const before = Math.floor(th.shown);
        th.shown = Math.min(th.letters.length, th.shown + th.cps * dt);
        for (let k = before; k < Math.floor(th.shown); k++) { th.letters[k].m.visible = true; if (th.voice) sfx.talk(th.letters[k].ch); }
        const s = th.shake * (1 + st.level * 2);
        for (const L of th.letters) L.m.position.set(L.home.x + (Math.random() - 0.5) * s, L.home.y + (Math.random() - 0.5) * s, 0);
      }
    },
    // падение на пол после выстрела: камера валится вбок и вниз
    applyCamera(cam) {
      if (!st.dying) return;
      const k = Math.min(1, st.dying / 0.55), e = k * k;
      cam.position.y -= e * (cam.position.y - 0.12);
      cam.rotateZ(e * 1.35);
      cam.rotateX(-e * 0.35);
    },
  };
}

