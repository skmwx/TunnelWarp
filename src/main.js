import { Game } from "./game/Game.js";

const canvas = document.getElementById("game-canvas");

const ui = {
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayBody: document.getElementById("overlay-body"),
  overlayBadge: document.getElementById("overlay-badge"),
  overlayReward: document.getElementById("overlay-reward"),
  overlayHint: document.getElementById("overlay-hint"),
  overlayStats: document.getElementById("overlay-stats"),
  statRings: document.getElementById("stat-rings"),
  statScore: document.getElementById("stat-score"),
  statEnergy: document.getElementById("stat-energy"),
  statBest: document.getElementById("stat-best"),
  rings: document.getElementById("hud-rings"),
  score: document.getElementById("hud-score"),
  best: document.getElementById("hud-best"),
  tier: document.getElementById("hud-tier"),
  warp: document.getElementById("hud-warp"),
  warpFill: document.getElementById("hud-warp-fill"),
  warpLabel: document.getElementById("hud-warp-label"),
  flash: document.getElementById("flash"),
  milestone: document.getElementById("milestone"),
  mute: document.getElementById("mute"),
};

const game = new Game({ canvas, ui });
game.start();

// Handy for poking at state from the devtools console during development.
window.tunnelWarp = game;
