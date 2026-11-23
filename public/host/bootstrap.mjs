import { stage, features } from '../stage.mjs';
for (const element of document.querySelectorAll('[data-feature]')) {
  if (!features[element.dataset.feature]) element.hidden = true;
}
document.documentElement.dataset.stage = stage;
if (!features.twoPlayers) document.querySelector('.phones').style.gridTemplateColumns = '1fr';
if (!features.phone) document.querySelector('.setup-foot span').textContent = features.game ? 'Mouse: hold button · sweep · slice' : 'Server ready · game comes next';
document.querySelector('.setup-intro').textContent = features.bluetooth
  ? 'For Bluetooth: install the Android app, start Bluetooth there, then connect your phone below. Center the blade and sweep your wrist. The QR codes provide Wi-Fi control.'
  : features.phone ? 'Scan the QR code, enable motion and tap Center blade. Turn your wrist to slice through the fruit.'
    : features.game ? 'Hold the mouse button and sweep through fruit. Try practice mode, then Classic with three lives.'
      : 'The projector shell is ready. The next stage adds the game and desktop blade.';
try {
  if (features.game) {
    await import('/games/fruit-ninja/game.js');
    await import('./setup.mjs');
    if (features.diagnostics) await import('./diagnostics.mjs');
  } else {
    const health = await fetch('/api/health').then(response => response.json());
    document.getElementById('serverNote').textContent = health.app === 'air-slice' ? 'Server connected. Stage 1 is ready.' : 'Check the running server.';
  }
} catch(error) {
  document.getElementById('serverNote').textContent='The 3D game could not start. Use a current browser with WebGL 2 and hardware acceleration, then reload. Check that npm ci completed.';
  for(const id of ['startPractice','startClassic','startBladeCheck'])document.getElementById(id).disabled=true;
  console.error('Air Slice startup:',error);
}
