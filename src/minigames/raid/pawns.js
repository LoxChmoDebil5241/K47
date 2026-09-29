import * as THREE from 'three';

// 3D пешки по рисунку: Л — разведчик (узкий корпус, три полосы на шлеме),
// С — штурмовик (трапеция с плечами, красный визор), Б — джаггернаут (широкий корпус, руки, пластина с крестом).
// Оружие висит за спиной/на поясе; в бою и в обороне пешка его достаёт.
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o });
const DARK = mat(0x2c2f34, { metalness: 0.35 }), LIGHT = mat(0xe4e8ec, { roughness: 0.45 }), STEEL = mat(0x7a8088, { metalness: 0.8, roughness: 0.3 });
const GRIP = mat(0x1a1c1f), WOOD = mat(0x5a3e28, { roughness: 0.8 }), TANK = mat(0xb03020, { roughness: 0.4 });
const VISOR = { us: 0xe02a24, nt: 0xff8a20, snk: 0x3a8cff, unk: 0x9cff50, fauna: 0x40ffd0 };
// визоры и лицевые экраны — стекло со свечением
const visorMat = {}, visorDim = {};
for (const [k, c] of Object.entries(VISOR)) {
  visorMat[k] = mat(c, { emissive: c, emissiveIntensity: 0.75, metalness: 0.6, roughness: 0.15, side: THREE.DoubleSide });
  visorDim[k] = mat(new THREE.Color(c).multiplyScalar(0.45), { emissive: c, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.1, side: THREE.DoubleSide });
}
// изогнутый визор по шлему: дуга arc вокруг лица, высота h
const visor = (r, h, arc, y, m) => { const v = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true, -arc / 2, arc), m); v.position.y = y; return v; };
const FLASH = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const FIRE = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

const SIZE_FAUNA = new Set(['T', 'S', 'F']);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
// корпус «рамкой»: тёмный силуэт и светлая вставка спереди и сзади
function framed(outline, inset, depth) {
  const g = new THREE.Group();
  const shape = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; };
  const out = new THREE.Mesh(new THREE.ExtrudeGeometry(shape(outline), { depth, bevelEnabled: false }), DARK);
  out.position.z = -depth / 2; g.add(out);
  for (const z of [depth / 2 + 0.004, -depth / 2 - 0.004]) {
    const p = new THREE.Mesh(new THREE.ShapeGeometry(shape(inset)), LIGHT); p.position.z = z; if (z < 0) p.rotation.y = Math.PI; g.add(p);
  }
  return g;
}
function helmet(r, y) {
  const g = new THREE.Group(); g.position.y = y;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), DARK); dome.position.y = r * 0.8; g.add(dome);
  const ring = cyl(r, r * 0.96, r * 0.8, DARK, 18); ring.position.y = r * 0.4; g.add(ring);
  return g;
}

// ---------- оружие: ствол вдоль +z; tip — точка вспышки ----------
function weapon(kind) {
  const g = new THREE.Group(); let tip = 0.6;
  if (kind === 'sniper') {
    g.add(box(0.06, 0.07, 1.15, DARK)); const st = box(0.12, 0.2, 0.32, WOOD); st.position.set(0, -0.05, -0.5); g.add(st);
    const sc = cyl(0.05, 0.05, 0.32, STEEL); sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.1, 0.02); g.add(sc); tip = 0.6;
  } else if (kind === 'knife') {
    const b = box(0.025, 0.07, 0.3, STEEL); b.position.z = 0.15; g.add(b); const h = box(0.05, 0.08, 0.13, GRIP); h.position.z = -0.06; g.add(h); tip = 0;
  } else if (kind === 'smg') {
    g.add(box(0.1, 0.15, 0.46, DARK)); const m = box(0.06, 0.22, 0.08, GRIP); m.position.set(0, -0.15, 0.05); g.add(m);
    const b = cyl(0.025, 0.025, 0.16, STEEL); b.rotation.x = Math.PI / 2; b.position.z = 0.3; g.add(b); tip = 0.38;
  } else if (kind === 'shotgun') {
    g.add(box(0.08, 0.1, 0.9, DARK)); const p = box(0.11, 0.1, 0.22, WOOD); p.position.set(0, -0.08, 0.18); g.add(p);
    const st = box(0.1, 0.16, 0.28, WOOD); st.position.set(0, -0.04, -0.52); g.add(st); tip = 0.45;
  } else if (kind === 'burner') {
    const w = cyl(0.03, 0.03, 0.62, STEEL); w.rotation.x = Math.PI / 2; g.add(w);
    const n = cyl(0.05, 0.08, 0.12, DARK); n.rotation.x = Math.PI / 2; n.position.z = 0.34; g.add(n); tip = 0.42;
  } else if (kind === 'mg') {
    g.add(box(0.16, 0.2, 0.72, DARK)); const b = cyl(0.045, 0.045, 0.6, STEEL); b.rotation.x = Math.PI / 2; b.position.z = 0.64; g.add(b);
    const dr = cyl(0.15, 0.15, 0.12, GRIP, 14); dr.rotation.z = Math.PI / 2; dr.position.set(0.12, -0.06, 0.05); g.add(dr);
    for (const s of [-1, 1]) { const l = box(0.025, 0.3, 0.025, STEEL); l.position.set(s * 0.08, -0.18, 0.7); l.rotation.z = s * 0.35; g.add(l); }
    tip = 0.95;
  } else if (kind === 'hammer') {
    const h = cyl(0.035, 0.035, 1.1, WOOD); h.rotation.x = Math.PI / 2; g.add(h); const hd = box(0.26, 0.2, 0.32, STEEL); hd.position.z = 0.55; g.add(hd); tip = 0;
  }
  let fl = null;
  if (tip) { fl = new THREE.Mesh(new THREE.SphereGeometry(kind === 'burner' ? 0.2 : 0.12, 8, 6), kind === 'burner' ? FIRE : FLASH); fl.position.z = tip + 0.1; fl.visible = false; g.add(fl); }
  g.userData.flash = fl;
  return g;
}

// ---------- пешка ----------
// p — { size, main, close }; side — 'us' | 'nt' | 'snk' | 'unk'
// ---------- фауна: клещ, шипун, фильтратор ----------
const CHITIN = mat(0x3a332c, { roughness: 0.35, metalness: 0.3 }), SHELL = mat(0x5a4a3a, { roughness: 0.3, metalness: 0.4 });
const GLOW = mat(0x40ffd0, { emissive: 0x40ffd0, emissiveIntensity: 0.9 }), ACID = mat(0x9cff40, { emissive: 0x6aff20, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
const SPIT = new THREE.MeshBasicMaterial({ color: 0x9cff40, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
function makeFauna(p) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legs = (n, len, y, spread, m = CHITIN) => {
    for (let k = 0; k < n; k++) {
      const sgn = k % 2 ? 1 : -1, z = (Math.floor(k / 2) - (n / 2 - 1) / 2) * spread;
      const l = box(0.05, 0.05, len, m); l.position.set(sgn * len * 0.45, y, z); l.rotation.y = sgn * Math.PI / 2; l.rotation.x = 0.5; body.add(l);
    }
  };
  let fl = null;
  if (p.size === 'T') {
    // нематода: длинная, скользкая, с рядами зубов
    for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2 - k * 0.022, 10, 8), CHITIN); seg.position.set(Math.sin(k * 1.1) * 0.1, 0.18 - k * 0.012, 0.3 - k * 0.2); body.add(seg); body.userData.segs = (body.userData.segs || []).concat(seg); }
    const teeth = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 10), GLOW); teeth.position.set(0, 0.18, 0.48); body.add(teeth);
  } else if (p.size === 'S') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), CHITIN); b.scale.set(1, 0.8, 1.2); b.position.y = 0.45; body.add(b);
    // шипун: горбатый, с кислотным мешком
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), ACID); sac.position.set(0, 0.72, -0.2); body.add(sac);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), SHELL); head.position.set(0, 0.5, 0.42); body.add(head);
    legs(4, 0.6, 0.25, 0.3);
    fl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), SPIT); fl.position.set(0, 0.5, 0.75); fl.visible = false; body.add(fl);
  } else {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), SHELL); shell.scale.set(1, 0.8, 1.3); shell.position.y = 0.35; body.add(shell);
    for (let k = 0; k < 4; k++) { const pl = box(1.0, 0.06, 0.12, CHITIN); pl.position.set(0, 0.6 + (k % 2) * 0.05, -0.4 + k * 0.25); body.add(pl); }
    for (const sgn of [-1, 1]) {
      const arm = box(0.14, 0.14, 0.6, CHITIN); arm.position.set(sgn * 0.55, 0.45, 0.55); arm.rotation.y = -sgn * 0.4; body.add(arm);
      const pin = box(0.08, 0.2, 0.35, SHELL); pin.position.set(sgn * 0.72, 0.45, 0.9); body.add(pin);
    }
    for (let k = 0; k < 5; k++) { const t = cyl(0.025, 0.01, 0.5, GLOW, 5); t.position.set((k - 2) * 0.12, 0.35, 0.8); t.rotation.x = 1.1 + (k % 2) * 0.3; body.add(t); }
    legs(6, 0.8, 0.2, 0.35);
  }
  let mode = '';
  g.scale.setScalar(p.size === 'F' ? 0.085 : p.size === 'S' ? 0.07 : 0.06);
  g.userData = { pawn: p, side: 'fauna', body, pose(m) { mode = m; }, get mode() { return mode; }, flash(on) { if (fl) { fl.visible = !!on; if (on) fl.scale.setScalar(0.6 + Math.random()); } } };
  g.traverse((o) => { if (o.isMesh) o.userData.pawnRoot = g; });
  return g;
}

export function makePawn(p, side) {
  if (SIZE_FAUNA.has(p.size)) return makeFauna(p);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  let headY, holster;
  if (p.size === 'L') {
    body.add(framed([[-0.24, 0], [0.24, 0], [0.24, 1.2], [-0.24, 1.2]], [[-0.15, 0.12], [0.15, 0.12], [0.15, 1.08], [-0.15, 1.08]], 0.32));
    const base = box(0.52, 0.12, 0.36, DARK); base.position.y = 0.06; body.add(base);
    const h = helmet(0.27, 1.24); body.add(h); headY = 1.24;
    // лицевой экран-визор во всё лицо, с тремя бликами развёртки
    h.add(visor(0.28, 0.22, 2.0, 0.18, visorDim[side]));
    [-0.09, 0, 0.09].forEach((x) => { const s = box(0.035, 0.16, 0.01, visorMat[side]); s.position.set(x, 0.18, 0.285); h.add(s); });
    holster = { main: [0.02, 0.75, -0.24, -1.2, 0, 0.5], close: [0.27, 0.35, 0.05, Math.PI / 2, 0, 0] };
  } else if (p.size === 'M') {
    body.add(framed([[-0.55, 1.1], [0.55, 1.1], [0.55, 0.95], [0.25, 0.95], [0.18, 0.15], [0.42, 0.15], [0.42, 0], [0.02, 0], [-0.25, 0.1], [-0.25, 0.95], [-0.55, 0.95]],
      [[-0.14, 0.88], [0.14, 0.88], [0.06, 0.2], [-0.12, 0.2]], 0.34));
    const h = helmet(0.24, 1.12); body.add(h); headY = 1.12;
    h.add(visor(0.25, 0.12, 2.3, 0.2, visorMat[side])); // узкий яркий визор по шлему
    holster = { main: [0, 0.7, -0.24, -1.3, 0, -0.45], close: [0, 0.7, -0.24, -1.3, 0, -0.45] };
  } else {
    body.add(framed([[-0.5, 0.14], [0.5, 0.14], [0.5, 1.0], [-0.5, 1.0]], [[-0.34, 0.28], [0.34, 0.28], [0.34, 0.86], [-0.34, 0.86]], 0.44));
    const base = box(1.12, 0.18, 0.5, DARK); base.position.y = 0.09; body.add(base);
    for (const s of [-1, 1]) {
      const arm = box(0.2, 0.52, 0.32, DARK); arm.position.set(s * 0.64, 0.62, 0.02); arm.rotation.z = s * 0.18; body.add(arm);
      const fist = box(0.22, 0.2, 0.28, DARK); fist.position.set(s * 0.72, 0.3, 0.06); body.add(fist);
    }
    const h = helmet(0.3, 1.02); body.add(h); headY = 1.02;
    // квадратный лицевой экран; на дисплее — крест
    const plate = box(0.44, 0.38, 0.06, visorDim[side]); plate.position.set(0, 0.24, 0.28); h.add(plate);
    const c1 = box(0.07, 0.24, 0.01, visorMat[side]), c2 = box(0.24, 0.07, 0.01, visorMat[side]);
    c1.position.set(0.02, 0.25, 0.315); c2.position.set(0.02, 0.25, 0.315); h.add(c1, c2);
    holster = { main: [0.05, 0.75, -0.3, -1.2, 0, 0.55], close: [-0.05, 0.75, -0.32, -1.2, 0, -0.55] };
  }
  // оружие: позы «за спиной» и «в руках»
  const drawn = { L: { main: [0.2, 0.72, 0.32], close: [0.3, 0.62, 0.3] }, M: { main: [0.2, 0.62, 0.32], close: [0.2, 0.62, 0.32] }, H: { main: [0.3, 0.55, 0.42], close: [0.62, 0.8, 0.35] } }[p.size];
  const wMain = weapon(p.main), wClose = p.close !== p.main ? weapon(p.close) : wMain;
  body.add(wMain); if (wClose !== wMain) body.add(wClose);
  if (p.main === 'burner') { const t = cyl(0.13, 0.13, 0.46, TANK); t.position.set(0, 0.62, -0.3); body.add(t); }
  const put = (w, a) => { w.position.set(a[0], a[1], a[2]); w.rotation.set(a[3] || 0, a[4] || 0, a[5] || 0); };
  let mode = '';
  function pose(m) {
    if (m === mode) return; mode = m;
    put(wMain, holster.main); if (wClose !== wMain) put(wClose, holster.close);
    if (m === 'fire') put(wMain, drawn.main);
    if (m === 'melee') { put(wClose, drawn.close); if (p.size === 'H') wClose.rotation.x = -0.9; }
  }
  pose('idle');
  g.scale.setScalar(p.size === 'H' ? 0.07 : 0.065); // крошечные пешки
  // укрытие: снежная стенка перед пешкой или яма, в которую она садится
  const cover = new THREE.Group(); cover.visible = false; g.add(cover);
  if (p.wall) { const w = box(1.1, 0.5, 0.25, SNOW); w.position.set(0, 0.25, 0.6); cover.add(w); const w2 = box(0.5, 0.4, 0.22, SNOW); w2.position.set(0.55, 0.2, 0.35); w2.rotation.y = 0.8; cover.add(w2); }
  else { const pit = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 6, 14), SNOW); pit.rotation.x = Math.PI / 2; pit.position.y = 0.42; cover.add(pit); const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), PIT); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.4; cover.add(hole); }
  g.userData = {
    pawn: p, side, headY, body,
    // укрыться: стенка — просто стоит за ней, яма — опускается
    dig(on) { cover.visible = on; body.position.y = on && !p.wall ? -0.42 : 0; cover.position.y = on && !p.wall ? -0.42 : 0; },
    pose, get mode() { return mode; },
    // вспышка выстрела у оружия в руках
    flash(on) {
      const w = mode === 'melee' ? wClose : mode === 'fire' ? wMain : null;
      for (const x of [wMain, wClose]) if (x.userData.flash) x.userData.flash.visible = false;
      if (on && w?.userData.flash) { w.userData.flash.visible = true; w.userData.flash.scale.setScalar(0.6 + Math.random() * 0.8); }
    },
  };
  g.traverse((o) => { if (o.isMesh) o.userData.pawnRoot = g; });
  return g;
}

// ---------- 2D значки для списков (как на рисунке) ----------
const iconCache = {};
export function pawnIcon(size, side = 'us') {
  const key = size + side; if (iconCache[key]) return iconCache[key];
  const c = document.createElement('canvas'); c.width = 30; c.height = 40; const g = c.getContext('2d');
  const vis = '#' + VISOR[side].toString(16).padStart(6, '0');
  g.fillStyle = '#e4e8ec'; g.strokeStyle = '#2c2f34'; g.lineWidth = 3;
  const dome = (x, y, r) => { g.fillStyle = '#2c2f34'; g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.lineTo(x + r, y + r * 0.7); g.lineTo(x - r, y + r * 0.7); g.fill(); };
  if (size === 'T' || size === 'S' || size === 'F') {
    g.fillStyle = '#3a332c'; g.beginPath(); g.ellipse(15, 26, size === 'F' ? 12 : size === 'S' ? 9 : 7, size === 'F' ? 9 : 6, 0, 0, 7); g.fill();
    g.strokeStyle = '#3a332c'; g.lineWidth = 2; for (const k of [-1, 1]) for (const y of [24, 28, 32]) { g.beginPath(); g.moveTo(15, y); g.lineTo(15 + k * 14, y + 5); g.stroke(); }
    g.fillStyle = size === 'S' ? '#9cff40' : '#40ffd0'; g.fillRect(12, 20, 6, 3);
    return (iconCache[key] = c.toDataURL());
  }
  if (size === 'L') {
    dome(15, 11, 6); g.globalAlpha = 0.55; g.fillStyle = vis; g.fillRect(10, 11, 10, 6); g.globalAlpha = 1; for (const x of [11, 14, 17]) g.fillRect(x, 12, 2, 4);
    g.fillStyle = '#e4e8ec'; g.fillRect(10, 19, 10, 18); g.strokeRect(10, 19, 10, 18);
  } else if (size === 'M') {
    dome(15, 11, 6); g.fillStyle = vis; g.fillRect(10, 12, 10, 4);
    g.fillStyle = '#e4e8ec'; g.beginPath(); g.moveTo(4, 20); g.lineTo(26, 20); g.lineTo(19, 37); g.lineTo(11, 37); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#2c2f34'; g.fillRect(17, 35, 7, 3);
  } else {
    dome(15, 10, 7); g.fillStyle = vis; g.fillRect(11, 9, 9, 8); g.fillStyle = '#2c2f34'; g.fillRect(14, 10, 2, 6); g.fillRect(12, 12, 6, 2);
    g.fillStyle = '#e4e8ec'; g.fillRect(8, 20, 14, 14); g.strokeRect(8, 20, 14, 14);
    g.fillStyle = '#2c2f34'; g.fillRect(3, 22, 4, 9); g.fillRect(23, 22, 4, 9); g.fillRect(6, 34, 18, 4);
  }
  return (iconCache[key] = c.toDataURL());
}

// ---------- постройки ----------
function stripes() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f0f0f0' : '#c02020'; g.fillRect(i * 8, 0, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const CONCRETE = mat(0x8a8e92, { roughness: 0.9, metalness: 0 }), RUST = mat(0x6a4a34, { roughness: 0.7, metalness: 0.5 });
const SNOW = mat(0xeef4fa, { roughness: 1, metalness: 0 }), PIT = new THREE.MeshBasicMaterial({ color: 0x0a0e12 });
const BAR = new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.6 });
const BEACON = new THREE.MeshBasicMaterial({ color: 0xff3030 });
export function makeBuilding(type) {
  const g = new THREE.Group();
  if (type === 'tower') {
    const H = 1.1;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, H * 1.01, 5), RUST);
      const a = new THREE.Vector3(sx * 0.2, 0, sz * 0.2), b = new THREE.Vector3(sx * 0.06, H, sz * 0.06);
      leg.position.copy(a).add(b).multiplyScalar(0.5); leg.lookAt(b); leg.rotateX(Math.PI / 2); g.add(leg);
    }
    for (let i = 1; i < 5; i++) { const y = i * H / 5, w = 0.4 - (i / 5) * 0.28; const r = box(w, 0.012, w, RUST); r.position.y = y; g.add(r); }
    const top = box(0.2, 0.04, 0.2, DARK); top.position.y = H; g.add(top);
    const ant = cyl(0.006, 0.006, 0.35, STEEL, 4); ant.position.y = H + 0.18; g.add(ant);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), BEACON); lamp.position.y = H + 0.36; g.add(lamp); g.userData.lamp = lamp;
  } else if (type === 'mine') {
    const shed = box(0.46, 0.26, 0.34, CONCRETE); shed.position.set(-0.12, 0.13, 0.05); g.add(shed);
    const roof = box(0.5, 0.04, 0.38, RUST); roof.position.set(-0.12, 0.28, 0.05); g.add(roof);
    for (const s of [-1, 1]) { const l = box(0.03, 0.75, 0.03, RUST); l.position.set(0.2 + s * 0.1, 0.36, -0.08); l.rotation.z = -s * 0.18; g.add(l); }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), STEEL); wheel.position.set(0.2, 0.74, -0.08); g.add(wheel); g.userData.wheel = wheel;
    const ore = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 7), mat(0x6a5a4a, { roughness: 1 })); ore.position.set(0.12, 0.08, 0.3); g.add(ore);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), mat(0x9ab8ff, { emissive: 0x4060ff, emissiveIntensity: 0.6, metalness: 0.9 })); glint.position.set(0.14, 0.17, 0.3); g.add(glint);
  } else {
    const blk = box(0.5, 0.3, 0.36, CONCRETE); blk.position.set(0, 0.15, -0.1); g.add(blk);
    const slit = box(0.34, 0.04, 0.02, GRIP); slit.position.set(0, 0.22, 0.085); g.add(slit);
    const pole = box(0.62, 0.035, 0.035, BAR); pole.position.set(0.1, 0.2, 0.26); pole.rotation.z = 0.05; g.add(pole);
    const post = box(0.05, 0.22, 0.05, DARK); post.position.set(-0.22, 0.11, 0.26); g.add(post);
    for (let i = 0; i < 5; i++) { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0x8a7a5a, { roughness: 1 })); bag.scale.y = 0.55; bag.position.set(-0.28 + i * 0.13, 0.04, 0.12); g.add(bag); }
  }
  return g;
}

// ---------- техника ----------
const YEL = mat(0xc89a28, { metalness: 0.4, roughness: 0.5 }), GLASS = mat(0x223040, { metalness: 0.9, roughness: 0.1 }), LAMP = new THREE.MeshBasicMaterial({ color: 0xffb030 });
const ENGINE = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
export function makeVehicle(kind) {
  const g = new THREE.Group();
  if (kind === 'truck') {
    // промышленный фургон-вездеход: кабина, клетка-кузов, 6 колёс, мигалки
    const cab = box(0.8, 0.6, 0.7, YEL); cab.position.set(0, 0.55, 0.75); g.add(cab);
    const win = box(0.7, 0.22, 0.02, GLASS); win.position.set(0, 0.7, 1.11); g.add(win);
    const bed = box(0.9, 0.18, 1.3, DARK); bed.position.set(0, 0.35, -0.25); g.add(bed);
    for (const x of [-0.44, 0.44]) for (const z of [-0.85, -0.25, 0.35]) { const bar = box(0.04, 0.55, 0.04, STEEL); bar.position.set(x, 0.7, z); g.add(bar); }
    for (const x of [-0.44, 0.44]) { const rail = box(0.04, 0.04, 1.3, STEEL); rail.position.set(x, 0.97, -0.25); g.add(rail); }
    const tarp = box(0.9, 0.04, 1.2, mat(0x4a5040, { roughness: 1 })); tarp.position.set(0, 0.99, -0.25); g.add(tarp);
    for (const x of [-0.5, 0.5]) for (const z of [-0.7, 0, 0.7]) { const w = cyl(0.22, 0.22, 0.16, GRIP, 12); w.rotation.z = Math.PI / 2; w.position.set(x, 0.22, z); g.add(w); }
    const lamps = []; for (const x of [-0.25, 0.25]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), LAMP); l.position.set(x, 0.9, 0.75); g.add(l); lamps.push(l); }
    g.userData.lamps = lamps; g.scale.setScalar(0.11);
  } else {
    // шаттл: фюзеляж, крылья, двигатели вниз
    const hull = box(0.7, 0.4, 1.6, mat(0x8a929a, { metalness: 0.6, roughness: 0.35 })); g.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 4), mat(0x8a929a, { metalness: 0.6, roughness: 0.35 })); nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.z = 1.05; g.add(nose);
    const cockpit = box(0.4, 0.14, 0.4, GLASS); cockpit.position.set(0, 0.24, 0.55); g.add(cockpit);
    for (const s of [-1, 1]) {
      const wing = box(1.0, 0.06, 0.6, DARK); wing.position.set(s * 0.8, -0.05, -0.2); g.add(wing);
      const eng = cyl(0.14, 0.18, 0.4, DARK, 10); eng.position.set(s * 1.1, -0.1, -0.2); g.add(eng);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 10), ENGINE); jet.rotation.x = Math.PI; jet.position.set(s * 1.1, -0.55, -0.2); g.add(jet);
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff3030 : 0x30ff60 })); nav.position.set(s * 1.3, -0.02, -0.2); g.add(nav);
    }
    const ramp = box(0.5, 0.04, 0.5, DARK); ramp.position.set(0, -0.2, -0.95); ramp.rotation.x = -0.4; g.add(ramp); g.userData.ramp = ramp;
    g.scale.setScalar(0.12);
  }
  g.traverse((o) => { if (o.isMesh) o.userData.vehicleRoot = g; });
  return g;
}
// тело на снегу (для сбора труповозкой)
const BODY_G = new THREE.BoxGeometry(0.9, 0.22, 0.34), BODY_V = new THREE.BoxGeometry(0.12, 0.08, 0.2);
export function makeCorpse(side) {
  const g = new THREE.Group(), b = new THREE.Mesh(BODY_G, side === 'fauna' ? CHITIN : DARK); b.position.y = 0.11; g.add(b);
  const v = new THREE.Mesh(BODY_V, visorDim[side] || visorDim.us); v.position.set(0.45, 0.14, 0); g.add(v);
  g.rotation.y = Math.random() * Math.PI * 2; g.scale.setScalar(0.065);
  return g;
}
