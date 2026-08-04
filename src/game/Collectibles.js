import * as THREE from "three";

import { resolvePickups } from "./Collision.js";
import { SPEED, WARP, WORLD } from "./constants.js";
import { angularDelta, normalizeAngle, setTunnelPosition } from "./tunnelMath.js";

/**
 * The warp energy field: pods of orbs strung along the flight path.
 *
 * Placement is derived from the gates rather than rolled independently. Each
 * gate publishes `arrivalTheta`, the angle the ship has to be at when that gate
 * reaches it; a pod is laid in the stretch between two gates, interpolating
 * from the first angle to the second. So an orb always sits on a line the
 * player could fly, and never inside a blocked segment — orbs are placed
 * between gates in Z, and the tightest gate spacing in the game is an order of
 * magnitude wider than a gate's contact band.
 *
 * That also means chasing energy pulls the player *onto* the ideal line rather
 * than off it. The whole layer is optional: ignoring every orb costs only the
 * bonus points and the warp.
 *
 * Like `Obstacles`, the orb list is plain data — an angle, a Z, and the Z it
 * came from — so `Collision` can settle collection in polar arithmetic. Meshes
 * are pooled and never rebuilt.
 */
export class Collectibles {
  constructor() {
    this.object3D = new THREE.Group();

    /** Active orbs, ordered nearest (largest Z) to furthest. */
    this.orbs = [];

    this._pool = [];
    this._speed = SPEED.idle;
    /** Highest gate id a pod has already been considered for. */
    this._lastRingId = 0;

    // A faceted core inside a smooth shell: the facets catch the eye at
    // distance, and the shell stays a glow up close instead of resolving into
    // a second, duller crystal.
    this._coreGeometry = new THREE.IcosahedronGeometry(WARP.orbRadius, 0);
    this._haloGeometry = new THREE.SphereGeometry(WARP.orbRadius * 2.1, 12, 8);

    this._coreMaterial = new THREE.MeshBasicMaterial({ color: 0xd8fbff });
    // Additive and depth-write free, so the halo glows over the tunnel wall
    // instead of punching a hole in whatever is behind it.
    this._haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x46f0ff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /** Sets the approach speed in world units per second. */
  setSpeed(speed) {
    this._speed = speed;
  }

  /** Clears the field. Pods are laid again as gates spawn. */
  reset() {
    while (this.orbs.length) this._release(this.orbs.pop());
    this._lastRingId = 0;
  }

  /**
   * @param {number} delta
   * @param {Array<object>} rings Live gates from `Obstacles`, nearest first.
   */
  update(delta, rings) {
    const dz = this._speed * delta;

    for (const orb of this.orbs) {
      // Collection tests the span the orb swept, not where it landed.
      orb.prevZ = orb.z;
      orb.z += dz;

      orb.mesh.position.z = orb.z;
      orb.mesh.rotation.y += WARP.spinSpeed * delta;
      orb.mesh.rotation.x += WARP.spinSpeed * 0.6 * delta;
    }

    while (this.orbs.length && this.orbs[0].z > WARP.despawnZ) {
      this._release(this.orbs.shift());
    }

    this._layPods(rings);
  }

  /**
   * Banks every orb the ship swept through this frame.
   *
   * @param {{theta: number, z: number}} player
   * @returns {number} Orbs collected, for the meter and the score.
   */
  collect(player) {
    const collected = resolvePickups(this.orbs, player);
    if (collected > 0) this._sweepCollected();
    return collected;
  }

  dispose() {
    while (this.orbs.length) this._release(this.orbs.pop());
    this._coreGeometry.dispose();
    this._haloGeometry.dispose();
    this._coreMaterial.dispose();
    this._haloMaterial.dispose();
  }

  // --- Spawning ----------------------------------------------------------

  /**
   * Lays a pod in every gate-to-gate stretch that has not been offered one.
   *
   * Gate ids only ever increase, and gates are appended to the far end of the
   * list, so one watermark is enough to find the new stretches without
   * rescanning or tagging the gate records.
   */
  _layPods(rings) {
    for (let i = 1; i < rings.length; i += 1) {
      const ring = rings[i];
      if (ring.id <= this._lastRingId) continue;

      this._lastRingId = ring.id;
      this._layPod(rings[i - 1], ring);
    }
  }

  /**
   * Strings one pod between two consecutive gates.
   *
   * `near` arrives first, so the pod runs from its arrival angle to `far`'s,
   * spread evenly through the Z between them. The ends are left clear: an orb
   * sitting on a gate would be unreadable against it, and would blur the line
   * between the thing that ends the run and the thing that rewards it.
   */
  _layPod(near, far) {
    if (Math.random() >= WARP.podChance) return;

    const span = near.z - far.z;
    const turn = angularDelta(near.arrivalTheta, far.arrivalTheta);

    for (let i = 0; i < WARP.podSize; i += 1) {
      const t = (i + 1) / (WARP.podSize + 1);
      this._spawn(
        near.z - span * t,
        normalizeAngle(near.arrivalTheta + turn * t),
      );
    }
  }

  _spawn(z, theta) {
    const orb = this._acquire();

    orb.z = z;
    orb.prevZ = z;
    orb.theta = theta;
    orb.collected = false;

    // Orbs ride the player's radius, so collecting one is purely a question of
    // angle — the same single axis the whole game is played on.
    setTunnelPosition(orb.mesh.position, theta, WORLD.playerRadius, z);
    orb.mesh.visible = true;

    this.orbs.push(orb);
  }

  // --- Pooling -----------------------------------------------------------

  _acquire() {
    const pooled = this._pool.pop();
    if (pooled) return pooled;

    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this._coreGeometry, this._coreMaterial));
    mesh.add(new THREE.Mesh(this._haloGeometry, this._haloMaterial));
    mesh.visible = false;
    // Parented once and hidden when idle; never re-added.
    this.object3D.add(mesh);

    return { theta: 0, z: 0, prevZ: 0, collected: false, mesh };
  }

  /** Drops collected orbs, preserving order and allocating nothing. */
  _sweepCollected() {
    let write = 0;
    for (let read = 0; read < this.orbs.length; read += 1) {
      const orb = this.orbs[read];
      if (orb.collected) {
        this._release(orb);
      } else {
        this.orbs[write] = orb;
        write += 1;
      }
    }
    this.orbs.length = write;
  }

  _release(orb) {
    orb.mesh.visible = false;
    this._pool.push(orb);
  }
}
