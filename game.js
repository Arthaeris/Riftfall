/* Riftfall — game.js
   The heart of the game: renderer and its look, camera, the apprentice, combat, sound and the main loop. */
import * as THREE from 'three';
import { VERSION, CONFIG, WEAPONS, PLACES, PALETTE, TEXT, HURT, SEEP, TIMES, RIFT, STORY, TOOLS, CAVES } from '@rf/data';
import { buildPlayer, buildSkyblade, buildTidesling, createSparks, createBits, slashMesh, clamp, lerp, TAU, Batch, MAT, SKY_UNIFORMS } from '@rf/art';
import { createStory } from '@rf/story';
import { buildCove, buildRift, buildCaves } from '@rf/world';
import { createFoes } from '@rf/foes';
import { createUI, loadPrefs, loadingDone, loadingFailed, view, updateView } from '@rf/ui';

const V3 = THREE.Vector3;
const damp = (k, dt) => 1 - Math.pow(k, dt);   // frame-rate independent smoothing
const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// ===========================================================================
// Renderer and the look: HDR scene -> bloom -> ink outline, colour grade, vignette -> tone map
// ===========================================================================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.Fog(PALETTE.fog, 36, 95);
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, view.w / view.h, 0.4, 600);

const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 3.6);
sun.castShadow = true;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
// a cool rim light from the sea side, so silhouettes read against the dusk
const rim = new THREE.DirectionalLight('#8fb4ff', 0.6);
rim.position.set(10, 6, 12);
scene.add(rim);

const prefs = loadPrefs();
const QUALITY = {
  2: { pr: Math.min(devicePixelRatio || 1, 2), msaa: 4, shadow: 2048, bloom: 1 },
  1: { pr: Math.min(devicePixelRatio || 1, 1.5), msaa: 2, shadow: 1024, bloom: 1 },
  0: { pr: 1, msaa: 0, shadow: 0, bloom: 0 },
};
const look = { level: 2, slow: 0, watch: 0 };
function qualityLevel() {
  if (prefs.quality === 'high') return 2;
  if (prefs.quality === 'medium') return 1;
  if (prefs.quality === 'low') return 0;
  return prefs.autoLevel != null ? prefs.autoLevel : 2;
}

const FS = (() => {
  const s = new THREE.Scene(), c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  q.frustumCulled = false; s.add(q);
  return { draw(mat, target) { q.material = mat; renderer.setRenderTarget(target); renderer.render(s, c); } };
})();
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const fsMat = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false });

const post = (() => {
  let main = null, w = 0, h = 0, msaa = -1;
  const chain = [];   // bloom: [down0..down4], [up0..up3]
  const bright = fsMat(`uniform sampler2D tSrc; uniform float thr; varying vec2 vUv;
    void main() { vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b));
      float k = clamp((l - thr + 0.5) / 1.0, 0.0, 1.0); k = k * k * 0.5; float w = max(k, l - thr) / max(l, 1e-4);
      gl_FragColor = vec4(min(c * w, vec3(12.0)), 1.0); }`, { tSrc: { value: null }, thr: { value: 1.0 } });
  const down = fsMat(`uniform sampler2D tSrc; uniform vec2 px; varying vec2 vUv;
    void main() { vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
      c += texture2D(tSrc, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(-px.x, px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, px.y)).rgb;
      gl_FragColor = vec4(c / 8.0, 1.0); }`, { tSrc: { value: null }, px: { value: new THREE.Vector2() } });
  const up = fsMat(`uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 px; uniform float mixK; varying vec2 vUv;
    void main() { vec3 c = vec3(0.0);
      c += texture2D(tSrc, vUv + vec2(-px.x, 0.0)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb * 2.0;
      c += texture2D(tSrc, vUv + vec2(0.0, -px.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb * 2.0;
      c += texture2D(tSrc, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(-px.x, px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, px.y)).rgb;
      gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb * mixK, 1.0); }`, { tSrc: { value: null }, tBase: { value: null }, px: { value: new THREE.Vector2() }, mixK: { value: 1 } });
  const final = fsMat(`uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom;
    uniform vec2 texel; uniform float cnear, cfar, ink, bloomK, vig, edges, aspect, seed, flash; uniform vec3 grade; uniform float sat; uniform vec3 flashCol;
    varying vec2 vUv;
    float lin(vec2 uv) { float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * cnear * cfar / (cfar + cnear - z * (cfar - cnear)); }
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      if (edges > 0.5) {
        float d0 = lin(vUv);
        float dl = lin(vUv - vec2(texel.x, 0.0)), dr = lin(vUv + vec2(texel.x, 0.0));
        float dd = lin(vUv - vec2(0.0, texel.y)), du = lin(vUv + vec2(0.0, texel.y));
        float far = max(max(dl, dr), max(dd, du)) - d0;
        float sil = smoothstep(0.03, 0.07, far / d0);
        float crease = smoothstep(0.004, 0.012, (abs(dl + dr - 2.0 * d0) + abs(dd + du - 2.0 * d0)) / d0);
        float e = max(sil, crease * 0.55);
        if (d0 > cfar * 0.9) e = 0.0;
        e *= 1.0 - smoothstep(30.0, 70.0, d0);
        col *= 1.0 - ink * e;
      }
      col += texture2D(tBloom, vUv).rgb * bloomK;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat) * grade;
      col = mix(col, flashCol, flash);
      vec2 q = (vUv - 0.5) * vec2(aspect, 1.0) * 1.5;
      col *= mix(1.0, smoothstep(1.2, 0.2, length(q)), vig);
      float n = fract(sin(dot(vUv * 913.7 + seed, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) / 255.0;
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, {
    tColor: { value: null }, tDepth: { value: null }, tBloom: { value: null }, texel: { value: new THREE.Vector2() },
    cnear: { value: 0.4 }, cfar: { value: 600 }, ink: { value: 0.55 }, bloomK: { value: 0.75 }, vig: { value: 0.42 }, edges: { value: 1 },
    aspect: { value: 1 }, seed: { value: 0 }, grade: { value: new THREE.Vector3(1.04, 0.99, 0.97) }, sat: { value: 1.08 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) },
  });
  final.toneMapped = true;
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const rt = (W, H) => new THREE.WebGLRenderTarget(Math.max(1, W), Math.max(1, H), { type: THREE.HalfFloatType, depthBuffer: false });
  function make(W, H, samples) {
    if (main) { main.dispose(); chain.forEach((c) => c.dispose()); chain.length = 0; }
    main = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(W, H) });
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < 5; i++) { chain.push(rt(bw, bh)); bw >>= 1; bh >>= 1; }
    for (let i = 0; i < 4; i++) chain.push(rt(chain[i].width, chain[i].height));
    w = W; h = H; msaa = samples;
  }
  const size = new THREE.Vector2();
  return {
    final,
    render() {
      const Q = QUALITY[look.level];
      renderer.getDrawingBufferSize(size);
      if (!main || w !== size.x || h !== size.y || msaa !== Q.msaa) make(size.x, size.y, Q.msaa);
      renderer.setRenderTarget(main);
      renderer.render(scene, camera);
      let bloomTex = black;
      if (Q.bloom) {
        bright.uniforms.tSrc.value = main.texture;
        FS.draw(bright, chain[0]);
        for (let i = 1; i < 5; i++) { down.uniforms.tSrc.value = chain[i - 1].texture; down.uniforms.px.value.set(1 / chain[i - 1].width, 1 / chain[i - 1].height); FS.draw(down, chain[i]); }
        let src = chain[4];
        for (let i = 3; i >= 0; i--) {
          const dst = chain[5 + i];
          up.uniforms.tSrc.value = src.texture; up.uniforms.tBase.value = chain[i].texture; up.uniforms.px.value.set(1 / src.width, 1 / src.height);
          FS.draw(up, dst);
          src = dst;
        }
        bloomTex = src.texture;
      }
      const U = final.uniforms;
      U.tColor.value = main.texture; U.tDepth.value = main.depthTexture; U.tBloom.value = bloomTex;
      const k = Math.max(1, renderer.getPixelRatio() * 0.75);
      U.texel.value.set(k / size.x, k / size.y);
      U.cnear.value = camera.near; U.cfar.value = camera.far; U.aspect.value = size.x / size.y;
      U.seed.value = (U.seed.value + 0.37) % 100;
      U.edges.value = look.level > 0 ? 1 : 0;
      FS.draw(final, null);
    },
  };
})();

function applyQuality() {
  look.level = qualityLevel();
  const Q = QUALITY[look.level];
  renderer.setPixelRatio(Q.pr);
  renderer.setSize(view.w, view.h, false);
  sun.castShadow = Q.shadow > 0;
  if (Q.shadow && sun.shadow.mapSize.x !== Q.shadow) {
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
}
// "Automatic": if frames run long for a while, step down a level for good
function watchFrames(dt) {
  if (prefs.quality !== 'auto' || document.hidden || paused) { look.slow = 0; return; }
  look.watch += dt;
  if (look.watch < 5) return;
  if (dt > 1 / 32) look.slow += dt; else look.slow = Math.max(0, look.slow - dt * 0.5);
  if (look.slow > 2.5 && look.level > 0) {
    prefs.autoLevel = look.level - 1;
    try { localStorage.setItem('riftfall-prefs', JSON.stringify(prefs)); } catch (_) { /* fine */ }
    look.slow = 0; look.watch = 0;
    applyQuality();
  }
}
// the stage is always landscape (see ui.js): when the screen turns, only the stage's size is read again
function onResize() { updateView(); camera.aspect = view.w / view.h; camera.updateProjectionMatrix(); renderer.setSize(view.w, view.h, false); }
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 250));

// ===========================================================================
// Sound: all synthesized, no files. Ocean, a quiet generative tune, and the effects.
// ===========================================================================
const sound = (() => {
  let ctx = null, master, sfxBus, musicBus, ambBus, noiseBuf, delay;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14; master.ratio.value = 4;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); musicBus = ctx.createGain(); ambBus = ctx.createGain();
    sfxBus.connect(master); musicBus.connect(master); ambBus.connect(master);
    volumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // echo for the music
    delay = ctx.createDelay(1.5); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(musicBus);
    ocean();
  }
  function volumes() { if (!ctx) return; sfxBus.gain.value = prefs.sfx * 0.9; musicBus.gain.value = prefs.music * 0.32; ambBus.gain.value = 0.55 * Math.max(prefs.sfx, 0.2); }
  function noise(dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = dur > 1.9; s.start(ctx.currentTime, Math.random() * 1.5); if (!s.loop) s.stop(ctx.currentTime + dur); return s; }
  function ocean() {
    // two slow swells of filtered noise, out of step with each other
    for (const [f, rate, g0] of [[480, 0.09, 0.22], [900, 0.13, 0.08]]) {
      const n = noise(99); n.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = g0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
      const lg = ctx.createGain(); lg.gain.value = g0 * 0.8;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      n.connect(lp); lp.connect(g); g.connect(ambBus);
    }
  }
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(type, f0, f1, dur, vol, bus = sfxBus, at = 0) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, vol, dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function hiss(type, f0, f1, q, dur, vol, at = 0) {
    const t = ctx.currentTime + at, n = noise(dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.01, vol, dur); n.connect(f); f.connect(g); g.connect(sfxBus);
  }
  function sfx(name, k = 1) {
    if (!ctx) return;
    const r = 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'swing': hiss('bandpass', 900 * r, 3200 * r, 1.4, 0.13, 0.35 * k); tone('sine', 520 * r, 980 * r, 0.09, 0.04); break;
      case 'swingHeavy': hiss('bandpass', 500, 2600, 1.1, 0.24, 0.5); tone('triangle', 220, 440, 0.2, 0.06); break;
      case 'hit': tone('sine', 150 * r, 55, 0.16, 0.6 * k); hiss('highpass', 2500, 0, 0.7, 0.05, 0.3 * k); tone('square', 880 * r, 660, 0.05, 0.04 * k); break;
      case 'wood': tone('triangle', 240 * r, 160, 0.1, 0.35 * k); tone('triangle', 410 * r, 300, 0.06, 0.15 * k); break;
      case 'roll': hiss('lowpass', 1400, 300, 0.8, 0.3, 0.32); break;
      case 'land': hiss('lowpass', 700, 200, 0.6, 0.12, 0.25); break;
      case 'sling': tone('sine', 520 * r, 980 * r, 0.08, 0.14); hiss('bandpass', 2000, 4200, 2, 0.07, 0.12); break;
      case 'splash': hiss('bandpass', 2600 * r, 900, 1.2, 0.18, 0.28 * k); tone('sine', 1300 * r, 600, 0.06, 0.06 * k); break;
      case 'step': hiss('bandpass', 1400 * r, 0, 1.5, 0.05, 0.05 * k); break;
      case 'tick': tone('sine', 1500, 0, 0.04, 0.06); break;
      case 'open': tone('sine', 660, 990, 0.12, 0.07); break;
      case 'deny': tone('triangle', 300, 220, 0.12, 0.12); break;
      case 'shimmer': for (let i = 0; i < 4; i++) tone('sine', 1320 * Math.pow(1.25, i), 0, 0.5, 0.035, sfxBus, i * 0.07); break;
      case 'emerge': hiss('bandpass', 400, 2400, 1.5, 0.6, 0.18); tone('sine', 300, 900, 0.5, 0.05); break;
      case 'hop': tone('sine', 320 * r, 520 * r, 0.07, 0.08 * k); break;
      case 'puddleTell': tone('triangle', 520, 380, 0.4, 0.07); hiss('bandpass', 1800, 900, 3, 0.4, 0.08); break;
      case 'leap': tone('sine', 240, 700, 0.25, 0.12); break;
      case 'splat': hiss('lowpass', 1600, 300, 0.8, 0.25, 0.35); tone('sine', 180, 90, 0.15, 0.2); break;
      case 'squelch': hiss('bandpass', 900 * r, 2400, 2, 0.12, 0.3 * k); tone('sine', 260 * r, 140, 0.1, 0.15 * k); break;
      case 'bellTell': for (let i = 0; i < 3; i++) tone('sine', 880 * Math.pow(1.5, i % 2), 0, 0.5, 0.04, sfxBus, i * 0.18); break;
      case 'bellRing': tone('sine', 1320, 0, 1.2, 0.08); tone('sine', 1980, 0, 0.9, 0.05); tone('triangle', 660, 0, 0.7, 0.05); break;
      case 'bellHit': tone('sine', 1100 * r, 0, 0.35, 0.12 * k); tone('triangle', 700 * r, 500, 0.12, 0.1 * k); break;
      case 'orbPop': tone('sine', 1600 * r, 900, 0.06, 0.05); break;
      case 'rootRumble': tone('sine', 70, 50, 0.6, 0.25); hiss('lowpass', 300, 120, 0.8, 0.5, 0.2); break;
      case 'glyph': for (let i = 0; i < 4; i++) tone('triangle', 440 * Math.pow(1.122, i), 0, 0.25, 0.05, sfxBus, i * 0.15); break;
      case 'burst': tone('sine', 110, 40, 0.4, 0.5); hiss('lowpass', 1200, 200, 0.6, 0.35, 0.45); break;
      case 'pop': tone('sine', 600 * r, 1400 * r, 0.12, 0.14); hiss('highpass', 3000, 0, 0.6, 0.15, 0.18); for (let i = 0; i < 3; i++) tone('sine', 1500 * Math.pow(1.26, i), 0, 0.2, 0.03, sfxBus, 0.05 + i * 0.05); break;
      case 'sliver': tone('sine', 1400 * k, 0, 0.12, 0.05); tone('sine', 2100 * k, 0, 0.1, 0.025); break;
      case 'heart': for (let i = 0; i < 3; i++) tone('triangle', 660 * Math.pow(1.26, i), 0, 0.25, 0.08, sfxBus, i * 0.08); break;
      case 'hurt': tone('square', 220, 110, 0.18, 0.08); tone('sine', 140, 70, 0.25, 0.35); hiss('lowpass', 900, 200, 0.7, 0.2, 0.25); break;
      case 'barrierUp': tone('sine', 80, 160, 1.0, 0.3); for (let i = 0; i < 5; i++) tone('sine', 900 + i * 220, 0, 0.6, 0.03, sfxBus, i * 0.12); break;
      case 'barrierDown': tone('sine', 160, 70, 1.0, 0.25); hiss('lowpass', 800, 200, 0.6, 0.8, 0.15); break;
      case 'clear': [0, 4, 7, 12, 16].forEach((st, i) => tone('triangle', 523.25 * Math.pow(2, st / 12), 0, 0.6, 0.09, sfxBus, i * 0.11)); break;
      case 'fall': tone('sine', 300, 60, 1.4, 0.25); hiss('lowpass', 600, 100, 0.6, 1.2, 0.2); break;
      case 'wake': [0, 7, 12].forEach((st, i) => tone('sine', 392 * Math.pow(2, st / 12), 0, 0.9, 0.06, sfxBus, i * 0.2)); break;
      case 'blip': tone('sine', 880, 0, 0.05, 0.03); break;
      case 'voice': tone('triangle', 300 + Math.random() * 160, 0, 0.045, 0.025); break;
      case 'tetherOut': hiss('bandpass', 1800, 4200, 2, 0.25, 0.18); tone('triangle', 500, 1100, 0.18, 0.05); break;
      case 'tetherBite': tone('square', 1500, 700, 0.07, 0.08); tone('triangle', 2600, 1800, 0.12, 0.05); break;
      case 'land': tone('sine', 140, 60, 0.18, 0.35); hiss('lowpass', 900, 200, 0.6, 0.15, 0.2); break;
      case 'unlock': tone('triangle', 900, 900, 0.06, 0.08); tone('triangle', 1350, 1350, 0.1, 0.08, sfxBus, 0.08); tone('sine', 300, 200, 0.3, 0.12, sfxBus, 0.12); break;
      case 'pot': hiss('bandpass', 1600, 700, 1.4, 0.16, 0.3); tone('triangle', 420 * r, 200, 0.1, 0.12); break;
      case 'spit': tone('square', 300 * r, 900, 0.06, 0.05); hiss('highpass', 2000, 0, 1, 0.05, 0.12); break;
      case 'skitter': for (let i = 0; i < 3; i++) tone('square', 2400 * r + i * 300, 0, 0.02, 0.025, sfxBus, i * 0.03); break;
      case 'heal': [0, 4, 7, 12].forEach((st, i) => tone('sine', 523.25 * Math.pow(2, st / 12), 0, 0.9, 0.05, sfxBus, i * 0.11)); hiss('bandpass', 3000, 6000, 2, 0.8, 0.03); break;
      case 'quest': [0, 5, 9].forEach((st, i) => tone('sine', 659.25 * Math.pow(2, st / 12), 0, 0.5, 0.06, sfxBus, i * 0.09)); break;
      case 'beacon': [0, 4, 7, 11, 14].forEach((st, i) => tone('sine', 587.33 * Math.pow(2, st / 12), 0, 0.9, 0.05, sfxBus, i * 0.07)); tone('sine', 146.8, 0, 1.4, 0.15); break;
      case 'crack': for (let i = 0; i < 6; i++) hiss('highpass', 3000 + i * 600, 0, 1, 0.08, 0.3, i * 0.06); tone('sine', 2200, 1100, 1.2, 0.06); tone('sine', 55, 30, 3, 0.4); break;
      case 'streak': hiss('bandpass', 4000, 800, 3, 1.2, 0.06); break;
      case 'impact': tone('sine', 80, 25, 1.6, 0.7); hiss('lowpass', 2000, 100, 0.6, 1.4, 0.6); for (let i = 0; i < 5; i++) tone('sine', 1760 * Math.pow(1.12, i), 0, 1.0, 0.04, sfxBus, 0.1 + i * 0.06); break;
      case 'clank': tone('square', 1200 * r, 900, 0.06, 0.06); tone('triangle', 2400 * r, 0, 0.12, 0.06); break;
      case 'crabTell': tone('square', 220, 330, 0.3, 0.05); break;
      case 'snap': tone('square', 600, 200, 0.08, 0.12); hiss('highpass', 2500, 0, 1, 0.06, 0.2); break;
      case 'doorOpen': tone('triangle', 180, 90, 0.5, 0.15); hiss('lowpass', 500, 120, 0.6, 0.9, 0.2); break;
      case 'doorSlam': tone('sine', 120, 50, 0.25, 0.5); hiss('lowpass', 1200, 200, 0.6, 0.2, 0.35); break;
      case 'hum': [0, 4, 7].forEach((st, i) => tone('sine', 330 * Math.pow(2, st / 12), 0, 1.4, 0.018, sfxBus, i * 0.5)); break;
      case 'hatch': hiss('bandpass', 1400, 600, 1.2, 0.3, 0.3); tone('sine', 400, 900, 0.2, 0.08); break;
      case 'roar': tone('sawtooth', 70, 50, 1.2, 0.12); tone('sine', 55, 40, 1.4, 0.4); hiss('lowpass', 600, 150, 0.6, 1.2, 0.25); break;
      case 'rustle': hiss('bandpass', 2500, 1500, 1.5, 0.5, 0.18); break;
      case 'creak': tone('sawtooth', 110, 140, 0.8, 0.06); hiss('bandpass', 700, 900, 4, 0.8, 0.12); break;
      case 'roomClear': [0, 7, 12].forEach((st, i) => tone('triangle', 587.33 * Math.pow(2, st / 12), 0, 0.5, 0.07, sfxBus, i * 0.1)); break;
      case 'treasure': [0, 4, 7, 12, 16, 19].forEach((st, i) => tone('triangle', 523.25 * Math.pow(2, st / 12), 0, 0.7, 0.08, sfxBus, i * 0.08)); break;
      case 'wind': hiss('bandpass', 500, 900, 0.6, 3.5, 0.18); hiss('bandpass', 1400, 700, 1.2, 3, 0.06, 0.6); break;
      case 'blur': tone('sine', 62, 44, 5, 0.35); tone('sawtooth', 93, 88, 4.5, 0.035); hiss('lowpass', 260, 90, 0.5, 4.5, 0.22); [0, 1, 6].forEach((st, i) => tone('sine', 311 * Math.pow(2, st / 12), 0, 2.4, 0.02, sfxBus, 1 + i * 0.9)); break;
      case 'begin': [0, 7, 12, 19].forEach((st, i) => tone('sine', 293.66 * Math.pow(2, st / 12), 0, 1.6, 0.05, sfxBus, i * 0.12)); hiss('bandpass', 2400, 5000, 2, 1.2, 0.04); break;
      case 'portal': tone('sine', 220, 880, 1.2, 0.15); hiss('bandpass', 600, 3000, 1, 1.0, 0.15); break;
      case 'riftfall': tone('sine', 98, 49, 3.5, 0.3); hiss('lowpass', 300, 80, 0.7, 3, 0.25); break;
    }
  }
  // the music: soft pad chords and a few plucked notes, like wind chimes on the lighthouse
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const CHORDS = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]];
  let nextNote = 0, chordAt = 0, chordI = 0;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function pad(notes, dur) {
    const t = ctx.currentTime;
    for (const m of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.3;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }
  function pluck(m, vol) {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(m);
    env(g, t, 0.004, vol, 1.6);
    o.connect(g); g.connect(musicBus); g.connect(delay); o.start(t); o.stop(t + 1.8);
  }
  function update() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t >= chordAt) { pad(CHORDS[chordI], 9.5); chordI = (chordI + 1) % CHORDS.length; chordAt = t + 8; }
    if (t >= nextNote) {
      const base = CHORDS[(chordI + 3) % 4][0] + 12;
      pluck(base + SCALE[Math.floor(Math.random() * SCALE.length)], 0.05 + Math.random() * 0.04);
      nextNote = t + [0.6, 1.2, 1.8, 2.4, 3.2][Math.floor(Math.random() * 5)];
    }
  }
  function suspend(on) { if (ctx) (on ? ctx.suspend() : ctx.resume()).catch(() => {}); }
  return { init, sfx, update, volumes, suspend };
})();

// ===========================================================================
// The world, effects and the apprentice
// ===========================================================================
let world, sparks, bits, ui, foes, story, paused = false, started = false;
// the two places: the cove (Lanternhold) and the Rift. `world` and `foes` always point at the one you're in.
let cove, coveRoot, foesCove, rift = null, riftRoot = null, foesRift = null, floodPlane = null, travelling = null;
let caves = null, cavesRoot = null, foesCaves = null, cavesSaved = null;
const camDir = new V3(...CONFIG.camera.dir).normalize();
const camFwd = new V3(-camDir.x, 0, -camDir.z).normalize();
const camRight = new V3().crossVectors(camFwd, new V3(0, 1, 0)).normalize();
const MAP_ROT = -Math.PI / 2 - Math.atan2(camFwd.z, camFwd.x);   // maps turn with the view

const P = {
  x: 0, y: 0, z: 0, vx: 0, vz: 0, face: 0, state: 'move', t: 0,
  hp: CONFIG.player.hearts * 2, maxHp: CONFIG.player.hearts * 2, invuln: 0, kx: 0, kz: 0, shards: 0,
  combo: 0, comboT: 0, swing: null, rollDir: new THREE.Vector2(), rollCd: 0, rollBuf: 0, atkBuf: 0, fireCd: 0,
  stepT: 0, stepSide: 0, firing: 0, hitList: null, model: null, blade: null, sling: null, spin: null,
};
let stop = 0, trauma = 0, flashT = 0;
const projectiles = [];

function setupPlayer() {
  const m = buildPlayer();
  // a pivot at hip height, so the roll tumbles around the middle of the body
  const spin = new THREE.Group();
  spin.position.y = 0.5;
  m.root.add(spin);
  m.root.remove(m.body);
  spin.add(m.body);
  m.body.position.y = -0.5;
  scene.add(m.root);
  m.armR.rotation.order = 'YXZ';
  m.armL.rotation.order = 'YXZ';
  const blade = buildSkyblade();
  blade.root.rotation.x = Math.PI * 0.5 - 0.2;   // hangs pointing forward-down at rest
  m.handR.add(blade.root);
  const sling = buildTidesling();
  sling.root.rotation.x = Math.PI * 0.5;
  sling.root.scale.setScalar(0.9);
  m.handL.add(sling.root);
  P.model = m; P.blade = blade; P.sling = sling; P.spin = spin;
  P.x = world.spawn.x; P.z = world.spawn.z; P.y = world.spawn.y;
  P.face = Math.PI * 0.85;
}

// screen direction (x right, y down) -> world direction on the ground
function screenToWorld(sx, sy) {
  const x = camRight.x * sx - camFwd.x * sy, z = camRight.z * sx - camFwd.z * sy;
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new V3(0, 1, 0), 0);
// a point on the stage -> the spot on the ground under it (two passes, so slopes and steps line up)
function groundUnder(sx, sy) {
  ndc.set((sx / view.w) * 2 - 1, -(sy / view.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = new V3();
  ground.constant = -P.y;
  if (!ray.ray.intersectPlane(ground, hit)) return null;
  ground.constant = -world.groundAt(hit.x, hit.z);
  ray.ray.intersectPlane(ground, hit);
  return hit;
}
function mouseDir() {
  const hit = groundUnder(ui.input.mouse.x, ui.input.mouse.y);
  if (!hit) return null;
  const dx = hit.x - P.x, dz = hit.z - P.z, l = Math.hypot(dx, dz);
  return l > 0.01 ? { x: dx / l, z: dz / l } : null;
}
// where to aim: a dragged button wins, then the mouse, then the nearest target in front of you, then straight ahead
function aimFor(st, range) {
  if (st.aim.active) return screenToWorld(st.aim.x, st.aim.y);
  if (ui.input.mouse.has && st.down && !(navigator.maxTouchPoints > 0)) { const d = mouseDir(); if (d) return d; }
  let best = null, bestS = Infinity;
  const fx = Math.sin(P.face), fz = Math.cos(P.face);
  const mv = ui.input.move.active ? screenToWorld(ui.input.move.x, ui.input.move.y) : null;
  // creatures first, then shootable targets (switches, crystals) that still need waking, then practice dummies
  for (const d of [...foes.targets(), ...world.targets.filter((t) => !t.on), ...world.dummies]) {
    const dx = d.x - P.x, dz = d.z - P.z, dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    const dir = mv || { x: fx, z: fz };
    const cos = (dx * dir.x + dz * dir.z) / (dist || 1);
    if (cos < (d.D ? 0.0 : 0.25)) continue;
    const s = dist * (1.6 - cos) * (d.D ? 0.6 : 1);   // creatures before practice dummies
    if (s < bestS) { bestS = s; best = { x: dx / dist, z: dz / dist }; }
  }
  if (best) return best;
  if (mv) return mv;
  return { x: fx, z: fz };
}

// moving with collision: small sub-steps, sliding along walls, and never stuck:
// if you're ever overlapping something, any move that gets you out is allowed
function stepOk(x, z) {
  const C = CONFIG.player, y = world.groundAt(P.x, P.z);
  if (world.walkable(x, z, y, C.radius, C.stepUp)) return true;
  if (world.walkable(P.x, P.z, y, C.radius, C.stepUp)) return false;
  // already stuck: allow anything that isn't into the sea or up a wall, and that doesn't push deeper into what we overlap
  if (!world.terrainOk(x, z, y, 0.05, C.stepUp)) return false;
  const s = world.solidAt(P.x, P.z, C.radius);
  if (!s) return true;
  const cx = s.r !== undefined ? s.x : (s.x0 + s.x1) / 2, cz = s.r !== undefined ? s.z : (s.z0 + s.z1) / 2;
  return Math.hypot(x - cx, z - cz) > Math.hypot(P.x - cx, P.z - cz);
}
function tryMove(dx, dz) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  const sx = dx / n, sz = dz / n;
  let any = false;
  for (let k = 0; k < n; k++) {
    if (stepOk(P.x + sx, P.z + sz)) { P.x += sx; P.z += sz; any = true; continue; }
    // slide along whatever is in the way
    if (Math.abs(sx) > 1e-5 && stepOk(P.x + sx, P.z)) { P.x += sx; any = true; continue; }
    if (Math.abs(sz) > 1e-5 && stepOk(P.x, P.z + sz)) { P.z += sz; any = true; continue; }
    // a corner: try a little to either side
    const l = Math.hypot(sx, sz) || 1, px = -sz / l * 0.06, pz = sx / l * 0.06;
    if (stepOk(P.x + sx * 0.5 + px, P.z + sz * 0.5 + pz)) { P.x += sx * 0.5 + px; P.z += sz * 0.5 + pz; any = true; continue; }
    if (stepOk(P.x + sx * 0.5 - px, P.z + sz * 0.5 - pz)) { P.x += sx * 0.5 - px; P.z += sz * 0.5 - pz; any = true; continue; }
    break;
  }
  return any;
}

// ----- tap to walk: a path around trees and cliffs, with a little ring where you tapped -----
const tapRing = (() => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ff3ff').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  m.userData.t = 0;
  return m;
})();
function walkTo(sx, sy) {
  const hit = groundUnder(sx, sy);
  if (!hit) return;
  const npc = story.npcAt(hit.x, hit.z);
  story.setTalkTarget(npc);
  if (npc) { hit.x = npc.x + (P.x - npc.x) * 0.3; hit.z = npc.z + (P.z - npc.z) * 0.3; }
  const pts = world.findPath(P.x, P.z, hit.x, hit.z);
  if (!pts || !pts.length) { sound.sfx('deny'); return; }
  P.path = pts;
  P.pathStuck = 0;
  const end = pts[pts.length - 1];
  tapRing.position.set(end.x, world.groundAt(end.x, end.z) + 0.05, end.z);
  tapRing.visible = true; tapRing.userData.t = 0;
  sound.sfx('tick');
}
function pathSteer() {
  // skip ahead to the furthest stop you can walk to in a straight line
  while (P.path.length > 1 && world.clearLine(P.x, P.z, P.path[1].x, P.path[1].z)) P.path.shift();
  let p = P.path[0];
  let d = Math.hypot(p.x - P.x, p.z - P.z);
  if (d < (P.path.length > 1 ? 0.3 : 0.12)) { P.path.shift(); if (!P.path.length) { P.path = null; return null; } p = P.path[0]; d = Math.hypot(p.x - P.x, p.z - P.z); }
  const last = P.path.length === 1;
  return { x: (p.x - P.x) / (d || 1), z: (p.z - P.z) / (d || 1), mag: last ? clamp(d / 0.9, 0.3, 1) : 1 };
}

// ----- the roll -----
function startRoll() {
  const I = ui.input;
  const d = I.move.active && Math.hypot(I.move.x, I.move.y) > 0.25 ? screenToWorld(I.move.x, I.move.y) : { x: Math.sin(P.face), z: Math.cos(P.face) };
  P.rollDir.set(d.x, d.z);
  P.face = Math.atan2(d.x, d.z);
  P.state = 'roll'; P.t = 0; P.rollBuf = 0; P.swing = null; P.path = null;
  sound.sfx('roll');
  dust(P.x, P.y, P.z, 5, 1);
  ui.hideHint('roll');
}
function startSwing(dir) {
  const W = WEAPONS.skyblade;
  if (P.comboT <= 0) P.combo = 0;
  const step = W.combo[P.combo % W.combo.length];
  P.swing = { step, idx: P.combo % W.combo.length, dir, hit: false, slash: null };
  P.face = Math.atan2(dir.x, dir.z);
  P.state = 'attack'; P.t = 0; P.atkBuf = 0; P.path = null;
  P.combo = (P.combo + 1) % W.combo.length;
}

// walking and running: the stick (or a tapped path) sets where you want to go; speed builds up and
// eases off, turning has a limited speed, and you move mostly the way you face, so it never feels on rails
function locomote(dt, speedMul, canTurn) {
  const I = ui.input, C = CONFIG.player;
  let tx = 0, tz = 0, mag = 0;
  if (I.move.active) {
    const raw = Math.min(1, Math.hypot(I.move.x, I.move.y));
    if (raw > C.deadzone) {
      const d = screenToWorld(I.move.x, I.move.y);
      tx = d.x; tz = d.z;
      mag = Math.pow((raw - C.deadzone) / (1 - C.deadzone), 1.25);
      P.path = null;
    }
  } else if (P.path && canTurn) {
    const s = pathSteer();
    if (s) { tx = s.x; tz = s.z; mag = s.mag; }
  }
  if (mag > 0 && canTurn) {
    const want = Math.atan2(tx, tz);
    const diff = Math.atan2(Math.sin(want - P.face), Math.cos(want - P.face));
    const rate = C.turnRate * (Math.abs(diff) > 2.0 ? 2.4 : 1) * dt;
    P.face += clamp(diff, -rate, rate);
  }
  let dx = tx, dz = tz;
  if (mag > 0 && canTurn) {
    dx = lerp(tx, Math.sin(P.face), 0.45); dz = lerp(tz, Math.cos(P.face), 0.45);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  }
  // running (the boot button or Shift): faster, but not while throwing or swinging
  P.running = ui.input.run && speedMul === 1 && mag > 0.3;
  const sp = C.speed * mag * speedMul * foes.slowAt(P.x, P.z) * (P.running ? C.runMul : 1);
  const wx = dx * sp, wz = dz * sp;
  const ddx = wx - P.vx, ddz = wz - P.vz, dl = Math.hypot(ddx, ddz);
  const acc = (mag > 0 ? C.accel : C.decel) * dt;
  if (dl <= acc) { P.vx = wx; P.vz = wz; } else { P.vx += (ddx / dl) * acc; P.vz += (ddz / dl) * acc; }
  const ox = P.x, oz = P.z;
  if (Math.abs(P.vx) + Math.abs(P.vz) > 0.005) {
    tryMove(P.vx * dt, P.vz * dt);
    // bumping into something takes the speed out of that direction
    const ax = (P.x - ox) / dt, az = (P.z - oz) / dt;
    if (Math.abs(ax) < Math.abs(P.vx) * 0.5) P.vx = ax;
    if (Math.abs(az) < Math.abs(P.vz) * 0.5) P.vz = az;
  }
  const moved = Math.hypot(P.x - ox, P.z - oz);
  if (moved > 0.01) P.everMoved = true;
  // a tapped path that can't make progress gives up
  if (P.path) { P.pathStuck = moved < 0.004 ? (P.pathStuck || 0) + dt : 0; if (P.pathStuck > 0.5) P.path = null; }
  return moved;
}

// ----- evening into night: blend every light, colour and the sky between the two palettes -----
const lightDir = new V3();
const tc = new THREE.Color(), tc2 = new THREE.Color();
const mixCol = (target, a, b, k) => target.copy(tc.set(a)).lerp(tc2.set(b), k);
const SUN_EVE = new V3(-0.75, 0.16, -0.64).normalize(), SUN_NIGHT = new V3(-0.75, -0.3, -0.64).normalize();
const MOON = new V3(0.42, 0.8, -0.42).normalize();
let timeK = 0;
// ----- the clock: dawn, day, evening and night, by the hour -----
// Palettes at given hours; between them everything blends. Story beats set the hour themselves.
const CLOCK_KEYS = [[0, 'night'], [4.6, 'night'], [6.4, 'dawn'], [8.6, 'day'], [16.4, 'day'], [19, 'evening'], [21, 'night'], [24, 'night']];
const NIGHTNESS = { night: 1, dawn: 0.25, day: 0, evening: 0.12 };
const EXPOSURE = { night: 1.15, dawn: 1.04, day: 1.0, evening: 1.0 };
const sunV = new V3(), litV = new V3();
let clockH = 19;
function setClock(h) {
  h = ((h % 24) + 24) % 24;
  clockH = h;
  let k = 0;
  while (k < CLOCK_KEYS.length - 2 && h >= CLOCK_KEYS[k + 1][0]) k++;
  const [ha, na] = CLOCK_KEYS[k], [hb, nb] = CLOCK_KEYS[k + 1];
  const u = smooth(clamp((h - ha) / Math.max(0.001, hb - ha), 0, 1));
  const A = TIMES[na], B = TIMES[nb], U = SKY_UNIFORMS;
  mixCol(U.uZenith.value, A.zenith, B.zenith, u);
  mixCol(U.uMid.value, A.mid, B.mid, u);
  mixCol(U.uHorizon.value, A.horizon, B.horizon, u);
  mixCol(U.uGlow.value, A.glow, B.glow, u);
  // the sun goes round from the east at dawn to the west in the evening
  const th = (h - 6.5) / 12.5 * Math.PI;
  sunV.set(Math.cos(th) * 0.8, Math.max(Math.sin(th), -0.3) * 0.85 + 0.12, -0.55).normalize();
  U.uSunDir.value.copy(sunV);
  const night = lerp(NIGHTNESS[na], NIGHTNESS[nb], u);
  U.uNight.value = night;
  mixCol(scene.fog.color, A.fog, B.fog, u);
  scene.background.copy(scene.fog.color);
  mixCol(sun.color, A.sun, B.sun, u);
  sun.intensity = lerp(A.sunI, B.sunI, u);
  mixCol(hemi.color, A.hemiSky, B.hemiSky, u);
  mixCol(hemi.groundColor, A.hemiGround, B.hemiGround, u);
  hemi.intensity = lerp(A.hemiI, B.hemiI, u);
  // shadows come from the sun (never too flat), or from the moon at night
  litV.set(sunV.x, Math.max(sunV.y, 0.42), sunV.z).normalize();
  lightDir.copy(litV).lerp(MOON, smooth(night)).normalize();
  post.final.uniforms.grade.value.set(lerp(A.grade[0], B.grade[0], u), lerp(A.grade[1], B.grade[1], u), lerp(A.grade[2], B.grade[2], u));
  renderer.toneMappingExposure = lerp(EXPOSURE[na], EXPOSURE[nb], u);
  cove.setNight(night);
  timeK = night;
}
// the story's own scale: 0 = evening, 1 = night, 2 = dawn
function setTime(k) {
  setClock(k <= 1 ? 19 + k * 2 : 21 + (k - 1) * 9.4);
}
// the clock runs on its own once Act 1 begins: an hour a minute
const clock = { running: false };
// the tide: low at midnight and noon, high at six. It only moves while the clock runs.
function tideAt(h) { return -0.1 + 0.52 * Math.sin(h / 12 * TAU - Math.PI / 2); }

// ----- creatures for a place (the cove's Seep, the Rift's rooms) -----
const proj = new V3();
// each place keeps its creatures under its own root, so nothing from one place shows in the other
function makeFoes(w, root) {
  return createFoes({
    scene: root, world: w, P, sparks, bits, sound,
    hurtPlayer, shake, hitStop: (t) => { stop = Math.max(stop, t); },
    number: (text, x, y, z, heavy) => { proj.set(x, y, z).project(camera); ui.number(text, (proj.x + 1) / 2 * view.w, (1 - proj.y) / 2 * view.h, heavy); },
    addSkyglass: (n) => { P.shards += n; ui.setShards(P.shards, true); },
    heal: (n) => { P.hp = Math.min(P.maxHp, P.hp + n); },
    toast: (t) => ui.toast(t),
    playerDead: () => P.state === 'dead',
    onSeepClear: () => story.onSeepClear(),
    pullPlayer: (dx, dz) => { if (P.state !== 'dead' && !P.iframes) tryMove(dx, dz); },
    bossBar: (name, frac) => ui.bossBar(name, frac),
    onGuardianDown: (f) => (f.kind === 'barnaclemother' ? caveBossDown(f) : riftEvent('guardianDown', f)),
    onKill: () => { stats.calmed++; },
    // the Seep only wakes while the story needs it; afterwards the stone circle stays quiet
    seepAwake: () => ['toShard', 'seep'].includes(story.state.step),
    bossHold: () => !!bossIntro,
  });
}

// ----- going between places: a fade to black, the swap, and a fade back -----
function travel(to) {
  if (travelling || (to === 'rift' && world === rift) || (to === 'cove' && world === cove) || (to === 'caves' && world === caves)) return;
  story.state.nearShard = story.state.nearDoor = false; story.state.near = null;
  travelling = { t: 0, to, swapped: false };
  P.path = null; P.vx = P.vz = 0;
  sound.sfx('portal');
  ui.show(false);
}
function updateTravel(dt) {
  const T = travelling;
  T.t += dt;
  if (!T.swapped) fade = Math.min(1, T.t / 0.7);
  if (!T.swapped && T.t >= 0.75) { T.swapped = true; T.t = 0; T.from = world === caves ? 'caves' : world === rift ? 'rift' : 'cove'; swapTo(T.to); }
  if (T.swapped) {
    fade = Math.max(0, 1 - T.t / 0.9);
    if (T.t >= 0.9) { travelling = null; fade = 0; ui.show(true); arrived(T.to, T.from); }
  }
}
function applyLight(L) {
  hemi.color.set(L.hemiSky); hemi.groundColor.set(L.hemiGround); hemi.intensity = L.hemiI;
  sun.color.set(L.sun); sun.intensity = L.sunI;
  scene.fog.color.set(L.fog); scene.fog.near = L.fogNear; scene.fog.far = L.fogFar;
  scene.background.copy(scene.fog.color);
  post.final.uniforms.grade.value.set(...L.grade);
  renderer.toneMappingExposure = L.exposure;
  lightDir.copy(world.sunDir);
}
function swapTo(to) {
  for (const p of projectiles) scene.remove(p.m);
  projectiles.length = 0;
  foes.reset();
  ui.bossBar(null);
  if (to === 'caves') {
    cavesBuilt();
    coveRoot.visible = false; if (riftRoot) riftRoot.visible = false; cavesRoot.visible = true;
    world = caves; foes = foesCaves;
    applyLight(caves.light);
    P.x = caves.spawn.x; P.z = caves.spawn.z - 0.5; P.y = caves.spawn.y; P.face = Math.PI;
    populateCaves();
    ui.buildMap(caves.mapInfo, MAP_ROT, 'caves');
    syncKeys();
  } else if (to === 'rift') {
    guardianSeen = false;
    if (riftRoot) riftRoot.visible = true;
    if (cavesRoot) cavesRoot.visible = false;
    if (!rift) {
      riftRoot = new THREE.Group();
      scene.add(riftRoot);
      rift = buildRift(riftRoot, (Date.now() % 100000) | 0);
      rift.fx.sparks = sparks;
      foesRift = makeFoes(rift, riftRoot);
      rift.attach({ P, foes: foesRift, sound, shake, onEvent: riftEvent, onMap: () => ui.setMap(rift.mapState()) });
      // a thin layer of water that rises when the Gardener weeps
      floodPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#3fb5c8', transparent: true, opacity: 0.32, depthWrite: false }));
      floodPlane.rotation.x = -Math.PI / 2; floodPlane.position.y = -0.3; floodPlane.renderOrder = 2;
      riftRoot.add(floodPlane);
      scene.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    }
    coveRoot.visible = false; riftRoot.visible = true;
    world = rift; foes = foesRift;
    applyLight(rift.light);
    P.x = rift.spawn.x; P.z = rift.spawn.z; P.y = 0; P.face = Math.PI;
    ui.setMap(rift.mapState());
  } else {
    const from = world;
    if (riftRoot) riftRoot.visible = false;
    if (cavesRoot) cavesRoot.visible = false;
    coveRoot.visible = true;
    world = cove; foes = foesCove;
    scene.fog.near = 36; scene.fog.far = 95;
    setClock(clockH);
    foes.rest();
    if (from === caves) {
      // out of the cave mouth, onto the shore under the cliffs
      cavesSaved = caves.snapshot();
      P.x = cove.mouth.x; P.z = cove.mouth.z + 1.7; P.y = cove.groundAt(P.x, P.z); P.face = 0;
    } else placeBySeep();   // you step out beside the Seep, which has gone quiet for now
    ui.setMap(null);
    ui.buildMap(cove.mapInfo, MAP_ROT, 'cove');
    syncKeys();
  }
  ui.setContext(null);
  camLook.set(P.x, P.y + 0.6, P.z);
  camPos.copy(camLook).addScaledVector(camDir, camDist);
}
function placeBySeep() {
  const S = cove.seep;
  let spot = { x: S.x, z: S.z - S.r - 1.6 };
  for (const a of [-Math.PI / 2, -Math.PI / 3, -2 * Math.PI / 3, 0, Math.PI]) {
    const x = S.x + Math.cos(a) * (S.r + 1.6), z = S.z + Math.sin(a) * (S.r + 1.6);
    if (cove.walkable(x, z, cove.groundAt(x, z), 0.6)) { spot = { x, z }; break; }
  }
  P.x = spot.x; P.z = spot.z; P.y = cove.groundAt(P.x, P.z); P.face = Math.atan2(S.x - P.x, S.z - P.z);
}
async function arrived(to, from) {
  if (to === 'caves') {
    ui.titleCard(CAVES.name, CAVES.region, CAVES.line);
    if (!caves.state.visited) { caves.state.visited = true; await story.say(STORY.cavesEnter); }
  } else if (to === 'rift') {
    ui.titleCard(RIFT.name, 'The first Rift', RIFT.line);
    story.setStep('rift');
    await story.say(STORY.riftLines.enter);
  } else if (from === 'rift' && !story.past('reportRift')) {
    story.setStep('reportRift');
    ui.titleCard('The Keeper\u2019s Cove', 'Lanternhold', 'Home, with a heart of glass.');
  } else if (from === 'caves') {
    ui.titleCard('Gullcliff', 'Lanternhold', 'Salt wind, and the sea far below.');
  }
}
// ----- little clocks on game time (pausing the game pauses them) -----
const gTimers = [];
const gwait = (sec) => new Promise((resolve) => gTimers.push({ t: sec, resolve }));
function updateGTimers(dt) { for (let i = gTimers.length - 1; i >= 0; i--) { gTimers[i].t -= dt; if (gTimers[i].t <= 0) { const r = gTimers[i].resolve; gTimers.splice(i, 1); r(); } } }

// ----- a guardian's entrance: a short scene before the fight. Nothing can hurt you while it plays,
// and the guardian only hangs there and looks at you until it's over. Seen once per visit. -----
let bossIntro = null, guardianSeen = false, wheelSlow = false;
async function guardianIntro(rm) {
  story.setStep('guardian');
  if (guardianSeen) return;
  guardianSeen = true;
  bossIntro = { rm };
  P.safe = 99; P.path = null; P.vx = P.vz = 0;
  ui.show(false);
  document.body.classList.add('cine');
  // low on the floor, looking up into the dark as it comes down
  cineView = { pos: new V3(rm.cx + 3.4, 0.8, rm.cz + 4.6), look: new V3(rm.cx - 0.3, 5.2, rm.cz - 1.5), k: 0.02 };
  const g = () => foes.list.find((f) => f.kind === 'gardener' && f.alive);
  let w = 0;
  while ((!g() || g().state === 'emerge') && w < 8) { await gwait(0.1); w += 0.1; }
  const f = g();
  if (f) {
    // closer: up at its eyes
    cineView = { pos: new V3(f.x + 2.4, 5.6, f.z + 6.0), look: new V3(f.x, 4.7, f.z), k: 0.025 };
    const C = STORY.riftLines.guardianCard;
    ui.titleCard(C.name, C.region, C.line);
    await gwait(3.6);
    await story.say(STORY.riftLines.guardian);
  }
  // back to you
  cineView = null; camBlend = 1.4;
  document.body.classList.remove('cine');
  ui.show(true);
  bossIntro = null;
  P.safe = 1.2;
}
async function riftEvent(name, arg) {
  if (name === 'guardian') {
    guardianIntro(arg);
  } else if (name === 'guardianDown') {
    rift.guardianDown(arg);
    story.setStep('heartGlass');
    setTimeout(() => story.say(STORY.riftLines.cleared), 900);
  } else if (name === 'chest') {
    // the treasure: slivers, and a Seaglass Heart that adds a heart for good
    sound.sfx('treasure');
    const c = arg.root.position;
    for (let i = 0; i < RIFT.treasure.slivers; i++) foes.dropSliver(c.x, 0.8, c.z);
    if (RIFT.treasure.heart) { P.maxHp += 2; P.hp = P.maxHp; ui.toast(STORY.riftLines.treasure); }
    for (let i = 0; i < 30; i++) { const a = Math.random() * TAU; sparks.spawn({ x: c.x, y: 0.8, z: c.z, vx: Math.cos(a) * 2, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 2, grav: 4, life: 1, size: 0.18, color: i % 2 ? '#ffe9a8' : '#ff8a96', glow: 2.6 }); }
  } else if (name === 'exit') {
    travel('cove');
  }
}
// the pause menu's playtest shortcuts
function playtestJump(where) {
  if (!started || intro) return;
  if (where === 'riftfall') {
    if (world !== cove) return;
    P.x = world.spots.beaconView.x; P.z = world.spots.beaconView.z; P.y = cove.groundAt(P.x, P.z);
    story.jump('riftfall');
  } else if (where === 'rift') {
    if (world !== cove) { ui.toast('You are already in the Rift'); return; }
    story.jump('enterRift');
    travel('rift');
  } else if (where === 'act1') {
    if (world !== cove) { ui.toast('Leave this place first'); return; }
    curtainTo(1, 0.5).then(() => {
      story.applyState('free');
      const m = story.people().find((n) => n.id === 'maren');
      P.x = m.x + 0.4; P.z = m.z + 1.8; P.y = cove.groundAt(P.x, P.z); P.face = Math.PI;
      snapCamera();
      curtainTo(0, 1);
    });
  } else if (where === 'tether') {
    giveTool('tether'); ui.toast('Tether (for testing)');
  } else if (where === 'morning') {
    if (world !== cove) { ui.toast('Leave the Rift first'); return; }
    curtainTo(1, 0.5).then(() => {
      story.applyState('morning');
      const d = cove.spots.lighthouseDoor;
      P.x = d.x + 0.4; P.z = d.z + 2.2; P.y = cove.groundAt(P.x, P.z); P.face = Math.PI;
      snapCamera();
      curtainTo(0, 1);
      ui.titleCard(TEXT.morning.name, TEXT.morning.region, TEXT.morning.line);
    });
  }
}

// ----- the island map: where you are, who's about, and where the story wants you -----
let isleFrame = 0;
function objectiveSpot() {
  const st = story.state.step, sp = cove.spots;
  const maren = story.people().find((n) => n.id === 'maren');
  if (['findMaren', 'reportPractice', 'reportSeep', 'reportRift', 'morning', 'free', 'reportOil'].includes(st)) return maren;
  if (st === 'practice') return sp.trainingGround;
  if (st === 'beacon') return sp.beaconView;
  if (['toShard', 'seep', 'enterRift'].includes(st)) return cove.seep;
  if (st === 'rest') return sp.cottageDoor;
  if (['gullcliff', 'caves', 'cavesBoss'].includes(st)) return cove.mouth;
  if (st === 'boathouse') return sp.boathouse;
  return null;
}
function updateIslandMap() {
  const inCaves = world === caves;
  const show = started && !intro && (world === cove || inCaves) && !story.state.cine && !story.state.ending && !bossIntro;
  if (!show) { if (isleFrame !== -1) { ui.islandMap(null); isleFrame = -1; } return; }
  isleFrame = 1;
  const o = STORY.objectives[story.state.step];
  const objective = typeof o === 'function' ? o(story.state.hits, STORY.practiceHits) : o;
  if (inCaves) {
    ui.islandMap({ x: P.x, z: P.z, face: P.face, people: [], goal: null, objective, title: CAVES.name, waystones: [] });
    return;
  }
  const news = story.hasNews();
  ui.islandMap({
    x: P.x, z: P.z, face: P.face,
    people: story.people().map((n) => ({ ...n, news: n.id === 'maren' && news })),
    goal: objectiveSpot(),
    objective,
    title: 'Lanternhold',
    waystones: story.past('free') ? cove.waystones : [],
  });
}

// ----- the curtain: a fade to black the story can lower and raise -----
const curtain = { k: 0, to: 0, speed: 1, done: null };
function curtainTo(k, sec) {
  return new Promise((resolve) => {
    if (curtain.done) curtain.done();
    curtain.to = k; curtain.speed = 1 / Math.max(0.01, sec); curtain.done = resolve;
  });
}
function updateCurtain(dt) {
  if (curtain.k === curtain.to) { if (curtain.done) { const d = curtain.done; curtain.done = null; d(); } return; }
  curtain.k = curtain.to > curtain.k ? Math.min(curtain.to, curtain.k + dt * curtain.speed) : Math.max(curtain.to, curtain.k - dt * curtain.speed);
}
function snapCamera() {
  gameplayCam(wantPos, wantLook);
  camLook.copy(wantLook); camPos.copy(wantPos); camBlend = 0;
}

// ===========================================================================
// Saving: one journey, kept on this device. It saves whenever the story moves on, every little while,
// and when you leave the page. The Rift isn't saved room by room: a journey saved inside it resumes at the shard.
// ===========================================================================
const SAVE_KEY = 'riftfall-save';
let stats = { time: 0, falls: 0, calmed: 0 }, savedAt = 0, saveSoon = -1, saveClock = 0, ended = false;
function readSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return d && d.v === 1 && d.step ? d : null; } catch (_) { return null; }
}
function writeSave() {
  if (!started || intro) return;
  const st = story.state;
  const steady = world === cove && !travelling && P.state !== 'dead' && !st.ending && !st.cine;
  const data = { v: 1, version: VERSION, step: st.step, hits: st.hits, maxHp: P.maxHp, shards: P.shards, pos: steady ? { x: +P.x.toFixed(2), z: +P.z.toFixed(2) } : null, stats: { ...stats }, ended, savedAt: Date.now(),
    // Act 1 and on
    tools: tools.owned, tool: tools.cur, lit: cove.waystones.filter((w) => w.lit).map((w) => w.id), kept: [...kept], memories, clock: clockH, clockOn: clock.running,
    caves: caves ? caves.snapshot() : cavesSaved, inCaves: world === caves };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); savedAt = Date.now(); ui.savedMark(); } catch (_) { /* private mode: progress lives only as long as the page */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* fine */ } }
const chapterOf = (step) => STORY.chapters.find((c) => c.steps.includes(step)) || STORY.chapters[STORY.chapters.length - 1];
// what the journal in the pause menu shows
function journey() {
  const step = story.state.step, now = STORY.order.indexOf(step);
  const chapters = STORY.chapters.map((c) => {
    const first = STORY.order.indexOf(c.steps[0]), last = STORY.order.indexOf(c.steps[c.steps.length - 1]);
    return { name: c.name, state: now > last ? 'done' : now >= first ? 'now' : 'later' };
  });
  const o = STORY.objectives[step];
  const ago = savedAt ? Math.round((Date.now() - savedAt) / 60000) : -1;
  return {
    objective: typeof o === 'function' ? o(story.state.hits, STORY.practiceHits) : o,
    chapters,
    stats: { time: stats.time, slivers: P.shards, calmed: stats.calmed, falls: stats.falls },
    savedAgo: ago < 0 ? 'Not saved yet' : ago < 1 ? 'Saved just now' : `Saved ${ago} min ago`,
  };
}
function saveAndQuit() {
  writeSave();
  ui.resume();
  curtainTo(1, 0.6).then(() => location.reload());
}

// ----- the title screen and starting a journey -----
function showTitle() {
  const save = readSave();
  ui.titleMenu({
    save: save && { chapter: chapterOf(save.step).name, time: (save.stats && save.stats.time) || 0, ended: !!save.ended },
    onContinue: () => beginJourney(save),
    onNew: () => beginJourney(null),
  });
}
async function beginJourney(save) {
  if (started) return;
  ui.closeTitle();
  sound.init();
  // iPhones only let sound start on a finished tap, so try again when the finger lifts
  const unlock = () => sound.init();
  addEventListener('touchend', unlock, { once: true });
  addEventListener('click', unlock, { once: true });
  sound.sfx('begin');
  await curtainTo(1, 0.7);
  ui.input.any = false;
  if (!save) {
    clearSave();
    stats = { time: 0, falls: 0, calmed: 0 };
    P.x = cove.spawn.x; P.z = cove.spawn.z; P.y = cove.spawn.y;
    started = true;
    intro = { t: 0, skippable: false };
    sound.sfx('wake');
    curtainTo(0, 1.2);
    return;
  }
  // put the cove back as the journey left it
  stats = Object.assign({ time: 0, falls: 0, calmed: 0 }, save.stats);
  ended = !!save.ended;
  P.maxHp = save.maxHp || P.maxHp; P.hp = P.maxHp; P.shards = save.shards || 0;
  ui.setShards(P.shards);
  const step = story.applyState(save.step, save.hits || 0);
  // tools, waystones, keepsakes, memories, the clock, the caves
  tools.owned = save.tools || ['sling']; tools.cur = tools.owned.includes(save.tool) ? save.tool : 'sling'; syncTools();
  for (const id of save.lit || []) cove.lightWaystone(id);
  for (const id of save.kept || []) { kept.add(id); cove.takeKeepsake(id); }
  Object.assign(memories, save.memories || {});
  if (memories.breakfast) { cove.showKitchen(); }
  cavesSaved = save.caves || null;
  if (save.clockOn) { clock.running = true; clockH = save.clock || 9; setClock(clockH); }
  else if (story.past('gullcliff')) { clock.running = true; setClock(clockH = 9); }
  if (save.step !== step && step === 'enterRift') { foes.rest(); placeBySeep(); }
  else if (save.inCaves) { P.x = cove.mouth.x; P.z = cove.mouth.z + 1.7; P.y = cove.groundAt(P.x, P.z); }
  else if (save.pos && cove.walkable(save.pos.x, save.pos.z, cove.groundAt(save.pos.x, save.pos.z), 0.4)) { P.x = save.pos.x; P.z = save.pos.z; P.y = cove.groundAt(P.x, P.z); }
  else if (['morning', 'free'].includes(step)) { const d = cove.spots.lighthouseDoor; P.x = d.x + 0.4; P.z = d.z + 2.2; P.y = cove.groundAt(P.x, P.z); }
  else { P.x = cove.spawn.x; P.z = cove.spawn.z; P.y = cove.spawn.y; }
  P.face = Math.PI * 0.85;
  started = true;
  snapCamera();
  ui.show(true);
  sound.sfx('wake');
  const pl = ['morning', 'free'].includes(step) ? TEXT.morning : PLACES.cove;
  setTimeout(() => ui.titleCard(pl.name, pl.region, pl.line), 500);
  curtainTo(0, 1.4);
  savedAt = save.savedAt || 0;
}
// the end of the Prologue: save, then the card, then whatever you choose
async function onEnding() {
  ended = true;
  writeSave();
  const choice = await ui.endCard({ time: stats.time, slivers: P.shards, calmed: stats.calmed, falls: stats.falls });
  if (choice === 'title') { saveAndQuit(); return 'title'; }
  return 'keep';
}

// ===========================================================================
// Keepsakes and waystones
// ===========================================================================
const KEEPSAKE_SET = ['cup', 'spoon', 'crust'];
const kept = new Set();
const memories = {};
const keepsakesAll = () => KEEPSAKE_SET.every((k) => kept.has(k));
async function foundKeepsake(k) {
  kept.add(k.id);
  const K = STORY.keepsakes[k.id];
  sound.sfx('shimmer');
  holdUp(true);
  story.state.busy = true;
  await ui.itemGet(K.name, K.line, null);
  story.state.busy = false;
  holdUp(false);
  if (keepsakesAll()) ui.toast(STORY.keepsakeHint);
  saveSoon = 0.3;
}
function lightStone(w) {
  cove.lightWaystone(w.id);
  sound.sfx('beacon'); shake(0.12);
  for (let i = 0; i < 24; i++) { const a = Math.random() * TAU; sparks.spawn({ x: w.x, y: w.y + 1.9, z: w.z, vx: Math.cos(a) * 1.6, vy: Math.random() * 2.5, vz: Math.sin(a) * 1.6, drag: 2, life: 0.9, size: 0.14, color: i % 2 ? '#bff6ff' : '#ffffff', glow: 3 }); }
  ui.toast(cove.waystones.filter((v) => v.lit).length === 1 ? STORY.waystoneHint : STORY.waystoneLit);
  saveSoon = 0.3;
}
// travel to a lit waystone from the map
async function warpTo(id) {
  const w = cove.waystones.find((v) => v.id === id);
  if (!w || !w.lit || world !== cove || travelling || story.busy()) return;
  P.path = null; P.vx = P.vz = 0;
  sound.sfx('portal');
  await curtainTo(1, 0.45);
  // the open ground on the near side of the stone
  for (const [dx, dz] of [[0, 1.6], [1.4, 1], [-1.4, 1], [0, -1.6], [1.6, 0], [-1.6, 0]]) {
    const x = w.x + dx, z = w.z + dz;
    if (cove.walkable(x, z, cove.groundAt(x, z), 0.4)) { P.x = x; P.z = z; break; }
  }
  P.y = cove.groundAt(P.x, P.z); P.face = 0;
  snapCamera();
  await curtainTo(0, 0.6);
}

// ===========================================================================
// Tools: the sling button holds them. The Tether bites brass rings, plates and creatures.
// ===========================================================================
const tools = { owned: ['sling'], cur: 'sling' };
function syncTools() { ui.setTools(tools.owned.map((id) => ({ id, name: TOOLS[id].name })), tools.cur); }
function setTool(id) {
  if (!tools.owned.includes(id) || id === tools.cur) return;
  tools.cur = id;
  syncTools();
  sound.sfx('tick');
  ui.toast(TOOLS[id].name);
}
function giveTool(id) { if (!tools.owned.includes(id)) tools.owned.push(id); tools.cur = id; syncTools(); }
// the line: a brass hook on a thread of sky-glass
const tether = (() => {
  const g = new THREE.Group();
  const line = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff6ff').multiplyScalar(1.6) }));
  const hb = new Batch(777);
  hb.box(0.16, 0.16, 0.3, '#e0b85a', 0, 0, 0); for (const sx of [-1, 1]) hb.box(0.06, 0.06, 0.24, '#c9a24a', sx * 0.12, 0, 0.14, { rotY: sx * 0.6 });
  const head = hb.mesh(); head.matrixAutoUpdate = true; head.castShadow = false;
  g.add(line, head); g.visible = false;
  return { g, line, head };
})();
let hook = null, tetherCd = 0;
// what the Tether would bite if used now in this direction
function tetherTarget(dir) {
  const T = TOOLS.tether, rings = world.rings || [];
  let best = null, bs = Infinity;
  const y0 = P.y + 1;
  for (const rg of rings) {
    const dx = rg.x - P.x, dz = rg.z - P.z, d = Math.hypot(dx, dz);
    if (d < 1.6 || d > T.range) continue;
    // a ring whose landing is where you already stand is the one you just came from
    const land = rg.lever ? null : (world.ringLanding ? world.ringLanding(rg, P.x, P.z) : rg.land);
    if (!rg.lever && (!land || Math.hypot(land.x - P.x, land.z - P.z) < 2.4)) continue;
    const cos = (dx * dir.x + dz * dir.z) / d;
    if (cos < 0.8 || rg.used) continue;
    const sc = d * (2 - cos) * (rg.lever ? 0.9 : 1);
    if (sc < bs) { bs = sc; best = { kind: rg.lever ? 'lever' : 'ring', o: rg, x: rg.x, y: rg.y, z: rg.z }; }
  }
  for (const f of foes.targets()) {
    const dx = f.x - P.x, dz = f.z - P.z, d = Math.hypot(dx, dz);
    if (d > T.range) continue;
    const cos = (dx * dir.x + dz * dir.z) / (d || 1);
    if (cos < 0.86) continue;
    const sc = d * (2 - cos) * 0.8;
    if (sc < bs) { bs = sc; best = { kind: 'foe', o: f, x: f.x, y: f.y + (f.kind === 'barnaclemother' ? 2.2 : f.kind === 'bellfish' ? 1.5 : 0.6), z: f.z }; }
  }
  return best;
}
// where to aim the Tether: a drag on the button wins, then the nearest ring or creature in front, then ahead
function tetherDir(aim) {
  if (aim) return screenToWorld(aim.x, aim.y);
  const fx = Math.sin(P.face), fz = Math.cos(P.face);
  const mv = ui.input.move.active ? screenToWorld(ui.input.move.x, ui.input.move.y) : { x: fx, z: fz };
  // a ring or a creature roughly ahead: turn to face it
  let best = null, bs = Infinity;
  for (const o of [...(world.rings || []).filter((rg) => !rg.used), ...foes.targets()]) {
    const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz);
    if (d < 1.2 || d > TOOLS.tether.range) continue;
    if (!o.D && !o.lever) { const land = world.ringLanding ? world.ringLanding(o, P.x, P.z) : o.land; if (!land || Math.hypot(land.x - P.x, land.z - P.z) < 2.4) continue; }
    const cos = (dx * mv.x + dz * mv.z) / d;
    if (cos < 0.45) continue;
    const sc = d * (2 - cos) * (o.D ? 1.15 : 1);
    if (sc < bs) { bs = sc; best = { x: dx / d, z: dz / d }; }
  }
  return best || mv;
}
function useTool(aim) {
  if (tools.cur === 'tether') {
    if (hook || tetherCd > 0 || P.state !== 'move') return;
    const dir = tetherDir(aim);
    P.face = Math.atan2(dir.x, dir.z);
    const tg = tetherTarget(dir);
    const len = tg ? Math.hypot(tg.x - P.x, tg.z - P.z) : TOOLS.tether.range;
    hook = { dir, tg, len, d: 0, back: false, hy: P.y + 1.0 };
    tether.g.visible = true;
    sound.sfx('tetherOut');
    P.model.armR.rotation.x = -1.6;
  }
}
function updateHook(dt) {
  tetherCd = Math.max(0, tetherCd - dt);
  if (!hook) { if (P.state !== 'tether') tether.g.visible = false; return; }
  const T = TOOLS.tether, h = hook;
  const hx = P.x + Math.sin(P.face) * 0.35, hz = P.z + Math.cos(P.face) * 0.35, hy = P.y + 1.0;
  if (!h.back) {
    h.d += T.speed * dt;
    // it stops at a wall
    const px = P.x + h.dir.x * Math.min(h.d, h.len), pz = P.z + h.dir.z * Math.min(h.d, h.len);
    if (!h.tg && world.shotBlocked(px, hy, pz, 0.05)) { h.back = true; h.len = h.d; sound.sfx('clank'); }
    else if (h.d >= h.len) {
      h.d = h.len;
      if (!h.tg) h.back = true;
      else if (h.tg.kind === 'ring') {
        // it bites: you're pulled across
        const land = world.ringLanding ? world.ringLanding(h.tg.o, P.x, P.z) : h.tg.o.land;
        if (land) {
          sound.sfx('tetherBite');
          P.state = 'tether'; P.t = 0;
          const ly = world.groundAt(land.x, land.z);
          P.fly = { x0: P.x, z0: P.z, y0: P.y, x1: land.x, z1: land.z, y1: ly, dur: Math.max(0.35, Math.hypot(land.x - P.x, land.z - P.z) / T.pull), ring: h.tg };
          P.safe = Math.max(P.safe || 0, P.fly.dur + 0.3);
          P.path = null; P.vx = P.vz = 0;
        }
        hook = null; tetherCd = T.cooldown;
        return;
      } else if (h.tg.kind === 'lever') {
        sound.sfx('tetherBite'); sound.sfx('creak');
        h.tg.o.used = true;   // pulled: it won't be pulled again
        if (h.tg.o.gate && world.openGateChain) world.openGateChain(h.tg.o);
        h.back = true;
      } else if (h.tg.kind === 'foe') {
        const f = h.tg.o;
        sound.sfx('tetherBite');
        if (f.alive) foes.tethered(f);
        h.back = true;
      }
    }
  } else {
    h.len -= T.speed * 1.3 * dt;
    if (h.len <= 0) { hook = null; tetherCd = T.cooldown; tether.g.visible = false; return; }
  }
  const dd = h.back ? h.len : Math.min(h.d, h.len);
  const ex = P.x + h.dir.x * dd, ez = P.z + h.dir.z * dd;
  const ey = h.tg && !h.back ? lerp(hy, h.tg.y, Math.min(1, dd / Math.max(0.01, h.len))) : hy;
  drawLine(hx, hy, hz, ex, ey, ez);
}
function drawLine(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz) || 0.001;
  tether.line.scale.set(0.035, 0.035, l);
  tether.line.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  tether.line.lookAt(bx, by, bz);
  tether.head.position.set(bx, by, bz);
  tether.head.lookAt(bx + dx, by + dy, bz + dz);
  tether.g.visible = true;
}
// flying along the line to a ring: an arc, the line shortening ahead of you
function tetherFly(dt) {
  const F = P.fly;
  P.t += dt;
  const k = Math.min(1, P.t / F.dur), e = smooth(k);
  P.x = lerp(F.x0, F.x1, e); P.z = lerp(F.z0, F.z1, e);
  P.y = lerp(F.y0, F.y1, e) + Math.sin(k * Math.PI) * 1.1;
  P.face = Math.atan2(F.x1 - F.x0, F.z1 - F.z0);
  const m = P.model;
  m.root.position.set(P.x, P.y, P.z); m.root.rotation.y = P.face; m.root.visible = true;
  m.armR.rotation.set(-2.6, 0, 0); m.armL.rotation.set(-0.4, 0, 0.3);
  m.legL.rotation.x = 0.5; m.legR.rotation.x = -0.3;
  if (k < 0.92) drawLine(P.x, P.y + 1.4, P.z, F.ring.x, F.ring.y, F.ring.z); else tether.g.visible = false;
  if (Math.random() < 0.6) sparks.spawn({ x: P.x, y: P.y + 0.8, z: P.z, life: 0.3, size: 0.1, color: '#bff6ff', glow: 2, drag: 4 });
  if (k >= 1) {
    P.state = 'move'; P.t = 0; P.y = F.y1; P.fly = null; tether.g.visible = false;
    sound.sfx('land'); dust(P.x, P.y, P.z, 6, 0.6);
    resetPose();
  }
}

// ===========================================================================
// Gullcliff Caves: arriving, the guardian, chests, pots
// ===========================================================================
function cavesBuilt() {
  if (caves) return;
  cavesRoot = new THREE.Group();
  scene.add(cavesRoot);
  caves = buildCaves(cavesRoot, CAVES);
  caves.restore(cavesSaved);
  foesCaves = makeFoes(caves, cavesRoot);
  caves.attach({ P, foes: foesCaves, sound, shake, onEvent: caveEvent, onMap: () => {} });
  // the gate on the chain: pulled by the Tether
  caves.openGateChain = (rg) => { const dr = rg.gate; if (dr && !dr.open) { dr.open = true; for (const sd of dr.solids) { const i = caves.solids.indexOf(sd); if (i >= 0) caves.solids.splice(i, 1); } sound.sfx('doorOpen'); shake(0.25); caveEvent('gateUp'); } };
  cavesRoot.visible = false;
}
let bossSpawned = false;
function populateCaves() {
  foes.reset();
  for (const c of caves.populate()) { const f = foes.spawn(c.kind, c.x, c.z, { placed: true, wake: c.kind === 'barnacle' ? 10 : c.kind === 'shardmite' ? 5.5 : 7 }); f.amb = c.amb; }
  bossSpawned = false;
}
// the guardian wakes when you step into her chamber
function checkCaveBoss() {
  if (bossSpawned || caves.state.bossDone) return;
  const b = caves.boss;
  if (Math.hypot(P.x - b.x, P.z - b.z) > 9.5) return;
  bossSpawned = true;
  const f = foes.spawn('barnaclemother', b.x, b.z);
  if (f.crack) { cavesRoot.remove(f.crack); f.crack = null; }
  f.room = { x0: b.x - 9, x1: b.x + 9, z0: b.z - 9, z1: b.z + 9 };
  story.setStep('cavesBoss');
  bossEntrance({
    find: () => foes.list.find((o) => o.kind === 'barnaclemother' && o.alive),
    wide: { pos: new V3(b.x - 4, 1.4, b.z + 9), look: new V3(b.x, 2.5, b.z) },
    close: (o) => ({ pos: new V3(o.x + 3.5, 3.6, o.z + 7.5), look: new V3(o.x, 2.8, o.z) }),
    card: STORY.guardianCard, lines: STORY.guardianLines,
  });
}
async function caveEvent(name, arg) {
  if (name === 'sealed') { ui.toast('The bars come down'); }
  else if (name === 'cleared') { sound.sfx('roomClear'); ui.toast('The way is open'); }
  else if (name === 'unlock') { sound.sfx('unlock'); ui.toast('Unlocked'); syncKeys(); }
  else if (name === 'unlockBoss') { sound.sfx('unlock'); sound.sfx('roar'); ui.toast('The great lock gives way'); syncKeys(); }
  else if (name === 'locked') ui.toast(arg.kind === 'boss' ? STORY.bossDoor : STORY.lockedDoor);
  else if (name === 'stuck') ui.toast(STORY.gateStuck);
  else if (name === 'chainHint') ui.toast(STORY.leverHint);
  else if (name === 'gateUp') ui.toast('The gate rattles up');
  else if (name === 'shortcut') { sound.sfx('doorOpen'); ui.toast('A shortcut opens'); }
  else if (name === 'keepsake') await foundKeepsake(arg);
  else if (name === 'exit') { if (!travelling) travel('cove'); }
}
function syncKeys() { ui.setKeys(world === caves ? { small: caves.state.keys, big: caves.state.bigKey } : null); }
async function openChest(c) {
  caves.openChest(c);
  sound.sfx('treasure');
  for (let i = 0; i < 24; i++) { const a = Math.random() * TAU; sparks.spawn({ x: c.x, y: c.y + 0.8, z: c.z, vx: Math.cos(a) * 2, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 2, grav: 4, life: 1, size: 0.16, color: i % 2 ? '#ffe9a8' : '#bff6ff', glow: 2.6 }); }
  holdUp(true);
  if (c.item === 'tether') {
    giveTool('tether');
    await ui.itemGet(STORY.tether.name, STORY.tether.line, null);
    ui.showHint('tool', 'Hold the tool button to choose a tool', 6000);
  } else if (c.item === 'smallKey') await ui.itemGet(STORY.smallKey.name, STORY.smallKey.line, null);
  else if (c.item === 'bigKey') await ui.itemGet(STORY.bigKey.name, STORY.bigKey.line, null);
  holdUp(false);
  syncKeys();
  saveSoon = 0.4;
}
// the apprentice holds a found thing up over their head
function holdUp(on) {
  const m = P.model;
  if (on) { m.armL.rotation.set(-3.0, 0, 0.2); m.armR.rotation.set(-3.0, 0, -0.2); }
  else resetPose();
}
// a broken pot: now and then a heart, often a sliver
function potsHit(x, z, rad) {
  if (!world.breakPot) return;
  for (const p of world.breakPot(x, z, rad)) {
    sound.sfx('pot');
    for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, sp = 1.5 + Math.random() * 2.5; bits.spawn({ x: p.x, y: p.y + 0.4, z: p.z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, life: 1.2, size: 0.08 + Math.random() * 0.08, color: i % 2 ? '#9a6b55' : '#7d5646', floor: p.y }); }
    if (Math.random() < (P.hp < P.maxHp ? 0.5 : 0.2)) foes.dropHeart(p.x, p.y + 0.5, p.z);
    else if (Math.random() < 0.7) foes.dropSliver(p.x, p.y + 0.5, p.z);
  }
}

// the Barnacle Mother falls: a heart, the oil, and a column of light to climb out by
async function caveBossDown(f) {
  caves.guardianDown();
  await gwait(1.2);
  await story.say(STORY.guardianDown);
  P.maxHp += 2; P.hp = P.maxHp;
  holdUp(true);
  await ui.itemGet(STORY.heartUp.name, STORY.heartUp.line, null);
  await ui.itemGet(STORY.oil.name, STORY.oil.line, null);
  holdUp(false);
  story.setStep('reportOil');
  ui.toast('A shaft of light leads up and out');
  saveSoon = 0.3;
}
// a guardian's entrance, for any guardian: a low wide shot, then up close, its name, its lines
async function bossEntrance(o) {
  bossIntro = { };
  P.safe = 99; P.path = null; P.vx = P.vz = 0;
  ui.show(false);
  document.body.classList.add('cine');
  cineView = { pos: o.wide.pos, look: o.wide.look, k: 0.02 };
  let w = 0;
  while ((!o.find() || o.find().state === 'emerge') && w < 8) { await gwait(0.1); w += 0.1; }
  const f = o.find();
  if (f) {
    const c = o.close(f);
    cineView = { pos: c.pos, look: c.look, k: 0.025 };
    ui.titleCard(o.card.name, o.card.region, o.card.line);
    await gwait(3.4);
    await story.say(o.lines);
  }
  cineView = null; camBlend = 1.4;
  document.body.classList.remove('cine');
  ui.show(true);
  bossIntro = null;
  P.safe = 1.2;
}

// ----- getting hurt, falling, waking by the fire -----
let hurtFlash = 0, fade = 0, deadSat = 1;
const cineFlash = { r: 1, g: 1, b: 1, k: 0 };
function hurtPlayer(dmg, fx, fz) {
  if (!started || intro || P.state === 'dead' || P.iframes || P.invuln > 0 || P.safe > 0) return false;
  P.hp = Math.max(0, P.hp - dmg);
  P.invuln = HURT.invuln;
  const dx = P.x - fx, dz = P.z - fz, l = Math.hypot(dx, dz) || 1;
  P.kx = (dx / l) * HURT.knock; P.kz = (dz / l) * HURT.knock;
  if (P.state === 'attack') { P.state = 'move'; P.t = 0; }
  P.path = null;
  stop = Math.max(stop, 0.08);
  shake(0.5);
  hurtFlash = 1;
  sound.sfx('hurt');
  ui.hurt();
  for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; sparks.spawn({ x: P.x, y: P.y + 0.9, z: P.z, vx: Math.cos(a) * 2.5, vy: Math.random() * 2.5, vz: Math.sin(a) * 2.5, life: 0.4, size: 0.14, color: '#ff6b7a', glow: 1.8 }); }
  if (P.hp <= 0) fallDown();
  return true;
}
function fallDown() {
  stats.falls++;
  P.state = 'dead'; P.t = 0; P.path = null; P.kx *= 0.4; P.kz *= 0.4;
  sound.sfx('fall');
  for (const st of [ui.input.attack, ui.input.ranged]) st.down = false;
}
function deadUpdate(dt) {
  P.t += dt;
  const m = P.model, k = smooth(Math.min(1, P.t / 0.7));
  // falls back onto the ground, arms out
  P.spin.rotation.set(-k * Math.PI * 0.5, 0, 0);
  P.spin.position.y = 0.5 - k * 0.32;
  m.armL.rotation.set(-k * 2.6, 0, k * 0.5); m.armR.rotation.set(-k * 2.6, 0, -k * 0.5);
  m.legL.rotation.x = k * 0.2; m.legR.rotation.x = -k * 0.1;
  m.root.visible = true;
  deadSat = 1 - Math.min(1, P.t / 1.1) * 0.85;
  fade = clamp((P.t - 1.4) / 0.7, 0, 1);
  if (Math.abs(P.kx) + Math.abs(P.kz) > 0.01) { tryMove(P.kx * dt, P.kz * dt); P.kx *= Math.exp(-6 * dt); P.kz *= Math.exp(-6 * dt); }
  if (P.t >= HURT.respawnDelay) {
    // wake by the campfire: full health, the Seep calm again, nothing lost (it's the Prologue)
    foes.reset();
    ui.bossBar(null);
    if (world.onFell) world.onFell();
    P.x = world.spawn.x; P.z = world.spawn.z; P.y = world.groundAt(P.x, P.z);
    P.vx = P.vz = P.kx = P.kz = 0;
    P.hp = P.maxHp; P.invuln = 1.5;
    P.state = 'move'; P.t = 0; P.face = Math.PI * 0.85;
    resetPose();
    deadSat = 1;
    P.waking = 1;
    camLook.set(P.x, P.y + 0.6, P.z);
    ui.titleCard(world === cove ? TEXT.fallen : 'You wake where you came in', world === cove ? 'The Keeper\u2019s Cove' : RIFT.name, 'Nothing is lost in the Prologue.');
    sound.sfx('wake');
  }
  m.root.position.set(P.x, P.y, P.z);
}

function updatePlayer(dt) {
  if (dt <= 0) return;
  if (P.state === 'dead') { deadUpdate(dt); return; }
  if (P.state === 'tether') { tetherFly(dt); return; }
  // knockback from a hit slides you back a little, whatever you're doing
  if (Math.abs(P.kx) + Math.abs(P.kz) > 0.02) { tryMove(P.kx * dt, P.kz * dt); const kk = Math.exp(-11 * dt); P.kx *= kk; P.kz *= kk; }
  P.invuln = Math.max(0, P.invuln - dt);
  const I = ui.input, C = CONFIG.player, W = WEAPONS.skyblade, R = CONFIG.roll;
  if (I.roll.pressed) { P.rollBuf = R.buffer; I.roll.pressed = false; }
  if (I.attack.pressed) { P.atkBuf = 0.3; I.attack.pressed = false; }
  P.rollBuf = Math.max(0, P.rollBuf - dt); P.atkBuf = Math.max(0, P.atkBuf - dt);
  P.rollCd = Math.max(0, P.rollCd - dt); P.comboT = Math.max(0, P.comboT - dt); P.fireCd = Math.max(0, P.fireCd - dt);
  P.t += dt;
  const m = P.model;
  const prevFace = P.face;
  let moved = 0;

  if (P.state === 'roll') {
    const p = Math.min(1, P.t / R.duration);
    // a soft push off and a glide that keeps some speed at the end, so you roll straight back into running
    const f = (u) => 0.58 * u + 0.42 * (1 - (1 - u) * (1 - u));
    const dist = (f(p) - f(Math.max(0, (P.t - dt) / R.duration))) * R.distance;
    const ox = P.x, oz = P.z;
    tryMove(P.rollDir.x * dist, P.rollDir.y * dist);
    moved = Math.hypot(P.x - ox, P.z - oz);
    P.vx = (P.x - ox) / dt; P.vz = (P.z - oz) / dt;
    P.iframes = P.t >= R.iStart && P.t <= R.iEnd;
    rollPose(p);
    if (p > 0.15 && p < 0.8 && Math.random() < 0.4) sparks.spawn({ x: P.x, y: P.y + 0.45, z: P.z, vy: 0.2, life: 0.3, size: 0.16, color: '#bfefff', glow: 1, drag: 3 });
    if (p >= 1) {
      P.state = 'move'; P.t = 0; P.iframes = false; P.rollCd = R.cooldown;
      // leave the roll at a running pace in the roll's direction; the stick takes over from there
      const exit = Math.min(C.speed, R.distance * 0.58 / R.duration);
      P.vx = P.rollDir.x * exit; P.vz = P.rollDir.y * exit;
      P.walkK = Math.min(1, exit / C.speed);
      resetPose(true);
      dust(P.x, P.y, P.z, 2, 0.5);
    }
  } else if (P.state === 'attack') {
    const s = P.swing, st = s.step, T = P.t;
    const tA = st.windup, tB = st.windup + st.active, tC = tB + st.recover;
    // no step forward by itself; with the stick you can still walk, slowly, while swinging
    moved = locomote(dt, 0.4, false);
    if (T >= tA && !s.slash) {
      // the swing itself: a glowing arc and the hit check
      const sl = slashMesh(st.range + 0.15, st.arc, st.heavy ? '#d8fbff' : '#9ff3ff', st.heavy ? 3.0 : 2.2);
      sl.position.set(P.x, P.y + 0.75, P.z);
      sl.rotation.y = Math.atan2(s.dir.x, s.dir.z);
      sl.rotation.z = st.swing === 'left' ? 0.18 : st.swing === 'right' ? -0.18 : 0;
      sl.material.uniforms.uDir.value = st.swing === 'left' ? -1 : 1;
      scene.add(sl);
      s.slash = { mesh: sl, t: 0 };
      slashes.push(s.slash);
      sound.sfx(st.heavy ? 'swingHeavy' : 'swing');
      meleeHits(s);
    }
    // roll out of the windup or the recovery (not mid-swing); chain into the next swing; or finish
    if (P.rollBuf > 0 && P.rollCd <= 0 && (T < tA || T > tB)) startRoll();
    else if (T > tB + st.recover * 0.5 && (P.atkBuf > 0 || I.attack.down)) startSwing(aimFor(I.attack, 3.2));
    else if (T >= tC) { P.state = 'move'; P.t = 0; P.comboT = W.comboReset; }
    if (P.state === 'attack') swingPose(s, T, tA, tB, tC, dt, moved);
  }

  if (P.state === 'move') {
    const firing = I.ranged.down && tools.cur === 'sling';
    if (I.use) { useTool(I.use.aim); I.use = null; }
    if (firing) {
      P.path = null;
      const dir = aimFor(I.ranged, WEAPONS.tidesling.range);
      const diff = Math.atan2(Math.sin(Math.atan2(dir.x, dir.z) - P.face), Math.cos(Math.atan2(dir.x, dir.z) - P.face));
      P.face += clamp(diff, -C.turnRate * 2 * dt, C.turnRate * 2 * dt);
      if (P.fireCd <= 0 && Math.abs(diff) < 0.5) { fire(dir); P.fireCd = 1 / WEAPONS.tidesling.rate; }
      P.firing = 0.3;
    }
    moved = locomote(dt, firing ? 0.68 : 1, !firing);
    if (P.rollBuf > 0 && P.rollCd <= 0) startRoll();
    else if (P.atkBuf > 0 || (I.attack.down && P.comboT < W.comboReset - 0.1)) startSwing(aimFor(I.attack, 3.2));
  }
  P.firing = Math.max(0, P.firing - dt);

  // follow the ground: a quick hop up a step, a softer drop down
  const gy = world.groundAt(P.x, P.z);
  P.y += (gy - P.y) * Math.min(1, dt * (gy > P.y ? 18 : 11));
  m.root.position.set(P.x, P.y, P.z);
  m.root.rotation.y = P.face;
  m.root.visible = P.invuln > 0 ? Math.floor(P.invuln * 14) % 2 === 0 : true;
  // body language: lean into speed, bank into turns
  const speed = Math.hypot(P.vx, P.vz);
  const turn = Math.atan2(Math.sin(P.face - prevFace), Math.cos(P.face - prevFace)) / dt;
  const walking = P.state === 'move';
  P.walkK = lerp(P.walkK || 0, walking ? Math.min(1, speed / C.speed) : 0, damp(0.004, dt));
  P.lean = lerp(P.lean || 0, walking ? clamp(-turn * 0.03 * P.walkK, -0.2, 0.2) : 0, damp(0.002, dt));
  if (walking || P.state === 'attack') P.phase = (P.phase || 0) + moved * 3.1;   // strides follow the ground you cover, so feet never slide
  if (walking) {
    walkPose(dt, P.walkK);
    const fall = Math.floor(P.phase / Math.PI);
    if (fall !== P.lastFall && P.walkK > 0.25) { P.lastFall = fall; sound.sfx('step', 0.6 + P.walkK * 0.4); if (P.running || Math.random() < 0.5) dust(P.x, P.y, P.z, P.running ? 2 : 1, 0.35); }
  }
  // the camera leads a little toward where you're heading, smoothly
  P.leadX = lerp(P.leadX || 0, P.vx * 0.24, damp(0.15, dt));
  P.leadZ = lerp(P.leadZ || 0, P.vz * 0.24, damp(0.15, dt));
  // scarf: trails behind when moving, sways when still
  const now = performance.now() / 1000;
  const sv = P.state === 'roll' ? 1.2 : P.walkK;
  m.scarfTail.rotation.x = -0.15 + sv * 0.9 + Math.sin(now * 9) * 0.06 * (0.3 + sv);
  m.scarfTail.rotation.y = Math.sin(now * 3.1) * 0.2 - P.lean * 1.5;
  m.scarfEnd.rotation.x = sv * 0.3 + Math.sin(now * 11 + 1) * 0.12;
  // blink now and then
  const bl = (now % 4.2) < 0.12;
  for (const e of m.eyes) e.scale.y = bl ? 0.15 : 1;
  const combo = P.state === 'attack' ? P.swing.idx + 1 : P.comboT > 0 ? P.combo : 0;
  ui.setCooldowns(P.state === 'roll' ? 1 : P.rollCd / R.cooldown, Math.min(1, P.fireCd * WEAPONS.tidesling.rate), combo);
}

const tw = (cur, target, dt, k = 0.00002) => lerp(cur, target, damp(k, dt));
function walkPose(dt, k) {
  const m = P.model, ph = P.phase || 0, t = performance.now() / 1000;
  const s = Math.sin(ph) * 0.8 * k;
  m.legL.rotation.x = tw(m.legL.rotation.x, s, dt);
  m.legR.rotation.x = tw(m.legR.rotation.x, -s, dt);
  m.armL.rotation.set(tw(m.armL.rotation.x, P.firing > 0 ? -1.4 : -s * 0.7, dt), tw(m.armL.rotation.y, 0, dt), 0);
  m.armR.rotation.set(tw(m.armR.rotation.x, s * 0.55 - 0.12, dt), tw(m.armR.rotation.y, 0, dt), 0);
  m.torso.rotation.y = tw(m.torso.rotation.y, Math.sin(ph) * 0.06 * k, dt);
  // a bob on every step while moving, slow breathing while standing
  m.body.position.y = tw(m.body.position.y, -0.5 + Math.abs(Math.sin(ph)) * 0.055 * k + Math.sin(t * 2.2) * 0.008 * (1 - k), dt, 0.0001);
  m.body.rotation.x = tw(m.body.rotation.x, k * 0.13, dt, 0.001);
  m.head.rotation.x = tw(m.head.rotation.x, -k * 0.06, dt, 0.001);
  P.spin.rotation.z = P.lean || 0;
  P.spin.rotation.y = tw(P.spin.rotation.y, 0, dt);
  P.spin.position.y = tw(P.spin.position.y, 0.5, dt, 0.0005);
}
function rollPose(p) {
  const m = P.model;
  // gather into a tuck, tumble once with a smooth start and finish, and open up again as you land
  const e = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
  const tuck = Math.sin(clamp(p / 0.92, 0, 1) * Math.PI);
  P.spin.rotation.x = e((p - 0.08) / 0.84) * TAU;
  P.spin.rotation.z = 0; P.spin.rotation.y = 0;
  P.spin.position.y = 0.5 + Math.sin(p * Math.PI) * 0.08 - tuck * 0.16;
  P.spin.scale.set(1, 1 - tuck * 0.08, 1);
  m.legL.rotation.x = -1.5 * tuck; m.legR.rotation.x = -1.3 * tuck;
  m.armL.rotation.set(-1.9 * tuck, 0, 0); m.armR.rotation.set(-1.6 * tuck, 0, 0);
  m.head.rotation.x = 0.5 * tuck;
  m.torso.rotation.y = 0;
  m.body.position.y = -0.5;
  m.body.rotation.x = 0.28 * tuck;
}
function resetPose(keepHeight) {
  P.spin.rotation.set(0, 0, 0);
  if (!keepHeight) P.spin.position.y = 0.5;
  P.spin.scale.set(1, 1, 1);
}
function swingPose(s, T, tA, tB, tC, dt, moved) {
  const m = P.model, st = s.step;
  const L = st.swing === 'left' ? -1 : 1;
  let yaw, pitch = -1.45;
  if (T < tA) { const k = smooth(T / tA); yaw = lerp(0, 1.5 * L, k); pitch = lerp(-0.4, -1.7, k); }
  else if (T < tB) { const k = (T - tA) / (tB - tA); yaw = lerp(1.5 * L, -1.4 * L, smooth(k)); }
  else { const k = smooth(Math.min(1, (T - tB) / (tC - tB))); yaw = lerp(-1.4 * L, -0.3 * L, k); pitch = lerp(-1.45, -0.5, k); }
  if (st.swing === 'spin') {
    yaw = T < tA ? lerp(0, 1.2, T / tA) : -0.4;
    pitch = T < tB ? -1.5 : lerp(-1.5, -0.5, Math.min(1, (T - tB) / (tC - tB)));
    P.spin.rotation.y = T < tA ? lerp(0, 0.5, smooth(T / tA)) : T < tB ? lerp(0.5, -TAU + 0.5, smooth((T - tA) / (tB - tA))) : lerp(-TAU + 0.5, -TAU, smooth(Math.min(1, (T - tB) / 0.15)));
  }
  const wind = T < tA ? smooth(T / tA) : 1;
  m.armR.rotation.set(pitch, yaw * 0.55, 0);
  m.torso.rotation.y = yaw * 0.32;
  m.armL.rotation.set(-0.5, -yaw * 0.2, 0);
  // planted feet when standing still, a slow shuffle when walking while swinging
  const ph = P.phase || 0, walking = moved > 0.0005;
  m.legL.rotation.x = walking ? Math.sin(ph) * 0.5 : 0.35 * wind;
  m.legR.rotation.x = walking ? -Math.sin(ph) * 0.5 : -0.3 * wind;
  m.body.rotation.x = T < tB ? 0.08 + 0.12 * wind : 0.1;
  m.body.position.y = -0.5 - (T < tB ? 0.07 * wind : 0.04);
  m.head.rotation.x = 0;
  P.spin.rotation.z = 0;
  P.spin.position.y = 0.5;
}

// the swing connects: everything inside the arc takes the hit, once
function meleeHits(s) {
  const st = s.step;
  const half = (st.arc / 2) * Math.PI / 180;
  const faceA = Math.atan2(s.dir.x, s.dir.z);
  let any = false;
  for (const d of world.dummies) {
    const dx = d.x - P.x, dz = d.z - P.z, dist = Math.hypot(dx, dz);
    if (dist > st.range + d.r) continue;
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - faceA), Math.cos(Math.atan2(dx, dz) - faceA)));
    if (da > half + 0.25) continue;
    any = true;
    hitDummy(d, dx / (dist || 1), dz / (dist || 1), st.dmg, st.heavy, WEAPONS.skyblade.knock);
  }
  for (const t of world.targets) {
    const dx = t.x - P.x, dz = t.z - P.z, dist = Math.hypot(dx, dz);
    if (dist > st.range + t.r || Math.abs(t.y - (P.y + 0.9)) > 1.2) continue;
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - faceA), Math.cos(Math.atan2(dx, dz) - faceA)));
    if (da <= half + 0.25 && t.onHit) { t.onHit('sword'); any = true; }
  }
  for (const f of foes.targets()) {
    const dx = f.x - P.x, dz = f.z - P.z, dist = Math.hypot(dx, dz);
    if (dist > st.range + f.D.r) continue;
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - faceA), Math.cos(Math.atan2(dx, dz) - faceA)));
    if (da > half + 0.25) continue;
    if (foes.hit(f, dx / (dist || 1), dz / (dist || 1), st.dmg, st.heavy, WEAPONS.skyblade.knock)) any = true;
  }
  potsHit(P.x + s.dir.x * 1.0, P.z + s.dir.z * 1.0, st.range * 0.7);
  if (any) { stop = st.heavy ? CONFIG.feel.hitStop * 2 : CONFIG.feel.hitStop; shake(st.heavy ? 0.5 : 0.28); }
}

const tmpV = new V3();
function hitDummy(d, nx, nz, dmg, heavy, knock) {
  d.vel.x += nx * knock * (heavy ? 1.8 : 1); d.vel.y += nz * knock * (heavy ? 1.8 : 1);
  d.flashT = 1;
  d.hits++;
  story.onDummyHit();
  const hx = d.x - nx * 0.25, hz = d.z - nz * 0.25, hy = d.root.position.y + 0.95;
  // sparks of skyglass and chips of straw and wood
  for (let i = 0; i < (heavy ? 22 : 12); i++) {
    const a = Math.atan2(nx, nz) + (Math.random() - 0.5) * 2.2, sp = 2 + Math.random() * 5;
    sparks.spawn({ x: hx, y: hy, z: hz, vx: Math.sin(a) * sp, vy: (Math.random() - 0.2) * 4, vz: Math.cos(a) * sp, drag: 4, grav: 4, life: 0.35 + Math.random() * 0.3, size: 0.14, color: i % 3 ? '#bff6ff' : '#ffffff', glow: 3 });
  }
  for (let i = 0; i < (heavy ? 9 : 5); i++) {
    const a = Math.atan2(nx, nz) + (Math.random() - 0.5) * 1.6, sp = 1.5 + Math.random() * 3;
    bits.spawn({ x: hx, y: hy, z: hz, vx: Math.sin(a) * sp, vy: 2 + Math.random() * 3, vz: Math.cos(a) * sp, life: 1.2, size: 0.06 + Math.random() * 0.06, color: Math.random() < 0.5 ? '#c8b28a' : '#9b7b5c', floor: d.root.position.y });
  }
  sound.sfx('hit', heavy ? 1.2 : 1); sound.sfx('wood', 0.8);
  tmpV.set(d.x, hy + 0.6, d.z).project(camera);
  ui.number(String(dmg), (tmpV.x + 1) / 2 * view.w, (1 - tmpV.y) / 2 * view.h, heavy);
  if (d.hits === 3) ui.showHint('roll', TEXT.hintRoll);
}

// the sling: bright drops of sea water that fly, sag and splash
const dropGeo = new THREE.BoxGeometry(1, 1, 1);
const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe8ff').multiplyScalar(2.2) });
function fire(dir) {
  const S = WEAPONS.tidesling;
  const m = new THREE.Mesh(dropGeo, dropMat);
  m.scale.setScalar(S.size * 1.4);
  const ox = P.x + dir.x * 0.45 - dir.z * 0.12, oz = P.z + dir.z * 0.45 + dir.x * 0.12;
  m.position.set(ox, P.y + 0.95, oz);
  scene.add(m);
  projectiles.push({ m, x: ox, y: P.y + 0.95, z: oz, vx: dir.x * S.speed, vz: dir.z * S.speed, vy: 0.6, dist: 0, S });
  sound.sfx('sling');
  P.model.armL.rotation.x = -1.7;
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i], S = p.S;
    const dx = p.vx * dt, dz = p.vz * dt;
    p.x += dx; p.z += dz; p.dist += Math.hypot(dx, dz);
    // flat at first, then the drop sags and falls, like a tear in Isaac
    if (p.dist > S.range * 0.65) p.vy -= 22 * dt; else p.vy -= 1.5 * dt;
    p.y += p.vy * dt;
    p.m.position.set(p.x, p.y, p.z);
    p.m.rotation.set(p.dist * 3, p.dist * 2, 0);
    if (Math.random() < 0.8) sparks.spawn({ x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.12, color: '#7fe8ff', glow: 1.6, drag: 6 });
    let done = false, hitD = null;
    for (const d of world.dummies) if (Math.hypot(d.x - p.x, d.z - p.z) < d.r + S.size && p.y < d.root.position.y + 1.6) { hitD = d; break; }
    const gy = world.groundAt(p.x, p.z);
    let hitF = null;
    if (!hitD) for (const f of foes.targets()) if (Math.hypot(f.x - p.x, f.z - p.z) < f.D.r + S.size + 0.1 && p.y < f.y + (f.kind === 'bellfish' ? 2.4 : 1.4)) { hitF = f; break; }
    if (hitF) {
      const l = Math.hypot(p.vx, p.vz) || 1;
      foes.hit(hitF, p.vx / l, p.vz / l, S.dmg, false, S.knock);
      stop = Math.max(stop, 0.02);
      done = true; hitD = hitF;
    } else if (!hitD && world.targetAt(p.x, p.y, p.z, S.size)) {
      // a target: a switch or a crystal; it decides what happens
      const t = world.targetAt(p.x, p.y, p.z, S.size);
      if (t.onHit) t.onHit('sling');
      done = true;
    } else if (hitD) {
      const l = Math.hypot(p.vx, p.vz) || 1;
      hitDummy(hitD, p.vx / l, p.vz / l, S.dmg, false, S.knock);
      stop = Math.max(stop, 0.02);
      done = true;
    } else if (p.y <= Math.max(gy, 0) + 0.05 || world.shotBlocked(p.x, p.y, p.z, S.size * 0.6)) done = true;   // houses, trees, rocks, cliffs
    if (done) {
      potsHit(p.x, p.z, 0.25);
      splash(p.x, Math.max(gy, -0.05) + 0.05, p.z, !!hitD);
      scene.remove(p.m);
      projectiles.splice(i, 1);
    }
  }
}
function splash(x, y, z, big) {
  for (let i = 0; i < (big ? 14 : 9); i++) {
    const a = Math.random() * TAU, sp = 1 + Math.random() * 2.5;
    sparks.spawn({ x, y: y + 0.1, z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * sp, grav: 9, drag: 1.5, life: 0.5, size: 0.13, color: i % 2 ? '#bff6ff' : '#7fe8ff', glow: 2 });
  }
  sound.sfx('splash', big ? 1 : 0.6);
}
function dust(x, y, z, n, k = 1) {
  const sand = world.groundAt(x, z) < 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = (0.6 + Math.random()) * k;
    bits.spawn({ x: x + Math.cos(a) * 0.2, y: y + 0.08, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 1.5 * k, vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, size: 0.05 + Math.random() * 0.05, color: sand ? '#e5cf9b' : '#a8c27a', floor: y });
  }
}

// the dummies wobble back upright on a spring
function updateDummies(dt) {
  for (const d of world.dummies) {
    const k = 60, c = 6;
    d.vel.x += (-k * d.tilt.x - c * d.vel.x) * dt;
    d.vel.y += (-k * d.tilt.y - c * d.vel.y) * dt;
    d.tilt.x += d.vel.x * dt; d.tilt.y += d.vel.y * dt;
    d.tilt.x = clamp(d.tilt.x, -0.6, 0.6); d.tilt.y = clamp(d.tilt.y, -0.6, 0.6);
    // tilt is in world x/z: lean away from the hit
    const ry = d.root.rotation.y, cs = Math.cos(-ry), sn = Math.sin(-ry);
    const lx = d.tilt.x * cs - d.tilt.y * sn, lz = d.tilt.x * sn + d.tilt.y * cs;
    d.wob.rotation.set(lz * 0.5, 0, -lx * 0.5);
    d.head.rotation.x = -lz * 0.4;
    d.flashT = Math.max(0, (d.flashT || 0) - dt * 7);
    d.flash(d.flashT);
  }
}

// glowing arcs fade out on their own
const slashes = [];
function updateSlashes(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.t += dt;
    s.mesh.material.uniforms.uT.value = s.t / 0.28;
    s.mesh.position.set(P.x, P.y + 0.75, P.z);
    if (s.t > 0.28) { scene.remove(s.mesh); s.mesh.material.dispose(); slashes.splice(i, 1); }
  }
}

// the aim marker: a soft chevron on the ground while you aim
const aimMark = (() => {
  const b = new Batch(1);
  for (let i = 0; i < 3; i++) {
    b.box(0.08, 0.02, 0.32, '#9ff3ff', 0.12, 0, 1.0 + i * 0.32, { rotY: 0.7, glow: 1.4 - i * 0.35, jitter: 0, ao: 1 });
    b.box(0.08, 0.02, 0.32, '#9ff3ff', -0.12, 0, 1.0 + i * 0.32, { rotY: -0.7, glow: 1.4 - i * 0.35, jitter: 0, ao: 1 });
  }
  const m = b.mesh(MAT.glowAdd);
  m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = true;
  m.visible = false;
  return m;
})();

// ===========================================================================
// Camera: the PixelPups angle, following with a little lead, plus shake and the opening shot
// ===========================================================================
const camLook = new V3(), camPos = new V3();
let intro = null;
function shake(k) { if (prefs.shake) trauma = Math.min(1, trauma + k); }
function gameplayCam(out, outLook) {
  const C = CONFIG.camera;
  // look a little ahead of where you're heading (the lead is smoothed in updatePlayer)
  outLook.set(P.x + (P.leadX || 0) * C.lookAhead, P.y + 0.6, P.z + (P.leadZ || 0) * C.lookAhead);
  const portrait = clamp(0.85 / camera.aspect, 1, 1.55);
  const dist = C.dist * ui.input.zoom * portrait;
  out.copy(outLook).addScaledVector(camDir, dist);
}
const wantPos = new V3(), wantLook = new V3();
let camBlend = 0, camDist = CONFIG.camera.dist, cineView = null, camFocus = null;
function updateCamera(dt, t) {
  gameplayCam(wantPos, wantLook);
  if (!started) {
    // the title screen: a slow drift around the island at dusk
    const a = 2.2 + t * 0.03;
    camPos.set(6 + Math.cos(a) * 36, 21 + Math.sin(t * 0.11) * 1.5, -4 + Math.sin(a) * 36);
    camLook.set(9 + Math.cos(a) * 6, 4.5, -6 + Math.sin(a) * 6);
  } else if (intro) {
    if (started) intro.t += dt;
    const T = intro.t;
    // looking up at the crack in the sky, then down to the cove and the apprentice
    const k = smooth(clamp((T - 2.2) / 4.2, 0, 1));
    const startPos = tmpV.set(P.x - 4, P.y + 2.2, P.z + 9);
    const startLook = new V3().copy(startPos).addScaledVector(world.crackDir, 50);
    camPos.lerpVectors(startPos, wantPos, k);
    camLook.lerpVectors(startLook, wantLook, smooth(k));
    camPos.y += Math.sin(k * Math.PI) * 4;
    if (T > 3.2 && !intro.card) { intro.card = true; const pl = PLACES.cove; ui.titleCard(pl.name, pl.region, pl.line); }
    // any touch or key after the first moment skips ahead
    if (started && (T > 6.6 || (ui.input.any && T > 0.8))) {
      if (!intro.card) { const pl = PLACES.cove; ui.titleCard(pl.name, pl.region, pl.line); }
      intro = null;
      camBlend = T > 6.6 ? 0 : 1.6;
      story.begin();
      ui.show(true);
      setTimeout(() => { if (!P.everMoved) ui.showHint('move', TEXT.hintMove, 6500); }, 5200);   // after the place name has faded
    }
  } else if (cineView) {
    // a cinematic: the story points the camera somewhere and it glides there
    camPos.lerp(cineView.pos, damp(cineView.k || 0.03, dt));
    camLook.lerp(cineView.look, damp(cineView.k || 0.03, dt));
    camBlend = 1.4;
  } else {
    // the look point follows you softly; the camera keeps a fixed angle and distance from it,
    // so the view glides without swimming. In a conversation it settles between you and who you're talking to.
    // a guardian pulls the view toward itself, so you can see it and the ground you stand on
    const boss = !camFocus && foes.list.find((f) => f.alive && f.kind === 'gardener');
    if (camFocus) wantLook.set(camFocus.x, P.y + 0.7, camFocus.z);
    else if (boss) wantLook.set(lerp(wantLook.x, boss.x, 0.42), P.y + 1.3, lerp(wantLook.z, boss.z, 0.42));
    camLook.lerp(wantLook, damp(CONFIG.camera.follow, dt));
    const C = CONFIG.camera;
    camDist = lerp(camDist, C.dist * ui.input.zoom * (camFocus ? camFocus.zoom : boss ? 1.18 : 1) * clamp(0.85 / camera.aspect, 1, 1.55), damp(0.01, dt));
    const fixed = tmpV.copy(camLook).addScaledVector(camDir, camDist);
    if (camBlend > 0) { camBlend -= dt; camPos.lerp(fixed, damp(0.004, dt)); }
    else camPos.copy(fixed);
  }
  camera.position.copy(camPos);
  if (window.RF && RF.view) { camera.position.set(...RF.view.pos); camera.lookAt(...RF.view.look); return; }
  // shake: strong and short, decays fast
  if (trauma > 0) {
    const s = trauma * trauma * 0.35;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
    trauma = Math.max(0, trauma - dt * 2.8);
  }
  camera.lookAt(camLook);
  // the sun's shadow box follows you (snapped to texels so edges don't shimmer)
  const span = 20, step = (span * 2) / (sun.shadow.mapSize.x || 1024);
  const fx = Math.round(camLook.x / step) * step, fz = Math.round(camLook.z / step) * step;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx, 0, fz).addScaledVector(lightDir, 50);
  const S = sun.shadow.camera;
  if (S.right !== span) { S.left = -span; S.right = span; S.top = span; S.bottom = -span; S.near = 1; S.far = 120; S.updateProjectionMatrix(); }
}

// ===========================================================================
// Main loop
// ===========================================================================
let last = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) tick(dt);
  post.render();
}
// one step of the game (without drawing)
function tick(dt) {
  time += dt;
  ui.keyFrame();
  watchFrames(dt);
  // hit-stop: the action freezes for a few frames, effects keep moving
  let simDt = dt;
  if (stop > 0) { stop -= dt; simDt = dt * 0.04; }
  P.safe = Math.max(0, (P.safe || 0) - dt);
  if (wheelSlow) simDt *= 0.2;   // choosing a tool: the world slows almost to a stop
  if (started && !intro && world === cove) story.update(dt);
  if (world === caves && started) {
    // in the caves the sword button opens chests
    const c = !story.busy() && P.state === 'move' ? caves.chestNear(P) : null;
    ui.setContext(c ? 'open' : null);
    if (c && ui.input.attack.pressed && !travelling) { ui.input.attack.pressed = false; ui.input.attack.down = false; openChest(c); }
    checkCaveBoss();
  } else if (world !== cove) ui.setContext(null);
  if (travelling) updateTravel(dt);
  if (floodPlane) floodPlane.position.y = -0.3 + foesRift.flood.k * 0.42;
  ui.talkFrame(dt);
  const busy = started && !intro && (story.busy() || !!travelling || !!bossIntro);
  if (started && !intro && !busy) {
    // the sword button says "Talk" when someone is near: then it talks instead of swinging
    // (only in the cove: there's no one to talk to and no door to open inside the Rift)
    if (world === cove && ui.input.attack.pressed && story.tryTalk()) { ui.input.attack.pressed = false; ui.input.attack.down = false; }
    if (ui.input.tap) { if (P.state === 'move' && !ui.input.ranged.down) walkTo(ui.input.tap.x, ui.input.tap.y); ui.input.tap = null; }
    updatePlayer(simDt);
    updateHook(simDt);
    updateProjectiles(simDt);
    foes.update(simDt, camera);
  } else {
    // in a conversation or a cinematic, the apprentice just stands and listens
    P.vx *= 0.8; P.vz *= 0.8; P.path = null;
    if (busy) { updateProjectiles(simDt); foes.update(simDt, camera); }
    P.walkK = lerp(P.walkK || 0, 0, Math.min(1, dt * 6));
    walkPose(dt, 0);
    P.model.root.position.set(P.x, P.y, P.z);
    P.model.root.rotation.y = angLerp(P.model.root.rotation.y, P.face, Math.min(1, dt * 8));
    P.model.root.visible = true;
  }
  updateDummies(simDt);
  updateSlashes(simDt);
  if (tapRing.visible) {
    const r = tapRing.userData.t += dt;
    tapRing.scale.setScalar(0.6 + Math.min(1, r * 4) * 0.5 + r * 0.3);
    tapRing.material.opacity = Math.max(0, 1 - r / 0.7);
    if (r > 0.7) tapRing.visible = false;
  }
  // aim marker
  const I = ui.input, aiming = started && !intro && (I.attack.aim.active || I.ranged.aim.active || I.ranged.down);
  aimMark.visible = aiming;
  if (aiming) {
    const d = aimFor(I.ranged.down || I.ranged.aim.active ? I.ranged : I.attack, 9);
    aimMark.position.set(P.x, P.y + 0.06, P.z);
    aimMark.rotation.y = Math.atan2(d.x, d.z);
  }
  // the Seep announces itself the first time you come near
  if (world === cove && started && !intro && !P.seenSeep && Math.hypot(P.x - world.seep.x, P.z - world.seep.z) < world.seep.r + 3.5) { P.seenSeep = true; ui.titleCard(SEEP.name, 'Lanternhold', SEEP.line); }
  // hint when you first reach the training ground
  if (world === cove && started && !intro && Math.hypot(P.x - world.dummies[1].x, P.z - world.dummies[1].z) < 6) ui.showHint('attack', TEXT.hintAttack, 7000);
  world.update(dt, time, P);
  sparks.update(dt);
  bits.update(dt);
  updateCamera(dt, time);
  // the sea travels with the camera, so it reaches the horizon whichever way you look
  if (world === cove) cove.sea.position.set(camera.position.x, cove.seaLevel, camera.position.z);
  // the screen: a red pulse when you're hurt, colour draining and a fade to black when you fall, and back
  hurtFlash = Math.max(0, hurtFlash - dt * 3.5);
  if (P.waking) { P.waking = Math.max(0, P.waking - dt * 1.1); fade = P.waking; }
  updateCurtain(dt);
  if (started) updateGTimers(dt);
  // once you've walked a good while, a quiet word about running
  if (started && !intro && !P.runHinted && P.state === 'move' && (P.walkK || 0) > 0.8 && !ui.input.run) { P.walkT = (P.walkT || 0) + dt; if (P.walkT > 12) { P.runHinted = true; ui.showHint('run', TEXT.hintRun, 6000); } }
  updateIslandMap();
  const dark = Math.max(fade, curtain.k);
  // the clock and the tide
  if (started && clock.running && world === cove && !story.state.cine && !story.state.ending) {
    clockH = (clockH + dt / 60) % 24;
    clock.acc = (clock.acc || 0) + dt;
    if (clock.acc > 0.25) { clock.acc = 0; setClock(clockH); }
  }
  cove.seaLevel = clock.running ? tideAt(clockH) : -0.08;
  // the journey's clock, and saving now and then
  if (started && !intro) {
    stats.time += dt;
    if (saveSoon >= 0) { saveSoon -= dt; if (saveSoon < 0) writeSave(); }
    saveClock += dt;
    if (saveClock > 30 && !busy && world === cove) { saveClock = 0; writeSave(); }
  }
  const FU = post.final.uniforms;
  cineFlash.k = Math.max(0, cineFlash.k - dt * 1.6);
  if (cineFlash.k > 0.01) { FU.flashCol.value.setRGB(cineFlash.r, cineFlash.g, cineFlash.b); FU.flash.value = cineFlash.k; }
  else if (dark > 0) { FU.flashCol.value.setRGB(0.02, 0.01, 0.05); FU.flash.value = dark; }
  else { FU.flashCol.value.setRGB(0.85, 0.08, 0.16); FU.flash.value = hurtFlash * 0.22; }
  FU.sat.value = 1.08 * deadSat;
  FU.vig.value = 0.42 + (1 - deadSat) * 0.4 + hurtFlash * 0.25;
  ui.setHearts(P.hp, P.maxHp);
  ui.setShards(P.shards);
  sound.update();
}

// ===========================================================================
// Start
// ===========================================================================
try {
  coveRoot = new THREE.Group();
  scene.add(coveRoot);
  cove = world = buildCove(coveRoot);
  world.crackDir = new V3(0.25, 0.62, -0.75).normalize();
  sparks = createSparks(scene, 700);
  bits = createBits(scene, 320);
  world.fx.sparks = sparks;
  foesCove = foes = makeFoes(cove, coveRoot);
  scene.add(aimMark, tapRing);
  ui = createUI({
    canvas, prefs,
    isPaused: () => paused,
    isStarted: () => started,
    onPause: () => { paused = true; sound.suspend(true); },
    onResume: () => { paused = false; last = performance.now(); sound.suspend(false); },
    onPrefs: () => { applyQuality(); sound.volumes(); },
    onLocked: () => { sound.sfx('deny'); ui.toast('Abilities awaken later in the Prologue'); },
    onJump: (where) => playtestJump(where),
    onTitle: () => saveAndQuit(),
    onTool: (id) => setTool(id),
    onWheel: (open) => { wheelSlow = open; },
    onWarp: (id) => warpTo(id),
    journey,
    sfx: (n) => sound.sfx(n),
  });
  setupPlayer();
  story = createStory({
    scene: coveRoot, world, foes, P, ui, sound, sparks, bits, shake,
    flash: (r, g, b, k) => { Object.assign(cineFlash, { r, g, b, k }); },
    setTime,
    cine: (v) => { cineView = v; },
    focus: (f) => { camFocus = f; },
    safe: (sec) => { P.safe = sec; },
    travel: (to) => travel(to),
    curtain: (k, sec) => curtainTo(k, sec),
    snapCamera: () => snapCamera(),
    onStep: () => { saveSoon = 0.6; },
    onEnding: () => onEnding(),
    startClock: () => { clock.running = true; },
    lightStone: (w) => lightStone(w),
    foundKeepsake: (k) => foundKeepsake(k),
    keepsakesReady: () => keepsakesAll() && !memories.breakfast,
    remembered: () => { memories.breakfast = 1; saveSoon = 0.3; },
  });
  setTime(0);
  applyQuality();
  syncTools();
  // the island map turns with the view, so "up" on the map is "up" on the screen
  ui.buildMap(cove.mapInfo, MAP_ROT);
  // the title screen's view of the island, drawn behind the loading veil
  intro = null;
  updateCamera(0, 0);
  scene.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
  ui.setHearts(P.hp, P.maxHp);
  requestAnimationFrame(frame);
  // the cove is ready: lift the veil and show the title menu over it
  loadingDone();
  setTimeout(showTitle, 450);
  addEventListener('pagehide', () => writeSave());
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  if (/[?&]debug/.test(location.search)) window.RF = { P, get foes() { return foes; }, story, get world() { return world; }, get rift() { return rift; }, travel, playtestJump, hurtPlayer, setTime, setClock, clock, tools, useTool, giveTool, setTool, get caves() { return caves; }, get hook() { return hook; }, warpTo, kept, memories, get clockH() { return clockH; }, set clockH(v) { clockH = v; }, newGame: () => beginJourney(null), continueGame: () => beginJourney(readSave()), readSave, writeSave, clearSave, get stats() { return stats; }, curtain, projectiles, camera, scene, renderer, ui, post, look, prefs, skip: () => { if (intro) intro.t = 99; }, advance: (sec) => { for (let i = 0; i < sec * 60; i++) tick(1 / 60); } };
} catch (e) {
  console.error(e);
  loadingFailed('Something went wrong while building the cove: ' + (e && e.message ? e.message : e));
}
