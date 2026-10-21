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
  talk: '<svg viewBox="0 0 48 48"><path d="M9 12h30a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-8 7v-7H9a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="currentColor"/><circle cx="16" cy="23" r="2.6" fill="#1d1b4a"/><circle cx="24" cy="23" r="2.6" fill="#1d1b4a"/><circle cx="32" cy="23" r="2.6" fill="#1d1b4a"/></svg>',
  enter: '<svg viewBox="0 0 48 48"><path d="M12 42V18a12 12 0 0 1 24 0v24z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 14l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="currentColor"/></svg>',
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
// The stage is always landscape. A phone held upright (or locked upright) gets the whole game turned sideways,
// so turning the phone never changes anything.
export const view = { rot: false, w: innerWidth, h: innerHeight };
export function updateView() {
  const rot = matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth;
  view.rot = rot;
  view.w = rot ? innerHeight : innerWidth;
  view.h = rot ? innerWidth : innerHeight;
  document.body.classList.toggle('rot', rot);
  return view;
}
// a point on the screen -> the same point on the (maybe turned) stage
export function toStage(cx, cy) { return view.rot ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
updateView();

export function createUI(opts) {
  const prefs = opts.prefs;
  const root = $('#ui');
  root.innerHTML = '';

  // shared input state, read by the game every frame
  const input = {
    move: { x: 0, y: 0, active: false },
    attack: { down: false, pressed: false, aim: { x: 0, y: 0, active: false } },
    ranged: { down: false, pressed: false, aim: { x: 0, y: 0, active: false } },
    roll: { pressed: false },
    ability: { pressed: false },
    tap: null,        // a quick tap on the ground: { x, y } on the stage, the game walks you there
    mouse: { x: 0, y: 0, has: false },
    zoom: 1,
    any: false,       // set on any input, so the opening shot can be skipped
  };

  // ----- HUD -----
  const hud = el('div', 'hud');
  const hearts = el('div', 'hearts');
  hud.appendChild(hearts);
  // Skyglass slivers you've gathered: a small voxel shard and a number, shown once you have any
  const shards = el('div', 'shards hidden', '<i class="sIc"><svg viewBox="0 0 12 18" shape-rendering="crispEdges"><rect x="4" y="0" width="4" height="3" fill="#e6fdff"/><rect x="2" y="3" width="8" height="10" fill="#9ff3ff"/><rect x="4" y="13" width="4" height="4" fill="#5fd6ec"/><rect x="2" y="3" width="3" height="6" fill="#e6fdff"/><rect x="8" y="5" width="2" height="8" fill="#3fb5d0"/></svg></i><b>0</b>');
  hud.appendChild(shards);
  const pauseBtn = el('button', 'pauseBtn glass', ICON.pause);
  pauseBtn.setAttribute('aria-label', 'Pause');
  hud.appendChild(pauseBtn);
  const hint = el('div', 'hint glass');
  hud.appendChild(hint);
  const numbers = el('div', 'numbers');
  hud.appendChild(numbers);
  root.appendChild(hud);

  // ----- action buttons: an arc around the sword, each with a cooldown ring -----
  const pad = el('div', 'pad');
  pad.appendChild(el('div', 'padGlow'));
  const RING = '<svg class="cd" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47"/></svg>';
  const mkBtn = (cls, icon, label, extra = '') => { const b = el('button', 'act ' + cls, `${RING}<span class="ic">${icon}</span>${extra}`); b.setAttribute('aria-label', label); pad.appendChild(b); return b; };
  const bAttack = mkBtn('attack', ICON.sword, 'Attack', '<span class="pips"><i></i><i></i><i></i></span>');
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

  // ----- touch -----
  // one finger: a quick tap walks you there; a drag brings up the joystick (on the left side of the screen)
  // two fingers: pinch to zoom. The buttons aim when you drag them.
  const canvas = opts.canvas;
  const touches = new Map();      // pointerId -> what it's doing
  const R = 56;                   // joystick radius (px)
  const AIM_R = 46;
  const TAP_MOVE = 12, TAP_TIME = 350;
  let pinch = null;
  const stagePt = (e) => toStage(e.clientX, e.clientY);
  const onButtonSide = (x) => (prefs.lefty ? x < view.w * 0.4 : x > view.w * 0.6);
  const btnFor = (t) => (t === bAttack ? input.attack : t === bRanged ? input.ranged : null);
  function startButton(e, btn) {
    e.preventDefault();
    input.any = true;
    if (talk.lines || performance.now() - talk.ended < 400) return;
    if (btn === bRoll) { input.roll.pressed = true; pulse(bRoll); return; }
    if (btn === bAbility) { pulse(bAbility); return; }
    const st = btnFor(btn);
    st.down = true; st.pressed = true;
    st.aim.active = false; st.aim.x = st.aim.y = 0;
    const r = btn.getBoundingClientRect();
    const c = toStage(r.left + r.width / 2, r.top + r.height / 2);
    touches.set(e.pointerId, { kind: 'btn', btn, st, cx: c.x, cy: c.y });
    btn.classList.add('held');
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  for (const b of [bAttack, bRanged, bRoll, bAbility]) b.addEventListener('pointerdown', (e) => startButton(e, b));
  function moveButton(t, e) {
    const p = stagePt(e);
    let dx = p.x - t.cx, dy = p.y - t.cy;
    const len = Math.hypot(dx, dy);
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
  function releaseStick(t) {
    if (!t.stick) return;
    t.stick = false;
    input.move.x = input.move.y = 0; input.move.active = false;
    joy.classList.add('fade');
    setTimeout(() => { if (![...touches.values()].some((x) => x.stick)) joy.style.display = 'none'; }, 180);
  }
  function updatePinch() {
    const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y) || 1;
    input.zoom = Math.max(0.65, Math.min(1.5, pinch.z * pinch.d0 / d));
  }
  canvas.addEventListener('pointerdown', (e) => {
    input.any = true;
    if (opts.isPaused() || talk.lines || performance.now() - talk.ended < 400) return;
    const p = stagePt(e);
    if (e.pointerType === 'mouse') {
      // desktop: left = swing, right = sling, toward the cursor
      input.mouse.has = true; input.mouse.x = p.x; input.mouse.y = p.y;
      const st = e.button === 2 ? input.ranged : input.attack;
      st.down = true; st.pressed = true;
      touches.set(e.pointerId, { kind: 'mouse', st, button: e.button });
      return;
    }
    const field = [...touches.values()].filter((t) => t.kind === 'field');
    if (field.length === 1 && !pinch) {
      // a second finger: pinch to zoom (the first finger stops steering)
      const a = field[0];
      releaseStick(a);
      a.pinched = true;
      const b = { kind: 'pinch2', x: p.x, y: p.y };
      pinch = { a, b, d0: Math.hypot(p.x - a.x, p.y - a.y) || 1, z: input.zoom };
      touches.set(e.pointerId, b);
      return;
    }
    if (field.length >= 2 || pinch) return;
    touches.set(e.pointerId, { kind: 'field', sx: p.x, sy: p.y, x: p.x, y: p.y, t0: performance.now(), stick: false, pinched: false, far: 0 });
  });
  window.addEventListener('pointermove', (e) => {
    const p = stagePt(e);
    if (e.pointerType === 'mouse') { input.mouse.has = true; input.mouse.x = p.x; input.mouse.y = p.y; }
    const t = touches.get(e.pointerId);
    if (!t) return;
    if (t.kind === 'btn') { moveButton(t, e); return; }
    t.x = p.x; t.y = p.y;
    if (pinch && (pinch.a === t || pinch.b === t)) { updatePinch(); return; }
    if (t.kind !== 'field' || t.pinched) return;
    let dx = t.x - t.sx, dy = t.y - t.sy;
    t.far = Math.max(t.far, Math.hypot(dx, dy));
    // a drag turns into the joystick, which appears where the drag started
    if (!t.stick && t.far > TAP_MOVE && !onButtonSide(t.sx)) {
      t.stick = true;
      joy.style.display = 'block';
      joy.style.left = t.sx + 'px'; joy.style.top = t.sy + 'px';
      joy.classList.remove('fade');
      input.tap = null;
      hideHint('move');
    }
    if (t.stick) {
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
    else if (t.kind === 'pinch2') pinch = null;
    else if (t.kind === 'field') {
      if (pinch && pinch.a === t) { pinch = null; touches.forEach((o, id) => { if (o.kind === 'pinch2') touches.delete(id); }); }
      // a quick tap that didn't wander: walk there
      if (!t.stick && !t.pinched && t.far <= TAP_MOVE && performance.now() - t.t0 < TAP_TIME && e.type === 'pointerup') { input.tap = { x: t.x, y: t.y }; hideHint('move'); }
      releaseStick(t);
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
    if (talk.lines || performance.now() - talk.ended < 400) return;   // keys go to the conversation, not the apprentice
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

  let shown = -1;
  function setShards(n, gained) {
    if (n === shown && !gained) return;
    shown = n;
    shards.classList.toggle('hidden', n <= 0);
    shards.querySelector('b').textContent = n;
    if (gained) { shards.classList.remove('gain'); void shards.offsetWidth; shards.classList.add('gain'); }
  }
  function hurt() { hearts.classList.remove('hurt'); void hearts.offsetWidth; hearts.classList.add('hurt'); }

  // ----- the current goal: one quiet line under the hearts -----
  const quest = el('div', 'quest', '<i class="qDot"></i><span></span>');
  hud.appendChild(quest);
  let questT = null;
  function setObjective(text) {
    if (!text) { quest.classList.remove('on'); return; }
    quest.querySelector('span').textContent = text;
    quest.classList.remove('on', 'fresh'); void quest.offsetWidth; quest.classList.add('on', 'fresh');
    clearTimeout(questT);
    questT = setTimeout(() => quest.classList.remove('fresh'), 4500);
  }

  // ----- dialogue: a glass panel at the bottom; tap (or Space) to show the rest or go on -----
  const dlg = el('div', 'dlg hidden', '<div class="dlgBox"><div class="dlgName"></div><div class="dlgText"></div><div class="dlgMore"></div></div>');
  root.appendChild(dlg);
  const talk = { lines: null, i: 0, shown: 0, full: '', done: null, last: 0, ended: -1e9 };
  function showLine() {
    const L = talk.lines[talk.i];
    const name = dlg.querySelector('.dlgName');
    name.textContent = L.who || '';
    name.style.color = L.color || '';
    name.classList.toggle('none', !L.who);
    talk.full = L.text; talk.shown = 0;
    dlg.querySelector('.dlgText').textContent = '';
    dlg.classList.remove('more');
    opts.sfx && opts.sfx('blip');
  }
  function say(lines) {
    return new Promise((resolve) => {
      talk.lines = lines; talk.i = 0; talk.done = resolve;
      document.body.classList.add('talking');
      dlg.classList.remove('hidden');
      // let go of anything held
      for (const st of [input.attack, input.ranged]) { st.down = false; st.aim.active = false; st.pressed = false; }
      input.move.x = input.move.y = 0; input.move.active = false; input.roll.pressed = false; input.tap = null;
      touches.clear(); joy.style.display = 'none'; aimRing.style.display = 'none';
      pad.querySelectorAll('.held').forEach((b) => b.classList.remove('held'));
      showLine();
    });
  }
  function advance() {
    if (!talk.lines || performance.now() - talk.last < 140) return;
    talk.last = performance.now();
    if (talk.shown < talk.full.length) { talk.shown = talk.full.length; return; }
    talk.i++;
    if (talk.i < talk.lines.length) { showLine(); return; }
    dlg.classList.add('hidden');
    document.body.classList.remove('talking');
    input.roll.pressed = false; input.attack.pressed = false; input.attack.down = false;
    const done = talk.done; talk.lines = null; talk.done = null; talk.ended = performance.now();
    done && done();
  }
  dlg.addEventListener('pointerdown', (e) => { e.preventDefault(); advance(); });
  window.addEventListener('keydown', (e) => { if (talk.lines && [' ', 'enter', 'j'].includes(e.key.toLowerCase())) { e.preventDefault(); advance(); } });
  function talkFrame(dt) {
    if (!talk.lines || talk.shown >= talk.full.length) return;
    const before = Math.floor(talk.shown);
    talk.shown = Math.min(talk.full.length, talk.shown + dt * 48);
    if (Math.floor(talk.shown) !== before) {
      dlg.querySelector('.dlgText').textContent = talk.full.slice(0, Math.floor(talk.shown));
      if (Math.floor(talk.shown) % 3 === 0) opts.sfx && opts.sfx('voice');
    }
    if (talk.shown >= talk.full.length) dlg.classList.add('more');
  }

  // ----- context: near someone you can talk to, the sword button becomes "Talk" -----
  let ctxKind = null;
  function setContext(kind) {
    if (kind === ctxKind) return;
    ctxKind = kind;
    bAttack.querySelector('.ic').innerHTML = kind === 'talk' ? ICON.talk : kind === 'enter' ? ICON.enter : ICON.sword;
    bAttack.classList.toggle('ctx', !!kind);
    bAttack.setAttribute('aria-label', kind === 'talk' ? 'Talk' : kind === 'enter' ? 'Enter' : 'Attack');
  }

  // ----- the guardian's health, across the top of the screen -----
  const boss = el('div', 'bossBar', '<div class="bbName"></div><div class="bbTrack"><i class="bbChip"></i><i class="bbFill"></i></div>');
  hud.appendChild(boss);
  let bossChip = 1;
  function bossBar(name, frac) {
    if (!name) { boss.classList.remove('on'); return; }
    if (!boss.classList.contains('on')) { boss.querySelector('.bbName').textContent = name; boss.classList.add('on'); bossChip = frac; }
    boss.querySelector('.bbFill').style.width = (frac * 100).toFixed(1) + '%';
    bossChip = Math.max(frac, bossChip - 0.004);
    boss.querySelector('.bbChip').style.width = (bossChip * 100).toFixed(1) + '%';
  }

  // ----- the map of the Rift: rooms you've seen, the one you're in, the guardian's and the treasure -----
  const map = el('div', 'miniMap hidden');
  hud.appendChild(map);
  let mapKey = '';
  function setMap(state) {
    if (!state) { map.classList.add('hidden'); mapKey = ''; return; }
    const k = JSON.stringify(state);
    if (k === mapKey) return;
    mapKey = k;
    map.classList.remove('hidden');
    const shown = state.rooms.filter((rm) => rm.seen);
    const i0 = Math.min(...shown.map((rm) => rm.i)), j0 = Math.min(...shown.map((rm) => rm.j));
    const i1 = Math.max(...shown.map((rm) => rm.i)), j1 = Math.max(...shown.map((rm) => rm.j));
    map.style.gridTemplateColumns = `repeat(${i1 - i0 + 1}, 22px)`;
    map.style.gridTemplateRows = `repeat(${j1 - j0 + 1}, 16px)`;
    map.innerHTML = shown.map((rm) => `<i class="mr ${rm.visited ? 'v' : 's'} ${rm.here ? 'here' : ''} ${rm.type}" style="grid-column:${rm.i - i0 + 1};grid-row:${rm.j - j0 + 1}"></i>`).join('');
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
      <div class="group">
        <div class="gTitle">Playtest shortcuts</div>
        <div class="jumps"><button data-jump="riftfall">Skip to the Riftfall</button><button data-jump="rift">Go into the Rift</button></div>
        <p class="sub">For testing only: these skip story steps. Saving arrives in round 5.</p>
      </div>
      <details class="group help">
        <summary class="gTitle">Controls</summary>
        <p><b>Move</b> — drag on the left side, or tap where you want to go. <b>Swing</b> — tap the sword, hold to keep swinging, drag it to aim. <b>Sling</b> — hold to keep throwing, drag to aim. <b>Roll</b> — you can't be hurt mid-roll. <b>Zoom</b> — pinch.</p>
        <p class="sub">Keyboard: WASD move · J swing · K or arrow keys sling · Space roll · Esc pause. Mouse: left swing, right sling, toward the cursor.</p>
      </details>
      <div class="foot">Riftfall v${VERSION} · Prologue, round 4</div>
    </div>`;
  root.appendChild(sheet);
  function syncSheet() {
    sheet.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', prefs.quality === b.dataset.v));
    sheet.querySelectorAll('input[data-pref]').forEach((i) => { if (i.type === 'checkbox') i.checked = !!prefs[i.dataset.pref]; else i.value = prefs[i.dataset.pref]; });
  }
  sheet.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-jump], .seg button');
    if (e.target === sheet) { resume(); return; }
    if (!t) return;
    if (t.dataset.act === 'resume') { resume(); return; }
    if (t.dataset.jump) { resume(); opts.onJump && opts.onJump(t.dataset.jump); return; }
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
  // cooldown rings fill back up; pips show where you are in the sword combo
  const ringOf = (b) => b.querySelector('.cd circle');
  let lastCd = '';
  function setCooldowns(rollLeft, slingLeft, combo) {
    const key = rollLeft.toFixed(2) + slingLeft.toFixed(2) + combo;
    if (key === lastCd) return;
    lastCd = key;
    const C = 295.3;   // circumference of the ring
    ringOf(bRoll).style.strokeDashoffset = (C * rollLeft).toFixed(1);
    ringOf(bRanged).style.strokeDashoffset = (C * slingLeft).toFixed(1);
    bRoll.classList.toggle('cool', rollLeft > 0.001);
    bRanged.classList.toggle('cool', slingLeft > 0.001);
    bAttack.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < combo));
  }

  return {
    input, setHearts, setShards, hurt, setObjective, bossBar, setMap, say, talkFrame, setContext, isTalking: () => !!talk.lines, showHint, hideHint, titleCard, number, toast, pause, resume, keyFrame, setCooldowns,
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
