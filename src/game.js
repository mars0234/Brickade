(() => {
  const GAME_VERSION = 'v2.4.0'; // 目前遊戲版本號
  const COLS = 10;
  const ROWS = 40;           // 陣列總高度改為 40 (官方標準)
  const VISIBLE_ROWS = 20;   // 畫面只顯示下半部 20 行
  const SIZE = 34;
  const BG = '#06004f';
  const CELL_BG = '#0b0767';
  const COLORS = {
    I:'#38bdee', J:'#2a7fff', L:'#ff9800', O:'#f7dd16',
    S:'#48d62f', T:'#b144f7', Z:'#ff0d62',
    G:'#666666', // 新垃圾行的灰色
    B:'#ff1111', // 炸彈的亮紅色
    W:'#3a2d6e'  // Combo Room 的牆壁（中度紫，與背景區分、又不搶玩家視線）
  };

  // --- 高 DPI (Retina / iPhone) 顯示支援：把 canvas 內部解析度提升到 DPR 倍，
  //     繪圖座標仍用邏輯像素 (透過 ctx.scale)，遊戲邏輯完全不用改。
  //     主要受惠：高 DPR 裝置上，PRESS ENTER / 倒數 / GAME OVER 等文字不再糊。
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  const CANVAS_W = 340, CANVAS_H = 680;

  // --- 效能優化：離線暫存網格畫布 (只畫一次) ---
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = CANVAS_W * DPR;
  gridCanvas.height = CANVAS_H * DPR;
  const gCtx = gridCanvas.getContext('2d', { alpha: false });
  gCtx.scale(DPR, DPR);
  gCtx.fillStyle = '#06004f';
  gCtx.fillRect(0, 0, 340, 680);
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 10; c++) {
      gCtx.fillStyle = '#0b0767';
      gCtx.fillRect(c * 34, r * 34, 34, 34);
      gCtx.strokeStyle = '#06004f';
      gCtx.lineWidth = 4;
      gCtx.strokeRect(c * 34, r * 34, 34, 34);
    }
  }

  // --- 效能優化：方塊影像快取 (離線渲染) ---
  const cellCache = {};
  function getCachedCell(color, size) {
    const key = `${color}_${size}`;
    if (cellCache[key]) return cellCache[key]; // 如果畫過了，直接拿現成的
    
    // 沒畫過就開一張新的小畫布畫出來
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cx = c.getContext('2d', { alpha: false });
    cx.fillStyle = color;
    cx.fillRect(0, 0, size, size);
    cx.strokeStyle = BG; // 使用你原本設定的 #06004f
    cx.lineWidth = 4;
    cx.strokeRect(0, 0, size, size);
    
    cellCache[key] = c; // 存進快取
    return c;
  }

  const canvas = document.getElementById('game');
  canvas.width = CANVAS_W * DPR;
  canvas.height = CANVAS_H * DPR;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(DPR, DPR);
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d', { alpha:false });
  const holdCanvas = document.getElementById('hold-canvas');
  const holdCtx = holdCanvas.getContext('2d', { alpha:false });
  const queueCanvas = document.getElementById('queue-canvas');
  const queueCtx = queueCanvas.getContext('2d', { alpha:false });
  const scoreEl = document.getElementById('score');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');
  const highScoreEl = document.getElementById('high-score');
  let highScore = parseInt(localStorage.getItem('tetrisHighScore')) || 0;
  let isCloudDataLoaded = false; // 確保雲端資料下載完畢前，絕對不准上傳覆蓋

  // --- Firebase 初始化與啟動 ---
  const firebaseConfig = {
    apiKey: "AIzaSyC0CNkNpDVeSOiSMeiJTU2EEBjoscIOAWc",
    authDomain: "brickade.firebaseapp.com",
    databaseURL: "https://brickade-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "brickade",
    storageBucket: "brickade.firebasestorage.app",
    messagingSenderId: "535350207834",
    appId: "1:535350207834:web:62eca9aa23924db44a3f63"
  };
  
  firebase.initializeApp(firebaseConfig);

  // === App Check (reCAPTCHA v3) ===
  // 暫時停用：Spark plan 沒有計費風險、現有 Firestore/RTDB rules 已足夠保護
  // 未來升 Blaze plan 或流量上規模時，把 ENABLE_APP_CHECK 改回 true 即可
  const ENABLE_APP_CHECK = false;
  if (ENABLE_APP_CHECK) {
    try {
      firebase.appCheck().activate(
        new firebase.appCheck.ReCaptchaV3Provider('6Ld82N8sAAAAABUnTkq46QEd8h9SVzjdCk4VnPg6'),
        true // isTokenAutoRefreshEnabled
      );
    } catch (e) {
      console.warn('[AppCheck] activation failed:', e);
    }
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const rtdb = firebase.database(); // 初始化 RTDB
  
  // 記錄玩家在雲端專屬的 UID
  let currentUserUID = null;

  const PIECES = {
    I: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
    ],
    O: [
      [[1,1],[1,1]],
      [[1,1],[1,1]],
      [[1,1],[1,1]],
      [[1,1],[1,1]]
    ],
    T: [
      [[0,1,0],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,1],[0,1,0]],
      [[0,1,0],[1,1,0],[0,1,0]]
    ],
    J: [
      [[1,0,0],[1,1,1],[0,0,0]],
      [[0,1,1],[0,1,0],[0,1,0]],
      [[0,0,0],[1,1,1],[0,0,1]],
      [[0,1,0],[0,1,0],[1,1,0]]
    ],
    L: [
      [[0,0,1],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,0],[0,1,1]],
      [[0,0,0],[1,1,1],[1,0,0]],
      [[1,1,0],[0,1,0],[0,1,0]]
    ],
    S: [
      [[0,1,1],[1,1,0],[0,0,0]],
      [[0,1,0],[0,1,1],[0,0,1]],
      [[0,0,0],[0,1,1],[1,1,0]],
      [[1,0,0],[1,1,0],[0,1,0]]
    ],
    Z: [
      [[1,1,0],[0,1,1],[0,0,0]],
      [[0,0,1],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,0],[0,1,1]],
      [[0,1,0],[1,1,0],[1,0,0]]
    ]
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

  let board, queue, current, holdType, holdUsed, score, lines, level, gameOver, isPaused;
  let gravityTimer, lastTime, clearFx, lockTimer, lockResets;
  let currentGravityInterval = 1000; // 記錄當前重力速度
  // --- 進階視覺補幀變數 ---
  let visualRotationAngle = 0;                // 旋轉
  let visualBoardOffsetY = 0;                 // 盤面上下偏移
  let moveCooldown = 0;
  let dasTimer = 0;
  let arrTimer = 0;
  let activeDir = 0;
  let keysDown = new Set();
  let lastDirKey = 0;
  let lastMoveType = null; // 紀錄最後動作 ('move', 'rotate', 'drop')
  let lastKickIndex = 0;   // 紀錄最後使用了第幾個踢牆測試 (0~4)
  let b2b = 0;
  let combo = -1;             // Back-to-Back 狀態
  let maxCombo = 0;           // 對戰紀錄用：本局最高 combo
  let piecesPlaced = 0;       // 對戰紀錄用：本局放下的方塊總數 (算 PPM/APM)
  let matchStartTime = 0;     // 對戰紀錄用：本局開始時間戳 (ms)
  let matchEndReason = null;  // 對戰紀錄用：'TIMEOUT' | 'KO' | 'SURRENDER' | 'HEIGHT'
  const actionMsgEl = document.getElementById('action-msg');
  let msgTimeout = null;
  // --- 聯覺 (Synesthesia) 視覺與聽覺系統 ---
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContext();
  let shakeMag = 0; // 螢幕震動幅度
  // --- 時光倒流 (Undo) 專用變數 ---
  let previousGameState = null;
  let canUndo = false; // 紀錄上一步是否為「安全操作」

  // --- 絲滑模式狀態控制 ---
  let visualRow = 0; 
  let visualCol = 0;
  let visualGhostRow = 0; // 幽靈方塊專用的視覺 Y 座標
  let lastVisualRow = 0;  // 紀錄上一幀的視覺高度，用來畫垂直動態殘影

  // --- 高幀率模式狀態控制 ---
  // 兩段式：true = 高幀率 (鎖 120Hz 穩定) / false = 鎖 60FPS
  let isHighFpsMode = localStorage.getItem('tetrisHighFpsMode') !== 'false';
  // 從舊版 tetrisFpsMode 三段式設定遷移回來
  const _legacyFpsMode = localStorage.getItem('tetrisFpsMode');
  if (_legacyFpsMode === 'low') isHighFpsMode = false;
  else if (_legacyFpsMode === 'high' || _legacyFpsMode === 'stable') isHighFpsMode = true;
  if (_legacyFpsMode) localStorage.removeItem('tetrisFpsMode');
  localStorage.setItem('tetrisHighFpsMode', String(isHighFpsMode));

  // 目標幀間距：高幀率 120Hz / 鎖 60FPS
  // 註：在 180Hz 螢幕上用 naive 的 "delta < interval 就 skip" 會被 VSync 折半 (180→90)，
  //     因為 11ms 才過 8.33ms 的門檻，每兩個 rAF 才算一幀。
  //     改用 rolling deadline 累進式判斷，讓 3 個 rAF 過 2 個 → 180×2/3 = 真正的 120Hz。
  const HIGH_FRAME_INTERVAL = 1000 / 120; // 8.333ms
  const LOW_FRAME_INTERVAL  = 1000 / 60;  // 16.666ms
  let fpsFrameInterval = isHighFpsMode ? HIGH_FRAME_INTERVAL : LOW_FRAME_INTERVAL;
  let nextRenderDeadline = 0;

  const fpsBtn = document.getElementById('fps-mode-btn');

  function updateFpsBtnUI() {
    const isInBattle = document.getElementById('layout').contains(fpsBtn.parentElement);
    const targetWidth = isInBattle ? '160px' : '220px';
    const targetPadding = isInBattle ? '10px 0' : '10px';

    if (isHighFpsMode) {
      fpsBtn.textContent = window.t('btn.fpsMode', '✨ 高幀率模式');
      fpsBtn.style.color = 'var(--I)';
      fpsBtn.style.borderColor = 'var(--I)';
      fpsBtn.style.boxShadow = '0 0 10px rgba(56,189,238,0.3)';
    } else {
      fpsBtn.textContent = window.t('btn.fpsModeLock60', '🧱 鎖定 60FPS');
      fpsBtn.style.color = 'var(--white)';
      fpsBtn.style.borderColor = 'var(--white)';
      fpsBtn.style.boxShadow = 'none';

      if (current) {
        visualCol = current.col;
        visualRow = current.row;
        visualGhostRow = ghostRow();
      }
    }

    fpsBtn.style.width = targetWidth;
    fpsBtn.style.padding = targetPadding;
    fpsBtn.style.textAlign = 'center';
    fpsBtn.style.background = 'transparent';
  }

  fpsBtn.addEventListener('click', () => {
    isHighFpsMode = !isHighFpsMode;
    fpsFrameInterval = isHighFpsMode ? HIGH_FRAME_INTERVAL : LOW_FRAME_INTERVAL;
    nextRenderDeadline = 0; // 重置避免切換瞬間爆幀
    localStorage.setItem('tetrisHighFpsMode', String(isHighFpsMode));
    updateFpsBtnUI();
    playSound('move');
  });

  updateFpsBtnUI();

  // --- 🎮 PS4 搖桿設定區 ---
  const GAMEPAD_BUTTON_MAPPING = {
    6: 'KeyZ',        // L2 -> 逆時針旋轉 (向左轉)
    7: 'KeyX',        // R2 -> 順時針旋轉 (向右轉)
    4: 'KeyC',        // L1 -> Hold
    5: 'Space',       // R1 -> 硬降 (瞬間落下)
    9: 'Escape',      // Options -> 暫停
    
    // --- 客製化按鍵設定 ---
    0: 'Enter',       // ❌ (Cross) -> Enter / 確認與開始
    1: 'KeyR',        // ⭕️ (Circle) -> R / Reconnect 或 再來一局
    3: 'KeyA',        // 🔺 (Triangle) -> Undo (時光倒流反悔)
    2: 'KeyZ',        // ⬜️ (Square) -> 保留備用逆時針旋轉
    
    // --- D-pad (十字鍵) 上下左右對應表情符號 1~4 ---
    12: 'Digit1',     // D-pad 上 -> 發送 1️⃣😅
    13: 'Digit2',     // D-pad 下 -> 發送 2️⃣😡
    14: 'Digit3',     // D-pad 左 -> 發送 3️⃣🥶
    15: 'Digit4',     // D-pad 右 -> 發送 4️⃣🤣
  };

  // 專門用來記憶蘑菇頭狀態
  let lastAxesState = { 
    rightX: 0, 
    rightY: 0, 
    leftActive: false, 
    leftLastAngle: 0, 
    leftAccumulated: 0 
  }; 

  let lastGamepadState = {};

  function pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0]; 
    if (!gp) return;

    // ==========================================
    // 1. 處理一般按鈕
    // ==========================================
    for (let i = 0; i < gp.buttons.length; i++) {
      const isPressed = gp.buttons[i].pressed;
      const wasPressed = lastGamepadState[i];
      const targetKey = GAMEPAD_BUTTON_MAPPING[i];

      if (targetKey) {
        // 模擬真實的鍵盤點擊瞬間
        if (isPressed && !wasPressed) document.dispatchEvent(new KeyboardEvent('keydown', { code: targetKey }));
        else if (!isPressed && wasPressed) document.dispatchEvent(new KeyboardEvent('keyup', { code: targetKey }));
      }
      lastGamepadState[i] = isPressed;
    }

    // ==========================================
    // 2. 右蘑菇頭 (移動與軟降 : gp.axes[2], gp.axes[3])
    // ==========================================
    const THRESHOLD = 0.5; 
    let currentRightX = 0;
    if (gp.axes[2] < -THRESHOLD) currentRightX = -1;
    else if (gp.axes[2] > THRESHOLD) currentRightX = 1;

    if (currentRightX !== lastAxesState.rightX) {
      if (lastAxesState.rightX === -1) document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
      if (lastAxesState.rightX === 1) document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
      if (currentRightX === -1) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
      if (currentRightX === 1) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
      lastAxesState.rightX = currentRightX;
    }

    let currentRightY = 0;
    if (gp.axes[3] > THRESHOLD) currentRightY = 1;

    if (currentRightY !== lastAxesState.rightY) {
      if (lastAxesState.rightY === 1) document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown' }));
      if (currentRightY === 1) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
      lastAxesState.rightY = currentRightY;
    }

    // ==========================================
    // 3. 左蘑菇頭 (十字全向起手撥動 + 邊緣畫圈) : gp.axes[0], gp.axes[1]
    // ==========================================
    // 把死區從 0.6
    // 現在你必須把蘑菇頭往外推超過 60% 才會觸發起手撥動，完全防止手抖誤觸。
    const SPIN_THRESHOLD = 0.6; 
    const leftX = gp.axes[0];
    const leftY = gp.axes[1]; 
    const distance = Math.sqrt(leftX * leftX + leftY * leftY);

    if (distance > SPIN_THRESHOLD) {
      const currentAngle = Math.atan2(leftY, leftX);

      if (!lastAxesState.leftActive) {
        // --- 模式 A：剛從中間死區推出來的瞬間 (十字向 Flick 撥動) ---
        lastAxesState.leftActive = true;
        lastAxesState.leftLastAngle = currentAngle;
        lastAxesState.leftAccumulated = 0;

        if (Math.abs(leftX) > Math.abs(leftY)) {
          if (leftX < -0.2) {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); 
            document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
          } else if (leftX > 0.2) {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); 
            document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
          }
        } else {
          if (leftY < -0.2) {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); 
            document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
          } else if (leftY > 0.2) {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); 
            document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
          }
        }
      } else {
        // --- 模式 B：已經推到底部，正在邊緣滑動 (Circle 畫圈) ---
        let delta = currentAngle - lastAxesState.leftLastAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;

        lastAxesState.leftAccumulated += delta;
        lastAxesState.leftLastAngle = currentAngle;

        // 畫圈角度 Math.PI / 3 (60度)
        const triggerAngle = Math.PI / 3; 

        if (lastAxesState.leftAccumulated >= triggerAngle) {
          document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
          document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
          lastAxesState.leftAccumulated -= triggerAngle;
        } else if (lastAxesState.leftAccumulated <= -triggerAngle) {
          document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
          document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
          lastAxesState.leftAccumulated += triggerAngle;
        }
      }
    } else {
      lastAxesState.leftActive = false;
    }
  }

  // 將靜音變數拆分為兩個
  let isBgmMuted = localStorage.getItem('tetrisBgmMuted') === 'true';
  let isSfxMuted = localStorage.getItem('tetrisSfxMuted') === 'true';
  let masterVolume = parseFloat(localStorage.getItem('tetrisVolume'));
  if (isNaN(masterVolume)) masterVolume = 0.5;
  // --- 音訊資源路徑 ---
  const AUDIO_PATHS = {
    bgm: './Game 8-Bit On.mp3',
    battleBgm: './Return To The 8-Bit Past.mp3'
  };

  // 用 HTMLAudioElement 做 BGM 的 loop (不論 audio.loop=true 或手動 ended 重啟) 在 iOS / Android
  // 上都會聽到「結尾卡一下 → 從頭重播」的接縫，因為瀏覽器要重新 seek + buffer。
  // 改用 Web Audio API 的 AudioBufferSourceNode.loop = true，整首已經 decode 在記憶體裡，
  // loop 是樣本級無縫，這是 web 上唯一真正能做到無接縫 loop 的方式。
  class SeamlessAudio {
    constructor(url) {
      this.url = url;
      this._buffer = null;
      this._loadPromise = null;
      this._source = null;
      this._gain = audioCtx.createGain();
      this._gain.connect(audioCtx.destination);
      this._volume = 1;
      this._muted = false;
      this._paused = true;
      this._loop = true;
      this._gain.gain.value = 0;
      // 一建構就開始 fetch + decode (對齊原本 preload='auto' + load() 的行為)
      this._ensureLoaded().catch(() => {});
    }
    _ensureLoaded() {
      if (this._loadPromise) return this._loadPromise;
      this._loadPromise = fetch(this.url)
        .then(r => { if (!r.ok) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
        .then(ab => new Promise((resolve, reject) => {
          // decodeAudioData 在舊瀏覽器只接 callback 形式；用 Promise 包一層相容
          try {
            const p = audioCtx.decodeAudioData(ab, resolve, reject);
            if (p && typeof p.then === 'function') p.then(resolve, reject);
          } catch (e) { reject(e); }
        }))
        .then(buf => { this._buffer = buf; return buf; })
        .catch(err => {
          console.warn('BGM decode 失敗:', err);
          this._loadPromise = null;
          throw err;
        });
      return this._loadPromise;
    }
    load() { this._ensureLoaded().catch(() => {}); }
    set preload(_) {}
    get preload() { return 'auto'; }
    play() {
      return this._ensureLoaded().then(() => {
        if (!this._paused) return;
        const start = () => { this._paused = false; this._startSource(); };
        if (audioCtx.state === 'suspended') return audioCtx.resume().then(start);
        start();
      });
    }
    _startSource() {
      if (!this._buffer) return;
      if (this._source) {
        try { this._source.stop(0); } catch (e) {}
        try { this._source.disconnect(); } catch (e) {}
      }
      this._source = audioCtx.createBufferSource();
      this._source.buffer = this._buffer;
      this._source.loop = this._loop; // ← Web Audio 樣本級 loop，無接縫
      this._source.connect(this._gain);
      const src = this._source;
      this._ended = false;
      src.onended = () => {
        if (this._source === src) {
          this._paused = true;
          this._source = null;
          if (!this._loop) this._ended = true;
        }
      };
      this._source.start(0);
    }
    get ended() { return this._ended; }
    set loop(v) { this._loop = !!v; if (this._source) this._source.loop = this._loop; }
    get loop() { return this._loop; }
    pause() {
      if (this._paused) return;
      this._paused = true;
      if (this._source) {
        try { this._source.stop(0); } catch (e) {}
        try { this._source.disconnect(); } catch (e) {}
        this._source = null;
      }
    }
    set volume(v) { this._volume = Math.max(0, Math.min(1, v)); this._applyGain(); }
    get volume() { return this._volume; }
    set muted(m) { this._muted = !!m; this._applyGain(); }
    get muted() { return this._muted; }
    get paused() { return this._paused; }
    // 沿用原本 `bgm.currentTime = 0` 的呼叫慣例：歸零代表「從頭重播」
    set currentTime(t) { if (t === 0 && !this._paused) this._startSource(); }
    get currentTime() { return 0; }
    _applyGain() {
      const target = this._muted ? 0 : this._volume;
      const now = audioCtx.currentTime;
      try {
        this._gain.gain.cancelScheduledValues(now);
        this._gain.gain.setValueAtTime(this._gain.gain.value, now);
        this._gain.gain.linearRampToValueAtTime(target, now + 0.02); // 短斜坡避免爆音
      } catch (e) {
        this._gain.gain.value = target;
      }
    }
  }

  // 單人模式背景音樂
  const bgm = new SeamlessAudio(AUDIO_PATHS.bgm);
  bgm.volume = masterVolume * 0.15; // 背景音樂建議稍微小聲一點
  // 雙人對戰模式背景音樂
  const battleBgm = new SeamlessAudio(AUDIO_PATHS.battleBgm);
  battleBgm.volume = masterVolume * 0.15;
  battleBgm.loop = false; // 對戰曲 1:57，比賽 2:00，不循環避免結尾頭尾重疊
  // 行動裝置切到背景或螢幕鎖定時，AudioContext 會被系統 suspend (Web Audio source 雖未停，
  // 但完全沒輸出)，回到前景時要先 resume 才會繼續發聲；不需要重設 currentTime，loop 自動接續。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    if (isBgmMuted || !bgmStarted) return;
    if (isMultiplayer && gameStarted && battleBgm.paused && !battleBgm.ended) {
      battleBgm.play().catch(() => {});
    } else if (!isMultiplayer && bgm.paused) {
      bgm.play().catch(() => {});
    }
  });
  let bgmStarted = false; // 紀錄是否已經解鎖自動播放
  const particles = []; // 儲存所有粒子的陣列
  const myFloatingTexts = [];  // 儲存自己畫面上的特效
  const oppFloatingTexts = []; // 儲存對手畫面上的特效
  let peer = null;
  let conn = null;
  let pendingConn = null; // 專門收容「還沒按接受」的等待連線
  let myInviteCD = false;   // 發送邀請的 3 秒冷卻鎖
  let outgoingInvites = {}; // 存放所有發射出去的邀請名單
  let inviteTimeouts = {}; // 獨立於連線之外的嚴格超時管理器
  let isMyPeerReady = false; // 紀錄我自己的連線門牌是否已經準備好
  let lastInviteAttempt = null; // { targetName, attemptedPeerId, retries } —— 給 peer-unavailable 時自動重試用
  let retryInviteLookup = null; // 尋找+連線目標玩家的函式，錯誤處理器會重複呼叫
  let oppState = null; // 儲存對手傳來的狀態
  let gameStarted = false; // 控制遊戲是否已經開始
  let isMultiplayer = false; // 是否處於連線模式
  let isPracticeMode = false; // 是否處於練習模式
  let isNarrowMode = false;   // 是否處於 N-Wide Combo Room
  let narrowWidth = 4;        // Combo Room 寬度（3/4 格可選，預設 4）
  let isFreeMode = false;     // Combo Room 子模式：自由排版（數字鍵 1-7 選方塊）
  let freeGravity = true;     // 自由排版時是否啟用重力（false = 方塊不會自動落下）
  let freeQueueEnabled = true; // 自由排版時是否仍隨機產生 NEXT/QUEUE
  // 數字鍵對應的方塊類型（1=I, 2=J, 3=L, 4=O, 5=S, 6=T, 7=Z）
  const FREE_PIECE_KEYS = {
    'Digit1':'I','Digit2':'J','Digit3':'L','Digit4':'O','Digit5':'S','Digit6':'T','Digit7':'Z',
    'Numpad1':'I','Numpad2':'J','Numpad3':'L','Numpad4':'O','Numpad5':'S','Numpad6':'T','Numpad7':'Z'
  };
  let iAmReady = false;      // 我是否已準備
  let oppIsReady = false;    // 對手是否已準備
  // 對戰模式：'BOMB' = 垃圾洞口是炸彈、引爆消行 (原本玩法)；'CLASSIC' = 垃圾洞口是空格、填滿消除 (傳統對戰)
  // 雙方模式必須一致，Ready 才會解鎖；對戰開始後鎖定不可改
  let battleMode = 'BOMB';
  let oppBattleMode = null; // 對手選的模式，null 表示還沒收到
  let countdownValue = 0;    // 倒數計時數值 (3, 2, 1)
  let matchResult = null; // 用來紀錄 'WIN', 'LOSE' 或 'DRAW'
  let myWins = 0;
  let oppWins = 0;
  let mySeed = 0;
  let oppSeed = 0;
  let currentSeed = Date.now(); // 預設種子
  let pingInterval = null; // 用來裝計時器
  let lastPingTime = 0;    // 紀錄打出去的時間
  let lastEmojiTime = 0; // Emoji 冷卻計時器
  let lastActionTime = Date.now(); // 記錄玩家最後一次按鍵的時間
  let lastHeartbeat = Date.now(); // 紀錄最後一次收到對手訊息的時間
  let lastOpponentId = null; // 用來記憶上一個對手的 ID
  let lastFPressTime = 0; // 快速投降 (F鍵) 的雙擊計時器
  let piecePool = [];
  let myPieceIndex = 0;
  let aiPieceIndex = 0;
  // --- 效能優化：幽靈方塊快取 ---
  let cachedGhostRow = 0;
  let lastGhostCol = -1;
  let lastGhostRot = -1;
  let lastGhostPieceType = '';
  // --- 垃圾行系統變數 ---
  let activeGarbage = 0; // 準備湧入的垃圾 (危險：紅色)
  let nextGarbage = 0;   // 剛收到的垃圾，還在寬限期 (警告：黃色)
  let matchGeneration = 0; // 每局遞增，防止上一局的延遲垃圾滲入新局
  let lastGarbageHole = -1; // 記憶上一次垃圾行的缺口位置
  let consecutiveGarbageHoles = 0; // 跨回合記憶目前缺口連續出現的次數
  // --- 記錄戰況變數 ---
  let myKOs = 0;
  let oppKOs = 0;
  let myLinesSent = 0;
  let oppLinesSent = 0;
  let battleTime = 120;
  let timerInterval = null;
  let countdownInterval = null; // 儲存倒數計時器，用來支援強制中斷
  let isKOed = false; // 用來記錄玩家是否處於 1 秒的死亡懲罰中
  let oppKOTimer = 0; // 記錄對手處於 KO 狀態的倒數計時
  // --- 死亡寬限期變數 ---
  let isCheckingGameOver = false;
  let gameOverTimeout = null;
  const GRACE_PERIOD = 300; // 300毫秒的寬限期
  // --- 段位積分 (LP) 與連勝次數 ---
  let myLP = 0;
  let myWinStreak = 0;
  let myLoseStreak = 0;        // 連敗次數，用於方案 C 的保底機制
  let myDailyBullyWins = 0;    // 今日虐菜勝場數（對 lpDiff <= -200 對手）
  let myDailyBullyDate = null; // 上次計算虐菜場次的日期 (YYYY-MM-DD)
  // --- AI對戰 ---
  let isAIMode = false; // 是否處於AI對戰模式
  let aiBoard = null;        // AI 的盤面
  let aiBag = [];            // AI 的隨機袋
  let aiQueue = [];          // AI 的預覽隊列
  let aiCurrent = null;      // AI 當前方塊
  let aiHoldType = null;     // AI 的 hold
  let aiHoldUsed = false;    // 記錄 AI 這回合是否用過 Hold
  let aiGravityTimer = 0;    // AI 的下落計時
  let aiThinkTimer = 0;      // AI 思考間隔計時器
  let aiScore = 0;
  let aiLines = 0;
  let aiLevel = 1;
  // --- 適應性 AI 變數 ---
  let currentAiThinkInterval = 500; // AI 當前的思考間隔 (會根據你的手速動態變化)
  let myLastLockTime = 0;           // 紀錄玩家上一次放置方塊的時間
  let myLockIntervals = [];         // 儲存玩家最近 5 次的手速，用來算平均值避免暴衝
  // AI 專用的垃圾行變數
  let aiGameOver = false;
  let aiActiveGarbage = 0;
  let aiNextGarbage = 0;
  let aiLastGarbageHole = -1;
  let aiConsecutiveGarbageHoles = 0;
  let aiCombo = -1;  // 記錄 AI 的連擊數
  let aiSelfDestructed = false; // 記錄 AI 是否自爆
  // --- AI 設定（使用者可調整）---
  let aiSpeedMode = 'adaptive'; // 'rookie'|'casual'|'adaptive'|'pro'|'god'
  let aiWideMode = 'auto';      // 'auto'|1|2|3|4 (right-side columns to keep empty)
  

  // --- 背景 AI 大腦連線設定 ---
  const aiWorker = new Worker('ai_worker.js');
  let isAiReady = false;
  let isAiThinking = false; // 防呆鎖：確保 AI 一次只思考一步
  let lastAiThinkTime = 0;  // 上一次呼叫 WASM 大腦的時間，用來限制神模式 CPU 負擔

  aiWorker.onmessage = function(e) {
    if (e.data.type === 'READY') {
      isAiReady = true;
      console.log("🟢 系統廣播：背景 C++ 大腦已成功上線！");
    }
    else if (e.data.type === 'RESULT') {
      // 收到 AI 算好的結果了！解開思考鎖定
      isAiThinking = false;

      // 如果這顆方塊還在，就把目標設定給它
      if (aiCurrent) {
        aiCurrent.target = e.data.bestMove;
      }
    }
  };

  // ★ Worker 崩潰處理：WASM 若拋出例外，解除思考鎖定讓 AI 繼續運作
  aiWorker.onerror = function(e) {
    console.error("⚠️ AI Worker 錯誤:", e.message, "at", e.filename, ":", e.lineno);
    isAiThinking = false; // 解除鎖定，下一幀 AI 會重新嘗試
  };

  const pingDisplay = document.getElementById('ping-display');
  const scoreboardEl = document.getElementById('scoreboard');
  const myWinsEl = document.getElementById('my-wins-el');
  const oppWinsEl = document.getElementById('opp-wins-el');
  const mpInputGroup = document.getElementById('mp-input-group');
  const mpReadyGroup = document.getElementById('mp-ready-group');
  const readyBtn = document.getElementById('ready-btn');
  const myIdEl = document.getElementById('my-id');
  const oppIdInput = document.getElementById('opp-id-input');
  const connectBtn = document.getElementById('connect-btn');
  const connStatus = document.getElementById('conn-status');
  const oppCanvas = document.getElementById('opp-game');
  const oppCtx = oppCanvas ? oppCanvas.getContext('2d', { alpha: false }) : null;

  const mpLeaveBtn = document.getElementById('mp-leave-btn');
  if (mpLeaveBtn) {
    mpLeaveBtn.addEventListener('click', () => {
      // 多人對戰預覽 + 可能混入 1v1 狀態：兩邊都清乾淨
      if (window.isMpMulti) {
        if (isMultiplayer) {
          if (conn && conn.open) { try { conn.send({ type: 'OPPONENT_DISCONNECTED' }); } catch {} }
          exitMultiplayerMode(false);
          if (conn) { try { conn.close(); } catch {} conn = null; }
        }
        const multiplayerBtn = document.getElementById('multiplayer-btn');
        if (multiplayerBtn) multiplayerBtn.click(); // 觸發 exitMpMultiPreview
        return;
      }
      // 👀 觀戰模式：直接離開觀戰，不需要 confirm
      if (isSpectating) {
        exitSpectateMode('USER_LEAVE');
        return;
      }
      if (confirm(window.t('toast.confirmLeaveBattle', '確定要離開對戰房間，回到單人模式嗎？'))) {
        if (conn && conn.open) conn.send({ type: 'OPPONENT_DISCONNECTED' });
        
        // 傳入 false，因為是手動離開，不需要彈出異常斷線警告
        exitMultiplayerMode(false); 
        
        if (conn) {
          conn.close();
          conn = null;
        }
      }
    });
  }

  const SETTINGS = {
    das: 167,
    arr: 33,
    softDropInterval: 33,
    lockDelay: 500,
    clearDuration: 150
  };

  // 文字特效
  class FloatingText {
    constructor(text, x, y, color, size) {
      this.text = text;
      this.x = x;
      this.y = y;
      this.color = color;
      this.size = size;
      this.life = 1.0;
      this.vy = -1.5; // 向上飄浮的速度
    }
    update(delta) {
      this.y += this.vy * (delta / 16);
      this.life -= 0.015 * (delta / 16); // 逐漸變透明消失
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.translate(this.x, this.y);
      
      const fontStr = `900 ${this.size}px Arial`;
      if (ctx.font !== fontStr) ctx.font = fontStr; 
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 保持細線黑邊框，增加立體感且不吃效能
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';
      ctx.strokeText(this.text, 0, 0);
      
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
      
      ctx.restore();
    }
  }

  // 將自己的最新名片發送給對手
  function sendMyProfile() {
    if (!conn || !conn.open) return;
    const matchesEl = document.getElementById('display-matches');
    const winRateEl = document.getElementById('display-winrate');

    conn.send({
      type: 'PROFILE',
      profile: {
        name: currentPlayer || 'Guest',
        uid: currentUserUID || null,   // 對戰紀錄用：對手 UID
        lp: myLP || 0,
        matches: matchesEl ? matchesEl.textContent : '0',
        winRate: winRateEl ? winRateEl.textContent : '0%',
        streak: myWinStreak || 0   // 把我的連勝次數發給對手
      }
    });
    // 連 PROFILE 一起把目前選的對戰模式廣播給對手，
    // 確保剛接上線的人馬上看得到雙方選的模式
    conn.send({ type: 'MODE_SELECT', mode: battleMode });
  }

  // 動態門牌系統
  function initNetwork(uidToLink = null) {
    const currentMyIdEl = document.getElementById('my-id');
    const currentConnectBtn = document.getElementById('connect-btn');
    const currentOppInput = document.getElementById('opp-id-input');

    // 優雅地斷開舊連線
    if (peer) {
      peer.disconnect();
      setTimeout(() => {
        if (peer) peer.destroy();
        peer = null;
        startNewPeer(uidToLink);
      }, 200);
    } else {
      startNewPeer(uidToLink);
    }

    function startNewPeer(uid) {
      isMyPeerReady = false;
      // 不再傳入 customId，讓伺服器永遠發放全新不重複的 ID
      peer = new Peer(); 
      
      peer.on('open', (id) => {
        isMyPeerReady = true;

        // 把線上名單裡灰色的 WAIT... 按鈕，全部啟動變成 INVITE
        document.querySelectorAll('.quick-invite-btn').forEach(btn => {
          if (btn.textContent === 'WAIT...') {
            btn.textContent = 'INVITE';
            btn.disabled = false;
            btn.style.background = 'var(--I)';
            btn.style.cursor = 'pointer';
          }
        });

        if (currentMyIdEl) {
          currentMyIdEl.textContent = currentPlayer ? currentPlayer : id;
        }
        
        // 如果玩家有登入，將最新的動態 ID 存入 Firebase 當作門牌
        if (uid && currentPlayer) {
          db.collection('users').doc(uid).set({
            currentPeerId: id
          }, { merge: true }).catch(err => console.log("更新門牌失敗:", err));
        }
      });

      // Phase 9：本機 PeerJS 訊號層斷線 → 自動嘗試重連
      peer.on('disconnected', () => {
        console.warn('[peer] disconnected from signaling server, attempting reconnect');
        try { peer.reconnect(); } catch (e) { console.warn('[peer] reconnect threw', e); }
      });

      peer.on('error', (err) => {
        console.error("PeerJS 錯誤:", err);
        if (err.type === 'peer-unavailable') {
          // 對方剛上線、Firestore 的 currentPeerId 可能還沒刷新 → 自動重試
          if (lastInviteAttempt && lastInviteAttempt.retries < 4) {
            const attempt = lastInviteAttempt;
            attempt.retries++;
            if (connStatus) {
              connStatus.textContent = `Status: Connecting... (${attempt.retries}/4)`;
              connStatus.style.color = 'var(--O)';
            }
            setTimeout(() => {
              if (typeof retryInviteLookup === 'function') retryInviteLookup(attempt.targetName);
            }, 700);
          } else {
            lastInviteAttempt = null;
            if (connStatus) {
              connStatus.textContent = 'Status: Player Offline';
              connStatus.style.color = 'var(--Z)';
            }
          }
        } else {
          if (connStatus) connStatus.textContent = 'Status: Error - ' + err.type;
        }
      });

      if (currentMyIdEl) {
        currentMyIdEl.onclick = () => {
          // 如果是訪客，要複製背後的真實亂碼 ID 讓別人連
          const textToCopy = currentPlayer ? currentMyIdEl.textContent : peer.id;
          if (textToCopy && !textToCopy.includes('Loading') && !textToCopy.includes('Error')) {
            navigator.clipboard.writeText(textToCopy).then(() => {
              const originalText = currentMyIdEl.textContent;
              currentMyIdEl.textContent = 'Copied!';
              currentMyIdEl.style.color = 'var(--S)';
              setTimeout(() => { 
                currentMyIdEl.textContent = originalText;
                currentMyIdEl.style.color = 'var(--O)'; 
              }, 1000);
            });
          }
        };
      }

      peer.on('connection', (connection) => {
        // 如果是專門用來聊天的管線，交給聊天處理器
        if (connection.metadata && connection.metadata.purpose === 'chat') {
            setupChatConnection(connection);
        } else if (connection.metadata && connection.metadata.purpose === 'mp-game') {
            // 多人對戰 mesh：交給專用 handler，不要佔用 1v1 的 conn
            setupMpConnection(connection, false);
        } else {
            // 原本的遊戲管線維持不變
            setupConnection(connection, false);
        }
      });

      retryInviteLookup = async (targetName) => {
        try {
          let targetPeerId = null;
          // 重試時強制走 server，避免讀到 Firestore 本地 cache 的舊 currentPeerId
          const getOptions = (lastInviteAttempt && lastInviteAttempt.retries > 0) ? { source: 'server' } : undefined;
          const snapshot = await db.collection('users').where('username', '==', targetName).get(getOptions);
          if (snapshot.empty) {
             if (targetName.length > 15 || targetName.includes('-')) {
                targetPeerId = targetName;
             } else {
                connStatus.textContent = 'Status: Player not found';
                connStatus.style.color = 'var(--Z)';
                lastInviteAttempt = null;
                return;
             }
          } else {
             snapshot.forEach(doc => { targetPeerId = doc.data().currentPeerId || doc.id; });
          }

          if (targetPeerId) {
            if (lastInviteAttempt) lastInviteAttempt.attemptedPeerId = targetPeerId;
            let existingConn = outgoingInvites[targetPeerId];

            if (existingConn && existingConn.open) {
              existingConn.send({ type: 'INVITE', version: GAME_VERSION, from: currentPlayer || currentMyIdEl.textContent, mpRoomCode: (window.isMpMulti ? (window.mpHostSettings && window.mpHostSettings.roomCode) || null : null) });
              showToast(window.t('toast.inviteResent', '已向 {user} 再次發送邀請！').replace('{user}', targetName));
              lastInviteAttempt = null;

              if (inviteTimeouts[targetPeerId]) clearTimeout(inviteTimeouts[targetPeerId]);
              inviteTimeouts[targetPeerId] = setTimeout(() => {
                if (!isMultiplayer && outgoingInvites[targetPeerId] === existingConn) {
                  showToast(window.t('toast.inviteTimeout', '⚠️ 對 {user} 的邀請已超時').replace('{user}', targetName));
                  existingConn.close();
                  delete outgoingInvites[targetPeerId];
                }
              }, 10000);
              return;
            }

            const connection = peer.connect(targetPeerId);
            setupConnection(connection, true);

            connection.on('open', () => {
              connection.send({ type: 'INVITE', version: GAME_VERSION, from: currentPlayer || currentMyIdEl.textContent, mpRoomCode: (window.isMpMulti ? (window.mpHostSettings && window.mpHostSettings.roomCode) || null : null) });
              outgoingInvites[targetPeerId] = connection;
              showToast(window.t('toast.inviteSent', '已向 {user} 發送邀請！').replace('{user}', targetName));
              lastInviteAttempt = null;
              if (connStatus) { connStatus.textContent = 'Status: Invite sent, waiting...'; connStatus.style.color = 'var(--O)'; }

              if (inviteTimeouts[targetPeerId]) clearTimeout(inviteTimeouts[targetPeerId]);
              inviteTimeouts[targetPeerId] = setTimeout(() => {
                if (!isMultiplayer && outgoingInvites[targetPeerId] === connection) {
                  showToast(window.t('toast.inviteTimeout', '⚠️ 對 {user} 的邀請已超時').replace('{user}', targetName));
                  connection.close();
                  delete outgoingInvites[targetPeerId];
                }
              }, 10000);
            });
          }
        } catch (error) {
          console.error("搜尋玩家失敗:", error);
          // Firestore 查詢失敗也自動重試（例如剛載入、網路未熱）
          if (lastInviteAttempt && lastInviteAttempt.retries < 4) {
            lastInviteAttempt.retries++;
            if (connStatus) {
              connStatus.textContent = `Status: Searching... (${lastInviteAttempt.retries}/4)`;
              connStatus.style.color = 'var(--O)';
            }
            setTimeout(() => retryInviteLookup(targetName), 500);
          } else {
            connStatus.textContent = 'Status: Search Error';
            connStatus.style.color = 'var(--Z)';
            lastInviteAttempt = null;
          }
        }
      };

      if (currentConnectBtn) {
        currentConnectBtn.onclick = async () => {
          // 如果畫面上已經有別人的邀請，但我選擇主動去邀請別人 -> 自動拒絕舊邀請
          if (pendingConn && pendingConn.open) {
            const rejected = pendingConn;
            rejected.send({ type: 'INVITE_REJECT' });
            setTimeout(() => { try { rejected.close(); } catch(e){} }, 500);
            pendingConn = null;
            const toast = document.getElementById('invite-toast');
            if (toast) toast.classList.add('hidden');
          }

          const targetName = currentOppInput.value.trim();
          if (!targetName) return;

          if (targetName === currentMyIdEl.textContent) {
            showToast(window.t('toast.cantConnectSelf', '不能跟自己連線啦！')); return;
          }

          if (targetName.toUpperCase() === 'ADMIN_MARS') {
            connStatus.textContent = 'Status: Player not found';
            connStatus.style.color = 'var(--Z)';
            return;
          }

          connStatus.textContent = 'Status: Searching player...';
          lastInviteAttempt = { targetName, attemptedPeerId: null, retries: 0 };
          retryInviteLookup(targetName);
        };
      }
    }
  }

  // 處理投降的邏輯函數
  function handleSurrender(isOpponent) {
    // 停止對戰倒數計時器
    if (timerInterval) clearInterval(timerInterval);

    // 顯示提示文字
    if (isOpponent) {
      showToast(window.t('battle.oppSurrendered', '🎉 對手已投降！你獲得了本局勝利！'));
    } else {
      showMsg("YOU SURRENDERED"); // 在畫面上顯示投降提示
    }

    // LP 加減分、勝場數增加、播放音效、以及把按鈕變回 READY
    matchEndReason = 'SURRENDER';
    endBattleMatch(isOpponent ? 'WIN' : 'LOSE');

    // 更新連線狀態文字，確保 UI 完美重置
    const connStatus = document.getElementById('conn-status');
    if (connStatus) {
      connStatus.textContent = 'Status: WAITING FOR READY';
      connStatus.style.color = 'var(--O)';
    }
  }

  // READY / 投降 / 取消 READY 按鍵邏輯
  if (readyBtn) {
    readyBtn.addEventListener('click', () => {
      // Phase 4：多人對戰 READY 切換（Phase 5+ 才接遊戲啟動）
      if (window.isMpMulti) {
        if (countdownValue > 0 || (gameStarted && !gameOver)) return;
        if (window.mpIsSpectatorWaiting) return; // 觀戰等待中無法按 READY
        // 本機已 top out 但整場 finalize 還沒跑（gameOver=true 但 mpPostMatchPending=false）→ 等比賽真正結束才允許 READY
        if (gameOver && window.mpGameActive && !window.mpPostMatchPending) return;
        // 對戰結束後，按 READY 先做自己的視覺重置（清盤面、清 WIN/LOSE 提示）
        if (window.mpPostMatchPending && !window.mpIAmReady) {
          mpDoLocalPostMatchReset();
        }
        window.mpIAmReady = !window.mpIAmReady;
        broadcastMp({ type: 'MP_READY', ready: window.mpIAmReady });
        updateMpReadyButtonUI();
        updateMpConnStatus();
        if (window.mpIsHost && typeof syncMpHostPanelUI === 'function') syncMpHostPanelUI(); // 重新套用「房主已 READY 凍結設定」樣式
        playSound('move');
        // 房主每次按 READY 都重新檢測一次是否全員就緒
        maybeStartMpGame();
        return;
      }
      if (!isMultiplayer) return;

      // 把投降的判定移到最上面，確保投降不會被 AI 模式攔截
      if (readyBtn.textContent.includes('SURRENDER')) {
        if (confirm(window.t('battle.confirmSurrender', '確定要投降嗎？這將會讓對手直接獲得 1 勝！'))) {
          if (conn && conn.open) conn.send({ type: 'SURRENDER' });
          handleSurrender(false); // false 代表是我自己投降
        }
        return;
      }

      // 倒數中 (STARTING...) 或對戰中：按鈕本來就 disabled，這裡只是雙重防呆
      if (countdownValue > 0 || (gameStarted && !gameOver)) return;

      // 已經按過 READY (狀態 WAITING...) 再點一次 → 取消 READY，讓玩家可以改模式重來
      if (iAmReady) {
        if (isAIMode) return; // AI 模式對手就是 AI，不開放取消
        iAmReady = false;
        oppIsReady = false; // 對手如果也已 READY，重置以避免取消後又馬上 checkBothReady 開局
        if (conn && conn.open) conn.send({ type: 'CANCEL_READY' });
        playSound('move');
        showToast(window.t('battle.cancelReady', '↩️ 已取消 READY，可重新選擇模式'), 1500);
        refreshReadyButtonLock();
        return;
      }

      // 防呆：模式不一致的話禁止 READY (鍵盤快捷鍵也吃這個檢查，避免繞過 disabled 按鈕)
      if (!isAIMode && (oppBattleMode === null || oppBattleMode !== battleMode)) {
        playSound('move');
        showToast(oppBattleMode === null ? window.t('battle.waitForMode', '⏳ 請等待對手選擇對戰模式') : window.t('battle.modeMismatchToast', '⚠️ 雙方模式不一致，無法開始'), 1500);
        return;
      }

      // 賽後第一次按 READY：把自己的板面與 WIN/LOSE 結算畫面清掉，回到等待狀態
      if (gameOver && matchResult) {
        gameOver = false;
        matchResult = null;
        isKOed = false;
        gameStarted = false;
        if (typeof createBoard === 'function') board = createBoard();
        current = null;
        queue = [];
        holdType = null;
        holdUsed = false;
        piecePool = []; myPieceIndex = 0;
        activeGarbage = 0;
        nextGarbage = 0;
        // 我的 KO/lines 顯示歸零（下一場重新計）
        myKOs = 0; myLinesSent = 0;
        const myKoEl1v1 = document.getElementById('my-ko-display'); if (myKoEl1v1) myKoEl1v1.textContent = '0';
        const myLinesEl1v1 = document.getElementById('my-lines-sent-display'); if (myLinesEl1v1) myLinesEl1v1.textContent = '0';
        if (typeof renderPanels === 'function') { try { renderPanels(); } catch {} }
      }

      // 按下 READY → 進入「等對手」狀態：按鈕保持可點，文字改成「✕ 取消 READY」讓玩家可反悔
      iAmReady = true;
      readyBtn.textContent = window.t('battle.cancelReadyBtn', '✕ 取消 READY');
      readyBtn.style.background = 'var(--Z)';
      readyBtn.style.color = 'var(--white)';
      readyBtn.style.borderColor = 'var(--white)';
      readyBtn.style.cursor = 'pointer';
      readyBtn.style.opacity = '1';
      readyBtn.disabled = false;

      mySeed = Math.floor(Math.random() * 1000000); // 產生我方種子

      // AI 模式的處理 (AI 直接準備完畢)
      if (isAIMode) {
        oppIsReady = true;
        checkBothReady();
        return;
      }

      // 真人對戰發送準備訊號
      if (conn && conn.open) conn.send({ type: 'READY', seed: mySeed });
      checkBothReady();
    });
  }

  // === 對戰模式選擇 ===
  // 點按鈕：更新本地狀態 + 廣播給對手 + 重新計算 Ready 是否解鎖
  // 鎖定條件：對戰中 (gameStarted && !gameOver) 或倒數中；對戰結束 (gameOver=true) 後玩家可以重新選模式
  function setBattleMode(newMode, broadcast) {
    if (newMode !== 'BOMB' && newMode !== 'CLASSIC') return;
    if (countdownValue > 0) return;          // 倒數中不能改
    if (gameStarted && !gameOver) return;    // 對戰進行中不能改 (gameOver 後就解鎖)
    if (iAmReady) return;                    // 已按 READY 鎖死，避免改完之後狀態不一致
    battleMode = newMode;
    updateBattleModeUI();
    if (broadcast && conn && conn.open) {
      conn.send({ type: 'MODE_SELECT', mode: battleMode });
    }
  }

  // 重繪 BOMB / CLASSIC 兩顆按鈕的選中狀態 + 對手選擇 badge + 同步狀態文字 + Ready 鎖定
  function updateBattleModeUI() {
    const bombBtn = document.getElementById('mode-bomb-btn');
    const classicBtn = document.getElementById('mode-classic-btn');
    const status = document.getElementById('mode-sync-status');
    if (!bombBtn || !classicBtn) return;

    [bombBtn, classicBtn].forEach(btn => {
      const mode = btn.dataset.mode;
      btn.classList.toggle('selected', mode === battleMode);
      const myBadge = btn.querySelector('.pick-badge.my');
      const oppBadge = btn.querySelector('.pick-badge.opp');
      if (myBadge) myBadge.classList.toggle('hidden', mode !== battleMode);
      if (oppBadge) oppBadge.classList.toggle('hidden', mode !== oppBattleMode);
    });

    if (status) {
      status.classList.remove('match', 'mismatch');
      if (oppBattleMode === null) {
        status.textContent = window.t('battle.waitingMode', '⏳ 等待對手選擇模式...');
      } else if (oppBattleMode === battleMode) {
        status.textContent = window.t('battle.modeAgreed', '✅ 模式一致，可以按下 READY 開始');
        status.classList.add('match');
      } else {
        const oppName = oppBattleMode === 'BOMB' ? '💣 BOMB' : '🧱 CLASSIC';
        status.textContent = window.t('matchMode.modeMismatch', '⚠️ 對手選擇了 {mode}，模式不同無法開始').replace('{mode}', oppName);
        status.classList.add('mismatch');
      }
    }

    refreshReadyButtonLock();
  }

  // 同步 READY 按鈕外觀：依照 iAmReady / 模式一致性決定樣式 (不動 SURRENDER / STARTING 狀態)
  function refreshReadyButtonLock() {
    const rBtn = document.getElementById('ready-btn');
    if (!rBtn) return;
    if (!isMultiplayer || isAIMode) return; // AI 模式不需要這個鎖
    if (rBtn.textContent.includes('SURRENDER') || rBtn.textContent.includes('STARTING')) return;

    // 已按 READY → 顯示「✕ 取消 READY」紅色可點，讓玩家可以反悔重選模式
    if (iAmReady) {
      rBtn.disabled = false;
      rBtn.textContent = window.t('battle.cancelReadyBtn', '✕ 取消 READY');
      rBtn.style.background = 'var(--Z)';
      rBtn.style.color = 'var(--white)';
      rBtn.style.borderColor = 'var(--white)';
      rBtn.style.cursor = 'pointer';
      rBtn.style.opacity = '1';
      return;
    }

    const modesMatch = oppBattleMode !== null && oppBattleMode === battleMode;
    if (modesMatch) {
      rBtn.disabled = false;
      rBtn.textContent = 'READY';
      rBtn.style.background = 'var(--S)';
      rBtn.style.color = 'var(--bg)';
      rBtn.style.cursor = 'pointer';
      rBtn.style.opacity = '1';
    } else {
      rBtn.disabled = true;
      rBtn.textContent = oppBattleMode === null ? window.t('battle.btnWaitingOpp', '等待對手...') : window.t('battle.btnModeMismatch', '模式不一致');
      rBtn.style.background = 'rgba(120,120,120,0.4)';
      rBtn.style.color = 'rgba(255,255,255,0.6)';
      rBtn.style.cursor = 'not-allowed';
      rBtn.style.opacity = '0.7';
    }
  }

  // 把按鈕綁好；首次載入時也呼叫一次 updateBattleModeUI 讓初始狀態正確
  ['mode-bomb-btn', 'mode-classic-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        // 對戰進行中或倒數中或已 READY 不能改；對戰結束 (gameOver) 解鎖讓玩家重選下一局模式
        if (countdownValue > 0) return;
        if (gameStarted && !gameOver) return;
        if (iAmReady) return;
        const newMode = btn.dataset.mode;
        if (newMode === battleMode) return;  // 已經是這個模式就不重發
        playSound('move');
        setBattleMode(newMode, true);
      });
    }
  });

  // 檢查雙方準備邏輯 (合併種子)
  function checkBothReady() {
    if (iAmReady && oppIsReady) {
      currentSeed = mySeed + oppSeed; // 雙方種子相加，變成世界上獨一無二且雙方共同的密碼！
      connStatus.textContent = 'Status: STARTING...';
      connStatus.style.color = 'var(--S)';
      
      // 進入倒數時，把按鈕變成醒目的橘色 STARTING...
      const rBtn = document.getElementById('ready-btn');
      if (rBtn) {
        rBtn.textContent = 'STARTING...';
        rBtn.style.background = 'var(--O)';           // 橘色背景
        rBtn.style.color = 'var(--bg)';               // 深藍字體
        rBtn.style.borderColor = 'var(--white)';      // 保持邊框
        rBtn.style.cursor = 'default';                // 滑鼠變回普通箭頭，表示不可按
        rBtn.disabled = true;                         // 徹底鎖死按鈕
      }

      startCountdown();
    }
  }

  // --- 開局準備 (只清空盤面、抽好預覽方塊，但還不落下) ---
  function prepareGame() {
    board = createBoard();
    gameStarted = true; // 隱藏 PRESS ENTER 提示

    // 解決秒斷線 Bug：在開局瞬間，將掛機與心跳時間強制重置到最新
    lastActionTime = Date.now(); 
    lastHeartbeat = Date.now();

    if (isMultiplayer && connStatus) {
      connStatus.textContent = 'Status: PLAYING...';
      connStatus.style.color = 'var(--S)';
    }
    
    // 將所有遊戲狀態歸零
    piecePool = []; myPieceIndex = 0; aiPieceIndex = 0; // 重置共用方塊池
    queue = []; current = null; holdType = null; holdUsed = false;
    // AI 模式：同步清空 AI 盤面，讓雙方都從乾淨狀態開始
    if (isAIMode) {
      aiBoard = createBoard();
      _aiBoardDirty = true;
      aiQueue = []; aiCurrent = null;
      aiScore = 0; aiLines = 0; aiLevel = 1;
      aiGameOver = false; aiThinkTimer = 0;
      // 清空 AI 身上殘留的垃圾與破洞記憶
      aiActiveGarbage = 0;
      aiNextGarbage = 0;
      aiLastGarbageHole = -1;
      aiConsecutiveGarbageHoles = 0;

      aiSyncOppState();
    }
    score = 0; lines = 0; level = 1; activeGarbage = 0; nextGarbage = 0;
    matchGeneration++; // 遞增世代，讓上一局延遲中的垃圾行 setTimeout 自動失效

    // 確保每一局都是全新的，不會Undo退回上一局
    previousGameState = null;
    canUndo = false;

    gameOver = false; isPaused = false; gravityTimer = 0; lastTime = 0;
    clearFx = null; lockTimer = 0; lockResets = 0; moveCooldown = 0;
    dasTimer = 0; arrTimer = 0; activeDir = 0; keysDown = new Set();
    lastMoveType = null; lastKickIndex = 0; b2b = 0; combo = -1;

    // --- 確保每一局新開局時，垃圾行的洞口記憶都重新計算 ---
    lastGarbageHole = -1;
    consecutiveGarbageHoles = 0;

    isKOed = false; // 確保每次新開局，絕對不會帶著上一局的死亡狀態
    // --- 重置寬限期狀態 ---
    isCheckingGameOver = false;
    if (gameOverTimeout) clearTimeout(gameOverTimeout);

    matchResult = null; // 強制重置上一局的勝負結果

    // --- 清除上一局對手與自己畫面上可能殘留的文字特效與黑幕 ---
    oppKOTimer = 0;
    oppFloatingTexts.length = 0;
    myFloatingTexts.length = 0;

    if (actionMsgEl) actionMsgEl.textContent = '';
    
    updateHUD(); 
    updateSoundUI(); 
    ensureQueue();  // 預先抽好 5 顆預覽方塊
    renderPanels(); // 畫到畫面的 NEXT 與 QUEUE 面板上
    draw();         // 畫出乾淨的盤面

    // --- 在倒數前，強制把乾淨的盤面狀態發送給對手，讓對手畫面立刻清空 ---
    if (isMultiplayer && !isAIMode) {
      sendState();
    }
  }

  // --- 暫停恢復時的 3 秒緩衝倒數 ---
  function resumeCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    isPaused = false; // 先解除死當的暫停狀態，讓畫面切換到倒數 UI
    countdownValue = 3;
    playSound('move');

    countdownInterval = setInterval(() => {
      countdownValue--;
      if (countdownValue > 0) {
        playSound('move');
      } else {
        playSound('perfect');
        clearInterval(countdownInterval);

        lastActionTime = Date.now(); // 倒數結束，重置掛機判定
        if (isAIMode) {
           aiThinkTimer = 0; // 防止 AI 一解凍就瞬間把方塊砸下來
        }
        // 保險：若 AI 對戰的 battleTime 計時器從未啟動（例如初始倒數曾被打斷），在這裡補建
        if (isAIMode && battleTime > 0) {
          const timerEl2 = document.getElementById('battle-timer');
          if (timerInterval) clearInterval(timerInterval);
          timerInterval = setInterval(() => {
            if (!gameOver && isMultiplayer && !isPaused && countdownValue <= 0) {
              battleTime--;
              let mins = Math.floor(battleTime / 60);
              let secs = battleTime % 60;
              if (timerEl2) timerEl2.textContent = `0${mins}:${secs < 10 ? '0' : ''}${secs}`;
              if (battleTime <= 0) {
                clearInterval(timerInterval);
                matchEndReason = 'TIMEOUT';
                endBattleMatch();
              }
            }
          }, 1000);
        }
        if (!current) {
          if (isAIMode && !aiCurrent) startAI(); // 確保 AI 也一起啟動
          spawn();
        }
      }
    }, 1000);
  }

  // --- 啟動 3、2、1 倒數 (單人/雙人共用) ---
  function startCountdown() {
    // 練習模式必須先選 Combo Room 或自由排版才能開始
    if (!isMultiplayer && isPracticeMode && !isNarrowMode && !isFreeMode) {
      const am = document.getElementById('action-msg');
      if (am) {
        am.textContent = window.t('practice.chooseSubMode', '請先選擇 COMBO ROOM 或 自由排版');
        am.style.color = 'var(--O)';
      }
      return;
    }
    if (!isMultiplayer) updateMyActivity(isPracticeMode ? 'PRACTICE' : 'SINGLE'); // 單機狀態更新
    if (countdownInterval) clearInterval(countdownInterval);

    countdownValue = 3;
    playSound('move');

    // 倒數 3 秒只給對手框觸發華麗動畫；PLAYER 框保持靜態避免分心
    if (typeof triggerRankCharge === 'function' && isMultiplayer) {
      const oppForCharge = document.getElementById('opp-panel');
      if (oppForCharge && oppForCharge.classList.contains('rank-frame')) {
        triggerRankCharge(oppForCharge, 3000);
      }
    }

    // 如果是單機模式，而且音樂「還沒在播放」，才呼叫播放
        if (!isMultiplayer && !isBgmMuted) {
          if (typeof bgm !== 'undefined' && bgm.paused) {
            bgm.play().catch(e=>console.log(e));
          }
        }
    
    prepareGame(); // 倒數前，先準備好盤面與預覽方塊讓你偷看
    
    // 重置對戰數據
    myKOs = 0; oppKOs = 0; myLinesSent = 0; oppLinesSent = 0;
    matchResult = null; // 重置上一局的勝負結果，防止復活卡死
    maxCombo = 0; piecesPlaced = 0; matchEndReason = null;
    matchStartTime = Date.now();
    const myKoEl = document.getElementById('my-ko-display');
    const oppKoEl = document.getElementById('opp-ko-display');
    const myLinesEl = document.getElementById('my-lines-sent-display');
    const oppLinesEl = document.getElementById('opp-lines-sent-display');
    if (myKoEl) myKoEl.textContent = '0';
    if (oppKoEl) oppKoEl.textContent = '0';
    if (myLinesEl) myLinesEl.textContent = '0';
    if (oppLinesEl) oppLinesEl.textContent = '0';

    // 計數器歸零後，立刻再廣播一次 frame 給觀戰者，避免倒數期間仍顯示上一局的 KO/SENT
    if (spectatorConns && spectatorConns.size > 0) {
      try { broadcastFrameToSpectators(); } catch(e) {}
    }

    const timerEl = document.getElementById('battle-timer');
    if (timerEl) {
      // 多人對戰：3 秒倒數一開始就秀完整時間（HYBRID=05:00 / LAST_SURVIVOR=∞ / TIMED_RANK=02:00），
      // 不要等遊戲正式開始才從 04:59 跳出來
      if (window.isMpMulti && typeof mpWinCondToTimerText === 'function') {
        const wc = (window.mpHostSettings && window.mpHostSettings.winCondition) || 'LAST_SURVIVOR';
        timerEl.textContent = mpWinCondToTimerText(wc);
      } else {
        timerEl.textContent = "02:00";
      }
    }

    countdownInterval = setInterval(() => {
      countdownValue--;
      if (countdownValue > 0) {
        playSound('move');
      } else {
        playSound('perfect'); 
        clearInterval(countdownInterval);

        if (isMultiplayer) {
          // 連線模式倒數結束，開始播放對戰音樂！
          if (!isBgmMuted && typeof battleBgm !== 'undefined') {
            battleBgm.currentTime = 0;
            battleBgm.play().catch(e=>console.log(e));
          }
          iAmReady = false;
          oppIsReady = false;
          if (readyBtn) {
             readyBtn.textContent = '🏳️ SURRENDER'; // 變成投降
             readyBtn.disabled = false;
             readyBtn.style.background = 'var(--Z)';      // 紅色按鍵
             readyBtn.style.color = 'var(--white)';       // 白色字體
             readyBtn.style.borderColor = 'var(--white)'; // 恢復白色邊框
             readyBtn.style.cursor = 'pointer';           // 恢復可點擊的滑鼠手勢
          }
          connStatus.textContent = 'Status: CONNECTED! GO!';
          // 多人對戰：倒數結束才開始顯示 🎯 攻擊目標紅框（之前進房 / 倒數時不框）
          if (window.isMpMulti && typeof updateMpTargetIndicator === 'function') {
            updateMpTargetIndicator();
          }
          // Phase 8：多人對戰 LAST_SURVIVOR 不啟計時，顯示 ∞
          if (window.mpGameActive && window.mpWinCondition === 'LAST_SURVIVOR') {
            if (timerEl) timerEl.textContent = '∞';
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
          } else {
            battleTime = (window.mpGameActive && typeof window.mpMaxTime === 'number') ? window.mpMaxTime : 120;
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(() => {
              if (!gameOver && isMultiplayer && !isPaused && countdownValue <= 0) {
                battleTime--;
                let mins = Math.floor(battleTime / 60);
                let secs = battleTime % 60;
                if (timerEl) timerEl.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

                if (battleTime <= 0) {
                  clearInterval(timerInterval);
                  matchEndReason = 'TIMEOUT';
                  endBattleMatch();
                }
              }
            }, 1000);
          }
        }
        lastActionTime = Date.now(); // 倒數結束，開始嚴格計算掛機時間
        // AI 模式：直接啟動 AI (方塊池會自動產生雙方同步的方塊)
        if (isAIMode) {
          startAI();
        }
        spawn(); // 倒數結束，第一顆方塊才真正落下
      }
    }, 1000); 
  }

  let inviteTimeoutTimer = null;

  // 進入雙人模式的畫面切換邏輯
  function enterMultiplayerMode() {
    // 進入對戰（PVP / AI）前，強制退出 Combo Room / Free Mode，避免設定殘留到對戰
    if (isNarrowMode || isFreeMode) {
      const wasNarrow = isNarrowMode;
      const wasFree = isFreeMode;
      isNarrowMode = false;
      isFreeMode = false;

      if (wasNarrow) {
        const cbBtn = document.getElementById('combo-room-btn');
        if (cbBtn) {
          cbBtn.textContent = window.t('btn.comboRoom', '⚡ 進入 COMBO ROOM');
          cbBtn.style.background = 'linear-gradient(135deg, rgba(56,189,238,0.18), rgba(255,13,98,0.18))';
          cbBtn.style.color = 'var(--Z)';
          cbBtn.style.borderColor = 'var(--Z)';
          cbBtn.style.boxShadow = '0 0 12px rgba(255,13,98,0.55), inset 0 0 8px rgba(56,189,238,0.25)';
          cbBtn.style.textShadow = '0 0 6px rgba(255,13,98,0.7)';
        }
        const cbPanel = document.getElementById('combo-room-panel');
        if (cbPanel) cbPanel.classList.add('hidden');
      }

      if (wasFree) {
        const fmBtn = document.getElementById('free-mode-btn');
        if (fmBtn) {
          fmBtn.textContent = window.t('btn.freeMode', '🧩 進入自由排版');
          fmBtn.style.background = 'transparent';
          fmBtn.style.color = 'var(--I)';
          fmBtn.style.borderColor = 'var(--I)';
        }
        const fmPanel = document.getElementById('free-mode-panel');
        if (fmPanel) fmPanel.classList.add('hidden');
      }

      // 還原排行榜 + NEXT/QUEUE 顯示
      const lb = document.getElementById('leaderboard-container');
      if (lb) lb.style.display = 'flex';
      const nextWrapper = document.getElementById('next-wrapper');
      const queueWrapper = document.getElementById('queue-wrapper');
      if (nextWrapper) nextWrapper.style.visibility = 'visible';
      if (queueWrapper) queueWrapper.style.visibility = 'visible';
    }

    updateMyActivity(isAIMode ? 'AI_BATTLE' : 'MULTIPLAYER'); // 切換為對戰狀態
    isMultiplayer = true;
    document.body.classList.add('battle-mode'); // CSS 用：隱藏語言切換鈕避免蓋到對手框
    if (typeof bgm !== 'undefined') {
      bgm.pause(); // 進入連線模式時，關閉單機 BGM
      bgm.currentTime = 0;
    }
    initMenu();

    // PvP 對戰：把排行榜換成對戰模式選擇面板，重置對手模式狀態 (避免上一場殘留)
    // AI 模式有自己的設定面板，不共用這個
    const lbContainerForMP = document.getElementById('leaderboard-container');
    const battleModePanel = document.getElementById('battle-mode-panel');
    if (!isAIMode) {
      oppBattleMode = null;
      // 不重置 battleMode，讓玩家可以保留上一場選的模式偏好
      if (lbContainerForMP) lbContainerForMP.style.display = 'none';
      if (battleModePanel) battleModePanel.classList.remove('hidden');
      updateBattleModeUI();
    } else {
      // AI 對戰固定使用 BOMB 模式，不出現選單
      battleMode = 'BOMB';
      if (battleModePanel) battleModePanel.classList.add('hidden');
    }

    // --- 進入對戰：將聊天室搬進 layout 並對齊計時器左邊 ---
    const chatIcon = document.getElementById('chat-icon-wrapper');
    const chatPanel = document.getElementById('chat-panel');
    const layout = document.getElementById('layout');
    
    if (chatIcon && layout) {
      chatIcon.classList.remove('hidden');
      layout.appendChild(chatIcon); // 搬進競技場容器
      chatIcon.style.bottom = 'auto';
      chatIcon.style.right = 'auto';
      chatIcon.style.top = '-65px'; // 跟高幀率按鈕、計時器同高度
      chatIcon.style.left = 'calc(50% - 210px)'; // 放在計時器左邊
    }
    if (chatPanel && layout) {
      layout.appendChild(chatPanel); // 搬進競技場容器
      chatPanel.style.bottom = 'auto';
      chatPanel.style.right = 'auto';
      chatPanel.style.top = '0px';  // 往下彈出，對齊畫面上緣
      chatPanel.style.left = 'calc(50% - 410px)'; // 往左邊展開，避免擋住計時器
    }

    // --- 隱藏版本號 ---
    const versionTag = document.getElementById('version-tag');
    
    // 顯示離開房間按鈕
    const mpLeaveBtn = document.getElementById('mp-leave-btn');
    if (mpLeaveBtn) mpLeaveBtn.classList.remove('hidden');

    const connStatus = document.getElementById('conn-status');
    if (connStatus) {
      connStatus.textContent = 'Status: WAITING FOR READY';
      connStatus.style.color = 'var(--O)';
    }
    playSound('perfect'); 

    const oppTitleEl = document.getElementById('opp-name-display');
    if (oppTitleEl) {
      oppTitleEl.innerHTML = 'LOADING...';
      oppTitleEl.style.color = 'rgba(255,255,255,0.5)';
    }

    // 處理自己 (You) 的連勝火焰
    const myTitleEl = document.getElementById('my-name-display');
    if (myTitleEl) {
      if (!isAIMode && myWinStreak >= 3) {
        // 真人對戰且連勝 >= 3，顯示火焰
        myTitleEl.innerHTML = `<div style="position: relative; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;">You<span style="position: absolute; left: 100%; top: 50%; transform: translateY(-50%); color:#ff8c00; text-shadow:0 0 8px #ff0000; margin-left:4px;">🔥</span></div>`;
      } else {
        // AI 模式或未達連勝，維持普通狀態
        myTitleEl.innerHTML = 'You';
      }
    }

    // 這行現在絕對安全了
    if (layout) layout.classList.add('is-multiplayer');

    const oppPanel = document.getElementById('opp-panel');
    const scorePanel = document.getElementById('singleplayer-ui');
    const vsTimer = document.getElementById('vs-timer');

    if (oppPanel) oppPanel.classList.remove('hidden');
    if (scorePanel) scorePanel.classList.add('hidden');
    if (vsTimer) vsTimer.classList.remove('hidden');
    
    document.querySelectorAll('.mp-only').forEach(el => el.classList.remove('hidden'));
    
    // 進入連線模式時隱藏線上名單
    const onlinePanel = document.getElementById('online-panel');
    if (onlinePanel) onlinePanel.classList.add('hidden');

    // 重置並暫停計時器
    if (timerInterval) clearInterval(timerInterval);
    const timerEl = document.getElementById('battle-timer');
    if (timerEl) timerEl.textContent = "02:00";

    // 更新分數與 UI
    if (conn && lastOpponentId !== conn.peer) {
      myWins = 0; oppWins = 0;
      lastOpponentId = conn.peer; 
    }
    const myWinsEl = document.getElementById('my-wins-el');
    const oppWinsEl = document.getElementById('opp-wins-el');
    if (myWinsEl) myWinsEl.textContent = myWins;
    if (oppWinsEl) oppWinsEl.textContent = oppWins;
    
    const scoreboardEl = document.getElementById('scoreboard');
    if (scoreboardEl) scoreboardEl.style.display = 'block';

    const emojiPanel = document.getElementById('emoji-hint-panel');
    if (emojiPanel) emojiPanel.classList.remove('hidden');

    const mpInputGroup = document.getElementById('mp-input-group');
    const mpReadyGroup = document.getElementById('mp-ready-group');
    if(mpInputGroup) mpInputGroup.style.display = 'none';
    if(mpReadyGroup) mpReadyGroup.style.display = 'flex';

    // 進入連線房後，統一隱藏 VS AI 按鈕，避免誤觸
    const aiBtnEl = document.getElementById('ai-btn');
    if (aiBtnEl) aiBtnEl.classList.add('hidden');
    
    const pingDisplay = document.getElementById('ping-display');
    if (pingDisplay) pingDisplay.style.display = isAIMode ? 'none' : 'inline';
    if (pingInterval) clearInterval(pingInterval);

    lastHeartbeat = Date.now(); 

    pingInterval = setInterval(() => {
      // 維持連線的 PING
      if (conn && conn.open) {
        lastPingTime = Date.now();
        conn.send({ type: 'PING' }); 
      }
    }, 2000);
    
    // --- 高幀率按鈕移到 Leave Room 左邊 ---
    const settingsContainer = document.getElementById('settings-container');
    const fpsBtn = document.getElementById('fps-mode-btn');
    // 手機版時 settings-container 應該永遠待在 mobile-drawer 內（含其中的 ONLINE 框），
    // 不要搬到 battle-layout，否則離開房間後它會直接露在畫面上和遊戲元素重疊
    const isMobileLayoutEnter = window.matchMedia('(max-width: 820px)').matches;

    if (settingsContainer && layout && !isMobileLayoutEnter) {
      layout.appendChild(settingsContainer);
      settingsContainer.style.top = '-60px';
      // 右側距離為 175px (160px的按鈕 + 15px的完美間距)
      settingsContainer.style.right = '175px';
      settingsContainer.style.width = '160px';
      if (fpsBtn) {
        fpsBtn.style.width = '160px';
        fpsBtn.style.padding = '10px 0';
        fpsBtn.style.textAlign = 'center';
        fpsBtn.style.fontSize = '14px';
        fpsBtn.style.borderRadius = '25px';
        fpsBtn.style.background = 'transparent';
        fpsBtn.style.backdropFilter = 'blur(4px)';
      }
    }

    setTimeout(sendMyProfile, 500);

    const toast = document.getElementById('invite-toast');
    if (toast && layout) {
      layout.appendChild(toast);
      toast.classList.add('horizontal'); // 掛上橫式 class
      toast.style.position = 'absolute';
      toast.style.margin = '0';
    }

    // 確保所有 UI 切換完畢後，才呼叫自適應縮放
    setTimeout(fitLayout, 100);
  }

  // 退出雙人模式的畫面切換邏輯 (抽離出來)
  function exitMultiplayerMode(showDisconnectWarning = true) {
    if (typeof battleBgm !== 'undefined') battleBgm.pause(); // 退出對戰時切斷音樂
    if (timerInterval) clearInterval(timerInterval); // 退出時確保計時器徹底停止

    // 只要是異常斷線就給通知
    if (showDisconnectWarning && isMultiplayer && !isAIMode) {
      if (gameStarted && !gameOver) {
        gameOver = true;
        showToast(window.t('battle.oppDisconnect', '⚠️ 對手已斷線或離開遊戲！本局不結算。'));
      } else {
        // 處理「在準備大廳被斷線」的情況
        showToast(window.t('battle.connectionLost', '⚠️ 連線已中斷，返回單人模式。'));
      }
    } else if (gameStarted && !gameOver) {
      gameOver = true; // 即使不顯示警告，也要確保遊戲狀態被終止
    }

    // 必須先把 isMultiplayer / isAIMode 重置，updateMyActivity 會觸發 Firebase 名單重算；若此時這兩個旗標還是 true，其他玩家觀戰此人的按鈕會被鎖在「對戰中無法觀戰」狀態
    isMultiplayer = false; isAIMode = false; iAmReady = false; oppIsReady = false;
    document.body.classList.remove('battle-mode'); // 對戰結束，語言切換鈕重新出現
    updateMyActivity('IDLE'); // 退出房間回到閒置大廳

    // 清空對戰殘留盤面，回到 PRESS ENTER 起始畫面（與 exitSpectateMode 對齊）
    if (typeof createBoard === 'function') board = createBoard();
    current = null;
    holdType = null;
    holdUsed = false;
    queue = [];
    score = 0;
    lines = 0;
    level = 1;
    combo = -1;
    b2b = 0;
    activeGarbage = 0;
    nextGarbage = 0;
    gameStarted = false;
    gameOver = false;
    isPaused = false;
    countdownValue = 0;
    matchResult = null;
    isKOed = false;
    clearFx = null;
    // 重置對戰計分（KO / 攻擊行數）與 DOM 顯示，避免下次進對戰看到上一場殘值
    myKOs = 0; oppKOs = 0; myLinesSent = 0; oppLinesSent = 0;
    const myKoElExitMP = document.getElementById('my-ko-display');
    const oppKoElExitMP = document.getElementById('opp-ko-display');
    const myLinesElExitMP = document.getElementById('my-lines-sent-display');
    const oppLinesElExitMP = document.getElementById('opp-lines-sent-display');
    if (myKoElExitMP) myKoElExitMP.textContent = '0';
    if (oppKoElExitMP) oppKoElExitMP.textContent = '0';
    if (myLinesElExitMP) myLinesElExitMP.textContent = '0';
    if (oppLinesElExitMP) oppLinesElExitMP.textContent = '0';
    piecePool = []; myPieceIndex = 0;
    if (scoreEl) scoreEl.textContent = '0';
    if (linesEl) linesEl.textContent = '0';
    if (levelEl) levelEl.textContent = '1';
    const hsEl_exitMP = document.getElementById('high-score');
    if (hsEl_exitMP) hsEl_exitMP.textContent = highScore || 0;
    // 強制刷新 HOLD / NEXT / QUEUE 側邊面板，清掉對戰時留下的方塊
    try { if (typeof renderPanels === 'function') renderPanels(); } catch(e) {}

    // --- 退出對戰：將聊天室搬回原本的右下角 ---
    const chatIcon = document.getElementById('chat-icon-wrapper');
    const chatPanel = document.getElementById('chat-panel');
    const viewport = document.getElementById('viewport');

    if (chatIcon && viewport) {
      chatIcon.classList.remove('hidden');
      viewport.appendChild(chatIcon); // 搬回最外層
      chatIcon.style.top = 'auto';
      chatIcon.style.bottom = '15px';
      chatIcon.style.right = '20px';
      chatIcon.style.left = 'auto';
    }
    if (chatPanel && viewport) {
      viewport.appendChild(chatPanel); // 搬回最外層
      chatPanel.style.top = 'auto';
      chatPanel.style.bottom = '75px';
      chatPanel.style.right = '20px';
      chatPanel.style.left = 'auto';
    }

    // --- 恢復顯示版本號 ---
    const versionTag = document.getElementById('version-tag');

    // 恢復顯示 AI 按鈕
    const aiBtnEl = document.getElementById('ai-btn');
    if (aiBtnEl) aiBtnEl.classList.remove('hidden');

    // 恢復排行榜，隱藏 AI 設定面板與對戰模式選擇面板
    const leaderboardContainer = document.getElementById('leaderboard-container');
    const aiConfigPanel = document.getElementById('ai-config-panel');
    const battleModePanelExit = document.getElementById('battle-mode-panel');
    if (leaderboardContainer) leaderboardContainer.style.display = 'flex';
    if (aiConfigPanel) aiConfigPanel.classList.add('hidden');
    if (battleModePanelExit) battleModePanelExit.classList.add('hidden');
    // 對手已斷線，把對手選擇清空，下次連到新對手時 UI 才不會殘留前一場的狀態
    oppBattleMode = null;

    // 隱藏離開房間按鈕
    const mpLeaveBtn = document.getElementById('mp-leave-btn');
    if (mpLeaveBtn) mpLeaveBtn.classList.add('hidden');

    connStatus.textContent = 'Status: Standby';
    connStatus.style.color = 'rgba(255,255,255,0.5)';
    conn = null; oppState = null;

    const oppTitleEl = document.getElementById('opp-name-display');
    if (oppTitleEl) {
       oppTitleEl.innerHTML = 'OPPONENT';
       oppTitleEl.style.color = 'var(--Z)';
       oppTitleEl.style.textShadow = '0 0 10px var(--Z)';
    }
    // 清掉對手遊戲區的牌位框（下一場連線到別的對手前不要殘留前一個段位）
    const oppPanelExit = document.getElementById('opp-panel');
    if (oppPanelExit) clearRankFrame(oppPanelExit);

    // 退出對戰時，確保火焰被清空，恢復預設的 You
    const myTitleEl = document.getElementById('my-name-display');
    if (myTitleEl) myTitleEl.innerHTML = 'You';

    const layout = document.getElementById('layout');
    if (layout) layout.classList.remove('is-multiplayer'); 

    const oppPanel = document.getElementById('opp-panel');
    const scorePanel = document.getElementById('singleplayer-ui');
    const vsTimer = document.getElementById('vs-timer');

    if (oppPanel) oppPanel.classList.add('hidden');
    if (scorePanel) scorePanel.classList.remove('hidden');
    if (vsTimer) vsTimer.classList.add('hidden'); 
    document.querySelectorAll('.mp-only').forEach(el => el.classList.add('hidden'));

    // 斷線時，如果有登入帳號則恢復顯示線上名單
    if (currentUserUID) {
      const onlinePanel = document.getElementById('online-panel');
      if (onlinePanel) onlinePanel.classList.remove('hidden');
    }

    // --- 恢復按鈕位置：搬回右側面板區域 ---
    const settingsContainer = document.getElementById('settings-container');
    const fpsBtn = document.getElementById('fps-mode-btn');
    // 手機版時 settings-container 應該留在 mobile-drawer 內，不要搬回 viewport，
    // 否則會觸發 `body > .viewport > #settings-container { display:none }` 規則，
    // 連帶把裡面的 #online-panel 也吃掉，造成離開房間後 ONLINE 框不見
    const isMobileLayout = window.matchMedia('(max-width: 820px)').matches;

    if (settingsContainer && viewport && !isMobileLayout) {
      viewport.appendChild(settingsContainer);
      settingsContainer.style.top = '20px';
      settingsContainer.style.right = '20px';
      settingsContainer.style.width = '220px';
      if (fpsBtn) {
        fpsBtn.style.width = '220px';
        fpsBtn.style.padding = '10px';
        fpsBtn.style.textAlign = 'center';
        fpsBtn.style.fontSize = '14px';
        fpsBtn.style.borderRadius = '8px';
        fpsBtn.style.background = 'transparent';
        fpsBtn.style.backdropFilter = 'none';
      }
    }

    // 將邀請框搬回單人模式左下角，並恢復直式
    const toast = document.getElementById('invite-toast');
    const networkSection = document.getElementById('network-section');
    if (toast && networkSection) {
      networkSection.appendChild(toast);
      toast.classList.remove('horizontal'); // 移除橫式 class，變回原本的方塊
      toast.style.position = 'static';
      toast.style.marginTop = '15px';
    }

    setTimeout(fitLayout, 50);

    if(scoreboardEl) scoreboardEl.style.display = 'none'; 
    if(mpInputGroup) mpInputGroup.style.display = 'flex';
    if(mpReadyGroup) mpReadyGroup.style.display = 'none';
    
    const emojiPanel = document.getElementById('emoji-hint-panel');
    if (emojiPanel) emojiPanel.classList.add('hidden');

    if (pingInterval) clearInterval(pingInterval);
    if (pingDisplay) pingDisplay.style.display = 'none';

    // 一回到單機畫面，立刻無縫接軌單人模式的BGM
    if (!isBgmMuted && bgmStarted) {
      bgm.currentTime = 0;
      let playPromise = bgm.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => console.log("BGM autoplay prevented:", e));
      }
    }

    // 確保退出房間時，把按鈕徹底變回預設的綠色 READY
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
      readyBtn.textContent = 'READY';
      readyBtn.style.background = 'var(--S)';
      readyBtn.style.color = 'var(--bg)';
      readyBtn.style.borderColor = 'var(--white)'; // 恢復邊框
      readyBtn.style.cursor = 'pointer';           // 恢復滑鼠手勢
      readyBtn.disabled = false;
    }

    // 強制重拉線上名單：即使 Firebase onValue 沒立刻 fire，也要確保觀戰按鈕恢復可點
    if (typeof listenToOnlineUsers === 'function') listenToOnlineUsers();
  }

  function setupConnection(connection, isSender = false) {
    if (isSender) {
      conn = connection; // 我是發送方，直接作為主要連線
    }

    connection.on('data', (data) => {
      lastHeartbeat = Date.now();

      if (data.type === 'INVITE') {
        if (data.version !== GAME_VERSION) {
          connection.send({ type: 'INVITE_VERSION_MISMATCH', serverVersion: GAME_VERSION, clientVersion: data.version || 'v1.0.0' });
          setTimeout(() => connection.close(), 500);
          return;
        }

        // 多人房間邀請：顯示確認框（不再自動加入），由 accept/reject 流程處理
        if (data.mpRoomCode) {
          // 標記這條連線是 mp invite，accept/reject handler 會看這個欄位走 mp 流程
          connection.__mpRoomCode = data.mpRoomCode;
          // 若已有別人 pendingConn，先客氣回絕舊的
          if (pendingConn && pendingConn !== connection && pendingConn.open) {
            try { pendingConn.send({ type: 'INVITE_REJECT' }); } catch {}
            setTimeout(() => { try { pendingConn.close(); } catch {} }, 300);
          }
          pendingConn = connection;
          document.getElementById('invite-sender-name').textContent = data.from;
          // 副標籤標記為多人房邀請（單獨開個小元素，找不到就退而求其次顯示在主標籤後面）
          let mpHint = document.getElementById('invite-mp-hint');
          const senderEl = document.getElementById('invite-sender-name');
          if (!mpHint && senderEl && senderEl.parentElement) {
            mpHint = document.createElement('div');
            mpHint.id = 'invite-mp-hint';
            mpHint.style.cssText = 'font-size:11px; color:var(--I); font-weight:bold; margin-top:2px;';
            senderEl.parentElement.appendChild(mpHint);
          }
          if (mpHint) {
            mpHint.textContent = window.t('mp.inviteToRoomLabel', '邀請你加入多人對戰房間');
            mpHint.style.display = '';
          }
          const toast = document.getElementById('invite-toast');
          if (toast) {
            toast.classList.remove('hidden');
            toast.classList.add('show-invite');
            toast.getAnimations().forEach(a => a.cancel());
            toast.animate(
              [
                { opacity: 0, transform: 'scale(0.7) translateX(0)' },
                { opacity: 1, transform: 'scale(1.08) translateX(-6px)', offset: 0.5 },
                { opacity: 1, transform: 'scale(1.02) translateX(5px)', offset: 0.7 },
                { opacity: 1, transform: 'scale(1) translateX(-2px)', offset: 0.85 },
                { opacity: 1, transform: 'scale(1) translateX(0)' }
              ],
              { duration: 450, easing: 'cubic-bezier(0.175,0.885,0.32,1.275)', fill: 'forwards' }
            );
          }
          playSound('perfect');
          return;
        }

        // (保持原本的撞車邏輯不變)
        if (conn && !isMultiplayer && data.from === document.getElementById('opp-id-input').value.trim()) {
           if (currentPlayer.localeCompare(data.from) > 0) {
              clearTimeout(conn.inviteTimeout);
              if (conn) conn.close();
              conn = connection; 
              conn.send({ type: 'INVITE_ACCEPT' });
              enterMultiplayerMode();
           } else {
              connection.send({ type: 'INVITE_BUSY' });
              setTimeout(() => connection.close(), 500);
           }
           return;
        }

        pendingConn = connection;
        document.getElementById('invite-sender-name').textContent = data.from;
        // 一般 1v1 邀請：清掉多人房 hint
        {
          const mpHint = document.getElementById('invite-mp-hint');
          if (mpHint) mpHint.style.display = 'none';
        }

        const toast = document.getElementById('invite-toast');
        if (toast) {
           toast.classList.remove('hidden');
           toast.classList.add('show-invite');
           toast.getAnimations().forEach(a => a.cancel());
           toast.animate(
             [
               { opacity: 0, transform: 'scale(0.7) translateX(0)' },
               { opacity: 1, transform: 'scale(1.08) translateX(-6px)', offset: 0.5 },
               { opacity: 1, transform: 'scale(1.02) translateX(5px)', offset: 0.7 },
               { opacity: 1, transform: 'scale(1) translateX(-2px)', offset: 0.85 },
               { opacity: 1, transform: 'scale(1) translateX(0)' }
             ],
             { duration: 450, easing: 'cubic-bezier(0.175,0.885,0.32,1.275)', fill: 'forwards' }
           );
        }
        playSound('perfect');
      }
      else if (data.type === 'MP_INVITE_OK') {
        // 對方已加入多人房 → 清掉這條 1v1 邀請的 timeout 與 outgoingInvites 記錄
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);
        const peerId = connection.peer;
        if (peerId && inviteTimeouts[peerId]) { clearTimeout(inviteTimeouts[peerId]); delete inviteTimeouts[peerId]; }
        if (peerId && outgoingInvites[peerId] === connection) delete outgoingInvites[peerId];
        setTimeout(() => { try { connection.close(); } catch {} }, 300);
        return;
      }
      else if (data.type === 'MP_INVITE_REJECT') {
        // 對方拒絕多人房邀請：清掉 outgoingInvites + 顯示提示
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);
        const peerId = connection.peer;
        if (peerId && inviteTimeouts[peerId]) { clearTimeout(inviteTimeouts[peerId]); delete inviteTimeouts[peerId]; }
        if (peerId && outgoingInvites[peerId] === connection) delete outgoingInvites[peerId];
        showToast(window.t('mp.inviteRejected', '💔 對方拒絕了你的多人對戰邀請'), 3000);
        setTimeout(() => { try { connection.close(); } catch {} }, 500);
        return;
      }
      else if (data.type === 'INVITE_ACCEPT') {
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);

        // 我已在多人對戰房 → 不接受 1v1 邀請接受，直接告知對方
        if (window.isMpMulti) {
          try { connection.send({ type: 'INVITE_LATE' }); } catch {}
          setTimeout(() => { try { connection.close(); } catch {} }, 500);
          return;
        }

        // 先搶先贏！如果我已經進遊戲了，告訴後按的人「太慢啦」
        if (isMultiplayer) {
           connection.send({ type: 'INVITE_LATE' });
           setTimeout(() => connection.close(), 500);
           return;
        }

        // 扶正第一名
        conn = connection;

        // 清理落選者：關閉其他所有發出去的邀請
        for (let peerId in outgoingInvites) {
           if (peerId !== connection.peer && outgoingInvites[peerId].open) {
              outgoingInvites[peerId].close();
           }
        }
        outgoingInvites = {}; // 清空發射名單

        enterMultiplayerMode();
      }
      else if (data.type === 'INVITE_LATE') {
        // 我按了接受，但對方已經跟第一名開始遊戲了
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);
        showToast(window.t('toast.tooSlow', '😭 慢了一步！對方已經跟別人開始遊戲了！'), 4000);
        connStatus.textContent = 'Status: Too Slow';
        connStatus.style.color = 'var(--Z)';
        setTimeout(() => connection.close(), 2000);
      }
      else if (data.type === 'INVITE_BUSY') {
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);
        showToast(window.t('toast.oppInGame', '⚠️ 對方正在遊戲中'));
        connStatus.textContent = 'Status: Player is busy';
        connStatus.style.color = 'var(--O)';
        setTimeout(() => connection.close(), 2000); // 延遲 2 秒關閉
      }
      else if (data.type === 'INVITE_VERSION_MISMATCH') {
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);
        connStatus.textContent = 'Status: Version Mismatch!';
        connStatus.style.color = 'var(--Z)';
        alert(window.t('toast.versionMismatch', '❌ 連線失敗：版本不一致！\n\n請確認雙方都更新到最新版！'));
        connection.close();
      }
      else if (data.type === 'INVITE_REJECT') {
        if (connection.inviteTimeout) clearTimeout(connection.inviteTimeout);
        showToast(window.t('battle.inviteRejected', '💔 對方拒絕了你的對戰邀請！'), 3000);
        connStatus.textContent = 'Status: Rejected';
        connStatus.style.color = 'var(--Z)';

        // 立刻銷毀這條已經沒用的連線，確保下次按 CONNECT 會建立全新連線
        if (outgoingInvites[connection.peer] === connection) {
           delete outgoingInvites[connection.peer];
        }
        connection.close();
      }
      // === 👀 觀戰模式訊息 (走獨立連線，不經過 conn 防護罩) ===
      else if (data.type === 'SPECTATE_REQUEST') {
        handleSpectateRequest(connection, data.from);
      }
      else if (data.type === 'SPECTATE_LEAVE') {
        if (spectatorConns.has(connection.peer)) {
          const info = spectatorConns.get(connection.peer);
          spectatorConns.delete(connection.peer);
          broadcastSpectatorListToAll();
          if (info && info.username) showToast(window.t('toast.specEnded', '👀 {user} 結束了觀戰').replace('{user}', info.username), 2000);
        }
        setTimeout(() => { try { connection.close(); } catch(e) {} }, 200);
      }
      else if (data.type === 'SPECTATE_PING') {
        try { connection.send({ type: 'SPECTATE_PONG' }); } catch(e) {}
      }
      else {
        // === 🎮 遊戲進行階段 ===
        // 如果傳來資料的這條線不是「現任 (conn)」，直接無視它
        if (connection !== conn) return; 

        if (data.type === 'READY') {
           oppIsReady = true; oppSeed = data.seed; checkBothReady();
        } else if (data.type === 'CANCEL_READY') {
           // 對手取消了 READY：把對手狀態還原。如果對戰已經開始或正在倒數就忽略 (太晚了)。
           if (countdownValue > 0 || (gameStarted && !gameOver)) return;
           oppIsReady = false;
           showToast(window.t('battle.oppCancelReady', '↩️ 對手取消了 READY'), 1500);
           refreshReadyButtonLock();
        } else if (data.type === 'MODE_SELECT') {
           // 對手切換對戰模式：更新對手選擇、刷新 UI 與 Ready 按鈕鎖定狀態
           const m = data.mode;
           if (m === 'BOMB' || m === 'CLASSIC') {
             oppBattleMode = m;
             updateBattleModeUI();
           }
        } else if (data.type === 'SURRENDER') {
           if (!gameOver) handleSurrender(true);
        } else if (data.type === 'STATE') {
           // 把 STATE merge 進 oppState，而不是整個覆蓋，否則會把 PROFILE 帶來的 name/uid 蓋掉
           if (!oppState) oppState = {};
           Object.assign(oppState, data.state);
           renderOpponentPanels();
        } else if (data.type === 'ATTACK') {
           if (!gameOver) {
             oppLinesSent += data.lines;
             const oppLinesEl = document.getElementById('opp-lines-sent-display');
             if (oppLinesEl) oppLinesEl.textContent = oppLinesSent;
             myFloatingTexts.push(new FloatingText(`+${data.lines}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 40, '#ff0d62', 50));
             playSound('drop'); shakeMag = 6;
             const gen = matchGeneration; // 捕捉當前世代，防止延遲垃圾滲入下一局
             setTimeout(() => { if (!gameOver && matchGeneration === gen) { nextGarbage += data.lines; sendState(); } }, 2000);
           }
        } else if (data.type === 'I_AM_KO') {
           oppKOTimer = 1000;
           myKOs++; // 對手死掉，是我得分！
           const myKoEl = document.getElementById('my-ko-display'); // 更新左邊「You」面板的紅圈數字
           if (myKoEl) myKoEl.textContent = myKOs;
           oppFloatingTexts.push(new FloatingText("K.O.", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 100));
           playSound('perfect');
        } else if (data.type === 'TOP_OUT_LOSE') {
           if (!gameOver) {
             oppFloatingTexts.push(new FloatingText("TOP OUT!", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 60));
             
             // --- 死亡寬限期邏輯 (收到對手 Top Out) ---
             if (isCheckingGameOver) {
               // 我剛剛已經死了(在寬限期內)，現在收到對手死訊 -> 雙方平局！
               clearTimeout(gameOverTimeout);
               isCheckingGameOver = false;
               showToast(window.t('battle.mutualKO', '🤝 雙方同時 Top Out，平局！'));
               setTimeout(() => { if (!gameOver) { matchEndReason = 'KO'; endBattleMatch('DRAW'); } }, 1000);
             } else {
               // 對手先死了，開啟寬限期，等看看我在這 300ms 內會不會也剛好死掉
               isCheckingGameOver = true;
               showToast(window.t('battle.oppDrowned', '🎉 對手被方塊淹沒了！'));
               gameOverTimeout = setTimeout(() => {
                 isCheckingGameOver = false;
                 if (!gameOver) {
                   // 300ms 過去了我都沒事，我贏了！
                   setTimeout(() => { if (!gameOver) { matchEndReason = 'KO'; endBattleMatch('WIN'); } }, 700);
                 }
               }, GRACE_PERIOD);
             }
           }
        } else if (data.type === 'OPPONENT_DISCONNECTED') {
           // 收到後，系統會跳出警告並立刻讓他退出對戰模式，回到單人畫面
           if (isMultiplayer) {
               exitMultiplayerMode(true);
           }
        } else if (data.type === 'OPPONENT_LEFT_FOR_ANOTHER') {
           // 專門處理「對手接受別人邀請」的超嗆 Toast
           if (isMultiplayer) {
               showToast(window.t('battle.oppLeftForOther', '💔 對手無情地拋棄了你，跟別人跑了！'), 5000);
               // 傳入 false 阻止系統發送預設的斷線警告，改用上面這句專屬的
               exitMultiplayerMode(false); 
           }
        } else if (data.type === 'PROFILE') {
           // 這裡負責接收雙方的名字與連勝火焰，解決 LOADING 卡住的問題
           const p = data.profile;
           const oppTitleEl = document.getElementById('opp-name-display');
           if (oppTitleEl) {
               const fireIcon = (p.streak && p.streak >= 3) ? '<span style="position: absolute; left: 100%; top: 50%; transform: translateY(-50%); color:#ff8c00; text-shadow:0 0 8px #ff0000; margin-left:4px;">🔥</span>' : '';
               
               // 用 div 包裝名字與火焰，確保它們在同一排
               const nameHtml = `<div style="position: relative; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; color: var(--Z);">${p.name || 'OPPONENT'}${fireIcon}</div>`;
               
               // 讀取傳過來的對戰資訊，呼叫你寫好的段位系統上色
               const oppLp = p.lp || 0;
               const rankInfo = getRankInfo(oppLp); // 抓取對應的段位顏色與名稱
               const _rankNameI18n = window.t(rankInfo.nameKey, rankInfo.name);
               const winRateText = p.winRate ? `${window.t('opp.winRatePrefix', ' | 勝率: ')}${p.winRate}` : '';

               // 組合出第二行的戰績文字，字體調小並取消外發光避免太刺眼
               const statsHtml = `<div style="font-size: 13px; color: ${rankInfo.color}; letter-spacing: 0px; text-shadow: none; margin-top: 2px;">${_rankNameI18n} (${oppLp} LP)${winRateText}</div>`;
               
               // 把兩行合併塞進標題區塊
               oppTitleEl.innerHTML = nameHtml + statsHtml;
           }
           if (!oppState) oppState = {};
           oppState.lp = p.lp || 0;
           oppState.isGuest = p.name === 'Guest';
           oppState.name = p.name || 'OPPONENT';
           oppState.uid = p.uid || null;
           // 替整個對手遊戲區套上對應段位的牌位框
           const oppPanelEl = document.getElementById('opp-panel');
           if (oppPanelEl && !oppState.isGuest) {
             const oppRank = getRankInfo(oppState.lp);
             applyRankFrame(oppPanelEl, oppState.lp, window.t(oppRank.nameKey, oppRank.name), { bottomText: `${oppState.lp} LP` });
             // 套上牌位框可能微幅改變視覺需求，重新跑 fitLayout 確保兩邊畫布等大
             if (typeof fitLayout === 'function') setTimeout(fitLayout, 0);
           }
           // Phase 2：廣播對手 profile 給所有觀戰者
           if (spectatorConns && spectatorConns.size > 0) {
             try { broadcastEffectToSpectators('OPP_PROFILE', { profile: p }); } catch(e) {}
           }
        } else if (data.type === 'EMOJI') {
           // 恢復對戰中噴表情符號的功能
           myFloatingTexts.push(new FloatingText(data.emoji, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ffffff', 55));
           playSound('move');
        } else if (data.type === 'PING') {
           if (conn && conn.open) conn.send({ type: 'PONG' });
        } else if (data.type === 'PONG') {
           // 恢復延遲 (Ping) 值的顯示
           const ping = Date.now() - lastPingTime;
           const pingDisplay = document.getElementById('ping-display');
           if (pingDisplay) {
               pingDisplay.textContent = ping + ' ms';
               pingDisplay.style.color = ping < 100 ? 'var(--S)' : (ping < 200 ? 'var(--O)' : 'var(--Z)');
           }
        } else if (data.type === 'UNDO_USED') {
           oppFloatingTexts.push(new FloatingText("⏪ UNDO!", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#38bdee', 40));
           playSound('undo');
        }
      }
    });

    connection.on('close', () => {
      // 觀戰連線關閉：從 spectator 名單移除
      if (spectatorConns && spectatorConns.has(connection.peer)) {
        const info = spectatorConns.get(connection.peer);
        spectatorConns.delete(connection.peer);
        broadcastSpectatorListToAll();
        if (info && info.username) showToast(window.t('toast.specEnded', '👀 {user} 結束了觀戰').replace('{user}', info.username), 2000);
      }
      // 確保連線關閉時，清空對應的狀態變數
      // 多人對戰借用 isMultiplayer=true 旗標時，這條 1v1 conn（邀請流程暫用）關閉不應拆掉 mp-multi 畫面
      if (isMultiplayer && conn === connection && !window.isMpMulti) {
        exitMultiplayerMode();
      }
      
      // 無論如何，只要這條連線斷了，就釋放佔位
      if (conn === connection) {
        conn = null;
        
        // 防呆：如果現在的狀態文字是錯誤訊息，就保留它，不要立刻洗成 Standby
        const keepMsgs = ['Rejected', 'Player is busy', 'No Response', 'Too Slow', 'Version Mismatch', 'Player Offline', 'Player not found', 'Search Error'];
        if (connStatus && !keepMsgs.some(msg => connStatus.textContent.includes(msg))) {
           connStatus.textContent = 'Status: Standby';
           connStatus.style.color = 'rgba(255,255,255,0.5)';
        }
      }

      // 只有當「正在等待的這個連線」斷掉，且沒有新的連線補上時，才收起框框
      if (pendingConn === connection) {
        pendingConn = null;
        const toast = document.getElementById('invite-toast');
        // 只有在真的沒有待處理連線時才隱藏，防止連點時的閃爍
        if (toast && !toast.classList.contains('hidden')) {
           toast.classList.add('hidden');
           toast.classList.remove('show-invite');
        }
      }

      // 把斷掉的線從發射清單裡刪除
      if (outgoingInvites[connection.peer] === connection) {
          delete outgoingInvites[connection.peer];
      }
      // 確保連線斷開時，專屬計時器也被殺死
      if (inviteTimeouts[connection.peer]) {
          clearTimeout(inviteTimeouts[connection.peer]);
          delete inviteTimeouts[connection.peer];
      }
    });

    // 監聽錯誤事件，發生錯誤也要清空 conn
    connection.on('error', (err) => {
      console.log("連線發生錯誤:", err);
      if (conn === connection) conn = null;
    });
  }

  // 更新畫面上 SOUND 的 ON/OFF 顯示，並同步控制 BGM
  function updateSoundUI() {
    const bgmStatusEl = document.getElementById('bgm-status');
    const sfxStatusEl = document.getElementById('sfx-status');

    if (bgmStatusEl) {
      if (isBgmMuted || masterVolume === 0) {
        bgmStatusEl.textContent = 'OFF';
        bgmStatusEl.style.color = 'rgba(255,255,255,0.5)';
      } else {
        bgmStatusEl.textContent = Math.round(masterVolume * 100) + '%';
        bgmStatusEl.style.color = 'var(--white)';
      }
    }

    if (sfxStatusEl) {
      if (isSfxMuted || masterVolume === 0) {
        sfxStatusEl.textContent = 'OFF';
        sfxStatusEl.style.color = 'rgba(255,255,255,0.5)';
      } else {
        sfxStatusEl.textContent = Math.round(masterVolume * 100) + '%';
        sfxStatusEl.style.color = 'var(--white)';
      }
    }
    
    // 同步兩種 BGM 的音量與靜音狀態
    if (typeof bgm !== 'undefined') {
      bgm.muted = isBgmMuted;
      bgm.volume = masterVolume * 0.15;
    }
    if (typeof battleBgm !== 'undefined') {
      battleBgm.muted = isBgmMuted;
      battleBgm.volume = masterVolume * 0.15;
    }
  }
  
  // 迷你合成器：根據不同動作發出不同頻率與波形的聲音
  function playSound(type, param = 0) {
    // 👀 觀戰廣播：把每個音效事件即時送給所有觀戰者，讓他們聽到並觸發震動
    if (typeof spectatorConns !== 'undefined' && spectatorConns && spectatorConns.size > 0 && !_suppressSpectateBroadcast) {
      try { broadcastEffectToSpectators(type, { param: param }); } catch(e) {}
    }
    if (isSfxMuted || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    
    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      gain.gain.setValueAtTime(0.05 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'rotate') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.05 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'drop') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      gain.gain.setValueAtTime(0.15 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'clear') {
      // --- Combo 升頻機制 ---
      // param 接收 Combo 數量，利用十二平均律讓每次 Combo 完美升半音 (乘上 1.05946)
      const pitchMultiplier = Math.pow(1.05946, param); 
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400 * pitchMultiplier, now);
      osc.frequency.linearRampToValueAtTime(1200 * pitchMultiplier, now + 0.3);
      gain.gain.setValueAtTime(0.15 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'quad') {
      // --- Quad 專屬的雙重震盪器「和弦」爆炸聲 ---
      osc.type = 'square';
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.linearRampToValueAtTime(500, now + 0.4);
      
      const osc2 = audioCtx.createOscillator(); // 第二顆音源
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(375, now);  // 疊加完美的五度音程
      osc2.frequency.linearRampToValueAtTime(750, now + 0.4);
      osc2.connect(gain);
      osc2.start(now); osc2.stop(now + 0.5);

      gain.gain.setValueAtTime(0.25 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'tspin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.linearRampToValueAtTime(1760, now + 0.2);
      gain.gain.setValueAtTime(0.2 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'perfect') {
      // --- Perfect Clear 神聖高音 ---
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.linearRampToValueAtTime(2400, now + 0.6);
      gain.gain.setValueAtTime(0.25 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.start(now); osc.stop(now + 0.8);
    } 
    // 獲勝時的凱旋合成器琶音 (C Major 和弦: C-E-G-C)
    else if (type === 'win') {
      const frequencies = [261.63, 329.63, 392.00, 523.25]; // 基礎 C 大調
      frequencies.forEach((freq, index) => {
        const oscW = audioCtx.createOscillator();
        const gainW = audioCtx.createGain();
        oscW.type = 'sawtooth'; // 使用鋸齒波產生明亮、金屬感的合成器銅管聲
        oscW.frequency.setValueAtTime(freq, now);
        oscW.connect(gainW);
        gainW.connect(audioCtx.destination);
        
        // 琶音效果：每個音符稍微延遲發出，形成往上掃弦的感覺
        const startTime = now + index * 0.1; 
        oscW.start(startTime);
        
        gainW.gain.setValueAtTime(0, startTime);
        gainW.gain.linearRampToValueAtTime(0.2 * masterVolume, startTime + 0.1);
        gainW.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5); // 長音漸弱
        oscW.stop(startTime + 1.5);
      });
      
    // 落敗時的低沉嘆息聲
    } else if (type === 'lose') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 1); // 音調無力地下墜
      gain.gain.setValueAtTime(0.25 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.start(now); osc.stop(now + 1.2);
    }
    // 時光倒流的專屬音效 (科幻感的高頻快速下墜)
    else if (type === 'undo') {
      // 製造「磁帶摩擦」的沙沙聲 (White Noise Buffer)
      const bufferSize = audioCtx.sampleRate * 0.7; // 音效總長度 0.7 秒
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;

      // 使用帶通濾波器，讓噪音集中在高頻，聽起來像尖銳的摩擦聲
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(800, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(8000, now + 0.5); // 摩擦聲越來越尖銳

      // 主音頻 (模擬馬達倒轉的咻咻聲)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now); 
      osc.frequency.exponentialRampToValueAtTime(3000, now + 0.5); // 音調像踩油門一樣急速拉高

      // 核心靈魂：黑膠轉盤的「抖動感」(LFO)
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      // 倒帶速度越來越快：從每秒 5 次震動加速到每秒 30 次
      lfo.frequency.setValueAtTime(5, now);
      lfo.frequency.linearRampToValueAtTime(30, now + 0.5); 
      
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.setValueAtTime(800, now); // 抖動的劇烈程度
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency); // 將這個抖動感直接連接到主音頻上

      // 音量控制 (Envelope)
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3 * masterVolume, now + 0.1); // 開頭迅速變大聲
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6); // 結尾順滑地「咻」一聲消失

      // 將噪音也接上這顆音量控制器
      noise.connect(noiseFilter);
      noiseFilter.connect(gain);
      
      // 啟動所有音源
      noise.start(now); noise.stop(now + 0.6);
      osc.start(now); osc.stop(now + 0.6);
      lfo.start(now); lfo.stop(now + 0.6);
    }
  } 

  // --- 粒子引擎與特效 ---
  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 4; 
      this.vy = (Math.random() - 2) * 2 - 1; 
      this.life = 1; 
      this.decay = 0.02 + Math.random() * 0.02; 
      this.color = color;
      this.size = 2 + Math.random() * 3; 
    }
    update(delta) {
      this.x += this.vx * (delta / 16);
      this.y += this.vy * (delta / 16);
      this.vy += 0.1 * (delta / 16); 
      this.life -= this.decay * (delta / 16);
    }
    draw(ctx) {
      // 只畫內核，外暈拔掉（假發光對比不明顯但成本翻倍）
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function triggerLandingEffect(r, c, type) {
    const color = COLORS[type]; 
    const MARGIN = 0; 
    const startX = MARGIN + (c + 0.5) * SIZE;
    const startY = (r - VISIBLE_ROWS + 1) * SIZE; 

    const count = 10 + Math.random() * 5;
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(startX, startY, color));
    }
    
    // 畫面上的粒子如果超過 80 個，強制把最舊的刪掉，防止記憶體溢出卡頓
    if (particles.length > 80) {
      particles.splice(0, particles.length - 80);
    }
  }
  function fitLayout() {
    const layout = document.getElementById('layout');
    if (!layout) return;

    layout.style.transform = 'none';
    const rect = layout.getBoundingClientRect();

    // 統一基礎安全邊界，不再硬塞超大 padding 導致小螢幕嚴重縮水
    const paddingW = 20; 
    const paddingH = 40; 

    // 取得視窗可用空間
    const availW = window.innerWidth - paddingW;
    const availH = window.innerHeight - paddingH;
    
    // 連線模式下，上方有一個飛出界外 (-75px) 的計時器和離房按鈕
    // 把它需要的 85px 真實空間，加進「總需求高度」來計算縮放
    const extraTopSpace = (isMultiplayer || isSpectatingBattle || window.isMpMulti) ? 85 : 0;
    const requiredH = rect.height + extraTopSpace;
    
    // 計算出最完美的縮放比例
    const scale = Math.min(availW / rect.width, availH / requiredH, 1);
    
    // 計算 Y 軸偏移：因為 transform 是基於中心點 (-50%) 縮放
    // 為了把上方的 extraTopSpace 空間讓出來，把中心點「往下推」這段空間的一半
    const offsetY = (isMultiplayer || isSpectatingBattle || window.isMpMulti) ? (extraTopSpace * scale) / 2 : 0;
    
    layout.style.transform = `translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale})`;

    // --- 同步縮放設定按鈕 (高幀率按鈕、線上名單) ---
    const settingsContainer = document.getElementById('settings-container');
    if (settingsContainer) {
      if (settingsContainer.parentElement.id === 'viewport') {
        settingsContainer.style.transform = `scale(${scale})`;
        settingsContainer.style.transformOrigin = 'top right';
      } else {
        // 進對戰模式時清除縮放 (因為外層的 layout 已經縮放過，避免雙重縮小)
        settingsContainer.style.transform = 'none';
      }
    }
    
    const onlinePanel = document.getElementById('online-panel');
    if (onlinePanel) onlinePanel.style.transform = 'none';

    // --- 右下角的版本號碼也跟隨同步縮放 ---
    const versionTag = document.getElementById('version-tag');
    if (versionTag) {
      versionTag.style.transform = `scale(${scale})`;
      versionTag.style.transformOrigin = 'bottom right';
    }
  }

  function clone(m) { return m.map(row => row.slice()); }

  // Combo Room：把寬度以外的左右側欄位填上 'W' 牆壁
  // 牆壁是不可消除的標記：但因為它「永遠是滿的」，玩家只要把中間 N 格填滿，
  // 整行就會被當成滿行消掉，再 unshift 新空行時會自動補回新的牆壁。
  function getWallBounds() {
    const left = Math.floor((COLS - narrowWidth) / 2);
    return { left, right: left + narrowWidth };
  }
  function isWallCol(c) {
    if (!isNarrowMode) return false;
    const { left, right } = getWallBounds();
    return c < left || c >= right;
  }
  function applyWalls(row) {
    if (!isNarrowMode) return row;
    const { left, right } = getWallBounds();
    for (let c = 0; c < COLS; c++) {
      if (c < left || c >= right) row[c] = 'W';
    }
    return row;
  }
  function emptyRow() { return applyWalls(Array(COLS).fill(null)); }

  // Combo Room：把整張盤面（含網格、方塊）視覺平移，使「窄場中心」對齊到「畫布中心」
  // 例：3-Wide 場地的中心是 col 4.5（active 3-5），畫布中心是 col 5，差 0.5 格 → 平移 +17px
  function getNarrowOffsetX() {
    if (!isNarrowMode) return 0;
    const { left } = getWallBounds();
    const activeCenter = left + narrowWidth / 2;
    const canvasCenter = COLS / 2;
    return (canvasCenter - activeCenter) * SIZE;
  }

  function createBoard() { return Array.from({length: ROWS}, () => emptyRow()); }

  // --- 偽隨機數生成器 (PRNG) ---
  function rng() {
    // 只有「真實連線對戰」才需要同步隨機數，其餘都用原生亂數
    if (!isMultiplayer || isAIMode) return Math.random();
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); // 替換掉 Math.random()
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  
  // --- 共享方塊生成池 ---
  function getPieceFromPool(index) {
    // 如果池子裡的方塊不夠，就再生成一包 (7顆) 塞進去
    while (piecePool.length <= index) {
      let chunk = ['I','J','L','O','S','T','Z'];
      // 雙人連線時使用共同的 rng()，其餘使用原生的亂數
      for (let i = chunk.length - 1; i > 0; i--) {
        const r = (isMultiplayer && !isAIMode) ? rng() : Math.random();
        const j = Math.floor(r * (i + 1));
        [chunk[i], chunk[j]] = [chunk[j], chunk[i]];
      }
      piecePool.push(...chunk);
    }
    return piecePool[index];
  }

  function pullBag() {
    return getPieceFromPool(myPieceIndex++);
  }

  function aiPullBag() {
    return getPieceFromPool(aiPieceIndex++);
  }

  function ensureQueue() { while (queue.length < 5) queue.push(pullBag()); }
  function aiEnsureQueue() { while (aiQueue.length < 5) aiQueue.push(aiPullBag()); }

  function makePiece(type) {
    // Combo Room：2/3-Wide 場地下，I 方塊強制以直立姿態出生（rot=3，I 在 4x4 矩陣的 col 1）
    // 否則橫向 I 寬度 4 會 TOP OUT
    const forceVerticalI = isNarrowMode && narrowWidth < 4 && type === 'I';
    const initialRot = forceVerticalI ? 3 : 0;
    const matrix = clone(PIECES[type][initialRot]);
    const width = matrix[0].length;
    // 將方塊出生在隱藏區的最底部 (畫面正上方)
    const startRow = type === 'I' ? 18 : 19;
    // Combo Room 模式下，把方塊生在窄場正中央，避免與牆重疊
    let centerCol;
    if (isNarrowMode) {
      const { left } = getWallBounds();
      if (forceVerticalI) {
        // 直立 I 在矩陣 col 1，把它對齊到窄場的中央格
        centerCol = left + Math.floor(narrowWidth / 2) - 1;
      } else {
        centerCol = left + Math.floor((narrowWidth - width) / 2);
      }
    } else {
      centerCol = Math.floor(COLS / 2) - Math.ceil(width / 2);
    }
    return { type, matrix, rot: initialRot, row: startRow, col: centerCol, lowestRow: startRow, startScore: score};
  }

  // --- 更新畫面分數與存取最高分 ---
  function updateHUD() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);
    
    // 只有在「單人模式」且「非練習模式」且「非 Combo Room / Free Mode」，才計算並上傳最高分
    if (!isMultiplayer && !isPracticeMode && !isNarrowMode && !isFreeMode && currentPlayer !== 'Admin_Mars') {
      if (score > highScore) {
        highScore = score;
        
        // 這裡只負責更新訪客的本機紀錄，不再狂戳 Firebase
        if (!currentUserUID) {
          localStorage.setItem('tetrisHighScore', highScore);
        }
      }
    }
    
    // 更新畫面上顯示的最高紀錄 (這行保持在外面，確保單人/雙人畫面都能顯示紀錄)
    if (highScoreEl) highScoreEl.textContent = String(highScore);
  }

  // --- 遊戲結束 / KO 處理系統 ---
  function triggerGameOver(saveCurrent = false) {
    if (gameOver) return;
    if (isMultiplayer && isKOed) return;

    // 如果是還沒落地的方塊導致 KO (例如被垃圾頂死)，把這顆方塊記下來！
    let pieceToSave = (saveCurrent && current) ? current.type : null;

    let hasGarbage = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r].includes('G') || board[r].includes('B')) { hasGarbage = true; break; }
    }
    
    shakeMag = 20; 
    playSound('drop');

    if (isMultiplayer) {
      // === Phase 7：多人對戰 top-out 走 MP_ELIMINATED / MP_KO ===
      if (window.mpGameActive) {
        const lastAtk = window.recentIncomingAttacks && window.recentIncomingAttacks.length
          ? window.recentIncomingAttacks[window.recentIncomingAttacks.length - 1] : null;
        const killerPeerId = lastAtk ? lastAtk.from : null;
        if (!hasGarbage) {
          isKOed = true;
          current = null;
          broadcastMp({ type: 'MP_ELIMINATED', killerPeerId });
          // 本地也記殺手的 KO（如果是別人；自殺不算）
          if (killerPeerId) {
            const k = mpPlayersMap.get(killerPeerId);
            if (k) { k.ko = (k.ko || 0) + 1; updateMpSlotStats(killerPeerId); }
          }
          showMsg("TOP OUT!");
          myFloatingTexts.push(new FloatingText("TOP OUT!", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 60));
          playSound('lose');
          // 本機立刻顯示 YOU LOSE，但「整場對戰結算 (WIN overlay)」要等到只剩一個存活者時才由 checkLastSurvivor 觸發
          // 在本機 mpPlayersMap 也標自己為 eliminated（廣播給其他人的 MP_ELIMINATED 由各自 handler 標）
          const myPid_te = getMpPeerId();
          if (myPid_te) {
            const me_te = mpPlayersMap.get(myPid_te);
            if (me_te) me_te.eliminated = true;
          }
          gameOver = true;
          matchResult = 'LOSE';
          // 給 600ms 緩衝再判定，讓對方剛飛來的 MP_ELIMINATED / MP_STATE 有機會先到位
          setTimeout(() => { if (typeof checkLastSurvivor === 'function') checkLastSurvivor(); }, 600);
          return;
        }
        // 有垃圾 → 被 KO（被消化）但會復活；廣播 MP_KO，計凶手分
        isKOed = true;
        canUndo = false;
        previousGameState = null;
        broadcastMp({ type: 'MP_KO', killerPeerId });
        if (killerPeerId) {
          const k = mpPlayersMap.get(killerPeerId);
          if (k) { k.ko = (k.ko || 0) + 1; updateMpSlotStats(killerPeerId); }
        }
        activeGarbage = 0;
        nextGarbage = 0;
        myFloatingTexts.push(new FloatingText("K.O.", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 100));
        current = null;
        // 復活：清掉垃圾繼續
        setTimeout(() => {
          if (!window.mpGameActive || gameOver) return;
          let newBoard = board.filter(row => !row.includes('G') && !row.includes('B'));
          while (newBoard.length < ROWS) newBoard.unshift(Array(COLS).fill(null));
          board = newBoard;
          activeGarbage = 0; nextGarbage = 0;
          holdUsed = false; isKOed = false; clearFx = null;
          lockTimer = 0; lockResets = 0; gravityTimer = 0;
          moveCooldown = 0; dasTimer = 0; arrTimer = 0;
          activeDir = 0; lastMoveType = null; lastKickIndex = 0;
          keysDown.clear();
          if (pieceToSave) { current = makePiece(pieceToSave); renderPanels(); }
          else { spawn(); }
        }, 1000);
        return;
      }
      if (!hasGarbage) {
        isKOed = true;
        current = null;
        aiSelfDestructed = true;
        if (conn && conn.open) conn.send({ type: 'TOP_OUT_LOSE' });
        showMsg("TOP OUT!");
        myFloatingTexts.push(new FloatingText("TOP OUT!", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 60));
        playSound('lose');

        // --- 死亡寬限期邏輯 (自己 Top Out) ---
        if (isCheckingGameOver) {
          // 對手剛剛已經傳來死訊，現在我也死了 -> 雙方同時 Top Out！平局！
          clearTimeout(gameOverTimeout);
          isCheckingGameOver = false;
          setTimeout(() => { if (!gameOver) { matchEndReason = 'KO'; endBattleMatch('DRAW'); } }, 1200);
        } else {
          // 我先死了，啟動寬限期，等看看對手會不會在 300ms 內也死掉
          isCheckingGameOver = true;
          gameOverTimeout = setTimeout(() => {
            isCheckingGameOver = false;
            if (!gameOver) {
              // 寬限期過了對手都沒事，那就是我真的輸了 (900ms 是保留給文字動畫飄完的時間)
              setTimeout(() => { if (!gameOver) { matchEndReason = 'KO'; endBattleMatch('LOSE'); } }, 900);
            }
          }, GRACE_PERIOD);
        }
        return;
      }

      isKOed = true;
      // 被 KO 後原本的 undo 快照已經失效（盤面被清、方塊被重給），必須沒收，否則復活後按 A 會生出一模一樣的方塊
      canUndo = false;
      previousGameState = null;
      if (conn && conn.open) conn.send({ type: 'I_AM_KO' });

      activeGarbage = 0;
      nextGarbage = 0;
      oppKOs++;
      const oppKoEl = document.getElementById('opp-ko-display');
      if (oppKoEl) oppKoEl.textContent = oppKOs;

      myFloatingTexts.push(new FloatingText("K.O.", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 100));

      current = null; 
      sendState();    
      
      setTimeout(() => {
        if (!isMultiplayer || matchResult) return;

        let newBoard = board.filter(row => !row.includes('G') && !row.includes('B'));
        while (newBoard.length < ROWS) {
          newBoard.unshift(Array(COLS).fill(null));
        }
        board = newBoard;

        activeGarbage = 0;
        nextGarbage = 0;
        holdUsed = false;
        isKOed = false; 
        clearFx = null;
        lockTimer = 0;
        lockResets = 0;
        gravityTimer = 0;
        moveCooldown = 0;
        dasTimer = 0;
        arrTimer = 0;
        activeDir = 0;
        lastMoveType = null;
        lastKickIndex = 0;
        keysDown.clear();

        // 如果剛才有記下被沒收的方塊，直接還給玩家，不動 Queue
        if (pieceToSave) {
          current = makePiece(pieceToSave);
          renderPanels(); 
          sendState();
        } else {
          spawn(); 
        }
      }, 1000);

    } else {
      // (單機版 Game Over 邏輯保持不變...)
      gameOver = true;
      updateMyActivity('IDLE'); // 單機死掉後，狀態變回大廳閒置
      playSound('lose'); 
      if (!isPracticeMode && !isNarrowMode && !isFreeMode && isCloudDataLoaded && currentUserUID && currentPlayer && currentPlayer !== 'Admin_Mars') {
        db.collection('users').doc(currentUserUID).set({
          username: currentPlayer,
          highScore: highScore,
          lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(err => {
          console.error("雲端存檔失敗:", err.message);
        });
      }
    }
  }

  // --- 2分鐘時間到，結算對戰勝負與積分 ---
  function endBattleMatch(forcedResult = null) {
    // 多人對戰：不走 1v1 結算（避免寫入 1v1 戰績、重置成「等待對手」鎖死按鈕）
    if (window.mpGameActive) {
      return mpEndMatch(forcedResult);
    }
    gameOver = true;
    if (typeof battleBgm !== 'undefined') battleBgm.pause(); // 時間到，切斷對戰音樂
    if (isMultiplayer) {
      // 基礎勝負邏輯判定 (支援投降與行高矮度判定)
      if (forcedResult) {
        matchResult = forcedResult;
      } else {
        if (myKOs > oppKOs) matchResult = 'WIN';
        else if (myKOs < oppKOs) matchResult = 'LOSE';
        else {
          if (myLinesSent > oppLinesSent) matchResult = 'WIN';
          else if (myLinesSent < oppLinesSent) matchResult = 'LOSE';
          else {
            // 進入平手判定，計算雙方畫面的「最高方塊高度」
            let myHeight = 0;
            for (let r = 0; r < ROWS; r++) {
              if (board[r].some(cell => cell !== null)) { myHeight = ROWS - r; break; }
            }
            
            let oppHeight = 0;
            if (oppState && oppState.b) {
              let idx = 0;
              for (let r = 0; r < ROWS; r++) {
                let hasBlock = false;
                for (let c = 0; c < COLS; c++) {
                  if (oppState.b[idx++] !== '.') hasBlock = true;
                }
                if (hasBlock) { oppHeight = ROWS - r; break; }
              }
            }

            // 高度越低越好
            if (myHeight < oppHeight) matchResult = 'WIN';
            else if (myHeight > oppHeight) matchResult = 'LOSE';
            else matchResult = 'DRAW'; // 真的連高度都完全一樣才平手
          }
        }
      }

      // 根據勝負結果播放專屬音效
      if (matchResult === 'WIN') playSound('win');
      else if (matchResult === 'LOSE') playSound('lose');

      // --- AI 高手模式挑戰紀錄寫入 ---
      if (isAIMode && matchResult === 'WIN' && aiSpeedMode === 'pro' && !aiSelfDestructed) {
        if (currentUserUID && currentPlayer !== 'Admin_Mars') {
          db.collection('users').doc(currentUserUID).set({
            aiProWins: firebase.firestore.FieldValue.increment(1) // 勝場 +1
          }, { merge: true }).catch(err => console.error("AI戰績更新失敗:", err));
        }
      }

      // 更新房間內的累計大比分 (不影響資料庫)
      if (matchResult === 'WIN') myWins++;
      else if (matchResult === 'LOSE') oppWins++;
      if (myWinsEl) myWinsEl.textContent = myWins;
      if (oppWinsEl) oppWinsEl.textContent = oppWins;

      // 嚴謹防刷判定 (Valid Match)
      let oppScore = (oppState && oppState.s) ? oppState.s : 0;
      let oppLP = (oppState && oppState.lp) ? oppState.lp : 0;
      let oppIsGuest = (oppState && oppState.isGuest) ? true : false;
      
      // 條件：時間耗盡(0秒)、我方破千分、對方破千分、我方非訪客、對方非訪客、非AI
      let isValidMatch = !isAIMode && (battleTime <= 0) && (score >= 1000) && (oppScore >= 1000) && currentUserUID && !oppIsGuest && currentPlayer !== 'Admin_Mars';

      // 如果是投降局，只要雙方不是訪客/管理員，無條件視為「有效對戰」進行扣分與加分！
      if (forcedResult && currentUserUID && !oppIsGuest && currentPlayer !== 'Admin_Mars') {
        isValidMatch = true;
      }

      // 4. 排位積分 (LP) 結算邏輯
      if (isValidMatch) {
        let lpChange = 0;
        let lpDiff = oppLP - myLP;
        const preMyLP = myLP; // 保留對戰前的 LP 給戰紀使用

        // 每日虐菜場次重置 (以台灣時間 UTC+8 為準)
        const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        if (myDailyBullyDate !== today) {
          myDailyBullyDate = today;
          myDailyBullyWins = 0;
        }

        if (matchResult === 'WIN') {
          const tierGap = -lpDiff; // 我比對手高多少 LP，正數代表對手比我弱

          if (tierGap < 200) {
            // 正常局 (同段位或對手比我強)
            lpChange = 20;
            if (lpDiff >= 200) lpChange += 15;      // 越大級打怪
            else if (lpDiff >= 100) lpChange += 10;
            if (myWinStreak >= 5) lpChange += 10;   // 高連勝獎勵
            else if (myWinStreak >= 2) lpChange += 5;
            if (score >= 15000) lpChange += 5;      // 表現優異獎勵
            myWinStreak++;
          } else if (tierGap < 300) {
            // 輕度虐菜：基礎 +5，無任何獎勵
            myDailyBullyWins++;
            lpChange = (myDailyBullyWins > 2) ? 0 : 5;
            if (lpChange > 0) myWinStreak++;
            // lpChange = 0 時「算勝場但不算連勝」
          } else if (tierGap < 400) {
            // 中度虐菜：象徵性 +1
            myDailyBullyWins++;
            lpChange = (myDailyBullyWins > 2) ? 0 : 1;
            if (lpChange > 0) myWinStreak++;
          } else {
            // 重度虐菜 (差 2 段位以上)：一律 0 LP，不計連勝
            myDailyBullyWins++;
            lpChange = 0;
          }

          myLoseStreak = 0; // 任何勝場都重置連敗
        }
        else if (matchResult === 'LOSE') {
          lpChange = -15; // 基礎落敗扣分
          if (myLP >= 800) lpChange = -20;        // 鑽石以上懲罰增加
          if (myLP >= 1200) lpChange = -25;       // 菁英懲罰最高

          // 方案 C：輸給強者扣分減半 (雖敗猶榮強化版)
          if (lpDiff >= 200) {
            lpChange = Math.ceil(lpChange / 2);   // -15→-7, -20→-10, -25→-12
          } else if (lpDiff <= -200) {
            lpChange -= 15;                       // 爆冷門慘輸加重
          }

          // 方案 C：連輸 3 場觸發一場保底 (這場不扣分，然後重置連敗計數器)
          myLoseStreak++;
          if (myLoseStreak >= 3) {
            lpChange = 0;
            myLoseStreak = 0;
          }

          myWinStreak = 0;
        }
        else {
          myWinStreak = 0; // 平手中斷連勝
        }

        myLP = Math.max(0, myLP + lpChange);

        // 寫入對戰紀錄 (match history) 子集合
        try {
          const oppName = (oppState && oppState.name) ? oppState.name : 'OPPONENT';
          const oppUid = (oppState && oppState.uid) ? oppState.uid : null;
          // 對戰時長 (秒)：扣掉 3 秒倒數時間
          const rawSec = Math.round((Date.now() - (matchStartTime || Date.now())) / 1000) - 3;
          const durationSec = Math.max(1, rawSec);
          const durationMin = durationSec / 60;
          const myAPM = Math.round(myLinesSent / durationMin);
          const myPPS = +(piecesPlaced / durationSec).toFixed(2);
          // 對手統計（從最後一次 STATE 封包讀取）
          const oppLinesCleared = (oppState && typeof oppState.ln === 'number') ? oppState.ln : 0;
          const oppMaxCombo = (oppState && typeof oppState.mc === 'number') ? oppState.mc : 0;
          const oppPiecesPlaced = (oppState && typeof oppState.pp === 'number') ? oppState.pp : 0;
          const oppAPM = Math.round(oppLinesSent / durationMin);
          const oppPPS = +(oppPiecesPlaced / durationSec).toFixed(2);
          // 結束原因：優先用顯式設定的，否則根據狀況推斷
          let reason = matchEndReason;
          if (!reason) {
            if (forcedResult && battleTime > 0) reason = 'KO';
            else reason = 'TIMEOUT';
          }
          const historyEntry = {
            ts: firebase.firestore.FieldValue.serverTimestamp(),
            result: matchResult,            // WIN / LOSE / DRAW
            reason: reason,                 // TIMEOUT / KO / SURRENDER
            opponent: oppName,
            opponentUid: oppUid,
            myLP: preMyLP,                  // 對戰前我方 LP
            oppLP: oppLP,                   // 對戰前對方 LP
            myRank: getRankInfo(preMyLP).name,
            oppRank: getRankInfo(oppLP).name,
            lpChange: lpChange,
            myScore: score,
            oppScore: oppScore,
            myLines: lines,                 // 本局我方總消行數
            oppLines: oppLinesCleared,      // 本局對方總消行數
            myLinesSent: myLinesSent,       // 本局我方送出的攻擊行數
            oppLinesSent: oppLinesSent,     // 本局對方送出的攻擊行數
            myKOs: myKOs,
            oppKOs: oppKOs,
            myMaxCombo: maxCombo,
            oppMaxCombo: oppMaxCombo,
            myApm: myAPM,
            oppApm: oppAPM,
            myPps: myPPS,
            oppPps: oppPPS,
            // 舊欄位保留相容
            maxCombo: maxCombo,
            apm: myAPM,
            pps: myPPS,
            durationSec: durationSec
          };
          // GoatCounter：對戰結束結果（WIN / LOSE / DRAW），可看到全站勝負分布
          if (window.goatcounter && window.goatcounter.count && matchResult) {
            window.goatcounter.count({
              path: 'match-end-' + String(matchResult).toLowerCase(),
              title: 'Match end: ' + matchResult,
              event: true,
            });
          }
          db.collection('users').doc(currentUserUID)
            .collection('matchHistory').add(historyEntry)
            .then(() => {
              // 自動修剪：保留最新 50 筆，舊的刪掉 (Firestore JS SDK 沒有 offset，先拉 200 筆再切片)
              db.collection('users').doc(currentUserUID)
                .collection('matchHistory')
                .orderBy('ts', 'desc')
                .limit(200)
                .get()
                .then(snap => {
                  if (snap.size <= 50) return;
                  const extras = snap.docs.slice(50);
                  const batch = db.batch();
                  extras.forEach(d => batch.delete(d.ref));
                  batch.commit().catch(err => console.error('修剪舊紀錄失敗:', err));
                })
                .catch(err => console.warn('查詢舊紀錄失敗:', err));
            })
            .catch(err => console.error('對戰紀錄寫入失敗:', err));
        } catch (e) { console.error('對戰紀錄建立失敗:', e); }

        // 5. 將數據寫入 Firebase (含生涯累計)
        const durForCareer = Math.max(1, Math.round((Date.now() - (matchStartTime || Date.now())) / 1000) - 3);
        let updateData = {
          matches: firebase.firestore.FieldValue.increment(1),
          lp: myLP,
          winStreak: myWinStreak,
          loseStreak: myLoseStreak,
          dailyBullyWins: myDailyBullyWins,
          dailyBullyDate: myDailyBullyDate,
          // 生涯累計 (給 PLAYER 面板計算平均)
          careerLinesSent: firebase.firestore.FieldValue.increment(myLinesSent),
          careerLines: firebase.firestore.FieldValue.increment(lines),
          careerKOs: firebase.firestore.FieldValue.increment(myKOs),
          careerPieces: firebase.firestore.FieldValue.increment(piecesPlaced),
          careerDurationSec: firebase.firestore.FieldValue.increment(durForCareer),
          careerComboSum: firebase.firestore.FieldValue.increment(maxCombo || 0)
        };
        if (matchResult === 'WIN') {
          updateData.wins = firebase.firestore.FieldValue.increment(1);
        }

        db.collection('users').doc(currentUserUID).set(updateData, { merge: true })
        .then(() => {
          // 寫入成功後重新讀取資料，確保 UI 上的勝率、段位與火焰同步更新
          db.collection('users').doc(currentUserUID).get().then(doc => {
            if(doc.exists) {
              const data = doc.data();
              const m = data.matches || 0;
              const w = data.wins || 0;
              const wr = m > 0 ? Math.round((w / m) * 100) : 0;
              const currentStreak = data.winStreak || 0;
              
              document.getElementById('display-matches').textContent = m;
              document.getElementById('display-winrate').textContent = wr + '%';
              updateRankUI(data.lp || 0);
              updateCareerStatsUI(data);

              // 更新名字旁邊的連勝火焰
              const fireIcon = currentStreak >= 3 ? '<span style="color:#ff8c00; text-shadow:0 0 8px #ff0000; margin-left:4px;">🔥</span>' : '';
              document.getElementById('display-username').innerHTML = currentPlayer + fireIcon;

              // 將最新戰績名片發送給對手同步
              if (typeof sendMyProfile === 'function') sendMyProfile(); 
            }
          });
        });
      } else {
        console.log("此對局未達有效對戰門檻，不計入排位積分。");
        // 只在真正「有可能被誤會成排位對戰」的情境提示玩家，避免 AI / 訪客 / 管理員也跳提示
        if (!isAIMode && currentPlayer !== 'Admin_Mars' && !oppIsGuest && isMultiplayer) {
          // 組出具體原因，讓玩家知道為什麼沒列入
          const reasons = [];
          if (battleTime > 0 && !forcedResult) reasons.push('• 時間未耗盡 (需打滿或投降)');
          if (score < 1000) reasons.push('• 你的分數未達 1000');
          if ((oppState && oppState.s ? oppState.s : 0) < 1000) reasons.push('• 對手分數未達 1000');
          if (!currentUserUID) reasons.push('• 你尚未登入');
          const reasonText = reasons.length ? reasons.join('\n') : '• 雙方條件不足';
          // 延遲一點點彈出，讓勝負動畫先播完不會被 alert 卡住
          setTimeout(() => {
            alert(window.t('battle.notRanked', '⚠️ 本局未列入排位積分 (LP) 計算\n\n{reason}\n\n✨ 提示：雙方都需要達到 1000 分且時間耗盡 (或有一方投降)，才會計入段位與對戰紀錄。').replace('{reason}', reasonText));
          }, 1500);
        }
      }

      // 停止所有方塊動作並同步最終狀態給對手
      current = null;
      sendState();

      // 恢復 READY 按鈕供下一局使用
      if (mpReadyGroup) mpReadyGroup.style.display = 'flex';
      iAmReady = false;
      oppIsReady = false; // 重置對手的準備狀態，確保下一局判定正常

      // 把按鈕的外觀徹底變回預設的綠色 READY
      const readyBtn = document.getElementById('ready-btn');
      if (readyBtn) {
        readyBtn.textContent = 'READY';
        readyBtn.style.background = 'var(--S)';
        readyBtn.style.color = 'var(--bg)';
        readyBtn.style.borderColor = 'var(--white)'; // 恢復邊框
        readyBtn.style.cursor = 'pointer';           // 恢復滑鼠手勢
        readyBtn.disabled = false;
        readyBtn.style.opacity = '1';
      }
      // 重新跑一次 mode 同步檢查：如果雙方上一局所選模式仍一致，READY 維持綠色可按；
      // 若中途有人改過模式而尚未一致，則重新鎖回灰色「模式不一致」
      if (!isAIMode) refreshReadyButtonLock();

    } else {
      // 單人模式時間到的處理
      updateHUD();
    }
  }

  function valid(matrix, row, col) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const br = row + r, bc = col + c;
        if (bc < 0 || bc >= COLS || br >= ROWS) return false;
        if (br >= 0 && board[br][bc]) return false;
      }
    }
    return true;
  }

  function drawCell(target, x, y, size, color, scale=1, alpha=1, ghost=false) {
    const inset = (size * (1 - scale)) / 2;

    // --- 純程式碼繪製的高質感炸彈 ---
    if (color === '#ff1111' && !ghost) { // 假設傳入亮紅色代表炸彈
      target.save();
      target.globalAlpha = alpha;
      const cx = x + inset + (size * scale) / 2;
      const cy = y + inset + (size * scale) / 2;
      const r = (size * scale) / 2 - 2;

      // 畫深灰色金屬外殼
      target.fillStyle = '#333333';
      target.beginPath();
      target.arc(cx, cy, r, 0, Math.PI * 2);
      target.fill();
      target.lineWidth = 2;
      target.strokeStyle = '#111111';
      target.stroke();

      // 畫中間發光的紅色核心
      target.fillStyle = '#ff1111';
      target.beginPath();
      target.arc(cx, cy, r * 0.5, 0, Math.PI * 2); 
      target.fill();
      
      // 用一層半透明圓形模擬原本的紅色光暈，效能較佳
      target.fillStyle = 'rgba(255, 17, 17, 0.4)'; 
      target.beginPath();
      target.arc(cx, cy, r * 0.5 + 4, 0, Math.PI * 2); // 在原本圓形的基礎上多加 4px 光暈
      target.fill();

      // 3. 畫一顆白色的高光反光點 (增加立體感)
      target.fillStyle = 'rgba(255, 255, 255, 0.8)';
      target.beginPath();
      target.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
      target.fill();
      
      target.restore();
      return; // 炸彈畫完就結束，不畫方形邊框
    }

    // --- 高效能方塊繪製邏輯 ---
    const needAlpha = alpha !== 1;
    if (needAlpha) target.globalAlpha = alpha;
    
    if (ghost) {
      target.strokeStyle = color;
      target.lineWidth = 2;
      target.strokeRect(x + inset + 3, y + inset + 3, size * scale - 6, size * scale - 6);
    } else if (scale === 1 && color !== '#ff1111') {
      // 如果沒有被縮放，也不是特殊炸彈，直接貼上預先畫好的圖片
      const cachedImg = getCachedCell(color, size);
      target.drawImage(cachedImg, x + inset, y + inset);
    } else {
      // 只有在特殊形變時才動用昂貴的向量運算
      target.fillStyle = color;
      target.fillRect(x + inset, y + inset, size * scale, size * scale);
      target.strokeStyle = BG;
      target.lineWidth = 4;
      target.strokeRect(x + inset, y + inset, size * scale, size * scale);
    }
    
    if (needAlpha) target.globalAlpha = 1;
  }

  function drawGrid() {
    // 直接貼上已經預先畫好的整張網格圖片
    // drawImage 必須帶邏輯大小，否則會用 gridCanvas 的內部 (DPR 倍) 尺寸把格子畫成 DPR² 倍大
    ctx.drawImage(gridCanvas, 0, 0, CANVAS_W, CANVAS_H);
  }

  function ghostRow() {
    let row = current.row;
    while (valid(current.matrix, row + 1, current.col)) row++;
    return row;
  }

  function drawPiece(piece, rowOverride, colOverride, alpha=1, ghost=false) {
    const baseRow = rowOverride !== undefined ? rowOverride : piece.row;
    // 如果有傳入視覺 X，就用視覺 X；否則用原本的邏輯 X
    const baseCol = colOverride !== undefined ? colOverride : piece.col; 

    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[r].length; c++) {
        if (!piece.matrix[r][c]) continue;
        const rr = baseRow + r;
        const cc = baseCol + c;
        if (rr < 0) continue; 

        // 把小數點座標乘上 SIZE (34)，Canvas 會自動用次像素(Sub-pixel)渲染，達到極度平滑
        drawCell(ctx, cc * SIZE, (rr - VISIBLE_ROWS) * SIZE, SIZE, COLORS[piece.type], 1, alpha, ghost);
      }
    }
  }

  function drawMini(target, type, yOffset=0, colorOverride=null) {
    if (!type) return;
    const matrix = PIECES[type][0];
    const cell = 20;
    const w = matrix[0].length * cell;
    const h = matrix.length * cell;
    const ox = Math.floor((target.canvas.width - w) / 2);
    let oy = Math.floor((target.canvas.height - h) / 2) + yOffset;
    
    if (type !== 'O') {
      oy += cell / 2;
    }

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          // 如果有傳入強制顏色就用強制顏色，否則用原本的方塊顏色
          const color = colorOverride || COLORS[type];
          drawCell(target, ox + c * cell, oy + r * cell, cell, color);
        }
      }
    }
  }

  function renderPanels() {
    holdCtx.fillStyle = BG;
    holdCtx.fillRect(0,0,holdCanvas.width,holdCanvas.height);
    nextCtx.fillStyle = BG;
    nextCtx.fillRect(0,0,nextCanvas.width,nextCanvas.height);
    queueCtx.fillStyle = BG;
    queueCtx.fillRect(0,0,queueCanvas.width,queueCanvas.height);

    // 只要還在 3、2、1 倒數中，就不畫出任何方塊，完全淨空
    if (countdownValue > 0 && !current) return;

    if (holdType) {
      const holdColor = holdUsed ? '#666666' : null; 
      drawMini(holdCtx, holdType, 0, holdColor);
    }
    if (queue[0]) drawMini(nextCtx, queue[0]);

    for (let i = 1; i < Math.min(queue.length, 5); i++) {
      const type = queue[i];
      const matrix = PIECES[type][0];
      const cell = 16;
      const w = matrix[0].length * cell;
      const h = matrix.length * cell;
      const ox = Math.floor((queueCanvas.width - w) / 2);
      // 將畫布總高度平分成 4 等份
      const slotHeight = queueCanvas.height / 4; 
      // 算出這個方塊專屬的「等份中心點」
      const slotCenterY = (i - 1) * slotHeight + (slotHeight / 2);
      // 將方塊以該中心點為基準往上提一半的高度
      let oy = slotCenterY - (h / 2);
      
      if (type !== 'O') {
        oy += cell / 2;
      }

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) drawCell(queueCtx, ox + c * cell, oy + r * cell, cell, COLORS[type]);
        }
      }
    }
  }

  // --- 繪製對手(或AI)的 HOLD / NEXT / QUEUE 面板 ---
  let _oppPanelHash = '';
  function renderOpponentPanels() {
    const oppHoldCanvas = document.getElementById('opp-hold-canvas');
    const oppNextCanvas = document.getElementById('opp-next-canvas');
    const oppQueueCanvas = document.getElementById('opp-queue-canvas');

    if (!oppHoldCanvas || !oppNextCanvas || !oppQueueCanvas) return;

    // 只有 hold / queue / countdown 這些真實影響畫面的東西變了才重畫
    const panelHash = (oppState ? (oppState.h || '') + '|' + (oppState.hu ? 1 : 0) + '|' + ((oppState.q || []).join(',')) : '0')
      + '|' + countdownValue + '|' + (current ? 1 : 0);
    if (panelHash === _oppPanelHash) return;
    _oppPanelHash = panelHash;

    const oHoldCtx = oppHoldCanvas.getContext('2d', { alpha: false });
    const oNextCtx = oppNextCanvas.getContext('2d', { alpha: false });
    const oQueueCtx = oppQueueCanvas.getContext('2d', { alpha: false });

    // 清空背景
    oHoldCtx.fillStyle = BG;
    oHoldCtx.fillRect(0, 0, oppHoldCanvas.width, oppHoldCanvas.height);
    oNextCtx.fillStyle = BG;
    oNextCtx.fillRect(0, 0, oppNextCanvas.width, oppNextCanvas.height);
    oQueueCtx.fillStyle = BG;
    oQueueCtx.fillRect(0, 0, oppQueueCanvas.width, oppQueueCanvas.height);

    // 倒數中不顯示對手或 AI 的任何手牌，倒數完才瞬間出現
    if (countdownValue > 0 && !current) return;

    if (!oppState) return;

    // 畫對手的 Hold 區
    if (oppState.h) {
      const holdColor = oppState.hu ? '#666666' : null; // 如果對手用過 Hold，變灰色
      drawMini(oHoldCtx, oppState.h, 0, holdColor);
    }

    // 畫對手的 Next 與 Queue 區
    const q = oppState.q;
    if (q && q.length > 0) {
      drawMini(oNextCtx, q[0]); // 畫 Next (第一顆)

      // 畫剩下的 4 顆 Queue
      for (let i = 1; i < Math.min(q.length, 5); i++) {
        const type = q[i];
        const matrix = PIECES[type][0];
        const cell = 16;
        const w = matrix[0].length * cell;
        const h = matrix.length * cell;
        const ox = Math.floor((oppQueueCanvas.width - w) / 2);
        const slotHeight = oppQueueCanvas.height / 4; 
        const slotCenterY = (i - 1) * slotHeight + (slotHeight / 2);
        let oy = slotCenterY - (h / 2);
        
        if (type !== 'O') oy += cell / 2;

        for (let r = 0; r < matrix.length; r++) {
          for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) drawCell(oQueueCtx, ox + c * cell, oy + r * cell, cell, COLORS[type]);
          }
        }
      }
    }
  }

  function draw() {
    ctx.save(); // 儲存畫布狀態
    // Combo Room：先用牆色填滿整張畫布，再平移讓窄場視覺置中
    // 平移後，畫布邊緣超出原本網格的部分會以牆色填滿，仍保持「左右對稱牆壁」的觀感
    if (isNarrowMode) {
      ctx.fillStyle = COLORS.W;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const offsetX = getNarrowOffsetX();
      if (offsetX !== 0) ctx.translate(offsetX, 0);
    }
    drawGrid();
    particles.forEach(p => p.draw(ctx));

    // 如果有震動幅度，隨機偏移畫布 (Screen Shake)
    if (shakeMag > 0) {
      // 將時間每 30 毫秒切成一個區塊（把震動頻率鎖死在約 33Hz）
      const tick = Math.floor(performance.now() / 30);
      
      // 利用 tick 產生偽隨機數 (Pseudo-random)，確保在這 30ms 內偏移量保持固定
      const randomX = Math.abs(Math.sin(tick * 12.9898)); // 產生 0 ~ 1 之間的亂數
      const randomY = Math.abs(Math.sin(tick * 78.233));  // 產生 0 ~ 1 之間的亂數

      const dx = (randomX - 0.5) * shakeMag;
      const dy = (randomY - 0.5) * shakeMag;
      ctx.translate(dx, dy);
    }

    // 套用垃圾行的視覺偏移，讓整個盤面、方塊、特效一起滑順上下移
    ctx.translate(0, visualBoardOffsetY);

    // 計算需要額外往上畫幾行，填補畫面被垃圾行往下壓時露出的隱藏區
    const extraRows = Math.ceil(Math.max(0, visualBoardOffsetY) / SIZE);
    const startRow = Math.max(0, VISIBLE_ROWS - extraRows);

    // 畫主要盤面的迴圈，動態往上延伸顯示範圍
    for (let r = startRow; r < ROWS; r++) { 
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        let skip = false;
        if (clearFx) {
          for (const row of clearFx.rows) if (row === r) { skip = true; break; }
        }
        if (!skip) {
          drawCell(ctx, c * SIZE, (r - VISIBLE_ROWS) * SIZE, SIZE, COLORS[cell]);
        }
      }
    }

    // 畫消行閃爍特效的迴圈
    if (clearFx) {
      const currentElapsed = isHighFpsMode ? clearFx.visualElapsed : clearFx.elapsed;
      const t = Math.min(1, currentElapsed / clearFx.duration);
      const scale = 1 - 0.7 * t;
      const alpha = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 2));
      for (const row of clearFx.rows) {
        if (row < VISIBLE_ROWS) continue; // 隱藏區不畫特效
        for (let c = 0; c < COLS; c++) {
          if (board[row][c]) drawCell(ctx, c * SIZE, (row - VISIBLE_ROWS) * SIZE, SIZE, '#ffffff', scale, alpha);
        }
      }
    }

    if (!gameOver && current) {

      if (visualGhostRow !== current.row) drawPiece(current, visualGhostRow, current.col, 0.6, true);

      // 正在掉落的實體方塊，套用平滑視覺座標
      // 獨立保護區塊，只讓這顆方塊旋轉跟擠壓，不影響其他畫面
      ctx.save();
      
      // 算出這顆方塊在畫面上的精準「絕對中心點座標」
      const pieceSize = current.matrix.length * SIZE;
      const centerX = visualCol * SIZE + pieceSize / 2;
      const centerY = (visualRow - VISIBLE_ROWS) * SIZE + pieceSize / 2;

      // 移動到中心點 -> 旋轉 -> 移回原點
      ctx.translate(centerX, centerY);
      ctx.rotate(visualRotationAngle * Math.PI / 180);
      ctx.translate(-centerX, -centerY);

      drawPiece(current, visualRow, visualCol); 
      
      ctx.restore(); // 恢復正常畫布狀態，免得後面的東西跟著變形
    }

    // --- 繪製我方垃圾行警告條 (黃色寬限 / 紅色危險) ---
    if (activeGarbage > 0 || nextGarbage > 0) {
      const totalG = Math.min(activeGarbage + nextGarbage, ROWS);
      const activeHeight = Math.min(activeGarbage, ROWS) * SIZE;
      const totalHeight = totalG * SIZE;
      
      // 畫 activeGarbage (馬上要進來的，紅色)
      if (activeGarbage > 0) {
        ctx.fillStyle = '#ff0d62'; 
        ctx.fillRect(0, CANVAS_H - activeHeight, 6, activeHeight);
      }
      // 畫 nextGarbage (還在寬限期的，黃色，疊在紅色上面)
      if (nextGarbage > 0) {
        const nextHeight = totalHeight - activeHeight;
        ctx.fillStyle = '#f7dd16'; 
        ctx.fillRect(0, CANVAS_H - totalHeight, 6, nextHeight);
      }
    }

    ctx.restore(); // 恢復畫布狀態

    // --- 讓我方輸的時候，或是處於 KO 狀態時，盤面變暗 (畫在結算面板的下方) ---
    if (((isMultiplayer || window.isMpMulti || isSpectatingBattle) && isKOed && !gameOver) || (gameOver && matchResult === 'LOSE')) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // --- 遊戲結束結算畫面 ---
    if (gameOver) {
      const boxH = (isSpectating && (isMultiplayer || isSpectatingBattle) && matchResult) ? 80 : 136;
      const boxY = CANVAS_H / 2 - boxH / 2;
      ctx.fillStyle = 'rgba(6,0,79,0.9)';
      ctx.fillRect(18, boxY, CANVAS_W - 36, boxH);
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 4;
      ctx.strokeRect(18, boxY, CANVAS_W - 36, boxH);
      ctx.fillStyle = '#f2f2f2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if ((isMultiplayer || window.isMpMulti || isSpectatingBattle) && matchResult) {
        ctx.fillStyle = matchResult === 'WIN' ? '#48d62f' : (matchResult === 'LOSE' ? '#ff0d62' : '#f7dd16');
        ctx.font = '900 36px Arial';
        if (isSpectating) {
          ctx.fillText(matchResult === 'WIN' ? 'WIN!' : (matchResult === 'LOSE' ? 'LOSE!' : 'DRAW!'), CANVAS_W / 2, CANVAS_H / 2);
        } else {
          ctx.fillText(matchResult === 'WIN' ? 'YOU WIN!' : (matchResult === 'LOSE' ? 'YOU LOSE!' : 'DRAW!'), CANVAS_W / 2, CANVAS_H / 2 - 24);
          ctx.fillStyle = '#f2f2f2';
          ctx.font = '700 14px Arial';
          ctx.fillText('Press ENTER to Play Again', CANVAS_W / 2, CANVAS_H / 2 + 16);
          ctx.fillText('Press R to Disconnect', CANVAS_W / 2, CANVAS_H / 2 + 40);
        }
      } else {
        ctx.font = '900 32px Arial';
        ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10);
        if (!isSpectating) {
          ctx.font = '700 15px Arial';
          ctx.fillText('Press R to restart', CANVAS_W / 2, CANVAS_H / 2 + 26);
        }
      }
    }

    if (isPaused && !gameOver) {
      ctx.fillStyle = 'rgba(6,0,79,0.7)'; // 半透明背景
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#f2f2f2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 40px Arial';
      ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2);
    }

    if (countdownValue > 0) {
      // 顯示 3、2、1 倒數
      ctx.fillStyle = 'rgba(6,0,79,0.8)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#f2f2f2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 80px Arial';
      ctx.fillText(countdownValue, CANVAS_W / 2, CANVAS_H / 2);
    } else if (!gameStarted) {
      // 尚未開始遊戲時的提示
      ctx.fillStyle = 'rgba(6,0,79,0.8)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (!isMultiplayer && !window.isMpMulti) {
        ctx.fillStyle = '#f2f2f2';
        ctx.font = '900 28px Arial';
        ctx.fillText('PRESS ENTER', CANVAS_W / 2, CANVAS_H / 2 - 16);
        ctx.font = '700 18px Arial';
        ctx.fillText('TO START', CANVAS_W / 2, CANVAS_H / 2 + 16);
      } else {
        const iReady = window.isMpMulti ? !!window.mpIAmReady : iAmReady;
        const mpAlone = window.isMpMulti && (typeof mpPlayersMap !== 'undefined') && mpPlayersMap.size <= 1;
        const mpSpec = window.isMpMulti && window.mpIsSpectatorWaiting;
        if (mpSpec) {
          // 中途加入者：當前回合還沒結束 → 顯示「觀戰等待」
          ctx.fillStyle = '#38bdee';
          ctx.font = '900 24px Arial';
          ctx.fillText('WAITING FOR', CANVAS_W / 2, CANVAS_H / 2 - 16);
          ctx.fillText('ROUND END', CANVAS_W / 2, CANVAS_H / 2 + 16);
        } else if (iReady) {
          ctx.fillStyle = '#48d62f';
          ctx.font = '900 36px Arial';
          ctx.fillText('READY !', CANVAS_W / 2, CANVAS_H / 2);
        } else if (mpAlone) {
          // 多人對戰房內只有我一個 → 顯示等待玩家加入，不顯示 CLICK READY
          ctx.fillStyle = '#f2f2f2';
          ctx.font = '900 24px Arial';
          ctx.fillText('WAITING FOR', CANVAS_W / 2, CANVAS_H / 2 - 16);
          ctx.fillText('PLAYERS', CANVAS_W / 2, CANVAS_H / 2 + 16);
        } else {
          ctx.fillStyle = '#f2f2f2';
          ctx.font = '900 28px Arial';
          ctx.fillText('CLICK READY', CANVAS_W / 2, CANVAS_H / 2 - 16);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '700 16px Arial';
          ctx.fillText('TO START', CANVAS_W / 2, CANVAS_H / 2 + 16);
        }
      }
    }

    myFloatingTexts.forEach(ft => ft.draw(ctx));
  }

  // --- 繪製對手盤面 ---
  // 效能優化：用 primitive 欄位比對取代每幀組 300+ 字元 hash 字串，降低 GC 壓力
  let _oppPrev_bStr = '';
  let _oppPrev_cKey = -1;
  let _oppPrev_h = '';
  let _oppPrev_hu = 0;
  let _oppPrev_g = 0;
  let _oppPrev_ng = 0;
  let _oppPrev_countdown = -1;
  let _oppPrev_isPaused = 0;
  let _oppPrev_gameOver = 0;
  let _oppPrev_matchResult = '';
  let _oppPrev_oppKOActive = 0;
  let _oppPrev_gameStarted = 0;
  let _oppPrev_oppIsReady = 0;
  let _oppPrev_isMultiplayer = 0;
  let _oppPrev_ftLen = 0;
  function drawOpponent() {
    if (!oppCtx) return;

    // 輕量 early-exit：全部欄位都沒變 + 沒有飄浮文字動畫 → 直接跳過整個繪製
    const oppC = oppState && oppState.c;
    const cKey = oppC ? (oppC.rot * 100000 + oppC.r * 100 + oppC.c * 10 + oppC.t.charCodeAt(0)) : -1;
    const bStr = (oppState && oppState.b) || '';
    const h = (oppState && oppState.h) || '';
    const hu = (oppState && oppState.hu) ? 1 : 0;
    const g = (oppState && oppState.g) || 0;
    const ng = (oppState && oppState.ng) || 0;
    const isPausedI = isPaused ? 1 : 0;
    const gameOverI = gameOver ? 1 : 0;
    const matchResultI = matchResult || '';
    const koActive = (typeof oppKOTimer !== 'undefined' && oppKOTimer > 0) ? 1 : 0;
    const gsI = gameStarted ? 1 : 0;
    const orI = oppIsReady ? 1 : 0;
    const mpI = isMultiplayer ? 1 : 0;
    const ftLen = oppFloatingTexts.length;

    if (cKey === _oppPrev_cKey && bStr === _oppPrev_bStr && h === _oppPrev_h
        && hu === _oppPrev_hu && g === _oppPrev_g && ng === _oppPrev_ng
        && countdownValue === _oppPrev_countdown && isPausedI === _oppPrev_isPaused
        && gameOverI === _oppPrev_gameOver && matchResultI === _oppPrev_matchResult
        && koActive === _oppPrev_oppKOActive && gsI === _oppPrev_gameStarted
        && orI === _oppPrev_oppIsReady && mpI === _oppPrev_isMultiplayer
        && ftLen === 0 && _oppPrev_ftLen === 0) {
      return;
    }

    _oppPrev_cKey = cKey;
    _oppPrev_bStr = bStr;
    _oppPrev_h = h;
    _oppPrev_hu = hu;
    _oppPrev_g = g;
    _oppPrev_ng = ng;
    _oppPrev_countdown = countdownValue;
    _oppPrev_isPaused = isPausedI;
    _oppPrev_gameOver = gameOverI;
    _oppPrev_matchResult = matchResultI;
    _oppPrev_oppKOActive = koActive;
    _oppPrev_gameStarted = gsI;
    _oppPrev_oppIsReady = orI;
    _oppPrev_isMultiplayer = mpI;
    _oppPrev_ftLen = ftLen;

    // 宣告隱藏的快取畫布
    if (typeof window._oppStaticCanvas === 'undefined') {
        window._oppStaticCanvas = document.createElement('canvas');
        window._oppStaticCanvas.width = 340;
        window._oppStaticCanvas.height = 680;
        window._oppStaticCtx = window._oppStaticCanvas.getContext('2d', { alpha: false });
        window._lastOppBStr = '';
        window._lastOppCounting = null;
    }

    if (!oppState) {
        oppCtx.drawImage(gridCanvas, 0, 0);
    } else {
      const isCountingDown = (countdownValue > 0 && !current);
      const oppSize = 34;
      const bStr = oppState.b;

      // 如果盤面沒變，直接用畫好的整張圖貼上
      if (bStr !== window._lastOppBStr || isCountingDown !== window._lastOppCounting) {
          window._oppStaticCtx.drawImage(gridCanvas, 0, 0); // 畫網格
          if (bStr && !isCountingDown) {
              let charIndex = 0;
              for (let r = 0; r < ROWS; r++) {
                  for (let c = 0; c < COLS; c++) {
                      const char = bStr[charIndex++];
                      if (r < VISIBLE_ROWS) continue;
                      if (char !== '.') {
                          drawCell(window._oppStaticCtx, c * oppSize, (r - VISIBLE_ROWS) * oppSize, oppSize, COLORS[char]);
                      }
                  }
              }
          }
          window._lastOppBStr = bStr;
          window._lastOppCounting = isCountingDown;
      }
      
      oppCtx.drawImage(window._oppStaticCanvas, 0, 0);

      if (!isCountingDown) {
        const curr = oppState.c;
        if (curr) {
          const matrix = PIECES[curr.t][curr.rot];
          for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
              if (matrix[r][c]) {
                const rr = curr.r + r;
                const cc = curr.c + c;
                if (rr >= VISIBLE_ROWS) { 
                  drawCell(oppCtx, cc * oppSize, (rr - VISIBLE_ROWS) * oppSize, oppSize, COLORS[curr.t]);
                }
              }
            }
          }
        }
        
        // 繪製對手的垃圾行警告條
        const oppG = oppState.g || 0;
        const oppNg = oppState.ng || 0;
        if (oppG > 0 || oppNg > 0) {
          const totalG = Math.min(oppG + oppNg, ROWS);
          const activeHeight = Math.min(oppG, ROWS) * oppSize;
          const totalHeight = totalG * oppSize;
          
          if (oppG > 0) {
            oppCtx.fillStyle = '#ff0d62';
            oppCtx.fillRect(0, oppCanvas.height - activeHeight, 4, activeHeight);
          }
          if (oppNg > 0) {
            const nextHeight = totalHeight - activeHeight;
            oppCtx.fillStyle = '#f7dd16';
            oppCtx.fillRect(0, oppCanvas.height - totalHeight, 4, nextHeight);
          }
        }
      }
    }

    // --- 讓我方輸或贏的時候，對手盤面同步變暗並顯示鏡像結果 ---
    if ((typeof oppKOTimer !== 'undefined' && oppKOTimer > 0 && !gameOver) || (gameOver && matchResult)) {
      oppCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      oppCtx.fillRect(0, 0, oppCanvas.width, oppCanvas.height);
    }

    if (gameOver && matchResult && (isMultiplayer || isSpectatingBattle)) {
      oppCtx.fillStyle = 'rgba(6,0,79,0.9)';
      oppCtx.fillRect(18, oppCanvas.height / 2 - 40, oppCanvas.width - 36, 80);
      oppCtx.strokeStyle = '#f2f2f2';
      oppCtx.lineWidth = 4;
      oppCtx.strokeRect(18, oppCanvas.height / 2 - 40, oppCanvas.width - 36, 80);

      let oppResText = matchResult === 'WIN' ? 'LOSE!' : (matchResult === 'LOSE' ? 'WIN!' : 'DRAW!');
      let oppResColor = matchResult === 'WIN' ? '#ff0d62' : (matchResult === 'LOSE' ? '#48d62f' : '#f7dd16');

      oppCtx.fillStyle = oppResColor;
      oppCtx.textAlign = 'center';
      oppCtx.textBaseline = 'middle';
      oppCtx.font = '900 36px Arial';
      oppCtx.fillText(oppResText, oppCanvas.width / 2, oppCanvas.height / 2);
    }

    // --- 讓對手的畫面在各個特殊狀態下變暗並顯示文字 ---
    if (isPaused && !gameOver) {
      oppCtx.fillStyle = 'rgba(6,0,79,0.7)'; 
      oppCtx.fillRect(0, 0, oppCanvas.width, oppCanvas.height);
    } else if (countdownValue > 0) {
      // 不管是開局倒數還是恢復倒數，對手畫面都同步變暗並印出數字
      oppCtx.fillStyle = 'rgba(6,0,79,0.8)';
      oppCtx.fillRect(0, 0, oppCanvas.width, oppCanvas.height);
      
      oppCtx.fillStyle = '#f2f2f2';
      oppCtx.textAlign = 'center';
      oppCtx.textBaseline = 'middle';
      oppCtx.font = '900 80px Arial';
      oppCtx.fillText(countdownValue, oppCanvas.width / 2, oppCanvas.height / 2);
    } else if (!gameStarted && isMultiplayer) {
      // 雙向鏡像：對手還沒準備時顯示 WAITING，準備好後顯示 READY
      oppCtx.fillStyle = 'rgba(6,0,79,0.8)';
      oppCtx.fillRect(0, 0, oppCanvas.width, oppCanvas.height);
      oppCtx.textAlign = 'center';
      oppCtx.textBaseline = 'middle';

      if (oppIsReady) {
        oppCtx.fillStyle = '#48d62f';
        oppCtx.font = '900 36px Arial';
        oppCtx.fillText('READY !', oppCanvas.width / 2, oppCanvas.height / 2);
      } else {
        oppCtx.fillStyle = '#f2f2f2';
        oppCtx.font = '900 24px Arial';
        oppCtx.fillText('WAITING...', oppCanvas.width / 2, oppCanvas.height / 2 - 16);
        oppCtx.fillStyle = 'rgba(255,255,255,0.6)';
        oppCtx.font = '700 16px Arial';
        oppCtx.fillText(window.t('opp.waitingForReady', '等待對手準備'), oppCanvas.width / 2, oppCanvas.height / 2 + 16);
      }
    }

    oppFloatingTexts.forEach(ft => ft.draw(oppCtx));
  }

  // 自由排版模式：直接生出指定類型的方塊（取代當前 current）
  // 注意：不要清掉 canUndo / previousGameState — 那是上一顆「已鎖定」方塊的反悔快照，
  // 換手中的方塊不應該影響它，否則玩家換了方塊就無法 Undo 已放下的那顆。
  function spawnPieceByType(type) {
    if (!isFreeMode) return;
    if (gameOver || isPaused || countdownValue > 0 || isKOed || clearFx) return;
    current = makePiece(type);
    visualRow = current.row;
    visualCol = current.col;
    visualGhostRow = ghostRow();
    lastVisualRow = current.row;
    lastGhostCol = -1;
    holdUsed = false;
    lockTimer = 0;
    lockResets = 0;
    gravityTimer = 0;
    playSound('move');
    renderPanels();
    if (!valid(current.matrix, current.row, current.col)) triggerGameOver(true);
  }

  function spawn(isFromHold = false) {
    // 自由排版 + 關閉 NEXT/QUEUE：不自動生方塊，讓玩家按數字鍵手動選
    if (isFreeMode && !freeQueueEnabled) {
      current = null;
      visualGhostRow = 0;
      lastGhostCol = -1;
      holdUsed = false;
      lockTimer = 0;
      lockResets = 0;
      gravityTimer = 0;
      renderPanels();
      sendState();
      return;
    }
    ensureQueue();
    current = makePiece(queue.shift());
    visualRow = current.row; // 視覺 Y 對齊
    visualCol = current.col; // 視覺 X 對齊
    visualGhostRow = ghostRow();
    lastVisualRow = current.row; // 重置殘影起點，防止新方塊產生拖尾
    // 確保新方塊產生時，底部的幽靈方塊一定會強制重新偵測地形
    lastGhostCol = -1;

    ensureQueue();
    holdUsed = false;

    // --- IHS (Initial Hold System) 預先保留 ---
    // 加入 !isFromHold 防呆，確保按 Hold 的瞬間不會因為手指還沒放開而連續觸發
    if (!isFromHold && (keysDown.has('KeyC') || keysDown.has('ShiftLeft') || keysDown.has('ShiftRight'))) {
      const t = current.type;
      if (!holdType) {
        holdType = t;
        current = makePiece(queue.shift());
        visualRow = current.row; // 視覺 Y 對齊
        visualCol = current.col; // 視覺 X 對齊
        visualGhostRow = ghostRow();
        lastVisualRow = current.row; // 重置殘影起點
        ensureQueue(); 
      } else {
        const swap = holdType;
        holdType = t;
        current = makePiece(swap);
        visualRow = current.row; // 視覺 Y 對齊
        visualCol = current.col; // 視覺 X 對齊
        visualGhostRow = ghostRow();
        lastVisualRow = current.row; // 重置殘影起點
      }
      holdUsed = true;   
      playSound('move'); 
    }

    // --- IRS (Initial Rotation System) 預先旋轉 ---
    let irsDir = 0;
    // Combo Room：2/3-Wide 的 I 方塊鎖死直立姿態，IRS 也禁止
    const lockIRotation = isNarrowMode && narrowWidth < 4 && current.type === 'I';
    if (!lockIRotation) {
      if (keysDown.has('ArrowUp') || keysDown.has('KeyX')) {
        irsDir = 1; // 預先順時針
      } else if (keysDown.has('KeyZ') || keysDown.has('ControlLeft') || keysDown.has('ControlRight')) {
        irsDir = -1; // 預先逆時針
      }
    }

    if (irsDir !== 0) {
      const to = (current.rot + (irsDir === 1 ? 1 : 3)) % 4;
      const rotated = clone(PIECES[current.type][to]);
      
      if (valid(rotated, current.row, current.col)) {
        current.matrix = rotated;
        current.rot = to;
        playSound('rotate'); 
      }
    }

    lockTimer = 0;
    lockResets = 0;
    renderPanels();
    if (!valid(current.matrix, current.row, current.col)) triggerGameOver(true);
    sendState(); 
    oppFloatingTexts.forEach(ft => ft.draw(oppCtx));
  }

  function triggerUndo() {
    // 防呆分流：如果是還沒開始、倒數中、已死掉、動畫中，直接「無聲忽略」
    if (!gameStarted || gameOver || isPaused || countdownValue > 0 || isKOed || clearFx) {
      return; 
    }

    // 如果遊戲正在進行中，但「沒有快照」或「剛消行被鎖定」，才跳出警告通知
    if (!canUndo || !previousGameState) {
      showToast(window.t('toast.cantUndo', '⚠️ 無法反悔 (已消行、炸彈，或已用過一次)！'), 2000);
      return;
    }

    // 精準拔除方塊：只清除剛剛記下來的那幾格，完全不碰垃圾和炸彈
    previousGameState.pieceCells.forEach(cell => {
      if (cell.r >= 0 && cell.r < ROWS) {
        board[cell.r][cell.c] = null;
      }
    });

    // 恢復數值 (注意：這裡已經沒有 activeGarbage/nextGarbage，所以垃圾條進度會完美保留)
    score = previousGameState.score;
    lines = previousGameState.lines;
    combo = previousGameState.combo;
    b2b = previousGameState.b2b;
    holdType = previousGameState.holdType;
    holdUsed = previousGameState.holdUsed;
    myPieceIndex = previousGameState.myPieceIndex;
    queue = [...previousGameState.queue];

    // 把方塊拉回最頂端
    current = makePiece(previousGameState.pieceType);

    // 重置物理計時器
    lockTimer = 0;
    lockResets = 0;
    gravityTimer = 0;

    // 沒收本次快照
    canUndo = false;
    previousGameState = null;

    // 視覺特效 (自己畫面顯示)
    playSound('undo');
    shakeMag = 8;
    myFloatingTexts.push(new FloatingText("⏪ UNDO!", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#38bdee', 40));

    // 更新畫面
    updateHUD();
    renderPanels();
    sendState(); // 這裡已經把拔掉方塊的畫面傳給對手了，對手看起來就像方塊自己飛回天上

    // 告訴對手我反悔了
    if (isMultiplayer && conn && conn.open) {
      conn.send({ type: 'UNDO_USED' });
    }
  }

  function applyGravityInterval() {
    gravityTimer = 0;
  }

  function tryMove(dx) {
    if (!current || gameOver || clearFx || isKOed || isPaused || countdownValue > 0) return false;
    if (valid(current.matrix, current.row, current.col + dx)) {
      current.col += dx;
      lastMoveType = 'move';
      playSound('move');
      // 官方 Lock Delay Move Reset 規則
      if (!valid(current.matrix, current.row + 1, current.col)) {
        if (lockResets < 15) { lockTimer = 0; lockResets++; } // 觸地微調，重置計時
      } else {
        if (lockResets < 15) { lockTimer = 0; }
      }
      sendState(); // 移動成功立刻發送
      return true;
    }
    return false;
  }

  function tryRotate(dir) {
    if (!current || gameOver || clearFx || isKOed || isPaused || countdownValue > 0) return false;
    // Combo Room：2/3-Wide 場地下，I 方塊鎖死在直立姿態（不論橫躺都會卡牆，旋轉只會中斷 combo）
    if (isNarrowMode && narrowWidth < 4 && current.type === 'I') return false;
    const from = current.rot;
    const to = (from + (dir === 1 ? 1 : 3)) % 4;
    const rotated = clone(PIECES[current.type][to]);
    if (current.type === 'O') {
      if (valid(rotated, current.row, current.col)) {
        current.matrix = rotated; current.rot = to; 

        visualRow = current.row; 
        visualCol = current.col;
        visualGhostRow = ghostRow();

        // 觸發旋轉殘影 (O 方塊其實看不出來，但為了邏輯統一還是加上)
        visualRotationAngle = (dir === 1) ? -90 : 90;

        sendState();
        return true;
      }
      return false;
    }

    const key = `${from}>${to}`;
    const kicks = current.type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key];
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const nr = current.row - dy;
      const nc = current.col + dx;
      if (valid(rotated, nr, nc)) {
        current.matrix = rotated;
        current.rot = to;
        current.row = nr;
        current.col = nc;

        visualRow = nr; 
        visualCol = nc; 
        visualGhostRow = ghostRow();

        // 觸發旋轉殘影 (順時針給 -90 度，逆時針給 90 度，讓它彈回來)
        visualRotationAngle = (dir === 1) ? -90 : 90;
        
        lastMoveType = 'rotate'; // <--- 紀錄最後動作是旋轉
        lastKickIndex = i;       // <--- 紀錄是第幾個踢牆測試成功
        playSound('rotate');

        if (!valid(current.matrix, current.row + 1, current.col)) {
          if (lockResets < 15) { lockTimer = 0; lockResets++; }
        } else {
          if (lockResets < 15) { lockTimer = 0; }
        }
        sendState();
        return true;
      }
    }
    return false;
  }

  function softDrop(byKey=false) {
    if (!current || gameOver || clearFx || isKOed || isPaused || countdownValue > 0) return false;
    if (valid(current.matrix, current.row + 1, current.col)) {
      current.row += 1;
      lastMoveType = 'drop';
      if (current.row > current.lowestRow) {
        current.lowestRow = current.row; // 更新歷史最低紀錄
        if (byKey) {
          score += 1;
          applyGravityInterval(); // 只有手動按「下」才強制重置計時器
        }
        lockTimer = 0;
        lockResets = 0;           // 只有手動突破紀錄時才給分
      }
      updateHUD();
      sendState();
      return true;
    }
    return false;
  }

  function hardDrop() {
    if (!current || gameOver || clearFx || isKOed || isPaused || countdownValue > 0) return;
    let cells = 0;

    while (valid(current.matrix, current.row + 1, current.col)) {
      current.row += 1;
      cells++;
    }
    score += cells * 2;
    updateHUD();

    // --- Hard Drop 底部爆炸特效 ---
    for (let r = 0; r < current.matrix.length; r++) {
      for (let c = 0; c < current.matrix[r].length; c++) {
        if (!current.matrix[r][c]) continue;
        const br = current.row + r;
        const bc = current.col + c;
        triggerLandingEffect(br, bc, current.type);
      }
    }
    playSound('drop');
    shakeMag = 3; 
    lockPiece();
  }

  // --- 系統通知 Toast (固定在畫面頂部) ---
  let toastTimeout = null;
  function showToast(text, duration = 3000) {
    const toast = document.getElementById('system-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('toast-show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('toast-show');
    }, duration);
  }

  // ============================================================
  //  AI 對戰引擎
  // ============================================================
  function aiMakePiece(type) {
    const matrix = clone(PIECES[type][0]);
    const width = matrix[0].length;
    const startRow = type === 'I' ? 18 : 19;
    return { type, matrix, rot: 0, row: startRow, col: Math.floor(COLS / 2) - Math.ceil(width / 2) };
  }

  function aiValid(matrix, row, col, board) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const br = row + r, bc = col + c;
        if (bc < 0 || bc >= COLS || br >= ROWS) return false;
        if (br >= 0 && board[br][bc]) return false;
      }
    }
    return true;
  }

  // 終極 PD 演算法
  function aiEvaluate(simData, currentCombo) {
    const board = simData.b;
    const linesCleared = simData.lines;
    const bombsCleared = simData.bombs;

    const colHeights = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[r][c]) { colHeights[c] = ROWS - r; break; }
      }
    }
    const maxHeight = Math.max(...colHeights);

    if (maxHeight > 18) return -999999999; 

    let score = 0;

    if (aiWideMode === 'auto') {
      // --- Auto 模式 ---
      let holes = 0;
      let bumpiness = 0;
      for (let c = 0; c < COLS; c++) {
        let foundTop = false;
        for (let r = 0; r < ROWS; r++) {
          if (board[r][c]) foundTop = true;
          else if (foundTop) holes++;
        }
        if (c > 0) bumpiness += Math.abs(colHeights[c] - colHeights[c-1]);
      }
      
      score -= holes * 500000;
      score -= bumpiness * 20000;
      score -= maxHeight * 10000;

      // 加入 aiNextGarbage >= 1，看到「黃色垃圾條」立刻防守
      if (maxHeight >= 14 || aiActiveGarbage >= 1 || aiNextGarbage >= 1) {
        if (linesCleared > 0) {
          score += linesCleared * 200000;
          if (currentCombo >= 0) score += (currentCombo + 1) * 300000;
        }
      } else {
         if (linesCleared === 4) score += 3000000; 
         else if (linesCleared > 0) {
             if (currentCombo >= 0) score += (currentCombo + 1) * 200000;
             else score -= linesCleared * 20000;
         }
      }
    } else {
      // --- Wide 模式（與 C++ 同步的大進化版）---
      const keepEmpty = parseInt(aiWideMode);
      const wellStart = COLS - keepEmpty;
      const targetResidue = keepEmpty - 1; // 4-wide 時為 3

      let buildHoles = 0;
      let wellHoles = 0;
      let buildBumpiness = 0;
      let wellBlocks = 0;
      let wellMaxHeight = 0;
      let rightBottomBlocks = 0;

      for (let c = 0; c < COLS; c++) {
        let foundTop = false;
        for (let r = 0; r < ROWS; r++) {
          if (board[r][c]) {
            foundTop = true;
            if (c >= wellStart) {
              wellBlocks++;
              if (r === ROWS - 1) rightBottomBlocks++;
            }
          } else if (foundTop) {
            if (c < wellStart) buildHoles++;
            else wellHoles++;
          }
        }
        if (c > 0 && c < wellStart) {
          buildBumpiness += Math.abs(colHeights[c] - colHeights[c-1]);
        }
        if (c >= wellStart && colHeights[c] > wellMaxHeight) {
          wellMaxHeight = colHeights[c];
        }
      }

      const buildMin = Math.min(...colHeights.slice(0, wellStart));
      const buildMax = Math.max(...colHeights.slice(0, wellStart));

      // 主塔和井洞永遠是大罪
      score -= buildHoles * 5000000;
      score -= wellHoles * 5000000;

      // ★ 複合就緒度評估
      let isOpeningPhase;
      if (aiCombo >= 0) {
        isOpeningPhase = false;
      } else {
        let readiness = 0;
        if (buildMin >= 8) readiness++;
        if (buildMin >= 10) readiness++;
        if (buildMax - buildMin <= 2) readiness++;
        const wellDepth = buildMin - wellMaxHeight;
        if (wellDepth >= 6) readiness++;
        if (wellBlocks <= targetResidue + 1) readiness++;
        isOpeningPhase = (readiness < 4);
      }

      if (isOpeningPhase) {
        // 【蓄力期】
        score += buildMin * 15000;
        score -= buildBumpiness * buildBumpiness * 2000;
        score -= (buildMax - buildMin) * (buildMax - buildMin) * 5000;

        if (wellMaxHeight > 1) {
          score -= (wellMaxHeight - 1) * 3000000;
        }

        if (rightBottomBlocks > targetResidue) {
          score -= (rightBottomBlocks - targetResidue) * 5000000;
        } else if (rightBottomBlocks === targetResidue) {
          score += 500000;
        } else {
          score += rightBottomBlocks * 80000;
        }

        const wellDepth = buildMin - wellMaxHeight;
        score += Math.min(wellDepth, 12) * 50000;
        if (wellDepth < 6) score -= (6 - wellDepth) * 500000;

        if (linesCleared > 0) score -= linesCleared * 3000000;
      } else {
        // 【爆發期】
        if (linesCleared > 0) {
          score += currentCombo * 1500000;
          if (linesCleared === 1) score += 500000;
          else score += linesCleared * 100000;

          // 4n+3 規則
          const remainder = wellBlocks % keepEmpty;
          const target = keepEmpty - 1;
          if (remainder === target) {
            score += 1000000;
          } else {
            score -= Math.abs(remainder - target) * 400000;
          }
        } else {
          if (currentCombo >= 0) {
            score -= 50000000; // 斷 combo 重罪
          } else {
            score += buildMin * 1000;
            if (wellBlocks > targetResidue) {
              score -= (wellBlocks - targetResidue) * 2000000;
            }
          }
        }
      }
    }

    // 賦予炸彈「絕對權重」(800 萬分)！
    // 即使在蓄力期消行會被扣 500 萬，點燃炸彈的 +800 萬也能強勢覆蓋，逼迫 AI 成為炸彈狂人
    if (bombsCleared > 0) score += bombsCleared * 8000000;

    return score;
  }

  // 模擬將方塊精準放在「特定行與列」(支援 T轉與滑動塞入)
  function aiSimulatePlacement(board, matrix, row, col) {
    const newBoard = board.map(r => r.slice());

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const br = row + r, bc = col + c;
        if (br >= 0 && br < ROWS) newBoard[br][bc] = 'AI';
      }
    }

    let detonatedRows = new Set();
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const br = row + r, bc = col + c;
        let checkR = br + 1;
        while (checkR < ROWS && newBoard[checkR][bc] === 'B') {
           detonatedRows.add(checkR);
           checkR++;
        }
      }
    }

    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      let isGarbage = false;
      for (let c = 0; c < COLS; c++) {
        if (!newBoard[r][c]) { full = false; break; }
        if (newBoard[r][c] === 'G' || newBoard[r][c] === 'B') isGarbage = true;
      }
      if (full && !isGarbage) fullRows.push(r);
    }

    const allRowsToClear = [...new Set([...fullRows, ...detonatedRows])].sort((a,b) => a - b);
    let bombsCleared = 0;
    allRowsToClear.forEach(r => {
      if (newBoard[r].includes('B')) bombsCleared++;
    });

    const finalBoard = newBoard.filter((_, i) => !allRowsToClear.includes(i));
    while (finalBoard.length < ROWS) finalBoard.unshift(Array(COLS).fill(null));

    return { b: finalBoard, lines: fullRows.length, bombs: bombsCleared };
  }

  // 2-Step 光束搜索大腦 (Beam Search Lookahead)
  function aiFindBestMove(board, piece, depth = 1, currentComboState = aiCombo) {
    let bestScore = -Infinity;
    let bestMove = { col: piece.col, rot: piece.rot, row: piece.row, score: -Infinity, path: [] };

    let queue = [{ r: piece.row, c: piece.col, rot: piece.rot, path: "" }];
    let visited = new Set();
    let validPlacements = [];

    // 1. 找出當前方塊所有可能的合法落點
    while (queue.length > 0) {
      let curr = queue.shift();
      let key = `${curr.r},${curr.c},${curr.rot}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const matrix = PIECES[piece.type][curr.rot];

      if (!aiValid(matrix, curr.r + 1, curr.c, board)) {
        validPlacements.push(curr);
      }

      if (aiValid(matrix, curr.r + 1, curr.c, board)) queue.push({ r: curr.r + 1, c: curr.c, rot: curr.rot, path: curr.path + 'D' });
      if (aiValid(matrix, curr.r, curr.c - 1, board)) queue.push({ r: curr.r, c: curr.c - 1, rot: curr.rot, path: curr.path + 'L' });
      if (aiValid(matrix, curr.r, curr.c + 1, board)) queue.push({ r: curr.r, c: curr.c + 1, rot: curr.rot, path: curr.path + 'R' });
      
      const nextRot = (curr.rot + 1) % 4;
      const nextMatrix = PIECES[piece.type][nextRot];
      if (aiValid(nextMatrix, curr.r, curr.c, board)) {
        queue.push({ r: curr.r, c: curr.c, rot: nextRot, path: curr.path + 'C' });
      } else if (aiValid(nextMatrix, curr.r, curr.c - 1, board)) {
        queue.push({ r: curr.r, c: curr.c - 1, rot: nextRot, path: curr.path + '1' }); 
      } else if (aiValid(nextMatrix, curr.r, curr.c + 1, board)) {
        queue.push({ r: curr.r, c: curr.c + 1, rot: nextRot, path: curr.path + '2' }); 
      }
    }

    // 2. 評分並加入「未來預判」
    validPlacements.forEach(pos => {
      const matrix = clone(PIECES[piece.type][pos.rot]);
      const simData = aiSimulatePlacement(board, matrix, pos.r, pos.c);
      if (!simData) return;

      // 模擬這一步放下去後的 Combo 狀態變化
      let simulatedCombo = currentComboState;
      if (simData.lines > 0) simulatedCombo++;
      else simulatedCombo = -1;

      // 當下這步的基礎分數 (使用模擬後的 Combo)
      let score = aiEvaluate(simData, simulatedCombo);

      // 預判未來 (Lookahead)
      if (depth === 1 && aiQueue.length > 0) {
          const nextPieceSim = aiMakePiece(aiQueue[0]);
          // ★ 核心修復：把模擬的 Combo 狀態傳遞遞迴給未來！讓 AI 能「看見」連擊
          const futureBestMove = aiFindBestMove(simData.b, nextPieceSim, 0, simulatedCombo); 
          
          if (futureBestMove.score !== -Infinity) {
              score += futureBestMove.score * 0.8; 
          }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = { col: pos.c, rot: pos.rot, row: pos.r, score: score, path: pos.path.split('') };
      }
    });

    if (bestScore === -Infinity) bestMove.path = [];
    return bestMove;
  }

  // AI 備用瞬間移動 (當擬人化卡住時的終極保險機制)
  function aiExecuteMove(move) {
    if (!aiCurrent) return;
    const mat = clone(PIECES[aiCurrent.type][move.rot]);

    // ★ 安全檢查：驗證 C++ 回傳的位置在目前盤面上是否合法
    if (!aiValid(mat, move.row, move.col, aiBoard)) {
      // 位置無效（可能 WASM 崩潰回傳了預設值，或盤面已變動）
      // 用原本的旋轉，從當前位置往下硬降找到合法位置
      let fallbackRow = aiCurrent.row;
      const fallbackMat = clone(PIECES[aiCurrent.type][aiCurrent.rot]);
      if (aiValid(fallbackMat, fallbackRow, aiCurrent.col, aiBoard)) {
        while (aiValid(fallbackMat, fallbackRow + 1, aiCurrent.col, aiBoard)) fallbackRow++;
        aiCurrent.matrix = fallbackMat;
        aiCurrent.row = fallbackRow;
      } else {
        // 連當前位置都無效，嘗試用 C++ 的旋轉和欄位但重新計算行
        let safeRow = 0;
        if (aiValid(mat, safeRow, move.col, aiBoard)) {
          while (aiValid(mat, safeRow + 1, move.col, aiBoard)) safeRow++;
          aiCurrent.matrix = mat;
          aiCurrent.rot = move.rot;
          aiCurrent.col = move.col;
          aiCurrent.row = safeRow;
        } else {
          // 真的沒救了，用原始狀態硬降
          aiCurrent.row = aiCurrent.row;
          while (aiValid(aiCurrent.matrix, aiCurrent.row + 1, aiCurrent.col, aiBoard)) aiCurrent.row++;
        }
      }
      console.warn("⚠️ AI 落點無效，已自動修正到安全位置");
    } else {
      aiCurrent.matrix = mat;
      aiCurrent.rot = move.rot;
      aiCurrent.col = move.col;
      aiCurrent.row = move.row;
    }
    aiLockPiece();
  }

  // --- 全新的 C++ 驅動版 updateAI ---
  function updateAI(delta) {
    if (!isAIMode || aiGameOver || gameOver || !isAiReady || isPaused || countdownValue > 0) return;
    if (!aiCurrent) return;

    // ---------------------------------------------------------
    // 🪀 隱形橡皮筋機制 (Dynamic Difficulty Adjustment)
    // ---------------------------------------------------------
    // 1 KO 大約等同於 20 行的壓制力。計算雙方目前的「綜合戰力」
    const myPower = myLinesSent + (myKOs * 20);
    const aiPower = oppLinesSent + (oppKOs * 20);
    const powerDiff = aiPower - myPower; // 正數: AI 領先 / 負數: 玩家領先

    // 計算橡皮筋係數 (預設 1.0)
    // 如果差距 20，係數會變成 1.5 或 0.5。為了不被察覺，限制在 0.6 ~ 1.4 之間
    let rubberBand = 1.0;
    if (aiSpeedMode === 'adaptive') { // 適應模式套用橡皮筋機制
       rubberBand = 1.0 + (powerDiff / 40); 
       rubberBand = Math.max(0.6, Math.min(rubberBand, 1.4)); 
    }

    if (!aiCurrent.target) {
      if (!aiCurrent._hesitating) {
        // 純 loop 求最高列，避免 Array.from + spread 每次產生一次性陣列
        let maxH = 0;
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            if (aiBoard[r][c]) { const h = ROWS - r; if (h > maxH) maxH = h; break; }
          }
        }
        const pressureBonus = Math.max(0, (maxH - 10) * 50);
        
        // 🪀 套用橡皮筋：領先時發呆機率變高、想更久；落後時變專心
        const baseHesChance = { rookie: 0.35, casual: 0.2, adaptive: 0.12, pro: 0.1, god: 0.01 }[aiSpeedMode] || 0.12;
        const baseHesMs = { rookie: 300, casual: 180, adaptive: 100, pro: 120, god: 15 }[aiSpeedMode] || 100;
        const hesitateChance = baseHesChance * rubberBand; 
        const hesitateMs = baseHesMs * rubberBand;
        
        if (Math.random() < hesitateChance) {
          aiCurrent._hesitating = true;
          aiCurrent._hesitateEnd = performance.now() + hesitateMs + pressureBonus + Math.random() * 80;
          return; 
        }
      }
      
      if (aiCurrent._hesitating) {
        if (performance.now() < aiCurrent._hesitateEnd) return;
        aiCurrent._hesitating = false;
      }

      // 準備餵給 C++ 的資料
      // 使用陣列快取來組裝字串，消除記憶體垃圾
      if (typeof window._aiWasmBuffer === 'undefined') {
          window._aiWasmBuffer = new Array(ROWS * COLS); 
      }
      
      let _idx = 0;
      for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
              window._aiWasmBuffer[_idx++] = aiBoard[r][c] ? '1' : '.'; 
          }
      }
      let boardStr = window._aiWasmBuffer.join('');
      
      let currentPiece = aiCurrent.type;
      let holdPiece = aiHoldType ? aiHoldType : "NONE";
      // 把預覽方塊也傳給 C++
      let queueStr = aiQueue.slice(0, 5).join('');

      // 讀取你面板上的打法設定 (自動=0, 1-wide=1...以此類推)
      let keepEmpty = aiWideMode === 'auto' ? 0 : parseInt(aiWideMode);

      // 呼叫 C++ 大腦
      if (!isAiThinking && isAiReady) {
        // 準備好資料丟給背景 Worker
        isAiThinking = true;
        lastAiThinkTime = performance.now();
        aiWorker.postMessage({
          type: 'THINK',
          payload: {
            boardStr: boardStr,
            currentPiece: currentPiece,
            holdPiece: holdPiece,
            queueStr: queueStr,
            aiCombo: aiCombo,
            keepEmpty: keepEmpty
          }
        });

        // 任務丟出去後立刻 return，不要讓主執行緒等待！
        return;
      } else if (isAiThinking) {
        // 如果 AI 還在背景苦思冥想，我們就直接跳過這一幀，讓畫面繼續流暢繪製
        return;
      }
    }

    // ---------------------------------------------------------
    // 全新木偶操控系統：將 C++ 的運算結果轉化為擬人化動畫
    // ---------------------------------------------------------
    
    // 套用橡皮筋：領先時手指移動變慢；落後時飆手速
    const baseFingerDelay = { rookie: 120, casual: 60, adaptive: Math.max(16, currentAiThinkInterval / 8), pro: 40, god: 5 }[aiSpeedMode] || 30;
    const fingerDelay = baseFingerDelay * rubberBand;

    aiThinkTimer += delta;
    // 確保上限「絕對大於」AI 移動所需的最低時間 (給予 1.5 倍的緩衝空間)
    const maxTimeDebt = Math.max(100, fingerDelay * 1.5);
    if (aiThinkTimer > maxTimeDebt) aiThinkTimer = maxTimeDebt;

    let needsSync = false; // 效能優化：紀錄這幀是否有任何改變

    while (aiThinkTimer >= fingerDelay) {
      // 扣除時間，進入下一步
      aiThinkTimer -= fingerDelay;

      // 處理 Hold 邏輯
      if (aiCurrent.target.useHold && !aiHoldUsed) {
         if (!aiHoldType) {
            aiHoldType = aiCurrent.type;
            aiCurrent = aiMakePiece(aiQueue.shift());
            aiEnsureQueue();
         } else {
            const swap = aiHoldType;
            aiHoldType = aiCurrent.type;
            aiCurrent = aiMakePiece(swap);
         }
         aiHoldUsed = true;
         aiCurrent.target = null;
         aiSyncOppState();
         return; // 換牌需要花掉剩餘的時間，直接跳出這幀的計算
      }

      let moved = false;
      let target = aiCurrent.target;

      if (aiCurrent.rot !== target.rot) {
        aiCurrent.rot = target.rot;
        aiCurrent.matrix = clone(PIECES[aiCurrent.type][aiCurrent.rot]);
        moved = true;
      }
      else if (aiCurrent.col !== target.col) {
        aiCurrent.col += (target.col > aiCurrent.col) ? 1 : -1;
        moved = true;
      }
      else if (aiCurrent.row < target.row) {
        let dropSpeed = { rookie: 1, casual: 1, adaptive: 2, pro: 4, god: 20 }[aiSpeedMode] || 2;
        aiCurrent.row = Math.min(aiCurrent.row + dropSpeed, target.row);
        moved = true;
      }

      if (!moved) {
        aiExecuteMove(target);
        needsSync = true;
        break; // 已經撞到底部鎖定了，直接跳出 while 迴圈
      } else {
        needsSync = true; // 有移動，標記需要同步
      }
    }

    // 效能優化：將原本一幀可能呼叫 3~4 次的高負擔同步，壓縮到迴圈外只呼叫 1 次！
    if (needsSync) {
        aiSyncOppState();
    }
  
  }

  function aiLockPiece() {
    if (!aiCurrent) return;
    _aiBoardDirty = true; // 鎖定會改變盤面，標記快取失效
    for (let r = 0; r < aiCurrent.matrix.length; r++) {
      for (let c = 0; c < aiCurrent.matrix[r].length; c++) {
        if (!aiCurrent.matrix[r][c]) continue;
        const br = aiCurrent.row + r, bc = aiCurrent.col + c;
        if (br >= 0 && br < ROWS) aiBoard[br][bc] = aiCurrent.type;
      }
    }

    // 尋找 AI 是否觸發連鎖炸彈
    let detonatedRows = new Set();
    for (let r = 0; r < aiCurrent.matrix.length; r++) {
      for (let c = 0; c < aiCurrent.matrix[r].length; c++) {
        if (!aiCurrent.matrix[r][c]) continue;
        const br = aiCurrent.row + r, bc = aiCurrent.col + c;
        let checkR = br + 1;
        while (checkR < ROWS && aiBoard[checkR][bc] === 'B') {
           detonatedRows.add(checkR);
           checkR++;
        }
      }
    }

    // 尋找一般的滿行 (排除垃圾行)
    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      let isGarbage = false;
      for (let c = 0; c < COLS; c++) {
        if (!aiBoard[r][c]) { full = false; break; }
        if (aiBoard[r][c] === 'G' || aiBoard[r][c] === 'B') isGarbage = true;
      }
      if (full && !isGarbage) fullRows.push(r);
    }

    // 合併所有要消除的行 (一般消行 + 炸彈)
    const allRowsToClear = [...new Set([...fullRows, ...detonatedRows])].sort((a,b) => a - b);

    if (allRowsToClear.length > 0) {
      // 計算 AI 引爆的炸彈數量
      let bombsCleared = 0;
      allRowsToClear.forEach(r => {
        if (aiBoard[r].includes('B')) bombsCleared++;
      });

      aiBoard = aiBoard.filter((_, i) => !allRowsToClear.includes(i));
      while (aiBoard.length < ROWS) aiBoard.unshift(Array(COLS).fill(null));

      aiLines += fullRows.length;
      aiScore += [0, 100, 300, 500, 800][fullRows.length] * aiLevel;
      aiLevel = Math.floor(aiLines / 10) + 1;

      // --- AI 專屬 Combo 系統 ---
      aiCombo++; 
      let attack = [0, 0, 1, 2, 4][fullRows.length] || 0;
      
      if (aiCombo > 0) {
        const comboBonuses = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4];
        attack += comboBonuses[Math.min(aiCombo, 10)] || 0;
        
        const comboColor = aiCombo >= 5 ? '#ff0d62' : (aiCombo >= 3 ? '#f7dd16' : '#48d62f'); 
        const comboSize = 24 + Math.min(aiCombo * 3, 20);
        oppFloatingTexts.push(new FloatingText(`${aiCombo} COMBO!`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 40, comboColor, comboSize));
        playSound('clear', aiCombo); 
      }

      // 加上炸彈爆發的攻擊力
      if (bombsCleared > 0) {
         attack += bombsCleared;
         // AI 畫面上顯示炸彈爆炸，你的畫面上顯示被扣血
         oppFloatingTexts.push(new FloatingText(`BOMB +${bombsCleared}!`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 - 50, '#ff1111', 40));
         myFloatingTexts.push(new FloatingText(`-${bombsCleared}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 20, '#ff1111', 50));
         playSound('drop'); shakeMag = 6;
      }

      if (attack > 0) {
        let remainingAttack = attack;
        
        // 抵消邏輯
        if (aiActiveGarbage > 0) {
          if (remainingAttack >= aiActiveGarbage) { remainingAttack -= aiActiveGarbage; aiActiveGarbage = 0; }
          else { aiActiveGarbage -= remainingAttack; remainingAttack = 0; }
        }
        if (remainingAttack > 0 && aiNextGarbage > 0) {
          if (remainingAttack >= aiNextGarbage) { remainingAttack -= aiNextGarbage; aiNextGarbage = 0; }
          else { aiNextGarbage -= remainingAttack; remainingAttack = 0; }
        }
        
        // 灌垃圾給玩家
        if (remainingAttack > 0) {
          nextGarbage += remainingAttack;
          oppLinesSent += remainingAttack;
          const oppLinesEl = document.getElementById('opp-lines-sent-display');
          if (oppLinesEl) oppLinesEl.textContent = oppLinesSent;
          
          myFloatingTexts.push(new FloatingText(`+${remainingAttack}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 40, '#ff0d62', 50));
          playSound('drop');
          shakeMag = 6;
        }
      }
    } else {
      aiCombo = -1;
    }

    // AI 承受未能抵消的垃圾行
    if (aiActiveGarbage > 0) {
      for (let i = 0; i < aiActiveGarbage; i++) {
        if (aiConsecutiveGarbageHoles >= 2 || aiLastGarbageHole === -1) {
          let newHole;
          do { newHole = Math.floor(Math.random() * COLS); } while (newHole === aiLastGarbageHole);
          aiLastGarbageHole = newHole;
          aiConsecutiveGarbageHoles = 0;
        }
        aiBoard.shift();
        const newRow = Array(COLS).fill('G');
        newRow[aiLastGarbageHole] = 'B';
        aiBoard.push(newRow);
        aiConsecutiveGarbageHoles++;
      }
      aiActiveGarbage = 0;
    }
    aiActiveGarbage += aiNextGarbage;
    aiNextGarbage = 0;

    aiSpawnNext();
  }

  function aiSpawnNext() {
    aiEnsureQueue();
    const type = aiQueue.shift();
    aiEnsureQueue();
    aiCurrent = aiMakePiece(type);
    aiHoldUsed = false; // 每次出新方塊時，重置 Hold 狀態
    
    // 如果出生點就碰壁，檢查生死
    if (!aiValid(aiCurrent.matrix, aiCurrent.row, aiCurrent.col, aiBoard)) {
      
      // 檢查場上是否有垃圾或炸彈
      let hasGarbage = false;
      for (let r = 0; r < ROWS; r++) {
        if (aiBoard[r].includes('G') || aiBoard[r].includes('B')) {
          hasGarbage = true;
          break;
        }
      }

      if (!hasGarbage) {
        // 沒有垃圾可以扣除了，AI 自己疊死
        aiGameOver = true;
        aiSelfDestructed = true;
        aiCurrent = null;
        showMsg("OPPONENT TOPPED OUT!");
        oppFloatingTexts.push(new FloatingText("TOP OUT!", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 60));
        playSound('perfect');
        matchEndReason = 'KO';
        endBattleMatch('WIN');
      } else {
        // 有垃圾，進入 KO 復活流程
        myKOs++;
        const myKoEl = document.getElementById('my-ko-display');
        if (myKoEl) myKoEl.textContent = myKOs;

        oppFloatingTexts.push(new FloatingText("K.O.", (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ff0d62', 100));
        playSound('perfect');
        oppKOTimer = 1000; // 對手畫面變暗 1 秒

        aiCurrent = null; // 暫時沒收方塊

        // 抽掉盤面上的垃圾與炸彈
        let newBoard = aiBoard.filter(row => !row.includes('G') && !row.includes('B'));
        while (newBoard.length < ROWS) {
          newBoard.unshift(Array(COLS).fill(null));
        }
        aiBoard = newBoard;
        _aiBoardDirty = true; // 盤面換了，壓縮快取失效
        aiActiveGarbage = 0;
        aiNextGarbage = 0;
        aiCombo = -1; // 復活後斷連擊
        aiSyncOppState();

        // 1秒後復活
        setTimeout(() => {
          if (!aiGameOver && !gameOver) {
            aiSpawnNext();
          }
        }, 1000);
      }
    }
  }

  const _aiBoardBuffer = new Array(400); // 宣告全域快取陣列
  let _aiBoardDirty = true;              // 盤面是否需要重算壓縮字串 (lock/garbage/reset 時才需要)
  let _cachedAiBoardStr = '';            // 上一次計算出來的壓縮盤面字串，穩定值可讓 drawOpponent 直接 === 跳過
  // 更新 oppState 讓對手畫面正確渲染 AI 的盤面
  // 效能：重用同一個 oppState 物件、.c 子物件、.q 陣列，避免每幀產生 GC 垃圾造成卡頓
  function aiSyncOppState() {
    // 只有盤面真的變動才重算字串 (AI 移動方塊不會影響 aiBoard，只有 lock/garbage 才會)
    if (_aiBoardDirty) {
      let idx = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          _aiBoardBuffer[idx++] = aiBoard[r][c] ? aiBoard[r][c] : '.';
        }
      }
      _cachedAiBoardStr = _aiBoardBuffer.join('');
      _aiBoardDirty = false;
    }

    // 初次建立 oppState 時才分配物件；之後所有呼叫都直接覆寫欄位，零 GC 垃圾
    if (!oppState) {
      oppState = { c: null, q: [] };
    }
    oppState.b = _cachedAiBoardStr;
    oppState.s = aiScore;
    oppState.g = aiActiveGarbage;
    oppState.ng = aiNextGarbage;
    // 觀戰端用 oppState.k 顯示對方的 KO 數；AI 的「擊殺次數」就是我方被 KO 的次數
    oppState.k = oppKOs;
    oppState.ls = oppLinesSent;
    oppState.lp = 0;
    oppState.isGuest = true;
    oppState.h = aiHoldType;
    oppState.hu = typeof aiHoldUsed !== 'undefined' ? aiHoldUsed : false;

    if (aiCurrent) {
      if (!oppState.c) oppState.c = { t: '', r: 0, c: 0, rot: 0 };
      oppState.c.t = aiCurrent.type;
      oppState.c.r = aiCurrent.row;
      oppState.c.c = aiCurrent.col;
      oppState.c.rot = aiCurrent.rot;
    } else {
      oppState.c = null;
    }

    // 重用 queue 陣列而不是每次 slice 產生新陣列
    if (!oppState.q) oppState.q = [];
    oppState.q.length = 0;
    const qLen = Math.min(aiQueue.length, 5);
    for (let i = 0; i < qLen; i++) oppState.q.push(aiQueue[i]);

    renderOpponentPanels(); // AI 狀態更新時才重畫對手面板
  }

  // 初始化 AI 對局
  function initAI() {
    // 只設定名牌，不啟動任何方塊或計時，等 startCountdown 裡才真正啟動
    const oppTitleEl = document.getElementById('opp-name-display');
    if (oppTitleEl) {
      oppTitleEl.innerHTML = '🤖 AI<br><span style="font-size:12px; color:rgba(255,255,255,0.6); letter-spacing:0px;">電腦對手</span>';
      oppTitleEl.style.color = 'var(--T)';
      oppTitleEl.style.textShadow = '0 0 10px var(--T)';
    }
    // --- 拔掉 AI 的記憶，避免重新進房時 AI 自動開疊 ---
    aiGameOver = true;   // 強制休眠，直到倒數結束才喚醒
    aiCurrent = null;    // 清空手上拿著的方塊
    aiBoard = createBoard(); // 給它一個乾淨的空盤面
    _aiBoardDirty = true;    // 盤面換成全新的，快取失效
    aiQueue = [];        // 清空 AI 預覽方塊
    aiHoldType = null;   // 清空 AI 保留方塊
    aiHoldUsed = false;
    aiSyncOppState();    // 立即把畫面上殘留的對手畫面清空
    
  }

  // AI 正式開始（倒數結束後才呼叫）
  function startAI() {
    aiBoard = createBoard();
    _aiBoardDirty = true;
    aiQueue = [];
    aiCurrent = null;
    aiHoldType = null;      // 清空 Hold 區
    aiHoldUsed = false;     // 重置 Hold 狀態
    aiScore = 0; aiLines = 0; aiLevel = 1;
    aiCombo = -1;
    aiGameOver = false; aiGravityTimer = 0; aiThinkTimer = 0;
    aiSelfDestructed = false;

    // 清空 AI 身上殘留的垃圾與破洞記憶
    aiActiveGarbage = 0;
    aiNextGarbage = 0;
    aiLastGarbageHole = -1;
    aiConsecutiveGarbageHoles = 0;

    // 初始化適應性 AI 數據
    // 根據玩家選擇的速度模式初始化思考間距
    const speedMap = { rookie: 900, casual: 600, adaptive: 4000, pro: 400, god: 80 };
    currentAiThinkInterval = speedMap[aiSpeedMode] || 600;
    myLastLockTime = performance.now();
    myLockIntervals = [currentAiThinkInterval, currentAiThinkInterval];

    aiEnsureQueue();
    aiSpawnNext();
    aiSyncOppState();
  }

  // --- UI 提示函數 ---
  function showMsg(text) {
    if (actionMsgEl) {
      actionMsgEl.textContent = text;
      if (msgTimeout) clearTimeout(msgTimeout);
      msgTimeout = setTimeout(() => { actionMsgEl.textContent = ''; }, 1500);
    }
  }

  // --- 官方 3-Corner 判定邏輯 ---
  function getTSpinType() {
    if (current.type !== 'T' || lastMoveType !== 'rotate') return null;

    // T 方塊的中心點座標 (3x3 陣列的 [1][1])
    const r = current.row + 1;
    const c = current.col + 1;
    const corners = [ [r-1, c-1], [r-1, c+1], [r+1, c-1], [r+1, c+1] ];
    
    let filled = 0, frontFilled = 0, backFilled = 0;
    // 根據旋轉狀態決定哪兩個角落是「前方 (Flat side)」
    const frontIdx = {0:[0,1], 1:[1,3], 2:[2,3], 3:[0,2]}[current.rot];

    for (let i = 0; i < 4; i++) {
      const [cr, cc] = corners[i];
      // 檢查是否超出邊界或被其他方塊佔據
      if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || board[cr][cc]) {
        filled++;
        if (frontIdx.includes(i)) frontFilled++; 
        else backFilled++;
      }
    }

    // 3-Corner 規則：至少3個角落被填滿
    if (filled >= 3) {
      // 官方例外：如果使用了第5個踢牆測試(索引4)，無條件視為 Full T-Spin
      if (lastKickIndex === 4) return 'Full';
      // 前方兩個角都被擋住 -> Full
      if (frontFilled === 2) return 'Full';
      // 前方擋住1個，後方擋住2個 -> Mini
      if (frontFilled === 1 && backFilled === 2) return 'Mini';
    }
    return null;
  }

  // --- 支援攻擊與抵消的計分系統 ---
  function applyScore(linesCleared, tSpinType, isPerfectClear = false) {
    let base = 0;
    let difficult = false;
    let msg = '';
    let attack = 0; // 本次操作的攻擊力

    if (linesCleared > 0) combo++;
    else combo = -1;
    if (combo > maxCombo) maxCombo = combo;

    if (linesCleared > 0) {
      lines += linesCleared;
      if (!isMultiplayer && !isPracticeMode && !isNarrowMode && !isFreeMode) level = Math.floor(lines / 10) + 1;
    }

    // 依照競技攻擊表設定基礎分數與攻擊力
    if (tSpinType) {
      difficult = true;
      if (tSpinType === 'Full') {
        // T-Spin=400 / TSS=800 / TSD=1200 / TST=1600
        base = [400, 800, 1200, 1600][linesCleared] || 0;
        attack = [0, 2, 4, 6][linesCleared] || 0;
        msg = linesCleared ? `T-Spin ${['','Single','Double','Triple'][linesCleared]}` : 'T-Spin';
      } else { // Mini
        // Mini=100 / Mini Single=200 / Mini Double=400
        base = [100, 200, 400, 0][linesCleared] || 0;
        attack = [0, 1, 0, 0][linesCleared] || 0;
        msg = linesCleared ? `Mini T-Spin ${['','Single','Double'][linesCleared]}` : 'Mini T-Spin';
      }
    } else {
      // Single=100 / Double=300 / Triple=500 / Quad=800
      base = [0, 100, 300, 500, 800][linesCleared] || 0;
      attack = [0, 0, 1, 2, 4][linesCleared] || 0;
      if (linesCleared === 4) {
        difficult = true;
        msg = 'Quad';
      }
    }

    if (base > 0 || isPerfectClear) {
      if (isPerfectClear) playSound('perfect');
      else if (tSpinType) { playSound('tspin'); shakeMag = 5; }
      else if (linesCleared === 4) { playSound('quad'); shakeMag = 8; }
      else if (linesCleared > 0) { playSound('clear', combo > 0 ? combo : 0); shakeMag = 2 + linesCleared; }
      
      // B2B 判定
      if (difficult) {
        if (linesCleared > 0) {
          if (b2b > 0) {
            base = Math.floor(base * 1.5);
            // 覆蓋為圖表中的 B2B 攻擊力
            if (!tSpinType && linesCleared === 4) attack = 6; // B2B Quad
            else if (tSpinType === 'Mini' && linesCleared === 1) attack = 2; // B2B T-Spin Mini
            else if (tSpinType === 'Full' && linesCleared === 1) attack = 3; // B2B T-Spin Single
            else if (tSpinType === 'Full' && linesCleared === 2) attack = 6; // B2B T-Spin Double
            else if (tSpinType === 'Full' && linesCleared === 3) attack = 9; // B2B T-Spin Triple
            
            msg = `B2B ${msg}`;
          }
          b2b++; 
        }
      } else if (linesCleared > 0) {
        b2b = 0; 
      }

      // Combo 加成
      if (combo > 0) {
        base += 50 * combo;
        const comboBonuses = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4];
        attack += comboBonuses[Math.min(combo, 10)] || 0;
        msg = msg ? `${msg} + COMBO ${combo}` : `COMBO ${combo}`;

        const comboColor = combo >= 5 ? '#ff0d62' : (combo >= 3 ? '#f7dd16' : '#48d62f'); 
        const comboSize = 24 + Math.min(combo * 3, 20); 
        myFloatingTexts.push(new FloatingText(`${combo} COMBO!`, (COLS * SIZE) / 2, (VISIBLE_ROWS * SIZE) / 2 + 40, comboColor, comboSize));
      }

      // 完美清除
      if (isPerfectClear) {
        attack += 10; 
        msg = 'PERFECT CLEAR!';
        shakeMag = 10; 
      }
      
      score += base * level;

      // 將大招式的文字也轉換成強烈視覺特效
      if (msg) {
        showMsg(msg); 
        let cleanMsg = msg.replace(` + COMBO ${combo}`, ''); 
        if (cleanMsg !== '' && !cleanMsg.startsWith('COMBO')) {
          let floatColor = '#ffffff'; let floatSize = 28;
          if (cleanMsg.includes('PERFECT')) { floatColor = '#f7dd16'; floatSize = 40; }
          else if (cleanMsg.includes('Quad')) { floatColor = '#38bdee'; floatSize = 34; }
          else if (cleanMsg.includes('T-Spin')) { floatColor = '#b144f7'; floatSize = 32; }
          myFloatingTexts.push(new FloatingText(cleanMsg, (COLS * SIZE) / 2, (VISIBLE_ROWS * SIZE) / 2 - 20, floatColor, floatSize));
        }
      }
    }
    
    // --- 抵消 (Cancel) 與 送出攻擊 (Send) ---
    if (linesCleared > 0 && attack > 0) {
      // 先抵消馬上要進來的危險垃圾 (紅色)
      if (activeGarbage > 0) {
        if (attack >= activeGarbage) { attack -= activeGarbage; activeGarbage = 0; }
        else { activeGarbage -= attack; attack = 0; }
      }
      // 如果還有攻擊力，再抵消寬限期中的垃圾 (黃色)
      if (attack > 0 && nextGarbage > 0) {
        if (attack >= nextGarbage) { attack -= nextGarbage; nextGarbage = 0; }
        else { nextGarbage -= attack; attack = 0; }
      }
      // 抵消後還有剩，就打給對手
      if (attack > 0 && isMultiplayer) {
        if (window.isMpMulti && window.mpGameActive) {
          // 多人對戰：依目前策略挑目標 peer，走 mesh 送 MP_ATTACK
          const targetPid = (typeof pickMpAttackTarget === 'function') ? pickMpAttackTarget() : null;
          if (targetPid) {
            sendMpToPeer(targetPid, { type: 'MP_ATTACK', lines: attack });
          }
          myLinesSent += attack;
          const myLinesEl = document.getElementById('my-lines-sent-display');
          if (myLinesEl) myLinesEl.textContent = myLinesSent;
          oppFloatingTexts.push(new FloatingText(`-${attack}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 20, '#ff1111', 50));
        } else if (isAIMode) {
          // 玩家打擊 AI 模式
          aiNextGarbage += attack;
          myLinesSent += attack;
          const myLinesEl = document.getElementById('my-lines-sent-display');
          if (myLinesEl) myLinesEl.textContent = myLinesSent;
          
          oppFloatingTexts.push(new FloatingText(`-${attack}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 20, '#ff1111', 50));
        } else if (conn && conn.open) {
          // 真人對戰模式
          conn.send({ type: 'ATTACK', lines: attack });
          myLinesSent += attack;
          const myLinesEl = document.getElementById('my-lines-sent-display');
          if (myLinesEl) myLinesEl.textContent = myLinesSent;

          oppFloatingTexts.push(new FloatingText(`-${attack}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 20, '#ff1111', 50));
        }
      }
    }

    updateHUD();
  }

  // --- 鎖定函數 (判定引爆、T轉與天花板死亡) ---
  function lockPiece() {
    // 對戰紀錄：計算 PPS/APM 用
    if (current && gameStarted && !gameOver) piecesPlaced++;
    // 只記錄這顆方塊佔據的「精準網格座標」
    if (current && gameStarted && !gameOver) {
      let cells = [];
      for (let r = 0; r < current.matrix.length; r++) {
        for (let c = 0; c < current.matrix[r].length; c++) {
          if (current.matrix[r][c]) {
            cells.push({ r: current.row + r, c: current.col + c });
          }
        }
      }

      previousGameState = {
        pieceCells: cells, // 只記住這幾格！不碰其他盤面
        score: current.startScore, // 無視你硬降賺了多少分，讀取方塊出生的乾淨分數
        lines: lines,
        combo: combo,
        b2b: b2b,
        pieceType: current.type,
        myPieceIndex: myPieceIndex,
        queue: [...queue],
        holdType: holdType,
        holdUsed: holdUsed
      };
    }
    // --- 適應性 AI：即時記錄玩家的落塊手速 ---
    if (isAIMode && gameStarted && aiSpeedMode === 'adaptive') {
      const now = performance.now();
      if (myLastLockTime > 0) {
        let interval = now - myLastLockTime;
        // 如果玩家發呆、剛經歷復活或暫停，時間會拉很長，最高限制在 10000ms
        if (interval > 10000) interval = 10000; 
        
        myLockIntervals.push(interval);
        if (myLockIntervals.length > 5) myLockIntervals.shift(); // 只抓取最近 5 次的平均值
        
        // 計算你最近的平均手速
        let avg = myLockIntervals.reduce((a, b) => a + b, 0) / myLockIntervals.length;
        
        // 設定 AI 的速度：完美模仿你的平均速度
        currentAiThinkInterval = Math.max(120, avg);
      }
      myLastLockTime = now;
    } else if (isAIMode && gameStarted && aiSpeedMode !== 'adaptive') {
      // 固定速度模式：不跟隨玩家，但記錄一下時間以備切換
      myLastLockTime = performance.now();
    }

    const tSpin = getTSpinType();

    let isLockOut = true;

    // 鎖定方塊到盤面上
    for (let r = 0; r < current.matrix.length; r++) {
      for (let c = 0; c < current.matrix[r].length; c++) {
        if (!current.matrix[r][c]) continue;
        const br = current.row + r;
        const bc = current.col + c;

        // 只要確保在陣列範圍內，就寫入盤面
        if (br >= 0) {
          board[br][bc] = current.type; 
          
          // --- 修正：必須有一格 >= 20 (VISIBLE_ROWS)，才算踏進畫面，才能活命！ ---
          if (br >= VISIBLE_ROWS) {
            isLockOut = false; 
          }
        }
      }
    }

    // 只有當整顆方塊都鎖死在隱藏區 (畫面外) 才結束遊戲
    if (isLockOut) {
      triggerGameOver(false);
      return;
    }

    // 尋找是否有炸彈被觸發 (方塊落在炸彈正上方)
    let detonatedRows = new Set();
    for (let r = 0; r < current.matrix.length; r++) {
      for (let c = 0; c < current.matrix[r].length; c++) {
        if (!current.matrix[r][c]) continue;
        const br = current.row + r;
        const bc = current.col + c;
        
        // 往下檢查，如果有連鎖炸彈，一起引爆
        let checkR = br + 1;
        while (checkR < ROWS && board[checkR][bc] === 'B') {
           detonatedRows.add(checkR);
           checkR++;
        }
      }
    }

    // 尋找滿行
    // BOMB 模式：含 G 的行不算一般消行 (因為 G 行洞口是炸彈，正常情況不會被填滿；唯一移除方式是引爆)
    // CLASSIC 模式：G 行 (灰垃圾行) 被填滿後就可以一般消除
    // 兩個模式都禁止把含 'B' 炸彈的行當一般消行 (那要靠 detonatedRows 引爆)
    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      let hasGarbage = false;
      let hasBomb = false;
      for (let c = 0; c < COLS; c++) {
        if (!board[r][c]) { full = false; break; }
        if (board[r][c] === 'G') hasGarbage = true;
        else if (board[r][c] === 'B') hasBomb = true;
      }
      if (!full || hasBomb) continue;
      // 經典模式允許 G 行被一般消除；炸彈模式維持原本「乾淨行才算消行」的規則
      if (battleMode === 'CLASSIC' || !hasGarbage) fullRows.push(r);
    }

    // 合併所有要消除的行 (一般消行 + 炸彈行)
    const allRowsToClear = [...new Set([...fullRows, ...detonatedRows])].sort((a,b) => a - b);

    if (allRowsToClear.length > 0) {
      canUndo = false; // 有消行或炸彈，快照作廢，沒收反悔權限
      clearFx = { rows: allRowsToClear, elapsed: 0, visualElapsed: 0, duration: SETTINGS.clearDuration, tSpin: tSpin };
      sendState();
    } else {
      canUndo = true;  // 沒消行，剛剛在最上面拍的快照正式生效

      applyScore(0, tSpin, false);
      applyGarbage(); 
      activeGarbage += nextGarbage;
      nextGarbage = 0;
      spawn();
    }
  }

  // --- 將垃圾行從底部推入盤面 ---
  // BOMB 模式：每行洞口放一顆 'B' 炸彈，玩家落在炸彈正上方就引爆消行；連 2 行同洞就換洞 (2-2-2 凌亂機制)
  // CLASSIC 模式：每行洞口是空格 (null)，可以塞方塊填滿後一般消除；
  //   一次倒下的所有垃圾共用同一個洞口，下次再倒下垃圾才換新洞
  function applyGarbage() {
    if (activeGarbage <= 0) return;

    const linesToAdd = activeGarbage;
    let linesAdded = 0;

    if (battleMode === 'CLASSIC') {
      // 經典模式：本批次的所有垃圾行共用同一個洞，且不要跟上一批次相同 (盡量)
      let newHole;
      do {
        newHole = Math.floor(Math.random() * COLS);
      } while (linesToAdd > 0 && newHole === lastGarbageHole && COLS > 1);
      lastGarbageHole = newHole;
      consecutiveGarbageHoles = 0;

      for (let i = 0; i < linesToAdd; i++) {
        board.shift();
        const newRow = Array(COLS).fill('G');
        newRow[newHole] = null; // 洞口是空格，玩家可以把方塊填進去消除
        board.push(newRow);
        linesAdded++;
      }
    } else {
      // BOMB 模式：保留原本 2-2-2 凌亂洞口的炸彈機制
      for (let i = 0; i < linesToAdd; i++) {
        if (consecutiveGarbageHoles >= 2 || lastGarbageHole === -1) {
          let newHole;
          do {
            newHole = Math.floor(Math.random() * COLS);
          } while (newHole === lastGarbageHole);
          lastGarbageHole = newHole;
          consecutiveGarbageHoles = 0; // 換新洞口後，重置計數
        }

        board.shift();
        const newRow = Array(COLS).fill('G');
        newRow[lastGarbageHole] = 'B';
        board.push(newRow);

        linesAdded++;
        consecutiveGarbageHoles++; // 每推入一行，連續次數 +1
      }
    }

    if (linesAdded > 0) {
      // 如果垃圾把盤面往上頂，同步修正我們剛才記住的方塊座標
      if (canUndo && previousGameState && previousGameState.pieceCells) {
        previousGameState.pieceCells.forEach(cell => cell.r -= linesAdded);
      }
      
      // 視覺畫布往下壓，這樣在 renderLoop 裡就會產生「滑順湧上來」的電梯感
      visualBoardOffsetY += linesAdded * SIZE; 

      playSound('drop');
      shakeMag = 4 + linesAdded; 
    }

    activeGarbage -= linesAdded; 
  }

  // --- 清除函數 (發送分數) ---
  function clearRows(rowsToClear) {
    // --- 只要發生消行或引爆炸彈，因為會影響對手，立即沒收反悔權利 ---
    canUndo = false;
    previousGameState = null;

    const tSpin = clearFx ? clearFx.tSpin : null;

    // 計算炸彈數量
    let bombsCleared = 0;
    
    rowsToClear.forEach(r => {
      let hasBomb = false;
      board[r].forEach(cell => {
        if (cell === 'B') hasBomb = true;
      });
      if (hasBomb) bombsCleared++;
    });

    // 過濾掉被消除的行，留下沒被消除的行
    const newBoard = board.filter((row, index) => !rowsToClear.includes(index));
    
    // 在頂部補齊空行
    while (newBoard.length < ROWS) {
      newBoard.unshift(emptyRow());
    }
    board = newBoard;

    let isPerfectClear = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isWallCol(c)) continue; // Combo Room：牆壁不算殘留物
        if (board[r][c]) { isPerfectClear = false; break; }
      }
      if (!isPerfectClear) break;
    }

    // 呼叫計分系統，只傳入「一般消行」的數量！
    applyScore(rowsToClear.length, tSpin, isPerfectClear);

    // 炸彈追加攻擊！每引爆一顆炸彈，額外送出 1 行垃圾
    if (bombsCleared > 0 && isMultiplayer) {
       if (isAIMode) {
         aiNextGarbage += bombsCleared;
         myLinesSent += bombsCleared;
         const myLinesEl = document.getElementById('my-lines-sent-display');
         if (myLinesEl) myLinesEl.textContent = myLinesSent;
         
         playSound('drop'); shakeMag = 6;
         myFloatingTexts.push(new FloatingText(`BOMB +${bombsCleared}!`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 - 50, '#ff1111', 40));
         oppFloatingTexts.push(new FloatingText(`-${bombsCleared}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 20, '#ff1111', 50));
       } else if (conn && conn.open) {
         conn.send({ type: 'ATTACK', lines: bombsCleared });
         myLinesSent += bombsCleared;
         const myLinesEl = document.getElementById('my-lines-sent-display');
         if (myLinesEl) myLinesEl.textContent = myLinesSent;
         
         playSound('drop'); shakeMag = 6;
         myFloatingTexts.push(new FloatingText(`BOMB +${bombsCleared}!`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 - 50, '#ff1111', 40));
         oppFloatingTexts.push(new FloatingText(`-${bombsCleared}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 20, '#ff1111', 50));
       }
    }

    activeGarbage += nextGarbage;
    nextGarbage = 0;
    clearFx = null;
    spawn();
  }

  function hold() {
    if (!current || gameOver || clearFx || holdUsed || isKOed || isPaused || countdownValue > 0) return;
    const t = current.type;
    if (!holdType) {
      holdType = t;
      spawn(true); // 傳入 true，告訴 spawn 這顆方塊是因為 Hold 而來的，不要觸發 IHS
    } else {
      const swap = holdType;
      holdType = t;
      current = makePiece(swap);
      visualGhostRow = ghostRow();
      visualRow = current.row; // 視覺 Y 對齊
      visualCol = current.col; // 視覺 X 對齊
      lastVisualRow = current.row; // 換牌時重置殘影起點

      // 確保換出來的新方塊擁有完整的 0.5 秒續命時間
      lockTimer = 0;    
      lockResets = 0;

      if (!valid(current.matrix, current.row, current.col)) triggerGameOver(true);
    }
    holdUsed = true;
    renderPanels();
    sendState();
  }

  function processHorizontal(delta) {
    const left = keysDown.has('ArrowLeft');
    const right = keysDown.has('ArrowRight');

    let dir = 0;
    if (left && right) dir = lastDirKey; 
    else if (left) dir = -1;
    else if (right) dir = 1;

    // 如果沒有按下任何方向鍵
    if (dir === 0) {
      activeDir = 0;
      return;
    }

    // 當方向發生改變（包含剛放開反方向鍵，露出原本長按的鍵）
    if (activeDir !== dir) {
      activeDir = dir;
      dasTimer = 0;
      arrTimer = 0;
      tryMove(dir); // 觸發改變方向後的第一步
      return;
    }

    // 方向一致，開始計算 DAS 與極速 ARR
    dasTimer += delta;
    if (dasTimer >= SETTINGS.das) {
      arrTimer += delta;
      while (arrTimer >= SETTINGS.arr) {
        arrTimer -= SETTINGS.arr; 
        
        // 防呆：如果 tryMove 回傳 false (代表撞到牆壁了)，立刻跳出迴圈！
        // 這樣就不會發生「按住方向鍵不放時，系統卡死或重複發送訊號」的問題
        if (!tryMove(dir)) break; 
      }
    }
  }
  

  function processSoftDrop(delta, currentGravity) {
    if (!keysDown.has('ArrowDown') || !current || gameOver || clearFx || isKOed) return;

    // 加上 Math.min 防呆：如果玩家玩到超高難度，自然掉落速度已經比 30ms 還快了，就以關卡極速為主，才不會按了下反而變慢。
    const sdInterval = Math.min(SETTINGS.softDropInterval, currentGravity);
    
    moveCooldown += delta;
    while (moveCooldown >= sdInterval) {
      moveCooldown -= sdInterval;
      if (!softDrop(true)) break;
    }
  }

  // ============================================================
  //  👀 觀戰模式 (SPECTATE MODE) - Phase 1: 單人模式觀戰
  // ============================================================
  const MAX_SPECTATORS = 10;

  // 我作為「被觀戰方 (Host)」維護的資料
  let spectatorConns = new Map();        // peerId -> { conn, username, joinedAt, pingMs }

  // 我作為「觀戰方 (Viewer)」維護的資料
  let isSpectating = false;
  let spectateConn = null;               // 我連到被觀戰方的 PeerJS connection
  let spectateTarget = null;             // { username, peerId }
  let spectateLastFrameAt = 0;
  let spectatePingMs = 0;
  let spectatePingTimer = null;
  let spectateLastPingSent = 0;
  let _spectateHostMode = null;          // 'SINGLE' | 'MULTIPLAYER' | 'AI_BATTLE'
  let _spectateHostUsername = null;
  let _spectateLocalPlayingBackup = null; // 保留進入觀戰前是否正在遊戲，退出後可選擇恢復
  let isSpectatingBattle = false;        // Phase 2: 當前是否在觀戰對戰模式 (會切換成對戰佈局)

  // 防止 spectator 接收 effect 後又把自己 playSound 廣播出去（雖然 observer 不會被觀戰，但保險）
  let _suppressSpectateBroadcast = false;

  // 把我目前的遊戲狀態壓成 frame 物件
  function buildSpectateFrame() {
    let compressedBoard = '';
    if (board) {
      let idx = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          _myBoardBuffer[idx++] = board[r][c] ? board[r][c] : '.';
        }
      }
      compressedBoard = _myBoardBuffer.join('');
    } else {
      compressedBoard = '.'.repeat(ROWS * COLS);
    }

    const frame = {
      b: compressedBoard,
      s: score || 0,
      ln: lines || 0,
      lv: level || 1,
      cb: (typeof combo === 'number') ? combo : -1,
      bb: b2b || 0,
      g: activeGarbage || 0,
      ng: nextGarbage || 0,
      mc: maxCombo || 0,
      pp: piecesPlaced || 0,
      gs: gameStarted ? 1 : 0,
      go: gameOver ? 1 : 0,
      ip: isPaused ? 1 : 0,
      ko: isKOed ? 1 : 0,
      cd: countdownValue || 0,
      c: current ? { t: current.type, r: current.row, c: current.col, rot: current.rot } : null,
      h: holdType || null,
      hu: holdUsed ? 1 : 0,
      q: queue ? queue.slice(0, 6) : [],
      mode: isAIMode ? 'AI_BATTLE' : (isMultiplayer ? 'MULTIPLAYER' : 'SINGLE'),
      hi: highScore || 0,
      vR: (typeof visualRow === 'number') ? visualRow : 0,
      vC: (typeof visualCol === 'number') ? visualCol : 0,
      gR: (typeof visualGhostRow === 'number') ? visualGhostRow : 0,
      mk: (typeof myKOs === 'number') ? myKOs : 0,
      mls: (typeof myLinesSent === 'number') ? myLinesSent : 0,
      mR: matchResult || null
    };
    // Phase 2：對戰模式附加對手資料與分數 / 計時器
    if (isMultiplayer || isAIMode) {
      if (oppState) {
        // 淺拷貝 oppState (含 b / s / g / ng / k / ls / ln / name / lp / uid 等)
        frame.opp = Object.assign({}, oppState);
      }
      frame.mw = myWins || 0;
      frame.ow = oppWins || 0;
      frame.mr = iAmReady ? 1 : 0;
      frame.oR = oppIsReady ? 1 : 0;
      frame.am = isAIMode ? 1 : 0;
      const tmEl = document.getElementById('battle-timer');
      frame.tm = tmEl ? tmEl.textContent : '02:00';
      // Phase 3：AI 模式附帶 AI 設定（給觀戰者唯讀顯示）
      if (isAIMode) {
        frame.aiSp = (typeof aiSpeedMode === 'string') ? aiSpeedMode : 'adaptive';
        frame.aiW = (typeof aiWideMode !== 'undefined') ? String(aiWideMode) : 'auto';
      }
    }
    return frame;
  }

  // Phase 3：frame 廣播節流，避免高頻事件期間壓垮本機主遊戲網路
  let _lastFrameBroadcastAt = 0;
  const SPECTATE_FRAME_MIN_INTERVAL_MS = 30; // 最高約 33 FPS
  function broadcastFrameToSpectators() {
    if (!spectatorConns || spectatorConns.size === 0) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - _lastFrameBroadcastAt < SPECTATE_FRAME_MIN_INTERVAL_MS) return;
    _lastFrameBroadcastAt = now;
    let payload;
    try {
      payload = { type: 'SPECTATE_FRAME', frame: buildSpectateFrame() };
    } catch (e) { return; }
    spectatorConns.forEach((info) => {
      try { if (info.conn && info.conn.open) info.conn.send(payload); }
      catch (e) { /* ignore */ }
    });
  }

  function broadcastEffectToSpectators(effect, params) {
    if (_suppressSpectateBroadcast) return;
    if (!spectatorConns || spectatorConns.size === 0) return;
    const payload = { type: 'SPECTATE_EFFECT', effect: effect, params: params || {} };
    spectatorConns.forEach((info) => {
      try { if (info.conn && info.conn.open) info.conn.send(payload); }
      catch (e) { /* ignore */ }
    });
  }

  // Host 端：攔截 myFloatingTexts.push 與 shake，自動把浮動文字/震動廣播給觀戰者
  (function installFloatingTextBroadcastHook() {
    if (!Array.isArray(myFloatingTexts)) return;
    const origPush = Array.prototype.push;
    myFloatingTexts.push = function(...items) {
      const r = origPush.apply(this, items);
      try {
        if (!_suppressSpectateBroadcast && spectatorConns && spectatorConns.size > 0) {
          for (const ft of items) {
            if (ft && typeof ft.text === 'string') {
              broadcastEffectToSpectators('FLOAT', {
                text: ft.text,
                x: ft.x, y: ft.y,
                color: ft.color,
                size: ft.size
              });
            }
          }
        }
      } catch (e) {}
      return r;
    };
  })();

  // Host 端：在 buildSpectateFrame 前提供一個 helper 廣播螢幕震動
  function broadcastShakeToSpectators(mag) {
    if (_suppressSpectateBroadcast) return;
    if (!spectatorConns || spectatorConns.size === 0) return;
    try { broadcastEffectToSpectators('SHAKE', { mag: mag }); } catch(e) {}
  }

  function broadcastSpectatorListToAll() {
    if (!spectatorConns) return;
    const list = Array.from(spectatorConns.values()).map(s => s.username);
    const payload = { type: 'SPECTATE_LIST', list: list };
    spectatorConns.forEach((info) => {
      try { if (info.conn && info.conn.open) info.conn.send(payload); }
      catch (e) {}
    });
    updateSpectatorBadge();
  }

  function updateSpectatorBadge() {
    const badge = document.getElementById('spectator-badge');
    if (!badge) return;
    const n = spectatorConns ? spectatorConns.size : 0;
    if (n === 0) {
      badge.classList.add('hidden');
      const popup = document.getElementById('spectator-list-popup');
      if (popup) popup.classList.add('hidden');
      return;
    }
    badge.classList.remove('hidden');
    const countEl = document.getElementById('spectator-badge-count');
    if (countEl) countEl.textContent = n;
    const popup = document.getElementById('spectator-list-popup');
    if (popup && !popup.classList.contains('hidden')) renderSpectatorListPopup();
  }

  function renderSpectatorListPopup() {
    const popup = document.getElementById('spectator-list-popup');
    if (!popup) return;
    if (!spectatorConns || spectatorConns.size === 0) {
      popup.innerHTML = '<div style="padding:8px; font-size:11px; color:rgba(255,255,255,0.5);">目前沒有觀戰者</div>';
      return;
    }
    let html = '<div style="padding:6px 8px; font-size:11px; font-weight:900; color:var(--I); border-bottom:1px solid rgba(255,255,255,0.2);">👀 觀戰中 (' + spectatorConns.size + '/' + MAX_SPECTATORS + ')</div>';
    spectatorConns.forEach((info) => {
      html += '<div style="padding:5px 10px; font-size:12px; color:var(--white); border-bottom:1px solid rgba(255,255,255,0.05);">' + info.username + '</div>';
    });
    popup.innerHTML = html;
  }

  // 處理觀戰請求 (host 端，由 setupConnection 的 data handler 呼叫)
  function handleSpectateRequest(connection, fromUsername) {
    if (isPracticeMode) {
      try { connection.send({ type: 'SPECTATE_REJECT', reason: 'PRACTICE' }); } catch(e) {}
      setTimeout(() => { try { connection.close(); } catch(e) {} }, 500);
      return;
    }
    // Phase 2：允許 MULTIPLAYER / AI_BATTLE 觀戰
    if (spectatorConns.size >= MAX_SPECTATORS) {
      try { connection.send({ type: 'SPECTATE_REJECT', reason: 'FULL' }); } catch(e) {}
      setTimeout(() => { try { connection.close(); } catch(e) {} }, 500);
      return;
    }
    spectatorConns.set(connection.peer, {
      conn: connection,
      username: fromUsername || '???',
      joinedAt: Date.now(),
      pingMs: 0
    });
    try {
      connection.send({
        type: 'SPECTATE_ACCEPT',
        hostUsername: currentPlayer,
        mode: isAIMode ? 'AI_BATTLE' : (isMultiplayer ? 'MULTIPLAYER' : 'SINGLE')
      });
      // 立即送一個 frame 讓觀戰端有畫面
      connection.send({ type: 'SPECTATE_FRAME', frame: buildSpectateFrame() });
    } catch(e) {}
    showToast(window.t('spectate.youStarted', '👀 {user} 開始觀戰你！').replace('{user}', fromUsername || window.t('spectate.fallbackUser', '某玩家')), 2500);
    broadcastSpectatorListToAll();
  }

  function removeSpectatorByPeerId(peerId) {
    if (!spectatorConns.has(peerId)) return;
    const info = spectatorConns.get(peerId);
    try {
      if (info.conn && info.conn.open) {
        try { info.conn.close(); } catch(e) {}
      }
    } catch(e) {}
    spectatorConns.delete(peerId);
    broadcastSpectatorListToAll();
  }

  function endAllSpectatorSessions(reason) {
    if (!spectatorConns || spectatorConns.size === 0) return;
    spectatorConns.forEach((info) => {
      try {
        if (info.conn && info.conn.open) info.conn.send({ type: 'SPECTATE_END', reason: reason || 'HOST_LEFT' });
        setTimeout(() => { try { info.conn.close(); } catch(e) {} }, 200);
      } catch(e) {}
    });
    spectatorConns.clear();
    updateSpectatorBadge();
  }

  // ----------------------------------------
  //  作為「觀戰方 (Viewer)」的邏輯
  // ----------------------------------------

  async function startSpectate(targetUsername) {
    if (isSpectating) {
      showToast(window.t('spectate.alreadySpec', '⚠️ 你已經在觀戰其他玩家'));
      return;
    }
    if (isMultiplayer || isAIMode) {
      showToast(window.t('spectate.battleNoSpec', '⚠️ 對戰中無法觀戰'));
      return;
    }
    if (!peer || !isMyPeerReady) {
      showToast(window.t('spectate.notReady', '⚠️ 連線尚未就緒'));
      return;
    }
    if (targetUsername === currentPlayer) {
      showToast(window.t('spectate.cantSelf', '⚠️ 不能觀戰自己'));
      return;
    }
    // 軟提示：若本機正在進行單機遊戲，提醒玩家會中斷
    if (gameStarted && !gameOver) {
      showToast(window.t('spectate.willInterrupt', '⚠️ 進入觀戰將中斷你目前的遊戲'), 2000);
    }
    showToast(window.t('spectate.connecting', '正在連線到 {user}...').replace('{user}', targetUsername), 1500);
    try {
      const snap = await db.collection('users').where('username', '==', targetUsername).get();
      if (snap.empty) {
        showToast(window.t('spectate.notFound', '⚠️ 找不到此玩家'));
        return;
      }
      const targetPeerId = snap.docs[0].data().currentPeerId;
      if (!targetPeerId) {
        showToast(window.t('spectate.userOffline', '⚠️ 此玩家未上線'));
        return;
      }
      const c = peer.connect(targetPeerId, { reliable: true, metadata: { kind: 'spectate' } });
      let opened = false;
      const openTimeout = setTimeout(() => {
        if (!opened) {
          showToast(window.t('spectate.timeout', '⚠️ 連線超時'));
          try { c.close(); } catch(e) {}
        }
      }, 8000);
      c.on('open', () => {
        opened = true;
        clearTimeout(openTimeout);
        try { c.send({ type: 'SPECTATE_REQUEST', from: currentPlayer }); } catch(e) {}
      });
      c.on('data', (data) => handleSpectateData(c, data, targetUsername));
      c.on('close', () => {
        if (isSpectating && spectateConn === c) {
          showToast(window.t('spectate.closed', '👀 觀戰連線已關閉'), 2500);
          exitSpectateMode('CONN_CLOSED');
        }
      });
      c.on('error', (err) => {
        console.log('觀戰連線錯誤:', err);
        if (isSpectating && spectateConn === c) exitSpectateMode('CONN_ERROR');
        else showToast(window.t('spectate.failed', '⚠️ 觀戰連線失敗'));
      });
      spectateConn = c;
      spectateTarget = { username: targetUsername, peerId: targetPeerId };
    } catch (e) {
      console.error(e);
      showToast(window.t('spectate.failedReason', '⚠️ 觀戰失敗：{reason}').replace('{reason}', (e && e.message) ? e.message : window.t('spectate.unknownError', '未知錯誤')));
    }
  }

  function handleSpectateData(connection, data, targetUsername) {
    if (!data || !data.type) return;
    if (data.type === 'SPECTATE_REJECT') {
      const reasons = {
        PRACTICE: window.t('spectate.reasonPractice', '對方在練習模式，無法觀戰'),
        FULL: window.t('spectate.reasonFull', '觀戰人數已滿 ({cur}/{max})').replace('{cur}', MAX_SPECTATORS).replace('{max}', MAX_SPECTATORS),
        BUSY: window.t('spectate.reasonBusy', '對方目前無法被觀戰'),
        PHASE_PENDING: window.t('spectate.reasonPhasePending', '對戰中觀戰功能即將開放')
      };
      showToast('⚠️ ' + (reasons[data.reason] || window.t('spectate.reasonGeneric', '無法觀戰')), 3000);
      try { connection.close(); } catch(e) {}
      spectateConn = null;
      spectateTarget = null;
      return;
    }
    if (data.type === 'SPECTATE_ACCEPT') {
      _spectateHostMode = data.mode || 'SINGLE';
      _spectateHostUsername = data.hostUsername || targetUsername;
      enterSpectateMode();
      return;
    }
    if (data.type === 'SPECTATE_END') {
      const reasons = {
        HOST_LEFT: window.t('spectate.endHostLeft', '對方離開了遊戲'),
        GAME_END: window.t('spectate.endGameEnd', '對方結束了這局'),
        DISCONNECT: window.t('spectate.endDisconnect', '對方斷線了'),
        UNSTABLE: window.t('spectate.endUnstable', '連線不穩，已斷開觀戰'),
        RETURN_LOBBY: window.t('spectate.endReturn', '對方返回了主畫面'),
        ENTERED_BATTLE: window.t('spectate.endEnteredBattle', '對方進入了對戰模式'),
        ENTERED_PRACTICE: window.t('spectate.endEnteredPractice', '對方進入了練習模式')
      };
      showToast('👀 ' + (reasons[data.reason] || window.t('spectate.endGeneric', '觀戰結束')), 3000);
      exitSpectateMode(data.reason || 'END');
      return;
    }
    if (data.type === 'SPECTATE_FRAME') {
      applySpectateFrame(data.frame);
      spectateLastFrameAt = Date.now();
      return;
    }
    if (data.type === 'SPECTATE_EFFECT') {
      applySpectateEffect(data.effect, data.params || {});
      return;
    }
    if (data.type === 'SPECTATE_LIST') {
      // 名單更新：Phase 1 不顯示，Phase 2/3 可在觀戰角落列出其他觀戰者
      return;
    }
    if (data.type === 'SPECTATE_PONG') {
      spectatePingMs = Date.now() - spectateLastPingSent;
      const lat = document.getElementById('spectate-latency');
      if (lat) {
        lat.textContent = '~' + spectatePingMs + 'ms';
        lat.style.color = spectatePingMs < 100 ? 'var(--S)' : (spectatePingMs < 200 ? 'var(--O)' : 'var(--Z)');
      }
      return;
    }
    if (data.type === 'SPECTATE_PING') {
      // 對方在量我的延遲（理論上不會發生，但保險回個 PONG）
      try { connection.send({ type: 'SPECTATE_PONG' }); } catch(e) {}
      return;
    }
  }

  function enterSpectateMode() {
    isSpectating = true;
    if (typeof updateMyActivity === 'function') updateMyActivity('SPECTATING');
    // 暫停我自己的遊戲（不會結算）
    _spectateLocalPlayingBackup = { gameStarted: gameStarted, score: score, highScore: highScore };
    isPaused = false;
    gameStarted = false;
    gameOver = false;
    countdownValue = 0;
    // 觀戰時 MUSIC/SFX 仍是觀戰者自己的，不動 bgm
    // 清空我自己的遊戲狀態，等候 frame 灌入
    if (typeof createBoard === 'function') board = createBoard();
    current = null;
    holdType = null;
    holdUsed = false;
    queue = [];
    score = 0;
    lines = 0;
    level = 1;
    combo = -1;
    b2b = 0;
    activeGarbage = 0;
    nextGarbage = 0;
    matchResult = null;
    if (scoreEl) scoreEl.textContent = '0';
    if (linesEl) linesEl.textContent = '0';
    if (levelEl) levelEl.textContent = '1';

    // 替換名稱顯示：名字置中 + 觀戰中標籤在右側偏移（可點擊查看戰績）
    const myTitleEl = document.getElementById('my-name-display');
    if (myTitleEl) {
      myTitleEl.innerHTML = '<div style="position:relative; display:inline-block; color:var(--I); white-space:nowrap; cursor:pointer;" id="spectate-host-name-link">' +
        (_spectateHostUsername || '???') +
        '<span style="position:absolute; left:calc(100% + 6px); top:50%; transform:translateY(-50%); font-size:11px; color:var(--O); white-space:nowrap; pointer-events:none;">👀觀戰中</span>' +
        '</div>';
      const nameLink = document.getElementById('spectate-host-name-link');
      if (nameLink) {
        nameLink.addEventListener('click', () => {
          if (_spectateHostUsername) openPlayerHistory(_spectateHostUsername);
        });
      }
    }
    // Phase 2：若進入時 host 已在對戰中，直接切換到對戰佈局
    if (_spectateHostMode === 'MULTIPLAYER' || _spectateHostMode === 'AI_BATTLE') {
      enterSpectateBattleLayout();
    }
    // 顯示「離開觀戰」按鈕 + 延遲顯示
    showSpectateOverlayUI();
    // 啟動延遲量測 + 心跳
    if (spectatePingTimer) clearInterval(spectatePingTimer);
    spectatePingTimer = setInterval(() => {
      if (!spectateConn || !spectateConn.open) return;
      spectateLastPingSent = Date.now();
      try { spectateConn.send({ type: 'SPECTATE_PING' }); } catch(e) {}
      // 超過 15 秒沒收到 frame 視為斷線（容忍瀏覽器背景分頁節流）
      if (spectateLastFrameAt && Date.now() - spectateLastFrameAt > 15000) {
        showToast(window.t('spectate.disconnected', '⚠️ 觀戰連線中斷'));
        exitSpectateMode('TIMEOUT');
      }
    }, 2000);
    showToast(window.t('spectate.startWatching', '👀 開始觀戰 {user}').replace('{user}', _spectateHostUsername || window.t('spectate.fallbackPlayer', '玩家')), 2000);
  }

  function exitSpectateMode(reason) {
    if (!isSpectating && !spectateConn) return;
    const wasSpectating = isSpectating;
    isSpectating = false;
    if (spectateConn) {
      const oldConn = spectateConn;
      try {
        if (oldConn.open) oldConn.send({ type: 'SPECTATE_LEAVE' });
      } catch(e) {}
      setTimeout(() => { try { oldConn.close(); } catch(e) {} }, 300);
    }
    spectateConn = null;
    spectateTarget = null;
    _spectateHostMode = null;
    _spectateHostUsername = null;
    if (spectatePingTimer) { clearInterval(spectatePingTimer); spectatePingTimer = null; }
    spectatePingMs = 0;
    spectateLastFrameAt = 0;

    // 還原 UI
    hideSpectateOverlayUI();
    // Phase 2：若處於對戰佈局，先還原單人佈局
    if (isSpectatingBattle) exitSpectateBattleLayout();
    const myTitleEl = document.getElementById('my-name-display');
    if (myTitleEl) myTitleEl.innerHTML = 'You';

    // 清空棋盤回到 PRESS ENTER 畫面
    if (typeof createBoard === 'function') board = createBoard();
    current = null;
    holdType = null;
    holdUsed = false;
    queue = [];
    score = 0;
    lines = 0;
    level = 1;
    combo = -1;
    b2b = 0;
    activeGarbage = 0;
    nextGarbage = 0;
    gameStarted = false;
    gameOver = false;
    isPaused = false;
    countdownValue = 0;
    matchResult = null;
    // 重置對戰計分（KO / 攻擊行數）與 DOM 顯示，避免觀戰結束看到上一場殘值
    myKOs = 0; oppKOs = 0; myLinesSent = 0; oppLinesSent = 0;
    const myKoElExitSpec = document.getElementById('my-ko-display');
    const oppKoElExitSpec = document.getElementById('opp-ko-display');
    const myLinesElExitSpec = document.getElementById('my-lines-sent-display');
    const oppLinesElExitSpec = document.getElementById('opp-lines-sent-display');
    if (myKoElExitSpec) myKoElExitSpec.textContent = '0';
    if (oppKoElExitSpec) oppKoElExitSpec.textContent = '0';
    if (myLinesElExitSpec) myLinesElExitSpec.textContent = '0';
    if (oppLinesElExitSpec) oppLinesElExitSpec.textContent = '0';
    piecePool = []; myPieceIndex = 0;
    if (scoreEl) scoreEl.textContent = '0';
    if (linesEl) linesEl.textContent = '0';
    if (levelEl) levelEl.textContent = '1';
    // 還原 HIGH SCORE 顯示為本機紀錄
    const hsEl = document.getElementById('high-score');
    if (hsEl) hsEl.textContent = highScore || 0;

    // 強制刷新 HOLD / NEXT / QUEUE 側邊面板，清掉觀戰時留下的方塊
    try { if (typeof renderPanels === 'function') renderPanels(); } catch(e) {}

    if (typeof updateMyActivity === 'function') updateMyActivity('IDLE');
    // 重新拉一次線上名單以恢復按鈕狀態
    if (typeof listenToOnlineUsers === 'function') listenToOnlineUsers();
  }

  function applySpectateFrame(f) {
    if (!f) return;
    _suppressSpectateBroadcast = true;
    try {
      // Phase 2：如果 host 模式變了，動態切換觀戰佈局
      if (f.mode && f.mode !== _spectateHostMode) {
        const wasBattle = (_spectateHostMode === 'MULTIPLAYER' || _spectateHostMode === 'AI_BATTLE');
        const isBattle = (f.mode === 'MULTIPLAYER' || f.mode === 'AI_BATTLE');
        if (!wasBattle && isBattle) enterSpectateBattleLayout();
        else if (wasBattle && !isBattle) exitSpectateBattleLayout();
        _spectateHostMode = f.mode;
      }
      if (typeof f.b === 'string' && f.b.length === ROWS * COLS) {
        if (!board) board = createBoard();
        let idx = 0;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const ch = f.b[idx++];
            board[r][c] = (ch === '.') ? null : ch;
          }
        }
      }
      if (f.c && PIECES[f.c.t]) {
        const t = f.c.t, rot = f.c.rot || 0;
        current = {
          type: t,
          matrix: PIECES[t][rot],
          rot: rot,
          row: f.c.r,
          col: f.c.c,
          lowestRow: f.c.r
        };
        visualRow = (typeof f.vR === 'number') ? f.vR : f.c.r;
        visualCol = (typeof f.vC === 'number') ? f.vC : f.c.c;
        visualGhostRow = (typeof f.gR === 'number') ? f.gR : f.c.r;
      } else {
        current = null;
      }
      holdType = f.h || null;
      holdUsed = !!f.hu;
      queue = Array.isArray(f.q) ? f.q.slice() : [];
      score = f.s || 0;
      lines = f.ln || 0;
      level = f.lv || 1;
      combo = (typeof f.cb === 'number') ? f.cb : -1;
      b2b = f.bb || 0;
      activeGarbage = f.g || 0;
      nextGarbage = f.ng || 0;
      gameStarted = !!f.gs;
      gameOver = !!f.go;
      isPaused = !!f.ip;
      isKOed = !!f.ko;
      countdownValue = f.cd || 0;
      const prevMatchResult = matchResult;
      matchResult = f.mR || null;
      // 觀戰中比賽結束時，自動更新正在查看的戰績 modal
      if (matchResult && !prevMatchResult && (matchResult === 'WIN' || matchResult === 'LOSE' || matchResult === 'DRAW')) {
        setTimeout(() => {
          if (_historyViewingPlayer && !historyModal.classList.contains('hidden')) {
            openPlayerHistory(_historyViewingPlayer);
          }
        }, 2000);
      }

      if (scoreEl) scoreEl.textContent = score;
      if (linesEl) linesEl.textContent = lines;
      if (levelEl) levelEl.textContent = level;
      // 觀戰時 HIGH SCORE 顯示對方的紀錄（不寫入本機 highScore 變數，避免汙染）
      const hsEl = document.getElementById('high-score');
      if (hsEl && typeof f.hi === 'number') hsEl.textContent = f.hi;

      // 同步繪製 HOLD / NEXT / QUEUE 側邊面板（renderPanels 正常只在事件時呼叫，觀戰時要強制刷新）
      try { if (typeof renderPanels === 'function') renderPanels(); } catch(e) {}

      // Phase 2：對戰模式同步對手資料、match score、計時器
      if (isSpectatingBattle) {
        if (f.opp) {
          if (!oppState) oppState = {};
          Object.assign(oppState, f.opp);
          try { if (typeof renderOpponentPanels === 'function') renderOpponentPanels(); } catch(e) {}
          // 若對手名稱尚未顯示（仍為 LOADING），嘗試從 frame 中的 opp.name 填入
          if (f.opp.name) {
            // 更新 MATCH SCORE 右側標籤
            const scoreLabelRight = document.getElementById('score-label-right');
            if (scoreLabelRight && (scoreLabelRight.textContent === '...' || scoreLabelRight.textContent === 'OPP')) {
              scoreLabelRight.textContent = f.opp.name.length > 6 ? f.opp.name.slice(0, 6) + '…' : f.opp.name;
              scoreLabelRight.title = f.opp.name;
            }
            const oppTitleEl = document.getElementById('opp-name-display');
            if (oppTitleEl && (oppTitleEl.textContent.includes('LOADING') || oppTitleEl.textContent.includes('OPPONENT'))) {
              const oppLp = f.opp.lp || 0;
              let statsHtml = '';
              if (typeof getRankInfo === 'function') {
                const rankInfo = getRankInfo(oppLp);
                const _rankNameI18n = window.t(rankInfo.nameKey, rankInfo.name);
                statsHtml = '<div style="font-size: 13px; color: ' + rankInfo.color + '; letter-spacing: 0px; text-shadow: none; margin-top: 2px;">' + _rankNameI18n + ' (' + oppLp + ' LP)</div>';
              }
              oppTitleEl.innerHTML = '<div style="position: relative; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; color: var(--Z);">' + f.opp.name + '</div>' + statsHtml;
              oppTitleEl.style.color = '';
              oppTitleEl.style.textShadow = '';
            }
          }
        }
        // 比分
        const myWinsEl = document.getElementById('my-wins-el');
        const oppWinsEl = document.getElementById('opp-wins-el');
        if (myWinsEl && typeof f.mw === 'number') myWinsEl.textContent = f.mw;
        if (oppWinsEl && typeof f.ow === 'number') oppWinsEl.textContent = f.ow;
        // 計時器
        if (typeof f.tm === 'string') {
          const timerEl = document.getElementById('battle-timer');
          if (timerEl) timerEl.textContent = f.tm;
        }
        // 同步我方 KO / LINES SENT 顯示
        if (typeof f.mk === 'number') {
          const myKoEl = document.getElementById('my-ko-display');
          if (myKoEl) myKoEl.textContent = f.mk;
        }
        if (typeof f.mls === 'number') {
          const myLinesEl = document.getElementById('my-lines-sent-display');
          if (myLinesEl) myLinesEl.textContent = f.mls;
        }
        // 對手 KO / LINES SENT
        if (f.opp) {
          const oppKoEl = document.getElementById('opp-ko-display');
          if (oppKoEl && typeof f.opp.k === 'number') oppKoEl.textContent = f.opp.k;
          const oppLinesEl = document.getElementById('opp-lines-sent-display');
          if (oppLinesEl && typeof f.opp.ls === 'number') oppLinesEl.textContent = f.opp.ls;
        }
        // Phase 3：AI 模式同步唯讀 AI 設定顯示
        if (f.am && (typeof f.aiSp === 'string' || typeof f.aiW === 'string')) {
          if (typeof f.aiSp === 'string') {
            document.querySelectorAll('#ai-speed-group .ai-option-btn').forEach(btn => {
              if (btn.dataset.speed === f.aiSp) btn.classList.add('selected-speed');
              else btn.classList.remove('selected-speed');
            });
          }
          if (typeof f.aiW === 'string') {
            document.querySelectorAll('#ai-wide-group .ai-option-btn').forEach(btn => {
              if (btn.dataset.wide === f.aiW) btn.classList.add('selected');
              else btn.classList.remove('selected');
            });
          }
        }
      }
    } finally {
      _suppressSpectateBroadcast = false;
    }
  }

  function applySpectateEffect(effect, params) {
    if (!effect) return;
    params = params || {};
    _suppressSpectateBroadcast = true;
    try {
      // playSound 的 type 直接對應，這層 switch 只處理需要額外視覺效果的
      switch (effect) {
        case 'clear':
        case 'quad':
        case 'tspin':
        case 'perfect':
        case 'drop':
        case 'rotate':
        case 'move':
        case 'win':
        case 'lose':
        case 'undo':
          try { playSound(effect, params.param || 0); } catch(e) {}
          if (effect === 'quad') shakeMag = Math.max(shakeMag, 8);
          else if (effect === 'tspin') shakeMag = Math.max(shakeMag, 5);
          else if (effect === 'clear') shakeMag = Math.max(shakeMag, 2 + (params.param || 1));
          break;
        case 'attack':
          if (typeof FloatingText === 'function')
            myFloatingTexts.push(new FloatingText('+' + (params.lines || 0), (COLS*SIZE)/2, (VISIBLE_ROWS*SIZE)/2 + 40, '#ff0d62', 50));
          break;
        case 'incoming':
          if (typeof FloatingText === 'function')
            myFloatingTexts.push(new FloatingText('-' + (params.lines || 0), (COLS*SIZE)/2, (VISIBLE_ROWS*SIZE)/2 + 20, '#ff1111', 50));
          break;
        case 'ko':
          if (typeof FloatingText === 'function')
            myFloatingTexts.push(new FloatingText('K.O.', (COLS*SIZE)/2, (VISIBLE_ROWS*SIZE)/2, '#ff0d62', 100));
          try { playSound('perfect'); } catch(e) {}
          break;
        case 'topout':
          if (typeof FloatingText === 'function')
            myFloatingTexts.push(new FloatingText('TOP OUT!', (COLS*SIZE)/2, (VISIBLE_ROWS*SIZE)/2, '#ff0d62', 60));
          break;
        case 'msg':
          if (params.text && typeof FloatingText === 'function')
            myFloatingTexts.push(new FloatingText(params.text, (COLS*SIZE)/2, (VISIBLE_ROWS*SIZE)/2 - 20, params.color || '#ffffff', params.size || 36));
          break;
        case 'FLOAT':
          // 由 host 端監聽 myFloatingTexts.push 自動廣播，原樣重建浮動文字
          if (typeof FloatingText === 'function' && params && typeof params.text === 'string') {
            myFloatingTexts.push(new FloatingText(
              params.text,
              (typeof params.x === 'number') ? params.x : (COLS*SIZE)/2,
              (typeof params.y === 'number') ? params.y : (VISIBLE_ROWS*SIZE)/2,
              params.color || '#ffffff',
              params.size || 40
            ));
          }
          break;
        case 'SHAKE':
          shakeMag = Math.max(shakeMag, params.mag || 4);
          break;
        case 'OPP_PROFILE':
          // Phase 2：更新對手名稱框（仿 host 端 PROFILE handler 的 HTML 組裝）
          if (isSpectatingBattle && params && params.profile) {
            const p = params.profile;
            const oppTitleEl = document.getElementById('opp-name-display');
            if (oppTitleEl) {
              const fireIcon = (p.streak && p.streak >= 3) ? '<span style="position: absolute; left: 100%; top: 50%; transform: translateY(-50%); color:#ff8c00; text-shadow:0 0 8px #ff0000; margin-left:4px;">🔥</span>' : '';
              const nameHtml = '<div style="position: relative; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; color: var(--Z);">' + (p.name || 'OPPONENT') + fireIcon + '</div>';
              const oppLp = p.lp || 0;
              let statsHtml = '';
              if (typeof getRankInfo === 'function') {
                const rankInfo = getRankInfo(oppLp);
                const _rankNameI18n = window.t(rankInfo.nameKey, rankInfo.name);
                const winRateText = p.winRate ? window.t('opp.winRatePrefix', ' | 勝率: ') + p.winRate : '';
                statsHtml = '<div style="font-size: 13px; color: ' + rankInfo.color + '; letter-spacing: 0px; text-shadow: none; margin-top: 2px;">' + _rankNameI18n + ' (' + oppLp + ' LP)' + winRateText + '</div>';
              }
              oppTitleEl.innerHTML = nameHtml + statsHtml;
              oppTitleEl.style.color = '';
              oppTitleEl.style.textShadow = '';
            }
            if (!oppState) oppState = {};
            oppState.name = p.name || 'OPPONENT';
            oppState.lp = p.lp || 0;
            // 觀戰模式也替對手遊戲區套上牌位框
            const oppPanelSpec = document.getElementById('opp-panel');
            if (oppPanelSpec && typeof applyRankFrame === 'function' && p.name !== 'Guest') {
              const _oppTier = getRankInfo(oppState.lp);
              applyRankFrame(oppPanelSpec, oppState.lp, window.t(_oppTier.nameKey, _oppTier.name), { bottomText: `${oppState.lp} LP` });
            }
          }
          break;
        default:
          break;
      }
    } finally {
      _suppressSpectateBroadcast = false;
    }
  }

  // Phase 2：進入 / 離開觀戰對戰佈局（只動 DOM，不碰 isMultiplayer 等核心狀態）
  function enterSpectateBattleLayout() {
    if (isSpectatingBattle) return;
    isSpectatingBattle = true;

    const layout = document.getElementById('layout');
    if (layout) layout.classList.add('is-multiplayer');

    // --- 搬移聊天室到 layout（和正常對戰模式一樣的位置）---
    const chatIcon = document.getElementById('chat-icon-wrapper');
    const chatPanel = document.getElementById('chat-panel');
    if (chatIcon && layout) {
      chatIcon.classList.remove('hidden');
      layout.appendChild(chatIcon);
      chatIcon.style.bottom = 'auto';
      chatIcon.style.right = 'auto';
      chatIcon.style.top = '-65px';
      chatIcon.style.left = 'calc(50% - 210px)';
    }
    if (chatPanel && layout) {
      layout.appendChild(chatPanel);
      chatPanel.style.bottom = 'auto';
      chatPanel.style.right = 'auto';
      chatPanel.style.top = '0px';
      chatPanel.style.left = 'calc(50% - 410px)';
    }

    // --- 搬移高幀率按鈕到 layout ---
    const settingsContainer = document.getElementById('settings-container');
    const fpsBtn = document.getElementById('fps-mode-btn');
    // 同 enterMultiplayerMode：手機版 settings-container 留在 drawer，不要搬到 layout
    const isMobileLayoutSpec = window.matchMedia('(max-width: 820px)').matches;
    if (settingsContainer && layout && !isMobileLayoutSpec) {
      layout.appendChild(settingsContainer);
      settingsContainer.style.top = '-60px';
      settingsContainer.style.right = '175px';
      settingsContainer.style.width = '160px';
      if (fpsBtn) {
        fpsBtn.style.width = '160px';
        fpsBtn.style.padding = '10px 0';
        fpsBtn.style.textAlign = 'center';
        fpsBtn.style.fontSize = '14px';
        fpsBtn.style.borderRadius = '25px';
        fpsBtn.style.background = 'transparent';
        fpsBtn.style.backdropFilter = 'blur(4px)';
      }
    }

    const oppPanel = document.getElementById('opp-panel');
    const scorePanel = document.getElementById('singleplayer-ui');
    const vsTimer = document.getElementById('vs-timer');
    if (oppPanel) oppPanel.classList.remove('hidden');
    if (scorePanel) scorePanel.classList.add('hidden');
    if (vsTimer) vsTimer.classList.remove('hidden');
    document.querySelectorAll('.mp-only').forEach(el => el.classList.remove('hidden'));

    // 線上名單隱藏（排行榜保留可見）
    const onlinePanel = document.getElementById('online-panel');
    if (onlinePanel) onlinePanel.classList.add('hidden');

    // MULTIPLAYER 面板裡只留 MATCH SCORE（保留 invite-toast 才能在觀戰中收到邀請）
    const hideIds = ['mp-input-group','mp-ready-group','ai-btn','conn-status','ping-display','emoji-hint-panel'];
    hideIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const myIdLine = document.querySelector('#network-section p');
    if (myIdLine) myIdLine.style.display = 'none';
    const scoreboardEl = document.getElementById('scoreboard');
    if (scoreboardEl) scoreboardEl.style.display = 'block';

    // 觀戰時 MATCH SCORE 標籤替換為玩家名稱
    const scoreLabelLeft = document.getElementById('score-label-left');
    const scoreLabelRight = document.getElementById('score-label-right');
    if (scoreLabelLeft && _spectateHostUsername) {
      scoreLabelLeft.textContent = _spectateHostUsername.length > 6 ? _spectateHostUsername.slice(0, 6) + '…' : _spectateHostUsername;
      scoreLabelLeft.title = _spectateHostUsername;
    }
    if (scoreLabelRight) {
      scoreLabelRight.textContent = '...';
      scoreLabelRight.title = '';
    }

    // 替換 LEAVE ROOM 按鈕為「離開觀戰」功能
    const mpLeaveBtn = document.getElementById('mp-leave-btn');
    if (mpLeaveBtn) {
      mpLeaveBtn._origText = mpLeaveBtn.innerHTML;
      mpLeaveBtn.innerHTML = window.t('spectate.leaveBtn', '✕ 離開觀戰');
      mpLeaveBtn.style.color = '#fff';
      mpLeaveBtn.style.borderColor = 'var(--Z)';
      mpLeaveBtn.style.background = 'rgba(255,13,98,0.7)';
      mpLeaveBtn.classList.remove('hidden');
    }
    // 隱藏自定義的 overlay 離開按鈕（由 mp-leave-btn 取代）
    const spectateLeaveOverlay = document.getElementById('spectate-leave-overlay');
    if (spectateLeaveOverlay) spectateLeaveOverlay.style.display = 'none';

    // 對手名稱預設
    const oppTitleEl = document.getElementById('opp-name-display');
    if (oppTitleEl) {
      if (_spectateHostMode === 'AI_BATTLE') {
        oppTitleEl.innerHTML = '🤖 AI<br><span style="font-size:12px; color:rgba(255,255,255,0.6); letter-spacing:0px;">電腦對手</span>';
        oppTitleEl.style.color = 'var(--T)';
        oppTitleEl.style.textShadow = '0 0 10px var(--T)';
      } else {
        oppTitleEl.innerHTML = 'LOADING...';
        oppTitleEl.style.color = 'rgba(255,255,255,0.5)';
      }
    }

    // AI 對戰觀戰時隱藏排行榜（讓 AI 設定面板有空間），真人對戰保留排行榜
    const leaderboardContainer = document.getElementById('leaderboard-container');
    if (_spectateHostMode === 'AI_BATTLE') {
      if (leaderboardContainer) leaderboardContainer.style.display = 'none';
    }

    // Phase 3：若 host 是 AI_BATTLE，顯示 AI 設定面板為唯讀
    if (_spectateHostMode === 'AI_BATTLE') {
      const aiPanel = document.getElementById('ai-config-panel');
      if (aiPanel) {
        aiPanel.classList.remove('hidden');
        aiPanel.setAttribute('data-spectate-readonly', '1');
        aiPanel.style.pointerEvents = 'none';
        aiPanel.style.opacity = '0.85';
        let watermark = aiPanel.querySelector('.spectate-readonly-mark');
        if (!watermark) {
          watermark = document.createElement('div');
          watermark.className = 'spectate-readonly-mark';
          watermark.style.cssText = 'text-align:center; font-size:11px; color:var(--I); font-weight:900; margin-top:-8px; margin-bottom:6px; letter-spacing:1px;';
          watermark.textContent = window.t('spectate.readOnlySync', '👀 唯讀同步中');
          aiPanel.insertBefore(watermark, aiPanel.firstChild.nextSibling);
        } else {
          watermark.style.display = '';
        }
      }
    }

    setTimeout(() => { if (typeof fitLayout === 'function') fitLayout(); }, 50);
  }

  function exitSpectateBattleLayout() {
    if (!isSpectatingBattle) return;
    isSpectatingBattle = false;

    // 觀戰結束清掉對手遊戲區的牌位框
    const oppPanelSpecExit = document.getElementById('opp-panel');
    if (oppPanelSpecExit && typeof clearRankFrame === 'function') {
      clearRankFrame(oppPanelSpecExit);
    }

    const layout = document.getElementById('layout');
    if (layout) layout.classList.remove('is-multiplayer');

    // --- 搬回聊天室到 viewport ---
    const chatIcon = document.getElementById('chat-icon-wrapper');
    const chatPanel = document.getElementById('chat-panel');
    const viewport = document.getElementById('viewport');
    if (chatIcon && viewport) {
      chatIcon.classList.remove('hidden');
      viewport.appendChild(chatIcon);
      chatIcon.style.top = 'auto';
      chatIcon.style.bottom = '15px';
      chatIcon.style.right = '20px';
      chatIcon.style.left = 'auto';
    }
    if (chatPanel && viewport) {
      viewport.appendChild(chatPanel);
      chatPanel.style.top = 'auto';
      chatPanel.style.bottom = '75px';
      chatPanel.style.right = '20px';
      chatPanel.style.left = 'auto';
    }

    // --- 搬回高幀率按鈕（完全仿 exitMultiplayerMode 的還原寫法）---
    const settingsContainer = document.getElementById('settings-container');
    const fpsBtn = document.getElementById('fps-mode-btn');
    // 同 exitMultiplayerMode：手機版不要搬回 viewport（會觸發 display:none 規則隱藏 ONLINE 框）
    const isMobileLayoutSpecExit = window.matchMedia('(max-width: 820px)').matches;
    if (settingsContainer && viewport && !isMobileLayoutSpecExit) {
      viewport.appendChild(settingsContainer);
      settingsContainer.style.top = '20px';
      settingsContainer.style.right = '20px';
      settingsContainer.style.width = '220px';
      if (fpsBtn) {
        fpsBtn.style.width = '220px';
        fpsBtn.style.padding = '10px';
        fpsBtn.style.textAlign = 'center';
        fpsBtn.style.fontSize = '14px';
        fpsBtn.style.borderRadius = '8px';
        fpsBtn.style.background = 'transparent';
        fpsBtn.style.backdropFilter = 'none';
      }
    }

    const oppPanel = document.getElementById('opp-panel');
    const scorePanel = document.getElementById('singleplayer-ui');
    const vsTimer = document.getElementById('vs-timer');
    if (oppPanel) oppPanel.classList.add('hidden');
    if (scorePanel) scorePanel.classList.remove('hidden');
    if (vsTimer) vsTimer.classList.add('hidden');
    document.querySelectorAll('.mp-only').forEach(el => el.classList.add('hidden'));

    if (currentUserUID) {
      const onlinePanel = document.getElementById('online-panel');
      if (onlinePanel) onlinePanel.classList.remove('hidden');
    }

    // 還原 MULTIPLAYER 面板（mp-input-group 原始是 display:flex，其餘回復預設）
    const mpInputGroup = document.getElementById('mp-input-group');
    if (mpInputGroup) mpInputGroup.style.display = 'flex';
    const showIds = ['ai-btn','conn-status','emoji-hint-panel'];
    showIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    const mpReady = document.getElementById('mp-ready-group');
    if (mpReady) mpReady.style.display = 'none';
    const pingDisplay = document.getElementById('ping-display');
    if (pingDisplay) pingDisplay.style.display = 'none';
    const inviteToast = document.getElementById('invite-toast');
    if (inviteToast) { inviteToast.style.display = ''; inviteToast.classList.add('hidden'); }
    const myIdLine = document.querySelector('#network-section p');
    if (myIdLine) myIdLine.style.display = '';
    const scoreboardEl = document.getElementById('scoreboard');
    if (scoreboardEl) scoreboardEl.style.display = 'none';

    // 還原 MATCH SCORE 標籤
    const scoreLabelLeft = document.getElementById('score-label-left');
    const scoreLabelRight = document.getElementById('score-label-right');
    if (scoreLabelLeft) { scoreLabelLeft.textContent = 'YOU'; scoreLabelLeft.title = ''; }
    if (scoreLabelRight) { scoreLabelRight.textContent = 'OPP'; scoreLabelRight.title = ''; }

    // 還原 LEAVE ROOM 按鈕
    const mpLeaveBtn = document.getElementById('mp-leave-btn');
    if (mpLeaveBtn) {
      mpLeaveBtn.innerHTML = mpLeaveBtn._origText || '🚪 LEAVE ROOM';
      mpLeaveBtn.style.color = '';
      mpLeaveBtn.style.borderColor = '';
      mpLeaveBtn.style.background = '';
      mpLeaveBtn.classList.add('hidden');
    }

    // 還原對手名稱預設
    const oppTitleEl = document.getElementById('opp-name-display');
    if (oppTitleEl) {
      oppTitleEl.innerHTML = 'OPPONENT';
      oppTitleEl.style.color = 'var(--Z)';
      oppTitleEl.style.textShadow = '0 0 10px var(--Z)';
    }
    // 清空對手資料、勝負結果
    oppState = null;
    matchResult = null;

    // 還原排行榜（AI 觀戰會隱藏）
    const leaderboardContainer = document.getElementById('leaderboard-container');
    if (leaderboardContainer) leaderboardContainer.style.display = 'flex';

    // Phase 3：還原 AI 設定面板
    const aiPanel = document.getElementById('ai-config-panel');
    if (aiPanel) {
      aiPanel.classList.add('hidden');
      aiPanel.removeAttribute('data-spectate-readonly');
      aiPanel.style.pointerEvents = '';
      aiPanel.style.opacity = '';
      const watermark = aiPanel.querySelector('.spectate-readonly-mark');
      if (watermark) watermark.style.display = 'none';
    }

    setTimeout(() => { if (typeof fitLayout === 'function') fitLayout(); }, 50);
  }

  function showSpectateOverlayUI() {
    // 把離開觀戰按鈕釘在 .player-section 的右上角（NEXT 方塊的正上方，和 "YOU" 名字齊高）
    const playerSection = document.querySelector('.player-section');
    if (!playerSection) return;
    if (!playerSection.style.position || playerSection.style.position === 'static') {
      playerSection.style.position = 'relative';
    }

    let btn = document.getElementById('spectate-leave-overlay');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'spectate-leave-overlay';
      btn.innerHTML = window.t('spectate.leaveBtn', '✕ 離開觀戰');
      btn.style.cssText = 'position:absolute; top:0px; right:0px; z-index:50; background:rgba(255,13,98,0.88); color:#fff; border:2px solid #fff; border-radius:6px; padding:4px 10px; font-weight:900; font-size:12px; cursor:pointer; box-shadow:0 0 10px rgba(255,13,98,0.6); white-space:nowrap;';
      btn.addEventListener('click', () => exitSpectateMode('USER_LEAVE'));
      playerSection.appendChild(btn);
    }
    btn.style.display = 'block';

    // 延遲顯示放在 HOLD 方塊正上方（.player-section 左上角）
    let lat = document.getElementById('spectate-latency');
    if (!lat) {
      lat = document.createElement('div');
      lat.id = 'spectate-latency';
      lat.style.cssText = 'position:absolute; top:2px; left:0px; z-index:50; background:rgba(0,0,0,0.55); color:var(--S); border:1px solid rgba(255,255,255,0.3); border-radius:4px; padding:3px 8px; font-weight:900; font-size:11px; font-family:monospace;';
      lat.textContent = '~--ms';
      playerSection.appendChild(lat);
    }
    lat.style.display = 'block';
  }

  function hideSpectateOverlayUI() {
    const btn = document.getElementById('spectate-leave-overlay');
    if (btn) btn.style.display = 'none';
    const lat = document.getElementById('spectate-latency');
    if (lat) lat.style.display = 'none';
  }

  const _myBoardBuffer = new Array(400); // 宣告全域快取陣列
  // --- 即時狀態同步發射器 ---
  function sendState() {
    // 即使沒有對手連線，只要有觀戰者就要送 frame
    if ((!conn || !conn.open) && (!spectatorConns || spectatorConns.size === 0)) return;
    // 廣播給所有觀戰者（重用一次 buildSpectateFrame，效率最好）
    if (spectatorConns && spectatorConns.size > 0) {
      try { broadcastFrameToSpectators(); } catch(e) {}
    }
    if (!conn || !conn.open) return;
    try {
      let idx = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          _myBoardBuffer[idx++] = board[r][c] ? board[r][c] : '.';
        }
      }
      let compressedBoard = _myBoardBuffer.join(''); // 效能優化

      conn.send({
        type: 'STATE',
        state: {
          b: compressedBoard,
          s: score,
          g: activeGarbage,
          ng: nextGarbage,
          k: myKOs,
          ls: myLinesSent,
          ln: lines,                // 對戰紀錄用：本局消的總行數
          mc: maxCombo,             // 對戰紀錄用：本局最高 combo
          pp: piecesPlaced,         // 對戰紀錄用：本局放下的方塊數
          lp: myLP || 0,
          isGuest: !currentUserUID,
          c: current ? { t: current.type, r: current.row, c: current.col, rot: current.rot } : null,
          // 把我的 Hold 狀態與預覽陣列 (前 5 顆) 傳給對手
          h: holdType,
          hu: holdUsed,
          q: queue.slice(0, 5) 
        }
      });
    } catch (err) {
      console.error("狀態同步錯誤:", err);
    }
  }

  function update(delta) {
    // 觀戰中：完全不執行本機遊戲邏輯，只靠 frame 灌入 + draw() 渲染
    if (isSpectating) return;

    pollGamepad(); // 🎮 每一幀都檢查一次搖桿狀態

    if (isAIMode) updateAI(delta); // AI 對戰更新

    if (!gameStarted || gameOver || isPaused || isKOed || countdownValue > 0) return;

    // --- 官方重力公式 (分流單機與連線) ---
    let gravityInterval;
    if (isMultiplayer || isNarrowMode || isFreeMode) {
      gravityInterval = 1000; // 對戰 / Combo Room / Free Mode：重力鎖定為極慢 (1秒1格)
    } else {
      const gravitySeconds = Math.pow(0.8 - ((level - 1) * 0.007), level - 1);
      gravityInterval = gravitySeconds * 1000; // 單機模式：越玩越快
    }

    // 自由排版 + 關閉「自然落下」：重力直接跳到永不掉，玩家自己用方向鍵控制
    if (isFreeMode && !freeGravity) {
      gravityInterval = Infinity;
    }

    currentGravityInterval = gravityInterval; // 把值交給渲染引擎

    // --- 執行下落 ---
    if (gravityInterval < 2) { 
      // 【自然達到 20G】當間距小於 2ms，在網頁渲染中視為瞬間到底
      if (current) {
        const gRow = ghostRow();
        if (current.row < gRow) {
          current.row = gRow;           // 瞬間貼地
          current.lowestRow = gRow;     // 更新歷史最低點
          lockTimer = 0;                // 觸發 0.5 秒的 Lock Delay 給玩家續命
          sendState();                  // 瞬間同步給對手
        }
      }
    } else {
      // 【標準自然下落 (1G 以下 ~ 3G)】
      gravityTimer += delta;
      // 官方細節：如果延遲很大，可能會一幀掉落好幾格，用 while 可以確保精準度
      while (gravityTimer >= gravityInterval && current) {
        gravityTimer -= gravityInterval; 
        softDrop(false);
      }
    }

    processHorizontal(delta);
    processSoftDrop(delta, gravityInterval);

    if (clearFx) {
      clearFx.elapsed += delta;
      if (clearFx.elapsed >= clearFx.duration) clearRows(clearFx.rows.slice());
      return;
    }

    // 觸地鎖定延遲計時
    if (current && !valid(current.matrix, current.row + 1, current.col)) {
      lockTimer += delta;
      if (lockTimer >= SETTINGS.lockDelay) {
        lockTimer = 0;
        lockPiece();
      }
    }
  }

  // 只要滑鼠點擊畫面任何地方，解鎖音樂與合成器 (對付瀏覽器限制)
  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    if (!bgmStarted && !isBgmMuted && !isMultiplayer) {
      bgm.play().catch(err => console.log("等待互動解鎖音樂"));
      bgmStarted = true;
    }
  });

  // --- 鍵盤按下事件 (改用 e.code 防呆) ---
  document.addEventListener('keydown', (e) => {
    // 【重要防呆】如果玩家正在「輸入對手 ID」的文字框裡打字，絕對不要攔截按鍵！
    // (這也確保了在輸入框裡的 Ctrl+C/V 絕對有效)
    if (e.target.tagName === 'INPUT') return;

    // 👀 觀戰中按 ESC 直接離開觀戰
    if (isSpectating && (e.code === 'Escape' || e.key === 'Escape')) {
      e.preventDefault();
      exitSpectateMode('USER_LEAVE');
      return;
    }
    // 觀戰中攔截所有遊戲按鍵，避免操作到本機
    if (isSpectating) {
      const blockKeys = ['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','KeyA','KeyX','KeyZ','KeyC','KeyF','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyR','KeyP','Enter','NumpadEnter'];
      if (blockKeys.includes(e.code)) {
        e.preventDefault();
        return;
      }
    }

    // 按下任何按鍵時，強制喚醒合成器
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // 只要按下任何鍵，解鎖音樂
    if (!bgmStarted && !isBgmMuted && !isMultiplayer) {
      bgm.play().catch(err => console.log("等待互動解鎖音樂"));
      bgmStarted = true;
    }

    const k = e.code; 

    // 判斷玩家的 Ctrl+C 到底是「複製」還是「Hold」
    if (e.ctrlKey || e.metaKey) {
      const allowedWithCtrl = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'];
      
      if (k === 'KeyC') {
        // 檢查玩家目前有沒有在網頁上反白選取任何文字
        if (window.getSelection().toString().length > 0) {
          return; // 有反白文字 -> 放行給系統執行「複製」
        }
        // 沒有反白任何文字 -> 玩家正在激烈對戰，判定為遊戲指令「Hold」，不攔截！
      } else if (!allowedWithCtrl.includes(k)) {
        return; // 遇到 Ctrl+V, Ctrl+R, Ctrl+A 等，直接放行給瀏覽器！
      }
    }

    // 阻擋預設行為 (例如按空白鍵或上下鍵時，防止網頁跟著捲動)
    if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','KeyA','KeyX','KeyZ','KeyC','KeyF','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyR','KeyP','Escape','Enter','NumpadEnter'].includes(k)) {
      e.preventDefault();
    }

    // Emoji 嘲諷快捷鍵 (僅限對戰模式；單機模式下 1-4 留給自由排版的數字鍵)
    if (isMultiplayer && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].includes(k)) {
      const now = Date.now();
      if (now - lastEmojiTime < 1000) return;
      lastEmojiTime = now;

      let emoji = '';
      if (k === 'Digit1' || k === 'Numpad1') emoji = '😅';
      if (k === 'Digit2' || k === 'Numpad2') emoji = '😡';
      if (k === 'Digit3' || k === 'Numpad3') emoji = '🥶';
      if (k === 'Digit4' || k === 'Numpad4') emoji = '🤣';

      // 在對手的畫面上噴出 Emoji
      oppFloatingTexts.push(new FloatingText(emoji, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2, '#ffffff', 55));
      playSound('move');

      // 發送給對手
      if (conn && conn.open) conn.send({ type: 'EMOJI', emoji: emoji });
      return;
    }

    // 只要有按鍵操作，就更新最後活動時間
    if (isMultiplayer && gameStarted) {
      lastActionTime = Date.now();
    }

    // === 快速投降 (雙擊 F 鍵) ===
    if (k === 'KeyF') {
      // 只允許在連線對戰中，且遊戲已經開始、還沒結束的情況下使用
      if (isMultiplayer && gameStarted && !gameOver && countdownValue <= 0) {
        const now = Date.now();
        // 判定為雙擊：兩次按鍵間隔小於 400 毫秒
        if (now - lastFPressTime < 400) {
          lastFPressTime = 0; // 成功觸發後歸零，避免連按三下觸發兩次
          
          // 繞過 confirm 視窗，直接執行投降！
          if (conn && conn.open) conn.send({ type: 'SURRENDER' });
          handleSurrender(false); // false 代表是我自己投降
          
        } else {
          // 單點或按太慢，記錄時間並跳出提示
          lastFPressTime = now;
          showToast(window.t('battle.surrenderHint', '⚠️ 確定要投降？請快速連按兩下 F 鍵！'), 2000);
        }
      }
      return; // 執行完就跳出，不再往下判定
    }

    // 音量與靜音控制
    if (k === 'KeyM') {
      isBgmMuted = !isBgmMuted;
      if (!isBgmMuted && masterVolume === 0) {
        masterVolume = 0.5;
        localStorage.setItem('tetrisVolume', masterVolume);
      }
      localStorage.setItem('tetrisBgmMuted', isBgmMuted);
      updateSoundUI();
      if (!isBgmMuted && bgmStarted) {
        if (isMultiplayer && gameStarted && !battleBgm.ended) battleBgm.play().catch(e=>{});
        else if (!isMultiplayer && gameStarted) bgm.play().catch(e=>{});
      }
      return;
    }
    if (k === 'KeyN') {
      isSfxMuted = !isSfxMuted;
      if (!isSfxMuted && masterVolume === 0) {
        masterVolume = 0.5;
        localStorage.setItem('tetrisVolume', masterVolume);
      }
      localStorage.setItem('tetrisSfxMuted', isSfxMuted);
      updateSoundUI();
      playSound('move');
      return;
    }
    if ((k === 'Minus' || k === 'NumpadSubtract') && !e.ctrlKey) {
      masterVolume = Math.max(0, Math.round((masterVolume - 0.1) * 10) / 10);
      localStorage.setItem('tetrisVolume', masterVolume);
      updateSoundUI();
      playSound('move');
      return;
    }
    if ((k === 'Equal' || k === 'NumpadAdd') && !e.ctrlKey) {
      masterVolume = Math.min(1, Math.round((masterVolume + 0.1) * 10) / 10);
      localStorage.setItem('tetrisVolume', masterVolume);
      updateSoundUI();
      playSound('move');
      return;
    }

    if (isPaused && !['KeyP', 'Escape', 'KeyR'].includes(k)) return;
    
    // 全面封殺瀏覽器原生 repeat
    if (e.repeat) return;

    if (k === 'ArrowLeft') {
      keysDown.add(k); lastDirKey = -1; activeDir = -1; dasTimer = 0; arrTimer = 0; tryMove(-1); return;
    }
    if (k === 'ArrowRight') {
      keysDown.add(k); lastDirKey = 1; activeDir = 1; dasTimer = 0; arrTimer = 0; tryMove(1); return;
    }
    if (k === 'ArrowDown') {
      keysDown.add(k); moveCooldown = 0; softDrop(true); return;
    }

    const gameplayKeys = [
      'ArrowLeft','ArrowRight','ArrowDown','ArrowUp',
      'Space','KeyA','KeyX','KeyZ','KeyC',
      'ShiftLeft','ShiftRight','ControlLeft','ControlRight'
    ];

    if ((gameOver || isPaused || clearFx || isKOed || countdownValue > 0) && gameplayKeys.includes(k)) {
      return;
    }

    keysDown.add(k);

    // 自由排版模式：數字鍵 1-7 直接生出指定方塊
    if (isFreeMode && FREE_PIECE_KEYS[k] && gameStarted && !gameOver) {
      e.preventDefault();
      spawnPieceByType(FREE_PIECE_KEYS[k]);
      return;
    }

    // 旋轉與掉落
    if (k === 'ArrowUp' || k === 'KeyX') tryRotate(1);
    else if (k === 'KeyZ' || k === 'ControlLeft' || k === 'ControlRight') tryRotate(-1);
    else if (k === 'Space') hardDrop();
    else if (k === 'KeyC' || k === 'ShiftLeft' || k === 'ShiftRight') hold();
    else if (k === 'KeyA') triggerUndo();
    
    // 遊戲流程控制 (開始、重啟)
    if (k === 'Enter' || k === 'NumpadEnter' || k === 'KeyR') {
      // 多人對戰預覽 / 對戰中：Enter 觸發 READY 切換（不要啟動單人練習）
      if (window.isMpMulti) {
        if (gameStarted && !gameOver) return;
        if (k === 'Enter' || k === 'NumpadEnter') {
          if (readyBtn && !readyBtn.disabled) readyBtn.click();
        }
        return;
      }
      if (!isMultiplayer) {
        if (k === 'KeyR' && gameStarted && !gameOver && !isPracticeMode && !isNarrowMode && !isFreeMode && isCloudDataLoaded && currentUserUID && currentPlayer !== 'Admin_Mars') {
           db.collection('users').doc(currentUserUID).set({
             username: currentPlayer,
             highScore: highScore,
             lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
           }, { merge: true });
        }
        if (!gameStarted || gameOver || k === 'KeyR') startCountdown();
      } else {
        if (gameOver) {
          if (k === 'KeyR') {
            if (conn) conn.close(); 
            startCountdown();              
          } else if (k === 'Enter' || k === 'NumpadEnter') {
            if (readyBtn && !readyBtn.disabled) readyBtn.click();
          }
        } else if (!gameStarted && !iAmReady && countdownValue === 0) {
          if (k === 'Enter' || k === 'NumpadEnter') {
            if (readyBtn && !readyBtn.disabled) readyBtn.click();
          }
        }
      }
      return;
    }
    else if (k === 'KeyP' || k === 'Escape') {
      // gameStarted 必須為 true 才能暫停：READY 準備畫面 (CLICK READY TO START) 按 P 會讓 PAUSED 字樣重疊進來
      if (!gameOver && gameStarted && (!isMultiplayer || isAIMode)) {
        if (!isPaused) {
          // 倒數 3-2-1 期間不允許暫停：如果在初始倒數被中斷，battleTime 的 timerInterval 會來不及建立，導致恢復後計時器永遠不動
          if (countdownValue > 0) return;
          isPaused = true;
          if (countdownInterval) clearInterval(countdownInterval);
          countdownValue = 0;
        } else {
          resumeCountdown();
        }
      }
    }
  });

  // --- 鍵盤鬆開事件 ---
  document.addEventListener('keyup', (e) => {
    const k = e.code;
    keysDown.delete(k); // 確保每次鬆開按鍵都一定會清除紀錄

    if (k === 'ArrowLeft' && lastDirKey === -1) {
      lastDirKey = null;
      if (keysDown.has('ArrowRight')) {
        lastDirKey = 1;
        activeDir = 1;
        dasTimer = 0;
        arrTimer = 0;
      } else {
        activeDir = 0;
      }
    }
    if (k === 'ArrowRight' && lastDirKey === 1) {
      lastDirKey = null;
      if (keysDown.has('ArrowLeft')) {
        lastDirKey = -1;
        activeDir = -1;
        dasTimer = 0;
        arrTimer = 0;
      } else {
        activeDir = 0;
      }
    }
  });

  // 當瀏覽器視窗失去焦點 (例如按 Alt+Tab 或點擊其他視窗)
  // 強制清除所有按鍵紀錄，防止回來時方塊還在向左或向右暴走
  window.addEventListener('blur', () => {
    keysDown.clear();
    lastDirKey = null;
    activeDir = 0;
  });

  // ============================================================
  // 📱 手機版觸控操作
  //   觸控區覆蓋整個 .game-section.player-section（含 HOLD/NEXT/QUEUE 側欄），
  //   座標換算仍以 #game canvas 為基準
  //   水平 swipe = 左右移動 / 上 flick = 硬降 / 下 flick = sonic drop /
  //   tap 左半 = 逆時針旋轉、右半 = 順時針
  //   下方按鈕：HOLD = hold() / UNDO = triggerUndo()
  //   遊戲結束（單人）tap 遊戲場 = 重新開始
  // ============================================================
  (function setupTouchControls() {
    const gameCanvas = document.getElementById('game');
    if (!gameCanvas) return;
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouchDevice) return;

    // 觸控接收層改用 game-section（涵蓋兩側 HOLD/NEXT/QUEUE 欄）
    const touchSurface = document.querySelector('.game-section.player-section') || gameCanvas;

    const holdBtn = document.getElementById('mobile-hold-btn');
    const undoBtn = document.getElementById('mobile-undo-btn');

    const buttonHandler = (fn) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 觀戰時所有手機操作（含 HOLD / UNDO）都應該無效
      if (typeof isSpectating !== 'undefined' && isSpectating) return;
      try { fn(); } catch (err) { console.warn('[touch button]', err); }
    };
    if (holdBtn) {
      holdBtn.addEventListener('click', buttonHandler(() => hold()));
      holdBtn.addEventListener('touchend', buttonHandler(() => hold()), { passive: false });
    }
    if (undoBtn) {
      undoBtn.addEventListener('click', buttonHandler(() => triggerUndo()));
      undoBtn.addEventListener('touchend', buttonHandler(() => triggerUndo()), { passive: false });
    }

    // --- 遊戲場手勢 ---
    let active = false;
    let pointerId = null;
    let startX = 0, startY = 0, startTime = 0;
    let accumulatedDx = 0;
    let cellWidth = 34;
    let didFlick = false;
    let didMove = false;
    const TAP_MAX_MOVE = 14;       // tap 容許輕微抖動
    const TAP_MAX_TIME = 220;      // tap 最長時長 (ms)
    const FLICK_MIN_DY = 55;       // 觸發 flick 的最小垂直距離
    const FLICK_MIN_VY = 0.55;     // 觸發 flick 的最小速度 (px/ms)

    function getCellWidth() {
      const r = gameCanvas.getBoundingClientRect();
      return Math.max(20, r.width / 10);
    }

    // 持續軟降的 timer ID（跟桌機按住「下」一樣的節奏）
    let softDropTimer = null;
    function stopSoftDrop() {
      if (softDropTimer) {
        clearInterval(softDropTimer);
        softDropTimer = null;
      }
    }
    function startSoftDropFlick() {
      // flick 下 → 模擬桌機「按住下方向鍵」的軟降節奏，跑到底為止
      stopSoftDrop();
      const sdInterval = Math.max(20, SETTINGS.softDropInterval || 33);
      // 立刻先掉一格給回饋
      if (!softDrop(true)) return;
      softDropTimer = setInterval(() => {
        if (!current || gameOver || isPaused || isKOed || clearFx || countdownValue > 0) {
          stopSoftDrop();
          return;
        }
        if (!softDrop(true)) {
          stopSoftDrop(); // 已到底，停止
        }
      }, sdInterval);
    }

    function maybeStartCountdown() {
      // 單人模式 gameOver / 還沒開始：tap → 重新開始
      if (typeof startCountdown !== 'function') return false;
      if (typeof isMultiplayer !== 'undefined' && isMultiplayer) return false;
      if ((typeof gameStarted !== 'undefined' && !gameStarted) || (typeof gameOver !== 'undefined' && gameOver)) {
        startCountdown();
        return true;
      }
      return false;
    }

    touchSurface.addEventListener('touchstart', (e) => {
      if (active) return;
      // 觀戰中：把離開觀戰按鈕的觸控放行（不 preventDefault，讓 click 能正常觸發），
      // 其餘觸控全部當沒發生（避免觀戰者影響本機方塊）
      if (typeof isSpectating !== 'undefined' && isSpectating) {
        if (e.target && e.target.closest && e.target.closest('#spectate-leave-overlay')) return;
        e.preventDefault();
        return;
      }
      // 新手勢開始 → 中斷之前還沒跑完的軟降，讓玩家可以即時介入
      stopSoftDrop();
      const t = e.changedTouches[0];
      pointerId = t.identifier;
      active = true;
      startX = t.clientX;
      startY = t.clientY;
      startTime = performance.now();
      accumulatedDx = 0;
      cellWidth = getCellWidth();
      didFlick = false;
      didMove = false;
      e.preventDefault();
    }, { passive: false });

    touchSurface.addEventListener('touchmove', (e) => {
      if (!active) return;
      let t = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === pointerId) { t = e.changedTouches[i]; break; }
      }
      if (!t) return;

      const dxTotal = t.clientX - startX;
      const dyTotal = t.clientY - startY;
      const dt = performance.now() - startTime;

      // flick (一次大動作，鎖死本指後續手勢)
      if (!didFlick && !didMove) {
        const vy = dyTotal / Math.max(dt, 1);
        if (Math.abs(dyTotal) > FLICK_MIN_DY && Math.abs(dyTotal) > Math.abs(dxTotal) * 1.4 && Math.abs(vy) > FLICK_MIN_VY) {
          if (dyTotal < 0) {
            // 上 flick → sonic drop（連續軟降）
            startSoftDropFlick();
          } else {
            // 下 flick → hard drop（瞬間到底鎖定）
            hardDrop();
          }
          didFlick = true;
          e.preventDefault();
          return;
        }
      }

      // 水平 swipe → 累積距離換算成移動次數
      if (!didFlick) {
        const desired = Math.trunc((dxTotal - accumulatedDx) / cellWidth);
        if (desired !== 0) {
          const dir = desired > 0 ? 1 : -1;
          for (let i = 0; i < Math.abs(desired); i++) tryMove(dir);
          accumulatedDx += desired * cellWidth;
          didMove = true;
        }
      }
      e.preventDefault();
    }, { passive: false });

    function endTouch(e) {
      if (!active) return;
      let t = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === pointerId) { t = e.changedTouches[i]; break; }
      }
      if (!t) { active = false; pointerId = null; return; }

      const dxTotal = t.clientX - startX;
      const dyTotal = t.clientY - startY;
      const totalMove = Math.hypot(dxTotal, dyTotal);
      const dt = performance.now() - startTime;

      // tap → 旋轉（左半逆時針 / 右半順時針）；遊戲結束/未開始則改成 startCountdown()
      // 用 #game canvas 中央當基準，touch 在側欄區域也能正確分辨左右
      if (!didFlick && !didMove && totalMove < TAP_MAX_MOVE && dt < TAP_MAX_TIME) {
        if (!maybeStartCountdown()) {
          const rect = gameCanvas.getBoundingClientRect();
          const dir = (startX < rect.left + rect.width / 2) ? -1 : 1;
          tryRotate(dir);
        }
      }

      active = false;
      pointerId = null;
      e.preventDefault();
    }

    touchSurface.addEventListener('touchend', endTouch, { passive: false });
    touchSurface.addEventListener('touchcancel', endTouch, { passive: false });
  })();

  // 自動取消反白：當玩家成功複製文字後，自動清除畫面上的反白選取狀態
  // 徹底解決忘記取消反白導致遊戲中 Ctrl+C (Hold) 失效的隱患
  document.addEventListener('copy', () => {
    // 必須給予 50 毫秒的緩衝，確保作業系統已經先成功把文字複製進剪貼簿，才把反白擦掉
    setTimeout(() => {
      window.getSelection().removeAllRanges();
    }, 50);
  });

  window.addEventListener('resize', fitLayout);

  function initMenu() {
    board = createBoard();
    bag = [];          // 初始化隨機袋，防止崩潰
    queue = [];        // 初始化預覽陣列，防止崩潰
    current = null;    // 清空當前方塊
    holdType = null;   // 清空保留方塊
    gameStarted = false;
    gameOver = false;
    score = 0; lines = 0; level = 1;
    activeGarbage = 0;
    nextGarbage = 0;

    // 徹底清空殘留的粒子與文字特效
    particles.length = 0;
    myFloatingTexts.length = 0;
    oppFloatingTexts.length = 0;
    oppKOTimer = 0; // 把對手的黑畫面計時器歸零

    // --- 直接在本地端瞬間把對手畫面清空 ---
    if (oppState) {
      oppState.b = '.'.repeat(ROWS * COLS); // 產生 400 個 '.' (空點)，瞬間清空對手盤面
      oppState.c = null; // 清空對手正在掉落的方塊
      oppState.g = 0;    // 清空對手的紅色垃圾警告條
      oppState.ng = 0;   // 清空對手的黃色垃圾警告條
    }

    updateHUD();
    renderPanels();    // 確保側邊欄一開始是乾淨的空畫面
    draw();
  }
  
  if (typeof Peer !== 'undefined') initNetwork();
  fitLayout();

  // === AI 設定按鈕邏輯 ===
  // 改 i18n key 對照表，read 時透過 t() 翻譯成當前語系
  const AI_WIDE_HINTS = {
    auto: 'aiHint.auto',
    '1':  'aiHint.1',
    '2':  'aiHint.2',
    '3':  'aiHint.3',
    '4':  'aiHint.4',
  };

  function initAIConfigButtons() {
    // 速度按鈕
    document.querySelectorAll('#ai-speed-group .ai-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#ai-speed-group .ai-option-btn').forEach(b => b.classList.remove('selected-speed'));
        btn.classList.add('selected-speed');
        aiSpeedMode = btn.dataset.speed;
        // --- 切換速度時的「即時反應」機制 ---
        aiThinkTimer = 0; // 直接沒收時間債，防止舊的延遲干擾
        if (aiCurrent) {
           aiCurrent._hesitating = false;
           aiCurrent._hesitateEnd = 0;
        }
        if (isAIMode && aiSpeedMode !== 'adaptive') {
          const speedMap = { rookie: 900, casual: 600, pro: 250, god: 80 };
          currentAiThinkInterval = speedMap[aiSpeedMode] || 600;
        }
      });
    });

    // Wide 按鈕
    const wideHintEl = document.getElementById('ai-wide-hint');
    document.querySelectorAll('#ai-wide-group .ai-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#ai-wide-group .ai-option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        aiWideMode = btn.dataset.wide === 'auto' ? 'auto' : parseInt(btn.dataset.wide);
        if (wideHintEl) wideHintEl.textContent = window.t(AI_WIDE_HINTS[btn.dataset.wide] || '', '');
      });
      // 初始化 hint
      if (btn.classList.contains('selected') && wideHintEl) {
        wideHintEl.textContent = window.t(AI_WIDE_HINTS[btn.dataset.wide] || '', '');
      }
    });
  }
  initAIConfigButtons();

  // === AI 對戰按鈕 ===
  const aiBtn = document.getElementById('ai-btn');
  if (aiBtn) {
    aiBtn.addEventListener('click', () => {
      if (isMultiplayer) return;
      // 防呆：若使用者在單人/練習模式倒數中按了 AI，必須先終止倒數，
      // 否則殘存的 countdownInterval 會在進入 mp 後跑完，導致 spawn() 在 gameStarted=false 狀態啟動，
      // 畫面被「CLICK READY TO START」蓋住、方塊不會自然掉落。
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      countdownValue = 0;

      isAIMode = true;
      isMultiplayer = true;
      conn = null;

      // 切換面板：隱藏排行榜，顯示 AI 設定
      const leaderboardContainer = document.getElementById('leaderboard-container');
      const aiConfigPanel = document.getElementById('ai-config-panel');
      if (leaderboardContainer) leaderboardContainer.style.display = 'none';
      if (aiConfigPanel) aiConfigPanel.classList.remove('hidden');

      enterMultiplayerMode();
      initAI();
      oppIsReady = true;
      aiBtn.classList.add('hidden'); // 進入AI模式後隱藏按鈕
      showToast(window.t('toast.aiReady', '🤖 AI 對手已就緒！可調整設定後按 READY 開始對戰'));
    });
  }

  // --- 玩家身分系統 UI 控制 (結合 Firebase 雲端) ---
  const loginForm = document.getElementById('login-form');
  const loggedInInfo = document.getElementById('logged-in-info');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const usernameInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const displayUsername = document.getElementById('display-username');

  let currentPlayer = null;

  // === 排行榜防呆鎖與啟動函數 ===
  let leaderboardsInitialized = false;

  function initLeaderboards() {
    if (leaderboardsInitialized) return; // 如果已經啟動過，就不要重複執行
    leaderboardsInitialized = true;

    // 全球 Top 3 即時排行榜 (監聽 Firestore 資料變化)
    db.collection('users').orderBy('highScore', 'desc').limit(3).onSnapshot((snapshot) => {
      const listEl = document.getElementById('score-leaderboard-list');
      if (!listEl) return;
      listEl.innerHTML = ''; 
      
      if (snapshot.empty) {
        listEl.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); font-size: 12px; margin-top: 10px;">No records yet</div>';
        return;
      }

      let rank = 1;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.username || data.username === 'undefined' || data.username === 'Admin_Mars') return;

        let color = 'var(--white)';
        if (rank === 1) color = 'var(--O)';       
        else if (rank === 2) color = '#C0C0C0';   
        else if (rank === 3) color = '#CD7F32';   
        
        listEl.innerHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.05); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
            <span style="color: ${color}; font-size: 16px;"><span style="font-size:12px; margin-right:6px; opacity:0.7;">#${rank}</span><span class="lb-name-trigger" data-username="${data.username}" style="cursor:pointer;">${data.username}</span></span>
            <span style="color: var(--S); font-weight: 900; font-size: 16px;">${data.highScore || 0}</span>
          </div>
        `;
        rank++;
      });
    });

    // 全球 TOP 3 積分排行榜 (依據 LP 排序)
    db.collection('users').orderBy('lp', 'desc').orderBy('wins', 'desc').limit(3).onSnapshot((snapshot) => {
      const listEl = document.getElementById('wins-leaderboard-list');
      if (!listEl) return;
      listEl.innerHTML = ''; 
      
      let rank = 1;
      let hasData = false;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.lp === undefined && !data.wins) return; 
        
        if (data.username === 'Admin_Mars') return;

        hasData = true;
        let rankColor = '#CD7F32'; 
        if (rank === 1) rankColor = 'var(--Z)';       
        else if (rank === 2) rankColor = '#C0C0C0';   
        else if (rank === 3) rankColor = '#CD7F32';   
        else rankColor = 'var(--white)';

        const matches = data.matches || 0;
        const wins = data.wins || 0;
        const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
        const winStreak = data.winStreak || 0;

        const fireIcon = winStreak >= 3 ? '<span style="color:#ff8c00; text-shadow:0 0 8px #ff0000; margin-left:4px;" title="3連勝以上！">🔥</span>' : '';

        let lp = data.lp || 0;
        const _badgeTier = getRankInfo(lp);
        const badgeName = window.t(_badgeTier.nameKey, _badgeTier.name);
        const badgeColor = _badgeTier.color;

        listEl.innerHTML += `
          <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(255, 255, 255, 0.05); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: ${rankColor}; font-weight: bold; font-size: 16px;"><span style="font-size:12px; margin-right:4px; opacity:0.7;">#${rank}</span><span class="lb-name-trigger" data-username="${data.username}" style="cursor:pointer;">${data.username}</span>${fireIcon}</span>
              <span style="color: ${badgeColor}; font-weight: 900; text-shadow: 0 0 5px ${badgeColor}; font-size: 16px;">${badgeName} <span style="font-size:11px">(${lp})</span></span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: rgba(255,255,255,0.6);">
              <span>${window.t('leaderboard.winRateLabel', '勝率')}: <span style="color:var(--S); font-weight:bold;">${winRate}%</span></span>
              <span><span style="color:var(--white);">${wins}</span> ${window.t('leaderboard.wins', '勝')} / ${matches} ${window.t('leaderboard.matches', '場')}</span>
            </div>
          </div>
        `;
        rank++;
      });

      if (!hasData) {
        listEl.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); font-size: 12px; margin-top: 10px;">No ranked players yet</div>';
      }
      
    }, (error) => {
      console.error("讀取排行榜失敗:", error);
      const listEl = document.getElementById('wins-leaderboard-list');
      if (listEl) {
        listEl.innerHTML = `<div style="color:var(--Z); font-size:11px; margin-top:10px; line-height:1.4;">
          讀取失敗。請按 F12 開啟開發者 Console，並點擊裡面的 Firebase 連結來建立複合索引。
        </div>`;
      }
    });

    // 全球 TOP 3 AI 殺手排行榜 (專抓 aiProWins)
    db.collection('users').orderBy('aiProWins', 'desc').limit(3).onSnapshot((snapshot) => {
      const listEl = document.getElementById('ai-leaderboard-list');
      if (!listEl) return;
      listEl.innerHTML = ''; 
      
      let hasData = false;
      let rank = 1;
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.username || data.username === 'undefined' || data.username === 'Admin_Mars' || !data.aiProWins) return;

        hasData = true;
        let color = 'var(--white)';
        if (rank === 1) color = 'var(--I)';       
        else if (rank === 2) color = '#C0C0C0';   
        else if (rank === 3) color = '#CD7F32';   
        
        listEl.innerHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.05); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
            <span style="color: ${color}; font-size: 16px;"><span style="font-size:12px; margin-right:6px; opacity:0.7;">#${rank}</span><span class="lb-name-trigger" data-username="${data.username}" style="cursor:pointer;">${data.username}</span></span>
            <span style="color: var(--I); font-weight: 900; text-shadow: 0 0 5px var(--I); font-size: 16px;">${data.aiProWins} 勝</span>
          </div>
        `;
        rank++;
      });

      if (!hasData) {
        listEl.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); font-size: 12px; margin-top: 10px;">No challengers yet</div>';
      }
    });

    // 排行榜名字點擊 = 查看該玩家戰績（事件委派）
    const _lbContainer = document.getElementById('leaderboard-container');
    if (_lbContainer && !_lbContainer.dataset.nameClickBound) {
      _lbContainer.dataset.nameClickBound = '1';
      _lbContainer.addEventListener('click', (e) => {
        const trigger = e.target.closest && e.target.closest('.lb-name-trigger');
        if (!trigger) return;
        const username = trigger.getAttribute('data-username');
        if (username) openPlayerHistory(username);
      });
    }
  }

  // --- 更新個人當前活動狀態的輔助函式 ---
  let lastActiveState = 'IDLE'; // 記住玩家離開前的真正狀態
  let idleTimer = null;
  const IDLE_TIMEOUT = 3 * 60 * 1000; // 3分鐘沒動靜算作閒置

  function updateMyActivity(activityType) {
    // 👀 觀戰生命週期：只有真正切換到「不同模式」時才結束觀戰
    // - IDLE（遊戲結束回到 lobby）：保留，玩家可能馬上再來一局
    // - AWAY（切視窗/閒置）：保留，可能只是短暫離開
    // - PRACTICE / MULTIPLAYER / AI_BATTLE：結束，進入完全不同的模式
    if (typeof spectatorConns !== 'undefined' && spectatorConns && spectatorConns.size > 0) {
      if (activityType === 'PRACTICE') {
        endAllSpectatorSessions('ENTERED_PRACTICE');
      } else if (activityType === 'MULTIPLAYER' || activityType === 'AI_BATTLE') {
        // Phase 1：進入對戰前先結束所有單人觀戰（Phase 2 將加入對戰中觀戰）
        endAllSpectatorSessions('ENTERED_BATTLE');
      }
    }
    if (activityType !== 'AWAY') {
      lastActiveState = activityType; // 只要不是離開，就記住現在到底在幹嘛
    }
    if (typeof currentUserUID !== 'undefined' && currentUserUID && typeof rtdb !== 'undefined') {
      rtdb.ref('/status/' + currentUserUID).update({ activity: activityType }).catch(e => console.warn(e));
    }
  }

  // 喚醒與重置閒置計時器
  function resetIdleStatus() {
    if (typeof currentUserUID !== 'undefined' && currentUserUID && typeof rtdb !== 'undefined') {
      // 讀取當前狀態，如果是 AWAY，代表玩家剛回來，把狀態切回離開前的模樣
      rtdb.ref('/status/' + currentUserUID + '/activity').once('value').then(snap => {
        if (snap.val() === 'AWAY') {
          updateMyActivity(lastActiveState); 
        }
      });
    }

    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // 觸發閒置
      if (typeof currentUserUID !== 'undefined' && currentUserUID) {
         updateMyActivity('AWAY');
      }
    }, IDLE_TIMEOUT);
  }

  // 監聽玩家行為：切換分頁、動滑鼠、按鍵盤
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 玩家切換到別的視窗，立刻標記為離開
      if (typeof currentUserUID !== 'undefined' && currentUserUID) updateMyActivity('AWAY');
    } else {
      // 玩家切回來了
      resetIdleStatus();
    }
  });
  window.addEventListener('mousemove', resetIdleStatus);
  window.addEventListener('keydown', resetIdleStatus);
  // 初始化計時器
  resetIdleStatus();

  // --- 用來管理連線狀態的監聽器 ---
  let presenceRef = null;
  let presenceCallback = null;

  // 處理個別玩家上下線的機制
  function setupPresence(uid, username) {
    // 如果之前有掛載過別的帳號的監聽器，先徹底解綁，防止「幽靈連線」卡死
    if (presenceRef && presenceCallback) {
       presenceRef.off('value', presenceCallback);
    }

    const userStatusDatabaseRef = rtdb.ref('/status/' + uid);
    const isOfflineForDatabase = {
      state: 'offline',
      last_changed: firebase.database.ServerValue.TIMESTAMP,
    };
    const isOnlineForDatabase = {
      state: 'online',
      username: username,
      activity: 'IDLE', // 剛上線時預設為閒置大廳
      last_changed: firebase.database.ServerValue.TIMESTAMP,
    };

    // 重新綁定乾淨的監聽器
    presenceRef = rtdb.ref('.info/connected');
    presenceCallback = presenceRef.on('value', function(snapshot) {
      if (snapshot.val() === false) return;
      userStatusDatabaseRef.onDisconnect().set(isOfflineForDatabase).then(function() {
        userStatusDatabaseRef.set(isOnlineForDatabase);
      });
    });
  }

  // 監聽所有人狀態並更新畫面的機制
  function listenToOnlineUsers() {
    const listEl = document.getElementById('online-users-list');
    const countEl = document.getElementById('online-count');
    if (!listEl || !countEl) return;

    rtdb.ref('/status/').orderByChild('state').equalTo('online').on('value', (snapshot) => {
      let users = []; 
      let validCount = 0;

      let myData = null;
      let others = [];

      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        if (data.username && data.username !== 'undefined' && data.username.trim() !== '' && data.username !== 'Admin_Mars') {
          if (data.username === currentPlayer) {
             myData = data; // 抓出自己
          } else {
             others.push(data); // 抓出其他人
          }
        }
      });

      // 將過濾好的其他玩家名字，存到全域變數給聊天選單用
      if (typeof globalOnlineUsersList !== 'undefined') {
        globalOnlineUsersList = others.map(u => u.username);
      }

      // 👀 觀戰方：被觀戰的 host 離線就自動退出觀戰
      if (isSpectating && spectateTarget && spectateTarget.username) {
        const stillOnline = (myData && myData.username === spectateTarget.username)
          || others.some(u => u.username === spectateTarget.username);
        if (!stillOnline) {
          showToast(window.t('spectate.hostOffline', '👀 對方已離線，觀戰結束'), 2500);
          exitSpectateMode('HOST_OFFLINE');
        }
      }

      // 確保自己永遠排在陣列第一個
      if (myData) {
        users.push(myData);
        validCount++;
      } else if (currentPlayer) {
        users.push({ username: currentPlayer, activity: 'IDLE' });
        validCount++;
      }

      others.forEach(data => {
        users.push(data);
        validCount++;
      });

      countEl.textContent = validCount;
      if (validCount === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); font-size: 12px;">No one is online</div>';
        return;
      }

      let validUsersHTML = '';
      
      users.forEach((data) => {
        const username = data.username;
        let actStr = data.activity || 'IDLE';

        // 狀態視覺化解析
        let activityText = window.t('online.idle', '大廳閒置');
        let activityColor = '#a8a8a8';
        let dotColor = 'var(--S)'; // 預設綠色點點

        if (actStr === 'SINGLE') { activityText = window.t('online.single', '單機闖關中'); activityColor = 'var(--O)'; dotColor = 'var(--O)'; }
        else if (actStr === 'PRACTICE') { activityText = window.t('online.practice', '深山修行中'); activityColor = 'var(--S)'; dotColor = 'var(--S)'; }
        else if (actStr === 'AI_BATTLE') { activityText = window.t('online.aiBattle', '與 AI 激戰中'); activityColor = 'var(--T)'; dotColor = 'var(--T)'; }
        else if (actStr === 'MULTIPLAYER') { activityText = window.t('online.multiplayer', '雙人對戰中'); activityColor = 'var(--Z)'; dotColor = 'var(--Z)'; }
        else if (actStr === 'MP_ROOM') { activityText = window.t('online.mpRoom', '多人房間中'); activityColor = 'var(--I)'; dotColor = 'var(--I)'; }
        else if (actStr === 'SPECTATING') { activityText = window.t('online.spectating', '👀 觀戰中'); activityColor = 'var(--I)'; dotColor = 'var(--I)'; }
        // 離開與閒置狀態
        else if (actStr === 'AWAY') { activityText = window.t('online.away', '離開 (閒置中)'); activityColor = '#888888'; dotColor = '#888888'; }

        let inviteButtonHTML = '';
        let spectateButtonHTML = ''; // 👀 觀戰專屬按鈕（取代原本的聊天 💬 快捷鍵）

        if (username !== currentPlayer) {
           let btnText = 'INVITE';
           let btnDisabled = '';
           let btnBg = 'var(--I)';
           let btnCursor = 'pointer';

           // 對方是否跟我在同一個多人房間裡（按名字比對 mpPlayersMap，避免他切視窗變 AWAY 也能被誤邀請）
           const sameMpRoom = !!(window.isMpMulti && (function() {
             try {
               for (const v of mpPlayersMap.values()) {
                 if (v && v.name === username) return true;
               }
             } catch {}
             return false;
           })());

           if (!isMyPeerReady) {
               btnText = 'WAIT...';
               btnDisabled = 'disabled';
               btnBg = '#666666';
               btnCursor = 'not-allowed';
           } else if (sameMpRoom) {
               // 已經在同一個多人對戰房間 → 顯示 IN ROOM，鎖住邀請按鈕
               btnText = 'IN ROOM';
               btnDisabled = 'disabled';
               btnBg = '#666666';
               btnCursor = 'not-allowed';
           } else if (actStr === 'MULTIPLAYER' || actStr === 'MP_ROOM' || actStr === 'AI_BATTLE') {
               // 對方已在房間中（1v1 / 多人 / AI），不能邀請；等他離開房間才解鎖
               btnText = 'BUSY';
               btnDisabled = 'disabled';
               btnBg = '#666666';
               btnCursor = 'not-allowed';
           }

           inviteButtonHTML = `<button class="quick-invite-btn" data-username="${username}" style="background:${btnBg}; color:var(--bg); border:1px solid var(--white); border-radius:4px; font-weight:bold; cursor:${btnCursor}; font-size:10px; padding:3px 8px;" ${btnDisabled}>${btnText}</button>`;
           // 產生 👀 觀戰按鈕
           let spectateDisabled = false;
           let spectateTitle = window.t('spectate.btnTitle.normal', '觀戰此玩家');
           let spectateColor = 'var(--I)';
           let spectateCursor = 'pointer';
           if (actStr === 'PRACTICE') {
             spectateDisabled = true; spectateTitle = window.t('spectate.btnTitle.practice', '練習模式不可觀戰'); spectateColor = 'rgba(255,255,255,0.25)'; spectateCursor = 'not-allowed';
           } else if (actStr === 'SPECTATING') {
             spectateDisabled = true; spectateTitle = window.t('spectate.btnTitle.spectating', '對方正在觀戰，無法被觀戰'); spectateColor = 'rgba(255,255,255,0.25)'; spectateCursor = 'not-allowed';
           } else if (isSpectating) {
             spectateDisabled = true; spectateTitle = window.t('spectate.btnTitle.alreadySpec', '你已在觀戰其他玩家'); spectateColor = 'rgba(255,255,255,0.25)'; spectateCursor = 'not-allowed';
           } else if (isMultiplayer || isAIMode) {
             spectateDisabled = true; spectateTitle = window.t('spectate.btnTitle.battle', '對戰中無法觀戰'); spectateColor = 'rgba(255,255,255,0.25)'; spectateCursor = 'not-allowed';
           } else if (!isMyPeerReady) {
             spectateDisabled = true; spectateTitle = window.t('spectate.btnTitle.notReady', '連線尚未就緒'); spectateColor = 'rgba(255,255,255,0.25)'; spectateCursor = 'not-allowed';
           }
           spectateButtonHTML = `<button class="spectate-trigger" data-username="${username}" data-disabled="${spectateDisabled ? '1' : '0'}" style="background:transparent; border:none; color:${spectateColor}; font-size:14px; cursor:${spectateCursor}; padding:0; display:flex; align-items:center; justify-content:center;" title="${spectateTitle}">👀</button>`;
        } else {
          inviteButtonHTML = `<span style="font-size:10px; color:rgba(255,255,255,0.5); font-weight:bold;">(YOU)</span>`;
          spectateButtonHTML = `<button style="visibility:hidden; padding:0; border:none; font-size:14px; display:flex; align-items:center; justify-content:center;">👀</button>`;
        }

        const unreadBadge = (typeof unreadUsers !== 'undefined' && unreadUsers.has(username)) ? '<span style="color:var(--Z); margin-left:5px; font-size:10px; animation: flash 1s infinite;">● NEW</span>' : '';

        validUsersHTML += `
            <div class="online-user-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; width: 100%;">
              <div style="display:flex; align-items:flex-start; gap:8px;">
                 <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                   <div class="online-dot" style="background-color:${dotColor}; box-shadow: 0 0 5px ${dotColor}; flex-shrink: 0;"></div>
                   ${spectateButtonHTML}
                 </div>
                 <div style="display:flex; flex-direction:column; gap:4px;">
                   <div style="display:flex; align-items:center;">
                     <span class="chat-trigger" data-username="${username}" style="color: var(--white); font-size: 15px; font-weight: bold; cursor: pointer; transition: color 0.2s;">${username}</span>
                     ${unreadBadge}
                   </div>
                   <span style="font-size:11px; color:${activityColor}; margin-top:-2px;">${activityText}</span>
                 </div>
              </div>
              <div style="display:flex; align-items:center;">
                 ${inviteButtonHTML}
              </div>
            </div>
          `;
      });

      listEl.innerHTML = validUsersHTML;
    });
  }

  // ==========================================
  // 💬 獨立 P2P 私訊系統核心邏輯
  // ==========================================
  let chatHistory = {};       
  let chatConnections = {};   
  let activeChatUser = null;  
  let activeChatPeerId = null;
  let globalOnlineUsersList = []; // 隨時記住全服在線玩家名單
  let unreadUsers = new Set(); // 儲存有未讀訊息的玩家名稱

  // --- 聊天室下拉選單邏輯 ---
  const chatTitleName = document.getElementById('chat-title-name');
  const chatDropdown = document.getElementById('chat-user-dropdown');

  chatTitleName.addEventListener('click', (e) => {
      e.stopPropagation(); // 防止點擊事件往上傳遞直接被關掉
      if (chatDropdown.classList.contains('hidden')) {
          chatDropdown.innerHTML = '';
          
          if (typeof globalOnlineUsersList === 'undefined' || globalOnlineUsersList.length === 0) {
              chatDropdown.innerHTML = '<div style="padding: 10px; font-size: 12px; color: gray; text-align: center;">無其他玩家在線</div>';
          } else {
              globalOnlineUsersList.forEach(username => {
                  const div = document.createElement('div');
                  div.textContent = username;
                  div.style.padding = '8px 12px';
                  div.style.cursor = 'pointer';
                  div.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                  div.style.color = 'var(--white)';
                  div.style.transition = 'background 0.2s';
                  
                  // 如果這個人有傳訊息給你（未讀），名字旁邊加個小紅點
                  if (unreadUsers.has(username)) {
                      div.innerHTML += ' <span style="color:var(--Z); font-size:10px; margin-left:4px;">●</span>';
                  }
                  
                  div.onmouseenter = () => div.style.background = 'rgba(56,189,238,0.2)';
                  div.onmouseleave = () => div.style.background = 'transparent';
                  div.onclick = () => {
                      chatDropdown.classList.add('hidden');
                      openChat(username); // 點擊後直接切換聊天頻道
                  };
                  chatDropdown.appendChild(div);
              });
          }
          chatDropdown.classList.remove('hidden');
      } else {
          chatDropdown.classList.add('hidden');
      }
  });

  // 點擊畫面其他地方時，自動收起下拉選單
  document.addEventListener('click', (e) => {
      if (chatDropdown && !chatDropdown.contains(e.target) && e.target !== chatTitleName) {
          chatDropdown.classList.add('hidden');
      }
  });

  // 更新右下角聊天圖示的紅點
  function updateChatBadge() {
      const badge = document.getElementById('chat-badge');
      const toggleBtn = document.getElementById('chat-toggle-btn');
      if (unreadUsers.size > 0) {
          badge.classList.remove('hidden');
          toggleBtn.style.animation = 'pulse 1.5s infinite';
      } else {
          badge.classList.add('hidden');
          toggleBtn.style.animation = 'none';
      }
      // 強制刷新名單以顯示/隱藏 ● NEW
      listenToOnlineUsers();
  }

  function openChat(username) {
     if (username === currentPlayer || !username) return; 
     activeChatUser = username;
     
     // 保留下拉選單的箭頭，讓玩家知道隨時可以再換人
     document.getElementById('chat-title-name').textContent = username + ' ▼';
     document.getElementById('chat-panel').classList.remove('hidden');
     
     unreadUsers.delete(username);
     updateChatBadge();
     
     renderChatHistory(username);
     
     db.collection('users').where('username', '==', username).get().then(snap => {
         if (!snap.empty) {
             activeChatPeerId = snap.docs[0].data().currentPeerId || snap.docs[0].id;
         }
     });

     // 打開聊天室後，自動把鍵盤游標對焦到輸入框
     const inputEl = document.getElementById('chat-input');
     if (inputEl) inputEl.focus();
  }

  document.getElementById('close-chat-btn').addEventListener('click', () => {
     // 只關面板、保留 activeChatUser/activeChatPeerId，下次打開時可以直接繼續和同一個人聊天
     document.getElementById('chat-panel').classList.add('hidden');
  });

  // 點擊右下角圖示：如果已經開著就關掉，如果關著就打開(預設繼續上次聊天對象，或找第一個密你的人，否則空開)
  document.getElementById('chat-icon-wrapper').addEventListener('click', () => {
      const panel = document.getElementById('chat-panel');
      if (panel.classList.contains('hidden')) {
          let target = activeChatUser;
          if (!target && unreadUsers.size > 0) target = Array.from(unreadUsers)[0];
          if (target) openChat(target);
          else {
              panel.classList.remove('hidden'); // 空開
              // 空開時標題維持「未選擇」狀態，和 activeChatUser=null 同步，避免送出時跳「請先選對象」
              document.getElementById('chat-title-name').textContent = 'Player ▼';
          }
      } else {
          panel.classList.add('hidden'); // 保留 activeChatUser，讓下次打開可以無縫接續
      }
  });

  function renderChatHistory(username) {
      const box = document.getElementById('chat-messages');
      box.innerHTML = '';
      const history = chatHistory[username] || [];
      
      // 在對話最上方加上今天的日期
      const todayStr = new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' });
      box.innerHTML += `<div style="text-align:center; font-size:11px; color:rgba(255,255,255,0.4); margin-bottom:12px; font-weight:bold;">----- ${todayStr} -----</div>`;

      history.forEach(msg => {
          const isMe = msg.from === currentPlayer;
          const align = isMe ? 'flex-end' : 'flex-start';
          const bg = isMe ? 'var(--I)' : 'rgba(255,255,255,0.1)';
          const color = isMe ? 'var(--bg)' : 'var(--white)';
          const radius = isMe ? '12px 12px 0 12px' : '12px 12px 12px 0';
          
          // 解析時間戳記為 hh:mm 格式
          const timeStr = msg.time ? new Date(msg.time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute:'2-digit', hour12: false }) : '';
          
          box.innerHTML += `
            <div style="display:flex; flex-direction:column; align-items:${align}; margin-bottom: 10px;">
              <div style="background:${bg}; color:${color}; padding:8px 12px; border-radius:${radius}; font-size:13px; max-width:85%; word-break:break-all; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                  ${msg.text}
              </div>
              <div style="font-size:10px; color:rgba(255,255,255,0.4); margin-top:4px;">${timeStr}</div>
            </div>`;
      });
      box.scrollTop = box.scrollHeight;
  }

  function setupChatConnection(connection) {
      connection.on('data', (data) => {
          if (data.type === 'CHAT_MSG') {
              const sender = data.from;
              if (!chatHistory[sender]) chatHistory[sender] = [];
              // 接收並存入對方發送的時間
              chatHistory[sender].push({ from: sender, text: data.text, time: data.time || Date.now() });
              
              if (activeChatUser !== sender || document.getElementById('chat-panel').classList.contains('hidden')) {
                  unreadUsers.add(sender); 
                  updateChatBadge();        
                  playSound('move');
                  showToast(window.t('chat.newMessage', '💬 {sender} 傳送了一則新訊息').replace('{sender}', sender), 3000);
              }
              
              if (activeChatUser === sender && !document.getElementById('chat-panel').classList.contains('hidden')) {
                  renderChatHistory(sender);
              }
          }
      });
      chatConnections[connection.peer] = connection;
  }

  async function sendChatMessage() {
      const inputEl = document.getElementById('chat-input');
      const text = inputEl.value.trim();
      
      // 沒打字就按送出：直接忽略
      if (!text) return; 
      
      // 沒選擇對象就按送出：跳出明確的警告提示，而不是默默沒反應
      if (!activeChatUser) {
          showToast(window.t('chat.pickPlayer', '⚠️ 請先點擊對話框左上角「Player ▼」選擇聊天對象！'));
          return;
      }
      
      if (!activeChatPeerId) {
          showToast(window.t('chat.fetchingPlayer', '⚠️ 正在取得玩家連線資訊，請稍後重試'));
          return;
      }

      const now = Date.now(); 

      if (!chatHistory[activeChatUser]) chatHistory[activeChatUser] = [];
      chatHistory[activeChatUser].push({ from: currentPlayer, text: text, time: now });
      renderChatHistory(activeChatUser);
      inputEl.value = '';

      let conn = chatConnections[activeChatPeerId];
      if (conn && conn.open) {
          conn.send({ type: 'CHAT_MSG', text: text, from: currentPlayer, time: now });
      } else {
          conn = peer.connect(activeChatPeerId, { metadata: { purpose: 'chat' } });
          setupChatConnection(conn);
          conn.on('open', () => {
              conn.send({ type: 'CHAT_MSG', text: text, from: currentPlayer, time: now });
          });
      }
  }

  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
  });

  // 👀 安全的周期性 frame 廣播：保證即使 host 處於 lobby 或無新事件時，觀戰端也能保持同步
  setInterval(() => {
    if (spectatorConns && spectatorConns.size > 0 && !isSpectating) {
      try { broadcastFrameToSpectators(); } catch(e) {}
    }
  }, 250);

  // 觀戰人數徽章：點擊切換名單 popup
  (function bindSpectatorBadge() {
    const badge = document.getElementById('spectator-badge');
    const popup = document.getElementById('spectator-list-popup');
    if (badge && popup) {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popup.classList.contains('hidden')) {
          renderSpectatorListPopup();
          popup.classList.remove('hidden');
        } else {
          popup.classList.add('hidden');
        }
      });
      document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && e.target !== badge) {
          popup.classList.add('hidden');
        }
      });
    }
  })();

  // 綁定點擊名字：單擊=查看戰績，雙擊=聊天 (利用事件委派)
  let _onlineClickTimer = null;
  document.getElementById('online-users-list').addEventListener('click', (e) => {
      // 觀戰按鈕（事件冒泡：先檢查 spectate-trigger，避免被當成 chat-trigger 處理）
      const spectateBtn = e.target.closest && e.target.closest('.spectate-trigger');
      if (spectateBtn) {
          e.stopPropagation();
          if (spectateBtn.getAttribute('data-disabled') === '1') {
              const t = spectateBtn.getAttribute('title') || window.t('spectate.toastNoSpec', '無法觀戰');
              showToast('⚠️ ' + t);
              return;
          }
          const username = spectateBtn.getAttribute('data-username');
          if (username) startSpectate(username);
          return;
      }
      // 單擊名字 = 查看戰績（延遲判斷，避免與雙擊衝突）
      if (e.target.classList && e.target.classList.contains('chat-trigger')) {
          const username = e.target.getAttribute('data-username');
          if (_onlineClickTimer) { clearTimeout(_onlineClickTimer); _onlineClickTimer = null; }
          _onlineClickTimer = setTimeout(() => {
              _onlineClickTimer = null;
              if (username) openPlayerHistory(username);
          }, 250);
      }
  });
  // 雙擊名字 = 開啟聊天
  document.getElementById('online-users-list').addEventListener('dblclick', (e) => {
      if (e.target.classList && e.target.classList.contains('chat-trigger')) {
          if (_onlineClickTimer) { clearTimeout(_onlineClickTimer); _onlineClickTimer = null; }
          const username = e.target.getAttribute('data-username');
          if (username) openChat(username);
      }
  });

  // 網頁載入時直接啟動監聽器
  listenToOnlineUsers();

  document.getElementById('online-users-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('quick-invite-btn')) {
      const btn = e.target;
      
      // --- 防呆攔截！如果按鈕已經被 disabled，直接中斷，不執行後續連線 ---
      if (btn.disabled) return;

      // 如果畫面上已經有別人的邀請，但我選擇主動去邀請別人 -> 自動拒絕舊邀請
          if (pendingConn && pendingConn.open) {
            const rejected = pendingConn;
            rejected.send({ type: 'INVITE_REJECT' });
            setTimeout(() => { try { rejected.close(); } catch(e){} }, 500);
            pendingConn = null;
            const toast = document.getElementById('invite-toast');
            if (toast) {
               toast.classList.add('hidden');
               toast.classList.remove('show-invite');
            }
          }
      // 3 秒內不能連續狂按，但可以一直發送給不同人，或重發給同一人
      if (myInviteCD) {
        showToast(window.t('toast.inviteRateLimit', '⏳ 邀請發送太頻繁，請等 3 秒...'));
        return;
      }
      myInviteCD = true;
      setTimeout(() => myInviteCD = false, 3000);

      const targetName = btn.getAttribute('data-username');
      const oppInput = document.getElementById('opp-id-input');
      const connectBtn = document.getElementById('connect-btn');
      
      if (oppInput && connectBtn) {
        oppInput.value = targetName;
        connectBtn.click(); // 自動觸發連線按鈕

        // --- 變更按鈕為不可點擊狀態 ---
        const originalText = btn.textContent;
        const originalBg = btn.style.background;
        
        btn.textContent = 'SENT';
        btn.style.background = '#666666'; // 變成灰色，視覺上更像「已停用」
        btn.style.color = 'var(--white)';
        btn.style.cursor = 'not-allowed'; // 讓滑鼠游標變成「禁止」符號 🚫
        btn.disabled = true;              // 標記為停用

        // 3 秒後恢復原狀
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = originalBg;
          btn.style.color = 'var(--bg)';
          btn.style.cursor = 'pointer';   // 恢復可點擊的游標 👆
          btn.disabled = false;
        }, 3000);
      }
    }
  });

  // 修改密碼
  const changePwdBtn = document.getElementById('change-pwd-btn');
  if (changePwdBtn) {
    changePwdBtn.addEventListener('click', () => {
      const user = firebase.auth().currentUser;
      if (!user) return;
      
      const newPwd = prompt(window.t('pwd.promptNewPwd', '請輸入新密碼 (至少 6 位數)：'));
      if (newPwd && newPwd.length >= 6) {
        user.updatePassword(newPwd).then(() => {
          alert(window.t('pwd.changeSuccess', '密碼修改成功！下次請使用新密碼登入。'));
          localStorage.setItem('tetris_saved_pass', newPwd); // 更新本機儲存
        }).catch(err => {
          alert(window.t('pwd.changeFailed', '修改失敗：{err}\n(為了安全性，您可能需要登出再重新登入一次才能修改密碼)').replace('{err}', err.message));
        });
      } else if (newPwd) {
        alert(window.t('pwd.tooShort', '密碼長度必須至少 6 個字元！'));
      }
    });
  }

  // 1. 玩家手動登入/註冊
  loginBtn.addEventListener('click', () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) { alert(window.t('login.emptyFields', '請輸入名稱與密碼！')); return; }
    
    // 將輸入的帳號密碼存入瀏覽器，下次打開自動填寫
    localStorage.setItem('tetris_saved_user', user);
    localStorage.setItem('tetris_saved_pass', pass);

    loginBtn.textContent = 'CONNECTING...';
    const email = user.toLowerCase() + '@tetris.com'; 

    auth.signInWithEmailAndPassword(email, pass)
      .then((userCredential) => {
        // 登入成功：完全不理會雲端大小寫，直接使用你剛剛輸入的 user 變數！
        handleLoginSuccess(user, userCredential.user.uid);
      })
      .catch((error) => {
        auth.createUserWithEmailAndPassword(email, pass)
          .then((userCredential) => {
            showToast(window.t('login.registerSuccess').replace('{user}', user));
            // GoatCounter：新註冊成功事件
            if (window.goatcounter && window.goatcounter.count) {
              window.goatcounter.count({ path: 'register-success', title: 'New registration', event: true });
            }
            handleLoginSuccess(user, userCredential.user.uid);
          })
          .catch((regError) => {
            if (regError.code === 'auth/email-already-in-use') alert(window.t('login.passwordOrTaken', '密碼錯誤！或者這個名稱被別人用囉。'));
            else alert(window.t('login.errorPrefix', '發生錯誤：') + regError.message);
            loginBtn.textContent = 'Login / Register';
          });
      });
  });

  // 網頁載入時：自動填寫
  window.addEventListener('DOMContentLoaded', () => {

    // 不管有沒有登入，立刻去抓排行榜
    initLeaderboards();
    // 把上次儲存的帳號密碼填進輸入框
    const savedUser = localStorage.getItem('tetris_saved_user');
    const savedPass = localStorage.getItem('tetris_saved_pass');
    if (savedUser) usernameInput.value = savedUser;
    if (savedPass) passwordInput.value = savedPass;

    auth.onAuthStateChanged((user) => {
      if (user) {

        // 如果玩家已經透過點擊按鈕手動登入了，自動登入就不要出來搗亂
        if (currentPlayer) return;

        // 重新抓取「最新」的本機儲存名字，而不是用網頁剛載入時的舊記憶
        const currentSavedUser = localStorage.getItem('tetris_saved_user');
        if (currentSavedUser) {
          handleLoginSuccess(currentSavedUser, user.uid);
        } else {
          db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists && doc.data().username) {
              handleLoginSuccess(doc.data().username, user.uid);
            }
          });
        }
      }
    });
  });

  // 登入/註冊成功後的處理邏輯
  function handleLoginSuccess(username, uid) {
    // 如果名字是空的，或是字面上的 undefined，不准執行
    if (!username || username === 'undefined') return;

    initMenu();
    currentPlayer = username;
    currentUserUID = uid;
    
    // 切換 UI
    loginForm.classList.add('hidden');
    loggedInInfo.classList.remove('hidden');
    loginBtn.textContent = 'Login / Register';

    // 顯示線上玩家面板並更新資料庫狀態
    const onlinePanel = document.getElementById('online-panel');
    if (onlinePanel) onlinePanel.classList.remove('hidden');

    const adminPanel = document.getElementById('admin-panel');
    const playerStatsPanel = document.getElementById('player-stats');

    // 判斷是否為管理員
    if (currentPlayer === 'Admin_Mars') {
      if (adminPanel) adminPanel.classList.remove('hidden');
      if (playerStatsPanel) playerStatsPanel.style.display = 'none'; // 隱藏數據框

      // 賦予超然的稱號
      document.getElementById('display-username').innerHTML = '<span style="color:#ff0000; text-shadow:0 0 10px #ff0000; letter-spacing: 1px; font-size: 18px; white-space: nowrap; display: inline-block;">👑 SYSTEM ADMIN</span>';

      if (myIdEl) myIdEl.textContent = 'Loading...';
      initNetwork(); // 不傳入 uid，當作隱形人連線，不留門牌

      // 管理員不寫入/讀取玩家資料庫，直接結束函數！
      highScore = 0; myLP = 0; myWinStreak = 0;
      updateHUD();
      return; // 切斷管理員與 Firebase 戰績系統的連結
    }
    
    // ===== 以下為一般玩家的正常邏輯 =====
    if (adminPanel) adminPanel.classList.add('hidden');
    if (playerStatsPanel) playerStatsPanel.style.display = 'flex'; // 恢復顯示數據框

    const myFire = (myWinStreak >= 3) ? '<span style="color:#ff8c00; text-shadow:0 0 8px #ff0000; margin-left:4px;">🔥</span>' : '';
    document.getElementById('display-username').innerHTML = currentPlayer + myFire;

    if (myIdEl) myIdEl.textContent = 'Loading...';

    // 去雲端把這個玩家的最高分與戰績抓下來
    db.collection('users').doc(uid).get().then((doc) => {
      const data = doc.exists ? doc.data() : {};
      
      // 印出雲端給了我們什麼
      console.log("📥 雲端資料庫回傳的內容：", data);

      // 確保抓下來的是數字
      highScore = parseInt(data.highScore) || 0;
      
      // 確認程式有沒有算錯
      console.log("🎯 準備更新到畫面的最高分：", highScore);

      let wins = data.wins || 0;
      let matches = data.matches || 0;
      if (wins > matches) matches = wins;

      myLP = data.lp || 0;
      myWinStreak = data.winStreak || 0;
      myLoseStreak = data.loseStreak || 0;
      myDailyBullyWins = data.dailyBullyWins || 0;
      myDailyBullyDate = data.dailyBullyDate || null;

      const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
      
      // 更新側邊欄 UI
      document.getElementById('display-matches').textContent = matches;
      document.getElementById('display-winrate').textContent = winRate + '%';
      updateRankUI(myLP);
      updateCareerStatsUI(data);

      // 判斷「剛註冊的新帳號」的標準改為「缺少核心戰績欄位」
      if (data.lp === undefined || data.highScore === undefined || !data.username) {
        db.collection('users').doc(uid).set({
          username: currentPlayer, // 再次確保名字寫入，雙重防護
          lp: myLP,
          matches: matches,
          wins: wins,
          winStreak: myWinStreak,
          highScore: highScore
        }, { merge: true });
      }
      
      // 只要登入資料一載入完成，立刻向全伺服器亮起綠燈，不被後續的網路延遲阻擋
      setupPresence(uid, currentPlayer);

      isCloudDataLoaded = true; // 雲端資料抓取成功，解鎖上傳權限
      updateHUD(); 
      
      initNetwork(uid); // 等資料全部安穩載入後，才啟動 PeerJS 網路連線與寫入動態門牌
    }).catch(err => {
      // 如果有錯誤，強制彈出警告視窗
      console.error("❌ 讀取資料大失敗：", err);
      alert(window.t('cloud.readFailed', '讀取雲端存檔失敗！被 Firebase 擋住了，請按 F12 查看錯誤訊息。'));
    });
  }

  // === 段位規則單一資料源 (getRankInfo 與段位說明 Modal 都讀這個) ===
  // tierClass / symbol / cornerSym / hasBottomPlate 給 CSS 牌位框使用
  const RANK_RULES = {
    tiers: [
      { name: '銅牌', nameKey: 'rank.bronze',   min: 0,    color: '#CD7F32', tierClass: 'tier-bronze',   symbol: '◆',  plateDecor: ''   },
      { name: '銀牌', nameKey: 'rank.silver',   min: 200,  color: '#C0C0C0', tierClass: 'tier-silver',   symbol: '◈',  plateDecor: ''   },
      { name: '金牌', nameKey: 'rank.gold',     min: 400,  color: '#FFD700', tierClass: 'tier-gold',     symbol: '★',  plateDecor: '★'  },
      { name: '白金', nameKey: 'rank.platinum', min: 600,  color: '#00FF7F', tierClass: 'tier-platinum', symbol: '❖',  plateDecor: '❖'  },
      { name: '鑽石', nameKey: 'rank.diamond',  min: 800,  color: '#b9f2ff', tierClass: 'tier-diamond',  symbol: '✦',  plateDecor: '✦'  },
      { name: '大師', nameKey: 'rank.master',   min: 1000, color: '#FF00FF', tierClass: 'tier-master',   symbol: '♛',  plateDecor: '♛'  },
      { name: '菁英', nameKey: 'rank.elite',    min: 1200, color: '#00FFFF', tierClass: 'tier-elite',    symbol: '♚',  plateDecor: '♚'  },
    ]
  };
  const ALL_TIER_CLASSES = RANK_RULES.tiers.map(t => t.tierClass);

  // === 共用段位計算函數 (傳入 LP，回傳完整 tier 物件，向後相容) ===
  function getRankInfo(lp) {
    const tiers = RANK_RULES.tiers;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (lp >= tiers[i].min) return tiers[i];
    }
    return tiers[0];
  }

  // 把 Firestore 內存的舊段位中文字（如「鑽石」、「銀牌」）翻成當前語系。
  // matchHistory 寫入時固定用中文（保持向後相容），讀取時才動態翻譯。
  const _RANK_CN_TO_KEY = {
    '銅牌': 'rank.bronze', '銀牌': 'rank.silver', '金牌': 'rank.gold',
    '白金': 'rank.platinum', '鑽石': 'rank.diamond', '大師': 'rank.master', '菁英': 'rank.elite',
  };
  function localizeStoredRank(name) {
    if (!name) return '—';
    const key = _RANK_CN_TO_KEY[name];
    return key && window.t ? window.t(key, name) : name;
  }

  // === 套用牌位框：替 element 加上對應段位 class，並補齊 4 角寶石 + 頂部牌子 + 翅膀 ===
  // opts.bottomText: 底部副牌子要顯示的文字 (例如 "444 LP")，未指定則用段位符號裝飾
  function applyRankFrame(element, lp, labelText, opts) {
    if (!element) return;
    opts = opts || {};
    const tier = getRankInfo(lp || 0);
    element.classList.add('rank-frame');
    ALL_TIER_CLASSES.forEach(c => element.classList.remove(c));
    element.classList.add(tier.tierClass);

    // 4 角寶石
    ['tl','tr','bl','br'].forEach(pos => {
      let corner = element.querySelector(':scope > .rank-corner.' + pos);
      if (!corner) {
        corner = document.createElement('span');
        corner.className = 'rank-corner ' + pos;
        element.appendChild(corner);
      }
      corner.textContent = tier.symbol;
    });

    // 頂部 nameplate (大牌子)：段位名稱 + 兩側裝飾符號
    let plate = element.querySelector(':scope > .rank-plate');
    if (labelText === null) {
      if (plate) plate.remove();
    } else {
      if (!plate) {
        plate = document.createElement('span');
        plate.className = 'rank-plate';
        element.appendChild(plate);
      }
      const text = (labelText !== undefined ? labelText : window.t(tier.nameKey, tier.name));
      const decor = tier.plateDecor;
      plate.innerHTML = decor
        ? `<span class="rank-plate-icon">${decor}</span> ${text} <span class="rank-plate-icon">${decor}</span>`
        : text;
    }

    // 兩側翅膀飾條 (CSS 自己決定哪些段位開啟 display:block)
    ['rank-wing-l','rank-wing-r'].forEach(cls => {
      let wing = element.querySelector(':scope > .' + cls);
      if (!wing) {
        wing = document.createElement('span');
        wing.className = cls;
        element.appendChild(wing);
      }
    });

    // 底部副牌子
    let bottomPlate = element.querySelector(':scope > .rank-plate-bottom');
    if (!bottomPlate) {
      bottomPlate = document.createElement('span');
      bottomPlate.className = 'rank-plate-bottom';
      element.appendChild(bottomPlate);
    }
    bottomPlate.textContent = (opts.bottomText !== undefined)
      ? opts.bottomText
      : `${tier.symbol} ${tier.symbol} ${tier.symbol}`;
  }

  // 移除牌位框：清掉 class 與所有裝飾節點
  function clearRankFrame(element) {
    if (!element) return;
    element.classList.remove('rank-frame', 'rank-charging');
    ALL_TIER_CLASSES.forEach(c => element.classList.remove(c));
    element.querySelectorAll(
      ':scope > .rank-corner, :scope > .rank-plate, :scope > .rank-plate-bottom, :scope > .rank-wing-l, :scope > .rank-wing-r'
    ).forEach(n => n.remove());
  }

  // 觸發 3 秒華麗動畫 (倒數時用)：加 .rank-charging，倒數結束自動移除
  // 用 setTimeout 而不用 CSS 自然結束，因為使用者可能反覆按 R/Enter 重啟，需保證一定會清除
  const _rankChargeTimers = new WeakMap();
  function triggerRankCharge(element, durationMs) {
    if (!element || !element.classList.contains('rank-frame')) return;
    durationMs = durationMs || 3000;
    element.classList.add('rank-charging');
    const prevTimer = _rankChargeTimers.get(element);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      element.classList.remove('rank-charging');
      _rankChargeTimers.delete(element);
    }, durationMs);
    _rankChargeTimers.set(element, timer);
  }

  // 根據 user doc 更新生涯平均統計 UI (放在 PLAYER 面板)
  function updateCareerStatsUI(data) {
    if (!data) return;
    const dur = data.careerDurationSec || 0;
    const durMin = dur > 0 ? dur / 60 : 0;
    const avgApm = durMin > 0 ? Math.round((data.careerLinesSent || 0) / durMin) : 0;
    const avgPps = dur > 0 ? +((data.careerPieces || 0) / dur).toFixed(2) : 0;
    const matches = data.matches || 0;
    const avgCombo = matches > 0 ? +((data.careerComboSum || 0) / matches).toFixed(1) : 0;
    const totalKO = data.careerKOs || 0;
    const elApm = document.getElementById('display-avg-apm');
    const elPps = document.getElementById('display-avg-pps');
    const elCombo = document.getElementById('display-avg-combo');
    const elKo = document.getElementById('display-total-ko');
    if (elApm) elApm.textContent = avgApm;
    if (elPps) elPps.textContent = avgPps.toFixed(2);
    if (elCombo) elCombo.textContent = avgCombo;
    if (elKo) elKo.textContent = totalKO;
  }

  // 根據 LP 更新段位 UI 與顏色的輔助函數
  function updateRankUI(lp) {
    const rankEl = document.getElementById('display-rank');
    if (!rankEl) return;
    const tierInfo = getRankInfo(lp);
    const rankName = window.t(tierInfo.nameKey, tierInfo.name);
    const color = tierInfo.color;
    rankEl.innerHTML = `${rankName} <span style="font-size:12px">(${lp} LP)</span>`;
    rankEl.style.color = color;
    rankEl.style.textShadow = `0 0 5px ${color}`;
    // 替 PLAYER 框套上對應段位的牌位框，底部副牌子顯示 LP 值
    const profileEl = document.getElementById('player-profile-section');
    if (profileEl) applyRankFrame(profileEl, lp, rankName, { bottomText: `${lp} LP` });
  }

  // === 段位說明 Modal ===
  function renderRankModal() {
    const contentEl = document.getElementById('rank-modal-content');
    if (!contentEl) return;

    const tiers = RANK_RULES.tiers;
    const currentRank = getRankInfo(myLP);

    // 1) 段位階梯表 (由高到低)
    let tierRows = '';
    for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i];
      const next = tiers[i + 1];
      const range = next ? `${t.min} ~ ${next.min - 1} LP` : `${t.min}+ LP`;
      const isCurrent = currentRank.name === t.name;
      const bg = isCurrent ? `background: rgba(177,68,247,0.15);` : '';
      const mark = isCurrent ? `<span style="color:var(--T); font-weight:900; margin-left:6px;">${window.t('rankModal.youAreHere', '◀ 你在這')}</span>` : '';
      tierRows += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; border-radius:4px; ${bg}">
          <span style="color:${t.color}; font-weight:900; font-size:15px; text-shadow:0 0 6px ${t.color}80;">${window.t(t.nameKey, t.name)}</span>
          <span style="color:rgba(255,255,255,0.8); font-weight:bold;">${range}${mark}</span>
        </div>
      `;
    }

    // 2) 勝場加分規則
    const winRulesHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="color:rgba(255,255,255,0.9);">${window.t('rankModal.winRule1')}</div>
        <div style="color:rgba(255,255,255,0.9);">${window.t('rankModal.winRule2')}</div>
        <div style="color:rgba(255,255,255,0.9);">${window.t('rankModal.winRule3')}</div>
      </div>
    `;

    // 3) 敗場扣分 & 保底
    const loseRulesHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="color:rgba(255,255,255,0.9);">${window.t('rankModal.loseRule1')}</div>
        <div style="color:rgba(255,255,255,0.9);">${window.t('rankModal.loseRule2')}</div>
        <div style="color:rgba(255,255,255,0.9);">${window.t('rankModal.loseRule3')}</div>
      </div>
    `;

    // 3) 虐菜保護 (防堵強者虐弱)
    const bullyHTML = `
      <div style="color:rgba(255,255,255,0.85); margin-bottom:6px;">${window.t('rankModal.bullyIntro')}</div>
      <div style="display:grid; grid-template-columns: auto 1fr; gap:4px 12px; padding:8px 12px; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.1);">
        <span style="color:rgba(255,255,255,0.7);">${window.t('rankModal.bullyL1')}</span><span style="color:var(--O); font-weight:900;">${window.t('rankModal.bullyL1Reward')}</span>
        <span style="color:rgba(255,255,255,0.7);">${window.t('rankModal.bullyL2')}</span><span style="color:var(--O); font-weight:900;">${window.t('rankModal.bullyL2Reward')}</span>
        <span style="color:rgba(255,255,255,0.7);">${window.t('rankModal.bullyL3')}</span><span style="color:var(--Z); font-weight:900;">${window.t('rankModal.bullyL3Reward')}</span>
      </div>
      <div style="color:rgba(255,255,255,0.85); margin-top:8px;">
        ${window.t('rankModal.bullyDailyLimit')}
      </div>
      <div style="color:rgba(255,255,255,0.6); font-size:12px; margin-top:4px;">
        ${window.t('rankModal.bullyHint')}
      </div>
    `;

    // 4) 有效對戰門檻
    const validHTML = `
      <div style="color:rgba(255,255,255,0.85);">${window.t('rankModal.validIntro')}</div>
      <ul style="margin:6px 0 0 0; padding-left:20px; color:rgba(255,255,255,0.8); display:flex; flex-direction:column; gap:4px;">
        <li>${window.t('rankModal.validItem1')}</li>
        <li>${window.t('rankModal.validItem2')}</li>
        <li>${window.t('rankModal.validItem3')}</li>
      </ul>
    `;

    const section = (title, color, body) => `
      <div>
        <div style="font-weight:900; color:${color}; font-size:14px; letter-spacing:2px; margin-bottom:8px; border-left:4px solid ${color}; padding-left:8px;">${title}</div>
        ${body}
      </div>
    `;

    contentEl.innerHTML =
      section(window.t('rankModal.section.tierLadder'), 'var(--I)', `<div style="display:flex; flex-direction:column; gap:4px;">${tierRows}</div>`) +
      section(window.t('rankModal.section.winBonus'), 'var(--S)', winRulesHTML) +
      section(window.t('rankModal.section.lossPenalty'), 'var(--O)', loseRulesHTML) +
      section(window.t('rankModal.section.bullyProtection'), 'var(--Z)', bullyHTML) +
      section(window.t('rankModal.section.validMatch'), 'var(--T)', validHTML);
  }

  // 點擊段位 → 開 Modal
  document.addEventListener('click', function(e) {
    if (e.target && (e.target.id === 'display-rank' || (e.target.parentElement && e.target.parentElement.id === 'display-rank'))) {
      renderRankModal();
      const modal = document.getElementById('rank-modal');
      if (modal) modal.classList.remove('hidden');
    }
    if (e.target && e.target.id === 'close-rank-btn') {
      const modal = document.getElementById('rank-modal');
      if (modal) modal.classList.add('hidden');
    }
  });

  // --- Rules Modal (遊戲規則彈窗) ---
  function openRulesModal() {
    const modal = document.getElementById('rules-modal');
    const overlay = document.getElementById('rules-modal-overlay');
    if (modal) modal.classList.remove('hidden');
    if (overlay) overlay.classList.remove('hidden');
  }
  function closeRulesModal() {
    const modal = document.getElementById('rules-modal');
    const overlay = document.getElementById('rules-modal-overlay');
    if (modal) modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
  }
  function switchRulesTab(tabName) {
    document.querySelectorAll('.rules-tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      const colorMap = { operation: 'var(--I)', solo: 'var(--O)', battle: 'var(--Z)' };
      const rgbMap = { operation: '56,189,238', solo: '247,221,22', battle: '255,13,98' };
      const c = colorMap[btn.dataset.tab] || 'var(--I)';
      const rgb = rgbMap[btn.dataset.tab] || '56,189,238';
      btn.style.background = isActive ? `rgba(${rgb},0.15)` : 'transparent';
      btn.style.borderColor = isActive ? c : `rgba(${rgb},0.35)`;
    });
    document.querySelectorAll('.rules-tab-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.panel !== tabName);
    });
    const contentEl = document.getElementById('rules-modal-content');
    if (contentEl) contentEl.scrollTop = 0;
  }

  document.addEventListener('click', function(e) {
    if (!e.target) return;
    if (e.target.id === 'open-rules-btn' || (e.target.parentElement && e.target.parentElement.id === 'open-rules-btn')) {
      openRulesModal();
      return;
    }
    if (e.target.id === 'close-rules-btn' || e.target.id === 'close-rules-btn-x' || e.target.id === 'rules-modal-overlay') {
      closeRulesModal();
      return;
    }
    const tabBtn = e.target.closest && e.target.closest('.rules-tab-btn');
    if (tabBtn && tabBtn.dataset.tab) {
      switchRulesTab(tabBtn.dataset.tab);
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById('rules-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeRulesModal();
        e.stopPropagation();
        e.preventDefault();
      }
    }
  }, true);

  logoutBtn.addEventListener('click', () => {
    if (isMultiplayer && conn && conn.open) {
      conn.send({ type: 'OPPONENT_DISCONNECTED' });
    }

    // 將雲端狀態設為下線，並隱藏面板
    if (currentUserUID) {
      rtdb.ref('/status/' + currentUserUID).update({ state: 'offline' });
    }
    const onlinePanel = document.getElementById('online-panel');
    if (onlinePanel) onlinePanel.classList.add('hidden');

    initMenu();
    auth.signOut().then(() => {
      currentPlayer = null;
      currentUserUID = null;
      usernameInput.value = '';
      passwordInput.value = '';
      
      loggedInInfo.classList.add('hidden');
      loginForm.classList.remove('hidden');

      const adminPanel = document.getElementById('admin-panel');
      if (adminPanel) adminPanel.classList.add('hidden');

      // 登出時清掉 PLAYER 框的牌位框，避免登入畫面殘留前一個玩家的段位光暈
      const profileEl = document.getElementById('player-profile-section');
      if (profileEl) clearRankFrame(profileEl);

      if (myIdEl) myIdEl.textContent = 'Loading...';
      initNetwork();

      // 恢復成單機版的暫存分數
      highScore = parseInt(localStorage.getItem('tetrisHighScore')) || 0;
      isCloudDataLoaded = false; // 登出時，把雲端上傳鎖重新鎖上
      updateHUD();
    });
  });

  // GM 開發者控制台系統邏輯
  const adminUpdateBtn = document.getElementById('admin-update-btn');
  const adminResetBtn = document.getElementById('admin-reset-btn');

  if (adminUpdateBtn) {
    adminUpdateBtn.addEventListener('click', async () => {
      const targetName = document.getElementById('admin-target-user').value.trim();
      const setHighScore = parseInt(document.getElementById('admin-set-highscore').value);
      const setLp = parseInt(document.getElementById('admin-set-lp').value);
      const setWins = parseInt(document.getElementById('admin-set-wins').value);
      const setStreak = parseInt(document.getElementById('admin-set-streak').value);
      

      if (!targetName) return alert(window.t('admin.emptyName', '請輸入目標玩家名稱！'));

      try {
        adminUpdateBtn.textContent = 'Updating...';
        
        // 去資料庫找這位玩家
        const snapshot = await db.collection('users').where('username', '==', targetName).get();
        if (snapshot.empty) return alert(window.t('admin.notFound', '找不到這個玩家！'));

        let targetDocId = null;
        let currentMatches = 0;
        snapshot.forEach(doc => { 
          targetDocId = doc.id; 
          currentMatches = doc.data().matches || 0;
        });

        // 打包要修改的數據
        let updateData = {};
        if (!isNaN(setHighScore)) updateData.highScore = setHighScore;
        if (!isNaN(setLp)) updateData.lp = setLp;
        if (!isNaN(setStreak)) updateData.winStreak = setStreak;
        if (!isNaN(setWins)) {
          updateData.wins = setWins;
          // 防呆：為了避免勝率超過 100% 的 Bug，如果修改的勝場大於總場次，自動把總場次拉高
          if (setWins > currentMatches) updateData.matches = setWins; 
        }

        if (Object.keys(updateData).length === 0) return alert(window.t('admin.emptyValues', '請至少輸入一項要修改的數值！'));

        // 強制寫入 Firebase (使用 merge: true 只會更新你輸入的欄位，不會洗掉其他資料)
        await db.collection('users').doc(targetDocId).set(updateData, { merge: true });
        
        // 清空輸入框
        document.getElementById('admin-set-highscore').value = '';
        document.getElementById('admin-set-lp').value = '';
        document.getElementById('admin-set-wins').value = '';
        document.getElementById('admin-set-streak').value = '';
        
        alert(window.t('admin.modifySuccess', '成功修改玩家 {user} 的數據！\n(請該玩家重新登入，或打完一局結算後就會更新畫面)').replace('{user}', targetName));
      } catch (err) {
        console.error("修改失敗:", err);
        alert(window.t('admin.modifyFailed', '修改失敗！'));
      } finally {
        adminUpdateBtn.textContent = 'Update Player Stats';
      }
    });
  }

  // 賽季重置功能
  if (adminResetBtn) {
    adminResetBtn.addEventListener('click', async () => {
      const pwd = prompt("⚠️ 警告：即將重置賽季。\n為確保安全，請輸入您 ADMIN 帳號的登入密碼：");
      if (!pwd) return;

      adminResetBtn.textContent = 'Verifying...';
      try {
        // 直接向 Firebase 雲端驗證這個帳號的真實密碼
        const email = currentPlayer.toLowerCase() + '@tetris.com';
        await auth.signInWithEmailAndPassword(email, pwd);
      } catch (error) {
        alert(window.t('admin.wrongPassword', '密碼錯誤！請輸入您登入此帳號的正確密碼。'));
        adminResetBtn.textContent = '⚠️ RESET SEASON';
        return;
      }

      adminResetBtn.textContent = 'Resetting...';
      try {
        const snapshot = await db.collection('users').get();
        const batch = db.batch(); 

        snapshot.forEach(doc => {
          batch.update(doc.ref, { lp: 0, matches: 0, wins: 0, winStreak: 0 });
        });

        await batch.commit();
        alert(window.t('admin.resetSuccess', '🎉 賽季重置完成！全伺服器玩家已歸零。'));
      } catch (err) {
        console.error("重置失敗:", err);
        alert(window.t('admin.resetFailed', '重置失敗！請檢查網路。'));
      } finally {
        adminResetBtn.textContent = '⚠️ RESET SEASON';
      }
    });
  }
  
  // 綁定連線邀請通知 (Toast) 的按鈕事件
  const acceptBtn = document.getElementById('invite-accept-btn');
  const rejectBtn = document.getElementById('invite-reject-btn');
  
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      document.getElementById('invite-toast').classList.add('hidden');
      document.getElementById('invite-toast').classList.remove('show-invite');
      if (inviteTimeoutTimer) clearTimeout(inviteTimeoutTimer);
      const mpHint = document.getElementById('invite-mp-hint');
      if (mpHint) mpHint.style.display = 'none';

      // Phase 3：觀戰中接受邀請 → 自動退出觀戰
      if (isSpectating) {
        exitSpectateMode('INVITE_ACCEPTED');
      }

      if (pendingConn && pendingConn.open) {
        const incomingMpRoomCode = pendingConn.__mpRoomCode || null;
        const acceptedConn = pendingConn;
        pendingConn = null;

        // 處理現任：依目前所在狀態通知並退出
        let exitingFromMp = false;
        if (window.isMpMulti) {
          // 我目前在多人對戰房（房主 or 一般玩家）→ 廣播烙跑訊息，再退房
          const leftType = window.mpIsHost ? 'MP_HOST_LEFT_FOR_BATTLE' : 'MP_PLAYER_LEFT_FOR_BATTLE';
          try { broadcastMp({ type: leftType, name: getMpName() }); } catch {}
          // 防止「房間消失」事件再彈一次「房主已關閉房間」alert
          window.__mpSuppressRoomClosedAlert = true;
          exitingFromMp = true;
          setTimeout(() => {
            try { if (typeof exitMpMultiPreview === 'function') exitMpMultiPreview(); } catch {}
          }, 200);
        } else if (isMultiplayer) {
          // 我目前在 1v1 對戰中 → 通知前任，默默退出
          if (conn && conn.open) { try { conn.send({ type: 'OPPONENT_LEFT_FOR_ANOTHER' }); } catch {} }
          exitMultiplayerMode(false);
          if (conn) { try { conn.close(); } catch {} conn = null; }
        }

        // 走多人房邀請流程 → 加入對方的房間，不進 1v1
        if (incomingMpRoomCode) {
          try { acceptedConn.send({ type: 'MP_INVITE_OK' }); } catch {}
          setTimeout(() => { try { acceptedConn.close(); } catch {} }, 300);
          // 等 exitMpMultiPreview / RTDB 操作跑完再加入新房，避免競態
          setTimeout(() => {
            if (typeof window.enterMpMultiAndJoin === 'function') {
              window.enterMpMultiAndJoin(incomingMpRoomCode);
            }
          }, exitingFromMp ? 400 : 50);
          return;
        }

        // 走 1v1 邀請流程
        conn = acceptedConn;
        try { conn.send({ type: 'INVITE_ACCEPT' }); } catch {}
        if (exitingFromMp) {
          setTimeout(() => { enterMultiplayerMode(); }, 250);
        } else {
          enterMultiplayerMode();
        }
      }
    });
  }

  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      document.getElementById('invite-toast').classList.add('hidden');
      document.getElementById('invite-toast').classList.remove('show-invite');
      if (inviteTimeoutTimer) clearTimeout(inviteTimeoutTimer);
      const mpHint = document.getElementById('invite-mp-hint');
      if (mpHint) mpHint.style.display = 'none';

      // 殘忍拒絕：依邀請類型送對應 reject 訊息
      if (pendingConn && pendingConn.open) {
        const rejected = pendingConn;
        const rejectType = rejected.__mpRoomCode ? 'MP_INVITE_REJECT' : 'INVITE_REJECT';
        try { rejected.send({ type: rejectType }); } catch {}
        // 延遲關閉，等封包送出去，不然對方收不到 REJECT
        setTimeout(() => { try { rejected.close(); } catch(e){} }, 500);
        pendingConn = null;
      }
    });
  }

  // 練習模式切換邏輯
  const practiceBtn = document.getElementById('practice-btn');
  const myNameDisplay = document.getElementById('my-name-display');
  const practiceModeActions = document.getElementById('practice-mode-actions');

  // 把單機盤面徹底收乾淨，回到「PRESS ENTER」起始畫面
  // ⚠️ 只設 gameStarted=false（顯示 PRESS ENTER），不要同時設 gameOver=true，
  //    否則畫布會同時疊出 GAME OVER 與 PRESS ENTER 兩個框
  function resetToPressEnter() {
    gameOver = false;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownValue = 0;
    gameStarted = false;
    isPaused = false;
    isKOed = false;
    board = createBoard();
    score = 0; lines = 0; level = 1; combo = -1; b2b = 0;
    maxCombo = 0; piecesPlaced = 0;
    activeGarbage = 0; nextGarbage = 0;
    clearFx = null;
    current = null; queue = []; holdType = null; holdUsed = false;
    piecePool = []; myPieceIndex = 0;
    if (typeof updateHUD === 'function') updateHUD();
    if (typeof renderPanels === 'function') renderPanels(); // 清掉殘留的 NEXT / QUEUE / HOLD
    if (typeof draw === 'function') draw();
  }

  // === 多人對戰（最多 7 人）入口（Phase 1 骨架：先做排版預覽，房間/連線邏輯後續加上） ===
  // 用 window 範圍變數，後面 Phase 2~9 會在 game.js 各處讀寫
  window.isMpMulti = false;
  // 多人對戰：累計總場數與我的勝場（重整頁面會歸零；不寫進 LP/戰績表）
  window.mpTotalMatches = 0;
  window.mpMyWins = 0;
  window.mpAttackStrategy = 'RANDOM';
  window.mpHostSettings = { mode: 'BOMB', winCondition: 'LAST_SURVIVOR', roomCode: null };
  window.mpIsHost = true;
  window.mpRoomId = null;
  let mpRoomRef = null;
  let mpRoomListener = null;
  let mpMySlot = -1;
  const mpPlayersMap = new Map(); // peerId -> { slot, name, uid, ready, peerId }

  function generateMpRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆 0/O/1/I
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function getMpUid() { return currentUserUID || ('anon-' + (peer && peer.id ? peer.id : Math.random().toString(36).slice(2,10))); }
  function getMpName() { return currentPlayer || 'Guest'; }
  function getMpPeerId() { return peer && peer.id ? peer.id : null; }

  async function createMpRoom() {
    const pid = getMpPeerId();
    if (!pid) { alert(window.t('multiplayer.peerNotReady', '連線初始化中，請稍候再試')); return false; }
    const uid = getMpUid();
    const code = window.mpHostSettings.roomCode || generateMpRoomCode();
    window.mpHostSettings.roomCode = code;
    const roomId = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const ref = rtdb.ref('/mpRooms/' + roomId);
    try {
      await ref.set({
        host: uid,
        hostPeerId: pid,
        code,
        mode: window.mpHostSettings.mode,
        winCondition: window.mpHostSettings.winCondition,
        status: 'LOBBY',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {
          '0': { uid, peerId: pid, name: getMpName(), ready: false, joinOrder: 0 }
        }
      });
      // 簡化版：房主斷線整個房間自動消失（Phase 9 再做轉移）
      ref.onDisconnect().remove();
      await rtdb.ref('/mpRoomCodes/' + code).set({ roomId, createdAt: firebase.database.ServerValue.TIMESTAMP });
      rtdb.ref('/mpRoomCodes/' + code).onDisconnect().remove();
    } catch (e) {
      console.warn('createMpRoom failed:', e);
      return false;
    }
    window.mpRoomId = roomId;
    mpRoomRef = ref;
    mpMySlot = 0;
    window.mpIsHost = true;
    attachMpRoomListener();
    syncMpHostPanelUI();
    return true;
  }

  function setMpJoinStatus(msg, kind) {
    const el = document.getElementById('mp-join-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = kind === 'ok' ? 'var(--S)' : kind === 'info' ? 'var(--I)' : 'var(--Z)';
  }
  async function joinMpRoomByCode(rawCode) {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) return false;
    const pid = getMpPeerId();
    if (!pid) { setMpJoinStatus(window.t('multiplayer.peerNotReady', '連線初始化中，請稍候再試')); return false; }
    const uid = getMpUid();
    const idxSnap = await rtdb.ref('/mpRoomCodes/' + code).once('value');
    const idx = idxSnap.val();
    if (!idx || !idx.roomId) { setMpJoinStatus(window.t('multiplayer.joinNotFound', '找不到房間代碼') + ': ' + code); return false; }
    const roomId = idx.roomId;
    const playersRef = rtdb.ref('/mpRooms/' + roomId + '/players');
    const tx = await playersRef.transaction((players) => {
      players = players || {};
      // 已存在同 uid → 替換 peerId 重用 slot（避免換 peer 後變成新人）
      for (const k of Object.keys(players)) {
        if (players[k] && players[k].uid === uid) {
          players[k].peerId = pid;
          players[k].name = getMpName();
          return players;
        }
      }
      for (let s = 1; s <= 4; s++) {
        if (!players[String(s)]) {
          players[String(s)] = { uid, peerId: pid, name: getMpName(), ready: false, joinOrder: s };
          return players;
        }
      }
      return; // 滿
    });
    if (!tx.committed) { setMpJoinStatus(window.t('multiplayer.roomFull', '房間已滿')); return false; }
    const finalPlayers = tx.snapshot.val() || {};
    mpMySlot = -1;
    for (const k of Object.keys(finalPlayers)) {
      if (finalPlayers[k] && finalPlayers[k].uid === uid) { mpMySlot = Number(k); break; }
    }
    window.mpRoomId = roomId;
    mpRoomRef = rtdb.ref('/mpRooms/' + roomId);
    window.mpIsHost = false;
    if (mpMySlot >= 0) rtdb.ref('/mpRooms/' + roomId + '/players/' + mpMySlot).onDisconnect().remove();
    attachMpRoomListener();
    return true;
  }

  async function leaveMpRoom() {
    if (!window.mpRoomId) return;
    detachMpRoomListener();
    const rid = window.mpRoomId;
    const slot = mpMySlot;
    const wasHost = window.mpIsHost;
    const code = window.mpHostSettings.roomCode;
    window.mpRoomId = null;
    mpRoomRef = null;
    mpMySlot = -1;
    mpPlayersMap.clear();
    try {
      if (wasHost) {
        await rtdb.ref('/mpRooms/' + rid).remove();
        if (code) await rtdb.ref('/mpRoomCodes/' + code).remove();
      } else if (slot >= 0) {
        await rtdb.ref('/mpRooms/' + rid + '/players/' + slot).remove();
      }
    } catch (e) { console.warn('leaveMpRoom err', e); }
  }

  function attachMpRoomListener() {
    if (!mpRoomRef) return;
    mpRoomListener = mpRoomRef.on('value', (snap) => {
      const room = snap.val();
      if (!room) {
        if (!window.mpIsHost && window.mpRoomId) {
          if (!window.__mpSuppressRoomClosedAlert) {
            alert(window.t('multiplayer.roomClosed', '房主已關閉房間'));
          }
          window.__mpSuppressRoomClosedAlert = false;
          if (typeof exitMpMultiPreview === 'function') exitMpMultiPreview();
        }
        return;
      }
      if (!window.mpIsHost) {
        window.mpHostSettings.mode = room.mode || 'BOMB';
        window.mpHostSettings.winCondition = room.winCondition || 'LAST_SURVIVOR';
        window.mpHostSettings.roomCode = room.code || null;
      }
      const players = room.players || {};
      // Phase 9：保留 game-state 欄位（disconnectedAt / eliminated / ko / linesSent / boardHeight）
      const preserved = new Map();
      for (const [pid, v] of mpPlayersMap) {
        preserved.set(pid, {
          disconnectedAt: v.disconnectedAt,
          eliminated: v.eliminated,
          ko: v.ko,
          linesSent: v.linesSent,
          boardHeight: v.boardHeight
        });
      }
      mpPlayersMap.clear();
      Object.keys(players).forEach(k => {
        const p = players[k];
        if (p && p.peerId) {
          const entry = { ...p, slot: Number(k) };
          const old = preserved.get(p.peerId);
          if (old) {
            if (old.disconnectedAt) entry.disconnectedAt = old.disconnectedAt;
            if (old.eliminated)     entry.eliminated = old.eliminated;
            if (old.ko != null)     entry.ko = old.ko;
            if (old.linesSent != null) entry.linesSent = old.linesSent;
            if (old.boardHeight != null) entry.boardHeight = old.boardHeight;
          }
          mpPlayersMap.set(p.peerId, entry);
        }
      });
      renderMpSlots();
      syncMpHostPanelUI();
      manageMpMesh(); // Phase 4：依房間玩家列表調整 mesh 連線
      updateMpConnStatus();
      updateMpTargetIndicator(); // Phase 5：人員變動時重算 🎯
    });
  }

  function updateMpConnStatus() {
    if (!window.isMpMulti) return;
    const el = document.getElementById('conn-status');
    if (!el) return;
    // 中途加入者：對方還在對戰，顯示觀戰中
    if (window.mpIsSpectatorWaiting) {
      el.textContent = window.t('mp.spectatorStatus', 'Status: 觀戰中，等本局結束…');
      el.style.color = 'var(--I)';
      return;
    }
    if (mpPlayersMap.size <= 1) {
      el.textContent = window.t('multiplayer.waitingPlayers', 'Status: 等待玩家加入…');
      el.style.color = 'var(--O)';
      return;
    }
    // 多人已在房；依 ready 狀態切換文字
    const myReady = !!window.mpIAmReady;
    let othersReadyCount = 0, othersTotal = 0;
    const myPid = getMpPeerId();
    for (const v of mpPlayersMap.values()) {
      if (v.peerId === myPid) continue;
      othersTotal++;
      if (mpReadyState.get(v.peerId)) othersReadyCount++;
    }
    const allOthersReady = othersTotal > 0 && othersReadyCount === othersTotal;
    if (myReady && !allOthersReady) {
      el.textContent = window.t('multiplayer.waitOppReady', 'Status: 等待對手準備…');
      el.style.color = 'var(--O)';
    } else if (!myReady && othersReadyCount > 0) {
      el.textContent = window.t('multiplayer.oppReadyClickReady', 'Status: 對手已準備，按 READY');
      el.style.color = 'var(--S)';
    } else if (!myReady) {
      el.textContent = window.t('multiplayer.clickReady', 'Status: 按 READY 開始');
      el.style.color = 'var(--S)';
    } else {
      // myReady && allOthersReady → 即將開始（Phase 5 接倒數）
      el.textContent = window.t('multiplayer.allReady', 'Status: 全員就緒，準備開始…');
      el.style.color = 'var(--S)';
    }
  }

  function updateMpReadyButtonUI() {
    const btn = document.getElementById('ready-btn');
    if (!btn) return;
    // Phase 8+：中途加入時若其他人正在對戰 → 鎖死按鈕、顯示「觀戰中」
    if (window.mpIsSpectatorWaiting) {
      btn.textContent = window.t('mp.spectating', '👀 觀戰中…');
      btn.style.background = 'rgba(255,255,255,0.1)';
      btn.style.color = 'rgba(255,255,255,0.5)';
      btn.style.borderColor = 'rgba(255,255,255,0.3)';
      btn.style.cursor = 'not-allowed';
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    btn.style.cursor = 'pointer';
    if (window.mpIAmReady) {
      btn.textContent = window.t('battle.cancelReadyBtn', '✕ 取消 READY');
      btn.style.background = 'var(--Z)';
      btn.style.color = 'var(--white)';
      btn.style.borderColor = 'var(--white)';
    } else {
      btn.textContent = 'READY';
      btn.style.background = 'var(--S)';
      btn.style.color = 'var(--bg)';
      btn.style.borderColor = 'var(--S)';
    }
  }

  // 中途加入者狀態判定：只要有任何 peer roundActive=true 且自己不在對戰中 → 觀戰等待
  function refreshMpSpectatorState() {
    if (!window.isMpMulti) return;
    if (window.mpGameActive) {
      // 自己也在對戰中：不是觀戰者
      if (window.mpIsSpectatorWaiting) {
        window.mpIsSpectatorWaiting = false;
        updateMpReadyButtonUI();
        updateMpConnStatus();
      }
      return;
    }
    let anyActive = false;
    for (const v of mpPlayersMap.values()) {
      if (v.roundActive) { anyActive = true; break; }
    }
    const wasSpec = !!window.mpIsSpectatorWaiting;
    window.mpIsSpectatorWaiting = anyActive;
    if (wasSpec !== anyActive) {
      updateMpReadyButtonUI();
      updateMpConnStatus();
      if (!anyActive && !window.mpPostMatchPending) {
        // 觀戰結束（上局結束）且不在賽後待 READY 狀態 → 清掉所有人 eliminated/board/inCurrentRound
        // （賽後狀態時要保留最終盤面 + 淘汰/勝利 overlay，等該玩家自己按 READY 才清）
        for (const v of mpPlayersMap.values()) {
          v.eliminated = false;
          v.boardStr = '';
          v.curPiece = null;
          v.inCurrentRound = false;
        }
        clearMpSlotEliminatedUI();
        renderMpSlots();
        window.mpIAmReady = false;
        broadcastMp({ type: 'MP_READY', ready: false });
      }
    }
  }
  window.refreshMpSpectatorState = refreshMpSpectatorState;

  function detachMpRoomListener() {
    if (mpRoomRef && mpRoomListener) {
      try { mpRoomRef.off('value', mpRoomListener); } catch {}
    }
    mpRoomListener = null;
  }

  // ============================================================
  // Phase 4：Mesh PeerJS 連線層
  // ============================================================
  const mpConns = new Map();          // peerId -> DataConnection
  const mpLastSeen = new Map();       // peerId -> Date.now() of last heartbeat
  const mpReadyState = new Map();     // peerId -> bool (ready or not)
  window.mpIAmReady = false;
  let mpHeartbeatTimer = null;
  let mpHeartbeatCheckTimer = null;

  function setupMpConnection(connection, isInitiator) {
    if (!connection) return;
    const peerId = connection.peer;
    // 已有開啟中的連線就直接保留
    const existing = mpConns.get(peerId);
    if (existing && existing.open && existing !== connection) {
      try { connection.close(); } catch {}
      return;
    }
    mpConns.set(peerId, connection);

    connection.on('open', () => {
      mpLastSeen.set(peerId, Date.now());
      // 一開連線就先送一次自己的 READY 狀態 + 心跳（帶 roundActive 讓對方馬上知道是否該觀戰）
      try { connection.send({ type: 'MP_HEARTBEAT', t: Date.now(), roundActive: !!window.mpGameActive, senderPeerId: getMpPeerId() }); } catch {}
      try { connection.send({ type: 'MP_READY', ready: !!window.mpIAmReady, senderPeerId: getMpPeerId() }); } catch {}
    });

    connection.on('data', (data) => {
      if (!data || !data.type) return;
      mpLastSeen.set(peerId, Date.now());
      // Phase 9：收到任何訊息 → 清掉斷線標記（已重連）
      const ps = mpPlayersMap.get(peerId);
      if (ps && ps.disconnectedAt) {
        ps.disconnectedAt = null;
        clearMpReconnectOverlay(peerId);
      }
      handleMpMessage(data, peerId);
    });

    connection.on('close', () => {
      if (mpConns.get(peerId) === connection) mpConns.delete(peerId);
      mpReadyState.delete(peerId);
      // Phase 9：對戰中斷線 → 開 30 秒緩衝（lobby 中直接讓 mesh 重連即可）
      if (window.mpGameActive) {
        const ps = mpPlayersMap.get(peerId);
        if (ps && !ps.eliminated && !ps.disconnectedAt) {
          ps.disconnectedAt = Date.now();
          showMpReconnectOverlay(peerId, 30);
        }
      }
      updateMpConnStatus();
    });

    connection.on('error', (err) => {
      console.warn('[mp-conn] error from', peerId, err);
    });
  }

  function connectToMpPeer(targetPeerId) {
    if (!peer || !isMyPeerReady || !targetPeerId) return;
    if (targetPeerId === getMpPeerId()) return;
    const existing = mpConns.get(targetPeerId);
    if (existing && (existing.open || existing._open !== false)) return; // 已連
    try {
      const conn = peer.connect(targetPeerId, {
        reliable: true,
        metadata: { purpose: 'mp-game', roomId: window.mpRoomId }
      });
      setupMpConnection(conn, true);
    } catch (e) {
      console.warn('[mp-conn] connect failed:', e);
    }
  }

  // Tiebreaker：peerId 字串較小的人主動發起連線，避免雙方同時 connect 形成兩條
  function shouldIInitiate(otherPeerId) {
    const mine = getMpPeerId();
    if (!mine || !otherPeerId) return false;
    return mine < otherPeerId;
  }

  function manageMpMesh() {
    if (!window.isMpMulti || !window.mpRoomId) return;
    const myPid = getMpPeerId();
    if (!myPid) return;
    const targetPeerIds = new Set();
    for (const v of mpPlayersMap.values()) {
      if (v.peerId && v.peerId !== myPid) targetPeerIds.add(v.peerId);
    }
    // 1) 缺少的連線：由 peerId 較小者主動 connect（另一邊會在 peer.on('connection') 收到）
    for (const pid of targetPeerIds) {
      const existing = mpConns.get(pid);
      const isAlive = existing && (existing.open || existing._open !== false);
      if (!isAlive && shouldIInitiate(pid)) {
        connectToMpPeer(pid);
      }
    }
    // 2) 不再屬於房間的連線：關閉
    for (const [pid, c] of mpConns) {
      if (!targetPeerIds.has(pid)) {
        try { c.close(); } catch {}
        mpConns.delete(pid);
        mpReadyState.delete(pid);
      }
    }
  }

  function broadcastMp(msg) {
    if (!msg) return;
    const myPid = getMpPeerId();
    const payload = Object.assign({ senderPeerId: myPid }, msg);
    for (const c of mpConns.values()) {
      if (c && c.open) {
        try { c.send(payload); } catch (e) { /* swallow */ }
      }
    }
  }

  function sendMpToPeer(targetPeerId, msg) {
    const c = mpConns.get(targetPeerId);
    if (!c || !c.open) return false;
    try {
      c.send(Object.assign({ senderPeerId: getMpPeerId() }, msg));
      return true;
    } catch { return false; }
  }

  function handleMpMessage(data, fromPeerId) {
    switch (data.type) {
      case 'MP_HEARTBEAT':
        // 已在 onData 統一更新 mpLastSeen
        // Phase 6+ 補：對方告知目前是否在對戰中，讓中途加入者進入觀戰等待
        if (data.roundActive) {
          const ps = mpPlayersMap.get(fromPeerId);
          if (ps) ps.roundActive = true;
        } else {
          const ps = mpPlayersMap.get(fromPeerId);
          if (ps) ps.roundActive = false;
        }
        refreshMpSpectatorState();
        break;
      case 'MP_READY':
        mpReadyState.set(fromPeerId, !!data.ready);
        // 對方按下 READY 且非對戰中 → 清掉他自己的最終盤面快照，slot 切回 READY 文字
        // （條件用 !mpGameActive 而非 mpPostMatchPending，因為本地玩家可能已先按 READY 退出 postMatch 狀態）
        if (!window.mpGameActive && data.ready) {
          const ps = mpPlayersMap.get(fromPeerId);
          if (ps) {
            ps.eliminated = false;
            ps.boardStr = '';
            ps.curPiece = null;
            ps.inCurrentRound = false;
            ps.g = 0; ps.ng = 0;
          }
          // 從勝者清單移除（讓 slot 上的 WIN overlay 也消失）
          if (window.mpWinnerPeerIds && window.mpWinnerPeerIds.has(fromPeerId)) {
            window.mpWinnerPeerIds.delete(fromPeerId);
          }
          // 清掉他 slot 上的 eliminated / winner overlay
          const uiSlot = getMpUiSlotForPeer(fromPeerId);
          if (uiSlot > 0) {
            const slotEl = document.getElementById('mp-slot-' + uiSlot);
            if (slotEl) {
              slotEl.classList.remove('eliminated');
              slotEl.style.filter = '';
              const elimOverlay = slotEl.querySelector('.mp-eliminated-overlay');
              if (elimOverlay) elimOverlay.classList.add('hidden');
              const winOverlay = slotEl.querySelector('.mp-winner-overlay');
              if (winOverlay) winOverlay.classList.add('hidden');
            }
          }
        }
        updateMpConnStatus();
        renderMpSlots();
        maybeStartMpGame();
        break;
      case 'MP_START':
        if (data.seed != null && !gameStarted && countdownValue === 0) {
          mpStartGame(data.seed, data.mode);
        }
        break;
      case 'MP_ATTACK': {
        if (!gameOver && gameStarted) {
          const lines = data.lines || 0;
          window.recentIncomingAttacks.push({ from: fromPeerId, lines, t: Date.now() });
          // 限長度避免無限累積
          if (window.recentIncomingAttacks.length > 200) window.recentIncomingAttacks.shift();
          myFloatingTexts.push(new FloatingText(`+${lines}`, (COLS * 34) / 2, (VISIBLE_ROWS * 34) / 2 + 40, '#ff0d62', 50));
          playSound('drop'); shakeMag = 6;
          const gen = matchGeneration;
          setTimeout(() => { if (!gameOver && matchGeneration === gen) nextGarbage += lines; }, 2000);
        }
        break;
      }
      case 'MP_STATE': {
        const ps = mpPlayersMap.get(fromPeerId);
        if (ps) {
          ps.boardHeight = data.boardHeight || 0;
          ps.ko = data.ko || 0;
          ps.linesSent = data.linesSent || 0;
          ps.boardStr = data.b || '';
          ps.curPiece = data.cur || null;
          ps.g = data.g || 0;
          ps.ng = data.ng || 0;
          // 既然對方有送 MP_STATE 過來，就代表他這局有參賽
          if (ps.boardStr) ps.inCurrentRound = true;
          updateMpSlotStats(fromPeerId);
          // 任何人都重畫（包含中途加入的觀戰者 C）
          if (!ps.eliminated) {
            drawMpMiniBoardForPeer(fromPeerId);
          }
        }
        break;
      }
      case 'MP_KO': {
        // 凶手 KO++（fromPeerId 是被 KO 的人；killerPeerId 才是擊殺者）
        if (data.killerPeerId) {
          if (data.killerPeerId === getMpPeerId()) {
            myKOs = (typeof myKOs === 'number' ? myKOs : 0) + 1;
            const myKoEl = document.getElementById('my-ko-display');
            if (myKoEl) myKoEl.textContent = myKOs;
          } else {
            const k = mpPlayersMap.get(data.killerPeerId);
            if (k) { k.ko = (k.ko || 0) + 1; updateMpSlotStats(data.killerPeerId); }
          }
        }
        break;
      }
      case 'MP_LEAVE': {
        // 對方自願離開房間（非斷線）→ 立刻標記離場，不要走 30 秒重連倒數
        const ps = mpPlayersMap.get(fromPeerId);
        const leaverName = (data && data.name) || (ps && ps.name) || '?';
        if (ps) {
          ps.disconnectedAt = null;
          clearMpReconnectOverlay(fromPeerId);
          if (window.mpGameActive) {
            ps.eliminated = true;
            markMpSlotEliminated(fromPeerId);
            checkLastSurvivor();
          }
        }
        showToast(window.t('mp.playerLeftRoom', 'ℹ️ {user} 離開了房間').replace('{user}', leaverName), 2500);
        break;
      }
      case 'MP_PLAYER_LEFT_FOR_BATTLE': {
        // 一般玩家烙跑去 1v1：標記為自願離開（同 MP_LEAVE 行為 + 不同提示文字）
        const ps = mpPlayersMap.get(fromPeerId);
        const leaverName = (data && data.name) || (ps && ps.name) || '?';
        if (ps) {
          ps.disconnectedAt = null;
          clearMpReconnectOverlay(fromPeerId);
          if (window.mpGameActive) {
            ps.eliminated = true;
            markMpSlotEliminated(fromPeerId);
            checkLastSurvivor();
          }
        }
        showToast(window.t('mp.playerLeftForBattle', 'ℹ️ {user} 烙跑去跟別人 1v1 對戰了').replace('{user}', leaverName), 3000);
        break;
      }
      case 'MP_HOST_LEFT_FOR_BATTLE': {
        // 房主烙跑：顯示專屬警告，並設旗標避免下一秒 RTDB 房間消失時再彈一次「房主已關閉房間」
        const ps = mpPlayersMap.get(fromPeerId);
        const hostName = (data && data.name) || (ps && ps.name) || '?';
        window.__mpSuppressRoomClosedAlert = true;
        showToast(window.t('mp.hostLeftForBattle', '⚠️ 房主 {user} 烙跑去跟別人對戰了！房間已關閉。').replace('{user}', hostName), 4000);
        // 接下來 RTDB listener 會收到 room=null → 走 exitMpMultiPreview
        break;
      }
      case 'MP_ELIMINATED': {
        // 一般情況下 victim = sender；房主廣播斷線淘汰時，victim 由 _victimPeerId 指定
        const victimPid = data._victimPeerId || fromPeerId;
        const p = mpPlayersMap.get(victimPid);
        if (p) { p.eliminated = true; markMpSlotEliminated(victimPid); }
        // 賽後 race：本機 mpEndMatch 已先跑、再收到對方延遲的 MP_ELIMINATED → 把該 peer 從勝者清單移除
        // 並重畫 slot 切回 ELIMINATED overlay（壓在剛剛誤加的 WIN overlay 之上）
        if (window.mpWinnerPeerIds && window.mpWinnerPeerIds.has(victimPid)) {
          window.mpWinnerPeerIds.delete(victimPid);
          renderMpSlots();
        }
        if (data.killerPeerId) {
          if (data.killerPeerId === getMpPeerId()) {
            myKOs = (typeof myKOs === 'number' ? myKOs : 0) + 1;
            const myKoEl = document.getElementById('my-ko-display');
            if (myKoEl) myKoEl.textContent = myKOs;
          } else {
            const k = mpPlayersMap.get(data.killerPeerId);
            if (k) { k.ko = (k.ko || 0) + 1; updateMpSlotStats(data.killerPeerId); }
          }
        }
        checkLastSurvivor();
        break;
      }
      default:
        // 忽略未知 type
        break;
    }
  }

  function startMpHeartbeat() {
    stopMpHeartbeat();
    mpHeartbeatTimer = setInterval(() => {
      broadcastMp({ type: 'MP_HEARTBEAT', t: Date.now(), roundActive: !!window.mpGameActive });
    }, 1000);
    mpHeartbeatCheckTimer = setInterval(() => {
      const now = Date.now();
      // 超過 5 秒沒心跳的連線視為失聯 → 關掉等 manageMpMesh 重連
      for (const [pid, c] of mpConns) {
        const last = mpLastSeen.get(pid) || 0;
        if (last && now - last > 5000) {
          try { c.close(); } catch {}
          mpConns.delete(pid);
          mpReadyState.delete(pid);
        }
      }
      // Phase 9：對「仍在房間但連線已斷」的 peer 嘗試重新發起 mesh 連線
      if (window.mpRoomId) manageMpMesh();
    }, 2000);
  }
  function stopMpHeartbeat() {
    if (mpHeartbeatTimer) { clearInterval(mpHeartbeatTimer); mpHeartbeatTimer = null; }
    if (mpHeartbeatCheckTimer) { clearInterval(mpHeartbeatCheckTimer); mpHeartbeatCheckTimer = null; }
  }
  function closeAllMpConns() {
    for (const c of mpConns.values()) {
      try { c.close(); } catch {}
    }
    mpConns.clear();
    mpLastSeen.clear();
    mpReadyState.clear();
  }

  // ============================================================
  // Phase 5：攻擊目標選擇器 (Tetris 99 風格)
  // ============================================================
  window.recentIncomingAttacks = []; // Phase 6 接攻擊收發時會 push: { from: peerId, lines, t }

  function getMpBoardHeight(p) {
    // 預留：Phase 6 接 MP_STATE 後會有真實 boardHeight；先回 0
    return (p && typeof p.boardHeight === 'number') ? p.boardHeight : 0;
  }

  function pickMpAttackTarget() {
    if (!window.isMpMulti) return null;
    const myPid = getMpPeerId();
    const alive = [];
    for (const v of mpPlayersMap.values()) {
      if (v.peerId === myPid) continue;
      if (v.disconnectedAt) continue;     // Phase 9：斷線緩衝中跳過
      if (v.eliminated) continue;         // Phase 7：已淘汰跳過
      alive.push(v);
    }
    if (!alive.length) return null;
    const strategy = window.mpAttackStrategy || 'RANDOM';
    switch (strategy) {
      case 'COUNTER': {
        const now = Date.now();
        const counts = {};
        for (const a of (window.recentIncomingAttacks || [])) {
          if (!a || !a.from) continue;
          if (now - a.t > 10000) continue;
          counts[a.from] = (counts[a.from] || 0) + (a.lines || 0);
        }
        let best = null, bestN = 0;
        for (const p of alive) {
          const n = counts[p.peerId] || 0;
          if (n > bestN) { best = p; bestN = n; }
        }
        return (best || alive[Math.floor(Math.random() * alive.length)]).peerId;
      }
      case 'THREAT': {
        const sorted = alive.slice().sort((a, b) => (b.ko || 0) - (a.ko || 0));
        return sorted[0].peerId;
      }
      case 'ELIMINATE': {
        const sorted = alive.slice().sort((a, b) => getMpBoardHeight(b) - getMpBoardHeight(a));
        return sorted[0].peerId;
      }
      case 'RANDOM':
      default:
        return alive[Math.floor(Math.random() * alive.length)].peerId;
    }
  }
  window.pickMpAttackTarget = pickMpAttackTarget;
  window.sendMpToPeer = function(peerId, msg) { return sendMpToPeer(peerId, msg); };

  // ============================================================
  // Phase 6：遊戲啟動 / state 廣播 / 攻擊收發
  // ============================================================
  let mpStateInterval = null;

  function maybeStartMpGame() {
    if (!window.isMpMulti || !window.mpIsHost) return;
    if (gameStarted || countdownValue > 0) return;
    if (mpPlayersMap.size < 2) return;
    if (!window.mpIAmReady) return;
    const myPid = getMpPeerId();
    for (const v of mpPlayersMap.values()) {
      if (v.peerId === myPid) continue;
      if (!mpReadyState.get(v.peerId)) return;
    }
    // 全員就緒 → 房主產生 seed 並廣播
    const seed = Math.floor(Math.random() * 1000000);
    const mode = (window.mpHostSettings && window.mpHostSettings.mode) || 'BOMB';
    broadcastMp({ type: 'MP_START', seed, mode });
    mpStartGame(seed, mode);
  }

  function mpStartGame(seed, mode) {
    if (!window.isMpMulti) return;
    if (gameStarted || countdownValue > 0) return;
    // 設定 seed：mySeed + oppSeed 會被 checkBothReady → currentSeed 合併使用
    mySeed = seed;
    oppSeed = 0;
    battleMode = (mode === 'CLASSIC') ? 'CLASSIC' : 'BOMB';
    iAmReady = true;
    oppIsReady = true;
    isMultiplayer = true; // 借用既有 1v1 旗標讓遊戲邏輯運作
    // 新局開始：清掉上局可能殘留的淘汰/重連/板面，並把現役所有人標進這局（中途加入者 inCurrentRound=false）
    for (const v of mpPlayersMap.values()) {
      v.eliminated = false;
      v.disconnectedAt = null;
      v.boardStr = '';
      v.curPiece = null;
      v.inCurrentRound = true;
    }
    clearMpSlotEliminatedUI();
    for (let s = 1; s <= 4; s++) {
      const el = document.getElementById('mp-slot-' + s);
      if (!el) continue;
      const ov = el.querySelector('.mp-reconnect-overlay');
      if (ov) ov.classList.add('hidden');
      // 開新局時，把上一場的 WIN overlay 也清掉
      const wov = el.querySelector('.mp-winner-overlay');
      if (wov) wov.classList.add('hidden');
    }
    // 重設 winner / postMatch 狀態（如果上一場沒被 mpDoLocalPostMatchReset 完全清掉）
    window.mpWinnerPeerIds = null;
    window.mpPostMatchPending = false;
    window.mpGameActive = true;
    window.mpMatchStartAt = Date.now();
    // Phase 8：依勝利條件設定計時上限（線下 startCountdown 才會建 timerInterval；用 window.mpMaxTime 覆寫 1v1 預設 120）
    const wc = (window.mpHostSettings && window.mpHostSettings.winCondition) || 'LAST_SURVIVOR';
    window.mpWinCondition = wc;
    if (wc === 'TIMED_RANK')      window.mpMaxTime = 120;   // 2 分鐘排名
    else if (wc === 'HYBRID')     window.mpMaxTime = 300;   // 5 分鐘保險 + 最後存活
    else                          window.mpMaxTime = 99999; // LAST_SURVIVOR 不計時（給超大值）
    // 注意：🎯 攻擊目標紅框延後到 3 秒倒數結束才畫（startCountdown 內處理），這裡先不呼叫
    // 觸發倒數開局
    if (typeof checkBothReady === 'function') checkBothReady();
    else if (typeof startCountdown === 'function') startCountdown();
    startMpStateBroadcast();
    startMpDisconnectMonitor();
  }

  function startMpStateBroadcast() {
    stopMpStateBroadcast();
    mpStateInterval = setInterval(() => {
      if (!window.isMpMulti || !gameStarted || gameOver) return;
      // 計算 board height（最高有格的列，從上而下）
      let h = 0;
      if (typeof board !== 'undefined' && Array.isArray(board)) {
        const rows = board.length;
        for (let r = 0; r < rows; r++) {
          const row = board[r];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            if (row[c]) { h = rows - r; break; }
          }
          if (h > 0) break;
        }
      }
      // 壓縮 board 成 200 字元字串（10 cols x 20 visible rows，從第 VISIBLE_ROWS 列開始）
      let bStr = '';
      if (typeof board !== 'undefined' && Array.isArray(board)) {
        const startR = (typeof VISIBLE_ROWS === 'number') ? VISIBLE_ROWS : 0;
        const endR = (typeof ROWS === 'number') ? ROWS : board.length;
        const cols = (typeof COLS === 'number') ? COLS : (board[0] ? board[0].length : 10);
        const buf = [];
        for (let r = startR; r < endR; r++) {
          const row = board[r];
          if (!row) { for (let c = 0; c < cols; c++) buf.push('.'); continue; }
          for (let c = 0; c < cols; c++) buf.push(row[c] ? row[c] : '.');
        }
        bStr = buf.join('');
      }
      // 目前正在掉的方塊（讓對手 mini-board 也看得到）
      const cur = (typeof current !== 'undefined' && current) ? { t: current.type, r: current.row, c: current.col, m: current.matrix } : null;
      broadcastMp({
        type: 'MP_STATE',
        boardHeight: h,
        ko: (typeof myKOs === 'number' ? myKOs : 0),
        linesSent: (typeof myLinesSent === 'number' ? myLinesSent : 0),
        b: bStr,
        cur,
        g: (typeof activeGarbage === 'number') ? activeGarbage : 0,
        ng: (typeof nextGarbage === 'number') ? nextGarbage : 0
      });
    }, 100); // 10 Hz：mini-board 動畫流暢度
  }
  function stopMpStateBroadcast() {
    if (mpStateInterval) { clearInterval(mpStateInterval); mpStateInterval = null; }
  }

  function updateMpSlotStats(peerId) {
    // 找該 peer 對應 UI slot（peerId → others sorted by joinOrder → index）
    const others = [];
    for (const v of mpPlayersMap.values()) {
      if (v.slot !== mpMySlot) others.push(v);
    }
    others.sort((a, b) => (a.slot || 0) - (b.slot || 0));
    const idx = others.findIndex(p => p.peerId === peerId);
    if (idx < 0) return;
    const slotEl = document.getElementById('mp-slot-' + (idx + 1));
    if (!slotEl) return;
    const p = others[idx];
    const koB = slotEl.querySelector('.mp-slot-ko b');
    const linesB = slotEl.querySelector('.mp-slot-lines b');
    if (koB) koB.textContent = String(p.ko || 0);
    if (linesB) linesB.textContent = String(p.linesSent || 0);
  }

  function mpEndGame() {
    stopMpStateBroadcast();
    window.mpGameActive = false;
    // 還原旗標讓玩家能回到 mp lobby
    isMultiplayer = false;
    window.mpIAmReady = false;
    iAmReady = false;
    oppIsReady = false;
    updateMpReadyButtonUI();
    updateMpConnStatus();
  }
  window.mpEndGame = mpEndGame;

  // ============================================================
  // Phase 7：KO / 淘汰 / 最後存活者
  // ============================================================
  function markMpSlotEliminated(peerId) {
    const others = [];
    for (const v of mpPlayersMap.values()) {
      if (v.slot !== mpMySlot) others.push(v);
    }
    others.sort((a, b) => (a.slot || 0) - (b.slot || 0));
    const idx = others.findIndex(p => p.peerId === peerId);
    if (idx < 0) return;
    const slotEl = document.getElementById('mp-slot-' + (idx + 1));
    if (!slotEl) return;
    slotEl.classList.add('eliminated');
    slotEl.style.filter = 'grayscale(1)';
    const overlay = slotEl.querySelector('.mp-eliminated-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.textContent = window.t('multiplayer.eliminated', '淘汰');
    }
  }

  function clearMpSlotEliminatedUI() {
    for (let s = 1; s <= 4; s++) {
      const el = document.getElementById('mp-slot-' + s);
      if (!el) continue;
      el.classList.remove('eliminated');
      el.style.filter = '';
      const overlay = el.querySelector('.mp-eliminated-overlay');
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function checkLastSurvivor() {
    if (!window.mpGameActive) return;
    const myPid = getMpPeerId();
    let myEliminated = false;
    const aliveOthers = [];
    for (const v of mpPlayersMap.values()) {
      if (v.peerId === myPid) { myEliminated = !!v.eliminated; continue; }
      // 只算這局有參賽的玩家；中途加入的觀戰者不算「對手」
      if (!v.inCurrentRound) continue;
      if (!v.eliminated && !v.disconnectedAt) aliveOthers.push(v);
    }
    // 我還活著且其他人全沒了 → 我贏
    if (!myEliminated && aliveOthers.length === 0 && !gameOver) {
      setTimeout(() => mpEndMatch('WIN'), 600);
      return;
    }
    // 我被淘汰：等到對手只剩 0 或 1 人時 → 整場結束，跑 finalize（mpEndMatch）
    // （aliveOthers === 1：最後存活者 = 對手；aliveOthers === 0：全滅 / 平手）
    if (myEliminated && aliveOthers.length <= 1) {
      setTimeout(() => {
        if (window.mpGameActive) mpEndMatch('LOSE');
      }, 600);
    }
  }

  function mpEndMatch(result) {
    if (!window.mpGameActive && !window.isMpMulti) return;
    gameOver = true;
    if (typeof battleBgm !== 'undefined') battleBgm.pause();
    stopMpStateBroadcast();
    stopMpDisconnectMonitor();
    window.mpGameActive = false;
    // 注意：isMultiplayer 維持 true，讓 draw() 走 WIN/LOSE 結算畫面（mpDoLocalPostMatchReset 才會還原為 false）
    iAmReady = false;
    oppIsReady = false;
    window.mpIAmReady = false;
    window.mpIsSpectatorWaiting = false;
    // 廣播自己 ready=false（讓對方 status 重新計算）
    try { broadcastMp({ type: 'MP_READY', ready: false }); } catch {}
    mpReadyState.clear();
    // 進入「賽後待 READY」狀態：保留 mpPlayersMap 中每人最終 boardStr / curPiece / eliminated / inCurrentRound，
    // 不清掉淘汰旗標 UI，等該玩家自己按 READY 時，他的 slot 才會切回 READY 文字（見 MP_READY case 與 mpDoLocalPostMatchReset）
    window.mpPostMatchPending = true;
    // 計時超時 → 依 KO/Lines 排名
    let rankingMsg = '';
    let timedRankTop1PeerId = null;
    if (matchEndReason === 'TIMEOUT') {
      const myPid = getMpPeerId();
      const all = [];
      // 加入自己
      all.push({ peerId: myPid, name: getMpName(), ko: (typeof myKOs === 'number' ? myKOs : 0), linesSent: (typeof myLinesSent === 'number' ? myLinesSent : 0), eliminated: false });
      // 加入其他人
      for (const v of mpPlayersMap.values()) {
        if (v.peerId === myPid) continue;
        all.push({ peerId: v.peerId, name: v.name || '?', ko: v.ko || 0, linesSent: v.linesSent || 0, eliminated: !!v.eliminated });
      }
      // 已淘汰的排在後面；活著的依 KO desc → linesSent desc
      all.sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        if ((b.ko || 0) !== (a.ko || 0)) return (b.ko || 0) - (a.ko || 0);
        return (b.linesSent || 0) - (a.linesSent || 0);
      });
      const myRank = all.findIndex(p => p.peerId === myPid) + 1;
      result = (myRank === 1) ? 'WIN' : 'LOSE';
      timedRankTop1PeerId = all[0] ? all[0].peerId : null;
      // TIMED_RANK 結算文字用排名版本
      const headLine = (myRank === 1)
        ? window.t('mp.timedWin', '🏆 第 1 名！')
        : window.t('mp.timedRank', '你第 {rank} 名').replace('{rank}', String(myRank));
      rankingMsg = headLine + '\n' + all.map((p, i) => `${i + 1}. ${p.name}  KO ${p.ko}  L ${p.linesSent}`).join('\n');
    }
    // 顯示結算 toast
    let msgBase;
    if (rankingMsg) {
      msgBase = '';
    } else {
      msgBase = result === 'WIN' ? window.t('mp.youWin', '🎉 你是最後存活者！')
              : result === 'LOSE' ? window.t('mp.youLose', '💀 你被淘汰')
              : window.t('mp.matchEnd', '對戰結束');
    }
    if (typeof showToast === 'function') showToast((msgBase + rankingMsg) || window.t('mp.matchEnd', '對戰結束'), 5000);
    matchEndReason = null;
    // 設定 matchResult 讓 draw() 走 YOU WIN / YOU LOSE / DRAW 結算畫面
    matchResult = (result === 'WIN' || result === 'LOSE' || result === 'DRAW') ? result : null;
    // 累計 MATCH SCORE 面板數據（我贏 / 總場）；左 my-wins-el = WINS (綠)，右 opp-wins-el = GAMES (紅)
    window.mpTotalMatches = (window.mpTotalMatches || 0) + 1;
    if (matchResult === 'WIN') window.mpMyWins = (window.mpMyWins || 0) + 1;
    {
      const myWE2 = document.getElementById('my-wins-el');
      const opWE2 = document.getElementById('opp-wins-el');
      if (myWE2) myWE2.textContent = String(window.mpMyWins);
      if (opWE2) opWE2.textContent = String(window.mpTotalMatches);
    }
    // 計算勝者 peerId（給其他人 slot 上的 WIN overlay 用）
    // 自己不放 winner set（自己的 WIN 由主畫面的 YOU WIN 大字顯示）
    window.mpWinnerPeerIds = new Set();
    const myPidForWinner = getMpPeerId();
    if (timedRankTop1PeerId) {
      // TIMED_RANK / HYBRID 計時用：第 1 名是勝者
      if (timedRankTop1PeerId !== myPidForWinner) window.mpWinnerPeerIds.add(timedRankTop1PeerId);
    } else {
      // LAST_SURVIVOR：未淘汰、未斷線的就是勝者
      for (const v of mpPlayersMap.values()) {
        if (v.peerId === myPidForWinner) continue;
        if (!v.eliminated && !v.disconnectedAt) window.mpWinnerPeerIds.add(v.peerId);
      }
    }
    // 播勝負音效（沿用 1v1）
    if (matchResult === 'WIN') { try { playSound('win'); } catch {} }
    else if (matchResult === 'LOSE') { try { playSound('lose'); } catch {} }
    // 保留 WIN/LOSE 結算畫面與自己盤面，等玩家自己按 READY 才走 mpDoLocalPostMatchReset 清版面
    // 但 READY 按鈕本身要解鎖（從 SURRENDER 切回 READY 文字、可點）
    const rBtnEnd = document.getElementById('ready-btn');
    if (rBtnEnd) {
      rBtnEnd.disabled = false;
      rBtnEnd.style.cursor = 'pointer';
      rBtnEnd.style.opacity = '1';
    }
    updateMpReadyButtonUI();
    updateMpConnStatus();
    // 對戰結束：房主設定面板重新亮起來（mpIAmReady 已是 false）；倒計時器也回到 lobby 顯示
    if (typeof syncMpHostPanelUI === 'function') syncMpHostPanelUI();
    if (typeof updateMpLobbyTimerDisplay === 'function') updateMpLobbyTimerDisplay();
    // 對戰結束：清掉攻擊目標 🎯 紅框
    if (typeof updateMpTargetIndicator === 'function') updateMpTargetIndicator();
    renderMpSlots(); // 重畫一次，眾人 final board 都保留
  }
  window.mpEndMatch = mpEndMatch;

  // 玩家自己按下 READY 後才執行：清自己的盤面 + 結算面板 + KO/Lines + 淘汰標記
  // 對手的 mini-board 由各自的 MP_READY case 自行清掉（在他們按 READY 時）
  function mpDoLocalPostMatchReset() {
    window.mpPostMatchPending = false;
    gameOver = false;
    matchResult = null;
    isMultiplayer = false; // 還原 1v1 旗標
    // 注意：不清其他 peer 的 eliminated overlay，他們各自按 READY 時才清
    if (typeof board !== 'undefined') {
      board = (typeof createBoard === 'function') ? createBoard() : board;
    }
    activeGarbage = 0;
    nextGarbage = 0;
    isKOed = false;
    gameStarted = false;
    current = null;
    queue = [];
    holdType = null;
    holdUsed = false;
    piecePool = [];
    myPieceIndex = 0;
    // 我的 KO/lines 顯示歸零
    myKOs = 0; myLinesSent = 0;
    const myKoEl = document.getElementById('my-ko-display'); if (myKoEl) myKoEl.textContent = '0';
    const myLinesEl = document.getElementById('my-lines-sent-display'); if (myLinesEl) myLinesEl.textContent = '0';
    // 自己這格 mpPlayersMap 也清掉，避免下一場 inCurrentRound 殘留
    const myPid = (typeof getMpPeerId === 'function') ? getMpPeerId() : null;
    if (myPid) {
      const me = mpPlayersMap.get(myPid);
      if (me) {
        me.eliminated = false;
        me.boardStr = '';
        me.curPiece = null;
        me.inCurrentRound = false;
        me.g = 0; me.ng = 0;
      }
    }
    if (typeof renderPanels === 'function') { try { renderPanels(); } catch {} }
  }
  window.mpDoLocalPostMatchReset = mpDoLocalPostMatchReset;

  // ============================================================
  // Phase 9：斷線重連（30 秒緩衝）
  // ============================================================
  let mpDisconnectMonitor = null;

  function getMpUiSlotForPeer(peerId) {
    const others = [];
    for (const v of mpPlayersMap.values()) {
      if (v.slot !== mpMySlot) others.push(v);
    }
    others.sort((a, b) => (a.slot || 0) - (b.slot || 0));
    const idx = others.findIndex(p => p.peerId === peerId);
    return idx >= 0 ? (idx + 1) : -1;
  }

  function showMpReconnectOverlay(peerId, seconds) {
    const s = getMpUiSlotForPeer(peerId);
    if (s < 0) return;
    const slotEl = document.getElementById('mp-slot-' + s);
    if (!slotEl) return;
    const overlay = slotEl.querySelector('.mp-reconnect-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const t = overlay.querySelector('.mp-reconnect-timer');
      if (t) t.textContent = String(seconds);
    }
  }
  function clearMpReconnectOverlay(peerId) {
    const s = getMpUiSlotForPeer(peerId);
    if (s < 0) return;
    const slotEl = document.getElementById('mp-slot-' + s);
    if (!slotEl) return;
    const overlay = slotEl.querySelector('.mp-reconnect-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function startMpDisconnectMonitor() {
    stopMpDisconnectMonitor();
    mpDisconnectMonitor = setInterval(() => {
      if (!window.isMpMulti) return;
      const now = Date.now();
      for (const v of mpPlayersMap.values()) {
        if (!v.disconnectedAt) continue;
        const remain = Math.max(0, 30 - Math.floor((now - v.disconnectedAt) / 1000));
        showMpReconnectOverlay(v.peerId, remain);
        if (remain <= 0 && !v.eliminated) {
          // 超時：宣告淘汰（只有房主廣播，避免重複）
          v.eliminated = true;
          markMpSlotEliminated(v.peerId);
          if (window.mpIsHost && window.mpGameActive) {
            broadcastMp({ type: 'MP_ELIMINATED', killerPeerId: null, reason: 'DISCONNECT_TIMEOUT', _victimPeerId: v.peerId });
          }
          checkLastSurvivor();
        }
      }
    }, 1000);
  }
  function stopMpDisconnectMonitor() {
    if (mpDisconnectMonitor) { clearInterval(mpDisconnectMonitor); mpDisconnectMonitor = null; }
  }
  window.startMpDisconnectMonitor = startMpDisconnectMonitor;
  window.stopMpDisconnectMonitor = stopMpDisconnectMonitor;

  function updateMpTargetIndicator() {
    if (!window.isMpMulti) return;
    // 先全部隱藏 + 清掉 is-target 紅框
    document.querySelectorAll('.mp-target-indicator').forEach(el => el.classList.add('hidden'));
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById('mp-slot-' + i);
      if (el) el.classList.remove('is-target');
    }
    // 只在「對戰中且 3 秒倒數已結束」才顯示 🎯：避免大廳 / 倒數中就先框紅色目標
    if (!window.mpGameActive || countdownValue > 0) return;
    // 不論策略（包含 RANDOM）都標一個 🎯，讓玩家進到對戰時就看得到目前鎖定的對手；
    // RANDOM 每次實際攻擊還是會重抽，但畫面上至少有個視覺提示
    const targetPid = pickMpAttackTarget();
    if (!targetPid) return;
    // peerId → UI slot 1~4
    const others = [];
    for (const v of mpPlayersMap.values()) {
      if (v.slot !== mpMySlot) others.push(v);
    }
    others.sort((a, b) => (a.slot || 0) - (b.slot || 0));
    const idx = others.findIndex(p => p.peerId === targetPid);
    if (idx >= 0) {
      const slotEl = document.getElementById('mp-slot-' + (idx + 1));
      if (slotEl) {
        const ind = slotEl.querySelector('.mp-target-indicator');
        if (ind) ind.classList.remove('hidden');
        slotEl.classList.add('is-target');
      }
    }
    // 沒有 target 的 slot 移除 is-target class
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById('mp-slot-' + i);
      if (!el) continue;
      const ind = el.querySelector('.mp-target-indicator');
      if (ind && ind.classList.contains('hidden')) el.classList.remove('is-target');
    }
  }

  function renderMpSlots() {
    // 取得「除了我以外」的所有玩家，按 joinOrder（server slot）排序
    const others = [];
    for (const v of mpPlayersMap.values()) {
      if (v.slot !== mpMySlot) others.push(v);
    }
    others.sort((a, b) => (a.slot || 0) - (b.slot || 0));
    for (let i = 0; i < 4; i++) {
      const slotEl = document.getElementById('mp-slot-' + (i + 1));
      if (!slotEl) continue;
      const p = others[i] || null;
      const nameEl = slotEl.querySelector('.mp-slot-name');
      const koB = slotEl.querySelector('.mp-slot-ko b');
      const linesB = slotEl.querySelector('.mp-slot-lines b');
      const canvas = slotEl.querySelector('canvas.mp-mini-board');
      if (p) {
        slotEl.classList.remove('empty');
        if (nameEl) nameEl.textContent = p.name || '—';
        // 賽後 WIN overlay：只要該 peer 還在勝者清單就顯示「WIN」（綠色發光），
        // 該 peer 自己按 READY 後（MP_READY case 會把他從清單移除）才會消失
        const winOverlay = slotEl.querySelector('.mp-winner-overlay');
        if (winOverlay) {
          const isWinner = !!(window.mpWinnerPeerIds && window.mpWinnerPeerIds.has(p.peerId));
          winOverlay.classList.toggle('hidden', !isWinner);
        }
        if (canvas) {
          const anyRoundActive = window.mpGameActive || isAnyMpRoundActive();
          if (p.eliminated) {
            // 留著上次的板面快照 + .mp-eliminated-overlay 覆蓋（由 markMpSlotEliminated 處理）
            drawMpMiniBoardPlay(canvas, p.boardStr || '', null, { g: p.g || 0, ng: p.ng || 0 });
          } else if (p.boardStr && p.inCurrentRound) {
            // 有實際板面資料 → 畫真實板面
            drawMpMiniBoardPlay(canvas, p.boardStr, p.curPiece || null, { g: p.g || 0, ng: p.ng || 0 });
          } else if (anyRoundActive && !window.mpPostMatchPending) {
            // 有人在打但這位是觀戰者 → 顯示「WAITING FOR ROUND END」（賽後不要顯示這個）
            drawMpMiniBoardSpectatorText(canvas);
          } else {
            // 大廳狀態 → READY/WAITING text
            drawMpMiniBoardReadyText(canvas, !!mpReadyState.get(p.peerId));
          }
        }
      } else {
        slotEl.classList.add('empty');
        if (nameEl) nameEl.textContent = '—';
        if (koB) koB.textContent = '0';
        if (linesB) linesB.textContent = '0';
        if (canvas) {
          const c = canvas.getContext('2d');
          c.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }

  function drawMpMiniBoardPlay(canvas, boardStr, curPiece, gInfo) {
    if (!canvas) return;
    const c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    // 背景
    c.fillStyle = 'rgba(6,0,79,0.6)';
    c.fillRect(0, 0, w, h);
    const cols = (typeof COLS === 'number') ? COLS : 10;
    const rows = boardStr ? Math.floor(boardStr.length / cols) : 20;
    const cell = Math.min(Math.floor(w / cols), Math.floor(h / rows));
    const ox = Math.floor((w - cell * cols) / 2);
    const oy = Math.floor((h - cell * rows) / 2);
    // 垃圾條（畫在 mini-board 左邊緣，紅 = activeGarbage、黃 = nextGarbage）
    const oppG = (gInfo && gInfo.g) || 0;
    const oppNg = (gInfo && gInfo.ng) || 0;
    if (oppG > 0 || oppNg > 0) {
      const totalG = Math.min(oppG + oppNg, rows);
      const activeHeight = Math.min(oppG, rows) * cell;
      const totalHeight = totalG * cell;
      const barW = 3;
      const barX = Math.max(0, ox - barW - 1);
      if (oppG > 0) {
        c.fillStyle = '#ff0d62';
        c.fillRect(barX, oy + cell * rows - activeHeight, barW, activeHeight);
      }
      if (oppNg > 0) {
        const nextHeight = totalHeight - activeHeight;
        c.fillStyle = '#f7dd16';
        c.fillRect(barX, oy + cell * rows - totalHeight, barW, nextHeight);
      }
    }
    // 畫格線（水平 + 垂直）
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    c.beginPath();
    for (let r = 0; r <= rows; r++) {
      c.moveTo(ox + 0.5, oy + r * cell + 0.5);
      c.lineTo(ox + cell * cols + 0.5, oy + r * cell + 0.5);
    }
    for (let col = 0; col <= cols; col++) {
      c.moveTo(ox + col * cell + 0.5, oy + 0.5);
      c.lineTo(ox + col * cell + 0.5, oy + cell * rows + 0.5);
    }
    c.stroke();
    // 畫盤面
    if (boardStr) {
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          const ch = boardStr[r * cols + col];
          if (!ch || ch === '.') continue;
          const color = COLORS[ch] || '#ffffff';
          c.fillStyle = color;
          c.fillRect(ox + col * cell, oy + r * cell, cell - 1, cell - 1);
        }
      }
    }
    // 畫掉落中方塊
    if (curPiece && curPiece.m) {
      const color = COLORS[curPiece.t] || '#ffffff';
      c.fillStyle = color;
      const startR = (typeof VISIBLE_ROWS === 'number') ? VISIBLE_ROWS : 0;
      for (let r = 0; r < curPiece.m.length; r++) {
        for (let col = 0; col < curPiece.m[r].length; col++) {
          if (!curPiece.m[r][col]) continue;
          const drawR = (curPiece.r + r) - startR;
          const drawC = curPiece.c + col;
          if (drawR < 0 || drawR >= rows || drawC < 0 || drawC >= cols) continue;
          c.fillRect(ox + drawC * cell, oy + drawR * cell, cell - 1, cell - 1);
        }
      }
    }
  }

  function drawMpMiniBoardForPeer(peerId) {
    const others = [];
    for (const v of mpPlayersMap.values()) {
      if (v.slot !== mpMySlot) others.push(v);
    }
    others.sort((a, b) => (a.slot || 0) - (b.slot || 0));
    const idx = others.findIndex(p => p.peerId === peerId);
    if (idx < 0) return;
    const slotEl = document.getElementById('mp-slot-' + (idx + 1));
    if (!slotEl) return;
    const canvas = slotEl.querySelector('canvas.mp-mini-board');
    if (!canvas) return;
    const p = others[idx];
    drawMpMiniBoardPlay(canvas, p.boardStr || '', p.curPiece || null, { g: p.g || 0, ng: p.ng || 0 });
  }

  function isAnyMpRoundActive() {
    for (const v of mpPlayersMap.values()) {
      if (v.roundActive) return true;
    }
    return false;
  }

  function drawMpMiniBoardSpectatorText(canvas) {
    if (!canvas) return;
    const c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(6,0,79,0.8)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#38bdee';
    c.font = '900 13px Arial';
    c.fillText('WAITING', w / 2, h / 2 - 18);
    c.fillText('FOR ROUND', w / 2, h / 2);
    c.fillText('END', w / 2, h / 2 + 18);
  }

  function drawMpMiniBoardReadyText(canvas, ready) {
    if (!canvas) return;
    const c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(6,0,79,0.8)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (ready) {
      c.fillStyle = '#48d62f';
      c.font = '900 18px Arial';
      c.fillText('READY !', w / 2, h / 2);
    } else {
      c.fillStyle = '#f2f2f2';
      c.font = '900 14px Arial';
      c.fillText('WAITING...', w / 2, h / 2 - 8);
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.font = '700 11px Arial';
      c.fillText('NOT READY', w / 2, h / 2 + 10);
    }
  }

  // 將勝利條件 → mm:ss / ∞ 字串，供 lobby 與倒數開局兩處共用
  function mpWinCondToTimerText(wc) {
    if (wc === 'TIMED_RANK') return '02:00';
    if (wc === 'HYBRID')     return '05:00';
    return '∞'; // LAST_SURVIVOR
  }
  function updateMpLobbyTimerDisplay() {
    if (!window.isMpMulti) return;
    // 對戰中（含 3 秒倒數）不要覆寫；但賽後 postMatchPending（gameStarted 仍 true）允許更新
    if (window.mpGameActive || countdownValue > 0) return;
    if (gameStarted && !window.mpPostMatchPending) return;
    const timerEl = document.getElementById('battle-timer');
    if (!timerEl) return;
    const wc = (window.mpHostSettings && window.mpHostSettings.winCondition) || 'LAST_SURVIVOR';
    timerEl.textContent = mpWinCondToTimerText(wc);
  }
  window.updateMpLobbyTimerDisplay = updateMpLobbyTimerDisplay;

  function syncMpHostPanelUI() {
    const codeEl = document.getElementById('mp-room-code');
    if (codeEl) codeEl.textContent = window.mpHostSettings.roomCode || '------';
    document.querySelectorAll('#mp-host-panel .mode-btn[data-mp-mode]').forEach(b => {
      b.classList.toggle('selected', b.dataset.mpMode === window.mpHostSettings.mode);
    });
    document.querySelectorAll('#mp-wincond-group [data-wincond]').forEach(b => {
      b.classList.toggle('selected', b.dataset.wincond === window.mpHostSettings.winCondition);
    });
    // 隨著房主目前選擇的 winCondition 即時更新 lobby 倒計時器顯示
    updateMpLobbyTimerDisplay();
    const readonly = !window.mpIsHost;
    const hostLocked = !!window.mpIAmReady; // 房主已 READY → 凍結設定（僅鎖房主自己）
    document.querySelectorAll('#mp-host-panel .mode-btn[data-mp-mode], #mp-wincond-group [data-wincond]').forEach(b => {
      if (readonly) {
        // 非房主：完全不能改，游標一律「禁止」
        b.style.opacity = '0.7';
        b.style.cursor = 'not-allowed';
      } else if (hostLocked) {
        // 房主已 READY：先取消才能改
        b.style.opacity = '0.45';
        b.style.cursor = 'not-allowed';
      } else {
        b.style.opacity = '';
        b.style.cursor = 'pointer';
      }
    });
  }

  async function pushMpHostSettings() {
    if (!window.mpRoomId || !window.mpIsHost) return;
    try {
      await rtdb.ref('/mpRooms/' + window.mpRoomId).update({
        mode: window.mpHostSettings.mode,
        winCondition: window.mpHostSettings.winCondition
      });
    } catch (e) { console.warn('pushMpHostSettings err', e); }
  }

  // 提供給 INVITE 流程：受邀者進來時不要 auto-create，要 join 邀請者的房間
  window.enterMpMultiAndJoin = async function(code) {
    if (!code) return false;
    if (isMultiplayer) return false; // 1v1 中拒絕
    if (window.isMpMulti) {
      // 換房：先廣播 MP_LEAVE，再徹底清舊 mesh 連線與心跳，避免殘留 heartbeat 害新房 mpPlayersMap 亂掉
      try { broadcastMp({ type: 'MP_LEAVE', name: getMpName() }); } catch {}
      window.__mpSuppressRoomClosedAlert = true;
      await leaveMpRoom();
      try { stopMpHeartbeat(); } catch {}
      try { closeAllMpConns(); } catch {}
      mpPlayersMap.clear();
      // 重啟心跳供新房使用
      try { startMpHeartbeat(); } catch {}
      return joinMpRoomByCode(code);
    }
    enterMpMultiPreview({ skipAutoCreate: true });
    return joinMpRoomByCode(code);
  };

  function enterMpMultiPreview(opts) {
    opts = opts || {};
    if (isMultiplayer) return;
    if (isPracticeMode) {
      const pb = document.getElementById('practice-btn');
      if (pb) pb.click();
    }
    window.isMpMulti = true;
    document.body.classList.add('battle-mode'); // 隱藏 EN 切換鈕，與 1v1 對戰一致
    const layout = document.getElementById('layout');
    // 同時套用 1v1 的 is-multiplayer (排版) 與 mp-multi 標記 (右邊網格 override)
    if (layout) {
      layout.classList.add('is-multiplayer');
      layout.classList.add('is-mp-multi');
    }
    // 只隱藏排行榜（leaderboard-container）。leaderboard-column 殼留著占位，
    // 才能維持左翼 540px 對稱結構，未來 Phase 2 在這放房主設定面板
    const lbContainer = document.getElementById('leaderboard-container');
    if (lbContainer) lbContainer.style.display = 'none';
    // 隱藏單機計分面板（有 inline display:flex 必須用 style 蓋過）
    const singleUI = document.getElementById('singleplayer-ui');
    if (singleUI) singleUI.style.display = 'none';
    // 顯示 4 槽網格與攻擊策略條
    const grid = document.getElementById('mp-opp-grid');
    if (grid) { grid.classList.remove('hidden'); grid.style.display = 'grid'; }
    const strat = document.getElementById('mp-attack-strategy');
    if (strat) { strat.classList.remove('hidden'); strat.style.display = 'flex'; }
    // 顯示房主設定面板（取代排行榜位置）
    const hostPanel = document.getElementById('mp-host-panel');
    if (hostPanel) hostPanel.classList.remove('hidden');
    // 顯示自己側的 KO / LINES SENT（複用 1v1 的 .mp-only 元件）
    document.querySelectorAll('.mp-only').forEach(el => el.classList.remove('hidden'));
    // Phase 4：啟動 mesh 心跳（連線在 RTDB listener 進來後 manageMpMesh 才會建立）
    window.mpIAmReady = false;
    startMpHeartbeat();
    // Phase 3：自動建立 RTDB 房間（成為房主）。失敗時退回本地 fallback code。
    // 若是被邀請進來（skipAutoCreate）則交給呼叫端 joinMpRoomByCode
    if (!opts.skipAutoCreate) {
      createMpRoom().then(ok => {
        if (!ok) {
          if (!window.mpHostSettings.roomCode) window.mpHostSettings.roomCode = generateMpRoomCode();
          syncMpHostPanelUI();
        }
        updateMpConnStatus();
      });
    }
    // 立即顯示「等待玩家加入…」
    const el0 = document.getElementById('conn-status');
    if (el0) { el0.textContent = window.t('multiplayer.waitingPlayers', 'Status: 等待玩家加入…'); el0.style.color = 'var(--O)'; }
    // 顯示計時器與離開按鈕（重用 1v1 既有元件、既有位置）
    const vsTimer = document.getElementById('vs-timer');
    if (vsTimer) vsTimer.classList.remove('hidden');
    const leaveBtn = document.getElementById('mp-leave-btn');
    if (leaveBtn) leaveBtn.classList.remove('hidden');
    // 沿用 1v1 的 settings-container 重新定位（這樣 FPS / EN 按鈕會搬到 layout 內，
    // LEAVE ROOM 與 FPS 按鈕並排，跟 AI 對戰一模一樣）
    const settingsContainer = document.getElementById('settings-container');
    const fpsBtn = document.getElementById('fps-mode-btn');
    const isMobileLayoutEnter = window.matchMedia('(max-width: 820px)').matches;
    // ONLINE 框：搬進 #layout 本體（會跟 layout 一起 transform scale），用絕對定位放在
    // LEAVE ROOM 下方右靠的位置——和原本未縮放前視覺一致，但這次會跟著縮放
    const onlinePanelMp = document.getElementById('online-panel');
    if (onlinePanelMp && layout && !isMobileLayoutEnter) {
      window.__mpOnlineOriginalParent = onlinePanelMp.parentElement;
      window.__mpOnlineOriginalNext = onlinePanelMp.nextElementSibling;
      window.__mpOnlineOriginalStyles = {
        position: onlinePanelMp.style.position,
        right: onlinePanelMp.style.right,
        top: onlinePanelMp.style.top,
        width: onlinePanelMp.style.width,
        maxHeight: onlinePanelMp.style.maxHeight,
        margin: onlinePanelMp.style.margin,
        zIndex: onlinePanelMp.style.zIndex
      };
      layout.appendChild(onlinePanelMp);
      onlinePanelMp.style.position = 'absolute';
      onlinePanelMp.style.right = '0';
      onlinePanelMp.style.top = '0';
      onlinePanelMp.style.width = '220px';
      onlinePanelMp.style.maxHeight = '420px';
      onlinePanelMp.style.margin = '0';
      onlinePanelMp.style.zIndex = '90';
    }
    if (settingsContainer && layout && !isMobileLayoutEnter) {
      window.__mpSettingsOriginalParent = settingsContainer.parentElement;
      window.__mpSettingsOriginalNext = settingsContainer.nextElementSibling;
      layout.appendChild(settingsContainer);
      settingsContainer.style.top = '-60px';
      settingsContainer.style.right = '175px';
      settingsContainer.style.width = '160px';
      if (fpsBtn) {
        fpsBtn.style.width = '160px';
        fpsBtn.style.padding = '10px 0';
        fpsBtn.style.textAlign = 'center';
        fpsBtn.style.fontSize = '14px';
        fpsBtn.style.borderRadius = '25px';
        fpsBtn.style.background = 'transparent';
        fpsBtn.style.backdropFilter = 'blur(4px)';
      }
    }
    // 把邀請框從左下 network-section 搬到對戰 layout 內，定位於高幀率按鈕左邊（橫式）
    {
      const inviteToastMp = document.getElementById('invite-toast');
      if (inviteToastMp && layout && !isMobileLayoutEnter) {
        window.__mpInviteToastOriginalParent = inviteToastMp.parentElement;
        window.__mpInviteToastOriginalNext = inviteToastMp.nextElementSibling;
        window.__mpInviteToastOriginalStyles = {
          position: inviteToastMp.style.position,
          margin: inviteToastMp.style.margin,
          marginTop: inviteToastMp.style.marginTop
        };
        layout.appendChild(inviteToastMp);
        inviteToastMp.classList.add('horizontal');
        inviteToastMp.style.position = 'absolute';
        inviteToastMp.style.margin = '0';
      }
    }
    // MULTIPLAYER 框內容切換成 1v1 對戰模式樣子
    const mpInputGroupMp = document.getElementById('mp-input-group');
    if (mpInputGroupMp) mpInputGroupMp.style.display = 'none';
    const mpReadyGroupMp = document.getElementById('mp-ready-group');
    if (mpReadyGroupMp) mpReadyGroupMp.style.display = 'flex';
    const aiBtnMp = document.getElementById('ai-btn');
    if (aiBtnMp) aiBtnMp.classList.add('hidden');
    const scoreboardMp = document.getElementById('scoreboard');
    if (scoreboardMp) scoreboardMp.style.display = 'block';
    // 多人對戰：MATCH SCORE 改成「我贏(綠) / 總場(紅)」（標籤一律英文，不跟著 i18n 切換）
    {
      const slLeft = document.getElementById('score-label-left');
      const slRight = document.getElementById('score-label-right');
      const myWE = document.getElementById('my-wins-el');
      const opWE = document.getElementById('opp-wins-el');
      if (slLeft) { slLeft.textContent = 'WINS'; slLeft.title = ''; }
      if (slRight) { slRight.textContent = 'GAMES'; slRight.title = ''; }
      // 左格 my-wins-el = 我的勝場（綠色，已是 var(--S)）；右格 opp-wins-el = 總場（紅色，已是 var(--Z)）
      if (myWE) myWE.textContent = String(window.mpMyWins || 0);
      if (opWE) opWE.textContent = String(window.mpTotalMatches || 0);
    }
    // 多人對戰：數字鍵 1~4 用來切換攻擊目標策略，所以不顯示 1v1 的 emoji hotkey 提示
    const emojiPanelMp = document.getElementById('emoji-hint-panel');
    if (emojiPanelMp) emojiPanelMp.classList.add('hidden');
    // 按鈕變狀態
    const btn = document.getElementById('multiplayer-btn');
    if (btn) {
      btn.textContent = window.t('multiplayer.leaveRoom', '🚪 離開房間');
      btn.style.background = 'var(--I)';
      btn.style.color = 'var(--bg)';
    }
    // 進入多人房間 → 廣播狀態給其他線上玩家，讓他們看到我「多人房間中」並停用 INVITE 按鈕
    if (typeof updateMyActivity === 'function') updateMyActivity('MP_ROOM');
    if (typeof fitLayout === 'function') fitLayout();
  }

  function exitMpMultiPreview() {
    // 自願離開：先廣播 MP_LEAVE 讓其他玩家立刻清掉重連倒數（mesh 連線馬上就要關了，動作要快）
    try {
      if (window.isMpMulti && typeof broadcastMp === 'function') {
        broadcastMp({ type: 'MP_LEAVE', name: (typeof getMpName === 'function' ? getMpName() : (currentPlayer || '?')) });
      }
    } catch {}
    // ⚠️ 重要：state flags 一律先重置（之前放在後面，導致中途被踢出時 if (!isMultiplayer) 守衛跳過 DOM 還原）
    window.isMpMulti = false;
    window.mpWinnerPeerIds = null;
    window.mpPostMatchPending = false;
    window.mpGameActive = false;
    window.mpIAmReady = false;
    window.mpIsSpectatorWaiting = false;
    isMultiplayer = false;
    iAmReady = false;
    oppIsReady = false;
    // 對戰中被踢出 → 把局面狀態也一起清掉，回到 PRESS ENTER 起始畫面
    gameOver = false;
    matchResult = null;
    isKOed = false;
    gameStarted = false;
    if (typeof createBoard === 'function') board = createBoard();
    current = null;
    queue = [];
    holdType = null;
    holdUsed = false;
    piecePool = []; myPieceIndex = 0;
    activeGarbage = 0;
    nextGarbage = 0;
    myKOs = 0; myLinesSent = 0;
    const myKoElX = document.getElementById('my-ko-display'); if (myKoElX) myKoElX.textContent = '0';
    const myLinesElX = document.getElementById('my-lines-sent-display'); if (myLinesElX) myLinesElX.textContent = '0';
    if (typeof renderPanels === 'function') { try { renderPanels(); } catch {} }
    // 還原 EN 切換鈕（離開多人房 → 一律可以切語系）
    document.body.classList.remove('battle-mode');
    const layout = document.getElementById('layout');
    if (layout) {
      layout.classList.remove('is-mp-multi');
      layout.classList.remove('is-multiplayer');
    }
    const lbContainer = document.getElementById('leaderboard-container');
    if (lbContainer) lbContainer.style.display = 'flex';
    const singleUI = document.getElementById('singleplayer-ui');
    if (singleUI) singleUI.style.display = 'flex';
    const grid = document.getElementById('mp-opp-grid');
    if (grid) { grid.style.display = ''; grid.classList.add('hidden'); }
    const strat = document.getElementById('mp-attack-strategy');
    if (strat) { strat.style.display = ''; strat.classList.add('hidden'); }
    const hostPanel = document.getElementById('mp-host-panel');
    if (hostPanel) hostPanel.classList.add('hidden');
    // 還原 .mp-only 隱藏狀態（KO / LINES SENT 等等）
    document.querySelectorAll('.mp-only').forEach(el => el.classList.add('hidden'));
    // Phase 4：關掉 mesh 連線與心跳。closeAllMpConns 延遲一拍，讓上面剛廣播的 MP_LEAVE 有機會送出去
    stopMpHeartbeat();
    setTimeout(() => { try { closeAllMpConns(); } catch {} }, 250);
    // Phase 6：關掉 state 廣播 & 還原 1v1 旗標
    stopMpStateBroadcast();
    stopMpDisconnectMonitor();
    // 清掉所有 reconnect / eliminated / winner overlay 與淘汰旗標的 UI
    for (let s = 1; s <= 4; s++) {
      const el = document.getElementById('mp-slot-' + s);
      if (!el) continue;
      const ov = el.querySelector('.mp-reconnect-overlay');
      if (ov) ov.classList.add('hidden');
      const elimOv = el.querySelector('.mp-eliminated-overlay');
      if (elimOv) elimOv.classList.add('hidden');
      const winOv = el.querySelector('.mp-winner-overlay');
      if (winOv) winOv.classList.add('hidden');
      el.style.filter = '';
      el.classList.remove('eliminated');
    }
    // Phase 3：離開 RTDB 房間並清空本地代碼
    leaveMpRoom().finally(() => { window.mpHostSettings.roomCode = null; });
    const vsTimer = document.getElementById('vs-timer');
    if (vsTimer) vsTimer.classList.add('hidden');
    const leaveBtn = document.getElementById('mp-leave-btn');
    if (leaveBtn) leaveBtn.classList.add('hidden');
    // 還原 settings-container 位置
    const settingsContainer = document.getElementById('settings-container');
    const fpsBtn = document.getElementById('fps-mode-btn');
    if (settingsContainer) {
      const origParent = window.__mpSettingsOriginalParent;
      const origNext = window.__mpSettingsOriginalNext;
      if (origParent) {
        if (origNext && origNext.parentElement === origParent) origParent.insertBefore(settingsContainer, origNext);
        else origParent.appendChild(settingsContainer);
      }
      // 恢復原 inline 樣式（HTML 上就有 right:20px; top:20px; 用 '' 會把那行擦掉）
      settingsContainer.style.top = '20px';
      settingsContainer.style.right = '20px';
      settingsContainer.style.width = '220px';
      if (fpsBtn) {
        fpsBtn.style.width = '220px';
        fpsBtn.style.padding = '10px';
        fpsBtn.style.textAlign = 'center';
        fpsBtn.style.fontSize = '14px';
        fpsBtn.style.borderRadius = '8px';
        fpsBtn.style.background = 'transparent';
        fpsBtn.style.backdropFilter = 'none';
      }
      window.__mpSettingsOriginalParent = null;
      window.__mpSettingsOriginalNext = null;
    }
    // 還原 ONLINE 框回原本 settings-container 內
    const onlinePanelMpExit = document.getElementById('online-panel');
    if (onlinePanelMpExit && window.__mpOnlineOriginalParent) {
      const oParent = window.__mpOnlineOriginalParent;
      const oNext = window.__mpOnlineOriginalNext;
      if (oNext && oNext.parentElement === oParent) oParent.insertBefore(onlinePanelMpExit, oNext);
      else oParent.appendChild(onlinePanelMpExit);
      const s = window.__mpOnlineOriginalStyles || {};
      onlinePanelMpExit.style.position = s.position || 'static';
      onlinePanelMpExit.style.right = s.right || '';
      onlinePanelMpExit.style.top = s.top || '';
      onlinePanelMpExit.style.width = s.width || '220px';
      onlinePanelMpExit.style.maxHeight = s.maxHeight || 'calc(100vh - 120px)';
      onlinePanelMpExit.style.margin = s.margin || '0';
      onlinePanelMpExit.style.zIndex = s.zIndex || '';
      window.__mpOnlineOriginalParent = null;
      window.__mpOnlineOriginalNext = null;
      window.__mpOnlineOriginalStyles = null;
    }
    // 還原邀請框位置：搬回 network-section 左下（離開多人房一律還原；若呼叫端要接著進 1v1，enterMultiplayerMode 會再搬一次）
    {
      const inviteToastExit = document.getElementById('invite-toast');
      const networkSectionExit = document.getElementById('network-section');
      if (inviteToastExit && networkSectionExit) {
        const origParent = window.__mpInviteToastOriginalParent || networkSectionExit;
        const origNext = window.__mpInviteToastOriginalNext;
        if (origNext && origNext.parentElement === origParent) origParent.insertBefore(inviteToastExit, origNext);
        else origParent.appendChild(inviteToastExit);
        inviteToastExit.classList.remove('horizontal');
        const s = window.__mpInviteToastOriginalStyles || {};
        inviteToastExit.style.position = s.position || 'static';
        inviteToastExit.style.margin = s.margin || '';
        inviteToastExit.style.marginTop = s.marginTop || '15px';
      }
      window.__mpInviteToastOriginalParent = null;
      window.__mpInviteToastOriginalNext = null;
      window.__mpInviteToastOriginalStyles = null;
    }
    // 還原 MULTIPLAYER 框內容
    {
      const mpInputGroupMpExit = document.getElementById('mp-input-group');
      if (mpInputGroupMpExit) mpInputGroupMpExit.style.display = 'flex';
      const mpReadyGroupMpExit = document.getElementById('mp-ready-group');
      if (mpReadyGroupMpExit) mpReadyGroupMpExit.style.display = 'none';
      const aiBtnMpExit = document.getElementById('ai-btn');
      if (aiBtnMpExit) aiBtnMpExit.classList.remove('hidden');
      const scoreboardMpExit = document.getElementById('scoreboard');
      if (scoreboardMpExit) scoreboardMpExit.style.display = 'none';
      // 還原 MATCH SCORE 標籤回 1v1 (YOU / OPP)，並把多人累計清零（離房就重算）
      const slLeftEx = document.getElementById('score-label-left');
      const slRightEx = document.getElementById('score-label-right');
      const myWEEx = document.getElementById('my-wins-el');
      const opWEEx = document.getElementById('opp-wins-el');
      if (slLeftEx) slLeftEx.textContent = 'YOU';
      if (slRightEx) slRightEx.textContent = 'OPP';
      if (myWEEx) myWEEx.textContent = '0';
      if (opWEEx) opWEEx.textContent = '0';
      window.mpTotalMatches = 0;
      window.mpMyWins = 0;
      const emojiPanelMpExit = document.getElementById('emoji-hint-panel');
      if (emojiPanelMpExit) emojiPanelMpExit.classList.add('hidden');
    }
    const btn = document.getElementById('multiplayer-btn');
    if (btn) {
      btn.textContent = window.t('btn.multiplayer', '🌐 多人對戰');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--I)';
    }
    // 退出多人房間 → 廣播 IDLE，讓其他人重新看到我可被邀請（除非接著要進 1v1，由 enterMultiplayerMode 自己改成 MULTIPLAYER）
    if (!isMultiplayer && typeof updateMyActivity === 'function') updateMyActivity('IDLE');
    if (typeof fitLayout === 'function') fitLayout();
  }

  const multiplayerBtn = document.getElementById('multiplayer-btn');
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
      if (window.isMpMulti) exitMpMultiPreview();
      else enterMpMultiPreview();
    });
  }

  // 攻擊策略按鈕：選中態切換（實際送出邏輯在 Phase 5）
  document.querySelectorAll('#mp-attack-strategy .mp-strategy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mp-attack-strategy .mp-strategy-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      window.mpAttackStrategy = btn.dataset.strategy;
      updateMpTargetIndicator(); // Phase 5：切策略時即時更新 🎯
    });
  });
  // 鍵盤 1~4 切換攻擊策略（Tetris 99 風）
  document.addEventListener('keydown', (e) => {
    if (!window.isMpMulti) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const map = { 'Digit1': 'RANDOM', 'Digit2': 'COUNTER', 'Digit3': 'THREAT', 'Digit4': 'ELIMINATE' };
    const strat = map[e.code];
    if (!strat) return;
    const btn = document.querySelector(`#mp-attack-strategy .mp-strategy-btn[data-strategy="${strat}"]`);
    if (btn) btn.click();
  });

  // === Phase 2：房主設定面板互動 ===
  // 模式（BOMB / CLASSIC）按鈕
  document.querySelectorAll('#mp-host-panel .mode-btn[data-mp-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!window.mpIsHost) return; // 非房主：唯讀
      if (window.mpIAmReady) {       // 已 READY：先取消才能改設定
        showToast(window.t('mp.hostReadyLocked', '已 READY，需取消 READY 才能修改設定'), 1800);
        return;
      }
      document.querySelectorAll('#mp-host-panel .mode-btn[data-mp-mode]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      window.mpHostSettings.mode = btn.dataset.mpMode;
      pushMpHostSettings();
    });
  });
  // 勝利條件按鈕
  document.querySelectorAll('#mp-wincond-group [data-wincond]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!window.mpIsHost) return;
      if (window.mpIAmReady) {
        showToast(window.t('mp.hostReadyLocked', '已 READY，需取消 READY 才能修改設定'), 1800);
        return;
      }
      document.querySelectorAll('#mp-wincond-group [data-wincond]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      window.mpHostSettings.winCondition = btn.dataset.wincond;
      pushMpHostSettings();
      // 即時同步 lobby 倒計時器顯示（給自己，其他玩家走 RTDB listener）
      if (typeof updateMpLobbyTimerDisplay === 'function') updateMpLobbyTimerDisplay();
    });
  });
  // 複製房間代碼
  const mpCopyBtn = document.getElementById('mp-copy-code-btn');
  if (mpCopyBtn) {
    mpCopyBtn.addEventListener('click', async () => {
      const code = window.mpHostSettings.roomCode;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // 後備：選取一個臨時 input
        const ta = document.createElement('textarea');
        ta.value = code; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      const orig = mpCopyBtn.textContent;
      mpCopyBtn.textContent = window.t('multiplayer.copied', '已複製！');
      setTimeout(() => { mpCopyBtn.textContent = window.t('multiplayer.copyCode', '📋 複製'); }, 1200);
    });
  }

  // 加入房間（用代碼）：先離開本地自動建立的房間，再 join
  const mpJoinBtn = document.getElementById('mp-join-code-btn');
  const mpJoinInput = document.getElementById('mp-join-code-input');
  if (mpJoinInput) {
    mpJoinInput.addEventListener('input', () => {
      mpJoinInput.value = mpJoinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    mpJoinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && mpJoinBtn) mpJoinBtn.click();
    });
  }
  if (mpJoinBtn) {
    mpJoinBtn.addEventListener('click', async () => {
      const code = (mpJoinInput && mpJoinInput.value || '').trim().toUpperCase();
      if (!code || code.length < 4) { setMpJoinStatus(window.t('multiplayer.joinNotFound', '找不到房間代碼')); return; }
      mpJoinBtn.disabled = true;
      setMpJoinStatus(window.t('multiplayer.searching', '查詢中…'), 'info');
      try {
        // 1) 先確認代碼存在 → 才動我自己的房間，避免失敗後卡住
        const idxSnap = await rtdb.ref('/mpRoomCodes/' + code).once('value');
        const idx = idxSnap.val();
        if (!idx || !idx.roomId) { setMpJoinStatus(window.t('multiplayer.joinNotFound', '找不到房間代碼') + ': ' + code); return; }
        // 2) 離開自己原本的房間
        await leaveMpRoom();
        // 3) 加入
        const ok = await joinMpRoomByCode(code);
        if (ok) {
          if (mpJoinInput) mpJoinInput.value = '';
          setMpJoinStatus('');
        } else {
          // 加入失敗 → 重新建一個自己的房間
          await createMpRoom();
        }
      } catch (e) {
        console.warn('JOIN error:', e);
        setMpJoinStatus(window.t('multiplayer.joinError', '加入失敗：') + (e && e.message ? e.message : 'unknown'));
      } finally {
        mpJoinBtn.disabled = false;
      }
    });
  }

  if (practiceBtn) {
    practiceBtn.addEventListener('click', () => {
      if (isMultiplayer) return; // 對戰中不允許切換
      if (window.isMpMulti) return; // 多人對戰預覽中不允許切換

      isPracticeMode = !isPracticeMode;

      const leaderboardColumn = document.getElementById('leaderboard-column');
      if (isPracticeMode) {
        practiceBtn.textContent = window.t('practice.btnExit', '🟩 離開練習模式');
        practiceBtn.style.background = 'var(--S)';
        practiceBtn.style.color = 'var(--bg)';
        practiceBtn.style.borderColor = 'var(--S)';
        // 先記住排行榜目前的高度，鎖到欄位 min-height，避免換成練習面板後整體變矮、頁面位移
        if (leaderboardColumn && comboLeaderboardContainer) {
          const h = comboLeaderboardContainer.offsetHeight;
          if (h > 0) leaderboardColumn.style.minHeight = h + 'px';
        }
        // 隱藏排行榜、顯示 Combo Room / 自由排版 入口
        if (comboLeaderboardContainer) comboLeaderboardContainer.style.display = 'none';
        if (practiceModeActions) practiceModeActions.classList.remove('hidden');
        // Combo Room 進行中時，名稱優先顯示 Combo Room 標示
        if (myNameDisplay && !isNarrowMode && !isFreeMode) myNameDisplay.innerHTML = 'You<br><span style="font-size:12px; color:rgba(255,255,255,0.7); letter-spacing:0px;">' + window.t('practice.subtitle', '(練習模式，不計排名)') + '</span>';
      } else {
        practiceBtn.textContent = window.t('btn.practice', '🟨 進入練習模式');
        practiceBtn.style.background = 'transparent';
        practiceBtn.style.color = 'var(--O)';
        practiceBtn.style.borderColor = 'var(--O)';
        // 離開練習模式時，順便退出 Combo Room / 自由排版
        if (typeof exitNarrowMode === 'function') exitNarrowMode();
        if (typeof exitFreeMode === 'function') exitFreeMode();
        if (practiceModeActions) practiceModeActions.classList.add('hidden');
        if (comboLeaderboardContainer) comboLeaderboardContainer.style.display = 'flex';
        if (leaderboardColumn) leaderboardColumn.style.minHeight = '';
        if (myNameDisplay) myNameDisplay.innerHTML = 'You';
      }

      // 切換練習模式時把單機盤面徹底收乾淨：
      // 進練習模式 → 等使用者選 Combo Room 或 自由排版
      // 出練習模式 → 回到 PRESS ENTER 起始畫面
      resetToPressEnter();
    });
  }

  // === COMBO ROOM 切換邏輯 ===
  const comboRoomBtn = document.getElementById('combo-room-btn');
  const comboRoomPanel = document.getElementById('combo-room-panel');
  const comboLeaderboardContainer = document.getElementById('leaderboard-container');

  function setComboRoomBtnState(active) {
    if (!comboRoomBtn) return;
    if (active) {
      comboRoomBtn.textContent = window.t('btn.comboRoomExit', '🟩 離開 COMBO ROOM');
      comboRoomBtn.style.background = 'var(--Z)';
      comboRoomBtn.style.color = 'var(--white)';
      comboRoomBtn.style.borderColor = 'var(--Z)';
      comboRoomBtn.style.boxShadow = '0 0 16px rgba(255,13,98,0.85), inset 0 0 10px rgba(255,255,255,0.25)';
      comboRoomBtn.style.textShadow = '0 0 6px rgba(0,0,0,0.5)';
    } else {
      comboRoomBtn.textContent = window.t('btn.comboRoom', '⚡ 進入 COMBO ROOM');
      comboRoomBtn.style.background = 'linear-gradient(135deg, rgba(56,189,238,0.18), rgba(255,13,98,0.18))';
      comboRoomBtn.style.color = 'var(--Z)';
      comboRoomBtn.style.borderColor = 'var(--Z)';
      comboRoomBtn.style.boxShadow = '0 0 12px rgba(255,13,98,0.55), inset 0 0 8px rgba(56,189,238,0.25)';
      comboRoomBtn.style.textShadow = '0 0 6px rgba(255,13,98,0.7)';
    }
  }

  if (comboRoomBtn) {
    comboRoomBtn.addEventListener('click', () => {
      if (isMultiplayer) return; // 對戰中（含 AI 對戰）不允許切換
      if (!isPracticeMode) return; // 必須先進練習模式才能用

      isNarrowMode = !isNarrowMode;

      if (isNarrowMode) {
        // 互斥：進 Combo Room 時自動退出自由排版
        if (typeof exitFreeMode === 'function') exitFreeMode();
        const am = document.getElementById('action-msg');
        if (am) am.textContent = '';
        setComboRoomBtnState(true);
        if (comboRoomPanel) comboRoomPanel.classList.remove('hidden');
        if (myNameDisplay) myNameDisplay.innerHTML = `You<br><span style="font-size:12px; color:rgba(255,255,255,0.7); letter-spacing:0px;">(${narrowWidth}-Wide Combo Room，不計排名)</span>`;
      } else {
        setComboRoomBtnState(false);
        if (comboRoomPanel) comboRoomPanel.classList.add('hidden');
        if (myNameDisplay) {
          // 仍在練習模式 → 回到練習模式的標示
          myNameDisplay.innerHTML = 'You<br><span style="font-size:12px; color:rgba(255,255,255,0.7); letter-spacing:0px;">' + window.t('practice.subtitle', '(練習模式，不計排名)') + '</span>';
        }
      }

      if (isNarrowMode) {
        // 進入 Combo Room：重啟以套用新寬度（startCountdown 因為 isNarrowMode 已 true 不會被擋）
        if (gameStarted || countdownValue > 0) {
          gameOver = true;
        }
        startCountdown();
      } else {
        // 離開 Combo Room：仍在練習模式無法重啟，徹底清乾淨回到 PRESS ENTER
        resetToPressEnter();
      }
    });
  }

  // === COMBO ROOM 寬度按鈕 ===
  document.querySelectorAll('#combo-width-group .ai-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = parseInt(btn.dataset.width);
      if (!w) return;
      document.querySelectorAll('#combo-width-group .ai-option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      narrowWidth = w;
      // 若已在 Combo Room，更新名稱並套用新寬度
      if (isNarrowMode) {
        if (myNameDisplay) myNameDisplay.innerHTML = `You<br><span style="font-size:12px; color:rgba(255,255,255,0.7); letter-spacing:0px;">(${narrowWidth}-Wide Combo Room，不計排名)</span>`;
        if (gameStarted || countdownValue > 0) {
          gameOver = true;
          startCountdown();
        } else {
          board = createBoard();
          if (typeof draw === 'function') draw();
        }
      }
    });
  });

  // === 自由排版模式（獨立於 Combo Room） ===
  function applyQueueVisibility() {
    const nextWrapper = document.getElementById('next-wrapper');
    const queueWrapper = document.getElementById('queue-wrapper');
    const hide = isFreeMode && !freeQueueEnabled;
    if (nextWrapper) nextWrapper.style.visibility = hide ? 'hidden' : 'visible';
    if (queueWrapper) queueWrapper.style.visibility = hide ? 'hidden' : 'visible';
  }

  function maybeRestartGame() {
    if (gameStarted || countdownValue > 0) {
      gameOver = true;
      startCountdown();
    } else {
      board = createBoard();
      if (typeof draw === 'function') draw();
    }
  }

  const freeModeBtn = document.getElementById('free-mode-btn');
  const freeModePanel = document.getElementById('free-mode-panel');

  function setFreeModeBtnState(active) {
    if (!freeModeBtn) return;
    if (active) {
      freeModeBtn.textContent = window.t('btn.freeModeExit', '🟩 離開自由排版');
      freeModeBtn.style.background = 'var(--I)';
      freeModeBtn.style.color = 'var(--bg)';
      freeModeBtn.style.borderColor = 'var(--I)';
    } else {
      freeModeBtn.textContent = window.t('btn.freeMode', '🧩 進入自由排版');
      freeModeBtn.style.background = 'transparent';
      freeModeBtn.style.color = 'var(--I)';
      freeModeBtn.style.borderColor = 'var(--I)';
    }
  }

  // 強制離開 Combo Room（給「進 Free Mode 時自動退 Combo」用）
  function exitNarrowMode() {
    if (!isNarrowMode) return;
    isNarrowMode = false;
    setComboRoomBtnState(false);
    if (comboRoomPanel) comboRoomPanel.classList.add('hidden');
  }

  // 強制離開 Free Mode（給「進 Combo Room 時自動退 Free」用）
  function exitFreeMode() {
    if (!isFreeMode) return;
    isFreeMode = false;
    setFreeModeBtnState(false);
    if (freeModePanel) freeModePanel.classList.add('hidden');
    applyQueueVisibility();
  }

  if (freeModeBtn) {
    freeModeBtn.addEventListener('click', () => {
      if (isMultiplayer) return; // 對戰中不允許切換
      if (!isPracticeMode) return; // 必須先進練習模式才能用

      isFreeMode = !isFreeMode;

      if (isFreeMode) {
        exitNarrowMode(); // 互斥：進 Free Mode 自動退 Combo Room
        const am = document.getElementById('action-msg');
        if (am) am.textContent = '';
        setFreeModeBtnState(true);
        if (freeModePanel) freeModePanel.classList.remove('hidden');
        if (myNameDisplay) myNameDisplay.innerHTML = 'You<br><span style="font-size:12px; color:rgba(255,255,255,0.7); letter-spacing:0px;">(自由排版，不計排名)</span>';
      } else {
        setFreeModeBtnState(false);
        if (freeModePanel) freeModePanel.classList.add('hidden');
        if (myNameDisplay) {
          // 仍在練習模式 → 回到練習模式的標示
          myNameDisplay.innerHTML = 'You<br><span style="font-size:12px; color:rgba(255,255,255,0.7); letter-spacing:0px;">' + window.t('practice.subtitle', '(練習模式，不計排名)') + '</span>';
        }
      }
      applyQueueVisibility();
      if (isFreeMode) {
        if (gameStarted || countdownValue > 0) {
          gameOver = true;
        }
        startCountdown();
      } else {
        resetToPressEnter();
      }
    });
  }

  document.querySelectorAll('#free-gravity-group .ai-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#free-gravity-group .ai-option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      freeGravity = btn.dataset.gravity === 'on';
      // 重力切換不需重啟遊戲，下一幀就會生效
    });
  });

  document.querySelectorAll('#free-queue-group .ai-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#free-queue-group .ai-option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      freeQueueEnabled = btn.dataset.queue === 'on';
      applyQueueVisibility();
      if (isFreeMode) maybeRestartGame();
    });
  });

  // === Clear All：把場地清空，分數歸零，方塊池重置 ===
  const freeClearBtn = document.getElementById('free-clear-btn');
  if (freeClearBtn) {
    freeClearBtn.addEventListener('click', () => {
      if (!isFreeMode) return;
      if (countdownValue > 0) return; // 倒數中先不動
      // 清空盤面與計分
      board = createBoard();
      score = 0;
      lines = 0;
      combo = -1;
      b2b = 0;
      maxCombo = 0;
      piecesPlaced = 0;
      visualBoardOffsetY = 0;
      activeGarbage = 0;
      nextGarbage = 0;
      clearFx = null;
      shakeMag = 0;
      // 取消反悔快照（場地都清了，舊快照沒意義）
      canUndo = false;
      previousGameState = null;
      // 重置方塊池與 Hold；queue 視「隨機產生」開關決定要不要補
      piecePool = [];
      myPieceIndex = 0;
      queue = [];
      holdType = null;
      holdUsed = false;
      // 重新生第一顆：依 Free Mode 設定（queue 關 → current = null 等玩家按數字鍵）
      if (gameStarted && !gameOver) {
        current = null;
        spawn();
      } else {
        current = null;
      }
      lockTimer = 0;
      lockResets = 0;
      gravityTimer = 0;
      // 立即更新 HUD 與盤面
      updateHUD();
      renderPanels();
      if (typeof draw === 'function') draw();
      playSound('move');
    });
  }

  // 當玩家直接關閉網頁分頁或重整時，瞬間通知對手
  window.addEventListener('beforeunload', () => {
    if (isMultiplayer && conn && conn.open) {
      conn.send({ type: 'OPPONENT_DISCONNECTED' });
    }
  });

  initMenu();
  updateSoundUI();

  // --- 對手名稱可點擊查看戰績 ---
  const oppNameDisplay = document.getElementById('opp-name-display');
  if (oppNameDisplay) {
    oppNameDisplay.style.cursor = 'pointer';
    oppNameDisplay.addEventListener('click', () => {
      const oppName = (oppState && oppState.name) ? oppState.name : null;
      if (oppName && oppName !== 'OPPONENT' && oppName !== 'Guest' && oppName !== 'LOADING...') {
        openPlayerHistory(oppName);
      }
    });
  }

  // --- 利用 Web Worker 建立不受分頁休眠影響的「背景引擎」 ---
  // 一段寫在字串裡的微型腳本，用來在背景獨立計時
  const workerCode = `
    let timer = null;
    self.onmessage = function(e) {
      if (e.data === 'start') {
        // 每 1000/60 毫秒發送一次訊號 (精準對齊 60Hz vsync，避免跟畫面不同步的微抖)
        timer = setInterval(() => self.postMessage('tick'), 1000/60);
      }
    };
  `;
  
  // 將字串轉換成瀏覽器可執行的 Blob 物件
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const engineWorker = new Worker(URL.createObjectURL(blob));

  // --- 雙擎架構 (邏輯與畫面完全分離) ---
  
  // 邏輯引擎：由 Worker 驅動，固定約 62.5Hz，確保遊戲物理與 AI 穩定運行
  engineWorker.onmessage = function() {
    const ts = performance.now();
    if (!lastTime) lastTime = ts;
    let delta = ts - lastTime;
    lastTime = ts;

    // 核心引擎：在背景強制計算遊戲物理與 AI
    while (delta > 0) {
      let step = Math.min(delta, 16); 
      update(step); // 純算數學邏輯，極度輕量
      delta -= step;
    }
  };

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let lastVisualTime = performance.now();
  let lastRenderTime = 0; // 用來控制 60fps 鎖定
  let menuDrawTime = 0;   // 選單狀態用，節流 draw 頻率
  let lastOppDrawTime = 0; // 對手畫面節流，~60Hz 就夠了

  function renderLoop() {
    const now = performance.now();

    // Rolling deadline FPS 限制：精準達成目標幀率，避免在 180Hz 螢幕被 VSync 折半成 90Hz
    if (now < nextRenderDeadline) {
      requestAnimationFrame(renderLoop);
      return;
    }
    // 嚴重落後 (例如分頁切回來)：重設起點避免爆幀
    if (nextRenderDeadline < now - fpsFrameInterval) {
      nextRenderDeadline = now + fpsFrameInterval;
    } else {
      nextRenderDeadline += fpsFrameInterval;
    }
    lastRenderTime = now;

    const visualDelta = now - lastVisualTime;
    lastVisualTime = now;

    // --- FPS 計算邏輯 ---
    frameCount++;
    if (now - lastFpsTime >= 1000) {
      const fpsValueEl = document.getElementById('fps-value');
      if (fpsValueEl) fpsValueEl.textContent = frameCount;
      frameCount = 0;
      lastFpsTime = now;
    }

    // --- 高幀數運算區 (僅保留自己畫面的運算，對手畫面不耗費任何效能) ---
    if (isHighFpsMode) {

      // --- 進階視覺的「極速恢復動畫」(每幀都會自動彈回原狀) ---
        const fxLerp = 1 - Math.pow(0.05, visualDelta / 16.66);
        visualRotationAngle += (0 - visualRotationAngle) * fxLerp;
        
        // 垃圾行的平滑回歸 (比較慢一點，像電梯上升)
        visualBoardOffsetY += (0 - visualBoardOffsetY) * 0.2;

      if (current) {
        // 計算「真實的連續物理目標」
        let targetVisualRow = current.row;

        // 拔除按鍵限制，讓軟降也能享受小數點預判！
        if (valid(current.matrix, current.row + 1, current.col)) {
            let progress = gravityTimer / currentGravityInterval;
            targetVisualRow += progress; 
        }

        let diffY = targetVisualRow - visualRow;
        
        if (diffY > 2) {
          // 瞬間貼地
          visualRow = current.row;
        } else {
          // 用 Time-based LERP 緊緊咬住軟降的快速掉落
          const dropLerp = 1 - Math.pow(0.01, visualDelta / 16.66); 
          visualRow += diffY * dropLerp; 
        }
        
        // 左右維持絕對零延遲，保持清脆手感
        visualCol = current.col; 
        // 只在方塊 X 座標、旋轉或種類改變時，才重新計算物理碰撞
        if (current.col !== lastGhostCol || current.rot !== lastGhostRot || current.type !== lastGhostPieceType) {
            cachedGhostRow = ghostRow();
            lastGhostCol = current.col;
            lastGhostRot = current.rot;
            lastGhostPieceType = current.type;
        }
        visualGhostRow = cachedGhostRow;
      }
    } else {
      // 關閉高幀率模式下：強制同步所有座標，回歸最原始的「一格一格」掉落動畫
      if (current) {
        visualCol = current.col;
        
        // 直接鎖死邏輯整數座標，完全捨棄小數點預判，找回經典手感！
        visualRow = current.row; 
        
        // 保持幽靈方塊的快取效能 (這段一定要留著，保護 CPU)
        if (current.col !== lastGhostCol || current.rot !== lastGhostRot || current.type !== lastGhostPieceType) {
            cachedGhostRow = ghostRow();
            lastGhostCol = current.col;
            lastGhostRot = current.rot;
            lastGhostPieceType = current.type;
        }
        visualGhostRow = cachedGhostRow;
      }
      
      // 確保切換回 60FPS 時，旋轉與盤面震動特效瞬間歸零
      visualRotationAngle = 0; 
      visualBoardOffsetY = 0;  
    }

    // 不管有沒有開啟高幀率，消行閃爍特效的時間都必須往前推進，防止特效卡死
    if (typeof clearFx !== 'undefined' && clearFx) {
      clearFx.visualElapsed += visualDelta;
    }

    // 特效更新不受模式影響，保持基本運作
    if (shakeMag > 0) shakeMag = Math.max(0, shakeMag - visualDelta * 0.08); 

    if (typeof oppKOTimer !== 'undefined' && oppKOTimer > 0) {
      oppKOTimer -= visualDelta; 
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update(visualDelta);
      if (p.life <= 0) particles.splice(i, 1); 
    }

    // 效能安全閥：確保畫面上最多只有 8 個文字特效，舊的強制剔除
    if (myFloatingTexts.length > 8) myFloatingTexts.shift();
    if (oppFloatingTexts.length > 8) oppFloatingTexts.shift();

    for (let i = myFloatingTexts.length - 1; i >= 0; i--) {
      const ft = myFloatingTexts[i];
      ft.update(visualDelta);
      if (ft.life <= 0) myFloatingTexts.splice(i, 1);
    }
    for (let i = oppFloatingTexts.length - 1; i >= 0; i--) {
      const ft = oppFloatingTexts[i];
      ft.update(visualDelta);
      if (ft.life <= 0) oppFloatingTexts.splice(i, 1);
    }

    // 繪製畫面
    // 一旦有飄浮文字 (emoji / combo / KO / 大招提示) 或粒子在跑，就不要節流，
    // 否則 lobby / 倒數 / 對戰結束 等狀態下，emoji 會被節流到 15-20 FPS 看起來一頓一頓的，
    // 不像對戰中的 combo 動畫那樣絲滑。
    const hasAnyFx = myFloatingTexts.length > 0
                  || oppFloatingTexts.length > 0
                  || particles.length > 0
                  || (typeof oppKOTimer !== 'undefined' && oppKOTimer > 0);

    // 選單狀態：節流到 ~15 FPS（PRESS ENTER 是靜態的，不需要 120Hz 重繪）
    if (!gameStarted && !hasAnyFx) {
      if (now - menuDrawTime < 66) {
        requestAnimationFrame(renderLoop);
        return;
      }
      menuDrawTime = now;
    }

    // 遊戲結束 / 暫停 / 倒數 畫面幾乎靜態，節流到 ~20 FPS
    else if ((gameOver || isPaused || countdownValue > 0) && !hasAnyFx) {
      if (now - menuDrawTime < 50) {
        requestAnimationFrame(renderLoop);
        return;
      }
      menuDrawTime = now;
    }

    draw();
    // 只有在對戰、待處理邀請、或剛要進對戰倒數時才畫對手畫面
    // Phase 2：觀戰對戰模式時也要畫對手
    // 效能優化：對手盤面節流到 ~60Hz，180Hz 絲滑對遠端畫面感受不出來但成本是 3 倍
    // 但 emoji / KO 等飄浮文字動畫一旦活著就要逐幀重繪，否則手機上會看到一格一格跳的卡頓感
    if (isMultiplayer || pendingConn || (conn && !isPracticeMode) || isSpectatingBattle) {
      const hasOppAnim = oppFloatingTexts.length > 0 || (typeof oppKOTimer !== 'undefined' && oppKOTimer > 0);
      if (hasOppAnim || now - lastOppDrawTime >= 15) {
        drawOpponent();
        lastOppDrawTime = now;
      }
    }

    requestAnimationFrame(renderLoop);
  }

  // 啟動渲染迴圈
  requestAnimationFrame(renderLoop);

  // 啟動背景邏輯引擎
  engineWorker.postMessage('start');

  // --- 更新日誌 (Changelog) UI 邏輯與動態渲染 ---
  const versionTag = document.getElementById('version-tag');
  const changelogModal = document.getElementById('changelog-modal');
  const closeChangelogBtn = document.getElementById('close-changelog-btn');
  const changelogContent = document.getElementById('changelog-content');

  // 自動把 GAME_VERSION 寫到右下角的標籤上！你以後只要改變數，畫面就自動更新
  const versionTextEl = document.getElementById('version-text');
  if (versionTextEl) versionTextEl.textContent = GAME_VERSION;

  // 自動渲染更新日誌（依當前語系拿對應陣列）
  const _changelogArr = (typeof window.getChangelog === 'function') ? window.getChangelog() : (typeof CHANGELOG_DATA !== 'undefined' ? CHANGELOG_DATA : []);
  if (changelogContent && _changelogArr.length > 0) {
    changelogContent.innerHTML = ''; // 先清空

    // --- 抓取第一筆 (最新) 的日期 ---
    const latestTitle = _changelogArr[0].title;
    const dateMatch = latestTitle.match(/\((.*?)\)/); // 抓取括號內的文字
    const latestDate = dateMatch ? dateMatch[1] : 'UNKNOWN_DATE';

    _changelogArr.forEach((patch, index) => {
      // --- 標題包含最新日期，就判定為 isLatest ---
      const isLatest = patch.title.includes(latestDate); 
      
      // 自動根據是否為最新版，給予不同的顏色與大小
      const titleColor = isLatest ? 'var(--S)' : 'rgba(255,255,255,0.5)';
      const titleSize = isLatest ? '16px' : '14px';
      const ulColor = isLatest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
      const ulStyle = isLatest ? 'font-size: 14px; margin: 0 0 20px 0;' : 'font-size: 13px; margin: 0 0 15px 0;';
      const latestTag = isLatest ? ' (Latest)' : '';

      let html = `<h3 style="color: ${titleColor}; margin: 0 0 8px 0; font-size: ${titleSize};">${patch.version} - ${patch.title}${latestTag}</h3>`;
      html += `<ul style="padding-left: 20px; color: ${ulColor}; ${ulStyle}">`;
      
      patch.changes.forEach(change => {
        html += `<li style="margin-bottom: 4px;">${change}</li>`;
      });
      
      html += `</ul>`;
      changelogContent.innerHTML += html;
    });
  }

  // 按鈕開關邏輯
  if (versionTag && changelogModal && closeChangelogBtn) {
    versionTag.addEventListener('click', () => {
      changelogModal.classList.remove('hidden');
      playSound('move');
    });
    versionTag.addEventListener('mouseenter', () => versionTag.style.color = 'var(--I)');
    versionTag.addEventListener('mouseleave', () => versionTag.style.color = 'rgba(255,255,255,0.85)');
    closeChangelogBtn.addEventListener('click', () => {
      changelogModal.classList.add('hidden');
      playSound('move');
    });
  }

  // --- 對戰紀錄 (Match History) Modal ---
  const historyModal = document.getElementById('history-modal');
  const historyBtn = document.getElementById('match-history-btn');
  const closeHistoryBtn = document.getElementById('close-history-btn');
  const historyContent = document.getElementById('history-content');
  const historySummary = document.getElementById('history-summary');
  const historyFilterTabs = document.getElementById('history-filter-tabs');

  let historyDocsCache = [];      // 記住全部紀錄，切換 tab 時不用重新抓
  let historyFilter = 'ALL';

  function formatHistoryTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 結束原因 -> 顯示文字與顏色
  function reasonBadge(reason, result) {
    if (reason === 'SURRENDER') {
      const isMySurrender = result === 'LOSE';
      const txt = isMySurrender ? window.t('history.reasonSurrender', '投降') : window.t('history.reasonOppSurrender', '對手投降');
      return `<span style="color:rgba(255,255,255,0.55); font-size:10px; margin-left:6px; border:1px solid rgba(255,255,255,0.25); padding:1px 5px; border-radius:3px;">${txt}</span>`;
    }
    if (reason === 'KO') return '<span style="color:#ff6b6b; font-size:10px; margin-left:6px; border:1px solid #ff6b6b; padding:1px 5px; border-radius:3px;">KO</span>';
    if (reason === 'TIMEOUT') return `<span style="color:rgba(255,255,255,0.55); font-size:10px; margin-left:6px; border:1px solid rgba(255,255,255,0.25); padding:1px 5px; border-radius:3px;">${window.t('history.reasonTimeout', '時間到')}</span>`;
    return '';
  }

  function renderHistoryList() {
    const docs = historyDocsCache.filter(d => {
      if (historyFilter === 'ALL') return true;
      return d.data().result === historyFilter;
    });

    if (!docs || docs.length === 0) {
      historyContent.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.5); padding:30px; font-size:13px;">${window.t('history.empty', '這個分類裡還沒有任何紀錄。')}</div>`;
      if (!_historyViewingPlayer) historySummary.innerHTML = '';
      return;
    }

    let winCount = 0, loseCount = 0, drawCount = 0, lpSum = 0;
    historyDocsCache.forEach(d => {
      const m = d.data();
      if (m.result === 'WIN') winCount++;
      else if (m.result === 'LOSE') loseCount++;
      else drawCount++;
      lpSum += (m.lpChange || 0);
    });
    const lpSumColor = lpSum > 0 ? 'var(--S)' : (lpSum < 0 ? 'var(--Z)' : 'var(--white)');
    const lpSumText = (lpSum > 0 ? '+' : '') + lpSum;
    const summaryLine = `
      <div style="display:flex; justify-content:center; flex-wrap:wrap; gap:6px 18px; font-size:13px; font-weight:bold; color:rgba(255,255,255,0.85);">
        <span>${window.t('history.recentPrefix', '近 ')}<span style="color:var(--O);">${historyDocsCache.length}</span>${window.t('history.recentSuffix', ' 場')}</span>
        <span style="color:var(--S);">${window.t('history.summaryWin', '勝')} ${winCount}</span>
        <span style="color:var(--Z);">${window.t('history.summaryLose', '負')} ${loseCount}</span>
        <span style="color:rgba(255,255,255,0.7);">${window.t('history.summaryDraw', '平')} ${drawCount}</span>
        <span>LP: <span style="color:${lpSumColor}; font-weight:900;">${lpSumText}</span></span>
      </div>`;
    if (_historyViewingPlayer) {
      const existing = historySummary.querySelector('.player-stats-card');
      const cardHtml = existing ? existing.outerHTML : '';
      historySummary.innerHTML = cardHtml + summaryLine;
    } else {
      historySummary.innerHTML = summaryLine;
    }

    historyContent.innerHTML = '';
    docs.forEach(doc => {
      const m = doc.data();
      const isWin = m.result === 'WIN';
      const isLose = m.result === 'LOSE';

      const bgColor = isWin ? 'rgba(0,255,150,0.12)' : (isLose ? 'rgba(255,13,98,0.15)' : 'rgba(255,255,255,0.08)');
      const borderColor = isWin ? 'var(--S)' : (isLose ? 'var(--Z)' : 'rgba(255,255,255,0.4)');
      const tagColor = isWin ? 'var(--S)' : (isLose ? 'var(--Z)' : 'var(--white)');
      const tagText = isWin ? 'WIN' : (isLose ? 'LOSE' : 'DRAW');

      const lpChange = m.lpChange || 0;
      const lpColor = lpChange > 0 ? 'var(--S)' : (lpChange < 0 ? 'var(--Z)' : 'var(--white)');
      const lpText = (lpChange > 0 ? '+' : '') + lpChange + ' LP';

      const myRankColor = getRankInfo(m.myLP || 0).color;
      const oppRankColor = getRankInfo(m.oppLP || 0).color;
      const badge = reasonBadge(m.reason || (m.surrender ? 'SURRENDER' : 'TIMEOUT'), m.result);

      const dur = m.durationSec || 0;
      const durText = dur > 0 ? `${Math.floor(dur/60)}:${String(dur%60).padStart(2,'0')}` : '—';

      // 相容新舊欄位：舊紀錄只有 maxCombo/apm/pps (自己的)
      const myMaxC = (m.myMaxCombo !== undefined) ? m.myMaxCombo : (m.maxCombo || 0);
      const myApm = (m.myApm !== undefined) ? m.myApm : (m.apm || 0);
      const myPps = (m.myPps !== undefined) ? m.myPps : (m.pps || 0);
      const oppLinesCleared = m.oppLines || 0;
      const oppLinesSent = m.oppLinesSent || 0;
      const oppMaxC = m.oppMaxCombo || 0;
      const oppApm = m.oppApm || 0;
      const oppPps = m.oppPps || 0;

      // 高亮優勢方
      const hi = (a, b) => a > b ? 'color:var(--S);' : (a < b ? 'color:var(--Z);' : 'color:var(--white);');

      const statTable = `
        <div style="margin-top:8px; font-size:10px; background:rgba(0,0,0,0.3); padding:6px 8px; border-radius:4px; overflow-x: auto;">
          <div style="display:grid; grid-template-columns: 32px repeat(6, 1fr) 44px; gap:4px; align-items:center; min-width: 340px;">
            <div style="color:rgba(255,255,255,0.5); font-weight:bold; text-align:left;"></div>
            <div title="${window.t('history.tipLines')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">${window.t('history.statLines')}</div>
            <div title="${window.t('history.tipAttack')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">${window.t('history.statAttack')}</div>
            <div title="${window.t('history.tipKO')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">KO</div>
            <div title="${window.t('history.tipMaxC')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">MAX C</div>
            <div title="${window.t('history.tipAPM')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">APM</div>
            <div title="${window.t('history.tipPPS')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">PPS</div>
            <div title="${window.t('history.tipDuration')}" style="text-align:center; color:rgba(255,255,255,0.6); cursor:help;">⏱</div>

            <div style="color:var(--T); font-weight:900;">${window.t('history.colMe', '我')}</div>
            <div style="text-align:center; font-weight:bold; ${hi(m.myLines||0, oppLinesCleared)}">${m.myLines || 0}</div>
            <div style="text-align:center; font-weight:bold; ${hi(m.myLinesSent||0, oppLinesSent)}">${m.myLinesSent || 0}</div>
            <div style="text-align:center; font-weight:bold; ${hi(m.myKOs||0, m.oppKOs||0)}">${m.myKOs || 0}</div>
            <div style="text-align:center; font-weight:bold; ${hi(myMaxC, oppMaxC)}">${myMaxC}</div>
            <div style="text-align:center; font-weight:bold; ${hi(myApm, oppApm)}">${myApm}</div>
            <div style="text-align:center; font-weight:bold; ${hi(myPps, oppPps)}">${myPps}</div>
            <div style="text-align:center; color:rgba(255,255,255,0.75);" rowspan="2">${durText}</div>

            <div style="color:var(--Z); font-weight:900;">${window.t('history.colOpp', '對手')}</div>
            <div style="text-align:center; font-weight:bold; ${hi(oppLinesCleared, m.myLines||0)}">${oppLinesCleared}</div>
            <div style="text-align:center; font-weight:bold; ${hi(oppLinesSent, m.myLinesSent||0)}">${oppLinesSent}</div>
            <div style="text-align:center; font-weight:bold; ${hi(m.oppKOs||0, m.myKOs||0)}">${m.oppKOs || 0}</div>
            <div style="text-align:center; font-weight:bold; ${hi(oppMaxC, myMaxC)}">${oppMaxC}</div>
            <div style="text-align:center; font-weight:bold; ${hi(oppApm, myApm)}">${oppApm}</div>
            <div style="text-align:center; font-weight:bold; ${hi(oppPps, myPps)}">${oppPps}</div>
            <div></div>
          </div>
        </div>
      `;

      const oppName = m.opponent || 'Unknown';

      const html = `
        <div style="background:${bgColor}; border-left:5px solid ${borderColor}; border-radius:6px; padding:10px 12px; font-size:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div>
              <span style="color:${tagColor}; font-weight:900; font-size:15px; letter-spacing:1px;">${tagText}</span>
              ${badge}
              <span style="color:${lpColor}; font-weight:900; margin-left:10px;">${lpText}</span>
            </div>
            <div style="color:rgba(255,255,255,0.6); font-size:11px;">${formatHistoryTime(m.ts)}</div>
          </div>
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <div style="flex:1; text-align:center; background:rgba(0,0,0,0.25); padding:6px; border-radius:4px;">
              <div style="color:var(--T); font-weight:900; font-size:13px;">${_historyViewingPlayer || currentPlayer || window.t('history.fallbackMe', '我')}</div>
              <div style="color:${myRankColor}; font-weight:bold; font-size:11px; margin-top:2px;">${localizeStoredRank(m.myRank)} (${m.myLP || 0} LP)</div>
              <div style="color:var(--white); font-weight:900; font-size:14px; margin-top:3px;">${(m.myScore || 0).toLocaleString()}</div>
            </div>
            <div style="align-self:center; color:rgba(255,255,255,0.5); font-weight:900;">VS</div>
            <div style="flex:1; text-align:center; background:rgba(0,0,0,0.25); padding:6px; border-radius:4px;">
              <div style="color:var(--Z); font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${oppName}</div>
              <div style="color:${oppRankColor}; font-weight:bold; font-size:11px; margin-top:2px;">${localizeStoredRank(m.oppRank)} (${m.oppLP || 0} LP)</div>
              <div style="color:var(--white); font-weight:900; font-size:14px; margin-top:3px;">${(m.oppScore || 0).toLocaleString()}</div>
            </div>
          </div>
          ${statTable}
        </div>
      `;
      historyContent.innerHTML += html;
    });
  }

  function setHistoryFilter(f) {
    historyFilter = f;
    if (!historyFilterTabs) return;
    historyFilterTabs.querySelectorAll('.history-tab').forEach(btn => {
      const isActive = btn.dataset.filter === f;
      if (isActive) {
        if (f === 'WIN') { btn.style.background = 'var(--S)'; btn.style.color = 'var(--bg)'; }
        else if (f === 'LOSE') { btn.style.background = 'var(--Z)'; btn.style.color = 'var(--white)'; }
        else { btn.style.background = 'var(--O)'; btn.style.color = 'var(--bg)'; }
      } else {
        btn.style.background = 'transparent';
        if (btn.dataset.filter === 'WIN') btn.style.color = 'var(--S)';
        else if (btn.dataset.filter === 'LOSE') btn.style.color = 'var(--Z)';
        else btn.style.color = 'var(--O)';
      }
    });
    renderHistoryList();
  }

  if (historyFilterTabs) {
    historyFilterTabs.querySelectorAll('.history-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('move');
        setHistoryFilter(btn.dataset.filter);
      });
    });
  }

  function openHistoryModal() {
    if (!currentUserUID) {
      showToast(window.t('history.loginRequired', '請先登入才能查看對戰紀錄！'), 2500);
      return;
    }
    historyModal.classList.remove('hidden');
    historyContent.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); padding:30px; font-size:13px;">讀取中...</div>';
    historySummary.innerHTML = '';
    playSound('move');

    db.collection('users').doc(currentUserUID)
      .collection('matchHistory')
      .orderBy('ts', 'desc')
      .limit(50)
      .get()
      .then(snap => {
        historyDocsCache = snap.docs;
        setHistoryFilter('ALL');
      })
      .catch(err => {
        console.error('讀取對戰紀錄失敗:', err);
        const msg = (err && err.message) ? err.message : String(err);
        const code = (err && err.code) ? err.code : '';
        historyContent.innerHTML = `<div style="text-align:left; color:var(--Z); padding:20px; font-size:12px; line-height:1.6;"><div style="font-weight:900; margin-bottom:8px;">讀取失敗</div><div style="color:rgba(255,255,255,0.8); word-break:break-all;">${code ? '[' + code + '] ' : ''}${msg}</div><div style="color:rgba(255,255,255,0.55); margin-top:8px; font-size:11px;">如果是 permission-denied，請到 Firebase Console 更新 Firestore 規則，允許讀寫 users/{uid}/matchHistory 子集合。</div></div>`;
      });
  }

  let _historyViewingPlayer = null;

  function buildPlayerStatsCard(data, username) {
    const lp = data.lp || 0;
    const rankInfo = getRankInfo(lp);
    const m = data.matches || 0;
    const w = data.wins || 0;
    const wr = m > 0 ? Math.round((w / m) * 100) : 0;
    const dur = data.careerDurationSec || 0;
    const durMin = dur > 0 ? dur / 60 : 0;
    const avgApm = durMin > 0 ? Math.round((data.careerLinesSent || 0) / durMin) : 0;
    const avgPps = dur > 0 ? +((data.careerPieces || 0) / dur).toFixed(2) : 0;
    const avgCombo = m > 0 ? +((data.careerComboSum || 0) / m).toFixed(1) : 0;
    const totalKO = data.careerKOs || 0;
    return `
      <div class="player-stats-card" style="background:rgba(0,0,0,0.35); border:2px solid ${rankInfo.color}; border-radius:6px; padding:10px 14px; margin-bottom:4px;">
        <div style="text-align:center; margin-bottom:6px;">
          <span style="font-size:16px; font-weight:900; color:var(--T);">${username}</span>
          <div style="font-size:14px; font-weight:900; color:${rankInfo.color}; text-shadow:0 0 5px ${rankInfo.color}80; margin-top:2px;">${window.t(rankInfo.nameKey, rankInfo.name)} <span style="font-size:12px;">(${lp} LP)</span></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 16px; font-size:12px; color:rgba(255,255,255,0.85);">
          <div>MATCH: <span style="color:var(--white); font-weight:bold;">${m}</span></div>
          <div>WIN RATE: <span style="color:var(--S); font-weight:bold;">${wr}%</span></div>
          <div>AVG APM: <span style="color:var(--T); font-weight:bold;">${avgApm}</span></div>
          <div>AVG PPS: <span style="color:var(--L); font-weight:bold;">${avgPps.toFixed(2)}</span></div>
          <div>AVG COMBO: <span style="color:var(--J); font-weight:bold;">${avgCombo}</span></div>
          <div>TOTAL KO: <span style="color:var(--Z); font-weight:bold;">${totalKO}</span></div>
        </div>
      </div>`;
  }

  function openPlayerHistory(targetUsername) {
    if (!targetUsername) return;
    if (targetUsername === currentPlayer) { openHistoryModal(); return; }
    historyModal.classList.remove('hidden');
    historyContent.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); padding:30px; font-size:13px;">讀取中...</div>';
    historySummary.innerHTML = '';
    const historyTitle = document.getElementById('history-title');
    if (historyTitle) historyTitle.textContent = '📜 ' + targetUsername + ' 的戰績';
    _historyViewingPlayer = targetUsername;
    playSound('move');

    let playerDoc = null;
    db.collection('users').where('username', '==', targetUsername).limit(1).get()
      .then(snap => {
        if (snap.empty) {
          historyContent.innerHTML = '<div style="text-align:center; color:var(--Z); padding:30px; font-size:13px;">找不到此玩家。</div>';
          return Promise.reject('NOT_FOUND');
        }
        playerDoc = snap.docs[0];
        return db.collection('users').doc(playerDoc.id)
          .collection('matchHistory')
          .orderBy('ts', 'desc')
          .limit(50)
          .get();
      })
      .then(snap => {
        if (!snap) return;
        const statsCard = buildPlayerStatsCard(playerDoc.data(), targetUsername);
        historySummary.innerHTML = statsCard;
        historyDocsCache = snap.docs;
        setHistoryFilter('ALL');
      })
      .catch(err => {
        if (err === 'NOT_FOUND') return;
        console.error('讀取玩家對戰紀錄失敗:', err);
        historyContent.innerHTML = '<div style="text-align:center; color:var(--Z); padding:20px; font-size:12px;">讀取失敗：' + (err.message || err) + '</div>';
      });
  }

  if (historyBtn && historyModal && closeHistoryBtn) {
    historyBtn.addEventListener('click', openHistoryModal);
    closeHistoryBtn.addEventListener('click', () => {
      historyModal.classList.add('hidden');
      const historyTitle = document.getElementById('history-title');
      if (historyTitle) historyTitle.textContent = window.t('history.title', '📜 對戰紀錄');
      _historyViewingPlayer = null;
      playSound('move');
    });
    historyBtn.addEventListener('mouseenter', () => {
      historyBtn.style.background = 'var(--O)';
      historyBtn.style.color = 'var(--bg)';
    });
    historyBtn.addEventListener('mouseleave', () => {
      historyBtn.style.background = 'transparent';
      historyBtn.style.color = 'var(--O)';
    });
  }

  // 啟動背景引擎
  engineWorker.postMessage('start');
})();