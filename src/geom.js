import * as THREE from 'three';

// Общие помощники для геометрии. UV задаются в метрах × плотность,
// поэтому текстура ложится с одинаковым масштабом на объекты любого размера — без растяжек и швов.

export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

// density — сколько повторов текстуры на метр
export function boxUV(geo, density = 1) {
  const { width: w, height: h, depth: d } = geo.parameters;
  const uv = geo.attributes.uv;
  // порядок граней BoxGeometry: +x, -x, +y, -y, +z, -z — по 4 вершины
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] * density, uv.getY(k) * dims[f][1] * density);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export function planeUV(geo, density = 1) {
  const { width: w, height: h } = geo.parameters;
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * density, uv.getY(k) * h * density);
  uv.needsUpdate = true;
  return geo;
}

// UV для ExtrudeGeometry/ShapeGeometry уже в единицах формы (метрах) — просто масштабируем
export function scaleUV(geo, density = 1) {
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * density, uv.getY(k) * density);
  uv.needsUpdate = true;
  return geo;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0, parent, density = 2) {
  const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), density), material);
  m.position.set(x, y, z); parent?.add(m); return m;
}

export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z); parent?.add(m); return m;
}

// скругление углов многоугольника дугой постоянного радиуса r (не больше половины соседних рёбер)
export function roundPoly(pts, r, seg = 6) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const rr = Math.min(r, da.length() / 2, db.length() / 2);
    const p0 = p.clone().add(da.normalize().multiplyScalar(rr)), p1 = p.clone().add(db.normalize().multiplyScalar(rr));
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, u = 1 - t;
      out.push(new THREE.Vector2(u * u * p0.x + 2 * u * t * p.x + t * t * p1.x, u * u * p0.y + 2 * u * t * p.y + t * t * p1.y));
    }
  }
  return out;
}

// canvas → текстура
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
