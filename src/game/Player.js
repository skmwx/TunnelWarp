import * as THREE from "three";

import { PLAYER, WORLD } from "./constants.js";
import {
  approach,
  damp,
  normalizeAngle,
  setTunnelPosition,
  TAU,
} from "./tunnelMath.js";

/**
 * Player state: an angle around the tunnel, and nothing else that moves.
 *
 * This class is deliberately free of Three.js — collision (Phase 5) reads
 * `theta` and `z` directly, and `PlayerView` is the only thing that knows a
 * mesh exists. Radius and Z are fixed, so the ship can never leave the wall.
 */
export class Player {
  constructor() {
    /** Fixed distance from the tunnel axis. */
    this.radius = WORLD.playerRadius;
    /** Fixed depth; the world moves past the player, not the other way round. */
    this.z = WORLD.playerZ;

    /** Cartesian mirror of `theta`, refreshed each update. */
    this.position = { x: 0, y: 0, z: this.z };

    this.reset();
  }

  /** Returns the run to its opening pose. Safe to call in any state. */
  reset() {
    this.theta = normalizeAngle(PLAYER.startTheta);
    this.angularVelocity = 0;
    this._syncPosition();
  }

  /** Angular speed as a signed fraction of maximum, for view effects. */
  get velocityRatio() {
    return this.angularVelocity / PLAYER.maxAngularSpeed;
  }

  /**
   * @param {number} delta Seconds since the previous frame.
   * @param {number} axis  -1 left, 0 idle, +1 right (see `Input.axis`).
   *
   * A positive axis increases `theta`, which moves the ship toward screen-right
   * while it rides the bottom of the tunnel — the direction is one constant
   * rotational sense the whole way around, like a clock hand.
   */
  update(delta, axis) {
    const target = axis * PLAYER.maxAngularSpeed;
    // Coasting decelerates harder than the throttle accelerates, so releasing
    // a key settles the ship instead of letting it drift past the gap.
    const rate = axis === 0 ? PLAYER.damping : PLAYER.acceleration;

    this.angularVelocity = approach(this.angularVelocity, target, rate * delta);
    this.theta = normalizeAngle(this.theta + this.angularVelocity * delta);

    this._syncPosition();
  }

  _syncPosition() {
    setTunnelPosition(this.position, this.theta, this.radius, this.z);
  }
}

/**
 * The UFO mesh and its cosmetic motion (bank, idle spin, rim chase, thruster).
 *
 * Keeping this separate from `Player` means gameplay tuning never has to reason
 * about mesh hierarchy, and the ship's look can be reworked without touching
 * how it moves.
 *
 * The silhouette is built to survive the two things that make a small marker
 * hard to read in this game: it is seen from behind at all times, and it sits
 * against a lit tunnel wall. So the body stays dark and every readable feature
 * is emissive — a hard bright rim, alternating lamps that chase as the saucer
 * spins, and a thruster plume pointed at the camera that stretches with warp.
 */
export class PlayerView {
  constructor() {
    this.object3D = new THREE.Group();
    this._bank = 0;
    this._warp = -1;

    this._buildShip();
  }

  /**
   * Pushes player state onto the mesh.
   *
   * @param {Player} player
   * @param {number} delta
   * @param {number} [warp] Warp intensity, `0..1`. Drives the hull's glow and
   *   spin, so the ship reads as charged rather than merely fast.
   */
  sync(player, delta, warp = 0) {
    const { x, y, z } = player.position;
    this.object3D.position.set(x, y, z);

    // The ship's local +Y must point at the tunnel axis; this rotation is the
    // inverse of the polar placement above.
    const upright = player.theta + Math.PI / 2;

    // Lean into the direction of travel, eased so quick taps do not snap.
    const targetBank = -PLAYER.maxBank * player.velocityRatio;
    this._bank = damp(this._bank, targetBank, PLAYER.bankResponse, delta);

    this.object3D.rotation.z = upright + this._bank;
    this._hull.rotation.y += PLAYER.spinSpeed * (1 + warp * PLAYER.warpSpin) * delta;

    this._applyWarp(warp);
  }

  /** Lights the hull for warp. The value is already eased, so this is a set. */
  _applyWarp(warp) {
    if (Math.abs(warp - this._warp) < 0.002) return;
    this._warp = warp;

    this._hullMaterial.emissiveIntensity =
      PLAYER.hullEmissive + warp * (PLAYER.warpEmissive - PLAYER.hullEmissive);
    this._lamp.intensity = PLAYER.lampIntensity * (1 + warp * PLAYER.warpLamp);

    // The plume is the one part of the ship the player is looking straight down
    // the length of, so stretching it is the clearest read on the screen that
    // the warp is running.
    this._thruster.scale.z =
      PLAYER.thrusterLength * (1 + warp * PLAYER.warpThruster);
    // Grown from its mouth rather than its centre, so it only ever extends back
    // toward the camera instead of pushing through the hull.
    this._thruster.position.z = 0.3 + this._thruster.scale.z * 0.5;
  }

  _buildShip() {
    // Saucer hull: a squashed sphere, dark so the emissive trim reads as the
    // silhouette rather than the body.
    this._hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a0f2a,
      emissive: 0xff3ea5,
      emissiveIntensity: PLAYER.hullEmissive,
      roughness: 0.3,
      metalness: 0.65,
    });

    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 12),
      this._hullMaterial,
    );
    hull.scale.set(1, 0.3, 1);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.055, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3ea5 }),
    );
    rim.rotation.x = Math.PI / 2;
    hull.add(rim);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 20, 10, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0xe8f6ff,
        emissive: 0x46f0ff,
        emissiveIntensity: 0.9,
        roughness: 0.15,
        metalness: 0,
      }),
    );
    dome.position.y = 0.1;
    hull.add(dome);

    // Underglow points at the wall the ship rides, selling the hover.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9ef }),
    );
    glow.position.y = -0.13;
    glow.scale.set(1, 0.6, 1);
    hull.add(glow);

    this._buildRimLights(hull);

    this._hull = hull;
    this.object3D.add(hull);

    // The plume trails toward the camera, which is the one direction the player
    // is always looking along — so it is the cheapest place to put a readout of
    // how hard the ship is flying.
    const plume = new THREE.ConeGeometry(0.2, 1, 12, 1, true);
    // Baked into the geometry rather than set on the mesh, so `scale.z` stretches
    // the plume's length instead of its mouth.
    plume.rotateX(Math.PI / 2);

    this._thruster = new THREE.Mesh(
      plume,
      new THREE.MeshBasicMaterial({
        color: 0x9be8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this._thruster.scale.z = PLAYER.thrusterLength;
    this._thruster.position.z = 0.3 + PLAYER.thrusterLength * 0.5;
    this.object3D.add(this._thruster);

    // A light travelling with the ship keeps it lit once the tunnel (Phase 3)
    // replaces the static placeholder lighting.
    const lamp = new THREE.PointLight(0xff6ec0, PLAYER.lampIntensity, 9, 2);
    lamp.position.y = -0.3;
    this._lamp = lamp;
    this.object3D.add(lamp);
  }

  /**
   * Lamps around the saucer's edge, alternating bright and dim.
   *
   * Parented to the hull rather than animated, so the idle spin already in the
   * ship carries them around: the alternation is what turns that spin into a
   * visible chase, and a chase is what makes a marker this small read as a
   * craft rather than a dot.
   */
  _buildRimLights(hull) {
    const geometry = new THREE.SphereGeometry(0.065, 8, 6);
    const bright = new THREE.MeshBasicMaterial({ color: 0xfff0fb });
    const dim = new THREE.MeshBasicMaterial({ color: 0x8c2a68 });

    for (let i = 0; i < PLAYER.rimLights; i += 1) {
      const theta = (i / PLAYER.rimLights) * TAU;
      const lamp = new THREE.Mesh(geometry, i % 2 === 0 ? bright : dim);
      // On the rim itself: any further in and the hull's own curve hides them
      // from a camera sitting behind and below the ship.
      lamp.position.set(Math.cos(theta) * 0.53, 0, Math.sin(theta) * 0.53);
      // The hull is squashed to 0.3 in Y; undoing that keeps the lamps round.
      lamp.scale.y = 1 / 0.3;
      hull.add(lamp);
    }
  }
}
