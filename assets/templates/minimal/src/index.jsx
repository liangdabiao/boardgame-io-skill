// Client wiring. Pick ONE mode and delete the rest; game/board stay unchanged.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from 'boardgame.io/react';
import { Local, SocketIO } from 'boardgame.io/multiplayer';
import { Game } from './game';
import { Board } from './board';
import './app.css';

// --- Mode 1: single-player (state lives in this client only) -------------
const App = Client({
  game: Game,
  board: Board,
  debug: true, // debug panel in dev; use { impl: Debug } to keep it in prod
});

// --- Mode 2: pass-and-play / local multiplayer (no server needed) --------
// const App = Client({ game: Game, board: Board, multiplayer: Local() });
// Mount twice for two seats:
//   <App matchID="local" playerID="0" />
//   <App matchID="local" playerID="1" />

// --- Mode 3: online (run `npm run server` first; see server.cjs) ---------
// const App = Client({
//   game: Game,
//   board: Board,
//   multiplayer: SocketIO({ server: 'localhost:8000' }),
// });
// Get matchID/credentials from the lobby API, then:
//   <App matchID={matchID} playerID="0" credentials={creds} />

function Page() {
  return (
    <main>
      <h1>My boardgame.io game</h1>
      <App matchID="single" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Page />);
