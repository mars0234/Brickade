// 驗證正典 PCO 版型（fumen 還原）：hold I + 第二包，引擎能收 PC 的比例
const ROWS = 40, COLS = 10;
const M = require('./test_ai.js');

// 正典 PCO 第一包（hold I）：
//  4 LLL_____SS
//  3 LOO____SST
//  2 JOO___ZZTT
//  1 JJJ____ZZT
const displayRows = [
  'JJJ....ZZT', // 1（底）
  'JOO...ZZTT', // 2
  'LOO....SST', // 3
  'LLL.....SS', // 4
];
let board = [];
for (let r = 0; r < ROWS; r++) board.push('.'.repeat(COLS));
displayRows.forEach((row, i) => { board[ROWS - 1 - i] = row.replace(/[A-Z]/g, '1'); });
const boardStr0 = board.join('');

const PIECES_KEYS = ['I','O','T','J','L','S','Z'];
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const PIECES = {
  I: [[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],[[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]],
  O: [[[1,1,0,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]]],
  T: [[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  J: [[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]]],
  L: [[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],[[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]]],
  S: [[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  Z: [[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]]],
};
function shuffledBag(rng) {
  const bag = [...PIECES_KEYS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
function valid(b, m, row, col) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!m[r][c]) continue;
    const br = row + r, bc = col + c;
    if (bc < 0 || bc >= COLS || br >= ROWS) return false;
    if (br >= 0 && b[br][bc]) return false;
  }
  return true;
}

M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  let pcOk = 0;
  const TRIALS = 60;
  let totalMs = 0;
  for (let trial = 0; trial < TRIALS; trial++) {
    const rng = mulberry32(100 + trial);
    const bag2 = shuffledBag(rng);
    // 盤面 → 陣列
    let b = [];
    for (let r = 0; r < ROWS; r++) b.push(boardStr0.slice(r * COLS, r * COLS + 10).split('').map(x => x === '1' ? 1 : 0));
    let hold = 'I'; // ★ 第一包把 I 留在 hold
    let queue = [...bag2];
    let combo = -1, b2b = 0, pc = false;
    for (let p = 0; p < 6 && !pc; p++) {
      while (queue.length < 6) queue.push(...shuffledBag(rng));
      let type = queue.shift();
      const bs = b.map(row => row.map(x => x ? '1' : '.').join('')).join('');
      const t0 = Date.now();
      const mv = ai.findBestMove(bs, type, hold, queue.slice(0, 5).join(''), combo, 0, false, 0, b2b);
      totalMs += Date.now() - t0;
      if (mv.useHold) {
        if (!hold) { hold = type; type = queue.shift(); }
        else { const sw = hold; hold = type; type = sw; }
      }
      const matrix = PIECES[type][mv.rot % PIECES[type].length];
      if (!valid(b, matrix, mv.row, mv.col)) break;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (matrix[r][c]) b[mv.row + r][mv.col + c] = 1;
      }
      const keep = b.filter(row => !row.every(x => x));
      const cleared = ROWS - keep.length;
      while (keep.length < ROWS) keep.unshift(Array(COLS).fill(0));
      b = keep;
      combo = cleared > 0 ? combo + 1 : -1;
      if (cleared > 0 && b.every(row => row.every(x => !x))) pc = true;
    }
    if (pc) pcOk++;
  }
  console.log(`正典 PCO（hold I + 第二包）：PC 成功 ${pcOk}/${TRIALS} = ${(pcOk / TRIALS * 100).toFixed(0)}%（文獻值 84.6%）`);
  console.log(`平均思考 ${(totalMs / (TRIALS * 4)).toFixed(0)}ms/手`);
};
