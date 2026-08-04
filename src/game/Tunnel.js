import * as THREE from "three";

import { SPEED, TUNNEL, WORLD } from "./constants.js";
import { clamp, TAU } from "./tunnelMath.js";

/**
 * Colour pairs for the speed tint. Each material lerps from its "cold" cruise
 * colour toward its "hot" colour as forward speed climbs, so the tunnel reads
 * faster before the player has consciously noticed the speed change.
 */
const HOOP_COLD = new THREE.Color(0x1d6a8e);
const HOOP_HOT = new THREE.Color(0x7b3ad0);
const ACCENT_COLD = new THREE.Color(0x46f0ff);
const ACCENT_HOT = new THREE.Color(0xff6ec0);
const RAIL_COLD = new THREE.Color(0x123a52);
const RAIL_HOT = new THREE.Color(0x40265e);

/**
 * The tunnel shell the player flies through.
 *
 * Three layers, cheapest first:
 *  - a dark open cylinder that gives the tube body and catches the ship's light
 *  - static longitudinal rails that describe the curve of the wall
 *  - a band of hoops that scroll toward the camera and recycle to the far end
 *
 * Only the hoops move: continuous rails have no features to track, so scrolling
 * them would cost draw calls for no readable motion. Nothing here is spawned or
 * destroyed during play, so the object count is fixed for the whole session.
 */
export class Tunnel {
  constructor() {
    this.object3D = new THREE.Group();

    this._speed = SPEED.idle;
    /** Cached tint parameter, so materials are only touched when it moves. */
    this._tint = -1;

    /** Z span of the hoop band; a recycled hoop jumps back exactly this far. */
    this._length = TUNNEL.hoopCount * TUNNEL.hoopSpacing;
    /** Once a hoop passes this Z it is behind the camera and can be reused. */
    this._recycleZ = WORLD.cameraZ + TUNNEL.hoopSpacing;

    this._hoops = [];
    this._geometries = [];

    this._buildWall();
    this._buildRails();
    this._buildHoops();
    this._applyTint();
  }

  /** Sets the scroll speed in world units per second. */
  setSpeed(speed) {
    this._speed = speed;
  }

  update(delta) {
    const dz = this._speed * delta;

    for (const hoop of this._hoops) {
      hoop.position.z += dz;
      if (hoop.position.z > this._recycleZ) {
        hoop.position.z -= this._length;
      }
    }

    this._applyTint();
  }

  /** Returns every hoop to its opening position so runs start identically. */
  reset() {
    for (const hoop of this._hoops) {
      hoop.position.z = hoop.userData.baseZ;
    }
    this._speed = SPEED.idle;
    this._applyTint();
  }

  dispose() {
    for (const geometry of this._geometries) geometry.dispose();
    this._wallMaterial.dispose();
    this._railMaterial.dispose();
    this._hoopMaterial.dispose();
    this._accentMaterial.dispose();
  }

  // --- Construction ------------------------------------------------------

  get _wallLength() {
    return this._length + TUNNEL.wallOverhang * 2;
  }

  /** Centre of the wall cylinder, covering the hoop band plus overhang. */
  get _wallCenterZ() {
    return this._recycleZ - this._length / 2;
  }

  _buildWall() {
    const geometry = new THREE.CylinderGeometry(
      WORLD.tunnelRadius,
      WORLD.tunnelRadius,
      this._wallLength,
      48,
      1,
      true,
    );
    this._geometries.push(geometry);

    this._wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b0724,
      roughness: 0.85,
      metalness: 0.1,
      // We fly inside the tube, so only the inward-facing surface is drawn.
      side: THREE.BackSide,
    });

    const wall = new THREE.Mesh(geometry, this._wallMaterial);
    wall.rotation.x = Math.PI / 2;
    wall.position.z = this._wallCenterZ;
    this.object3D.add(wall);
  }

  _buildRails() {
    const geometry = new THREE.BoxGeometry(
      TUNNEL.railThickness,
      TUNNEL.railThickness,
      this._wallLength,
    );
    this._geometries.push(geometry);

    this._railMaterial = new THREE.MeshBasicMaterial({
      color: RAIL_COLD.clone(),
    });

    // Just inside the wall, so rails are never swallowed by its surface.
    const radius = WORLD.tunnelRadius - TUNNEL.railThickness;

    for (let i = 0; i < TUNNEL.railCount; i += 1) {
      const theta = (i / TUNNEL.railCount) * TAU;
      const rail = new THREE.Mesh(geometry, this._railMaterial);
      rail.position.set(
        Math.cos(theta) * radius,
        Math.sin(theta) * radius,
        this._wallCenterZ,
      );
      this.object3D.add(rail);
    }
  }

  _buildHoops() {
    const hoopGeometry = new THREE.TorusGeometry(
      WORLD.tunnelRadius,
      TUNNEL.hoopTube,
      6,
      40,
    );
    const accentGeometry = new THREE.TorusGeometry(
      WORLD.tunnelRadius,
      TUNNEL.accentTube,
      6,
      48,
    );
    this._geometries.push(hoopGeometry, accentGeometry);

    this._hoopMaterial = new THREE.MeshBasicMaterial({
      color: HOOP_COLD.clone(),
    });
    this._accentMaterial = new THREE.MeshBasicMaterial({
      color: ACCENT_COLD.clone(),
    });

    for (let i = 1; i <= TUNNEL.hoopCount; i += 1) {
      // `hoopCount` is a multiple of `accentEvery`, so the accent beat stays
      // regular across the recycle seam.
      const accent = i % TUNNEL.accentEvery === 0;
      const hoop = new THREE.Mesh(
        accent ? accentGeometry : hoopGeometry,
        accent ? this._accentMaterial : this._hoopMaterial,
      );

      hoop.position.z = this._recycleZ - i * TUNNEL.hoopSpacing;
      hoop.userData.baseZ = hoop.position.z;

      this._hoops.push(hoop);
      this.object3D.add(hoop);
    }
  }

  // --- Presentation ------------------------------------------------------

  _applyTint() {
    const range = Math.max(SPEED.max - SPEED.base, 1);
    const tint = clamp((this._speed - SPEED.base) / range, 0, 1);
    if (Math.abs(tint - this._tint) < 0.002) return;
    this._tint = tint;

    this._hoopMaterial.color.lerpColors(HOOP_COLD, HOOP_HOT, tint);
    this._accentMaterial.color.lerpColors(ACCENT_COLD, ACCENT_HOT, tint);
    this._railMaterial.color.lerpColors(RAIL_COLD, RAIL_HOT, tint);
  }
}
