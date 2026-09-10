# dynaflow — prototipo de *Chrono Punk*

Prototipo jugable en el navegador de un juego de acción en 3ª persona centrado en
**movimiento de alta velocidad + combate fluido aéreo y en pared**, con **tres
kits de personaje** y **cuatro arquetipos de enemigo**.

Todo el arte es procedural: los personajes se ensamblan desde primitivas en
`models.js` y se animan por código en `anim.js`. Sin assets, sin build step, sin
dependencias.

## Correrlo

```bash
npx http-server -p 8000 -c-1 .
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
| `Click izq` | combo |
| `Click der` | launcher → combo aéreo |
| `Q` | habilidad firma del kit |
| `F` | lock-on |
| `1` `2` `3` | cambiar de kit en caliente |

El *loop* que hay que sentir: **correr → slide → wall run → wall jump → air dash →
launcher → combo aéreo**, sin tocar el suelo.

## Kits

No son personajes distintos: es el mismo núcleo de movimiento con distinto
énfasis de verbos, como los estilos de Dante en DMC. Se separan en los tres ejes
que importan — **alcance, cadencia y herramienta de reposicionamiento**.

| | **VOLT** | **WIRE** | **ECHO** |
|---|---|---|---|
| Fantasía | espadachín de flujo | control del espacio | enjambre de golpes |
| Arma | katana neón | guadaña de cadena | guanteletes gemelos |
| Combo | x3 · rango 3.0 | x2 lento · rango 4.6 · arco casi total | x5 · rango 2.2 |
| Firma `Q` | giro 360° AoE | **gancho**: te lanza hacia enemigo o superficie | **overdrive**: golpear recarga el dash |
| Movilidad | base | suelo lento, wall run 3.2 s, **sin doble salto** | 2 dashes, 2 saltos, más flotante |

**VOLT es el baseline**: sus números son idénticos a los del prototipo original,
así que cualquier regresión de sensación se detecta comparando contra él.

## Enemigos

Cada arquetipo debe distinguirse a 10+ metros por **proporción**, no por detalle,
y ninguna táctica debe funcionar igual contra todos.

| | HP | Vel | Silueta | Rol |
|---|---|---|---|---|
| **GRUNT** | 60 | 4.2 | bípedo humanoide | sparring |
| **SWARM** | 25 | 7.5 | cuadrúpedo bajo y ancho | castiga quedarse quieto |
| **TANK** | 180 | 2.2 | bloque ancho con placa | resiste knockback; el launcher **no** lo levanta |
| **RANGED** | 40 | 2.0 | trípode alto con un ojo | dispara telegrafiado; convierte los pilares en cobertura |

El telegrafiado va en **naranja/amarillo brillante con salto de brillo**, nunca
en rojo oscuro: el rojo oscuro se pierde contra el fondo violeta y es casi
invisible con deficiencia de visión de color.

## Estructura

```
index.html      importmap + capas de UI
style.css       damage numbers, speed lines, HUD, selector de kit
src/
  config.js     números COMPARTIDOS + arquetipos de enemigo + composición de oleada
  kits.js       los tres kits (datos puros: moveset, movilidad, modelo, firma)
  stats.js      fusiona config + kit en objetos vivos que el resto lee
  models.js     construcción procedural de mallas (bípedo, cuadrúpedo, trípode, armas)
  anim.js       animación procedural por estado + poses de ataque
  input.js      teclado y mouse
  world.js      arena de cajas (pasillos en U, pilares, tejados)
  physics.js    colisión kinemática contra Box3
  player.js     FSM: Grounded · Airborne · WallRun · Sliding · AirCombo · gancho
  combat.js     combos genéricos por datos, launcher, habilidades firma
  enemies.js    cuatro arquetipos: comportamiento, telegrafiado, muerte
  projectiles.js  pool de proyectiles del Ranged
  targeting.js  lock-on
  camera.js     follow, FOV dinámico, screenshake
  fx.js         chispas, anillos, damage numbers, hitstop, speed lines, cable del gancho
  main.js       bootstrap + render loop + selector de kit
vendor/         three.js r180 (MIT) + passes de postprocesado
test/smoke.mjs  prueba de humo con Playwright
docs/           especificación de diseño
```

## Tunear

Los números compartidos están en `src/config.js`; los que definen a cada kit, en
`src/kits.js`. `src/stats.js` los fusiona en objetos vivos, así que también se
pueden tocar desde la consola sin recargar:

```js
__game.stats.MOVE.runSpeed = 14
__game.stats.WALLRUN.maxTime = 5
__game.setKit('wire')
```

Los valores que más cambian la sensación:

- `combo[].cancel` — desde qué frame se puede cancelar el ataque. Es lo que hace que el juego fluya.
- `WALLRUN.gravity` y `WALLRUN.maxTime` — cuánto se puede escalar por muros.
- `DASH.keepSpeed` — cuánta inercia conserva el dash.
- `AIRCOMBO.gravityScale` — qué tan flotante es el combate aéreo.
- `signature.speed` / `stopAt` (WIRE) — cuánto tira el gancho y a qué distancia suelta.

El HUD de la esquina superior derecha muestra kit, estado FSM y velocidad en vivo.

## Prueba

```bash
npm i          # solo instala Playwright: el juego no tiene dependencias
npm test
```

Levanta la página en Chromium sobre un servidor estático propio (sin depender de
`python`), ejecuta un guion de input determinista y verifica movimiento, combate,
los tres kits y los cuatro arquetipos, sin errores de consola.
