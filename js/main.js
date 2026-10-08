// gravity-melee :: main loop, input, game states, camera
(function (GM) {
  const { U } = GM;

  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  GM.paused = false;
  GM.speed = 1;
  GM.debugAI = false;
  GM.humanShip = null;
  GM.humanTarget = null;     // tab-target lock
  GM.state = 'title';        // 'title' | 'play' | 'victory'
  GM.world = null;

  const keys = {};

  // ---------- input ----------
  window.addEventListener('keydown', (e) => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    GM.A.ensure(); GM.A.resume();
    if (keys[e.code]) return;      // ignore autorepeat
    keys[e.code] = true;

    const c = e.code;

    // global keys
    if (c === 'KeyM') { GM.A.toggleMute(); return; }
    if (c === 'KeyP' && GM.state === 'play') { GM.paused = !GM.paused; GM.A.SND.ui(); return; }
    if (c === 'KeyG') { GM.debugAI = !GM.debugAI; return; }
    if (c === 'Minus' || c === 'Equal') {
      if (c === 'Minus') GM.speed = Math.max(0.25, +(GM.speed / 2).toFixed(2));
      else GM.speed = Math.min(4, +(GM.speed * 2).toFixed(2));
      GM.A.SND.ui();
      return;
    }

    if (GM.state === 'title') {
      if (c === 'Digit1') startGame(GM.MODES[0]);
      else if (c === 'Digit2') startGame(GM.MODES[1]);
      else if (c === 'Digit3') startGame(GM.MODES[2]);
      return;
    }

    if (GM.state === 'victory') {
      if (c === 'KeyR') startGame(GM.world.mode);
      else if (c === 'Escape') { GM.state = 'title'; }
      return;
    }

    // play state
    if (GM.state === 'play') {
      if (c === 'KeyQ') possessNext();
      else if (c === 'KeyE') releaseShip();
      else if (c === 'Tab') cycleTarget();
      else if (c === 'Escape') { GM.state = 'title'; GM.world = null; GM.humanShip = null; GM.humanTarget = null; }
    }
  });

  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // ---------- possession ----------
  function possessNext() {
    const alive = GM.world.ships.filter((s) => !s.dead);
    if (!alive.length) return;
    let idx = GM.humanShip ? alive.indexOf(GM.humanShip) : -1;
    idx = (idx + 1) % alive.length;      // cycle through ships
    const s = alive[idx];
    // if cycling lands on current ship and there are others, skip forward once
    if (s === GM.humanShip && alive.length > 1) {
      idx = (idx + 1) % alive.length;
    }
    const target = alive[idx];
    if (GM.humanShip && GM.humanShip !== target) releaseShip(false);
    GM.humanShip = target;
    target.human = true;
    target.ctrl = { thrust: 0, turn: 0, fire: false, special: false, brake: false };  // kill stale AI controls
    target.aiBrain = target.aiBrain || GM.AI.mkBrain();
    GM.A.SND.possess();
    GM.FX.float(target.x, target.y - 18, 'HELM: ' + target.name, '#fff');
    autoAcquireTarget();
  }

  function releaseShip(playSound = true) {
    if (!GM.humanShip) return;
    const s = GM.humanShip;
    s.human = false;
    s.humanInput = null;
    s.ctrl = { thrust: 0, turn: 0, fire: false, special: false, brake: false };
    GM.humanShip = null;
    GM.humanTarget = null;
    if (playSound) GM.A.SND.ui();
  }

  // ---------- tab targeting ----------
  function hostiles() {
    const me = GM.humanShip;
    if (!me) return [];
    return GM.world.ships.filter((s) => !s.dead && s.team !== me.team);
  }

  function autoAcquireTarget() {
    const foes = hostiles();
    if (!foes.length) { GM.humanTarget = null; return; }
    // nearest hostile, or keep current lock if still alive
    if (GM.humanTarget && !GM.humanTarget.dead && foes.includes(GM.humanTarget)) return;
    let best = foes[0], bd = Infinity;
    for (const f of foes) {
      const w = U.wrapDelta(GM.humanShip.x, GM.humanShip.y, f.x, f.y);
      const d = U.len(w.x, w.y);
      if (d < bd) { bd = d; best = f; }
    }
    GM.humanTarget = best;
    GM.A.SND.ui();
  }

  function cycleTarget() {
    const foes = hostiles();
    if (!foes.length) { GM.humanTarget = null; return; }
    let idx = foes.indexOf(GM.humanTarget);
    idx = (idx + 1) % foes.length;
    GM.humanTarget = foes[idx];
    GM.A.SND.ui();
    GM.FX.float(GM.humanTarget.x, GM.humanTarget.y - 18, 'TGT: ' + GM.humanTarget.name, GM.TEAMS[GM.humanTarget.team].P);
  }

  // ---------- game flow ----------
  function startGame(mode) {
    GM.world = new GM.World(mode, {});
    GM.state = 'play';
    GM.paused = false;
    GM.humanShip = null;
    GM.humanTarget = null;
    GM.FX.init();
    GM.R.init();
    GM.A.SND.ui();
  }

  // ---------- human input mapping ----------
  function humanInput() {
    if (!GM.humanShip) return null;
    return {
      thrust: keys['KeyW'] ? 1 : 0,
      turn: (keys['KeyA'] ? -1 : 0) + (keys['KeyD'] ? 1 : 0),
      fire: !!keys['Space'],
      special: !!keys['ShiftLeft'] || !!keys['ShiftRight'],
      brake: !!keys['KeyS'],
    };
  }

  // ---------- camera ----------
  function updateCamera(dt) {
    const me = GM.humanShip && !GM.humanShip.dead ? GM.humanShip : null;
    let fx, fy;
    if (me) {
      fx = me.x + me.vx * 0.35;      // lead the ship slightly with its velocity
      fy = me.y + me.vy * 0.35;
    } else if (GM.world) {
      // auto-director: follow the geometric center of living ships
      let sx = 0, sy = 0, n = 0;
      for (const s of GM.world.ships) {
        if (s.dead) continue;
        sx += s.x; sy += s.y; n++;
      }
      if (n) {
        // wrap-aware mean
        let cx = 0, cy = 0;
        const ref = GM.world.ships.find((s) => !s.dead);
        for (const s of GM.world.ships) {
          if (s.dead) continue;
          const w = U.wrapDelta(ref.x, ref.y, s.x, s.y);
          cx += w.x; cy += w.y;
        }
        fx = U.wrapX(ref.x + cx / n);
        fy = U.wrapY(ref.y + cy / n);
      } else {
        fx = GM.CAM.x; fy = GM.CAM.y;
      }
    } else {
      fx = GM.CAM.x; fy = GM.CAM.y;
    }
    GM.CAM.focus = { x: fx, y: fy };
    // smooth chase
    const w = U.wrapDelta(GM.CAM.x, GM.CAM.y, fx, fy);
    const k = 1 - Math.pow(0.001, dt);        // ~fast catch-up
    GM.CAM.x = U.wrapX(GM.CAM.x + w.x * k);
    GM.CAM.y = U.wrapY(GM.CAM.y + w.y * k);
  }

  // ---------- loop ----------
  let last = performance.now();
  let acc = 0;
  const STEP = GM.PHYS.dt;

  function frame(now) {
    requestAnimationFrame(frame);
    let real = Math.min(0.1, (now - last) / 1000);
    last = now;

    const simming = (GM.state === 'play' && !GM.paused) || GM.state === 'victory';
    if (simming) {
      GM.humanShip && (GM.humanShip.humanInput = humanInput());
      acc += real * GM.speed;
      let steps = 0;
      let winnerJustSet = false;
      while (acc >= STEP && steps < 8) {
        GM.world.step(STEP);
        // death mid-step: release helm (world keeps its target refs)
        if (GM.humanShip && GM.humanShip.dead) { releaseShip(false); }
        if (GM.world.winner !== null && GM.state === 'play') {
          GM.state = 'victory';
          GM.A.SND.victory();
          winnerJustSet = true;
          break;
        }
        acc -= STEP;
        steps++;
      }
      if (steps >= 8) acc = 0;
      updateCamera(real * GM.speed);
    }

    draw(now / 1000);
  }

  function draw(t) {
    GM.clockT = t;
    // screenshake (never in victory)
    const sh = GM.state === 'victory' ? 0 : GM.FX.shake;
    g.save();
    if (sh > 0.1) g.translate(U.rand(-sh, sh) | 0, U.rand(-sh, sh) | 0);

    g.fillStyle = '#04060c';
    g.fillRect(-20, -20, GM.VW + 40, GM.VH + 40);

    if (GM.world && (GM.state === 'play' || GM.state === 'victory')) {
      GM.R.drawWorld(g, GM.world, t);
      GM.R.drawHUD(g, GM.world);
      if (GM.state === 'play') {
        if (GM.paused) GM.R.pausedOverlay(g);
      } else {
        GM.R.victory(g, GM.world);
      }
    } else {
      // title background: idle demo world (silent, recreated when it ends)
      if (!GM.demoWorld || GM.demoWorld.winner !== null) {
        GM.demoWorld = new GM.World(GM.MODES[1], { demo: true });
        GM.FX.init();
        GM.R.init();
      }
      GM.SILENT = true;
      GM.demoWorld.step(1 / 60);
      GM.SILENT = false;
      // auto-director camera follows the demo action
      const savedHuman = GM.humanShip;
      GM.humanShip = null;
      updateCamera(1 / 60);
      GM.humanShip = savedHuman;
      GM.R.drawWorld(g, GM.demoWorld, t);
      GM.R.title(g, t);
    }
    g.restore();
  }

  // boot
  GM.FX.init();
  GM.R.init();
  requestAnimationFrame(frame);
})(window.GM);