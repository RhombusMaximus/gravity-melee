// gravity-melee :: main loop, input, game states
(function (GM) {
  const { U } = GM;

  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  GM.paused = false;
  GM.speed = 1;
  GM.debugAI = false;
  GM.humanShip = null;
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
      else if (c === 'Tab') releaseShip();
      else if (c === 'Escape') { GM.state = 'title'; GM.world = null; GM.humanShip = null; }
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
  }

  function releaseShip(playSound = true) {
    if (!GM.humanShip) return;
    const s = GM.humanShip;
    s.human = false;
    s.humanInput = null;
    s.ctrl = { thrust: 0, turn: 0, fire: false, special: false, brake: false };
    GM.humanShip = null;
    if (playSound) GM.A.SND.ui();
  }

  // ---------- game flow ----------
  function startGame(mode) {
    GM.world = new GM.World(mode, {});
    GM.state = 'play';
    GM.paused = false;
    GM.humanShip = null;
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

  // ---------- loop ----------
  let last = performance.now();
  let acc = 0;
  const STEP = GM.PHYS.dt;

  function frame(now) {
    requestAnimationFrame(frame);
    let real = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (GM.state === 'play' && !GM.paused) {
      GM.humanShip && (GM.humanShip.humanInput = humanInput());
      acc += real * GM.speed;
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        GM.world.step(STEP);
        // death mid-step: release helm
        if (GM.humanShip && GM.humanShip.dead) GM.humanShip = null;
        if (GM.world.winner !== null) { GM.state = 'victory'; GM.A.SND.victory(); break; }
        acc -= STEP;
        steps++;
      }
      if (steps >= 8) acc = 0;       // dropped frames; don't accumulate debt
    }

    draw(now / 1000);
  }

  function draw(t) {
    GM.clockT = t;
    // screenshake
    const sh = GM.FX.shake;
    g.save();
    if (sh > 0.1) g.translate(U.rand(-sh, sh) | 0, U.rand(-sh, sh) | 0);

    g.fillStyle = '#04060c';
    g.fillRect(-20, -20, GM.W + 40, GM.H + 40);

    if (GM.world) {
      GM.R.drawWorld(g, GM.world, t);
      if (GM.state === 'play') {
        GM.R.drawHUD(g, GM.world);
        if (GM.paused) GM.R.pausedOverlay(g);
      } else if (GM.state === 'victory') {
        GM.R.drawHUD(g, GM.world);
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