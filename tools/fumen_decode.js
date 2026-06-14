// fumen 解碼：把多頁 fumen 還原成逐步盤面 + 每步新增的 4 格（=該 piece 的精確落點）
// 用法: node tools/fumen_decode.js "<fumen字串>"
const { decoder } = require('tetris-fumen');

const raw = process.argv[2];
if (!raw) { console.error('需要 fumen 字串'); process.exit(1); }
const fumen = raw.replace(/\?/g, '');

const pages = decoder.decode(fumen);
console.log(`共 ${pages.length} 頁`);

const W = 10, H = 23;
const grid = (field) => {
  const g = [];
  for (let y = H - 1; y >= 0; y--) {
    let row = '';
    for (let x = 0; x < W; x++) row += field.at(x, y);
    g.push(row);
  }
  return g;
};

const cellsOf = (field) => {
  const s = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (field.at(x, y) !== '_') s.add(y * W + x);
  }
  return s;
};

pages.forEach((page, i) => {
  const op = page.operation;
  const opStr = op ? `${op.type} rot=${op.rotation} x=${op.x} y=${op.y}` : '(無操作)';
  console.log(`--- page ${i}: ${opStr} comment=${page.comment || ''}`);
  // 該步實際放上的 4 格 = 下一頁盤面 − 本頁盤面（考慮消行時跳過差分）
  if (op && i + 1 < pages.length) {
    const before = cellsOf(page.field);
    const after = cellsOf(pages[i + 1].field);
    if (after.size >= before.size) {
      const added = [...after].filter(k => !before.has(k)).map(k => `(${k % W},${Math.floor(k / W)})`);
      console.log('   added cells (x,y自底往上): ' + added.join(' '));
    } else {
      console.log('   （該步有消行，跳過差分）');
    }
  }
  const g = grid(page.field);
  for (let k = g.length - 8; k < g.length; k++) {
    console.log('   ' + String(g.length - k).padStart(2) + ' ' + g[k]);
  }
});
