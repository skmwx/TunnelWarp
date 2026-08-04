/**
 * Stateful keyboard handler.
 *
 * The game loop polls this object instead of reacting to key events directly,
 * so movement stays framerate-independent and start/restart cannot re-fire
 * while a key is held down.
 */

const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const ACTION_KEYS = new Set(["Space", "Enter", "NumpadEnter"]);
const MUTE_KEYS = new Set(["KeyM"]);

// Keys we own during play; the browser must not scroll or activate anything.
const HANDLED_KEYS = new Set([
  ...LEFT_KEYS,
  ...RIGHT_KEYS,
  ...ACTION_KEYS,
  ...MUTE_KEYS,
]);

export class Input {
  constructor(target = window) {
    this.target = target;

    this.left = false;
    this.right = false;

    /** True for exactly one poll after the action key is pressed. */
    this.actionPressed = false;
    this.actionHeld = false;

    /** Same one-shot contract as the action key, for the mute toggle. */
    this.mutePressed = false;
    this.muteHeld = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);
    this.target.addEventListener("blur", this._onBlur);
  }

  /** -1 (counterclockwise), 0, or 1 (clockwise). Opposing keys cancel out. */
  get axis() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  /**
   * Consumes the one-shot action press. Returns true only on the frame that
   * follows a fresh key-down, so holding Space cannot spam restarts.
   */
  consumeAction() {
    const pressed = this.actionPressed;
    this.actionPressed = false;
    return pressed;
  }

  /** Consumes the one-shot mute press. Holding the key toggles once. */
  consumeMute() {
    const pressed = this.mutePressed;
    this.mutePressed = false;
    return pressed;
  }

  /** Clears transient state, e.g. when a run ends or the tab is hidden. */
  reset() {
    this.left = false;
    this.right = false;
    this.actionPressed = false;
    this.actionHeld = false;
    this.mutePressed = false;
    this.muteHeld = false;
  }

  dispose() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    this.target.removeEventListener("blur", this._onBlur);
  }

  _onKeyDown(event) {
    if (!HANDLED_KEYS.has(event.code)) return;
    // Chords belong to the browser and the OS — `Ctrl+M` and `Cmd+M` are real
    // shortcuts, and no one plays holding a modifier. Only key-down is gated:
    // gating key-up too would strand a key that was pressed clean and released
    // with a modifier held.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();

    if (LEFT_KEYS.has(event.code)) this.left = true;
    if (RIGHT_KEYS.has(event.code)) this.right = true;

    if (ACTION_KEYS.has(event.code)) {
      // event.repeat covers OS key repeat; actionHeld covers the gap between
      // repeats and any browser that omits the flag.
      if (!event.repeat && !this.actionHeld) this.actionPressed = true;
      this.actionHeld = true;
    }

    if (MUTE_KEYS.has(event.code)) {
      if (!event.repeat && !this.muteHeld) this.mutePressed = true;
      this.muteHeld = true;
    }
  }

  _onKeyUp(event) {
    if (!HANDLED_KEYS.has(event.code)) return;
    event.preventDefault();

    if (LEFT_KEYS.has(event.code)) this.left = false;
    if (RIGHT_KEYS.has(event.code)) this.right = false;
    if (ACTION_KEYS.has(event.code)) this.actionHeld = false;
    if (MUTE_KEYS.has(event.code)) this.muteHeld = false;
  }

  _onBlur() {
    // Without this, a key held while alt-tabbing stays "down" forever.
    this.reset();
  }
}
