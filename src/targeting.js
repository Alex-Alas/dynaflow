// Lock-on: elige el enemigo mejor alineado con la cámara dentro del cono y el rango.
import * as THREE from 'three';
import { LOCKON, KEYS } from './config.js';
import { pressed } from './input.js';
import { player, forward } from './player.js';
import { enemies } from './enemies.js';
import * as fx from './fx.js';

export const lock = { target: null };
const tmp = new THREE.Vector3();
let reticle = null;
let line = null;

export function init(scene) {
  reticle = document.createElement('div');
  reticle.id = 'reticle';
  document.getElementById('overlay').appendChild(reticle);
  line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0x22e9ff, transparent: true, opacity: 0.35 }),
  );
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
}

function pick() {
  const f = forward();
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    tmp.subVectors(e.pos, player.pos);
    const d = tmp.length();
    if (d > LOCKON.range) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, tmp.divideScalar(d).dot(f))));
    if (ang > LOCKON.cone) continue;
    const score = ang * 4 + d * 0.08;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

export function update(dt, cam) {
  if (pressed(KEYS.lock)) lock.target = lock.target ? null : pick();
  if (lock.target && (lock.target.dead || lock.target.pos.distanceTo(player.pos) > LOCKON.range * 1.4)) {
    lock.target = null;
  }

  if (!lock.target) {
    reticle.style.display = 'none';
    line.visible = false;
    return;
  }

  // La cámara (y con ella dash y wall jump) se reorienta hacia el objetivo.
  tmp.subVectors(lock.target.pos, player.pos);
  const want = Math.atan2(-tmp.x, -tmp.z);
  let diff = (want - player.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  player.yaw += diff * Math.min(1, LOCKON.lerp * dt);

  const s = fx.project(tmp.copy(lock.target.pos).setY(lock.target.pos.y + 0.3), cam);
  reticle.style.display = s.front ? '' : 'none';
  reticle.style.left = s.x + 'px';
  reticle.style.top = s.y + 'px';

  const p = line.geometry.attributes.position;
  p.setXYZ(0, player.pos.x, player.pos.y, player.pos.z);
  p.setXYZ(1, lock.target.pos.x, lock.target.pos.y, lock.target.pos.z);
  p.needsUpdate = true;
  line.visible = true;
}
