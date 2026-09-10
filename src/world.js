// Arena de cajas. Los muros son rectos y limpios, así que los "proxy colliders"
// del documento salen gratis: la geometría visual ES la de colisión.
import * as THREE from 'three';
import { COLORS } from './config.js';

export const world = { meshes: [], colliders: [], spawns: [] };

const mat = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: 1 });
const shell = mat(0x2e2e42);
const shellB = mat(0x3a3a52);

function box(w, h, d, x, y, z, material = shell, solid = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (solid) {
    world.meshes.push(m);
    world.colliders.push(new THREE.Box3().setFromCenterAndSize(m.position, new THREE.Vector3(w, h, d)));
  }
  return m;
}

/** Tira de neón decorativa (sin collider): es lo que alimenta el bloom. */
function neon(w, h, d, x, y, z, color) {
  const m = box(w, h, d, x, y, z, new THREE.MeshBasicMaterial({ color }), false);
  return m;
}

export function build(scene) {
  const g = new THREE.Group();
  const add = (...a) => { g.add(box(...a)); };
  const addNeon = (...a) => { g.add(neon(...a)); };

  // suelo + perímetro
  add(96, 2, 96, 0, -1, 0, shellB);
  for (const [x, z, w, d] of [[-47, 0, 2, 96], [47, 0, 2, 96], [0, -47, 96, 2], [0, 47, 96, 2]]) {
    add(w, 26, d, x, 13, z);
  }

  // --- pasillo en U: dos muros paralelos a 4.5m para encadenar wall runs opuestos ---
  const corridor = (cx, cz, len) => {
    add(1.5, 16, len, cx - 2.6, 8, cz);
    add(1.5, 16, len, cx + 2.6, 8, cz);
    add(6.7, 16, 1.5, cx, 8, cz - len / 2);            // fondo de la U
    addNeon(0.16, 15, 0.16, cx - 1.85, 8, cz + len / 2 - .3, COLORS.cyan);
    addNeon(0.16, 15, 0.16, cx + 1.85, 8, cz + len / 2 - .3, COLORS.neon);
    for (let i = 1; i < 4; i++) {
      addNeon(0.1, 0.1, len - 2, cx - 1.86, i * 4, cz, COLORS.violet);
      addNeon(0.1, 0.1, len - 2, cx + 1.86, i * 4, cz, COLORS.violet);
    }
  };
  corridor(-22, -18, 30);
  corridor(24, -20, 26);

  // --- arena central: pilares dispersos para movilidad tridimensional ---
  const pillars = [[-8, 6], [9, -4], [0, -14], [14, 10], [-14, 14], [4, 18], [-2, 2]];
  for (const [x, z] of pillars) {
    add(2.6, 13, 2.6, x, 6.5, z);
    addNeon(0.12, 12, 0.12, x + 1.36, 6.5, z, COLORS.neon);
    addNeon(0.12, 12, 0.12, x - 1.36, 6.5, z, COLORS.cyan);
  }

  // --- puntos de elevación: tejados alcanzables encadenando wall runs ---
  const roofs = [[-8, 6, 7.2], [9, -4, 10.5], [14, 10, 5.5], [-30, 6, 8], [30, 4, 6]];
  for (const [x, z, y] of roofs) {
    add(9, 0.6, 9, x, y, z, shellB);
    addNeon(9, 0.06, 0.06, x, y + 0.35, z + 4.5, COLORS.cyan);
    addNeon(9, 0.06, 0.06, x, y + 0.35, z - 4.5, COLORS.cyan);
  }

  // rampas de aproximación (cajas escalonadas: sin geometría inclinada, sin atascos)
  for (let i = 0; i < 4; i++) add(4, 0.6, 3, -34 + i * 0.2, 1.2 + i * 1.4, 20 - i * 3, shellB);

  // Grid de suelo: una línea de código y de golpe la velocidad se lee de un vistazo.
  const grid = new THREE.GridHelper(96, 48, COLORS.cyan, 0x3a2a55);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  g.add(grid);

  // Doce puntos repartidos: la oleada mezcla arquetipos y no deben salir en bloque.
  world.spawns = [
    [0, 12], [-10, -6], [12, 4], [-20, -10], [18, -12], [6, 22],
    [-26, 8], [26, 16], [-16, 24], [20, -26], [-32, -4], [10, -22],
  ];
  scene.add(g);
  return world;
}
