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
    if (H.land) return;                 // the lander owns all keys while landed
    if (H.dive) {
      if (e.code === 'Escape') H.dive = null;   // abort the plunge
      return;
    }
    if (H.sys !== null) {
      // orbit view: TAB cycles planets, ENTER lands, ESC backs out
      if (e.code === 'Tab') {
        e.preventDefault();
        const nP = 3 + (stable(starName(GM.STARS[H.sys])) % 4);
        H.landSel = H.landSel < 0 ? 0 : (H.landSel + 1) % nP;
        GM.A.SND.ui();
      } else if (e.code === 'Enter') {
        // 2D system flight: a planet in reach auto-selects, ENTER lands
        if (H.view === '2d' && H.nearPlanet >= 0 && H.nearPlanetD < 900) {
          H.landSel = H.nearPlanet;
        }
        H.tryLand();
      } else if (e.code === 'Escape') {
        H.sys = null; H.landSel = -1; GM.A.startMusic('hyper');
      } else if (e.code === 'KeyH') { H.help = !H.help; }
      return;
    }
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
    if (GM.state === 'hyper' && H.sys !== null && !H.land) {
      // orbit view: click a planet to select it
      const c = canvasPos(e);
      let best = -1, bd = 90 * 90;
      for (const p of H.sysScr) {
        const dx = p.x - c.x, dy = p.y - c.y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = p.i; }
      }
      if (best >= 0 && best !== H.landSel) { H.landSel = best; GM.A.SND.ui(); }
      return;
    }
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
        // drag right -> look right (yaw down), drag down -> pitch down —
        // 3D chase-cam only; the 2D view has no free-look
        if (H.view !== '2d') {
          H.ship.yaw -= dx * 0.0042;
          H.ship.pitch = U.clamp(H.ship.pitch - dy * 0.0035, -1.3, 1.3);
        }
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
      const ny = U.clamp((hy - MM_Y() - MM_PAD) / (MM_W - MM_PAD * 2), 0, 1);
      const mapNx = H.mmCx + (nx - 0.5) / H.mmZoom;
      const mapNy = H.mmCy + (ny - 0.5) / H.mmZoom;
      H.mmZoom = U.clamp(H.mmZoom * (e.deltaY > 0 ? 0.78 : 1.28), 1, 12);
      // re-center so the cursor's star stays under the cursor
      H.mmCx = mapNx - (nx - 0.5) / H.mmZoom;
      H.mmCy = mapNy - (ny - 0.5) / H.mmZoom;
      mmClamp();
    } else if (H.view === '2d') {
      // 2D mode: the wheel zooms the flat map view
      H.z2d = U.clamp(H.z2d * (e.deltaY > 0 ? 0.82 : 1.22), 0.06, 1.4);
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
  const MM_Y = () => 70;                         // below the status block
  const MM_PAD = 2;

  // true when a client-space position is over the minimap box
  function overMinimap(cx, cy) {
    const hud = document.getElementById('hud');
    const hr = hud.getBoundingClientRect();
    const hx = (cx - hr.left) * GM.VW / hr.width;
    const hy = (cy - hr.top) * GM.VH / hr.height;
    const mx = MM_X(), my = MM_Y();
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
  // ---- campaign surface exploration (lander) ----
  H.land = null;           // active landing (GM.LANDER owns update/draw)
  H.landSel = -1;          // selected planet in the orbit view
  H.landers = 3;           // landers aboard the flagship
  H.cargo = { cats: [0, 0, 0, 0, 0, 0, 0, 0], bio: 0 };
  H.summary = null;        // { t, lines } shown over the orbit view
  H.view = '2d';           // main hyperspace view: the classic top-down 2D map
  H.z2d = 0.26;            // 2D map zoom (px per world unit)
  H.nearPlanet = -1;       // auto-selected planet in the 2D system view
  H.nearPlanetD = Infinity;
  H.neb2 = [];             // 2D hyperspace nebula dots (parallax layer)
  H.insCv = null;          // offscreen canvas for the 3D inset mini-map
  H.sysScr = [];           // planet screen positions this frame (orbit view)

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
    H.land = null; H.landSel = -1; H.landers = 3;
    H.cargo = { cats: [0, 0, 0, 0, 0, 0, 0, 0], bio: 0 };
    H.summary = null;

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
    // the Precursor capital ship: the campaign flagship sprite, drawn
    // at twice the Ur-Quan Dreadnought's in-game size
    if (GM.CONTENT && GM.CONTENT.shipsprites && GM.CONTENT.shipsprites.flagship) {
      H.precursorImg = new Image();
      H.precursorImg.src = GM.CONTENT.shipsprites.flagship;
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
    // 2D hyperspace nebula (deep-red blotches, drawn with 0.35 parallax)
    const rnd2 = prng(21550101);
    H.neb2 = [];
    for (let i = 0; i < 120; i++) {
      H.neb2.push({ x: rnd2() * 30000 - 15000, y: rnd2() * 30000 - 15000,
        r: 100 + rnd2() * 300, a: 0.05 + rnd2() * 0.09 });
    }
    H.z2d = 0.26; H.nearPlanet = -1; H.nearPlanetD = Infinity;
    H.dive = null;   // the gravity-well plunge into a system
    // the ORIGINAL hyperspace starfield assets: hyperstars sprites +
    // the ambient color-cycling ramp + the orbitenter gateway art
    const navC = GM.CONTENT && GM.CONTENT.navsprites;
    if (navC && navC.hyperstars && navC.ambient) {
      H.hstarImgs = navC.hyperstars.f.map((u) => { const i = new Image(); i.src = u; return i; });
      H.ambientImgs = navC.ambient.f.map((u) => { const i = new Image(); i.src = u; return i; });
      H.orbitEnterImg = navC.orbitenter
        ? (() => { const i = new Image(); i.src = navC.orbitenter.f[0]; return i; })() : null;
      const rnd3 = prng(19921211);   // scatter seeded with the SC2 release date
      H.bgStars = [];
      for (let i = 0; i < 130; i++) {
        H.bgStars.push({ x: rnd3() * 30000 - 15000, y: rnd3() * 30000 - 15000,
          fr: [0, 5, 11, 17, 23, 28][i % 6], sc: 1 + rnd3() * 1.3, ph: rnd3() * 16 });
      }
    }
    H.hyperBaked = false;
  };

  H.update = (dt) => {
    H.t += dt;
    if (H.view === '2d') { H.update2D(dt); return; }   // update2D owns the dive tick
    if (H.dive) return;   // (3D view) nothing flies during the plunge
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
      H.dive = { i: H.near, t: 0, dur: 1.9 };   // plunge instead of instant entry
      return;
    }
    if (H.sel === null || H.sel < 0) {
      if (H.near >= 0) { H.sel = H.near; GM.A.SND.ui(); }
      return;
    }
    const st = GM.STARS[H.sel];
    const dx = st[2] - H.ship.x, dy = st[3] - H.ship.y, dz = st[4] - H.ship.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < ENTER_RANGE) { H.dive = { i: H.sel, t: 0, dur: 1.9 }; return; }
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

  // ---- orbit-view planets (deterministic per star) ----
  // count + orbit geometry shared by drawSystem and the lander
  H.sysPlanets = (sysIdx) => {
    const st = GM.STARS[sysIdx];
    const nm = starName(st);
    const nP = 3 + (stable(nm) % 4);
    const list = [];
    for (let i = 0; i < nP; i++) {
      // v0.41: orbits scaled x1.6 — planets grew and must not overlap
      const oR = 610 + i * 530 + (stable(nm + i) % 160);
      const spd = (0.05 + 0.035 * (i % 3)) * ((i % 2) ? 1 : -1);
      const phase = (stable(nm + 'p' + i) % 628) / 100;
      const img = (stable(nm + i) + i) % H.planetImgs.length;
      const d = 110 + (stable(nm + 'd' + i) % 90);
      list.push({ i, oR, spd, phase, img, d });
    }
    return list;
  };

  // ENTER in the orbit view: land on the selected planet
  H.tryLand = () => {
    if (H.landSel < 0 || !GM.LANDER) return;
    const st = GM.STARS[H.sys];
    const nm = starName(st);
    const prof = GM.LANDER.profile(nm, H.landSel);
    if (!prof) return;
    if (prof.gas) { GM.A.SND.ui(); return; }        // gas giants: no surface
    if (H.landers <= 0) { GM.A.SND.ui(); return; }   // no landers left
    if (GM.LANDER.begin(H.sys, H.landSel, nm)) H.land = GM.LANDER.active;
  };

  // ============== the classic 2D hyperspace (main view) ==============
  // The original game's presentation: a top-down flat starmap the flagship
  // flies across, entering systems and flying between orbiting planets.
  // Our old 3D chase-cam lives on as the second mini-map (the inset).

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function stardate(days) {
    const d = (days - 1) % 360;
    const y = 2155 + Math.floor((days - 1) / 360);
    return (d % 30 + 1) + ' ' + MONTHS[Math.floor(d / 30)] + ' ' + y;
  }

  // UQM facing sheets are north-clockwise (frame 0 = north); our yaw is a
  // canvas angle (0 = east) — the same mapping as the lander and blazer
  function frame2D(yaw) {
    return Math.round(((((yaw + Math.PI / 2) % U.TAU) + U.TAU) % U.TAU) / (U.TAU / 16)) % 16;
  }

  function drawFlagship2D(g, cx, cy, yaw, sc, thrusting, t) {
    // the PRECURSOR CAPITAL SHIP — the original flagship-big art drawn at
    // twice the Dreadnought's in-game size (dreadnought-big is 29x33 at
    // PS 2.25 = ~74px tall at zoom 1; flagship-big is 28x47 at 3.15 =
    // ~148px). It is the only ship in the game the size of a small moon.
    const img = H.precursorImg;
    if (img && img.complete && img.naturalWidth) {
      const k = 3.15;
      const w = img.naturalWidth * k, hh = img.naturalHeight * k;
      g.save();
      g.translate(cx, cy);
      g.rotate(yaw + Math.PI / 2);   // sprite faces north
      g.imageSmoothingEnabled = false;
      g.drawImage(img, -w / 2, -hh / 2, w, hh);
      g.restore();
      if (thrusting) {
        const back = yaw + Math.PI;
        const bx = cx + Math.cos(back) * (hh * 0.52 + 8);
        const by = cy + Math.sin(back) * (hh * 0.52 + 8);
        g.globalAlpha = 0.45 + 0.3 * Math.sin(t * 30);
        g.fillStyle = '#ffca7a';
        g.beginPath(); g.arc(bx, by, 16 + Math.random() * 10, 0, U.TAU); g.fill();
        g.globalAlpha = 1;
      }
      return;
    }
    // fallback: the 16-facing nav icon
    const fi = frame2D(yaw);
    const nav = H.flag[fi];
    if (!nav || !nav.complete || !nav.naturalWidth) return;
    const a = (GM.CONTENT.navsprites.flagship.a || [])[fi] || [8, 8];
    g.imageSmoothingEnabled = false;
    g.drawImage(nav, cx - a[0] * sc, cy - a[1] * sc, nav.naturalWidth * sc, nav.naturalHeight * sc);
  }

  // bake the original hyperspace twinkle: 16 tint steps per star frame,
  // tinted by the ambient color-cycling ramp (source-atop on a DEDICATED
  // offscreen — never on the shared world canvas)
  function bakeHyperStars() {
    if (!H.ambientImgs || !H.hstarImgs) return false;
    const rc = document.createElement('canvas');
    rc.width = 1; rc.height = 1;
    const rg = rc.getContext('2d');
    const ramp = [];
    for (const im of H.ambientImgs) {
      if (!im.complete || !im.naturalWidth) return false;
      rg.clearRect(0, 0, 1, 1);
      rg.drawImage(im, 0, 0);
      const d = rg.getImageData(0, 0, 1, 1).data;
      ramp.push([d[0], d[1], d[2]]);
    }
    const bakes = [];
    for (const fr of [0, 5, 11, 17, 23, 28]) {
      const src = H.hstarImgs[fr];
      if (!src.complete || !src.naturalWidth) return false;
      const steps = [];
      for (let s = 0; s < 16; s++) {
        const c = document.createElement('canvas');
        c.width = src.naturalWidth; c.height = src.naturalHeight;
        const cg = c.getContext('2d');
        cg.imageSmoothingEnabled = false;
        cg.drawImage(src, 0, 0);
        const col = ramp[Math.floor(s * ramp.length / 16) % ramp.length];
        cg.globalCompositeOperation = 'source-atop';
        cg.globalAlpha = 0.45;
        cg.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        cg.fillRect(0, 0, c.width, c.height);
        steps.push(c);
      }
      bakes.push(steps);
    }
    H.starBake = bakes;
    H.ambientRamp = ramp;
    return true;
  }

  H.update2D = (dt) => {
    const s = H.ship;
    // the gravity-well plunge: camera falls into the target star, then
    // the system view opens (ESC aborts)
    if (H.dive) {
      H.dive.t += dt;
      GM.FX.addShake(2.4 * dt);   // the plunge rumble
      if (H.dive.t >= H.dive.dur) {
        H.sys = H.dive.i;
        H.landSel = -1;
        H.dive = null;
        GM.A.startMusic('orbit');
      }
      return;
    }
    // campaign clock: 30s = 1 day, in hyperspace and in-system alike
    H.dayT += dt;
    if (H.dayT >= 30) { H.dayT -= 30; H.days++; }
    if (H.warp) {
      const w = H.warp;
      w.t += dt;
      const p = Math.min(1, w.t / w.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      s.x = w.sx + (w.tx - w.sx) * e;
      s.y = w.sy + (w.ty - w.sy) * e;
      if (p >= 1) { s.spd = 0; H.warp = null; }
    } else {
      const turn = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      s.yaw += turn * 2.6 * dt;
      const boost = (k['ShiftLeft'] || k['ShiftRight']) ? 2 : 1;
      if (k['KeyW'] || k['ArrowUp']) s.spd = Math.min(MAX_SPEED * boost, s.spd + ACCEL * boost * dt);
      else s.spd = Math.max(0, s.spd - 260 * dt);
      if (k['KeyS'] || k['ArrowDown']) s.spd = Math.max(0, s.spd - 3600 * dt);
      s.x += Math.cos(s.yaw) * s.spd * dt;
      s.y += Math.sin(s.yaw) * s.spd * dt;
    }
    // nearest system (for the ENTER prompt)
    let bd = Infinity, bi = -1;
    for (let i = 0; i < GM.STARS.length; i++) {
      const st = GM.STARS[i];
      const dx = st[2] - s.x, dy = st[3] - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    H.near = bi; H.nearD = Math.sqrt(bd);
    // in-system: track the nearest planet for auto-select landing
    H.nearPlanet = -1; H.nearPlanetD = Infinity;
    if (H.sys !== null) {
      const st = GM.STARS[H.sys];
      for (const p of H.sysPlanets(H.sys)) {
        const a = H.t * p.spd + p.phase;
        const px = st[2] + Math.cos(a) * p.oR;
        const py = st[3] + Math.sin(a) * p.oR;
        const d = Math.hypot(px - s.x, py - s.y);
        if (d < H.nearPlanetD) { H.nearPlanetD = d; H.nearPlanet = p.i; }
      }
    }
  };

  H.drawWorld2D = (g, t) => {
    g.fillStyle = '#150906';   // hyperspace: deep red, like the original
    g.fillRect(0, 0, GM.WV, GM.WH);
    // bake the original starfield once the nav assets decode
    if (!H.hyperBaked && !H.baking) H.hyperBaked = bakeHyperStars();
    const s = H.ship;
    // the plunge: during a dive the camera falls into the target star —
    // the zoom ramps and the camera center slides from ship to star
    let dv = null, zMul = 1, camX = s.x, camY = s.y;
    if (H.dive) {
      const st = GM.STARS[H.dive.i];
      const p = Math.min(1, H.dive.t / H.dive.dur);
      zMul = 1 + (p * p) * 11;
      const cp = Math.min(1, p * 1.45);
      camX = s.x + (st[2] - s.x) * cp;
      camY = s.y + (st[3] - s.y) * cp;
      dv = { p, st };
    }
    const z = H.z2d * zMul;
    const CW = GM.WV / 2, CH = GM.WH / 2;
    const sxOf = (wx) => CW + (wx - camX) * z;
    const syOf = (wy) => CH + (wy - camY) * z;

    // nebula layer (0.35 parallax)
    for (const n of H.neb2) {
      const nx = CW + (n.x - camX * 0.35) * z;
      const ny = CH + (n.y - camY * 0.35) * z;
      if (nx < -n.r || nx > GM.WV + n.r || ny < -n.r || ny > GM.WH + n.r) continue;
      g.globalAlpha = n.a;
      g.fillStyle = '#6e1f0e';
      g.beginPath(); g.arc(nx, ny, n.r * z * 4, 0, U.TAU); g.fill();
    }
    g.globalAlpha = 1;

    // the ORIGINAL hyperspace background stars (nav/hyperstars sprites,
    // twinkling through the ambient color-cycling ramp)
    if (H.hyperBaked && H.starBake) {
      for (const b of H.bgStars) {
        const nx = CW + (b.x - camX * 0.6) * z;
        const ny = CH + (b.y - camY * 0.6) * z;
        if (nx < -60 || nx > GM.WV + 60 || ny < -60 || ny > GM.WH + 60) continue;
        const bake = H.starBake[b.fr % H.starBake.length];
        if (!bake) continue;
        const im = bake[Math.floor(t * 10 + b.ph) % 16];
        const sc = b.sc * (z / H.z2d) * 2.2;
        g.imageSmoothingEnabled = false;
        g.drawImage(im, nx - im.width * sc / 2, ny - im.height * sc / 2,
          im.width * sc, im.height * sc);
      }
    }

    // constellation lines
    g.strokeStyle = '#3a1e2c';
    g.lineWidth = 1;
    for (const cl of GM.STAR_CLUSTERS) {
      let prev = null;
      for (const idx of cl.s) {
        const st = GM.STARS[idx];
        const px = sxOf(st[2]), py = syOf(st[3]);
        if (prev && px > -60 && px < GM.WV + 60 && py > -60 && py < GM.WH + 60) {
          g.globalAlpha = 0.3;
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(px, py); g.stroke();
        }
        prev = [px, py];
      }
    }
    g.globalAlpha = 1;

    // the stars
    const warpK = H.warp ? Math.sin(Math.min(1, H.warp.t / H.warp.dur) * Math.PI) : 0;
    const warpAng = H.warp ? Math.atan2(H.warp.ty - H.warp.sy, H.warp.tx - H.warp.sx) : 0;
    const labels = [];
    for (let i = 0; i < GM.STARS.length; i++) {
      const st = GM.STARS[i];
      const x = sxOf(st[2]), y = syOf(st[3]);
      if (x < -40 || x > GM.WV + 40 || y < -40 || y > GM.WH + 40) continue;
      const col = COLMAP[st[5]] || '#fff';
      const base = st[6] === 3 ? 7.5 : (st[6] === 2 ? 4.6 : 2.6);
      const rad = U.clamp(base, 2, 8);
      if (st[6] > 1) {
        g.globalAlpha = 0.22;
        g.fillStyle = col;
        g.beginPath(); g.arc(x, y, rad * 2.2, 0, U.TAU); g.fill();
        g.globalAlpha = 1;
      }
      if (warpK > 0.05 || dv) {
        // warp streaks stretch stars opposite the travel direction; during
        // the dive everything streaks radially AWAY from the target star
        let ax, ay, k;
        if (dv) {
          const tx2 = sxOf(dv.st[2]), ty2 = syOf(dv.st[3]);
          ax = Math.atan2(y - ty2, x - tx2);
          k = dv.p * dv.p * 280;
        } else {
          ax = warpAng + Math.PI;
          k = 110 * warpK;
        }
        g.globalAlpha = 0.55 * (dv ? dv.p : warpK);
        g.strokeStyle = col;
        g.lineWidth = Math.max(1, rad * 0.8);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(ax) * k, y + Math.sin(ax) * k);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, rad, 0, U.TAU); g.fill();
      if (i === H.hover && H.hover !== H.sel) {
        g.globalAlpha = 0.9;
        g.strokeStyle = '#fff'; g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, rad + 7, 0, U.TAU); g.stroke();
        g.globalAlpha = 1;
      }
      if (i === H.sel) {
        const bl = 0.7 + 0.3 * Math.sin(t * 5);
        g.globalAlpha = bl;
        g.strokeStyle = '#fff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, rad + 10, 0, U.TAU); g.stroke();
        g.beginPath(); g.arc(x, y, rad + 14, 0, U.TAU); g.stroke();
        g.globalAlpha = 1;
      }
      const dx = st[2] - s.x, dy = st[3] - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 4200) labels.push({ x, y, n: starName(st), c: col, d });
    }
    // labels: nearest eight
    labels.sort((a, b) => a.d - b.d);
    g.font = '13px monospace';
    g.textAlign = 'left';
    const nLab = Math.min(labels.length, 8);
    for (let i = 0; i < nLab; i++) {
      const L = labels[i];
      g.globalAlpha = U.clamp(1 - L.d / 5000, 0.15, 0.9);
      g.fillStyle = L.c;
      g.fillText(L.n, L.x + 10, L.y - 9);
    }
    g.globalAlpha = 1;

    // the plunge overlay: vortex swirls, the original orbitenter gateway
    // art swelling at the bottom of the gravity well, then the flash
    if (dv) {
      const tx = sxOf(dv.st[2]), ty = syOf(dv.st[3]);
      g.strokeStyle = 'rgba(255,120,60,' + (0.4 * dv.p) + ')';
      g.lineWidth = 3;
      for (let a = 0; a < 3; a++) {
        g.beginPath();
        for (let kk = 0; kk <= 30; kk++) {
          const ang = t * (2 + dv.p * 7) + a * 2.09 + kk * 0.22;
          const rr = (30 + kk * (7 + dv.p * 26)) * (0.5 + dv.p * 2.2);
          const px = tx + Math.cos(ang) * rr;
          const py = ty + Math.sin(ang) * rr * 0.82;
          if (kk === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
      g.lineWidth = 1;
      if (dv.p > 0.5 && H.orbitEnterImg && H.orbitEnterImg.complete && H.orbitEnterImg.naturalWidth) {
        const oa = (dv.p - 0.5) / 0.5;
        const ow = H.orbitEnterImg.naturalWidth * (2.5 + oa * 9);
        const oh = H.orbitEnterImg.naturalHeight * (2.5 + oa * 9);
        g.globalAlpha = Math.min(0.95, oa);
        g.imageSmoothingEnabled = false;
        g.drawImage(H.orbitEnterImg, tx - ow / 2, ty - oh / 2, ow, oh);
        g.globalAlpha = 1;
      }
      if (dv.p > 0.88) {
        g.fillStyle = 'rgba(255,255,255,' + ((dv.p - 0.88) / 0.12) + ')';
        g.fillRect(0, 0, GM.WV, GM.WH);
      }
    }

    // the flagship, fixed at view center (the map scrolls under it)
    drawFlagship2D(g, CW, CH, s.yaw, 4, (k['KeyW'] || k['ArrowUp'] || H.warp), t);
  };

  H.drawSystem2D = (g, t) => {
    g.fillStyle = '#04060c';   // truespace: normal dark starfield
    g.fillRect(0, 0, GM.WV, GM.WH);
    const s = H.ship, z = H.z2d;
    const st = GM.STARS[H.sys];
    const CW = GM.WV / 2, CH = GM.WH / 2;
    const sxOf = (wx) => CW + (wx - s.x) * z;
    const syOf = (wy) => CH + (wy - s.y) * z;
    const sunX = sxOf(st[2]), sunY = syOf(st[3]);

    H.sysScr = [];   // planet positions for click picking (world-canvas px)

    // the sun
    const simg = H.sun.length ? H.sun[Math.floor(t * 9) % H.sun.length] : null;
    if (simg && simg.complete && simg.naturalWidth > 0) {
      const sc2 = 8;
      const w = simg.naturalWidth * sc2, h = simg.naturalHeight * sc2;
      const grd = g.createRadialGradient(sunX, sunY, w * 0.2, sunX, sunY, w * 1.6);
      grd.addColorStop(0, 'rgba(255,220,150,0.35)');
      grd.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(sunX, sunY, w * 1.6, 0, U.TAU); g.fill();
      g.imageSmoothingEnabled = false;
      g.drawImage(simg, sunX - w / 2, sunY - h / 2, w, h);
    } else {
      g.fillStyle = COLMAP[st[5]] || '#ffd85e';
      g.beginPath(); g.arc(sunX, sunY, 120, 0, U.TAU); g.fill();
    }

    // planets on flat circular orbits
    const planets = H.sysPlanets(H.sys);
    for (const p of planets) {
      const a = H.t * p.spd + p.phase;
      const px = st[2] + Math.cos(a) * p.oR;
      const py = st[3] + Math.sin(a) * p.oR;
      g.strokeStyle = '#1b2438';
      g.globalAlpha = 0.8;
      g.beginPath(); g.arc(sunX, sunY, p.oR * z, 0, U.TAU); g.stroke();
      g.globalAlpha = 1;
      const X = sxOf(px), Y = syOf(py);
      H.sysScr.push({ i: p.i, x: X, y: Y });
      const pim = H.planetImgs[p.img];
      const dd = p.d * 1.5;   // v0.41: worlds dwarf even the Precursor vessel
      if (pim && pim.complete && pim.naturalWidth > 0) {
        g.imageSmoothingEnabled = false;
        g.drawImage(pim, X - dd / 2, Y - dd / 2, dd, dd);
      }
      if (H.landSel === p.i) {
        const bl = 0.7 + 0.3 * Math.sin(t * 5);
        g.globalAlpha = bl;
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.arc(X, Y, dd / 2 + 14, 0, U.TAU); g.stroke();
        g.beginPath(); g.arc(X, Y, dd / 2 + 22, 0, U.TAU); g.stroke();
        g.globalAlpha = 1;
        const prof = GM.LANDER && GM.LANDER.profile(starName(st), p.i);
        if (prof) {
          g.font = 'bold 16px monospace';
          g.textAlign = 'center';
          g.fillStyle = prof.gas ? '#8fa2c0' : '#cfe0ff';
          g.fillText(prof.name.toUpperCase(), X, Y + dd / 2 + 40);
          g.font = '13px monospace';
          g.fillStyle = '#8fa2c0';
          g.fillText(prof.label.toUpperCase() + (prof.gas ? '' :
            ' · ' + prof.temp + '\u00B0C · TECT ' + prof.tect + ' · WX ' + prof.wx +
            ' · LIFE ' + prof.life), X, Y + dd / 2 + 60);
          g.textAlign = 'left';
        }
      } else if (H.nearPlanet === p.i && H.nearPlanetD < 900) {
        g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6);
        g.strokeStyle = '#3fc8ff'; g.lineWidth = 2;
        g.beginPath(); g.arc(X, Y, dd / 2 + 14, 0, U.TAU); g.stroke();
        g.globalAlpha = 1;
      }
    }
    // the flagship
    drawFlagship2D(g, CW, CH, s.yaw, 4, (k['KeyW'] || k['ArrowUp']), t);
  };

  // ---- compact 3D scenes for the inset mini-map (our old chase-cam) ----
  function drawChevron(g, t, proj, s, warpK, r) {
    r = r || 14;
    const sv = [
      [r * 1.3, 0, 0],
      [-r * 0.55, r * 0.85, -r * 0.15],
      [-r * 0.55, -r * 0.85, -r * 0.15],
      [-r * 0.3, 0, r * 0.45],
    ];
    const sf = fwd(s.yaw, s.pitch || 0), srr = rightv(s.yaw), su = upv(sf, srr);
    function shipPt(lx, ly, lz) {
      return proj(s.x + sf[0] * lx + srr[0] * ly + su[0] * lz,
        s.y + sf[1] * lx + srr[1] * ly + su[1] * lz,
        (s.z || 0) + sf[2] * lx + srr[2] * ly + su[2] * lz);
    }
    const P = sv.map((v) => shipPt(v[0], v[1], v[2]));
    if (!P.every((p) => p)) return;
    g.fillStyle = '#155a9e';
    g.beginPath();
    g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.lineTo(P[3][0], P[3][1]);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(P[0][0], P[0][1]); g.lineTo(P[2][0], P[2][1]); g.lineTo(P[3][0], P[3][1]);
    g.closePath(); g.fill();
    g.strokeStyle = '#7fd4ff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]);
    g.lineTo(P[3][0], P[3][1]); g.lineTo(P[2][0], P[2][1]);
    g.closePath(); g.stroke();
    // engine glow
    if (k['KeyW'] || warpK > 0.1) {
      const ex = P[3][0] + (P[3][0] - P[0][0]) * 0.3;
      const ey = P[3][1] + (P[3][1] - P[0][1]) * 0.3;
      g.globalAlpha = 0.4 + 0.3 * Math.sin(t * 30);
      g.fillStyle = warpK > 0.1 ? '#9ff0ff' : '#ffca7a';
      g.beginPath(); g.ellipse(ex, ey, 6, 3, 0, 0, U.TAU); g.fill();
      g.globalAlpha = 1;
    }
    g.lineWidth = 1;
  }

  function chaseBasis(W, Hh) {
    const s = H.ship;
    const f = fwd(s.yaw, s.pitch || 0);
    const r = rightv(s.yaw);
    const u = upv(f, r);
    const camB = CAM_BACK;
    const cx0 = s.x - f[0] * camB;
    const cy0 = s.y - f[1] * camB;
    const cz0 = (s.z || 0) - f[2] * camB + CAM_UP;
    const CW = W / 2, CH = Hh / 2;
    const fov = FOV * (W / GM.WV);
    return {
      f, r, u, CW, CH, fov,
      proj(px, py, pz) {
        const dx = px - cx0, dy = py - cy0, dz = pz - cz0;
        const cz = dx * f[0] + dy * f[1] + dz * f[2];
        if (cz < 40) return null;
        const ox = dx * r[0] + dy * r[1] + dz * r[2];
        const oy = dx * u[0] + dy * u[1] + dz * u[2];
        return [CW + ox * fov / cz, CH - oy * fov / cz, cz];
      },
    };
  }

  H.scene3D = (g, t, W, Hh) => {
    g.fillStyle = '#04060c';
    g.fillRect(0, 0, W, Hh);
    const { f, r, u, proj } = chaseBasis(W, Hh);
    // backdrop dots
    for (const b of H.bg) {
      const cz = b.x * f[0] + b.y * f[1] + b.z * f[2];
      if (cz < 0.05) continue;
      const ox = b.x * r[0] + b.y * r[1] + b.z * r[2];
      const oy = b.x * u[0] + b.y * u[1] + b.z * u[2];
      const sx = W / 2 + ox / cz * FOV * 0.32 * (W / GM.WV);
      const sy = Hh / 2 - oy / cz * FOV * 0.32 * (W / GM.WV);
      if (sx < 0 || sx > W || sy < 0 || sy > Hh) continue;
      g.globalAlpha = b.b;
      g.fillStyle = b.c;
      g.fillRect(sx, sy, b.s, b.s);
    }
    g.globalAlpha = 1;
    // constellation lines
    g.strokeStyle = '#33456e';
    g.lineWidth = 1;
    for (const cl of GM.STAR_CLUSTERS) {
      let prev = null;
      for (const idx of cl.s) {
        const st = GM.STARS[idx];
        const p = proj(st[2], st[3], st[4]);
        if (prev && p) {
          g.globalAlpha = 0.18;
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke();
        }
        prev = p;
      }
    }
    g.globalAlpha = 1;
    // stars — MUCH bigger: the inset is a mini-map, every star must read
    const warpK2 = H.warp ? Math.sin(Math.min(1, H.warp.t / H.warp.dur) * Math.PI) : 0;
    for (let i = 0; i < GM.STARS.length; i++) {
      const st = GM.STARS[i];
      const p = proj(st[2], st[3], st[4]);
      if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > Hh + 10) continue;
      const fog = U.clamp(1 - p[2] / 30000, 0.2, 1);
      const rad = (st[6] === 3 ? 7 : st[6] === 2 ? 4.6 : 2.8) * fog;
      const col = COLMAP[st[5]] || '#fff';
      if (warpK2 > 0.1) {
        g.globalAlpha = 0.6 * warpK2;
        g.strokeStyle = col;
        g.lineWidth = Math.max(1, rad * 0.6);
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0] + (p[0] - W / 2) * 0.4 * warpK2, p[1] + (p[1] - Hh / 2) * 0.4 * warpK2);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.globalAlpha = fog;
      g.fillStyle = col;
      g.beginPath(); g.arc(p[0], p[1], rad, 0, U.TAU); g.fill();
      if (i === H.sel) {
        g.globalAlpha = 0.9;
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(p[0], p[1], rad + 4, 0, U.TAU); g.stroke();
        g.globalAlpha = 1;
        g.lineWidth = 1;
      }
    }
    g.globalAlpha = 1;
    // the ship
    drawChevron(g, t, proj, H.ship, warpK2, 20);
  };

  H.sceneSys3D = (g, t, W, Hh) => {
    g.fillStyle = '#04060c';
    g.fillRect(0, 0, W, Hh);
    const { proj } = chaseBasis(W, Hh);
    const st = GM.STARS[H.sys];
    // the sun
    const sp = proj(st[2], st[3], st[4]);
    if (sp) {
      const grd = g.createRadialGradient(sp[0], sp[1], 4, sp[0], sp[1], 70);
      grd.addColorStop(0, 'rgba(255,220,150,0.5)');
      grd.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(sp[0], sp[1], 70, 0, U.TAU); g.fill();
      g.fillStyle = COLMAP[st[5]] || '#ffd85e';
      g.beginPath(); g.arc(sp[0], sp[1], 22, 0, U.TAU); g.fill();
    }
    // planets on tilted ellipses
    for (const p of H.sysPlanets(H.sys)) {
      const a = H.t * p.spd + p.phase;
      const px = st[2] + Math.cos(a) * p.oR;
      const py = st[3] + Math.sin(a) * p.oR * 0.42;
      const pp = proj(px, py, st[4]);
      if (!pp) continue;
      g.strokeStyle = '#1b2438';
      g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse((sp ? sp[0] : W / 2), (sp ? sp[1] : Hh / 2),
        p.oR * (FOV * (W / GM.WV)) / Math.max(200, sp ? sp[2] : 800),
        p.oR * 0.42 * (FOV * (W / GM.WV)) / Math.max(200, sp ? sp[2] : 800), 0, 0, U.TAU);
      g.stroke();
      g.globalAlpha = 1;
      const im = H.planetImgs[p.img];
      const ds = U.clamp(3200 / pp[2], 4, 26);
      if (im && im.complete && im.naturalWidth > 0) {
        g.imageSmoothingEnabled = false;
        g.drawImage(im, pp[0] - ds / 2, pp[1] - ds / 2, ds, ds);
      }
      if (p.i === H.landSel) {
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(pp[0], pp[1], ds * 0.7, 0, U.TAU); g.stroke();
        g.lineWidth = 1;
      }
    }
    drawChevron(g, t, proj, H.ship, 0, 20);
  };

  // ---- rendering ----
  H.drawWorld = (g, t) => {
    if (H.view === '2d') {
      if (H.sys !== null) H.drawSystem2D(g, t);
      else H.drawWorld2D(g, t);
      return;
    }
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

    // planets: 3..6 SC2 discs on seeded orbits (selection + landing hooks)
    H.sysScr = [];
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    const planets = H.sysPlanets(H.sys);
    for (const p of planets) {
      const a = H.t * p.spd + p.phase;
      const px = CW + Math.cos(a) * p.oR;
      const py = CH + Math.sin(a) * p.oR * 0.42;   // slightly tilted orbital plane
      // orbit path
      g.strokeStyle = '#1b2438';
      g.globalAlpha = 0.8;
      g.beginPath();
      g.ellipse(CW, CH, p.oR, p.oR * 0.42, 0, 0, U.TAU);
      g.stroke();
      g.globalAlpha = 1;
      H.sysScr.push({ i: p.i, x: px, y: py });
      const img = H.planetImgs[p.img];
      if (img && img.complete && img.naturalWidth > 0) {
        g.imageSmoothingEnabled = false;
        g.drawImage(img, px - p.d / 2, py - p.d / 2, p.d, p.d);
      }
      // selection reticle + planet label
      if (H.landSel === p.i) {
        const bl = 0.7 + 0.3 * Math.sin(t * 5);
        g.globalAlpha = bl;
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(px, py, p.d / 2 + 12, 0, U.TAU); g.stroke();
        g.beginPath(); g.arc(px, py, p.d / 2 + 18, 0, U.TAU); g.stroke();
        g.globalAlpha = 1;
        const prof = GM.LANDER && GM.LANDER.profile(starName(st), p.i);
        if (prof) {
          g.font = 'bold 15px monospace';
          g.textAlign = 'center';
          g.fillStyle = prof.gas ? '#8fa2c0' : '#cfe0ff';
          g.fillText(prof.name.toUpperCase(), px, py + p.d / 2 + 38);
          g.font = '12px monospace';
          g.fillStyle = '#8fa2c0';
          g.fillText(prof.label.toUpperCase() + (prof.gas ? '' :
            ' · ' + prof.temp + '\u00B0C · TECT ' + prof.tect + ' · WX ' + prof.wx +
            ' · LIFE ' + prof.life), px, py + p.d / 2 + 56);
          g.textAlign = 'left';
        }
      }
    }
  };

  H.drawHUD = (g, t) => {
    g.textAlign = 'left';
    g.font = 'bold 8px monospace';

    // ---- right column: status block ABOVE the two mini-maps ----
    // (the original game's top-bar: date, fuel, landers, cargo)
    const RX = MM_X(), RW = MM_W;
    g.fillStyle = 'rgba(4,6,12,0.82)';
    g.fillRect(RX - 4, 4, RW + 8, 62);
    g.strokeStyle = '#1b2438';
    g.strokeRect(RX - 4, 4, RW + 8, 62);
    g.fillStyle = '#cfe0ff';
    g.fillText('DAY ' + H.days, RX, 14);
    g.fillStyle = '#8fa2c0';
    g.fillText(stardate(H.days), RX, 23);
    // fuel bar + number
    g.fillStyle = '#232c40';
    g.fillRect(RX, 27.5, RW - 34, 4);
    const fuelFrac = H.fuel / H.fuelMax;
    g.fillStyle = fuelFrac > 0.3 ? '#ffd85e' : '#ff5648';
    g.fillRect(RX, 27.5, Math.round((RW - 34) * fuelFrac), 4);
    g.fillStyle = '#55688a';
    g.fillText(String(H.fuel), RX + RW - 30, 32);
    g.fillStyle = '#55688a';
    g.fillText('LANDERS ' + H.landers, RX, 41);
    const minRU = H.cargo.cats.reduce((a, b) => a + b, 0);
    g.fillText('CARGO ' + minRU + ' MIN · ' + H.cargo.bio + ' BIO', RX, 50);
    if (H.sys !== null) {
      const st = GM.STARS[H.sys];
      g.fillStyle = '#cfe0ff';
      g.fillText('SYSTEM ' + starName(st).toUpperCase(), RX, 60);
    } else if (H.sel !== null && H.sel >= 0) {
      const st = GM.STARS[H.sel];
      g.fillStyle = COLMAP[st[5]] || '#cfe0ff';
      g.fillText('TARGET ' + starName(st).toUpperCase(), RX, 60);
    }

    // ---- first mini-map: the 2D radar (zoomable, pannable, clickable) ----
    const MW = MM_W, MX = MM_X(), MY = MM_Y();
    const mmBox = MW - MM_PAD * 2;
    g.fillStyle = 'rgba(4,6,12,0.82)';
    g.fillRect(MX, MY, MW, MW);
    g.strokeStyle = H.mmDrag ? '#3fc8ff' : '#1b2438';
    g.strokeRect(MX, MY, MW, MW);
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
    // player + heading
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
        g.strokeStyle = '#3fc8ff';
        g.beginPath(); g.arc(MX + MM_PAD + snx * mmBox, MY + MM_PAD + sny * mmBox, 4, 0, U.TAU); g.stroke();
      }
    }
    if (H.mmZoom > 1.05) {
      g.font = '7px monospace';
      g.fillStyle = '#3fc8ff';
      g.textAlign = 'center';
      g.fillText('×' + H.mmZoom.toFixed(1), MX + MW / 2, MY + MW - 4);
      g.textAlign = 'left';
    }

    // ---- second mini-map: our 3D hyperspace view, below the radar ----
    const IY = MY + MW + 8;
    if (!H.insCv) {
      H.insCv = document.createElement('canvas');
      H.insCv.width = 240; H.insCv.height = 300;
    }
    const ig = H.insCv.getContext('2d');
    if (H.sys !== null) H.sceneSys3D(ig, t, 240, 300);
    else H.scene3D(ig, t, 240, 300);
    g.drawImage(H.insCv, MX, IY, MW, 150);
    g.strokeStyle = '#1b2438';
    g.strokeRect(MX, IY, MW, 150);
    g.font = '7px monospace';
    g.fillStyle = '#55688a';
    g.fillText('3D VIEW', MX + 2, IY + 8);

    // ---- top-left: mode banner ----
    if (H.sys !== null) {
      const st = GM.STARS[H.sys];
      g.font = 'bold 8px monospace';
      g.fillStyle = '#cfe0ff';
      g.fillText('SYSTEM: ' + starName(st).toUpperCase(), 8, 14);
      g.font = '8px monospace';
      g.fillStyle = '#8fa2c0';
      g.fillText('fly to a planet · [TAB] select · [ENTER] land · [ESC] leave', 8, 26);
    } else {
      g.font = 'bold 8px monospace';
      g.fillStyle = '#cfe0ff';
      g.fillText('HYPERSPACE · DAY ' + H.days, 8, 14);
      g.font = '8px monospace';
      g.fillStyle = '#8fa2c0';
      g.fillText('VEL ' + Math.round(H.ship.spd) + ' U/S' +
        ((k['ShiftLeft'] || k['ShiftRight']) && H.ship.spd > 400 ? '  [BOOST]' : ''), 8, 26);
    }

    // ---- bottom-left nearest star ----
    if (H.near >= 0 && H.warp === null && H.sys === null) {
      const st = GM.STARS[H.near];
      g.font = '8px monospace';
      g.textAlign = 'left';
      g.fillStyle = COLMAP[st[5]] || '#cfe0ff';
      g.fillText(starName(st).toUpperCase() + '  ' + Math.round(H.nearD) + ' U', 8, GM.VH - 10);
    }

    // ---- bottom-center prompts ----
    g.textAlign = 'center';
    g.font = 'bold 11px monospace';
    const blink = Math.sin(t * 4) > -0.4;
    if (H.warp) {
      g.fillStyle = '#fff';
      g.fillText('WARPING TO ' + starName(GM.STARS[H.warp.i]).toUpperCase() + '…', GM.VW / 2, GM.VH - 34);
    } else if (H.sys !== null) {
      if (blink) {
        if (H.landSel >= 0 && GM.LANDER) {
          const prof = GM.LANDER.profile(starName(GM.STARS[H.sys]), H.landSel);
          if (prof && prof.gas) {
            g.fillStyle = '#ffab3d';
            g.fillText(prof.name.toUpperCase() + ' IS A GAS GIANT — CANNOT LAND', GM.VW / 2, GM.VH - 34);
          } else if (H.landers <= 0) {
            g.fillStyle = '#ff5648';
            g.fillText('NO LANDERS LEFT', GM.VW / 2, GM.VH - 34);
          } else {
            g.fillStyle = '#fff';
            g.fillText('[ENTER] LAND ON ' + prof.name.toUpperCase(), GM.VW / 2, GM.VH - 34);
          }
        }
      }
    } else if (H.near >= 0 && H.nearD < ENTER_RANGE && blink) {
      g.fillStyle = '#fff';
      g.fillText('[ENTER] ENTER SYSTEM', GM.VW / 2, GM.VH - 34);
    } else if (H.sel !== null && H.sel >= 0 && blink) {
      const st2 = GM.STARS[H.sel];
      const dx2 = st2[2] - H.ship.x, dy2 = st2[3] - H.ship.y;
      const d2 = Math.hypot(dx2, dy2);
      const cost = Math.ceil(d2 / 1500);
      if (H.fuel >= cost) {
        g.fillStyle = '#fff';
        g.fillText('[ENTER] WARP — ' + cost + ' FUEL', GM.VW / 2, GM.VH - 34);
      } else {
        g.fillStyle = '#ff5648';
        g.fillText('NEED ' + cost + ' FUEL — HAVE ' + H.fuel, GM.VW / 2, GM.VH - 34);
      }
    }
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    if (H.sys === null) {
      g.fillText('A/D turn · W thrust · S brake · SHIFT boost · SCROLL zoom · CLICK target · RADAR: zoom/pan/click · H help', GM.VW / 2, GM.VH - 6);
    } else {
      g.fillText('A/D turn · W thrust · S brake · TAB select planet · ENTER land · ESC leave system', GM.VW / 2, GM.VH - 6);
    }

    // ---- post-landing summary ----
    if (H.summary) {
      H.summary.t += 1 / 60;
      if (H.summary.t > 5) H.summary = null;
      else {
        g.textAlign = 'center';
        g.font = 'bold 11px monospace';
        g.globalAlpha = Math.min(1, (5 - H.summary.t) * 2);
        H.summary.lines.forEach((ln, i) => {
          g.fillStyle = i === 0 ? '#fff' : '#8fa2c0';
          g.fillText(ln, GM.VW / 2, 70 + i * 16);
        });
        g.globalAlpha = 1;
        g.textAlign = 'left';
      }
    }

    // ---- help card (until first input; H toggles) ----
    if (H.help && H.sys === null) {
      g.fillStyle = 'rgba(4,6,12,0.72)';
      g.fillRect(0, 0, GM.VW, GM.VH);
      g.textAlign = 'center';
      g.font = 'bold 14px monospace';
      g.fillStyle = '#fff';
      g.fillText('HYPERSPACE', GM.VW / 2, 92);
      g.font = '10px monospace';
      g.fillStyle = '#8fa2c0';
      const lines = [
        'The classic flat starmap: fly the flagship between 502 systems.',
        'A/D — turn · W/S — thrust/brake · SHIFT — boost · SCROLL — zoom',
        'CLICK a star — target it · ENTER — warp (costs fuel, ÷1500 per unit)',
        'Arrive in range and ENTER again to drop into the system,',
        'then fly to a planet and press ENTER to land the planetary module.',
        'Top right: stardate and status, then the radar, then the 3D view.',
        'Radar: scroll to zoom, drag to pan, click stars to target.',
        '',
        'press any key or click to begin · H shows this again',
      ];
      lines.forEach((ln, i) => g.fillText(ln, GM.VW / 2, 120 + i * 16));
      g.textAlign = 'left';
    }
    g.textAlign = 'left';
  };
})(window.GM);
