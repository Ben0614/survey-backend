// ============================================================
// probe-db.js —— 把 HTTP 拿掉，只跑資料庫的工作量
//
// 用途：e2e 測試出現 read ECONNRESET 之類的連線錯誤時，**第一支該跑的探針**。
// 它重現 e2e 的資料庫操作（TRUNCATE + 巢狀 write + count）但完全不經過 HTTP，
// 所以結果只有兩種意思：
//
//   全部成功 → 資料庫沒問題，問題在 HTTP 那一層（supertest ↔ Nest）
//   有失敗   → 資料庫或網路真的有問題，往那個方向查
//
// 跑法（要先 pnpm build，它讀 dist/ 的 Prisma Client）：
//   pnpm build && node scripts/probe-db.js
//
// 打的是 .env.test 的資料庫，會 TRUNCATE 四張表 —— 不要對開發或正式資料庫跑。
// 背景見 docs/chapters/ch05-提交與查詢作答.md 的坑 #6。
// ============================================================

require('dotenv').config({ path: '.env.test' });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const ROUNDS = Number(process.argv[2] ?? 70);

(async () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let ok = 0;
  let fail = 0;
  const t0 = Date.now();

  for (let i = 0; i < ROUNDS; i++) {
    try {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "Answer", "Response", "Question", "Survey" RESTART IDENTITY CASCADE',
      );
      const survey = await prisma.survey.create({
        data: { title: 'probe-' + i, status: 'PUBLISHED' },
      });
      const question = await prisma.question.create({
        data: { surveyId: survey.id, title: 't', type: 'TEXT', order: 0 },
      });
      await prisma.response.create({
        data: {
          surveyId: survey.id,
          answers: { create: [{ questionId: question.id, content: 'c' }] },
        },
      });
      await prisma.response.count();
      ok++;
    } catch (e) {
      fail++;
      console.log(`  第 ${i} 圈失敗：${e.message.split('\n')[0]}`);
    }
  }

  const ms = Date.now() - t0;
  console.log(
    `${ROUNDS} 圈完成：成功 ${ok}、失敗 ${fail}，耗時 ${ms}ms（每圈約 ${Math.round(ms / ROUNDS)}ms）`,
  );
  console.log(
    fail === 0
      ? '→ 資料庫沒問題。e2e 若仍失敗，問題在 HTTP 那一層。'
      : '→ 資料庫或網路有問題，往那個方向查。',
  );

  await prisma.$disconnect();
})();
