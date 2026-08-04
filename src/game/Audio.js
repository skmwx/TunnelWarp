import { AUDIO, RINGS, SPEED } from "./constants.js";
import { openStorage, readItem, writeItem } from "./storage.js";
import { clamp } from "./tunnelMath.js";

/**
 * The game's audio, synthesised at runtime.
 *
 * Every sound is oscillators and filtered noise built on the fly, so there is
 * no asset pipeline, nothing to preload, and no load state to wait on before a
 * run can start.
 *
 * Nothing exists until the player interacts. Browsers block audio before a
 * gesture, and constructing an `AudioContext` early only earns a suspended
 * context and a console warning, so the context is created inside the first
 * key or pointer event and the listeners that were watching for it are dropped
 * on the spot. Every call before that is a no-op — a game that has not been
 * touched yet has nothing to say.
 *
 * Muting is the same no-op path rather than a silent master, so a muted game
 * schedules no nodes at all.
 */

const STORAGE_KEY = "tunnelwarp.muted.v1";

/** First gesture of any kind unlocks audio; whichever arrives first wins. */
const UNLOCK_EVENTS = ["keydown", "pointerdown", "touchstart"];

/**
 * Semitone offsets of a major pentatonic scale.
 *
 * Pentatonic because the ring chime climbs one step per handful of gates and
 * the pitch of any two consecutive clears is therefore arbitrary: in this scale
 * no pair of steps can land on an interval that sounds like a mistake.
 */
const PENTATONIC = [0, 2, 4, 7, 9];

/** Frequency `step` rungs up the pentatonic ladder from `root`. */
function ladderHz(root, step) {
  const size = PENTATONIC.length;
  const index = ((step % size) + size) % size;
  const octave = Math.floor(step / size);
  return root * 2 ** ((PENTATONIC[index] + 12 * octave) / 12);
}

/** Seconds of white noise, generated once and reused by every noisy sound. */
function buildNoise(ctx) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class AudioEngine {
  /** @param {Storage|null} [storage] Injectable for tests; probed by default. */
  constructor(storage = openStorage()) {
    this._storage = storage;
    this.muted = readItem(storage, STORAGE_KEY) === "1";

    /** True once a gesture has built a live context. */
    this.ready = false;
    this._ctx = null;
    /** Everything one-shot connects here; the drone has its own path. */
    this._bus = null;
    this._noise = null;

    /** Orb pitch climbs within a pod, then resets. */
    this._orbStep = 0;
    this._lastOrbAt = -1;
    /** Last drone settings applied, so a steady speed costs no scheduling. */
    this._droneHz = -1;
    this._droneLevel = -1;

    this._unlock = this._unlock.bind(this);
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, this._unlock);
    }
  }

  /** Mutes or unmutes, and remembers the choice for the next session. */
  setMuted(muted) {
    if (this.muted === muted) return;
    this.muted = muted;

    if (muted) this._silenceDrone();
    writeItem(this._storage, STORAGE_KEY, muted ? "1" : "0");
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  // --- Voices ------------------------------------------------------------

  /**
   * The ring-clear chime. Pitch climbs with the ring count, so how deep into a
   * run the player is can be heard without reading the number.
   */
  ringClear(ring) {
    if (!this._begin()) return;

    const span = Math.max(RINGS.victoryRing - 1, 1);
    const progress = clamp((ring - 1) / span, 0, 1);
    const hz = ladderHz(
      AUDIO.ringRootHz,
      Math.round(progress * (AUDIO.ringSteps - 1)),
    );

    this._blip("sine", hz, hz, 0.22, 0.3);
    this._blip("triangle", hz * 2, hz * 2, 0.08, 0.22, 0.012);
  }

  /**
   * A collected orb. Pitch steps up through the pod and resets between them, so
   * sweeping a whole pod reads as an ascending run rather than three identical
   * ticks.
   */
  orb(count = 1) {
    if (!this._begin()) return;

    const now = this._ctx.currentTime;
    if (now - this._lastOrbAt > 0.5) this._orbStep = 0;
    this._lastOrbAt = now;

    for (let i = 0; i < count; i += 1) {
      const hz = ladderHz(AUDIO.ringRootHz * 2, this._orbStep % 6);
      this._orbStep += 1;
      this._blip("triangle", hz, hz, 0.13, 0.12, i * 0.045);
    }
  }

  /** The meter reaching full: a two-note prompt, quieter than the warp itself. */
  warpReady() {
    if (!this._begin()) return;

    const hz = ladderHz(AUDIO.ringRootHz, 5);
    this._blip("sine", hz, hz, 0.1, 0.14);
    this._blip("sine", hz * 1.5, hz * 1.5, 0.1, 0.2, 0.1);
  }

  /** Warp activation: a rising sweep under a whoosh. */
  warp() {
    if (!this._begin()) return;

    this._blip("sawtooth", 90, 900, 0.16, 0.55);
    this._blip("sine", 660, 1320, 0.11, 0.5, 0.02);
    this._noiseBurst(0.2, 0.7, 400, 6000);
  }

  /** The crash: a filtered impact over a pitch collapsing to nothing. */
  crash() {
    if (!this._begin()) return;

    this._noiseBurst(0.5, 0.75, 2600, 90);
    this._blip("square", 180, 40, 0.28, 0.6);
    this._blip("sawtooth", 90, 30, 0.18, 0.85, 0.03);
  }

  /**
   * A reward milestone: a short arpeggio, pitched higher for each tier so the
   * three of them are told apart by ear.
   *
   * @param {number} tierIndex 0-based position in the reward ladder.
   */
  milestone(tierIndex) {
    if (!this._begin()) return;

    const base = tierIndex * 2;
    for (let i = 0; i < 4; i += 1) {
      const hz = ladderHz(AUDIO.ringRootHz, base + i * 2);
      this._blip("triangle", hz, hz, 0.16, 0.26, i * 0.075);
    }
  }

  /** Ring 66: the fanfare the whole cabinet is built around. */
  victory() {
    if (!this._begin()) return;

    for (let i = 0; i < 6; i += 1) {
      const hz = ladderHz(AUDIO.ringRootHz, i * 2);
      this._blip("triangle", hz, hz, 0.17, 0.4, i * 0.09);
      this._blip("sine", hz * 2, hz * 2, 0.07, 0.3, i * 0.09);
    }
    // A held chord under the run, so the moment lands rather than ticking past.
    const root = ladderHz(AUDIO.ringRootHz, 10);
    this._blip("sine", root, root, 0.13, 1.5, 0.5, 0.12);
    this._blip("sine", root * 1.5, root * 1.5, 0.1, 1.5, 0.5, 0.12);
  }

  /**
   * Tracks the engine drone to the flight.
   *
   * Called every frame, so it applies nothing unless the pitch or the level has
   * actually moved — a run at a steady speed schedules no automation at all.
   *
   * @param {boolean} flying True only while a run is live.
   * @param {number} speed World units per second.
   * @param {number} warp Warp intensity, `0..1`.
   */
  setFlight(flying, speed, warp) {
    if (!this.ready || this.muted) return;

    const range = Math.max(SPEED.cap - SPEED.start, 1);
    const tint = clamp((speed - SPEED.start) / range, 0, 1);
    const hz = Math.round(
      AUDIO.droneHz.start + (AUDIO.droneHz.end - AUDIO.droneHz.start) * tint,
    );
    const level = flying
      ? AUDIO.droneGain + (AUDIO.warpDroneGain - AUDIO.droneGain) * warp
      : 0;

    const now = this._ctx.currentTime;
    if (hz !== this._droneHz) {
      this._droneHz = hz;
      this._droneOscA.frequency.setTargetAtTime(hz, now, 0.2);
      // A fifth above, so the drone thickens rather than beating against itself.
      this._droneOscB.frequency.setTargetAtTime(hz * 1.5, now, 0.2);
    }
    if (Math.abs(level - this._droneLevel) > 0.002) {
      this._droneLevel = level;
      this._droneGain.gain.setTargetAtTime(level, now, 0.18);
    }
  }

  dispose() {
    this._releaseUnlockListeners();
    if (!this._ctx) return;

    this.ready = false;
    this._ctx.close().catch(() => {
      // Already closing, or closed by a navigation. Nothing left to release.
    });
    this._ctx = null;
  }

  // --- Plumbing ----------------------------------------------------------

  /**
   * Gate every voice passes through: false when there is nothing to play into,
   * true with a running context.
   */
  _begin() {
    if (!this.ready || this.muted) return false;

    // A context can be suspended out from under the game by a tab switch or by
    // a policy that only granted it provisionally.
    if (this._ctx.state === "suspended") {
      this._ctx.resume().catch(() => {
        // Still no gesture the browser will accept. The next one retries.
      });
    }
    return true;
  }

  _unlock() {
    this._releaseUnlockListeners();

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;

    try {
      this._ctx = new Ctor();
    } catch {
      // No audio in this browser or this context. The game is unaffected.
      return;
    }

    const master = this._ctx.createGain();
    master.gain.value = AUDIO.masterGain;
    // Several one-shots can overlap on a milestone frame; the compressor keeps
    // that from clipping without having to make every voice timid.
    const limiter = this._ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    master.connect(limiter).connect(this._ctx.destination);

    this._bus = master;
    this._noise = buildNoise(this._ctx);
    this._startDrone();
    this.ready = true;
  }

  _releaseUnlockListeners() {
    for (const type of UNLOCK_EVENTS) {
      window.removeEventListener(type, this._unlock);
    }
  }

  /**
   * Starts the engine drone, silent.
   *
   * It runs for the life of the page — two oscillators are cheaper to leave
   * running than to restart on every state change, and a gain that is ramped
   * rather than gated is what keeps a run from starting with a click.
   */
  _startDrone() {
    const ctx = this._ctx;

    this._droneGain = ctx.createGain();
    this._droneGain.gain.value = 0;

    // The drone is a bed, not a voice: the lowpass keeps its harmonics from
    // competing with the chimes that have to be heard over it.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;

    this._droneOscA = ctx.createOscillator();
    this._droneOscA.type = "sawtooth";
    this._droneOscA.frequency.value = AUDIO.droneHz.start;

    this._droneOscB = ctx.createOscillator();
    this._droneOscB.type = "sawtooth";
    this._droneOscB.frequency.value = AUDIO.droneHz.start * 1.5;
    this._droneOscB.detune.value = 7;

    this._droneOscA.connect(filter);
    this._droneOscB.connect(filter);
    filter.connect(this._droneGain).connect(this._bus);

    this._droneOscA.start();
    this._droneOscB.start();
  }

  /** Drops the drone immediately, e.g. when the player mutes mid-run. */
  _silenceDrone() {
    if (!this.ready) return;
    this._droneLevel = 0;
    this._droneGain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.05);
  }

  /**
   * One enveloped oscillator. Every pitched sound in the game is built from
   * these.
   *
   * Ramps are exponential because loudness and pitch are both perceived that
   * way — a linear fade to zero is heard as an abrupt stop near the end.
   *
   * @param {string} type    Oscillator waveform.
   * @param {number} freq    Starting frequency, Hz.
   * @param {number} endFreq Frequency at the end of the note; equal to `freq`
   *   for a steady tone.
   * @param {number} gain    Peak level.
   * @param {number} duration Seconds from attack to silence.
   * @param {number} [when]   Delay before the note starts, in seconds.
   * @param {number} [attack] Seconds to reach peak.
   */
  _blip(type, freq, endFreq, gain, duration, when = 0, attack = 0.006) {
    const ctx = this._ctx;
    const at = ctx.currentTime + when;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(endFreq, 1),
        at + duration,
      );
    }

    const env = ctx.createGain();
    // Exponential ramps cannot touch zero, so the envelope starts and ends just
    // above it instead.
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(env).connect(this._bus);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /**
   * A burst of noise through a sweeping lowpass. Sweeping down is an impact;
   * sweeping up is a whoosh.
   */
  _noiseBurst(gain, duration, fromHz, toHz, when = 0) {
    const ctx = this._ctx;
    const at = ctx.currentTime + when;

    const source = ctx.createBufferSource();
    source.buffer = this._noise;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(toHz, 1), at + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    source.connect(filter).connect(env).connect(this._bus);
    source.start(at);
    source.stop(at + duration + 0.02);
  }
}
