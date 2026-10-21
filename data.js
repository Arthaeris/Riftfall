/* Riftfall — data.js
   Numbers, names and tuning. Everything you might want to tweak without touching game logic lives here. (Pushed by Claude.) */

export const VERSION = '0.3.0';

export const CONFIG = {
  // ----- the player -----
  player: {
    speed: 3.8,            // units per second at full stick
    accel: 19,             // speeding up (units per second, per second)
    decel: 24,             // slowing down when you let go
    turnRate: 11,          // how fast you can turn (radians per second)
    deadzone: 0.12,        // stick travel ignored around the centre
    radius: 0.32,          // collision size
    hearts: 5,             // max health in hearts (each heart = 2 half-hearts)
    stepUp: 0.55,          // highest ledge you can walk up without stairs
  },
  // the dodge: a classic roll with invincibility frames
  roll: {
    duration: 0.62,        // seconds from start to end of the roll
    distance: 3.0,         // how far one roll carries you
    iStart: 0.05,          // invincible from ...
    iEnd: 0.42,            // ... to (seconds into the roll)
    cooldown: 0.25,        // pause after a roll before the next one
    buffer: 0.2,           // a roll pressed this long before you're free still happens
  },
  camera: {
    fov: 45,
    dist: 11.5,            // distance from the player
    dir: [0.42, 1.15, 1],  // the PixelPups angle: from behind-right, looking down
    follow: 0.03,          // smoothing (smaller = snappier)
    lookAhead: 0.9,        // the camera leans toward where you're heading
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
    // you stay where you stand while swinging; upgrades will make these faster later
    combo: [
      { dmg: 10, arc: 130, range: 2.0, windup: 0.15, active: 0.1, recover: 0.34, swing: 'right' },
      { dmg: 10, arc: 130, range: 2.0, windup: 0.13, active: 0.1, recover: 0.34, swing: 'left' },
      { dmg: 22, arc: 220, range: 2.4, windup: 0.24, active: 0.14, recover: 0.52, swing: 'spin', heavy: true },
    ],
    comboReset: 0.6,       // seconds after a swing before the combo starts over
    knock: 2.4,
  },
  tidesling: {
    name: 'Tidesling',
    kind: 'ranged',
    desc: 'A sling that throws bright drops of sea water. They fall in a soft arc.',
    rate: 2.0,             // shots per second while held
    speed: 11,
    range: 9.5,
    dmg: 5,
    size: 0.17,
    knock: 0.9,
  },
};

// ----- the player getting hurt -----
export const HURT = {
  invuln: 0.9,           // seconds you can't be hurt again after a hit (you flicker)
  knock: 6,              // how hard a hit pushes you back
  respawnDelay: 2.6,     // seconds from falling to waking by the fire
};

// ----- creatures from the Rifts -----
// hp: health. dmg: in half hearts. r: body size for hits. Every attack has a warning (tell) you can read and roll through.
export const FOES = {
  mirrorpuddle: {
    name: 'Mirrorpuddle',
    desc: 'A walking puddle that reflects a different sky than the one above it.',
    hp: 30, r: 0.5, dmg: 1, speed: 1.7,
    hopEvery: 0.55,        // the little hops it moves in
    reach: 3.4,            // starts its leap from this far
    tell: 0.5,             // crouch before the leap
    leap: 0.42,            // time in the air
    leapDist: 3.2,
    rest: 0.9,             // catching its breath after a leap
    knockTaken: 1.0,       // how far your hits push it
    drops: [2, 3],         // Skyglass slivers, min and max
  },
  bellfish: {
    name: 'Bellfish',
    desc: 'A jellyfish with a tiny drowned room inside its bell. The lamp in there is still lit.',
    hp: 26, r: 0.55, dmg: 1, speed: 1.4,
    hover: 1.5,            // floats this high
    keep: [4.5, 7],        // likes to stay this far from you
    every: [2.6, 3.6],     // seconds between volleys
    tell: 0.75,            // its lamp swells before it rings
    orbs: 10, orbSpeed: 3.4, orbLife: 3.4, orbR: 0.22,
    knockTaken: 0.6,
    drops: [2, 4],
  },
  rootscript: {
    name: 'Rootscript',
    desc: 'A hand of roots that writes glowing letters on the ground before it bursts up beneath you.',
    hp: 36, r: 0.5, dmg: 2, speed: 3.2,
    up: 1.8,               // how long it stays above ground (that's when you can hit it)
    under: 1.2,            // how long it travels below ground
    tell: 0.95,            // the ring of letters before it bursts
    burstR: 1.25,
    knockTaken: 0.2,
    drops: [3, 4],
  },
};

// ----- the Seep: the clearing where the fallen shard leaks creatures into Lanternhold -----
export const SEEP = {
  name: 'The Seep',
  line: 'Where the shard fell, something keeps crawling out.',
  waves: [
    ['mirrorpuddle', 'mirrorpuddle', 'mirrorpuddle'],
    ['mirrorpuddle', 'mirrorpuddle', 'bellfish'],
    ['rootscript', 'bellfish', 'mirrorpuddle', 'mirrorpuddle'],
  ],
  recharge: 25,          // seconds before the shard stirs again after you clear it
  heartChance: 0.18,     // chance a creature leaves a heart behind (more likely when you're hurt)
};

// ----- the people of Lanternhold -----
export const NPCS = {
  maren: { name: 'Maren', color: '#ffd29a', role: 'The Keeper' },
  tobin: { name: 'Tobin', color: '#f2c94c', role: 'Fisherman' },
  wenna: { name: 'Wenna', color: '#ff9f80', role: 'Baker' },
  pip: { name: 'Pip', color: '#9fd8ff', role: 'Trouble' },
};

// ----- the Prologue, step by step. Each step has an objective line; Maren's lines are said when you talk to her. -----
export const STORY = {
  practiceHits: 12,
  objectives: {
    findMaren: 'Find Maren by her cottage, up the stairs',
    practice: (n, of) => `Strike the practice dummies (${n}/${of})`,
    reportPractice: 'Return to Maren',
    beacon: 'Relight the dock beacon: hit its crystal with your sling',
    toShard: 'Go to the stone circle where the shard fell',
    seep: 'Survive the Seep',
    reportSeep: 'Return to Maren',
    rest: 'Rest. The Rift can wait for morning.',
  },
  maren: {
    findMaren: [
      'There you are. I thought the tide had taken you.',
      'The light\u2019s going early tonight, and the sky has been loud since noon. Can you hear it? Like a glass about to sing.',
      'Never mind. If you\u2019re to keep this lamp with me, you need a steady arm. That blade I gave you isn\u2019t for opening letters.',
      'The old training ring is down past the stairs, to the west. Twelve good hits on those dummies.',
      'Hold the sword to keep swinging. And roll if something swings back. Not that dummies do.',
    ],
    practice: ['Twelve hits. I\u2019m counting.'],
    reportPractice: [
      'Hm. Not bad. Not good either, but not bad.',
      'Now: the dock beacon has gone dark. Tobin swears it went out on its own, but Tobin swears about a lot of things.',
      'Its crystal sits on the old sea stack past the end of the dock. You can\u2019t wade out there.',
      'Stand at the end of the dock and wake it with your sling. Crystals like that answer to a good hit.',
    ],
    beacon: ['The end of the dock. Aim for the crystal in the brass cage.'],
    toShard: ['The stone circle in the meadow. Go.'],
    seep: ['Don\u2019t stand there talking to me. Go!'],
    reportSeep: [
      'You\u2019re still in one piece. Good.',
      'I\u2019ve kept this lamp a long time, and the sky has never cracked. Not in living memory.',
      'That shard is only the first. Tomorrow we\u2019ll see where it leads.',
      'Keep the slivers you gathered, apprentice. We\u2019ll need every one.',
    ],
    rest: ['Go on, rest. I\u2019ll keep watch.'],
  },
  // after the beacon is lit: night falls, then the first Riftfall
  riftfallAfter: [
    { who: '', text: 'A sound like the whole sky drawing breath.' },
    { who: 'maren', text: 'Apprentice! Did you see where that one came down?' },
    { who: 'maren', text: 'The old stone circle in the meadow. Whatever fell with it won\u2019t stay put for long.' },
    { who: 'maren', text: 'Go. And mind yourself: that glass doesn\u2019t just fall. Things climb out of it.' },
  ],
  // what the villagers say, before and after the sky breaks. Each talk shows the next line.
  villagers: {
    tobin: {
      before: ['The beacon went dark at noon. Didn\u2019t flicker. Just stopped, like it was listening for something.', 'Caught a fish this morning that hummed. Threw it back. Some things you don\u2019t eat.', 'Maren\u2019s up at the cottage. She\u2019s been staring at the sky all day.'],
      after: ['The sky\u2019s open like a cracked bell. My nets came up full of light.', 'Thirty years on this water. I\u2019ve never seen the stars fall up.'],
    },
    wenna: {
      before: ['My bread won\u2019t rise today. Or it rises and keeps on rising. I\u2019ve had to tie a loaf down with string.', 'Take a roll up to the Keeper, would you? She forgets to eat when the sky\u2019s like this.', 'Smells like rain. Rain that smells of glass. Is that a thing?'],
      after: ['Did you see it fall? Like a star with somewhere to be.', 'I\u2019ll keep the oven lit tonight. Nobody should be alone in the dark.'],
    },
    pip: {
      before: ['Are you Maren\u2019s apprentice? Is that a real sword? Can I hold it? Can I\u2014 okay, no.', 'When I grow up I\u2019m going to keep the lamp too. Or be a dragon. Probably the lamp.', 'I hit a dummy once. It hit me back. Well, it fell on me.'],
      after: ['I\u2019m not scared. I\u2019m just standing very close to the well.', 'Did you fight them? What did they look like? Were they slimy? I bet they were slimy.'],
    },
  },
  roundEnd: 'End of round 3: the Tutorial Rift opens in round 4',
};

// ----- the light at evening and at night (game.js blends between them) -----
export const TIMES = {
  evening: { zenith: '#1d1b4a', mid: '#5b4a8f', horizon: '#f2a37a', glow: '#ffd29a', fog: '#8f7aa8', sun: '#ffc48a', sunI: 3.6, hemiSky: '#aab4e4', hemiGround: '#6b5a48', hemiI: 1.3, grade: [1.04, 0.99, 0.97] },
  night: { zenith: '#05071a', mid: '#121838', horizon: '#2c2a58', glow: '#5a5a9a', fog: '#1e2246', sun: '#8fa8ff', sunI: 1.1, hemiSky: '#5a6aa8', hemiGround: '#231e36', hemiI: 0.62, grade: [0.9, 0.96, 1.12] },
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
  hemiSky: '#aab4e4',
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
  hintMove: 'Drag to move \u00b7 tap to walk there \u00b7 pinch to zoom',
  hintAttack: 'Hold to keep swinging · drag the button to aim',
  hintRoll: 'Roll through attacks',
  dummy: ['Thwack!', 'Oof.', 'Driftwood holds.', 'Again!'],
  seepSealed: 'The shard seals the clearing',
  seepWave: (n, of) => `Wave ${n} of ${of}`,
  seepClear: 'The Seep falls quiet',
  seepRecharging: 'The shard is gathering itself',
  fallen: 'You wake by the fire',
};
