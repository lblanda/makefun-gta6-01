// traffic.js — ambient life: AI cars cruising the road lanes and pedestrians
// walking the sidewalks, who flee from danger and fall when hit.
import * as THREE from 'three';
import { mulberry32, clamp, pick, angleDiff } from './utils.js';
import { makeCar, damageCar } from './vehicles.js';
import { resolveCircle, nearestRoadPoint, randomRoadPoint, randomSidewalkPoint, EDGE, ROAD_CENTRES } from './city.js';

const TRAFFIC_N = 14;
const PED_N = 26;

function makePedMesh(THREE, rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, [0xc0392b, 0x27ae60, 0xf39c12, 0x8e44ad, 0xecf0f1, 0x16a085, 0xd35400]) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(rng, [0x2c3e50, 0x5d4037, 0x37474f]) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xd9a066, 0x8d5524, 0xe8b98a, 0x6b4226]) });
  const s = 0.9 + rng() * 0.25;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), pants);
  legL.position.set(-0.18, 0.38, 0);
  const legR = legL.clone(); legR.position.x = 0.18;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.42), shirt);
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skin);
  head.position.y = 1.9;
  g.add(legL, legR, torso, head);
  g.scale.setScalar(s);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, legL, legR };
}

export function createTraffic(ctx) {
  const rng = mulberry32(20261117);
  const t = { cars: [], peds: [] };

  // Traffic cars, spread over the road grid.
  const types = ['sedan', 'sedan', 'taxi', 'coupe', 'van', 'pickup', 'sedan'];
  for (let i = 0; i < TRAFFIC_N; i++) {
    const p = randomRoadPoint(rng);
    const axis = Math.abs(p.x - nearestRoadPoint(p.x, p.z).x) < 0.01 ? 'x' : 'z';
    const dir = rng() < 0.5 ? 1 : -1;
    const car = makeCar(ctx, pick(rng, types), p.x, p.z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
    car.driver = 'traffic';
    car.cruise = 9 + rng() * 5;
    car.axis = axis; car.dir = dir;
    car.lane = axis === 'x' ? dir * 4 : -dir * 4;
    car.turnCooldown = 0;
    t.cars.push(car);
    ctx.cars.push(car);
  }

  // Pedestrians on the sidewalks.
  for (let i = 0; i < PED_N; i++) {
    const p = randomSidewalkPoint(rng);
    const m = makePedMesh(THREE, rng);
    m.g.position.set(p.x, 0, p.z);
    ctx.scene.add(m.g);
    const wp = randomSidewalkPoint(rng);
    t.peds.push({
      mesh: m.g, legL: m.legL, legR: m.legR,
      pos: m.g.position, heading: rng() * Math.PI * 2,
      speed: 1.4 + rng() * 1.6, wp, phase: rng() * 6,
      state: 'walk', timer: 0, fallen: 0, fleeX: 0, fleeZ: 0,
    });
  }

  t.scareAt = (x, z, radius) => {
    for (const ped of t.peds) {
      if (ped.state === 'fallen') continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeX = ped.pos.x - x; ped.fleeZ = ped.pos.z - z;
        ped.timer = 2.5 + Math.random() * 2;
      }
    }
  };

  t.knockDown = (ped, byCar) => {
    if (ped.state === 'fallen') return;
    ped.state = 'fallen';
    ped.fallen = 0;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.4;
    if (byCar) ctx.police?.addWanted(1, 'You ran over a pedestrian!');
  };

  t.update = (dt) => {
    // --- Traffic cars: follow their lane, turn at intersections sometimes.
    for (const car of t.cars) {
      if (car.wreck) continue;
      car.turnCooldown -= dt;
      let speed = car.cruise;
      // Slow for the car ahead (player car or another traffic car).
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of ctx.cars) {
        if (other === car || other.wreck) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 10 && side < 3) speed = Math.min(speed, Math.max(0, (ahead - 5) * 1.2));
      }
      car.speed += (speed - car.speed) * Math.min(1, dt * 2);
      const step = car.speed * dt;
      car.pos.x += fx * step; car.pos.z += fz * step;
      // Keep on the lane: nudge back toward the lane line.
      if (car.axis === 'x') {
        const target = car.pos.z; // lane is a z offset from the road centre
        const centre = nearestRoadPoint(car.pos.x, car.pos.z).z;
        car.pos.z += clamp((centre + car.lane) - car.pos.z, -1, 1) * Math.min(1, dt * 3);
      } else {
        const centre = nearestRoadPoint(car.pos.x, car.pos.z).x;
        car.pos.x += clamp((centre + car.lane) - car.pos.x, -1, 1) * Math.min(1, dt * 3);
      }
      // Turn at an intersection now and then; reverse at the city edge.
      const atCross = ROAD_CENTRES.some((c) => Math.abs(car.pos.x - c) < 3) &&
        ROAD_CENTRES.some((c) => Math.abs(car.pos.z - c) < 3);
      if (car.turnCooldown <= 0 && atCross && Math.random() < dt * 0.9) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.dir = Math.random() < 0.5 ? 1 : -1;
        car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
        car.lane = car.axis === 'x' ? car.dir * 4 : -car.dir * 4;
        car.turnCooldown = 4;
      }
      if (Math.abs(car.pos.x) > EDGE - 8 || Math.abs(car.pos.z) > EDGE - 8) {
        car.dir *= -1;
        car.heading += Math.PI;
        car.lane = car.axis === 'x' ? car.dir * 4 : -car.dir * 4;
        car.pos.x = clamp(car.pos.x, -EDGE + 10, EDGE - 10);
        car.pos.z = clamp(car.pos.z, -EDGE + 10, EDGE - 10);
      }
      resolveCircle(ctx.city, car.pos, 2.1);
      car.mesh.rotation.y = car.heading;
      car.wheels.forEach((w) => { w.rotation.x += car.speed * dt * 2.4; });
      car.flashLights(ctx.time);
      // Hitting a pedestrian.
      for (const ped of t.peds) {
        if (ped.state === 'fallen') continue;
        const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        if (d < 2.2 && Math.abs(car.speed) > 4) t.knockDown(ped, true);
      }
    }

    // --- Pedestrians.
    for (const ped of t.peds) {
      if (ped.state === 'fallen') {
        ped.fallen += dt;
        if (ped.fallen > 6) { // get up elsewhere, back on their feet
          const p = randomSidewalkPoint(rng);
          ped.pos.set(p.x, 0, p.z);
          ped.mesh.rotation.x = 0;
          ped.state = 'walk';
          ped.wp = randomSidewalkPoint(rng);
        }
        continue;
      }
      let tx, tz, sp = ped.speed;
      if (ped.state === 'flee') {
        ped.timer -= dt;
        const len = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
        tx = ped.pos.x + (ped.fleeX / len) * 10;
        tz = ped.pos.z + (ped.fleeZ / len) * 10;
        sp = ped.speed * 2.6;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.wp = randomSidewalkPoint(rng); }
      } else {
        tx = ped.wp.x; tz = ped.wp.z;
        if (Math.hypot(tx - ped.pos.x, tz - ped.pos.z) < 2) ped.wp = randomSidewalkPoint(rng);
      }
      const dx = tx - ped.pos.x, dz = tz - ped.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.2) {
        const want = Math.atan2(dx, dz);
        ped.heading += clamp(angleDiff(ped.heading, want), -dt * 6, dt * 6);
        ped.pos.x += Math.sin(ped.heading) * sp * dt;
        ped.pos.z += Math.cos(ped.heading) * sp * dt;
        ped.phase += dt * sp * 2.2;
        ped.legL.rotation.x = Math.sin(ped.phase) * 0.6;
        ped.legR.rotation.x = -Math.sin(ped.phase) * 0.6;
      }
      ped.mesh.rotation.y = ped.heading;
      resolveCircle(ctx.city, ped.pos, 0.6);
      // Sidestep the player instead of walking through them.
      const pd = Math.hypot(ped.pos.x - ctx.playerPos().x, ped.pos.z - ctx.playerPos().z);
      if (pd < 1.6 && pd > 0.01) {
        ped.pos.x += ((ped.pos.x - ctx.playerPos().x) / pd) * (1.6 - pd);
        ped.pos.z += ((ped.pos.z - ctx.playerPos().z) / pd) * (1.6 - pd);
      }
      ped.mesh.position.copy(ped.pos);
      // Player car bearing down on them: run.
      const pc = ctx.player?.car;
      if (pc && Math.abs(pc.speed) > 6) {
        const dd = Math.hypot(ped.pos.x - pc.pos.x, ped.pos.z - pc.pos.z);
        if (dd < 9) {
          ped.state = 'flee';
          ped.fleeX = ped.pos.x - pc.pos.x; ped.fleeZ = ped.pos.z - pc.pos.z;
          ped.timer = 1.5;
        }
      }
    }

    // --- Car-to-car push (traffic vs player car vs police).
    for (let i = 0; i < ctx.cars.length; i++) {
      for (let j = i + 1; j < ctx.cars.length; j++) {
        const a = ctx.cars[i], b = ctx.cars[j];
        if (a.wreck || b.wreck) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 4.6) {
          const push = (4.6 - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          if (Math.abs(a.speed) > 8 || Math.abs(b.speed) > 8) {
            ctx.fx?.sparks((a.pos.x + b.pos.x) / 2, 1, (a.pos.z + b.pos.z) / 2, 4);
            if (a.driver === 'player') damageCar(ctx, a, 2);
            if (b.driver === 'player') damageCar(ctx, b, 2);
          }
        }
      }
    }
  };

  return t;
}
