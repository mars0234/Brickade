# AI 測試工具

這些工具在 node 環境直接驅動編譯好的 wasm AI，完整重現 `game.js` AI 側的
規則（BOMB 模式垃圾行、炸彈引爆、combo 攻擊表、攻擊抵消、KO 復活），
用來在不開瀏覽器的情況下驗證 AI 行為。

## 前置：編譯測試用 wasm

```
call %USERPROFILE%\emsdk\emsdk_env.bat
emcc src/ai.cpp -O3 --bind -s ALLOW_MEMORY_GROWTH=1 -o tools/test_ai.js
```

（正式版則是 `npm run build:ai`，輸出到 `src/brickade_ai.js`）

## 工具

| 指令 | 用途 |
|---|---|
| `node tools/ai_test.js` | 多情境行為測試：各 wide 模式蓄力/壓力/高壓 + 多 seed 穩定性 |
| `node tools/ai_soak.js` | 浸泡測試：5 情境 × 10 seeds × 300 顆，看死亡率 |
| `node tools/ai_debug.js ./test_ai.js <keepEmpty> <seed> [pieces]` | 單局慢動作，印出每一手後的盤面（解剖死因用） |
| `node tools/ai_replay.js` | 把特定盤面餵給 AI 看它的決策（盤面寫在檔案裡） |
| `node tools/book_test.js ./test_ai.js 100` | 三本開局書（TKI3/PCO/DT）E2E：完成率 / 收尾轉換率 / 死亡 |
| `node tools/book_gen.js` | 開局書步驟產生器：模擬直落算出每步精確格子 + 窮舉合法順序算前置集合 |
| `node tools/fumen_decode.js "<v115@...>"` | fumen 解碼（官方 tetris-fumen 庫）：還原版型與逐步落點 |
| `node tools/pc_unit.js` | 引擎內建 Perfect Clear 求解器的單元測試 |
| `node tools/pco_verify.js` | 正典 PCO 版型的 PC 轉換率實測 |
| `node tools/tki_solve.js` / `pco_solve.js` / `dt_solve.js` | 版型求解器（枚舉 + 引擎驗證），新開局沒有 fumen 時用 |

## 開局書版型更新流程

1. 拿到 fumen → `fumen_decode.js` 還原落點；或用求解器枚舉驗證。
2. 把 (type, rot, col) 序列填進 `book_gen.js` 的 BOOKS → 跑出含 cells/needs 的步驟 JSON。
3. 貼進 `game.js` 的 `AI_OPENER_BOOKS` 與 `book_test.js` 的 BOOKS。
4. `book_test.js` 跑完成率與收尾轉換率；`ai_test.js` 跑回歸。

## 重要指標怎麼讀（ai_test.js 輸出）

- `dead` / `kos`：自殺與被 KO 次數。vacuum（無干擾）情境必須 0 死亡。
- `maxC` / `runs`：最高連擊與前幾長的 combo 段。4-wide vacuum 應在 9~14。
- `tspin=x/y`：Full T-Spin / Mini 次數。auto 模式 vacuum 應有 10+ 個 Full。
- `b2b`：最長 Back-to-Back 連鎖（1-wide 打 Quad 流會到 5+）。
- `pc`：完美清除次數。
- `bombs`：引爆的炸彈行數（會不會挖垃圾）。
- `mismatch`：C++ 路徑回放後與宣稱落點不符的次數，必須 0。
- `invalid`：C++ 回傳非法落點的次數，必須 0。
