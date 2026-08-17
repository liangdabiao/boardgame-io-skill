# boardgame-io Skill

一个指导 Codex/Workbuddy/ZCode 等Agent 使用 [boardgame.io](https://boardgame.io)（v0.50.x）开发回合制
游戏的 skill。触发后，模型会按照经过实战验证的工作流、API 精要和项目模板
来创建游戏，而不是凭训练记忆写代码——避免过时 API、隐蔽的状态管理坑和
不可用的 UI 接线。

注意：如果需要画图生图生视频等功能，可以配合apiz skill: https://github.com/liangdabiao/apiz-skill

## 覆盖范围

- **棋盘 / 卡牌 / 骰子类回合制游戏**：状态设计、moves、回合/阶段、
  胜负判定、AI 对手
- **隐藏信息游戏**：`playerView` 秘密状态、server-only moves
- **多人模式**：本地热座、`Local()` 双视角、SocketIO 联机、服务端与
  大厅（创建/加入对局）
- **工程化**：无头规则测试、整局自动化对局测试、TypeScript 模式、调试面板

## 目录结构

```
boardgame-io/
├── SKILL.md              # 模型加载的主指令：8 条黄金法则 + 5 步工作流 + 检查清单
├── references/           # 按需加载的深度参考
│   ├── game-definition.md   # Game 对象全量 API：moves 长短形式、阶段/舞台/
│   │                        # setActivePlayers、回合顺序、events 钩子矩阵、
│   │                        # 秘密状态、Bot/AI（框架 bots 与脚本机器人两种模式）
│   ├── client-server.md     # React 客户端、纯 JS 客户端、Local/SocketIO、
│   │                        # 服务端、大厅 REST API、导入路径与静态资产注意事项
│   ├── advanced.md          # random API、撤销策略、四级测试法（含整局自动
│   │                        # 对局）、TypeScript、调试面板、性能
│   └── game-feel.md         # 游戏演出层：状态差分 FX 引擎、行动演出铁律、
│                            # Web Audio 合成音效、BGM 生成、CSS 动效集、
│                            # 调试与协作经验
└── assets/templates/     # 开箱即用的项目骨架
    ├── minimal/          # 井字棋：快速起步的棋盘游戏骨架
    └── card-game/        # 卡牌对战：隐藏手牌/牌库/祭品战斗的完整模板（美术就绪）
```

## 使用方式

**自动触发**：任何涉及"用 boardgame.io 做个游戏 / 回合制 / 棋牌 / 桌游 /
multiplayer / phases / moves"的请求（中英文皆可），skill 的 description
会命中并加载 SKILL.md。

**手动触发**：`/skill boardgame-io <你的需求>`

**模板路由**（SKILL.md 内建的选择逻辑）：

| 场景 | 起点模板 |
|---|---|
| 简单棋盘游戏（井字棋/五子棋/跳棋类） | `assets/templates/minimal/` |
| 卡牌对战、隐藏手牌、回合内子阶段（抽牌/主要/战斗） | `assets/templates/card-game/` |

## 针对 v0.50.x 的关键事实（本 skill 的价值核心）

所有 API 均对照 boardgame.io 0.50.2 源码逐项核实：

1. **回调签名**：一切回调（moves/setup/hooks/endIf/playerView）的首参数为
   解构对象 `({ G, ctx, playerID, events, random }, ...args)`；旧版
   `(G, ctx)` 双参写法已过时
2. **阶段语义**：phase 结峰会**强制结束当前回合**——回合内子流程
   （如卡牌游戏的主要/战斗阶段）应使用 `G.step` + moves 守卫，而不是
   flow phases
3. **导入路径**：0.50.x 无 Node `exports` 映射，`boardgame.io/client`
   等子路径仅打包器可解析；纯 Node（测试/脚本）需深层导入
   `boardgame.io/dist/esm/*.js`；服务端只有 CJS 入口（`require`）。
   **静态资源同理**：`.jpg` 等资产的静态 import 仅打包器可用，双环境
   兼容写法是 `new URL(file, import.meta.url).href`（模板已内置）
4. **确定性随机**：必须用注入的 `random.*` API（`D6`/`Die`/`Shuffle`…），
   禁 `Math.random`；使用 random 的 move 自动变为服务端权威
5. **`unsetStage` 已移除**：用 `endStage`；事件在 move 内是排队执行，
   G 变更先于事件生效

## 质量保障历程

这个 skill 不是写完就发布，而是走完了完整的迭代闭环：

1. **API 核实**：结合本地仓库源码 + DeepWiki 交叉验证所有签名与行为
2. **对照测试**：测试代理仅凭 skill 文件（禁看框架仓库）完成四子棋，
   暴露出 Node ESM 导入缺陷后修复并复测
3. **实战检验一**：用该 skill 开发类游戏王卡牌游戏（duel-monsters），
   经真实浏览器点击测试与 5 局全自动整局对局验证；期间发现的 UI 可玩性
   问题（空槽无点击处理、静默拒绝非法操作、调试面板拦截点击、
   hover 位移、控件低于折叠线等）全部修复
4. **实战检验二**：从 card-game 模板一晚搭出西游记题材《西游斗法》
   （journey-west，apiz 生成 13 张卡面图 + 国风 BGM），28/28 测试通过
   ——模板化复用生效，前期教训零复发；新增的静态资产导入经验已回灌
5. **实战检验三**：西游斗法加入 AI 对手（脚本机器人共享 Local master）、
   Web Audio 合成音效、动效与行动演出层。演出方案经多轮用户反馈最终
   定版为三级事件通知架构（对决卡图弹窗 / 召唤法术卡图弹窗 / 其余
   文字弹框），期间踩出若干硬核教训（动态类名碰撞、延迟弹窗时序
   错乱、攻击者死亡的检测盲区、HMR 旧代码假象），全部沉淀为
   `references/game-feel.md` 与 SKILL.md 的 game feel 清单
6. **经验回灌**：所有教训沉淀为 SKILL.md 的"UI 可玩性清单"、"game
   feel 清单"、静态资产导入模式、整局自动对局测试模式、双 bot 模式，
   以及 card-game 模板的"接入卡面图"章节（模板代码已美术就绪）
7. **模板独立验证**：两个模板分别在干净目录安装/测试/构建通过

## 维护指南

- **升级 boardgame.io 时**：重点复查三处——回调签名、`exports` 映射
  （若官方加上，`references/client-server.md` 的导入注意事项和两个模板
  的深层导入可以简化为普通子路径）、events API 列表
- **新增游戏类型模板**：放入 `assets/templates/<name>/`，并在 SKILL.md
  的模板路由表中登记；模板必须自带测试且在干净目录验证过
- **保持 SKILL.md < 500 行**：新的领域细节放进 `references/`，
  SKILL.md 只保留工作流与路由


## 特别感谢

https://linux.do 社区支持