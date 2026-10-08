// gravity-melee :: rendering — baked pixel planet/moon, HUD, menus
(function (GM) {
  const { U } = GM;
  const R = { planetCv: null, moonCv: null };

  R.init = () => {
    R.planetCv = bakePlanet(GM.PHYS.planet.r, [
      '#3d2418', '#5a3a26', '#7a4a30', '#96653d', '#b07a48', '#c9975e',
    ]);
    R.moonCv = bakePlanet(GM.PHYS.moon.r, [
      '#2a2d36', '#3c414e', '#565d6e', '#6e778a', '#8b95ab',
    ]);
  };

  function bakePlanet(r, ramp) {
    const d = r * 2;
    const cv = document.createElement('canvas');
    cv.width = d; cv.height = d;
    const g = cv.getContext('2d');
    // craters seeded deterministically
    const craters = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 5; i++) {
      const a = rnd() * U.TAU, rr = rnd() * (r - 6);
      craters.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 1.5 + rnd() * 3.5 });
    }
    for (let py = 0; py < d; py++) {
      for (let px = 0; px < d; px++) {
        const dx = px - r + 0.5, dy = py - r + 0.5;
        const dist = U.len(dx, dy);
        if (dist > r) continue;
        let v = Math.sin(px * 0.55 + 1.7) + Math.sin(py * 0.62 + 0.4)
              + Math.sin((px + py) * 0.33 + 3.1) + Math.sin(py * 0.3) * 0.9;
        for (const c of craters) {
          const cd = U.len(px - r + 0.5 - c.x, py - r + 0.5 - c.y);
          if (cd < c.r) v -= (c.r - cd) * 0.9;
          else if (cd < c.r + 1) v += 0.6;
        }
        // limb darkening + top-left light
        const light = (dx * -0.5 + dy * -0.7) / (r || 1);
        v += light * 1.4 + (dist / r - 0.5) * 1.8;
        const idx = U.clamp(Math.round((v + 4) / 8 * (ramp.length - 1)), 0, ramp.length - 1);
        g.fillStyle = ramp[idx];
        g.fillRect(px, py, 1, 1);
      }
    }
    return cv;
  }

  // ---------- world drawing ----------
  R.drawWorld = (g, world, t) => {
    const P = GM.PHYS.planet;
    const M = GM.PHYS.moon;
    const mp = world.moonPos();

    GM.FX.drawStars(g, t);

    // gravity field rings
    g.strokeStyle = '#1c2a44';
    g.globalAlpha = 0.5;
    g.setLineDash([2, 5]);
    for (const rr of [P.knee, P.rInf]) {
      g.beginPath(); g.arc(P.x, P.y, rr, 0, U.TAU); g.stroke();
    }
    g.setLineDash([]);
    // danger ring
    g.strokeStyle = world.surgeMult > 1.05 ? '#a03028' : '#4a2430';
    g.globalAlpha = 0.5;
    g.beginPath(); g.arc(P.x, P.y, P.r + 40, 0, U.TAU); g.stroke();
    g.globalAlpha = 1;

    // moon orbit path
    g.strokeStyle = '#1a2233';
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(P.x, P.y, M.orbitR, 0, U.TAU); g.stroke();
    g.globalAlpha = 1;

    // planet glow (stronger with surge)
    const surgeGlow = world.surgeMult > 1.05;
    const glowR = P.r + 6 + Math.sin(t * 2) * 1.5 + (world.surgeMult - 1) * 4;
    const grd = g.createRadialGradient(P.x, P.y, P.r * 0.6, P.x, P.y, glowR + 10);
    grd.addColorStop(0, surgeGlow ? 'rgba(255,120,60,0.28)' : 'rgba(255,150,90,0.16)');
    grd.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(P.x, P.y, glowR + 10, 0, U.TAU); g.fill();

    // planet body
    g.drawImage(R.planetCv, (P.x - P.r) | 0, (P.y - P.r) | 0);

    // surge pulses
    if (surgeGlow) {
      const k = (t * 0.8) % 1;
      g.strokeStyle = '#ff6a3a';
      g.globalAlpha = (1 - k) * 0.5;
      g.beginPath(); g.arc(P.x, P.y, P.r + k * 90, 0, U.TAU); g.stroke();
      g.globalAlpha = 1;
    }

    // moon
    g.drawImage(R.moonCv, (mp.x - M.r) | 0, (mp.y - M.r) | 0);

    // mines
    for (const s of world.ships) {
      for (const m of s.mines) {
        const blink = Math.sin(m.t * 8) > 0;
        g.fillStyle = s.team === (GM.humanShip ? GM.humanShip.team : -2)
          ? GM.TEAMS[s.team].P : '#ffb04a';
        g.fillStyle = GM.TEAMS[s.team].P;
        g.fillRect((m.x - 1) | 0, (m.y - 1) | 0, 3, 3);
        if (m.armed && blink) {
          g.fillStyle = '#fff';
          g.fillRect(m.x | 0, m.y | 0, 1, 1);
        }
      }
    }

    // shots
    for (const sh of world.shots) {
      g.fillStyle = sh.col;
      const sp = U.norm(sh.vx, sh.vy);
      const tl = Math.min(4, sh.size + 2);
      g.fillRect((sh.x - sp.x * tl / 2 - sh.size / 2) | 0, (sh.y - sp.y * tl / 2 - sh.size / 2) | 0, sh.size, sh.size);
      g.fillRect((sh.x + sp.x * tl / 2 - sh.size / 2) | 0, (sh.y + sp.y * tl / 2 - sh.size / 2) | 0, sh.size, sh.size);
    }

    // missiles
    for (const ms of world.missiles) {
      g.save();
      g.translate(ms.x, ms.y);
      g.rotate(ms.ang + Math.PI / 2);
      g.fillStyle = '#e8e8f4';
      g.fillRect(-1, -3, 2, 5);
      g.fillStyle = GM.TEAMS[ms.team].P;
      g.fillRect(-1, -3, 2, 1);
      // exhaust
      if (U.chance(0.6)) {
        g.fillStyle = '#ffb04a';
        g.fillRect(-1, 2, 2, 1 + (Math.random() * 2 | 0));
      }
      g.restore();
      // smoke trail
      GM.FX.emit(ms.x, ms.y, 1, { spd: 6, life: 0.4, col: '#6a7080', size: 1 });
    }

    // ships
    for (const s of world.ships) s.draw(g, t);

    // AI debug
    if (GM.debugAI) R.drawDebug(g, world);

    GM.FX.draw(g);

    // screen flash
    if (GM.FX.flash > 0.01) {
      g.globalAlpha = GM.FX.flash;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, GM.W, GM.H);
      g.globalAlpha = 1;
    }
  };

  R.drawDebug = (g, world) => {
    g.font = '7px monospace';
    for (const s of world.ships) {
      if (s.dead || !s.aiBrain) continue;
      const b = s.aiBrain;
      if (b.tgt && !b.tgt.dead) {
        const w = U.wrapDelta(s.x, s.y, b.tgt.x, b.tgt.y);
        g.strokeStyle = GM.TEAMS[s.team].P;
        g.globalAlpha = 0.35;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(s.x + w.x, s.y + w.y);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = '#cfe0ff';
      g.textAlign = 'left';
      g.fillText(b.mode + (b.los ? '' : ' !LOS'), s.x + 8, s.y - 6);
    }
  };

  // ---------- HUD ----------
  R.drawHUD = (g, world) => {
    const mode = world.mode;
    const blocks = mode.teams.length;

    g.font = 'bold 8px monospace';
    g.textAlign = 'left';
    const xs = blocks === 1 ? [GM.W / 2 - 55] : blocks === 2 ? [8, GM.W - 108] : [8, GM.W / 2 - 50, GM.W - 108];
    world.teams.forEach((teamShips, ti) => {
      const T = GM.TEAMS[ti];
      const x0 = xs[ti];
      let y = 6;
      g.fillStyle = T.P;
      g.fillRect(x0, y, 4, 4);
      g.fillStyle = '#cfe0ff';
      g.fillText(T.name, x0 + 7, y + 4);
      y += 8;
      for (const s of teamShips) {
        if (s.dead) {
          g.fillStyle = '#3a4356';
          g.fillRect(x0, y, 100, 3);
          y += 5;
          continue;
        }
        // crew bar
        g.fillStyle = '#1a2030';
        g.fillRect(x0, y, 100, 3);
        g.fillStyle = s.crew / s.crewMax > 0.35 ? T.P : '#ff5648';
        g.fillRect(x0, y, Math.round(100 * s.crew / s.crewMax), 3);
        // battery bar
        g.fillStyle = '#232c40';
        g.fillRect(x0, y + 3, 100, 2);
        g.fillStyle = '#ffd85e';
        g.fillRect(x0, y + 3, Math.round(100 * s.batt / s.battMax), 2);
        // markers (left blocks: after bars; right blocks: before bars to avoid clipping)
        const mkX = x0 > GM.W / 2 ? x0 - 14 : x0 + 104;
        if (s.human) {
          g.fillStyle = '#fff';
          g.fillText('◆', mkX, y + 3);
        }
        if (s.ai) {
          g.fillStyle = '#7488a8';
          g.fillText(s.ai.label.slice(0, 4).toUpperCase(), mkX, y + 3);
        }
        y += 9;
      }
    });

    // timer + surge state, top center
    const tm = Math.floor(world.time);
    const mm = String(Math.floor(tm / 60)).padStart(1, '0');
    const ss = String(tm % 60).padStart(2, '0');
    g.textAlign = 'center';
    g.font = 'bold 10px monospace';
    g.fillStyle = world.surgeMult > 1.05 ? '#ff7a4a' : '#8fa2c0';
    g.fillText(mm + ':' + ss + (world.surgeMult > 1.05 ? '  SURGE ×' + world.surgeMult.toFixed(1) : ''), GM.W / 2, 14);

    // bottom status line
    g.font = '8px monospace';
    g.textAlign = 'right';
    g.fillStyle = '#55688a';
    let st = 'SPD ×' + GM.speed + (GM.paused ? '  [PAUSED]' : '') + (GM.debugAI ? '  [AI]' : '');
    g.fillText(st, GM.W - 6, GM.H - 6);
    g.textAlign = 'left';
    if (!GM.humanShip) {
      g.fillStyle = '#7fd4ff';
      g.fillText('[Q] take the helm of a ship', 6, GM.H - 6);
    } else {
      const s = GM.humanShip;
      g.fillStyle = '#ffd85e';
      g.fillText('HELM: ' + s.name + '  [' + s.spec.name + ']', 6, GM.H - 6);
      // special readiness
      const sp = s.spec.special;
      const ready = s.scd <= 0 && s.batt >= sp.cost;
      g.fillStyle = ready ? '#8ef2ff' : '#5a6478';
      g.fillText('SP [' + sp.label + ']' + (ready ? ' READY' : ''), 6, GM.H - 16);
    }
    g.textAlign = 'left';
  };

  // ---------- screens ----------
  R.dim = (g, a) => {
    g.fillStyle = 'rgba(4,6,12,' + a + ')';
    g.fillRect(0, 0, GM.W, GM.H);
  };

  R.title = (g, t) => {
    R.dim(g, 0.55);
    g.textAlign = 'center';
    // big blocky title
    g.font = 'bold 34px monospace';
    g.fillStyle = '#0a0e18';
    g.fillText('GRAVITY MELEE', GM.W / 2 + 2, 84 + 2);
    g.fillStyle = '#7fd4ff';
    g.fillText('GRAVITY MELEE', GM.W / 2, 84);
    g.font = '9px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('gravity-well space skirmishes — AI pilots duel, you take the helm when you dare', GM.W / 2, 100);

    const blink = Math.sin(t * 3) > -0.3;
    if (blink) {
      g.font = 'bold 11px monospace';
      g.fillStyle = '#fff';
      g.fillText('PRESS  1 · 2 · 3  TO START A MELEE', GM.W / 2, 150);
    }
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText('[1] 1v1    [2] 2v2    [3] 3v3v3', GM.W / 2, 168);
    g.fillText('Q take helm · WASD fly · SPACE fire · SHIFT special · TAB back to AI', GM.W / 2, 196);
    g.fillText('G AI minds · P pause · M mute · -/= sim speed', GM.W / 2, 210);
    g.fillStyle = '#3c4a66';
    g.fillText('v' + GM.VERSION + ' — a love letter to Star Control II melee', GM.W / 2, GM.H - 14);
    g.textAlign = 'left';
  };

  R.victory = (g, world) => {
    R.dim(g, 0.62);
    g.textAlign = 'center';
    const y0 = 70;
    if (world.winner === -1) {
      g.font = 'bold 26px monospace';
      g.fillStyle = '#ff9a5a';
      g.fillText('MUTUAL DESTRUCTION', GM.W / 2, y0 + 10);
      g.font = '9px monospace';
      g.fillStyle = '#8fa2c0';
      g.fillText('no survivors — the planet keeps its secrets', GM.W / 2, y0 + 28);
    } else {
      const T = GM.TEAMS[world.winner];
      g.font = 'bold 26px monospace';
      g.fillStyle = T.P;
      g.fillText(T.name + ' DOMINATES', GM.W / 2, y0 + 10);
      // survivors
      g.font = '9px monospace';
      const surv = world.ships.filter((s) => !s.dead);
      g.fillStyle = '#cfe0ff';
      g.fillText('survivors: ' + surv.map((s) => s.name + ' (' + s.kills + ')').join('  ·  '), GM.W / 2, y0 + 28);
    }
    // kill board
    g.font = '8px monospace';
    let yy = y0 + 56;
    world.teams.forEach((teamShips, ti) => {
      const T = GM.TEAMS[ti];
      g.fillStyle = T.P;
      g.fillText(T.name, GM.W / 2 - 120, yy);
      yy += 11;
      for (const s of teamShips) {
        g.fillStyle = s.dead ? '#4a5468' : '#aebdd6';
        g.fillText((s.dead ? '  ✝ ' : '  ★ ') + s.name.padEnd(8) + ' — ' + s.spec.name + ' — kills ' + s.kills, GM.W / 2 - 120, yy);
        yy += 11;
      }
      yy += 6;
    });
    const blink = Math.sin((GM.clockT || 0) * 3) > -0.3;
    if (blink) {
      g.font = 'bold 11px monospace';
      g.fillStyle = '#fff';
      g.fillText('[R]EMATCH   ·   [ESC] MENU', GM.W / 2, GM.H - 40);
    }
    g.textAlign = 'left';
  };

  R.pausedOverlay = (g) => {
    R.dim(g, 0.5);
    g.textAlign = 'center';
    g.font = 'bold 22px monospace';
    g.fillStyle = '#fff';
    g.fillText('PAUSED', GM.W / 2, GM.H / 2);
    g.font = '8px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('P to resume', GM.W / 2, GM.H / 2 + 16);
    g.textAlign = 'left';
  };

  GM.R = R;
})(window.GM);