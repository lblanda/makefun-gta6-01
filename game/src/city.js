// city.js — builds Solara Bay: a 9x9 block grid of roads and buildings, a beach
// and ocean on the south edge, a pier, palms and streetlights. Owns the building
// collision boxes and the road helpers traffic and police drive on.
import * as THREE from 'three';
import { mulberry32, clamp, pick, facadeTexture, roadTexture, sidewalkTexture, sandTexture } from './utils.js';

export const PITCH = 72;      // block centre to block centre
export const BLOCK = 56;      // block side
export const ROAD_W = 16;     // road width
export const CITY_R = 4;      // blocks from -4..4
export const EDGE = CITY_R * PITCH + BLOCK / 2 + ROAD_W / 2; // 324, city edge
export const SAND_END = 400;  // south edge of the beach (ocean beyond)
export const WORLD = { minX: -EDGE - 6, maxX: EDGE + 6, minZ: -EDGE - 6, maxZ: SAND_END - 4 };

export const ROAD_CENTRES = []; // road centre lines, both axes
for (let k = -5; k <= 4; k++) ROAD_CENTRES.push(k * PITCH + BLOCK / 2 + ROAD_W / 2);

export function isRoadCoord(v) {
  for (const c of ROAD_CENTRES) if (Math.abs(v - c) < ROAD_W / 2 + 1) return true;
  return false;
}
export function onRoad(x, z) { return isRoadCoord(x) || isRoadCoord(z); }

// Nearest point on a road centreline (used to spawn / route cars).
export function nearestRoadPoint(x, z) {
  let bx = ROAD_CENTRES[0], bz = ROAD_CENTRES[0];
  for (const c of ROAD_CENTRES) {
    if (Math.abs(c - x) < Math.abs(bx - x)) bx = c;
    if (Math.abs(c - z) < Math.abs(bz - z)) bz = c;
  }
  return Math.abs(bx - x) < Math.abs(bz - z) ? { x: bx, z } : { x, z: bz };
}

export function randomRoadPoint(rng) {
  const axis = rng() < 0.5 ? 'x' : 'z';
  const c = pick(rng, ROAD_CENTRES);
  const along = (rng() * 2 - 1) * (EDGE - 20);
  return axis === 'x' ? { x: c, z: along } : { x: along, z: c };
}

export function randomSidewalkPoint(rng) {
  // On a block edge, just off a road: walkable pavement around a block.
  const bi = Math.floor(rng() * 9) - 4, bj = Math.floor(rng() * 9) - 4;
  const cx = bi * PITCH, cz = bj * PITCH;
  const side = Math.floor(rng() * 4);
  const off = (rng() * 2 - 1) * (BLOCK / 2 - 4);
  if (side === 0) return { x: cx + off, z: cz - BLOCK / 2 - 3 };
  if (side === 1) return { x: cx + off, z: cz + BLOCK / 2 + 3 };
  if (side === 2) return { x: cx - BLOCK / 2 - 3, z: cz + off };
  return { x: cx + BLOCK / 2 + 3, z: cz + off };
}

export function buildCity(scene) {
  const rng = mulberry32(1337); // fixed seed: the same city every load
  const colliders = [];         // {minX,maxX,minZ,maxZ}
  const buildings = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const palette = ['#b98a5e', '#7d8aa0', '#a08a7d', '#6f7f6a', '#9a7f8e', '#8a6f5c', '#5e7d8a', '#a89a6a'];
  const downtown = (i, j) => Math.abs(i) <= 1 && Math.abs(j) <= 1;

  // Ground: asphalt base for the whole city square.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(EDGE * 2 + 40, EDGE * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x3a3d42 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Road strips (visual, with centre dashes) along every road centreline.
  const roadMatX = new THREE.MeshLambertMaterial({ map: roadTexture(THREE, true) });
  const roadMatZ = new THREE.MeshLambertMaterial({ map: roadTexture(THREE, false) });
  for (const c of ROAD_CENTRES) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2 + 40, ROAD_W), roadMatX);
    rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, c); rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, EDGE * 2 + 40), roadMatZ);
    rz.rotation.x = -Math.PI / 2; rz.position.set(c, 0.02, 0); rz.receiveShadow = true;
    group.add(rz);
  }

  // Sidewalk slabs + buildings, block by block.
  const walkMat = new THREE.MeshLambertMaterial({ map: sidewalkTexture(THREE) });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a48 });
  for (let i = -CITY_R; i <= CITY_R; i++) {
    for (let j = -CITY_R; j <= CITY_R; j++) {
      const cx = i * PITCH, cz = j * PITCH;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 8, BLOCK + 8), walkMat);
      slab.rotation.x = -Math.PI / 2; slab.position.set(cx, 0.03, cz);
      slab.receiveShadow = true;
      group.add(slab);
      // The south-most row is the beachfront: hotels face the ocean.
      const beachfront = j === CITY_R;
      const n = downtown(i, j) ? 1 : (rng() < 0.45 ? 2 : 1);
      for (let b = 0; b < n; b++) {
        const w = 16 + rng() * 22, d = 16 + rng() * 22;
        const ox = n === 1 ? 0 : (b === 0 ? -13 : 13);
        const oz = n === 1 ? 0 : (b === 0 ? -10 : 12);
        let h;
        if (i === 0 && j === 0) h = 86; // Solara Tower, the city landmark
        else if (beachfront) h = 26 + rng() * 30;
        else if (downtown(i, j)) h = 30 + rng() * 42;
        else h = 9 + rng() * (Math.abs(i) + Math.abs(j) < 5 ? 22 : 10);
        const x = cx + ox, z = cz + oz;
        const floors = Math.max(2, Math.round(h / 4));
        const mat = new THREE.MeshLambertMaterial({
          map: facadeTexture(THREE, rng, pick(rng, palette), floors, Math.max(3, Math.round(w / 6))),
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1, d * 0.9), roofMat);
        roof.position.set(x, h + 0.5, z);
        group.add(roof);
        if (rng() < 0.25) { // rooftop antenna / AC box
          const ant = new THREE.Mesh(new THREE.BoxGeometry(1, 6 + rng() * 6, 1),
            new THREE.MeshLambertMaterial({ color: 0x222222 }));
          ant.position.set(x + w * 0.25, h + 4, z - d * 0.2);
          group.add(ant);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings.push({ x, z, w, d, h });
      }
    }
  }

  // Beach: sand strip south of the beachfront road (starts at the road's
  // south edge so it never covers the asphalt), then the ocean.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(EDGE * 2 + 120, SAND_END - (EDGE + ROAD_W / 2) + 8),
    new THREE.MeshLambertMaterial({ map: sandTexture(THREE) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, (EDGE + ROAD_W / 2) + (SAND_END - (EDGE + ROAD_W / 2) + 8) / 2);
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(EDGE * 2 + 400, 420),
    new THREE.MeshLambertMaterial({ color: 0x1a6f8f, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.05, SAND_END + 210);
  group.add(ocean);

  // Boardwalk along the beach edge + the pier at x = 0.
  const boardMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(EDGE * 2 + 40, 0.6, 10), boardMat);
  board.position.set(0, 0.3, EDGE + 12);
  board.castShadow = true; board.receiveShadow = true;
  group.add(board);
  for (let x = -EDGE; x <= EDGE; x += 24) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 60), boardMat);
    plank.position.set(x, 0.35, SAND_END + 26);
    group.add(plank);
  }
  const pierEnd = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 26), boardMat);
  pierEnd.position.set(0, 0.4, SAND_END + 52);
  group.add(pierEnd);

  // Palm trees: beachfront row + scattered along avenues.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4a });
  function palm(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 9 * s, 6), trunkMat);
    trunk.position.y = 4.5 * s; trunk.castShadow = true;
    t.add(trunk);
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 4.5 * s, 4), leafMat);
      const a = (k / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6 * s, 9.2 * s, Math.sin(a) * 1.6 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      t.add(leaf);
    }
    t.position.set(x, 0, z);
    group.add(t);
  }
  for (let x = -EDGE + 12; x <= EDGE - 12; x += 36) palm(x, EDGE + 6, 1 + rng() * 0.4);
  for (let k = 0; k < 26; k++) {
    const p = randomSidewalkPoint(rng);
    palm(p.x, p.z, 0.8 + rng() * 0.5);
  }

  // Streetlights along the avenues (visual; glow at night via emissive).
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.6 });
  for (const c of ROAD_CENTRES) {
    for (let v = -EDGE + 40; v <= EDGE - 40; v += 144) {
      for (const [x, z] of [[c + 9, v], [c - 9, v + 72]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 8, 6), poleMat);
        pole.position.set(x, 4, z);
        group.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat);
        lamp.position.set(x, 8.2, z);
        group.add(lamp);
      }
    }
  }

  return { group, colliders, buildings, rng };
}

// Push a circle (x, z, radius r) out of building boxes and the world bounds.
// Mutates and returns the position object {x, z}.
export function resolveCircle(city, p, r) {
  for (const b of city.colliders) {
    const nx = clamp(p.x, b.minX, b.maxX);
    const nz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r;
        p.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = p.x - b.minX, pr = b.maxX - p.x, pt = p.z - b.minZ, pb = b.maxZ - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = b.minX - r; else if (m === pr) p.x = b.maxX + r;
        else if (m === pt) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }
  p.x = clamp(p.x, WORLD.minX, WORLD.maxX);
  p.z = clamp(p.z, WORLD.minZ, WORLD.maxZ);
  return p;
}
