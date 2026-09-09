// Cámara en tercera persona: lerp de seguimiento, FOV dinámico por velocidad,
// screenshake y raycast anti-atravesar-muros.
import * as THREE from 'three';
import { CAMERA, PLAYER } from './config.js';
import { player } from './player.js';
import { shakeState } from './fx.js';

const desired = new THREE.Vector3();
const head = new THREE.Vector3();
const dir = new THREE.Vector3();
const ray = new THREE.Raycaster();
let meshes = [];

export function init(cam, worldMeshes) {
  meshes = worldMeshes;
  cam.fov = CAMERA.fovBase;
  cam.position.set(0, 5, 36);
  cam.updateProjectionMatrix();
}

export function update(dt, cam) {
  head.copy(player.pos).setY(player.pos.y + CAMERA.height - (PLAYER.height / 2 - player.hh));

  const cp = Math.cos(player.pitch);
  dir.set(Math.sin(player.yaw) * cp, -Math.sin(player.pitch), Math.cos(player.yaw) * cp).normalize();

  // No dejar que la cámara entre en la geometría: acortar la distancia si hay muro.
  let dist = CAMERA.distance;
  ray.set(head, dir);
  ray.far = dist;
  const hit = ray.intersectObjects(meshes, false)[0];
  if (hit) dist = Math.max(1.2, hit.distance - 0.35);

  desired.copy(head).addScaledVector(dir, dist);
  cam.position.lerp(desired, 1 - Math.exp(-CAMERA.lerp * dt));
  cam.lookAt(head);

  const k = Math.min(1, player.speed / CAMERA.fovAtSpeed);
  const want = CAMERA.fovBase + (CAMERA.fovMax - CAMERA.fovBase) * k;
  cam.fov += (want - cam.fov) * Math.min(1, 5 * dt);
  cam.updateProjectionMatrix();

  const a = shakeState.amount;
  if (a > 0.001) {
    cam.position.x += (Math.random() - .5) * a;
    cam.position.y += (Math.random() - .5) * a;
    cam.position.z += (Math.random() - .5) * a;
  }
}
