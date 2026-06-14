// 開局書步驟產生器：把 (type, rot, col) 序列模擬直落，輸出含精確落點格子的步驟 JSON。
// 落點格子讓書引擎在執行時做「落地驗證」：支撐還沒蓋好時格子對不上就先跳過/hold，
// 不需要手寫依賴關係。
// 用法: node tools/book_gen.js
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
function valid(b, m, row, col) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!m[r][c]) continue;
    const br = row + r, bc = col + c;
    if (bc < 0 || bc >= COLS || br >= ROWS) return false;
    if (br >= 0 && b[br][bc]) return false;
  }
  return true;
}
function dropCells(b, type, rot, col) {
  const m = PIECES[type][rot % PIECES[type].length];
  let row = type === 'I' ? 18 : 19;
  if (!valid(b, m, row, col)) return null;
  while (valid(b, m, row + 1, col)) row++;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (m[r][c]) { b[row + r][col + c] = 1; cells.push((row + r) * COLS + (col + c)); }
  }
  return cells.sort((a, b2) => a - b2);
}
function show(b, rows) {
  for (let r = ROWS - rows; r < ROWS; r++) {
    console.log('  ' + String(ROWS - r).padStart(2) + ' ' + b[r].map(x => x ? '#' : '.').join(''));
  }
}

// 各書的建造序（依賴順）。座標已驗證：
// TKI3 = tools/tki_solve.js 求解；PCO / DT = 正典 fumen 解碼還原
const BOOKS = {
  TKI3: { holdHint: 'T', seq: [
    ['I', 0, 3], ['L', 1, -1], ['O', 0, 8], ['Z', 0, 3], ['S', 1, 4], ['J', 1, 6],
  ]},
  PCO: { holdHint: 'I', seq: [
    ['J', 0, 0], ['O', 0, 1], ['L', 2, 0], ['Z', 0, 6], ['T', 3, 8], ['S', 0, 7],
  ]},
  DT: { holdHint: 'T2', seq: [ // 第一包（含 T 當屋簷）+ 第二包（T 留給 TSD）
    ['I', 1, 4], ['J', 3, 4], ['L', 1, 6], ['Z', 1, 2], ['S', 1, 7], ['O', 0, 0], ['T', 0, 3],
    ['J', 1, -1], ['L', 3, 2], ['O', 0, 7], ['I', 1, 7], ['Z', 0, 4], ['S', 0, 7],
  ]},
};

// 對一組步驟（已知 cells）窮舉所有擺放順序，回傳每一步的「真前置集合」：
// prereq[i] = 在所有合法順序中都出現在 i 之前的步驟（含「先放 i 會堵死 j」的情況）
function computePrereqs(steps, baseBoard) {
  const n = steps.length;
  const valid = [];
  const perm = (rest, cur) => {
    if (!rest.length) { valid.push(cur); return; }
    for (let k = 0; k < rest.length; k++) {
      // 剪枝：先試這一步在目前前綴下是否合法
      const order = [...cur, rest[k]];
      const b = baseBoard.map(r => r.slice());
      let ok = true;
      for (const idx of order) {
        const s = steps[idx];
        const cells = dropCells(b, s.t, s.rot, s.col);
        if (!cells || cells.join() !== s.cells.join()) { ok = false; break; }
      }
      if (!ok) continue;
      perm(rest.filter((_, j) => j !== k), order);
    }
  };
  perm([...Array(n).keys()], []);
  if (valid.length === 0) return null;
  const prereq = [];
  for (let i = 0; i < n; i++) {
    let before = null;
    for (const order of valid) {
      const pos = order.indexOf(i);
      const set = new Set(order.slice(0, pos));
      if (before === null) before = set;
      else before = new Set([...before].filter(x => set.has(x)));
    }
    prereq.push([...before].sort((a, b) => a - b));
  }
  return { prereq, validOrders: valid.length };
}

for (const [name, book] of Object.entries(BOOKS)) {
  const b = emptyBoard();
  const steps = [];
  let ok = true;
  for (const [t, rot, col] of book.seq) {
    const cells = dropCells(b, t, rot, col);
    if (!cells) { console.log(`${name}: ${t}(rot${rot},c${col}) 放不下！`); ok = false; break; }
    steps.push({ t, rot, col, cells });
  }
  console.log(`=== ${name} ${ok ? 'OK' : 'FAILED'}（${steps.length} 步）===`);
  show(b, 8);
  if (!ok) { console.log(''); continue; }

  // 前置集合：DT 分兩包算（第二包以完成的第一包為底），其他一次算完
  if (name === 'DT') {
    const bag1 = steps.slice(0, 7), bag2 = steps.slice(7);
    const r1 = computePrereqs(bag1, emptyBoard());
    const base1 = emptyBoard();
    for (const s of bag1) dropCells(base1, s.t, s.rot, s.col);
    const r2 = computePrereqs(bag2, base1);
    if (!r1 || !r2) { console.log('前置計算失敗'); continue; }
    bag1.forEach((s, i) => { s.needs = r1.prereq[i]; });
    bag2.forEach((s, i) => { s.needs = [...r2.prereq[i].map(x => x + 7), 0, 1, 2, 3, 4, 5, 6].sort((a, b) => a - b); });
    // 第二包一律要求第一包全完成（bag 邊界天然如此，安全簡化）
    console.log(`合法順序：bag1=${r1.validOrders} bag2=${r2.validOrders}`);
  } else {
    const r = computePrereqs(steps, emptyBoard());
    if (!r) { console.log('前置計算失敗'); continue; }
    steps.forEach((s, i) => { s.needs = r.prereq[i]; });
    console.log(`合法順序：${r.validOrders}`);
  }
  console.log(JSON.stringify(steps));
  console.log('');
}
