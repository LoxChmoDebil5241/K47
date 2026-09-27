import * as THREE from 'three';

// Процедурные текстуры: пока нет своих ассетов, всё рисуем на canvas.
// Тайловые текстуры рисуются «с заворотом» через края — без швов при повторе.

export function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function canvasTexture(size, draw, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  draw(c.getContext('2d'), size, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// рисует элемент девять раз со сдвигом на размер холста — всё, что вылезло за край, появится с другой стороны
function wrap(g, s, fn) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) { g.save(); g.translate(dx, dy); fn(); g.restore(); }
}

function pixelNoise(g, s, r, amp) {
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amp;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Грязный бетон: шум, пятна, потёки, трещины, следы опалубки.
export function concrete(seed = 1) {
  return canvasTexture(512, (g, s) => {
    const r = rand(seed);
    g.fillStyle = '#4a4a48'; g.fillRect(0, 0, s, s);
    pixelNoise(g, s, r, 34);
    for (let i = 0; i < 46; i++) {
      const x = r() * s, y = r() * s, rad = 10 + r() * 80, a = 0.08 + r() * 0.22;
      wrap(g, s, () => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(15,12,10,${a})`); gr.addColorStop(1, 'rgba(15,12,10,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
    for (let i = 0; i < 22; i++) {
      const x = r() * s, y0 = r() * s, len = 40 + r() * 260, w = 1 + r() * 4, a = 0.08 + r() * 0.18, dx = (r() - 0.5) * 10;
      wrap(g, s, () => {
        g.strokeStyle = `rgba(20,16,12,${a})`; g.lineWidth = w;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + dx, y0 + len); g.stroke();
      });
    }
    for (let i = 0; i < 6; i++) {
      const pts = []; let x = r() * s, y = r() * s;
      for (let k = 0; k < 12; k++) { pts.push([x, y]); x += (r() - 0.5) * 30; y += r() * 20; }
      wrap(g, s, () => {
        g.strokeStyle = 'rgba(10,10,10,.55)'; g.lineWidth = 1;
        g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      });
    }
    // мелкие раковины
    for (let i = 0; i < 160; i++) {
      const x = r() * s, y = r() * s, rad = 0.6 + r() * 2;
      wrap(g, s, () => { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); });
    }
  });
}

// Крашеный металл: шлифовка, царапины, потёртости, ржавые подтёки.
export function metal(seed = 3, base = '#5a5e62', rust = 1) {
  return canvasTexture(256, (g, s) => {
    const r = rand(seed);
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    pixelNoise(g, s, r, 10);
    // горизонтальная шлифовка — полосы на всю ширину, поэтому бесшовно
    for (let y = 0; y < s; y++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.05})`;
      g.fillRect(0, y, s, 1);
    }
    for (let i = 0; i < 220; i++) {
      const x = r() * s, y = r() * s, l = 5 + r() * 40, dy = (r() - 0.5) * 6, a = r() * 0.12, light = r() < 0.5, w = r() * 1.5;
      wrap(g, s, () => {
        g.strokeStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${a})`; g.lineWidth = w;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + dy); g.stroke();
      });
    }
    for (let i = 0; i < 7 * rust; i++) {
      const x = r() * s, y = r() * s, len = 20 + r() * 80, w = 2 + r() * 4;
      wrap(g, s, () => {
        const gr = g.createLinearGradient(0, y, 0, y + len);
        gr.addColorStop(0, 'rgba(90,40,15,.3)'); gr.addColorStop(1, 'rgba(90,40,15,0)');
        g.fillStyle = gr; g.fillRect(x, y, w, len);
      });
    }
  });
}

// Жёлто-чёрная предупреждающая полоса (период делит размер — бесшовно).
export function hazard() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#c9a21a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#141414';
    const p = 32;
    for (let k = -s; k < s * 2; k += p) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + p / 2, 0); g.lineTo(k + p / 2 - s, s); g.lineTo(k - s, s); g.fill();
    }
    const r = rand(9);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.fillRect(r() * s, r() * s, 2, 2); }
  });
}

// Выцветшая фотография: силуэт человека в зерне и пятнах.
export function photo(seed) {
  return canvasTexture(256, (g, s) => {
    const r = rand(seed);
    g.fillStyle = '#d8d2c2'; g.fillRect(0, 0, s, s);
    const tone = 70 + r() * 50;
    g.fillStyle = `rgb(${tone},${tone - 6},${tone - 14})`; g.fillRect(14, 14, s - 28, s - 50);
    const cx = s / 2 + (r() - 0.5) * 60;
    g.fillStyle = 'rgba(15,12,10,.85)';
    g.beginPath(); g.ellipse(cx, 100, 34, 42, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx, 210, 80, 60, 0, Math.PI, 0); g.fill();
    if (r() < 0.4) {
      g.strokeStyle = 'rgba(150,10,20,.85)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - 40, 60); g.lineTo(cx + 40, 140); g.moveTo(cx + 40, 60); g.lineTo(cx - 40, 140); g.stroke();
    }
    pixelNoise(g, s, r, 50);
    g.fillStyle = '#2a2a3a'; g.font = '16px "PT Mono", monospace';
    g.fillText(`К-${String(40 + Math.floor(r() * 8))}`, 20, s - 14);
  });
}

// Пустая плашка под фото, пока нет файла.
export function photoSlot() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#1a1716'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#5a2a2a'; g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeRect(20, 20, s - 40, s - 40);
    g.fillStyle = '#8a3a3a'; g.font = 'bold 22px "PT Mono", monospace'; g.textAlign = 'center';
    g.fillText('МЕСТО', s / 2, s / 2 - 8); g.fillText('ДЛЯ ФОТО', s / 2, s / 2 + 20);
  });
}

// Мягкая тень-градиент для углов.
export function shadowGradient(horizontal = true) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = horizontal ? g.createLinearGradient(0, 0, 64, 0) : g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Кожа обложки: зерно и потёртости.
export function leather(seed = 4, base = '#4a1a0e') {
  return canvasTexture(256, (g, s) => {
    const r = rand(seed);
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    pixelNoise(g, s, r, 22);
    for (let i = 0; i < 500; i++) {
      const x = r() * s, y = r() * s, rad = 1 + r() * 2.5;
      wrap(g, s, () => { g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); });
    }
    for (let i = 0; i < 18; i++) {
      const x = r() * s, y = r() * s, rad = 10 + r() * 40;
      wrap(g, s, () => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(150,90,60,.14)'); gr.addColorStop(1, 'rgba(150,90,60,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
  });
}

// Пластик с лёгкой фактурой.
export function plastic(seed = 5, base = '#1b1c1e') {
  return canvasTexture(128, (g, s) => {
    const r = rand(seed);
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    pixelNoise(g, s, r, 12);
  });
}
