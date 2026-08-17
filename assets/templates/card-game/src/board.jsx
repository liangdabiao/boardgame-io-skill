// 棋盘 UI —— 只负责展示与转发操作，规则全部在 game.js 中。
//
// 交互模型（一键操作 + 即时反馈）：
// - 主要阶段：点手牌怪兽 = 立即召唤到第一个空位；点魔法卡 = 立即发动
//   （死者苏生有多个目标时弹出选择器）。
// - 战斗阶段：点自己未攻击的怪兽选中 -> 点对方怪兽攻击；再点自己
//   选中怪兽可取消。对方空场时出现"直接攻击"按钮。
// - 所有非法操作都会在状态行显示原因，绝不静默。

import { useState } from 'react';
import { CARDS } from './cards.js';

const opp = (id) => (id === '0' ? '1' : '0');
const tributesNeeded = (level) => (level >= 7 ? 2 : level >= 5 ? 1 : 0);

function CardFace({ cardId, faceDown, onClick, cls = '', small }) {
  if (faceDown) {
    return <div className={`card back ${cls} ${small ? 'small' : ''}`} onClick={onClick} />;
  }
  if (!cardId) {
    return <div className={`card empty ${cls} ${small ? 'small' : ''}`} onClick={onClick} />;
  }
  const card = CARDS[cardId];
  return (
    <div className={`card ${card.type} ${cls} ${small ? 'small' : ''}`} onClick={onClick}>
      {card.img && <img className="card-art" src={card.img} alt={card.name} draggable={false} />}
      <div className="card-name">{card.name}</div>
      {card.type === 'monster' ? (
        <div className="card-stats">
          <span className="lv">{'★'.repeat(Math.min(card.level, 8))}</span>
          <span className="atk">{card.atk}</span>
        </div>
      ) : (
        <div className="card-desc">{card.desc}</div>
      )}
    </div>
  );
}

export const Board = (props) => {
  const { G, ctx, moves, playerID, isActive } = props;
  const [selAtk, setSelAtk] = useState(null); // 选中的攻击者槽位
  const [msg, setMsg] = useState(''); // 操作反馈（含非法原因）

  const me = G.players[playerID];
  const foe = G.players[opp(playerID)];
  const myTurn = isActive && !ctx.gameover;
  const mainPhase = G.step === 'main';
  const say = (text) => setMsg(text);

  const gyMonsters = me.graveyard
    .map((id, idx) => ({ id, idx }))
    .filter((x) => CARDS[x.id].type === 'monster');

  // ---- 手牌可操作性判断（与 game.js 守卫对应，用于反馈） ----
  const summonBlocker = (card) => {
    if (!myTurn || !mainPhase) return '现在不是你的主要阶段';
    if (me.normalSummonUsed) return '本回合通常召唤已用完';
    if (!me.field.includes(null)) return '场上没有空位了';
    const need = tributesNeeded(card.level);
    if (me.field.filter(Boolean).length < need) {
      return `${card.level}★ 需要献祭 ${need} 只场上怪兽作祭品`;
    }
    return null; // 可召唤
  };

  // ---- 点击手牌：一键召唤 / 一键发动 ----
  const onHandCard = (i) => {
    const card = CARDS[me.hand[i]];
    if (!card) return;

    if (card.type === 'monster') {
      const blocker = summonBlocker(card);
      if (blocker) return say(`❌ ${card.name}：${blocker}`);
      const slot = me.field.indexOf(null);
      moves.summonMonster(i, slot);
      const need = tributesNeeded(card.level);
      say(
        need > 0
          ? `⬆ 祭品召唤 ${card.name}（自动献祭了攻击力最低的 ${need} 只怪兽）`
          : `⬆ 召唤 ${card.name}`
      );
      return;
    }

    // 魔法
    if (!myTurn || !mainPhase) return say(`❌ ${card.name}：现在不是你的主要阶段`);
    if (card.effect === 'reborn') {
      if (gyMonsters.length === 0) return say(`❌ ${card.name}：墓地里没有可苏生的怪兽`);
      if (!me.field.includes(null)) return say(`❌ ${card.name}：场上没有空位`);
      if (gyMonsters.length > 1) {
        return say(`🧲 ${card.name}：请从下方选择要苏生的怪兽`);
      }
    }
    moves.activateSpell(i);
    say(`✨ 发动魔法 ${card.name}`);
  };

  // ---- 点击自己场上怪兽：战斗阶段选攻击者 / 取消 ----
  const onMyMonster = (slotIdx) => {
    const entry = me.field[slotIdx];
    if (!entry) return;
    if (!myTurn || !mainPhase) {
      if (entry.attacked) return say('✅ 这只怪兽本回合已攻击过');
      if (selAtk === slotIdx) {
        setSelAtk(null);
        return say('已取消选择攻击手');
      }
      setSelAtk(slotIdx);
      return say(
        foe.field.some(Boolean)
          ? `🗡 ${CARDS[entry.card].name} 准备攻击：点击对方要攻击的怪兽`
          : `🗡 ${CARDS[entry.card].name} 准备攻击：点击「直接攻击」按钮`
      );
    }
    // 主要阶段点自己怪兽：仅提示信息
    say(`ℹ ${CARDS[entry.card].name}（ATK ${CARDS[entry.card].atk}）`);
  };

  // ---- 点击对方场上怪兽：作为攻击目标 ----
  const onFoeMonster = (slotIdx) => {
    const entry = foe.field[slotIdx];
    if (!entry) return;
    if (!myTurn || !mainPhase) {
      if (selAtk === null) return say('❗ 请先点击自己场上未攻击的怪兽选择攻击手');
      moves.attack(selAtk, slotIdx);
      setSelAtk(null);
      return;
    }
    say(`ℹ 对方的 ${CARDS[entry.card].name}（ATK ${CARDS[entry.card].atk}）`);
  };

  const toBattle = () => {
    if (ctx.turn === 1) return say('❌ 先手第一回合不能进入战斗阶段');
    moves.toBattle();
    say('⚔ 进入战斗阶段');
  };

  const endTurn = () => {
    moves.endTurn();
    setSelAtk(null);
  };

  const directAttack = () => {
    if (selAtk === null) return;
    moves.attack(selAtk, null);
    setSelAtk(null);
  };

  const defaultHint = ctx.gameover
    ? '决斗结束！点击顶部「重新开局」再战一局'
    : myTurn
      ? mainPhase
        ? '主要阶段：点手牌即召唤/发动魔法；祭品召唤自动选择攻击力最低的祭品'
        : '战斗阶段：点自己怪兽 → 点对方怪兽攻击（再点自己怪兽可取消）'
      : '等待对方行动…';

  const foeHlSlots =
    myTurn && !mainPhase && selAtk !== null
      ? foe.field.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
      : [];

  return (
    <div className={`board ${myTurn ? 'active' : ''}`} data-player={playerID}>
      {ctx.gameover && (
        <div className="gameover">
          {ctx.gameover.winner === playerID ? '🏆 决斗胜利！' : '💀 决斗失败…'}
        </div>
      )}

      <header className="board-head">
        <span className="player-tag">
          玩家 {playerID} {myTurn ? '· 轮到你了' : ''}
        </span>
        <span className="step">
          第 {ctx.turn} 回合 · {mainPhase ? '主要阶段' : '战斗阶段'}
        </span>
      </header>

      {/* ---- 对方区域 ---- */}
      <section className="foe-zone">
        <div className="lp-bar foe">
          <span>对方 LP</span>
          <div className="lp-track">
            <div className="lp-fill" style={{ width: `${Math.max(0, (foe.lp / 8000) * 100)}%` }} />
          </div>
          <b>{foe.lp}</b>
        </div>
        <div className="zone-label">对方手牌 ×{foe.hand.length}</div>
        <div className="hand foe-hand">
          {foe.hand.map((_, i) => (
            <CardFace key={i} cardId={null} faceDown small />
          ))}
        </div>
        <div className="zone-label">对方场上</div>
        <div className="field">
          {foe.field.map((entry, i) => (
            <CardFace
              key={i}
              cardId={entry ? entry.card : null}
              cls={foeHlSlots.includes(i) ? 'hl' : ''}
              onClick={() => onFoeMonster(i)}
            />
          ))}
        </div>
      </section>

      <div className="divider">⚔️ 战场 ⚔️</div>

      {/* ---- 自己区域 ---- */}
      <section className="my-zone">
        <div className="zone-label mine">我的场上</div>
        <div className="field">
          {me.field.map((entry, i) => (
            <CardFace
              key={i}
              cardId={entry ? entry.card : null}
              cls={[
                selAtk === i ? 'sel' : '',
                entry && entry.attacked ? 'done' : '',
                myTurn && !mainPhase && entry && !entry.attacked ? 'hl' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onMyMonster(i)}
            />
          ))}
        </div>
        <div className="zone-label mine">我的手牌（点击即用）</div>
        <div className="hand">
          {me.hand.map((cardId, i) => {
            const card = CARDS[cardId];
            // 魔法不占通常召唤，只要轮到自己且在主要阶段即可用
            const usable =
              card && myTurn && mainPhase &&
              (card.type === 'spell' || !summonBlocker(card));
            return (
              <CardFace
                key={i}
                cardId={cardId}
                cls={usable ? 'usable' : ''}
                onClick={() => onHandCard(i)}
              />
            );
          })}
        </div>
        <div className="lp-bar mine">
          <span>我方 LP</span>
          <div className="lp-track">
            <div className="lp-fill" style={{ width: `${Math.max(0, (me.lp / 8000) * 100)}%` }} />
          </div>
          <b>{me.lp}</b>
        </div>
      </section>

      {/* ---- 操作区 ---- */}
      <footer className="controls">
        {myTurn && mainPhase && (
          <>
            <button onClick={toBattle} disabled={ctx.turn === 1}>
              进入战斗阶段
            </button>
            <button onClick={endTurn}>结束回合</button>
          </>
        )}
        {myTurn && !mainPhase && (
          <>
            {selAtk !== null && !foe.field.some(Boolean) && (
              <button className="danger" onClick={directAttack}>
                直接攻击！
              </button>
            )}
            <button onClick={endTurn}>结束回合</button>
          </>
        )}

        {/* 死者苏生目标选择器 */}
        {myTurn && mainPhase && selAtk === null && gyMonsters.length > 1 && msg.startsWith('🧲') && (
          <div className="gy-picker">
            苏生目标：
            {gyMonsters.map(({ id, idx }) => (
              <button
                key={idx}
                onClick={() => {
                  const handIdx = me.hand.findIndex((c) => c === 'reborn');
                  if (handIdx >= 0) {
                    moves.activateSpell(handIdx, idx);
                    say(`🧲 苏生了 ${CARDS[id].name}`);
                  }
                }}
              >
                {CARDS[id].name} ({CARDS[id].atk})
              </button>
            ))}
          </div>
        )}

        <div className="status" role="status">
          {msg || defaultHint}
        </div>
        <span className="gy-count">
          墓地 {me.graveyard.length} · 卡组 {me.deck.length}
        </span>
      </footer>
    </div>
  );
};

export default Board;
