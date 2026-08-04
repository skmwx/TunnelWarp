/**
 * Shared world tuning values.
 *
 * These live outside `Game.js` so gameplay modules (`Player`, and later
 * `Tunnel` / `Obstacles`) can read them without importing the class that
 * imports them back.
 */

/** Geometry of the tunnel and the fixed camera rig. */
export const WORLD = {
  tunnelRadius: 5,
  /**
   * Radius the player rides at. Inset from the wall so the ship silhouette
   * stays readable against the tunnel surface instead of merging with it.
   */
  playerRadius: 4.1,
  /**
   * Z the player rides at; the camera sits behind it looking down -Z. The gap
   * to `cameraZ` is set so the full tunnel wall stays inside the vertical FOV
   * at the shortest supported viewport.
   */
  playerZ: -10,
  cameraZ: 0,
  /** Distance at which rings spawn ahead of the player. */
  spawnZ: -160,
  fov: 72,
  near: 0.1,
  far: 400,
};

/** Angular movement feel. Tuned for arcade-immediate response. */
export const PLAYER = {
  /** Bottom of the tunnel, so the ship reads as sitting on the floor. */
  startTheta: -Math.PI / 2,
  /** Radians per second at full deflection (~20 units/s along the wall). */
  maxAngularSpeed: 3.4,
  /** Radians per second squared while a direction key is held. */
  acceleration: 26,
  /** Stronger than acceleration so releasing a key stops the drift quickly. */
  damping: 34,
  /** Radians of roll at full angular speed, leaning into the turn. */
  maxBank: 0.55,
  /** How fast the visual bank chases its target, per second. */
  bankResponse: 9,
  /** Saucer idle spin, radians per second. */
  spinSpeed: 1.5,
};

/** Camera chase drift: a hint of parallax without losing the vanishing point. */
export const CAMERA = {
  /** Fraction of the player's offset the camera follows. */
  followAmount: 0.09,
  /** Exponential smoothing rate, per second. */
  followResponse: 3.5,
};
