import { DIFFICULTY, RINGS, SPEED } from "./constants.js";
import { clamp } from "./tunnelMath.js";

/**
 * The difficulty curve.
 *
 * One pure-ish module of arithmetic over a single input: the ring number. It
 * knows nothing about Three.js, meshes, or the live run — `Obstacles` asks it
 * what the next gate should look like and lays that out, and `Game` asks it how
 * fast the ship should be flying. Keeping both callers on the same curve is
 * what makes a gate's spacing match the speed it will be flown at.
 *
 * Ring numbers here are the number the player sees when they clear the gate, so
 * `planRing(1)` is the opening gate and `speedFor(0)` is the launch speed.
 *
 * Only `planRing` is random, and only in which *variation* a gate takes; every
 * width, speed, and spacing is a deterministic function of the ring number.
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Interpolates a `{ start, end }` range. */
function ramp(range, t) {
  return lerp(range.start, range.end, t);
}

/**
 * How far a curve introduced at `fromRing` has ramped by `ring`, in `0..1`.
 *
 * Everything is measured against the same `rampRing` finish line, so a feature
 * introduced late ramps faster than one introduced early — which is what keeps
 * it from being a token presence for the rest of the run.
 */
function rampProgress(ring, fromRing = DIFFICULTY.tutorialRings) {
  const span = Math.max(DIFFICULTY.rampRing - fromRing, 1);
  return clamp((ring - fromRing) / span, 0, 1);
}

/** The speed ramp's endpoints, hoisted: `speedFor` runs every frame. */
const SPEED_RANGE = { start: SPEED.start, end: SPEED.cruise };

/**
 * Forward speed for a run that has cleared `rings` gates.
 *
 * Two terms: a smooth ramp so the tunnel is always creeping faster, and a step
 * every `speedStepRings` so the player also *feels* discrete moments of getting
 * faster. `Game` eases toward this value rather than snapping to it, which
 * turns each step into a surge instead of a jolt.
 *
 * @returns {number} World units per second, never above `SPEED.cap`.
 */
export function speedFor(rings) {
  const smooth = ramp(SPEED_RANGE, rampProgress(rings));
  const boosts = Math.floor(rings / DIFFICULTY.speedStepRings);

  return Math.min(smooth + boosts * DIFFICULTY.speedStep, SPEED.cap);
}

/** Seconds between this gate arriving and the one before it. */
export function intervalFor(ring) {
  return ramp(DIFFICULTY.interval, rampProgress(ring));
}

/**
 * Z distance from the previous gate to this one.
 *
 * Derived from the reaction window rather than tuned directly, so the spacing
 * shown on screen always matches the time the player actually gets: as the ship
 * speeds up the gates spread further apart in Z while still arriving sooner.
 */
export function spacingFor(ring) {
  return intervalFor(ring) * speedFor(ring);
}

/** True once `ring` is past the point a variation is allowed to appear. */
function unlocked(ring, fromRing) {
  return ring > fromRing;
}

/** Rolls a `{ start, end }` chance range that opens at `fromRing`. */
function rolls(ring, fromRing, chance) {
  if (!unlocked(ring, fromRing)) return false;
  return Math.random() < ramp(chance, rampProgress(ring, fromRing));
}

/**
 * Which variation this gate takes.
 *
 * Exactly one, so a gate is never narrow *and* split: each variation is a
 * distinct thing to read at speed, and stacking them produces gates that are
 * hard for reasons the player cannot name. Narrow is rolled first because it is
 * the older mechanic by the time doubles unlock, and the ring the player is
 * least surprised by.
 *
 * @returns {"standard"|"narrow"|"double"}
 */
function rollVariant(ring) {
  if (rolls(ring, DIFFICULTY.narrowFromRing, DIFFICULTY.chance.narrow)) {
    return "narrow";
  }
  if (rolls(ring, DIFFICULTY.doubleFromRing, DIFFICULTY.chance.double)) {
    return "double";
  }
  return "standard";
}

/** Signed rotation for this gate, or `0` for a static one. */
function rollRotation(ring, variant) {
  if (!rolls(ring, DIFFICULTY.rotationFromRing, DIFFICULTY.chance.rotation)) {
    return 0;
  }

  const speed = ramp(
    DIFFICULTY.rotation,
    rampProgress(ring, DIFFICULTY.rotationFromRing),
  );
  const scaled =
    variant === "narrow" ? speed * DIFFICULTY.narrowRotationScale : speed;

  // Direction is a coin flip, so the player reads each gate rather than
  // learning a pattern.
  return Math.random() < 0.5 ? -scaled : scaled;
}

/**
 * Lanes left open per gap at this ring, after the variation is applied.
 *
 * Clamped at both ends: never below `minGapLanes`, and never so wide that the
 * gate stops being a barrier — a double gate also has to leave room for its
 * two separators.
 */
function gapLanesFor(ring, variant) {
  const base = Math.round(ramp(DIFFICULTY.gapLanes, rampProgress(ring)));
  const lanes = variant === "standard" ? base : base - DIFFICULTY.narrowLanes;

  const gaps = variant === "double" ? 2 : 1;
  const widest = Math.floor(
    (RINGS.lanes - gaps * RINGS.gapSeparationLanes) / gaps,
  );

  return clamp(lanes, DIFFICULTY.minGapLanes, widest);
}

/**
 * The full plan for the gate that will be ring number `ring`.
 *
 * @param {number} ring 1-based ring number.
 * @returns {{
 *   ring: number,
 *   speed: number,
 *   interval: number,
 *   spacing: number,
 *   gapLanes: number,
 *   gapCount: number,
 *   rotationSpeed: number,
 *   variant: string,
 * }} `interval` is the seconds between this gate arriving and the previous one,
 *   which is the player's reaction window; `spacing` is that window expressed
 *   as the Z distance it works out to at this ring's speed.
 */
export function planRing(ring) {
  const variant = rollVariant(ring);

  return {
    ring,
    speed: speedFor(ring),
    interval: intervalFor(ring),
    spacing: spacingFor(ring),
    gapLanes: gapLanesFor(ring, variant),
    gapCount: variant === "double" ? 2 : 1,
    rotationSpeed: rollRotation(ring, variant),
    variant,
  };
}
