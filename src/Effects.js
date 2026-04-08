import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.celebrations = [];
    this.sparks = [];
    this.debris = [];
    this.tireMarks = [];
    this.screenFlashEl = null;

    // Reusable geometries
    this._coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8);
    this._sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.15);
    this._debrisGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    this._tireMarkGeo = new THREE.PlaneGeometry(0.3, 0.8);
    this._tireMarkMat = new THREE.MeshBasicMaterial({
      color: 0x222222, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    });

    // Get or create screen flash overlay
    this.screenFlashEl = document.getElementById('screen-flash');
  }

  // --- Delivery celebration: gold coins burst ---
  spawnCelebration(position) {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const coin = new THREE.Mesh(
        this._coinGeo,
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xffd700 : i % 3 === 1 ? 0xffaa00 : 0xffee44,
          transparent: true, opacity: 1,
        })
      );
      coin.position.set(position.x, 2, position.z);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 4 + Math.random() * 5;

      this.scene.add(coin);
      this.celebrations.push({
        mesh: coin,
        vx: Math.cos(angle) * speed,
        vy: 5 + Math.random() * 4,
        vz: Math.sin(angle) * speed,
        spin: (Math.random() - 0.5) * 12,
        life: 1.0,
      });
    }

    // Screen gold flash
    if (this.screenFlashEl) {
      this.screenFlashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,215,0,0.3) 0%, transparent 70%)';
      this.screenFlashEl.style.opacity = '1';
      this.screenFlashEl.style.transition = 'opacity 0.4s ease-out';
      requestAnimationFrame(() => {
        this.screenFlashEl.style.opacity = '0';
      });
    }
  }

  // --- Drift sparks from rear wheels ---
  spawnSparks(position, rotation) {
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 2; i++) {
        const spark = new THREE.Mesh(
          this._sparkGeo,
          new THREE.MeshBasicMaterial({
            color: Math.random() > 0.4 ? 0xff8800 : 0xffcc00,
            transparent: true, opacity: 1,
          })
        );

        const ox = side * 1.3;
        spark.position.set(
          position.x - Math.sin(rotation) * 1.5 + Math.cos(rotation) * ox + (Math.random() - 0.5) * 0.4,
          0.1 + Math.random() * 0.2,
          position.z - Math.cos(rotation) * 1.5 - Math.sin(rotation) * ox + (Math.random() - 0.5) * 0.4
        );

        this.scene.add(spark);
        this.sparks.push({
          mesh: spark,
          vy: 0.8 + Math.random() * 1.5,
          life: 0.15 + Math.random() * 0.15,
        });
      }
    }
  }

  // --- Tire marks on road during drift ---
  spawnTireMark(position, rotation) {
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(this._tireMarkGeo, this._tireMarkMat.clone());
      const ox = side * 1.2;
      mark.position.set(
        position.x - Math.sin(rotation) * 1.2 + Math.cos(rotation) * ox,
        0.02,
        position.z - Math.cos(rotation) * 1.2 - Math.sin(rotation) * ox
      );
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = -rotation;
      this.scene.add(mark);
      this.tireMarks.push({ mesh: mark, life: 3.0 });
    }
  }

  // --- Collision debris ---
  spawnDebris(position, color) {
    const count = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const size = 0.08 + Math.random() * 0.18;
      const debris = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size * (0.5 + Math.random())),
        new THREE.MeshLambertMaterial({
          color: color || (0x666666 + Math.floor(Math.random() * 0x444444)),
          transparent: true, opacity: 1,
        })
      );
      debris.position.copy(position);
      debris.position.y = 0.8 + Math.random() * 0.5;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;

      this.scene.add(debris);
      this.debris.push({
        mesh: debris,
        vx: Math.cos(angle) * speed,
        vy: 2.5 + Math.random() * 3,
        vz: Math.sin(angle) * speed,
        rotX: (Math.random() - 0.5) * 10,
        rotY: (Math.random() - 0.5) * 8,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1.0,
      });
    }
  }

  // --- Near-miss whoosh lines (radial speed lines in 3D) ---
  spawnNearMissFlash() {
    if (this.screenFlashEl) {
      this.screenFlashEl.style.background = 'radial-gradient(ellipse at center, rgba(244,114,182,0.2) 0%, transparent 60%)';
      this.screenFlashEl.style.opacity = '1';
      this.screenFlashEl.style.transition = 'opacity 0.3s ease-out';
      requestAnimationFrame(() => {
        this.screenFlashEl.style.opacity = '0';
      });
    }
  }

  // --- Combo milestone flash ---
  spawnComboFlash() {
    if (this.screenFlashEl) {
      this.screenFlashEl.style.background = 'radial-gradient(ellipse at center, rgba(34,211,238,0.25) 0%, transparent 65%)';
      this.screenFlashEl.style.opacity = '1';
      this.screenFlashEl.style.transition = 'opacity 0.5s ease-out';
      requestAnimationFrame(() => {
        this.screenFlashEl.style.opacity = '0';
      });
    }
  }

  update(delta) {
    // --- Celebrations ---
    for (let i = this.celebrations.length - 1; i >= 0; i--) {
      const c = this.celebrations[i];
      c.life -= delta;
      c.vy -= 10 * delta;
      c.mesh.position.x += c.vx * delta;
      c.mesh.position.y += c.vy * delta;
      c.mesh.position.z += c.vz * delta;
      c.mesh.rotation.x += c.spin * delta;
      c.mesh.rotation.z += c.spin * 0.7 * delta;
      c.mesh.material.opacity = Math.max(0, c.life);
      if (c.life <= 0 || c.mesh.position.y < -0.5) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        this.celebrations.splice(i, 1);
      }
    }

    // --- Sparks ---
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= delta;
      s.mesh.position.y += s.vy * delta;
      s.vy -= 6 * delta;
      s.mesh.material.opacity = Math.max(0, s.life * 4);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.sparks.splice(i, 1);
      }
    }

    // --- Debris ---
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= delta;
      d.vy -= 10 * delta;
      d.mesh.position.x += d.vx * delta;
      d.mesh.position.y += d.vy * delta;
      d.mesh.position.z += d.vz * delta;
      d.mesh.rotation.x += d.rotX * delta;
      d.mesh.rotation.y += d.rotY * delta;
      if (d.mesh.position.y < 0) {
        d.mesh.position.y = 0;
        d.vy *= -0.3;
        d.vx *= 0.7;
        d.vz *= 0.7;
      }
      d.mesh.material.opacity = Math.max(0, d.life / d.maxLife);
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.debris.splice(i, 1);
      }
    }

    // --- Tire marks fade ---
    for (let i = this.tireMarks.length - 1; i >= 0; i--) {
      const tm = this.tireMarks[i];
      tm.life -= delta;
      tm.mesh.material.opacity = Math.max(0, tm.life / 3.0 * 0.3);
      if (tm.life <= 0) {
        this.scene.remove(tm.mesh);
        tm.mesh.material.dispose();
        this.tireMarks.splice(i, 1);
      }
    }
  }

  cleanup() {
    const remove = (arr) => {
      for (const item of arr) {
        this.scene.remove(item.mesh);
        if (item.mesh.material.dispose) item.mesh.material.dispose();
        if (item.mesh.geometry?.dispose) item.mesh.geometry.dispose();
      }
      arr.length = 0;
    };
    remove(this.celebrations);
    remove(this.sparks);
    remove(this.debris);
    remove(this.tireMarks);
  }
}
