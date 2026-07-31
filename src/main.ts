// ============================================================
// [教學] main.ts —— 整個後端的進入點
//
// 跑 `pnpm start:dev` 時，Node 第一個執行的就是這個檔案。
// 它只做三件事：組裝應用 → 設定關機行為 → 開始聽 HTTP。
// 之後每一章新增的功能，幾乎都不會再改到這裡。
//
// 下一站：src/app.module.ts（那張「零件清單」裡到底裝了什麼）
// ============================================================

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // [教學] NestJS 的核心想法：你不自己 new 任何東西，只宣告「有哪些零件」。
  // AppModule 就是那張零件清單，NestFactory 拿著清單把所有 controller、
  // service 建立起來並互相接好，回傳一個組裝完成的應用。
  const app = await NestFactory.create(AppModule);

  // 讓 Ctrl+C / SIGTERM 時能觸發 onModuleDestroy，正常關閉資料庫連線池。
  // 部署到 Render 之後這件事更重要，否則每次重啟都會留下沒關掉的連線。
  app.enableShutdownHooks();

  // [教學] ?? 是「左邊沒有就用右邊」（只有 null 或 undefined 才算沒有）。
  // .env 有設 PORT 就用它（本機是 3100），沒設就退回 3000。
  //
  // listen 之後這個 process 就不會結束，會一直待著等請求進來 ——
  // 這就是為什麼終端機跑起來後不會跳回提示字元。
  await app.listen(process.env.PORT ?? 3000);
}

// [教學] bootstrap 是 async 函式，呼叫它會得到一個 Promise。
// 這裡已經是最外層、沒有人能 await 它，前面加 void 是告訴 ESLint
// 「我知道這是 Promise，是故意不等它的」，不是忘記寫 await。
void bootstrap();
