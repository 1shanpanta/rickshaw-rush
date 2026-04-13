import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE } from './constants.js';

export class Police {
  constructor(scene, city, music) {
    this.scene = scene;
    this.city = city;
    this.music = music;

    this.active = false;
    this.position = new THREE.Vector3();
    this.rotation = 0;
    this.speed = 0;
    this.maxSpeed = 38;
    this.chaseTimer = 0;
    this.caughtPlayer = false;

    this.mesh = null;
    this.sirenLight = null;
    this.sirenPhase = 0;
    this.whistleTimer = 0;

    // Siren sound nodes
    this.sirenOsc = null;
    this.sirenGain = null;
    this.whistleOsc = null;
    this.whistleGain = null;

    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();
    this.mesh.visible = false;

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x222288 });

    // Bike body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.8), bodyMat);
    body.position.y = 0.6;
    this.mesh.add(body);

    // Rider
    const rider = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x334488 })
    );
    rider.position.set(0, 1.3, -0.2);
    this.mesh.add(rider);

    // Helmet
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    helmet.position.set(0, 2, -0.2);
    this.mesh.add(helmet);

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8);
    const wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const z of [0.7, -0.7]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(0, 0.3, z);
      this.mesh.add(w);
    }

    // Siren lights (red + blue)
    this.sirenRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this.sirenRed.position.set(-0.25, 1.15, 0.6);
    this.mesh.add(this.sirenRed);

    this.sirenBlue = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0x0000ff })
    );
    this.sirenBlue.position.set(0.25, 1.15, 0.6);
    this.mesh.add(this.sirenBlue);

    // Point light for siren glow
    this.sirenLight = new THREE.PointLight(0xff0000, 2, 15);
    this.sirenLight.position.set(0, 1.5, 0.6);
    this.mesh.add(this.sirenLight);

    // "POLICE" tag
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,50,0.7)';
    ctx.roundRect(2, 2, 124, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', 64, 17);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(3, 0.75, 1);
    sprite.position.y = 3;
    this.mesh.add(sprite);

    this.scene.add(this.mesh);
  }

  activate(playerPosition) {
    if (this.active) return;
    this.active = true;
    this.caughtPlayer = false;
    this.chaseTimer = 20;

    // Spawn behind player
    this.position.set(
      playerPosition.x - Math.sin(0) * 40,
      0,
      playerPosition.z - Math.cos(0) * 40
    );
    // Clamp to city
    const citySize = GRID_SIZE * CELL_SIZE;
    this.position.x = Math.max(5, Math.min(citySize - 5, this.position.x));
    this.position.z = Math.max(5, Math.min(citySize - 5, this.position.z));

    this.speed = 15;
    this.mesh.visible = true;

    this.startSiren();
    this.startWhistle();
  }

  startSiren() {
    if (!this.music?.ctx) return;
    const ctx = this.music.ctx;

    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 600;

    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0.03;

    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.music.masterGain);
    this.sirenOsc.start();
  }

  startWhistle() {
    if (!this.music?.ctx) return;
    const ctx = this.music.ctx;

    this.whistleOsc = ctx.createOscillator();
    this.whistleOsc.type = 'sine';
    this.whistleOsc.frequency.value = 2800;

    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;

    this.whistleOsc.connect(this.whistleGain);
    this.whistleGain.connect(this.music.masterGain);
    this.whistleOsc.start();
    this.whistleTimer = 0;
  }

  stopWhistle() {
    if (this.whistleOsc) {
      try { this.whistleOsc.stop(); } catch {}
      this.whistleOsc = null;
    }
    if (this.whistleGain) {
      this.whistleGain.gain.value = 0;
      this.whistleGain = null;
    }
  }

  stopSiren() {
    if (this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch {}
      this.sirenOsc = null;
    }
    if (this.sirenGain) {
      this.sirenGain.gain.value = 0;
      this.sirenGain = null;
    }
  }

  deactivate() {
    this.active = false;
    this.mesh.visible = false;
    this.stopSiren();
    this.stopWhistle();
  }

  // Water balloon hit — stun police briefly
  hitByBalloon() {
    if (!this.active) return;
    this.speed = 0;
    this.chaseTimer = Math.max(this.chaseTimer - 5, 1);
  }

  update(delta, playerPosition, buildingBounds) {
    if (!this.active) return null;

    this.chaseTimer -= delta;
    if (this.chaseTimer <= 0) {
      this.deactivate();
      return { type: 'escaped' };
    }

    // Siren animation
    this.sirenPhase += delta * 8;
    const flash = Math.sin(this.sirenPhase) > 0;
    this.sirenRed.material.color.setHex(flash ? 0xff0000 : 0x330000);
    this.sirenBlue.material.color.setHex(flash ? 0x000033 : 0x0000ff);
    this.sirenLight.color.setHex(flash ? 0xff0000 : 0x0000ff);
    this.sirenLight.intensity = 1.5 + Math.sin(this.sirenPhase * 2) * 1;

    // Siren sound wobble
    if (this.sirenOsc) {
      this.sirenOsc.frequency.value = 500 + Math.sin(this.sirenPhase * 0.5) * 200;
    }

    // Whistle bursts (short sharp blasts every ~2.5s)
    this.whistleTimer += delta;
    if (this.whistleGain) {
      const burstCycle = this.whistleTimer % 2.5;
      if (burstCycle < 0.15) {
        // First tweet
        this.whistleGain.gain.value = 0.06;
        this.whistleOsc.frequency.value = 2800 + burstCycle * 2000;
      } else if (burstCycle > 0.25 && burstCycle < 0.38) {
        // Second tweet (slightly higher)
        this.whistleGain.gain.value = 0.07;
        this.whistleOsc.frequency.value = 3200 + (burstCycle - 0.25) * 1500;
      } else {
        this.whistleGain.gain.value = 0;
      }
    }

    // Chase player
    const dx = playerPosition.x - this.position.x;
    const dz = playerPosition.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const desiredRot = Math.atan2(dx, dz);

    let rotDiff = desiredRot - this.rotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.rotation += rotDiff * Math.min(4 * delta, 1);

    this.speed += (this.maxSpeed - this.speed) * Math.min(3 * delta, 1);

    this.position.x += Math.sin(this.rotation) * this.speed * delta;
    this.position.z += Math.cos(this.rotation) * this.speed * delta;

    // Building collisions
    const pos = this.position;
    const r = 1;
    for (const b of buildingBounds) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const ddx = pos.x - cx;
      const ddz = pos.z - cz;
      const d = Math.sqrt(ddx * ddx + ddz * ddz);
      if (d < r && d > 0.001) {
        pos.x += (ddx / d) * (r - d);
        pos.z += (ddz / d) * (r - d);
        this.speed *= 0.5;
      }
    }

    const citySize = GRID_SIZE * CELL_SIZE;
    pos.x = Math.max(3, Math.min(citySize - 3, pos.x));
    pos.z = Math.max(3, Math.min(citySize - 3, pos.z));

    this.mesh.position.set(pos.x, 0, pos.z);
    this.mesh.rotation.y = this.rotation;

    // Caught player?
    if (dist < 3.5) {
      this.deactivate();
      return { type: 'caught' };
    }

    return null;
  }

  isActive() { return this.active; }

  reset() {
    this.deactivate();
  }
}
