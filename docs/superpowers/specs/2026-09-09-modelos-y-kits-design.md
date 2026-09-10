# Modelos procedurales + kits de personaje — Chrono Punk

Fecha: 2026-09-09 · Estado: aprobado

## Problema

El prototipo valida el *flow* (FSM de movimiento + combate cancelable) pero el
cuerpo que lo ejecuta es una cápsula rígida que no se anima nunca, y los siete
enemigos son la misma cápsula en otro color. No hay silueta, no hay lectura y no
hay identidad: el juego se siente peor de lo que realmente juega.

Además el moveset está cableado en `combat.js`, así que no existe forma de
probar dos sensaciones de combate distintas sin editar el código.

## Investigación (referentes)

- **Neon White vs Ghostrunner** — Neon White ordena su diseño hacia mantener al
  jugador a velocidad máxima; Ghostrunner exige precisión y reintentos. Dynaflow
  ya está del lado de Neon White. La legibilidad pesa más que el detalle.
- **DMC5 / Bayonetta / Hi-Fi Rush** — los "kits" no son personajes distintos:
  son el mismo núcleo con distinto énfasis de verbos (los estilos de Dante).
- **Overwatch / Apex** — fantasía jugable e identidad visual deben llegar juntas
  y apuntar en la misma dirección. La alta movilidad exige una herramienta de
  reposicionamiento.
- **The Level Design Book** — arquetipos Grunt / Swarm / Tank / Sniper / Leader.
  Silueta única legible a 10+ m. Diversidad, jerarquía y emergencia: la misma
  táctica no debe funcionar contra todos. Los enemigos a distancia son lo que
  hace que el level design empiece a importar.
- **Telegrafiado** — wind-ups codificados por color, pero el rojo oscuro es casi
  invisible (y peor con deficiencia de visión de color): naranja/amarillo
  brillante, apoyado en salto de brillo y no solo de tono.
- **Low-poly estilizado** — la silueta legible es el cimiento; personalidad por
  encima de detalle; emissive como capa de estado.

## Restricción de partida

Todo procedural desde primitivas. Cero assets externos, cero build step, cero
dependencias nuevas: three sigue vendorizado y el juego sigue siendo ES modules
nativos servidos en plano.

## Arquitectura

### `src/stats.js` — stats vivos del kit activo

`config.js` conserva los valores base. `stats.js` los clona en objetos vivos
(`MOVE`, `SLIDE`, `WALLRUN`, `DASH`, `AIRCOMBO`, `LAUNCH`, `COMBO`) y
`applyKit(kit)` los reescribe *in place*. Los sitios de lectura no cambian de
forma —`MOVE.runSpeed` en vez de `PLAYER.runSpeed`— así que el diff es mínimo y
el ciclo de trabajo del repo (tunear un número y recargar, o tunear desde la
consola vía `window.__game`) se conserva.

Alternativas descartadas: pasar el kit como parámetro por toda la cadena de
llamadas (obliga a tocar cada sitio de lectura), y una clase de jugador por kit
(tira a la basura la FSM ya tuneada).

### `src/models.js` — constructor procedural de mallas

Tres builders que comparten cache de geometrías y materiales:

- `buildBiped(spec)` — kits del jugador, Grunt y Tank
- `buildQuad(spec)` — Swarm
- `buildTripod(spec)` — Ranged

Devuelven `{ root, rig, glow }`. El `rig` son grupos anidados con nombre
(`hips → chest → armR → foreR → hand`), de modo que rotar una articulación
arrastra a sus hijos sin necesidad de skinning. `glow` es la lista de materiales
emissive, que es por donde pasan el flash de impacto y el telegrafiado.

Las proporciones del spec son fracciones de la altura, así que el mismo spec
sirve para un Swarm de 0.9 m y un Tank de 2.4 m.

### `src/anim.js` — animación procedural

Poses objetivo por estado, alcanzadas por `lerp` para que las transiciones de la
FSM no salten: `run` (ciclo de piernas y brazos por seno, amplitud proporcional
a la velocidad), `slide`, `wallrun`, `airborne`, `aircombo`. Más `swingPose()`,
que `combat.js` aplica encima de la pose base para los ataques.

### `src/kits.js` — los tres kits

| | VOLT | WIRE | ECHO |
|---|---|---|---|
| Fantasía | espadachín de flujo | control del espacio | enjambre de golpes |
| Arma | katana neón (magenta) | guadaña de cadena (violeta) | guanteletes (cian) |
| Combo | x3 · 10/10/18 · rango 3.0 | x2 · lento · rango 4.6 · arco casi total | x5 · 5/5/6/6/14 · rango 2.2 |
| Firma `Q` | giro 360° AoE | gancho: te lanza hacia enemigo o superficie | overdrive: recarga dash al golpear, +cadencia |
| Movilidad | base | suelo lento, wall run 3.2 s, sin doble salto | 2 dashes, 2 saltos, más flotante |
| Silueta | esbelto, gabardina corta | alto, hombros anchos, bobina dorsal | bajo, compacto, thrusters en tobillos |

El moveset pasa a ser datos: cada paso del combo es
`{ dmg, range, arc, active, total, cancel, knock, swing, hand, heavy }`.
`combat.js` se vuelve genérico y el sabor vive en `kits.js`.

**VOLT reproduce exactamente los números actuales**, de modo que el baseline
tuneado queda preservado y cualquier regresión de sensación es detectable.

### `src/enemies.js` — cuatro arquetipos

| | HP | Vel | Silueta | Rol |
|---|---|---|---|---|
| GRUNT | 60 | 4.2 | bípedo humanoide | base |
| SWARM | 25 | 7.5 | cuña baja de cuatro patas | presiona, muere de un golpe |
| TANK | 180 | 2.2 | bloque ancho con placa frontal | resiste knockback; el launcher no lo levanta |
| RANGED | 40 | 2.0 | trípode alto y estrecho, un ojo | mantiene distancia, dispara telegrafiado |

Telegrafiado en naranja/amarillo brillante con salto de brillo y escala del ojo.

### `src/projectiles.js`

Pool de proyectiles del RANGED: colisión contra los `Box3` del nivel y contra el
jugador, estela de chispas del pool existente de `fx.js`.

### Selector de kit

Tres tarjetas en la pantalla de inicio y hot-swap con `1`/`2`/`3` durante la
partida, para poder comparar sensaciones sin recargar.

## Flujo de datos

```
config.js (base)  ──►  stats.js (vivos)  ──►  player.js, combat.js
kits.js (datos)   ──┘         │
                              └──►  models.js  ──►  rig  ──►  anim.js
enemies.js ──► models.js, projectiles.js
```

## Riesgo y mitigación

El riesgo real es romper el flow ya tuneado. VOLT es numéricamente idéntico al
estado actual y el smoke test corre contra VOLT, así que una regresión aparece
como fallo de test, no como una sensación difusa.

## Pruebas

`test/smoke.mjs` se amplía: los casos actuales corren sobre VOLT (baseline sin
cambios), más casos nuevos para el gancho de WIRE, el overdrive de ECHO, la
resistencia a knockback del TANK y el disparo del RANGED.

---

## Adenda de implementación

Dos bugs *preexistentes* aparecieron al implementar esto. Ninguno era visible
antes porque hacía falta el reparto nuevo para dispararlos, y los dos están
corregidos:

**1. `physics.js` — expulsión por contacto a ras.** `Box3.intersectsBox` cuenta
el contacto exacto como intersección. La pasada horizontal corre antes que la
vertical, así que un cuerpo apoyado justo a ras del suelo (sin el hueco de 1 mm
que deja el SKIN al caer) se leía como solapado con el suelo de 96 m y salía
expulsado a su borde: 58 metros en un frame. El SKIN lo tapaba mientras todo el
mundo llegase al suelo cayendo; un Tank de 2.4 m que descansa exactamente en
`y = halfH` lo volvía a disparar. Ahora el test de solapamiento exige penetración
real mayor que el SKIN, que sigue siendo un orden de magnitud menor que la
penetración de un frame de caída, así que `grounded` no se resiente.

**2. `main.js` — raycasts contra matrices sin calcular.** El primer `step()` del
loop corre antes del primer `render()`, y es `render()` quien actualiza las
matrices de mundo. Durante ese frame todas las cajas del nivel están en la matriz
identidad, colapsadas sobre el origen, y los tres raycasts que consultan el nivel
—adherencia al muro, cámara y línea de tiro del Ranged— leían un mundo que no
existe. En juego era un frame y pasaba desapercibido; avanzando el loop a mano
desde el test o la consola, `render()` puede no llegar a correr nunca y el fallo
es permanente. Se resuelve con un `scene.updateMatrixWorld(true)` único tras
construir el nivel, que es estático.

### Ajustes de arte tras verlo en pantalla

- Las armas crecen hacia **-Y** desde la mano (antebrazo prolongado), no hacia
  +Y: apuntaban al techo y atravesaban el cuerpo. Y escalan con la altura del
  kit, porque la misma katana no puede medir igual en un cuerpo de 1.62 m y en
  uno de 1.95 m.
- El faldón va más estrecho que el torso y claramente por detrás. Tan ancho como
  el pecho se fusionaba con él: se perdían los brazos, las piernas parecían
  cortas y la silueta dejaba de decir nada.
- Las carcasas subieron de valor. En la paleta original la silueta colapsaba a
  negro contra el fondo oscuro y solo quedaban los emissive flotando.
- Las intensidades emissive de reposo BAJARON. Con el bloom ya saturado, el
  flash de impacto (x9) y el telegrafiado del Ranged perdían el salto de brillo
  del que depende su legibilidad — que es justo lo que la investigación señala
  como el canal fiable.

### Verificación

26 casos en verde sobre carga limpia: movimiento y combate de VOLT (baseline
idéntico al prototipo original), no-elevación y daño del Tank, telegrafiado y
disparo del Ranged, gancho de WIRE, overdrive y doble salto de ECHO, cambio de
kit en caliente y la regresión de física del contacto a ras.
