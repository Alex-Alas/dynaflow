// Todos los números de tuning del prototipo viven aquí.
// Cambiar un valor + recargar es el ciclo de trabajo principal: el juego existe para tunearse.

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

export const COMBO = {
  damage: [10, 10, 18],
  active: 0.07,     // frame donde la hitbox se activa
  total: 0.34,      // duración del swing
  chain: 0.55,      // ventana para encadenar el siguiente golpe
  cancel: 0.17,     // desde aquí se puede cancelar con dash / salto / wall run
  buffer: 0.13,     // ventana de buffer de input al final del swing
  range: 3.0,
  arc: 0.15,        // dot mínimo con el frente: golpe amplio, no un cono estrecho
  knockback: 5,
};

export const LAUNCH = { damage: 14, enemyVel: 12, playerVel: 10.5, total: 0.4 };

export const AIRCOMBO = {
  gravityScale: 0.14,  // gravity override
  time: 1.2,           // se refresca en cada impacto aéreo
  lift: 1.6,           // empuje hacia arriba por golpe, mantiene el combo flotando
};

export const AOE = { damage: 8, radius: 4.5, knockback: 13, cooldown: 3, total: 0.45 };

export const LOCKON = { range: 26, cone: Math.PI / 3, lerp: 9 };

export const ENEMY = {
  health: 60, speed: 4.2, radius: 0.5, height: 1.7,
  contactDamage: 6, iframes: 0.9, respawn: 5, count: 7,
};

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
};

export const COLORS = { neon: 0xff2df0, cyan: 0x22e9ff, violet: 0xb14bff, blood: 0xff2d6f };
