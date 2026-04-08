import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE } from './constants.js';

const RIVAL_COLORS = [0xcc3333, 0xcc8800, 0x8833cc];

export class RivalAI {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rivals = [];
  }

  spawn(count) {
    const roads = this.city.getRoadPositions();
    for (let i = 0; i < count; i++) {
      const rp = roads[Math.floor(Math.random() * roads.length)];
      const color = RIVAL_COLORS[i % RIVAL_COLORS.length];
      const rival = {
        position: new THREE.Vector3(rp.x, 0, rp.z),
        rotation: Math.random() * Math.PI * 2,
        speed: 0,
        maxSpeed: 22 + Math.random() * 8,
        target: null,
        mesh: this.createMesh(color),
        radius: 2.2,
        state: 'roaming', // roaming | chasing | delivering
        deliveryTarget: null,
        score: 0,
        deliveries: 0,
      };
      rival.mesh.position.copy(rival.position);
      this.scene.add(rival.mesh);
      this.rivals.push(rival);
    }
  }

  createMesh(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3.6), mat);
    body.position.y = 1.2;
    body.castShadow = true;
    g.add(body);

    // Roof
    const roofColor = new THREE.Color(color).multiplyScalar(0.75);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.18, 3.8),
      new THREE.MeshLambertMaterial({ color: roofColor })
    );
    roof.position.y = 2.3;
    g.add(roof);

    // Front
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    ).translateY(0.9).translateZ(1.9));

    // Accent stripe
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(2.22, 0.12, 3.62),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    ).translateY(0.55));

    // Headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for (const side of [-0.55, 0.55]) {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 5, 5), hlMat).translateX(side).translateY(1).translateZ(2.5));
    }

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const wMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [x, z] of [[0, 1.7], [-1.1, -1], [1.1, -1]]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.4, z);
      g.add(w);
    }

    // "RIVAL" tag above
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(2, 2, 124, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RIVAL', 64, 17);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(3, 0.75, 1);
    sprite.position.y = 3.5;
    g.add(sprite);

    return g;
  }

  update(delta, playerPassengers, buildingBounds) {
    const pickup = playerPassengers.getPickupPosition();
    const dropoff = playerPassengers.getDropoffPosition();

    for (const r of this.rivals) {
      // Decide target
      if (r.state === 'roaming' || r.state === 'chasing') {
        if (pickup) {
          r.target = pickup;
          r.state = 'chasing';
        } else {
          // Wander if no pickup available
          r.state = 'roaming';
          if (!r.target || r.position.distanceTo(r.target) < 5) {
            const roads = this.city.getRoadPositions();
            r.target = roads[Math.floor(Math.random() * roads.length)].clone();
          }
        }
      }

      if (!r.target) continue;

      // Steer toward target
      const dx = r.target.x - r.position.x;
      const dz = r.target.z - r.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const desiredRot = Math.atan2(dx, dz);

      // Smooth rotation
      let rotDiff = desiredRot - r.rotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      r.rotation += rotDiff * Math.min(3 * delta, 1);

      // Speed control
      const targetSpeed = dist > 10 ? r.maxSpeed : r.maxSpeed * 0.5;
      r.speed += (targetSpeed - r.speed) * Math.min(4 * delta, 1);

      // Move
      r.position.x += Math.sin(r.rotation) * r.speed * delta;
      r.position.z += Math.cos(r.rotation) * r.speed * delta;

      // Building collisions
      this.handleBuildingCollisions(r, buildingBounds);

      // City bounds
      const citySize = GRID_SIZE * CELL_SIZE;
      r.position.x = Math.max(3, Math.min(citySize - 3, r.position.x));
      r.position.z = Math.max(3, Math.min(citySize - 3, r.position.z));

      // Update mesh
      r.mesh.position.set(r.position.x, 0, r.position.z);
      r.mesh.rotation.y = r.rotation;

      // Check if rival reached pickup before player
      if (r.state === 'chasing' && pickup && dist < 5) {
        return { type: 'rival-stole', rival: r };
      }
    }

    return null;
  }

  handleBuildingCollisions(rival, bounds) {
    const pos = rival.position;
    const radius = 2;
    for (const b of bounds) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius) {
        const push = radius - dist;
        if (dist > 0.001) {
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          pos.x += push;
        }
        rival.speed *= 0.3;
      }
    }
  }

  getRivals() {
    return this.rivals;
  }

  reset() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }
}
