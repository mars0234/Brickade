// ai_worker.js

// 1. 在背景載入你的 C++ WASM 模組
importScripts('brickade_ai.js');

let wasmAI = null;

// 當 WASM 準備好時
Module.onRuntimeInitialized = () => {
  wasmAI = new Module.BrickadeAI();
  // 告訴主程式：「我準備好了！」
  postMessage({ type: 'READY' });
};

// 2. 監聽主程式傳來的盤面資料
self.onmessage = function(e) {
  if (e.data.type === 'THINK' && wasmAI) {
    try {
      const { boardStr, currentPiece, holdPiece, queueStr, aiCombo, keepEmpty, holdUsed, incomingGarbage, b2b } = e.data.payload;

      // 執行極度消耗 CPU 的思考運算 (這時主畫面依然能保持 60 FPS)
      const bestMove = wasmAI.findBestMove(boardStr, currentPiece, holdPiece, queueStr, aiCombo, keepEmpty, !!holdUsed, incomingGarbage | 0, b2b | 0);

      // 算完後，把結果丟回給主程式
      postMessage({
        type: 'RESULT',
        bestMove: {
          col: bestMove.col,
          row: bestMove.row,
          rot: bestMove.rot,
          useHold: bestMove.useHold,
          path: bestMove.path || ''   // BFS 操作序列（L/R/D/c/z），照著播放才能做出 tuck 與 spin
        }
      });
    } catch (err) {
      console.error("⚠️ WASM AI 思考時發生錯誤:", err);
      // 回傳一個預設結果，讓 AI 不會卡死
      postMessage({
        type: 'RESULT',
        bestMove: { col: 3, row: 19, rot: 0, useHold: false }
      });
    }
  }
};
