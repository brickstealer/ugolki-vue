/**
 * Фабрика рельефных шашек.
 *
 * Тело — LatheGeometry: точёный профиль с фасками, V-образным кантом
 * по ободу и кольцевой канавкой на крышке — силуэт настоящей фишки.
 * Сверху рельефная эмблема: у игрока четырёхконечная «полярная» звезда,
 * у ИИ — шестиконечная. Геометрии и материалы общие на все шашки.
 */
import * as THREE from 'three';
import type { Side } from '@/core';

export const PIECE_TOP_Y = 0.13;

function profile(): THREE.Vector2[] {
  // (радиус, высота) — снизу вверх: донышко -> фаска -> кант -> плечо -> крышка
  return [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.3, 0.0),
    new THREE.Vector2(0.345, 0.03),
    new THREE.Vector2(0.355, 0.055),
    new THREE.Vector2(0.355, 0.068),
    new THREE.Vector2(0.312, 0.08), // V-кант по ободу
    new THREE.Vector2(0.35, 0.094),
    new THREE.Vector2(0.344, 0.108),
    new THREE.Vector2(0.286, 0.122),
    new THREE.Vector2(0.252, 0.113), // кольцевая канавка крышки
    new THREE.Vector2(0.216, 0.124),
    new THREE.Vector2(0.13, 0.131),
    new THREE.Vector2(0.0, 0.135),
  ];
}

function starShape(points: number, outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function emblemGeometry(side: Side): THREE.ExtrudeGeometry {
  const shape =
    side === 1
      ? starShape(4, 0.135, 0.045) // полярная звезда игрока
      : starShape(6, 0.128, 0.066); // гексаграмма ИИ
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export class PieceFactory {
  private readonly bodyGeo = new THREE.LatheGeometry(profile(), 56);
  private readonly baseGeo = new THREE.CylinderGeometry(0.165, 0.175, 0.016, 40);
  private readonly emblemGeo: Record<Side, THREE.ExtrudeGeometry> = {
    1: emblemGeometry(1),
    2: emblemGeometry(2),
  };
  private readonly bodyMat: Record<Side, THREE.MeshStandardMaterial>;
  private readonly accentMat: Record<Side, THREE.MeshStandardMaterial>;

  constructor() {
    this.bodyMat = {
      1: new THREE.MeshStandardMaterial({
        color: '#5fb8e8', metalness: 0.55, roughness: 0.3,
        emissive: '#0b2740', emissiveIntensity: 0.55, envMapIntensity: 0.8,
      }),
      2: new THREE.MeshStandardMaterial({
        color: '#f08a52', metalness: 0.52, roughness: 0.32,
        emissive: '#3a1604', emissiveIntensity: 0.55, envMapIntensity: 0.8,
      }),
    };
    this.accentMat = {
      1: new THREE.MeshStandardMaterial({
        color: '#c9efff', metalness: 0.3, roughness: 0.18,
        emissive: '#2e7d9e', emissiveIntensity: 1.2, envMapIntensity: 1.1,
      }),
      2: new THREE.MeshStandardMaterial({
        color: '#ffd9b0', metalness: 0.3, roughness: 0.2,
        emissive: '#b35a1f', emissiveIntensity: 1.1, envMapIntensity: 1.1,
      }),
    };
  }

  /** Собирает шашку: точёное тело + подставка эмблемы + рельефная звезда. */
  make(side: Side): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat[side]);
    group.add(body);

    const base = new THREE.Mesh(this.baseGeo, this.bodyMat[side]);
    base.position.y = PIECE_TOP_Y + 0.008;
    group.add(base);

    const emblem = new THREE.Mesh(this.emblemGeo[side], this.accentMat[side]);
    emblem.position.y = PIECE_TOP_Y + 0.017;
    group.add(emblem);

    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.baseGeo.dispose();
    this.emblemGeo[1].dispose();
    this.emblemGeo[2].dispose();
    for (const s of [1, 2] as Side[]) {
      this.bodyMat[s].dispose();
      this.accentMat[s].dispose();
    }
  }
}
