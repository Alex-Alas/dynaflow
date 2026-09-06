// Prueba de humo: bootea el juego en Chromium, congela el loop y ejecuta pasos
// deterministas de 1/60s verificando que las mecánicas del doc responden.
// Correr: node test/smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;
const fails = [];
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${msg}${extra ? '   ' + extra : ''}`);
  if (!cond) fails.push(msg);
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));

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
      dashes: g.player.dashes, hp: g.enemies[0].health, evy: g.enemies[0].vel.y,
    };
  });

  const place = (o) => page.evaluate((o) => {
    const g = window.__game, p = g.player;
    p.pos.set(...o.pos); p.vel.set(...o.vel); p.yaw = o.yaw ?? 0; p.pitch = 0;
    p.state = o.state; p.hh = 0.9; p.wallCool = 0; p.acTime = 0; p.dashes = 1; p.airJumps = 1;
    g.combat.t = 0; g.combat.chain = 0; g.combat.aoeCd = 0;
    if (o.enemy) {
      const e = g.enemies[0];
      e.dead = false; e.health = 60; e.stun = 0; e.suspend = 0;
      e.mesh.visible = true; e.mesh.scale.setScalar(1);
      e.pos.set(...o.enemy); e.vel.set(0, 0, 0);
    }
  }, o);

  console.log('\nchrono punk — smoke test\n');

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
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [0, 1.2, 10] });
  await run(1, ['Mouse2']);
  await run(10);
  s = await state();
  ok(s.hp < 60, 'el launcher inflige daño', `hp=${s.hp}`);
  ok(s.evy > 5, 'el launcher eleva al enemigo', `evy=${s.evy.toFixed(1)}`);
  ok(s.state === 'aircombo', 'el jugador entra en AirCombo', `state=${s.state}`);

  // 6. gravity override: el jugador casi no cae durante el combo aéreo
  const yAir = (await state()).y;
  await run(30);
  s = await state();
  ok(s.y > yAir - 0.5, 'gravity override mantiene al jugador en el aire',
    `dy=${(s.y - yAir).toFixed(2)}`);

  // 7. golpe aéreo: refresca el estado y sigue dañando
  const hpBefore = s.hp;
  await page.evaluate(() => {
    const g = window.__game, e = g.enemies[0];
    e.pos.copy(g.player.pos).add(new g.THREE.Vector3(0, 0.3, -2));
    e.vel.set(0, 0, 0);
  });
  await run(1, ['Mouse0']);
  await run(8);
  s = await state();
  ok(s.hp < hpBefore, 'el combo aéreo encadena daño', `hp=${s.hp}`);
  ok(s.acTime > 0.5, 'cada impacto aéreo refresca el gravity override',
    `acTime=${s.acTime.toFixed(2)}`);

  // 8. AoE 360°
  await place({ pos: [0, 1.2, 12], vel: [0, 0, 0], state: 'grounded', enemy: [2, 1.2, 12] });
  await run(1, ['KeyQ']);
  await run(10);
  s = await state();
  ok(s.hp < 60, 'el AoE golpea a los lados', `hp=${s.hp}`);

  // 9. sin errores + captura visual (la pantalla de inicio tapa el juego sin pointer lock)
  await place({ pos: [-4, 1.2, 14], vel: [0, 0, -9], state: 'grounded', enemy: [-4, 1.2, 10] });
  await run(20, ['KeyW']);
  await run(1, ['KeyW', 'Mouse2']);
  await run(7, ['KeyW']);
  await page.evaluate(() => {
    document.getElementById('start').classList.add('hidden');
    window.__game.paused = false;
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: resolve(ROOT, 'test/screenshot.png') });
  ok(errors.length === 0, 'sin errores de consola', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.kill();
}

console.log(fails.length ? `\n${fails.length} fallo(s)\n` : '\ntodo verde\n');
process.exit(fails.length ? 1 : 0);
