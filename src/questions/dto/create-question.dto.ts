// ============================================================
// [教學] create-question.dto.ts —— 建立題目時的形狀與規則
//
// 什麼時候被執行：每次有人打 POST /surveys/:surveyId/questions 時，
// ValidationPipe 拿這個 class 上的規則檢查 request body，不合格直接回 400。
//
// DTO 是什麼、它跟 Prisma 的 Model 差在哪，見 create-survey.dto.ts 的檔頭。
// 這裡有兩個新的驗證裝飾器，以及一個「欄位刻意不放進來」的決定。
//
// 下一站：src/questions/dto/update-question.dto.ts（同一份規則的部分更新版）
// ============================================================

import {
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsEnum,
} from 'class-validator';
// [教學] QuestionType 是 schema.prisma 的 enum，由 prisma generate 產生。
// 路徑帶 .js 是 Prisma 7 的產物格式，Jest 靠 moduleNameMapper 解析回 .ts——
// 這現階段可以跳過，知道「路徑要帶 .js」就夠了。
//
// 值得記的是另一件事：它**同時是值也是型別**。下面 @IsEnum(QuestionType) 用的是「值」
// （執行期要拿它去比對），type: QuestionType 用的是「型別」（編譯期的事）。
// 一次 import 兩種用途都拿到。
import { QuestionType } from '../../generated/prisma/enums';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  // [教學] @IsEnum(X) 檢查「值必須是 X 裡列出的其中一個」。
  //
  // 底下的 `type: QuestionType` 這個型別註記**對驗證毫無作用** ——
  // TypeScript 的型別在編譯後就消失了，執行期擋不了任何東西。
  // 拔掉 @IsEnum 的下場不是「改由資料庫的 enum 擋」，而是
  // whitelist 認定這個屬性沒有驗證裝飾器 → 整個丟掉 → prisma 收到 undefined → 500。
  // （whitelist 的判準見 create-survey.dto.ts 與 ch02。）
  @IsEnum(QuestionType)
  type: QuestionType;

  // [教學] 陣列要兩層規則：@IsArray() 管「它是不是陣列」，
  // @IsString({ each: true }) 的 each 管「裡面**每一個元素**都要是字串」。
  //
  // 少了 each 就變成「這個陣列本身必須是字串」，永遠不會通過。
  // 這個 { each: true } 幾乎所有 @Is... 裝飾器都支援。
  @IsArray()
  @IsString({ each: true })
  options: string[];

  // 這裡刻意**沒有** order。
  //
  // 「這題排第幾」是伺服器算的（service 用 count 數現有題數），不讓前端指定：
  // 前端各自算容易撞號，而 Ch1 決定過不加 @@unique([surveyId, order])，
  // 撞了資料庫也不會擋。既然沒有守門員，就不要把球交給外面。
  //
  // surveyId 同樣不在這裡 —— 它在網址上（見 survey-questions.controller.ts）。
}
