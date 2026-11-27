/** Static scenery collision for the chase camera; independent of driving physics. */
import * as THREE from "three";
export function cameraCollision(root) {
  root.updateMatrixWorld(true);
  const cells = new Map(),
    cellSize = 12;
  root.traverse((object) => {
    // Trackside walls, sign backing, garages and columns. Keep the original
    // oriented geometry for the narrow test; a world AABB alone over-pulls corners.
    if (!object.isMesh || object.geometry.type !== "BoxGeometry") return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox
      .clone()
      .applyMatrix4(object.matrixWorld);
    if (bounds.max.y - bounds.min.y < 0.3) return;
    const copy = object.clone(false);
    copy.matrixAutoUpdate = false;
    copy.matrixWorld.copy(object.matrixWorld);
    for (
      let x = Math.floor(bounds.min.x / cellSize);
      x <= Math.floor(bounds.max.x / cellSize);
      x++
    )
      for (
        let z = Math.floor(bounds.min.z / cellSize);
        z <= Math.floor(bounds.max.z / cellSize);
        z++
      ) {
        const key = x + "," + z;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(copy);
      }
  });
  const ray = new THREE.Raycaster(), direction=new THREE.Vector3(), candidates=new Set(), hits=[];
  return (focus, eye, out=new THREE.Vector3()) => {
    direction.subVectors(eye,focus);
    const length = direction.length();
    if (length < 0.01) return out.copy(eye);
    direction.divideScalar(length);
    ray.set(focus, direction);
    ray.near = 0.05;
    ray.far = length;
    candidates.clear();
    for (
      let x = Math.floor(Math.min(focus.x, eye.x) / cellSize);
      x <= Math.floor(Math.max(focus.x, eye.x) / cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(focus.z, eye.z) / cellSize);
        z <= Math.floor(Math.max(focus.z, eye.z) / cellSize);
        z++
      )
        for (const object of cells.get(x + "," + z) || [])
          candidates.add(object);
    let nearest = length;
    for (const object of candidates) {
      hits.length=0;
      ray.intersectObject(object, false, hits);
      if (hits.length) nearest = Math.min(nearest, hits[0].distance);
    }
    return nearest < length
      ? out.copy(focus).addScaledVector(direction, Math.max(0.15, nearest - 0.45))
      : out.copy(eye);
  };
}
