import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { PLAYER } from './config.js';
import * as input from './input.js';
import { build, world } from './world.js';
import * as playerMod from './player.js';
import { player } from './player.js';
import * as enemyMod from './enemies.js';
import { enemies } from './enemies.js';
import * as combatMod from './combat.js';
import { combat } from './combat.js';
import * as targeting from './targeting.js';
import { lock } from './targeting.js';
import * as camera from './camera.js';
import * as fx from './fx.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06060a);
scene.fog = new THREE.Fog(0x0a0612, 30, 110);

const cam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8a6ab0, 0x181026, 2.1));
const key = new THREE.DirectionalLight(0xff6ad5, 1.35);
key.position.set(-1, 2, 1);
scene.add(key);
const rim = new THREE.DirectionalLight(0x22e9ff, 0.7);
rim.position.set(1, 0.5, -1);
scene.add(rim);

build(scene);
fx.init(scene);
fx.initRings(scene);
const root = playerMod.init(scene, world.meshes);
combatMod.init(root);
enemyMod.spawn(scene);
targeting.init(scene);
camera.init(cam, world.meshes);
player.onCancel = combatMod.cancel;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.22));
composer.addPass(new OutputPass());

const startEl = document.getElementById('start');
const hudEl = document.getElementById('hud');
const hpEl = document.getElementById('hp');
const cdDash = document.getElementById('cd-dash');
const cdJump = document.getElementById('cd-jump');
const cdAoe = document.getElementById('cd-aoe');

input.init(renderer.domElement, locked => startEl.classList.toggle('hidden', locked));
startEl.addEventListener('mousedown', () => renderer.domElement.requestPointerLock());

addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

function step(realDt) {
  fx.tick(realDt);
  // Durante el hitstop el tiempo de juego se congela, pero seguimos ejecutando el update
  // con un dt ínfimo para no perder los inputs presionados en esos ~4 frames.
  const dt = fx.timeScale > 0 ? realDt : 1e-5;

  targeting.update(dt, cam);
  playerMod.update(dt, world.colliders, lock.target);
  combatMod.update(dt, cam);
  enemyMod.update(dt, world.colliders, cam);
  camera.update(realDt, cam);
  fx.update(realDt);
  fx.speed(player.speed);
  hud();
  input.endFrame();
}

function hud() {
  hudEl.innerHTML =
    `estado  <b>${player.state}</b>\n` +
    `vel     <b>${player.speed.toFixed(1)}</b> m/s\n` +
    `y       ${player.pos.y.toFixed(1)}\n` +
    `combo   ${combat.kind ? combat.kind + ' #' + (combat.index + 1) : '—'}\n` +
    `lock    ${lock.target ? 'ON' : '—'}`;
  hpEl.style.width = (player.health / PLAYER.maxHealth * 100) + '%';
  cdDash.classList.toggle('on', player.dashes > 0);
  cdJump.classList.toggle('on', player.airJumps > 0);
  cdAoe.classList.toggle('on', combat.aoeCd <= 0);
}


// Superficie mínima para test/smoke.mjs (y para tunear desde la consola).
const game = { paused: false, step, player, enemies, combat, lock, input, fx, world, cam, THREE };
window.__game = game;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game.paused && realDt > 0) step(realDt);
  composer.render();
}
requestAnimationFrame(frame);

