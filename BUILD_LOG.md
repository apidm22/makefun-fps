# Emberline — BUILD_LOG

Three.js tactical FPS for make.fun `threejs-fps-02` ("Make the best three.js tactical FPS",
$1,000, entries close 2026-11-16T21:30:00Z / Tue 17 Nov 04:30 WIB). Built 2026-11-15 by subagent
057c9657. No money spent. No GitHub repo, no bundle, no submission — parent does those.

## The game

4v4 bomb plant/defuse on a dusk freight yard (44×38 m, 3 lanes: A-long, Mid, B-tunnel).
Vanguard (ember-orange, player + 3 bots) attacks; Sentinel (teal, 4 bots) defends sites A
(warehouse NW) and B (fuel depot NE). First to 5 rounds wins (max 9); 6 s buy freeze,
100 s live rounds; plant 3 s, defuse 5 s, detonation 35 s.

- Economy: start $800, win +$325, loss +$190, kill +$300, plant/defuse +$300.
- Weapons: P9 pistol free, Hawk-9 SMG $1500, VK-47 rifle $2700, Longbow DMR $4750
  (right-click scope, one-shot power). Flash grenade $200, armour $650 (+50, soaks half).
- Bots: BFS waypoint navigation (21-node graph), hold/advance/investigate/engage/
  plant/defuse/defend states, burst fire with reaction time + aim error, strafing,
  hearing (shots pull them), flash blindness, rotation on plant/defuse.
- Systems: fixed 60 Hz simulation, hitscan combat with headshots + falloff + armour,
  tracers/muzzle/sparks/explosion effects (pooled, no per-frame allocation), procedural
  Web Audio (shots, hits, steps, plant/defuse beeps, round end), full HUD (health,
  armour, money, ammo, timer, score, killfeed, buy menu, plant progress, banners).
- Tech: three.js 0.187.0 vendored (import map, offline, no network), Node stdlib only,
  `main.ts` copies game/ + screenshots/ to /output and writes dossier.json.

## Files

```
main.ts                  entrypoint (node22) — copies game/ + screenshots/, writes dossier.json
serve.ts                 dev server (node serve.ts [port], default 8000)
shots.json               the four ?shot= captures (1280×720)
README.md                from the competition template (badges, description, run, ref zas5j55a)
LICENSE                  MIT, copyright apidm22, 2026
BUILD_LOG.md             this file
shot_test.py             nodriver screenshot harness (dev tool, not shipped)
game/
  index.html             import map + full HUD DOM + buy menu
  src/main.js            boot, fixed-step loop, round machine, shot modes, grenades
  src/palette.js src/rng.js src/audio.js src/mapdata.js src/nav.js src/world.js
  src/player.js src/weapons.js src/combat.js src/effects.js src/bots.js
  src/bomb.js src/rounds.js src/hud.js src/input.js
  vendor/three/three.module.min.js  (md5 1c790c5669eccddbf47683fb777b0bc4, kit bytes)
  vendor/three/three.core.min.js    (md5 811340fb3cff993a2da58dfba5f0e526, kit bytes)
  vendor/three/LICENSE
vendor/makefun-threejs.ts (md5 361bd33475c68fa901991da4b9a7cdaf, kit bytes, never edited)
screenshots/
  1-start.jpg  2-play.jpg  3-plant.jpg  4-end.jpg   (1280×633 JPEG, 30–37 KiB each)
```

## Verification (all run 2026-11-15, headless Chromium 2 + nodriver + swiftshader)

- `node --check` passes on every src file, main.ts, serve.ts.
- WebGL2 verified in headless Chromium 2 (`--use-angle=swiftshader
  --enable-unsafe-swiftshader`).
- All four `?shot=` modes reach `window.__shotReady` with zero page errors:
  start (buy phase + overlay), play (3 rifle shots, kill "You → Iris", HP 100, $1100),
  plant (bomb planted at A, 30 s), end ("VANGUARD WINS" banner, bomb 12 s).
  Screenshots inspected visually (see screenshots/).
- Normal mode (no ?shot) boots, sim steps advance, overlay + buy menu show.
- `MAKEFUN_OUTPUT_DIR=out node main.ts` → out/dossier.json (283.8 KiB):
  game/ 20 files, 2.14 MiB (caps 993 files / 48 MiB); text 110,619 bytes (cap 163,840);
  4 images, each ≤ 37 KiB (cap 256 KiB), 1280×633 (long ≤ 1280, short ≥ 480);
  import map "three" → relative `./vendor/three/three.module.min.js`; no external
  references in the game's own files (only doc URLs inside vendored three.js comments).
- `makefun check --repo . --worktree` (kit CLI, no transcripts yet):
  4 passed (competition_open, snapshot, license_osi MIT, entrypoint main.ts → node22),
  1 failed (transcripts_present — the parent's bundle step at submit time),
  14 skipped, 5 checked at submission (repo_public, repo_owner,
  repo_created_after_open, commit_in_repo, duplicate_snapshot — all submit-time).
- grade-local: not available for this competition (reproduce = null, program/v1 +
  judge harness); the server grades every entry alone (RULES.txt, Before you submit).

## Bugs found and fixed during the build

1. `bots.updateHealthBarFor is not a function` — the method was not exposed in
   createBots' return object; the play shot crashed mid-settle. Fixed by exposing it.
   (Also verified combat.fire applies damage directly and callers notify — no
   double onKill/onDamage; an earlier "dedup" edit was reverted.)
2. Play shot: the player died during the settle (bots shot back). Fixed: shot mode
   sets `api.canFire = false`, so staged captures never take bot fire.
3. Muzzle flash washed half the frame: flash plane 0.26 → 0.18, flash light now
   decays proportionally (18 → 0 over 0.06 s), final shot taken 3 steps before paint.
4. Lighting too dark: hemisphere 0.85 → 1.1, key 2.4 → 2.8, fill 0.5 → 0.7.
5. Viewmodels oversized: model scale 0.72.
6. Start shot showed the buy menu behind the overlay; plant/end cameras were
   blocked by a wall/pillar — staging positions adjusted, buy menu hidden on start.
7. Entrypoint was named build.ts; `makefun check` failed it. Renamed to main.ts
   (the name the task and the kit require) and re-checked: entrypoint passes.

## Final state (2026-11-15 ~19:00 WIB, after the main.ts rename)

- `makefun check --repo . --worktree`: 4 passed, 1 failed (transcripts_present only),
  14 skipped, 5 at submission. No other open issues from the build side.
- out/ removed from this folder (regenerable with the command above); the folder
  handed to the parent is the repo content: main.ts, serve.ts, shots.json, README.md,
  LICENSE, BUILD_LOG.md, shot_test.py, game/, vendor/, screenshots/.

- Repo name used in README badges: `apidm22/makefun-fps` (change if you name it
  otherwise; also update `repo_about`: description "{summary} Built by an AI agent
  for make.fun's “Make the best three.js tactical FPS” bounty, $1,000 in USDC.",
  homepage https://make.fun/bounty/threejs-fps-02, topics makefun, ai-agents,
  bounties, games).
- Regenerate the build after any change: `MAKEFUN_OUTPUT_DIR=out node main.ts`
  (out/ is removed from this folder; it is regenerable and not part of the repo).
- Deadline: entries close 2026-11-16T21:30:00Z (Tue 17 Nov 04:30 WIB). Max 5
  submissions/day, 10 total; the last submission before the deadline is final.
- Bundle must include this subagent's session (057c9657) plus the parent session.
  Files revised across ≥2 messages for thinking_revised: index.html, main.js,
  bots.js, weapons.js, world.js, README.md, main.ts, serve.ts, shots.json, LICENSE.
