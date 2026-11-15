// Weapons: four guns and a flash grenade, each with its price, damage, fire rate,
// magazine, spread curve and view model. One weapon is equipped at a time; switching
// takes a moment, reloading takes longer, and firing on the move opens the spread wide
// — stopping to aim pays. Damage falls off past the weapon's range.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, auto: false,
    damage: 26, headMult: 4, fireGap: 0.16, reloadTime: 1.2,
    magSize: 12, reserve: 36, spreadStill: 0.004, spreadMove: 0.02,
    range: 40, falloff: 0.5, kick: 0.006, tracer: 0xd8c9a8,
  },
  smg: {
    id: 'smg', name: 'Hawk-9 SMG', price: 1500, auto: true,
    damage: 22, headMult: 4, fireGap: 0.07, reloadTime: 1.7,
    magSize: 30, reserve: 90, spreadStill: 0.008, spreadMove: 0.03,
    range: 30, falloff: 0.4, kick: 0.005, tracer: 0xffd27a,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', price: 2700, auto: true,
    damage: 34, headMult: 4, fireGap: 0.1, reloadTime: 2.1,
    magSize: 30, reserve: 90, spreadStill: 0.0022, spreadMove: 0.028,
    range: 60, falloff: 0.75, kick: 0.009, tracer: 0xffb45e,
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', price: 4750, auto: false,
    damage: 80, headMult: 2.5, fireGap: 0.85, reloadTime: 2.8,
    magSize: 10, reserve: 20, spreadStill: 0.0008, spreadMove: 0.04,
    range: 90, falloff: 0.9, kick: 0.02, tracer: 0x9fd8ff, zoom: true,
  },
};

export const GRENADE_PRICE = 200;
export const ARMOR_PRICE = 650;

function buildModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), steel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), dark);
    grip.position.set(0, -0.07, 0.08);
    model.add(slide, grip);
    model.position.set(0.2, -0.18, -0.32);
  } else if (def.id === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), steel);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), dark);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.11, -0.05);
    model.add(receiver, barrel, mag);
    model.position.set(0.22, -0.19, -0.4);
  } else if (def.id === 'dmr') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), steel);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), dark);
    barrel.position.set(0, 0.03, -0.5);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.26), dark);
    stock.position.set(0, -0.02, 0.36);
    model.add(receiver, barrel, scope, stock);
    model.position.set(0.24, -0.2, -0.44);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.44), steel);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), dark);
    barrel.position.set(0, 0.025, -0.4);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), accent);
    mag.position.set(0, -0.1, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), dark);
    stock.position.set(0, -0.02, 0.32);
    model.add(receiver, barrel, mag, stock);
    model.position.set(0.24, -0.2, -0.42);
  }
  return model;
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildModel(def);
    model.visible = false;
    model.scale.setScalar(0.72);
    camera.add(model);
    models[def.id] = model;
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.16, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.24, -0.14, -0.6);
  camera.add(flashLight);

  const state = {
    equipped: 'pistol',
    mag: WEAPONS.pistol.magSize,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    switchLeft: 0,
    flash: 0,
    kick: 0,
    zoomed: false,
    ammo: { pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve } },
  };

  function current() {
    return WEAPONS[state.equipped];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.equipped];
    model.position.z = model.userData.restZ - state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 * (state.flash / 0.06) : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = current();
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        saveAmmo();
      }
    }
  }

  function saveAmmo() {
    state.ammo[state.equipped] = { mag: state.mag, reserve: state.reserve };
  }

  function give(id) {
    const def = WEAPONS[id];
    if (!state.ammo[id]) state.ammo[id] = { mag: def.magSize, reserve: def.reserve };
  }

  function equip(id) {
    if (!WEAPONS[id] || state.equipped === id || state.reloadLeft > 0) return false;
    saveAmmo();
    models[state.equipped].visible = false;
    state.equipped = id;
    const saved = state.ammo[id];
    state.mag = saved.mag;
    state.reserve = saved.reserve;
    state.switchLeft = 0.35;
    state.cooldown = Math.max(state.cooldown, 0.15);
    state.zoomed = false;
    const model = models[id];
    model.visible = true;
    if (model.userData.restZ === undefined) model.userData.restZ = model.position.z;
    return true;
  }

  function reset() {
    for (const model of Object.values(models)) model.visible = false;
    state.ammo = { pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve } };
    state.equipped = 'pistol';
    state.mag = WEAPONS.pistol.magSize;
    state.reserve = WEAPONS.pistol.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.switchLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.zoomed = false;
    models.pistol.visible = true;
    models.pistol.userData.restZ = models.pistol.position.z;
  }

  models.pistol.visible = true;
  models.pistol.userData.restZ = models.pistol.position.z;

  return {
    state,
    step,
    current,
    give,
    equip,
    reset,
    owned() {
      return Object.keys(state.ammo);
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    pullTrigger() {
      const def = current();
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = def.id === 'dmr' ? 0.09 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = current();
      if (state.reloadLeft > 0 || state.mag === def.magSize || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed) {
      const def = current();
      const moving = Math.min(1, speed / 5.4);
      const base = def.spreadStill + moving * def.spreadMove;
      return state.zoomed ? base * 0.35 : base;
    },
    damageAt(distance) {
      const def = current();
      const beyond = Math.max(0, distance - def.range);
      return def.damage * Math.max(def.falloff, 1 - beyond / 120);
    },
    setZoom(on) {
      state.zoomed = on && current().zoom === true;
    },
  };
}
