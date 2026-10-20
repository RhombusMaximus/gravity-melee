// gravity-melee :: arena physics constants, teams, ship roster, modes
(function (GM) {
  GM.VERSION = '0.27.0';

  // The arena is far larger than the 640x360 viewport; the camera follows the
  // player's ship. SCALE multiplies all combat geometry (planet size, ship
  // speeds, weapon ranges) so duels fill the bigger world at the same pacing.
  GM.SCALE = 2.4;

  GM.W = 4000;    // square arena with a circular containment field
  GM.H = 4000;    // (the field starts at ARENA_R from the planet)
  GM.WV = 2304;   // world-view canvas: zoomed out, most of the arena visible
  GM.WH = 1296;
  GM.VW = 640;    // HUD overlay canvas (all HUD code draws in this space)
  GM.VH = 360;

  GM.CAM = { x: GM.W / 2, y: GM.H / 2, focus: null };

  // dynamic zoom: canvas px per world unit. Zooms in as the player closes on
  // their target (SC2-style framing), lerped smoothly by updateCamera.
  GM.zoomCur = 1;
  GM.ZOOM = { min: 1, max: 2.0, close: 300, far: 1200 };

  GM.PHYS = {
    dt: 1 / 60,
    // square arena: the planet sits dead centre, the playable disc has
    // radius GM.W/2; the camera sees a slice of it
    planet: { x: 2000, y: 2000, r: 180, GM: 8985600, rInf: 960, knee: 780, aCap: 2496 },
    arenaR: 1800,          // circular boundary radius from planet center
    arenaSoft: 1600,        // containment field kicks in at this radius
    moon:   { r: 52, GM: 506880, rInf: 400, knee: 300, aCap: 1440, orbitR: 720, omega: 0.17 },
    spawnR: 520,
    surgeAt: 170,
    surgeRate: 0.02,
    surgeMax: 3.0,
  };

  GM.TEAMS = [
    { name: 'AZURE',   P: '#3fc8ff', S: '#155a9e', glow: '#aef0ff' },
    { name: 'CRIMSON', P: '#ff5648', S: '#8e1a33', glow: '#ffc2ae' },
    { name: 'VERDANT', P: '#6fff4e', S: '#1f7a35', glow: '#d2ffbe' },
  ];

  GM.CHARS = {
    W: '#f4f8ff', H: '#a9b3c6', h: '#5f6b83', G: '#8ef2ff',
    E: '#ffab3d', e: '#d0641e',
    K: '#7cff5e',   // Ur-Quan green (Kzer-Za blades/spine)
    P: null, S: null,
  };

  // The full Super Melee roster: all 25 Star Control II ships, real sprites,
  // real stats from the UQM ship sources (crew/battery/cost/weapon numbers),
  // their own captains, panel icons and weapon sounds. The original
  // Azure-squadron custom ships are retired (git history keeps them).
  GM.SHIPS = [
    {
      // SF-6 Scout — the Shofixti kamikaze (shofixti.c: 6 crew, 4 battery,
      // fastest thrust in the roster, and the Glory Device).
      key: 'shofixti', name: 'SF-6 Scout', role: 'scout', cost: 5,
      r: 4.5, mass: 0.4, accel: 210, turn: 4.4, maxSpeed: 150,
      crew: 6, batt: 4, regen: 3.5, orbit: 50,
      sprite: 'SHIP:shofixti', cap: 'shofixti', icon: 'shofixti',
      weapon: { label: 'Rapid Pecker', kind: 'pellet', cd: 0.06, cost: 1, speed: 280, dmg: 1, size: 2, life: 0.5, count: 1, spread: 0.03, tol: 0.22, snd: 'pellet' },
      special: { label: 'Glory Device', type: 'glory', cost: 0, cd: 0.5, dmg: 26, rad: 130 },
    },
    {
      // ZF-10 Stinger — the Zoq-Fot-Pik gunship (zoqfot.c: 10 crew, 10
      // battery, anti-matter sting + the Tongue).
      key: 'zoqfotpik', name: 'ZF-10 Stinger', role: 'skirmisher', cost: 6,
      r: 5, mass: 1.1, accel: 175, turn: 3.9, maxSpeed: 135,
      crew: 10, batt: 10, regen: 6, orbit: 45,
      sprite: 'SHIP:zoqfotpik', cap: 'zoqfotpik', icon: 'zoqfotpik',
      weapon: { label: 'Anti-Matter Sting', kind: 'pellet', cd: 0.07, cost: 1, speed: 300, dmg: 1, size: 2, life: 0.45, count: 1, spread: 0.03, tol: 0.22, snd: 'pellet' },
      special: { label: 'Tongue Lash', type: 'zap', cost: 7.5, cd: 1.2, dmg: 12, range: 46 },
    },
    {
      // UM-10 Drone — the Umgah blob (umgah.c: 10 crew, 30 battery, NO regen,
      // free cone-zap, and the famous retro-propulsion dash).
      key: 'umgah', name: 'UM-10 Drone', role: 'scout', cost: 7,
      r: 6, mass: 0.4, accel: 120, turn: 3.0, maxSpeed: 100,
      crew: 10, batt: 30, regen: 0, orbit: 60,
      sprite: 'SHIP:umgah', cap: 'umgah', icon: 'umgah',
      weapon: { label: 'Cone Zap', kind: 'cone', cd: 0.35, cost: 0, dmg: 2, range: 200, arc: 0.5, tol: 0.3, snd: 'shot' },
      special: { label: 'Retro-Propulsion', type: 'reverse', cost: 1, cd: 0.25, kick: 320 },
    },
    {
      // IL-22 Avenger — the Ilwrath cloaker (ilwrath.c: 22 crew, 16 battery,
      // twin fusion spray + the cloaking field).
      key: 'ilwrath', name: 'IL-22 Avenger', role: 'ambusher', cost: 10,
      r: 6, mass: 1.5, accel: 120, turn: 3.4, maxSpeed: 112,
      crew: 22, batt: 16, regen: 7, orbit: 55,
      sprite: 'SHIP:ilwrath', cap: 'ilwrath', icon: 'ilwrath',
      weapon: { label: 'Twin Fusion', kind: 'fusion', cd: 0.1, cost: 1, speed: 260, dmg: 1, size: 2, life: 0.6, count: 2, spread: 0.09, tol: 0.2, snd: 'laser' },
      special: { label: 'Cloak', type: 'cloak', cost: 3, cd: 2, dur: 6 },
    },
    {
      // TH-8 Torch — the Thraddash firefly (thradd.c: 8 crew, 24 battery,
      // flame gun + afterburner that trails fire).
      key: 'thraddash', name: 'TH-8 Torch', role: 'skirmisher', cost: 10,
      r: 6, mass: 1.5, accel: 130, turn: 3.0, maxSpeed: 115,
      crew: 8, batt: 24, regen: 5, orbit: 70,
      sprite: 'SHIP:thraddash', cap: 'thraddash', icon: 'thraddash',
      weapon: { label: 'Flame Gun', kind: 'shot', cd: 0.2, cost: 2, speed: 170, dmg: 1, size: 2, life: 0.55, count: 1, spread: 0.06, tol: 0.25, snd: 'shot' },
      special: { label: 'Afterburner', type: 'afterburner', cost: 1, cd: 0, drain: 5 },
    },
    {
      // EC-18 Cruiser — the Earthling workhorse (human.c: 18 crew, 18
      // battery, homing MX missiles + the point-defense laser).
      key: 'human', name: 'EC-18 Cruiser', role: 'cruiser', cost: 11,
      r: 6, mass: 1.4, accel: 105, turn: 2.6, maxSpeed: 100,
      crew: 18, batt: 18, regen: 4, orbit: 75,
      sprite: 'SHIP:human', cap: 'human', icon: 'human',
      weapon: { label: 'MX Missiles', kind: 'missile', cd: 0.5, cost: 9, speed: 190, dmg: 4, size: 2, life: 2.6, count: 1, spread: 0, tol: 0.2, turn: 2.0, snd: 'missile' },
      special: { label: 'Point-Defense', type: 'pointdef', cost: 4, cd: 3, dur: 2.4, rad: 100 },
    },
    {
      // VX-20 Intruder — the VUX slug (vux.c: 20 crew, 40 battery, the
      // megawatt lance + limpet torpedoes that glue themselves to hulls).
      key: 'vux', name: 'VX-20 Intruder', role: 'cruiser', cost: 12,
      r: 7, mass: 1.4, accel: 90, turn: 1.4, maxSpeed: 80,
      crew: 20, batt: 40, regen: 4, orbit: 65,
      sprite: 'SHIP:vux', cap: 'vux', icon: 'vux',
      weapon: { label: 'Megawatt Lance', kind: 'fusion', cd: 0.32, cost: 1, speed: 210, dmg: 3, size: 4, life: 0.75, count: 1, spread: 0, tol: 0.1, snd: 'plasma' },
      special: { label: 'Limpet Torpedoes', type: 'limpet', cost: 2, cd: 0.8, dmg: 1, rad: 14, maxMines: 8, slow: true, slowDur: 5, snd: 'mine' },
    },
/* retired for now
    {
      // SY-12 Penetrator — the Syreen call ship (syreen.c: 12 crew, 16
      // battery, particle beam + the Psi-Mind Call that steals enemy crew).
      key: 'syreen', name: 'SY-12 Penetrator', role: 'boarding', cost: 13,
      r: 5.5, mass: 0.5, accel: 150, turn: 3.3, maxSpeed: 122,
      crew: 12, batt: 16, regen: 5, orbit: 70,
      sprite: 'SHIP:syreen', cap: 'syreen', icon: 'syreen',
      weapon: { label: 'Particle Beam', kind: 'bolt', cd: 0.2, cost: 1, speed: 260, dmg: 2, size: 3, life: 0.8, count: 1, spread: 0, tol: 0.16, snd: 'bolt' },
      special: { label: 'Psi-Mind Call', type: 'call', cost: 5, cd: 6, range: 210 },
    },
    */
    {
      // AN-20 Guardian — the Androsynth brawler (androsyn.c: 20 crew, 24
      // battery, acid bubbles + the invulnerable Blazer comet form).
      key: 'androsynth', name: 'AN-20 Guardian', role: 'brawler', cost: 15,
      r: 6.5, mass: 1.4, accel: 110, turn: 2.9, maxSpeed: 105,
      crew: 20, batt: 24, regen: 4, orbit: 70,
      sprite: 'SHIP:androsynth', cap: 'androsynth', icon: 'androsynth',
      weapon: { label: 'Acid Bubbles', kind: 'lob', cd: 0.3, cost: 3, speed: 120, dmg: 2, size: 3, life: 2.2, count: 1, spread: 0, tol: 0.2, snd: 'lob' },
      special: { label: 'Blazer Form', type: 'blazer', cost: 2, cd: 1, dur: 3.5 },
    },
    {
      // AR-6 Skiff — the Arilou teleporting saucer (arilou.c stats).
      key: 'skiff', name: 'AR-6 Skiff', role: 'scout', cost: 16,
      r: 5, mass: 0.5, accel: 160, turn: 4.0, maxSpeed: 140,
      crew: 6, batt: 20, regen: 5, orbit: 70,
      sprite: 'SHIP:arilou', cap: 'arilou', icon: 'arilou',
      weapon: { label: 'Auto Gun', kind: 'dart', cd: 0.08, cost: 0.8, speed: 320, dmg: 2, size: 2, life: 0.6, count: 1, spread: 0.03, tol: 0.18, snd: 'laser' },
      special: { label: 'Teleport', type: 'blink', cost: 3, cd: 1, range: 260, snd: 'blink' },
    },
    {
      // SX-12 Blade — the Supox gardener (supox.c: 12 crew, 16 battery,
      // forward gats + omnidirectional vector thrust).
      key: 'supox', name: 'SX-12 Blade', role: 'escort', cost: 16,
      r: 5, mass: 0.9, accel: 165, turn: 3.6, maxSpeed: 128,
      crew: 12, batt: 16, regen: 6.5, orbit: 65,
      sprite: 'SHIP:supox', cap: 'supox', icon: 'supox',
      weapon: { label: 'Forward Gats', kind: 'pellet', cd: 0.08, cost: 1, speed: 290, dmg: 1, size: 2, life: 0.6, count: 1, spread: 0.03, tol: 0.2, snd: 'pellet' },
      special: { label: 'Vector Thrust', type: 'afterburner', cost: 1, cd: 0, drain: 6 },
    },
    {
      // DR-14 Mauler — the Druuge slaver ship (druuge.c: 14 crew, 32
      // battery, near-zero regen: the Furnace burns CREW for battery, and
      // every shell recoils the hull).
      key: 'druuge', name: 'DR-14 Mauler', role: 'artillery', cost: 17,
      r: 6, mass: 1.1, accel: 115, turn: 2.5, maxSpeed: 108,
      crew: 14, batt: 32, regen: 0.5, orbit: 85,
      sprite: 'SHIP:druuge', cap: 'druuge', icon: 'druuge',
      weapon: { label: 'Heavy Shell', kind: 'bolt', cd: 0.55, cost: 4, speed: 320, dmg: 6, size: 3, life: 1.2, count: 1, spread: 0, tol: 0.14, recoil: 70, snd: 'bolt' },
      special: { label: 'Furnace', type: 'furnace', cost: 0, cd: 1, gain: 16 },
    },
    {
      // SL-12 Probe — the Slylandro self-replicator (slylandr.c stats).
      key: 'probe', name: 'SL-12 Probe', role: 'interceptor', cost: 18,
      r: 5, mass: 0.6, accel: 180, turn: 3.2, maxSpeed: 135,
      crew: 12, batt: 20, regen: 0, orbit: 90,
      sprite: 'SHIP:slylandro', cap: 'slylandro', icon: 'slylandro',
      weapon: { label: 'Lightning', kind: 'bolt', cd: 0.35, cost: 2, speed: 300, dmg: 6, size: 3, life: 0.6, count: 1, spread: 0, tol: 0.14, snd: 'bolt' },
      special: { label: 'Vector Dash', type: 'afterburner', cost: 0, cd: 0, drain: 5 },
    },
    {
      // SP-30 Eluder — the Spathi running-away ship (spathi.c stats).
      key: 'eluder', name: 'SP-30 Eluder', role: 'skirmisher', cost: 18,
      r: 7, mass: 1.8, accel: 130, turn: 2.0, maxSpeed: 110,
      crew: 30, batt: 10, regen: 2, orbit: 100,
      sprite: 'SHIP:spathi', cap: 'spathi', icon: 'spathi',
      weapon: { label: 'Front Gun', kind: 'pellet', cd: 0.12, cost: 0.8, speed: 260, dmg: 3, size: 2, life: 0.7, count: 1, spread: 0.03, tol: 0.2, snd: 'pellet' },
      special: { label: 'B.U.T.T. Missile', type: 'missile', cost: 3, cd: 1.8, speed: 220, dmg: 8, life: 3, turn: 3.0, snd: 'missile' },
    },
    {
      // ME-20 Trader — the Melnorme merchant (melnorme.c: 20 crew, 42
      // battery, the charged orb + the confusion mind blast).
      key: 'melnorme', name: 'ME-20 Trader', role: 'artillery', cost: 18,
      r: 7, mass: 1.5, accel: 100, turn: 2.2, maxSpeed: 92,
      crew: 20, batt: 42, regen: 6, orbit: 90,
      sprite: 'SHIP:melnorme', cap: 'melnorme', icon: 'melnorme',
      weapon: { label: 'Charged Orb', kind: 'lob', cd: 1.1, cost: 5, speed: 130, dmg: 8, size: 5, life: 2.2, count: 1, spread: 0, tol: 0.15, aoe: 22, snd: 'lob' },
      special: { label: 'Mind Blast', type: 'missile', cost: 20, cd: 3, speed: 120, dmg: 6, life: 4, turn: 2.6, snd: 'missile' },
    },
    {
      // MM-20 X-Form — the Mmrnmhrm hybrid (mmrnmhrm.c: 20 crew, 10
      // battery; X-form = fast twin lasers, Y-form = slow twin homing
      // torpedoes; the special transforms between them).
      key: 'mmrnmhrm', name: 'MM-20 X-Form', role: 'interceptor', cost: 19,
      r: 5, mass: 0.7, accel: 190, turn: 3.8, maxSpeed: 132,
      crew: 20, batt: 10, regen: 5, orbit: 70,
      sprite: 'SHIP:mmrnmhrm', cap: 'mmrnmhrm', icon: 'mmrnmhrm',
      weapon: { label: 'Twin Lasers', kind: 'pellet', cd: 0.09, cost: 1, speed: 300, dmg: 1.5, size: 2, life: 0.55, count: 2, spread: 0.06, tol: 0.18, snd: 'pellet' },
      forms: {
        x: { accel: 190, turn: 3.8, maxSpeed: 132,
             weapon: { label: 'Twin Lasers', kind: 'pellet', cd: 0.09, cost: 1, speed: 300, dmg: 1.5, size: 2, life: 0.55, count: 2, spread: 0.06, tol: 0.18, snd: 'pellet' } },
        y: { accel: 85, turn: 1.6, maxSpeed: 68,
             weapon: { label: 'Twin Torpedoes', kind: 'missile', cd: 0.55, cost: 1, speed: 170, dmg: 2, size: 2, life: 3.2, count: 2, spread: 0.08, tol: 0.2, turn: 2.2, snd: 'missile' } },
      },
      special: { label: 'Transform', type: 'xform', cost: 0, cd: 0.4 },
    },
    {
      // PK-8 Fury — the Pkunk reincarnator (pkunk.c stats).
      key: 'fury', name: 'PK-8 Fury', role: 'interceptor', cost: 20,
      r: 5, mass: 0.5, accel: 200, turn: 4.2, maxSpeed: 145,
      crew: 8, batt: 12, regen: 0, orbit: 65,
      sprite: 'SHIP:pkunk', cap: 'pkunk', icon: 'pkunk',
      weapon: { label: 'Triple Peck', kind: 'shot', cd: 0.14, cost: 0.5, speed: 300, dmg: 2, size: 2, life: 0.5, count: 3, spread: 0.14, tol: 0.25, snd: 'shot' },
      special: { label: 'Rebirth', type: 'rebirth', chance: 0.5, cost: 0, cd: 0 },
    },
    {
      // MY-20 Podship — the Mycon bioship (mycon.c stats).
      key: 'podship', name: 'MY-20 Podship', role: 'artillery', cost: 21,
      r: 8, mass: 2.0, accel: 65, turn: 1.2, maxSpeed: 68,
      crew: 20, batt: 40, regen: 4, orbit: 95,
      sprite: 'SHIP:mycon', cap: 'mycon', icon: 'mycon',
      weapon: { label: 'Homing Plasma', kind: 'missile', cd: 0.9, cost: 8, speed: 180, dmg: 10, size: 5, life: 3.5, count: 1, spread: 0, tol: 0.1, turn: 1.6, aoe: 25, snd: 'missile' },
      special: { label: 'Crew Regeneration', type: 'shield', cost: 5, cd: 6, dur: 2.5 },
    },
    {
      // YE-20 Terminator — the Yehat gunship (yehat.c stats).
      key: 'terminator', name: 'YE-20 Terminator', role: 'escort', cost: 22,
      r: 6, mass: 1.0, accel: 150, turn: 3.2, maxSpeed: 120,
      crew: 20, batt: 10, regen: 5, orbit: 70,
      sprite: 'SHIP:yehat', cap: 'yehat', icon: 'yehat',
      weapon: { label: 'Dual Guns', kind: 'pellet', cd: 0.09, cost: 0.5, speed: 280, dmg: 2, size: 2, life: 0.7, count: 2, spread: 0.05, tol: 0.18, snd: 'pellet' },
      special: { label: 'Tactical Shield', type: 'shield', cost: 3, cd: 1, dur: 2.0 },
    },
    {
      // UT-20 Jugger — the Utwig shield ship (utwig.c: 20 crew, 20 battery,
      // NO regen — the absorber shield eats damage as long as it holds).
      key: 'utwig', name: 'UT-20 Jugger', role: 'escort', cost: 22,
      r: 6, mass: 1.8, accel: 140, turn: 3.2, maxSpeed: 118,
      crew: 20, batt: 20, regen: 0, orbit: 75,
      sprite: 'SHIP:utwig', cap: 'utwig', icon: 'utwig',
      weapon: { label: 'Forward Gat', kind: 'pellet', cd: 0.09, cost: 0, speed: 290, dmg: 1, size: 2, life: 0.6, count: 2, spread: 0.05, tol: 0.18, snd: 'pellet' },
      special: { label: 'Absorber Shield', type: 'shield', cost: 1, cd: 0.35, dur: 2.6 },
    },
    {
      // OR-16 Nemesis — the Orz marine-boarding gunship (orz.c stats).
      key: 'nemesis', name: 'OR-16 Nemesis', role: 'boarding', cost: 23,
      r: 6, mass: 1.6, accel: 110, turn: 2.8, maxSpeed: 95,
      crew: 16, batt: 20, regen: 3.5, orbit: 75,
      sprite: 'SHIP:orz', cap: 'orz', icon: 'orz',
      turret: true, turretRate: 2.6,   // howitzer turret: hold SHIFT+A/D to swing
      weapon: { label: 'Howitzer', kind: 'shot', cd: 0.18, cost: 1.5, speed: 280, dmg: 4, size: 3, life: 1.0, count: 1, spread: 0.04, tol: 0.2, snd: 'shot' },
      special: { label: 'Marines', type: 'fighters', cost: 0, cd: 3.5, fspeed: 220, flife: 5, laserRange: 90, laserDmg: 3, laserCd: 0.8 },
    },
/* hidden for now
    {
      // CH-42 Avatar — the Chmmr crystal powerhouse (chmmr.c stats).
      key: 'avatar', name: 'CH-42 Avatar', role: 'heavy cruiser', cost: 28,
      r: 8, mass: 2.4, accel: 70, turn: 1.8, maxSpeed: 72,
      crew: 42, batt: 42, regen: 8, orbit: 65,
      sprite: 'SHIP:chmmr', cap: 'chmmr', icon: 'chmmr',
      weapon: { label: 'Auto Laser', kind: 'dart', cd: 0.06, cost: 0.8, speed: 330, dmg: 2, size: 2, life: 0.8, count: 1, spread: 0.02, tol: 0.16, snd: 'laser' },
      special: { label: 'Zap Satellites', type: 'satellites', cost: 6, cd: 4,
                 satHP: 2, satOrbit: 60, satZap: 160, zapDmg: 3, maxSats: 3 },
    },
    */
    {
      // CJ-36 Broodhome — the Chenjesu crystal dreadnought (chenjesu.c: 36
      // crew, 30 battery, the photon crystal + autonomous DOGI harvesters).
      key: 'chenjesu', name: 'CJ-36 Broodhome', role: 'dreadnought', cost: 28,
      r: 8, mass: 2.2, accel: 70, turn: 1.5, maxSpeed: 72,
      crew: 36, batt: 30, regen: 7, orbit: 95,
      sprite: 'SHIP:chenjesu', cap: 'chenjesu', icon: 'chenjesu',
      weapon: { label: 'Photon Crystal', kind: 'plasma', cd: 1.3, cost: 5, speed: 150, dmg: 6, size: 6, life: 2.4, count: 1, spread: 0, tol: 0.17, aoe: 30, snd: 'plasma' },
      special: { label: 'DOGI Crystals', type: 'missile', cost: 20, cd: 2.5, speed: 110, dmg: 3, life: 5, turn: 2.2, snd: 'missile' },
    },
/* hidden for now
    {
      // KH-42 Marauder — the Kohr-Ah blade-thrower (blackurq.c stats).
      key: 'marauder', name: 'KH-42 Marauder', role: 'dreadnought', cost: 30,
      r: 8, mass: 2.4, accel: 80, turn: 1.6, maxSpeed: 80,
      crew: 42, batt: 42, regen: 4.2, orbit: 60,
      sprite: 'SHIP:kohrah', cap: 'kohrah', icon: 'kohrah',
      weapon: { label: 'F.R.I.E.D.', kind: 'plasma', cd: 1.0, cost: 6, speed: 155, dmg: 10, size: 6, life: 2.0, count: 1, spread: 0, tol: 0.2, aoe: 36, snd: 'plasma' },
      special: { label: 'Buzzsaw Blades', type: 'mine', cost: 12, cd: 1.5, dmg: 8, rad: 22, maxMines: 6, snd: 'mine' },
    },
    */
    {
      // UQ-42 Dreadnought — the Ur-Quan Kzer-Za flagship (urquan.c: 42
      // crew, 42 battery, fusion bolts + autonomous fighters that ARE crew).
      key: 'urquan', name: 'UQ-42 Dreadnought', role: 'dreadnought', cost: 30,
      r: 8, mass: 2.4, accel: 80, turn: 1.6, maxSpeed: 80,
      crew: 42, batt: 42, regen: 4.2, orbit: 55,
      sprite: 'SHIP:urquan', cap: 'urquan', icon: 'urquan',
      weapon: { label: 'Fusion Bolts', kind: 'fusion', cd: 0.13, cost: 3.2, speed: 300, dmg: 4, size: 3, life: 0.5, count: 1, spread: 0.02, tol: 0.16, snd: 'bolt' },
      special: {
        label: 'Launch Fighters', type: 'fighters', cost: 8, cd: 0.5,
        fspeed: 250, flife: 7, laserRange: 110, laserDmg: 2, laserCd: 0.55,
      },
    },
  ];

  // Normalize specs to world scale: distances/speeds xS, sprites render 2x.
  const S = GM.SCALE;
  for (const sp of GM.SHIPS) {
    sp.accel *= S;
    sp.maxSpeed *= S;
    sp.orbit *= S;
    sp.r *= 2.25;
    sp.weapon.speed *= S;
    sp.weapon.size *= 3;
    if (sp.weapon.aoe) sp.weapon.aoe *= S;
    // X-Form: both forms carry their own accel/turn/maxSpeed/weapon
    if (sp.forms) {
      for (const fk of Object.keys(sp.forms)) {
        const f = sp.forms[fk];
        f.accel *= S;
        f.maxSpeed *= S;
        f.weapon.speed *= S;
        f.weapon.size *= 3;
        if (f.weapon.aoe) f.weapon.aoe *= S;
      }
    }
    // resolve SC2 sprite references to data URIs from content.js
    // NOTE: this often runs BEFORE content.js loads, so the resolution
    // fails silently — preloadSprites() in ship.js re-resolves at boot
    // after all scripts are loaded. This is kept as a best-effort early
    // attempt (harmless if content.js isn't available yet).
    if (sp.sprite && sp.sprite.startsWith('SHIP:') && GM.CONTENT && GM.CONTENT.shipsprites) {
      sp.sprite = GM.CONTENT.shipsprites[sp.sprite.slice(5)] || null;
    }
    const k = sp.special;
    if (k.speed) k.speed *= S;
    if (k.range) k.range *= S;
    if (k.rad) k.rad *= S;
  }

  GM.MODES = [
    // budget: point cap per TEAM (Super Melee style) — every slot must fit.
    { key: '1', label: '1 v 1',       teams: [1, 1],       budget: 30 },
    { key: '2', label: '2 v 2',       teams: [2, 2],       budget: 50 },
    { key: '3', label: '3 v 3 v 3',   teams: [3, 3, 3],    budget: 66 },
    { key: '5', label: 'SURVIVAL',    teams: [1, 0],       budget: 30 },
  ];

  GM.PILOTS = [
    'Nova', 'Rex', 'Vex', 'Juno', 'Kilo', 'Ash', 'Piper', 'Onyx', 'Rook', 'Sage',
    'Mira', 'Bolt', 'Echo', 'Ghost', 'Halo', 'Iris', 'Jett', 'Kade', 'Lux', 'Nyx',
    'Orca', 'Pixel', 'Rune', 'Skye', 'Talon', 'Uma', 'Viper', 'Wren', 'Zeph',
    'Ember', 'Frost', 'Gale', 'Hex', 'Jinx', 'Mochi', 'Quill', 'Dash', 'Indigo',
    'Fable', 'Comet',
  ];

  GM.ARCHETYPES = [
    { key: 'reckless', label: 'Reckless', aggr: 0.85, caution: 0.15, jink: 0.75, orbitBias: -0.15, special: 0.9, aim: 0.9 },
    { key: 'cautious', label: 'Cautious', aggr: 0.30, caution: 0.85, jink: 0.30, orbitBias: 0.25, special: 0.5, aim: 1.15 },
    { key: 'duelist',  label: 'Duelist',  aggr: 0.60, caution: 0.50, jink: 0.50, orbitBias: 0.00, special: 0.6, aim: 1.0 },
    { key: 'sniper',   label: 'Sniper',  aggr: 0.45, caution: 0.65, jink: 0.25, orbitBias: 0.35, special: 0.4, aim: 0.7 },
    { key: 'brawler',  label: 'Brawler',  aggr: 0.90, caution: 0.30, jink: 0.55, orbitBias: -0.30, special: 0.7, aim: 1.0 },
    { key: 'trickster', label: 'Trickster', aggr: 0.55, caution: 0.45, jink: 0.95, orbitBias: 0.10, special: 1.0, aim: 1.05 },
  ];
})(window.GM);