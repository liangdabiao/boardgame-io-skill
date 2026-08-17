boardgame.io 是一个**用 JS/TS 写回合制游戏逻辑、顺手把联机同步/存档/AI 都包办的开源引擎**（MIT 协议，`npm install boardgame.io`）。它不画像素、不跑物理、不处理帧循环——只做一件事：**把"玩家做了个动作 → 游戏状态怎么变 → 怎么同步给其他玩家/存盘/让 AI 接手"这套状态机管到端**。

下面按"它解决什么痛点 → 核心抽象 → 架构分层 → 进阶能力 → 边界与竞品"拆开。

## 一、它解决的是什么痛点

传统做卡牌 / 桌游 / 战棋类联机，真正费时间的不是规则本身，而是周边：

- 客户端和服务端的状态一致性、断线重连、防作弊校验
- 房间 / 匹配 / Lobby
- 隐藏手牌、暗拍、暗置单位这类"秘密信息"同步
- 单机模式要手搓 AI、联机模式又要另写一遍规则
- 撤悔棋、对局回放、日志时间旅行

boardgame.io 的思路是：**把游戏规则写成纯函数 reducer，其余全交给框架**。开发者只声明 `setup / moves / phases / turn / endIf`，联机、存储、AI、日志全部内置。

> 💡 类比：如果把游戏规则当作 Redux store 的 reducer，boardgame.io 就是"自带 socket 服务、AI middleware、持久化插件和 React 绑定的 Redux Toolkit"。

## 二、核心抽象：G、ctx、moves、events、flow

**状态拆两半**（这是理解整套设计的关键）：

- **`G`（Game State）**：你自己的数据——棋盘、卡组、资源、分数，必须 **JSON 可序列化**（不能塞函数 / class 实例），由 `setup()` 初始化，只有 moves 能改
- **`ctx`（Context）**：框架管的元数据，只读——`numPlayers / turn / currentPlayer / playOrder / phase / activePlayers / gameover / _stateID` 等；其中 `_stateID` 单调自增，用来在联机时做版本防竞态

**moves 就是 reducer**：
```js
function DrawCard({ G, playerID }) { G.deck--; G.hand[playerID]++; }
const game = {
  setup: ({ ctx }) => ({ deck: 6, hand: Array(ctx.numPlayers).fill(0) }),
  moves: { DrawCard, PlayCard },
  turn: { minMoves: 1, maxMoves: 1 },
};
```
moves 在客户端先跑（免延迟手感），再到服务端由 Master 跑出权威态。

**events 改流程不改 G**：`endTurn / endPhase / endGame / setPhase / setStage / setActivePlayers`，由 Flow 系统消费。

**Flow 系统管 phases / turns / stages**：
- phase 可各自覆盖 `moves / turn / endIf / next / onBegin / onEnd`
- turn 可配 `order / minMoves / maxMoves / stages / activePlayers`
- stage 让同回合内不同玩家走不同 move 集
- 阶段切换时当前回合先自动结束

整套核心就是 `reducer(G, move/event, ctx) → 新G + 新ctx + _stateID++`，插件在前后插桩。

## 三、架构分层（逻辑 / UI / 网络 切干净）

| 层 | 包 | 职责 |
|---|---|---|
| Core | `boardgame.io/core` | reducer、flow、G/ctx、插件生命周期 |
| Client | `boardgame.io/client` | 把 UI 事件 dispatch 成 move，订阅状态 |
| React / RN | `boardgame.io/react` `react-native` | 一等绑定，Vue/Svelte/原生 DOM 也行（view-agnostic） |
| Master | `master` | 服务端权威态、校验 move 合法性、广播 |
| Server | `server` | `Server({ games: [MyGame] }).run(8000)` 起 Node 服务 |
| Transport | `multiplayer` | `SocketIO()` 联机 / `Local()` 同机传设备 / 自接 P2P |
| Storage | `server` storage 层 | 内存 `InMemory` / Redis / 自接 DB |
| AI | `ai` | MCTS bot、随机 bot、自定义 bot |

要点：**客户端薄、Master 厚**。联机对局里客户端发操作，Master 验完跑 reducer 再推全量/增量状态；`deltalog` 支持只发 patch 优化大状态。

## 四、几个容易被忽略但很能打的能力

- **隐藏信息**：插件 + `playerView` 过滤，做杀人游戏、暗手牌、身份局都没问题
- **内置 MCTS AI**：不用自己写 minimax，bot 能直接套用到任意已声明规则的游戏，可调配难度
- **Lobby 系统**：建房 / 进房 / 房间列表 API 内置，不用自己写匹配服务
- **时间旅行**：日志 + `_undo/_redo` 栈，debug 面板可回退到某一步状态，做复盘 / 裁判系统很方便[cita:5]
- **插件系统**：random（种子随机，保证联机两端一致）、events、player、自定义插件走统一生命周期
- **Delta 同步**：大状态场景可只传 patch 而非整树

## 五、边界：它**不是**什么

这是选型最容易翻车的地方：

- ❌ **不是渲染引擎**——不画 sprite、不排骨骼、不处理 60fps 循环；动画靠 React/Vue/canvas 自己接
- ❌ **不是实时动作游戏框架**——物理、连续位移、帧同步找 Colyseus / Photon / Mirror
- ❌ **不全套账号体系**——只有基础 player credential，OAuth / 好友 / 排行榜要接 Nakama / PlayFab / Firebase
- ❌ **G 必须可序列化**——想往状态里塞 class 实例、函数、Map（非 POJO）会炸传输
- ⚠️ 复杂大状态 + 高频 undo + 自写插件时，要自己管 delta / 存储选型，不是零成本

## 六、和相近方案的定位差

- **vs Phaser / Unity**：后者管渲染+帧循环，联机得自己搭；boardgame.io 只管回合制状态机+联机，不管画面
- **vs Colyseus / Nakama**：它们是通用实时后端 / 游戏后端（含账号、匹配、房间），boardgame.io 专注"回合制规则+状态同步+AI"，更薄更专
- **vs Socket.IO 裸写**：boardgame.io 在 socket 之上给了 move/flow/secret-state/AI 这些游戏语义抽象，不用从零设计协议
- **vs 自写 Redux+socket 桌游**：省掉的就是 flow、phases、MCTS、lobby、撤悔栈、playerView 这套样板

## 七、一句话定性

**boardgame.io = 回合制游戏的"规则 reducer + 联机 Master + MCTS AI + Lobby + 撤悔日志"一体化中间件层**，适合卡牌、战棋、工人放置、身份局、解谜等"步进取式"游戏；不适合动作、物理、实时竞技。

如果要做 Web / React 系的联机桌游，它目前是 JS 生态里把"规则—联机—AI"三者打包得最完整的一档；要出移动端原生可以把 React 端套 Capacitor / RN，或者只借它的 core+server 做后端、前端另写。

要不要我按你手头项目的类型（卡牌 / 战棋 / 身份局 / 解谜）、预期人数和是否要暗牌，给一版"用 boardgame.io 搭最小可玩骨架"的目录结构和 move 设计示范？