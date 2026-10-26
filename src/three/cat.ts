/**
 * Процедурный волшебный 3D-кот с грациозной кошачьей анатомией, гуляющий по комнате.
 *
 * Включает:
 * - скульптурное анатомическое туловище (глубокая грудная клетка, подтянутая талия,
 *   округлый круп и изящный S-образный изгиб позвоночника);
 * - стройную вытянутую шею, клиновидную кошачью голову со скулами, мордочкой и высокими ушками;
 * - 4 двухсуставные пальцеходящие (digitigrade) лапы с бедром, скакательным суставом и мягкими лапками;
 * - длинный гибкий хвост из 8 сегментов, шляпу волшебника, магический ошейник и руны;
 * - руническую печать под лапками, шлейф искр и ИИ прогулки вокруг стола.
 */
import * as THREE from 'three';

export interface MagicalCatHandle {
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * Строит скульптурную лофт-геометрию грациозного кошачьего туловища:
 * - сбоку: высокая холка, плавный прогиб спины, округлый круп, глубокая грудь и подтянутый живот;
 * - сверху: выраженная талия («скрипичный» силуэт) между плечами и бёдрами.
 */
function makeCatTorsoGeometry(): THREE.BufferGeometry {
  const SLICES = 32;
  const RING = 24;
  const zStart = -0.34; // круп (основание хвоста)
  const zEnd = 0.33; // перед груди

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SLICES; i++) {
    const u = i / SLICES; // 0 = зад, 1 = перёд
    const z = zStart + (zEnd - zStart) * u;

    // Плавное скругление торцов на крупе и груди
    const cap = Math.pow(Math.sin(u * Math.PI), 0.48);

    // Верхняя линия спины: приподнятый круп -> мягкий изгиб поясницы -> высокая холка
    const humpRump = Math.exp(-Math.pow((u - 0.16) / 0.16, 2)) * 0.042;
    const dipBack = -Math.exp(-Math.pow((u - 0.48) / 0.18, 2)) * 0.026;
    const withers = Math.exp(-Math.pow((u - 0.8) / 0.16, 2)) * 0.048;
    const yTopBase = 0.485 + humpRump + dipBack + withers;

    // Нижняя линия: подтянутый пах (u ~ 0.34) и глубокая грудная клетка (u ~ 0.74)
    const tuckWaist = Math.exp(-Math.pow((u - 0.34) / 0.16, 2)) * 0.062;
    const deepChest = -Math.exp(-Math.pow((u - 0.74) / 0.19, 2)) * 0.055;
    const yBotBase = 0.305 + tuckWaist + deepChest;

    const yCenter = 0.5 * (yTopBase + yBotBase);
    const ry = Math.max(0.002, 0.5 * (yTopBase - yBotBase) * cap);

    // Полуширина: мускулистый таз, узкая изящная талия и развитые плечи
    const hipW = Math.exp(-Math.pow((u - 0.18) / 0.15, 2)) * 0.026;
    const waistNarrow = -Math.exp(-Math.pow((u - 0.44) / 0.17, 2)) * 0.025;
    const chestW = Math.exp(-Math.pow((u - 0.76) / 0.16, 2)) * 0.03;
    const rx = Math.max(0.002, (0.088 + hipW + waistNarrow + chestW) * cap);

    for (let j = 0; j <= RING; j++) {
      const v = j / RING;
      const a = v * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // Лёгкое анатомическое расширение к спинке и сужение к килю груди
      const ribShape = 1 + 0.08 * sa;
      const x = ca * rx * ribShape;
      const y = yCenter + sa * ry;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = RING + 1;
  for (let i = 0; i < SLICES; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Создаёт процедурную текстуру магической рунической печати под лапками кота. */
function makeAuraTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d')!;
  const half = S / 2;

  const g = x.createRadialGradient(half, half, 8, half, half, half - 4);
  g.addColorStop(0, 'rgba(168, 85, 247, 0.42)');
  g.addColorStop(0.55, 'rgba(56, 189, 248, 0.25)');
  g.addColorStop(0.88, 'rgba(192, 132, 252, 0.5)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);

  x.strokeStyle = 'rgba(125, 211, 252, 0.88)';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(half, half, 108, 0, Math.PI * 2);
  x.stroke();

  x.strokeStyle = 'rgba(216, 180, 254, 0.75)';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(half, half, 92, 0, Math.PI * 2);
  x.stroke();

  for (let tri = 0; tri < 2; tri++) {
    x.strokeStyle = tri === 0 ? 'rgba(125, 211, 252, 0.78)' : 'rgba(244, 114, 182, 0.72)';
    x.lineWidth = 2.4;
    x.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i * Math.PI * 2) / 3 + (tri * Math.PI) / 3;
      const px = half + Math.cos(a) * 90;
      const py = half + Math.sin(a) * 90;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  }

  x.fillStyle = '#fde047';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    const px = half + Math.cos(a) * 100;
    const py = half + Math.sin(a) * 100;
    x.beginPath();
    x.arc(px, py, i % 2 === 0 ? 3.5 : 2, 0, Math.PI * 2);
    x.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Минимальный радиус обхода квадратного стола для заданного полярного угла. */
function minSafeRadius(theta: number): number {
  const tableHalf = 6.95;
  const m = Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
  return Math.max(7.6, tableHalf / Math.max(0.52, m) + 0.55);
}

function angleDiff(target: number, current: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  baseKneeRot: number;
}

export function buildMagicalCat(roomGroup: THREE.Group, floorY: number): MagicalCatHandle {
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const root = new THREE.Group();
  roomGroup.add(root);

  // Крупный выразительный масштаб, чтобы кота было отлично видно рядом со столом
  const bodyPivot = new THREE.Group();
  bodyPivot.scale.setScalar(2.35);
  root.add(bodyPivot);

  /* --- Материалы --- */
  const furMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1d1536',
      emissive: '#140b2e',
      emissiveIntensity: 0.58,
      roughness: 0.52,
      metalness: 0.18,
    }),
  );
  const lightFurMat = track(
    new THREE.MeshStandardMaterial({
      color: '#f3e8ff',
      emissive: '#7e22ce',
      emissiveIntensity: 0.52,
      roughness: 0.46,
      metalness: 0.1,
    }),
  );
  const eyeMat = track(
    new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#7dd3fc',
      emissiveIntensity: 2.3,
      roughness: 0.12,
    }),
  );
  const pupilMat = track(
    new THREE.MeshBasicMaterial({
      color: '#050811',
    }),
  );
  const noseMat = track(
    new THREE.MeshStandardMaterial({
      color: '#f472b6',
      emissive: '#ec4899',
      emissiveIntensity: 0.95,
      roughness: 0.28,
    }),
  );
  const hatMat = track(
    new THREE.MeshStandardMaterial({
      color: '#3b0764',
      emissive: '#1e1b4b',
      emissiveIntensity: 0.68,
      roughness: 0.5,
      metalness: 0.25,
    }),
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({
      color: '#fde047',
      emissive: '#f59e0b',
      emissiveIntensity: 1.4,
      roughness: 0.22,
      metalness: 0.72,
    }),
  );
  const crystalMat = track(
    new THREE.MeshStandardMaterial({
      color: '#67e8f9',
      emissive: '#22d3ee',
      emissiveIntensity: 2.1,
      roughness: 0.1,
      metalness: 0.3,
    }),
  );
  const whiskerMat = track(
    new THREE.MeshBasicMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.88,
    }),
  );

  /* --- Грациозное скульптурное туловище --- */
  const torso = new THREE.Mesh(track(makeCatTorsoGeometry()), furMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // Рельефные лопатки и изящный грудной манишка-воротник
  const chestTuft = new THREE.Mesh(track(new THREE.ConeGeometry(0.088, 0.21, 14)), lightFurMat);
  chestTuft.rotation.x = Math.PI - 0.35;
  chestTuft.scale.set(0.85, 1.0, 0.65);
  chestTuft.position.set(0, 0.36, 0.295);
  bodyPivot.add(chestTuft);

  // Светящиеся рунические созвездия вдоль изгиба спины
  const runePositions: ReadonlyArray<readonly [number, number]> = [
    [0.505, 0.12],
    [0.472, -0.02],
    [0.495, -0.17],
  ];
  for (const [ry, rz] of runePositions) {
    const rune = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.022, 0)), crystalMat);
    rune.scale.set(0.8, 0.45, 1.35);
    rune.position.set(0, ry, rz);
    bodyPivot.add(rune);
  }

  /* --- Длинная изящная кошачья шея --- */
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.44, 0.25);
  bodyPivot.add(neckGroup);

  const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.058, 0.088, 0.22, 18)), furMat);
  neck.position.set(0, 0.09, 0.035);
  neck.rotation.x = 0.36;
  neck.scale.set(0.88, 1.0, 1.05);
  neck.castShadow = true;
  neckGroup.add(neck);

  // Магический ошейник вокруг стройной шеи и кристалл-оберег
  const collar = new THREE.Mesh(track(new THREE.TorusGeometry(0.082, 0.013, 10, 24)), goldMat);
  collar.rotation.x = Math.PI / 2 - 0.36;
  collar.position.set(0, 0.05, 0.02);
  neckGroup.add(collar);

  const chestGem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.042, 0)), crystalMat);
  chestGem.position.set(0, 0.01, 0.105);
  neckGroup.add(chestGem);

  /* --- Скульптурная голова ориентального/волшебного кота --- */
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.2, 0.08);
  neckGroup.add(headGroup);

  // Черепной купол — изящный, слегка вытянутый
  const cranium = new THREE.Mesh(track(new THREE.SphereGeometry(0.125, 20, 18)), furMat);
  cranium.scale.set(0.96, 0.88, 1.12);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Выраженные кошачьи скулы
  const cheekBoneGeo = track(new THREE.SphereGeometry(0.062, 12, 10));
  for (const sx of [-1, 1]) {
    const cheekBone = new THREE.Mesh(cheekBoneGeo, furMat);
    cheekBone.scale.set(0.85, 0.72, 1.2);
    cheekBone.position.set(sx * 0.068, -0.018, 0.045);
    cheekBone.rotation.y = sx * 0.25;
    headGroup.add(cheekBone);
  }

  // Изящная клиновидная переносица и мордочка
  const snout = new THREE.Mesh(track(new THREE.CylinderGeometry(0.038, 0.068, 0.11, 14)), furMat);
  snout.rotation.x = Math.PI / 2 + 0.18;
  snout.scale.set(0.92, 1.0, 0.78);
  snout.position.set(0, -0.022, 0.12);
  headGroup.add(snout);

  // Подушечки вибрисс (щёчки мордочки)
  const muzzlePadGeo = track(new THREE.SphereGeometry(0.036, 12, 10));
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(muzzlePadGeo, lightFurMat);
    pad.scale.set(0.95, 0.82, 1.1);
    pad.position.set(sx * 0.03, -0.038, 0.155);
    headGroup.add(pad);
  }

  // Треугольный розовый носик
  const nose = new THREE.Mesh(track(new THREE.ConeGeometry(0.022, 0.026, 4)), noseMat);
  nose.rotation.x = Math.PI;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, -0.018, 0.185);
  headGroup.add(nose);

  // Длинные изящные усы
  const whiskerGeo = track(new THREE.CylinderGeometry(0.0025, 0.001, 0.2, 5));
  for (const sx of [-1, 1]) {
    for (let w = -1; w <= 1; w++) {
      const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
      whisker.rotation.z = sx * (Math.PI / 2 + w * 0.14);
      whisker.rotation.y = -sx * 0.26;
      whisker.position.set(sx * 0.11, -0.038 + w * 0.013, 0.15);
      headGroup.add(whisker);
    }
  }

  // Раскосые миндалевидные светящиеся глаза с вертикальными зрачками
  const eyeGeo = track(new THREE.SphereGeometry(0.035, 14, 12));
  const pupilGeo = track(new THREE.BoxGeometry(0.011, 0.046, 0.014));
  const eyes: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(sx * 0.06, 0.012, 0.112);
    eyePivot.rotation.y = sx * 0.34;
    eyePivot.rotation.z = -sx * 0.14; // благородный кошачий наклон глаз

    const eyeball = new THREE.Mesh(eyeGeo, eyeMat);
    eyeball.scale.set(1.05, 0.92, 0.62);
    eyePivot.add(eyeball);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.019);
    eyePivot.add(pupil);

    headGroup.add(eyePivot);
    eyes.push(eyePivot);
  }

  // Высокие стройные остроконечные уши (как у ориентала/сервала)
  const outerEarGeo = track(new THREE.ConeGeometry(0.056, 0.22, 5));
  const innerEarGeo = track(new THREE.ConeGeometry(0.034, 0.16, 4));
  const ears: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const earPivot = new THREE.Group();
    earPivot.position.set(sx * 0.078, 0.088, -0.01);
    earPivot.rotation.z = -sx * 0.28;
    earPivot.rotation.x = 0.12;

    const outerEar = new THREE.Mesh(outerEarGeo, furMat);
    outerEar.scale.set(0.82, 1.0, 1.1);
    outerEar.rotation.y = Math.PI / 4;
    outerEar.position.y = 0.09;
    outerEar.castShadow = true;
    earPivot.add(outerEar);

    const innerEar = new THREE.Mesh(innerEarGeo, lightFurMat);
    innerEar.rotation.y = Math.PI / 4;
    innerEar.position.set(0, 0.082, 0.018);
    earPivot.add(innerEar);

    headGroup.add(earPivot);
    ears.push(earPivot);
  }

  // Шляпа волшебника со звездой
  const hatGroup = new THREE.Group();
  hatGroup.position.set(0, 0.11, -0.02);
  hatGroup.rotation.z = -0.1;
  hatGroup.rotation.x = -0.15;
  headGroup.add(hatGroup);

  const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.19, 0.2, 0.018, 24)), hatMat);
  brim.castShadow = true;
  hatGroup.add(brim);

  const brimRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.195, 0.008, 8, 28)), goldMat);
  brimRing.rotation.x = Math.PI / 2;
  hatGroup.add(brimRing);

  const hatLower = new THREE.Mesh(track(new THREE.CylinderGeometry(0.068, 0.11, 0.15, 20)), hatMat);
  hatLower.position.y = 0.08;
  hatLower.castShadow = true;
  hatGroup.add(hatLower);

  const hatBand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.11, 0.03, 20)), goldMat);
  hatBand.position.y = 0.022;
  hatGroup.add(hatBand);

  const hatUpper = new THREE.Mesh(track(new THREE.ConeGeometry(0.068, 0.19, 18)), hatMat);
  hatUpper.position.set(-0.02, 0.225, -0.022);
  hatUpper.rotation.z = 0.24;
  hatUpper.rotation.x = -0.2;
  hatUpper.castShadow = true;
  hatGroup.add(hatUpper);

  const hatTipStar = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.03, 0)), crystalMat);
  hatTipStar.position.set(-0.048, 0.325, -0.045);
  hatGroup.add(hatTipStar);

  /* --- 4 двухсуставные анатомические лапы (передние и задние пальцеходящие) --- */
  const frontShoulderGeo = track(new THREE.SphereGeometry(0.052, 12, 10));
  const frontUpperGeo = track(new THREE.CylinderGeometry(0.03, 0.042, 0.18, 12));
  const frontLowerGeo = track(new THREE.CylinderGeometry(0.022, 0.03, 0.18, 12));

  const hindThighGeo = track(new THREE.SphereGeometry(0.068, 14, 12));
  const hindShinGeo = track(new THREE.CylinderGeometry(0.024, 0.042, 0.19, 12));
  const hindAnkleGeo = track(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 12));
  const pawGeo = track(new THREE.SphereGeometry(0.038, 12, 10));

  const frontLegs: LegRig[] = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.088, 0.35, 0.22);

    // Рельефная лопатка/плечо
    const scapula = new THREE.Mesh(frontShoulderGeo, furMat);
    scapula.scale.set(0.65, 1.35, 0.95);
    scapula.position.set(0, 0.02, 0);
    scapula.castShadow = true;
    hip.add(scapula);

    // Плечевая кость (слегка отведена назад к локтю)
    const upperArm = new THREE.Mesh(frontUpperGeo, furMat);
    upperArm.position.set(0, -0.085, -0.018);
    upperArm.rotation.x = -0.18;
    upperArm.castShadow = true;
    hip.add(upperArm);

    // Локтевой сустав + предплечье + изящная лапка
    const knee = new THREE.Group();
    knee.position.set(0, -0.17, -0.032);
    const baseKneeRot = 0.18;
    knee.rotation.x = baseKneeRot;

    const forearm = new THREE.Mesh(frontLowerGeo, furMat);
    forearm.position.set(0, -0.085, 0.012);
    forearm.castShadow = true;
    knee.add(forearm);

    const paw = new THREE.Mesh(pawGeo, lightFurMat);
    paw.scale.set(0.92, 0.62, 1.32);
    paw.position.set(0, -0.168, 0.028);
    paw.castShadow = true;
    knee.add(paw);

    hip.add(knee);
    bodyPivot.add(hip);
    frontLegs.push({ hip, knee, baseKneeRot });
  }

  const hindLegs: LegRig[] = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.092, 0.37, -0.22);

    // Мускулистое каплевидное бедро
    const thigh = new THREE.Mesh(hindThighGeo, furMat);
    thigh.scale.set(0.62, 1.45, 1.08);
    thigh.position.set(0, -0.045, 0.015);
    thigh.rotation.x = 0.28;
    thigh.castShadow = true;
    hip.add(thigh);

    // Голень, идущая назад к скакательному суставу (hock)
    const shin = new THREE.Mesh(hindShinGeo, furMat);
    shin.position.set(0, -0.115, -0.025);
    shin.rotation.x = -0.42;
    shin.castShadow = true;
    hip.add(shin);

    // Скакательный сустав (плюсна + задняя лапка)
    const knee = new THREE.Group();
    knee.position.set(0, -0.2, -0.062);
    const baseKneeRot = 0.36;
    knee.rotation.x = baseKneeRot;

    const ankle = new THREE.Mesh(hindAnkleGeo, furMat);
    ankle.position.set(0, -0.078, 0.025);
    ankle.castShadow = true;
    knee.add(ankle);

    const paw = new THREE.Mesh(pawGeo, lightFurMat);
    paw.scale.set(0.92, 0.62, 1.35);
    paw.position.set(0, -0.155, 0.048);
    paw.castShadow = true;
    knee.add(paw);

    hip.add(knee);
    bodyPivot.add(hip);
    hindLegs.push({ hip, knee, baseKneeRot });
  }

  /* --- Длинный изящный хвост из 8 сегментов (S-образный изгиб) --- */
  const tailSegments: THREE.Group[] = [];
  let parentTail: THREE.Object3D = bodyPivot;
  const SEG_COUNT = 8;
  for (let i = 0; i < SEG_COUNT; i++) {
    const segGroup = new THREE.Group();
    if (i === 0) {
      segGroup.position.set(0, 0.43, -0.32);
      segGroup.rotation.x = -0.82; // выходит из крупа назад-вверх
    } else {
      segGroup.position.set(0, 0.082, 0);
    }

    const rTop = 0.028 * (1 - (i + 1) * 0.075);
    const rBot = 0.028 * (1 - i * 0.075);
    const segMesh = new THREE.Mesh(
      track(new THREE.CylinderGeometry(rTop, rBot, 0.088, 10)),
      i >= SEG_COUNT - 2 ? lightFurMat : furMat,
    );
    segMesh.position.y = 0.042;
    segMesh.castShadow = true;
    segGroup.add(segMesh);

    if (i === SEG_COUNT - 1) {
      const tailOrb = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.045, 1)), crystalMat);
      tailOrb.position.y = 0.095;
      segGroup.add(tailOrb);
    }

    parentTail.add(segGroup);
    tailSegments.push(segGroup);
    parentTail = segGroup;
  }

  /* --- Парящий спутник-кристалл вокруг кота --- */
  const familiarOrb = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.048, 0)), goldMat);
  bodyPivot.add(familiarOrb);

  /* --- Светящаяся руническая печать на полу под лапками --- */
  const auraTex = track(makeAuraTexture());
  const auraMat = track(
    new THREE.MeshBasicMaterial({
      map: auraTex,
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const aura = new THREE.Mesh(track(new THREE.PlaneGeometry(2.2, 2.2)), auraMat);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.025;
  root.add(aura);

  /* --- Собственный волшебный свет кота --- */
  const catLight = new THREE.PointLight('#a855f7', 22, 8.5, 2);
  catLight.position.set(0, 1.35, 0);
  root.add(catLight);

  /* --- Шлейф волшебных искр в мировых координатах комнаты --- */
  const SPARK_COUNT = 48;
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkPhase = new Float32Array(SPARK_COUNT);
  const sparkDriftX = new Float32Array(SPARK_COUNT);
  const sparkDriftZ = new Float32Array(SPARK_COUNT);

  let curTheta = Math.PI * 1.38;
  let curR = 8.4;
  let curX = Math.sin(curTheta) * curR;
  let curZ = Math.cos(curTheta) * curR;
  let heading = curTheta - Math.PI / 2;

  for (let i = 0; i < SPARK_COUNT; i++) {
    sparkPhase[i] = Math.random();
    sparkDriftX[i] = (Math.random() - 0.5) * 0.75;
    sparkDriftZ[i] = (Math.random() - 0.5) * 0.75;
    sparkPos[i * 3] = curX + sparkDriftX[i];
    sparkPos[i * 3 + 1] = floorY + 0.25 + sparkPhase[i] * 2.1;
    sparkPos[i * 3 + 2] = curZ + sparkDriftZ[i];
  }

  const sparkGeo = track(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = track(
    new THREE.PointsMaterial({
      color: '#e879f9',
      size: 0.11,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  roomGroup.add(sparkles);
  const sparkAttr = sparkGeo.getAttribute('position') as THREE.BufferAttribute;

  /* --- Состояние ИИ прогулки кота --- */
  let targetTheta = Math.PI * 1.05;
  let targetR = 8.5;
  let targetX = Math.sin(targetTheta) * targetR;
  let targetZ = Math.cos(targetTheta) * targetR;
  let pauseTimer = 0;
  let walkCycle = 0;
  let hopPhase = 0;
  let waypointsVisited = 0;

  const pickNextWaypoint = (): void => {
    waypointsVisited++;
    if (waypointsVisited % 3 === 0) {
      pauseTimer = 1.1 + Math.random() * 1.4;
    }
    const dir = Math.random() < 0.72 ? -1 : 1;
    const stepAngle = dir * (0.48 + Math.random() * 0.72);
    targetTheta = (curTheta + stepAngle + Math.PI * 2) % (Math.PI * 2);
    const minR = minSafeRadius(targetTheta);
    targetR = minR + Math.random() * Math.max(0.7, 11.2 - minR);
    targetX = Math.sin(targetTheta) * targetR;
    targetZ = Math.cos(targetTheta) * targetR;

    if (Math.random() < 0.42) {
      hopPhase = 0.001;
    }
  };

  root.position.set(curX, floorY, curZ);
  root.rotation.y = heading;

  const animateLeg = (rig: LegRig, phase: number, hipAmp: number, kneeFlex: number): void => {
    const s = Math.sin(phase);
    const lift = Math.max(0, Math.cos(phase)); // фаза переноса лапы над полом
    rig.hip.rotation.x = s * hipAmp;
    rig.knee.rotation.x = rig.baseKneeRot - lift * kneeFlex;
  };

  return {
    update(dt: number, t: number): void {
      const clampedDt = Math.min(dt, 0.05);

      let isMoving = false;
      if (pauseTimer > 0) {
        pauseTimer -= clampedDt;
      } else {
        const dx = targetX - curX;
        const dz = targetZ - curZ;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.4) {
          pickNextWaypoint();
        } else {
          isMoving = true;
          const speed = 2.25;
          const step = Math.min(dist, speed * clampedDt);
          curX += (dx / dist) * step;
          curZ += (dz / dist) * step;

          curTheta = Math.atan2(curX, curZ);
          curR = Math.hypot(curX, curZ);
          const safeR = minSafeRadius(curTheta);
          if (curR < safeR) {
            curR = safeR;
            curX = Math.sin(curTheta) * curR;
            curZ = Math.cos(curTheta) * curR;
          } else if (curR > 12.0) {
            curR = 12.0;
            curX = Math.sin(curTheta) * curR;
            curZ = Math.cos(curTheta) * curR;
          }

          const desiredHeading = Math.atan2(dx, dz);
          heading += angleDiff(desiredHeading, heading) * Math.min(1, clampedDt * 8.5);
        }
      }

      let hopLift = 0;
      if (hopPhase > 0) {
        hopPhase += clampedDt * 2.5;
        if (hopPhase >= 1) {
          hopPhase = 0;
        } else {
          hopLift = Math.sin(hopPhase * Math.PI) * 0.48;
        }
      }

      root.position.set(curX, floorY + hopLift, curZ);
      root.rotation.y = heading;

      // Грациозная кошачья походка с артикуляцией двух суставов каждой лапы
      if (isMoving) {
        walkCycle += clampedDt * 9.5;
        const bob = Math.abs(Math.sin(walkCycle)) * 0.032;
        bodyPivot.position.y = bob;
        bodyPivot.rotation.z = Math.sin(walkCycle) * 0.045;
        bodyPivot.rotation.x = Math.cos(walkCycle * 2) * 0.025;
        bodyPivot.rotation.y = Math.sin(walkCycle) * 0.045; // мягкий изгиб корпуса

        animateLeg(frontLegs[0], walkCycle, 0.46, 0.52);
        animateLeg(hindLegs[1], walkCycle, 0.44, 0.48);
        animateLeg(frontLegs[1], walkCycle + Math.PI, 0.46, 0.52);
        animateLeg(hindLegs[0], walkCycle + Math.PI, 0.44, 0.48);

        neckGroup.rotation.z = -Math.sin(walkCycle) * 0.04;
        headGroup.rotation.y = Math.sin(t * 2.0) * 0.14;
        headGroup.rotation.x = Math.sin(walkCycle * 2) * 0.04;
      } else {
        bodyPivot.position.y = Math.sin(t * 2.8) * 0.012;
        bodyPivot.rotation.z *= 0.9;
        bodyPivot.rotation.x *= 0.9;
        bodyPivot.rotation.y *= 0.9;

        for (const rig of [...frontLegs, ...hindLegs]) {
          rig.hip.rotation.x *= 0.85;
          rig.knee.rotation.x += (rig.baseKneeRot - rig.knee.rotation.x) * 0.15;
        }

        headGroup.rotation.y = Math.sin(t * 2.2) * 0.42;
        headGroup.rotation.x = -0.08 + Math.sin(t * 1.6) * 0.07;
      }

      ears[0].rotation.x = 0.12 + Math.sin(t * 4.3) * 0.08;
      ears[1].rotation.x = 0.12 + Math.cos(t * 3.7 + 1.1) * 0.08;

      const blinkCycle = t % 4.2;
      const blinkScale = blinkCycle > 4.02 ? 0.1 : 1.0;
      eyes[0].scale.y = blinkScale;
      eyes[1].scale.y = blinkScale;

      // S-образная волна гибкого 8-сегментного хвоста
      for (let i = 0; i < tailSegments.length; i++) {
        const seg = tailSegments[i];
        seg.rotation.z = Math.sin(t * 3.8 - i * 0.48) * 0.19;
        if (i > 0) {
          // Плавный переход от подъёма к грациозному изгибу кончика
          const arch = i < 4 ? 0.16 : -0.14;
          seg.rotation.x = arch + Math.cos(t * 2.9 - i * 0.38) * 0.06;
        }
      }

      chestGem.rotation.y = t * 2.5;
      hatTipStar.rotation.y = -t * 3.2;
      familiarOrb.position.set(
        Math.cos(t * 2.6) * 0.32,
        0.64 + Math.sin(t * 4.2) * 0.06,
        Math.sin(t * 2.6) * 0.32,
      );
      familiarOrb.rotation.y = t * 3.5;
      familiarOrb.rotation.x = t * 2.1;

      aura.rotation.z = t * 0.85;
      aura.position.y = Math.max(0.02, 0.025 - hopLift);
      auraMat.opacity = 0.6 + Math.sin(t * 3.8) * 0.16;
      catLight.intensity = 20 + Math.sin(t * 4.5) * 4;

      for (let i = 0; i < SPARK_COUNT; i++) {
        sparkPhase[i] += clampedDt * (0.55 + (i % 5) * 0.1);
        if (sparkPhase[i] >= 1) {
          sparkPhase[i] -= 1;
          sparkDriftX[i] = (Math.random() - 0.5) * 0.75;
          sparkDriftZ[i] = (Math.random() - 0.5) * 0.75;
          sparkPos[i * 3] = curX + sparkDriftX[i];
          sparkPos[i * 3 + 2] = curZ + sparkDriftZ[i];
        }
        const p = sparkPhase[i];
        const swirl = t * 2.2 + i;
        sparkAttr.setXYZ(
          i,
          sparkPos[i * 3] + Math.cos(swirl) * 0.12 * p,
          floorY + 0.2 + p * 2.1,
          sparkPos[i * 3 + 2] + Math.sin(swirl) * 0.12 * p,
        );
      }
      sparkAttr.needsUpdate = true;
    },

    dispose(): void {
      roomGroup.remove(root);
      roomGroup.remove(sparkles);
      for (const d of disposables) d.dispose();
    },
  };
}
