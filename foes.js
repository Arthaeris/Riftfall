/* Riftfall — foes.js
   Creatures from the Rifts: how they move, warn, attack, get hit and fall; what they drop;
   and the Seep, the clearing that seals itself and sends them out in waves. */
import * as THREE from 'three';
import { FOES, SEEP, TEXT } from '@rf/data';
import { buildFoe, buildBar, buildSliver, buildHeartPickup, buildBarrier, buildRiftCrack, buildGlyphRing, buildOrb, clamp, lerp, TAU } from '@rf/art';

const smooth = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);
const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ctx (from game.js): scene, world, P, sparks, bits, sound, hurtPlayer(dmg, x, z), shake(k), hitStop(s),
//                     number(text, x, y, z, heavy), addSkyglass(n), heal(n), toast(text), playerDead()
export function createFoes(ctx) {
  const { scene, world, P, sparks, bits, sound } = ctx;
  const S = world.seep;
  const foes = [], orbs = [], drops = [], effects = [];

  // ---------------------------------------------------------------------------
  // Spawning: a crack of light opens in the ground and the creature climbs out
  // ---------------------------------------------------------------------------
  function spawn(kind, x, z) {
    const D = FOES[kind];
    const m = buildFoe(kind);
    const y = world.groundAt(x, z);
    m.root.position.set(x, y, z);
    m.root.visible = false;
    scene.add(m.root);
    const bar = buildBar(kind === 'bellfish' ? 0.8 : 0.9);
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
    foes.push(f);
    sound.sfx('emerge');
    return f;
  }

  // ---------------------------------------------------------------------------
  // Moving: stay on walkable ground, inside the clearing while it's sealed, and out of each other's way
  // ---------------------------------------------------------------------------
  function moveFoe(f, dx, dz) {
    const step = (x, z) => {
      if (seep.sealed && Math.hypot(x - S.x, z - S.z) > S.r - 0.75) return false;
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
      if (!pop && (world.solidAt(o.x, o.z, 0.05) || gy > o.y)) pop = true;
      if (pop) {
        for (let k = 0; k < 6; k++) { const a = Math.random() * TAU; sparks.spawn({ x: o.x, y: o.y, z: o.z, vx: Math.cos(a) * 1.5, vy: Math.random() * 1.5, vz: Math.sin(a) * 1.5, life: 0.3, size: 0.12, color: '#ffc6ea', glow: 2 }); }
        if (o.life > 0) sound.sfx('orbPop');
        scene.remove(o.m);
        orbs.splice(i, 1);
      }
    }
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
  // Getting hit and falling
  // ---------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  function hit(f, nx, nz, dmg, heavy, knock) {
    if (!f.alive || !f.hittable) return false;
    f.hp -= dmg;
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
    if (f.hp > 0 && (heavy || (f.kind === 'mirrorpuddle' && f.state === 'tell'))) {
      if (f.state !== 'under' && f.state !== 'tell' || f.kind === 'mirrorpuddle') { f.state = 'stagger'; f.t = 0; f.m.body.position.x = 0; f.tellGlow = 0; }
    }
    if (f.hp <= 0) die(f, nx, nz);
    return true;
  }
  function die(f, nx, nz) {
    f.alive = false; f.hittable = false;
    const hy = f.y + (f.kind === 'bellfish' ? f.D.hover : 0.35);
    const cols = f.kind === 'mirrorpuddle' ? ['#3f9fc4', '#62c3e0', '#ff9f7a'] : f.kind === 'bellfish' ? ['#e2a5d8', '#f2c8e9', '#ffd27a'] : ['#6b4a33', '#7a5236', '#ffc46b'];
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU, sp = 1.5 + Math.random() * 3.5;
      bits.spawn({ x: f.x, y: hy, z: f.z, vx: Math.cos(a) * sp + nx * 2, vy: 2 + Math.random() * 3.5, vz: Math.sin(a) * sp + nz * 2, life: 1.3, size: 0.09 + Math.random() * 0.1, color: cols[i % 3], floor: f.y });
    }
    for (let i = 0; i < 22; i++) { const a = Math.random() * TAU; sparks.spawn({ x: f.x, y: hy, z: f.z, vx: Math.cos(a) * 3.5, vy: Math.random() * 4, vz: Math.sin(a) * 3.5, drag: 3, grav: 3, life: 0.6, size: 0.18, color: i % 2 ? '#ffffff' : '#9ff3ff', glow: 3 }); }
    sound.sfx('pop');
    ctx.hitStop(0.09);
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
  const barrier = buildBarrier(S.r);
  barrier.group.position.set(S.x, S.h - 3, S.z);
  barrier.group.visible = false;
  scene.add(barrier.group);
  const ringSolids = [];
  for (let k = 0, n = Math.ceil(TAU * S.r / 0.55); k < n; k++) { const a = (k / n) * TAU; ringSolids.push({ x: S.x + Math.cos(a) * S.r, z: S.z + Math.sin(a) * S.r, r: 0.35 }); }
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
    seep.t += dt;
    const inside = Math.hypot(P.x - S.x, P.z - S.z);
    if (seep.state === 'idle') {
      world.setSeepPower(1 + Math.sin(performance.now() / 600) * 0.15);
      if (inside < S.r - 1.0 && !ctx.playerDead()) seal();
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
      else rootscript(f, dt);
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
      // health bar: floats above, fades a little at full health
      const showBar = f.m.root.visible && f.state !== 'under';
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
  }

  // you fell: everything in the Seep goes quiet again, nothing is lost
  function reset() {
    for (const f of foes) { scene.remove(f.m.root); scene.remove(f.bar.group); if (f.crack) scene.remove(f.crack); if (f.glyph) scene.remove(f.glyph.group); }
    foes.length = 0;
    for (const o of orbs) scene.remove(o.m);
    orbs.length = 0;
    if (seep.sealed) unseal(true);
    seep.state = 'idle'; seep.wave = -1; seep.rise = 0; seep.queue = [];
    barrier.group.visible = false;
    barrier.group.position.y = S.h - 3;
  }

  // targets for your swings and sling drops
  function targets() { return foes.filter((f) => f.alive && f.hittable); }
  return { update, hit, targets, reset, spawn, list: foes, seep, dropHeart, dropSliver };
}
