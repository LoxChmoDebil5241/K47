import * as THREE from 'three';
import { sfx, storm } from '../audio.js';

// Пролог «Ол-12-П» — разрез коры и раздел влияния.
// Часть 1 (до 3 мин): голографическая спектрограмма планеты в разрезе (5 слоёв).
//   A. 7 точек в атмосфере — зонды; 2 точки пригодны для посадки. Зондов 4.
//   B. Приближение к точке: 5 площадок рельефа, 1 пригодна (по показаниям). Попыток 2.
//   C. 15 поверхностных масс, в одной — осмий. Сканов 8, скан показывает близость по плотности.
// Заставка: «Это... Осмий. Эта планета богата...» растворяется в атмосфере.
// Часть 2 (4 мин): 14 узлов влияния СНК и НаноТрейзен. Мы — третья сторона, держим баланс:
//   назначаем штурмы, подкрепления, закрепляем, отзываем актив; принимаем/отклоняем запросы.
const PART1 = 180, PART2 = 240;
const LAYERS = [
  ['АТМОСФЕРА', 1.18, 0x3a6a9a, 0.12],
  ['ПОВЕРХНОСТЬ', 1.0, 0xcfe2f0, 1],
  ['ЛЕДЯНОЙ ПОКРОВ', 0.86, 0x7fb0d8, 1],
  ['ПОРОДНОЕ ОСНОВАНИЕ', 0.62, 0x4a4f5a, 1],
  ['РУДНЫЕ ЖИЛЫ', 0.34, 0x9a6a3a, 1],
];
const SITES = [
  { name: 'ГОРНЫЙ МАССИВ', slope: 38, ice: 40, wind: 71, ok: false, why: 'Уклон. Зонд сорвался со склона.' },
  { name: 'РАВНИНА', slope: 3, ice: 120, wind: 22, ok: true },
  { name: 'РАЗЛОМ', slope: 12, ice: 8, wind: 64, ok: false, why: 'Лёд тонкий. Зонд ушёл в трещину.' },
  { name: 'ЛЕДНИК', slope: 9, ice: 300, wind: 88, ok: false, why: 'Ветер. Зонд унесло с ледника.' },
  { name: 'КРАТЕР', slope: 21, ice: 60, wind: 35, ok: false, why: 'Стенки кратера. Связь потеряна.' },
];

// процедурная текстура ледяной планеты: разводы, трещины, полярные шапки
function planetTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#eef6ff'); gr.addColorStop(0.2, '#b8d4ea'); gr.addColorStop(0.5, '#8fb4d2'); gr.addColorStop(0.8, '#b8d4ea'); gr.addColorStop(1, '#eef6ff');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  let s = 47; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,90,120'},${r() * 0.18})`; g.beginPath(); g.ellipse(r() * 1024, r() * 512, 20 + r() * 120, 6 + r() * 30, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(40,70,100,.35)';
  for (let i = 0; i < 70; i++) { let x = r() * 1024, y = r() * 512; g.lineWidth = 0.5 + r() * 1.5; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 20; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}
// точка на сфере по широте/долготе
const onSphere = (lat, lon, r) => new THREE.Vector3(Math.cos(lat) * Math.sin(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.cos(lon) * r);

export default {
  name: 'Разрез коры',
  run(root, done) {
    root.classList.add('pr-root');
    root.innerHTML = `
      <canvas class="pr-view"></canvas>
      <div class="pr-grid"></div>
      <div class="pr-labels"></div>
      <header class="pr-top"><span class="pr-stage"></span><span class="pr-time"></span></header>
      <div class="pr-info"></div>
      <div class="pr-bottom"></div>
      <div class="pr-float"></div>`;
    const $ = (q) => root.querySelector(q);
    const cv = $('.pr-view'), labels = $('.pr-labels'), info = $('.pr-info'), bottom = $('.pr-bottom');

    // ---------- 3D ----------
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02060a);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    const camPos = new THREE.Vector3(0, 0.6, 4.2), camLook = new THREE.Vector3();
    camera.position.copy(camPos);
    scene.add(new THREE.AmbientLight(0x6080a0, 0.8));
    const sun = new THREE.DirectionalLight(0xdfefff, 2.2); sun.position.set(3, 2, 4); scene.add(sun);
    const planet = new THREE.Group(); scene.add(planet);
    const FACE = Math.PI / 2; // клин разреза повёрнут к камере
    // точка на видимой стороне: мировая долгота wl (0 — к камере), широта lat
    const visible = (lat, wl, r) => onSphere(lat, wl - FACE, r);

    // слои в разрезе: сферы без клина 80°, внутренняя сторона видна
    const CUT = Math.PI * 0.45;
    const layerMeshes = LAYERS.map(([, r, col, op], i) => {
      const mat = i === 1
        ? new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, side: THREE.DoubleSide, transparent: op < 1, opacity: op, emissive: i === 4 ? 0x2a1406 : 0x000000, depthWrite: op >= 1 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48, CUT / 2, Math.PI * 2 - CUT), mat);
      planet.add(m); return m;
    });
    // срез: плоские кольца-секторы на гранях клина — видно слои
    for (const sgn of [-1, 1]) {
      const face = new THREE.Group(); face.rotation.y = sgn * CUT / 2; planet.add(face);
      LAYERS.slice(1).forEach(([, r, col], i) => {
        const inner = LAYERS[i + 2] ? LAYERS[i + 2][1] : 0;
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, r, 64, 1, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: i === 0 ? 0xdfeefa : col, roughness: 0.9, side: THREE.DoubleSide, emissive: i === 3 ? 0x3a1a08 : 0 }));
        ring.rotation.y = Math.PI / 2; face.add(ring);
      });
    }
    // жилы осмия в ядре — искры
    const veins = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 300 }, () => onSphere((Math.random() - 0.5) * 3, Math.random() * 7, 0.1 + Math.random() * 0.24))), new THREE.PointsMaterial({ color: 0xffb060, size: 0.02 }));
    planet.add(veins);
    // голографическая сетка и свечение атмосферы
    const holo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 36, 24), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, wireframe: true, transparent: true, opacity: 0.08 }));
    planet.add(holo);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.32, 48, 32), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color(0x6fc8ff) } },
      vertexShader: 'varying float f; void main(){ vec3 n = normalize(normalMatrix*normal); vec4 p = modelViewMatrix*vec4(position,1.); f = pow(1.0-abs(dot(n, normalize(-p.xyz))), 2.5); gl_Position = projectionMatrix*p; }',
      fragmentShader: 'uniform vec3 c; varying float f; void main(){ gl_FragColor = vec4(c, f*0.9); }',
    }));
    scene.add(glow);
    const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.004, 6, 96), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.6 }));
    scanRing.rotation.x = Math.PI / 2; scene.add(scanRing);

    // поверхность крупным планом (часть B/C): рельеф из шума
    const terrain = new THREE.Group(); terrain.visible = false; scene.add(terrain);
    const tGeo = new THREE.PlaneGeometry(8, 8, 160, 160); tGeo.rotateX(-Math.PI / 2);
    const sitePos = [[-2.4, -1.6], [0.2, 0.3], [2.3, -1.4], [-1.8, 1.9], [2.2, 1.9]];
    const tp = tGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i);
      let y = Math.sin(x * 1.3) * 0.08 + Math.cos(z * 1.7) * 0.06 + Math.sin(x * 4.1 + z * 3.3) * 0.03;
      const d = (k) => Math.hypot(x - sitePos[k][0], z - sitePos[k][1]);
      y += Math.max(0, 1.2 - d(0)) * 0.9 * (0.7 + 0.3 * Math.sin(x * 9) * Math.cos(z * 7));   // горы
      y *= d(1) < 1.2 ? d(1) / 1.2 : 1;                                                         // равнина
      if (Math.abs(x - sitePos[2][0] - (z - sitePos[2][1]) * 0.3) < 0.12 && d(2) < 1.3) y -= 0.4; // разлом
      y += d(3) < 1.3 ? 0.15 * Math.cos(d(3) * 1.2) : 0;                                         // ледник
      y -= d(4) < 0.9 ? 0.35 * Math.cos(d(4) * 1.7) : d(4) < 1.1 ? -0.12 : 0;                    // кратер
      tp.setY(i, y);
    }
    tGeo.computeVertexNormals();
    terrain.add(new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ map: planetTexture(), color: 0xdbe8f4, roughness: 0.4, metalness: 0.1, flatShading: false })));
    terrain.add(new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0x6fd8ff, wireframe: true, transparent: true, opacity: 0.06 })));
    const heightAt = (x, z) => { let best = 0, bd = 1e9; for (let i = 0; i < tp.count; i += 3) { const dd = (tp.getX(i) - x) ** 2 + (tp.getZ(i) - z) ** 2; if (dd < bd) { bd = dd; best = tp.getY(i); } } return best; };

    // ---------- состояние ----------
    const st = { t: 0, stage: 'atmo', probes: 4, tries: 2, scans: 8, over: false, part2: false, t2: 0 };
    const markers = []; // { pos(Vector3 в системе планеты / мира), el, kind, data }
    function clearMarkers() { markers.forEach((m) => { m.el.remove(); m.mesh && m.mesh.parent?.remove(m.mesh); }); markers.length = 0; }
    function marker(pos, cls, text, onTap, parent = planet) {
      const el = document.createElement('button'); el.className = `pr-mk ${cls}`; el.innerHTML = `<i></i><span></span>`; el.querySelector('span').textContent = text;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap?.(m); });
      labels.appendChild(el);
      const m = { pos, el, parent }; markers.push(m); return m;
    }
    function setInfo(title, lines = []) { info.innerHTML = `<b></b>${lines.map(() => '<p></p>').join('')}`; info.querySelector('b').textContent = title; info.querySelectorAll('p').forEach((p, i) => (p.textContent = lines[i])); }
    let floatT = 0;
    function say(text, cls = '') {
      const p = document.createElement('p'); p.className = `pr-say ${cls}`; $('.pr-float').appendChild(p);
      let i = 0; const tick = () => { if (i > text.length || !p.isConnected) return; if (text[i - 1]) sfx.talk(text[i - 1]); p.textContent = text.slice(0, i++); setTimeout(tick, 34); }; tick();
      setTimeout(() => p.classList.add('out'), 3200 + text.length * 50); setTimeout(() => p.remove(), 4400 + text.length * 50);
      floatT = 0;
    }
    const hum = storm.start(); hum.set(0);

    // ---------- часть A: зонды в атмосферу ----------
    function stageAtmo() {
      st.stage = 'atmo'; clearMarkers();
      $('.pr-stage').textContent = 'ЭТАП 1 · АТМОСФЕРНОЕ ЗОНДИРОВАНИЕ';
      setInfo('ВЫБЕРИТЕ ТОЧКУ ЗОНДИРОВАНИЯ', [`ЗОНДОВ: ${st.probes}`, 'Пригодные для посадки коридоры: 2 из 7']);
      const good = new Set(); while (good.size < 2) good.add(Math.floor(Math.random() * 7));
      for (let i = 0; i < 7; i++) {
        const lat = [0.7, -0.6, 0.2, -0.2, 0.9, -0.9, 0][i], wl = [-1.1, -0.9, -1.3, 1.2, 0.8, 0.9, 1.35][i] + (Math.random() - 0.5) * 0.15;
        marker(visible(lat, wl, 1.2), 'atmo', `A-${i + 1}`, (m) => {
          if (m.used || st.busy) return;
          m.used = true; st.probes--; st.busy = true; sfx.click(); storm.lock();
          m.el.classList.add('probing'); setInfo('ЗОНД В АТМОСФЕРЕ…', [`ЗОНДОВ: ${st.probes}`]);
          setTimeout(() => {
            st.busy = false; m.el.classList.remove('probing');
            if (good.has(i)) { m.el.classList.add('ok'); storm.captured(); say('Коридор найден. Посадка возможна.'); setTimeout(() => stageLanding(m.pos), 1400); }
            else { m.el.classList.add('bad'); sfx.denied(); say(['Турбулентность. Коридор закрыт.', 'Обледенение зонда.', 'Плотность атмосферы — критическая.'][i % 3], 'warn'); setInfo('ВЫБЕРИТЕ ТОЧКУ ЗОНДИРОВАНИЯ', [`ЗОНДОВ: ${st.probes}`]); if (st.probes <= 0) fail('Зонды закончились.'); }
          }, 1800);
        });
      }
    }

    // ---------- часть B: площадки посадки ----------
    let focus = null;
    function stageLanding(pos) {
      st.stage = 'zoom'; clearMarkers();
      // приближение к точке, затем переход на рельеф
      const target = planet.localToWorld(pos.clone());
      focus = { from: camPos.clone(), to: target.clone().multiplyScalar(1.3), look: target, t: 0, then: () => {
        planet.visible = glow.visible = scanRing.visible = false; terrain.visible = true;
        camPos.set(0, 5.2, 6.2); camLook.set(0, 0, 0.2); st.stage = 'land';
        $('.pr-stage').textContent = 'ЭТАП 2 · ВЫБОР ПЛОЩАДКИ';
        setInfo('ВЫБЕРИТЕ ПЛОЩАДКУ', [`ПОПЫТОК: ${st.tries}`, 'Смотрите на уклон, толщину льда и ветер']);
        SITES.forEach((S, i) => {
          const [x, z] = sitePos[i];
          const m = marker(new THREE.Vector3(x, heightAt(x, z) + 0.25, z), 'site', `${S.name}\nУКЛОН ${S.slope}° · ЛЁД ${S.ice} М · ВЕТЕР ${S.wind} М/С`, () => {
            if (st.busy || m.used) return; m.used = true; st.busy = true; sfx.click();
            setTimeout(() => {
              st.busy = false;
              if (S.ok) { m.el.classList.add('ok'); storm.captured(); say('Зонд на поверхности. Начинаю сканирование масс.'); setTimeout(() => stageScan(x, z), 1600); }
              else { st.tries--; m.el.classList.add('bad'); storm.gust(); say(S.why, 'warn'); setInfo('ВЫБЕРИТЕ ПЛОЩАДКУ', [`ПОПЫТОК: ${st.tries}`]); if (st.tries <= 0) fail('Зонды потеряны на поверхности.'); }
            }, 1400);
          }, terrain);
          m.el.classList.add(`s${i}`);
        });
      } };
      sfx.whoosh(1.2);
    }

    // ---------- часть C: сканирование масс ----------
    function stageScan(sx, sz) {
      st.stage = 'scan'; clearMarkers();
      camPos.set(sx, 2.6, sz + 2.4); camLook.set(sx, 0, sz);
      $('.pr-stage').textContent = 'ЭТАП 3 · СКАНИРОВАНИЕ ПОВЕРХНОСТНЫХ МАСС';
      setInfo('ВЫБЕРИТЕ МАССУ ДЛЯ СКАНА', [`СКАНОВ: ${st.scans}`, 'Плотность растёт ближе к жиле']);
      const target = Math.floor(Math.random() * 15);
      for (let i = 0; i < 15; i++) {
        const gx = i % 5, gz = Math.floor(i / 5), x = sx - 1.2 + gx * 0.6, z = sz - 0.6 + gz * 0.6;
        const m = marker(new THREE.Vector3(x, heightAt(x, z) + 0.08, z), 'mass', `M-${String(i + 1).padStart(2, '0')}`, () => {
          if (st.busy || m.used) return; m.used = true; st.busy = true; st.scans--; sfx.click(); m.el.classList.add('probing');
          setTimeout(() => {
            st.busy = false; m.el.classList.remove('probing');
            const d = Math.abs(gx - target % 5) + Math.abs(gz - Math.floor(target / 5));
            if (i === target) { m.el.classList.add('ok'); m.el.querySelector('span').textContent = 'Os · 76'; storm.captured(); setTimeout(cutscene, 1500); }
            else {
              const dens = Math.max(5, 95 - d * 20 + Math.floor(Math.random() * 6));
              m.el.classList.add('bad'); m.el.querySelector('span').textContent = `${dens}%`; m.el.style.setProperty('--h', String(dens / 100)); storm.lock();
              setInfo('ВЫБЕРИТЕ МАССУ ДЛЯ СКАНА', [`СКАНОВ: ${st.scans}`, `M-${String(i + 1).padStart(2, '0')}: плотность ${dens}% — ${dens > 70 ? 'рядом' : dens > 40 ? 'теплее' : 'пусто'}`]);
              if (st.scans <= 0) fail('Сканы исчерпаны. Следов нет.');
            }
          }, 1100);
        }, terrain);
      }
    }

    // ---------- заставка ----------
    function cutscene() {
      st.stage = 'cut'; clearMarkers(); info.innerHTML = ''; bottom.innerHTML = '';
      terrain.visible = false; planet.visible = glow.visible = scanRing.visible = true;
      camPos.set(0, 0.4, 3.6); camLook.set(0, 0, 0);
      $('.pr-stage').textContent = 'СПЕКТРОГРАММА';
      const p = document.createElement('p'); p.className = 'pr-rise'; $('.pr-float').appendChild(p);
      const text = 'Это... Осмий. Эта планета богата...';
      let i = 0; const tick = () => { if (i > text.length) return; if (text[i - 1]) sfx.talk(text[i - 1]); p.textContent = text.slice(0, i++); setTimeout(tick, 90); }; setTimeout(tick, 800);
      setTimeout(() => p.classList.add('up'), 4800);
      setTimeout(() => { p.remove(); part2(); }, 9800);
    }

    // ---------- часть 2: баланс влияния ----------
    const nodes = [];
    let selected = null;
    const P2 = { units: 6, req: null, nextReq: 12, danger: 0 };
    function part2() {
      st.part2 = true; st.stage = 'war';
      root.classList.add('war');
      layerMeshes[1].material.color.set(0x8aa0b4);
      $('.pr-stage').textContent = 'ЭТАП 4 · РАЗДЕЛ ВЛИЯНИЯ · СНК ⇄ НАНОТРЕЙЗЕН';
      bottom.innerHTML = `<div class="pr-bal"><span>СНК</span><div><i></i><b></b></div><span>НТ</span></div><p class="pr-units"></p>`;
      for (let i = 0; i < 14; i++) {
        const lat = ((i % 7) / 6 - 0.5) * 1.7, wl = (i < 7 ? -1 : 1) * (0.55 + ((i * 37) % 7) / 7 * 0.85);
        const n = { id: i, v: (Math.random() - 0.5) * 1.2, units: 0, side: 0, fort: 0, drift: (Math.random() - 0.5) * 0.02 };
        n.m = marker(visible(lat, wl, 1.02), 'node', `У-${String(i + 1).padStart(2, '0')}`, () => select(n));
        nodes.push(n);
      }
      say('Актив на связи. Держите их в равновесии.');
    }
    function select(n) {
      selected = n; sfx.click();
      nodes.forEach((k) => k.m.el.classList.toggle('sel', k === n));
      const v = Math.round((n.v + 1) * 50);
      info.innerHTML = `<b>УЗЕЛ У-${String(n.id + 1).padStart(2, '0')}</b><p>СНК ${100 - v}% · НТ ${v}%</p><p>АКТИВ: ${n.units} ${n.side ? (n.side < 0 ? '→ СНК' : '→ НТ') : ''}${n.fort > 0 ? ' · ЗАКРЕПЛЁН' : ''}</p>
        <div class="pr-acts"><button data-a="snk">ШТУРМ ЗА СНК</button><button data-a="nt">ШТУРМ ЗА НТ</button><button data-a="rein">ПОДКРЕПЛЕНИЕ</button><button data-a="fort">ЗАКРЕПИТЬ</button><button data-a="recall">ОТОЗВАТЬ</button></div>`;
      info.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); act(n, b.dataset.a); }));
    }
    function act(n, a) {
      if ((a === 'snk' || a === 'nt' || a === 'rein' || a === 'fort') && P2.units <= 0) { sfx.denied(); say('Свободного актива нет.', 'warn'); return; }
      if (a === 'snk' || a === 'nt') { if (!n.units) { n.units = 1; P2.units--; } n.side = a === 'snk' ? -1 : 1; storm.lever(); }
      if (a === 'rein') { if (!n.side) { sfx.denied(); say('Сначала назначьте штурм.', 'warn'); return; } n.units++; P2.units--; storm.lever(); }
      if (a === 'fort') { n.fort = 30; P2.units--; setTimeout(() => P2.units++, 30000); storm.lock(); }
      if (a === 'recall') { P2.units += n.units; n.units = 0; n.side = 0; sfx.back(); }
      select(n);
    }
    const REQ = [
      ['СНК', 'Просим прикрыть узел {n}. Щедро заплатим.', -1], ['НТ', 'Узел {n} нужен нам к рассвету. Обеспечьте.', 1],
      ['СНК', 'Отзовите актив из {n}, или мы решим вопрос сами.', -1], ['НТ', 'Нужна диверсия в секторе {n}.', 1],
      ['СНК', 'Пропустите наш конвой через {n}.', -1], ['НТ', 'Закройте глаза на {n}. Контракт продлим.', 1],
    ];
    function request() {
      const [who, text, side] = REQ[Math.floor(Math.random() * REQ.length)], n = nodes[Math.floor(Math.random() * 14)];
      P2.req = { side, n, left: 12 };
      const box = document.createElement('div'); box.className = `pr-req ${side < 0 ? 'snk' : 'nt'}`;
      box.innerHTML = `<b>${who} · ЗАПРОС</b><p></p><div><button data-r="yes">ПРИНЯТЬ</button><button data-r="no">ОТКЛОНИТЬ</button></div><i></i>`;
      box.querySelector('p').textContent = text.replace('{n}', `У-${String(n.id + 1).padStart(2, '0')}`);
      root.appendChild(box); P2.req.el = box; storm.radio();
      box.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); answer(b.dataset.r === 'yes'); }));
    }
    function answer(yes) {
      const R = P2.req; if (!R) return; P2.req = null; R.el.remove();
      if (yes) { R.n.v += R.side * 0.35; sfx.confirm(); }                       // приняли — узел качнулся к ним
      else { nodes.forEach((n) => (n.v += R.side * 0.06)); sfx.denied(); say(R.side < 0 ? 'СНК недовольны. Давят везде.' : 'НТ недовольны. Давят везде.', 'warn'); }
    }

    // ---------- цикл ----------
    let last = performance.now(), raf = 0;
    const tmp = new THREE.Vector3();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.over) return;
      st.t += dt;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      // вращение и камера
      planet.rotation.y = FACE + Math.sin(st.t * 0.25) * 0.18;
      planet.rotation.x = 0.22;
      scanRing.position.y = Math.sin(st.t * 0.8) * 1.1; scanRing.scale.setScalar(Math.sqrt(Math.max(0.05, 1 - (scanRing.position.y / 1.25) ** 2)));
      holo.rotation.y -= dt * 0.05;
      if (focus) {
        focus.t = Math.min(1, focus.t + dt / 1.6); const k = focus.t * focus.t * (3 - 2 * focus.t);
        camera.position.lerpVectors(focus.from, focus.to, k); camera.lookAt(focus.look);
        if (focus.t >= 1) { const f = focus; focus = null; f.then(); camera.position.copy(camPos); }
      } else { camera.position.lerp(camPos, Math.min(1, dt * 2)); tmp.copy(camLook); camera.lookAt(tmp); }
      // атмосферная пульсация и маркеры — поверх 3D
      for (const m of markers) {
        tmp.copy(m.pos); m.parent.localToWorld(tmp);
        const behind = m.parent === planet && tmp.dot(camera.position) < 0.2;
        tmp.project(camera);
        m.el.style.transform = `translate(${(tmp.x + 1) / 2 * w}px, ${(1 - tmp.y) / 2 * h}px)`;
        m.el.classList.toggle('hidden', behind || tmp.z > 1);
      }
      // таймеры частей
      if (!st.part2) {
        const left = PART1 - st.t; $('.pr-time').textContent = fmt(left);
        if (left <= 0 && st.stage !== 'cut') fail('Время на разведку вышло.');
      } else {
        st.t2 += dt; const left = PART2 - st.t2; $('.pr-time').textContent = fmt(left);
        war(dt);
        if (left <= 0) return win();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

    function war(dt) {
      // фракции сами тянут узлы; актив толкает к выбранной стороне; закреплённые — стоят
      let sum = 0;
      for (const n of nodes) {
        if (n.fort > 0) n.fort -= dt;
        else { n.v += n.drift * dt * 3 + (Math.random() - 0.5) * 0.04 * dt + n.side * n.units * 0.05 * dt; if (Math.random() < dt * 0.02) n.drift = (Math.random() - 0.5) * 0.03; }
        n.v = Math.max(-1, Math.min(1, n.v)); sum += n.v;
        const v = (n.v + 1) / 2;
        n.m.el.style.setProperty('--c', `rgb(${Math.round(60 + v * 195)},${Math.round(140 - v * 30)},${Math.round(255 - v * 205)})`);
        n.m.el.classList.toggle('fort', n.fort > 0); n.m.el.classList.toggle('act', n.units > 0);
      }
      const bal = sum / nodes.length; // −1 весь СНК, +1 весь НТ
      root.querySelector('.pr-bal i').style.left = `${(bal + 1) * 50}%`;
      root.querySelector('.pr-units').textContent = `СВОБОДНЫЙ АКТИВ: ${P2.units} · ДЕРЖИТЕ БАЛАНС В ЗЕЛЁНОЙ ЗОНЕ`;
      const bad = Math.abs(bal) > 0.3;
      root.classList.toggle('danger', bad);
      P2.danger = bad ? P2.danger + dt : Math.max(0, P2.danger - dt * 2);
      if (bad && Math.floor(P2.danger * 2) !== Math.floor((P2.danger - dt) * 2)) storm.alarm();
      if (P2.danger > 12) fail(bal < 0 ? 'СНК захватили планету.' : 'НаноТрейзен захватили планету.');
      // запросы
      if (!P2.req && st.t2 > P2.nextReq) { request(); P2.nextReq = st.t2 + 16 + Math.random() * 10; }
      if (P2.req) { P2.req.left -= dt; P2.req.el.querySelector('i').style.width = `${Math.max(0, P2.req.left / 12) * 100}%`; if (P2.req.left <= 0) answer(false); }
      if (selected && Math.random() < dt * 2) select(selected);
    }

    function end(win, text) {
      if (st.over) return; st.over = true; cancelAnimationFrame(raf); hum.stop();
      const box = document.createElement('div'); box.className = `pr-end ${win ? 'win' : 'lose'}`; box.textContent = text; root.appendChild(box);
      win ? storm.captured() : storm.alarm();
      setTimeout(() => done(win), 2600);
    }
    const fail = (why) => end(false, why);
    const win = () => end(true, 'РАВНОВЕСИЕ СОХРАНЕНО. АКТИВ ОТОЗВАН.');

    stageAtmo();
    raf = requestAnimationFrame(frame);
    return () => { st.over = true; cancelAnimationFrame(raf); hum.stop(); renderer.dispose(); };
  },
};
