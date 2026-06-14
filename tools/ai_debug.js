// 單場慢動作解剖：印出每一手後的盤面（下半部）
// 用法: node tools/ai_debug.js ./test_ai.js <keepEmpty> <seed> [pieces]
const path = require('path');
const { execSync } = require('child_process');

const ROWS = 40, COLS = 10;
const MODULE_PATH = process.argv[2] || './test_ai.js';
const KEEP_EMPTY = parseInt(process.argv[3] || '4');
const SEED = parseInt(process.argv[4] || '5');
const MAX_PIECES = parseInt(process.argv[5] || '120');

// 重用 harness 的 Sim：直接 require
const harness = path.join(__dirname, 'ai_test.js');
const src = require('fs').readFileSync(harness, 'utf8');
// 取出 Sim 與常數定義（移除最後的執行區塊）
const body = src.slice(0, src.indexOf('function runScenario'));
const sandbox = { require, process, console, module: {} };
const fn = new Function('require', 'process', 'console', body + '\nreturn { Sim, PIECES };');
const { Sim } = fn(require, process, console);

const M = require(MODULE_PATH);
M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  const sim = new Sim(ai, KEEP_EMPTY, SEED);
  for (let i = 0; i < MAX_PIECES; i++) {
    const alive = sim.step();
    const h = Math.max(...sim.colHeights());
    if (h >= 14 || !alive || i >= MAX_PIECES - 20) {
      console.log(`--- piece ${i} combo=${sim.combo} maxH=${h} hold=${sim.hold} queue=${sim.queue.join('')} ---`);
      for (let r = ROWS - 22; r < ROWS; r++) {
        let line = '';
        for (let c = 0; c < COLS; c++) {
          const cell = sim.board[r][c];
          line += cell ? (cell === 'G' ? 'G' : cell === 'B' ? 'B' : '#') : '.';
        }
        console.log(`${String(ROWS - r).padStart(2)} ${line}`);
      }
    }
    if (!alive) { console.log('DEAD at piece', i); break; }
  }
  sim.finish();
  console.log(JSON.stringify(sim.stats));
};
