// gravity-melee :: arena physics constants, teams, ship roster, modes
(function (GM) {
  GM.VERSION = '0.1.0';

  GM.W = 640;
  GM.H = 360;

  GM.PHYS = {
    dt: 1 / 60,
    planet: { x: 320, y: 180, r: 26, GM: 390000, rInf: 170, knee: 138, aCap: 520 },
    moon:   { r: 8, GM: 22000, rInf: 70, knee: 52, aCap: 300, orbitR: 132, omega: 0.34 },
    spawnR: 92,
    surgeAt: 170,   // seconds until gravity surge begins ramping
    surgeRate: 0.02,
    surgeMax: 3.0,
  };

  GM.TEAMS = [
    { name: 'AZURE',   P: '#3fc8ff', S: '#155a9e', glow: '#aef0ff' },
    { name: 'CRIMSON', P: '#ff5648', S: '#8e1a33', glow: '#ffc2ae' },
    { name: 'VERDANT', P: '#6fff4e', S: '#1f7a35', glow: '#d2ffbe' },
  ];

  // sprite palette: P/S are substituted per team
  GM.CHARS = {
    W: '#f4f8ff', H: '#a9b3c6', h: '#5f6b83', G: '#8ef2ff',
    E: '#ffab3d', e: '#d0641e',
    P: null, S: null,
  };

  // Ship art: 13-wide rows, nose pointing UP (rendered rotated by ang + PI/2)
  const ART = {};

  ART.sparrow = [
    '......W......',
    '......P......',
    '.....HPH.....',
    '.....PPP.....',
    '....HPPPH....',
    '....PPSPP....',
    '...HPPSPPH...',
    '...HPSSSPH...',
    '....PPSPP....',
    '.....hPh.....',
    '.....eEe.....',
    '......E......',
  ];

  ART.vanguard = [
    '......W......',
    '.....HWH.....',
    '.....HPH.....',
    '....HPPPH....',
    '...HPPWPPH...',
    '..HPPWWWPPH..',
    '.HPWPPWPPWPH.',
    '.HPPPPWPPPPH.',
    '...HPPWPPH...',
    '....hPPPPh....',
    '....e.E.e....',
    '......E......',
  ];

  ART.colossus = [
    '...HHHHHHH...',
    '..HWWWWWWWH..',
    '.HWWPPPPPWWH.',
    '.HWPPPPPPPWH.',
    'HWWPPSPSPPWWH',
    'HPPSSPPPSSPPH',
    'HPPPPGPGPPPPH',
    '.HPPPPPPPPPH.',
    '..HPPPPPPPPH..'.slice(0, 13),
    '...HPPePPH...',
    '...eEEeEEe...',
    '....E..E..E..'.slice(0, 13),
  ];

  ART.mantis = [
    '.H.........H.',
    '.WH.......HW.',
    '..WH..H..HW..',
    '...WH.H.HW...',
    '....WHWHW....',
    '.....HPH.....',
    '...H.HPPH.H..'.slice(0, 13),
    '...W.HSPSH.W.',
    '....HSPSH....',
    '.....hPh.....',
    '....e.E.e....',
    '.....E.E.....',
  ];

  ART.wisp = [
    '...WWWWWWW...',
    '..WWPPPPPWW..',
    '.WWPGGPPGGWW.',
    '.WPGPPPPPGPW.',
    'WWPPGPPPWGPPW',
    'WPGPPPWPPWPGW',
    'WPGPPPPPPPGPW',
    '.WPGPPPPPGPW.',
    '.WWPPGGGPPWW.',
    '..WWPP.PPWW..',
    '...W..E..W...',
    '......E......',
  ];

  ART.bastion = [
    '.HH......HH..',
    '.HWH....HWH..',
    '.HPPH..HPPH..',
    '..HPPHHPPH...',
    '..HPPPPPPH...',
    '.HHPPWPPHH...',
    '.HWPWPPWPWH..',
    '.HPWPPPPWPH..',
    '..HPPePPH....',
    '...He.E.eH...',
    '....E...E....',
    '.....E.E.....',
  ];

  GM.SHIPS = [
    {
      key: 'sparrow', name: 'SC-1 Sparrow', role: 'scout',
      r: 5, mass: 0.7, accel: 170, turn: 3.9, maxSpeed: 135,
      crew: 12, batt: 26, regen: 6, orbit: 62,
      art: ART.sparrow,
      weapon: { label: 'Pulse Darts', kind: 'dart', cd: 0.13, cost: 0.8, speed: 255, dmg: 2, size: 2, life: 1.0, count: 1, spread: 0.035, tol: 0.22, snd: 'laser' },
      special: { label: 'Afterburner', type: 'afterburner', cost: 0, cd: 0, drain: 9 },
    },
    {
      key: 'vanguard', name: 'TK-4 Vanguard', role: 'cruiser',
      r: 6, mass: 1.0, accel: 120, turn: 2.8, maxSpeed: 105,
      crew: 20, batt: 40, regen: 5, orbit: 85,
      art: ART.vanguard,
      weapon: { label: 'Auto Bolt', kind: 'bolt', cd: 0.3, cost: 2, speed: 205, dmg: 5, size: 3, life: 1.4, count: 1, spread: 0, tol: 0.13, snd: 'bolt' },
      special: { label: 'Aegis Bubble', type: 'shield', cost: 14, cd: 3.5, dur: 1.1 },
    },
    {
      key: 'colossus', name: 'HR-9 Colossus', role: 'dreadnought',
      r: 8.5, mass: 2.2, accel: 75, turn: 1.7, maxSpeed: 78,
      crew: 42, batt: 44, regen: 4, orbit: 105,
      art: ART.colossus,
      weapon: { label: 'Siege Plasma', kind: 'plasma', cd: 1.15, cost: 6, speed: 148, dmg: 12, size: 5, life: 2.4, count: 1, spread: 0, tol: 0.17, aoe: 30, snd: 'plasma' },
      special: { label: 'Grav Pulse', type: 'pulse', cost: 11, cd: 4, rad: 115 },
    },
    {
      key: 'mantis', name: 'XT-3 Mantis', role: 'skirmisher',
      r: 5.5, mass: 0.85, accel: 135, turn: 3.1, maxSpeed: 118,
      crew: 16, batt: 32, regen: 5.5, orbit: 72,
      art: ART.mantis,
      weapon: { label: 'Fragment Volley', kind: 'shot', cd: 0.6, cost: 3.5, speed: 195, dmg: 4, size: 2, life: 0.8, count: 3, spread: 0.16, tol: 0.3, snd: 'shot' },
      special: { label: 'Seeker Pod', type: 'missile', cost: 8, cd: 2.2, speed: 145, dmg: 10, life: 4, turn: 2.7, snd: 'missile' },
    },
    {
      key: 'wisp', name: 'NV-2 Wisp', role: 'artillery',
      r: 6, mass: 0.8, accel: 95, turn: 2.4, maxSpeed: 92,
      crew: 14, batt: 36, regen: 5, orbit: 135,
      art: ART.wisp,
      weapon: { label: 'Phase Lob', kind: 'lob', cd: 0.8, cost: 3, speed: 96, dmg: 8, size: 4, life: 3.4, count: 1, spread: 0, tol: 0.12, snd: 'lob' },
      special: { label: 'Blink', type: 'blink', cost: 13, cd: 3, range: 230, snd: 'blink' },
    },
    {
      key: 'bastion', name: 'RX-5 Bastion', role: 'mine layer',
      r: 6, mass: 1.1, accel: 110, turn: 2.6, maxSpeed: 96,
      crew: 18, batt: 34, regen: 6, orbit: 78,
      art: ART.bastion,
      weapon: { label: 'Point Pellet', kind: 'pellet', cd: 0.17, cost: 0.9, speed: 225, dmg: 3, size: 2, life: 0.75, count: 1, spread: 0.03, tol: 0.2, snd: 'pellet' },
      special: { label: 'Sting Mine', type: 'mine', cost: 6, cd: 1.1, dmg: 12, rad: 28, maxMines: 4, snd: 'mine' },
    },
  ];

  GM.MODES = [
    { key: '1', label: '1 v 1',       teams: [1, 1] },
    { key: '2', label: '2 v 2',       teams: [2, 2] },
    { key: '3', label: '3 v 3 v 3',   teams: [3, 3, 3] },
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