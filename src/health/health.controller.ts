// ============================================================
// [教學] health.controller.ts —— 健康檢查的路由處理
//
// controller 的職責是「接住 HTTP 請求、回傳結果」，不該放商業邏輯
// （那是 service 的工作，這支 API 太簡單所以沒有 service）。
//
// 這支 API 的用途：確認服務活著、而且資料庫真的連得上。
// 部署到雲端後，平台會定期打它來判斷這個實例健不健康。
//
// **Ch10 輪 2 加了 @Public()**：全域 guard 上線後預設每支端點都要登入，
// 而這支的呼叫者是 Render 的健康檢查 —— 它不會帶 token，也不該帶。
// 漏標的症狀是平台判定實例不健康而反覆重啟，服務看起來時好時壞。
//
// 下一站：prisma/prisma.module.ts（下面的 this.prisma 是從哪冒出來的）
// ============================================================

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

// [教學] 網址是由兩層 decorator 組合出來的：
//   @Controller('health')  決定路徑前綴  → /health
//   @Get()                 決定方法路徑  → （空字串，就是前綴本身）
// 合起來是 GET /health。若下面改寫成 @Get('db')，網址就變成 GET /health/db。
@ApiTags('health')
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
  // 這支端點刻意**不標回應 schema**（Ch7 的決定）。
  //
  // 判準是「誰照著這份文件寫程式」：/docs 的產品是給前端串接用的契約，
  // 而 /health 的呼叫者是人工排錯（未來若接監控也算），它們只看狀態碼。
  // 為一個沒有前端讀者的回應維護一份 entity，等於多養一份會過期的真相
  // （代價見 survey.entity.ts 檔頭）。
  //
  // Ch8 刻意**沒有**把這支設成 Render 的 Health Check Path。
  // （上面那句原本寫著「呼叫者是 Render 的健康檢查」—— 那從來沒成真，Ch8 更正。）
  // 理由是算出來的：這支每次都做一次真的資料庫查詢，而平台的健康檢查是**定期輪詢**，
  // Neon 的 compute 會因此永遠不 autosuspend。免費方案是 100 CU-hours／月，
  // 最小的 0.25 CU 連續跑一個月是 0.25 × 730 ≈ 182 CU-hours —— 撐不到月底，
  // 而額度用完的症狀不是報錯，是某天發現資料庫連不上。
  //
  // 留 @ApiOperation 是因為它仍然該出現在端點清單上 ——
  // 「有這支端點、但它不是給你串的」本身就是一句有用的資訊。
  @ApiOperation({ summary: '路由健康檢查' })
  @Public()
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
