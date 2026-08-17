// 卡池数据库 —— 静态定义，不进 G（G 只存卡牌 ID，保证可 JSON 序列化）。
//
// 可选卡面图：图片放 src/assets/cards/<id>.jpg，然后给卡加
//   img: img('blueEyes.jpg')
// 注意必须用 new URL 资产模式（勿用静态 import：纯 Node 测试会因
// .jpg 导入崩溃），board.jsx 已内置可选渲染分支。详见 README「接入卡面图」。
const img = (file) => new URL(`./assets/cards/${file}`, import.meta.url).href;

export const CARDS = {
  // 怪兽
  blueEyes:     { type: 'monster', name: '青眼白龙',     level: 8, atk: 3000 },
  darkMagician: { type: 'monster', name: '黑魔术师',     level: 7, atk: 2500 },
  redEyes:      { type: 'monster', name: '真红眼黑龙',   level: 7, atk: 2400 },
  golem:        { type: 'monster', name: '岩石巨兵',     level: 5, atk: 2000 },
  cyber:        { type: 'monster', name: '电子龙',       level: 5, atk: 2100 },
  curseDragon:  { type: 'monster', name: '恶魔之龙',     level: 4, atk: 1500 },
  goblin:       { type: 'monster', name: '哥布林突击队', level: 4, atk: 1700 },
  smallDragon:  { type: 'monster', name: '幼龙',         level: 3, atk: 1000 },

  // 魔法（effect 由 game.js 中的 SPELL_EFFECTS 实现）
  potOfGreed:  { type: 'spell', name: '强欲之壶', effect: 'draw2',  desc: '从卡组抽 2 张卡' },
  raigeki:     { type: 'spell', name: '雷击',     effect: 'raigeki', desc: '破坏对方场上所有怪兽' },
  reborn:      { type: 'spell', name: '死者苏生', effect: 'reborn',  desc: '从自己墓地特殊召唤 1 只怪兽' },
  redMedicine: { type: 'spell', name: '治疗药水', effect: 'heal',    desc: '回复 1000 基本分' },
};

// 双方共用同一卡表，各洗一副 20 张。
export const DECK_LIST = [
  'blueEyes', 'blueEyes',
  'darkMagician', 'darkMagician',
  'redEyes', 'redEyes',
  'golem', 'golem',
  'cyber', 'cyber',
  'curseDragon', 'curseDragon',
  'goblin', 'goblin',
  'smallDragon', 'smallDragon',
  'potOfGreed', 'potOfGreed',
  'raigeki', 'raigeki',
  'reborn',
  'redMedicine',
]; // 22 张

export const FIELD_SLOTS = 3;
export const START_LP = 8000;
export const START_HAND = 5;
