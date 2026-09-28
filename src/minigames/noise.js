// Процедурный шум для рельефа и текстур: value-noise, fbm, гребни.
function hash(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = x - xi, v = y - yi, w = z - zi;
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v), c = w * w * (3 - 2 * w);
  const l = (p, q, t) => p + (q - p) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), a), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), a), b),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), a), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), a), b), c);
}
export function fbm(x, y, z, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += noise(x * f, y * f, z * f) * a; f *= 2.03; a *= 0.5; } return s / (1 - 0.5 ** oct); }
export const ridge = (x, y, z, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += (1 - Math.abs(noise(x * f, y * f, z * f) * 2 - 1)) ** 2 * a; f *= 2.1; a *= 0.5; } return s; };
export const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
