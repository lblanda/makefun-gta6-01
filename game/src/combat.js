// combat.js — punch and pistol: short-range fists (F), a hitscan pistol
// (click or G) with ammo and a muzzle flash, and slow health regeneration.
import * as THREE from 'three';
import { clamp } from './utils.js';
import { damageCar } from './vehicles.js';

export function createCombat(ctx) {
  const c = {
    ammo: 24, reserve: Infinity, reloadTimer: 0, lastHurtAt: -99,
    muzzle: null, tracer: null, tracerTimer: 0,
  };

  // Muzzle flash light + a tracer line, both fade fast.
  c.muzzle = new THREE.PointLight(0xffc860, 0, 14, 2);
  ctx.scene.add(c.muzzle);
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  c.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
  ctx.scene.add(c.tracer);

  c.punch = () => {
    const p = ctx.player;
    if (!p.onFoot || p.punchTimer > 0 || ctx.state !== 'playing') return;
    p.punchTimer = 0.35;
    ctx.audio?.punch();
    const px = p.pos.x, pz = p.pos.z;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const hit = (pos, range, arc) => {
      const dx = pos.x - px, dz = pos.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > range) return false;
      const dot = (dx * fx + dz * fz) / (d || 1);
      return dot > arc;
    };
    for (const ped of ctx.traffic.peds) {
      if (ped.state !== 'fallen' && hit(ped.pos, 2.4, 0.2)) {
        ctx.traffic.knockDown(ped, false);
        ctx.police?.addWanted(1, 'Assault! A witness called the cops.');
        ctx.fx?.sparks(ped.pos.x, 1.4, ped.pos.z, 4);
      }
    }
    for (const o of ctx.police.officers) {
      if (hit(o.pos, 2.4, 0.2)) {
        o.health = (o.health ?? 60) - 25;
        ctx.fx?.sparks(o.pos.x, 1.4, o.pos.z, 4);
        o.pos.x += fx * 1.2; o.pos.z += fz * 1.2;
        if (o.health <= 0) {
          o.mesh.rotation.x = -Math.PI / 2;
          o.pos.y = 0.4;
          ctx.police.officers.splice(ctx.police.officers.indexOf(o), 1);
          setTimeout(() => ctx.scene.remove(o.mesh), 4000);
          ctx.police?.addWanted(1, 'You dropped a cop!');
        }
      }
    }
    for (const car of ctx.cars) {
      if (car.wreck) continue;
      if (hit(car.pos, 3, 0.2)) {
        ctx.fx?.sparks(car.pos.x, 1, car.pos.z, 3);
        ctx.audio?.thud();
      }
    }
  };

  c.shoot = () => {
    const p = ctx.player;
    if (ctx.state !== 'playing' || c.reloadTimer > 0) return;
    if (c.ammo <= 0) {
      c.reloadTimer = 1.6;
      ctx.hud?.toast('Reloading…', 1.5);
      ctx.audio?.reload();
      return;
    }
    c.ammo--;
    if (c.ammo === 0) { c.reloadTimer = 1.6; ctx.audio?.reload(); }
    ctx.audio?.gunshot();
    const px = p.pos.x, py = p.onFoot ? 1.5 : 1.2, pz = p.pos.z;
    const yaw = p.onFoot ? p.heading : (p.car ? p.car.heading : ctx.cam.yaw);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    c.muzzle.position.set(px + fx * 1.2, py, pz + fz * 1.2);
    c.muzzle.intensity = 60;
    // Find the closest thing in the firing cone.
    let best = null, bestD = 48;
    const consider = (pos, kind, ref) => {
      const dx = pos.x - px, dz = pos.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > bestD) return;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > 0.94) { best = { kind, ref, d, x: pos.x, z: pos.z }; bestD = d; }
    };
    for (const ped of ctx.traffic.peds) if (ped.state !== 'fallen') consider(ped.pos, 'ped', ped);
    for (const o of ctx.police.officers) consider(o.pos, 'officer', o);
    for (const car of ctx.cars) {
      if (car.wreck) continue;
      if (car.driver === 'player' && p.car === car) continue;
      consider(car.pos, 'car', car);
    }
    const endX = px + fx * (best ? best.d : 48);
    const endZ = pz + fz * (best ? best.d : 48);
    c.tracer.geometry.setFromPoints([new THREE.Vector3(px, py, pz), new THREE.Vector3(endX, py, endZ)]);
    c.tracer.material.opacity = 0.9;
    c.tracerTimer = 0.08;
    ctx.traffic.scareAt(px, pz, 30);
    if (!best) return;
    if (best.kind === 'ped') {
      ctx.traffic.knockDown(best.ref, false);
      ctx.police?.addWanted(1, 'Shots fired! The cops are coming.');
    } else if (best.kind === 'officer') {
      const o = best.ref;
      o.health = (o.health ?? 60) - 34;
      ctx.fx?.sparks(o.pos.x, 1.4, o.pos.z, 6);
      if (o.health <= 0) {
        ctx.police.officers.splice(ctx.police.officers.indexOf(o), 1);
        o.mesh.rotation.x = -Math.PI / 2;
        setTimeout(() => ctx.scene.remove(o.mesh), 4000);
        ctx.police?.addWanted(1, 'You shot a cop!');
      }
    } else if (best.kind === 'car') {
      damageCar(ctx, best.ref, 22);
      ctx.fx?.sparks(best.x, 1, best.z, 8);
      ctx.police?.addWanted(1, 'Shots fired! The cops are coming.');
    }
  };

  c.update = (dt) => {
    if (c.reloadTimer > 0) {
      c.reloadTimer -= dt;
      if (c.reloadTimer <= 0) { c.ammo = 24; ctx.hud?.toast('Reloaded', 1); }
    }
    c.muzzle.intensity = Math.max(0, c.muzzle.intensity - dt * 600);
    if (c.tracerTimer > 0) {
      c.tracerTimer -= dt;
      if (c.tracerTimer <= 0) c.tracer.material.opacity = 0;
    }
    // Slow health regen out of combat.
    if (ctx.state === 'playing' && ctx.health < 100 && ctx.time - c.lastHurtAt > 6) {
      ctx.health = clamp(ctx.health + 4 * dt, 0, 100);
    }
  };

  return c;
}
