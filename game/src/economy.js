// The economy: money earned each round and spent in the buy menu. CS-style rewards with
// a loss streak that softens the blow, so a lost round never ends the match on its own.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';

export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_STREAK_CAP = 3400;
export const PLANT_REWARD = 300;
export const START_MONEY = 800;
export const MAX_MONEY = 16000;

export function createEconomy() {
  const state = { money: START_MONEY, lossStreak: 0, frags: 0, flashes: 0, armor: 0 };

  function catalog() {
    const items = [];
    for (const [id, def] of Object.entries(WEAPONS)) items.push({ id, name: def.name, price: def.price, kind: 'weapon' });
    items.push({ id: 'frag', name: GRENADES.frag.name, price: GRENADES.frag.price, kind: 'grenade' });
    items.push({ id: 'flash', name: GRENADES.flash.name, price: GRENADES.flash.price, kind: 'grenade' });
    items.push({ id: 'armor', name: 'Kevlar vest', price: ARMOR_PRICE, kind: 'armor' });
    return items;
  }

  return {
    state,
    catalog,
    canAfford(price) { return state.money >= price; },
    buy(id) {
      const item = catalog().find((entry) => entry.id === id);
      if (!item || state.money < item.price) return null;
      state.money -= item.price;
      if (item.kind === 'grenade') {
        if (id === 'frag') { if (state.frags >= 2) { state.money += item.price; return null; } state.frags += 1; }
        else { if (state.flashes >= 2) { state.money += item.price; return null; } state.flashes += 1; }
      } else if (item.kind === 'armor') {
        if (state.armor >= 50) { state.money += item.price; return null; }
        state.armor = 50;
      }
      return item;
    },
    refund(price) { state.money = Math.min(MAX_MONEY, state.money + price); },
    addKill() { state.money = Math.min(MAX_MONEY, state.money + KILL_REWARD); },
    addPlant() { state.money = Math.min(MAX_MONEY, state.money + PLANT_REWARD); },
    roundEnd(won) {
      if (won) {
        state.money = Math.min(MAX_MONEY, state.money + WIN_REWARD);
        state.lossStreak = 0;
      } else {
        state.lossStreak += 1;
        const bonus = Math.min(LOSS_STREAK_CAP - LOSS_REWARD, (state.lossStreak - 1) * LOSS_STREAK_BONUS);
        state.money = Math.min(MAX_MONEY, state.money + LOSS_REWARD + Math.max(0, bonus));
      }
      state.frags = 0;
      state.flashes = 0;
    },
    reset() {
      state.money = START_MONEY;
      state.lossStreak = 0;
      state.frags = 0;
      state.flashes = 0;
      state.armor = 0;
    },
  };
}
