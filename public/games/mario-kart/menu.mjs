import drivers from '../../core/kart-roster.json' with {type:'json'};
import {portrait} from './icons.js';
import {AudioEngine} from '../../core/audio.js';

export const audioEngine = new AudioEngine({volume:.55});

const $ = id => document.getElementById(id);
export let driver = drivers[0];
export let laps = localStorage.getItem('openwii.kart.laps') === '1' ? 1 : 3;
export let steering = localStorage.getItem('openwii.kart.steering') === 'gyro' ? 'gyro' : 'dpad';
export let confirmed = false;
export let step = 'driver';
let controls, pendingStart = false;
let layout = 'menu';

export function phoneLayout(next) {
  if (layout === next) return;
  layout = next;
  // The adapter owns this same-origin iframe. Deliver the choice in the
  // click handler so a queued course-loading task cannot delay BLE setup.
  window.frameElement?.dispatchEvent(new CustomEvent('kart-controller-layout', {detail:layout}));
}

async function cursorSound() {
  if (controls) return controls.onCursor();
  if (audioEngine.enabled && await audioEngine.unlock())
    audioEngine.tone({freq:880,dur:.055,gain:.06});
}

export function setStep(next) {
  step = ['laps', 'steering'].includes(next) ? next : 'driver';
  confirmed = step !== 'driver';
  const intro = $('intro');
  intro.classList.toggle('driver-confirmed', confirmed);
  intro.dataset.menuStep = step;
  phoneLayout(step === 'steering' ? steering : 'menu');
  const copy = {
    driver: 'Choose your driver',
    laps: 'Choose race length · Press A to continue',
    steering: 'Choose phone steering · Press A to start race',
  };
  document.querySelector('.intro-copy').textContent = copy[step];
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
  if (changed) { void cursorSound(); controls?.onDriver(); }
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
  void cursorSound();
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
  localStorage.setItem('openwii.kart.steering', value);
  showSteering();
  setStep('steering');
  if (changed) void cursorSound();
}

export function navigate(direction) {
  if (step === 'laps') {
    if (direction === 'left' || direction === 'right') selectLaps(laps === 1 ? 3 : 1);
    else if (direction === 'down') { void cursorSound(); setStep('steering'); }
    else if (direction === 'up') { void cursorSound(); setStep('driver'); }
    return;
  }
  if (step === 'steering') {
    if (direction === 'left' || direction === 'right') setSteeringMode(steering === 'dpad' ? 'gyro' : 'dpad');
    else if (direction === 'up') { void cursorSound(); setStep('laps'); }
    return;
  }
  chooseDriver(drivers.indexOf(driver) + {left:-1,right:1,up:-4,down:4}[direction]);
}
function requestStart() {
  if (controls) return controls.start();
  if (pendingStart) return;
  void cursorSound();
  pendingStart = true;
  $('start').disabled = true;
  $('start').setAttribute('aria-busy','true');
  $('start').firstChild.textContent = 'Loading stadium… ';
}
function earlyKey(event) {
  if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
  const direction = {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down'}[event.code];
  if (direction) navigate(direction);
  else if (['Enter','Space'].includes(event.code) && !event.target.closest?.('button:focus-visible,a:focus-visible')) requestStart();
  else return;
  event.preventDefault();
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
  for (const button of document.querySelectorAll('[data-laps]')) button.onclick = () => selectLaps(Number(button.dataset.laps));
  for (const button of document.querySelectorAll('[data-steering]')) button.onclick = () => setSteeringMode(button.dataset.steering);
  showLaps();
  showSteering();
  $('start').onclick = requestStart;
  window.addEventListener('keydown', earlyKey);
  $('intro').hidden = false;
}

export function connectRace(callbacks) {
  controls = callbacks;
  window.removeEventListener('keydown', earlyKey);
  if (!pendingStart) return;
  pendingStart = false;
  $('start').disabled = false;
  $('start').removeAttribute('aria-busy');
  $('start').firstChild.textContent = 'Start Race ';
  controls.start();
}
