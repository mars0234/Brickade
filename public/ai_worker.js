// ai_worker.js

// 1. 在背景載入你的 C++ WASM 模組
importScripts('tetris_ai.js');

let wasmAI = null;

// 當 WASM 準備好時
Module.onRuntimeInitialized = () => {
  wasmAI = new Module.TetrisAI();
  // 告訴主程式：「我準備好了！」
  postMessage({ type: 'READY' });
};

// 2. 監聽主程式傳來的盤面資料
self.onmessage = function(e) {
  if (e.data.type === 'THINK' && wasmAI) {
    const { boardStr, currentPiece, holdPiece, queueStr, aiCombo, keepEmpty } = e.data.payload;
    
    // 執行極度消耗 CPU 的思考運算 (這時主畫面依然能保持 60 FPS)
    const bestMove = wasmAI.findBestMove(boardStr, currentPiece, holdPiece, queueStr, aiCombo, keepEmpty);
    
    // 算完後，把結果丟回給主程式
    postMessage({ 
      type: 'RESULT', 
      bestMove: {
        col: bestMove.col,
        row: bestMove.row,
        rot: bestMove.rot,
        useHold: bestMove.useHold
      }
    });
  }
};