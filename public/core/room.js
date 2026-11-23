export function roomCode() {
  const supplied = new URLSearchParams(location.search).get('room');
  if (supplied && /^[\w-]{16,64}$/.test(supplied)) return supplied;
  let room = sessionStorage.getItem('air.room');
  if (!room) {
    room = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('air.room', room);
  }
  return room;
}
