// FSM de movimiento: Grounded / Airborne / WallRun / Sliding / AirCombo.
// Los estados son funciones en un mapa; `player.state` es el string.
import * as THREE from 'three';
import { PLAYER, SLIDE, WALLRUN, DASH, AIRCOMBO, CAMERA, ENEMY, KEYS, COLORS } from './config.js';
import { held, pressed, mouse } from './input.js';
import { moveAndCollide } from './physics.js';
import * as fx from './fx.js';

export const player = {
  pos: new THREE.Vector3(0, 1.2, 28),
  vel: new THREE.Vector3(),
  state: 'airborne',
  yaw: Math.PI, pitch: 0,
  hh: PLAYER.height / 2,
  grounded: false,
  airJumps: PLAYER.airJumps,
  dashes: DASH.charges,
  dashTime: 0,
  dashDir: new THREE.Vector3(),
  wallTime: 0,
  wallCool: 0,
  wallNormal: new THREE.Vector3(),
  acTime: 0,
  health: PLAYER.maxHealth,
  iframe: 0,
  speed: 0,
  root: null,
  onCancel: null,   // combat.cancel, inyectado desde main
};

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();
const tan = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ray = new THREE.Raycaster();
let meshes = [];

export const hspeed = () => Math.hypot(player.vel.x, player.vel.z);
export const forward = () => basis().fwd;

function basis() {
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  return { fwd, right };
}

function wishDir() {
  basis();
  wish.set(0, 0, 0);
  if (held(KEYS.fwd)) wish.add(fwd);
  if (held(KEYS.back)) wish.sub(fwd);
  if (held(KEYS.right)) wish.add(right);
  if (held(KEYS.left)) wish.sub(right);
  return wish.lengthSq() > 0 ? wish.normalize() : wish;
}

// Aceleración estilo Quake: no frena si ya vas más rápido que `max`,
// solo deja de empujar. Es lo que conserva el impulso del dash y del slide.
function accelerate(dt, accel, max) {
  const w = wishDir();
  if (w.lengthSq() === 0) return;
  const cur = player.vel.x * w.x + player.vel.z * w.z;
  const add = Math.min(accel * dt, Math.max(0, max - cur));
  player.vel.x += w.x * add;
  player.vel.z += w.z * add;
}

function friction(dt, f) {
  const s = hspeed();
  if (s < 0.05) { player.vel.x = player.vel.z = 0; return; }
  const k = Math.max(0, s - Math.max(s, 3) * f * dt) / s;
  player.vel.x *= k;
  player.vel.z *= k;
}

function refill() { player.airJumps = PLAYER.airJumps; player.dashes = DASH.charges; }

function enter(s) {
  if (player.state === s) return;
  const drop = (PLAYER.height - SLIDE.height) / 2;
  if (player.state === 'sliding') { player.pos.y += drop; player.hh = PLAYER.height / 2; }
  if (s === 'sliding') {
    player.hh = SLIDE.height / 2;
    player.pos.y -= drop;                      // ponytail: al salir no se comprueba techo; la colisión empuja hacia abajo
    player.vel.x *= SLIDE.boost;
    player.vel.z *= SLIDE.boost;
    fx.ring(player.pos.clone().setY(player.pos.y - player.hh), COLORS.cyan, 3, 0.35);
  }
  if (s === 'grounded') refill();
  player.state = s;
}

function jump() {
  player.vel.y = PLAYER.jumpVel;
  enter('airborne');
  fx.spark(player.pos, COLORS.cyan, 1.2, 0.2);
}

// --- detección de muros: raycast horizontal a izquierda y derecha ---
const dir = new THREE.Vector3();
const org = new THREE.Vector3();
function detectWall() {
  basis();
  org.copy(player.pos);
  for (const s of [1, -1]) {
    dir.copy(right).multiplyScalar(s);
    ray.set(org, dir);
    ray.far = PLAYER.radius + WALLRUN.rayLen;
    const hit = ray.intersectObjects(meshes, false)[0];
    // Todas las cajas del nivel están sin rotar → la normal local ya es la del mundo.
    if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.3) return hit.face.normal.clone();
  }
  return null;
}

function stillOnWall() {
  ray.set(player.pos, dir.copy(player.wallNormal).negate());
  ray.far = PLAYER.radius + 0.45;
  return ray.intersectObjects(meshes, false).length > 0;
}

/** Tangente del muro en el sentido en que ya se mueve el jugador. */
function tangent(n) {
  tan.crossVectors(UP, n).normalize();
  if (tan.x * player.vel.x + tan.z * player.vel.z < 0) tan.negate();
  return tan;
}

function enterWall(n) {
  player.wallNormal.copy(n);
  player.wallTime = 0;
  player.vel.y = Math.max(player.vel.y, 0) * 0.35;
  const t = tangent(n);
  const s = Math.min(hspeed(), WALLRUN.maxSpeed);
  player.vel.x = t.x * s;
  player.vel.z = t.z * s;
  refill();
  enter('wallrun');
  fx.shake(0.06);
}

// --- estados ---
function air(dt, gScale) {
  player.vel.y -= PLAYER.gravity * gScale * dt;
  accelerate(dt, PLAYER.airAccel, PLAYER.runSpeed);
  if (pressed(KEYS.jump) && player.airJumps > 0) {
    player.airJumps--;
    player.vel.y = PLAYER.jumpVel * 0.92;
    player.onCancel?.();
    fx.ring(player.pos.clone(), COLORS.violet, 2.5, 0.3);
  }
  if (player.wallCool <= 0 && player.vel.y < 6 && hspeed() >= WALLRUN.minSpeed) {
    const n = detectWall();
    if (n) { player.onCancel?.(); enterWall(n); }
  }
}

const states = {
  grounded(dt) {
    player.vel.y = -2;                       // pega al suelo: garantiza detección de `grounded` cada frame
    friction(dt, PLAYER.friction);
    accelerate(dt, PLAYER.accel, PLAYER.runSpeed);
    if (pressed(KEYS.jump)) return jump();
    if (held(KEYS.slide) && hspeed() > SLIDE.minSpeed) enter('sliding');
  },

  airborne(dt) { air(dt, 1); },

  aircombo(dt) {
    player.acTime -= dt;
    air(dt, AIRCOMBO.gravityScale);
    if (player.acTime <= 0 && player.state === 'aircombo') enter('airborne');
  },

  sliding(dt) {
    if (player.grounded) player.vel.y = -2; else player.vel.y -= PLAYER.gravity * dt;
    friction(dt, SLIDE.friction);
    accelerate(dt, PLAYER.accel * SLIDE.steer, PLAYER.runSpeed);
    if (Math.random() < 0.6) {
      fx.spark(player.pos.clone().setY(player.pos.y - player.hh), COLORS.cyan, 0.5, 0.22);
    }
    if (pressed(KEYS.jump)) return jump();
    if (!held(KEYS.slide) || hspeed() < SLIDE.minSpeed) enter('grounded');
  },

  wallrun(dt) {
    player.wallTime += dt;
    player.vel.y -= WALLRUN.gravity * dt;
    const n = player.wallNormal;
    const t = tangent(n);
    let s = player.vel.x * t.x + player.vel.z * t.z;
    const along = wishDir().dot(t);
    s = Math.min(s + Math.max(0, along) * PLAYER.accel * dt, WALLRUN.maxSpeed);

    if (pressed(KEYS.jump)) {
      player.vel.x = t.x * s + n.x * WALLRUN.jumpNormal;
      player.vel.z = t.z * s + n.z * WALLRUN.jumpNormal;
      player.vel.y = WALLRUN.jumpUp;
      player.wallCool = WALLRUN.cooldown;
      fx.shake(0.13);
      fx.burst(player.pos.clone().addScaledVector(n, -PLAYER.radius), COLORS.cyan, 10, 7);
      return enter('airborne');
    }

    player.vel.x = t.x * s - n.x * WALLRUN.stick;
    player.vel.z = t.z * s - n.z * WALLRUN.stick;
    fx.spark(player.pos.clone().addScaledVector(n, -PLAYER.radius * 1.1), COLORS.neon, 0.55, 0.25);

    if (player.wallTime > WALLRUN.maxTime || s < WALLRUN.minSpeed * 0.5 || !stillOnWall()) {
      player.wallCool = WALLRUN.cooldown;
      enter('airborne');
    }
  },
};

// --- dash ---
function startDash(target) {
  const w = wishDir();
  if (w.lengthSq() > 0) player.dashDir.copy(w);
  else if (target) player.dashDir.subVectors(target.pos, player.pos).setY(0).normalize();
  else player.dashDir.copy(basis().fwd);
  player.dashTime = DASH.time;
  player.dashes--;
  player.onCancel?.();                       // el dash cancela el final de la animación de ataque
  fx.shake(0.1);
  fx.ring(player.pos.clone(), COLORS.neon, 3.5, 0.3);
}

/** Llamado por combat.js al conectar un golpe en el aire: gravity override. */
export function enterAirCombo() {
  player.acTime = AIRCOMBO.time;
  if (player.state !== 'grounded' && player.state !== 'sliding') {
    player.state = 'aircombo';
    player.vel.y = Math.max(player.vel.y, AIRCOMBO.lift);
  }
}

export function hurt(amount) {
  if (player.iframe > 0) return;
  player.iframe = ENEMY.iframes;
  player.health = Math.max(0, player.health - amount);
  fx.shake(0.3);
  fx.hitstop(0.05);
  if (player.health <= 0) respawn();
}

export function respawn() {
  player.pos.set(0, 1.2, 28);
  player.vel.set(0, 0, 0);
  player.health = PLAYER.maxHealth;
  player.state = 'airborne';
  player.hh = PLAYER.height / 2;
}

export function init(scene, worldMeshes) {
  meshes = worldMeshes;
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 4, 12),
    new THREE.MeshLambertMaterial({ color: 0x2b2b3d, emissive: COLORS.violet, emissiveIntensity: 0.25 }),
  );
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.1),
    new THREE.MeshBasicMaterial({ color: COLORS.cyan }),
  );
  visor.position.set(0, 0.55, -PLAYER.radius);
  root.add(body, visor);
  scene.add(root);
  player.root = root;
  return root;
}

export function update(dt, colliders, target) {
  player.yaw -= mouse.dx;
  player.pitch = Math.min(CAMERA.pitchMax, Math.max(CAMERA.pitchMin, player.pitch - mouse.dy));
  player.wallCool -= dt;
  player.iframe -= dt;

  if (pressed(KEYS.dash) && player.dashes > 0 && player.dashTime <= 0) startDash(target);

  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vel.copy(player.dashDir).multiplyScalar(DASH.speed);
    fx.spark(player.pos.clone(), COLORS.neon, 1.1, 0.22);
    // Entrar a wall run desde un dash es una de las mejores transiciones del juego.
    if (player.wallCool <= 0 && player.state !== 'wallrun') {
      const n = detectWall();
      if (n) { player.dashTime = 0; enterWall(n); }
    }
    if (player.dashTime <= 0) {
      const s = hspeed();
      if (s > DASH.keepSpeed) {
        player.vel.x *= DASH.keepSpeed / s;
        player.vel.z *= DASH.keepSpeed / s;
      }
      player.vel.y *= 0.4;
    }
  } else {
    states[player.state](dt);
  }

  const res = moveAndCollide(player.pos, player.vel, dt, colliders, PLAYER.radius, player.hh);
  player.grounded = res.grounded;

  if (res.grounded) {
    refill();
    if (player.state === 'airborne' || player.state === 'aircombo' || player.state === 'wallrun') {
      enter('grounded');
    }
  } else if (player.state === 'grounded') {
    enter('airborne');
  }

  player.speed = hspeed();
  player.root.position.copy(player.pos);
  player.root.rotation.y = player.yaw;
  if (player.pos.y < -25) respawn();
}
