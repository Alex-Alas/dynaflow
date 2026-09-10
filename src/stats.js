// Stats VIVOS del kit activo.
//
// `config.js` sigue siendo la base y `kits.js` los overrides. Aquí se fusionan
// en objetos que se reescriben *in place*, así que los módulos que los leen
// (`player.js`, `combat.js`) mantienen la misma forma de acceso que antes
// —`MOVE.runSpeed` donde había `PLAYER.runSpeed`— y cambiar de kit no obliga a
// pasar nada por la cadena de llamadas.
//
// El efecto lateral bueno: `window.__game.stats.MOVE.runSpeed = 14` sigue
// funcionando desde la consola, que es el ciclo de trabajo del prototipo.
// El efecto lateral malo: son mutables y globales. Es un intercambio consciente
// y acotado a este archivo.
import * as base from './config.js';
import { KITS } from './kits.js';

export const MOVE = { ...base.PLAYER };
export const SLIDE = { ...base.SLIDE };
export const WALLRUN = { ...base.WALLRUN };
export const DASH = { ...base.DASH };
export const AIRCOMBO = { ...base.AIRCOMBO };
export const COMBO = { ...base.COMBO };

/** Kit activo. `combat.js` lee de aquí el moveset y la habilidad firma. */
export const active = { kit: KITS.volt, id: 'volt' };

// Se reescribe el contenido sin sustituir el objeto: las referencias importadas
// en otros módulos siguen apuntando al mismo sitio.
function reset(target, src, over) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, src, over || null);
}

export function applyKit(id) {
  const kit = KITS[id] || KITS.volt;
  reset(MOVE, base.PLAYER, kit.move);
  reset(SLIDE, base.SLIDE, kit.slide);
  reset(WALLRUN, base.WALLRUN, kit.wallrun);
  reset(DASH, base.DASH, kit.dash);
  reset(AIRCOMBO, base.AIRCOMBO, kit.aircombo);
  reset(COMBO, base.COMBO, null);
  active.kit = kit;
  active.id = kit.id;
  return kit;
}

applyKit('volt');
