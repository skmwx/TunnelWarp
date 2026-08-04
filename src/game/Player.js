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
 * The UFO mesh and its cosmetic motion (bank, idle spin, underglow).
 *
 * Keeping this separate from `Player` means gameplay tuning never has to
 * reason about mesh hierarchy, and the ship can be replaced wholesale in
 * Phase 9 without touching movement.
 */
export class PlayerView {
  constructor() {
    this.object3D = new THREE.Group();
    this._bank = 0;

    this._buildShip();
  }

  /**
   * Pushes player state onto the mesh.
   *
   * @param {Player} player
   * @param {number} delta
   */
  sync(player, delta) {
    const { x, y, z } = player.position;
    this.object3D.position.set(x, y, z);

    // The ship's local +Y must point at the tunnel axis; this rotation is the
    // inverse of the polar placement above.
    const upright = player.theta + Math.PI / 2;

    // Lean into the direction of travel, eased so quick taps do not snap.
    const targetBank = -PLAYER.maxBank * player.velocityRatio;
    this._bank = damp(this._bank, targetBank, PLAYER.bankResponse, delta);

    this.object3D.rotation.z = upright + this._bank;
    this._hull.rotation.y += PLAYER.spinSpeed * delta;
  }

  _buildShip() {
    // Saucer hull: a squashed sphere, dark so the emissive trim reads as the
    // silhouette rather than the body.
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 12),
      new THREE.MeshStandardMaterial({
        color: 0x2a0f2a,
        emissive: 0xff3ea5,
        emissiveIntensity: 0.28,
        roughness: 0.3,
        metalness: 0.65,
      }),
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

    this._hull = hull;
    this.object3D.add(hull);

    // A light travelling with the ship keeps it lit once the tunnel (Phase 3)
    // replaces the static placeholder lighting.
    const lamp = new THREE.PointLight(0xff6ec0, 22, 9, 2);
    lamp.position.y = -0.3;
    this.object3D.add(lamp);
  }
}
