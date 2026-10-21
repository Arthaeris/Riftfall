/* Riftfall — world.js
   Places: the ground you walk on, what stands on it, what lives in it, and what you can't walk through.
   Two places so far: the Keeper's Cove on Lanternhold, and the first Rift, the Drowned Orchard. */
import * as THREE from 'three';
import { PALETTE, RIFT } from '@rf/data';
import { Batch, MAT, PROPS, ORCHARD, rng, fbm, noise, col, shade, pick, clamp, lerp, TAU, buildSea, buildSky, buildGrass, buildBoat, buildDummy, buildFish, buildChest, buildHeartGlass, buildKeepsake, buildKitchen, buildSails, buildGate, causticMaterial, CAUSTICS, WIND, SKY_UNIFORMS } from '@rf/art';

const V3 = THREE.Vector3;
const N = 140;                // Lanternhold is N x N cells of 1 x 1
const H0 = -N / 2;            // world x/z of the first cell
const CORE = 30;              // the Prologue's cove fills the middle: |x|, |z| < CORE
const STEP = 0.5;             // heights come in steps of half a block
const q = (h) => Math.round(h / STEP) * STEP;

// ---------------------------------------------------------------------------
// The shape of Lanternhold. In the middle, the Keeper's Cove of the Prologue: a cliff plateau in the north
// with the lighthouse and Maren's cottage, a meadow with the training ring and the stone circle, the village
// and the bay. Around it, the districts that open later:
//   north     - Knot Hill, a gentle green hill with the sealed stone on top
//   north-east- Gullcliff, a high grassy cliff-top behind the keepers' wall, with the caves below it,
//               a ridge, the ravine and the boathouse headland beyond
//   east      - the Old Saltworks on the far side of the bay, behind brambles
//   west      - Whisperwood, a raised pine forest with a walled glade in its heart
//   south-west- the Downs, rolling meadow with a windmill
//   south     - the Tidepool Flats, dry at low tide
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
// landmarks of the wider island
export const ISLE = {
  knot: { x: -2, z: -44 },                   // the sealed stone, on top of Knot Hill
  glade: { x: -48, z: -26, r: 9 },           // Whisperwood's walled glade
  ravineX: (z) => 35 + (fbm(z * 0.2, 3) - 0.5) * 1.6,
  outcrop: { x: 49, z: -26, r: 2.6 },        // a rock on Gullcliff, too tall to climb
  windmill: { x: -46, z: 22 },
  boathouse: { x: 47, z: -53 },
};

// the cove of the Prologue, as it was (minus the ridges that used to close it in)
function coreCell(x, z) {
  const s = shoreS(x, z);
  const cx = Math.floor(x), cz = Math.floor(z);
  const st = stairMap.get(cx + ',' + cz);
  let h, kind;
  if (st !== undefined) return { h: st, kind: 'path' };
  const ds = Math.hypot(x - SEEP_AT.x, z - SEEP_AT.z);
  if (ds < SEEP_AT.r + 1.6) return { h: SEEP_AT.h, kind: Math.abs(ds - SEEP_AT.r) < 0.6 ? 'path' : 'grass' };
  const dv = Math.hypot(x - VILLAGE_AT.x, z - VILLAGE_AT.z);
  if (dv < VILLAGE_AT.r) return { h: 1, kind: dv < 3.3 ? 'cobble' : s > -5.4 ? 'sand' : 'grass' };
  const edge = plateauEdge(x);
  const west = -x - 19 + (fbm(z * 0.13, 9) - 0.5) * 5;
  if (s >= 0.8) {
    h = q(-0.5 - Math.min(3.5, (s - 0.8) * 0.55));
    kind = 'sand';
    if (z < edge + 1 && s < 6) { h = q(Math.max(h, -1)); kind = 'stone'; }
    return { h, kind };
  }
  if (z < edge) {
    h = 4 + (fbm(x * 0.2, z * 0.2) > 0.62 ? 0.5 : 0);
    kind = s > -2.5 ? 'stone' : 'grass';
  } else if (s > -5.4) {
    h = s > -3.2 ? 0.5 : 0.5 + (fbm(x * 0.3 + 9, z * 0.3) > 0.62 ? 0.5 : 0);
    kind = 'sand';
  } else {
    const climb = clamp((edge + 4 - z) / 4, 0, 1);
    h = 1 + (fbm(x * 0.17 + 2, z * 0.17) > 0.6 ? 0.5 : 0) + q(climb * 1.0);
    kind = 'grass';
    if (s > -6.6) h = 1;
  }
  if (west > 0) {
    // terraced hills toward Whisperwood; lower in the south, where they roll on into the Downs
    const cap = z > 4 ? 1.2 : 2.8;
    h = Math.max(h, q(1 + clamp(west * 0.42, 0, cap) + fbm(x * 0.35, z * 0.35) * 0.7));
    kind = west > 3.5 && fbm(x * 0.5, z * 0.5) > 0.5 ? 'stone' : 'grass';
  }
  return { h, kind };
}
// how far inland a point is (negative = out at sea): a rounded square with a ragged coast
function coastDist(x, z) {
  const d = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
  return 61 + (fbm(x * 0.045 + 11, z * 0.045 - 7) - 0.5) * 9 - d;
}
// the districts around the cove
function outerCell(x, z) {
  const c = coastDist(x, z);
  if (c < 0) return { h: q(clamp(-0.5 + c * 0.45, -4, -0.5)), kind: 'sand' };
  const rx = ISLE.ravineX(z);
  const bump = (a, b) => (fbm(x * a + b, z * a - b) > 0.62 ? 0.5 : 0);
  // the ravine: a narrow sea inlet north of Gullcliff, too wide to jump
  if (z < -41 && Math.abs(x - rx) < 2.1) return { h: -2.5, kind: 'stone' };
  // a ridge that closes Gullcliff off from the north
  if (x > 30.5 && z >= -46 && z < -41) return { h: 7.5, kind: 'stone' };
  // the boathouse headland, only reached across the ravine
  if (x > rx && z < -46) return { h: 4 + (c > 4 ? bump(0.25, 4) : 0), kind: c < 3.5 ? 'stone' : 'grass' };
  // Gullcliff: a high cliff-top, with a rock outcrop you can't climb
  if (x >= 30.5 && z < -5) {
    const o = Math.hypot(x - ISLE.outcrop.x, z - ISLE.outcrop.z);
    if (o < ISLE.outcrop.r) return { h: 5.5, kind: 'stone' };
    return { h: 4 + bump(0.2, 8), kind: c < 3.5 || fbm(x * 0.3, z * 0.3) > 0.72 ? 'stone' : 'grass' };
  }
  // the Old Saltworks, across the bay
  const sx = 38 + (fbm(z * 0.15, 21) - 0.5) * 4;
  if (x >= sx && z >= -5 && z < 46) return c < 4 ? { h: 0.5, kind: 'sand' } : { h: 1, kind: fbm(x * 0.2, z * 0.2) > 0.58 ? 'grass' : 'dry' };
  // the Tidepool Flats: dry at low tide, with pools and grassy islets
  const fx = -3 + (fbm(z * 0.18, 40) - 0.5) * 5;
  if (x < fx && z > 29) {
    if (z < 32.5) return { h: 0.5, kind: 'sand' };
    if (c < 2.5) return { h: -0.5, kind: 'sand' };
    const isl = fbm(x * 0.13 + 31, z * 0.13 - 9);
    if (isl > 0.64) return { h: isl > 0.68 ? 1 : 0.5, kind: isl > 0.68 ? 'grass' : 'sand' };
    if (fbm(x * 0.27 + 7, z * 0.27) > 0.63) return { h: -0.5, kind: 'wet' };
    return { h: 0, kind: 'wet' };
  }
  // the bay carries on from the cove's shore
  const s = shoreS(x, z);
  if (s >= 0.8 && z > -8) return { h: q(-0.5 - Math.min(3.5, (s - 0.8) * 0.55)), kind: 'sand' };
  // Knot Hill: a gentle green hill rising to a flat top
  if (z < -30 && x > -27) {
    const d = Math.hypot(x - ISLE.knot.x, z - ISLE.knot.z);
    const h = 4 + q(clamp((18.5 - d) / 5, 0, 2.5));
    return { h, kind: c < 3.5 ? 'stone' : d < 6 ? 'stone' : 'grass' };
  }
  // Whisperwood: a raised forest, falling away to the south into the Downs
  if (x <= -27 && z < 10) {
    const gd = Math.hypot(x - ISLE.glade.x, z - ISLE.glade.z);
    if (gd < ISLE.glade.r) return { h: 4.5, kind: 'moss' };
    if (gd < ISLE.glade.r + 2.5) return { h: 7, kind: 'stone' };
    let h = 4 + bump(0.22, 13);
    if (z > 2) h = q(4 - (z - 2) * 0.32);
    return { h: Math.max(h, 1.5), kind: c < 3.5 ? 'stone' : 'grass' };
  }
  // the Downs: rolling meadow
  if (x <= -27) {
    if (c < 3) return { h: 0.5, kind: 'sand' };
    return { h: clamp(1 + q(fbm(x * 0.06 + 5, z * 0.06 + 2) * 2.2), 1, 2.5), kind: 'grass' };
  }
  return { h: 1, kind: 'grass' };
}
function cellInfo(cx, cz) {
  const x = cx + 0.5, z = cz + 0.5;
  if (Math.abs(x) < CORE && Math.abs(z) < CORE) return coreCell(x, z);
  const o = outerCell(x, z);
  // blend into the cove over a few cells, so there are no seams
  const ex = Math.max(Math.abs(x) - CORE, 0), ez = Math.max(Math.abs(z) - CORE, 0);
  const dist = Math.max(ex, ez);
  if (dist < 6) {
    const bx = clamp(x, -CORE + 0.5, CORE - 0.5), bz = clamp(z, -CORE + 0.5, CORE - 0.5);
    const c = coreCell(bx, bz);
    const t = dist / 6;
    // the bay and the sea join without blending (both are water)
    if (c.h < 0 && o.h < 0) return o;
    // the ravine, the ridge and Gullcliff's wall keep their edges
    if (o.h >= 7 || o.h <= -2.5) return o;
    return { h: q(lerp(c.h, o.h, t)), kind: t < 0.5 ? c.kind : o.kind };
  }
  return o;
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
  // the wider island: a ring of paths joining the districts
  paint(19, -14, 30.5, -14.5, 0); paint(30.5, -14.5, 44, -16, 0); paint(44, -16, 44, -22, 0); paint(44, -22, 47, -27, 0);   // Heights -> Gullcliff
  paint(1, -20, -1, -27, 0); paint(-1, -27, -2, -36.5, 0);                         // cottage -> Knot Hill
  paint(-2, -36.5, 12, -44, 0); paint(12, -44, 26, -50, 0); paint(26, -50, 31.6, -50, 0);   // Knot Hill -> the ravine
  paint(-6.4, 2, -18, 0, 0); paint(-18, 0, -30, -6, 0); paint(-30, -6, -40, -12, 0);   // meadow -> Whisperwood
  paint(-20, 20, -32, 22, 0); paint(-32, 22, -43, 23, 0);                          // village -> the Downs and the windmill
  paint(-40, -12, -46, 4, 0); paint(-46, 4, -45, 20, 0);                           // Whisperwood -> the Downs
  paint(-10, 28, -14, 33, 0);                                                      // village -> the Flats
  for (const key of pathCells) {
    const [x, z] = key.split(',').map(Number);
    const i = x - H0, j = z - H0;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    if (K[j * N + i] === 'grass' || K[j * N + i] === 'moss') K[j * N + i] = 'path';
  }
  // set a cell's height and kind by hand
  const setCell = (x, z, h, kind) => { const i = Math.floor(x) - H0, j = Math.floor(z) - H0; if (i < 0 || j < 0 || i >= N || j >= N) return; H[j * N + i] = h; K[j * N + i] = kind; };
  // Gullcliff's foot: a landing of sand under the cliffs, between the bay and the Saltworks' brambles,
  // with the cave mouth cut into the cliff face and a cliff path climbing to the top
  for (let x = 33; x <= 47; x++) for (let z = -5; z <= -3; z++) setCell(x, z, 0.5, 'sand');
  for (let x = 35; x <= 37; x++) for (let z = -8; z <= -6; z++) setCell(x, z, 0.5, 'cave');
  for (let k = 0; k <= 6; k++) for (const x of [43, 44]) setCell(x, -6 - k, 1 + k * 0.5, 'path');
  // the Tidepool Flats' islets: grassy humps ringed with sand, reached on foot only at low tide
  const ISLETS = [{ x: -18, z: 41, r: 2.6 }, { x: -31, z: 46, r: 3.2 }, { x: -9, z: 47, r: 2 }];
  for (const it of ISLETS) for (let x = Math.floor(it.x - it.r - 2); x <= it.x + it.r + 2; x++) for (let z = Math.floor(it.z - it.r - 2); z <= it.z + it.r + 2; z++) {
    const d = Math.hypot(x + 0.5 - it.x, z + 0.5 - it.z);
    if (d < it.r) setCell(x, z, 1, 'grass'); else if (d < it.r + 1.4) setCell(x, z, 0.5, 'sand');
  }
  // level ground behind the cottage, where a little kitchen will one day unfold
  for (let x = 4; x <= 7; x++) for (let z = -22; z <= -19; z++) setCell(x, z, 4, 'grass');
  // Knot Hill's top is one level stone floor
  for (let x = -8; x <= 4; x++) for (let z = -50; z <= -38; z++) if (Math.hypot(x + 0.5 - ISLE.knot.x, z + 0.5 - ISLE.knot.z) < 6) setCell(x, z, 6.5, 'stone');
  // the Flats' islets can be reached at low tide; the far one has a sandbar
  const cellKind = (x, z) => K[(Math.floor(z) - H0) * N + (Math.floor(x) - H0)];
  const hAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? -4 : H[j * N + i]);
  const kAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 'sand' : K[j * N + i]);
  const cellH = (x, z) => hAt(Math.floor(x) - H0, Math.floor(z) - H0);

  // ----- the terrain mesh: tops, plus sides only where a neighbour is lower -----
  // the island is built in chunks, so only what's near the camera is drawn
  const CH = 28, NC = Math.ceil(N / CH);
  const chunkOf = (x, z) => clamp(Math.floor((z - H0) / CH), 0, NC - 1) * NC + clamp(Math.floor((x - H0) / CH), 0, NC - 1);
  const tbs = Array.from({ length: NC * NC }, (_, k) => new Batch(3 + k));
  const topCol = (kind, i, j) => {
    const nn = noise(i * 0.35, j * 0.35);
    switch (kind) {
      case 'sand': return PALETTE.sand[Math.floor(nn * 4) % 4];
      case 'stone': return PALETTE.stone[Math.floor(nn * 3) % 3];
      case 'path': return PALETTE.path[Math.floor(nn * 3) % 3];
      case 'cobble': return ['#a8a39a', '#9d978d', '#b2ada3', '#a39d92'][Math.floor(hashJ(i * 7, j * 3) * 4)];
      case 'seep': return ['#7fb7a6', '#86c2b2', '#78ad9e'][Math.floor(nn * 3) % 3];   // grass going glassy around the shard
      case 'wet': return ['#b8a882', '#ad9e79', '#c2b28c'][Math.floor(nn * 3) % 3];   // tidal sand, dark and shiny
      case 'dry': return ['#cfc39f', '#c6b994', '#d8cdaa'][Math.floor(nn * 3) % 3];   // the Saltworks' pale ground
      case 'moss': return ['#3f7a4a', '#467f4e', '#3a7045'][Math.floor(nn * 3) % 3];
      case 'cave': return '#3a3644';
      default: return PALETTE.grass[Math.floor((nn * 0.7 + hashJ(i, j) * 0.3) * 4) % 4];
    }
  };
  const sideCol = (kind, depthFromTop, y) => {
    if (kind === 'grass' || kind === 'path') return depthFromTop < 0.3 ? PALETTE.grassSide : (Math.floor(y / 0.5) % 2 ? PALETTE.dirt : PALETTE.dirtDark);
    if (kind === 'sand' || kind === 'wet' || kind === 'dry') return depthFromTop < 0.3 ? PALETTE.sandSide : shade(PALETTE.sandSide, 0.86);
    if (kind === 'moss') return depthFromTop < 0.3 ? '#2f5e3a' : PALETTE.dirtDark;
    return Math.floor(y / 0.5) % 2 ? PALETTE.stoneSide : shade(PALETTE.stoneSide, 0.88);
  };
  const tmpC = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = H[j * N + i], kind = K[j * N + i];
    if (h < -1.2) continue;   // deep under the sea: never seen
    const tb = tbs[chunkOf(H0 + i, H0 + j)];
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
  for (const tb of tbs) if (tb.pos.length) { const m = tb.mesh(); m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ----- props -----
  // props are batched per chunk too: `at(x, z)` picks the batches for that spot
  const pbs = Array.from({ length: NC * NC }, (_, k) => new Batch(11 + k * 3)), pgs = Array.from({ length: NC * NC }, (_, k) => new Batch(12 + k * 3));
  let b = pbs[0], g = pgs[0];
  const at = (x, z) => { const k = chunkOf(x, z); b = pbs[k]; g = pgs[k]; return b; };
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
  at(lhX, lhZ);
  const lh = PROPS.lighthouse(b, g, lhX, cellH(lhX, lhZ), lhZ);
  solids.push({ x: lhX, z: lhZ, r: 1.75, h: 12 }); take(lhX, lhZ, 2);
  take(lhX, lhZ + 3.5, 2);   // keep the way to the lighthouse door clear
  const cotX = 1.5, cotZ = -16.5, cotY = cellH(cotX, cotZ);
  at(cotX, cotZ);
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
  for (const [x, z, rot] of lanterns) { at(x, z); PROPS.lanternPost(b, g, x, cellH(x, z), z, rot); solids.push({ x, z, r: 0.2, h: 2.1 }); take(x, z, 0); }

  // the old training ground: a ring of fence posts, a weapon rack and three practice dummies
  const tgX = -11, tgZ = 2, tgY = cellH(tgX, tgZ);
  at(tgX, tgZ);
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
  at(13, 14);
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
  at(fire.x, fire.z);
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
  at(V.x, V.z);
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
  at(hut.x, hut.z);
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
  for (const [x, z, rot] of [[-14.4, 18.4, 0.4], [-10.2, 24.6, 2.6], [-15.6, 24.4, 3.6], [-8.6, 17.4, 1.2]]) { at(x, z); PROPS.lanternPost(b, g, x, cellH(x, z), z, rot); solids.push({ x, z, r: 0.2, h: 2.1 }); take(x, z, 0); }
  take(V.x, V.z, 3);

  // ----- the dock beacon: its light has gone out. Its crystal sits on a stone out in the water,
  // out of reach: you light it again by hitting the crystal with a sling drop -----
  const bcn = { x: 13.3, z: 20.15, y: 0.72 };
  at(bcn.x, bcn.z);
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

  // =========================================================================
  // The wider island
  // =========================================================================
  const dynamicSolids = [];   // solids that come and go (gates, brambles, the shard), checked apart from the rest
  // ----- the keepers' wall: Gullcliff is closed off until Maren opens the gate -----
  const wallX = 31, gateZ = -14.5;
  for (const [z0, z1] of [[-44.5, gateZ - 1.3], [gateZ + 1.3, -5.2]]) {
    at(wallX, (z0 + z1) / 2);
    PROPS.stoneWall(b, wallX, z0, wallX, z1, cellH(wallX, z0), cellH(wallX, z1), r);
    for (let z = z0; z <= z1; z += 0.5) solids.push({ x: wallX, z, r: 0.45, h: 1.2 });
  }
  const gateMesh = buildGate(2.2);
  gateMesh.position.set(wallX, cellH(wallX, gateZ), gateZ); gateMesh.rotation.y = Math.PI / 2;
  scene.add(gateMesh);
  const gate = { x: wallX, z: gateZ, open: false, solids: [-0.8, -0.3, 0.2, 0.7].map((dz) => ({ x: wallX, z: gateZ + dz, r: 0.42, h: 1.6 })) };
  dynamicSolids.push(...gate.solids);
  take(wallX, gateZ, 2);
  // ----- Gullcliff's foot: the cave mouth, and brambles that close off the Saltworks -----
  const mouth = { x: 36.5, z: -7.6, y: 0.5 };
  at(mouth.x, mouth.z);
  PROPS.caveArch(b, g, mouth.x, mouth.y, mouth.z - 0.6, r);
  take(mouth.x, mouth.z, 2);
  const brambles = [];
  for (let x = 38.3; x <= 48.3; x += 0.95) brambles.push([x, -2.2]);
  for (let z = -5.6; z < -2.4; z += 0.95) brambles.push([48.3, z]);
  for (const [x, z] of brambles) {
    at(x, z); PROPS.bramble(b, x, cellH(x, z), z, r);
    const sd = { x, z, r: 0.55, h: 1.4, bramble: true };
    dynamicSolids.push(sd); take(x, z, 0);
  }
  // ----- Knot Hill: the sealed stone, ringed by standing stones -----
  const knotY = cellH(ISLE.knot.x, ISLE.knot.z);
  at(ISLE.knot.x, ISLE.knot.z);
  PROPS.knot(b, g, ISLE.knot.x, knotY, ISLE.knot.z);
  solids.push({ x: ISLE.knot.x, z: ISLE.knot.z, r: 2.3, h: 4.3 });
  for (let k = 0; k < 9; k++) {
    const a = Math.PI / 2 + 0.45 + (k / 9) * (TAU - 0.9);   // a gap to the south, where the path arrives
    const x = ISLE.knot.x + Math.cos(a) * 4.8, z = ISLE.knot.z + Math.sin(a) * 4.8;
    PROPS.standingStone(b, x, cellH(x, z), z, r, 0.9 + r() * 0.3);
    solids.push({ x, z, r: 0.45, h: 2.6 });
  }
  take(ISLE.knot.x, ISLE.knot.z, 6);
  // ----- lantern waystones: light one once, then travel to it from the map -----
  const waystones = [
    { id: 'harbour', name: 'Harbour', x: -7.4, z: 18.4 },
    { id: 'meadow', name: 'Meadow', x: 3.2, z: 6.4 },
    { id: 'heights', name: 'Keeper’s Heights', x: 14.6, z: -13.4 },
    { id: 'gullcliff', name: 'Gullcliff', x: 41.6, z: -15.4 },
    { id: 'knothill', name: 'Knot Hill', x: -4.2, z: -33.8 },
    { id: 'whisperwood', name: 'Whisperwood edge', x: -35.5, z: -10.2 },
    { id: 'downs', name: 'The Downs', x: -40.5, z: 19.6 },
  ];
  for (const w of waystones) {
    w.y = cellH(w.x, w.z);
    at(w.x, w.z);
    const o = PROPS.waystone(b, w.x, w.y, w.z, 0);
    const fb = new Batch(400 + waystones.indexOf(w));
    fb.box(0.22, 0.34, 0.22, '#bff6ff', 0, 0, 0, { glow: 3.4, jitter: 0, rotY: 0.6 });
    fb.box(0.12, 0.2, 0.12, '#ffffff', 0, 0.14, 0, { glow: 4.5, jitter: 0, rotY: 1.2 });
    w.flame = fb.mesh(MAT.glow); w.flame.castShadow = false; w.flame.matrixAutoUpdate = true;
    w.flame.position.set(w.x, o.flameY, w.z); w.flame.visible = false;
    scene.add(w.flame);
    w.lit = false;
    solids.push({ x: w.x, z: w.z, r: 0.55, h: 2.4 });
    take(w.x, w.z, 1);
  }
  // ----- brass rings for the Tether: across the ravine, and up onto Gullcliff's outcrop -----
  const rings = [];
  const addRing = (x, z, lx, lz, rot) => {
    const y = cellH(x, z);
    at(x, z); PROPS.brassRing(b, x, y, z, rot);
    rings.push({ x, z, y: y + 0.95, land: { x: lx, z: lz } });
    take(x, z, 0);
  };
  const ravZ = -50.5, rvx = ISLE.ravineX(ravZ);
  addRing(rvx - 2.55, ravZ, rvx - 3.4, ravZ, Math.PI / 2);
  addRing(rvx + 2.55, ravZ, rvx + 3.4, ravZ, Math.PI / 2);
  addRing(ISLE.outcrop.x - 1.6, ISLE.outcrop.z + 1.2, ISLE.outcrop.x - 0.6, ISLE.outcrop.z + 0.4, 0.8);
  take(rvx - 4, ravZ, 2); take(rvx + 4, ravZ, 2); take(ISLE.outcrop.x, ISLE.outcrop.z, 3);
  // ----- the boathouse on the headland -----
  const bh = ISLE.boathouse, bhY = cellH(bh.x, bh.z);
  at(bh.x, bh.z);
  PROPS.boathouse(b, bh.x, bhY, bh.z, Math.PI);
  boxes.push({ x0: bh.x - 2.6, z0: bh.z - 2.2, x1: bh.x + 2.6, z1: bh.z + 2.2, h: 4.4 });
  take(bh.x, bh.z, 4);
  for (const [x, z] of [[bh.x + 3.6, bh.z + 1.2], [bh.x + 3.2, bh.z + 2.2]]) { PROPS.crate(b, x, cellH(x, z), z, r()); solids.push({ x, z, r: 0.45, h: 0.75 }); }
  PROPS.barrel(b, bh.x - 3.4, cellH(bh.x - 3.4, bh.z + 1.6), bh.z + 1.6, 0.4); solids.push({ x: bh.x - 3.4, z: bh.z + 1.6, r: 0.35, h: 0.85 });
  // ----- the windmill on the Downs, its sails turning -----
  const wm = ISLE.windmill, wmY = cellH(wm.x, wm.z);
  at(wm.x, wm.z);
  PROPS.windmill(b, wm.x, wmY, wm.z);
  solids.push({ x: wm.x, z: wm.z, r: 1.6, h: 7 });
  const sails = buildSails();
  sails.position.set(wm.x, wmY + 5.4, wm.z + 1.45);
  scene.add(sails);
  take(wm.x, wm.z, 3);
  PROPS.fence(b, wm.x - 4, wm.z + 3.5, wm.x + 4, wm.z + 3.5, cellH(wm.x - 4, wm.z + 3.5), cellH(wm.x + 4, wm.z + 3.5));
  for (let t = 0; t <= 8; t += 0.5) solids.push({ x: wm.x - 4 + t, z: wm.z + 3.5, r: 0.18, h: 0.85 });
  for (const [x, z] of [[wm.x + 2.6, wm.z - 1.5], [wm.x + 3.2, wm.z - 0.6]]) { PROPS.barrel(b, x, cellH(x, z), z, r()); solids.push({ x, z, r: 0.35, h: 0.85 }); }
  // ----- the Old Saltworks: salt pans, a dry channel and the ruin of a sunken mill -----
  for (let a = 0; a < 3; a++) for (let c = 0; c < 2; c++) {
    const x = 50 + a * 3.6, z = 8 + c * 3.4;
    if (cellKind(x, z) === undefined) continue;
    at(x, z); PROPS.saltPan(b, x, cellH(x, z), z, 3, 2.6); take(x, z, 2);
  }
  for (let k = 0; k < 9; k++) { const x = 46 + k * 1.2, z = 18 + Math.sin(k * 0.7) * 1.5; at(x, z); PROPS.rock(b, x, cellH(x, z) - 0.25, z, r, 0.45, '#9a958c'); }
  {
    const mx = 54, mz = 30, my = cellH(mx, mz);
    at(mx, mz);
    for (const [x0, z0, x1, z1] of [[mx - 3, mz - 3, mx + 3, mz - 3], [mx - 3, mz - 3, mx - 3, mz + 1.5], [mx + 3, mz - 3, mx + 3, mz + 3]]) {
      PROPS.stoneWall(b, x0, z0, x1, z1, my, my, r);
      for (let t = 0; t <= 1; t += 0.12) solids.push({ x: lerp(x0, x1, t), z: lerp(z0, z1, t), r: 0.45, h: 1.2 });
    }
    b.box(0.5, 4.2, 0.5, '#6b4a33', mx, my + 2.1, mz + 3.4); b.box(2.6, 0.3, 0.3, '#5d3d26', mx, my + 4.1, mz + 3.4, { rotZ: 0.6 });
    take(mx, mz, 4);
  }
  // ----- Whisperwood's glade: an old tree you can see over the wall, but not reach -----
  {
    const gx = ISLE.glade.x, gz = ISLE.glade.z, gy = 4.5;
    at(gx, gz);
    b.push(gx, gy, gz, 0.4, 0, 0, 1.7);
    b.box(0.8, 3.2, 0.8, '#5d463a', 0, 1.6, 0); b.box(1.2, 0.5, 1.2, '#4e3a30', 0, 0.25, 0);
    for (const [w, y] of [[3.2, 3.4], [2.6, 4.3], [1.8, 5.0]]) b.box(w, 1.0, w, '#2f5e47', 0, y, 0, { ao: 0.8 });
    b.box(0.5, 0.4, 0.5, '#4e3a30', 0.5, 2.6, 0.45);   // a hollow, where an owl might sleep
    b.pop();
    for (let k = 0; k < 10; k++) { const a = k * 0.63, d = 3 + (k % 3); const x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d; g.box(0.18, 0.12, 0.18, '#c6f8ff', x, gy + 0.08, z, { glow: 1.3 }); b.box(0.06, 0.16, 0.06, '#e8e0d0', x, gy + 0.04, z); }
    take(gx, gz, Math.ceil(ISLE.glade.r + 3));
  }
  // ----- sea stacks off Gullcliff, too far to reach for now -----
  for (const [x, z, s2] of [[63, -30, 1.6], [66, -19, 1.2], [61, -40, 1.0]]) {
    at(x, z);
    b.push(x, -2.5, z);
    b.box(3.0 * s2, 9 * s2, 2.6 * s2, '#7d7a86', 0, 4.5 * s2, 0, { top: '#8f8c98' });
    b.box(2.2 * s2, 1.2 * s2, 2.0 * s2, '#6f9a4a', 0, 9 * s2 + 0.4, 0);
    b.box(0.7, 0.4, 0.7, '#c8b28a', 0.4, 9 * s2 + 1.2, 0.2);
    b.pop();
  }
  // ----- keepsakes: odd little things, lying where only the apprentice would notice them -----
  const keepsakes = [];
  const keepsake = (id, kind, x, z, y) => {
    const m = buildKeepsake(kind);
    const yy = y === undefined ? cellH(x, z) : y;
    m.position.set(x, yy, z);
    scene.add(m);
    keepsakes.push({ id, kind, x, z, y: yy, m, taken: false });
    take(x, z, 1);
  };
  keepsake('spoon', 'spoon', ISLE.outcrop.x + 0.6, ISLE.outcrop.z - 0.5);
  // the crust: on the far islet of the Flats, out where only low tide lets you walk
  keepsake('crust', 'crust', ISLETS[1].x + 0.4, ISLETS[1].z - 0.3);
  at(ISLETS[1].x - 1, ISLETS[1].z + 0.8); PROPS.driftwood(b, ISLETS[1].x - 1, 1, ISLETS[1].z + 0.8, r);
  // ----- the kitchen behind the cottage: only there once the memory comes back -----
  const kitchen = buildKitchen(5.6, 4, -20.8);
  kitchen.visible = false;
  scene.add(kitchen);
  const kitchenSolids = [{ x: 5.6, z: -21.4, r: 1.5, h: 2.3 }];
  take(5.6, -20.8, 3);
  // Ennis the lamplighter keeps to the harbour, by the first waystone
  take(-6.2, 19.8, 1);

  // ----- scatter: trees, rocks, flowers, shells, driftwood -----
  const grassSpots = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = H0 + i + 0.5, z = H0 + j + 0.5;
    const h = H[j * N + i], kind = K[j * N + i];
    if (h <= 0.01) continue;
    const roll = r();
    at(x, z);
    if (!free(x, z)) {
      if (kind === 'grass' && r() < 0.35) grassSpots.push({ x: x + (r() - 0.5) * 0.8, y: h, z: z + (r() - 0.5) * 0.8, rot: r() * TAU, s: 0.8 + r() * 0.5, c: pick(['#62a447', '#6fb04f', '#57933f', '#7cb85a'], r) });
      continue;
    }
    if (kind === 'grass') {
      // how thick the trees grow depends on the district
      const core = Math.abs(x) < CORE && Math.abs(z) < CORE;
      let density, pineK;
      if (core) { const forest = fbm(x * 0.11 + 40, z * 0.11) > 0.55 || x < -14 || z < -21 || (h >= 4 && Math.abs(x - 6) > 12); density = forest ? 0.12 : 0.025; pineK = z < -10 || x < -14 ? 1 : 0.3; }
      else if (x < -27 && z < 4) { density = fbm(x * 0.15, z * 0.15 + 3) > 0.42 ? 0.17 : 0.05; pineK = 0.9; }   // Whisperwood
      else if (x < -27) { density = 0.018; pineK = 0.2; }                                                      // the Downs
      else if (x > 30.5 && z < -5) { density = 0.014; pineK = 1; }                                             // Gullcliff, windswept
      else if (z < -30) { density = fbm(x * 0.12 + 9, z * 0.12) > 0.5 ? 0.07 : 0.02; pineK = coastDist(x, z) < 8 ? 1 : 0.25; }   // Knot Hill
      else { density = 0.02; pineK = 0.3; }
      if (roll < density && flatAround(x, z, 1) && !nearWay(x, z, 2)) {
        // trees are solid out to their foliage, so you never stand inside a canopy
        const pine = r() < pineK;
        const tall = !core && x < -27 && z < 4;   // Whisperwood's pines are old and tall
        const s = pine ? (tall ? 1.15 + r() * 0.55 : 0.85 + r() * 0.5) : 0.8 + r() * 0.4;
        if (pine) PROPS.pine(b, x, h, z, r, s, tall ? ['#24563f', '#1f4d39', '#2a5e45'] : null); else PROPS.roundTree(b, x, h, z, r, s);
        solids.push({ x, z, r: (pine ? 0.82 : 0.78) * s, h: 4.5 * s }); take(x, z, 1);
        continue;
      }
      // each district has its own ground cover
      const wood = !core && x < -27 && z < 4, downs = !core && x < -27 && z >= 4, knoll = !core && z < -30 && x > -27 && x < 30.5, cliff = !core && x > 30.5 && z < -5;
      if (wood && roll < density + 0.06) { PROPS.fern(b, x, h, z, r); continue; }
      if (wood && roll < density + 0.075) { PROPS.mushrooms(b, x, h, z, r); continue; }
      if (knoll && roll < density + 0.09) { PROPS.heather(b, x, h, z, r); continue; }
      if (downs && roll < density + 0.03) { PROPS.flowers(b, x, h, z, r, ['#e0373f', '#ff5a4a', '#f4f0ff']); continue; }
      if (downs && roll < density + 0.034 && flatAround(x, z, 1) && !nearWay(x, z, 2)) { PROPS.hayBale(b, x, h, z, r); solids.push({ x, z, r: 0.55, h: 0.9 }); take(x, z, 1); continue; }
      if (cliff && roll < density + 0.022 && !nearWay(x, z, 1)) { PROPS.rock(b, x, h, z, r, 0.8 + r() * 0.7); solids.push({ x, z, r: 0.55, h: 1.2 }); take(x, z, 0); continue; }
      if (cliff && roll < density + 0.09) { grassSpots.push({ x, y: h, z, rot: r() * TAU, s: 1.3, c: '#a8b878' }); continue; }
      if (roll < 0.16) { PROPS.flowers(b, x, h, z, r); }
      else if (roll < 0.18 && !nearWay(x, z, 1)) { PROPS.rock(b, x + (r() - 0.5) * 0.3, h, z, r, 0.45 + r() * 0.3); solids.push({ x, z, r: 0.35, h: 0.7 }); take(x, z, 0); continue; }
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) grassSpots.push({ x: x + (r() - 0.5) * 0.9, y: h, z: z + (r() - 0.5) * 0.9, rot: r() * TAU, s: 0.7 + r() * 0.6, c: pick(['#62a447', '#6fb04f', '#57933f', '#7cb85a', '#8cbf5e'], r) });
    } else if (kind === 'stone') {
      if (roll < 0.07 && flatAround(x, z, 0) && !nearWay(x, z, 1)) { PROPS.rock(b, x, h, z, r, 0.6 + r() * 0.6); solids.push({ x, z, r: 0.5, h: 1.1 }); take(x, z, 0); }
      else if (roll < 0.11) b.box(0.4, 0.1, 0.4, '#6f9a4a', x + (r() - 0.5) * 0.5, h + 0.05, z + (r() - 0.5) * 0.5, { jitter: 0.15 });
    } else if (kind === 'dry') {
      // the Saltworks: bleached tufts and the odd thorn bush
      if (roll < 0.06) grassSpots.push({ x, y: h, z, rot: r() * TAU, s: 0.9, c: '#c8c28a' });
      else if (roll < 0.075 && !nearWay(x, z, 1)) { PROPS.rock(b, x, h - 0.1, z, r, 0.4 + r() * 0.3, '#a8a296'); solids.push({ x, z, r: 0.35, h: 0.7 }); take(x, z, 0); }
    } else if (kind === 'wet') {
      // the Flats: shells, weed and little stones in the wet sand
      if (roll < 0.05) PROPS.shell(b, x + (r() - 0.5) * 0.6, h, z + (r() - 0.5) * 0.6, r);
      else if (roll < 0.08) b.box(0.5, 0.06, 0.4, pick(['#5a7a4a', '#6a8a52', '#4a6a40'], r), x + (r() - 0.5) * 0.5, h + 0.03, z + (r() - 0.5) * 0.5, { jitter: 0.15 });
      else if (roll < 0.09) b.box(0.35, 0.22, 0.3, '#8a8690', x, h + 0.1, z, { top: '#9a96a0' });
    } else if (kind === 'moss') {
      if (roll < 0.06) { b.box(0.08, 0.2, 0.08, '#e8e0d0', x, h + 0.1, z); b.box(0.24, 0.08, 0.24, '#c94a6a', x, h + 0.22, z); }
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
    at(x, z);
    PROPS.rock(b, x, ch, z, r, 0.9 + r() * 1.2, '#7d7a86');
  }
  for (let k = 0; k < NC * NC; k++) {
    if (!pbs[k].empty) scene.add(pbs[k].mesh());
    if (!pgs[k].empty) { const gm = pgs[k].mesh(MAT.glow); gm.castShadow = false; scene.add(gm); }
  }
  // grass too, one patch per chunk
  const grassBy = Array.from({ length: NC * NC }, () => []);
  // the outer districts get thinner grass (it's mostly seen from further off), the cove keeps its meadow
  for (const sp of grassSpots) { if ((Math.abs(sp.x) > CORE || Math.abs(sp.z) > CORE) && hashJ(sp.x * 13, sp.z * 7) < 0.45) continue; grassBy[chunkOf(sp.x, sp.z)].push(sp); }
  for (const list of grassBy) if (list.length) scene.add(buildGrass(list));

  // ----- the sea and the sky -----
  const TS = 256, ext = 100;
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
  // once the heart-glass is set in it, the lamp turns to sea-glass: a turning heart inside, and a cooler beam
  const lampHeart = buildHeartGlass();
  lampHeart.scale.setScalar(0.55);
  lampHeart.position.set(lhX, lh.lampY + 0.05, lhZ);
  lampHeart.visible = false;
  scene.add(lampHeart);
  const LAMP_WARM = new THREE.Color('#ffe2a0').multiplyScalar(0.9), LAMP_SEA = new THREE.Color('#9ff3ff').multiplyScalar(1.05);
  const LIGHT_WARM = new THREE.Color(0xffd59a), LIGHT_SEA = new THREE.Color('#8ff0ff');
  let lampK = 0, lampTo = 0;
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
  // sheep grazing on the Downs: they wander, and trot away if you come too close
  const sheep = [];
  for (let k = 0; k < 6; k++) {
    const sb2 = new Batch(70 + k);
    sb2.box(0.7, 0.5, 0.95, '#f2efe8', 0, 0.55, 0, { top: '#faf8f2' });
    sb2.box(0.55, 0.42, 0.7, '#e8e4dc', 0, 0.75, -0.05);
    sb2.box(0.3, 0.32, 0.34, '#3a3238', 0, 0.62, 0.58); sb2.box(0.36, 0.14, 0.2, '#f2efe8', 0, 0.82, 0.5);
    for (const [lx, lz] of [[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.3], [0.22, 0.3]]) sb2.box(0.12, 0.34, 0.12, '#3a3238', lx, 0.17, lz);
    const m = sb2.mesh(); m.matrixAutoUpdate = true;
    const x = ISLE.windmill.x + (r() - 0.5) * 18, z = ISLE.windmill.z - 4 + (r() - 0.5) * 14;
    m.position.set(x, cellH(x, z), z);
    scene.add(m);
    sheep.push({ m, x, z, face: r() * TAU, t: r() * 5, walk: 0, home: { x, z } });
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
  // the sea level rises and falls with the tide; the Flats and the bay's edge are dry only at low tide
  let seaLevel = -0.08;
  // ground height under a point, including the dock planks
  function groundAt(x, z) {
    if (x > dock.x0 && x < dock.x1 && z > dock.z0 && z < dock.z1) return Math.max(dock.y, cellH(x, z));
    return cellH(x, z);
  }
  function onDock(x, z) { return x > dock.x0 && x < dock.x1 && z > dock.z0 && z < dock.z1; }
  // water too deep to wade through
  const deepAt = (x, z, h) => h < seaLevel - 0.4 && !onDock(x, z);
  // how much slower you are here (wading in shallow water)
  function wadeAt(x, z) { const h = groundAt(x, z); return !onDock(x, z) && h < seaLevel - 0.05 ? 0.62 : 1; }
  // can something standing at height y move to (x, z)? r = its radius.
  // Steps work both ways: you never drop down a ledge you couldn't climb back up, so you can't get trapped.
  // (The apprentice may hop down a low ledge: drop = how far.)
  function terrainOk(x, z, y, rad, stepUp, drop = 0) {
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
      const gx = x + ox, gz = z + oz;
      const h = groundAt(gx, gz);
      if (deepAt(gx, gz, h)) return false;
      if (h - y > stepUp) return false;                    // a wall
      if (y - h > Math.max(stepUp, drop)) return false;    // a drop too deep
    }
    return true;
  }
  // ----- collisions: everything solid is sorted into a grid of buckets, so a question only looks nearby -----
  const BK = 2, BN = Math.ceil(N / BK);
  const buckets = new Array(BN * BN);
  const bIdx = (v) => clamp(Math.floor((v - H0) / BK), 0, BN - 1);
  function addStatic(o, x0, z0, x1, z1) {
    for (let bz = bIdx(z0); bz <= bIdx(z1); bz++) for (let bx = bIdx(x0); bx <= bIdx(x1); bx++) (buckets[bz * BN + bx] || (buckets[bz * BN + bx] = [])).push(o);
  }
  for (const s0 of solids) addStatic(s0, s0.x - s0.r, s0.z - s0.r, s0.x + s0.r, s0.z + s0.r);
  for (const bx of boxes) { bx.box = true; addStatic(bx, bx.x0, bx.z0, bx.x1, bx.z1); }
  const hitObj = (o, x, z, rad) => o.box ? (x > o.x0 - rad && x < o.x1 + rad && z > o.z0 - rad && z < o.z1 + rad) : Math.hypot(x - o.x, z - o.z) < o.r + rad;
  function solidAt(x, z, rad) {
    for (let bz = bIdx(z - rad), bz1 = bIdx(z + rad); bz <= bz1; bz++) for (let bx = bIdx(x - rad), bx1 = bIdx(x + rad); bx <= bx1; bx++) {
      const list = buckets[bz * BN + bx];
      if (list) for (const o of list) if (hitObj(o, x, z, rad)) return o;
    }
    for (const o of dynamicSolids) if (hitObj(o, x, z, rad)) return o;
    return null;
  }
  function walkable(x, z, y, rad = 0.3, stepUp = 0.55, drop = 0) {
    return terrainOk(x, z, y, rad, stepUp, drop) && !solidAt(x, z, rad);
  }

  // ----- finding a way: A* over the cells, for tap-to-walk -----
  const blocked = new Uint8Array(N * N);
  const cellY = (i, j) => groundAt(H0 + i + 0.5, H0 + j + 0.5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (solidAt(H0 + i + 0.5, H0 + j + 0.5, 0.22)) blocked[j * N + i] = 1;
  const isBlocked = (i, j) => blocked[j * N + i] || deepAt(H0 + i + 0.5, H0 + j + 0.5, cellY(i, j)) || dynamicSolids.some((o) => hitObj(o, H0 + i + 0.5, H0 + j + 0.5, 0.22));
  function findPath(fx0, fz0, tx, tz) {
    const si = Math.floor(fx0) - H0, sj = Math.floor(fz0) - H0;
    let ti = Math.floor(tx) - H0, tj = Math.floor(tz) - H0;
    const inside = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
    if (!inside(si, sj) || !inside(ti, tj)) return null;
    // tapped somewhere you can't stand (a tree, the sea): aim for the nearest open cell next to it
    if (isBlocked(ti, tj)) {
      let best = null, bd = 1e9;
      for (let rr = 1; rr <= 3 && !best; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        const i = ti + di, j = tj + dj;
        if (!inside(i, j) || isBlocked(i, j)) continue;
        const d = Math.hypot(di, dj) + Math.hypot(i - si, j - sj) * 0.01;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (!best) return null;
      [ti, tj] = best;
    }
    const start = sj * N + si, goal = tj * N + ti;
    const gS = new Map(), from = new Map(), closed = new Set();
    gS.set(start, 0);
    // a small binary heap of [f, cell]
    const heap = [[Math.hypot(ti - si, tj - sj), start]];
    const push = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p2 = (k - 1) >> 1; if (heap[p2][0] <= heap[k][0]) break; [heap[p2], heap[k]] = [heap[k], heap[p2]]; k = p2; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, rgt = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (rgt < heap.length && heap[rgt][0] < heap[m][0]) m = rgt; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    let steps = 0;
    while (heap.length && steps++ < 6000) {
      const [, cur] = pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const ci = cur % N, cj = (cur / N) | 0, cy = cellY(ci, cj);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (!inside(ni, nj)) continue;
        const n = nj * N + ni;
        if (closed.has(n) || isBlocked(ni, nj)) continue;
        if (Math.abs(cellY(ni, nj) - cy) > 0.55) continue;
        if (di && dj && (isBlocked(ni, cj) || isBlocked(ci, nj) || Math.abs(cellY(ni, cj) - cy) > 0.55 || Math.abs(cellY(ci, nj) - cy) > 0.55)) continue;
        const ng = gS.get(cur) + (di && dj ? 1.414 : 1);
        if (ng < (gS.has(n) ? gS.get(n) : 1e9)) { gS.set(n, ng); from.set(n, cur); push([ng + Math.hypot(ti - ni, tj - nj), n]); }
      }
    }
    if (!from.has(goal) && goal !== start) return null;
    const cells = [];
    for (let c = goal; c !== undefined && c !== start; c = from.get(c)) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: H0 + (c % N) + 0.5, z: H0 + ((c / N) | 0) + 0.5 }));
    // the exact tapped point as the last stop, if it's open ground
    if (!isBlocked(Math.floor(tx) - H0, Math.floor(tz) - H0) && walkable(tx, tz, groundAt(tx, tz), 0.3)) pts.push({ x: tx, z: tz });
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
    if (gh > seaLevel && gh > y) return true;
    const o = solidAt(x, z, rad);
    if (!o || o.dummy) return false;
    if (o.y0 === undefined) o.y0 = o.box ? groundAt((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2) : groundAt(o.x, o.z);
    return y < o.y0 + (o.h === undefined ? (o.box ? 4 : 3) : o.h);
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
    const i = dynamicSolids.indexOf(shardSolid);
    if (on && i < 0) dynamicSolids.push(shardSolid);
    if (!on && i >= 0) dynamicSolids.splice(i, 1);
  }
  let night = 0;

  const fx = { sparks: null };
  let seepPower = 1;   // how awake the shard is: 0 = spent, 1 = calm, 2 = the Seep is open
  function update(dt, t, player) {
    SKY_UNIFORMS.uTime.value = t;
    WIND.uTime.value = t;
    sea.material.uniforms.uTime.value = t;
    sea.material.uniforms.uLevel.value = seaLevel;
    sails.rotation.z = -t * 0.6;
    if (gate.open && gate.anim < 1) { gate.anim = Math.min(1, gate.anim + dt * 0.7); gateMesh.position.y = cellH(wallX, gateZ) - gate.anim * 1.7; if (gate.anim >= 1) gateMesh.visible = false; }
    for (const w of waystones) if (w.lit) { w.flame.scale.set(1, 0.9 + Math.sin(t * 9 + w.x) * 0.12, 1); w.flame.rotation.y = t * 0.8; }
    for (const sh of sheep) {
      sh.t -= dt;
      const px = player ? player.x - sh.x : 99, pz = player ? player.z - sh.z : 99;
      if (Math.hypot(px, pz) < 2.4) { sh.face = Math.atan2(-px, -pz); sh.walk = 1.6; sh.t = 1.2; }
      else if (sh.t <= 0) { sh.t = 2 + Math.random() * 4; sh.walk = Math.random() < 0.5 ? 0.6 : 0; sh.face += (Math.random() - 0.5) * 2; if (Math.hypot(sh.x - sh.home.x, sh.z - sh.home.z) > 7) sh.face = Math.atan2(sh.home.x - sh.x, sh.home.z - sh.z); }
      if (sh.walk > 0) {
        const nx = sh.x + Math.sin(sh.face) * sh.walk * dt, nz = sh.z + Math.cos(sh.face) * sh.walk * dt;
        if (walkable(nx, nz, groundAt(sh.x, sh.z), 0.4)) { sh.x = nx; sh.z = nz; } else sh.face += Math.PI * 0.7;
      }
      sh.m.position.set(sh.x, groundAt(sh.x, sh.z) + (sh.walk > 0 ? Math.abs(Math.sin(t * 10 + sh.x)) * 0.05 : 0), sh.z);
      sh.m.rotation.y += Math.atan2(Math.sin(sh.face - sh.m.rotation.y), Math.cos(sh.face - sh.m.rotation.y)) * Math.min(1, dt * 5);
    }
    beam.rotation.y = t * 0.45;
    if (lampK !== lampTo) lampK = lampTo > lampK ? Math.min(lampTo, lampK + dt / 2.2) : Math.max(lampTo, lampK - dt / 2.2);
    beamMat.uniforms.uColor.value.copy(LAMP_WARM).lerp(LAMP_SEA, lampK);
    lampLight.color.copy(LIGHT_WARM).lerp(LIGHT_SEA, lampK);
    lampHeart.visible = lampK > 0.02;
    lampHeart.scale.setScalar(0.55 * Math.min(1, lampK * 1.6));
    lampHeart.rotation.y = t * 0.9;
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
      if (gh > seaLevel && gh <= 0.5 && !solidAt(nx, c.z, 0.2)) c.x = nx; else c.dir *= -1;
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
      // mist drifting through Whisperwood
      if (player && player.x < -27 && player.z < 6 && Math.random() < dt * 10) {
        const x = player.x + (Math.random() - 0.5) * 16, z = player.z + (Math.random() - 0.5) * 12;
        fx.sparks.spawn({ x, y: cellH(x, z) + 0.3 + Math.random() * 1.2, z, vx: 0.3, vy: 0.02, drag: 0, life: 4, size: 0.9, color: '#c8d4e0', glow: 0.35, shrink: 0 });
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
    // the wider island
    solids: dynamicSolids, waystones, rings, keepsakes, gate, mouth, kitchen, wadeAt,
    get seaLevel() { return seaLevel; }, set seaLevel(v) { seaLevel = v; },
    openGate() {
      if (gate.open) return;
      gate.open = true;
      for (const sd of gate.solids) { const i = dynamicSolids.indexOf(sd); if (i >= 0) dynamicSolids.splice(i, 1); }
      gate.anim = 0;
    },
    lightWaystone(id) { const w = waystones.find((v) => v.id === id); if (w) { w.lit = true; w.flame.visible = true; } return w; },
    takeKeepsake(id) { const k = keepsakes.find((v) => v.id === id); if (k && !k.taken) { k.taken = true; k.m.visible = false; } return k; },
    showKitchen() { if (kitchen.visible) return; kitchen.visible = true; dynamicSolids.push(...kitchenSolids); },
    spots: {
      maren: { x: cotX - 0.4, z: cotZ + 2.9, face: 0 },
      tobin: { x: hut.x - 1.9, z: hut.z + 0.4, face: -Math.PI / 2 },
      wenna: { x: st.x, z: st.z + 1.0, face: Math.PI },
      pip: { x: V.x + 2.2, z: V.z + 0.6, face: 0 },
      beaconView: { x: 13.3, z: 19.2 },
      ennis: { x: -6.2, z: 19.8, face: Math.PI * 0.8 },
      boathouse: { x: ISLE.boathouse.x, z: ISLE.boathouse.z + 4.5 },
      cottageDoor: { x: cotX - 0.6, z: cotZ + 2.2 },
      campfire: { x: fire.x, z: fire.z },
      trainingGround: { x: tgX, z: tgZ },
      marenRest: { x: cotX + 2.6, z: cotZ + 2.9, face: -0.4 },
      lighthouseDoor: { x: lhX, z: lhZ + 2.6 },
      marenMorning: { x: lhX - 3.6, z: lhZ + 3.6, face: 0.9 },
      // up on the gallery, beside the lamp (y is the gallery floor)
      gallery: { x: lhX, y: lh.lampY - 0.55, z: lhZ },
    },
    setLamp: (k, instant) => { lampTo = k; if (instant) lampK = k; },
    sea,
    // what the map needs: heights and ground kinds per cell, house footprints, and named places
    mapInfo: {
      N, H0, H, K, boxes,
      places: [
        { name: 'Lighthouse', x: lhX, z: lhZ, icon: 'lighthouse' },
        { name: 'Lanternhold', x: VILLAGE_AT.x, z: VILLAGE_AT.z, icon: 'village' },
        { name: 'Stone circle', x: SEEP_AT.x, z: SEEP_AT.z, icon: 'circle' },
        { name: 'Knot Hill', x: ISLE.knot.x, z: ISLE.knot.z, icon: 'knot' },
        { name: 'Gullcliff', x: 44, z: -24, icon: 'cliff' },
        { name: 'Whisperwood', x: -46, z: -14, icon: 'wood' },
        { name: 'The Downs', x: ISLE.windmill.x, z: ISLE.windmill.z, icon: 'mill' },
        { name: 'Old Saltworks', x: 53, z: 16, icon: 'salt' },
        { name: 'Tidepool Flats', x: -22, z: 44, icon: 'flats' },
        { name: 'Boathouse', x: ISLE.boathouse.x, z: ISLE.boathouse.z, icon: 'boat' },
      ],
      dock,
    },
    name: 'cove', groundAt, walkable, terrainOk, solidAt, findPath, clearLine, update, fx, dummies, spawn, shard,
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
    // jellyfish lanterns float over every room (but not the guardian's: it needs the space, and its own light)
    const calm = rm.type !== 'guardian';
    for (let k = 0; k < 3; k++) { const jx = rm.cx + (r() - 0.5) * (RW - 4), jy = 3.4 + r() * 1.2, jz = rm.cz + (r() - 0.5) * (RD - 4); if (calm) ORCHARD.jelly(glow, jx, jy, jz, r); }
    // fish swimming circles
    for (let k = 0; k < (calm ? 3 : 0); k++) {
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

// ===========================================================================
// Gullcliff Caves: a hand-built dungeon read from a map in data.js (one character per block).
// Creatures are placed and wait in their rooms. Keys, locked doors, a gate on a chain you pull with
// the Tether, a lever that opens a shortcut, chasms crossed by brass rings, and the guardian's pool.
// ===========================================================================
const CAVE_H = { '#': 1.9, '.': 0, ':': 1, '=': 0.5, '~': -0.4, '_': -5 };
export function buildCaves(root, D, saved = {}) {
  const r = rng(4242);
  const rows = D.map, Wd = rows[0].length, Hd = rows.length;
  const X0 = -Wd / 2, Z0 = -Hd / 2;                // world position of cell (0, 0)
  const wx = (i) => X0 + i + 0.5, wz = (j) => Z0 + j + 0.5;
  const cellOf = (x, z) => [Math.floor(x - X0), Math.floor(z - Z0)];
  const ch = (i, j) => (i < 0 || j < 0 || i >= Wd || j >= Hd ? '#' : rows[j][i]);
  // the height of a cell: terrain characters say it; anything else (a chest, a creature) sits on the ground around it
  const H = new Float32Array(Wd * Hd), K = new Array(Wd * Hd);
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const c = ch(i, j);
    let h = CAVE_H[c];
    if (h === undefined) {
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => CAVE_H[ch(i + a, j + b)]).filter((v) => v !== undefined && v < 3 && v > -4);
      const count = {}; let best = 0, bh = 0;
      for (const v of near) { count[v] = (count[v] || 0) + 1; if (count[v] > best) { best = count[v]; bh = v; } }
      h = c === 'L' ? 1.9 : bh;
    }
    H[j * Wd + i] = h;
    K[j * Wd + i] = c === '#' || c === 'L' ? 'rock' : c === '_' ? 'chasm' : c === '~' ? 'water' : h >= 1 ? 'ledge' : 'floor';
  }
  const hAt = (i, j) => (i < 0 || j < 0 || i >= Wd || j >= Hd ? 1.9 : H[j * Wd + i]);
  const cellH = (x, z) => { const [i, j] = cellOf(x, z); return hAt(i, j); };
  // every special cell, by kind
  const find = (c) => { const out = []; for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) if (rows[j][i] === c) out.push({ i, j, x: wx(i), z: wz(j), y: hAt(i, j) }); return out; };

  // ----- light: torches bake warm light into the ground's colours; the rest is cool and dark -----
  const torches = find('t');
  const lightAt = (x, z) => {
    let l = 0.66;
    for (const t of torches) { const d = Math.hypot(x - t.x, z - t.z); if (d < 8) l += Math.pow(1 - d / 8, 2) * 0.8; }
    return Math.min(1.3, l);
  };
  const warmAt = (x, z) => { let w = 0; for (const t of torches) { const d = Math.hypot(x - t.x, z - t.z); if (d < 6) w = Math.max(w, 1 - d / 6); } return w; };

  // ----- the terrain: tops, and sides where a neighbour is lower -----
  const tb = new Batch(901);
  const tc = new THREE.Color(), warm = new THREE.Color('#ffb46b');
  const FLOOR = ['#6a6478', '#726b80', '#645e72', '#6e687c'], LEDGE = ['#847d92', '#8c859a', '#7d768c'];
  const ROCK_TOP = ['#33303e', '#383444', '#2f2c3a'], ROCK_SIDE = ['#5a5468', '#625b70', '#544e62'];
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const h = H[j * Wd + i], kind = K[j * Wd + i];
    if (kind === 'chasm') continue;
    const x0 = X0 + i, z0 = Z0 + j, x1 = x0 + 1, z1 = z0 + 1, cx = x0 + 0.5, cz = z0 + 0.5;
    const nn = noise(i * 0.4, j * 0.4);
    const lit = kind === 'rock' ? 0.6 : lightAt(cx, cz);
    const base = kind === 'rock' ? ROCK_TOP[Math.floor(nn * 3) % 3] : kind === 'ledge' ? LEDGE[Math.floor(nn * 3) % 3] : kind === 'water' ? '#3a5a5e' : FLOOR[Math.floor((nn * 0.6 + hashJ(i, j) * 0.4) * 4) % 4];
    tc.set(base).lerp(warm, kind === 'rock' ? 0 : warmAt(cx, cz) * 0.22).multiplyScalar(lit * (0.95 + hashJ(i * 5, j * 3) * 0.1));
    const hi = (a, b) => (hAt(i + a, j + b) > h + 0.01 ? 1 : 0);
    const ao = (a, b) => 1 - 0.16 * (hi(a, 0) + hi(0, b) + hi(a, b));
    tb.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], tc, ao(-1, 1), ao(1, 1), ao(1, -1), ao(-1, -1));
    for (const [di, dj, a, b2, n] of [[1, 0, [x1, z1], [x1, z0], [1, 0, 0]], [-1, 0, [x0, z0], [x0, z1], [-1, 0, 0]], [0, 1, [x0, z1], [x1, z1], [0, 0, 1]], [0, -1, [x1, z0], [x0, z0], [0, 0, -1]]]) {
      const nh = hAt(i + di, j + dj);
      if (nh >= h) continue;
      const lo = Math.max(nh, -5);
      for (let y = h; y > lo + 0.001; y -= 0.5) {
        const y0 = Math.max(lo, y - 0.5);
        const sc = kind === 'rock' ? ROCK_SIDE[(Math.floor(y * 2) + i + j) % 3] : '#3a3644';
        // deeper into a chasm it all fades to black
        const fade = clamp(1 + y0 / 4.5, 0.08, 1);
        const sl = (kind === 'rock' ? lightAt(cx + di, cz + dj) : lit) * fade;
        tc.set(sc).multiplyScalar(sl);
        tb.quad([a[0], y0, a[1]], [b2[0], y0, b2[1]], [b2[0], y, b2[1]], [a[0], y, a[1]], n, tc, 0.75, 0.75, 1, 1);
      }
    }
  }
  const terrain = tb.mesh(); root.add(terrain);
  // the chasms' floor: black, far below
  const abyss = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshBasicMaterial({ color: '#05040a' }));
  abyss.rotation.x = -Math.PI / 2; abyss.position.y = -5; root.add(abyss);
  // shallow water over the pools
  {
    const wb = new Batch(902);
    for (const c of find('~').concat(find('m').filter((m) => K[m.j * Wd + m.i] === 'water'))) wb.box(1.0, 0.05, 1.0, '#4fa8c0', c.x, -0.1, c.z, { jitter: 0, ao: 1 });
    const wm = new THREE.Mesh(wb.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, emissive: '#123a48', depthWrite: false }));
    wm.renderOrder = 2; root.add(wm);
  }
  // ----- decoration: torches, pillars, barnacles and crystals on the walls -----
  const props = new Batch(903), glow = new Batch(904);
  const solids = [];
  for (const t of torches) {
    props.push(t.x, t.y, t.z);
    props.box(0.5, 0.25, 0.5, '#5d5a66', 0, 0.12, 0); props.box(0.16, 1.4, 0.16, '#3a3a44', 0, 0.8, 0);
    props.box(0.44, 0.12, 0.44, '#2c2c36', 0, 1.5, 0);
    props.pop();
    glow.box(0.26, 0.34, 0.26, '#ff9a3c', t.x, t.y + 1.72, t.z, { glow: 3.4, jitter: 0, rotY: 0.6 });
    glow.box(0.14, 0.24, 0.14, '#ffd36b', t.x, t.y + 1.86, t.z, { glow: 4.2, jitter: 0, rotY: 1.2 });
    solids.push({ x: t.x, z: t.z, r: 0.3, h: 2 });
  }
  for (const p of find('r')) {
    for (let k = 0; k < 4; k++) props.box(0.9 - k * 0.15, 1.2, 0.9 - k * 0.15, ROCK_SIDE[k % 3], p.x, p.y + 0.6 + k * 1.1, p.z, { rotY: k * 0.4 });
    solids.push({ x: p.x, z: p.z, r: 0.55, h: 5 });
  }
  // barnacles and crystals where the walls meet the floor
  for (let j = 1; j < Hd - 1; j++) for (let i = 1; i < Wd - 1; i++) {
    if (K[j * Wd + i] !== 'rock') continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([a, b]) => { const k2 = K[(j + b) * Wd + i + a]; return k2 === 'floor' || k2 === 'ledge'; });
    if (!open || r() > 0.16) continue;
    const [a, b] = open, x = wx(i) + a * 0.5, z = wz(j) + b * 0.5, y = hAt(i + a, j + b);
    if (r() < 0.6) for (let k = 0; k < 3; k++) props.box(0.18, 0.14, 0.18, pick(['#cfc6b8', '#b8ae9e', '#d8d0c4'], r), x + (r() - 0.5) * 0.6 * (1 - Math.abs(a)), y + 0.3 + r() * 1.6, z + (r() - 0.5) * 0.6 * (1 - Math.abs(b)));
    else glow.box(0.14, 0.4, 0.14, pick(['#9ff3ff', '#c6f8ff', '#ff9fe0'], r), x, y + 0.2 + r() * 1.2, z, { glow: 1.6, rotZ: (r() - 0.5) * 0.6, jitter: 0 });
  }
  // ----- things you can use and things in your way -----
  const dyn = [];                      // solids that come and go (doors, gates, pots)
  const targets = [];                  // things a shot or a swing can trigger (the lever)
  const rings = [];                    // brass rings the Tether bites into
  const doors = [];
  const tmpGeo = (w, hh, d, c) => { const bb = new Batch(905 + doors.length); bb.box(w, hh, d, c, 0, hh / 2, 0); return bb; };
  // a door: a slab of stone (or bars) filling its cells, that sinks into the floor when it opens
  function makeDoor(cells, kind) {
    const xs = cells.map((c) => c.x), zs = cells.map((c) => c.z);
    const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5, z0 = Math.min(...zs) - 0.5, z1 = Math.max(...zs) + 0.5;
    const y = Math.min(...cells.map((c) => c.y));
    const bb = new Batch(910 + doors.length);
    const w = x1 - x0, d = z1 - z0;
    if (kind === 'bars' || kind === 'gate') {
      const along = w > d;
      const n = Math.round((along ? w : d) / 0.3);
      for (let k = 0; k <= n; k++) { const t = -0.5 + k / n; bb.box(0.1, 2.0, 0.1, '#3a3a44', along ? t * w : 0, 1.0, along ? 0 : t * d); }
      bb.box(along ? w : 0.2, 0.16, along ? 0.2 : d, '#2c2c36', 0, 1.95, 0); bb.box(along ? w : 0.2, 0.16, along ? 0.2 : d, '#2c2c36', 0, 0.7, 0);
    } else {
      const col2 = kind === 'boss' ? '#5a4a6a' : kind === 'key' ? '#6b4a33' : '#5d5a66';
      bb.box(w, 2.0, d, col2, 0, 1.0, 0, { top: shade(col2, 1.15) });
      if (kind === 'key') { bb.box(w * 0.98, 0.14, d * 0.98, '#c9a24a', 0, 0.5, 0); bb.box(w * 0.98, 0.14, d * 0.98, '#c9a24a', 0, 1.6, 0); bb.box(Math.min(w, d) < 1.2 ? w + 0.08 : 0.36, 0.44, Math.min(w, d) < 1.2 ? d + 0.08 : 0.36, '#e0b85a', 0, 1.1, 0); }
      if (kind === 'boss') { for (let k = 0; k < 9; k++) bb.box(0.3, 0.26, d + 0.1, '#d8d0c4', (r() - 0.5) * w * 0.8, 0.3 + r() * 1.5, (r() - 0.5) * 0.1); bb.box(w + 0.1, 0.5, d + 0.12, '#ff8a96', 0, 1.0, 0, { glow: 1.1 }); }
    }
    const m = bb.mesh(); m.matrixAutoUpdate = true; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); root.add(m);
    const sd = cells.map((c) => ({ x: c.x, z: c.z, r: 0.62, h: 3, door: true }));
    const door = { kind, cells, m, solids: sd, open: false, k: 0, y, x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    dyn.push(...sd);
    doors.push(door);
    return door;
  }
  // group neighbouring door cells of the same kind into one door
  function doorsOf(c, kind) {
    const cells = find(c), out = [];
    while (cells.length) {
      const grp = [cells.shift()];
      for (let k = 0; k < cells.length; k++) if (grp.some((g2) => Math.abs(g2.i - cells[k].i) + Math.abs(g2.j - cells[k].j) === 1)) { grp.push(cells.splice(k, 1)[0]); k = -1; }
      out.push(makeDoor(grp, kind));
    }
    return out;
  }
  const keyDoors = doorsOf('D', 'key'), bossDoors = doorsOf('B', 'boss'), shortcut = doorsOf('S', 'gate'), chainGates = doorsOf('G', 'gate'), combatDoors = doorsOf('d', 'bars');
  function openDoor(dr, quiet) {
    if (dr.open) return;
    dr.open = true;
    for (const sd of dr.solids) { const i = dyn.indexOf(sd); if (i >= 0) dyn.splice(i, 1); }
    if (!quiet && hooks) { hooks.sound.sfx(dr.kind === 'bars' ? 'barrierDown' : 'doorOpen'); hooks.shake(0.15); }
  }
  function closeDoor(dr) {
    if (!dr.open) return;
    dr.open = false; dr.k = Math.min(dr.k, 1);
    for (const sd of dr.solids) if (!dyn.includes(sd)) dyn.push(sd);
    if (hooks) { hooks.sound.sfx('barrierUp'); hooks.shake(0.2); }
  }
  // combat doors start open; they close while there are creatures left in the room
  for (const dr of combatDoors) openDoor(dr, true);
  // ----- brass rings, the gate's chain ring and the shortcut lever -----
  for (const o of find('O')) {
    props.push(o.x, o.y, o.z);
    props.box(0.7, 0.4, 0.7, '#6f6c78', 0, 0.2, 0, { top: '#7f7b88' }); props.box(0.22, 1.1, 0.22, '#5d5a66', 0, 0.9, 0);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; props.box(0.1, 0.16, 0.09, k % 2 ? '#e0b85a' : '#c9a24a', Math.cos(a) * 0.26, 1.7 + Math.sin(a) * 0.26, 0, { rotZ: a, jitter: 0 }); }
    props.pop();
    solids.push({ x: o.x, z: o.z, r: 0.4, h: 2.2 });
    rings.push({ x: o.x, z: o.z, y: o.y + 1.7, i: o.i, j: o.j, cave: true });
  }
  const chain = find('L')[0];
  if (chain) {
    // a ring on the gate's chain, hanging on the wall just behind the bars
    const g0 = chainGates[0];
    const lx = chain.x + 0.5, lz = chain.z;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; props.box(0.08, 0.14, 0.08, '#e0b85a', lx, 1.2 + Math.sin(a) * 0.24, lz + Math.cos(a) * 0.24, { rotX: a, jitter: 0 }); }
    for (let k = 0; k < 4; k++) props.box(0.06, 0.14, 0.06, '#7d7a86', lx, 1.5 + k * 0.16, lz + (k % 2) * 0.04);
    rings.push({ x: lx, z: lz, y: 1.2, lever: true, gate: g0 });
  }
  const lever = find('l')[0];
  let leverT = null;
  if (lever) {
    // a lever on the wall: hit it to open the shortcut
    const lb = new Batch(930);
    lb.box(0.12, 0.7, 0.12, '#3a3a44', 0, 0.35, 0); lb.box(0.24, 0.24, 0.24, '#c94a3f', 0, 0.72, 0);
    const lm = lb.mesh(); lm.matrixAutoUpdate = true; lm.position.set(lever.x - 0.5, 0.9, lever.z); lm.rotation.z = 0.7;
    props.box(0.3, 0.5, 0.5, '#5d5a66', lever.x - 0.45, 0.9, lever.z);
    root.add(lm);
    leverT = { id: 'lever', x: lever.x - 0.55, y: 1.2, z: lever.z, r: 0.45, h: 1.2, on: false, m: lm };
    leverT.onHit = () => { if (leverT.on) return; leverT.on = true; lm.rotation.z = -0.7; for (const dr of shortcut) openDoor(dr); if (hooks) hooks.onEvent('shortcut'); };
    targets.push(leverT);
  }
  // ----- chests: a small key, the big key, the Tether, and a keepsake lying in its alcove -----
  const chests = [];
  for (const [c, item] of [['k', 'smallKey'], ['K', 'bigKey'], ['T', 'tether']]) for (const p of find(c)) {
    const cm = buildChest();
    cm.root.position.set(p.x, p.y, p.z); root.add(cm.root);
    if (item === 'tether') { cm.root.scale.setScalar(1.25); }
    solids.push({ x: p.x, z: p.z, r: 0.55, h: 0.9 });
    chests.push({ id: c + p.i + '_' + p.j, item, x: p.x, z: p.z, y: p.y, open: false, ...cm });
  }
  const keepsakes = [];
  for (const p of find('c')) { const m = buildKeepsake('cup'); m.position.set(p.x, p.y, p.z); root.add(m); keepsakes.push({ id: 'cup', kind: 'cup', x: p.x, z: p.z, y: p.y, m, taken: false }); }
  // ----- pots: break them for hearts and slivers -----
  const pots = [];
  for (const p of find('p')) {
    const pb = new Batch(940 + pots.length);
    pb.box(0.56, 0.5, 0.56, '#9a6b55', 0, 0.25, 0, { top: '#7d5646' }); pb.box(0.4, 0.18, 0.4, '#8a5f4c', 0, 0.58, 0); pb.box(0.62, 0.08, 0.62, '#c8a77a', 0, 0.36, 0);
    const m = pb.mesh(); m.matrixAutoUpdate = true; m.position.set(p.x, p.y, p.z); root.add(m);
    const sd = { x: p.x, z: p.z, r: 0.38, h: 0.7, pot: true };
    dyn.push(sd);
    pots.push({ x: p.x, z: p.z, y: p.y, m, sd, broken: false });
  }
  const pm = props.mesh(); root.add(pm);
  const gm = glow.mesh(MAT.glow); gm.castShadow = false; root.add(gm);
  // the guardian's pool: a ring of water round the rock she sits on
  const bossAt = find('X')[0];
  const exits = find('E');
  const start = find('P')[0];
  // the way out after the guardian: a column of light in her chamber
  const exitLight = (() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ff3ff').multiplyScalar(1.4), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(bossAt.x, 4.5, bossAt.z + 5); m.visible = false; root.add(m);
    return m;
  })();
  // a lantern you carry: the one light that follows you about
  const carry = new THREE.PointLight('#ffd9a0', 9, 9, 1.6);
  carry.castShadow = false;
  root.add(carry);
  const torchLights = [];
  for (const t of torches.filter((_, k) => k % 3 === 0).slice(0, 4)) { const l = new THREE.PointLight('#ff9a4a', 5, 7, 1.6); l.position.set(t.x, t.y + 1.8, t.z); root.add(l); torchLights.push(l); }

  // ----- what the game asks this place -----
  function groundAt(x, z) { return cellH(x, z); }
  function terrainOk(x, z, y, rad, stepUp = 0.55) {
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
      const h = groundAt(x + ox, z + oz);
      if (Math.abs(h - y) > stepUp) return false;
    }
    return true;
  }
  const hit = (o, x, z, rad) => Math.hypot(x - o.x, z - o.z) < o.r + rad;
  function solidAt(x, z, rad) {
    for (const o of solids) if (hit(o, x, z, rad)) return o;
    for (const o of dyn) if (hit(o, x, z, rad)) return o;
    return null;
  }
  function walkable(x, z, y, rad = 0.3) { return terrainOk(x, z, y, rad) && !solidAt(x, z, rad); }
  function shotBlocked(x, y, z, rad = 0.08) {
    if (groundAt(x, z) > y) return true;
    const o = solidAt(x, z, rad);
    return !!o && y < groundAt(o.x, o.z) + (o.h === undefined ? 3 : o.h);
  }
  function targetAt(x, y, z, rad = 0.1) {
    for (const t of targets) if (Math.hypot(x - t.x, z - t.z) < t.r + rad && Math.abs(y - t.y) < t.h / 2 + rad) return t;
    return null;
  }
  const walkCell = (i, j) => { const c = K[j * Wd + i]; return c === 'floor' || c === 'ledge' || c === 'water'; };
  function findPath(fx0, fz0, tx, tz) {
    const [si, sj] = cellOf(fx0, fz0);
    let [ti, tj] = cellOf(tx, tz);
    const ok = (i, j) => i >= 0 && j >= 0 && i < Wd && j < Hd && walkCell(i, j) && !solidAt(wx(i), wz(j), 0.2);
    if (!ok(ti, tj)) {
      let best = null, bd = 1e9;
      for (let rr = 1; rr <= 3 && !best; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) if (ok(ti + di, tj + dj)) { const d = Math.hypot(di, dj); if (d < bd) { bd = d; best = [ti + di, tj + dj]; } }
      if (!best) return null;
      [ti, tj] = best;
    }
    const startK = sj * Wd + si, goal = tj * Wd + ti;
    const gS = new Map([[startK, 0]]), from = new Map(), closed = new Set();
    const open = [[Math.hypot(ti - si, tj - sj), startK]];
    let steps = 0;
    while (open.length && steps++ < 4000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const ci = cur % Wd, cj = Math.floor(cur / Wd), cy = hAt(ci, cj);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di, nj = cj + dj, n = nj * Wd + ni;
        if (!ok(ni, nj) || closed.has(n) || Math.abs(hAt(ni, nj) - cy) > 0.55) continue;
        if (di && dj && (!ok(ni, cj) || !ok(ci, nj))) continue;
        const ng = gS.get(cur) + (di && dj ? 1.414 : 1);
        if (ng < (gS.has(n) ? gS.get(n) : 1e9)) { gS.set(n, ng); from.set(n, cur); open.push([ng + Math.hypot(ti - ni, tj - nj), n]); }
      }
    }
    if (!from.has(goal) && goal !== startK) return null;
    const cells = [];
    for (let c = goal; c !== undefined && c !== startK; c = from.get(c)) cells.push(c);
    cells.reverse();
    return cells.map((c) => ({ x: wx(c % Wd), z: wz(Math.floor(c / Wd)) }));
  }
  function clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.25);
    let y = groundAt(ax, az);
    for (let k = 1; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; if (!walkable(x, z, y, 0.32)) return false; y = groundAt(x, z); }
    return true;
  }
  // where you land when the Tether pulls you to a ring: the open side of its pillar, away from where you came from
  function ringLanding(rg, fromX, fromZ) {
    if (rg.land) return rg.land;
    let best = null, bd = -1;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const i = rg.i + a, j = rg.j + b;
      if (!walkCell(i, j)) continue;
      const x = wx(i), z = wz(j);
      if (solidAt(x, z, 0.3)) continue;
      const d = Math.hypot(x - fromX, z - fromZ);
      if (d > bd) { bd = d; best = { x, z }; }
    }
    return best;
  }

  // ----- the rooms coming alive -----
  let hooks = null;
  const amb = D.ambush, inAmb = (x, z) => x > wx(amb.x0) - 0.5 && x < wx(amb.x1) + 0.5 && z > wz(amb.z0) - 0.5 && z < wz(amb.z1) + 0.5;
  const state = { ambushDone: false, sealed: false, keys: 0, bigKey: false, bossDone: false, opened: {}, doorsOpen: {}, seen: new Uint8Array(Wd * Hd) };
  // a journey saved earlier puts the caves back as they were
  function restore(sv) {
    if (!sv) return;
    Object.assign(state, { ambushDone: !!sv.ambushDone, keys: sv.keys || 0, bigKey: !!sv.bigKey, bossDone: !!sv.bossDone, opened: sv.opened || {}, doorsOpen: sv.doorsOpen || {} });
    for (const c of chests) if (state.opened[c.id]) { c.open = true; c.lid.rotation.x = -1.9; }
    doors.forEach((dr, k) => { if (state.doorsOpen[k]) { openDoor(dr, true); dr.k = 1; } });
    if (state.doorsOpen.lever && leverT) { leverT.on = true; leverT.m.rotation.z = -0.7; }
    if (sv.seen) { const b = atob(sv.seen); for (let k = 0; k < Math.min(b.length, state.seen.length); k++) state.seen[k] = b.charCodeAt(k); }
    if (sv.cup) for (const kp of keepsakes) { kp.taken = true; kp.m.visible = false; }
    if (state.bossDone) exitLight.visible = true;
  }
  function snapshot() {
    const doorsOpen = {};
    doors.forEach((dr, k) => { if (dr.open && dr.kind !== 'bars') doorsOpen[k] = 1; });
    if (leverT && leverT.on) doorsOpen.lever = 1;
    let seen = ''; for (let k = 0; k < state.seen.length; k++) seen += String.fromCharCode(state.seen[k]);
    return { ambushDone: state.ambushDone, keys: state.keys, bigKey: state.bigKey, bossDone: state.bossDone, opened: state.opened, doorsOpen, seen: btoa(seen), cup: keepsakes.every((k) => k.taken) };
  }
  function attach(h) { hooks = h; }
  // the creatures placed in the map, made when you arrive
  function populate() {
    const list = [];
    for (const [c, kind] of [['s', 'shardmite'], ['m', 'mirrorpuddle'], ['f', 'bellfish'], ['n', 'barnacle']]) for (const p of find(c)) {
      if (state.ambushDone && inAmb(p.x, p.z)) continue;
      list.push({ kind, x: p.x, z: p.z, amb: inAmb(p.x, p.z) });
    }
    return list;
  }
  let revealT = 0;
  function update(dt, t, P) {
    carry.position.set(P.x, P.y + 1.6, P.z + 0.3);
    for (const l of torchLights) l.intensity = 5 + Math.sin(t * 11 + l.position.x) * 0.6 + Math.sin(t * 17 + l.position.z) * 0.4;
    // doors sinking and rising
    for (const dr of doors) {
      const want = dr.open ? 1 : 0;
      if (dr.k !== want) dr.k = want > dr.k ? Math.min(1, dr.k + dt * 1.6) : Math.max(0, dr.k - dt * 4);
      dr.m.position.y = dr.y - dr.k * 2.2;
      dr.m.visible = dr.k < 0.99;
    }
    if (exitLight.visible) exitLight.material.opacity = 0.22 + Math.sin(t * 2) * 0.06;
    // the map fills in around you as you explore
    revealT -= dt;
    if (revealT <= 0) {
      revealT = 0.2;
      const [pi, pj] = cellOf(P.x, P.z);
      let fresh = false;
      for (let j = pj - 6; j <= pj + 6; j++) for (let i = pi - 7; i <= pi + 7; i++) {
        if (i < 0 || j < 0 || i >= Wd || j >= Hd) continue;
        const k = j * Wd + i;
        if (!state.seen[k] && Math.hypot(i - pi, j - pj) < 7.5) { state.seen[k] = 1; fresh = true; }
      }
      if (fresh && hooks.onMap) hooks.onMap();
    }
    if (!hooks) return;
    // the ambush: step in while creatures are left, and the bars come down until they're gone
    const inside = inAmb(P.x, P.z) && P.x > wx(amb.x0) && P.z < wz(amb.z1);
    const left = hooks.foes.list.some((f) => f.alive && f.amb);
    if (!state.ambushDone && !state.sealed && inside && left) { state.sealed = true; for (const dr of combatDoors) closeDoor(dr); hooks.onEvent('sealed'); }
    if (state.sealed && !left) { state.sealed = false; state.ambushDone = true; for (const dr of combatDoors) openDoor(dr); hooks.onEvent('cleared'); }
    // locked doors open when you walk up to them with the right key
    for (const dr of keyDoors.concat(bossDoors)) {
      if (dr.open) continue;
      const near = dr.cells.some((c) => Math.hypot(P.x - c.x, P.z - c.z) < 1.25);
      if (!near) { dr.told = false; continue; }
      if (dr.kind === 'key' && state.keys > 0) { state.keys--; openDoor(dr); hooks.onEvent('unlock', dr); }
      else if (dr.kind === 'boss' && state.bigKey) { openDoor(dr); hooks.onEvent('unlockBoss', dr); }
      else if (!dr.told) { dr.told = true; hooks.onEvent('locked', dr); }
    }
    for (const dr of shortcut) if (!dr.open && !dr.told && dr.cells.some((c) => Math.hypot(P.x - c.x, P.z - c.z) < 1.3) && P.z > dr.z) { dr.told = true; hooks.onEvent('stuck'); }
    for (const dr of chainGates) if (!dr.open && !dr.told && dr.cells.some((c) => Math.hypot(P.x - c.x, P.z - c.z) < 1.6)) { dr.told = true; hooks.onEvent('chainHint'); }
    // chest lids, the keepsake, the way out
    for (const c of chests) c.lid.rotation.x = lerp(c.lid.rotation.x, c.open ? -1.9 : 0, Math.min(1, dt * 5));
    for (const kp of keepsakes) if (!kp.taken) { kp.m.rotation.y = t * 0.6; if (Math.hypot(P.x - kp.x, P.z - kp.z) < 0.8) { kp.taken = true; kp.m.visible = false; hooks.onEvent('keepsake', kp); } }
    if (exits.some((e) => Math.hypot(P.x - e.x, P.z - e.z) < 0.9)) hooks.onEvent('exit');
    if (exitLight.visible && Math.hypot(P.x - exitLight.position.x, P.z - exitLight.position.z) < 1.1) hooks.onEvent('exit');
  }
  // the chest you're standing at, if any (the sword button offers "Open")
  function chestNear(P) { return chests.find((c) => !c.open && Math.hypot(P.x - c.x, P.z - c.z) < 1.4) || null; }
  function openChest(c) { c.open = true; state.opened[c.id] = 1; if (c.item === 'smallKey') state.keys++; if (c.item === 'bigKey') state.bigKey = true; }
  // a swing or a shot at a pot breaks it
  function breakPot(x, z, rad) {
    const out = [];
    for (const p of pots) if (!p.broken && Math.hypot(x - p.x, z - p.z) < rad + 0.4) { p.broken = true; p.m.visible = false; const i = dyn.indexOf(p.sd); if (i >= 0) dyn.splice(i, 1); out.push(p); }
    return out;
  }
  function guardianDown() { state.bossDone = true; exitLight.visible = true; }
  // the map: heights and kinds per cell (the same shape the island's map uses), plus what you've seen
  const mapInfo = {
    N: Math.max(Wd, Hd), H0: X0, cave: true,
    H: (() => { const n = Math.max(Wd, Hd), a = new Float32Array(n * n).fill(3.6); for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) a[j * n + i] = H[j * Wd + i]; return a; })(),
    K: (() => { const n = Math.max(Wd, Hd), a = new Array(n * n).fill('rock'); for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) a[j * n + i] = K[j * Wd + i]; return a; })(),
    boxes: [], places: [], dock: { x0: 0, x1: 0, z0: 0, z1: 0 },
    seen: state.seen, seenW: Wd,
  };
  return {
    name: 'caves', root, groundAt, walkable, terrainOk, solidAt, shotBlocked, targetAt, targets, findPath, clearLine, update, fx: {},
    dummies: [], solids: dyn, seep: null, shardOn: () => false, setSeepPower() {}, setNight() {},
    spawn: { x: start.x, z: start.z, y: start.y },
    sunDir: new V3(0.3, 1, 0.45).normalize(),
    get chests_open() { return chests.filter((c) => c.open).length; }, boss: bossAt, rings, ringLanding, chestNear, openChest, breakPot, guardianDown, populate, attach, restore, snapshot, state, mapInfo, keepsakes,
    sealed: () => state.sealed,
    contain: (x, z) => !state.sealed || inAmb(x, z),
    onFell() { if (state.sealed) { state.sealed = false; for (const dr of combatDoors) openDoor(dr, true); } },
    light: { hemiSky: '#a8b0d8', hemiGround: '#2a2434', hemiI: 1.25, sun: '#c8d4f0', sunI: 1.0, fog: '#14111f', fogNear: 22, fogFar: 58, grade: [0.98, 0.98, 1.04], exposure: 1.12 },
  };
}
