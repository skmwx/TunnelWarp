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
  statBest: document.getElementById("stat-best"),
  rings: document.getElementById("hud-rings"),
  score: document.getElementById("hud-score"),
  best: document.getElementById("hud-best"),
  tier: document.getElementById("hud-tier"),
};

const game = new Game({ canvas, ui });
game.start();

// Handy for poking at state from the devtools console during development.
window.tunnelWarp = game;
