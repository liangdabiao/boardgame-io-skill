// 西游斗法 —— 游戏规则无头测试（纯 Node 运行，无需 React/服务器）。
// Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { JourneyWestDuel } from '../src/game.js';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';

const { moves, playerView } = JourneyWestDuel;

// ---- 造一个可控的局面 ----
function scenario(over = {}) {
  const P = () => ({
    lp: 8000,
    hand: [],
    deck: ['imp', 'imp', 'imp'], // 保底不空
    field: [null, null, null],
    graveyard: [],
    normalSummonUsed: false,
    deckOut: false,
  });
  return {
    G: { players: { 0: P(), 1: P() }, step: 'main', ...over },
    ctx: { currentPlayer: '0', turn: 2, numPlayers: 2 },
  };
}

const run = (move, G, ctx, playerID, ...args) =>
  move({ G, ctx, playerID, events: { endTurn() {} } }, ...args);

// ---- 初始设置 ----

test('setup: 双方各 5 张手牌、法力 8000、23 张卡组已洗', () => {
  const G = JourneyWestDuel.setup({
    random: { Shuffle: (arr) => [...arr].sort() },
    ctx: { numPlayers: 2 },
  });
  for (const id of ['0', '1']) {
    assert.equal(G.players[id].hand.length, 5);
    assert.equal(G.players[id].lp, 8000);
    assert.equal(G.players[id].deck.length, 18); // 23 - 5
    assert.equal(G.players[id].field.length, 3);
  }
});

// ---- 通常召唤 ----

test('4★神魔可直接召唤，每回合限一次', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['bajie', 'imp'];

  assert.ok(run(moves.summonMonster, G, ctx, '0', 0, 0) !== 'INVALID_MOVE');
  assert.equal(G.players[0].field[0].card, 'bajie');
  assert.equal(G.players[0].hand.length, 1);

  assert.equal(run(moves.summonMonster, G, ctx, '0', 0, 1), 'INVALID_MOVE');
});

test('召唤只能落在空槽位', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['bajie', 'wujing'];
  run(moves.summonMonster, G, ctx, '0', 0, 1);
  assert.equal(run(moves.summonMonster, G, ctx, '0', 1, 1), 'INVALID_MOVE');
});

// ---- 祭品召唤 ----

test('8★召唤需 2 祭品：自动祭掉攻击力最低的两只，可落位腾出的槽', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['wukong']; // 8★ 3000
  G.players[0].field = [
    { card: 'bajie', attacked: false }, // 1700 保留
    { card: 'imp', attacked: false },   // 1000 -> 祭品
    { card: 'wujing', attacked: false },// 1500 -> 祭品
  ];

  // 召唤到槽 1（imp 的位置，将被祭品腾出）
  run(moves.summonMonster, G, ctx, '0', 0, 1);
  assert.equal(G.players[0].field[0].card, 'bajie');
  assert.equal(G.players[0].field[1].card, 'wukong');
  assert.equal(G.players[0].field[2], null);
  assert.deepEqual(G.players[0].graveyard.sort(), ['imp', 'wujing']);
});

test('6★召唤需 1 祭品；场上神魔不足则失败', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['sixEars']; // 6★ 2200
  assert.equal(run(moves.summonMonster, G, ctx, '0', 0, 0), 'INVALID_MOVE');

  G.players[0].field = [{ card: 'imp', attacked: false }, null, null];
  run(moves.summonMonster, G, ctx, '0', 0, 2);
  assert.equal(G.players[0].field[2].card, 'sixEars');
  assert.equal(G.players[0].field[0], null);
  assert.deepEqual(G.players[0].graveyard, ['imp']);
});

// ---- 斗法 ----

function battleScenario(atkCard, defCard) {
  const { G, ctx } = scenario();
  G.step = 'battle';
  G.players[0].field = [{ card: atkCard, attacked: false }, null, null];
  G.players[1].field = [{ card: defCard, attacked: false }, null, null];
  return { G, ctx };
}

test('斗法：攻击力更高 -> 破坏对方并造成差额伤害', () => {
  const { G, ctx } = battleScenario('bajie', 'imp'); // 1700 vs 1000
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[1].field[0], null);
  assert.equal(G.players[1].lp, 8000 - 700);
  assert.equal(G.players[0].lp, 8000);
});

test('斗法：攻击力更低 -> 己方被破坏并受差额伤害', () => {
  const { G, ctx } = battleScenario('imp', 'bajie');
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[0].field[0], null);
  assert.equal(G.players[0].lp, 8000 - 700);
  assert.equal(G.players[1].field[0].card, 'bajie');
});

test('斗法：攻击力相同 -> 同归于尽，无伤害', () => {
  const { G, ctx } = battleScenario('bajie', 'bajie');
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[0].field[0], null);
  assert.equal(G.players[1].field[0], null);
  assert.equal(G.players[0].lp, 8000);
  assert.equal(G.players[1].lp, 8000);
});

test('每只神魔每回合只能攻击一次；对方有神魔时不能直取元神', () => {
  const { G, ctx } = battleScenario('wukong', 'imp'); // 3000 vs 1000
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[1].field[0], null);
  assert.equal(run(moves.attack, G, ctx, '0', 0, null), 'INVALID_MOVE');

  G.players[0].field[0].attacked = false;
  run(moves.attack, G, ctx, '0', 0, null);
  assert.equal(G.players[1].lp, 3000); // (8000 - 2000) - 3000
});

test('主要阶段不能攻击；先手第一回合不能进斗法阶段', () => {
  const { G, ctx } = scenario(); // step = 'main', ctx.turn = 2
  G.players[0].field = [{ card: 'wukong', attacked: false }, null, null];
  assert.equal(run(moves.attack, G, ctx, '0', 0, null), 'INVALID_MOVE');

  const ctxT1 = { ...ctx, turn: 1 };
  assert.equal(run(moves.toBattle, G, ctxT1, '0'), 'INVALID_MOVE');

  run(moves.toBattle, G, ctx, '0'); // turn >= 2: 允许
  assert.equal(G.step, 'battle');
});

// ---- 法术 ----

test('七十二变抽 2 张；紧箍咒破坏对方攻击力最高者；人参果 +1000 法力', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['transform', 'jingu', 'ginseng'];
  G.players[0].deck = ['imp', 'imp', 'imp'];
  G.players[1].field = [
    { card: 'wukong', attacked: false },  // 3000 最高 -> 被紧箍咒破坏
    { card: 'imp', attacked: false },     // 1000 保留
    null,
  ];

  run(moves.activateSpell.move, G, ctx, '0', 0); // transform
  assert.equal(G.players[0].hand.length, 4); // -1 +2
  assert.equal(G.players[0].deck.length, 1);

  run(moves.activateSpell.move, G, ctx, '0', 0); // jingu（现在 hand[0]）
  assert.equal(G.players[1].field[0], null);
  assert.equal(G.players[1].field[1].card, 'imp');
  assert.equal(G.players[1].graveyard.length, 1);

  run(moves.activateSpell.move, G, ctx, '0', 0); // ginseng
  assert.equal(G.players[0].lp, 9000);
});

test('紧箍咒在对方空场时不能发动', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['jingu'];
  assert.equal(run(moves.activateSpell.move, G, ctx, '0', 0), 'INVALID_MOVE');
});

test('还魂丹：从墓地特殊召唤（不占通常召唤，可选目标）', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['elixir', 'bajie'];
  G.players[0].graveyard = ['wukong', 'imp'];

  // 指定还魂 wukong（graveyard 索引 0）
  run(moves.activateSpell.move, G, ctx, '0', 0, 0);
  assert.equal(G.players[0].field[0].card, 'wukong');
  assert.deepEqual(G.players[0].graveyard, ['imp']);

  // 特殊召唤后仍可通常召唤
  run(moves.summonMonster, G, ctx, '0', 0, 1);
  assert.equal(G.players[0].field[1].card, 'bajie');
});

// ---- 胜负 ----

test('法力归零判负；卡组抽干判负', () => {
  const { G } = scenario();
  G.players[1].lp = 2000;
  G.players[0].field = [{ card: 'wukong', attacked: false }, null, null];
  G.step = 'battle';
  const ctx = { currentPlayer: '0', turn: 2, numPlayers: 2 };
  run(moves.attack, G, ctx, '0', 0, null);
  assert.deepEqual(JourneyWestDuel.endIf({ G, ctx }), { winner: '0' });

  const { G: G2 } = scenario();
  G2.players[1].deckOut = true;
  assert.deepEqual(JourneyWestDuel.endIf({ G: G2, ctx }), { winner: '0' });
});

// ---- 秘密状态 ----

test('playerView: 隐藏对方手牌与双方卡组内容', () => {
  const { G } = scenario();
  G.players[0].hand = ['wukong', 'jingu'];
  G.players[1].hand = ['bajie', 'bajie', 'bajie'];
  const view = playerView({ G, playerID: '0' });

  assert.deepEqual(view.players[0].hand, ['wukong', 'jingu']); // 自己可见
  assert.deepEqual(view.players[1].hand, [null, null, null]); // 对方隐藏
  assert.ok(view.players[0].deck.every((c) => c === null)); // 卡组隐藏
  assert.equal(view.players[1].deck.length, 3); // 但数量保留（UI 显示牌背）
  assert.equal(view.players[0].graveyard.length, 0); // 墓地公开
});

// ---- Local() 双客户端集成：回合轮转 / 自动抽牌 / 秘密状态 ----

test('Local 对局: 回合轮转、每回合开始抽 1 张、对方手牌不可见', async () => {
  const spec = {
    game: { ...JourneyWestDuel, seed: 'test' },
    multiplayer: Local(),
  };
  const p0 = Client({ ...spec, playerID: '0' });
  const p1 = Client({ ...spec, playerID: '1' });
  p0.start();
  p1.start();
  await new Promise((r) => setTimeout(r, 150));

  const s0 = p0.getState();
  assert.equal(s0.ctx.turn, 1);
  assert.equal(s0.ctx.currentPlayer, '0');
  assert.equal(s0.G.players[0].hand.length, 6); // 5 + 回合开始抽 1
  assert.ok(s0.G.players[1].hand.every((c) => c === null));

  p0.moves.endTurn();
  await new Promise((r) => setTimeout(r, 150));

  const s1 = p1.getState();
  assert.equal(s1.ctx.turn, 2);
  assert.equal(s1.ctx.currentPlayer, '1');
  assert.equal(s1.G.step, 'main');
  assert.equal(s1.G.players[1].hand.length, 6);
  assert.ok(s1.G.players[0].hand.every((c) => c === null));

  p0.stop();
  p1.stop();
});
