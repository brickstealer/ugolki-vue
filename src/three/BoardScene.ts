/**
 * Визуальный слой доски на Three.js — обычный класс без Vue.
 *
 * Обязанности: рендер сцены (ночная комната + стол + доска), синхронизация
 * рельефных шашек с моделью, подсветка выбора/ходов, анимация хода (Promise),
 * камера с авто-вписыванием доски, орбита/пинч/тап-ввод, освобождение
 * ресурсов (dispose).
 *
 * наружу отдаёт только «клетку» (номер в плоском массиве доски) — игровая
 * логика не знает про пиксели и рейкасты; звуки requests через callback.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BOT, HUMAN, HOME, N, TARGET, idx, inZone, createGame, EMPTY, type Board, type Move, type Point, type Side } from '@/core';
import { PieceFactory } from './pieces';
import { buildRoom, type RoomHandle } from './room';

export type SceneSound = 'step' | 'hop' | 'land' | 'select';

const HALF = (N - 1) / 2;
const TILE_TOP = 0.14;
const PIECE_Y = 0.15; // низ шашки (фигура начинается от дна)

interface Animation {
  group: THREE.Group;
  pts: THREE.Vector3[];
  seg: number;
  t: number;
  dur: number;
  key: number;
  resolve: () => void;
}

export class BoardScene {
  /** Клик по доске: номер клетки или null (мимо). */
  onTap: ((cell: number | null) => void) | null = null;
  /** Запрос звука из анимации. */
  onSound: ((kind: SceneSound, n?: number) => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly cam = { yaw: Math.PI / 4, pitch: 0.72, zoom: 1, target: new THREE.Vector3(0, 0, 0) };
  private fitDist = 24;
  private pitchTouched = false;
  private yawTouched = false;

  private readonly tiles: THREE.InstancedMesh;
  private readonly pieces = new Map<number, THREE.Group>();
  private readonly factory = new PieceFactory();
  private readonly room: RoomHandle;
  private readonly envTex: THREE.Texture;

  private readonly selRing: THREE.Mesh;
  private readonly dots: THREE.InstancedMesh;
  private readonly jumpRings: THREE.InstancedMesh;
  private readonly hintRing: THREE.Mesh;
  private readonly hintLine: THREE.Line;

  private anim: Animation | null = null;
  private animGroup: THREE.Group | null = null;
  private raf = 0;
  private lastMs = 0;
  private disposed = false;
  private readonly fitTimers: number[] = [];

  // синхронизация с настенным экраном
  private currentBoard: Board = createGame();
  private lastMove: Move | null = null;
  private selectedPoint: Point | null = null;

  // ввод
  private readonly ptr = new Map<number, { x: number; y: number }>();
  private dragMode: 'orbit' | 'pinch' | null = null;
  private downAt = 0;
  private moved = 0;
  private pinch0 = 0;
  private multiUsed = false;

  // отложенные обработчики для removeEventListener при dispose
  private readonly onResize = () => this.resize();
  private readonly onPointerDown = (e: PointerEvent) => this.pointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.pointerEnd(e);
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cam.zoom = Math.min(1.75, Math.max(0.6, this.cam.zoom * Math.exp(e.deltaY * 0.0011)));
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0e13');
    this.scene.fog = new THREE.Fog('#0b0e13', 34, 84);

    // мягкие студийные отражения — металл/эмаль шашек оживают
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTex;
    roomEnv.dispose();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 220);

    /* комната: стены, пол, стол, окно, лампа, пыль */
    this.room = buildRoom(this.scene);

    /* свет: ключевой тёплый с тенями + холодный контровой + заполняющий */
    this.scene.add(new THREE.HemisphereLight('#a9c9ff', '#221f24', 0.55));
    const key = new THREE.DirectionalLight('#fff4e2', 2.1);
    key.position.set(7.5, 13.5, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 2; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0007; key.shadow.normalBias = 0.022;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#6fd0ff', 0.6);
    rim.position.set(-8, 6, -7.5);
    this.scene.add(rim);

    /* основание доски и рамка */
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(9.85, 0.42, 9.85),
      new THREE.MeshStandardMaterial({ color: '#0e141d', roughness: 0.85, metalness: 0.05 }),
    );
    base.position.y = -0.21;
    base.receiveShadow = true;
    this.scene.add(base);

    const trim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(9.44, 0.02, 9.44)),
      new THREE.LineBasicMaterial({ color: '#2c3a4c', transparent: true, opacity: 0.55 }),
    );
    trim.position.y = 0.012;
    this.scene.add(trim);

    /* клетки */
    this.tiles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 0.14, 0.9),
      new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.06 }),
      N * N,
    );
    this.tiles.receiveShadow = true;
    {
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      const light = new THREE.Color('#2a3543');
      const dark = new THREE.Color('#1f2833');
      const youTint = new THREE.Color('#3c6b80');
      const botTint = new THREE.Color('#7d4b33');
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const i = idx(r, c);
          m.makeTranslation(c - HALF, TILE_TOP / 2, r - HALF);
          this.tiles.setMatrixAt(i, m);
          col.copy((r + c) % 2 ? light : dark);
          if (inZone(r, c, HOME[HUMAN])) col.lerp(youTint, 0.3);
          else if (inZone(r, c, HOME[BOT])) col.lerp(botTint, 0.28);
          this.tiles.setColorAt(i, col);
        }
      }
      this.tiles.instanceMatrix.needsUpdate = true;
      if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.tiles);

    /* маркеры целевых углов */
    this.scene.add(this.makeCornerMark(TARGET[HUMAN], '#7fd6ff'));
    this.scene.add(this.makeCornerMark(TARGET[BOT], '#ff9a68'));

    /* индикаторы */
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.48, 48),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    const dotGeo = new THREE.RingGeometry(0.12, 0.185, 26);
    dotGeo.rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(
      dotGeo,
      new THREE.MeshBasicMaterial({ color: '#a9f2ea', transparent: true, opacity: 0.95 }),
      90,
    );
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.count = 0;
    this.scene.add(this.dots);

    this.jumpRings = new THREE.InstancedMesh(
      dotGeo,
      new THREE.MeshBasicMaterial({ color: '#ffd479', transparent: true, opacity: 0.95 }),
      90,
    );
    this.jumpRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.jumpRings.count = 0;
    this.scene.add(this.jumpRings);

    this.hintRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.52, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd479', transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    );
    this.hintRing.rotation.x = -Math.PI / 2;
    this.hintRing.visible = false;
    this.scene.add(this.hintRing);

    this.hintLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: '#ffd479', dashSize: 0.2, gapSize: 0.14, transparent: true, opacity: 0.9 }),
    );
    this.hintLine.visible = false;
    this.scene.add(this.hintLine);

    /* ввод и размеры */
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.resize();
    this.fitTimers.push(
      window.setTimeout(() => this.computeFit(), 300),
      window.setTimeout(() => this.computeFit(), 1200),
    );
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------- синхронизация с моделью ---------- */

  private isStartGame(b: Board): boolean {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = b[idx(r, c)];
        if (inZone(r, c, HOME[BOT]) && p !== BOT) return false;
        if (inZone(r, c, HOME[HUMAN]) && p !== HUMAN) return false;
        if (!inZone(r, c, HOME[BOT]) && !inZone(r, c, HOME[HUMAN]) && p !== EMPTY) return false;
      }
    }
    return true;
  }

  /** Мгновенная синхронизация шашек с доской. Отменяет незавершённую анимацию. */
  setBoard(board: Board): void {
    if (this.disposed) return;
    this.currentBoard = board;
    if (this.isStartGame(board)) {
      this.lastMove = null;
      this.selectedPoint = null;
    }
    this.room.setBoard(board, this.lastMove, this.selectedPoint);
    this.cancelAnimation();
    const alive = new Set<number>();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = board[idx(r, c)];
        if (!p) continue;
        const k = idx(r, c);
        alive.add(k);
        const existing = this.pieces.get(k);
        if (existing && existing.userData.side !== p) {
          this.scene.remove(existing);
          this.pieces.delete(k);
        }
        if (!this.pieces.has(k)) {
          const group = this.makePiece(p as Side);
          this.placePiece(group, r, c);
          this.pieces.set(k, group);
        }
      }
    }
    for (const [k, group] of [...this.pieces]) {
      if (!alive.has(k)) {
        this.scene.remove(group);
        this.pieces.delete(k);
      }
    }
  }

  /** Поворот камеры к домашнему углу игрока (1 — голубые, 2 — оранжевые). */
  setPerspective(side: Side): void {
    const baseYaw = innerHeight > innerWidth * 1.12 ? 0 : Math.PI / 4;
    this.cam.yaw = side === 2 ? baseYaw + Math.PI : baseYaw;
  }

  /** Кольцо выбора + точки/кольца доступных ходов. */
  showSelection(sel: Point | null, moves: Map<number, Move>): void {
    if (this.disposed) return;
    this.selectedPoint = sel;
    this.room.setBoard(this.currentBoard, this.lastMove, sel);
    if (!sel) {
      this.selRing.visible = false;
      this.dots.count = 0;
      this.jumpRings.count = 0;
      return;
    }
    this.selRing.visible = true;
    this.selRing.position.set(sel.c - HALF, TILE_TOP + 0.02, sel.r - HALF);
    const m = new THREE.Matrix4();
    let nd = 0;
    let nj = 0;
    for (const [k, mv] of moves) {
      const x = (k % N) - HALF;
      const z = ((k / N) | 0) - HALF;
      m.makeTranslation(x, TILE_TOP + 0.015, z);
      if (mv.kind) this.jumpRings.setMatrixAt(nj++, m);
      else this.dots.setMatrixAt(nd++, m);
    }
    this.dots.count = nd;
    this.jumpRings.count = nj;
    this.dots.instanceMatrix.needsUpdate = true;
    this.jumpRings.instanceMatrix.needsUpdate = true;
  }

  showHint(mv: Move): void {
    if (this.disposed) return;
    this.hintRing.visible = true;
    this.hintRing.position.set(mv.from.c - HALF, TILE_TOP + 0.03, mv.from.r - HALF);
    const a = new THREE.Vector3(mv.from.c - HALF, TILE_TOP + 0.06, mv.from.r - HALF);
    const b = new THREE.Vector3(mv.to.c - HALF, TILE_TOP + 0.06, mv.to.r - HALF);
    this.hintLine.geometry.setFromPoints([a, b]);
    this.hintLine.computeLineDistances();
    this.hintLine.visible = true;
  }

  hideHint(): void {
    this.hintRing.visible = false;
    this.hintLine.visible = false;
  }

  /**
   * Плавный проход шашки по path с подскоками; резолвится по приземлении.
   * Если фигуры нет (например, гонка с newGame) — резолвится сразу.
   */
  animateMove(mv: Move, side: Side): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.lastMove = mv;
    this.selectedPoint = null;
    this.room.setBoard(this.currentBoard, mv, null);
    this.cancelAnimation();
    const key = idx(mv.to.r, mv.to.c);
    const fromKey = idx(mv.from.r, mv.from.c);
    const group = this.pieces.get(fromKey);
    if (!group) return Promise.resolve();

    this.pieces.delete(fromKey);
    this.animGroup = group;
    const pts = mv.path.map((p) => new THREE.Vector3(p.c - HALF, PIECE_Y, p.r - HALF));
    // старт звука — как в оригинале: шаг или прыжок
    if (this.onSound) this.onSound(mv.kind ? 'hop' : 'step');
    return new Promise<void>((resolve) => {
      this.anim = {
        group,
        pts,
        seg: 1,
        t: 0,
        dur: mv.kind ? 0.26 : 0.2,
        key,
        resolve: () => {
          if (this.animGroup === group) this.animGroup = null;
          resolve();
        },
      };
    });
  }

  /* ---------- ресурсы ---------- */

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.fitTimers.forEach((t) => clearTimeout(t));
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.cancelAnimation();

    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const maps = new Set<THREE.Texture>();
    this.scene.traverse((obj) => {
      const mesh = obj as Partial<THREE.Mesh>;
      if (mesh.geometry) geos.add(mesh.geometry);
      const mat = mesh.material;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of list) {
        mats.add(m);
        const withMaps = m as THREE.MeshStandardMaterial;
        for (const key of ['map', 'emissiveMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'normalMap'] as const) {
          const t = withMaps[key];
          if (t) maps.add(t);
        }
      }
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    maps.forEach((t) => t.dispose());

    this.room.dispose();
    this.factory.dispose();
    this.envTex.dispose();
    this.renderer.dispose();
  }

  /* ---------- внутреннее ---------- */

  private makePiece(side: Side): THREE.Group {
    const group = this.factory.make(side);
    group.userData.side = side;
    this.scene.add(group);
    return group;
  }

  private placePiece(group: THREE.Group, r: number, c: number, y = PIECE_Y): void {
    group.userData.r = r;
    group.userData.c = c;
    group.position.set(c - HALF, y, r - HALF);
  }

  private makeCornerMark(zone: { r0: number; r1: number; c0: number; c1: number }, hex: string): THREE.Group {
    const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.55 });
    const g = new THREE.Group();
    const cx = (zone.c0 + zone.c1) / 2 - HALF;
    const cz = (zone.r0 + zone.r1) / 2 - HALF;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mat);
    dot.position.set(cx, 0.17, cz);
    g.add(dot);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.375, 40),
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.155, cz);
    g.add(ring);
    return g;
  }

  private cancelAnimation(): void {
    if (!this.anim) return;
    const { resolve } = this.anim;
    this.anim = null;
    if (this.animGroup) {
      this.scene.remove(this.animGroup);
      this.animGroup = null;
    }
    resolve();
  }

  private isHop(a: THREE.Vector3, b: THREE.Vector3): boolean {
    return Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z)) > 1.5;
  }

  private stepAnim(dt: number): void {
    const a = this.anim;
    if (!a) return;
    a.t += Math.min(dt, 0.06) / a.dur;
    const t = Math.min(1, a.t);
    const p0 = a.pts[a.seg - 1];
    const p1 = a.pts[a.seg];
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lift = this.isHop(p0, p1) ? Math.sin(Math.PI * t) * 0.62 : Math.sin(Math.PI * t) * 0.07;
    a.group.position.set(p0.x + (p1.x - p0.x) * e, PIECE_Y + lift, p0.z + (p1.z - p0.z) * e);
    if (t < 1) return;

    a.seg++;
    a.t = 0;
    if (a.seg >= a.pts.length) {
      this.placePiece(a.group, (a.key / N) | 0, a.key % N);
      this.pieces.set(a.key, a.group);
      this.anim = null;
      a.resolve();
    } else if (this.isHop(a.pts[a.seg - 1], a.pts[a.seg]) && this.onSound) {
      this.onSound('hop', a.seg);
    }
  }

  /* ---------- камера ---------- */

  private placeCamera(d: number): void {
    const cp = Math.cos(this.cam.pitch);
    const sp = Math.sin(this.cam.pitch);
    this.camera.position.set(
      this.cam.target.x + d * cp * Math.sin(this.cam.yaw),
      this.cam.target.y + d * sp,
      this.cam.target.z + d * cp * Math.cos(this.cam.yaw),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.cam.target);
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  /** Авто-вписывание доски в свободную область между HUD-панелями. */
  private computeFit(): void {
    if (this.disposed) return;
    const hudTop = document.querySelector('.hud:not(.hud-bottom)');
    const hudBottom = document.querySelector('.hud-bottom');
    const topH = (hudTop?.getBoundingClientRect().bottom ?? 0) / innerHeight;
    const botH = (hudBottom?.getBoundingClientRect().height ?? 0) / innerHeight;
    const yMax = Math.max(0.18, 1 - topH * 2 * 0.95);
    const yMin = Math.min(-0.18, -1 + botH * 2 * 0.95);
    const pts = [
      new THREE.Vector3(-HALF - 0.45, 0.5, -HALF - 0.45),
      new THREE.Vector3(HALF + 0.45, 0.5, -HALF - 0.45),
      new THREE.Vector3(HALF + 0.45, 0.5, HALF + 0.45),
      new THREE.Vector3(-HALF - 0.45, 0.5, HALF + 0.45),
      new THREE.Vector3(0, 0.5, 0),
    ];
    const v = new THREE.Vector3();
    let d = 26;
    for (let it = 0; it < 8; it++) {
      this.placeCamera(d);
      let need = 0;
      for (const p of pts) {
        v.copy(p).project(this.camera);
        need = Math.max(need, Math.abs(v.x) / 0.985, v.y > 0 ? v.y / yMax : v.y / yMin);
      }
      need = Math.max(0.05, need);
      d *= need;
      if (Math.abs(need - 1) < 0.004) break;
    }
    this.fitDist = Math.min(90, Math.max(9, d));
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.fitDist * 1.6;
    fog.far = this.fitDist * 3.4;
  }

  private resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (!this.pitchTouched) this.cam.pitch = h > w * 1.12 ? 1.05 : w > h * 1.6 ? 0.62 : 0.8;
    // в портрете выгоднее смотреть вдоль осей доски: в кадр влезает сторона, а не диагональ
    if (!this.yawTouched) this.cam.yaw = h > w * 1.12 ? 0 : Math.PI / 4;
    this.camera.updateProjectionMatrix();
    this.computeFit();
  }

  /* ---------- ввод ---------- */

  private pickCell(cx: number, cy: number): number | null {
    const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hitPiece = ray.intersectObjects([...this.pieces.values()], true)[0];
    const hitTile = ray.intersectObject(this.tiles, false)[0];
    const best = hitPiece && hitTile
      ? hitPiece.distance < hitTile.distance ? hitPiece : hitTile
      : hitPiece || hitTile;
    if (!best) return null;
    if (best.object === this.tiles) return best.instanceId ?? null;
    // подъём от попавшего подмеша (тело/эмблема) к группе-фигуре
    let o: THREE.Object3D | null = best.object;
    while (o && o.userData.side === undefined) o = o.parent;
    if (!o) return null;
    return idx(o.userData.r as number, o.userData.c as number);
  }

  private pinchDist(): number {
    const a = [...this.ptr.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  }

  private pointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptr.size === 1) {
      this.dragMode = null;
      this.downAt = performance.now();
      this.moved = 0;
      this.multiUsed = false;
    } else if (this.ptr.size === 2) {
      this.dragMode = 'pinch';
      this.pinch0 = this.pinchDist();
      this.multiUsed = true;
    }
  }

  private pointerMove(e: PointerEvent): void {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.ptr.size === 1) {
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved > 16) this.dragMode = 'orbit';
      if (this.dragMode === 'orbit') {
        this.cam.yaw -= dx * 0.006;
        this.yawTouched = this.pitchTouched = true;
        this.cam.pitch = Math.min(1.42, Math.max(0.2, this.cam.pitch - dy * 0.005));
      }
    } else if (this.ptr.size === 2) {
      const d = this.pinchDist();
      if (this.pinch0 > 0 && d > 0) {
        this.cam.zoom = Math.min(1.75, Math.max(0.6, this.cam.zoom * this.pinch0 / d));
      }
      this.pinch0 = d;
    }
  }

  private pointerEnd(e: PointerEvent): void {
    if (!this.ptr.has(e.pointerId)) return;
    const solo = this.ptr.size === 1;
    this.ptr.delete(e.pointerId);
    if (solo && !this.multiUsed && this.dragMode !== 'orbit' && this.moved < 22 && performance.now() - this.downAt < 550) {
      this.onTap?.(this.pickCell(e.clientX, e.clientY));
    }
    if (this.ptr.size === 0) {
      this.dragMode = null;
      this.multiUsed = false;
    } else if (this.ptr.size === 1) {
      this.dragMode = null;
      this.pinch0 = 0;
    }
  }

  /* ---------- цикл рендера ---------- */

  private readonly loop = (nowMs: number): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (nowMs - this.lastMs) / 1000 || 0);
    this.lastMs = nowMs;
    this.stepAnim(dt);
    this.room.update(dt, nowMs * 0.001);
    this.placeCamera(this.fitDist * this.cam.zoom);
    if (this.selRing.visible) {
      const s = 1 + Math.sin(nowMs * 0.005) * 0.06;
      this.selRing.scale.set(s, s, s);
    }
    if (this.hintRing.visible) {
      const s = 1 + Math.sin(nowMs * 0.006) * 0.1;
      this.hintRing.scale.set(s, s, s);
    }
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };
}
