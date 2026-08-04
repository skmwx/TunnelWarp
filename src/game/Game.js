import * as THREE from "three";

import { Collectibles } from "./Collectibles.js";
import { createRunResult, resolveRings } from "./Collision.js";
import { CAMERA, REWARD_TIERS, RINGS, SPEED, WARP, WORLD } from "./constants.js";
import { spacingFor, speedFor } from "./Difficulty.js";
import { Input } from "./Input.js";
import { Obstacles } from "./Obstacles.js";
import { Player, PlayerView } from "./Player.js";
import { formatScore, nextRewardTier, Score } from "./Score.js";
import { Tunnel } from "./Tunnel.js";
import { clamp, damp } from "./tunnelMath.js";

/** Game states. Every one of them is reachable. */
export const GameState = {
  LOADING: "loading",
  READY: "ready",
  PLAYING: "playing",
  GAME_OVER: "gameOver",
  VICTORY: "victory",
};

/** Re-exported for convenience; `constants.js` is the source of truth. */
export { WORLD } from "./constants.js";

/** Long frames (tab switches, breakpoints) must not teleport the world. */
const MAX_DELTA = 1 / 20;

/**
 * Overlay text per state.
 *
 * Any field may be a function of the game, for copy that depends on the run.
 * `stats` shows the end-of-run result panel; `reward` is the milestone line
 * under it.
 */
const OVERLAY_COPY = {
  [GameState.LOADING]: {
    title: "TunnelWarp",
    body: "Preparing the tunnel…",
    hint: "",
    stats: false,
  },
  [GameState.READY]: {
    title: "TunnelWarp",
    body:
      `Fly the ring gauntlet. Ring ${RINGS.victoryRing} is the jackpot. ` +
      "Sweep up warp energy on the way — a full meter buys a few seconds of " +
      "invulnerable warp.",
    hint: "Press Space or Enter to launch",
    reward: rewardLadder,
    stats: false,
  },
  [GameState.GAME_OVER]: {
    title: "Run Over",
    body: (game) =>
      game.ringsCleared === 0
        ? "No rings cleared. Line up with the lit gap before the gate arrives."
        : `${ringCount(game.ringsCleared)} cleared.`,
    hint: "Press Space to fly again",
    reward: rewardResult,
    stats: true,
  },
  [GameState.VICTORY]: {
    title: `Ring ${RINGS.victoryRing}`,
    body: (game) => `Jackpot. ${ringCount(game.ringsCleared)} cleared clean.`,
    hint: "Press Space to fly again",
    reward: rewardResult,
    stats: true,
  },
};

/** Resolves an overlay field that may be either a literal or a function. */
function copyText(field, game) {
  if (typeof field === "function") return field(game);
  return field ?? "";
}

function ringCount(rings) {
  return `${rings} ring${rings === 1 ? "" : "s"}`;
}

/** The milestone ladder, shown before a run so the targets are known upfront. */
function rewardLadder(game) {
  const ladder = REWARD_TIERS.map(
    (tier) => `Ring ${tier.rings} ${tier.label.toLowerCase()}`,
  ).join("  ·  ");

  // Being told the best result is not saved beats silently losing it.
  return game.score.persistent
    ? ladder
    : `${ladder}  —  best result can't be saved in this browser.`;
}

/** What the finished run earned, or how far the next milestone still is. */
function rewardResult(game) {
  const result = game.score.lastResult;
  if (!result) return "";

  if (result.tier) {
    return `${result.tier.label} banked at Ring ${result.tier.rings}.`;
  }

  const next = nextRewardTier(result.rings);
  if (!next) return "";

  const remaining = next.rings - result.rings;
  return `${ringCount(remaining)} short of the ${next.label.toLowerCase()} at Ring ${next.rings}.`;
}

/** The "you beat your own record" line, or `""` when this run did not. */
function bestBadge(game) {
  const result = game.score.lastResult;
  if (!result) return "";

  if (result.ringsBeat && result.scoreBeat) return "New personal best";
  if (result.ringsBeat) return "New ring record";
  if (result.scoreBeat) return "New high score";
  return "";
}

/** Copy for the warp meter, keyed by the state the meter is in. */
const WARP_LABEL = {
  charging: "Warp energy",
  ready: "Warp ready · Space",
  active: "Warping",
};

/** The forward speed the game settles at, given its state and progress. */
function speedTargetFor(state, rings, warping) {
  switch (state) {
    // The difficulty curve owns the run: speed climbs with every ring cleared.
    // Warp stacks on top of the curve's own cap — it is meant to be the
    // fastest the tunnel ever moves.
    case GameState.PLAYING:
      return warping ? speedFor(rings) * WARP.speedScale : speedFor(rings);
    // A finished run holds still. The gate that ended it stays sitting on the
    // ship, which is the clearest possible read of what just happened.
    case GameState.GAME_OVER:
    case GameState.VICTORY:
      return 0;
    // Menus keep a slow drift so the scene never looks frozen before a run.
    default:
      return SPEED.idle;
  }
}

export class Game {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas
   * @param {object} options.ui  Overlay elements owned by index.html.
   */
  constructor({ canvas, ui }) {
    this.canvas = canvas;
    this.ui = ui;

    this.state = GameState.LOADING;
    this.input = new Input();
    this.player = new Player();
    this.playerView = new PlayerView();
    this.tunnel = new Tunnel();
    this.obstacles = new Obstacles();
    this.collectibles = new Collectibles();
    this.score = new Score();

    /** Seconds of simulated flight in the current run. */
    this.elapsed = 0;
    /** Current forward speed; the world scrolls past the player at this rate. */
    this.speed = SPEED.idle;

    /** Warp meter, `0..1`. Filled by orbs, spent whole. */
    this.warpCharge = 0;
    /** True while the ship is warping: faster, brighter, and invulnerable. */
    this.warpActive = false;
    /** Seconds of warp left. May sit at `0` while the exit is held open. */
    this.warpTimer = 0;
    /** Eased warp intensity, `0..1`. Drives every part of the warp look. */
    this.warpBlend = 0;

    /** Reused every frame so collision resolution allocates nothing. */
    this._runResult = createRunResult();
    /** Last values written to the HUD; the DOM is only touched on a change. */
    this._hudRings = -1;
    this._hudScore = -1;
    this._hudBest = -1;
    this._hudWarpFill = -1;
    this._hudWarpState = "";

    this._lastFrameTime = 0;
    this._frameHandle = 0;
    this._running = false;

    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);

    this._initRenderer();
    this._initScene();

    window.addEventListener("resize", this._onResize);
    this._onResize();
  }

  /** Rings cleared in the current run. `Score` is the source of truth. */
  get ringsCleared() {
    return this.score.rings;
  }

  /** Boots the render loop and hands control to the player. */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrameTime = performance.now();
    this._frameHandle = requestAnimationFrame(this._tick);
    this.setState(GameState.READY);
  }

  setState(next) {
    if (this.state === next) return;
    this.state = next;

    // Outside a run the gates are backdrop, not a graded gauntlet.
    this.obstacles.setScenery(next !== GameState.PLAYING);

    if (next === GameState.PLAYING) {
      this._resetRun();
    } else if (next === GameState.GAME_OVER || next === GameState.VICTORY) {
      // A run can end mid-warp — by winning, or by crashing on the frame the
      // invulnerability lapsed. Either way the warp is over with it.
      this.warpActive = false;
      this.warpTimer = 0;
      this._freezeWorld();
      // Settles the result before the overlay renders it, so the panel and the
      // stored best are read from the same commit.
      this.score.commit();
    }

    this._renderUI();
  }

  dispose() {
    this._running = false;
    cancelAnimationFrame(this._frameHandle);
    window.removeEventListener("resize", this._onResize);
    this.input.dispose();
    this.tunnel.dispose();
    this.obstacles.dispose();
    this.collectibles.dispose();
    this.renderer.dispose();
  }

  // --- Setup -------------------------------------------------------------

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    // Cap DPR: a 4K display at native pixel ratio costs more than the visual
    // gain on a dark, high-contrast scene.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x04030d, 1);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // Fog starts close so the tunnel falls away to black behind the gates the
    // player still has time to react to.
    this.scene.fog = new THREE.Fog(0x04030d, 22, 170);

    this.camera = new THREE.PerspectiveCamera(
      WORLD.fov,
      window.innerWidth / Math.max(window.innerHeight, 1),
      WORLD.near,
      WORLD.far,
    );
    this.camera.position.set(0, 0, WORLD.cameraZ);
    this.camera.lookAt(0, 0, WORLD.spawnZ);

    // Kept deliberately dim: the tunnel wall is a large lit surface, and the
    // gates only read if it stays a dark backdrop for them.
    this.scene.add(new THREE.AmbientLight(0x1a2a4d, 0.5));

    const keyLight = new THREE.PointLight(0x46f0ff, 70, 55, 2);
    keyLight.position.set(0, 0, WORLD.playerZ + 6);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff3ea5, 45, 70, 2);
    rimLight.position.set(0, WORLD.tunnelRadius * 0.8, WORLD.playerZ - 26);
    this.scene.add(rimLight);

    this.scene.add(this.tunnel.object3D);
    this.scene.add(this.obstacles.object3D);
    this.scene.add(this.collectibles.object3D);

    this.scene.add(this.playerView.object3D);
    this.playerView.sync(this.player, 0);
  }

  // --- Loop --------------------------------------------------------------

  _tick(now) {
    if (!this._running) return;
    this._frameHandle = requestAnimationFrame(this._tick);

    const delta = Math.min((now - this._lastFrameTime) / 1000, MAX_DELTA);
    this._lastFrameTime = now;

    this._update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  _update(delta) {
    this._handleAction();
    this._updateSpeed(delta);

    if (this.state === GameState.PLAYING) {
      this.elapsed += delta;
      // Distance is scored off the actual speed, so the launch ramp is worth
      // less than cruising and the late, faster rings are worth more.
      this.score.addDistance(this.speed * delta);
      this.player.update(delta, this.input.axis);
    }

    // The world scrolls in every state: at cruise speed during a run, and at an
    // idle drift behind the menus so the scene never looks frozen. Only the
    // consequences are gated on `playing`.
    this.tunnel.update(delta);
    this.obstacles.update(delta);
    this.collectibles.update(delta, this.obstacles.rings);

    if (this.state === GameState.PLAYING) {
      // Warp first: whether the ship is still invulnerable this frame is
      // decided against gates that have already moved.
      this._updateWarp(delta);
      this._collectEnergy();
      this._resolveRun();
    }

    // Synced in every state so the ship keeps its idle spin and settles its
    // bank after a run ends.
    this._updateWarpView(delta);
    this.playerView.sync(this.player, delta, this.warpBlend);
    this._updateCamera(delta);
    // The score moves every frame of a run, so the HUD is a per-frame concern;
    // each field is guarded against writing an unchanged value.
    this._syncHud();
  }

  /**
   * Scores the gates the ship has finished with and ends the run if one of
   * them was a miss. Runs after everything has moved, so a gate is judged
   * against the pose the player actually flew it with.
   */
  _resolveRun() {
    const result = resolveRings(
      this.obstacles.rings,
      this.player,
      this._runResult,
      this.warpActive,
    );

    if (result.cleared > 0) {
      this.score.addRings(result.cleared);
    }

    if (result.hit) {
      this.setState(GameState.GAME_OVER);
      return;
    }

    if (this.ringsCleared >= RINGS.victoryRing) {
      this.setState(GameState.VICTORY);
    }
  }

  /** Banks the warp orbs the ship swept up this frame. */
  _collectEnergy() {
    const collected = this.collectibles.collect(this.player);
    if (collected === 0) return;

    this.score.addOrbs(collected);
    this.warpCharge = clamp(
      this.warpCharge + collected / WARP.orbsToFill,
      0,
      1,
    );
  }

  /**
   * Spends a full meter, if there is one. Called from the action key during a
   * run; a partial meter is simply ignored, so warp can never fire early.
   */
  _tryWarp() {
    if (this.warpActive || this.warpCharge < 1) return;

    this.warpCharge = 0;
    this.warpActive = true;
    this.warpTimer = WARP.duration;
  }

  /**
   * Runs down the warp timer, and holds the warp open past it while dropping
   * out would strand the ship in front of a gate it has no time to read.
   */
  _updateWarp(delta) {
    if (!this.warpActive) return;

    if (this.warpTimer > 0) {
      this.warpTimer = Math.max(this.warpTimer - delta, 0);
      return;
    }

    if (this._warpExitClear()) this.warpActive = false;
  }

  /**
   * True when the next unresolved gate is far enough ahead that dropping
   * invulnerability now gives the player most of a normal run-up to it.
   *
   * Measured as a share of the gate spacing rather than as seconds of flight.
   * Seconds would be unsatisfiable: warp covers a stretch faster than the
   * reaction window that stretch was built from, so a warp asked to wait for a
   * full window would never get one and would never end. Distance is the same
   * question asked in units the geometry can actually answer — right after a
   * gate passes, the next one is a full spacing away — and it converts back
   * into the promised window as the speed decays.
   */
  _warpExitClear() {
    const lead = spacingFor(this.ringsCleared + 1) * WARP.exitLead;

    for (const ring of this.obstacles.rings) {
      if (ring.passed) continue;
      return this.player.z - ring.z >= lead;
    }

    return true;
  }

  /**
   * Eases the warp look in and out, and pushes it to everything that shows it.
   *
   * One shared value rather than a timer per effect, so the tunnel, the camera
   * and the ship can never disagree about how far into a warp the game is.
   */
  _updateWarpView(delta) {
    const target = this.warpActive ? 1 : 0;
    let blend = damp(this.warpBlend, target, WARP.viewResponse, delta);
    // Exponential easing only ever approaches its target. Snapping the tail
    // ends is what lets the effects below skip the frames nothing moved.
    if (Math.abs(blend - target) < 0.002) blend = target;
    this.warpBlend = blend;

    this.tunnel.setWarp(blend);

    // FOV opens up with warp: the tunnel walls rush past the edges of the
    // frame, which reads as speed more strongly than the speed itself does.
    const fov = WORLD.fov + WARP.fovBoost * blend;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Eases toward the speed the current state calls for, so launching from the
   * menu reads as an acceleration instead of a jump cut — and so the curve's
   * milestone steps arrive as a surge rather than a jolt.
   */
  _updateSpeed(delta) {
    const target = speedTargetFor(this.state, this.ringsCleared, this.warpActive);
    // Warp is meant to hit, so it accelerates harder than the curve does. It
    // still decays at the normal rate, which turns the exit into a coast down
    // rather than a wall.
    const response = this.warpActive ? WARP.speedResponse : SPEED.response;

    this.speed = damp(this.speed, target, response, delta);
    this.tunnel.setSpeed(this.speed);
    this.obstacles.setSpeed(this.speed);
    this.collectibles.setSpeed(this.speed);
  }

  _handleAction() {
    if (!this.input.consumeAction()) return;

    switch (this.state) {
      case GameState.READY:
      case GameState.GAME_OVER:
      case GameState.VICTORY:
        this.setState(GameState.PLAYING);
        break;
      // Mid-run the action key is the warp trigger. Start and restart keep the
      // key everywhere else, so it never means two things at once.
      case GameState.PLAYING:
        this._tryWarp();
        break;
      default:
        break;
    }
  }

  /**
   * The camera drifts a fraction of the player's offset. Enough parallax to
   * keep the ship legible against the wall it rides, small enough that the
   * tunnel's vanishing point stays centred.
   */
  _updateCamera(delta) {
    const { x, y } = this.player.position;
    const targetX = x * CAMERA.followAmount;
    const targetY = y * CAMERA.followAmount;

    this.camera.position.x = damp(
      this.camera.position.x,
      targetX,
      CAMERA.followResponse,
      delta,
    );
    this.camera.position.y = damp(
      this.camera.position.y,
      targetY,
      CAMERA.followResponse,
      delta,
    );
    this.camera.lookAt(0, 0, WORLD.spawnZ);
  }

  /**
   * Stops the world dead on the frame a run ends, instead of coasting to the
   * state's target. A crash should read as an impact, not a slow fade.
   */
  _freezeWorld() {
    this.speed = 0;
    this.tunnel.setSpeed(0);
    this.obstacles.setSpeed(0);
    this.collectibles.setSpeed(0);
  }

  _resetRun() {
    this.elapsed = 0;
    this.speed = SPEED.idle;

    this.warpCharge = 0;
    this.warpActive = false;
    this.warpTimer = 0;

    this.score.reset();
    this.player.reset();
    this.tunnel.reset();
    // Reset before the first frame moves anything, so the prefilled gates are
    // laid out against the speed the run actually launches at.
    this.obstacles.setSpeed(speedFor(0));
    this.obstacles.reset();
    // After the gates: pods are strung between them, so the field has to exist
    // before there is anything to string them along.
    this.collectibles.setSpeed(speedFor(0));
    this.collectibles.reset();
  }

  // --- Presentation ------------------------------------------------------

  /**
   * Rewrites the overlay for the current state. Called on every transition, so
   * what is on screen is always the state the game is actually in.
   */
  _renderUI() {
    const ui = this.ui;

    if (this.state === GameState.PLAYING) {
      ui.overlay.hidden = true;
      this._syncHud();
      return;
    }

    const copy = OVERLAY_COPY[this.state];
    ui.overlay.hidden = false;
    ui.overlayTitle.textContent = copy.title;
    ui.overlayBody.textContent = copyText(copy.body, this);
    ui.overlayHint.textContent = copyText(copy.hint, this);

    const badge = bestBadge(this);
    ui.overlayBadge.textContent = badge;
    ui.overlayBadge.hidden = badge === "";

    const reward = copyText(copy.reward, this);
    ui.overlayReward.textContent = reward;
    ui.overlayReward.hidden = reward === "";

    ui.overlayStats.hidden = !copy.stats;
    if (copy.stats) {
      ui.statRings.textContent = String(this.score.rings);
      ui.statScore.textContent = formatScore(this.score.score);
      ui.statEnergy.textContent = String(this.score.orbs);
      ui.statBest.textContent = String(this.score.best.rings);
    }

    this._syncHud();
  }

  /**
   * Writes the live HUD readouts. Called every frame; each field skips the DOM
   * on the frames its value is unchanged.
   */
  _syncHud() {
    const { rings, score } = this.score;
    const best = this.score.best.rings;

    if (this._hudRings !== rings) {
      this._hudRings = rings;
      this.ui.rings.textContent = String(rings);

      // The tier only ever changes on a ring, so it rides the same guard.
      const tier = this.score.tier;
      this.ui.tier.textContent = tier ? tier.label : "";
      this.ui.tier.hidden = tier === null;
    }

    if (this._hudScore !== score) {
      this._hudScore = score;
      this.ui.score.textContent = formatScore(score);
    }

    if (this._hudBest !== best) {
      this._hudBest = best;
      this.ui.best.textContent = String(best);
    }

    this._syncWarpMeter();
  }

  /**
   * Writes the warp meter.
   *
   * The bar carries two different quantities across the run — how full the
   * meter is, then how much warp is left — because they are never both true at
   * once, and one bar in one place is easier to read at speed than two.
   */
  _syncWarpMeter() {
    // The ready state prompts for Space, which only fires a warp during a run —
    // on the end screens the same key restarts. A full meter behind a result
    // panel is shown as a plain reading, never as an offer.
    const armed = this.state === GameState.PLAYING && this.warpCharge >= 1;
    const state = this.warpActive ? "active" : armed ? "ready" : "charging";

    const level = this.warpActive
      ? clamp(this.warpTimer / WARP.duration, 0, 1)
      : this.warpCharge;
    // Whole percent: finer than the bar can show, and it keeps the write out
    // of most frames.
    const fill = Math.round(level * 100);

    if (this._hudWarpState !== state) {
      this._hudWarpState = state;
      this.ui.warp.dataset.state = state;
      this.ui.warpLabel.textContent = WARP_LABEL[state];
    }

    if (this._hudWarpFill !== fill) {
      this._hudWarpFill = fill;
      this.ui.warpFill.style.width = `${fill}%`;
    }
  }

  _onResize() {
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight, 1);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
