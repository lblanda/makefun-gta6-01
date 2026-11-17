// missions.js — the story of Solara Bay: five jobs for the fixer Mara Voss,
// plus cash pickups scattered around the city. A glowing beacon marks the
// current objective; the HUD, minimap and waypoint arrow all point at it.
import * as THREE from 'three';
import { clamp } from './utils.js';

const CHOP_SHOP = { x: -180, z: 180 };
const PIER = { x: 0, z: 372 };
const GARAGE = { x: 144, z: -144 };
const BANK = { x: 36, z: -36 };
const SAFEHOUSE = { x: -252, z: 252 };

export const MISSIONS = [
  {
    title: 'Wheels', reward: 400,
    intro: 'Mara Voss: "New in town, Rook? Prove you can drive. Steal a car and bring it to my chop shop."',
    steps: [
      { kind: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { kind: 'goto', pos: CHOP_SHOP, radius: 8, text: 'Deliver the car to the chop shop' },
    ],
  },
  {
    title: 'The Pickup', reward: 700,
    intro: 'Mara: "A package is waiting at the end of the pier. Fetch it — on foot, no wheels on the boards — and bring it to my garage."',
    steps: [
      { kind: 'goto', pos: PIER, radius: 6, text: 'Get to the end of the pier' },
      { kind: 'pickup', pos: PIER, radius: 3, text: 'Grab the package (walk over it)' },
      { kind: 'goto', pos: GARAGE, radius: 8, text: 'Deliver the package to Mara\u2019s garage' },
    ],
  },
  {
    title: 'Hot Pursuit', reward: 900,
    intro: 'Mara: "The cops made the handoff. They\u2019re on you — three stars. Lose them. Stay out of sight and the heat dies down."',
    steps: [
      { kind: 'loseWanted', text: 'Lose the wanted level (stay away from police)' },
    ],
  },
  {
    title: 'Night Run', reward: 1500,
    intro: 'Mara: "Three drops, one night, no excuses. Seventy-five seconds each. The clock is already running."',
    steps: [
      { kind: 'timed', pos: { x: -252, z: -180 }, radius: 8, seconds: 75, text: 'Drop 1/3: the north docks' },
      { kind: 'timed', pos: { x: 252, z: 108 }, radius: 8, seconds: 75, text: 'Drop 2/3: the east marina' },
      { kind: 'timed', pos: { x: -36, z: 252 }, radius: 8, seconds: 75, text: 'Drop 3/3: the beachfront' },
    ],
  },
  {
    title: 'The Big Score', reward: 3000,
    intro: 'Mara: "The Solara Bay Bank vault. We crack it, we run, and we never look back. This is the one, Rook."',
    steps: [
      { kind: 'goto', pos: BANK, radius: 8, text: 'Get to the Solara Bay Bank' },
      { kind: 'wait', seconds: 8, text: 'Cracking the vault… stay close!' },
      { kind: 'escape', pos: SAFEHOUSE, radius: 8, text: 'ESCAPE! Reach the safehouse with the cops on you' },
    ],
  },
];

export function createMissions(ctx) {
  const m = {
    index: 0, step: 0, active: false, done: false,
    timer: 0, marker: null, markerPos: null, markerLight: null,
    pickups: [],
  };

  // Glowing objective beacon.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 12, 1, true), beaconMat);
  beacon.visible = false;
  ctx.scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.5, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ctx.scene.add(ring);
  m.marker = beacon; m.ring = ring;

  // Cash pickups: green glowing crates worth $50.
  const pickupGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const pickupMat = new THREE.MeshLambertMaterial({ color: 0x2ecc40, emissive: 0x1a8a2a, emissiveIntensity: 0.9 });
  const spots = [
    [-108, -108], [108, 108], [-252, 36], [252, -36], [36, 252], [-36, -252],
    [180, -180], [-180, 108], [108, -252], [-108, 252], [216, 216], [-216, -216],
  ];
  for (const [x, z] of spots) {
    const mesh = new THREE.Mesh(pickupGeo, pickupMat);
    mesh.position.set(x, 0.9, z);
    mesh.castShadow = true;
    ctx.scene.add(mesh);
    m.pickups.push({ mesh, x, z, taken: 0 });
  }

  m.current = () => MISSIONS[m.index];
  m.stepDef = () => m.current()?.steps[m.step];

  m.objectiveText = () => {
    if (m.done) return 'All jobs done — Solara Bay is yours, Rook.';
    if (!m.active) return 'Press N to start the next job';
    const s = m.stepDef();
    if (!s) return '';
    const dist = m.markerPos ? Math.round(Math.hypot(ctx.playerPos().x - m.markerPos.x, ctx.playerPos().z - m.markerPos.z)) : 0;
    return `${m.current().title}: ${s.text}${m.markerPos ? ` (${dist}m)` : ''}`;
  };

  function showMarker(pos) {
    m.markerPos = pos;
    beacon.position.set(pos.x, 15, pos.z);
    beacon.visible = true;
    ring.position.set(pos.x, 0.15, pos.z);
    ring.visible = true;
  }
  function hideMarker() {
    m.markerPos = null;
    beacon.visible = false;
    ring.visible = false;
  }

  m.startMission = (i) => {
    m.index = i; m.step = 0; m.active = true; m.done = false;
    const mission = m.current();
    ctx.hud?.toast(mission.intro, 6);
    ctx.hud?.toast(`Job ${i + 1}/5: ${mission.title} — $${mission.reward}`, 5);
    ctx.audio?.jingle();
    m.beginStep();
  };

  m.beginStep = () => {
    const s = m.stepDef();
    if (!s) { m.completeMission(); return; }
    if (s.kind === 'goto' || s.kind === 'timed' || s.kind === 'escape') showMarker(s.pos);
    else hideMarker();
    if (s.kind === 'timed') { m.timer = s.seconds; ctx.hud?.toast(`Timed drop — ${s.seconds} seconds!`, 3); }
    if (s.kind === 'wait') m.timer = s.seconds;
    if (s.kind === 'escape') ctx.police?.setWanted(4);
    if (s.kind === 'loseWanted' || (m.index === 2 && m.step === 0)) ctx.police?.setWanted(3);
    ctx.hud?.toast(s.text, 4);
  };

  m.completeStep = () => {
    ctx.audio?.chime();
    m.step++;
    m.beginStep();
  };

  m.completeMission = () => {
    const mission = m.current();
    ctx.cash += mission.reward;
    ctx.hud?.toast(`Job complete: ${mission.title} — +$${mission.reward}`, 6);
    ctx.audio?.jingle();
    ctx.saveGame?.();
    m.active = false;
    m.index++;
    hideMarker();
    if (m.index >= MISSIONS.length) {
      m.done = true;
      ctx.hud?.toast('You did it, Rook. Solara Bay is yours.', 8);
    } else {
      ctx.hud?.toast('Press N for the next job', 5);
    }
  };

  m.failStep = (why) => {
    ctx.hud?.toast(why, 5);
    ctx.audio?.fail();
    m.step = 0;
    m.beginStep();
  };

  m.update = (dt) => {
    // Beacon pulse.
    if (beacon.visible) {
      beaconMat.opacity = 0.4 + Math.sin(ctx.time * 3) * 0.18;
      ring.scale.setScalar(1 + Math.sin(ctx.time * 3) * 0.12);
    }
    // Cash pickups bob + spin; collect on touch.
    const pp = ctx.playerPos();
    for (const pk of m.pickups) {
      if (pk.taken > 0) { pk.taken -= dt; pk.mesh.visible = pk.taken <= 0; if (pk.taken <= 0) pk.mesh.position.y = 0.9; continue; }
      pk.mesh.rotation.y += dt * 1.5;
      pk.mesh.position.y = 0.9 + Math.sin(ctx.time * 2 + pk.x) * 0.15;
      if (Math.hypot(pp.x - pk.x, pp.z - pk.z) < 3) {
        pk.taken = 60;
        pk.mesh.visible = false;
        ctx.cash += 50;
        ctx.hud?.toast('+$50 cash', 2);
        ctx.audio?.chime();
      }
    }
    if (!m.active || m.done) return;
    const s = m.stepDef();
    if (!s) return;
    const d = m.markerPos ? Math.hypot(pp.x - m.markerPos.x, pp.z - m.markerPos.z) : 9999;
    if (s.kind === 'steal') {
      if (!ctx.player.onFoot) m.completeStep();
    } else if (s.kind === 'goto' || s.kind === 'pickup') {
      if (d < s.radius) m.completeStep();
    } else if (s.kind === 'timed') {
      m.timer -= dt;
      if (d < s.radius) m.completeStep();
      else if (m.timer <= 0) m.failStep('Too slow! The drop went cold — try again.');
    } else if (s.kind === 'wait') {
      m.timer -= dt;
      if (d > 14) { m.failStep('You left the vault! The crack failed — start over.'); return; }
      if (m.timer <= 0) { ctx.police?.setWanted(4); m.completeStep(); }
    } else if (s.kind === 'escape') {
      if (d < s.radius) m.completeStep();
    } else if (s.kind === 'loseWanted') {
      if (ctx.wanted <= 0) m.completeStep();
    }
  };

  return m;
}
