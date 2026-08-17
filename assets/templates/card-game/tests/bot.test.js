// AI 妖魔主测试 —— 纯决策逻辑 + 人机集成（AI 自动行动并交还回合）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { JourneyWestDuel } from '../src/game.js';
import { decideNextAction, createBotClient } from '../src/bot.js';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';

const mk = (over = {}) => ({
  G: {
    players: {
      0: { lp: 8000, hand: [], deck: [], field: [null, null, null], graveyard: [], normalSummonUsed: false },
      1: { lp: 8000, hand: [], deck: [], field: [null, null, null], graveyard: [], normalSummonUsed: false },
    },
    step: 'main',
    ...over,
  },
  ctx: { currentPlayer: '1', turn: 2, numPlayers: 2 },
});

// ---- 纯决策逻辑 ----

test('决策：主要阶段优先发动有益法术（紧箍咒对有怪对手）', () => {
  const { G, ctx } = mk();
  G.players[1].hand = ['jingu', 'bajie'];
  G.players[0].field = [{ card: 'wukong', attacked: false }, null, null];
  const a = decideNextAction({ G, ctx }, '1');
  assert.deepEqual(a, { kind: 'spell', handIdx: 0 });
});

test('决策：无敌方神魔时不用紧箍咒，改为召唤最强神魔', () => {
  const { G, ctx } = mk();
  G.players[1].hand = ['jingu', 'imp', 'bajie'];
  const a = decideNextAction({ G, ctx }, '1');
  assert.equal(a.kind, 'summon');
  assert.equal(a.handIdx, 2); // bajie 1700 > imp 1000
  assert.equal(a.slot, 0);
});

test('决策：法力吃紧时喝人参果', () => {
  const { G, ctx } = mk();
  G.players[1].hand = ['ginseng'];
  G.players[1].lp = 4000;
  assert.deepEqual(decideNextAction({ G, ctx }, '1'), { kind: 'spell', handIdx: 0 });
});

test('决策：斗法阶段直取元神（对方空场）', () => {
  const { G, ctx } = mk({ step: 'battle' });
  G.players[1].field = [{ card: 'wukong', attacked: false }, null, null];
  assert.deepEqual(decideNextAction({ G, ctx }, '1'), { kind: 'attack', attacker: 0, target: null });
});

test('决策：只打能赢的目标，打不过按兵不动交还回合', () => {
  const { G, ctx } = mk({ step: 'battle' });
  G.players[1].field = [{ card: 'imp', attacked: false }, null, null]; // 1000
  G.players[0].field = [{ card: 'wukong', attacked: false }, null, null]; // 3000
  assert.deepEqual(decideNextAction({ G, ctx }, '1'), { kind: 'endTurn' });

  // 攻击力相同（>=）可以换掉对方
  G.players[0].field = [{ card: 'bajie', attacked: false }, null, null]; // 1700
  G.players[1].field = [{ card: 'bajie', attacked: false }, null, null]; // 1700
  const a = decideNextAction({ G, ctx }, '1');
  assert.deepEqual(a, { kind: 'attack', attacker: 0, target: 0 });
});

test('决策：先手第一回合无战斗，直接结束回合', () => {
  const { G } = mk();
  G.players[1].hand = [];
  const a = decideNextAction({ G, ctx: { currentPlayer: '1', turn: 1, numPlayers: 2 } }, '1');
  assert.deepEqual(a, { kind: 'endTurn' });
});

// ---- 人机集成：AI 自动行动并交还回合 ----

test('人机对局：人类结束回合后 AI 自动行动并轮回人类', async () => {
  const game = { ...JourneyWestDuel, seed: 'ai-1' };
  const mp = Local();
  const human = Client({ game, multiplayer: mp, matchID: 'aitest', playerID: '0' });
  const bot = createBotClient({
    game,
    multiplayer: mp,
    matchID: 'aitest',
    playerID: '1',
    delayMs: 40,
  });
  human.start();
  await new Promise((r) => setTimeout(r, 150));

  // 人类先手第一回合：直接结束
  human.moves.endTurn();
  await new Promise((r) => setTimeout(r, 150));

  // 等 AI 打完它的回合（上限 8 秒）
  let backToHuman = false;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 80));
    const s = human.getState();
    if (!s.ctx.gameover && s.ctx.currentPlayer === '0' && s.ctx.turn >= 3) {
      backToHuman = true;
      break;
    }
  }
  assert.ok(backToHuman, 'AI 应在时限内行动完毕并交还回合');

  const s = human.getState();
  assert.equal(s.ctx.turn, 3);
  // AI 回合应有产出：召唤过神魔或手牌变化（至少抽了牌）
  assert.ok(
    s.G.players[1].field.some(Boolean) || s.G.players[1].hand.length >= 6,
    'AI 回合应有召唤或手牌增长'
  );

  bot.stop();
  human.stop();
});
