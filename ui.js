/* Riftfall — ui.js
   Everything on top of the 3D view: touch controls, keyboard & mouse, the quiet HUD, title cards,
   hints, damage numbers, the title menu, the pause sheet (journey, settings, help) and the end of the Prologue. */
import { VERSION, TEXT, STORY, NPCS } from '@rf/data';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ---------------------------------------------------------------------------
// Preferences (saved on this device)
// ---------------------------------------------------------------------------
const PREF_KEY = 'riftfall-prefs';
const DEFAULT_PREFS = { quality: 'auto', shake: true, numbers: true, lefty: false, music: 0.6, sfx: 0.8, camSens: 1, invertY: false, seen: {} };
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
  sleep: '<svg viewBox="0 0 48 48"><path d="M30 8a16 16 0 1 0 12 25A13 13 0 0 1 30 8z" fill="currentColor"/><path d="M34 12h6l-6 7h6" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" fill="none" opacity=".8"/></svg>',
  lantern: '<svg viewBox="0 0 24 24"><path d="M9 4h6M12 2v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 7h10l-1 11H8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10c1.6 1.8 1.6 3.6 0 5-1.6-1.4-1.6-3.2 0-5z" fill="currentColor"/><path d="M6 20h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tether: '<svg viewBox="0 0 48 48"><path d="M9 39C17 31 21 27 27 21" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 5" fill="none"/><path d="M27 21l3-9 4 6 6 1-7 3-3 7z" fill="currentColor"/><path d="M33 8c4 0 7 3 7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="9" cy="39" r="4" fill="currentColor"/></svg>',
  open: '<svg viewBox="0 0 48 48"><path d="M8 22h32v18H8z" fill="currentColor"/><path d="M8 22c0-8 6-12 16-12s16 4 16 12z" fill="currentColor" opacity=".7"/><rect x="21" y="24" width="6" height="8" rx="1.5" fill="#1d1b4a"/></svg>',
  light: '<svg viewBox="0 0 48 48"><path d="M24 6c4 6 9 10 9 17a9 9 0 0 1-18 0c0-7 5-11 9-17z" fill="currentColor"/><path d="M14 40h20M18 34h12" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  jar: '<svg viewBox="0 0 48 48"><path d="M18 8h12v4l3 4c2 3 3 6 3 10v10c0 3-2 5-5 5H17c-3 0-5-2-5-5V26c0-4 1-7 3-10l3-4z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path class="jarFill" d="M14.6 27h18.8v9c0 2-1 3-3 3H17.6c-2 0-3-1-3-3z" fill="currentColor"/></svg>',
  sail: '<svg viewBox="0 0 48 48"><path d="M24 6v28" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M27 8c7 6 10 14 9 22H27z" fill="currentColor"/><path d="M21 12c-5 5-7 11-7 18h7z" fill="currentColor" opacity=".7"/><path d="M8 35h32l-5 7H13z" fill="currentColor"/></svg>',
  dock: '<svg viewBox="0 0 48 48"><path d="M6 30h36M10 30v12M22 30v12M34 30v12" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M24 6v16M17 15l7 7 7-7" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  wait: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M24 14v10l7 5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M8 40c4-3 8-3 12 0s8 3 12 0 8-3 8-3" stroke="currentColor" stroke-width="3" fill="none"/></svg>',
  ring: '<svg viewBox="0 0 48 48"><path d="M24 7c-7 0-11 6-11 13v8l-4 6h30l-4-6v-8c0-7-4-13-11-13z" fill="currentColor"/><circle cx="24" cy="39" r="3.5" fill="currentColor"/><path d="M6 16c-2 4-2 9 0 13M42 16c2 4 2 9 0 13" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
  remember: '<svg viewBox="0 0 48 48"><path d="M24 8l4 10 11 1-8 7 3 11-10-6-10 6 3-11-8-7 11-1z" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11 11l8 8m-3-3l2-2m-4 0l2-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  rest: '<svg viewBox="0 0 48 48"><path d="M24 6c3 7 11 11 11 21a11 11 0 0 1-22 0c0-5 3-8 5-11 1 4 3 5 5 5-2-6 0-11 1-15z" fill="currentColor"/><path d="M24 27c2 3 5 5 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9z" fill="#1d1b4a" opacity=".55"/><path d="M10 42h28" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  run: '<svg viewBox="0 0 48 48"><path d="M20 10h8l1 14 10 5c2 1 3 3 3 5v3H18l-3-4z" fill="currentColor"/><path d="M18 37h24v3H18z" fill="currentColor" opacity=".7"/><path d="M4 18h10M2 25h11M5 32h9" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".75"/></svg>',
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
    look: { x: 0, y: 0, active: false },   // the camera stick (right side, close view only): -1..1 each way
    run: false,       // running (the boot button, or Shift held)
    ability: { pressed: false },
    tap: null,        // a quick tap on the ground: { x, y } on the stage, the game walks you there
    use: null,        // a tool other than the sling was used: { aim: {x, y} | null }
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
  // switch between the view from above and the close view, low behind you
  const SEAVIEW = {
    horizon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 15h20"/><path d="M5 19h14"/><circle cx="12" cy="10" r="3.2"/><path d="M12 3v1.6M5.6 6.2l1.1 1.1M18.4 6.2l-1.1 1.1"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  };
  const seaViewBtn = el('button', 'seaViewBtn glass hidden', SEAVIEW.horizon);
  seaViewBtn.setAttribute('aria-label', 'Switch view');
  hud.appendChild(seaViewBtn);
  seaViewBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); opts.onSeaView && opts.onSeaView(); });
  // mode: null (not sailing), 'top' or 'horizon' (the view showing now); the button shows the other one
  function setSeaView(mode) {
    seaViewBtn.classList.toggle('hidden', !mode);
    if (mode) { const close = mode === 'close' || mode === 'horizon'; seaViewBtn.innerHTML = close ? SEAVIEW.top : SEAVIEW.horizon; seaViewBtn.setAttribute('aria-label', close ? 'View from above' : 'Close view'); }
  }
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
  // running, like running shoes: tap to run, tap again to walk (or hold Shift)
  const bRun = mkBtn('run', ICON.run, 'Run');
  bRun.setAttribute('aria-pressed', 'false');
  let runOn = false;
  function setRun(on) { runOn = on; bRun.classList.toggle('on', on); bRun.setAttribute('aria-pressed', String(on)); }
  bRun.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.any = true; setRun(!runOn); pulse(bRun); opts.sfx && opts.sfx('tick'); });
  root.appendChild(pad);
  const joy = el('div', 'joy', '<div class="knob"></div>');
  root.appendChild(joy);
  // the second stick, for the camera: it appears wherever a thumb lands on the right side (away from the buttons)
  const camJoy = el('div', 'joy camJoy', '<div class="knob"></div>');
  root.appendChild(camJoy);
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
    const sling = btn !== bRanged || toolCur === 'sling';
    // with more than one tool, holding the tool button opens the selector, so the sling waits: a quick tap
    // throws one shot, a drag aims and keeps throwing. Other tools are used when you let go.
    const slingTap = btn === bRanged && toolCur === 'sling' && toolList.length > 1;
    st.down = sling && !slingTap; st.pressed = sling && !slingTap;
    st.aim.active = false; st.aim.x = st.aim.y = 0;
    const r = btn.getBoundingClientRect();
    const c = toStage(r.left + r.width / 2, r.top + r.height / 2);
    const t = { kind: 'btn', btn, st, cx: c.x, cy: c.y, t0: performance.now(), slingTap };
    touches.set(e.pointerId, t);
    btn.classList.add('held');
    // hold the tool button still and the wheel opens
    if (btn === bRanged && toolList.length > 1) t.wheelTimer = setTimeout(() => { if (touches.get(e.pointerId) === t && !st.aim.active) openWheel(t); }, 380);
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  for (const b of [bAttack, bRanged, bRoll, bAbility]) b.addEventListener('pointerdown', (e) => startButton(e, b));
  function moveButton(t, e) {
    const p = stagePt(e);
    let dx = p.x - t.cx, dy = p.y - t.cy;
    const len = Math.hypot(dx, dy);
    if (t.wheel) { t.overSlot = !!slotAt(p.x, p.y); pickWheel(p.x, p.y); return; }
    if (len > 18) {
      if (t.slingTap && !t.st.down) { clearTimeout(t.wheelTimer); t.st.down = true; }
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
    clearTimeout(t.wheelTimer);
    if (t.wheel) {
      t.st.down = false; t.st.pressed = false; t.st.aim.active = false; t.btn.classList.remove('held');
      // let go over a tool: take it. Let go anywhere else: the panel stays open for a tap
      if (t.overSlot) closeWheel(true);
      else { wheelPinned = true; wheelTouch = null; wheelBack.classList.remove('hidden'); }
      return;
    }
    // the sling, tapped: one shot
    if (t.slingTap && !t.st.down && toolCur === 'sling') input.shoot = true;
    // a tool other than the sling: used on release, aimed if you dragged
    if (t.btn === bRanged && toolCur !== 'sling') input.use = { aim: t.st.aim.active ? { x: t.st.aim.x, y: t.st.aim.y } : null };
    t.st.down = false;
    t.st.aim.active = false;
    t.btn.classList.remove('held');
    aimRing.style.display = 'none';
  }
  // ----- the tool panel: hold the tool button and a panel of tools opens beside the buttons. Slide onto one and
  // let go to take it; or let go first, and tap one. Anywhere else closes it. -----
  let toolList = [{ id: 'sling', icon: ICON.sling, name: 'Sling' }], toolCur = 'sling';
  let toolArt = {};
  const toolPic = (id) => (toolArt[id] ? `<img src="${toolArt[id]}" alt="">` : ICON[id] || ICON.spark);
  const wheel = el('div', 'tPanel hidden', '<div class="tpCard glass"><div class="tpHead"><span class="tpKick">Tool in hand</span><b class="tpName"></b></div><div class="tpGrid"></div></div>');
  root.appendChild(wheel);
  const wheelBack = el('div', 'tpBack hidden');
  root.appendChild(wheelBack);
  let wheelPick = null, wheelPinned = false, wheelTouch = null;
  const wheelSpots = [];
  function wheelName(id) { const tl = toolList.find((x) => x.id === id); $('.tpName', wheel).textContent = tl ? tl.name : ''; }
  function openWheel(t) {
    if (t) { t.wheel = true; t.st.down = false; t.st.pressed = false; }
    wheelTouch = t || null; wheelPinned = !t;
    const grid = $('.tpGrid', wheel);
    grid.innerHTML = '';
    wheelSpots.length = 0;
    grid.style.setProperty('--cols', Math.min(5, Math.max(3, toolList.length)));
    toolList.forEach((tl, i) => {
      const b = el('button', 'tSlot' + (tl.id === toolCur ? ' cur on' : ''), `<i>${toolPic(tl.id === 'jar' && jarFull ? 'jarFull' : tl.id)}</i><em>${i + 1}</em>`);
      b.setAttribute('aria-label', tl.name);
      b.addEventListener('pointerdown', (e) => { if (!wheelPinned) return; e.preventDefault(); e.stopPropagation(); wheelPick = tl.id; closeWheel(true); });
      grid.appendChild(b);
      wheelSpots.push({ id: tl.id, b });
    });
    wheelPick = toolCur; wheelName(toolCur);
    wheel.classList.remove('hidden', 'out'); void wheel.offsetWidth; wheel.classList.add('in');
    wheelBack.classList.toggle('hidden', !wheelPinned);
    opts.sfx && opts.sfx('open');
    opts.onWheel && opts.onWheel(true);
  }
  // the slot under the finger while it's still held down
  function slotAt(px, py) {
    for (const w of wheelSpots) { const r = w.b.getBoundingClientRect(), q = toStage(r.left + r.width / 2, r.top + r.height / 2), half = Math.max(r.width, r.height) / 2 + 4; if (Math.abs(px - q.x) < half && Math.abs(py - q.y) < half) return w; }
    return null;
  }
  function pickWheel(px, py) {
    const w0 = slotAt(px, py);
    const pick = w0 ? w0.id : wheelPick;
    if (pick !== wheelPick) { wheelPick = pick; opts.sfx && opts.sfx('tick'); }
    for (const w of wheelSpots) w.b.classList.toggle('on', w.id === wheelPick);
    wheelName(wheelPick);
    return pick;
  }
  function closeWheel(choose) {
    if (wheel.classList.contains('hidden')) return;
    wheel.classList.remove('in'); wheel.classList.add('out');
    setTimeout(() => { if (wheel.classList.contains('out')) wheel.classList.add('hidden'); }, 160);
    wheelBack.classList.add('hidden');
    wheelPinned = false; wheelTouch = null;
    opts.onWheel && opts.onWheel(false);
    if (choose && wheelPick && wheelPick !== toolCur) opts.onTool && opts.onTool(wheelPick);
  }
  wheelBack.addEventListener('pointerdown', (e) => { e.preventDefault(); closeWheel(false); });
  // ----- a glimpse of the Draft: words written into the world where colours and things should be -----
  const draftEl = el('div', 'dLabels');
  root.appendChild(draftEl);
  const draftSpans = [];
  function draftLabels(list, k) {
    while (draftSpans.length < list.length) { const sp = el('span', 'dLabel'); sp.style.setProperty('--tilt', ((draftSpans.length * 37) % 11 - 5) + 'deg'); draftEl.appendChild(sp); draftSpans.push(sp); }
    draftSpans.forEach((sp, i) => {
      const L = list[i];
      if (!L || L.off) { sp.style.display = 'none'; return; }
      sp.style.display = 'block';
      if (sp.textContent !== L.text) sp.textContent = L.text;
      sp.style.left = L.x + 'px'; sp.style.top = L.y + 'px';
      sp.style.opacity = String(Math.min(1, k * 1.4) * (L.o === undefined ? 1 : L.o));
    });
  }
  function setToolArt(art) { toolArt = art || {}; setTools(toolList.map(({ id, name }) => ({ id, name })), toolCur); }
  function setTools(list, cur) {
    toolList = list.map((t) => ({ ...t, icon: ICON[t.id] || ICON.spark })); toolCur = cur;
    list = toolList;
    const tl = list.find((x) => x.id === cur) || list[0];
    bRanged.querySelector('.ic').innerHTML = toolPic(tl.id === 'jar' && jarFull ? 'jarFull' : tl.id);
    bRanged.classList.toggle('pic', !!toolArt[tl.id]);
    bRanged.setAttribute('aria-label', tl.name);
    bRanged.classList.toggle('tool', cur !== 'sling');
    bRanged.classList.toggle('multi', list.length > 1);
    bRanged.classList.toggle('jarFull', !!jarFull);
  }
  let jarFull = false;
  // the Tide Jar's water shows in its icon
  function setJar(full) { jarFull = full; bRanged.classList.toggle('jarFull', !!full); if (toolCur === 'jar' && toolArt.jar) bRanged.querySelector('.ic').innerHTML = toolPic(full ? 'jarFull' : 'jar'); }
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
    // the right side of the screen, in the close view: the camera stick
    if (onButtonSide(p.x) && opts.camStick && opts.camStick() && ![...touches.values()].some((t) => t.kind === 'cam')) {
      touches.set(e.pointerId, { kind: 'cam', sx: p.x, sy: p.y, x: p.x, y: p.y });
      camJoy.style.display = 'block'; camJoy.style.left = p.x + 'px'; camJoy.style.top = p.y + 'px';
      camJoy.classList.remove('fade'); camJoy.firstChild.style.transform = '';
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
    if (t.kind === 'cam') {
      let dx = t.x - t.sx, dy = t.y - t.sy;
      const len = Math.hypot(dx, dy);
      if (len > R * 1.25) { const k = (len - R * 1.25) / len; t.sx += dx * k; t.sy += dy * k; dx = t.x - t.sx; dy = t.y - t.sy; camJoy.style.left = t.sx + 'px'; camJoy.style.top = t.sy + 'px'; }
      const l2 = Math.hypot(dx, dy), k = l2 > R ? R / l2 : 1;
      input.look.x = (dx * k) / R; input.look.y = (dy * k) / R; input.look.active = l2 > 5;
      camJoy.firstChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      return;
    }
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
    else if (t.kind === 'cam') {
      input.look.x = input.look.y = 0; input.look.active = false;
      camJoy.classList.add('fade');
      setTimeout(() => { if (![...touches.values()].some((x) => x.kind === 'cam')) camJoy.style.display = 'none'; }, 180);
    }
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
    if (k === 'escape' || k === 'p') {
      if (!opts.isStarted() || ended) { if (!sheet.classList.contains('hidden')) resume(); return; }
      opts.isPaused() ? resume() : pause(); return;
    }
    if (keys[k]) return;
    keys[k] = true;
    if (k === ' ' || k === 'l') { input.roll.pressed = true; e.preventDefault(); }
    if (k === 'j') { input.attack.down = true; input.attack.pressed = true; }
    if (k === 'k') { if (toolCur === 'sling') { input.ranged.down = true; input.ranged.pressed = true; } else input.use = { aim: null }; }
    // Q cycles tools; 1 to 9 pick one
    if (k === 'v') { opts.onSeaView && opts.onSeaView(); return; }
    if (k === 'q' && toolList.length > 1) { const i = toolList.findIndex((x) => x.id === toolCur); opts.onTool && opts.onTool(toolList[(i + 1) % toolList.length].id); }
    if (/^[1-9]$/.test(k) && toolList[+k - 1]) opts.onTool && opts.onTool(toolList[+k - 1].id);
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
    input.run = runOn || !!keys.shift;
  }

  function pulse(b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }

  // ----- hearts -----
  let lastHearts = '';
  // ----- heat: on Cinderglass's hot ground it builds; when it's full, it burns -----
  const heatEl = el('div', 'heatBar', '<i></i>');
  hud.appendChild(heatEl);
  let heatShown = -1;
  function setHeat(k) {
    const q = Math.round(k * 50) / 50;
    if (q === heatShown) return;
    heatShown = q;
    heatEl.classList.toggle('on', q > 0.02);
    heatEl.classList.toggle('hot', q > 0.7);
    heatEl.firstChild.style.width = (q * 100).toFixed(0) + '%';
  }
  // ----- Odda's forge: Skyglass in, better tools out -----
  const forgeEl = el('div', 'forge hidden', '<div class="fgSheet glass"><div class="kicker">Odda\u2019s forge</div><h2>Skyglass in, better tools out</h2><div class="fgShards"></div><div class="fgList"></div><button class="fgDone tBtn">Done</button></div>');
  root.appendChild(forgeEl);
  function forgeMenu(items, shards) {
    return new Promise((resolve) => {
      $('.fgShards', forgeEl).innerHTML = `<i>${ICON.spark}</i> ${shards} slivers of Skyglass`;
      const list = $('.fgList', forgeEl);
      list.innerHTML = '';
      for (const it of items) {
        const b = el('button', 'fgItem' + (it.owned ? ' owned' : '') + (!it.can && !it.owned ? ' poor' : ''), `<b>${it.name}</b><span>${it.desc}</span><em>${it.owned ? 'Done' : it.cost + ' slivers'}</em>`);
        b.disabled = it.owned || !it.can;
        b.addEventListener('click', () => finish(it.id));
        list.appendChild(b);
      }
      forgeEl.classList.remove('hidden');
      document.body.classList.add('talking');
      talk.lines = [];
      const finish = (id) => { forgeEl.classList.add('hidden'); talk.lines = null; talk.ended = performance.now(); document.body.classList.remove('talking'); resolve(id); };
      $('.fgDone', forgeEl).onclick = () => finish(null);
    });
  }
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
      input.look.x = input.look.y = 0; input.look.active = false; camJoy.style.display = 'none';
      touches.clear(); joy.style.display = 'none'; aimRing.style.display = 'none';
      pad.querySelectorAll('.held').forEach((b) => b.classList.remove('held'));
      showLine();
    });
  }
  function advance() {
    if (!talk.lines || performance.now() - talk.last < 140) return;
    talk.last = performance.now();
    if (talk.shown < talk.full.length) { talk.shown = talk.full.length; dlg.querySelector('.dlgText').textContent = talk.full; dlg.classList.add('more'); return; }
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
    bAttack.querySelector('.ic').innerHTML = ICON[kind] || ICON.sword;
    bAttack.classList.toggle('ctx', !!kind);
    bAttack.setAttribute('aria-label', { talk: 'Talk', enter: 'Enter', sleep: 'Sleep', rest: 'Rest', open: 'Open', light: 'Light', remember: 'Remember', sail: 'Sail', dock: 'Dock', wait: 'Wait for the tide', ring: 'Ring' }[kind] || 'Attack');
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
  map.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); map.classList.toggle('big'); opts.sfx && opts.sfx('tick'); });
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

  // ----- keys, in a dungeon: small keys and the big one -----
  const keysEl = el('div', 'keys hidden');
  hud.appendChild(keysEl);
  function setKeys(k) {
    document.body.classList.toggle('hasKeys', !!k);
    if (!k) { keysEl.classList.add('hidden'); return; }
    keysEl.classList.remove('hidden');
    keysEl.innerHTML = `<span class="kSmall${k.small ? '' : ' none'}"><i>${ICON.key}</i><b>${k.small}</b></span>` + (k.big ? `<span class="kBig"><i>${ICON.key}</i></span>` : '');
  }
  // ----- "You found ...": an item held up, its name, what it does. Tap to carry on. -----
  const getEl = el('div', 'itemGet hidden', '<div class="igCard glass"><div class="igIcon"></div><div class="kicker">You found</div><h3></h3><p></p><div class="igTap">Tap to continue</div></div>');
  root.appendChild(getEl);
  let getHide = 0;
  function itemGet(name, line, icon) {
    // a card shown right after another must not be hidden by the first one's fade-out
    clearTimeout(getHide);
    $('.igIcon', getEl).innerHTML = icon || ICON.spark;
    $('h3', getEl).textContent = name;
    $('p', getEl).textContent = line;
    getEl.classList.remove('hidden', 'out');
    void getEl.offsetWidth; getEl.classList.add('in');
    talk.lines = []; document.body.classList.add('talking');
    return new Promise((resolve) => {
      const t0 = performance.now();
      const done = (e) => {
        if (performance.now() - t0 < 700) return;
        if (e && e.type === 'keydown' && ![' ', 'enter', 'j'].includes(e.key.toLowerCase())) return;
        getEl.removeEventListener('pointerdown', done); window.removeEventListener('keydown', done, true);
        getEl.classList.add('out'); getEl.classList.remove('in');
        getHide = setTimeout(() => getEl.classList.add('hidden'), 400);
        talk.lines = null; talk.ended = performance.now(); document.body.classList.remove('talking');
        resolve();
      };
      getEl.addEventListener('pointerdown', done); window.addEventListener('keydown', done, true);
    });
  }

  // ----- the island map: a small round map in the corner that turns with the view, and a full map on tap -----
  const isle = el('div', 'isleMap hidden', '<canvas></canvas><i class="imRing"></i>');
  hud.appendChild(isle);
  const isleCv = $('canvas', isle);
  // ===== the atlas: the full map =====
  // Drag to move it, pinch (or the wheel, or + and −) to zoom, tap anything on it to learn about it,
  // tap open ground to set your own mark. The mark shows on the small map with how far it is,
  // stands in the world as a pillar of light, and clears itself when you get there.
  const AT_ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    goal: '<svg viewBox="0 0 24 24"><path d="M12 3l7 9-7 9-7-9z" fill="#ffd29a"/></svg>',
    mark: '<svg viewBox="0 0 24 24"><path d="M12 22s-7-7.2-7-12a7 7 0 0114 0c0 4.8-7 12-7 12z" fill="#7fe8f5"/><circle cx="12" cy="10" r="2.6" fill="#0e2a3a"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>',
    way: '<svg viewBox="0 0 24 24"><path d="M12 3l6 9-6 9-6-9z" fill="#bff6ff"/></svg>',
    ppl: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#f6f2ff"/></svg>',
    place: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff4e4" stroke-width="1.8"><path d="M4 19l5-11 4 7 3-4 4 8z"/></svg>',
    you: '<svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z" fill="#e6fcff"/></svg>',
  };
  const bigMap = el('div', 'atlas hidden');
  bigMap.innerHTML = `
    <canvas class="atCv"></canvas>
    <div class="atVig"></div>
    <div class="atHead"><div class="kicker">Map</div><h2></h2><div class="atObj"><i class="qDot"></i><span></span></div></div>
    <button class="atX glass" data-at="close" aria-label="Close map">${AT_ICON.close}</button>
    <div class="atRail glass">
      <button data-at="in" aria-label="Zoom in">${AT_ICON.plus}</button>
      <button data-at="out" aria-label="Zoom out">${AT_ICON.minus}</button>
      <i></i>
      <button data-at="me" aria-label="Find yourself">${AT_ICON.me}</button>
      <button data-at="goal" aria-label="Find where you're headed">${AT_ICON.goal}</button>
      <button data-at="mark" aria-label="Find your mark">${AT_ICON.mark}</button>
      <i></i>
      <button data-at="key" aria-label="Legend">${AT_ICON.key}</button>
    </div>
    <div class="atKey glass hidden">
      <ul>
        <li>${AT_ICON.you}<span>You</span></li><li>${AT_ICON.goal}<span>Where you're headed</span></li>
        <li>${AT_ICON.mark}<span>Your mark</span></li><li>${AT_ICON.ppl}<span>People</span></li><li>${AT_ICON.way}<span>Waystone</span></li>
      </ul>
      <p>Drag to move · Pinch to zoom<br>Tap a place to learn about it<br>Tap open ground to set a mark</p>
    </div>
    <div class="atCard glass hidden"><div class="acIcon"></div><div class="acText"><div class="kicker"></div><h3></h3><p></p></div><div class="acBtns"></div></div>
    <div class="atHint">Tap open ground to set a mark</div>`;
  root.appendChild(bigMap);
  const atCv = $('.atCv', bigMap), atCard = $('.atCard', bigMap), atKey = $('.atKey', bigMap), atHint = $('.atHint', bigMap);
  let mapBase = null, mapInfo = null, mapRot = 0, mapState = null, mapOpen = false, mapTick = 0, mapFog = null, mapKey0 = 'cove';
  const bases = {};   // one drawn map per place
  const S_PX = 6;   // pixels per world unit in the drawn base map
  // your marks: one per place, in map units
  const marks = {};
  const markKey = () => mapKey0.replace(/\d+$/, '');
  const curMark = () => marks[markKey()] || null;
  const unitOf = () => (mapInfo && mapInfo.scale) || 1;
  function setMark(m) {
    if (m) marks[markKey()] = { x: m.x, z: m.z, name: m.name || null };
    else delete marks[markKey()];
    opts.onMark && opts.onMark();
  }
  function shadeHex(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  // draw the island once: ground by kind and height, cliffs, houses, the dock, the lighthouse
  function buildMap(info, rot, key = 'cove') {
    mapKey0 = key;
    if (bases[key]) { ({ mapBase, mapInfo, mapFog } = bases[key]); mapRot = rot; return; }
    mapInfo = info; mapRot = rot;
    const { N, H0, H, K } = info;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * S_PX;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a6f8f'; g.fillRect(0, 0, cv.width, cv.height);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = H[j * N + i], k = K[j * N + i];
      let c;
      if (info.cave) c = k === 'rock' ? '#1c1826' : k === 'chasm' ? '#08060e' : k === 'water' ? '#3f7f96' : k === 'molten' ? '#d8602a' : k === 'ledge' ? '#8a8496' : '#6f6a7c';
      else if (h <= 0.01) c = h < -1.2 ? '#2a6f8f' : h < -0.5 ? '#36869f' : '#47a3bb';
      else if (k === 'sand') c = '#ead6a6';
      else if (k === 'wood') c = '#a6764d';
      else if (k === 'street') c = '#7d8a84';
      else if (k === 'path') c = '#d2bd94';
      else if (k === 'stone') c = shadeHex('#a39d91', 0.9 + h * 0.03);
      else c = shadeHex('#5f9c46', 0.82 + Math.min(h, 6) * 0.06);
      g.fillStyle = c;
      g.fillRect(i * S_PX, j * S_PX, S_PX, S_PX);
      // a cliff edge where the ground drops to the south or east
      const hs = j + 1 < N ? H[(j + 1) * N + i] : -2, he = i + 1 < N ? H[j * N + i + 1] : -2;
      if (info.cave) continue;
      if (h > 0.01 && hs < h - 0.5) { g.fillStyle = 'rgba(30,40,24,0.55)'; g.fillRect(i * S_PX, j * S_PX + S_PX - 2, S_PX, 2); }
      if (h > 0.01 && he < h - 0.5) { g.fillStyle = 'rgba(30,40,24,0.35)'; g.fillRect(i * S_PX + S_PX - 2, j * S_PX, 2, S_PX); }
      if (h > 0.01 && h < 0.6 && (hs <= 0.01 || he <= 0.01)) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(i * S_PX, j * S_PX, S_PX, S_PX); }
    }
    const X = (x) => (x - H0) * S_PX, Z = (z) => (z - H0) * S_PX;
    // houses
    for (const b of info.boxes) {
      g.fillStyle = '#8c5a55'; g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * S_PX, (b.z1 - b.z0) * S_PX);
      g.strokeStyle = 'rgba(40,20,30,0.6)'; g.lineWidth = 2; g.strokeRect(X(b.x0) + 1, Z(b.z0) + 1, (b.x1 - b.x0) * S_PX - 2, (b.z1 - b.z0) * S_PX - 2);
    }
    // the dock
    const d = info.dock;
    g.fillStyle = '#8b5e3c'; g.fillRect(X(d.x0), Z(d.z0), (d.x1 - d.x0) * S_PX, (d.z1 - d.z0) * S_PX);
    // landmarks drawn into the ground
    for (const p of info.places) {
      if (p.icon === 'circle') { g.strokeStyle = 'rgba(200,240,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(X(p.x), Z(p.z), 6.2 * S_PX, 0, Math.PI * 2); g.stroke(); }
      if (p.icon === 'ring') { g.strokeStyle = 'rgba(110,78,54,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(X(p.x), Z(p.z), 4.4 * S_PX, 0.55, Math.PI * 2 - 0.55); g.stroke(); }
      if (p.icon === 'lighthouse') { g.fillStyle = '#f2ece0'; g.beginPath(); g.arc(X(p.x), Z(p.z), 1.6 * S_PX, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#c94a3f'; g.lineWidth = 4; g.stroke(); }
    }
    mapBase = cv;
    // a dungeon's map starts dark and fills in as you explore
    mapFog = null;
    if (info.cave || info.fog) { mapFog = document.createElement('canvas'); mapFog.width = mapFog.height = N * S_PX; const fg = mapFog.getContext('2d'); fg.fillStyle = info.fog ? '#1c4658' : '#0b0912'; fg.fillRect(0, 0, mapFog.width, mapFog.height); info.fogDone = new Uint8Array(info.seen.length); }
    bases[key] = { mapBase, mapInfo, mapFog };
  }
  // clear the fog over cells you've seen
  function revealFog() {
    if (!mapFog) return;
    const I = mapInfo, fg = mapFog.getContext('2d');
    for (let k = 0; k < I.seen.length; k++) if (I.seen[k] && !I.fogDone[k]) { I.fogDone[k] = 1; fg.clearRect((k % I.seenW) * S_PX, Math.floor(k / I.seenW) * S_PX, S_PX, S_PX); }
  }
  // where a world point lands on a map drawn with centre (cx, cz) at screen (ox, oy) and scale sc (px per unit)
  function proj(x, z, cx, cz, ox, oy, sc) {
    const dx = (x - cx) * sc, dz = (z - cz) * sc, c = Math.cos(mapRot), s2 = Math.sin(mapRot);
    return { x: ox + dx * c - dz * s2, y: oy + dx * s2 + dz * c };
  }
  function drawMap(cv, cx, cz, sc, big) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, Hh = cv.clientHeight;
    if (!W || !Hh || !mapBase || !mapState) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = mapInfo.cave ? '#0b0912' : '#2a6f8f'; g.fillRect(0, 0, W, Hh);
    const ox = W / 2, oy = Hh / 2;
    g.save();
    g.translate(ox, oy); g.rotate(mapRot); g.scale(sc / S_PX, sc / S_PX);
    g.translate(-(cx - mapInfo.H0) * S_PX, -(cz - mapInfo.H0) * S_PX);
    g.imageSmoothingEnabled = false;
    g.drawImage(mapBase, 0, 0);
    if (mapFog) { revealFog(); g.drawImage(mapFog, 0, 0); }
    g.restore();
    const t = performance.now() / 1000;
    const R = Math.min(W, Hh) / 2 - 7;
    const edge = (p) => { if (big) return p; const dx = p.x - ox, dy = p.y - oy, l = Math.hypot(dx, dy); return l > R ? { x: ox + dx / l * R, y: oy + dy / l * R, out: true } : p; };
    // waystones: lit ones glow (tap them on the big map to travel), unlit ones are dim
    for (const w of mapState.waystones || []) {
      const q = edge(proj(w.x, w.z, cx, cz, ox, oy, sc));
      if (q.out) continue;
      const s4 = big ? 7 : 4;
      g.fillStyle = w.lit ? '#bff6ff' : '#5a5470';
      g.strokeStyle = w.lit ? 'rgba(14,10,38,0.9)' : 'rgba(230,230,245,0.85)'; g.lineWidth = 1.5;
      if (w.lit) { g.shadowColor = 'rgba(159,243,255,0.9)'; g.shadowBlur = big ? 10 : 5; }
      g.beginPath(); g.moveTo(q.x, q.y - s4); g.lineTo(q.x + s4 * 0.7, q.y); g.lineTo(q.x, q.y + s4); g.lineTo(q.x - s4 * 0.7, q.y); g.closePath(); g.fill(); g.stroke();
      g.shadowBlur = 0;
      if (big && w.lit) w.screen = { x: q.x, y: q.y };
    }
    // places, named on the big map
    if (big) {
      g.font = 'italic 600 12px Fraunces, Georgia, serif'; g.textAlign = 'center';
      for (const p of mapInfo.places) {
        const q = proj(p.x, p.z, cx, cz, ox, oy, sc);
        g.fillStyle = 'rgba(14,10,38,0.55)'; const w = g.measureText(p.name).width + 12;
        g.beginPath(); g.roundRect(q.x - w / 2, q.y - 27, w, 18, 9); g.fill();
        g.fillStyle = '#fff4e4'; g.fillText(p.name, q.x, q.y - 14);
      }
    }
    // people
    for (const n of mapState.people) {
      const q = edge(proj(n.x, n.z, cx, cz, ox, oy, sc));
      if (q.out) continue;
      g.fillStyle = n.news ? '#ffd29a' : '#f6f2ff';
      g.strokeStyle = 'rgba(14,10,38,0.8)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(q.x, q.y, big ? 4.5 : 3, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // where you're headed: a glowing diamond (held at the rim of the small map when it's further away)
    if (mapState.goal) {
      const q = edge(proj(mapState.goal.x, mapState.goal.z, cx, cz, ox, oy, sc));
      const s3 = (big ? 7 : 5) * (1 + Math.sin(t * 4) * 0.12);
      g.save(); g.translate(q.x, q.y); g.rotate(Math.PI / 4);
      g.shadowColor = 'rgba(255,210,154,0.9)'; g.shadowBlur = 8;
      g.fillStyle = '#ffd29a'; g.fillRect(-s3 / 2, -s3 / 2, s3, s3);
      g.restore();
    }
    // your mark: a pin (held at the rim, pointing the way, when it's further off)
    const mk = curMark();
    if (mk) { const q = edge(proj(mk.x, mk.z, cx, cz, ox, oy, sc)); drawPin(g, q.x, q.y + 5, q.out ? 0.6 : 0.7, false); }
    // you: an arrow pointing the way you face
    const me = proj(mapState.x, mapState.z, cx, cz, ox, oy, sc);
    const a = Math.atan2(Math.cos(mapState.face), Math.sin(mapState.face)) + mapRot;
    const L = big ? 9 : 7;
    g.save(); g.translate(me.x, me.y); g.rotate(a);
    g.shadowColor = 'rgba(159,243,255,0.9)'; g.shadowBlur = 8;
    g.fillStyle = '#e6fcff'; g.strokeStyle = '#1d1b4a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(L, 0); g.lineTo(-L * 0.7, L * 0.65); g.lineTo(-L * 0.35, 0); g.lineTo(-L * 0.7, -L * 0.65); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  // every frame from the game: where you are, who's where, and the goal. state = null hides the map
  const markDist = el('div', 'imDist hidden');
  hud.appendChild(markDist);
  let lastDistTxt = '';
  function islandMap(state) {
    mapState = state;
    isle.classList.toggle('hidden', !state);
    const mk = state && mapBase ? curMark() : null;
    const txt = mk ? Math.round(Math.hypot(mk.x - state.x, mk.z - state.z) * unitOf()) + ' m' : '';
    if (txt !== lastDistTxt) { lastDistTxt = txt; markDist.innerHTML = txt ? `${AT_ICON.mark}<b>${txt}</b>` : ''; markDist.classList.toggle('hidden', !txt); }
    if (!state || !mapBase || mapOpen) return;
    if ((mapTick = (mapTick + 1) % 2) === 0) {
      // the small map can turn with the view (the close view); the atlas stays as drawn
      const r0 = mapRot; if (state.rot !== undefined) mapRot = state.rot;
      drawMap(isleCv, state.x, state.z, 3.6, false);
      mapRot = r0;
    }
  }

  // ----- the atlas view: centre (cx, cz) in map units, sc pixels per unit; a target to glide to; a little momentum -----
  const AV = { cx: 0, cz: 0, sc: 8, W: 1, H: 1, to: null, vx: 0, vz: 0, sel: null, hits: [], drop: -9, t: 0, last: 0, raf: 0 };
  const fitSc = () => Math.min(AV.W / (mapInfo.N * 1.02), AV.H / (mapInfo.N * 1.02));
  const minSc = () => fitSc() * 0.9;
  const maxSc = () => Math.max(fitSc() * 4, 18);
  // the map itself is drawn in 3D by the game when it can (M3); this canvas then only carries the markers and labels
  const M3 = opts.map3d || null;
  let m3 = false;
  const s2w = (sx, sy) => { if (m3) return M3.unproject(sx, sy, AV.W, AV.H); const dx = (sx - AV.W / 2) / AV.sc, dy = (sy - AV.H / 2) / AV.sc, c = Math.cos(-mapRot), s2 = Math.sin(-mapRot); return { x: AV.cx + dx * c - dy * s2, z: AV.cz + dx * s2 + dy * c }; };
  const w2s = (x, z) => (m3 ? M3.project(x, z, AV.W, AV.H) : proj(x, z, AV.cx, AV.cz, AV.W / 2, AV.H / 2, AV.sc));
  function clampView() {
    AV.sc = Math.max(minSc(), Math.min(maxSc(), AV.sc));
    const H0 = mapInfo.H0, N = mapInfo.N;
    AV.cx = Math.max(H0, Math.min(H0 + N, AV.cx)); AV.cz = Math.max(H0, Math.min(H0 + N, AV.cz));
  }
  function glideTo(x, z, sc) { AV.to = { x, z, sc: sc === undefined ? AV.sc : Math.max(minSc(), Math.min(maxSc(), sc)) }; AV.vx = AV.vz = 0; }
  // zoom by a factor, keeping the map point under (sx, sy) where it is
  function zoomAt(f, sx, sy) {
    const a = s2w(sx, sy);
    AV.sc = Math.max(minSc(), Math.min(maxSc(), AV.sc * f));
    const b = s2w(sx, sy);
    AV.cx += a.x - b.x; AV.cz += a.z - b.z; AV.to = null;
    clampView();
  }
  const dist = (x, z) => Math.hypot(x - mapState.x, z - mapState.z) * unitOf();
  const fmtDist = (x, z) => { const d = dist(x, z); return d < 4 ? 'Right here' : Math.round(d) + ' m away'; };
  const unseen = (x, z) => {
    const I = mapInfo; if (!I.seen) return false;
    const i = Math.floor(x - I.H0), j = Math.floor(z - I.H0);
    return i < 0 || j < 0 || i >= I.seenW || !I.seen[j * I.seenW + i];
  };

  function drawAtlas() {
    const cv = atCv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, Hh = cv.clientHeight;
    if (!W || !Hh || !mapBase || !mapState) return;
    AV.W = W; AV.H = Hh;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = AV.t, cave = !!mapInfo.cave;
    if (m3) {
      // the 3D map: set its camera to this view and draw it; this canvas is cleared to carry just the markers
      M3.view(AV.cx, AV.cz, AV.sc, mapRot, W, Hh);
      M3.render();
      g.clearRect(0, 0, W, Hh);
    } else {
    // the deep around the map
    const bg = g.createRadialGradient(W / 2, Hh / 2, 0, W / 2, Hh / 2, Math.max(W, Hh) * 0.7);
    bg.addColorStop(0, cave ? '#14101f' : '#2a6f8f'); bg.addColorStop(1, cave ? '#06050a' : '#173f57');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    // the ground: crisp voxels up close, smooth when far out
    g.save();
    g.translate(W / 2, Hh / 2); g.rotate(mapRot); g.scale(AV.sc / S_PX, AV.sc / S_PX);
    g.translate(-(AV.cx - mapInfo.H0) * S_PX, -(AV.cz - mapInfo.H0) * S_PX);
    g.imageSmoothingEnabled = AV.sc < S_PX * 0.9;
    g.drawImage(mapBase, 0, 0);
    if (mapFog) { revealFog(); g.drawImage(mapFog, 0, 0); }
    g.restore();
    // a faint survey grid, every 16 units, once you're zoomed in enough to want it
    if (AV.sc > 5) {
      g.save(); g.strokeStyle = cave ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
      const H0 = mapInfo.H0, N = mapInfo.N, step = 16;
      for (let v = Math.ceil(H0 / step) * step; v <= H0 + N; v += step) {
        let a = w2s(v, H0), b = w2s(v, H0 + N); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        a = w2s(H0, v); b = w2s(H0 + N, v); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.restore();
    }
    }
    const hits = [];
    const mk = curMark(), me = w2s(mapState.x, mapState.z);
    // the way to your mark: a dotted line that drifts toward it
    if (mk) {
      const q = w2s(mk.x, mk.z);
      g.save(); g.setLineDash([2, 9]); g.lineDashOffset = -t * 22; g.lineCap = 'round';
      g.strokeStyle = 'rgba(14,10,38,0.45)'; g.lineWidth = 5; g.beginPath(); g.moveTo(me.x, me.y); g.lineTo(q.x, q.y); g.stroke();
      g.strokeStyle = 'rgba(127,232,245,0.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(me.x, me.y); g.lineTo(q.x, q.y); g.stroke();
      g.restore();
    }
    // named places: bigger as you zoom in, never piled on each other, "Uncharted" until you've seen them
    const fs = Math.round(Math.max(11, Math.min(16, 9 + AV.sc * 0.45)));
    g.font = `italic 600 ${fs}px Fraunces, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const taken = [];
    for (const p of mapInfo.places) {
      const q = w2s(p.x, p.z);
      if (q.x < -60 || q.y < -30 || q.x > W + 60 || q.y > Hh + 30) continue;
      const name = unseen(p.x, p.z) ? 'Uncharted' : p.name;
      const w = g.measureText(name).width + 18, h = fs + 10, r = { x: q.x - w / 2, y: q.y - h / 2, w, h };
      if (taken.some((o) => r.x < o.x + o.w + 4 && r.x + r.w + 4 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y)) continue;
      taken.push(r);
      const sel = AV.sel && AV.sel.kind === 'place' && AV.sel.ref === p;
      g.fillStyle = sel ? 'rgba(255,244,228,0.92)' : 'rgba(14,10,38,0.6)';
      g.beginPath(); g.roundRect(r.x, r.y, w, h, h / 2); g.fill();
      g.fillStyle = sel ? '#1d1b4a' : name === 'Uncharted' ? 'rgba(255,244,228,0.6)' : '#fff4e4';
      g.fillText(name, q.x, q.y + 0.5);
      hits.push({ kind: 'place', ref: p, x: q.x, y: q.y, r: Math.max(w, h) / 2, pri: 1, name });
    }
    // waystones
    for (const w of mapState.waystones || []) {
      const q = w2s(w.x, w.z), s4 = 8;
      g.save();
      if (w.lit) { g.shadowColor = 'rgba(159,243,255,0.95)'; g.shadowBlur = 14; }
      g.fillStyle = w.lit ? '#bff6ff' : '#5a5470'; g.strokeStyle = w.lit ? 'rgba(14,10,38,0.9)' : 'rgba(230,230,245,0.85)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(q.x, q.y - s4); g.lineTo(q.x + s4 * 0.7, q.y); g.lineTo(q.x, q.y + s4); g.lineTo(q.x - s4 * 0.7, q.y); g.closePath(); g.fill(); g.stroke();
      g.restore();
      hits.push({ kind: 'way', ref: w, x: q.x, y: q.y, r: 18, pri: 3 });
    }
    // people, named once you're close enough in
    g.font = '800 11px Nunito, system-ui, sans-serif';
    for (const n of mapState.people) {
      const q = w2s(n.x, n.z);
      g.fillStyle = n.news ? '#ffd29a' : '#f6f2ff'; g.strokeStyle = 'rgba(14,10,38,0.85)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(q.x, q.y, 5, 0, Math.PI * 2); g.fill(); g.stroke();
      const nm = NPCS[n.id] ? NPCS[n.id].name : '';
      if (nm && AV.sc > 9) { g.lineWidth = 3; g.strokeStyle = 'rgba(14,10,38,0.75)'; g.strokeText(nm, q.x, q.y + 13); g.fillStyle = '#f6f2ff'; g.fillText(nm, q.x, q.y + 13); }
      hits.push({ kind: 'person', ref: n, x: q.x, y: q.y, r: 16, pri: 4, name: nm });
    }
    // where you're headed: a gold diamond with a slow ripple
    if (mapState.goal) {
      const q = w2s(mapState.goal.x, mapState.goal.z), k = (t * 0.6) % 1;
      g.strokeStyle = `rgba(255,210,154,${0.7 * (1 - k)})`; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, 8 + k * 16, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(q.x, q.y); g.rotate(Math.PI / 4); g.shadowColor = 'rgba(255,210,154,0.95)'; g.shadowBlur = 12;
      g.fillStyle = '#ffd29a'; g.fillRect(-6, -6, 12, 12); g.strokeStyle = 'rgba(60,30,10,0.6)'; g.lineWidth = 1.2; g.strokeRect(-6, -6, 12, 12); g.restore();
      hits.push({ kind: 'goal', x: q.x, y: q.y, r: 18, pri: 5 });
    }
    // your mark: a pin that drops in and bounces, with a ring pulsing under it
    if (mk) {
      const q = w2s(mk.x, mk.z), dt2 = t - AV.drop;
      const fall = dt2 < 0.35 ? (1 - dt2 / 0.35) ** 2 * -40 : dt2 < 0.55 ? -Math.sin(((dt2 - 0.35) / 0.2) * Math.PI) * 6 : 0;
      const k = (t * 0.8) % 1;
      g.strokeStyle = `rgba(127,232,245,${0.8 * (1 - k)})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(q.x, q.y, 6 + k * 14, (6 + k * 14) * 0.55, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(14,10,38,0.35)'; g.beginPath(); g.ellipse(q.x, q.y, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
      drawPin(g, q.x, q.y + fall, 1.15, AV.sel && AV.sel.kind === 'mark');
      hits.push({ kind: 'mark', x: q.x, y: q.y - 12, r: 20, pri: 6 });
    }
    // you: an arrow, with a soft cone showing which way you face
    const a = Math.atan2(Math.cos(mapState.face), Math.sin(mapState.face)) + mapRot;
    g.save(); g.translate(me.x, me.y); g.rotate(a);
    const cone = g.createRadialGradient(0, 0, 2, 0, 0, 46); cone.addColorStop(0, 'rgba(191,246,255,0.4)'); cone.addColorStop(1, 'rgba(191,246,255,0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 46, -0.5, 0.5); g.closePath(); g.fill();
    g.shadowColor = 'rgba(159,243,255,0.95)'; g.shadowBlur = 10;
    g.fillStyle = '#e6fcff'; g.strokeStyle = '#1d1b4a'; g.lineWidth = 1.8;
    const L = 11; g.beginPath(); g.moveTo(L, 0); g.lineTo(-L * 0.7, L * 0.68); g.lineTo(-L * 0.32, 0); g.lineTo(-L * 0.7, -L * 0.68); g.closePath(); g.fill(); g.stroke();
    g.restore();
    hits.push({ kind: 'you', x: me.x, y: me.y, r: 16, pri: 7 });
    // the selection: a bright ring
    if (AV.sel) {
      const h = hits.find((x) => x.kind === AV.sel.kind && (x.ref === AV.sel.ref || !AV.sel.ref));
      if (h) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.lineDashOffset = t * 10; g.beginPath(); g.arc(h.x, h.y, (h.kind === 'place' ? 14 : h.r) + 2 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    }
    // off the edge: small arrows pointing to you, the goal and your mark
    // kept clear of the header, the rail on the right and the compass below
    const box = { l: 34, r: W - 84, t: 34, b: Hh - 92 };
    const edgeTo = (q, col, icon) => {
      if (q.x > box.l && q.x < box.r && q.y > box.t && q.y < box.b) return;
      const mx = (box.l + box.r) / 2, my = (box.t + box.b) / 2, dx = q.x - mx, dy = q.y - my;
      const k = Math.min((box.r - mx) / Math.abs(dx || 1e-6), (box.b - my) / Math.abs(dy || 1e-6));
      const ex = mx + dx * k, ey = my + dy * k, ang = Math.atan2(dy, dx);
      g.save(); g.translate(ex, ey);
      g.fillStyle = 'rgba(14,10,38,0.72)'; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
      g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(17, 0); g.lineTo(11, -5); g.lineTo(11, 5); g.closePath(); g.fill();
      g.rotate(-ang); icon(g); g.restore();
      hits.push({ kind: 'edge', x: ex, y: ey, r: 18, pri: 8, go: q });
    };
    edgeTo(me, '#e6fcff', (c) => { c.fillStyle = '#e6fcff'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill(); });
    if (mapState.goal) edgeTo(w2s(mapState.goal.x, mapState.goal.z), '#ffd29a', (c) => { c.rotate(Math.PI / 4); c.fillStyle = '#ffd29a'; c.fillRect(-4, -4, 8, 8); });
    if (mk) edgeTo(w2s(mk.x, mk.z), '#7fe8f5', (c) => drawPin(c, 0, 5, 0.6, false));
    // a compass and a scale, bottom left
    const cx0 = 46, cy0 = Hh - 42;
    g.save(); g.translate(cx0, cy0);
    g.fillStyle = 'rgba(14,10,38,0.55)'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,244,228,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.stroke();
    g.rotate(mapRot);   // north is -z
    g.fillStyle = '#ff8a7a'; g.beginPath(); g.moveTo(0, -16); g.lineTo(4.5, 0); g.lineTo(-4.5, 0); g.closePath(); g.fill();
    g.fillStyle = '#fff4e4'; g.beginPath(); g.moveTo(0, 16); g.lineTo(4.5, 0); g.lineTo(-4.5, 0); g.closePath(); g.fill();
    g.font = '800 9px Nunito, sans-serif'; g.fillStyle = '#ff8a7a'; g.textAlign = 'center'; g.fillText('N', 0, -25);
    g.restore();
    const u = unitOf(), want = 110 / AV.sc * u;
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((v) => v >= want * 0.55) || 1000;
    const len = nice / u * AV.sc, sx0 = cx0 + 34, sy0 = cy0 + 8;
    g.fillStyle = 'rgba(14,10,38,0.55)'; g.beginPath(); g.roundRect(sx0 - 8, sy0 - 22, len + 16, 32, 10); g.fill();
    g.strokeStyle = '#fff4e4'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx0, sy0 - 4); g.lineTo(sx0, sy0); g.lineTo(sx0 + len, sy0); g.lineTo(sx0 + len, sy0 - 4); g.stroke();
    g.font = '800 11px Nunito, sans-serif'; g.fillStyle = '#fff4e4'; g.textAlign = 'center'; g.fillText(nice + ' m', sx0 + len / 2, sy0 - 11);
    AV.hits = hits;
  }
  // a map pin (used on both maps)
  function drawPin(g, x, y, s, hi) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.shadowColor = 'rgba(127,232,245,0.9)'; g.shadowBlur = hi ? 14 : 8;
    g.fillStyle = hi ? '#c8fbff' : '#7fe8f5'; g.strokeStyle = '#0e2a3a'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-3, -6, -8, -9, -8, -15); g.arc(0, -15, 8, Math.PI, 0); g.bezierCurveTo(8, -9, 3, -6, 0, 0); g.closePath(); g.fill(); g.stroke();
    g.shadowBlur = 0; g.fillStyle = '#0e2a3a'; g.beginPath(); g.arc(0, -15, 3, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // ----- the card at the bottom: what you tapped, and what you can do with it -----
  function select(h) {
    AV.sel = h ? { kind: h.kind, ref: h.ref || null } : null;
    atHint.style.display = h ? 'none' : '';
    if (!h) { atCard.classList.add('hidden'); return; }
    const I = (k) => AT_ICON[k];
    let icon = '', kick = '', name = '', line = '', btns = [];
    const mk = curMark();
    if (h.kind === 'mark') { icon = I('mark'); kick = 'Your mark'; name = mk.name || 'Marked spot'; line = fmtDist(mk.x, mk.z);
      btns = [['unmark', 'Remove', 'ghost']]; if (mapState.chart) btns.unshift(['course', 'Set course', 'primary']); }
    else if (h.kind === 'goal') { icon = I('goal'); kick = 'Where you’re headed'; name = mapState.objective || 'Your objective'; line = fmtDist(mapState.goal.x, mapState.goal.z); }
    else if (h.kind === 'you') { icon = I('you'); kick = 'You'; name = mapState.title || 'Here'; line = 'You are here'; }
    else if (h.kind === 'person') { icon = I('ppl'); kick = NPCS[h.ref.id] ? NPCS[h.ref.id].role || 'Islander' : 'Islander'; name = h.name || 'Someone'; line = (h.ref.news ? 'Has something to tell you · ' : '') + fmtDist(h.ref.x, h.ref.z); btns = [['markHere', 'Mark', 'primary']]; }
    else if (h.kind === 'way') { icon = I('way'); kick = 'Waystone'; name = h.ref.name || 'Waystone'; line = h.ref.lit ? fmtDist(h.ref.x, h.ref.z) : 'Light it to travel here from the map'; btns = h.ref.lit ? [['warp', 'Travel here', 'primary'], ['markHere', 'Mark', 'ghost']] : [['markHere', 'Mark', 'primary']]; }
    else if (h.kind === 'place') { icon = I('place'); kick = h.name === 'Uncharted' ? 'Not yet seen' : 'Place'; name = h.name; line = fmtDist(h.ref.x, h.ref.z); btns = [['markHere', 'Mark', 'primary']]; }
    $('.acIcon', atCard).innerHTML = icon;
    $('.kicker', atCard).textContent = kick; $('h3', atCard).textContent = name; $('p', atCard).textContent = line;
    $('.acBtns', atCard).innerHTML = btns.map(([a, l, c]) => `<button class="${c}" data-ac="${a}">${l}</button>`).join('');
    atCard.classList.remove('hidden'); atCard.style.animation = 'none'; void atCard.offsetWidth; atCard.style.animation = '';
  }
  function dropMark(x, z, name) {
    setMark({ x, z, name });
    AV.drop = AV.t;
    try { navigator.vibrate && navigator.vibrate(8); } catch (_) { /* no buzz here */ }
    opts.sfx && opts.sfx('tick');
    select({ kind: 'mark' });
    atHint.classList.add('gone'); prefs.seen.atlasMark = 1; savePrefs(prefs);
  }
  atCard.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ac]'); if (!b || !AV.sel) return;
    const a = b.dataset.ac, sel = AV.sel, h = AV.hits.find((x) => x.kind === sel.kind && (x.ref === sel.ref || !sel.ref));
    if (a === 'unmark') { setMark(null); select(null); opts.sfx && opts.sfx('tick'); }
    else if (a === 'course') { const m = curMark(); closeMap(); opts.onChart && opts.onChart(m.x, m.z); }
    else if (a === 'warp') { const id = sel.ref.id; closeMap(); opts.onWarp && opts.onWarp(id); }
    else if (a === 'markHere' && h) { const r = sel.ref; dropMark(r.x, r.z, h.name || r.name || null); }
  });

  // ----- the loop while it's open: momentum, glides, and a redraw -----
  function atlasFrame(now) {
    if (!mapOpen) return;
    AV.raf = requestAnimationFrame(atlasFrame);
    const dt = Math.min(0.05, (now - (AV.last || now)) / 1000); AV.last = now; AV.t += dt;
    if (!ptrs.size && (Math.abs(AV.vx) + Math.abs(AV.vz)) > 0.01) {
      AV.cx += AV.vx * dt; AV.cz += AV.vz * dt;
      const f = Math.exp(-dt * 5.5); AV.vx *= f; AV.vz *= f;
    }
    if (AV.to) {
      const k = 1 - Math.exp(-dt * 9);
      AV.cx += (AV.to.x - AV.cx) * k; AV.cz += (AV.to.z - AV.cz) * k; AV.sc += (AV.to.sc - AV.sc) * k;
      if (Math.abs(AV.to.x - AV.cx) + Math.abs(AV.to.z - AV.cz) < 0.02 && Math.abs(AV.to.sc - AV.sc) < 0.01) AV.to = null;
    }
    clampView();
    drawAtlas();
  }

  // ----- touch: one finger pans (with a flick), two pinch; a short tap selects or marks -----
  const ptrs = new Map();
  let pinch2 = null, pan = null;
  const ptOf = (e) => toStage(e.clientX, e.clientY);
  atCv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { atCv.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    const p = ptOf(e);
    ptrs.set(e.pointerId, { x: p.x, y: p.y });
    AV.to = null;
    if (ptrs.size === 1) { pan = { x0: p.x, y0: p.y, t0: performance.now(), moved: false, last: p, lt: performance.now() }; AV.vx = AV.vz = 0; }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch2 = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, sc0: AV.sc, anchor: s2w(mid.x, mid.y) };
      if (pan) pan.moved = true;
    }
  });
  atCv.addEventListener('pointermove', (e) => {
    const q = ptrs.get(e.pointerId); if (!q) return;
    const p = ptOf(e); q.x = p.x; q.y = p.y;
    if (ptrs.size >= 2 && pinch2) {
      const [a, b] = [...ptrs.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      AV.sc = Math.max(minSc(), Math.min(maxSc(), pinch2.sc0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch2.d0));
      const w = s2w(mid.x, mid.y); AV.cx += pinch2.anchor.x - w.x; AV.cz += pinch2.anchor.z - w.z;
      clampView(); return;
    }
    if (!pan) return;
    if (!pan.moved && Math.hypot(p.x - pan.x0, p.y - pan.y0) > 7) pan.moved = true;
    if (!pan.moved) return;
    const a = s2w(pan.last.x, pan.last.y), b = s2w(p.x, p.y), now = performance.now(), dt = Math.max(0.008, (now - pan.lt) / 1000);
    AV.cx += a.x - b.x; AV.cz += a.z - b.z;
    AV.vx = AV.vx * 0.6 + ((a.x - b.x) / dt) * 0.4; AV.vz = AV.vz * 0.6 + ((a.z - b.z) / dt) * 0.4;
    pan.last = p; pan.lt = now;
    clampView();
  });
  function atUp(e) {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptOf(e);
    ptrs.delete(e.pointerId);
    if (ptrs.size === 1) { pinch2 = null; const r = [...ptrs.values()][0]; pan = { x0: r.x, y0: r.y, t0: 0, moved: true, last: { x: r.x, y: r.y }, lt: performance.now() }; AV.vx = AV.vz = 0; return; }
    if (ptrs.size) return;
    pinch2 = null;
    if (pan && performance.now() - pan.lt > 90) { AV.vx = AV.vz = 0; }
    if (pan && !pan.moved && performance.now() - pan.t0 < 450 && e.type === 'pointerup') tapAt(p.x, p.y);
    pan = null;
  }
  atCv.addEventListener('pointerup', atUp);
  atCv.addEventListener('pointercancel', atUp);
  atCv.addEventListener('wheel', (e) => { e.preventDefault(); const p = ptOf(e); zoomAt(e.deltaY > 0 ? 0.88 : 1.14, p.x, p.y); }, { passive: false });
  function tapAt(sx, sy) {
    let best = null, bd = 1e9;
    for (const h of AV.hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d < h.r && (d - h.pri * 2) < bd) { bd = d - h.pri * 2; best = h; } }
    if (best && best.kind === 'edge') { const w = s2w(best.go.x, best.go.y); glideTo(w.x, w.z); return; }
    if (best) { opts.sfx && opts.sfx('tick'); select(best); return; }
    // open ground: your mark goes here (tapping again elsewhere moves it)
    const w = m3 ? M3.unproject(sx, sy, AV.W, AV.H, true) : s2w(sx, sy);
    if (w.x < mapInfo.H0 || w.z < mapInfo.H0 || w.x > mapInfo.H0 + mapInfo.N || w.z > mapInfo.H0 + mapInfo.N) { select(null); return; }
    dropMark(w.x, w.z, null);
  }
  bigMap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-at]'); if (!b) return;
    const a = b.dataset.at, mk = curMark();
    opts.sfx && opts.sfx('tick');
    if (a === 'close') closeMap();
    else if (a === 'in') glideTo(AV.cx, AV.cz, AV.sc * 1.6);
    else if (a === 'out') glideTo(AV.cx, AV.cz, AV.sc / 1.6);
    else if (a === 'me') { glideTo(mapState.x, mapState.z, Math.max(AV.sc, fitSc() * 2.2)); select({ kind: 'you' }); }
    else if (a === 'goal' && mapState.goal) { glideTo(mapState.goal.x, mapState.goal.z); select({ kind: 'goal' }); }
    else if (a === 'mark' && mk) { glideTo(mk.x, mk.z); select({ kind: 'mark' }); }
    else if (a === 'key') atKey.classList.toggle('hidden');
  });
  function syncRail() {
    $('[data-at="goal"]', bigMap).classList.toggle('off', !mapState.goal);
    $('[data-at="mark"]', bigMap).classList.toggle('off', !curMark());
  }

  function openMap() {
    if (!mapState || mapOpen || !mapBase) return;
    mapOpen = true;
    $('.atHead h2', bigMap).textContent = mapState.title || 'Lanternhold';
    $('.atObj span', bigMap).textContent = mapState.objective || '';
    $('.atObj', bigMap).classList.toggle('hidden', !mapState.objective);
    atHint.classList.toggle('gone', !!prefs.seen.atlasMark);
    atKey.classList.add('hidden');
    bigMap.classList.remove('hidden');
    if (M3) { revealFog(); M3.open(mapInfo, mapKey0, mapFog); m3 = true; }
    bigMap.classList.toggle('is3d', m3);
    document.body.classList.add('atlasOpen');
    opts.onPause && opts.onPause();
    opts.sfx && opts.sfx('open');
    AV.W = atCv.clientWidth || view.w; AV.H = atCv.clientHeight || view.h;
    // open on you, a little zoomed in, and settle in
    const sc = Math.max(fitSc() * 1.0, Math.min(maxSc(), Math.max(fitSc() * 1.9, 4.5)));
    AV.cx = mapState.x; AV.cz = mapState.z; AV.sc = sc * 0.82; AV.vx = AV.vz = 0;
    glideTo(mapState.x, mapState.z, sc);
    select(null); syncRail();
    AV.last = 0; AV.raf = requestAnimationFrame(atlasFrame);
  }
  function closeMap() {
    if (!mapOpen) return;
    mapOpen = false;
    cancelAnimationFrame(AV.raf);
    if (m3) { M3.close(); m3 = false; }
    document.body.classList.remove('atlasOpen');
    ptrs.clear(); pan = pinch2 = null;
    bigMap.classList.add('hidden');
    opts.onResume && opts.onResume();
  }
  isle.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); openMap(); });
  markDist.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); openMap(); });
  // for the game: your mark here (in map units), and the marks to save
  const atlas = {
    mark: () => (mapState && mapBase ? curMark() : null), unit: unitOf,
    clearMark: () => setMark(null),
    marks: () => JSON.parse(JSON.stringify(marks)),
    setMarks: (m) => { for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, m || {}); },
    open: openMap, close: closeMap, isOpen: () => mapOpen,
    view: AV, tap: (sx, sy) => tapAt(sx, sy), w2s: (x, z) => w2s(x, z),
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'm' && opts.isStarted() && !talk.lines) { mapOpen ? closeMap() : (!opts.isPaused() && openMap()); }
    else if (k === 'escape' && mapOpen) { e.stopImmediatePropagation(); closeMap(); }
    else if (mapOpen && (k === '+' || k === '=')) glideTo(AV.cx, AV.cz, AV.sc * 1.6);
    else if (mapOpen && k === '-') glideTo(AV.cx, AV.cz, AV.sc / 1.6);
  }, true);

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

  // ----- the pause sheet: your journey so far, settings, and help -----
  const sheet = el('div', 'veil hidden');
  sheet.innerHTML = `
    <div class="sheet glass" role="dialog" aria-label="Paused">
      <div class="sheetHead"><div><div class="kicker shKick">Lanternhold</div><h2 class="shTitle">Paused</h2></div><button class="x" data-act="resume" aria-label="Close">✕</button></div>
      <div class="seg tabs" role="tablist"><button data-tab="journey">Journey</button><button data-tab="settings">Settings</button><button data-tab="help">Help</button></div>
      <section class="tab jGrid" data-tab="journey">
        <div>
          <div class="jObj"><i class="qDot"></i><span></span></div>
          <ol class="chapters"></ol>
        </div>
        <div>
          <div class="stats"></div>
          <button class="primary" data-act="resume">Resume</button>
          <button class="ghost" data-act="title">Save and return to title</button>
          <p class="sub jSaved"></p>
        </div>
      </section>
      <section class="tab" data-tab="settings">
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
          <div class="gTitle">Camera</div>
          <label class="row"><span>Camera stick sensitivity <em class="val" data-val="camSens"></em></span><input type="range" min="0.3" max="2.5" step="0.05" data-pref="camSens"></label>
          <label class="row"><span>Invert up and down</span><input type="checkbox" class="sw" data-pref="invertY"></label>
          <p class="sub">For the close view: the stick on the right side of the screen turns the camera.</p>
        </div>
      </section>
      <section class="tab help" data-tab="help">
        <div class="group">
          <div class="gTitle">Controls</div>
          <p><b>Move</b> — drag on the left side, or tap where you want to go. <b>Swing</b> — tap the sword, hold to keep swinging, drag it to aim. <b>Sling</b> — hold to keep throwing, drag to aim. <b>Roll</b> — you can't be hurt mid-roll. <b>Zoom</b> — pinch. <b>Close view</b> — the button under pause; then the right side of the screen is a stick for the camera. <b>Map</b> — tap the small map: drag, pinch, tap to set a mark.</p>
          <p class="sub">Keyboard: WASD move · J swing · K or arrow keys sling · Space roll · Esc pause. Mouse: left swing, right sling, toward the cursor.</p>
        </div>
        <div class="group">
          <div class="gTitle">Saving</div>
          <p>Your journey saves itself on this device whenever something happens, and every little while. Look for the small lantern in the corner.</p>
        </div>
        <details class="group playtest">
          <summary class="gTitle">Playtest shortcuts</summary>
          <div class="jumps"><button data-jump="riftfall">The Riftfall</button><button data-jump="rift">Into the Rift</button><button data-jump="morning">First light</button><button data-jump="act1">Act 1</button><button data-jump="tether">Get the Tether</button><button data-jump="sea">Set sail</button><button data-jump="brinemoor">Brinemoor</button><button data-jump="belfry">The Belfry</button><button data-jump="market">The Market</button><button data-jump="bellrock">Bell Rock</button><button data-jump="cinder">Cinderglass</button><button data-jump="kiln">The Kiln</button><button data-jump="forge">The forge</button></div>
          <p class="sub">For testing only: these skip story steps.</p>
        </details>
      </section>
      <div class="foot">Riftfall v${VERSION} · Prologue</div>
    </div>`;
  root.appendChild(sheet);
  let tab = 'journey', titleMode = false, ended = false;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const fmtTime = (sec) => { const m = Math.floor(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const statsHtml = (st) => [[fmtTime(st.time), 'On the island'], [st.slivers, 'Skyglass'], [st.calmed, 'Creatures calmed'], [st.falls, 'Falls']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  function setTab(t) {
    tab = t;
    sheet.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    sheet.querySelectorAll('section.tab').forEach((x) => x.classList.toggle('hidden', x.dataset.tab !== t));
  }
  function syncJourney() {
    const j = opts.journey && opts.journey();
    if (!j) return;
    $('.jObj span', sheet).textContent = j.objective || 'Wander. Nothing is asked of you right now.';
    $('.chapters', sheet).innerHTML = j.chapters.map((c, i) => `<li class="${c.state}"><em>${ROMAN[i]}</em><span>${c.name}</span></li>`).join('');
    $('.stats', sheet).innerHTML = statsHtml(j.stats);
    $('.jSaved', sheet).textContent = j.savedAgo;
  }
  function syncSheet() {
    sheet.querySelectorAll('[data-pref] button').forEach((b) => b.classList.toggle('on', prefs.quality === b.dataset.v));
    sheet.querySelectorAll('input[data-pref]').forEach((i) => { if (i.type === 'checkbox') i.checked = !!prefs[i.dataset.pref]; else i.value = prefs[i.dataset.pref]; });
    sheet.querySelectorAll('[data-val]').forEach((v) => { v.textContent = (+prefs[v.dataset.val]).toFixed(2).replace(/0$/, '') + '\u00d7'; });
    sheet.classList.toggle('titleMode', titleMode);
    $('.shTitle', sheet).textContent = titleMode ? (tab === 'help' ? 'Controls' : 'Settings') : 'Paused';
    $('.shKick', sheet).textContent = titleMode ? 'Riftfall' : 'Lanternhold';
    if (!titleMode) syncJourney();
  }
  sheet.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-jump], [data-tab], .seg button');
    if (e.target === sheet) { resume(); return; }
    if (!t) return;
    if (t.dataset.act === 'resume') { resume(); return; }
    if (t.dataset.act === 'title') { opts.onTitle && opts.onTitle(); return; }
    if (t.dataset.jump) { resume(); opts.onJump && opts.onJump(t.dataset.jump); return; }
    if (t.dataset.tab && t.parentElement.classList.contains('tabs')) { setTab(t.dataset.tab); syncSheet(); opts.sfx && opts.sfx('tick'); return; }
    if (t.parentElement.dataset.pref === 'quality') { prefs.quality = t.dataset.v; changed(); }
  });
  sheet.addEventListener('input', (e) => {
    const i = e.target;
    if (!i.dataset.pref) return;
    prefs[i.dataset.pref] = i.type === 'checkbox' ? i.checked : parseFloat(i.value);
    changed();
  });
  function changed() { savePrefs(prefs); syncSheet(); applyLayout(); opts.onPrefs && opts.onPrefs(prefs); opts.sfx && opts.sfx('tick'); }
  function pause() {
    if (opts.isPaused() || ended) return;
    titleMode = false;
    setTab('journey');
    syncSheet();
    sheet.classList.remove('hidden');
    opts.onPause && opts.onPause();
    // let go of anything held
    for (const st of [input.attack, input.ranged]) { st.down = false; st.aim.active = false; }
    input.move.x = input.move.y = 0; input.move.active = false;
    touches.clear(); joy.style.display = 'none'; aimRing.style.display = 'none';
    pad.querySelectorAll('.held').forEach((b) => b.classList.remove('held'));
  }
  function resume() {
    if (sheet.classList.contains('hidden')) return;
    sheet.classList.add('hidden');
    if (titleMode) { titleMode = false; const f = $('.tBtn', titleEl); f && f.focus(); return; }
    opts.onResume && opts.onResume();
  }
  // from the title screen: the same sheet, without the journey
  function openSettings(which) {
    titleMode = true;
    setTab(which);
    syncSheet();
    sheet.classList.remove('hidden');
  }
  pauseBtn.addEventListener('click', () => { pause(); opts.sfx && opts.sfx('open'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && opts.isStarted()) pause(); });

  // ----- "Saved": a small lantern that glows for a moment in the corner -----
  const savedEl = el('div', 'savedMark', `<i>${ICON.lantern}</i><span>${TEXT.saved}</span>`);
  hud.appendChild(savedEl);
  let savedT = null;
  function savedMark() {
    savedEl.classList.remove('on'); void savedEl.offsetWidth; savedEl.classList.add('on');
    clearTimeout(savedT); savedT = setTimeout(() => savedEl.classList.remove('on'), 1800);
  }

  // ----- the title menu, floating over the cove -----
  const titleEl = el('div', 'title hidden');
  titleEl.innerHTML = `
    <div class="tShade"></div>
    <div class="tCol">
      <div class="tKicker">The Shattered Sky</div>
      <h1 class="tMark">${TEXT.title}</h1>
      <div class="tSub">Prologue</div>
      <nav class="tMenu">
        <button class="tBtn main" data-t="continue"><span>Continue</span><small></small></button>
        <button class="tBtn" data-t="new"><span>New journey</span><small></small></button>
        <button class="tBtn" data-t="settings"><span>Settings</span></button>
        <button class="tBtn" data-t="help"><span>Controls</span></button>
      </nav>
    </div>
    <div class="tFoot">v${VERSION} · your journey is saved on this device</div>
    <div class="confirm hidden"><div class="cBox glass"><p>${TEXT.newConfirm}</p><div class="cBtns"><button class="ghost" data-c="no">Keep it</button><button class="primary" data-c="yes">Begin anew</button></div></div></div>`;
  root.appendChild(titleEl);
  let titleOpts = null;
  function titleMenu(o) {
    titleOpts = o;
    const cont = $('[data-t="continue"]', titleEl), fresh = $('[data-t="new"]', titleEl);
    cont.classList.toggle('hidden', !o.save);
    fresh.classList.toggle('main', !o.save);
    $('span', fresh).textContent = o.save ? 'New journey' : 'Begin';
    $('small', fresh).textContent = o.save ? '' : 'A lighthouse, an apprentice, a sky about to break';
    if (o.save) $('small', cont).textContent = o.save.ended ? `Prologue complete · ${fmtTime(o.save.time)}` : `${o.save.chapter} · ${fmtTime(o.save.time)}`;
    titleEl.classList.remove('hidden', 'out');
    void titleEl.offsetWidth;
    titleEl.classList.add('in');
    setTimeout(() => { const f = $('.tBtn:not(.hidden)', titleEl); f && f.focus({ preventScroll: true }); }, 50);
  }
  function closeTitle() { if (titleEl.classList.contains('hidden') || titleEl.classList.contains('out')) return; titleEl.classList.add('out'); titleEl.classList.remove('in'); setTimeout(() => titleEl.classList.add('hidden'), 700); }
  titleEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t], [data-c]');
    if (!b || !titleOpts || titleEl.classList.contains('out')) return;
    opts.sfx && opts.sfx('tick');
    const conf = $('.confirm', titleEl);
    if (b.dataset.c === 'no') { conf.classList.add('hidden'); return; }
    if (b.dataset.c === 'yes') { conf.classList.add('hidden'); closeTitle(); titleOpts.onNew(); return; }
    const t = b.dataset.t;
    if (t === 'continue') { closeTitle(); titleOpts.onContinue(); }
    else if (t === 'new') { if (titleOpts.save) { conf.classList.remove('hidden'); $('[data-c="no"]', conf).focus(); } else { closeTitle(); titleOpts.onNew(); } }
    else openSettings(t);
  });
  // arrow keys move between the menu items
  titleEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = [...titleEl.querySelectorAll('.tBtn:not(.hidden)')];
    const i = list.indexOf(document.activeElement);
    const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (n) { n.focus(); e.preventDefault(); }
  });

  // ----- the end of the Prologue -----
  const endEl = el('div', 'endCard hidden');
  endEl.innerHTML = `
    <div class="ecInner">
      <div class="tcRegion">${STORY.endCard.kicker}</div>
      <h1 class="ecTitle">${STORY.endCard.title}</h1>
      <div class="ecRule"></div>
      <p class="ecLine">${STORY.endCard.line}</p>
      <div class="stats"></div>
      <div class="ecBtns"><button class="ghost" data-e="title">Return to title</button><button class="primary" data-e="keep">Keep exploring</button></div>
      <p class="sub">Your journey is saved. More of the sky is coming.</p>
    </div>`;
  root.appendChild(endEl);
  function endCard(stats) {
    ended = true;
    $('.stats', endEl).innerHTML = statsHtml(stats);
    endEl.classList.remove('hidden', 'out');
    void endEl.offsetWidth;
    endEl.classList.add('in');
    return new Promise((resolve) => {
      const on = (e) => {
        const b = e.target.closest('[data-e]');
        if (!b) return;
        endEl.removeEventListener('click', on);
        opts.sfx && opts.sfx('tick');
        ended = false;
        endEl.classList.add('out');
        setTimeout(() => endEl.classList.add('hidden'), 900);
        resolve(b.dataset.e);
      };
      endEl.addEventListener('click', on);
    });
  }

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
    titleMenu, closeTitle, endCard, savedMark, fmtTime, buildMap, islandMap, closeMap, mapIsOpen: () => mapOpen, atlas,
    setTools, setToolArt, draftLabels, setHeat, forgeMenu, setSeaView, openTools: () => openWheel(null), closeTools: () => closeWheel(false), setKeys, itemGet, setJar, wheelOpen: () => !wheel.classList.contains('hidden'),
    show(on) { document.body.classList.toggle('playing', on); },
  };
}

// The loading veil: it fades once the cove is built and drawn, and the title menu takes over
export function loadingDone() {
  const ld = $('#loading');
  ld.classList.add('ready', 'gone');
  setTimeout(() => ld.remove(), 1200);
}
export function loadingFailed(msg) {
  const ld = $('#loading');
  if (!ld) return;
  ld.classList.add('failed');
  const m = $('.ldMsg', ld);
  if (m) m.textContent = msg;
}
export { TEXT };
