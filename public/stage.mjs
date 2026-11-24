export const stage = 7;
export const features = Object.freeze({
  pairing: stage >= 1,
  buttons: stage >= 2,
  motion: stage >= 3,
  profiles: stage >= 4,
  fruit: stage >= 5,
  extension: stage >= 6,
  game: stage >= 5,
  phone: stage >= 1,
  direct: false,
  twoPlayers: stage >= 1,
  players: stage >= 1 ? 2 : 0,
  diagnostics: stage >= 7,
  bluetooth: stage >= 1,
});
