/* Riftfall — world.js
   Places: the ground you walk on, what stands on it, what lives in it, and what you can't walk through:
   Lanternhold's Keeper's Cove, the first Rift, Gullcliff Caves and the Sunken Belfry (both from buildCaves), Brinemoor, and the Glass Sea. */
import * as THREE from 'three';
import { PALETTE, RIFT } from '@rf/data';
import { buildPlayer, Batch, MAT, PROPS, ORCHARD, rng, fbm, noise, col, shade, pick, clamp, lerp, TAU, buildSea, buildSky, buildGrass, buildBoat, buildDummy, buildFish, buildChest, buildHeartGlass, buildKeepsake, buildKitchen, buildSails, buildGate, MARKET_PROPS, CINDER_PROPS, moltenMaterial, MOLTEN, buildSailboat, buildBelfryTower, buildMiniIsland, causticMaterial, CAUSTICS, WIND, SKY_UNIFORMS } from '@rf/art';

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
    PROPS.stoneWall(b, wallX, z0, wallX, z1, cellH(wallX, z0), cellH(wallX, z1), r, cellH);
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
  // each clump its own little mesh, so the Lantern can burn them one by one
  const burnables = [];
  for (const [x, z] of brambles) {
    at(x, z);
    const bb = new Batch(1680 + burnables.length);
    PROPS.bramble(bb, 0, 0, 0, r);
    const m = bb.mesh(); m.position.set(x, cellH(x, z), z); m.matrixAutoUpdate = true; m.castShadow = true; scene.add(m);
    const sd = { x, z, r: 0.55, h: 1.4, bramble: true };
    dynamicSolids.push(sd); take(x, z, 0);
    burnables.push({ m, sd, x, z, burnt: false, t: 0, grp: 'wall' });
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
      PROPS.stoneWall(b, x0, z0, x1, z1, my, my, r, cellH);
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
  // ----- a covered porch on the Heights, out of the rain: there once the rainy day comes back -----
  const porchAt = (() => {
    // the flattest open ground a few steps from the Heights' waystone
    let best = null, bs = 1e9;
    for (const [dx, dz] of [[4, 2], [5, -1], [-4, 2], [3, 4], [-3, -3], [6, 2], [4, -4]]) {
      const x = 14.6 + dx, z = -13.4 + dz, h0 = cellH(x, z);
      let sp = 0; for (const [ox, oz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) sp += Math.abs(cellH(x + ox, z + oz) - h0);
      if (h0 > 2 && sp < bs) { bs = sp; best = { x, z, y: h0 }; }
    }
    return best || { x: 18.6, z: -11.4, y: cellH(18.6, -11.4) };
  })();
  const porch = (() => {
    const b = new Batch(326), g = new Batch(327), P0 = porchAt;
    b.push(P0.x, P0.y, P0.z);
    b.box(3.4, 0.2, 2.4, '#a6764d', 0, 0.1, 0, { top: '#b5865c' });
    for (const [px, pz] of [[-1.5, -1.0], [1.5, -1.0], [-1.5, 1.0], [1.5, 1.0]]) b.box(0.18, 2.3, 0.18, '#6b4a33', px, 1.25, pz);
    for (let k = 0; k < 4; k++) b.box(3.8 - k * 0.6, 0.2, 2.8, k % 2 ? '#3f5a6a' : '#4f6a7a', 0, 2.45 + k * 0.18, -0.1);
    b.box(2.0, 0.1, 0.5, '#8b5e3c', 0, 0.55, -0.6); for (const sx of [-0.8, 0.8]) b.box(0.1, 0.45, 0.45, '#5d3d26', sx, 0.32, -0.6);
    b.box(2.0, 0.5, 0.08, '#8b5e3c', 0, 0.9, -0.85);
    b.box(0.3, 0.5, 0.3, '#f2c43a', 1.1, 0.45, 0.6);   // a pair of yellow boots by the post
    b.box(0.22, 0.12, 0.42, '#f2c43a', 1.1, 0.26, 0.75);
    b.pop();
    g.box(0.2, 0.26, 0.2, '#ffd29a', P0.x - 1.5, P0.y + 1.9, P0.z + 1.0, { glow: 2.8, jitter: 0 });
    const grp = new THREE.Group(); grp.add(b.mesh()); const gm2 = g.mesh(MAT.glow); gm2.castShadow = false; grp.add(gm2);
    grp.position.set(0, 0, 0);
    return grp;
  })();
  porch.visible = false;
  scene.add(porch);
  const porchSolids = [{ x: porchAt.x, z: porchAt.z - 0.6, r: 1.0, h: 1.0 }];
  take(porchAt.x, porchAt.z, 2);
  // ----- Odda's forge, in the old smithy's place at the edge of the village: there once she has moved in -----
  const freeAround = (x, z, rx, rz) => { for (let a = -rx; a <= rx; a++) for (let c = -rz; c <= rz; c++) if (!free(x + a, z + c)) return false; return true; };
  const forgeAt = (() => {
    for (let rr = 9; rr <= 17; rr += 1) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU, x = Math.round(VILLAGE_AT.x + Math.cos(a) * rr) + 0.5, z = Math.round(VILLAGE_AT.z + Math.sin(a) * rr) + 0.5;
      if (cellH(x, z) >= 0.9 && flatAround(x, z, 3) && freeAround(x, z, 3, 3)) return { x, z, y: cellH(x, z) };
    }
    return { x: VILLAGE_AT.x + 12.5, z: VILLAGE_AT.z - 6.5, y: cellH(VILLAGE_AT.x + 12.5, VILLAGE_AT.z - 6.5) };
  })();
  take(forgeAt.x, forgeAt.z, 3);
  const forge = (() => {
    const b = new Batch(328), g = new Batch(329);
    CINDER_PROPS.forge(b, g, forgeAt.x, forgeAt.y, forgeAt.z);
    const grp = new THREE.Group(); grp.add(b.mesh()); const gm2 = g.mesh(MAT.glow); gm2.castShadow = false; grp.add(gm2);
    return grp;
  })();
  forge.visible = false;
  scene.add(forge);
  const forgeSolids = [{ x: forgeAt.x - 1.2, z: forgeAt.z - 0.9, r: 0.8, h: 2 }, { x: forgeAt.x + 0.6, z: forgeAt.z + 0.2, r: 0.5, h: 1 }, { x: forgeAt.x, z: forgeAt.z - 1.5, r: 1.2, h: 2.5 }, { x: forgeAt.x - 1.5, z: forgeAt.z - 1.5, r: 0.6, h: 2.5 }, { x: forgeAt.x + 1.5, z: forgeAt.z - 1.5, r: 0.6, h: 2.5 }];
  // ----- the little pool on the Heights: just water, until something falls into it and it becomes a mirror -----
  const poolAt = (() => {
    for (const [dx, dz] of [[-4, 3], [-5, -2], [3, 5], [-3, 6], [5, 4], [-6, 1], [2, -5], [-2, -6]]) {
      const x = 14.6 + dx, z = -13.4 + dz;
      if (cellH(x, z) > 2 && flatAround(x, z, 2) && freeAround(x, z, 2, 2)) return { x, z, y: cellH(x, z) };
    }
    return { x: 10.6, z: -10.4, y: cellH(10.6, -10.4) };
  })();
  take(poolAt.x, poolAt.z, 2);
  const pool = (() => {
    const grp = new THREE.Group();
    const b = new Batch(330);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; b.box(0.7, 0.3, 0.5, ['#8e8c99', '#a3a1ad', '#7f7d8b'][k % 3], poolAt.x + Math.cos(a) * 1.55, poolAt.y + 0.1, poolAt.z + Math.sin(a) * 1.3, { rotY: -a }); }
    grp.add(b.mesh());
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.35, 28), new THREE.MeshLambertMaterial({ color: '#4fa8c0', transparent: true, opacity: 0.75, emissive: '#123a48' }));
    water.rotation.x = -Math.PI / 2; water.scale.y = 0.85; water.position.set(poolAt.x, poolAt.y + 0.12, poolAt.z); grp.add(water);
    grp.userData = { water };
    return grp;
  })();
  scene.add(pool);
  solids.push({ x: poolAt.x, z: poolAt.z, r: 1.4, h: 0.4 });
  // what the mirror shows, painted once: a night sky with the crack in it, and Lanternhold's lighthouse
  // upside down, its lamp at the bottom, going down much further than the pool is deep
  let mirrorMat = null;
  function mirrorPicture() {
    const S = 96, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, S); sky.addColorStop(0, '#0d1030'); sky.addColorStop(0.6, '#1d1b4a'); sky.addColorStop(1, '#3a2f6e');
    g.fillStyle = sky; g.fillRect(0, 0, S, S);
    const r = rng(4242);
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.3 ? '#ffd8f0' : '#cfe2ff'; g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1); }
    // the crack, seen from below
    g.strokeStyle = '#ff9fe0'; g.lineWidth = 1; g.globalAlpha = 0.8;
    for (let k = 0; k < 6; k++) { g.beginPath(); let x = 70, y = 18; g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (r() - 0.5) * 14; y += (r() - 0.3) * 9; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1;
    // the tower, standing on its head: rock at the top, the lamp hanging at the bottom
    const cx = 40;
    g.fillStyle = '#3c3a4a'; g.fillRect(cx - 18, 0, 36, 10);
    for (let y = 10; y < 66; y += 4) { const w = 12 + Math.floor((y - 10) * -0.06); g.fillStyle = Math.floor((y - 10) / 8) % 2 ? '#c04a46' : '#ece6dc'; g.fillRect(cx - w / 2, y, w, 4); }
    g.fillStyle = '#2a2838'; g.fillRect(cx - 9, 66, 18, 3);
    const lamp = g.createRadialGradient(cx, 75, 1, cx, 75, 22); lamp.addColorStop(0, '#fff2b0'); lamp.addColorStop(0.3, 'rgba(255,190,90,0.7)'); lamp.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = lamp; g.fillRect(cx - 24, 52, 48, 44);
    g.fillStyle = '#ffe9a0'; g.fillRect(cx - 5, 69, 10, 8);
    g.fillStyle = '#2a2838'; g.fillRect(cx - 7, 77, 14, 3); g.fillRect(cx - 1, 80, 2, 4);
    // the water's own shine across it
    g.fillStyle = 'rgba(223,232,244,0.12)'; for (let y = 6; y < S; y += 11) g.fillRect(0, y, S, 1);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.95 });
  }
  const waterMat = pool.userData.water.material;
  function setMirror(on) {
    if (on && !mirrorMat) mirrorMat = mirrorPicture();
    pool.userData.water.material = on ? mirrorMat : waterMat;
  }
  // ----- the Old Saltworks: brambles grown up round something, the night the sky cracked. Nothing cuts them; fire might -----
  const salt = (() => {
    let at = null;
    for (const [dx, dz] of [[0, 0], [-3, -2], [2, -3], [-4, 2], [3, 2], [-2, 4], [4, -1], [-5, -3]]) {
      const x = 53 + dx, z = 16 + dz;
      if (cellH(x, z) > 0.4 && flatAround(x, z, 3) && freeAround(x, z, 3, 3)) { at = { x: x + 0.5, z: z + 0.5, y: cellH(x, z) }; break; }
    }
    if (!at) at = { x: 50.5, z: 14.5, y: cellH(50.5, 14.5) };
    take(at.x, at.z, 4);
    const clumps = [], rr = rng(77);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, rad = 2.5 + rr() * 0.4, x = at.x + Math.cos(a) * rad, z = at.z + Math.sin(a) * rad;
      const bb = new Batch(1700 + k);
      for (let n = 0; n < 7; n++) bb.box(0.18 + rr() * 0.2, 0.7 + rr() * 1.1, 0.18 + rr() * 0.2, pick(['#2a1f2e', '#33263a', '#3a2a3a', '#241a28'], rr), (rr() - 0.5) * 1.1, 0.5, (rr() - 0.5) * 1.1, { rotZ: (rr() - 0.5) * 1.2, rotX: (rr() - 0.5) * 1.2 });
      for (let n = 0; n < 4; n++) bb.box(0.08, 0.08, 0.08, '#ff9fe0', (rr() - 0.5) * 1, 0.5 + rr() * 1, (rr() - 0.5) * 1, { glow: 1.4, jitter: 0 });
      const m = bb.mesh(); m.position.set(x, cellH(x, z), z); m.matrixAutoUpdate = true; scene.add(m);
      const sd = { x, z, r: 0.75, h: 2, bramble: true };
      dynamicSolids.push(sd);
      const c = { m, sd, x, z, burnt: false, t: 0, grp: 'ring' };
      clumps.push(c); burnables.push(c);
    }
    // what they were growing round: a keeper's chart case, its seal still whole
    const pb = new Batch(1720);
    pb.box(0.9, 0.5, 0.6, '#6b4a33', 0, 0.25, 0, { top: '#7a5236' }); pb.box(0.95, 0.12, 0.65, '#c9a24a', 0, 0.42, 0); pb.box(0.3, 0.3, 0.06, '#c94a3f', 0, 0.3, 0.32, { glow: 0.6 });
    const page = pb.mesh(); page.position.set(at.x, at.y, at.z); page.matrixAutoUpdate = true; scene.add(page);
    return { at, clumps, page, taken: false, get burnt() { return clumps.every((c) => c.burnt); } };
  })();
  // a flame reaching (x, z): any bramble in reach catches; returns how many
  const burnOne = (c) => { c.burnt = true; c.t = 0; const i = dynamicSolids.indexOf(c.sd); if (i >= 0) dynamicSolids.splice(i, 1); };
  function burnBrambles(x, z, rad) {
    let n = 0;
    for (const c of burnables) if (!c.burnt && Math.hypot(c.x - x, c.z - z) < rad + 0.8) { burnOne(c); n++; }
    return n;
  }
  // fire runs along a bramble wall from clump to clump; returns the clumps burning right now (for the flames)
  function updateSalt(dt) {
    const burning = [];
    for (const c of burnables) {
      if (!c.burnt && burnables.some((o) => o.grp === c.grp && o.burnt && o.t > 0.22 && o.t < 0.6 && Math.hypot(o.x - c.x, o.z - c.z) < 1.7)) burnOne(c);
      if (c.burnt && c.t < 1.2) { c.t += dt; const k = clamp(1 - c.t / 0.9, 0, 1); c.m.scale.set(1, Math.max(0.01, k), 1); c.m.visible = k > 0.01; if (c.t < 0.9) burning.push(c); }
    }
    return burning;
  }
  const burnState = () => burnables.filter((c) => c.burnt).length ? burnables.map((c) => (c.burnt ? 1 : 0)).join('') : '';
  function restoreSalt(bs, taken) {
    if (bs) burnables.forEach((c, k) => { if (bs[k] === '1') { burnOne(c); c.t = 9; c.m.visible = false; } });
    if (taken) { salt.taken = true; salt.page.visible = false; }
  }
  take(5.6, -20.8, 3);
  // Ennis the lamplighter keeps to the harbour, by the first waystone
  take(-6.2, 19.8, 1);

  // ----- scatter: trees, rocks, flowers, shells, driftwood -----
  const mapTrees = [];   // where the trees stand, for the 3D map
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
        solids.push({ x, z, r: (pine ? 0.82 : 0.78) * s, h: 4.5 * s }); take(x, z, 1); mapTrees.push({ x, z, h, pine, s });
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
    forge, forgeAt, showForge() { if (forge.visible) return; forge.visible = true; dynamicSolids.push(...forgeSolids); },
    pool, poolAt, setMirror, salt, burnBrambles, updateSalt, restoreSalt, burnState, burnables,
    porch, porchAt, showPorch() { if (porch.visible) return; porch.visible = true; dynamicSolids.push(...porchSolids); },
    spots: {
      maren: { x: cotX - 0.4, z: cotZ + 2.9, face: 0 },
      tobin: { x: hut.x - 1.9, z: hut.z + 0.4, face: -Math.PI / 2 },
      wenna: { x: st.x, z: st.z + 1.0, face: Math.PI },
      pip: { x: V.x + 2.2, z: V.z + 0.6, face: 0 },
      beaconView: { x: 13.3, z: 19.2 },
      ennis: { x: -6.2, z: 19.8, face: Math.PI * 0.8 },
      boathouse: { x: ISLE.boathouse.x, z: ISLE.boathouse.z + 4.5 },
      // where the Lantern ties up: the west side of the dock, near its end
      lantern: { x: 12.9, z: 17.4 },
      odda: { x: forgeAt.x + 1.3, z: forgeAt.z + 1.0, face: -0.6 },
      forge: { x: forgeAt.x + 0.6, z: forgeAt.z + 2.2 },
      pool: { x: poolAt.x, z: poolAt.z + 2.2 },
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
      N, H0, H, K, boxes, trees: mapTrees,
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
export function buildRift(root, seed = 7, R = RIFT) {
  const r = rng(seed);
  const MK = R.theme === 'market';   // the Clocktide Market: a night market of stalls and clocks (else the Drowned Orchard)
  const RW = R.roomW, RD = R.roomD, G = 7, PX = RW + 1, PZ = RD + 1;
  // ----- the layout: start in the middle, grow rooms that touch exactly one existing room -----
  const key = (i, j) => i + ',' + j;
  const rooms = new Map();
  const add = (i, j, type) => { const rm = { i, j, type, doors: [], cleared: type !== 'combat', visited: false, seen: false, depth: 0 }; rooms.set(key(i, j), rm); return rm; };
  const start = add(3, 3, 'start');
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const count = (i, j) => N4.filter(([a, b]) => rooms.has(key(i + a, j + b))).length;
  let guard = 0;
  while (rooms.size < R.rooms && guard++ < 500) {
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
  const sandCols = MK ? ['#4e4038', '#6a5846'] : ['#c9c2a4', '#beb79a', '#d2cbae', '#b8b398'];
  const tmpC = new THREE.Color();
  for (let iz = 0; iz < D; iz++) for (let ix = 0; ix < W; ix++) {
    const c = at(ix, iz);
    if (!c) continue;
    const x0 = wx(ix), z0 = wz(iz), x1 = x0 + 1, z1 = z0 + 1;
    if (c === 1 || c === 3 || c === 4) {
      // seabed, a little darker next to walls
      const nearWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(ix + a, iz + b) === 2);
      if (MK) tmpC.set(sandCols[(ix + iz) % 2]).multiplyScalar((nearWall ? 0.8 : 1) * (0.93 + r() * 0.1));   // a checkered market floor
      else {
        tmpC.set(pick(sandCols, r)).multiplyScalar((nearWall ? 0.82 : 1) * (0.95 + r() * 0.1));
        if (r() < 0.12) tmpC.set('#7fa89a').multiplyScalar(0.95 + r() * 0.1);   // a patch of sea-grass
      }
      floor.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], tmpC);
    } else if (c === 2) {
      // walls: old stone overgrown with weed. Outer walls to the north and west stand tall; everything else is low,
      // so the camera can always see into the room
      const outerN = at(ix, iz - 1) === 0, outerW = at(ix - 1, iz) === 0;
      const tall = outerN || outerW;
      const h = tall ? 2.8 : 0.9;
      if (MK) {
        // shopfronts: dark wood with brass trim; the tall ones have lit windows, the low ones are railings
        const wood = pick(['#4a2e2a', '#3f2a30', '#56342c'], r);
        walls.box(1, h, 1, wood, x0 + 0.5, h / 2, z0 + 0.5, { top: tall ? '#2a1c1e' : '#6a4a38' });
        if (!tall && (ix + iz) % 3 === 0) walls.box(0.14, 0.2, 0.14, '#c9a24a', x0 + 0.5, h + 0.1, z0 + 0.5);
        if (tall && r() < 0.4) glow.box(0.5, 0.6, 0.06, pick(['#ffd29a', '#ffb070', '#fff2d6'], r), x0 + 0.5, 1.7, z0 + (outerN ? 1.04 : 0.5), { glow: 1.5, jitter: 0 });
        else if (tall) walls.box(0.9, 0.12, 1.04, '#c9a24a', x0 + 0.5, 2.3, z0 + 0.5);
        continue;
      }
      const stone = pick(['#5f6f78', '#56656e', '#687882'], r);
      walls.box(1, h, 1, stone, x0 + 0.5, h / 2, z0 + 0.5, { top: r() < 0.5 ? '#4a7a5a' : shade(stone, 1.15) });
      if (r() < 0.25) walls.box(0.3, 0.5 + r() * 0.6, 0.3, '#3f7a3a', x0 + 0.5 + (r() - 0.5) * 0.4, h + 0.3, z0 + 0.5 + (r() - 0.5) * 0.4, { jitter: 0.15 });
    }
  }
  // pillars where walls meet, with a glowing jelly lantern on some
  for (const rm of rooms.values()) for (const [x, z] of [[rm.x0, rm.z0], [rm.x1, rm.z0], [rm.x0, rm.z1], [rm.x1, rm.z1]]) {
    if (MK) { walls.box(1.3, 1.6, 1.3, '#3a2a30', x, 0.8, z, { top: '#c9a24a' }); glow.box(0.3, 0.36, 0.3, '#ffd29a', x, 1.85, z, { glow: 2.4, jitter: 0 }); }
    else walls.box(1.3, 1.6, 1.3, '#4f5d66', x, 0.8, z, { top: '#5f7d6a' });
  }
  const solids = [], targets = [], decor = [];
  for (const rm of rooms.values()) for (const [x, z] of [[rm.x0, rm.z0], [rm.x1, rm.z0], [rm.x0, rm.z1], [rm.x1, rm.z1]]) solids.push({ x, z, r: 0.75, h: 1.6 });
  const take = new Set();
  const place = (x, z) => take.add(Math.floor(x + CX) + ',' + Math.floor(z + CZ));
  const free = (x, z) => !take.has(Math.floor(x + CX) + ',' + Math.floor(z + CZ));
  // furniture from the layouts; keep the cross through the doorways clear
  const clocks = [];   // the great clock over each room: its hands creep round toward the strike
  for (const rm of rooms.values()) {
    if (MK) {
      if (rm.type === 'start') MARKET_PROPS.fountain(props, glow, rm.cx, 0, rm.cz - 1.5), solids.push({ x: rm.cx, z: rm.cz - 1.5, r: 1.7, h: 3 });
      else if (rm.type === 'treasure') { for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) { MARKET_PROPS.crate(props, glow, rm.cx + dx, 0, rm.cz + dz, r); solids.push({ x: rm.cx + dx, z: rm.cz + dz, r: 0.6, h: 1 }); } MARKET_PROPS.coins(props, glow, rm.cx + 1.4, 0, rm.cz + 0.6, r); }
      else if (rm.type === 'guardian') MARKET_PROPS.floorClock(glow, props, rm.cx, 0, rm.cz - 0.5, 5.2);
      else {
        const lay = R.layouts[Math.floor(r() * R.layouts.length)];
        const flip = r() < 0.5 ? -1 : 1;
        for (const [t, dx0, dz] of lay) {
          const dx = dx0 * flip, x = rm.cx + dx, z = rm.cz + dz;
          if (Math.abs(dx) < 1.6 || Math.abs(dz) < 1.4) { if (t !== 'p' && t !== 'l') continue; }
          if (t === 's') { MARKET_PROPS.stall(props, glow, x, 0, z, r); solids.push({ x, z, r: 1.1, h: 2.3 }); }
          else if (t === 'c') { MARKET_PROPS.crate(props, glow, x, 0, z, r); solids.push({ x, z, r: 0.6, h: 1 }); }
          else if (t === 'k') { MARKET_PROPS.clockPost(props, glow, x, 0, z); solids.push({ x, z, r: 0.3, h: 3.3 }); }
          else if (t === 'l') MARKET_PROPS.lantern(glow, props, x, 3.2, z, r);
          else if (t === 'p') MARKET_PROPS.coins(props, glow, x, 0, z, r);
          place(x, z);
        }
      }
      // a great clock face on the room's north wall where it's a tall outer wall, and a sky of small faces far above
      const outerNorth = at(rm.ox + PX / 2, rm.oz - 1) === 0;
      for (let k = 0; k < 5; k++) glow.box(0.8, 0.8, 0.06, '#fff2d6', rm.cx + (r() - 0.5) * RW, 7 + r() * 3, rm.cz + (r() - 0.5) * RD, { glow: 0.7, rotZ: r(), rotY: (r() - 0.5) * 0.6, jitter: 0 });
      if (!outerNorth) continue;
      const cb = new Batch(80 + clocks.length);
      cb.box(2.0, 2.0, 0.3, '#3a2a30', 0, 0, 0, { top: '#c9a24a' }); cb.box(2.2, 0.12, 0.34, '#c9a24a', 0, 1.06, 0); cb.box(2.2, 0.12, 0.34, '#c9a24a', 0, -1.06, 0);
      const cy = 3.3, cz = rm.z0 - 0.75;
      const cm = cb.mesh(); cm.position.set(rm.cx, cy, cz); root.add(cm);
      glow.box(1.7, 1.7, 0.04, '#fff2d6', rm.cx, cy, cz + 0.17, { glow: 1.2, jitter: 0 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; props.box(0.07, 0.18, 0.04, '#3a2a30', rm.cx + Math.cos(a) * 0.7, cy + Math.sin(a) * 0.7, cz + 0.21, { rotZ: a + Math.PI / 2, jitter: 0 }); }
      const hand = (len, w, c) => { const hb = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.04), new THREE.MeshBasicMaterial({ color: c })); hb.geometry.translate(0, len / 2 - 0.08, 0); hb.position.set(rm.cx, cy, cz + 0.23); root.add(hb); return hb; };
      clocks.push({ min: hand(0.8, 0.07, '#2a1a10'), hour: hand(0.5, 0.1, '#2a1a10'), off: r() * TAU });
      continue;
    }
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
      const lay = R.layouts[Math.floor(r() * R.layouts.length)];
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
    const calm = rm.type !== 'guardian' && !MK;
    for (let k = 0; k < 3; k++) { const jx = rm.cx + (r() - 0.5) * (RW - 4), jy = 3.4 + r() * 1.2, jz = rm.cz + (r() - 0.5) * (RD - 4); if (calm) ORCHARD.jelly(glow, jx, jy, jz, r); }
    // fish swimming circles
    for (let k = 0; k < (calm ? 3 : 0); k++) {
      const f = buildFish(pick(['#ffb38a', '#9fd8ff', '#ffd36b', '#ff8fd0', '#c6f8ff'], r));
      root.add(f);
      decor.push({ m: f, cx: rm.cx + (r() - 0.5) * 6, cz: rm.cz + (r() - 0.5) * 4, rad: 1.5 + r() * 3, y: 1.8 + r() * 1.8, sp: (0.4 + r() * 0.5) * (r() < 0.5 ? -1 : 1), ph: r() * TAU });
    }
  }
  // the market's turning gears, drifting high over every room
  if (MK) for (const rm of rooms.values()) for (let k = 0; k < 2; k++) {
    const gb = new Batch(120 + decor.length);
    const rad = 0.5 + r() * 0.5, n = 10;
    for (let q = 0; q < n; q++) { const a = (q / n) * TAU; gb.box(0.2, 0.22, 0.12, '#c9a24a', Math.cos(a) * rad, Math.sin(a) * rad, 0, { rotZ: a, jitter: 0 }); }
    gb.box(rad * 1.5, rad * 1.5, 0.08, '#a8823a', 0, 0, 0); gb.box(0.2, 0.2, 0.2, '#5a3a2a', 0, 0, 0);
    const gm2 = gb.mesh(); gm2.castShadow = false; root.add(gm2);
    decor.push({ m: gm2, gear: true, cx: rm.cx + (r() - 0.5) * 10, cz: rm.cz + (r() - 0.5) * 6, y: 4.6 + r() * 1.8, sp: (0.3 + r() * 0.5) * (r() < 0.5 ? -1 : 1), ph: r() * TAU, tilt: (r() - 0.5) * 1.2 });
  }
  const floorMesh = MK ? floor.mesh() : floor.mesh(causticMaterial()); floorMesh.castShadow = false; floorMesh.receiveShadow = true;
  root.add(floorMesh, walls.mesh(), props.mesh());
  const gm = glow.mesh(MAT.glow); gm.castShadow = false; root.add(gm);
  // shafts of light from the surface far above
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: CAUSTICS.uTime },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; void main() { float a = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * vUv.y * (0.11 + 0.04 * sin(uTime * 0.8 + vUv.x * 6.0)); gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const rm of rooms.values()) for (let k = 0; k < (MK ? 0 : 2); k++) {
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
      b.box(0.22, h, 0.22, MK ? '#c9a24a' : '#d4583f', x, h / 2, z, { top: MK ? '#f0d27a' : '#ff8a6a' });
      g.box(0.1, h * 0.8, 0.1, MK ? '#ffd29a' : '#9ff3ff', x + 0.05, h * 0.45, z + 0.05, { glow: 1.6, jitter: 0 });
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
  const S = R.strike || null, strike = { t: 0, stop: 0 };
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
        const sets = R.waves[Math.min(R.waves.length - 1, Math.max(0, rm.depth - 1))];
        pending.length = 0;
        pending.push(...sets.map((w) => w.slice()));
        seal(rm);
        rm.wait = 0.6;
      } else if (rm.type === 'guardian') {
        seal(rm);
        hooks.onEvent('guardian', rm);
        rm.wait = 1.4;
        pending.length = 0;
        pending.push([R.guardian || 'gardener']);
      } else if (rm.type === 'treasure') hooks.onEvent('treasureRoom', rm);
    }
    for (const d of rm.doors) for (const nb of d.rooms) nb.seen = true;
    hooks.onMap();
  }
  function update(dt, t, P) {
    CAUSTICS.uTime.value = t;
    // the Market's great clock: it creeps toward the strike, ticks loud near it, and then time stands still
    if (S) {
      if (strike.stop > 0) { strike.stop -= dt; if (strike.stop <= 0) hooks.onEvent('strikeEnd'); }
      else {
        const before = strike.t;
        strike.t += dt;
        const warnAt = S.every - S.warn;
        if (strike.t > warnAt && Math.floor((strike.t - warnAt) * 2) !== Math.floor((before - warnAt) * 2)) hooks.onEvent('tick', (strike.t - warnAt) / S.warn);
        if (strike.t >= S.every) { strike.t = 0; strike.stop = S.stop; hooks.onEvent('strike'); }
      }
      const k = strike.t / S.every;
      for (const c of clocks) { c.min.rotation.z = -k * TAU; c.hour.rotation.z = -c.off - k * TAU / 12; }
    }
    // which room are you in?
    const rm = roomAt(P.x, P.z);
    if (rm && rm !== current && !sealed) enterRoom(rm);
    // a sealed room sends its waves, one after another
    if (sealed) {
      if (sealed.wait > 0) sealed.wait -= dt;
      else if (pending.length && !hooks.foes.alive()) {
        const wave = pending.shift();
        for (const kind of wave) {
          if (kind === (R.guardian || 'gardener')) {
            const f = hooks.foes.spawn(kind, sealed.cx, sealed.cz - 1.5);
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
      if (f.gear) { if (!strike.stop) f.m.rotation.z += dt * f.sp; f.m.position.set(f.cx, f.y + Math.sin(t * 0.7 + f.ph) * 0.2, f.cz); f.m.rotation.x = f.tilt; continue; }
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
    name: MK ? 'market' : 'rift', R, root, frozen: () => strike.stop > 0, strikeK: () => (S ? strike.t / S.every : 0), groundAt, walkable, terrainOk, solidAt, shotBlocked, targetAt, targets, findPath, clearLine, update, fx,
    dummies: [], solids, seep: null, shardOn: () => false, setSeepPower() {}, setNight() {},
    contain: (x, z) => !sealed || (x > sealed.x0 + 0.5 && x < sealed.x1 - 0.5 && z > sealed.z0 + 0.5 && z < sealed.z1 - 0.5),
    spawn: { x: start.cx, z: start.cz + 3.5, y: 0 },
    sunDir: new V3(0.25, 1, 0.35).normalize(),
    attach, guardianDown, onFell, mapState, rooms, chest, heartGlass, sealed: () => sealed,
    light: MK ? { hemiSky: '#ffcf9a', hemiGround: '#3a2440', hemiI: 1.45, sun: '#ffe2b8', sunI: 1.5, fog: '#2a1830', fogNear: 12, fogFar: 46, grade: [1.05, 0.99, 0.95], exposure: 1.08 }
      : { hemiSky: '#6fc0cc', hemiGround: '#1d3240', hemiI: 1.55, sun: '#c8f0ff', sunI: 1.6, fog: '#14404c', fogNear: 12, fogFar: 46, grade: [0.94, 1.02, 1.05], exposure: 1.05 },
  };
}

// ===========================================================================
// Gullcliff Caves: a hand-built dungeon read from a map in data.js (one character per block).
// Creatures are placed and wait in their rooms. Keys, locked doors, a gate on a chain you pull with
// the Tether, a lever that opens a shortcut, chasms crossed by brass rings, and the guardian's pool.
// ===========================================================================
const CAVE_H = { '#': 1.9, '.': 0, ':': 1, '=': 0.5, '~': -0.4, '_': -5, ',': -1.5, a: -1.0, b: -0.5, v: -0.4, O: -0.4, h: 0 };
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
    K[j * Wd + i] = c === '#' || c === 'L' ? 'rock' : c === '_' ? 'chasm' : c === '~' ? 'water' : c === 'v' || c === 'O' ? 'molten' : h < -0.25 ? 'sunk' : h >= 1 ? 'ledge' : 'floor';
  }
  // ----- the water level (the Belfry's: the Tide Bell turns it high or low; the caves have none) -----
  const WT = D.water || null;
  let wl = WT ? WT[saved && saved.level ? saved.level : WT.start] : -99, wlTo = wl;
  const crateCells = new Set();
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) if (ch(i, j) === 'F') crateCells.add(j * Wd + i);
  const crateTop = () => Math.max(-1.0, wl + 0.58);   // a crate floats half out of the water, or sits on the sunken floor
  // theme: the caves are violet stone; the Belfry is green-grey stone, bronze and old water
  const BEL = D.theme === 'belfry', KIL = D.theme === 'kiln', TMP = D.theme === 'temple';
  const hAt = (i, j) => (i < 0 || j < 0 || i >= Wd || j >= Hd ? 1.9 : crateCells.has(j * Wd + i) ? crateTop() : H[j * Wd + i]);
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
  const tc = new THREE.Color(), warm = new THREE.Color(BEL ? '#ffc88a' : '#ffb46b');
  const FLOOR = TMP ? ['#aeb8cc', '#b6c0d4', '#a8b2c6', '#b2bcd0'] : KIL ? ['#5a4440', '#62483f', '#54403c', '#5e4642'] : BEL ? ['#5f6e6a', '#667570', '#5a6864', '#62716c'] : ['#6a6478', '#726b80', '#645e72', '#6e687c'];
  const LEDGE = TMP ? ['#c8d0e0', '#d0d8e6', '#c2cadc'] : KIL ? ['#7a5a4a', '#82604e', '#725446'] : BEL ? ['#7d8a84', '#86928c', '#76847e'] : ['#847d92', '#8c859a', '#7d768c'];
  const ROCK_TOP = TMP ? ['#1c1a30', '#211f37', '#18162a'] : KIL ? ['#2a1e1c', '#30221e', '#261a18'] : BEL ? ['#26302e', '#2b3532', '#232c2a'] : ['#33303e', '#383444', '#2f2c3a'];
  const ROCK_SIDE = KIL ? ['#6a3a2e', '#723e30', '#5e342a'] : BEL ? ['#4a5a56', '#52625e', '#44544f'] : ['#5a5468', '#625b70', '#544e62'];
  const SUNK = TMP ? ['#a2acc2', '#aab4ca', '#9ca6bc'] : ['#4a5a56', '#52605c', '#465450'];
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const h = H[j * Wd + i], kind = K[j * Wd + i];
    if (kind === 'chasm') continue;
    const x0 = X0 + i, z0 = Z0 + j, x1 = x0 + 1, z1 = z0 + 1, cx = x0 + 0.5, cz = z0 + 0.5;
    const nn = noise(i * 0.4, j * 0.4);
    const lit = kind === 'rock' ? 0.6 : lightAt(cx, cz);
    const base = kind === 'rock' ? ROCK_TOP[Math.floor(nn * 3) % 3] : kind === 'ledge' ? LEDGE[Math.floor(nn * 3) % 3] : kind === 'water' ? '#3a5a5e' : kind === 'sunk' ? SUNK[Math.floor(nn * 3) % 3] : kind === 'molten' ? '#2a1410' : FLOOR[Math.floor((nn * 0.6 + hashJ(i, j) * 0.4) * 4) % 4];
    tc.set(base).lerp(warm, kind === 'rock' ? 0 : warmAt(cx, cz) * 0.22).multiplyScalar(lit * (0.95 + hashJ(i * 5, j * 3) * 0.1));
    const hRaw = (a, b) => (i + a < 0 || j + b < 0 || i + a >= Wd || j + b >= Hd ? 1.9 : H[(j + b) * Wd + i + a]);
    const hi = (a, b) => (hRaw(a, b) > h + 0.01 ? 1 : 0);
    const ao = (a, b) => 1 - 0.16 * (hi(a, 0) + hi(0, b) + hi(a, b));
    tb.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], tc, ao(-1, 1), ao(1, 1), ao(1, -1), ao(-1, -1));
    for (const [di, dj, a, b2, n] of [[1, 0, [x1, z1], [x1, z0], [1, 0, 0]], [-1, 0, [x0, z0], [x0, z1], [-1, 0, 0]], [0, 1, [x0, z1], [x1, z1], [0, 0, 1]], [0, -1, [x1, z0], [x0, z0], [0, 0, -1]]]) {
      const nh = hRaw(di, dj);
      if (nh >= h) continue;
      const lo = Math.max(nh, -5);
      for (let y = h; y > lo + 0.001; y -= 0.5) {
        const y0 = Math.max(lo, y - 0.5);
        // the Temple's walls are the inside of a lighthouse: white and red bands
        const sc = kind === 'rock' && TMP ? ((Math.floor(y + 6) % 3 === 1) ? '#b8443a' : '#e2dbcf') : kind === 'rock' ? ROCK_SIDE[(Math.floor(y * 2) + i + j) % 3] : TMP ? '#8a90a8' : BEL ? '#3e4a47' : KIL ? '#3a2a26' : '#3a3644';
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
  // the Belfry's water: one sheet over the whole place, at the current level
  let waterSheet = null;
  if (WT) {
    waterSheet = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshLambertMaterial({ color: '#3f8a92', emissive: '#103a40', transparent: true, opacity: 0.62, depthWrite: false }));
    waterSheet.rotation.x = -Math.PI / 2; waterSheet.position.y = wl; waterSheet.renderOrder = 2; waterSheet.receiveShadow = true;
    root.add(waterSheet);
  }
  // the Kiln: molten glass in its channels, and hot floors that hurt if you stay on them
  const hotCells = new Map();
  let moltenMesh = null;
  if (KIL) {
    const mg = new THREE.BufferGeometry(), pos = [];
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
      if (K[j * Wd + i] === 'molten') { const x0 = X0 + i, z0 = Z0 + j, y = H[j * Wd + i] + 0.03; pos.push(x0, y, z0, x0, y, z0 + 1, x0 + 1, y, z0, x0 + 1, y, z0, x0, y, z0 + 1, x0 + 1, y, z0 + 1); }
      if (ch(i, j) === 'h') hotCells.set(j * Wd + i, 0);
    }
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    moltenMesh = new THREE.Mesh(mg, moltenMaterial()); moltenMesh.castShadow = false; root.add(moltenMesh);
  }
  // ----- decoration: torches, pillars, barnacles and crystals on the walls -----
  const props = new Batch(903), glow = new Batch(904);
  const solids = [];
  for (const t of torches) {
    props.push(t.x, t.y, t.z);
    props.box(0.5, 0.25, 0.5, '#5d5a66', 0, 0.12, 0); props.box(0.16, 1.4, 0.16, '#3a3a44', 0, 0.8, 0);
    props.box(0.44, 0.12, 0.44, '#2c2c36', 0, 1.5, 0);
    props.pop();
    glow.box(0.26, 0.34, 0.26, TMP ? '#bff6ff' : KIL ? '#ff7a2a' : '#ff9a3c', t.x, t.y + 1.72, t.z, { glow: 3.4, jitter: 0, rotY: 0.6 });
    glow.box(0.14, 0.24, 0.14, TMP ? '#ffffff' : '#ffd36b', t.x, t.y + 1.86, t.z, { glow: 4.2, jitter: 0, rotY: 1.2 });
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
    else if (KIL) glow.box(0.12, 0.3, 0.12, pick(['#ff7a2a', '#ffb04a', '#ff5a2a'], r), x, y + 0.2 + r() * 1.2, z, { glow: 1.8, rotZ: (r() - 0.5) * 0.6, jitter: 0 });
    else if (BEL) for (let k = 0; k < 3; k++) props.box(0.1, 0.5 + r() * 0.6, 0.1, pick(['#4a7a4a', '#5a8a52', '#3f6a44'], r), x + (r() - 0.5) * 0.5 * (1 - Math.abs(a)), y + 0.3, z + (r() - 0.5) * 0.5 * (1 - Math.abs(b)), { rotZ: (r() - 0.5) * 0.5 });
    else glow.box(0.14, 0.4, 0.14, pick(['#9ff3ff', '#c6f8ff', '#ff9fe0'], r), x, y + 0.2 + r() * 1.2, z, { glow: 1.6, rotZ: (r() - 0.5) * 0.6, jitter: 0 });
  }
  // ----- things you can use and things in your way -----
  const dyn = [];                      // solids that come and go (doors, gates, pots)
  const blocked = new Set();           // cells nothing can path through right now (burning oil)
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
      const col2 = kind === 'mirror' ? '#cdd8ea' : kind === 'boss' ? (BEL ? '#4a5a5a' : '#5a4a6a') : kind === 'key' ? '#6b4a33' : kind === 'wheel' ? '#5d3d26' : '#5d5a66';
      if (kind === 'wheel') for (let k = 0; k < 4; k++) bb.box(w + 0.04, 0.12, d + 0.04, '#3a3a44', 0, 0.3 + k * 0.5, 0);
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
  for (const [c, item] of [['k', 'smallKey'], ['K', 'bigKey'], ['T', D.tool || 'tether']]) for (const p of find(c)) {
    const cm = buildChest();
    cm.root.position.set(p.x, p.y, p.z); root.add(cm.root);
    if (item === 'tether' || item === 'jar' || item === 'glassblade') { cm.root.scale.setScalar(1.25); }
    solids.push({ x: p.x, z: p.z, r: 0.55, h: 0.9 });
    chests.push({ id: c + p.i + '_' + p.j, item, x: p.x, z: p.z, y: p.y, open: false, ...cm });
  }
  const keepsakes = [];
  const ksKind = D.keepsake || 'cup';
  for (const p of find('c')) { const m = buildKeepsake(ksKind); m.position.set(p.x, p.y, p.z); root.add(m); keepsakes.push({ id: ksKind, kind: ksKind, x: p.x, z: p.z, y: p.y, m, taken: false }); }
  // ----- the Temple's workings: lamps and braziers, the glass and your twin behind it, and your reflection -----
  const lamps = [];
  let twin = null, hunter = null;
  const plates = [], mirrorDoors = TMP ? doorsOf('Q', 'mirror') : [];
  const HUNT = D.hunter || {};
  const glassMat = (col, op) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.18, roughness: 0.15, metalness: 0.55, transparent: true, opacity: op });
  // a person made of mirror: your own shape, in silver (your twin) or dark glass (your reflection)
  function mirrorPerson(col, op, eye) {
    const pm = buildPlayer();
    const mat = glassMat(col, op);
    pm.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    if (eye) for (const e of pm.eyes || []) e.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(eye).multiplyScalar(2.2) }); });
    root.add(pm.root);
    return pm;
  }
  if (TMP) {
    // lamps: a stone stand and a bowl; lit, a cold white flame and a ring of light on the floor that your reflection won't cross
    const lampBits = [['N', false, false], ['U', true, false], ['V', false, true]];
    for (const [c, lit, brazier] of lampBits) for (const p of find(c)) {
      const sb = brazier ? 1.25 : 1;
      props.push(p.x, p.y, p.z);
      props.box(0.62 * sb, 0.3, 0.62 * sb, '#9a96a6', 0, 0.15, 0, { top: '#b0acbb' }); props.box(0.26 * sb, 0.9, 0.26 * sb, '#7d7a8a', 0, 0.75, 0);
      props.box(0.78 * sb, 0.18, 0.78 * sb, '#c9a24a', 0, 1.25, 0); props.box(0.6 * sb, 0.14, 0.6 * sb, '#2a2838', 0, 1.36, 0);
      props.pop();
      const fb = new Batch(1300 + lamps.length);
      fb.box(0.34 * sb, 0.46 * sb, 0.34 * sb, '#bff6ff', 0, 0.23 * sb, 0, { glow: 3.2, jitter: 0, rotY: 0.6 });
      fb.box(0.18 * sb, 0.36 * sb, 0.18 * sb, '#ffffff', 0, 0.42 * sb, 0, { glow: 4.5, jitter: 0, rotY: 1.2 });
      const flame = fb.mesh(MAT.glow); flame.castShadow = false; flame.matrixAutoUpdate = true; flame.position.set(p.x, p.y + 1.43, p.z); root.add(flame);
      const ring = new THREE.Mesh(new THREE.CircleGeometry(HUNT.lampR || 3.4, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff6ff'), transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.03, p.z); root.add(ring);
      solids.push({ x: p.x, z: p.z, r: 0.4 * sb, h: 1.5 });
      const L = { x: p.x, z: p.z, y: p.y, lit, brazier, t: 0, flame, ring, k: lit ? 1 : 0, i: lamps.length };
      lamps.push(L);
      targets.push({ id: 'lamp', lamp: L, x: p.x, y: p.y + 1.4, z: p.z, r: 0.55, h: 1.2, get on() { return L.lit; }, onHit: () => lightLamp(L) });
    }
    // the glass down the middle of the mirror room
    const gb = new Batch(1290);
    for (const p of find('Z')) { gb.box(0.18, 2.6, 1.0, '#dfe8f4', p.x, p.y + 1.3, p.z, { jitter: 0 }); solids.push({ x: p.x, z: p.z, r: 0.5, h: 4 }); }
    const gm = gb.mesh(); gm.material = glassMat('#cfe0f4', 0.35); gm.castShadow = false; root.add(gm);
    // the plates
    for (const p of find('q')) {
      const pb = new Batch(1295 + plates.length);
      pb.box(0.86, 0.12, 0.86, '#c9a24a', 0, 0.06, 0, { top: '#e0b85a' }); pb.box(0.5, 0.13, 0.5, '#bff6ff', 0, 0.07, 0, { glow: 0.8, jitter: 0 });
      const m = pb.mesh(); m.matrixAutoUpdate = true; m.position.set(p.x, p.y, p.z); root.add(m);
      plates.push({ x: p.x, z: p.z, m, down: false, twin: p.i < (D.mirror ? D.mirror.axis : 0) });
    }
    if (D.mirror) {
      const J = find('J')[0], M = D.mirror;
      twin = { pm: mirrorPerson('#dfe8f4', 0.55, '#9ff3ff'), x: J.x, z: J.z, jx: J.x, jz: J.z, on: false, lx: 0, lz: 0, told: false,
        ax: wx(M.axis), box: { x0: wx(M.axis + 1) - 0.5, x1: wx(M.x1) + 0.5, z0: wz(M.z0) - 0.5, z1: wz(M.z1) + 0.5 } };
      twin.pm.root.position.set(J.x, J.y, J.z); twin.pm.root.visible = false;
    }
    const Y = find('Y')[0];
    if (Y) hunter = { pm: mirrorPerson('#2a2846', 0.82, '#ff9fe0'), awake: false, wake: Y, path: [], tNow: 0, delay: HUNT.delay || 3.6, rec: 0, x: 0, z: 0, y: 0, vis: 0, off: false };
    if (hunter) hunter.pm.root.visible = false;
  }
  function lightLamp(L, quiet) {
    if (L.lit && !L.brazier) return false;
    L.lit = true; L.t = L.brazier ? (state.burnFor || 9) : 0;
    if (!quiet && hooks) { hooks.sound.sfx('beacon'); hooks.onEvent('lamp', L); }
    return true;
  }
  // a lit lamp (or brazier) whose light reaches (x, z)
  const lampAt = (x, z, pad = 0) => lamps.find((L) => L.lit && Math.hypot(x - L.x, z - L.z) < (HUNT.lampR || 3.4) + pad) || null;
  function resetHunter() {
    if (!hunter) return;
    hunter.path.length = 0; hunter.tNow = 0; hunter.delay = HUNT.delay || 3.6; hunter.vis = 0; hunter.pm.root.visible = false;
  }
  function updateTemple(dt, t, P) {
    for (const L of lamps) {
      if (L.brazier && L.lit) { L.t -= dt; if (L.t <= 0) { L.lit = false; if (hooks) hooks.sound.sfx('hiss'); } }
      L.k = lerp(L.k, L.lit ? 1 : 0, Math.min(1, dt * 6));
      L.flame.visible = L.k > 0.05;
      const fl = (0.85 + Math.sin(t * 13 + L.i) * 0.1) * L.k * (L.brazier && L.lit && L.t < 2 ? 0.6 + Math.sin(t * 20) * 0.4 : 1);
      L.flame.scale.set(fl, fl * (1 + Math.sin(t * 9 + L.i) * 0.12), fl); L.flame.rotation.y = t * 0.7;
      L.ring.material.opacity = 0.09 * L.k + (L.lit ? Math.sin(t * 2 + L.i) * 0.015 : 0);
    }
    // the plates and your twin
    if (twin) {
      const b = twin.box, inside = P.x > b.x0 && P.x < b.x1 && P.z > b.z0 && P.z < b.z1;
      if (inside && !twin.on) { twin.on = true; twin.x = twin.jx; twin.z = twin.jz; twin.lx = P.x; twin.lz = P.z; twin.pm.root.visible = true; if (!twin.told && hooks) { twin.told = true; hooks.onEvent('twin'); } }
      if (!inside && twin.on) { twin.on = false; }
      if (twin.on) {
        // it moves as you do, the other way round across the glass; its own walls stop it
        const dx = -(P.x - twin.lx), dz = P.z - twin.lz;
        twin.lx = P.x; twin.lz = P.z;
        const ok = (x, z) => x < twin.ax - 0.45 && terrainOk(x, z, hAt(...cellOf(twin.x, twin.z)), 0.28) && !solidAt(x, z, 0.28);
        const n = Math.ceil(Math.hypot(dx, dz) / 0.15) || 1;
        for (let k = 0; k < n; k++) { const sx = dx / n, sz = dz / n; if (ok(twin.x + sx, twin.z + sz)) { twin.x += sx; twin.z += sz; } else if (ok(twin.x + sx, twin.z)) twin.x += sx; else if (ok(twin.x, twin.z + sz)) twin.z += sz; }
        const pm = twin.pm;
        pm.root.position.set(twin.x, cellH(twin.x, twin.z), twin.z);
        pm.root.rotation.y = -P.face;
        if (P.model) { pm.legL.rotation.x = P.model.legL.rotation.x; pm.legR.rotation.x = P.model.legR.rotation.x; pm.armL.rotation.x = P.model.armR.rotation.x; pm.armR.rotation.x = P.model.armL.rotation.x; }
      }
      twin.pm.root.visible = twin.on;
      const tx = twin.on ? twin.x : 1e9, tz = twin.on ? twin.z : 1e9;
      let all = plates.length > 0;
      for (const pl of plates) {
        const down = pl.twin ? Math.hypot(tx - pl.x, tz - pl.z) < 0.6 : Math.hypot(P.x - pl.x, P.z - pl.z) < 0.6;
        if (down !== pl.down) { pl.down = down; if (hooks) hooks.sound.sfx(down ? 'click' : 'tick'); }
        pl.m.position.y = lerp(pl.m.position.y, (down ? -0.08 : 0) + cellH(pl.x, pl.z), Math.min(1, dt * 12));
        if (!down) all = false;
      }
      if (all && mirrorDoors.some((d) => !d.open)) { for (const d of mirrorDoors) openDoor(d); if (hooks) hooks.onEvent('mirrorOpen'); }
    }
    // your reflection: it walks your path a few seconds behind; it won't walk into lamplight
    const H2 = hunter;
    if (H2 && !state.bossDone) {
      const arena = bossAt && P.z < bossAt.z + 7.5;
      if (!H2.awake && Math.hypot(P.x - H2.wake.x, P.z - H2.wake.z) < 1.6) { H2.awake = true; H2.path.length = 0; H2.tNow = 0; if (hooks) hooks.onEvent('wake'); }
      if (H2.awake && !arena && P.state !== 'dead') {
        H2.tNow += dt;
        H2.rec -= dt;
        if (H2.rec <= 0) { H2.rec = 0.05; H2.path.push({ t: H2.tNow, x: P.x, z: P.z, y: P.y, f: P.face }); if (H2.path.length > 900) H2.path.shift(); }
        // lamplight on where it's about to step pushes it back along the way; out of it, it closes the gap again
        const at = (tt) => { const pth = H2.path; if (!pth.length) return null; let lo = 0, hi = pth.length - 1; if (tt <= pth[0].t) return pth[0]; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pth[mid].t <= tt) lo = mid; else hi = mid - 1; } return pth[lo]; };
        const s0 = at(H2.tNow - H2.delay);
        if (s0 && lampAt(s0.x, s0.z)) H2.delay += dt * 2.2;
        else H2.delay = Math.max(HUNT.delay || 3.6, H2.delay - dt * 0.35);
        const s = at(H2.tNow - H2.delay);
        const show = !!s && H2.tNow > H2.delay;
        H2.vis = lerp(H2.vis, show ? 1 : 0, Math.min(1, dt * 3));
        if (s) {
          H2.x = s.x; H2.z = s.z; H2.y = s.y;
          const pm = H2.pm;
          pm.root.visible = H2.vis > 0.05;
          pm.root.position.set(s.x, s.y, s.z); pm.root.rotation.y = s.f;
          const ph = t * 9, mv = 0.6;
          pm.legL.rotation.x = Math.sin(ph) * mv; pm.legR.rotation.x = -Math.sin(ph) * mv; pm.armL.rotation.x = -Math.sin(ph) * 0.5; pm.armR.rotation.x = Math.sin(ph) * 0.5;
          if (show && Math.random() < dt * 8 && hooks) hooks.fx && hooks.fx.spark && hooks.fx.spark(s.x, s.y + 0.1, s.z);
          // it caught you: it hurts, and it falls further back
          if (show && Math.hypot(P.x - s.x, P.z - s.z) < (HUNT.catchR || 0.85) && hooks) { hooks.onEvent('caught', { x: s.x, z: s.z }); H2.delay += HUNT.push || 2.6; }
        }
      } else if (arena && H2.awake) { H2.vis = lerp(H2.vis, 0, Math.min(1, dt * 3)); H2.pm.root.visible = H2.vis > 0.05; }
    } else if (H2) H2.pm.root.visible = false;
  }
  // ----- the Belfry's workings: the Tide Bell, floating crates, burning oil, the basin and its wheel door -----
  const crates = [];
  for (const k of crateCells) {
    const cb = new Batch(960 + crates.length);
    cb.box(0.96, 1.0, 0.96, '#7a5236', 0, -0.5, 0, { top: '#8f6440' });
    cb.box(1.0, 0.1, 1.0, '#5d3d26', 0, -0.12, 0); cb.box(1.0, 0.1, 1.0, '#5d3d26', 0, -0.82, 0);
    cb.box(0.08, 0.8, 1.0, '#5d3d26', 0, -0.5, 0, { rotZ: 0.8, jitter: 0 });
    const m = cb.mesh(); m.matrixAutoUpdate = true;
    const i = k % Wd, j = Math.floor(k / Wd);
    m.position.set(wx(i), crateTop(), wz(j)); root.add(m);
    crates.push({ m, i, j, ph: hashJ(i, j) * 6 });
  }
  let bellT = null;
  const bellAt = find('W')[0];
  if (bellAt) {
    // a pillar in the middle of the sunken hall, and on it the Tide Bell in a little iron frame
    const y0 = H[bellAt.j * Wd + bellAt.i];
    props.box(1.1, 3.4 - y0 + 0.2, 1.1, ROCK_SIDE[0], bellAt.x, (y0 + 1.6) / 2, bellAt.z, { top: LEDGE[0] });
    props.box(1.3, 0.3, 1.3, ROCK_SIDE[1], bellAt.x, 1.65, bellAt.z);
    for (const sx of [-0.5, 0.5]) props.box(0.1, 1.5, 0.1, '#3a3a44', bellAt.x + sx, 2.5, bellAt.z);
    props.box(1.1, 0.12, 0.12, '#3a3a44', bellAt.x, 3.25, bellAt.z);
    const bb = new Batch(970);
    bb.box(0.6, 0.15, 0.6, '#9a6a32', 0, -0.62, 0); bb.box(0.52, 0.4, 0.52, '#b07a3a', 0, -0.36, 0, { top: '#c88a43' }); bb.box(0.36, 0.2, 0.36, '#c88a43', 0, -0.06, 0);
    bb.box(0.12, 0.2, 0.12, '#5a4a3a', 0, -0.72, 0);
    const bm = bb.mesh(); bm.matrixAutoUpdate = true; bm.position.set(bellAt.x, 3.2, bellAt.z); root.add(bm);
    glow.box(0.2, 0.2, 0.06, '#9ff3ff', bellAt.x, 1.0, bellAt.z + 0.56, { glow: 1.8, jitter: 0 });
    solids.push({ x: bellAt.x, z: bellAt.z, r: 0.62, h: 6 });
    bellT = { id: 'bell', x: bellAt.x, y: 0.3, z: bellAt.z, r: 0.85, h: 3.4, m: bm, swing: 0, cd: 0 };
    bellT.onHit = () => {
      if (bellT.cd > 0) return;
      bellT.cd = 1.4; bellT.swing = 1;
      setLevel(wlTo > (WT.high + WT.low) / 2 ? 'low' : 'high');
      if (hooks) { hooks.sound.sfx('bellRing'); hooks.sound.sfx('chime'); hooks.shake(0.25); hooks.onEvent('tide', state.level); }
    };
    targets.push(bellT);
  }
  // burning oil across a corridor: solid while it burns; water puts it out
  const fires = [];
  for (const p of find('i')) {
    const fb = new Batch(980 + fires.length), fg = new Batch(990 + fires.length);
    fb.box(0.96, 0.06, 0.96, '#1a1614', 0, 0.03, 0);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + p.i; fg.box(0.22, 0.6 + k * 0.15, 0.22, k % 2 ? '#ff7a2a' : '#ffb04a', Math.cos(a) * 0.22, 0.35, Math.sin(a) * 0.22, { glow: 3.2, jitter: 0, rotY: a }); }
    fg.box(0.14, 0.9, 0.14, '#ffe08a', 0, 0.5, 0, { glow: 4, jitter: 0 });
    const m = fb.mesh(); m.matrixAutoUpdate = true; m.position.set(p.x, p.y, p.z); root.add(m);
    const gm2 = fg.mesh(MAT.glow); gm2.matrixAutoUpdate = true; gm2.castShadow = false; gm2.position.set(p.x, p.y, p.z); root.add(gm2);
    const sd = { x: p.x, z: p.z, r: 0.55, h: 1.2, fire: true };
    dyn.push(sd); blocked.add(p.j * Wd + p.i);
    fires.push({ x: p.x, z: p.z, y: p.y, i: p.i, j: p.j, m, flame: gm2, sd, out: false });
  }
  const fireLight = fires.length ? (() => { const l = new THREE.PointLight('#ff8a3a', 6, 8, 1.6); const c = fires[Math.floor(fires.length / 2)]; l.position.set(c.x, c.y + 1.2, c.z); root.add(l); return l; })() : null;
  function putOut(f, quiet) {
    if (f.out) return;
    f.out = true; f.flame.visible = false;
    const k = dyn.indexOf(f.sd); if (k >= 0) dyn.splice(k, 1);
    blocked.delete(f.j * Wd + f.i);
    if (!quiet && hooks) hooks.sound.sfx('hiss');
  }
  // the basin: a stone bowl on a spout; pour water in and the wheel door beside it turns open
  const basinAt = find('o')[0];
  let basinWater = null;
  if (basinAt) {
    props.push(basinAt.x, basinAt.y, basinAt.z);
    props.box(1.0, 0.5, 1.0, ROCK_SIDE[1], 0, 0.25, 0, { top: '#2c3634' }); props.box(1.2, 0.12, 1.2, LEDGE[0], 0, 0.56, 0);
    props.box(0.2, 0.9, 0.2, '#b07a3a', 0, 1.0, -0.42); props.box(0.2, 0.14, 0.4, '#b07a3a', 0, 1.4, -0.3);
    props.pop();
    const wm2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.8), new THREE.MeshLambertMaterial({ color: '#4fa8c0', emissive: '#123a48', transparent: true, opacity: 0.8 }));
    wm2.position.set(basinAt.x, basinAt.y + 0.52, basinAt.z); wm2.visible = false; root.add(wm2);
    basinWater = wm2;
    solids.push({ x: basinAt.x, z: basinAt.z, r: 0.6, h: 0.7 });
  }
  const wheelDoors = doorsOf('Q', 'wheel');
  // a water wheel set in the wall over the wheel door; it turns when the basin's full
  let wheel = null;
  if (wheelDoors.length) {
    const dr = wheelDoors[0];
    const wb = new Batch(975);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; wb.box(0.16, 0.9, 0.12, '#6b4a33', Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0, { rotZ: a, jitter: 0 }); }
    wb.box(0.3, 0.3, 0.2, '#3a3a44', 0, 0, 0);
    wheel = wb.mesh(); wheel.matrixAutoUpdate = true; wheel.position.set(dr.x, dr.y + 2.6, dr.z - 0.4); root.add(wheel);
  }
  function fillBasin(quiet) {
    if (state.basin) return;
    state.basin = true;
    if (basinWater) basinWater.visible = true;
    for (const dr of wheelDoors) openDoor(dr, quiet);
  }
  // somewhere to fill the Jar: a pool, or the hall's flood while the water's high
  function waterNear(x, z, reach) {
    for (const p of pools) if (Math.hypot(x - p.x, z - p.z) < reach + 0.5) return true;
    if (!WT) return false;
    const [ci, cj] = cellOf(x, z);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < Wd && j < Hd && wl - H[j * Wd + i] > 0.3 && Math.hypot(di, dj) <= reach + 0.5) return true; }
    return false;
  }
  const pools = find('~');
  // water poured out of the Jar at a point: what it reaches
  function pour(x, z, rad) {
    const out = { fire: 0, basin: false };
    for (const f of fires) if (!f.out && Math.hypot(x - f.x, z - f.z) < rad + 0.9) {
      // the whole line of burning oil goes out together
      for (const g of fires) if (!g.out && Math.abs(g.j - f.j) <= 1 && Math.abs(g.i - f.i) <= 3) { putOut(g); out.fire++; }
    }
    if (basinAt && !state.basin && Math.hypot(x - basinAt.x, z - basinAt.z) < rad + 0.8) { fillBasin(); out.basin = true; }
    if (out.fire) state.doused = true;
    return out;
  }
  function setLevel(name, now) {
    if (!WT) return;
    state.level = name; wlTo = WT[name];
    if (now) { wl = wlTo; syncWater(); }
  }
  function syncWater() {
    if (waterSheet) waterSheet.position.y = wl;
    const ct = crateTop();
    for (const c of crates) c.m.position.y = ct;
  }
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
  for (const [k2] of hotCells) { const i = k2 % Wd, j = Math.floor(k2 / Wd); for (let q = 0; q < 2; q++) glow.box(0.06, 0.02, 0.5 + r() * 0.4, pick(['#ff7a2a', '#ffb04a'], r), wx(i) + (r() - 0.5) * 0.6, 0.012, wz(j) + (r() - 0.5) * 0.6, { rotY: r() * 3, glow: 1.6, jitter: 0, ao: 1 }); }
  const pm = props.mesh(); root.add(pm);
  const gm = glow.mesh(MAT.glow); gm.castShadow = false; root.add(gm);
  // the guardian's pool: a ring of water round the rock she sits on
  const bossAt = find('X')[0];
  const exits = find('E');
  const start = find('P')[0];
  // the way out after the guardian: a column of light in her chamber
  const exitLight = (() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ff3ff').multiplyScalar(1.4), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    // the way out: in the Temple, off to one side of the hall (its door is where the light would otherwise stand)
    m.position.set(bossAt.x + (TMP ? 3.5 : 0), 4.5, bossAt.z + (TMP ? 4.5 : 5)); m.visible = false; root.add(m);
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
  // too deep to wade: sunken floor under high water (a crate floating there is something to stand on)
  const deepCell = (i, j) => WT && i >= 0 && j >= 0 && i < Wd && j < Hd && !crateCells.has(j * Wd + i) && wl - H[j * Wd + i] > 0.75;
  function deepAt(x, z) { const [i, j] = cellOf(x, z); return deepCell(i, j); }
  const moltenAt = (x, z) => { const [i, j] = cellOf(x, z); return i >= 0 && j >= 0 && i < Wd && j < Hd && K[j * Wd + i] === 'molten'; };
  function terrainOk(x, z, y, rad, stepUp = 0.55) {
    if (WT && deepAt(x, z)) return false;
    if (KIL) for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if (moltenAt(x + ox, z + oz)) return false;
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
  const walkCell = (i, j) => { const c = K[j * Wd + i]; return c !== 'molten' && (c === 'floor' || c === 'ledge' || c === 'water' || c === 'sunk') && !deepCell(i, j) && !blocked.has(j * Wd + i); };
  // the nearest place to stand that isn't under deep water (the tide rose around you)
  function nearestDry(x, z) {
    const [ci, cj] = cellOf(x, z);
    for (let rr = 1; rr < 14; rr++) {
      let best = null, bd = 1e9;
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= Wd || j >= Hd || !walkCell(i, j) || solidAt(wx(i), wz(j), 0.35)) continue;
        const d = Math.hypot(di, dj); if (d < bd) { bd = d; best = { x: wx(i), z: wz(j) }; }
      }
      if (best) return best;
    }
    return { x: start.x, z: start.z };
  }
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
  const state = { ambushDone: false, sealed: false, keys: 0, bigKey: false, bossDone: false, opened: {}, doorsOpen: {}, seen: new Uint8Array(Wd * Hd), level: WT ? WT.start : null, doused: false, basin: false, burnFor: 9 };
  // a journey saved earlier puts the caves back as they were
  function restore(sv) {
    if (!sv) return;
    Object.assign(state, { ambushDone: !!sv.ambushDone, keys: sv.keys || 0, bigKey: !!sv.bigKey, bossDone: !!sv.bossDone, opened: sv.opened || {}, doorsOpen: sv.doorsOpen || {}, visited: !!sv.visited });
    if (WT && sv.level) setLevel(sv.level, true);
    if (sv.doused) { state.doused = true; for (const f of fires) putOut(f, true); }
    if (sv.basin) fillBasin(true);
    if (sv.slabs) for (const [i, j] of sv.slabs) solidify(wx(i), wz(j), true);
    for (const c of chests) if (state.opened[c.id]) { c.open = true; c.lid.rotation.x = -1.9; }
    doors.forEach((dr, k) => { if (state.doorsOpen[k]) { openDoor(dr, true); dr.k = 1; } });
    if (state.doorsOpen.lever && leverT) { leverT.on = true; leverT.m.rotation.z = -0.7; }
    if (sv.seen) { const b = atob(sv.seen); for (let k = 0; k < Math.min(b.length, state.seen.length); k++) state.seen[k] = b.charCodeAt(k); }
    if (sv.cup) for (const kp of keepsakes) { kp.taken = true; kp.m.visible = false; }
    if (state.bossDone) exitLight.visible = true;
    // the Temple's lamps you lit stay lit
    if (sv.lit) for (const k of sv.lit) if (lamps[k] && !lamps[k].brazier) { lamps[k].lit = true; lamps[k].k = 1; }
    if (sv.hunterAwake && hunter) hunter.awake = true;
  }
  function snapshot() {
    const doorsOpen = {};
    doors.forEach((dr, k) => { if (dr.open && dr.kind !== 'bars') doorsOpen[k] = 1; });
    if (leverT && leverT.on) doorsOpen.lever = 1;
    let seen = ''; for (let k = 0; k < state.seen.length; k++) seen += String.fromCharCode(state.seen[k]);
    return { ambushDone: state.ambushDone, keys: state.keys, bigKey: state.bigKey, bossDone: state.bossDone, opened: state.opened, doorsOpen, seen: btoa(seen), cup: keepsakes.every((k) => k.taken), visited: !!state.visited, level: state.level, doused: state.doused, basin: state.basin, slabs: state.slabs || [], lit: lamps.filter((L) => L.lit && !L.brazier).map((L) => L.i), hunterAwake: !!(hunter && hunter.awake) };
  }
  function attach(h) { hooks = h; }
  // the creatures placed in the map, made when you arrive
  function populate() {
    const list = [];
    for (const [c, kind] of [['s', 'shardmite'], ['m', 'mirrorpuddle'], ['f', 'bellfish'], ['n', 'barnacle'], ['u', 'bubblebishop'], ['g', 'rustgill'], ['M', 'mudmimic'], ['O', 'molten'], ['w', 'hound'], ['e', 'wisp'], ['y', 'sentinel']]) for (const p of find(c)) {
      if (state.ambushDone && inAmb(p.x, p.z)) continue;
      list.push({ kind, x: p.x, z: p.z, amb: inAmb(p.x, p.z) });
    }
    return list;
  }
  let revealT = 0;
  function update(dt, t, P) {
    carry.position.set(P.x, P.y + 1.6, P.z + 0.3);
    if (TMP) updateTemple(dt, t, P);
    // the water following the Tide Bell, the crates riding it
    if (WT) {
      if (wl !== wlTo) { wl = wlTo > wl ? Math.min(wlTo, wl + dt * 0.9) : Math.max(wlTo, wl - dt * 0.9); }
      if (waterSheet) waterSheet.position.y = wl + Math.sin(t * 1.3) * 0.02;
      const ct = crateTop();
      for (const c of crates) { c.m.position.y = ct + (wl > -1.4 ? Math.sin(t * 1.6 + c.ph) * 0.03 : 0); c.m.rotation.z = wl > -1.4 ? Math.sin(t * 1.1 + c.ph) * 0.03 : 0; }
    }
    if (bellT) { bellT.cd = Math.max(0, bellT.cd - dt); bellT.swing *= Math.exp(-dt * 1.4); bellT.m.rotation.z = Math.sin(t * 7) * 0.5 * bellT.swing; }
    for (const f of fires) if (!f.out) { f.flame.scale.y = 1 + Math.sin(t * 13 + f.i) * 0.15; f.flame.rotation.y = t * 0.8 + f.i; }
    if (fireLight) fireLight.intensity = fires.some((f) => !f.out) ? 6 + Math.sin(t * 15) * 0.8 : 0;
    if (wheel && state.basin) wheel.rotation.z -= dt * 1.4;
    for (const [k2, v] of hotCells) if (v > 0) hotCells.set(k2, Math.max(0, v - dt));
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
    for (const dr of wheelDoors) if (!dr.open && !dr.told && dr.cells.some((c) => Math.hypot(P.x - c.x, P.z - c.z) < 1.6)) { dr.told = true; hooks.onEvent('wheelHint'); }
    for (const f of fires) if (!f.out && !f.told && Math.hypot(P.x - f.x, P.z - f.z) < 2.0) { f.told = true; hooks.onEvent('fireHint'); }
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
  // a Molten Puddle cooled where it lay: that cell of the river sets into a slab of dark glass you can stand on
  const slabs = [];
  function solidify(x, z, quiet) {
    const [i, j] = cellOf(x, z), k = j * Wd + i;
    if (i < 0 || j < 0 || i >= Wd || j >= Hd || K[k] !== 'molten') return false;
    K[k] = 'floor'; H[k] = 0;
    const sb = new Batch(1300 + slabs.length);
    sb.box(0.98, 0.5, 0.98, '#3a2a30', 0, -0.25, 0, { top: '#5a4048' }); sb.box(0.6, 0.04, 0.6, '#ff9a5a', 0, 0.01, 0, { glow: 0.6 });
    const m = sb.mesh(); m.position.set(wx(i), 0, wz(j)); root.add(m);
    slabs.push({ i, j }); state.slabs = slabs.map((s2) => [s2.i, s2.j]);
    return true;
  }
  const hotAt = (x, z) => { const [i, j] = cellOf(x, z); const v = hotCells.get(j * Wd + i); return v !== undefined && v <= 0; };
  function cool(x, z, rad, sec) { let n2 = 0; for (const [k2] of hotCells) { const i = k2 % Wd, j = Math.floor(k2 / Wd); if (Math.hypot(wx(i) - x, wz(j) - z) < rad + 0.5) { hotCells.set(k2, sec); n2++; } } return n2; }
  // the map: heights and kinds per cell (the same shape the island's map uses), plus what you've seen
  const mapInfo = {
    N: Math.max(Wd, Hd), H0: X0, cave: true,
    H: (() => { const n = Math.max(Wd, Hd), a = new Float32Array(n * n).fill(3.6); for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) a[j * n + i] = H[j * Wd + i]; return a; })(),
    K: (() => { const n = Math.max(Wd, Hd), a = new Array(n * n).fill('rock'); for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) a[j * n + i] = K[j * Wd + i] === 'sunk' ? 'water' : K[j * Wd + i]; return a; })(),
    boxes: [], places: [], dock: { x0: 0, x1: 0, z0: 0, z1: 0 },
    seen: state.seen, seenW: Wd,
  };
  return {
    name: D.theme || 'caves', D, root, groundAt, walkable, deepAt, solidify, hotAt, cool, moltenAt, hotCells: () => [...hotCells.entries()].filter(([, v]) => v <= 0).map(([k2]) => ({ x: wx(k2 % Wd), z: wz(Math.floor(k2 / Wd)), y: 0 })), nearestDry, waterNear, pour, setLevel, get level() { return wl; }, bell: bellT, terrainOk, solidAt, shotBlocked, targetAt, targets, findPath, clearLine, update, fx: {},
    dummies: [], solids: dyn, seep: null, shardOn: () => false, setSeepPower() {}, setNight() {},
    spawn: { x: start.x, z: start.z, y: start.y },
    sunDir: new V3(0.3, 1, 0.45).normalize(),
    get chests_open() { return chests.filter((c) => c.open).length; }, chests, exitLight,
    lamps, lightLamp, lampAt, resetHunter, get hunter() { return hunter; }, get twin() { return twin; }, plates, setBurn: (sec) => { state.burnFor = sec; }, boss: bossAt, rings, ringLanding, chestNear, openChest, breakPot, guardianDown, populate, attach, restore, snapshot, state, mapInfo, keepsakes,
    sealed: () => state.sealed,
    contain: (x, z) => !state.sealed || inAmb(x, z),
    onFell() { if (state.sealed) { state.sealed = false; for (const dr of combatDoors) openDoor(dr, true); } },
    light: TMP ? { hemiSky: '#c8d4f0', hemiGround: '#1a1830', hemiI: 1.45, sun: '#e0e8ff', sunI: 1.1, fog: '#0c0b1c', fogNear: 20, fogFar: 56, grade: [0.97, 0.99, 1.05], exposure: 1.15 }
      : KIL ? { hemiSky: '#ffb08a', hemiGround: '#2a1410', hemiI: 1.3, sun: '#ffc8a0', sunI: 1.0, fog: '#1e0e0a', fogNear: 22, fogFar: 58, grade: [1.06, 0.98, 0.94], exposure: 1.1 }
      : BEL ? { hemiSky: '#a8d0d0', hemiGround: '#1e2a2a', hemiI: 1.3, sun: '#c8e4e0', sunI: 1.0, fog: '#0e1a1c', fogNear: 22, fogFar: 58, grade: [0.97, 1.0, 1.02], exposure: 1.12 }
      : { hemiSky: '#a8b0d8', hemiGround: '#2a2434', hemiI: 1.25, sun: '#c8d4f0', sunI: 1.0, fog: '#14111f', fogNear: 22, fogFar: 58, grade: [0.98, 0.98, 1.04], exposure: 1.12 },
  };
}

// ===========================================================================
// A town: Brinemoor, a fishing town on stilts over the town it used to be. Built from a character map
// (see BRINEMOOR in data.js). Boardwalks ring a drowned square that the tide covers and uncovers; the
// Belfry's tower rises out of the middle of it.
// ===========================================================================
const TOWN_H = { '~': -2.4, ',': 0.85, '=': 1.5, D: 1.5, P: 1.5, '.': -0.4, 1: 0.08, 2: 0.56, 3: 1.03, g: 1.95, '#': 3.2, H: 1.5, R: -0.4, Z: -0.4, L: 1.95, T: 1.5, l: 1.5, b: 1.5, h: 1.5, j: 1.5, q: 1.5, B: -0.4, J: -0.4, M: -0.4, m: -0.4, f: -0.4 };
export function buildTown(root, D) {
  const r = rng(9191);
  const rows = D.map, Wd = rows[0].length, Hd = rows.length;
  const X0 = -Wd / 2, Z0 = -Hd / 2;
  const wx = (i) => X0 + i + 0.5, wz = (j) => Z0 + j + 0.5;
  const cellOf = (x, z) => [Math.floor(x - X0), Math.floor(z - Z0)];
  const ch = (i, j) => (i < 0 || j < 0 || i >= Wd || j >= Hd ? '~' : rows[j][i]);
  const H = new Float32Array(Wd * Hd), KD = new Array(Wd * Hd), block = new Uint8Array(Wd * Hd);
  // a map can set its own heights (Bell Rock's terraces); everything else is Brinemoor's
  const TH = Object.assign({}, TOWN_H, D.heights || {});
  const rocky = !!D.heights;
  const CIN = D.theme === 'cinder';
  // Cinderglass: black sand, basalt underfoot, molten glass, hot ground
  const kindOf = CIN
    ? (c) => (c === '~' ? 'sea' : c === ',' ? 'sand' : c === 'v' ? 'molten' : c === 'h' ? 'hot' : c === 'D' || c === 'P' ? 'deck' : 'stone')
    : (c) => (c === '~' ? 'sea' : c === ',' || c === 'r' ? 'sand' : c === 'g' || c === 'L' || (rocky && 'm456K'.includes(c)) ? 'grass' : c === '#' ? 'rock' : '.JMmfBRZ123'.includes(c) ? 'street' : 'deck');
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const c = ch(i, j), k = j * Wd + i;
    if (TH[c] !== undefined) H[k] = TH[c];
    else {
      // a creature's letter (or anything without a height of its own) stands on the ground around it
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b2]) => TH[ch(i + a, j + b2)]).filter((v) => v !== undefined);
      const count = {}; let best = 0, bh = 1.5;
      for (const v of near) { count[v] = (count[v] || 0) + 1; if (count[v] > best) { best = count[v]; bh = v; } }
      H[k] = bh;
    }
    KD[k] = kindOf(c);
    if ('HRZL#Kr'.includes(c) || (CIN && 'vFGU'.includes(c))) block[k] = 1;
  }
  const find = (c) => { const out = []; for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) if (rows[j][i] === c) out.push({ i, j, x: wx(i), z: wz(j), y: H[j * Wd + i] }); return out; };
  const hAt = (i, j) => (i < 0 || j < 0 || i >= Wd || j >= Hd ? -2.4 : H[j * Wd + i]);
  const cellH = (x, z) => { const [i, j] = cellOf(x, z); return hAt(i, j); };
  // rectangles of one letter (houses, ruins, the tower)
  function rects(c) {
    const seen = new Set(), out = [];
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
      if (rows[j][i] !== c || seen.has(j * Wd + i)) continue;
      let i1 = i; while (ch(i1 + 1, j) === c) i1++;
      let j1 = j; while ([...Array(i1 - i + 1).keys()].every((d) => ch(i + d, j1 + 1) === c)) j1++;
      for (let jj = j; jj <= j1; jj++) for (let ii = i; ii <= i1; ii++) seen.add(jj * Wd + ii);
      out.push({ i0: i, j0: j, i1, j1, x0: X0 + i, z0: Z0 + j, x1: X0 + i1 + 1, z1: Z0 + j1 + 1, x: X0 + (i + i1 + 1) / 2, z: Z0 + (j + j1 + 1) / 2, w: i1 - i + 1, d: j1 - j + 1 });
    }
    return out;
  }

  // ----- the ground: decks of planks, a cobbled square, sand, a green hill, and the sea bed -----
  const tb = new Batch(1101), tc = new THREE.Color();
  const BASALT = ['#5c5456', '#645a5a', '#565052', '#6a6060'], ASH = ['#3a3438', '#423a3c'], HOT = ['#5a3028', '#64362c'];
  const PLANK = ['#a6764d', '#9a6c46', '#b07f54', '#94683f'], COBBLE = ['#a39a8a', '#ada393', '#978f80', '#9d9586'], SAND = ['#e6d2a2', '#dfc999'], GRASS = ['#6aa24a', '#62994a', '#72a852'];
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const k = j * Wd + i, h = H[k], kind = KD[k];
    const x0 = X0 + i, z0 = Z0 + j, x1 = x0 + 1, z1 = z0 + 1;
    const nn = noise(i * 0.5, j * 0.5);
    let base = kind === 'deck' ? PLANK[(j * 3 + (i >> 1)) % 4] : kind === 'street' ? COBBLE[Math.floor((nn * 0.7 + hashJ(i, j) * 0.3) * 4) % 4] : kind === 'sand' ? (CIN ? ASH[Math.floor(nn * 2) % 2] : SAND[Math.floor(nn * 2) % 2]) : kind === 'grass' ? GRASS[Math.floor(nn * 3) % 3] : kind === 'rock' ? '#8a8694' : kind === 'stone' ? BASALT[Math.floor((nn * 0.6 + hashJ(i, j) * 0.4) * 4) % 4] : kind === 'hot' ? HOT[(i + j) % 2] : kind === 'molten' ? '#2a1410' : '#c8b48a';
    tc.set(base).multiplyScalar(0.94 + hashJ(i * 3, j * 7) * 0.12);
    // the square's stones are stained green up to the high-tide line
    if (kind === 'street') tc.lerp(new THREE.Color('#6a8a5a'), 0.12 + hashJ(i, j * 5) * 0.14);
    tb.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], tc, 1, 1, 1, 1);
    for (const [di, dj, a, b2, n] of [[1, 0, [x1, z1], [x1, z0], [1, 0, 0]], [-1, 0, [x0, z0], [x0, z1], [-1, 0, 0]], [0, 1, [x0, z1], [x1, z1], [0, 0, 1]], [0, -1, [x1, z0], [x0, z0], [0, 0, -1]]]) {
      const nh = hAt(i + di, j + dj);
      if (nh >= h - 0.01) continue;
      const nk = KD[(j + dj) * Wd + i + di];
      // a deck's edge is a plank fascia over its stilts; where it meets the square, an old stone wall holds it up
      const wallDown = kind === 'deck' && nk !== 'street' && nk !== undefined ? Math.max(nh, h - 0.35) : nh;
      for (let y = h; y > wallDown + 0.001; y -= 0.5) {
        const y0 = Math.max(wallDown, y - 0.5);
        const sc = kind === 'deck' ? (nk === 'street' ? ['#6f7a74', '#77827c', '#68736d'][(Math.floor(y * 2) + i + j) % 3] : '#7a5236') : kind === 'grass' ? '#8a7f6a' : kind === 'rock' ? '#7d7a86' : kind === 'sand' ? (CIN ? '#2e282a' : '#c8b07a') : kind === 'stone' || kind === 'hot' ? '#3a3436' : '#5f6a64';
        tc.set(sc).multiplyScalar(y0 < -0.3 ? 0.75 : 1);
        tb.quad([a[0], y0, a[1]], [b2[0], y0, b2[1]], [b2[0], y, b2[1]], [a[0], y, a[1]], n, tc, 0.75, 0.75, 1, 1);
      }
    }
  }
  root.add(tb.mesh());

  // ----- what stands on it -----
  const b = new Batch(1102), g = new Batch(1103);
  const solids = [], dyn = [];
  // stilts under the boardwalks wherever the deck stands over water or sand
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    if (KD[j * Wd + i] !== 'deck' || (i + j) % 2) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => { const nk = KD[(j + c) * Wd + i + a]; return nk === 'sea' || nk === 'sand' || nk === undefined; });
    if (!edge) continue;
    b.box(0.22, 4.0, 0.22, '#5d3d26', wx(i), H[j * Wd + i] - 2.1, wz(j));
    b.box(0.3, 0.3, 0.3, '#c8c0b0', wx(i), -0.2, wz(j));   // barnacles at the waterline
  }
  // the pier: posts on both sides, a rope rail, the mooring for the Lantern
  for (const p of find('D').concat(find('P'))) if (p.i === 28 || p.i === 30) {
    if (p.j % 2 === 0) { b.box(0.2, 3.6, 0.2, '#5d3d26', p.x + (p.i === 28 ? -0.4 : 0.4), 0.0, p.z); b.box(0.26, 0.1, 0.26, '#4a3020', p.x + (p.i === 28 ? -0.4 : 0.4), 1.85, p.z); }
  }
  // houses: painted planks, a gabled roof, a lit window or two, a chimney, a door toward the boardwalk
  const HOUSE = CIN ? ['#5a5050', '#6a5a50', '#544a48', '#625654'] : ['#3f7a8a', '#b0533f', '#d8a23f', '#5a6a9a', '#6a8a5a', '#c8c0b0'];
  const ROOF = CIN ? ['#8a3a2a', '#6a4a3a', '#7a3328'] : ['#7a3f3a', '#3a4a5a', '#5a3f5a', '#3f5a4a'];
  const boxes = [];
  // tall things that fade when they come between the camera and you
  const occluders = [];
  const fadeMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
  rects('H').forEach((hs, n) => {
    const b2 = new Batch(1110 + n);
    const b = b2;   // this house's own mesh, so it can fade on its own
    const y = 1.5, wc = HOUSE[n % HOUSE.length], rc = ROOF[(n * 3) % ROOF.length];
    const w = hs.w - 0.3, d = hs.d - 0.3, wallH = 2.4 + (n % 3) * 0.4;
    b.box(w, wallH, d, wc, hs.x, y + wallH / 2, hs.z, { top: shade(wc, 0.9) });
    for (let k = 0; k < Math.floor(w / 0.5); k++) b.box(0.04, wallH, 0.04, shade(wc, 0.82), hs.x - w / 2 + 0.25 + k * 0.5, y + wallH / 2, hs.z + d / 2 + 0.01);
    // the roof runs along the longer side
    const along = w >= d;
    for (let k = 0; k < 5; k++) {
      const s2 = 1 - k * 0.2;
      b.box(along ? w + 0.4 : (d + 0.4) * s2, 0.32, along ? (d + 0.4) * s2 : d + 0.4, k % 2 ? rc : shade(rc, 1.1), hs.x, y + wallH + 0.16 + k * 0.3, hs.z);
      if (!along) b.box((w + 0.4) * s2, 0.32, d + 0.4, k % 2 ? rc : shade(rc, 1.1), hs.x, y + wallH + 0.16 + k * 0.3, hs.z);
    }
    b.box(0.4, 1.0, 0.4, '#6f6c78', hs.x + w * 0.3, y + wallH + 1.2, hs.z - d * 0.2, { top: '#3a3a44' });
    // door and windows on the side that faces open boardwalk
    const sides = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([a, c]) => { const ii = a > 0 ? hs.i1 + 1 : a < 0 ? hs.i0 - 1 : Math.floor((hs.i0 + hs.i1) / 2), jj = c > 0 ? hs.j1 + 1 : c < 0 ? hs.j0 - 1 : Math.floor((hs.j0 + hs.j1) / 2); return ch(ii, jj) === '='; });
    const [fa, fc] = sides[0] || [0, 1];
    const fx = hs.x + fa * (w / 2 + 0.02), fz = hs.z + fc * (d / 2 + 0.02);
    b.push(fx, y, fz, Math.atan2(fa, fc));
    b.box(0.8, 1.6, 0.08, '#3a2a20', 0, 0.8, 0); b.box(1.0, 0.1, 0.12, shade(wc, 0.7), 0, 1.65, 0);
    b.pop();
    for (const off of [-1, 1]) {
      const ox = fc ? off * Math.min(1.2, w / 2 - 0.4) : 0, oz = fa ? off * Math.min(1.2, d / 2 - 0.4) : 0;
      if (Math.abs(ox) < 0.6 && Math.abs(oz) < 0.6) continue;
      g.push(fx + ox, y, fz + oz, Math.atan2(fa, fc));
      g.box(0.5, 0.5, 0.06, '#ffd29a', 0, 1.6, 0.02, { glow: 1.6, jitter: 0 });
      g.pop();
      b.push(fx + ox, y, fz + oz, Math.atan2(fa, fc));
      b.box(0.62, 0.08, 0.1, '#e8e0d0', 0, 1.32, 0.03); b.box(0.06, 0.6, 0.1, '#e8e0d0', 0, 1.6, 0.04);
      b.pop();
    }
    boxes.push({ x0: hs.x0, z0: hs.z0, x1: hs.x1, z1: hs.z1 });
    const hm = b2.mesh(); root.add(hm);
    occluders.push({ m: hm, x0: hs.x0 - 0.3, z0: hs.z0 - 0.3, x1: hs.x1 + 0.3, z1: hs.z1 + 0.3, y0: 2.2, y1: y + wallH + 1.8, k: 1 });
  });
  // the drowned square's ruins: the walls of the old town, broken off at different heights
  for (const rr of rects('R')) {
    for (let jj = rr.j0; jj <= rr.j1; jj++) for (let ii = rr.i0; ii <= rr.i1; ii++) {
      const edge = ii === rr.i0 || ii === rr.i1 || jj === rr.j0 || jj === rr.j1;
      if (!edge) { b.box(0.98, 0.3, 0.98, '#5f6a64', wx(ii), -0.25, wz(jj)); continue; }
      const hh = 0.8 + hashJ(ii, jj) * 1.6;
      b.box(0.98, hh, 0.98, ['#8a8694', '#7f7b88', '#949088'][(ii + jj) % 3], wx(ii), -0.4 + hh / 2, wz(jj), { top: '#5a7a5a' });
      if (hashJ(jj, ii) > 0.6) b.box(0.3, 0.2, 0.3, '#c8c0b0', wx(ii) + 0.3, -0.2 + hh * 0.3, wz(jj) + 0.4);
    }
  }
  // the Belfry's tower in the middle of the square
  const tw = rects('Z')[0];
  if (tw) {
    const tb2 = new Batch(1130);
    buildBelfryTower(tb2, g, tw.x, -0.4, tw.z);
    const tm = tb2.mesh(); root.add(tm);
    occluders.push({ m: tm, x0: tw.x0 - 0.5, z0: tw.z0 - 0.5, x1: tw.x1 + 0.5, z1: tw.z1 + 0.5, y0: 2.0, y1: 12, k: 1 });
  }
  const door = find('B')[0];
  // the fountain the town used to gather round
  for (const f of find('f')) {
    b.box(1.6, 0.5, 1.6, '#8a8694', f.x, -0.15, f.z, { top: '#6f7a74' }); b.box(0.4, 1.2, 0.4, '#949088', f.x, 0.4, f.z); b.box(0.8, 0.2, 0.8, '#8a8694', f.x, 1.0, f.z);
    solids.push({ x: f.x, z: f.z, r: 0.85, h: 1.2 });
  }
  // Cinderglass: furnaces, glass racks, quench troughs, the Kiln's mouth, and glowing cracks in the hot ground
  for (const p of find('F')) { CINDER_PROPS.furnace(b, g, p.x, p.y, p.z); solids.push({ x: p.x, z: p.z, r: 0.95, h: 2.8 }); }
  for (const p of find('G')) { CINDER_PROPS.rack(b, g, p.x, p.y, p.z, r); solids.push({ x: p.x, z: p.z, r: 0.8, h: 1.8 }); }
  const troughs = find('U');
  for (const p of troughs) { CINDER_PROPS.trough(b, g, p.x, p.y, p.z); solids.push({ x: p.x, z: p.z, r: 0.75, h: 0.7 }); }
  const kilnAt = find('Y')[0];
  if (kilnAt) CINDER_PROPS.kilnMouth(b, g, kilnAt.x, kilnAt.y, kilnAt.z + 0.4);
  const hotCells = new Map();   // cell -> seconds it stays cooled
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) if (KD[j * Wd + i] === 'hot') {
    hotCells.set(j * Wd + i, 0);
    for (let q = 0; q < 2; q++) g.box(0.06, 0.02, 0.5 + r() * 0.4, pick(['#ff7a2a', '#ffb04a'], r), wx(i) + (r() - 0.5) * 0.6, H[j * Wd + i] + 0.012, wz(j) + (r() - 0.5) * 0.6, { rotY: r() * 3, glow: 1.6, jitter: 0, ao: 1 });
  }
  // lamps on the boardwalks
  const lampSpots = find('l');
  for (const l of lampSpots) { PROPS.lanternPost(b, g, l.x, l.y, l.z, r() * TAU); solids.push({ x: l.x, z: l.z, r: 0.18, h: 2 }); }
  // the tide post: a tall striped post with tide marks, a brass hand, and a bench to wait on
  const tp = find('T')[0];
  if (tp) {
    b.push(tp.x, tp.y, tp.z);
    b.box(0.3, 3.4, 0.3, '#e8e0d0', 0, 1.7, 0);
    for (let k = 0; k < 6; k++) b.box(0.32, 0.12, 0.32, k % 2 ? '#2f5a7a' : '#c94a3f', 0, 0.4 + k * 0.5, 0);
    b.box(0.6, 0.6, 0.08, '#e8e0d0', 0, 3.0, 0.18); b.box(0.5, 0.5, 0.04, '#2f4a5a', 0, 3.0, 0.23);
    b.box(1.6, 0.1, 0.5, '#8b5e3c', 1.3, 0.45, 0.2); for (const sx of [0.7, 1.9]) b.box(0.1, 0.45, 0.4, '#5d3d26', sx, 0.22, 0.2);
    b.pop();
    solids.push({ x: tp.x, z: tp.z, r: 0.25, h: 3.4 }, { x: tp.x + 1.3, z: tp.z + 0.2, r: 0.4, h: 0.6 });
  }
  const tideHand = !tp ? null : (() => { const hb = new Batch(1104); hb.box(0.04, 0.2, 0.03, '#e0b85a', 0, 0.1, 0); const m = hb.mesh(); m.matrixAutoUpdate = true; m.position.set(tp.x, tp.y + 3.0, tp.z + 0.27); root.add(m); return m; })();
  // the old light on the hill: dark since the sky broke
  const ol = find('L')[0];
  if (ol) { PROPS.lighthouse(b, g, ol.x, ol.y, ol.z); solids.push({ x: ol.x, z: ol.z, r: 1.7, h: 9 }); }
  // Bell Rock: the great bell in its arch of rock at the top, and boulders on the shore
  const bellAt = find('K')[0];
  if (bellAt) {
    const x = bellAt.x, y = bellAt.y, z = bellAt.z;
    for (const sx of [-1.3, 1.3]) for (let k = 0; k < 5; k++) b.box(0.9 - k * 0.06, 0.8, 0.9, ['#7f7b88', '#8a8694', '#747080'][k % 3], x + sx, y + 0.4 + k * 0.8, z, { top: '#5a7a5a' });
    for (let k = 0; k < 5; k++) b.box(0.7, 0.6, 0.9, '#8a8694', x - 1.2 + k * 0.6, y + 4.2 + Math.sin((k / 4) * Math.PI) * 0.4, z, { top: '#6a8a5a' });
    b.box(0.08, 0.6, 0.08, '#3a3a44', x, y + 3.75, z);
    b.box(1.5, 1.2, 1.5, '#a06a32', x, y + 2.9, z, { top: '#b07a3a' }); b.box(1.8, 0.24, 1.8, '#8a5a2a', x, y + 2.25, z); b.box(1.0, 0.4, 1.0, '#b07a3a', x, y + 3.55, z);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.box(0.3, 0.2, 0.12, k % 2 ? '#5aa08a' : '#d8d0c4', x + Math.cos(a) * 0.78, y + 2.6 + (k % 3) * 0.2, z + Math.sin(a) * 0.78, { rotY: -a }); }
    b.box(0.22, 0.4, 0.22, '#3a3a44', x, y + 2.05, z);
    g.box(0.5, 0.3, 0.06, '#9ff3ff', x, y + 2.8, z + 0.77, { glow: 1.2, jitter: 0 });
    solids.push({ x: x - 1.3, z, r: 0.5, h: 5 }, { x: x + 1.3, z, r: 0.5, h: 5 });
  }
  for (const p of find('r')) { PROPS.rock(b, p.x, p.y, p.z, r, 1.1); solids.push({ x: p.x, z: p.z, r: 0.6, h: 1.5 }); }
  // tufts over any grassy ground, more where it's high and windy
  if (rocky) for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    if (KD[j * Wd + i] !== 'grass' || block[j * Wd + i] || r() > 0.5) continue;
    for (let q = 0; q < 3; q++) b.box(0.06, 0.22 + r() * 0.22, 0.06, pick(GRASS, r), wx(i) + (r() - 0.5) * 0.7, H[j * Wd + i] + 0.12, wz(j) + (r() - 0.5) * 0.7, { rotZ: (r() - 0.5) * 0.5 });
  }
  // the hill: grass tufts, rocks, a few crates of nets
  for (let k = 0; k < 60; k++) {
    const i = 13 + Math.floor(r() * 33), j = 38 + Math.floor(r() * 5);
    if (ch(i, j) !== 'g') continue;
    if (r() < 0.25) PROPS.rock(b, wx(i), H[j * Wd + i], wz(j), r, 0.6);
    else for (let n = 0; n < 3; n++) b.box(0.06, 0.25 + r() * 0.2, 0.06, pick(GRASS, r), wx(i) + (r() - 0.5) * 0.7, H[j * Wd + i] + 0.12, wz(j) + (r() - 0.5) * 0.7, { rotZ: (r() - 0.5) * 0.5 });
  }
  // life on the boardwalks: crates, barrels, nets drying, buckets
  for (let k = 0; k < 90; k++) {
    const i = Math.floor(r() * Wd), j = Math.floor(r() * Hd);
    if (ch(i, j) !== '=') continue;
    // keep the middle of every boardwalk clear to walk
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => { const n = ch(i + a, j + c); return n === 'H' || n === '~'; }).length;
    if (!near) continue;
    const x = wx(i), z = wz(j), y = 1.5, pk = r();
    if (pk < 0.35) { PROPS.crate(b, x, y, z, r() * 0.6, 0.8); solids.push({ x, z, r: 0.38, h: 0.8 }); }
    else if (pk < 0.6) { PROPS.barrel(b, x, y, z, r()); solids.push({ x, z, r: 0.34, h: 0.8 }); }
    else if (pk < 0.8) { b.box(0.6, 0.1, 0.6, '#c8b28a', x, y + 0.05, z); b.box(0.36, 0.12, 0.36, '#b09a74', x, y + 0.14, z); }
    else { b.box(0.3, 0.3, 0.3, '#6a7a84', x, y + 0.15, z); b.box(0.34, 0.04, 0.34, '#4a5a64', x, y + 0.3, z); }
  }
  // seaweed and shells over the square's cobbles
  for (let k = 0; k < 80; k++) {
    const i = 19 + Math.floor(r() * 21), j = 13 + Math.floor(r() * 18);
    if (ch(i, j) !== '.') continue;
    if (r() < 0.5) b.box(0.4 + r() * 0.3, 0.04, 0.2, pick(['#4a7a4a', '#5a8a52', '#3f6a44'], r), wx(i) + (r() - 0.5) * 0.6, -0.38, wz(j) + (r() - 0.5) * 0.6, { rotY: r() * 3 });
    else PROPS.shell(b, wx(i) + (r() - 0.5) * 0.6, -0.4, wz(j) + (r() - 0.5) * 0.6, r);
  }
  root.add(b.mesh());
  const gm = g.mesh(MAT.glow); gm.castShadow = false; root.add(gm);
  const windows = gm;
  // the molten glass: one flowing sheet over every molten cell, and a red light from the crater
  if (CIN) {
    const mg = new THREE.BufferGeometry(), pos = [];
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) if (KD[j * Wd + i] === 'molten') { const x0 = X0 + i, z0 = Z0 + j, y = H[j * Wd + i] + 0.03; pos.push(x0, y, z0, x0, y, z0 + 1, x0 + 1, y, z0, x0 + 1, y, z0, x0, y, z0 + 1, x0 + 1, y, z0 + 1); }
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mm = new THREE.Mesh(mg, moltenMaterial()); mm.castShadow = false; root.add(mm);
    const glowL = new THREE.PointLight('#ff7a2a', 30, 30, 1.4); glowL.position.set(wx(30), 6, wz(34)); root.add(glowL);
  }
  // the Lantern, tied up at the end of the pier
  const pierEnd = find('P')[0];
  const boat = buildSailboat();
  boat.position.set(pierEnd.x + 2.2, -0.08, pierEnd.z + 0.6); boat.rotation.y = Math.PI;
  root.add(boat);
  solids.push({ x: boat.position.x, z: boat.position.z, r: 1.0, h: 2 });
  // keepsakes: a paper boat on a windowsill-high crate, a puddle in a jar by the fountain
  const keepsakes = [];
  if (!CIN) for (const [c, id] of [['b', 'boat'], ['J', 'puddle']]) for (const p of find(c)) { const m = buildKeepsake(id); m.position.set(p.x, p.y, p.z); root.add(m); keepsakes.push({ id, kind: id, x: p.x, z: p.z, y: p.y, m, taken: false }); }

  // ----- the sea and the sky, and the tide -----
  const TS = 128, ext = 64;
  const data = new Uint8Array(TS * TS * 4);
  for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
    const x = -ext + (i + 0.5) * (2 * ext / TS), z = -ext + (j + 0.5) * (2 * ext / TS);
    // the drowned square counts as a deep basin here, so a thin flood over it reads as clear water, not surf
    const [ci, cj] = cellOf(x, z), sq = ci >= 0 && cj >= 0 && ci < Wd && cj < Hd && KD[cj * Wd + ci] === 'street';
    const v = clamp(((sq ? -1.6 : cellH(x, z)) + 4) / 8, 0, 1) * 255;
    data.set([v, v, v, 255], (j * TS + i) * 4);
  }
  const shoreTex = new THREE.DataTexture(data, TS, TS, THREE.RGBAFormat);
  shoreTex.magFilter = THREE.LinearFilter; shoreTex.minFilter = THREE.LinearFilter; shoreTex.needsUpdate = true;
  const sea = buildSea(shoreTex, { x0: -ext, z0: -ext, x1: ext, z1: ext });
  root.add(sea);
  root.add(buildSky());
  let level = 0;   // the water level here, from the tide: under the square at low tide, over it at high
  function setTide(t) {
    // the clock's tide (-0.62 .. 0.42) mapped onto this town's: dry square at the bottom, a deep one at the top
    level = lerp(-0.75, 0.75, clamp((t + 0.62) / 1.04, 0, 1));
    sea.material.uniforms.uLevel.value = level;
    if (tideHand) tideHand.rotation.z = -clamp((t + 0.62) / 1.04, 0, 1) * Math.PI * 1.5 + Math.PI * 0.75;
  }

  // ----- what the game asks this place -----
  const deepCell = (i, j) => i < 0 || j < 0 || i >= Wd || j >= Hd || level - H[j * Wd + i] > 0.75;
  function deepAt(x, z) { const [i, j] = cellOf(x, z); return deepCell(i, j); }
  const blockedAt = (x, z) => { const [i, j] = cellOf(x, z); return i < 0 || j < 0 || i >= Wd || j >= Hd || block[j * Wd + i] === 1; };
  function groundAt(x, z) { return cellH(x, z); }
  function terrainOk(x, z, y, rad, stepUp = 0.55) {
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
      const px = x + ox, pz = z + oz;
      if (blockedAt(px, pz) || deepAt(px, pz) || Math.abs(groundAt(px, pz) - y) > stepUp) return false;
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
    if (blockedAt(x, z) && y < groundAt(x, z) + 3) return true;
    if (groundAt(x, z) > y) return true;
    const o = solidAt(x, z, rad);
    return !!o && y < groundAt(o.x, o.z) + (o.h === undefined ? 3 : o.h);
  }
  function targetAt() { return null; }
  const walkCell = (i, j) => i >= 0 && j >= 0 && i < Wd && j < Hd && !block[j * Wd + i] && !deepCell(i, j) && KD[j * Wd + i] !== 'sea';
  function findPath(fx0, fz0, tx, tz) {
    const [si, sj] = cellOf(fx0, fz0);
    let [ti, tj] = cellOf(tx, tz);
    const ok = (i, j) => walkCell(i, j) && !solidAt(wx(i), wz(j), 0.2);
    if (!ok(ti, tj)) {
      let best = null, bd = 1e9;
      for (let rr = 1; rr <= 3 && !best; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) if (ok(ti + di, tj + dj)) { const d = Math.hypot(di, dj); if (d < bd) { bd = d; best = [ti + di, tj + dj]; } }
      if (!best) return null;
      [ti, tj] = best;
    }
    const startK = sj * Wd + si, goal = tj * Wd + ti;
    const gS = new Map([[startK, 0]]), from = new Map(), closed = new Set(), open = [[0, startK]];
    let steps = 0;
    while (open.length && steps++ < 5000) {
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
  function nearestDry(x, z) {
    const [ci, cj] = cellOf(x, z);
    for (let rr = 1; rr < 16; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== rr) continue;
      if (walkCell(ci + di, cj + dj) && !solidAt(wx(ci + di), wz(cj + dj), 0.35)) return { x: wx(ci + di), z: wz(cj + dj) };
    }
    return { x: pierEnd.x, z: pierEnd.z + 1 };
  }
  // the creatures of the drowned square, made when you arrive
  function populate() {
    const list = [];
    for (const [c, kind] of [['M', 'mudmimic'], ['m', 'mirrorpuddle'], ['w', 'hound'], ['e', 'wisp']]) for (const p of find(c)) list.push({ kind, x: p.x, z: p.z });
    return list;
  }
  let hooks = null;
  const segIn = (o, ax, ay, az, bx, by, bz) => {
    for (let k = 1; k <= 8; k++) { const u = k / 9, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, z = az + (bz - az) * u; if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && y > o.y0 && y < o.y1) return true; }
    return false;
  };
  function update(dt, t, P) {
    // anything standing between the camera and you fades to a ghost of itself
    const cam = hooks && hooks.camera;
    if (cam) for (const o of occluders) {
      const want = segIn(o, P.x, P.y + 1, P.z, cam.position.x, cam.position.y, cam.position.z) ? 0.22 : 1;
      if (Math.abs(o.k - want) > 0.01) {
        o.k = lerp(o.k, want, Math.min(1, dt * 8));
        if (!o.faded && o.k < 0.99) { o.faded = true; o.m.material = fadeMat(); o.m.castShadow = true; }
        o.m.material.opacity = o.k; o.m.material.depthWrite = o.k > 0.98;
        if (o.k > 0.99 && o.faded) { o.m.material.opacity = 1; o.m.material.transparent = false; o.m.material.depthWrite = true; o.m.material.needsUpdate = true; o.faded = false; }
        else if (o.faded && !o.m.material.transparent) { o.m.material.transparent = true; o.m.material.needsUpdate = true; }
      }
    }
    boat.position.y = level * 0 - 0.08 + Math.sin(t * 1.4) * 0.05;
    boat.rotation.z = Math.sin(t * 1.1) * 0.03;
    boat.userData.pennant.rotation.y = Math.sin(t * 3) * 0.3;
    sea.position.set(P.x, level, P.z);
    for (const [k2, v] of hotCells) if (v > 0) hotCells.set(k2, Math.max(0, v - dt));
    for (const k of keepsakes) if (!k.taken) k.m.rotation.y = t * 0.6;
    if (hooks) for (const k of keepsakes) if (!k.taken && Math.hypot(P.x - k.x, P.z - k.z) < 0.85 && Math.abs(P.y - k.y) < 1) { k.taken = true; k.m.visible = false; hooks.onEvent('keepsake', k); }
  }
  const spot = (c, face = 0) => { const p = find(c)[0]; return p ? { x: p.x, z: p.z, face } : null; };
  const pierCells = find('D');
  const pierBox = pierCells.length ? { x0: Math.min(...pierCells.map((c) => c.x)) - 0.5, x1: Math.max(...pierCells.map((c) => c.x)) + 0.5, z0: Math.min(...pierCells.map((c) => c.z)) - 0.5, z1: Math.max(...pierCells.map((c) => c.z)) + 0.5 } : { x0: 0, x1: 0, z0: 0, z1: 0 };
  const n = Math.max(Wd, Hd);
  const mapInfo = {
    N: n, H0: X0,
    H: (() => { const a = new Float32Array(n * n).fill(-2.4); for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) a[j * n + i] = KD[j * Wd + i] === 'street' ? -0.3 : H[j * Wd + i]; return a; })(),
    K: (() => { const a = new Array(n * n).fill('sand'); for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) a[j * n + i] = KD[j * Wd + i] === 'deck' ? 'wood' : KD[j * Wd + i] === 'rock' || KD[j * Wd + i] === 'stone' ? 'stone' : KD[j * Wd + i] === 'molten' || KD[j * Wd + i] === 'hot' ? 'path' : KD[j * Wd + i]; return a; })(),
    boxes: boxes.concat(tw ? [{ x0: tw.x0, z0: tw.z0, x1: tw.x1, z1: tw.z1, tower: true }] : bellAt ? [{ x0: bellAt.x - 1.5, z0: bellAt.z - 0.5, x1: bellAt.x + 1.5, z1: bellAt.z + 0.5, tower: true }] : []),
    places: tw ? [
      { name: 'The Drowned Square', x: wx(29), z: wz(25) },
      { name: 'The Belfry', x: tw.x, z: tw.z0 - 1 },
      { name: 'Tide post', x: tp.x, z: tp.z - 1 },
      { name: 'The Drowned Anchor', x: wx(37), z: wz(8) },
      { name: 'The old light', x: ol.x, z: ol.z },
    ] : bellAt ? [{ name: 'The bell', x: bellAt.x, z: bellAt.z - 1.5 }] : kilnAt ? [{ name: 'The Kiln', x: kilnAt.x, z: kilnAt.z + 1 }, { name: 'The furnaces', x: wx(30), z: wz(11) }, { name: 'The crater', x: wx(30), z: wz(34) }] : [],
    dock: pierBox,
    bellAt: bellAt ? { x: bellAt.x, z: bellAt.z } : null,
  };
  return {
    name: D.key || 'brinemoor', D, root, groundAt, walkable, terrainOk, solidAt, shotBlocked, targetAt, targets: [], findPath, clearLine, update, fx: {},
    dummies: [], solids: dyn, seep: null, shardOn: () => false, setSeepPower() {}, setNight() {}, rings: [],
    deepAt, nearestDry, setTide, get level() { return level; }, sea, keepsakes, populate, mapInfo, windows,
    attach(h) { hooks = h; },
    takeKeepsake(id) { const k = keepsakes.find((v) => v.id === id); if (k && !k.taken) { k.taken = true; k.m.visible = false; } return k; },
    // Cinderglass's rule: hot ground (that hasn't been cooled with water lately)
    hotAt: (x, z) => { const [i, j] = cellOf(x, z); const v = hotCells.get(j * Wd + i); return v !== undefined && v <= 0; },
    cool(x, z, rad, sec) { let n2 = 0; for (const [k2] of hotCells) { const i = k2 % Wd, j = Math.floor(k2 / Wd); if (Math.hypot(wx(i) - x, wz(j) - z) < rad + 0.5) { hotCells.set(k2, sec); n2++; } } return n2; },
    hotCells: () => [...hotCells.entries()].filter(([, v]) => v <= 0).map(([k2]) => ({ x: wx(k2 % Wd), z: wz(Math.floor(k2 / Wd)), y: H[k2] })),
    waterNear: (x, z, reach) => { for (const t of troughs) if (Math.hypot(x - t.x, z - t.z) < reach + 0.9) return true; const [ci, cj] = cellOf(x, z); for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (Math.hypot(di, dj) <= reach + 0.5 && level - hAt(ci + di, cj + dj) > 0.3) return true; return false; },
    spawn: { x: pierEnd.x, z: pierEnd.z + 1.5, y: 1.5 },
    spots: { hale: spot('h', Math.PI), jun: spot('j', Math.PI / 2), peg: spot('q', Math.PI), tidePost: tp ? { x: tp.x + 1.0, z: tp.z + 0.9 } : null, door: door ? { x: door.x, z: door.z } : null, pier: { x: pierEnd.x, z: pierEnd.z }, boat: { x: boat.position.x, z: boat.position.z }, bell: bellAt ? { x: bellAt.x, z: bellAt.z + 1.6 } : null, odda: spot('o', Math.PI), brann: spot('n', Math.PI), kiln: kilnAt ? { x: kilnAt.x, z: kilnAt.z - 0.6 } : null },
    boat,
    sunDir: new V3(-0.7, 0.56, -0.3).normalize(),
  };
}

// ===========================================================================
// The Glass Sea: where the Lantern sails. Islands are drawn at half scale (two of an island's blocks to
// one sea unit), sampled from their own maps, so Lanternhold out here is the same island you walk on.
// ===========================================================================
export function buildSeaPlace(root, S, maps) {
  const r = rng(5150);
  const half = S.half;
  // ----- islands -----
  const occ = new Map();          // coarse occupancy: what's land, for steering and the chart
  const CELL = 2;                 // chart cells: 2 sea units
  const key = (i, j) => i + ',' + j;
  const isl = [];
  const g = new Batch(1203);
  function fromMap(info, cx, cz, n, occOut = occ) {
    // every other block of the island's own map becomes one block out here
    const cells = [];
    for (let j = 0; j < info.N; j += 2) for (let i = 0; i < info.N; i += 2) {
      const h = info.H[j * info.N + i], k = info.K[j * info.N + i];
      if (h <= -0.2) continue;
      const kind = k === 'wood' ? 'wood' : k === 'sand' || k === 'wet' ? 'sand' : k === 'stone' || k === 'rock' || k === 'cobble' ? 'stone' : k === 'path' ? 'path' : k === 'street' ? 'path' : 'grass';
      const x = cx + (info.H0 + i + 1) / 2, z = cz + (info.H0 + j + 1) / 2;
      cells.push({ x, z, h: Math.max(0.15, h * 0.55), kind });
      occOut.set(key(Math.floor(x / CELL), Math.floor(z / CELL)), Math.max(occOut.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || 0, h));
    }
    // houses and towers rise as roofs
    for (const bx of info.boxes || []) {
      for (let z = bx.z0; z < bx.z1; z += 2) for (let x = bx.x0; x < bx.x1; x += 2) cells.push({ x: cx + (x + 1) / 2, z: cz + (z + 1) / 2, h: bx.tower ? 6.5 : 2.6, kind: bx.tower ? 'stone' : 'roof' });
    }
    const m = buildMiniIsland(cells, n, 1, 2.6);
    root.add(m);
    return m;
  }
  // the warm water where the Clocktide Market's Rift glows, until Bell Rock rises there
  let portal = null;
  for (const [n, I] of S.islands.entries()) {
    const o = { ...I, n };
    if (I.id === 'lanternhold' && maps.lanternhold) {
      fromMap(maps.lanternhold, I.x, I.z, n);
      o.r = 36;
      // the lighthouse, so you can find home from anywhere
      const lh = maps.lanternhold.places.find((p) => p.icon === 'lighthouse');
      if (lh) { const b2 = new Batch(1210); PROPS.lighthouse(b2, g, I.x + lh.x / 2, 3.2, I.z + lh.z / 2); root.add(b2.mesh()); o.light = new V3(I.x + lh.x / 2, 11, I.z + lh.z / 2); }
    } else if (I.id === 'brinemoor' && maps.brinemoor) {
      fromMap(maps.brinemoor, I.x, I.z, n);
      o.r = 17;
    } else if (!I.risen && maps[I.id]) {
      // an island we have a map for, but that keeps you off for now (Cinderglass and its ring of boiling water)
      fromMap(maps[I.id], I.x, I.z, n);
      o.r = 16; o.open = false;
      const ring = new THREE.Mesh(new THREE.RingGeometry(o.r + 4, o.r + 8, 64), new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.35, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(I.x, 0.05, I.z); root.add(ring);
      o.boil = ring;
    } else if (I.risen && maps[I.id]) {
      // an island that isn't there yet: built, but under the sea, and not on the chart, until it rises
      o.occ = new Map();
      o.group = new THREE.Group(); root.add(o.group);
      const m = fromMap(maps[I.id], I.x, I.z, n, o.occ); root.remove(m); o.group.add(m);
      if (maps[I.id].bellAt) { const bb = new Batch(1215); bb.box(1.0, 1.0, 1.0, '#b07a3a', I.x + maps[I.id].bellAt.x / 2, 3.6, I.z + maps[I.id].bellAt.z / 2, { top: '#c88a43' }); for (const sx of [-0.8, 0.8]) bb.box(0.5, 3, 0.5, '#8a8694', I.x + maps[I.id].bellAt.x / 2 + sx, 3.2, I.z + maps[I.id].bellAt.z / 2); o.group.add(bb.mesh()); }
      o.r = 12; o.open = false; o.up = false;
      o.group.position.y = -12; o.group.visible = false;
      // the Rift on the water above it: a ring of broken sky, steam, and a glow underneath
      const pg = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.4, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd29a').multiplyScalar(1.8), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; pg.add(ring);
      const core = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9fe0').multiplyScalar(1.2), transparent: true, opacity: 0.35, depthWrite: false }));
      core.rotation.x = -Math.PI / 2; core.position.y = 0.05; pg.add(core);
      const cb = new Batch(1216);
      for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; cb.box(0.2, 0.06, 1.6 + (k % 3) * 0.5, k % 2 ? '#fff2d6' : '#9ff3ff', Math.cos(a) * 4.6, 0.08, Math.sin(a) * 4.6, { rotY: -a, glow: 2.2, jitter: 0 }); }
      const cm = cb.mesh(MAT.glow); cm.castShadow = false; pg.add(cm);
      pg.position.set(I.x, 0, I.z); root.add(pg);
      portal = { g: pg, ring, core, x: I.x, z: I.z, island: o };
    } else {
      // islands that aren't open yet: what you can see of them from the water
      const b2 = new Batch(1220 + n);
      o.r = I.r || 16;
      if (I.id === 'cinderglass') {
        for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU, rr = 10 + r() * 4; b2.box(3, 2 + r() * 5, 3, pick(['#2a2630', '#3a3440', '#1e1a24'], r), I.x + Math.cos(a) * rr, 0.5, I.z + Math.sin(a) * rr, { rotY: a }); }
        for (let k = 0; k < 6; k++) g.box(0.8, 3, 0.8, '#ff7a2a', I.x + (r() - 0.5) * 12, 1.5, I.z + (r() - 0.5) * 12, { glow: 2.2 });
        o.steam = true;
      } else if (I.id === 'saltglass') {
        for (let k = 0; k < 70; k++) b2.box(2 + r() * 3, 0.3 + r() * 0.4, 2 + r() * 3, pick(['#f2f0ea', '#e6e2d8', '#d8d4ca'], r), I.x + (r() - 0.5) * 30, 0.1, I.z + (r() - 0.5) * 22);
        for (let k = 0; k < 24; k++) b2.box(1 + r() * 1.5, 1 + r() * 2, 1 + r() * 1.5, pick(['#7d7a86', '#6a6774'], r), I.x + (r() - 0.5) * 44, -0.2, I.z + (r() - 0.5) * 36, { rotY: r() * 3 });
      } else {
        for (let k = 0; k < 12; k++) b2.box(3, 4 + r() * 6, 3, pick(['#8a8694', '#7f7b88'], r), I.x + (r() - 0.5) * 16, 1, I.z + (r() - 0.5) * 16);
        const fog = new THREE.Mesh(new THREE.CylinderGeometry(o.r + 8, o.r + 8, 14, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#d8dce8', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
        fog.position.set(I.x, 6, I.z); root.add(fog); o.fog = fog;
      }
      root.add(b2.mesh());
      for (let a = 0; a < TAU; a += 0.3) occ.set(key(Math.floor((I.x + Math.cos(a) * o.r * 0.6) / CELL), Math.floor((I.z + Math.sin(a) * o.r * 0.6) / CELL)), 2);
    }
    isl.push(o);
  }
  // floating barrels along the routes: hit them for slivers
  const barrels = [];
  const bb = new Batch(1230);
  for (let k = 0; k < 10; k++) {
    const a = r() * TAU, d = 50 + r() * 120;
    const x = Math.cos(a) * d * 0.9 - 40, z = Math.sin(a) * d * 0.9 + 50;
    if (isl.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 10)) continue;
    const m = new THREE.Group(); const b3 = new Batch(1240 + k); PROPS.barrel(b3, 0, -0.3, 0, r()); m.add(b3.mesh()); m.position.set(x, 0, z); root.add(m);
    const t = { id: 'barrel', x, z, y: 0.2, r: 0.7, h: 1.4, m, on: false, ph: r() * 6 };
    t.onHit = () => { if (t.on) return; t.on = true; m.visible = false; if (hooks) hooks.onEvent('barrel', t); };
    barrels.push(t);
  }
  // the currents: lines of foam drifting the way they carry you
  const foamB = new Batch(1250);
  for (const c of S.currents) {
    const dx = c.x1 - c.x0, dz = c.z1 - c.z0, L = Math.hypot(dx, dz);
    for (let k = 0; k < L / 3; k++) for (let w = -1; w <= 1; w++) {
      const t = k * 3 / L, x = c.x0 + dx * t - dz / L * w * c.w * 0.35, z = c.z0 + dz * t + dx / L * w * c.w * 0.35;
      foamB.box(1.4, 0.04, 0.16, '#f4fbff', x, 0.02, z, { rotY: Math.atan2(dx, dz) + Math.PI / 2, glow: 0.4, jitter: 0 });
    }
  }
  const foamM = foamB.mesh(); foamM.castShadow = false; foamM.material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false, fog: false }); root.add(foamM);
  const gm = g.mesh(MAT.glow); gm.castShadow = false; root.add(gm);
  // the sea itself, open all the way to the sky
  const shoreTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); shoreTex.needsUpdate = true;
  const sea = buildSea(shoreTex, { x0: -1, z0: -1, x1: 1, z1: 1 });
  root.add(sea);
  root.add(buildSky());

  // ----- steering: where the boat can go -----
  function landAt(x, z) {
    if (Math.abs(x) > half || Math.abs(z) > half) return true;
    for (const o of isl) if ((!o.occ || o.up) && Math.hypot(x - o.x, z - o.z) < o.r * 0.25) return true;
    const k2 = key(Math.floor(x / CELL), Math.floor(z / CELL));
    const h = occ.get(k2);
    if (h !== undefined && h > -0.2) return true;
    for (const o of isl) if (o.occ && o.up) { const h2 = o.occ.get(k2); if (h2 !== undefined && h2 > -0.2) return true; }
    return false;
  }
  // an island lets you in (Cinderglass, once its water has calmed)
  function unlock(id) { const o = isl.find((v) => v.id === id); if (!o || o.open) return; o.open = true; o.locked = null; if (o.boil) o.boil.visible = false; }
  // an island rises: it's land from now on, it's on the chart, and its dock takes you ashore
  function raise(id, instant) {
    const o = isl.find((v) => v.id === id);
    if (!o || o.up) return o;
    o.up = true; o.open = true; o.group.visible = true;
    if (instant) o.group.position.y = 0;
    for (const [k2, h] of o.occ) { const [i, j] = k2.split(',').map(Number); const ii = i + NC / 2, jj = j + NC / 2; if (ii >= 0 && jj >= 0 && ii < NC && jj < NC) { H[jj * NC + ii] = Math.max(0.5, h); K[jj * NC + ii] = 'grass'; } }
    if (portal && portal.island === o) portal.g.visible = false;
    for (const p of mapInfo.places) if (p.id === o.id) p.name = o.name;
    mapInfo.version = (mapInfo.version || 0) + 1;
    return o;
  }
  function currentAt(x, z) {
    let vx = 0, vz = 0;
    for (const c of S.currents) {
      const dx = c.x1 - c.x0, dz = c.z1 - c.z0, L2 = dx * dx + dz * dz;
      const t = clamp(((x - c.x0) * dx + (z - c.z0) * dz) / L2, 0, 1);
      const px = c.x0 + dx * t, pz = c.z0 + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < c.w && t > 0 && t < 1) { const k = (1 - d / c.w) * c.speed, L = Math.sqrt(L2); vx += dx / L * k; vz += dz / L * k; }
    }
    return { x: vx, z: vz };
  }
  // the island whose water you're in (open ones let you dock; closed ones turn you away)
  function islandNear(x, z, pad = 6) {
    for (const o of isl) {
      if (o.open && o.dock && Math.hypot(x - o.dock.x, z - o.dock.z) < pad) return { o, dock: true };
      if (!o.open && !o.occ && Math.hypot(x - o.x, z - o.z) < o.r + 8) return { o, locked: true };
    }
    return null;
  }
  // ----- the chart: the whole sea, revealed as you sail -----
  const NC = Math.ceil(half * 2 / CELL);
  const H = new Float32Array(NC * NC).fill(-2.5), K = new Array(NC * NC).fill('sea');
  for (const [k2, h] of occ) { const [i, j] = k2.split(',').map(Number); const ii = i + NC / 2, jj = j + NC / 2; if (ii >= 0 && jj >= 0 && ii < NC && jj < NC) { H[jj * NC + ii] = Math.max(0.5, h); K[jj * NC + ii] = 'grass'; } }
  const seen = new Uint8Array(NC * NC);
  const mapInfo = { N: NC, H0: -half / CELL, H, K, boxes: [], places: isl.map((o) => ({ name: o.occ ? 'Warm water' : o.name, x: o.x / CELL, z: o.z / CELL - o.r / CELL - 2, id: o.id })), dock: { x0: 0, x1: 0, z0: 0, z1: 0 }, seen, seenW: NC, fog: true, scale: CELL };
  let revealT = 0, hooks = null;
  function update(dt, t, P) {
    sea.position.set(P.x, 0, P.z);
    for (const b of barrels) if (!b.on) { b.m.position.y = Math.sin(t * 1.5 + b.ph) * 0.12; b.m.rotation.z = Math.sin(t * 1.1 + b.ph) * 0.15; }
    for (const o of isl) if (o.fog) o.fog.rotation.y = t * 0.05;
    for (const o of isl) if (o.boil && o.boil.visible) { o.boil.material.opacity = 0.3 + Math.sin(t * 4) * 0.08; if (hooks && hooks.sparks && Math.random() < dt * 20) { const a = Math.random() * TAU, d = o.r + 4 + Math.random() * 4; hooks.sparks.spawn({ x: o.x + Math.cos(a) * d, y: 0.2, z: o.z + Math.sin(a) * d, vy: 1.5 + Math.random(), drag: 0.6, life: 1.4, size: 0.35, color: '#f2f6f8', glow: 0.4 }); } }
    if (portal && portal.g.visible) {
      portal.ring.rotation.z = t * 0.4; portal.ring.material.opacity = 0.55 + Math.sin(t * 3) * 0.15;
      portal.core.material.opacity = 0.28 + Math.sin(t * 2.2) * 0.08;
      if (hooks && hooks.sparks && Math.random() < dt * 14) { const a = Math.random() * TAU, d = Math.random() * 5; hooks.sparks.spawn({ x: portal.x + Math.cos(a) * d, y: 0.2, z: portal.z + Math.sin(a) * d, vy: 1.2 + Math.random(), drag: 0.6, life: 1.6, size: 0.3, color: '#f2f6f8', glow: 0.5 }); }
    }
    foamM.position.set(Math.sin(t * 0.7) * 0.3, 0, Math.cos(t * 0.6) * 0.3);
    revealT -= dt;
    if (revealT <= 0) {
      revealT = 0.3;
      const ci = Math.floor(P.x / CELL) + NC / 2, cj = Math.floor(P.z / CELL) + NC / 2, R = 20;
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) if (i >= 0 && j >= 0 && i < NC && j < NC && Math.hypot(i - ci, j - cj) < R) seen[j * NC + i] = 1;
    }
  }
  return {
    name: 'sea', root, sea: true, islands: isl, barrels, currentAt, islandNear, landAt, mapInfo, raise, unlock, portal: () => portal,
    groundAt: () => 0, walkable: (x, z) => !landAt(x, z), terrainOk: (x, z) => !landAt(x, z), solidAt: () => null,
    shotBlocked: (x, y, z) => y < 0 || landAt(x, z), targetAt: (x, y, z, rad = 0.1) => barrels.find((b) => !b.on && Math.hypot(x - b.x, z - b.z) < b.r + rad) || null,
    targets: barrels, findPath: () => null, clearLine: () => true, update, fx: {}, dummies: [], solids: [], seep: null, shardOn: () => false, setSeepPower() {}, setNight() {}, rings: [],
    attach(h) { hooks = h; },
    reveal(x, z) { revealT = 0; },
    spawn: { x: 0, z: 0, y: 0 },
    sunDir: new V3(-0.7, 0.56, -0.3).normalize(),
  };
}
