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
// **Ch14 加的 enableCors 是這條通則的第三個成員**，而它把通則講得更清楚：
// 判準是「產出的是**行為**還是**文件**」。CORS 改變回應標頭 → 行為 → 放這裡；
// swagger 產出的是一份 JSON → 文件 → 留在 main.ts。
//
// 而那個判準是**測試逼出來的**：走 Test.createTestingModule() 的 e2e 不會執行
// main.ts，enableCors 放那裡的話 test/cors.e2e-spec.ts 會全部拿不到標頭 ——
// CORS 就成了一個沒有測試守著的設定。
//
// **Ch16 把 CORS 的白名單改成從環境變數來**，而那件事又補了一條通則：
// 這裡的設定值一旦來自外部，就要處理「外部沒給」的情況。
// 這個檔案的選擇是**啟動時就大聲失敗**，判斷本身抽在 common/cors-origins.ts。
//
// 下一站：src/common/cors-origins.ts（那份設定的值從哪來、拿不到時為什麼要炸掉）
// ============================================================

import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { parseCorsOrigins } from './common/cors-origins';
import { flattenValidationErrors } from './common/field-errors';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ConfigService } from '@nestjs/config';

/**
 * 套用全域設定。main.ts 與 E2E 測試都必須呼叫，兩邊行為才會一致。
 */
export function setupApp(app: INestApplication): INestApplication {
  // [教學] 從 DI 容器裡「撈」一個零件出來用（Ch16）。
  //
  // Ch10 的 auth.module.ts 也讀 ConfigService，但那裡是 useFactory + inject，
  // 由 Nest 主動把零件送進來 —— 那是**容器內部**的寫法。
  // setupApp 只是一個普通函式、沒有 @Injectable()，Nest 不會餵東西給它，
  // 所以只能拿著 app 自己去 get。撈得到是因為 ConfigModule.forRoot
  // 開了 isGlobal: true（見 app.module.ts）。
  //
  // 想過但否決的另一種寫法是 setupApp(app, { corsOrigin })：
  // 那樣 main.ts 與**每一支 e2e**都要各自傳一次，而「兩邊行為一致」
  // 就重新變回靠紀律。這個檔案的價值就在呼叫端不必知道細節。
  const config = app.get(ConfigService);
  // [教學] Pipe 是 NestJS 的一種中介層，在請求抵達 controller 方法**之前**
  // 攔下參數做處理。ValidationPipe 做的是：拿 DTO 上的 class-validator
  // 裝飾器去檢查請求內容，不合格就直接回 400，controller 完全不會被呼叫。
  app.useGlobalPipes(
    new ValidationPipe({
      // [教學] exceptionFactory 接管「ValidationError[] → 例外」這一步（Ch15 輪 ③）。
      //
      // 預設的 factory 會把那棵樹攤平成**字串陣列**
      //（["password must be longer than or equal to 8 characters"]），
      // 而字串一旦產生，欄位名與規則名就黏在句子裡拆不開了 ——
      // 前端要標紅輸入框只能去解析英文。
      //
      // 所以要在**字串產生之前**接手，直接從 ValidationError 取結構
      //（見 common/field-errors.ts）。
      //
      // 丟出去的 payload 帶一個 fields —— filter 靠它認出「這是驗證錯誤」，
      // 而不是像以前那樣靠 Array.isArray(message)。那個判斷比較明確：
      // service 自己丟的 BadRequestException 沒有 fields，不會被誤認。
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          fields: flattenValidationErrors(errors),
        }),

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

    // [教學] Ch14 這裡是寫死的 'http://localhost:3000'，Ch16 改成從環境變數來。
    //
    // 換成**陣列**之後 cors 的行為跟字串模式完全不同，這一點很重要：
    //   字串  一律回那個固定值，根本不看請求的 Origin（沒有「不匹配」這回事）
    //   陣列  比對請求的 Origin，中了就把**它**原樣回去，沒中就不加這個標頭
    // test/cors.e2e-spec.ts 那條「不在白名單」的測試，是換成陣列之後才成立的。
    //
    // 用 config.get 而不是 config.getOrThrow —— 這不是偷懶，是刻意的：
    // getOrThrow 的原始碼是 isUndefined(value) 才 throw，擋不到 `CORS_ORIGIN=`
    // 那種空字串。把「什麼算沒設」整個交給 parseCorsOrigins 一個地方判斷，
    // 三種形狀（沒設／空字串／只有逗號）才會走同一條路。理由見它的檔頭。
    origin: parseCorsOrigins(config.get<string>('CORS_ORIGIN')),
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
