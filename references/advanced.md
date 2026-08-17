# Advanced Reference (v0.50.x): Random, Undo, Testing, TypeScript, Debugging

## Random API

Available as `random` in the destructured first argument of moves and hooks:

```js
moves: {
  roll: ({ G, random }) => { G.die = random.D6(); },        // 1-6
  roll3: ({ G, random }) => { G.dice = random.D6(3); },     // [n, n, n]
  custom: ({ G, random }) => { G.n = random.Die(12); },     // 1-12; Die(spotvalue, diceCount?)
  coin: ({ G, random }) => { G.flip = random.Number(); },   // uniform [0, 1)
  deal: ({ G, random }) => { G.deck = random.Shuffle(G.deck); },  // returns NEW array
}
```

Dice wrappers: `D4, D6, D8, D10, D12, D20` (each optionally takes a count).
`random.Shuffle` does **not** mutate its argument — assign the return value.

Why it works this way: the PRNG state lives in the persisted game state, so
sequences are reproducible for undo and bots. If a move calls any `random`
method, the framework automatically discards the client's optimistic result
and waits for the server (clients never predict rolls).

Seed control:

```js
const game = { ...MyGame, seed: 42 };        // deterministic sequence
const client = Client({ game: { ...MyGame, seed: 'fixed' } });   // for tests
```

Fully mocking randomness in tests:

```js
import { MockRandom } from 'boardgame.io/dist/esm/testing.js';
const randomPlugin = MockRandom({ D6: () => 6 });
const game = { ...MyGame, plugins: [...(MyGame.plugins || []), randomPlugin] };
```

## Undo / Redo

- Enabled by default; clients call `client.undo()` / `props.undo()` (and redo).
- Only the player who made the **last move** may undo it.
- Undo restores `G`, `ctx`, **and plugin state** (including the PRNG), so a
  reroll after undo produces a fresh number — no "undo until I roll a 6"
  exploit on values, but the player *sees* what they rolled. Hence:
- Make revealing moves non-undoable:

```js
moves: {
  rollDice: {
    move: ({ G, random }) => { G.roll = random.D6(); },
    undoable: false,
  },
}
```

- Disable globally with `disableUndo: true` on the game.
- Events (endTurn etc.) are not part of the undo stack — only moves.

## Testing game logic

No React, no server needed. Three levels:

### 1. Move unit tests (fastest)

```js
import MyGame from '../src/game';
const { moves, setup } = MyGame;

test('clickCell claims an empty cell', () => {
  const G = setup({ ctx: { currentPlayer: '0', numPlayers: 2 } });
  moves.clickCell({ G, playerID: '0', random: {} }, 4);
  expect(G.cells[4]).toBe('0');
});
```

(For mutation-style moves the above works directly; you may also build the
arg object with a real `ctx` via a headless client, below.)

### 2. Headless client scenario tests

```js
// Plain Node: import the deep ESM build (see client-server.md module map).
import { Client } from 'boardgame.io/dist/esm/client.js';
import MyGame from '../src/game.js';

test('game ends in a draw', () => {
  const DrawGame = { ...MyGame, setup: () => presetDrawState() };  // scenario seeding
  const client = Client({ game: DrawGame });
  client.moves.clickCell(8);
  const { ctx, G } = client.getState();
  expect(ctx.gameover).toEqual({ draw: true });
});
```

Override `setup` to seed scenario states; use a fixed `seed` for randomness.

### 3. Multiplayer / interaction tests with Local()

```js
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';

const spec = { game: MyGame, multiplayer: Local() };
const p0 = Client({ ...spec, playerID: '0' });
const p1 = Client({ ...spec, playerID: '1' });
p0.start(); p1.start();
p0.moves.clickCell(0);
p0.events.endTurn();
p1.moves.clickCell(3);
```

### 4. Full-game auto-play tests (highest-value regression net)

Write a bot that plays a whole match through the same `client.moves.*`
calls the board UI makes — summon/attack/end-turn per turn for the current
player — and loop until `ctx.gameover` (cap the turns). Run it for several
seeds. This catches rule deadlocks (games that never end), stuck turn
state, and crashes in move sequences no unit test predicts. The
`card-game` template ships one (`tests/fullgame.test.js`); copy and adapt
its decision logic when rules change. Assert on every run: gameover
exists, the winner is valid, and the loser actually satisfies a losing
condition (`lp <= 0 || deckOut`).

For UI, use React Testing Library against the board component with mocked
props (`G`, `ctx`, `moves`).

## TypeScript

```ts
// game.ts
import type { Game, Move, Ctx } from 'boardgame.io';

export interface GameState {
  cells: (string | null)[];
  score: Record<string, number>;
}

const clickCell: Move<GameState> = ({ G, playerID }, id: number) => {
  if (G.cells[id] !== null) return INVALID_MOVE;
  G.cells[id] = playerID;
};

export const TicTacToe: Game<GameState> = {
  name: 'tic-tac-toe',
  setup: ({ ctx }) => ({ cells: Array(9).fill(null), score: {} }),
  moves: { clickCell },
  endIf: ({ G, ctx }) => { ... },
};

// board.tsx
import type { BoardProps } from 'boardgame.io/react';
import type { GameState } from './game';

export function Board({ G, ctx, moves, isActive }: BoardProps<GameState>) {
  // G and moves are fully typed
}
```

Type the game once (`Game<GameState>`); `Move<GameState>` and
`BoardProps<GameState>` reuse it.

## Debug panel

- `debug` accepts `true`/`false` or an options object. Enabled by default in
  development (toggle with the `bgio-debug` button).
- Stripped from production builds unless you opt in:

```js
import { Debug } from 'boardgame.io/debug';
const App = Client({ game, board, debug: { impl: Debug } });
```

- Features: inspect G/ctx, dispatch moves manually, rewind state, simulate
  bots, edit log. Indispensable for verifying game flow before the UI exists.
- `client.getState().log` and `props.log` expose the move log
  (respecting `redact`).

## Performance & correctness notes

- `G` is deep-cloned/diffed by the framework; keep it small-ish and
  normalized (IDs, not duplicated objects). Avoid huge unbounded history
  arrays in `G` — store what the game needs.
- Use `deltaState: true` on the game for large states (server sends
  move-patches instead of full state) — advanced; verify client
  compatibility before adopting.
- `onPlayerLeave` is the hook to clean up when a player abandons an online
  match (fold their hand, release resources) — call the injected
  `removePlayer` to drop them from the turn order.
- Debounce nothing in moves; moves are cheap, deterministic functions.
