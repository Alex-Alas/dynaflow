// Animación procedural: sin clips, sin huesos, sin loader. Cada estado de la FSM
// define una POSE OBJETIVO y el rig la persigue con lerp exponencial, así que las
// transiciones no saltan aunque la FSM cambie de estado en un solo frame.
//
// El ataque no reemplaza la pose: se SUMA encima (`applySwing`), de modo que el
// personaje sigue corriendo mientras golpea — que es justo lo que pide un juego
// cuyo diseño entero gira en torno a no dejar de moverse.
//
// Sutileza que importa: la pose base se guarda en `rig._pose`, SEPARADA de las
// rotaciones finales. Si lerpáramos desde la rotación ya escrita, el delta del
// ataque entraría en el estado del frame siguiente y el swing se acumularía en
// vez de reproducirse.
//
// Convenios de eje (fáciles de equivocar):
//   · el frente es -Z, y con root.rotation.y = yaw el +X local es la DERECHA
//   · shoulder.rotation.x POSITIVO lleva el brazo hacia DELANTE
//   · para abrir un brazo hacia fuera: rotation.z = -side * θ  (side: +1 dcha, -1 izq)
//   · hips.rotation.z POSITIVO inclina el torso hacia la IZQUIERDA

const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Curva de golpe. Es negativa durante el primer cuarto: esa es la anticipación,
 * y sale gratis de la misma curva que produce el impacto. Por eso `applySwing`
 * solo describe la pose FINAL — el wind-up es esa pose en negativo.
 */
export function strikeCurve(k) {
  return k < 0.25 ? -0.38 * (k / 0.25) : (k - 0.25) / 0.75;
}

// Pose objetivo, reutilizada entre frames: cero asignaciones en el loop.
const T = {
  hipY: 0, hipX: 0, hipZ: 0, hipYaw: 0,
  chestX: 0, chestY: 0, chestZ: 0,
  headX: 0,
  legRx: 0, legRk: 0, legLx: 0, legLk: 0,
  armRx: 0, armRz: 0, elbowR: 0,
  armLx: 0, armLz: 0, elbowL: 0,
  coatX: 0,
};

function rest() {
  T.hipY = 0; T.hipX = 0; T.hipZ = 0; T.hipYaw = 0;
  T.chestX = 0.05; T.chestY = 0; T.chestZ = 0;
  T.headX = 0;
  T.legRx = 0; T.legRk = 0; T.legLx = 0; T.legLk = 0;
  T.armRx = 0; T.armRz = -0.13; T.elbowR = 0.25;
  T.armLx = 0; T.armLz = 0.13; T.elbowL = 0.25;
  T.coatX = -0.06;
}

/** Ciclo de carrera: piernas y brazos en seno, amplitud proporcional a la velocidad. */
function runCycle(p, amp) {
  T.legRx = Math.sin(p) * 0.9 * amp;
  T.legLx = Math.sin(p + Math.PI) * 0.9 * amp;
  // La rodilla solo flexiona en la fase de recogida, nunca hacia atrás.
  T.legRk = Math.max(0, -Math.sin(p + 0.7)) * 1.25 * amp;
  T.legLk = Math.max(0, -Math.sin(p + 0.7 + Math.PI)) * 1.25 * amp;
  // Los brazos contrarrestan a las piernas: es lo que hace legible el paso.
  T.armRx = Math.sin(p + Math.PI) * 0.75 * amp;
  T.armLx = Math.sin(p) * 0.75 * amp;
  T.elbowR = T.elbowL = 0.3 + 0.45 * amp;
  T.armRz = -0.13 - 0.08 * amp;
  T.armLz = 0.13 + 0.08 * amp;
  T.hipY = Math.abs(Math.sin(p)) * 0.022 * amp;    // rebote vertical
  T.hipZ = Math.sin(p) * 0.05 * amp;
  T.chestX = 0.08 + 0.3 * amp;                     // se inclina con la velocidad
  T.coatX = -0.12 - 0.75 * amp;
}

/**
 * Escribe la pose del bípedo. `st` es la lectura del jugador o del enemigo:
 * { state, speed, vy, wallSide, dashing, maxSpeed }.
 */
export function animateBiped(rig, st, dt) {
  const amp = Math.min(1, (st.speed || 0) / (st.maxSpeed || 9));
  rig._phase = (rig._phase || 0) + (st.speed || 0) * dt * 2.3;
  const p = rig._phase;

  rest();

  if (st.dashing) {
    // Estirado en la dirección del dash: brazos atrás, piernas recogidas.
    T.chestX = 0.62; T.hipX = -0.2;
    T.armRx = -1.5; T.armLx = -1.5;
    T.armRz = -0.5; T.armLz = 0.5;
    T.elbowR = T.elbowL = 0.15;
    T.legRx = -0.5; T.legRk = 1.5;
    T.legLx = -0.15; T.legLk = 0.9;
    T.coatX = -1.5;
  } else if (st.state === 'sliding') {
    // Pierna delantera extendida, la otra recogida bajo el cuerpo, torso atrás.
    T.hipY = -0.16;
    T.chestX = -0.38; T.hipX = 0.25;
    T.legRx = -1.2; T.legRk = 0.25;
    T.legLx = 0.4; T.legLk = 1.8;
    T.armRx = -0.95; T.armRz = -0.75; T.elbowR = 0.5;
    T.armLx = -0.35; T.armLz = 0.95; T.elbowL = 0.3;
    T.headX = 0.3;
    T.coatX = -1.6;
  } else if (st.state === 'wallrun') {
    const side = st.wallSide || 1;                 // +1 = muro a la izquierda
    runCycle(p, Math.max(0.7, amp));
    T.hipZ = side * 0.52;                          // el cuerpo rueda hacia el muro
    T.chestZ = side * 0.18;
    T.chestX = 0.3;
    // El brazo del lado del muro se estira hacia él: vende la adherencia.
    if (side > 0) { T.armLx = -0.45; T.armLz = -1.25; T.elbowL = 0.15; }
    else { T.armRx = -0.45; T.armRz = 1.25; T.elbowR = 0.15; }
    T.coatX = -1.1;
  } else if (st.state === 'aircombo') {
    // Flotación de combate aéreo: piernas abiertas, guardia alta.
    T.chestX = 0.18; T.hipX = -0.1;
    T.legRx = -0.7; T.legRk = 0.95;
    T.legLx = 0.4; T.legLk = 0.55;
    T.armRx = 0.35; T.armRz = -0.6; T.elbowR = 0.9;
    T.armLx = 0.2; T.armLz = 0.75; T.elbowL = 1.1;
    T.coatX = -0.5;
  } else if (st.state === 'airborne') {
    const rising = (st.vy || 0) > 0;
    T.chestX = rising ? 0.3 : 0.12;
    T.legRx = rising ? -0.62 : -0.3; T.legRk = rising ? 1.15 : 0.6;
    T.legLx = rising ? -0.18 : 0.18; T.legLk = rising ? 0.7 : 0.3;
    T.armRx = -0.55; T.armRz = -0.62; T.elbowR = 0.5;
    T.armLx = -0.4; T.armLz = 0.62; T.elbowL = 0.4;
    T.coatX = rising ? -1.2 : -0.35;
  } else if (amp > 0.06) {
    runCycle(p, amp);
  } else {
    // Reposo: respiración lenta, lo justo para que no parezca un maniquí.
    const b = Math.sin(performance.now() * 0.0022) * 0.02;
    T.chestX = 0.05 + b; T.hipY = b * 0.4;
  }

  apply(rig, dt, st.dashing ? 22 : 14);
}

function apply(rig, dt, rate) {
  const k = 1 - Math.exp(-rate * dt);
  const H = rig.height;
  const P = rig._pose || (rig._pose = { ...T });
  for (const key in T) P[key] = lerp(P[key], T[key], k);

  rig.hips.position.y = 0.53 * H + P.hipY * H;
  rig.hips.rotation.set(P.hipX, P.hipYaw, P.hipZ);
  rig.chest.rotation.set(P.chestX, P.chestY, P.chestZ);
  rig.head.rotation.x = P.headX;

  rig.legR.hip.rotation.x = P.legRx;
  rig.legR.knee.rotation.x = P.legRk;
  rig.legL.hip.rotation.x = P.legLx;
  rig.legL.knee.rotation.x = P.legLk;

  rig.armR.shoulder.rotation.x = P.armRx;
  rig.armR.shoulder.rotation.z = P.armRz;
  rig.armR.elbow.rotation.x = P.elbowR;
  rig.armL.shoulder.rotation.x = P.armLx;
  rig.armL.shoulder.rotation.z = P.armLz;
  rig.armL.elbow.rotation.x = P.elbowL;

  if (rig.coat) rig.coat.rotation.x = P.coatX;
}

// -------------------------------------------------------------- ataques ----

/**
 * Pose de ataque SUMADA sobre la locomoción. `b` viene de `strikeCurve`, así que
 * es negativo durante la anticipación: el mismo dato produce el wind-up y el
 * golpe sin necesidad de describir dos poses.
 *
 * `side` es la mano que ataca (+1 derecha, -1 izquierda); `dir` alterna el lado
 * del barrido entre golpes para que la cadena no se vea repetida.
 */
export function applySwing(rig, kind, b, side = 1, dir = 1) {
  const arm = rig[side > 0 ? 'armR' : 'armL'];
  const off = rig[side > 0 ? 'armL' : 'armR'];

  if (kind === 'spin') {
    // Giro completo. La cadera gira sin tocar el yaw, así que la puntería no se mueve.
    rig.hips.rotation.y += Math.max(0, b) * Math.PI * 2;
    arm.shoulder.rotation.z += -side * 1.5 * b;
    arm.shoulder.rotation.x += 0.25 * b;
    off.shoulder.rotation.z += side * 1.4 * b;
    rig.chest.rotation.x += -0.15 * b;
  } else if (kind === 'sweep') {
    // Barrido horizontal amplio: lo que vende el alcance de la guadaña.
    rig.chest.rotation.y += -dir * 2.3 * b;
    arm.shoulder.rotation.z += -side * 1.5 * b;
    arm.shoulder.rotation.x += 0.55 * b;
    arm.elbow.rotation.x += -0.2 * b;
    rig.hips.rotation.y += -dir * 0.5 * b;
  } else if (kind === 'jab') {
    // Recto corto y seco: todo el peso está en la extensión del codo.
    arm.shoulder.rotation.x += 1.75 * b;
    arm.elbow.rotation.x += -1.05 * b;
    arm.shoulder.rotation.z += side * 0.28 * b;
    rig.chest.rotation.y += side * 0.5 * b;
    off.elbow.rotation.x += 1.1 * b;
  } else if (kind === 'cleave') {
    // Hachazo vertical a dos manos. Con b negativo el arma sube sola por detrás.
    arm.shoulder.rotation.x += 1.9 * b;
    arm.elbow.rotation.x += -0.7 * b;
    off.shoulder.rotation.x += 1.2 * b;
    rig.chest.rotation.x += 0.45 * b;
    rig.hips.rotation.x += 0.2 * b;
  } else if (kind === 'uppercut') {
    arm.shoulder.rotation.x += 2.5 * b;
    arm.elbow.rotation.x += -0.9 * b;
    rig.chest.rotation.x += -0.5 * b;
    rig.chest.rotation.y += side * 0.35 * b;
    rig.hips.position.y += 0.12 * rig.height * Math.max(0, b);
  } else if (kind === 'thrust') {
    // Launcher: ambos brazos suben y el cuerpo se abre hacia atrás.
    arm.shoulder.rotation.x += 2.7 * b;
    arm.elbow.rotation.x += -0.55 * b;
    off.shoulder.rotation.x += 1.5 * b;
    rig.chest.rotation.x += -0.62 * b;
    rig.hips.position.y += 0.1 * rig.height * Math.max(0, b);
  } else {
    // 'slash' — diagonal alternante, el golpe base del juego.
    arm.shoulder.rotation.x += 1.6 * b;
    arm.shoulder.rotation.z += side * 0.75 * b * dir;
    arm.elbow.rotation.x += -0.85 * b;
    rig.chest.rotation.y += -dir * 0.85 * b;
    rig.chest.rotation.x += -0.2 * b;
  }
}

// ------------------------------------------------------------- enemigos ----

/** Cuadrúpedo: trote cruzado y balanceo del cuerpo. */
export function animateQuad(rig, st, dt) {
  const H = rig.height;
  const amp = Math.min(1, (st.speed || 0) / 7.5);
  rig._phase = (rig._phase || 0) + (st.speed || 0) * dt * 1.6;
  const p = rig._phase;
  const k = 1 - Math.exp(-16 * dt);

  for (const l of rig.legs) {
    l.hip.rotation.x = lerp(l.hip.rotation.x, Math.sin(p + l.phase) * 0.65 * amp, k);
    l.knee.rotation.x = lerp(l.knee.rotation.x,
      Math.max(0, -Math.sin(p + l.phase + 0.6)) * 0.5 * amp, k);
  }
  rig.hips.position.y = lerp(rig.hips.position.y,
    0.56 * H + Math.abs(Math.sin(p * 2)) * 0.05 * H * amp, k);
  rig.hips.rotation.z = lerp(rig.hips.rotation.z, Math.sin(p) * 0.1 * amp, k);
  rig.hips.rotation.x = lerp(rig.hips.rotation.x, -0.1 * amp, k);
}

/**
 * Trípode: se agazapa y el ojo crece al cargar. `st.charge` va de 0 a 1 y ES el
 * telegrafiado — el jugador tiene que poder leerlo antes de que dispare, y por
 * eso cambia de TAMAÑO además de color: así se lee también sin distinguir tonos.
 */
export function animateTripod(rig, st, dt) {
  const H = rig.height;
  const k = 1 - Math.exp(-12 * dt);
  const c = st.charge || 0;
  const bob = Math.sin(performance.now() * 0.003) * 0.012 * H;

  rig.hub.position.y = lerp(rig.hub.position.y, 0.52 * H - c * 0.06 * H + bob, k);
  rig.head.rotation.x = lerp(rig.head.rotation.x, -0.12 + c * 0.2, k);
  for (const leg of rig.legs) leg.rotation.x = lerp(leg.rotation.x, c * 0.12, k);

  const s = (0.11 + c * 0.075) * H;
  rig.eye.scale.set(s, s, 0.08 * H + c * 0.05 * H);
}
