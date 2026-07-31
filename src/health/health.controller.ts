// ============================================================
// [教學] health.controller.ts —— 健康檢查的路由處理
//
// controller 的職責是「接住 HTTP 請求、回傳結果」，不該放商業邏輯
// （那是 service 的工作，這支 API 太簡單所以沒有 service）。
//
// 這支 API 的用途：確認服務活著、而且資料庫真的連得上。
// 部署到雲端後，平台會定期打它來判斷這個實例健不健康。
//
// 下一站：prisma/prisma.module.ts（下面的 this.prisma 是從哪冒出來的）
// ============================================================

import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// [教學] 網址是由兩層 decorator 組合出來的：
//   @Controller('health')  決定路徑前綴  → /health
//   @Get()                 決定方法路徑  → （空字串，就是前綴本身）
// 合起來是 GET /health。若下面改寫成 @Get('db')，網址就變成 GET /health/db。
@Controller('health')
export class HealthController {
  // 這行就是 NestJS 的依賴注入：宣告「我需要 PrismaService」，
  // 由 Nest 負責建立與傳入。這也是為什麼 tsconfig 需要 emitDecoratorMetadata —
  // Nest 靠編譯期產生的型別 metadata 才知道要注入什麼。

  // [教學] 把這行拆開看：
  //   private readonly —— TypeScript 的簡寫。等同於「宣告一個私有欄位，
  //                       再於建構子內 this.prisma = prisma」，省掉樣板碼。
  //                       寫了它才會有 this.prisma 可以用。
  //   : PrismaService  —— 這個型別註記就是 Nest 用來查「該注入誰」的鑰匙。
  //                       Ch0 作業第 3 題把它拿掉，Nest 就報 UnknownDependencies。
  //
  // 你從頭到尾沒有寫過 new PrismaService()，實例是 Nest 建好後塞進來的。
  constructor(private readonly prisma: PrismaService) {}

  // [教學] @Get() 把下面這個方法登記成「GET 請求的處理器」。
  // 方法叫 check 只是給人看的，名稱完全不影響網址。
  //
  // 回傳的物件 Nest 會自動轉成 JSON 並帶上 200 狀態碼 ——
  // 不需要自己碰 request / response 物件。若方法內 throw，
  // Nest 會攔下來轉成對應的錯誤回應（未分類的錯誤就是 500）。
  @Get()
  async check() {
    // 目前 schema 還沒有任何 model，所以用 raw query 確認連線真的通。
    // Ch1 建好 model 之後就會改用型別安全的查詢。

    // [教學] 這裡刻意打一次真查詢，而不是直接回 { status: 'ok' }。
    // 因為 Prisma 7 的連線是 lazy 的 —— 密碼設錯的服務照樣能啟動成功，
    // 要等到第一次真查詢才會失敗（Ch0 作業第 2 題驗證的就是這件事）。
    // 沒有這行，這支健康檢查就只能證明「Node 還活著」。
    //
    // 反引號的寫法叫 tagged template，Prisma 用它來自動處理參數跳脫；
    // 之後帶變數的 raw query 也要維持這個寫法，別自己用字串相接。
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
