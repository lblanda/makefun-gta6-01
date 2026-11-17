// shots.js — deterministic staging for the four screenshots (?shot=cover,
// downtown, mission, beach). Skips the menu, places the player, cars and
// police, sets the wanted level and the time of day, so each shot is a real
// render of the game in a reproducible state.
import { makeCar } from './vehicles.js';
import { mulberry32 } from './utils.js';

function putPlayerInCar(ctx, type, x, z, heading, color) {
  const car = makeCar(ctx, type, x, z, heading, color);
  car.stolen = false;
  ctx.cars.push(car);
  ctx.player.enterCar(car);
  return car;
}

export function applyShot(ctx, name, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  ctx.hideMenu();
  ctx.audio?.init();
  ctx.state = 'playing';
  ctx.dayTime = 10.2 * 3600; // late morning sun
  ctx.updateSun();

  if (name === 'cover') {
    // Police chase through downtown: player in a coupe, 3 stars, cruisers
    // ahead and alongside in frame, mission objective on the HUD.
    ctx.missions.startMission(0);
    ctx.missions.step = 1;
    ctx.missions.beginStep();
    putPlayerInCar(ctx, 'coupe', 36, 60, Math.PI, 0xc03070);
    ctx.player.car.speed = 16;
    ctx.cam.yaw = Math.PI; ctx.cam.pitch = 0.22; ctx.cam.dist = 9.5;
    // Two cruisers ahead (roadblock closing in) and one chasing from behind.
    ctx.police.setWanted(3);
    const pp = ctx.playerPos();
    for (const [ox, oz, head] of [[-12, -28, 0], [12, -44, 0], [0, 16, Math.PI]]) {
      const c = ctx.police.spawnCruiser();
      c.pos.set(pp.x + ox, 0, pp.z + oz);
      c.heading = head;
      c.speed = 30;
    }
    // Traffic ahead so the street reads alive.
    for (const [ox, oz, type] of [[-4, -70, 'sedan'], [4, -95, 'taxi']]) {
      const t = makeCar(ctx, type, pp.x + ox, pp.z + oz, Math.PI);
      t.driver = 'traffic'; ctx.cars.push(t); ctx.traffic.cars.push(t);
    }
    ctx.hud.toast('The cops are on you — lose them!', 30);
  } else if (name === 'downtown') {
    // On foot in the downtown core, traffic and pedestrians all around.
    ctx.missions.startMission(0);
    ctx.player.setPosition(-36, 44, Math.PI * 0.9);
    ctx.cam.yaw = Math.PI * 0.9; ctx.cam.pitch = 0.3; ctx.cam.dist = 9;
    for (let i = 0; i < 3; i++) {
      const car = makeCar(ctx, ['sedan', 'taxi', 'van'][i], -36 + (i - 1) * 8, 20 + i * 12, Math.PI);
      car.driver = 'traffic';
      ctx.cars.push(car);
      ctx.traffic.cars.push(car);
    }
    ctx.hud.toast('Mara Voss: "New in town, Rook? Prove you can drive."', 30);
  } else if (name === 'mission') {
    // Mission in progress: driving west along the beachfront road straight
    // at the chop shop, beacon dead ahead.
    ctx.missions.startMission(0);
    ctx.missions.step = 1;
    ctx.missions.beginStep();
    putPlayerInCar(ctx, 'sedan', -36, 180, -Math.PI / 2, 0x3050b0);
    ctx.cam.yaw = -Math.PI / 2; ctx.cam.pitch = 0.3; ctx.cam.dist = 11;
    ctx.player.car.speed = 16;
    ctx.hud.toast('Job 1/5: Wheels — $400', 30);
  } else if (name === 'beach') {
    // Sunset drive along the beach road, ocean on the right.
    ctx.dayTime = 17.8 * 3600;
    ctx.updateSun();
    ctx.missions.startMission(3);
    putPlayerInCar(ctx, 'coupe', -120, 324, Math.PI / 2, 0x20b0c0);
    ctx.cam.yaw = Math.PI / 2; ctx.cam.pitch = 0.28; ctx.cam.dist = 11;
    ctx.player.car.speed = 22;
    // Traffic on the same road but far enough away that nothing shoves the
    // player off the asphalt during the shot.
    const t1 = makeCar(ctx, 'sedan', 180, 324, Math.PI / 2);
    t1.driver = 'traffic'; ctx.cars.push(t1); ctx.traffic.cars.push(t1);
    const t2 = makeCar(ctx, 'van', -280, 324, -Math.PI / 2);
    t2.driver = 'traffic'; ctx.cars.push(t2); ctx.traffic.cars.push(t2);
    ctx.hud.toast('Night Run: three drops, 75 seconds each', 30);
  } else {
    ctx.missions.startMission(0);
    ctx.player.setPosition(0, 40, Math.PI);
    ctx.cam.yaw = Math.PI; ctx.cam.pitch = 0.3; ctx.cam.dist = 9;
  }
  ctx.playerPosChanged?.();
  return name;
}
