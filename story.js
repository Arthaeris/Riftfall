/* Riftfall — story.js
   The people of Lanternhold, talking to them, and the Prologue as it unfolds:
   finding Maren, practice, the dock beacon, nightfall, and the first Riftfall. */
import * as THREE from 'three';
import { STORY, NPCS, TEXT } from '@rf/data';
import { buildNpc, buildRiftCrack, SKY_UNIFORMS, Batch, MAT, clamp, lerp, TAU } from '@rf/art';

const smooth = (t) => t * t * (3 - 2 * t);
const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ctx (from game.js): scene, world, foes, P, ui, sound, sparks, bits, shake(k), flash(r, g, b, k), setTime(k),
//                     cine(view | null), focus(target | null), safe(seconds)
export function createStory(ctx) {
  const { scene, world, P, ui, sound, sparks, bits } = ctx;
  const S = { step: 'findMaren', hits: 0, night: 0, nightTo: 0, cine: null, busy: false, talkTarget: null };

  // ---------------------------------------------------------------------------
  // The villagers: they breathe, look at you when you're close, and Pip runs about the well
  // ---------------------------------------------------------------------------
  const npcs = [];
  for (const id of ['maren', 'tobin', 'wenna', 'pip']) {
    const spot = world.spots[id];
    const m = buildNpc(id);
    m.armL.rotation.order = 'YXZ'; m.armR.rotation.order = 'YXZ';
    const y = world.groundAt(spot.x, spot.z);
    m.root.position.set(spot.x, y, spot.z);
    m.root.rotation.y = spot.face;
    scene.add(m.root);
    const solid = { x: spot.x, z: spot.z, r: id === 'pip' ? 0.28 : 0.36, h: 1.6, npc: true };
    world.solids.push(solid);
    npcs.push({ id, m, x: spot.x, z: spot.z, y, face: spot.face, home: spot, solid, line: 0, phase: Math.random() * 10, talking: false, wander: null, speed: 0 });
  }
  const byId = (id) => npcs.find((n) => n.id === id);

  // the marker over Maren when she has something new to say
  const mark = (() => {
    const b = new Batch(5);
    b.box(0.22, 0.22, 0.22, '#ffd29a', 0, 0, 0, { glow: 2.2, rotX: 0.785, rotZ: 0.785, jitter: 0, ao: 1 });
    const m = b.mesh(MAT.glow); m.castShadow = false; m.matrixAutoUpdate = true;
    scene.add(m);
    return m;
  })();
  const hasNews = () => ['findMaren', 'reportPractice', 'reportSeep', 'reportRift'].includes(S.step);

  function updateNpcs(dt) {
    const now = performance.now() / 1000;
    for (const n of npcs) {
      const m = n.m;
      n.phase += dt;
      // Pip wanders around the well, stopping to look at things
      if (n.id === 'pip' && !n.talking) {
        if (!n.wander || n.wander.wait > 0) {
          if (!n.wander) n.wander = { wait: 1 };
          n.wander.wait -= dt;
          if (n.wander.wait <= 0) { const a = Math.random() * TAU, d = 1.9 + Math.random() * 1.3; n.wander.x = world.village.x + Math.cos(a) * d; n.wander.z = world.village.z + Math.sin(a) * d; n.wander.wait = 0; }
          n.speed = lerp(n.speed, 0, Math.min(1, dt * 8));
        } else {
          const dx = n.wander.x - n.x, dz = n.wander.z - n.z, d = Math.hypot(dx, dz);
          // stay clear of you
          if (Math.hypot(P.x - n.x, P.z - n.z) < 1.1) n.wander.wait = 0.6;
          else if (d < 0.15) n.wander.wait = 1 + Math.random() * 2.5;
          else {
            n.speed = lerp(n.speed, 2.2, Math.min(1, dt * 6));
            n.x += dx / d * n.speed * dt; n.z += dz / d * n.speed * dt;
            n.face += angTo(n.face, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
          }
        }
        n.solid.x = n.x; n.solid.z = n.z;
      }
      // look at the apprentice when close, otherwise back to what they were doing
      const dx = P.x - n.x, dz = P.z - n.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      if (n.talking) n.face += angTo(n.face, want) * Math.min(1, dt * 6);
      const look = d < 5 && !n.talking ? clamp(angTo(n.face, want), -1.0, 1.0) : 0;
      m.head.rotation.y = lerp(m.head.rotation.y, look * 0.8, Math.min(1, dt * 5));
      // pose: breathing, a walk cycle for Pip, gestures while talking
      const walk = n.speed / 2.2;
      const ph = n.phase * 9;
      m.legL.rotation.x = Math.sin(ph) * 0.7 * walk; m.legR.rotation.x = -Math.sin(ph) * 0.7 * walk;
      m.body.position.y = Math.sin(n.phase * 2) * 0.008 + Math.abs(Math.sin(ph)) * 0.05 * walk;
      const talkArm = n.talking ? Math.sin(n.phase * 5) * 0.25 - 0.5 : 0;
      if (n.id === 'maren') m.armL.rotation.set(-0.55 + Math.sin(n.phase * 1.3) * 0.04, 0, 0);
      else m.armL.rotation.set(-Math.sin(ph) * 0.6 * walk + (n.id === 'tobin' ? -0.2 : 0), 0, 0);
      m.armR.rotation.set(talkArm + Math.sin(ph) * 0.5 * walk, 0, n.talking ? -0.2 : 0);
      if (n.id === 'tobin') m.body.rotation.x = 0.08;   // a fisherman's stoop
      m.root.position.set(n.x, world.groundAt(n.x, n.z), n.z);
      m.root.rotation.y = n.face;
      if (n.id === 'maren' && m.lamp) m.lamp.rotation.z = Math.sin(n.phase * 1.7) * 0.15;
    }
    // the marker bobs over Maren
    const mn = byId('maren');
    mark.visible = hasNews() && !S.cine;
    mark.position.set(mn.x, world.groundAt(mn.x, mn.z) + 2.25 + Math.sin(now * 2.5) * 0.08, mn.z);
    mark.rotation.y = now * 1.6;
  }

  // ---------------------------------------------------------------------------
  // Talking
  // ---------------------------------------------------------------------------
  function nearestTalker(maxD = 1.9) {
    let best = null, bd = maxD;
    for (const n of npcs) { const d = Math.hypot(P.x - n.x, P.z - n.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function npcAt(x, z) { for (const n of npcs) if (Math.hypot(x - n.x, z - n.z) < 1.0) return n; return null; }
  const line = (who, text) => ({ who: who ? NPCS[who].name : '', color: who ? NPCS[who].color : '', text });
  async function talk(n) {
    if (S.busy) return;
    S.busy = true; S.talkTarget = null;
    n.talking = true;
    P.face = Math.atan2(n.x - P.x, n.z - P.z);
    ctx.focus({ x: (P.x + n.x) / 2, z: (P.z + n.z) / 2, zoom: 0.78 });
    let lines;
    if (n.id === 'maren') lines = (STORY.maren[S.step] || STORY.maren.rest).map((t) => line('maren', t));
    else {
      const set = STORY.villagers[n.id][S.night > 0.5 ? 'after' : 'before'];
      lines = [line(n.id, set[n.line % set.length])];
      n.line++;
    }
    await ui.say(lines);
    n.talking = false;
    ctx.focus(null);
    S.busy = false;
    if (n.id === 'maren') afterMaren();
  }
  function afterMaren() {
    if (S.step === 'findMaren') setStep('practice');
    else if (S.step === 'reportPractice') { setStep('beacon'); if (world.beacon.on) beaconLit(); }
    else if (S.step === 'reportSeep') setStep('enterRift');
    else if (S.step === 'reportRift') { setStep('rest'); ui.toast(STORY.roundEnd); sound.sfx('clear'); }
  }

  // ---------------------------------------------------------------------------
  // The Prologue, step by step
  // ---------------------------------------------------------------------------
  function setStep(step) {
    S.step = step;
    const o = STORY.objectives[step];
    ui.setObjective(typeof o === 'function' ? o(S.hits, STORY.practiceHits) : o);
    if (step !== 'findMaren') sound.sfx('quest');
  }
  function onDummyHit() {
    if (S.step !== 'practice') return;
    S.hits++;
    ui.setObjective(STORY.objectives.practice(Math.min(S.hits, STORY.practiceHits), STORY.practiceHits));
    if (S.hits >= STORY.practiceHits) setStep('reportPractice');
  }
  // the beacon crystal: any good hit wakes it
  world.beacon.onHit = () => {
    if (world.beacon.on) return;
    world.beacon.light();
    sound.sfx('beacon');
    ctx.shake(0.2);
    const t = world.beacon;
    for (let i = 0; i < 30; i++) { const a = Math.random() * TAU; sparks.spawn({ x: t.x, y: t.y, z: t.z, vx: Math.cos(a) * 3, vy: Math.random() * 4, vz: Math.sin(a) * 3, drag: 2, grav: 2, life: 0.9, size: 0.18, color: i % 2 ? '#9ff3ff' : '#ffe9a8', glow: 3 }); }
    ui.toast('The beacon burns again');
    if (S.step === 'beacon') beaconLit();
  };
  function beaconLit() {
    // the light comes back to the dock just as the evening goes: night falls, then the sky breaks
    S.step = 'dusk';
    ui.setObjective('');
    S.nightTo = 1;
    S.riftIn = 7.5;
  }
  // the Seep was cleared
  function onSeepClear() {
    if (S.step === 'seep' || S.step === 'toShard') setStep('reportSeep');
  }

  // ---------------------------------------------------------------------------
  // The first Riftfall: the sky cracks, glass rains into the sea, and one great shard falls into the stone circle
  // ---------------------------------------------------------------------------
  const streaks = [];
  function startRiftfall() {
    S.cine = { t: 0, phase: 0, impact: false, streakT: 0 };
    S.busy = true;
    ui.show(false);
    document.body.classList.add('cine');
    ctx.safe(30);
    sound.sfx('riftfall');
    ctx.shake(0.3);
  }
  const shock = (() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ff3ff').multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
    return m;
  })();
  const bigShard = (() => {
    const b = new Batch(8);
    b.box(0.6, 2.2, 0.5, '#9ff3ff', 0, 0, 0, { glow: 2.2, jitter: 0 });
    b.box(0.3, 1.2, 0.3, '#ffffff', 0.2, 0.3, 0, { glow: 3.2, jitter: 0, rotZ: 0.3 });
    const m = b.mesh(MAT.glow); m.castShadow = false; m.matrixAutoUpdate = true; m.visible = false;
    scene.add(m);
    return m;
  })();
  function updateCine(dt) {
    const C = S.cine;
    C.t += dt;
    const T = C.t;
    const sky = SKY_UNIFORMS;
    const seep = world.seep;
    const crackDir = world.crackDir;
    // the camera: up at the sky while it breaks, then following the great shard down to the meadow
    const pos = new THREE.Vector3(P.x - 3, P.y + 3, P.z + 8);
    const lookSky = pos.clone().addScaledVector(crackDir, 60);
    if (T < 4.4) ctx.cine({ pos, look: lookSky, k: 0.03 });
    // the crack opens and spreads
    if (T > 1.0 && C.phase === 0) { C.phase = 1; ctx.flash(1, 1, 1, 0.7); sound.sfx('crack'); ctx.shake(0.6); }
    if (C.phase >= 1) {
      const g = clamp((T - 1.0) / 2.6, 0, 1);
      sky.uCrackGrow.value = smooth(g);
      sky.uCrackPower.value = 1 + (1 - g) * 0.6 + (T < 6 ? 0 : 0);
    }
    // little shards streak down into the sea, far off
    if (T > 1.6 && T < 6) {
      C.streakT -= dt;
      if (C.streakT <= 0) {
        C.streakT = 0.22 + Math.random() * 0.3;
        const from = new THREE.Vector3(P.x, 0, P.z).addScaledVector(crackDir, 70 + Math.random() * 20);
        from.x += (Math.random() - 0.5) * 30; from.y = 45 + Math.random() * 15;
        const to = new THREE.Vector3(from.x + 10 + Math.random() * 30, -1, from.z + 20 + Math.random() * 40);
        streaks.push({ from, to, t: 0, dur: 1.2 + Math.random() * 0.8 });
        if (Math.random() < 0.4) sound.sfx('streak');
      }
    }
    // the great shard
    if (T > 4.2 && !C.impact) {
      const k = clamp((T - 4.2) / 1.6, 0, 1);
      const from = new THREE.Vector3(seep.x, 0, seep.z).addScaledVector(crackDir, 40); from.y = 55;
      const to = new THREE.Vector3(seep.x, seep.h + 0.9, seep.z);
      const p = from.clone().lerp(to, k * k);
      bigShard.visible = true;
      bigShard.position.copy(p);
      bigShard.lookAt(to); bigShard.rotateX(Math.PI / 2);
      for (let i = 0; i < 4; i++) sparks.spawn({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + Math.random(), z: p.z + (Math.random() - 0.5) * 0.5, life: 0.7, size: 0.5, color: i % 2 ? '#9ff3ff' : '#ffffff', glow: 3, drag: 1 });
      ctx.cine({ pos: new THREE.Vector3(seep.x + 7, seep.h + 7.5, seep.z + 11), look: p, k: 0.05 });
      if (k >= 1) impact();
    }
    if (C.impact) {
      const k = (T - C.impactT) / 0.9;
      shock.visible = k < 1;
      shock.scale.setScalar(0.5 + k * 9);
      shock.material.opacity = Math.max(0, 1 - k);
      ctx.cine({ pos: new THREE.Vector3(seep.x + 7, seep.h + 7.5, seep.z + 11), look: new THREE.Vector3(seep.x, seep.h + 0.8, seep.z), k: 0.05 });
      if (T - C.impactT > 2.2) endRiftfall();
    }
  }
  function impact() {
    const C = S.cine, seep = world.seep;
    C.impact = true; C.impactT = C.t;
    bigShard.visible = false;
    world.setShard(true);
    sound.sfx('impact');
    ctx.shake(1);
    ctx.flash(0.75, 0.97, 1, 0.85);
    shock.position.set(seep.x, seep.h + 0.08, seep.z);
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 6;
      bits.spawn({ x: seep.x, y: seep.h + 0.3, z: seep.z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 5, vz: Math.sin(a) * sp, life: 1.6, size: 0.08 + Math.random() * 0.12, color: Math.random() < 0.5 ? '#6e4e36' : '#5c8f3e', floor: seep.h });
      sparks.spawn({ x: seep.x, y: seep.h + 0.5, z: seep.z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 5, vz: Math.sin(a) * sp, grav: 4, drag: 1.5, life: 1.0, size: 0.22, color: i % 3 ? '#9ff3ff' : '#ffffff', glow: 3 });
    }
  }
  async function endRiftfall() {
    S.cine = null;
    shock.visible = false;
    SKY_UNIFORMS.uCrackPower.value = 1;
    ctx.cine(null);
    document.body.classList.remove('cine');
    ui.show(true);
    S.step = 'toShard';
    const lines = STORY.riftfallAfter.map((l) => line(l.who, l.text));
    await ui.say(lines);
    S.busy = false;
    setStep('toShard');
  }
  function updateStreaks(dt) {
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const p = s.from.clone().lerp(s.to, k);
      sparks.spawn({ x: p.x, y: p.y, z: p.z, life: 0.5, size: 0.9, color: '#c6f8ff', glow: 4, drag: 0, shrink: 1 });
      if (k >= 1) streaks.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Every frame
  // ---------------------------------------------------------------------------
  function update(dt) {
    updateNpcs(dt);
    updateStreaks(dt);
    // evening into night
    if (S.night !== S.nightTo) {
      S.night = S.nightTo > S.night ? Math.min(S.nightTo, S.night + dt / 7) : Math.max(S.nightTo, S.night - dt / 7);
      ctx.setTime(smooth(S.night));
    }
    if (S.riftIn !== undefined) { S.riftIn -= dt; if (S.riftIn <= 0) { S.riftIn = undefined; startRiftfall(); } }
    if (S.cine) updateCine(dt);
    // the Seep is waiting for you once the shard is down
    if (S.step === 'toShard' && world.shardOn() && ctx.foes.seep.sealed) setStep('seep');
    if (S.step === 'seep' && !ctx.foes.seep.sealed) setStep('toShard');   // you fell and woke by the fire: try again
    // walking up to someone you tapped: start talking when close
    if (S.talkTarget && !S.busy) {
      if (Math.hypot(P.x - S.talkTarget.x, P.z - S.talkTarget.z) < 1.8) talk(S.talkTarget);
      else if (!P.path) S.talkTarget = null;
    }
    // the shard, once it has become a door: it glimmers, and the sword button offers "Enter"
    const sh = world.seep;
    S.nearShard = S.step === 'enterRift' && !S.busy && P.state === 'move' && Math.hypot(P.x - sh.x, P.z - sh.z) < 2.6;
    if (S.step === 'enterRift' && Math.random() < dt * 30) {
      const a = performance.now() / 300 + Math.random() * 0.6, rr = 0.9 + Math.random() * 0.5;
      sparks.spawn({ x: sh.x + Math.cos(a) * rr, y: world.groundAt(sh.x, sh.z) + 0.3 + Math.random() * 2, z: sh.z + Math.sin(a) * rr, vx: -Math.sin(a) * 1.2, vz: Math.cos(a) * 1.2, vy: 0.6, drag: 0.5, life: 1.2, size: 0.14, color: Math.random() < 0.5 ? '#9ff3ff' : '#ff9fe0', glow: 3, flicker: 1 });
    }
    // the sword button offers "Talk" when someone is close and nothing is fighting you
    const n = !S.busy && P.state === 'move' && !ctx.foes.seep.sealed ? nearestTalker() : null;
    ui.setContext(S.nearShard ? 'enter' : n ? 'talk' : null);
    S.near = n;
  }
  function tryTalk() {
    if (S.nearShard && !S.busy) { ctx.travel('rift'); return true; }
    if (S.near && !S.busy) { talk(S.near); return true; }
    return false;
  }
  function begin() { setStep('findMaren'); }

  return { update, tryTalk, onDummyHit, onSeepClear, npcAt, begin, setStep, say: (lines) => ui.say(lines.map((l) => line(l.who, l.text))), busy: () => S.busy || ui.isTalking(), state: S, setTalkTarget: (n) => { S.talkTarget = n; }, jump: (step) => {
    // for testing: skip ahead
    if (step === 'beacon') { setStep('beacon'); }
    else if (step === 'riftfall') { beaconLit(); S.riftIn = 0.1; }
    else if (step === 'night' || step === 'enterRift') { S.night = S.nightTo = 1; S.riftIn = undefined; ctx.setTime(1); SKY_UNIFORMS.uCrackPower.value = 1; SKY_UNIFORMS.uCrackGrow.value = 1; world.setShard(true); world.beacon.light(); setStep(step === 'night' ? 'toShard' : 'enterRift'); }
    else setStep(step);
  } };
}
