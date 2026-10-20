/* Riftfall — art.js
   Everything visual: the voxel kit, batched static meshes, characters, props, sky, sea and particles. */
import * as THREE from 'three';
import { PALETTE } from '@rf/data';

const V3 = THREE.Vector3;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Random numbers and noise (deterministic, so the world looks the same every time)
// ---------------------------------------------------------------------------
export function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, z) { return noise(x, z) * 0.6 + noise(x * 2.1 + 7, z * 2.1 - 3) * 0.3 + noise(x * 4.3 - 11, z * 4.3 + 5) * 0.1; }

// ---------------------------------------------------------------------------
// Colours. Vertex colours are linear; Color() converts our sRGB hex values for us.
// ---------------------------------------------------------------------------
const colCache = new Map();
export function col(hex) {
  let c = colCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); }
  return c;
}
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, 0);
  return '#' + c.multiplyScalar(k).getHexString();
}
export const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

// ---------------------------------------------------------------------------
// Batch: thousands of coloured boxes merged into ONE mesh. Static scenery is built this way,
// so a phone draws the whole cove in a handful of draw calls.
// ---------------------------------------------------------------------------
const FACES = [
  // normal, then four corners (unit cube, counter-clockwise seen from outside)
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
export class Batch {
  constructor(seed = 1) {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.stack = [new THREE.Matrix4()];
    this.r = rng(seed);
    this._v = new V3(); this._n = new V3(); this._m = new THREE.Matrix4(); this._nm = new THREE.Matrix3();
    this._c = new THREE.Color();
  }
  get m() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, rotY = 0, rotX = 0, rotZ = 0, s = 1) {
    const m = new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), new V3(s, s, s));
    this.stack.push(this.m.clone().multiply(m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  // a box centred at (x, y, z). opts: top (colour of the top face), ao (darken the bottom), jitter, rotY/rotX/rotZ, glow (multiplier)
  box(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
    const m = this._m.compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rotX || 0, opts.rotY || 0, opts.rotZ || 0, 'YXZ')), new V3(w / 2, h / 2, d / 2));
    m.premultiply(this.m);
    this._nm.getNormalMatrix(m);
    const jit = opts.jitter === undefined ? 0.07 : opts.jitter;
    const k = (1 - jit / 2 + this.r() * jit) * (opts.glow || 1);
    const base = col(color), top = opts.top ? col(opts.top) : base;
    const ao = opts.ao === undefined ? 0.72 : opts.ao;
    const skip = opts.skip || 0;   // bit mask of faces to leave out (1 = +x, 2 = -x, 4 = top, 8 = bottom, 16 = +z, 32 = -z)
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const [n, cs] = FACES[f];
      const c = f === 2 ? top : base;
      const first = this.pos.length / 3;
      this._n.set(n[0], n[1], n[2]).applyMatrix3(this._nm).normalize();
      for (const p of cs) {
        this._v.set(p[0], p[1], p[2]).applyMatrix4(m);
        this.pos.push(this._v.x, this._v.y, this._v.z);
        this.nor.push(this._n.x, this._n.y, this._n.z);
        const a = (f === 3 ? ao : p[1] < 0 && f !== 2 ? ao : 1) * k;
        this.col.push(c.r * a, c.g * a, c.b * a);
      }
      this.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    return this;
  }
  // one flat quad from four world corners (for the terrain mesher)
  quad(a, b, c, d, n, color, shadeA = 1, shadeB = 1, shadeC = 1, shadeD = 1) {
    const first = this.pos.length / 3;
    const cc = typeof color === 'string' ? col(color) : color;
    for (const [p, s] of [[a, shadeA], [b, shadeB], [c, shadeC], [d, shadeD]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(cc.r * s, cc.g * s, cc.b * s);
    }
    this.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  mesh(material) {
    const m = new THREE.Mesh(this.geometry(), material || MAT.lit);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    return m;
  }
  get empty() { return this.pos.length === 0; }
}

export const MAT = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  // glowing things: colours above 1 make the bloom pick them up
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glowAdd: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
};

// ---------------------------------------------------------------------------
// Characters: plain boxes (not batched) so they can animate and flash when hit
// ---------------------------------------------------------------------------
const geoCache = new Map();
export function geo(w, h, d) {
  const k = w + '|' + h + '|' + d;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
export function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
// each character gets its own small material set, so a hit flash only lights that character
function kit() {
  const mats = new Map();
  const mat = (c, glow) => {
    const key = c + (glow ? '!' : '');
    let m = mats.get(key);
    if (!m) {
      m = glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(glow) }) : new THREE.MeshLambertMaterial({ color: c });
      m.userData.base = m.color.clone();
      mats.set(key, m);
    }
    return m;
  };
  const box = (p, w, h, d, c, x = 0, y = 0, z = 0, glow = 0) => {
    const m = new THREE.Mesh(geo(w, h, d), mat(c, glow));
    m.position.set(x, y, z);
    m.castShadow = true;
    p.add(m);
    return m;
  };
  // flash: 0 = normal, 1 = full white
  const flash = (k, tint = '#ffffff') => {
    const t = col(tint);
    for (const m of mats.values()) {
      if (m.isMeshLambertMaterial) {
        if (!m.emissive) continue;
        m.emissive.copy(t).multiplyScalar(k * 1.6);
      }
    }
  };
  return { mat, box, flash, mats };
}

const blobGeo = new THREE.CircleGeometry(0.5, 20);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x1a0f2e, transparent: true, opacity: 0.28, depthWrite: false });
export function blob(sx, sz) {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.scale.set(sx, sz, 1);
  m.renderOrder = 1;
  return m;
}

// The apprentice. look: { body: 'a'|'b', hair: 0-3, skin, hairColor, tunic, trim, scarf, pants, boots }
export const DEFAULT_LOOK = { body: 'a', hair: 2, skin: '#f1c8a0', hairColor: '#4a2f25', tunic: '#2f6f8f', trim: '#e8d6a8', scarf: '#e0573f', pants: '#4a3b5a', boots: '#3b2a22' };
export function buildPlayer(look = {}) {
  const L = Object.assign({}, DEFAULT_LOOK, look);
  const K = kit();
  const { box } = K;
  const B = L.body === 'b';
  const P = B
    ? { tw: 0.36, th: 0.36, ty: 0.8, hipW: 0.38, legX: 0.095, legW: 0.14, armX: 0.25, armW: 0.11, head: 0.36 }
    : { tw: 0.42, th: 0.44, ty: 0.75, hipW: 0.42, legX: 0.11, legW: 0.16, armX: 0.285, armW: 0.13, head: 0.37 };
  const root = new THREE.Group();
  const body = pivot(root);
  // legs, boots
  const legL = pivot(body, -P.legX, 0.52, 0), legR = pivot(body, P.legX, 0.52, 0);
  for (const l of [legL, legR]) {
    box(l, P.legW, 0.34, 0.17, L.pants, 0, -0.17, 0);
    box(l, P.legW + 0.02, 0.18, 0.2, L.boots, 0, -0.42, 0.01);
    box(l, P.legW + 0.03, 0.04, 0.23, shade(L.boots, 0.75), 0, -0.5, 0.02);
  }
  // torso: a tunic with a belt and a hem
  const torso = pivot(body, 0, P.ty, 0);
  box(torso, P.tw, P.th, 0.25, L.tunic, 0, 0, 0);
  box(torso, P.hipW + 0.02, 0.16, 0.27, L.tunic, 0, -P.th / 2 - 0.04, 0);
  box(torso, P.hipW + 0.03, 0.05, 0.28, shade(L.boots, 1.2), 0, -P.th / 2 + 0.03, 0);
  box(torso, 0.07, 0.06, 0.02, '#d9b55a', 0.06, -P.th / 2 + 0.03, 0.145);
  box(torso, P.tw * 0.5, 0.04, 0.02, L.trim, 0, 0.1, 0.13);
  box(torso, 0.04, P.th * 0.5, 0.02, L.trim, 0, -0.02, 0.13);
  // satchel strap and bag
  box(torso, 0.05, P.th + 0.05, 0.27, shade(L.boots, 1.4), -0.08, 0.0, 0, 0).rotation.z = 0.55;
  const bag = box(torso, 0.18, 0.16, 0.12, '#8a5a3a', -P.tw / 2 - 0.02, -P.th / 2 - 0.02, 0.06);
  box(bag, 0.18, 0.05, 0.13, '#6e452c', 0, 0.06, 0.005);
  // scarf: around the neck, with a tail that flutters behind you
  box(torso, P.tw * 0.85, 0.09, 0.3, L.scarf, 0, P.th / 2 - 0.02, 0);
  const scarfTail = pivot(torso, 0.08, P.th / 2 - 0.04, -0.15);
  box(scarfTail, 0.1, 0.06, 0.24, L.scarf, 0, 0, -0.12);
  const scarfEnd = pivot(scarfTail, 0, 0, -0.24);
  box(scarfEnd, 0.1, 0.05, 0.2, shade(L.scarf, 0.88), 0, 0, -0.1);
  // arms
  const armY = P.ty + P.th / 2 - 0.06;
  const armL = pivot(body, -P.armX, armY, 0), armR = pivot(body, P.armX, armY, 0);
  for (const a of [armL, armR]) {
    box(a, P.armW, 0.3, 0.14, L.tunic, 0, -0.13, 0);
    box(a, P.armW + 0.01, 0.06, 0.15, L.trim, 0, -0.29, 0);
    box(a, P.armW - 0.01, 0.1, 0.13, L.skin, 0, -0.36, 0);
  }
  const handR = pivot(armR, 0, -0.38, 0.02);
  const handL = pivot(armL, 0, -0.38, 0.02);
  // head
  const head = pivot(body, 0, P.ty + P.th / 2 + 0.03, 0);
  const hs = P.head, hy = hs / 2;
  box(head, hs, hs, hs - 0.02, L.skin, 0, hy, 0);
  const fz = (hs - 0.02) / 2 + 0.001;
  const eyeL = box(head, 0.05, 0.08, 0.02, '#1d1726', -0.085, hy + 0.01, fz);
  const eyeR = box(head, 0.05, 0.08, 0.02, '#1d1726', 0.085, hy + 0.01, fz);
  box(head, 0.02, 0.02, 0.021, '#ffffff', -0.075, hy + 0.035, fz + 0.001);
  box(head, 0.02, 0.02, 0.021, '#ffffff', 0.095, hy + 0.035, fz + 0.001);
  box(head, 0.05, 0.03, 0.01, '#f0a0a0', -0.13, hy - 0.05, fz);
  box(head, 0.05, 0.03, 0.01, '#f0a0a0', 0.13, hy - 0.05, fz);
  // hair
  const H = (w, h, d, x, y, z) => box(head, w, h, d, L.hairColor, x, y, z);
  const ht = hs, hw = hs + 0.03;
  switch (L.hair | 0) {
    case 0: H(hw, 0.12, hs + 0.02, 0, ht + 0.02, -0.01); H(hw, 0.26, 0.08, 0, hy + 0.08, -hs / 2); break;
    case 1: H(hw, 0.1, hs + 0.02, 0, ht + 0.01, -0.01); H(hw, 0.4, 0.09, 0, hy, -hs / 2);
      for (const x of [-1, 1]) H(0.06, 0.32, hs - 0.06, x * (hs / 2 + 0.02), hy + 0.02, -0.03);
      H(hs, 0.07, 0.06, 0, ht - 0.03, hs / 2 - 0.02); break;
    case 3: H(hw, 0.1, hs + 0.02, 0, ht + 0.02, -0.01); H(hw, 0.24, 0.08, 0, hy + 0.1, -hs / 2);
      H(0.12, 0.3, 0.1, 0, hy - 0.04, -hs / 2 - 0.08); H(0.1, 0.08, 0.08, 0, hy - 0.22, -hs / 2 - 0.1); break;
    default: // tousled
      for (const [x, y, z] of [[-0.13, 0.04, 0.08], [0, 0.07, 0.11], [0.13, 0.04, 0.08], [-0.14, 0.06, -0.06], [0, 0.09, -0.04], [0.14, 0.06, -0.06], [-0.1, 0.02, -0.16], [0.1, 0.02, -0.16], [-0.19, -0.06, 0.02], [0.19, -0.06, 0.02]]) H(0.14, 0.14, 0.14, x, ht + y - 0.02, z);
      H(hw, 0.22, 0.08, 0, hy + 0.06, -hs / 2);
      H(0.16, 0.07, 0.05, -0.07, ht - 0.05, hs / 2 - 0.01);
  }
  root.add(blob(0.85, 0.85));
  return { root, body, torso, legL, legR, armL, armR, handR, handL, head, scarfTail, scarfEnd, eyes: [eyeL, eyeR], flash: K.flash, K };
}

// Weapons (held in the right hand; +z is "forward" from the hand)
export function buildSkyblade() {
  const K = kit();
  const g = new THREE.Group();
  const grip = pivot(g, 0, 0, 0);
  K.box(grip, 0.06, 0.06, 0.2, '#6b4a33', 0, 0, -0.02);
  K.box(grip, 0.08, 0.08, 0.05, '#d9b55a', 0, 0, -0.13);
  K.box(grip, 0.26, 0.05, 0.05, '#c9a24a', 0, 0, 0.1);
  for (let i = 0; i < 6; i++) {
    const w = 0.09 - i * 0.008;
    K.box(grip, w, 0.035, 0.14, i % 2 ? '#bff6ff' : '#8fe9ff', 0, 0, 0.19 + i * 0.13, 1.6 + i * 0.12);
  }
  K.box(grip, 0.03, 0.02, 0.1, '#ffffff', 0, 0.01, 0.98, 2.4);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root: g, flash: K.flash };
}
export function buildTidesling() {
  const K = kit();
  const g = new THREE.Group();
  K.box(g, 0.05, 0.05, 0.22, '#6b4a33', 0, 0, 0.02);
  for (const x of [-1, 1]) K.box(g, 0.04, 0.04, 0.16, '#6b4a33', x * 0.06, 0, 0.18).rotation.y = -x * 0.35;
  K.box(g, 0.11, 0.03, 0.03, '#e8d6a8', 0, 0, 0.25);
  K.box(g, 0.07, 0.07, 0.07, '#5fd6e8', 0, 0, 0.27, 1.8);
  return { root: g, flash: K.flash };
}

// Practice dummy: driftwood post, sack body, a bucket for a head. Wobbles on a spring when hit.
export function buildDummy(seed = 1) {
  const r = rng(seed);
  const K = kit();
  const root = new THREE.Group();
  const wob = pivot(root, 0, 0, 0);   // tilts around the base
  K.box(wob, 0.16, 1.2, 0.16, '#9b7b5c', 0, 0.6, 0);
  K.box(wob, 1.0, 0.11, 0.11, '#8d6e50', 0, 1.05, 0).rotation.z = (r() - 0.5) * 0.12;
  K.box(wob, 0.5, 0.56, 0.4, '#c8b28a', 0, 0.85, 0);
  K.box(wob, 0.52, 0.06, 0.42, '#8d6e50', 0, 0.62, 0);
  K.box(wob, 0.52, 0.06, 0.42, '#8d6e50', 0, 1.08, 0);
  // painted target on the chest
  K.box(wob, 0.26, 0.26, 0.02, '#e06a4f', 0, 0.86, 0.21);
  K.box(wob, 0.16, 0.16, 0.022, '#f4ead2', 0, 0.86, 0.212);
  K.box(wob, 0.07, 0.07, 0.024, '#e06a4f', 0, 0.86, 0.214);
  // bucket head, slightly askew
  const head = pivot(wob, 0, 1.32, 0);
  head.rotation.z = (r() - 0.5) * 0.3;
  K.box(head, 0.36, 0.3, 0.36, '#7a8a96', 0, 0, 0);
  K.box(head, 0.4, 0.05, 0.4, '#5f6d78', 0, 0.14, 0);
  K.box(head, 0.06, 0.06, 0.02, '#1d1726', -0.08, 0.0, 0.19);
  K.box(head, 0.06, 0.06, 0.02, '#1d1726', 0.08, 0.0, 0.19);
  for (const x of [-1, 1]) K.box(wob, 0.12, 0.12, 0.14, '#c8b28a', x * 0.52, 1.05, 0);
  root.add(blob(0.9, 0.9));
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, wob, head, flash: K.flash };
}

// ---------------------------------------------------------------------------
// Props, built into batches. b = lit batch, g = glow batch. All sit on the ground at y.
// ---------------------------------------------------------------------------
export const PROPS = {
  roundTree(b, x, y, z, r, s = 1) {
    const trunk = '#7a5236';
    b.push(x, y, z, r() * TAU, 0, 0, s);
    b.box(0.34, 1.6, 0.34, trunk, 0, 0.8, 0);
    b.box(0.5, 0.18, 0.5, shade(trunk, 0.85), 0, 0.09, 0);
    b.box(0.5, 0.12, 0.14, trunk, 0.3, 0.06, 0, { rotY: 0.2 });
    const leaf = pick(['#4f9a45', '#5aa64c', '#468c3e', '#62ad55'], r);
    const L = (w, h, d, lx, ly, lz) => b.box(w, h, d, shade(leaf, 0.9 + r() * 0.2), lx, ly, lz, { ao: 0.82 });
    L(1.7, 1.1, 1.7, 0, 2.0, 0);
    L(1.3, 0.8, 1.3, 0.1, 2.75, -0.05);
    L(0.9, 0.5, 0.9, -0.1, 3.25, 0.1);
    L(0.7, 0.6, 0.7, 0.8, 1.9, 0.3);
    L(0.6, 0.5, 0.6, -0.75, 2.2, -0.4);
    L(0.5, 0.5, 0.5, 0.2, 1.6, -0.85);
    // a few blossoms or fruit
    for (let i = 0; i < 4; i++) b.box(0.12, 0.12, 0.12, pick(['#ffd1e0', '#fff1b8', '#ffb38a'], r), (r() - 0.5) * 1.6, 1.8 + r() * 1.2, 0.86, { jitter: 0 });
    b.pop();
  },
  pine(b, x, y, z, r, s = 1) {
    b.push(x, y, z, r() * TAU, 0, 0, s);
    b.box(0.26, 1.0, 0.26, '#6a4630', 0, 0.5, 0);
    const c = pick(['#2f6f4f', '#2a6448', '#357a57'], r);
    const tiers = [[1.8, 0.9], [1.45, 1.55], [1.1, 2.15], [0.75, 2.7], [0.4, 3.15]];
    for (const [w, ty] of tiers) {
      b.box(w, 0.55, w, shade(c, 0.9 + r() * 0.2), 0, ty, 0, { ao: 0.75 });
      b.box(w * 0.7, 0.12, w * 0.7, shade(c, 1.25), 0, ty + 0.3, 0, { jitter: 0.03 });
    }
    b.pop();
  },
  rock(b, x, y, z, r, s = 1, tint) {
    const c = tint || pick(PALETTE.stone, r);
    b.push(x, y, z, r() * TAU, 0, 0, s);
    b.box(1.0, 0.6, 0.85, c, 0, 0.25, 0, { top: shade(c, 1.12) });
    b.box(0.7, 0.45, 0.6, shade(c, 1.05), 0.15, 0.65, -0.05, { top: shade(c, 1.15) });
    b.box(0.45, 0.35, 0.5, shade(c, 0.95), -0.45, 0.15, 0.2);
    if (r() < 0.5) b.box(0.6, 0.12, 0.5, '#6f9a4a', 0.1, 0.9, 0, { jitter: 0.1 });
    b.pop();
  },
  crate(b, x, y, z, rot = 0, s = 1) {
    b.push(x, y, z, rot, 0, 0, s);
    b.box(0.7, 0.7, 0.7, '#a77a4f', 0, 0.35, 0);
    for (const yy of [0.05, 0.65]) b.box(0.74, 0.08, 0.74, '#7d5636', 0, yy, 0);
    b.box(0.08, 0.6, 0.74, '#7d5636', 0, 0.35, 0, { rotX: 0 , rotZ: 0.9 });
    b.pop();
  },
  barrel(b, x, y, z, rot = 0) {
    b.push(x, y, z, rot);
    b.box(0.56, 0.8, 0.56, '#9a6b45', 0, 0.4, 0);
    b.box(0.64, 0.6, 0.48, '#9a6b45', 0, 0.4, 0);
    b.box(0.48, 0.6, 0.64, '#9a6b45', 0, 0.4, 0);
    for (const yy of [0.14, 0.66]) b.box(0.66, 0.06, 0.66, '#5d6670', 0, yy, 0, { jitter: 0.02 });
    b.box(0.5, 0.04, 0.5, '#7d5636', 0, 0.81, 0);
    b.pop();
  },
  lanternPost(b, g, x, y, z, rot = 0) {
    b.push(x, y, z, rot);
    b.box(0.14, 1.9, 0.14, '#5d3d26', 0, 0.95, 0);
    b.box(0.3, 0.12, 0.3, '#4a3020', 0, 0.06, 0);
    b.box(0.5, 0.08, 0.08, '#5d3d26', 0.2, 1.85, 0);
    b.box(0.26, 0.06, 0.26, '#3a3a44', 0.4, 1.7, 0);
    b.box(0.22, 0.04, 0.22, '#3a3a44', 0.4, 1.36, 0);
    b.pop();
    g.push(x, y, z, rot);
    g.box(0.18, 0.26, 0.18, '#ffc46b', 0.4, 1.52, 0, { glow: 3.2, jitter: 0 });
    g.pop();
  },
  flowers(b, x, y, z, r) {
    const c = pick(['#f4f0ff', '#ffd54f', '#ff8fb1', '#9fd4ff', '#ffb36b', '#c9a0ff'], r);
    for (let i = 0; i < 3; i++) {
      const fx = x + (r() - 0.5) * 0.7, fz = z + (r() - 0.5) * 0.7, h = 0.18 + r() * 0.16;
      b.box(0.04, h, 0.04, '#4f8f3a', fx, y + h / 2, fz, { jitter: 0 });
      b.box(0.12, 0.08, 0.12, c, fx, y + h + 0.03, fz, { jitter: 0.15 });
      b.box(0.05, 0.05, 0.05, '#fff2a6', fx, y + h + 0.07, fz, { jitter: 0 });
    }
  },
  shell(b, x, y, z, r) {
    const c = pick(['#ffe4e1', '#ffd8b8', '#f7f0e6', '#e8c8ff'], r);
    b.push(x, y, z, r() * TAU);
    b.box(0.2, 0.06, 0.16, c, 0, 0.03, 0, { jitter: 0.1 });
    b.box(0.12, 0.05, 0.1, shade(c, 0.9), 0, 0.07, -0.02, { jitter: 0.1 });
    b.pop();
  },
  driftwood(b, x, y, z, r) {
    b.push(x, y, z, r() * TAU);
    b.box(1.6, 0.2, 0.22, '#b8a58c', 0, 0.1, 0, { top: '#cdbca4' });
    b.box(0.6, 0.14, 0.14, '#a8957c', 0.5, 0.12, 0.2, { rotY: 0.7 });
    b.box(0.3, 0.3, 0.3, '#a8957c', -0.8, 0.15, 0);
    b.pop();
  },
  fence(b, x0, z0, x1, z1, y0, y1) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.0));
    const a = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t), y = lerp(y0, y1, t);
      b.box(0.14, 0.8, 0.14, '#8b6a4a', x, y + 0.4, z);
      if (i < n) {
        const t2 = (i + 0.5) / n;
        b.push(lerp(x0, x1, t2), lerp(y0, y1, t2), lerp(z0, z1, t2), a);
        b.box(0.06, 0.08, 1.05, '#a07c58', 0, 0.62, 0);
        b.box(0.06, 0.08, 1.05, '#a07c58', 0, 0.32, 0);
        b.pop();
      }
    }
  },
  // the lighthouse: white with red bands, a gallery and a glass lantern room
  lighthouse(b, g, x, y, z) {
    b.push(x, y, z);
    // base plinth of stone
    b.box(3.2, 0.6, 3.2, '#8e8c99', 0, 0.3, 0, { top: '#a3a1ad' });
    b.box(2.9, 0.3, 2.9, '#7f7d8b', 0, 0.75, 0);
    const levels = 9, lh = 0.8;
    for (let i = 0; i < levels; i++) {
      const w = 2.2 - i * 0.075, yy = 0.9 + i * lh + lh / 2;
      const c = i % 3 === 1 ? '#c94a3f' : '#f2ece0';
      b.box(w, lh, w * 0.62, c, 0, yy, 0);
      b.box(w * 0.62, lh, w, c, 0, yy, 0);
      b.box(w * 0.88, lh, w * 0.88, c, 0, yy, 0, { rotY: Math.PI / 4 });
    }
    const topY = 0.9 + levels * lh;
    // door and little windows
    b.box(0.6, 1.0, 0.12, '#5d3d26', 0, 1.4, 1.15);
    b.box(0.7, 0.1, 0.14, '#4a3020', 0, 1.95, 1.15);
    for (const k of [2.6, 4.4, 6.2]) b.box(0.3, 0.45, 0.1, '#2e3a5a', 0.15 * Math.sin(k), k + 0.4, 1.05 - k * 0.02);
    // gallery with railing
    b.box(2.6, 0.2, 2.6, '#3a3a44', 0, topY + 0.1, 0);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.box(0.06, 0.45, 0.06, '#3a3a44', Math.cos(a) * 1.2, topY + 0.42, Math.sin(a) * 1.2); }
    b.box(2.5, 0.05, 2.5, '#3a3a44', 0, topY + 0.65, 0, { skip: 4 | 8 });
    // lantern room frame and roof
    for (const [px, pz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) b.box(0.08, 1.1, 0.08, '#2c2c36', px, topY + 0.75, pz);
    b.box(1.5, 0.18, 1.5, '#c94a3f', 0, topY + 1.38, 0);
    b.box(1.1, 0.25, 1.1, '#c94a3f', 0, topY + 1.58, 0);
    b.box(0.6, 0.25, 0.6, '#b33f36', 0, topY + 1.8, 0);
    b.box(0.12, 0.4, 0.12, '#3a3a44', 0, topY + 2.1, 0);
    b.pop();
    // the lamp itself
    g.push(x, y, z);
    g.box(0.6, 0.6, 0.6, '#fff3c4', 0, topY + 0.75, 0, { glow: 4.5, jitter: 0 });
    g.box(1.0, 0.9, 1.0, '#ffd98a', 0, topY + 0.75, 0, { glow: 0.35, jitter: 0 });
    g.pop();
    return { lampY: y + topY + 0.75 };
  },
  // Maren's cottage: stone footing, timber walls, a deep blue roof and a crooked chimney
  cottage(b, g, x, y, z, rot = 0) {
    b.push(x, y, z, rot);
    b.box(4.4, 0.4, 3.6, '#8e8c99', 0, 0.2, 0, { top: '#9c9aa6' });
    b.box(4.0, 2.0, 3.2, '#efe3c8', 0, 1.4, 0);
    for (const px of [-1.95, 1.95]) for (const pz of [-1.55, 1.55]) b.box(0.22, 2.1, 0.22, '#6b4a33', px, 1.45, pz);
    b.box(4.1, 0.2, 3.3, '#6b4a33', 0, 2.45, 0);
    b.box(0.2, 2.0, 3.3, '#6b4a33', 0, 1.4, 0, { skip: 0 });
    // roof in steps
    const roof = '#3f5a8a';
    for (let i = 0; i < 6; i++) {
      const w = 4.8 - i * 0.0, d = 4.0 - i * 0.66;
      b.box(w, 0.3, Math.max(0.4, d), shade(roof, 1 - i * 0.03), 0, 2.7 + i * 0.3, 0, { top: shade(roof, 1.12) });
    }
    b.box(5.0, 0.12, 0.3, '#2f4468', 0, 4.45, 0);
    // chimney
    b.box(0.6, 1.6, 0.6, '#9a8f86', 1.3, 3.9, -0.6, { top: '#7a706a' });
    b.box(0.7, 0.15, 0.7, '#7a706a', 1.3, 4.75, -0.6);
    // door, step, windows with flower boxes
    b.box(0.8, 1.4, 0.1, '#7a4a2e', -0.6, 1.1, 1.62);
    b.box(0.1, 0.1, 0.06, '#d9b55a', -0.32, 1.1, 1.68);
    b.box(1.1, 0.16, 0.6, '#8e8c99', -0.6, 0.48, 1.95);
    for (const wx of [0.9]) {
      b.box(0.9, 0.12, 0.3, '#6b4a33', wx, 1.0, 1.72);
      for (let i = 0; i < 4; i++) b.box(0.14, 0.14, 0.14, pick(['#ff8fb1', '#ffd54f', '#f4f0ff'], b.r), wx - 0.3 + i * 0.2, 1.12, 1.74);
    }
    b.box(0.12, 0.85, 0.85, '#6b4a33', -2.04, 1.5, 0);
    b.pop();
    g.push(x, y, z, rot);
    g.box(0.8, 0.7, 0.04, '#ffcf7a', 0.9, 1.55, 1.62, { glow: 2.2, jitter: 0 });
    g.box(0.04, 0.6, 0.6, '#ffcf7a', -2.1, 1.5, 0, { glow: 2.0, jitter: 0 });
    g.pop();
    b.push(x, y, z, rot);
    // window crosses (dark frames over the glow)
    b.box(0.06, 0.72, 0.06, '#5d3d26', 0.9, 1.55, 1.65);
    b.box(0.82, 0.06, 0.06, '#5d3d26', 0.9, 1.55, 1.65);
    b.pop();
  },
  // a fallen piece of the sky, half-sunk in the sand
  skyglassShard(b, g, x, y, z, r, s = 1) {
    g.push(x, y, z, r() * TAU, 0.25, 0.15, s);
    g.box(0.5, 2.0, 0.4, '#5fd6ec', 0, 0.7, 0, { glow: 1.25, jitter: 0.2 });
    g.box(0.34, 1.4, 0.3, '#8fe9ff', 0.32, 0.4, 0.1, { glow: 1.35, jitter: 0.2, rotZ: -0.4 });
    g.box(0.3, 1.0, 0.26, '#6fdcf0', -0.3, 0.25, -0.1, { glow: 1.3, jitter: 0.2, rotZ: 0.5 });
    g.box(0.12, 0.7, 0.12, '#e8fdff', 0.05, 1.6, 0, { glow: 2.4, jitter: 0, rotZ: 0.2 });
    g.pop();
    b.push(x, y, z);
    // scorched, glassy sand around it
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 0.6 + r() * 0.8; b.box(0.4 + r() * 0.3, 0.08, 0.4 + r() * 0.3, pick(['#c9b893', '#b9a98a', '#d8f2f2'], r), Math.cos(a) * d, 0.04, Math.sin(a) * d, { rotY: r() }); }
    b.pop();
  },
};

// The boat by the dock: its own group so it can bob on the water
export function buildBoat() {
  const b = new Batch(77);
  b.box(1.4, 0.4, 3.2, '#8b5e3c', 0, 0.2, 0, { top: '#6b4a33' });
  b.box(1.6, 0.25, 3.0, '#a06b45', 0, 0.45, 0, { skip: 4 });
  b.box(1.0, 0.25, 0.7, '#a06b45', 0, 0.45, 1.75, { skip: 4 });
  b.box(1.5, 0.08, 0.3, '#c94a3f', 0, 0.55, 0);
  b.box(1.3, 0.1, 2.8, '#5d3d26', 0, 0.3, 0);
  b.box(1.2, 0.08, 0.3, '#b0805a', 0, 0.5, -0.6);
  b.box(1.2, 0.08, 0.3, '#b0805a', 0, 0.5, 0.7);
  b.box(0.08, 0.08, 1.6, '#c8b28a', 0.5, 0.62, 0.0, { rotY: 0.3, rotZ: 0.4 });
  b.box(0.6, 0.12, 0.4, '#e8d6a8', -0.2, 0.42, -1.1);
  const g = new THREE.Group();
  g.add(b.mesh());
  return g;
}

// ---------------------------------------------------------------------------
// The evening sky with a crack in it. The same GLSL is used by the sea to reflect it.
// ---------------------------------------------------------------------------
export const SKY_UNIFORMS = {
  uTime: { value: 0 },
  uZenith: { value: col(PALETTE.skyZenith).clone() },
  uMid: { value: col(PALETTE.skyMid).clone() },
  uHorizon: { value: col(PALETTE.skyHorizon).clone() },
  uGlow: { value: col(PALETTE.skyGlow).clone() },
  uSunDir: { value: new V3(-0.75, 0.16, -0.64).normalize() },
  uCrackDir: { value: new V3(0.25, 0.62, -0.75).normalize() },
  uCrack: { value: col(PALETTE.crack).clone() },
  uCrackPower: { value: 1 },
};
export const SKY_GLSL = /* glsl */`
uniform float uTime;
uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunDir, uCrackDir, uCrack;
uniform float uCrackPower;
float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n)); }
// voronoi edges: small values along the borders between cells, which read as cracks
float crackLines(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = h22(i + g);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
vec3 skyColor(vec3 dir) {
  float y = dir.y;
  vec3 c = mix(uHorizon, uMid, smoothstep(0.02, 0.32, y));
  c = mix(c, uZenith, smoothstep(0.28, 0.85, y));
  // under the horizon: a dim, hazy band (the sea reflects only above it anyway)
  c = mix(c, uHorizon * 0.55 + uMid * 0.2, smoothstep(0.0, -0.25, y));
  // the low sun and its glow
  float s = max(dot(dir, uSunDir), 0.0);
  c += uGlow * (pow(s, 6.0) * 0.55 + pow(s, 60.0) * 1.2) + vec3(1.0, 0.85, 0.6) * pow(s, 900.0) * 6.0;
  // stars come out high up: tiny, twinkling points
  vec2 sp = dir.xz / (abs(y) + 0.35) * 140.0;
  vec2 sc = floor(sp);
  float st = h21(sc);
  float sd = length(fract(sp) - 0.5 - (h22(sc) - 0.5) * 0.6);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + st * 3.0) + st * 50.0);
  c += vec3(0.9, 0.95, 1.0) * step(0.982, st) * smoothstep(0.16, 0.0, sd) * smoothstep(0.22, 0.65, y) * tw * 1.4;
  // the crack in the Firmament: an impact point, cracks running out from it like broken glass,
  // broken rings around it, and a few pieces missing, where another sky shows through
  float cd = dot(dir, uCrackDir);
  if (cd > 0.55) {
    vec3 side = normalize(cross(uCrackDir, vec3(0.0, 1.0, 0.0)));
    vec3 up2 = cross(side, uCrackDir);
    vec2 q = vec2(dot(dir, side), dot(dir, up2)) / max(cd, 0.1) * 1.7;
    float r = length(q);
    float ang = atan(q.y, q.x);
    const float NS = 11.0;
    float u = ang / 6.2831853 * NS;
    float n1 = h21(vec2(floor(r * 9.0), 3.0)), n2 = h21(vec2(floor(r * 9.0) + 1.0, 3.0));
    float jag = mix(n1, n2, fract(r * 9.0)) - 0.5;
    float uj = u + jag * 0.45 * smoothstep(0.0, 0.15, r) + sin(r * 23.0 + floor(u)) * 0.06;
    float sector = floor(uj);
    float fu = fract(uj);
    float dRay = min(fu, 1.0 - fu) * (6.2831853 / NS) * r;
    float len = 0.22 + 0.75 * h21(vec2(floor(uj + 0.5), 7.0));
    float ray = (1.0 - smoothstep(0.0012, 0.0045 + 0.004 * r, dRay)) * smoothstep(len, len * 0.55, r) * smoothstep(0.015, 0.05, r);
    float rk = r * 7.0 + h21(vec2(sector, 1.0)) * 0.9;
    float fr = fract(rk);
    float dRing = min(fr, 1.0 - fr) / 7.0;
    float ringOn = step(0.3, h21(vec2(sector, floor(rk + 0.5)))) * smoothstep(0.5, 0.38, r) * smoothstep(0.05, 0.09, r);
    float ring = (1.0 - smoothstep(0.0012, 0.004, dRing)) * ringOn;
    float hole = step(0.86, h21(vec2(sector, floor(rk)) + 5.0)) * step(r, 0.3) * step(0.07, r);
    float core = smoothstep(0.09, 0.0, r);
    float halo = smoothstep(0.6, 0.0, r);
    float pulse = 0.85 + 0.15 * sin(uTime * 1.3) + 0.08 * sin(uTime * 3.7 + r * 12.0);
    // through the missing pieces: a shifting, many-coloured sky from somewhere else
    vec3 beyond = mix(vec3(0.98, 0.55, 0.92), vec3(0.35, 0.95, 1.0), 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.35 + r * 9.0));
    beyond = mix(beyond, vec3(1.0, 0.85, 0.5), 0.5 + 0.5 * sin(q.x * 30.0 - uTime * 0.6) * sin(q.y * 26.0));
    c = mix(c, beyond * 1.3, hole * uCrackPower);
    c += uCrack * (ray * 2.4 + ring * 1.8 + core * 2.2 + halo * 0.12) * pulse * uCrackPower;
  }
  return c;
}`;

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: SKY_UNIFORMS,
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
    fragmentShader: SKY_GLSL + '\nvarying vec3 vDir; void main() { gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------------------
// The sea: reflects the sky (crack included), gets lighter over sand, foams along the shore
// shoreTex holds the ground height under the water (r channel, 0..1 => -4..4)
// ---------------------------------------------------------------------------
export function buildSea(shoreTex, rect) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uShore: { value: shoreTex },
    uRect: { value: new THREE.Vector4(rect.x0, rect.z0, rect.x1 - rect.x0, rect.z1 - rect.z0) },
    uDeep: { value: col(PALETTE.seaDeep).clone() },
    uSea: { value: col(PALETTE.sea).clone() },
    uShallow: { value: col(PALETTE.seaShallow).clone() },
    uSand: { value: col('#d8c08c').clone() },
    uFoam: { value: col(PALETTE.foam).clone() },
  }]);
  for (const k of Object.keys(SKY_UNIFORMS)) uniforms[k] = SKY_UNIFORMS[k];
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += sin(w.x * 0.6 + uTime * 1.1) * 0.035 + sin(w.z * 0.8 - uTime * 0.9) * 0.03;
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: SKY_GLSL + /* glsl */`
      uniform sampler2D uShore;
      uniform vec4 uRect;
      uniform vec3 uDeep, uSea, uShallow, uSand, uFoam;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 uv = (vW.xz - uRect.xy) / uRect.zw;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float ground = mix(-4.0, texture2D(uShore, clamp(uv, 0.0, 1.0)).r * 8.0 - 4.0, inside);
        float depth = max(0.0, -ground);
        // ripples: a few moving noise layers bend the normal
        vec2 p = vW.xz;
        float t = uTime;
        float a = n2(p * 0.9 + vec2(t * 0.35, t * 0.2)), b = n2(p * 1.7 - vec2(t * 0.25, -t * 0.3)), c2 = n2(p * 3.3 + vec2(-t * 0.5, t * 0.45));
        vec3 N = normalize(vec3((a - 0.5) * 0.35 + (c2 - 0.5) * 0.12, 1.0, (b - 0.5) * 0.35 + (c2 - 0.5) * 0.12));
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 sky = skyColor(normalize(R));
        float fres = 0.12 + 0.88 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
        // colour by depth: sand shows through in the shallows
        vec3 body = mix(uShallow, uSea, smoothstep(0.05, 1.2, depth));
        body = mix(body, uDeep, smoothstep(1.0, 3.5, depth));
        body = mix(uSand * 0.95, body, smoothstep(0.0, 0.35, depth));
        vec3 col = mix(body, sky, fres * 0.75);
        // foam: a band along the shore that breathes with the waves
        float wave = sin(depth * 14.0 - t * 2.2 + a * 3.0);
        float foam = smoothstep(0.42, 0.0, depth) * (0.55 + 0.45 * wave);
        foam += smoothstep(0.12, 0.0, depth) * 0.6;
        foam *= smoothstep(0.35, 0.65, n2(p * 2.5 + t * 0.3) + 0.3);
        foam = clamp(foam * inside, 0.0, 1.0);
        col = mix(col, uFoam * 1.15, foam);
        // sparkles where the low sun catches the water
        float spec = pow(max(dot(R, uSunDir), 0.0), 120.0);
        col += vec3(1.0, 0.8, 0.55) * spec * 2.5;
        float glint = step(0.93, n2(p * 9.0 + t * 1.5)) * step(0.5, n2(p * 1.3 - t * 0.2)) * 0.6;
        col += vec3(1.0, 0.9, 0.8) * glint * (1.0 - foam);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, 64, 64), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.08;
  m.receiveShadow = false;
  return m;
}

// ---------------------------------------------------------------------------
// Swaying grass: one instanced mesh, a small wind wave in the vertex shader
// ---------------------------------------------------------------------------
export const WIND = { uTime: { value: 0 } };
export function buildGrass(spots) {
  const b = new Batch(5);
  b.box(0.09, 0.38, 0.05, '#ffffff', 0, 0.19, 0, { ao: 0.5, jitter: 0 });
  b.box(0.08, 0.3, 0.05, '#ffffff', 0.1, 0.14, 0.04, { ao: 0.5, jitter: 0, rotZ: -0.3, rotY: 0.6 });
  b.box(0.08, 0.32, 0.05, '#ffffff', -0.09, 0.15, -0.03, { ao: 0.5, jitter: 0, rotZ: 0.3, rotY: -0.5 });
  b.box(0.08, 0.24, 0.05, '#ffffff', 0.02, 0.11, -0.09, { ao: 0.5, jitter: 0, rotX: 0.35, rotY: 1.4 });
  b.box(0.07, 0.2, 0.05, '#ffffff', -0.03, 0.1, 0.1, { ao: 0.5, jitter: 0, rotX: -0.35, rotY: 2.2 });
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = WIND.uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float sway = sin(uTime * 1.8 + ip.x * 0.45 + ip.z * 0.3) * 0.5 + sin(uTime * 3.1 + ip.x * 1.3) * 0.2;
      transformed.x += sway * 0.13 * position.y * 2.5;
      transformed.z += sway * 0.06 * position.y * 2.5;`);
  };
  const mesh = new THREE.InstancedMesh(b.geometry(), mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach((s, i) => {
    e.set(0, s.rot, 0);
    q.setFromEuler(e);
    m.compose(new V3(s.x, s.y, s.z), q, new V3(s.s, s.s * (0.8 + (i % 5) * 0.1), s.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col(s.c));
  });
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Particles. Sparks: soft glowing points (additive). Bits: tiny tumbling voxels.
// ---------------------------------------------------------------------------
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
export function createSparks(scene, max = 600) {
  const pos = new Float32Array(max * 3), colr = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: dotTexture() }, uScale: { value: 400 } },
    vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D uTex; varying vec3 vC; varying float vA; void main() { float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const P = [];
  for (let i = 0; i < max; i++) P.push({ life: 0 });
  let head = 0;
  const tmp = new THREE.Color();
  return {
    mat,
    // o: { x, y, z, vx, vy, vz, life, size, color, glow, drag, grav, rise, flicker }
    spawn(o) {
      const p = P[head]; head = (head + 1) % max;
      Object.assign(p, { vx: 0, vy: 0, vz: 0, drag: 2, grav: 0, size: 0.2, glow: 2, flicker: 0, shrink: 1 }, o);
      p.t = 0; p.max = o.life || 0.6;
      p.c = tmp.set(o.color || '#ffffff').clone();
      return p;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.life > 0 && p.t < p.max) {
          p.t += dt;
          const k = Math.exp(-p.drag * dt);
          p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const f = p.t / p.max;
          const a = (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85) * (p.flicker ? 0.6 + 0.4 * Math.sin(p.t * 30 + i) : 1);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          colr[i * 3] = p.c.r * p.glow; colr[i * 3 + 1] = p.c.g * p.glow; colr[i * 3 + 2] = p.c.b * p.glow;
          size[i] = p.size * (p.shrink ? 1 - f * 0.6 : 1);
          alpha[i] = Math.max(0, a);
          if (p.t >= p.max) { p.life = 0; alpha[i] = 0; }
        } else alpha[i] = 0;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
    },
  };
}
export function createBits(scene, max = 300) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const P = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), p0 = new V3();
  for (let i = 0; i < max; i++) { P.push({ t: 1, max: 0 }); mesh.setColorAt(i, col('#ffffff')); m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); }
  scene.add(mesh);
  let head = 0;
  return {
    // o: { x, y, z, vx, vy, vz, life, size, color, floor }
    spawn(o) {
      const i = head; head = (head + 1) % max;
      const p = P[i];
      Object.assign(p, { vx: 0, vy: 0, vz: 0, size: 0.1, floor: 0, rx: Math.random() * 6, ry: Math.random() * 6, spin: 4 + Math.random() * 8 }, o);
      p.t = 0; p.max = o.life || 0.8;
      mesh.setColorAt(i, col(o.color || '#ffffff'));
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.t >= p.max) continue;
        p.t += dt;
        p.vy -= 14 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor + p.size / 2) { p.y = p.floor + p.size / 2; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
        p.rx += p.spin * dt; p.ry += p.spin * dt * 0.7;
        const f = p.t / p.max, sc = p.size * (f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1);
        e.set(p.rx, p.ry, 0); q.setFromEuler(e); s.set(sc, sc, sc); p0.set(p.x, p.y, p.z);
        m.compose(p0, q, p.t >= p.max ? s.set(0, 0, 0) : s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// The slash: a glowing arc that fades right after a swing
const slashGeoCache = new Map();
export function slashMesh(radius, arcDeg, color, glow = 2.2) {
  const key = radius + '|' + arcDeg;
  let g = slashGeoCache.get(key);
  if (!g) {
    // a crescent: thick in the middle of the swing, thin at the ends
    const seg = 28, a0 = -arcDeg / 2 * Math.PI / 180, a1 = arcDeg / 2 * Math.PI / 180;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, a = lerp(a0, a1, t);
      const thick = Math.sin(t * Math.PI) * 0.55 + 0.05;
      const ri = radius * (1 - thick * 0.6), ro = radius;
      pos.push(Math.sin(a) * ri, 0, Math.cos(a) * ri, Math.sin(a) * ro, 0, Math.cos(a) * ro);
      uv.push(t, 0, t, 1);
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    slashGeoCache.set(key, g);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(glow) }, uT: { value: 0 }, uDir: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uT; uniform float uDir; varying vec2 vUv;
      void main() {
        float along = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
        // the bright head sweeps along the arc, the tail fades behind it
        float head = uT * 1.6;
        float a = smoothstep(head - 0.9, head, along) * (1.0 - smoothstep(head, head + 0.05, along));
        a *= smoothstep(0.0, 0.35, vUv.y) * (0.6 + 0.4 * vUv.y);
        a *= 1.0 - smoothstep(0.55, 1.0, uT);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}
