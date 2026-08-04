SpaceWarp — Game Concept Document
1. Overview

A single-player arcade tunnel-flight game inspired by redemption arcade cabinets. The player pilots a UFO along the inner wall of an endless circular tunnel, threading through a sequence of rotating ring obstacles. The goal is to survive as many rings as possible — reaching Ring 66 is the top achievement.

Genre: Arcade / reflex / endless runner (tunnel variant) Perspective: First-person or third-person chase, flying forward through a 3D tube Platform: PC, browser-playable Session length: 30 seconds–3 minutes per run

2. Core Fantasy

"How far can I go?" — a fast, tense, easy-to-learn-hard-to-master test of reflexes, styled like a classic redemption-ticket arcade machine, rebuilt as a home game for one player.

3. Core Gameplay Loop
Player starts at Ring 0, UFO positioned on the tunnel wall.
Player moves the UFO around the circumference of the tunnel (like a clock hand) to align with a gap in the upcoming ring.
UFO flies forward automatically; player only controls angular position (and possibly a small radial/depth adjustment).
Passing through a ring's gap = ring cleared, counter increments.
Missing the gap (hitting the ring) = run ends.
Every few rings, forward speed increases and rings begin rotating or shifting, raising difficulty.
Run ends on collision or on reaching Ring 66 (max reward achieved).

4. Controls
Primary input: Left/Right (or analog stick / mouse drag) to rotate the UFO around the tunnel wall.
Optional: hold-to-boost or dash, if a secondary mechanic is desired (open question for design phase).
Designed for simple, immediate pick-up-and-play — one axis of control, arcade-cabinet simplicity.
5. Obstacles: Rings
Each ring is a circular obstacle with one or more open gaps.
Ring types (progressive introduction):
Static ring — fixed gap position, no motion (early rings).
Rotating ring — gap sweeps around the circumference at increasing speed.
Shifting ring — gap position jumps or oscillates unpredictably.
Narrow-gap ring — gap width shrinks as difficulty increases.
Double-gap ring — two gaps, but positioned to require quick repositioning (introduced later for variety).
Ring spacing shortens gradually as forward speed increases, reducing player reaction time.

6. Difficulty Progression
Forward flight speed increases at defined milestones (e.g., every 5–10 rings).
Ring rotation speed and gap narrowness scale up alongside flight speed.
Progression should feel like a smooth curve, not sudden spikes — early rings are near-trivial (welcoming for new/young players), later rings demand precise, fast reactions.
Ring 66 represents the "hero" difficulty tier — reaching it should feel like a genuine accomplishment, not a guaranteed outcome.

7. Scoring & Reward
Primary score = number of rings passed.
Reward tiers map to ring milestones (e.g., small reward at Ring 10, medium at Ring 30, large/jackpot at Ring 66), echoing the redemption-ticket structure of the original.
End-of-run screen shows rings passed, best-ever result, and (optionally) a simple "ticket count" reward readout for flavor.

8. Visual & Audio Style
Neon/retro-futuristic tunnel aesthetic — glowing rings, starfield or grid tunnel walls, UFO with a simple silhouette and light trail.
Escalating audio: tempo/pitch of music and thruster sound increases with speed; distinct "ring cleared" chime with pitch that rises as rings increase; punchy "run over" collision sound.
Ring 66 (or major milestones) should have a distinct celebratory visual/audio moment.
9. Win/Loss Conditions
Loss: UFO collides with a ring (misses the gap).
Milestone win: Reaching Ring 66 — the "big prize" moment. Game may continue past 66 in an endless bonus mode, or end there with a celebration screen (open design question).
10. Target Player

Designed with a young player in mind: simple controls, forgiving early difficulty, clear visual feedback, and a strong sense of escalating achievement as the ring count climbs.

11. Out of Scope (for this concept)
Multiplayer
Multiple ships/customization
Level editor
Persistent online leaderboards (local high score only, for v1)

This document is intentionally high-level — intended as input for a detailed game design brief and functional specification.