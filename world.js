/* Riftfall — world.js
   Places: the ground you walk on, what stands on it, what lives in it, and what you can't walk through.
   Two places so far: the Keeper's Cove on Lanternhold, and the first Rift, the Drowned Orchard. */
import * as THREE from 'three';
import { PALETTE, RIFT } from '@rf/data';
import { Batch, MAT, PROPS, ORCHARD, rng, fbm, noise, col, shade, pick, clamp, lerp, TAU, buildSea, buildSky, buildGrass, buildBoat, buildDummy, buildFish, buildChest, buildHeartGlass, causticMaterial, CAUSTICS, WIND, SKY_UNIFORMS } from '@rf/art';

const V3 = THREE.Vector3;
const N = 60;                 // the cove is N x N cells of 1 x 1
const H0 = -N / 2;            // world x/z of the first cell
const STEP = 0.5;             // heights come in steps of half a block
const q = (h) => Math.round(h / STEP) * STEP;

// ---------------------------------------------------------------------------
// The shape of the cove: a cliff plateau in the north with the lighthouse and Maren's cottage,
// a meadow in the middle with the old training ground, a sandy beach and the sea to the south-east,
// rocky hills to the west.
// ---------------------------------------------------------------------------
function shoreS(x, z) { return (z - 8) * 0.6 + (x - 13) * 0.78 + (fbm(x * 0.09 + 3, z * 0.09 - 5) - 0.5) * 6; }
function plateauEdge(x) { return -9.5 + (fbm(x * 0.15, 4.2) - 0.5) * 4; }
const STAIRS = [];                                   // cells of the stair path, with their height
for (let k = 0; k <= 6; k++) for (let w = -1; w <= 1; w++) STAIRS.push({ x: -3 + w, z: -6 - k, h: 1.5 + k * 0.5 });
const stairMap = new Map(STAIRS.map((s) => [s.x + ',' + s.z, s.h]));
// the Seep: a round clearing in the southern meadow where the fallen shard lies
export const SEEP_AT = { x: -4, z: 12, r: 6.2, h: 1 };
// Lanternhold village: houses round a well, south of the stone circle
export const VILLAGE_AT = { x: -12.5, z: 21.5, r: 11 };

function cellInfo(cx, cz) {
  // cx, cz: the integer cell corner (world units)
  const x = cx + 0.5, z = cz + 0.5;
  const s = shoreS(x, z);
  const st = stairMap.get(cx + ',' + cz);
  let h, kind;
  if (st !== undefined) return { h: st, kind: 'path' };
  // the Seep's clearing is level ground, ringed by a worn circle of stones
  const ds = Math.hypot(x - SEEP_AT.x, z - SEEP_AT.z);
  if (ds < SEEP_AT.r + 1.6) return { h: SEEP_AT.h, kind: Math.abs(ds - SEEP_AT.r) < 0.6 ? 'path' : 'grass' };
  // the village sits on level ground, with a cobbled square around the well
  const dv = Math.hypot(x - VILLAGE_AT.x, z - VILLAGE_AT.z);
  if (dv < VILLAGE_AT.r) return { h: 1, kind: dv < 3.3 ? 'cobble' : s > -5.4 ? 'sand' : 'grass' };
  const edge = plateauEdge(x);
  const west = -x - 19 + (fbm(z * 0.13, 9) - 0.5) * 5;  // > 0 in the western hills
  if (s >= 0.8) {
    h = q(-0.5 - Math.min(3.5, (s - 0.8) * 0.55));
    kind = 'sand';
    // the plateau drops straight into the sea as a cliff
    if (z < edge + 1 && s < 6) { h = q(Math.max(h, -1)); kind = 'stone'; }
    return { h, kind };
  }
  if (z < edge) {
    // the plateau
    h = 4 + (fbm(x * 0.2, z * 0.2) > 0.62 ? 0.5 : 0);
    kind = 'grass';
    if (s > -2.5) kind = 'stone';
  } else if (s > -5.4) {
    // the beach: flat near the water, a few low dunes further up
    h = s > -3.2 ? 0.5 : 0.5 + (fbm(x * 0.3 + 9, z * 0.3) > 0.62 ? 0.5 : 0);
    kind = 'sand';
  } else {
    // the meadow climbs gently toward the plateau
    const climb = clamp((edge + 4 - z) / 4, 0, 1);
    h = 1 + (fbm(x * 0.17 + 2, z * 0.17) > 0.6 ? 0.5 : 0) + q(climb * 1.0);
    kind = 'grass';
    if (s > -6.6) h = 1;
  }
  if (west > 0) {
    // terraced hills: grassy steps, bare rock only where it's steep
    h = Math.max(h, q(1 + west * 0.5 + fbm(x * 0.35, z * 0.35) * 1.2));
    kind = west > 3.5 && fbm(x * 0.5, z * 0.5) > 0.45 ? 'stone' : 'grass';
  }
  // the outer edge of the map rises into forested ridges, so the world feels closed but natural
  const border = Math.max(-N / 2 + 4 - x, -N / 2 + 4 - z);
  if (border > 0 && s < -2) {
    h = Math.max(h, q(h + border * (0.9 + fbm(x * 0.2, z * 0.2) * 0.8) + fbm(x * 0.5, z * 0.5) * 1.5));
    kind = border > 2.6 && fbm(x * 0.4 + 5, z * 0.4) > 0.5 ? 'stone' : 'grass';
  }
  return { h, kind };
}

// ---------------------------------------------------------------------------
// Building the cove
// ---------------------------------------------------------------------------
export function buildCove(scene) {
  const r = rng(20261020);
  const H = new Float32Array(N * N), K = new Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cellInfo(H0 + i, H0 + j);
    H[j * N + i] = c.h; K[j * N + i] = c.kind;
  }
  // paths: worn sand-coloured tracks through the grass
  const pathCells = new Set();
  const paint = (x0, z0, x1, z1, w = 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = lerp(x0, x1, t) + (noise(k * 0.3, 1) - 0.5) * 0.8, z = lerp(z0, z1, t);
      for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) if (Math.abs(a) + Math.abs(b) <= w) pathCells.add(Math.floor(x + a) + ',' + Math.floor(z + b));
    }
  };
  paint(-3, -6, -4, -2, 1); paint(-4, -2, 0, 2, 1); paint(0, 2, 4, 3, 0); paint(-4, -2, -6.4, 2, 0);
  paint(-3, -13, 0, -14, 1); paint(0, -14, 9, -15, 0); paint(9, -15, 19, -14, 0);
  paint(4, 2, 8, 3, 0);
  paint(0, 2, -1.5, 6.4, 0);
  paint(-9.8, 18.9, -8.4, 16.4, 0); paint(-9.4, 22.2, -3.5, 22.6, 0); paint(-14.6, 19.2, -16.2, 17.6, 0); paint(-14.8, 22.8, -16.8, 24.2, 0); paint(-12.4, 24.6, -12.1, 26.2, 0);
  for (const key of pathCells) {
    const [x, z] = key.split(',').map(Number);
    const i = x - H0, j = z - H0;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    if (K[j * N + i] === 'grass') K[j * N + i] = 'path';
  }
  const hAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? -4 : H[j * N + i]);
  const kAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 'sand' : K[j * N + i]);
  const cellH = (x, z) => hAt(Math.floor(x) - H0, Math.floor(z) - H0);

  // ----- the terrain mesh: tops, plus sides only where a neighbour is lower -----
  const tb = new Batch(3);
  const topCol = (kind, i, j) => {
    const nn = noise(i * 0.35, j * 0.35);
    switch (kind) {
      case 'sand': return PALETTE.sand[Math.floor(nn * 4) % 4];
      case 'stone': return PALETTE.stone[Math.floor(nn * 3) % 3];
      case 'path': return PALETTE.path[Math.floor(nn * 3) % 3];
      case 'cobble': return ['#a8a39a', '#9d978d', '#b2ada3', '#a39d92'][Math.floor(hashJ(i * 7, j * 3) * 4)];
      case 'seep': return ['#7fb7a6', '#86c2b2', '#78ad9e'][Math.floor(nn * 3) % 3];   // grass going glassy around the shard
      default: return PALETTE.grass[Math.floor((nn * 0.7 + hashJ(i, j) * 0.3) * 4) % 4];
    }
  };
  const sideCol = (kind, depthFromTop, y) => {
    if (kind === 'grass' || kind === 'path') return depthFromTop < 0.3 ? PALETTE.grassSide : (Math.floor(y / 0.5) % 2 ? PALETTE.dirt : PALETTE.dirtDark);
    if (kind === 'sand') return depthFromTop < 0.3 ? PALETTE.sandSide : shade(PALETTE.sandSide, 0.86);
    return Math.floor(y / 0.5) % 2 ? PALETTE.stoneSide : shade(PALETTE.stoneSide, 0.88);
  };
  const tmpC = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = H[j * N + i], kind = K[j * N + i];
    if (h < -0.3) continue;   // under the sea: never seen
    const x0 = H0 + i, z0 = H0 + j, x1 = x0 + 1, z1 = z0 + 1;
    // corner occlusion: darker where taller cells crowd the corner
    const hi = (a, b) => (hAt(i + a, j + b) > h + 0.01 ? 1 : 0);
    const ao = (a, b) => 1 - 0.13 * (hi(a, 0) + hi(0, b) + hi(a, b));
    tmpC.set(topCol(kind, i, j)).multiplyScalar(0.96 + hashJ(i * 3, j * 7) * 0.08);
    tb.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], tmpC, ao(-1, 1), ao(1, 1), ao(1, -1), ao(-1, -1));
    // sides
    const sides = [[1, 0, [x1, z1], [x1, z0], [1, 0, 0]], [-1, 0, [x0, z0], [x0, z1], [-1, 0, 0]], [0, 1, [x0, z1], [x1, z1], [0, 0, 1]], [0, -1, [x1, z0], [x0, z0], [0, 0, -1]]];
    for (const [di, dj, a, b, n] of sides) {
      let nh = hAt(i + di, j + dj);
      if (nh >= h) continue;
      nh = Math.max(nh, -2.5);
      // split the side into half-block bands, so cliffs show their layers
      for (let y = h; y > nh + 0.001; y -= STEP) {
        const y0 = Math.max(nh, y - STEP);
        const c = sideCol(kind, h - y, y);
        const lo = y0 <= nh + 0.001 ? 0.7 : 0.92, up = y >= h - 0.001 ? 1.0 : 0.95;
        tb.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], n, c, lo, lo, up, up);
      }
    }
  }
  const terrain = tb.mesh();
  scene.add(terrain);

  // ----- props -----
  const b = new Batch(11), g = new Batch(12);
  const solids = [];          // circles: { x, z, r }
  const boxes = [];           // rectangles: { x0, z0, x1, z1 }
  const occupied = new Set();
  const take = (x, z, rad = 1) => { for (let a = -rad; a <= rad; a++) for (let c = -rad; c <= rad; c++) occupied.add(Math.floor(x + a) + ',' + Math.floor(z + c)); };
  const free = (x, z) => !occupied.has(Math.floor(x) + ',' + Math.floor(z)) && !pathCells.has(Math.floor(x) + ',' + Math.floor(z)) && !stairMap.has(Math.floor(x) + ',' + Math.floor(z));
  const kindAt = (x, z) => kAt(Math.floor(x) - H0, Math.floor(z) - H0);
  // trees and rocks keep their distance from paths, stairs and doors, so the ways through stay open
  const nearWay = (x, z, rad) => { for (let a = -rad; a <= rad; a++) for (let c = -rad; c <= rad; c++) { const k = Math.floor(x + a) + ',' + Math.floor(z + c); if (pathCells.has(k) || stairMap.has(k)) return true; } return false; };
  const flatAround = (x, z, rad) => { const h = cellH(x, z); for (let a = -rad; a <= rad; a++) for (let c = -rad; c <= rad; c++) if (cellH(x + a, z + c) !== h) return false; return true; };

  // landmarks first
  const lhX = 21.5, lhZ = -15.5;
  const lh = PROPS.lighthouse(b, g, lhX, cellH(lhX, lhZ), lhZ);
  solids.push({ x: lhX, z: lhZ, r: 1.75, h: 12 }); take(lhX, lhZ, 2);
  const cotX = 1.5, cotZ = -16.5, cotY = cellH(cotX, cotZ);
  PROPS.cottage(b, g, cotX, cotY, cotZ, 0);
  boxes.push({ x0: cotX - 2.3, z0: cotZ - 1.9, x1: cotX + 2.3, z1: cotZ + 1.9, h: 5 }); take(cotX, cotZ, 3);
  take(cotX - 0.6, cotZ + 4, 2);   // keep the way to the door clear
  // a little garden fence, a woodpile and a bench by the cottage
  PROPS.fence(b, cotX - 3.2, cotZ + 2.6, cotX - 3.2, cotZ - 2, cotY, cotY);
  for (let k = 0; k < 6; k++) b.box(0.9, 0.22, 0.24, k % 2 ? '#9a6b45' : '#8a5e3c', cotX + 3.0, cotY + 0.12 + Math.floor(k / 2) * 0.24, cotZ - 0.6 + (k % 2) * 0.26);
  b.box(1.4, 0.12, 0.45, '#8b5e3c', cotX + 3.3, cotY + 0.45, cotZ + 1.6); b.box(0.12, 0.4, 0.4, '#5d3d26', cotX + 2.75, cotY + 0.2, cotZ + 1.6); b.box(0.12, 0.4, 0.4, '#5d3d26', cotX + 3.85, cotY + 0.2, cotZ + 1.6);
  solids.push({ x: cotX + 3.0, z: cotZ - 0.5, r: 0.55, h: 0.8 });
  // vegetable patch
  for (let a = 0; a < 3; a++) for (let c = 0; c < 4; c++) {
    const px = cotX - 5.2 + a * 0.7, pz = cotZ - 1.4 + c * 0.8;
    b.box(0.55, 0.14, 0.6, '#6b4a33', px, cotY + 0.07, pz);
    b.box(0.2, 0.22, 0.2, pick(['#5aa64c', '#7cc35e', '#e0573f'], r), px, cotY + 0.25, pz);
  }
  take(cotX - 5, cotZ, 2);
  // lanterns along the way up and at the dock
  const lanterns = [[-1.2, -7.5, 0], [-1.6, -12.8, 0], [7.5, -14.6, 1.2], [16.5, -13.4, 0.6], [11.6, 7.4, 0], [4.2, 1.2, 0.4], [-5.3, -0.3, 2]];
  for (const [x, z, rot] of lanterns) { PROPS.lanternPost(b, g, x, cellH(x, z), z, rot); solids.push({ x, z, r: 0.2, h: 2.1 }); take(x, z, 0); }

  // the old training ground: a ring of fence posts, a weapon rack and three practice dummies
  const tgX = -11, tgZ = 2, tgY = cellH(tgX, tgZ);
  // a ring of fence around it, open toward the east where the path comes in
  const ring = [];
  for (let k = 0; k <= 16; k++) { const a = 0.55 + (k / 16) * (TAU - 1.1); ring.push([tgX + Math.cos(a) * 4.4, tgZ + Math.sin(a) * 4.4]); }
  for (let k = 0; k < ring.length - 1; k++) {
    const [x0, z0] = ring[k], [x1, z1] = ring[k + 1];
    PROPS.fence(b, x0, z0, x1, z1, cellH(x0, z0), cellH(x1, z1));
    for (let t = 0; t <= 1; t += 0.25) solids.push({ x: lerp(x0, x1, t), z: lerp(z0, z1, t), r: 0.18, h: 0.85 });
  }
  // a pennant pole at the gate
  const [gx, gz] = ring[0];
  b.box(0.12, 2.6, 0.12, '#6b4a33', gx, cellH(gx, gz) + 1.3, gz);
  b.box(0.04, 0.5, 0.7, '#e0573f', gx, cellH(gx, gz) + 2.3, gz + 0.38);
  b.box(0.04, 0.3, 0.3, '#e0573f', gx, cellH(gx, gz) + 2.2, gz + 0.85);
  b.push(tgX - 3.2, tgY, tgZ - 2.2, 0.6);
  b.box(1.6, 0.12, 0.2, '#8b5e3c', 0, 1.1, 0); b.box(1.6, 0.12, 0.2, '#8b5e3c', 0, 0.5, 0);
  b.box(0.14, 1.3, 0.2, '#5d3d26', -0.7, 0.65, 0); b.box(0.14, 1.3, 0.2, '#5d3d26', 0.7, 0.65, 0);
  for (const [x, c] of [[-0.35, '#9aa3ad'], [0, '#c9a24a'], [0.35, '#9aa3ad']]) b.box(0.08, 1.0, 0.06, c, x, 0.75, 0.12, { rotZ: x * 0.1 });
  b.pop();
  solids.push({ x: tgX - 3.2, z: tgZ - 2.2, r: 0.7, h: 1.3 });
  take(tgX, tgZ, 4);
  const dummies = [];
  for (const [dx, dz] of [[-1.6, -0.6], [1.4, -1.4], [0.2, 1.6]]) {
    const d = buildDummy(dummies.length + 3);
    const x = tgX + dx, z = tgZ + dz;
    d.root.position.set(x, cellH(x, z), z);
    d.root.rotation.y = Math.atan2(0 - dx, 3 - dz) * 0.5;
    scene.add(d.root);
    dummies.push(Object.assign(d, { x, z, r: 0.42, vel: new THREE.Vector2(), tilt: new THREE.Vector2(), hits: 0 }));
    solids.push({ x, z, r: 0.4, dummy: true });
  }

  // the dock reaching into the sea, the boat tied to it, crates and nets
  const dock = { x0: 12.4, x1: 14.2, z0: 7.5, z1: 20.5, y: 0.72 };
  for (let z = dock.z0; z < dock.z1; z += 0.5) {
    b.box(1.8, 0.1, 0.46, (Math.floor(z * 2) % 3) ? '#a6764d' : '#956a45', (dock.x0 + dock.x1) / 2 + (r() - 0.5) * 0.04, dock.y - 0.05, z + 0.25, { top: shade('#b5865c', 0.95 + r() * 0.1) });
  }
  for (let z = dock.z0 + 1; z <= dock.z1; z += 2.5) for (const x of [dock.x0 + 0.05, dock.x1 - 0.05]) {
    b.box(0.22, 2.4, 0.22, '#6b4a33', x, dock.y - 1.0, z);
    b.box(0.26, 0.08, 0.26, '#5d3d26', x, dock.y + 0.24, z);
  }
  b.box(0.1, 0.1, dock.z1 - dock.z0, '#5d3d26', dock.x0 - 0.02, dock.y + 0.05, (dock.z0 + dock.z1) / 2);
  PROPS.crate(b, dock.x0 + 0.5, dock.y, dock.z1 - 1.0, 0.3);
  PROPS.crate(b, dock.x0 + 0.45, dock.y + 0.7, dock.z1 - 1.0, 0.7, 0.8);
  PROPS.barrel(b, dock.x1 - 0.45, dock.y, dock.z1 - 2.1, 0.4);
  solids.push({ x: dock.x0 + 0.5, z: dock.z1 - 1.0, r: 0.5, h: 1.4 }, { x: dock.x1 - 0.45, z: dock.z1 - 2.1, r: 0.35, h: 0.9 });
  // coiled rope and a fishing net drying over a rack on the beach
  b.box(0.5, 0.1, 0.5, '#c8b28a', dock.x1 - 0.5, dock.y + 0.05, dock.z0 + 4);
  b.box(0.3, 0.12, 0.3, '#b09a74', dock.x1 - 0.5, dock.y + 0.12, dock.z0 + 4);
  const netX = 15.5, netZ = -1.5, netY = cellH(netX, netZ);
  b.box(0.12, 1.4, 0.12, '#6b4a33', netX - 1, netY + 0.7, netZ); b.box(0.12, 1.4, 0.12, '#6b4a33', netX + 1, netY + 0.7, netZ);
  b.box(2.2, 0.08, 0.08, '#5d3d26', netX, netY + 1.38, netZ);
  for (let k = 0; k < 9; k++) b.box(0.22, 1.0 - (k % 3) * 0.15, 0.03, k % 2 ? '#7a8f7a' : '#8aa08a', netX - 0.9 + k * 0.22, netY + 0.9 - (k % 3) * 0.07, netZ, { jitter: 0.15 });
  solids.push({ x: netX - 1, z: netZ, r: 0.15, h: 1.5 }, { x: netX + 1, z: netZ, r: 0.15, h: 1.5 }, { x: netX, z: netZ, r: 0.5, h: 1.4, thin: true });
  take(netX, netZ, 1);
  for (const [x, z] of [[11.2, 6.6], [10.5, 7.3]]) { PROPS.crate(b, x, cellH(x, z), z, r()); solids.push({ x, z, r: 0.45, h: 0.75 }); }
  PROPS.barrel(b, 11.6, cellH(11.6, 5.8), 5.8, 1); solids.push({ x: 11.6, z: 5.8, r: 0.35, h: 0.85 });
  take(11, 6.5, 1);

  // a campfire on the beach with log seats: the warm heart of the cove at dusk
  const fire = { x: 9.5, z: 3.0 };
  fire.y = cellH(fire.x, fire.z);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.box(0.34, 0.24, 0.3, pick(PALETTE.stone, r), fire.x + Math.cos(a) * 0.62, fire.y + 0.1, fire.z + Math.sin(a) * 0.62, { rotY: a }); }
  for (let k = 0; k < 4; k++) b.box(0.9, 0.14, 0.14, '#6b4a33', fire.x, fire.y + 0.12 + k * 0.04, fire.z, { rotY: k * 0.8 + 0.3, rotZ: 0.25 });
  b.box(0.7, 0.04, 0.7, '#2a2026', fire.x, fire.y + 0.03, fire.z, { jitter: 0 });
  g.box(0.32, 0.36, 0.32, '#ff9a3c', fire.x, fire.y + 0.32, fire.z, { glow: 3.2, jitter: 0, rotY: 0.5 });
  g.box(0.18, 0.3, 0.18, '#ffd36b', fire.x, fire.y + 0.52, fire.z, { glow: 3.8, jitter: 0, rotY: 1.1 });
  for (const [dx, dz, rot] of [[-1.6, 0.2, 1.4], [0.3, -1.5, 0.1], [1.4, 1.0, 2.3]]) {
    b.push(fire.x + dx, fire.y, fire.z + dz, rot);
    b.box(1.5, 0.34, 0.38, '#8a6444', 0, 0.2, 0, { top: '#a77a4f' });
    b.box(0.08, 0.36, 0.4, '#c8a77a', 0.76, 0.2, 0, { jitter: 0 });
    b.box(0.08, 0.36, 0.4, '#c8a77a', -0.76, 0.2, 0, { jitter: 0 });
    b.pop();
    solids.push({ x: fire.x + dx, z: fire.z + dz, r: 0.42, h: 0.45 });
  }
  solids.push({ x: fire.x, z: fire.z, r: 0.6, h: 0.5 });
  take(fire.x, fire.z, 2);

  // a fallen shard of sky by the water's edge, still humming
  const shard = { x: SEEP_AT.x, z: SEEP_AT.z };
  take(SEEP_AT.x, SEEP_AT.z, Math.ceil(SEEP_AT.r + 1));   // nothing grows or stands inside the clearing
  shard.y = cellH(shard.x, shard.z);
  const sb = new Batch(14), sg = new Batch(15);
  PROPS.skyglassShard(sb, sg, shard.x, shard.y, shard.z, r, 1.1);
  // where it landed, the grass turns to glass
  for (let k = 0; k < 46; k++) {
    const a = r() * TAU, d = Math.pow(r(), 0.7) * 4.2;
    const gx = Math.floor(shard.x + Math.cos(a) * d) + 0.5, gz = Math.floor(shard.z + Math.sin(a) * d) + 0.5;
    sb.box(0.98, 0.04, 0.98, pick(['#86c2b2', '#7fb7a6', '#9fd4c6', '#78ad9e'], r), gx, shard.y + 0.02, gz, { jitter: 0.05, ao: 1 });
    if (r() < 0.25) sg.box(0.16, 0.3 + r() * 0.3, 0.16, '#8fe9ff', gx + (r() - 0.5) * 0.6, shard.y + 0.15, gz + (r() - 0.5) * 0.6, { glow: 1.3, rotZ: (r() - 0.5) * 0.5, jitter: 0.2 });
  }
  const shardGroup = new THREE.Group();
  shardGroup.add(sb.mesh());
  const sgm = sg.mesh(MAT.glow); sgm.castShadow = false; shardGroup.add(sgm);
  shardGroup.visible = false;
  scene.add(shardGroup);
  const shardSolid = { x: shard.x, z: shard.z, r: 0.75, h: 2.4 };
  take(shard.x, shard.z, 1);

  // ----- Lanternhold village: four houses round a well, a bakery stall, a fishing hut by the beach -----
  const V = VILLAGE_AT, vy = 1;
  const houses = [
    { x: -18.0, z: 17.8, rot: Math.PI / 2, wall: '#f1e2c4', roof: '#a8473d' },
    { x: -18.6, z: 25.0, rot: Math.PI / 2, wall: '#e6dccb', roof: '#3f7a6a' },
    { x: -12.0, z: 27.6, rot: Math.PI, wall: '#f3e7cf', roof: '#7a4a8a', chimney: false },
    { x: -6.2, z: 26.4, rot: Math.PI, wall: '#efd9b8', roof: '#b0683a' },   // Wenna's bakery
  ];
  for (const hs of houses) {
    PROPS.cottage(b, g, hs.x, vy, hs.z, hs.rot, { wall: hs.wall, roof: hs.roof, chimney: hs.chimney });
    const side = Math.abs(Math.sin(hs.rot)) > 0.5;
    const hx = side ? 1.9 : 2.3, hz = side ? 2.3 : 1.9;
    boxes.push({ x0: hs.x - hx, z0: hs.z - hz, x1: hs.x + hx, z1: hs.z + hz, h: 5 });
    take(hs.x, hs.z, 3);
  }
  // the well in the middle of the square
  b.push(V.x, vy, V.z);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; b.box(0.5, 0.7, 0.36, pick(PALETTE.stone, r), Math.cos(a) * 0.8, 0.35, Math.sin(a) * 0.8, { rotY: -a, top: '#b9b3a7' }); }
  b.box(1.2, 0.05, 1.2, '#1d2a3a', 0, 0.45, 0, { jitter: 0 });
  for (const x of [-0.85, 0.85]) b.box(0.16, 1.9, 0.16, '#6b4a33', x, 1.0, 0);
  b.box(1.9, 0.12, 0.12, '#5d3d26', 0, 1.75, 0);
  b.box(2.1, 0.14, 1.1, '#7a4a3a', 0, 2.05, 0, { rotZ: 0 }); b.box(1.7, 0.14, 0.7, '#8a5a46', 0, 2.2, 0);
  b.box(0.26, 0.26, 0.26, '#8b5e3c', 0.2, 1.25, 0); b.box(0.03, 0.5, 0.03, '#c8b28a', 0.2, 1.5, 0);
  b.pop();
  solids.push({ x: V.x, z: V.z, r: 1.05, h: 2.2 });
  // a bench, flower tubs and barrels round the square
  b.push(V.x - 2.6, vy, V.z + 1.6, 0.9); b.box(1.5, 0.12, 0.45, '#8b5e3c', 0, 0.45, 0); b.box(0.12, 0.4, 0.4, '#5d3d26', -0.6, 0.2, 0); b.box(0.12, 0.4, 0.4, '#5d3d26', 0.6, 0.2, 0); b.pop();
  solids.push({ x: V.x - 2.6, z: V.z + 1.6, r: 0.55, h: 0.6 });
  for (const [x, z] of [[V.x + 2.4, V.z - 2.0], [V.x - 1.6, V.z - 2.7], [V.x + 2.9, V.z + 2.2]]) {
    b.box(0.6, 0.4, 0.6, '#8b5e3c', x, vy + 0.2, z); PROPS.flowers(b, x, vy + 0.4, z, r);
    solids.push({ x, z, r: 0.35, h: 0.6 });
  }
  PROPS.barrel(b, -15.9, vy, 20.4, 0.3); solids.push({ x: -15.9, z: 20.4, r: 0.35, h: 0.85 });
  PROPS.barrel(b, -16.3, vy, 21.1, 1.1); solids.push({ x: -16.3, z: 21.1, r: 0.35, h: 0.85 });
  // a washing line between the two western houses
  b.box(0.1, 2.0, 0.1, '#6b4a33', -19.4, vy + 1.0, 20.4); b.box(0.1, 2.0, 0.1, '#6b4a33', -19.4, vy + 1.0, 22.6);
  b.box(0.03, 0.03, 2.2, '#e8e0d0', -19.4, vy + 1.9, 21.5);
  [['#e0573f', 20.9], ['#5fa8d6', 21.4], ['#f2d36b', 21.9], ['#f4f0ff', 22.25]].forEach(([c, z]) => b.box(0.04, 0.5, 0.36, c, -19.4, vy + 1.62, z, { jitter: 0.1 }));
  solids.push({ x: -19.4, z: 20.4, r: 0.12, h: 2 }, { x: -19.4, z: 22.6, r: 0.12, h: 2 });
  // Wenna's stall: a striped awning, loaves on the counter
  const st = { x: -9.2, z: 23.3 };
  b.push(st.x, vy, st.z);
  b.box(1.9, 0.9, 0.8, '#a77a4f', 0, 0.45, 0, { top: '#c8a77a' });
  for (const x of [-0.9, 0.9]) b.box(0.1, 2.0, 0.1, '#6b4a33', x, 1.0, 0.45);
  for (let k = 0; k < 6; k++) b.box(0.34, 0.08, 1.1, k % 2 ? '#f4f0ff' : '#e0573f', -0.85 + k * 0.34, 2.0, 0.2, { rotX: -0.25, jitter: 0 });
  for (let k = 0; k < 5; k++) b.box(0.32, 0.16, 0.18, k % 2 ? '#d9a35b' : '#c88a43', -0.7 + k * 0.34, 0.99, -0.1 + (k % 2) * 0.12, { top: '#e8b871', rotY: (k % 3) * 0.2 });
  b.box(0.26, 0.26, 0.26, '#b07a3a', 0.6, 1.05, 0.2);
  b.pop();
  solids.push({ x: st.x, z: st.z, r: 0.95, h: 1.2 });
  take(st.x, st.z, 1);
  // Tobin's fishing hut by the beach, with fish drying on a rack and his rowing boat pulled up
  const hut = { x: -1.8, z: 22.4 }, huy = cellH(hut.x, hut.z);
  b.push(hut.x, huy, hut.z, -Math.PI / 2);
  b.box(2.4, 0.2, 2.0, '#8b5e3c', 0, 0.1, 0, { top: '#a77a4f' });
  for (const [px, pz] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]]) b.box(0.16, 1.9, 0.16, '#5d3d26', px, 1.05, pz);
  b.box(2.3, 1.5, 0.12, '#9a6b45', 0, 0.95, -0.9); b.box(0.12, 1.5, 1.8, '#9a6b45', -1.1, 0.95, 0); b.box(0.12, 1.5, 1.8, '#9a6b45', 1.1, 0.95, 0);
  for (let k = 0; k < 5; k++) b.box(2.7, 0.12, 0.5, k % 2 ? '#6b7a8a' : '#5d6a78', 0, 1.95 + k * 0.08, -1.0 + k * 0.48, { rotX: 0.18 });
  for (let k = 0; k < 6; k++) b.box(0.18, 0.5, 0.03, k % 2 ? '#7a8f7a' : '#8aa08a', -0.9 + k * 0.36, 1.4, 0.88, { jitter: 0.15 });
  b.pop();
  boxes.push({ x0: hut.x - 1.15, z0: hut.z - 1.3, x1: hut.x + 1.15, z1: hut.z + 1.3, h: 2.4 });
  take(hut.x, hut.z, 2);
  b.push(hut.x - 0.4, huy, hut.z + 2.4, 0.2);
  b.box(0.1, 1.3, 0.1, '#6b4a33', -0.9, 0.65, 0); b.box(0.1, 1.3, 0.1, '#6b4a33', 0.9, 0.65, 0); b.box(1.9, 0.06, 0.06, '#5d3d26', 0, 1.25, 0);
  for (let k = 0; k < 5; k++) { b.box(0.08, 0.32, 0.16, '#b8c4cc', -0.7 + k * 0.35, 1.0, 0, { top: '#d8e2e8' }); b.box(0.04, 0.12, 0.12, '#8a96a0', -0.7 + k * 0.35, 0.8, 0); }
  b.pop();
  solids.push({ x: hut.x - 1.3, z: hut.z + 2.5, r: 0.15, h: 1.3 }, { x: hut.x + 0.5, z: hut.z + 2.2, r: 0.15, h: 1.3 });
  const rowboat = buildBoat(); rowboat.scale.setScalar(0.75); rowboat.position.set(1.4, cellH(1.4, 25.6) - 0.05, 25.6); rowboat.rotation.set(0, 2.4, 0.12); scene.add(rowboat);
  solids.push({ x: 1.4, z: 25.6, r: 1.0, h: 0.9 });
  take(hut.x, hut.z + 2.6, 1);
  // village lanterns
  for (const [x, z, rot] of [[-14.4, 18.4, 0.4], [-10.2, 24.6, 2.6], [-15.6, 24.4, 3.6], [-8.6, 17.4, 1.2]]) { PROPS.lanternPost(b, g, x, cellH(x, z), z, rot); solids.push({ x, z, r: 0.2, h: 2.1 }); take(x, z, 0); }
  take(V.x, V.z, 3);

  // ----- the dock beacon: its light has gone out. Its crystal sits on a stone out in the water,
  // out of reach: you light it again by hitting the crystal with a sling drop -----
  const bcn = { x: 13.3, z: 20.15, y: 0.72 };
  b.box(0.2, 3.0, 0.2, '#5d3d26', bcn.x, bcn.y + 1.5, bcn.z);
  b.box(0.6, 0.1, 0.6, '#3a3a44', bcn.x, bcn.y + 3.05, bcn.z);
  for (const [px, pz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) b.box(0.05, 0.5, 0.05, '#2c2c36', bcn.x + px, bcn.y + 3.35, bcn.z + pz);
  b.box(0.7, 0.12, 0.7, '#3a3a44', bcn.x, bcn.y + 3.65, bcn.z);
  b.box(0.34, 0.34, 0.34, '#3a4a5a', bcn.x, bcn.y + 3.33, bcn.z);   // the dark lamp
  solids.push({ x: bcn.x, z: bcn.z, r: 0.18, h: 3.8 });
  const tgt = { x: 17.6, z: 23.4 };
  const tgy = cellH(tgt.x, tgt.z);
  // a sea stack with a brass cage on top, and the crystal inside it
  b.box(1.1, 1.6 - tgy, 1.0, '#7d7a86', tgt.x, (1.6 + tgy) / 2 - 0.3, tgt.z, { top: '#8f8c98' });
  b.box(0.8, 0.5, 0.9, '#6f6c78', tgt.x + 0.2, 0.2, tgt.z - 0.1);
  b.box(0.7, 0.08, 0.7, '#c9a24a', tgt.x, 1.36, tgt.z);
  for (const [px, pz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) b.box(0.05, 0.75, 0.05, '#c9a24a', tgt.x + px, 1.75, tgt.z + pz);
  b.box(0.7, 0.08, 0.7, '#c9a24a', tgt.x, 2.14, tgt.z);
  b.box(0.3, 0.5, 0.3, '#7d8f9a', tgt.x, 1.72, tgt.z, { rotY: 0.6 });   // the crystal, dark for now
  const beaconLit = new Batch(16);
  beaconLit.box(0.34, 0.54, 0.34, '#9ff3ff', tgt.x, 1.72, tgt.z, { glow: 2.4, rotY: 0.6, jitter: 0 });
  beaconLit.box(0.36, 0.36, 0.36, '#ffe9a8', bcn.x, bcn.y + 3.33, bcn.z, { glow: 4, jitter: 0 });
  const beaconLitMesh = beaconLit.mesh(MAT.glow); beaconLitMesh.castShadow = false; beaconLitMesh.visible = false;
  scene.add(beaconLitMesh);
  const beaconLight = new THREE.PointLight(0xffd59a, 0, 10, 1.5);
  beaconLight.position.set(bcn.x, bcn.y + 3.3, bcn.z);
  scene.add(beaconLight);
  // anything you can shoot to make something happen goes in targets (switches, crystals, bells ...)
  const targets = [];
  const beacon = { id: 'beacon', x: tgt.x, y: 1.72, z: tgt.z, r: 0.42, h: 1.0, on: false, onHit: null };
  beacon.light = () => { beacon.on = true; beaconLitMesh.visible = true; };
  targets.push(beacon);

  // ----- scatter: trees, rocks, flowers, shells, driftwood -----
  const grassSpots = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = H0 + i + 0.5, z = H0 + j + 0.5;
    const h = H[j * N + i], kind = K[j * N + i];
    if (h <= 0.01) continue;
    const roll = r();
    if (!free(x, z)) {
      if (kind === 'grass' && r() < 0.35) grassSpots.push({ x: x + (r() - 0.5) * 0.8, y: h, z: z + (r() - 0.5) * 0.8, rot: r() * TAU, s: 0.8 + r() * 0.5, c: pick(['#62a447', '#6fb04f', '#57933f', '#7cb85a'], r) });
      continue;
    }
    if (kind === 'grass') {
      const forest = fbm(x * 0.11 + 40, z * 0.11) > 0.55 || x < -14 || z < -21 || (h >= 4 && Math.abs(x - 6) > 12);
      if (roll < (forest ? 0.12 : 0.025) && flatAround(x, z, 1) && !nearWay(x, z, 2)) {
        // trees are solid out to their foliage, so you never stand inside a canopy
        const pine = z < -10 || x < -14 || r() < 0.3;
        const s = pine ? 0.85 + r() * 0.5 : 0.8 + r() * 0.4;
        if (pine) PROPS.pine(b, x, h, z, r, s); else PROPS.roundTree(b, x, h, z, r, s);
        solids.push({ x, z, r: (pine ? 0.82 : 0.78) * s, h: 4.5 * s }); take(x, z, 1);
        continue;
      }
      if (roll < 0.16) { PROPS.flowers(b, x, h, z, r); }
      else if (roll < 0.18 && !nearWay(x, z, 1)) { PROPS.rock(b, x + (r() - 0.5) * 0.3, h, z, r, 0.45 + r() * 0.3); solids.push({ x, z, r: 0.35, h: 0.7 }); take(x, z, 0); continue; }
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) grassSpots.push({ x: x + (r() - 0.5) * 0.9, y: h, z: z + (r() - 0.5) * 0.9, rot: r() * TAU, s: 0.7 + r() * 0.6, c: pick(['#62a447', '#6fb04f', '#57933f', '#7cb85a', '#8cbf5e'], r) });
    } else if (kind === 'stone') {
      if (roll < 0.07 && flatAround(x, z, 0) && !nearWay(x, z, 1)) { PROPS.rock(b, x, h, z, r, 0.6 + r() * 0.6); solids.push({ x, z, r: 0.5, h: 1.1 }); take(x, z, 0); }
      else if (roll < 0.11) b.box(0.4, 0.1, 0.4, '#6f9a4a', x + (r() - 0.5) * 0.5, h + 0.05, z + (r() - 0.5) * 0.5, { jitter: 0.15 });
    } else if (kind === 'sand') {
      if (roll < 0.04) PROPS.shell(b, x + (r() - 0.5) * 0.6, h, z + (r() - 0.5) * 0.6, r);
      else if (roll < 0.05 && flatAround(x, z, 1)) { PROPS.driftwood(b, x, h, z, r); take(x, z, 1); }
      else if (roll < 0.065 && h >= 0.5) { PROPS.rock(b, x, h - 0.15, z, r, 0.5 + r() * 0.4, '#9a958c'); solids.push({ x, z, r: 0.4, h: 0.8 }); take(x, z, 0); }
      else if (roll < 0.1 && h >= 1) grassSpots.push({ x, y: h, z, rot: r() * TAU, s: 1.1, c: '#b8c27a' });   // dune grass
    }
  }
  // rocks standing in the shallows, with foam around them
  for (let k = 0; k < 14; k++) {
    const x = 16 + r() * 14, z = -8 + r() * 30;
    const ch = cellH(x, z);
    if (ch > -0.4 || ch < -2.6) continue;
    PROPS.rock(b, x, ch, z, r, 0.9 + r() * 1.2, '#7d7a86');
  }
  scene.add(b.mesh());
  const glowMesh = g.mesh(MAT.glow);
  glowMesh.castShadow = false;
  scene.add(glowMesh);
  scene.add(buildGrass(grassSpots));

  // ----- the sea and the sky -----
  const TS = 128, ext = 64;
  const data = new Uint8Array(TS * TS * 4);
  for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
    const x = -ext + (i + 0.5) * (2 * ext / TS), z = -ext + (j + 0.5) * (2 * ext / TS);
    let h;
    const ci = Math.floor(x) - H0, cj = Math.floor(z) - H0;
    if (ci >= 0 && cj >= 0 && ci < N && cj < N) h = H[cj * N + ci];
    else h = -2.5;   // beyond the edge of the map: open sea all round, so the island ends in cliffs
    const v = clamp((h + 4) / 8, 0, 1) * 255;
    data.set([v, v, v, 255], (j * TS + i) * 4);
  }
  const shoreTex = new THREE.DataTexture(data, TS, TS, THREE.RGBAFormat);
  shoreTex.magFilter = THREE.LinearFilter; shoreTex.minFilter = THREE.LinearFilter;
  shoreTex.needsUpdate = true;
  const sea = buildSea(shoreTex, { x0: -ext, z0: -ext, x1: ext, z1: ext });
  scene.add(sea);
  scene.add(buildSky());

  // ----- moving parts: the boat, the lighthouse beam, gulls, crabs, smoke -----
  const boat = buildBoat();
  boat.position.set(15.7, 0.05, 16.5);
  boat.rotation.y = 0.08;
  scene.add(boat);

  const beam = new THREE.Group();
  beam.position.set(lhX, lh.lampY, lhZ);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffe2a0').multiplyScalar(0.9) } },
    vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main() { vT = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vT; varying vec3 vN; varying vec3 vV; void main() { float t = clamp(vT / 22.0 + 0.5, 0.0, 1.0); float edge = pow(abs(dot(vN, vV)), 1.5); float a = (1.0 - t) * 0.22 * edge; gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const s of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 22, 20, 1, true), beamMat);
    cone.rotation.z = s * Math.PI / 2;
    cone.position.x = s * 11;
    beam.add(cone);
  }
  scene.add(beam);
  const lampLight = new THREE.PointLight(0xffd59a, 30, 22, 1.6);
  lampLight.position.set(lhX, lh.lampY, lhZ);
  scene.add(lampLight);
  const windowLight = new THREE.PointLight(0xffb86b, 7, 7, 1.6);
  windowLight.position.set(cotX + 0.9, cotY + 1.6, cotZ + 2.3);
  scene.add(windowLight);
  const shardLight = new THREE.PointLight(0x7fe8ff, 9, 9, 1.4);
  shardLight.position.set(shard.x, shard.y + 1.4, shard.z);
  scene.add(shardLight);
  const fireLight = new THREE.PointLight(0xff9a4a, 7, 7, 1.6);
  fireLight.position.set(fire.x, fire.y + 0.9, fire.z);
  scene.add(fireLight);
  shardLight.visible = false;
  const lanternLights = [[11.6, 7.4], [-1.2, -7.5], [-14.4, 18.4], [-10.2, 24.6]].map(([x, z]) => {
    const l = new THREE.PointLight(0xffc46b, 5, 6, 1.6);
    l.position.set(x + 0.4, cellH(x, z) + 1.5, z);
    scene.add(l);
    return l;
  });

  // gulls: wide lazy circles over the water
  const gulls = [];
  for (let k = 0; k < 4; k++) {
    const gb = new Batch(30 + k);
    gb.box(0.18, 0.16, 0.5, '#f4f4f8', 0, 0, 0); gb.box(0.12, 0.12, 0.14, '#f4f4f8', 0, 0.06, 0.28); gb.box(0.05, 0.04, 0.1, '#f2b84b', 0, 0.05, 0.38);
    gb.box(0.14, 0.06, 0.16, '#3a3a44', 0, 0.02, -0.28);
    const body = gb.mesh(); body.castShadow = true;
    const grp = new THREE.Group(); grp.add(body);
    const wings = [];
    for (const s of [1, -1]) {
      const wp = new THREE.Group(); wp.position.set(s * 0.08, 0.04, 0);
      const wbt = new Batch(40 + k); wbt.box(0.5, 0.03, 0.22, '#e8e8ee', s * 0.25, 0, 0); wbt.box(0.18, 0.03, 0.18, '#3a3a44', s * 0.58, 0, -0.02);
      const wm = wbt.mesh(); wp.add(wm); grp.add(wp); wings.push({ p: wp, s });
    }
    grp.scale.setScalar(1.3);
    scene.add(grp);
    gulls.push({ grp, wings, cx: 22 + k * 3, cz: 6 + k * 3, rad: 6 + k * 2.2, y: 6 + k * 0.9, sp: 0.25 + k * 0.05, ph: k * 1.7 });
  }
  // crabs: scuttle sideways along the wet sand, and hurry away when you come close
  const crabs = [];
  for (let k = 0; k < 4; k++) {
    const cb = new Batch(60 + k);
    cb.box(0.34, 0.14, 0.26, '#e0573f', 0, 0.12, 0, { top: '#ea6a4f' });
    for (const s of [1, -1]) { cb.box(0.12, 0.1, 0.1, '#e0573f', s * 0.22, 0.14, 0.12); cb.box(0.04, 0.08, 0.04, '#1d1726', s * 0.06, 0.24, 0.1); }
    for (const s of [1, -1]) for (const zz of [-0.08, 0, 0.08]) cb.box(0.14, 0.04, 0.03, '#c94a3f', s * 0.2, 0.06, zz);
    const m = cb.mesh();
    const grp = new THREE.Group(); grp.add(m);
    const x = 10 + k * 2.2 + r(), z = -4 + k * 3.2 + r();
    grp.position.set(x, 0.5, z);
    scene.add(grp);
    crabs.push({ grp, x, z, home: new V3(x, 0, z), dir: r() < 0.5 ? 1 : -1, t: r() * 3, scare: 0 });
  }
  // chimney smoke
  const smokeMat = new THREE.MeshLambertMaterial({ color: '#d8d0e0', transparent: true, opacity: 0.55, depthWrite: false });
  const smoke = [];
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), smokeMat.clone());
    m.castShadow = false;
    scene.add(m);
    smoke.push({ m, t: k / 10 });
  }
  const chimney = new V3(cotX + 1.3, cotY + 4.9, cotZ - 0.6);

  // ----- what the game asks the world -----
  // ground height under a point, including the dock planks
  function groundAt(x, z) {
    if (x > dock.x0 && x < dock.x1 && z > dock.z0 && z < dock.z1) return Math.max(dock.y, cellH(x, z));
    return cellH(x, z);
  }
  function onDock(x, z) { return x > dock.x0 && x < dock.x1 && z > dock.z0 && z < dock.z1; }
  // can something standing at height y move to (x, z)? r = its radius.
  // Steps work both ways: you never drop down a ledge you couldn't climb back up, so you can't get trapped.
  function terrainOk(x, z, y, rad, stepUp) {
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
      const gx = x + ox, gz = z + oz;
      const h = groundAt(gx, gz);
      if (h <= 0.01 && !onDock(gx, gz)) return false;   // the sea
      if (Math.abs(h - y) > stepUp) return false;         // a wall, or a drop too deep to climb back
    }
    return true;
  }
  function solidAt(x, z, rad) {
    for (const s of solids) { const d = Math.hypot(x - s.x, z - s.z); if (d < s.r + rad) return s; }
    for (const bx of boxes) if (x > bx.x0 - rad && x < bx.x1 + rad && z > bx.z0 - rad && z < bx.z1 + rad) return bx;
    return null;
  }
  function walkable(x, z, y, rad = 0.3, stepUp = 0.55) {
    return terrainOk(x, z, y, rad, stepUp) && !solidAt(x, z, rad);
  }

  // ----- finding a way: A* over the cells, for tap-to-walk -----
  const blocked = new Uint8Array(N * N);
  const cellY = (i, j) => { const x = H0 + i + 0.5, z = H0 + j + 0.5; return groundAt(x, z); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = H0 + i + 0.5, z = H0 + j + 0.5;
    const y = cellY(i, j);
    if ((y <= 0.01 && !onDock(x, z)) || solidAt(x, z, 0.22)) blocked[j * N + i] = 1;
  }
  function findPath(fx0, fz0, tx, tz) {
    const si = Math.floor(fx0) - H0, sj = Math.floor(fz0) - H0;
    let ti = Math.floor(tx) - H0, tj = Math.floor(tz) - H0;
    const inside = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
    if (!inside(si, sj) || !inside(ti, tj)) return null;
    // tapped somewhere you can't stand (a tree, the sea): aim for the nearest open cell next to it
    if (blocked[tj * N + ti]) {
      let best = null, bd = 1e9;
      for (let r = 1; r <= 3 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = ti + di, j = tj + dj;
        if (!inside(i, j) || blocked[j * N + i]) continue;
        const d = Math.hypot(di, dj) + Math.hypot(i - si, j - sj) * 0.01;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (!best) return null;
      [ti, tj] = best;
    }
    const start = sj * N + si, goal = tj * N + ti;
    const g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    g[start] = 0;
    const open = [[Math.hypot(ti - si, tj - sj), start]];
    let steps = 0;
    while (open.length && steps++ < 4000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % N, cj = (cur / N) | 0, cy = cellY(ci, cj);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (!inside(ni, nj)) continue;
        const n = nj * N + ni;
        if (blocked[n] || closed[n]) continue;
        if (Math.abs(cellY(ni, nj) - cy) > 0.55) continue;
        if (di && dj && (blocked[cj * N + ni] || blocked[nj * N + ci] || Math.abs(cellY(ni, cj) - cy) > 0.55 || Math.abs(cellY(ci, nj) - cy) > 0.55)) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; from[n] = cur; open.push([ng + Math.hypot(ti - ni, tj - nj), n]); }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const cells = [];
    for (let c = goal; c !== -1 && c !== start; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: H0 + (c % N) + 0.5, z: H0 + ((c / N) | 0) + 0.5 }));
    // the exact tapped point as the last stop, if it's open ground
    if (!blocked[(Math.floor(tz) - H0) * N + (Math.floor(tx) - H0)] && walkable(tx, tz, groundAt(tx, tz), 0.3)) pts.push({ x: tx, z: tz });
    return pts;
  }
  // a straight walk from a to b is clear (for smoothing paths into fewer, straighter legs)
  function clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.25);
    let y = groundAt(ax, az);
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (!walkable(x, z, y, 0.32)) return false;
      y = groundAt(x, z);
    }
    return true;
  }

  // can a shot (a sling drop, an orb) pass this point? It hits the ground, and anything standing taller than it flies.
  function shotBlocked(x, y, z, rad = 0.08) {
    const gh = groundAt(x, z);
    if (gh > 0.01 && gh > y) return true;
    for (const s of solids) {
      if (s.dummy) continue;
      if (Math.hypot(x - s.x, z - s.z) < s.r + rad) {
        if (s.y0 === undefined) s.y0 = groundAt(s.x, s.z);
        if (y < s.y0 + (s.h === undefined ? 3 : s.h)) return true;
      }
    }
    for (const bx of boxes) {
      if (x > bx.x0 - rad && x < bx.x1 + rad && z > bx.z0 - rad && z < bx.z1 + rad) {
        if (bx.y0 === undefined) bx.y0 = groundAt((bx.x0 + bx.x1) / 2, (bx.z0 + bx.z1) / 2);
        if (y < bx.y0 + (bx.h === undefined ? 4 : bx.h)) return true;
      }
    }
    return false;
  }
  // a shot at this point hits a target (a switch, a crystal): returns it
  function targetAt(x, y, z, rad = 0.1) {
    for (const t of targets) if (Math.hypot(x - t.x, z - t.z) < t.r + rad && Math.abs(y - t.y) < t.h / 2 + rad) return t;
    return null;
  }
  // the shard lands (during the first Riftfall) and the Seep comes alive
  function setShard(on) {
    shardGroup.visible = on;
    shardLight.visible = on;
    const i = solids.indexOf(shardSolid);
    if (on && i < 0) solids.push(shardSolid);
    if (!on && i >= 0) solids.splice(i, 1);
  }
  let night = 0;

  const fx = { sparks: null };
  let seepPower = 1;   // how awake the shard is: 0 = spent, 1 = calm, 2 = the Seep is open
  function update(dt, t, player) {
    SKY_UNIFORMS.uTime.value = t;
    WIND.uTime.value = t;
    sea.material.uniforms.uTime.value = t;
    beam.rotation.y = t * 0.45;
    // at night every warm light counts for more
    const nk = 1 + night * 1.3;
    lampLight.intensity = (30 + Math.sin(t * 2.3) * 2) * nk;
    windowLight.intensity = (7 + Math.sin(t * 9) * 0.4 + Math.sin(t * 13.7) * 0.3) * nk;   // a candle-ish flicker
    beaconLight.intensity = beacon.on ? (9 + Math.sin(t * 3) * 0.6) * nk : 0;
    shardLight.intensity = (9 + Math.sin(t * 1.3) * 2.5) * (0.35 + seepPower * 0.45);
    for (const l of lanternLights) l.intensity = (5 + Math.sin(t * 7 + l.position.x) * 0.25) * nk;
    fireLight.intensity = (7 + Math.sin(t * 11) * 0.8 + Math.sin(t * 17.3) * 0.55 + Math.sin(t * 5.1) * 0.4) * nk;
    boat.position.y = 0.02 + Math.sin(t * 1.2) * 0.06;
    boat.rotation.z = Math.sin(t * 0.9) * 0.04; boat.rotation.x = Math.sin(t * 1.1 + 1) * 0.025;
    for (const gl of gulls) {
      const a = t * gl.sp + gl.ph;
      gl.grp.position.set(gl.cx + Math.cos(a) * gl.rad, gl.y + Math.sin(a * 2.3) * 0.5, gl.cz + Math.sin(a) * gl.rad);
      gl.grp.rotation.y = -a;   // heading along the circle (the model's beak points along +z)
      gl.grp.rotation.z = -0.25;
      const flap = Math.sin(t * 7 + gl.ph) * (Math.sin(a * 0.7) > 0.3 ? 0.7 : 0.08);
      for (const w of gl.wings) w.p.rotation.z = w.s * flap;
    }
    for (const c of crabs) {
      c.t += dt;
      const px = player ? player.x - c.x : 99, pz = player ? player.z - c.z : 99;
      const near = Math.hypot(px, pz) < 2.6;
      if (near) c.scare = 1.2;
      c.scare = Math.max(0, c.scare - dt);
      const speed = c.scare > 0 ? 3.2 : (Math.sin(c.t * 0.9) > 0.2 ? 0.9 : 0);
      if (c.scare > 0) c.dir = px > 0 ? -1 : 1;
      else if (Math.abs(c.x - c.home.x) > 3) c.dir = c.x > c.home.x ? -1 : 1;
      const nx = c.x + c.dir * speed * dt;
      const gh = cellH(nx, c.z);
      if (gh > 0.01 && gh <= 0.5 && !solids.some((s) => Math.hypot(nx - s.x, c.z - s.z) < s.r + 0.2)) c.x = nx; else c.dir *= -1;
      c.grp.position.set(c.x, cellH(c.x, c.z) + Math.abs(Math.sin(c.t * 18)) * 0.03 * (speed > 0 ? 1 : 0), c.z);
      c.grp.rotation.z = Math.sin(c.t * 18) * 0.06 * (speed > 0 ? 1 : 0);
    }
    for (const s of smoke) {
      s.t += dt * 0.16;
      if (s.t > 1) s.t -= 1;
      const k = s.t;
      s.m.position.set(chimney.x + Math.sin(k * 5 + t * 0.3) * 0.3 + k * 1.6, chimney.y + k * 3.2, chimney.z + k * 0.8);
      const sc = 0.25 + k * 0.7;
      s.m.scale.set(sc, sc, sc);
      s.m.rotation.set(k * 2, k * 3, 0);
      s.m.material.opacity = 0.5 * Math.min(1, k * 6) * (1 - k);
    }
    // ambient sparkles: fireflies over the meadow, motes rising from the shard, glints off the sea
    if (fx.sparks) {
      if (Math.random() < dt * 9) {
        const a = Math.random() * TAU, d = Math.random() * 14;
        const x = -6 + Math.cos(a) * d, z = -6 + Math.sin(a) * d * 0.7;
        const h = cellH(x, z);
        if (h > 0.6) fx.sparks.spawn({ x, y: h + 0.4 + Math.random() * 1.4, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.1, vz: (Math.random() - 0.5) * 0.4, drag: 0.2, life: 3 + Math.random() * 2, size: 0.12, color: '#e9ff8a', glow: 3, flicker: 1, shrink: 0 });
      }
      // embers drifting up from the campfire
      if (Math.random() < dt * 14) {
        fx.sparks.spawn({ x: fire.x + (Math.random() - 0.5) * 0.4, y: fire.y + 0.5, z: fire.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.6, vy: 1.4 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 0.6, drag: 0.8, life: 1.2 + Math.random(), size: 0.07 + Math.random() * 0.05, color: Math.random() < 0.5 ? '#ffb347' : '#ff7a2a', glow: 4, flicker: 1 });
      }
      if (shardGroup.visible && Math.random() < dt * 6) {
        fx.sparks.spawn({ x: shard.x + (Math.random() - 0.5) * 1.2, y: shard.y + 0.4 + Math.random() * 1.5, z: shard.z + (Math.random() - 0.5) * 1.2, vy: 0.5 + Math.random() * 0.4, vx: (Math.random() - 0.5) * 0.2, drag: 0.4, life: 2.2, size: 0.1, color: '#9ff3ff', glow: 4, flicker: 1 });
      }
    }
  }

  const spawn = { x: 8.0, z: 1.2 };
  spawn.y = groundAt(spawn.x, spawn.z);
  return {
    seep: SEEP_AT, setSeepPower: (k) => { seepPower = k; },
    shotBlocked, targetAt, targets, beacon, setShard, shardOn: () => shardGroup.visible,
    setNight: (k) => { night = k; },
    village: VILLAGE_AT, dock,
    spots: {
      maren: { x: cotX - 0.4, z: cotZ + 2.9, face: 0 },
      tobin: { x: hut.x - 1.9, z: hut.z + 0.4, face: -Math.PI / 2 },
      wenna: { x: st.x, z: st.z + 1.0, face: Math.PI },
      pip: { x: V.x + 2.2, z: V.z + 0.6, face: 0 },
      beaconView: { x: 13.3, z: 19.2 },
    },
    name: 'cove', groundAt, walkable, terrainOk, solidAt, findPath, clearLine, update, fx, dummies, solids, spawn, shard,
    debugMap: () => { const rows = []; for (let j = 0; j < N; j += 1) { let s = ''; for (let i = 0; i < N; i += 1) { const h = H[j * N + i], k = K[j * N + i]; s += h <= 0 ? '~' : k === 'sand' ? (h > 0.5 ? 's' : '.') : k === 'stone' ? '#' : k === 'path' ? '=' : String(Math.min(9, Math.floor(h))); } rows.push((H0 + j + '').padStart(4) + ' ' + s); } return rows.join('\n'); },
    sunDir: new V3(-0.7, 0.56, -0.3).normalize(),
    bounds: { x0: H0, z0: H0, x1: H0 + N, z1: H0 + N },
    landmarks: { lighthouse: new V3(lhX, lh.lampY, lhZ), cottage: new V3(cotX, cotY, cotZ) },
  };
}

function hashJ(i, j) { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }

// ===========================================================================
// The Rift: a floor of rooms on a grid, Isaac-style. Each room is RW x RD inside, with a wall between rooms
// and a doorway wherever two rooms meet. Doors seal while a room still has creatures in it.
// ===========================================================================
export function buildRift(root, seed = 7) {
  const r = rng(seed);
  const RW = RIFT.roomW, RD = RIFT.roomD, G = 7, PX = RW + 1, PZ = RD + 1;
  // ----- the layout: start in the middle, grow rooms that touch exactly one existing room -----
  const key = (i, j) => i + ',' + j;
  const rooms = new Map();
  const add = (i, j, type) => { const rm = { i, j, type, doors: [], cleared: type !== 'combat', visited: false, seen: false, depth: 0 }; rooms.set(key(i, j), rm); return rm; };
  const start = add(3, 3, 'start');
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const count = (i, j) => N4.filter(([a, b]) => rooms.has(key(i + a, j + b))).length;
  let guard = 0;
  while (rooms.size < RIFT.rooms && guard++ < 500) {
    const list = [...rooms.values()];
    const from = list[Math.floor(r() * list.length)];
    const [a, b] = N4[Math.floor(r() * 4)];
    const i = from.i + a, j = from.j + b;
    if (i < 1 || j < 1 || i >= G - 1 || j >= G - 1 || rooms.has(key(i, j)) || count(i, j) !== 1) continue;
    // keep the start room open on the south side, so the first view is into the floor
    add(i, j, 'combat');
  }
  // distances from the start
  const dist = new Map([[key(start.i, start.j), 0]]);
  const queue = [start];
  while (queue.length) { const c = queue.shift(); for (const [a, b] of N4) { const k = key(c.i + a, c.j + b); if (rooms.has(k) && !dist.has(k)) { dist.set(k, dist.get(key(c.i, c.j)) + 1); queue.push(rooms.get(k)); } } }
  for (const rm of rooms.values()) rm.depth = dist.get(key(rm.i, rm.j)) || 0;
  // the guardian waits behind the furthest room, in a new dead end; the treasure in another dead end
  const ends = (exclude) => {
    const out = [];
    for (const rm of rooms.values()) for (const [a, b] of N4) {
      const i = rm.i + a, j = rm.j + b;
      if (i < 1 || j < 1 || i >= G - 1 || j >= G - 1 || rooms.has(key(i, j)) || count(i, j) !== 1 || (exclude && exclude(rm))) continue;
      out.push({ i, j, from: rm });
    }
    return out;
  };
  const far = ends((rm) => rm.type !== 'combat').sort((p, q) => q.from.depth - p.from.depth)[0] || ends()[0];
  const boss = add(far.i, far.j, 'guardian'); boss.cleared = false; boss.depth = far.from.depth + 1;
  const tEnds = ends((rm) => rm === boss).filter((e) => Math.abs(e.i - boss.i) + Math.abs(e.j - boss.j) > 1);
  const tr = tEnds.length ? tEnds[Math.floor(r() * tEnds.length)] : null;
  if (tr) { const t = add(tr.i, tr.j, 'treasure'); t.depth = tr.from.depth + 1; }
  start.visited = true;

  // ----- cells: floor, wall, doorway -----
  const W = G * PX + 1, D = G * PZ + 1;
  const cell = new Uint8Array(W * D);   // 0 nothing, 1 floor, 2 wall, 3 doorway (open), 4 doorway (sealed)
  const CX = start.i * PX + 1 + RW / 2, CZ = start.j * PZ + 1 + RD / 2;   // so the start room is centred on 0, 0
  const wx = (ix) => ix - CX, wz = (iz) => iz - CZ;
  const cellOf = (x, z) => [Math.floor(x + CX), Math.floor(z + CZ)];
  const at = (ix, iz) => (ix < 0 || iz < 0 || ix >= W || iz >= D ? 0 : cell[iz * W + ix]);
  for (const rm of rooms.values()) {
    const ox = rm.i * PX, oz = rm.j * PZ;
    rm.ox = ox; rm.oz = oz;
    rm.x0 = wx(ox + 1); rm.x1 = wx(ox + 1 + RW); rm.z0 = wz(oz + 1); rm.z1 = wz(oz + 1 + RD);
    rm.cx = (rm.x0 + rm.x1) / 2; rm.cz = (rm.z0 + rm.z1) / 2;
    for (let iz = oz; iz <= oz + PZ; iz++) for (let ix = ox; ix <= ox + PX; ix++) {
      const inside = ix > ox && ix < ox + PX && iz > oz && iz < oz + PZ;
      if (inside) cell[iz * W + ix] = 1; else if (!cell[iz * W + ix]) cell[iz * W + ix] = 2;
    }
  }
  // doorways between neighbours
  const doors = [];
  for (const rm of rooms.values()) {
    for (const [a, b] of [[1, 0], [0, 1]]) {
      const nb = rooms.get(key(rm.i + a, rm.j + b));
      if (!nb) continue;
      const cells = a ? [[rm.ox + PX, rm.oz + RD / 2], [rm.ox + PX, rm.oz + RD / 2 + 1]] : [[rm.ox + RW / 2, rm.oz + PZ], [rm.ox + RW / 2 + 1, rm.oz + PZ]];
      for (const [ix, iz] of cells) cell[iz * W + ix] = 3;
      const d = { cells, rooms: [rm, nb], horiz: !!a, open: true, rise: 0 };
      d.x = wx(cells[0][0]) + (a ? 0.5 : 1); d.z = wz(cells[0][1]) + (a ? 1 : 0.5);
      doors.push(d); rm.doors.push(d); nb.doors.push(d);
    }
  }
  const roomAt = (x, z) => { for (const rm of rooms.values()) if (x >= rm.x0 && x <= rm.x1 && z >= rm.z0 && z <= rm.z1) return rm; return null; };

  // ----- building it -----
  const floor = new Batch(21), walls = new Batch(22), glow = new Batch(23), props = new Batch(24);
  const sandCols = ['#c9c2a4', '#beb79a', '#d2cbae', '#b8b398'];
  const tmpC = new THREE.Color();
  for (let iz = 0; iz < D; iz++) for (let ix = 0; ix < W; ix++) {
    const c = at(ix, iz);
    if (!c) continue;
    const x0 = wx(ix), z0 = wz(iz), x1 = x0 + 1, z1 = z0 + 1;
    if (c === 1 || c === 3 || c === 4) {
      // seabed, a little darker next to walls
      const nearWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(ix + a, iz + b) === 2);
      tmpC.set(pick(sandCols, r)).multiplyScalar((nearWall ? 0.82 : 1) * (0.95 + r() * 0.1));
      if (r() < 0.12) tmpC.set('#7fa89a').multiplyScalar(0.95 + r() * 0.1);   // a patch of sea-grass
      floor.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], tmpC);
    } else if (c === 2) {
      // walls: old stone overgrown with weed. Outer walls to the north and west stand tall; everything else is low,
      // so the camera can always see into the room
      const outerN = at(ix, iz - 1) === 0, outerW = at(ix - 1, iz) === 0;
      const tall = outerN || outerW;
      const h = tall ? 2.8 : 0.9;
      const stone = pick(['#5f6f78', '#56656e', '#687882'], r);
      walls.box(1, h, 1, stone, x0 + 0.5, h / 2, z0 + 0.5, { top: r() < 0.5 ? '#4a7a5a' : shade(stone, 1.15) });
      if (r() < 0.25) walls.box(0.3, 0.5 + r() * 0.6, 0.3, '#3f7a3a', x0 + 0.5 + (r() - 0.5) * 0.4, h + 0.3, z0 + 0.5 + (r() - 0.5) * 0.4, { jitter: 0.15 });
    }
  }
  // pillars where walls meet, with a glowing jelly lantern on some
  for (const rm of rooms.values()) for (const [x, z] of [[rm.x0, rm.z0], [rm.x1, rm.z0], [rm.x0, rm.z1], [rm.x1, rm.z1]]) {
    walls.box(1.3, 1.6, 1.3, '#4f5d66', x, 0.8, z, { top: '#5f7d6a' });
  }
  const solids = [], targets = [], decor = [];
  for (const rm of rooms.values()) for (const [x, z] of [[rm.x0, rm.z0], [rm.x1, rm.z0], [rm.x0, rm.z1], [rm.x1, rm.z1]]) solids.push({ x, z, r: 0.75, h: 1.6 });
  const take = new Set();
  const place = (x, z) => take.add(Math.floor(x + CX) + ',' + Math.floor(z + CZ));
  const free = (x, z) => !take.has(Math.floor(x + CX) + ',' + Math.floor(z + CZ));
  // furniture from the layouts; keep the cross through the doorways clear
  for (const rm of rooms.values()) {
    if (rm.type === 'start') {
      // a quiet room: a ring of coral round a pool, light falling from above
      ORCHARD.pool(props, glow, rm.cx, 0, rm.cz - 1.5);
      for (const [dx, dz] of [[-5, -3.5], [5, -3.5]]) { ORCHARD.tree(props, glow, rm.cx + dx, 0, rm.cz + dz, r, 0.9); solids.push({ x: rm.cx + dx, z: rm.cz + dz, r: 0.75, h: 3.5 }); }
      for (const [dx, dz] of [[-6, 3], [6, 3]]) ORCHARD.kelp(props, rm.cx + dx, 0, rm.cz + dz, r);
    } else if (rm.type === 'treasure') {
      for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) { ORCHARD.coral(props, glow, rm.cx + dx, 0, rm.cz + dz, r); solids.push({ x: rm.cx + dx, z: rm.cz + dz, r: 0.55, h: 1.2 }); }
    } else if (rm.type === 'guardian') {
      // a crack in the floor right under where it hangs, and the dark above
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; glow.box(1.6, 0.03, 0.08, '#9ff3ff', rm.cx + Math.cos(a) * 0.9, 0.02, rm.cz - 1.5 + Math.sin(a) * 0.9, { rotY: -a, glow: 1.6, jitter: 0, ao: 1 }); }
      for (const [dx, dz] of [[-6.5, -4.5], [6.5, -4.5], [-6.5, 4.5], [6.5, 4.5]]) ORCHARD.kelp(props, rm.cx + dx, 0, rm.cz + dz, r);
    } else {
      const lay = RIFT.layouts[Math.floor(r() * RIFT.layouts.length)];
      const flip = r() < 0.5 ? -1 : 1;
      for (const [t, dx0, dz] of lay) {
        const dx = dx0 * flip, x = rm.cx + dx, z = rm.cz + dz;
        if (Math.abs(dx) < 1.6 || Math.abs(dz) < 1.4) { if (t !== 'p') continue; }   // keep the ways between doors open
        if (t === 't') { ORCHARD.tree(props, glow, x, 0, z, r, 0.85 + r() * 0.25); solids.push({ x, z, r: 0.75, h: 3.6 }); }
        else if (t === 'c') { ORCHARD.coral(props, glow, x, 0, z, r); solids.push({ x, z, r: 0.55, h: 1.2 }); }
        else if (t === 'r') { ORCHARD.rock(props, x, 0, z, r); solids.push({ x, z, r: 0.8, h: 1.7 }); }
        else if (t === 'k') { ORCHARD.kelp(props, x, 0, z, r); solids.push({ x, z, r: 0.35, h: 2.6 }); }
        else if (t === 'p') ORCHARD.pool(props, glow, x, 0, z);
        place(x, z);
      }
    }
    // jellyfish lanterns float over every room
    for (let k = 0; k < 3; k++) ORCHARD.jelly(glow, rm.cx + (r() - 0.5) * (RW - 4), 3.4 + r() * 1.2, rm.cz + (r() - 0.5) * (RD - 4), r);
    // fish swimming circles
    for (let k = 0; k < 3; k++) {
      const f = buildFish(pick(['#ffb38a', '#9fd8ff', '#ffd36b', '#ff8fd0', '#c6f8ff'], r));
      root.add(f);
      decor.push({ m: f, cx: rm.cx + (r() - 0.5) * 6, cz: rm.cz + (r() - 0.5) * 4, rad: 1.5 + r() * 3, y: 1.8 + r() * 1.8, sp: (0.4 + r() * 0.5) * (r() < 0.5 ? -1 : 1), ph: r() * TAU });
    }
  }
  const floorMesh = floor.mesh(causticMaterial()); floorMesh.castShadow = false;
  root.add(floorMesh, walls.mesh(), props.mesh());
  const gm = glow.mesh(MAT.glow); gm.castShadow = false; root.add(gm);
  // shafts of light from the surface far above
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: CAUSTICS.uTime },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; void main() { float a = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * vUv.y * (0.11 + 0.04 * sin(uTime * 0.8 + vUv.x * 6.0)); gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const rm of rooms.values()) for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + r() * 1.2, 9), shaftMat);
    m.position.set(rm.cx + (r() - 0.5) * 9, 4.3, rm.cz + (r() - 0.5) * 6);
    m.rotation.set(0.25, r() * TAU, 0.3);
    root.add(m);
  }

  // ----- door gates: walls of coral and light that rise out of the doorway -----
  for (const d of doors) {
    const b = new Batch(30 + doors.indexOf(d)), g = new Batch(60 + doors.indexOf(d));
    for (let k = 0; k < 5; k++) {
      const off = -0.8 + k * 0.4, h = 1.6 + (k % 2) * 0.4;
      const x = d.horiz ? d.x : d.x + off, z = d.horiz ? d.z + off : d.z;
      b.box(0.22, h, 0.22, '#d4583f', x, h / 2, z, { top: '#ff8a6a' });
      g.box(0.1, h * 0.8, 0.1, '#9ff3ff', x + 0.05, h * 0.45, z + 0.05, { glow: 1.6, jitter: 0 });
    }
    const grp = new THREE.Group();
    grp.add(b.mesh());
    const gmm = g.mesh(MAT.glow); gmm.castShadow = false; grp.add(gmm);
    grp.position.y = -2.4;
    grp.visible = false;
    root.add(grp);
    d.gate = grp;
    d.solids = d.horiz ? [{ x: d.x, z: d.z - 0.5, r: 0.55, h: 2 }, { x: d.x, z: d.z + 0.5, r: 0.55, h: 2 }] : [{ x: d.x - 0.5, z: d.z, r: 0.55, h: 2 }, { x: d.x + 0.5, z: d.z, r: 0.55, h: 2 }];
  }

  // treasure chest and the heart-glass
  const treasureRoom = [...rooms.values()].find((rm) => rm.type === 'treasure');
  let chest = null;
  if (treasureRoom) {
    chest = buildChest();
    chest.root.position.set(treasureRoom.cx, 0, treasureRoom.cz);
    root.add(chest.root);
    solids.push({ x: treasureRoom.cx, z: treasureRoom.cz, r: 0.6, h: 0.8 });
    chest.open = false;
  }
  const heartGlass = buildHeartGlass();
  heartGlass.visible = false;
  root.add(heartGlass);

  // ----- what the game asks the world (the same questions the cove answers) -----
  function groundAt(x, z) {
    const [ix, iz] = cellOf(x, z);
    const c = at(ix, iz);
    return c === 1 || c === 3 ? 0 : 3;
  }
  function terrainOk(x, z, y, rad) {
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) if (groundAt(x + ox, z + oz) > 0.5) return false;
    return true;
  }
  function solidAt(x, z, rad) {
    for (const s of solids) if (Math.hypot(x - s.x, z - s.z) < s.r + rad) return s;
    return null;
  }
  function walkable(x, z, y, rad = 0.3) { return terrainOk(x, z, y, rad) && !solidAt(x, z, rad); }
  function shotBlocked(x, y, z, rad = 0.08) {
    if (groundAt(x, z) > y) return true;
    for (const s of solids) if (Math.hypot(x - s.x, z - s.z) < s.r + rad && y < (s.h === undefined ? 3 : s.h)) return true;
    return false;
  }
  function targetAt() { return null; }
  // A* for tap-to-walk, on the cells
  function findPath(fx0, fz0, tx, tz) {
    const [si, sj] = cellOf(fx0, fz0);
    let [ti, tj] = cellOf(tx, tz);
    const ok = (i, j) => { const c = at(i, j); return (c === 1 || c === 3) && !solidAt(wx(i) + 0.5, wz(j) + 0.5, 0.2); };
    if (!ok(ti, tj)) {
      let best = null, bd = 1e9;
      for (let rr = 1; rr <= 3 && !best; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { if (ok(ti + di, tj + dj)) { const d = Math.hypot(di, dj); if (d < bd) { bd = d; best = [ti + di, tj + dj]; } } }
      if (!best) return null;
      [ti, tj] = best;
    }
    const startK = sj * W + si, goal = tj * W + ti;
    const g = new Map([[startK, 0]]), from = new Map(), closed = new Set();
    const open = [[Math.hypot(ti - si, tj - sj), startK]];
    let steps = 0;
    while (open.length && steps++ < 5000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const ci = cur % W, cj = Math.floor(cur / W);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di, nj = cj + dj, n = nj * W + ni;
        if (!ok(ni, nj) || closed.has(n)) continue;
        if (di && dj && (!ok(ci + di, cj) || !ok(ci, cj + dj))) continue;
        const ng = g.get(cur) + (di && dj ? 1.414 : 1);
        if (ng < (g.has(n) ? g.get(n) : 1e9)) { g.set(n, ng); from.set(n, cur); open.push([ng + Math.hypot(ti - ni, tj - nj), n]); }
      }
    }
    if (!from.has(goal) && goal !== startK) return null;
    const pts = [];
    for (let c = goal; c !== undefined && c !== startK; c = from.get(c)) pts.push({ x: wx(c % W) + 0.5, z: wz(Math.floor(c / W)) + 0.5 });
    pts.reverse();
    if (walkable(tx, tz, 0, 0.3)) pts.push({ x: tx, z: tz });
    return pts;
  }
  function clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.25);
    for (let k = 1; k <= n; k++) if (!walkable(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 0, 0.32)) return false;
    return true;
  }

  // ----- rooms coming alive: seal, fight, open -----
  let hooks = null, current = start, sealed = null;
  const pending = [];   // waves still to come in the sealed room
  function attach(h) { hooks = h; }
  function setDoor(d, open) {
    if (d.open === open) return;
    d.open = open;
    for (const [ix, iz] of d.cells) cell[iz * W + ix] = open ? 3 : 4;
    for (const s of d.solids) { const i = solids.indexOf(s); if (!open && i < 0) solids.push(s); if (open && i >= 0) solids.splice(i, 1); }
    d.gate.visible = true;
  }
  function seal(rm) {
    sealed = rm;
    for (const d of rm.doors) setDoor(d, false);
    hooks.sound.sfx('barrierUp');
    hooks.shake(0.2);
  }
  function unseal(rm, quiet) {
    for (const d of rm.doors) setDoor(d, true);
    sealed = null;
    if (!quiet) hooks.sound.sfx('barrierDown');
  }
  function spawnSpot(rm) {
    const P = hooks.P;
    for (let k = 0; k < 40; k++) {
      const x = rm.x0 + 1.5 + r() * (RW - 3), z = rm.z0 + 1.5 + r() * (RD - 3);
      if (Math.hypot(x - P.x, z - P.z) < 3.5) continue;
      if (!walkable(x, z, 0, 0.6)) continue;
      if (hooks.foes.list.some((f) => f.alive && Math.hypot(f.x - x, f.z - z) < 1.4)) continue;
      return { x, z };
    }
    return { x: rm.cx, z: rm.cz - 2 };
  }
  function enterRoom(rm) {
    current = rm;
    if (!rm.visited) {
      rm.visited = true;
      if (rm.type === 'combat') {
        const sets = RIFT.waves[Math.min(RIFT.waves.length - 1, Math.max(0, rm.depth - 1))];
        pending.length = 0;
        pending.push(...sets.map((w) => w.slice()));
        seal(rm);
        rm.wait = 0.6;
      } else if (rm.type === 'guardian') {
        seal(rm);
        hooks.onEvent('guardian', rm);
        rm.wait = 1.4;
        pending.length = 0;
        pending.push(['gardener']);
      } else if (rm.type === 'treasure') hooks.onEvent('treasureRoom', rm);
    }
    for (const d of rm.doors) for (const nb of d.rooms) nb.seen = true;
    hooks.onMap();
  }
  function update(dt, t, P) {
    CAUSTICS.uTime.value = t;
    // which room are you in?
    const rm = roomAt(P.x, P.z);
    if (rm && rm !== current && !sealed) enterRoom(rm);
    // a sealed room sends its waves, one after another
    if (sealed) {
      if (sealed.wait > 0) sealed.wait -= dt;
      else if (pending.length && !hooks.foes.alive()) {
        const wave = pending.shift();
        for (const kind of wave) {
          if (kind === 'gardener') {
            const f = hooks.foes.spawn('gardener', sealed.cx, sealed.cz - 1.5);
            f.room = { x0: sealed.x0, x1: sealed.x1, z0: sealed.z0, z1: sealed.z1 };
          } else { const p = spawnSpot(sealed); hooks.foes.spawn(kind, p.x, p.z); }
        }
        sealed.wait = 0.8;
      } else if (!pending.length && !hooks.foes.alive() && sealed.type !== 'guardian') {
        // the room is clear
        sealed.cleared = true;
        const was = sealed;
        unseal(sealed);
        hooks.sound.sfx('roomClear');
        if (Math.random() < 0.35 || P.hp < P.maxHp * 0.5) hooks.foes.dropHeart(was.cx, 0, was.cz);
        hooks.onMap();
      }
    }
    // gates rise and fall
    for (const d of doors) {
      d.rise += ((d.open ? 0 : 1) - d.rise) * Math.min(1, dt * 7);
      d.gate.position.y = -2.4 + d.rise * 2.4;
      if (d.open && d.rise < 0.01) d.gate.visible = false;
    }
    // the treasure chest opens when you walk up to it
    if (chest && !chest.open && Math.hypot(P.x - chest.root.position.x, P.z - chest.root.position.z) < 1.5) {
      chest.open = true;
      hooks.onEvent('chest', chest);
    }
    if (chest) { chest.lid.rotation.x = lerp(chest.lid.rotation.x, chest.open ? -1.9 : 0, Math.min(1, dt * 5)); chest.glow.visible = chest.open; }
    // the heart-glass turns and glows; touching it takes you home
    if (heartGlass.visible) {
      heartGlass.rotation.y = t * 1.2;
      heartGlass.position.y = 1.2 + Math.sin(t * 2) * 0.12;
      if (Math.random() < dt * 20) fx.sparks && fx.sparks.spawn({ x: heartGlass.position.x + (Math.random() - 0.5) * 1.2, y: 0.4 + Math.random() * 1.6, z: heartGlass.position.z + (Math.random() - 0.5) * 1.2, vy: 0.8, life: 1.2, size: 0.14, color: Math.random() < 0.5 ? '#9ff3ff' : '#ff9fe0', glow: 3, flicker: 1 });
      if (!heartGlass.taken && Math.hypot(P.x - heartGlass.position.x, P.z - heartGlass.position.z) < 1.3) { heartGlass.taken = true; hooks.onEvent('exit'); }
    }
    // fish swim, bubbles rise in the room you're in
    for (const f of decor) {
      const a = t * f.sp + f.ph;
      f.m.position.set(f.cx + Math.cos(a) * f.rad, f.y + Math.sin(t * 1.3 + f.ph) * 0.3, f.cz + Math.sin(a) * f.rad);
      f.m.rotation.y = -a + (f.sp > 0 ? 0 : Math.PI);
    }
    if (fx.sparks && current && Math.random() < dt * 10) fx.sparks.spawn({ x: current.x0 + Math.random() * RW, y: 0.1, z: current.z0 + Math.random() * RD, vy: 0.9 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.2, drag: 0.1, life: 3, size: 0.09, color: '#c6f8ff', glow: 1.4, flicker: 1 });
  }
  function guardianDown(f) {
    const rm = sealed;
    if (!rm) return;
    rm.cleared = true;
    heartGlass.position.set(rm.cx, 1.2, rm.cz - 1.5);
    heartGlass.visible = true;
    setTimeout(() => { if (sealed === rm) unseal(rm); hooks.onMap(); }, 1200);
  }
  // you fell: the room you were fighting in opens again, and its creatures wait for you to come back
  function onFell() {
    if (sealed) {
      const rm = sealed;
      unseal(rm, true);
      if (!rm.cleared) rm.visited = false;
      pending.length = 0;
    }
    current = start;
    hooks.onMap();
  }
  function mapState() {
    return { rooms: [...rooms.values()].map((rm) => ({ i: rm.i, j: rm.j, type: rm.type, visited: rm.visited, seen: rm.seen || rm.visited, cleared: rm.cleared, here: rm === current })) };
  }
  const fx = { sparks: null };
  return {
    name: 'rift', root, groundAt, walkable, terrainOk, solidAt, shotBlocked, targetAt, targets, findPath, clearLine, update, fx,
    dummies: [], solids, seep: null, shardOn: () => false, setSeepPower() {}, setNight() {},
    contain: (x, z) => !sealed || (x > sealed.x0 + 0.5 && x < sealed.x1 - 0.5 && z > sealed.z0 + 0.5 && z < sealed.z1 - 0.5),
    spawn: { x: start.cx, z: start.cz + 3.5, y: 0 },
    sunDir: new V3(0.25, 1, 0.35).normalize(),
    attach, guardianDown, onFell, mapState, rooms, chest, heartGlass, sealed: () => sealed,
    light: { hemiSky: '#6fc0cc', hemiGround: '#1d3240', hemiI: 1.55, sun: '#c8f0ff', sunI: 1.6, fog: '#14404c', fogNear: 12, fogFar: 46, grade: [0.94, 1.02, 1.05], exposure: 1.05 },
  };
}
