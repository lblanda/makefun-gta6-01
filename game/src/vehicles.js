// vehicles.js — box-built cars (sedan, taxi, coupe, van, police cruiser, pickup)
// and the arcade driving model: accel, brake/reverse, steering, handbrake drift,
// building collision and car-to-car push.
import * as THREE from 'three';
import { clamp, pick, mulberry32 } from './utils.js';
import { resolveCircle } from './city.js';

export const CAR_TYPES = {
  sedan:  { top: 34, accel: 15, grip: 8.0, w: 1.9, l: 4.4, h: 1.0, colors: [0xb03030, 0x3050b0, 0xdddddd, 0x303030, 0x2a7a4a] },
  taxi:   { top: 32, accel: 14, grip: 8.0, w: 1.9, l: 4.4, h: 1.0, colors: [0xf2c200] },
  coupe:  { top: 42, accel: 19, grip: 9.5, w: 1.85, l: 4.2, h: 0.85, colors: [0xc03070, 0x20b0c0, 0xe07020, 0xdddddd] },
  van:    { top: 28, accel: 11, grip: 7.0, w: 2.1, l: 5.2, h: 1.5, colors: [0xdddddd, 0x506080, 0x8a5a30] },
  police: { top: 38, accel: 18, grip: 9.0, w: 1.9, l: 4.5, h: 1.0, colors: [0x14181d] },
  pickup: { top: 33, accel: 14, grip: 7.5, w: 2.0, l: 4.9, h: 1.1, colors: [0x7a2a2a, 0x2a5a7a, 0x607060] },
};

const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });

export function makeCar(ctx, type, x, z, heading = 0, color = null) {
  const cfg = CAR_TYPES[type];
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const col = color ?? pick(rng, cfg.colors);
  const g = new THREE.Group();
  g.name = 'car-' + type;
  const bodyMat = new THREE.MeshLambertMaterial({ color: col });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, 0.75, cfg.l), bodyMat);
  body.position.y = 0.62;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cfg.w * 0.82, cfg.h, cfg.l * 0.5), glassMat);
  cabin.position.set(0, 1.05 + cfg.h / 2 - 0.2, -cfg.l * 0.06);
  g.add(body, cabin);
  if (type === 'van') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, 1.1, cfg.l * 0.62), bodyMat);
    box.position.set(0, 1.35, -cfg.l * 0.18);
    g.add(box);
  }
  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(cfg.w * 0.9, 0.5, cfg.l * 0.34),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bed.position.set(0, 1.0, -cfg.l * 0.3);
    g.add(bed);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xf2c200, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.95, 0);
    g.add(sign);
  }
  // Headlights + taillights.
  const hlMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xfff2a0, emissiveIntensity: 0.7 });
  const tlMat = new THREE.MeshLambertMaterial({ color: 0xaa1010, emissive: 0x880000, emissiveIntensity: 0.5 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), hlMat);
    hl.position.set(sx * (cfg.w / 2 - 0.3), 0.66, cfg.l / 2);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tlMat);
    tl.position.set(sx * (cfg.w / 2 - 0.3), 0.66, -cfg.l / 2);
    g.add(hl, tl);
    if (sx === 1) { g.userData.tailMat = tlMat; }
  }
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * (cfg.w / 2 - 0.05), 0.38, wz * (cfg.l / 2 - 0.75));
    w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  let lightBar = null, lightL = null, lightR = null;
  if (type === 'police') {
    lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    lightBar.position.set(0, 1.85, 0);
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1 }));
    lightL.position.set(-0.28, 1.86, 0);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x0022ff, emissiveIntensity: 1 }));
    lightR.position.set(0.28, 1.86, 0);
    g.add(lightBar, lightL, lightR);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 1.1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    door.position.set(cfg.w / 2 + 0.01, 0.65, 0.3);
    g.add(door);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.position.set(x, 0, z);
  g.rotation.y = heading;
  ctx.scene.add(g);

  const car = {
    mesh: g, type, cfg, color: col, heading, speed: 0, steer: 0,
    health: 100, driver: null, stolen: false, isPolice: type === 'police',
    wheels, lightL, lightR, sirenPhase: Math.random() * 10,
    pos: g.position,
  };
  car.flashLights = (t) => {
    if (!car.lightL) return;
    const on = Math.sin(t * 9 + car.sirenPhase) > 0;
    car.lightL.material.emissiveIntensity = on ? 2.2 : 0.15;
    car.lightR.material.emissiveIntensity = on ? 0.15 : 2.2;
  };
  return car;
}

// Player-driven car physics. input: {fwd, back, left, right, handbrake}.
export function driveCar(ctx, car, input, dt) {
  const cfg = car.cfg;
  const onSand = car.pos.z > 324; // beach slows cars down
  const top = cfg.top * (onSand ? 0.55 : 1);
  if (input.fwd) car.speed += cfg.accel * dt * (car.speed < 0 ? 2.2 : 1);
  if (input.back) {
    if (car.speed > 0.5) car.speed -= cfg.accel * 1.6 * dt;
    else car.speed -= cfg.accel * 0.7 * dt;
  }
  if (!input.fwd && !input.back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
  car.speed = clamp(car.speed, -top * 0.45, top);
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const grip = input.handbrake ? cfg.grip * 0.35 : cfg.grip;
  car.steer += (steerTarget * 0.55 - car.steer) * Math.min(1, dt * grip);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steer * (Math.abs(car.speed) / cfg.top) * 2.1 * dir * dt;
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x = nx; car.pos.z = nz;
  resolveCircle(ctx.city, car.pos, 2.1);
  // A hard hit on a building: scrape speed off, spark, thud.
  const hit = Math.hypot(car.pos.x - nx, car.pos.z - nz);
  if (hit > 0.02 && Math.abs(car.speed) > 6) {
    car.speed *= 0.55;
    ctx.fx?.sparks(car.pos.x, car.pos.y + 0.6, car.pos.z, 8);
    ctx.audio?.thud();
    damageCar(ctx, car, Math.abs(car.speed) * 0.12);
  }
  car.mesh.rotation.y = car.heading;
  // Brake lights flare when you hit the brakes.
  if (car.mesh.userData.tailMat) car.mesh.userData.tailMat.emissiveIntensity = input.back ? 1.8 : 0.5;
  // Wheel spin + front-wheel steer visual.
  const spin = car.speed * dt * 2.4;
  car.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = car.steer * 0.5;
  });
  // Handbrake dust + skid marks.
  if (input.handbrake && Math.abs(car.speed) > 8) {
    ctx.fx?.dust(car.pos.x, car.pos.z, 2);
    ctx.fx?.skid(car);
  }
  car.flashLights(ctx.time);
  return { hit, moved: Math.hypot(car.pos.x - before.x, car.pos.z - before.z) };
}

export function damageCar(ctx, car, n) {
  if (car.health <= 0) return;
  car.health -= n;
  if (car.health <= 0) {
    car.health = 0;
    ctx.fx?.explosion(car.pos.x, car.pos.y + 1, car.pos.z);
    ctx.audio?.explosion();
    ctx.hud?.toast('The car blew up!');
    if (car.driver === 'player') {
      ctx.player.exitCar();
      ctx.player.damage(25);
    }
    car.driver = null;
    car.wreck = true;
  } else if (car.health < 35) {
    ctx.fx?.smoke(car.pos.x, car.pos.y + 1.4, car.pos.z, 1);
  }
}

export function nearestDrivableCar(ctx, x, z, maxD) {
  let best = null, bestD = maxD;
  for (const car of ctx.cars) {
    if (car.wreck || car.driver === 'player') continue;
    const d = Math.hypot(car.pos.x - x, car.pos.z - z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
