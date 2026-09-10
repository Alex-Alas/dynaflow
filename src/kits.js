// Los tres kits. Este archivo es DATOS: no importa lógica de juego y nada lo
// importa salvo `stats.js` y el selector de la pantalla de inicio.
//
// El patrón viene de los estilos de Dante en DMC: no son personajes distintos,
// es el mismo núcleo de movimiento con distinto énfasis de verbos. Y de la regla
// de Overwatch de que la fantasía jugable y la identidad visual lleguen juntas:
// aquí la silueta, la paleta y los números dicen lo mismo o el kit miente.
//
// Los tres se separan en los tres ejes que importan: ALCANCE, CADENCIA y
// HERRAMIENTA DE REPOSICIONAMIENTO. Si dos kits coincidieran en los tres, uno
// de los dos sobra.
import { COLORS } from './config.js';

/**
 * Un paso de combo:
 *   dmg     daño
 *   range   alcance en metros
 *   arc     dot mínimo con el frente (negativo = golpea también a los lados)
 *   active  frame en que se activa la hitbox
 *   total   duración del swing
 *   cancel  desde cuándo se puede cancelar con dash / salto / wall run
 *   knock   knockback
 *   swing   pose de ataque en anim.js
 *   hand    'R' | 'L'
 *   dir     lado del barrido (alterna para que la cadena no se vea repetida)
 *   heavy   hitstop y screenshake reforzados
 */

export const KITS = {

  // --------------------------------------------------------------- VOLT ----
  // El equilibrado, y el BASELINE: sus números son idénticos a los del prototipo
  // original. Si el flow se rompe al refactorizar, se rompe aquí y se ve.
  volt: {
    id: 'volt',
    name: 'VOLT',
    tagline: 'espadachín de flujo',
    blurb: 'Equilibrado. Combo x3, launcher y giro 360°.',
    color: COLORS.neon,
    trail: COLORS.neon,
    model: {
      height: 1.8, build: 1,
      shell: 0x4a4a68, accent: 0x241c34, glow: COLORS.cyan,
      visor: 'bar', pauldron: 0.09, coat: 0.24,
    },
    weapon: { kind: 'katana', color: COLORS.neon, hand: 'R' },

    move: { height: 1.8, radius: 0.42, runSpeed: 9, accel: 70, airAccel: 26, airJumps: 1 },
    slide: { height: 0.9 },
    wallrun: {},
    dash: {},
    aircombo: {},

    combo: [
      { dmg: 10, range: 3.0, arc: 0.15, active: .07, total: .34, cancel: .17, knock: 5, swing: 'slash', hand: 'R', dir: 1 },
      { dmg: 10, range: 3.0, arc: 0.15, active: .07, total: .34, cancel: .17, knock: 5, swing: 'slash', hand: 'R', dir: -1 },
      { dmg: 18, range: 3.0, arc: 0.15, active: .07, total: .34, cancel: .17, knock: 5, swing: 'cleave', hand: 'R', dir: 1, heavy: true },
    ],
    launch: { dmg: 14, range: 3.0, arc: 0.15, active: .07, total: .40, cancel: .2, enemyVel: 12, playerVel: 10.5, swing: 'thrust', hand: 'R' },
    signature: {
      id: 'aoe', label: 'AOE', cooldown: 3, total: .45, active: .12, cancel: .3,
      swing: 'spin', hand: 'R',
      damage: 8, radius: 4.5, knockback: 13,
    },
  },

  // --------------------------------------------------------------- WIRE ----
  // Control del espacio. Pega lejos y despacio, y su firma NO es daño: es
  // reposicionamiento. Renuncia al doble salto porque el gancho lo sustituye —
  // un kit que suma sin restar no es un kit, es una mejora.
  wire: {
    id: 'wire',
    name: 'WIRE',
    tagline: 'control del espacio',
    blurb: 'Alcance largo y lento. El gancho te lanza: el mapa es tu movilidad.',
    color: COLORS.violet,
    trail: COLORS.violet,
    model: {
      height: 1.95, build: 1.18,
      shell: 0x54446e, accent: 0x281a3c, glow: COLORS.violet,
      visor: 'bar', pauldron: 0.15, coat: 0.40, back: 'coil',
    },
    weapon: { kind: 'scythe', color: COLORS.violet, hand: 'R' },

    move: { height: 1.95, radius: 0.48, runSpeed: 8, accel: 62, airAccel: 22, airJumps: 0 },
    slide: { height: 1.0, boost: 1.34 },
    wallrun: { maxTime: 3.2, maxSpeed: 12.5, gravity: 4.0 },
    dash: { speed: 22, keepSpeed: 12 },
    aircombo: { time: 1.35 },

    combo: [
      { dmg: 16, range: 4.6, arc: -0.15, active: .11, total: .46, cancel: .24, knock: 7, swing: 'sweep', hand: 'R', dir: 1 },
      { dmg: 24, range: 4.9, arc: -0.35, active: .13, total: .54, cancel: .28, knock: 11, swing: 'spin', hand: 'R', dir: -1, heavy: true },
    ],
    launch: { dmg: 18, range: 4.4, arc: 0.05, active: .12, total: .48, cancel: .26, enemyVel: 12.5, playerVel: 10, swing: 'thrust', hand: 'R' },
    signature: {
      id: 'hook', label: 'GANCHO', cooldown: 1.6, total: .22, active: .05, cancel: .1,
      swing: 'thrust', hand: 'R',
      range: 34, speed: 34, keepSpeed: 15, minTime: .08, maxTime: .75, stopAt: 2.2,
    },
  },

  // --------------------------------------------------------------- ECHO ----
  // Enjambre de golpes. Alcance ridículo a cambio de cadencia y de no tocar el
  // suelo: dos dashes, dos saltos y la gravedad aérea más baja de los tres.
  echo: {
    id: 'echo',
    name: 'ECHO',
    tagline: 'enjambre de golpes',
    blurb: 'Rápido y corto. Dos dashes, dos saltos y overdrive que los recarga.',
    color: COLORS.cyan,
    trail: COLORS.cyan,
    model: {
      height: 1.62, build: 0.94,
      shell: 0x3c5266, accent: 0x1a2733, glow: COLORS.cyan,
      visor: 'v', pauldron: 0.06, coat: 0, back: 'thruster', ankleGlow: true,
    },
    weapon: { kind: 'gauntlet', color: COLORS.cyan, hand: 'both' },

    move: { height: 1.62, radius: 0.36, runSpeed: 9.4, accel: 78, airAccel: 32, airJumps: 2 },
    slide: { height: 0.82, friction: 1.45 },
    wallrun: { maxTime: 2.2, maxSpeed: 12 },
    dash: { charges: 2, speed: 26, time: .13, keepSpeed: 17 },
    aircombo: { gravityScale: 0.10, time: 1.4, lift: 1.9 },

    combo: [
      { dmg: 5, range: 2.2, arc: 0.32, active: .05, total: .19, cancel: .09, knock: 2.5, swing: 'jab', hand: 'R', dir: 1 },
      { dmg: 5, range: 2.2, arc: 0.32, active: .05, total: .19, cancel: .09, knock: 2.5, swing: 'jab', hand: 'L', dir: -1 },
      { dmg: 6, range: 2.3, arc: 0.32, active: .05, total: .20, cancel: .10, knock: 3, swing: 'jab', hand: 'R', dir: 1 },
      { dmg: 6, range: 2.3, arc: 0.32, active: .05, total: .20, cancel: .10, knock: 3, swing: 'jab', hand: 'L', dir: -1 },
      { dmg: 14, range: 2.5, arc: 0.25, active: .07, total: .30, cancel: .15, knock: 9, swing: 'uppercut', hand: 'R', dir: 1, heavy: true },
    ],
    launch: { dmg: 12, range: 2.4, arc: 0.25, active: .06, total: .34, cancel: .17, enemyVel: 12, playerVel: 11.5, swing: 'uppercut', hand: 'L' },
    signature: {
      id: 'overdrive', label: 'OVERDRIVE', cooldown: 6, total: .30, active: .05, cancel: .12,
      swing: 'spin', hand: 'R',
      duration: 1.6, rate: 0.72,   // rate = multiplicador de los tiempos del combo
    },
  },
};

export const KIT_ORDER = ['volt', 'wire', 'echo'];
