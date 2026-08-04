import * as THREE from "three";

import { PLAYER, RINGS, SPEED, WORLD } from "./constants.js";
import { planRing, spacingFor } from "./Difficulty.js";
import { angularDelta, clamp, normalizeAngle, TAU } from "./tunnelMath.js";

/** Angular width of one lane. The whole gate model is quantised to this. */
export const LANE_ANGLE = TAU / RINGS.lanes;

/** True when `lane` falls inside the `lanes` run that starts at `startLane`. */
function inLaneRun(lane, startLane, lanes) {
  const offset = (((lane - startLane) % RINGS.lanes) + RINGS.lanes) % RINGS.lanes;
  return offset < lanes;
}

/** True when `lane` is open on this gate — i.e. inside any of its gaps. */
function isGapLane(ring, lane) {
  for (let i = 0; i < ring.gapCount; i += 1) {
    const gap = ring.gaps[i];
    if (inLaneRun(lane, gap.startLane, gap.lanes)) return true;
  }
  return false;
}

/**
 * The meshes for one gate.
 *
 * Three parts, each carrying a different part of the read:
 *  - a dim amber wedge per blocked lane, the barrier itself
 *  - a bright marker on each side of every gap, so the safe openings have hard
 *    edges long before the wedges resolve out of the fog
 *  - a rim tracing the full circle, so the gate is locatable at any distance
 *
 * Every mesh exists from construction and is only toggled with `visible` or
 * rotated, so reconfiguring a gate costs no allocation — including the markers
 * for the second gap, which are built for every view and hidden on the gates
 * that only have one. Geometry is shared across views; materials are per-view
 * so later phases can tint single gates.
 */
class RingView {
  constructor(wedgeGeometry, edgeGeometry, frameGeometry) {
    this.object3D = new THREE.Group();
    this.object3D.visible = false;

    this.wedgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a0f06,
      emissive: 0xff7a14,
      // Kept below the gap markers and rim so the opening is the brightest
      // thing on the gate, not the barrier.
      emissiveIntensity: 0.35,
      roughness: 0.6,
      metalness: 0.15,
      // Gates are flat, and the player sees their back face after a pass.
      side: THREE.DoubleSide,
    });
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe6b0,
      side: THREE.DoubleSide,
    });
    this.frameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb45c });

    this.wedges = [];
    for (let lane = 0; lane < RINGS.lanes; lane += 1) {
      const wedge = new THREE.Mesh(wedgeGeometry, this.wedgeMaterial);
      // The geometry spans lane 0; each instance is rotated into its own lane.
      wedge.rotation.z = lane * LANE_ANGLE;
      wedge.visible = false;
      this.object3D.add(wedge);
      this.wedges.push(wedge);
    }

    // Two markers per gap the model allows: one on each blocked side.
    this.edges = [];
    for (let i = 0; i < RINGS.maxGaps * 2; i += 1) {
      const edge = new THREE.Mesh(edgeGeometry, this.edgeMaterial);
      // Nudged toward the camera so it never z-fights the wedge it sits on.
      edge.position.z = 0.05;
      edge.visible = false;
      this.object3D.add(edge);
      this.edges.push(edge);
    }

    this.object3D.add(new THREE.Mesh(frameGeometry, this.frameMaterial));
  }

  /** Lays the meshes out for a gate's gaps. Call once per spawn. */
  configure(ring) {
    for (let lane = 0; lane < RINGS.lanes; lane += 1) {
      this.wedges[lane].visible = !isGapLane(ring, lane);
    }

    // Markers come in pairs: even index is the leading edge of gap `i / 2`,
    // odd is its trailing edge. Pairs past `gapCount` sit idle and hidden.
    for (let i = 0; i < this.edges.length; i += 1) {
      const edge = this.edges[i];
      const gapIndex = Math.floor(i / 2);

      edge.visible = gapIndex < ring.gapCount;
      if (!edge.visible) continue;

      const gap = ring.gaps[gapIndex];
      const gapStart = gap.startLane * LANE_ANGLE;
      edge.rotation.z =
        i % 2 === 0 ? gapStart - RINGS.edgeAngle : gapStart + gap.width;
    }

    this.object3D.visible = true;
  }

  /** Pushes the gate's live Z and rotation onto the mesh. Call every frame. */
  sync(ring) {
    this.object3D.position.z = ring.z;
    // Gaps are baked into the meshes at their layout angles; a rotating gate
    // turns the whole group by however far it has drifted since it spawned.
    this.object3D.rotation.z = ring.rotation;
  }

  release() {
    this.object3D.visible = false;
  }

  dispose() {
    this.wedgeMaterial.dispose();
    this.edgeMaterial.dispose();
    this.frameMaterial.dispose();
  }
}

/**
 * Spawns, moves, and recycles the ring gates.
 *
 * `rings` is a plain data list — Z, angles, and flags only — so `Collision` can
 * work in polar arithmetic instead of mesh intersection. Each record carries
 * its `view`, which is the one place a mesh is mentioned.
 *
 * Difficulty is not read from the live run but planned per gate from the ring
 * number that gate will be, so its width, spacing, and rotation are settled the
 * moment it spawns and never shift under the player mid-approach.
 *
 * Gaps are chained by *arrival angle*: a gate's gap is placed so that, by the
 * time it reaches the ship, it sits within the angular distance the ship could
 * have covered since the previous gate. Rotation is folded into that prediction
 * rather than layered on top of it, so a spinning gate is a tracking problem
 * and never an unreachable one.
 *
 * The chain tracks *every* opening of the previous gate, not just the one it
 * aimed at. A double gate is a real choice, so the next gate has to be flyable
 * from whichever opening the player took — otherwise picking the near gap could
 * strand them, which is the least readable way a game can be unfair.
 */
export class Obstacles {
  constructor() {
    this.object3D = new THREE.Group();

    /** Active gates, ordered nearest (largest Z) to furthest. */
    this.rings = [];

    this._pool = [];
    this._speed = SPEED.start;
    this._nextId = 1;
    this._spawnCount = 0;
    this._scenery = true;
    /**
     * Angles the previous gate's openings will be at when they reach the ship.
     * Fixed length, with `_lastArrivalCount` live entries, so extending the
     * chain never allocates.
     */
    this._lastArrivals = new Array(RINGS.maxGaps).fill(
      normalizeAngle(PLAYER.startTheta),
    );
    this._lastArrivalCount = 1;

    this._wedgeGeometry = new THREE.RingGeometry(
      RINGS.innerRadius,
      RINGS.outerRadius,
      8,
      1,
      0,
      LANE_ANGLE,
    );
    this._edgeGeometry = new THREE.RingGeometry(
      RINGS.innerRadius,
      RINGS.outerRadius,
      1,
      1,
      0,
      RINGS.edgeAngle,
    );
    this._frameGeometry = new THREE.TorusGeometry(RINGS.frameRadius, 0.06, 6, 48);
  }

  /** Sets the approach speed in world units per second. */
  setSpeed(speed) {
    this._speed = speed;
  }

  /**
   * Marks the field as scenery behind a menu rather than a live run.
   *
   * Scenery gates are planned as opening rings however long they keep coming,
   * so a player who reads the start screen for a minute still sees the tunnel a
   * run actually begins with instead of watching it quietly ramp into spinning
   * late-game gates they have not earned yet.
   */
  setScenery(scenery) {
    this._scenery = scenery;
  }

  /** Clears the field and prefills the opening stretch of gates. */
  reset() {
    while (this.rings.length) this._release(this.rings.pop());
    this._spawnCount = 0;
    this._lastArrivals.fill(normalizeAngle(PLAYER.startTheta));
    this._lastArrivalCount = 1;
    this._fill();
  }

  update(delta) {
    const dz = this._speed * delta;

    for (const ring of this.rings) {
      // Collision tests the span the gate swept, not just where it landed, so
      // the Z it came from has to survive the move.
      ring.prevZ = ring.z;
      ring.z += dz;

      if (ring.rotationSpeed !== 0) {
        ring.rotation += ring.rotationSpeed * delta;
      }

      ring.view.sync(ring);
    }

    while (this.rings.length && this.rings[0].z > RINGS.despawnZ) {
      this._release(this.rings.shift());
    }

    this._fill();
  }

  dispose() {
    while (this.rings.length) this._release(this.rings.pop());
    for (const ring of this._pool) ring.view.dispose();
    this._wedgeGeometry.dispose();
    this._edgeGeometry.dispose();
    this._frameGeometry.dispose();
  }

  // --- Spawning ----------------------------------------------------------

  /** The ring number the next gate is planned as. */
  get _nextRing() {
    return this._scenery ? 1 : this._spawnCount + 1;
  }

  /** Extends the gate chain until it reaches the spawn horizon. */
  _fill() {
    const last = this.rings[this.rings.length - 1];
    // With no gates yet, back up one slot so the first spawn lands on `firstZ`.
    let frontier = last ? last.z : RINGS.firstZ + spacingFor(this._nextRing);

    for (;;) {
      const ring = this._nextRing;
      const z = frontier - spacingFor(ring);
      if (z < WORLD.spawnZ) break;

      this._spawn(z, planRing(ring));
      frontier = z;
    }
  }

  /**
   * @param {number} z    Where the gate enters the world.
   * @param {object} plan Difficulty settings for the ring number it was
   *   planned as — which is the gate's own ordinal during a run, and always
   *   ring 1 while the field is scenery.
   */
  _spawn(z, plan) {
    const ring = this._acquire();

    ring.id = this._nextId++;
    ring.index = ++this._spawnCount;
    ring.z = z;
    ring.prevZ = z;
    ring.radius = RINGS.outerRadius;
    ring.thickness = RINGS.thickness;
    ring.rotation = 0;
    ring.rotationSpeed = plan.rotationSpeed;
    ring.gapCount = clamp(plan.gapCount, 1, RINGS.maxGaps);
    ring.passed = false;

    this._layOutGaps(ring, plan, z);

    ring.view.configure(ring);
    ring.view.sync(ring);
    this.rings.push(ring);
  }

  /**
   * Places the gate's openings and extends the reachability chain.
   *
   * The first gap is aimed at an angle the ship can reach from every opening
   * the previous gate offered. A second gap is then placed clear of it, close
   * enough that the *next* gate still has an arc reachable from both — if no
   * such offset exists, the gate quietly falls back to a single opening rather
   * than shipping a choice that can dead-end.
   */
  _layOutGaps(ring, plan, z) {
    // Seconds this gate will be in flight, so a rotating gap can be aimed at
    // where it will have drifted to rather than where it starts.
    const flightTime = (WORLD.playerZ - z) / plan.speed;
    const arrival =
      this._spawnCount === 1
        ? normalizeAngle(PLAYER.startTheta)
        : this._reachableArrival(plan);

    const drift = plan.rotationSpeed * flightTime;
    const primary = this._placeGap(ring.gaps[0], arrival - drift, plan.gapLanes);

    const separation = ring.gapCount > 1 ? this._separationLanes(plan) : 0;
    if (separation > 0) {
      this._placeGapAtLane(
        ring.gaps[1],
        primary.startLane + separation,
        plan.gapLanes,
      );
    } else {
      ring.gapCount = 1;
    }

    // Quantising to a lane moves a gap by up to half a lane; the chain records
    // where the openings actually landed, not where they were aimed, so the
    // error cannot accumulate across a run.
    this._lastArrivalCount = ring.gapCount;
    for (let i = 0; i < ring.gapCount; i += 1) {
      this._lastArrivals[i] = normalizeAngle(ring.gaps[i].centerTheta + drift);
    }

    // Published for `Collectibles`, which strings warp orbs between the angles
    // consecutive gates demand the ship be at.
    ring.arrivalTheta = this._lastArrivals[0];
  }

  /**
   * Picks where this gate's first gap should be when it reaches the ship.
   *
   * Each of the previous gate's openings contributes an arc of `reach` radians
   * around itself; the answer is drawn from where those arcs overlap, which is
   * by construction flyable from all of them. `reach` is the reaction window
   * the difficulty curve promised for this ring, discounted by `reachSafety` to
   * cover accelerating out of the last gap and braking into this one.
   */
  _reachableArrival(plan) {
    const reach = PLAYER.maxAngularSpeed * plan.interval * RINGS.reachSafety;
    const anchor = this._lastArrivals[0];

    let lower = -reach;
    let upper = reach;
    for (let i = 1; i < this._lastArrivalCount; i += 1) {
      const offset = angularDelta(anchor, this._lastArrivals[i]);
      lower = Math.max(lower, offset - reach);
      upper = Math.min(upper, offset + reach);
    }

    // Openings too far apart to share an arc: `_separationLanes` rules that out
    // at layout time, so this only guards against a future tuning change.
    if (lower > upper) return anchor + (lower + upper) / 2;

    return anchor + lower + Math.random() * (upper - lower);
  }

  /**
   * Lane offset from the first gap to the second, or `0` if no offset works.
   *
   * Bounded below by the blocked lanes that keep the two openings reading as a
   * choice rather than one wide smear, and above by the arc the following gate
   * has to stay reachable from both — the further apart they sit, the less
   * freedom the next gate has, and `gapFreedom` is how much of it is protected.
   */
  _separationLanes(plan) {
    const reach = PLAYER.maxAngularSpeed * plan.interval * RINGS.reachSafety;
    const shared = 2 * (reach - RINGS.gapFreedom);

    const min = plan.gapLanes + RINGS.gapSeparationLanes;
    const max = Math.min(
      RINGS.lanes - plan.gapLanes - RINGS.gapSeparationLanes,
      Math.floor(shared / LANE_ANGLE),
    );
    if (max < min) return 0;

    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /** Places one gap so its centre lands as near `centerTheta` as lanes allow. */
  _placeGap(gap, centerTheta, lanes) {
    const start = Math.round(normalizeAngle(centerTheta) / LANE_ANGLE - lanes / 2);
    return this._placeGapAtLane(gap, start, lanes);
  }

  /** Places one gap on an exact lane. Returns the gap, for chaining. */
  _placeGapAtLane(gap, startLane, lanes) {
    gap.startLane = ((startLane % RINGS.lanes) + RINGS.lanes) % RINGS.lanes;
    gap.lanes = lanes;
    gap.width = lanes * LANE_ANGLE;
    gap.centerTheta = normalizeAngle(
      (gap.startLane + lanes / 2) * LANE_ANGLE,
    );
    return gap;
  }

  // --- Pooling -----------------------------------------------------------

  _acquire() {
    const pooled = this._pool.pop();
    if (pooled) return pooled;

    const view = new RingView(
      this._wedgeGeometry,
      this._edgeGeometry,
      this._frameGeometry,
    );
    // Views are parented once and hidden when idle; they are never re-added.
    this.object3D.add(view.object3D);

    return {
      id: 0,
      index: 0,
      z: 0,
      /** Z at the start of the current frame; the other end of the sweep. */
      prevZ: 0,
      radius: RINGS.outerRadius,
      thickness: RINGS.thickness,
      /**
       * Openings, in layout angles — the gate's own frame, before rotation.
       * Every slot the model allows is allocated up front; `gapCount` says how
       * many of them this gate is using.
       */
      gaps: Array.from({ length: RINGS.maxGaps }, () => ({
        startLane: 0,
        lanes: 0,
        width: 0,
        centerTheta: 0,
      })),
      gapCount: 1,
      /**
       * Where the first opening will be when the gate reaches the ship — so,
       * the angle the player has to be at on this gate. Set at layout time and
       * read by `Collectibles` to lay orbs along the path between gates.
       */
      arrivalTheta: 0,
      /** Radians the gate has turned since it spawned. Added to gap angles. */
      rotation: 0,
      rotationSpeed: 0,
      /** Owned by `Collision`: set once the gate is safely behind the ship. */
      passed: false,
      view,
    };
  }

  _release(ring) {
    ring.view.release();
    this._pool.push(ring);
  }
}
