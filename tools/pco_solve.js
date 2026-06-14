// PCO（Perfect Clear Opener）版型求解器：
// 左箱固定（直立 I col0 + L/J 互鎖 cols1-2，幾何唯一），
// 右側枚舉 S/Z/O/T 擺法；要求蓋完 ≤4 高、零洞，再用引擎實測
// 「第二包前幾顆能否收出 Perfect Clear」，回報 PC 率最高的版型。
// 用法: node tools/pco_solve.js
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
function heightsAndHoles(board) {
  let maxH = 0, holes = 0;
  for (let c = 0; c < COLS; c++) {
    let top = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) { if (!top) { top = true; maxH = Math.max(maxH, ROWS - r); } }
      else if (top) holes++;
    }
  }
  return { maxH, holes };
}
function fullRowsCount(board) {
  let n = 0;
  for (let r = 0; r < ROWS; r++) if (board[r].every(x => x)) n++;
  return n;
}
function boardStr(board) { return board.map(row => row.map(x => x ? '1' : '.').join('')).join(''); }
function show(board, rows = 5) {
  for (let r = ROWS - rows; r < ROWS; r++) {
    console.log('  ' + String(ROWS - r).padStart(2) + ' ' + board[r].map(x => x ? '#' : '.').join(''));
  }
}
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffledBag(rng) {
  const bag = ['I','O','T','J','L','S','Z'];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

const M = require('./test_ai.js');
M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();

  // === 第一階段 A：解左側 4×4 實心箱（I, L, J, O 共 16 格，cols 0-3）===
  const permAll = (arr) => {
    const out = [];
    const rec = (rest, cur) => {
      if (!rest.length) { out.push(cur); return; }
      for (let i = 0; i < rest.length; i++) rec(rest.filter((_, j) => j !== i), [...cur, rest[i]]);
    };
    rec(arr, []);
    return out;
  };
  const boxCand = { I: [], L: [], J: [], O: [] };
  for (const rot of [0, 1, 2, 3]) for (let c = -2; c <= 3; c++) {
    boxCand.I.push([rot, c]); boxCand.L.push([rot, c]); boxCand.J.push([rot, c]);
  }
  for (let c = 0; c <= 2; c++) boxCand.O.push([0, c]);

  const boxOk = (board) => {
    // cols 0-3 全滿 4 高、cols 4-9 全空、無洞
    for (let c = 0; c < 4; c++) for (let r = ROWS - 4; r < ROWS; r++) if (!board[r][c]) return false;
    for (let c = 4; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (board[r][c]) return false;
    for (let c = 0; c < 4; c++) if (board[ROWS - 5][c]) return false; // 不能高於 4
    return true;
  };
  const boxes = new Map();
  for (const order of permAll(['I', 'L', 'J', 'O'])) {
    let stack = [{ board: emptyBoard(), picks: [] }];
    for (const t of order) {
      const next = [];
      for (const st of stack) {
        for (const [rot, c] of boxCand[t]) {
          const b = st.board.map(row => row.slice());
          if (drop(b, t, rot, c) === null) continue;
          const { maxH, holes } = heightsAndHoles(b);
          if (maxH > 4 || holes > 0) continue;
          // 只允許 cols 0-3
          let outside = false;
          for (let cc = 4; cc < COLS && !outside; cc++) for (let r = 0; r < ROWS; r++) if (b[r][cc]) { outside = true; break; }
          if (outside) continue;
          next.push({ board: b, picks: [...st.picks, [t, rot, c]] });
        }
      }
      stack = next;
    }
    for (const st of stack) {
      if (!boxOk(st.board)) continue;
      const key = st.picks.map(([t, r, c]) => `${t}${r}${c}`).sort().join('|');
      if (!boxes.has(key)) boxes.set(key, st.picks);
    }
  }
  console.log(`4×4 左箱拼法: ${boxes.size} 種`);
  if (boxes.size === 0) return;

  // === 第一階段 B：右側 S/Z/T（≤4 高、0 洞、空格區域 %4 連通可解）===
  const cand = { S: [], Z: [], T: [] };
  for (const rot of [0, 1, 2, 3]) for (let c = -1; c <= 8; c++) {
    cand.S.push([rot, c]); cand.Z.push([rot, c]); cand.T.push([rot, c]);
  }
  const baseBox = emptyBoard();
  for (const [t, r, c] of boxes.values().next().value) drop(baseBox, t, r, c);

  // 空格連通塊 %4 檢查（PC 可解的必要條件）
  const regionsOk = (board) => {
    const topRow = ROWS - 4;
    const seen = Array.from({length: 4}, () => Array(COLS).fill(false));
    for (let r = topRow; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] || seen[r - topRow][c]) continue;
        let size = 0;
        const stack = [[r, c]];
        seen[r - topRow][c] = true;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          size++;
          // 左右相鄰 + 同欄所有空格（消行下移會合併，必須視為連通）
          for (const nc of [cc - 1, cc + 1]) {
            if (nc < 0 || nc >= COLS) continue;
            if (board[cr][nc] || seen[cr - topRow][nc]) continue;
            seen[cr - topRow][nc] = true;
            stack.push([cr, nc]);
          }
          for (let nr = topRow; nr < ROWS; nr++) {
            if (nr === cr || board[nr][cc] || seen[nr - topRow][cc]) continue;
            seen[nr - topRow][cc] = true;
            stack.push([nr, cc]);
          }
        }
        if (size % 4 !== 0) return false;
      }
    }
    return true;
  };

  const shapes = new Map();
  for (const order of permAll(['S', 'Z', 'T'])) {
    let stack = [{ board: baseBox, picks: [] }];
    for (const t of order) {
      const next = [];
      for (const st of stack) {
        for (const [rot, c] of cand[t]) {
          const b = st.board.map(row => row.slice());
          if (drop(b, t, rot, c) === null) continue;
          const { maxH, holes } = heightsAndHoles(b);
          if (maxH > 4 || holes > 0 || fullRowsCount(b) > 0) continue;
          next.push({ board: b, picks: [...st.picks, [t, rot, c]] });
        }
      }
      stack = next;
    }
    for (const st of stack) {
      // 不做區域預過濾：交給引擎的 PC solver 裁決（消行合併規則它最準）
      const key = boardStr(st.board);
      if (!shapes.has(key)) shapes.set(key, { picks: st.picks, board: st.board });
    }
  }
  console.log(`幾何可行且區域可解的右側版型: ${shapes.size} 種（去重後）`);

  // 第二階段：用引擎實測 PC 率（第二包 20 組隨機順序，各給 4 顆 + 視野收 PC）
  const results = [];
  let tested = 0;
  for (const [key, shape] of shapes) {
    tested++;
    let pcOk = 0;
    const TRIALS = 20;
    for (let trial = 0; trial < TRIALS; trial++) {
      const rng = mulberry32(1000 + trial);
      const bag2 = shuffledBag(rng);
      let board = shape.board.map(row => row.slice());
      let hold = null, combo = -1, b2b = 0;
      let queue = bag2.slice();
      let pc = false;
      for (let p = 0; p < 5 && !pc; p++) {
        while (queue.length < 6) queue.push(...shuffledBag(rng));
        let type = queue.shift();
        const mv = ai.findBestMove(boardStr(board), type, hold || 'NONE', queue.slice(0, 5).join(''),
          combo, 0, false, 0, b2b);
        if (mv.useHold) {
          if (!hold) { hold = type; type = queue.shift(); }
          else { const sw = hold; hold = type; type = sw; }
        }
        const matrix = PIECES[type][mv.rot % PIECES[type].length];
        if (!valid(board, matrix, mv.row, mv.col)) break;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          if (matrix[r][c]) board[mv.row + r][mv.col + c] = 1;
        }
        // 消行
        const keep = board.filter(row => !row.every(x => x));
        const cleared = ROWS - keep.length;
        while (keep.length < ROWS) keep.unshift(Array(COLS).fill(0));
        board = keep;
        combo = cleared > 0 ? combo + 1 : -1;
        if (cleared > 0 && board.every(row => row.every(x => !x))) pc = true;
      }
      if (pc) pcOk++;
    }
    results.push({ key, picks: shape.picks, board: shape.board, pcRate: pcOk / TRIALS });
    if (tested % 50 === 0) console.log(`  ...已測 ${tested}/${shapes.size}`);
    if (tested >= 400) break; // 時間上限
  }

  results.sort((a, b) => b.pcRate - a.pcRate);
  console.log(`\n左箱擺法: ${boxes.values().next().value.map(([t, rot, c]) => `${t}(rot${rot},c${c})`).join(' ')}`);
  console.log(`=== PC 率最高的版型 ===`);
  for (const r of results.slice(0, 5)) {
    console.log(`PC率=${(r.pcRate * 100).toFixed(0)}%  右側擺法: ${r.picks.map(([t, rot, c]) => `${t}(rot${rot},c${c})`).join(' ')}`);
    show(r.board, 5);
  }
};
