// ============================================================
// [教學] prisma/seed.ts —— 把「開發用的假資料」塞進資料庫
//
// 什麼時候被執行：只有你手動下 `pnpm exec prisma db seed` 的時候。
// API 跑起來之後完全不會碰到它，正式環境也不會跑。
//
// 它存在的理由很實際：Ch2 之後你每寫一個查詢都需要資料庫裡有東西可查。
// 沒有 seed 的話，每次清空資料庫（或換一台電腦）都要手動再建一次問卷。
//
// 這也是你第一次看到 Prisma Client 的查詢寫法 —— Ch2 會正式講，
// 這裡先當範本讀過去就好。
//
// 下一站：src/setup-app.ts（正式環境與測試怎麼共用同一組全域設定）
// ============================================================

// [教學] 這個檔案是獨立執行的腳本，沒有 NestJS 幫忙，
// 所以連線的三件事都要自己來：讀 .env、建 client、記得關連線。
// 對照 src/prisma/prisma.service.ts —— 那邊這三件事分別由
// ConfigModule、依賴注入、onModuleDestroy 代勞。
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL 未設定，請照 .env.example 建立 .env');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// [教學] 這些 id 是寫死的，不是 cuid。
//
// 因為 seed 要能「重複執行不出事」（下面用 upsert 達成），
// 而 upsert 需要一個固定的識別碼才知道「這筆是不是已經存在」。
// 每次都讓 cuid 隨機產生的話，跑五次就會有五份一模一樣的問卷。
//
// 只有 seed 資料這樣做；正式流程建立的問卷還是交給 @default(cuid())。
// 前綴 seed- 讓你在 Prisma Studio 裡一眼看出哪些是假資料。
const DRAFT_SURVEY_ID = 'seed-survey-draft';
const PUBLISHED_SURVEY_ID = 'seed-survey-published';
const RESPONSE_ID = 'seed-response-1';

// [教學] 把資料和寫入邏輯分開：上面是「要塞什麼」，下面是「怎麼塞」。
// 之後想多加一題，改這裡就好，不必動下面的迴圈。
const SURVEYS = [
  {
    id: DRAFT_SURVEY_ID,
    title: '員工滿意度調查（草稿）',
    status: 'DRAFT' as const,
    questions: [
      {
        title: '你對目前的工作內容滿意嗎？',
        type: 'SINGLE_CHOICE' as const,
        options: ['非常滿意', '滿意', '普通', '不滿意'],
      },
      {
        title: '你認為公司最需要改善的是什麼？',
        type: 'TEXT' as const,
        options: [],
      },
      {
        title: '你會推薦朋友來這裡工作嗎？',
        type: 'SINGLE_CHOICE' as const,
        options: ['會', '不會'],
      },
    ],
  },
  {
    id: PUBLISHED_SURVEY_ID,
    title: '新產品意見回饋',
    status: 'PUBLISHED' as const,
    questions: [
      {
        title: '你使用這個產品多久了？',
        type: 'SINGLE_CHOICE' as const,
        options: ['未滿一個月', '一到六個月', '超過半年'],
      },
      { title: '最常使用哪一個功能？', type: 'TEXT' as const, options: [] },
      {
        title: '整體而言你會給幾分？',
        type: 'SINGLE_CHOICE' as const,
        options: ['5', '4', '3', '2', '1'],
      },
    ],
  },
];

async function main() {
  for (const survey of SURVEYS) {
    // [教學] upsert = 「有就更新，沒有就新增」（update + insert 的合體）。
    // 用它而不是 create，seed 才能重複跑而不會撞到主鍵重複。
    //
    // 三個參數的分工：
    //   where  —— 怎麼判斷「這筆存不存在」
    //   update —— 存在的話要改成什麼
    //   create —— 不存在的話要建什麼
    await prisma.survey.upsert({
      where: { id: survey.id },
      update: { title: survey.title, status: survey.status },
      create: { id: survey.id, title: survey.title, status: survey.status },
    });

    // [教學] 題目的 order 直接用陣列索引 —— 陣列有順序，資料表沒有，
    // 所以「第幾題」這件事必須明確存成一欄（見 docs/關聯式資料庫基礎.md 第 5 節）。
    for (const [index, question] of survey.questions.entries()) {
      const data = {
        surveyId: survey.id,
        title: question.title,
        type: question.type,
        order: index,
        options: question.options,
      };

      await prisma.question.upsert({
        where: { id: `${survey.id}-q${index}` },
        update: data,
        create: { id: `${survey.id}-q${index}`, ...data },
      });
    }
  }

  // [教學] 再塞一份「已經有人填過」的回覆，讓 Response / Answer 兩張表也有東西可看。
  // 只有 PUBLISHED 的問卷能被填答 —— 這條規則 Ch5 才會用程式強制，這裡先自己遵守。
  await prisma.response.upsert({
    where: { id: RESPONSE_ID },
    update: {},
    create: { id: RESPONSE_ID, surveyId: PUBLISHED_SURVEY_ID },
  });

  const answers = ['6到12個月', '匯出報表', '4'];

  for (const [index, content] of answers.entries()) {
    const questionId = `${PUBLISHED_SURVEY_ID}-q${index}`;

    // [教學] 注意 where 這個奇怪的欄位名 responseId_questionId ——
    // 它是 Prisma 依照 schema 裡 @@unique([responseId, questionId]) 的順序自動組出來的。
    // 這代表「用那組唯一約束來找這一筆」，順序寫反的話名字也會跟著變。
    await prisma.answer.upsert({
      where: { responseId_questionId: { responseId: RESPONSE_ID, questionId } },
      update: { content },
      create: { responseId: RESPONSE_ID, questionId, content },
    });
  }

  console.log('Seed 完成：2 份問卷、6 題、1 份回覆、3 個答案');
}

// [教學] 這是獨立腳本的標準收尾：
//   catch  —— 出錯時印出原因，並用 exit code 1 讓 CLI 知道失敗了
//   finally —— 不論成功失敗都要關連線，否則 Node process 會掛在那裡不結束
//              （跟 prisma.service.ts 的 onModuleDestroy 是同一個道理）
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
