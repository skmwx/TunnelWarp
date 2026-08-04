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
    constants.js      Shared world, player, and camera tuning
    tunnelMath.js     Polar helpers and framerate-independent easing
```

## Implementation status

Phases follow [docs/main/02_Phased_Implementation_Plan.md](docs/main/02_Phased_Implementation_Plan.md).

- [x] Phase 1 — project skeleton and render loop
- [x] Phase 2 — input, player model, angular movement
- [ ] Phase 3 — moving tunnel environment
- [ ] Phase 4 — ring obstacles
- [ ] Phase 5 — collision, ring clearing, run end
- [ ] Phase 6 — score, UI overlay, local best
- [ ] Phase 7 — difficulty progression
- [ ] Phase 8 — collectibles and warp meter
- [ ] Phase 9 — visual and audio polish
- [ ] Phase 10 — usability, accessibility, performance
- [ ] Phase 11 — manual QA and release candidate

The player ship flies the tunnel wall, but the environment is still a row of
placeholder wireframe rings used as a depth reference; Phases 3–4 replace them
with the moving tunnel and ring gates.
