import * as THREE from 'three';
import { removeAndDispose } from './utils.js';

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.balloons = [];
    this.splashes = [];
    this.ammo = 5;
    this.maxAmmo = 5;

    // Shared geometries
    this.balloonGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this.splashRingGeo = new THREE.RingGeometry(0.5, 4, 16);
  }

  fire(position, rotation, speed) {
    if (this.ammo <= 0) return false;
    this.ammo--;

    const group = new THREE.Group();

    // Balloon body
    const balloon = new THREE.Mesh(
      this.balloonGeo,
      new THREE.MeshPhongMaterial({
        color: 0x3399ff,
        transparent: true,
        opacity: 0.85,
        shininess: 80,
      })
    );
    group.add(balloon);

    // Water trail
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.2, 1.2, 4),
      new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0.4 })
    );
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -0.7;
    group.add(trail);

    // Knot on top
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    knot.position.y = 0.35;
    group.add(knot);

    const launchSpeed = Math.max(speed, 20) + 25;
    const vel = new THREE.Vector3(
      Math.sin(rotation) * launchSpeed,
      8,
      Math.cos(rotation) * launchSpeed
    );

    const pos = position.clone();
    pos.y = 2.5;
    pos.x += Math.sin(rotation) * 3;
    pos.z += Math.cos(rotation) * 3;

    group.position.copy(pos);
    this.scene.add(group);

    this.balloons.push({
      mesh: group,
      velocity: vel,
      position: pos.clone(),
      life: 3,
    });

    return true;
  }

  update(delta, traffic, wildlife, police) {
    // Update balloons
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      b.life -= delta;

      // Gravity
      b.velocity.y -= 18 * delta;

      // Move
      b.position.x += b.velocity.x * delta;
      b.position.y += b.velocity.y * delta;
      b.position.z += b.velocity.z * delta;
      b.mesh.position.copy(b.position);

      // Spin
      b.mesh.rotation.x += delta * 3;
      b.mesh.rotation.z += delta * 2;

      let hit = false;

      // Hit ground
      if (b.position.y < 0.2) hit = true;

      // Hit traffic
      if (!hit) {
        for (const npc of traffic.vehicles) {
          const dx = b.position.x - npc.position.x;
          const dz = b.position.z - npc.position.z;
          if (dx * dx + dz * dz < (npc.radius + 1) * (npc.radius + 1)) {
            hit = true;
            break;
          }
        }
      }

      // Hit wildlife
      if (!hit && wildlife) {
        for (const a of wildlife.getColliders()) {
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          if (dx * dx + dz * dz < (a.radius + 1.5) * (a.radius + 1.5)) {
            hit = true;
            break;
          }
        }
      }

      // Hit police
      if (!hit && police && police.isActive()) {
        const dx = b.position.x - police.position.x;
        const dz = b.position.z - police.position.z;
        if (dx * dx + dz * dz < 9) { // radius ~3
          hit = true;
          police.hitByBalloon();
        }
      }

      if (hit || b.life <= 0) {
        this.createSplash(b.position, traffic, wildlife);
        removeAndDispose(this.scene, b.mesh);
        this.balloons.splice(i, 1);
      }
    }

    // Update splashes
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const sp = this.splashes[i];
      sp.life -= delta;
      const t = 1 - sp.life / sp.maxLife;

      sp.ring.scale.setScalar(1 + t * 3);
      sp.ring.material.opacity = (1 - t) * 0.4;

      // Droplets rise and fall
      for (const d of sp.droplets) {
        d.position.y += d.vy * delta;
        d.vy -= 12 * delta;
        d.position.x += d.vx * delta;
        d.position.z += d.vz * delta;
        d.material.opacity = Math.max(0, (1 - t) * 0.6);
      }

      if (sp.life <= 0) {
        removeAndDispose(this.scene, sp.ring);
        for (const d of sp.droplets) removeAndDispose(this.scene, d);
        this.splashes.splice(i, 1);
      }
    }
  }

  createSplash(position, traffic, wildlife) {
    // Push nearby traffic/wildlife away
    const pushRadius = 14;
    const allTargets = [...traffic.vehicles];
    if (wildlife) allTargets.push(...wildlife.animals);

    for (const t of allTargets) {
      const dx = t.position.x - position.x;
      const dz = t.position.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < pushRadius && dist > 0.1) {
        t.scaredTimer = 3.5;
        t.direction.set(dx / dist, 0, dz / dist);
        t.rotation = Math.atan2(t.direction.x, t.direction.z);
      }
    }

    // Splash ring visual
    const ring = new THREE.Mesh(
      this.splashRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0x66bbff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.1, position.z);
    this.scene.add(ring);

    // Water droplets
    const droplets = [];
    for (let j = 0; j < 8; j++) {
      const angle = (j / 8) * Math.PI * 2;
      const droplet = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 })
      );
      droplet.position.set(position.x, 0.5, position.z);
      droplet.vx = Math.cos(angle) * (3 + Math.random() * 3);
      droplet.vy = 4 + Math.random() * 3;
      droplet.vz = Math.sin(angle) * (3 + Math.random() * 3);
      this.scene.add(droplet);
      droplets.push(droplet);
    }

    this.splashes.push({ ring, droplets, life: 0.8, maxLife: 0.8 });
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
