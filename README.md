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

| Key                       | Action                     |
| ------------------------- | -------------------------- |
| `ArrowLeft` / `A`         | Rotate counterclockwise    |
| `ArrowRight` / `D`        | Rotate clockwise           |
| `Space` / `Enter`         | Start and restart          |

## Layout

```text
index.html            Canvas, UI overlay, Three.js import map
scripts/dev-server.mjs  Zero-dependency static server
src/
  main.js             Entry point: wires DOM to Game
  styles.css          UI overlay styling
  game/
    Game.js           State machine, scene setup, frame loop
    Input.js          Stateful keyboard handler
```

## Implementation status

Phases follow [docs/main/02_Phased_Implementation_Plan.md](docs/main/02_Phased_Implementation_Plan.md).

- [x] Phase 1 — project skeleton and render loop
- [ ] Phase 2 — input, player model, angular movement
- [ ] Phase 3 — moving tunnel environment
- [ ] Phase 4 — ring obstacles
- [ ] Phase 5 — collision, ring clearing, run end
- [ ] Phase 6 — score, UI overlay, local best
- [ ] Phase 7 — difficulty progression
- [ ] Phase 8 — collectibles and warp meter
- [ ] Phase 9 — visual and audio polish
- [ ] Phase 10 — usability, accessibility, performance
- [ ] Phase 11 — manual QA and release candidate

The scene currently shows a placeholder wireframe ring and an orbiting marker;
Phases 2–4 replace them with the player ship, tunnel, and ring gates.
