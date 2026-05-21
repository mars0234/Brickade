// === BRICKADE i18n ===
// 用法：
//   HTML  : <button data-i18n="btn.practice">進入練習模式</button>
//           （DOMContentLoaded 後 textContent 會被替換為當前語系字串）
//   HTML  : <input data-i18n-placeholder="multiplayer.opponentId">
//   HTML  : <button data-i18n-title="btn.fullRulesTooltip">
//   JS    : element.textContent = t('btn.connect');
//   切語系: setLang('en') 會 reload 頁面套用全部翻譯
//   讀語系: getLang() 回傳 'zh-TW' 或 'en'
//
// 新增字串：在 LOCALES.zh-TW 與 LOCALES.en 兩邊都加一條 key→value
// 找不到 key 時 fallback 順序：當前語系 → zh-TW → 傳入的 fallback → key 本身

(() => {
  const LOCALES = {
    'zh-TW': {
      // === Top action buttons ===
      'btn.practice': '🟨 進入練習模式',
      'btn.multiplayer': '🌐 多人對戰',
      'btn.comboRoom': '⚡ 進入 COMBO ROOM',
      'btn.freeMode': '🧩 進入自由排版',
      'btn.aiBattle': '🤖 AI 對戰',
      'btn.matchHistory': '📜 對戰紀錄',
      'btn.changePassword': 'CHANGE PASSWORD',
      'btn.logout': 'LOGOUT',
      'btn.connect': 'CONNECT',
      'btn.fpsMode': '✨ 高幀率模式',
      'btn.fullRules': '📖 完整規則 & 計分',

      // === Player / Multiplayer panels ===
      'player.welcomeBack': 'Welcome back,',
      'multiplayer.statusStandby': 'Status: Standby',
      'multiplayer.opponentIdPh': 'Opponent ID',

      // === Multiplayer (7-player) mode ===
      'multiplayer.slotEmpty': 'EMPTY',
      'multiplayer.reconnecting': '重連中',
      'multiplayer.eliminated': '淘汰',
      'multiplayer.targetRandom': '🎲 RANDOM',
      'multiplayer.targetCounter': '🔁 COUNTER',
      'multiplayer.targetThreat': '💀 K.O',
      'multiplayer.targetEliminate': '⚠️ ELIM',
      'multiplayer.hostSettings': '🎮 房主設定',
      'multiplayer.roomCodeLabel': '房間代碼',
      'multiplayer.copyCode': '📋 複製',
      'multiplayer.copied': '已複製！',
      'multiplayer.waitingForPlayers': '等待玩家加入…',
      'multiplayer.winCondLastSurvivor': '最後存活者',
      'multiplayer.winCondTimedRank': '計時排名 (2 分鐘)',
      'multiplayer.winCondHybrid': '混合 (5 分鐘保險)',
      'multiplayer.winCondLabel': '勝利條件',
      'multiplayer.modeLabel': '對戰模式',
      'multiplayer.title': '多人對戰房間',
      'multiplayer.inviteFromOnline': '從 ONLINE 直接邀請好友',
      'multiplayer.joinByCode': '輸入代碼加入',
      'multiplayer.joinBtn': 'JOIN',
      'multiplayer.joinNotFound': '找不到房間代碼',
      'multiplayer.roomFull': '房間已滿',
      'multiplayer.roomClosed': '房主已關閉房間',
      'multiplayer.peerNotReady': '連線初始化中，請稍候再試',
      'multiplayer.searching': '查詢中…',
      'multiplayer.joinError': '加入失敗：',
      'multiplayer.waitingPlayers': 'Status: 等待玩家加入…',
      'multiplayer.clickReady': 'Status: 按 READY 開始',
      'multiplayer.waitOppReady': 'Status: 等待對手準備…',
      'multiplayer.oppReadyClickReady': 'Status: 對手已準備，按 READY',
      'multiplayer.allReady': 'Status: 全員就緒，準備開始…',
      'mp.youWin': '🎉 你是最後存活者！',
      'mp.youLose': '💀 你被淘汰',
      'mp.matchEnd': '對戰結束',
      'mp.spectating': '👀 觀戰中…',
      'mp.spectatorStatus': 'Status: 觀戰中，等本局結束…',
      'mp.timedWin': '🏆 第 1 名！',
      'mp.timedRank': '你第 {rank} 名',
      'multiplayer.invitedToRoom': '邀請你加入多人房間',
      'multiplayer.createRoom': '建立房間',
      'multiplayer.leaveRoom': '🚪 離開房間',
      'multiplayer.minPlayers': '至少 2 人即可開始',
      'mp.inviteToRoomLabel': '邀請你加入多人對戰房間',
      'mp.hostLeftForBattle': '⚠️ 房主 {user} 烙跑去跟別人對戰了！房間已關閉。',
      'mp.playerLeftForBattle': 'ℹ️ {user} 烙跑去跟別人 1v1 對戰了',
      'mp.playerLeftRoom': 'ℹ️ {user} 離開了房間',
      'mp.inviteRejected': '💔 對方拒絕了你的多人對戰邀請',
      'mp.hostReadyLocked': '已 READY，需取消 READY 才能修改設定',
      'multiplayer.winner': '勝利',

      // === Top 3 panels ===
      'top3.aiKillerDesc': '限定高手模式 (不含AI自爆)',

      // === Controls list（按鍵符號 <b>...</b> 與冒號保留 hardcode；只翻譯描述部分）===
      'controls.move': '左右移動',
      'controls.softDrop': '軟降 (加速下落)',
      'controls.hardDrop': '硬降 (瞬間落下)',
      'controls.rotateCW': '順時針旋轉',
      'controls.hold': '保留方塊 (Hold)',
      'controls.pause': '暫停 / 繼續遊戲',
      'controls.restart': '重新開始 / 對戰後離開房間',
      'controls.undo': '反悔 (Undo 上一步)',

      // === Rules modal intro ===
      'rules.intro': '掌握這些按鍵，你才能在 BRICKADE 世界隨心所欲。',

      // === AI 設定面板 ===
      'ai.title': '🤖 AI 設定',
      'ai.speedDifficulty': '⚡ 速度 / 難度',
      'ai.style': '📐 打法風格（右側保留坑寬）',
      'ai.rookie': '🐢 菜鳥',
      'ai.casual': '😊 休閒',
      'ai.adaptive': '🎯 適應模式（跟著你的手速）',
      'ai.adaptiveTip': '依你的下子速度動態調整 AI 反應快慢',
      'ai.pro': '💀 高手',
      'ai.god': '👾 神',
      'ai.auto': '🧠 自動（AI 自行決策）',

      // === Player stats tooltips（hover 時顯示）===
      'tip.rank': '點擊查看段位規則',
      'tip.match': '總對戰場次',
      'tip.winRate': '勝率 = 勝場 ÷ 總場次',
      'tip.avgApm': 'Attack Per Minute（平均每分鐘送出的攻擊行數）',
      'tip.avgPps': 'Pieces Per Second（平均每秒放下的方塊數）',
      'tip.avgCombo': '生涯場均最高連擊（每局 Max Combo 的平均值）',
      'tip.totalKo': '累積擊倒對手次數（把對手 Top Out 一次算一次）',

      // === Login form ===
      'login.usernamePh': 'Username (中/英文皆可)',
      'login.passwordPh': 'Password (至少6位)',

      // === Match history modal ===
      'history.title': '📜 對戰紀錄',

      // === Rank tiers（在 PLAYER 框、TOP 3 RANK 排行榜、對手框、段位 modal 都會用）===
      'rank.bronze': '銅牌',
      'rank.silver': '銀牌',
      'rank.gold': '金牌',
      'rank.platinum': '白金',
      'rank.diamond': '鑽石',
      'rank.master': '大師',
      'rank.elite': '菁英',

      // === 對手框戰績文字（"金牌 (423 LP) | 勝率: 56%"）===
      'opp.winRatePrefix': ' | 勝率: ',
      'opp.waitingForReady': '等待對手準備',

      // === 登入 / 註冊 toast & alert ===
      'login.emptyFields': '請輸入名稱與密碼！',
      'login.registerSuccess': '🎉 註冊成功！歡迎加入 BRICKADE，{user}！',
      'login.passwordOrTaken': '密碼錯誤！或者這個名稱被別人用囉。',
      'login.errorPrefix': '發生錯誤：',

      // === 對戰流程 toast & status ===
      'battle.oppSurrendered': '🎉 對手已投降！你獲得了本局勝利！',
      'battle.cancelReady': '↩️ 已取消 READY，可重新選擇模式',
      'battle.waitingMode': '⏳ 等待對手選擇模式...',
      'battle.modeAgreed': '✅ 模式一致，可以按下 READY 開始',
      'battle.oppDisconnect': '⚠️ 對手已斷線或離開遊戲！本局不結算。',
      'battle.connectionLost': '⚠️ 連線已中斷，返回單人模式。',
      'battle.inviteRejected': '💔 對方拒絕了你的對戰邀請！',
      'battle.oppCancelReady': '↩️ 對手取消了 READY',
      'battle.confirmSurrender': '確定要投降嗎？這將會讓對手直接獲得 1 勝！',

      // === TOP 3 RANK 排行榜 內欄位 ===
      'leaderboard.winRateLabel': '勝率',
      'leaderboard.wins': '勝',
      'leaderboard.matches': '場',

      // === 段位說明 modal（renderRankModal）===
      'rankModal.section.tierLadder': '段位階梯',
      'rankModal.section.winBonus': '勝場加分',
      'rankModal.section.lossPenalty': '敗場扣分 & 保護',
      'rankModal.section.bullyProtection': '虐菜保護機制',
      'rankModal.section.validMatch': '有效對戰條件',
      'rankModal.youAreHere': '◀ 你在這',
      'rankModal.winRule1': `▸ 基礎 <b style="color:var(--S);">+20</b>，對手比你高 100+ LP <b style="color:var(--S);">+10</b>、高 200+ LP <b style="color:var(--S);">+15</b>`,
      'rankModal.winRule2': `▸ 連勝 2+ 場 <b style="color:var(--O);">+5</b>、連勝 5+ 場 <b style="color:var(--O);">+10</b>（僅正常對戰生效）`,
      'rankModal.winRule3': `▸ 單局破 15,000 分 <b style="color:var(--O);">+5</b>（僅正常對戰生效）`,
      'rankModal.loseRule1': `▸ 基礎 <b style="color:var(--Z);">-15</b>；鑽石以上 <b style="color:var(--Z);">-20</b>；菁英 <b style="color:var(--Z);">-25</b>`,
      'rankModal.loseRule2': `▸ 輸給高你 200+ LP 的強者，扣分 <b style="color:var(--I);">減半</b>`,
      'rankModal.loseRule3': `▸ <b style="color:var(--I);">連輸 3 場</b>自動觸發一場保底（本場不扣分）`,
      'rankModal.bullyIntro': `當你比對手高出一個以上段位時，LP 收益會<b style="color:var(--Z);">大幅遞減</b>：`,
      'rankModal.bullyL1': '對手低 200~299 LP',
      'rankModal.bullyL1Reward': '+5 LP（無獎勵）',
      'rankModal.bullyL2': '對手低 300~399 LP',
      'rankModal.bullyL2Reward': '+1 LP（象徵性）',
      'rankModal.bullyL3': '對手低 400+ LP',
      'rankModal.bullyL3Reward': '0 LP（算勝場但不計連勝）',
      'rankModal.bullyDailyLimit': `▸ 每日虐菜勝場<b style="color:var(--Z);"> 上限 2 場</b>，第 3 場起 LP 收益全部歸零，台灣時間每日凌晨 00:00 重置。`,
      'rankModal.bullyHint': '想持續上分？請挑戰同段位或更強的對手 💪',
      'rankModal.validIntro': `以下情況<b style="color:var(--Z);">不會</b>列入排位：`,
      'rankModal.validItem1': '任一方未登入、為訪客或管理員模式',
      'rankModal.validItem2': '時間到時，任一方分數未達 1,000 分',
      'rankModal.validItem3': 'AI 對戰（練習模式）',

      // === 對戰紀錄 modal（renderHistoryList）===
      'history.empty': '這個分類裡還沒有任何紀錄。',
      'history.recentPrefix': '近 ',
      'history.recentSuffix': ' 場',
      'history.summaryWin': '勝',
      'history.summaryLose': '負',
      'history.summaryDraw': '平',
      'history.fallbackMe': '我',
      'history.colMe': '我',
      'history.colOpp': '對手',
      'history.statLines': '消行',
      'history.statAttack': '攻擊',
      'history.tipLines': '本局自己盤面消掉的總行數',
      'history.tipAttack': '本局送給對手的垃圾行數（攻擊表計算，例如 Quad=4 行、T-Spin Double=4 行）',
      'history.tipKO': '本局擊倒對手次數（把對手 Top Out 一次算一次）',
      'history.tipMaxC': 'Max Combo：本局最高連擊數（連續消行的最大次數）',
      'history.tipAPM': 'Attack Per Minute：平均每分鐘送出的攻擊行數',
      'history.tipPPS': 'Pieces Per Second：平均每秒放下的方塊數',
      'history.tipDuration': '本局持續時間（不含開場 3-2-1 倒數）',
      'history.reasonSurrender': '投降',
      'history.reasonOppSurrender': '對手投降',
      'history.reasonTimeout': '時間到',
      'history.filterAll': '全部',
      'history.filterWin': '勝',
      'history.filterLose': '負',

      // === 完整規則 modal — SOLO tab ===
      'rules.solo.intro': `單人模式的核心是 <b style="color:var(--O);">消行 → 得分 → 升級 → 變快</b>。越高級分數倍率越高，但速度也越恐怖。`,
      'rules.solo.scoreHeader': '🎯 消行基礎分',
      'rules.solo.scoreNote': '(最終分 = 基礎分 × Level)',
      'rules.solo.colTechnique': '技巧',
      'rules.solo.colBaseScore': '基礎分',
      'rules.solo.rowSingle': 'Single（單列）',
      'rules.solo.rowDouble': 'Double（雙列）',
      'rules.solo.rowTriple': 'Triple（三列）',
      'rules.solo.rowQuad': 'Quad（四列） 🏆',
      'rules.solo.rowMiniTSpin': 'Mini T-Spin (無消行)',
      'rules.solo.rowTSpinNoClear': 'T-Spin (無消行)',
      'rules.solo.tspinTip': `<b style="color:var(--T);">💡 注意：</b>T-Spin / Mini T-Spin <b>即使沒消行也有得分</b>（T-Spin 400、Mini T-Spin 100，× Level），所以看到紫色特效就代表你賺到了！`,
      'rules.solo.bonusHeader': '🔥 加成規則',
      'rules.solo.b2bTitle': 'B2B 連擊',
      'rules.solo.b2bDesc': `連續施展 Quad 或 T-Spin 消行，基礎分 <b style="color:var(--O);">× 1.5</b>。`,
      'rules.solo.comboTitle': 'Combo 連消',
      'rules.solo.comboDesc': `連續消行 N 次，額外 <b style="color:var(--S);">+50 × N</b> 分。`,
      'rules.solo.softDropDesc': `手動按 ↓ 每下降 1 格 <b style="color:var(--I);">+1 分</b>（破最低紀錄）。`,
      'rules.solo.hardDropDesc': `按 Space 每下落 1 格 <b style="color:var(--T);">+2 分</b>。`,
      'rules.solo.levelHeader': '⚡ Level 與速度曲線',
      'rules.solo.levelDesc': `每消 <b style="color:var(--O);">10 行</b> 升 1 級。下落速度公式：<code style="color:var(--I); background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px; font-size:11.5px;">(0.8 − (L−1)×0.007)^(L−1) 秒/格</code>`,
      'rules.solo.colSpeed': '每格下落時間',
      'rules.solo.colFeel': '感受',
      'rules.solo.feel1': '悠閒',
      'rules.solo.feel5': '開始變緊',
      'rules.solo.feel10': '飆速',
      'rules.solo.feel15': '極限反應',
      'rules.solo.feel20': '20G — 瞬間貼地',

      // === 完整規則 modal — BATTLE tab ===
      'rules.battle.intro': `對戰模式你要做的是 <b style="color:var(--Z);">消更多行、送更多垃圾、把對手頂上天</b>。重力固定 1 秒 1 格，時長 <b style="color:var(--Z);">2 分鐘</b>。`,
      'rules.battle.attackHeader': '⚔️ 垃圾行攻擊表',
      'rules.battle.colTechnique': '技巧',
      'rules.battle.colSent': '送出垃圾行',
      'rules.battle.colB2B': 'B2B 版本 🔥',
      'rules.battle.rowPerfectClear': `<b>PERFECT CLEAR</b> ⭐`,
      'rules.battle.rowPerfectClearReward': `<b>額外 +10 行</b>（最兇的一擊！）`,
      'rules.battle.attackB2BExp': `<b style="color:var(--O);">🔥 B2B = Back-to-Back：</b>連續施展 <b>Quad</b> 或 <b>T-Spin</b>（中間不能插入普通 Single/Double/Triple），第二次起就會觸發 B2B 版本的加量攻擊。高手連續 B2B TSD 就是一波 6 行 6 行地送！`,
      'rules.battle.comboHeader': '🌀 Combo 額外攻擊',
      'rules.battle.comboColCount': '連續消行次數',
      'rules.battle.comboColExtra': '額外送出',
      'rules.battle.comboLine1': '+1 行',
      'rules.battle.comboLine2': '+2 行',
      'rules.battle.comboLine3': '+3 行',
      'rules.battle.comboLine4Cap': `<b>+4 行</b>（上限）`,
      'rules.battle.cancellationHeader': '🛡️ 垃圾抵銷 & 寬限期',
      'rules.battle.cancellationDesc': `對手送來的垃圾會先以 <b style="color:var(--O);">🟡 黃色警告條</b> 停留 <b style="color:var(--O);">2 秒</b>，這段期間只要你成功消行，攻擊可以<b style="color:var(--I);">反打抵銷</b>！<br>時間一過就變成 <b style="color:var(--Z);">🔴 紅色危險條</b>，下次落地就會從盤底真的頂上來。<br><br><b style="color:var(--I);">抵銷順序：</b>你的攻擊 → 先抵自己的 🔴 紅色 → 再抵 🟡 黃色 → 有剩才送給對手。`,
      'rules.battle.koHeader': '💀 KO 判定',
      'rules.battle.koReviveTitle': '✅ 被 KO 可復活',
      'rules.battle.koReviveDesc': `頂到天花板時，盤上<b>有垃圾行</b> → 被 KO 但復活，對手 <b>+1 KO</b>，比賽繼續。`,
      'rules.battle.topOutTitle': '❌ TOP OUT 直接輸',
      'rules.battle.topOutDesc': `頂到天花板時，盤上<b>沒有垃圾行</b>（是你自己堆上去的） → 直接落敗。`,
      'rules.battle.gracePeriod': `<b style="color:var(--T);">🤝 死亡寬限期：</b>雙方在 300ms 內幾乎同時死亡 → 判定 <b>平手（DRAW）</b>，吸收網路延遲造成的「搶先一步」不公平。`,
      'rules.battle.winHeader': '🏅 勝負 & 段位',
      'rules.battle.winRule': `時間結束時，<b style="color:var(--Z);">KO 較多者獲勝</b>；KO 相同則比較 <b>LINES SENT</b>。贏了加 LP 爬段位，輸了扣 LP。<br><span style="color:var(--T);">📖 完整段位規則請到左側 <b>PLAYER 框</b>，點擊你目前的段位文字即可查看。</span>`,

      // === 規則 modal — OPERATION tab 控制列 ===
      'rules.op.move': '左右移動',
      'rules.op.softDrop': '軟降 Soft Drop',
      'rules.op.softDropBonus': '(+1 分 / 格)',
      'rules.op.hardDrop': '硬降 Hard Drop',
      'rules.op.hardDropBonus': '(+2 分 / 格)',
      'rules.op.rotateCW': '順時針旋轉',
      'rules.op.rotateCCW': '逆時針旋轉',
      'rules.op.hold': '保留 Hold',
      'rules.op.holdNote': '(每顆限用一次)',
      'rules.op.pause': '暫停 / 繼續',
      'rules.op.restart': '重新開始 / 對戰後離開房間',
      'rules.op.undo': 'Undo 反悔上一步',
      'rules.op.muteToggle': '音樂 / 音效靜音',
      'rules.op.volume': '遊戲音量大 / 小',
      'rules.op.emote': '發送表情',
      'rules.op.emoteNote': '(對戰)',
      'rules.op.surrender': '連按兩下投降',
      'rules.op.surrenderNote': '(對戰中)',
      'rules.op.tipLabel': '💡 Tip：',
      'rules.op.tipText': 'Hold (C) 是高手的必備工具，存下 I 型方塊等大招會讓你火力翻倍！',

      // === Combo Room 設定面板 ===
      'comboRoom.widthLabel': '📐 場地寬度',
      'comboRoom.iWarning': '⚠️ 3-Wide 的 I 方塊會自動鎖死直立姿態。',
      'comboRoom.rulesText': '📜 規則：掉落速度固定，盡量拉高 COMBO。',
      'comboRoom.notRanked': '不計排名、不上傳最高分。',

      // === Free Placement 設定面板 ===
      'free.gravityLabel': '⬇️ 自然落下',
      'free.gravityOff': '關（手動）',
      'free.gravityOn': '開（固定速度）',
      'free.queueLabel': '🎴 NEXT / QUEUE',
      'free.queueOff': '關閉（純手選）',
      'free.queueOn': '隨機產生',
      'free.numberKeyHeader': '⌨️ 數字鍵 → 方塊',
      'free.clearAllTooltip': '清空整個遊戲場，玩家可以重新擺放方塊（Score / Lines / Combo 也會歸零）',
      'free.rulesText': '📜 規則：10 格滿寬場地，自由練習擺位。',
      'free.notRanked': '不計排名、不上傳最高分。',

      // === 練習模式 ===
      'practice.btnExit': '🟩 離開練習模式',
      'practice.subtitle': '(練習模式，不計排名)',
      'practice.chooseSubMode': '請先選擇 COMBO ROOM 或 自由排版',

      // === ONLINE 框 玩家狀態列 ===
      'online.idle': '大廳閒置',
      'online.single': '單機闖關中',
      'online.practice': '深山修行中',
      'online.aiBattle': '與 AI 激戰中',
      'online.multiplayer': '雙人對戰中',
      'online.mpRoom': '多人房間中',
      'online.spectating': '👀 觀戰中',
      'online.away': '離開 (閒置中)',

      // === MATCH MODE 面板 ===
      'matchMode.bombDesc': '炸彈引爆消行',
      'matchMode.classicDesc': '原版垃圾行',
      'matchMode.pickYou': '✓ 你',
      'matchMode.pickOpp': '對手',
      'matchMode.rulesHeader': `📜 雙方需選擇 <b style="color:var(--S);">相同模式</b>，才能按下 READY 開始遊戲。`,
      'matchMode.bombRule': '💣 BOMB：垃圾洞口是炸彈，落上方引爆。',
      'matchMode.classicRule': '🧱 CLASSIC：垃圾洞口是空格，填滿即可消除。',
      'matchMode.modeMismatch': '⚠️ 對手選擇了 {mode}，模式不同無法開始',

      // === 一般 toast / alert / confirm ===
      'toast.confirmLeaveBattle': '確定要離開對戰房間，回到單人模式嗎？',
      'toast.inviteResent': '已向 {user} 再次發送邀請！',
      'toast.inviteSent': '已向 {user} 發送邀請！',
      'toast.inviteTimeout': '⚠️ 對 {user} 的邀請已超時',
      'toast.cantConnectSelf': '不能跟自己連線啦！',
      'battle.waitForMode': '⏳ 請等待對手選擇對戰模式',
      'battle.modeMismatchToast': '⚠️ 雙方模式不一致，無法開始',
      'toast.tooSlow': '😭 慢了一步！對方已經跟別人開始遊戲了！',
      'toast.oppInGame': '⚠️ 對方正在遊戲中',
      'toast.versionMismatch': '❌ 連線失敗：版本不一致！\n\n請確認雙方都更新到最新版！',
      'toast.specEnded': '👀 {user} 結束了觀戰',
      'battle.mutualKO': '🤝 雙方同時 Top Out，平局！',
      'battle.oppDrowned': '🎉 對手被方塊淹沒了！',
      'battle.oppLeftForOther': '💔 對手無情地拋棄了你，跟別人跑了！',
      'battle.notRanked': '⚠️ 本局未列入排位積分 (LP) 計算\n\n{reason}\n\n✨ 提示：雙方都需要達到 1000 分且時間耗盡 (或有一方投降)，才會計入段位與對戰紀錄。',
      'toast.cantUndo': '⚠️ 無法反悔 (已消行、炸彈，或已用過一次)！',
      'battle.surrenderHint': '⚠️ 確定要投降？請快速連按兩下 F 鍵！',
      'toast.aiReady': '🤖 AI 對手已就緒！可調整設定後按 READY 開始對戰',
      'toast.inviteRateLimit': '⏳ 邀請發送太頻繁，請等 3 秒...',
      'history.loginRequired': '請先登入才能查看對戰紀錄！',
      'cloud.readFailed': '讀取雲端存檔失敗！被 Firebase 擋住了，請按 F12 查看錯誤訊息。',

      // === 觀戰相關 ===
      'spectate.youStarted': '👀 {user} 開始觀戰你！',
      'spectate.fallbackUser': '某玩家',
      'spectate.alreadySpec': '⚠️ 你已經在觀戰其他玩家',
      'spectate.battleNoSpec': '⚠️ 對戰中無法觀戰',
      'spectate.notReady': '⚠️ 連線尚未就緒',
      'spectate.cantSelf': '⚠️ 不能觀戰自己',
      'spectate.willInterrupt': '⚠️ 進入觀戰將中斷你目前的遊戲',
      'spectate.connecting': '正在連線到 {user}...',
      'spectate.notFound': '⚠️ 找不到此玩家',
      'spectate.userOffline': '⚠️ 此玩家未上線',
      'spectate.timeout': '⚠️ 連線超時',
      'spectate.closed': '👀 觀戰連線已關閉',
      'spectate.failed': '⚠️ 觀戰連線失敗',
      'spectate.failedReason': '⚠️ 觀戰失敗：{reason}',
      'spectate.unknownError': '未知錯誤',
      'spectate.reasonPractice': '對方在練習模式，無法觀戰',
      'spectate.reasonFull': '觀戰人數已滿 ({cur}/{max})',
      'spectate.reasonBusy': '對方目前無法被觀戰',
      'spectate.reasonPhasePending': '對戰中觀戰功能即將開放',
      'spectate.reasonGeneric': '無法觀戰',
      'spectate.endHostLeft': '對方離開了遊戲',
      'spectate.endGameEnd': '對方結束了這局',
      'spectate.endDisconnect': '對方斷線了',
      'spectate.endUnstable': '連線不穩，已斷開觀戰',
      'spectate.endReturn': '對方返回了主畫面',
      'spectate.endEnteredBattle': '對方進入了對戰模式',
      'spectate.endEnteredPractice': '對方進入了練習模式',
      'spectate.endGeneric': '觀戰結束',
      'spectate.disconnected': '⚠️ 觀戰連線中斷',
      'spectate.startWatching': '👀 開始觀戰 {user}',
      'spectate.fallbackPlayer': '玩家',
      'spectate.leaveBtn': '✕ 離開觀戰',
      'spectate.hostOffline': '👀 對方已離線，觀戰結束',
      'spectate.btnTitle.normal': '觀戰此玩家',
      'spectate.btnTitle.practice': '練習模式不可觀戰',
      'spectate.btnTitle.spectating': '對方正在觀戰，無法被觀戰',
      'spectate.btnTitle.alreadySpec': '你已在觀戰其他玩家',
      'spectate.btnTitle.battle': '對戰中無法觀戰',
      'spectate.btnTitle.notReady': '連線尚未就緒',

      // === 聊天 ===
      'chat.newMessage': '💬 {sender} 傳送了一則新訊息',
      'chat.pickPlayer': '⚠️ 請先點擊對話框左上角「Player ▼」選擇聊天對象！',
      'chat.fetchingPlayer': '⚠️ 正在取得玩家連線資訊，請稍後重試',

      // === 密碼修改 ===
      'pwd.changeSuccess': '密碼修改成功！下次請使用新密碼登入。',
      'pwd.changeFailed': '修改失敗：{err}\n(為了安全性，您可能需要登出再重新登入一次才能修改密碼)',
      'pwd.tooShort': '密碼長度必須至少 6 個字元！',

      // === Admin 功能 ===
      'admin.emptyName': '請輸入目標玩家名稱！',
      'admin.notFound': '找不到這個玩家！',
      'admin.emptyValues': '請至少輸入一項要修改的數值！',
      'admin.modifySuccess': '成功修改玩家 {user} 的數據！\n(請該玩家重新登入，或打完一局結算後就會更新畫面)',
      'admin.modifyFailed': '修改失敗！',
      'admin.wrongPassword': '密碼錯誤！請輸入您登入此帳號的正確密碼。',
      'admin.resetSuccess': '🎉 賽季重置完成！全伺服器玩家已歸零。',
      'admin.resetFailed': '重置失敗！請檢查網路。',

      // === 模式切換按鈕（toggle 文字）===
      'btn.fpsModeLock60': '🧱 鎖定 60FPS',
      'battle.cancelReadyBtn': '✕ 取消 READY',
      'btn.comboRoomExit': '🟩 離開 COMBO ROOM',
      'btn.freeModeExit': '🟩 離開自由排版',
      'spectate.readOnlySync': '👀 唯讀同步中',

      // === 雜項 ===
      'battle.btnWaitingOpp': '等待對手...',
      'battle.btnModeMismatch': '模式不一致',
      'spectate.toastNoSpec': '無法觀戰',
      'pwd.promptNewPwd': '請輸入新密碼 (至少 6 位數)：',
      'rankModalTitle': '🏆 段位規則',

      // === AI 打法風格 hint（按 1-wide / 2-wide / Auto 等按鈕後出現的說明）===
      'aiHint.auto': '🧠 AI 自行選擇最佳落點，追求 Quad 建塔策略',
      'aiHint.1': '1-wide：右側留 1 列深坑，用 I 磚反覆插坑，適合練 Quad 節奏',
      'aiHint.2': '2-wide：右側留 2 列，穩定版 Quad 策略，適合中高難度 AI',
      'aiHint.3': '3-wide：右側留 3 列，兼顧平整與消行，節奏型打法',
      'aiHint.4': '4-wide Combo：右側留 4 列通道，每顆方塊都消行，持續 Combo 輸出！',

      // === Game state ===
      'game.gameOver': 'GAME OVER',
      'game.pressR': 'Press R to restart',
      'game.pressEnter': 'PRESS ENTER',
      'game.toStart': 'TO START',
      'game.you': 'You',

      // === Language switcher (顯示「按下後會切到」的語言) ===
      'lang.toggle': '🌐 EN',
    },

    'en': {
      // === Top action buttons ===
      'btn.practice': '🟨 Practice Mode',
      'btn.multiplayer': '🌐 Multiplayer',
      'btn.comboRoom': '⚡ Combo Room',
      'btn.freeMode': '🧩 Free Placement',
      'btn.aiBattle': '🤖 AI Battle',
      'btn.matchHistory': '📜 Match History',
      'btn.changePassword': 'Change Password',
      'btn.logout': 'Logout',
      'btn.connect': 'Connect',
      'btn.fpsMode': '✨ High FPS Mode',
      'btn.fullRules': '📖 Full Rules & Scoring',

      // === Player / Multiplayer panels ===
      'player.welcomeBack': 'Welcome back,',
      'multiplayer.statusStandby': 'Status: Standby',
      'multiplayer.opponentIdPh': 'Opponent ID',

      // === Multiplayer (7-player) mode ===
      'multiplayer.slotEmpty': 'EMPTY',
      'multiplayer.reconnecting': 'Reconnecting',
      'multiplayer.eliminated': 'OUT',
      'multiplayer.targetRandom': '🎲 RANDOM',
      'multiplayer.targetCounter': '🔁 COUNTER',
      'multiplayer.targetThreat': '💀 K.O',
      'multiplayer.targetEliminate': '⚠️ ELIM',
      'multiplayer.hostSettings': '🎮 Host Settings',
      'multiplayer.roomCodeLabel': 'Room Code',
      'multiplayer.copyCode': '📋 Copy',
      'multiplayer.copied': 'Copied!',
      'multiplayer.waitingForPlayers': 'Waiting for players…',
      'multiplayer.winCondLastSurvivor': 'Last Survivor',
      'multiplayer.winCondTimedRank': 'Timed Rank (2 min)',
      'multiplayer.winCondHybrid': 'Hybrid (5 min cap)',
      'multiplayer.winCondLabel': 'Win Condition',
      'multiplayer.modeLabel': 'Battle Mode',
      'multiplayer.title': 'Multiplayer Room',
      'multiplayer.inviteFromOnline': 'Invite from ONLINE list',
      'multiplayer.joinByCode': 'Enter Code to Join',
      'multiplayer.joinBtn': 'JOIN',
      'multiplayer.joinNotFound': 'Room code not found',
      'multiplayer.roomFull': 'Room is full',
      'multiplayer.roomClosed': 'Host closed the room',
      'multiplayer.peerNotReady': 'Connection not ready, please retry',
      'multiplayer.searching': 'Searching…',
      'multiplayer.joinError': 'Join failed: ',
      'multiplayer.waitingPlayers': 'Status: Waiting for players…',
      'multiplayer.clickReady': 'Status: Click READY to start',
      'multiplayer.waitOppReady': 'Status: Waiting for opponents to ready…',
      'multiplayer.oppReadyClickReady': 'Status: Opponents ready, click READY',
      'multiplayer.allReady': 'Status: All ready, starting soon…',
      'mp.youWin': '🎉 You are the last survivor!',
      'mp.youLose': '💀 You were eliminated',
      'mp.matchEnd': 'Match over',
      'mp.spectating': '👀 Spectating…',
      'mp.spectatorStatus': 'Status: Spectating, waiting round end…',
      'mp.timedWin': '🏆 1st place!',
      'mp.timedRank': 'You ranked #{rank}',
      'multiplayer.invitedToRoom': 'invites you to a multiplayer room',
      'multiplayer.createRoom': 'Create Room',
      'multiplayer.leaveRoom': '🚪 Leave Room',
      'multiplayer.minPlayers': 'Min 2 players to start',
      'mp.inviteToRoomLabel': 'invites you to a multiplayer room',
      'mp.hostLeftForBattle': '⚠️ Host {user} ditched the room for a 1v1 battle! Room closed.',
      'mp.playerLeftForBattle': 'ℹ️ {user} left to play a 1v1 battle',
      'mp.playerLeftRoom': 'ℹ️ {user} left the room',
      'mp.inviteRejected': '💔 Your multiplayer invite was rejected',
      'mp.hostReadyLocked': 'Cancel READY before changing settings',
      'multiplayer.winner': 'WIN',

      // === Top 3 panels ===
      'top3.aiKillerDesc': 'Highest-difficulty AI only (no self-destructs)',

      // === Controls list（按鍵符號 <b>...</b> 與冒號保留 hardcode；只翻譯描述部分）===
      'controls.move': 'Move left / right',
      'controls.softDrop': 'Soft drop (accelerate)',
      'controls.hardDrop': 'Hard drop (instant)',
      'controls.rotateCW': 'Rotate clockwise',
      'controls.hold': 'Hold piece',
      'controls.pause': 'Pause / Resume',
      'controls.restart': 'Restart / Leave room',
      'controls.undo': 'Undo last move',

      // === Rules modal intro ===
      'rules.intro': 'Master these keys to dominate the BRICKADE arena.',

      // === AI panel ===
      'ai.title': '🤖 AI Settings',
      'ai.speedDifficulty': '⚡ Speed / Difficulty',
      'ai.style': '📐 Strategy (right-side well width)',
      'ai.rookie': '🐢 Rookie',
      'ai.casual': '😊 Casual',
      'ai.adaptive': '🎯 Adaptive',
      'ai.adaptiveTip': 'AI dynamically matches your placement speed',
      'ai.pro': '💀 Pro',
      'ai.god': '👾 God',
      'ai.auto': '🧠 Auto (AI decides)',

      // === Player stats tooltips ===
      'tip.rank': 'Click to view rank rules',
      'tip.match': 'Total matches played',
      'tip.winRate': 'Win rate = Wins ÷ Total matches',
      'tip.avgApm': 'Attack Per Minute (avg attack lines sent per minute)',
      'tip.avgPps': 'Pieces Per Second (avg pieces placed per second)',
      'tip.avgCombo': 'Career-average max combo per match',
      'tip.totalKo': 'Total opponents knocked out (top-outs)',

      // === Login form ===
      'login.usernamePh': 'Username',
      'login.passwordPh': 'Password',

      // === Match history modal ===
      'history.title': '📜 Match History',

      // === Rank tiers ===
      'rank.bronze': 'Bronze',
      'rank.silver': 'Silver',
      'rank.gold': 'Gold',
      'rank.platinum': 'Platinum',
      'rank.diamond': 'Diamond',
      'rank.master': 'Master',
      'rank.elite': 'Elite',

      // === Opponent panel stats text ===
      'opp.winRatePrefix': ' | Win Rate: ',
      'opp.waitingForReady': 'Waiting for opponent...',

      // === Login / register toasts & alerts ===
      'login.emptyFields': 'Please enter your username and password!',
      'login.registerSuccess': '🎉 Registered! Welcome to BRICKADE, {user}!',
      'login.passwordOrTaken': 'Wrong password — or that name is already taken.',
      'login.errorPrefix': 'Error: ',

      // === Battle flow toasts & status ===
      'battle.oppSurrendered': '🎉 Opponent surrendered! You win this match!',
      'battle.cancelReady': '↩️ READY cancelled — you can reselect a mode',
      'battle.waitingMode': '⏳ Waiting for opponent to pick a mode...',
      'battle.modeAgreed': '✅ Modes match — press READY to begin',
      'battle.oppDisconnect': '⚠️ Opponent disconnected or left. Match not counted.',
      'battle.connectionLost': '⚠️ Connection lost. Back to single-player.',
      'battle.inviteRejected': '💔 Opponent declined your battle invite!',
      'battle.oppCancelReady': '↩️ Opponent cancelled READY',
      'battle.confirmSurrender': 'Surrender? Your opponent gets 1 win.',

      // === Leaderboard inner labels ===
      'leaderboard.winRateLabel': 'Win Rate',
      'leaderboard.wins': 'W',
      'leaderboard.matches': 'M',

      // === Rank modal (renderRankModal) ===
      'rankModal.section.tierLadder': 'Rank Ladder',
      'rankModal.section.winBonus': 'Win Bonuses',
      'rankModal.section.lossPenalty': 'Loss Penalty & Protection',
      'rankModal.section.bullyProtection': 'Anti-Bully Mechanism',
      'rankModal.section.validMatch': 'Valid Match Conditions',
      'rankModal.youAreHere': '◀ You are here',
      'rankModal.winRule1': `▸ Base <b style="color:var(--S);">+20</b>; opponent 100+ LP higher <b style="color:var(--S);">+10</b>; 200+ LP higher <b style="color:var(--S);">+15</b>`,
      'rankModal.winRule2': `▸ Win streak 2+ <b style="color:var(--O);">+5</b>; streak 5+ <b style="color:var(--O);">+10</b> (normal matches only)`,
      'rankModal.winRule3': `▸ Score 15,000+ in a single match <b style="color:var(--O);">+5</b> (normal matches only)`,
      'rankModal.loseRule1': `▸ Base <b style="color:var(--Z);">-15</b>; Diamond+ <b style="color:var(--Z);">-20</b>; Elite <b style="color:var(--Z);">-25</b>`,
      'rankModal.loseRule2': `▸ Lose to a player 200+ LP higher: penalty <b style="color:var(--I);">halved</b>`,
      'rankModal.loseRule3': `▸ <b style="color:var(--I);">3 losses in a row</b> auto-triggers a safety net (no LP loss this match)`,
      'rankModal.bullyIntro': `When you outrank your opponent by more than one tier, LP gain <b style="color:var(--Z);">scales down sharply</b>:`,
      'rankModal.bullyL1': 'Opponent 200–299 LP lower',
      'rankModal.bullyL1Reward': '+5 LP (reduced)',
      'rankModal.bullyL2': 'Opponent 300–399 LP lower',
      'rankModal.bullyL2Reward': '+1 LP (token)',
      'rankModal.bullyL3': 'Opponent 400+ LP lower',
      'rankModal.bullyL3Reward': '0 LP (still counts as win but no streak)',
      'rankModal.bullyDailyLimit': `▸ <b style="color:var(--Z);">Daily cap: 2</b> bully wins. From the 3rd onwards LP gain = 0. Resets daily at 00:00 (UTC+8).`,
      'rankModal.bullyHint': 'Want to keep climbing? Challenge equal or stronger opponents 💪',
      'rankModal.validIntro': `These matches <b style="color:var(--Z);">do NOT</b> count toward ranked LP:`,
      'rankModal.validItem1': 'Either player is not logged in, is a guest, or in admin mode',
      'rankModal.validItem2': 'When time runs out, either player\'s score is below 1,000',
      'rankModal.validItem3': 'AI battle (practice mode)',

      // === Match History modal (renderHistoryList) ===
      'history.empty': 'No records in this category yet.',
      'history.recentPrefix': 'Last ',
      'history.recentSuffix': '',
      'history.summaryWin': 'W',
      'history.summaryLose': 'L',
      'history.summaryDraw': 'D',
      'history.fallbackMe': 'Me',
      'history.colMe': 'Me',
      'history.colOpp': 'Opp',
      'history.statLines': 'Lines',
      'history.statAttack': 'Sent',
      'history.tipLines': 'Total lines you cleared this match',
      'history.tipAttack': 'Garbage lines sent to opponent (e.g. Quad = 4, T-Spin Double = 4)',
      'history.tipKO': 'Times you topped out the opponent this match',
      'history.tipMaxC': 'Max Combo: highest combo achieved this match',
      'history.tipAPM': 'Attack Per Minute: avg attack lines sent per minute',
      'history.tipPPS': 'Pieces Per Second: avg pieces placed per second',
      'history.tipDuration': 'Match duration (excludes the opening 3-2-1 countdown)',
      'history.reasonSurrender': 'Surrender',
      'history.reasonOppSurrender': 'Opp surrendered',
      'history.reasonTimeout': 'Time up',
      'history.filterAll': 'All',
      'history.filterWin': 'Wins',
      'history.filterLose': 'Losses',

      // === Rules modal — SOLO tab ===
      'rules.solo.intro': `Single-player core loop: <b style="color:var(--O);">clear lines → score → level up → speed up</b>. Higher levels mean bigger score multipliers — but the gravity gets terrifying.`,
      'rules.solo.scoreHeader': '🎯 Line Clear Base Score',
      'rules.solo.scoreNote': '(Final score = Base × Level)',
      'rules.solo.colTechnique': 'Technique',
      'rules.solo.colBaseScore': 'Base',
      'rules.solo.rowSingle': 'Single (1 line)',
      'rules.solo.rowDouble': 'Double (2 lines)',
      'rules.solo.rowTriple': 'Triple (3 lines)',
      'rules.solo.rowQuad': 'Quad (4 lines) 🏆',
      'rules.solo.rowMiniTSpin': 'Mini T-Spin (no clear)',
      'rules.solo.rowTSpinNoClear': 'T-Spin (no clear)',
      'rules.solo.tspinTip': `<b style="color:var(--T);">💡 Note:</b> T-Spin / Mini T-Spin <b>still score even without a clear</b> (T-Spin 400, Mini T-Spin 100, × Level). See the purple effect = free points!`,
      'rules.solo.bonusHeader': '🔥 Bonus Rules',
      'rules.solo.b2bTitle': 'B2B Chain',
      'rules.solo.b2bDesc': `Consecutive Quads or T-Spins: base score <b style="color:var(--O);">× 1.5</b>.`,
      'rules.solo.comboTitle': 'Combo',
      'rules.solo.comboDesc': `N consecutive clears: extra <b style="color:var(--S);">+50 × N</b> points.`,
      'rules.solo.softDropDesc': `Hold ↓ for <b style="color:var(--I);">+1 point per cell</b> (great for max-level grinding).`,
      'rules.solo.hardDropDesc': `Press Space for <b style="color:var(--T);">+2 points per cell dropped</b>.`,
      'rules.solo.levelHeader': '⚡ Level & Speed Curve',
      'rules.solo.levelDesc': `Every <b style="color:var(--O);">10 lines</b> = 1 level up. Drop-speed formula: <code style="color:var(--I); background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px; font-size:11.5px;">(0.8 − (L−1)×0.007)^(L−1) sec/cell</code>`,
      'rules.solo.colSpeed': 'Drop time / cell',
      'rules.solo.colFeel': 'Feel',
      'rules.solo.feel1': 'Relaxed',
      'rules.solo.feel5': 'Tightening',
      'rules.solo.feel10': 'Fast',
      'rules.solo.feel15': 'Reflex limit',
      'rules.solo.feel20': '20G — instant ground',

      // === Rules modal — BATTLE tab ===
      'rules.battle.intro': `In battle: <b style="color:var(--Z);">clear more, send more garbage, top them out</b>. Gravity is fixed at 1 cell/sec. Match length: <b style="color:var(--Z);">2 minutes</b>.`,
      'rules.battle.attackHeader': '⚔️ Garbage Attack Table',
      'rules.battle.colTechnique': 'Technique',
      'rules.battle.colSent': 'Lines Sent',
      'rules.battle.colB2B': 'B2B 🔥',
      'rules.battle.rowPerfectClear': `<b>PERFECT CLEAR</b> ⭐`,
      'rules.battle.rowPerfectClearReward': `<b>+10 extra lines</b> (heaviest hit!)`,
      'rules.battle.attackB2BExp': `<b style="color:var(--O);">🔥 B2B = Back-to-Back:</b> consecutive <b>Quads</b> or <b>T-Spins</b> (no plain Single/Double/Triple in between). From the 2nd onward, B2B-boosted attack triggers. Pros chain B2B TSD for non-stop 6-line pressure!`,
      'rules.battle.comboHeader': '🌀 Combo Bonus Attack',
      'rules.battle.comboColCount': 'Consecutive Clears',
      'rules.battle.comboColExtra': 'Extra Sent',
      'rules.battle.comboLine1': '+1 line',
      'rules.battle.comboLine2': '+2 lines',
      'rules.battle.comboLine3': '+3 lines',
      'rules.battle.comboLine4Cap': `<b>+4 lines</b> (cap)`,
      'rules.battle.cancellationHeader': '🛡️ Garbage Cancellation & Grace',
      'rules.battle.cancellationDesc': `Incoming garbage shows as a <b style="color:var(--O);">🟡 yellow warning bar</b> for <b style="color:var(--O);">2 seconds</b>. Clear lines in this window to <b style="color:var(--I);">cancel and counter-attack</b>!<br>After timeout it becomes a <b style="color:var(--Z);">🔴 red danger bar</b> — your next lock pushes it onto your board from below.<br><br><b style="color:var(--I);">Cancellation order:</b> your attack → cancel your own 🔴 red first → then 🟡 yellow → leftover sent to opponent.`,
      'rules.battle.koHeader': '💀 KO Judgement',
      'rules.battle.koReviveTitle': '✅ KO with revive',
      'rules.battle.koReviveDesc': `Top-out with <b>garbage on your board</b> → KO'd but revived, opponent gets <b>+1 KO</b>, match continues.`,
      'rules.battle.topOutTitle': '❌ TOP OUT loses match',
      'rules.battle.topOutDesc': `Top-out with <b>no garbage on your board</b> (you stacked yourself out) → instant loss.`,
      'rules.battle.gracePeriod': `<b style="color:var(--T);">🤝 Death grace period:</b> if both players die within 300ms of each other → judged as <b>DRAW</b>, neutralizing network-latency unfairness.`,
      'rules.battle.winHeader': '🏅 Win & Rank',
      'rules.battle.winRule': `When time runs out, <b style="color:var(--Z);">most KOs wins</b>; tie-broken by <b>LINES SENT</b>. Win = LP gain (climb tiers); lose = LP loss.<br><span style="color:var(--T);">📖 For full ranking rules, click your rank text in the <b>PLAYER box</b> on the left.</span>`,

      // === Rules modal — OPERATION tab controls ===
      'rules.op.move': 'Move left / right',
      'rules.op.softDrop': 'Soft drop',
      'rules.op.softDropBonus': '(+1 / cell)',
      'rules.op.hardDrop': 'Hard drop',
      'rules.op.hardDropBonus': '(+2 / cell)',
      'rules.op.rotateCW': 'Rotate clockwise',
      'rules.op.rotateCCW': 'Rotate counter-clockwise',
      'rules.op.hold': 'Hold',
      'rules.op.holdNote': '(once per piece)',
      'rules.op.pause': 'Pause / Resume',
      'rules.op.restart': 'Restart / Leave room',
      'rules.op.undo': 'Undo last move',
      'rules.op.muteToggle': 'Mute music / SFX',
      'rules.op.volume': 'Volume up / down',
      'rules.op.emote': 'Send emote',
      'rules.op.emoteNote': '(battle only)',
      'rules.op.surrender': 'Double-tap to surrender',
      'rules.op.surrenderNote': '(during battle)',
      'rules.op.tipLabel': '💡 Tip:',
      'rules.op.tipText': 'Hold (C) is a pro essential — save an I-piece for a big combo to double your firepower!',

      // === Combo Room settings panel ===
      'comboRoom.widthLabel': '📐 Field Width',
      'comboRoom.iWarning': '⚠️ In 3-Wide mode, the I-piece is locked to vertical orientation.',
      'comboRoom.rulesText': '📜 Rules: drop speed is fixed; chain combos as high as you can.',
      'comboRoom.notRanked': 'Not ranked. High score not saved.',

      // === Free Placement settings panel ===
      'free.gravityLabel': '⬇️ Natural fall',
      'free.gravityOff': 'Off (manual)',
      'free.gravityOn': 'On (fixed speed)',
      'free.queueLabel': '🎴 NEXT / QUEUE',
      'free.queueOff': 'Off (pick by hand)',
      'free.queueOn': 'Random',
      'free.numberKeyHeader': '⌨️ Number key → Piece',
      'free.clearAllTooltip': 'Clear the entire field so you can re-place pieces (Score / Lines / Combo also reset)',
      'free.rulesText': '📜 Rules: full 10-wide field, practice placements freely.',
      'free.notRanked': 'Not ranked. High score not saved.',

      // === Practice mode ===
      'practice.btnExit': '🟩 Leave Practice Mode',
      'practice.subtitle': '(Practice — not ranked)',
      'practice.chooseSubMode': 'Pick COMBO ROOM or FREE PLACEMENT first',

      // === ONLINE panel player status ===
      'online.idle': 'Idle in lobby',
      'online.single': 'Single-player run',
      'online.practice': 'Practicing',
      'online.aiBattle': 'AI battle',
      'online.multiplayer': '1v1 battle',
      'online.mpRoom': 'In multiplayer room',
      'online.spectating': '👀 Spectating',
      'online.away': 'Away (idle)',

      // === MATCH MODE panel ===
      'matchMode.bombDesc': 'Bombs detonate lines',
      'matchMode.classicDesc': 'Classic garbage rows',
      'matchMode.pickYou': '✓ You',
      'matchMode.pickOpp': 'Opp',
      'matchMode.rulesHeader': `📜 Both players must pick the <b style="color:var(--S);">same mode</b> to press READY.`,
      'matchMode.bombRule': '💣 BOMB: hole is a bomb — lock above it to detonate.',
      'matchMode.classicRule': '🧱 CLASSIC: hole is empty — fill the row to clear it.',
      'matchMode.modeMismatch': '⚠️ Opponent picked {mode} — modes differ, cannot start',

      // === Generic toasts / alerts / confirms ===
      'toast.confirmLeaveBattle': 'Leave the battle room and return to single-player?',
      'toast.inviteResent': 'Invite re-sent to {user}!',
      'toast.inviteSent': 'Invite sent to {user}!',
      'toast.inviteTimeout': '⚠️ Invite to {user} timed out',
      'toast.cantConnectSelf': "You can't connect to yourself!",
      'battle.waitForMode': '⏳ Wait for opponent to pick a mode',
      'battle.modeMismatchToast': "⚠️ Modes don't match — cannot start",
      'toast.tooSlow': '😭 Too slow! Opponent already started a match with someone else!',
      'toast.oppInGame': '⚠️ Opponent is in a match',
      'toast.versionMismatch': '❌ Connection failed: version mismatch!\n\nMake sure both players are on the latest version.',
      'toast.specEnded': '👀 {user} stopped spectating',
      'battle.mutualKO': '🤝 Both players topped out — DRAW!',
      'battle.oppDrowned': '🎉 Opponent was buried by blocks!',
      'battle.oppLeftForOther': '💔 Opponent abandoned you and ran off with someone else!',
      'battle.notRanked': '⚠️ This match did not count toward LP\n\n{reason}\n\n✨ Tip: both players need score 1000+ AND time runs out (or one surrenders) for the match to be ranked.',
      'toast.cantUndo': "⚠️ Can't undo (lines cleared, bomb fired, or already used)!",
      'battle.surrenderHint': '⚠️ To surrender, double-tap F quickly!',
      'toast.aiReady': '🤖 AI opponent ready! Adjust settings then press READY',
      'toast.inviteRateLimit': '⏳ Sending invites too fast — wait 3 seconds...',
      'history.loginRequired': 'Login first to view match history!',
      'cloud.readFailed': 'Failed to read cloud save! Blocked by Firebase. Press F12 for the error log.',

      // === Spectator related ===
      'spectate.youStarted': '👀 {user} started spectating you!',
      'spectate.fallbackUser': 'Someone',
      'spectate.alreadySpec': '⚠️ You are already spectating another player',
      'spectate.battleNoSpec': "⚠️ Can't spectate during a match",
      'spectate.notReady': '⚠️ Connection not ready yet',
      'spectate.cantSelf': "⚠️ Can't spectate yourself",
      'spectate.willInterrupt': '⚠️ Spectating will interrupt your current game',
      'spectate.connecting': 'Connecting to {user}...',
      'spectate.notFound': '⚠️ Player not found',
      'spectate.userOffline': '⚠️ This player is offline',
      'spectate.timeout': '⚠️ Connection timed out',
      'spectate.closed': '👀 Spectator connection closed',
      'spectate.failed': '⚠️ Spectator connection failed',
      'spectate.failedReason': '⚠️ Spectate failed: {reason}',
      'spectate.unknownError': 'unknown error',
      'spectate.reasonPractice': 'Player is in practice mode (cannot spectate)',
      'spectate.reasonFull': 'Spectator slots full ({cur}/{max})',
      'spectate.reasonBusy': "Player is currently unavailable",
      'spectate.reasonPhasePending': 'In-battle spectating is coming soon',
      'spectate.reasonGeneric': 'cannot spectate',
      'spectate.endHostLeft': 'Player left the game',
      'spectate.endGameEnd': 'Player finished this match',
      'spectate.endDisconnect': 'Player disconnected',
      'spectate.endUnstable': 'Connection unstable — spectator session ended',
      'spectate.endReturn': 'Player returned to lobby',
      'spectate.endEnteredBattle': 'Player entered a match',
      'spectate.endEnteredPractice': 'Player entered practice mode',
      'spectate.endGeneric': 'spectator session ended',
      'spectate.disconnected': '⚠️ Spectator connection lost',
      'spectate.startWatching': '👀 Now spectating {user}',
      'spectate.fallbackPlayer': 'player',
      'spectate.leaveBtn': '✕ Leave Spectate',
      'spectate.hostOffline': '👀 Player went offline — spectator session ended',
      'spectate.btnTitle.normal': 'Spectate this player',
      'spectate.btnTitle.practice': 'In practice mode — cannot spectate',
      'spectate.btnTitle.spectating': 'Player is spectating — cannot be spectated',
      'spectate.btnTitle.alreadySpec': 'You are already spectating someone',
      'spectate.btnTitle.battle': "Can't spectate during a match",
      'spectate.btnTitle.notReady': 'Connection not ready yet',

      // === Chat ===
      'chat.newMessage': '💬 {sender} sent a new message',
      'chat.pickPlayer': "⚠️ Click the 「Player ▼」dropdown at the top-left of the chat to pick a target first!",
      'chat.fetchingPlayer': '⚠️ Fetching player connection info — please retry shortly',

      // === Password change ===
      'pwd.changeSuccess': 'Password changed! Use the new password next time you log in.',
      'pwd.changeFailed': 'Change failed: {err}\n(For security, you may need to log out and log back in before changing the password)',
      'pwd.tooShort': 'Password must be at least 6 characters!',

      // === Admin functions ===
      'admin.emptyName': 'Enter the target username!',
      'admin.notFound': 'Player not found!',
      'admin.emptyValues': 'Enter at least one value to modify!',
      'admin.modifySuccess': "Successfully modified {user}'s stats!\n(Player needs to re-login or finish a match for the UI to update)",
      'admin.modifyFailed': 'Modify failed!',
      'admin.wrongPassword': 'Wrong password! Enter the correct password for THIS account.',
      'admin.resetSuccess': '🎉 Season reset complete! All players have been zeroed out.',
      'admin.resetFailed': 'Reset failed! Check your network.',

      // === Mode toggle button labels ===
      'btn.fpsModeLock60': '🧱 Lock 60 FPS',
      'battle.cancelReadyBtn': '✕ Cancel READY',
      'btn.comboRoomExit': '🟩 Leave Combo Room',
      'btn.freeModeExit': '🟩 Leave Free Placement',
      'spectate.readOnlySync': '👀 Read-only sync',

      // === Misc ===
      'battle.btnWaitingOpp': 'Waiting for opp...',
      'battle.btnModeMismatch': "Modes don't match",
      'spectate.toastNoSpec': 'cannot spectate',
      'pwd.promptNewPwd': 'Enter your new password (at least 6 chars):',
      'rankModalTitle': '🏆 Rank Rules',

      // === AI strategy hints ===
      'aiHint.auto': '🧠 AI auto-selects best placement, building Quad-stack strategy',
      'aiHint.1': '1-wide: Keep a 1-column well on the right, slot I-pieces for Quad practice',
      'aiHint.2': '2-wide: 2-column well, stable Quad strategy, suits mid-high AI',
      'aiHint.3': '3-wide: 3-column well, balanced clears, rhythm-style play',
      'aiHint.4': '4-wide Combo: 4-column corridor, every piece clears, sustained combos!',

      // === Game state ===
      'game.gameOver': 'GAME OVER',
      'game.pressR': 'Press R to restart',
      'game.pressEnter': 'PRESS ENTER',
      'game.toStart': 'TO START',
      'game.you': 'You',

      // === Language switcher (shows the language you'll switch TO) ===
      'lang.toggle': '🌐 中文',
    },
  };

  function detectLang() {
    const stored = localStorage.getItem('brickade_lang');
    if (stored && LOCALES[stored]) return stored;
    const navLang = (navigator.language || 'en').toLowerCase();
    if (navLang.startsWith('zh')) return 'zh-TW';
    return 'en';
  }

  let currentLang = detectLang();
  document.documentElement.lang = currentLang;

  window.t = function (key, fallback) {
    const dict = LOCALES[currentLang];
    if (dict && dict[key] != null) return dict[key];
    const zh = LOCALES['zh-TW'];
    if (zh && zh[key] != null) return zh[key];
    return fallback != null ? fallback : key;
  };

  window.getLang = function () {
    return currentLang;
  };

  // 切語系直接 reload，是最簡單可靠的全頁套用方式
  // （比 dynamic re-render 不容易遺漏 game.js 動態建立的元素）
  window.setLang = function (lang) {
    if (!LOCALES[lang] || lang === currentLang) return;
    localStorage.setItem('brickade_lang', lang);
    // GoatCounter 自訂事件：追蹤語言切換流向（如有玩家從 zh-TW → en，事件路徑 = lang-switch-en）
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({
        path: 'lang-switch-' + lang,
        title: 'Language switch: ' + lang,
        event: true,
      });
    }
    // 給追蹤 pixel 100ms 送出時間，再 reload。玩家無感、但確保事件不會被中斷
    setTimeout(() => location.reload(), 100);
  };

  function applyTranslations(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = window.t(el.dataset.i18n);
    });
    // 含內嵌 HTML 的翻譯（例如有 <b>, <code> 加色強調）→ 用 innerHTML
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = window.t(el.dataset.i18nHtml);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = window.t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = window.t(el.dataset.i18nPlaceholder);
    });
  }
  // 對外開放，game.js 動態插入新元素後可手動再呼叫
  window.applyTranslations = applyTranslations;

  function bindLangToggle() {
    const btn = document.getElementById('lang-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      window.setLang(currentLang === 'zh-TW' ? 'en' : 'zh-TW');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTranslations();
      bindLangToggle();
    });
  } else {
    applyTranslations();
    bindLangToggle();
  }
})();
