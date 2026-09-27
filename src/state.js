// Сохранение между запусками: localStorage с защитой от ошибок (приватный режим, запрет хранилища).
const KEY = 'k47.save.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

const data = load();

export const save = {
  get(key, fallback) { return key in data ? data[key] : fallback; },
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
