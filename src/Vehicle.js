import * as THREE from 'three';
import { VEHICLE, COLORS } from './constants.js';

export class Vehicle {
  constructor(scene) {
    this.scene = scene;
    this.position = new THREE.Vector3();
    this.rotation = 0;
    this.speed = 0;
    this.mesh = null;

    // Boost
    this.boosting = false;
    this.boostFuel = VEHICLE.boostDuration;
    this.boostCooldownTimer = 0;

    // Honk
    this.honking = false;
    this.honkCooldown = 0;

    // Grip (reduced in rain)
    this.gripMultiplier = 1;

    // Upgrade mods (set by Game.applyUpgrades)
    this.maxSpeedMod = 1;
    this.brakeMod = 1;
    this.boostDurationMod = 1;

    // Visual
    this.tiltAngle = 0;
    this.wheelMeshes = [];
    this.boostFlame = null;

    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.rickshaw.body });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 4), bodyMat);
    body.position.y = 1.3;
    body.castShadow = true;
    this.mesh.add(body);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.6, 2.2),
      bodyMat
    );
    cabin.position.set(0, 1.4, -0.6);
    this.mesh.add(cabin);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.2, 4.4),
      new THREE.MeshLambertMaterial({ color: COLORS.rickshaw.roof })
    );
    roof.position.y = 2.5;
    this.mesh.add(roof);

    // Front nose
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    nose.position.set(0, 1, 2.2);
    this.mesh.add(nose);

    // Windshield
    const ws = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 })
    );
    ws.position.set(0, 2, 1.8);
    ws.rotation.x = -0.15;
    this.mesh.add(ws);

    // Gold stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 0.15, 4.02),
      new THREE.MeshBasicMaterial({ color: COLORS.rickshaw.accent })
    );
    stripe.position.y = 0.6;
    this.mesh.add(stripe);

    // Headlights
    const hMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for (const side of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), hMat);
      hl.position.set(side, 1.2, 2.81);
      this.mesh.add(hl);
    }

    // Tail lights
    const tMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), tMat);
      tl.position.set(side, 1, -2.01);
      this.mesh.add(tl);
    }

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10);
    const wMat = new THREE.MeshLambertMaterial({ color: COLORS.rickshaw.wheel });
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 6);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x666666 });

    const makeWheel = (x, z) => {
      const g = new THREE.Group();
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      g.add(w);
      g.add(new THREE.Mesh(hubGeo, hubMat).rotateZ(Math.PI / 2));
      g.position.set(x, 0.45, z);
      this.mesh.add(g);
      this.wheelMeshes.push(g);
    };

    makeWheel(0, 2);
    makeWheel(-1.3, -1.2);
    makeWheel(1.3, -1.2);

    // Boost flame (hidden by default) -- big and dramatic
    this.boostFlame = new THREE.Group();
    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 2.5, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 })
    );
    flameCore.rotation.x = Math.PI / 2;
    this.boostFlame.add(flameCore);
    const flameOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 3.5, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
    );
    flameOuter.rotation.x = Math.PI / 2;
    this.boostFlame.add(flameOuter);
    const flameGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending })
    );
    this.boostFlame.add(flameGlow);
    this.boostFlame.position.set(0, 0.8, -2.8);
    this.boostFlame.visible = false;
    this.mesh.add(this.boostFlame);

    this.scene.add(this.mesh);
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.mesh.position.copy(this.position);
  }

  getSpeedKmh() {
    return Math.round(Math.abs(this.speed) * 2.4);
  }

  update(delta, input) {
    // Honk
    if (this.honkCooldown > 0) this.honkCooldown -= delta;
    this.honking = false;
    if (input.honk && this.honkCooldown <= 0) {
      this.honking = true;
      this.honkCooldown = 0.4;
    }

    // Boost
    if (this.boostCooldownTimer > 0) this.boostCooldownTimer -= delta;

    if (input.boost && this.boostFuel > 0 && this.boostCooldownTimer <= 0 && this.speed > 5) {
      this.boosting = true;
      this.boostFuel -= delta;
      if (this.boostFuel <= 0) {
        this.boostFuel = 0;
        this.boostCooldownTimer = VEHICLE.boostCooldown;
        this.boosting = false;
      }
    } else {
      this.boosting = false;
      const boostMax = VEHICLE.boostDuration * this.boostDurationMod;
      if (this.boostCooldownTimer <= 0 && this.boostFuel < boostMax) {
        this.boostFuel = Math.min(boostMax, this.boostFuel + delta * 0.4);
      }
    }

    // Boost flame
    this.boostFlame.visible = this.boosting;
    if (this.boosting) {
      const flicker = 0.8 + Math.random() * 0.5;
      this.boostFlame.scale.set(flicker, flicker, 0.7 + Math.random() * 0.6);
      this.boostFlame.rotation.z = (Math.random() - 0.5) * 0.3;
    }

    const maxSpd = (this.boosting ? VEHICLE.boostSpeed : VEHICLE.maxSpeed) * this.maxSpeedMod;

    // Acceleration
    if (input.forward) {
      this.speed += VEHICLE.acceleration * delta;
    } else if (input.backward) {
      if (this.speed > 0) {
        this.speed -= VEHICLE.brakeForce * this.brakeMod * delta;
      } else {
        this.speed -= VEHICLE.acceleration * 0.5 * delta;
      }
    } else {
      if (Math.abs(this.speed) < 0.8) {
        this.speed = 0;
      } else {
        this.speed -= Math.sign(this.speed) * VEHICLE.friction * delta;
      }
    }

    this.speed = Math.max(-VEHICLE.reverseMaxSpeed, Math.min(maxSpd, this.speed));

    // Turning (affected by grip)
    const absSpeed = Math.abs(this.speed);
    const turnFactor = Math.min(absSpeed / 10, 1);
    const speedSign = this.speed >= 0 ? 1 : -1;
    const grip = this.gripMultiplier;

    if (input.left) {
      this.rotation += VEHICLE.turnSpeed * turnFactor * delta * speedSign * grip;
    }
    if (input.right) {
      this.rotation -= VEHICLE.turnSpeed * turnFactor * delta * speedSign * grip;
    }

    // Sliding in rain (reduced grip causes drift)
    if (grip < 1 && absSpeed > 15 && (input.left || input.right)) {
      const drift = (1 - grip) * 0.3 * absSpeed * delta;
      const perpX = Math.cos(this.rotation);
      const perpZ = -Math.sin(this.rotation);
      const driftDir = input.left ? 1 : -1;
      this.position.x += perpX * drift * driftDir;
      this.position.z += perpZ * drift * driftDir;
    }

    // Move
    this.position.x += Math.sin(this.rotation) * this.speed * delta;
    this.position.z += Math.cos(this.rotation) * this.speed * delta;

    // Terrain height (set by Game each frame via city.getTerrainHeight)
    const terrainY = this.terrainHeight || 0;
    this.position.y = terrainY;

    // Mesh update
    this.mesh.position.set(this.position.x, terrainY, this.position.z);
    this.mesh.rotation.y = this.rotation;

    // Tilt
    const targetTilt = (input.left ? 0.06 : input.right ? -0.06 : 0) * turnFactor;
    this.tiltAngle += (targetTilt - this.tiltAngle) * Math.min(8 * delta, 1);
    this.mesh.rotation.z = this.tiltAngle;

    // Wheel spin
    const spin = this.speed * 2 * delta;
    for (const w of this.wheelMeshes) {
      w.children[0].rotation.x += spin;
    }
  }

  checkSpeedBumps(bumps) {
    for (const bp of bumps) {
      const dx = this.position.x - bp.x;
      const dz = this.position.z - bp.z;
      if (Math.abs(dx) < 8 && Math.abs(dz) < 1.5 && Math.abs(this.speed) > 10) {
        this.speed *= 0.6;
        return true;
      }
    }
    return false;
  }
}
