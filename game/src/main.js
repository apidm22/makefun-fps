// Emberline: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; the round machine (buy → live → end) drives everything else. The
// player is Vanguard: plant the charge at A or B, or eliminate Sentinel. ?shot=start
// |play|plant|end with &seed=N sets up a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';
import { mulberry32, pick } from './rng.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createRounds, BUY_TIME, ROUND_TIME, END_TIME, KILL_MONEY, OBJECTIVE_MONEY } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
camera.layers.enable(1);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const effects = createEffects(scene);
const shootables = [...world.shootables];
const combat = createCombat(scene, shootables, effects);
const bots = createBots(scene, world, combat, effects, audio, random);
for (const mesh of bots.allHitMeshes()) shootables.push(mesh);
const bomb = createBomb(scene);
const rounds = createRounds();
const hud = createHud();

// The player: a Vanguard ref the bots can shoot, with an invisible hitbox on layer 1.
const playerRef = { id: 'player', name: 'You', team: 'vanguard', kind: 'player', health: 100, armor: 0, alive: true };
const hitboxMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
hitboxMaterial.colorWrite = false;
const hitbox = new THREE.Group();
const hitTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), hitboxMaterial);
hitTorso.position.y = 1.08;
const hitHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hitboxMaterial);
hitHead.position.y = 1.6;
hitTorso.userData.target = { ref: playerRef, part: 'torso' };
hitHead.userData.target = { ref: playerRef, part: 'head' };
hitTorso.layers.set(1);
hitHead.layers.set(1);
hitbox.add(hitTorso, hitHead);
scene.add(hitbox);
shootables.push(hitTorso, hitHead);

const player = createPlayer(world.colliders, { x: 0, z: 16.5, yaw: 0 });
const weaponSet = createWeaponSet(camera);
const input = createInput(renderer.domElement, onLockChange);

const direction = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const flashPos = new THREE.Vector3();
const flashDir = new THREE.Vector3();

let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let playerMoney = 800;
let grenades = 0;
let killsThisRound = {};
let planters = [];
let defusers = [];
let botMoney = {};
let botOwned = {};
let grenadeEntities = [];
let playerBlindUntil = 0;
let prevFiring = false;
let stepDistance = 0;
let lastFootX = 0;
let lastFootZ = 0;
let fovTarget = 74;

function wallets() {
  const list = [{ id: 'player', team: 'vanguard', money: playerMoney }];
  for (const bot of bots.bots) list.push({ id: bot.ref.id, team: bot.ref.team, money: botMoney[bot.ref.id] || 800 });
  return list;
}

function syncWallets(list) {
  for (const wallet of list) {
    if (wallet.id === 'player') playerMoney = wallet.money;
    else botMoney[wallet.id] = wallet.money;
  }
}

function vanguardAlive() {
  if (playerRef.alive) return true;
  return bots.bots.some((b) => b.ref.team === 'vanguard' && b.ref.alive);
}

function sentinelAlive() {
  return bots.bots.some((b) => b.ref.team === 'sentinel' && b.ref.alive);
}

function aliveBots(team) {
  return bots.bots.filter((b) => b.ref.team === team && b.ref.alive);
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  hitbox.position.set(body.position.x, body.position.y, body.position.z);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function setupRound() {
  rounds.startRound();
  killsThisRound = {};
  planters = [];
  defusers = [];
  grenadeEntities = [];
  playerBlindUntil = 0;
  playerRef.health = 100;
  playerRef.armor = 0;
  playerRef.alive = true;
  weaponSet.reset();
  grenades = 0;

  const assignments = {};
  const lanes = ['A', 'mid', 'B'];
  const vanguardBots = bots.bots.filter((b) => b.ref.team === 'vanguard');
  const sentinelBots = bots.bots.filter((b) => b.ref.team === 'sentinel');
  vanguardBots.forEach((bot, i) => {
    const money = botMoney[bot.ref.id] ?? 800;
    const weapon = rounds.buyForBot({ money, weaponId: bot.weaponId });
    botMoney[bot.ref.id] = money - (weapon !== bot.weaponId ? WEAPONS[weapon].price : 0);
    if (botMoney[bot.ref.id] >= 650 && random() < 0.4) {
      botMoney[bot.ref.id] -= 650;
      assignments[bot.ref.id] = { armor: true };
    } else {
      assignments[bot.ref.id] = { armor: false };
    }
    assignments[bot.ref.id] = {
      ...assignments[bot.ref.id],
      spawn: MAP.spawns.vanguard[i % MAP.spawns.vanguard.length],
      yaw: 0,
      weapon,
      state: 'advance',
      lane: lanes[i % lanes.length],
    };
  });
  const holdSlots = [
    { node: MAP.holds.A[0], yaw: Math.PI },
    { node: MAP.holds.A[1], yaw: Math.PI },
    { node: MAP.holds.B[0], yaw: Math.PI },
    { node: MAP.holds.mid[0], yaw: Math.PI },
  ];
  sentinelBots.forEach((bot, i) => {
    const money = botMoney[bot.ref.id] ?? 800;
    const weapon = rounds.buyForBot({ money, weaponId: bot.weaponId });
    botMoney[bot.ref.id] = money - (weapon !== bot.weaponId ? WEAPONS[weapon].price : 0);
    const slot = holdSlots[i % holdSlots.length];
    const node = nodePosition(slot.node[0]);
    assignments[bot.ref.id] = {
      spawn: MAP.spawns.sentinel[i % MAP.spawns.sentinel.length],
      yaw: Math.PI,
      weapon,
      armor: botMoney[bot.ref.id] >= 650 && random() < 0.3,
      state: 'hold',
      lane: 'mid',
      holdNode: slot.node[0],
      holdYaw: slot.yaw,
    };
    bot.holdYaw = slot.yaw;
    bot.position.set(node.x, 0, node.z);
  });
  bots.spawnRound(assignments);
  for (const bot of sentinelBots) {
    const slot = holdSlots[bots.bots.indexOf(bot) - 3];
    if (slot) {
      const node = nodePosition(slot.node[0]);
      bot.position.set(node.x, 0, node.z);
      bot.group.position.copy(bot.position);
    }
  }

  const spawn = MAP.spawns.vanguard[1];
  player.respawn(spawn[0], spawn[1], 0);
  syncCamera();

  const carrier = pickCarrier();
  const targetSite = pick(random, ['A', 'B']);
  bomb.reset(carrier, targetSite);
  hud.setBomb(carrier === 'player' ? `CHARGE — PLANT AT ${targetSite} (HOLD E)` : `CHARGE WITH ${carrierName(carrier)} — TARGET ${targetSite}`);
  hud.setScore(rounds.score.vanguard, rounds.score.sentinel, rounds.number);
  hud.setMoney(playerMoney);
  hud.setGrenades(grenades);
  hud.setHealth(playerRef.health, playerRef.armor);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, weaponSet.current().name);
  hud.showBuy(true);
  updateBuyMenu();
  lastFootX = player.state.position.x;
  lastFootZ = player.state.position.z;
}

function nodePosition(id) {
  const node = MAP.waypoints.find((w) => w.id === id);
  return node ? { x: node.x, z: node.z } : { x: 0, z: 0 };
}

function carrierName(carrierId) {
  if (carrierId === 'player') return 'YOU';
  const bot = bots.bots.find((b) => b.ref.id === carrierId);
  return bot ? bot.ref.name.toUpperCase() : 'VANGUARD';
}

function pickCarrier() {
  if (shot) return 'vanguard-0';
  const candidates = ['player'];
  for (const bot of aliveBots('vanguard')) candidates.push(bot.ref.id);
  return pick(random, candidates);
}

function updateBuyMenu() {
  const owned = weaponSet.owned();
  const items = Object.values(WEAPONS).map((def) => ({
    id: def.id,
    price: def.price,
    owned: owned.includes(def.id),
    affordable: playerMoney >= def.price,
  }));
  items.push({ id: 'grenade', price: GRENADE_PRICE, owned: grenades >= 2, affordable: playerMoney >= GRENADE_PRICE && grenades < 2 });
  items.push({ id: 'armor', price: ARMOR_PRICE, owned: playerRef.armor > 0, affordable: playerMoney >= ARMOR_PRICE && playerRef.armor <= 0 });
  hud.buyState(items);
}

function buy(itemId) {
  if (rounds.phase !== 'buy') return;
  if (WEAPONS[itemId]) {
    const def = WEAPONS[itemId];
    if (weaponSet.owned().includes(itemId)) {
      weaponSet.equip(itemId);
    } else if (playerMoney >= def.price) {
      playerMoney -= def.price;
      weaponSet.give(itemId);
      weaponSet.equip(itemId);
      audio.buy();
    } else {
      audio.denied();
    }
  } else if (itemId === 'grenade') {
    if (grenades < 2 && playerMoney >= GRENADE_PRICE) {
      playerMoney -= GRENADE_PRICE;
      grenades += 1;
      audio.buy();
    } else {
      audio.denied();
    }
  } else if (itemId === 'armor') {
    if (playerRef.armor <= 0 && playerMoney >= ARMOR_PRICE) {
      playerMoney -= ARMOR_PRICE;
      playerRef.armor = 50;
      audio.buy();
    } else {
      audio.denied();
    }
  }
  hud.setMoney(playerMoney);
  hud.setGrenades(grenades);
  hud.setHealth(playerRef.health, playerRef.armor);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, weaponSet.current().name);
  updateBuyMenu();
}

function onKill(killerRef, victimRef, head) {
  hud.killfeed(killerRef.name, victimRef.name, head);
  killsThisRound[killerRef.id] = (killsThisRound[killerRef.id] || 0) + 1;
  if (killerRef.id === 'player') {
    playerMoney += KILL_MONEY;
    hud.setMoney(playerMoney);
    audio.kill();
  }
  bots.updateHealthBarFor(victimRef);
  if (victimRef.id === 'player') {
    audio.hurt();
  }
}

function onDamage(ref, damage, part, attackerRef) {
  if (ref.id === 'player') {
    hud.setHealth(playerRef.health, playerRef.armor);
    audio.hurt();
  } else {
    const bot = bots.bots.find((b) => b.ref === ref);
    if (bot) bots.updateHealthBar(bot);
  }
}

function endRound(winner, reason) {
  if (rounds.phase === 'end') return;
  rounds.endRound(winner, reason);
  const list = wallets();
  rounds.awardMoney(list, winner, killsThisRound, planters, defusers);
  syncWallets(list);
  hud.setMoney(playerMoney);
  hud.setScore(rounds.score.vanguard, rounds.score.sentinel, rounds.number);
  hud.showBuy(false);
  hud.hideProgress();
  const winnerName = winner === 'vanguard' ? 'VANGUARD WINS' : 'SENTINEL WINS';
  hud.banner(winnerName, reason, 3600);
  audio.roundEnd(winner === 'vanguard');
  if (document.pointerLockElement) document.exitPointerLock();
  if (rounds.matchOver) {
    setTimeout(() => hud.showOverlay('matchEnd', `${rounds.score.vanguard} — ${rounds.score.sentinel}`, `${winnerName}.`), 1200);
  }
}

function shootPlayer(spread) {
  const def = weaponSet.current();
  if (!weaponSet.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  eyePos.copy(camera.position);
  const result = combat.fire(eyePos, direction, spread, random, def, playerRef, false);
  weaponSet.pullTrigger();
  player.recoil(def.kick, (random() * 2 - 1) * def.kick * 0.4);
  audio.shot(def.id === 'rifle' ? 'rifle' : def.id === 'smg' ? 'smg' : def.id === 'dmr' ? 'dmr' : 'pistol');
  bots.hear(player.state.position, 'vanguard');
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, def.name);
  if (result.hit && result.ref) {
    hud.hitMarker(result.killed, result.killed ? 400 : 90);
    audio.hit(result.part === 'head');
    if (result.killed) onKill(playerRef, result.ref, result.part === 'head');
    else onDamage(result.ref, result.damage, result.part, playerRef);
  }
  return true;
}

function throwGrenade() {
  if (grenades <= 0 || rounds.phase !== 'live' || !playerRef.alive) return;
  grenades -= 1;
  hud.setGrenades(grenades);
  camera.getWorldDirection(direction);
  grenadeEntities.push({
    pos: camera.position.clone(),
    vel: direction.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: 1.6,
    team: 'vanguard',
  });
  audio.step();
}

function detonateFlash(entity) {
  audio.flash();
  const light = new THREE.PointLight(new THREE.Color(0xffffff), 300, 26, 1.8);
  light.position.copy(entity.pos);
  scene.add(light);
  setTimeout(() => scene.remove(light), 350);
  for (const bot of bots.bots) {
    if (!bot.ref.alive) continue;
    const distance = Math.hypot(bot.position.x - entity.pos.x, bot.position.z - entity.pos.z);
    if (distance > 22) continue;
    eyePos.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    flashDir.copy(entity.pos).sub(eyePos).normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (facing.dot(flashDir) > 0.1 && combat.lineOfSight(eyePos, entity.pos, world.shootables)) {
      bot.blindedUntil = elapsed + 2.5;
    }
  }
  if (playerRef.alive) {
    camera.getWorldDirection(direction);
    flashDir.copy(entity.pos).sub(camera.position).normalize();
    const distance = camera.position.distanceTo(entity.pos);
    if (distance < 26 && direction.dot(flashDir) > 0.3 && combat.lineOfSight(camera.position, entity.pos, world.shootables)) {
      playerBlindUntil = elapsed + 1.4;
      hud.flash();
    }
  }
}

function stepGrenades(dt) {
  for (let i = grenadeEntities.length - 1; i >= 0; i -= 1) {
    const entity = grenadeEntities[i];
    entity.fuse -= dt;
    entity.vel.y -= 12 * dt;
    entity.pos.addScaledVector(entity.vel, dt);
    if (entity.pos.y < 0.08) {
      entity.pos.y = 0.08;
      entity.vel.y *= -0.35;
      entity.vel.x *= 0.7;
      entity.vel.z *= 0.7;
    }
    if (entity.fuse <= 0) {
      detonateFlash(entity);
      grenadeEntities.splice(i, 1);
    }
  }
}

function botApi() {
  return {
    now: elapsed,
    canFire: !shot,
    player: { ref: playerRef, position: player.state.position, eye: player.state.eye },
    bomb: { state: bomb.state, site: bomb.site, targetSite: bomb.targetSite, carrier: bomb.carrier },
    worldMeshes: world.shootables,
    heardShot(position, team) {
      bots.hear(position, team);
    },
    onDamage(ref, damage, part, attackerRef) {
      onDamage(ref, damage, part, attackerRef);
    },
    onKill(killerRef, victimRef, head) {
      onKill(killerRef, victimRef, head);
    },
    onPlantProgress(bot, progress) {
      const site = MAP.sites[bomb.targetSite];
      const atSite = Math.hypot(site.x - bot.position.x, site.z - bot.position.z) < 2.4;
      const event = bomb.plantChannel(FIXED_STEP, atSite);
      hud.showProgress('PLANTING CHARGE', bomb.plantProgress / PLANT_TIME);
      if (event === 'planted') {
        planters.push(bot.ref.id);
        hud.hideProgress();
        hud.banner('CHARGE PLANTED', `Sentinel must defuse at site ${bomb.site}`, 3000);
        hud.setBomb(`BOMB PLANTED AT ${bomb.site} — ${Math.ceil(bomb.timer)}s`);
        audio.plantBeep(true);
        bot.state = 'hold';
        bot.holdYaw = Math.PI;
      }
    },
    onDefuseProgress(bot, progress) {
      const site = MAP.sites[bomb.site];
      const atBomb = Math.hypot(site.x - bot.position.x, site.z - bot.position.z) < 2.6;
      const event = bomb.defuseChannel(FIXED_STEP, atBomb);
      hud.setBomb(`BOMB — DEFUSING ${Math.ceil((bomb.defuseProgress / DEFUSE_TIME) * 100)}%`);
      if (event === 'defused') {
        defusers.push(bot.ref.id);
        hud.banner('CHARGE DEFUSED', 'Sentinel holds the yard', 3000);
        audio.defuseBeep();
      }
    },
  };
}

function checkRoundEnd() {
  if (rounds.phase !== 'live') return;
  if (bomb.state === 'planted' && !sentinelAlive()) {
    endRound('vanguard', 'Sentinel eliminated — the charge will detonate.');
    return;
  }
  if (!vanguardAlive() && bomb.state !== 'planted') {
    endRound('sentinel', 'Vanguard eliminated.');
    return;
  }
  if (!sentinelAlive() && bomb.state !== 'planted') {
    endRound('vanguard', 'Sentinel eliminated.');
    return;
  }
  if (rounds.timer <= 0 && bomb.state !== 'planted') {
    endRound('sentinel', 'Time expired — the charge was never planted.');
  }
}

function step(dt) {
  elapsed += dt;
  const api = botApi();

  if (rounds.phase === 'buy') {
    rounds.phaseTime -= dt;
    if (rounds.phaseTime <= 0) {
      rounds.beginLive();
      hud.showBuy(false);
      hud.banner(`ROUND ${rounds.number}`, bomb.carrier === 'player' ? `Plant the charge at ${bomb.targetSite}` : `Follow ${carrierName(bomb.carrier)} to ${bomb.targetSite}`, 2200);
    }
  } else if (rounds.phase === 'live') {
    rounds.timer -= dt;
    const bombEvent = bomb.step(dt, bomb.site ? MAP.sites[bomb.site] : MAP.sites.A);
    if (bombEvent === 'detonated') {
      effects.explosion(bomb.position);
      audio.explosion();
      endRound('vanguard', 'The charge detonated.');
    } else if (bomb.state === 'planted') {
      hud.setBomb(`BOMB PLANTED AT ${bomb.site} — ${Math.ceil(bomb.timer)}s`);
    }
    checkRoundEnd();
  } else if (rounds.phase === 'end') {
    rounds.phaseTime -= dt;
    if (rounds.phaseTime <= 0) {
      if (rounds.matchOver) return;
      setupRound();
    }
  }

  if (rounds.phase === 'live' || rounds.phase === 'buy') {
    player.step(dt, input.state.keys);
    weaponSet.step(dt);
    bots.step(dt, api);
    stepGrenades(dt);
    effects.step(dt);

    const moved = Math.hypot(player.state.position.x - lastFootX, player.state.position.z - lastFootZ);
    stepDistance += moved;
    lastFootX = player.state.position.x;
    lastFootZ = player.state.position.z;
    if (stepDistance > 2.4 && playerRef.alive && player.groundSpeed() > 1) {
      stepDistance = 0;
      audio.step();
    }
  }

  const body = player.state;
  if (playerRef.alive) {
    const look = input.takeLook();
    const sensitivity = weaponSet.state.zoomed ? 0.5 : 1;
    player.look(look.x * sensitivity, look.y * sensitivity);
  }

  if (rounds.phase === 'live' && playerRef.alive && input.state.firing && !shot) {
    const def = weaponSet.current();
    const firingEdge = !prevFiring;
    if (def.auto || firingEdge) {
      if (weaponSet.ready() && elapsed > playerBlindUntil) {
        shootPlayer(weaponSet.spread(player.groundSpeed()));
      }
    }
  }
  prevFiring = input.state.firing;

  const pressed = input.takePressed();
  if (pressed.has('KeyR')) weaponSet.reload();
  if (pressed.has('KeyG')) throwGrenade();
  if (pressed.has('KeyB') && rounds.phase === 'buy') {
    hud.showBuy(document.getElementById('buy-menu').hidden);
  }
  if (pressed.has('Digit1')) buy('pistol');
  if (pressed.has('Digit2') && weaponSet.owned().includes('smg')) weaponSet.equip('smg');
  if (pressed.has('Digit3') && weaponSet.owned().includes('rifle')) weaponSet.equip('rifle');
  if (pressed.has('Digit4') && weaponSet.owned().includes('dmr')) weaponSet.equip('dmr');
  if (pressed.has('Digit5')) buy('grenade');
  if (pressed.has('Digit6')) buy('armor');

  if (rounds.phase === 'live' && playerRef.alive && input.state.keys.has('KeyE') && bomb.carrier === 'player' && bomb.state === 'carried') {
    const site = MAP.sites[bomb.targetSite];
    const atSite = Math.hypot(site.x - player.state.position.x, site.z - player.state.position.z) < 2.4;
    const event = bomb.plantChannel(dt, atSite);
    if (atSite) hud.showProgress('PLANTING CHARGE', bomb.plantProgress / PLANT_TIME);
    else hud.hideProgress();
    if (event === 'planted') {
      planters.push('player');
      playerMoney += OBJECTIVE_MONEY;
      hud.setMoney(playerMoney);
      hud.hideProgress();
      hud.banner('CHARGE PLANTED', `Sentinel must defuse at site ${bomb.site}`, 3000);
      audio.plantBeep(true);
    }
  } else if (bomb.state === 'carried' && bomb.carrier === 'player') {
    hud.hideProgress();
  }

  weaponSet.setZoom(input.state.aiming && weaponSet.current().zoom === true && playerRef.alive);
  fovTarget = weaponSet.state.zoomed ? 34 : 74;
  if (Math.abs(camera.fov - fovTarget) > 0.1) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  hud.setHealth(playerRef.health, playerRef.armor);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, weaponSet.current().name);
  hud.setTimer(Math.max(0, rounds.timer), bomb.state === 'planted' ? bomb.timer : null);
  hud.setCrosshairSpread(weaponSet.spread(player.groundSpeed()));
  hud.setMoney(playerMoney);
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (!rounds.matchOver && rounds.phase !== 'end') {
    hud.showOverlay(started ? 'paused' : 'start', `${rounds.score.vanguard} — ${rounds.score.sentinel}`);
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.matchOver) {
    rounds.startMatch();
    setupRound();
    input.requestLock();
    return;
  }
  if (rounds.phase === 'end') return;
  input.requestLock();
});
hud.onBuy((itemId) => buy(itemId));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  try {
    runShotInner(name);
  } catch (error) {
    window.__errors = window.__errors || [];
    window.__errors.push(`runShot: ${error && error.stack ? error.stack : error}`);
  }
  hud.setScore(rounds.score.vanguard, rounds.score.sentinel, rounds.number);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, weaponSet.current().name);
  paintTwiceThenReady();
}

function runShotInner(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  if (name === 'start') {
    rounds.startMatch();
    setupRound();
    hud.showBuy(false);
    hud.showOverlay('start', '0 — 0');
    aimAt(new THREE.Vector3(0, 1.5, -6));
    settle(10);
  } else if (name === 'play') {
    rounds.startMatch();
    setupRound();
    rounds.beginLive();
    hud.showBuy(false);
    weaponSet.give('rifle');
    weaponSet.equip('rifle');
    player.respawn(0, 4, 0);
    const enemy = bots.bots.find((b) => b.ref.team === 'sentinel');
    enemy.position.set(2.5, 0, -7);
    enemy.yaw = Math.PI;
    enemy.group.position.copy(enemy.position);
    settle(24);
    aimAt(new THREE.Vector3(enemy.position.x, 1.3, enemy.position.z));
    for (let i = 0; i < 2; i += 1) {
      shootPlayer(0);
      settle(6);
    }
    aimAt(new THREE.Vector3(enemy.position.x, 1.3, enemy.position.z));
    shootPlayer(0);
    settle(3);
  } else if (name === 'plant') {
    rounds.startMatch();
    setupRound();
    rounds.beginLive();
    hud.showBuy(false);
    bomb.state = 'planted';
    bomb.site = 'A';
    bomb.timer = 30;
    bomb.carrier = null;
    const carrier = bots.bots.find((b) => b.ref.id === 'vanguard-0');
    carrier.position.set(-15.2, 0, -12.2);
    carrier.yaw = 2.4;
    carrier.group.position.copy(carrier.position);
    const defender = bots.bots.find((b) => b.ref.team === 'sentinel');
    defender.position.set(-11, 0, -9);
    defender.yaw = Math.PI * 0.8;
    defender.group.position.copy(defender.position);
    player.respawn(-5, -2, 0.7);
    settle(20);
    aimAt(new THREE.Vector3(-16.5, 1.2, -13.5));
    hud.setBomb('BOMB PLANTED AT A — 30s');
  } else {
    rounds.startMatch();
    setupRound();
    rounds.beginLive();
    hud.showBuy(false);
    bomb.state = 'planted';
    bomb.site = 'A';
    bomb.timer = 12;
    bomb.carrier = null;
    const dead = bots.bots.find((b) => b.ref.team === 'sentinel');
    dead.ref.alive = false;
    dead.dead = true;
    dead.fall = 1;
    dead.group.rotation.x = -1.4;
    dead.position.set(-13, 0, -10);
    dead.group.position.copy(dead.position);
    player.respawn(-4, 2, 0.5);
    settle(20);
    aimAt(new THREE.Vector3(-15.5, 1.2, -12.5));
    hud.banner('VANGUARD WINS', 'The charge detonated at site A', 10000);
    hud.setBomb('BOMB PLANTED AT A — 12s');
  }
}

rounds.startMatch();
setupRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
