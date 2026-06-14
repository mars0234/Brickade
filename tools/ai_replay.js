// 重現 s4 死亡盤面，單獨測試 AI 的決策
const M = require('./test_ai.js');
const ROWS = 40, COLS = 10;

// 由下而上（display row 1 = 盤面最底）
const displayRows = [
  '.#########', // 1
  '###.######', // 2
  '.#########', // 3
  '.#########', // 4
  '.#########', // 5
  '..########', // 6
  '..######..', // 7
  '..######..', // 8
  '..####....', // 9
  '..####....', // 10
  '..####....', // 11
  '..####....', // 12
  '..####....', // 13
  '..####....', // 14
  '..####....', // 15
  '..####....', // 16
  '..###.....', // 17
  '..###.....', // 18
  '....#.....', // 19
];

let board = [];
for (let r = 0; r < ROWS; r++) board.push('.'.repeat(COLS));
displayRows.forEach((row, i) => { board[ROWS - 1 - i] = row.replace(/#/g, '1'); });
const boardStr = board.join('');

M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  for (const [cur, hold, queue] of [
    ['S', 'J', 'ZLOJZ'],
    ['I', 'NONE', 'JSZLO'], // 如果手上直接有 I 呢？
    ['I', 'NONE', ''],      // 深度 1：純單步評分
    ['I', 'NONE', 'O'],     // 深度 2
  ]) {
    const r = ai.findBestMove(boardStr, cur, hold, queue, -1, 4, false, 0);
    console.log(`cur=${cur} hold=${hold} queue=${queue || '(empty)'} ->`, JSON.stringify({col: r.col, row: r.row, rot: r.rot, useHold: r.useHold}));
  }
};
