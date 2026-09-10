// Proyectiles del arquetipo Ranged. Pool fijo: nada se instancia en el loop.
//
// Colisionan contra las cajas del nivel además de contra el jugador, y eso es
// deliberado: un disparo que atraviesa los pilares convierte la arena en
// decorado, mientras que uno que se estrella contra ellos la convierte en
// cobertura. Es la diferencia entre tener level design y no tenerlo.
import * as THREE from 'three';
import { MOVE } from './stats.js';
import { buildBolt } from './models.js';
import { player, hurt } from './player.js';
import * as fx from './fx.js';

const pool = [];
const box = new THREE.Box3();
const tmp = new THREE.Vector3();

export function init(scene, color, n = 16) {
  for (let i = 0; i < n; i++) {
    const mesh = buildBolt(color);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, dmg: 0, radius: 0.3 });
  }
  return pool;
}

export function fire(from, dir, spec) {
  const b = pool.find(p => p.life <= 0);
  if (!b) return null;
  b.pos.copy(from);
  b.vel.copy(dir).normalize().multiplyScalar(spec.speed);
  b.life = spec.life;
  b.dmg = spec.damage;
  b.radius = spec.radius;
  b.mesh.visible = true;
  b.mesh.position.copy(b.pos);
  return b;
}

/** Apaga todos los proyectiles en vuelo (respawn, cambio de kit, reinicio). */
export function clear() {
  for (const b of pool) { b.life = 0; b.mesh.visible = false; }
}

export const live = () => pool.filter(b => b.life > 0).length;

export function update(dt, colliders, color) {
  for (const b of pool) {
    if (b.life <= 0) continue;
    b.life -= dt;
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(tmp.copy(b.pos).add(b.vel));
    fx.spark(b.pos, color, 0.45, 0.14);

    if (b.life <= 0) { b.mesh.visible = false; continue; }

    // --- jugador: esfera del proyectil contra la caja del jugador ---
    box.min.set(player.pos.x - MOVE.radius, player.pos.y - player.hh, player.pos.z - MOVE.radius);
    box.max.set(player.pos.x + MOVE.radius, player.pos.y + player.hh, player.pos.z + MOVE.radius);
    box.clampPoint(b.pos, tmp);
    if (tmp.distanceToSquared(b.pos) < b.radius * b.radius) {
      hurt(b.dmg);
      fx.burst(b.pos.clone(), color, 10, 6);
      b.life = 0; b.mesh.visible = false;
      continue;
    }

    // --- nivel ---
    for (const c of colliders) {
      if (c.distanceToPoint(b.pos) < b.radius) {
        fx.burst(b.pos.clone(), color, 7, 5);
        b.life = 0; b.mesh.visible = false;
        break;
      }
    }
  }
}
