import {mountMenu, phoneMenuInput} from './menu.mjs';

try {
  mountMenu();
  window.kartPhoneMenu = phoneMenuInput;
  window.__controllerEmbedded = window.parent !== window;
  if (window.__controllerEmbedded) parent.postMessage({type:'kart-menu-ready'},location.origin);
  if (!window.__controllerEmbedded && new URLSearchParams(location.search).has('room')) {
    const { io } = await import('/socket.io/socket.io.esm.min.js');
    window.io = io;
  }
  const {connectMenu} = await import('./game.js');
  if (window.__controllerEmbedded) parent.postMessage({ type: 'kart-ready' }, location.origin);
  connectMenu();
} catch (error) {
  const message = document.getElementById('error');
  message.textContent = 'The race could not load: ' + error.message;
  message.hidden = false;
  document.getElementById('start').disabled = true;
  if (window.__controllerEmbedded) parent.postMessage({ type: 'kart-error', message: error.message }, location.origin);
  throw error;
}
