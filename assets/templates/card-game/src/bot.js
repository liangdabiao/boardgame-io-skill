// AI 妖魔主 —— 脚本式机器人。
//
// 为什么不用框架的 RandomBot/MCTSBot：本作 move 参数含手牌下标、
// 场上槽位、祭品自动选择等条件逻辑，写 enumerate 要复刻全部守卫，
// 易错；脚本机器人直接复用与整局自动对局测试相同的决策思路，
// 一次一个动作、由订阅状态驱动，天然不会连点。
//
// 本文件会被纯 Node 测试导入，按 skill 规则用深层 ESM 导入。

import { Client } from 'boardgame.io/dist/esm/client.js';
import { CARDS } from './cards.js';

const tributesNeeded = (level) => (level >= 7 ? 2 : level >= 5 ? 1 : 0);

// 决策：当前状态下一步该做什么（返回 null 表示回合内无事可做，交还回合）
export function decideNextAction({ G, ctx }, playerID) {
  const me = G.players[playerID];
  const foe = G.players[playerID === '0' ? '1' : '0'];
  const hand = (me.hand || [])
    .map((id, idx) => ({ id, idx, card: CARDS[id] }))
    .filter((x) => x.card);

  // ---- 主要阶段 ----
  if (G.step === 'main') {
    // 1) 有益法术（条件幂等：发动后手牌即失，不会重复）
    const foeHasMonster = foe.field.some(Boolean);
    const spell =
      hand.find(
        (x) =>
          x.card.type === 'spell' &&
          ((x.card.effect === 'heal' && me.lp <= 5000) ||
            (x.card.effect === 'jingu' && foeHasMonster) ||
            (x.card.effect === 'elixir' &&
              me.graveyard.some((id) => CARDS[id].type === 'monster') &&
              me.field.includes(null)) ||
            (x.card.effect === 'transform'))
      ) || null;
    if (spell) return { kind: 'spell', handIdx: spell.idx };

    // 2) 召唤最强可召唤神魔（祭品足够 + 有空位 + 未用召唤）
    if (!me.normalSummonUsed && me.field.includes(null)) {
      const onField = me.field.filter(Boolean).length;
      const summonable = hand
        .filter(
          (x) =>
            x.card.type === 'monster' &&
            onField >= tributesNeeded(x.card.level)
        )
        .sort((a, b) => b.card.atk - a.card.atk);
      if (summonable.length > 0) {
        return { kind: 'summon', handIdx: summonable[0].idx, slot: me.field.indexOf(null) };
      }
    }

    // 3) 进斗法或直接结束
    if (ctx.turn > 1) return { kind: 'toBattle' };
    return { kind: 'endTurn' };
  }

  // ---- 斗法阶段 ----
  const ready = me.field
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => entry && !entry.attacked);

  for (const { entry, i } of ready) {
    const targets = foe.field
      .map((e, j) => (e ? { j, atk: CARDS[e.card].atk } : null))
      .filter(Boolean)
      .sort((a, b) => a.atk - b.atk);
    if (targets.length === 0) {
      return { kind: 'attack', attacker: i, target: null }; // 直取元神
    }
    // 打能稳赢或打平换掉的最弱目标；打不过就按兵不动
    const myAtk = CARDS[entry.card].atk;
    const prey = targets.find((t) => myAtk >= t.atk);
    if (prey) return { kind: 'attack', attacker: i, target: prey.j };
  }
  return { kind: 'endTurn' };
}

function applyAction(client, action) {
  switch (action.kind) {
    case 'spell':
      client.moves.activateSpell(action.handIdx);
      break;
    case 'summon':
      client.moves.summonMonster(action.handIdx, action.slot);
      break;
    case 'toBattle':
      client.moves.toBattle();
      break;
    case 'attack':
      client.moves.attack(action.attacker, action.target);
      break;
    case 'endTurn':
      client.moves.endTurn();
      break;
    default:
      break;
  }
}

// 创建一个在自己回合自动行动的 AI 客户端（须与人类客户端共享同一
// multiplayer 实例和 matchID）。返回 client；stop() 时清理定时器。
export function createBotClient({ game, multiplayer, matchID, playerID = '1', delayMs = 800 }) {
  const client = Client({ game, multiplayer, matchID, playerID });
  let timer = null;

  const tick = () => {
    timer = null;
    const state = client.getState();
    if (!state || state.ctx.gameover) return;
    if (state.ctx.currentPlayer !== playerID) return;
    const action = decideNextAction(state, playerID);
    if (action) applyAction(client, action);
    // 动作引发状态更新 -> 订阅再次触发 -> 下一步
  };

  const unsubscribe = client.subscribe(() => {
    const state = client.getState();
    if (!state || state.ctx.gameover) return;
    if (state.ctx.currentPlayer !== playerID) return;
    if (timer !== null) return; // 同一时刻只排一个动作
    timer = setTimeout(tick, delayMs);
  });

  client.start();

  const origStop = client.stop.bind(client);
  client.stop = () => {
    if (timer !== null) clearTimeout(timer);
    unsubscribe();
    origStop();
  };
  return client;
}
