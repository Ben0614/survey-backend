// ============================================================
// [教學] test/helpers/reset-db.ts —— 每個測試開始前把資料清乾淨
//
// 什麼時候被執行：由各個 e2e 測試檔在 beforeEach 裡呼叫。
//
// 為什麼每個測試都要清一次，而不是整個檔案清一次：
// 測試之間必須互相獨立。若 A 測試刪掉某份問卷、B 測試又需要它，
// 就會出現「單獨跑會過、一起跑會失敗」——最難查的那種測試 bug。
//
// 下一站：test/health.e2e-spec.ts（最小的一個 E2E 測試）
// ============================================================

import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * 清空五張業務資料表（Ch9 起多了 User）。
 *
 * 用一句 TRUNCATE 一次處理五張表，`CASCADE` 讓資料庫自己解決外鍵順序 ——
 * 不必煩惱「要先刪 Answer 還是先刪 Question」。
 *
 * 為什麼不用 deleteMany()：那是四次來回，而且要自己排順序。
 * TRUNCATE 是一句 SQL、在資料庫端一次做完，測試每跑一個案例就呼叫一次，差別會累積。
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  // [教學] 表名要加雙引號，因為 Prisma 建出來的表名是大寫開頭（"Survey"）。
  // PostgreSQL 沒加引號的識別字會被自動轉小寫，變成找不到 survey 這張表。
  //
  // $executeRawUnsafe 的 Unsafe 是指「這段字串不會被參數化」——
  // 拼接使用者輸入進去就是 SQL injection。這裡是寫死的常數，沒有這個風險。
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Answer", "Response", "Question", "Survey", "User" RESTART IDENTITY CASCADE',
  );
}
