/**
 * Polar helpers for the tunnel coordinate model.
 *
 * Everything in the tunnel is described as an angle around the Z axis plus a
 * radius and a Z depth. These helpers are the single place that converts that
 * model into Cartesian coordinates, so the player, tunnel, obstacles and
 * collectibles can never disagree about where "theta" points.
 */

export const TAU = Math.PI * 2;

/** Wraps any angle into `0 .. 2 * Math.PI`. */
export function normalizeAngle(angle) {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

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

/**
 * Writes tunnel-polar coordinates into an existing `{ x, y, z }` target —
 * a `THREE.Vector3` works, and so does a plain object. Mutating a caller-owned
 * target keeps the hot path allocation-free.
 *
 * @returns the same target, for chaining.
 */
export function setTunnelPosition(target, theta, radius, z) {
  target.x = Math.cos(theta) * radius;
  target.y = Math.sin(theta) * radius;
  target.z = z;
  return target;
}

/**
 * Moves `current` toward `target` by at most `maxDelta`, without overshooting.
 * Used for angular acceleration so the feel stays framerate-independent.
 */
export function approach(current, target, maxDelta) {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Frame-rate independent exponential smoothing toward `target`. */
export function damp(current, target, rate, delta) {
  return target + (current - target) * Math.exp(-rate * delta);
}

/** Constrains `value` to the inclusive `min..max` range. */
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
