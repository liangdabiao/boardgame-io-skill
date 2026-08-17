// 类游戏王卡牌对战 —— 本地双人对决（Local 多人模式，双方各一个视角）。
// 使用 Local() 时 playerView 生效：每个视角只能看到自己的手牌。

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { DuelMonsters } from './game.js';
import Board from './board.jsx';
import './app.css';

const App = Client({
  game: DuelMonsters,
  board: Board,
  multiplayer: Local(),
  debug: false, // 关闭悬浮调试面板：它会覆盖在棋盘上拦截点击，正式游玩不需要
});

function Page() {
  // 换 matchID + key 重挂载 = 在 Local master 上开一局全新对局
  const [matchN, setMatchN] = useState(0);

  return (
    <main>
      <h1>⚔️ 决斗怪兽 · 类游戏王卡牌对战</h1>
      <p className="sub">
        LP 8000 · 每回合抽 1 张 · 每回合 1 次通常召唤（5★需 1 祭品 / 7★需 2 祭品，
        祭品自动选择） · 先手首回合不能攻击 · LP 归零或卡组抽干判负
      </p>
      <div className="toolbar">
        <button className="newgame" onClick={() => setMatchN((n) => n + 1)}>
          🔄 重新开局
        </button>
        <span className="toolbar-hint">左 = 玩家 0 视角，右 = 玩家 1 视角（各看各的手牌）</span>
      </div>
      <div className="duel">
        <App key={`p0-${matchN}`} matchID={`duel-${matchN}`} playerID="0" />
        <App key={`p1-${matchN}`} matchID={`duel-${matchN}`} playerID="1" />
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Page />);
