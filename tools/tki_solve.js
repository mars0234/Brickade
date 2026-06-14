// TKI-3 版型求解器：依 harddrop 的文字描述枚舉候選擺法組合，
// 用 wasm BFS 引擎驗證「hold 的 T 能轉出 Full T-Spin Double」，找出正確版型。
// 用法: node tools/tki_solve.js
const ROWS = 40, COLS = 10;
const PIECES = {
  I: [[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],[[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]],
  O: [[[1,1,0,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]]],
  T: [[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  J: [[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]]],
  L: [[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],[[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]]],
  S: [[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  Z: [[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]]],
};
const JLSTZ_KICKS = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]], '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]], '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

function emptyBoard() { return Array.from({length: ROWS}, () => Array(COLS).fill(0)); }
function valid(board, matrix, row, col) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!matrix[r][c]) continue;
    const br = row + r, bc = col + c;
    if (bc < 0 || bc >= COLS || br >= ROWS) return false;
    if (br >= 0 && board[br][bc]) return false;
  }
  return true;
}
// 直落：回傳鎖定 row，放不進去回 null
function drop(board, type, rot, col) {
  const matrix = PIECES[type][rot % PIECES[type].length];
  let row = type === 'I' ? 18 : 19;
  if (!valid(board, matrix, row, col)) return null;
  while (valid(board, matrix, row + 1, col)) row++;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (matrix[r][c]) board[row + r][col + c] = 1;
  }
  return row;
}
function fullRows(board) {
  const out = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every(x => x)) out.push(r);
  return out;
}
function countHoles(board) {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let top = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) top = true;
      else if (top) holes++;
    }
  }
  return holes;
}
function boardStr(board) {
  return board.map(row => row.map(x => x ? '1' : '.').join('')).join('');
}
function show(board, rows = 6) {
  for (let r = ROWS - rows; r < ROWS; r++) {
    console.log('  ' + String(ROWS - r).padStart(2) + ' ' + board[r].map(x => x ? '#' : '.').join(''));
  }
}
// T 路徑回放 + T-Spin 判定（與 harness 相同）
function replayT(board, path) {
  const st = { row: 19, col: 3, rot: 0, lastRotate: false, kickIdx: 0 };
  for (const a of path) {
    const matrix = PIECES.T[st.rot];
    if (a === 'D') { if (valid(board, matrix, st.row + 1, st.col)) st.row++; st.lastRotate = false; }
    else if (a === 'L' || a === 'R') {
      const nc = st.col + (a === 'R' ? 1 : -1);
      if (valid(board, matrix, st.row, nc)) st.col = nc;
      st.lastRotate = false;
    } else if (a === 'c' || a === 'z') {
      const from = st.rot, to = (from + (a === 'c' ? 1 : 3)) % 4;
      const rotated = PIECES.T[to];
      const kicks = JLSTZ_KICKS[`${from}>${to}`];
      for (let i = 0; i < kicks.length; i++) {
        const [dx, dy] = kicks[i];
        const nr = st.row - dy, nc = st.col + dx;
        if (valid(board, rotated, nr, nc)) { st.rot = to; st.row = nr; st.col = nc; st.lastRotate = true; st.kickIdx = i; break; }
      }
    }
  }
  return st;
}
function tSpinType(board, st) {
  if (!st.lastRotate) return null;
  const r = st.row + 1, c = st.col + 1;
  const corners = [[r-1,c-1],[r-1,c+1],[r+1,c-1],[r+1,c+1]];
  const frontIdx = {0:[0,1],1:[1,3],2:[2,3],3:[0,2]}[st.rot];
  let filled = 0, front = 0, back = 0;
  for (let i = 0; i < 4; i++) {
    const [cr, cc] = corners[i];
    if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || board[cr][cc]) {
      filled++;
      if (frontIdx.includes(i)) front++; else back++;
    }
  }
  if (filled >= 3) {
    if (st.kickIdx === 4) return 'Full';
    if (front === 2) return 'Full';
    if (front === 1 && back === 2) return 'Mini';
  }
  return null;
}

const M = require('./test_ai.js');
M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  // 候選擺法（依 harddrop 文字描述）：[type, rot, col] 列表
  const candI = [['I', 0, 3]];                                 // I 置中（spawn 直落）
  const candL = [];
  for (const rot of [0, 1, 2, 3]) for (const col of [-1, 0, 1]) candL.push(['L', rot, col]); // L 靠左牆
  const candZ = [];
  for (const rot of [0, 1]) for (const col of [2, 3, 4, 5]) candZ.push(['Z', rot, col]);     // Z 疊在 I 上
  const candS = [];
  for (const rot of [1, 3]) for (const col of [4, 5, 6, 7]) candS.push(['S', rot, col]);     // S 直立在 O 和 Z 之間
  for (const col of [5, 6]) candS.push(['S', 0, col]);
  const candO = [['O', 0, 8]];                                 // O 靠右牆
  const candJ = [];
  for (const rot of [0, 1, 2, 3]) for (const col of [6, 7, 8]) candJ.push(['J', rot, col]); // J 靠右牆

  const results = [];
  for (const pI of candI) for (const pL of candL) for (const pZ of candZ)
  for (const pS of candS) for (const pO of candO) for (const pJ of candJ) {
    const board = emptyBoard();
    const seq = [pI, pL, pZ, pS, pO, pJ];
    let ok = true;
    for (const [t, r, c] of seq) {
      if (drop(board, t, r, c) === null) { ok = false; break; }
      if (fullRows(board).length > 0) { ok = false; break; } // 蓋的過程不能消行
    }
    if (!ok) continue;
    if (countHoles(board) > 3) continue; // 蓋完洞太多直接淘汰

    // 問 wasm：T 進去最好的走法
    const mv = ai.findBestMove(boardStr(board), 'T', 'NONE', '', -1, 0, false, 0, 0);
    if (!mv.path) continue;
    const st = replayT(board, mv.path);
    if (st.row !== mv.row || st.col !== mv.col || st.rot !== mv.rot) continue;
    const ts = tSpinType(board, st);
    if (ts !== 'Full') continue;
    // 鎖定 + 消行檢查
    const matrix = PIECES.T[st.rot];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (matrix[r][c]) board[st.row + r][st.col + c] = 1;
    }
    const cleared = fullRows(board);
    if (cleared.length !== 2) continue;
    // 清掉後的殘局品質
    const after = board.filter((_, i) => !cleared.includes(i));
    while (after.length < ROWS) after.unshift(Array(COLS).fill(0));
    const holesAfter = countHoles(after);
    results.push({ seq, holesAfter, after, tPath: mv.path, tFinal: st });
  }

  results.sort((a, b) => a.holesAfter - b.holesAfter);
  console.log(`找到 ${results.length} 組可行的 TKI-3 版型（TSD 成功）`);
  for (const r of results.slice(0, 5)) {
    console.log(`--- 擺法: ${r.seq.map(([t, rot, col]) => `${t}(rot${rot},c${col})`).join(' ')} | TSD 後殘洞=${r.holesAfter} | T路徑=${r.tPath}`);
    const b = emptyBoard();
    for (const [t, rot, col] of r.seq) drop(b, t, rot, col);
    show(b, 6);
    console.log('  TSD 後:');
    show(r.after, 4);
  }
};
