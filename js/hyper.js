// gravity-melee :: hyperspace — the SC2 star map as a REAL 3D starfield
// (the user's ngc3d-style map: 514 systems from the UQM official star
// definitions, color-coded, in named constellations with depth — fly the
// flagship between them, enter Sol). Vanilla-canvas perspective projection.
(function (GM) {
  const { U } = GM;
  const H = {};
  GM.HYPER = H;

  const COLMAP = { B: '#7fb2ff', R: '#ff6a5e', G: '#7cff5e', Y: '#ffd85e', O: '#ffab3d', W: '#f4f8ff' };
  const ENTER_RANGE = 1500;
  const MAX_SPEED = 4200;
  const ACCEL = 2400;

  const FOV = 1350;          // projection focal length (world canvas px)
  const CAM_BACK = 820;      // camera distance behind the flagship
  const CAM_UP = 90;         // camera height above the flight plane

  // ---- input (hyper.js owns its keys; main.js's global keys still work) ----
  const k = {};
  window.addEventListener('keydown', (e) => {
    k[e.code] = true;
    if (GM.state !== 'hyper') return;
    if (e.code === 'Enter') H.tryEnter();
    else if (e.code === 'Escape') {
      if (H.sys !== null) { H.sys = null; GM.A.startMusic('hyper'); }
      else { GM.state = 'title'; GM.A.startMusic('hyper'); }
    }
  });
  window.addEventListener('keyup', (e) => { k[e.code] = false; });

  // ---- state ----
  H.ship = null;
  H.cam = null;
  H.near = -1;
  H.nearD = Infinity;
  H.sys = null;            // entered system (star index) or null
  H.t = 0;
  H.flag = [];             // flagship icon frames (16 facings)
  H.sun = [];              // truespacesun frames (5)
  H.planetImgs = [];
  H.bg = [];               // far backdrop star directions

  // small seeded PRNG for the backdrop + per-system planet layout
  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stable(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function fwd(yaw, pitch) {
    const cp = Math.cos(pitch);
    return [cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pitch)];
  }
  function rightv(yaw) { return [-Math.sin(yaw), Math.cos(yaw), 0]; }
  function upv(f, r) {   // f x r = up (z positive)
    return [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  }
  function starName(st) { return st[1] === '*' ? st[0] : st[0] + ' ' + st[1]; }

  H.init = () => {
    const sol = GM.STARS[GM.SOL_INDEX];
    H.ship = {
      x: sol[2] + 2600, y: sol[3] + 1700, z: sol[4],
      yaw: Math.atan2(-1700, -2600), pitch: 0, spd: 0,
    };
    H.cam = { yaw: H.ship.yaw, pitch: 0 };
    H.near = GM.SOL_INDEX;
    H.nearD = Infinity;
    H.sys = null;
    H.t = 0;
    GM.FX.init();

    // preload nav art (flagship icon facings + the animated sun)
    const nav = GM.CONTENT && GM.CONTENT.navsprites;
    H.flag = [];
    H.sun = [];
    if (nav && nav.flagship) {
      for (const uri of nav.flagship.f) {
        const img = new Image(); img.src = uri; H.flag.push(img);
      }
    }
    if (nav && nav.sun) {
      for (const uri of nav.sun.f) {
        const img = new Image(); img.src = uri; H.sun.push(img);
      }
    }
    // SC2 planet discs for the orbit view
    H.planetImgs = [];
    const P = (GM.CONTENT && GM.CONTENT.planets) || {};
    for (const key of Object.keys(P)) {
      const img = new Image(); img.src = P[key]; H.planetImgs.push(img);
    }

    // far backdrop: 1400 dim direction-only stars (no parallax — a skybox)
    const rnd = prng(20260218);
    H.bg = [];
    for (let i = 0; i < 1400; i++) {
      // uniform directions
      const a = rnd() * U.TAU;
      const z = rnd() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      H.bg.push({ x: r * Math.cos(a), y: r * Math.sin(a), z,
        b: 0.10 + rnd() * 0.22, s: rnd() < 0.06 ? 2 : 1,
        c: rnd() < 0.7 ? '#cfd8ea' : (rnd() < 0.5 ? '#ffd9b0' : '#b0c8ff') });
    }
  };

  H.update = (dt) => {
    H.t += dt;
    if (H.sys !== null) return;   // in the orbit view nothing flies
    const s = H.ship;

    const yawIn = (k['KeyA'] ? 1 : 0) + (k['KeyD'] ? -1 : 0);
    const pitchIn = (k['KeyR'] ? 1 : 0) + (k['KeyF'] ? -1 : 0);
    s.yaw = s.yaw + yawIn * 1.9 * dt;
    s.pitch = U.clamp(s.pitch + pitchIn * 1.25 * dt, -1.3, 1.3);

    const thrust = k['KeyW'] ? 1 : 0;
    const brake = k['KeyS'] ? 1 : 0;
    if (thrust) s.spd = Math.min(MAX_SPEED, s.spd + ACCEL * dt);
    else s.spd = Math.max(0, s.spd - 260 * dt);
    if (brake) s.spd = Math.max(0, s.spd - 3600 * dt);
    const f = fwd(s.yaw, s.pitch);
    s.x += f[0] * s.spd * dt;
    s.y += f[1] * s.spd * dt;
    s.z += f[2] * s.spd * dt;

    // lagged camera (the chase cam settles behind the ship)
    const ck = 1 - Math.pow(0.002, dt);
    H.cam.yaw += U.angDiff(H.cam.yaw, s.yaw) * ck;
    H.cam.pitch += (s.pitch - H.cam.pitch) * ck;

    // nearest system
    let bd = Infinity, bi = -1;
    for (let i = 0; i < GM.STARS.length; i++) {
      const st = GM.STARS[i];
      const dx = st[2] - s.x, dy = st[3] - s.y, dz = st[4] - s.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    H.near = bi;
    H.nearD = Math.sqrt(bd);
  };

  H.tryEnter = () => {
    if (H.sys !== null || H.near < 0 || H.nearD > ENTER_RANGE) return;
    H.sys = H.near;
    GM.A.startMusic('orbit');
  };

  // ---- rendering ----
  H.drawWorld = (g, t) => {
    g.fillStyle = '#04060c';
    g.fillRect(0, 0, GM.WV, GM.WH);
    if (H.sys !== null) { H.drawSystem(g, t); return; }

    const s = H.ship;
    const f = fwd(H.cam.yaw, H.cam.pitch);
    const r = rightv(H.cam.yaw);
    const u = upv(f, r);
    const CW = GM.WV / 2, CH = GM.WH / 2;
    const cx0 = s.x - f[0] * CAM_BACK;
    const cy0 = s.y - f[1] * CAM_BACK;
    const cz0 = s.z - f[2] * CAM_BACK + CAM_UP;
    function proj(px, py, pz) {
      const dx = px - cx0, dy = py - cy0, dz = pz - cz0;
      const cz = dx * f[0] + dy * f[1] + dz * f[2];
      if (cz < 60) return null;
      const ox = dx * r[0] + dy * r[1] + dz * r[2];
      const oy = dx * u[0] + dy * u[1] + dz * u[2];
      return [CW + ox * FOV / cz, CH - oy * FOV / cz, cz];
    }

    // far backdrop (skybox: direction-only, no parallax)
    for (const b of H.bg) {
      const cz = b.x * f[0] + b.y * f[1] + b.z * f[2];
      if (cz < 0.05) continue;
      const ox = b.x * r[0] + b.y * r[1] + b.z * r[2];
      const oy = b.x * u[0] + b.y * u[1] + b.z * u[2];
      const sx = CW + ox / cz * FOV * 0.32;
      const sy = CH - oy / cz * FOV * 0.32;
      if (sx < 0 || sx > GM.WV || sy < 0 || sy > GM.WH) continue;
      g.globalAlpha = b.b;
      g.fillStyle = b.c;
      const sz = b.s;
      g.fillRect(sx, sy, sz, sz);
    }
    g.globalAlpha = 1;

    // constellation lines: chain the members of each named cluster
    g.strokeStyle = '#33456e';
    g.lineWidth = 1;
    for (const cl of GM.STAR_CLUSTERS) {
      let prev = null;
      for (const idx of cl.s) {
        const st = GM.STARS[idx];
        const p = proj(st[2], st[3], st[4]);
        if (prev && p) {
          const a = U.clamp(1 - Math.min(prev[2], p[2]) / 22000, 0.04, 0.22);
          g.globalAlpha = a;
          g.beginPath();
          g.moveTo(prev[0], prev[1]);
          g.lineTo(p[0], p[1]);
          g.stroke();
        }
        prev = p;
      }
    }
    g.globalAlpha = 1;

    // the 514 systems
    const labels = [];
    for (let i = 0; i < GM.STARS.length; i++) {
      const st = GM.STARS[i];
      const p = proj(st[2], st[3], st[4]);
      if (!p || p[0] < -60 || p[0] > GM.WV + 60 || p[1] < -60 || p[1] > GM.WH + 60) continue;
      const fog = U.clamp(1 - p[2] / 26000, 0.12, 1);
      const base = st[6] === 3 ? 7.5 : (st[6] === 2 ? 4.6 : 2.6);
      const rad = U.clamp(base * 900 / p[2], 1, 10);
      const col = COLMAP[st[5]] || '#fff';
      if (st[6] > 1) {
        g.globalAlpha = fog * 0.25;
        g.fillStyle = col;
        g.beginPath(); g.arc(p[0], p[1], rad * 2.4, 0, U.TAU); g.fill();
      }
      g.globalAlpha = fog;
      g.fillStyle = col;
      g.beginPath(); g.arc(p[0], p[1], rad, 0, U.TAU); g.fill();
      if (p[2] < 8000) labels.push({ x: p[0], y: p[1], n: starName(st), c: col, d: p[2] });
    }
    g.globalAlpha = 1;

    // labels: nearest ten
    labels.sort((a, b) => a.d - b.d);
    g.font = '13px monospace';
    g.textAlign = 'left';
    const nLab = Math.min(labels.length, 10);
    for (let i = 0; i < nLab; i++) {
      const L = labels[i];
      g.globalAlpha = U.clamp(1 - L.d / 10000, 0.12, 0.85);
      g.fillStyle = L.c;
      g.fillText(L.n, L.x + 10, L.y - 9);
    }
    g.globalAlpha = 1;

    // the flagship: original 16-facing hyperspace icon, picking the frame
    // from the ship's heading relative to the (lagged) camera
    if (H.flag.length) {
      const rel = U.angDiff(H.cam.yaw, s.yaw);
      let fi = Math.round(-rel * 8 / Math.PI) % 16;
      if (fi < 0) fi += 16;
      const img = H.flag[fi];
      if (img && img.complete && img.naturalWidth > 0) {
        const sc = 5;
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        g.imageSmoothingEnabled = false;
        g.drawImage(img, CW - w / 2, CH + 130 - h / 2, w, h);
        // engine flare when thrusting
        if (k['KeyW']) {
          g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 30);
          g.fillStyle = '#ffca7a';
          g.fillRect(CW - 2, CH + 130 + h / 2 - 4, 4, 3 + (Math.random() * 3 | 0));
          g.globalAlpha = 1;
        }
      }
    }
  };

  // ---- the orbit view (entered system) ----
  H.drawSystem = (g, t) => {
    const st = GM.STARS[H.sys];
    const seed = stable(starName(st));
    const rnd = prng(seed);
    const CW = GM.WV / 2, CH = GM.VH_side || GM.WH / 2;

    // far backdrop dots (static, dim)
    for (const b of H.bg) {
      if (rnd() < 0.98) continue;   // sparse
      g.globalAlpha = b.b;
      g.fillStyle = b.c;
      g.fillRect((b.x * 0.5 + 0.5) * GM.WV, (b.y * 0.5 + 0.5) * GM.WH, b.s, b.s);
    }
    g.globalAlpha = 1;

    // the sun: original truespacesun animation
    if (H.sun.length) {
      const img = H.sun[Math.floor(t * 9) % H.sun.length];
      if (img && img.complete && img.naturalWidth > 0) {
        const sc = 16;
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        // glow
        const grd = g.createRadialGradient(CW, CH, w * 0.2, CW, CH, w * 1.6);
        grd.addColorStop(0, 'rgba(255,220,150,0.35)');
        grd.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(CW, CH, w * 1.6, 0, U.TAU); g.fill();
        g.imageSmoothingEnabled = false;
        g.drawImage(img, CW - w / 2, CH - h / 2, w, h);
      }
    } else {
      g.fillStyle = COLMAP[st[5]] || '#ffd85e';
      g.beginPath(); g.arc(CW, CH, 150, 0, U.TAU); g.fill();
    }

    // planets: 3..6 SC2 discs on seeded orbits
    const nP = 3 + (seed % 4);
    for (let i = 0; i < nP; i++) {
      const oR = 380 + i * 330 + (stable(starName(st) + i) % 160);
      const spd = (0.05 + 0.035 * (i % 3)) * ((i % 2) ? 1 : -1);
      const phase = (stable(starName(st) + 'p' + i) % 628) / 100;
      const a = H.t * spd + phase;
      const px = CW + Math.cos(a) * oR;
      const py = CH + Math.sin(a) * oR * 0.42;   // slightly tilted orbital plane
      // orbit path
      g.strokeStyle = '#1b2438';
      g.globalAlpha = 0.8;
      g.beginPath();
      g.ellipse(CW, CH, oR, oR * 0.42, 0, 0, U.TAU);
      g.stroke();
      g.globalAlpha = 1;
      const img = H.planetImgs[(stable(starName(st) + i) + i) % H.planetImgs.length];
      if (img && img.complete && img.naturalWidth > 0) {
        const d = 110 + (stable(starName(st) + 'd' + i) % 90);
        g.imageSmoothingEnabled = false;
        g.drawImage(img, px - d / 2, py - d / 2, d, d);
      }
    }
  };

  H.drawHUD = (g, t) => {
    g.textAlign = 'left';
    g.font = 'bold 8px monospace';
    if (H.sys !== null) {
      const st = GM.STARS[H.sys];
      g.fillStyle = '#cfe0ff';
      g.fillText('SYSTEM: ' + starName(st).toUpperCase(), 8, 14);
      g.font = '8px monospace';
      g.fillStyle = '#8fa2c0';
      g.fillText('orbit view — [ESC] back to hyperspace', 8, 26);
      return;
    }
    if (!H.ship) return;
    g.fillStyle = '#cfe0ff';
    g.fillText('HYPERSPACE', 8, 14);
    g.font = '8px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('VEL ' + Math.round(H.ship.spd) + ' U/S', 8, 26);
    if (H.near >= 0) {
      const st = GM.STARS[H.near];
      g.fillStyle = COLMAP[st[5]] || '#cfe0ff';
      g.fillText(starName(st).toUpperCase() + '  ' + Math.round(H.nearD) + ' U', 8, GM.VH - 10);
      if (H.nearD < ENTER_RANGE && Math.sin(t * 4) > -0.4) {
        g.textAlign = 'center';
        g.font = 'bold 11px monospace';
        g.fillStyle = '#fff';
        g.fillText('[ENTER] ENTER SYSTEM', GM.VW / 2, GM.VH - 34);
        g.textAlign = 'left';
        g.font = '8px monospace';
      }
    }
    g.textAlign = 'center';
    g.fillStyle = '#55688a';
    g.fillText('W thrust · A/D yaw · R/F pitch · S brake · ENTER visit · ESC menu', GM.VW / 2, GM.VH - 6);
    g.textAlign = 'left';
  };
})(window.GM);