/**
 * Процедурные Canvas-текстуры для комнаты: обои, дерево, постер, окно.
 * Никаких внешних ассетов — всё рисуется на canvas при инициализации сцены.
 */
import * as THREE from 'three';
import { BOT, HUMAN, N, TARGET, idx, inZone, type Board, type Move, type Point } from '@/core';

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

/** Дерево: полосатые доски, волокна со синусоидальными прожилками, стыки, сучки. */
export function woodTexture(base: string, streak: string, gap = 'rgba(0,0,0,0.55)'): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const [c, x] = makeCanvas(W, H);
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);

  const plankH = 64;
  for (let py = 0; py < H; py += plankH) {
    // лёгкий сдвиг оттенка доски (остаётся гармоничным и однородным)
    x.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.025)`;
    x.fillRect(0, py, W, plankH);

    // основные полосы и прожилки волокон дерева (бесшовно замыкаются по X)
    for (let i = 0; i < 30; i++) {
      const y0 = py + Math.random() * plankH;
      const amp = 1.2 + Math.random() * 2.8;
      // целое число циклов синусоиды для идеальной бесшовности по X
      const cycles = 1 + Math.floor(Math.random() * 4);
      const freq = (cycles * 2 * Math.PI) / W;
      const phase = Math.random() * Math.PI * 2;

      // чередование контрастных волокон дерева: светлые золотистые и тонкие тёмные прожилки
      const isDarkStreak = i % 5 === 0;
      x.strokeStyle = isDarkStreak ? 'rgba(20,10,4,0.38)' : streak;
      x.lineWidth = isDarkStreak ? 0.7 : 0.6 + Math.random() * 1.4;
      x.globalAlpha = isDarkStreak ? 0.22 : 0.14 + Math.random() * 0.24;

      x.beginPath();
      for (let px = 0; px <= W; px += 8) {
        const y = y0 + Math.sin(px * freq + phase) * amp;
        if (px === 0) x.moveTo(px, y);
        else x.lineTo(px, y);
      }
      x.stroke();
    }
    x.globalAlpha = 1;

    // сучок изредка, на безопасном расстоянии от краёв холста
    if (Math.random() < 0.35) {
      const kx = 80 + Math.random() * (W - 160);
      const ky = py + plankH * 0.5;
      for (let r = 8; r > 1; r -= 1.5) {
        x.strokeStyle = 'rgba(0,0,0,0.25)';
        x.lineWidth = 0.8;
        x.beginPath();
        x.ellipse(kx, ky, r * 1.5, r, 0, 0, Math.PI * 2);
        x.stroke();
      }
    }

    // стык между досками
    x.strokeStyle = gap;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, py);
    x.lineTo(W, py);
    x.stroke();
  }

  // замыкающий стык снизу холста для идеального тайлинга по Y
  x.strokeStyle = gap;
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(0, H);
  x.lineTo(W, H);
  x.stroke();

  grain(x, W, H, 0.025, 8000);

  const tex = finalize(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface WallScreen {
  texture: THREE.CanvasTexture;
  setBoard(board: Board, lastMove?: Move | null, selected?: Point | null): void;
  dispose(): void;
}

/** Настенный интерактивный монитор: показывает реальное состояние игры 9×9 в реальном времени. */
export function createWallScreen(): WallScreen {
  const W = 512;
  const H = 612;
  const [c, x] = makeCanvas(W, H);
  const texture = finalize(c, 8);

  const draw = (board: Board, lastMove?: Move | null, selected?: Point | null) => {
    // 1. Фон экрана — глубокий тёмный монитор с градиентом
    const bgGrad = x.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#090f17');
    bgGrad.addColorStop(0.5, '#101826');
    bgGrad.addColorStop(1, '#080d14');
    x.fillStyle = bgGrad;
    x.fillRect(0, 0, W, H);

    // Внутренняя рамка дисплея
    x.strokeStyle = '#1e293b';
    x.lineWidth = 6;
    x.strokeRect(3, 3, W - 6, H - 6);

    x.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    x.lineWidth = 1.5;
    x.strokeRect(8, 8, W - 16, H - 16);

    // 2. Шапка: УГОЛКИ + LIVE
    x.fillStyle = '#f8fafc';
    x.font = 'bold 24px system-ui, -apple-system, sans-serif';
    x.fillText('УГОЛКИ', 24, 42);

    x.fillStyle = '#38bdf8';
    x.font = '600 11px system-ui, -apple-system, sans-serif';
    x.fillText('ТАКТИЧЕСКИЙ ЭКРАН 9×9', 136, 41);

    // Зелёный светящийся индикатор LIVE
    x.fillStyle = '#22c55e';
    x.beginPath();
    x.arc(430, 36, 5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#86efac';
    x.font = 'bold 12px system-ui, -apple-system, sans-serif';
    x.fillText('LIVE', 442, 40);

    // Подсчёт очков в углах соперников
    let youScore = 0;
    let botScore = 0;
    for (let r = 0; r < N; r++) {
      for (let cIdx = 0; cIdx < N; cIdx++) {
        const p = board[idx(r, cIdx)];
        if (p === HUMAN && inZone(r, cIdx, TARGET[HUMAN])) youScore++;
        else if (p === BOT && inZone(r, cIdx, TARGET[BOT])) botScore++;
      }
    }

    // Полоса очков сторон
    x.fillStyle = 'rgba(255, 255, 255, 0.04)';
    x.fillRect(24, 56, W - 48, 30);
    x.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    x.lineWidth = 1;
    x.strokeRect(24, 56, W - 48, 30);

    // Игрок (Cyan)
    x.fillStyle = '#38bdf8';
    x.beginPath();
    x.arc(44, 71, 6, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e2e8f0';
    x.font = 'bold 13px system-ui, -apple-system, sans-serif';
    x.fillText(`ВЫ: ${youScore}/9`, 58, 75);

    // ИИ (Orange)
    x.fillStyle = '#fb923c';
    x.beginPath();
    x.arc(360, 71, 6, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e2e8f0';
    x.fillText(`ИИ: ${botScore}/9`, 374, 75);

    // 3. Сетка 9×9
    const cell = 44;
    const boardW = cell * N; // 396px
    const bx = Math.round((W - boardW) / 2); // 58px
    const by = 100;

    // Рамка вокруг доски
    x.fillStyle = '#060a10';
    x.fillRect(bx - 4, by - 4, boardW + 8, boardW + 8);
    x.strokeStyle = '#2b3d56';
    x.lineWidth = 2;
    x.strokeRect(bx - 4, by - 4, boardW + 8, boardW + 8);

    // Отрисовка клеток
    for (let r = 0; r < N; r++) {
      for (let cIdx = 0; cIdx < N; cIdx++) {
        const cx = bx + cIdx * cell;
        const cy = by + r * cell;

        const isLight = (r + cIdx) % 2 === 0;
        x.fillStyle = isLight ? '#202d3e' : '#16212e';
        x.fillRect(cx, cy, cell, cell);

        const inYouTarget = inZone(r, cIdx, TARGET[HUMAN]);
        const inBotTarget = inZone(r, cIdx, TARGET[BOT]);

        if (inYouTarget) {
          x.fillStyle = 'rgba(56, 189, 248, 0.16)';
          x.fillRect(cx, cy, cell, cell);
          x.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          x.lineWidth = 1;
          x.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
        } else if (inBotTarget) {
          x.fillStyle = 'rgba(251, 146, 60, 0.16)';
          x.fillRect(cx, cy, cell, cell);
          x.strokeStyle = 'rgba(251, 146, 60, 0.35)';
          x.lineWidth = 1;
          x.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
        }

        // Подсветка последнего хода
        if (lastMove) {
          if (lastMove.from.r === r && lastMove.from.c === cIdx) {
            x.fillStyle = 'rgba(250, 204, 21, 0.14)';
            x.fillRect(cx, cy, cell, cell);
            x.strokeStyle = 'rgba(250, 204, 21, 0.5)';
            x.lineWidth = 1.5;
            x.strokeRect(cx + 2, cy + 2, cell - 4, cell - 4);
          } else if (lastMove.to.r === r && lastMove.to.c === cIdx) {
            x.fillStyle = 'rgba(250, 204, 21, 0.22)';
            x.fillRect(cx, cy, cell, cell);
            x.strokeStyle = 'rgba(250, 204, 21, 0.8)';
            x.lineWidth = 2;
            x.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
          }
        }

        // Подсветка выбранной шашки
        if (selected && selected.r === r && selected.c === cIdx) {
          x.fillStyle = 'rgba(56, 189, 248, 0.3)';
          x.fillRect(cx, cy, cell, cell);
          x.strokeStyle = '#38bdf8';
          x.lineWidth = 2;
          x.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
        }

        x.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        x.lineWidth = 1;
        x.strokeRect(cx, cy, cell, cell);
      }
    }

    // 4. Шашки на доске
    for (let r = 0; r < N; r++) {
      for (let cIdx = 0; cIdx < N; cIdx++) {
        const p = board[idx(r, cIdx)];
        if (!p) continue;

        const px = bx + cIdx * cell + cell / 2;
        const py = by + r * cell + cell / 2;
        const rad = 16;

        if (p === HUMAN) {
          // Шашка игрока (неоново-голубая со звездой)
          const grad = x.createRadialGradient(px - 3, py - 4, 2, px, py, rad);
          grad.addColorStop(0, '#bae6fd');
          grad.addColorStop(0.38, '#38bdf8');
          grad.addColorStop(1, '#0284c7');
          x.fillStyle = grad;
          x.beginPath();
          x.arc(px, py, rad, 0, Math.PI * 2);
          x.fill();

          x.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          x.lineWidth = 1.5;
          x.stroke();

          x.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          x.lineWidth = 1;
          x.beginPath();
          x.arc(px, py, 9, 0, Math.PI * 2);
          x.stroke();

          // Звезда в центре
          x.fillStyle = '#ffffff';
          x.beginPath();
          x.moveTo(px, py - 5);
          x.lineTo(px + 1.8, py - 1.8);
          x.lineTo(px + 5, py);
          x.lineTo(px + 1.8, py + 1.8);
          x.lineTo(px, py + 5);
          x.lineTo(px - 1.8, py + 1.8);
          x.lineTo(px - 5, py);
          x.lineTo(px - 1.8, py - 1.8);
          x.closePath();
          x.fill();
        } else {
          // Шашка ИИ (янтарно-оранжевая со звездой)
          const grad = x.createRadialGradient(px - 3, py - 4, 2, px, py, rad);
          grad.addColorStop(0, '#fed7aa');
          grad.addColorStop(0.38, '#fb923c');
          grad.addColorStop(1, '#c2410c');
          x.fillStyle = grad;
          x.beginPath();
          x.arc(px, py, rad, 0, Math.PI * 2);
          x.fill();

          x.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          x.lineWidth = 1.5;
          x.stroke();

          x.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          x.lineWidth = 1;
          x.beginPath();
          x.arc(px, py, 9, 0, Math.PI * 2);
          x.stroke();

          // Звезда в центре
          x.fillStyle = '#ffffff';
          x.beginPath();
          x.moveTo(px, py - 5);
          x.lineTo(px + 1.8, py - 1.8);
          x.lineTo(px + 5, py);
          x.lineTo(px + 1.8, py + 1.8);
          x.lineTo(px, py + 5);
          x.lineTo(px - 1.8, py + 1.8);
          x.lineTo(px - 5, py);
          x.lineTo(px - 1.8, py - 1.8);
          x.closePath();
          x.fill();
        }
      }
    }

    // 5. Траектория последнего хода
    if (lastMove) {
      const x0 = bx + lastMove.from.c * cell + cell / 2;
      const y0 = by + lastMove.from.r * cell + cell / 2;
      const x1 = bx + lastMove.to.c * cell + cell / 2;
      const y1 = by + lastMove.to.r * cell + cell / 2;

      x.save();
      x.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      x.lineWidth = 2.5;
      x.setLineDash([4, 4]);
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x1, y1);
      x.stroke();

      const angle = Math.atan2(y1 - y0, x1 - x0);
      x.setLineDash([]);
      x.fillStyle = '#facc15';
      x.beginPath();
      x.moveTo(x1, y1);
      x.lineTo(x1 - 8 * Math.cos(angle - Math.PI / 6), y1 - 8 * Math.sin(angle - Math.PI / 6));
      x.lineTo(x1 - 8 * Math.cos(angle + Math.PI / 6), y1 - 8 * Math.sin(angle + Math.PI / 6));
      x.closePath();
      x.fill();
      x.restore();
    }

    // 6. Подвал экрана
    x.fillStyle = 'rgba(255, 255, 255, 0.04)';
    x.fillRect(24, 514, W - 48, 76);
    x.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    x.lineWidth = 1;
    x.strokeRect(24, 514, W - 48, 76);

    let statusText = 'ОНЛАЙН СИНХРОНИЗАЦИЯ СТОЛА';
    let subText = 'ШАШКИ НА ДОСКЕ ОБНОВЛЯЮТСЯ В РЕАЛЬНОМ ВРЕМЕНИ';
    if (youScore === 9) {
      statusText = '🎉 ПОБЕДА ИГРОКА!';
      subText = 'ВСЕ ШАШКИ ЗАВЕДЕНЫ В УГОЛ СОПЕРНИКА';
    } else if (botScore === 9) {
      statusText = '🤖 ПОБЕДА ИИ!';
      subText = 'ИИ ЗАВЁЛ ВСЕ ШАШКИ В ЦЕЛЬ';
    }

    x.fillStyle = '#f8fafc';
    x.font = 'bold 14px system-ui, -apple-system, sans-serif';
    x.textAlign = 'center';
    x.fillText(statusText, W / 2, 545);

    x.fillStyle = '#64748b';
    x.font = '10px system-ui, -apple-system, sans-serif';
    x.fillText(subText, W / 2, 568);
    x.textAlign = 'left';

    grain(x, W, H, 0.015, 2000);
    texture.needsUpdate = true;
  };

  return {
    texture,
    setBoard: draw,
    dispose: () => texture.dispose(),
  };
}

/** Совместимость с предыдущим постером */
export function posterTexture(): THREE.CanvasTexture {
  return createWallScreen().texture;
}

/** Фоновый холст для 3D-картины с логотипом GitHub (звёздная сеть коммитов, неоновое гало и сетка контрибуций). */
export function githubArtTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 612;
  const [c, x] = makeCanvas(W, H);

  // 1. Глубокий фирменный фон GitHub Dark (#0d1117 -> #090d13)
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1117');
  bg.addColorStop(0.55, '#161b22');
  bg.addColorStop(1, '#090c10');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // 2. Радиальное свечение позади центрального 3D-медальона Octocat
  const halo1 = x.createRadialGradient(W / 2, 248, 30, W / 2, 248, 230);
  halo1.addColorStop(0, 'rgba(88, 166, 255, 0.30)');
  halo1.addColorStop(0.5, 'rgba(139, 92, 246, 0.14)');
  halo1.addColorStop(1, 'rgba(13, 17, 23, 0)');
  x.fillStyle = halo1;
  x.fillRect(0, 0, W, H);

  // 3. Декоративная сетка репозитория и ветки git-графа на фоне
  x.strokeStyle = 'rgba(48, 54, 61, 0.45)';
  x.lineWidth = 1;
  for (let gx = 32; gx < W; gx += 32) {
    x.beginPath();
    x.moveTo(gx, 20);
    x.lineTo(gx, H - 20);
    x.stroke();
  }
  for (let gy = 32; gy < H; gy += 32) {
    x.beginPath();
    x.moveTo(20, gy);
    x.lineTo(W - 20, gy);
    x.stroke();
  }

  // Линии веток (git graph)
  const branches: Array<{ color: string; pts: Array<[number, number]> }> = [
    {
      color: 'rgba(88, 166, 255, 0.28)',
      pts: [[56, 95], [56, 210], [88, 250], [88, 390], [56, 430]],
    },
    {
      color: 'rgba(163, 113, 247, 0.26)',
      pts: [[456, 105], [456, 225], [424, 265], [424, 385], [456, 425]],
    },
  ];
  for (const br of branches) {
    x.strokeStyle = br.color;
    x.lineWidth = 2.5;
    x.beginPath();
    br.pts.forEach(([px, py], i) => (i === 0 ? x.moveTo(px, py) : x.lineTo(px, py)));
    x.stroke();
    for (const [px, py] of br.pts) {
      x.fillStyle = '#0d1117';
      x.beginPath();
      x.arc(px, py, 5, 0, Math.PI * 2);
      x.fill();
      x.stroke();
    }
  }

  // 4. Внутренняя рамка галерейного постера
  x.strokeStyle = '#30363d';
  x.lineWidth = 4;
  x.strokeRect(14, 14, W - 28, H - 28);

  x.strokeStyle = 'rgba(88, 166, 255, 0.28)';
  x.lineWidth = 1.5;
  x.strokeRect(22, 22, W - 44, H - 44);

  // 5. Верхний бейдж
  x.fillStyle = '#8b949e';
  x.font = '600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  x.textAlign = 'center';
  x.fillText('OPEN SOURCE · 3D EDITION', W / 2, 52);

  // 6. Концентрические кольца вокруг 3D-логотипа
  x.strokeStyle = 'rgba(88, 166, 255, 0.22)';
  x.lineWidth = 1.5;
  x.beginPath();
  x.arc(W / 2, 248, 168, 0, Math.PI * 2);
  x.stroke();

  x.strokeStyle = 'rgba(163, 113, 247, 0.18)';
  x.setLineDash([6, 6]);
  x.beginPath();
  x.arc(W / 2, 248, 182, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);

  // 7. Типографика GitHub под медальоном
  x.fillStyle = '#f0f6fc';
  x.font = 'bold 44px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  x.fillText('GitHub', W / 2, 476);

  x.fillStyle = '#58a6ff';
  x.font = '600 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  x.fillText('WHERE THE WORLD BUILDS SOFTWARE', W / 2, 502);

  // 8. Полоса календаря контрибуций (Contribution Graph) в нижней части холста
  const cols = 22;
  const rows = 4;
  const cell = 13;
  const gap = 4;
  const gridW = cols * (cell + gap) - gap;
  const startX = Math.round((W - gridW) / 2);
  const startY = 522;
  const greens = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      // Детерминированный красивый узор активности
      const seed = (col * 7 + row * 13 + col * row) % 11;
      const level = seed === 0 ? 0 : seed < 3 ? 1 : seed < 6 ? 2 : seed < 9 ? 3 : 4;
      x.fillStyle = greens[level];
      const rx = startX + col * (cell + gap);
      const ry = startY + row * (cell + gap);
      x.fillRect(rx, ry, cell, cell);
      x.strokeStyle = 'rgba(255,255,255,0.06)';
      x.lineWidth = 1;
      x.strokeRect(rx, ry, cell, cell);
    }
  }

  x.textAlign = 'left';
  grain(x, W, H, 0.015, 2200);
  return finalize(c, 8);
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
