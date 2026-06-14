// 長時間浸泡測試：多 seed × 長局，確認沒有偶發的自殺局
const fs = require('fs');
const path = require('path');
const ROWS = 40, COLS = 10;

const src = fs.readFileSync(path.join(__dirname, 'ai_test.js'), 'utf8');
const body = src.slice(0, src.indexOf('function runScenario'));
const fn = new Function('require', 'process', 'console', body + '\nreturn { Sim };');
const { Sim } = fn(require, process, console);

const M = require(process.argv[2] || './test_ai.js');
M.onRuntimeInitialized = () => {
  const ai = new M.BrickadeAI();
  let totalDeaths = 0;
  const summary = [];
  for (const [label, ke, gEvery, gAmt] of [
    ['vacuum-4w', 4, 0, 0], ['vacuum-2w', 2, 0, 0], ['vacuum-1w', 1, 0, 0],
    ['press-4w', 4, 15, 2], ['press-3w', 3, 15, 2],
  ]) {
    for (let seed = 10; seed < 20; seed++) {
      const sim = new Sim(ai, ke, seed);
      for (let i = 0; i < 300; i++) {
        if (gEvery > 0 && i > 0 && i % gEvery === 0) sim.pendingGarbage += gAmt;
        if (!sim.step()) break;
      }
      sim.finish();
      const s = sim.stats;
      if (s.dead) totalDeaths++;
      summary.push(`${label} s${seed}: pieces=${s.pieces} dead=${s.dead?'YES':'no'} kos=${s.kos} atk=${s.attack} maxC=${s.maxCombo}`);
    }
  }
  const deadLines = summary.filter(l => l.includes('YES'));
  console.log(`=== 浸泡測試完成：${summary.length} 局，死亡 ${totalDeaths} 局 ===`);
  if (deadLines.length) { console.log('死亡局：'); deadLines.forEach(l => console.log('  ' + l)); }
  // 統計各情境平均
  for (const label of ['vacuum-4w', 'vacuum-2w', 'vacuum-1w', 'press-4w', 'press-3w']) {
    const rows = summary.filter(l => l.startsWith(label));
    const avg = (key) => (rows.reduce((a, l) => a + parseInt(l.match(new RegExp(`${key}=(\\d+)`))[1]), 0) / rows.length).toFixed(1);
    console.log(`${label}: avgAtk=${avg('atk')} avgMaxCombo=${avg('maxC')} deaths=${rows.filter(l=>l.includes('YES')).length}/10`);
  }
};
