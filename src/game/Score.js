import { REWARD_TIERS, SCORE } from "./constants.js";

/**
 * Run scoring, reward tiers, and the persistent local best.
 *
 * The rings cleared are the run's real result; the score is a derived readout
 * over distance flown plus per-gate and milestone bonuses. Both are tracked
 * against their own best, because a long cautious run and a short lucky one
 * are different achievements and neither should quietly overwrite the other.
 *
 * Nothing here touches the DOM or Three.js. `Game` reads these numbers and
 * decides how to show them.
 */

/** Versioned, so a future change to the stored shape ignores old records. */
const STORAGE_KEY = "tunnelwarp.best.v1";

/**
 * The `localStorage` handle, or `null` when storage is unusable.
 *
 * Probed with a real write: private-browsing modes hand back a storage object
 * that only throws once you try to use it, so merely reading `window.localStorage`
 * proves nothing.
 */
function openStorage() {
  try {
    const storage = window.localStorage;
    const probe = `${STORAGE_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** A finite, non-negative integer, or `0`. Stored values are never trusted. */
function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The milestone landed on exactly at `rings`, or `null`. */
function milestoneAt(rings) {
  return REWARD_TIERS.find((tier) => tier.rings === rings) ?? null;
}

/** Highest tier `rings` has earned, or `null` below the first milestone. */
export function rewardTierFor(rings) {
  let earned = null;
  for (const tier of REWARD_TIERS) {
    if (rings >= tier.rings) earned = tier;
  }
  return earned;
}

/** The next milestone ahead of `rings`, or `null` once all are earned. */
export function nextRewardTier(rings) {
  return REWARD_TIERS.find((tier) => rings < tier.rings) ?? null;
}

/** Digit grouping, so five-figure scores stay readable at a glance. */
export function formatScore(score) {
  return Math.floor(score).toLocaleString();
}

export class Score {
  /** @param {Storage|null} [storage] Injectable for tests; probed by default. */
  constructor(storage = openStorage()) {
    this._storage = storage;
    /** False when a best result will not survive a reload. */
    this.persistent = storage !== null;

    this.rings = 0;
    /** World units flown this run; the distance half of the score. */
    this.distance = 0;
    /** Gate and milestone bonuses banked this run. */
    this.bonus = 0;

    this.best = this._load();
    /** Written by `commit`; what the end-of-run overlay reads. */
    this.lastResult = null;
  }

  /** Total score for the current run. Derived, so it can never drift. */
  get score() {
    return Math.floor(this.distance * SCORE.perDistanceUnit + this.bonus);
  }

  /** Reward tier the current run has reached, or `null`. */
  get tier() {
    return rewardTierFor(this.rings);
  }

  /** Clears the run. The best record and its persistence survive. */
  reset() {
    this.rings = 0;
    this.distance = 0;
    this.bonus = 0;
    this.lastResult = null;
  }

  /** Banks the distance flown this frame. */
  addDistance(units) {
    if (units > 0) this.distance += units;
  }

  /**
   * Credits cleared gates. Counted one at a time even when a long frame
   * resolves several, so no milestone bonus can be stepped over.
   */
  addRings(count) {
    for (let i = 0; i < count; i += 1) {
      this.rings += 1;
      this.bonus += SCORE.perRing;

      const milestone = milestoneAt(this.rings);
      if (milestone) this.bonus += milestone.bonus;
    }
  }

  /**
   * Folds the finished run into the best record and persists it.
   *
   * @returns the result the end-of-run overlay reports, which stays readable
   *   until the next run resets it.
   */
  commit() {
    const { rings, score } = this;
    const ringsBeat = rings > this.best.rings;
    const scoreBeat = score > this.best.score;

    if (ringsBeat) this.best.rings = rings;
    if (scoreBeat) this.best.score = score;
    if (ringsBeat || scoreBeat) this._save();

    this.lastResult = {
      rings,
      score,
      ringsBeat,
      scoreBeat,
      tier: rewardTierFor(rings),
    };
    return this.lastResult;
  }

  _load() {
    const fallback = { rings: 0, score: 0 };
    if (!this._storage) return fallback;

    try {
      const raw = this._storage.getItem(STORAGE_KEY);
      if (!raw) return fallback;

      const parsed = JSON.parse(raw);
      return { rings: toCount(parsed?.rings), score: toCount(parsed?.score) };
    } catch {
      // Missing, unreadable, or corrupt. Starting from zero is always better
      // than failing to boot over a leaderboard.
      return fallback;
    }
  }

  _save() {
    if (!this._storage) return;

    try {
      this._storage.setItem(STORAGE_KEY, JSON.stringify(this.best));
    } catch {
      // Quota, or a mode that allows reads but blocks writes. The in-memory
      // best still stands for this session; no part of a run depends on it.
      this.persistent = false;
    }
  }
}
