import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE } from './constants.js';

export class Navigation {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.arrows = [];
    this.active = false;

    // Create a pool of arrow meshes
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 1.2);
    arrowShape.lineTo(-0.7, 0);
    arrowShape.lineTo(-0.25, 0);
    arrowShape.lineTo(-0.25, -1);
    arrowShape.lineTo(0.25, -1);
    arrowShape.lineTo(0.25, 0);
    arrowShape.lineTo(0.7, 0);
    arrowShape.closePath();

    this.arrowGeo = new THREE.ShapeGeometry(arrowShape);
    this.arrowMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    // Pre-create arrow pool
    for (let i = 0; i < 20; i++) {
      const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.08;
      mesh.visible = false;
      this.scene.add(mesh);
      this.arrows.push(mesh);
    }
  }

  update(playerPos, targetPos) {
    // Hide all arrows first
    for (const a of this.arrows) a.visible = false;

    if (!targetPos) {
      this.active = false;
      return;
    }

    this.active = true;

    // Find path from player to target using simple grid-following
    const path = this.findPath(playerPos, targetPos);

    // Place arrows along the path
    const time = performance.now() * 0.003;
    for (let i = 0; i < Math.min(path.length, this.arrows.length); i++) {
      const arrow = this.arrows[i];
      const wp = path[i];

      arrow.position.set(wp.x, 0.08, wp.z);
      arrow.rotation.z = wp.angle;

      // Fade based on distance from player
      const dx = wp.x - playerPos.x;
      const dz = wp.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Pulse animation
      const pulse = 0.2 + Math.sin(time * 3 + i * 0.5) * 0.1;
      arrow.material.opacity = dist < 8 ? pulse * 0.5 : dist > 60 ? 0 : pulse;
      arrow.scale.setScalar(1 + Math.sin(time * 2 + i * 0.8) * 0.1);
      arrow.visible = dist > 5 && dist < 65;
    }
  }

  findPath(from, to) {
    const waypoints = [];
    const gridFrom = this.worldToGrid(from);
    const gridTo = this.worldToGrid(to);

    // Simple greedy path along road grid
    let cx = gridFrom.x;
    let cz = gridFrom.z;
    const tx = gridTo.x;
    const tz = gridTo.z;

    const visited = new Set();
    let steps = 0;

    while ((cx !== tx || cz !== tz) && steps < 30) {
      steps++;
      const key = `${cx},${cz}`;
      if (visited.has(key)) break;
      visited.add(key);

      // Snap to nearest road cell
      const nearRoadX = Math.round(cx / 3) * 3;
      const nearRoadZ = Math.round(cz / 3) * 3;

      // Move toward target preferring road cells
      let bestDx = 0, bestDz = 0, bestDist = Infinity;

      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (!this.city.isRoad(nx, nz)) continue;

        const dist = Math.abs(nx - tx) + Math.abs(nz - tz);
        if (dist < bestDist) {
          bestDist = dist;
          bestDx = dx;
          bestDz = dz;
        }
      }

      if (bestDx === 0 && bestDz === 0) {
        // No road neighbor, try moving to nearest road
        cx = nearRoadX;
        cz = nearRoadZ;
        continue;
      }

      cx += bestDx;
      cz += bestDz;

      const worldX = cx * CELL_SIZE + CELL_SIZE / 2;
      const worldZ = cz * CELL_SIZE + CELL_SIZE / 2;
      const angle = Math.atan2(bestDx, bestDz);

      waypoints.push({ x: worldX, z: worldZ, angle });
    }

    return waypoints;
  }

  worldToGrid(pos) {
    return {
      x: Math.floor(pos.x / CELL_SIZE),
      z: Math.floor(pos.z / CELL_SIZE),
    };
  }
}
