---
name: boardgame-io
description: Build turn-based games with the boardgame.io framework (v0.50.x API). Use whenever the user wants to create, extend, or debug a board/card/dice/strategy game with boardgame.io — e.g. "make tic-tac-toe / chess / a card game", "add multiplayer to my boardgame.io game", "define phases/moves/turns", writing bots, lobby/matchmaking, or any mention of boardgame.io, bgio, 回合制游戏, 桌游, 棋牌游戏, 桌面游戏开发. Covers game state design, moves, phases, stages, turn order, events, random, secret state, React board UI, client/server/lobby setup, and testing.
---

# boardgame.io Game Development

Create turn-based games (board games, card games, dice games) with the
[boardgame.io](https://boardgame.io) framework, **targeting the v0.50.x API**.
This skill guides the full workflow: designing game state, defining rules,
building the UI, wiring multiplayer, and testing.

## When to use

Use for any request to create, extend, or debug a game built on boardgame.io —
including tic-tac-toe / chess / card / dice / strategy games, 棋牌 / 桌游 /
回合制游戏 — in JavaScript or TypeScript, with or without a UI.

## Golden rules (read first — these prevent 90% of bugs)

The framework runs your move/hook functions identically on client (optimistic)
and server, serializes all state over the network, and replays state for undo
and bots. Everything below follows from that:

1. **`G` must be JSON-serializable.** Plain objects, arrays, numbers, strings,
   booleans, null. No class instances, no functions, no `undefined` inside
   arrays. Use IDs/indices instead of references.
2. **Never touch `ctx`.** It is framework-managed. To end a turn, change
   phases, etc., call `events.*` (see below). In moves, read `ctx`
   (`ctx.currentPlayer`, `ctx.numPlayers`, `ctx.playOrder`, `ctx.phase`,
   `ctx.activePlayers`), never write it.
3. **Never use `Math.random()` or `Date.now()`.** Use the injected `random`
   API (`random.D6()`, `random.Shuffle(deck)`, …). It is seeded and
   deterministic, which is required for replay, undo, and bots.
4. **In every move, either mutate `G` and return nothing, or return a new `G`
   — never both.** Both styles are valid; mixing them is an error.
5. **Moves must be pure and side-effect free.** No network calls, no
   `console.log` on hot paths, no reading external state. Same inputs → same
   result.
6. **Guard `ctx.activePlayers`** — it is `null` when no stage is active.
7. **Player IDs are strings** (`'0'`, `'1'`, …). Key per-player state by
   string: `G.players[ctx.currentPlayer]`.
8. **Reject illegal moves with `INVALID_MOVE`** (from `boardgame.io/core`)
   instead of throwing, and make invalid input a no-op in UI handlers.

## The v0.50 API shape (memorize this)

Every callback receives a single destructured first argument:

```js
// moves, setup, hooks, endIf, playerView — all use this shape
moveName: ({ G, ctx, playerID, events, random }, ...args) => { ... }
```

(Pre-0.50 code passing `(G, ctx)` as two arguments is outdated — don't
generate it, and update it when you see it.)

## Workflow: build a game in 5 steps

### Step 1 — Clarify the game and design `G`

Before writing code, list: players, board/pieces representation, one move
type per player action, turn order, and win/lose/draw conditions. Choose the
simplest serializable `G` that captures it. If unsure, sketch `G` and the
moves as a short plan first.

### Step 2 — Define game logic (`src/game.js`)

```js
// deep import so this file also loads under plain-Node tests (see Step 5)
import { INVALID_MOVE } from 'boardgame.io/dist/esm/core.js';

export const MyGame = {
  name: 'my-game',                       // unique name (used by server/lobby)
  setup: ({ ctx, setupData }) => ({      // returns initial G
    cells: Array(9).fill(null),
  }),
  moves: {
    clickCell: ({ G, playerID }, id) => {
      if (G.cells[id] !== null) return INVALID_MOVE;
      G.cells[id] = playerID;            // mutation style; return nothing
    },
  },
  turn: { minMoves: 1, maxMoves: 1 },    // auto-end turn after 1 move
  endIf: ({ G, ctx }) => {               // truthy return ends the game
    if (isVictory(G.cells)) return { winner: ctx.currentPlayer };
    if (G.cells.every((c) => c !== null)) return { draw: true };
  },
};
```

Victory/draw helpers (`isVictory` above) are plain functions kept in the same
file. For anything beyond a single phase — draws, auctions, simultaneous
reveals — read `references/game-definition.md` for phases, stages,
`setActivePlayers`, turn orders, and the events API.

### Step 3 — Build the board UI (`src/board.jsx`)

A React component that receives everything as props. It renders `G`/`ctx` and
calls `props.moves.*`. **Never compute game logic in the UI** — only
display-level checks (e.g. dimming inactive cells):

```jsx
const Board = ({ G, ctx, moves, isActive, playerID }) => (
  <div>
    {ctx.gameover ? (
      <div>{ctx.gameover.winner != null ? `Winner: ${ctx.gameover.winner}` : 'Draw!'}</div>
    ) : (
      <div>Turn: player {ctx.currentPlayer}</div>
    )}
    <table id="board">
      <tbody>
        {[0, 1, 2].map((row) => (
          <tr key={row}>
            {[0, 1, 2].map((col) => {
              const id = 3 * row + col;
              return (
                <td key={id}
                    onClick={() => isActive && G.cells[id] === null && moves.clickCell(id)}>
                  {G.cells[id]}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
export default Board;
```

Full list of board props: `G`, `ctx`, `moves`, `events`, `reset`, `undo`,
`redo`, `previewState`, `loadState`, `isActive`, `isMultiplayer`,
`isConnected`, `isPreview`, `playerID`, `matchID`, `matchData`,
`credentials`, `log`, `chatMessages`, `sendChatMessage`.
Read `ctx.gameover` to detect game end.

### Step 4 — Wire the client (`src/index.jsx`)

Pick the mode by how the game is played:

```jsx
import { Client } from 'boardgame.io/react';
import { Local, SocketIO } from 'boardgame.io/multiplayer';
import MyGame from './game';
import Board from './board';

// Hot-seat (both players share this one screen): NO multiplayer option.
// One <App/> renders the shared view; the framework ends each player's
// turn automatically. Simplest mode — start here.
const App = Client({ game: MyGame, board: Board, debug: true });

// Two separate views (two panels/tabs, no server): Local() + a seat per instance.
// const App = Client({ game: MyGame, board: Board, multiplayer: Local() });
// <App matchID="m" playerID="0" />  <App matchID="m" playerID="1" />

// Online (needs the server from step 5):
// const App = Client({ game: MyGame, board: Board,
//   multiplayer: SocketIO({ server: 'localhost:8000' }) });
// <App matchID="xyz" playerID="0" credentials="..." />
```

With `multiplayer` set, a client without `playerID` is a spectator (sees
state, cannot move) — every interactive view needs its seat. `isActive` is
true only when the local player may act now — gate every interactive
element on it.

### Step 5 — Add server + tests (as needed)

A hot-seat or `Local()` game needs no server at all. For online play:

```js
// server.cjs — CommonJS on purpose (see "Import paths" note below)
const { Server, Origins } = require('boardgame.io/server');

(async () => {
  const { Game } = await import('./src/game.js');   // game stays ESM
  const server = Server({ games: [Game], origins: [Origins.LOCALHOST_IN_DEVELOPMENT] });
  server.run(8000, () => console.log('http://localhost:8000'));
})();
```

For online play with match creation/joining, read
`references/client-server.md` (lobby API).

**Import paths — bundler vs plain Node.** boardgame.io@0.50.x has no Node
`exports` map. Subpaths like `boardgame.io/client` / `/react` /
`/multiplayer` / `/core` resolve fine in bundlers (Vite/webpack) but fail in
plain Node with `ERR_UNSUPPORTED_DIR_IMPORT`. In Node-run code (tests,
scripts) — **and in any file they import, which is typically `game.js`** —
use the deep ESM builds instead: `boardgame.io/dist/esm/client.js`,
`boardgame.io/dist/esm/core.js`, … (works in Vite too). The server is
CJS-only: use `require('boardgame.io/server')` from a `.cjs` file (the
template's `server.cjs` shows how). Browser-only files (`index.jsx`,
`board.jsx`) can use the normal subpaths.

**Static assets (card art, sprites) follow the same rule.** Never
`import img from './card.jpg'` in a module that plain-Node tests also load
(`cards.js`, `game.js`) — Node dies with `ERR_UNKNOWN_FILE_EXTENSION`.
Use Vite's URL asset pattern, which both worlds accept:

```js
const img = (file) => new URL(`./assets/cards/${file}`, import.meta.url).href;
export const CARDS = { wukong: { ..., img: img('wukong.jpg') } };
```

Render it as a background `<img>` on the card component. For generating
card art with an image-generation tool: batch all cards with one shared
style prompt (consistent look), save to `src/assets/cards/`, and reference
via the helper above.

Test game logic headless — no React needed (details in
`references/advanced.md`):

```js
// runs under plain Node — note the deep import (see box above)
import { Client } from 'boardgame.io/dist/esm/client.js';
import MyGame from './src/game.js';

test('first move fills the cell', () => {
  const client = Client({ game: MyGame });
  client.moves.clickCell(0);
  const { G } = client.getState();
  expect(G.cells[0]).toBe('0');
});
```

## Building a NEW game: copy, don't rewrite (CRITICAL)

**The #1 mistake** when building a new boardgame.io game is rewriting the
engine from scratch. This has failed every time it was attempted. Instead:

1. **Start from a working game** (journey-west or card-game template)
2. **Only change the theme** (cards, names, story text, CSS colors)
3. **Keep the engine architecture identical**: same `game.js` structure,
   same `bot.js` pattern, same `board.jsx` layout, same `index.jsx` setup
4. **Test in a real browser after EVERY change** — unit tests passing
   does NOT mean the browser experience works

**The proven architecture for single-player vs AI:**
- `index.jsx`: `multiplayer: Local()` + `createBossClient` (bot subscribes
  and acts on player 1's turn)
- `game.js`: `endIf` for victory, `playerView` for hidden info,
  `turn.onBegin` for draw/reset, `events.endTurn()` for turn cycling
- `bot.js`: scripted AI that calls `client.moves.*` on its turn
- Removing `multiplayer: Local()` kills the AI opponent — never do this
  to "fix" click issues (the click issue is elsewhere)

**Story mode as a wrapper:** Use `G.mode` ('menu' | 'story' | 'battle')
to switch UI views in board.jsx. The battle engine doesn't know about
story — it's purely a UI layer.

## Ready-made project skeleton

Two ready-made skeletons live under `assets/templates/` (both vite +
react, with tests and an optional server). Copy the matching one and edit
its game definition/board — prefer a template over inventing scaffolding:

| Template | Use for | Demonstrates beyond the basics |
|---|---|---|
| `minimal/` | board games, quick starts (tic-tac-toe) | moves, `INVALID_MOVE`, turn limits, `endIf`, one-click tests |
| `card-game/` | card games, hidden hands/decks, combat | `playerView` secret state, `random.Shuffle`, `client: false` spells, `G.step` turn sub-phases, status-line feedback for every action, restart button, full-game auto-play tests (read its README) |

For any game with hidden information or per-turn sub-phases, start from
`card-game/` — its patterns (secret state, one-click UX, feedback on
illegal actions) are already battle-tested.

## Reference routing — read on demand

| Need | File |
|---|---|
| Phases, stages, `setActivePlayers`, custom turn order, events, bots/AI, long-form moves, `playerView`/secret state | `references/game-definition.md` |
| React client options, plain JS client, SocketIO multiplayer, server config, lobby (match create/join), persistence | `references/client-server.md` |
| Random API, undo strategy, testing patterns, TypeScript, debug panel, performance | `references/advanced.md` |
| Sound effects, animations, action showcase/narration, game feel (esp. for hidden-info or AI-opponent games) | `references/game-feel.md` |

Read the relevant reference **before** writing code that uses those
features — exact option names and hook support matrices matter.

## Common pitfalls checklist

Before finishing, verify:

- [ ] No `Math.random()` / `Date.now()` / side effects in moves or hooks.
- [ ] No writes to `ctx`; turn/phase changes go through `events.*`.
- [ ] Every move either mutates `G` silently or returns a new `G` — never both.
- [ ] Phase-level `moves` **replace** global moves (they don't merge) —
      re-list or re-export shared moves.
- [ ] `ctx.activePlayers` guarded against `null`.
- [ ] Ending a phase implicitly ends the current turn first — don't fight it.
      (For per-turn sub-steps like draw/main/battle, track a `G.step` field
      with move guards instead of using flow phases.)
- [ ] Random-dependent moves are `client: false` or rely on the framework's
      optimistic-update discard (random makes moves server-authoritative
      automatically).
- [ ] Dice rolls / card draws that reveal information are `undoable: false`
      (undo would let players peek and reroll).
- [ ] UI interactivity gated on `isActive`; game over handled via
      `ctx.gameover`.
- [ ] Each game on a server has a unique `name`.

## UI playability checklist (learned the hard way)

A correct game definition can still be unplayable if the board UI wires
clicks badly. Before calling a game "playable":

- [ ] **Every clickable element has its handler attached in all states** —
      e.g. empty board slots need `onClick` too, or summoning is impossible.
      (Bug seen: `onClick={entry ? handler : undefined}` on slot arrays.)
- [ ] **Every rejected action shows visible feedback.** `INVALID_MOVE` is
      silent; mirror the move guards in the board and display the reason in
      a status line. Never leave a click without a reaction.
- [ ] **Prefer one-click actions.** Click hand card = summon to first empty
      slot / activate spell. Multi-step select-then-place flows confuse
      players and multiply wiring bugs.
- [ ] **Disable the debug panel** (`debug: false`) for playable builds — it
      floats above the board and intercepts real clicks.
- [ ] **No hover transforms** (`translateY` etc.) on clickable cards — the
      element moves under the pointer and breaks both humans and automation.
      Use border/glow effects instead.
- [ ] **Fit one screen.** Players use small panes; controls below the fold
      look like dead buttons. Compact cards/paddings and verify total page
      height against a ~900px viewport.
- [ ] Offer a **restart / new game** control (remount the client with a new
      `matchID` + `key`), or players are stuck in a finished match.

## Game feel checklist (for games humans will actually enjoy)

Read `references/game-feel.md` before adding sound/animation/showcase work.
The non-negotiables:

- [ ] **Every important action gets an on-screen notification — players
      do not read battle logs.** Confirmed tiered scheme: card-duel popup
      (both cards + outcome badges) for monster battles, card popup for
      opponent summons/board spells, text popup for everything else
      (direct attacks, draws, heals). One popup per event, never queued,
      never delayed sequences; match AI pacing to popup duration.
- [ ] SFX: Web Audio synthesis (zero assets), unlocked on first pointer
      interaction, mute persisted; BGM separate toggle.
