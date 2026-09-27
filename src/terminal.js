import * as THREE from 'three';
import { save } from './state.js';

// ЭЛТ-терминал OBJ-4471. Всё рисуется на canvas, canvas — текстура экрана в 3D.
// Состояния: locked (код) → warn → agree (два дисклеймера) → menu ⇄ chapters.
// Сам текст главы и мини-игры открываются «внутри экрана» (см. ui/reader.js).
const W = 1024, H = 768, PAD = 48;
const PIXEL = '"Press Start 2P", monospace';
const MONO = '"PT Mono", "Courier New", monospace';
const RED = '#ff3040', DIM = '#8a1a24', BRIGHT = '#ffd0d6', BG = '#0b0203', OK = '#40ff80';

const WARN = [
  ['СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ // АРХИВ', PIXEL, 18, RED],
  ['', MONO, 22],
  ['Раздел восстановлен из нейрослепка клона', MONO, 23, BRIGHT],
  ['класса «Актив» (идентификатор К-47).', MONO, 23, BRIGHT],
  ['', MONO, 14],
  ['Архив содержит:', MONO, 23, RED],
  ['  · сцены исключительной жестокости;', MONO, 23, BRIGHT],
  ['  · описания эротического характера;', MONO, 23, BRIGHT],
  ['  · упоминания наркотических веществ;', MONO, 23, BRIGHT],
  ['  · эпизоды, вызывающие дискомфорт.', MONO, 23, BRIGHT],
  ['', MONO, 14],
  ['Возможны искажения и фрагментарность.', MONO, 23, BRIGHT],
  ['С каждой главой носитель изнашивается.', MONO, 23, RED],
];
const AGREE = [
  ['СОГЛАШЕНИЕ // v.47', PIXEL, 18, RED],
  ['', MONO, 22],
  ['1. НЕРАЗГЛАШЕНИЕ', PIXEL, 13, RED],
  ['Не распространять содержимое архива,', MONO, 22, BRIGHT],
  ['его структуру и сам факт существования.', MONO, 22, BRIGHT],
  ['', MONO, 12],
  ['2. ОТВЕТСТВЕННОСТЬ', PIXEL, 13, RED],
  ['Последствия ознакомления — на мне.', MONO, 22, BRIGHT],
  ['«Vitezstvi» ущерба не несёт.', MONO, 22, BRIGHT],
  ['', MONO, 12],
  ['3. ОТКАЗ ОТ ПРЕТЕНЗИЙ', PIXEL, 13, RED],
  ['Никаких исков к оператору и персоналу.', MONO, 22, BRIGHT],
];

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
    this.state = save.get('agreed') ? 'menu' : 'locked';
    this.input = '';
    this.deny = 0; this.time = 0; this.dirty = true; this.active = false;
    this.scroll = 0; this.buttons = [];
    this.appear = 0; // печать экрана: доля показанных строк
    // события наружу
    this.onKey = null; this.onPage = null; this.onDeny = null; this.onGrant = null;
    this.onRead = null;   // (глава) — затянуть в экран и открыть главу
    this.onExit = null;   // выйти из системы
  }

  get progress() { return save.get('chapter', 0); }
  get wear() { return save.get('screen', 100); }
  get readMode() { return save.get('readMode', false); }

  go(state) { this.state = state; this.scroll = 0; this.appear = 0; this.dirty = true; this.onPage?.(); }

  // ---------- ввод ----------
  key(k) {
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
    const x = u * W, y = (1 - v) * H;
    const b = this.buttons.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    b?.act();
  }
  scrollBy(n) {
    if (this.state !== 'chapters') return;
    this.scroll = Math.max(0, Math.min(this.book.length - this.rows, this.scroll + n));
    this.dirty = true;
  }
  get rows() { return 11; }

  // ---------- отрисовка ----------
  update(dt) {
    this.time += dt;
    if (this.deny > 0) { this.deny -= dt; this.dirty = true; }
    if (this.appear < 1 && this.active) { this.appear = Math.min(1, this.appear + dt * 2.2); this.dirty = true; }
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
  // пиксельная кнопка на экране, запоминается зона нажатия
  button(label, x, y, w, h, act, { main = false, disabled = false } = {}) {
    const g = this.g;
    g.fillStyle = main ? '#3a0710' : '#170307'; g.fillRect(x, y, w, h);
    g.strokeStyle = disabled ? '#3a0a10' : main ? RED : DIM; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    this.text(label, x + w / 2, y + h / 2 - 9, { color: disabled ? '#4a1a20' : main ? BRIGHT : RED, align: 'center', glow: main ? 8 : 0 });
    if (!disabled) this.buttons.push({ x, y, w, h, act });
  }
  header(title) {
    this.text(title, PAD, PAD, { color: DIM, size: 16 });
    const st = `НОСИТЕЛЬ ${this.wear}%`;
    this.text(st, W - PAD, PAD, { color: this.wear > 40 ? DIM : RED, size: 16, align: 'right' });
    this.g.fillStyle = DIM; this.g.fillRect(PAD, PAD + 30, W - PAD * 2, 3);
  }
  // блок строк, печатается сверху вниз
  lines(list, y0) {
    const n = Math.ceil(list.length * this.appear);
    let y = y0;
    list.slice(0, n).forEach(([t, font, size, color]) => { if (t) this.text(t, PAD, y, { font, size, color: color || RED, glow: 4 }); y += size + 12; });
    return y;
  }

  draw() {
    const g = this.g;
    this.buttons = [];
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    const shake = this.deny > 0 ? Math.sin(this.time * 80) * 10 * this.deny : 0;
    g.save(); g.translate(shake, 0);
    this[`draw_${this.state}`]();
    g.restore();
    this.drawWear();
    this.drawCRT();
  }

  draw_locked() {
    this.header('OBJ-4471 // ДОСТУП ОГРАНИЧЕН');
    this.text('ВВЕДИТЕ КОД ДОСТУПА', W / 2, 120, { align: 'center', size: 20 });
    // 12 ячеек тремя группами по 4
    const cw = 52, gap = 10, group = 30;
    const total = cw * 12 + gap * 9 + group * 2;
    let x = (W - total) / 2;
    for (let i = 0; i < 12; i++) {
      const filled = i < this.input.length;
      const cur = i === this.input.length && this.blink;
      this.g.strokeStyle = this.deny > 0 ? '#ff0000' : filled ? RED : DIM; this.g.lineWidth = 3;
      this.g.strokeRect(x, 170, cw, 64);
      if (filled) this.text(this.input[i], x + cw / 2, 190, { align: 'center', size: 26, color: BRIGHT });
      else if (cur) { this.g.fillStyle = RED; this.g.fillRect(x + 12, 222, cw - 24, 5); }
      x += cw + (i % 4 === 3 ? group : gap);
    }
    if (this.deny > 0) this.text('ОТКАЗАНО', W / 2, 256, { align: 'center', size: 18, color: '#ff2020' });
    // экранная клавиатура 3×4
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    const kw = 170, kh = 84, kx = (W - kw * 3 - 24) / 2, ky = 300;
    keys.forEach((k, i) => {
      const cx = kx + (i % 3) * (kw + 12), cy = ky + Math.floor(i / 3) * (kh + 12);
      const act = k === '⌫' ? () => this.back() : k === 'OK' ? () => this.submit() : () => this.digit(k);
      this.button(k === '⌫' ? '<' : k, cx, cy, kw, kh, act, { main: k === 'OK' });
    });
  }

  draw_warn() {
    const y = this.lines(WARN, PAD + 10);
    if (this.appear >= 1) this.button('ПОНЯТНО', W / 2 - 180, Math.max(y + 20, H - PAD - 90), 360, 76, () => this.go('agree'), { main: true });
  }
  draw_agree() {
    const y = this.lines(AGREE, PAD + 10);
    if (this.appear >= 1) this.button('ПРИНИМАЮ', W / 2 - 180, Math.max(y + 20, H - PAD - 90), 360, 76, () => { save.set('agreed', true); this.go('menu'); }, { main: true });
  }

  draw_menu() {
    this.header('OBJ-4471 // АРХИВ ЦИКЛА');
    const ch = Math.min(this.progress, this.book.length - 1);
    this.text('К-47. НОРМЫ РАСХОДА ПЛОТИ.', W / 2, 120, { align: 'center', size: 20, color: BRIGHT });
    this.text(`ТЕКУЩАЯ ЗАПИСЬ: ${String(ch).padStart(3, '0')} «${this.book[ch].title.replace(/\.$/, '').toUpperCase()}»`, W / 2, 165, { align: 'center', size: 13, color: DIM });
    const bw = 560, bx = (W - bw) / 2;
    this.button('ЧИТАТЬ АРХИВ', bx, 220, bw, 80, () => this.onRead?.(ch), { main: true });
    this.button('ГЛАВЫ', bx, 316, bw, 80, () => this.go('chapters'));
    this.button(this.readMode ? 'РЕЖИМ: ЧТЕНИЕ' : 'РЕЖИМ: ИГРА', bx, 412, bw, 80, () => { save.set('readMode', !this.readMode); this.onPage?.(); this.dirty = true; });
    this.button('ВЫЙТИ ИЗ СИСТЕМЫ', bx, 508, bw, 80, () => this.onExit?.());
    this.text(this.readMode ? 'ТОЛЬКО ТЕКСТ. БЕЗ ИГР. НОСИТЕЛЬ НЕ МЕНЯЕТСЯ.' : 'ПОСЛЕ ГЛАВЫ — ИСПЫТАНИЕ. ПОБЕДА +6 · ПОРАЖЕНИЕ −5', W / 2, 620, { align: 'center', size: 11, color: DIM });
  }

  draw_chapters() {
    this.header('ГЛАВЫ');
    const top = 110, rh = 50;
    for (let r = 0; r < this.rows; r++) {
      const i = this.scroll + r;
      if (i >= this.book.length) break;
      const locked = i > this.progress;
      const y = top + r * rh;
      const label = `${String(i).padStart(3, '0')}  ${locked ? '██████' : this.book[i].title.toUpperCase()}`;
      this.text(label, PAD + 10, y + 12, { size: 16, color: locked ? '#4a1a20' : i === this.progress ? BRIGHT : RED, glow: 0 });
      if (!locked) this.buttons.push({ x: PAD, y, w: W - PAD * 2 - 120, h: rh, act: () => this.onRead?.(i) });
    }
    this.button('▲', W - PAD - 100, 110, 100, 120, () => this.scrollBy(-this.rows));
    this.button('▼', W - PAD - 100, 380, 100, 120, () => this.scrollBy(this.rows));
    this.button('< НАЗАД', PAD, H - PAD - 60, 300, 60, () => this.go('menu'));
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
    // битые полосы развёртки
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
