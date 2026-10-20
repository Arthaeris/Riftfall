/* Riftfall — ui.js
   Everything on top of the 3D view: touch controls, keyboard & mouse, the quiet HUD, title cards,
   hints, damage numbers, and the pause & settings sheet. */
import { VERSION, TEXT } from '@rf/data';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ---------------------------------------------------------------------------
// Preferences (saved on this device)
// ---------------------------------------------------------------------------
const PREF_KEY = 'riftfall-prefs';
const DEFAULT_PREFS = { quality: 'auto', shake: true, numbers: true, lefty: false, music: 0.6, sfx: 0.8, seen: {} };
export function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (_) { p = {}; }
  return Object.assign({}, DEFAULT_PREFS, p, { seen: Object.assign({}, (p && p.seen) || {}) });
}
export function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) { /* private mode: fine */ } }

// ---------------------------------------------------------------------------
// Icons (drawn, so they match the style and scale crisply)
// ---------------------------------------------------------------------------
const ICON = {
  sword: '<svg viewBox="0 0 48 48"><path d="M33 7l8 0 0 8-17 17-8-8z" fill="currentColor" opacity=".95"/><path d="M14 26l8 8-3 3-2-1-5 5-3-3 5-5-1-2z" fill="currentColor"/><path d="M35 9l4 0 0 4-15 15-2-2z" fill="#fff" opacity=".55"/></svg>',
  sling: '<svg viewBox="0 0 48 48"><circle cx="31" cy="17" r="7" fill="currentColor"/><circle cx="29" cy="15" r="2.4" fill="#fff" opacity=".7"/><path d="M10 38c6-6 9-10 14-15" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M8 41l5-1-1 5z" fill="currentColor"/></svg>',
  roll: '<svg viewBox="0 0 48 48"><path d="M24 9a15 15 0 1 1-14.2 10.2" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" fill="none"/><path d="M6 12l4.5 8.5 8.5-4.5" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="24" cy="24" r="4.5" fill="currentColor"/></svg>',
  spark: '<svg viewBox="0 0 48 48"><path d="M24 5l4 14 14 5-14 5-4 14-4-14-14-5 14-5z" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="3.6" height="14" rx="1.6" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.6" fill="currentColor"/></svg>',
};

// A voxel heart: a little pixel heart where every pixel is a block with a lit top edge and a shaded side.
// state: 2 = full, 1 = half, 0 = empty
const HEART_PX = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
function voxelHeart(state) {
  const S = 4, D = 1.6;   // block size and depth of the shaded side (px in the 34 x 30 box)
  let side = '', face = '', hi = '';
  HEART_PX.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== 'X') return;
    const full = state === 2 || (state === 1 && x <= 3);
    const px = 2 + x * S, py = 2 + y * S;
    side += `<rect x="${px + D}" y="${py + D}" width="${S}" height="${S}" fill="${full ? '#8e1f3c' : 'rgba(10,6,24,.55)'}"/>`;
    face += `<rect x="${px}" y="${py}" width="${S}" height="${S}" fill="${full ? (y < 2 ? '#ff5a68' : y < 4 ? '#f2404f' : '#d93347') : 'rgba(40,30,70,.6)'}"/>`;
    // a lit top edge on each block, a little highlight in the upper left
    if (full) hi += `<rect x="${px}" y="${py}" width="${S}" height="1" fill="rgba(255,210,215,.55)"/>`;
    if (full && ((x === 1 && y === 1) || (x === 1 && y === 0) || (x === 2 && y === 1))) hi += `<rect x="${px + 0.6}" y="${py + 0.6}" width="${S - 1.4}" height="${S - 1.4}" fill="#ffc2c8"/>`;
  }));
  const outline = state ? '' : HEART_PX.map((row, y) => [...row].map((ch, x) => ch === 'X' ? `<rect x="${2 + x * S}" y="${2 + y * S}" width="${S}" height="${S}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".5"/>` : '').join('')).join('');
  return `<svg viewBox="0 0 34 30" shape-rendering="crispEdges">${side}${face}${hi}${outline}</svg>`;
}

// ---------------------------------------------------------------------------
// The UI
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
export function createUI(opts) {
  const prefs = opts.prefs;
  const root = $('#ui');
  root.innerHTML = '';

  // Riftfall is played sideways: holding the phone upright shows a gentle reminder (and pauses)
  if (!$('.rotate')) {
    document.body.appendChild(el('div', 'rotate', '<div class="rotBox"><div class="rotPhone"><i></i></div><div class="rotTitle">Turn your phone sideways</div><div class="rotSub">Riftfall is played in landscape.</div></div>'));
  }
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
  const onTurn = () => { if (portrait.matches && opts.isStarted()) pause(); };
  if (portrait.addEventListener) portrait.addEventListener('change', onTurn); else portrait.addListener(onTurn);

  // shared input state, read by the game every frame
  const input = {
    move: { x: 0, y: 0, active: false },
    attack: { down: false, pressed: false, aim: { x: 0, y: 0, active: false } },
    ranged: { down: false, pressed: false, aim: { x: 0, y: 0, active: false } },
    roll: { pressed: false },
    ability: { pressed: false },
    mouse: { x: 0, y: 0, has: false },
    zoom: 1,
    any: false,       // set on any input, so the opening shot can be skipped
  };

  // ----- HUD -----
  const hud = el('div', 'hud');
  const hearts = el('div', 'hearts');
  hud.appendChild(hearts);
  const pauseBtn = el('button', 'pauseBtn glass', ICON.pause);
  pauseBtn.setAttribute('aria-label', 'Pause');
  hud.appendChild(pauseBtn);
  const hint = el('div', 'hint glass');
  hud.appendChild(hint);
  const numbers = el('div', 'numbers');
  hud.appendChild(numbers);
  root.appendChild(hud);

  // ----- action buttons -----
  const pad = el('div', 'pad');
  const mkBtn = (cls, icon, label) => { const b = el('button', 'act ' + cls, `<span class="ring"></span><span class="ic">${icon}</span>`); b.setAttribute('aria-label', label); pad.appendChild(b); return b; };
  const bAttack = mkBtn('attack', ICON.sword, 'Attack');
  const bRanged = mkBtn('ranged', ICON.sling, 'Sling');
  const bRoll = mkBtn('roll', ICON.roll, 'Roll');
  const bAbility = mkBtn('ability hidden', ICON.spark, 'Ability');   // appears once an ability is unlocked
  root.appendChild(pad);
  const joy = el('div', 'joy', '<div class="knob"></div>');
  root.appendChild(joy);
  const aimRing = el('div', 'aimRing', '<div class="aimDot"></div>');
  root.appendChild(aimRing);

  function applyLayout() { document.body.classList.toggle('lefty', !!prefs.lefty); }
  applyLayout();

  // ----- touch: a joystick wherever you put your thumb, buttons that aim when you drag them -----
  const canvas = opts.canvas;
  const touches = new Map();      // pointerId -> what it's doing
  const R = 56;                   // joystick radius (px)
  const AIM_R = 46;
  let pinch = null;
  const btnFor = (t) => (t === bAttack ? input.attack : t === bRanged ? input.ranged : null);
  function startButton(e, btn) {
    e.preventDefault();
    input.any = true;
    if (btn === bRoll) { input.roll.pressed = true; pulse(bRoll); return; }
    if (btn === bAbility) { pulse(bAbility); opts.onLocked && opts.onLocked(); return; }
    const st = btnFor(btn);
    st.down = true; st.pressed = true;
    st.aim.active = false; st.aim.x = st.aim.y = 0;
    const r = btn.getBoundingClientRect();
    touches.set(e.pointerId, { kind: 'btn', btn, st, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    btn.classList.add('held');
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  for (const b of [bAttack, bRanged, bRoll, bAbility]) b.addEventListener('pointerdown', (e) => startButton(e, b));
  function moveButton(t, e) {
    const dx = e.clientX - t.cx, dy = e.clientY - t.cy, len = Math.hypot(dx, dy);
    if (len > 18) {
      t.st.aim.active = true;
      t.st.aim.x = dx / len; t.st.aim.y = dy / len;
      aimRing.style.display = 'block';
      aimRing.style.left = t.cx + 'px'; aimRing.style.top = t.cy + 'px';
      const k = Math.min(len, AIM_R * 1.6);
      aimRing.firstChild.style.transform = `translate(${(dx / len) * k}px, ${(dy / len) * k}px)`;
      aimRing.classList.toggle('ranged', t.btn === bRanged);
    }
  }
  function endButton(t) {
    t.st.down = false;
    t.st.aim.active = false;
    t.btn.classList.remove('held');
    aimRing.style.display = 'none';
  }
  canvas.addEventListener('pointerdown', (e) => {
    input.any = true;
    if (opts.isPaused()) return;
    if (e.pointerType === 'mouse') {
      // desktop: left = swing, right = sling, toward the cursor
      input.mouse.has = true; input.mouse.x = e.clientX; input.mouse.y = e.clientY;
      const st = e.button === 2 ? input.ranged : input.attack;
      st.down = true; st.pressed = true;
      touches.set(e.pointerId, { kind: 'mouse', st, button: e.button });
      return;
    }
    const others = [...touches.values()].filter((t) => t.kind === 'joy');
    // the right side belongs to the buttons: a thumb landing there doesn't start the joystick
    const buttonSide = prefs.lefty ? e.clientX < innerWidth * 0.4 : e.clientX > innerWidth * 0.6;
    if (!others.length && buttonSide) return;
    if (others.length === 1) {
      // a second finger on the field: pinch to zoom
      const a = others[0];
      pinch = { a: a, startD: Math.hypot(e.clientX - a.x, e.clientY - a.y) || 1, z: input.zoom, id: e.pointerId, x: e.clientX, y: e.clientY };
      touches.set(e.pointerId, { kind: 'pinch' });
      return;
    }
    touches.set(e.pointerId, { kind: 'joy', sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY });
    joy.style.display = 'block';
    joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px';
    joy.classList.remove('fade');
    joy.firstChild.style.transform = '';
    hideHint('move');
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { input.mouse.has = true; input.mouse.x = e.clientX; input.mouse.y = e.clientY; }
    const t = touches.get(e.pointerId);
    if (!t) return;
    if (t.kind === 'btn') { moveButton(t, e); return; }
    if (t.kind === 'pinch' && pinch) {
      const d = Math.hypot(e.clientX - pinch.a.x, e.clientY - pinch.a.y) || 1;
      input.zoom = Math.max(0.65, Math.min(1.5, pinch.z * pinch.startD / d));
      return;
    }
    if (t.kind === 'joy') {
      t.x = e.clientX; t.y = e.clientY;
      if (pinch && pinch.a === t) { const d = Math.hypot(pinch.x - t.x, pinch.y - t.y) || 1; input.zoom = Math.max(0.65, Math.min(1.5, pinch.z * pinch.startD / d)); return; }
      let dx = t.x - t.sx, dy = t.y - t.sy;
      const len = Math.hypot(dx, dy);
      // the base follows your thumb if you drag far, so you never run out of stick
      if (len > R * 1.25) { const k = (len - R * 1.25) / len; t.sx += dx * k; t.sy += dy * k; dx = t.x - t.sx; dy = t.y - t.sy; joy.style.left = t.sx + 'px'; joy.style.top = t.sy + 'px'; }
      const l2 = Math.hypot(dx, dy), k = l2 > R ? R / l2 : 1;
      input.move.x = (dx * k) / R; input.move.y = (dy * k) / R; input.move.active = l2 > 6;
      joy.firstChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
  }, { passive: true });
  function endPointer(e) {
    const t = touches.get(e.pointerId);
    if (!t) return;
    touches.delete(e.pointerId);
    if (t.kind === 'btn') endButton(t);
    else if (t.kind === 'mouse') t.st.down = false;
    else if (t.kind === 'pinch') pinch = null;
    else if (t.kind === 'joy') {
      if (pinch && pinch.a === t) pinch = null;
      input.move.x = input.move.y = 0; input.move.active = false;
      joy.classList.add('fade');
      setTimeout(() => { if (![...touches.values()].some((x) => x.kind === 'joy')) joy.style.display = 'none'; }, 180);
    }
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { input.zoom = Math.max(0.65, Math.min(1.5, input.zoom * (e.deltaY > 0 ? 1.07 : 0.93))); e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // ----- keyboard -----
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    input.any = true;
    if (k === 'escape' || k === 'p') { opts.isPaused() ? resume() : pause(); return; }
    if (keys[k]) return;
    keys[k] = true;
    if (k === ' ' || k === 'shift' || k === 'l') { input.roll.pressed = true; e.preventDefault(); }
    if (k === 'j') { input.attack.down = true; input.attack.pressed = true; }
    if (k === 'k') { input.ranged.down = true; input.ranged.pressed = true; }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === 'j') input.attack.down = false;
    if (k === 'k') input.ranged.down = false;
  });
  // arrow keys aim the sling, Isaac-style
  function keyFrame() {
    const kx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0), ky = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); input.move.x = kx / l; input.move.y = ky / l; input.move.active = true; input._kb = true; }
    else if (input._kb) { input.move.x = input.move.y = 0; input.move.active = false; input._kb = false; }
    const ax = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0), ay = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
    if (ax || ay) { const l = Math.hypot(ax, ay); input.ranged.down = true; input.ranged.aim.active = true; input.ranged.aim.x = ax / l; input.ranged.aim.y = ay / l; input._ka = true; }
    else if (input._ka) { input.ranged.down = false; input.ranged.aim.active = false; input._ka = false; }
  }

  function pulse(b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }

  // ----- hearts -----
  let lastHearts = '';
  function setHearts(hp, max) {
    const key = hp + '/' + max;
    if (key === lastHearts) return;
    lastHearts = key;
    hearts.innerHTML = '';
    for (let i = 0; i < max / 2; i++) {
      const v = Math.max(0, Math.min(2, hp - i * 2));
      const h = el('i', 'heart ' + (v === 2 ? 'full' : v === 1 ? 'half' : 'empty'), voxelHeart(v));
      hearts.appendChild(h);
    }
  }

  // ----- hints: small, once, then gone -----
  let hintKey = null, hintT = null;
  function showHint(key, text, ms = 5200) {
    if (prefs.seen[key]) return;
    hintKey = key;
    hint.textContent = text;
    hint.classList.add('on');
    clearTimeout(hintT);
    hintT = setTimeout(() => hideHint(key), ms);
  }
  function hideHint(key) {
    if (key && hintKey !== key) return;
    if (hintKey) { prefs.seen[hintKey] = 1; savePrefs(prefs); }
    hint.classList.remove('on');
    hintKey = null;
  }

  // ----- title card: the name of a place, gently -----
  const card = el('div', 'titleCard', '<div class="tcRegion"></div><div class="tcName"></div><div class="tcRule"></div><div class="tcLine"></div>');
  root.appendChild(card);
  function titleCard(name, region, line) {
    $('.tcRegion', card).textContent = region;
    $('.tcName', card).textContent = name;
    $('.tcLine', card).textContent = line;
    card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
  }

  // ----- floating damage numbers -----
  const live = [];
  function number(text, sx, sy, heavy) {
    if (!prefs.numbers) return;
    const n = el('div', 'num' + (heavy ? ' heavy' : ''), text);
    n.style.left = sx + 'px'; n.style.top = sy + 'px';
    numbers.appendChild(n);
    live.push(n);
    setTimeout(() => { n.remove(); live.splice(live.indexOf(n), 1); }, 900);
  }
  function toast(text) {
    const t = el('div', 'toast glass', text);
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 2200);
  }

  // ----- pause & settings -----
  const sheet = el('div', 'veil hidden');
  sheet.innerHTML = `
    <div class="sheet glass" role="dialog" aria-label="Paused">
      <div class="sheetHead"><div><div class="kicker">Lanternhold</div><h2>Paused</h2></div><button class="x" data-act="resume" aria-label="Resume">✕</button></div>
      <button class="primary" data-act="resume">Resume</button>
      <div class="group">
        <div class="gTitle">Graphics</div>
        <div class="seg" data-pref="quality">
          <button data-v="auto">Auto</button><button data-v="high">High</button><button data-v="medium">Balanced</button><button data-v="low">Battery</button>
        </div>
        <p class="sub">Auto starts on High and steps down if your phone needs it.</p>
      </div>
      <div class="group">
        <div class="gTitle">Sound</div>
        <label class="row"><span>Music</span><input type="range" min="0" max="1" step="0.05" data-pref="music"></label>
        <label class="row"><span>Effects</span><input type="range" min="0" max="1" step="0.05" data-pref="sfx"></label>
      </div>
      <div class="group">
        <div class="gTitle">Play</div>
        <label class="row"><span>Screen shake</span><input type="checkbox" class="sw" data-pref="shake"></label>
        <label class="row"><span>Damage numbers</span><input type="checkbox" class="sw" data-pref="numbers"></label>
        <label class="row"><span>Left-handed buttons</span><input type="checkbox" class="sw" data-pref="lefty"></label>
      </div>
      <details class="group help">
        <summary class="gTitle">Controls</summary>
        <p><b>Move</b> — drag anywhere on the left. <b>Swing</b> — tap the sword, hold to keep swinging, drag it to aim. <b>Sling</b> — hold to keep throwing, drag to aim. <b>Roll</b> — you can't be hurt mid-roll. <b>Zoom</b> — pinch.</p>
        <p class="sub">Keyboard: WASD move · J swing · K or arrow keys sling · Space roll · Esc pause. Mouse: left swing, right sling, toward the cursor.</p>
      </details>
      <div class="foot">Riftfall v${VERSION} · Prologue, round 1.1</div>
    </div>`;
  root.appendChild(sheet);
  function syncSheet() {
    sheet.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', prefs.quality === b.dataset.v));
    sheet.querySelectorAll('input[data-pref]').forEach((i) => { if (i.type === 'checkbox') i.checked = !!prefs[i.dataset.pref]; else i.value = prefs[i.dataset.pref]; });
  }
  sheet.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], .seg button');
    if (e.target === sheet) { resume(); return; }
    if (!t) return;
    if (t.dataset.act === 'resume') { resume(); return; }
    if (t.parentElement.classList.contains('seg')) { prefs.quality = t.dataset.v; changed(); }
  });
  sheet.addEventListener('input', (e) => {
    const i = e.target;
    if (!i.dataset.pref) return;
    prefs[i.dataset.pref] = i.type === 'checkbox' ? i.checked : parseFloat(i.value);
    changed();
  });
  function changed() { savePrefs(prefs); syncSheet(); applyLayout(); opts.onPrefs && opts.onPrefs(prefs); opts.sfx && opts.sfx('tick'); }
  function pause() {
    if (opts.isPaused()) return;
    syncSheet();
    sheet.classList.remove('hidden');
    opts.onPause && opts.onPause();
    // let go of anything held
    for (const st of [input.attack, input.ranged]) { st.down = false; st.aim.active = false; }
    input.move.x = input.move.y = 0; input.move.active = false;
    touches.clear(); joy.style.display = 'none'; aimRing.style.display = 'none';
    pad.querySelectorAll('.held').forEach((b) => b.classList.remove('held'));
  }
  function resume() { sheet.classList.add('hidden'); opts.onResume && opts.onResume(); }
  pauseBtn.addEventListener('click', () => { pause(); opts.sfx && opts.sfx('open'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && opts.isStarted()) pause(); });

  // ----- the ability button shows its (still locked) charge -----
  function setCooldowns(rollReady) { bRoll.classList.toggle('cool', !rollReady); }

  return {
    input, setHearts, showHint, hideHint, titleCard, number, toast, pause, resume, keyFrame, setCooldowns,
    show(on) { document.body.classList.toggle('playing', on); },
  };
}

// The loading veil and the first tap (which also wakes the sound on iPhones)
export function loadingDone(onStart) {
  const ld = $('#loading');
  ld.classList.add('ready');
  const go = () => {
    ld.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    ld.classList.add('gone');
    setTimeout(() => ld.remove(), 1200);
    onStart();
  };
  ld.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}
export function loadingFailed(msg) {
  const ld = $('#loading');
  if (!ld) return;
  ld.classList.add('failed');
  const m = $('.ldMsg', ld);
  if (m) m.textContent = msg;
}
export { TEXT };
