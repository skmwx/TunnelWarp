import * as THREE from "three";

import { EFFECTS, WORLD } from "./constants.js";
import { TAU } from "./tunnelMath.js";

/**
 * The feedback layer: the ship's trail, the sparks a pickup throws, the burst
 * a crash throws, and the camera shake that sells the impact.
 *
 * All of it is one pooled particle field — a single `THREE.Points` with a fixed
 * capacity, drawn in one call, allocating nothing after construction. Motes
 * fade by having their colour driven toward black, which under additive
 * blending *is* the fade-out; that keeps the whole layer on a stock material
 * with no custom shader and no per-mote transparency to sort.
 *
 * Nothing here reads or writes game state. `Game` fires these on the moments
 * that deserve them, and everything is short-lived by construction, so no
 * effect can still be on screen by the time the next gate has to be read.
 */

const TRAIL_COLOR = new THREE.Color(EFFECTS.trail.color);
const TRAIL_WARP_COLOR = new THREE.Color(EFFECTS.trail.warpColor);
const SPARKLE_COLOR = new THREE.Color(EFFECTS.sparkle.color);
const BURST_COLOR = new THREE.Color(EFFECTS.burst.color);
const CHEER_COLOR = new THREE.Color(EFFECTS.cheer.color);

/** Scratch colour, so emitting a tinted mote allocates nothing. */
const _tint = new THREE.Color();

/**
 * The sprite every mote is drawn with: a soft radial falloff, built once into a
 * small canvas.
 *
 * Untextured points are hard squares, which at the sizes this game needs read
 * as debris rather than as light. A falloff also lets neighbouring motes sum
 * into one continuous glow, which is what turns a stream of them into a ribbon
 * instead of a dotted line.
 */
function buildMoteTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.65)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

/** A symmetric random offset in `-half .. half`. */
function jitter(half) {
  return (Math.random() * 2 - 1) * half;
}

/**
 * A fixed-capacity particle pool.
 *
 * Live motes are kept packed at the front of every array, so the draw range is
 * a prefix and expiry is a swap with the last live mote rather than a splice.
 */
class ParticleField {
  constructor(capacity, size) {
    this.capacity = capacity;
    this.count = 0;

    this._position = new Float32Array(capacity * 3);
    this._color = new Float32Array(capacity * 3);
    this._velocity = new Float32Array(capacity * 3);
    /** Colour at full brightness; the live colour is this scaled by fade. */
    this._base = new Float32Array(capacity * 3);
    this._life = new Float32Array(capacity);
    this._maxLife = new Float32Array(capacity);
    this._drag = new Float32Array(capacity);

    const geometry = new THREE.BufferGeometry();
    this._positionAttribute = new THREE.BufferAttribute(this._position, 3);
    this._colorAttribute = new THREE.BufferAttribute(this._color, 3);
    this._positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this._colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", this._positionAttribute);
    geometry.setAttribute("color", this._colorAttribute);
    geometry.setDrawRange(0, 0);

    this._texture = buildMoteTexture();
    const material = new THREE.PointsMaterial({
      size,
      map: this._texture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geometry, material);
    // The pool's bounding box is never recomputed, and motes fly outside the
    // one it was born with; culling on it would blink the whole field out.
    this.points.frustumCulled = false;

    this._geometry = geometry;
    this._material = material;
  }

  /**
   * @param {THREE.Color} color
   * @param {number} drag Per-second exponential decay of the mote's own
   *   velocity. `0` leaves it riding the world and nothing else.
   */
  spawn(x, y, z, vx, vy, vz, color, life, drag = 0) {
    // Full means full: dropping the newest mote is invisible, while stealing
    // the oldest would clip the tail off whatever is mid-flight.
    if (this.count >= this.capacity) return;

    const i = this.count;
    this.count += 1;
    const p = i * 3;

    this._position[p] = x;
    this._position[p + 1] = y;
    this._position[p + 2] = z;
    this._velocity[p] = vx;
    this._velocity[p + 1] = vy;
    this._velocity[p + 2] = vz;
    this._base[p] = color.r;
    this._base[p + 1] = color.g;
    this._base[p + 2] = color.b;
    this._color[p] = color.r;
    this._color[p + 1] = color.g;
    this._color[p + 2] = color.b;
    this._life[i] = life;
    this._maxLife[i] = life;
    this._drag[i] = drag;
  }

  /**
   * @param {number} worldSpeed The tunnel's scroll speed. Motes are dropped
   *   into the world, so they drift back past the camera exactly as the tunnel
   *   does — which is what makes a trail read as left behind rather than towed.
   */
  update(delta, worldSpeed) {
    // An empty field that was already empty has nothing to upload. Menus sit in
    // this state indefinitely, and `needsUpdate` re-uploads the whole buffer.
    if (this.count === 0 && this._geometry.drawRange.count === 0) return;

    const dz = worldSpeed * delta;

    for (let i = 0; i < this.count; ) {
      this._life[i] -= delta;
      if (this._life[i] <= 0) {
        this._retire(i);
        continue;
      }

      const p = i * 3;
      if (this._drag[i] > 0) {
        const decay = Math.exp(-this._drag[i] * delta);
        this._velocity[p] *= decay;
        this._velocity[p + 1] *= decay;
        this._velocity[p + 2] *= decay;
      }

      this._position[p] += this._velocity[p] * delta;
      this._position[p + 1] += this._velocity[p + 1] * delta;
      this._position[p + 2] += this._velocity[p + 2] * delta + dz;

      const fade = this._life[i] / this._maxLife[i];
      this._color[p] = this._base[p] * fade;
      this._color[p + 1] = this._base[p + 1] * fade;
      this._color[p + 2] = this._base[p + 2] * fade;

      i += 1;
    }

    this._geometry.setDrawRange(0, this.count);
    this._positionAttribute.needsUpdate = true;
    this._colorAttribute.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this._geometry.setDrawRange(0, 0);
  }

  dispose() {
    this._geometry.dispose();
    this._material.dispose();
    this._texture.dispose();
  }

  /** Drops mote `i` by moving the last live one into its slot. */
  _retire(i) {
    const last = this.count - 1;
    if (i !== last) {
      const to = i * 3;
      const from = last * 3;
      for (let k = 0; k < 3; k += 1) {
        this._position[to + k] = this._position[from + k];
        this._color[to + k] = this._color[from + k];
        this._velocity[to + k] = this._velocity[from + k];
        this._base[to + k] = this._base[from + k];
      }
      this._life[i] = this._life[last];
      this._maxLife[i] = this._maxLife[last];
      this._drag[i] = this._drag[last];
    }
    this.count = last;
  }
}

export class Effects {
  constructor() {
    this.object3D = new THREE.Group();

    this._field = new ParticleField(
      EFFECTS.particleCapacity,
      EFFECTS.particleSize,
    );
    this.object3D.add(this._field.points);

    /** Camera offset for this frame; `Game` adds it to the chase position. */
    this.shakeX = 0;
    this.shakeY = 0;
    /** Remaining shake amplitude, in world units. */
    this._shake = 0;
    /** Flight distance owed to the trail emitter, in world units. */
    this._trailDistance = 0;
  }

  update(delta, worldSpeed) {
    this._field.update(delta, worldSpeed);
    this._updateShake(delta);
  }

  /**
   * Streams the ship's trail. Motes are dropped at the ride radius and left to
   * the world, so the ribbon traces the arc the ship actually flew.
   *
   * @param {{theta: number, z: number}} player
   * @param {number} speed Forward speed; the emitter is spaced by distance
   *   flown, not by time, so the wake reads the same at every speed.
   * @param {number} warp Warp intensity, `0..1`: a warp leaves a wake that is
   *   thicker and closer to white.
   */
  trail(player, delta, speed, warp) {
    const trail = EFFECTS.trail;
    this._trailDistance += speed * delta;
    if (this._trailDistance < trail.spacing) return;

    _tint.copy(TRAIL_COLOR).lerp(TRAIL_WARP_COLOR, warp);
    const extra = Math.round(trail.warpBurst * warp);

    while (this._trailDistance >= trail.spacing) {
      this._trailDistance -= trail.spacing;
      // What is left over is how far the world has moved since this mote was
      // due, so it is dropped that much further back. Without it, a frame's
      // worth of motes would pile up at one Z and the wake would bead at speed.
      const lag = this._trailDistance;

      for (let i = 0; i <= extra; i += 1) {
        const theta = player.theta + jitter(trail.spread);
        const radius = WORLD.playerRadius + trail.radiusOffset + jitter(trail.spread);
        this._field.spawn(
          Math.cos(theta) * radius,
          Math.sin(theta) * radius,
          player.z + lag + jitter(0.06),
          0,
          0,
          0,
          _tint,
          trail.life,
        );
      }
    }
  }

  /** A collected orb: a tight puff at the ship. */
  sparkle(theta, z) {
    this._scatter(theta, z, EFFECTS.sparkle, SPARKLE_COLOR, 1);
  }

  /** The crash: a hard burst thrown out from the point of impact. */
  burst(theta, z) {
    this._scatter(theta, z, EFFECTS.burst, BURST_COLOR, 1);
  }

  /**
   * A milestone or the jackpot: a shower thrown right around the tunnel rather
   * than out from the ship, so it reads as the run being celebrated rather than
   * as something happening to the ship.
   *
   * @param {number} z Where down the tunnel it goes off. Mid-run that has to be
   *   ahead of the ship — see `EFFECTS.cheerLead`.
   */
  cheer(z) {
    this._scatter(0, z, EFFECTS.cheer, CHEER_COLOR, TAU);
  }

  /** Adds shake energy, capped so stacked events cannot rattle the frame apart. */
  shake(amount) {
    this._shake = Math.min(this._shake + amount, EFFECTS.shake.crash);
  }

  /** Clears every live mote and settles the camera. Call when a run starts. */
  reset() {
    this._field.clear();
    this._trailDistance = 0;
    this._shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  dispose() {
    this._field.dispose();
  }

  // --- Internals ---------------------------------------------------------

  /**
   * Throws `spec.count` motes off the tunnel wall.
   *
   * Thrown *inward*, into the open tube, plus a shove toward the camera. The
   * ship rides just inside a solid wall, so anything flung the other way is
   * hidden behind it within a few frames — and a burst that only moves in the
   * frame plane reads as flat when the player is looking down the tunnel.
   *
   * @param {number} arc Radians the motes are spread over: a small number keeps
   *   the throw local to `theta`, `TAU` rings the whole tunnel.
   */
  _scatter(theta, z, spec, color, arc) {
    for (let i = 0; i < spec.count; i += 1) {
      const angle = theta + jitter(arc / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const push = spec.speed * (0.35 + Math.random() * 0.65);
      const inward = -push * (0.25 + Math.random() * 0.5);
      // Along the wall, so the spray fans out instead of collapsing to a line.
      const along = jitter(push * 0.45);

      this._field.spawn(
        cos * WORLD.playerRadius,
        sin * WORLD.playerRadius,
        z + jitter(0.3),
        cos * inward - sin * along,
        sin * inward + cos * along,
        push * (0.3 + Math.random() * 0.5),
        color,
        spec.life * (0.6 + Math.random() * 0.4),
        spec.drag,
      );
    }
  }

  _updateShake(delta) {
    if (this._shake <= 0.001) {
      // Settle exactly, so the camera stops rather than jittering forever at an
      // amplitude too small to see but large enough to keep writing.
      if (this._shake !== 0) {
        this._shake = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
      return;
    }

    this._shake *= Math.exp(-EFFECTS.shake.decay * delta);
    this.shakeX = jitter(this._shake);
    this.shakeY = jitter(this._shake);
  }
}
