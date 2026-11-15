// The charge: one bomb, carried by one attacker, planted at a site, defused by a
// defender or detonated on its timer. The module owns the state and the blinking
// bomb mesh; the round loop drives the channels (plant 3 s, defuse 5 s, detonation
// 35 s) and reads the events it returns.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const DETONATE_TIME = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.26, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.6, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  light.position.set(0.14, 0.16, 0);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.05, 0.32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) }),
  );
  group.add(body, light, stripe);
  group.visible = false;
  scene.add(group);

  const bomb = {
    state: 'none',
    site: null,
    carrier: null,
    targetSite: null,
    plantProgress: 0,
    defuseProgress: 0,
    timer: 0,
    beepAt: 0,
    position: new THREE.Vector3(),
  };

  function placeAt(x, z) {
    bomb.position.set(x, 0.14, z);
    group.position.copy(bomb.position);
    group.visible = true;
  }

  bomb.reset = function reset(carrierId, targetSite) {
    bomb.state = 'carried';
    bomb.site = null;
    bomb.carrier = carrierId;
    bomb.targetSite = targetSite;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.timer = 0;
    group.visible = false;
  };
  bomb.clear = function clear() {
    bomb.state = 'none';
    bomb.site = null;
    bomb.carrier = null;
    bomb.targetSite = null;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.timer = 0;
    group.visible = false;
  };
  bomb.plantChannel = function plantChannel(dt, atSite) {
    if (bomb.state !== 'carried') return null;
    if (!atSite) {
      bomb.plantProgress = 0;
      return null;
    }
    bomb.plantProgress += dt;
    if (bomb.plantProgress >= PLANT_TIME) {
      bomb.state = 'planted';
      bomb.site = bomb.targetSite;
      bomb.timer = DETONATE_TIME;
      bomb.plantProgress = 0;
      bomb.beepAt = 0;
      return 'planted';
    }
    return null;
  };
  bomb.defuseChannel = function defuseChannel(dt, atBomb) {
    if (bomb.state !== 'planted') return null;
    if (!atBomb) {
      bomb.defuseProgress = 0;
      return null;
    }
    bomb.defuseProgress += dt;
    if (bomb.defuseProgress >= DEFUSE_TIME) {
      bomb.state = 'defused';
      bomb.defuseProgress = 0;
      return 'defused';
    }
    return null;
  };
  bomb.step = function step(dt, plantedSite) {
    if (bomb.state === 'planted') {
      bomb.timer -= dt;
      bomb.beepAt -= dt;
      const site = plantedSite;
      placeAt(site.x, site.z);
      const fast = bomb.timer < 10;
      light.material.color.setHex(bomb.beepAt <= 0 ? 0xffffff : 0xe5484d);
      if (bomb.beepAt <= 0) bomb.beepAt = fast ? 0.35 : 0.8;
      if (bomb.timer <= 0) {
        bomb.state = 'detonated';
        return 'detonated';
      }
    }
    return null;
  };
  bomb.isPlanted = function isPlanted() {
    return bomb.state === 'planted';
  };

  return bomb;
}
