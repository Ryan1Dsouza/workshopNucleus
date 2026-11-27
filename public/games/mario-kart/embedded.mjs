try {
  window.__controllerEmbedded = window.parent !== window;
  if (!window.__controllerEmbedded && new URLSearchParams(location.search).has('room')) {
    const { io } = await import('/socket.io/socket.io.esm.min.js');
    window.io = io;
  }
  await import('./game.js');
  if (window.__controllerEmbedded) parent.postMessage({ type: 'kart-ready' }, location.origin);
} catch (error) {
  parent.postMessage({ type: 'kart-error', message: error.message }, location.origin);
  throw error;
}
