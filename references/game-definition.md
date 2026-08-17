# Game Definition Reference (v0.50.x)

Deep dive on the `Game` object: moves, long-form options, turns, phases,
stages, active players, turn order, the events API, secret state, and bots.

## Game object — all top-level options

```js
const MyGame = {
  name: 'my-game',
  setup: ({ ctx, setupData }) => initialG,
  validateSetupData: (setupData, numPlayers) => 'error string' | undefined,
  minPlayers: 2,          // enforced by the lobby only
  maxPlayers: 4,
  seed: 42,               // deterministic PRNG seed (number or string)
  moves: { ... },
  turn: { ... },
  phases: { ... },
  endIf: ({ G, ctx }) => gameoverPayload,   // payload lands verbatim in ctx.gameover
  onEnd: ({ G, ctx }) => {},        // runs when the game ends
  onPlayerLeave: ({ G, ctx, playerID, removePlayer }) => {},
  playerView: ({ G, ctx, playerID }) => filteredG,
  disableUndo: false,
  disableLog: false,
  ai: { enumerate: (G, ctx) => [{ move, args }] },
  plugins: [],
};
```

`setupData` comes from the lobby's `createMatch` call; validate it with
`validateSetupData` (return a string message on error).

## Moves

### Short form and long form

```js
moves: {
  // Short form
  clickCell: ({ G, playerID }, id) => { G.cells[id] = playerID; },

  // Long form — wraps the same signature in an options object
  rollDice: {
    move: ({ G, random }) => { G.roll = random.D6(); },
    undoable: false,             // or ({ G, ctx }) => boolean
    redact: true,                // hide move args from the log (secret plays)
    client: false,               // server-only: never runs optimistically
    noLimit: true,               // doesn't count toward minMoves/maxMoves
    ignoreStaleStateID: true,    // accept moves from out-of-date clients (rare)
  },
}
```

- `client: false` is required when the move depends on data the client
  doesn't have (e.g. hidden hands) or must be server-authoritative.
- `redact: true` hides *arguments* in `ctx.log` / `client.log` — use for
  blind bids, secret card plays.
- `undoable: false` for anything that reveals randomness or hidden info —
  otherwise players undo to peek, then redo differently.

### Shared moves across phases

Phase `moves` and stage `moves` **replace** (not merge with) global moves.
To share, define move functions as named constants and list them in each
place:

```js
const PlayCard = ({ G, ctx }) => { ... };
const DrawCard = ({ G, ctx }) => { ... };

moves: { PlayCard },
phases: {
  draw: { moves: { DrawCard, PlayCard } },   // re-list shared moves
  play: { moves: { PlayCard } },             // no DrawCard here
}
```

### INVALID_MOVE

```js
import { INVALID_MOVE } from 'boardgame.io/core';
moves: {
  moveKing: ({ G }, from, to) => {
    if (!isLegalKingMove(G, from, to)) return INVALID_MOVE;
    ...
  },
}
```

The move is discarded entirely; no state change, no turn consumption.

## Turn configuration

Global `turn` or per-phase `turn` (phase overrides global):

```js
turn: {
  order: TurnOrder.DEFAULT,          // see turn orders below
  onBegin: ({ G, ctx }) => {},       // start of the player's turn
  onEnd: ({ G, ctx }) => {},
  onMove: ({ G, ctx, move }) => {},  // after every move; move = { name, args }
  endIf: ({ G, ctx }) => true,       // truthy ends the turn; may return { next: '2' }
  minMoves: 1,                       // turn can't end before 1 move
  maxMoves: 3,                       // turn auto-ends after 3 moves
  activePlayers: { all: Stage.NULL },  // initial active players for each turn
  stages: { ... },                   // see stages below
}
```

`minMoves: 1, maxMoves: 1` = classic "one action per turn" — the turn ends
automatically, no `events.endTurn()` needed.

## Phases

```js
phases: {
  setup: {
    start: true,                     // exactly one phase may set this
    turn: { ... },                   // per-phase turn config
    moves: { ... },                  // replaces global moves in this phase
    onBegin: ({ G, ctx }) => {},     // runs once when phase starts
    onEnd: ({ G, ctx }) => {},
    endIf: ({ G, ctx }) => G.ready,  // truthy ends the phase
    next: 'main',                    // string or ({ G, ctx }) => 'main'
  },
  main: { ... },
}
```

Semantics worth internalizing:

- When a phase ends, the current **turn ends first**, automatically.
- `next` is evaluated when the phase ends; without `next`, the game drops to
  "no phase" (`ctx.phase === null`) and global `moves`/`turn` apply.
- Phase-change hook order: `turn.onEnd → oldPhase.onEnd → newPhase.onBegin →
  new turn setup → turn.onBegin`, with `endIf` re-checked between steps.
- End checks run broadest-first after each move/hook: `game.endIf →
  phase.endIf → turn.endIf`.
- If no `phases` are defined, the whole game runs in a single implicit phase.

## Stages & active players (simultaneous play, sub-states)

Stages let specific players act outside the normal turn order:

```js
import { Stage } from 'boardgame.io/core';

turn: {
  stages: {
    discard: {
      moves: { Discard },            // replaces normal moves while in stage
      next: 'respond',               // optional: stage to enter on endStage()
    },
    respond: { moves: { Pass, Claim } },
  },
},
```

Activate from a move or hook:

```js
// Everyone into a stage, with move limits
events.setActivePlayers({ all: 'discard', minMoves: 1, maxMoves: 1 });

// Only the non-current players
events.setActivePlayers({ others: 'respond' });

// Explicit map of playerID -> stage
events.setActivePlayers({ value: { 0: 'bid', 2: 'bid' } });

// When the set empties, revert to previous activePlayers (revert: true)
// or apply a new configuration (next: {...same options})
events.setActivePlayers({ all: 'bid', revert: true });

// Individual player switching
events.setStage('discard');         // current player enters a stage
events.endStage();                  // leave it (goes to stage's `next` if set)
```

Presets from `boardgame.io/core`:

- `ActivePlayers.ALL` — `{ all: Stage.NULL }` (everyone can act, no stage)
- `ActivePlayers.ALL_ONCE` — same with `minMoves: 1, maxMoves: 1`
- `ActivePlayers.OTHERS` / `OTHERS_ONCE` — everyone but `ctx.currentPlayer`

Read state with guards — `ctx.activePlayers` is `null` when unused:

```js
const active = ctx.activePlayers || {};
if ('0' in active) { /* player 0 is in stage active['0'] */ }
```

## Turn orders

```js
import { TurnOrder } from 'boardgame.io/core';
```

- `TurnOrder.DEFAULT` — round-robin, continues across turns.
- `TurnOrder.RESET` — restart from player 0 at each new phase.
- `TurnOrder.CONTINUE` — new phase starts with whoever acted last.
- `TurnOrder.ONCE` — each player acts once, then the **phase auto-ends**.
- `TurnOrder.CUSTOM(['1', '3', '0'])` — explicit play order.
- `TurnOrder.CUSTOM_FROM('playOrder')` — order stored in `G.playOrder`.

Fully custom order object:

```js
turn: {
  order: {
    first: ({ G, ctx }) => 0,
    next: ({ G, ctx }) => { /* return playOrderPos; returning undefined ends the phase */ },
    playOrder: ({ G, ctx }) => ['2', '0', '1'],
  },
}
```

## Events API (complete)

Callable as `events.*` inside moves/hooks, or `client.events.*` /
`props.events.*` from the UI (except `removePlayer`):

| Event | Effect |
|---|---|
| `endTurn()` / `endTurn({ next: '2' })` | End turn; next player by order, or explicit |
| `endPhase()` | End phase; go to phase's `next` (or no-phase) |
| `setPhase('name')` | End current phase and enter `'name'` |
| `endGame()` / `endGame(payload)` | End game; payload lands in `ctx.gameover` |
| `setStage('s')` / `setStage({ stage: 's', minMoves, maxMoves })` | Current player enters stage |
| `endStage()` | Leave stage (auto-advances to stage's `next` if set) |
| `setActivePlayers(opts)` | See above |
| `removePlayer(playerID)` | Server-side game logic only; removes player from order |

Rules that trip people up:

- **Events are queued**: they dispatch *after* the current move finishes. G
  mutations always apply first regardless of call order inside the move.
- Only these hooks may call events (anything else silently does nothing):

  | Event | Allowed in |
  |---|---|
  | `setStage`, `endStage` | `turn.onMove` only |
  | `setActivePlayers` | `turn.onMove`, `turn.onBegin` |
  | `endTurn` | `turn.onMove`, `turn.onBegin`, `phase.onBegin` |
  | `setPhase`, `endPhase` | `turn.onMove`, `turn.onBegin`, `turn.onEnd`, `phase.onBegin` |
  | `endGame` | all of the above + `phase.onEnd` |

- Never call events in `endIf` or `game.onEnd`.
- Client-side event calls can be disabled per event in the game config:
  `events: { endGame: false }` — this does **not** affect calls from
  moves/hooks.

## Secret state (hidden information)

Two mechanisms, often combined:

**1. `playerView` filter** — server sends each player a tailored view:

```js
import { PlayerView } from 'boardgame.io/core';

const MyGame = {
  // Convention: keep secrets in G.secret, per-player secrets in G.players[i].secret
  playerView: PlayerView.STRIP_SECRETS,   // removes G.secret; G.players keeps only the viewer's entry

  // ...or fully custom:
  playerView: ({ G, playerID }) => {
    // playerID is null/undefined for spectators
    return {
      ...G,
      hands: Object.fromEntries(
        Object.entries(G.hands).map(([id, hand]) =>
          id === playerID ? [id, hand] : [id, hand.length]
        )
      ),
    };
  },
};
```

**2. Server-only moves** — moves that need full (unfiltered) state to run:

```js
moves: {
  drawCard: {
    move: ({ G, ctx, random }) => { /* operates on full G, incl. secrets */ },
    client: false,
  },
}
```

The pattern for hidden-info games: keep truth in `G.secret` / per-player
secret fields, strip them in `playerView`, do all secret-dependent work in
`client: false` moves, and expose only the public result to clients.

## Bots / AI

Declare the move space; the framework ships bots that use it:

```js
import { RandomBot, MCTSBot } from 'boardgame.io/ai';

const MyGame = {
  ai: {
    enumerate: (G, ctx) => {
      const moves = [];
      for (let i = 0; i < 9; i++) {
        if (G.cells[i] === null) moves.push({ move: 'clickCell', args: [i] });
      }
      return moves;
    },
  },
};

// Client-side bot opponent — pattern A: framework bots via Local's
// built-in `bots` option (requires game.ai.enumerate; bot classes only):
import { Local } from 'boardgame.io/multiplayer';
import { RandomBot, MCTSBot } from 'boardgame.io/ai';

const mp = Local({ bots: { 1: RandomBot } });   // bot plays player '1' automatically
const App = Client({ game: MyGame, board: Board, multiplayer: mp });
// The Local master auto-runs bot.play on the bot player's turn.
```

`MCTSBot` needs `enumerate` plus objectives (see
`examples/react-web/src/tic-tac-toe/advanced-ai.js` in the boardgame.io repo
for a full setup). Keep `enumerate` exhaustive and cheap — it runs for every
bot simulation.

```js
// Client-side bot opponent — pattern B: scripted bot via its own headless
// client. Prefer this when move args encode complex conditional logic
// (tribute slots, spell targets) that would force enumerate to duplicate
// every move guard. Reuse the same decision logic as your full-game
// auto-play test (tests/fullgame.test.js) — one action per subscription
// tick, driven by state updates:
import { Client as PlainClient } from 'boardgame.io/client';

// Masters are cached per game object (localMasters Map), so any Local()
// built from the SAME game definition shares one master — the human React
// client and this bot client play the same match via matchID:
const bot = PlainClient({ game: MyGame, multiplayer: Local(), matchID, playerID: '1' });
bot.subscribe(() => {
  const state = bot.getState();
  if (!state || state.ctx.gameover) return;
  if (state.ctx.currentPlayer !== '1') return;
  const action = decideNextAction(state, '1');       // your heuristics
  if (action) applyAction(bot, action);              // bot.moves.* — its own playerID
});
bot.start();
// ...bot.stop() on match change/unmount.
```

Gotcha: do NOT dispatch the bot's moves through the *human's* client
(`bot.play(..., humanClient.moves, ...)`) — actions are stamped with the
dispatching client's playerID and the flow rejects them. The bot needs its
own client bound to its playerID.
