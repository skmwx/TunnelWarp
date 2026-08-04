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
  /**
   * Distance at which rings spawn ahead of the player.
   *
   * Sized off the fastest the run ever gets: at `SPEED.cap` a gate still has
   * ~2.4s of flight from here to the ship, which is three gates of lookahead at
   * the tightest late-game spacing.
   */
  spawnZ: -190,
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
  /** Hull emissive at rest, and the value warp drives it to. */
  hullEmissive: 0.28,
  warpEmissive: 1.15,
  /** Point light travelling with the ship, and its warp multiplier. */
  lampIntensity: 22,
  warpLamp: 1.4,
  /** Extra fraction of idle spin at full warp. */
  warpSpin: 2.5,
  /**
   * Lamps set into the saucer rim, alternating bright and dim. They ride the
   * hull, so the idle spin turns them into a chase for free.
   */
  rimLights: 8,
  /** Thruster plume length at rest, and the multiple warp stretches it to. */
  thrusterLength: 0.55,
  warpThruster: 4.5,
};

/**
 * Forward flight speed, in world units per second.
 *
 * The run speed is a curve over rings cleared, owned by `Difficulty.js`; these
 * are its endpoints. `idle` keeps the tunnel drifting in the menu states so the
 * scene never looks frozen.
 */
export const SPEED = {
  /** Launch speed, held flat through the tutorial rings. */
  start: 26,
  /** Where the smooth ramp tops out, before milestone boosts are added. */
  cruise: 58,
  /** Hard ceiling. Boosts stack onto the ramp but can never pass this. */
  cap: 74,
  idle: 10,
  /** Exponential response when the target speed changes, per second. */
  response: 1.6,
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
  /** Z of the first gate of a run: far enough ahead to read before it arrives. */
  firstZ: -70,
  /** Openings a single gate may have. `Difficulty` decides how many it gets. */
  maxGaps: 2,
  /** Blocked lanes guaranteed between the two openings of a double gate. */
  gapSeparationLanes: 2,
  /**
   * Radians of placement freedom held back for the gate that follows a double
   * gate. Both openings of a double have to leave the next gate somewhere
   * reachable, and this is how much of that arc is protected from being eaten
   * by a wide split.
   */
  gapFreedom: 0.3,
  /** Z depth of a gate; half of it is the gate's share of the contact band. */
  thickness: 1.2,
  /** Rings cleared to win the run outright. The jackpot of the original cabinet. */
  victoryRing: 66,
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

  /**
   * The ring-clear pulse: a gate lights up and swells as the ship comes out the
   * back of it. Fast enough to be over before the next gate needs reading.
   */
  flashDecay: 4,
  flashScale: 0.07,
};

/**
 * The difficulty curve, in ring numbers.
 *
 * Every gate is planned from the ring number it will be when the player reaches
 * it, so a gate's difficulty is fixed the moment it spawns and the ramp is the
 * same on every run. Rings 1 through `tutorialRings` are held at the easiest
 * values of every curve; from there each curve interpolates to its hardest
 * value at `rampRing` and is capped, so the last stretch to Ring 66 is
 * demanding but never escalates past what has already been survived.
 *
 * Ranges are `{ start, end }` pairs read as "value at introduction" and "value
 * once the curve has fully ramped".
 */
export const DIFFICULTY = {
  /** Rings held at tutorial settings: wide gaps, no rotation, slowest speed. */
  tutorialRings: 5,
  /** Ring at which every curve reaches its hardest value and stops. */
  rampRing: 58,
  /** Gates may rotate only after this ring. */
  rotationFromRing: 8,
  /** Extra-narrow gates appear only after this ring. */
  narrowFromRing: 18,
  /** Double-gap gates appear only after this ring. */
  doubleFromRing: 28,

  /** Milestone speed boosts: one step of `speedStep` every `speedStepRings`. */
  speedStepRings: 7,
  speedStep: 2.2,

  /** Seconds between consecutive gates arriving. Z spacing is derived. */
  interval: { start: 1.4, end: 0.72 },

  /** Lanes left open, of `RINGS.lanes`. */
  gapLanes: { start: 8, end: 4 },
  /** Lanes a narrow gate gives up against the standard width for its ring. */
  narrowLanes: 1,
  /**
   * Floor on gap width. Three lanes is 45°, against a ~14° ship: tight enough
   * to demand a committed line, wide enough that one exists.
   */
  minGapLanes: 3,

  /** Gate rotation, radians per second. Well under the ship's 3.4 rad/s. */
  rotation: { start: 0.22, end: 0.85 },
  /** Rotation is gentler on a narrow gate, so the two never compound fully. */
  narrowRotationScale: 0.6,

  /** Odds a gate of an eligible ring takes each variation. */
  chance: {
    rotation: { start: 0.35, end: 0.9 },
    narrow: { start: 0.15, end: 0.35 },
    double: { start: 0.15, end: 0.3 },
  },
};

/**
 * Warp energy: the orbs, the meter they fill, and the warp itself.
 *
 * Orbs are laid in pods along the flight path *between* two gates, at the
 * angles the player has to be at when each of those gates arrives. That makes
 * every orb reachable by construction, keeps them clear of any gate's Z band,
 * and means chasing energy pulls the player onto a good line rather than off
 * one — which matters for the young player this cabinet is aimed at.
 *
 * Tuned so a player who takes most of the orbs earns a warp roughly every ten
 * to fifteen gates, and each warp is worth about four of them.
 */
export const WARP = {
  /** Orbs in one pod. Reads as a trail to follow, not a dot to clip. */
  podSize: 3,
  /** Odds the stretch between two gates gets a pod at all. */
  podChance: 0.5,
  /** Orbs that fill the meter. */
  orbsToFill: 16,
  orbRadius: 0.3,
  /** Orb spin, radians per second. Idle motion, so they read as pickups. */
  spinSpeed: 2.4,
  /**
   * Collection footprint, as half-extents around the ship. Generous next to
   * the collision hitbox: missing an orb costs nothing, so a near miss that
   * looked like a hit is pure frustration with no upside.
   */
  collectHalfAngle: 0.2,
  collectHalfDepth: 0.9,
  /** Orbs are recycled once this far behind the camera. */
  despawnZ: 6,

  /** Seconds of warp per activation. */
  duration: 3,
  /** Forward speed multiplier while warping; stacks past `SPEED.cap`. */
  speedScale: 1.3,
  /** Snappier than `SPEED.response`, so warp reads as a kick, not a drift. */
  speedResponse: 5,
  /** Degrees of extra FOV at full warp. */
  fovBoost: 15,
  /** How fast the warp look ramps in and out, per second. */
  viewResponse: 6,
  /**
   * Fraction of a gate spacing that has to still be ahead of the ship before
   * invulnerability is allowed to drop.
   *
   * Without this, a warp that expired just short of a gate would hand the
   * player a gate with no time to read it — a death caused by the power-up.
   * Warp instead holds until the ship is freshly past a gate, which extends it
   * by at most one gate and makes every warp end on the same clean beat.
   */
  exitLead: 0.8,
};

/**
 * Scoring weights.
 *
 * Rings are the headline number the cabinet is built around; the score is the
 * tiebreaker between two runs that ended on the same ring. Distance is what
 * separates them, so it is weighted low enough that a cleared gate is always
 * worth more than the stretch of tunnel leading to it.
 */
export const SCORE = {
  /** Points per world unit flown: 26/s at launch, 74/s at the speed cap. */
  perDistanceUnit: 1,
  /** Points for clearing a single gate, before any milestone bonus. */
  perRing: 250,
  /** Points per warp orb. Below a gate: energy is a bonus, not the objective. */
  perOrb: 120,
};

/**
 * Reward milestones, ascending. The redemption-ticket ladder of the original
 * cabinet: a small prize early enough that a first run can reach it, and a
 * jackpot at the ring that ends the game.
 */
export const REWARD_TIERS = [
  { rings: 10, label: "Small prize", bonus: 1000 },
  { rings: 30, label: "Big prize", bonus: 5000 },
  { rings: RINGS.victoryRing, label: "Jackpot", bonus: 25000 },
];

/**
 * The ship's hitbox, as half-extents around its centre.
 *
 * Both sit a little under the hull's true size. An arcade game should never
 * kill a pass that looked clean, and the gap markers are the only edge the
 * player can actually judge, so the ship is modelled slightly smaller than it
 * is drawn rather than the gap slightly wider than it is drawn.
 */
export const COLLISION = {
  /** Radians. The hull spans ~0.134 rad at the ride radius. */
  playerHalfAngle: 0.12,
  /** World units along Z. The saucer is ~0.55 deep from its centre. */
  playerHalfDepth: 0.4,
};

/** Camera chase drift: a hint of parallax without losing the vanishing point. */
export const CAMERA = {
  /** Fraction of the player's offset the camera follows. */
  followAmount: 0.09,
  /** Exponential smoothing rate, per second. */
  followResponse: 3.5,
};

/**
 * Feedback effects: the ship's trail, the sparks, the screen flash, and the
 * camera shake.
 *
 * Every value here is a count, a duration, or a colour. The effects themselves
 * live in `Effects.js`; the moments that fire them live in `Game.js`. Sizes are
 * held down deliberately — an arcade tunnel game is won by reading the next
 * gap, so nothing here is allowed to sit between the player and a gate for
 * longer than the beat it is marking.
 */
export const EFFECTS = {
  /**
   * One shared pool backs the trail, the pickups, the crash, and the cheer.
   * Sized for the worst case: a doubled wake at the speed cap, with a crash
   * burst thrown on top of it.
   */
  particleCapacity: 380,
  /**
   * Mote diameter in world units. Wide enough that consecutive trail motes
   * overlap into one glow at the speeds the game actually runs at — a stream of
   * separated dots reads as debris, not as a wake.
   */
  particleSize: 0.26,

  trail: {
    /**
     * World units of flight between motes, rather than seconds.
     *
     * Spacing the wake by distance is what keeps it looking the same at every
     * speed: on a timer it would be a solid bar at launch and a line of beads
     * at the speed cap. Held under the mote size, so consecutive motes overlap.
     */
    spacing: 0.16,
    /** Seconds a mote lives; at speed, this is how far the wake reaches back. */
    life: 0.32,
    /** Radial and angular jitter, so the ribbon has body instead of being a line. */
    spread: 0.07,
    /** Inset from the ride radius: the trail streams out from under the hull. */
    radiusOffset: -0.14,
    /** Colour at rest, and where warp drags it. */
    color: 0xff3ea5,
    warpColor: 0xbfe9ff,
    /**
     * Extra motes per emission at full warp, so a warp leaves a thicker wake.
     * Held at one: the wake is already dense, and a warp at the speed cap has
     * to leave the pool room for whatever ends the run.
     */
    warpBurst: 1,
  },

  /** A collected orb: a small puff at the ship. */
  sparkle: { count: 7, life: 0.35, speed: 3.4, drag: 3, color: 0x9ff4ff },

  /** The crash: a hard burst thrown outward from the point of impact. */
  burst: { count: 64, life: 0.9, speed: 13, drag: 2.2, color: 0xffa257 },

  /** A milestone or the jackpot: a slower, brighter shower around the tunnel. */
  cheer: { count: 44, life: 1.5, speed: 7, drag: 1.2, color: 0xffe6b0 },
  /**
   * World units ahead of the ship a mid-run cheer is thrown.
   *
   * A shower let off at the ship rides the world past the camera in a fifth of
   * a second at cruise speed, which is not long enough to register as anything.
   * Thrown down the tunnel instead, it is flown *through* — which is both
   * visible for a second or so and a better reward than a puff behind you.
   * The end-of-run cheers do not need it: the world is already stopped.
   */
  cheerLead: 26,

  /** Camera shake, in world units of offset, and how fast it dies away. */
  shake: { crash: 0.55, warp: 0.16, milestone: 0.22, decay: 7 },

  /** Screen-flash opacity per event, and the decay rate they all share. */
  flash: { crash: 0.42, warp: 0.26, milestone: 0.24, victory: 0.5, decay: 4 },

  /** Seconds a milestone banner holds before it clears itself. */
  milestoneHold: 1.9,
};

/**
 * Audio.
 *
 * Every sound is synthesised at runtime, so there is no asset pipeline and
 * nothing to load — see `Audio.js`. Envelopes and voicings stay in that module;
 * what is tuned here is only what the rest of the game can hear itself in: the
 * output level, the ladder the ring chime climbs as the count rises, and the
 * engine drone that tracks forward speed.
 */
export const AUDIO = {
  /** Master output level. Leaves headroom for several overlapping one-shots. */
  masterGain: 0.5,
  /** Root of the pentatonic ladder the ring chime climbs, in Hz. */
  ringRootHz: 262,
  /** Ladder steps spanning Ring 1 to the victory ring: three octaves of climb. */
  ringSteps: 15,
  /** Engine drone at the slowest and the fastest the ship ever flies. */
  droneHz: { start: 42, end: 96 },
  droneGain: 0.09,
  warpDroneGain: 0.16,
};
