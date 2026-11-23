export const stage = 7;
export const features = Object.freeze({
  game: stage >= 2,
  phone: stage >= 3,
  direct: stage >= 4,
  twoPlayers: stage >= 4,
  players: stage >= 4 ? 2 : stage >= 3 ? 1 : 0,
  diagnostics: stage >= 5,
  bluetooth: stage >= 6,
});
