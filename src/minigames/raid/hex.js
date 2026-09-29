// Гексагональная сетка сектора: 20×20, «острые» гексы, смещение нечётных рядов (odd-r).
export const N = 20, R = 0.28, W3 = Math.sqrt(3);
export const SIZE_X = W3 * R * (N + 0.5), SIZE_Z = 1.5 * R * (N - 1) + 2 * R;
const OX = -(W3 * R * (N - 0.5)) / 2, OZ = -(1.5 * R * (N - 1)) / 2;

export const cellXZ = (i) => { const c = i % N, r = (i / N) | 0; return [OX + W3 * R * (c + 0.5 * (r & 1)), OZ + 1.5 * R * r]; };
const cube = (i) => { const c = i % N, r = (i / N) | 0, x = c - (r - (r & 1)) / 2; return [x, r, -x - r]; };
export const dist = (a, b) => { const A = cube(a), B = cube(b); return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])); };
const DIRS = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]];
export const nbrs = (i) => {
  const c = i % N, r = (i / N) | 0;
  return DIRS[r & 1].map(([dc, dr]) => [c + dc, r + dr]).filter(([cc, rr]) => cc >= 0 && cc < N && rr >= 0 && rr < N).map(([cc, rr]) => rr * N + cc);
};
// все клетки в радиусе k
const cache = new Map();
export const within = (i, k) => {
  const key = i * 100 + k; if (cache.has(key)) return cache.get(key);
  const out = []; for (let j = 0; j < N * N; j++) if (dist(i, j) <= k) out.push(j);
  cache.set(key, out); return out;
};
// точка на карте → номер гекса (или −1)
export function hexAt(x, z) {
  const px = x - OX, pz = z - OZ;
  const q = ((W3 / 3) * px - pz / 3) / R, r = ((2 / 3) * pz) / R;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry + q + r), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
  const row = rz, col = rx + (rz - (rz & 1)) / 2;
  return col < 0 || col >= N || row < 0 || row >= N ? -1 : row * N + col;
}
// углы гекса (s — доля радиуса)
export const corners = (i, s = 1) => { const [x, z] = cellXZ(i); return Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 180) * (60 * k - 30); return [x + R * s * Math.cos(a), z + R * s * Math.sin(a)]; }); };
