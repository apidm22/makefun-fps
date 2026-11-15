// Pooled effects: tracers, impact sparks, blood puffs and the bomb explosion. Every
// effect is a pre-allocated object reused in place, so the hot loops allocate nothing:
// a tracer is a line whose endpoints are rewritten, sparks are Points whose positions
// and velocities live in typed arrays. Nothing here is created per frame.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 6;
const SPARK_POINTS = 26;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffb45e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkSystems = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const positions = new Float32Array(SPARK_POINTS * 3);
    const velocities = new Float32Array(SPARK_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    sparkSystems.push({ points, positions, velocities, life: 0, color: 0xffc46b });
  }
  let sparkIndex = 0;

  const explosionLight = new THREE.PointLight(new THREE.Color(0xff8c2e), 0, 30, 1.4);
  explosionLight.position.set(0, 1, 0);
  scene.add(explosionLight);
  const explosionSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffa03c, transparent: true, opacity: 0, depthWrite: false }),
  );
  explosionSphere.visible = false;
  scene.add(explosionSphere);
  let explosionLife = 0;

  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
  );
  flashQuad.position.z = -0.5;
  flashQuad.visible = false;

  function burst(system, origin, color, speed, up) {
    system.points.material.color.setHex(color);
    const { positions, velocities } = system;
    for (let i = 0; i < SPARK_POINTS; i += 1) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * speed;
      velocities[i * 3] = Math.cos(angle) * spread;
      velocities[i * 3 + 1] = Math.random() * up;
      velocities[i * 3 + 2] = Math.sin(angle) * spread;
    }
    system.points.geometry.attributes.position.needsUpdate = true;
    system.life = 0.5;
    system.points.visible = true;
  }

  return {
    tracer(from, to, color) {
      const entry = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
      const positions = entry.line.geometry.attributes.position.array;
      positions[0] = from.x;
      positions[1] = from.y;
      positions[2] = from.z;
      positions[3] = to.x;
      positions[4] = to.y;
      positions[5] = to.z;
      entry.line.geometry.attributes.position.needsUpdate = true;
      entry.line.material.color.setHex(color);
      entry.life = 0.09;
      entry.line.visible = true;
    },
    impact(point) {
      const system = sparkSystems[sparkIndex];
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      burst(system, point, 0xffc46b, 2.2, 2.0);
    },
    blood(point) {
      const system = sparkSystems[sparkIndex];
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      burst(system, point, 0x8c1f28, 1.4, 1.2);
    },
    explosion(point) {
      explosionLight.position.copy(point);
      explosionLight.position.y += 1;
      explosionLight.intensity = 260;
      explosionSphere.position.copy(point);
      explosionSphere.position.y += 0.5;
      explosionSphere.visible = true;
      explosionLife = 0.7;
      const system = sparkSystems[sparkIndex];
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      burst(system, point, 0xff7a1a, 7, 6);
    },
    flashOverlay(camera) {
      if (!flashQuad.parent) camera.add(flashQuad);
      flashQuad.material.opacity = 0.92;
      flashQuad.visible = true;
    },
    step(dt) {
      for (const entry of tracers) {
        if (entry.life <= 0) continue;
        entry.life -= dt;
        entry.line.material.opacity = Math.max(0, entry.life / 0.09) * 0.85;
        if (entry.life <= 0) entry.line.visible = false;
      }
      for (const system of sparkSystems) {
        if (system.life <= 0) continue;
        system.life -= dt;
        const { positions, velocities } = system;
        for (let i = 0; i < SPARK_POINTS; i += 1) {
          velocities[i * 3 + 1] -= 9 * dt;
          positions[i * 3] += velocities[i * 3] * dt;
          positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
          positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
          if (positions[i * 3 + 1] < 0.02) positions[i * 3 + 1] = 0.02;
        }
        system.points.geometry.attributes.position.needsUpdate = true;
        system.points.material.opacity = Math.max(0, system.life / 0.5);
        if (system.life <= 0) system.points.visible = false;
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        const t = Math.max(0, explosionLife / 0.7);
        explosionLight.intensity = 260 * t;
        explosionSphere.scale.setScalar(1 + (1 - t) * 7);
        explosionSphere.material.opacity = 0.55 * t;
        if (explosionLife <= 0) {
          explosionSphere.visible = false;
          explosionLight.intensity = 0;
        }
      }
      if (flashQuad.visible) {
        flashQuad.material.opacity = Math.max(0, flashQuad.material.opacity - dt * 1.4);
        if (flashQuad.material.opacity <= 0) flashQuad.visible = false;
      }
    },
  };
}
