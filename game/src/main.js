// main.js — Solara Bay bootstrap: renderer, lights, day/night sun, input,
// camera rig, state machine (menu / playing / paused / busted / wasted),
// the game loop, and wiring for every system.
import * as THREE from 'three';
import { clamp, lerp } from './utils.js';
import { buildCity, WORLD } from './city.js';
import { createPlayer } from './player.js';
import { makeCar, driveCar, damageCar, nearestDrivableCar, CAR_TYPES } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { applyShot } from './shots.js';

window.addEventListener('error', (e) => {
  document.body.dataset.error = `${e.message} @ ${e.filename || ''}:${e.lineno || ''}`;
});

// --- Renderer / scene / camera -------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game-canvas').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 220, 700);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// --- Shared game context ---------------------------------------------------
const ctx = {
  scene, camera, renderer,
  time: 0, dayTime: 10 * 3600,
  state: 'menu', cash: 100, health: 100, wanted: 0,
  cars: [], input: { keys: new Set() },
  cam: { yaw: Math.PI, pitch: 0.3, dist: 11, lastDrag: -99 },
  damageCar,
};
ctx.playerPos = () => (ctx.player.onFoot ? ctx.player.pos : ctx.player.car.pos);

ctx.updateSun = () => {
  // Sun elevation: 0 at 06:00 and 18:00, 1 at noon; negative at night.
  const t = (ctx.dayTime - 6 * 3600) / (12 * 3600);
  const elev = Math.sin(t * Math.PI);
  const az = lerp(-0.6, 0.6, clamp((ctx.dayTime - 6 * 3600) / (12 * 3600), 0, 1));
  const d = 500;
  sun.position.set(Math.sin(az * Math.PI) * d * 0.7, Math.max(40, elev * d), Math.cos(az * Math.PI) * d * 0.5);
  const day = new THREE.Color(0x87ceeb);
  const dusk = new THREE.Color(0xff9a56);
  const night = new THREE.Color(0x0a1428);
  let sky;
  if (elev > 0.25) sky = day;
  else if (elev > -0.08) sky = dusk.clone().lerp(day, clamp((elev + 0.08) / 0.33, 0, 1));
  else sky = night;
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sun.intensity = clamp(elev * 1.6 + 0.45, 0.35, 1.7);
  hemi.intensity = clamp(elev * 0.9 + 0.4, 0.35, 0.85);
};

// --- Systems (built in dependency order) ----------------------------------
ctx.city = buildCity(scene);
ctx.fx = createEffects(ctx);
ctx.audio = createAudio();
ctx.player = createPlayer(ctx);
ctx.traffic = createTraffic(ctx);
ctx.police = createPolice(ctx);
ctx.missions = createMissions(ctx);
ctx.combat = createCombat(ctx);
ctx.hud = createHud(ctx);

ctx.saveGame = () => saveGame(ctx);

// Parked, stealable cars around the city.
const PARKED = [
  ['sedan', 44, 96, 0], ['coupe', -28, -64, Math.PI / 2], ['taxi', 116, 24, 0],
  ['pickup', -100, -28, Math.PI], ['sedan', 188, -104, -Math.PI / 2],
  ['van', -188, 188, Math.PI / 2], ['coupe', 100, 260, 0], ['sedan', 260, 44, Math.PI],
];
for (const [type, x, z, h] of PARKED) {
  const car = makeCar(ctx, type, x, z, h);
  ctx.cars.push(car);
}

// --- Menus / state ----------------------------------------------------------
const $ = (id) => document.getElementById(id);
const overlays = { menu: $('menu'), pause: $('pause'), end: $('end') };

ctx.hideMenu = () => { overlays.menu.style.display = 'none'; };

function showOnly(name) {
  for (const [k, el] of Object.entries(overlays)) el.style.display = k === name ? 'flex' : 'none';
}

ctx.die = (kind) => {
  if (ctx.state !== 'playing') return;
  ctx.state = kind;
  ctx.audio?.explosion();
  if (kind === 'busted') {
    ctx.cash = Math.max(0, ctx.cash - 200);
    $('end-title').textContent = 'BUSTED!';
    $('end-text').textContent = 'The Solara PD hauled you in. Bail cost you $200. Mara is not impressed.';
  } else {
    ctx.cash = Math.max(0, ctx.cash - 100);
    $('end-title').textContent = 'WASTED';
    $('end-text').textContent = 'You woke up in St. Solara Hospital, $100 lighter. The city is still out there.';
  }
  ctx.police.clearAll();
  ctx.police.setWanted(0);
  showOnly('end');
};

ctx.respawn = () => {
  const p = ctx.player;
  if (p.car) p.exitCar();
  p.setPosition(ctx.state === 'busted' ? -252 : -36, ctx.state === 'busted' ? 252 : -252, 0);
  ctx.health = 100;
  ctx.wanted = 0;
  ctx.state = 'playing';
  showOnly(null);
  ctx.hud.toast('Back on the streets.', 3);
};

ctx.startGame = (fromSave) => {
  ctx.audio.init();
  if (fromSave) {
    const s = loadGame();
    if (s) {
      ctx.cash = s.cash; ctx.health = s.health; ctx.wanted = s.wanted;
      ctx.dayTime = s.dayTime;
      ctx.player.setPosition(s.x, s.z, 0);
      if (s.missionActive && s.missionIndex < 5) ctx.missions.startMission(s.missionIndex);
      ctx.hud.toast('Save loaded — welcome back, Rook.', 4);
    }
  }
  ctx.state = 'playing';
  showOnly(null);
  ctx.updateSun();
};

// --- Input ------------------------------------------------------------------
const canvas = renderer.domElement;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  ctx.input.keys.add(e.code);
  if (ctx.state !== 'playing') return;
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'KeyF') ctx.combat.punch();
  if (e.code === 'KeyG') ctx.combat.shoot();
  if (e.code === 'KeyN' && !ctx.missions.active && !ctx.missions.done) ctx.missions.startMission(ctx.missions.index);
  if (e.code === 'KeyM') {
    const muted = ctx.audio.toggleMute();
    ctx.hud.toast(muted ? 'Sound off (M to unmute)' : 'Sound on', 2);
  }
  if (e.code === 'Escape') {
    ctx.state = 'paused';
    showOnly('pause');
  }
});
window.addEventListener('keyup', (e) => ctx.input.keys.delete(e.code));
window.addEventListener('blur', () => ctx.input.keys.clear());

let dragging = false, downX = 0, downY = 0, moved = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; downX = e.clientX; downY = e.clientY; moved = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  moved += Math.abs(dx) + Math.abs(dy);
  ctx.cam.yaw -= dx * 0.005;
  ctx.cam.pitch = clamp(ctx.cam.pitch + dy * 0.004, 0.06, 1.05);
  ctx.cam.lastDrag = ctx.time;
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
  if (moved < 6 && ctx.state === 'playing') ctx.combat.shoot();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  ctx.cam.dist = clamp(ctx.cam.dist + Math.sign(e.deltaY) * 1.2, 6, 17);
}, { passive: false });

function toggleCar() {
  const p = ctx.player;
  if (p.onFoot) {
    const car = nearestDrivableCar(ctx, p.pos.x, p.pos.z, 4.5);
    if (!car) { ctx.hud.toast('No car close by — walk up to one and press E', 2.5); return; }
    if (car.driver === 'traffic') {
      car.stolen = true;
      ctx.traffic.cars.splice(ctx.traffic.cars.indexOf(car), 1);
      ctx.police.addWanted(1, 'You stole a car!');
    } else if (car.driver === 'police') {
      car.stolen = true;
      ctx.police.addWanted(2, 'You stole a police cruiser!');
    }
    p.enterCar(car);
  } else {
    p.exitCar();
  }
}

$('btn-start').addEventListener('click', () => ctx.startGame(false));
$('btn-continue').addEventListener('click', () => ctx.startGame(true));
$('btn-resume').addEventListener('click', () => { ctx.state = 'playing'; showOnly(null); });
$('btn-respawn').addEventListener('click', ctx.respawn);
if (!hasSave()) $('btn-continue').style.display = 'none';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Camera rig ---------------------------------------------------------------
function updateCamera(dt) {
  const pp = ctx.playerPos();
  if (ctx.state === 'menu') {
    const a = ctx.time * 0.03;
    camera.position.set(Math.sin(a) * 220, 130, Math.cos(a) * 220);
    camera.lookAt(0, 20, 40);
    return;
  }
  // Driving: gently swing the camera behind the car when the mouse is idle.
  if (!ctx.player.onFoot && ctx.time - ctx.cam.lastDrag > 2.5) {
    const want = ctx.player.car.heading;
    let d = want - ctx.cam.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ctx.cam.yaw += d * Math.min(1, dt * 1.4);
  }
  const target = new THREE.Vector3(pp.x, (pp.y || 0) + 2.2, pp.z);
  const dir = new THREE.Vector3(Math.sin(ctx.cam.yaw), 0, Math.cos(ctx.cam.yaw));
  const dist = ctx.cam.dist;
  const pos = target.clone()
    .addScaledVector(dir, -dist * Math.cos(ctx.cam.pitch))
    .add(new THREE.Vector3(0, dist * Math.sin(ctx.cam.pitch) + 1.2, 0));
  pos.y = Math.max(pos.y, 1.4);
  if (ctx.fx.shake > 0.01) {
    pos.x += (Math.random() - 0.5) * ctx.fx.shake * 0.9;
    pos.y += (Math.random() - 0.5) * ctx.fx.shake * 0.7;
    pos.z += (Math.random() - 0.5) * ctx.fx.shake * 0.9;
  }
  // In shot mode the camera snaps exactly: headless renders only a few
  // frames before the screenshot, so a smoothed camera would still be
  // flying in from the menu orbit.
  if (shotName) camera.position.copy(pos);
  else camera.position.lerp(pos, Math.min(1, dt * 9));
  camera.lookAt(target);
}

// --- Shot staging -------------------------------------------------------------
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
let shotFrames = 0;
if (shotName) {
  applyShot(ctx, shotName, Number(params.get('seed') || 1));
  document.body.dataset.shot = shotName;
}

// --- Main loop ------------------------------------------------------------------
const clock = new THREE.Clock();
let autosaveTimer = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  ctx.time += dt;

  if (ctx.state === 'playing') {
    ctx.dayTime = (ctx.dayTime + dt * 60) % 86400;
    ctx.updateSun();
    const k = ctx.input.keys;
    const p = ctx.player;
    if (p.onFoot) {
      p.update(dt);
    } else {
      const car = p.car;
      driveCar(ctx, car, {
        fwd: k.has('KeyW'), back: k.has('KeyS'),
        left: k.has('KeyA'), right: k.has('KeyD'),
        handbrake: k.has('Space'),
      }, dt);
    }
    ctx.traffic.update(dt);
    ctx.police.update(dt);
    ctx.missions.update(dt);
    ctx.combat.update(dt);
    ctx.combat.lastHurtAt = ctx.combat.lastHurtAt; // regen clock lives in combat
    ctx.fx.update(dt);
    const pc = p.car;
    const speedKmh = pc ? Math.abs(pc.speed) * 3.6 : 0;
    const nearestPolice = Math.min(
      ...ctx.police.cruisers.map((c) => Math.hypot(c.pos.x - ctx.playerPos().x, c.pos.z - ctx.playerPos().z)),
      999,
    );
    ctx.audio.update(dt, speedKmh, nearestPolice);
    ctx.hud.update(dt);
    autosaveTimer += dt;
    if (autosaveTimer > 30) { autosaveTimer = 0; ctx.saveGame(); }
  }

  updateCamera(dt);
  renderer.render(scene, camera);

  if (shotName) {
    shotFrames++;
    if (shotFrames === 45) window.__shotReady = true;
  }
}
ctx.updateSun();
loop();
