# TunnelWarp - Phased Implementation Plan

This plan turns `00_Concept.md` and `01_Specification.md` into small implementation phases suitable for a coding agent. Each phase should leave the game in a runnable state, with the ring-survival loop as the primary design anchor and score, collectibles, and warp layered in after the core loop is stable.

## Product Decisions For V1

- Primary objective: clear as many rings as possible, with Ring 66 as the top achievement.
- Primary obstacle: circular ring gates with one or more angular gaps.
- Player representation: a small UFO or glowing ship marker riding near the tunnel wall.
- Controls: keyboard only for first version, using `ArrowLeft` / `A`, `ArrowRight` / `D`, and `Space` / `Enter` for start and restart.
- Warp mechanic: deferred until the core ring game is playable, then added as a complete first-version feature if time allows.
- Platform: desktop browser, no server-side code, no required build step unless the implementation chooses a lightweight local dev server for module loading.

## Phase 1 - Static Project Skeleton And Render Loop

Goal: create a minimal browser app that opens, renders a Three.js scene, and runs a stable frame loop.

Implementation tasks:

- Create the project structure:
  - `index.html`
  - `src/styles.css`
  - `src/main.js`
  - `src/game/Game.js`
  - `src/game/Input.js`
- Load Three.js as an ES module, either from a CDN or local package, using the simplest approach for the project.
- Add a full-window WebGL canvas and a lightweight HTML UI overlay.
- Implement `Game` with these states:
  - `loading`
  - `ready`
  - `playing`
  - `gameOver`
  - `victory`
- Add a `requestAnimationFrame` loop with clamped delta time.
- Initialize a `Scene`, `PerspectiveCamera`, and `WebGLRenderer`.
- Handle browser resize by updating renderer size and camera aspect ratio.
- Add placeholder lighting and a simple visible test object so rendering can be verified.

Acceptance criteria:

- Opening the app shows a non-blank 3D scene.
- The render loop runs continuously without console errors.
- Resizing the browser keeps the scene correctly framed.
- Pressing `Space` or `Enter` changes the state from `ready` to `playing`.

## Phase 2 - Input, Player Model, And Angular Movement

Goal: make the player controllable around the circular tunnel cross-section.

Implementation tasks:

- Implement `Input` as a stateful keyboard handler:
  - Track left and right movement keys.
  - Track start/restart action keys.
  - Avoid repeated start/restart firing from held keys.
- Create `src/game/Player.js`.
- Represent player position using:
  - `theta`, the angular position around the tunnel.
  - fixed `radius`, matching the playable tunnel wall radius.
  - fixed `z`, near the camera.
- Convert polar tunnel coordinates to Three.js coordinates with a shared helper, such as:
  - `x = Math.cos(theta) * radius`
  - `y = Math.sin(theta) * radius`
  - `z = playerZ`
- Add smooth angular acceleration or direct angular velocity.
- Wrap `theta` cleanly across `0` and `2 * Math.PI`.
- Render the player as a simple UFO-like mesh or glowing marker.
- Add a small visual forward/chase offset so the player remains readable against the tunnel.

Acceptance criteria:

- In `playing`, left/right keys rotate the player around the tunnel wall.
- Movement feels responsive and wraps continuously around the circle.
- The player cannot leave the intended radius.
- Player update logic is independent from Three.js mesh details.

## Phase 3 - Moving Tunnel Environment

Goal: create the illusion of fast forward travel through a readable neon tunnel.

Implementation tasks:

- Create `src/game/Tunnel.js`.
- Build the tunnel from repeated ring or cylinder-segment meshes along the Z axis.
- Move tunnel segments toward the camera based on current game speed.
- Recycle segments that pass behind the player to the far end of the tunnel.
- Add high-contrast materials that make forward motion readable:
  - dark base tunnel
  - bright grid/ring accents
  - subtle color shift as speed rises
- Keep decorative detail sparse enough that obstacle gaps remain obvious.
- Expose a `setSpeed(speed)` or equivalent method so difficulty can control perceived motion.

Acceptance criteria:

- The tunnel appears to move continuously toward the player.
- Tunnel recycling is seamless enough for an arcade prototype.
- The player remains visible against the background.
- No objects grow unbounded over time.

## Phase 4 - Ring Obstacle Data Model And Rendering

Goal: spawn visible ring gates ahead of the player, each with a safe gap.

Implementation tasks:

- Create `src/game/Obstacles.js`.
- Define a ring obstacle data shape:
  - unique id
  - `z`
  - `radius`
  - `thickness`
  - `gapCenterTheta`
  - `gapWidth`
  - `rotationSpeed`
  - `passed`
- Render each ring as blocked angular segments rather than a full solid ring.
- For the first implementation, approximate blocked arcs with box or wedge-like meshes placed around the circumference.
- Divide the tunnel into a fixed number of angular lanes, such as 16 or 24, to simplify rendering and collision.
- Spawn obstacles far ahead of the player at regular Z spacing.
- Move obstacles toward the player using the current forward speed.
- Remove or recycle obstacles after they pass behind the player.
- Start with one gap per ring and no rotation.

Acceptance criteria:

- Ring obstacles appear ahead and move toward the player.
- Each ring has at least one visible safe gap.
- Obstacles are removed or recycled after passing the player.
- The spawn system never creates an impossible fully blocked ring.

## Phase 5 - Collision, Ring Clearing, And Run End

Goal: complete the minimum playable ring-survival loop.

Implementation tasks:

- Create `src/game/Collision.js`.
- Implement angular math helpers:
  - normalize an angle to `0..2 * Math.PI`
  - calculate shortest angular distance between two angles
  - test whether an angle is inside a gap
- Detect collision when:
  - an obstacle's Z range overlaps the player Z range
  - the player's angle is outside the obstacle's safe gap
- Mark a ring as passed when it moves behind the player without collision.
- Increment `ringsCleared` on pass.
- End the run immediately on collision.
- Add restart behavior from `gameOver` without reloading the page.
- Add Ring 66 victory behavior:
  - enter `victory` state
  - show a celebratory message
  - allow restart

Acceptance criteria:

- Passing through a gap increments the ring counter once.
- Hitting a blocked ring ends the run.
- Collision works correctly near the `0` / `2 * Math.PI` angle boundary.
- Restart resets player position, obstacles, speed, and score state.
- Reaching Ring 66 ends in a victory state or clearly marked jackpot state.

## Phase 6 - Score, UI Overlay, And Local Best

Goal: add the required arcade feedback and persistent best result.

Implementation tasks:

- Create `src/game/Score.js`.
- Track:
  - rings cleared
  - distance score or total score
  - best rings cleared
  - optional best score
- Use `localStorage` for persistence.
- Wrap storage access in `try/catch` so the game still works if storage is unavailable.
- Update the UI overlay with:
  - current rings cleared
  - current score
  - best rings cleared
  - start prompt in `ready`
  - game over result
  - Ring 66 victory result
- Add reward-tier labels based on ring milestones:
  - Ring 10: small reward
  - Ring 30: medium reward
  - Ring 66: jackpot
- Keep UI readable over the canvas at common desktop sizes.

Acceptance criteria:

- The UI always reflects the current game state.
- Best result persists across reloads in the same browser.
- The game remains playable if `localStorage` throws.
- Start, game over, and victory states are understandable without a separate tutorial screen.

## Phase 7 - Difficulty Progression

Goal: make runs escalate smoothly from welcoming early rings to demanding late rings.

Implementation tasks:

- Add a difficulty model driven primarily by `ringsCleared`.
- Scale forward speed gradually, with milestone boosts every 5 to 10 rings.
- Scale ring spawn spacing so reaction time tightens but remains fair.
- Scale gap width downward over time within safe limits.
- Introduce rotating rings after the early tutorial range, for example after Ring 8.
- Add narrow-gap rings after the player has seen standard rotating rings, for example after Ring 18.
- Add double-gap rings later for variety, for example after Ring 28.
- Keep Ring 1 through Ring 5 nearly trivial:
  - wide gaps
  - no rotation
  - slower speed
- Cap difficulty values near the Ring 66 target so the game stays hard but readable.

Acceptance criteria:

- Early rings are easy enough to teach the mechanic.
- Mid-game rings introduce rotation and narrower gaps gradually.
- Later rings require quicker angular movement but still expose a possible path.
- No generated ring is unfair because of impossible gap size, unreadable spacing, or excessive rotation.

## Phase 8 - Collectibles And Warp Meter

Goal: add the complete first-version warp energy layer without destabilizing the core ring loop.

Implementation tasks:

- Create `src/game/Collectibles.js`.
- Spawn warp energy pickups at reachable angular positions between rings.
- Ensure collectibles are not placed inside blocked ring segments at the same Z range.
- Add collection detection using angular and Z overlap checks.
- Increase score and fill a warp meter on collection.
- Add a UI warp meter.
- Allow `Space` during `playing` to activate warp only when the meter is full.
- During warp:
  - set a fixed duration
  - drain or reset the meter
  - make the player invulnerable to obstacle collision
  - increase visual intensity
- Ensure `Space` still starts/restarts the game in `ready`, `gameOver`, and `victory`.

Acceptance criteria:

- Collectibles can be collected reliably without mesh-precision issues.
- Warp activation is impossible until the meter is full.
- During warp, obstacle collisions do not end the run.
- Warp clearly starts and ends through UI and visual feedback.
- The game remains fully playable if the player ignores collectibles.

## Phase 9 - Visual And Audio Polish

Goal: make the prototype feel like a fast redemption-arcade tunnel game.

Implementation tasks:

- Replace placeholder player mesh with a simple UFO silhouette or polished glowing ship marker.
- Add a short trail behind the player.
- Add ring-clear feedback:
  - flash or pulse on the cleared ring
  - brief UI bump
  - optional chime
- Add collision feedback:
  - quick camera shake
  - burst or flash
  - punchy failure sound
- Add milestone feedback at Rings 10, 30, and 66.
- Add optional browser audio using Web Audio or simple audio elements:
  - collection sound
  - ring clear sound
  - warp activation sound
  - collision sound
- Gate audio startup behind first user interaction.
- Add a mute toggle if audio is present.

Acceptance criteria:

- Visual polish improves readability rather than obscuring gaps.
- Audio never attempts to autoplay before user interaction.
- Ring 66 has a distinct celebration moment.
- The game still performs smoothly with effects enabled.

## Phase 10 - Usability, Accessibility, And Performance Pass

Goal: harden the game for repeated desktop browser play.

Implementation tasks:

- Pause or suspend gameplay updates when the tab loses focus.
- Add a reduced-motion mode or respect `prefers-reduced-motion` by reducing:
  - camera shake
  - tunnel distortion
  - extreme warp effects
- Verify color contrast between:
  - tunnel background
  - obstacles
  - gap regions
  - player
  - collectibles
  - UI text
- Add object pooling for obstacle and collectible meshes if profiling shows avoidable allocation churn.
- Avoid per-frame creation of vectors, materials, geometries, and arrays in hot paths.
- Test at common viewport sizes:
  - 1366 x 768
  - 1440 x 900
  - 1920 x 1080
- Check that keyboard controls do not scroll the page during play.
- Confirm restart works after multiple runs.

Acceptance criteria:

- The game remains near 60 FPS on a typical desktop browser.
- UI text does not overlap or become unreadable at tested viewport sizes.
- Multiple restarts do not leak visible objects or duplicate input handlers.
- Reduced motion mode keeps the game playable.

## Phase 11 - Manual QA Checklist And Release Candidate

Goal: verify the complete first version against the docs and prepare it for handoff.

Implementation tasks:

- Run through a minimum-playable checklist:
  - page loads
  - tunnel renders
  - player moves
  - rings spawn
  - collision ends run
  - rings cleared increments
  - restart works
  - resize works
- Run through a complete-first-version checklist:
  - best result persists
  - difficulty ramps
  - collectibles work
  - warp meter works
  - warp invulnerability works
  - visual feedback works
  - audio works if implemented
- Verify edge cases:
  - collision near angle wrap boundary
  - game over during warp
  - restart immediately after game over
  - tab switch during play
  - localStorage unavailable
- Fix any console warnings or errors.
- Update documentation if the final implementation differs from this plan or the specification.

Acceptance criteria:

- The game satisfies the minimum playable version from the specification.
- The game satisfies the complete first version unless explicitly scoped down.
- Any deferred features are listed clearly in documentation.
- The codebase is ready for another agent to continue from a known-good state.

## Suggested Agent Execution Order

For best results, assign one coding agent phase at a time. Each phase should start by running the app in its current state, then implement only the scoped tasks, then verify the phase acceptance criteria before moving on.

Recommended checkpoints:

1. After Phase 3: visual prototype checkpoint.
2. After Phase 5: minimum playable game checkpoint.
3. After Phase 8: complete mechanics checkpoint.
4. After Phase 11: release candidate checkpoint.

