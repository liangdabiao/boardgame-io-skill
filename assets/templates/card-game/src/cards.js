// 西游斗法 —— 卡池数据库（西游记题材）。
// 静态定义不进 G（G 只存卡牌 ID，保证可 JSON 序列化）。
// img: 用 Vite 的 new URL 资产模式——打包器解析为资源 URL，
// 纯 Node（无头测试）也不会因 .jpg 导入而崩溃。

const img = (file) => new URL(`./assets/cards/${file}`, import.meta.url).href;

export const CARDS = {
  // ===== 神魔（怪兽）=====
  wukong: {
    type: 'monster', name: '齐天大圣孙悟空', level: 8, atk: 3000, img: img('wukong.jpg'),
    lore: '五百年前大闹天宫，一根金箍棒打遍三界',
  },
  erlang: {
    type: 'monster', name: '二郎神杨戬', level: 7, atk: 2500, img: img('erlang.jpg'),
    lore: '额生天眼，哮天犬随行，天庭第一战将',
  },
  bullking: {
    type: 'monster', name: '牛魔王', level: 7, atk: 2400, img: img('bullking.jpg'),
    lore: '平天大圣，火焰山一代魔主',
  },
  sixEars: {
    type: 'monster', name: '六耳猕猴', level: 6, atk: 2200, img: img('sixears.jpg'),
    lore: '真假难辨，与孙悟空同形同艺',
  },
  redBoy: {
    type: 'monster', name: '红孩儿', level: 5, atk: 2100, img: img('redboy.jpg'),
    lore: '三昧真火，圣婴大王',
  },
  ironfan: {
    type: 'monster', name: '铁扇公主', level: 5, atk: 2000, img: img('ironfan.jpg'),
    lore: '芭蕉扇主人，一扇息火，二扇生风',
  },
  bajie: {
    type: 'monster', name: '猪八戒', level: 4, atk: 1700, img: img('bajie.jpg'),
    lore: '天蓬元帅转世，九齿钉耙力大无穷',
  },
  wujing: {
    type: 'monster', name: '沙悟净', level: 4, atk: 1500, img: img('wujing.jpg'),
    lore: '卷帘大将下凡，降妖宝杖忠厚可靠',
  },
  imp: {
    type: 'monster', name: '巡山小妖', level: 3, atk: 1000, img: img('imp.jpg'),
    lore: '洞府杂兵，摇旗呐喊',
  },

  // ===== 法术（effect 由 game.js 实现）=====
  transform: {
    type: 'spell', name: '七十二变', effect: 'draw2', img: img('transform.jpg'),
    desc: '变化万千——从卡组抽 2 张牌',
  },
  jingu: {
    type: 'spell', name: '紧箍咒', effect: 'jingu', img: img('jingu.jpg'),
    desc: '头痛欲裂——破坏对方场上攻击力最高的一只神魔',
  },
  ginseng: {
    type: 'spell', name: '人参果', effect: 'heal', img: img('ginseng.jpg'),
    desc: '万年灵根——回复 1000 点法力',
  },
  elixir: {
    type: 'spell', name: '还魂丹', effect: 'reborn', img: img('elixir.jpg'),
    desc: '起死回生——从自己墓地特殊召唤一只神魔',
  },
};

// 双方共用同一卡表，各洗一副 23 张。
export const DECK_LIST = [
  'wukong', 'wukong',
  'erlang', 'erlang',
  'bullking', 'bullking',
  'sixEars', 'sixEars',
  'redBoy', 'redBoy',
  'ironfan',
  'bajie', 'bajie',
  'wujing', 'wujing',
  'imp', 'imp',
  'transform', 'transform',
  'jingu', 'jingu',
  'ginseng',
  'elixir',
];

export const FIELD_SLOTS = 3;
export const START_LP = 8000;
export const START_HAND = 5;
