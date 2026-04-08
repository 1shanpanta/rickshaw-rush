import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE, TRAFFIC_LIGHT } from './constants.js';

export class TrafficLights {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.lights = [];
    this.powerCut = false;
    this.powerCutTimer = 0;
    this.createLights();
  }

  createLights() {
    const cyclePeriod = TRAFFIC_LIGHT.greenDuration + TRAFFIC_LIGHT.yellowDuration + TRAFFIC_LIGHT.redDuration;
    let idx = 0;

    for (let x = 3; x < GRID_SIZE - 1; x += 3) {
      for (let z = 3; z < GRID_SIZE - 1; z += 3) {
        if (!this.city.isRoad(x, z)) continue;

        const px = x * CELL_SIZE + CELL_SIZE / 2;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;

        const offset = ((idx++) * 4.7) % cyclePeriod;
        const light = this.buildLightMesh(px, pz, offset);
        this.lights.push(light);
      }
    }
  }

  buildLightMesh(px, pz, timeOffset) {
    const group = new THREE.Group();

    // Place at corner of intersection
    const cornerX = px + CELL_SIZE * 0.42;
    const cornerZ = pz + CELL_SIZE * 0.42;

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(cornerX, 2.75, cornerZ);
    group.add(pole);

    // Housing
    const housingGeo = new THREE.BoxGeometry(0.7, 2.2, 0.7);
    const housingMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(cornerX, 5.6, cornerZ);
    group.add(housing);

    // Light spheres
    const lightRadius = 0.22;
    const lightGeo = new THREE.SphereGeometry(lightRadius, 8, 8);

    const redMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const offMat = new THREE.MeshBasicMaterial({ color: 0x222222 });

    const redMesh = new THREE.Mesh(lightGeo, redMat.clone());
    redMesh.position.set(cornerX, 6.3, cornerZ + 0.36);
    group.add(redMesh);

    const yellowMesh = new THREE.Mesh(lightGeo, yellowMat.clone());
    yellowMesh.position.set(cornerX, 5.6, cornerZ + 0.36);
    group.add(yellowMesh);

    const greenMesh = new THREE.Mesh(lightGeo, greenMat.clone());
    greenMesh.position.set(cornerX, 4.9, cornerZ + 0.36);
    group.add(greenMesh);

    // Ground glow indicator
    const glowGeo = new THREE.RingGeometry(2, 3.5, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(px, 0.05, pz);
    group.add(glow);

    this.scene.add(group);

    return {
      position: new THREE.Vector3(px, 0, pz),
      state: 'green',
      timer: timeOffset,
      meshes: { red: redMesh, yellow: yellowMesh, green: greenMesh },
      glow,
      glowMat,
      offMat,
      radius: CELL_SIZE * 0.55,
    };
  }

  startPowerCut(duration) {
    this.powerCut = true;
    this.powerCutTimer = duration;
    for (const l of this.lights) {
      l.state = 'off';
      l.meshes.red.material.color.setHex(0x220000);
      l.meshes.yellow.material.color.setHex(0x221100);
      l.meshes.green.material.color.setHex(0x002200);
      l.glowMat.opacity = 0;
    }
  }

  endPowerCut() {
    this.powerCut = false;
    this.powerCutTimer = 0;
  }

  update(delta) {
    // Power cut countdown
    if (this.powerCut) {
      this.powerCutTimer -= delta;
      if (this.powerCutTimer <= 0) {
        this.endPowerCut();
      } else {
        // Flicker effect — random lights briefly flash
        for (const l of this.lights) {
          if (Math.random() < 0.002) {
            const flicker = Math.random() > 0.5 ? 0xff0000 : 0xffcc00;
            l.meshes.red.material.color.setHex(flicker === 0xff0000 ? 0x440000 : 0x220000);
            l.meshes.yellow.material.color.setHex(flicker === 0xffcc00 ? 0x443300 : 0x221100);
          } else {
            l.meshes.red.material.color.setHex(0x220000);
            l.meshes.yellow.material.color.setHex(0x221100);
          }
        }
        return;
      }
    }

    const gD = TRAFFIC_LIGHT.greenDuration;
    const yD = TRAFFIC_LIGHT.yellowDuration;
    const rD = TRAFFIC_LIGHT.redDuration;
    const cycle = gD + yD + rD;

    for (const l of this.lights) {
      l.timer += delta;
      const t = l.timer % cycle;

      let newState;
      if (t < gD) newState = 'green';
      else if (t < gD + yD) newState = 'yellow';
      else newState = 'red';

      if (newState !== l.state) {
        l.state = newState;

        // Update light materials
        l.meshes.red.material.color.setHex(newState === 'red' ? 0xff0000 : 0x330000);
        l.meshes.yellow.material.color.setHex(newState === 'yellow' ? 0xffcc00 : 0x332200);
        l.meshes.green.material.color.setHex(newState === 'green' ? 0x00ff00 : 0x003300);

        // Update ground glow
        const glowColors = { green: 0x00ff00, yellow: 0xffcc00, red: 0xff0000 };
        l.glowMat.color.setHex(glowColors[newState]);
        l.glowMat.opacity = newState === 'red' ? 0.12 : 0.06;
      }
    }
  }

  getStateAt(position) {
    if (this.powerCut) return null;
    for (const l of this.lights) {
      const dx = position.x - l.position.x;
      const dz = position.z - l.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < l.radius) {
        return l.state;
      }
    }
    return null;
  }

  isPowerCut() { return this.powerCut; }

  getLights() {
    return this.lights;
  }
}
