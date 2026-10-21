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
  // o: { wall, roof, beam, chimney (true/false), lit (windows glow) }
  cottage(b, g, x, y, z, rot = 0, o = {}) {
    const wall = o.wall || '#efe3c8', beam = o.beam || '#6b4a33', roof = o.roof || '#3f5a8a';
    b.push(x, y, z, rot);
    b.box(4.4, 0.4, 3.6, '#8e8c99', 0, 0.2, 0, { top: '#9c9aa6' });
    b.box(4.0, 2.0, 3.2, wall, 0, 1.4, 0);
    for (const px of [-1.95, 1.95]) for (const pz of [-1.55, 1.55]) b.box(0.22, 2.1, 0.22, beam, px, 1.45, pz);
    b.box(4.1, 0.2, 3.3, beam, 0, 2.45, 0);
    b.box(0.2, 2.0, 3.3, beam, 0, 1.4, 0, { skip: 0 });
    // roof in steps
    for (let i = 0; i < 6; i++) {
      const w = 4.8 - i * 0.0, d = 4.0 - i * 0.66;
      b.box(w, 0.3, Math.max(0.4, d), shade(roof, 1 - i * 0.03), 0, 2.7 + i * 0.3, 0, { top: shade(roof, 1.12) });
    }
    b.box(5.0, 0.12, 0.3, shade(roof, 0.75), 0, 4.45, 0);
    // chimney
    if (o.chimney !== false) {
      b.box(0.6, 1.6, 0.6, '#9a8f86', 1.3, 3.9, -0.6, { top: '#7a706a' });
      b.box(0.7, 0.15, 0.7, '#7a706a', 1.3, 4.75, -0.6);
    }
    // door, step, windows with flower boxes
    b.box(0.8, 1.4, 0.1, '#7a4a2e', -0.6, 1.1, 1.62);
    b.box(0.1, 0.1, 0.06, '#d9b55a', -0.32, 1.1, 1.68);
    b.box(1.1, 0.16, 0.6, '#8e8c99', -0.6, 0.48, 1.95);
    for (const wx of [0.9]) {
      b.box(0.9, 0.12, 0.3, '#6b4a33', wx, 1.0, 1.72);
      for (let i = 0; i < 4; i++) b.box(0.14, 0.14, 0.14, pick(['#ff8fb1', '#ffd54f', '#f4f0ff'], b.r), wx - 0.3 + i * 0.2, 1.12, 1.74);
    }
    b.box(0.12, 0.85, 0.85, beam, -2.04, 1.5, 0);
    b.pop();
    g.push(x, y, z, rot);
    const lit = o.lit === undefined ? 1 : o.lit;
    g.box(0.8, 0.7, 0.04, lit ? '#ffcf7a' : '#2e3a5a', 0.9, 1.55, 1.62, { glow: lit ? 2.2 : 1, jitter: 0 });
    g.box(0.04, 0.6, 0.6, lit ? '#ffcf7a' : '#2e3a5a', -2.1, 1.5, 0, { glow: lit ? 2.0 : 1, jitter: 0 });
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
  uCrackPower: { value: 0 },     // 0 until the first Riftfall
  uCrackGrow: { value: 1 },      // 0 -> 1: the crack spreading out from its first point
  uNight: { value: 0 },          // 0 = evening, 1 = night
  uMoonDir: { value: new V3(0.55, 0.5, -0.67).normalize() },
};
export const SKY_GLSL = /* glsl */`
uniform float uTime;
uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunDir, uCrackDir, uCrack;
uniform float uCrackPower, uCrackGrow, uNight;
uniform vec3 uMoonDir;
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
  c += vec3(0.9, 0.95, 1.0) * step(0.982, st) * smoothstep(0.16, 0.0, sd) * smoothstep(0.22, 0.65, y) * tw * (0.6 + uNight * 1.6);
  // the moon, at night
  float md = dot(dir, uMoonDir);
  c += vec3(0.92, 0.95, 1.0) * (smoothstep(0.99935, 0.99965, md) * 2.2 + pow(max(md, 0.0), 120.0) * 0.35 + pow(max(md, 0.0), 8.0) * 0.06) * uNight;
  // the crack in the Firmament: an impact point, cracks running out from it like broken glass,
  // broken rings around it, and a few pieces missing, where another sky shows through
  float cd = dot(dir, uCrackDir);
  if (cd > 0.55 && uCrackPower > 0.001) {
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
    // while it's spreading, only the part inside its reach shows, with a bright front running outward
    float reach = uCrackGrow * 1.05;
    float gm = 1.0 - smoothstep(reach - 0.06, reach, r);
    float front = exp(-abs(r - reach) * 28.0) * step(uCrackGrow, 0.999);
    c = mix(c, beyond * 1.3, hole * uCrackPower * gm);
    c += uCrack * (ray * 2.4 + ring * 1.8 + core * 2.2 + halo * 0.12) * pulse * uCrackPower * gm;
    c += uCrack * front * (ray * 7.0 + ring * 5.0 + 0.25) * uCrackPower;
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
        body *= mix(1.0, 0.3, uNight);
        vec3 col = mix(body, sky, fres * 0.75);
        // foam: a band along the shore that breathes with the waves
        float wave = sin(depth * 14.0 - t * 2.2 + a * 3.0);
        float foam = smoothstep(0.42, 0.0, depth) * (0.55 + 0.45 * wave);
        foam += smoothstep(0.12, 0.0, depth) * 0.6;
        foam *= smoothstep(0.35, 0.65, n2(p * 2.5 + t * 0.3) + 0.3);
        foam = clamp(foam * inside, 0.0, 1.0);
        col = mix(col, uFoam * mix(1.15, 0.45, uNight), foam);
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

// ---------------------------------------------------------------------------
// Creatures from the Rifts. Each returns its moving parts so foes.js can animate them,
// and a flash(k) for hit flashes. All face +z.
// ---------------------------------------------------------------------------
export function buildFoe(kind) {
  const K = kit();
  const root = new THREE.Group();
  const body = pivot(root);
  const out = { root, body, flash: K.flash, kind };
  if (kind === 'mirrorpuddle') {
    // a walking puddle; its surface shows somebody else's sunset
    const water = ['#3f9fc4', '#4fb2d4', '#62c3e0'];
    K.box(body, 0.98, 0.16, 0.86, water[0], 0, 0.08, 0);
    K.box(body, 0.84, 0.14, 1.0, water[0], 0, 0.08, 0);
    K.box(body, 0.78, 0.14, 0.7, water[1], 0, 0.22, 0);
    K.box(body, 0.56, 0.1, 0.5, water[2], 0, 0.33, 0.02);
    // the other sky, glowing faintly on its back
    K.box(body, 0.46, 0.02, 0.38, '#ff9f7a', 0, 0.385, 0.0, 1.5);
    K.box(body, 0.3, 0.021, 0.18, '#ffd29a', 0, 0.386, -0.08, 1.8);
    K.box(body, 0.04, 0.022, 0.04, '#ffffff', 0.12, 0.387, 0.1, 3);
    K.box(body, 0.03, 0.022, 0.03, '#ffffff', -0.15, 0.387, 0.05, 3);
    // eyes
    for (const x of [-1, 1]) {
      K.box(body, 0.14, 0.16, 0.06, '#f4fbff', x * 0.16, 0.3, 0.36);
      K.box(body, 0.07, 0.09, 0.03, '#152036', x * 0.16 + x * 0.015, 0.29, 0.395);
    }
    // little droplets around the rim
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; K.box(body, 0.1, 0.1, 0.1, water[2], Math.cos(a) * 0.52, 0.06, Math.sin(a) * 0.48); }
    root.add(blob(1.1, 1.0));
  } else if (kind === 'bellfish') {
    // a jellyfish with a tiny drowned room inside: you can see its lit window
    const float = pivot(body, 0, 1.5, 0);
    out.float = float;
    const bell = pivot(float);
    out.bell = bell;
    K.box(bell, 1.0, 0.32, 1.0, '#e2a5d8', 0, 0, 0);
    K.box(bell, 1.12, 0.08, 1.12, '#c98bc3', 0, -0.18, 0);
    K.box(bell, 0.82, 0.24, 0.82, '#eab7e0', 0, 0.26, 0);
    K.box(bell, 0.52, 0.18, 0.52, '#f2c8e9', 0, 0.45, 0);
    K.box(bell, 0.2, 0.1, 0.2, '#f8dcf2', 0, 0.58, 0);
    // the room inside: a lit window, a door, a roof line
    K.box(bell, 0.3, 0.2, 0.02, '#ffd27a', -0.12, 0.02, 0.51, 2.2);
    K.box(bell, 0.03, 0.2, 0.025, '#5d3d26', -0.12, 0.02, 0.515);
    K.box(bell, 0.3, 0.03, 0.025, '#5d3d26', -0.12, 0.02, 0.515);
    K.box(bell, 0.14, 0.24, 0.02, '#6b4a33', 0.2, -0.01, 0.51);
    for (const x of [-1, 1]) K.box(bell, 0.07, 0.07, 0.02, '#2a1830', x * 0.14, 0.3, 0.42);
    out.lamp = K.box(float, 0.16, 0.16, 0.16, '#ffd98a', 0, -0.12, 0, 3);
    // tentacles: three segments each, they sway
    out.tentacles = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const t = pivot(float, Math.cos(a) * 0.32, -0.2, Math.sin(a) * 0.32);
      let p = t;
      const segs = [];
      for (let k = 0; k < 3; k++) {
        K.box(p, 0.06, 0.26, 0.06, k === 2 ? '#f2c8e9' : '#d996cf', 0, -0.13, 0);
        const n = pivot(p, 0, -0.26, 0);
        segs.push(p); p = n;
      }
      out.tentacles.push({ segs, ph: i * 0.9 });
    }
    root.add(blob(0.9, 0.9));
  } else if (kind === 'rootscript') {
    // a hand of roots; letters glow on its knuckles
    const hand = pivot(body);
    out.hand = hand;
    const bark = ['#6b4a33', '#7a5236', '#5d3d26'];
    K.box(hand, 0.38, 0.7, 0.36, bark[0], 0, 0.2, 0);
    K.box(hand, 0.62, 0.36, 0.42, bark[1], 0, 0.66, 0);
    K.box(hand, 0.08, 0.08, 0.02, '#ffc46b', -0.12, 0.66, 0.22, 2.4);
    K.box(hand, 0.06, 0.12, 0.02, '#ffc46b', 0.06, 0.7, 0.22, 2.4);
    K.box(hand, 0.1, 0.04, 0.02, '#ffc46b', 0.18, 0.62, 0.22, 2.4);
    out.fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = pivot(hand, -0.22 + i * 0.15, 0.84, 0.05);
      let p = f;
      for (let k = 0; k < 3; k++) {
        K.box(p, 0.11 - k * 0.02, 0.22, 0.11 - k * 0.02, bark[(i + k) % 3], 0, 0.11, 0);
        if (k === 1 && i % 2 === 0) K.box(p, 0.04, 0.06, 0.02, '#ffc46b', 0, 0.11, 0.06, 2.2);
        const n = pivot(p, 0, 0.22, 0); p = n;
      }
      out.fingers.push(f);
    }
    const thumb = pivot(hand, 0.34, 0.6, 0.06); thumb.rotation.z = -0.7;
    K.box(thumb, 0.12, 0.3, 0.12, bark[2], 0, 0.15, 0);
    out.fingers.push(thumb);
    // roots spreading over the ground
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; K.box(body, 0.6, 0.08, 0.12, bark[i % 3], Math.cos(a) * 0.35, 0.04, Math.sin(a) * 0.35).rotation.y = -a; }
    root.add(blob(0.9, 0.9));
  } else if (kind === 'doorcrab') {
    // a broad crab with big claws in front, and an old front door on its back for a shell
    const shell = ['#d4583f', '#e06a4f', '#b8462f'];
    K.box(body, 1.1, 0.34, 0.9, shell[0], 0, 0.32, 0);
    K.box(body, 0.9, 0.16, 0.74, shell[1], 0, 0.52, 0);
    for (const s2 of [1, -1]) {
      for (const zz of [-0.25, 0, 0.25]) { const l = pivot(body, s2 * 0.55, 0.3, zz); l.rotation.z = s2 * 0.5; K.box(l, 0.4, 0.07, 0.07, shell[2], s2 * 0.2, 0, 0); out['leg' + s2 + zz] = l; }
      for (const xx of [-0.14, 0.14]) { K.box(body, 0.05, 0.22, 0.05, shell[2], xx, 0.6, 0.38); K.box(body, 0.1, 0.1, 0.1, '#f4fbff', xx, 0.74, 0.38); K.box(body, 0.05, 0.05, 0.03, '#1d1726', xx, 0.75, 0.43); }
    }
    out.claws = [];
    for (const s2 of [1, -1]) {
      const c = pivot(body, s2 * 0.42, 0.36, 0.42);
      K.box(c, 0.16, 0.16, 0.36, shell[1], 0, 0, 0.12);
      K.box(c, 0.36, 0.3, 0.36, shell[0], 0, 0.04, 0.42);
      const pin = pivot(c, 0, 0.1, 0.42); K.box(pin, 0.3, 0.1, 0.36, shell[2], 0, 0.04, 0.08); out.claws.push({ c, pin, s: s2 });
    }
    // the door, standing on its back like a hermit's shell: frame, panels, a knob, a little window
    const door = pivot(body, 0, 0.58, -0.32);
    door.rotation.x = -0.35;
    K.box(door, 0.92, 1.3, 0.1, '#5d3d26', 0, 0.62, 0);
    K.box(door, 0.8, 1.18, 0.08, '#7a8a6a', 0, 0.62, -0.03);
    K.box(door, 0.28, 0.4, 0.09, '#6a7a5a', -0.18, 0.95, -0.04); K.box(door, 0.28, 0.4, 0.09, '#6a7a5a', 0.18, 0.95, -0.04);
    K.box(door, 0.28, 0.32, 0.09, '#6a7a5a', -0.18, 0.35, -0.04); K.box(door, 0.28, 0.32, 0.09, '#6a7a5a', 0.18, 0.35, -0.04);
    K.box(door, 0.08, 0.08, 0.06, '#d9b55a', 0.28, 0.62, -0.1);
    K.box(door, 0.3, 0.18, 0.02, '#1d2a3a', 0, 1.1, -0.08);
    // what's behind the door: nothing, glowing a little
    const leaf = pivot(door, -0.4, 0.62, -0.06);
    out.void = K.box(door, 0.76, 1.12, 0.02, '#120a24', 0, 0.62, -0.02, 1);
    out.void.visible = false;
    out.door = door;
    root.add(blob(1.4, 1.2));
  } else if (kind === 'lullabypod') {
    // a woven cocoon; light shows through its seams more and more until it hatches
    const silk = ['#d8cfe6', '#c9bedc', '#e6def0'];
    const pod = pivot(body, 0, 0, 0);
    out.pod = pod;
    [[0.5, 0.2, 0.15], [0.7, 0.3, 0.42], [0.76, 0.3, 0.72], [0.62, 0.26, 1.0], [0.36, 0.22, 1.22], [0.14, 0.14, 1.38]].forEach(([w, h, y], k) => K.box(pod, w, h, w * 0.92, silk[k % 3], 0, y, 0));
    out.seams = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const m = K.box(pod, 0.04, 0.6, 0.04, '#ffd3f2', Math.cos(a) * 0.38, 0.72, Math.sin(a) * 0.36, 1.2);
      out.seams.push(m);
    }
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; K.box(body, 0.5, 0.06, 0.12, '#5c8f3e', Math.cos(a) * 0.4, 0.03, Math.sin(a) * 0.4).rotation.y = -a; }
    root.add(blob(1.0, 1.0));
  } else if (kind === 'gardener') {
    // a great tree hanging upside down from a crack in the dark above; its crown sways near the ground,
    // there's a face in its trunk, and the fruit are tiny worlds
    const hang = pivot(body, 0, 0, 0);
    out.hang = hang;
    const bark = ['#4e3a30', '#5d463a', '#433128'];
    for (let k = 0; k < 7; k++) K.box(hang, 1.2 - k * 0.04, 0.6, 1.1 - k * 0.04, bark[k % 3], (k % 2 - 0.5) * 0.06, 3.6 + k * 0.6, 0);
    // roots spreading into the ceiling crack
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const r2 = pivot(hang, Math.cos(a) * 0.4, 7.6, Math.sin(a) * 0.4); r2.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); K.box(r2, 0.2, 1.6, 0.2, bark[k % 3], 0, 0.7, 0); }
    // the face
    out.eyes = [];
    for (const x of [-0.26, 0.26]) { K.box(hang, 0.24, 0.18, 0.04, '#120a24', x, 4.6, 0.56); out.eyes.push(K.box(hang, 0.12, 0.08, 0.02, '#9ff3ff', x, 4.58, 0.585, 2.6)); }
    K.box(hang, 0.36, 0.12, 0.04, '#120a24', 0, 4.15, 0.56);
    // the crown, hanging low, with branches out to the sides
    out.branches = [];
    const crown = pivot(hang, 0, 3.2, 0);
    out.crown = crown;
    const leaf = ['#3f7a5a', '#4a8a66', '#356a4e'];
    K.box(crown, 2.6, 0.9, 2.4, leaf[0], 0, -0.4, 0);
    K.box(crown, 2.0, 0.7, 1.9, leaf[1], 0, -1.0, 0);
    K.box(crown, 1.2, 0.5, 1.1, leaf[2], 0, -1.45, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      const br = pivot(crown, 0, -0.3, 0);
      br.rotation.y = a;
      K.box(br, 0.22, 0.22, 2.2, bark[k % 3], 0, 0, 1.4);
      K.box(br, 1.0, 0.6, 1.0, leaf[k % 3], 0, -0.2, 2.5);
      out.branches.push(br);
    }
    // fruit: little worlds. A snowy one, a sunny one, a sea one, a forest one.
    out.fruit = [];
    [['#f4fbff', '#cfe8ff'], ['#ffd36b', '#f29a3a'], ['#4fb2d4', '#2a6f8f'], ['#7cc35e', '#3f7a3a']].forEach(([c1, c2], k) => {
      const a = (k / 4) * TAU + 0.8, f = pivot(crown, Math.cos(a) * 1.3, -1.3, Math.sin(a) * 1.2);
      K.box(f, 0.03, 0.4, 0.03, '#4e3a30', 0, 0.2, 0);
      K.box(f, 0.36, 0.36, 0.36, c1, 0, -0.1, 0, 1.5); K.box(f, 0.2, 0.12, 0.38, c2, 0.04, -0.05, 0, 1.4);
      out.fruit.push(f);
    });
    // its heart: a glowing core under the crown, where the hits land
    out.heart = K.box(crown, 0.5, 0.5, 0.5, '#9ff3ff', 0, -1.85, 0, 2.6);
    root.add(blob(3.4, 3.4));
  }
  root.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent) o.castShadow = true; });
  return out;
}

// A floating health bar: a dark frame, a white "chip" that trails behind, and the fill.
// Sprites always face the camera; their anchor points keep the bars left-aligned.
export function buildBar(width = 1.0) {
  const g = new THREE.Group();
  const mk = (color, op, h, order) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, fog: false }));
    s.scale.set(width, h, 1);
    s.renderOrder = 990 + order;
    g.add(s);
    return s;
  };
  const frame = mk('#120a22', 0.78, 0.15, 0);
  frame.scale.x = width + 0.06;
  const chip = mk('#fff3e0', 0.9, 0.09, 1);
  const fill = mk('#ff4d5e', 1, 0.09, 2);
  const shine = mk('#ffb3ba', 0.9, 0.025, 3);
  const setW = (s, w) => { w = Math.max(0.0005, w); s.scale.x = w; s.center.x = (width / 2) / w; };
  shine.center.y = -1.0;
  const bar = {
    group: g, value: 1, chipV: 1,
    set(v) { bar.value = v; setW(fill, width * v); setW(shine, width * v); },
    update(dt) { bar.chipV = Math.max(bar.value, bar.chipV - dt * 0.8); setW(chip, width * bar.chipV); },
    opacity(a) { frame.material.opacity = 0.78 * a; chip.material.opacity = 0.9 * a; fill.material.opacity = a; shine.material.opacity = 0.9 * a; },
  };
  bar.set(1); bar.update(0);
  return bar;
}

// Pickups: a Skyglass sliver and a voxel heart
const sliverGeo = (() => { const b = new Batch(90); b.box(0.12, 0.3, 0.12, '#9ff3ff', 0, 0, 0, { glow: 1.8, jitter: 0 }); b.box(0.07, 0.18, 0.07, '#ffffff', 0.05, 0.05, 0.02, { glow: 2.6, jitter: 0, rotZ: 0.3 }); return b.geometry(); })();
export function buildSliver() { const m = new THREE.Mesh(sliverGeo, MAT.glow); m.castShadow = false; return m; }
const heartGeo = (() => {
  const b = new Batch(91);
  ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'].forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === 'X') b.box(0.09, 0.09, 0.12, y < 2 && x < 3 ? '#ff8a96' : '#ff4d5e', (x - 3) * 0.09, (5 - y) * 0.09 - 0.22, 0, { glow: 1.25, jitter: 0, ao: 0.8 });
  }));
  return b.geometry();
})();
export function buildHeartPickup() { const m = new THREE.Mesh(heartGeo, MAT.glow); return m; }

// The Seep's wall: a ring of Skyglass crystals that rises out of the ground, with a faint shimmering curtain
export function buildBarrier(radius, n = 22) {
  const g = new THREE.Group();
  const b = new Batch(70), gl = new Batch(71), r = rng(71);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    b.box(0.7, 0.4, 0.7, '#6f6a80', x, 0.15, z, { rotY: a });
    const h = 1.3 + r() * 1.0;
    gl.box(0.34, h, 0.34, '#7fe8ff', x, h / 2 + 0.2, z, { glow: 1.25, rotY: a + 0.4, rotZ: (r() - 0.5) * 0.3, jitter: 0.2 });
    gl.box(0.22, h * 0.6, 0.22, '#c6f8ff', x + Math.cos(a + 1.6) * 0.22, h * 0.3 + 0.2, z + Math.sin(a + 1.6) * 0.22, { glow: 1.6, rotZ: (r() - 0.5) * 0.6, jitter: 0.2 });
  }
  g.add(b.mesh());
  const gm = gl.mesh(MAT.glow); gm.castShadow = false; g.add(gm);
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 2.6, 64, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTime: SKY_UNIFORMS.uTime, uA: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uA; varying vec2 vUv;
      void main() {
        float lines = 0.5 + 0.5 * sin(vUv.x * 160.0 + uTime * 2.0) * sin(vUv.y * 9.0 - uTime * 1.5);
        float a = (1.0 - vUv.y) * (0.18 + 0.1 * lines) * uA;
        gl_FragColor = vec4(vec3(0.5, 0.95, 1.0) * a * 1.4, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  curtain.position.y = 1.3;
  g.add(curtain);
  return { group: g, curtain };
}

// A crack of light in the ground: where a creature crawls out
export function buildRiftCrack() {
  const g = new Batch(72), r = rng(72);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + r() * 0.4, len = 0.5 + r() * 0.5;
    g.box(len, 0.02, 0.06, '#c6f8ff', Math.cos(a) * len / 2, 0.02, Math.sin(a) * len / 2, { rotY: -a, glow: 2.4, jitter: 0, ao: 1 });
  }
  g.box(0.3, 0.02, 0.3, '#ffffff', 0, 0.02, 0, { glow: 3, jitter: 0, ao: 1, rotY: 0.6 });
  const m = g.mesh(MAT.glowAdd); m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = true;
  return m;
}

// Rootscript's warning: glowing letters written into the ground, one by one, in a ring
const glyphMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc46b').multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
export function buildGlyphRing(radius) {
  const group = new THREE.Group();
  const glyphs = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const gb = new Batch(80 + i);
    // each letter is a few strokes
    const shapes = [[[0.16, 0.04, 0], [0.04, 0.16, 0.06]], [[0.04, 0.16, 0], [0.12, 0.04, 0.06], [0.12, 0.04, -0.06]], [[0.16, 0.04, 0.06], [0.16, 0.04, -0.06], [0.04, 0.12, 0]]][i % 3];
    for (const [w, d, oz] of shapes) gb.box(w, 0.02, d, '#ffffff', 0, 0, oz, { jitter: 0, ao: 1 });
    const m = new THREE.Mesh(gb.geometry(), glyphMat);
    m.position.set(Math.cos(a) * radius, 0.04, Math.sin(a) * radius);
    m.rotation.y = -a;
    m.visible = false;
    group.add(m); glyphs.push(m);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), discMat.clone());
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03;
  group.add(disc);
  return { group, glyphs, disc };
}

// Bellfish orbs
const orbGeo = new THREE.BoxGeometry(1, 1, 1);
const orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8fd0').multiplyScalar(2.2) });
const orbCore = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.6) });
export function buildOrb(r) {
  const g = new THREE.Group();
  const a = new THREE.Mesh(orbGeo, orbMat); a.scale.setScalar(r * 1.6); g.add(a);
  const b = new THREE.Mesh(orbGeo, orbCore); b.scale.setScalar(r * 0.8); g.add(b);
  return g;
}

// ---------------------------------------------------------------------------
// The people of Lanternhold: built on the apprentice's body with their own colours and a few extras
// ---------------------------------------------------------------------------
const NPC_LOOKS = {
  maren: { body: 'b', hair: 3, skin: '#e3b896', hairColor: '#d9d4cf', tunic: '#2b3d5e', trim: '#c9a24a', scarf: '#7a2f45', pants: '#22304a', boots: '#2a1e18' },
  tobin: { body: 'a', hair: 0, skin: '#d4a07c', hairColor: '#8a6a4a', tunic: '#e0b23a', trim: '#c79a28', scarf: '#3f6f8f', pants: '#3a3a48', boots: '#2f3a44' },
  wenna: { body: 'b', hair: 1, skin: '#f1c8a0', hairColor: '#a0522d', tunic: '#c46a4a', trim: '#f4ead2', scarf: '#f4ead2', pants: '#5a4a6a', boots: '#4a3020' },
  pip: { body: 'a', hair: 2, skin: '#f5d2b0', hairColor: '#e0a040', tunic: '#5fa8d6', trim: '#ffffff', scarf: '#e0573f', pants: '#4a5a8a', boots: '#5d3d26' },
};
export function buildNpc(kind) {
  const m = buildPlayer(NPC_LOOKS[kind]);
  const { box } = m.K;
  const L = NPC_LOOKS[kind];
  if (kind === 'maren') {
    // the Keeper: a long coat to the knees, a shawl, and her lamp, always lit
    box(m.body, 0.46, 0.36, 0.3, L.tunic, 0, 0.36, 0);
    box(m.body, 0.48, 0.05, 0.31, L.trim, 0, 0.2, 0);
    box(m.torso, 0.5, 0.14, 0.32, L.scarf, 0, 0.17, 0);
    const lamp = pivot(m.handL, 0, -0.05, 0.08);
    box(lamp, 0.03, 0.14, 0.03, '#3a3a44', 0, -0.06, 0);
    box(lamp, 0.16, 0.03, 0.16, '#3a3a44', 0, -0.14, 0);
    box(lamp, 0.12, 0.14, 0.12, '#ffe9a8', 0, -0.23, 0, 3.2);
    box(lamp, 0.16, 0.03, 0.16, '#3a3a44', 0, -0.31, 0);
    m.lamp = lamp;
  } else if (kind === 'tobin') {
    // the fisherman: a sou'wester hat and a grey beard
    box(m.head, 0.46, 0.08, 0.5, L.tunic, 0, 0.43, -0.02);
    box(m.head, 0.36, 0.12, 0.36, L.tunic, 0, 0.5, -0.02);
    box(m.head, 0.3, 0.14, 0.06, '#b8b0a8', 0, 0.06, 0.18);
    box(m.head, 0.2, 0.08, 0.06, '#b8b0a8', 0, -0.02, 0.18);
  } else if (kind === 'wenna') {
    // the baker: an apron dusted with flour, and a scarf tied over her hair
    box(m.torso, 0.3, 0.42, 0.02, '#f4ead2', 0, -0.1, 0.135);
    box(m.body, 0.4, 0.3, 0.29, '#f4ead2', 0, 0.36, 0.01);
    for (const [x, y] of [[-0.06, 0.05], [0.08, -0.12], [-0.1, -0.2]]) box(m.torso, 0.04, 0.04, 0.025, '#ffffff', x, y, 0.15);
    box(m.head, 0.42, 0.1, 0.42, '#e0573f', 0, 0.42, -0.01);
  } else if (kind === 'pip') {
    // a kid with a wooden sword, just like yours
    m.root.scale.setScalar(0.78);
    const sw = pivot(m.handR, 0, 0, 0.02);
    sw.rotation.x = Math.PI * 0.5 - 0.3;
    box(sw, 0.05, 0.05, 0.16, '#6b4a33', 0, 0, 0);
    box(sw, 0.18, 0.04, 0.04, '#6b4a33', 0, 0, 0.09);
    box(sw, 0.06, 0.03, 0.5, '#c8a77a', 0, 0, 0.36);
  }
  return m;
}

// ---------------------------------------------------------------------------
// The Drowned Orchard: props (built into batches like the cove's)
// ---------------------------------------------------------------------------
export const ORCHARD = {
  // a fruit tree that has grown up under the sea: pale trunk, blue-green leaves, glowing fruit
  tree(b, g, x, y, z, r, s = 1) {
    b.push(x, y, z, r() * TAU, 0, 0, s);
    b.box(0.36, 1.8, 0.36, '#8a8a7a', 0, 0.9, 0);
    b.box(0.6, 0.2, 0.6, '#6f7a6a', 0, 0.1, 0);
    const leaf = pick(['#3f8a8a', '#4a9a92', '#357a7a'], r);
    b.box(1.9, 1.0, 1.9, leaf, 0, 2.2, 0, { ao: 0.8 });
    b.box(1.3, 0.7, 1.3, shade(leaf, 1.12), 0.1, 2.9, 0, { ao: 0.85 });
    b.box(0.7, 0.6, 0.7, shade(leaf, 0.9), 0.8, 2.0, 0.3);
    b.box(0.6, 0.5, 0.6, shade(leaf, 0.95), -0.8, 2.3, -0.4);
    for (let k = 0; k < 6; k++) b.box(0.08, 0.6 + r() * 0.5, 0.08, '#2f6a5a', (r() - 0.5) * 1.8, 1.4, (r() - 0.5) * 1.8, { jitter: 0.1 });
    b.pop();
    g.push(x, y, z, 0, 0, 0, s);
    for (let k = 0; k < 4; k++) g.box(0.2, 0.2, 0.2, pick(['#ffb38a', '#ff8fd0', '#ffd36b'], r), (r() - 0.5) * 1.6, 1.75 + r() * 0.3, (r() - 0.5) * 1.6, { glow: 1.6, jitter: 0 });
    g.pop();
  },
  coral(b, g, x, y, z, r) {
    const c = pick(['#ff7a8a', '#ff9f6b', '#c98bff', '#ffcf6b'], r);
    for (let k = 0; k < 5; k++) {
      const h = 0.4 + r() * 0.9, ox = (r() - 0.5) * 0.9, oz = (r() - 0.5) * 0.9;
      b.box(0.16, h, 0.16, c, x + ox, y + h / 2, z + oz, { rotZ: (r() - 0.5) * 0.5, rotX: (r() - 0.5) * 0.5 });
      b.box(0.24, 0.12, 0.24, shade(c, 1.15), x + ox, y + h, z + oz);
    }
    b.box(1.1, 0.25, 1.0, '#7d8a8a', x, y + 0.12, z, { top: '#8f9c9a' });
  },
  rock(b, x, y, z, r) {
    b.push(x, y, z, r() * TAU);
    b.box(1.4, 0.9, 1.1, '#6f7c86', 0, 0.45, 0, { top: '#7f8e98' });
    b.box(0.9, 0.6, 0.8, '#7a8892', 0.2, 1.1, 0, { top: '#8a9aa4' });
    b.box(0.7, 0.12, 0.6, '#3f8a6a', -0.2, 0.95, 0.1);
    b.pop();
  },
  kelp(b, x, y, z, r) {
    for (let k = 0; k < 4; k++) {
      const ox = (r() - 0.5) * 0.8, oz = (r() - 0.5) * 0.8, h = 1.4 + r() * 1.6;
      for (let s = 0; s < h; s += 0.35) b.box(0.12, 0.36, 0.06, s % 0.7 < 0.35 ? '#3f7a3a' : '#4a8a46', x + ox + Math.sin(s * 2 + k) * 0.08, y + s + 0.18, z + oz, { jitter: 0.1 });
    }
  },
  pool(b, g, x, y, z) {
    // a pool of light in the floor: a spring of the Rift's water
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; b.box(0.5, 0.2, 0.5, '#8a9aa4', x + Math.cos(a) * 1.2, y + 0.1, z + Math.sin(a) * 1.2, { rotY: a }); }
    g.box(2.0, 0.04, 2.0, '#5fd6ec', x, y + 0.03, z, { glow: 1.1, jitter: 0, ao: 1 });
  },
  // hanging jellyfish lanterns: they glow and bob over the rooms
  jelly(g, x, y, z, r) {
    const c = pick(['#ff9fe0', '#9ff3ff', '#ffd29a'], r);
    g.box(0.5, 0.3, 0.5, c, x, y, z, { glow: 1.4, jitter: 0 });
    g.box(0.34, 0.18, 0.34, '#ffffff', x, y + 0.2, z, { glow: 1.6, jitter: 0 });
    for (let k = 0; k < 4; k++) g.box(0.04, 0.6, 0.04, c, x + (k - 1.5) * 0.12, y - 0.42, z, { glow: 0.9, jitter: 0 });
  },
};

// a little voxel fish that swims through the air of the Rift
export function buildFish(color) {
  const b = new Batch(95);
  b.box(0.36, 0.2, 0.14, color, 0, 0, 0);
  b.box(0.14, 0.18, 0.04, shade(color, 0.85), -0.24, 0, 0);
  b.box(0.04, 0.04, 0.15, '#1d1726', 0.12, 0.04, 0);
  const m = b.mesh(); m.castShadow = false; m.matrixAutoUpdate = true;
  return m;
}

// the treasure chest: lid opens
export function buildChest() {
  const K = kit();
  const root = new THREE.Group();
  K.box(root, 1.0, 0.5, 0.7, '#8b5e3c', 0, 0.25, 0);
  K.box(root, 1.04, 0.08, 0.74, '#c9a24a', 0, 0.06, 0);
  const lid = pivot(root, 0, 0.5, -0.35);
  K.box(lid, 1.04, 0.24, 0.74, '#9a6b45', 0, 0.12, 0.35);
  K.box(lid, 1.06, 0.06, 0.76, '#c9a24a', 0, 0.2, 0.35);
  K.box(root, 0.16, 0.2, 0.06, '#d9b55a', 0, 0.45, 0.37);
  const glow = K.box(root, 0.8, 0.1, 0.5, '#ffe9a8', 0, 0.48, 0, 3);
  glow.visible = false;
  root.add(blob(1.2, 1.0));
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, lid, glow };
}

// the heart-glass: what the Gardener leaves behind
export function buildHeartGlass() {
  const b = new Batch(96);
  b.box(0.6, 0.9, 0.6, '#9ff3ff', 0, 0, 0, { glow: 2.2, rotY: 0.785, jitter: 0 });
  b.box(0.36, 0.6, 0.36, '#ffffff', 0, 0.1, 0, { glow: 3, rotY: 0.3, jitter: 0 });
  b.box(0.3, 0.5, 0.3, '#ff9fe0', 0.3, -0.2, 0, { glow: 2, rotZ: 0.5, jitter: 0 });
  const m = b.mesh(MAT.glow); m.castShadow = false; m.matrixAutoUpdate = true;
  return m;
}

// floors of the Rift get moving caustics, like light through water
export const CAUSTICS = { uTime: { value: 0 } };
export function causticMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = CAUSTICS.uTime;
    sh.vertexShader = 'varying vec3 vWp; varying vec3 vWn;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWp; varying vec3 vWn;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 cp = vWp.xz * 0.55;
      float c1 = sin(cp.x * 2.1 + uTime * 1.1 + sin(cp.y * 1.7 + uTime * 0.7) * 1.4);
      float c2 = sin(cp.y * 2.3 - uTime * 0.9 + sin(cp.x * 1.3 - uTime * 0.6) * 1.6);
      float caus = pow(max(0.0, 1.0 - abs(c1 + c2) * 0.6), 6.0);
      totalEmissiveRadiance += vec3(0.35, 0.85, 0.9) * caus * 0.35 * clamp(vWn.y, 0.0, 1.0);`);
  };
  return m;
}
