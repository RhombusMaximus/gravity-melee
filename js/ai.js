// gravity-melee :: AI pilots
// State machine per ship: approach -> engage -> orbit | slingshot | recover.
// Targets are STICKY (hysteresis) — the pilot's targeting computer keeps its
// lock unless another enemy is much closer. Winners fly victory laps.
// Writes into ship.ctrl { thrust, turn, fire, special, brake }.
(function (GM) {
  const { U } = GM;
  const S = GM.SCALE;
  const AI = {};
  GM.AI = AI;

  AI.mkBrain = () => ({
    mode: 'approach',
    modeT: 0,
    jinkT: 0, jinkDir: 1,
    retargetT: 0,
    orbitDir: U.randSign(),
    tgt: null,
    los: true,
    lapDir: U.randSign(),
  });

  function dist2(s, a) {
    const w = U.wrapDelta(s.x, s.y, a.x, a.y);
    return w.x * w.x + w.y * w.y;
  }

  function pickTarget(s, world) {
    const foes = world.ships.filter((f) => !f.dead && f.team !== s.team);
    if (!foes.length) return null;
    // sticky lock: keep the current target unless someone else is much closer
    const cur = s.aiBrain ? s.aiBrain.tgt : null;
    if (cur && !cur.dead && foes.includes(cur)) {
      let nd = Infinity;
      for (const f of foes) nd = Math.min(nd, dist2(s, f));
      if (dist2(s, cur) < nd * 2.9) return cur;   // ~1.7x distance hysteresis
    }
    if (U.chance(0.25)) {                        // finish-off mode
      foes.sort((a, b) => a.crew - b.crew);
      return foes[0];
    }
    foes.sort((a, b) => dist2(s, a) - dist2(s, b));
    return foes[0];
  }

  function losBlocked(s, tgt) {
    const P = GM.PHYS.planet;
    const w = U.wrapDelta(s.x, s.y, tgt.x, tgt.y);
    // check both the straight segment and (roughly) wrapped paths
    const d = U.len(w.x, w.y);
    const ex = s.x + w.x, ey = s.y + w.y;
    if (U.segCircle(s.x, s.y, ex, ey, P.x, P.y, P.r + 2)) return true;
    return false;
  }

  // steer toward a world point, planet-aware; returns {turn, thrust}
  function steerTo(s, tx, ty) {
    const P = GM.PHYS.planet;
    const w = U.wrapDelta(s.x, s.y, tx, ty);
    const dist = U.len(w.x, w.y);
    let goalA = U.ang(w.x, w.y);

    // if the direct line grazes the planet, aim at a tangent waypoint on the
    // limb instead — the ship naturally swings around the well
    const ex = s.x + w.x, ey = s.y + w.y;
    const LIMB_R = P.r + 44 * S;
    if (U.segCircle(s.x, s.y, ex, ey, P.x, P.y, P.r + 26 * S)) {
      const pd = U.wrapDelta(s.x, s.y, P.x, P.y);
      const toP = U.ang(pd.x, pd.y);
      const side = U.angDiff(toP, goalA) > 0 ? 1 : -1;   // which side the goal is on
      const limbA = toP + side * (Math.PI / 2);
      goalA = U.ang(...Object.values(U.wrapDelta(s.x, s.y,
        U.wrapX(P.x + Math.cos(limbA) * LIMB_R),
        U.wrapY(P.y + Math.sin(limbA) * LIMB_R))));
    }

    const diff = U.angDiff(s.ang, goalA);
    let turn = U.clamp(diff * 3, -1, 1);
    let thrust = 1;
    const v = U.len(s.vx, s.vy);
    if (dist < 26 * S && v > 70 * S) thrust = 0;   // about to overshoot the point
    return { turn, thrust };
  }

  // hard avoidance: steer along the planet's tangent
  function tangentAvoid(s, pd, planetDist) {
    const P = GM.PHYS.planet;
    const t1 = U.ang(-pd.y, pd.x);
    const t2 = U.ang(pd.y, -pd.x);
    const d1 = U.angDiff(s.ang, t1);
    const d2 = U.angDiff(s.ang, t2);
    // prefer the tangent that keeps current momentum
    const keep1 = Math.abs(d1 - U.angDiff(s.ang, U.ang(s.vx, s.vy)));
    const keep2 = Math.abs(d2 - U.angDiff(s.ang, U.ang(s.vx, s.vy)));
    const use = keep1 < keep2 ? t1 : t2;
    const diff = U.angDiff(s.ang, use);
    return { turn: U.clamp(diff * 4, -1, 1), thrust: planetDist < P.r + 26 * S ? 0.5 : 1 };
  }

  // victory laps: orbit the planet, no combat
  function victoryPilot(s, b, world, dt) {
    const P = GM.PHYS.planet;
    const pd = U.wrapDelta(s.x, s.y, P.x, P.y);
    const curA = U.ang(-pd.x, -pd.y);            // planet -> ship
    const rv = P.r + 120 * S + s.spec.orbit * 0.5;
    const wa = curA + b.lapDir * 0.5;            // waypoint half a radian ahead
    const st = steerTo(s, P.x + Math.cos(wa) * rv, P.y + Math.sin(wa) * rv);
    s.ctrl.turn = st.turn;
    s.ctrl.thrust = 1;
    s.ctrl.fire = false;
    s.ctrl.brake = false;
    // the occasional show-off afterburner
    if (s.spec.special.type === 'afterburner' && s.scd <= 0 &&
        s.batt > s.spec.special.cost * 2 + s.spec.special.drain && U.chance(dt * 0.35)) {
      s.useSpecial(world);
    }
  }

  AI.update = (s, world, dt) => {
    const b = s.aiBrain;
    if (!b || s.human) return;

    // winners fly victory laps
    if (world.winner === s.team) { victoryPilot(s, b, world, dt); return; }

    const arch = s.ai;
    const w = s.spec.weapon;
    const P = GM.PHYS.planet;

    b.modeT += dt;
    b.jinkT -= dt;
    b.retargetT -= dt;

    if (!b.tgt || b.tgt.dead || b.retargetT <= 0) {
      b.tgt = pickTarget(s, world);
      b.retargetT = 2 + U.rand(2);
    }
    if (!b.tgt) {
      s.ctrl.thrust = 0; s.ctrl.turn = 0; s.ctrl.fire = false;
      return;
    }
    const tgt = b.tgt;
    const tw = U.wrapDelta(s.x, s.y, tgt.x, tgt.y);
    const dist = U.len(tw.x, tw.y);
    b.los = !losBlocked(s, tgt);

    // planet state
    const pd = U.wrapDelta(s.x, s.y, P.x, P.y);
    const planetDist = U.len(pd.x, pd.y);
    const planetAhead = planetDist < P.r + 85 * S &&
      Math.abs(U.angDiff(s.ang, U.ang(pd.x, pd.y))) < 1.2;

    const crewFrac = s.crew / s.crewMax;
    const battFrac = s.batt / s.battMax;

    // ---- mode selection ----
    let mode = b.mode;
    if (crewFrac < 0.3 * (2 - arch.caution) && dist < 200 * S) mode = 'recover';
    else if (dist > 190 * S) mode = b.los ? 'approach' : 'slingshot';
    else if (b.los) mode = dist < 50 * S ? 'orbit' : 'engage';
    else mode = dist < 120 * S ? 'orbit' : 'slingshot';
    if (mode === 'recover' && (dist > 240 * S || crewFrac > 0.55)) mode = 'approach';
    if (mode !== b.mode) {
      b.mode = mode; b.modeT = 0;
      if (mode === 'orbit' || mode === 'slingshot') b.orbitDir = U.randSign();
    }

    // ---- steering per mode ----
    let steer;
    if (b.mode === 'approach') {
      steer = steerTo(s, tgt.x, tgt.y);
    } else if (b.mode === 'engage' || b.mode === 'orbit') {
      // circle the target at weapon-friendly range
      const off = s.spec.orbit * (1 + arch.orbitBias) * (b.mode === 'orbit' ? 1.15 : 0.85);
      const cirA = U.ang(tw.x, tw.y) + b.orbitDir * (b.mode === 'orbit' ? 1.05 : 0.7);
      steer = steerTo(s, s.x + Math.cos(cirA) * off, s.y + Math.sin(cirA) * off);
    } else if (b.mode === 'slingshot') {
      // no LOS: aim for a waypoint on the planet limb in the target's direction,
      // so we naturally swing around the gravity well
      const limbA = U.ang(-pd.x, -pd.y) + b.orbitDir * 0.55;
      const lr = P.r + 60 * S;
      const wx = P.x + Math.cos(limbA) * lr;
      const wy = P.y + Math.sin(limbA) * lr;
      steer = steerTo(s, wx, wy);
    } else { // recover
      // hide behind the planet relative to the target: park on the far limb
      const hideA = U.ang(tw.x, tw.y);                     // direction target->us, extended
      const hr = P.r + 72 * S;
      const hx = P.x - Math.cos(hideA) * hr;               // opposite side from target
      const hy = P.y - Math.sin(hideA) * hr;
      steer = steerTo(s, hx, hy);
      if (battFrac > 0.9 && crewFrac > 0.45) steer.thrust = 1;
    }

    let turn = steer.turn, thrust = steer.thrust;

    // ---- planet avoidance override (last resort; steerTo usually routes around) ----
    if (planetAhead) {
      const av = tangentAvoid(s, pd, planetDist);
      turn = av.turn; thrust = av.thrust;
    }

    // ---- jink (evasion) when enemy is close and shooting ----
    // (trigger re-armed here; actual weave applied after gunnery, between volleys)
    if (b.jinkT <= 0 && dist < 170 * S && (tgt.totalShots > 0 || crewFrac < 0.5)) {
      b.jinkT = U.rand(0.25, 0.8) * (1.4 - arch.jink * 0.6);
      b.jinkDir = U.randSign();
    }

    // ---- gunnery: lead prediction, planet-aware ----
    let fire = false;
    if (dist < 270 * S && b.los) {
      let t0 = dist / w.speed;
      let aim = null;
      for (let k = 0; k < 3; k++) {
        const px = tgt.x + tgt.vx * t0, py = tgt.y + tgt.vy * t0;
        aim = U.wrapDelta(s.x, s.y, U.wrapX(px), U.wrapY(py));
        t0 = U.len(aim.x, aim.y) / w.speed;
      }
      const aimAng = U.ang(aim.x, aim.y);
      const aimDist = U.len(aim.x, aim.y);
      const diff = U.angDiff(s.ang, aimAng);
      const tol = w.tol * (2 - arch.aim);
      const clear = !U.segCircle(s.x, s.y,
        s.x + Math.cos(aimAng) * (aimDist + 8),
        s.y + Math.sin(aimAng) * (aimDist + 8),
        P.x, P.y, P.r + 3);
      if (Math.abs(diff) < tol && clear) {
        fire = true;
        turn = U.clamp(turn + diff * 0.5, -1, 1);
      } else {
        turn = U.clamp(turn + diff * 0.3, -1, 1);
      }
      // don't fire from inside own blast radius (colossus)
      if (fire && w.aoe && aimDist < w.aoe * 0.9) fire = false;
      // conserve battery for specials-heavy archetypes
      if (fire && battFrac < 0.25 && U.chance(0.5)) fire = false;
    }

    // ---- jink weave between volleys (never while firing: don't spoil aim) ----
    if (b.jinkT > 0 && !fire && b.mode !== 'slingshot' && b.mode !== 'recover') {
      turn = U.clamp(turn + b.jinkDir * 0.55 * arch.jink, -1, 1);
    }

    // ---- specials ----
    if (s.scd <= 0 && s.batt >= s.spec.special.cost * 1.15) {
      const sp = s.spec.special;
      let use = false;
      switch (sp.type) {
        case 'afterburner':
          use = (dist > 70 * S && b.mode === 'approach') ||
                (planetDist < P.r + 40 * S && U.chance(0.5));
          break;
        case 'shield':
          use = dist < 100 * S || s.hitT > 0.02;
          break;
        case 'pulse':
          use = dist < 105 * S;
          break;
        case 'missile':
          use = dist > 85 * S && dist < 250 * S;
          break;
        case 'mine':
          use = dist < 140 * S && U.chance(0.5);
          break;
        case 'blink':
          use = (b.mode === 'slingshot' && U.chance(0.6)) ||
                (crewFrac < 0.4 && dist > 110 * S && U.chance(0.5));
          break;
      }
      if (use && U.chance(dt * 2.5 * arch.special)) s.useSpecial(world);
    }

    // ---- commit ----
    s.ctrl.turn = turn;
    s.ctrl.thrust = thrust;
    s.ctrl.fire = fire;
    s.ctrl.brake = false;
  };
})(window.GM);