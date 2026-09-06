// ============================================================
// [教學] test/setup-env.ts —— 測試跑之前，先把環境變數擺成該有的樣子
//
// 什麼時候被執行：`pnpm test:e2e` 時，**在任何測試檔被載入之前**。
// 它是 test/jest-e2e.json 的 setupFiles 指定的，比 beforeAll 還早。
//
// 為什麼需要它：E2E 測試會清空資料表。如果連到開發資料庫，
// 跑一次測試就會把你 seed 的問卷全部刪掉。
//
// 職責從 Ch16 起是兩件（原本只有第一件）：
//   1. DATABASE_URL 指向 test branch，並擋掉兩種填錯法
//   2. CORS_ORIGIN 給一份測試專用的白名單（理由見下面那一段）
// 共同點是「**測試要跑在一組可預期的環境變數上**」，而不是碰運氣讀到什麼算什麼。
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

// ============================================================
// CORS 白名單（Ch16）—— 測試用的值寫死在這裡，不從 .env 讀
// ============================================================
//
// setup-app.ts 拿不到 CORS_ORIGIN 就會 throw，而**每一支 e2e 都呼叫 setupApp**，
// 所以這個值一定要有。問題是「從哪來」，兩種都可以，這裡選後者：
//
//   .env 那份       換一台機器時它的內容誰也不知道（不進版控）。
//                   cors.e2e-spec.ts 就變成「斷言你本機那個檔案剛好寫了什麼」，
//                   紅了也分不出是程式壞了還是 .env 沒填。
//   寫死在這裡  ✅  測試自足，斷言的值跟被測的設定都在版控裡，一起看得到。
//
// 為什麼放**兩個** origin：只有一個的話，「忘了 split（整串當成一個 origin）」
// 跟「切對了」的行為一模一樣，測不出差別。
//
// 第二個刻意用一個不存在的網域 —— 它只是「清單裡的第二個」的代表，
// 測試不會真的連過去（cors 只做字串比對）。
//
// ⚠️ 這裡改了值，test/cors.e2e-spec.ts 的斷言要跟著改 —— 那是兩個地方要一致。
// 沒把它抽成共用常數，是因為測試「自己寫一次期望值」才有意義：
// 兩邊都讀同一個變數的話，值改錯了測試照樣綠。
process.env['CORS_ORIGIN'] = 'http://localhost:3000,https://survey.example.com';

// ============================================================
// keep-alive：讓 supertest 重用 TCP 連線
//
// 這一段不是設定，是一個 monkey patch，理由值得寫清楚。
//
// 【問題】e2e 會隨機出現大量 `read ECONNRESET`，而且每次紅的測試都不一樣、
// 錯誤永遠不是斷言。Ch5 花兩小時排除七個假設後，結論停在
// 「這台機器 HTTP socket 層的問題」（見 docs/專案速查.md 的排除表）。
//
// 【真正的原因】supertest 底下的 superagent 在建構時寫死 `this._agent = false`。
// 在 Node 裡 `agent: false` 的意思是「這個請求自己開一個一次性的 Agent、不做連線池」——
// 於是**每一個請求都開一條新的 TCP 連線、用完就關**。全套 e2e 打下來是
// 兩三百條 socket 的開開關關，Windows 的 socket 層扛不住就開始 reset。
//
// 【實測】同一份程式碼、同一個資料庫，各跑三次：
//   沒有 keep-alive：16 / 9 / 14 條紅（全部是 ECONNRESET）
//   有  keep-alive：0 / 0 / 0 條 ECONNRESET
//
// 【為什麼是從 supertest 拿 Test.prototype，不是 require('superagent')】
// pnpm 的隔離讓專案根目錄那份 superagent 跟 supertest 內部用的**不是同一份檔案**
// （實測：node_modules/superagent/... vs node_modules/.pnpm/superagent@10.3.0/...）。
// patch 錯那一份不會報錯，只會**靜靜地沒有任何效果** —— 這是這個專案第 N 次
// 遇到「設定寫了但沒生效」，而唯一的偵測方式是先驗證 patch 真的接上了再測效果。
//
// Test.prototype 自己沒有 request（實測 hasOwnProperty 是 false），
// 它繼承自 superagent 的 Request.prototype，所以要往上一層拿原本那支。
// ============================================================

import { Agent } from 'node:http';
import supertest from 'supertest';

// 這個形狀是 superagent 的內部實作，型別定義裡沒有，所以自己描述一次。
interface SuperagentInternals {
  _agent: Agent | false;
  request: (...args: unknown[]) => unknown;
}

// maxSockets 給 8 而不是 1：有一條併發測試（Promise.all 同時送兩個請求），
// 只給一條連線會讓它們排隊，那條測試就測不到它要測的東西了。
const keepAliveAgent = new Agent({ keepAlive: true, maxSockets: 8 });

const testProto = supertest.Test.prototype as unknown as SuperagentInternals;
const inheritedRequest = (
  Object.getPrototypeOf(testProto) as SuperagentInternals
).request;

testProto.request = function (this: SuperagentInternals, ...args: unknown[]) {
  // 只在還沒被指定過 agent 時介入，不覆蓋呼叫端自己設的。
  if (this._agent === false) {
    this._agent = keepAliveAgent;
  }
  return inheritedRequest.apply(this, args);
};
