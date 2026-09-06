// Estado de input por frame. `held` = tecla abajo, `pressed` = flanco de este frame.
import { PLAYER } from './config.js';

const down = new Set();
const edge = new Set();
export const mouse = { dx: 0, dy: 0 };
export let locked = false;

export function init(canvas, onLock) {
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (!down.has(e.code)) edge.add(e.code);
    down.add(e.code);
    if (locked) e.preventDefault();
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => down.clear());

  addEventListener('mousedown', e => {
    const c = 'Mouse' + e.button;
    if (!down.has(c)) edge.add(c);
    down.add(c);
  });
  addEventListener('mouseup', e => down.delete('Mouse' + e.button));
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (!locked) return;
    mouse.dx += e.movementX * PLAYER.sensitivity;
    mouse.dy += e.movementY * PLAYER.sensitivity;
  });

  canvas.addEventListener('mousedown', () => { if (!locked) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLock?.(locked);
  });
}

export const held = c => down.has(c);
export const pressed = c => edge.has(c);
export function endFrame() { edge.clear(); mouse.dx = 0; mouse.dy = 0; }

// Usado por test/smoke.mjs para manejar input sin depender del pointer lock del navegador.
export function set(code, on) {
  if (!on) return void down.delete(code);
  if (!down.has(code)) edge.add(code);
  down.add(code);
}
