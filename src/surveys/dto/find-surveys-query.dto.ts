// ============================================================
// [教學] find-surveys-query.dto.ts —— 網址 `?` 後面那一段的規則
//
// 什麼時候被執行：每次有人打 GET /surveys 時，ValidationPipe 拿這個 class
// 上的裝飾器去檢查 query string，不合格就直接回 400。
// DTO 是什麼、它跟 Prisma 的 Model 差在哪，見 create-survey.dto.ts 的檔頭。
//
// 跟前兩份 DTO 的差別只有一個，但它是這一章的主題：
// **query string 的值永遠是字串**。`?page=2` 進來是 '2' 不是 2，
// 因為網址本身就是一段文字，裡面沒有「數字」這種東西。
//
// 下一站：src/surveys/surveys.service.ts（通過檢查之後誰來處理）
// ============================================================

import {
  IsInt,
  Min,
  Max,
  IsIn,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SurveyStatus } from '../../generated/prisma/enums';

export class FindSurveysQueryDto {
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

  // [教學] 這個白名單擋的**不是 SQL injection**（Ch4 ② 加的）。
  //
  // Prisma 的 orderBy 是型別安全的，前端傳什麼進來都不會變成一段 SQL 被執行。
  // 但欄位名不存在時 Prisma 會在執行期丟 PrismaClientValidationError，
  // 那是沒被預期的例外 → **500**。所以白名單擋的是兩件事：
  //   1. 前端一個手誤（?sort=name）就把伺服器打成 500
  //   2. 有人用試錯把資料表的內部欄位名一個一個探出來
  //
  // 這一條特別重要，因為 service 那邊的 orderBy 用的是動態 key
  // （`{ [query.sort]: query.order }`），而 **TypeScript 對動態 key 完全檢查不到** ——
  // 連把欄位名拼錯成 createAt 都是綠的（實測見 ch04 坑 #8）。
  // 也就是說：**這個白名單是那一行唯一的防線。**
  @IsIn(['createdAt', 'title'])
  sort: 'createdAt' | 'title' = 'createdAt';

  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  // [教學] 從這裡開始的兩個屬性**需要 @IsOptional()，而上面兩個不需要** ——
  // 差別只有一個：**有沒有預設值**。
  //
  //   sort / order   有預設值 → 第一階段建實例時就已經是 'createdAt' / 'desc'，
  //                  跑到第二階段時它們永遠不是 undefined，沒東西需要短路
  //   status / q     沒有預設值 → 沒帶就真的是 undefined，而驗證裝飾器碰到
  //                  undefined 會直接判失敗。@IsOptional() 就是那個短路開關
  //                  （同 update-survey.dto.ts 的 PartialType 那段）
  //
  // 型別的 `?` 也不是可有可無的裝飾：少了它，型別會宣稱「這個值一定存在」，
  // 於是 query.q.toLowerCase() 這種寫法 tsc 全綠、執行期直接炸成 500。
  // **@IsOptional() 和 `?` 要成對出現**，一個管執行期、一個管編譯期。
  //
  // 為什麼沒有給它們預設值：預設值的意思是「沒指定就用這個」，
  // 但「沒指定篩選條件」要的是**不要篩**，不是「篩某個特定值」——
  // 而 undefined 在 Prisma 眼中正好就是「不加這個條件」（見 surveys.service.ts 的 where）。
  @IsEnum(SurveyStatus)
  @IsOptional()
  status?: SurveyStatus;

  @IsString()
  @IsOptional()
  q?: string;
}
