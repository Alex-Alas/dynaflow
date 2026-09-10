// Combos, cancelación, launcher y habilidad firma.
//
// Este archivo ya no sabe qué arma llevas: el moveset son DATOS que vienen del
// kit activo (`kits.js`) y aquí solo se ejecutan sus tiempos. Añadir un kit
// nuevo no debería obligar a tocar nada de aquí — si obliga, el reparto de
// responsabilidades está mal.
import * as THREE from 'three';
import { KEYS, COLORS, FX } from './config.js';
import { COMBO, AIRCOMBO, DASH, active } from './stats.js';
import { pressed } from './input.js';
import { player, enterAirCombo, forward, startHook, hookAnchor } from './player.js';
import { enemies, damage } from './enemies.js';
import { applySwing, strikeCurve } from './anim.js';
import * as fx from './fx.js';

export const combat = {
  t: 0,             // tiempo restante del swing actual
  total: 0,
  index: 0,         // paso del combo
  chain: 0,         // ventana para encadenar
  kind: null,       // 'light' | 'launch' | 'sig'
  step: null,       // datos del golpe activo, tomados del kit
  hit: false,
  sigCd: 0,
  cancelable: false,
};

const tmp = new THREE.Vector3();
const tip = new THREE.Vector3();

export function init() { reset(); }

function reset() {
  combat.t = combat.chain = combat.index = 0;
  combat.kind = combat.step = null;
  combat.hit = false;
  combat.cancelable = false;
}

/** Cancelar el final de la animación con dash / salto / wall run. */
export function cancel() {
  if (combat.t > 0 && combat.cancelable) { combat.t = 0; combat.kind = null; }
}

const isAirborne = () => player.state !== 'grounded' && player.state !== 'sliding';

/** Overdrive de ECHO: acelera todos los tiempos del swing, incluida la cancelación. */
const rate = () => (player.overdrive > 0 ? (active.kit.signature.rate || 1) : 1);

function start(kind) {
  const kit = active.kit;
  combat.kind = kind;
  combat.hit = false;
  combat.cancelable = false;

  if (kind === 'launch') {
    combat.step = kit.launch;
    combat.index = 0;
  } else if (kind === 'sig') {
    combat.step = kit.signature;
    combat.sigCd = kit.signature.cooldown;
  } else {
    combat.index = combat.chain > 0 ? (combat.index + 1) % kit.combo.length : 0;
    combat.step = kit.combo[combat.index];
  }

  combat.total = combat.step.total * rate();
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
    if (d > range + e.arch.radius) continue;
    if (arc !== null && d > 1 && tmp.setY(0).normalize().dot(f) < arc) continue;
    out.push(e);
  }
  return out;
}

function applyLight(cam) {
  const step = combat.step;
  const f = forward();
  const list = hits(step.range, step.arc);
  fx.spark(tmp.copy(player.pos).addScaledVector(f, 1.8), active.kit.trail, 1.6, 0.16);
  if (!list.length) return;

  for (const e of list) {
    const knock = tmp.copy(f).multiplyScalar(step.knock * e.arch.knockResist)
      .setY(isAirborne() ? 0 : 1).clone();
    if (isAirborne() && !e.arch.heavy) {
      // Gravity override: el enemigo golpeado en el aire flota y se refresca en cada impacto.
      e.suspend = AIRCOMBO.time;
      e.vel.y = Math.max(e.vel.y, AIRCOMBO.lift);
      knock.multiplyScalar(0.45);
    }
    damage(e, step.dmg, knock, cam);
  }
  if (isAirborne()) enterAirCombo();
  // El overdrive se paga golpeando, no esperando: es lo que empuja a ECHO hacia delante.
  if (player.overdrive > 0) player.dashes = DASH.charges;
  fx.hitstop(step.heavy ? FX.hitstopHeavy : FX.hitstop);
  fx.shake(step.heavy ? 0.24 : 0.14);
}

function applyLaunch(cam) {
  const step = combat.step;
  const list = hits(step.range, step.arc);
  fx.ring(player.pos.clone(), COLORS.violet, 4, 0.35);
  for (const e of list) {
    if (e.arch.heavy) {
      // El Tank no se levanta: obliga a cambiar de plan en vez de repetir la rutina.
      e.stun = 0.5;
      damage(e, step.dmg, null, cam);
      fx.burst(e.pos.clone(), COLORS.warn, 10, 6);
      continue;
    }
    e.vel.y = step.enemyVel;
    e.suspend = AIRCOMBO.time * 1.5;
    e.stun = 0.3;
    damage(e, step.dmg, null, cam);
    fx.burst(e.pos.clone(), COLORS.violet, 14, 9);
  }
  player.vel.y = Math.max(player.vel.y, step.playerVel);
  enterAirCombo();
  fx.hitstop(FX.hitstopHeavy);
  fx.shake(0.34);
}

// --- habilidades firma: una entrada por kit, cerradas sobre su propio spec ---

const SIGNATURES = {
  /** VOLT — giro 360°: la respuesta a estar rodeado. */
  aoe(sig, cam) {
    fx.ring(player.pos.clone(), COLORS.cyan, sig.radius * 2, 0.45);
    fx.burst(player.pos.clone(), COLORS.cyan, 22, 11);
    fx.shake(0.3);
    const list = hits(sig.radius, null);
    if (!list.length) return;
    for (const e of list) {
      const knock = tmp.subVectors(e.pos, player.pos).setY(0).normalize()
        .multiplyScalar(sig.knockback * e.arch.knockResist).setY(4).clone();
      damage(e, sig.damage, knock, cam);
    }
    fx.hitstop(FX.hitstop);
  },

  /**
   * WIRE — gancho: no hace daño, reposiciona. Es lo que compensa que WIRE no
   * tenga doble salto, y lo que convierte los pilares de la arena en movilidad.
   */
  hook() {
    const point = hookAnchor(currentTarget, enemies);
    if (!point) {
      // Sin ancla no se cobra el cooldown completo: fallar apuntando no debe castigar.
      combat.sigCd = 0.35;
      fx.spark(player.pos.clone(), COLORS.warn, 1, 0.2);
      return;
    }
    startHook(point);
  },

  /** ECHO — overdrive: ventana corta en la que golpear recarga los dashes. */
  overdrive(sig) {
    player.overdrive = sig.duration;
    fx.ring(player.pos.clone(), active.kit.trail, 5, 0.4);
    fx.burst(player.pos.clone(), active.kit.trail, 20, 9);
    fx.shake(0.2);
  },
};

let currentTarget = null;

export function update(dt, cam, target) {
  currentTarget = target;
  combat.sigCd -= dt;
  combat.chain -= dt;

  if (combat.t > 0) {
    combat.t -= dt;
    const el = combat.total - combat.t;
    combat.cancelable = el >= combat.step.cancel * rate();
    if (!combat.hit && el >= combat.step.active * rate()) {
      combat.hit = true;
      if (combat.kind === 'light') applyLight(cam);
      else if (combat.kind === 'launch') applyLaunch(cam);
      else SIGNATURES[active.kit.signature.id]?.(combat.step, cam);
    }
    if (combat.t <= 0) combat.kind = null;
  }

  // El buffer al final del swing es lo que hace que los combos se sientan responsivos.
  const ready = combat.t <= COMBO.buffer;
  if (pressed(KEYS.attack) && ready) start('light');
  else if (pressed(KEYS.launch) && ready) start('launch');
  else if (pressed(KEYS.aoe) && combat.sigCd <= 0 && ready) start('sig');

  animate();
}

function animate() {
  const rig = player.rig;
  // Sin swing activo no hay nada que hacer: `anim.apply` ya devuelve el rig a la
  // pose de locomoción por su cuenta, porque la base vive aparte de la rotación.
  if (!rig || combat.t <= 0 || !combat.step) return;

  const step = combat.step;
  const k = 1 - combat.t / combat.total;               // 0 → 1 a lo largo del swing
  const b = strikeCurve(k);
  const side = step.hand === 'L' ? -1 : 1;
  applySwing(rig, step.swing, b, side, step.dir || 1);

  // Estela en la punta del arma mientras el golpe está saliendo.
  if (b > 0.05 && player.tips.length) {
    const node = player.tips[side < 0 && player.tips.length > 1 ? 1 : 0];
    node.getWorldPosition(tip);
    fx.spark(tip, combat.kind === 'launch' ? COLORS.violet : active.kit.trail, 0.75, 0.19);
  }
}
