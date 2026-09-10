// Cuatro arquetipos con siluetas y roles separados.
//
// La regla que los ordena: cada uno debe distinguirse a 10+ metros y ninguna
// táctica debe funcionar igual contra todos. El Grunt es el sparring, el Swarm
// castiga quedarse quieto, el Tank rompe la rutina de launcher → combo aéreo
// porque no se levanta, y el Ranged obliga a usar los pilares como cobertura.
// Si dos arquetipos se juegan igual, uno de los dos sobra.
import * as THREE from 'three';
import { ARCHETYPES, WAVE, ENEMY, COLORS } from './config.js';
import { MOVE, AIRCOMBO } from './stats.js';
import { moveAndCollide } from './physics.js';
import { world } from './world.js';
import { buildBiped, buildQuad, buildTripod } from './models.js';
import { animateBiped, animateQuad, animateTripod } from './anim.js';
import * as projectiles from './projectiles.js';
import * as fx from './fx.js';
import { player, hurt } from './player.js';

export const enemies = [];
const overlay = document.getElementById('overlay');
const tmp = new THREE.Vector3();
const eye = new THREE.Vector3();
const ray = new THREE.Raycaster();

const BUILDERS = { biped: buildBiped, quad: buildQuad, tripod: buildTripod };

export function spawn(scene) {
  projectiles.init(scene, ARCHETYPES.ranged.model.glow);

  for (let i = 0; i < WAVE.length; i++) {
    const arch = ARCHETYPES[WAVE[i]];
    const built = BUILDERS[arch.body](arch.model);

    // El modelo se construye con los pies en y=0; el envoltorio se coloca en el
    // CENTRO del collider, así que el modelo baja media altura dentro de él.
    const mesh = new THREE.Group();
    built.root.position.y = -arch.height / 2;
    mesh.add(built.root);
    scene.add(mesh);
    for (const m of built.glow) m.userData.base = m.emissiveIntensity;

    const bar = document.createElement('div');
    bar.className = 'ehp';
    bar.innerHTML = '<i></i>';
    overlay.appendChild(bar);

    const e = {
      arch, mesh, rig: built.rig, glow: built.glow, bar, fill: bar.firstChild,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      hh: arch.height / 2,
      health: arch.health, dead: false, grounded: false, speed: 0,
      stun: 0, suspend: 0, flash: 0, respawn: 0, charge: 0, reload: 0,
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
  e.health = e.arch.health;
  e.dead = false;
  e.stun = e.suspend = e.flash = e.charge = 0;
  e.reload = Math.random() * 1.5;   // desfasa la primera salva: no disparan a coro
  e.mesh.visible = true;
  e.mesh.scale.setScalar(1);
  setGlow(e, null);
}

/** `intensity` null devuelve cada emissive a su valor de reposo. */
function setGlow(e, intensity, color) {
  for (const m of e.glow) {
    m.emissiveIntensity = intensity === null || intensity === undefined ? m.userData.base : intensity;
    if (color !== undefined) m.emissive.setHex(color);
  }
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
    // La muerte escala con el tamaño: matar a un Tank tiene que sonar distinto.
    const w = e.arch.score;
    fx.ring(e.pos.clone(), COLORS.blood, 4 + w * 1.6, 0.5);
    fx.burst(e.pos.clone(), COLORS.blood, 18 + w * 6, 10 + w * 2);
    fx.shake(0.18 + w * 0.06);
    fx.hitstop(0.07 + w * 0.02);
  }
}

/** ¿Hay línea de tiro? Sin esto los pilares no serían cobertura sino adorno. */
function canSee(e) {
  eye.copy(e.pos).setY(e.pos.y + e.hh * 0.7);
  tmp.subVectors(player.pos, eye);
  const d = tmp.length();
  ray.set(eye, tmp.divideScalar(d));
  ray.far = d;
  return ray.intersectObjects(world.meshes, false).length === 0;
}

// --- comportamientos ---

function chase(e, dt) {
  tmp.subVectors(player.pos, e.pos).setY(0);
  const d = tmp.length();
  if (d > 1.2) tmp.multiplyScalar(e.arch.speed / d); else tmp.set(0, 0, 0);
  steer(e, dt, tmp);
  face(e, d > 0.1);
}

/**
 * El Ranged mantiene una banda de distancia: se acerca si está lejos, retrocede
 * si el jugador se le echa encima, y solo carga cuando tiene línea de tiro.
 */
function kite(e, dt) {
  const a = e.arch;
  tmp.subVectors(player.pos, e.pos).setY(0);
  const d = tmp.length() || 1;
  tmp.divideScalar(d);

  let move = 0;
  if (d < a.keepAt * 0.72) move = -1;                 // demasiado cerca: retrocede
  else if (d > a.fireRange * 0.9) move = 1;           // fuera de alcance: se acerca
  tmp.multiplyScalar(a.speed * move);
  steer(e, dt, tmp);
  face(e, true);

  const inRange = d <= a.fireRange && canSee(e);
  e.reload -= dt;
  if (inRange && e.reload <= 0 && e.stun <= 0 && e.suspend <= 0) {
    e.charge += dt;
    if (e.charge >= a.telegraph) {
      e.charge = 0;
      e.reload = a.reload;
      eye.copy(e.pos).setY(e.pos.y + e.hh * 0.7);
      // Apunta al pecho, no a los pies: un disparo a los pies nunca acierta a algo que salta.
      tmp.copy(player.pos).setY(player.pos.y + 0.2).sub(eye);
      projectiles.fire(eye, tmp, a.bolt);
      fx.burst(eye.clone(), COLORS.danger, 8, 5);
    }
  } else {
    e.charge = Math.max(0, e.charge - dt * 2);        // pierde la carga si se rompe la línea
  }
}

function steer(e, dt, want) {
  e.vel.x += (want.x - e.vel.x) * Math.min(1, 6 * dt);
  e.vel.z += (want.z - e.vel.z) * Math.min(1, 6 * dt);
}

function face(e, on) {
  if (!on) return;
  tmp.subVectors(player.pos, e.pos);
  e.mesh.rotation.y = Math.atan2(-tmp.x, -tmp.z);
}

// --- animación por tipo de cuerpo ---

function animate(e, dt) {
  const st = {
    speed: e.speed,
    vy: e.vel.y,
    maxSpeed: e.arch.speed,
    charge: e.arch.telegraph ? e.charge / e.arch.telegraph : 0,
    state: e.suspend > 0 ? 'aircombo' : (e.grounded ? 'grounded' : 'airborne'),
  };
  if (e.arch.body === 'biped') animateBiped(e.rig, st, dt);
  else if (e.arch.body === 'quad') animateQuad(e.rig, st, dt);
  else animateTripod(e.rig, st, dt);
}

export function update(dt, colliders, cam) {
  projectiles.update(dt, colliders, ARCHETYPES.ranged.model.glow);

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
    e.vel.y -= MOVE.gravity * g * dt;

    if (e.stun > 0 || e.suspend > 0) {
      const k = Math.exp(-2.5 * dt);
      e.vel.x *= k; e.vel.z *= k;
      e.charge = Math.max(0, e.charge - dt * 3);
    } else if (e.arch.id === 'ranged') {
      kite(e, dt);
    } else {
      chase(e, dt);
    }

    const res = moveAndCollide(e.pos, e.vel, dt, colliders, e.arch.radius, e.hh);
    e.grounded = res.grounded;
    e.speed = Math.hypot(e.vel.x, e.vel.z);
    if (e.pos.y < -25) reset(e, i);
    e.mesh.position.copy(e.pos);
    animate(e, dt);

    // Capa de estado: el flash de impacto gana al telegrafiado, y el telegrafiado
    // sube BRILLO además de cambiar de color — el salto de brillo es lo que se
    // lee de verdad, también con deficiencia de visión de color.
    if (e.flash > 0) {
      setGlow(e, 9, COLORS.danger);
    } else if (e.charge > 0) {
      const c = e.charge / e.arch.telegraph;
      setGlow(e, 1.5 + c * c * 8, c > 0.55 ? COLORS.danger : COLORS.warn);
    } else {
      setGlow(e, null, e.arch.model.glow);
    }

    // daño por contacto
    if (e.arch.contactDamage > 0 && e.suspend <= 0) {
      const reach = e.arch.radius + MOVE.radius + 0.4;
      if (e.pos.distanceToSquared(player.pos) < reach * reach) hurt(e.arch.contactDamage);
    }

    // barra de vida flotante
    const s = fx.project(tmp.copy(e.pos).setY(e.pos.y + e.hh + 0.45), cam);
    if (s.front) {
      e.bar.style.display = '';
      e.bar.style.left = s.x + 'px';
      e.bar.style.top = s.y + 'px';
      e.bar.style.width = (34 + e.arch.score * 10) + 'px';
      e.bar.style.marginLeft = -(17 + e.arch.score * 5) + 'px';
      e.fill.style.width = Math.max(0, e.health / e.arch.health * 100) + '%';
    } else {
      e.bar.style.display = 'none';
    }
  }
}

/** Reinicio completo (cambio de kit): nadie debe heredar el estado del anterior. */
export function resetAll() {
  projectiles.clear();
  for (let i = 0; i < enemies.length; i++) { reset(enemies[i], i); enemies[i].bar.style.display = ''; }
}
