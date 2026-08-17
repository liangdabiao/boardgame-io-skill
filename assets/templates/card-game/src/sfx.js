// 音效引擎 —— Web Audio 实时合成，零音频资源、零加载延迟。
//
// 浏览器自动播放策略：AudioContext 必须在用户首次交互后 resume，
// 由 ensureUnlocked() 保证（board 上的任何点击都会先调它）。

let ctx = null;
let sfxOn = JSON.parse(localStorage.getItem('west-sfx') ?? 'true');

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function ensureUnlocked() {
  try { ac(); } catch { /* 无 AudioContext 环境（测试） */ }
}

export function setSfx(on) {
  sfxOn = on;
  localStorage.setItem('west-sfx', JSON.stringify(on));
}
export const sfxEnabled = () => sfxOn;

// 基础构件：单音（振荡器 + 包络）
function tone({ freq, type = 'sine', dur = 0.2, vol = 0.2, at = 0, slide = 0, decay = true }) {
  const c = ac();
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  if (decay) gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// 噪声（斩击、打击）
function noise({ dur = 0.15, vol = 0.25, at = 0, lowpass = 3000, hp = 0 }) {
  const c = ac();
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  let node = src.connect(lp);
  if (hp) {
    const hpf = c.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    node = node.connect(hpf);
  }
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(gain).connect(c.destination);
  src.start(t0);
}

const guard = (fn) => (...a) => {
  if (!sfxOn) return;
  try { fn(...a); } catch { /* 音频不可用时静默 */ }
};

export const sfx = {
  // 召唤：锣声 + 低频厚度
  summon: guard(() => {
    tone({ freq: 520, type: 'triangle', dur: 0.5, vol: 0.22, slide: -160 });
    tone({ freq: 1560, type: 'sine', dur: 0.9, vol: 0.1, at: 0.02 });
    tone({ freq: 78, type: 'sine', dur: 0.4, vol: 0.28 });
  }),
  // 攻击：挥斩噪声 + 下滑音
  attack: guard(() => {
    noise({ dur: 0.18, vol: 0.3, lowpass: 5200, hp: 900 });
    tone({ freq: 880, type: 'sawtooth', dur: 0.16, vol: 0.12, slide: -620 });
  }),
  // 受击：钝击 + 低鸣
  hit: guard(() => {
    noise({ dur: 0.12, vol: 0.35, lowpass: 900 });
    tone({ freq: 110, type: 'square', dur: 0.18, vol: 0.2, slide: -50 });
  }),
  // 法术：清脆琶音
  spell: guard(() => {
    [880, 1174, 1568, 2093].forEach((f, i) =>
      tone({ freq: f, type: 'sine', dur: 0.28, vol: 0.12, at: i * 0.07 })
    );
  }),
  // 抽牌：轻微纸张滑音
  draw: guard(() => {
    noise({ dur: 0.08, vol: 0.1, lowpass: 6000, hp: 2500 });
  }),
  // 神魔消散：下行三连
  destroy: guard(() => {
    [660, 520, 380].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.14, at: i * 0.09 })
    );
  }),
  // 回合开始：钟磬
  turn: guard(() => {
    tone({ freq: 1320, type: 'sine', dur: 0.6, vol: 0.14 });
    tone({ freq: 660, type: 'sine', dur: 0.5, vol: 0.1, at: 0.05 });
  }),
  // 胜利：上行号角
  win: guard(() => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.18, at: i * 0.14 })
    );
  }),
  // 落败：下行挽歌
  lose: guard(() => {
    [523, 415, 311, 262].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.55, vol: 0.16, at: i * 0.18 })
    );
  }),
  // 点击反馈
  click: guard(() => {
    tone({ freq: 1400, type: 'sine', dur: 0.06, vol: 0.08 });
  }),
};
