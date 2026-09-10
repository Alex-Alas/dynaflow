// Efectos "prácticos": máximo impacto por línea de código.
// Sprites aditivos pooleados (chispas/estelas/impactos), números de daño en DOM,
// hitstop global, screenshake y speed lines por CSS.
import * as THREE from 'three';
import { FX } from './config.js';

const overlay = document.getElementById('overlay');
const speedlines = document.getElementById('speedlines');

export const shakeState = { amount: 0 };
export let timeScale = 1;
let stop = 0;

// ---------- hitstop ----------
export function hitstop(t) { stop = Math.max(stop, t); }
export function tick(realDt) {
  stop -= realDt;
  timeScale = stop > 0 ? 0 : 1;
  shakeState.amount *= Math.exp(-FX.shakeDecay * realDt);
}
export function shake(a) { shakeState.amount = Math.min(0.6, shakeState.amount + a); }

// ---------- pool de sprites aditivos ----------
let scene = null;
const sparks = [];
let tex = null;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function init(s) {
  scene = s;
  tex = glowTexture();
  for (let i = 0; i < 220; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sp.visible = false;
    sp.userData = { life: 0, max: 1, size: 1, vel: new THREE.Vector3() };
    scene.add(sp);
    sparks.push(sp);
  }
}

/** Una chispa/estela. Sirve para trails de arma, dash e impactos: un solo sistema, tres usos. */
export function spark(pos, color, size = 0.6, life = 0.28, vel = null) {
  const sp = sparks.find(s => !s.visible);
  if (!sp) return;
  sp.visible = true;
  sp.position.copy(pos);
  sp.material.color.setHex(color);
  sp.material.opacity = 1;
  sp.scale.setScalar(size);
  const u = sp.userData;
  u.life = u.max = life;
  u.size = size;
  if (vel) u.vel.copy(vel); else u.vel.set(0, 0, 0);
}

export function burst(pos, color, n = 10, power = 6) {
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5)
      .normalize().multiplyScalar(power * (0.4 + Math.random()));
    spark(pos, color, 0.35 + Math.random() * 0.5, 0.25 + Math.random() * 0.25, v);
  }
}

// ---------- anillos expansivos (AoE, aterrizajes) ----------
const rings = [];
export function initRings(s) {
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.userData = { life: 0, max: 1, to: 1 };
    s.add(m);
    rings.push(m);
  }
}
export function ring(pos, color, to = 5, life = 0.4) {
  const r = rings.find(x => !x.visible);
  if (!r) return;
  r.visible = true;
  r.position.copy(pos);
  r.material.color.setHex(color);
  r.userData.life = r.userData.max = life;
  r.userData.to = to;
}

// ---------- cable del gancho ----------
// Una sola línea reutilizada. Se refresca mientras el gancho tira y se apaga
// sola: quien la dibuja no tiene que acordarse de ocultarla.
let beamLine = null;
let beamLife = 0;

export function initBeam(s) {
  beamLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }),
  );
  beamLine.visible = false;
  beamLine.frustumCulled = false;
  s.add(beamLine);
}

export function beam(a, b, color) {
  if (!beamLine) return;
  const p = beamLine.geometry.attributes.position;
  p.setXYZ(0, a.x, a.y, a.z);
  p.setXYZ(1, b.x, b.y, b.z);
  p.needsUpdate = true;
  beamLine.material.color.setHex(color);
  beamLine.visible = true;
  beamLife = 0.06;
}

export function update(dt) {
  if (beamLine && beamLine.visible) {
    beamLife -= dt;
    if (beamLife <= 0) beamLine.visible = false;
  }
  for (const s of sparks) {
    if (!s.visible) continue;
    const u = s.userData;
    u.life -= dt;
    if (u.life <= 0) { s.visible = false; continue; }
    const k = u.life / u.max;
    s.material.opacity = k;
    s.scale.setScalar(u.size * (0.35 + 0.65 * k));
    if (u.vel.lengthSq()) {
      s.position.addScaledVector(u.vel, dt);
      u.vel.multiplyScalar(1 - 4 * dt);
    }
  }
  for (const r of rings) {
    if (!r.visible) continue;
    const u = r.userData;
    u.life -= dt;
    if (u.life <= 0) { r.visible = false; continue; }
    const k = 1 - u.life / u.max;
    r.scale.setScalar(0.4 + u.to * k);
    r.material.opacity = 1 - k;
  }
}

// ---------- proyección mundo → pantalla ----------
const p = new THREE.Vector3();
export function project(v, cam) {
  p.copy(v).project(cam);
  return {
    x: (p.x * 0.5 + 0.5) * innerWidth,
    y: (-p.y * 0.5 + 0.5) * innerHeight,
    front: p.z < 1,
  };
}

// ---------- números de daño ----------
export function damageNumber(worldPos, amount, cam, color = '#fff') {
  const s = project(worldPos, cam);
  if (!s.front) return;
  const el = document.createElement('div');
  el.className = 'dmg';
  el.textContent = Math.round(amount);
  el.style.cssText =
    `left:${s.x + (Math.random() - .5) * 40}px;top:${s.y}px;color:${color};` +
    `font-size:${16 + Math.min(amount, 30)}px`;
  overlay.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 2000);   // por si la pestaña está oculta y la animación nunca corre
}

// ---------- speed lines ----------
export function speed(v) {
  const k = (v - FX.speedlinesFrom) / (FX.speedlinesTo - FX.speedlinesFrom);
  speedlines.style.opacity = Math.max(0, Math.min(1, k)).toFixed(2);
}
