// Headless game-logic tests — no React, no server, fast.
// Run with: npm test  (uses Node's built-in test runner)
//
// Note: we import from 'boardgame.io/dist/esm/*.js' (deep paths), not
// 'boardgame.io/client' — boardgame.io@0.50.x has no Node `exports` map,
// so the bare subpaths resolve only inside bundlers (Vite). Deep ESM
// paths work in plain Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Game } from '../src/game.js';

function newClient(overrides = {}) {
  return Client({ game: { ...Game, ...overrides } });
}

test('first move claims the cell for player 0', () => {
  const client = newClient();
  client.moves.clickCell(0);
  const { G } = client.getState();
  assert.equal(G.cells[0], '0');
});

test('clicking an occupied cell is rejected', () => {
  const client = newClient();
  client.moves.clickCell(0);
  client.events.endTurn();
  client.moves.clickCell(0); // player 1 tries the same cell
  const { G } = client.getState();
  assert.equal(G.cells[0], '0');
});

test('full board ends in a draw', () => {
  const preset = Array(9).fill(null);
  // Leave only one empty cell so any move fills the board:
  preset[8] = null;
  [0, 1, 2, 3, 4, 5, 6, 7].forEach((i, n) => (preset[i] = String(n % 2)));
  const client = newClient({ setup: () => ({ cells: preset }) });
  client.moves.clickCell(8);
  const { ctx } = client.getState();
  assert.ok(ctx.gameover);
});
