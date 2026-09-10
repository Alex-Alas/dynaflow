// Colisión kinemática contra cajas alineadas a los ejes: se mueve un eje a la vez
// y se separa el solapamiento. Todo el nivel son Box3, así que no hace falta motor de física.
import * as THREE from 'three';

const box = new THREE.Box3();
const AXES = ['x', 'z', 'y'];   // horizontal primero: deslizar por muros antes de resolver el suelo

// Skin: al separar se deja 1mm de aire. Sin esto, un cuerpo apoyado "toca" el suelo
// (Box3.intersectsBox cuenta el contacto), y la pasada horizontal lo empujaría
// hasta el borde de esa caja — con un suelo de 96m eso es un teletransporte.
const SKIN = 0.001;

/**
 * Solapamiento ESTRICTO: exige más de `e` de penetración real.
 *
 * `Box3.intersectsBox` cuenta el contacto a ras como intersección, y eso basta
 * para que un cuerpo apoyado exactamente sobre el suelo (bottom == suelo, sin el
 * hueco del SKIN) sea "expulsado" por la pasada horizontal hasta el borde de esa
 * caja. Con un suelo de 96 m eso es un teletransporte de decenas de metros en un
 * frame. El SKIN lo evitaba mientras todo el mundo llegase al suelo cayendo;
 * colocar un cuerpo a ras —un Tank de 2.4 m que descansa justo en y = halfH— lo
 * volvía a disparar.
 *
 * `e` es del orden del SKIN, así que la penetración de un frame de caída
 * (~8 mm ya a media velocidad) se sigue detectando y `grounded` no se resiente.
 */
function overlaps(a, b, e) {
  return a.max.x - e > b.min.x && a.min.x + e < b.max.x
      && a.max.y - e > b.min.y && a.min.y + e < b.max.y
      && a.max.z - e > b.min.z && a.min.z + e < b.max.z;
}

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
      if (!overlaps(c, box, SKIN)) continue;

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
