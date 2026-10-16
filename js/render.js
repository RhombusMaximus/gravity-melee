// gravity-melee :: rendering — baked pixel planet/moon, camera-space HUD, menus
(function (GM) {
  const { U } = GM;
  const R = { planetCv: null, moonCv: null, planetImg: null, planetFrames: null, planetKey: null };

  R.init = () => {
    R.planetCv = bakePlanet(GM.PHYS.planet.r, [
      '#3d2418', '#5a3a26', '#7a4a30', '#96653d', '#b07a48', '#c9975e',
    ]);
    R.moonCv = bakePlanet(GM.PHYS.moon.r, [
      '#2a2d36', '#3c414e', '#565d6e', '#6e778a', '#8b95ab',
    ]);
    R.pickPlanet();
  };

  // ---- Star Control II planet discs (js/content.js, CC BY-NC-SA 2.5) ----
  // Each match picks a random SC2 world for the planet AND a different one
  // for the moon. Gas giants, magma, the Rainbow Worlds and radioactive
  // worlds get palette-cycled "flowing" frames, the classic SC2
  // color-table animation trick.
  R.moonImg = null;
  R.moonFrames = null;
  R.moonKey = null;

  R.pickPlanet = () => {
    R.planetImg = null;
    R.planetFrames = null;
    R.moonImg = null;
    R.moonFrames = null;
    const C = GM.CONTENT;
    const keys = C && C.planets ? Object.keys(C.planets) : [];
    if (!keys.length) return;
    const key = U.pick(keys);
    R.planetKey = key;
    const img = new Image();
    img.onload = () => {
      if (R.planetKey !== key) return;   // a new match re-picked meanwhile
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      R.planetImg = cv;
      if (C.cycle.includes(key)) R.bakeCycle(cv);
    };
    img.src = C.planets[key];

    // moon: a DIFFERENT planet type, so the pair looks intentional
    const moonKeys = keys.filter((k) => k !== key);
    const mkey = moonKeys.length ? U.pick(moonKeys) : key;
    R.moonKey = mkey;
    const mimg = new Image();
    mimg.onload = () => {
      if (R.moonKey !== mkey) return;
      const cv = document.createElement('canvas');
      cv.width = mimg.width; cv.height = mimg.height;
      cv.getContext('2d').drawImage(mimg, 0, 0);
      R.moonImg = cv;
      if (C.cycle.includes(mkey)) R.moonFrames = R.bakeCycleFrames(cv);
    };
    mimg.src = C.planets[mkey];
  };

  // bake N palette-rotation frames from a disc canvas; returns the frame list
  R.bakeCycleFrames = (src) => {
    const w = src.width, h = src.height;
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const seen = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) continue;
      seen.set((d[i] << 16) | (d[i + 1] << 8) | d[i + 2], 0);
    }
    if (seen.size < 2) return null;
    const lum = (c) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.6 + (c & 255) * 0.1;
    const ramp = [...seen.keys()].sort((a, b) => lum(a) - lum(b));
    const idx = new Map(ramp.map((c, i) => [c, i]));
    const N = 12;
    const frames = [];
    for (let f = 0; f < N; f++) {
      const fd = new Uint8ClampedArray(d.length);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 16) continue;
        const k = ramp[(idx.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) + f) % ramp.length];
        fd[i] = k >> 16; fd[i + 1] = (k >> 8) & 255; fd[i + 2] = k & 255; fd[i + 3] = 255;
      }
      const fcv = document.createElement('canvas');
      fcv.width = w; fcv.height = h;
      fcv.getContext('2d').putImageData(new ImageData(fd, w, h), 0, 0);
      frames.push(fcv);
    }
    return frames;
  };

  // pre-bake N palette-rotation frames: every pixel's color advances along
  // the luminance-sorted palette ramp, one step per frame
  R.bakeCycle = (src) => {
    R.planetFrames = R.bakeCycleFrames(src);
  };

  // the planet canvas to draw this frame: cycled frame, plain SC2 disc, or
  // the baked procedural fallback while the image loads
  R.planetFrame = (t) => {
    if (!R.planetImg) return R.planetCv;
    if (R.planetFrames && R.planetFrames.length) {
      return R.planetFrames[Math.floor((t || 0) * 9) % R.planetFrames.length];
    }
    return R.planetImg;
  };

  function bakePlanet(r, ramp) {
    const d = r * 2;
    const cv = document.createElement('canvas');
    cv.width = d; cv.height = d;
    const g = cv.getContext('2d');
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
        const light = (dx * -0.5 + dy * -0.7) / (r || 1);
        v += light * 1.4 + (dist / r - 0.5) * 1.8;
        const idx = U.clamp(Math.round((v + 4) / 8 * (ramp.length - 1)), 0, ramp.length - 1);
        g.fillStyle = ramp[idx];
        g.fillRect(px, py, 1, 1);
      }
    }
    return cv;
  }

  // ---------- world drawing (camera-space via U.eff) ----------
  R.drawWorld = (g, world, t) => {
    const P = GM.PHYS.planet;
    const M = GM.PHYS.moon;
    const mp = world.moonPos();
    const e2 = U.eff(P.x, P.y);    // planet on screen

    GM.FX.drawStars(g, t);

    const zs = GM.zoomCur;   // world->canvas zoom factor

    // gravity field rings
    g.strokeStyle = '#1c2a44';
    g.globalAlpha = 0.5;
    g.setLineDash([2, 5]);
    for (const rr of [P.knee, P.rInf]) {
      g.beginPath(); g.arc(e2.x, e2.y, rr * zs, 0, U.TAU); g.stroke();
    }
    g.setLineDash([]);
    // danger ring
    g.strokeStyle = world.surgeMult > 1.05 ? '#a03028' : '#4a2430';
    g.beginPath(); g.arc(e2.x, e2.y, (P.r + 40) * zs, 0, U.TAU); g.stroke();
    g.globalAlpha = 1;

    // moon orbit path
    g.strokeStyle = '#1a2233';
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(e2.x, e2.y, M.orbitR * zs, 0, U.TAU); g.stroke();
    g.globalAlpha = 1;

    // planet glow (stronger with surge)
    const surgeGlow = world.surgeMult > 1.05;
    const glowR = (P.r + 6 + Math.sin(t * 2) * 1.5 + (world.surgeMult - 1) * 4) * zs;
    const grd = g.createRadialGradient(e2.x, e2.y, P.r * 0.6 * zs, e2.x, e2.y, glowR + 10 * zs);
    grd.addColorStop(0, surgeGlow ? 'rgba(255,120,60,0.28)' : 'rgba(255,150,90,0.16)');
    grd.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(e2.x, e2.y, glowR + 10 * zs, 0, U.TAU); g.fill();

    // planet body: the picked Star Control II disc (palette-cycled for gas/
    // rainbow worlds), positioned by its .ani anchor point; procedural
    // baked disc as fallback
    const pcv = R.planetFrame(t);
    const ph = Math.max(2, Math.round(P.r * 2 * zs));
    const pw = Math.max(2, Math.round(ph * pcv.width / pcv.height));
    const an = (GM.CONTENT.anchors && GM.CONTENT.anchors[R.planetKey]) || [pcv.width / 2, pcv.height / 2];
    g.drawImage(pcv, (e2.x - pw * an[0] / pcv.width) | 0, (e2.y - ph * an[1] / pcv.height) | 0, pw, ph);

    // surge pulses
    if (surgeGlow) {
      const k = (t * 0.8) % 1;
      g.strokeStyle = '#ff6a3a';
      g.globalAlpha = (1 - k) * 0.5;
      g.beginPath(); g.arc(e2.x, e2.y, (P.r + k * 90) * zs, 0, U.TAU); g.stroke();
      g.globalAlpha = 1;
    }

    // moon: SC2 disc (palette-cycled for cycle types), baked fallback
    const em = U.eff(mp.x, mp.y);
    let mcv = R.moonImg;
    if (mcv && R.moonFrames && R.moonFrames.length) {
      mcv = R.moonFrames[Math.floor((t || 0) * 9) % R.moonFrames.length];
    }
    if (mcv) {
      const mh = Math.max(2, Math.round(M.r * 2 * zs));
      const mw = Math.max(2, Math.round(mh * mcv.width / mcv.height));
      const man = (GM.CONTENT.anchors && GM.CONTENT.anchors[R.moonKey]) || [mcv.width / 2, mcv.height / 2];
      g.drawImage(mcv, (em.x - mw * man[0] / mcv.width) | 0, (em.y - mh * man[1] / mcv.height) | 0, mw, mh);
    } else {
      const md = Math.max(2, Math.round(M.r * 2 * zs));
      g.drawImage(R.moonCv, (em.x - md / 2) | 0, (em.y - md / 2) | 0, md, md);
    }

    // mines
    for (const s of world.ships) {
      for (const m of s.mines) {
        const e = U.eff(m.x, m.y);
        if (e.x < -4 || e.x > GM.WV + 4 || e.y < -4 || e.y > GM.WH + 4) continue;
        const ms = Math.max(2, Math.round(3 * zs));
        g.fillStyle = GM.TEAMS[s.team].P;
        g.fillRect((e.x - ms / 2) | 0, (e.y - ms / 2) | 0, ms, ms);
        if (m.armed && Math.sin(m.t * 8) > 0) {
          g.fillStyle = '#fff';
          g.fillRect(e.x | 0, e.y | 0, 1, 1);
        }
      }
    }

    // shots
    for (const sh of world.shots) {
      const e = U.eff(sh.x, sh.y);
      if (e.x < -8 || e.x > GM.WV + 8 || e.y < -8 || e.y > GM.WH + 8) continue;
      const sp = U.norm(sh.vx, sh.vy);
      const sz = sh.size * zs;
      const tl = Math.min(4, sh.size + 2) * zs;
      g.fillStyle = sh.col;
      g.fillRect((e.x - sp.x * tl / 2 - sz / 2) | 0, (e.y - sp.y * tl / 2 - sz / 2) | 0, sz | 0 || 1, sz | 0 || 1);
      g.fillRect((e.x + sp.x * tl / 2 - sz / 2) | 0, (e.y + sp.y * tl / 2 - sz / 2) | 0, sz | 0 || 1, sz | 0 || 1);
    }

    // missiles
    for (const ms of world.missiles) {
      const e = U.eff(ms.x, ms.y);
      if (e.x < -8 || e.x > GM.WV + 8 || e.y < -8 || e.y > GM.WH + 8) continue;
      g.save();
      g.translate(e.x, e.y);
      g.rotate(ms.ang + Math.PI / 2);
      const mz = Math.max(1, zs);
      g.fillStyle = '#e8e8f4';
      g.fillRect(-1 * mz, -3 * mz, 2 * mz, 5 * mz);
      g.fillStyle = GM.TEAMS[ms.team].P;
      g.fillRect(-1 * mz, -3 * mz, 2 * mz, 1 * mz);
      if (U.chance(0.6)) {
        g.fillStyle = '#ffb04a';
        g.fillRect(-1 * mz, 2 * mz, 2 * mz, (1 + (Math.random() * 2 | 0)) * mz);
      }
      g.restore();
      GM.FX.emit(ms.x, ms.y, 1, { spd: 6, life: 0.4, col: '#6a7080', size: 1 });
    }

    // fighters (Kzer-Za interceptors): tiny team darts + laser beams
    for (const f of world.fighters) {
      if (f.dead) continue;
      const e = U.eff(f.x, f.y);
      if (e.x < -8 || e.x > GM.WV + 8 || e.y < -8 || e.y > GM.WH + 8) continue;
      const fz = Math.max(1, zs);
      if (f.beamT > 0) {
        g.strokeStyle = '#ffe98a';
        g.globalAlpha = Math.min(1, f.beamT / 0.12);
        g.lineWidth = Math.max(1, fz * 0.8);
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + Math.cos(f.beamAng) * f.beamLen * zs,
                 e.y + Math.sin(f.beamAng) * f.beamLen * zs);
        g.stroke();
        g.globalAlpha = 1;
        g.lineWidth = 1;
      }
      g.save();
      g.translate(e.x, e.y);
      g.rotate(f.ang + Math.PI / 2);
      g.fillStyle = GM.TEAMS[f.team].P;
      g.fillRect(-1.5 * fz, -2 * fz, 3 * fz, 5 * fz);
      g.fillStyle = '#7cff5e';
      g.fillRect(-1 * fz, -3.5 * fz, 2 * fz, 1.5 * fz);
      if (U.chance(0.6)) {
        g.fillStyle = '#ffca7a';
        g.fillRect(-0.5 * fz, 3 * fz, 1 * fz, 1.5 * fz);
      }
      g.restore();
    }

    // ships
    for (const s of world.ships) s.draw(g, t);

    GM.FX.draw(g);

    // screen flash (never during victory)
    if (GM.FX.flash > 0.01 && GM.state !== 'victory') {
      g.globalAlpha = GM.FX.flash;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, GM.WV, GM.WH);
      g.globalAlpha = 1;
    }
  };

  // ---------- targeting visuals (HUD overlay, 640x360 space) ----------
  R.drawTargeting = (g, world, t) => {
    const tgt = GM.humanTarget;
    if (!tgt || tgt.dead) return;
    const e = U.effH(tgt.x, tgt.y);
    const r = (tgt.r + 6) * GM.zoomCur * GM.VW / GM.WV;      // world radius scaled to HUD space
    const col = GM.TEAMS[tgt.team].P;
    const onscreen = e.x > 4 && e.x < GM.VW - 4 && e.y > 4 && e.y < GM.VH - 4;
    if (onscreen) {
      g.strokeStyle = col;
      g.globalAlpha = 0.9;
      const bl = 4;
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (const [sx, sy] of corners) {
        g.beginPath();
        g.moveTo(e.x + sx * r, e.y + sy * (r - bl));
        g.lineTo(e.x + sx * r, e.y + sy * r);
        g.lineTo(e.x + sx * (r - bl), e.y + sy * r);
        g.stroke();
      }
      g.globalAlpha = 1;
    } else {
      // offscreen direction arrow at the viewport edge
      const dx = e.x - GM.VW / 2, dy = e.y - GM.VH / 2;
      const a = U.ang(dx, dy);
      const m = 14;
      const hx = GM.VW / 2 - m, hy = GM.VH / 2 - m;
      const ca = Math.abs(Math.cos(a)) < 1e-9 ? 1e-9 : Math.abs(Math.cos(a));
      const sa = Math.abs(Math.sin(a)) < 1e-9 ? 1e-9 : Math.abs(Math.sin(a));
      const tx = Math.min(hx / ca, hy / sa);
      const px = GM.VW / 2 + Math.cos(a) * tx;
      const py = GM.VH / 2 + Math.sin(a) * tx;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillStyle = col;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(5, 0); g.lineTo(-3, -3); g.lineTo(-3, 3);
      g.closePath();
      g.fill();
      g.restore();
      g.globalAlpha = 1;
    }
  };

  // ---------- AI debug (HUD overlay space) ----------
  R.drawDebug = (g, world) => {
    g.font = '7px monospace';
    for (const s of world.ships) {
      if (s.dead || !s.aiBrain) continue;
      const b = s.aiBrain;
      const e = U.effH(s.x, s.y);
      if (e.x < -20 || e.x > GM.VW + 20 || e.y < -20 || e.y > GM.VH + 20) continue;
      if (b.tgt && !b.tgt.dead) {
        const te = U.effH(b.tgt.x, b.tgt.y);
        g.strokeStyle = GM.TEAMS[s.team].P;
        g.globalAlpha = 0.35;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(te.x, te.y);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = '#cfe0ff';
      g.textAlign = 'left';
      g.fillText(b.mode + (b.los ? '' : ' !LOS'), e.x + 8, e.y - 6);
    }
  };

  // ---------- HUD ----------
  R.drawHUD = (g, world) => {
    const me = GM.humanShip;
    const lockedBy = world.lockedOnMe(me);

    // ===== PLAYER PANEL (upper left) =====
    if (me && !me.dead) {
      const T = GM.TEAMS[me.team];
      g.font = 'bold 8px monospace';
      g.textAlign = 'left';
      let y = 6;
      g.fillStyle = T.P;
      g.fillRect(8, y, 4, 4);
      g.fillStyle = '#cfe0ff';
      g.fillText(me.name.toUpperCase() + ' — ' + me.spec.name, 15, y + 4);
      y += 9;
      g.fillStyle = '#1a2030';
      g.fillRect(8, y, 110, 4);
      g.fillStyle = me.crew / me.crewMax > 0.35 ? T.P : '#ff5648';
      g.fillRect(8, y, Math.round(110 * me.crew / me.crewMax), 4);
      g.fillStyle = '#232c40';
      g.fillRect(8, y + 5, 110, 3);
      g.fillStyle = '#ffd85e';
      g.fillRect(8, y + 5, Math.round(110 * me.batt / me.battMax), 3);
      y += 12;
      const sp = me.spec.special;
      let ready = me.scd <= 0 && me.batt >= sp.cost;
      let why = '';
      if (sp.type === 'fighters') {
        const airborne = world.fighters.filter((f) => f.by === me).length;
        if (airborne > 0) { ready = false; why = ' [DECK BUSY ×' + airborne + ']'; }
        else if (me.crew <= 1) { ready = false; why = ' [NO SPARE CREW]'; }
      }
      g.fillStyle = ready ? '#8ef2ff' : '#5a6478';
      g.fillText('SP ' + sp.label + (ready ? ' [READY]' : why), 8, y + 4);
      y += 10;
      // target lock warning — subtle amber pulse (never fully invisible)
      if (lockedBy.length) {
        const pulse = 0.65 + 0.35 * Math.sin((GM.clockT || 0) * 5);
        g.globalAlpha = pulse;
        g.fillStyle = '#ffb04a';
        g.fillText('⚠ LOCKED ×' + lockedBy.length, 8, y + 4);
        g.globalAlpha = 1;
      }
    } else {
      g.font = 'bold 8px monospace';
      g.textAlign = 'left';
      g.fillStyle = '#7fd4ff';
      const p1 = GM.world ? GM.world.p1 : null;
      g.fillText(p1 && !p1.dead ? 'P1 ' + p1.name.toUpperCase() + ' — [F] take the helm' : '[F] take the helm', 8, GM.VH - 8);
    }

    // ===== TARGET PANEL (upper right) =====
    const tgt = GM.humanTarget;
    if (tgt && !tgt.dead) {
      const T = GM.TEAMS[tgt.team];
      g.font = 'bold 8px monospace';
      g.textAlign = 'right';
      let y = 6;
      g.fillStyle = T.P;
      g.fillRect(GM.VW - 12, y, 4, 4);
      g.fillStyle = '#cfe0ff';
      g.fillText(tgt.name.toUpperCase() + ' — ' + tgt.spec.name, GM.VW - 15, y + 4);
      y += 9;
      g.fillStyle = '#1a2030';
      g.fillRect(GM.VW - 118, y, 110, 4);
      g.fillStyle = tgt.crew / tgt.crewMax > 0.35 ? T.P : '#ff5648';
      g.fillRect(GM.VW - 118 + (110 - Math.round(110 * tgt.crew / tgt.crewMax)), y, Math.round(110 * tgt.crew / tgt.crewMax), 4);
      g.fillStyle = '#232c40';
      g.fillRect(GM.VW - 118, y + 5, 110, 3);
      g.fillStyle = '#ffd85e';
      g.fillRect(GM.VW - 118 + (110 - Math.round(110 * tgt.batt / tgt.battMax)), y + 5, Math.round(110 * tgt.batt / tgt.battMax), 3);
      y += 12;
      const me2 = GM.humanShip;
      if (me2 && !me2.dead) {
        const w = U.wrapDelta(me2.x, me2.y, tgt.x, tgt.y);
        const dist = U.len(w.x, w.y);
        const closing = -(w.x * tgt.vx + w.y * tgt.vy) / (dist || 1);
        g.fillStyle = '#8fa2c0';
        g.fillText('RNG ' + Math.round(dist) + '  CLOSING ' + closing.toFixed(1), GM.VW - 8, y + 4);
      }
    }

    // ===== TEAM ROSTER (bottom left) =====
    g.font = '8px monospace';
    g.textAlign = 'left';
    let ry = GM.VH - 8;
    for (let ti = world.teams.length - 1; ti >= 0; ti--) {
      const teamShips = world.teams[ti];
      const T = GM.TEAMS[ti];
      for (let i = teamShips.length - 1; i >= 0; i--) {
        const s = teamShips[i];
        ry -= 9;
        g.fillStyle = s.dead ? '#39404f' : T.P;
        g.fillRect(8, ry, 4, 4);
        g.fillStyle = s.dead ? '#39404f' : '#8fa2c0';
        let tag = s.dead ? ' ✝' : '';
        if (s.human) tag = ' ◆';
        else if (GM.world && GM.world.p1 === s) tag = ' ★';
        else if (GM.playerTeam !== null && GM.playerTeam !== undefined && s.team === GM.playerTeam) tag = ' ▸';
        g.fillText(s.name + tag, 15, ry + 4);
      }
      ry -= 3;
    }

    // ===== MINIMAP (bottom right) =====
    R.drawMinimap(g, world);

    // ===== TOP CENTER: timer / surge / mode =====
    const tm = Math.floor(world.time);
    const mm = String(Math.floor(tm / 60)).padStart(1, '0');
    const ss = String(tm % 60).padStart(2, '0');
    g.textAlign = 'center';
    g.font = 'bold 10px monospace';
    g.fillStyle = world.surgeMult > 1.05 ? '#ff7a4a' : '#8fa2c0';
    g.fillText(mm + ':' + ss + (world.surgeMult > 1.05 ? '  SURGE ×' + world.surgeMult.toFixed(1) : ''), GM.VW / 2, 14);
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText(world.mode.label, GM.VW / 2, 24);

    // ===== BOTTOM status =====
    g.textAlign = 'right';
    g.fillStyle = '#55688a';
    const volPct = Math.round(GM.A.vol * 100 / 0.6);
    g.fillText('SPD ×' + GM.speed + (GM.paused ? '  [PAUSED]' : '') + (GM.debugAI ? '  [AI]' : '') + '  VOL ' + (GM.A.muted ? 'OFF' : volPct + '%') + ' [ ]', GM.VW - 6, GM.VH - 6);
    if (me && !me.dead) {
      g.textAlign = 'left';
      g.fillStyle = '#7488a8';
      g.fillText('[X] release helm  ·  [TAB] cycle target  ·  [C] wingmen: focus fire', 8, GM.VH - 6);
    }
    g.textAlign = 'left';
  };

  // ---------- minimap ----------
  R.drawMinimap = (g, world) => {
    const mw = 92, mh = 44;
    const mx = GM.VW - mw - 6, my = GM.VH - mh - 10;
    g.fillStyle = 'rgba(4,6,12,0.72)';
    g.fillRect(mx, my, mw, mh);
    g.strokeStyle = '#1b2438';
    g.strokeRect(mx, my, mw, mh);
    const sx = mw / GM.W, sy = mh / GM.H;
    const P = GM.PHYS.planet;
    g.fillStyle = '#b07a48';
    g.fillRect(mx + P.x * sx - 1, my + P.y * sy - 1, 3, 3);
    const mp = world.moonPos();
    g.fillStyle = '#8b95ab';
    g.fillRect(mx + mp.x * sx, my + mp.y * sy, 1, 1);
    for (const s of world.ships) {
      if (s.dead) continue;
      g.fillStyle = s.human ? '#fff' : GM.TEAMS[s.team].P;
      const px = mx + s.x * sx, py = my + s.y * sy;
      g.fillRect(px - 1, py - 1, s.human ? 3 : 2, s.human ? 3 : 2);
    }
    for (const f of world.fighters) {
      if (f.dead) continue;
      g.fillStyle = GM.TEAMS[f.team].P;
      g.fillRect(mx + f.x * sx, my + f.y * sy, 1, 1);
    }
    const tgt = GM.humanTarget;
    if (tgt && !tgt.dead) {
      g.strokeStyle = GM.TEAMS[tgt.team].P;
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(mx + tgt.x * sx, my + tgt.y * sy, 3, 0, U.TAU);
      g.stroke();
      g.globalAlpha = 1;
    }
    const me = GM.humanShip;
    if (me && !me.dead) {
      g.strokeStyle = '#3fc8ff';
      g.globalAlpha = 0.4;
      const zs = GM.zoomCur;
      g.strokeRect(mx + (me.x - GM.WV / 2 / zs) * sx, my + (me.y - GM.WH / 2 / zs) * sy, GM.WV / zs * sx, GM.WH / zs * sy);
      g.globalAlpha = 1;
    }
  };

  // ---------- screens ----------
  R.dim = (g, a) => {
    g.fillStyle = 'rgba(4,6,12,' + a + ')';
    g.fillRect(0, 0, GM.VW, GM.VH);
  };

  // standalone pixel-sprite renderer (select screen; art chars, nose up)
  function drawSprite(g, spec, x, y, px, team) {
    const art = spec.art;
    const w = art[0].length, h = art.length;
    const T = team !== null && team !== undefined ? GM.TEAMS[team] : { P: '#3fc8ff', S: '#155a9e' };
    g.save();
    g.translate(x, y);
    for (let r = 0; r < h; r++) {
      const row = art[r];
      for (let c = 0; c < w; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        let col = GM.CHARS[ch];
        if (ch === 'P') col = T.P;
        else if (ch === 'S') col = T.S;
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(Math.round((c - w / 2) * px), Math.round((r - h / 2) * px), px, px);
      }
    }
    g.restore();
  }
  R.drawSprite = drawSprite;

  R.title = (g, t) => {
    R.dim(g, 0.55);
    g.textAlign = 'center';
    g.font = 'bold 34px monospace';
    g.fillStyle = '#0a0e18';
    g.fillText('GRAVITY MELEE', GM.VW / 2 + 2, 86);
    g.fillStyle = '#7fd4ff';
    g.fillText('GRAVITY MELEE', GM.VW / 2, 84);
    g.font = '9px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('gravity-well space skirmishes — AI pilots duel, you take the helm when you dare', GM.VW / 2, 100);
    const blink = Math.sin(t * 3) > -0.3;
    if (blink) {
      g.font = 'bold 11px monospace';
      g.fillStyle = '#fff';
      g.fillText('PRESS  1 · 2 · 3  TO ASSEMBLE A FLEET', GM.VW / 2, 150);
    }
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText('[1] 1v1 · 30 pts    [2] 2v2 · 50 pts    [3] 3v3v3 · 66 pts', GM.VW / 2, 168);
    g.fillText('F take helm (your team) · WASD fly · Q/E strafe · SPACE fire · SHIFT special', GM.VW / 2, 196);
    g.fillText('TAB cycle targets · X release helm · C wingmen focus fire · G minds · P pause · M mute · [ ] volume', GM.VW / 2, 210);
    g.fillStyle = '#3c4a66';
    g.fillText('v' + GM.VERSION + ' — a love letter to Star Control II melee', GM.VW / 2, GM.VH - 14);
    g.textAlign = 'left';
  };

  // ---------- fleet assembly (ship select) ----------
  R.select = (g, t, sel) => {
    R.dim(g, 0.72);
    const mode = sel.mode;
    const budget = mode.budget;
    const spent = sel.idx.reduce((a, j) => a + GM.SHIPS[j].cost, 0);

    g.textAlign = 'center';
    g.font = 'bold 16px monospace';
    g.fillStyle = '#7fd4ff';
    g.fillText('FLEET ASSEMBLY', GM.VW / 2, 32);
    g.font = '9px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText(mode.label + '  ·  AZURE squadron  ·  every team flies under the same point budget', GM.VW / 2, 46);

    // budget bar
    const bw = 220, bx = GM.VW / 2 - bw / 2, by = 56;
    g.fillStyle = '#1a2030';
    g.fillRect(bx, by, bw, 5);
    g.fillStyle = spent > budget ? '#ff5648' : '#ffd85e';
    g.fillRect(bx, by, Math.round(bw * Math.min(1, spent / budget)), 5);
    g.font = '8px monospace';
    g.fillStyle = spent > budget ? '#ff5648' : '#8fa2c0';
    g.fillText('BUDGET  ' + spent + ' / ' + budget + ' PTS', GM.VW / 2, by + 14);

    // slots
    for (let i = 0; i < sel.idx.length; i++) {
      const y = 94 + i * 58;
      const cur = i === sel.cur;
      const spec = GM.SHIPS[sel.idx[i]];
      if (cur) {
        g.strokeStyle = '#7fd4ff';
        g.globalAlpha = 0.55 + 0.35 * Math.sin(t * 6);
      } else {
        g.strokeStyle = '#2a3450';
        g.globalAlpha = 1;
      }
      g.strokeRect(56, y - 16, GM.VW - 112, 52);
      g.globalAlpha = 1;

      drawSprite(g, spec, 92, y + 10, 2, 0);

      g.textAlign = 'left';
      g.font = 'bold 9px monospace';
      g.fillStyle = cur ? '#fff' : '#aebdd6';
      g.fillText(spec.name + '  ·  ' + spec.role.toUpperCase(), 122, y - 2);
      g.font = '8px monospace';
      g.fillStyle = '#6f81a0';
      g.fillText(spec.weapon.label + ' / ' + spec.special.label +
        '  ·  crew ' + spec.crew + ' · batt ' + spec.batt, 122, y + 10);
      g.textAlign = 'right';
      g.font = 'bold 11px monospace';
      let others = 0;
      sel.idx.forEach((j, k) => { if (k !== i) others += GM.SHIPS[j].cost; });
      g.fillStyle = (others + spec.cost > budget) ? '#ff5648' : '#ffd85e';
      g.fillText(spec.cost + ' PTS', GM.VW - 68, y + 8);
      g.textAlign = 'center';
    }

    // roster reference line
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText(GM.SHIPS.map((s) => s.key.toUpperCase() + ' ' + s.cost).join(' · '), GM.VW / 2, GM.VH - 40);

    const blink = Math.sin(t * 3) > -0.3;
    if (blink) {
      g.font = 'bold 11px monospace';
      g.fillStyle = '#fff';
      g.fillText('[ENTER] DEPLOY', GM.VW / 2, GM.VH - 22);
    }
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText('A/D cycle ship · W/S pick slot · R random loadout · ESC back', GM.VW / 2, GM.VH - 10);
    g.textAlign = 'left';
  };

  R.victory = (g, world) => {
    R.dim(g, 0.62);
    g.textAlign = 'center';
    const y0 = 70;
    if (world.winner === -1) {
      g.font = 'bold 26px monospace';
      g.fillStyle = '#ff9a5a';
      g.fillText('MUTUAL DESTRUCTION', GM.VW / 2, y0 + 10);
      g.font = '9px monospace';
      g.fillStyle = '#8fa2c0';
      g.fillText('no survivors — the planet keeps its secrets', GM.VW / 2, y0 + 28);
    } else {
      const T = GM.TEAMS[world.winner];
      g.font = 'bold 26px monospace';
      g.fillStyle = T.P;
      g.fillText(T.name + ' DOMINATES', GM.VW / 2, y0 + 10);
      g.font = '9px monospace';
      const surv = world.ships.filter((s) => !s.dead);
      g.fillStyle = '#cfe0ff';
      g.fillText('victory lap' + (surv.length > 1 ? 's' : '') + ' in progress — ' + surv.map((s) => s.name).join('  ·  '), GM.VW / 2, y0 + 28);
    }
    g.font = '8px monospace';
    let yy = y0 + 56;
    world.teams.forEach((teamShips, ti) => {
      const T = GM.TEAMS[ti];
      g.fillStyle = T.P;
      g.fillText(T.name, GM.VW / 2 - 120, yy);
      yy += 11;
      for (const s of teamShips) {
        g.fillStyle = s.dead ? '#4a5468' : '#aebdd6';
        g.fillText((s.dead ? '  ✝ ' : '  ★ ') + s.name.padEnd(8) + ' — ' + s.spec.name + ' — kills ' + s.kills, GM.VW / 2 - 120, yy);
        yy += 11;
      }
      yy += 6;
    });
    const blink = Math.sin((GM.clockT || 0) * 3) > -0.3;
    if (blink) {
      g.font = 'bold 11px monospace';
      g.fillStyle = '#fff';
      g.fillText('[R]EMATCH   ·   [ESC] MENU', GM.VW / 2, GM.VH - 40);
    }
    g.textAlign = 'left';
  };

  R.pausedOverlay = (g) => {
    R.dim(g, 0.5);
    g.textAlign = 'center';
    g.font = 'bold 22px monospace';
    g.fillStyle = '#fff';
    g.fillText('PAUSED', GM.VW / 2, GM.VH / 2);
    g.font = '8px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('P to resume', GM.VW / 2, GM.VH / 2 + 16);
    g.textAlign = 'left';
  };

  GM.R = R;
})(window.GM);