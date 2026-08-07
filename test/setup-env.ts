// ============================================================
// [教學] test/setup-env.ts —— 讓測試連到「測試資料庫」而不是開發資料庫
//
// 什麼時候被執行：`pnpm test:e2e` 時，**在任何測試檔被載入之前**。
// 它是 test/jest-e2e.json 的 setupFiles 指定的，比 beforeAll 還早。
//
// 為什麼需要它：E2E 測試會清空資料表。如果連到開發資料庫，
// 跑一次測試就會把你 seed 的問卷全部刪掉。
//
// 下一站：test/helpers/reset-db.ts（清資料的動作本身）
// ============================================================

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const ENV_TEST_PATH = resolve(__dirname, '../.env.test');
const ENV_PATH = resolve(__dirname, '../.env');

// [教學] 為什麼這裡要主動 throw，而不是「找不到就用 .env」：
//
// fallback 到 .env 表示測試會安靜地跑在開發資料庫上，然後把資料清光。
// 換一台機器時 .env.test 沒進版控，正是最容易漏掉的東西 ——
// 這個檢查就是為了那一刻存在的。
//
// 通則：會造成資料遺失的設定，寧可大聲失敗，也不要有預設值。
if (!existsSync(ENV_TEST_PATH)) {
  throw new Error(
    [
      '找不到 .env.test —— E2E 測試需要一個獨立的測試資料庫。',
      '',
      '它不進版控，所以換機器後要自己重建：',
      '  1. Neon Console → Branches → New branch，命名 test',
      '  2. 複製該 branch 的連線字串',
      '  3. 在專案根目錄建立 .env.test，格式見 .env.example',
    ].join('\n'),
  );
}

// [教學] dotenv 的 config() 預設**不會覆寫已經存在的 process.env**。
// 這正是這裡能成立的關鍵：我們先把 .env.test 灌進去，
// 稍後 AppModule 的 ConfigModule 再去讀 .env 時就搶不走了。
config({ path: ENV_TEST_PATH });

const testDatabaseUrl = process.env['DATABASE_URL'];

if (!testDatabaseUrl) {
  throw new Error('.env.test 裡沒有 DATABASE_URL');
}

// [教學] 第二道防線：確認測試資料庫真的不是開發資料庫。
//
// 光是「.env.test 存在」不夠 —— 複製 .env 過來改個檔名是很自然的動作，
// 而那樣做出來的 .env.test 會指向同一個資料庫。
//
// 這裡把 .env 另外讀進一個獨立物件（不碰 process.env）來比對。
const devEnv: Record<string, string> = {};
if (existsSync(ENV_PATH)) {
  config({ path: ENV_PATH, processEnv: devEnv });
}

if (devEnv['DATABASE_URL'] === testDatabaseUrl) {
  throw new Error(
    '.env.test 的 DATABASE_URL 與 .env 相同 —— 測試會清掉開發資料庫。\n' +
      '請把 .env.test 指向 Neon 的 test branch（不同的 endpoint）。',
  );
}
