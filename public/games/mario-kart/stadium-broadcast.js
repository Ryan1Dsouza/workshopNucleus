import * as THREE from "three";
/** Low-resolution GPU-only race feed for the arena screens. */
export function stadiumBroadcast(renderer, scene, materials, {width=192,height=108} = {}) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  const camera = new THREE.PerspectiveCamera(58, width / height, 0.3, 180);
  const originals = materials.map((m) => m.map);
  let nextFrame = 0,
    frames = 0, onScreen = false;
  for (const m of materials) {
    const beforeRender = m.onBeforeRender;
    m.onBeforeRender = function(...args) {
      beforeRender.apply(this, args);
      if (!renderer.getRenderTarget()) onScreen = true;
    };
  }
  return {
    get frames() {
      return frames;
    },
    async compile() {
      const previous=renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        await renderer.compileAsync(scene,camera);
      } finally { renderer.setRenderTarget(previous); }
    },
    update(now, chaseCamera, dt) {
      const visible = onScreen;
      onScreen = false;
      if (!visible || now < nextFrame || dt > .022) return;
      nextFrame = now + 333;
      camera.position.copy(chaseCamera.position);
      camera.quaternion.copy(chaseCamera.quaternion);
      camera.fov = chaseCamera.fov;
      camera.updateProjectionMatrix();
      const previous = renderer.getRenderTarget();
      // Sampling the render target while writing it is an invalid framebuffer
      // feedback loop. The broadcast sees the original standby screen artwork.
      for (let i = 0; i < materials.length; i++)
        materials[i].map = originals[i];
      try {
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, camera);
        frames++;
      } finally {
        renderer.setRenderTarget(previous);
        for (const m of materials) m.map = target.texture;
      }
    },
  };
}
