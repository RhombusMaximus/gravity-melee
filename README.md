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
| [ / ] | volume down / up |
| - / = | simulation speed ×0.25 … ×4 |

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

## Roadmap

- **Online multiplayer** — next phase (WebRTC peer-to-peer or lightweight
  relay; the sim is already deterministic-ish per fixed-step)
- Persistent pilot records (kills per archetype)

## HUD

- **Upper left** — your ship: pilot, crew, battery, special readiness, and a
  subtle amber warning when enemy targeting computers have a lock on you.
- **Upper right** — your current target: pilot, ship class, hull, battery,
  range and closing speed.
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

| Ship | Cost | Role | Weapon | Special |
|------|------|------|--------|---------|
| SC-1 Sparrow | 14 | scout | rapid pulse darts | afterburner |
| TK-4 Vanguard | 19 | cruiser | auto bolt | aegis bubble (brief invulnerability) |
| HR-9 Colossus | 28 | dreadnought | siege plasma (AoE) | grav pulse (radial shove) |
| XT-3 Mantis | 21 | skirmisher | 3-shot fragment volley | homing seeker pod |
| NV-2 Wisp | 23 | artillery | slow heavy lob | blink teleport |
| RX-5 Bastion | 20 | mine layer | point-defense pellet | sting mines |
| UQ-42 Kzer-Za | 30 | dreadnought | fusion bolts (rapid, short range) | launch fighters |
| KH-42 Marauder | 30 | dreadnought | F.R.I.E.D. (expanding ring) | buzzsaw blades |
| CH-42 Avatar | 28 | heavy cruiser | auto laser (continuous) | satellite screen |
| YE-20 Terminator | 22 | escort | dual guns (rapid) | tactical shield |
| SL-12 Probe | 18 | interceptor | lightning | vector dash |

### UQ-42 Kzer-Za — the Dreadnought clone

A faithful homage to the Ur-Quan Dreadnought, tuned to the original binary's
numbers (42 crew, 42 battery):

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
2796×1290 world), upscaled with `image-rendering: pixelated`. Ships are
13×12 pixel-art string maps rendered at 2×; the moon is baked per-pixel
once at boot. Audio is synthesized WebAudio — plus the original Star
Control II melee sounds (see credits).

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

**Planet graphics and melee sound effects are Star Control II content,
© Toys for Bob, distributed via The Ur-Quan Masters, licensed
CC BY-NC-SA 2.5** — see `assets/LICENSE-content.md`. Everything else in
this repository is MIT. The game is and remains noncommercial.

## License

MIT