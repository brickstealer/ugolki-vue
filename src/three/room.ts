/**
 * Ночная комната, в которой стоит стол с доской:
 * обои-циклорама (видна изнутри с любого ракурса) с окном и постером,
 * деревянный стол-пьедестал, ковёр, висячая лампа с тёплым светом,
 * холодный свет из окна и дрейфующие пылинки в лучах.
 *
 * Всё процедурное (см. textures.ts), без внешних ассетов. Возвращает
 * update(dt) для анимации пыли и dispose() для освобождения ресурсов.
 */
import * as THREE from 'three';
import { createGame, type Board, type Move, type Point } from '@/core';
import { buildMagicalCat } from './cat';
import { createWallScreen, githubArtTexture, wallpaperTexture, windowTexture, woodTexture } from './textures';

export interface RoomHandle {
  update(dt: number, t: number): void;
  setBoard(board: Board, lastMove?: Move | null, selected?: Point | null): void;
  dispose(): void;
}

const R = 15; // радиус стеновой цикларамы
const FLOOR_Y = -2.2;
const TABLE_TOP_Y = -0.42; // низ основания доски

function onWall(theta: number, radius = R - 0.12): { pos: THREE.Vector3; ry: number } {
  const x = Math.sin(theta) * radius;
  const z = Math.cos(theta) * radius;
  return { pos: new THREE.Vector3(x, 0, z), ry: theta + Math.PI };
}

/** 2D-контур фирменного силуэта GitHub Octocat (голова с ушками + торс) для 3D-экструзии. */
function makeOctocatSilhouetteShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Нижний срез торса по центру
  s.moveTo(0, -0.78);
  s.lineTo(0.23, -0.78);
  // Правый бок торса и плечо к шее
  s.bezierCurveTo(0.25, -0.46, 0.34, -0.22, 0.21, -0.07);
  // Правая щека головы Octocat
  s.bezierCurveTo(0.50, -0.05, 0.62, 0.14, 0.54, 0.42);
  // Правое кошачье ушко (внешняя грань -> острый кончик -> внутренняя грань)
  s.quadraticCurveTo(0.57, 0.63, 0.48, 0.78);
  s.quadraticCurveTo(0.35, 0.70, 0.24, 0.56);
  // Макушка лба между ушками
  s.bezierCurveTo(0.10, 0.61, -0.10, 0.61, -0.24, 0.56);
  // Левое кошачье ушко
  s.quadraticCurveTo(-0.35, 0.70, -0.48, 0.78);
  s.quadraticCurveTo(-0.57, 0.63, -0.54, 0.42);
  // Левая щека головы к шее
  s.bezierCurveTo(-0.62, 0.14, -0.50, -0.05, -0.21, -0.07);
  // Левое плечо и торс к основанию
  s.bezierCurveTo(-0.34, -0.22, -0.25, -0.46, -0.23, -0.78);
  s.closePath();
  return s;
}

export function buildRoom(scene: THREE.Scene): RoomHandle {
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  const lowEnv = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    m.envMapIntensity = 0.16;
    return m;
  };

  /* --- стены: циклорама с обоями (видна изнутри с любого ракурса камеры) --- */
  const wallTex = track(wallpaperTexture());
  const walls = new THREE.Mesh(
    track(new THREE.CylinderGeometry(R, R, 12, 48, 1, true)),
    track(lowEnv(new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.95 }))),
  );
  walls.position.y = FLOOR_Y + 6;
  roomGroup.add(walls);

  /* --- пол --- */
  const floorTex = track(woodTexture('#1c1410', 'rgba(255,190,130,0.5)'));
  floorTex.repeat.set(8, 8);
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(70, 70)),
    track(lowEnv(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.88, color: '#c9b8a8' }))),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  /* --- ковёр под столом --- */
  const rug = new THREE.Mesh(
    track(new THREE.CircleGeometry(8.6, 56)),
    track(lowEnv(new THREE.MeshStandardMaterial({ color: '#152430', roughness: 1 }))),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = FLOOR_Y + 0.01;
  roomGroup.add(rug);
  const rugEdge = new THREE.Mesh(
    track(new THREE.RingGeometry(8.1, 8.6, 56)),
    track(new THREE.MeshStandardMaterial({ color: '#3f6c74', roughness: 0.9, emissive: '#0c2226', emissiveIntensity: 0.5 })),
  );
  rugEdge.rotation.x = -Math.PI / 2;
  rugEdge.position.y = FLOOR_Y + 0.02;
  roomGroup.add(rugEdge);

  /* --- стол-пьедестал (столешница прямо под доской, полностью из однородного полосатого дерева) --- */
  const tableTex = track(woodTexture('#3a2517', 'rgba(255,205,150,0.55)'));
  tableTex.wrapS = THREE.RepeatWrapping;
  tableTex.wrapT = THREE.RepeatWrapping;
  tableTex.repeat.set(2, 2);
  const woodMat = track(lowEnv(new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.55, metalness: 0.05 })));

  const top = new THREE.Mesh(track(new THREE.BoxGeometry(12.6, 0.55, 12.6)), woodMat);
  top.position.y = TABLE_TOP_Y - 0.275;
  top.castShadow = true;
  top.receiveShadow = true;
  roomGroup.add(top);

  const apron = new THREE.Mesh(track(new THREE.BoxGeometry(11.2, 0.4, 11.2)), woodMat);
  apron.position.y = TABLE_TOP_Y - 0.75;
  apron.castShadow = true;
  apron.receiveShadow = true;
  roomGroup.add(apron);

  const pedestal = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 1.1, 4.4)), woodMat);
  pedestal.position.y = -1.47;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  roomGroup.add(pedestal);

  const foot = new THREE.Mesh(track(new THREE.BoxGeometry(7.2, 0.16, 7.2)), woodMat);
  foot.position.y = FLOOR_Y + 0.09;
  foot.receiveShadow = true;
  roomGroup.add(foot);

  /* --- окно с луной + холодный свет --- */
  const winTheta = Math.PI * 1.12;
  const win = onWall(winTheta);
  const winTex = track(windowTexture());
  const window_ = new THREE.Mesh(
    track(new THREE.PlaneGeometry(4.4, 6.6)),
    track(new THREE.MeshStandardMaterial({ map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.8, roughness: 1 })),
  );
  window_.position.copy(win.pos);
  window_.position.y = 1.1;
  window_.rotation.y = win.ry;
  roomGroup.add(window_);

  const winGlow = new THREE.PointLight('#7fb2ff', 90, 60, 2);
  winGlow.position.copy(win.pos);
  winGlow.position.y = 2.2;
  winGlow.position.multiplyScalar(0.82);
  roomGroup.add(winGlow);

  /* --- настенный монитор «Уголки» (транслирует реальное состояние доски в реальном времени) --- */
  const artTheta = winTheta + 1.25;
  const art = onWall(artTheta);
  const screen = createWallScreen();
  disposables.push(screen);
  screen.setBoard(createGame(), null, null);

  // Корпус / тонкая рамка телевизора
  const frame = new THREE.Mesh(
    track(new THREE.BoxGeometry(3.24, 3.86, 0.08)),
    track(new THREE.MeshStandardMaterial({ color: '#0b1118', roughness: 0.45, metalness: 0.65 })),
  );
  frame.position.copy(art.pos);
  frame.position.y = 1.6;
  frame.rotation.y = art.ry;
  roomGroup.add(frame);

  // Светящаяся матрица экрана
  const screenMat = track(
    new THREE.MeshStandardMaterial({
      map: screen.texture,
      emissive: '#ffffff',
      emissiveMap: screen.texture,
      emissiveIntensity: 0.72,
      roughness: 0.35,
      metalness: 0.1,
    }),
  );
  const display = new THREE.Mesh(track(new THREE.PlaneGeometry(3.1, 3.7)), screenMat);
  display.position.copy(art.pos);
  const forward = new THREE.Vector3(0, 0, 0.045).applyAxisAngle(new THREE.Vector3(0, 1, 0), art.ry);
  display.position.add(forward);
  display.position.y = 1.6;
  display.rotation.y = art.ry;
  roomGroup.add(display);

  /* --- 3D-картина с объёмным барельефом логотипа GitHub на противоположной от телевизора стене --- */
  const ghTheta = artTheta + Math.PI;
  const ghWall = onWall(ghTheta);
  const ghGroup = new THREE.Group();
  ghGroup.position.copy(ghWall.pos);
  ghGroup.position.y = 1.6;
  ghGroup.rotation.y = ghWall.ry;
  roomGroup.add(ghGroup);

  // 1. Глубокая галерейная 3D-рама со скошенным металлическим кантом
  const ghFrameOuterMat = track(
    new THREE.MeshStandardMaterial({ color: '#0b1017', roughness: 0.38, metalness: 0.72 }),
  );
  const ghFrameInnerMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1f2937',
      emissive: '#38bdf8',
      emissiveIntensity: 0.25,
      roughness: 0.28,
      metalness: 0.8,
    }),
  );

  // Задняя плита картины
  const ghBackplate = new THREE.Mesh(track(new THREE.BoxGeometry(3.38, 4.0, 0.08)), ghFrameOuterMat);
  ghBackplate.castShadow = true;
  ghBackplate.receiveShadow = true;
  ghGroup.add(ghBackplate);

  // Объёмные бортики багета (верх, низ, лево, право) — создают реальную глубину 3D-картины
  const frameBars: Array<[number, number, number, number, number, number]> = [
    [3.44, 0.14, 0.22, 0, 1.94, 0.07],
    [3.44, 0.14, 0.22, 0, -1.94, 0.07],
    [0.14, 3.74, 0.22, -1.65, 0, 0.07],
    [0.14, 3.74, 0.22, 1.65, 0, 0.07],
  ];
  for (const [bw, bh, bd, bx, by, bz] of frameBars) {
    const bar = new THREE.Mesh(track(new THREE.BoxGeometry(bw, bh, bd)), ghFrameOuterMat);
    bar.position.set(bx, by, bz);
    bar.castShadow = true;
    ghGroup.add(bar);
  }

  // Внутренний светящийся кант рамы
  const innerBars: Array<[number, number, number, number, number, number]> = [
    [3.16, 0.035, 0.14, 0, 1.855, 0.06],
    [3.16, 0.035, 0.14, 0, -1.855, 0.06],
    [0.035, 3.68, 0.14, -1.565, 0, 0.06],
    [0.035, 3.68, 0.14, 1.565, 0, 0.06],
  ];
  for (const [bw, bh, bd, bx, by, bz] of innerBars) {
    const trim = new THREE.Mesh(track(new THREE.BoxGeometry(bw, bh, bd)), ghFrameInnerMat);
    trim.position.set(bx, by, bz);
    ghGroup.add(trim);
  }

  // 2. Художественный холст GitHub внутри рамы
  const ghTex = track(githubArtTexture());
  const ghCanvasMat = track(
    new THREE.MeshStandardMaterial({
      map: ghTex,
      emissive: '#ffffff',
      emissiveMap: ghTex,
      emissiveIntensity: 0.62,
      roughness: 0.42,
      metalness: 0.12,
    }),
  );
  const ghCanvas = new THREE.Mesh(track(new THREE.PlaneGeometry(3.1, 3.7)), ghCanvasMat);
  ghCanvas.position.z = 0.045;
  ghGroup.add(ghCanvas);

  // 3. Центральный 3D-медальон (выступающий круглый пьедестал под логотипом Octocat)
  const medallionCenterY = 0.35;
  const medallionDisc = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1.02, 1.08, 0.09, 64)),
    track(
      new THREE.MeshStandardMaterial({
        color: '#0d1117',
        roughness: 0.32,
        metalness: 0.55,
        emissive: '#161b22',
        emissiveIntensity: 0.35,
      }),
    ),
  );
  medallionDisc.rotation.x = Math.PI / 2;
  medallionDisc.position.set(0, medallionCenterY, 0.09);
  medallionDisc.castShadow = true;
  medallionDisc.receiveShadow = true;
  ghGroup.add(medallionDisc);

  // Неоновое 3D-кольцо ореола вокруг медальона GitHub
  const ghRingMat = track(
    new THREE.MeshStandardMaterial({
      color: '#58a6ff',
      emissive: '#58a6ff',
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.8,
    }),
  );
  const ghHaloRing = new THREE.Mesh(track(new THREE.TorusGeometry(1.06, 0.028, 20, 72)), ghRingMat);
  ghHaloRing.position.set(0, medallionCenterY, 0.115);
  ghGroup.add(ghHaloRing);

  // 4. 3D-скульптурный барельеф логотипа GitHub Octocat (экструдированная геометрия с фаской)
  const octoMat = track(
    new THREE.MeshStandardMaterial({
      color: '#f0f6fc',
      emissive: '#dbeafe',
      emissiveIntensity: 0.32,
      roughness: 0.24,
      metalness: 0.22,
    }),
  );

  const octoGeo = track(
    new THREE.ExtrudeGeometry(makeOctocatSilhouetteShape(), {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.028,
      bevelSize: 0.022,
      bevelSegments: 4,
      curveSegments: 32,
    }),
  );
  const octoMesh = new THREE.Mesh(octoGeo, octoMat);
  octoMesh.position.set(0, medallionCenterY - 0.02, 0.13);
  octoMesh.castShadow = true;
  ghGroup.add(octoMesh);

  // Объёмный изогнутый 3D-хвост-щупальце Octocat слева от торса
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, medallionCenterY - 0.48, 0.18),
    new THREE.Vector3(-0.38, medallionCenterY - 0.44, 0.195),
    new THREE.Vector3(-0.52, medallionCenterY - 0.30, 0.205),
    new THREE.Vector3(-0.66, medallionCenterY - 0.25, 0.21),
    new THREE.Vector3(-0.77, medallionCenterY - 0.14, 0.21),
  ]);
  const tailGeo = track(new THREE.TubeGeometry(tailCurve, 28, 0.068, 16, false));
  const tailMesh = new THREE.Mesh(tailGeo, octoMat);
  tailMesh.castShadow = true;
  ghGroup.add(tailMesh);

  // Скруглённый кончик хвоста-щупальца
  const tailTip = new THREE.Mesh(track(new THREE.SphereGeometry(0.068, 16, 14)), octoMat);
  tailTip.position.set(-0.77, medallionCenterY - 0.14, 0.21);
  ghGroup.add(tailTip);

  // Объёмные детали мордочки Octocat на барельефе (глянцевые тёмные глаза и носик)
  const octoFeatureMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0d1117',
      roughness: 0.18,
      metalness: 0.45,
    }),
  );
  const eyeGeo = track(new THREE.CapsuleGeometry(0.052, 0.05, 8, 14));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, octoFeatureMat);
    eye.position.set(side * 0.21, medallionCenterY + 0.19, 0.255);
    ghGroup.add(eye);

    // Блик в глазах Octocat
    const glint = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.018, 10, 8)),
      octoMat,
    );
    glint.position.set(side * 0.21 + 0.018, medallionCenterY + 0.22, 0.295);
    ghGroup.add(glint);
  }

  // 5. Объёмные 3D-кубики календаря контрибуций (GitHub Contributions Skyline) в нижней части картины
  const contribColors = ['#0e4429', '#006d32', '#26a641', '#39d353'];
  const contribBoxGeo = track(new THREE.BoxGeometry(0.11, 0.11, 1));
  for (let col = 0; col < 14; col++) {
    for (let row = 0; row < 2; row++) {
      const lvl = (col * 5 + row * 9 + 3) % 4;
      const depth = 0.04 + (lvl + 1) * 0.022;
      const cMat = track(
        new THREE.MeshStandardMaterial({
          color: contribColors[lvl],
          emissive: contribColors[lvl],
          emissiveIntensity: 0.35 + lvl * 0.14,
          roughness: 0.3,
          metalness: 0.25,
        }),
      );
      const cube = new THREE.Mesh(contribBoxGeo, cMat);
      cube.scale.z = depth;
      cube.position.set((col - 6.5) * 0.155, -1.42 - row * 0.155, 0.05 + depth * 0.5);
      cube.castShadow = true;
      ghGroup.add(cube);
    }
  }

  // 6. Верхний галерейный светильник над 3D-картиной GitHub
  const galleryLampArm = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.5, 0.05, 0.32)),
    ghFrameOuterMat,
  );
  galleryLampArm.position.set(0, 2.08, 0.16);
  ghGroup.add(galleryLampArm);

  const ghLight = new THREE.PointLight('#79c0ff', 28, 8.5, 2);
  ghLight.position.copy(ghWall.pos).multiplyScalar(0.92);
  ghLight.position.y = 3.2;
  roomGroup.add(ghLight);

  /* --- висячая лампа: шнур, абажур, светящаяся груша --- */
  const lampTheta = winTheta - 2.2;
  const lamp = onWall(lampTheta, R - 5.2);
  const cord = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.02, 0.02, 4.6, 6)),
    track(new THREE.MeshStandardMaterial({ color: '#141821', roughness: 0.9 })),
  );
  cord.position.copy(lamp.pos);
  cord.position.y = 7.6;
  roomGroup.add(cord);

  const shade = new THREE.Mesh(
    track(new THREE.ConeGeometry(1.0, 0.95, 26, 1, true)),
    track(new THREE.MeshStandardMaterial({ color: '#1d2735', roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide })),
  );
  shade.position.copy(lamp.pos);
  shade.position.y = 5.05;
  shade.castShadow = true;
  roomGroup.add(shade);

  const bulb = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.24, 18, 14)),
    track(new THREE.MeshBasicMaterial({ color: '#ffd9a0' })),
  );
  bulb.position.copy(lamp.pos);
  bulb.position.y = 4.72;
  roomGroup.add(bulb);

  const lampLight = new THREE.PointLight('#ffc98a', 160, 46, 2);
  lampLight.position.copy(lamp.pos);
  lampLight.position.y = 4.5;
  roomGroup.add(lampLight);

  /* --- пылинки в лучах света --- */
  const COUNT = 160;
  const basePos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * (R - 3);
    basePos[i * 3] = Math.sin(a) * r;
    basePos[i * 3 + 1] = FLOOR_Y + 0.5 + Math.random() * 7.5;
    basePos[i * 3 + 2] = Math.cos(a) * r;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(basePos.slice(), 3));
  const dustMat = track(
    new THREE.PointsMaterial({
      color: '#a8c6e8', size: 0.05, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }),
  );
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  roomGroup.add(dust);

  const attr = dustGeo.getAttribute('position') as THREE.BufferAttribute;

  /* --- волшебный 3D-кот, рандомно гуляющий по комнате --- */
  const cat = track(buildMagicalCat(roomGroup, FLOOR_Y));

  return {
    update(dt: number, t: number): void {
      for (let i = 0; i < COUNT; i++) {
        const y = basePos[i * 3 + 1] + Math.sin(t * (0.25 + (i % 7) * 0.05) + i * 1.7) * 0.35;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
      dust.rotation.y = t * 0.012;
      lampLight.intensity = 160 + Math.sin(t * 7.3) * 9;
      ghRingMat.emissiveIntensity = 0.72 + Math.sin(t * 2.2) * 0.18;
      cat.update(dt, t);
    },
    setBoard(board: Board, lastMove?: Move | null, selected?: Point | null): void {
      screen.setBoard(board, lastMove, selected);
    },
    dispose(): void {
      scene.remove(roomGroup);
      for (const d of disposables) d.dispose();
    },
  };
}
