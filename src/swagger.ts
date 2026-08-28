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
// 下一站：src/common/filters/all-exceptions.filter.ts（所有錯誤回應的唯一出口）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('問卷')
    .setDescription('問卷swagger')
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}
