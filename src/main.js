import { Game } from "./game/Game.js";

const canvas = document.getElementById("game-canvas");

const ui = {
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayBody: document.getElementById("overlay-body"),
  overlayHint: document.getElementById("overlay-hint"),
  rings: document.getElementById("hud-rings"),
  best: document.getElementById("hud-best"),
};

const game = new Game({ canvas, ui });
game.start();

// Handy for poking at state from the devtools console during development.
window.tunnelWarp = game;
