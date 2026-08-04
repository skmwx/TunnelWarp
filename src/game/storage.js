/**
 * Guarded `localStorage` access.
 *
 * Two things store a preference across sessions — the best result and the mute
 * setting — and neither is allowed to be able to break a run. Every entry point
 * here swallows its own failures and reports them as a plain `null` or `false`,
 * so callers never need a `try` of their own.
 */

const PROBE_KEY = "tunnelwarp.probe";

/**
 * The `localStorage` handle, or `null` when storage is unusable.
 *
 * Probed with a real write: private-browsing modes hand back a storage object
 * that only throws once you try to use it, so merely reading
 * `window.localStorage` proves nothing.
 */
export function openStorage() {
  try {
    const storage = window.localStorage;
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

/** The stored string for `key`, or `null` if it is missing or unreadable. */
export function readItem(storage, key) {
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Stores `value` under `key`.
 *
 * @returns {boolean} False if the write did not happen — quota, or a mode that
 *   allows reads but blocks writes. Callers use it to stop promising the player
 *   that anything is being saved.
 */
export function writeItem(storage, key, value) {
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
