// effects.js — particles (dust, smoke, sparks, explosions), skid marks and
// screen shake, all from a single pooled THREE.Points cloud.
import * as THREE from 'three';

const MAX_P = 500;

export function createEffects(ctx) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  ctx.scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX_P; i++) parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, r: 1, g: 1, b: 1 });
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav = 0) {
    const p = parts[cursor];
    p.life = life; p.max = life;
    p.vx = vx; p.vy = vy; p.vz = vz; p.grav = grav;
    p.r = r; p.g = g; p.b = b;
    pos[cursor * 3] = x; pos[cursor * 3 + 1] = y; pos[cursor * 3 + 2] = z;
    cursor = (cursor + 1) % MAX_P;
  }

  // Skid marks: a pool of dark translucent quads laid under the rear wheels.
  const skidGeo = new THREE.PlaneGeometry(0.5, 2.2);
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.45, depthWrite: false });
  const skids = [];
  for (let i = 0; i < 120; i++) {
    const m = new THREE.Mesh(skidGeo, skidMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    ctx.scene.add(m);
    skids.push(m);
  }
  let skidCursor = 0;

  const fx = {
    shake: 0,
    dust(x, z, n) {
      for (let i = 0; i < n; i++) {
        spawn(x + (Math.random() - 0.5) * 2, 0.2, z + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2,
          0.7 + Math.random() * 0.5, 0.55, 0.5, 0.42, -0.5);
      }
    },
    smoke(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5),
          (Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8,
          1.2 + Math.random(), 0.25, 0.25, 0.25, 0.4);
      }
    },
    sparks(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        spawn(x, y, z, Math.cos(a) * (3 + Math.random() * 5), 2 + Math.random() * 3, Math.sin(a) * (3 + Math.random() * 5),
          0.3 + Math.random() * 0.3, 1, 0.75, 0.2, -9);
      }
    },
    explosion(x, y, z) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 2;
        const sp = 4 + Math.random() * 9;
        spawn(x, y, z, Math.cos(a) * sp, e * sp * 0.6 + 3, Math.sin(a) * sp,
          0.6 + Math.random() * 0.7, 1, 0.45 + Math.random() * 0.4, 0.1, -6);
      }
      for (let i = 0; i < 16; i++) {
        spawn(x + (Math.random() - 0.5) * 2, y + Math.random(), z + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5),
          1.8 + Math.random(), 0.2, 0.2, 0.2, 0.5);
      }
      fx.shake = Math.max(fx.shake, 0.9);
    },
    skid(car) {
      const m = skids[skidCursor];
      skidCursor = (skidCursor + 1) % skids.length;
      m.position.set(car.pos.x - Math.sin(car.heading) * 1.4, 0.06, car.pos.z - Math.cos(car.heading) * 1.4);
      m.rotation.z = car.heading;
      m.visible = true;
    },
    addShake(n) { fx.shake = Math.min(1, fx.shake + n); },
    update(dt) {
      for (let i = 0; i < MAX_P; i++) {
        const p = parts[i];
        if (p.life <= 0) { pos[i * 3 + 1] = -100; continue; }
        p.life -= dt;
        p.vy += p.grav * dt;
        pos[i * 3] += p.vx * dt;
        pos[i * 3 + 1] += p.vy * dt;
        pos[i * 3 + 2] += p.vz * dt;
        const f = Math.max(0, p.life / p.max);
        col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      fx.shake = Math.max(0, fx.shake - dt * 1.8);
    },
  };
  return fx;
}
