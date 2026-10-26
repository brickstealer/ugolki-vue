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
import { createWallScreen, wallpaperTexture, windowTexture, woodTexture } from './textures';

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
