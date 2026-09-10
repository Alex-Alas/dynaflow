// FSM de movimiento: Grounded / Airborne / WallRun / Sliding / AirCombo.
// Los estados son funciones en un mapa; `player.state` es el string.
//
// Los números salen de `stats.js`, no de `config.js`: son los del kit activo.
// La forma de acceso es la misma (`MOVE.runSpeed`), así que la FSM no sabe que
// existen los kits — y eso es justo lo que la mantiene tuneable.
import * as THREE from 'three';
import { CAMERA, ENEMY, KEYS, COLORS } from './config.js';
import { MOVE, SLIDE, WALLRUN, DASH, AIRCOMBO, active } from './stats.js';
import { held, pressed, mouse } from './input.js';
import { moveAndCollide } from './physics.js';
import { buildBiped, buildWeapon } from './models.js';
import { animateBiped } from './anim.js';
import * as fx from './fx.js';

export const player = {
  pos: new THREE.Vector3(0, 1.2, 28),
  vel: new THREE.Vector3(),
  state: 'airborne',
  yaw: Math.PI, pitch: 0,
  hh: MOVE.height / 2,
  grounded: false,
  airJumps: MOVE.airJumps,
  dashes: DASH.charges,
  dashTime: 0,
  dashDir: new THREE.Vector3(),
  hookTime: 0,
  hookPoint: new THREE.Vector3(),
  overdrive: 0,
  wallTime: 0,
  wallCool: 0,
  wallSide: 1,
  wallNormal: new THREE.Vector3(),
  acTime: 0,
  health: MOVE.maxHealth,
  iframe: 0,
  speed: 0,
  root: null,
  model: null,
  rig: null,
  glow: [],
  tips: [],
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

function refill() { player.airJumps = MOVE.airJumps; player.dashes = DASH.charges; }

function enter(s) {
  if (player.state === s) return;
  const drop = (MOVE.height - SLIDE.height) / 2;
  if (player.state === 'sliding') { player.pos.y += drop; player.hh = MOVE.height / 2; }
  if (s === 'sliding') {
    player.hh = SLIDE.height / 2;
    player.pos.y -= drop;                      // al salir no se comprueba techo; la colisión empuja hacia abajo
    player.vel.x *= SLIDE.boost;
    player.vel.z *= SLIDE.boost;
    fx.ring(player.pos.clone().setY(player.pos.y - player.hh), COLORS.cyan, 3, 0.35);
  }
  if (s === 'grounded') refill();
  player.state = s;
}

function jump() {
  player.vel.y = MOVE.jumpVel;
  enter('airborne');
  fx.spark(player.pos, COLORS.cyan, 1.2, 0.2);
}

// --- detección de muros: raycast horizontal a izquierda y derecha ---
const dir = new THREE.Vector3();
function detectWall() {
  basis();
  for (const s of [1, -1]) {
    dir.copy(right).multiplyScalar(s);
    ray.set(player.pos, dir);
    ray.far = MOVE.radius + WALLRUN.rayLen;
    const hit = ray.intersectObjects(meshes, false)[0];
    // Todas las cajas del nivel están sin rotar → la normal local ya es la del mundo.
    if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.3) return hit.face.normal.clone();
  }
  return null;
}

function stillOnWall() {
  ray.set(player.pos, dir.copy(player.wallNormal).negate());
  ray.far = MOVE.radius + 0.45;
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
  // La normal apunta del muro al jugador: si va hacia su derecha, el muro le queda a la izquierda.
  player.wallSide = n.dot(basis().right) > 0 ? 1 : -1;
  refill();
  enter('wallrun');
  fx.shake(0.06);
}

// --- estados ---
function air(dt, gScale) {
  player.vel.y -= MOVE.gravity * gScale * dt;
  accelerate(dt, MOVE.airAccel, MOVE.runSpeed);
  if (pressed(KEYS.jump) && player.airJumps > 0) {
    player.airJumps--;
    player.vel.y = MOVE.jumpVel * 0.92;
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
    friction(dt, MOVE.friction);
    accelerate(dt, MOVE.accel, MOVE.runSpeed);
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
    if (player.grounded) player.vel.y = -2; else player.vel.y -= MOVE.gravity * dt;
    friction(dt, SLIDE.friction);
    accelerate(dt, MOVE.accel * SLIDE.steer, MOVE.runSpeed);
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
    s = Math.min(s + Math.max(0, along) * MOVE.accel * dt, WALLRUN.maxSpeed);

    if (pressed(KEYS.jump)) {
      player.vel.x = t.x * s + n.x * WALLRUN.jumpNormal;
      player.vel.z = t.z * s + n.z * WALLRUN.jumpNormal;
      player.vel.y = WALLRUN.jumpUp;
      player.wallCool = WALLRUN.cooldown;
      fx.shake(0.13);
      fx.burst(player.pos.clone().addScaledVector(n, -MOVE.radius), COLORS.cyan, 10, 7);
      return enter('airborne');
    }

    player.vel.x = t.x * s - n.x * WALLRUN.stick;
    player.vel.z = t.z * s - n.z * WALLRUN.stick;
    fx.spark(player.pos.clone().addScaledVector(n, -MOVE.radius * 1.1), active.kit.trail, 0.55, 0.25);

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
  fx.ring(player.pos.clone(), active.kit.trail, 3.5, 0.3);
}

// --- gancho (firma de WIRE) ---
/**
 * Se lanza hacia `point` conservando el control aéreo al soltar. No es daño: es
 * reposicionamiento, que es lo que compensa que WIRE no tenga doble salto.
 */
export function startHook(point) {
  const sig = active.kit.signature;
  player.hookPoint.copy(point);
  player.hookTime = sig.maxTime;
  player.onCancel?.();
  fx.shake(0.09);
  fx.ring(player.pos.clone(), active.kit.trail, 2.6, 0.25);
}

/** Punto de anclaje del gancho: enemigo apuntado, o la superficie que mira la cámara. */
export function hookAnchor(target, enemyList) {
  const sig = active.kit.signature;
  const f = basis().fwd.clone();
  f.y = Math.sin(-player.pitch) * 1.4;
  f.normalize();

  if (target && !target.dead) return target.pos.clone();

  // Mejor enemigo dentro del cono, si lo hay: enganchar a un cuerpo es más útil
  // que a una pared cuando estás en pleno combate.
  let best = null, bestDot = 0.9;
  for (const e of enemyList || []) {
    if (e.dead) continue;
    const to = e.pos.clone().sub(player.pos);
    const d = to.length();
    if (d > sig.range || d < 2) continue;
    const dot = to.divideScalar(d).dot(f);
    if (dot > bestDot) { bestDot = dot; best = e; }
  }
  if (best) return best.pos.clone();

  ray.set(player.pos, f);
  ray.far = sig.range;
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.clone().addScaledVector(f, -0.4) : null;
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
  player.health = MOVE.maxHealth;
  player.state = 'airborne';
  player.hh = MOVE.height / 2;
  player.hookTime = 0;
  player.overdrive = 0;
}

// --- modelo ---
/**
 * Construye (o reconstruye) el cuerpo del kit activo. Se llama al arrancar y en
 * cada cambio de kit; el modelo anterior se descarta entero, que a esta escala
 * es más simple y más seguro que intentar mutarlo.
 */
export function buildModel() {
  const kit = active.kit;
  if (player.model) {
    player.root.remove(player.model);
    player.model = null;
  }
  const { root: model, rig, glow } = buildBiped(kit.model);
  const w = kit.weapon;
  const hands = w.hand === 'both' ? ['R', 'L'] : [w.hand];
  const tips = [];
  for (const h of hands) {
    const built = buildWeapon(w.kind, w.color, kit.model.accent);
    // El arma cuelga de la mano y crece hacia -Y, así que el brazo la arrastra
    // sin sincronizar nada. Escala con la altura: la misma katana en un cuerpo
    // de 1.62 m y en uno de 1.95 m no puede medir lo mismo.
    built.root.scale.setScalar(kit.model.height / 1.8);
    built.root.position.y = -0.03 * kit.model.height;
    if (h === 'L') built.root.scale.x = -1;
    rig[h === 'R' ? 'handR' : 'handL'].add(built.root);
    glow.push(...built.glow);
    tips.push(built.tip);
  }
  player.tips = tips;
  // Intensidad de reposo de cada emissive: el flash y el overdrive vuelven aquí.
  for (const m of glow) m.userData.base = m.emissiveIntensity;
  player.root.add(model);
  player.model = model;
  player.rig = rig;
  player.glow = glow;
}

export function setKit(id) {
  const kit = active.kit;
  if (kit && kit.id === id) return kit;
  const next = applyKitAndRebuild(id);
  fx.ring(player.pos.clone(), next.trail, 5, 0.45);
  fx.burst(player.pos.clone(), next.trail, 18, 8);
  fx.shake(0.16);
  return next;
}

let applyKitFn = null;
/** main.js inyecta `stats.applyKit` para no crear un ciclo player ↔ stats. */
export function bindKitApplier(fn) { applyKitFn = fn; }

function applyKitAndRebuild(id) {
  const next = applyKitFn(id);
  // El collider cambia de tamaño con el kit: recolocar para no quedar encajado.
  player.hh = player.state === 'sliding' ? SLIDE.height / 2 : MOVE.height / 2;
  player.pos.y += 0.25;
  player.health = Math.min(player.health, MOVE.maxHealth);
  // El overdrive es de ECHO: llevárselo puesto a otro kit rompería sus tiempos.
  player.overdrive = 0;
  player.hookTime = 0;
  refill();
  buildModel();
  return next;
}

export function init(s, worldMeshes) {
  meshes = worldMeshes;
  const root = new THREE.Group();
  s.add(root);
  player.root = root;
  player.hh = MOVE.height / 2;
  buildModel();
  return root;
}

export function update(dt, colliders, target, enemyList) {
  player.yaw -= mouse.dx;
  player.pitch = Math.min(CAMERA.pitchMax, Math.max(CAMERA.pitchMin, player.pitch - mouse.dy));
  player.wallCool -= dt;
  player.iframe -= dt;
  player.overdrive -= dt;

  if (pressed(KEYS.dash) && player.dashes > 0 && player.dashTime <= 0 && player.hookTime <= 0) {
    startDash(target);
  }

  if (player.hookTime > 0) {
    // El gancho reapunta cada frame: si el ancla es un enemigo que se mueve, sigue.
    const sig = active.kit.signature;
    player.hookTime -= dt;
    dir.subVectors(player.hookPoint, player.pos);
    const d = dir.length();
    dir.divideScalar(d || 1);
    player.vel.copy(dir).multiplyScalar(sig.speed);
    fx.spark(player.pos.clone(), active.kit.trail, 1.1, 0.2);
    fx.beam(player.pos, player.hookPoint, active.kit.trail);
    // Cortar el gancho contra un muro y entrar en wall run es la mejor transición del kit.
    if (player.wallCool <= 0 && player.state !== 'wallrun') {
      const n = detectWall();
      if (n) { player.hookTime = 0; enterWall(n); }
    }
    if (d < sig.stopAt || player.hookTime <= 0) {
      player.hookTime = 0;
      const s = hspeed();
      if (s > sig.keepSpeed) {
        player.vel.x *= sig.keepSpeed / s;
        player.vel.z *= sig.keepSpeed / s;
      }
      player.vel.y = Math.min(player.vel.y, 8);
      if (player.state === 'grounded') enter('airborne');
    }
  } else if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vel.copy(player.dashDir).multiplyScalar(DASH.speed);
    fx.spark(player.pos.clone(), active.kit.trail, 1.1, 0.22);
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

  const res = moveAndCollide(player.pos, player.vel, dt, colliders, MOVE.radius, player.hh);
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
  // Los pies pegados a la base del collider: al deslizarse, `hh` cambia y el
  // modelo baja con él en vez de flotar.
  if (player.model) player.model.position.y = -player.hh;

  if (player.rig) {
    animateBiped(player.rig, {
      state: player.state,
      speed: player.speed,
      vy: player.vel.y,
      wallSide: player.wallSide,
      dashing: player.dashTime > 0 || player.hookTime > 0,
      maxSpeed: MOVE.runSpeed,
    }, dt);
  }

  // El overdrive de ECHO se lee en el cuerpo, no solo en el HUD.
  if (player.glow.length) {
    const pulse = player.overdrive > 0
      ? 3.6 + Math.sin(performance.now() * 0.02) * 1.4
      : 0;
    for (const m of player.glow) m.emissiveIntensity = pulse || m.userData.base;
  }

  if (player.pos.y < -25) respawn();
}
