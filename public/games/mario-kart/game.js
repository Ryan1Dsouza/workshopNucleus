import {KartMatch} from './online.js';
import {createPose,samplePose} from './render-pose.js';
import {RenderBudget} from '../../core/render-budget.js';
import * as menu from './menu.mjs';
import {itemRoulette} from "./item-roulette.js";
import {raceEffects} from "./race-effects.js";
import {itemPortraits} from "./item-portraits.js";
import {raceLettering,lapBoard} from "./hud-lettering.js";
import {boostScreen} from "./boost-screen.js";
import { RoundedBoxGeometry } from "/vendor/three-examples/geometries/RoundedBoxGeometry.js";
import { makeHoverGlow, updateHoverGlow } from "./hover-effects.js";
import { updateDriverLook } from "./driver-look.js";
import { makeItemModel } from "./item-models.js";
import { updateHeldItem, heldItemOrigin, createHeldMushroom } from "./held-item.js";
import { rivalVisible } from "./rival-visibility.js";
import { driverCameraAnchor } from "./driver-camera-anchor.js";
import { clearChaseView, clearanceLookTarget, smoothChaseCorrection } from "./chase-clearance.js";
import { stadiumBroadcast } from "./stadium-broadcast.js";
import { raceNumerals } from "./hud-numerals.js";
import { cameraCollision } from "./camera-collision.js";
import * as THREE from "three";
import { updateSourceWheel } from './source-wheel.js';
import { updateGlider } from './glider-animation.js';
import { makeBoostEffect, updateBoostEffect } from './boost-effect.js';
import { updateStarModel, makeStarAura, updateStarAura } from './star-effect.js';
import { mergeGeometries } from "/vendor/three-examples/utils/BufferGeometryUtils.js";
import { GameLink } from "../../core/net.js";
import {
  Race,
  CHARACTERS,
  ITEMS,
  ordinal,
  formatTime,
  seeded,
} from "./logic.js";
import {
  activeSurfaceTrack,
  useSourceTrack,
  trackAt,
  surfaceAt,
  TRACK_LENGTH as L,
  TRACK_SAMPLES,
  SECTIONS,
  clamp,
  angle,
  wrap,
} from "./track.js";
import { addAtmosphere } from "./atmosphere.js";
import { roadFrame, chasePose, cameraClearance } from "./visual-frame.js";
import { WheelInput } from "./input.js";
import { KartAudio } from "./audio.js";
import {
  proceduralKart,
  loadKartPack,
  makeGlider,
  rigWheels,
  disposeModel,
} from "./models.js";
import { buildWorld, canvasTexture, yieldDuringLoad } from "./world.js";
import { ITEM_ICONS, portrait } from "./icons.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  V = THREE.Vector3;
const renderedItemIcons=itemPortraits();
const updateItemReel=itemRoulette($("item-icon"),{...ITEM_ICONS,...renderedItemIcons},ITEMS);
const updateBoostScreen=boostScreen($("speed-lines"));
let boostFeedback={strength:0,kick:0};
window.addEventListener("error", (e) => {
  $("error").hidden = false;
  $("error").textContent = "The race could not load: " + e.message;
});
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
const renderBudget=new RenderBudget();
const updatePixelRatio=()=>renderer.setPixelRatio(Math.min(devicePixelRatio,1)*renderBudget.scale);
updatePixelRatio();
let viewportWidth = innerWidth, viewportHeight = innerHeight;
renderer.setSize(viewportWidth, viewportHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
const effects=raceEffects(scene,seeded(8703));
scene.background = new THREE.Color("#081325");
scene.fog = new THREE.FogExp2("#111c30", 0.0014);
const camera = new THREE.PerspectiveCamera(
  59,
  innerWidth / innerHeight,
  0.2,
  520,
);
scene.add(new THREE.HemisphereLight("#c2dcff", "#38415a", 0.95));
const key = new THREE.DirectionalLight("#fff5e4", 1.65);
key.castShadow = false;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight("#8bc4ff", 0.5);
fill.position.set(-80, 70, 20);
scene.add(fill);
const coursePreference = new URLSearchParams(location.search).get('sourceCourse') || '0';
let courseDescriptor = null;
if (coursePreference === '1') {
  try {
    const response = await fetch('/assets/mario-kart/manifest.json');
    if (response.ok) courseDescriptor = (await response.json()).course || null;
  } catch { /* An optional local pack is not required to play. */ }
  if (!courseDescriptor) courseDescriptor = {model:'stadium-source.glb',route:'stadium-route.json'};
}
let world;
if (courseDescriptor) {
  try {
    const { loadSourceWorld } = await import('./source-world.js');
    world = await loadSourceWorld(scene, courseDescriptor);
  }
  catch (error) { console.warn('Local course pack unavailable; using built-in course:', error.message); }
}
if (!world) world = await buildWorld(scene);
if (world.source) {
  useSourceTrack(world.route);
  camera.far = 420;
  camera.updateProjectionMatrix();
}
// The source stadium has 16:9 panels; generated scenery uses 4:3 panels.
const broadcast = stadiumBroadcast(renderer, scene, world.screenMaterials,
  world.source ? {width:192,height:108} : {width:160,height:120});
addAtmosphere(scene);
// Consolidate static scenery by material. No dynamic light/firework meshes are
// included; source object transforms are baked, preserving exact geometry.
const twoSidedBoards = [];
world.world.traverse((o) => {
  if (
    o.isMesh &&
    o.geometry.type === "PlaneGeometry" &&
    o.material.map &&
    o.material.side === THREE.DoubleSide
  )
    twoSidedBoards.push(o);
});
for (const front of twoSidedBoards) {
  front.material.side = THREE.FrontSide;
  const back = front.clone();
  back.rotateY(Math.PI);
  back.translateZ(0.025);
  front.parent.add(back);
}
world.world.updateMatrixWorld(true);
const avoidScenery = world.avoidCamera || cameraCollision(world.world);
const staticGroups = new Map();
const staticMeshes = [];
world.world.traverse((o) => {
  // Animated crowd and broadcast props keep their original transforms.
  for (let parent = o; parent; parent = parent.parent)
    if (parent.userData.dynamicScenery) return;
  if (
    !o.isMesh || !o.visible ||
    o.isInstancedMesh ||
    world.lights.includes(o) ||
    Array.isArray(o.material)
  )
    return;
  staticMeshes.push(o);
});
let sliceStart = performance.now();
for (const o of staticMeshes) {
  if (performance.now() - sliceStart > 12) {
    await yieldDuringLoad();
    sliceStart = performance.now();
  }
  const g = o.geometry.clone();
  if (!g.index) g.setIndex(Array.from({length: g.attributes.position.count}, (_, i) => i));
  g.applyMatrix4(o.matrixWorld);
  // Generated primitives differ in uv/normal/extra attributes; normalize the merge contract.
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  if (!g.getAttribute("uv"))
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        new Float32Array(g.getAttribute("position").count * 2),
        2,
      ),
    );
  for (const attr of Object.keys(g.attributes)) {
    if (attr !== "position" && attr !== "normal" && attr !== "uv" && !(attr === "color" && o.material.vertexColors))
      g.deleteAttribute(attr);
  }
  let material = o.material;
  let id = material.uuid;
  if (material.userData.batchColor) {
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) material.color.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // Keep distant stands and buildings independently frustum-cullable.
    const origin = o.matrixWorld.elements;
    id = [material.type, material.side, Math.floor(origin[12] / 180), Math.floor(origin[14] / 180)].join('/');
    if (!staticGroups.has(id)) {
      material = material.clone();
      material.color.set(0xffffff);
      material.vertexColors = true;
    }
  }
  if (!staticGroups.has(id))
    staticGroups.set(id, { mat: material, geos: [], originals: [] });
  staticGroups.get(id).geos.push(g);
  staticGroups.get(id).originals.push(o);
}
staticMeshes.length = 0;
for (const { mat, geos, originals } of staticGroups.values()) {
  const g = mergeGeometries(geos);
  geos.forEach(x => x.dispose());
  if (!g) continue;
  originals.forEach(o => o.removeFromParent());
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  scene.add(m);
  if (performance.now() - sliceStart > 12) {
    await yieldDuringLoad();
    sliceStart = performance.now();
  }
}
staticGroups.clear();
twoSidedBoards.length = 0;
let onlineSetup=null, match=null;
let raceSteering = menu.steering;
const embedded = window.__controllerEmbedded === true;
// The host already reports lowering the right edge as positive (ArrowRight).
// The old shared tray setting had opposite defaults depending on the page.
const wheelPreference = embedded ? "openwii.kart.bleWheelInverted" : "openwii.chargeInvert2";
let paused = false,
  race,
  noticeUntil = 0,
  hitUntil = 0,
  renderCount = 0,
  lastFrame = performance.now(),
  resultsShown = false, resultsPresentation = null;
const audio = new KartAudio(menu.audioEngine),
  wheel = new WheelInput({
    invert: localStorage.getItem(wheelPreference) === "1",
  }),
  keys = new Set();
let captureUntil = performance.now() + 3000,
  usingPhone = false,
  phoneHadGas = false,
  lastRemoteItem = false,
  itemPulse = false;
const karts = [];
const shadowTexture = canvasTexture(64, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "#0009");
  g.addColorStop(1, "#0000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});
function constructRace(reuseGrid = false) {
  race = new Race({
    character: onlineSetup?.options.drivers[onlineSetup.slot] ?? menu.driver.id,
    laps: onlineSetup?.options.laps ?? menu.laps,
    drivers:onlineSetup?.options.drivers,
    names:onlineSetup?.options.names,
    slot:onlineSetup?.slot,
    bots: onlineSetup ? onlineSetup.options.bots !== false : true,
    seed: onlineSetup?.seed ?? (new URLSearchParams(location.search).has("evidence")
      ? 42
      : Math.floor(performance.now()) % 100000),
    onEvent: onEvent,
  });
  match=onlineSetup?new KartMatch(race,onlineSetup.slot):null;
  resultsShown = false;resultsPresentation=null;
  $('again').disabled=false;
  if (reuseGrid && !world.source && karts.length === race.racers.length) {
    const byDriver = new Map(karts.map(k => [k.id, k]));
    karts.splice(0, karts.length, ...race.racers.map(r => byDriver.get(r.character.id)));
    return;
  }
  for (const k of karts) {
    k.disposed = true;
    scene.remove(k.root, k.shadow);
    disposeModel(k.root);
    k.shadow.geometry.dispose();
    k.shadow.material.dispose();
  }
  karts.length = 0;
  for (const r of race.racers) {
    const root = new THREE.Group(),
      model = proceduralKart(r.character.id),
      glider = makeGlider(r.character.color,r.character.id),
      hover = makeHoverGlow(),starAura=makeStarAura(),boostEffect=makeBoostEffect();
    root.add(model, glider, hover,starAura,boostEffect);
    scene.add(root);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 4.4),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    karts.push({
      pose:createPose(),
      id: r.character.id,
      root,
      model,
      glider,
      hover,
      starAura,
      boostEffect,
      shadow,
      wheels: rigWheels(model),
      source: "procedural",
    });
  }
  const set = karts.slice();
  if (world.source) {
    loadKartPack([set[0]]).then((status) => {
      if (set[0] !== karts[0]) return;
      debug.assets = status;
    });
  }
  $("results").hidden = true;
  $("pause").hidden = true;
  paused = false;
}
let embeddedController = { active: false, live: false, isPhone: false, steer: 0, gas: false, brake: false, drift: false, item: false };
const legacyRemote = !embedded && typeof window.io==="function";
const link = !legacyRemote ? {
  feedback(data) {
    if (embedded && data && typeof data === "object") {
      parent.postMessage({ type: "game-feedback", data }, location.origin);
    }
  },
} : new GameLink({
  onOrientation: (sample, slot) => {
    if (slot !== 0) return;
    usingPhone = true;
    wheel.sample(sample, performance.now(), {
      canCapture:
        race?.state === "ready" ||
        race?.state === "countdown" ||
        performance.now() < captureUntil,
    });
  },
  onCommand: (cmd, slot) => {
    if (slot !== 0) return;
    const now = performance.now();
    wheel.command(cmd, now);
    if (cmd.type === "home") {
      audio.ui('cancel').then(()=>setTimeout(()=>location.href="/",100));
      return;
    }
    if (raceSteering === 'gyro' && (cmd.type === "recentre" || cmd.type === "calibrate")) {
      wheel.reset();
      captureUntil = now + 10000;
      if (race?.state === "racing")
        pause("Level the wheel for a moment, then press 2 or Enter.");
    }
    if (cmd.type === 'button' && cmd.pressed !== false) {
      if (cmd.button === '2' && (paused || ['ready','results'].includes(race.state))) confirm();
      if (race.state === 'ready') {
        if (['left','right','up','down'].includes(cmd.button)) navigateDriver(cmd.menuDirection || cmd.button);
        if (cmd.button === '1') cancelDriver();
      } else if (cmd.button === (raceSteering === 'gyro' ? 'right' : 'B') && !paused) itemPulse = true;
    }
  },
  onPresence: (p) => {
    $("connection").textContent = p.controller
      ? "PHONE CONNECTED · P1"
      : "KEYBOARD READY";
    if (!p.controller) {
      wheel.release();
      if (usingPhone && race?.state === "racing")
        pause("Phone disconnected. Reconnect or continue with the keyboard.");
      usingPhone = false;
    }
    sendProfile();
  },
});
function sendProfile() {
  if (!embedded) link.feedback({ type: "controller-profile", profile: "wheel", slot: 0 });
}
const profileTimer = legacyRemote ? setInterval(sendProfile,850) : null;
function onEvent(e) {
  if(e.type==='box' && race.boxes[e.box]){const b=race.boxes[e.box];effects.box(surfaceAt(b.s,b.lateral),race.time);}
  if(e.type==='contact'){
    burst(race.racers[e.racer],5,'#fff1b8');
    if(e.racer===0)link.feedback({type:'rumble',pattern:[35],slot:0});
  }
  if(e.type==='hit' && race?.racers[e.racer]){
    const r=race.racers[e.racer];burst(r,28,e.cause==='blue'?'#98dbff':'#fff0a0');
    if(e.cause==='blue'){
      const ball=impactTemplate.clone();
      ball.material=impactTemplate.material.clone();
      ball.position.set(r.x,r.y+1,r.z);scene.add(ball);itemImpacts.push({mesh:ball,start:race.time});
    }
  }
  audio.event(e, race);
  if (e.racer !== 0) return;
  if(e.type==='useItem'){$('item-frame').dataset.used=String(race.time);$('item-icon').animate([{transform:'scale(1)',opacity:1},{transform:'scale(1.3)',opacity:0}],{duration:150});}
  if(e.type==='itemReady')$('item-frame').animate([{filter:'brightness(2)',transform:'scale(1.15)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:250});
  const labels = {
    rocket: "ROCKET START!",
    burnout: "TOO EARLY!",
    turbo: ["", "MINI-TURBO!", "SUPER MINI-TURBO!", "ULTRA MINI-TURBO!"][
      e.tier
    ],
    finalLap: "FINAL LAP",
    lap: "LAP 2",
    finish: "FINISH!",
    glider: "TAKE FLIGHT!",
    antigrav: "ANTI-GRAVITY",
    hit: "SPIN OUT!",
    bump: "SPIN BOOST!",
  };
  if (labels[e.type]) {
    $('notice').dataset.kind=e.type;
    $('notice').innerHTML=e.type==='finish'?raceLettering('FINISH!'):['lap','finalLap'].includes(e.type)?'<div class="lap-sign"></div>':labels[e.type];
    if(['lap','finalLap'].includes(e.type))$('notice').firstElementChild.innerHTML=lapBoard(e.type==='finalLap'?3:2);
    $('notice').getAnimations().forEach(a=>a.cancel());
    $('notice').animate(e.type==='finish'?[{opacity:0,scale:'1.45'},{opacity:1,scale:'1',offset:.22},{opacity:1,scale:'1'}]:[{opacity:0,translate:'70px 0'},{opacity:1,translate:'0 0',offset:.2},{opacity:1,translate:'0 0',offset:.8},{opacity:0,translate:'20px -25px'}],{duration:1500});
    $("notice").dataset.essential = String(
      ["lap", "finalLap", "finish"].includes(e.type),
    );
    noticeUntil = race?.time + 1.5;
  }
  if (e.type === "hit") {
    hitUntil = (race?.time || 0) + 1;
    burst(race.player, 36, "#ffd755");
    link.feedback({ type: "rumble", pattern: [80, 40, 80], slot: 0 });
  }
  if (e.type === "coin") burst(race.player, 10, "#ffdf46");
}
function cancelDriver() {
  if(menu.step==='steering'){menu.setStep('laps');audio.ui('cancel');}
  else if(menu.confirmed){menu.setStep('driver');audio.ui('cancel');}
}
function chooseDriver(index) {
  if (race.state === 'ready') menu.chooseDriver(index);
}
function selectLaps(laps) {
  if (race.state === 'ready') menu.selectLaps(laps);
}
function navigateDriver(direction) {
  menu.navigate(direction);
}
function begin() {
  if (race.state !== "ready") return;
  void audio.ui('start');
  wheel.reset();
  captureUntil = performance.now() + 3000;
  raceSteering = menu.steering;
  $('wheel-ready').firstChild.textContent = raceSteering === 'gyro' ? 'Hold your phone sideways and level' : 'Preparing your D-pad';
  $('wheel-ready').querySelector('small').textContent = 'The countdown starts when your controls are ready';
  menu.phoneLayout(raceSteering);
  phoneHadGas = lastRemoteItem = itemPulse = false;
  race.start();
  $("intro").hidden = true;
  $("track-label").hidden = true;
  $("hud").hidden = false;
  $("results").hidden = true;
  noticeUntil = 0;
  if (embedded) parent.postMessage({ type: "game-state", paused: false }, location.origin);
}
function confirm() {
  if(match)return;
  if (paused) {
    resume();
    return;
  }
  if (race.state === 'ready') {
    if (menu.step === 'driver') {menu.setStep('laps');audio.ui('confirm');}
    else if (menu.step === 'laps') {menu.setStep('steering');audio.ui('confirm');}
    else begin();
  }
  else if (race.state === "results" && resultsPresentation?.done) {
    constructRace();
    begin();
  }
}
$("again").onclick = confirm;
$("resume").onclick = resume;
$("mute").onclick = () => {
  audio.engine.enabled = !audio.engine.enabled;
  audio.engine.master?.gain.setValueAtTime(
    audio.engine.enabled ? 0.55 : 0,
    audio.engine.ctx.currentTime,
  );
  $("mute").textContent = audio.engine.enabled ? "♪ SOUND ON" : "♪ SOUND OFF";
};
function pause(reason = "Take a breath. The race will wait.") {
  if (match || ["ready", "results"].includes(race.state)) return;
  paused = true;
  $("hud").getAnimations({subtree:true}).forEach(a=>a.pause());
  keys.clear();
  wheel.release();
  $("pause-reason").textContent = reason;
  $("pause").hidden = false;
  audio.engine.ctx?.suspend();
  if (embedded) parent.postMessage({ type: "game-state", paused: true }, location.origin);
}
function resume() {
  if (match) return;
  paused = false;
  $("hud").getAnimations({subtree:true}).forEach(a=>{if(a.playState==="paused")a.play();});
  $("pause").hidden = true;
  lastFrame = performance.now();
  audio.ui('confirm');
  if (embedded) parent.postMessage({ type: "game-state", paused: false }, location.origin);
}
document.addEventListener('click', e => {
  const button=e.target.closest('button, a');
  if(!button || button.matches('.character,[data-laps],#start,#again,#resume'))return;
  if(button.matches('a[href="/"]')&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){
    e.preventDefault();audio.ui('cancel').then(()=>setTimeout(()=>location.href='/',100));
  }else audio.ui('confirm');
});
const drivingKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyZ",
    "KeyX",
    "ShiftLeft",
    "ShiftRight",
    "Space",
    "Enter",
    "Escape",
    "KeyR",
    "KeyI",
]);
function handleKey(e) {
  if (!window.__openwii || !drivingKeys.has(e.code)) return;
  if (e.type === "keyup") {
    if (keys.delete(e.code)) e.preventDefault();
    return;
  }
  if (["Enter","Space"].includes(e.code) && e.target.closest?.("button:focus-visible,a:focus-visible")) return;
  e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (race.state === 'ready') {
    if (e.code.startsWith('Arrow')) {
      navigateDriver(e.code.slice(5).toLowerCase());
      return;
    }
    const wasdDir = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }[e.code];
    if (wasdDir) {
      navigateDriver(wasdDir);
      return;
    }
    if (e.code === 'Space') {
      begin();
      return;
    }
  }
  if (e.code === 'Escape' && race.state === 'ready') { cancelDriver(); return; }
  if (e.code === "Enter") {
    if (race.state === 'ready') begin();
    else confirm();
  }
  if (e.code === "Space") itemPulse = true;
  if (e.code === "Escape") paused ? resume() : pause();
  if (e.code === "KeyR") {
    if (embedded) { parent.postMessage({type:"kart-center"},location.origin); return; }
    wheel.reset();
    captureUntil = performance.now() + 10000;
    if (usingPhone && race.state === "racing")
      pause("Level the wheel for a moment, then press 2 or Enter.");
  }
  if (e.code === "KeyI") {
    wheel.invert = !wheel.invert;
    localStorage.setItem(wheelPreference, wheel.invert ? "1" : "0");
  }
}
window.addEventListener("keydown", handleKey);
window.addEventListener("keyup", handleKey);
window.addEventListener("blur", () => {
  keys.clear();
  if (!embedded && race?.state === "racing")
    pause("Window lost focus. Press Enter to resume.");
});
document.addEventListener("visibilitychange", () => {
  if (!embedded && document.hidden) pause("The race paused while this tab was hidden.");
  else if (paused) queueMicrotask(() => audio.engine.ctx?.suspend());
});
window.addEventListener("pagehide", () => {
  clearInterval(profileTimer);
  link.feedback({ type: "controller-profile", profile: "default", slot: 0 });
  audio.stop();
});
// Pickups: shared geometries, predictable pools, no allocation as racers lap.
const pickupRoot = new THREE.Group();
scene.add(pickupRoot);
const coinParts = [new THREE.CylinderGeometry(0.62, 0.62, 0.14, 40)];
for (const side of [-1, 1]) {
  const rim = new THREE.TorusGeometry(0.52, 0.035, 8, 40);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, side * 0.088, 0);
  const stamp = new THREE.CapsuleGeometry(0.07, 0.55, 4, 8);
  stamp.rotateX(Math.PI / 2);
  stamp.translate(0, side * 0.1, 0);
  coinParts.push(rim, stamp);
}
const coinGeo = mergeGeometries(coinParts),
  coinMat = new THREE.MeshStandardMaterial({
    color: "#ffd637",
    metalness: 0.68,
    roughness: 0.25,
    emissive: "#b98a12",
    emissiveIntensity: 0.22,
  });
const boxGeo = new RoundedBoxGeometry(1.7, 1.7, 1.7, 3, 0.055),
  boxMat = new THREE.MeshPhysicalMaterial({
    color: "#c9edb3",
    roughness: 0.08,
    metalness: 0.45,
    envMapIntensity: 1.4,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    iridescence: 1,
    iridescenceIOR: 1.3,
    clearcoat: 1,
    emissive: "#6c9e6a",
    emissiveIntensity: 0.18,
  });
const qTex = canvasTexture(128, 128, (c) => {
  c.clearRect(0, 0, 128, 128);
  const sheen = c.createLinearGradient(0, 0, 128, 128);
  sheen.addColorStop(0, "#eeff83b0");
  sheen.addColorStop(0.45, "#94edaf50");
  sheen.addColorStop(1, "#5ba8ea95");
  c.fillStyle = sheen;
  c.fillRect(3, 3, 122, 122);
  c.fillStyle = "#e7ffffbb";
  for (const [x, y, r] of [
    [18, 105, 6],
    [32, 111, 3],
    [109, 20, 5],
  ]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = "#e8ffbca0";
  c.lineWidth = 3;
  c.strokeRect(3, 3, 122, 122);
  c.strokeStyle = "#fffed9a0";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(9, 44);
  c.lineTo(9, 9);
  c.lineTo(47, 9);
  c.stroke();
  // A broad, bevel-like question glyph reads as a solid object at race speed.
  const glyph = new Path2D(
    "M35 44 C35 7 103 7 103 43 C103 61 81 65 79 77 L78 84 L56 84 L56 67 C57 56 80 54 80 43 C80 30 58 30 58 43 L58 47 Z M56 93 L78 93 L78 113 L56 113 Z",
  );
  c.save();
  c.translate(2, 3);
  c.lineJoin = "round";
  c.lineWidth = 12;
  c.strokeStyle = "#145196";
  c.stroke(glyph);
  c.restore();
  c.lineJoin = "round";
  c.lineWidth = 7;
  c.strokeStyle = "#219bde";
  c.stroke(glyph);
  const enamel = c.createLinearGradient(40, 20, 80, 110);
  enamel.addColorStop(0, "#ffffed");
  enamel.addColorStop(0.65, "#eaffff");
  enamel.addColorStop(1, "#b7e9f9");
  c.fillStyle = enamel;
  c.fill(glyph);
});
const qMat = new THREE.MeshStandardMaterial({
  map: qTex,
  color: "#fff",
  transparent: true,
  alphaTest: 0.1,
  depthWrite: false,
  emissive: "#8199d1",
  emissiveMap: qTex,
  emissiveIntensity: 0.5,
  roughness: 0.2,
});
// Share the six printed faces as a single rigid mesh on each rotating box.
const boxFaces = mergeGeometries([
  [0, 0], [0, Math.PI], [0, Math.PI / 2], [0, -Math.PI / 2],
  [-Math.PI / 2, 0], [Math.PI / 2, 0],
].map(([x, y]) => new THREE.PlaneGeometry(1.6, 1.6)
  .translate(0, 0, .857).rotateX(x).rotateY(y)));
let coinMeshes = [],
  boxMeshes = [];
function attachPickup(object, p, height) {
  const n = p.normal || {x:0,y:1,z:0};
  if (activeSurfaceTrack) {
    const holder = new THREE.Group();
    holder.position.set(p.x+n.x*height,p.y+n.y*height,p.z+n.z*height);
    holder.quaternion.setFromUnitVectors(new V(0,1,0),new V(n.x,n.y,n.z));
    object.position.set(0,0,0);holder.add(object);pickupRoot.add(holder);
  } else {
    object.position.set(p.x,p.y+height,p.z);pickupRoot.add(object);
  }
}
function syncPickupPools() {
  pickupRoot.clear();
  coinMeshes = race.coins.map((c) => {
    const m = new THREE.Mesh(coinGeo, coinMat),
      p = surfaceAt(c.s, c.lateral);
    m.rotation.x = Math.PI / 2;
    attachPickup(m,p,1.35);
    return m;
  });
  boxMeshes = race.boxes.map((b) => {
    const g = new THREE.Group(),
      p = surfaceAt(b.s, b.lateral);

    const m = new THREE.Mesh(boxGeo, boxMat);
    g.add(m);
    g.add(new THREE.Mesh(boxFaces, qMat));
    attachPickup(g,p,1.8);
    return g;
  });
}
// Sparks and impact stars are recycled. Particles are cosmetic; every hit and
// charge comes from logic.js, which never references these pools.
const maxParticles = 450,
  particleGeo = new THREE.BufferGeometry(),
  particlePos = new Float32Array(maxParticles * 3),
  particleColor = new Float32Array(maxParticles * 3);
particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
particleGeo.setAttribute("color", new THREE.BufferAttribute(particleColor, 3));
const particleTex = canvasTexture(32, 32, (c) => {
  const g = c.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, "white");
  g.addColorStop(0.3, "#fff9");
  g.addColorStop(1, "#fff0");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
});
const points = new THREE.Points(
  particleGeo,
  new THREE.PointsMaterial({
    map: particleTex,
    size: 0.24,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
points.frustumCulled = false;
scene.add(points);
const particles = Array.from({ length: maxParticles }, () => ({
  life: 0,
  x: 0,
  y: -500,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
}));
let pi = 0;
const visualRng = seeded(76);
function particle(x, y, z, vx, vy, vz, color, life = 0.45) {
  const i = pi++ % maxParticles,
    p = particles[i];
  Object.assign(p, { x, y, z, vx, vy, vz, life });
  new THREE.Color(color).toArray(particleColor, i * 3);
}
function burst(r, n, color) {
  for (let i = 0; i < n; i++)
    particle(
      r.x,
      r.y + 1.4,
      r.z,
      (visualRng() - 0.5) * 12,
      visualRng() * 8,
      (visualRng() - 0.5) * 12,
      color,
      0.7,
    );
}
const objectMeshes = new Map();
const itemImpacts=[];
const impactTemplate=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),new THREE.MeshBasicMaterial({
  color:'#b9eaff',transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending
}));
const camTarget = new V(),
  unconstrainedEye = new V(),
  sceneryOffset = new V(),
  cameraAimTarget = new V(),
  cameraAim = new V(),
  cameraUp = new V(0, 1, 0);
const worldUp=new V(0,1,0), surfaceUp=new V(), cameraFocus=new V(), beforeClearance=new V(),
  headFocus=new V(), upperHeadFocus=new V(), canopy=new V(), jumpRotation=new THREE.Quaternion(), jumpEuler=new THREE.Euler();
const activeObjects=new Set();
const basis = new THREE.Matrix4(),
  basisX = new V(),
  basisY = new V(),
  basisZ = new V();
const frameTimes = [];
let previousDrawTime = 0;
let initializedCamera = false;
let lastFlightCamera = null, landingCamera = null;
function draw(dt, now) {
  const p = race.player,
    time = race.time;
  const alpha=race.alpha, playerPose=karts[0].pose, pixelHeight=viewportHeight*renderer.getPixelRatio();
  world.update(
    now / 1000,
    race.state === "countdown" ? race.count : race.state === "ready" ? 3 : 0,
  );
  for (const [i, r] of race.racers.entries()) {
    const k = karts[i], pose=samplePose(r,alpha,k.pose),
      path = activeSurfaceTrack ? surfaceAt(pose.s,pose.lateral) : trackAt(pose.s);
    const hop = pose.hop > 0 ? Math.sin((pose.hop / 0.36) * Math.PI) * 0.7 : 0;
    k.root.position.set(pose.x, pose.y + hop + 0.1, pose.z);
    if (activeSurfaceTrack && !r.gliding) {
      const n = pose.surfaceNormal||path.normal;
      k.root.position.set(pose.x+n.x*(hop+.1),pose.y+n.y*(hop+.1),pose.z+n.z*(hop+.1));
    }
    if (!r.gliding) {
      const frame = roadFrame(pose.s, pose.lateral, pose.heading, pose.surfaceForward, pose.surfaceNormal);
      basisX.set(frame.right.x, frame.right.y, frame.right.z);
      basisY.set(frame.up.x, frame.up.y, frame.up.z);
      basisZ.set(-frame.forward.x, -frame.forward.y, -frame.forward.z);
      basis.makeBasis(basisX, basisY, basisZ);
      k.root.quaternion.setFromRotationMatrix(basis);
    } else {
      // Preserve the last actual ground pose through the wing opening. The
      // source ramp descends steeply; instantly applying flat flight rotates
      // the kart by roughly 57 degrees in a single frame.
      if (activeSurfaceTrack && k.wasGliding === false)
        k.launchOrientation = k.root.quaternion.clone();
      k.root.rotation.set(-0.08, -pose.heading, 0, "YXZ");
      if (activeSurfaceTrack && k.launchOrientation && r.flight < .32) {
        k.flightOrientation ||= new THREE.Quaternion();
        k.flightOrientation.copy(k.root.quaternion);
        k.root.quaternion.slerpQuaternions(k.launchOrientation, k.flightOrientation,
          THREE.MathUtils.smoothstep(r.flight || 0, 0, .32));
      }
    }
    if(r.jump){
      if(!k.wasJumping)k.jumpOrientation=k.root.quaternion.clone();
      const flat=jumpRotation.setFromEuler(jumpEuler.set(-Math.atan2(r.jump.velocity,Math.max(20,r.speed)),-pose.heading,0,'YXZ'));
      k.root.quaternion.slerpQuaternions(k.jumpOrientation,flat,THREE.MathUtils.smoothstep(r.jump.age,0,.16));
    }
    k.wasJumping=!!r.jump;
    if(pose.landing>0)k.root.position.y-=Math.sin((1-pose.landing/.24)*Math.PI)*.16;
    k.wasGliding = r.gliding;
    if (!r.gliding) k.launchOrientation = null;
    k.model.rotation.y = r.spin > 0 ? time * 15 : r.drift ? -r.drift * 0.25 : 0;
    k.model.rotation.z = (r.gliding ? -r.steer * 0.15 : -r.steer * 0.07) + Math.sin((r.contactAnimation||0)/.42*Math.PI*2)*(r.contactAnimation||0)*.55*(r.contactSide||.4);
    updateDriverLook(k, r, race.racers, paused ? 0 : dt, race.state === "racing");
    updateHeldItem(k.model, r, paused ? 0 : dt);
    updateBoostEffect(k.boostEffect,k.model,r.boost,time+i*.17);
    if (r.star > 0 || k.starActive) updateStarModel(k.model,r.star>0,(time*.65+i*.1)%1);
    k.starActive = r.star > 0;
    updateStarAura(k.starAura,r.star>0,time+i*.17,pixelHeight);
    if(!paused) k.wheelHover = (k.wheelHover||0) + ((r.anti?1:0)-(k.wheelHover||0))*(1-Math.exp(-dt*18));
    for (const [wi, w] of k.wheels.entries()) {
      if (!w) continue;
      if (w.userData.glow) w.userData.glow.visible = r.anti;
      if (w.userData.rolling && !paused)
        w.userData.rolling.rotation.x -= (r.speed * dt) / 0.39;
      const hover = w.userData.sourceTireMeshes ? (k.wheelHover||0) : r.anti?1:0;
      updateSourceWheel(w,hover);
      w.rotation.z = hover * ((wi % 2 ? 1 : -1) * Math.PI) / 2;
      w.rotation.y = wi < 2 ? -r.steer * 0.32 : 0;
    }
    updateHoverGlow(k, r, hop);
    updateGlider(k.glider,r,time);
    // The airborne spline is the flight corridor, not a physical surface.
    // Its lower landing road is at ground level; the shadow belongs there.
    k.shadow.position.set(pose.x, r.gliding ? 0.09 : pose.y + 0.04, pose.z);
    if (activeSurfaceTrack && r.gliding && !path.glide) k.shadow.position.y = path.y + .09;
    if (activeSurfaceTrack && !r.gliding) {
      const n=pose.surfaceNormal||path.normal;k.shadow.position.set(pose.x+n.x*.04,pose.y+n.y*.04,pose.z+n.z*.04);
    }
    if(r.jump){const g=activeSurfaceTrack.support(pose,worldUp)||path;k.shadow.position.set(pose.x,g.y+.04,pose.z);}
    k.shadow.material.opacity = r.gliding||r.jump ? 0.2 : 0.7;
    if (!r.gliding) {
      k.shadow.quaternion.copy(k.root.quaternion);
      k.shadow.rotateX(-Math.PI / 2);
    } else k.shadow.rotation.set(-Math.PI / 2, 0, pose.heading);
    effects.tire(r,r.drift ? roadFrame(pose.s,pose.lateral,pose.heading,pose.surfaceForward,pose.surfaceNormal) : null,paused?0:dt,pose);
  }
  effects.update(paused?0:dt,pixelHeight);
  for (const [i, m] of coinMeshes.entries()) {
    m.visible = race.coins[i].respawn === 0 && m.getWorldPosition(basisX).distanceTo(camera.position) > 1.6;
    m.rotation.z = now * 0.003;
  }
  for (const [i, g] of boxMeshes.entries()) {
    g.visible = race.boxes[i].respawn === 0 && g.getWorldPosition(basisX).distanceTo(camera.position) > 1.2;
    g.rotation.y = now * 0.001;
    g.rotation.z = Math.sin(now * 0.001 + i) * 0.2;
  }
  const alive = activeObjects;
  alive.clear();
  for (const o of race.objects) {
    alive.add(o.id);
    if (!objectMeshes.has(o.id)) {
      const m = makeItemModel(o.type);
      m.userData.release = heldItemOrigin(karts[o.owner].model) || new V(race.racers[o.owner].x, race.racers[o.owner].y+2, race.racers[o.owner].z);
      objectMeshes.set(o.id, m);
      scene.add(m);
    }
    const m = objectMeshes.get(o.id),
      p = surfaceAt(o.s, o.lateral);
    const n=p.normal||{x:0,y:1,z:0}, height=o.type === "blue" ? 4 : .12;
    m.position.set(p.x+n.x*height,p.y+n.y*height,p.z+n.z*height);
    if(o.type==='blue' && o.attack!=null){
      const target=race.racers.find(r=>r.id===o.target),t=o.attack;
      if(target){const orbit=t<.55?2*(1-t/.75):0, a=t*14;
        m.position.set(target.x+Math.cos(a)*orbit,target.y+4.5*(1-THREE.MathUtils.smoothstep(t,.55,.85)),target.z+Math.sin(a)*orbit);}
    }
    const releaseTime=o.type==='banana'?.42:.22, t=Math.min(1,o.age/releaseTime);
    if(t<1){m.position.lerpVectors(m.userData.release,m.position,t);m.position.addScaledVector(surfaceUp.copy(n),Math.sin(t*Math.PI)*(o.type==='banana'?.6:1.4));}
    if (activeSurfaceTrack) {
      m.quaternion.setFromUnitVectors(worldUp,surfaceUp.copy(n));
      m.rotateY(o.type==='banana'?0:o.age*12);
    } else m.rotation.y = o.type==='banana'?0:o.age*12;
  }
  for (const [id, m] of objectMeshes)
    if (!alive.has(id)) {
      scene.remove(m);
      objectMeshes.delete(id);
    }
  for(let i=itemImpacts.length-1;i>=0;i--){const impact=itemImpacts[i],age=race.time-impact.start;
    impact.mesh.scale.setScalar(.5+Math.min(1,age/.24)*6);impact.mesh.material.opacity=Math.max(0,.7*(1-age/.5));
    if(age>.5||age<0){scene.remove(impact.mesh);impact.mesh.material.dispose();itemImpacts.splice(i,1);}
  }
  particles.forEach((p, i) => {
    p.life -= paused ? 0 : dt;
    if (p.life > 0) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 8 * dt;
      particlePos.set([p.x, p.y, p.z], i * 3);
    } else particlePos[i * 3 + 1] = -500;
  });
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
  boostFeedback=updateBoostScreen(race.time,p.boost);
  const desired = chasePose(p,playerPose);
  // Blend camera offsets after contact so the steep flight camera does not
  // drop instantly to ground chase height. Keep following the moving kart;
  // geometry clearance still runs below after smoothing.
  if (activeSurfaceTrack && race.state === "racing" && !debug.snapCamera) {
    if (p.gliding) {
      lastFlightCamera = {eye: {}, aim: {}, up: {...desired.up}};
      for (const axis of ["x", "y", "z"]) {
        lastFlightCamera.eye[axis] = desired.eye[axis] - playerPose[axis];
        lastFlightCamera.aim[axis] = desired.aim[axis] - playerPose[axis];
      }
      landingCamera = null;
    } else {
      if (lastFlightCamera) {
        landingCamera = {...lastFlightCamera, started: race.time};
        lastFlightCamera = null;
      }
      if (landingCamera) {
        const blend = THREE.MathUtils.smoothstep(race.time - landingCamera.started, 0, .45);
        for (const axis of ["x", "y", "z"]) {
          desired.eye[axis] = THREE.MathUtils.lerp(playerPose[axis] + landingCamera.eye[axis], desired.eye[axis], blend);
          desired.aim[axis] = THREE.MathUtils.lerp(playerPose[axis] + landingCamera.aim[axis], desired.aim[axis], blend);
          desired.up[axis] = THREE.MathUtils.lerp(landingCamera.up[axis], desired.up[axis], blend);
        }
        if (blend === 1) landingCamera = null;
      }
    }
  } else {
    lastFlightCamera = landingCamera = null;
  }
  const finishBlend = p.finishTime === null ? 0 : THREE.MathUtils.smoothstep(race.time - (race.finishedAt ?? race.time), 0, .9);
  if (p.finishTime !== null) {
    const basis = roadFrame(playerPose.s, playerPose.lateral, playerPose.heading, playerPose.surfaceForward, playerPose.surfaceNormal);
    const angle = Math.PI * (1 - finishBlend), radius = THREE.MathUtils.lerp(9.6, 8, finishBlend);
    for (const axis of ['x', 'y', 'z']) {
      desired.eye[axis] = playerPose[axis] + radius * (basis.forward[axis] * Math.cos(angle) + basis.right[axis] * Math.sin(angle)) + basis.up[axis] * THREE.MathUtils.lerp(3.65, 2.8, finishBlend);
      desired.aim[axis] = THREE.MathUtils.lerp(desired.aim[axis], playerPose[axis] + basis.up[axis] * 1.4, finishBlend);
    }
  }
  if (race.state === "ready") {
    const t = -playerPose.heading - Math.PI*.31 + Math.sin(now*.00008)*.045;
    camTarget.set(playerPose.x + Math.cos(t) * 7.6, playerPose.y + 3.7, playerPose.z + Math.sin(t) * 7.6);
    cameraAimTarget.set(playerPose.x-Math.sin(t)*2.65, playerPose.y + 1.3, playerPose.z+Math.cos(t)*2.65);
    cameraUp.set(0, 1, 0);
  } else {
    camTarget.set(desired.eye.x, desired.eye.y, desired.eye.z);
    cameraAimTarget.set(desired.aim.x, desired.aim.y, desired.aim.z);
    const up = surfaceUp.copy(desired.up);
    cameraUp.lerp(up, 1 - Math.exp(-dt * 7)).normalize();
  }
  if (!initializedCamera || debug.snapCamera) {
    unconstrainedEye.copy(camTarget);
    sceneryOffset.set(0,0,0);
    cameraAim.copy(cameraAimTarget);
    cameraUp.set(desired.up.x, desired.up.y, desired.up.z);
    if (race.state === "ready") cameraUp.set(0, 1, 0);
    initializedCamera = true;
    debug.snapCamera = false;
  } else {
    unconstrainedEye.lerp(camTarget, 1 - Math.exp(-dt * 13));
    cameraAim.lerp(cameraAimTarget, 1 - Math.exp(-dt * 13));
  }
  // Smooth the intended rig independently. Feeding corrected eyes back into
  // smoothing makes the camera repeatedly drift into and jump off the rail.
  if (race.state !== "ready") {
    const safe = cameraClearance(unconstrainedEye, playerPose.s);
    camera.position.copy(safe);
    const cameraNormal = activeSurfaceTrack && !p.gliding ? (playerPose.surfaceNormal||surfaceAt(playerPose.s,playerPose.lateral).normal) : {x:0,y:1,z:0};
    cameraFocus.set(playerPose.x+cameraNormal.x*1.3,playerPose.y+cameraNormal.y*1.3,playerPose.z+cameraNormal.z*1.3);
    driverCameraAnchor(karts[0].model,cameraFocus,false,headFocus);
    driverCameraAnchor(karts[0].model,cameraFocus,true,upperHeadFocus);
    beforeClearance.copy(camera.position);
    const resolvedEye = clearChaseView(cameraFocus,headFocus,camera.position,
      surfaceUp.copy(cameraNormal),avoidScenery,upperHeadFocus);
    camera.position.copy(smoothChaseCorrection(beforeClearance,resolvedEye,cameraFocus,
      upperHeadFocus,avoidScenery,sceneryOffset,dt));
    camera.position.copy(cameraClearance(camera.position, playerPose.s));
    camera.up.copy(cameraUp);
    camera.lookAt(clearanceLookTarget(beforeClearance,camera.position,headFocus,cameraAim));
  } else {
    camera.position.copy(unconstrainedEye);
    camera.up.copy(cameraUp);
    camera.lookAt(cameraAim);
  }
  camera.fov +=
    (57 + boostFeedback.strength*5 + boostFeedback.kick*2 + (p.gliding ? 3 : 0) - camera.fov) *
    (1 - Math.exp(-dt * 6));
  // Leave the racer visible to the left of the results table.
  if (finishBlend > 0) camera.setViewOffset(viewportWidth, viewportHeight, viewportWidth * .22 * finishBlend, 0, viewportWidth, viewportHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  key.position.set(playerPose.x - 30, playerPose.y + 60, playerPose.z + 25);
  // Only hide a rival if the camera actually enters its body.
  for (let i = 1; i < karts.length; i++) {
    const k = karts[i];
    k.root.visible = rivalVisible(k.model, camera);
    // Canopies are wider than the body and need their own clearance.
    if (k.glider.visible) {
      k.root.localToWorld(canopy.set(0, 3.3, 0));
      k.glider.visible = camera.position.distanceTo(canopy) > 5.3;
    }
  }
  key.target.position.set(playerPose.x, playerPose.y, playerPose.z);
  key.target.updateMatrixWorld();
  renderer.info.reset();
  renderer.info.autoReset = false;
  if (race.state !== "ready") broadcast.update(now, camera, dt);
  renderer.render(scene, camera);
  renderCount++;
  if (window.__kart && previousDrawTime && !document.hidden) {
    frameTimes.push(now - previousDrawTime);
    if (frameTimes.length > 18000) frameTimes.shift();
  }
  previousDrawTime = now;
  updateHUD();
}
function setText(element,value) {
  if(element.textContent!==value)element.textContent=value;
}
function setStyle(element,key,value) {
  if(element.style[key]!==value)element.style[key]=value;
}
function setHidden(element,value) {
  if(element.hidden!==value)element.hidden=value;
}
const driftColors=['rgb(238, 246, 255)','rgb(67, 213, 255)','rgb(255, 170, 49)','rgb(217, 134, 255)'];
const driftLabels=['HOLD THE DRIFT','MINI-TURBO','SUPER MINI-TURBO','ULTRA MINI-TURBO'];
const lamps=$('lamps').querySelectorAll('i');
function updateHUD() {
  document.body.classList.toggle("racing", race.state !== "ready");
  if (race.state === "ready") return;
  const p = race.player,
    position = race.position(p);
  raceNumerals($("coins"), String(p.coins).padStart(2, "0"));
  raceNumerals($("lap"), `${p.lap}/${race.laps}`);
  if($('position').dataset.rank!==String(position)){
    $('position').dataset.rank=String(position);
    $('position').innerHTML=raceLettering(String(position),position===1?'gold':position===2?'silver':position===3?'bronze':'orange')+`<sup>${ordinal(position).replace(String(position),'')}</sup>`;
    $('position').animate([{scale:'1.2'},{scale:'1'}],{duration:240});
  }
  setText($("speed-number"),String(Math.round(Math.abs(p.speed)*3.6)));
  setStyle($("speed-bar"),'width',Math.min(100,Math.round(Math.abs(p.speed)/55*1000)/10)+'%');
  const recentlyUsed=!p.item && p.itemUse?.age<.16;
  $("item-frame").classList.toggle("empty", !p.item && p.roulette <= 0 && !recentlyUsed);
  updateItemReel(race.time,p.roulette,p.item || (recentlyUsed?p.itemUse.type:null));
  setText($("item-caption"),
    p.roulette > 0
      ? "ROULETTE"
      : p.item
        ? { green: "GREEN SHELL", red: "RED SHELL", blue: "BLUE SHELL" }[
            p.item
          ] || p.item.toUpperCase()
        : "ITEM");
  setStyle($("drift-meter"),'opacity',p.drift?'1':'0');
  setStyle($("drift-fill"),'width',Math.min(100,Math.round(p.charge/3.4*1000)/10)+'%');
  setStyle($("drift-fill"),'backgroundColor',driftColors[p.tier]);
  setText($("drift-label"),driftLabels[p.tier]);

  setStyle($("hit-flash"),'opacity',race.time<hitUntil?'0.6':'0');
  setHidden($("notice"),race.time > noticeUntil || race.state === "countdown");
  setHidden($("countdown"),!(
    race.state === "countdown" ||
    (race.state === "racing" && race.time < 3.65)
  ));
  const waiting=waitingForWheel();
  const count=waiting?'':race.count?String(race.count):'GO!';
  setHidden($('wheel-ready'),!waiting);
  setStyle($('lamps'),'opacity',waiting?'0.35':'1');
  if($('count-number').dataset.value!==count){
    $('count-number').dataset.value=count;
    $('count-number').innerHTML=count?raceLettering(count):'';
    $('count-number').getAnimations().forEach(a=>a.cancel());
    if(count && count!=='GO!')$('count-number').animate([{opacity:0,scale:'1.5'},{opacity:1,scale:'1',offset:.18},{opacity:1,scale:'1',offset:.7},{opacity:0,scale:'.9'}],{duration:950});
    if(count==='GO!')$('count-number').animate([{opacity:0,scale:'1.4'},{opacity:1,scale:'1',offset:.2},{opacity:1,scale:'1',offset:.7},{opacity:0,scale:'1.12'}],{duration:650});
  }
  $("lamps").classList.toggle("go", race.count === 0);
  lamps.forEach((el, i) => el.classList.toggle("on", i < 4 - race.count));
  drawMap();
  const showStandings=["finishing","results"].includes(race.state) && !resultsShown && audio.resultsReady;
  const standings=showStandings && (match?match.resultStandings():race.standings);
  if (standings) {
    race.showResults();
    resultsShown = true;
    menu.phoneLayout('menu');
    $("results").hidden = false;
    $("hud").hidden = true;
    $("result-summary").textContent =
      `${p.playerName ? `${p.playerName} (${p.character.name})` : p.character.name} · ${ordinal(standings.findIndex(r=>r.id===0)+1)} place · ${formatTime(p.finishTime)}`;
    resultsPresentation={started:performance.now(),duration:1.2,done:false,times:standings.map(r=>r.finishTime)};
    $('again').disabled=true;
    audio.presentResults(race,resultsPresentation.duration);
    $("standings").replaceChildren(...standings.map((r, i) => {
      const row = document.createElement("div");
      row.className = `standing ${r.id === 0 ? "me" : ""}`;
      row.style.setProperty("--row", i);
      const rank = document.createElement("b");
      rank.textContent = String(i + 1);
      const avatar = document.createElement("img");
      avatar.src = portrait(r.character);
      avatar.alt = "";
      const label = document.createElement("span");
      label.textContent = r.playerName ? `${r.playerName} (${r.character.name})` : r.character.name;
      const clock = document.createElement("span");
      clock.className = "time";
      clock.textContent = r.finishTime === null ? "—" : formatTime(0);
      row.append(rank, avatar, label, clock);
      return row;
    }));
  }
  if(resultsShown&&resultsPresentation&&!resultsPresentation.done){
    const elapsed=(performance.now()-resultsPresentation.started)/1000;
    const progress=Math.max(0,Math.min(1,(elapsed-.12)/(resultsPresentation.duration-.12)));
    document.querySelectorAll('#standings .time').forEach((el,i)=>setText(el,resultsPresentation.times[i] === null ? '—' : formatTime(resultsPresentation.times[i]*progress)));
    if(progress===1){resultsPresentation.done=true;$('again').disabled=false;}
  }
}
const mapCtx = $("minimap").getContext("2d");
const mapBg = document.createElement("canvas");
mapBg.width = 250;
mapBg.height = 220;
let mapBgBuilt = false;
function buildMapBg() {
  const c = mapBg.getContext("2d"), w = 250, h = 220;
  const to = (x, z) => [22 + ((x + 220) / 450) * (w - 44), 14 + ((z + 240) / 470) * (h - 28)];
  c.clearRect(0, 0, w, h);
  c.lineJoin = "round";
  for (const [width, color] of [[10, "#19335050"], [7, "#f1f7ffb8"]]) {
    c.beginPath();
    TRACK_SAMPLES.forEach((p, i) => {
      const q = to(p.x, p.z);
      i ? c.lineTo(...q) : c.moveTo(...q);
    });
    c.closePath();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  const start = trackAt(0), q = to(start.x, start.z);
  c.fillStyle = "#ffe879";
  c.fillRect(q[0] - 3, q[1] - 4, 6, 8);
  mapBgBuilt = true;
}
const mapPortraits = new Map(
  CHARACTERS.map((c) => {
    const im = new Image();
    im.src = portrait(c);
    return [c.id, im];
  }),
);
function drawMap() {
  if (!mapBgBuilt) buildMapBg();
  const c = mapCtx,
    w = 250,
    h = 220,
    to = (x, z) => [
      22 + ((x + 220) / 450) * (w - 44),
      14 + ((z + 240) / 470) * (h - 28),
    ];
  c.clearRect(0, 0, w, h);
  c.drawImage(mapBg, 0, 0);
  for (const r of [...race.racers].reverse()) {
    const q = to(r.x, r.z);
    c.beginPath();
    c.arc(...q, r.id ? 4 : 6, 0, Math.PI * 2);
    c.fillStyle = r.character.color;
    c.fill();
    c.strokeStyle = r.id ? "#eef5ff" : "#fff8a1";
    c.lineWidth = r.id ? 1.3 : 3;
    c.stroke();
    const icon = mapPortraits.get(r.character.id);
    if (icon?.naturalWidth) {
      const size = r.id ? 15 : 21;
      c.drawImage(icon, q[0] - size / 2, q[1] - size / 2, size, size);
    }
  }
}
const driveKeys = ['KeyZ','KeyX','KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
const hasDrivingKey = () => driveKeys.some(code => keys.has(code));
function waitingForWheel() {
  if (match || !usingPhone || race.state !== 'countdown' || hasDrivingKey()) return false;
  if (embedded) return !embeddedController.active || (raceSteering === 'gyro' && !embeddedController.live);
  return raceSteering === 'gyro' && !wheel.armed;
}
let smoothedPhoneSteer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (renderBudget.observe(now-lastFrame,race.state==='racing' && !document.hidden && !paused && !debug.freeze)) updatePixelRatio();
  const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.1));
  lastFrame = now;
  if (!debug.freeze && !paused) {
    const remote = embedded ? embeddedController : wheel.read(now, raceSteering),
      keyboard = hasDrivingKey();
    if (
      usingPhone && raceSteering === 'gyro' &&
      !remote.live &&
      phoneHadGas &&
      race.state === "racing" &&
      !keyboard
    ) {
      pause("Wheel signal lost. Hold the phone flat, then press 2 or Enter.");
      phoneHadGas = false;
    }
    phoneHadGas = remote.live && remote.gas;
    if (!embedded) {
      smoothedPhoneSteer += (remote.steer - smoothedPhoneSteer) * (1 - Math.exp(-dt * 14));
      if (Math.abs(smoothedPhoneSteer) < 0.004 && remote.steer === 0) smoothedPhoneSteer = 0;
    }
    const steerRight = keys.has("ArrowRight") || keys.has("KeyD");
    const steerLeft = keys.has("ArrowLeft") || keys.has("KeyA");
    const input = {
      gas: keys.has("KeyZ") || keys.has("ArrowUp") || keys.has("KeyW") || remote.gas,
      brake: keys.has("KeyX") || keys.has("ArrowDown") || keys.has("KeyS") || remote.brake,
      drift: keys.has("ShiftLeft") || keys.has("ShiftRight") || remote.drift,
      steer: (steerRight || steerLeft)
        ? (steerRight ? 1 : 0) - (steerLeft ? 1 : 0)
        : embedded || raceSteering === 'dpad' ? remote.steer : smoothedPhoneSteer,
      measuredWheel: raceSteering === 'gyro' && embedded && usingPhone && remote.live && !steerRight && !steerLeft,
      item: itemPulse || (remote.item && !lastRemoteItem),
    };
    lastRemoteItem = remote.item;
    itemPulse = false;
    const waitingWheel = waitingForWheel();
    match?.interpolate(now);
    if (!waitingWheel)
      race.update(dt, input);
    audio.update(race);
    setText($("wheel-status"),usingPhone
      ? (raceSteering === 'dpad' ? "D-pad steering" : (embedded ? "Gyro steering" : remote.status) + (wheel.invert ? " · inverted" : ""))
      : "W/↑/Z gas · S/↓/X brake · A/D steer · Shift drift · Space item");
  }
  draw(dt || 1 / 60, now);
}
// Explicit developer harness, enabled only by ?evidence=1. Scenario captures
// stage states and are labeled as such in the evidence report; normal keyboard
// and full-race checks are separate. No hidden gameplay shortcuts are shipped.
const debug = {
  get race() {
    return race;
  },
  wheel,
  karts,
  assets: null,
  sourceCourse: !!world.source,
  freeze: false,
  snapCamera: false,
  get audioState() {
    return {
      gain: audio.engine.master?.gain.value,
      frequency: audio.motor?.osc.frequency.value,
      state: audio.engine.ctx?.state,
      enabled: audio.engine.enabled,
      samples: audio.original.state,
      overrides: [...audio.engine.overrides]
        .filter(([, buffer]) => buffer)
        .map(([name]) => name),
    };
  },
  get paused() {
    return paused;
  },
  get renderCount() {
    return renderCount;
  },
  rayAt(x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2),
      camera,
    );
    return ray
      .intersectObjects(scene.children, true)
      .slice(0, 5)
      .map((h) => ({
        name: h.object.name,
        material: h.object.material?.name,
        racer: (() => {
          for (let node = h.object; node; node = node.parent) {
            const kart = karts.find((k) => k.root === node);
            if (kart) return kart.id;
          }
          return null;
        })(),
        color: h.object.material?.color?.getHexString(),
        type: h.object.geometry?.type,
        distance: h.distance,
        point: h.point.toArray(),
        face: h.faceIndex,
      }));
  },
  get broadcastFrames() {
    return broadcast.frames;
  },
  get statue() {
    return world.statue;
  },
  get renderPose() { return karts[0]?.pose; },
  get cameraState() {
    const safe = cameraClearance(camera.position, race.player.s);
    return {
      eye: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      up: camera.up.toArray(),
      fov: camera.fov,
      clearance: Math.hypot(safe.x-camera.position.x,safe.y-camera.position.y,safe.z-camera.position.z),
    };
  },
  get frameTimes() {
    return frameTimes.slice();
  },
  get stats() {
    return {
      pixelRatio:renderer.getPixelRatio(),programs:renderer.info.programs.length,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  },
};
if (new URLSearchParams(location.search).get("evidence") === "1") {
  window.__kart = debug;
  debug.audioStream = () => audio.original.capture?.stream;
  debug.audioUpdate = () => audio.update(race);
  debug.place = (s, { lateral = 0, speed = 30, lap = 1 } = {}) => {
    const p = surfaceAt(s, lateral),
      r = race.player;
    Object.assign(r, {
      prevPose:null,
      s: wrap(s, L),
      progress: s + (lap - 1) * L,
      x: p.x,
      y: p.y,
      z: p.z,
      lateral,
      heading: p.heading,
      surfaceForward: null,
      surfaceNormal: null,
      speed,
      lap,
      nextCheckpoint: (Math.floor((s + (lap - 1) * L) / (L / 8)) + 1) * (L / 8),
      checkpoints: Math.floor((s + (lap - 1) * L) / (L / 8)),
      anti: p.anti,
    });
    debug.snapCamera = true;
  };
  debug.stage = (name) => {
    constructRace();
    syncPickupPools();
    race.start();
    race.state = "racing";
    race.time = 10;
    $("intro").hidden = true;
    $("track-label").hidden = true;
    $("hud").hidden = false;
    debug.freeze = true;
    const r = race.player;
    if (name === "start") {
      race.state = "countdown";
      race.count = 3;
      race.time = 0.5;
      r.speed = 0;
    }
    if (name === "drift") {
      debug.place(controlDistancesFor("drift"));
      r.drift = 1;
      r.charge = 3.5;
      r.tier = 3;
      r.steer = 0.6;
      noticeUntil = 0;
    }
    if (name === "antigrav") {
      debug.place(SECTIONS.antiStart + 330);
      r.anti = true;
    }
    if (name === "glider") {
      debug.place(SECTIONS.glideStart + 35);
      r.gliding = true;
      r.y = 30;
      r.flightY = 30;
      r.flight = 1;
      r.anti = false;
    }
    if (name === "hit") {
      debug.place(170);
      race.hit(r, "red");
    }
    if (name === "results") {
      // Run the real CPU planner and finish-line logic for all eight racers.
      race = new Race({ character: menu.driver.id, seed: 42, onEvent: () => {} });
      race.start();
      for (let i = 0; i < 30000 && race.state !== "results"; i++)
        race.update(1 / 120, race.cpuInput(race.player));
      debug.snapCamera = true;
    }
    debug.snapCamera = true;
    draw(1 / 60, performance.now());
  };
  debug.step = (seconds, input) => {
    for (let i = 0; i < seconds * 120; i++)
      race.update(
        1 / 120,
        typeof input === "string" && input === "cpu"
          ? race.cpuInput(race.player)
          : input,
      );
    draw(1 / 60, performance.now());
  };
  debug.resume = resume;
}
function controlDistancesFor() {
  return 310;
}
constructRace();
syncPickupPools();
// Three r185 compiles hidden meshes and points, including the gliders, wheel
// glows and pooled particles. Supply the props and star shaders created later.
const warmup=new THREE.Group();
for(const type of ITEMS)warmup.add(type==='mushroom'?createHeldMushroom():makeItemModel(type));
const starVariants=warmup.clone();
starVariants.add(karts[0].model.clone());
updateStarModel(starVariants,true,0);
warmup.add(starVariants,impactTemplate);
scene.add(warmup);
warmup.visible=false;
await renderer.compileAsync(scene, camera);
await broadcast.compile();
scene.remove(warmup);
lastFrame = performance.now();
requestAnimationFrame(frame);
window.addEventListener("resize", () => {
  viewportWidth = innerWidth; viewportHeight = innerHeight;
  renderer.setSize(viewportWidth, viewportHeight);
  camera.aspect = viewportWidth / viewportHeight;
  updatePixelRatio();
  camera.updateProjectionMatrix();
});

function setControllerState(slot, state) {
  if (slot !== 0 || !state) return;
  const isPhone = state.connected && state.session !== "desktop";
  if (usingPhone && !isPhone && race?.state === "racing" && !paused)
    pause("Phone disconnected. Reconnect or continue with the keyboard.");
  usingPhone = isPhone;
  const label = isPhone ? "PHONE CONNECTED · P1" : "KEYBOARD READY";
  if ($("connection").textContent !== label) $("connection").textContent = label;
  if (!state.ready) {
    embeddedController = { active: false, live: false, isPhone, steer: 0, gas: false, brake: false, drift: false, item: false };
    return;
  }
  const p = state.pressed || {};
  const b = state.buttons || {};
  if (race?.state === "ready") {
    if (state.pressedActions?.['steering-mode']) menu.setSteeringMode(menu.steering === 'gyro' ? 'dpad' : 'gyro');
    for (const dir of ["left", "right", "up", "down"]) {
      if (p[dir]) navigateDriver(dir);
    }
    if (p.two || p.a) confirm();
    if (p.one || p.b) cancelDriver();
  } else if (race?.state === "results" && resultsPresentation?.done) {
    if (p.two || p.a) confirm();
  } else if (paused) {
    if (p.two) resume();
  } else if (race?.state === "racing" && (state.pressedActions ? state.pressedActions.item : p[raceSteering === 'gyro' ? 'right' : 'b'])) {
    itemPulse = true;
  }
  const dpadSteer = (b.right ? 1 : 0) - (b.left ? 1 : 0);
  const angle = state.displayAxes?.steer ?? state.axes?.steer;
  const tiltSteer = state.motionLive && Number.isFinite(angle)
    ? angle * (wheel.invert ? -1 : 1)
    : 0;
  embeddedController = {
    active: true,
    isPhone,
    live: raceSteering === 'dpad' || !isPhone || !!state.motionLive,
    steer: raceSteering === 'gyro' ? tiltSteer : dpadSteer,
    gas: state.actions ? !!state.actions.accelerate : !!(b.two || b.up || (raceSteering === 'gyro' && b.b)),
    brake: state.actions ? !!state.actions.brake : !!(b.one || b.down),
    drift: state.actions ? !!state.actions.drift : !!b.a,
    item: state.actions ? !!state.actions.item : !!b[raceSteering === 'gyro' ? 'right' : 'b'],
  };
}

window.__openwii = {
  get steeringMode() { return menu.steering; },
  setSteeringMode:menu.setSteeringMode,
  get race() { return race; },
  startMatch(setup) {
    onlineSetup=setup;
    constructRace(true);paused=false;keys.clear();itemPulse=false;begin();
    race.time=clamp(setup.elapsed/1000,0,3);
    $("again").hidden=true;
  },
  matchFrame:()=>match?.snapshot(),
  receiveMatch:(frame,senderSlot)=>match?.receive(frame,performance.now(),senderSlot),
  audio,
  pause,
  resume,
  confirm,
  chooseDriver,
  selectLaps,
  setControllerState,
  handleKey,
  releaseKeys: () => keys.clear(),
  startGame() {
    if (race?.state === "ready") {
      if (!menu.confirmed) menu.setConfirmed(true);
      begin();
    } else if (race?.state === "results") {
      constructRace();
      begin();
    } else if (paused) {
      resume();
    } else {
      constructRace();
      begin();
    }
  },
  resetGame() {
    constructRace();
    menu.phoneLayout('menu');
    $("intro").hidden = false;
    $("track-label").hidden = false;
    $("hud").hidden = true;
    menu.setConfirmed(false);
    if (embedded) parent.postMessage({ type: "game-state", paused: true }, location.origin);
  },
};

export function connectMenu() {
  if (race.player.character.id !== menu.driver.id) constructRace(true);
  race.laps = menu.laps;
  menu.connectRace({
    onCursor: () => audio.ui('cursor'),
    onDriver() { constructRace(true); },
    onLaps() { race.laps = menu.laps; },
    start: begin,
  });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
$("fullscreen").addEventListener("click", toggleFullscreen);
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "KeyF") toggleFullscreen();
  if (e.code === "KeyC") document.body.classList.toggle("capture");
});
