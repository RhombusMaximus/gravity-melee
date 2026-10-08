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

| Key | Mode |
|-----|------|
| 1 | 1 v 1 |
| 2 | 2 v 2 |
| 3 | 3 v 3 v 3 |

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
- Ship-select screen & team building
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

| Ship | Role | Weapon | Special |
|------|------|--------|---------|
| SC-1 Sparrow | scout | rapid pulse darts | afterburner |
| TK-4 Vanguard | cruiser | auto bolt | aegis bubble (brief invulnerability) |
| HR-9 Colossus | dreadnought | siege plasma (AoE) | grav pulse (radial shove) |
| XT-3 Mantis | skirmisher | 3-shot fragment volley | homing seeker pod |
| NV-2 Wisp | artillery | slow heavy lob | blink teleport |
| RX-5 Bastion | mine layer | point-defense pellet | sting mines |

## Tech

Vanilla JS + HTML5 canvas at 640×360 (camera follows the player across a
2796×1290 world), upscaled with `image-rendering: pixelated`. Ships are
13×12 pixel-art string maps rendered at 2×; the planet/moon are baked
per-pixel once at boot. Audio is synthesized WebAudio — zero assets anywhere.

## License

MIT