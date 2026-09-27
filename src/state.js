// Сохранение между запусками: localStorage с защитой от ошибок (приватный режим, запрет хранилища).
const KEY = 'k47.save.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

const data = load();

export const save = {
  get(key, fallback) { return key in data ? data[key] : fallback; },
  // снимок всего прогресса (без списка сохранений) и восстановление из снимка
  snapshot() { const c = JSON.parse(JSON.stringify(data)); delete c.slots; return c; },
  restore(snap) {
    const slots = data.slots;
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, JSON.parse(JSON.stringify(snap)), { slots });
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* нет хранилища */ }
  },
  // новый цикл: стираем всё, кроме сохранений и кода
  wipe() {
    const keep = { slots: data.slots };
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, keep);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* нет хранилища */ }
  },
  set(key, value) {
    data[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* хранилище недоступно — игра работает без сохранения */ }
  },
};

// код на стикере: четыре цифры, один раз на сохранение
export function stickyCode() {
  let code = save.get('code');
  if (!code) { code = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); save.set('code', code); }
  return code;
}

// код терминала — 12 цифр из трёх частей: корпус монитора, стикер, темнота
function part(key) {
  let v = save.get(key);
  if (!v) { v = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); save.set(key, v); }
  return v;
}
export const codeParts = () => [part('codeA'), stickyCode(), part('codeC')];
