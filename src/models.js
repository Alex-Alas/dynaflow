// Constructor procedural de personajes. Todo sale de primitivas: sin assets, sin
// build step, sin dependencias nuevas.
//
// Dos ideas sostienen el archivo:
//   1. Las proporciones del spec son FRACCIONES de la altura, así que el mismo
//      código produce un Swarm de 0.9m y un Tank de 2.4m sin tocar un número.
//   2. El rig son grupos anidados con nombre (hips → chest → armR → elbow → hand),
//      así que rotar una articulación arrastra a sus hijos. Sin skinning, sin
//      huesos y sin loader: es three.js puro y `anim.js` solo escribe rotaciones.
//
// La silueta es el cimiento: lo que separa a un arquetipo de otro es la
// proporción (alto / ancho / postura), nunca el detalle. A 10 metros el detalle
// ya no existe, pero la proporción se sigue leyendo.
import * as THREE from 'three';

// --- primitivas unitarias: UNA geometría para todas las cajas del juego ---
// Escalar la malla en vez de generar una geometría por tamaño es lo que mantiene
// el coste plano aunque el reparto crezca.
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 10, 7),
};

const shellCache = new Map();

/** Material opaco de carcasa. Compartido entre personajes: no se muta nunca. */
function shell(color) {
  let m = shellCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); shellCache.set(color, m); }
  return m;
}

/**
 * Material emissive. NO se cachea: es la capa de estado (flash de impacto,
 * telegrafiado, overdrive) y cada personaje necesita el suyo o parpadearían en
 * grupo. Color base negro + emissive = brilla plano y alimenta el bloom.
 */
// Las intensidades de reposo se mantienen BAJAS a propósito: el bloom tiene que
// conservar margen para que el flash de impacto (x9) y el telegrafiado del
// Ranged destaquen. Si el cuerpo ya está quemado, el aviso no se lee.
function glowMat(color, intensity = 2.2) {
  return new THREE.MeshLambertMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
}

function piece(kind, mat, w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT[kind], mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

function group(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

// ---------------------------------------------------------------- bípedo ----

const BIPED_DEFAULTS = {
  height: 1.8,
  build: 1,          // multiplicador de anchura: 1 esbelto · 1.9 tanque
  stoop: 0,          // inclinación del torso hacia delante, en radianes
  shell: 0x2b2b3d,
  accent: 0x15151f,
  glow: 0x22e9ff,
  visor: 'bar',      // 'bar' | 'v' | 'eye'
  pauldron: 0,       // tamaño de hombreras, en unidades de mundo (0 = ninguna)
  coat: 0,           // largo del faldón, en fracciones de altura (0 = ninguno)
  back: null,        // null | 'coil' | 'thruster' | 'plate'
  ankleGlow: false,
};

/**
 * Bípedo articulado. Sirve para los tres kits del jugador, el Grunt y el Tank:
 * la diferencia entre un espadachín esbelto y un tanque de 2.4 m son dos números
 * del spec (`build` y `stoop`), no dos modelos distintos.
 *
 * Origen del modelo = PIES en y=0. El caller lo baja media altura para que
 * encaje con `player.pos`, que es el centro de la cápsula de colisión.
 */
export function buildBiped(spec = {}) {
  const s = { ...BIPED_DEFAULTS, ...spec };
  const H = s.height;
  const B = s.build;
  const glow = [];
  const mkGlow = (c, i) => { const m = glowMat(c, i); glow.push(m); return m; };

  const sh = shell(s.shell);
  const ac = shell(s.accent);
  const root = group();

  // --- cadera ---
  const hips = group(0, 0.53 * H, 0);
  hips.add(piece('box', ac, 0.18 * H * B, 0.10 * H, 0.13 * H * B, 0, 0.02 * H, 0));
  root.add(hips);

  // --- piernas: muslo → rodilla → espinilla → tobillo → pie ---
  const leg = (side) => {
    const hip = group(side * 0.075 * H * B, 0, 0);
    hip.add(piece('box', sh, 0.085 * H * B, 0.25 * H, 0.095 * H * B, 0, -0.125 * H, 0));
    const knee = group(0, -0.25 * H, 0);
    knee.add(piece('box', sh, 0.075 * H * B, 0.24 * H, 0.085 * H * B, 0, -0.12 * H, 0));
    const ankle = group(0, -0.24 * H, 0);
    ankle.add(piece('box', ac, 0.085 * H * B, 0.045 * H, 0.14 * H, 0, -0.02 * H, -0.025 * H));
    if (s.ankleGlow) {
      ankle.add(piece('box', mkGlow(s.glow, 1.5), 0.05 * H, 0.03 * H, 0.05 * H, 0, 0.03 * H, 0.05 * H));
    }
    knee.add(ankle);
    hip.add(knee);
    hips.add(hip);
    return { hip, knee, ankle };
  };
  // +X local es la DERECHA del jugador (root.rotation.y = yaw, y el frente es -Z).
  const legR = leg(1);
  const legL = leg(-1);

  // --- torso ---
  const chest = group(0, 0.02 * H, 0);
  chest.rotation.x = s.stoop;
  chest.add(piece('box', sh, 0.22 * H * B, 0.29 * H, 0.135 * H * B, 0, 0.145 * H, 0));
  // Franja pectoral: el punto de lectura de la facción a media distancia.
  chest.add(piece('box', mkGlow(s.glow, 0.9), 0.05 * H, 0.11 * H, 0.02 * H,
    0, 0.17 * H, -0.07 * H * B));
  hips.add(chest);

  // --- brazos: hombro → codo → antebrazo → mano ---
  const arm = (side) => {
    const shoulder = group(side * 0.135 * H * B, 0.265 * H, 0);
    if (s.pauldron > 0) {
      shoulder.add(piece('box', ac, s.pauldron * 2.1, s.pauldron * 1.3, s.pauldron * 1.9,
        side * s.pauldron * 0.35, 0.01 * H, 0));
    }
    shoulder.add(piece('box', sh, 0.065 * H * B, 0.20 * H, 0.065 * H * B, 0, -0.10 * H, 0));
    const elbow = group(0, -0.20 * H, 0);
    elbow.add(piece('box', sh, 0.058 * H * B, 0.18 * H, 0.058 * H * B, 0, -0.09 * H, 0));
    const hand = group(0, -0.19 * H, 0);
    hand.add(piece('box', ac, 0.07 * H, 0.06 * H, 0.07 * H));
    elbow.add(hand);
    shoulder.add(elbow);
    chest.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const armR = arm(1);
  const armL = arm(-1);

  // --- cabeza ---
  const head = group(0, 0.33 * H, 0);
  head.add(piece('box', sh, 0.13 * H, 0.14 * H, 0.145 * H, 0, 0.07 * H, 0));
  const vz = -0.078 * H;
  if (s.visor === 'v') {
    for (const side of [1, -1]) {
      const v = piece('box', mkGlow(s.glow, 1.9), 0.075 * H, 0.022 * H, 0.02 * H,
        side * 0.032 * H, 0.068 * H, vz);
      v.rotation.z = side * 0.42;
      head.add(v);
    }
  } else if (s.visor === 'eye') {
    head.add(piece('sphere', mkGlow(s.glow, 1.9), 0.06 * H, 0.06 * H, 0.045 * H, 0, 0.07 * H, vz));
  } else {
    head.add(piece('box', mkGlow(s.glow, 1.9), 0.115 * H, 0.028 * H, 0.02 * H, 0, 0.072 * H, vz));
  }
  chest.add(head);

  // --- faldón / capa: piezas colgando de la cadera, animables desde anim.js ---
  // Va MÁS ESTRECHO que el torso y claramente por detrás. Un faldón tan ancho
  // como el pecho se fusiona con él y el personaje se lee como un bloque: se
  // pierden los brazos, las piernas parecen cortas y la silueta deja de decir
  // nada. Como cola estrecha, en cambio, subraya la dirección del movimiento.
  let coat = null;
  if (s.coat > 0) {
    coat = group(0, 0.03 * H, 0);
    const L = s.coat * H;
    coat.add(piece('box', ac, 0.14 * H * B, L, 0.02 * H, 0, -L / 2, 0.105 * H * B));
    for (const side of [1, -1]) {
      const f = piece('box', ac, 0.02 * H, L * 0.8, 0.09 * H * B,
        side * 0.085 * H * B, -L * 0.4, 0.05 * H * B);
      f.rotation.z = side * 0.1;
      coat.add(f);
    }
    hips.add(coat);
  }

  // --- mochila dorsal: el rasgo que separa las siluetas de un vistazo ---
  if (s.back === 'coil') {
    const c = piece('cyl', ac, 0.20 * H, 0.09 * H, 0.20 * H, 0, 0.20 * H, 0.10 * H * B);
    c.rotation.x = Math.PI / 2;
    chest.add(c);
    const r = piece('cyl', mkGlow(s.glow, 1.2), 0.14 * H, 0.10 * H, 0.14 * H, 0, 0.20 * H, 0.105 * H * B);
    r.rotation.x = Math.PI / 2;
    chest.add(r);
  } else if (s.back === 'thruster') {
    for (const side of [1, -1]) {
      chest.add(piece('box', ac, 0.07 * H, 0.15 * H, 0.09 * H,
        side * 0.09 * H, 0.20 * H, 0.09 * H * B));
      chest.add(piece('box', mkGlow(s.glow, 1.6), 0.045 * H, 0.03 * H, 0.02 * H,
        side * 0.09 * H, 0.135 * H, 0.135 * H * B));
    }
  } else if (s.back === 'plate') {
    chest.add(piece('box', ac, 0.30 * H * B, 0.26 * H, 0.05 * H, 0, 0.16 * H, -0.10 * H * B));
    chest.add(piece('box', mkGlow(s.glow, 1.1), 0.20 * H * B, 0.025 * H, 0.02 * H,
      0, 0.16 * H, -0.13 * H * B));
  }

  return {
    root, glow,
    rig: {
      kind: 'biped', height: H,
      hips, chest, head, coat,
      legL, legR, armL, armR,
      handL: armL.hand, handR: armR.hand,
    },
  };
}

// ------------------------------------------------------------- cuadrúpedo ---

/**
 * Cuerpo bajo y ancho de cuatro patas. Se lee por estar PEGADO AL SUELO: a
 * distancia no distingues el detalle, pero sí que algo va rápido y por abajo.
 */
export function buildQuad(spec = {}) {
  const s = { height: 0.9, shell: 0x3a201c, accent: 0x1b1012, glow: 0xff8a1e, ...spec };
  const H = s.height;
  const glow = [];
  const mkGlow = (c, i) => { const m = glowMat(c, i); glow.push(m); return m; };
  const sh = shell(s.shell);
  const ac = shell(s.accent);

  const root = group();
  const hips = group(0, 0.56 * H, 0);
  hips.add(piece('box', sh, 1.15 * H, 0.34 * H, 1.5 * H));
  // Morro en cuña, apuntando a -Z, que es el frente de todo el juego.
  const snout = piece('cone', ac, 0.7 * H, 0.75 * H, 0.55 * H, 0, -0.02 * H, -1.0 * H);
  snout.rotation.x = -Math.PI / 2;
  hips.add(snout);
  hips.add(piece('box', mkGlow(s.glow, 2.0), 0.62 * H, 0.07 * H, 0.03 * H, 0, 0.06 * H, -0.78 * H));
  hips.add(piece('box', ac, 0.75 * H, 0.22 * H, 0.5 * H, 0, 0.24 * H, 0.42 * H));

  const legs = [];
  for (const [sx, sz] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
    const hip = group(sx * 0.5 * H, 0, sz * 0.5 * H);
    const upper = piece('box', ac, 0.13 * H, 0.34 * H, 0.13 * H, sx * 0.1 * H, -0.16 * H, 0);
    upper.rotation.z = -sx * 0.5;
    hip.add(upper);
    const knee = group(sx * 0.2 * H, -0.30 * H, 0);
    knee.add(piece('box', ac, 0.1 * H, 0.32 * H, 0.1 * H, 0, -0.16 * H, 0));
    hip.add(knee);
    hips.add(hip);
    // Fases desplazadas = trote cruzado en vez de cuatro patas al unísono.
    legs.push({ hip, knee, phase: (sx > 0 ? 0 : Math.PI) + (sz > 0 ? Math.PI / 2 : 0) });
  }
  root.add(hips);

  return { root, glow, rig: { kind: 'quad', height: H, hips, legs } };
}

// ----------------------------------------------------------------- trípode --

/**
 * Torre delgada de tres patas con un ojo único arriba. Silueta vertical y
 * estrecha: es exactamente lo contrario del Swarm, y por eso se distinguen al
 * instante aunque compartan paleta. El ojo ES el telegrafiado.
 */
export function buildTripod(spec = {}) {
  const s = { height: 2.1, shell: 0x2a2438, accent: 0x14121d, glow: 0xffd42e, ...spec };
  const H = s.height;
  const glow = [];
  const sh = shell(s.shell);
  const ac = shell(s.accent);

  const root = group();
  const hub = group(0, 0.52 * H, 0);
  hub.add(piece('cyl', ac, 0.16 * H, 0.1 * H, 0.16 * H));

  const legs = [];
  for (let i = 0; i < 3; i++) {
    const hip = group(0, 0, 0);
    hip.rotation.y = (i / 3) * Math.PI * 2 + Math.PI;
    const l = piece('box', ac, 0.035 * H, 0.56 * H, 0.035 * H, 0, -0.26 * H, 0.12 * H);
    l.rotation.x = -0.36;
    hip.add(l);
    hip.add(piece('box', ac, 0.05 * H, 0.03 * H, 0.11 * H, 0, -0.51 * H, 0.31 * H));
    hub.add(hip);
    legs.push(hip);
  }

  // columna + cabeza
  hub.add(piece('cyl', sh, 0.075 * H, 0.30 * H, 0.075 * H, 0, 0.15 * H, 0));
  const head = group(0, 0.32 * H, 0);
  head.add(piece('box', sh, 0.19 * H, 0.17 * H, 0.19 * H));
  const eyeMat = glowMat(s.glow, 1.6);
  glow.push(eyeMat);
  const eye = piece('sphere', eyeMat, 0.11 * H, 0.11 * H, 0.08 * H, 0, 0, -0.09 * H);
  head.add(eye);
  hub.add(head);
  root.add(hub);

  return { root, glow, rig: { kind: 'tripod', height: H, hub, head, eye, legs } };
}

// ------------------------------------------------------------------ armas ---

/**
 * Las armas se montan en `rig.handR` / `rig.handL` y crecen hacia -Y, que es el
 * antebrazo PROLONGADO: con el brazo en reposo la hoja apunta al suelo, y al
 * girar el hombro hacia delante la punta encabeza el barrido. Crecer hacia +Y
 * apuntaría al techo y atravesaría el cuerpo.
 */
export function buildWeapon(kind, color, accent = 0x15151f) {
  const g = group();
  const ac = shell(accent);
  const glow = [];
  const mkGlow = (c, i) => { const m = glowMat(c, i); glow.push(m); return m; };
  // Nodo vacío en la punta: `combat.js` lee su posición de mundo para la estela,
  // en vez de estimarla desde la mano y equivocarse con cada arma nueva.
  const tip = new THREE.Object3D();

  if (kind === 'katana') {
    g.add(piece('box', ac, 0.05, 0.30, 0.05, 0, 0.10, 0));            // empuñadura
    g.add(piece('box', ac, 0.19, 0.03, 0.07, 0, -0.07, 0));           // guarda
    g.add(piece('box', mkGlow(color, 1.5), 0.035, 1.02, 0.085, 0, -0.60, 0));
    g.add(piece('box', mkGlow(color, 2.2), 0.012, 0.24, 0.03, 0, -1.19, 0));
    tip.position.y = -1.30;
  } else if (kind === 'scythe') {
    // Mango corto + cadena + hoja curva: la cadena es lo que vende el alcance.
    g.add(piece('box', ac, 0.06, 0.28, 0.06, 0, 0.08, 0));
    for (let i = 0; i < 6; i++) {
      g.add(piece('box', ac, 0.045, 0.1, 0.045, 0, -0.14 - i * 0.16, 0));
    }
    const blade = group(0, -1.12, 0);
    for (const [len, y, rot] of [[0.5, -0.09, 0.5], [0.46, -0.4, 0.75], [0.33, -0.67, 1.05]]) {
      const b = piece('box', mkGlow(color, 1.5), 0.04, len, 0.11, 0, y, 0);
      b.rotation.z = rot;
      blade.add(b);
    }
    g.add(blade);
    tip.position.set(0.3, -1.85, 0);
  } else if (kind === 'gauntlet') {
    g.add(piece('box', ac, 0.15, 0.28, 0.16, 0, 0.04, 0));
    g.add(piece('box', mkGlow(color, 1.7), 0.17, 0.05, 0.16, 0, -0.12, 0));   // nudillos
    g.add(piece('box', mkGlow(color, 1.3), 0.04, 0.15, 0.04, 0.085, 0.03, 0));
    tip.position.set(0, -0.2, 0);
  }
  g.add(tip);
  return { root: g, glow, tip };
}

/** Proyectil del Ranged: esfera emissive con estela cónica hacia atrás. */
export function buildBolt(color) {
  const g = group();
  g.add(piece('sphere', glowMat(color, 3.4), 0.3, 0.3, 0.3));
  const t = piece('cone', glowMat(color, 1.6), 0.22, 0.8, 0.22, 0, 0, 0.42);
  t.rotation.x = -Math.PI / 2;
  g.add(t);
  return g;
}
