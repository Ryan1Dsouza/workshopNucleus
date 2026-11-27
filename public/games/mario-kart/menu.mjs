import drivers from '../../core/kart-roster.json' with {type:'json'};
import {portrait} from './icons.js';
import {AudioEngine} from '../../core/audio.js';
import {BUTTON_BITS} from '../../core/controller-contract.js';

export const audioEngine = new AudioEngine({volume:.55, context:window.frameElement?.kartAudioContext});

const $ = id => document.getElementById(id);
export let driver = drivers[0];
export let laps = localStorage.getItem('openwii.kart.laps') === '1' ? 1 : 3;
export let steering = localStorage.getItem('openwii.kart.steering') === 'gyro' ? 'gyro' : 'dpad';
export let confirmed = false;
export let step = 'driver';
let controls, pendingStart = false;
let layout = 'menu';
let earlySound = 0;

export function phoneLayout(next) {
  if (layout === next) return;
  layout = next;
  // The adapter owns this same-origin iframe. Deliver the choice in the
  // click handler so a queued course-loading task cannot delay BLE setup.
  window.frameElement?.dispatchEvent(new CustomEvent('kart-controller-layout', {detail:layout}));
}

async function menuSound(kind='cursor') {
  if (controls) return controls.onSound(kind);
  if (!audioEngine.enabled || !audioEngine.ensureCtx()) return;
  const request=++earlySound;
  if (audioEngine.ctx.state !== 'running') {
    const at=performance.now();
    if (!await audioEngine.unlock().catch(()=>false) || request!==earlySound || controls || performance.now()-at>100) return;
  }
  audioEngine.tone({freq:kind==='cursor'?880:660,dur:.055,gain:.06});
}

export function setStep(next) {
  if (pendingStart) {
    pendingStart=false;
    $('start').disabled=false;
    $('start').removeAttribute('aria-busy');
  }
  step = ['laps', 'steering', 'start'].includes(next) ? next : 'driver';
  confirmed = step !== 'driver';
  const intro = $('intro');
  intro.classList.toggle('driver-confirmed', confirmed);
  intro.dataset.menuStep = step;
  phoneLayout(step === 'start' ? steering : 'menu');
  const copy = {
    driver: 'Choose your driver',
    laps: 'Choose race length · Press A to continue',
    steering: '← / → choose steering · A or Enter to confirm',
    start: (steering === 'gyro' ? 'Gyro' : 'D-pad') + ' selected · Press again to start',
  };
  document.querySelector('.intro-copy').textContent = copy[step];
  $('start').firstChild.textContent = step === 'steering' ? 'Confirm steering ' : 'Start Race ';
}

export function setConfirmed(value) {
  setStep(value ? 'laps' : 'driver');
}

export function chooseDriver(index) {
  const next = drivers[(index + drivers.length) % drivers.length];
  const changed = driver !== next;
  driver = next;
  setConfirmed(false);
  for (const button of $('characters').children) {
    const selected = button.dataset.driver === driver.id;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('chosen').textContent = driver.name;
  if (changed) { menuSound(); controls?.onDriver(); }
}

function showLaps() {
  for (const button of document.querySelectorAll('[data-laps]'))
    button.setAttribute('aria-pressed', String(Number(button.dataset.laps) === laps));
  document.querySelector('#track-label small').textContent = `${laps} ${laps === 1 ? 'LAP' : 'LAPS'} · 8 RACERS · MARIO KART STADIUM`;
}
export function selectLaps(value) {
  laps = value === 1 ? 1 : 3;
  localStorage.setItem('openwii.kart.laps', String(laps));
  showLaps();
  menuSound();
  controls?.onLaps();
}
function showSteering() {
  for (const button of document.querySelectorAll('[data-steering]'))
    button.setAttribute('aria-pressed', String(button.dataset.steering === steering));
}
export function setSteeringMode(value) {
  if (value !== 'dpad' && value !== 'gyro') return;
  const changed = steering !== value;
  steering = value;
  showSteering();
  setStep('steering');
  if (changed) menuSound();
}

export function confirmStep() {
  if (pendingStart) return;
  if (step === 'start') { requestStart(); return; }
  menuSound('confirm');
  if (step === 'steering') localStorage.setItem('openwii.kart.steering', steering);
  setStep({driver:'laps',laps:'steering',steering:'start'}[step]);
}
export function backStep() {
  if (step === 'driver') return;
  menuSound('cancel');
  setStep({start:'steering',steering:'laps',laps:'driver'}[step]);
}

// This menu is interactive while the course loads and while a new layout
// travels to the phone. Its navigation uses physical button edges.
export function phoneMenuInput(pressed) {
  if ($('intro').hidden) return false;
  for (const direction of ['left','right','up','down']) {
    if (pressed & BUTTON_BITS[direction]) { navigate(direction); return true; }
  }
  if (pressed & (BUTTON_BITS.a | BUTTON_BITS.two)) {
    confirmStep();
  } else if (pressed & (BUTTON_BITS.one | BUTTON_BITS.b)) {
    backStep();
  } else if (pressed & BUTTON_BITS.minus) setSteeringMode(steering === 'gyro' ? 'dpad' : 'gyro');
  return true;
}

export function navigate(direction) {
  if (step === 'laps') {
    if (direction === 'left' || direction === 'right') selectLaps(laps === 1 ? 3 : 1);
    else if (direction === 'down') { menuSound(); setStep('steering'); }
    else if (direction === 'up') backStep();
    return;
  }
  if (step === 'steering' || step === 'start') {
    if (direction === 'left' || direction === 'right') setSteeringMode(direction === 'left' ? 'dpad' : 'gyro');
    else if (direction === 'up') backStep();
    return;
  }
  chooseDriver(drivers.indexOf(driver) + {left:-1,right:1,up:-4,down:4}[direction]);
}
function requestStart() {
  phoneLayout(steering);
  if (controls) return controls.start();
  if (pendingStart) return;
  menuSound('confirm');
  pendingStart = true;
  $('start').disabled = true;
  $('start').setAttribute('aria-busy','true');
  $('start').firstChild.textContent = 'Loading stadium… ';
}
export function menuKey(event) {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
  const direction = {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down'}[event.code];
  const accept = ['Enter','Space','KeyZ'].includes(event.code);
  const back = ['Escape','KeyX'].includes(event.code);
  if (!direction && !accept && !back) return;
  if (event.repeat) { event.preventDefault(); return; }
  const focused=event.target.closest?.('button:focus-visible,a:focus-visible');
  if (accept && focused && (!focused.closest('#intro') || focused.id==='start' || focused.getAttribute('aria-pressed')==='false')) return;
  event.preventDefault();
  if (direction) {
    if (focused?.closest('#intro')) focused.blur();
    navigate(direction);
  } else if (back) backStep();
  else confirmStep();
}

export function mountMenu() {
  for (const [index, character] of drivers.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character';
    button.dataset.driver = character.id;
    button.setAttribute('aria-label', character.name);
    const image = new Image();
    image.alt = character.name;
    image.src = portrait(character);
    button.append(image);
    button.onclick = () => chooseDriver(index);
    $('characters').append(button);
  }
  chooseDriver(0);
  for (const button of document.querySelectorAll('[data-laps]')) button.onclick = () => {setStep('laps');selectLaps(Number(button.dataset.laps));};
  for (const button of document.querySelectorAll('[data-steering]')) button.onclick = () => setSteeringMode(button.dataset.steering);
  showLaps();
  showSteering();
  $('start').onclick = () => {
    if (step === 'steering') confirmStep();
    else if (step !== 'start' && window.frameElement?.kartHasPhone?.()) setStep('steering');
    else requestStart();
  };
  window.addEventListener('keydown', menuKey);
  $('intro').hidden = false;
}

export function connectRace(callbacks) {
  controls = callbacks;
  window.removeEventListener('keydown', menuKey);
  if (!pendingStart) return;
  pendingStart = false;
  $('start').disabled = false;
  $('start').removeAttribute('aria-busy');
  $('start').firstChild.textContent = 'Start Race ';
  controls.start();
}
