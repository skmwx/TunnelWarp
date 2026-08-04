import { COLLISION } from "./constants.js";
import { normalizeAngle, TAU } from "./tunnelMath.js";

/**
 * Collision and ring-clearing rules.
 *
 * Everything here is polar arithmetic over the plain ring records `Obstacles`
 * keeps — no mesh intersection, no Three.js. A gate is a Z band plus an angular
 * gap; the ship is a fixed Z with an angular and a depth half-extent. That
 * keeps the test to a handful of comparisons, and keeps what the player sees
 * (the wedge edges) exactly aligned with what ends the run.
 */

/** Re-exported so a collision caller gets the whole angle toolkit in one import. */
export { normalizeAngle };

/**
 * Shortest signed turn from `from` to `to`, in `-PI..PI`.
 *
 * Going through `normalizeAngle` first is what makes the `0` / `2 * PI` seam a
 * non-event: an angle just above zero and one just below `2 * PI` come out a
 * few thousandths apart, not a full turn.
 */
export function angularDelta(from, to) {
  const diff = normalizeAngle(to - from);
  return diff > Math.PI ? diff - TAU : diff;
}

/** Shortest angular distance between two angles, in `0..PI`. */
export function angularDistance(a, b) {
  return Math.abs(angularDelta(a, b));
}

/**
 * True when a footprint of `halfWidth` radians centred on `theta` fits wholly
 * inside a gap of `gapWidth` radians centred on `gapCenterTheta`.
 *
 * The footprint is what makes the test fair in both directions: the ship is not
 * a point, so clipping a wedge with its hull is a hit even while its centre is
 * still over the opening.
 */
export function isInsideGap(theta, gapCenterTheta, gapWidth, halfWidth = 0) {
  const clearance = gapWidth / 2 - halfWidth;
  // A gap narrower than the ship has no safe line through it at all.
  if (clearance <= 0) return false;

  return angularDistance(theta, gapCenterTheta) <= clearance;
}

/** Half the Z band within which a gate and the ship can touch. */
function contactHalfDepth(ring) {
  return ring.thickness / 2 + COLLISION.playerHalfDepth;
}

/** Creates the reusable record `resolveRings` writes its outcome into. */
export function createRunResult() {
  return { cleared: 0, hit: null };
}

/**
 * Settles every unresolved gate against the player's current pose.
 *
 * Call once per frame, after both the player and the gates have moved. A gate
 * resolves exactly once: either the ship was inside the gap for every frame the
 * two overlapped in Z — the gate is marked `passed` and counted — or it was
 * not, and the gate comes back as the hit that ends the run.
 *
 * Gates are tested against the Z span they swept during the frame rather than
 * the Z they landed on, so a long frame can never let a gate jump the ship.
 *
 * @param {Array<object>} rings   Active gates, ordered nearest first.
 * @param {{theta: number, z: number}} player
 * @param {{cleared: number, hit: object|null}} result Caller-owned, reused.
 */
export function resolveRings(rings, player, result) {
  result.cleared = 0;
  result.hit = null;

  for (const ring of rings) {
    if (ring.passed) continue;

    const half = contactHalfDepth(ring);
    const bandStart = player.z - half;
    const bandEnd = player.z + half;

    // Still approaching. The list runs nearest to furthest, so nothing after
    // this gate has arrived either.
    if (ring.z < bandStart) break;

    // The gate is inside the contact band, or swept clean through it this
    // frame. Either way the ship had to be lined up with the gap.
    const contacting = ring.prevZ <= bandEnd;
    if (
      contacting &&
      !isInsideGap(
        player.theta,
        ring.gapCenterTheta,
        ring.gapWidth,
        COLLISION.playerHalfAngle,
      )
    ) {
      result.hit = ring;
      // The run ends on the first hit; gates behind it never get their turn.
      break;
    }

    // Trailing edge is clear of the ship: the gate is behind the player now.
    if (ring.z > bandEnd) {
      ring.passed = true;
      result.cleared += 1;
    }
  }

  return result;
}
