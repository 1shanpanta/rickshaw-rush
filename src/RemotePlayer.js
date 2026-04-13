import * as THREE from 'three';
import { removeAndDispose } from './utils.js';

export class RemotePlayer {
  constructor(scene, id, color, name) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = color;

    this.targetPos = new THREE.Vector3();
    this.targetRot = 0;
    this.speed = 0;
    this.boosting = false;

    this.mesh = this.createMesh(color);
    this.nameSprite = this.createNameTag(name, color);
    this.mesh.add(this.nameSprite);

    scene.add(this.mesh);
  }

  createMesh(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 4), mat);
    body.position.y = 1.3;
    body.castShadow = true;
    g.add(body);

    // Cabin
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.2), mat).translateY(1.4).translateZ(-0.6));

    // Roof
    const roofColor = new THREE.Color(color).multiplyScalar(0.8);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.2, 4.4),
      new THREE.MeshLambertMaterial({ color: roofColor })
    );
    roof.position.y = 2.5;
    g.add(roof);

    // Front
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    ).translateY(1).translateZ(2.2));

    // Accent stripe
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 0.15, 4.02),
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    ).translateY(0.6));

    // Headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for (const side of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), hlMat);
      hl.position.set(side, 1.2, 2.81);
      g.add(hl);
    }

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 8);
    const wMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [x, z] of [[0, 2], [-1.3, -1.2], [1.3, -1.2]]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.45, z);
      g.add(w);
    }

    return g;
  }

  createNameTag(name, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(8, 8, 240, 48, 8);
    ctx.fill();

    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.font = 'bold 28px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 12), 128, 34);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    sprite.position.y = 4;
    return sprite;
  }

  updateTarget(x, z, rotation, speed, boosting) {
    this.targetPos.set(x, 0, z);
    this.targetRot = rotation;
    this.speed = speed;
    this.boosting = boosting;
  }

  update(delta) {
    // Smooth interpolation
    const lerpSpeed = 12 * delta;
    this.mesh.position.lerp(this.targetPos, Math.min(lerpSpeed, 1));

    // Smooth rotation (handle wrapping)
    let rotDiff = this.targetRot - this.mesh.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.mesh.rotation.y += rotDiff * Math.min(lerpSpeed, 1);

    // Tilt based on speed
    const tilt = Math.sin(performance.now() * 0.01) * 0.01 * Math.abs(this.speed);
    this.mesh.rotation.z = tilt;
  }

  destroy() {
    removeAndDispose(this.scene, this.mesh);
  }
}
