// ============================================================
// probe-conn.js —— 量連線池的行為：能開幾條、閒置多久會被收掉、重連要多久
//
// 用途：懷疑「連線被切斷」或「連線數不夠」時跑這一支。它不碰任何業務資料表，
// 只做 SELECT 1 與 pg_sleep，所以任何環境都能跑。
//
// 跑法：node scripts/probe-conn.js
//
// 會看到三件事：
//   1. 一次能不能開滿 max 條連線
//   2. 閒置 10 / 30 / 60 秒之後那些連線還在不在（pg 的 idleTimeoutMillis 預設是 10 秒，
//      所以掉到 1 條是正常的，不是錯誤）
//   3. 重新連線的成本（Neon 在新加坡，實測約 500ms —— e2e 的時間幾乎都花在這裡）
//
// 打的是 .env.test 的資料庫。背景見 docs/專案速查.md 的「e2e 測試連線問題怎麼查」。
// ============================================================

require('dotenv').config({ path: '.env.test' });
const { Pool } = require('pg');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

  // pg 的 idle client 死掉時會發這個事件。沒有掛 handler 的話有機會讓行程直接掛掉。
  pool.on('error', (err) => console.log(`  [pool error 事件] ${err.message}`));

  const query = async (label) => {
    const t = Date.now();
    try {
      await pool.query('SELECT 1');
      console.log(
        `${label}: OK (${Date.now() - t}ms)  總連線=${pool.totalCount} 閒置=${pool.idleCount}`,
      );
    } catch (e) {
      console.log(`${label}: 失敗 -> ${e.message}`);
    }
  };

  console.log('--- 階段 1：連續查詢（第一次含連線成本）---');
  await query('查詢 1');
  await query('查詢 2');

  console.log('--- 階段 2：一次開 10 條連線 ---');
  await Promise.all(
    Array.from({ length: 10 }, () =>
      pool.query('SELECT pg_sleep(0.3)').then(
        () => process.stdout.write('.'),
        (e) => process.stdout.write(`[${e.message}]`),
      ),
    ),
  );
  console.log(`\n  總連線=${pool.totalCount} 閒置=${pool.idleCount}`);

  for (const sec of [10, 30, 60]) {
    console.log(`--- 階段 3：閒置 ${sec} 秒後再查 ---`);
    await wait(sec * 1000);
    await query(`閒置 ${sec}s 後`);
  }

  await pool.end();
  console.log('--- 結束 ---');
})();
