import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { KEYS } from './config.js';
import { KITS, KIT_ORDER } from './kits.js';
import * as stats from './stats.js';
import { MOVE, active } from './stats.js';
import * as input from './input.js';
import { pressed } from './input.js';
import { build, world } from './world.js';
import * as playerMod from './player.js';
import { player } from './player.js';
import * as enemyMod from './enemies.js';
import { enemies } from './enemies.js';
import * as combatMod from './combat.js';
import { combat } from './combat.js';
import * as projectiles from './projectiles.js';
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
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8a6ab0, 0x181026, 2.1));
const key = new THREE.DirectionalLight(0xff6ad5, 1.35);
key.position.set(-1, 2, 1);
scene.add(key);
// Rim frío desde atrás: separa las siluetas del fondo, que es de lo que depende
// que se lean los arquetipos a distancia.
const rim = new THREE.DirectionalLight(0x22e9ff, 0.7);
rim.position.set(1, 0.5, -1);
scene.add(rim);

build(scene);
fx.init(scene);
fx.initRings(scene);
fx.initBeam(scene);
playerMod.bindKitApplier(stats.applyKit);
playerMod.init(scene, world.meshes);
combatMod.init();
enemyMod.spawn(scene);
targeting.init(scene);
camera.init(cam, world.meshes);
player.onCancel = combatMod.cancel;

// El primer `step()` corre ANTES del primer `render()`, y es `render()` quien
// actualiza las matrices de mundo. Sin esta línea, durante ese frame todas las
// cajas del nivel están en la matriz identidad —colapsadas sobre el origen— y
// los tres raycasts que consultan el nivel (adherencia al muro, cámara y línea
// de tiro del Ranged) leen un mundo que no existe. El nivel es estático, así que
// calcularlas una vez aquí basta: también deja correcto el loop avanzado a mano
// desde la consola o desde el test, donde `render()` puede no llegar a correr.
scene.updateMatrixWorld(true);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.22));
composer.addPass(new OutputPass());

const startEl = document.getElementById('start');
const hudEl = document.getElementById('hud');
const hpEl = document.getElementById('hp');
const cdDash = document.getElementById('cd-dash');
const cdJump = document.getElementById('cd-jump');
const cdSig = document.getElementById('cd-sig');
const kitsEl = document.getElementById('kits');

// --- selector de kit ---------------------------------------------------------
// Las tarjetas se generan desde `kits.js`: añadir un kit no toca el HTML.
const hex = n => '#' + n.toString(16).padStart(6, '0');

for (let i = 0; i < KIT_ORDER.length; i++) {
  const kit = KITS[KIT_ORDER[i]];
  const card = document.createElement('button');
  card.className = 'kit';
  card.dataset.kit = kit.id;
  card.style.setProperty('--c', hex(kit.color));
  card.innerHTML =
    `<b>${kit.name}</b><i>${kit.tagline}</i><p>${kit.blurb}</p><u>${i + 1}</u>`;
  card.addEventListener('mousedown', e => { e.stopPropagation(); choose(kit.id); lockPointer(); });
  kitsEl.appendChild(card);
}

function choose(id) {
  if (active.id === id) return;
  playerMod.setKit(id);
  // La oleada se reinicia: comparar sensaciones solo sirve si el punto de
  // partida es el mismo en los tres kits.
  enemyMod.resetAll();
  markKit();
}

function markKit() {
  for (const el of kitsEl.children) el.classList.toggle('on', el.dataset.kit === active.id);
  cdSig.textContent = active.kit.signature.label;
}
markKit();

const lockPointer = () => renderer.domElement.requestPointerLock();
input.init(renderer.domElement, locked => startEl.classList.toggle('hidden', locked));
startEl.addEventListener('mousedown', lockPointer);

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

  if (pressed(KEYS.kit1)) choose(KIT_ORDER[0]);
  else if (pressed(KEYS.kit2)) choose(KIT_ORDER[1]);
  else if (pressed(KEYS.kit3)) choose(KIT_ORDER[2]);

  targeting.update(dt, cam);
  playerMod.update(dt, world.colliders, lock.target, enemies);
  combatMod.update(dt, cam, lock.target);
  enemyMod.update(dt, world.colliders, cam);
  camera.update(realDt, cam);
  fx.update(realDt);
  fx.speed(player.speed);
  hud();
  input.endFrame();
}

function hud() {
  hudEl.innerHTML =
    `kit     <b>${active.kit.name}</b>\n` +
    `estado  <b>${player.state}</b>\n` +
    `vel     <b>${player.speed.toFixed(1)}</b> m/s\n` +
    `y       ${player.pos.y.toFixed(1)}\n` +
    `combo   ${combat.kind ? combat.kind + ' #' + (combat.index + 1) : '—'}\n` +
    `lock    ${lock.target ? 'ON' : '—'}`;
  hpEl.style.width = (player.health / MOVE.maxHealth * 100) + '%';
  cdDash.classList.toggle('on', player.dashes > 0);
  cdJump.classList.toggle('on', player.airJumps > 0);
  cdSig.classList.toggle('on', combat.sigCd <= 0);
  cdSig.classList.toggle('hot', player.overdrive > 0);
}


// Superficie mínima para test/smoke.mjs (y para tunear desde la consola).
const game = {
  paused: false, step, player, enemies, combat, lock, input, fx, world, cam, THREE,
  stats, kits: KITS, setKit: choose, projectiles,
};
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
