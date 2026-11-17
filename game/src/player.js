// player.js — the on-foot character: a simple box-built figure with
// camera-relative WASD movement, sprint, jump, punch pose, and enter/exit car.
import * as THREE from 'three';
import { clamp, angleLerp } from './utils.js';
import { resolveCircle } from './city.js';

const WALK_SPEED = 6;
const SPRINT_SPEED = 10;

export function createPlayer(ctx) {
  const g = new THREE.Group();
  g.name = 'player';
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), pants);
  legL.position.set(-0.2, 0.4, 0);
  const legR = legL.clone(); legR.position.x = 0.2;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 0.45), shirt);
  torso.position.y = 1.28;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 2.0;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.54), hair);
  cap.position.y = 2.28;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.26), shirt);
  armL.position.set(-0.6, 1.3, 0);
  const armR = armL.clone(); armR.position.x = 0.6;
  g.add(legL, legR, torso, head, cap, armL, armR);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  ctx.scene.add(g);

  const p = {
    mesh: g, legL, legR, armL, armR,
    pos: new THREE.Vector3(0, 0, 40),
    heading: 0, vy: 0, grounded: true,
    walkPhase: 0, moving: false,
    onFoot: true, car: null, punchTimer: 0, hurtTimer: 0,
  };

  p.setPosition = (x, z, heading = 0) => {
    p.pos.set(x, 0, z);
    p.heading = heading;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = heading;
  };

  p.enterCar = (car) => {
    p.onFoot = false; p.car = car;
    car.driver = 'player';
    g.visible = false;
    ctx.audio?.engineStart();
    ctx.hud?.toast(car.stolen ? 'You stole the car!' : 'You got in the car');
  };

  p.exitCar = () => {
    const car = p.car;
    if (!car) return;
    const side = car.heading + Math.PI / 2;
    const x = car.mesh.position.x + Math.sin(side) * 2.6;
    const z = car.mesh.position.z + Math.cos(side) * 2.6;
    p.onFoot = true; p.car = null;
    car.driver = null; car.speed = 0;
    p.setPosition(x, z, car.heading);
    g.visible = true;
    ctx.audio?.door();
  };

  p.damage = (n) => {
    if (ctx.state !== 'playing' || p.hurtTimer > 0) return;
    p.hurtTimer = 0.5;
    ctx.health = clamp(ctx.health - n, 0, 100);
    ctx.hud?.flashDamage();
    ctx.audio?.hurt();
    if (ctx.health <= 0) ctx.die('wasted');
  };

  p.update = (dt) => {
    if (!p.onFoot) return;
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    const k = ctx.input.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const yaw = ctx.cam.yaw;
    let mx = 0, mz = 0;
    if (fwd || strafe) {
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      mx = -sin * fwd + cos * strafe;
      mz = -cos * fwd - sin * strafe;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      p.pos.x += mx * speed * dt;
      p.pos.z += mz * speed * dt;
      p.heading = angleLerp(p.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
      p.moving = true;
      p.walkPhase += dt * speed * 1.6;
    } else {
      p.moving = false;
    }
    // Jump (Space) with simple gravity.
    if (k.has('Space') && p.grounded) { p.vy = 7; p.grounded = false; }
    if (!p.grounded) {
      p.vy -= 22 * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
    }
    resolveCircle(ctx.city, p.pos, 0.7);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.heading;
    // Sprinting kicks up a little dust behind you.
    if (p.moving && sprint && Math.random() < dt * 6) ctx.fx?.dust(p.pos.x, p.pos.z, 1);
    // Walk-cycle swing; punch pose overrides the arms.
    const sw = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    if (p.punchTimer > 0) {
      armR.rotation.x = -1.6 + Math.sin(p.punchTimer * 20) * 0.3;
      armL.rotation.x = 0.4;
    } else {
      armL.rotation.x = -sw; armR.rotation.x = sw;
    }
  };

  return p;
}
