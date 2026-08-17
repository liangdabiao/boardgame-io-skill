// 游戏规则无头测试 —— 纯 Node 运行，无需 React/服务器。
// Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelMonsters } from '../src/game.js';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';

const { moves, playerView } = DuelMonsters;

// ---- 造一个可控的局面 ----
function scenario(over = {}) {
  const P = () => ({
    lp: 8000,
    hand: [],
    deck: ['smallDragon', 'smallDragon', 'smallDragon'], // 保底不空
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

test('setup: 双方各 5 张手牌、LP 8000、卡组已洗', () => {
  const G = DuelMonsters.setup({
    random: { Shuffle: (arr) => [...arr].sort() }, // 确定性"洗牌"
    ctx: { numPlayers: 2 },
  });
  for (const id of ['0', '1']) {
    assert.equal(G.players[id].hand.length, 5);
    assert.equal(G.players[id].lp, 8000);
    assert.equal(G.players[id].deck.length, 17); // 22 - 5
    assert.equal(G.players[id].field.length, 3);
  }
});

// ---- 通常召唤 ----

test('4★怪兽可直接召唤，每回合限一次', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['goblin', 'smallDragon'];

  assert.ok(run(moves.summonMonster, G, ctx, '0', 0, 0) !== 'INVALID_MOVE');
  assert.equal(G.players[0].field[0].card, 'goblin');
  assert.equal(G.players[0].hand.length, 1);

  // 第二次召唤：本回合通常召唤已用
  assert.equal(run(moves.summonMonster, G, ctx, '0', 0, 1), 'INVALID_MOVE');
});

test('召唤只能落在空槽位', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['goblin', 'goblin'];
  run(moves.summonMonster, G, ctx, '0', 0, 1);
  assert.equal(run(moves.summonMonster, G, ctx, '0', 1, 1), 'INVALID_MOVE');
});

// ---- 祭品召唤 ----

test('7★召唤需 2 祭品：自动祭掉攻击力最低的两只，可落位腾出的槽', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['blueEyes'];
  G.players[0].field = [
    { card: 'goblin', attacked: false },      // 1700 保留
    { card: 'smallDragon', attacked: false }, // 1000 -> 祭品
    { card: 'curseDragon', attacked: false }, // 1500 -> 祭品
  ];

  // 召唤到槽 1（smallDragon 的位置，将被祭品腾出）
  run(moves.summonMonster, G, ctx, '0', 0, 1);
  assert.equal(G.players[0].field[0].card, 'goblin');
  assert.equal(G.players[0].field[1].card, 'blueEyes');
  assert.equal(G.players[0].field[2], null);
  assert.deepEqual(G.players[0].graveyard.sort(), ['curseDragon', 'smallDragon']);
});

test('5★召唤需 1 祭品；场上怪兽不足则失败', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['cyber'];
  assert.equal(run(moves.summonMonster, G, ctx, '0', 0, 0), 'INVALID_MOVE');

  G.players[0].field = [{ card: 'smallDragon', attacked: false }, null, null];
  run(moves.summonMonster, G, ctx, '0', 0, 2);
  assert.equal(G.players[0].field[2].card, 'cyber');
  assert.equal(G.players[0].field[0], null);
  assert.deepEqual(G.players[0].graveyard, ['smallDragon']);
});

// ---- 战斗 ----

function battleScenario(atkCard, defCard) {
  const { G, ctx } = scenario();
  G.step = 'battle';
  G.players[0].field = [{ card: atkCard, attacked: false }, null, null];
  G.players[1].field = [{ card: defCard, attacked: false }, null, null];
  return { G, ctx };
}

test('战斗：攻击力更高 -> 破坏对方并造成差额伤害', () => {
  const { G, ctx } = battleScenario('goblin', 'smallDragon'); // 1700 vs 1000
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[1].field[0], null);
  assert.equal(G.players[1].lp, 8000 - 700);
  assert.equal(G.players[0].lp, 8000);
});

test('战斗：攻击力更低 -> 己方被破坏并受差额伤害', () => {
  const { G, ctx } = battleScenario('smallDragon', 'goblin');
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[0].field[0], null);
  assert.equal(G.players[0].lp, 8000 - 700);
  assert.equal(G.players[1].field[0].card, 'goblin');
});

test('战斗：攻击力相同 -> 同归于尽，无伤害', () => {
  const { G, ctx } = battleScenario('goblin', 'goblin');
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[0].field[0], null);
  assert.equal(G.players[1].field[0], null);
  assert.equal(G.players[0].lp, 8000);
  assert.equal(G.players[1].lp, 8000);
});

test('每只怪兽每回合只能攻击一次；对方有怪兽时不能直接攻击', () => {
  const { G, ctx } = battleScenario('blueEyes', 'smallDragon');
  run(moves.attack, G, ctx, '0', 0, 0);
  assert.equal(G.players[1].field[0], null);
  assert.equal(run(moves.attack, G, ctx, '0', 0, null), 'INVALID_MOVE');

  // 对方场上清空后可以直接攻击（已攻击过的怪兽重置后可再攻）
  G.players[0].field[0].attacked = false;
  run(moves.attack, G, ctx, '0', 0, null);
  assert.equal(G.players[1].lp, 3000); // (8000 - 2000) - 3000
});

test('主要阶段不能攻击；先手第一回合不能进战斗阶段', () => {
  const { G, ctx } = scenario(); // step = 'main', ctx.turn = 2
  G.players[0].field = [{ card: 'blueEyes', attacked: false }, null, null];
  assert.equal(run(moves.attack, G, ctx, '0', 0, null), 'INVALID_MOVE');

  const ctxT1 = { ...ctx, turn: 1 };
  assert.equal(run(moves.toBattle, G, ctxT1, '0'), 'INVALID_MOVE');

  run(moves.toBattle, G, ctx, '0'); // turn >= 2: 允许
  assert.equal(G.step, 'battle');
});

// ---- 魔法 ----

test('强欲之壶：抽 2 张；雷击：清场对方；治疗药水：+1000 LP', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['potOfGreed', 'raigeki', 'redMedicine'];
  G.players[0].deck = ['a', 'b', 'c'].map(() => 'smallDragon');
  G.players[1].field = [
    { card: 'blueEyes', attacked: false },
    { card: 'golem', attacked: false },
    null,
  ];

  run(moves.activateSpell.move, G, ctx, '0', 0); // potOfGreed
  assert.equal(G.players[0].hand.length, 4); // -1 +2
  assert.equal(G.players[0].deck.length, 1);

  run(moves.activateSpell.move, G, ctx, '0', 0); // raigeki（现在 hand[0]）
  assert.equal(G.players[1].field.filter(Boolean).length, 0);
  assert.equal(G.players[1].graveyard.length, 2);

  run(moves.activateSpell.move, G, ctx, '0', 0); // redMedicine
  assert.equal(G.players[0].lp, 9000);
});

test('死者苏生：从墓地特殊召唤（不占通常召唤，可选目标）', () => {
  const { G, ctx } = scenario();
  G.players[0].hand = ['reborn', 'goblin'];
  G.players[0].graveyard = ['blueEyes', 'smallDragon'];

  // 指定苏生 blueEyes（graveyard 索引 0）
  run(moves.activateSpell.move, G, ctx, '0', 0, 0);
  assert.equal(G.players[0].field[0].card, 'blueEyes');
  assert.deepEqual(G.players[0].graveyard, ['smallDragon']);

  // 特殊召唤后仍可通常召唤
  run(moves.summonMonster, G, ctx, '0', 0, 1);
  assert.equal(G.players[0].field[1].card, 'goblin');
});

// ---- 胜负 ----

test('LP 归零判负；卡组抽干判负', () => {
  const { G } = scenario();
  G.players[1].lp = 2000;
  G.players[0].field = [{ card: 'blueEyes', attacked: false }, null, null];
  G.step = 'battle';
  const ctx = { currentPlayer: '0', turn: 2, numPlayers: 2 };
  run(moves.attack, G, ctx, '0', 0, null);
  assert.deepEqual(DuelMonsters.endIf({ G, ctx }), { winner: '0' });

  const { G: G2 } = scenario();
  G2.players[1].deckOut = true;
  assert.deepEqual(DuelMonsters.endIf({ G: G2, ctx }), { winner: '0' });
});

// ---- 秘密状态 ----

test('playerView: 隐藏对方手牌与双方卡组内容', () => {
  const { G } = scenario();
  G.players[0].hand = ['blueEyes', 'raigeki'];
  G.players[1].hand = ['goblin', 'goblin', 'goblin'];
  const view = playerView({ G, playerID: '0' });

  assert.deepEqual(view.players[0].hand, ['blueEyes', 'raigeki']); // 自己可见
  assert.deepEqual(view.players[1].hand, [null, null, null]); // 对方隐藏
  assert.ok(view.players[0].deck.every((c) => c === null)); // 卡组隐藏
  assert.equal(view.players[1].deck.length, 3); // 但数量保留（UI 显示牌背）
  assert.equal(view.players[0].graveyard.length, 0); // 墓地公开
});

// ---- Local() 双客户端集成：回合轮转 / 自动抽牌 / 秘密状态 ----

test('Local 对局: 回合轮转、每回合开始抽 1 张、对方手牌不可见', async () => {
  const spec = {
    game: { ...DuelMonsters, seed: 'test' },
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
  assert.ok(s0.G.players[1].hand.every((c) => c === null)); // 对方手牌隐藏

  p0.moves.endTurn();
  await new Promise((r) => setTimeout(r, 150));

  const s1 = p1.getState();
  assert.equal(s1.ctx.turn, 2);
  assert.equal(s1.ctx.currentPlayer, '1');
  assert.equal(s1.G.step, 'main'); // 新回合重置为主要阶段
  assert.equal(s1.G.players[1].hand.length, 6);
  assert.ok(s1.G.players[0].hand.every((c) => c === null));

  p0.stop();
  p1.stop();
});
