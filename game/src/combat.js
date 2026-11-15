// Shared shooting: one hitscan routine for the player and the bots. A shot is a ray
// from an eye position along a direction with spread; the first thing it meets decides
// the outcome: an enemy target's head (full head multiplier), an enemy torso, a
// teammate (the shot stops there, no damage), or the map (a spark). Damage falls off
// with distance and armor soaks half of what remains.
//
// Layers keep a shooter from hitting itself: the world and the bots live on layer 0,
// the player's hitbox on layer 1. A player's ray tests layer 0 only; a bot's ray tests
// both. Every shootable mesh carries userData.target = { ref, part }; ref is a bot or
// the player, both shaped { health, armor, alive, team }.
import * as THREE from 'three';

export function createCombat(scene, shootables, effects) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const direction = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const endPoint = new THREE.Vector3();

  function applyArmor(ref, damage) {
    if (!ref.armor || ref.armor <= 0) return damage;
    const absorbed = Math.min(ref.armor, damage * 0.5);
    ref.armor -= absorbed;
    return damage - absorbed;
  }

  function fire(from, dir, spread, random, def, shooterRef, includePlayerLayer) {
    direction.copy(dir);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    origin.copy(from);
    scene.updateMatrixWorld(true);
    raycaster.set(origin, direction);
    if (includePlayerLayer) raycaster.layers.enableAll();
    else raycaster.layers.set(0);
    const hits = raycaster.intersectObjects(shootables, false);
    const hit = hits[0] || null;
    const end = hit ? hit.point : endPoint.copy(origin).addScaledVector(direction, 90);
    effects.tracer(origin, end, def.tracer);
    if (!hit) return { hit: false };
    const target = hit.object.userData.target || null;
    if (target && target.ref.alive && target.ref !== shooterRef) {
      if (target.ref.team === shooterRef.team) {
        effects.impact(hit.point);
        return { hit: true, ref: null, blocked: true, point: hit.point };
      }
      const part = target.part || 'torso';
      const distance = hit.distance;
      const falloff = Math.max(def.falloff, 1 - Math.max(0, distance - def.range) / 120);
      let damage = def.damage * falloff * (part === 'head' ? def.headMult : 1);
      damage = applyArmor(target.ref, damage);
      target.ref.health -= damage;
      effects.blood(hit.point);
      const killed = target.ref.health <= 0;
      if (killed) target.ref.alive = false;
      return { hit: true, ref: target.ref, part, damage, killed, point: hit.point };
    }
    effects.impact(hit.point);
    return { hit: true, ref: null, point: hit.point };
  }

  function lineOfSight(from, to, worldMeshes) {
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.layers.set(0);
    raycaster.far = distance;
    const hits = raycaster.intersectObjects(worldMeshes, false);
    raycaster.far = 120;
    return hits.length === 0;
  }

  return { fire, lineOfSight };
}
