# Emberline — design notes

Original tactical FPS for make.fun threejs-fps-02. CS-style, never a copy: own map
(Emberline Works foundry), own names (Vanguard vs Cinder, Reactor/Smelter, VK-47
Longshot, Heron .50, P9 Sparrow, Kestrel-9, Mule-12), own art (procedural boxes,
one dusk palette) and own sounds (synthesized WebAudio, no files).

## Layout

- `game/index.html` — import map (`three` → vendored 0.187.0), full HUD DOM.
- `game/src/palette.js` — the one colour plan.
- `game/src/world.js` — map geometry, colliders, sites A/B, spawns, waypoint graph
  (24 nodes, BFS paths), lighting.
- `game/src/player.js` — `createMover` (AABB collision, accel/friction/gravity/
  crouch/jump) shared by the player and every bot; `createPlayer` wraps it.
- `game/src/weapons.js` — weapon table (5 guns) + grenades + armor, view model,
  fire/reload/spread.
- `game/src/combat.js` — the one place that resolves shots (player raycast vs
  torso/head meshes), damage + armor, pooled tracers, grenade physics, spike
  state machine (carried/dropped/planted/defused/detonated).
- `game/src/bots.js` — 6 bots (2 Vanguard teammates, 4 Cinder): routes, holds,
  vision + reaction delay, burst fire with aim error, hearing, spike carrier
  planting, closest-bot defuse.
- `game/src/rounds.js` — buy (12 s) → live (100 s) → end (4 s); first to 7,
  max 13 rounds; elimination/detonation/defuse/timeout.
- `game/src/economy.js` — $800 start, kill +$300, win +$3,250, loss +$1,900
  (+$500 per consecutive loss, cap $3,400), plant +$300.
- `game/src/hud.js` — health/ammo/money/timer/score/alive, killfeed, minimap
  (canvas 2D), buy menu (click or keys 1–8), spike bar, banners.
- `game/src/input.js` — keys/mouse/pointer lock + `pressed()` rising edges.
- `game/src/audio.js` — synthesized SFX, no files.
- `game/src/main.js` — boot, fixed 60 Hz sim, render loop, `?shot=` captures.
- `main.ts` — copies game/ + screenshots/ to /output, writes dossier.json.
- `serve.ts` — static dev server on :8080. `shots.json` — the 4 captures.

## Balance notes

- Bots: reaction 0.35–0.7 s, hit chance ~0.45 at close range falling with
  distance/movement, rifle 24 dmg, headshots ×2. Tuned so a moving player who
  uses cover wins duels; standing still in the open dies fast.
- Player starts with Sparrow + Longshot and $800; reserve ammo refills free at
  each round start (no soft-lock).
- Spike: player carries it each round; if the player dies it drops and a
  Vanguard teammate can pick it up and plant it.

## Verified

- `node --check` clean on all 12 modules.
- Logic tests (`../fps-test/logic.mjs`, 7 groups): shooting/headshots, armor,
  spike plant/fuse/detonate, defuse, grenades, round flow, economy — all pass.
- Headless Chromium play-test (`../fps-test/playtest.mjs`): pointer lock,
  buy menu (keyboard 1–8, deny when broke), firing consumes ammo, bots hold
  during buy and fight when live, round ends, next round respawns, economy
  pays out. No console/page errors (only the favicon 404, which is the
  browser's own request, not a game reference).
- Screenshots (`../fps-test/shots.mjs`): 4 real renders, 1280×720 JPEG,
  35–43 KiB each, via `?shot=start|play|plant|end&seed=1`.
- `MAKEFUN_OUTPUT_DIR=out node main.ts`: dossier 306,618 bytes (cap 1.5 MiB),
  text 93,239 chars (cap 163,840 — all source included, nothing cut),
  game/ 2.3 MiB (cap 48 MiB).
