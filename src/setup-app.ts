// ============================================================
// [教學] setup-app.ts —— 正式環境與測試共用的「全域設定」
//
// 什麼時候被執行：main.ts 啟動應用時、以及每個 E2E 測試建立測試應用時，
// 各呼叫一次。
//
// 為什麼要獨立成一個檔案：Test.createTestingModule() 建出來的應用
// **不會**自動套用 main.ts 裡寫的設定（那是兩段完全獨立的程式碼）。
// 只寫在 main.ts 的話，會出現「手動打 API 回 400、E2E 測試卻回 201」
// 這種兩邊行為不一致的鬼打牆。
//
// 通則：任何「改變應用整體行為」的設定都放這裡，不要留在 main.ts。
//
// 下一站：src/swagger.ts（同樣由 main.ts 呼叫，但它產出的是「文件」而不是行為）
// ============================================================

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * 套用全域設定。main.ts 與 E2E 測試都必須呼叫，兩邊行為才會一致。
 */
export function setupApp(app: INestApplication): INestApplication {
  // [教學] Pipe 是 NestJS 的一種中介層，在請求抵達 controller 方法**之前**
  // 攔下參數做處理。ValidationPipe 做的是：拿 DTO 上的 class-validator
  // 裝飾器去檢查請求內容，不合格就直接回 400，controller 完全不會被呼叫。
  app.useGlobalPipes(
    new ValidationPipe({
      // DTO 沒宣告的欄位直接丟掉（不是報錯，是無聲移除）。
      // 這是實質的安全措施：沒有它，前端多送一個 status: 'PUBLISHED'
      // 就會被原封不動塞進 prisma.create()，繞過「只有發布中的問卷能填答」這類規則。
      // 這種漏洞叫 mass assignment。
      whitelist: true,

      // 把 JSON 轉成 DTO 的實例，並依照型別註記轉型
      // （網址參數永遠是字串，這行讓 `id: number` 真的拿到 number）。
      transform: true,
    }),
  );

  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin: 'http://localhost:3000',
  });

  // [教學] Filter 跟 Pipe 是同一個家族、位置相反的兩個中介層：
  // Pipe 站在請求「進來」的路上（每個請求都跑），
  // Filter 站在回應「出去」的路上，而且**只有例外被丟出來時才跑**。
  // 所以這兩句是並排的兩件事，不是巢狀關係。
  //
  // Nest 本來就內建一個 filter，掛上自己這一支之後就換成由它負責錯誤回應。
  app.useGlobalFilters(new AllExceptionsFilter());

  return app;
}
