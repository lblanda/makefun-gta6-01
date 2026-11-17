// utils.js — small shared helpers for Solara Bay: seeded RNG, math, and the
// procedural canvas textures that give the city its look (no image files).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Make a THREE.CanvasTexture from a 2D drawing callback.
export function canvasTexture(THREE, w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A building facade: base colour, lit windows in a grid, a darker ground floor.
export function facadeTexture(THREE, rng, base, floors, cols) {
  return canvasTexture(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical shading
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      g.fillRect(rng() * w, 0, 2 + rng() * 6, h);
    }
    const cw = w / cols, ch = h / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < 0.55;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffe9a8' : '#9fd8ff') : '#1d2733';
        g.fillRect(c * cw + cw * 0.22, f * ch + ch * 0.25, cw * 0.56, ch * 0.5);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, h - ch * 0.9, w, ch * 0.9);
  });
}

// Asphalt with a dashed centre line, used on road strips (seeded speckle so
// every road texture is identical across loads).
export function roadTexture(THREE, horizontal) {
  const rng = mulberry32(42);
  return canvasTexture(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 300; i++) g.fillRect(rng() * w, rng() * h, 2, 2);
    g.fillStyle = '#e8c832';
    if (horizontal) { for (let x = 0; x < w; x += 32) g.fillRect(x, h / 2 - 2, 18, 4); }
    else { for (let y = 0; y < h; y += 32) g.fillRect(w / 2 - 2, y, 4, 18); }
  });
}

export function sidewalkTexture(THREE) {
  return canvasTexture(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
  }, 4, 4);
}

export function sandTexture(THREE) {
  return canvasTexture(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#e3c98f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${120 + Math.random() * 80 | 0},${90 + Math.random() * 60 | 0},40,0.25)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, 8, 8);
}
