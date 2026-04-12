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
    this.headlightsOn = true;

    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.rickshaw.body });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 5.5), bodyMat);
    body.position.y = 1.3;
    body.castShadow = true;
    this.mesh.add(body);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2.2, 3),
      bodyMat
    );
    cabin.position.set(0, 1.8, -0.8);
    this.mesh.add(cabin);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.25, 6),
      new THREE.MeshLambertMaterial({ color: COLORS.rickshaw.roof })
    );
    roof.position.y = 3.2;
    this.mesh.add(roof);

    // Front nose
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.6, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    nose.position.set(0, 1.3, 3);
    this.mesh.add(nose);

    // Windshield
    const ws = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 })
    );
    ws.position.set(0, 2.6, 2.4);
    ws.rotation.x = -0.15;
    this.mesh.add(ws);

    // Gold stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(3.22, 0.18, 5.52),
      new THREE.MeshBasicMaterial({ color: COLORS.rickshaw.accent })
    );
    stripe.position.y = 0.8;
    this.mesh.add(stripe);

    // Headlights (visual + actual SpotLights)
    const hMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    this.headlightTargets = [];
    this.headlights = [];
    for (const side of [-0.9, 0.9]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), hMat);
      hl.position.set(side, 1.5, 3.6);
      this.mesh.add(hl);

      // Light target (point ahead of the vehicle)
      const target = new THREE.Object3D();
      target.position.set(side, 0, 18);
      this.mesh.add(target);

      const spot = new THREE.SpotLight(0xfff8e0, 5, 60, Math.PI / 4.5, 0.4, 1.2);
      spot.position.set(side, 1.6, 3.7);
      spot.target = target;
      spot.castShadow = false;
      this.mesh.add(spot);
      this.headlights.push(spot);
      this.headlightTargets.push(target);

      // Visible light cone mesh
      const coneGeo = new THREE.ConeGeometry(3.5, 18, 8, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffeeaa,
        transparent: true,
        opacity: 0.04,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(side, 1.0, 12);
      this.mesh.add(cone);
      this.headlights.push(cone); // track for toggle
    }

    // Soft ground glow (pooled light beneath vehicle for road visibility)
    this.groundGlow = new THREE.PointLight(0xffeedd, 2.5, 35, 1.8);
    this.groundGlow.position.set(0, 2.5, 6);
    this.mesh.add(this.groundGlow);

    // Headlight glow spheres (visual feedback that lights are on)
    this.headlightGlows = [];
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    for (const side of [-0.9, 0.9]) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), glowMat);
      glow.position.set(side, 1.5, 3.65);
      this.mesh.add(glow);
      this.headlightGlows.push(glow);
    }

    // Tail lights
    const tMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const side of [-1.3, 1.3]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.05), tMat);
      tl.position.set(side, 1.3, -2.8);
      this.mesh.add(tl);
    }

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.45, 10);
    const wMat = new THREE.MeshLambertMaterial({ color: COLORS.rickshaw.wheel });
    const hubGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.46, 6);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x666666 });

    const makeWheel = (x, z) => {
      const g = new THREE.Group();
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      g.add(w);
      g.add(new THREE.Mesh(hubGeo, hubMat).rotateZ(Math.PI / 2));
      g.position.set(x, 0.6, z);
      this.mesh.add(g);
      this.wheelMeshes.push(g);
    };

    makeWheel(0, 2.8);
    makeWheel(-1.7, -1.6);
    makeWheel(1.7, -1.6);

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

  toggleHeadlights() {
    this.headlightsOn = !this.headlightsOn;
    for (const obj of this.headlights) obj.visible = this.headlightsOn;
    this.groundGlow.visible = this.headlightsOn;
    for (const g of this.headlightGlows) g.visible = this.headlightsOn;
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
