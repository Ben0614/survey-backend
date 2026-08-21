// ============================================================
// [教學] create-response.dto.ts —— 提交作答時 body 的形狀與規則
//
// 什麼時候被執行：每次有人打 POST /surveys/:surveyId/responses 時，
// ValidationPipe 拿這兩個 class 上的裝飾器去檢查 body。
//
// 這是專案第一份**巢狀** DTO（body 裡有一個物件陣列），
// 而巢狀驗證是「驗證靜靜不生效」最容易發生的地方 —— 見下面 answers 那一段。
//
// 下一站：src/responses/dto/find-responses-query.dto.ts（列表的網址參數）
// ============================================================

import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// [教學] 這個 class 沒有 export，是刻意的：外面永遠是整包 CreateResponseDto 進出，
// 沒有任何地方需要單獨拿一筆答案的型別。**先關起來，有人要用時再打開。**
class AnswerDto {
  // surveyId 不在這裡（它在網址上），responseId 也不在 ——
  // 那個 id 要等 Response 建出來才存在，由 Prisma 的巢狀 write 自己填
  // （見 responses.service.ts）。
  @IsString()
  @IsNotEmpty()
  questionId: string;

  // @MaxLength(500) 跟 Ch4 的 @Max(100) 是同一種東西：**這是公開端點**，
  // 沒有上限的話一筆答案可以塞幾 MB 文字。數字本身可以調，重點是有一個。
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}

export class CreateResponseDto {
  // [教學] 這四個裝飾器缺一不可，而且缺了**不會有任何錯誤訊息**。
  //
  // 最關鍵的是中間那兩個：
  //
  //   @ValidateNested({ each: true })  「進去檢查陣列裡的每一個元素」
  //   @Type(() => AnswerDto)           「這些元素要建成 AnswerDto 的實例」
  //
  // **只寫 @IsArray() 的話，陣列裡的物件會被原封不動放行** ——
  // AnswerDto 上那些規則一條都不會執行。症狀是：
  //
  //   送 { "answers": [{ "隨便": 123 }] }
  //   → 驗證通過 → prisma.create 收到沒有 questionId 的物件 → 500
  //
  // 這是「驗證靜靜地不生效」的第三次（Ch3 是 type 少了裝飾器被 whitelist 丟掉、
  // Ch4 ① 是整份 DTO 沒被 import）。三次的共同點：
  // **驗證沒生效時不會有任何錯誤，只會在更下游炸掉。**
  //
  // 為什麼兩個都要：@ValidateNested 負責「進去」，@Type 負責「進去之後認得規則」。
  // 少了 @Type，元素還是 plain object，而**規則是掛在 class 的屬性上的**，
  // plain object 上沒有那些屬性，所以 @ValidateNested 進去也查不到東西。
  //
  // **@Type 在這裡是它的原意** —— 「這個屬性要建成哪個 class 的實例」。
  // 對照 find-responses-query.dto.ts 的 @Type(() => Number)：那是拿它來做
  // primitive 轉型，是順便沾了 JS 建構函式的行為，不是它本來的用途。
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  // @ArrayNotEmpty()：空陣列代表「交了一份什麼都沒答的問卷」，那不該是 201。
  // 注意它擋在**任何資料庫查詢之前** —— 所以 e2e 測這條時不必建題目。
  @ArrayNotEmpty()
  answers: AnswerDto[];
}
