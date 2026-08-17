// Game definition — this file is pure game logic, no React, no network.
// It runs identically on every client and on the server.
// The tic-tac-toe rules below are a working placeholder: replace
// setup/moves/endIf with your game (see the skill's references/).

// Deep ESM import on purpose: this file is loaded both by the bundler
// (Vite) and by plain-Node headless tests, and 'boardgame.io/core' only
// resolves in bundlers (no exports map in 0.50.x). The deep path works
// in both. Browser-only files (index.jsx, board.jsx) can use the
// normal subpaths.

import { INVALID_MOVE } from 'boardgame.io/dist/esm/core.js';

function isVictory(cells) {
  const positions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  return positions.some((row) => {
    const symbols = row.map((i) => cells[i]);
    return symbols.every((s) => s !== null && s === symbols[0]);
  });
}

export const Game = {
  name: 'my-game', // must be unique per game on a server

  setup: () => ({
    cells: Array(9).fill(null), // initial G — JSON-serializable only
  }),

  moves: {
    clickCell: ({ G, playerID }, id) => {
      if (G.cells[id] !== null) return INVALID_MOVE;
      G.cells[id] = playerID; // mutation style: return nothing
    },
  },

  turn: { minMoves: 1, maxMoves: 1 }, // one action per turn

  endIf: ({ G, ctx }) => {
    if (isVictory(G.cells)) return { winner: ctx.currentPlayer };
    if (G.cells.every((c) => c !== null)) return { draw: true };
  },

  // Optional: bot support (see references/game-definition.md)
  ai: {
    enumerate: (G) =>
      G.cells
        .map((c, i) => (c === null ? { move: 'clickCell', args: [i] } : null))
        .filter(Boolean),
  },
};

export default Game;
