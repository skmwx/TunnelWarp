import * as THREE from "three";

import { PLAYER, RINGS, SPEED, WORLD } from "./constants.js";
import { clamp, normalizeAngle, TAU } from "./tunnelMath.js";

/** Angular width of one lane. The whole gate model is quantised to this. */
export const LANE_ANGLE = TAU / RINGS.lanes;

/** True when `lane` falls inside the `gapLanes` run that starts at `gapStartLane`. */
function isGapLane(lane, gapStartLane, gapLanes) {
  const offset = (((lane - gapStartLane) % RINGS.lanes) + RINGS.lanes) % RINGS.lanes;
  return offset < gapLanes;
}

/**
 * The meshes for one gate.
 *
 * Three parts, each carrying a different part of the read:
 *  - a dim amber wedge per blocked lane, the barrier itself
 *  - a bright marker on each side of the gap, so the safe opening has hard
 *    edges long before the wedges resolve out of the fog
 *  - a rim tracing the full circle, so the gate is locatable at any distance
 *
 * Every mesh exists from construction and is only toggled with `visible` or
 * rotated, so reconfiguring a gate costs no allocation. Geometry is shared
 * across views; materials are per-view so later phases can tint single gates.
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

    this.edges = [
      new THREE.Mesh(edgeGeometry, this.edgeMaterial),
      new THREE.Mesh(edgeGeometry, this.edgeMaterial),
    ];
    for (const edge of this.edges) {
      // Nudged toward the camera so it never z-fights the wedge it sits on.
      edge.position.z = 0.05;
      this.object3D.add(edge);
    }

    this.object3D.add(new THREE.Mesh(frameGeometry, this.frameMaterial));
  }

  /** Lays the meshes out for a gate's gap. Call once per spawn. */
  configure(ring) {
    for (let lane = 0; lane < RINGS.lanes; lane += 1) {
      this.wedges[lane].visible = !isGapLane(lane, ring.gapStartLane, ring.gapLanes);
    }

    // One marker on each blocked side of the opening.
    const gapStart = ring.gapStartLane * LANE_ANGLE;
    this.edges[0].rotation.z = gapStart - RINGS.edgeAngle;
    this.edges[1].rotation.z = gapStart + ring.gapWidth;

    this.object3D.visible = true;
  }

  /** Pushes the gate's live Z and rotation onto the mesh. Call every frame. */
  sync(ring) {
    this.object3D.position.z = ring.z;
    // Wedges are laid out at the gate's spawn angles; rotating rings drift the
    // whole group by however far the gap has travelled since.
    this.object3D.rotation.z = ring.gapCenterTheta - ring.layoutTheta;
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
 * `rings` is a plain data list — Z, angles, and flags only — so Phase 5 can do
 * collision with polar arithmetic instead of mesh intersection. Each record
 * carries its `view`, which is the one place a mesh is mentioned.
 *
 * Gaps are chained: a new gate's gap can only sit within the angular distance
 * the player could actually cover since the previous gate, so a generated run
 * always has a flyable path.
 */
export class Obstacles {
  constructor() {
    this.object3D = new THREE.Group();

    /** Active gates, ordered nearest (largest Z) to furthest. */
    this.rings = [];

    this._pool = [];
    this._speed = SPEED.base;
    this._nextId = 1;
    this._spawnCount = 0;
    this._lastGapCenter = normalizeAngle(PLAYER.startTheta);

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

  /** Clears the field and prefills the opening stretch of gates. */
  reset() {
    while (this.rings.length) this._release(this.rings.pop());
    this._spawnCount = 0;
    this._lastGapCenter = normalizeAngle(PLAYER.startTheta);
    this._fill();
  }

  update(delta) {
    const dz = this._speed * delta;

    for (const ring of this.rings) {
      ring.z += dz;

      if (ring.rotationSpeed !== 0) {
        ring.gapCenterTheta = normalizeAngle(
          ring.gapCenterTheta + ring.rotationSpeed * delta,
        );
      }

      // Phase 5 reads this flag to score the pass and end the run on a miss.
      if (!ring.passed && ring.z > WORLD.playerZ + ring.thickness / 2) {
        ring.passed = true;
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

  /** Extends the gate chain until it reaches the spawn horizon. */
  _fill() {
    const last = this.rings[this.rings.length - 1];
    // With no gates yet, back up one slot so the first spawn lands on `firstZ`.
    let frontier = last ? last.z : RINGS.firstZ + RINGS.spacing;

    while (frontier - RINGS.spacing >= WORLD.spawnZ) {
      frontier -= RINGS.spacing;
      this._spawn(frontier);
    }
  }

  _spawn(z) {
    const ring = this._acquire();
    const gapLanes = clamp(RINGS.gapLanes, 2, RINGS.lanes - 1);

    // The opening gate sits straight ahead of the launch pose; every gate after
    // it steps a reachable distance from its predecessor.
    const target =
      this._spawnCount === 0
        ? normalizeAngle(PLAYER.startTheta)
        : this._lastGapCenter + this._randomLaneShift() * LANE_ANGLE;

    ring.id = this._nextId++;
    ring.index = ++this._spawnCount;
    ring.z = z;
    ring.radius = RINGS.outerRadius;
    ring.thickness = RINGS.thickness;
    ring.gapStartLane = this._gapStartLaneFor(target, gapLanes);
    ring.gapLanes = gapLanes;
    ring.gapWidth = gapLanes * LANE_ANGLE;
    ring.layoutTheta = normalizeAngle(
      (ring.gapStartLane + gapLanes / 2) * LANE_ANGLE,
    );
    ring.gapCenterTheta = ring.layoutTheta;
    // Rotation arrives with the difficulty curve in Phase 7.
    ring.rotationSpeed = 0;
    ring.passed = false;

    this._lastGapCenter = ring.gapCenterTheta;

    ring.view.configure(ring);
    ring.view.sync(ring);
    this.rings.push(ring);
  }

  /** Lane whose gap centre lands closest to `theta`. */
  _gapStartLaneFor(theta, gapLanes) {
    const start = Math.round(normalizeAngle(theta) / LANE_ANGLE - gapLanes / 2);
    return ((start % RINGS.lanes) + RINGS.lanes) % RINGS.lanes;
  }

  /**
   * A signed lane offset the player can actually cover before the next gate
   * arrives. Reach is measured against cruise speed even while the ship is
   * still accelerating, so the prefilled gates stay conservative.
   */
  _randomLaneShift() {
    const travelTime = RINGS.spacing / Math.max(this._speed, SPEED.base);
    const reach = PLAYER.maxAngularSpeed * travelTime * RINGS.reachSafety;
    const maxShift = clamp(
      Math.floor(reach / LANE_ANGLE),
      1,
      Math.floor(RINGS.lanes / 2),
    );

    return Math.round((Math.random() * 2 - 1) * maxShift);
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
      radius: RINGS.outerRadius,
      thickness: RINGS.thickness,
      gapCenterTheta: 0,
      gapWidth: 0,
      gapStartLane: 0,
      gapLanes: 0,
      /** Angle the wedges were laid out at; `gapCenterTheta` drifts from it. */
      layoutTheta: 0,
      rotationSpeed: 0,
      passed: false,
      view,
    };
  }

  _release(ring) {
    ring.view.release();
    this._pool.push(ring);
  }
}
