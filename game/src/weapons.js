// The arsenal. One table owns every weapon's numbers; createWeapon builds the view model
// and the fire/reload/spread behaviour for whichever entry the player holds. Damage falls
// with range; headshots multiply it. Grenades are thrown, not hitscan (see combat.js).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sparrow: {
    name: 'P9 Sparrow', kind: 'pistol', price: 0, auto: false, gap: 0.16, mag: 12, reserve: 36,
    reload: 1.4, damage: 34, headMult: 3, spreadStill: 0.004, spreadMove: 0.03, range: 40, kick: 0.008,
  },
  kestrel: {
    name: 'Kestrel-9 SMG', kind: 'smg', price: 1500, auto: true, gap: 0.08, mag: 32, reserve: 96,
    reload: 1.9, damage: 26, headMult: 3, spreadStill: 0.006, spreadMove: 0.036, range: 34, kick: 0.007,
  },
  longshot: {
    name: 'VK-47 Longshot', kind: 'rifle', price: 2700, auto: true, gap: 0.1, mag: 30, reserve: 90,
    reload: 2.0, damage: 36, headMult: 4, spreadStill: 0.0022, spreadMove: 0.028, range: 60, kick: 0.011,
  },
  mule: {
    name: 'Mule-12', kind: 'shotgun', price: 1200, auto: false, gap: 0.75, mag: 6, reserve: 24,
    reload: 2.4, damage: 14, headMult: 2, pellets: 8, spreadStill: 0.05, spreadMove: 0.07, range: 18, kick: 0.03,
  },
  heron: {
    name: 'Heron .50', kind: 'sniper', price: 4750, auto: false, gap: 1.1, mag: 5, reserve: 15,
    reload: 2.8, damage: 110, headMult: 2, spreadStill: 0.0004, spreadMove: 0.05, range: 90, kick: 0.045, scoped: true,
  },
};

export const GRENADES = {
  frag: { name: 'Frag grenade', price: 300, radius: 6, damage: 120 },
  flash: { name: 'Flashbang', price: 200, radius: 14, blind: 3.5 },
};

export const ARMOR_PRICE = 650;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), accent);
  sight.position.set(0, 0.075, -0.1);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { id: 'longshot', mag: 30, reserve: 90, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, aiming: false };
  let def = WEAPONS.longshot;

  function applyDef() {
    def = WEAPONS[state.id];
    // Long barrels read as rifles, short ones as pistols: scale the view model by kind.
    const long = def.kind === 'rifle' || def.kind === 'sniper';
    const small = def.kind === 'pistol';
    model.scale.set(small ? 0.7 : 1, small ? 0.7 : 1, long ? 1.25 : small ? 0.7 : 1);
    sight.visible = def.kind !== 'pistol';
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const aim = state.aiming && def.scoped ? 0.55 : 1;
    model.position.set(0.24 * aim, -0.2 * aim - (state.aiming && def.scoped ? 0.02 : 0), -0.42 + state.kick);
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 6;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() { return def; },
    step,
    equip(id, keepAmmo) {
      state.id = id;
      applyDef();
      if (!keepAmmo) {
        state.mag = def.mag;
        state.reserve = def.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.2);
      const base = def.spreadStill + moving * def.spreadMove;
      return state.aiming ? base * 0.45 : base;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
