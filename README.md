# makefun-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/apidm22/makefun-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/apidm22/makefun-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Emberline — a three.js tactical FPS: 4v4 bomb plant/defuse on a dusk freight yard, with a buy economy, four weapons, flash grenades, and bots that hold, rotate, plant, and defuse.

## How to play

You are Vanguard, the attackers. Plant the charge at site A or B, or eliminate all four Sentinels. First to 5 rounds wins the match (max 9). Each round starts with a 6-second buy phase: P9 pistol is free, Hawk-9 SMG $1500, VK-47 rifle $2700, Longbow DMR $4750 (right-click to scope), flash grenades $200, armour $650. Kills pay $300, planting and defusing pay $300, winning a round pays $325.

Controls: WASD move, mouse look, click fire, R reload, E plant the charge (hold, at a site), G throw flash, B buy menu, 1–4 switch weapon, Ctrl crouch, Space jump.

## Run it

```sh
node serve.ts 8000
# open http://127.0.0.1:8000/
```

Screenshots: open `?shot=start|play|plant|end&seed=42` for the four deterministic captures (see `shots.json`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=zas5j55a&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
