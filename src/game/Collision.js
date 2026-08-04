import { COLLISION, WARP } from "./constants.js";
import { angularDelta, normalizeAngle } from "./tunnelMath.js";

/**
 * Collision and ring-clearing rules.
 *
 * Everything here is polar arithmetic over the plain ring records `Obstacles`
 * keeps — no mesh intersection, no Three.js. A gate is a Z band plus one or
 * more angular gaps and a rotation; the ship is a fixed Z with an angular and a
 * depth half-extent. That keeps the test to a handful of comparisons, and keeps
 * what the player sees (the wedge edges) exactly aligned with what ends the
 * run, including while a gate is turning.
 */

/** Re-exported so a collision caller gets the whole angle toolkit in one import. */
export { angularDelta, normalizeAngle };

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

/**
 * True when the ship is lined up with any of a gate's openings.
 *
 * A gate stores its gaps in its own frame and its rotation separately, so the
 * live angle of an opening is the sum of the two. Testing every gap is what
 * makes a double-gap gate genuinely two ways through rather than one that
 * happens to be drawn twice.
 */
export function isInsideAnyGap(theta, ring, halfWidth = 0) {
  for (let i = 0; i < ring.gapCount; i += 1) {
    const gap = ring.gaps[i];
    if (isInsideGap(theta, gap.centerTheta + ring.rotation, gap.width, halfWidth)) {
      return true;
    }
  }
  return false;
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
 * While `invulnerable` — the warp state — the hit test is skipped entirely
 * rather than its outcome ignored, so gates the ship phases through still
 * resolve as passed and still count. A warp is a way through the gauntlet, not
 * a pause in it.
 *
 * @param {Array<object>} rings   Active gates, ordered nearest first.
 * @param {{theta: number, z: number}} player
 * @param {{cleared: number, hit: object|null}} result Caller-owned, reused.
 * @param {boolean} [invulnerable] True while warp is active.
 */
export function resolveRings(rings, player, result, invulnerable = false) {
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
      !invulnerable &&
      contacting &&
      !isInsideAnyGap(player.theta, ring, COLLISION.playerHalfAngle)
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

/**
 * Marks every warp orb the ship swept through this frame as collected.
 *
 * Same shape of test as a gate, and for the same reason: an orb is a Z band and
 * an angle, the ship is a footprint, and the frame's Z sweep is what is tested
 * rather than the Z the orb landed on — at the speed cap an orb moves further
 * per frame than its own collection depth, so a point-in-time test would let
 * the ship pass straight through one.
 *
 * The caller owns removal; this only sets `collected`.
 *
 * @param {Array<object>} orbs Active orbs, ordered nearest first.
 * @param {{theta: number, z: number}} player
 * @returns {number} How many orbs were collected this frame.
 */
export function resolvePickups(orbs, player) {
  const bandStart = player.z - WARP.collectHalfDepth;
  const bandEnd = player.z + WARP.collectHalfDepth;
  let collected = 0;

  for (const orb of orbs) {
    if (orb.collected) continue;
    // Behind the ship already, or not yet arrived. Both are cheap to skip and
    // most orbs on any given frame are one or the other.
    if (orb.prevZ > bandEnd || orb.z < bandStart) continue;
    if (angularDistance(player.theta, orb.theta) > WARP.collectHalfAngle) {
      continue;
    }

    orb.collected = true;
    collected += 1;
  }

  return collected;
}
