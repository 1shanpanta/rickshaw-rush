// Recursively dispose a Three.js object's geometry and materials
export function disposeMesh(obj) {
  if (!obj) return;
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
    else obj.material.dispose();
  }
  if (obj.children) {
    for (const child of obj.children) disposeMesh(child);
  }
}

// Remove from scene and dispose GPU resources
export function removeAndDispose(scene, obj) {
  scene.remove(obj);
  disposeMesh(obj);
}
