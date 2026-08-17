// 全自动整局对局测试 —— 通过与 UI 完全相同的 client.moves.* 接口自动打完
// 整局（召唤→战斗→结束回合），直到分出胜负。多局不同种子，验证游戏
// 可以被人类从开局玩到终局而不中途卡死或状态异常。

import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelMonsters } from '../src/game.js';
import { CARDS } from '../src/cards.js';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';

const opp = (id) => (id === '0' ? '1' : '0');
const tributesNeeded = (level) => (level >= 7 ? 2 : level >= 5 ? 1 : 0);

// 与 board.jsx 相同的“人类决策”逻辑：能召就召最强、能打就打
function autoTurn(client, playerID) {
  const { G, ctx } = client.getState();
  if (ctx.gameover) return;
  const me = G.players[playerID];

  // 主要阶段：召唤攻击力最高的可召唤怪兽
  if (G.step === 'main' && !me.normalSummonUsed && me.field.includes(null)) {
    const onField = me.field.filter(Boolean).length;
    const candidates = me.hand
      .map((id, idx) => ({ idx, card: CARDS[id] }))
      .filter(
        ({ card }) =>
          card.type === 'monster' &&
          onField >= tributesNeeded(card.level)
      )
      .sort((a, b) => b.card.atk - a.card.atk);
    if (candidates.length > 0) {
      const slot = me.field.indexOf(null);
      client.moves.summonMonster(candidates[0].idx, slot);
    }
  }

  const after = client.getState();
  if (after.ctx.gameover) return;

  // 战斗阶段：每只可攻击怪兽选择最优目标
  const battle = client.getState();
  if (battle.G.step === 'battle') {
    const G2 = client.getState().G;
    const me2 = G2.players[playerID];
    const foe2 = G2.players[opp(playerID)];

    for (let slot = 0; slot < 3; slot++) {
      const st = client.getState();
      if (st.ctx.gameover) return;
      const entry = st.G.players[playerID].field[slot];
      if (!entry || entry.attacked) continue;

      const targets = st.G.players[opp(playerID)].field
        .map((e, i) => (e ? { i, atk: CARDS[e.card].atk } : null))
        .filter(Boolean);

      if (targets.length === 0) {
        client.moves.attack(slot, null); // 直接攻击
      } else {
        // 打攻击力最低的（性价比最高）
        targets.sort((a, b) => a.atk - b.atk);
        client.moves.attack(slot, targets[0].i);
      }
    }
  }

  const st = client.getState();
  if (st.ctx.gameover) return;
  client.moves.endTurn();
}

async function playFullGame(seed) {
  const spec = {
    game: { ...DuelMonsters, seed },
    multiplayer: Local(),
  };
  const p0 = Client({ ...spec, playerID: '0' });
  const p1 = Client({ ...spec, playerID: '1' });
  p0.start();
  p1.start();
  await new Promise((r) => setTimeout(r, 120));

  let turns = 0;
  while (!p0.getState().ctx.gameover && turns < 200) {
    const current = p0.getState().ctx.currentPlayer;
    autoTurn(current === '0' ? p0 : p1, current);
    await new Promise((r) => setTimeout(r, 25));
    turns++;
  }
  const final = p0.getState();
  p0.stop();
  p1.stop();
  return { turns, ctx: final.ctx, G: final.G };
}

for (const seed of ['game-1', 'game-2', 'game-3', 'game-4', 'game-5']) {
  test(`整局自动对局（seed=${seed}）能正常分出胜负`, async () => {
    const { turns, ctx, G } = await playFullGame(seed);
    assert.ok(ctx.gameover, `200 回合内未分出胜负（实际 ${turns} 回合）`);
    assert.ok(ctx.gameover.winner === '0' || ctx.gameover.winner === '1');
    const loser = G.players[ctx.gameover.winner === '0' ? '1' : '0'];
    // 终局条件必居其一：LP 归零 或 卡组抽干
    assert.ok(loser.lp <= 0 || loser.deckOut, '败者应满足 LP=0 或卡组抽干');
    // 胜者状态合法
    const winner = G.players[ctx.gameover.winner];
    assert.ok(winner.lp > 0 && !winner.deckOut);
  });
}
