// Game server for online multiplayer. Only needed for Mode 3
// (SocketIO) — Local() and single-player games don't need this.
//
// This file is CommonJS on purpose: boardgame.io@0.50.x has no Node
// `exports` map, so the 'boardgame.io/server' subpath resolves only via
// require() (its entry is CJS-only). The game definition itself stays a
// single ESM file, loaded here via dynamic import().
// Run with: npm run server

const { Server, Origins, FlatFile } = require('boardgame.io/server');

const PORT = process.env.PORT || 8000;

async function main() {
  const { Game } = await import('./src/game.js');

  const server = Server({
    games: [Game],
    // Restrict to your real origins in production; see Origins helpers.
    origins: [Origins.LOCALHOST_IN_DEVELOPMENT],
    // Persist matches across restarts (optional):
    // db: new FlatFile({ dir: './storage', logging: false }),
  });

  server.run(PORT, () => {
    console.log(`Game server: http://localhost:${PORT}`);
  });
}

main();
