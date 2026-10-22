/* Riftfall — data.js
   Numbers, names and tuning. Everything you might want to tweak without touching game logic lives here. */

export const VERSION = '0.10.3';

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
  // the glass-tempered sword from the Kiln: heavier, longer, and its spin leaves a ring of hot glass light
  glassblade: {
    name: 'Cinderglass Blade',
    kind: 'melee',
    desc: 'Skyglass tempered in the Kiln\u2019s fire. It rings when it cuts, and it doesn\u2019t chip.',
    combo: [
      { dmg: 14, arc: 135, range: 2.25, windup: 0.15, active: 0.1, recover: 0.33, swing: 'right' },
      { dmg: 14, arc: 135, range: 2.25, windup: 0.13, active: 0.1, recover: 0.33, swing: 'left' },
      { dmg: 32, arc: 230, range: 2.7, windup: 0.24, active: 0.14, recover: 0.5, swing: 'spin', heavy: true },
    ],
    comboReset: 0.6,
    knock: 2.8,
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

// ----- Cinderglass's rule: hot ground hurts if you stay on it. Heat builds while you stand there and cools off it.
export const HEAT = { build: 0.5, cool: 0.7, dmg: 1, after: 0.55, cooled: 14 };   // per second; damage when full; heat left after; seconds the Jar cools a patch

// ----- Odda's forge on Lanternhold: Skyglass slivers buy upgrades
export const UPGRADES = {
  bladeEdge: { name: 'Temper the blade', desc: 'Your sword hits a quarter harder.', cost: 60, needs: 'glassblade' },
  tetherLong: { name: 'Longer Tether', desc: 'The Tether reaches a third further.', cost: 35, needs: 'tether' },
  jarWide: { name: 'Wider Jar', desc: 'The Tide Jar\u2019s splash spreads half as wide again.', cost: 35, needs: 'jar' },
  slingTwin: { name: 'Twin drops', desc: 'The sling throws two drops at once.', cost: 45, needs: 'sling' },
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
  bubblebishop: {
    name: 'Bubble Bishop',
    desc: 'A drowned priest who never stopped preaching. Its sermon is a bubble, and the bubble turns blades.',
    hp: 26, r: 0.5, dmg: 1, speed: 1.1,
    hover: 1.1, keep: [3.5, 6],
    every: [2.6, 3.4],     // seconds between its bubble sermons
    tell: 0.7,
    bubbles: 3, bubbleSpeed: 2.6, bubbleLife: 3.6,
    bare: 4.5,             // seconds before a popped shield bubble grows back
    knockTaken: 0.7,
    drops: [2, 3],
  },
  rustgill: {
    name: 'Rustgill Knight',
    desc: 'A fish in a rusted helm, sworn to a drowned lord. It hides behind a shield made from a ship\u2019s wheel.',
    hp: 48, r: 0.6, dmg: 1, speed: 1.5,
    turn: 2.2, guard: 70,  // its shield blocks hits from this many degrees either side of straight ahead
    reach: 2.0, tell: 0.6, thrust: 0.22, rest: 0.9,
    knockTaken: 0.4,
    drops: [3, 4],
  },
  mudmimic: {
    name: 'Mud Mimic',
    desc: 'A puddle of harbour mud with a mouth in it. It waits. Wash it out and it can\u2019t hide.',
    hp: 30, r: 0.55, dmg: 1, speed: 2.0,
    bite: 1.4,             // it snaps at you from hiding when you come this close
    bare: 6,               // seconds it stays washed out before it gathers itself again
    knockTaken: 0.6,
    drops: [2, 4],
  },
  bellringer: {
    name: 'The Drowned Bellringer',
    desc: 'She rang the Belfry\u2019s bell every hour for three hundred years, and she has not stopped because she drowned.',
    hp: 320, r: 2.0, dmg: 1, speed: 0,
    heat: 2.2,             // seconds it takes her bell to glow hot enough to crack
    hot: 5.5,              // how long it stays hot (pour the Jar on it then)
    stun: 4.5,             // how long she's out from under the bell after it cracks
    every: [2.2, 1.7],
    wave: 9,
    knockTaken: 0,
    drops: [18, 22],
  },
  pendulum: {
    name: 'Pendulum Hawker',
    desc: 'A market stall that learned to walk. It swings its pendulum at anyone who won\u2019t buy.',
    hp: 40, r: 0.6, dmg: 1, speed: 1.6,
    reach: 2.3, tell: 0.7, swing: 0.45, rest: 0.8,  // it draws its pendulum back (the warning), then swings it through an arc
    knockTaken: 0.5,
    drops: [3, 5],
  },
  hourglass: {
    name: 'Hourglass Imp',
    desc: 'Two bulbs of glass with legs, and sand that runs the wrong way. It blinks about and throws slow-time at you.',
    hp: 22, r: 0.45, dmg: 1, speed: 2.2,
    blink: [2.0, 3.2],     // seconds between little teleports
    tell: 0.6, sand: 2.6,  // it turns itself over (the warning), then throws a patch of sand that slows you for this long
    knockTaken: 0.9,
    drops: [2, 3],
  },
  cuckoo: {
    name: 'Cuckoo Clock',
    desc: 'A clock on a post that keeps the wrong time. Its door bangs open and a wooden bird comes for you.',
    hp: 30, r: 0.55, dmg: 1, speed: 0,
    every: [2.4, 3.4], tell: 0.55, open: 1.6,   // the door rattles (the warning), opens, the bird flies; it's soft while open
    bird: 5.5, birdLife: 3.0,
    knockTaken: 0,
    drops: [3, 4],
  },
  broker: {
    name: 'The Hour Broker',
    desc: 'It buys hours and sells minutes. Its chest is a clock under glass, and the glass only opens when time stops.',
    hp: 360, r: 1.4, dmg: 1, speed: 1.2,
    every: [2.2, 1.6],     // seconds between attacks, by phase
    sweep: 7.5,            // how long the minute hand that sweeps the floor is
    coins: [5, 7],         // coins in a volley
    knockTaken: 0,
    drops: [20, 24],
  },
  hound: {
    name: 'Glass Hound',
    desc: 'A dog blown out of green bottle-glass. It barks like something breaking, and it lunges.',
    hp: 30, r: 0.5, dmg: 1, speed: 3.0,
    tell: 0.5, lunge: 0.32, lungeSpeed: 11, rest: 0.7,   // it crouches (the warning), then lunges straight at you
    knockTaken: 0.8,
    drops: [2, 4],
  },
  molten: {
    name: 'Molten Puddle',
    desc: 'A slow bright puddle of molten glass that lives in the rivers. Cool it and it sets, solid enough to stand on.',
    hp: 60, r: 0.6, dmg: 1, speed: 1.1,
    every: [2.6, 3.6], tell: 0.6,                        // it bulges (the warning), then flicks a glob of hot glass at you
    knockTaken: 0,
    drops: [0, 1],
  },
  wisp: {
    name: 'Ember Wisp',
    desc: 'A spark that got loose from a furnace. It drifts about and drops embers that heat the ground.',
    hp: 16, r: 0.4, dmg: 1, speed: 1.8, hover: 1.4,
    every: [2.4, 3.2], tell: 0.5,
    knockTaken: 0.9,
    drops: [1, 3],
  },
  sentinel: {
    name: 'Mirror Sentinel',
    desc: 'A statue with a mirror for a face. It throws sling shots straight back, and when it catches the light it fires it.',
    hp: 54, r: 0.6, dmg: 1, speed: 0.9, turn: 1.6,
    tell: 0.8, beam: 9, beamT: 0.35, rest: 1.4,          // its mirror brightens (the warning), then a line of light
    knockTaken: 0.3,
    drops: [3, 5],
  },
  golem: {
    name: 'The Kiln Golem',
    desc: 'The Kiln\u2019s own furnace, stood up and walking. Its brick turns every tool. Only a blade, at the right moment, gets in.',
    hp: 420, r: 1.6, dmg: 1, speed: 1.3,
    every: [2.0, 1.5],
    open: 1.7,             // after a slam its core lies open this long
    armour: 0.2,           // how much of a blow gets through when it isn't open
    wave: 8,
    knockTaken: 0,
    drops: [20, 26],
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
  jar: {
    name: 'Tide Jar', desc: 'A jar that holds a little piece of the sea. Scoop up water, then pour it where it\u2019s needed.',
    reach: 1.8, splash: 1.7, cooldown: 0.5,
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

// ----- the Sunken Belfry: the second legacy dungeon. Same map letters as Gullcliff Caves, plus:
//   ,  sunken floor (dry at low water, too deep at high)    a b  stairs down into it
//   F  a floating crate (rides the water up, a stepping stone at high water)
//   W  the Tide Bell: strike it to turn the water high or low   ~  a pool (scoop from it)
//   i  burning oil (pour water on it)   o  a dry basin   Q  the water-wheel door it turns
//   u  bubble bishop   g  rustgill knight   M  mud mimic
export const BELFRY = {
  name: 'The Sunken Belfry',
  region: 'Under the drowned square of Brinemoor',
  line: 'Its bell has rung beneath the water every hour since the sky broke.',
  theme: 'belfry',
  ambush: { x0: 8, z0: 1, x1: 30, z1: 5 },
  water: { high: -0.08, low: -1.6, start: 'high' },
  keepsake: 'button', boss: 'bellringer', tool: 'jar',
  map: [
    '################################################################',
    '########.t...................t.#################################',
    '########............g..........#################################',
    '########.....u........s.....K..#######..t..#####################',
    '########..........s.....u......#####.........###################',
    '########.t...................t.####~.........~##################',
    '###############dd#################.............#################',
    '###############..#################.............#################',
    '###############..################...............################',
    '###############QQ################.t...........t.################',
    '########t........o.....##########.......X.......################',
    '########.~~...........t##########...............################',
    '########.~~.......M....##########...............################',
    '########...............###########.............#################',
    '########....M..........###########.............#################',
    '########............p..############~.........~##################',
    '########t.............t#######...............###################',
    '########...............#######......##..t..#####################',
    '##################...#########......############################',
    '##################...#########...###############################',
    '##################iii#########...###############################',
    '##################...#########...###############################',
    '##################...#########...###############################',
    '##################...#########BBB###############################',
    '##################...........................###################',
    '##################.t..................,,::c:.###################',
    '####,,,,,,,,######..p.................FF::::.##########.......##',
    '###,k,,,,,,,,#####....................,,::::.##########t.....t##',
    '###,,,,,,,,,,#####.......,,,,,,,,,,,,,.......##########.......##',
    '###,,,,,,m,,,#####.......,,,,,,,,,,,,,.......##########...T...##',
    '###,,,,,,,,,,ab.......r..,,,,,,,,,,,,,..r....###,,,,###.......##',
    '###,,,,,,,,,,ab..........,,,,,,W,,,,,,..........FFFF..D.......##',
    '###,,,,,,,,,,ab..........,,,,,,,,,,,,,..........FFFF..D.......##',
    '###,,,m,,,,,,#####.......,,,,,,,,,,,,,..........FFFF..D.......##',
    '###,,,,,,,,,,#####....r..,,,,,,,,,,,,,..r....###,,,,###..g....##',
    '###,,,,,,,,,,#####.......,,,,,,,,,,,,,.......##########....~~.##',
    '###,,u,,,,,,,#####...........aaaaa...........##########....~~.##',
    '###,,,,,,,,p,#####...........bbbbb........p..##########tp....t##',
    '####,,,,,,,,######.tu......................t.##########.......##',
    '##################...........................###################',
    '##############################...###############################',
    '##############################...###############################',
    '##############################...###############################',
    '##############################...###############################',
    '#########################.............##########################',
    '#########################.t.........t.##########################',
    '#########################....m...m....##########################',
    '#########################...........p.##########################',
    '#########################..r.......r..##########################',
    '#########################.............##########################',
    '#########################.............##########################',
    '#########################.t....P....t.##########################',
    '#########################...p.....p...##########################',
    '##############################...###############################',
    '##############################EEE###############################',
    '################################################################',
  ],
};

// ----- Brinemoor: a fishing town on stilts over its own drowned older town
//   ~ sea   , sand   = boardwalk   . drowned street   1 2 3 stairs   H house   R ruin   Z the Belfry's tower
//   B the Belfry door   D the pier   P where the boat ties up   g grass   # rock   L the old light
//   T the tide post   h Hale   j Jun   q Peg   l lamp   b J keepsakes   M mud mimic   m mirrorpuddle
export const BRINEMOOR = {
  name: 'Brinemoor',
  region: 'The Glass Sea',
  line: 'Built on stilts over the town it used to be.',
  map: [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DPD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~,,,,,,,DDD,,,,,,,,~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~,,,,,,,,,DDD,,,,,,,,,,~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~==========================================~~~~~~~~~',
    '~~~~~~~~~===HHHHHH================HHHHHH==HHHHHH===~~~~~~~~~',
    '~~~~~~~~~===HHHHHH================HHHHHH==HHHHHH===~~~~~~~~~',
    '~~~~~~~~~===HHHHHH================HHHHHH==HHHHHH===~~~~~~~~~',
    '~~~~~~~~~=========h================================~~~~~~~~~',
    '~~~~~~~~~====l============l=====T===q=======l======~~~~~~~~~',
    '~~~~~~~~~==========================================~~~~~~~~~',
    '~~~~~~~~~==========.........333.........===========~~~~~~~~~',
    '~~~~~~~~~==========.........222.........=====HHHHH=~~~~~~~~~',
    '~~~~~~~~,=HHHH=====.........111.........=====HHHHH=,~~~~~~~~',
    '~~~~~~~~,=HHHH=====...RRRR..............=====HHHHH=,~~~~~~~~',
    '~~~~~~~,,=HHHH=====...RRRR.....ZZZZZ.123=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,=HHHH=====...RRRR.....ZZZZZ.123=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,=HHHH=====............ZZZZZ.123===========,,~~~~~~~',
    '~~~~~~~,,==========.......M....ZZZZZ....===========,,~~~~~~~',
    '~~~~~~~,,========j=321.........ZZZZZ....===========,,~~~~~~~',
    '~~~~~~~,,=l========321...........B......=========l=,,~~~~~~~',
    '~~~~~~~,,==========321..................===========,,~~~~~~~',
    '~~~~~~~,,==========......f.......RRR....===========,,~~~~~~~',
    '~~~~~~~,,=HHHH=====...........m..RRR....===========,,~~~~~~~',
    '~~~~~~~,,=HHHH=====..m...........RRR....=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,=HHHH=====....J................=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,=HHHH=====.........111.....M...=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,=HHHH=====.........222.........=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,==========.........333.........=====HHHHH=,,~~~~~~~',
    '~~~~~~~,,==========================================,,~~~~~~~',
    '~~~~~~~,,==================l===l===================,,~~~~~~~',
    '~~~~~~~~,==========HHHHHH=========HHHHHH===========,~~~~~~~~',
    '~~~~~~~~,==========HHHHHH=========HHHHHH===========,~~~~~~~~',
    '~~~~~~~~~====l=====HHHHHH=========HHHHHH=====l=====~~~~~~~~~',
    '~~~~~~~~~==========HHHHHH=========HHHHHH=========b=~~~~~~~~~',
    '~~~~~~~~~==========================================~~~~~~~~~',
    '~~~~~~~~~~~,,ggggggggggggggggggggggggggggggggg,,,~~~~~~~~~~~',
    '~~~~~~~~~~~~,ggggggggggggggggggggggggggggggggg,,~~~~~~~~~~~~',
    '~~~~~~~~~~~~~ggggggggggggggggggggggggggggggggg,~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~ggggggggggggggggLgggggggggggggggg~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~ggggggggggggggggggggggggggggggggg~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~###################################~~~~~~~~~~~~~',
    '~~~~~~~~~~~~###################################~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
};

// ----- the Glass Sea: the sea chart, with every island on it (a sea unit is four of an island's blocks)
export const SEA = {
  name: 'The Glass Sea',
  line: 'Every wave catches a little of the broken sky.',
  half: 260,
  islands: [
    { id: 'lanternhold', name: 'Lanternhold', x: 0, z: 0, dock: { x: 6.6, z: 14 }, open: true },
    { id: 'brinemoor', name: 'Brinemoor', x: -130, z: 150, dock: { x: -129.5, z: 134 }, open: true },
    { id: 'bellrock', name: 'Bell Rock', x: 72, z: 128, dock: { x: 72.5, z: 111 }, risen: true },
    { id: 'cinderglass', name: 'Cinderglass Atoll', x: 150, z: 96, r: 16, dock: { x: 149.75, z: 79 }, locked: 'A ring of boiling water keeps you off. Not yet.', opens: 'act1Cinder' },
    { id: 'saltglass', name: 'Saltglass Flats', x: -190, z: -40, r: 22, locked: 'The shallows are full of rocks you can\u2019t see. Not yet.' },
    { id: 'choir', name: 'The Hushed Choir', x: 40, z: -180, r: 14, locked: 'A wall of fog that hums. Your sail goes slack. Not yet.' },
  ],
  // currents: they carry the boat along (the first runs most of the way to Brinemoor)
  currents: [
    { x0: -14, z0: 34, x1: -104, z1: 112, w: 11, speed: 4 },
    { x0: 70, z0: -30, x1: 130, z1: 60, w: 12, speed: 6 },
    { x0: -120, z0: 30, x1: -160, z1: -40, w: 10, speed: 5 },
  ],
  speed: 7.5, turn: 1.6, hop: 0.6,
};

// ----- Bell Rock: a rock that wasn't there, risen when the Clocktide Market closed. A great bell hangs on top.
//   ~ sea   , sand   m g 4 5 6 the rock, in half-block steps up   # cliff   D pier   P where the boat ties up
//   K the bell under its arch   r rocks
export const BELLROCK = {
  key: 'bellrock',
  name: 'Bell Rock',
  region: 'The Glass Sea',
  line: 'It rose out of warm water, already old.',
  heights: { D: 1.35, P: 1.35, m: 1.35, g: 1.85, 4: 2.35, 5: 2.85, 6: 3.35, K: 3.35, r: 0.85 },
  map: [
    '~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~DPD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~,,DDD~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~,,,,,,,,~~~~~~~~~~~~~',
    '~~~~~~~~~~~~,,m,mmmm,,r,~~~~~~~~~~',
    '~~~~~~~~~,,,,mmmmmmmmmm,,~~~~~~~~~',
    '~~~~~~~~,,,mmmmmggggmmmm,,,~~~~~~~',
    '~~~~~~~,,,mmgggggggggggmmr,,~~~~~~',
    '~~~~~~~,,,mgggg4444ggggmmm,,~~~~~~',
    '~~~~~~,,,rmggg4454444ggmmmm,~~~~~~',
    '~~~~~~,,,mggg445555554gggm,,,~~~~~',
    '~~~~~~,,mmggg455666654gggm,,,~~~~~',
    '~~~~~~,,mmgg44556K66544ggm,,,~~~~~',
    '~~~~~~~,mmgg44555665444ggmm,,~~~~~',
    '~~~~~~~,mmmg4445555544ggmmm,,~~~~~',
    '~~~~~~~,,mmgg44455544gggmmm,,~~~~~',
    '~~~~~~~,,,mmggg44444gggmmm,,~~~~~~',
    '~~~~~~~,,,mmrmggggggg####,,~~~~~~~',
    '~~~~~~~~~,mmmmmggg######,,,~~~~~~~',
    '~~~~~~~~~,,,,mmmm#####,,,,~~~~~~~~',
    '~~~~~~~~~~,,,,mmm,##,,,,,~~~~~~~~~',
    '~~~~~~~~~~~~~,,,,,,,,~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~,,,~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
};

// ----- Cinderglass Atoll: glassblowers on a sleeping volcano. Its rule: hot ground hurts if you stay on it.
//   ~ sea   , black sand   = the basalt plaza   a b c C the volcano, in half-block steps up   v molten glass
//   h hot ground   D pier   P where the boat ties up   H workshops   F furnaces   G glass racks   U quench troughs
//   l lamps   o Odda   n Brann   Y the Kiln's mouth   w glass hound   e ember wisp
export const CINDER = {
  key: 'cinder',
  name: 'Cinderglass Atoll',
  region: 'The Glass Sea',
  line: 'Glassblowers on a sleeping mountain. The air shivers over the stones.',
  theme: 'cinder',
  heights: { D: 1.35, P: 1.35, '=': 1.35, ',': 0.85, a: 1.35, b: 1.85, c: 2.35, C: 2.85, v: 0.6, h: 1.35, Y: 1.35, H: 1.35, F: 1.35, G: 1.35, U: 1.35, l: 1.35, o: 1.35, n: 1.35 },
  map: [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DPD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDD~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~===========DDD=============~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~=HHHHH==================HHHHH==~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~==HHHHHF==l==========l==FHHHHH===~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~==HHHHH=====U=====U======HHHHH===~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~==HHHHH==o=============n=HHHHH===~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~=================================~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~,=====l==HHHH=========HHHH==l=====~~~~~~~~~~~~~',
    '~~~~~~~~~~~~,,,=======HHHH=G=====G=HHHH=======,,~~~~~~~~~~~~',
    '~~~~~~~~~~~~,,,,,=====HHHH=========HHHH=====,,,,,~~~~~~~~~~~',
    '~~~~~~~~~~~,,,,,,,,,U,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~~~~~~~~',
    '~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~~~~~~~',
    '~~~~~~~~~,,,,,,,,,,hhh,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~~~~~',
    '~~~~~~~~,,,,,,,,,hhhhehh,,,,,aaaa,,,,,,,,,,,,,,,,,,,,~~~~~~~',
    '~~~~~~~~,,,,,,,,hhhhhhhhhaaaaaaaaaaa,,,,,,,,,,,,,,,,,,~~~~~~',
    '~~~~~~~,,,,,,,,hhhhhhhhhhhaaaaaaaaaaaaa,,,,,,,,,,,,,,,~~~~~~',
    '~~~~~~~,,,,,,,,hhhhhhhhhhhaaaabbaaaaaaaa,,,,,,,,,,,,,,~~~~~~',
    '~~~~~~~,,,,,,,,,hhhhhhhhhaabbbbbbbbbaaaaw,,,,,,,,,,,,,~~~~~~',
    '~~~~~~,,,,,,,,,,,hhhhhhhbbbbbbbbbbbbbbaaaaa,,,,,,,,,,,,~~~~~',
    '~~~~~~,,,,,,,,,,,,ahhhbbbbbbbbbbbbbbbbbaaaaa,,,,,,,,,,,~~~~~',
    '~~~~~,,,,,,,,,,,,aaaYabbbbccccccccbbbbbaaaaa,,,,,,,,,,,,~~~~',
    '~~~~~,,,,,,,,,,,,aaabbbbbcccccccccccbbbbaaaa,,,,,,,,,,,,~~~~',
    '~~~~~,,,,,,,,,,,aaaabbbbcccCCCCCCCcccbbbbaaaa,,,,,,,,,,,,~~~',
    '~~~~~,,,,,,,,,,,aaabbbbbccCCCCCCCCCcccbbbbaaw,,,,,,,,,,,,~~~',
    '~~~~~,,,,,,,,,,aaaabbbbccCCCvvvvvvCCcccbbbaaa,,,,,,,,,,,,~~~',
    '~~~~~,,,,,,,,,waaabbbbcccCCvvvvvvvCCcccbbbaaaa,,,,,,,,,,,~~~',
    '~~~~,,,,,,,,,,,aaabbbbccCCvvvvvvvvCCccccbbbaaa,,,,,,,,,,~~~~',
    '~~~~,,,,,,,,,,,aaabbbbccCCvvvvvvvvCCcccbbbbaaa,,,,,,,,,,~~~~',
    '~~~~,,,,,,,,,,,aaabbbbccCCvvvvvvvvCCcccbbbaaaa,,,,,,,,,,~~~~',
    '~~~~,,,,,,,,,,,aaaabbbccCCCvvvvvvvCCcccbbbaaaa,,,,,,,,,,~~~~',
    '~~~~~,,,,,,,,,,aaaabbbbccCCCvvvvvCCCcccbbbaaaa,,,,,,,,,,~~~~',
    '~~~~~~,,,,,,,,,aaaaabbbccccCCCvvCCCcccbbbaaaa,,,,,,,,,,,~~~~',
    '~~~~~~~,,,,,,,,,aaaabbvbccccCCCCCcccccvbbaaaa,,,,,,,,,,~~~~~',
    '~~~~~~~,,,,,,,,,aaaabvvvbccccccccccccvvvbaaaa,,,,,,,,,~~~~~~',
    '~~~~~~~,,,,,,,,,,aaavvvbbbbccccccbbbbbvvvvaa,,,,,,,,,~~~~~~~',
    '~~~~~~~,,,,,,,,,,,avvvbbbbbbbbbbbbbbbbavvvva,,,,,,,,,~~~~~~~',
    '~~~~~~~,,,,,,,,,,,,vvvabbbbbbbbbbbbbbaaavvvv,,,,,,,,,~~~~~~~',
    '~~~~~~~,,,,,,,,,,vvvvaaaaabbbbbbbbbbaaaaa,vvv,,,,,,,,~~~~~~~',
    '~~~~~~~~~,,,,,,,vvvv,aaaaaaabbaaaaaaaaaa,,vvv,,,,,,,~~~~~~~~',
    '~~~~~~~~~~,,,,,vvvv,,,,aaaaaaaaaaaaaaa,,,,,vvv,,,,,~~~~~~~~~',
    '~~~~~~~~~~~,,,vvv,,,,,,,,aaaaaaaaaaa,,,,,,,,vvv,,,~~~~~~~~~~',
    '~~~~~~~~~~~~,vvv,,,,,,,,,,,,,,,,,,,,,,,,,,,,,vvvv~~~~~~~~~~~',
    '~~~~~~~~~~~~~vvv,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,vv~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,v~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,,,,,,,~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,,,~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,,,,,~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,~~~~,~~~~~~~~~~~~~~~~~~~~~~~',
  ],
};

// ----- the Kiln: a short legacy dungeon in the volcano's flank. Same letters as Gullcliff Caves, plus:
//   v molten glass (no crossing it; cool a Molten Puddle in it to make a stepping stone)   h hot ground   ~ a quench trough
//   O molten puddle   w glass hound   e ember wisp   y mirror sentinel   T the Cinderglass Blade's chest
export const KILN = {
  name: 'The Kiln',
  region: 'In the flank of Cinderglass',
  line: 'Three hundred years of fire, and none of it has gone out.',
  theme: 'kiln',
  ambush: { x0: 34, z0: 3, x1: 44, z1: 17 },
  boss: 'golem', tool: 'glassblade',
  map: [
    '################################################',
    '################################################',
    '################################################',
    '##################################t.........t###',
    '##################################........K..###',
    '##################################....hh.....###',
    '######.t..########################..y........###',
    '####........######################...........###',
    '###~.........t####################.....w.....###',
    '###..........#####t.........t#####...........###',
    '##............####...........#####.......y...###',
    '##t....X......####.....T.....#####....hhh....###',
    '##...............B...............d...........###',
    '##...............B..r.....r......d...........###',
    '###..........#####...........#####...y.......###',
    '###.........~#####...........#####.........w.###',
    '####........######t.........t#####...........###',
    '######.t..############DDD#########t.........t###',
    '######################...#######################',
    '##########t.........................t###########',
    '##########..k....................e...###########',
    '##########...........................###########',
    '##########vvvvvvvvvvvvvvvvvvvvvvvvvvv###########',
    '##########vvvvOvvvvvvvvOvvvvvvvOvvvvv###########',
    '##########vvvvvvvvvvvvvvvvvvvvvvvvvvv###########',
    '##########...........................###########',
    '##########......p...........hh.......###########',
    '##########..~~....hh..............p..###########',
    '##########...........................###########',
    '##########t.........................t###########',
    '######################...#######################',
    '######################...#######################',
    '######################...#######################',
    '######################...#######################',
    '#################..............#################',
    '#################.t......p...t.#################',
    '#################...hh....w....#################',
    '#################...hh....hh...#################',
    '#################....w....hh...#################',
    '#################..p........~..#################',
    '#################.t.........~t.#################',
    '#################......P.......#################',
    '######################...#######################',
    '######################...#######################',
    '######################EEE#######################',
    '################################################',
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

// ----- the Clocktide Market: the Rift in the warm water by Bell Rock. A night market where time is the coin.
// Its rule: the great clock strikes every few seconds, and for a moment time stops for everyone but you.
export const MARKET = {
  name: 'The Clocktide Market',
  line: 'Lanterns, awnings, and a clock in every window. All of them are wrong.',
  theme: 'market',
  rooms: 8,
  roomW: 16, roomD: 12,
  strike: { every: 8.5, stop: 1.7, warn: 2.2 },   // the clock strikes this often; time stands still this long; it ticks loud before
  guardian: 'broker',
  waves: [
    [['hourglass', 'mirrorpuddle', 'mirrorpuddle']],
    [['pendulum', 'hourglass']],
    [['cuckoo', 'shardmite', 'shardmite'], ['hourglass', 'hourglass']],
    [['pendulum', 'cuckoo'], ['hourglass', 'shardmite', 'shardmite']],
    [['pendulum', 'pendulum', 'hourglass'], ['cuckoo', 'cuckoo']],
  ],
  // furniture: stalls (s), crates (c), clock posts (k), hanging lanterns (l), coin piles (p). Coordinates from the room centre.
  layouts: [
    [['s', -4.5, -2.5], ['s', 4.5, 2.5], ['c', -5.5, 3], ['c', 5.5, -3], ['l', 0, -4], ['l', -1, 4]],
    [['s', -5, 0], ['s', 5, 0], ['k', 0, -2.5], ['p', 0, 2.5], ['l', -3, -4], ['l', 3, 4]],
    [['p', 0, 0], ['c', -4, -3], ['c', 4, 3], ['s', -5.5, 3.5], ['k', 5, -4]],
    [['s', -3, -3], ['s', 3, 3], ['k', 3, -3], ['c', -3, 3], ['l', -6, 0], ['l', 6, 0]],
    [['k', -4, 0], ['k', 4, 0], ['c', 0, -4], ['c', 0, 4], ['l', -6, -4], ['l', 6, 4]],
  ],
  treasure: { slivers: 14, keepsake: 'watch' },
};

// ----- the people of Lanternhold -----
export const NPCS = {
  maren: { name: 'Maren', color: '#ffd29a', role: 'The Keeper' },
  tobin: { name: 'Tobin', color: '#f2c94c', role: 'Fisherman' },
  wenna: { name: 'Wenna', color: '#ff9f80', role: 'Baker' },
  pip: { name: 'Pip', color: '#9fd8ff', role: 'Trouble' },
  ennis: { name: 'Ennis', color: '#e8d48a', role: 'Lamplighter' },
  hale: { name: 'Hale', color: '#9fd8c8', role: 'Harbour-master' },
  jun: { name: 'Jun', color: '#ffb38a', role: 'Diver' },
  peg: { name: 'Peg', color: '#e8a0c0', role: 'Innkeeper' },
  odda: { name: 'Odda', color: '#ffb070', role: 'Glassblower' },
  brann: { name: 'Brann', color: '#d8c0a0', role: 'Glassblower' },
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
    findTobin: 'Tell Tobin about the old boathouse',
    setSail: 'Board the boat at the dock and sail south-west to Brinemoor',
    brinemoor: 'Find Brinemoor\u2019s harbour-master',
    belfry: 'Wait for low tide, then enter the Sunken Belfry in the drowned square',
    belfryIn: 'Silence the bell beneath Brinemoor',
    belfryBoss: 'Something rings the bell. Stop it',
    reportHale: 'Tell Hale the bell is silent',
    reportMaren2: 'Sail home and show Maren the page',
    act1Sea: 'Sail south-east of Lanternhold, to the warm water where the sea glows',
    market: 'Find the heart of the Clocktide Market',
    marketBoss: 'The Hour Broker keeps the market. Strike when time stands still',
    bellRock: 'Land on Bell Rock and ring its bell',
    reportMaren3: 'Sail home and tell Maren about Bell Rock',
    act1Cinder: 'Sail east to Cinderglass Atoll, now the water round it has calmed',
    cinder: 'Find the glassblowers\u2019 master, Odda',
    kiln: 'Cross the hot ground to the Kiln in the mountain\u2019s side',
    kilnIn: 'Find what the Kiln has been keeping',
    kilnBoss: 'The Kiln Golem. Tools won\u2019t touch it; only a blade will',
    reportOdda: 'Show Odda the blade',
    forgeHome: 'Find Odda\u2019s new forge in the village on Lanternhold',
    mirrorPool: 'Something fell on the Heights tonight. Go and look',
    act1Temple: 'The pool on the Heights is a mirror now, and it shows a lighthouse going down. (The Temple arrives in the next build.)',
  },
  // the Prologue in chapters, for the journal in the pause menu (each lists the steps it covers)
  chapters: [
    { name: 'The Keeper\u2019s Apprentice', steps: ['findMaren', 'practice', 'reportPractice'] },
    { name: 'The Dark Beacon', steps: ['beacon', 'dusk'] },
    { name: 'The First Riftfall', steps: ['toShard', 'seep', 'reportSeep'] },
    { name: 'The Drowned Orchard', steps: ['enterRift', 'rift', 'guardian', 'heartGlass', 'reportRift'] },
    { name: 'First Light', steps: ['rest', 'morning', 'ending'] },
    { name: 'Act 1 \u00b7 Gullcliff', steps: ['free', 'gullcliff', 'caves', 'cavesBoss', 'reportOil'] },
    { name: 'Act 1 \u00b7 The Boathouse', steps: ['boathouse', 'findTobin', 'setSail'] },
    { name: 'Act 1 \u00b7 Brinemoor', steps: ['brinemoor', 'belfry', 'belfryIn', 'belfryBoss', 'reportHale', 'reportMaren2'] },
    { name: 'Act 1 \u00b7 Bell Rock', steps: ['act1Sea', 'market', 'marketBoss', 'bellRock', 'reportMaren3'] },
    { name: 'Act 1 \u00b7 Cinderglass', steps: ['act1Cinder', 'cinder', 'kiln', 'kilnIn', 'kilnBoss', 'reportOdda', 'forgeHome'] },
    { name: 'Act 1 \u00b7 The Mirror Pool', steps: ['mirrorPool', 'act1Temple'] },
  ],
  // every step in order (saving and the journal use this)
  order: ['findMaren', 'practice', 'reportPractice', 'beacon', 'dusk', 'toShard', 'seep', 'reportSeep', 'enterRift', 'rift', 'guardian', 'heartGlass', 'reportRift', 'rest', 'morning', 'ending', 'free', 'gullcliff', 'caves', 'cavesBoss', 'reportOil', 'boathouse', 'findTobin', 'setSail', 'brinemoor', 'belfry', 'belfryIn', 'belfryBoss', 'reportHale', 'reportMaren2', 'act1Sea', 'market', 'marketBoss', 'bellRock', 'reportMaren3', 'act1Cinder', 'cinder', 'kiln', 'kilnIn', 'kilnBoss', 'reportOdda', 'forgeHome', 'mirrorPool', 'act1Temple'],
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
    findTobin: ['A boat. That\u2019s what we need. Tobin will know what to do with it.'],
    setSail: ['South-west, past the current. Brinemoor\u2019s bell used to carry all the way here on a still night.'],
    brinemoor: ['Brinemoor. Hale keeps the harbour there, if he\u2019s still as stubborn as he was.'],
    belfry: ['The Belfry. Go carefully.'],
    belfryIn: ['The Belfry. Go carefully.'],
    belfryBoss: ['The Belfry. Go carefully.'],
    reportHale: ['Hale will want to know.'],
    reportMaren2: [
      'You\u2019re back. And salt to the eyebrows. What\u2019s that you\u2019ve got?',
      '\u2026Give it here.',
      'That\u2019s my hand. My letters, my blots. I don\u2019t remember writing a word of it.',
      'A Weaver. Old keepers\u2019 stories, apprentice. Nothing more.',
      'Go and get some sleep. And keep the page. I don\u2019t want it in the house.',
    ],
    act1Sea: ['Bell Rock. Tobin says the water out there has been warm since the Belfry went quiet. South-east of here. I don\u2019t like warm water.'],
    market: ['Warm water and a light under it. Go carefully.'],
    marketBoss: ['Warm water and a light under it. Go carefully.'],
    bellRock: ['A rock that wasn\u2019t there yesterday. I heard its bell from the gallery. Go and see.'],
    reportMaren3: [
      'I heard it from here. One stroke, and every lamp in the village flickered.',
      'Bell Rock. My mother used to say it sank before she was born. Rocks don\u2019t sink, apprentice. And they don\u2019t come back.',
      'You saw something, didn\u2019t you. When the bell rang. Paper. Words where colours should be.',
      '\u2026I\u2019ve dreamed that. Long ago. Don\u2019t tell anyone.',
      'Tobin says the water round Cinderglass stopped boiling the moment it rang. The glassblowers will want to meet you. When they\u2019re ready.',
    ],
    act1Cinder: ['Cinderglass. The glassblowers keep to themselves. Odda most of all. Tell her I sent you; she may still owe me for a lamp.'],
    cinder: ['Odda runs the furnaces on Cinderglass. One hand, and better with it than most are with two.'],
    kiln: ['The Kiln? Mind the ground. If your boots smoke, move.'],
    kilnIn: ['The Kiln? Mind the ground. If your boots smoke, move.'],
    kilnBoss: ['The Kiln? Mind the ground. If your boots smoke, move.'],
    reportOdda: ['Show Odda what you found. She\u2019ll know what to do with it.'],
    forgeHome: [
      'There\u2019s a forge in the village. A forge, apprentice. Odda walked off Tobin\u2019s boat, looked at the old smithy and said \u201cthis will do\u201d.',
      'She says she can make your tools better, for Skyglass. Bring her slivers; she\u2019s worth every one.',
    ],
    mirrorPool: ['Did you see it fall? Something came down out of the crack, onto the Heights. Go and look. I\u2019ll be right behind you. Slowly.'],
    act1Temple: [
      'The pool. It\u2019s a mirror now, and the lighthouse in it goes down instead of up.',
      'I have seen that before. In the oldest of the keepers\u2019 books. They called it the Temple, and nobody who wrote about it went in twice.',
      'Not tonight. Sleep first. Whatever is down there has waited three hundred years; it can wait till morning.',
    ],
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
      after2: ['A boat at the dock again. Like the old days. I\u2019ll hang a lamp on the bow post for you.'],
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
  roundEnd: 'You have reached the edge of this build. More of the Glass Sea arrives in the next one.',
  // Act 1: the boat, the sea, Brinemoor and the Belfry
  tobinBoat: [
    { who: 'tobin', text: 'The old keepers\u2019 boathouse? Nobody\u2019s opened that door in thirty years.' },
    { who: 'tobin', text: 'There was a boat in there once. The Lantern. Fastest thing on the Glass Sea, and the only one that could find its way in fog.' },
    { who: 'tobin', text: 'Give me the afternoon. If her hull\u2019s sound, I\u2019ll have her at the dock by evening.' },
  ],
  tobinDone: [
    { who: 'tobin', text: 'She floats. Mostly. The sail\u2019s new, the lamp at the bow is old. It still lights.' },
    { who: 'tobin', text: 'Steer with your stick, or tap where you want to go. Tap the boot to hop, the sling still slings, and the chart\u2019s on your map.' },
    { who: 'tobin', text: 'Brinemoor\u2019s south-west. Follow the current and you\u2019ll be there before the tide turns.' },
  ],
  sail: 'Sail',
  dock: 'Dock',
  setSailCard: { name: 'The Glass Sea', region: 'Lanternhold waters', line: 'Every wave catches a little of the broken sky.' },
  boatHint: 'Steer with the stick or tap the sea \u00b7 the boot hops \u00b7 the map is your chart',
  hale: {
    brinemoor: [
      'Lanternhold colours on that sail. Maren\u2019s boat. Then you\u2019re her apprentice.',
      'Hale. Harbour-master, for what the harbour\u2019s worth these days.',
      'Since the sky broke, the old bell under the square has been ringing. Every hour, under the water. And every time it rings, the tide comes in wrong.',
      'Half my town\u2019s gone under twice this week. The other half won\u2019t sleep for the noise.',
      'The Belfry door is in the drowned square. You can only reach it at low tide. Jun knows the streets down there; ask her.',
      'If you can stop that bell, Brinemoor will owe you. If you can\u2019t, at least come back up.',
    ],
    belfry: ['Low tide, then the square. The tide post on the boardwalk will tell you when.'],
    reportHale: [
      'Listen. You hear that? Nothing. Three hundred years of bells, and nothing.',
      'The tide\u2019s turning right again. You did that.',
      'What\u2019s that you found down there? Paper, dry as bone. Under the sea.',
      'Keepers\u2019 writing. Take it to Maren. I don\u2019t want to be the one to read it.',
      'And come back when you like. There\u2019ll always be a bunk at Peg\u2019s for you.',
    ],
    after: ['The nets come up full again. Strange fish, mind. One of them was folded like paper.'],
  },
  jun: {
    before: [
      'You\u2019re going down there? Good. I\u2019ve been wanting someone mad enough.',
      'The tide post on the north boardwalk: sit there and you can wait for the water to go out. Or come in.',
      'At low tide the drowned square is dry enough to walk. Mind the puddles. Some of them have teeth.',
      'The Belfry\u2019s tower is in the middle of the square. Its door faces south.',
    ],
    after: ['I went down after you came up. The bell\u2019s cracked clean through. I never thought I\u2019d miss the noise.'],
  },
  peg: {
    before: ['Welcome to the Drowned Anchor. Best stew on the stilts. Only stew on the stilts.', 'If the bell wakes you, the rooms upstairs are higher. Not much higher.'],
    after: ['Quiet night last night. Folk didn\u2019t know what to do with themselves. I sold a lot of stew.'],
  },
  tidePost: 'Wait for the tide',
  tideOut: 'The tide goes out. The drowned square is dry.',
  tideIn: 'The tide comes in. The drowned square goes under.',
  belfryLines: {
    enter: [{ who: '', text: 'The door opens on air that hasn\u2019t moved in three hundred years. Far below, a bell tolls, and the water shivers.' }],
    tideHigh: 'The water rises',
    tideLow: 'The water drains away',
    jar: { name: 'Tide Jar', line: 'A jar that holds a piece of the sea. Hold the tool button to choose it. Use it by water to scoop, use it again to pour: douse flames, fill basins, wash things out of hiding.' },
    jarFull: 'The Jar is full',
    jarEmpty: 'Nothing to pour. Scoop up water first',
    doused: 'The flames hiss out',
    basin: 'The basin fills; somewhere, a wheel begins to turn',
    guardianCard: { name: 'The Drowned Bellringer', region: 'Guardian of the Sunken Belfry', line: 'Cool the bell, and she has nowhere to hide.' },
    guardian: [{ who: '', text: 'The great bell swings. Beneath it, something with long pale arms holds the rope, and has never once let go.' }],
    down: [{ who: '', text: 'The bell cracks from crown to lip. The ringing stops. In the silence, something drifts down from the rafters: a page, perfectly dry.' }],
    heart: { name: 'Bell-bronze Heart', line: 'Your health grows by one heart.' },
    page: { name: 'A page in Maren\u2019s hand', line: '\u201cEvery bell I hung was a lock, and every lock a lie I told the sky. The Weaver will come for what I took. Let them listen to the bells, and not to the lamp.\u201d' },
  },
  // Act 1: the Clocktide Market, Bell Rock rising, and the first glimpse of the Draft
  marketLines: {
    portal: 'Warm water, and a light under it',
    enter: [{ who: '', text: 'Awnings, lanterns and stalls, under a sky full of clock faces. Every one of them shows a different time.' },
      { who: '', text: 'Somewhere a great clock is winding up to strike.' }],
    strike: 'The clock strikes: time stands still for everyone but you',
    guardianCard: { name: 'The Hour Broker', region: 'Guardian of the Clocktide Market', line: 'It sells the minutes it has stolen.' },
    guardian: [{ who: '', text: 'At the end of the market, a tall thing with a clock for a heart counts coins it took from somewhere else.' },
      { who: '', text: 'Its glass only opens when the great clock strikes.' }],
    cleared: [{ who: '', text: 'The clocks stop, all at once, on the same minute. A bell-shaped glass is left where the Broker stood, ringing very softly.' }],
    treasure: 'Fourteen slivers, and a stopped watch',
  },
  rising: [
    { who: '', text: 'The warm water heaves. Something under it remembers which way is up.' },
  ],
  risenCard: { name: 'Bell Rock', region: 'The Glass Sea', line: 'It rose out of warm water, already old.' },
  bellRockLines: {
    arrive: [{ who: '', text: 'Wet stone, warm under your feet. At the top, a bell older than the lighthouse hangs in an arch of rock.' }],
    bell: [{ who: '', text: 'One stroke. The sound goes out over the sea and does not come back.' },
      { who: '', text: 'For a breath the world is paper. Words lie where colours should be. Where the sun should be, there is only a hole, waiting.' }],
    after: [{ who: '', text: 'Far to the east, a ring of steam round Cinderglass thins and falls still.' }],
    again: 'The bell hums under your hand. It has said what it had to say.',
  },
  // the first world, seen for a moment: words where colours should be (each label sits at a spot in the scene)
  glimpses: {
    rising: ['ROCK (old)', 'sea, warm', 'a bell goes here', 'up?'],
    bell: ['SKY (blue, not decided)', 'grass', 'stone', 'a sun goes here', 'you'],
  },
  // Act 1: Cinderglass, Odda, the Kiln, and the forge
  odda: {
    cinder: [
      'Maren\u2019s apprentice. On Maren\u2019s boat, wearing Maren\u2019s look. I owe her for a lamp; did she send you to collect?',
      'Odda. I run the furnaces. Ran. Since the sky broke the mountain\u2019s been waking, and the Kiln with it.',
      'The Kiln\u2019s where the old masters tempered skyglass. Nobody goes in now. Something in there kept the fire going three hundred years.',
      'You\u2019ve a skyglass blade on your hip and it\u2019s chipped. The Kiln could make it something better. If you come out.',
      'The Kiln\u2019s mouth is up the slope, past the hot ground. Fill your jar at the trough; the ground cools where it\u2019s wet.',
    ],
    kiln: ['The hot ground\u2019s in front of the Kiln. Don\u2019t stand on it. Pour the trough water and walk where it steams.'],
    reportOdda: [
      'Let me see. \u2026Oh. Oh, that\u2019s the old masters\u2019 work. Skyglass, tempered right through. It rings.',
      'And you came out. And the mountain\u2019s gone quiet. I can hear the sea for the first time in a month.',
      'I\u2019ve nothing left here to make. Your island has an empty smithy, Maren\u2019s letters said. I\u2019ll take it.',
      'Bring me Skyglass and I\u2019ll make your tools better. That\u2019s a promise, not a sale.',
    ],
    after: ['Back already? The forge doesn\u2019t light itself. Neither do I.'],
    forge: ['Skyglass in, better tools out. What\u2019ll it be?'],
    forgeNone: ['Come back with more Skyglass. I don\u2019t do favours. I do work.'],
    forgeDone: 'Odda works it at the forge. It rings when she\u2019s done.',
  },
  brann: {
    before: ['Brann. I blow bottles. Odda blows everything else.', 'The rivers have been running since the bell stopped. Don\u2019t touch them. Obviously.'],
    after: ['The mountain\u2019s sleeping again. You did that? Have a bottle. No, you can\u2019t have a bottle. They\u2019re for selling.'],
  },
  kilnLines: {
    enter: [{ who: '', text: 'Heat like a hand on your face. Somewhere deep in the mountain, a furnace breathes in, and out.' }],
    hot: 'The ground is hot: don\u2019t stand on it. Water cools it for a while',
    hotHurt: 'Too hot!',
    molten: 'A river of molten glass. Something bright drifts in it',
    cooled: 'The puddle sets, hard as stone: somewhere to stand',
    blade: { name: 'Cinderglass Blade', line: 'Skyglass tempered in the Kiln\u2019s fire. Heavier, longer, and it rings when it cuts. Your Skyblade goes into your pack.' },
    golemCard: { name: 'The Kiln Golem', region: 'Guardian of the Kiln', line: 'Tools won\u2019t touch it. Wait for it to open.' },
    golem: [{ who: '', text: 'The furnace in the far wall stands up. It is a man made of brick and fire, and it has been waiting for a blade.' }],
    tools: 'It shrugs that off. Only a blade will do',
    down: [{ who: '', text: 'The Golem kneels, and its fire goes out like a held breath. The whole mountain sighs and settles.' }],
    heart: { name: 'Kiln-fired Heart', line: 'Your health grows by one heart.' },
  },
  forgeOpen: { name: 'Odda\u2019s Forge', region: 'Lanternhold', line: 'Skyglass in, better tools out.' },
  shardFall: [
    { who: '', text: 'A thread of light falls out of the crack and comes down on the Heights without a sound.' },
  ],
  mirror: [
    { who: '', text: 'The little pool on the Heights has gone perfectly still. In it, the lighthouse stands upside down, and goes down, and down, further than the water is deep.' },
  ],
  // a second memory: a rainy day
  // going to sleep in Maren's cottage
  // keepsakes: odd little things only the apprentice notices
  keepsakes: {
    spoon: { name: 'A spoon that is always warm', line: 'Why would anyone leave a spoon up here? It is warm, as if someone just put it down.' },
    crust: { name: 'A crust that never goes stale', line: 'Bread, out on the Flats. It smells like Wenna\u2019s, but it isn\u2019t hers.' },
    cup: { name: 'A chipped cup', line: 'Blue-rimmed, chipped on one side. You know exactly where your thumb goes.' },
    boat: { name: 'A paper boat', line: 'Folded from a page of nothing. It has never been wet, and it isn\u2019t now.' },
    button: { name: 'A yellow button', line: 'From a raincoat you\u2019ve never owned. You can almost feel the hood.' },
    watch: { name: 'A stopped watch', line: 'Brass, warm, stopped at ten to four. The hour you were always late for something.' },
    puddle: { name: 'A puddle in a jar', line: 'Someone kept a puddle. Rain on a street that never was, still rippling.' },
  },
  memories: {
    breakfast: { set: ['cup', 'spoon', 'crust'], name: 'Breakfast' },
    rain: { set: ['boat', 'button', 'puddle'], name: 'A rainy day' },
  },
  rememberRain: [
    { who: '', text: 'You set the paper boat, the button and the puddle on the lamp-room sill. For a moment it rains, inside, and you aren\u2019t wet.' },
    { who: '', text: 'Up on the Heights, something unfolds that was always there.' },
  ],
  rememberedRain: { name: 'A memory: A rainy day', line: 'Your health grows by one heart. On the Heights stands a covered porch with a bench, out of the rain.' },
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
