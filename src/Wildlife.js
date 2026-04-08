import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE } from './constants.js';

const ANIMAL_TYPES = {
  dog: { w: 0.6, h: 0.5, l: 0.9, color: 0x8b6914, speed: 3, count: 8 },
  monkey: { w: 0.4, h: 0.5, l: 0.4, color: 0xa0522d, speed: 6, count: 5 },
  elephant: { w: 2.5, h: 3, l: 4, color: 0x808080, speed: 2, count: 2 },
  rhino: { w: 1.8, h: 1.8, l: 3, color: 0x696969, speed: 2.5, count: 1 },
  goat: { w: 0.5, h: 0.6, l: 0.8, color: 0xf5f5dc, speed: 2.5, count: 6 },
  chicken: { w: 0.3, h: 0.4, l: 0.35, color: 0xdaa520, speed: 4, count: 8 },
};

export class Wildlife {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.animals = [];
    this.spawnAnimals();
  }

  spawnAnimals() {
    const rng = this.seededRandom(314);
    const roads = this.city.getRoadPositions();
    const citySize = GRID_SIZE * CELL_SIZE;

    for (const [type, cfg] of Object.entries(ANIMAL_TYPES)) {
      for (let i = 0; i < cfg.count; i++) {
        let x, z;

        if (type === 'elephant' || type === 'rhino') {
          // Spawn near city edges (Chitwan vibes)
          const edge = Math.floor(rng() * 4);
          if (edge === 0) { x = rng() * 40; z = rng() * citySize; }
          else if (edge === 1) { x = citySize - rng() * 40; z = rng() * citySize; }
          else if (edge === 2) { x = rng() * citySize; z = rng() * 40; }
          else { x = rng() * citySize; z = citySize - rng() * 40; }
        } else {
          // Spawn near roads
          const rp = roads[Math.floor(rng() * roads.length)];
          x = rp.x + (rng() - 0.5) * CELL_SIZE * 0.8;
          z = rp.z + (rng() - 0.5) * CELL_SIZE * 0.8;
        }

        const animal = {
          type,
          position: new THREE.Vector3(x, 0, z),
          rotation: rng() * Math.PI * 2,
          speed: cfg.speed * (0.6 + rng() * 0.8),
          radius: Math.max(cfg.w, cfg.l) * 0.6,
          direction: new THREE.Vector3(),
          turnTimer: rng() * 5,
          mesh: null,
          bobPhase: rng() * Math.PI * 2,
        };

        animal.direction.set(Math.sin(animal.rotation), 0, Math.cos(animal.rotation));
        animal.mesh = this.createMesh(type, cfg, rng);
        animal.mesh.position.set(x, 0, z);
        this.scene.add(animal.mesh);
        this.animals.push(animal);
      }
    }
  }

  createMesh(type, cfg, rng) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: cfg.color });

    if (type === 'elephant') {
      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h * 0.7, cfg.l), mat);
      body.position.y = cfg.h * 0.55;
      body.castShadow = true;
      g.add(body);

      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 1.2), mat);
      head.position.set(0, cfg.h * 0.6, cfg.l / 2 + 0.5);
      g.add(head);

      // Trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.25, 2, 6),
        new THREE.MeshLambertMaterial({ color: 0x707070 })
      );
      trunk.position.set(0, cfg.h * 0.2, cfg.l / 2 + 1.2);
      trunk.rotation.x = 0.4;
      g.add(trunk);

      // Ears
      for (const side of [-0.7, 0.7]) {
        const ear = new THREE.Mesh(
          new THREE.CircleGeometry(0.6, 6),
          new THREE.MeshLambertMaterial({ color: 0x909090, side: THREE.DoubleSide })
        );
        ear.position.set(side, cfg.h * 0.7, cfg.l / 2 + 0.3);
        ear.rotation.y = side > 0 ? -0.5 : 0.5;
        g.add(ear);
      }

      // Tusks
      const tuskMat = new THREE.MeshLambertMaterial({ color: 0xfffff0 });
      for (const side of [-0.35, 0.35]) {
        const tusk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.8, 4), tuskMat);
        tusk.position.set(side, cfg.h * 0.3, cfg.l / 2 + 0.9);
        tusk.rotation.x = -0.3;
        g.add(tusk);
      }

      // Legs
      const legGeo = new THREE.CylinderGeometry(0.3, 0.35, cfg.h * 0.45, 6);
      for (const [lx, lz] of [[-0.8, -1.2], [0.8, -1.2], [-0.8, 1.2], [0.8, 1.2]]) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(lx, cfg.h * 0.22, lz);
        g.add(leg);
      }

      // Tail
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.03, 1, 4),
        new THREE.MeshLambertMaterial({ color: 0x606060 })
      );
      tail.position.set(0, cfg.h * 0.5, -cfg.l / 2 - 0.3);
      tail.rotation.x = 0.5;
      g.add(tail);

    } else if (type === 'rhino') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h * 0.7, cfg.l), mat);
      body.position.y = cfg.h * 0.5;
      body.castShadow = true;
      g.add(body);

      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.2), mat);
      head.position.set(0, cfg.h * 0.45, cfg.l / 2 + 0.5);
      g.add(head);

      // Horn
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.7, 5),
        new THREE.MeshLambertMaterial({ color: 0x333333 })
      );
      horn.position.set(0, cfg.h * 0.7, cfg.l / 2 + 0.8);
      g.add(horn);

      // Legs
      const legGeo = new THREE.CylinderGeometry(0.25, 0.3, cfg.h * 0.35, 5);
      for (const [lx, lz] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]]) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(lx, cfg.h * 0.17, lz);
        g.add(leg);
      }

    } else if (type === 'monkey') {
      // Body
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), mat);
      body.position.y = 0.6;
      g.add(body);

      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0xd2b48c })
      );
      head.position.set(0, 0.9, 0.1);
      g.add(head);

      // Tail
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.02, 0.6, 4),
        mat
      );
      tail.position.set(0, 0.5, -0.3);
      tail.rotation.x = 0.8;
      g.add(tail);

    } else if (type === 'goat') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h * 0.6, cfg.l), mat);
      body.position.y = cfg.h * 0.5;
      g.add(body);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.35, 0.35),
        new THREE.MeshLambertMaterial({ color: 0xe8e0d0 })
      );
      head.position.set(0, cfg.h * 0.55, cfg.l / 2 + 0.15);
      g.add(head);

      // Horns
      const hornMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      for (const side of [-0.1, 0.1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), hornMat);
        horn.position.set(side, cfg.h * 0.75, cfg.l / 2 + 0.1);
        g.add(horn);
      }

      // Legs
      const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.35, 4);
      const legMat = new THREE.MeshLambertMaterial({ color: 0xd0c8b0 });
      for (const [lx, lz] of [[-0.15, -0.25], [0.15, -0.25], [-0.15, 0.25], [0.15, 0.25]]) {
        g.add(new THREE.Mesh(legGeo, legMat).translateX(lx).translateY(0.17).translateZ(lz));
      }

    } else if (type === 'chicken') {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 5, 4),
        mat
      );
      body.position.y = 0.3;
      g.add(body);

      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 5, 4),
        new THREE.MeshLambertMaterial({ color: 0xcc0000 })
      );
      head.position.set(0, 0.45, 0.12);
      g.add(head);

      // Beak
      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.08, 3),
        new THREE.MeshLambertMaterial({ color: 0xff8800 })
      );
      beak.position.set(0, 0.42, 0.22);
      beak.rotation.x = Math.PI / 2;
      g.add(beak);

    } else {
      // Dog
      const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h * 0.6, cfg.l), mat);
      body.position.y = cfg.h * 0.5;
      g.add(body);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.35, 0.4),
        mat
      );
      head.position.set(0, cfg.h * 0.55, cfg.l / 2 + 0.15);
      g.add(head);

      // Ears
      const earMat = new THREE.MeshLambertMaterial({ color: 0x6b4226 });
      for (const side of [-0.15, 0.15]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.08), earMat);
        ear.position.set(side, cfg.h * 0.7, cfg.l / 2 + 0.15);
        g.add(ear);
      }

      // Tail
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.02, 0.4, 4),
        mat
      );
      tail.position.set(0, cfg.h * 0.55, -cfg.l / 2 - 0.1);
      tail.rotation.x = -0.8;
      g.add(tail);

      // Legs
      const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 4);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x7a5c32 });
      for (const [lx, lz] of [[-0.18, -0.25], [0.18, -0.25], [-0.18, 0.25], [0.18, 0.25]]) {
        g.add(new THREE.Mesh(legGeo, legMat).translateX(lx).translateY(0.12).translateZ(lz));
      }
    }

    return g;
  }

  update(delta, playerPosition) {
    const citySize = GRID_SIZE * CELL_SIZE;

    for (const a of this.animals) {
      // Flee from player if close
      const dx = a.position.x - playerPosition.x;
      const dz = a.position.z - playerPosition.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < 100) {
        // Flee
        const dist = Math.sqrt(distSq);
        a.direction.set(dx / dist, 0, dz / dist);
        a.rotation = Math.atan2(a.direction.x, a.direction.z);
        const fleeSpeed = a.speed * 2.5;
        a.position.x += a.direction.x * fleeSpeed * delta;
        a.position.z += a.direction.z * fleeSpeed * delta;
      } else {
        // Wander
        a.turnTimer -= delta;
        if (a.turnTimer <= 0) {
          a.turnTimer = 2 + Math.random() * 5;
          a.rotation += (Math.random() - 0.5) * Math.PI * 0.6;
          a.direction.set(Math.sin(a.rotation), 0, Math.cos(a.rotation));
        }

        a.position.x += a.direction.x * a.speed * delta;
        a.position.z += a.direction.z * a.speed * delta;
      }

      // Keep in bounds
      a.position.x = Math.max(-10, Math.min(citySize + 10, a.position.x));
      a.position.z = Math.max(-10, Math.min(citySize + 10, a.position.z));

      // Bob animation
      a.bobPhase += delta * 4;
      const bobY = a.type === 'chicken' ? Math.abs(Math.sin(a.bobPhase)) * 0.15 : 0;

      a.mesh.position.set(a.position.x, bobY, a.position.z);
      a.mesh.rotation.y = a.rotation;
    }
  }

  getColliders() {
    // Only elephants and rhinos are collision obstacles
    return this.animals.filter(a => a.type === 'elephant' || a.type === 'rhino');
  }

  reset() {
    for (const a of this.animals) this.scene.remove(a.mesh);
    this.animals = [];
    this.spawnAnimals();
  }

  seededRandom(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }
}
