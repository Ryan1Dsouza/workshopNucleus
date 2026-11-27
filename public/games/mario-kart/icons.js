const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const shell = (color, wings = false) =>
  svg(
    `${wings ? '<path d="M28 40Q-5 0 4 51L28 68M72 40Q105 0 96 51L72 68" fill="#edf8ff" stroke="#768bb8" stroke-width="3"/>' : ""}<ellipse cx="50" cy="75" rx="39" ry="15" fill="#fff3ce" stroke="#283754" stroke-width="3"/><path d="M15 68C13 4 86 4 85 68Q50 86 15 68" fill="${color}" stroke="#273448" stroke-width="4"/><path d="M31 24L49 40 68 23M49 40L45 65M15 52L45 65 84 49" fill="none" stroke="#ffffff77" stroke-width="4"/>`,
  );
export const ITEM_ICONS = {
  banana: svg(
    '<path d="M49 12L59 12 57 45Q70 63 92 66L82 85Q57 81 51 62 38 89 13 82L6 67Q34 63 45 45Z" fill="#ffe12e" stroke="#a67716" stroke-width="4"/><path d="M45 42L56 42" stroke="#5c7632" stroke-width="6"/><ellipse cx="46" cy="51" rx="2" ry="4"/><ellipse cx="55" cy="51" rx="2" ry="4"/>',
  ),
  green: shell("#45bf59"),
  red: shell("#ec4651"),
  blue: shell("#4289ff", true),
  mushroom: svg(
    '<path d="M28 63L72 63 70 85Q50 99 30 85Z" fill="#ffe6b0" stroke="#a98452" stroke-width="3"/><path d="M7 61C5-7 94-7 93 61Q51 80 7 61" fill="#ed3b46" stroke="#6f203b" stroke-width="4"/><ellipse cx="50" cy="26" rx="18" ry="20" fill="white"/><ellipse cx="16" cy="46" rx="8" ry="17" fill="white"/><ellipse cx="84" cy="46" rx="8" ry="17" fill="white"/><path d="M42 77V85M58 77V85" stroke="#182236" stroke-width="4"/>',
  ),
  star: svg(
    '<path d="M50 4L63 34 97 36 71 59 79 94 50 76 21 94 29 59 3 36 37 34Z" fill="#ffe53c" stroke="#bd8312" stroke-width="4"/><path d="M42 44V58M58 44V58" stroke="#172236" stroke-width="5" stroke-linecap="round"/>',
  ),
  empty: svg(
    '<text x="50" y="72" fill="#7183a9" font-family="Arial" font-weight="bold" font-size="75" text-anchor="middle">?</text>',
  ),
};
// Lossless 128px crops of the driver sheet documented in /assets/mario-kart/ui/provenance.json.
export function portrait(character) {
  return './art/' + character.id + '.webp';
}
