# 🃏 卡牌对战模板（boardgame.io card-game template）

基于 [boardgame.io](https://boardgame.io) (v0.50.x) 的**卡牌游戏模板**，
自带一个可运行的简化版"类游戏王"对战demo。适合做：卡牌对战、手牌/
牌库/墓地机制、隐藏信息、回合制战斗类游戏。

## 使用

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 规则单测 + 5 局全自动完整对局
```

开局即玩：左 = 玩家 0 视角，右 = 玩家 1 视角，**各看各的手牌**。

## 改造成你自己的游戏

| 文件 | 职责 | 改什么 |
|---|---|---|
| `src/cards.js` | 卡池静态数据（G 只存卡牌 ID） | 换成你的卡表与牌库列表 |
| `src/game.js` | 纯规则（无 UI 依赖） | 改 setup/moves/战斗/胜负判定 |
| `src/board.jsx` | 展示层 + 一键交互 + 状态反馈行 | 改布局与交互提示 |
| `src/index.jsx` | Local() 双视角客户端 + 重新开局按钮 | 几乎不用动 |
| `tests/` | 无头规则测试 + 全自动整局对局 | 跟随规则同步修改 |

## 该模板演示的 boardgame.io 关键特性

- **秘密状态**：`playerView` 隐藏对方手牌与双方牌库（每视角只见自己的牌）
- **确定性随机**：`random.Shuffle` 洗牌（禁 `Math.random`），`seed` 可复现
- **server-only 法术**：摸牌类魔法 `client: false`，防止客户端乐观执行泄密
- **回合内子阶段**：`G.step`（主要/战斗）+ moves 守卫——注意 boardgame.io
  的 phase 结束会强制结束回合，回合内子流程不要用 flow phases
- **`INVALID_MOVE` 守卫** + UI 侧状态行反馈每个非法操作的原因
- **`turn.onBegin` 钩子**：每回合自动抽牌、重置召唤/攻击标记
- **`Local()` 多人模式**：同页双客户端热座对决；`server.cjs` 可切真联机
- **一键交互模型**：点手牌即召唤/发动（自动选空位与祭品），杜绝多步选择的地雷
- **整局自动化测试**：`tests/fullgame.test.js` 用与 UI 相同的
  `client.moves.*` 接口自动打完整局到分出胜负

## 想加音效/动效/行动演出？

对手手牌隐藏的游戏**必须**有行动叙事层（否则玩家看不到对方干了什么）。
做法见 skill 的 `references/game-feel.md`：状态差分 FX 引擎（一份代码
同时驱动动效/音效/战报/演出，自动覆盖 AI 行动）、演出铁律（只给对手
演出、禁止弹窗排队、fixed 居中）、Web Audio 合成音效与 CSS 动效集。

## 接入卡面图（可选）

需要卡面立绘时（若有图像生成工具，如 apiz）：

1. **统一风格批量生成**：所有卡共用一个风格后缀（如"国风工笔重彩 +
   鎏金边框、竖版 3:4、无文字"），仅替换主体描述；生成脚本放在
   `scripts/gen-cards.sh` 以便日后换风格重生成
2. 图片保存到 `src/assets/cards/<id>.jpg`
3. `cards.js` 用 Vite 的 URL 资产模式引用（**不要用静态 import**，
   纯 Node 测试会因 `.jpg` 导入崩溃）：

   ```js
   const img = (file) => new URL(`./assets/cards/${file}`, import.meta.url).href;
   export const CARDS = { wukong: { type: 'monster', ..., img: img('wukong.jpg') } };
   ```

4. 卡组件里渲染为背景图：`<img className="card-art" src={card.img} />`
   （绝对定位铺满卡面，文字叠加其上）

## demo 规则（简化版游戏王）

LP 8000 · 共 22 张卡表双方各洗一副 · 开局 5 张，每回合抽 1 ·
每回合 1 次通常召唤（5★需 1 祭品 / 7★需 2 祭品，自动选攻击力最低的） ·
战斗比攻击力、差额伤害、同归于尽 · 对方空场可直接攻击 ·
先手首回合不能攻击 · LP 归零或卡组抽干判负。
