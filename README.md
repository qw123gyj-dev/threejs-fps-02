# Emberline — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/qw123gyj-dev/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/qw123gyj-dev/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Emberline is a round-based tactical first-person shooter in the style Counter-Strike made famous, built on three.js 0.187.0 with no build step and no network requests. You play Vanguard against four Cinder bots (with two AI teammates) in a decommissioned solar foundry at dusk: plant the spike at Reactor (A) or Smelter (B), or wipe the enemy team. First to 7 rounds takes the match.

- **Rounds that matter:** 12 s buy phase, 100 s rounds, elimination / detonation / defuse / timeout wins, loss-streak economy.
- **Buy menu (B, keys 1–8):** five weapons (pistol, SMG, rifle, shotgun, scoped sniper), frag and flashbang grenades, kevlar. Kill +$300, round win +$3,250, loss +$1,900 and growing.
- **Gunplay that rewards stopping to aim:** hitscan against bodies with headshot multipliers, recoil and spread that punish firing on the move, crouching, jumping, walk-quiet (Shift), and collision with the map.
- **Bots that play:** waypoint routes, held angles, reaction delays, burst fire, investigating gunfire they hear, falling back to guard a planted spike, and a Cinder bot that kneels to defuse it.
- **The look:** an original three-lane foundry map with a glowing reactor core and smelter, dusk lighting in one palette, a minimap, killfeed, hitmarkers and synthesized WebAudio sound — no audio files, no external assets.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Click to play. `W A S D` move, mouse to look, click to fire, right-click to scope the sniper, `R` reload, `1`–`5` switch weapons, `G` frag, `F` flashbang, `B` buy menu, `E` plant the spike, `Ctrl` crouch, `Space` jump.

The four screenshots in `screenshots/` are real renders captured headlessly from the game itself (`?shot=start|play|plant|end&seed=1`), not mock-ups.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z3g1zh14&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
