# Client, Multiplayer, Server & Lobby Reference (v0.50.x)

## Module map

```js
import { Client } from 'boardgame.io/client';      // framework-agnostic client
import { Client } from 'boardgame.io/react';       // React bindings
import { Local, SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client'; // typed lobby REST wrapper
import { Lobby } from 'boardgame.io/react';        // ready-made lobby UI
import { Server, Origins, FlatFile } from 'boardgame.io/server';
import { Debug } from 'boardgame.io/debug';
import { INVALID_MOVE, TurnOrder, Stage, ActivePlayers, PlayerView } from 'boardgame.io/core';
import { RandomBot, MCTSBot } from 'boardgame.io/ai';
import { MockRandom } from 'boardgame.io/testing';
```

**Node resolution caveat (v0.50.x):** the package has no Node `exports`
map. The subpaths above are directory entries meant for bundlers (Vite,
webpack) — importing them in plain Node fails with
`ERR_UNSUPPORTED_DIR_IMPORT`. For Node-run code:

- Browser-isomorphic modules (`client`, `core`, `ai`, `testing`): import the
  deep ESM builds — `'boardgame.io/dist/esm/client.js'`,
  `'boardgame.io/dist/esm/core.js'`, … (there is no `dist/esm/server.js`).
  The deep paths also resolve in bundlers, so files loaded by both worlds —
  typically your `game.js` — should just use them.
- The server: CJS only — `require('boardgame.io/server')` from a `.cjs`
  file, and load your ESM game definition with `await import('./game.js')`.

**Static assets follow the same rule.** `import img from './x.jpg'` is
bundler-only; in plain Node it throws `ERR_UNKNOWN_FILE_EXTENSION` as soon
as a test imports the module. Use Vite's URL asset pattern (works in both):

```js
const img = (file) => new URL(`./assets/cards/${file}`, import.meta.url).href;
```

For card art, generate all images with a single shared style prompt
(subject + fixed style suffix), store them in `src/assets/cards/`, and keep
the generation script under `scripts/` so the art can be regenerated with a
different style later.

## React client

```jsx
import { Client } from 'boardgame.io/react';
import { Debug } from 'boardgame.io/debug';

const App = Client({
  game: MyGame,
  board: MyBoard,
  numPlayers: 2,                    // default 2
  multiplayer: Local(),             // omit for single-player (single client) state
  loading: LoadingComponent,        // shown while syncing with server
  debug: { impl: Debug },           // keep debug panel in production builds too
  enhancer,                         // Redux enhancer (client state is a Redux store)
});

// Usage — each mounted instance is one player's view of one match:
<App matchID="default" playerID="0" credentials="secret" debug />
```

- No `playerID` prop → spectator: sees state, cannot move.
- Same `Client` app can mount multiple instances (e.g. pass-and-play demo).
- Without `multiplayer`, all state lives in the one client — fine for
  single-player and hot-seat if you don't need separation.

### Board props (complete)

`G`, `ctx`, `moves`, `events`, `reset`, `undo`, `redo`, `previewState`,
`loadState`, `sendChatMessage`, `chatMessages`, `log`, `matchID`, `playerID`,
`matchData`, `credentials`, `isActive`, `isMultiplayer`, `isConnected`,
`isPreview`.

- `isActive` — whether the local player may act right now. Gate all
  interaction on it.
- `matchData` — array of `{ id, name, data, isConnected }` from the lobby.
- `ctx.gameover` — set when the game ends; render results from it.
- `reset()` — resets this client's local state back to the initial state
  (handy for "new game" in hot-seat mode; it does not reset other clients
  or the server in multiplayer — create a new match for that).

## Plain JS client (no React)

```js
import { Client } from 'boardgame.io/client';

const client = Client({ game: MyGame, playerID: '0', multiplayer: SocketIO({ server: 'localhost:8000' }) });
client.start();

client.getState();          // { G, ctx, log, isActive, isConnected } or null before sync
client.subscribe(({ G, ctx }) => render(G, ctx));   // returns unsubscribe
client.moves.clickCell(3);
client.events.endTurn();
client.undo(); client.redo();
client.sendChatMessage({ type: 'string', payload: 'hi' });
client.updateMatchID('new-id');
client.stop();
```

## Multiplayer transports

```js
import { Local, SocketIO } from 'boardgame.io/multiplayer';

Local()                                   // in-memory master, same browser tab/process
Local({ persist: true, storageKey: 'bgio' })  // + localStorage persistence
SocketIO({ server: 'localhost:8000' })    // boardgame.io server over websockets
```

`Local()` runs a real master locally — moves are validated, phases flow —
it's not just shared state. Use it for prototypes, pass-and-play, tests, and
bot opponents; switch to `SocketIO` for real online play without changing
game code.

## Server

```js
import { Server, Origins, FlatFile } from 'boardgame.io/server';

const server = Server({
  games: [MyGame],                    // required; each game needs a unique name
  origins: [Origins.LOCALHOST_IN_DEVELOPMENT],   // CORS allowlist: strings or RegExp
  db: new FlatFile({ dir: './storage', logging: false }),  // default: in-memory
  // advanced: transport, uuid, generateCredentials, authenticateCredentials,
  //           apiOrigins, apiBodyLimit, https
});

server.run(8000);                       // or server.run({ port, host, lobbyConfig: { apiPort, apiCallback } }, cb)
server.run(8000, () => console.log('running'));
server.app;                             // underlying Koa app
server.router;                          // add custom routes: server.router.get('/x', ctx => ...)
server.kill();
```

`Origins` helpers: `Origins.LOCALHOST`, `Origins.LOCALHOST_IN_DEVELOPMENT`,
`Origins.ANY` (discouraged). Persist with `FlatFile` in production so matches
survive restarts.

## Lobby (online matchmaking)

The server exposes a REST API on the same port:

| Method & path | Body | Returns |
|---|---|---|
| `GET /games` | | list of game names |
| `GET /games/{name}` | | matches (add `?isGameover=false` etc.) |
| `GET /games/{name}/{id}` | | match details |
| `POST /games/{name}/create` | `{ numPlayers, setupData?, unlisted? }` | `{ matchID }` |
| `POST /games/{name}/{id}/join` | `{ playerName, playerID? }` | `{ playerCredentials, playerID }` |
| `POST /games/{name}/{id}/update` | `{ playerID, credentials, newName?, data? }` | |
| `POST /games/{name}/{id}/leaveSlot` | `{ playerID, credentials }` | frees the seat |
| `POST /games/{name}/{id}/leaveGame` | `{ playerID, credentials }` | permanent; fires `onPlayerLeave` |
| `POST /games/{name}/{id}/playAgain` | `{ playerID, credentials, numPlayers?, setupData? }` | `{ nextMatchID }` |

Credentials are random strings the client must store (sessionStorage) and
pass back for authenticated actions. Treat them like passwords.

### LobbyClient (typed REST wrapper)

```js
import { LobbyClient } from 'boardgame.io/client';

const lobbyClient = new LobbyClient({ server: 'http://localhost:8000' });
const { matchID } = await lobbyClient.createMatch('my-game', { numPlayers: 2 });
const { playerCredentials } = await lobbyClient.joinMatch('my-game', matchID, {
  playerName: 'Alice',
});
const matches = await lobbyClient.listMatches('my-game');
await lobbyClient.leaveGame('my-game', matchID, { playerID: '0', playerCredentials });
```

### Ready-made React lobby

```jsx
import { Lobby } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';

const LobbyApp = () => (
  <Lobby
    gameServer="http://localhost:8000"
    lobbyServer="http://localhost:8000"
    gameComponents={[{ game: MyGame, board: MyBoard }]}
  />
);
```

Gives you create/join/play/leave flows out of the box; style or replace later.

## Typical online architecture

```
client (React board)  --SocketIO-->  boardgame.io server (games, FlatFile db)
        |                                        ^
        +---- REST (lobby: create/join) --------+
```

1. Player creates or joins a match via `LobbyClient` → gets `matchID` +
   `playerCredentials`.
2. Render `<App matchID playerID credentials multiplayer={SocketIO({ server })} />`.
3. The server validates every move; clients apply optimistic updates and
   reconcile automatically.
4. Pass `setupData` through `createMatch` for game options (it reaches
   `setup({ setupData })` — validate with `validateSetupData`).
