// 開局書 E2E 測試（三本書）：鏡像 game.js 的步驟制書引擎，
// 跑多 seed 驗證：完成率 / 各書的收尾成功率 / 死亡。
// 用法: node tools/book_test.js [wasm] [seeds]
const fs = require('fs');
const path = require('path');
const ROWS = 40, COLS = 10;

const src = fs.readFileSync(path.join(__dirname, 'ai_test.js'), 'utf8');
const body = src.slice(0, src.indexOf('function runScenario'));
const fn = new Function('require', 'process', 'console', body + '\nreturn { Sim, PIECES };');
const { Sim, PIECES } = fn(require, process, console);

// 與 game.js AI_OPENER_BOOKS 同步（tools/book_gen.js 產生）
const BOOKS = {
  TKI3: [{"t":"I","rot":0,"col":3,"cells":[393,394,395,396],"needs":[]},{"t":"L","rot":1,"col":-1,"cells":[370,380,390,391],"needs":[]},{"t":"O","rot":0,"col":8,"cells":[388,389,398,399],"needs":[]},{"t":"Z","rot":0,"col":3,"cells":[373,374,384,385],"needs":[0]},{"t":"S","rot":1,"col":4,"cells":[365,375,376,386],"needs":[0,3]},{"t":"J","rot":1,"col":6,"cells":[377,378,387,397],"needs":[2]}],
  PCO: [{"t":"J","rot":0,"col":0,"cells":[380,390,391,392],"needs":[]},{"t":"O","rot":0,"col":1,"cells":[371,372,381,382],"needs":[0]},{"t":"L","rot":2,"col":0,"cells":[360,361,362,370],"needs":[0,1]},{"t":"Z","rot":0,"col":6,"cells":[386,387,397,398],"needs":[]},{"t":"T","rot":3,"col":8,"cells":[379,388,389,399],"needs":[3]},{"t":"S","rot":0,"col":7,"cells":[368,369,377,378],"needs":[3,4]},{"t":"I","rot":1,"col":1,"cells":[363,373,383,393],"needs":[],"optional":true}],
  DT: [{"t":"I","rot":1,"col":4,"cells":[366,376,386,396],"needs":[]},{"t":"J","rot":3,"col":4,"cells":[375,385,394,395],"needs":[]},{"t":"L","rot":1,"col":6,"cells":[377,387,397,398],"needs":[]},{"t":"Z","rot":1,"col":2,"cells":[374,383,384,393],"needs":[1]},{"t":"S","rot":1,"col":7,"cells":[378,388,389,399],"needs":[2]},{"t":"O","rot":0,"col":0,"cells":[380,381,390,391],"needs":[]},{"t":"T","rot":0,"col":3,"cells":[354,363,364,365],"needs":[1,3]},{"t":"J","rot":1,"col":-1,"cells":[350,351,360,370],"needs":[0,1,2,3,4,5,6]},{"t":"L","rot":3,"col":2,"cells":[332,333,343,353],"needs":[0,1,2,3,4,5,6]},{"t":"O","rot":0,"col":7,"cells":[357,358,367,368],"needs":[0,1,2,3,4,5,6]},{"t":"I","rot":1,"col":7,"cells":[349,359,369,379],"needs":[0,1,2,3,4,5,6]},{"t":"Z","rot":0,"col":4,"cells":[344,345,355,356],"needs":[0,1,2,3,4,5,6]},{"t":"S","rot":0,"col":7,"cells":[338,339,347,348],"needs":[0,1,2,3,4,5,6,9,10]}],
};

const M = require(process.argv[2] || './test_ai.js');
const SEEDS = parseInt(process.argv[3] || '100');

M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();

  for (const [name, steps] of Object.entries(BOOKS)) {
    let completed = 0, aborted = 0, finishOk = 0, finishMiss = 0, deaths = 0;
    let sumBookPieces = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const sim = new Sim(ai, 0, seed);
      const done = [];
      let bookActive = true, bookDone = false, bookDonePieces = -1;

      const tryPlace = (type, allowOptional) => {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (done[i] || s.t !== type) continue;
          if (s.optional && !allowOptional) continue;
          if (s.needs && s.needs.some(n => !done[n])) continue;
          const mat = PIECES[type][s.rot];
          let row = type === 'I' ? 18 : 19;
          if (!sim.valid(mat, row, s.col)) continue;
          while (sim.valid(mat, row + 1, s.col)) row++;
          const got = [];
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            if (mat[r][c]) got.push((row + r) * COLS + (s.col + c));
          }
          got.sort((a, b) => a - b);
          if (got.length === s.cells.length && got.every((v, j) => v === s.cells[j])) {
            return { idx: i, mv: { col: s.col, row, rot: s.rot, useHold: false, path: '' } };
          }
        }
        return null;
      };

      const bookMove = (curType) => {
        if (steps.every((s2, i) => done[i] || s2.optional)) { bookActive = false; return null; }
        let r = tryPlace(curType, false);
        if (r) { done[r.idx] = true; return r.mv; }
        if (sim.hold === null) {
          const next = sim.queue[0];
          if (next) {
            r = tryPlace(next, false);
            if (r) { done[r.idx] = true; r.mv.useHold = true; return r.mv; }
          }
        } else {
          r = tryPlace(sim.hold, true);
          if (r) { done[r.idx] = true; r.mv.useHold = true; return r.mv; }
        }
        bookActive = false;
        return null;
      };

      // 收尾成功判準
      let sawTsd = false, sawTst = false, sawPc = false;
      const horizon = name === 'DT' ? 40 : 30;
      for (let i = 0; i < horizon; i++) {
        sim.ensureQueue();
        let type = sim.queue.shift();
        sim.ensureQueue();
        const spawnRow = type === 'I' ? 18 : 19;
        if (!sim.valid(PIECES[type][0], spawnRow, 3)) { sim.stats.dead = true; break; }

        let mv = null;
        if (bookActive) {
          mv = bookMove(type);
          if (!bookActive && steps.every((s2, k) => done[k] || s2.optional)) {
            bookDone = true;
            if (bookDonePieces < 0) bookDonePieces = sim.stats.pieces;
          }
        }
        if (!mv) {
          mv = sim.ai.findBestMove(sim.boardStr(), type, sim.hold || 'NONE', sim.queue.slice(0, 5).join(''),
            sim.combo, 0, false, 0, sim.b2b);
        }
        if (mv.useHold) {
          if (!sim.hold) { sim.hold = type; type = sim.queue.shift(); sim.ensureQueue(); }
          else { const sw = sim.hold; sim.hold = type; type = sw; }
        }
        let final = null;
        if (typeof mv.path === 'string' && mv.path.length > 0) {
          final = sim.replayPath(type, mv.path);
          if (final.row !== mv.row || final.col !== mv.col || final.rot !== mv.rot) final = null;
        }
        if (!final) {
          if (sim.valid(PIECES[type][mv.rot % PIECES[type].length], mv.row, mv.col)) {
            final = { row: mv.row, col: mv.col, rot: mv.rot, lastRotate: false, kickIdx: 0 };
          } else { sim.stats.dead = true; break; }
        }
        const beforeT = sim.stats.tspins;
        const beforeLines = sim.stats.linesCleared;
        const beforePc = sim.stats.perfectClears;
        sim.lock(type, final);
        sim.stats.pieces++;

        if (bookDone) {
          if (sim.stats.tspins > beforeT) {
            const gained = sim.stats.linesCleared - beforeLines;
            if (gained === 2) sawTsd = true;
            if (gained === 3) sawTst = true;
          }
          if (sim.stats.perfectClears > beforePc) sawPc = true;
          const since = sim.stats.pieces - bookDonePieces;
          if (name === 'TKI3' && (sawTsd || since > 12)) break;
          if (name === 'PCO' && (sawPc || since > 6)) break;
          if (name === 'DT' && ((sawTsd && sawTst) || since > 18)) break;
        }
      }
      if (sim.stats.dead) deaths++;
      if (bookDone) {
        completed++;
        sumBookPieces += bookDonePieces;
        const ok = name === 'TKI3' ? sawTsd : name === 'PCO' ? sawPc : (sawTsd && sawTst);
        if (ok) finishOk++; else finishMiss++;
      } else aborted++;
    }
    const crit = { TKI3: 'TSD≤12顆', PCO: 'PC≤6顆', DT: 'TSD+TST≤18顆' }[name];
    console.log(`${name.padEnd(5)} 完成 ${completed}/${SEEDS}（棄書 ${aborted}）` +
      ` 收尾成功[${crit}] ${finishOk}/${completed || 1}` +
      ` 死亡 ${deaths}` +
      (completed ? ` 平均蓋完顆數 ${(sumBookPieces / completed).toFixed(1)}` : ''));
  }
};
