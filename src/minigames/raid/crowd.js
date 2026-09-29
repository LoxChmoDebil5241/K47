import * as THREE from 'three';
import { war as snd } from '../../audio.js';
import { makePawn, makeVehicle, makeCorpse } from './pawns.js';
import { cellXZ, R } from './hex.js';

// Живые пешки на карте сектора: строй, рассредоточение, укрытия, отход с огнём,
// выход разведчика, коллизии, техника, тела, вспышки и трассеры боя.
// Режимы отряда: wait — стоят вразнобой; attack — строй (Б впереди, С парами колонной, Л сзади);
// arc — дуга лицом к нападающим; fortify — дуга, стенки/ямы; retreat — вразнобой, огрызаются.
const MIN_D = { L: 0.045, M: 0.05, H: 0.065, T: 0.04, S: 0.055, F: 0.09 };

export function makeCrowd(sv, sec, visible) {
  const P = new Map(), V = new Map(), C = new Map(), S = new Map();
  let fx = [], tracers = [], onIdle = null;
  const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 6), 3));
  const tlines = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  tlines.frustumCulled = false; sv.group.add(tlines);
  const tmp = new THREE.Vector3();

  const state = (u) => S.get(u.id) || { mode: 'wait', dir: [0, 1] };
  // приказ отряду: режим строя и направление
  function order(u, mode, o = {}) { S.set(u.id, { mode, dir: o.dir || state(u).dir || [0, 1], from: o.from, scout: o.scout, t: 0, dur: o.dur || 0 }); }
  // направление от клетки a к клетке b
  const dirTo = (a, b) => { const [ax, az] = cellXZ(a), [bx, bz] = cellXZ(b), l = Math.hypot(bx - ax, bz - az) || 1; return [(bx - ax) / l, (bz - az) / l]; };

  // места пешек в клетке по режиму
  function place(u, c) {
    const [cx, cz] = cellXZ(c.i), st = state(u), [fx0, fz0] = st.dir, sx = -fz0, sz = fx0, out = [];
    const bySize = { H: [], M: [], L: [], T: [], S: [], F: [] };
    u.pawns.forEach((p) => bySize[p.size].push(p));
    const put = (p, x, z, face) => out.push([p, cx + x, cz + z, face]);
    if (st.mode === 'attack') {
      for (const p of [...bySize.H, ...bySize.F]) put(p, fx0 * R * 0.55 + sx * p.ox * R * 0.45 + fx0 * p.oz * R * 0.1, fz0 * R * 0.55 + sz * p.ox * R * 0.45 + fz0 * p.oz * R * 0.1, Math.atan2(fx0, fz0));
      bySize.M.forEach((p, k) => { const pair = k >> 1, lane = k % 2 ? 1 : -1; put(p, fx0 * (R * 0.2 - pair * R * 0.2) + sx * lane * R * 0.12, fz0 * (R * 0.2 - pair * R * 0.2) + sz * lane * R * 0.12, Math.atan2(fx0, fz0)); });
      for (const p of [...bySize.L, ...bySize.T, ...bySize.S]) put(p, -fx0 * R * 0.55 + sx * p.ox * R * 0.5 + fx0 * p.oz * R * 0.12, -fz0 * R * 0.55 + sz * p.ox * R * 0.5 + fz0 * p.oz * R * 0.12, Math.atan2(fx0, fz0));
    } else if (st.mode === 'arc' || st.mode === 'fortify') {
      const seq = [...bySize.L.slice(0, Math.ceil(bySize.L.length / 2)), ...bySize.M.slice(0, Math.ceil(bySize.M.length / 2)), ...bySize.H, ...bySize.F, ...bySize.M.slice(Math.ceil(bySize.M.length / 2)), ...bySize.L.slice(Math.ceil(bySize.L.length / 2)), ...bySize.T, ...bySize.S];
      const n = seq.length, base = Math.atan2(fx0, fz0);
      seq.forEach((p, j) => {
        const th = base + (n > 1 ? -1.1 + (2.2 * j) / (n - 1) : 0), r = R * (0.5 + p.oz * 0.06);
        put(p, Math.sin(th) * r, Math.cos(th) * r, base);
      });
    } else {
      for (const p of u.pawns) put(p, p.ox * R * 0.58, p.oz * R * 0.58, null);
    }
    return out;
  }

  // сверка мешей с данными: пешки видимых отрядов, тела, техника
  function sync(snap = false) {
    if (fx.length) return false;
    const seen = new Set(), seenC = new Set();
    for (const c of sec.cells) {
      if (visible(c)) {
        for (const u of c.units) {
          for (const [p, x, z, face] of place(u, c)) {
            seen.add(p.id);
            let m = P.get(p.id);
            if (!m) {
              const g = makePawn(p, u.side); sv.group.add(g);
              m = { g, target: new THREE.Vector3(), dying: 0, face: null, back: 0 }; P.set(p.id, m);
              g.position.set(x, sv.h(x, z) + (u.dropping ? 3 + Math.random() : 0), z);
            }
            m.u = u; m.g.userData.squad = u; m.target.set(x, sv.h(x, z), z); m.face = face;
            if (snap) m.g.position.copy(m.target);
            const fort = u.stance === 'fortify';
            m.g.userData.dig?.(fort);
            m.g.userData.pose(fort || state(u).mode === 'arc' ? (p.size === 'H' ? 'fire' : 'fire') : 'idle');
          }
          u.dropping = false;
        }
      }
      // тела
      if (c.scouted || c.units.some((u) => u.side === 'us')) {
        c.corpses.forEach((b, k) => {
          seenC.add(b.id);
          if (C.has(b.id)) return;
          const [cx, cz] = cellXZ(c.i), a = b.id * 2.39, r = R * (0.2 + ((b.id * 37) % 60) / 100);
          const g = makeCorpse(b.side), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          g.position.set(x, sv.h(x, z), z); sv.group.add(g); C.set(b.id, g);
        });
      }
    }
    for (const [id, m] of P) if (!seen.has(id) && !m.dying) { m.g.removeFromParent(); P.delete(id); }
    for (const [id, g] of C) if (!seenC.has(id)) { g.removeFromParent(); C.delete(id); }
    // техника
    const seenV = new Set();
    for (const v of sec.vehicles) {
      if (!visible(sec.cells[v.cell]) && v.side !== 'us') continue;
      seenV.add(v.id);
      let m = V.get(v.id);
      const [cx, cz] = cellXZ(v.cell), x = cx + (v.kind === 'truck' ? R * 0.35 : 0), z = cz + (v.kind === 'truck' ? -R * 0.3 : 0);
      const y = sv.h(x, z) + (v.kind === 'shuttle' ? 0.55 : 0);
      if (!m) { const g = makeVehicle(v.kind); g.userData.vehicle = v; sv.group.add(g); m = { g, target: new THREE.Vector3() }; V.set(v.id, m); g.position.set(x, y + (v.dropping ? 3 : 0), z); v.dropping = false; }
      m.target.set(x, y, z); if (snap) m.g.position.copy(m.target);
    }
    for (const [id, m] of V) if (!seenV.has(id)) { m.g.removeFromParent(); V.delete(id); }
    return true;
  }

  // бой: вспышки, трассеры, звук; после — падение погибших
  function fight(attIds, defIds, deadIds, to, close, dur = 2.6) {
    const [tx, tz] = cellXZ(to);
    fx.push({ t: 0, dur, att: attIds, def: defIds, dead: deadIds, close, to: [tx, tz], snd: 0 });
  }
  // разведка: снайпер (или другой) выходит к клетке и возвращается
  function scoutWalk(u, cell) {
    const walker = u.pawns.find((p) => p.size === 'L') || u.pawns[0]; if (!walker) return;
    const m = P.get(walker.id); if (!m) return;
    const [tx, tz] = cellXZ(cell), p = m.g.position, dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz), k = Math.min(1, (R * 2.2) / (l || 1)) * 0.9;
    m.walk = { x: p.x + dx * k, z: p.z + dz * k, t: 0, dur: 3.2 };
  }
  const centroid = (u) => {
    let n = 0; tmp.set(0, 0, 0);
    for (const p of u.pawns) { const m = P.get(p.id); if (m && !m.dying) { tmp.add(m.g.position); n++; } }
    return n ? tmp.divideScalar(n).clone() : null;
  };
  const vehiclePos = (v) => V.get(v.id)?.g.position.clone() || null;

  function update(dt, t) {
    // движение и повороты
    for (const [id, m] of P) {
      if (m.dying) {
        m.dying += dt; m.g.rotation.x = -Math.min(1, m.dying / 0.5) * Math.PI / 2;
        if (m.dying > 1.6) { m.g.removeFromParent(); P.delete(id); }
        continue;
      }
      let goal = m.target;
      if (m.walk) {
        m.walk.t += dt; if (m.walk.t > m.walk.dur) m.walk = null;
        else if (m.walk.t < m.walk.dur * 0.55) { goal = tmp.set(m.walk.x, sv.h(m.walk.x, m.walk.z), m.walk.z); }
      }
      const dx = goal.x - m.g.position.x, dz = goal.z - m.g.position.z, dy = goal.y - m.g.position.y, l = Math.hypot(dx, dz);
      const st = m.u ? state(m.u) : { mode: 'wait' };
      if (Math.abs(dy) > 0.3) m.g.position.y += Math.sign(dy) * Math.min(Math.abs(dy), dt * 4);
      if (l > 0.004) {
        const sp = (st.mode === 'attack' ? 0.35 : st.mode === 'retreat' ? 0.3 : 0.22) * dt, k = Math.min(1, sp / l);
        m.g.position.x += dx * k; m.g.position.z += dz * k;
        m.g.position.y += (sv.h(m.g.position.x, m.g.position.z) - m.g.position.y) * Math.min(1, dt * 10);
        // отход: иногда разворачиваются и стреляют в ответ
        if (st.mode === 'retreat' && st.from != null && Math.random() < dt * 0.8) m.back = 0.6;
        if (m.back > 0) { m.back -= dt; const [bx, bz] = dirTo(st.from ?? 0, m.u.cell); m.g.rotation.y = Math.atan2(-bx, -bz); m.g.userData.pose('fire'); m.g.userData.flash(Math.random() < 0.3); if (Math.random() < dt * 2) snd.shot(m.g.userData.pawn.main); }
        else { m.g.rotation.y = Math.atan2(dx, dz); if (!m.walk) m.g.userData.flash(false); }
      } else if (m.face != null) m.g.rotation.y += ((m.face - m.g.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 5);
    }
    // ожидание: изредка кто-то переминается на месте
    if (Math.random() < dt * 0.5) {
      const ms = [...P.values()].filter((m) => m.u && state(m.u).mode === 'wait' && m.u.stance !== 'fortify' && !m.dying);
      const m = ms[Math.floor(Math.random() * ms.length)];
      if (m) { const p = m.g.userData.pawn; p.ox = Math.max(-1, Math.min(1, p.ox + (Math.random() - 0.5) * 0.4)); p.oz = Math.max(-1, Math.min(1, p.oz + (Math.random() - 0.5) * 0.4)); const c = sec.cells[m.u.cell]; if (c) { const [cx, cz] = cellXZ(c.i); m.target.set(cx + p.ox * R * 0.58, 0, cz + p.oz * R * 0.58); m.target.y = sv.h(m.target.x, m.target.z); } }
    }
    // коллизии: пешки держат дистанцию
    const grid = new Map(), alive = [...P.values()].filter((m) => !m.dying);
    for (const m of alive) { const k = `${Math.floor(m.g.position.x / 0.1)},${Math.floor(m.g.position.z / 0.1)}`; (grid.get(k) || grid.set(k, []).get(k)).push(m); }
    for (const m of alive) {
      const gx = Math.floor(m.g.position.x / 0.1), gz = Math.floor(m.g.position.z / 0.1), a = m.g.position;
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        for (const o of grid.get(`${gx + ix},${gz + iz}`) || []) {
          if (o === m) continue;
          const b = o.g.position, dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
          const need = (MIN_D[m.g.userData.pawn.size] + MIN_D[o.g.userData.pawn.size]) / 2;
          if (d < need && d > 1e-5) { const push = (need - d) * 0.5; a.x += (dx / d) * push; a.z += (dz / d) * push; }
          else if (d <= 1e-5) a.x += 0.002;
        }
      }
    }
    // техника
    for (const m of V.values()) {
      const d = m.target.clone().sub(m.g.position), l = d.length();
      if (l > 0.004) { m.g.position.addScaledVector(d, Math.min(1, (dt * 0.9) / l)); if (Math.hypot(d.x, d.z) > 0.01) m.g.rotation.y = Math.atan2(d.x, d.z); }
      if (m.g.userData.lamps) m.g.userData.lamps.forEach((x, k) => (x.visible = Math.sin(t * 6 + k * Math.PI) > 0));
      if (m.g.userData.vehicle?.kind === 'shuttle') m.g.position.y += Math.sin(t * 2) * 0.0008;
    }
    // бои
    tracers = tracers.filter((x) => (x.life -= dt) > 0);
    for (const f of [...fx]) {
      f.t += dt; f.snd -= dt;
      const live = (ids) => ids.map((id) => P.get(id)).filter((m) => m && !m.dying);
      const A = live(f.att), D = live(f.def);
      for (const [grp, other] of [[A, D], [D, A]]) {
        for (const m of grp) {
          const o = other.length ? other[Math.floor(Math.random() * other.length)].g.position : new THREE.Vector3(f.to[0], 0, f.to[1]);
          m.g.rotation.y = Math.atan2(o.x - m.g.position.x, o.z - m.g.position.z);
          const p = m.g.userData.pawn;
          m.g.userData.pose(f.close && (p.size === 'H' || p.size === 'L') ? 'melee' : 'fire');
          m.g.userData.flash(Math.random() < 0.25);
          if (Math.random() < dt * 5 && tracers.length < 80 && other.length) {
            const a = m.g.position, b = other[Math.floor(Math.random() * other.length)].g.position;
            tracers.push({ a: [a.x, a.y + 0.05, a.z], b: [b.x + (Math.random() - 0.5) * 0.04, b.y + 0.04, b.z], life: 0.07 });
          }
        }
      }
      if (f.snd <= 0 && (A.length || D.length)) {
        const m = [...A, ...D][Math.floor(Math.random() * (A.length + D.length))], p = m.g.userData.pawn;
        snd.shot(f.close && p.size !== 'M' ? p.close : p.main); f.snd = 0.3 + Math.random() * 0.25;
      }
      if (f.t >= f.dur) {
        fx = fx.filter((x) => x !== f);
        for (const m of [...A, ...D]) m.g.userData.flash(false);
        for (const id of f.dead) { const m = P.get(id); if (m) m.dying = 0.001; }
        if (f.dead.length) snd.fall();
        if (!fx.length) onIdle?.();
      }
    }
    const tp = tgeo.attributes.position.array; tp.fill(0);
    tracers.forEach((x, i) => tp.set([...x.a, ...x.b], i * 6));
    tgeo.attributes.position.needsUpdate = true; tgeo.setDrawRange(0, tracers.length * 2);
  }

  return {
    sync, order, fight, scoutWalk, update, centroid, vehiclePos, state, dirTo,
    get busy() { return fx.length > 0; },
    set onIdle(f) { onIdle = f; },
    meshes: () => [...P.values()].filter((m) => !m.dying).map((m) => m.g),
    vehicleMeshes: () => [...V.values()].map((m) => m.g),
    dispose() { for (const m of P.values()) m.g.removeFromParent(); for (const m of V.values()) m.g.removeFromParent(); for (const g of C.values()) g.removeFromParent(); tlines.removeFromParent(); P.clear(); V.clear(); C.clear(); },
  };
}
