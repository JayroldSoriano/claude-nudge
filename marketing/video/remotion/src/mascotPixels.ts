// 14x13 pixel map, identical to shared/mascot-pixels.json (and extension/content.js).
export type Pt = [number, number];
const body: Pt[] = [];
for (let y = 3; y <= 11; y++) {
  for (let x = 1; x <= 11; x++) {
    const corner = (y === 3 || y === 11) && (x === 1 || x === 11);
    if (!corner) body.push([x, y]);
  }
}
export const PX = {
  body,
  bulb: [[5, 0], [6, 0], [7, 0]] as Pt[],
  stalk: [[6, 1], [6, 2]] as Pt[],
  eyes: [[3, 6], [4, 6], [3, 7], [4, 7], [8, 6], [9, 6], [8, 7], [9, 7]] as Pt[],
  glint: [[3, 6], [8, 6]] as Pt[],
  smile: [[4, 9], [5, 10], [6, 10], [7, 10], [8, 9]] as Pt[],
  frown: [[4, 10], [5, 9], [6, 9], [7, 9], [8, 10]] as Pt[],
  browL: [[3, 4], [4, 5]] as Pt[],
  browR: [[9, 4], [8, 5]] as Pt[],
  footL: [[3, 12], [4, 12]] as Pt[],
  footR: [[8, 12], [9, 12]] as Pt[],
  armLeft: [[0, 7], [0, 8]] as Pt[],
  armUp: [[12, 4], [12, 5], [12, 6], [12, 7]] as Pt[],
  armOut: [[12, 7], [12, 6], [13, 5], [13, 4]] as Pt[],
  base: [[2, 11], [3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11]] as Pt[],
};
export const GRID = { w: 14, h: 13 };
