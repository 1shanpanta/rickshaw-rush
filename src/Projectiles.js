import * as THREE from 'three';
import { removeAndDispose } from './utils.js';

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.balloons = []; // keeping array name for compatibility with Game.js refs
    this.splashes = [];
    this.ammo = 10;
    this.maxAmmo = 10;
  }

  fire(position, rotation, speed) {
    // Infinite ammo

    const group = new THREE.Group();

    // Bullet core — small bright cylinder
    const bullet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdd44 })
    );
    bullet.rotation.x = Math.PI / 2;
    group.add(bullet);

    // Hot glow around bullet
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 4, 4),
      new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      })
    );
    group.add(glow);

    // Muzzle flash at spawn (fades fast)
    const flash = new THREE.PointLight(0xff8800, 3, 15);
    flash.position.set(0, 0, 0);
    group.add(flash);
    setTimeout(() => { group.remove(flash); }, 50);

    // Bullet travels FAST and FLAT
    const launchSpeed = Math.max(speed, 25) + 60;
    const vel = new THREE.Vector3(
      Math.sin(rotation) * launchSpeed,
      0, // completely flat trajectory
      Math.cos(rotation) * launchSpeed
    );

    const pos = position.clone();
    pos.y = 1.8;
    pos.x += Math.sin(rotation) * 3.5;
    pos.z += Math.cos(rotation) * 3.5;

    group.position.copy(pos);
    group.rotation.y = rotation;
    this.scene.add(group);

    this.balloons.push({
      mesh: group,
      velocity: vel,
      position: pos.clone(),
      life: 2,
    });

    return true;
  }

  update(delta, traffic, wildlife, police, rivalAI) {
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      b.life -= delta;

      // No gravity — bullets fly flat
      b.position.x += b.velocity.x * delta;
      b.position.y += b.velocity.y * delta;
      b.position.z += b.velocity.z * delta;
      b.mesh.position.copy(b.position);

      // Bullet faces forward (no spin)
      let hit = false;

      // Hit ground
      if (b.position.y < 0.1) hit = true;

      // Hit traffic — destroy on hit
      if (!hit) {
        for (let t = traffic.vehicles.length - 1; t >= 0; t--) {
          const npc = traffic.vehicles[t];
          const dx = b.position.x - npc.position.x;
          const dz = b.position.z - npc.position.z;
          if (dx * dx + dz * dz < (npc.radius + 0.5) * (npc.radius + 0.5)) {
            hit = true;
            // Destroy the vehicle
            if (npc.mesh) {
              traffic.scene.remove(npc.mesh);
            }
            traffic.vehicles.splice(t, 1);
            break;
          }
        }
      }

      // Hit wildlife — destroy on hit
      if (!hit && wildlife) {
        for (let w = wildlife.animals.length - 1; w >= 0; w--) {
          const a = wildlife.animals[w];
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          if (dx * dx + dz * dz < (a.radius + 1) * (a.radius + 1)) {
            hit = true;
            if (a.mesh) {
              wildlife.scene.remove(a.mesh);
            }
            wildlife.animals.splice(w, 1);
            break;
          }
        }
      }

      // Hit rival racers — slow them down
      if (!hit && rivalAI) {
        for (const r of rivalAI.getRivals()) {
          if (r.finished) continue;
          const dx = b.position.x - r.position.x;
          const dz = b.position.z - r.position.z;
          if (dx * dx + dz * dz < (r.radius + 0.5) * (r.radius + 0.5)) {
            hit = true;
            rivalAI.hitByBullet(r);
            break;
          }
        }
      }

      // Hit police
      if (!hit && police && police.isActive()) {
        const dx = b.position.x - police.position.x;
        const dz = b.position.z - police.position.z;
        if (dx * dx + dz * dz < 9) {
          hit = true;
          police.hitByBalloon();
        }
      }

      if (hit || b.life <= 0) {
        if (hit) this.createImpact(b.position, traffic, wildlife);
        removeAndDispose(this.scene, b.mesh);
        this.balloons.splice(i, 1);
      }
    }

    // Update impact effects
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const sp = this.splashes[i];
      sp.life -= delta;
      const t = 1 - sp.life / sp.maxLife;

      sp.ring.scale.setScalar(1 + t * 4);
      sp.ring.material.opacity = (1 - t) * 0.5;

      // Spark particles fly outward
      for (const d of sp.droplets) {
        d.position.x += d.vx * delta;
        d.position.y += d.vy * delta;
        d.vy -= 15 * delta;
        d.position.z += d.vz * delta;
        d.material.opacity = Math.max(0, (1 - t) * 0.8);
      }

      if (sp.life <= 0) {
        removeAndDispose(this.scene, sp.ring);
        for (const d of sp.droplets) removeAndDispose(this.scene, d);
        this.splashes.splice(i, 1);
      }
    }
  }

  createImpact(position, traffic, wildlife) {
    // Scare nearby traffic
    const pushRadius = 12;
    const allTargets = [...traffic.vehicles];
    if (wildlife) allTargets.push(...wildlife.animals);

    for (const t of allTargets) {
      const dx = t.position.x - position.x;
      const dz = t.position.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < pushRadius && dist > 0.1) {
        t.scaredTimer = 3;
        t.direction.set(dx / dist, 0, dz / dist);
        t.rotation = Math.atan2(t.direction.x, t.direction.z);
      }
    }

    // Impact flash ring — orange/red instead of blue water
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 2, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.2, position.z);
    this.scene.add(ring);

    // Sparks — bright orange/yellow particles instead of water drops
    const droplets = [];
    for (let j = 0; j < 6; j++) {
      const angle = (j / 6) * Math.PI * 2;
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 3, 3),
        new THREE.MeshBasicMaterial({
          color: 0xffaa00,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
        })
      );
      spark.position.set(position.x, 1, position.z);
      spark.vx = Math.cos(angle) * (4 + Math.random() * 4);
      spark.vy = 3 + Math.random() * 4;
      spark.vz = Math.sin(angle) * (4 + Math.random() * 4);
      this.scene.add(spark);
      droplets.push(spark);
    }

    this.splashes.push({ ring, droplets, life: 0.5, maxLife: 0.5 });
  }

  refillAmmo(amount) {
    this.ammo = Math.min(this.maxAmmo, this.ammo + (amount || this.maxAmmo));
  }

  reset() {
    for (const b of this.balloons) removeAndDispose(this.scene, b.mesh);
    for (const sp of this.splashes) {
      removeAndDispose(this.scene, sp.ring);
      for (const d of sp.droplets) removeAndDispose(this.scene, d);
    }
    this.balloons = [];
    this.splashes = [];
    this.ammo = this.maxAmmo;
  }
}
