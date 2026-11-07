// gravity-melee :: the planetary lander — SC2's surface minigame, mechanics
// ported from the UQM source (src/uqm/planets/lander.c, lifeform.h,
// plandata.h, scan.c): 16 facings + thrust-only movement over a scrolling
// topo map, mineral deposits by category, bio lifeforms with the original
// behavior/danger/speed tables (stunned by the lander's gun, collected as
// bio data), earthquake/lava/lightning hazards driven by the planet's
// tectonics/weather/temperature ratings, a 12-crew damage model and a
// 50-unit cargo hold. Vanilla canvas, two layers, no build step.
(function (GM) {
  const { U } = GM;
  const L = {};
  GM.LANDER = L;

  // ---- constants extracted from the UQM source ----
  const CREW_MAX = 12;          // lander crew: 6 cols x 2 rows of dots
  const HOLD_MAX = 50;          // MAX_SCROUNGED: mineral units AND bio units
  const TURN_WAIT = 2 / 35;     // SHUTTLE_TURN_WAIT (frames @35fps)
  const FIRE_WAIT = 15 / 35;    // SHUTTLE_FIRE_WAIT
  const SPEED = 170;            // WORLD_TO_VELOCITY(2*8)/10 @35fps, x3 scale
  const BOLT_SPEED = 620;
  // crew-hit chance per contact tick, DANGER_HARMLESS..DANGER_MONSTROUS
  const DANGER_P = [0, 6 / 128, 13 / 128, 26 / 128];
  // hazard spawn chance per tick (of 256) by rating 0..7 — lander.c
  const TECT_CH = [0, 0, 3, 6, 12, 24, 48, 96];
  const WX_CH = [0, 0, 3, 6, 9, 18, 36, 72];
  const FIRE_CH = [0, 0, 3, 6, 12, 36, 72, 144];
  // creature speeds (px/s, x3 scale of the WORLD_TO_VELOCITY table)
  const SPD = [0, 52, 105, 189];
  // mineral categories, RU worth (globdata.c ElementWorth) + blip colors
  const CATS = ['COMMON', 'CORROSIVE', 'BASE METAL', 'NOBLE',
    'RARE EARTH', 'PRECIOUS', 'RADIOACTIVE', 'EXOTIC'];
  const WORTH = [1, 2, 3, 4, 5, 6, 8, 25];
  const CATCOL = ['#7cff5e', '#ff5648', '#5ea8ff', '#ffd85e',
    '#ff9a3d', '#f4f8ff', '#b4ff3d', '#ff4dd2'];
  // quality -> units per deposit (MAX_ELEMENT_UNITS 15)
  const QUALITY_UNITS = [[3, 6], [8, 11], [13, 15]];

  // surface map: wraps horizontally, lander clamped vertically (original
  // MAP 292x75 @MAG 4; ours is x3 that in surface px)
  const MAP_W = 7008, MAP_H = 900;
  const SC = 12;                // sprite scale (original surface MAG is 4)
  const PICK_R = 84;            // lander pickup / contact radius
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  // ---- the 11 lifeform sets, stats verbatim from lander.c CreatureData ----
  // val = bio units when canned (HIBYTE), hp = stun bolts to can (LONIBBLE)
  const FAUNA = [
    { set: 'lifea', name: 'Roto-Dendron',    beh: 'sit',  danger: 0, spd: 0, aware: 0, val: 1,  hp: 1 },
    { set: 'lifeb', name: 'Macrocillia',     beh: 'sit',  danger: 0, spd: 0, aware: 0, val: 6,  hp: 1 },
    { set: 'lifec', name: 'Splort Wort',     beh: 'sit',  danger: 1, spd: 0, aware: 0, val: 3,  hp: 1 },
    { set: 'lifed', name: "Whackin' Bush",   beh: 'sit',  danger: 2, spd: 0, aware: 0, val: 5,  hp: 3 },
    { set: 'lifee', name: 'Neon Worm',       beh: 'rnd',  danger: 0, spd: 1, aware: 0, val: 1,  hp: 2 },
    { set: 'lifef', name: 'Stiletto Urchin', beh: 'flee', danger: 0, spd: 1, aware: 1, val: 8,  hp: 5 },
    { set: 'lifeg', name: 'Deluxe Blob',     beh: 'hunt', danger: 1, spd: 1, aware: 0, val: 2,  hp: 2 },
    { set: 'lifeh', name: 'Glowing Medusa',  beh: 'rnd',  danger: 2, spd: 1, aware: 0, val: 3,  hp: 8 },
    { set: 'lifei', name: 'Carousel Beast',  beh: 'hunt', danger: 3, spd: 1, aware: 1, val: 10, hp: 15 },
    { set: 'lifej', name: 'Mysterious Bees', beh: 'hunt', danger: 1, spd: 2, aware: 1, val: 3,  hp: 3 },
    { set: 'lifek', name: 'Hopping Blobby', beh: 'flee', danger: 0, spd: 2, aware: 1, val: 2,  hp: 1 },
  ];

  // ---- world profiles per our planet art kinds (UQM PlanetFrame data,
  // tuned): [rating ranges] tect/wx by seed, temperature, mineral mix as
  // [category, quantity FEW1|MODERATE4|NUMEROUS8, quality LIGHT0|MED1|HEAVY2]
  const KINDS = {
    bluegas:   { label: 'Gas Giant', gas: true },
    purplegas: { label: 'Gas Giant', gas: true },
    dust: {
      label: 'Dust World', gas: false, tect: [0, 1], wx: [0, 1], temp: [-120, 10],
      life: [0, 1], pal: ['#6b5f52', '#8a7a66', '#a99880', '#4a423a'],
      minerals: [[0, 4, 1], [2, 1, 0], [4, 1, 0]],
    },
    magma: {
      label: 'Magma World', gas: false, tect: [4, 7], wx: [0, 1], temp: [220, 700],
      life: [0, 2], pal: ['#3a0e08', '#7a2410', '#c9501a', '#ffb03d'],
      minerals: [[2, 4, 2], [6, 4, 1], [7, 1, 1]],
    },
    organic: {
      label: 'Organic World', gas: false, tect: [1, 3], wx: [1, 3], temp: [-20, 60],
      life: [3, 6], pal: ['#20301a', '#3c5526', '#74883a', '#b8a04e'],
      minerals: [[0, 4, 1], [5, 4, 1], [7, 1, 0]],
    },
    emerald: {
      label: 'Emerald World', gas: false, tect: [2, 4], wx: [2, 4], temp: [-40, 40],
      life: [1, 3], pal: ['#0c3b2e', '#14664c', '#2a9668', '#7fe0a8'],
      minerals: [[4, 4, 2], [5, 4, 1], [3, 1, 1]],
    },
    radioactive: {
      label: 'Radioactive World', gas: false, tect: [3, 6], wx: [1, 3], temp: [40, 300],
      life: [0, 2], pal: ['#1d2a0a', '#3c4d12', '#7a9c1e', '#d4f24e'],
      minerals: [[6, 8, 2], [2, 4, 1], [5, 1, 1]],
    },
    water: {
      label: 'Water World', gas: false, tect: [0, 2], wx: [4, 7], temp: [-10, 45],
      life: [2, 5], pal: ['#0a2038', '#12456b', '#2a7aa0', '#8fd6f0'],
      minerals: [[3, 4, 1], [1, 4, 1], [5, 1, 0]],
    },
  };

  // seeded PRNG (same family as hyper.js)
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

  // ---- the planet profile: deterministic from (star name, planet index) ----
  L.profile = (starName, pi) => {
    const keys = GM.CONTENT && GM.CONTENT.planets ? Object.keys(GM.CONTENT.planets) : [];
    if (!keys.length) return null;
    const kindKey = keys[(stable(starName + pi) + pi) % keys.length];
    const K = KINDS[kindKey];
    if (!K) return null;
    const rnd = prng(stable(starName + ':' + pi));
    const pick = (r) => r[0] + Math.floor(rnd() * (r[1] - r[0] + 1));
    return {
      kindKey, gas: !!K.gas, label: K.label, pal: K.pal || null,
      name: starName + ' ' + (ROMAN[pi] || String(pi + 1)),
      tect: K.gas ? 0 : pick(K.tect), wx: K.gas ? 0 : pick(K.wx),
      temp: K.gas ? 0 : pick(K.temp), life: K.gas ? 0 : pick(K.life),
      minerals: K.gas ? [] : K.minerals,
    };
  };

  // ---- content caches (module scope; preload once) ----
  const IMG = { f: {}, bio: {} };
  let preloaded = false;
  function preload() {
    if (preloaded || !GM.CONTENT || !GM.CONTENT.lander) return;
    preloaded = true;
    const mk = (uri) => { const im = new Image(); im.src = uri; return im; };
    for (const [k, set] of Object.entries(GM.CONTENT.lander.f)) {
      IMG.f[k] = set.f.map(mk);
    }
    for (const [k, set] of Object.entries(GM.CONTENT.lander.bio)) {
      IMG.bio[k] = set.f.map(mk);
    }
  }

  // ---- runtime state ----
  L.active = null;          // the current landing { prof, phase, ... }
  const cache = {};         // 'sys:pi' -> { taken: Set of deposit ids }

  // ---- begin a landing ----
  L.begin = (sys, pi, starName) => {
    preload();
    const prof = L.profile(starName, pi);
    if (!prof || prof.gas) return false;
    const H = GM.HYPER;
    const ck = sys + ':' + pi;
    if (!cache[ck]) cache[ck] = { taken: new Set() };
    const rnd = prng(stable(starName + ':surface:' + pi));

    // scatter mineral deposits: per world entry, `qty` nodes of `quality`
    const deposits = [];
    let id = 0;
    for (const [cat, qty, quality] of prof.minerals) {
      for (let q = 0; q < qty; q++) {
        const n = 1 + (quality === 0 ? 2 : quality === 1 ? 4 : 8); // FEW/MODERATE/NUMEROUS
        for (let j = 0; j < n; j++) {
          const [lo, hi] = QUALITY_UNITS[quality];
          deposits.push({
            id: id++, x: rnd() * MAP_W, y: 40 + rnd() * (MAP_H - 80),
            cat, units: lo + Math.floor(rnd() * (hi - lo + 1)), taken: false,
          });
        }
      }
    }

    // creatures: `life` + 2 distinct species from the roster
    const creatures = [];
    const pool = FAUNA.slice();
    for (let i = 0; i < prof.life + 2; i++) {
      const spec = pool.splice(Math.floor(rnd() * pool.length), 1)[0] || FAUNA[0];
      creatures.push({
        spec, x: rnd() * MAP_W, y: 60 + rnd() * (MAP_H - 120),
        vx: 0, vy: 0, hp: spec.hp, canned: false, aware: false,
        think: 0, anim: rnd() * 4, flash: 0,
      });
    }

    L.active = {
      sys, pi, prof, deposits, creatures,
      taken: cache[ck].taken,
      x: rnd() * MAP_W, y: MAP_H / 2, facing: Math.floor(rnd() * 16),
      crew: CREW_MAX, hold: 0, bio: 0, cats: [0, 0, 0, 0, 0, 0, 0, 0],
      turnT: 0, fireT: 0, bolts: [], hazards: [], parts: [], floats: [],
      dmgT: 0, phase: 'launch', phaseT: 0, bg: null, lost: false,
      pickups: 0,
    };
    buildBackdrop(L.active);
    GM.A.playBuf('land_lau', 0.9);
    return true;
  };

  // one-time procedural topo texture for the surface (the original zooms a
  // per-planet topo map; we paint seeded palette blobs + noise + craters)
  function buildBackdrop(A) {
    const cv = document.createElement('canvas');
    cv.width = MAP_W; cv.height = MAP_H;
    const bg = cv.getContext('2d');
    const pal = A.prof.pal || ['#333', '#555', '#777', '#999'];
    bg.fillStyle = pal[0];
    bg.fillRect(0, 0, MAP_W, MAP_H);
    const rnd = prng(stable(A.prof.name + ':bg'));
    for (let i = 0; i < 420; i++) {
      bg.fillStyle = pal[1 + Math.floor(rnd() * 3)];
      bg.beginPath();
      const rx = rnd() * MAP_W, ry = rnd() * MAP_H;
      bg.ellipse(rx, ry, 30 + rnd() * 160, 20 + rnd() * 90, rnd() * U.TAU, 0, U.TAU);
      bg.fill();
    }
    // fault lines for tectonic worlds
    if (A.prof.tect >= 3) {
      bg.strokeStyle = pal[3];
      bg.globalAlpha = 0.35;
      bg.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        bg.beginPath();
        let fx = rnd() * MAP_W, fy = rnd() * MAP_H;
        bg.moveTo(fx, fy);
        for (let s = 0; s < 9; s++) { fx += rnd() * 300 - 150; fy += rnd() * 200 - 100; bg.lineTo(fx, fy); }
        bg.stroke();
      }
      bg.globalAlpha = 1;
    }
    // fine dithered noise (tileable: dots also drawn wrapped)
    for (let i = 0; i < 9000; i++) {
      bg.fillStyle = rnd() < 0.5 ? pal[2] : pal[0];
      const nx = rnd() * MAP_W, ny = rnd() * MAP_H, s = rnd() < 0.8 ? 2 : 4;
      bg.globalAlpha = 0.25 + rnd() * 0.4;
      bg.fillRect(nx, ny, s, s);
      if (nx < 8) bg.fillRect(nx + MAP_W, ny, s, s);   // wrap seam
    }
    bg.globalAlpha = 1;
    A.bg = cv;
  }

  // ---- input: lander.js owns its keys while a landing is active ----
  const k = {};
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    k[e.code] = true;
    if (!L.active) return;
    if (e.code === 'Escape') liftOff();
  });
  window.addEventListener('keyup', (e) => { k[e.code] = false; });

  function liftOff() {
    const A = L.active;
    if (!A || A.phase !== 'play') return;
    A.phase = 'lift';
    A.phaseT = 0;
    GM.A.playBuf('land_lau', 0.9);
  }

  // ---- per-frame update ----
  L.update = (dt) => {
    const A = L.active;
    if (!A) return;
    A.phaseT += dt;

    if (A.phase === 'launch') {
      if (A.phaseT >= 1.4) { A.phase = 'play'; A.phaseT = 0; }
      return;
    }
    if (A.phase === 'lift') {
      if (A.phaseT >= 1.1) finish(false);
      return;
    }
    if (A.phase === 'dead') {
      if (A.phaseT >= 2.2) finish(true);
      return;
    }

    // ---- play: steering (16 facings, thrust-only, no drift) ----
    if (A.turnT > 0) A.turnT -= dt;
    const rot = (k['KeyA'] || k['ArrowLeft'] ? -1 : 0) + (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
    if (rot && A.turnT <= 0) { A.facing = (A.facing + rot + 16) % 16; A.turnT = TURN_WAIT; }
    if (k['KeyW'] || k['ArrowUp']) {
      const ang = A.facing * U.TAU / 16;
      A.x += Math.cos(ang) * SPEED * dt;
      A.y += Math.sin(ang) * SPEED * dt;
    }
    // horizontal wrap, vertical clamp (ScrollPlanetSide)
    A.x = ((A.x % MAP_W) + MAP_W) % MAP_W;
    A.y = U.clamp(A.y, 30, MAP_H - 30);

    // stun bolts
    if (A.fireT > 0) A.fireT -= dt;
    if (k['Space'] && A.fireT <= 0) {
      const ang = A.facing * U.TAU / 16;
      A.bolts.push({ x: A.x, y: A.y, vx: Math.cos(ang) * BOLT_SPEED, vy: Math.sin(ang) * BOLT_SPEED, t: 0, life: 0.55 });
      A.fireT = FIRE_WAIT;
      GM.A.playBuf('land_sht', 0.5);
    }

    const tick = dt * 35;   // per-second rates are quoted at the original 35fps

    // ---- hazards spawn (BuildObjectList) ----
    const spawnNear = () => {
      const dx = (Math.random() - 0.5) * GM.WV * 1.5;
      return { x: ((A.x + dx) % MAP_W + MAP_W) % MAP_W, y: 30 + Math.random() * (MAP_H - 60) };
    };
    if (Math.random() * 256 < TECT_CH[A.prof.tect] * tick) {
      A.hazards.push({ type: 'quake', x: spawnNear().x, t: 0, life: 1.6 });
      GM.FX.addShake(2.5);
      GM.A.playBuf('land_qua', 0.8);
    }
    if (Math.random() * 256 < FIRE_CH[thermalRating(A.prof.temp)] * tick) {
      const p = spawnNear();
      A.hazards.push({ type: 'lava', x: p.x, y: p.y, dir: Math.random() < 0.5 ? -1 : 1, t: 0, life: 2.6 });
      GM.A.playBuf('land_hot', 0.8);
    }
    if (Math.random() * 256 < WX_CH[A.prof.wx] * tick) {
      const p = spawnNear();
      A.hazards.push({ type: 'bolt', x: p.x, y: p.y, hunt: Math.random() < 0.25, t: 0, life: 0.5 + Math.random() * 0.4 });
      GM.A.playBuf('land_lig', 0.7);
    }

    // ---- hazards step ----
    for (let i = A.hazards.length - 1; i >= 0; i--) {
      const h = A.hazards[i];
      h.t += dt;
      if (h.type === 'lava') {
        if (Math.random() < 0.5 * tick) h.x = ((h.x + h.dir * 26 * dt) % MAP_W + MAP_W) % MAP_W;
        if (Math.random() < 0.04 * tick) h.dir = -h.dir;
        if (near(A, h.x, h.y, 70) && Math.random() < 0.25 * tick) hurt(A, 'quake');
      } else if (h.type === 'quake') {
        if (near(A, h.x, A.y, 190) && Math.random() < 0.25 * tick) hurt(A, 'quake');
        if (Math.random() < 9 * tick) {
          A.parts.push({ x: h.x + (Math.random() - 0.5) * 380, y: A.y + (Math.random() - 0.5) * 220,
            vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 60, t: 0, life: 0.7,
            size: 2 + Math.random() * 3, col: A.prof.pal ? A.prof.pal[3] : '#999' });
        }
      } else if (h.type === 'bolt') {
        if (h.hunt) { h.x = A.x; h.y = A.y; if (Math.random() < 0.10 * tick) hurt(A, 'bolt'); }
        if (h.t >= h.life) A.hazards.splice(i, 1);
        continue;
      }
      if (h.t >= h.life) A.hazards.splice(i, 1);
    }

    // ---- creatures step (object_animation behavior model) ----
    for (const c of A.creatures) {
      c.anim += dt * 8;
      if (c.flash > 0) c.flash -= dt;
      if (c.canned) continue;
      const sp = c.spec.spd;
      if (!sp) continue;
      c.think -= dt;
      // awareness roll within view range (DetectPercent = (aware+1)*5 %)
      if (!c.aware && Math.abs(wrapD(c.x - A.x)) < GM.WV && Math.random() < (c.spec.aware + 1) * 0.05 * tick) {
        c.aware = true; c.think = 0;
      }
      if (c.aware && Math.abs(wrapD(c.x - A.x)) > GM.WV * 1.2) c.aware = false;
      if (c.think <= 0) {
        c.think = 0.25 + Math.random() * 0.5;
        let ang;
        if (!c.aware || c.spec.beh === 'rnd') ang = Math.random() * U.TAU;
        else {
          const toL = Math.atan2(A.y - c.y, wrapD(A.x - c.x));
          ang = c.spec.beh === 'flee' ? toL + Math.PI : toL;
        }
        c.vx = Math.cos(ang) * SPD[sp];
        c.vy = Math.sin(ang) * SPD[sp];
        if (c.y <= 40 || c.y >= MAP_H - 40) c.vy = -c.vy;
      }
      c.x = ((c.x + c.vx * dt) % MAP_W + MAP_W) % MAP_W;
      c.y = U.clamp(c.y + c.vy * dt, 40, MAP_H - 40);
      // contact: the lander gets bitten (danger_vals/128 per tick)
      if (near(A, c.x, c.y, 66) && Math.random() < DANGER_P[c.spec.danger] * tick) {
        GM.A.playBuf('land_bit', 0.8);
        hurt(A, 'bio');
      }
    }

    // ---- stun bolts ----
    for (let i = A.bolts.length - 1; i >= 0; i--) {
      const b = A.bolts[i];
      b.t += dt;
      b.x = ((b.x + b.vx * dt) % MAP_W + MAP_W) % MAP_W;
      b.y += b.vy * dt;
      if (b.t >= b.life) { A.bolts.splice(i, 1); continue; }
      for (const c of A.creatures) {
        if (c.canned) continue;
        if (Math.abs(wrapD(b.x - c.x)) < 40 && Math.abs(b.y - c.y) < 40) {
          c.hp--;
          c.flash = 0.12;
          c.aware = true;
          GM.A.playBuf('land_hit', 0.5);
          A.bolts.splice(i, 1);
          if (c.hp <= 0) {
            c.canned = true;   // "canned" — collect it for bio data
            GM.A.playBuf('land_can', 0.9);
          }
          break;
        }
      }
    }

    // ---- pickups: deposits + canned creatures ----
    for (const d of A.deposits) {
      if (d.taken || A.taken.has(d.id)) { d.taken = true; continue; }
      if (near(A, d.x, d.y, PICK_R)) {
        const take = Math.min(d.units, HOLD_MAX - A.hold);
        if (take <= 0) { GM.A.playBuf('land_ful', 0.8); break; }
        d.units -= take;
        A.hold += take;
        A.cats[d.cat] += take;
        if (d.units <= 0) { d.taken = true; A.taken.add(d.id); }
        GM.A.playBuf('land_get', 0.9);
        addFloat(A, '+' + take + ' ' + CATS[d.cat], CATCOL[d.cat]);
      }
    }
    for (const c of A.creatures) {
      if (!c.canned || c.collected) continue;
      if (near(A, c.x, c.y, PICK_R)) {
        const take = Math.min(c.spec.val, HOLD_MAX - A.bio);
        if (take <= 0) { GM.A.playBuf('land_ful', 0.8); break; }
        c.collected = true;
        A.bio += take;
        GM.A.playBuf('land_get', 0.9);
        addFloat(A, '+' + take + ' BIO DATA', '#7cff5e');
      }
    }

    // ---- particles / floats / damage flash ----
    for (let i = A.parts.length - 1; i >= 0; i--) {
      const p = A.parts[i];
      p.t += dt;
      if (p.t >= p.life) { A.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
    }
    for (let i = A.floats.length - 1; i >= 0; i--) {
      A.floats[i].t += dt;
      if (A.floats[i].t >= A.floats[i].life) A.floats.splice(i, 1);
    }
    if (A.dmgT > 0) A.dmgT -= dt;
  };

  // GetThermalHazardRating: temperature breakpoints -> rating 0..7
  function thermalRating(temp) {
    const bp = [50, 100, 150, 250, 350, 550, 800];
    for (let i = 0; i < bp.length; i++) if (temp < bp[i]) return i;
    return 7;
  }
  function wrapD(dx) { return ((dx % MAP_W) + MAP_W * 1.5) % MAP_W - MAP_W / 2; }
  function near(A, x, y, r) {
    const dx = Math.abs(wrapD(x - A.x));
    return dx * dx + (y - A.y) * (y - A.y) < r * r;
  }

  function hurt(A, kind) {
    if (A.crew <= 0) return;
    A.crew--;
    A.dmgT = 0.35;
    GM.A.playBuf('land_hit', 0.9);
    GM.FX.addShake(2);
    if (A.crew <= 0) {
      A.phase = 'dead';
      A.phaseT = 0;
      A.lost = true;
      GM.A.playBuf('land_die', 1);
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * U.TAU, v = 60 + Math.random() * 260;
        A.parts.push({ x: A.x, y: A.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          t: 0, life: 0.6 + Math.random() * 0.8, size: 2 + Math.random() * 4,
          col: ['#ffd28a', '#ff8a3d', '#ff5648'][i % 3] });
      }
    }
  }

  function addFloat(A, text, col) {
    A.floats.push({ x: A.x, y: A.y - 60, text, col: col || '#fff', t: 0, life: 1.3 });
  }

  function finish(lost) {
    const A = L.active;
    if (!A) return;
    const H = GM.HYPER;
    if (lost) {
      H.landers = Math.max(0, H.landers - 1);
      H.summary = { t: 0, lines: ['LANDER LOST', 'ALL HANDS LOST'] };
    } else {
      for (let i = 0; i < 8; i++) H.cargo.cats[i] += A.cats[i];
      H.cargo.bio += A.bio;
      let ru = 0;
      for (let i = 0; i < 8; i++) ru += A.cats[i] * WORTH[i];
      H.summary = { t: 0, lines: [
        'SURVEY COMPLETE — ' + A.prof.name.toUpperCase(),
        'MINERALS ' + A.hold + ' UNITS (' + ru + ' RU) · BIO ' + A.bio,
      ] };
    }
    L.active = null;
    H.land = null;
  }

  // ---------- rendering ----------
  const OY = () => (GM.WH - MAP_H) / 2;

  L.drawWorld = (g, t) => {
    const A = L.active;
    if (!A) return;
    const oy = OY();
    g.fillStyle = '#04060c';
    g.fillRect(0, 0, GM.WV, GM.WH);

    // the scrolling topo map (drawn wrapped around the lander's x)
    if (A.bg) {
      let sx = -(((A.x - GM.WV / 2) % MAP_W) + MAP_W) % MAP_W;
      g.imageSmoothingEnabled = false;
      g.drawImage(A.bg, sx, oy);
      g.drawImage(A.bg, sx + MAP_W, oy);
      if (sx + MAP_W < GM.WV) g.drawImage(A.bg, sx + MAP_W * 2, oy);
    }
    // border bands above/below the map (DrawPlanetSurfaceBorder)
    g.fillStyle = 'rgba(4,6,12,0.92)';
    g.fillRect(0, 0, GM.WV, oy);
    g.fillRect(0, oy + MAP_H, GM.WV, GM.WH - oy - MAP_H);
    g.strokeStyle = '#2a3654';
    g.lineWidth = 2;
    g.strokeRect(-2, oy - 2, GM.WV + 4, MAP_H + 4);

    const camX = A.x;
    const sxOf = (x) => GM.WV / 2 + wrapD(x - camX);
    const syOf = (y) => oy + y;

    // mineral deposits: category-colored diamonds (the scan-dot palette)
    for (const d of A.deposits) {
      if (d.taken) continue;
      const x = sxOf(d.x);
      if (x < -20 || x > GM.WV + 20) continue;
      const y = syOf(d.y);
      const s = 5 + Math.min(9, d.units);
      g.fillStyle = CATCOL[d.cat];
      g.beginPath();
      g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.stroke();
    }

    // hazards
    for (const h of A.hazards) {
      const x = sxOf(h.x);
      if (x < -340 || x > GM.WV + 340) continue;
      if (h.type === 'lava') {
        const fr = IMG.f.lava[Math.floor(h.t * 12) % Math.min(13, IMG.f.lava.length)];
        if (fr && fr.complete && fr.naturalWidth > 0) {
          g.imageSmoothingEnabled = false;
          const w = fr.naturalWidth * SC, hh = fr.naturalHeight * SC;
          g.drawImage(fr, x - w / 2, syOf(h.y) - hh / 2, w, hh);
        }
      } else if (h.type === 'quake') {
        const k = 1 - h.t / h.life;
        g.strokeStyle = 'rgba(255,220,150,' + (0.7 * k) + ')';
        g.lineWidth = 3;
        g.beginPath();
        let qx = x - 190;
        g.moveTo(qx, syOf(A.y));
        for (let s = 0; s < 12; s++) { qx += 32; g.lineTo(qx, syOf(A.y) + (s % 2 ? 14 : -14)); }
        g.stroke();
      } else if (h.type === 'bolt') {
        const fr = IMG.f.lightning[Math.floor(h.t * 30) % Math.min(11, IMG.f.lightning.length)];
        if (fr && fr.complete && fr.naturalWidth > 0) {
          g.imageSmoothingEnabled = false;
          const w = fr.naturalWidth * SC, hh = fr.naturalHeight * SC;
          g.globalAlpha = h.hunt ? 1 : 0.6;
          g.drawImage(fr, x - w / 2, syOf(h.y) - hh / 2, w, hh);
          g.globalAlpha = 1;
        }
      }
    }

    // creatures (4-frame anim; canned ones use the lifecan pickup art)
    for (const c of A.creatures) {
      if (c.collected) continue;
      const x = sxOf(c.x);
      if (x < -90 || x > GM.WV + 90) continue;
      const set = c.canned ? IMG.bio.lifecan : IMG.bio[c.spec.set];
      if (!set) continue;
      const fr = set[Math.floor(c.anim) % set.length];
      if (!fr || !fr.complete || !fr.naturalWidth) continue;   // never fall through
      const w = fr.naturalWidth * SC, hh = fr.naturalHeight * SC;
      g.imageSmoothingEnabled = false;
      if (c.flash > 0) { g.globalAlpha = 0.55; }
      g.drawImage(fr, x - w / 2, syOf(c.y) - hh / 2, w, hh);
      g.globalAlpha = 1;
      if (c.canned) {
        g.strokeStyle = 'rgba(124,255,94,0.5)';
        g.lineWidth = 1;
        g.beginPath(); g.arc(x, syOf(c.y), w * 0.75, 0, U.TAU); g.stroke();
      }
    }

    // stun bolts
    g.fillStyle = '#8fd6f0';
    for (const b of A.bolts) {
      const x = sxOf(b.x);
      if (x < -10 || x > GM.WV + 10) continue;
      g.fillRect(x - 2, syOf(b.y) - 2, 5, 5);
      g.globalAlpha = 0.35;
      g.fillRect(x - b.vx * 0.02 - 2, syOf(b.y) - b.vy * 0.02 - 2, 4, 4);
      g.globalAlpha = 1;
    }

    // the lander: fixed at view center (the map scrolls under it), with the
    // launch descent / lift-off / death phases moving it vertically
    let ly = syOf(A.y);
    if (A.phase === 'launch') {
      const p = Math.min(1, A.phaseT / 1.4);
      ly = oy - 140 + (syOf(A.y) - oy + 140) * (p * p * (3 - 2 * p));
    } else if (A.phase === 'lift') {
      const p = Math.min(1, A.phaseT / 1.1);
      ly = syOf(A.y) - p * p * (GM.WH * 0.9);
    }
    if (A.phase !== 'dead') {
      // the UQM facing sheets are NORTH-clockwise (frame 0 = north; proven
      // by the lander green-window centroid tracing the circle) while our
      // facing 0 = east — so sprite frame = (facing + 4) % 16, positioned
      // by the .ani anchor (anchor maps to the lander's map position)
      const fi = (A.facing + 4) % 16;
      const fr = IMG.f.lander && IMG.f.lander[fi];
      if (fr && fr.complete && fr.naturalWidth > 0) {
        const anchors = (GM.CONTENT.lander.f.lander.a || [])[fi] || [6, 6];
        const w = fr.naturalWidth * SC, hh = fr.naturalHeight * SC;
        g.imageSmoothingEnabled = false;
        if (A.dmgT > 0) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 40); }
        g.drawImage(fr, GM.WV / 2 - anchors[0] * SC, ly - anchors[1] * SC, w, hh);
        g.globalAlpha = 1;
        // engine flare while thrusting
        if ((k['KeyW'] || k['ArrowUp']) && A.phase === 'play') {
          const ang = A.facing * U.TAU / 16;
          const ex = GM.WV / 2 - Math.cos(ang) * SC * 6;
          const ey = ly - Math.sin(ang) * SC * 6;
          g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 30);
          g.fillStyle = '#ffd28a';
          g.beginPath(); g.arc(ex, ey, SC * 1.2 + Math.random() * 4, 0, U.TAU); g.fill();
          g.globalAlpha = 1;
        }
      }
    }

    // particles + pickup floats
    for (const p of A.parts) {
      const x = sxOf(p.x);
      if (x < -10 || x > GM.WV + 10) continue;
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      g.fillStyle = p.col;
      g.fillRect(x, syOf(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;
    g.font = 'bold 22px monospace';
    g.textAlign = 'center';
    for (const f of A.floats) {
      const x = sxOf(f.x);
      g.globalAlpha = Math.max(0, 1 - f.t / f.life);
      g.fillStyle = f.col;
      g.fillText(f.text, x, syOf(f.y) - f.t * 30);
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  };

  L.drawHUD = (g, t) => {
    const A = L.active;
    if (!A) return;
    g.textAlign = 'left';
    g.font = 'bold 8px monospace';
    g.fillStyle = '#cfe0ff';
    g.fillText('SURFACE: ' + A.prof.name.toUpperCase() + ' — ' + A.prof.label.toUpperCase(), 8, 14);
    g.font = '8px monospace';
    g.fillStyle = '#8fa2c0';
    g.fillText('TEMP ' + A.prof.temp + '\u00B0C · TECT ' + A.prof.tect + ' · WX ' + A.prof.wx, 8, 26);

    // crew dots: 6 x 2, green while alive (the original lander crew bar)
    g.fillStyle = '#232c40';
    g.fillRect(8, 34, 76, 4);
    for (let i = 0; i < CREW_MAX; i++) {
      const cx = 12 + (i % 6) * 12, cy = 40 + Math.floor(i / 6) * 8;
      g.fillStyle = i < A.crew ? '#00a500' : '#1a2230';
      g.fillRect(cx, cy, 8, 4);
    }
    g.fillStyle = '#55688a';
    g.fillText('CREW', 8, 66);

    // cargo hold: mineral units (category colors) + bio units, cap 50 each
    const bx = 8, by = 78, bw = 120;
    g.fillStyle = '#232c40';
    g.fillRect(bx, by, bw, 5);
    let fx2 = bx;
    for (let i = 0; i < 8; i++) {
      const w = (A.cats[i] / HOLD_MAX) * bw;
      if (w <= 0) continue;
      g.fillStyle = CATCOL[i];
      g.fillRect(fx2, by, w, 5);
      fx2 += w;
    }
    g.fillStyle = '#55688a';
    g.fillText('MIN ' + A.hold + '/' + HOLD_MAX, bx, by + 14);
    g.fillStyle = '#232c40';
    g.fillRect(bx, by + 18, bw, 5);
    g.fillStyle = '#7cff5e';
    g.fillRect(bx, by + 18, (A.bio / HOLD_MAX) * bw, 5);
    g.fillStyle = '#55688a';
    g.fillText('BIO ' + A.bio + '/' + HOLD_MAX, bx, by + 37);

    // phase prompts
    g.textAlign = 'center';
    g.font = 'bold 11px monospace';
    const blink = Math.sin(t * 4) > -0.4;
    g.fillStyle = '#fff';
    if (A.phase === 'launch') {
      g.fillText('DESCENDING TO SURFACE\u2026', GM.VW / 2, GM.VH - 34);
    } else if (A.phase === 'lift') {
      g.fillText('RETURNING TO ORBIT\u2026', GM.VW / 2, GM.VH - 34);
    } else if (A.phase === 'dead') {
      g.fillStyle = '#ff5648';
      g.fillText('LANDER DESTROYED', GM.VW / 2, GM.VH - 34);
    } else if (blink) {
      g.fillText('[ESC] LIFT OFF', GM.VW / 2, GM.VH - 34);
    }
    g.font = '8px monospace';
    g.fillStyle = '#55688a';
    g.fillText('A/D turn · W thrust · SPACE stun bolt · drive over minerals & canned life', GM.VW / 2, GM.VH - 6);
    g.textAlign = 'left';
  };
})(window.GM);