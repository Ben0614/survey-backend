// ============================================================
// [教學] find-one-survey-query.dto.ts —— GET /surveys/:id 的網址參數
//
// 什麼時候被執行：每次有人打 GET /surveys/:id 時，ValidationPipe 拿這個 class
// 上的裝飾器去檢查 `?` 後面那一段。
//
// 檔名跟 find-surveys-query.dto.ts 只差在 one/s，**是刻意的**：
// 前者管「查一份」、後者管「查一頁」。取名時避開了只差一個 s 的
// find-survey-query.dto.ts —— 那種名字 import 錯了看起來完全正常。
//
// 這份 DTO 只有一個屬性，但它是三份 query DTO 裡最麻煩的一個：
// **boolean 是 query string 轉型最容易出錯的型別。**
//
// 下一站：src/surveys/surveys.service.ts（通過檢查之後誰來處理）
// ============================================================

import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class FindOneSurveyQueryDto {
  // [教學] 這裡**不能**用 @Type(() => Boolean)，而 page 用 @Type(() => Number) 沒問題。
  // 差別不在「轉得對不對」，在**轉壞了看不看得出來**：
  //
  //   Number('2')      → 2      Boolean('true')  → true
  //   Number('abc')    → NaN    Boolean('false') → true   ← 非空字串一律 truthy
  //                             Boolean('abc')   → true
  //
  // Number 有一個代表「失敗」的值（NaN），@IsInt() 抓得到 → 400。
  // **Boolean 沒有。** 沒有 NaB 這種東西 —— 任何字串都被映射成一個完全合法的布林值，
  // 於是驗證那一層分不出「使用者說了什麼」和「轉型把它變成什麼」。
  //
  // 所以 ?includeQuestions=false 用 @Type 會變成 true：你送 false 拿到 true，
  // 而且沒有任何錯誤。這就是 find-surveys-query.dto.ts 提過的
  // 「不開全域 enableImplicitConversion」的理由（見 ch04 的決策取捨）。
  //
  // [教學] @Transform 是同一個套件（class-transformer）的另一個裝飾器，
  // 差別是**誰決定怎麼轉**：@Type 把工作交給那個建構函式，@Transform 由你自己寫。
  // 執行時機兩者完全一樣，都在第一階段（建實例），驗證是第二階段 ——
  // 所以 @IsBoolean() 檢查的是**轉換之後**的值，不是網址上那串文字。
  //
  // 最後那個 `: value`（認不得就原封不動回傳）是這一行的重點，不是隨手寫的 fallback。
  // 寫成 `value === 'true'` 一種比對的話，?includeQuestions=ture（手誤）會變成 false，
  // 然後 **200 配沒有題目** —— 使用者以為自己要了題目，伺服器安靜地當作沒要。
  // 原封不動回傳的話那個屬性還是 string，@IsBoolean() 就擋得下來變成 400。
  // **「沒有錯誤」不等於「正確」，這是這個專案第三次遇到。**
  //
  // 參數標成 `{ value: unknown }` 而不是讓它吃預設的 any：
  // TransformFnParams 的 value 是 any（class-transformer 不可能知道你會收到什麼），
  // 直接 return 它會被 ESLint 的 no-unsafe-return 擋下 —— 那條規則在擋 any 的擴散。
  // unknown 的意思是「我不知道它是什麼，所以你不准直接用它」，
  // 而下面本來就先比對過才使用，標成 unknown 一行都不用改。
  // **處理外部輸入的通則：邊界上標 unknown，不要標 any。**
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  // [教學] 有預設值，所以**不需要 @IsOptional()**，型別也不加 `?` ——
  // 判準跟 find-surveys-query.dto.ts 的 sort / order 同一條：
  // 有預設值 → 進到驗證階段時永遠不是 undefined → 沒有東西需要短路。
  //
  // 預設 false（不帶題目）是這一段的設計決定，理由見 ch04 第三段的決策取捨：
  // 它是一次 breaking change（Ch3 以來一律帶題目），但前端還沒建，現在改是免費的。
  includeQuestions: boolean = false;
}
