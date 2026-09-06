// Dummies: vida, persecución simple, knockback y estado suspendido (gravity override).
// No atacan; hacen daño por contacto. El prototipo valida movimiento, no dificultad.
import * as THREE from 'three';
import { ENEMY, AIRCOMBO, PLAYER, COLORS } from './config.js';
import { moveAndCollide } from './physics.js';
import { world } from './world.js';
import * as fx from './fx.js';
import { player, hurt } from './player.js';

export const enemies = [];
const overlay = document.getElementById('overlay');
const tmp = new THREE.Vector3();

const BASE = 0x2a1030;

export function spawn(scene) {
  for (let i = 0; i < ENEMY.count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(ENEMY.radius, ENEMY.height - ENEMY.radius * 2, 4, 10),
      new THREE.MeshLambertMaterial({ color: BASE, emissive: COLORS.blood, emissiveIntensity: 0.5 }),
    );
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: COLORS.blood }),
    );
    eye.position.set(0, 0.42, -ENEMY.radius);
    mesh.add(eye);
    scene.add(mesh);

    const bar = document.createElement('div');
    bar.className = 'ehp';
    bar.innerHTML = '<i></i>';
    overlay.appendChild(bar);

    const e = {
      mesh, bar, fill: bar.firstChild,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      hh: ENEMY.height / 2,
      health: ENEMY.health, dead: false,
      stun: 0, suspend: 0, flash: 0, respawn: 0,
    };
    reset(e, i);
    enemies.push(e);
  }
  return enemies;
}

function reset(e, i) {
  const [x, z] = world.spawns[i % world.spawns.length];
  e.pos.set(x + (Math.random() - .5) * 4, 6, z + (Math.random() - .5) * 4);
  e.vel.set(0, 0, 0);
  e.health = ENEMY.health;
  e.dead = false;
  e.stun = e.suspend = e.flash = 0;
  e.mesh.visible = true;
  e.mesh.scale.setScalar(1);
}

export function damage(e, amount, knock, cam) {
  if (e.dead) return;
  e.health -= amount;
  e.flash = 0.09;
  e.stun = 0.25;
  if (knock) e.vel.add(knock);
  fx.damageNumber(tmp.copy(e.pos).setY(e.pos.y + e.hh), amount, cam, amount >= 14 ? '#ff2df0' : '#fff');
  fx.burst(tmp.copy(e.pos).setY(e.pos.y + 0.3), amount >= 14 ? COLORS.neon : COLORS.cyan, 9, 7);
  if (e.health <= 0) {
    e.dead = true;
    e.respawn = ENEMY.respawn;
    e.bar.style.display = 'none';
    fx.ring(e.pos.clone(), COLORS.blood, 5, 0.5);
    fx.burst(e.pos.clone(), COLORS.blood, 26, 12);
    fx.shake(0.28);
    fx.hitstop(0.09);
  }
}

export function update(dt, colliders, cam) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];

    if (e.dead) {
      e.respawn -= dt;
      e.mesh.scale.multiplyScalar(Math.max(0, 1 - 6 * dt));
      if (e.mesh.scale.x < 0.05) e.mesh.visible = false;
      if (e.respawn <= 0) { reset(e, i); e.bar.style.display = ''; }
      continue;
    }

    e.stun -= dt; e.suspend -= dt; e.flash -= dt;
    const g = e.suspend > 0 ? AIRCOMBO.gravityScale : 1;
    e.vel.y -= PLAYER.gravity * g * dt;

    if (e.stun > 0 || e.suspend > 0) {
      const k = Math.exp(-2.5 * dt);
      e.vel.x *= k; e.vel.z *= k;
    } else {
      tmp.subVectors(player.pos, e.pos).setY(0);
      const d = tmp.length();
      if (d > 1.2) tmp.multiplyScalar(ENEMY.speed / d); else tmp.set(0, 0, 0);
      e.vel.x += (tmp.x - e.vel.x) * Math.min(1, 6 * dt);
      e.vel.z += (tmp.z - e.vel.z) * Math.min(1, 6 * dt);
      e.mesh.rotation.y = Math.atan2(-tmp.x, -tmp.z);
    }

    moveAndCollide(e.pos, e.vel, dt, colliders, ENEMY.radius, e.hh);
    if (e.pos.y < -25) reset(e, i);
    e.mesh.position.copy(e.pos);
    e.mesh.material.emissiveIntensity = e.flash > 0 ? 6 : 0.5;

    // daño por contacto
    if (e.suspend <= 0 && e.pos.distanceToSquared(player.pos) < 1.4 * 1.4) hurt(ENEMY.contactDamage);

    // barra de vida flotante
    const s = fx.project(tmp.copy(e.pos).setY(e.pos.y + e.hh + 0.45), cam);
    if (s.front) {
      e.bar.style.display = '';
      e.bar.style.left = s.x + 'px';
      e.bar.style.top = s.y + 'px';
      e.fill.style.width = Math.max(0, e.health / ENEMY.health * 100) + '%';
    } else {
      e.bar.style.display = 'none';
    }
  }
}
