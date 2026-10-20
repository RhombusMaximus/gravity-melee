# Gravity Melee

A love letter to *Star Control II* melee: arcade space combat fought entirely
inside a gravity well. AI pilots duel around the planet — slingshotting,
orbiting, ambushing from behind the moon — and you can grab the helm of any
ship at any time.

![screenshot](https://raw.githubusercontent.com/RhombusMaximus/gravity-melee/main/docs/screenshot.png)

## Play

Open `index.html` in any browser — no build, no dependencies, no server.

Or play the hosted copy: **https://rhombusmaximus.github.io/gravity-melee/**

The camera follows your ship across a 2796×1290 torus arena. The world view is
zoomed out (2304×1296 world units) so you see most of the arena at a glance,
and the game window fills 80% of your browser width. HUD is a separate
640×360 pixel-art overlay.

## Modes

| Key | Mode | Team budget |
|-----|------|-------------|
| 1 | 1 v 1 | 30 pts |
| 2 | 2 v 2 | 50 pts |
| 3 | 3 v 3 v 3 | 66 pts |

Every ship has a **point cost**. After picking a mode you assemble your AZURE
squadron on the **fleet assembly** screen — cycle ships per slot (`A`/`D`),
move between slots (`W`/`S`), randomize (`R`), and deploy (`ENTER`). Enemy
teams auto-fill under the same budget, so nobody fields an unfair fleet.

## Controls

| Key | Action |
|-----|--------|
| F | take the helm — first press locks YOUR team; F again cycles your ships |
| W / A / D | thrust / turn left / turn right |
| Q / E | strafe left / right |
| S | brake |
| SPACE | fire |
| SHIFT | special ability |
| TAB | cycle target lock among hostiles |
| C | order your AI wingmen to focus-fire your current target (12s) |
| X | release the helm back to the AI (spectates your team) |
| G | show AI minds (targets, modes, line-of-sight) |
| P | pause |
| M | mute |
| N | music on/off (x2 louder) |
| [ / ] | volume down / up (master) |
| ; / ' | SFX volume down / up |
| - / = | simulation speed ×0.25 … ×4 |

Flying the Nemesis: hold **SHIFT + A/D** to swing its rotating howitzer
turret — the shells fire along the turret, not the hull, and AI Nemesis
pilots track you with it (the original orz.c control scheme).

## Squadron control

You are **P1: the first ship of the first team** — the camera follows your
squadron from the moment the match starts, no lock-in press needed.

- **F cycles only your living ships** — the unheld ones fight as AI wingmen
  (roster: ★ P1, ◆ you-at-the-helm, ▸ wingman)
- When your ship dies, the helm **auto-jumps to a living teammate** (P1
  preferred) — you keep flying until your whole squadron is down
- **C** issues a focus-fire order: all wingmen lock your current target for
  12 seconds (retarget normally after)
- **X** releases the helm to watch your squadron fight — the camera stays on
  a specific ship (your held ship, then P1, then a teammate), never a fuzzy
  center-of-mass

## Campaign: hyperspace (v0.15, first slice)

Press **4** on the title screen and melee gives way to the campaign
starmap: you fly the Precursor flagship through a real **3D starfield**
built from the official UQM star definitions — **502 systems** in their
**102 named constellations**, color-coded by spectral class, with depth
fog as you cruise (`A`/`D` yaw, `R`/`F` pitch, `W` thrust, `S` brake).
**Drag** to look around, **scroll** to zoom out and see the whole
map at once, **click** any star to target it, then **ENTER** (or
double-click) to **warp** there — a glide through streaking starlight
that drops you in range. ENTER again to drop into the system's orbit
view: the original animated sun and SC2 planet discs on tilted orbits,
with the real `orbit.mod` theme. The top-right **radar** shows every
system at once — you're the white dot. `H` shows the controls card,
`W`/`S` thrust/brake, `SHIFT` boosts, arrows or `A`/`D` + `R`/`F` steer,
`ESC` backs out. You start with Sol targeted.

![hyperspace](https://raw.githubusercontent.com/RhombusMaximus/gravity-melee/main/docs/hyperspace.png)

Next campaign steps: the lander minigame, the Earth starbase, fuel and
minerals, dialogue with all 25 races (their comm portraits are already
in the tree), and the war.

## Soundtrack — music.html

Press **O** on the title screen (or open `music.html`) for the full **SC2
original soundtrack**: all 63 ProTracker modules from The Ur-Quan Masters
— melee, hyperspace, quasispace, truespace, orbit, the starbase and
shipyard, Red Alert, the intro and endings, all 24 comm themes, and all
26 ship victory ditties — rendered live in your browser by our own
[miniprotracker](https://github.com/RhombusMaximus/miniprotracker).
Click any track to play; `loop: one` repeats it seamlessly from its true
loop point.

Building this surfaced four real ProTracker bugs, fixed upstream in
miniprotracker v0.2.0: pattern-break rows are BCD (`C40` = row 40, not
64 — the hyperspace theme's breaks had been landing wrong), `Dxy` is a
volume slide rather than set-volume, Bxx-jump loops never terminated
(now renders end at the module's true loop point and report it), and
missing pattern/row references crashed the sequencer. The in-game music
gains from it too: the hyperspace theme now repeats seamlessly,
skipping its 1.2s intro.

## Roadmap

- **Campaign: the full single-player game** — hyperspace is live (see
  above); remaining: lander, starbase, comm, war
- **Online multiplayer** (WebRTC peer-to-peer or lightweight relay; the
  sim is already deterministic-ish per fixed-step)
- Persistent pilot records (kills per archetype)

## HUD

The corner panels are the original SC2 melee status panels, rebuilt from
the UQM source: the ship's **captain animates in a little window** as you
fly — leaning into turns, grabbing the stick when you thrust, flinching on
weapons and specials — and **crew shows as a column of green dots** (one
per crew member, like the original), battery as red dots, next to the
ship's stamp and the captain's name.

- **Upper left** — your ship: original status panel (animated captain
  window, green crew dots, red battery dots), special readiness, and a
  subtle amber warning when enemy targeting computers have a lock on you.
- **Upper right** — your current target: the same status panel, plus range
  and closing speed.
- **World** — cyan lock brackets frame your target on screen; a colored arrow
  at the viewport edge points to it when it's off-screen.
- **Bottom left** — full team roster (dead pilots grayed out).
- **Bottom right** — minimap of the whole 2796×1290 arena: planet, moon,
  every ship, your viewport rectangle, and a ring on your locked target.

## AI targeting

Every AI pilot runs a targeting computer with **sticky locks**: they keep
their victim until someone else is dramatically closer, so duels persist
instead of everyone re-targeting every second. When an enemy has a lock on
you, the HUD says so — check the minimap and either break the lock behind
the planet or take the fight to them.

## The gravity well

- Ship-to-ship collision: elastic mass-weighted bounce with closing-speed damage — heavy hulls hurt light scouts
- Inverse-square gravity from the planet, plus a moon on a circular orbit —
  shots curve too, so slinging a plasma bolt around the planet is a real tactic.
- The arena wraps (torus), so the shortest path to your enemy may be off-screen
  and back.
- AI pilots predict gravity-warped shot paths, hide behind the planet when
  hurt, and use slingshot waypoints when you're on the far side.
- After ~3 minutes the well starts to **surge** — gravity ramps up ×3 and the
  fight gets desperate. Finish it before the planet eats everyone.
- Each pilot has a personality archetype (Reckless, Cautious, Duelist, Sniper,
  Brawler, Trickster) that shapes aggression, evasion, and special usage.
- When the match is decided, remaining ordnance is defused, the screen does
  **not** shake, and the winners fly AI-piloted **victory laps** around the
  planet while the scoreboard fades in.

## Ships

The **full Super Melee roster — all 25 ships of Star Control II**, each
flying its real sprite with stats pulled from the UQM ship sources (crew,
battery, regen, point costs, weapon damage), its own captain, panel icon
and original weapon sound:

| Ship | Cost | Role | Weapon | Special |
|------|------|------|--------|---------|
| SF-6 Scout | 5 | scout | rapid pecker | glory device (suicide nuke) |
| ZF-10 Stinger | 6 | skirmisher | anti-matter sting | tongue lash (point-blank) |
| UM-10 Drone | 7 | scout | cone zap | retro-propulsion (backward dash) |
| IL-22 Avenger | 10 | ambusher | twin fusion spray | cloak |
| TH-8 Torch | 10 | skirmisher | flame gun | afterburner |
| EC-18 Cruiser | 11 | cruiser | homing MX missiles | point-defense laser |
| VX-20 Intruder | 12 | cruiser | megawatt lance | limpet torpedoes (drag the enemy) |
| SY-12 Penetrator | 13 | boarding | particle beam | psi-mind call (steals crew) |
| AN-20 Guardian | 15 | brawler | acid bubbles | blazer form (invulnerable comet) |
| AR-6 Skiff | 16 | scout | auto gun | teleport |
| SX-12 Blade | 16 | escort | forward gats | vector thrust |
| DR-14 Mauler | 17 | artillery | heavy shell (recoils!) | furnace (burns crew for battery) |
| SL-12 Probe | 18 | interceptor | lightning | vector dash |
| SP-30 Eluder | 18 | skirmisher | front gun | B.U.T.T. missile |
| ME-20 Trader | 18 | artillery | charged orb | mind blast (homing) |
| MM-20 X-Form | 19 | interceptor | twin lasers ⇄ twin torpedoes | transform X/Y |
| PK-8 Fury | 20 | interceptor | triple peck | rebirth |
| MY-20 Podship | 21 | artillery | homing plasma | crew regeneration |
| YE-20 Terminator | 22 | escort | dual guns (rapid) | tactical shield |
| UT-20 Jugger | 22 | escort | forward gat | absorber shield (no regen) |
| OR-16 Nemesis | 23 | boarding | howitzer (rotating turret) | marines |
| CH-42 Avatar | 28 | heavy cruiser | auto laser (continuous) | satellite screen |
| CJ-36 Broodhome | 28 | dreadnought | photon crystal (AoE) | DOGI crystals |
| KH-42 Marauder | 30 | dreadnought | F.R.I.E.D. (expanding ring) | buzzsaw blades |
| UQ-42 Dreadnought | 30 | dreadnought | fusion bolts (rapid, short range) | launch fighters |

### UQ-42 Dreadnought — the real one

The flagship itself, 42 crew and 42 battery straight from urquan.c:

- **Fusion bolts** — rapid, short-range green plasma; your bolts pass through
  your own fighters.
- **Launch Fighters** — each fighter *is a crew member*: launching costs
  1 crew per fighter (two per volley while you have crew to spare) plus 8
  battery. Fighters chase, laser enemies in range, turn for home late in
  their flight, and **dock to refund the crew**. No new volley launches
  while any fighter is airborne.
- Fighters **ricochet off planets and moons** — only enemy weapons kill
  them. Every fighter lost is a permanent crew wound; every docking is a heal.

## Tech

Vanilla JS + HTML5 canvas at 640×360 (camera follows the player across a
2796×1290 world), upscaled with `image-rendering: pixelated`. Every ship
flies its real Star Control II sprite; the corner status panels are the
original melee HUD (animated captain windows, crew as green dots). The
moon is baked per-pixel once at boot. Audio is synthesized WebAudio —
plus the original SC2 melee sounds, including each race's own weapon
sounds (see credits).

## Content & credits

Every match now fights over a random Star Control II world — the actual
planet discs from The Ur-Quan Masters (gas giants, magma worlds, the
Rainbow Worlds…), with palette-cycled flowing animation for the banded
types, the classic SC2 color-table trick. Damage plays the original
tiered melee booms (`boom1/23/45/67`, bigger hits = deeper boom), ship
deaths play `shipdies`, and fighter docking plays the crew-transfer sound.
And the match soundtrack is the real deal: **the original SC2 melee theme
("Attack!" by Dan Nicholson, `battle.mod`) plays on loop**, rendered by
our own [miniprotracker](https://github.com/RhombusMaximus/miniprotracker)
ProTracker player. `N` toggles music, `M` mutes everything.

The corner status panels come straight from the original too: the
animated captain windows and ship stamps are the actual UQM melee HUD
art, and crew is counted out in green dots exactly like 1992.

And with the full roster aboard, every race fires with its own
**original weapon sound** — the actual primary/secondary WAVs straight
from each ship's directory (the Umgah's cone-zap, the Ilwrath cloaking
field, the VUX limpet bite…). Stats come from the UQM ship sources as
well: crew, battery, regen, Super Melee point costs and weapon damage.
And the Pkunk Fury keeps its signature: it taunts mid-battle with the
original 14 combat insults.

**Planet graphics, melee sound effects, ship sprites, music, captain
window animations and panel icons are Star Control II content,
© Toys for Bob, distributed via The Ur-Quan Masters, licensed
CC BY-NC-SA 2.5** — see `assets/LICENSE-content.md`. Everything else in
this repository is MIT. The game is and remains noncommercial.

## License

MIT