import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.screenFlashEl = document.getElementById('screen-flash');
  }

  // --- Near-miss flash ---
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

  update(delta) {}

  cleanup() {}
}
