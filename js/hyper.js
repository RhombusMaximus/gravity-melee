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
  const MAX_SPEED = 900;    // local cruise: deliberate, for approach/cluster
  const ACCEL = 500;

  const FOV = 1350;          // projection focal length (world canvas px)
  const CAM_BACK = 820;      // camera distance behind the flagship
  const CAM_UP = 90;         // camera height above the flight plane

  // ---- input (hyper.js owns its keys; main.js's global keys still work) ----
  const k = {};
  window.addEventListener('keydown', (e) => {
    k[e.code] = true;
    if (GM.state !== 'hyper') return;
    if (e.code === 'Enter') H.activate();
    else if (e.code === 'KeyH') { H.help = !H.help; }
    else if (e.code === 'Escape') {
      if (H.sys !== null) { H.sys = null; GM.A.startMusic('hyper'); }
      else { GM.state = 'title'; GM.A.startMusic('hyper'); }
    }
    else if (H.help) { H.help = false; }   // any other key dismisses the card
  });
  window.addEventListener('keyup', (e) => { k[e.code] = false; });

  // ---- mouse: drag to look, scroll to zoom, click to target ----
  const stage = document.querySelector('.stage');
  const ptr = { down: false, x: 0, y: 0, moved: 0 };
  function inHyper() { return GM.state === 'hyper' && H.sys === null && !H.warp; }
  function canvasPos(e) {
    const cv = document.getElementById('cv');
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / r.width,
             y: (e.clientY - r.top) * cv.height / r.height };
  }
  stage.addEventListener('pointerdown', (e) => {
    if (!inHyper()) return;
    e.preventDefault();
    H.help = false;
    ptr.down = true; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = 0;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    if (overMinimap(e.clientX, e.clientY)) {
      H.mmDrag = { cx: H.mmCx, cy: H.mmCy, x: e.clientX, y: e.clientY };
      stage.style.cursor = 'move';
    } else {
      stage.style.cursor = 'grabbing';
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!inHyper()) { H.hover = -1; return; }
    if (ptr.down) {
      const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
      ptr.x = e.clientX; ptr.y = e.clientY;
      ptr.moved += Math.abs(dx) + Math.abs(dy);
      if (H.mmDrag) {
        // pan the minimap view
        const hud = document.getElementById('hud');
        const hr = hud.getBoundingClientRect();
        const scaleX = (MM_W - MM_PAD * 2) / hr.width / H.mmZoom;
        const scaleY = (MM_W - MM_PAD * 2) / hr.height / H.mmZoom;
        H.mmCx = H.mmDrag.cx - dx * scaleX;
        H.mmCy = H.mmDrag.cy - dy * scaleY;
        mmClamp();
        stage.style.cursor = 'move';
      } else {
        // drag right -> look right (yaw down), drag down -> pitch down
        H.ship.yaw -= dx * 0.0042;
        H.ship.pitch = U.clamp(H.ship.pitch - dy * 0.0035, -1.3, 1.3);
      }
    } else {
      if (overMinimap(e.clientX, e.clientY)) {
        const i = pickMinimap(e.clientX, e.clientY);
        H.hover = i >= 0 ? i : -1;
        stage.style.cursor = i >= 0 ? 'pointer' : 'crosshair';
      } else {
        const c = canvasPos(e);
        H.hover = pickStar(c.x, c.y);
        stage.style.cursor = H.hover >= 0 ? 'pointer' : 'grab';
      }
    }
  });
  stage.addEventListener('pointerup', (e) => {
    if (!ptr.down) return;
    const wasMM = !!H.mmDrag;
    H.mmDrag = null;
    ptr.down = false;
    stage.style.cursor = 'grab';
    if (!inHyper()) return;
    if (ptr.moved < 7) {          // a click, not a drag
      if (wasMM) {
        // click on the minimap: target the star under the cursor
        const i = pickMinimap(e.clientX, e.clientY);
        if (i >= 0) { H.sel = i; GM.A.SND.ui(); }
      } else {
        const c = canvasPos(e);
        const i = pickStar(c.x, c.y);
        if (i >= 0) { H.sel = i; GM.A.SND.ui(); }
      }
    }
  });
  stage.addEventListener('wheel', (e) => {
    if (!inHyper()) return;
    e.preventDefault();
    if (overMinimap(e.clientX, e.clientY)) {
      // zoom the minimap, keeping the cursor's map position fixed
      const hud = document.getElementById('hud');
      const hr = hud.getBoundingClientRect();
      const hx = (e.clientX - hr.left) * GM.VW / hr.width;
      const hy = (e.clientY - hr.top) * GM.VH / hr.height;
      const nx = U.clamp((hx - MM_X() - MM_PAD) / (MM_W - MM_PAD * 2), 0, 1);
      const ny = U.clamp((hy - MM_Y - MM_PAD) / (MM_W - MM_PAD * 2), 0, 1);
      const mapNx = H.mmCx + (nx - 0.5) / H.mmZoom;
      const mapNy = H.mmCy + (ny - 0.5) / H.mmZoom;
      H.mmZoom = U.clamp(H.mmZoom * (e.deltaY > 0 ? 0.78 : 1.28), 1, 12);
      // re-center so the cursor's star stays under the cursor
      H.mmCx = mapNx - (nx - 0.5) / H.mmZoom;
      H.mmCy = mapNy - (ny - 0.5) / H.mmZoom;
      mmClamp();
    } else {
      H.zoom = U.clamp(H.zoom * (e.deltaY > 0 ? 1.13 : 0.885), 0.4, 2.8);
    }
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => {
    if (!inHyper()) return;
    if (overMinimap(e.clientX, e.clientY)) {
      // dblclick on minimap: if zoomed, reset; if full map, warp
      if (H.mmZoom > 1.05) { H.mmZoom = 1; H.mmCx = 0.5; H.mmCy = 0.5; return; }
      const i = pickMinimap(e.clientX, e.clientY);
      if (i >= 0) { H.sel = i; H.startWarp(i); }
      return;
    }
    const c = canvasPos(e);
    const i = pickStar(c.x, c.y);
    if (i >= 0) { H.sel = i; H.startWarp(i); }
  });

  // nearest projected star within 30 canvas px of (x,y)
  function pickStar(x, y) {
    let best = -1, bd = 30 * 30;
    for (const s of H.scr) {
      const dx = s.x - x, dy = s.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = s.i; }
    }
    return best;
  }

  // ---- minimap interaction: zoom, pan, click stars ----
  const MM_W = 120;                              // minimap box size in HUD px
  const MM_X = () => GM.VW - MM_W - 8;
  const MM_Y = 8;
  const MM_PAD = 2;

  // true when a client-space position is over the minimap box
  function overMinimap(cx, cy) {
    const hud = document.getElementById('hud');
    const hr = hud.getBoundingClientRect();
    const hx = (cx - hr.left) * GM.VW / hr.width;
    const hy = (cy - hr.top) * GM.VH / hr.height;
    const mx = MM_X(), my = MM_Y;
    return hx >= mx - 4 && hx <= mx + MM_W + 4 && hy >= my - 4 && hy <= my + MM_W + 4;
  }

  // pick a star from the minimap at a client position
  function pickMinimap(cx, cy) {
    const hud = document.getElementById('hud');
    const hr = hud.getBoundingClientRect();
    const hx = (cx - hr.left) * GM.VW / hr.width;
    const hy = (cy - hr.top) * GM.VH / hr.height;
    // minimap-local normalized coords (0-1 within the star area)
    const nx = U.clamp((hx - MM_X() - MM_PAD) / (MM_W - MM_PAD * 2), 0, 1);
    const ny = U.clamp((hy - MM_Y - MM_PAD) / (MM_W - MM_PAD * 2), 0, 1);
    // undo the minimap zoom to get map-normalized coords
    const mapNx = H.mmCx + (nx - 0.5) / H.mmZoom;
    const mapNy = H.mmCy + (ny - 0.5) / H.mmZoom;
    // find the nearest star (radius scales with zoom so distant stars
    // are pickable when zoomed out, close ones when zoomed in)
    const rad = 0.012 + 0.008 / H.mmZoom;
    let best = -1, bd = rad * rad;
    for (let i = 0; i < H.mm.length; i++) {
      const dx = H.mm[i][0] - mapNx, dy = H.mm[i][1] - mapNy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }

  // clamp the minimap center so we never scroll off the map
  function mmClamp() {
    const half = 0.5 / H.mmZoom;
    H.mmCx = U.clamp(H.mmCx, half, 1 - half);
    H.mmCy = U.clamp(H.mmCy, half, 1 - half);
  }

  // ---- state ----
  H.ship = null;
  H.cam = null;
  H.near = -1;
  H.nearD = Infinity;
  H.sys = null;            // entered system (star index) or null
  H.t = 0;
  H.sel = null;            // targeted star index (click / ENTER)
  H.warp = null;           // active warp {i, sx..tz, t, dur}
  H.hover = -1;            // star under the cursor
  H.zoom = 1; H.zoomCur = 1;
  H.help = true;           // show the controls card until first input
  H.scr = [];              // projected star screen positions this frame
  H.days = 1;              // campaign day (30s of hyperspace = 1 day)
  H.dayT = 0;              // seconds elapsed this day
  H.fuel = 100; H.fuelMax = 100;
  H.mm = null;             // minimap normalized coords
  H.mmZoom = 1;            // minimap zoom (1 = full map, 8 = close)
  H.mmCx = 0.5; H.mmCy = 0.5;   // minimap view center (normalized)
  H.mmDrag = null;         // active minimap pan drag
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
    H.sel = GM.SOL_INDEX;   // you start with home targeted
    H.warp = null;
    H.hover = -1;
    H.zoom = 1; H.zoomCur = 1;
    H.help = true;
    GM.FX.init();
    const stg = document.querySelector('.stage');
    if (stg) stg.style.touchAction = 'none';
    // minimap: star (x,y) normalized into the 0..1 box
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const st of GM.STARS) {
      if (st[2] < mnx) mnx = st[2]; if (st[2] > mxx) mxx = st[2];
      if (st[3] < mny) mny = st[3]; if (st[3] > mxy) mxy = st[3];
    }
    const spanX = Math.max(1, mxx - mnx), spanY = Math.max(1, mxy - mny);
    H.mm = GM.STARS.map((st) => [(st[2] - mnx) / spanX, (st[3] - mny) / spanY]);
    H.mmBounds = { mnx, mny, spanX, spanY };
    H.mmZoom = 1; H.mmCx = 0.5; H.mmCy = 0.5; H.mmDrag = null;
    H.days = 1; H.dayT = 0; H.fuel = 100;

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
    H.zoomCur += (H.zoom - H.zoomCur) * (1 - Math.pow(0.01, dt));
    if (H.sys !== null) return;   // in the orbit view nothing flies
    const s = H.ship;

    // campaign clock: 30s of hyperspace = 1 game day
    H.dayT += dt;
    if (H.dayT >= 30) { H.dayT -= 30; H.days++; }

    // warp: glide to the targeted system, arriving just outside it
    if (H.warp) {
      const w = H.warp;
      w.t += dt;
      const p = Math.min(1, w.t / w.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // ease in-out
      s.x = w.sx + (w.tx - w.sx) * e;
      s.y = w.sy + (w.ty - w.sy) * e;
      s.z = w.sz + (w.tz - w.sz) * e;
      H.cam.yaw = s.yaw;
      H.cam.pitch = s.pitch;
      H.near = w.i;
      H.nearD = Math.sqrt((s.x - w.tx) * (s.x - w.tx) + (s.y - w.ty) * (s.y - w.ty) + (s.z - w.tz) * (s.z - w.tz));
      if (p >= 1) { s.spd = 0; H.warp = null; }
      return;
    }

    const yawIn = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) + (k['KeyD'] || k['ArrowRight'] ? -1 : 0);
    const pitchIn = (k['KeyR'] || k['ArrowUp'] ? 1 : 0) + (k['KeyF'] || k['ArrowDown'] ? -1 : 0);
    s.yaw = s.yaw + yawIn * 1.9 * dt;
    s.pitch = U.clamp(s.pitch + pitchIn * 1.25 * dt, -1.3, 1.3);

    const boost = (k['ShiftLeft'] || k['ShiftRight']) ? 2.0 : 1;
    const thrust = k['KeyW'] ? 1 : 0;
    const brake = k['KeyS'] ? 1 : 0;
    if (thrust) s.spd = Math.min(MAX_SPEED * boost, s.spd + ACCEL * boost * dt);
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

  // ENTER state machine: near a system -> enter; targeted -> warp; else
  // target the nearest system so the second ENTER always does something
  H.activate = () => {
    if (H.sys !== null || H.warp) return;
    if (H.near >= 0 && H.nearD < ENTER_RANGE) {
      H.sys = H.near;
      GM.A.startMusic('orbit');
      return;
    }
    if (H.sel === null || H.sel < 0) {
      if (H.near >= 0) { H.sel = H.near; GM.A.SND.ui(); }
      return;
    }
    const st = GM.STARS[H.sel];
    const dx = st[2] - H.ship.x, dy = st[3] - H.ship.y, dz = st[4] - H.ship.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < ENTER_RANGE) { H.sys = H.sel; GM.A.startMusic('orbit'); return; }
    const cost = Math.ceil(d / 1500);
    if (H.fuel < cost) return;   // not enough fuel — the warp doesn't fire
    H.startWarp(H.sel);
  };

  H.startWarp = (i) => {
    const st = GM.STARS[i];
    const s = H.ship;
    // arrive 900u short of the star, coming in on the line you left on
    const dx = st[2] - s.x, dy = st[3] - s.y, dz = st[4] - s.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ax = st[2] - dx / d * 900, ay = st[3] - dy / d * 900, az = st[4] - dz / d * 900;
    H.warp = { i, sx: s.x, sy: s.y, sz: s.z, tx: ax, ty: ay, tz: az,
               t: 0, dur: U.clamp(d / 2600, 1.0, 6.5) };
    s.yaw = Math.atan2(dy, dx);
    s.pitch = Math.asin(U.clamp(dz / d, -1, 1));
    // warp costs fuel: distance / 1500, rounded up
    H.fuel = Math.max(0, H.fuel - Math.ceil(d / 1500));
    GM.A.SND.blink();
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
    const camB = CAM_BACK * H.zoomCur;
    const cx0 = s.x - f[0] * camB;
    const cy0 = s.y - f[1] * camB;
    const cz0 = s.z - f[2] * camB + CAM_UP;
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

    // the 502 systems (screen positions recorded for mouse picking)
    const labels = [];
    H.scr = [];
    const warpK = H.warp ? Math.sin(Math.min(1, H.warp.t / H.warp.dur) * Math.PI) : 0;
    for (let i = 0; i < GM.STARS.length; i++) {
      const st = GM.STARS[i];
      const p = proj(st[2], st[3], st[4]);
      if (!p || p[0] < -60 || p[0] > GM.WV + 60 || p[1] < -60 || p[1] > GM.WH + 60) continue;
      H.scr.push({ i, x: p[0], y: p[1] });
      const fog = U.clamp(1 - p[2] / 26000, 0.12, 1);
      const base = st[6] === 3 ? 7.5 : (st[6] === 2 ? 4.6 : 2.6);
      const rad = U.clamp(base * 900 / p[2], 1, 10);
      const col = COLMAP[st[5]] || '#fff';
      if (st[6] > 1) {
        g.globalAlpha = fog * 0.25;
        g.fillStyle = col;
        g.beginPath(); g.arc(p[0], p[1], rad * 2.4, 0, U.TAU); g.fill();
      }
      // warp streaks: stars stretch outward from the vanishing point
      if (warpK > 0.05 && p[2] > 400) {
        g.globalAlpha = fog * 0.55 * warpK;
        g.strokeStyle = col;
        g.lineWidth = Math.max(1, rad * 0.8);
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0] + (p[0] - CW) * 0.32 * warpK, p[1] + (p[1] - CH) * 0.32 * warpK);
        g.stroke();
      }
      g.globalAlpha = fog;
      g.fillStyle = col;
      g.beginPath(); g.arc(p[0], p[1], rad, 0, U.TAU); g.fill();
      // hover / selection highlights
      if (i === H.hover && H.hover !== H.sel) {
        g.globalAlpha = 0.9;
        g.strokeStyle = '#fff';
        g.lineWidth = 1;
        g.beginPath(); g.arc(p[0], p[1], rad + 7, 0, U.TAU); g.stroke();
      }
      if (i === H.sel) {
        const bl = 0.7 + 0.3 * Math.sin(t * 5);
        g.globalAlpha = bl;
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(p[0], p[1], rad + 10, 0, U.TAU); g.stroke();
        g.beginPath(); g.arc(p[0], p[1], rad + 14, 0, U.TAU); g.stroke();
      }
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

    // ---- the flagship: a 3D chevron projected through the camera ----
    // Ship-local vertices (nose forward, wings back, tail slightly up):
    //   nose(18,0,0)  left(-8,12,-2)  right(-8,-12,-2)  tail(-4,0,6)
    // transformed by the ship's yaw/pitch, placed at the ship's world
    // position, then projected — so it banks and pitches with the camera.
    {
      const r = 14;   // chevron size in world units
      const sv = [
        [r * 1.3, 0, 0],          // nose
        [-r * 0.55, r * 0.85, -r * 0.15],  // left wingtip
        [-r * 0.55, -r * 0.85, -r * 0.15], // right wingtip
        [-r * 0.3, 0, r * 0.45],  // tail (slightly raised)
      ];
      const sf = fwd(s.yaw, s.pitch);
      const srr = rightv(s.yaw);
      const su = upv(sf, srr);
      function shipPt(lx, ly, lz) {
        return proj(
          s.x + sf[0] * lx + srr[0] * ly + su[0] * lz,
          s.y + sf[1] * lx + srr[1] * ly + su[1] * lz,
          s.z + sf[2] * lx + srr[2] * ly + su[2] * lz);
      }
      const P = sv.map((v) => shipPt(v[0], v[1], v[2]));
      if (P.every((p) => p)) {
        // hull fill: two triangles (left hull, right hull)
        g.fillStyle = '#155a9e';
        g.beginPath();
        g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.lineTo(P[3][0], P[3][1]);
        g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(P[0][0], P[0][1]); g.lineTo(P[2][0], P[2][1]); g.lineTo(P[3][0], P[3][1]);
        g.closePath(); g.fill();
        // outline
        g.strokeStyle = '#7fd4ff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(P[0][0], P[0][1]);
        g.lineTo(P[1][0], P[1][1]);
        g.lineTo(P[3][0], P[3][1]);
        g.lineTo(P[2][0], P[2][1]);
        g.closePath();
        g.stroke();
        // nose accent
        g.strokeStyle = '#fff';
        g.beginPath();
        g.moveTo(P[0][0], P[0][1]);
        g.lineTo(P[3][0], P[3][1]);
        g.stroke();
        g.lineWidth = 1;

        // engine glow: behind the tail, visible when thrusting
        const thrusting = k['KeyW'] || H.warp;
        if (thrusting) {
          const flick = 0.4 + 0.3 * Math.sin(t * 30);
          // position: behind the tail vertex
          const ex = P[3][0] + (P[3][0] - P[0][0]) * 0.3;
          const ey = P[3][1] + (P[3][1] - P[0][1]) * 0.3;
          g.globalAlpha = flick;
          g.fillStyle = H.warp ? '#9ff0ff' : '#ffca7a';
          g.beginPath();
          g.ellipse(ex, ey, 6 + Math.random() * 4, 3 + Math.random() * 2, 0, 0, U.TAU);
          g.fill();
          g.globalAlpha = flick * 0.5;
          g.beginPath();
          g.ellipse(ex, ey, 12 + Math.random() * 6, 5 + Math.random() * 3, 0, 0, U.TAU);
          g.fill();
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
    g.fillText('HYPERSPACE · DAY ' + H.days, 8, 14);
    g.font = '8px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('VEL ' + Math.round(H.ship.spd) + ' U/S' +
      ((k['ShiftLeft'] || k['ShiftRight']) && H.ship.spd > 400 ? '  [BOOST]' : ''), 8, 26);
    // fuel bar
    const fw = 90, fx = 8, fy = 32;
    g.fillStyle = '#232c40';
    g.fillRect(fx, fy, fw, 4);
    const fuelFrac = H.fuel / H.fuelMax;
    g.fillStyle = fuelFrac > 0.3 ? '#ffd85e' : '#ff5648';
    g.fillRect(fx, fy, Math.round(fw * fuelFrac), 4);
    g.fillStyle = '#55688a';
    g.fillText('FUEL ' + H.fuel, fx + fw + 6, fy + 4);

    // ---- minimap (top-down radar: zoomable, pannable, clickable) ----
    const MW = MM_W, MX = MM_X(), MY = MM_Y;
    const mmBox = MW - MM_PAD * 2;
    g.fillStyle = 'rgba(4,6,12,0.82)';
    g.fillRect(MX, MY, MW, MW);
    g.strokeStyle = H.mmDrag ? '#3fc8ff' : '#1b2438';
    g.strokeRect(MX, MY, MW, MW);
    // stars: transform through the minimap zoom/center
    const dotSize = H.mmZoom > 3 ? 2 : 1;
    for (let i = 0; i < H.mm.length; i++) {
      const nx = (H.mm[i][0] - H.mmCx) * H.mmZoom + 0.5;
      const ny = (H.mm[i][1] - H.mmCy) * H.mmZoom + 0.5;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      const st = GM.STARS[i];
      g.fillStyle = COLMAP[st[5]] || '#8fa2c0';
      g.globalAlpha = i === H.hover ? 1 : 0.55;
      const ds = i === H.sel ? 2 : dotSize;
      g.fillRect(MX + MM_PAD + nx * mmBox - (ds >> 1), MY + MM_PAD + ny * mmBox - (ds >> 1), ds, ds);
    }
    g.globalAlpha = 1;
    // player + heading (transformed through the minimap zoom)
    const px = (H.ship.x - H.mmBounds.mnx) / H.mmBounds.spanX;
    const py = (H.ship.y - H.mmBounds.mny) / H.mmBounds.spanY;
    const pnx = (px - H.mmCx) * H.mmZoom + 0.5;
    const pny = (py - H.mmCy) * H.mmZoom + 0.5;
    if (pnx >= 0 && pnx <= 1 && pny >= 0 && pny <= 1) {
      const ppx = MX + MM_PAD + pnx * mmBox, ppy = MY + MM_PAD + pny * mmBox;
      g.fillStyle = '#fff';
      g.fillRect(ppx - 1, ppy - 1, 3, 3);
      g.strokeStyle = '#fff';
      g.globalAlpha = 0.6;
      g.beginPath();
      g.moveTo(ppx, ppy);
      g.lineTo(ppx + Math.cos(H.ship.yaw) * 6, ppy + Math.sin(H.ship.yaw) * 6);
      g.stroke();
      g.globalAlpha = 1;
    }
    if (H.sel !== null && H.sel >= 0) {
      const snx = (H.mm[H.sel][0] - H.mmCx) * H.mmZoom + 0.5;
      const sny = (H.mm[H.sel][1] - H.mmCy) * H.mmZoom + 0.5;
      if (snx >= 0 && snx <= 1 && sny >= 0 && sny <= 1) {
        const sx2 = MX + MM_PAD + snx * mmBox;
        const sy2 = MY + MM_PAD + sny * mmBox;
        g.strokeStyle = '#3fc8ff';
        g.beginPath(); g.arc(sx2, sy2, 4, 0, U.TAU); g.stroke();
      }
    }
    // zoom indicator + hints
    if (H.mmZoom > 1.05) {
      g.font = '7px monospace';
      g.fillStyle = '#3fc8ff';
      g.textAlign = 'center';
      g.fillText('×' + H.mmZoom.toFixed(1), MX + MW / 2, MY + MW - 4);
      g.fillText('DBL-CLICK resets', MX + MW / 2, MY + MW + 8);
      g.textAlign = 'left';
    }

    // ---- targeted-system panel (under the minimap) ----
    if (H.sel !== null && H.sel >= 0) {
      const st = GM.STARS[H.sel];
      const dx = st[2] - H.ship.x, dy = st[3] - H.ship.y, dz = st[4] - H.ship.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const col = COLMAP[st[5]] || '#cfe0ff';
      g.font = 'bold 8px monospace';
      g.fillStyle = col;
      g.fillText('TARGET: ' + starName(st).toUpperCase(), MX, MY + MW + 14);
      g.font = '8px monospace';
      g.fillStyle = '#8fa2c0';
      g.fillText('CLASS ' + st[5] + ' · ' + Math.round(d) + ' U', MX, MY + MW + 24);
      const cl = st[7] >= 0 ? GM.STAR_CLUSTERS[st[7]] : null;
      if (cl) { g.fillStyle = '#55688a'; g.fillText('IN ' + cl.n.toUpperCase(), MX, MY + MW + 34); }
    }

    // ---- bottom-left nearest + prompt ----
    if (H.near >= 0 && H.warp === null) {
      const st = GM.STARS[H.near];
      g.font = '8px monospace';
      g.textAlign = 'left';
      g.fillStyle = COLMAP[st[5]] || '#cfe0ff';
      g.fillText(starName(st).toUpperCase() + '  ' + Math.round(H.nearD) + ' U', 8, GM.VH - 10);
    }
    g.textAlign = 'center';
    g.font = 'bold 11px monospace';
    g.fillStyle = '#fff';
    const blink = Math.sin(t * 4) > -0.4;
    if (H.warp) {
      g.fillText('WARPING TO ' + starName(GM.STARS[H.warp.i]).toUpperCase() + '…', GM.VW / 2, GM.VH - 34);
    } else if (H.near >= 0 && H.nearD < ENTER_RANGE && blink) {
      g.fillText('[ENTER] ENTER SYSTEM', GM.VW / 2, GM.VH - 34);
    } else if (H.sel !== null && H.sel >= 0 && blink) {
      const st2 = GM.STARS[H.sel];
      const dx2 = st2[2] - H.ship.x, dy2 = st2[3] - H.ship.y, dz2 = st2[4] - H.ship.z;
      const d2 = Math.sqrt(dx2*dx2 + dy2*dy2 + dz2*dz2);
      const cost = Math.ceil(d2 / 1500);
      if (H.fuel >= cost) {
        g.fillText('[ENTER] WARP — ' + cost + ' FUEL', GM.VW / 2, GM.VH - 34);
      } else {
        g.fillStyle = '#ff5648';
        g.fillText('NEED ' + cost + ' FUEL — HAVE ' + H.fuel, GM.VW / 2, GM.VH - 34);
      }
    }
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText('DRAG look · CLICK target · ENTER warp · RADAR: scroll=zoom, click=target · H help', GM.VW / 2, GM.VH - 6);

    // ---- help card (until first input; H toggles) ----
    if (H.help) {
      g.fillStyle = 'rgba(4,6,12,0.72)';
      g.fillRect(0, 0, GM.VW, GM.VH);
      g.textAlign = 'center';
      g.font = 'bold 14px monospace';
      g.fillStyle = '#fff';
      g.fillText('HYPERSPACE', GM.VW / 2, 92);
      g.font = '10px monospace';
      g.fillStyle = '#8fa2c0';
      const lines = [
        'DRAG — look around · SCROLL — zoom out to the whole map',
        'CLICK a star — target it · ENTER or DOUBLE-CLICK — warp there',
        'When you arrive in range: ENTER again to enter the system',
        'W — thrust · S — brake · SHIFT — boost · A/D or ←/→ — yaw · R/F or ↑/↓ — pitch',
        'Top right radar: scroll to zoom in, drag to pan, click stars to target',
        '  (double-click a zoomed radar resets to the full map)',
        'Warp costs fuel (distance ÷ 1500) · the day counter advances every 30s',
        '',
        'press any key or click to begin · H shows this again',
      ];
      lines.forEach((ln, i) => g.fillText(ln, GM.VW / 2, 120 + i * 16));
      g.textAlign = 'left';
    }
    g.textAlign = 'left';
  };
})(window.GM);