// ============================================================
// [教學] health.module.ts —— 一個 feature module 的最小形狀
//
// feature module 就是「某一個功能領域的零件清單」。這個領域只做健康檢查，
// 所以只註冊了一個 controller，連 service 都不需要。
//
// 它被列在 app.module.ts 的 imports 裡，Nest 啟動時才會把它建起來。
// Ch2 之後的 SurveysModule 會是同樣的形狀，只是內容更多。
//
// 下一站：health.controller.ts（請求進來之後由誰接手）
// ============================================================

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// [教學] controllers 陣列的意思是「這個 module 負責處理哪些 HTTP 路由」。
// Nest 啟動時會掃描這裡列出的每個 class，讀取它們身上的 @Controller / @Get
// 等 decorator，據此建立一張路由表。沒被列進來的 controller 等於不存在。
//
// 另外注意這裡沒有 imports —— HealthController 明明要用到 PrismaService，
// 照理說該先 import PrismaModule 才對。之所以能省略，是因為 PrismaModule
// 標了 @Global()，理由見 prisma/prisma.module.ts。
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
