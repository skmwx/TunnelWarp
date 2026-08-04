import * as THREE from "three";

import { CAMERA, WORLD } from "./constants.js";
import { Input } from "./Input.js";
import { Player, PlayerView } from "./Player.js";
import { damp } from "./tunnelMath.js";

/**
 * Game states. Phase 1 wires up the full set even though only `loading`,
 * `ready` and `playing` are reachable until collision handling lands.
 */
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

const OVERLAY_COPY = {
  [GameState.LOADING]: {
    title: "TunnelWarp",
    body: "Preparing the tunnel…",
    hint: "",
  },
  [GameState.READY]: {
    title: "TunnelWarp",
    body: "Fly the ring gauntlet. Ring 66 is the jackpot.",
    hint: "Press Space or Enter to launch",
  },
  [GameState.GAME_OVER]: {
    title: "Run Over",
    body: "",
    hint: "Press Space to fly again",
  },
  [GameState.VICTORY]: {
    title: "Ring 66",
    body: "Jackpot cleared.",
    hint: "Press Space to fly again",
  },
};

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

    /** Seconds of simulated flight in the current run. */
    this.elapsed = 0;
    this.ringsCleared = 0;

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

    if (next === GameState.PLAYING) {
      this._resetRun();
    }

    this._renderUI();
  }

  dispose() {
    this._running = false;
    cancelAnimationFrame(this._frameHandle);
    window.removeEventListener("resize", this._onResize);
    this.input.dispose();
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
    this.scene.fog = new THREE.Fog(0x04030d, 40, 180);

    this.camera = new THREE.PerspectiveCamera(
      WORLD.fov,
      window.innerWidth / Math.max(window.innerHeight, 1),
      WORLD.near,
      WORLD.far,
    );
    this.camera.position.set(0, 0, WORLD.cameraZ);
    this.camera.lookAt(0, 0, WORLD.spawnZ);

    this.scene.add(new THREE.AmbientLight(0x334466, 1.4));

    const keyLight = new THREE.PointLight(0x46f0ff, 240, 120, 2);
    keyLight.position.set(0, 0, WORLD.playerZ + 4);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff3ea5, 180, 160, 2);
    rimLight.position.set(0, WORLD.tunnelRadius, WORLD.playerZ - 30);
    this.scene.add(rimLight);

    this._buildPlaceholder();

    this.scene.add(this.playerView.object3D);
    this.playerView.sync(this.player, 0);
  }

  /**
   * Temporary depth reference: static neon wireframe rings down the tunnel, so
   * angular movement and perspective are readable before Phase 3 builds the
   * real tunnel. Phase 3 replaces this group wholesale.
   */
  _buildPlaceholder() {
    this.placeholder = new THREE.Group();

    const geometry = new THREE.TorusGeometry(WORLD.tunnelRadius, 0.08, 6, 48);
    const material = new THREE.MeshBasicMaterial({
      color: 0x1d6a86,
      wireframe: true,
    });

    for (let i = 1; i <= 8; i += 1) {
      const ring = new THREE.Mesh(geometry, material);
      ring.position.z = WORLD.playerZ - i * 14;
      this.placeholder.add(ring);
    }

    this.scene.add(this.placeholder);
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

    if (this.state === GameState.PLAYING) {
      this.elapsed += delta;
      this.player.update(delta, this.input.axis);
    }

    // Synced in every state so the ship keeps its idle spin and settles its
    // bank after a run ends.
    this.playerView.sync(this.player, delta);
    this._updateCamera(delta);
  }

  _handleAction() {
    if (!this.input.consumeAction()) return;

    switch (this.state) {
      case GameState.READY:
      case GameState.GAME_OVER:
      case GameState.VICTORY:
        this.setState(GameState.PLAYING);
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

  _resetRun() {
    this.elapsed = 0;
    this.ringsCleared = 0;
    this.player.reset();
  }

  // --- Presentation ------------------------------------------------------

  _renderUI() {
    const { overlay, overlayTitle, overlayBody, overlayHint, rings } = this.ui;

    if (this.state === GameState.PLAYING) {
      overlay.hidden = true;
    } else {
      const copy = OVERLAY_COPY[this.state];
      overlay.hidden = false;
      overlayTitle.textContent = copy.title;
      overlayBody.textContent = copy.body;
      overlayHint.textContent = copy.hint;
    }

    rings.textContent = String(this.ringsCleared);
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
