import * as THREE from 'three';
import { save } from './state.js';
import notes from './story/notes.json';

// ЭЛТ-терминал OBJ-4471. Всё рисуется на canvas, canvas — текстура экрана в 3D.
// locked (код) → warn → agree (галочки) → files (4 архивных файла, листание ◀ ▶)
// → file (условия) → tap (5 касаний за 5 с) → restored / damaged.
const W = 1024, H = 768, PAD = 44;
const PIXEL = '"Press Start 2P", monospace';
const MONO = '"PT Mono", "Courier New", monospace';
const HAND = '"Caveat", cursive';
const RED = '#ff3040', DIM = '#8a1a24', BRIGHT = '#ffd0d6', BG = '#0b0203', OK = '#40ff80';
const TAPS = 5, TAP_TIME = 5;

// текст дисклеймеров — [строка, стиль]; s — сильное (ярче)
const WARN = [
  ['Данный раздел восстановлен из нейрослепка и нейропрофиля клона класса «Актив» (идентификатор К-47).'],
  ['ВНИМАНИЕ. Содержимое архива включает:', 's'],
  ['· сцены исключительной жестокости;'],
  ['· описания эротического характера;'],
  ['· упоминания употребления наркотических веществ;'],
  ['· эпизоды, способные вызвать психологический дискомфорт.'],
  ['Возможны неточности, неполнота, искажения причинно-следственных связей и фрагментарность. Отдельные записи могут не соответствовать действительности.'],
  ['С каждой прочитанной главой носитель изнашивается. Главы 47–49 заперты до выполнения нормы.', 's'],
  ['Читайте с осторожностью.'],
];
const AGREE = [
  ['Соглашение о неразглашении', 'Обязуюсь не распространять, не копировать и не передавать третьим лицам любую информацию, полученную из архива, включая её содержание, структуру и сам факт её существования.'],
  ['Отказ от ответственности', 'Принимаю на себя полную ответственность за возможные психологические, эмоциональные и иные последствия ознакомления с архивом. Корпорация «Vitezstvi» и её представители не несут ответственности за любой ущерб.'],
  ['Отказ от претензий', 'Отказываюсь от любых претензий, исков и требований к оператору системы, персоналу и корпорации, связанных с использованием архива, его содержанием и последствиями.'],
];

// искажение текста: часть букв заменяется «битыми» символами (детерминированно по seed)
function glitch(str, amount, seed) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return [...str].map((c) => (c !== ' ' && r() < amount ? '▓▒░█#%'[Math.floor(r() * 6)] : c)).join('');
}

export class Terminal {
  constructor(book, codeParts) {
    this.book = book;
    this.code = codeParts.join('');
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.state = save.get('agreed') ? 'files' : 'locked';
    this.input = ''; this.checks = [false, false, false];
    this.deny = 0; this.time = 0; this.dirty = true; this.active = false;
    this.page = Math.floor(this.progress / 4); this.buttons = [];
    this.appear = 0; this.file = 0; this.taps = 0; this.tapT = 0; this.flash = 0;
    // события наружу
    this.onKey = this.onPage = this.onDeny = this.onGrant = null;
    this.onRead = null;   // (глава) — открыть полный текст внутри экрана
    this.onExit = null;   // выйти из системы
    this.onZoom = null;   // (0..1) — насколько камера приближается к экрану
    this.onTap = this.onWin = this.onLose = this.onGame = null;
  }

  get progress() { return Math.min(save.get('chapter', 0), this.book.length - 1); }
  get wear() { return save.get('screen', 100); }
  get readMode() { return save.get('readMode', false); }

  go(state) {
    this.state = state; this.appear = 0; this.dirty = true; this.onPage?.();
    this.onZoom?.(['file', 'tap', 'restored', 'damaged'].includes(state) ? 0.3 : 0);
  }

  // ---------- ввод ----------
  key(k) {
    if (this.state === 'tap' && (k === ' ' || k === 'Enter')) { this.hit(); return true; }
    if (this.state !== 'locked') return false;
    if (/^[0-9]$/.test(k)) this.digit(k);
    else if (k === 'Backspace') this.back();
    else if (k === 'Enter') this.submit();
    else return false;
    return true;
  }
  digit(d) { if (this.input.length < 12) { this.input += d; this.onKey?.(); this.dirty = true; } }
  back() { this.input = this.input.slice(0, -1); this.onKey?.(); this.dirty = true; }
  submit() {
    if (this.input.length < 12) return;
    if (this.input === this.code) { this.onGrant?.(); this.go('warn'); }
    else { this.deny = 0.6; this.input = ''; this.onDeny?.(); this.dirty = true; }
  }

  // u, v — координаты касания на экране (0..1, v снизу вверх)
  tap(u, v) {
    if (this.state === 'tap') { this.hit(); return; }
    const x = u * W, y = (1 - v) * H;
    const b = this.buttons.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    b?.act();
  }
  scrollBy(n) { if (this.state === 'files') this.turnPage(Math.sign(n)); }
  turnPage(d) {
    const pages = Math.ceil(this.book.length / 4);
    const p = Math.max(0, Math.min(pages - 1, this.page + d));
    if (p !== this.page) { this.page = p; this.onPage?.(); this.dirty = true; }
  }

  // испытание: 5 касаний за 5 секунд
  startTaps() { this.onGame?.(this.file); }
  hit() {
    if (this.state !== 'tap' || this.tapT <= 0) return;
    this.taps++; this.flash = 0.12; this.onTap?.(this.taps); this.dirty = true;
    if (this.taps >= TAPS) this.finish(true);
  }
  finish(win) {
    const v = Math.max(0, Math.min(100, this.wear + (win ? 6 : -5)));
    save.set('screen', v);
    if (win) {
      save.set('chapter', Math.max(save.get('chapter', 0), Math.min(this.file + 1, this.book.length - 1)));
      const got = save.get('restored', []); if (!got.includes(this.file)) save.set('restored', [...got, this.file]);
      this.onWin?.(this.file);
    } else this.onLose?.();
    this.go(win ? 'restored' : 'damaged');
  }

  // ---------- отрисовка ----------
  update(dt) {
    this.time += dt;
    if (this.deny > 0) { this.deny -= dt; this.dirty = true; }
    if (this.flash > 0) { this.flash -= dt; this.dirty = true; }
    if (this.state === 'tap') { this.tapT -= dt; this.dirty = true; if (this.tapT <= 0) this.finish(false); }
    if (this.appear < 1 && this.active) { this.appear = Math.min(1, this.appear + dt * 2.5); this.dirty = true; }
    const blink = Math.floor(this.time * 2) % 2;
    if (blink !== this.blink) { this.blink = blink; this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
    this.texture.needsUpdate = true;
  }

  text(str, x, y, { color = RED, size = 18, font = PIXEL, glow = 8, align = 'left' } = {}) {
    const g = this.g;
    g.font = `${size}px ${font}`; g.textAlign = align; g.textBaseline = 'top';
    g.fillStyle = color; g.shadowColor = color; g.shadowBlur = glow;
    g.fillText(str, x, y); g.shadowBlur = 0;
    return g.measureText(str).width;
  }
  // перенос строки по ширине; возвращает y после блока
  para(str, x, y, maxW, { size = 21, font = MONO, color = BRIGHT, lh = 1.3, max = 99 } = {}) {
    const g = this.g; g.font = `${size}px ${font}`;
    let line = '', n = 0;
    for (const w of str.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > maxW && line) { if (n < max) this.text(line, x, y, { size, font, color, glow: 0 }); y += size * lh; line = w; n++; } else line = t;
    }
    if (line && n < max) { this.text(n === max - 1 ? line : line, x, y, { size, font, color, glow: 0 }); y += size * lh; }
    return y;
  }
  button(label, x, y, w, h, act, { main = false, disabled = false, size = 18 } = {}) {
    const g = this.g;
    g.fillStyle = disabled ? '#0e0204' : main ? '#3a0710' : '#170307'; g.fillRect(x, y, w, h);
    g.strokeStyle = disabled ? '#3a0a10' : main ? RED : DIM; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    this.text(label, x + w / 2, y + h / 2 - size / 2, { size, color: disabled ? '#4a1a20' : main ? BRIGHT : RED, align: 'center', glow: main ? 8 : 0 });
    if (!disabled) this.buttons.push({ x, y, w, h, act });
  }
  header(title) {
    this.text(title, PAD, PAD - 8, { color: DIM, size: 14 });
    this.text(`НОСИТЕЛЬ ${this.wear}%`, W - PAD, PAD - 8, { color: this.wear > 40 ? DIM : RED, size: 14, align: 'right' });
    this.g.fillStyle = DIM; this.g.fillRect(PAD, PAD + 16, W - PAD * 2, 3);
  }

  draw() {
    const g = this.g;
    this.buttons = [];
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    const shake = this.deny > 0 ? Math.sin(this.time * 80) * 10 * this.deny : 0;
    g.save(); g.translate(shake, 0); g.globalAlpha = Math.min(1, 0.2 + this.appear);
    this[`draw_${this.state}`]();
    g.restore();
    if (this.flash > 0) { g.fillStyle = `rgba(255,60,80,${this.flash * 2})`; g.fillRect(0, 0, W, H); }
    this.drawWear();
    this.drawCRT();
  }

  draw_locked() {
    this.header('OBJ-4471 // ДОСТУП ОГРАНИЧЕН');
    this.text('ВВЕДИТЕ КОД ДОСТУПА', W / 2, 110, { align: 'center', size: 20 });
    const cw = 52, gap = 10, group = 30, total = cw * 12 + gap * 9 + group * 2;
    let x = (W - total) / 2;
    for (let i = 0; i < 12; i++) {
      const filled = i < this.input.length;
      this.g.strokeStyle = this.deny > 0 ? '#ff0000' : filled ? RED : DIM; this.g.lineWidth = 3;
      this.g.strokeRect(x, 160, cw, 64);
      if (filled) this.text(this.input[i], x + cw / 2, 180, { align: 'center', size: 26, color: BRIGHT });
      else if (i === this.input.length && this.blink) { this.g.fillStyle = RED; this.g.fillRect(x + 12, 212, cw - 24, 5); }
      x += cw + (i % 4 === 3 ? group : gap);
    }
    if (this.deny > 0) this.text('ОТКАЗАНО', W / 2, 246, { align: 'center', size: 18, color: '#ff2020' });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'OK'];
    const kw = 170, kh = 84, kx = (W - kw * 3 - 24) / 2, ky = 292;
    keys.forEach((k, i) => {
      const act = k === '<' ? () => this.back() : k === 'OK' ? () => this.submit() : () => this.digit(k);
      this.button(k, kx + (i % 3) * (kw + 12), ky + Math.floor(i / 3) * (kh + 12), kw, kh, act, { main: k === 'OK' });
    });
  }

  draw_warn() {
    this.text('СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ // АРХИВ', PAD, PAD, { size: 17 });
    let y = PAD + 44;
    for (const [t, s] of WARN) y = this.para(t, PAD + (t[0] === '·' ? 24 : 0), y, W - PAD * 2 - 24, { size: 21, color: s ? RED : BRIGHT }) + 8;
    this.button('ПОНЯТНО', W / 2 - 170, H - PAD - 74, 340, 70, () => this.go('agree'), { main: true });
  }

  draw_agree() {
    this.text('ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ // v.47', PAD, PAD, { size: 17 });
    let y = this.para('Для доступа к архиву необходимо принять следующие условия:', PAD, PAD + 42, W - PAD * 2, { size: 20 }) + 10;
    AGREE.forEach(([head, body], i) => {
      const y0 = y, bx = PAD, bw = W - PAD * 2;
      // галочка
      this.g.strokeStyle = this.checks[i] ? RED : DIM; this.g.lineWidth = 4; this.g.strokeRect(bx + 4, y0 + 6, 34, 34);
      if (this.checks[i]) { this.g.fillStyle = RED; this.g.fillRect(bx + 13, y0 + 15, 16, 16); }
      this.text(head.toUpperCase(), bx + 56, y0 + 10, { size: 14, color: this.checks[i] ? BRIGHT : RED, glow: 0 });
      const y1 = this.para(body, bx + 56, y0 + 36, bw - 60, { size: 18, color: this.checks[i] ? BRIGHT : '#b08890', lh: 1.25 });
      this.buttons.push({ x: bx, y: y0, w: bw, h: y1 - y0, act: () => { this.checks[i] = !this.checks[i]; this.onKey?.(); this.dirty = true; } });
      y = y1 + 12;
    });
    const all = this.checks.every(Boolean);
    this.button('ОТКАЗАТЬСЯ', PAD, H - PAD - 70, 380, 66, () => { this.checks = [false, false, false]; this.input = ''; this.deny = 0.6; this.onDeny?.(); this.go('locked'); });
    this.button('ПРИНЯТЬ ВСЁ', W - PAD - 380, H - PAD - 70, 380, 66, () => { save.set('agreed', true); this.go('files'); }, { main: true, disabled: !all });
  }

  // меню: слева и справа большие стрелки, по центру 4 архивных файла 2×2
  draw_files() {
    this.header('OBJ-4471 // АРХИВ ЦИКЛА');
    const pages = Math.ceil(this.book.length / 4);
    const top = 96, bh = H - top - 110, aw = 110;
    this.button('<', PAD, top, aw, bh, () => this.turnPage(-1), { disabled: this.page === 0, size: 40 });
    this.button('>', W - PAD - aw, top, aw, bh, () => this.turnPage(1), { disabled: this.page >= pages - 1, size: 40 });
    const gx = PAD + aw + 20, gw = W - gx * 2, cw = (gw - 20) / 2, ch = (bh - 20) / 2;
    const restored = save.get('restored', []);
    for (let k = 0; k < 4; k++) {
      const i = this.page * 4 + k;
      if (i >= this.book.length) break;
      const x = gx + (k % 2) * (cw + 20), y = top + Math.floor(k / 2) * (ch + 20);
      const locked = i > this.progress, done = restored.includes(i);
      const g = this.g;
      g.fillStyle = locked ? '#0c0204' : '#150307'; g.fillRect(x, y, cw, ch);
      g.strokeStyle = locked ? '#2a0810' : done ? '#1a6a30' : i === this.progress ? RED : DIM; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
      // значок файла: папка с загнутым углом
      g.strokeStyle = locked ? '#2a0810' : DIM; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 24, y + 26); g.lineTo(x + 62, y + 26); g.lineTo(x + 76, y + 40); g.lineTo(x + 76, y + 84); g.lineTo(x + 24, y + 84); g.closePath(); g.stroke();
      this.text(String(i).padStart(3, '0'), x + cw - 20, y + 22, { size: 16, align: 'right', color: locked ? '#3a0a10' : DIM, glow: 0 });
      if (locked) this.text('ЗАПЕРТ', x + cw / 2, y + ch - 60, { size: 14, align: 'center', color: '#3a0a10', glow: 0 });
      else {
        this.para(this.book[i].title.replace(/\.$/, '').toUpperCase(), x + 22, y + 104, cw - 40, { size: 16, font: PIXEL, color: BRIGHT, lh: 1.5, max: 2 });
        this.text(done ? 'ВОССТАНОВЛЕН' : 'ПОВРЕЖДЁН', x + 22, y + ch - 34, { size: 11, color: done ? OK : DIM, glow: 0 });
        this.buttons.push({ x, y, w: cw, h: ch, act: () => { this.file = i; this.go('file'); } });
      }
    }
    this.text(`${this.page + 1} / ${pages}`, W / 2, H - PAD - 50, { size: 14, align: 'center', color: DIM });
    this.button(this.readMode ? 'РЕЖИМ: ЧТЕНИЕ' : 'РЕЖИМ: ИГРА', PAD, H - PAD - 30, 300, 44, () => { save.set('readMode', !this.readMode); this.onKey?.(); this.dirty = true; }, { size: 12 });
    this.button('ВЫЙТИ', W - PAD - 200, H - PAD - 30, 200, 44, () => this.onExit?.(), { size: 12 });
  }

  // окно перед восстановлением: как в референсе — статус, название, искажённый фрагмент, условия
  draw_file() {
    const i = this.file, F = notes[i] || {}, done = save.get('restored', []).includes(i);
    this.header(`ГЛАВА ${i} · ФРАГМЕНТ ${done ? 'ВОССТАНОВЛЕН' : 'ПОВРЕЖДЁН'}`);
    const title = `«${this.book[i].title.replace(/\.$/, '')}»${F.name ? ` — ${F.name}` : ''}`;
    let y = this.para(title.toUpperCase(), PAD, 90, W - PAD * 2, { size: 20, font: PIXEL, color: BRIGHT, lh: 1.5, max: 2 }) + 10;
    const frag = F.text || this.book[i].paragraphs.find((p) => p.length > 80) || this.book[i].paragraphs[0];
    y = this.para(done ? frag : glitch(frag, 0.38, i), PAD, y, W - PAD * 2, { size: 21, color: done ? BRIGHT : '#c89098', max: 7 }) + 14;
    this.g.fillStyle = DIM; this.g.fillRect(PAD, y, W - PAD * 2, 2); y += 16;
    if (this.readMode) y = this.para('Режим чтения: файл открывается без восстановления. Носитель не меняется.', PAD, y, W - PAD * 2, { size: 20, color: RED });
    else {
      y = this.para(`Коснитесь экрана ${TAPS} раз за ${TAP_TIME} секунд. Успех: носитель +6, фрагмент и запись блокнота восстановлены. Провал: носитель −5.`, PAD, y, W - PAD * 2, { size: 20, color: RED });
      this.text('КАСАНИЕ ЭКРАНА · ПРОБЕЛ', PAD, y + 6, { size: 12, color: DIM, glow: 0 });
    }
    const by = H - PAD - 76;
    this.button('< НАЗАД', PAD, by, 210, 70, () => this.go('files'), { size: 14 });
    if (this.readMode) this.button('ЧИТАТЬ', W - PAD - 380, by, 380, 70, () => this.onRead?.(i), { main: true });
    else {
      this.button(done ? 'ЧИТАТЬ' : 'ЧИТАТЬ ПОВРЕЖДЁННЫМ', PAD + 226, by, 340, 70, () => this.onRead?.(i), { size: 13 });
      this.button(done ? 'ПРОЖИТЬ ЕЩЁ РАЗ' : 'ВОССТАНОВИТЬ', W - PAD - 334, by, 334, 70, () => this.startTaps(), { main: true, size: 15 });
    }
  }

  draw_tap() {
    this.header(`ВОССТАНОВЛЕНИЕ ФАЙЛА ${String(this.file).padStart(3, '0')}`);
    this.text('КАСАЙТЕСЬ ЭКРАНА', W / 2, 140, { size: 22, align: 'center', color: BRIGHT });
    this.text(`${this.taps} / ${TAPS}`, W / 2, 250, { size: 90, align: 'center', color: RED, glow: 20 });
    const k = Math.max(0, this.tapT / TAP_TIME), bw = W - PAD * 4;
    this.g.strokeStyle = DIM; this.g.lineWidth = 4; this.g.strokeRect(PAD * 2, 470, bw, 40);
    this.g.fillStyle = k > 0.3 ? RED : '#ff0000'; this.g.fillRect(PAD * 2 + 6, 476, (bw - 12) * k, 28);
    this.text(`${Math.max(0, this.tapT).toFixed(1)} С`, W / 2, 540, { size: 18, align: 'center', color: DIM });
  }

  // победа: файл восстановлен — кусочек блокнота и кусочек главы
  draw_restored() {
    const i = this.file, g = this.g;
    this.header(`ФАЙЛ ${String(i).padStart(3, '0')} // НОСИТЕЛЬ +6`);
    this.text('ФАЙЛ ВОССТАНОВЛЕН', W / 2, 84, { size: 24, align: 'center', color: OK, glow: 14 });
    // обрывок блокнотной страницы
    const nx = PAD, ny = 136, nw = 400, nh = 420;
    g.save(); g.translate(nx + nw / 2, ny + nh / 2); g.rotate(-0.03);
    g.fillStyle = '#d6ccb2'; g.fillRect(-nw / 2, -nh / 2, nw, nh);
    g.strokeStyle = 'rgba(60,80,140,.35)'; g.lineWidth = 2;
    for (let yy = -nh / 2 + 50; yy < nh / 2; yy += 34) { g.beginPath(); g.moveTo(-nw / 2, yy); g.lineTo(nw / 2, yy); g.stroke(); }
    g.strokeStyle = 'rgba(170,40,40,.5)'; g.beginPath(); g.moveTo(-nw / 2 + 40, -nh / 2); g.lineTo(-nw / 2 + 40, nh / 2); g.stroke();
    g.restore();
    this.para(notes[i]?.note || '...', nx + 50, ny + 22, nw - 70, { size: 28, font: HAND, color: '#2a2440', lh: 1.21 });
    // обрывок главы
    const cx = nx + nw + 30, cw = W - cx - PAD;
    this.text('ФРАГМЕНТ ЗАПИСИ:', cx, ny, { size: 13, color: DIM });
    this.para(notes[i]?.text || this.book[i].paragraphs.find((p) => p.length > 80) || this.book[i].paragraphs[0], cx, ny + 32, cw, { size: 19, color: BRIGHT, max: 14 });
    this.button('< К ФАЙЛАМ', PAD, H - PAD - 80, 360, 72, () => this.go('files'));
    this.button('ЧИТАТЬ ГЛАВУ', W - PAD - 420, H - PAD - 80, 420, 72, () => this.onRead?.(i), { main: true });
  }

  draw_damaged() {
    this.header(`ФАЙЛ ${String(this.file).padStart(3, '0')} // НОСИТЕЛЬ −5`);
    this.text('ФАЙЛ ПОВРЕЖДЁН', W / 2, 200, { size: 34, align: 'center', color: '#ff2020', glow: 16 });
    this.para('Не удалось восстановить раздел архива. Данные утеряны частично. Носитель изношен.', PAD + 100, 300, W - PAD * 2 - 200, { size: 22 });
    this.button('< К ФАЙЛАМ', PAD, H - PAD - 90, 360, 80, () => this.go('files'));
    this.button('ПОВТОРИТЬ', W - PAD - 380, H - PAD - 90, 380, 80, () => this.startTaps(), { main: true });
  }

  // износ носителя: чем ниже состояние, тем больше царапин, трещин и битых строк
  drawWear() {
    const g = this.g, wear = 1 - this.wear / 100;
    if (wear <= 0) return;
    let s = 4711;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.save();
    g.strokeStyle = `rgba(255,220,220,${0.12 + wear * 0.25})`; g.lineWidth = 1.5;
    for (let i = 0; i < Math.floor(wear * 40); i++) {
      const x = r() * W, y = r() * H, l = 40 + r() * 200, a = r() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    if (wear > 0.35) {
      g.strokeStyle = `rgba(0,0,0,${0.5 + wear * 0.4})`; g.lineWidth = 3;
      for (let k = 0; k < Math.floor((wear - 0.3) * 8); k++) {
        let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < 8; i++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 120; g.lineTo(x, y); }
        g.stroke();
      }
    }
    const n = Math.floor(wear * 6);
    for (let i = 0; i < n; i++) {
      const y = (r() * H + this.time * 40 * (i + 1)) % H;
      g.fillStyle = `rgba(255,40,60,${0.05 + wear * 0.1})`; g.fillRect(0, y, W, 2 + r() * 6);
    }
    if (n) this.dirty = true;
    g.restore();
  }

  drawCRT() {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,.28)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.85)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}
