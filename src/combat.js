// Cadenas de combos, cancelación, launcher, combate aéreo y AoE 360°.
import * as THREE from 'three';
import { COMBO, LAUNCH, AOE, AIRCOMBO, KEYS, COLORS, ENEMY, FX } from './config.js';
import { pressed } from './input.js';
import { player, enterAirCombo, forward } from './player.js';
import { enemies, damage } from './enemies.js';
import * as fx from './fx.js';

export const combat = {
  t: 0,             // tiempo restante del swing actual
  total: 0,
  index: 0,         // paso del combo (0..2)
  chain: 0,         // ventana para encadenar
  kind: null,       // 'light' | 'launch' | 'aoe'
  hit: false,
  aoeCd: 0,
  cancelable: false,
};

let weapon = null;
const tmp = new THREE.Vector3();
const tip = new THREE.Vector3();

export function init(root) {
  weapon = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 2.1),
    new THREE.MeshBasicMaterial({ color: COLORS.neon }),
  );
  blade.position.z = -1.05;
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x15151f }),
  );
  weapon.add(blade, grip);
  weapon.position.set(0.45, 0.25, -0.3);
  root.add(weapon);
  return weapon;
}

/** Cancelar el final de la animación con dash / salto / wall run. */
export function cancel() {
  if (combat.t > 0 && combat.cancelable) { combat.t = 0; combat.kind = null; }
}

const isAirborne = () => player.state !== 'grounded' && player.state !== 'sliding';

function start(kind) {
  combat.kind = kind;
  combat.hit = false;
  combat.cancelable = false;
  if (kind === 'launch') { combat.total = LAUNCH.total; combat.index = 0; }
  else if (kind === 'aoe') { combat.total = AOE.total; combat.aoeCd = AOE.cooldown; }
  else { combat.total = COMBO.total; combat.index = combat.chain > 0 ? (combat.index + 1) % 3 : 0; }
  combat.t = combat.total;
  combat.chain = COMBO.chain;
}

function hits(range, arc) {
  const f = forward();
  const out = [];
  for (const e of enemies) {
    if (e.dead) continue;
    tmp.subVectors(e.pos, player.pos);
    const d = tmp.length();
    if (d > range + ENEMY.radius) continue;
    if (arc !== null && d > 1 && tmp.setY(0).normalize().dot(f) < arc) continue;
    out.push(e);
  }
  return out;
}

function applyLight(cam) {
  const f = forward();
  const list = hits(COMBO.range, COMBO.arc);
  const dmg = COMBO.damage[combat.index];
  fx.spark(tmp.copy(player.pos).addScaledVector(f, 1.8), COLORS.neon, 1.6, 0.16);
  if (!list.length) return;

  for (const e of list) {
    const knock = tmp.copy(f).multiplyScalar(COMBO.knockback).setY(isAirborne() ? 0 : 1).clone();
    if (isAirborne()) {
      // Gravity override: el enemigo golpeado en el aire flota y se refresca en cada impacto.
      e.suspend = AIRCOMBO.time;
      e.vel.y = Math.max(e.vel.y, AIRCOMBO.lift);
      knock.multiplyScalar(0.45);
    }
    damage(e, dmg, knock, cam);
  }
  if (isAirborne()) enterAirCombo();
  fx.hitstop(combat.index === 2 ? FX.hitstopHeavy : FX.hitstop);
  fx.shake(combat.index === 2 ? 0.24 : 0.14);
}

function applyLaunch(cam) {
  const list = hits(COMBO.range, COMBO.arc);
  fx.ring(player.pos.clone(), COLORS.violet, 4, 0.35);
  if (!list.length) return;
  for (const e of list) {
    e.vel.y = LAUNCH.enemyVel;
    e.suspend = AIRCOMBO.time * 1.5;
    e.stun = 0.3;
    damage(e, LAUNCH.damage, null, cam);
    fx.burst(e.pos.clone(), COLORS.violet, 14, 9);
  }
  player.vel.y = Math.max(player.vel.y, LAUNCH.playerVel);
  enterAirCombo();
  fx.hitstop(FX.hitstopHeavy);
  fx.shake(0.34);
}

function applyAoe(cam) {
  fx.ring(player.pos.clone(), COLORS.cyan, AOE.radius * 2, 0.45);
  fx.burst(player.pos.clone(), COLORS.cyan, 22, 11);
  fx.shake(0.3);
  const list = hits(AOE.radius, null);
  if (!list.length) return;
  for (const e of list) {
    const knock = tmp.subVectors(e.pos, player.pos).setY(0).normalize()
      .multiplyScalar(AOE.knockback).setY(4).clone();
    damage(e, AOE.damage, knock, cam);
  }
  fx.hitstop(FX.hitstop);
}

export function update(dt, cam) {
  combat.aoeCd -= dt;
  combat.chain -= dt;

  if (combat.t > 0) {
    combat.t -= dt;
    const el = combat.total - combat.t;
    combat.cancelable = el >= COMBO.cancel;
    if (!combat.hit && el >= COMBO.active) {
      combat.hit = true;
      if (combat.kind === 'light') applyLight(cam);
      else if (combat.kind === 'launch') applyLaunch(cam);
      else applyAoe(cam);
    }
    if (combat.t <= 0) combat.kind = null;
  }

  // El buffer al final del swing es lo que hace que los combos se sientan responsivos.
  const ready = combat.t <= COMBO.buffer;
  if (pressed(KEYS.attack) && ready) start('light');
  else if (pressed(KEYS.launch) && ready) start('launch');
  else if (pressed(KEYS.aoe) && combat.aoeCd <= 0 && ready) start('aoe');

  animate(dt);
}

function animate(dt) {
  if (!weapon) return;
  if (combat.t <= 0) {
    weapon.rotation.set(
      weapon.rotation.x * (1 - 8 * dt), 0,
      weapon.rotation.z * (1 - 8 * dt),
    );
    weapon.position.set(0.45, 0.25, -0.3);
    return;
  }
  const k = 1 - combat.t / combat.total;              // 0 → 1 a lo largo del swing
  const swing = Math.sin(Math.min(1, k * 1.4) * Math.PI);
  if (combat.kind === 'aoe') {
    weapon.rotation.set(0, 0, 1.4);
    weapon.rotation.y = k * Math.PI * 2;
    weapon.position.set(0, 0.2, 0);
  } else if (combat.kind === 'launch') {
    weapon.rotation.set(-2.4 + k * 3.4, 0, 0);
    weapon.position.set(0.2, 0.1 + swing * 0.4, -0.4);
  } else {
    const s = combat.index % 2 ? -1 : 1;              // alterna el lado del barrido
    weapon.rotation.set(0.2, 0, s * (1.6 - k * 3.2));
    weapon.position.set(0.45 * s, 0.25, -0.3 - swing * 0.5);
  }
  // Estela: chispas en la punta del arma mientras dura el barrido.
  weapon.getWorldPosition(tip);
  tip.addScaledVector(forward(), 0.9);
  fx.spark(tip, combat.kind === 'launch' ? COLORS.violet : COLORS.neon, 0.75, 0.19);
}
