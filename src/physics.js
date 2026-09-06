// Colisión kinemática contra cajas alineadas a los ejes: se mueve un eje a la vez
// y se separa el solapamiento. Todo el nivel son Box3, así que no hace falta motor de física.
import * as THREE from 'three';

const box = new THREE.Box3();
const AXES = ['x', 'z', 'y'];   // horizontal primero: deslizar por muros antes de resolver el suelo

// Skin: al separar se deja 1mm de aire. Sin esto, un cuerpo apoyado "toca" el suelo
// (Box3.intersectsBox cuenta el contacto), y la pasada horizontal lo empujaría
// hasta el borde de esa caja — con un suelo de 96m eso es un teletransporte.
const SKIN = 0.001;

export function moveAndCollide(pos, vel, dt, colliders, radius, halfH) {
  const out = { grounded: false, ceiling: false, wallNormal: null };

  for (const a of AXES) {
    const d = vel[a] * dt;
    if (d === 0) continue;
    pos[a] += d;

    box.min.set(pos.x - radius, pos.y - halfH, pos.z - radius);
    box.max.set(pos.x + radius, pos.y + halfH, pos.z + radius);
    const half = a === 'y' ? halfH : radius;

    for (const c of colliders) {
      if (!c.intersectsBox(box)) continue;

      if (d > 0) pos[a] -= box.max[a] - c.min[a] + SKIN;
      else       pos[a] += c.max[a] - box.min[a] + SKIN;
      box.min[a] = pos[a] - half;
      box.max[a] = pos[a] + half;

      if (a === 'y') {
        if (d < 0) out.grounded = true; else out.ceiling = true;
      } else {
        // La normal apunta desde el muro hacia el jugador.
        out.wallNormal = new THREE.Vector3(
          a === 'x' ? -Math.sign(d) : 0, 0,
          a === 'z' ? -Math.sign(d) : 0,
        );
      }
      vel[a] = 0;
    }
  }
  return out;
}
