import { REWARD_TIERS, SCORE } from "./constants.js";
import { openStorage, readItem, writeItem } from "./storage.js";

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

/**
 * The highest milestone crossed by going from `from` rings to `to`, or `null`.
 *
 * A frame that resolves several gates at once can step over a milestone, and a
 * milestone the player earned but never saw celebrated is worse than no
 * celebration at all.
 */
export function milestoneBetween(from, to) {
  let crossed = null;
  for (const tier of REWARD_TIERS) {
    if (tier.rings > from && tier.rings <= to) crossed = tier;
  }
  return crossed;
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
    /** Warp orbs collected this run. Reported, but never a best in its own right. */
    this.orbs = 0;
    /** Gate, orb, and milestone bonuses banked this run. */
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
    this.orbs = 0;
    this.bonus = 0;
    this.lastResult = null;
  }

  /** Banks the distance flown this frame. */
  addDistance(units) {
    if (units > 0) this.distance += units;
  }

  /** Credits collected warp orbs. The meter itself is `Game`'s to track. */
  addOrbs(count) {
    if (count <= 0) return;
    this.orbs += count;
    this.bonus += count * SCORE.perOrb;
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
      orbs: this.orbs,
      ringsBeat,
      scoreBeat,
      tier: rewardTierFor(rings),
    };
    return this.lastResult;
  }

  _load() {
    const fallback = { rings: 0, score: 0 };
    const raw = readItem(this._storage, STORAGE_KEY);
    if (!raw) return fallback;

    try {
      const parsed = JSON.parse(raw);
      return { rings: toCount(parsed?.rings), score: toCount(parsed?.score) };
    } catch {
      // Corrupt. Starting from zero is always better than failing to boot over
      // a leaderboard.
      return fallback;
    }
  }

  _save() {
    // A refused write — quota, or a mode that allows reads but blocks them —
    // leaves the in-memory best standing for this session; no part of a run
    // depends on it. The start screen stops promising it will be saved.
    if (!writeItem(this._storage, STORAGE_KEY, JSON.stringify(this.best))) {
      this.persistent = false;
    }
  }
}
