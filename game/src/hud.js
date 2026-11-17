// hud.js — the DOM HUD (cash, health, wanted stars, clock, objective, speed,
// message feed) and the canvas minimap: roads, player arrow, cars, police,
// mission beacon and cash pickups.
import { EDGE } from './city.js';

export function createHud(ctx) {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('hud-cash'), health: $('hud-health-fill'), stars: $('hud-stars'),
    clock: $('hud-clock'), objective: $('hud-objective'), speed: $('hud-speed'),
    feed: $('hud-feed'), map: $('minimap'), vignette: $('vignette'),
    timer: $('hud-timer'), crosshair: $('crosshair'),
  };
  const mctx = el.map.getContext('2d');
  const S = 180, SCALE = S / (EDGE * 2 + 160); // world -> map px
  const toMap = (x, z) => [S / 2 + x * SCALE, S / 2 + z * SCALE];

  const h = {
    toast(msg, seconds = 4) {
      const div = document.createElement('div');
      div.className = 'feed-msg';
      div.textContent = msg;
      el.feed.prepend(div);
      while (el.feed.children.length > 5) el.feed.lastChild.remove();
      setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 600); }, seconds * 1000);
    },
    flashDamage() {
      el.vignette.style.opacity = '0.85';
      setTimeout(() => { el.vignette.style.opacity = '0'; }, 180);
    },
    update(dt) {
      el.cash.textContent = '$' + Math.floor(ctx.cash).toLocaleString('en-US');
      el.health.style.width = Math.max(0, ctx.health) + '%';
      el.health.style.background = ctx.health > 50 ? '#2ecc40' : ctx.health > 25 ? '#ff851b' : '#ff4136';
      el.stars.textContent = '★'.repeat(ctx.wanted) + '☆'.repeat(5 - ctx.wanted);
      el.stars.style.color = ctx.wanted > 0 ? '#ff4136' : '#888888';
      const hrs = Math.floor(ctx.dayTime / 3600) % 24;
      const min = Math.floor((ctx.dayTime % 3600) / 60);
      el.clock.textContent = `${String(hrs).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      el.objective.textContent = ctx.missions.objectiveText();
      const m = ctx.missions;
      if (m.active && m.stepDef() && m.stepDef().kind === 'timed') {
        el.timer.style.display = 'block';
        el.timer.textContent = '⏱ ' + Math.ceil(Math.max(0, m.timer)) + 's';
        el.timer.style.color = m.timer < 15 ? '#ff4136' : '#ffffff';
      } else if (m.active && m.stepDef() && m.stepDef().kind === 'wait') {
        el.timer.style.display = 'block';
        el.timer.textContent = 'Cracking… ' + Math.ceil(Math.max(0, m.timer)) + 's';
        el.timer.style.color = '#ffd23f';
      } else {
        el.timer.style.display = 'none';
      }
      const car = ctx.player.car;
      const kmh = car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
      el.speed.textContent = car ? kmh + ' km/h' : '';
      el.speed.style.display = car ? 'block' : 'none';
      el.crosshair.style.display = ctx.player.onFoot ? 'block' : 'none';
      h.drawMinimap();
    },
    drawMinimap() {
      const g = mctx;
      g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(8,12,20,0.82)';
      g.fillRect(0, 0, S, S);
      // Ocean + beach at the south edge.
      g.fillStyle = '#1a6f8f';
      g.fillRect(0, S - 14, S, 14);
      g.fillStyle = '#e3c98f';
      g.fillRect(0, S - 20, S, 6);
      // Blocks.
      g.fillStyle = '#2a2f36';
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
        const [x, z] = toMap(i * 72 - 28, j * 72 - 28);
        g.fillRect(x, z, 56 * SCALE, 56 * SCALE);
      }
      // Roads.
      g.strokeStyle = '#5a6068';
      g.lineWidth = 1;
      for (let k = -5; k <= 4; k++) {
        const c = k * 72 + 36;
        const [x1] = toMap(c, 0); const [, z1] = toMap(0, c);
        g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, S); g.stroke();
        g.beginPath(); g.moveTo(0, z1); g.lineTo(S, z1); g.stroke();
      }
      // Cash pickups.
      g.fillStyle = '#2ecc40';
      for (const pk of ctx.missions.pickups) {
        if (pk.taken > 0) continue;
        const [x, z] = toMap(pk.x, pk.z);
        g.fillRect(x - 1.5, z - 1.5, 3, 3);
      }
      // Mission marker: pulsing yellow diamond.
      if (ctx.missions.markerPos) {
        const [x, z] = toMap(ctx.missions.markerPos.x, ctx.missions.markerPos.z);
        const r = 5 + Math.sin(ctx.time * 4) * 1.5;
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.moveTo(x, z - r); g.lineTo(x + r, z); g.lineTo(x, z + r); g.lineTo(x - r, z);
        g.closePath(); g.fill();
      }
      // Traffic cars (white) and police (flashing red/blue).
      for (const car of ctx.cars) {
        const [x, z] = toMap(car.pos.x, car.pos.z);
        if (car.isPolice) {
          g.fillStyle = Math.sin(ctx.time * 9) > 0 ? '#ff2020' : '#2040ff';
          g.beginPath(); g.arc(x, z, 3.5, 0, 7); g.fill();
        } else if (car.driver !== 'player') {
          g.fillStyle = '#dddddd';
          g.fillRect(x - 1.5, z - 1.5, 3, 3);
        }
      }
      // Player arrow.
      const pp = ctx.playerPos();
      const [px, pz] = toMap(pp.x, pp.z);
      const heading = ctx.player.onFoot ? ctx.player.heading : (ctx.player.car ? ctx.player.car.heading : 0);
      // Player arrow: canvas +y is south (+z), the arrow is drawn pointing
      // north, so rotate by (PI - heading) to face the player's direction.
      g.save();
      g.translate(px, pz);
      g.rotate(Math.PI - heading);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5);
      g.closePath(); g.fill();
      g.restore();
      // North tick.
      g.fillStyle = '#ffffff';
      g.font = 'bold 9px sans-serif';
      g.fillText('N', S / 2 - 3, 10);
    },
  };
  return h;
}
