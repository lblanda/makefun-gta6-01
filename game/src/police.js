// police.js — the wanted system: stars 0-5, police cruisers that spawn and
// chase, officers on foot who can bust you, and wanted decay when you hide.
import * as THREE from 'three';
import { clamp, angleDiff } from './utils.js';
import { makeCar, damageCar } from './vehicles.js';
import { randomRoadPoint, nearestRoadPoint, resolveCircle } from './city.js';

const MAX_CRUISERS = 5;

export function createPolice(ctx) {
  const pol = { cruisers: [], officers: [], hiddenTimer: 0, bustTimer: 0 };

  function makeOfficer(x, z) {
    const g = new THREE.Group();
    const uni = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), uni);
    legL.position.set(-0.18, 0.38, 0);
    const legR = legL.clone(); legR.position.x = 0.18;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.42), uni);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skin);
    head.position.y = 1.9;
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x0a1428 }));
    hat.position.y = 2.16;
    g.add(legL, legR, torso, head, hat);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(x, 0, z);
    ctx.scene.add(g);
    return { mesh: g, legL, legR, pos: g.position, heading: 0, punchCd: 0, phase: 0 };
  }

  pol.addWanted = (n, reason) => {
    if (ctx.state !== 'playing') return;
    const before = ctx.wanted;
    ctx.wanted = clamp(ctx.wanted + n, 0, 5);
    if (ctx.wanted > before) {
      ctx.hud?.toast(reason || `Wanted level ${ctx.wanted}!`);
      ctx.audio?.sirenBlip();
      if (ctx.wanted >= 3) ctx.hud?.toast('The whole Solara PD is after you!');
    }
    pol.hiddenTimer = 0;
  };

  pol.setWanted = (n) => {
    ctx.wanted = clamp(n, 0, 5);
    pol.hiddenTimer = 0;
  };

  pol.spawnCruiser = () => {
    const pp = ctx.playerPos();
    let p = randomRoadPoint(Math.random);
    let tries = 0;
    while (Math.hypot(p.x - pp.x, p.z - pp.z) < 55 && tries++ < 12) p = randomRoadPoint(Math.random);
    const rp = nearestRoadPoint(p.x, p.z);
    const car = makeCar(ctx, 'police', rp.x, rp.z, Math.random() * Math.PI * 2);
    car.driver = 'police';
    car.cruise = 0;
    pol.cruisers.push(car);
    ctx.cars.push(car);
    ctx.audio?.sirenBlip();
    return car;
  };

  pol.clearAll = () => {
    for (const c of pol.cruisers) { ctx.scene.remove(c.mesh); ctx.cars.splice(ctx.cars.indexOf(c), 1); }
    for (const o of pol.officers) ctx.scene.remove(o.mesh);
    pol.cruisers = []; pol.officers = [];
    pol.bustTimer = 0;
  };

  pol.update = (dt) => {
    const pp = ctx.playerPos();
    const wanted = ctx.wanted;

    // Keep the cruiser count matched to the wanted level.
    while (pol.cruisers.length < wanted && pol.cruisers.length < MAX_CRUISERS) pol.spawnCruiser();
    while (pol.cruisers.length > wanted) {
      const c = pol.cruisers.pop();
      ctx.scene.remove(c.mesh);
      ctx.cars.splice(ctx.cars.indexOf(c), 1);
    }

    // Cruisers chase the player.
    for (const car of pol.cruisers) {
      const dx = pp.x - car.pos.x, dz = pp.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const steer = clamp(angleDiff(car.heading, want) * 1.6, -0.6, 0.6);
      const top = wanted >= 4 ? 42 : 36;
      car.speed += (top - car.speed) * Math.min(1, dt * 0.8);
      car.heading += steer * (Math.abs(car.speed) / 40) * 2.4 * dt;
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      // Keep them on the roads when possible: nudge toward the nearest road.
      const rp = nearestRoadPoint(car.pos.x, car.pos.z);
      const offRoad = Math.min(Math.abs(car.pos.x - rp.x), Math.abs(car.pos.z - rp.z));
      if (offRoad > 9) {
        car.pos.x += (rp.x - car.pos.x) * Math.min(1, dt * 0.7);
        car.pos.z += (rp.z - car.pos.z) * Math.min(1, dt * 0.7);
      }
      resolveCircle(ctx.city, car.pos, 2.1);
      car.mesh.rotation.y = car.heading;
      car.wheels.forEach((w) => { w.rotation.x += car.speed * dt * 2.4; });
      car.flashLights(ctx.time);
      // Ram the player's car.
      const pc = ctx.player.car;
      if (pc && dist < 5.5) {
        damageCar(ctx, pc, 6 * dt);
        pc.speed *= 0.98;
        if (Math.random() < dt * 2) ctx.fx?.sparks(pc.pos.x, 1, pc.pos.z, 3);
      }
      // Too far away: teleport closer so the chase never dies.
      if (dist > 190) {
        const p = randomRoadPoint(Math.random);
        const rp2 = nearestRoadPoint(p.x, p.z);
        car.pos.set(rp2.x, 0, rp2.z);
      }
    }

    // Officers on foot when wanted and the player is on foot.
    const wantOfficers = wanted >= 2 && ctx.player.onFoot ? Math.min(2, wanted - 1) : 0;
    while (pol.officers.length < wantOfficers) {
      const a = Math.random() * Math.PI * 2;
      pol.officers.push(makeOfficer(pp.x + Math.sin(a) * 22, pp.z + Math.cos(a) * 22));
    }
    while (pol.officers.length > wantOfficers) {
      const o = pol.officers.pop();
      ctx.scene.remove(o.mesh);
    }
    let officerNear = false;
    for (const o of pol.officers) {
      const dx = pp.x - o.pos.x, dz = pp.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      o.punchCd -= dt;
      if (d < 2.2) {
        officerNear = true;
        if (o.punchCd <= 0) {
          o.punchCd = 1.1;
          ctx.player.damage(8);
          ctx.hud?.toast('A cop is beating you down!');
        }
      } else {
        const want = Math.atan2(dx, dz);
        o.heading += clamp(angleDiff(o.heading, want), -dt * 5, dt * 5);
        o.pos.x += Math.sin(o.heading) * 7.6 * dt;
        o.pos.z += Math.cos(o.heading) * 7.6 * dt;
        o.phase += dt * 10;
        o.legL.rotation.x = Math.sin(o.phase) * 0.7;
        o.legR.rotation.x = -Math.sin(o.phase) * 0.7;
      }
      o.mesh.rotation.y = o.heading;
      o.mesh.position.copy(o.pos);
    }

    // Busted: an officer stays on top of you while you're on foot.
    if (officerNear && ctx.player.onFoot) {
      pol.bustTimer += dt;
      if (pol.bustTimer > 2.5) { pol.bustTimer = 0; ctx.die('busted'); }
    } else {
      pol.bustTimer = Math.max(0, pol.bustTimer - dt * 2);
    }

    // Wanted decays when no police can see you.
    if (wanted > 0) {
      const nearest = Math.min(
        ...pol.cruisers.map((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z)),
        ...pol.officers.map((o) => Math.hypot(o.pos.x - pp.x, o.pos.z - pp.z)),
        999,
      );
      if (nearest > 70) {
        pol.hiddenTimer += dt;
        if (pol.hiddenTimer > 12) {
          pol.hiddenTimer = 0;
          ctx.wanted = wanted - 1;
          ctx.hud?.toast(`Heat dying down… wanted level ${ctx.wanted}`);
        }
      } else {
        pol.hiddenTimer = 0;
      }
    }
  };

  return pol;
}
