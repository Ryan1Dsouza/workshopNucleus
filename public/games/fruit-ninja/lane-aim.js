export function laneAim(split, slot, aim, screenSpace = false) {
  const width = split ? .5 : 1, left = split ? slot * width : 0;
  const laneX = screenSpace ? (aim.x-left)/width : aim.x;
  return {x:left+width*Math.max(0,Math.min(1,laneX)), y:Math.max(0,Math.min(1,aim.y))};
}
