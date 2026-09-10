// Prueba de humo: bootea el juego en Chromium, congela el loop y ejecuta pasos
// deterministas de 1/60s verificando que las mecánicas responden.
// Correr: node test/smoke.mjs
//
// El servidor estático va en node y no en `python3 -m http.server`: el juego se
// sirve en plano, así que montarlo aquí quita la única dependencia externa que
// tenía la prueba y la hace correr igual en Windows que en Linux.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize, extname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;
const fails = [];
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${msg}${extra ? '   ' + extra : ''}`);
  if (!cond) fails.push(msg);
};

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const rel = normalize(path === '/' ? 'index.html' : path).replace(/^[\\/]+/, '');
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    // Leer ANTES de mandar la cabecera: si `readFile` falla con el 200 ya enviado,
    // el 404 del catch revienta el proceso con ERR_HTTP_HEADERS_SENT.
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await page.evaluate(() => { window.__game.paused = true; });

  // helper: mantiene teclas y avanza N frames de 1/60s
  const run = (frames, keys = []) => page.evaluate(({ frames, keys }) => {
    const g = window.__game;
    for (const k of keys) g.input.set(k, true);
    for (let i = 0; i < frames; i++) g.step(1 / 60);
    for (const k of keys) g.input.set(k, false);
  }, { frames, keys });

  const state = () => page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.player.state, speed: g.player.speed, y: g.player.pos.y, acTime: g.player.acTime,
      dashes: g.player.dashes, overdrive: g.player.overdrive, hp: g.enemies[0].health,
      evy: g.enemies[0].vel.y, kit: g.stats.active.id,
      px: g.player.pos.x, pz: g.player.pos.z, bolts: g.projectiles.live(),
      playerHp: g.player.health,
    };
  });

  // Avanza frames sin tocar teclas.
  const idle = (frames) => run(frames);

  /**
   * Espera a que el swing actual TERMINE de verdad. Hace falta porque el hitstop
   * congela el reloj de juego: durante ~8 frames reales el `dt` del juego es
   * ~0, así que contar frames fijos no dice nada sobre si el golpe ya resolvió.
   */
  const settle = () => page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 90 && g.combat.t > 0; i++) g.step(1 / 60);
    for (let i = 0; i < 4; i++) g.step(1 / 60);
  });

  const useKit = (id) => page.evaluate((id) => window.__game.setKit(id), id);

  /** Coloca al jugador (y opcionalmente al enemigo `which`) en un estado conocido. */
  const place = (o) => page.evaluate((o) => {
    const g = window.__game, p = g.player;
    p.pos.set(...o.pos); p.vel.set(...o.vel); p.yaw = o.yaw ?? 0; p.pitch = 0;
    p.state = o.state; p.hh = g.stats.MOVE.height / 2;
    p.wallCool = 0; p.acTime = 0; p.hookTime = 0; p.overdrive = 0;
    p.dashes = g.stats.DASH.charges; p.airJumps = g.stats.MOVE.airJumps;
    p.health = g.stats.MOVE.maxHealth; p.iframe = 0;
    g.combat.t = 0; g.combat.chain = 0; g.combat.sigCd = 0;
    g.projectiles.clear();
    // Aparta a todos los enemigos: así cada caso mide solo al que le interesa.
    for (const e of g.enemies) { e.pos.set(0, 3, -200); e.vel.set(0, 0, 0); e.charge = 0; e.reload = 99; }
    if (o.enemy) {
      const e = o.which
        ? g.enemies.find(x => x.arch.id === o.which)
        : g.enemies[0];
      e.dead = false; e.health = e.arch.health; e.stun = 0; e.suspend = 0;
      e.mesh.visible = true; e.mesh.scale.setScalar(1);
      e.pos.set(...o.enemy); e.vel.set(0, 0, 0);
      if (o.reload !== undefined) e.reload = o.reload;
      g.__probe = e;
    }
  }, o);

  const probe = () => page.evaluate(() => {
    const e = window.__game.__probe;
    return { hp: e.health, vy: e.vel.y, y: e.pos.y, z: e.pos.z, charge: e.charge, id: e.arch.id };
  });

  console.log('\nchrono punk — smoke test\n');
  console.log('--- VOLT (baseline: números idénticos al prototipo original) ---');

  // 1. correr en suelo acelera hasta el tope
  await place({ pos: [0, 1.2, 26], vel: [0, 0, 0], state: 'grounded' });
  await run(60, ['KeyW']);
  let s = await state();
  ok(s.speed > 7, 'corre y acelera en suelo', `speed=${s.speed.toFixed(1)}`);

  // 2. slide conserva la inercia
  await run(20, ['KeyW', 'ShiftLeft']);
  s = await state();
  ok(s.state === 'sliding', 'entra en slide', `state=${s.state}`);
  ok(s.speed > 7, 'el slide conserva velocidad', `speed=${s.speed.toFixed(1)}`);

  // 3. wall run en el pasillo en U + wall jump
  await place({ pos: [-23.2, 3, -10], vel: [0, 0, -14], state: 'airborne' });
  await run(12, ['KeyW']);
  s = await state();
  ok(s.state === 'wallrun', 'se adhiere al muro (wall run)', `state=${s.state}`);
  const yBefore = s.y;
  await run(20, ['KeyW']);
  s = await state();
  ok(s.y > yBefore - 0.9, 'la gravedad está anulada durante el wall run',
    `dy=${(s.y - yBefore).toFixed(2)}`);
  await run(1, ['KeyW', 'Space']);
  await run(6, ['KeyW']);
  s = await state();
  ok(s.state === 'airborne' && s.speed > 8, 'wall jump con impulso perpendicular',
    `state=${s.state} speed=${s.speed.toFixed(1)}`);

  // 4. air dash
  await place({ pos: [0, 6, 26], vel: [0, 0, 0], state: 'airborne' });
  await run(1, ['KeyW', 'KeyE']);
  await run(4, ['KeyW']);
  s = await state();
  ok(s.speed > 18 && s.dashes === 0, 'el air dash aplica impulso y consume su carga',
    `speed=${s.speed.toFixed(1)} dashes=${s.dashes}`);

  // 5. launcher: eleva al enemigo y mete al jugador en combate aéreo
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [0, 1.2, 10], which: 'grunt' });
  await run(1, ['Mouse2']);
  await settle();
  let e = await probe();
  s = await state();
  ok(e.hp < 60, 'el launcher inflige daño', `hp=${e.hp}`);
  ok(e.vy > 5, 'el launcher eleva al enemigo', `evy=${e.vy.toFixed(1)}`);
  ok(s.state === 'aircombo', 'el jugador entra en AirCombo', `state=${s.state}`);

  // 6. gravity override: el jugador casi no cae durante el combo aéreo
  const yAir = (await state()).y;
  await idle(30);
  s = await state();
  ok(s.y > yAir - 0.5, 'gravity override mantiene al jugador en el aire',
    `dy=${(s.y - yAir).toFixed(2)}`);

  // 7. golpe aéreo: refresca el estado y sigue dañando
  const hpBefore = (await probe()).hp;
  await page.evaluate(() => {
    const g = window.__game, e = g.__probe;
    e.pos.copy(g.player.pos).add(new g.THREE.Vector3(0, 0.3, -2));
    e.vel.set(0, 0, 0);
  });
  await run(1, ['Mouse0']);
  await settle();
  e = await probe();
  s = await state();
  ok(e.hp < hpBefore, 'el combo aéreo encadena daño', `hp=${e.hp}`);
  ok(s.acTime > 0.5, 'cada impacto aéreo refresca el gravity override',
    `acTime=${s.acTime.toFixed(2)}`);

  // 8. habilidad firma de VOLT: AoE 360°
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [2, 1.2, 12], which: 'grunt' });
  await run(1, ['KeyQ']);
  await settle();
  e = await probe();
  ok(e.hp < 60, 'el AoE golpea a los lados', `hp=${e.hp}`);

  console.log('\n--- arquetipos de enemigo ---');

  // 9. TANK: el launcher no lo levanta, pero sí le hace daño
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [0, 1.2, 9.4], which: 'tank' });
  await idle(2);
  e = await probe();
  // Regresión de física: un cuerpo apoyado EXACTAMENTE a ras contaba como
  // solapamiento y la pasada horizontal lo expulsaba al borde del suelo de 96 m.
  ok(Math.abs(e.y - 1.2) < 0.5 && Math.abs(e.z - 9.4) < 0.5,
    'el Tank apoyado a ras no sale disparado', `y=${e.y.toFixed(2)} z=${e.z.toFixed(2)}`);
  await run(1, ['Mouse2']);
  await settle();
  e = await probe();
  ok(e.id === 'tank', 'el probe es el Tank', `id=${e.id}`);
  ok(e.hp < 180, 'el launcher daña al Tank', `hp=${e.hp}`);
  ok(e.vy < 4, 'el Tank NO se levanta con el launcher', `evy=${e.vy.toFixed(1)}`);

  // 10. RANGED: carga el disparo con línea de tiro y lo suelta
  await place({
    pos: [0, 1.2, 30], vel: [0, 0, 0], state: 'grounded',
    enemy: [0, 1.2, 18], which: 'ranged', reload: 0,
  });
  await idle(20);
  e = await probe();
  ok(e.charge > 0, 'el Ranged carga (telegrafiado visible antes del disparo)',
    `charge=${e.charge.toFixed(2)}`);
  await idle(60);
  s = await state();
  ok(s.bolts > 0 || s.playerHp < 100, 'el Ranged dispara un proyectil',
    `bolts=${s.bolts} hp=${s.playerHp}`);

  console.log('\n--- WIRE ---');

  // 11. el gancho lanza al jugador hacia el ancla
  await useKit('wire');
  s = await state();
  ok(s.kit === 'wire', 'cambio de kit en caliente', `kit=${s.kit}`);
  await place({ pos: [0, 4, 24], vel: [0, 0, 0], state: 'airborne', yaw: 0, enemy: [0, 4, 10], which: 'grunt' });
  const zBefore = (await state()).pz;
  await run(1, ['KeyQ']);
  await idle(14);
  s = await state();
  ok(s.pz < zBefore - 3, 'el gancho arrastra al jugador hacia el ancla',
    `dz=${(s.pz - zBefore).toFixed(1)}`);
  ok(s.speed > 10, 'el gancho conserva velocidad al soltar', `speed=${s.speed.toFixed(1)}`);

  // 12. el alcance largo de WIRE conecta donde VOLT no llegaría
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [0, 1.2, 8.1], which: 'grunt' });
  await run(1, ['Mouse0']);
  await settle();
  e = await probe();
  ok(e.hp < 60, 'el combo de WIRE alcanza a 3.9m (VOLT solo llega a 3.0m)', `hp=${e.hp}`);

  console.log('\n--- ECHO ---');

  // 13. overdrive: se activa y recarga dashes al golpear
  await useKit('echo');
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [0, 1.2, 10.5], which: 'grunt' });
  await run(1, ['KeyQ']);
  await settle();
  s = await state();
  ok(s.overdrive > 0, 'el overdrive se activa', `t=${s.overdrive.toFixed(2)}`);
  await page.evaluate(() => { window.__game.player.dashes = 0; });
  await run(1, ['Mouse0']);
  await settle();
  s = await state();
  e = await probe();
  ok(e.hp < 60, 'ECHO conecta el jab', `hp=${e.hp}`);
  ok(s.dashes > 0, 'golpear en overdrive recarga los dashes', `dashes=${s.dashes}`);

  // 14. ECHO tiene dos saltos aéreos
  await place({ pos: [0, 8, 26], vel: [0, 0, 0], state: 'airborne' });
  await run(1, ['Space']); await idle(3);
  await run(1, ['Space']); await idle(3);
  s = await state();
  ok(s.state === 'airborne', 'ECHO encadena doble salto aéreo sin tocar suelo', `state=${s.state}`);

  console.log('\n--- render ---');

  // 15. sin errores + captura visual (la pantalla de inicio tapa el juego sin pointer lock)
  await useKit('volt');
  await place({ pos: [-4, 1.2, 14], vel: [0, 0, -9], state: 'grounded', enemy: [-4, 1.2, 10], which: 'grunt' });
  await run(20, ['KeyW']);
  await run(1, ['KeyW', 'Mouse2']);
  await run(10, ['KeyW']);
  await page.evaluate(() => {
    document.getElementById('start').classList.add('hidden');
    window.__game.paused = false;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(ROOT, 'test/screenshot.png') });
  ok(errors.length === 0, 'sin errores de consola', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
}

console.log(fails.length ? `\n${fails.length} fallo(s)\n` : '\ntodo verde\n');
process.exit(fails.length ? 1 : 0);
