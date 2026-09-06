# dynaflow — prototipo de *Chrono Punk*

Prototipo jugable en el navegador de un juego de acción en 3ª persona centrado en
**movimiento de alta velocidad + combate fluido aéreo y en pared**.

El objetivo es validar la *mecánica y el flow*, no el arte: geometría primitiva,
efectos prácticos (hitstop, screenshake, bloom, damage numbers) y todos los
números de tuning en un solo archivo.

## Correrlo

```bash
python3 -m http.server 8000   # o: npx http-server -p 8000
# abrir http://localhost:8000
```

Sin build step, sin `npm install`: son ES modules nativos y three.js vive
vendorizado en `vendor/`. Desplegar = *Settings → Pages → Deploy from branch*.

## Controles

| | |
|---|---|
| `WASD` | mover |
| `Mouse` | cámara |
| `Espacio` | saltar · doble salto · wall jump |
| `Shift` | slide |
| `E` | air dash |
| `Click izq` | combo (x3) |
| `Click der` | launcher → combo aéreo |
| `Q` | giro 360° (AoE) |
| `F` | lock-on |

El *loop* que hay que sentir: **correr → slide → wall run → wall jump → air dash →
launcher → combo aéreo**, sin tocar el suelo.

## Estructura

```
index.html      importmap + capas de UI
style.css       damage numbers, speed lines, HUD
src/
  config.js     TODOS los números de tuning
  input.js      teclado y mouse
  world.js      arena de cajas (pasillos en U, pilares, tejados)
  physics.js    colisión kinemática contra Box3
  player.js     FSM: Grounded · Airborne · WallRun · Sliding · AirCombo
  combat.js     combos, cancelación, launcher, gravity override, AoE
  enemies.js    dummies con vida, chase, knockback y suspensión
  targeting.js  lock-on
  camera.js     follow, FOV dinámico, screenshake
  fx.js         chispas, anillos, damage numbers, hitstop, speed lines
  main.js       bootstrap + render loop
vendor/         three.js r180 (MIT) + passes de postprocesado
test/smoke.mjs  prueba de humo con Playwright
```

## Tunear

Todo está en `src/config.js`. Los valores que más cambian la sensación:

- `COMBO.cancel` — desde qué frame se puede cancelar el ataque. Es lo que hace que el juego fluya.
- `WALLRUN.gravity` y `WALLRUN.maxTime` — cuánto se puede escalar por muros.
- `DASH.keepSpeed` — cuánta inercia conserva el dash.
- `AIRCOMBO.gravityScale` — qué tan flotante es el combate aéreo.

El HUD de la esquina superior derecha muestra estado FSM y velocidad en vivo.

## Prueba

```bash
npm i          # solo instala Playwright: el juego no tiene dependencias
npm test
```

Levanta la página en Chromium, ejecuta un guion de input y verifica que wall run,
launcher, combo aéreo y daño responden, sin errores de consola.
