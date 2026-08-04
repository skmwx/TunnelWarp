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

/**
 * Forward flight speed, in world units per second.
 *
 * Phase 7 owns the difficulty ramp; for now `base` is a flat cruise speed and
 * `idle` keeps the tunnel drifting in the menu states so it never looks frozen.
 */
export const SPEED = {
  base: 34,
  idle: 10,
  /** Exponential response when the target speed changes, per second. */
  response: 1.6,
  /** Speed at which the tunnel's colour shift saturates. */
  max: 90,
};

/** The scrolling tunnel shell: dark wall, static rails, recycling hoops. */
export const TUNNEL = {
  /** Z distance between hoops. Sets the rhythm of the forward motion cue. */
  hoopSpacing: 9,
  /** Enough hoops to cover the full fogged depth; they recycle forever. */
  hoopCount: 24,
  /** Every Nth hoop is brighter, giving the eye a beat to track speed by. */
  accentEvery: 4,
  hoopTube: 0.05,
  accentTube: 0.1,
  /** Longitudinal wall lines. Static — the hoops carry the motion. */
  railCount: 12,
  railThickness: 0.05,
  /** Extra Z the wall cylinder extends past the hoop band at both ends. */
  wallOverhang: 30,
};

/**
 * Ring gates. The tunnel is divided into angular lanes; a gate blocks every
 * lane except a contiguous run of gap lanes, so rendering and collision can
 * never disagree about where the safe opening is.
 */
export const RINGS = {
  lanes: 24,
  /** Z distance between consecutive gates. Phase 7 tightens this. */
  spacing: 26,
  /** Z of the first gate of a run: far enough ahead to read before it arrives. */
  firstZ: -70,
  /** Lanes left open. Phase 7 narrows this; 2 is the hard floor. */
  gapLanes: 5,
  /** Z depth of a gate, used by collision in Phase 5. */
  thickness: 1.2,
  /** Outer edge, just clear of the tunnel wall so it never z-fights. */
  outerRadius: 4.95,
  /**
   * Inner edge. Far enough inside the player's ride radius that a gate is a
   * real barrier, shallow enough that gates further down the tunnel stay
   * visible through the middle for lookahead.
   */
  innerRadius: 3.2,
  /** Radius of the full-circle rim that marks a gate even across its gap. */
  frameRadius: 4.9,
  /** Angular width of the bright marker on each side of the gap. */
  edgeAngle: 0.055,
  /**
   * Fraction of the theoretically reachable angular travel a gap may move
   * between consecutive gates. The slack covers acceleration and braking, so
   * a generated sequence always leaves a flyable path.
   */
  reachSafety: 0.62,
  /** Gates are recycled once they are this far behind the camera. */
  despawnZ: 6,
};

/** Camera chase drift: a hint of parallax without losing the vanishing point. */
export const CAMERA = {
  /** Fraction of the player's offset the camera follows. */
  followAmount: 0.09,
  /** Exponential smoothing rate, per second. */
  followResponse: 3.5,
};
