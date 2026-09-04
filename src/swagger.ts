// ============================================================
// [教學] swagger.ts —— 把整個應用掃一遍，產出一份 OpenAPI 文件
//
// 什麼時候被執行：main.ts 啟動時呼叫一次；E2E 測試也自己呼叫一次
// （test/swagger.e2e-spec.ts）。
//
// 它做的事只有一件：把所有 controller 與 DTO / entity 上的裝飾器蒐集起來，
// 組成一個 OpenAPI 物件。SwaggerModule.setup() 再拿那個物件掛出
// GET /docs（人看的網頁）與 GET /docs-json（機器讀的規格，Ch13 的輸入）。
//
// 為什麼獨立成一個檔案，而不是三行寫在 main.ts 裡：
// 測試要拿到**同一份** document 才驗得了「文件有沒有說謊」，
// 而寫在 main.ts 裡的東西測試構不到。理由的形狀跟 setup-app.ts 一樣，
// 差別是那邊共用的是「套用設定」，這裡共用的是「產生 document」。
//
// 為什麼不放進 setup-app.ts：那裡的通則是「改變應用整體行為的設定」，
// 而這支只是多掛一條路由；而且 84 條 e2e 每一條都建一次應用，
// 每條都掃一次全部 metadata 純粹是成本。
//
// Ch10 加了 .addBearerAuth()，但它只做一半：**宣告「有 bearer 這種認證方式」**，
// 讓 /docs 右上角長出 Authorize 按鈕。它不會把任何端點標成需要認證 ——
// 那要各 controller 自己加 @ApiBearerAuth()。
// 兩邊只做一邊的話，/docs 會顯示端點不必認證而實際回 401：
// 又一次「文件說謊」，跟 login.entity.ts 檔頭記的那次同一族。
//
// 下一站：src/common/filters/all-exceptions.filter.ts（所有錯誤回應的唯一出口）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  // [教學] 這三句寫的是「整份文件的抬頭」，會出現在 /docs 頁面最上方 ——
  // 前端打開文件第一眼看到的就是它。
  //
  // description 值得多寫幾句：它是唯一可以放**跨端點共通規則**的地方。
  // 錯誤格式、狀態碼的判準這類東西每一支端點都適用，逐支寫 15 次不合理，
  // 但完全不寫，前端就得自己從各支端點的回應反推。
  const config = new DocumentBuilder()
    .setTitle('問卷平台 API')
    .setDescription(
      [
        '建立問卷、發布、填答與查詢結果。',
        '',
        '**錯誤格式**：所有端點的錯誤回應都是 `{ error: { code, message, details? } }`，',
        '`code` 是 `BAD_REQUEST` / `NOT_FOUND` / `CONFLICT` / `VALIDATION_FAILED` / `INTERNAL_ERROR` / `UNAUTHORIZED` / `FORBIDDEN` 其中之一。',
        '請用 `code` 分支處理，不要解析 `message`（它的內容會隨版本變動）。',
        '`details` 只有欄位驗證失敗（`VALIDATION_FAILED`）時才會出現。',
        '',
        '**三條商業規則**，違反時回 409：',
        '- 只有 `PUBLISHED` 的問卷能被填答',
        '- `DRAFT` 才能增刪改題目；一旦有人填答就不能撤回發布',
        '',
        '**權限**：除了 `/health`、註冊、登入之外都要帶 JWT（否則 401）。',
        '- 問卷與它的題目、填答結果，只有**建立者本人或 `ADMIN`** 能改／能看（否則 403）',
        '- 刪除整份問卷只有 `ADMIN` 能做',
        '- 但**任何登入的人都能填任何已發布的問卷**，那是這個平台的用途',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}
