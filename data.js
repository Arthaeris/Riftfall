/* Riftfall — data.js
   Numbers, names and tuning. Everything you might want to tweak without touching game logic lives here. */

export const VERSION = '0.7.1';

export const CONFIG = {
  // ----- the player -----
  player: {
    speed: 3.8,            // units per second at full stick
    accel: 19,             // speeding up (units per second, per second)
    decel: 24,             // slowing down when you let go
    turnRate: 11,          // how fast you can turn (radians per second)
    deadzone: 0.12,        // stick travel ignored around the centre
    runMul: 1.6,           // running is this much faster than walking
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
  doorcrab: {
    name: 'Doorcrab',
    desc: 'A crab wearing an old front door as its shell. Behind it, the door swings open onto nothing.',
    hp: 44, r: 0.62, dmg: 1, speed: 1.1,
    turn: 1.7,             // how fast it turns to face you (radians per second): get round the side
    guard: 75,             // its claws block hits from this many degrees either side of straight ahead
    reach: 1.7, tell: 0.55, snap: 0.18, rest: 0.8,
    doorReach: 2.6,        // stand this close behind it and the door opens
    pull: 2.2, doorOpen: 1.3, doorCd: 2.6,
    knockTaken: 0.35,
    drops: [3, 4],
  },
  lullabypod: {
    name: 'Lullaby Pod',
    desc: 'A cocoon that hums in a voice you almost recognise. Leave it alone and it hatches.',
    hp: 20, r: 0.5, dmg: 0, speed: 0,
    hatch: 7.5,            // seconds until it hatches
    brood: ['mirrorpuddle', 'mirrorpuddle'],
    knockTaken: 0,
    drops: [2, 3],
  },
  shardmite: {
    name: 'Shard-mite',
    desc: 'A splinter of sky that learned to scuttle. They come in clutches, and they bite.',
    hp: 12, r: 0.32, dmg: 1, speed: 2.4,
    dash: 6.2, dashT: 0.32,  // a quick dart toward you, then a pause
    pause: [0.5, 1.1],
    reach: 0.75,
    knockTaken: 1.6,
    drops: [0, 1],
  },
  barnacle: {
    name: 'Cliff Barnacle',
    desc: 'It clings to the cave wall and spits pebbles. Its shell turns a sword; pull it off the rock and it is soft.',
    hp: 22, r: 0.5, dmg: 1, speed: 0,
    every: [2.2, 3.0],     // seconds between shots
    tell: 0.6,             // its mouth opens before it spits
    shot: 6.5,             // pebble speed
    range: 10,
    stun: 3.2,             // how long it flops about once pulled off the wall
    knockTaken: 0.2,
    drops: [1, 2],
  },
  barnaclemother: {
    name: 'Barnacle Mother',
    desc: 'The oldest thing in Gullcliff Caves, crusted over with a hundred years of shell. Her children are everywhere.',
    hp: 300, r: 1.9, dmg: 1, speed: 0,
    plates: 4,             // armour plates: pull them off with the Tether to get at her
    regrow: 13,            // seconds until a lost plate grows back
    every: [2.4, 1.9],     // seconds between attacks, by phase
    wave: 7.5,             // how far her slam wave rolls
    knockTaken: 0,
    drops: [16, 20],
  },
  gardener: {
    name: 'The Weeping Gardener',
    desc: 'A great tree hanging upside down from a crack in the Rift. Its tears fall upward; the fruit on its branches are tiny worlds.',
    hp: 360, r: 1.3, dmg: 2, speed: 0,
    phases: [0.66, 0.33],  // health left where it changes how it fights
    every: [2.6, 2.0, 1.6], // seconds between attacks, by phase
    sweepR: 4.6,           // the branch sweep's reach (phase 2 and 3)
    knockTaken: 0,
    drops: [20, 24],
  },
};

// ----- tools: the sling button holds them all; hold it to choose -----
export const TOOLS = {
  sling: { name: 'Sling', desc: 'Maren\u2019s old sling. Hits switches and crystals from afar.' },
  tether: {
    name: 'Tether', desc: 'A keeper\u2019s grapple on a line of sky-thread. Bite a brass ring to cross a gap; pull shells, plates and creatures toward you.',
    range: 9.5, speed: 30, pull: 15, cooldown: 0.45,
  },
};

// ----- Gullcliff Caves: the first legacy dungeon. Every cell of its map is one block:
//   #  rock        .  floor        :  ledge (a block up)   =  step       ~  shallow water   _  chasm
//   P  where you arrive            E  the way out          t  torch      r  pillar         p  pot
//   O  brass ring (Tether)         L  a ring on the gate's chain          G  gate (pull L)
//   D  locked door (small key)     B  the guardian's door (big key)      S  a gate opened by the lever l
//   d  doors that seal while creatures are left in the room
//   k  small key chest   K  big key chest   T  the Tether's chest   c  a keepsake
//   s  shard-mite   m  mirrorpuddle   f  bellfish   n  cliff barnacle   X  the guardian
export const CAVES = {
  name: 'Gullcliff Caves',
  region: 'Below the keepers\u2019 wall',
  line: 'The sea has been carving these caves for a thousand years. Something else has been living in them.',
  ambush: { x0: 20, z0: 6, x1: 40, z1: 18 },
  map: [
    '################################################################',
    '################################################################',
    '################################################################',
    '################################################################',
    '################################################################',
    '################################################################',
    '####################....n...........n....#######################',
    '####################.t.................t.#######################',
    '####################..........K..........#######################',
    '####################.....m.........m.....#######################',
    '####################.....................#######################',
    '####################........r...r........#######################',
    '####################....s...........s....#######################',
    '###############..###.....................#######################',
    '###############....d.....................#######################',
    '###############....d.......s.....s.......#######################',
    '##############L..###.....................#######################',
    '###############..###.t.................t.#######################',
    '###############GG###.....................#######################',
    '###############..#############dd################################',
    '####____..........t###########..################################',
    '####.O__...........###########..################################',
    '####..__...m.......###########..l###############################',
    '####c.__O..........###########..################################',
    '####____.t.........###########..################################',
    '####____......O....###########..####################.....#######',
    '####_______________###########SS##################.........#####',
    '####_______________#.....................#######t...........t###',
    '####_______________#.:k:::.............t.#######.............###',
    '####......O........#.:::::...........f...######...............##',
    '####.n.............#.:::::...............######...............##',
    '####...........s...#..==.~~~~~~~~~~~~....#####.................#',
    '####...............#.....~~~~~~~~~~~~....#####.................#',
    '####.....s.........#.....~~~m~~~~~~~~....B............X........#',
    '####...............#.....~~~~~~~~m~~~....B.....................#',
    '####t.............t#.....~~~~~~~~~~~~....#####.................#',
    '####...............#.....................######...............##',
    '####.......O.......#..................p..######...............##',
    '#####______________#.t.................t.#######.............###',
    '#####______________#.....................#######t...........t###',
    '#####______________###########...#################.........#####',
    '#####______________###########...###################.....#######',
    '#####______________###########...###############################',
    '#####______________###########...###############################',
    '#####........O.....#####...............#########################',
    '#####.t..........t.#####.t.s.......s.t.#########################',
    '#####......=.......#####..r.........r..#########################',
    '#####.....:::..........D...............#########################',
    '#####.....:T:..........D...............#########################',
    '#####.....:::......#####..p............#########################',
    '#####......=....p..#####............p..#########################',
    '#####.t..........t.#####.t.....P.....t.#########################',
    '#####..............#####...............#########################',
    '##############################...###############################',
    '##############################EEE###############################',
    '################################################################',
  ],
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

// ----- the Rift: the Drowned Orchard. A floor of rooms on a grid; the doors seal until a room is cleared. -----
export const RIFT = {
  name: 'The Drowned Orchard',
  line: 'Fruit trees under the sea, and a sky made of water.',
  rooms: 7,              // rooms before the guardian's (the tutorial floor is short)
  roomW: 16, roomD: 12,  // inside size of a normal room
  // what a combat room can hold. The game picks from these as you go deeper (index = how far from the start).
  waves: [
    [['mirrorpuddle', 'mirrorpuddle', 'lullabypod']],
    [['doorcrab', 'mirrorpuddle']],
    [['bellfish', 'mirrorpuddle', 'mirrorpuddle'], ['lullabypod', 'doorcrab']],
    [['doorcrab', 'bellfish'], ['rootscript', 'mirrorpuddle', 'mirrorpuddle']],
    [['lullabypod', 'lullabypod', 'bellfish'], ['doorcrab', 'doorcrab']],
  ],
  // layouts for room furniture: trees (t), coral (c), rocks (r), kelp (k), pools (p). Coordinates from the room centre.
  layouts: [
    [['t', -4.5, -2.5], ['t', 4.5, 2.5], ['c', -5.5, 3], ['c', 5.5, -3], ['k', 0, -4], ['k', -1, 4]],
    [['t', -5, 0], ['t', 5, 0], ['r', 0, -2.5], ['r', 0, 2.5], ['k', -3, -4], ['k', 3, 4]],
    [['p', 0, 0], ['c', -4, -3], ['c', 4, 3], ['t', -5.5, 3.5], ['k', 5, -4]],
    [['t', -3, -3], ['t', 3, 3], ['t', 3, -3], ['c', -3, 3], ['k', -6, 0], ['k', 6, 0]],
    [['r', -4, 0], ['r', 4, 0], ['c', 0, -4], ['c', 0, 4], ['k', -6, -4], ['k', 6, 4]],
  ],
  treasure: { slivers: 12, heart: true },
};

// ----- the people of Lanternhold -----
export const NPCS = {
  maren: { name: 'Maren', color: '#ffd29a', role: 'The Keeper' },
  tobin: { name: 'Tobin', color: '#f2c94c', role: 'Fisherman' },
  wenna: { name: 'Wenna', color: '#ff9f80', role: 'Baker' },
  pip: { name: 'Pip', color: '#9fd8ff', role: 'Trouble' },
  ennis: { name: 'Ennis', color: '#e8d48a', role: 'Lamplighter' },
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
    enterRift: 'The shard has become a door. Step through it.',
    rift: 'Find the heart of the Drowned Orchard',
    guardian: 'Defeat the Weeping Gardener',
    heartGlass: 'Touch the heart-glass to go home',
    reportRift: 'Tell Maren what you found',
    rest: 'Sleep in Maren\u2019s cottage',
    morning: 'Meet Maren at the lighthouse',
    ending: '',
    free: 'Maren is waiting by the lighthouse',
    gullcliff: 'Go through the keepers\u2019 gate, down to Gullcliff Caves',
    caves: 'Find the keepers\u2019 oil store in Gullcliff Caves',
    cavesBoss: 'Something guards the oil store. Defeat it',
    reportOil: 'Bring the lamp oil to Maren',
    boathouse: 'Cross the ravine on Knot Hill to the old boathouse',
    act1End: 'The sea is waiting. (More of Act 1 arrives in the next build.)',
  },
  // the Prologue in chapters, for the journal in the pause menu (each lists the steps it covers)
  chapters: [
    { name: 'The Keeper\u2019s Apprentice', steps: ['findMaren', 'practice', 'reportPractice'] },
    { name: 'The Dark Beacon', steps: ['beacon', 'dusk'] },
    { name: 'The First Riftfall', steps: ['toShard', 'seep', 'reportSeep'] },
    { name: 'The Drowned Orchard', steps: ['enterRift', 'rift', 'guardian', 'heartGlass', 'reportRift'] },
    { name: 'First Light', steps: ['rest', 'morning', 'ending'] },
    { name: 'Act 1 \u00b7 Gullcliff', steps: ['free', 'gullcliff', 'caves', 'cavesBoss', 'reportOil'] },
    { name: 'Act 1 \u00b7 The Boathouse', steps: ['boathouse', 'act1End'] },
  ],
  // every step in order (saving and the journal use this)
  order: ['findMaren', 'practice', 'reportPractice', 'beacon', 'dusk', 'toShard', 'seep', 'reportSeep', 'enterRift', 'rift', 'guardian', 'heartGlass', 'reportRift', 'rest', 'morning', 'ending', 'free', 'gullcliff', 'caves', 'cavesBoss', 'reportOil', 'boathouse', 'act1End'],
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
      'But look at the shard. It isn\u2019t done. It\u2019s opening, like a door someone forgot to close.',
      'Those things came from somewhere. Go through and see where. Find whatever holds that place together, and break it.',
      'I\u2019ll be here. Behind the lamp. Where keepers belong.',
    ],
    enterRift: ['The shard, apprentice. Don\u2019t make me push you.'],
    reportRift: [
      'You came back. And you\u2019re carrying its heart. Let me see that.',
      'An orchard under the sea, and a tree that weeps upward. Hm.',
      'That was somebody\u2019s world once. A small one. Now it\u2019s a splinter in ours.',
      'Keep the heart-glass safe. Sleep in the cottage tonight; the door\u2019s open. At first light we take it up the lighthouse and see what the lamp makes of it.',
    ],
    rest: ['Go on, the cottage. I\u2019ll keep watch. Somebody has to.'],
    morning: [
      'Morning, apprentice. You snore like a foghorn.',
      'The sky didn\u2019t mend itself overnight. I didn\u2019t expect it to.',
      'Bring the heart. Up we go, all two hundred steps. Don\u2019t look down, and don\u2019t drop it.',
    ],
    free: [
      'The lamp drank the heart-glass, and every drop of oil with it. Look at it. Hungry.',
      'There\u2019s an old keepers\u2019 store in Gullcliff Caves, under the east cliffs. Oil, wicks, a few things I\u2019d rather not leave lying about.',
      'Here. The key to the keepers\u2019 gate. Nobody\u2019s been through it since I was your age.',
      'Follow the wall east from the Heights. Take the cliff path down to the shore, and mind the tide.',
      'And apprentice: things have moved into those caves since the sky broke. Big things. Be careful.',
    ],
    gullcliff: ['The gate east of the lighthouse. Then down the cliff path.'],
    caves: ['The oil store is deep in. Keep going.'],
    cavesBoss: ['Whatever it is, it\u2019s sitting on my oil. Go.'],
    reportOil: [
      'You found it. And you found that, too. The Tether. My old teacher\u2019s.',
      'She used it to cross the ravine on Knot Hill, out to the boathouse. Back when we still had a boat.',
      'The boat\u2019s gone, but the boathouse isn\u2019t. Go and look. If we\u2019re to reach the other lights, we\u2019ll need to get out to sea.',
      'The lamp will burn tonight. Thank you.',
    ],
    boathouse: ['The ravine on Knot Hill. The Tether will get you across.'],
    act1End: ['A boat. That\u2019s what we need. Tobin will know.'],
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
      morning: ['The lamp\u2019s gone green as sea-glass. Fish came up to look at it all night.', 'If more of that glass falls, I\u2019m going to need a bigger boat. Or a smaller sea.'],
    },
    wenna: {
      before: ['My bread won\u2019t rise today. Or it rises and keeps on rising. I\u2019ve had to tie a loaf down with string.', 'Take a roll up to the Keeper, would you? She forgets to eat when the sky\u2019s like this.', 'Smells like rain. Rain that smells of glass. Is that a thing?'],
      after: ['Did you see it fall? Like a star with somewhere to be.', 'I\u2019ll keep the oven lit tonight. Nobody should be alone in the dark.'],
      morning: ['First batch since the sky broke. They rose exactly right. I nearly cried.', 'Here, take a roll. Heroes need breakfast. So do apprentices.'],
    },
    pip: {
      before: ['Are you Maren\u2019s apprentice? Is that a real sword? Can I hold it? Can I\u2014 okay, no.', 'When I grow up I\u2019m going to keep the lamp too. Or be a dragon. Probably the lamp.', 'I hit a dummy once. It hit me back. Well, it fell on me.'],
      after: ['I\u2019m not scared. I\u2019m just standing very close to the well.', 'Did you fight them? What did they look like? Were they slimy? I bet they were slimy.'],
      morning: ['You went INSIDE the shard? And came OUT? Can I come next time? I\u2019ll be very small.', 'I\u2019m going to be your apprentice. The apprentice\u2019s apprentice. That\u2019s allowed.'],
    },
    ennis: {
      before: ['Ennis. I light the lamps. All of them, every evening, for forty years.', 'Wick, flame, glass, door. That\u2019s the whole job. Most people never notice.'],
      after: ['Did you see the sky? I lit every lamp twice. Didn\u2019t help, but it felt like something.'],
      morning: [
        'See the waystones? Old lanterns on stone posts, all over the island. The first keepers put them there.',
        'Light one and it remembers you. Then you can find your way back to it in a blink. Look on your map.',
        'There\u2019s one by the gate up on the Heights, one on Knot Hill, one at the edge of Whisperwood. Can\u2019t reach them all myself any more.',
      ],
    },
  },
  // Act 1: the gate, the caves, the Tether
  gateOpen: [{ who: '', text: 'The key turns with a groan. Beyond the wall, the wind smells of salt and old stone.' }],
  cavesEnter: [{ who: '', text: 'Cold air, the drip of water, and somewhere far below, something clicking.' }],
  tether: { name: 'Tether', line: 'A keeper\u2019s grapple on a line of sky-thread. Hold the sling button to choose it, then aim at a brass ring to cross a gap, or at a shell to pull it.' },
  smallKey: { name: 'Small key', line: 'It opens one locked door in these caves.' },
  bigKey: { name: 'Barnacle Key', line: 'A great key crusted with shells. It opens the guardian\u2019s door.' },
  oil: { name: 'Lamp oil', line: 'A whole cask of it, still sealed with the keepers\u2019 wax. Maren will be glad.' },
  heartUp: { name: 'Mother-of-pearl Heart', line: 'Your health grows by one heart.' },
  guardianCard: { name: 'Barnacle Mother', region: 'Guardian of Gullcliff Caves', line: 'Pull her shell away, piece by piece.' },
  guardianLines: [{ who: '', text: 'The pool heaves. A mountain of shell rises out of it, clicking with a hundred mouths.' }],
  guardianDown: [{ who: '', text: 'The shell cracks open. Inside, among a hundred years of pearls, the keepers\u2019 oil store.' }],
  lockedDoor: 'Locked. A small key would open it.',
  bossDoor: 'A great lock, crusted with shells.',
  gateStuck: 'The gate won\u2019t budge from this side.',
  leverHint: 'A brass ring hangs on the gate\u2019s chain, behind the bars.',
  boathouseArrive: [
    { who: '', text: 'The old boathouse. The doors are swollen shut with salt, and the slipway runs down into empty water.' },
    { who: '', text: 'Someone has carved a lighthouse into the door, and under it a word you can\u2019t read yet.' },
  ],
  roundEnd: 'You have reached the edge of this build. The sea opens in the next one.',
  // keepsakes: odd little things only the apprentice notices
  keepsakes: {
    spoon: { name: 'A spoon that is always warm', line: 'Why would anyone leave a spoon up here? It is warm, as if someone just put it down.' },
    crust: { name: 'A crust that never goes stale', line: 'Bread, out on the Flats. It smells like Wenna\u2019s, but it isn\u2019t hers.' },
    cup: { name: 'A chipped cup', line: 'Blue-rimmed, chipped on one side. You know exactly where your thumb goes.' },
  },
  keepsakeSet: 'Breakfast',
  keepsakeHint: 'Three odd things. They feel like they belong together, somewhere near the lamp.',
  remember: [
    { who: '', text: 'You set the cup, the spoon and the crust down on the lamp-room sill. For a moment the room smells of breakfast.' },
    { who: '', text: 'Below, behind the cottage, something unfolds that was always there.' },
  ],
  remembered: { name: 'A memory: Breakfast', line: 'Your health grows by one heart. Behind the cottage stands a little kitchen nobody built.' },
  // waystones
  waystoneLit: 'The waystone remembers this place. Travel here from the map.',
  waystoneHint: 'Lantern waystones: light them, then tap them on the map to travel.',
  // going to sleep in Maren's cottage
  sleep: [{ who: '', text: 'The cottage smells of lamp oil and salt. You sleep with the heart-glass under your pillow, and it hums all night.' }],
  // the end of the Prologue, up on the lighthouse gallery. Each beat runs, then its lines are said.
  ending: {
    place: [
      { who: 'maren', text: 'Here. Set it in the lamp. Gently. It remembers being a heart.' },
    ],
    lamp: [
      { who: '', text: 'The lamp drinks the light. Its beam turns the colour of the sea under the Orchard.' },
      { who: 'maren', text: 'There. One splinter, home again. The lamp keeps it now.' },
      { who: 'maren', text: 'Every piece that falls is a world, apprentice. Somebody has to carry them back.' },
    ],
    stitch: [
      { who: '', text: 'High above, the crack draws in a little, like a wound remembering how to close.' },
    ],
    blur: [
      { who: '', text: 'Then something presses against it from the other side. A smear, grey as unwet paint, with no colour in it at all.' },
      { who: 'maren', text: '\u2026No. Not yet. You stay where I left you.' },
      { who: 'maren', text: 'Forget you heard that.' },
    ],
    rain: [
      { who: '', text: 'The sky answers. All along the horizon, glass begins to fall.' },
    ],
    after: [
      { who: 'maren', text: 'Well. That\u2019s the end of quiet, then.' },
      { who: 'maren', text: 'Lanternhold needs a keeper who can walk through doors. I\u2019m too old, and you\u2019re too stubborn to say no.' },
      { who: 'maren', text: 'Get some breakfast. Tomorrow, you start properly.' },
    ],
  },
  endCard: {
    kicker: 'Riftfall',
    title: 'End of the Prologue',
    line: 'The sky over Lanternhold is still breaking. Somewhere behind it, a world without colour is waiting.',
  },
  riftLines: {
    enter: [{ who: '', text: 'Cold water, and no water at all. You can breathe. Fruit trees sway in a current you can\u2019t feel.' }],
    treasure: 'A Seaglass Heart: your health grows by one heart',
    guardian: [{ who: '', text: 'Something hangs from the dark above, upside down, weeping. Its tears rise.' }],
    guardianCard: { name: 'The Weeping Gardener', region: 'Guardian of the Drowned Orchard', line: 'It still tends a world that is gone.' },
    cleared: [{ who: '', text: 'The orchard goes still. Where the Gardener hung, a heart of glass is left, glowing.' }],
  },
};

// ----- the light at evening and at night (game.js blends between them) -----
export const TIMES = {
  evening: { zenith: '#1d1b4a', mid: '#5b4a8f', horizon: '#f2a37a', glow: '#ffd29a', fog: '#8f7aa8', sun: '#ffc48a', sunI: 3.6, hemiSky: '#aab4e4', hemiGround: '#6b5a48', hemiI: 1.3, grade: [1.04, 0.99, 0.97] },
  day: { zenith: '#3f7fd0', mid: '#86b6e6', horizon: '#d6e6f0', glow: '#fff2d0', fog: '#a6c2da', sun: '#fff1d6', sunI: 3.3, hemiSky: '#cfe2f7', hemiGround: '#7a6a52', hemiI: 1.35, grade: [1.0, 1.0, 1.0] },
  dawn: { zenith: '#5a78bd', mid: '#a7a0d2', horizon: '#ffc59e', glow: '#ffe2b4', fog: '#b4aed4', sun: '#ffd9ae', sunI: 3.1, hemiSky: '#c3d2f2', hemiGround: '#7a6a58', hemiI: 1.4, grade: [1.03, 1.0, 0.99] },
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
  // the title screen and menus
  title: 'Riftfall',
  titleSub: 'Prologue \u00b7 The Shattered Sky',
  newConfirm: 'Begin a new journey? Your saved one will be replaced.',
  saved: 'Saved',
  rested: 'You rest by the fire. Your hearts are full again.',
  hintRun: 'Tap the boot to run \u00b7 tap again to walk',
  morning: { name: 'First Light', region: 'Lanternhold', line: 'The sky did not mend in the night.' },
};
