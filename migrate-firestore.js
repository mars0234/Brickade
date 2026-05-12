/**
 * Firestore 遷移腳本：舊專案 → brickade
 * （已執行完畢，保留供日後類似遷移參考）
 *
 * 用法：
 *   1. 安裝依賴：  npm install firebase-admin --save-dev
 *   2. 下載兩份 service account JSON：
 *        - 舊：Firebase Console → 舊專案 → 專案設定 → 服務帳號 → 產生新的私密金鑰
 *              另存為 ./service-old.json
 *        - 新：Firebase Console → brickade → 專案設定 → 服務帳號 → 產生新的私密金鑰
 *              另存為 ./service-new.json
 *   3. 執行：     node migrate-firestore.js
 *
 * 安全性：
 *   - service-*.json 已加進 .gitignore，絕對不能 commit。
 *   - 完成後可以到 Console 把這兩把金鑰撤銷。
 *
 * 行為：
 *   - 用 admin SDK，繞過 Firestore rules（包含 schema validation）。
 *   - 完整保留所有欄位、型別（含 Timestamp / number / bool / string）。
 *   - 保留原始 doc ID 與子集合 matchHistory。
 *   - Idempotent：可重複執行，後執行覆蓋先執行的內容。
 *   - 失敗時印出錯誤就退出，已遷移的 doc 不會回滾，重跑即可。
 */

const admin = require('firebase-admin');

const oldServiceAccount = require('./service-old.json');
const newServiceAccount = require('./service-new.json');

const oldApp = admin.initializeApp(
  { credential: admin.credential.cert(oldServiceAccount) },
  'old'
);
const newApp = admin.initializeApp(
  { credential: admin.credential.cert(newServiceAccount) },
  'new'
);

const oldDb = oldApp.firestore();
const newDb = newApp.firestore();

async function migrateUser(userDoc) {
  const userId = userDoc.id;
  const userData = userDoc.data();
  const username = userData.username || '(no username)';

  console.log(`\n→ ${userId}  (${username})`);

  // 1) 寫主 user doc
  await newDb.collection('users').doc(userId).set(userData);
  console.log(`   ✓ user doc 寫入完成`);

  // 2) 遷移 matchHistory 子集合
  const historySnap = await oldDb
    .collection('users')
    .doc(userId)
    .collection('matchHistory')
    .get();

  if (historySnap.empty) {
    console.log(`   · 無 matchHistory 紀錄`);
    return { user: 1, history: 0 };
  }

  console.log(`   找到 ${historySnap.size} 筆 matchHistory`);

  // Firestore batch 上限 500 筆，留 buffer 用 400
  const BATCH_SIZE = 400;
  let batch = newDb.batch();
  let inBatch = 0;
  let total = 0;

  for (const hDoc of historySnap.docs) {
    const ref = newDb
      .collection('users')
      .doc(userId)
      .collection('matchHistory')
      .doc(hDoc.id);
    batch.set(ref, hDoc.data());
    inBatch++;
    total++;
    if (inBatch >= BATCH_SIZE) {
      await batch.commit();
      console.log(`   ✓ batch commit ${total} / ${historySnap.size}`);
      batch = newDb.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batch.commit();
  }
  console.log(`   ✓ matchHistory 全部 ${total} 筆寫入完成`);

  return { user: 1, history: total };
}

async function main() {
  console.log('==============================================');
  console.log('  BRICKADE Firestore 遷移');
  console.log('  從  舊專案');
  console.log('  到  brickade');
  console.log('==============================================');

  console.log('\n讀取舊專案 users 集合 ...');
  const usersSnap = await oldDb.collection('users').get();
  console.log(`找到 ${usersSnap.size} 位玩家\n`);

  if (usersSnap.empty) {
    console.log('⚠️  舊專案沒有 users，沒事可做');
    process.exit(0);
  }

  let totalUsers = 0;
  let totalHistory = 0;

  for (const userDoc of usersSnap.docs) {
    try {
      const stats = await migrateUser(userDoc);
      totalUsers += stats.user;
      totalHistory += stats.history;
    } catch (err) {
      console.error(`\n❌ ${userDoc.id} 遷移失敗:`, err.message);
      console.error('   此玩家未完成，但其他玩家會繼續處理。請於最後重跑本腳本（idempotent）。');
    }
  }

  console.log('\n==============================================');
  console.log(`  ✅ 遷移完成`);
  console.log(`     玩家：${totalUsers} / ${usersSnap.size}`);
  console.log(`     對戰紀錄：${totalHistory} 筆`);
  console.log('==============================================');
  console.log('\n下一步：到 Firebase Console (brickade 專案) 的 Firestore Database 頁面，');
  console.log('       目視驗證 users 集合內容是否與舊專案一致。');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 遷移失敗:', err);
  process.exit(1);
});
