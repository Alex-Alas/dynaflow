// Números de tuning COMPARTIDOS por todos los kits.
// Lo que cambia de un kit a otro (combo, movilidad, habilidad firma) vive en
// `kits.js`; `stats.js` fusiona ambos y expone el resultado. Cambiar un valor
// aquí y recargar sigue siendo el ciclo de trabajo principal.

export const PLAYER = {
  height: 1.8,
  radius: 0.42,
  runSpeed: 9,      // tope del input; con fricción el equilibrio real es ~7.8 m/s. Dash e inercia lo superan.
  accel: 70,        // aceleración en suelo
  airAccel: 26,     // aceleración en el aire (control aéreo)
  friction: 9,      // fricción en suelo
  gravity: 30,
  jumpVel: 11,      // ~2m de altura
  airJumps: 1,      // doble salto
  maxHealth: 100,
  sensitivity: 0.0022,
};

export const SLIDE = {
  height: 0.9,      // hitbox a la mitad
  boost: 1.28,      // impulso de entrada
  friction: 1.6,    // fricción reducida = conservación de inercia
  minSpeed: 4,      // por debajo de esto, sale del slide
  steer: 0.22,      // fracción de aceleración disponible para corregir dirección
};

export const WALLRUN = {
  gravity: 4.5,     // gravedad drásticamente reducida durante la carrera
  minSpeed: 5,      // velocidad horizontal mínima para adherirse
  maxTime: 2.4,
  rayLen: 0.55,     // alcance del raycast lateral más allá del radio del jugador
  stick: 2.5,       // empuje constante hacia el muro
  maxSpeed: 11.5,
  jumpNormal: 9.5,  // impulso perpendicular al muro
  jumpUp: 9.5,      // componente vertical del wall jump
  cooldown: 0.18,   // evita re-adherirse al mismo muro instantáneamente
};

export const DASH = {
  speed: 24,
  time: 0.15,
  charges: 1,
  keepSpeed: 14,    // velocidad que conserva al terminar (mantiene el flow sin dispararse)
};

// Timings compartidos del sistema de combos. El daño, el alcance y la duración
// de cada golpe son por kit: viven en `kits.js`.
export const COMBO = {
  chain: 0.55,      // ventana para encadenar el siguiente golpe
  buffer: 0.13,     // ventana de buffer de input al final del swing
};

export const AIRCOMBO = {
  gravityScale: 0.14,  // gravity override
  time: 1.2,           // se refresca en cada impacto aéreo
  lift: 1.6,           // empuje hacia arriba por golpe, mantiene el combo flotando
};

export const LOCKON = { range: 26, cone: Math.PI / 3, lerp: 9 };

// --- enemigos -------------------------------------------------------------
// Arquetipos con siluetas separadas: la regla es que se distingan a 10+ metros
// por PROPORCIÓN, no por detalle. El detalle a esa distancia ya no existe.
export const ENEMY = {
  iframes: 0.9,     // iframes del JUGADOR tras recibir daño
  respawn: 5,
};

export const ARCHETYPES = {
  // Base. Persigue y hace daño por contacto: el sparring del prototipo.
  grunt: {
    id: 'grunt', body: 'biped',
    health: 60, speed: 4.2, radius: 0.5, height: 1.7,
    contactDamage: 6, knockResist: 1, score: 1,
    model: { height: 1.7, build: 1.05, shell: 0x5c2246, accent: 0x2a1022, glow: 0xff2d6f, visor: 'bar' },
  },
  // Rápido, bajo y frágil: muere de un golpe pero llega antes que nadie.
  // Se lee por estar PEGADO AL SUELO, no por su color.
  swarm: {
    id: 'swarm', body: 'quad',
    health: 25, speed: 7.5, radius: 0.42, height: 0.9,
    contactDamage: 4, knockResist: 1.6, score: 1,
    model: { height: 0.9, shell: 0x6b3524, accent: 0x2c1712, glow: 0xff8a1e },
  },
  // Ancho y lento. Resiste el knockback y el launcher NO lo levanta: obliga a
  // cambiar de táctica en vez de repetir la del Grunt.
  tank: {
    id: 'tank', body: 'biped',
    health: 180, speed: 2.2, radius: 0.95, height: 2.4,
    contactDamage: 12, knockResist: 0.22, heavy: true, score: 3,
    model: {
      height: 2.4, build: 1.85, stoop: 0.22,
      shell: 0x633a68, accent: 0x2e1a36, glow: 0xb14bff,
      visor: 'eye', pauldron: 0.3, back: 'plate',
    },
  },
  // Mantiene distancia y dispara telegrafiado. Es lo que hace que los pilares de
  // la arena pasen de decorado a cobertura.
  ranged: {
    id: 'ranged', body: 'tripod',
    health: 40, speed: 2.0, radius: 0.45, height: 2.1,
    contactDamage: 0, knockResist: 1.3, score: 2,
    keepAt: 13, fireRange: 20, telegraph: 0.8, reload: 2.4,
    bolt: { speed: 22, damage: 9, life: 2.6, radius: 0.28 },
    model: { height: 2.1, shell: 0x4c445f, accent: 0x211d2d, glow: 0xffd42e },
  },
};

// Composición de la oleada. Mezclar velocidades, alcances y masas es lo que
// genera situaciones distintas; siete copias del mismo enemigo, no.
export const WAVE = [
  'grunt', 'grunt', 'grunt',
  'swarm', 'swarm', 'swarm', 'swarm',
  'tank', 'tank',
  'ranged', 'ranged', 'ranged',
];

export const CAMERA = {
  distance: 6.2, height: 1.55, lerp: 12,
  fovBase: 72, fovMax: 95, fovAtSpeed: 24,
  pitchMin: -1.1, pitchMax: 1.05,
};

export const FX = {
  hitstop: 0.065, hitstopHeavy: 0.13,
  shakeDecay: 9,
  speedlinesFrom: 11, speedlinesTo: 26,
};

export const KEYS = {
  fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', slide: 'ShiftLeft', dash: 'KeyE',
  aoe: 'KeyQ', lock: 'KeyF',
  attack: 'Mouse0', launch: 'Mouse2',
  kit1: 'Digit1', kit2: 'Digit2', kit3: 'Digit3',
};

export const COLORS = {
  neon: 0xff2df0, cyan: 0x22e9ff, violet: 0xb14bff, blood: 0xff2d6f,
  // Telegrafiado: naranja/amarillo brillante, nunca rojo oscuro. El rojo oscuro
  // se pierde contra un fondo violeta y es casi invisible con deficiencia de
  // visión de color; el salto de BRILLO es lo que hace legible el aviso.
  warn: 0xff9b1e, danger: 0xffe94a,
};
