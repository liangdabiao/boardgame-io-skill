// 棋盘 UI —— 展示 + 转发操作 + 游戏反馈层。
//
// 反馈设计（无弹出窗口，不打断操作）：
// 1. 战报日志：人类可读的完整叙事（含祭品、法术分类、攻防结果），
//    便于回看对方/自己上一手发生了什么。
// 2. 场面动效：召唤弹入、攻击突进、受击抖动、伤害飘字、震屏。
// 3. 音效：与事件同步（锣/斩/受击/琶音/号角）。
//
// FX 引擎：useRef 快照差分 —— AI 的每个动作都走同一条状态更新路径，
// 演出/日志/动效/音效自动覆盖双方所有行动。

import { useState, useEffect, useRef, useCallback } from 'react';
import { CARDS } from './cards.js';
import { sfx, ensureUnlocked } from './sfx.js';

const opp = (id) => (id === '0' ? '1' : '0');
const tributesNeeded = (level) => (level >= 7 ? 2 : level >= 5 ? 1 : 0);
const name = (id) => (id ? CARDS[id].name : '?');
const atk = (id) => (id ? CARDS[id].atk : 0);
const sideName = (s) => (s === 'mine' ? '你' : '妖魔主');

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


// 演出大卡（召唤展示/攻击对决画面用）
function StageCard({ cardId }) {
  const card = CARDS[cardId];
  if (!card) return null;
  return (
    <div className={`stage-card ${card.type}`}>
      {card.img && <img src={card.img} alt={card.name} draggable={false} />}
      <div className="stage-card-name">{card.name}</div>
      <div className="stage-card-stats">
        {card.type === 'monster' ? `攻 ${card.atk}` : card.desc}
      </div>
    </div>
  );
}

export const Board = (props) => {
  const { G, ctx, moves, playerID, isActive } = props;
  const [selAtk, setSelAtk] = useState(null);
  const [msg, setMsg] = useState('');
  const [fx, setFx] = useState({});
  const [floats, setFloats] = useState([]);
  const [logLines, setLogLines] = useState([]); // 战报（最新在前）
  const [stage, setStage] = useState(null);     // 攻击对决演出
  const [ghosts, setGhosts] = useState([]);     // 被破坏卡的消散残影

  const me = G.players[playerID];
  const foe = G.players[opp(playerID)];
  const myTurn = isActive && !ctx.gameover;
  const mainPhase = G.step === 'main';
  const say = (text) => setMsg(text);

  const timers = useRef([]);

  // ---- 基础演出工具 ----
  const later = useCallback((fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const addFx = useCallback((key, anim, ms = 700) => {
    setFx((f) => ({ ...f, [key]: anim }));
    later(() => setFx((f) => {
      const { [key]: _, ...rest } = f;
      return rest;
    }), ms);
  }, [later]);

  const addFloat = useCallback((side, text) => {
    const id = Math.random().toString(36).slice(2);
    setFloats((fs) => [...fs, { id, side, text }]);
    later(() => setFloats((fs) => fs.filter((x) => x.id !== id)), 1100);
  }, [later]);

  // 残影：被破坏的卡在原槽位保留 0.65s 播放消散动画，再让位给空槽。
  // 否则状态一更新牌就消失，动画会播在不可见的空占位上（等于没有效果）。
  const addGhost = useCallback((side, slot, card) => {
    const id = Math.random().toString(36).slice(2);
    setGhosts((gs) => [...gs, { id, side, slot, card }]);
    later(() => setGhosts((gs) => gs.filter((g) => g.id !== id)), 650);
  }, [later]);

  const addLogs = useCallback((lines) => {
    if (!lines.length) return;
    setLogLines((ls) => [
      ...lines.map((text, i) => ({ id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, text })),
      ...ls,
    ].slice(0, 40));
  }, []);

  // ---- 攻击对决演出：最新事件直接替换当前画面（不排队、不叠加） ----
  // 仅用于攻击事件（双方），召唤/法术不弹窗——由战报与道场动效呈现。
  const playStage = useCallback((item) => {
    const it = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
    setStage(it);
    const dur = it.kind === 'battle' ? 1400 : it.kind === 'text' ? 1400 : 1100;
    later(() => setStage((s) => (s === it ? null : s)), dur);
  }, [later]);

  // ---------------- FX 差分引擎（演出 + 日志 + 动效 + 音效） ----------------
  const prev = useRef(null);
  useEffect(() => {
    const F = (arr) => arr.map((e) => (e ? e.card : null));
    const A = (arr) => arr.map((e) => (e ? e.attacked : false));
    const snap = {
      myField: F(me.field), foeField: F(foe.field),
      myAttacked: A(me.field), foeAttacked: A(foe.field),
      myLp: me.lp, foeLp: foe.lp,
      myHand: me.hand.length, foeHand: foe.hand.length,
      myGy: me.graveyard.length, foeGy: foe.graveyard.length,
      mine: myTurn, turn: ctx.turn, gameover: !!ctx.gameover,
    };
    const p = prev.current;
    prev.current = snap;
    if (!p) return;
    const logs = [];    // 战报
    let summoned = false, destroyed = false, attackedFlip = false;

    const diffSide = (side) => {
      const fKey = side === 'mine' ? 'myField' : 'foeField';
      const appeared = [], vanishedIdx = [];
      snap[fKey].forEach((card, i) => {
        if (card && !p[fKey][i]) { appeared.push({ i, card }); }
        if (!card && p[fKey][i]) { vanishedIdx.push({ i, card: p[fKey][i] }); }
      });
      return { appeared, vanished: vanishedIdx };
    };
    const my = diffSide('mine');
    const foeD = diffSide('foe');
    const handD = (side) => (side === 'mine' ? snap.myHand - p.myHand : snap.foeHand - p.foeHand);
    const gyD = (side) => (side === 'mine' ? snap.myGy - p.myGy : snap.foeGy - p.foeGy);
    const lpD = (side) => (side === 'mine' ? snap.myLp - p.myLp : snap.foeLp - p.foeLp);

    // 场面动效（召唤/消散）
    my.appeared.forEach(({ i }) => addFx(`my-${i}`, 'fx-summon'));
    my.vanished.forEach(({ i, card }) => addGhost('mine', i, card));
    foeD.appeared.forEach(({ i }) => addFx(`foe-${i}`, 'fx-summon'));
    foeD.vanished.forEach(({ i, card }) => addGhost('foe', i, card));
    summoned = my.appeared.length + foeD.appeared.length > 0;
    destroyed = my.vanished.length + foeD.vanished.length > 0;

    // 攻击标记翻转 -> 突进动效
    let atkFrom = null; // { side, slot, card }
    snap.myAttacked.forEach((a, i) => {
      if (a && !p.myAttacked[i]) { addFx(`my-${i}`, 'fx-lunge-up', 500); atkFrom = { side: 'mine', slot: i, card: p.myField[i] }; attackedFlip = true; }
    });
    snap.foeAttacked.forEach((a, i) => {
      if (a && !p.foeAttacked[i]) { addFx(`foe-${i}`, 'fx-lunge-down', 500); atkFrom = { side: 'foe', slot: i, card: p.foeField[i] }; attackedFlip = true; }
    });

    // 兜底：攻击者死亡的战斗（同归于尽/被反制）——attacked 标记随卡消失，
    // 标记差分检测不到；用 log 的最后一次 move（attack）补识别。
    if (!attackedFlip) {
      const lastMove = props.log?.[props.log.length - 1]?.action?.payload;
      if (
        lastMove?.type === 'attack' &&
        (my.vanished.length > 0 || foeD.vanished.length > 0)
      ) {
        const side = lastMove.playerID === playerID ? 'mine' : 'foe';
        const slot = lastMove.args?.[0];
        const prevField = side === 'mine' ? p.myField : p.foeField;
        if (prevField[slot]) {
          atkFrom = { side, slot, card: prevField[slot] };
          attackedFlip = true;
        }
      }
    }

    // ---- 事件叙事 ----
    if (attackedFlip && atkFrom) {
      const atkSide = atkFrom.side;
      const defSide = atkSide === 'mine' ? 'foe' : 'mine';
      const defLost = (defSide === 'mine' ? my : foeD).vanished;
      const atkLost = (atkSide === 'mine' ? my : foeD).vanished;
      const dmgToDef = -Math.min(0, lpD(defSide));
      const dmgToAtk = -Math.min(0, lpD(atkSide));
      const who = sideName(atkSide);

      // 每次攻击 = 一个融合画面：对决卡 + 结果/伤害直接标在卡上。
      // 不做分离的延迟伤害弹窗（会与后续行动错时序、旧画面盖新画面）。
      if (defLost.length === 0 && dmgToDef > 0 && atkLost.length === 0) {
        // 直接攻击无怪兽对决：文字弹框告知
        playStage({ kind: 'text',
          text: `${who}的 ${name(atkFrom.card)} 直取元神，${sideName(defSide)}受到 ${dmgToDef} 点伤害！` });
        logs.push(`${who} 的 ${name(atkFrom.card)}（攻${atk(atkFrom.card)}）直取元神，${sideName(defSide)}受到 ${dmgToDef} 点伤害`);
      } else if (defLost.length > 0 && atkLost.length > 0) {
        playStage({ kind: 'battle', attacker: atkFrom.card, target: defLost[0].card,
          caption: '势均力敌，同归于尽！', outcomeAtk: '毁', outcomeDef: '毁' });
        logs.push(`${who} 的 ${name(atkFrom.card)} 与 ${name(defLost[0].card)} 同归于尽`);
      } else if (defLost.length > 0) {
        playStage({ kind: 'battle', attacker: atkFrom.card, target: defLost[0].card,
          caption: `${name(atkFrom.card)} 击破 ${name(defLost[0].card)}！`,
          dmg: dmgToDef > 0 ? dmgToDef : 0, onTarget: true, outcomeDef: '毁' });
        logs.push(`${who} 的 ${name(atkFrom.card)}（攻${atk(atkFrom.card)}）击破了${sideName(defSide)}的 ${name(defLost[0].card)}（攻${atk(defLost[0].card)}）${dmgToDef > 0 ? `，造成 ${dmgToDef} 点穿透伤害` : ''}`);
      } else if (atkLost.length > 0) {
        playStage({ kind: 'battle', attacker: atkFrom.card, target: null,
          caption: `${name(atkFrom.card)} 攻势被反制！`, dmg: dmgToAtk, onTarget: false, outcomeAtk: '毁' });
        logs.push(`${who} 的 ${name(atkFrom.card)}（攻${atk(atkFrom.card)}）攻势被反制破坏，${who}受到 ${dmgToAtk} 点伤害`);
      }
    } else {
      // ---- 非攻击事件：召唤 / 法术（按侧归因） ----
      // AI 的召唤/法术在中央弹窗演出（玩家不看战报也能知道发生了什么）；
      // 玩家自己的操作不弹窗（道场即反馈）。
      for (const side of ['mine', 'foe']) {
        const d = side === 'mine' ? my : foeD;
        const hd = handD(side);
        const show = side === 'foe'; // 仅 AI 行动弹窗
        if (d.appeared.length > 0 && hd === -1) {
          const c = d.appeared[0].card;
          const tributes = d.vanished.filter(() => true); // 同侧消失 = 祭品
          if (tributes.length > 0) {
            if (show) playStage({ kind: 'card', cardId: c,
              caption: `妖魔主 献祭召唤！` });
            logs.push(`${sideName(side)} 献祭了 ${tributes.map((t) => name(t.card)).join('、')}，上级召唤了 ${name(c)}（攻${atk(c)}）`);
          } else {
            if (show) playStage({ kind: 'card', cardId: c,
              caption: `妖魔主 召唤` });
            logs.push(`${sideName(side)} 召唤了 ${name(c)}（攻${atk(c)}）`);
          }
        } else if (d.appeared.length > 0 && gyD(side) < 0) {
          // 还魂丹
          const c = d.appeared[0].card;
          if (show) playStage({ kind: 'card', cardId: 'elixir',
            caption: `妖魔主 发动还魂丹！` });
          logs.push(`${sideName(side)} 发动还魂丹，还魂了 ${name(c)}（攻${atk(c)}）`);
        } else if (hd === -1 && d.appeared.length === 0) {
          // 纯法术：按效果分类
          if (lpD(side) > 0) {
            if (show) playStage({ kind: 'text',
              text: `妖魔主服下人参果，回复 ${lpD(side)} 点法力` });
            logs.push(`${sideName(side)} 发动人参果，回复 ${lpD(side)} 点法力`);
          } else {
            const oppSide = side === 'mine' ? 'foe' : 'mine';
            const oppLost = (oppSide === 'mine' ? my : foeD).vanished;
            if (oppLost.length > 0) {
              if (show) playStage({ kind: 'card', cardId: 'jingu',
                caption: `妖魔主 念动紧箍咒！` });
              logs.push(`${sideName(side)} 发动紧箍咒，破坏了${sideName(oppSide)}的 ${oppLost.map((v) => `${name(v.card)}（攻${atk(v.card)}）`).join('、')}`);
            } else if (hd === -1 && (side === 'mine' ? snap.myHand : snap.foeHand) === ((side === 'mine' ? p.myHand : p.foeHand) + 1)) {
              if (show) playStage({ kind: 'text',
                text: `妖魔主发动七十二变，抽了 2 张牌` });
              logs.push(`${sideName(side)} 发动七十二变，抽了 2 张牌`);
            } else {
              logs.push(`${sideName(side)} 发动了一张法术`);
            }
          }
        }
        // 抽牌（回合开始）
        if (snap.turn !== p.turn && hd > 0) {
          logs.push(`—— 第 ${snap.turn} 回合：${sideName(side)}摸了 ${hd} 张牌`);
        }
      }
    }

    // 飘字 + 震屏
    if (lpD('foe') < 0) {
      addFloat('foe', `${lpD('foe')}`);
      if (-lpD('foe') >= 1500) addFx('board', 'fx-quake', 350);
    }
    if (lpD('mine') < 0) {
      addFloat('mine', `${lpD('mine')}`);
      if (-lpD('mine') >= 1000) addFx('board', 'fx-quake', 350);
    }

    // 音效编排
    if (attackedFlip) sfx.attack();
    if (lpD('foe') < 0 || lpD('mine') < 0) sfx.hit();
    if (destroyed && !summoned) sfx.destroy();
    if (summoned) sfx.summon();
    else if (handD('mine') === -1 && my.appeared.length === 0) sfx.spell();
    else if (handD('foe') === -1 && foeD.appeared.length === 0) sfx.spell();
    if (handD('mine') > 0 || handD('foe') > 0) sfx.draw();
    if (snap.mine && !p.mine && !snap.gameover) sfx.turn();
    if (snap.gameover && !p.gameover) {
      if (ctx.gameover.winner === playerID) sfx.win(); else sfx.lose();
    }

    addLogs(logs);
  }, [G, ctx, me, foe, myTurn, playerID, addFx, addFloat, addLogs, playStage, addGhost]);

  const gyMonsters = me.graveyard
    .map((id, idx) => ({ id, idx }))
    .filter((x) => CARDS[x.id].type === 'monster');

  // ---- 手牌可操作性判断 ----
  const summonBlocker = (card) => {
    if (!myTurn || !mainPhase) return '现在不是你的主要阶段';
    if (me.normalSummonUsed) return '本回合通常召唤已用完';
    if (!me.field.includes(null)) return '场上没有空位了';
    const need = tributesNeeded(card.level);
    if (me.field.filter(Boolean).length < need) {
      return `${card.level}★ 神魔需要献祭 ${need} 只场上神魔作祭品`;
    }
    return null;
  };

  const onHandCard = (i) => {
    ensureUnlocked();
    const card = CARDS[me.hand[i]];
    if (!card) return;

    if (card.type === 'monster') {
      const blocker = summonBlocker(card);
      if (blocker) { sfx.click(); return say(`❌ ${card.name}：${blocker}`); }
      const slot = me.field.indexOf(null);
      moves.summonMonster(i, slot);
      const need = tributesNeeded(card.level);
      say(need > 0
        ? `⬆ 祭品召唤 ${card.name}（自动献祭了攻击力最低的 ${need} 只神魔）`
        : `⬆ 召唤 ${card.name}`);
      return;
    }

    if (!myTurn || !mainPhase) { sfx.click(); return say(`❌ ${card.name}：现在不是你的主要阶段`); }
    if (card.effect === 'reborn') {
      if (gyMonsters.length === 0) { sfx.click(); return say(`❌ ${card.name}：墓地里没有可还魂的神魔`); }
      if (!me.field.includes(null)) { sfx.click(); return say(`❌ ${card.name}：场上没有空位`); }
      if (gyMonsters.length > 1) return say(`🧲 ${card.name}：请从下方选择要还魂的神魔`);
    }
    if (card.effect === 'jingu' && !foe.field.some(Boolean)) {
      sfx.click(); return say(`❌ ${card.name}：对方场上没有神魔，无处施咒`);
    }
    moves.activateSpell(i);
    say(`✨ 发动法术 ${card.name}`);
  };

  const onMyMonster = (slotIdx) => {
    ensureUnlocked();
    const entry = me.field[slotIdx];
    if (!entry) return;
    if (!myTurn || !mainPhase) {
      if (entry.attacked) return say('✅ 这只神魔本回合已攻击过');
      if (selAtk === slotIdx) {
        setSelAtk(null);
        return say('已取消选择攻击手');
      }
      sfx.click();
      setSelAtk(slotIdx);
      return say(
        foe.field.some(Boolean)
          ? `🗡 ${CARDS[entry.card].name} 蓄势待发：点击对方要攻击的神魔`
          : `🗡 ${CARDS[entry.card].name} 蓄势待发：点击「直取元神」按钮`
      );
    }
    say(`ℹ ${CARDS[entry.card].name}（攻 ${CARDS[entry.card].atk}）`);
  };

  const onFoeMonster = (slotIdx) => {
    const entry = foe.field[slotIdx];
    if (!entry) return;
    if (!myTurn || !mainPhase) {
      if (selAtk === null) return say('❗ 请先点击自己场上未攻击的神魔选择攻击手');
      moves.attack(selAtk, slotIdx);
      setSelAtk(null);
      return;
    }
    say(`ℹ 对方的 ${CARDS[entry.card].name}（攻 ${CARDS[entry.card].atk}）`);
  };

  const toBattle = () => {
    if (ctx.turn === 1) return say('❌ 先手第一回合不能进入斗法阶段');
    moves.toBattle();
    sfx.click();
    say('⚔ 进入斗法阶段');
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
    ? '斗法结束！点击顶部「重新开局」再战一局'
    : myTurn
      ? mainPhase
        ? '主要阶段：点手牌即召唤神魔/发动法术；祭品召唤自动选择攻击力最低的祭品'
        : '斗法阶段：点自己神魔 → 点对方神魔攻击（再点自己神魔可取消）'
      : '妖魔主正在行动…';

  const foeHlSlots =
    myTurn && !mainPhase && selAtk !== null
      ? foe.field.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
      : [];

  const floatsFor = (side) => floats.filter((f) => f.side === side);

  return (
    <div
      className={`board ${myTurn ? 'active' : ''} ${fx.board || ''}`}
      data-player={playerID}
      onClickCapture={ensureUnlocked}
    >
      {/* ---- 中央演出（AI 行动/双方攻击；固定视口正中，最新事件替换） ---- */}
      {stage && (
        <>
          <div className="stage-backdrop" />
          <div className={`stage kind-${stage.kind}`} key={stage.id}>
            {stage.kind === 'text' && (
              <div className="stage-text">{stage.text}</div>
            )}
            {stage.kind === 'card' && (
              <>
                <div className="stage-caption">{stage.caption}</div>
                <StageCard cardId={stage.cardId} />
              </>
            )}
            {stage.kind === 'battle' && (
              <>
                <div className="stage-caption">{stage.caption}</div>
                <div className="stage-battle">
                  <div className="stage-card-wrap">
                    <StageCard cardId={stage.attacker} />
                    {stage.outcomeAtk === '毁' && <span className="stage-badge lost">毁</span>}
                    {stage.dmg > 0 && !stage.onTarget && <span className="stage-badge dmg">-{stage.dmg}</span>}
                  </div>
                  <span className="stage-vs">⚔</span>
                  <div className="stage-card-wrap">
                    {stage.target
                      ? <StageCard cardId={stage.target} />
                      : <span className="stage-target-none">元神</span>}
                    {stage.outcomeDef === '毁' && <span className="stage-badge lost">毁</span>}
                    {stage.dmg > 0 && stage.onTarget && <span className="stage-badge dmg">-{stage.dmg}</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {ctx.gameover && (
        <div className={`gameover ${ctx.gameover.winner === playerID ? 'fx-win' : 'fx-lose'}`}>
          {ctx.gameover.winner === playerID ? '🏆 斗法胜利！' : '💀 斗法落败…'}
        </div>
      )}

      <header className="board-head">
        <span className={`player-tag ${myTurn ? 'fx-turn-pulse' : ''}`}>
          {playerID === '0' ? '取经人' : '妖魔主'}（玩家 {playerID}）{myTurn ? ' · 轮到你了' : ''}
        </span>
        <span className="step">
          第 {ctx.turn} 回合 · {mainPhase ? '主要阶段' : '斗法阶段'}
        </span>
      </header>

      {/* ---- 对方区域 ---- */}
      <section className="foe-zone">
        <div className="lp-bar foe">
          <span>对方法力</span>
          <div className="lp-track">
            <div className="lp-fill" style={{ width: `${Math.max(0, (foe.lp / 8000) * 100)}%` }} />
            {floatsFor('foe').map((f) => (
              <span key={f.id} className="dmg-float">{f.text}</span>
            ))}
          </div>
          <b>{foe.lp}</b>
        </div>
        <div className="zone-label">对方手牌 ×{foe.hand.length}</div>
        <div className="hand foe-hand">
          {foe.hand.map((_, i) => (
            <CardFace key={i} cardId={null} faceDown small />
          ))}
        </div>
        <div className="zone-label">对方道场</div>
        <div className="field">
          {foe.field.map((entry, i) => {
            const ghost = ghosts.find((g) => g.side === 'foe' && g.slot === i);
            return (
              <CardFace
                key={i}
                cardId={ghost ? ghost.card : entry ? entry.card : null}
                cls={[
                  !ghost && foeHlSlots.includes(i) ? 'hl' : '',
                  ghost ? 'fx-destroy' : fx[`foe-${i}`] || '',
                ].filter(Boolean).join(' ')}
                onClick={() => onFoeMonster(i)}
              />
            );
          })}
        </div>
      </section>

      <div className="divider">☯ 斗法场 ☯</div>

      {/* ---- 自己区域 ---- */}
      <section className="my-zone">
        <div className="zone-label mine">我的道场</div>
        <div className="field">
          {me.field.map((entry, i) => {
            const ghost = ghosts.find((g) => g.side === 'mine' && g.slot === i);
            return (
              <CardFace
                key={i}
                cardId={ghost ? ghost.card : entry ? entry.card : null}
                cls={[
                  !ghost && selAtk === i ? 'sel' : '',
                  !ghost && entry && entry.attacked ? 'done' : '',
                  !ghost && myTurn && !mainPhase && entry && !entry.attacked ? 'hl' : '',
                  ghost ? 'fx-destroy' : fx[`my-${i}`] || '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onMyMonster(i)}
              />
            );
          })}
        </div>
        <div className="zone-label mine">我的手牌（点击即用）</div>
        <div className="hand">
          {me.hand.map((cardId, i) => {
            const card = CARDS[cardId];
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
          <span>我方法力</span>
          <div className="lp-track">
            <div className="lp-fill" style={{ width: `${Math.max(0, (me.lp / 8000) * 100)}%` }} />
            {floatsFor('mine').map((f) => (
              <span key={f.id} className="dmg-float">{f.text}</span>
            ))}
          </div>
          <b>{me.lp}</b>
        </div>
      </section>

      {/* ---- 战报 ---- */}
      <div className="battle-log" aria-live="polite">
        <div className="battle-log-title">📜 战报</div>
        <div className="battle-log-body">
          {logLines.length === 0 && <div className="log-line dim">对局开始，斗法一触即发…</div>}
          {logLines.map((l, i) => (
            <div key={l.id} className={`log-line ${i === 0 ? 'latest' : ''}`}>{l.text}</div>
          ))}
        </div>
      </div>

      {/* ---- 操作区 ---- */}
      <footer className="controls">
        {myTurn && mainPhase && (
          <>
            <button onClick={toBattle} disabled={ctx.turn === 1}>
              进入斗法阶段
            </button>
            <button onClick={endTurn}>结束回合</button>
          </>
        )}
        {myTurn && !mainPhase && (
          <>
            {selAtk !== null && !foe.field.some(Boolean) && (
              <button className="danger" onClick={directAttack}>
                直取元神！
              </button>
            )}
            <button onClick={endTurn}>结束回合</button>
          </>
        )}

        {myTurn && mainPhase && selAtk === null && gyMonsters.length > 1 && msg.startsWith('🧲') && (
          <div className="gy-picker">
            还魂目标：
            {gyMonsters.map(({ id, idx }) => (
              <button
                key={idx}
                onClick={() => {
                  const handIdx = me.hand.findIndex((c) => c === 'elixir');
                  if (handIdx >= 0) {
                    moves.activateSpell(handIdx, idx);
                    say(`🧲 还魂了 ${CARDS[id].name}`);
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
