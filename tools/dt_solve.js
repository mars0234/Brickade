// DT 砲版型求解器：
// 依官方描述（LS base：L/S/T 出生點直落 col3；J/Z/I/O 靠左牆/角落），
// 左塔與中塔分開枚舉再組合，過濾出「TSD 槽形 + TST 缺口形」共存的 bag1 盤面，
// 用引擎 E2E 實測：bag2 打出 TSD、之後打出 TST 的成功率。
// 用法: node tools/dt_solve.js
const fs = require('fs');
const path = require('path');
const ROWS = 40, COLS = 10;

const src = fs.readFileSync(path.join(__dirname, 'ai_test.js'), 'utf8');
const body = src.slice(0, src.indexOf('function runScenario'));
const fn = new Function('require', 'process', 'console', body + '\nreturn { Sim, PIECES };');
const { Sim, PIECES } = fn(require, process, console);

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
function show(board, rows = 8) {
  for (let r = ROWS - rows; r < ROWS; r++) {
    console.log('  ' + String(ROWS - r).padStart(2) + ' ' + board[r].map(x => x ? '#' : '.').join(''));
  }
}
function permAll(arr) {
  const out = [];
  const rec = (rest, cur) => {
    if (!rest.length) { out.push(cur); return; }
    for (let i = 0; i < rest.length; i++) rec(rest.filter((_, j) => j !== i), [...cur, rest[i]]);
  };
  rec(arr, []);
  return out;
}
// 結構偵測：TSD 槽形（局部）：col c 上下兩格空（bar row: c-1,c,c+1 空；stem row: 只差 c），
// 屋簷在 c±1。這裡用「局部形狀」版（不要求整行快滿，bag1 右側還沒蓋）
function findTsdShape(board) {
  for (let c = 1; c < COLS - 1; c++) {
    for (let r = 2; r < ROWS - 1; r++) {
      const upper = r, lower = r + 1;
      if (board[upper][c-1] || board[upper][c] || board[upper][c+1]) continue; // bar 三格要空
      if (board[lower][c]) continue;                                          // stem 要空
      if (!board[lower][c-1] || !board[lower][c+1]) continue;                 // stem 兩側要有底
      const roof = upper - 1;
      if (roof < 0 || board[roof][c]) continue;
      if (board[roof][c-1] || board[roof][c+1]) return { col: c, row: lower };
    }
  }
  return null;
}
// TST 缺口形：col x 屋簷下剛好 3 空格、底下是方塊/地板、缺口兩側有牆
function findTstShape(board) {
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 3; r++) {
      if (!board[r][c]) continue;
      if (!board[r+1][c] && !board[r+2][c] && !board[r+3][c]
          && (r + 4 >= ROWS || board[r+4][c])) {
        const leftWall = (c === 0) || board[r+2][c-1];
        const rightWall = (c === COLS - 1) || board[r+2][c+1];
        if (leftWall && rightWall) return { col: c, topRow: r + 1 };
      }
      break;
    }
  }
  return null;
}
function countHolesExempt(board, exemptCells) {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let top = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) top = true;
      else if (top && !exemptCells.has(r * COLS + c)) holes++;
    }
  }
  return holes;
}

// === 枚舉 ===
// 中塔：L,S,T rot0 全部直落 c3（6 種順序）
const midStacks = [];
for (const order of permAll(['L', 'S', 'T'])) {
  const b = emptyBoard();
  let ok = true;
  for (const t of order) if (drop(b, t, 0, 3) === null) { ok = false; break; }
  if (ok) midStacks.push({ board: b, order });
}
// 牆側 / 地面組：J,Z,I,O（依日文 wiki：「L,J,O,I 都貼地放」，I 可平放含 col3）
const leftCand = {
  J: [], Z: [], I: [], O: [],
};
for (const rot of [0, 1, 2, 3]) for (let c = -1; c <= 1; c++) leftCand.J.push([rot, c]);
for (const c of [0, 1]) leftCand.Z.push([0, c]);
for (const c of [-1, 0, 1]) leftCand.Z.push([1, c], [3, c]);
leftCand.I.push([0, 0]); // I 平放 cols 0-3（貼地）
for (const c of [-2, -1, 0]) leftCand.I.push([1, c]); // 或直立靠牆
for (const c of [0, 1]) leftCand.O.push([0, c]);

const withinLeft = (b) => {
  for (let c = 4; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (b[r][c]) return false;
  return true;
};

const candidates = new Map();
for (const order of permAll(['J', 'Z', 'I', 'O'])) {
  let stack = [{ board: emptyBoard(), picks: [], ord: [] }];
  for (const t of order) {
    const next = [];
    for (const st of stack) {
      for (const [rot, c] of leftCand[t]) {
        const b = st.board.map(row => row.slice());
        if (drop(b, t, rot, c) === null) continue;
        if (!withinLeft(b)) continue;
        next.push({ board: b, picks: [...st.picks, [t, rot, c]], ord: [...st.ord, t] });
      }
    }
    stack = next;
    if (stack.length > 20000) stack.length = 20000;
  }
  for (const st of stack) {
    const key = st.board.map(r => r.join('')).join('');
    if (!candidates.has(key)) candidates.set(key, { picks: st.picks, ord: st.ord });
  }
}
console.log(`牆側拼法: ${candidates.size} 種`);

// 組合（中塔疊在牆側組之後）+ 結構過濾
const finals = [];
for (const [key, cand0] of candidates) {
  for (const mid of midStacks) {
    const b = emptyBoard();
    let ok = true;
    for (const [t, r, c] of cand0.picks) { if (drop(b, t, r, c) === null) { ok = false; break; } }
    if (!ok) continue;
    for (const t of mid.order) { if (drop(b, t, 0, 3) === null) { ok = false; break; } }
    if (!ok) continue;

    const tst = findTstShape(b);
    if (!tst) continue;
    const tsd = findTsdShape(b);
    if (!tsd) continue;
    // 洞數放寬：DT 的 T 進入通道整條都是「洞」，交給 E2E 裁決
    const holes = countHolesExempt(b, new Set());
    if (holes > 8) continue;
    let maxH = 0;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      if (b[r][c]) { maxH = Math.max(maxH, ROWS - r); break; }
    }
    if (maxH > 8) continue;
    finals.push({ board: b, leftPicks: cand0.picks, midOrder: mid.order, tsd, tst, maxH, holes });
  }
}
finals.sort((a, b) => a.holes - b.holes || a.maxH - b.maxH);
console.log(`結構合格（TSD 槽形 + TST 缺口形、洞≤8）: ${finals.length} 種`);

// === E2E：引擎打 bag2-3，看 TSD → TST 是否真的發生 ===
const M = require('./test_ai.js');
M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  const results = [];
  let tested = 0;
  for (const f of finals) {
    if (++tested > 60) break; // 時間上限
    let tsdOk = 0, tstOk = 0;
    const TRIALS = 14;
    for (let trial = 0; trial < TRIALS; trial++) {
      const sim = new Sim(ai, 0, 500 + trial);
      // 直接套 bag1 結果
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        sim.board[r][c] = f.board[r][c] ? 'X' : null;
      }
      sim.queue = []; sim.bag = [];
      sim.ensureQueue();
      let sawTsd = false, sawTst = false;
      let prevT = 0, prevLines = 0;
      for (let i = 0; i < 16; i++) {
        const beforeT = sim.stats.tspins;
        const beforeLines = sim.stats.linesCleared;
        if (!sim.step()) break;
        if (sim.stats.tspins > beforeT) {
          const linesGained = sim.stats.linesCleared - beforeLines;
          if (linesGained === 2 && !sawTsd) sawTsd = true;
          else if (linesGained === 3) sawTst = true;
        }
      }
      if (sawTsd) tsdOk++;
      if (sawTst) tstOk++;
    }
    results.push({ f, tsdOk, tstOk, score: tsdOk + tstOk * 2 });
  }
  results.sort((a, b) => b.score - a.score);
  console.log(`\n=== E2E 最佳版型（${Math.min(tested, 60)} 個測試）===`);
  for (const r of results.slice(0, 4)) {
    console.log(`TSD ${r.tsdOk}/14  TST ${r.tstOk}/14  左塔: ${r.f.leftPicks.map(([t, rot, c]) => `${t}(r${rot},c${c})`).join(' ')}  中塔順序: ${r.f.midOrder.join('')}`);
    show(r.f.board, 8);
  }
};
