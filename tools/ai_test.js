// AI 行為驗證 harness：用 node 直接驅動編譯好的 wasm AI，
// 完整重現 game.js AI 側的規則（BOMB 模式垃圾行、炸彈引爆、combo 攻擊表、
// SRS 踢牆、T-Spin 3-corner、B2B、完美清除、攻擊抵消、KO 復活）。
// AI 的落子用「路徑回放」執行——同時驗證 C++ 回傳的操作序列真的走得到。
// 用法: node tools/ai_test.js [wasm_module_path]

const MODULE_PATH = process.argv[2] || './test_ai.js';
const ROWS = 40, COLS = 10;

const PIECES = {
  I: [[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],[[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]],
  O: [[[1,1,0,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[1,1,0,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[1,1,0,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[1,1,0,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]]],
  T: [[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  J: [[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]]],
  L: [[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],[[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]]],
  S: [[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  Z: [[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]]],
};
const JLSTZ_KICKS = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};
const CLEAR_ATTACK = [0, 0, 1, 2, 4];
const COMBO_BONUS = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4];

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

class Sim {
  constructor(ai, keepEmpty, seed) {
    this.ai = ai;
    this.keepEmpty = keepEmpty;
    this.rng = mulberry32(seed);
    this.board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.combo = -1;
    this.b2b = 0;
    this.lastHole = -1;
    this.consecHoles = 0;
    this.pendingGarbage = 0;
    this.stats = {
      pieces: 0, clears: 0, linesCleared: 0, attack: 0, maxCombo: 0,
      bombsDetonated: 0, dead: false, kos: 0, invalidMoves: 0, holds: 0,
      comboRuns: [], firstBurstHeight: -1, thinkMs: 0,
      tspins: 0, tspinMinis: 0, maxB2b: 0, perfectClears: 0, pathMismatch: 0,
    };
    this._comboRun = 0;
    this.ensureQueue();
  }
  pullBag() {
    if (this.bag.length === 0) {
      this.bag = ['I','O','T','J','L','S','Z'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }
  ensureQueue() { while (this.queue.length < 5) this.queue.push(this.pullBag()); }
  valid(matrix, row, col) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!matrix[r][c]) continue;
      const br = row + r, bc = col + c;
      if (bc < 0 || bc >= COLS || br >= ROWS) return false;
      if (br >= 0 && this.board[br][bc]) return false;
    }
    return true;
  }
  boardStr() {
    let s = '';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = this.board[r][c];
      s += cell ? (cell === 'G' ? 'G' : (cell === 'B' ? 'B' : '1')) : '.';
    }
    return s;
  }
  colHeights() {
    const h = Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      if (this.board[r][c]) { h[c] = ROWS - r; break; }
    }
    return h;
  }
  garbageRows() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) if (this.board[r].some(x => x === 'G' || x === 'B')) n++;
    return n;
  }
  // 路徑回放（鏡像 game.js 的路徑播放器 + aiTryRotate）
  replayPath(type, path) {
    const st = { row: type === 'I' ? 18 : 19, col: 3, rot: 0, lastRotate: false, kickIdx: 0 };
    for (const a of path) {
      const matrix = PIECES[type][st.rot];
      if (a === 'D') {
        if (this.valid(matrix, st.row + 1, st.col)) st.row++;
        st.lastRotate = false;
      } else if (a === 'L' || a === 'R') {
        const nc = st.col + (a === 'R' ? 1 : -1);
        if (this.valid(matrix, st.row, nc)) st.col = nc;
        st.lastRotate = false;
      } else if (a === 'c' || a === 'z') {
        const from = st.rot;
        const to = (from + (a === 'c' ? 1 : 3)) % 4;
        const rotated = PIECES[type][to];
        if (type === 'O') {
          if (this.valid(rotated, st.row, st.col)) st.rot = to;
        } else {
          const kicks = type === 'I' ? I_KICKS[`${from}>${to}`] : JLSTZ_KICKS[`${from}>${to}`];
          for (let i = 0; i < kicks.length; i++) {
            const [dx, dy] = kicks[i];
            const nr = st.row - dy, nc = st.col + dx;
            if (this.valid(rotated, nr, nc)) {
              st.rot = to; st.row = nr; st.col = nc;
              st.lastRotate = true; st.kickIdx = i;
              break;
            }
          }
        }
      }
    }
    return st;
  }
  // T-Spin 判定（鏡像 game.js aiGetTSpinType）
  tSpinType(type, row, col, rot, lastRotate, kickIdx) {
    if (type !== 'T' || !lastRotate) return null;
    const r = row + 1, c = col + 1;
    const corners = [[r-1,c-1],[r-1,c+1],[r+1,c-1],[r+1,c+1]];
    const frontIdx = {0:[0,1],1:[1,3],2:[2,3],3:[0,2]}[rot];
    let filled = 0, front = 0, back = 0;
    for (let i = 0; i < 4; i++) {
      const [cr, cc] = corners[i];
      if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || this.board[cr][cc]) {
        filled++;
        if (frontIdx.includes(i)) front++; else back++;
      }
    }
    if (filled >= 3) {
      if (kickIdx === 4) return 'Full';
      if (front === 2) return 'Full';
      if (front === 1 && back === 2) return 'Mini';
    }
    return null;
  }
  step() {
    this.ensureQueue();
    let type = this.queue.shift();
    this.ensureQueue();
    const spawnRow = type === 'I' ? 18 : 19;
    if (!this.valid(PIECES[type][0], spawnRow, 3)) {
      if (this.garbageRows() > 0) {
        this.stats.kos++;
        this.board = this.board.filter(row => !row.some(x => x === 'G' || x === 'B'));
        while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
        this.combo = -1;
        this.b2b = 0;
        if (!this.valid(PIECES[type][0], spawnRow, 3)) { this.stats.dead = true; return false; }
      } else {
        this.stats.dead = true; return false;
      }
    }

    const t0 = process.hrtime.bigint();
    const mv = this.ai.findBestMove(
      this.boardStr(), type, this.hold || 'NONE', this.queue.slice(0, 5).join(''),
      this.combo, this.keepEmpty, false, this.pendingGarbage, this.b2b
    );
    this.stats.thinkMs += Number(process.hrtime.bigint() - t0) / 1e6;

    if (mv.useHold) {
      this.stats.holds++;
      if (!this.hold) { this.hold = type; type = this.queue.shift(); this.ensureQueue(); }
      else { const sw = this.hold; this.hold = type; type = sw; }
    }

    // 路徑回放執行（同時驗證 C++ 的路徑合法）
    let final = null;
    if (typeof mv.path === 'string' && mv.path.length > 0) {
      final = this.replayPath(type, mv.path);
      if (final.row !== mv.row || final.col !== mv.col || final.rot !== mv.rot) {
        this.stats.pathMismatch++;
        final = null; // 路徑跟宣稱的落點不一致，改用瞬移（鏡像 aiExecuteMove 防呆）
      }
    }
    if (!final) {
      if (this.valid(PIECES[type][mv.rot], mv.row, mv.col)) {
        final = { row: mv.row, col: mv.col, rot: mv.rot, lastRotate: false, kickIdx: 0 };
      } else {
        this.stats.invalidMoves++;
        let row = spawnRow, col = 3, rot = 0;
        if (!this.valid(PIECES[type][rot], row, col)) { this.stats.dead = true; return false; }
        while (this.valid(PIECES[type][rot], row + 1, col)) row++;
        final = { row, col, rot, lastRotate: false, kickIdx: 0 };
      }
    }

    this.lock(type, final);
    this.stats.pieces++;
    return true;
  }
  lock(type, st) {
    const tSpin = this.tSpinType(type, st.row, st.col, st.rot, st.lastRotate, st.kickIdx);
    const matrix = PIECES[type][st.rot];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!matrix[r][c]) continue;
      const br = st.row + r, bc = st.col + c;
      if (br >= 0 && br < ROWS) this.board[br][bc] = type;
    }
    const detonated = new Set();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!matrix[r][c]) continue;
      const bc = st.col + c;
      let checkR = st.row + r + 1;
      while (checkR < ROWS && this.board[checkR][bc] === 'B') { detonated.add(checkR); checkR++; }
    }
    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true, isGarbage = false;
      for (let c = 0; c < COLS; c++) {
        if (!this.board[r][c]) { full = false; break; }
        if (this.board[r][c] === 'G' || this.board[r][c] === 'B') isGarbage = true;
      }
      if (full && !isGarbage) fullRows.push(r);
    }
    const all = [...new Set([...fullRows, ...detonated])].sort((a, b) => a - b);
    if (all.length > 0) {
      let bombs = 0;
      all.forEach(r => { if (this.board[r].includes('B')) bombs++; });
      this.board = this.board.filter((_, i) => !all.includes(i));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
      this.combo++;
      this._comboRun++;
      if (this._comboRun === 1 && this.stats.firstBurstHeight < 0) {
        this.stats.firstBurstHeight = Math.max(...this.colHeights());
      }
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.stats.clears++;
      this.stats.linesCleared += fullRows.length;
      this.stats.bombsDetonated += bombs;

      // 攻擊計算（鏡像新版 aiLockPiece：T-Spin / B2B / PC）
      let attack;
      let difficult = false;
      if (tSpin === 'Full') { attack = [0,2,4,6][fullRows.length] || 0; difficult = true; }
      else if (tSpin === 'Mini') { attack = [0,1,0,0][fullRows.length] || 0; difficult = true; }
      else { attack = CLEAR_ATTACK[Math.min(fullRows.length, 4)]; if (fullRows.length === 4) difficult = true; }
      if (difficult) {
        if (fullRows.length > 0) {
          if (this.b2b > 0) {
            if (!tSpin && fullRows.length === 4) attack = 6;
            else if (tSpin === 'Mini' && fullRows.length === 1) attack = 2;
            else if (tSpin === 'Full' && fullRows.length === 1) attack = 3;
            else if (tSpin === 'Full' && fullRows.length === 2) attack = 6;
            else if (tSpin === 'Full' && fullRows.length === 3) attack = 9;
          }
          this.b2b++;
          this.stats.maxB2b = Math.max(this.stats.maxB2b, this.b2b);
        }
      } else if (fullRows.length > 0) {
        this.b2b = 0;
      }
      if (tSpin === 'Full' && fullRows.length > 0) this.stats.tspins++;
      if (tSpin === 'Mini' && fullRows.length > 0) this.stats.tspinMinis++;

      if (this.combo > 0) attack += COMBO_BONUS[Math.min(this.combo, 10)];
      attack += bombs;
      if (this.board.every(row => row.every(cell => !cell))) {
        attack += 10;
        this.stats.perfectClears++;
      }
      this.stats.attack += attack;
      const offset = Math.min(attack, this.pendingGarbage);
      this.pendingGarbage -= offset;
    } else {
      this.combo = -1;
      if (this._comboRun > 0) { this.stats.comboRuns.push(this._comboRun); this._comboRun = 0; }
    }
    if (this.pendingGarbage > 0) {
      for (let i = 0; i < this.pendingGarbage; i++) {
        if (this.consecHoles >= 2 || this.lastHole === -1) {
          let h; do { h = Math.floor(this.rng() * COLS); } while (h === this.lastHole);
          this.lastHole = h; this.consecHoles = 0;
        }
        this.board.shift();
        const newRow = Array(COLS).fill('G');
        newRow[this.lastHole] = 'B';
        this.board.push(newRow);
        this.consecHoles++;
      }
      this.pendingGarbage = 0;
    }
  }
  finish() {
    if (this._comboRun > 0) { this.stats.comboRuns.push(this._comboRun); this._comboRun = 0; }
  }
}

function runScenario(M, name, keepEmpty, opts) {
  const { pieces = 250, garbageEvery = 0, garbageAmount = 0, seed = 42 } = opts || {};
  const ai = new M.BrickadeAI();
  const sim = new Sim(ai, keepEmpty, seed);
  for (let i = 0; i < pieces; i++) {
    if (garbageEvery > 0 && i > 0 && i % garbageEvery === 0) sim.pendingGarbage += garbageAmount;
    if (!sim.step()) break;
  }
  sim.finish();
  const s = sim.stats;
  const runs = s.comboRuns.slice().sort((a, b) => b - a);
  const heights = sim.colHeights();
  console.log(
    `${name.padEnd(24)} pieces=${String(s.pieces).padStart(3)} dead=${s.dead ? 'YES' : 'no '} kos=${s.kos}` +
    ` atk=${String(s.attack).padStart(4)} maxC=${String(s.maxCombo).padStart(2)}` +
    ` runs=[${runs.slice(0, 4).join(',')}]` +
    ` tspin=${s.tspins}/${s.tspinMinis} b2b=${s.maxB2b} pc=${s.perfectClears}` +
    ` bombs=${s.bombsDetonated} mismatch=${s.pathMismatch} invalid=${s.invalidMoves}` +
    ` think=${(s.thinkMs / Math.max(s.pieces, 1)).toFixed(1)}ms endH=${Math.max(...heights)}`
  );
  return s;
}

const M = require(MODULE_PATH);
M.onRuntimeInitialized = () => {
  console.log('=== 無干擾蓄力測試 ===');
  for (const ke of [4, 3, 2, 1]) {
    runScenario(M, `vacuum ${ke}-wide`, ke, { pieces: 250, seed: 42 });
  }
  runScenario(M, 'vacuum auto', 0, { pieces: 250, seed: 42 });

  console.log('=== 中等壓力（每 15 顆收 2 行垃圾）===');
  for (const ke of [4, 2]) {
    runScenario(M, `pressure ${ke}-wide`, ke, { pieces: 250, garbageEvery: 15, garbageAmount: 2, seed: 7 });
  }
  runScenario(M, 'pressure auto', 0, { pieces: 250, garbageEvery: 15, garbageAmount: 2, seed: 7 });

  console.log('=== 高壓力（每 10 顆收 4 行垃圾）===');
  runScenario(M, 'heavy 4-wide', 4, { pieces: 250, garbageEvery: 10, garbageAmount: 4, seed: 13 });
  runScenario(M, 'heavy auto', 0, { pieces: 250, garbageEvery: 10, garbageAmount: 4, seed: 13 });

  console.log('=== 不同 seed 的 4-wide / auto 穩定性 ===');
  for (const seed of [1, 2, 3, 4, 5]) {
    runScenario(M, `vacuum 4-wide s${seed}`, 4, { pieces: 200, seed });
  }
  for (const seed of [1, 2, 3]) {
    runScenario(M, `vacuum auto s${seed}`, 0, { pieces: 200, seed });
  }
};
