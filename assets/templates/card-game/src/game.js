// 类游戏王卡牌对战 —— 游戏定义（纯逻辑，无 React、无网络依赖）。
//
// 结构说明：boardgame.io 的"阶段(phase)结束会强制结束当前回合"，
// 而游戏王是"一个回合内含 抽牌/主要/战斗 三个子步骤"，因此不用
// flow phases，而用单隐式阶段 + G.step 跟踪子步骤，moves 内做守卫。

import { INVALID_MOVE } from 'boardgame.io/dist/esm/core.js';
import {
  CARDS,
  DECK_LIST,
  FIELD_SLOTS,
  START_LP,
  START_HAND,
} from './cards.js';

const opponentOf = (id) => (id === '0' ? '1' : '0');

function makePlayer() {
  return {
    lp: START_LP,
    hand: [],
    deck: [],
    field: Array(FIELD_SLOTS).fill(null), // 槽位: { card, attacked } | null
    graveyard: [],
    normalSummonUsed: false,
    deckOut: false, // 抽牌时卡组为空 => 判负
  };
}

// 抽 n 张；卡组抽干即置 deckOut（由 endIf 判负）。
function drawCards(G, playerID, n) {
  const p = G.players[playerID];
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      p.deckOut = true;
      return;
    }
    p.hand.push(p.deck.shift());
  }
}

function damage(G, playerID, amount) {
  G.players[playerID].lp = Math.max(0, G.players[playerID].lp - amount);
}

function destroySlot(G, playerID, slotIdx) {
  const p = G.players[playerID];
  if (p.field[slotIdx]) {
    p.graveyard.push(p.field[slotIdx].card);
    p.field[slotIdx] = null;
  }
}

function tributesNeeded(level) {
  if (level >= 7) return 2;
  if (level >= 5) return 1;
  return 0;
}

// 祭品自动选择：优先送走攻击力最低的自己场上怪兽。
function pickTributes(G, playerID, count) {
  const p = G.players[playerID];
  const occupied = p.field
    .map((entry, idx) => ({ idx, entry }))
    .filter((s) => s.entry);
  occupied.sort(
    (a, b) => CARDS[a.entry.card].atk - CARDS[b.entry.card].atk
  );
  return occupied.slice(0, count).map((s) => s.idx);
}

function firstEmptySlot(p) {
  return p.field.findIndex((s) => s === null);
}

export const JourneyWestDuel = {
  name: 'journey-west-duel',

  setup: ({ random }) => {
    const G = { players: { 0: makePlayer(), 1: makePlayer() }, step: 'main' };
    for (const id of ['0', '1']) {
      G.players[id].deck = random.Shuffle([...DECK_LIST]);
      drawCards(G, id, START_HAND);
    }
    return G;
  },

  // 每回合开始（只在服务端运行）：抽 1 张、重置回合内标记。
  turn: {
    onBegin: ({ G, ctx }) => {
      const p = G.players[ctx.currentPlayer];
      G.step = 'main';
      p.normalSummonUsed = false;
      for (const entry of p.field) {
        if (entry) entry.attacked = false;
      }
      drawCards(G, ctx.currentPlayer, 1);
    },
  },

  moves: {
    // ---- 主要阶段 ----

    // 通常召唤（含上级怪兽的祭品召唤；祭品自动选攻击力最低的）。
    summonMonster: ({ G, ctx, playerID }, handIdx, slotIdx) => {
      if (G.step !== 'main' || playerID !== ctx.currentPlayer) {
        return INVALID_MOVE;
      }
      const p = G.players[playerID];
      const cardId = p.hand[handIdx];
      if (cardId === undefined || CARDS[cardId].type !== 'monster') {
        return INVALID_MOVE;
      }
      if (p.normalSummonUsed) return INVALID_MOVE;

      const need = tributesNeeded(CARDS[cardId].level);
      const monstersOnField = p.field.filter(Boolean).length;
      if (monstersOnField < need) return INVALID_MOVE; // 祭品不足

      // 先选祭品（攻击力最低的），允许召唤到被祭品腾出的槽位。
      const tributeSlots = need > 0 ? pickTributes(G, playerID, need) : [];
      const destOk = p.field[slotIdx] === null || tributeSlots.includes(slotIdx);
      if (!destOk) return INVALID_MOVE;

      for (const slot of tributeSlots) {
        destroySlot(G, playerID, slot);
      }
      p.hand.splice(handIdx, 1);
      p.field[slotIdx] = { card: cardId, attacked: false };
      p.normalSummonUsed = true;
    },

    // 发动魔法。死者苏生可传 gyIdx 指定墓地目标（缺省选攻击力最高）。
    // client:false —— 强欲之壶会摸隐藏卡组，禁止客户端乐观执行。
    activateSpell: {
      move: ({ G, ctx, playerID }, handIdx, gyIdx) => {
        if (G.step !== 'main' || playerID !== ctx.currentPlayer) {
          return INVALID_MOVE;
        }
        const p = G.players[playerID];
        const opp = G.players[opponentOf(playerID)];
        const cardId = p.hand[handIdx];
        if (cardId === undefined || CARDS[cardId].type !== 'spell') {
          return INVALID_MOVE;
        }

        const effect = CARDS[cardId].effect;
        if (effect === 'draw2') {
          drawCards(G, playerID, 2);
        } else if (effect === 'jingu') {
          // 紧箍咒：破坏对方场上攻击力最高的一只神魔
          let bestSlot = -1;
          let bestAtk = -1;
          opp.field.forEach((entry, i) => {
            if (entry && CARDS[entry.card].atk > bestAtk) {
              bestAtk = CARDS[entry.card].atk;
              bestSlot = i;
            }
          });
          if (bestSlot === -1) return INVALID_MOVE; // 对方场上没有神魔
          destroySlot(G, opponentOf(playerID), bestSlot);
        } else if (effect === 'heal') {
          p.lp += 1000;
        } else if (effect === 'reborn') {
          const monsters = p.graveyard.filter(
            (id) => CARDS[id].type === 'monster'
          );
          if (monsters.length === 0) return INVALID_MOVE;
          const slot = firstEmptySlot(p);
          if (slot === -1) return INVALID_MOVE;

          let target;
          if (gyIdx !== undefined) {
            const chosen = p.graveyard[gyIdx];
            if (chosen === undefined || CARDS[chosen].type !== 'monster') {
              return INVALID_MOVE;
            }
            target = p.graveyard.splice(gyIdx, 1)[0];
          } else {
            monsters.sort((a, b) => CARDS[b].atk - CARDS[a].atk);
            target = monsters[0];
            p.graveyard.splice(p.graveyard.indexOf(target), 1);
          }
          p.field[slot] = { card: target, attacked: false }; // 特殊召唤，不占通常召唤
        }

        p.hand.splice(handIdx, 1);
      },
      client: false,
    },

    // 进入战斗阶段（先手第一回合不能攻击）。
    toBattle: ({ G, ctx, playerID }) => {
      if (G.step !== 'main' || playerID !== ctx.currentPlayer) {
        return INVALID_MOVE;
      }
      if (ctx.turn === 1) return INVALID_MOVE;
      G.step = 'battle';
    },

    // ---- 战斗阶段 ----
    // targetSlot 为 null 表示直接攻击（对方场上无怪兽时才允许）。
    attack: ({ G, ctx, playerID }, attackerSlot, targetSlot) => {
      if (G.step !== 'battle' || playerID !== ctx.currentPlayer) {
        return INVALID_MOVE;
      }
      const p = G.players[playerID];
      const opp = G.players[opponentOf(playerID)];
      const attacker = p.field[attackerSlot];
      if (!attacker || attacker.attacked) return INVALID_MOVE;

      const atk = CARDS[attacker.card].atk;
      const oppHasMonster = opp.field.some(Boolean);

      if (targetSlot === null || targetSlot === undefined) {
        if (oppHasMonster) return INVALID_MOVE; // 有怪兽时不能直接攻击
        damage(G, opponentOf(playerID), atk);
        attacker.attacked = true;
        return;
      }

      const defender = opp.field[targetSlot];
      if (!defender) return INVALID_MOVE;
      const defAtk = CARDS[defender.card].atk;

      attacker.attacked = true;
      if (atk > defAtk) {
        destroySlot(G, opponentOf(playerID), targetSlot);
        damage(G, opponentOf(playerID), atk - defAtk);
      } else if (atk < defAtk) {
        destroySlot(G, playerID, attackerSlot);
        damage(G, playerID, defAtk - atk);
      } else {
        destroySlot(G, opponentOf(playerID), targetSlot);
        destroySlot(G, playerID, attackerSlot);
      }
    },

    endTurn: ({ G, ctx, playerID, events }) => {
      if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
      events.endTurn();
    },
  },

  // 胜负判定：LP 归零或卡组抽干者输（每步操作后框架都会检查）。
  endIf: ({ G }) => {
    const p0 = G.players[0];
    const p1 = G.players[1];
    const loses = (p) => p.lp <= 0 || p.deckOut;
    if (loses(p1)) return { winner: '0' };
    if (loses(p0)) return { winner: '1' };
  },

  // 秘密状态：双方手牌互相隐藏（对方手牌显示为牌背），卡组内容全部隐藏。
  playerView: ({ G, playerID }) => {
    const hide = (arr) => arr.map(() => null);
    const players = {};
    for (const id of ['0', '1']) {
      const p = G.players[id];
      players[id] = {
        ...p,
        hand: id === playerID ? p.hand : hide(p.hand),
        deck: hide(p.deck),
      };
    }
    return { ...G, players };
  },
};

export default JourneyWestDuel;
