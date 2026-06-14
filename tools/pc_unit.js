// PC solver 單元測試
const ROWS = 40, COLS = 10;
const M = require('./test_ai.js');

function mk(rows) {
  // rows: 由下而上的字串
  let b = [];
  for (let r = 0; r < ROWS; r++) b.push('.'.repeat(COLS));
  rows.forEach((row, i) => { b[ROWS - 1 - i] = row.replace(/#/g, '1'); });
  return b.join('');
}

M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  const cases = [
    // 1 顆 O 收 PC：rows1-2 缺 cols8,9
    ['O 收尾', mk(['########..', '########..']), 'O', 'NONE', 'IJLST'],
    // 1 顆 I 直立收 PC：col9 缺 4 格
    ['I 直立收尾', mk(['#########.', '#########.', '#########.', '#########.']), 'I', 'NONE', 'OJLST'],
    // 2 顆收 PC：缺 cols 8,9 ×4 高（L+J 直立互鎖）
    ['L+J 收尾', mk(['########..', '########..', '########..', '########..']), 'J', 'NONE', 'LOSTZ'],
    // 用 hold 收：當前 S 沒用，hold 換 queue 的 O
    ['hold 換 O', mk(['########..', '########..']), 'S', 'NONE', 'OIJLT'],
    // 不可解（缺 3 格）：應該走一般搜索（不會回傳 PC 線，正常出招即可）
    ['不可解', mk(['#######...', '########..']), 'O', 'NONE', 'IJLST'],
  ];
  for (const [name, board, cur, hold, queue] of cases) {
    const t0 = Date.now();
    const mv = ai.findBestMove(board, cur, hold, queue, -1, 0, false, 0, 0);
    console.log(`${name}: col=${mv.col} row=${mv.row} rot=${mv.rot} hold=${mv.useHold} path=${(mv.path||'').length}chars ${Date.now()-t0}ms`);
  }
};
