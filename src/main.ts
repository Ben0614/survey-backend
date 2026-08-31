// ============================================================
// [教學] main.ts —— 整個後端的進入點
//
// 跑 `pnpm start:dev` 時，Node 第一個執行的就是這個檔案。
// 它只做三件事：組裝應用 → 設定關機行為 → 開始聽 HTTP。
// 之後每一章新增的功能，幾乎都不會再改到這裡。
//
// 全域設定（驗證等）抽在 src/setup-app.ts，因為測試也要套用同一份。
//
// 下一站：src/app.module.ts（那張「零件清單」裡到底裝了什麼）
// ============================================================

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import { SwaggerModule } from '@nestjs/swagger';
import { buildSwaggerDocument } from './swagger';

async function bootstrap() {
  // [教學] NestJS 的核心想法：你不自己 new 任何東西，只宣告「有哪些零件」。
  // AppModule 就是那張零件清單，NestFactory 拿著清單把所有 controller、
  // service 建立起來並互相接好，回傳一個組裝完成的應用。
  const app = await NestFactory.create(AppModule);

  // [教學] 全域設定（目前是 ValidationPipe）抽在 setup-app.ts，
  // 因為 E2E 測試也要套用同一份 —— 理由見那個檔案的檔頭。
  setupApp(app);

  // 讓 Ctrl+C / SIGTERM 時能觸發 onModuleDestroy，正常關閉資料庫連線池。
  //
  // Ch8 部署到 Render 之後量過：在這個組合下它的效果**觀測不到** ——
  // pg 的連線池閒置 10 秒就自己關掉連線、Neon 免費方案的 compute 也會 autosuspend，
  // 兩個機制都會搶先把連線收走，所以「重啟後連線累積」根本不會發生。
  // 它真正會發威的是「長閒置逾時 + 不會休眠的資料庫 + 頻繁重啟」。
  // 留著的理由是成本為零，而它失效的時候完全無聲。
  app.enableShutdownHooks();

  SwaggerModule.setup('docs', app, buildSwaggerDocument(app));

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
