// save.js — localStorage save/load for Solara Bay: cash, mission progress,
// player position and health, wanted level and time of day.
const KEY = 'solara-bay-save-v1';

export function saveGame(ctx) {
  try {
    const p = ctx.playerPos();
    const data = {
      cash: Math.floor(ctx.cash),
      missionIndex: ctx.missions.index,
      missionActive: ctx.missions.active,
      x: p.x, z: p.z,
      health: Math.round(ctx.health),
      wanted: ctx.wanted,
      dayTime: Math.round(ctx.dayTime),
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.x !== 'number') return null;
    data.missionIndex = Math.max(0, Math.min(4, data.missionIndex | 0));
    return data;
  } catch { return null; }
}

export function hasSave() { return loadGame() !== null; }

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
