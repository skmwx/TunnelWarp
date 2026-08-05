/**
 * Stateful keyboard and gamepad handler.
 *
 * The game loop polls this object instead of reacting to key events directly,
 * so movement stays framerate-independent and start/restart cannot re-fire
 * while a key is held down. The gamepad has no events to react to at all — it
 * is sampled once per frame from `poll()`, which is the same shape, so both
 * devices feed the same one-shot/held contract.
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

/**
 * Sticks rest a little off centre and jitter around it, so anything under this
 * is not a steering input. Past it the value is rescaled from zero, which keeps
 * fine control at the edge of the deadzone instead of snapping to a quarter turn.
 */
const STICK_DEADZONE = 0.2;

/** A trigger is analog; anything past half travel counts as a press. */
const BUTTON_THRESHOLD = 0.5;

/** Right stick X under the W3C standard mapping, which is what a DualShock 4
 *  reports on every current desktop browser. */
const STANDARD_STEER_AXIS = 2;

/**
 * Which axis is the right stick's horizontal travel.
 *
 * Under the standard mapping this is fixed. A pad the browser could not map
 * exposes the raw device layout instead, and there the six-axis form is the
 * one a DualShock 4 takes when its triggers are reported as axes — pushing the
 * right stick out to index 3, with index 2 being a trigger that rests at -1 and
 * would otherwise read as a permanent hard turn.
 */
function steerAxisIndex(pad) {
  if (pad.mapping === "standard") return STANDARD_STEER_AXIS;
  return pad.axes.length >= 6 ? 3 : STANDARD_STEER_AXIS;
}

/**
 * Silences stick noise, then rescales what is left so the usable travel still
 * spans the full `0..1`. Without the rescale the ship would jump to a fifth of
 * its turn rate the moment the stick left the deadzone.
 */
function deadzone(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= STICK_DEADZONE) return 0;

  const scaled = (magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return Math.sign(value) * Math.min(scaled, 1);
}

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

    /** Right stick, `-1..1`, deadzoned. Refreshed by `poll()` every frame. */
    this.stickAxis = 0;
    /** True while any pad button is down; the pad's half of `actionHeld`. */
    this.padHeld = false;
    /** True while a pad is attached, so the UI can name the right control. */
    this.gamepadConnected = false;
    /** Set once the player actually presses something on a pad. */
    this.gamepadUsed = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);
    this.target.addEventListener("blur", this._onBlur);
  }

  /**
   * Steering, `-1..1`: negative counterclockwise, positive clockwise. Opposing
   * keys cancel out. A held key wins over the stick — it is the unambiguous
   * input of the two, and a pad resting just inside its deadzone must never
   * water down a keyboard turn.
   */
  get axis() {
    const keys = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    return keys !== 0 ? keys : this.stickAxis;
  }

  /**
   * Samples every attached gamepad. Call once per frame, before the one-shots
   * are consumed.
   *
   * Gamepads have no event stream — the browser only exposes a snapshot — so
   * edges are found by diffing against the previous frame here. Pads are read
   * together rather than one being adopted as "the" pad: with a single
   * controller that costs nothing, and it means a second one just works.
   */
  poll() {
    const pads = navigator.getGamepads?.() ?? [];

    let stick = 0;
    let anyButton = false;
    let connected = false;

    for (const pad of pads) {
      if (!pad?.connected) continue;
      connected = true;

      const value = deadzone(pad.axes[steerAxisIndex(pad)] ?? 0);
      // Strongest deflection wins, so a pad left untouched cannot cancel out
      // the one being played on.
      if (Math.abs(value) > Math.abs(stick)) stick = value;

      for (const button of pad.buttons) {
        if (button.pressed || button.value > BUTTON_THRESHOLD) {
          anyButton = true;
          break;
        }
      }
    }

    this.stickAxis = stick;
    this.gamepadConnected = connected;

    // Any button is the pad's action: it starts a run, restarts one, and fires
    // the warp mid-run, which is exactly what Space does on the keyboard.
    if (anyButton && !this.padHeld) {
      this.actionPressed = true;
      this.gamepadUsed = true;
    }
    this.padHeld = anyButton;
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

  /**
   * Clears transient state, e.g. when a run ends or the tab is hidden.
   *
   * `padHeld` is left alone: it is owned by `poll()`, which sees a blurred
   * document's pads as neutral and clears it on its own. Zeroing it here would
   * instead re-fire an action for a button that was already down on the frame
   * focus came back.
   */
  reset() {
    this.left = false;
    this.right = false;
    this.actionPressed = false;
    this.actionHeld = false;
    this.mutePressed = false;
    this.muteHeld = false;
    this.stickAxis = 0;
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
