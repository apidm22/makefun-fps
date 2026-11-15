// The yard, built from MAP: every box is a mesh, a Box3 collider for movement and a
// surface bullets stop on. Lighting is one warm key sun low in the west, a cool sky
// fill and amber lamps over the two sites, so the map reads at a glance: orange for
// attack, teal for defence. Site markers are a glowing ring, a light beam and a canvas
// letter, all from code — no textures are loaded.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ember' || name === 'amber' ? 0.5 : 0.92,
      metalness: name === 'metal' ? 0.35 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of MAP.boxes) box(w, h, d, x, y, z, mat);

  // Site markers: a ring on the ground, a beam to the sky and a floating letter.
  const siteMarkers = {};
  for (const key of Object.keys(MAP.sites)) {
    const site = MAP.sites[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.0, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(site.x, 3.5, site.z);
    group.add(beam);
    const letter = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(site.label, PALETTE.ember), transparent: true, depthWrite: false }));
    letter.scale.set(2.2, 2.2, 1);
    letter.position.set(site.x, 3.4, site.z);
    group.add(letter);
    siteMarkers[key] = { ring, beam, letter };
  }

  // Light: dusk sky, a low warm key from the west, a cool fill, and amber site lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6d94'), new THREE.Color(PALETTE.canvas), 1.1);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.8);
  key.position.set(-18, 16, 10);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d9cc4'), 0.7);
  fill.position.set(14, 10, 14);
  scene.add(fill);
  for (const siteKey of Object.keys(MAP.sites)) {
    const site = MAP.sites[siteKey];
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.amber), 22, 16, 1.6);
    lamp.position.set(site.x, 4.6, site.z);
    scene.add(lamp);
  }

  return { colliders, shootables, group, siteMarkers };
}
