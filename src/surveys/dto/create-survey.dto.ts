// ============================================================
// [教學] create-survey.dto.ts —— 請求進來的第一道關卡
//
// 什麼時候被執行：每次有人打 POST /surveys 時，ValidationPipe 會拿
// 這個 class 上的裝飾器去檢查 request body，不合格就直接回 400，
// controller 根本不會被呼叫。
//
// DTO = Data Transfer Object，「一次資料傳遞的形狀」。
// 它跟 Prisma 產生的 Survey 型別是兩件不同的東西：
//   DTO    —— 外面**可以送進來**什麼（人為決定，通常比較小）
//   Model  —— 資料庫裡**實際存**什麼（schema.prisma 決定）
// 兩者刻意不共用，因為「能被寫入」和「有這個欄位」是不同的問題。
//
// 下一站：src/surveys/dto/update-survey.dto.ts（同一份規則，改成「部分更新」版）
// ============================================================

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSurveyDto {
  // [教學] 這些 @Is... 是 class-validator 的裝飾器，一個裝飾器一條規則，
  // 全部通過才算合格。錯誤訊息會自動組好放進 400 的回應裡。
  //
  //   @IsString()   型別必須是字串（送數字進來也會被擋）
  //   @IsNotEmpty() 不能是空字串
  //   @MaxLength()  上限，避免有人塞一份小說進來當標題
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  // 這裡刻意**沒有** status。
  //
  // 新問卷一律是 DRAFT（schema.prisma 的 @default(DRAFT)），
  // 「發布」是一個獨立的動作而不是建立時的參數 —— 因為它之後會綁上
  // 商業規則（Ch5：只有 PUBLISHED 能被填答）。
  //
  // 把它留在 DTO 外面，配合 ValidationPipe 的 whitelist: true，
  // 前端就算硬送 status: 'PUBLISHED' 也會被無聲丟掉。
}
