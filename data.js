/* Riftfall — data.js
   Numbers, names and tuning. Everything you might want to tweak without touching game logic lives here. */

export const VERSION = '0.1.0';

export const CONFIG = {
  // ----- the player -----
  player: {
    speed: 4.6,            // units per second at full stick
    accel: 14,             // how fast you reach full speed (higher = snappier)
    radius: 0.32,          // collision size
    hearts: 5,             // max health in hearts (each heart = 2 half-hearts)
    stepUp: 0.55,          // highest ledge you can walk up without stairs
  },
  // the dodge: a classic roll with invincibility frames
  roll: {
    duration: 0.42,        // seconds from start to end of the roll
    distance: 3.8,         // how far one roll carries you
    iStart: 0.03,          // invincible from ...
    iEnd: 0.34,            // ... to (seconds into the roll)
    cooldown: 0.18,        // pause after a roll before the next one
    buffer: 0.2,           // a roll pressed this long before you're free still happens
  },
  camera: {
    fov: 45,
    dist: 11.5,            // distance from the player
    dir: [0.42, 1.15, 1],  // the PixelPups angle: from behind-right, looking down
    follow: 0.0009,        // smoothing (smaller = snappier)
    lookAhead: 1.4,        // the camera leans toward where you're heading
    zoomMin: 0.65, zoomMax: 1.5,
  },
  feel: {
    hitStop: 0.055,        // freeze frames on a normal hit (seconds)
    hitStopHeavy: 0.11,    // ... on a finisher
    shake: 1,              // global screen shake multiplier (Settings can turn it off)
  },
};

// ----- weapons -----
// Melee: a combo of swings. Holding the button keeps chaining the combo at the weapon's own pace.
// Ranged: holding keeps firing at `rate` shots per second, Isaac-style.
export const WEAPONS = {
  skyblade: {
    name: 'Skyglass Blade',
    kind: 'melee',
    desc: 'A sliver of fallen sky, bound to a driftwood hilt. Light, quick and humming.',
    combo: [
      { dmg: 10, arc: 130, range: 2.0, windup: 0.07, active: 0.09, recover: 0.20, lunge: 0.55, swing: 'right' },
      { dmg: 10, arc: 130, range: 2.0, windup: 0.06, active: 0.09, recover: 0.20, lunge: 0.55, swing: 'left' },
      { dmg: 22, arc: 220, range: 2.4, windup: 0.13, active: 0.12, recover: 0.36, lunge: 1.1, swing: 'spin', heavy: true },
    ],
    comboReset: 0.55,      // seconds after a swing before the combo starts over
    knock: 2.4,
  },
  tidesling: {
    name: 'Tidesling',
    kind: 'ranged',
    desc: 'A sling that throws bright drops of sea water. They fall in a soft arc.',
    rate: 3.4,             // shots per second while held
    speed: 13,
    range: 9.5,
    dmg: 5,
    size: 0.17,
    knock: 0.9,
  },
};

// ----- places -----
export const PLACES = {
  cove: {
    name: 'The Keeper’s Cove',
    region: 'Lanternhold',
    line: 'Below the lighthouse, where the first shards wash ashore.',
  },
};

// ----- the look of the evening: colours of the sky, light and fog -----
export const PALETTE = {
  skyZenith: '#1d1b4a',
  skyMid: '#5b4a8f',
  skyHorizon: '#f2a37a',
  skyGlow: '#ffd29a',
  fog: '#8f7aa8',
  sun: '#ffc48a',
  hemiSky: '#b9b0ff',
  hemiGround: '#6b5a48',
  crack: '#9ff3ff',
  sea: '#2a6f8f',
  seaDeep: '#173d63',
  seaShallow: '#4fc1c4',
  foam: '#f4fbff',
  grass: ['#5f9c46', '#67a54b', '#58923f', '#71ab50'],
  grassSide: '#4f8238',
  dirt: '#8a6444',
  dirtDark: '#6e4e36',
  sand: ['#ead6a6', '#e5cf9b', '#efdcae', '#e0c892'],
  sandSide: '#d2b580',
  stone: ['#a19b8f', '#958f83', '#aaa498'],
  stoneSide: '#7d766a',
  path: ['#c9b48d', '#c2ad86', '#d0bc95'],
  wood: '#8b5e3c',
  woodDark: '#5d3d26',
  woodLight: '#b0805a',
};

// short lines shown when things happen (kept here so wording is easy to change)
export const TEXT = {
  hintMove: 'Drag to move',
  hintAttack: 'Hold to keep swinging · drag the button to aim',
  hintRoll: 'Roll through attacks',
  dummy: ['Thwack!', 'Oof.', 'Driftwood holds.', 'Again!'],
};
