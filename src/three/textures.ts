/**
 * Процедурные Canvas-текстуры для комнаты: обои, дерево, постер, окно.
 * Никаких внешних ассетов — всё рисуется на canvas при инициализации сцены.
 */
import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

function finalize(canvas: HTMLCanvasElement, anisotropy = 4): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Мелкое зерно (светлое + тёмное) поверх всего. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number, count: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i % 2 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

/** Обои: градиент, вертикальные полосы, ромбовидная решётка, лунное свечение, виньетка. */
export function wallpaperTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(1024, 1024);
  const g = x.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#0c1119');
  g.addColorStop(0.5, '#182333');
  g.addColorStop(1, '#0a0e15');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 1024);

  x.fillStyle = 'rgba(255,255,255,0.022)';
  for (let i = 0; i < 1024; i += 128) x.fillRect(i, 0, 52, 1024);

  x.strokeStyle = 'rgba(255,255,255,0.05)';
  x.lineWidth = 1;
  for (let i = -1024; i < 2048; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 1024, 1024); x.stroke();
    x.beginPath(); x.moveTo(i, 1024); x.lineTo(i + 1024, 0); x.stroke();
  }

  const rg = x.createRadialGradient(250, 320, 40, 250, 320, 660);
  rg.addColorStop(0, 'rgba(127,179,255,0.17)');
  rg.addColorStop(1, 'rgba(127,179,255,0)');
  x.fillStyle = rg;
  x.fillRect(0, 0, 1024, 1024);

  grain(x, 1024, 1024, 0.02, 9000);

  const vg = x.createRadialGradient(512, 512, 300, 512, 512, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  x.fillStyle = vg;
  x.fillRect(0, 0, 1024, 1024);

  const tex = finalize(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/** Дерево: доски, волокна со.sinusoидальными прожилками, стыки, сучки. */
export function woodTexture(base: string, streak: string, gap = 'rgba(0,0,0,0.55)'): THREE.CanvasTexture {
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);

  const plankH = 64;
  for (let py = 0; py < 512; py += plankH) {
    // лёгкий сдвиг оттенка доски
    x.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.03)`;
    x.fillRect(0, py, 512, plankH);

    for (let i = 0; i < 26; i++) {
      const y0 = py + Math.random() * plankH;
      const amp = 1.5 + Math.random() * 3;
      const freq = 0.008 + Math.random() * 0.02;
      const phase = Math.random() * Math.PI * 2;
      x.strokeStyle = streak;
      x.lineWidth = 0.6 + Math.random() * 1.2;
      x.globalAlpha = 0.12 + Math.random() * 0.2;
      x.beginPath();
      for (let px = 0; px <= 512; px += 8) {
        const y = y0 + Math.sin(px * freq + phase) * amp;
        if (px === 0) x.moveTo(px, y);
        else x.lineTo(px, y);
      }
      x.stroke();
    }
    x.globalAlpha = 1;

    // сучок изредка
    if (Math.random() < 0.45) {
      const kx = Math.random() * 512;
      const ky = py + plankH * 0.5;
      for (let r = 9; r > 1; r -= 1.6) {
        x.strokeStyle = 'rgba(0,0,0,0.28)';
        x.lineWidth = 0.8;
        x.beginPath();
        x.ellipse(kx, ky, r * 1.6, r, 0, 0, Math.PI * 2);
        x.stroke();
      }
    }

    x.strokeStyle = gap;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, py);
    x.lineTo(512, py);
    x.stroke();
  }
  grain(x, 512, 512, 0.03, 5000);
  return finalize(c);
}

/** Постер на стену: паспарту, тонкая рама, шахматная сетка в цветах сторон. */
export function posterTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(320, 384);
  x.fillStyle = '#151d29';
  x.fillRect(0, 0, 320, 384);
  x.strokeStyle = '#3d4f66';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 312, 376);

  const x0 = 34;
  const y0 = 44;
  const cell = 30;
  const cells = 8;
  for (let r = 0; r < cells; r++) {
    for (let cIdx = 0; cIdx < cells; cIdx++) {
      x.fillStyle = (r + cIdx) % 2 ? '#5f93ad' : '#2c3947';
      x.fillRect(x0 + cIdx * cell, y0 + r * cell, cell, cell);
    }
  }
  // пара «шашек» как на настоящей доске
  const disc = (cx: number, cy: number, col: string) => {
    x.fillStyle = col;
    x.beginPath();
    x.arc(cx, cy, 11, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(cx, cy, 7, 0, Math.PI * 2);
    x.stroke();
  };
  disc(x0 + 1.5 * cell, y0 + 6.5 * cell, '#8fd6ff');
  disc(x0 + 6.5 * cell, y0 + 1.5 * cell, '#ffab7a');
  disc(x0 + 4.5 * cell, y0 + 4.5 * cell, '#8fd6ff');

  x.fillStyle = '#8ea2b8';
  x.font = 'bold 15px sans-serif';
  x.fillText('УГЛКИ', x0, 30);
  x.fillStyle = '#5c6d82';
  x.font = '10px sans-serif';
  x.fillText('МТХ — 1967', x0 + 190, 30);
  grain(x, 320, 384, 0.02, 1200);
  return finalize(c);
}

/** Окно: ночное небо, луна с гало, звёзды, переплёт. */
export function windowTexture(): THREE.CanvasTexture {
  const [c, x] = makeCanvas(256, 448);
  const g = x.createLinearGradient(0, 0, 0, 448);
  g.addColorStop(0, '#070d1a');
  g.addColorStop(0.55, '#16283f');
  g.addColorStop(1, '#2a4a72');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 448);

  for (let i = 0; i < 110; i++) {
    const a = 0.25 + Math.random() * 0.75;
    x.fillStyle = `rgba(255,255,255,${a})`;
    const s = Math.random() < 0.12 ? 2 : 1;
    x.fillRect(Math.random() * 256, Math.random() * 380, s, s);
  }

  const moon = x.createRadialGradient(186, 92, 6, 186, 92, 74);
  moon.addColorStop(0, 'rgba(255,252,240,1)');
  moon.addColorStop(0.18, 'rgba(255,250,235,0.95)');
  moon.addColorStop(0.3, 'rgba(200,220,255,0.35)');
  moon.addColorStop(1, 'rgba(200,220,255,0)');
  x.fillStyle = moon;
  x.fillRect(0, 0, 256, 448);

  // силуэт дальнего горизонта
  x.fillStyle = 'rgba(4,8,14,0.9)';
  x.beginPath();
  x.moveTo(0, 448);
  x.lineTo(0, 392);
  for (let px = 0; px <= 256; px += 16) x.lineTo(px, 380 + Math.sin(px * 0.05) * 8 + Math.random() * 4);
  x.lineTo(256, 448);
  x.closePath();
  x.fill();

  // переплёт
  x.fillStyle = 'rgba(5,8,13,0.85)';
  x.fillRect(124, 0, 8, 448);
  x.fillRect(0, 150, 256, 8);
  x.strokeStyle = 'rgba(5,8,13,0.85)';
  x.lineWidth = 10;
  x.strokeRect(0, 0, 256, 448);
  return finalize(c);
}
