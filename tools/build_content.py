#!/usr/bin/env python3
"""gravity-melee :: content builder

Extracts Star Control II planet + melee-sound content from an Ur-Quan Masters
source checkout (git) and embeds it as base64 data URIs in js/content.js.

The embedded content is:
  Planet graphics + melee sound effects from Star Control II,
  (c) Toys for Bob, distributed via The Ur-Quan Masters
  (https://sc2.sourceforge.net/) under CC BY-NC-SA 2.5.
  See assets/LICENSE-content.md. Code remains MIT.

Usage:
  python3 tools/build_content.py <uqm-checkout> [out.js]
"""
import base64
import json
import os
import subprocess
import sys

# Curated planet types (visual variety; CYCLE = palette-animated flowing look)
PLANETS = ['bluegas', 'purplegas', 'magma', 'organic', 'emerald',
           'radioactive', 'water', 'dust']
CYCLE = ['bluegas', 'purplegas', 'magma', 'organic', 'radioactive']
WAVS = ['boom1', 'boom23', 'boom45', 'boom67', 'getcrew', 'shipdies']
# SC2 music modules (ProTracker .mod, played by js/protracker.js)
MODS = {'battle': 'battle/battle.mod', 'hyper': 'nav/hyper.mod',
        'orbit': 'nav/orbit.mod'}

# SC2 ship sprites + weapon sounds: species -> (png, primary.wav, secondary.wav).
# Embedded buffer keys are <species>_<wav file sans extension> so the Mmrnmhrm
# X-Form's primaryx/primaryy pair maps to mmrnmhrm_primaryx/_primaryy.
SHIP_SPRITES = {
    'kohrah':    ('marauder-big-000.png',   'primary.wav',   'secondary.wav'),
    'chmmr':     ('avatar-big-000.png',     'primary.wav',   'secondary.wav'),
    'yehat':     ('terminator-big-000.png', 'primary.wav',   'secondary.wav'),
    'slylandro': ('probe-big-000.png',      'primary.wav',   'secondary.wav'),
    'orz':       ('nemesis-big-000.png',    'primary.wav',   'secondary.wav'),
    'mycon':     ('podship-big-000.png',    'primary.wav',   'secondary.wav'),
    'arilou':    ('skiff-big-000.png',      'primary.wav',   'secondary.wav'),
    'spathi':    ('eluder-big-000.png',     'primary.wav',   'secondary.wav'),
    'pkunk':     ('fury-big-000.png',       'primary.wav',   'secondary.wav'),
    'umgah':     ('drone-big-000.png',      'primary.wav',   'secondary.wav'),
    'urquan':    ('dreadnought-big-000.png','primary.wav',   'secondary.wav'),
    'human':     ('cruiser-big-000.png',    'primary.wav',   'secondary.wav'),
    'androsynth':('guardian-big-000.png',   'primary.wav',   'secondary.wav'),
    'chenjesu':  ('broodhome-big-000.png',  'primary.wav',   'secondary.wav'),
    'druuge':    ('mauler-big-000.png',     'primary.wav',   'secondary.wav'),
    'ilwrath':   ('avenger-big-000.png',    'primary.wav',   'secondary.wav'),
    'melnorme':  ('trader-big-000.png',     'primary.wav',   'secondary.wav'),
    'mmrnmhrm':  ('xform-big-000.png',      'primaryx.wav',  'secondary.wav'),
    'shofixti':  ('scout-big-000.png',      'primary.wav',   'secondary.wav'),
    'supox':     ('blade-big-000.png',      'primary.wav',   'secondary.wav'),
    'syreen':    ('penetrator-big-000.png', 'primary.wav',   'secondary.wav'),
    'thraddash': ('torch-big-000.png',      'primary.wav',   'secondary.wav'),
    'utwig':     ('jugger-big-000.png',     'primary.wav',   'secondary.wav'),
    'vux':       ('intruder-big-000.png',   'primary.wav',   'secondary.wav'),
    'zoqfotpik': ('stinger-big-000.png',    'primary.wav',   'secondary.wav'),
}

# SC2 captain windows (sc2/src/uqm/status.c CaptainsWindow): 15 frames per
# ship -- 0 idle window, 1-5 turn, 6-8 thrust, 9-11 weapon, 12-14 special --
# drawn as overlay patches at (origin - anchor). Plus the battle panel ship
# icon (<name>-icons-001.png). Species -> content ship name.
CAPTAIN_SETS = {
    'kohrah': 'marauder', 'chmmr': 'avatar', 'yehat': 'terminator',
    'slylandro': 'probe', 'orz': 'nemesis', 'mycon': 'podship',
    'arilou': 'skiff', 'spathi': 'eluder', 'pkunk': 'fury',
    'umgah': 'drone', 'urquan': 'dreadnought', 'human': 'cruiser',
    'androsynth': 'guardian', 'chenjesu': 'broodhome', 'druuge': 'mauler',
    'ilwrath': 'avenger', 'melnorme': 'trader', 'mmrnmhrm': 'xform',
    'shofixti': 'scout', 'supox': 'blade', 'syreen': 'penetrator',
    'thraddash': 'torch', 'utwig': 'jugger', 'vux': 'intruder',
    'zoqfotpik': 'stinger',
}

# extra per-ship sounds beyond primary/secondary (keyed <species>_<name>)
EXTRA_WAVS = {
    'mmrnmhrm': ['primaryy.wav'],
    'ilwrath': ['cloak.wav'],
    'vux': ['limpet_bite.wav'],
    'utwig': ['shieldbattgain.wav'],
    'chenjesu': ['dogibark.wav'],
    'urquan': ['fighter_laser.wav', 'fighter_get.wav'],
    'pkunk': [f'insult{i:02d}.wav' for i in range(1, 15)],   # the famous combat taunts
}

# nav sprite sets for the hyperspace mode: key -> (dir, name, frame count)
NAV_SETS = {
    'flagship': ('nav', 'flagship', 16),        # the 16-facing map icon
    'sun': ('nav', 'truespacesun', 5),          # animated system-view sun
}

# extra per-ship sprites: the Mmrnmhrm Y-Form shape + the Orz howitzer turret
EXTRA_SPRITES = {
    'mmrnmhrm_yform': ('mmrnmhrm', 'ywing-big-000.png'),
    'orz_turret': ('orz', 'turret-big-000.png'),
}

# weapon projectile sprites: species -> (dir, weapon_prefix, max_frames)
# — the original SC2 projectile art for each ship's primary weapon,
# animated through up to `max_frames` frames
WEAPON_SPRITES = {
    # (shofixti's destruct is a self-destruct explosion, not a weapon projectile)
    'zoqfotpik': ('zoqfotpik', 'spit',     8),   # anti-matter sting
    'umgah':     ('umgah',     'cone',     6),   # cone zap
    'ilwrath':   ('ilwrath',   'fire',     8),  # twin fusion spray
    'thraddash': ('thraddash', 'napalm',   8),  # flame gun
    'human':     ('human',     'saturn',   6),  # MX missile
    'vux':       ('vux',       'limpets',  4),  # limpet torpedo
    'androsynth':('androsynth','bubble',    3),  # acid bubble
    'supox':     ('supox',     'glob',     6),  # glob projectile
    'druuge':    ('druuge',    'cannon',    8),  # heavy shell
    'spathi':    ('spathi',    'butt',      8),  # B.U.T.T. missile
    'pkunk':     ('pkunk',     'bug',       1),  # peck projectile
    'mycon':     ('mycon',     'plasma',    6),  # homing plasma
    'yehat':     ('yehat',     'missile',   8),  # dual gun shot
    'utwig':     ('utwig',     'lance',     8),  # gatling lance
    'orz':       ('orz',       'howitzer',  8),  # howitzer shell
    'chenjesu':  ('chenjesu',  'spark',    8),  # photon crystal
    'kohrah':    ('kohrah',    'gas',       8),  # F.R.I.E.D.
    'urquan':    ('urquan',    'fusion',    8),  # fusion bolt
    'melnorme':  ('melnorme',  'pumpup',    6),  # charged orb
    # non-weapon sprite sets keyed by content name:
    'shofixti_destruct': ('shofixti', 'destruct', 8),   # glory device blast
    'chmmr_sat':         ('chmmr',    'satellite', 8),  # Avatar's orbiting drones
}

# melee explosion animation frames (battle/boom-big-000..003.png)
BOOM_SPRITES = 4

# The full UQM tracker soundtrack, played by our own miniprotracker
# (js/protracker.js) on the standalone music.html jukebox page.
# (group, path under content/base, display name) — exported raw to
# assets/music/ + a manifest in js/musiclist.js (window.SC2_MUSIC).
MUSIC_TRACKS = [
    ('melee', 'battle/battle.mod', 'Melee Battle — Attack!'),
    ('space', 'nav/hyper.mod', 'Hyperspace'),
    ('space', 'nav/space.mod', 'Truespace'),
    ('space', 'nav/orbit.mod', 'Solar Orbit'),
    ('space', 'nav/quasispace.mod', 'Quasispace'),
    ('space', 'ui/starbase.mod', 'Earth Starbase'),
    ('space', 'ui/outfit.mod', 'Outfitting'),
    ('space', 'ui/shipyard.mod', 'Shipyard'),
    ('space', 'ui/redalert.mod', 'Red Alert'),
    ('cutscene', 'cutscene/intro/introx.mod', 'Intro'),
    ('cutscene', 'cutscene/ending/victory1.mod', 'Ending — Victory Song 1'),
    ('cutscene', 'cutscene/ending/victory2.mod', 'Ending — Victory Song 2'),
    ('cutscene', 'cutscene/ending/victoryf.mod', 'Ending — Final Victory Theme'),
    ('comm', 'comm/commander/commander.mod', 'Cmdr. Hayes'),
    ('comm', 'comm/talkingpet/talkingpet.mod', 'The Talking Pet'),
    ('comm', 'comm/arilou/arilou.mod', 'Arilou'),
    ('comm', 'comm/chmmr/chmmr.mod', 'Chmmr'),
    ('comm', 'comm/druuge/druuge.mod', 'Druuge'),
    ('comm', 'comm/ilwrath/ilwrath.mod', 'Ilwrath'),
    ('comm', 'comm/kohrah/kohrah.mod', 'Kohr-Ah'),
    ('comm', 'comm/melnorme/melnorme.mod', 'Melnorme'),
    ('comm', 'comm/mycon/mycon.mod', 'Mycon'),
    ('comm', 'comm/orz/orz.mod', 'Orz'),
    ('comm', 'comm/pkunk/pkunk.mod', 'Pkunk'),
    ('comm', 'comm/probe/probe.mod', 'Slylandro Probe'),
    ('comm', 'comm/shofixti/shofixti.mod', 'Shofixti'),
    ('comm', 'comm/slylandro/slylandro.mod', 'Slylandro'),
    ('comm', 'comm/spathi/spathi.mod', 'Spathi'),
    ('comm', 'comm/supox/supox.mod', 'Supox'),
    ('comm', 'comm/syreen/syreen.mod', 'Syreen'),
    ('comm', 'comm/thraddash/thraddash.mod', 'Thraddash'),
    ('comm', 'comm/umgah/umgah.mod', 'Umgah'),
    ('comm', 'comm/urquan/urquan.mod', 'Ur-Quan'),
    ('comm', 'comm/utwig/utwig.mod', 'Utwig'),
    ('comm', 'comm/vux/vux.mod', 'VUX'),
    ('comm', 'comm/yehat/yehat.mod', 'Yehat'),
    ('comm', 'comm/zoqfotpik/zoqfotpik.mod', 'Zoq-Fot-Pik'),
    ('ships', 'ships/human/cruiser.mod', 'Earthling Cruiser'),
    ('ships', 'ships/urquan/dreadnought.mod', 'Ur-Quan Dreadnought'),
    ('ships', 'ships/kohrah/marauder.mod', 'Kohr-Ah Marauder'),
    ('ships', 'ships/chmmr/avatar.mod', 'Chmmr Avatar'),
    ('ships', 'ships/chenjesu/broodhome.mod', 'Chenjesu Broodhome'),
    ('ships', 'ships/mmrnmhrm/xform.mod', 'Mmrnmhrm X-Form'),
    ('ships', 'ships/yehat/terminator.mod', 'Yehat Terminator'),
    ('ships', 'ships/shofixti/scout.mod', 'Shofixti Scout'),
    ('ships', 'ships/flagship/flagship.mod', 'The Flagship'),
    ('ships', 'ships/orz/nemesis.mod', 'Orz Nemesis'),
    ('ships', 'ships/androsynth/guardian.mod', 'Androsynth Guardian'),
    ('ships', 'ships/umgah/drone.mod', 'Umgah Drone'),
    ('ships', 'ships/vux/intruder.mod', 'VUX Intruder'),
    ('ships', 'ships/syreen/penetrator.mod', 'Syreen Penetrator'),
    ('ships', 'ships/melnorme/trader.mod', 'Melnorme Trader'),
    ('ships', 'ships/ilwrath/avenger.mod', 'Ilwrath Avenger'),
    ('ships', 'ships/thraddash/torch.mod', 'Thraddash Torch'),
    ('ships', 'ships/spathi/eluder.mod', 'Spathi Eluder'),
    ('ships', 'ships/zoqfotpik/stinger.mod', 'Zoq-Fot-Pik Stinger'),
    ('ships', 'ships/pkunk/fury.mod', 'Pkunk Fury'),
    ('ships', 'ships/slylandro/probe.mod', 'Slylandro Probe'),
    ('ships', 'ships/supox/blade.mod', 'Supox Blade'),
    ('ships', 'ships/utwig/jugger.mod', 'Utwig Jugger'),
    ('ships', 'ships/mycon/podship.mod', 'Mycon Podship'),
    ('ships', 'ships/druuge/mauler.mod', 'Druuge Mauler'),
    ('ships', 'ships/arilou/skiff.mod', 'Arilou Skiff'),
]

HEADER = """// gravity-melee :: embedded Star Control II content (generated by tools/build_content.py)
//
// Planet graphics and melee sound effects from Star Control II,
// (c) Toys for Bob, distributed via The Ur-Quan Masters
// (https://sc2.sourceforge.net/). Licensed CC BY-NC-SA 2.5 -- see
// assets/LICENSE-content.md. The game code remains MIT; this content is
// noncommercial, attribution required, share-alike.
(function (GM) {
  GM.CONTENT = {
"""

def git_show(repo, ref, path):
    r = subprocess.run(['git', '-C', repo, 'show', f'{ref}:{path}'],
                       capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f'git show failed for {path}: {r.stderr.decode()[:200]}')
    return r.stdout

def main():
    repo = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'js', 'content.js')
    ref = 'v0.7.0-2'
    base = 'sc2/content/base'

    parts = [HEADER]
    parts.append('    planets: {\n')
    total = 0
    for p in PLANETS:
        raw = git_show(repo, ref, f'{base}/planets/{p}-big-000.png')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"      {p}: 'data:image/png;base64,{b64}',\n")
    parts.append('    },\n')
    parts.append('    wavs: {\n')
    for w in WAVS:
        raw = git_show(repo, ref, f'{base}/battle/{w}.wav')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"      {w}: 'data:audio/wav;base64,{b64}',\n")
    parts.append('    },\n')
    parts.append('    mods: {\n')
    for name, path in MODS.items():
        raw = git_show(repo, ref, f'{base}/{path}')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"      {name}: 'data:application/octet-stream;base64,{b64}',\n")
    parts.append('    },\n')
    parts.append('    shipsprites: {\n')
    for sp, (png, pwav, swav) in SHIP_SPRITES.items():
        raw = git_show(repo, ref, f'{base}/ships/{sp}/{png}')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"      {sp}: 'data:image/png;base64,{b64}',\n")
        for label, wav in [('primary', pwav), ('secondary', swav)]:
            try:
                raw = git_show(repo, ref, f'{base}/ships/{sp}/{wav}')
                b64 = base64.b64encode(raw).decode()
                parts.append(f"      {sp}_{wav[:-4]}: 'data:audio/wav;base64,{b64}',\n")
            except SystemExit:
                pass  # some ships lack a secondary sound (e.g. pkunk uses rebirth.wav)
    # extra per-ship sounds + sprites — INSIDE the shipsprites object
    for sp, wavs in EXTRA_WAVS.items():
        for wav in wavs:
            try:
                raw = git_show(repo, ref, f'{base}/ships/{sp}/{wav}')
                b64 = base64.b64encode(raw).decode()
                parts.append(f"      {sp}_{wav[:-4]}: 'data:audio/wav;base64,{b64}',\n")
            except SystemExit:
                pass  # not every species file exists
    for key, (sp, png) in EXTRA_SPRITES.items():
        raw = git_show(repo, ref, f'{base}/ships/{sp}/{png}')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"      {key}: 'data:image/png;base64,{b64}',\n")
    parts.append('    },\n')
    parts.append('    navsprites: {\n')
    for key, (d, nm, count) in NAV_SETS.items():
        ani = git_show(repo, ref, f'{base}/{d}/{nm}.ani').decode('utf-8', 'replace')
        anchors = []
        for ln in ani.splitlines():
            flds = ln.split()
            if len(flds) >= 5:
                anchors.append((int(flds[3]), int(flds[4])))
        n = min(count, len(anchors))
        parts.append(f'      {key}: {{\n        f: [\n')
        for i in range(n):
            raw = git_show(repo, ref, f'{base}/{d}/{nm}-{i:03d}.png')
            b64 = base64.b64encode(raw).decode()
            parts.append(f"          'data:image/png;base64,{b64}',\n")
        parts.append('        ],\n')
        parts.append('        a: [' + ', '.join(f'[{ax},{ay}]' for ax, ay in anchors[:n]) + '],\n')
        parts.append('      },\n')
    parts.append('    },\n')
    parts.append('    weaponsprites: {\n')
    for sp, (d, wprefix, count) in WEAPON_SPRITES.items():
        try:
            ani = git_show(repo, ref, f'{base}/ships/{d}/{wprefix}-big.ani').decode('utf-8', 'replace')
        except SystemExit:
            ani = ''
        anchors = []
        for ln in ani.splitlines():
            flds = ln.split()
            if len(flds) >= 5:
                anchors.append((int(flds[3]), int(flds[4])))
        n = min(count, len(anchors)) if anchors else 1
        parts.append(f'      {sp}: {{\n        f: [\n')
        for i in range(n):
            raw = git_show(repo, ref, f'{base}/ships/{d}/{wprefix}-big-{i:03d}.png')
            b64 = base64.b64encode(raw).decode()
            parts.append(f"          'data:image/png;base64,{b64}',\n")
        parts.append('        ],\n')
        if anchors:
            parts.append('        a: [' + ', '.join(f'[{ax},{ay}]' for ax, ay in anchors[:n]) + '],\n')
        else:
            parts.append('        a: [[0,0]],\n')
        parts.append('      },\n')
    parts.append('    },\n')
    parts.append('    boomsprites: {\n      f: [\n')
    for i in range(BOOM_SPRITES):
        raw = git_show(repo, ref, f'{base}/battle/boom-big-{i:03d}.png')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"          'data:image/png;base64,{b64}',\n")
    parts.append('      ],\n    },\n')
    parts.append('    captains: {\n')
    for sp, name in CAPTAIN_SETS.items():
        ani = git_show(repo, ref, f'{base}/ships/{sp}/{name}-cap.ani').decode('utf-8', 'replace')
        frames = []
        for ln in ani.splitlines():
            flds = ln.split()
            if len(flds) >= 5:
                frames.append((flds[0], int(flds[3]), int(flds[4])))
        parts.append(f'      {sp}: {{\n        f: [\n')
        for fname, ax, ay in frames:
            raw = git_show(repo, ref, f'{base}/ships/{sp}/{fname}')
            b64 = base64.b64encode(raw).decode()
            parts.append(f"          'data:image/png;base64,{b64}',\n")
        parts.append('        ],\n')
        parts.append('        a: [' + ', '.join(f'[{ax},{ay}]' for _, ax, ay in frames) + '],\n')
        raw = git_show(repo, ref, f'{base}/ships/{sp}/{name}-icons-001.png')
        b64 = base64.b64encode(raw).decode()
        parts.append(f"        i: 'data:image/png;base64,{b64}',\n")
        parts.append('      },\n')
    parts.append('    },\n')
    parts.append('    cycle: [' + ', '.join(f"'{p}'" for p in CYCLE) + '],\n')
    parts.append('    anchors: {\n')
    for p in PLANETS:
        ani = git_show(repo, ref, f'{base}/planets/{p}-big.ani').decode('utf-8', 'replace')
        fields = ani.split('\n')[0].split()
        # format: "<file> <rate> <?> <anchorX> <anchorY>"
        ax, ay = fields[3], fields[4]
        parts.append(f'      {p}: [{ax}, {ay}],\n')
    parts.append('    },\n')
    parts.append('    license: "CC BY-NC-SA 2.5 -- Star Control II content (c) Toys for Bob, via The Ur-Quan Masters",\n')
    parts.append('  };\n})(window.GM);\n')

    src = ''.join(parts)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        f.write(src)

    # also export the raw sources into assets/ for provenance + inspection
    adir = os.path.join(os.path.dirname(os.path.abspath(out)), '..', 'assets')
    os.makedirs(os.path.join(adir, 'planets'), exist_ok=True)
    os.makedirs(os.path.join(adir, 'sounds'), exist_ok=True)
    for p in PLANETS:
        raw = git_show(repo, ref, f'{base}/planets/{p}-big-000.png')
        with open(os.path.join(adir, 'planets', f'{p}-big-000.png'), 'wb') as f:
            f.write(raw)
    for w in WAVS:
        raw = git_show(repo, ref, f'{base}/battle/{w}.wav')
        with open(os.path.join(adir, 'sounds', f'{w}.wav'), 'wb') as f:
            f.write(raw)
    for name, path in MODS.items():
        raw = git_show(repo, ref, f'{base}/{path}')
        with open(os.path.join(adir, 'sounds', f'{name}.mod'), 'wb') as f:
            f.write(raw)
    for sp, name in CAPTAIN_SETS.items():
        cdir = os.path.join(adir, 'captains', sp)
        os.makedirs(cdir, exist_ok=True)
        ani = git_show(repo, ref, f'{base}/ships/{sp}/{name}-cap.ani')
        with open(os.path.join(cdir, f'{name}-cap.ani'), 'wb') as f:
            f.write(ani)
        for ln in ani.decode('utf-8', 'replace').splitlines():
            flds = ln.split()
            if len(flds) >= 5:
                raw = git_show(repo, ref, f'{base}/ships/{sp}/{flds[0]}')
                with open(os.path.join(cdir, flds[0]), 'wb') as f:
                    f.write(raw)
        raw = git_show(repo, ref, f'{base}/ships/{sp}/{name}-icons-001.png')
        with open(os.path.join(cdir, f'{name}-icons-001.png'), 'wb') as f:
            f.write(raw)
    # the full UQM tracker soundtrack -> assets/music/ + js/musiclist.js
    mdir = os.path.join(adir, 'music')
    os.makedirs(mdir, exist_ok=True)
    manifest = []
    for group, path, name in MUSIC_TRACKS:
        raw = git_show(repo, ref, f'{base}/{path}')
        fname = f"{group}-{path.split('/')[-1]}"
        with open(os.path.join(mdir, fname), 'wb') as f:
            f.write(raw)
        title = raw[:20].decode('latin-1', 'replace').split('\x00')[0].strip()
        manifest.append({'f': 'assets/music/' + fname, 'g': group,
                        'n': name, 't': title, 'kb': len(raw) // 1024})
    with open(os.path.join(os.path.dirname(os.path.abspath(out)), 'musiclist.js'), 'w') as f:
        f.write('// gravity-melee :: the SC2 soundtrack manifest (generated by tools/build_content.py)\n')
        f.write('// All modules (c) Toys for Bob, distributed via The Ur-Quan Masters,\n')
        f.write('// licensed CC BY-NC-SA 2.5 -- see assets/LICENSE-content.md.\n')
        f.write('window.SC2_MUSIC = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')
    print(f'soundtrack: {len(manifest)} modules exported to assets/music/ + js/musiclist.js')
    print(f'wrote {out}: {len(src)//1024}KB; exported raw sources to {os.path.normpath(adir)}')

if __name__ == '__main__':
    main()