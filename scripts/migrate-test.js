// ============================================================
// migrate-test.js —— 把 migration 套用到 test branch
//
// 用途：三條 Neon branch 裡，**只有 test 需要手動套用 migration**。
//   dev        —— `prisma migrate dev` 當下就套用了
//   test       —— 沒有人會幫你做，就是這支腳本
//   production —— `git push` 之後 Render 的 Build Command 會跑 migrate deploy
//
// 忘記補 test 的症狀有誤導性（Ch9 輪 2 實際踩過）：e2e 突然 500，
// 訊息是 `The table public.User does not exist` 而且指著你剛寫的 service ——
// 看起來像程式碼寫錯，其實是那條資料庫沒有那張表。
//
// 為什麼寫成 node 腳本而不是 package.json 裡的一行指令：
// 行內設環境變數（`DATABASE_URL="..." pnpm exec ...`）是 bash 語法，
// PowerShell 沒有；而 package.json 的 script 在 Windows 上是用 cmd 跑的。
// 包成腳本之後 `pnpm migrate:test` 在哪個終端機都一樣。
//
// 怎麼被執行：pnpm migrate:test
// ============================================================

const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const envPath = resolve(__dirname, '..', '.env.test');

let raw;
try {
  raw = readFileSync(envPath, 'utf8');
} catch {
  console.error(
    '找不到 .env.test —— 換機之後要自己重建，步驟見 docs/專案速查.md 的「換機接續」。',
  );
  process.exit(1);
}

// 只取 DATABASE_URL 一行，順手去掉可能有的引號。
const match = raw.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
if (!match) {
  console.error('.env.test 裡沒有 DATABASE_URL。');
  process.exit(1);
}
const url = match[1].trim().replace(/^["']|["']$/g, '');

// 印出 host 讓你確認打對了資料庫（不印密碼）。
const host = url.match(/@([^/?]+)/);
console.log(`對 test branch 套用 migration：${host ? host[1] : '(host 解析失敗)'}`);

// migrate deploy 而不是 migrate dev —— 後者會拿 schema 去跟這個資料庫比對，
// 可能產生新的 migration、甚至 reset 它。deploy 只重播還沒套用的 SQL。
const result = spawnSync(
  'pnpm',
  ['exec', 'prisma', 'migrate', 'deploy'],
  { stdio: 'inherit', shell: true, env: { ...process.env, DATABASE_URL: url } },
);

process.exit(result.status ?? 1);
