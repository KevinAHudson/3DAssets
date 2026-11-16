// Load objects from the library into a three.js scene.
//   import { loadObject } from '<path to>/library/kit/library.js';
//   const drone = await loadObject('<url of>/library/objects/drone.glb');
//   scene.add(drone);  drone.getObjectByName('rotor_1').rotation.y = t * 40;
// Objects keep their part names, so a short can still pose and animate them.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const cache = new Map();

export async function loadObject(url) {
  if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url).then((g) => g.scene));
  return (await cache.get(url)).clone(true);
}

export function exportObject(object) {
  return new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: false });
}
