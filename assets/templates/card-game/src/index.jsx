// 西游斗法 · 人机对战 —— 人类执「取经人」（玩家 0），AI 执「妖魔主」（玩家 1）。
//
// 音频：BGM（apiz 生成的国风战斗曲）+ Web Audio 合成音效（sfx.js）。
// 浏览器自动播放策略：BGM 在首次交互后开始播放。

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { JourneyWestDuel } from './game.js';
import Board from './board.jsx';
import { createBotClient } from './bot.js';
import { setSfx, sfxEnabled } from './sfx.js';
import './app.css';

const bgmUrl = new URL('./assets/audio/bgm.mp3', import.meta.url).href;

const mp = Local();

const App = Client({
  game: JourneyWestDuel,
  board: Board,
  multiplayer: mp,
  debug: false,
});

function Page() {
  const [matchN, setMatchN] = useState(0);
  const [musicOn, setMusicOn] = useState(
    JSON.parse(localStorage.getItem('west-bgm') ?? 'true')
  );
  const [sndOn, setSndOn] = useState(sfxEnabled());
  const bgmRef = useRef(null);
  const matchID = `west-ai-${matchN}`;

  // 每局创建一个 AI 客户端，换局时停掉旧的
  useEffect(() => {
    const bot = createBotClient({
      game: JourneyWestDuel,
      multiplayer: mp,
      matchID,
      playerID: '1',
      delayMs: 1100, // 与演出时长匹配：看清一步再走下一步
    });
    return () => bot.stop();
  }, [matchID]);

  // BGM：首次交互后播放（浏览器自动播放策略），音量压低不抢戏
  useEffect(() => {
    const start = () => {
      const el = bgmRef.current;
      if (!el) return;
      el.volume = 0.35;
      if (musicOn) el.play().catch(() => {});
      window.removeEventListener('pointerdown', start);
    };
    window.addEventListener('pointerdown', start);
    return () => window.removeEventListener('pointerdown', start);
  }, [musicOn]);

  useEffect(() => {
    const el = bgmRef.current;
    if (!el) return;
    el.volume = 0.35;
    if (musicOn) el.play().catch(() => {});
    else el.pause();
    localStorage.setItem('west-bgm', JSON.stringify(musicOn));
  }, [musicOn]);

  const toggleSnd = () => {
    const next = !sndOn;
    setSndOn(next);
    setSfx(next);
  };

  return (
    <main>
      <h1>☯ 西游斗法 · 人机对战</h1>
      <p className="sub">
        你执「取经人」，AI 执「妖魔主」 · 法力 8000 · 每回合抽 1 张 ·
        每回合 1 次通常召唤（5★需 1 祭品 / 7★需 2 祭品） ·
        先手首回合不能攻击 · 法力归零或卡组抽干判负
      </p>
      <div className="toolbar">
        <button className="newgame" onClick={() => setMatchN((n) => n + 1)}>
          🔄 重新开局
        </button>
        <button className={`toggle ${musicOn ? 'on' : ''}`} onClick={() => setMusicOn((v) => !v)}>
          {musicOn ? '🎵 音乐开' : '🔇 音乐关'}
        </button>
        <button className={`toggle ${sndOn ? 'on' : ''}`} onClick={toggleSnd}>
          {sndOn ? '🔊 音效开' : '🔇 音效关'}
        </button>
        <span className="toolbar-hint">对手：AI 妖魔主（回合内自动行动，稍候片刻）</span>
      </div>
      <audio ref={bgmRef} src={bgmUrl} loop preload="auto" />
      <div className="duel solo">
        <App key={`p0-${matchN}`} matchID={matchID} playerID="0" />
      </div>
      {/* 版本角标：确认浏览器运行的是最新代码（Vite HMR 可能不完整，刷新后此号会变） */}
      <div className="version-badge">v3 · 演出版</div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Page />);
