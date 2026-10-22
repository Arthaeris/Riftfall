/* Riftfall — story.js
   The people of Lanternhold, talking to them, and the Prologue as it unfolds:
   finding Maren, practice, the dock beacon, nightfall, the first Riftfall, a night's sleep,
   and the end of the Prologue up on the lighthouse. Also puts the world back as it was for a saved journey. */
import * as THREE from 'three';
import { STORY, NPCS, TEXT } from '@rf/data';
import { buildNpc, buildRiftCrack, SKY_UNIFORMS, Batch, MAT, clamp, lerp, TAU } from '@rf/art';

const smooth = (t) => t * t * (3 - 2 * t);
const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ctx (from game.js): scene, world, foes, P, ui, sound, sparks, bits, shake(k), flash(r, g, b, k), setTime(k),
//                     cine(view | null), focus(target | null), safe(seconds), travel(to),
//                     curtain(k, seconds) -> Promise, onStep(step), onEnding() -> Promise<'keep' | 'title'>
export function createStory(ctx) {
  const { scene, world, P, ui, sound, sparks, bits } = ctx;
  const S = { step: 'findMaren', hits: 0, night: 0, nightTo: 0, cine: null, busy: false, talkTarget: null };

  // ---------------------------------------------------------------------------
  // The villagers: they breathe, look at you when you're close, and Pip runs about the well
  // ---------------------------------------------------------------------------
  const npcs = [];
  // people live in a place (w): they're only seen, heard and talked to while you're there
  function addPeople(w, root, ids) {
    for (const id of ids) {
      const spot = w.spots[id];
      const m = buildNpc(id);
      m.armL.rotation.order = 'YXZ'; m.armR.rotation.order = 'YXZ';
      const y = w.groundAt(spot.x, spot.z);
      m.root.position.set(spot.x, y, spot.z);
      m.root.rotation.y = spot.face;
      root.add(m.root);
      const solid = { x: spot.x, z: spot.z, r: id === 'pip' ? 0.28 : 0.36, h: 1.6, npc: true };
      w.solids.push(solid);
      npcs.push({ id, w, m, x: spot.x, z: spot.z, y, face: spot.face, home: spot, solid, line: 0, phase: Math.random() * 10, talking: false, wander: null, speed: 0 });
    }
  }
  addPeople(world, scene, ['maren', 'tobin', 'wenna', 'pip', 'ennis']);
  const here = () => (ctx.current ? ctx.current() : world);
  const byId = (id) => npcs.find((n) => n.id === id);

  // the marker over Maren when she has something new to say
  const mark = (() => {
    const b = new Batch(5);
    b.box(0.22, 0.22, 0.22, '#ffd29a', 0, 0, 0, { glow: 2.2, rotX: 0.785, rotZ: 0.785, jitter: 0, ao: 1 });
    const m = b.mesh(MAT.glow); m.castShadow = false; m.matrixAutoUpdate = true;
    scene.add(m);
    return m;
  })();
  const hasNews = () => ['findMaren', 'reportPractice', 'reportSeep', 'reportRift', 'morning', 'free', 'reportOil', 'reportMaren2', 'reportMaren3'].includes(S.step);
  // whoever the story wants you to talk to next wears the marker
  const newsWho = () => (S.step === 'findTobin' ? 'tobin' : ['brinemoor', 'reportHale'].includes(S.step) ? 'hale' : hasNews() ? 'maren' : null);
  const O = STORY.order, past = (step) => O.indexOf(S.step) >= O.indexOf(step);
  // put someone somewhere at once (between scenes), or send them walking there
  function place(n, spot, walk) {
    if (walk) { n.goal = { x: spot.x, z: spot.z, face: spot.face || 0 }; return; }
    n.goal = null; n.x = spot.x; n.z = spot.z; n.face = spot.face || 0; n.solid.x = n.x; n.solid.z = n.z; n.speed = 0;
  }

  function updateNpcs(dt) {
    const now = performance.now() / 1000;
    const w0 = here();
    for (const n of npcs) {
      if (n.w !== w0) continue;
      const m = n.m;
      n.phase += dt;
      // someone with somewhere to be walks there (Maren, going to sit by her bench)
      if (n.goal && !n.talking) {
        const dx = n.goal.x - n.x, dz = n.goal.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.08) { n.x = n.goal.x; n.z = n.goal.z; n.face += angTo(n.face, n.goal.face) * Math.min(1, dt * 4); n.speed = lerp(n.speed, 0, Math.min(1, dt * 8)); if (Math.abs(angTo(n.face, n.goal.face)) < 0.05) n.goal = null; }
        else {
          n.speed = lerp(n.speed, 1.6, Math.min(1, dt * 5));
          const st = Math.min(d, n.speed * dt);
          n.x += dx / d * st; n.z += dz / d * st;
          n.face += angTo(n.face, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
        }
        n.solid.x = n.x; n.solid.z = n.z;
      }
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
      const walk = Math.min(1, n.speed / (n.id === 'pip' ? 2.2 : 1.6));
      const ph = n.phase * 9;
      m.legL.rotation.x = Math.sin(ph) * 0.7 * walk; m.legR.rotation.x = -Math.sin(ph) * 0.7 * walk;
      m.body.position.y = Math.sin(n.phase * 2) * 0.008 + Math.abs(Math.sin(ph)) * 0.05 * walk;
      const talkArm = n.talking ? Math.sin(n.phase * 5) * 0.25 - 0.5 : 0;
      if (n.id === 'maren') m.armL.rotation.set(-0.55 + Math.sin(n.phase * 1.3) * 0.04, 0, 0);
      else m.armL.rotation.set(-Math.sin(ph) * 0.6 * walk + (n.id === 'tobin' ? -0.2 : 0), 0, 0);
      m.armR.rotation.set(talkArm + Math.sin(ph) * 0.5 * walk, 0, n.talking ? -0.2 : 0);
      if (n.id === 'tobin') m.body.rotation.x = 0.08;   // a fisherman's stoop
      m.root.position.set(n.x, n.yOver !== undefined ? n.yOver : n.w.groundAt(n.x, n.z), n.z);
      m.root.rotation.y = n.face;
      if (n.id === 'maren' && m.lamp) m.lamp.rotation.z = Math.sin(n.phase * 1.7) * 0.15;
    }
    // the marker bobs over Maren
    const who = newsWho(), mn = who && byId(who);
    mark.visible = !!mn && mn.w === w0 && !S.cine;
    if (mn) {
      if (mark.parent !== mn.m.root.parent && mn.m.root.parent) mn.m.root.parent.add(mark);
      mark.position.set(mn.x, (mn.yOver !== undefined ? mn.yOver : mn.w.groundAt(mn.x, mn.z)) + 2.25 + Math.sin(now * 2.5) * 0.08, mn.z);
    }
    mark.rotation.y = now * 1.6;
  }

  // ---------------------------------------------------------------------------
  // Talking
  // ---------------------------------------------------------------------------
  function nearestTalker(maxD = 1.9) {
    let best = null, bd = maxD;
    const w0 = here();
    for (const n of npcs) { if (n.w !== w0) continue; const d = Math.hypot(P.x - n.x, P.z - n.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function npcAt(x, z) { const w0 = here(); for (const n of npcs) if (n.w === w0 && Math.hypot(x - n.x, z - n.z) < 1.0) return n; return null; }
  const line = (who, text) => ({ who: who ? NPCS[who].name : '', color: who ? NPCS[who].color : '', text });
  async function talk(n) {
    if (S.busy) return;
    S.busy = true; S.talkTarget = null;
    n.talking = true;
    P.face = Math.atan2(n.x - P.x, n.z - P.z);
    ctx.focus({ x: (P.x + n.x) / 2, z: (P.z + n.z) / 2, zoom: 0.78 });
    let lines, then = null;
    if (n.id === 'maren') lines = (STORY.maren[S.step] || STORY.maren.rest).map((t) => line('maren', t));
    else if (n.id === 'tobin' && S.step === 'findTobin') { lines = STORY.tobinBoat.map((L) => line(L.who, L.text)); then = restoreBoat; }
    else if (n.id === 'hale') {
      const H = STORY.hale;
      if (S.step === 'brinemoor') { lines = H.brinemoor.map((t) => line('hale', t)); then = () => setStep('belfry'); }
      else if (S.step === 'reportHale') { lines = H.reportHale.map((t) => line('hale', t)); then = () => setStep('reportMaren2'); }
      else lines = [line('hale', (past('reportMaren2') ? H.after : H.belfry)[n.line++ % (past('reportMaren2') ? H.after.length : H.belfry.length)])];
    } else if (n.id === 'jun' || n.id === 'peg') {
      const set = STORY[n.id][past('reportHale') ? 'after' : 'before'];
      lines = [line(n.id, set[n.line % set.length])];
      n.line++;
    } else if (n.id === 'ennis' && past('setSail')) {
      lines = [line('ennis', STORY.villagers.ennis.after2[0])];
    } else {
      const V = STORY.villagers[n.id];
      const set = past('morning') ? V.morning : V[S.night > 0.5 ? 'after' : 'before'];
      lines = [line(n.id, set[n.line % set.length])];
      n.line++;
    }
    await ui.say(lines);
    n.talking = false;
    ctx.focus(null);
    S.busy = false;
    if (n.id === 'maren') afterMaren();
    if (then) then();
  }
  // Tobin and the Lantern: an afternoon's work, and by evening a boat at the dock
  async function restoreBoat() {
    S.busy = true;
    await ctx.curtain(1, 0.8);
    ctx.setClock(18.2);
    ctx.showLantern();
    const tb = byId('tobin'), d = world.spots.lantern;
    place(tb, { x: d.x + 1.2, z: d.z - 1.6, face: Math.PI * 0.75 });
    P.x = d.x + 1.0; P.z = d.z - 3.4; P.y = world.groundAt(P.x, P.z); P.face = Math.PI * 0.1;
    ctx.snapCamera();
    await ctx.curtain(0, 1.2);
    ui.titleCard('The Lantern', 'Lanternhold dock', 'Evening. She floats.');
    await wait(1.4);
    await say(STORY.tobinDone);
    S.busy = false;
    setStep('setSail');
  }
  function afterMaren() {
    if (S.step === 'findMaren') setStep('practice');
    else if (S.step === 'reportPractice') { setStep('beacon'); if (world.beacon.on) beaconLit(); }
    else if (S.step === 'reportSeep') setStep('enterRift');
    else if (S.step === 'reportRift') { setStep('rest'); place(byId('maren'), world.spots.marenRest, true); }
    else if (S.step === 'morning') ending();
    else if (S.step === 'free') openGate();
    else if (S.step === 'reportOil') setStep('boathouse');
    else if (S.step === 'reportMaren2') setStep('act1Sea');
    else if (S.step === 'reportMaren3') { setStep('act1Cinder'); ui.toast(STORY.roundEnd); }
  }
  // Act 1 begins: Maren hands over the key, the keepers' gate opens, and the clock starts to run
  async function openGate() {
    S.busy = true;
    const g = world.gate;
    await ctx.curtain(1, 0.6);
    const back = { x: P.x, z: P.z };
    ctx.cine({ pos: new THREE.Vector3(g.x - 6, 6.5, g.z + 6), look: new THREE.Vector3(g.x + 1, 4, g.z), k: 0.0000001 });
    await ctx.curtain(0, 0.6);
    await wait(0.4);
    world.openGate();
    sound.sfx('unlock'); sound.sfx('doorOpen'); ctx.shake(0.2);
    await wait(1.6);
    await say(STORY.gateOpen);
    await ctx.curtain(1, 0.5);
    ctx.cine(null); P.x = back.x; P.z = back.z; ctx.snapCamera();
    await ctx.curtain(0, 0.6);
    S.busy = false;
    setStep('gullcliff');
    ctx.startClock();
  }

  // ---------------------------------------------------------------------------
  // The Prologue, step by step
  // ---------------------------------------------------------------------------
  function setStep(step, quiet) {
    S.step = step;
    const o = STORY.objectives[step];
    ui.setObjective(typeof o === 'function' ? o(S.hits, STORY.practiceHits) : o || '');
    if (step !== 'findMaren' && !quiet) sound.sfx('quest');
    if (ctx.onStep) ctx.onStep(step);
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
  // Little clocks for scripted scenes: wait a while, or ease a value somewhere (both run on game time,
  // so pausing the game pauses the scene)
  // ---------------------------------------------------------------------------
  const timers = [], tweens = [];
  const wait = (sec) => new Promise((resolve) => timers.push({ t: sec, resolve }));
  function tween(obj, key, to, sec) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj && tweens[i].key === key) tweens.splice(i, 1);
    tweens.push({ obj, key, from: obj[key], to, sec, t: 0 });
  }
  function updateTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const r = timers[i].resolve; timers.splice(i, 1); r(); } }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      w.t += dt;
      const k = smooth(Math.min(1, w.t / w.sec));
      w.obj[w.key] = w.from + (w.to - w.from) * k;
      if (k >= 1) tweens.splice(i, 1);
    }
  }
  // 0 = evening, 1 = night, 2 = dawn (each half eased)
  const timeOf = (n) => n <= 1 ? smooth(n) : 1 + smooth(n - 1);
  const say = (lines) => ui.say(lines.map((l) => line(l.who, l.text)));

  // ---------------------------------------------------------------------------
  // A night's sleep in Maren's cottage, and morning
  // ---------------------------------------------------------------------------
  async function sleep() {
    S.busy = true;
    ui.setContext(null);
    sound.sfx('doorOpen');
    await ctx.curtain(1, 1.1);
    await say(STORY.sleep);
    // while the screen is dark: a full night's rest, dawn, and Maren goes up to the lighthouse
    P.hp = P.maxHp;
    S.night = S.nightTo = 2;
    ctx.setTime(2);
    place(byId('maren'), world.spots.marenMorning);
    const door = world.spots.cottageDoor;
    P.x = door.x; P.z = door.z + 0.9; P.y = world.groundAt(P.x, P.z); P.face = 0.6;
    ctx.snapCamera();
    await wait(0.6);
    sound.sfx('wake');
    ctx.curtain(0, 1.6);
    ui.titleCard(TEXT.morning.name, TEXT.morning.region, TEXT.morning.line);
    S.busy = false;
    setStep('morning');
  }

  // the boathouse at last: the edge of what's built so far
  async function reachBoathouse() {
    S.busy = true;
    await say(STORY.boathouseArrive);
    S.busy = false;
    setStep('findTobin');
  }
  // all three keepsakes laid down in the lamp-room: the memory of breakfast comes back, and a kitchen unfolds
  async function remember() {
    if (ctx.keepsakesReady() === 'rain') return rememberRain();
    S.busy = true;
    ui.setContext(null);
    await ctx.curtain(1, 0.8);
    await say(STORY.remember.slice(0, 1));
    const kx = 5.6, kz = -20.8, ky = world.groundAt(kx, kz);
    ctx.cine({ pos: new THREE.Vector3(kx + 5, ky + 4.5, kz + 7.5), look: new THREE.Vector3(kx, ky + 1, kz), k: 0.0000001 });
    await ctx.curtain(0, 0.8);
    await wait(0.6);
    world.showKitchen();
    const kit2 = world.kitchen;
    kit2.scale.set(1, 0.01, 1);
    tween(kit2.scale, 'y', 1, 1.6);
    sound.sfx('treasure');
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU; sparks.spawn({ x: kx + Math.cos(a) * 1.6, y: ky + Math.random() * 2, z: kz + Math.sin(a) * 1.2, vy: 1.2, life: 1.4, size: 0.14, color: i % 2 ? '#ffe9a8' : '#9ff3ff', glow: 2.6 }); }
    await wait(2.0);
    await say(STORY.remember.slice(1));
    P.maxHp += 2; P.hp = P.maxHp;
    await ui.itemGet(STORY.remembered.name, STORY.remembered.line, null);
    ctx.cine(null); ctx.snapCamera();
    ctx.remembered();
    S.busy = false;
  }

  // the second memory: a rainy day. A porch unfolds on the Heights.
  async function rememberRain() {
    S.busy = true;
    ui.setContext(null);
    await ctx.curtain(1, 0.8);
    await say(STORY.rememberRain.slice(0, 1));
    const pc = world.porchAt;
    ctx.cine({ pos: new THREE.Vector3(pc.x + 5, pc.y + 4.5, pc.z + 7.5), look: new THREE.Vector3(pc.x, pc.y + 1, pc.z), k: 0.0000001 });
    await ctx.curtain(0, 0.8);
    await wait(0.6);
    world.showPorch();
    const pm = world.porch;
    pm.scale.set(1, 0.01, 1);
    tween(pm.scale, 'y', 1, 1.6);
    sound.sfx('treasure');
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU; sparks.spawn({ x: pc.x + Math.cos(a) * 1.6, y: pc.y + Math.random() * 2, z: pc.z + Math.sin(a) * 1.2, vy: -1.5, life: 1.4, size: 0.12, color: i % 2 ? '#bff6ff' : '#ffffff', glow: 2.2 }); }
    await wait(2.0);
    await say(STORY.rememberRain.slice(1));
    P.maxHp += 2; P.hp = P.maxHp;
    await ui.itemGet(STORY.rememberedRain.name, STORY.rememberedRain.line, null);
    ctx.cine(null); ctx.snapCamera();
    ctx.remembered('rain');
    S.busy = false;
  }

  // ---------------------------------------------------------------------------
  // Resting by the campfire: a short sit, and your hearts are full again
  // ---------------------------------------------------------------------------
  async function restAtFire() {
    S.busy = true;
    ui.setContext(null);
    const fire = world.spots.campfire;
    P.face = Math.atan2(fire.x - P.x, fire.z - P.z);
    await ctx.curtain(0.85, 0.6);
    P.hp = P.maxHp;
    sound.sfx('heal');
    for (let i = 0; i < 16; i++) sparks.spawn({ x: P.x + (Math.random() - 0.5) * 0.8, y: P.y + 0.3 + Math.random(), z: P.z + (Math.random() - 0.5) * 0.8, vy: 1.2, life: 1.0, size: 0.14, color: i % 2 ? '#ff8a96' : '#ffd29a', glow: 2.4 });
    await wait(0.5);
    await ctx.curtain(0, 0.8);
    ui.toast(TEXT.rested);
    S.busy = false;
  }

  // ---------------------------------------------------------------------------
  // The end of the Prologue: up on the lighthouse gallery, the heart-glass goes into the lamp,
  // the crack starts to close, something presses back from the other side, and the sky rains glass
  // ---------------------------------------------------------------------------
  let rainT = 0, rainLeft = 0;
  async function ending() {
    if (S.ending) return;
    S.ending = true; S.busy = true;
    setStep('ending', true);
    ui.setContext(null);
    const G = world.spots.gallery, crackDir = world.crackDir, mn = byId('maren');
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    ui.show(false);
    document.body.classList.add('cine');
    ctx.safe(999);
    await ctx.curtain(1, 1.0);
    // up the two hundred steps: the two of you on the gallery, either side of the lamp
    P.x = G.x + 0.95; P.z = G.z + 0.4; P.y = G.y; P.face = -Math.PI / 2 - 0.3;
    place(mn, { x: G.x - 0.95, z: G.z + 0.4, face: Math.PI / 2 + 0.3 });
    mn.yOver = G.y;
    const galleryShot = { pos: V(G.x + 1.2, G.y + 2.6, G.z + 7.2), look: V(G.x, G.y + 1.0, G.z), k: 0.0000001 };
    ctx.cine(galleryShot);
    await wait(0.4);
    ctx.curtain(0, 1.4);
    sound.sfx('wind');
    await wait(1.6);
    await say(STORY.ending.place);
    // the heart goes into the lamp
    ctx.cine({ pos: V(G.x + 0.4, G.y + 1.7, G.z + 4.4), look: V(G.x, G.y + 1.0, G.z), k: 0.04 });
    await wait(0.9);
    world.setLamp(1);
    sound.sfx('treasure');
    ctx.flash(0.62, 0.98, 1, 0.55);
    ctx.shake(0.15);
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU; sparks.spawn({ x: G.x, y: G.y + 1.3, z: G.z, vx: Math.cos(a) * 2.2, vy: Math.random() * 2.5, vz: Math.sin(a) * 2.2, drag: 2, grav: 1, life: 1.2, size: 0.16, color: i % 3 ? '#9ff3ff' : '#ff9fe0', glow: 3 }); }
    await wait(2.4);
    await say(STORY.ending.lamp);
    // look up: the crack begins to close
    const skyFrom = V(G.x - 1.4, G.y + 1.2, G.z + 4.6);
    ctx.cine({ pos: skyFrom, look: skyFrom.clone().addScaledVector(crackDir, 60), k: 0.025 });
    await wait(2.4);
    sound.sfx('shimmer');
    tween(SKY_UNIFORMS.uCrackGrow, 'value', 0.68, 3.2);
    await wait(3.2);
    await say(STORY.ending.stitch);
    // ... and something presses back
    sound.sfx('blur');
    tween(SKY_UNIFORMS.uBlur, 'value', 1, 4.5);
    tween(SKY_UNIFORMS.uCrackPower, 'value', 0.7, 4.5);
    ctx.shake(0.25);
    await wait(4.2);
    await say(STORY.ending.blur);
    // the sky answers: the Blur withdraws, the crack tears wide again, and glass falls everywhere
    tween(SKY_UNIFORMS.uBlur, 'value', 0, 1.2);
    tween(SKY_UNIFORMS.uCrackGrow, 'value', 1, 0.8);
    tween(SKY_UNIFORMS.uCrackPower, 'value', 1.6, 0.8);
    sound.sfx('crack'); sound.sfx('riftfall');
    ctx.flash(1, 1, 1, 0.6);
    ctx.shake(0.7);
    await wait(0.9);
    ctx.cine({ pos: V(G.x + 7, G.y + 2.5, G.z + 13), look: V(G.x - 8, G.y + 9, G.z - 40), k: 0.02 });
    rainLeft = 7;
    await wait(2.6);
    await say(STORY.ending.rain);
    await wait(2.4);
    tween(SKY_UNIFORMS.uCrackPower, 'value', 1, 2);
    // back on the gallery: the two of you turn to the sea
    P.face = 0.15; mn.face = -0.15;
    ctx.cine({ pos: V(G.x + 0.3, G.y + 2.0, G.z + 6.0), look: V(G.x, G.y + 1.0, G.z + 0.3), k: 0.03 });
    await wait(2.0);
    await say(STORY.ending.after);
    await ctx.curtain(1, 1.6);
    // set everything down for afterwards: back on the ground by the lighthouse door, the lamp sea-green
    rainLeft = 0;
    mn.yOver = undefined;
    place(mn, world.spots.marenMorning);
    const d = world.spots.lighthouseDoor;
    P.x = d.x + 0.6; P.z = d.z + 0.6; P.y = world.groundAt(P.x, P.z); P.face = 0;
    ctx.cine(null);
    ctx.snapCamera();
    ctx.safe(0);
    S.ending = false;
    setStep('free', true);
    const choice = await ctx.onEnding();
    if (choice === 'title') return;
    document.body.classList.remove('cine');
    ui.show(true);
    S.busy = false;
    await ctx.curtain(0, 1.4);
  }
  // glass raining into the sea all along the horizon
  function updateRain(dt) {
    if (rainLeft <= 0) return;
    rainLeft -= dt;
    rainT -= dt;
    if (rainT > 0) return;
    rainT = 0.08 + Math.random() * 0.14;
    const G = world.spots.gallery;
    const from = new THREE.Vector3(G.x, 0, G.z).addScaledVector(world.crackDir, 80);
    from.x += (Math.random() - 0.5) * 50; from.y = 55 + Math.random() * 20;
    const a = -Math.PI * (0.05 + Math.random() * 0.9), r = 55 + Math.random() * 70;   // somewhere out to sea, north of the island
    const to = new THREE.Vector3(G.x + Math.cos(a) * r, -1, G.z + Math.sin(a) * r);
    streaks.push({ from, to, t: 0, dur: 1.0 + Math.random() * 0.9 });
    if (Math.random() < 0.25) sound.sfx('streak');
  }

  // ---------------------------------------------------------------------------
  // A saved journey: put the cove back as it stood at that step (also used by the playtest shortcuts)
  // ---------------------------------------------------------------------------
  function applyState(step, hits = 0) {
    const O = STORY.order, at = (x) => O.indexOf(x);
    // the Rift is grown fresh each time, so a journey saved inside it resumes at the shard
    if (['rift', 'guardian', 'heartGlass'].includes(step)) step = 'enterRift';
    if (step === 'seep') step = 'toShard';
    if (step === 'ending') step = 'morning';
    if (step === 'act1End') step = 'findTobin';           // saves from before the sea arrived
    if (['belfryIn', 'belfryBoss'].includes(step)) step = 'belfry';
    if (['market', 'marketBoss'].includes(step)) step = 'act1Sea';    // the Market regrows: a journey saved inside it resumes at sea
    if (at(step) < 0) step = 'findMaren';
    S.riftIn = undefined; S.cine = null; S.hits = hits;
    if (at(step) > at('beacon')) world.beacon.light();
    if (step === 'dusk') { setStep('beacon', true); beaconLit(); return 'beacon'; }
    if (at(step) >= at('toShard')) {
      S.night = S.nightTo = 1; ctx.setTime(1);
      SKY_UNIFORMS.uCrackPower.value = 1; SKY_UNIFORMS.uCrackGrow.value = 1;
      world.setShard(true);
    }
    const mn = byId('maren');
    if (at(step) >= at('rest')) place(mn, world.spots.marenRest);
    if (at(step) >= at('morning')) { S.night = S.nightTo = 2; ctx.setTime(2); place(mn, world.spots.marenMorning); }
    if (at(step) >= at('free')) world.setLamp(1, true);
    if (at(step) >= at('gullcliff')) world.openGate();
    if (at(step) >= at('setSail')) ctx.showLantern();
    setStep(step, true);
    return step;
  }

  // ---------------------------------------------------------------------------
  // Every frame
  // ---------------------------------------------------------------------------
  function update(dt) {
    updateNpcs(dt);
    updateStreaks(dt);
    updateRain(dt);
    // evening into night
    if (S.night !== S.nightTo) {
      S.night = S.nightTo > S.night ? Math.min(S.nightTo, S.night + dt / 7) : Math.max(S.nightTo, S.night - dt / 7);
      ctx.setTime(timeOf(S.night));
    }
    if (S.riftIn !== undefined) { S.riftIn -= dt; if (S.riftIn <= 0) { S.riftIn = undefined; startRiftfall(); } }
    if (S.cine) updateCine(dt);
    updateTimers(dt);
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
    // at the end of the long night, the cottage door offers sleep
    const door = world.spots.cottageDoor;
    S.nearDoor = S.step === 'rest' && !S.busy && P.state === 'move' && Math.hypot(P.x - door.x, P.z - door.z) < 1.7;
    // Act 1: the waystones, the cave mouth, keepsakes lying about, and the memory they make
    S.nearStone = null; S.nearMouth = false; S.nearRemember = false; S.nearBoat = false;
    S.nearTide = S.nearBelfry = S.nearPier = S.nearBell = false;
    if (!S.busy && P.state === 'move' && past('free')) {
      for (const w of world.waystones) if (!w.lit && Math.hypot(P.x - w.x, P.z - w.z) < 1.8) S.nearStone = w;
      S.nearMouth = past('gullcliff') && Math.hypot(P.x - world.mouth.x, P.z - world.mouth.z) < 2.2;
      const d = world.spots.lighthouseDoor;
      S.nearRemember = !!ctx.keepsakesReady() && Math.hypot(P.x - d.x, P.z - d.z) < 1.7;
      for (const k of world.keepsakes) if (!k.taken && Math.hypot(P.x - k.x, P.z - k.z) < 0.85) { world.takeKeepsake(k.id); ctx.foundKeepsake(k); }
      S.nearBoat = past('setSail') && !!world.spots.lantern && Math.hypot(P.x - world.spots.lantern.x, P.z - world.spots.lantern.z) < 2.6;
      // the boathouse, across the ravine
      if (S.step === 'boathouse' && Math.hypot(P.x - world.spots.boathouse.x, P.z - world.spots.boathouse.z) < 4.5) reachBoathouse();
    }
    // the campfire offers a rest when you're hurt
    const fire = world.spots.campfire;
    S.nearFire = !S.busy && P.state === 'move' && P.hp < P.maxHp && !ctx.foes.seep.sealed && Math.hypot(P.x - fire.x, P.z - fire.z) < 2.4;
    // the sword button offers "Talk" when someone is close and nothing is fighting you
    const n = !S.busy && P.state === 'move' && !ctx.foes.seep.sealed ? nearestTalker() : null;
    ui.setContext(S.nearShard || S.nearMouth ? 'enter' : S.nearDoor ? 'sleep' : S.nearRemember ? 'remember' : n ? 'talk' : S.nearBoat ? 'sail' : S.nearStone ? 'light' : S.nearFire ? 'rest' : null);
    S.near = n;
  }
  function tryTalk() {
    if (S.nearShard && !S.busy) { S.nearShard = false; ctx.travel('rift'); return true; }
    if (S.nearDoor && !S.busy) { sleep(); return true; }
    if (S.nearMouth && !S.near && !S.busy) { if (S.step === 'gullcliff') setStep('caves'); ctx.travel('caves'); return true; }
    if (S.nearRemember && !S.busy) { remember(); return true; }
    if (S.nearStone && !S.near && !S.busy) { ctx.lightStone(S.nearStone); return true; }
    if (S.nearFire && !S.near && !S.busy) { restAtFire(); return true; }
    if (S.near && !S.busy) { talk(S.near); return true; }
    if (S.nearBoat && !S.busy) { ctx.travel('sea'); return true; }
    if (S.nearTide && !S.busy) { ctx.waitTide(); return true; }
    if (S.nearBelfry && !S.busy) { if (['brinemoor', 'belfry'].includes(S.step)) setStep('belfryIn'); ctx.travel('belfry'); return true; }
    if (S.nearBell && !S.busy) { ctx.ringBell(); return true; }
    if (S.nearPier && !S.busy) { ctx.travel('sea'); return true; }
    return false;
  }
  // Brinemoor (and any other town): its people, its tide post, its doors and its pier
  function updateTown(dt, w) {
    updateNpcs(dt);
    updateTimers(dt);
    if (S.talkTarget && !S.busy) {
      if (Math.hypot(P.x - S.talkTarget.x, P.z - S.talkTarget.z) < 1.8) talk(S.talkTarget);
      else if (!P.path) S.talkTarget = null;
    }
    S.nearShard = S.nearDoor = S.nearMouth = S.nearRemember = S.nearFire = S.nearBoat = false; S.nearStone = null;
    const free = !S.busy && P.state === 'move';
    const n = free ? nearestTalker() : null;
    const sp = w.spots;
    S.nearTide = free && !!sp.tidePost && Math.hypot(P.x - sp.tidePost.x, P.z - sp.tidePost.z) < 1.8;
    // the Belfry's door is only above water at low tide
    S.nearBelfry = free && !!sp.door && w.level < 0.0 && Math.hypot(P.x - sp.door.x, P.z - sp.door.z) < 1.8;
    S.nearPier = free && Math.hypot(P.x - sp.pier.x, P.z - sp.pier.z) < 2.0;
    // Bell Rock's bell
    S.nearBell = free && !!sp.bell && Math.hypot(P.x - sp.bell.x, P.z - sp.bell.z) < 2.0;
    ui.setContext(n ? 'talk' : S.nearBelfry ? 'enter' : S.nearBell ? 'ring' : S.nearTide ? 'wait' : S.nearPier ? 'sail' : null);
    S.near = n;
  }
  function begin() { setStep('findMaren'); }

  // where people are, and whether Maren has something to say (for the map)
  const people = (w = world) => npcs.filter((n) => n.w === w).map((n) => ({ id: n.id, x: n.x, z: n.z, news: n.id === newsWho() }));
  return { people, hasNews, newsWho, addPeople, updateTown, past, update, tryTalk, onDummyHit, onSeepClear, npcAt, begin, setStep, applyState, say, busy: () => S.busy || ui.isTalking(), state: S, setTalkTarget: (n) => { S.talkTarget = n; }, jump: (step) => {
    // for testing: skip ahead
    if (step === 'beacon') { setStep('beacon'); }
    else if (step === 'riftfall') { beaconLit(); S.riftIn = 0.1; }
    else if (step === 'morning' || step === 'free') applyState(step);
    else if (step === 'night' || step === 'enterRift') { S.night = S.nightTo = 1; S.riftIn = undefined; ctx.setTime(1); SKY_UNIFORMS.uCrackPower.value = 1; SKY_UNIFORMS.uCrackGrow.value = 1; world.setShard(true); world.beacon.light(); setStep(step === 'night' ? 'toShard' : 'enterRift'); }
    else setStep(step);
  } };
}
