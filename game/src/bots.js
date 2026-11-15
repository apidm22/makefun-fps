// Bots: seven soldiers with one job each round — attackers advance down a lane, clear
// a site and plant; defenders hold, rotate on sound and retake to defuse. A bot is a
// small state machine (advance, hold, engage, plant, defuse, investigate, defend) over
// the waypoint graph, with burst fire, strafing, reaction time and aim that steadies
// the longer it tracks one target. Movement reuses the player's axis-separated box
// collision, so a bot never walks through a wall.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { MAP } from './mapdata.js';
import { nearestNode, findPath, nodePosition } from './nav.js';
import { WEAPONS } from './weapons.js';
import { pick } from './rng.js';

const BOT_NAMES = {
  vanguard: ['Ash', 'Bram', 'Kessler', 'Dove'],
  sentinel: ['Iris', 'Marlowe', 'Pike', 'Sable'],
};
const RADIUS = 0.34;
const HEIGHT = 1.72;
const WALK_SPEED = 4.6;
const ENGAGE_RANGE = 46;
const HEAR_RANGE = 30;

function makeNameSprite(name, teamColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(10,12,16,0.55)';
  ctx.fillRect(28, 6, 200, 26);
  ctx.fillStyle = teamColor;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 128, 20);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.7, 0.42, 1);
  return sprite;
}

function makeHealthBar() {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x11141a, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x7fd08a, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  fg.position.z = 0.001;
  group.add(bg, fg);
  group.userData.fg = fg;
  return group;
}

export function createBots(scene, world, combat, effects, audio, random) {
  const bots = [];
  const colliders = world.colliders;
  const probe = new THREE.Box3();
  const eye = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const toEnemy = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function buildBody(team) {
    const teamColor = TEAM[team].colorHex;
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.65, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a184), roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), suit);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
    head.position.y = 1.6;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), suit);
    helmet.position.y = 1.62;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), dark);
    legL.position.set(-0.13, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
    gun.position.set(0.2, 1.25, -0.25);
    group.add(torso, head, helmet, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { group, torso, head, legL, legR };
  }

  function createBot(team, index) {
    const name = BOT_NAMES[team][index % BOT_NAMES[team].length];
    const parts = buildBody(team);
    const ref = {
      id: `${team}-${index}`,
      name,
      team,
      kind: 'bot',
      health: 100,
      armor: 0,
      alive: true,
    };
    const sprite = makeNameSprite(name, TEAM[team].color);
    sprite.position.y = 2.05;
    parts.group.add(sprite);
    const healthBar = makeHealthBar();
    healthBar.position.y = 1.88;
    parts.group.add(healthBar);
    parts.torso.userData.target = { ref, part: 'torso' };
    parts.head.userData.target = { ref, part: 'head' };
    parts.torso.layers.set(0);
    parts.head.layers.set(0);
    scene.add(parts.group);
    const bot = {
      ref,
      ...parts,
      position: new THREE.Vector3(),
      yaw: 0,
      weaponId: 'rifle',
      mag: WEAPONS.rifle.magSize,
      reserve: WEAPONS.rifle.reserve,
      cooldown: 0,
      burstLeft: 0,
      burstPause: 0,
      reaction: 0,
      aimError: 0.05,
      strafeDir: 1,
      strafeTimer: 0,
      walkPhase: 0,
      state: 'hold',
      path: [],
      pathIndex: 0,
      goalNode: -1,
      lane: 'mid',
      holdYaw: 0,
      target: null,
      lastSeen: null,
      investigate: null,
      plantProgress: 0,
      defuseProgress: 0,
      dead: false,
      fall: 0,
    };
    bot.lastSeen = new THREE.Vector3();
    bot.investigate = new THREE.Vector3();
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) createBot('vanguard', i);
  for (let i = 0; i < 4; i += 1) createBot('sentinel', i);

  function allHitMeshes() {
    const meshes = [];
    for (const bot of bots) meshes.push(bot.torso, bot.head);
    return meshes;
  }

  function setWeapon(bot, weaponId) {
    bot.weaponId = weaponId;
    const def = WEAPONS[weaponId];
    bot.mag = def.magSize;
    bot.reserve = def.reserve;
    bot.cooldown = 0;
    bot.burstLeft = 0;
  }

  function spawnRound(assignments) {
    for (const bot of bots) {
      const assignment = assignments[bot.ref.id];
      bot.ref.health = 100;
      bot.ref.armor = assignment.armor ? 50 : 0;
      bot.ref.alive = true;
      bot.dead = false;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      bot.group.visible = true;
      bot.position.set(assignment.spawn[0], 0, assignment.spawn[1]);
      bot.yaw = assignment.yaw;
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;
      setWeapon(bot, assignment.weapon);
      bot.state = assignment.state;
      bot.lane = assignment.lane || 'mid';
      bot.holdYaw = assignment.yaw;
      bot.path = [];
      bot.pathIndex = 0;
      bot.goalNode = -1;
      bot.target = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.investigate.set(0, 0, 0);
      bot.group.traverse((mesh) => {
        if (mesh.isMesh) mesh.visible = true;
      });
      updateHealthBar(bot);
    }
  }

  function updateHealthBar(bot) {
    const fg = bot.group.children.find((c) => c.userData.fg)?.userData.fg;
    if (!fg) return;
    const ratio = Math.max(0, bot.ref.health / 100);
    fg.scale.x = ratio;
    fg.position.x = -(1 - ratio) * 0.43;
    fg.material.color.setHex(ratio > 0.5 ? 0x7fd08a : ratio > 0.25 ? 0xf5b942 : 0xe5484d);
  }

  function eyePosition(bot, out) {
    out.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    return out;
  }

  function canSee(bot, aim, worldMeshes) {
    eyePosition(bot, eye);
    return combat.lineOfSight(eye, aim, worldMeshes);
  }

  function faceToward(bot, x, z, dt) {
    const targetYaw = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.yaw += turn;
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.15) return true;
    moveDir.set(dx / distance, 0, dz / distance);
    const stepX = moveDir.x * speed * dt;
    const stepZ = moveDir.z * speed * dt;
    const nextX = bot.position.x + stepX;
    if (!overlaps(nextX, bot.position.y, bot.position.z)) bot.position.x = nextX;
    const nextZ = bot.position.z + stepZ;
    if (!overlaps(bot.position.x, bot.position.y, nextZ)) bot.position.z = nextZ;
    bot.walkPhase += dt * 9;
    faceToward(bot, x, z, dt);
    return Math.hypot(x - bot.position.x, z - bot.position.z) < 0.35;
  }

  function followPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = nodePosition(bot.path[bot.pathIndex]);
    if (moveToward(bot, node.x, node.z, dt, WALK_SPEED)) bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }

  function planPath(bot, goalNode) {
    const from = nearestNode(bot.position.x, bot.position.z);
    bot.path = findPath(from, goalNode);
    bot.pathIndex = 0;
    bot.goalNode = goalNode;
  }

  function pickLaneGoal(bot) {
    const site = bot.lane === 'A' ? 'A' : bot.lane === 'B' ? 'B' : pick(random, ['A', 'B']);
    const nodes = MAP.siteNodes[site];
    return pick(random, nodes);
  }

  function aimAt(bot, targetPos, dt) {
    eyePosition(bot, eye);
    aimDir.copy(targetPos).sub(eye);
    const distance = aimDir.length();
    aimDir.normalize();
    const error = bot.aimError * (0.5 + distance / 60);
    aimDir.x += (random() * 2 - 1) * error;
    aimDir.y += (random() * 2 - 1) * error;
    aimDir.z += (random() * 2 - 1) * error;
    aimDir.normalize();
    return aimDir;
  }

  function botFire(bot, targetRef, targetPos, dt, api) {
    if (api.canFire === false) return;
    const def = WEAPONS[bot.weaponId];
    bot.cooldown -= dt;
    if (bot.cooldown > 0) return;
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > 0) {
        bot.burstPause -= dt;
        return;
      }
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.burstPause = 0.45 + random() * 0.5;
    }
    if (bot.mag <= 0) {
      bot.mag = def.magSize;
      bot.reserve = Math.max(0, bot.reserve - def.magSize);
      bot.cooldown = def.reloadTime;
      return;
    }
    bot.mag -= 1;
    bot.burstLeft -= 1;
    bot.cooldown = def.fireGap;
    const spread = 0.012 + (bot.strafeTimer > 0 ? 0.008 : 0);
    const result = combat.fire(eyePosition(bot, eye), aimAt(bot, targetPos, dt), spread, random, def, bot.ref, true);
    audio.shot(def.id === 'rifle' ? 'rifle' : def.id === 'smg' ? 'smg' : def.id === 'dmr' ? 'dmr' : 'pistol');
    api.heardShot(bot.position, bot.ref.team);
    if (result.hit && result.ref) {
      api.onDamage(result.ref, result.damage, result.part, bot.ref);
      if (result.killed) api.onKill(bot.ref, result.ref, result.part === 'head');
    }
  }

  function stepBot(bot, dt, api) {
    if (!bot.ref.alive) {
      if (!bot.dead) {
        bot.dead = true;
        bot.fall = 0;
      }
      bot.fall = Math.min(1, bot.fall + dt / 0.5);
      bot.group.rotation.x = -bot.fall * 1.4;
      return;
    }
    bot.group.position.copy(bot.position);
    bot.group.rotation.y = bot.yaw;
    const legSwing = Math.sin(bot.walkPhase) * 0.35;
    bot.legL.rotation.x = legSwing;
    bot.legR.rotation.x = -legSwing;

    const playerAlive = api.player.ref.alive;
    const enemies = [];
    if (playerAlive && api.player.ref.team !== bot.ref.team) {
      enemies.push({ ref: api.player.ref, pos: api.player.position, eye: api.player.eye });
    }
    for (const other of bots) {
      if (other.ref.alive && other.ref.team !== bot.ref.team && other !== bot) {
        enemies.push({ ref: other.ref, pos: other.position, eye: 1.55 });
      }
    }

    let visible = null;
    let visibleDistance = Infinity;
    for (const enemy of enemies) {
      targetPos.set(enemy.pos.x, enemy.pos.y + enemy.eye * 0.8, enemy.pos.z);
      const distance = Math.hypot(targetPos.x - bot.position.x, targetPos.z - bot.position.z);
      if (distance > ENGAGE_RANGE) continue;
      eyePosition(bot, eye);
      toEnemy.copy(targetPos).sub(eye).normalize();
      forward.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      if (toEnemy.dot(forward) < -0.15 && distance > 6) continue;
      if (!canSee(bot, targetPos, api.worldMeshes)) continue;
      if (distance < visibleDistance) {
        visibleDistance = distance;
        visible = enemy;
      }
    }

    if (visible) {
      if (bot.target !== visible.ref) {
        bot.target = visible.ref;
        bot.reaction = 0.28 + random() * 0.25;
        bot.aimError = 0.05;
      }
      bot.aimError = Math.max(0.012, bot.aimError - dt * 0.02);
      bot.state = 'engage';
    } else if (bot.state === 'engage') {
      bot.target = null;
      bot.state = bot.ref.team === 'vanguard' ? 'advance' : 'hold';
    }

    if (bot.state === 'engage' && visible) {
      targetPos.set(visible.pos.x, visible.pos.y + visible.eye * 0.8, visible.pos.z);
      faceToward(bot, targetPos.x, targetPos.z, dt);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.7 + random() * 0.8;
      }
      const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
      const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
      const nextX = bot.position.x + strafeX * 1.6 * dt;
      const nextZ = bot.position.z + strafeZ * 1.6 * dt;
      if (!overlaps(nextX, bot.position.y, bot.position.z)) bot.position.x = nextX;
      if (!overlaps(bot.position.x, bot.position.y, nextZ)) bot.position.z = nextZ;
      if (bot.reaction > 0) {
        bot.reaction -= dt;
      } else {
        botFire(bot, visible.ref, targetPos, dt, api);
      }
      return;
    }

    if (api.bomb.state === 'planted' && bot.ref.team === 'sentinel') {
      const site = MAP.sites[api.bomb.site];
      if (bot.state !== 'defuse' && bot.state !== 'retake') {
        bot.state = 'retake';
        planPath(bot, nearestNode(site.x, site.z));
      }
      if (bot.state === 'retake') {
        if (followPath(bot, dt)) {
          bot.state = 'defuse';
          bot.defuseProgress = 0;
        }
        return;
      }
      if (bot.state === 'defuse') {
        faceToward(bot, site.x, site.z, dt);
        bot.defuseProgress += dt;
        api.onDefuseProgress(bot, bot.defuseProgress);
        return;
      }
    }

    if (bot.ref.team === 'vanguard' && api.bomb.state === 'carried' && api.bomb.carrier === bot.ref.id) {
      const site = MAP.sites[api.bomb.targetSite];
      const distance = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
      if (distance < 2.2) {
        bot.state = 'plant';
        bot.plantProgress += dt;
        api.onPlantProgress(bot, bot.plantProgress);
        return;
      }
    }

    if (bot.state === 'advance' || bot.state === 'retake') {
      if (bot.pathIndex >= bot.path.length) {
        if (bot.ref.team === 'vanguard') {
          planPath(bot, pickLaneGoal(bot));
        } else {
          bot.state = 'hold';
        }
      } else {
        followPath(bot, dt);
      }
      return;
    }

    if (bot.state === 'hold') {
      faceToward(bot, bot.position.x - Math.sin(bot.holdYaw) * 5, bot.position.z - Math.cos(bot.holdYaw) * 5, dt);
      if (bot.investigate.x !== 0 || bot.investigate.z !== 0) {
        const distance = Math.hypot(bot.investigate.x - bot.position.x, bot.investigate.z - bot.position.z);
        if (distance > 2) {
          moveToward(bot, bot.investigate.x, bot.investigate.z, dt, WALK_SPEED);
        } else {
          bot.investigate.set(0, 0, 0);
        }
      }
    }
  }

  return {
    bots,
    allHitMeshes,
    spawnRound,
    updateHealthBar,
    updateHealthBarFor(ref) {
      const bot = bots.find((b) => b.ref === ref);
      if (bot) updateHealthBar(bot);
    },
    hear(position, team) {
      for (const bot of bots) {
        if (!bot.ref.alive || bot.ref.team === team) continue;
        const distance = Math.hypot(position.x - bot.position.x, position.z - bot.position.z);
        if (distance < HEAR_RANGE && bot.state !== 'engage') {
          bot.investigate.set(position.x, 0, position.z);
        }
      }
    },
    step(dt, api) {
      for (const bot of bots) stepBot(bot, dt, api);
      for (const bot of bots) {
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
      }
    },
  };
}
