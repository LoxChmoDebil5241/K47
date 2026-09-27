import * as THREE from 'three';

// Процедурные текстуры: пока нет своих ассетов, всё рисуем на canvas.

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Грязный бетон: шум, пятна, потёки, трещины.
export function concrete(seed = 1, repeat = 1, frost = 0) {
  return canvasTexture(512, (g, s) => {
    const r = rand(seed);
    g.fillStyle = '#4a4a48';
    g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 38;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // грязные пятна
    for (let i = 0; i < 40; i++) {
      const x = r() * s, y = r() * s, rad = 10 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(15,12,10,${0.1 + r() * 0.25})`);
      gr.addColorStop(1, 'rgba(15,12,10,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // потёки сверху вниз
    for (let i = 0; i < 25; i++) {
      const x = r() * s, len = 40 + r() * 300;
      g.strokeStyle = `rgba(20,16,12,${0.1 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 4;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 10, len); g.stroke();
    }
    // трещины
    g.strokeStyle = 'rgba(10,10,10,.6)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 30; y += r() * 20; g.lineTo(x, y); }
      g.stroke();
    }
    // иней
    for (let i = 0; i < frost * 4000; i++) {
      const x = r() * s, y = r() * s;
      g.fillStyle = `rgba(200,225,255,${r() * 0.35})`;
      g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
  }, repeat);
}

// Лёд: полупрозрачная голубая корка с разводами.
export function ice(seed = 7) {
  return canvasTexture(256, (g, s) => {
    const r = rand(seed);
    g.fillStyle = '#9fc4dc'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      g.strokeStyle = `rgba(255,255,255,${r() * 0.4})`;
      g.lineWidth = r() * 2;
      const x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60); g.stroke();
    }
  });
}

// Страница блокнота.
export function notebookPage(lines) {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#cfc7b0'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(60,80,140,.35)';
    for (let y = 60; y < s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    g.strokeStyle = 'rgba(170,40,40,.5)';
    g.beginPath(); g.moveTo(50, 0); g.lineTo(50, s); g.stroke();
    g.fillStyle = '#1b1b2a';
    g.font = 'italic 24px "Courier New", monospace';
    lines.forEach((l, i) => g.fillText(l, 60, 54 + i * 32));
    // грязь и влага
    const r = rand(3);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(60,40,20,${r() * 0.15})`;
      g.beginPath(); g.arc(r() * s, r() * s, 10 + r() * 40, 0, 7); g.fill();
    }
  });
}

// Обледенелый бетон: наплывы льда стекают сверху, иней по всей стене.
export function frozenWall(seed = 42, repeat = 1) {
  const base = concrete(seed, 1, 1).image;
  return canvasTexture(512, (g, s) => {
    const r = rand(seed + 1);
    g.drawImage(base, 0, 0, s, s);
    // наплывы льда
    for (let i = 0; i < 38; i++) {
      const x = r() * s, w = 8 + r() * 45, len = 60 + r() * 380;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(190,225,255,${0.35 + r() * 0.3})`);
      gr.addColorStop(1, 'rgba(190,225,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - w / 2, 0);
      g.quadraticCurveTo(x - w / 3 + (r() - 0.5) * 20, len * 0.6, x + (r() - 0.5) * 8, len);
      g.quadraticCurveTo(x + w / 3 + (r() - 0.5) * 20, len * 0.6, x + w / 2, 0);
      g.fill();
    }
    // ледяная корка снизу
    const bottom = g.createLinearGradient(0, s * 0.75, 0, s);
    bottom.addColorStop(0, 'rgba(170,210,240,0)'); bottom.addColorStop(1, 'rgba(170,210,240,.45)');
    g.fillStyle = bottom; g.fillRect(0, 0, s, s);
    // кристаллы инея
    g.strokeStyle = 'rgba(235,245,255,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 900; i++) {
      const x = r() * s, y = r() * s, l = 2 + r() * 6, a = r() * Math.PI;
      g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, repeat);
}

// Выцветшая фотография: силуэт человека в зерне и пятнах.
export function photo(seed) {
  return canvasTexture(256, (g, s) => {
    const r = rand(seed);
    g.fillStyle = '#d8d2c2'; g.fillRect(0, 0, s, s);
    const tone = 70 + r() * 50;
    g.fillStyle = `rgb(${tone},${tone - 6},${tone - 14})`; g.fillRect(14, 14, s - 28, s - 50);
    // силуэт: голова и плечи
    const cx = s / 2 + (r() - 0.5) * 60;
    g.fillStyle = 'rgba(15,12,10,.85)';
    g.beginPath(); g.ellipse(cx, 100, 34, 42, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx, 210, 80, 60, 0, Math.PI, 0); g.fill();
    // иногда лицо зачёркнуто
    if (r() < 0.4) {
      g.strokeStyle = 'rgba(150,10,20,.85)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - 40, 60); g.lineTo(cx + 40, 140); g.moveTo(cx + 40, 60); g.lineTo(cx - 40, 140); g.stroke();
    }
    const img = g.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 50;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#2a2a3a'; g.font = '16px "Courier New", monospace';
    g.fillText(`К-${String(40 + Math.floor(r() * 8))}`, 20, s - 14);
  });
}

// Крашеный металл: царапины, потёртости, ржавые подтёки.
export function metal(seed = 3, base = '#5a5e62') {
  return canvasTexture(256, (g, s) => {
    const r = rand(seed);
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.12})`;
      g.lineWidth = r() * 1.5;
      const x = r() * s, y = r() * s, l = 5 + r() * 40;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 6); g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const x = r() * s, len = 20 + r() * 90;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, 'rgba(90,40,15,.35)'); gr.addColorStop(1, 'rgba(90,40,15,0)');
      g.fillStyle = gr; g.fillRect(x, r() * s * 0.5, 2 + r() * 4, len);
    }
  });
}

// Жёлто-чёрная предупреждающая полоса.
export function hazard() {
  const t = canvasTexture(128, (g, s) => {
    g.fillStyle = '#c9a21a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#141414';
    for (let i = -2; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 48, 0); g.lineTo(i * 48 + 24, 0); g.lineTo(i * 48 + 24 + s, s); g.lineTo(i * 48 + s, s); g.fill();
    }
    const r = rand(9);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.fillRect(r() * s, r() * s, 2, 2); }
  });
  return t;
}

// Створка шлюза в духе SS14: панели, заклёпки, окно, полоса.
export function airlockPanel(side) {
  return canvasTexture(512, (g, s) => {
    const r = rand(side === 'L' ? 21 : 22);
    g.fillStyle = '#6b7075'; g.fillRect(0, 0, s, s);
    // тёмные швы панелей
    g.fillStyle = '#3a3d40';
    [0.12, 0.5, 0.88].forEach((y) => g.fillRect(0, y * s, s, 5));
    g.fillRect(side === 'L' ? s - 8 : 0, 0, 8, s);
    // окно-щель
    const wx = side === 'L' ? s * 0.55 : s * 0.25;
    g.fillStyle = '#1b2228'; g.fillRect(wx, s * 0.18, s * 0.2, s * 0.26);
    const gl = g.createLinearGradient(wx, s * 0.18, wx + s * 0.2, s * 0.44);
    gl.addColorStop(0, 'rgba(120,170,200,.35)'); gl.addColorStop(1, 'rgba(20,30,40,.1)');
    g.fillStyle = gl; g.fillRect(wx + 4, s * 0.18 + 4, s * 0.2 - 8, s * 0.26 - 8);
    g.strokeStyle = '#2a2d30'; g.lineWidth = 6; g.strokeRect(wx, s * 0.18, s * 0.2, s * 0.26);
    // предупреждающая полоса
    g.save(); g.beginPath(); g.rect(0, s * 0.6, s, s * 0.08); g.clip();
    g.fillStyle = '#c9a21a'; g.fillRect(0, s * 0.6, s, s * 0.08);
    g.fillStyle = '#141414';
    for (let x = -60; x < s + 60; x += 40) { g.beginPath(); g.moveTo(x, s * 0.6); g.lineTo(x + 20, s * 0.6); g.lineTo(x + 60, s * 0.68); g.lineTo(x + 40, s * 0.68); g.fill(); }
    g.restore();
    // заклёпки
    g.fillStyle = '#8e949a';
    for (const y of [0.08, 0.16, 0.54, 0.84, 0.94]) for (let x = 24; x < s; x += 58) { g.beginPath(); g.arc(x, y * s, 4, 0, 7); g.fill(); }
    // трафарет
    g.fillStyle = 'rgba(20,20,20,.7)'; g.font = 'bold 34px "Courier New", monospace';
    g.fillText(side === 'L' ? 'ШЛ' : 'ЮЗ', side === 'L' ? s * 0.62 : s * 0.1, s * 0.8);
    // грязь снизу и царапины
    const gr = g.createLinearGradient(0, s * 0.75, 0, s);
    gr.addColorStop(0, 'rgba(30,25,20,0)'); gr.addColorStop(1, 'rgba(30,25,20,.6)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = `rgba(255,255,255,${r() * 0.1})`; g.lineWidth = 1;
      const x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 30, y + (r() - 0.5) * 4); g.stroke();
    }
  });
}

// Пустая плашка под фото, пока нет файла.
export function photoSlot() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#1a1716'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#5a2a2a'; g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeRect(20, 20, s - 40, s - 40);
    g.fillStyle = '#8a3a3a'; g.font = 'bold 22px "Courier New", monospace'; g.textAlign = 'center';
    g.fillText('МЕСТО', s / 2, s / 2 - 8); g.fillText('ДЛЯ ФОТО', s / 2, s / 2 + 20);
  });
}

// Жёлтый стикер с запиской.
export function stickyNote(lines) {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#c9b64a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#2a2440'; g.font = 'italic 15px "Courier New", monospace';
    lines.forEach((l, i) => g.fillText(l, 10, 30 + i * 20));
  });
}

// Мягкая тень-градиент для углов (альфа сверху/слева).
export function shadowGradient(horizontal = true) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = horizontal ? g.createLinearGradient(0, 0, 64, 0) : g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
