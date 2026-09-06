// ============================================================
// [教學] find-responses-query.dto.ts —— 作答列表的網址參數
//
// 什麼時候被執行：每次有人打 GET /surveys/:surveyId/responses 時。
//
// 內容就是 find-surveys-query.dto.ts 的前半段（只有分頁，沒有排序與篩選），
// 所以下面那些註解是從那邊搬過來的，機制完全一樣。
//
// **為什麼不直接共用 FindSurveysQueryDto**：它的 sort 白名單寫的是
// ['createdAt', 'title'] —— 那是 Survey 的欄位，而 Response 根本沒有 title。
// 共用會讓 ?sort=title 通過驗證、然後在執行期炸成 500（ch04 ② 坑 #8 的形狀）。
// **白名單是綁定在特定資料表上的，不能跨表借用。**
//
// 下一站：src/responses/entities/response.entity.ts（三支端點回三種形狀）
// ============================================================

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class FindResponsesQueryDto {
  // [教學] @Type(() => Number) 是 class-transformer 的裝飾器（前兩份 DTO 沒有用到）。
  // 它說的是「建這個實例的時候，把這個屬性轉成 Number」。
  //
  // 為什麼非要它不可：setup-app.ts 的 `transform: true` 做的事情是
  // 「把收到的 plain object 變成這個 class 的**實例**」，**不是**「依型別註記轉型」。
  // 這兩件事很容易混為一談。少了 @Type，字串 '2' 會原封不動送進 @IsInt()，
  // 然後被擋成 400。
  //
  // 執行順序是關鍵，而且跟裝飾器寫的上下順序**無關**（它們登記在兩個不同階段）：
  //
  //   '2' ──> class-transformer 建實例 + @Type 轉型 ──> 2 ──> class-validator 跑規則 ──> 過
  //           └────────── 第一階段 ──────────┘              └──── 第二階段 ────┘
  //
  // 寫成 `() => Number` 而不是 `Number`，是為了延遲求值：裝飾器在 class 定義的當下
  // 就會執行，直接寫型別名稱碰到互相引用的型別時會拿到 undefined。這裡用不到這個保護，
  // 但 API 的形狀是統一的。
  //
  // 另一種做法是在 setup-app.ts 開全域的 enableImplicitConversion，
  // 讓它依 TypeScript 的型別註記自動猜。沒有選它的理由寫在 ch04 的「決策取捨」：
  // 隱式轉型的規則要另外記，而且對 boolean 特別容易出錯。
  @ApiPropertyOptional({
    description: '分頁',
    default: 1,
  })
  @Type(() => Number)
  // 用 @IsInt() 而不是 @IsNumber()：後者會放行 2.5，而頁碼沒有 2.5 頁。
  @IsInt()
  // @Min(1) 擋的是 ?page=0 與 ?page=-1 —— 少了它，skip 會算出負數，
  // Prisma 直接丟例外變成 500。前端一個手誤不該把伺服器打成 500。
  @Min(1)
  // [教學] 這個 `= 1` 是普通的 class 屬性預設值，不是什麼特殊語法。
  //
  // 它能生效是因為第一階段就已經建好實例了：沒帶 ?page 的話，
  // class-transformer 建出來的實例上這個屬性本來就是 1，
  // 到第二階段時它早就不是 undefined 了。
  //
  // 也因為如此，這裡**不需要** @IsOptional()。對照 update-survey.dto.ts 那段
  // 「@IsOptional() 是短路開關」——那份 DTO 的欄位真的可能是 undefined，這份不會。
  page: number = 1;

  @ApiPropertyOptional({
    description: '每頁筆數',
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // @Max(100) 不是湊規則，是這支端點唯一真正的安全措施。
  //
  // 沒有上限的話 ?pageSize=999999 等於把分頁整個繞過去：資料庫撈 99 萬列、
  // Node 全部組成物件塞進記憶體、再序列化成幾百 MB 的 JSON。這是公開端點，
  // 任何人都能打。分頁的整個意義就是「不要一次回全部」，沒有上限 = 這一章白做。
  //
  // 常見的誤解是「資料量大就該把上限開大」——不對，pageSize 是「一頁幾筆」，
  // 資料量是靠**頁數變多**承載的。真的需要一次拿全部（例如匯出 CSV），
  // 那是另一支端點的事（串流或背景任務），不是把這個數字調大。
  //
  // 100 本身是慣例、可以調，重點是有一個。
  @Max(100)
  pageSize: number = 10;

  @ApiPropertyOptional({
    description: '順序',
    default: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
