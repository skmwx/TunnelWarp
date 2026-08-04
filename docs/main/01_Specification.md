# TunnelWarp - Combined Functional and Technical Specification

## 1. Purpose

TunnelWarp is a simple browser-based 3D arcade game built with HTML, JavaScript, and Three.js. The player pilots through a fast-moving tunnel, dodging obstacles and collecting warp energy while the game steadily increases in speed and intensity.

This specification is based on `00_Concept.md`. At the time of writing, that concept file is empty, so this document establishes a practical baseline design inferred from the project name and requested technology stack.

## 2. Game Summary

TunnelWarp is an endless tunnel runner. The player remains near the camera while the tunnel, obstacles, and collectibles move toward them. The core challenge is quick lateral movement around the inside of the tunnel while maintaining awareness of upcoming hazards.

The game should be immediately playable on load, easy to understand without tutorial text, and satisfying in short sessions.

## 3. Target Platform

- Desktop web browsers.
- Modern Chromium, Firefox, and Safari.
- Keyboard-first controls.
- Optional touch or pointer controls may be added later, but are not required for the first version.

## 4. Core Gameplay

### 4.1 Objective

The player tries to survive as long as possible while earning points by:

- Traveling distance through the tunnel.
- Collecting warp energy.
- Avoiding obstacles.

The run ends when the player collides with an obstacle.

### 4.2 Player Movement

The player moves around the circular cross-section of the tunnel.

Required controls:

- `ArrowLeft` or `A`: rotate/move counterclockwise around the tunnel.
- `ArrowRight` or `D`: rotate/move clockwise around the tunnel.
- `Space`: start game, restart after game over, or trigger warp if warp is implemented.

Movement should feel responsive and smooth. The player should not leave the tunnel path.

### 4.3 Tunnel

The tunnel is a cylindrical or ring-based 3D environment rendered in perspective.

Required behavior:

- The tunnel appears to move continuously toward the player.
- The tunnel should have repeated visual segments so forward motion is readable.
- Colors, lighting, or segment spacing may shift as speed increases.
- The visual design should support obstacle readability before decorative effects.

### 4.4 Obstacles

Obstacles spawn ahead of the player and move toward the camera.

Required behavior:

- Obstacles occupy angular lanes or arcs inside the tunnel.
- The player must rotate around the tunnel to avoid blocked sections.
- Colliding with an obstacle ends the run.
- Obstacles become more frequent or harder to avoid as the score increases.

Obstacle examples:

- Radial wall segments that block part of the tunnel.
- Rotating gates with one or more safe gaps.
- Floating blocks positioned along the tunnel wall.

The first version may use one obstacle type if it supports the full gameplay loop.

### 4.5 Collectibles

Warp energy collectibles are optional for the absolute minimum version, but expected for the complete first playable version.

Required behavior if implemented:

- Collectibles spawn in reachable positions along the tunnel.
- Collecting one increases score and/or fills a warp meter.
- Collectibles should never be placed inside unavoidable obstacle collisions.

### 4.6 Warp Mechanic

The game may include a simple warp mechanic to match the title.

Recommended first-version behavior:

- Collecting enough warp energy fills a warp meter.
- Pressing `Space` while the meter is full activates warp.
- Warp lasts for a short fixed duration.
- During warp, the player is temporarily invulnerable or can pass through obstacles.
- Warp increases visual intensity, such as speed lines, color shifts, or tunnel distortion.

If warp is deferred, `Space` should be used only for start and restart.

### 4.7 Scoring

The score increases over time based on distance traveled.

Additional scoring:

- Collecting warp energy grants bonus points.
- Passing obstacles may grant bonus points.

The game should display:

- Current score.
- Best score for the current browser using `localStorage`.
- Warp meter if the warp mechanic is implemented.

### 4.8 Difficulty Progression

Difficulty increases gradually during a run.

Progression may affect:

- Forward speed.
- Obstacle spawn rate.
- Obstacle size.
- Number of blocked tunnel sections.
- Frequency of rotating or moving obstacles.

Difficulty should ramp smoothly and remain fair. The player should always have a possible path through generated obstacles.

## 5. Game States

The game uses a small finite state machine.

### 5.1 Loading

Initial assets and Three.js scene are prepared. Since the first version should use procedural geometry and simple materials, this state should be brief.

### 5.2 Ready

The game is visible but not running. The player can start with `Space`, `Enter`, or a start button.

### 5.3 Playing

The game loop updates movement, spawning, collision detection, score, difficulty, and rendering.

### 5.4 Warping

Optional temporary sub-state while warp is active. This can be represented as part of the playing state with a countdown timer.

### 5.5 Game Over

The run has ended. The UI shows final score and best score. The player can restart without reloading the page.

## 6. User Interface

The UI should be lightweight and readable over the 3D scene.

Required UI:

- Score display.
- Best score display.
- Start/restart affordance.
- Game over message.

Optional UI:

- Warp meter.
- Pause indicator.
- Simple settings button for sound or graphics quality.

UI should be built with standard HTML/CSS layered over the WebGL canvas.

## 7. Visual Direction

TunnelWarp should feel fast, clean, and energetic.

Recommended direction:

- Dark tunnel interior with high-contrast obstacle colors.
- Bright accent colors for collectibles and warp effects.
- Subtle glow-style materials where practical, without sacrificing performance.
- Camera locked forward with slight shake or FOV changes during warp.

Avoid making the tunnel so visually busy that obstacles are hard to read.

## 8. Audio

Audio is optional for the first version.

If included, use simple browser audio:

- Collection sound.
- Collision sound.
- Warp activation sound.
- Subtle looping ambience or movement pulse.

Audio must start only after user interaction to comply with browser autoplay restrictions.

## 9. Technical Architecture

### 9.1 Technology Stack

- HTML for document structure and UI overlay.
- CSS for layout and visual styling.
- JavaScript for game logic.
- Three.js for 3D rendering.

No build step is required for the simplest version. The project may use ES modules and import Three.js from a package or CDN depending on the final project setup.

### 9.2 Suggested File Structure

```text
index.html
src/
  main.js
  game/
    Game.js
    Input.js
    Tunnel.js
    Player.js
    Obstacles.js
    Collectibles.js
    Collision.js
    Score.js
  styles.css
```

For a very small implementation, modules may be combined, but the code should still separate rendering setup, input, game state, spawning, and collision logic.

### 9.3 Rendering

The Three.js scene should include:

- `WebGLRenderer`.
- `PerspectiveCamera`.
- Main `Scene`.
- Tunnel geometry, likely built from repeated rings or cylinder segments.
- Player marker or ship.
- Obstacle meshes.
- Collectible meshes.
- Basic lighting if using lit materials.

The renderer must resize with the browser window and update camera aspect ratio accordingly.

### 9.4 Coordinate Model

Recommended coordinate model:

- The tunnel extends along the negative or positive Z axis.
- The player remains near a fixed Z position close to the camera.
- Obstacles and collectibles spawn at distant Z positions and move toward the player.
- Player position is represented primarily as an angle around the tunnel radius.

This keeps movement and collision logic simple:

- Player angle: `playerTheta`.
- Player radius: fixed tunnel radius.
- Object angle: `objectTheta`.
- Object Z position: updated each frame.
- Collision occurs when Z ranges overlap and angular distance is below a configured threshold.

### 9.5 Game Loop

Use `requestAnimationFrame`.

Each frame should:

1. Calculate delta time.
2. Read input state.
3. Update player angle.
4. Update speed and difficulty.
5. Spawn obstacles and collectibles as needed.
6. Move active objects.
7. Recycle or remove objects behind the player.
8. Check collisions and collections.
9. Update score and UI.
10. Render the scene.

Delta time should be clamped to avoid large jumps after tab switching.

### 9.6 Spawning

The spawn system should:

- Spawn objects far enough ahead that the player can react.
- Use difficulty settings to determine spacing and complexity.
- Ensure at least one safe route exists.
- Avoid overlapping collectibles with obstacles.

For the first version, use deterministic lane-based spawning around the tunnel. For example, divide the tunnel into 12 angular lanes and block a subset of lanes per obstacle row.

### 9.7 Collision Detection

Collision detection can use simplified math instead of Three.js mesh intersection.

Recommended approach:

- Track each obstacle's Z range.
- Track each obstacle's angular coverage.
- Compare player angle to obstacle angular coverage when the obstacle reaches the player's Z range.
- Normalize angular differences across the `0` to `2 * Math.PI` wrap boundary.

This approach is easier to tune and more reliable than relying on visual mesh bounds.

### 9.8 Persistence

Use `localStorage` to save:

- Best score.
- Optional settings such as muted audio.

The game must still work if `localStorage` is unavailable.

### 9.9 Performance

The game should target 60 FPS on typical desktop browsers.

Performance guidelines:

- Reuse meshes where practical.
- Remove or pool objects that move behind the player.
- Keep geometry simple.
- Avoid expensive per-frame allocations.
- Use simple materials before post-processing.

## 10. Accessibility and Usability

Required:

- Keyboard controls.
- Clear contrast between player, obstacles, collectibles, and tunnel.
- Game can be restarted without refreshing the page.
- UI text remains readable at common browser sizes.

Recommended:

- Pause when the browser tab loses focus.
- Allow reduced motion mode by reducing camera shake and extreme warp effects.
- Provide a mute toggle if audio is implemented.

## 11. Minimum Playable Version

The minimum playable version is complete when:

- The page loads a Three.js tunnel scene.
- The player can move around the tunnel with keyboard input.
- Obstacles spawn and move toward the player.
- Collision ends the run.
- Score increases during play.
- The player can restart after game over.
- The game adapts to browser window resizing.

## 12. Complete First Version

The complete first version adds:

- Best score persistence.
- Warp energy collectibles.
- Warp meter and temporary warp state.
- Increasing difficulty over time.
- Polished visual feedback for collision, collection, and warp.
- Basic audio feedback if practical.

## 13. Out of Scope for First Version

- Multiplayer.
- User accounts.
- Online leaderboard.
- Level editor.
- Mobile-first controls.
- Complex physics engine.
- Large asset pipeline.
- Server-side code.

## 14. Open Questions

- Should warp be required for the first playable version or treated as a later enhancement?
- Should the player be represented as a ship, cursor, glowing orb, or abstract marker?
- Should obstacles be lane-based, smooth arcs, or a mix of both?
- Is mobile support required in the first release?
- Should the visual style lean more neon arcade, sci-fi industrial, or minimalist abstract?

