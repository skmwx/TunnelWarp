# TunnelWarp

A browser-based arcade tunnel-flight game built with HTML, CSS, JavaScript, and Three.js.
Design docs live in [docs/main/](docs/main/).

## Running

ES modules cannot load over `file://`, so the game must be served over HTTP.
There is no build step and no npm dependencies.

```bash
npm start          # or: node scripts/dev-server.mjs [port]
```

Then open <http://localhost:5173/>.

Three.js is loaded from a CDN via the import map in [index.html](index.html), so
the first load needs network access.

## Controls

| Key                | Action                             |
| ------------------ | ---------------------------------- |
| `ArrowLeft` / `A`  | Rotate left around the tunnel wall |
| `ArrowRight` / `D` | Rotate right                       |
| `Space` / `Enter`  | Start and restart                  |

The ship rides the wall like a clock hand, so a direction key always turns the
same way around the tube. The mapping is anchored to the starting pose: from the
bottom of the tunnel, right moves the ship toward the right of the screen.

## Browser automation (Playwright MCP)

[.mcp.json](.mcp.json) registers a project-scoped Playwright MCP server so Claude
Code can drive the game in a real browser — navigate, press keys, screenshot,
read console output. It runs Playwright's bundled Chromium.

Start the dev server first, then point the browser at <http://localhost:5173/>.
Browser binaries install with:

```bash
npx playwright@1.62.0-alpha-1783623505000 install chromium
```

That version matches `@playwright/mcp@0.0.78`'s pinned Playwright. If you bump
the MCP version in [.mcp.json](.mcp.json), re-run the install for the new one.

## Layout

```text
index.html            Canvas, UI overlay, Three.js import map
.mcp.json             Playwright MCP server for browser automation
scripts/dev-server.mjs  Zero-dependency static server
src/
  main.js             Entry point: wires DOM to Game
  styles.css          UI overlay styling
  game/
    Game.js           State machine, scene setup, frame loop
    Input.js          Stateful keyboard handler
    Player.js         Angular player state + UFO mesh
    Tunnel.js         Scrolling tunnel shell: wall, rails, recycling hoops
    Obstacles.js      Ring gate spawning, motion, recycling, and meshes
    Difficulty.js     The ramp: speed, spacing, gap width, rotation, variants
    Collision.js      Angular math, ring clearing, and run-ending hits
    Score.js          Run scoring, reward tiers, persistent local best
    constants.js      Shared world, player, gate, score, and camera tuning
    tunnelMath.js     Polar helpers and framerate-independent easing
```

## Implementation status

Phases follow [docs/main/02_Phased_Implementation_Plan.md](docs/main/02_Phased_Implementation_Plan.md).

- [x] Phase 1 — project skeleton and render loop
- [x] Phase 2 — input, player model, angular movement
- [x] Phase 3 — moving tunnel environment
- [x] Phase 4 — ring obstacles
- [x] Phase 5 — collision, ring clearing, run end
- [x] Phase 6 — score, UI overlay, local best
- [x] Phase 7 — difficulty progression
- [ ] Phase 8 — collectibles and warp meter
- [ ] Phase 9 — visual and audio polish
- [ ] Phase 10 — usability, accessibility, performance
- [ ] Phase 11 — manual QA and release candidate

The ring-survival loop is playable end to end: gates spawn ahead with a safe
gap, flying through one increments the ring counter, clipping one ends the run,
and clearing 66 wins. Difficulty now ramps across a run — see below. Warp energy
and the warp meter arrive in Phase 8.

## Difficulty

Every gate is planned from the ring number it will be when the player reaches
it, so its width, spacing and rotation are fixed the moment it spawns and never
shift mid-approach. The curves live in [Difficulty.js](src/game/Difficulty.js)
and are tuned by `DIFFICULTY` in [constants.js](src/game/constants.js).

| Ring | Speed | Reaction window | Gap | New this stretch     |
| ---- | ----- | --------------- | --- | -------------------- |
| 1–5  | 26/s  | 1.40s           | 120° | tutorial: nothing moves |
| 9+   | ~31/s | 1.35s           | 120° | rotating gates       |
| 19+  | ~39/s | 1.22s           | 105° | narrow gates         |
| 29+  | ~49/s | 1.09s           | 90°  | double-gap gates     |
| 58+  | 74/s  | 0.72s           | 60°  | every curve capped   |

Spacing is derived from the reaction window rather than tuned directly, so as
the ship speeds up the gates spread further apart in Z while still arriving
sooner. Speed itself is a smooth ramp plus a step every 7 rings, and `Game`
eases toward it, which turns each step into a surge rather than a jolt.

Generation is chained so a run is always flyable: a gate's gap is placed within
the angular distance the ship could cover since the previous gate, measured at
*arrival* — a rotating gate is aimed at where its gap will have drifted to, so
spin is a tracking problem and never an unreachable one. The chain tracks every
opening of the previous gate, not just the one it aimed at, so taking the near
gap of a double gate can never strand the player; when no split satisfies that,
the gate falls back to a single opening.

Verified by simulation: a perfect autopilot cleared 60/60 generated runs to Ring
66, while a pilot capped at a 200ms reaction delay never died before Ring 10 and
reached a median of Ring 25.

## Scoring

Rings cleared are the run's result; the score ranks two runs that ended on the
same ring. Both are tracked against their own best, so a long cautious run and a
short lucky one each keep their record — see [Score.js](src/game/Score.js).

| Source          | Points                                    |
| --------------- | ----------------------------------------- |
| Distance flown  | 1 per world unit (26/s at launch, 74/s capped) |
| Gate cleared    | 250                                       |
| Ring 10 — small prize | 1,000 bonus                         |
| Ring 30 — big prize   | 5,000 bonus                         |
| Ring 66 — jackpot     | 25,000 bonus                        |

The best result is stored in `localStorage` under `tunnelwarp.best.v1`. Storage
is probed with a real write at startup, because private-browsing modes hand back
a storage object that only throws on use. Every read and write is guarded: if
storage is unavailable, corrupt, or refuses writes, the run is unaffected, the
best still tracks within the session, and the start screen says it will not be
saved.

Collision is polar arithmetic, not mesh intersection — see
[Collision.js](src/game/Collision.js). A gate is a Z band plus one or more gap
centres and widths and a rotation; the ship is a fixed Z with an angular and a
depth half-extent from
`COLLISION` in [constants.js](src/game/constants.js). Gates are tested against
the Z span they swept during the frame, so a long frame cannot let one jump the
ship.
