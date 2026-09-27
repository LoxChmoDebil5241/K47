import * as THREE from 'three';

// ЭЛТ-терминал: текст рисуется на canvas, canvas — текстура экрана в 3D.
const W = 1024, H = 768, PAD = 56;
const FONT = 26, LINE = 32;
const PIXEL = '"Press Start 2P", monospace';
const MONO = `${FONT}px "Courier New", monospace`;
const RED = '#ff3040', DIM = '#8a1a24', BG = '#0b0203';
const TYPE_SPEED = 900; // символов в секунду

export class Terminal {
  constructor(book) {
    this.book = book;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.state = 'boot';
    this.lines = [];      // строки текущего экрана
    this.shown = 0;       // сколько символов уже напечатано
    this.total = 0;
    this.menuScroll = 0;
    this.chapter = 0; this.pages = []; this.page = 0;
    this.time = 0; this.dirty = true;
    this.active = false;        // печать идёт, только когда игрок смотрит в терминал
    this.onKey = null; this.onPage = null;
    this.keyAcc = 0;
    this.g.font = `${FONT}px "Courier New", monospace`;
    this.setLines([
      'К-47 // ТЕРМИНАЛ ЦИКЛА', '',
      'ПРОВЕРКА ПАМЯТИ ........ OK',
      'ТЕМПЕРАТУРА ОТСЕКА ..... -31 °C',
      'СВЯЗЬ С КОРИДОРОМ ...... НЕТ ДАННЫХ',
      `АРХИВ .................. ${book.length} ЗАПИСЕЙ`, '',
      'Нормы расхода плоти. Цикл-48.', '', '',
      '> КОСНИТЕСЬ ЭКРАНА',
    ]);
  }

  setLines(lines) {
    this.lines = lines;
    this.total = lines.reduce((n, l) => n + l.length, 0);
    this.shown = 0; this.dirty = true;
  }

  get typing() { return this.shown < this.total; }

  wrap(text, maxW) {
    this.g.font = MONO;
    const out = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (this.g.measureText(test).width > maxW && line) { out.push(line); line = word; }
        else line = test;
      }
      out.push(line);
    }
    return out;
  }

  // ---------- состояния ----------
  openMenu() {
    this.state = 'menu';
    this.shown = this.total = 0; this.dirty = true;
  }

  openChapter(i) {
    this.state = 'read'; this.chapter = i; this.page = 0;
    const ch = this.book[i];
    const lines = [];
    for (const p of ch.paragraphs) { lines.push(...this.wrap(p, W - PAD * 2), ''); }
    const per = Math.floor((H - PAD * 2 - LINE * 3) / LINE);
    this.pages = [];
    for (let k = 0; k < lines.length; k += per) this.pages.push(lines.slice(k, k + per));
    this.showPage();
  }

  showPage() { this.setLines(this.pages[this.page]); this.onPage?.(); }

  // ---------- ввод ----------
  // u, v — координаты касания на экране (0..1, v снизу вверх)
  tap(u, v) {
    const x = u * W, y = (1 - v) * H;
    if (this.typing) { this.shown = this.total; this.dirty = true; return; }
    if (this.state === 'boot') { this.onPage?.(); return this.openMenu(); }
    if (this.state === 'menu') {
      const top = PAD + LINE * 2;
      const row = Math.floor((y - top) / LINE) - 1;
      const rows = this.menuRows();
      if (row < 0) return this.scroll(-rows);
      if (row >= rows) return this.scroll(rows);
      const i = this.menuScroll + row;
      if (i < this.book.length) this.openChapter(i);
      return;
    }
    if (this.state === 'read') {
      if (y < PAD + LINE) return this.openMenu();
      if (x < W / 3) {
        if (this.page > 0) { this.page--; this.showPage(); } else this.openMenu();
      } else if (this.page < this.pages.length - 1) { this.page++; this.showPage(); }
      else if (this.chapter < this.book.length - 1) this.openChapter(this.chapter + 1);
      else this.openMenu();
    }
  }

  menuRows() { return Math.floor((H - PAD * 2 - LINE * 5) / LINE); }

  scroll(n) {
    if (this.state !== 'menu') return;
    const max = Math.max(0, this.book.length - this.menuRows());
    this.menuScroll = Math.max(0, Math.min(max, this.menuScroll + n));
    this.dirty = true;
  }

  // ---------- отрисовка ----------
  update(dt) {
    this.time += dt;
    if (this.typing && this.active) {
      const step = TYPE_SPEED * dt;
      this.shown = Math.min(this.total, this.shown + step);
      this.keyAcc += step;
      if (this.keyAcc > 14) { this.keyAcc = 0; this.onKey?.(); }
      this.dirty = true;
    }
    // мигающий курсор
    const blink = Math.floor(this.time * 2) % 2;
    if (blink !== this.blink) { this.blink = blink; this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
    this.texture.needsUpdate = true;
  }

  text(str, x, y, color = RED, glow = 10, font = MONO) {
    const g = this.g;
    g.font = font;
    g.fillStyle = color; g.shadowColor = color; g.shadowBlur = glow;
    g.fillText(str, x, y);
    g.shadowBlur = 0;
  }

  draw() {
    const g = this.g;
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.font = `${FONT}px "Courier New", monospace`;
    g.textBaseline = 'top';

    if (this.state === 'menu') this.drawMenu();
    else {
      if (this.state === 'read') this.drawHeader(this.book[this.chapter].title, `${this.page + 1}/${this.pages.length}`);
      const top = this.state === 'read' ? PAD + LINE * 2 : PAD;
      let left = Math.floor(this.shown), last = { x: PAD, y: top };
      this.lines.forEach((l, i) => {
        if (left <= 0) return;
        const s = l.slice(0, left); left -= l.length;
        this.text(s, PAD, top + i * LINE);
        g.font = MONO;
        last = { x: PAD + g.measureText(s).width, y: top + i * LINE };
      });
      if (this.blink || this.typing) this.text('█', last.x + 4, last.y);
      if (this.state === 'read' && !this.typing) {
        const y = H - PAD - LINE + 8;
        const f = `16px ${PIXEL}`;
        this.text('< НАЗАД', PAD, y + 6, DIM, 0, f);
        const next = this.page < this.pages.length - 1 ? 'ДАЛЕЕ >' : 'СЛЕД. ГЛАВА >';
        g.font = f;
        this.text(next, W - PAD - g.measureText(next).width, y + 6, DIM, 0, f);
      }
    }
    this.drawCRT();
  }

  drawHeader(title, right) {
    const g = this.g;
    const f = `16px ${PIXEL}`;
    this.text(`[МЕНЮ] ${title}`.toUpperCase(), PAD, PAD + 6, DIM, 0, f);
    g.font = f;
    this.text(right, W - PAD - g.measureText(right).width, PAD + 6, DIM, 0, f);
    g.fillStyle = DIM; g.fillRect(PAD, PAD + LINE + 4, W - PAD * 2, 2);
  }

  drawMenu() {
    this.drawHeader('АРХИВ ЦИКЛА', `${this.book.length} ЗАП.`);
    const top = PAD + LINE * 2, rows = this.menuRows();
    this.text(this.menuScroll > 0 ? '  ▲ ▲ ▲' : '', PAD, top, DIM, 0);
    for (let r = 0; r < rows; r++) {
      const i = this.menuScroll + r;
      if (i >= this.book.length) break;
      const num = i === 0 ? '000' : String(i).padStart(3, '0');
      this.text(`${num}  ${this.book[i].title.toUpperCase()}`, PAD, top + (r + 1) * LINE + 6, RED, 8, `18px ${PIXEL}`);
    }
    const more = this.menuScroll + rows < this.book.length;
    this.text(more ? '  ▼ ▼ ▼' : '', PAD, top + (rows + 1) * LINE, DIM, 0);
    this.text('> ВЫБЕРИТЕ ЗАПИСЬ' + (this.blink ? '_' : ''), PAD, H - PAD - LINE + 8, DIM, 0, `16px ${PIXEL}`);
  }

  // полосы развёртки и виньетка кинескопа
  drawCRT() {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,.28)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.85)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}
