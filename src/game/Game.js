import * as THREE from "three";

import { Input } from "./Input.js";

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

/** Shared world constants. Later phases build the tunnel around these. */
export const WORLD = {
  tunnelRadius: 5,
  /**
   * Z the player rides at; the camera sits behind it looking down -Z. The gap
   * to `cameraZ` is set so the full tunnel wall stays inside the vertical FOV
   * at the shortest supported viewport.
   */
  playerZ: -10,
  cameraZ: 0,
  /** Distance at which rings spawn ahead of the player. */
  spawnZ: -160,
  fov: 72,
  near: 0.1,
  far: 400,
};

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
  }

  /**
   * Temporary render check: a neon wireframe ring at the tunnel radius plus a
   * marker riding its wall. Phases 2-4 replace both with the real player and
   * ring meshes.
   */
  _buildPlaceholder() {
    this.placeholder = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(WORLD.tunnelRadius, 0.16, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x46f0ff, wireframe: true }),
    );
    ring.position.z = WORLD.playerZ - 14;
    this.placeholder.add(ring);
    this._placeholderRing = ring;

    const marker = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.6, 0),
      new THREE.MeshStandardMaterial({
        color: 0xff3ea5,
        emissive: 0xff3ea5,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    marker.position.set(0, -WORLD.tunnelRadius + 0.9, WORLD.playerZ);
    this.placeholder.add(marker);
    this._placeholderMarker = marker;

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
    }

    this._updatePlaceholder(delta);
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

  _updatePlaceholder(delta) {
    // Idle drift in `ready`, faster spin once flying, so state changes are
    // visible before any real gameplay exists.
    const rate = this.state === GameState.PLAYING ? 1.1 : 0.25;
    this._placeholderRing.rotation.z += rate * delta;

    const orbit = this.state === GameState.PLAYING ? this.elapsed * 1.4 : 0;
    const theta = -Math.PI / 2 + orbit;
    const radius = WORLD.tunnelRadius - 0.9;
    this._placeholderMarker.position.set(
      Math.cos(theta) * radius,
      Math.sin(theta) * radius,
      WORLD.playerZ,
    );
    this._placeholderMarker.rotation.y += 1.6 * delta;
  }

  _resetRun() {
    this.elapsed = 0;
    this.ringsCleared = 0;
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
