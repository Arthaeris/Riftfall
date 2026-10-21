/* Riftfall — foes.js
   Creatures from the Rifts: how they move, warn, attack, get hit and fall; what they drop;
   and the Seep, the clearing that seals itself and sends them out in waves. */
import * as THREE from 'three';
import { FOES, SEEP, TEXT } from '@rf/data';
import { buildFoe, buildBar, buildSliver, buildHeartPickup, buildBarrier, buildRiftCrack, buildGlyphRing, buildOrb, clamp, lerp, TAU, Batch, MAT } from '@rf/art';

const smooth = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);
const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ctx (from game.js): scene, world, P, sparks, bits, sound, hurtPlayer(dmg, x, z), shake(k), hitStop(s),
//                     number(text, x, y, z, heavy), addSkyglass(n), heal(n), toast(text), playerDead()
export function createFoes(ctx) {
  const { scene, world, P, sparks, bits, sound } = ctx;
  const S = world.seep || null;   // the Seep lives in the cove; the Rift has rooms instead
  const foes = [], orbs = [], drops = [], effects = [];

  // ---------------------------------------------------------------------------
  // Spawning: a crack of light opens in the ground and the creature climbs out
  // ---------------------------------------------------------------------------
  // opts.placed: a creature that already lives here (a dungeon's): no crack, it's simply there, and it
  // waits until you come near
  function spawn(kind, x, z, opts = {}) {
    const D = FOES[kind];
    const m = buildFoe(kind);
    const y = world.groundAt(x, z);
    m.root.position.set(x, y, z);
    m.root.visible = false;
    scene.add(m.root);
    const bar = buildBar(kind === 'bellfish' ? 0.8 : kind === 'doorcrab' ? 1.1 : 0.9);
    bar.group.visible = false;
    scene.add(bar.group);
    const crack = buildRiftCrack();
    crack.position.set(x, y + 0.01, z);
    crack.scale.setScalar(0.01);
    scene.add(crack);
    const f = {
      kind, D, m, bar, crack, x, z, y, vx: 0, vz: 0, kx: 0, kz: 0, face: Math.atan2(P.x - x, P.z - z),
      hp: D.hp, state: 'emerge', t: 0, hittable: false, alive: true, flashT: 0, hop: Math.random(), cd: rnd(0.4, 1.2),
    };
    if (opts.placed) {
      scene.remove(crack); f.crack = null;
      f.state = { mirrorpuddle: 'chase', bellfish: 'drift', shardmite: 'chase', barnacle: 'idle', doorcrab: 'up', lullabypod: 'up', rootscript: 'up' }[kind] || 'up';
      f.hittable = true; f.asleep = opts.wake || 8.5;
      m.root.visible = true;
      Object.assign(f, opts.extra || {});
    } else sound.sfx('emerge');
    foes.push(f);
    return f;
  }

  // ---------------------------------------------------------------------------
  // Moving: stay on walkable ground, inside the clearing while it's sealed, and out of each other's way
  // ---------------------------------------------------------------------------
  function moveFoe(f, dx, dz) {
    const step = (x, z) => {
      if (S && seep.sealed && Math.hypot(x - S.x, z - S.z) > S.r - 0.75) return false;
      if (world.contain && !world.contain(x, z)) return false;
      return world.terrainOk(x, z, world.groundAt(f.x, f.z), f.D.r * 0.6, 0.55) && !world.solidAt(x, z, f.D.r * 0.6);
    };
    if (step(f.x + dx, f.z + dz)) { f.x += dx; f.z += dz; return true; }
    if (step(f.x + dx, f.z)) { f.x += dx; return true; }
    if (step(f.x, f.z + dz)) { f.z += dz; return true; }
    return false;
  }
  function separate(f, dt) {
    for (const o of foes) {
      if (o === f || !o.alive || o.state === 'emerge' || o.state === 'under') continue;
      const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz), min = f.D.r + o.D.r + 0.15;
      if (d < min && d > 0.001) { const k = (min - d) * 3 * dt; moveFoe(f, dx / d * k, dz / d * k); }
    }
    // don't stand inside the apprentice either (bellfish float over you, that's fine)
    if (f.kind !== 'bellfish' && f.state !== 'under') {
      const dx = f.x - P.x, dz = f.z - P.z, d = Math.hypot(dx, dz), min = f.D.r + 0.35;
      if (d < min && d > 0.001) moveFoe(f, dx / d * (min - d) * 0.5, dz / d * (min - d) * 0.5);
    }
  }
  const toPlayer = (f) => { const dx = P.x - f.x, dz = P.z - f.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d, d }; };
  const turnTo = (f, a, rate, dt) => { f.face += clamp(angTo(f.face, a), -rate * dt, rate * dt); };
  const touch = (f, reach, dmg) => {
    if (Math.hypot(P.x - f.x, P.z - f.z) < reach) return ctx.hurtPlayer(dmg, f.x, f.z);
    return false;
  };

  // ---------------------------------------------------------------------------
  // Mirrorpuddle: hops toward you, crouches (the warning), then leaps
  // ---------------------------------------------------------------------------
  function puddle(f, dt) {
    const D = f.D, m = f.m, tp = toPlayer(f);
    f.t += dt;
    let sx = 1, sy = 1, lift = 0;
    if (f.state === 'chase') {
      f.cd -= dt;
      f.hop += dt / D.hopEvery;
      const ph = f.hop % 1;
      // it moves only while it's in the air: little bursts
      const air = ph < 0.55;
      if (air) moveFoe(f, tp.x * D.speed * 1.8 * dt, tp.z * D.speed * 1.8 * dt);
      lift = air ? Math.sin(ph / 0.55 * Math.PI) * 0.22 : 0;
      sy = air ? 1.12 : 1 - Math.sin((ph - 0.55) / 0.45 * Math.PI) * 0.22;
      sx = 2 - sy;
      if (!air && ph > 0.6 && ph - dt / D.hopEvery <= 0.6) sound.sfx('hop', 0.6);
      turnTo(f, Math.atan2(tp.x, tp.z), 6, dt);
      if (tp.d < D.reach && f.cd <= 0) { f.state = 'tell'; f.t = 0; f.dir = { x: tp.x, z: tp.z }; sound.sfx('puddleTell'); }
    } else if (f.state === 'tell') {
      // the warning: it flattens, shivers and glows
      const k = Math.min(1, f.t / D.tell);
      sy = 1 - k * 0.42; sx = 1 + k * 0.28;
      m.body.position.x = Math.sin(f.t * 60) * 0.03 * k;
      f.tellGlow = k;
      turnTo(f, Math.atan2(f.dir.x, f.dir.z), 3, dt);
      if (f.t >= D.tell) { f.state = 'leap'; f.t = 0; f.hitDone = false; f.from = { x: f.x, z: f.z }; m.body.position.x = 0; f.tellGlow = 0; sound.sfx('leap'); }
    } else if (f.state === 'leap') {
      const p = Math.min(1, f.t / D.leap), prev = Math.max(0, (f.t - dt) / D.leap);
      const d = (smooth(p) - smooth(prev)) * D.leapDist;
      moveFoe(f, f.dir.x * d, f.dir.z * d);
      lift = Math.sin(p * Math.PI) * 1.1;
      sy = 1.25 - p * 0.2; sx = 0.85;
      if (!f.hitDone && lift < 0.9 && touch(f, D.r + 0.4, D.dmg)) f.hitDone = true;
      if (p >= 1) {
        f.state = 'rest'; f.t = 0;
        sound.sfx('splat');
        for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; sparks.spawn({ x: f.x, y: f.y + 0.15, z: f.z, vx: Math.cos(a) * 2.2, vy: 1.6 + Math.random(), vz: Math.sin(a) * 2.2, grav: 9, life: 0.45, size: 0.12, color: '#7fd8f0', glow: 1.4 }); }
        if (!f.hitDone) touch(f, D.r + 0.45, D.dmg);
      }
    } else if (f.state === 'rest') {
      // a tired wobble: the moment to punish it
      sy = 0.78 + Math.sin(f.t * 14) * 0.05; sx = 1.18;
      if (f.t >= D.rest) { f.state = 'chase'; f.t = 0; f.cd = rnd(0.6, 1.4); }
    } else if (f.state === 'stagger') {
      sy = 0.85; sx = 1.12;
      if (f.t >= 0.35) { f.state = 'chase'; f.t = 0; }
    }
    m.body.scale.set(sx, sy, sx);
    m.body.position.y = lift;
    f.barY = 1.0 + lift;
  }

  // ---------------------------------------------------------------------------
  // Bellfish: keeps its distance, swells its lamp (the warning), and rings out a circle of orbs
  // ---------------------------------------------------------------------------
  function bellfish(f, dt) {
    const D = f.D, m = f.m, tp = toPlayer(f);
    f.t += dt;
    const now = performance.now() / 1000;
    if (f.next === undefined) f.next = rnd(...D.every) * 0.6;
    let lamp = 1;
    if (f.state === 'drift') {
      f.next -= dt;
      let mx = 0, mz = 0;
      if (tp.d < D.keep[0]) { mx = -tp.x; mz = -tp.z; }
      else if (tp.d > D.keep[1]) { mx = tp.x; mz = tp.z; }
      else { f.side = f.side || (Math.random() < 0.5 ? 1 : -1); mx = -tp.z * f.side * 0.6; mz = tp.x * f.side * 0.6; }
      if (!moveFoe(f, mx * D.speed * dt, mz * D.speed * dt) && tp.d >= D.keep[0]) f.side = -(f.side || 1);
      turnTo(f, Math.atan2(tp.x, tp.z), 2.5, dt);
      if (f.next <= 0 && tp.d < 10) { f.state = 'tell'; f.t = 0; sound.sfx('bellTell'); }
    } else if (f.state === 'tell') {
      const k = Math.min(1, f.t / D.tell);
      lamp = 1 + k * 1.6 + Math.sin(f.t * 40) * 0.15 * k;
      m.bell.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.12);
      if (f.t >= D.tell) {
        f.state = 'drift'; f.t = 0; f.next = rnd(...D.every);
        m.bell.scale.setScalar(1);
        ring(f);
      }
    } else if (f.state === 'stagger') {
      if (f.t >= 0.3) { f.state = 'drift'; f.t = 0; }
    }
    m.float.position.y = D.hover + Math.sin(now * 2.1 + f.x) * 0.12;
    m.float.rotation.z = Math.sin(now * 1.3 + f.z) * 0.08;
    m.lamp.scale.setScalar(lamp);
    for (const t of m.tentacles) t.segs.forEach((s, k) => { s.rotation.x = Math.sin(now * 2.6 + t.ph + k * 0.7) * (0.18 + k * 0.1); s.rotation.z = Math.cos(now * 2.1 + t.ph + k) * 0.12; });
    f.barY = D.hover + 1.0;
  }
  function ring(f) {
    const D = f.D, n = D.orbs, off = Math.random() * TAU;
    const y = f.y + D.hover;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      const o = buildOrb(D.orbR);
      o.position.set(f.x, y, f.z);
      scene.add(o);
      orbs.push({ m: o, x: f.x, y, z: f.z, vx: Math.cos(a) * D.orbSpeed, vz: Math.sin(a) * D.orbSpeed, life: D.orbLife, r: D.orbR, dmg: D.dmg, t: 0 });
    }
    sound.sfx('bellRing');
    for (let i = 0; i < 14; i++) { const a = Math.random() * TAU; sparks.spawn({ x: f.x, y, z: f.z, vx: Math.cos(a) * 3, vy: (Math.random() - 0.5) * 2, vz: Math.sin(a) * 3, life: 0.4, size: 0.15, color: '#ffc6ea', glow: 2 }); }
  }
  function updateOrbs(dt) {
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.t += dt; o.life -= dt;
      o.x += o.vx * dt; o.z += o.vz * dt;
      // they sink from the bell down to chest height, then glide on
      const gy = world.groundAt(o.x, o.z);
      o.y = lerp(o.y, gy + 0.75, Math.min(1, dt * 4));
      o.m.position.set(o.x, o.y + Math.sin(o.t * 8) * 0.04, o.z);
      o.m.rotation.set(o.t * 3, o.t * 2, 0);
      if (Math.random() < 0.35) sparks.spawn({ x: o.x, y: o.y, z: o.z, life: 0.3, size: 0.13, color: '#ff8fd0', glow: 1.4, drag: 5 });
      let pop = o.life <= 0;
      if (!pop && Math.hypot(P.x - o.x, P.z - o.z) < o.r + 0.32 && Math.abs(P.y + 0.8 - o.y) < 0.9) { if (ctx.hurtPlayer(o.dmg, o.x, o.z)) pop = true; }
      if (!pop && world.shotBlocked(o.x, o.y, o.z, 0.1)) pop = true;   // houses, trees, the crystal wall: orbs stop at anything solid
      if (pop) {
        for (let k = 0; k < 6; k++) { const a = Math.random() * TAU; sparks.spawn({ x: o.x, y: o.y, z: o.z, vx: Math.cos(a) * 1.5, vy: Math.random() * 1.5, vz: Math.sin(a) * 1.5, life: 0.3, size: 0.12, color: '#ffc6ea', glow: 2 }); }
        if (o.life > 0) sound.sfx('orbPop');
        scene.remove(o.m);
        orbs.splice(i, 1);
      }
    }
  }

  // a pebble: one orb, small and stony, flying straight
  function pebble(x, y, z, dx, dz, speed, dmg = 1) {
    const o = buildOrb(0.16);
    o.position.set(x, y, z);
    o.traverse((c) => { if (c.material) { c.material = c.material.clone(); c.material.color && c.material.color.set('#d8d0c4'); } });
    scene.add(o);
    orbs.push({ m: o, x, y, z, vx: dx * speed, vz: dz * speed, life: 2.2, r: 0.18, dmg, t: 0, pebble: true });
    sound.sfx('spit');
  }

  // ---------------------------------------------------------------------------
  // Shard-mite: darts at you in short bursts, pauses, darts again. Weak alone; nasty in a clutch.
  // ---------------------------------------------------------------------------
  function shardmite(f, dt) {
    const D = f.D, m = f.m, tp = toPlayer(f);
    f.t += dt;
    const now = performance.now() / 1000;
    let run = 0;
    if (f.state === 'chase') {
      if (f.t >= (f.wait || 0.4)) { f.state = 'dash'; f.t = 0; const a = Math.atan2(tp.x, tp.z) + (Math.random() - 0.5) * 0.7; f.dir = { x: Math.sin(a), z: Math.cos(a) }; sound.sfx('skitter'); }
      turnTo(f, Math.atan2(tp.x, tp.z), 10, dt);
    } else if (f.state === 'dash') {
      run = 1;
      moveFoe(f, f.dir.x * D.dash * dt, f.dir.z * D.dash * dt);
      turnTo(f, Math.atan2(f.dir.x, f.dir.z), 14, dt);
      if (!f.bit && touch(f, D.reach, D.dmg)) f.bit = true;
      if (f.t >= D.dashT) { f.state = 'chase'; f.t = 0; f.bit = false; f.wait = rnd(...D.pause); }
    } else if (f.state === 'stagger' || f.state === 'stun') {
      if (f.t >= (f.state === 'stun' ? 1.2 : 0.3)) { f.state = 'chase'; f.t = 0; f.wait = 0.5; }
    }
    for (const L of m.legs) L.lg.rotation.x = run ? Math.sin(now * 40 + L.zz * 20 + (L.s > 0 ? 0 : Math.PI)) * 0.6 : Math.sin(now * 3 + L.zz * 9) * 0.05;
    m.mandibles.forEach((md, i) => { md.rotation.y = (i ? 1 : -1) * (0.2 + Math.abs(Math.sin(now * 12)) * 0.3 * (run || 0.3)); });
    m.body.position.y = run ? Math.abs(Math.sin(now * 30)) * 0.05 : 0;
    f.barY = 0.8;
  }

  // ---------------------------------------------------------------------------
  // Cliff Barnacle: stuck to the rock, it opens its mouth (the warning) and spits a pebble at you.
  // Its shell turns a sword. Pull it off the wall with the Tether and it flops about, soft.
  // ---------------------------------------------------------------------------
  function barnacle(f, dt) {
    const D = f.D, m = f.m, tp = toPlayer(f);
    f.t += dt;
    const now = performance.now() / 1000;
    let open = 0;
    if (f.state === 'idle') {
      if (f.next === undefined) f.next = rnd(...D.every) * 0.7;
      f.next -= dt;
      if (f.next <= 0 && tp.d < D.range && !world.shotBlocked((f.x + P.x) / 2, f.y + 0.8, (f.z + P.z) / 2)) { f.state = 'tell'; f.t = 0; sound.sfx('crabTell'); }
      open = 0.15 + Math.sin(now * 1.5 + f.x) * 0.1;
    } else if (f.state === 'tell') {
      open = Math.min(1, f.t / D.tell);
      m.body.position.x = Math.sin(f.t * 50) * 0.02;
      if (f.t >= D.tell) { const a = Math.atan2(tp.x, tp.z); pebble(f.x, f.y + 0.85, f.z, Math.sin(a), Math.cos(a), D.shot, D.dmg); f.state = 'idle'; f.t = 0; f.next = rnd(...D.every); m.body.position.x = 0; }
    } else if (f.state === 'loose') {
      // pulled off the rock: it flops on its back, soft side up
      open = 1;
      m.body.rotation.x = lerp(m.body.rotation.x, 1.7, Math.min(1, dt * 10));
      m.body.position.y = 0.35 + Math.abs(Math.sin(now * 9)) * 0.12;
      if (f.t >= D.stun) { f.state = 'crawl'; f.t = 0; }
    } else if (f.state === 'crawl') {
      // righted, it can't climb back up: it shuffles at you and nips
      open = 0.4;
      m.body.rotation.x = lerp(m.body.rotation.x, 0, Math.min(1, dt * 6));
      m.body.position.y = 0;
      moveFoe(f, tp.x * 0.9 * dt, tp.z * 0.9 * dt);
      touch(f, 0.85, 1);
    } else if (f.state === 'stagger') {
      if (f.t > 0.3) { f.state = f.wasLoose ? 'crawl' : 'idle'; f.t = 0; }
    }
    m.lids[0].rotation.z = open * 0.9; m.lids[1].rotation.z = -open * 0.9;
    m.inner.scale.setScalar(0.6 + open * 0.6);
    m.feather.forEach((fe, i) => { fe.rotation.x = Math.sin(now * 5 + i) * 0.4 * open; fe.scale.y = 0.3 + open; });
    f.face = Math.atan2(tp.x, tp.z);
    f.barY = 1.5;
  }
  // is its shell in the way? (only while it's on the rock with its mouth shut)
  const shelled = (f) => (f.kind === 'barnacle' && (f.state === 'idle')) ;

  // ---------------------------------------------------------------------------
  // The Barnacle Mother: four plates shield her. Tether them off (the brass ring on each), then strike.
  // She spits fans of pebbles, slams the pool so a wave rolls out (roll through it), and calls her brood.
  // ---------------------------------------------------------------------------
  const waves = [];
  function mother(f, dt) {
    const D = f.D, m = f.m, tp = toPlayer(f);
    const now = performance.now() / 1000;
    f.t += dt;
    if (!f.plates) f.plates = m.plates.map(() => ({ on: true, t: 0 }));
    const exposed = f.plates.filter((p) => !p.on).length;
    const phase = f.hp / D.hp > 0.5 ? 0 : 1;
    if (phase !== f.phase) { f.phase = phase; if (phase === 1) { sound.sfx('roar'); ctx.shake(0.6); ctx.toast('The Barnacle Mother is furious'); } }
    // plates grow back, one at a time
    for (const [k, p] of f.plates.entries()) {
      if (p.on) continue;
      p.t += dt;
      if (p.t >= D.regrow * (phase ? 0.8 : 1) && f.plates.filter((q) => !q.on && q.t >= D.regrow * (phase ? 0.8 : 1)).indexOf(p) === 0) {
        p.on = true; p.t = 0; m.plates[k].p.visible = true; m.plates[k].sl.position.set(0, 0, 0); m.plates[k].sl.rotation.set(0, 0, 0);
        sound.sfx('clank');
      }
    }
    // breathing, eyes looking about, the crown turning
    m.core.scale.set(1 + Math.sin(now * 1.4) * 0.02, 1 + Math.sin(now * 1.4 + 1) * 0.03, 1 + Math.sin(now * 1.4) * 0.02);
    m.crown.rotation.y += dt * (0.3 + phase * 0.3);
    m.cirri.forEach((ch, i) => ch.forEach((seg, j) => { seg.rotation.z = Math.sin(now * 2.2 + i + j * 0.8) * (0.25 + j * 0.12); seg.rotation.x = Math.cos(now * 1.7 + i * 1.3) * 0.2; }));
    m.eyes.forEach((e, i) => { e.visible = Math.sin(now * 0.9 + i * 2.1) > -0.92; });
    m.soft.scale.setScalar(1 + Math.sin(now * 3) * 0.05 + exposed * 0.03);
    f.barY = 0;
    if (ctx.bossHold && ctx.bossHold()) return;
    if (f.state === 'up') { f.state = 'idle'; f.t = 0; f.next = 1.5; }
    if (f.state === 'idle') {
      f.next -= dt;
      if (f.next <= 0) {
        const opts = ['spit', 'slam', 'spit'];
        if (foes.filter((o) => o.alive && o.kind === 'shardmite' && Math.hypot(o.x - f.x, o.z - f.z) < 12).length < 3) opts.push('brood');
        let pk = opts[Math.floor(Math.random() * opts.length)];
        if (pk === f.last && Math.random() < 0.6) pk = opts[(opts.indexOf(pk) + 1) % opts.length];
        f.last = pk; f.state = pk; f.t = 0; f.fired = 0;
        if (pk === 'slam') sound.sfx('creak');
      }
    } else if (f.state === 'spit') {
      // the crown's mouth swells (the warning), then a fan of pebbles, two or three times
      m.mouthGlow.scale.setScalar(1 + Math.min(1, f.t / 0.5) * 0.8);
      const shots = phase ? 3 : 2;
      if (f.t > 0.55 + f.fired * 0.55 && f.fired < shots) {
        const a0 = Math.atan2(tp.x, tp.z), n = phase ? 7 : 5;
        for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.22 + (f.fired % 2) * 0.11; pebble(f.x + Math.sin(a) * 1.8, f.y + 1.2, f.z + Math.cos(a) * 1.8, Math.sin(a), Math.cos(a), 6.2, 1); }
        f.fired++;
      }
      if (f.fired >= shots && f.t > 0.6 + shots * 0.55) { m.mouthGlow.scale.setScalar(1); f.state = 'idle'; f.t = 0; f.next = D.every[phase]; }
    } else if (f.state === 'slam') {
      // she heaves up (the warning), then crashes down: a ring of water rolls out across the floor
      const k = Math.min(1, f.t / 0.9);
      m.core.position.y = f.t < 0.9 ? smooth(k) * 0.8 : Math.max(0, 0.8 - (f.t - 0.9) * 8);
      if (f.t >= 1.0 && !f.fired) {
        f.fired = 1; ctx.shake(0.5); sound.sfx('impact');
        const g = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fe8ff').multiplyScalar(1.4), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
        g.rotation.x = -Math.PI / 2; g.position.set(f.x, f.y + 0.12, f.z); scene.add(g);
        waves.push({ g, x: f.x, z: f.z, y: f.y, r: 2.2, max: D.wave + phase * 2, hit: false, speed: 6.5 + phase });
        for (let i = 0; i < 30; i++) { const a = Math.random() * TAU; sparks.spawn({ x: f.x + Math.cos(a) * 2, y: f.y + 0.2, z: f.z + Math.sin(a) * 2, vx: Math.cos(a) * 4, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 4, grav: 9, life: 0.6, size: 0.16, color: '#9fe8ff', glow: 1.6 }); }
      }
      if (f.t >= 1.5) { m.core.position.y = 0; f.state = 'idle'; f.t = 0; f.next = D.every[phase]; }
    } else if (f.state === 'brood') {
      if (f.t > 0.6 && !f.fired) {
        f.fired = 1; sound.sfx('hatch');
        for (let i = 0; i < 2 + phase; i++) { const a = Math.random() * TAU; const c = spawn('shardmite', f.x + Math.cos(a) * 3, f.z + Math.sin(a) * 3); c.state = 'emerge'; }
      }
      if (f.t > 1.2) { f.state = 'idle'; f.t = 0; f.next = D.every[phase]; }
    } else if (f.state === 'stagger') { f.state = 'idle'; f.t = 0; f.next = 0.6; }
    // plates you've torn off lie on the floor for a moment, then sink into the pool
    for (const [k, p] of f.plates.entries()) if (!p.on && m.plates[k].p.visible) {
      const sl = m.plates[k].sl;
      sl.position.z = lerp(sl.position.z, 2.4, Math.min(1, dt * 6)); sl.rotation.x = lerp(sl.rotation.x, 1.85, Math.min(1, dt * 6));
      if (p.t > 2.5) { sl.position.y -= dt * 1.2; if (p.t > 4) m.plates[k].p.visible = false; }
    }
    ctx.bossBar(D.name, Math.max(0, f.hp / D.hp));
  }
  function updateWaves(dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.r += w.speed * dt;
      w.g.scale.setScalar(w.r);
      w.g.material.opacity = 0.85 * (1 - w.r / w.max);
      const d = Math.hypot(P.x - w.x, P.z - w.z);
      if (!w.hit && Math.abs(d - w.r) < 0.45 && P.y < w.y + 0.6) { if (ctx.hurtPlayer(1, w.x, w.z)) w.hit = true; }
      if (w.r >= w.max) { scene.remove(w.g); waves.splice(i, 1); }
    }
  }
  // the Tether bites a creature: what happens depends on what it is. Returns what to do with the line.
  function tethered(f) {
    if (!f.alive) return null;
    if (f.kind === 'barnacle') {
      if (f.state === 'loose' || f.state === 'crawl') return { pull: true };
      f.state = 'loose'; f.t = 0; f.wasLoose = true; sound.sfx('snap'); ctx.shake(0.2);
      const tp = toPlayer(f); const d = Math.max(0, tp.d - 1.3); moveFoe(f, tp.x * d * 0.85, tp.z * d * 0.85);
      ctx.number('Pulled off!', f.x, f.y + 1.2, f.z, false);
      return { pull: false };
    }
    if (f.kind === 'barnaclemother') {
      // the plate facing you comes away
      const tp = toPlayer(f), a = Math.atan2(-tp.x, -tp.z);
      let best = -1, bd = 9;
      f.plates = f.plates || f.m.plates.map(() => ({ on: true, t: 0 }));
      f.m.plates.forEach((pl, k) => { if (!f.plates[k].on) return; const d = Math.abs(angTo(pl.a + f.m.root.rotation.y, a)); if (d < bd) { bd = d; best = k; } });
      if (best < 0 || bd > 1.0) { sound.sfx('clank'); ctx.number('Blocked', f.x, f.y + 3, f.z, false); return { pull: false }; }
      f.plates[best].on = false; f.plates[best].t = 0;
      sound.sfx('snap'); sound.sfx('clank'); ctx.shake(0.35); ctx.hitStop(0.08);
      ctx.number('Plate torn off!', f.x, f.y + 3.2, f.z, true);
      const pl = f.m.plates[best];
      for (let i = 0; i < 16; i++) sparks.spawn({ x: f.x + Math.sin(pl.a) * 1.6, y: f.y + 1.6, z: f.z + Math.cos(pl.a) * 1.6, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, grav: 6, life: 0.6, size: 0.14, color: '#d8d0c4', glow: 1.2 });
      return { pull: false };
    }
    if (f.kind === 'doorcrab') { f.state = 'door'; f.t = 0; return { pull: true }; }
    // small creatures are yanked toward you and dazed
    if (['shardmite', 'mirrorpuddle', 'bellfish', 'lullabypod'].includes(f.kind)) {
      const tp = toPlayer(f);
      const d = Math.max(0, tp.d - 1.4);
      f.kx -= tp.x * d * 5; f.kz -= tp.z * d * 5;
      if (f.kind !== 'lullabypod') { f.state = f.kind === 'bellfish' ? 'stagger' : f.kind === 'shardmite' ? 'stun' : 'stagger'; f.t = 0; }
      return { pull: true };
    }
    return { pull: true };
  }

  // ---------------------------------------------------------------------------
  // Rootscript: above ground it can be hit; it sinks, travels toward you under the earth,
  // writes a ring of glowing letters where you stand (the warning), then bursts up through it
  // ---------------------------------------------------------------------------
  function rootscript(f, dt) {
    const D = f.D, m = f.m;
    f.t += dt;
    const now = performance.now() / 1000;
    let rise = 1;
    if (f.state === 'up') {
      f.hittable = true;
      m.fingers.forEach((fi, k) => { fi.rotation.x = Math.sin(now * 3 + k) * 0.25; fi.children.forEach((c) => { if (c.isGroup) c.rotation.x = Math.sin(now * 3 + k + 1) * 0.3; }); });
      const tp = toPlayer(f);
      turnTo(f, Math.atan2(tp.x, tp.z), 2, dt);
      if (f.t >= D.up) { f.state = 'sink'; f.t = 0; sound.sfx('rootRumble'); }
    } else if (f.state === 'sink') {
      const k = Math.min(1, f.t / 0.45);
      rise = 1 - smooth(k);
      f.hittable = k < 0.5;
      if (Math.random() < 0.5) dirt(f.x, f.y, f.z, 1);
      if (k >= 1) { f.state = 'under'; f.t = 0; f.hittable = false; m.root.visible = false; }
    } else if (f.state === 'under') {
      // a ripple of earth moves toward you
      rise = 0;
      const tp = toPlayer(f);
      if (tp.d > 0.4) moveFoe(f, tp.x * D.speed * dt, tp.z * D.speed * dt);
      if (Math.random() < dt * 22) dirt(f.x, f.y, f.z, 1);
      if (f.t >= D.under || tp.d < 0.5) {
        f.state = 'tell'; f.t = 0;
        f.target = { x: P.x, z: P.z };
        f.x = f.target.x; f.z = f.target.z;
        f.y = world.groundAt(f.x, f.z);
        const g = buildGlyphRing(D.burstR);
        g.group.position.set(f.x, f.y + 0.02, f.z);
        scene.add(g.group);
        f.glyph = g;
        sound.sfx('glyph');
      }
    } else if (f.state === 'tell') {
      rise = 0;
      const k = Math.min(1, f.t / D.tell);
      const g = f.glyph;
      g.glyphs.forEach((gl, i) => { gl.visible = i / g.glyphs.length < k * 1.1; });
      g.disc.material.opacity = 0.08 + k * 0.22 + Math.sin(f.t * 20) * 0.04 * k;
      g.group.rotation.y = f.t * 0.6;
      if (Math.random() < 0.4) dirt(f.x, f.y, f.z, 1);
      if (f.t >= D.tell) {
        f.state = 'burst'; f.t = 0;
        scene.remove(g.group); f.glyph = null;
        m.root.visible = true;
        m.root.position.set(f.x, f.y, f.z);
        sound.sfx('burst');
        ctx.shake(0.35);
        dirt(f.x, f.y, f.z, 14);
        for (let i = 0; i < 16; i++) { const a = Math.random() * TAU; sparks.spawn({ x: f.x, y: f.y + 0.3, z: f.z, vx: Math.cos(a) * 3, vy: 3 + Math.random() * 3, vz: Math.sin(a) * 3, grav: 8, life: 0.6, size: 0.14, color: '#ffc46b', glow: 2.4 }); }
        touch(f, D.burstR + 0.3, D.dmg);
      }
    } else if (f.state === 'burst') {
      const k = Math.min(1, f.t / 0.22);
      rise = 1.25 - Math.abs(1 - k) * 0.25 - (k < 1 ? 1 - k : 0);
      f.hittable = true;
      if (f.t >= 0.3) { f.state = 'up'; f.t = 0; }
    } else if (f.state === 'stagger') {
      if (f.t >= 0.35) { f.state = 'up'; f.t = D.up * 0.5; }
    }
    m.hand.position.y = (rise - 1) * 1.3;
    m.hand.scale.y = 0.6 + rise * 0.4;
    f.barY = 1.9;
  }
  function dirt(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 0.6 + Math.random() * 1.8;
      bits.spawn({ x: x + Math.cos(a) * 0.2, y: y + 0.08, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * sp, life: 0.7, size: 0.06 + Math.random() * 0.07, color: Math.random() < 0.5 ? '#6e4e36' : '#5c8f3e', floor: y });
    }
  }

  // ---------------------------------------------------------------------------
  // Doorcrab: turns slowly to face you and blocks from the front. Its claws snap when you're close.
  // Get behind it and the door on its back swings open onto nothing, pulling you in, then slams.
  // ---------------------------------------------------------------------------
  function doorcrab(f, dt) {
    const D = f.D, m = f.m, tp = toPlayer(f);
    f.t += dt;
    f.doorCd = Math.max(0, (f.doorCd || 0) - dt);
    const now = performance.now() / 1000;
    const want = Math.atan2(tp.x, tp.z);
    const behind = Math.abs(angTo(f.face, want)) > 1.9;
    let walk = 0;
    if (f.state === 'up' || f.state === 'chase') {
      f.state = 'chase';
      turnTo(f, want, D.turn, dt);
      // sidle toward you, sideways like a crab
      if (tp.d > 1.4) { moveFoe(f, tp.x * D.speed * dt, tp.z * D.speed * dt); walk = 1; }
      f.cd = (f.cd || 0) - dt;
      if (!behind && tp.d < D.reach && f.cd <= 0 && Math.abs(angTo(f.face, want)) < 0.6) { f.state = 'tell'; f.t = 0; sound.sfx('crabTell'); }
      else if (behind && tp.d < D.doorReach && f.doorCd <= 0) { f.state = 'door'; f.t = 0; f.slammed = false; sound.sfx('doorOpen'); }
      m.claws.forEach((c) => { c.c.rotation.x = lerp(c.c.rotation.x, -0.15, Math.min(1, dt * 6)); c.pin.rotation.x = Math.sin(now * 3 + c.s) * 0.1; });
    } else if (f.state === 'tell') {
      const k = Math.min(1, f.t / D.tell);
      m.claws.forEach((c) => { c.c.rotation.x = -0.9 * k; c.pin.rotation.x = 0.6 * k; });
      f.tellGlow = k * 0.8;
      if (f.t >= D.tell) { f.state = 'snap'; f.t = 0; f.tellGlow = 0; sound.sfx('snap'); }
    } else if (f.state === 'snap') {
      const k = Math.min(1, f.t / D.snap);
      m.claws.forEach((c) => { c.c.rotation.x = lerp(-0.9, 0.35, k); c.pin.rotation.x = lerp(0.6, -0.1, k); });
      if (!f.hitDone) {
        const hx = f.x + Math.sin(f.face) * 1.1, hz = f.z + Math.cos(f.face) * 1.1;
        if (Math.hypot(P.x - hx, P.z - hz) < 0.95 && ctx.hurtPlayer(D.dmg, f.x, f.z)) f.hitDone = true;
      }
      if (f.t >= D.snap + D.rest) { f.state = 'chase'; f.t = 0; f.hitDone = false; f.cd = 0.9; }
    } else if (f.state === 'door') {
      // the door swings open: a dark nothing that pulls
      const k = Math.min(1, f.t / 0.25);
      m.door.rotation.x = lerp(-0.35, -1.6, smooth(k));
      m.void.visible = true;
      const bx = f.x - Math.sin(f.face) * 0.9, bz = f.z - Math.cos(f.face) * 0.9;
      const dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz);
      if (f.t < D.doorOpen && d > 0.3 && d < D.doorReach + 0.6) ctx.pullPlayer(dx / d * D.pull * dt, dz / d * D.pull * dt);
      if (Math.random() < 0.6) sparks.spawn({ x: bx + (Math.random() - 0.5), y: f.y + 0.6 + Math.random() * 0.6, z: bz + (Math.random() - 0.5), vx: (bx - P.x) * 0.2, vz: (bz - P.z) * 0.2, life: 0.5, size: 0.14, color: '#7a5aa8', glow: 1.6 });
      if (f.t >= D.doorOpen && !f.slammed) {
        f.slammed = true;
        sound.sfx('doorSlam');
        ctx.shake(0.25);
        if (d < 1.3) ctx.hurtPlayer(D.dmg, bx, bz);
      }
      if (f.t >= D.doorOpen) m.door.rotation.x = lerp(m.door.rotation.x, -0.35, Math.min(1, dt * 18));
      if (f.t >= D.doorOpen + 0.35) { f.state = 'chase'; f.t = 0; f.doorCd = D.doorCd; m.void.visible = false; }
    } else if (f.state === 'stagger') {
      if (f.t >= 0.4) { f.state = 'chase'; f.t = 0; }
    }
    // legs scuttle
    for (const key of Object.keys(m)) if (key.startsWith('leg')) m[key].rotation.x = Math.sin(now * 14 + key.length) * 0.35 * walk;
    f.barY = 1.9;
  }

  // ---------------------------------------------------------------------------
  // Lullaby Pod: sits and hums. Its seams glow brighter and brighter, and if you leave it, it hatches.
  // ---------------------------------------------------------------------------
  function pod(f, dt) {
    const D = f.D, m = f.m;
    f.t += dt;
    if (f.state === 'up') { f.state = 'brood'; f.t = 0; }
    const k = clamp(f.t / D.hatch, 0, 1);
    m.seams.forEach((s2, i) => { s2.scale.set(1, 0.6 + k * 0.9, 1); s2.material.color.copy(s2.material.userData.base).multiplyScalar(0.6 + k * 2.4 + Math.sin(f.t * 6 + i) * 0.2 * k); });
    const shiver = k > 0.75 ? Math.sin(f.t * 50) * 0.06 * (k - 0.75) * 4 : 0;
    m.pod.rotation.z = shiver + Math.sin(f.t * 1.4) * 0.04;
    m.pod.scale.setScalar(1 + Math.sin(f.t * 2.4) * 0.03 + k * 0.08);
    f.hum = (f.hum || 0) - dt;
    if (f.hum <= 0) { f.hum = 2.2; if (Math.hypot(P.x - f.x, P.z - f.z) < 9) sound.sfx('hum'); }
    if (f.t >= D.hatch) {
      // it splits open and what was inside climbs out
      f.alive = false; f.hittable = false;
      sound.sfx('hatch');
      for (let i = 0; i < 18; i++) { const a = Math.random() * TAU; bits.spawn({ x: f.x, y: f.y + 0.8, z: f.z, vx: Math.cos(a) * 2.5, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 2.5, life: 1.2, size: 0.1, color: '#d8cfe6', floor: f.y }); }
      scene.remove(f.m.root); scene.remove(f.bar.group);
      D.brood.forEach((kind, i) => { const a = (i / D.brood.length) * TAU + Math.random(); spawn(kind, f.x + Math.cos(a) * 0.9, f.z + Math.sin(a) * 0.9); });
      return;
    }
    f.barY = 1.8;
  }

  // ---------------------------------------------------------------------------
  // The Weeping Gardener. Hangs upside down over the room; its heart glows under the crown, where hits land.
  // Phase 1: root rings and falling fruit-worlds. Phase 2: adds the branch sweep. Phase 3: its tears flood the floor.
  // ---------------------------------------------------------------------------
  const slows = [];   // frost patches from fallen snow-fruit: they slow you
  const flood = { k: 0, to: 0 };
  function endAttack(f, next) { clearActs(f); f.state = 'idle'; f.t = 0; f.next = next; }
  function gardener(f, dt) {
    const D = f.D, m = f.m;
    f.t += dt;
    const now = performance.now() / 1000;
    const frac = f.hp / D.hp;
    const phase = frac > D.phases[0] ? 0 : frac > D.phases[1] ? 1 : 2;
    if (phase !== f.phase) {
      f.phase = phase;
      if (phase > 0) {
        sound.sfx('roar'); ctx.shake(0.6);
        ctx.toast(phase === 1 ? 'The Gardener tears itself loose' : 'The Gardener weeps, and the floor floods');
        spawn('mirrorpuddle', f.x - 3, f.z + 2.5); spawn('mirrorpuddle', f.x + 3, f.z + 2.5);
        if (phase === 2) flood.to = 1;
      }
    }
    // it sways; lower and angrier as it weakens
    m.hang.rotation.z = Math.sin(now * 0.7) * 0.05;
    m.hang.rotation.x = Math.sin(now * 0.5) * 0.04;
    m.hang.position.y = -phase * 0.35;
    m.crown.rotation.y += dt * (0.15 + phase * 0.1);
    m.fruit.forEach((fr, i) => { fr.rotation.z = Math.sin(now * 1.5 + i) * 0.2; });
    m.heart.scale.setScalar(1 + Math.sin(now * 3) * 0.08);
    // tears rising from its many eyes
    if (Math.random() < dt * (8 + phase * 4)) { const e = m.eyes[Math.floor(Math.random() * m.eyes.length)]; const p = e.getWorldPosition(tmp); sparks.spawn({ x: p.x, y: p.y, z: p.z + 0.06, vy: 1.4, vx: (Math.random() - 0.5) * 0.3, life: 1.4, size: 0.1, color: '#9ff3ff', glow: 2.4, drag: 0.2 }); }
    // the eyes blink, out of step with each other; the hanging roots and the arms drift in a current you can't feel
    for (const L of m.lids) {
      L.t -= dt;
      if (L.t <= 0) { L.t = 1.5 + Math.random() * 4; L.b = 0.18; }
      L.b = Math.max(0, (L.b || 0) - dt);
      L.m.scale.y = L.b > 0 ? 1 : 0.05;
    }
    m.tendrils.forEach((chain, i) => chain.forEach((seg, j) => { seg.rotation.x = Math.sin(now * 1.1 + i * 1.7 + j * 0.6) * (0.12 + j * 0.06); seg.rotation.z = Math.cos(now * 0.9 + i) * (0.08 + j * 0.05); }));
    m.elbows.forEach((e, i) => { e.rotation.x = 0.4 + Math.sin(now * 0.8 + i * 1.3) * 0.18 - (f.state === 'sweep' ? 0.55 : 0); });
    m.fingers.forEach((fg, i) => { fg.rotation.x = 0.3 + Math.sin(now * 2 + i) * 0.25; });
    f.flinch = Math.max(0, (f.flinch || 0) - dt * 4);
    m.hang.position.x = Math.sin(now * 40) * 0.06 * f.flinch;
    f.barY = 0;
    // while it's being introduced, it only hangs there and looks at you
    if (ctx.bossHold && ctx.bossHold()) return;
    // attacks
    if (f.state === 'up') { f.state = 'idle'; f.t = 0; f.next = 1.6; }
    if (f.state === 'idle') {
      f.next -= dt;
      if (f.next <= 0) {
        const opts = phase === 0 ? ['roots', 'fruit'] : ['roots', 'fruit', 'sweep'];
        if (phase === 2) opts.push('weep');
        let pick2 = opts[Math.floor(Math.random() * opts.length)];
        if (pick2 === f.lastAttack && Math.random() < 0.6) pick2 = opts[(opts.indexOf(pick2) + 1) % opts.length];
        f.lastAttack = pick2;
        f.state = pick2; f.t = 0; f.acts = [];
        if (pick2 === 'roots') {
          // rings of glowing letters: one under you, the others nearby
          const spots = [{ x: P.x, z: P.z }];
          for (let i = 0; i < 1 + phase; i++) { const a = Math.random() * TAU, d = 2 + Math.random() * 2.5; spots.push({ x: clamp(P.x + Math.cos(a) * d, f.room.x0 + 1, f.room.x1 - 1), z: clamp(P.z + Math.sin(a) * d, f.room.z0 + 1, f.room.z1 - 1) }); }
          f.acts = spots.map((p) => { const g = buildGlyphRing(1.2); g.group.position.set(p.x, f.y + 0.02, p.z); scene.add(g.group); return { ...p, g }; });
          sound.sfx('glyph');
        } else if (pick2 === 'fruit') {
          // fruit-worlds drop where their shadows show
          const n = 3 + phase;
          for (let i = 0; i < n; i++) {
            const p = i === 0 ? { x: P.x, z: P.z } : { x: f.room.x0 + 1.5 + Math.random() * (f.room.x1 - f.room.x0 - 3), z: f.room.z0 + 1.5 + Math.random() * (f.room.z1 - f.room.z0 - 3) };
            const sh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.0, depthWrite: false }));
            sh.rotation.x = -Math.PI / 2; sh.position.set(p.x, f.y + 0.04, p.z); scene.add(sh);
            const kind = ['snow', 'sun', 'sea'][Math.floor(Math.random() * 3)];
            const fr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(kind === 'snow' ? '#f4fbff' : kind === 'sun' ? '#ffd36b' : '#4fb2d4').multiplyScalar(1.6) }));
            fr.position.set(p.x, f.y + 7, p.z); scene.add(fr);
            f.acts.push({ ...p, sh, fr, kind, delay: i * 0.25 });
          }
          sound.sfx('rustle');
        } else if (pick2 === 'sweep') {
          // a glowing arc on the floor round the tree, then the branches sweep through it
          const g = new THREE.Mesh(new THREE.RingGeometry(1.2, D.sweepR, 48, 1, 0, Math.PI * 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
          g.rotation.x = -Math.PI / 2;
          const start = Math.atan2(P.x - f.x, P.z - f.z) - Math.PI * 0.6;
          g.rotation.z = -start + Math.PI / 2 - Math.PI * 1.2;
          g.position.set(f.x, f.y + 0.05, f.z); scene.add(g);
          f.acts = [{ g, start }];
          sound.sfx('creak');
        } else if (pick2 === 'weep') {
          ring({ x: f.x, z: f.z, y: f.y - 1.3, D: { hover: 2.2, orbs: 14, orbSpeed: 3.0, orbLife: 3.6, orbR: 0.22, dmg: 1 } });
          f.state = 'idle'; f.next = D.every[phase];
        }
      }
    } else if (f.state === 'roots') {
      const k = Math.min(1, f.t / 1.05);
      for (const a of f.acts) { a.g.glyphs.forEach((gl, i) => { gl.visible = i / a.g.glyphs.length < k * 1.1; }); a.g.disc.material.opacity = 0.08 + k * 0.25; a.g.group.rotation.y = f.t * 0.7; }
      if (f.t >= 1.05) {
        ctx.shake(0.4); sound.sfx('burst');
        for (const a of f.acts) {
          scene.remove(a.g.group);
          dirt(a.x, f.y, a.z, 10);
          for (let i = 0; i < 10; i++) { const an = Math.random() * TAU; sparks.spawn({ x: a.x, y: f.y + 0.3, z: a.z, vx: Math.cos(an) * 2.5, vy: 3 + Math.random() * 2, vz: Math.sin(an) * 2.5, grav: 8, life: 0.5, size: 0.14, color: '#ffc46b', glow: 2.4 }); }
          if (Math.hypot(P.x - a.x, P.z - a.z) < 1.45) ctx.hurtPlayer(D.dmg, a.x, a.z);
          rootSpike(a.x, f.y, a.z);
        }
        endAttack(f, D.every[phase]);
      }
    } else if (f.state === 'fruit') {
      let done = true;
      for (const a of f.acts) {
        const t = f.t - a.delay;
        if (a.landed) continue;
        done = false;
        const k = clamp(t / 1.0, 0, 1);
        a.sh.material.opacity = 0.15 + k * 0.35;
        a.sh.scale.setScalar(0.5 + k * 0.5);
        a.fr.position.y = f.y + 7 - 7 * k * k;
        a.fr.rotation.set(t * 4, t * 3, 0);
        if (k >= 1) {
          a.landed = true;
          scene.remove(a.sh); scene.remove(a.fr);
          sound.sfx('splat');
          if (Math.hypot(P.x - a.x, P.z - a.z) < 0.95) ctx.hurtPlayer(1, a.x, a.z);
          if (a.kind === 'snow') {
            // a patch of frost with ice spikes in it: it slows you for a few seconds, then melts away
            const pm = buildFrost(1.4);
            pm.position.set(a.x, f.y + 0.02, a.z); scene.add(pm);
            slows.push({ x: a.x, z: a.z, r: 1.4, t: 3.5, life: 3.5, m: pm });
            for (let i = 0; i < 14; i++) sparks.spawn({ x: a.x + (Math.random() - 0.5) * 2, y: f.y + 0.2, z: a.z + (Math.random() - 0.5) * 2, vy: 0.6, life: 0.8, size: 0.12, color: '#ffffff', glow: 1.6 });
          } else if (a.kind === 'sun') {
            ring({ x: a.x, z: a.z, y: f.y - 1.1, D: { hover: 1.2, orbs: 8, orbSpeed: 3.2, orbLife: 2.6, orbR: 0.2, dmg: 1 } });
          } else {
            // a splash of sea: pushes you away
            for (let i = 0; i < 16; i++) { const an = Math.random() * TAU; sparks.spawn({ x: a.x, y: f.y + 0.2, z: a.z, vx: Math.cos(an) * 3, vy: 2 + Math.random() * 2, vz: Math.sin(an) * 3, grav: 9, life: 0.6, size: 0.14, color: '#7fd8f0', glow: 1.6 }); }
            const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz);
            if (d < 2.6 && d > 0.01) ctx.pullPlayer(dx / d * (2.6 - d) * 0.7, dz / d * (2.6 - d) * 0.7);
          }
        }
      }
      if (done && f.t > 0.5) { endAttack(f, D.every[phase]); }
    } else if (f.state === 'sweep') {
      const a = f.acts[0];
      const tellT = 1.0, sweepT = 0.45;
      if (f.t < tellT) a.g.material.opacity = 0.15 + (f.t / tellT) * 0.35 + Math.sin(f.t * 30) * 0.05;
      else {
        // the branches sweep across the arc
        const k = Math.min(1, (f.t - tellT) / sweepT);
        a.g.material.opacity = 0.5 * (1 - k);
        m.crown.rotation.y += dt * 9;
        const ang = a.start + k * Math.PI * 1.2;
        const pa = Math.atan2(P.x - f.x, P.z - f.z), pd = Math.hypot(P.x - f.x, P.z - f.z);
        if (!a.hit && pd < D.sweepR && pd > 1.0 && Math.abs(angTo(ang, pa)) < 0.35) { if (ctx.hurtPlayer(D.dmg, f.x, f.z)) a.hit = true; }
        if (Math.random() < 0.8) sparks.spawn({ x: f.x + Math.sin(ang) * D.sweepR * 0.7, y: f.y + 0.8, z: f.z + Math.cos(ang) * D.sweepR * 0.7, life: 0.4, size: 0.3, color: '#7cc35e', glow: 1.4 });
        if (k >= 1) { endAttack(f, D.every[phase]); }
      }
    } else if (f.state === 'stagger') {
      if (f.t > 0.3) { f.state = 'idle'; f.t = 0; f.next = 0.8; }
    }
    ctx.bossBar(D.name, Math.max(0, frac));
  }
  // a frost patch: a pale icy disc with a rim and a few ice spikes standing in it
  function buildFrost(r) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe9ff').multiplyScalar(1.15), transparent: true, opacity: 0.5, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; g.add(disc);
    const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6), transparent: true, opacity: 0.7, depthWrite: false }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.01; g.add(rim);
    const b = new Batch(98);
    for (let i = 0; i < 9; i++) { const a = Math.random() * TAU, d = Math.random() * r * 0.85, h = 0.25 + Math.random() * 0.45; b.box(0.14, h, 0.14, i % 2 ? '#e8f8ff' : '#a9e2ff', Math.cos(a) * d, h / 2, Math.sin(a) * d, { rotX: (Math.random() - 0.5) * 0.5, rotZ: (Math.random() - 0.5) * 0.5 }); }
    const spikes = b.mesh(); spikes.matrixAutoUpdate = true; g.add(spikes);
    g.userData = { disc, spikes };
    return g;
  }
  // take away everything an attack put on the floor: warnings, falling fruit, the sweep arc
  function clearActs(f) {
    for (const a of f.acts || []) { if (a.g && a.g.group) scene.remove(a.g.group); else if (a.g) scene.remove(a.g); if (a.sh) scene.remove(a.sh); if (a.fr) scene.remove(a.fr); }
    f.acts = [];
  }
  // a root spike that stays up for a moment after a burst
  function rootSpike(x, y, z) {
    const b = new Batch(97);
    for (let i = 0; i < 4; i++) b.box(0.16, 1.0 + Math.random() * 0.6, 0.16, i % 2 ? '#6b4a33' : '#7a5236', (Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6, { rotZ: (Math.random() - 0.5) * 0.6, rotX: (Math.random() - 0.5) * 0.6 });
    const m = b.mesh(); m.matrixAutoUpdate = true; m.position.set(x, y, z); scene.add(m);
    effects.push({ m, t: 0, life: 1.4, sink: true });
  }
  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      if (e.sink && e.t > e.life * 0.6) e.m.position.y -= dt * 3;
      if (e.t > e.life) { scene.remove(e.m); effects.splice(i, 1); }
    }
    for (let i = slows.length - 1; i >= 0; i--) {
      const z = slows[i];
      z.t -= dt;
      // it melts: the disc fades and the spikes sink over the last second
      const k = Math.min(1, z.t);
      z.m.userData.disc.material.opacity = 0.5 * k;
      z.m.userData.spikes.scale.set(1, Math.max(0.01, k), 1);
      if (Math.random() < dt * 6) sparks.spawn({ x: z.x + (Math.random() - 0.5) * z.r * 1.6, y: z.m.position.y + 0.2, z: z.z + (Math.random() - 0.5) * z.r * 1.6, vy: 0.5, life: 0.7, size: 0.1, color: '#ffffff', glow: 1.8 });
      if (z.t <= 0) { scene.remove(z.m); slows.splice(i, 1); }
    }
    // standing in frost: you sparkle with cold, so it's clear why you're slow
    if (slows.some((z) => Math.hypot(P.x - z.x, P.z - z.z) < z.r) && Math.random() < dt * 14) sparks.spawn({ x: P.x + (Math.random() - 0.5) * 0.6, y: P.y + 0.2 + Math.random() * 1.2, z: P.z + (Math.random() - 0.5) * 0.6, vy: 0.4, life: 0.6, size: 0.1, color: '#dff4ff', glow: 2 });
    flood.k += (flood.to - flood.k) * Math.min(1, dt * 0.8);
  }
  // how fast you can move here: frost patches and the flood slow you
  function slowAt(x, z) {
    let k = 1;
    for (const s2 of slows) if (Math.hypot(x - s2.x, z - s2.z) < s2.r) k = Math.min(k, 0.55);
    return k * (1 - flood.k * 0.22);
  }

  // ---------------------------------------------------------------------------
  // Getting hit and falling
  // ---------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  function hit(f, nx, nz, dmg, heavy, knock) {
    if (!f.alive || !f.hittable) return false;
    // the Doorcrab's claws stop anything that comes from the front
    if (f.kind === 'doorcrab' && f.state !== 'door' && f.state !== 'stagger') {
      const from = Math.atan2(-nx, -nz);
      if (Math.abs(angTo(f.face, from)) < f.D.guard * Math.PI / 180) {
        sound.sfx('clank');
        for (let i = 0; i < 8; i++) { const a = from + (Math.random() - 0.5) * 1.6; sparks.spawn({ x: f.x + Math.sin(f.face) * 0.6, y: f.y + 0.5, z: f.z + Math.cos(f.face) * 0.6, vx: Math.sin(a) * 3, vy: Math.random() * 2.5, vz: Math.cos(a) * 3, drag: 3, life: 0.35, size: 0.12, color: '#ffe9a8', glow: 2.6 }); }
        f.kx += nx * knock * 0.4; f.kz += nz * knock * 0.4;
        f.m.claws.forEach((c) => { c.c.rotation.x = -0.5; });
        ctx.number('Blocked', f.x, f.y + 1.2, f.z, false);
        return true;
      }
    }
    // a barnacle on its rock turns the sword with its shell (its open mouth is soft)
    if (shelled(f)) {
      sound.sfx('clank'); ctx.number('Blocked', f.x, f.y + 1.2, f.z, false);
      for (let i = 0; i < 6; i++) sparks.spawn({ x: f.x, y: f.y + 0.6, z: f.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, drag: 3, life: 0.3, size: 0.1, color: '#ffe9a8', glow: 2.4 });
      return true;
    }
    // the Mother: her plates turn the sword; every plate you've torn away lets more of a blow through
    if (f.kind === 'barnaclemother') {
      const open = (f.plates || []).filter((p) => !p.on).length;
      if (!open) { sound.sfx('clank'); ctx.number('Blocked', f.x, f.y + 3, f.z, false); return true; }
      dmg = Math.round(dmg * (0.35 + open * 0.3));
      knock = 0;
    }
    // the guardian has its own bar at the top of the screen
    if (f.kind === 'gardener') { dmg = Math.round(dmg); }
    f.hp -= dmg * (f.kind === 'doorcrab' && f.state === 'door' ? 1.5 : 1);
    f.flashT = 1;
    f.kx += nx * knock * f.D.knockTaken * (heavy ? 1.8 : 1) * 2.2;
    f.kz += nz * knock * f.D.knockTaken * (heavy ? 1.8 : 1) * 2.2;
    f.bar.set(Math.max(0, f.hp / f.D.hp));
    f.bar.group.visible = true;
    const hy = f.y + (f.kind === 'bellfish' ? f.D.hover : 0.4);
    const col = f.kind === 'mirrorpuddle' ? '#9fe6ff' : f.kind === 'bellfish' ? '#ffc6ea' : '#ffc46b';
    for (let i = 0; i < (heavy ? 18 : 10); i++) {
      const a = Math.atan2(nx, nz) + (Math.random() - 0.5) * 2.2, sp = 2 + Math.random() * 4.5;
      sparks.spawn({ x: f.x, y: hy, z: f.z, vx: Math.sin(a) * sp, vy: (Math.random() - 0.2) * 4, vz: Math.cos(a) * sp, drag: 4, grav: 5, life: 0.35 + Math.random() * 0.3, size: 0.14, color: i % 3 ? col : '#ffffff', glow: 2.6 });
    }
    sound.sfx(f.kind === 'mirrorpuddle' ? 'squelch' : f.kind === 'bellfish' ? 'bellHit' : 'wood', heavy ? 1.2 : 1);
    sound.sfx('hit', 0.7);
    ctx.number(String(dmg), f.x, hy + 0.7, f.z, heavy);
    // a heavy hit (or any hit on a creature mid-warning, for the puddle) knocks it out of what it was doing
    // (the guardian has poise: it flinches, but never drops what it's doing, so its warnings always play out)
    if ((f.kind === 'gardener' || f.kind === 'barnaclemother') && f.hp > 0) { f.flinch = 1; }
    else if (f.hp > 0 && (heavy || (f.kind === 'mirrorpuddle' && f.state === 'tell'))) {
      if (f.state !== 'under' && f.state !== 'tell' || f.kind === 'mirrorpuddle') { f.state = 'stagger'; f.t = 0; f.m.body.position.x = 0; f.tellGlow = 0; }
    }
    if (f.hp <= 0) die(f, nx, nz);
    return true;
  }
  function die(f, nx, nz) {
    f.alive = false; f.hittable = false;
    if (ctx.onKill) ctx.onKill(f);
    const hy = f.y + (f.kind === 'bellfish' ? f.D.hover : 0.35);
    const cols = f.kind === 'mirrorpuddle' ? ['#3f9fc4', '#62c3e0', '#ff9f7a'] : f.kind === 'bellfish' ? ['#e2a5d8', '#f2c8e9', '#ffd27a'] : ['#6b4a33', '#7a5236', '#ffc46b'];
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU, sp = 1.5 + Math.random() * 3.5;
      bits.spawn({ x: f.x, y: hy, z: f.z, vx: Math.cos(a) * sp + nx * 2, vy: 2 + Math.random() * 3.5, vz: Math.sin(a) * sp + nz * 2, life: 1.3, size: 0.09 + Math.random() * 0.1, color: cols[i % 3], floor: f.y });
    }
    for (let i = 0; i < 22; i++) { const a = Math.random() * TAU; sparks.spawn({ x: f.x, y: hy, z: f.z, vx: Math.cos(a) * 3.5, vy: Math.random() * 4, vz: Math.sin(a) * 3.5, drag: 3, grav: 3, life: 0.6, size: 0.18, color: i % 2 ? '#ffffff' : '#9ff3ff', glow: 3 }); }
    const big = f.kind === 'gardener' || f.kind === 'barnaclemother';
    sound.sfx(big ? 'impact' : 'pop');
    ctx.hitStop(big ? 0.4 : 0.09);
    if (f.kind === 'barnaclemother') {
      ctx.bossBar(null);
      for (const w of waves) scene.remove(w.g);
      waves.length = 0;
      for (const o of foes) if (o.alive && o.kind === 'shardmite') { o.alive = false; o.hittable = false; scene.remove(o.m.root); scene.remove(o.bar.group); }
      for (let i = 0; i < 50; i++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 5; bits.spawn({ x: f.x, y: f.y + 1 + Math.random() * 2, z: f.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, life: 2, size: 0.12 + Math.random() * 0.18, color: ['#cfc6b8', '#e8a0a8', '#d8d0c4'][i % 3], floor: f.y }); }
      if (ctx.onGuardianDown) ctx.onGuardianDown(f);
    }
    if (f.kind === 'gardener') {
      ctx.bossBar(null);
      flood.to = 0;
      clearActs(f);
      for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 5; bits.spawn({ x: f.x, y: f.y + 2 + Math.random() * 3, z: f.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, life: 2, size: 0.12 + Math.random() * 0.18, color: ['#4e3a30', '#3f7a5a', '#4a8a66'][i % 3], floor: f.y }); }
      if (ctx.onGuardianDown) ctx.onGuardianDown(f);
    }
    ctx.shake(0.3);
    scene.remove(f.m.root); scene.remove(f.bar.group);
    if (f.glyph) { scene.remove(f.glyph.group); f.glyph = null; }
    // drops: slivers of Skyglass, and now and then a heart (more likely when you're hurt)
    const n = Math.round(rnd(f.D.drops[0], f.D.drops[1] + 0.99) - 0.49);
    for (let i = 0; i < n; i++) dropSliver(f.x, hy, f.z);
    const hurt = 1 - P.hp / P.maxHp;
    if (Math.random() < SEEP.heartChance + hurt * 0.35) dropHeart(f.x, f.y, f.z);
  }

  // ---------------------------------------------------------------------------
  // Drops: slivers fly to you on their own; hearts wait for you to walk over them
  // ---------------------------------------------------------------------------
  function dropSliver(x, y, z) {
    const m = buildSliver();
    m.position.set(x, y, z);
    scene.add(m);
    const a = Math.random() * TAU, sp = 1.5 + Math.random() * 2;
    drops.push({ kind: 'sliver', m, x, y, z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 2, vz: Math.sin(a) * sp, t: 0 });
  }
  function dropHeart(x, y, z) {
    const m = buildHeartPickup();
    m.position.set(x, y + 0.5, z);
    scene.add(m);
    drops.push({ kind: 'heart', m, x, y: y + 0.5, z, vx: 0, vy: 3.5, vz: 0, t: 0, ground: y });
  }
  let sliverChain = 0, chainT = 0;
  function updateDrops(dt) {
    chainT -= dt; if (chainT <= 0) sliverChain = 0;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      const gy = world.groundAt(d.x, d.z);
      let take = false;
      if (d.kind === 'sliver') {
        if (d.t < 0.55) {
          d.vy -= 14 * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt;
          if (d.y < gy + 0.25) { d.y = gy + 0.25; d.vy = Math.abs(d.vy) * 0.4; d.vx *= 0.6; d.vz *= 0.6; }
        } else {
          // home in on you, faster and faster
          const tx = P.x - d.x, ty = P.y + 0.9 - d.y, tz = P.z - d.z, l = Math.hypot(tx, ty, tz) || 1;
          const sp = 4 + (d.t - 0.55) * 18;
          d.x += tx / l * sp * dt; d.y += ty / l * sp * dt; d.z += tz / l * sp * dt;
          if (l < 0.4) take = true;
        }
        d.m.position.set(d.x, d.y, d.z);
        d.m.rotation.set(d.t * 4, d.t * 6, 0.3);
        if (Math.random() < 0.3) sparks.spawn({ x: d.x, y: d.y, z: d.z, life: 0.25, size: 0.1, color: '#9ff3ff', glow: 1.8 });
        if (take) { ctx.addSkyglass(1); sound.sfx('sliver', 1 + Math.min(12, sliverChain++) * 0.06); chainT = 0.5; }
      } else {
        if (d.y > d.ground + 0.45 || d.vy > 0) { d.vy -= 12 * dt; d.y += d.vy * dt; if (d.y < d.ground + 0.45) { d.y = d.ground + 0.45; d.vy = 0; } }
        const bob = d.vy === 0 ? Math.sin(d.t * 3) * 0.08 : 0;
        d.m.position.set(d.x, d.y + bob, d.z);
        d.m.rotation.y = d.t * 2;
        d.m.visible = d.t < 17 || Math.sin(d.t * 20) > 0;
        const dist = Math.hypot(P.x - d.x, P.z - d.z);
        if (P.hp < P.maxHp && dist < 1.6) { d.x = lerp(d.x, P.x, Math.min(1, dt * 8)); d.z = lerp(d.z, P.z, Math.min(1, dt * 8)); }
        if (P.hp < P.maxHp && dist < 0.5) { ctx.heal(2); sound.sfx('heart'); take = true; for (let k = 0; k < 10; k++) sparks.spawn({ x: P.x, y: P.y + 0.9, z: P.z, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.6, size: 0.14, color: '#ff8a96', glow: 2 }); }
        if (d.t > 20) take = true;
      }
      if (take) { scene.remove(d.m); drops.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------------------
  // The Seep: step into the clearing and the shard seals it, then the waves come
  // ---------------------------------------------------------------------------
  const barrier = S ? buildBarrier(S.r) : null;
  const ringSolids = [];
  if (S) {
    barrier.group.position.set(S.x, S.h - 3, S.z);
    barrier.group.visible = false;
    scene.add(barrier.group);
    for (let k = 0, n = Math.ceil(TAU * S.r / 0.55); k < n; k++) { const a = (k / n) * TAU; ringSolids.push({ x: S.x + Math.cos(a) * S.r, z: S.z + Math.sin(a) * S.r, r: 0.35 }); }
  }
  const seep = { state: 'idle', t: 0, wave: -1, queue: [], sealed: false, rise: 0 };
  function seal() {
    seep.state = 'rising'; seep.t = 0; seep.sealed = true; seep.wave = -1;
    world.solids.push(...ringSolids);
    barrier.group.visible = true;
    sound.sfx('barrierUp');
    ctx.shake(0.25);
    ctx.toast(TEXT.seepSealed);
  }
  function unseal(quick) {
    seep.sealed = false;
    for (const s of ringSolids) { const i = world.solids.indexOf(s); if (i >= 0) world.solids.splice(i, 1); }
    seep.state = quick ? 'idle' : 'lowering'; seep.t = 0;
    if (!quick) sound.sfx('barrierDown');
  }
  function startWave(i) {
    seep.wave = i; seep.t = 0;
    seep.queue = SEEP.waves[i].slice();
    seep.spawnT = 0.3;
    ctx.toast(TEXT.seepWave(i + 1, SEEP.waves.length));
  }
  function spawnPoint() {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * TAU, d = rnd(1.6, S.r - 1.4);
      const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
      if (Math.hypot(x - P.x, z - P.z) < 3) continue;
      if (foes.some((f) => f.alive && Math.hypot(f.x - x, f.z - z) < 1.4)) continue;
      if (world.solidAt(x, z, 0.5)) continue;
      return { x, z };
    }
    return { x: S.x + 2, z: S.z };
  }
  function updateSeep(dt) {
    if (!S) return;
    seep.t += dt;
    const inside = Math.hypot(P.x - S.x, P.z - S.z);
    if (seep.state === 'idle') {
      world.setSeepPower(1 + Math.sin(performance.now() / 600) * 0.15);
      if (inside < S.r - 1.0 && !ctx.playerDead() && world.shardOn() && (!ctx.seepAwake || ctx.seepAwake())) seal();
    } else if (seep.state === 'rising') {
      seep.rise = Math.min(1, seep.t / 0.9);
      world.setSeepPower(1 + seep.rise);
      if (seep.t > 1.4) startWave(0);
    } else if (seep.state === 'waves') {
      // handled below
    } else if (seep.state === 'lowering') {
      seep.rise = Math.max(0, 1 - seep.t / 1.2);
      world.setSeepPower(0.2);
      if (seep.rise <= 0) { seep.state = 'spent'; seep.t = 0; barrier.group.visible = false; }
    } else if (seep.state === 'spent') {
      world.setSeepPower(0.2 + Math.min(0.8, seep.t / SEEP.recharge * 0.8));
      if (seep.t > SEEP.recharge && inside > S.r + 1) { seep.state = 'idle'; seep.t = 0; sound.sfx('shimmer'); }
    }
    if (seep.wave >= 0 && seep.sealed) {
      seep.state = 'waves';
      seep.spawnT -= dt;
      if (seep.queue.length && seep.spawnT <= 0) { const p = spawnPoint(); spawn(seep.queue.shift(), p.x, p.z); seep.spawnT = 0.45; }
      if (!seep.queue.length && !foes.some((f) => f.alive)) {
        seep.clearT = (seep.clearT || 0) + dt;
        if (seep.clearT > 1.1) {
          seep.clearT = 0;
          if (seep.wave + 1 < SEEP.waves.length) startWave(seep.wave + 1);
          else {
            // cleared: the wall sinks, the shard gives up a burst of slivers
            seep.wave = -1;
            unseal(false);
            sound.sfx('clear');
            ctx.toast(TEXT.seepClear);
            if (ctx.onSeepClear) ctx.onSeepClear();
            for (let i = 0; i < 8; i++) dropSliver(S.x, S.h + 1.4, S.z);
          }
        }
      }
    }
    barrier.group.position.y = S.h - 3 + smooth(seep.rise) * 3;
    barrier.curtain.material.uniforms.uA.value = seep.rise;
  }

  // ---------------------------------------------------------------------------
  // Every frame
  // ---------------------------------------------------------------------------
  const camDir = new THREE.Vector3();
  function update(dt, camera) {
    updateSeep(dt);
    for (const f of foes) {
      if (!f.alive) continue;
      // a placed creature dozes until you come near (or it's hit)
      if (f.asleep) {
        if (Math.hypot(P.x - f.x, P.z - f.z) < f.asleep || f.flashT > 0) f.asleep = 0;
        else { f.m.root.position.set(f.x, f.y, f.z); f.m.root.rotation.y = f.face; f.y = lerp(f.y, world.groundAt(f.x, f.z), 0.5); f.m.body.scale.y = 1 + Math.sin(performance.now() / 500 + f.x) * 0.03; continue; }
      }
      if (f.state === 'emerge' && f.kind === 'barnaclemother') {
        // she heaves herself up out of the pool
        f.t += dt;
        const k = Math.min(1, f.t / 2.2);
        f.m.root.visible = true;
        f.m.root.position.set(f.x + Math.sin(f.t * 30) * 0.05 * (1 - k), f.y - (1 - smooth(k)) * 4.5, f.z);
        if (Math.random() < 0.6) sparks.spawn({ x: f.x + (Math.random() - 0.5) * 4, y: f.y + 0.2, z: f.z + (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 2, life: 0.7, size: 0.16, color: '#9fe8ff', glow: 1.4 });
        if (k >= 1) { f.state = 'up'; f.t = 0; f.hittable = true; ctx.shake(0.5); sound.sfx('roar'); }
        continue;
      }
      if (f.state === 'emerge' && f.kind === 'gardener') {
        // the guardian lowers itself out of the dark above
        f.t += dt;
        const k = Math.min(1, f.t / 2.4);
        f.m.root.visible = true;
        f.m.root.position.set(f.x, f.y + (1 - smooth(k)) * 9, f.z);
        if (k >= 1) { f.state = 'up'; f.t = 0; f.hittable = true; ctx.shake(0.5); sound.sfx('roar'); }
        continue;
      }
      if (f.state === 'emerge') {
        // climbing out of the crack
        f.t += dt;
        const k = Math.min(1, f.t / 0.9);
        f.crack.scale.setScalar(0.3 + smooth(Math.min(1, k * 2)) * 1.0);
        f.m.root.visible = k > 0.25;
        f.m.root.position.set(f.x, f.y - (1 - smooth(k)) * 1.0, f.z);
        f.m.root.scale.setScalar(0.4 + smooth(k) * 0.6);
        if (Math.random() < 0.5) sparks.spawn({ x: f.x + (Math.random() - 0.5) * 0.8, y: f.y + 0.1, z: f.z + (Math.random() - 0.5) * 0.8, vy: 2 + Math.random() * 2, life: 0.6, size: 0.14, color: '#c6f8ff', glow: 2.4 });
        if (k >= 1) {
          f.state = f.kind === 'mirrorpuddle' ? 'chase' : f.kind === 'bellfish' ? 'drift' : 'up';
          f.t = 0; f.hittable = true;
          f.bar.group.visible = true;
          f.m.root.scale.setScalar(1);
        }
        f.m.root.rotation.y = f.face;
        continue;
      }
      if (f.crack) {
        f.crackT = (f.crackT || 0) + dt;
        f.crack.scale.setScalar(Math.max(0.01, 1.3 * (1 - f.crackT / 0.6)));
        if (f.crackT > 0.6) { scene.remove(f.crack); f.crack = null; }
      }
      if (f.kind === 'mirrorpuddle') puddle(f, dt);
      else if (f.kind === 'bellfish') bellfish(f, dt);
      else if (f.kind === 'rootscript') rootscript(f, dt);
      else if (f.kind === 'doorcrab') doorcrab(f, dt);
      else if (f.kind === 'lullabypod') pod(f, dt);
      else if (f.kind === 'gardener') gardener(f, dt);
      else if (f.kind === 'shardmite') shardmite(f, dt);
      else if (f.kind === 'barnacle') barnacle(f, dt);
      else if (f.kind === 'barnaclemother') mother(f, dt);
      if (!f.alive) continue;
      // knockback from your hits, sliding out
      if (Math.abs(f.kx) + Math.abs(f.kz) > 0.01) { moveFoe(f, f.kx * dt, f.kz * dt); const k = Math.exp(-9 * dt); f.kx *= k; f.kz *= k; }
      separate(f, dt);
      f.y = lerp(f.y, world.groundAt(f.x, f.z), Math.min(1, dt * 12));
      if (f.state !== 'under' && f.state !== 'tell' || f.kind !== 'rootscript') {
        f.m.root.position.set(f.x, f.y, f.z);
        f.m.root.rotation.y = f.face;
      }
      // the hit flash, plus the puddle's warning glow
      f.flashT = Math.max(0, f.flashT - dt * 7);
      f.m.flash(Math.max(f.flashT, (f.tellGlow || 0) * (0.35 + 0.25 * Math.sin(performance.now() / 40))));
      // health bar: floats above, fades a little at full health (the guardian's is at the top of the screen)
      const showBar = f.m.root.visible && f.state !== 'under' && f.kind !== 'gardener' && f.kind !== 'barnaclemother' && !f.asleep;
      f.bar.group.visible = showBar;
      if (showBar) {
        f.bar.group.position.set(f.x, f.y + (f.barY || 1.2), f.z);
        f.bar.update(dt);
        f.bar.opacity(f.hp < f.D.hp ? 1 : 0.55);
      }
    }
    // clean up the fallen
    for (let i = foes.length - 1; i >= 0; i--) if (!foes[i].alive) { if (foes[i].crack) scene.remove(foes[i].crack); foes.splice(i, 1); }
    updateOrbs(dt);
    updateDrops(dt);
    updateEffects(dt);
    updateWaves(dt);
  }

  // you fell: everything in the Seep goes quiet again, nothing is lost
  function reset() {
    for (const f of foes) { if (f.acts) clearActs(f); scene.remove(f.m.root); scene.remove(f.bar.group); if (f.crack) scene.remove(f.crack); if (f.glyph) scene.remove(f.glyph.group); }
    foes.length = 0;
    for (const o of orbs) scene.remove(o.m);
    orbs.length = 0;
    for (const z of slows) scene.remove(z.m);
    slows.length = 0;
    for (const w of waves) scene.remove(w.g);
    waves.length = 0;
    for (const e of effects) scene.remove(e.m);
    effects.length = 0;
    flood.k = 0; flood.to = 0;
    if (!S) return;
    if (seep.sealed) unseal(true);
    seep.state = 'idle'; seep.wave = -1; seep.rise = 0; seep.queue = [];
    barrier.group.visible = false;
    barrier.group.position.y = S.h - 3;
  }

  // targets for your swings and sling drops
  function targets() { return foes.filter((f) => f.alive && f.hittable); }
  // the Seep goes quiet (after its fight, or when you come back from the Rift)
  function rest() {
    if (!S) return;
    if (seep.sealed) unseal(true);
    seep.state = 'spent'; seep.t = 0; seep.rise = 0; seep.wave = -1;
    barrier.group.visible = false;
  }
  return { update, hit, targets, reset, rest, spawn, tethered, list: foes, seep, dropHeart, dropSliver, slowAt, flood, alive: () => foes.some((f) => f.alive) };
}
