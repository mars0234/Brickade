// changelog.js
// 📝 在這裡新增 / 修改各版本的 release notes，UI 端的 game.js 會自動讀取。
// i18n: 同時提供 zh-TW 與 en 兩個版本，window.getChangelog() 依當前 lang 回傳對應陣列。

const CHANGELOG_DATA = [
  {
    version: 'v2.4.0',
    title: '極致絲滑與電競視覺升級 (2026-04-13)',
    changes: [
      '✨ 【全新視覺引擎】導入跨螢幕自適應「高幀率模式」，支援 120Hz+ 顯示器，提供如冰面滑行般的極致流暢視覺。',
      '🎯 【硬核手感保留】精心調教線性插值，X 軸左右移動與幽靈方塊強制「瞬間對齊」，在極度絲滑中完美保留指哪打哪的肌肉記憶。',
      '🎨 【對戰 HUD 升級】連線對戰上方的系統按鈕全面翻新為「毛玻璃膠囊 UI」，並採用動態節點搬移，徹底解決小螢幕破版與按鈕重疊問題。',
      '🐛 【系統修復】修復高幀率模式下消行動畫引發的畫面崩潰死當 (ReferenceError) 問題。',
      '🐛 【版面修復】修復進入多人房間時，因變數重複宣告 (Temporal Dead Zone) 導致對手畫面失蹤、版面徹底走鐘的致命錯誤。'
    ]
  },
  {
    version: "v2.3.0",
    title: "⏪ 時光倒流超能力 (2026-04-13)",
    changes: [
      "<b>時光倒流 (Undo)：</b>實裝全新反悔機制！只要方塊剛放好且未觸發消行，按下 A 鍵即可將方塊抽回重放，全模式通用。",
      "<b>無痕回溯技術：</b>使用「手術級」精準拔除方塊，完美保留對手打過來的垃圾條與炸彈，杜絕將反悔當作無敵護盾的作弊行為。",
      "<b>黑膠倒帶音效：</b>底層導入 Web Audio API 合成逼真的錄音帶高速倒轉 (Rewind) 音效，且雙方皆可聽見，強化魔法對決的沉浸感。",
      "<b>防呆機制升級：</b>倒數期間自動禁用反悔功能，並新增「已連續使用/已消行」的明確系統防呆提示。"
    ]
  },
  {
    version: "v2.2.0",
    title: "✨ UI 視覺進化與防斷線機制 (2026-04-13)",
    changes: [
      "<b>介面大整頓：</b>統一所有排行榜與 ONLINE 玩家名單的字體大小，對齊面板寬度比例，視覺更舒適。",
      "<b>防斷線機制：</b>徹底消滅 P2P「幽靈計時器」與通話碰撞漏洞，解決對戰中途無預警斷線問題。",
      "<b>競技視覺優化：</b>全面調低各項操作的「畫面震動」幅度，減少落塊誤判；AI 榜單標題改為高對比青色無光暈。",
      "<b>狀態與除錯：</b>平常未連線時顯示 Standby、進入對戰模式與 AI 模式時會自動隱藏右下角版本號與 Ping 值。"
    ]
  },
  {
    version: "v2.1.1",
    title: "🐛 AI 邏輯熱修復 (2026-04-13)",
    changes: [
      "修復了 AI 在「菜鳥」與「適應模式」下，會因為動作緩衝上限卡死而不掉落方塊（石化）的 Bug。"
    ]
  },
  {
    version: "v2.1.0",
    title: "🔥 究極街機更新 (2026-04-13)",
    changes: [
      "<b>全新搖桿支援：</b>實裝 PS4 雙蘑菇頭，支援 360 度 DJ 唱盤旋轉手感，並將旋轉綁定至 L2/R2 扳機鍵。",
      "<b>軟降速度重製：</b>鎖定競技標準 33ms，徹底修復後期關卡速度暴走 Bug。",
      "<b>時間暫停領域：</b>單機與 AI 模式全面支援暫停，並加入解除暫停的 3 秒緩衝倒數，防止節奏斷檔。",
      "<b>底層防護罩：</b>修復開局與倒數期間可偷移方塊的漏洞。",
      "<b>版本防護鎖：</b>防止不同版本的玩家連線導致宇宙錯亂。"
    ]
  },
  {
    version: "v2.0.0",
    title: "🛠️ 雙擎時代 (2026-04-01)",
    changes: [
      "導入 Web Worker 獨立背景引擎，切換網頁分頁不再斷線。",
      "效能大躍進，全面拔除高耗能的 shadowBlur 特效。"
    ]
  },
  {
    version: "v1.0.0",
    title: "🎉 遊戲正式上線 (2026-03-15)",
    changes: [
      "實裝 Firebase 雲端積分與排行榜系統。",
      "實裝 PeerJS 點對點即時對戰系統。"
    ]
  }
];

const CHANGELOG_DATA_EN = [
  {
    version: 'v2.4.0',
    title: 'Buttery-smooth & esports visual upgrade (2026-04-13)',
    changes: [
      '✨ <b>New visual engine:</b> cross-display adaptive "High FPS Mode" with 120Hz+ support — glides like ice.',
      '🎯 <b>Hardcore feel preserved:</b> carefully tuned linear interpolation; X-axis movement and ghost piece snap to grid instantly, so smoothness never costs muscle memory.',
      '🎨 <b>Battle HUD upgrade:</b> all top-row system buttons rebuilt as a "frosted-glass capsule UI" with dynamic node migration — small-screen layout no longer breaks.',
      '🐛 <b>System fix:</b> fixed a crash (ReferenceError) caused by the line-clear animation in High FPS Mode.',
      '🐛 <b>Layout fix:</b> fixed a fatal Temporal Dead Zone variable bug that made the opponent panel disappear when entering a multiplayer room.'
    ]
  },
  {
    version: 'v2.3.0',
    title: '⏪ Time-rewind superpower (2026-04-13)',
    changes: [
      '<b>Undo:</b> brand new rewind mechanic! As long as the piece just locked and no clear triggered, press A to pull it back and re-place. Works in all modes.',
      '<b>Surgical rollback:</b> "surgical-grade" piece extraction preserves all incoming garbage rows and bombs, preventing undo from being abused as an invincibility shield.',
      '<b>Vinyl rewind SFX:</b> Web Audio API synthesizes a realistic tape-rewind sound, audible to both players, for full magical-duel immersion.',
      '<b>Safety upgrade:</b> Undo is auto-disabled during the 3-2-1 countdown, with explicit "already used / already cleared" feedback.'
    ]
  },
  {
    version: 'v2.2.0',
    title: '✨ UI evolution & anti-disconnect (2026-04-13)',
    changes: [
      '<b>UI overhaul:</b> unified font sizes across all leaderboards and the ONLINE player list, matched panel widths — visually cleaner.',
      '<b>Anti-disconnect:</b> killed the P2P "ghost timer" and call-collision bug that caused unexpected mid-match disconnects.',
      '<b>Esports visual polish:</b> reduced screen-shake intensity across all actions to prevent piece misreads. AI leaderboard heading changed to high-contrast cyan with no glow.',
      '<b>Status & debug:</b> idle state now displays "Standby"; the version number and ping in the bottom-right are auto-hidden during battle and AI modes.'
    ]
  },
  {
    version: 'v2.1.1',
    title: '🐛 AI logic hotfix (2026-04-13)',
    changes: [
      'Fixed a bug where AI on "Rookie" and "Adaptive" difficulties would freeze (no piece drop) because of an action-buffer cap deadlock.'
    ]
  },
  {
    version: 'v2.1.0',
    title: '🔥 Ultimate arcade update (2026-04-13)',
    changes: [
      '<b>New gamepad support:</b> PS4 dual-stick support, 360° DJ-turntable rotation feel, with rotation bound to L2/R2 triggers.',
      '<b>Soft-drop speed remaster:</b> locked to the competitive 33ms standard, fixing the late-level speed-runaway bug.',
      '<b>Time-stop field:</b> Pause now works in solo and AI modes, with a 3-second resume countdown to keep your rhythm intact.',
      '<b>Underlying shielding:</b> fixed the exploit that allowed sneaking piece movements during the opening countdown.',
      '<b>Version lock:</b> prevents players on different versions from connecting and causing universe-bending desync.'
    ]
  },
  {
    version: 'v2.0.0',
    title: '🛠️ The dual-engine era (2026-04-01)',
    changes: [
      'Introduced an independent Web Worker background engine — switching browser tabs no longer disconnects you.',
      'Massive performance leap — removed all high-cost shadowBlur effects across the board.'
    ]
  },
  {
    version: 'v1.0.0',
    title: '🎉 Official launch (2026-03-15)',
    changes: [
      'Implemented Firebase cloud-saved scores and leaderboard system.',
      'Implemented PeerJS peer-to-peer real-time battle system.'
    ]
  }
];

// 給 game.js 用：依當前語系回傳對應的 changelog 陣列
window.getChangelog = function () {
  const lang = (window.getLang && window.getLang()) || 'zh-TW';
  return lang === 'en' ? CHANGELOG_DATA_EN : CHANGELOG_DATA;
};
