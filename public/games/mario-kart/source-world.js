/** Optional local course pack; generated scenery remains the default fallback. */
import * as THREE from 'three';
import {GLTFLoader} from '/vendor/three-examples/loaders/GLTFLoader.js';
import {createSurfaceTrack} from './surface-track.js';
import {surfaceCameraCollision} from './surface-camera.js';
import {orientSourceScreen,loadSourceTvBrand} from './source-screens.js';
import {sourceCrowd} from './source-crowd.js';
import {sourceHelperMaterial} from './source-visible.js';
import {finishSourceFiltering,finishSourceAsphalt,finishSourceLights,isSourceAsphalt} from './source-materials.js';
export async function loadSourceWorld(scene, descriptor = {model:'stadium-source.glb',route:'stadium-route.json'}) {
  const local = file => {
    const url = new URL(file, location.origin+'/assets/mario-kart/');
    if(url.origin!==location.origin||!url.pathname.startsWith('/assets/mario-kart/'))throw new Error('Course files must belong to the local asset pack');
    return url.href;
  };
  const [asset,response]=await Promise.all([
    new GLTFLoader().loadAsync(local(descriptor.model)),
    fetch(local(descriptor.route)),
  ]);
  if(!response.ok)throw new Error(`Local course route: HTTP ${response.status}`);
  const route=await response.json(),root=asset.scene,screenMaterials=[];
  createSurfaceTrack(route); // Validate the entire route before adding or activating it.
  root.userData.dynamicScenery=true;
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(sourceHelperMaterial(o.material.name)){o.visible=false;return;}
    finishSourceFiltering(o.material);
    orientSourceScreen(o);
    finishSourceAsphalt(o.material);
    finishSourceLights(o.material);
    o.castShadow=o.receiveShadow=true;
    if(o.material.name==='fc_TV_capture'){
      o.material=new THREE.MeshBasicMaterial({map:o.material.map,side:THREE.DoubleSide});screenMaterials.push(o.material);
    } else if (!isSourceAsphalt(o.material.name) && o.material.isMeshStandardMaterial) {
      const m = o.material;
      o.material = new THREE.MeshLambertMaterial({
        name: m.name,
        color: m.color,
        map: m.map,
        emissive: m.emissive,
        emissiveMap: m.emissiveMap,
        emissiveIntensity: m.emissiveIntensity,
        vertexColors: m.vertexColors,
        transparent: m.transparent,
        opacity: m.opacity,
        alphaTest: m.alphaTest,
        side: m.side,
      });
    }
  });
  const tvBrand=await loadSourceTvBrand(root,descriptor.tvBrand,local);
  const statue=new THREE.Group();statue.userData.finishedModel=true;
  const avoidCamera=surfaceCameraCollision(root);
  const crowd=sourceCrowd(root);
  // Keep animated TV/crowd meshes dynamic, allow static stadium meshes to batch cleanly
  root.userData.dynamicScenery=false;
  crowd.mesh.userData.dynamicScenery=true;
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=false;
    o.receiveShadow=false;
    if(o.material&&!Array.isArray(o.material)){
      if(o.material.name==='fc_TV_capture'||screenMaterials.includes(o.material)||(tvBrand&&o.material===tvBrand.material)){
        o.userData.dynamicScenery=true;
      }
    }
  });
  scene.add(root);
  return {world:root,source:true,route,lights:[],fireworks:[],statue,screenMaterials,avoidCamera,tvBrand,update(t){crowd.update(t);tvBrand?.update(t);}};
}
