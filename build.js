const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { execSync } = require('child_process');

console.log('⏳ 開始打包與混淆程式碼...');

// 1. 清空並重建 public 資料夾，確保裡面沒有舊檔案干擾
if (fs.existsSync('./public')) {
    fs.rmSync('./public', { recursive: true, force: true });
}
fs.mkdirSync('./public');

// 2. 先把 src 裡面的【所有東西】原封不動複製到 public
// 這樣就絕對不會漏掉 mp3, wasm, cpp, changelog.js 等等任何檔案了！
fs.cpSync('./src', './public', { recursive: true });
console.log('✔️ 靜態檔案 (HTML, MP3, WASM, 等等) 全部複製完成');

// 3. 設定統一的高強度混淆規則
const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    // ⚠️ 注意：我幫你把 debugProtection 暫時關閉了
    // 因為 Web Worker 在開啟 F12 開發者工具時，很容易被 debug 保護機制搞到當機
    debugProtection: false, 
    stringArray: true,
    stringArrayEncoding: ['base64']
};

// 4. 針對核心邏輯進行加密（覆蓋掉剛剛複製過去的明碼檔案）
if (fs.existsSync('./src/game.js')) {
    const gameCode = fs.readFileSync('./src/game.js', 'utf8');
    const obfGame = JavaScriptObfuscator.obfuscate(gameCode, obfuscatorOptions);
    fs.writeFileSync('./public/game.js', obfGame.getObfuscatedCode());
    console.log('✔️ game.js 加密覆蓋完成');
}

if (fs.existsSync('./src/ai_worker.js')) {
    const aiCode = fs.readFileSync('./src/ai_worker.js', 'utf8');
    const obfAi = JavaScriptObfuscator.obfuscate(aiCode, obfuscatorOptions);
    fs.writeFileSync('./public/ai_worker.js', obfAi.getObfuscatedCode());
    console.log('✔️ ai_worker.js 加密覆蓋完成');
}

console.log('✅ 所有核心邏輯處理完畢！準備發布到 Firebase...');

// 5. 自動執行 Firebase 部署
try {
    execSync('firebase deploy --only hosting', { stdio: 'inherit' });
    console.log('🚀 遊戲已成功發布到網路上！');
} catch (error) {
    console.error('❌ 發布失敗，請檢查 Firebase 登入狀態。');
}