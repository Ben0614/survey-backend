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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
// 重用 CreateQuestionDto，不在這裡複製一份一樣的規則（Ch17 輪 ②）。
//
// 跨 feature import DTO 沒問題 —— survey.entity.ts 早就 import 了 question.entity.ts。
// 而複製一份的代價很具體：哪天 CreateQuestionDto 的 maxLength 改了、或多一條規則，
// 這一份不會跟著變，**而且沒有人會發現**（兩邊都合法）。
//
// 重用的收益在這一輪就兌現了：「單選題至少兩個選項」寫在那一份裡，
// POST /surveys 與 POST /surveys/:surveyId/questions **兩條路徑同時生效**，
// 這裡一個字都不用多寫。
import { CreateQuestionDto } from '../../questions/dto/create-question.dto';

export class CreateSurveyDto {
  // [教學] 這些 @Is... 是 class-validator 的裝飾器，一個裝飾器一條規則，
  // 全部通過才算合格。錯誤訊息會自動組好放進 400 的回應裡。
  //
  //   @IsString()   型別必須是字串（送數字進來也會被擋）
  //   @IsNotEmpty() 不能是空字串
  //   @MaxLength()  上限，避免有人塞一份小說進來當標題
  //
  // [教學] @ApiProperty 是 @nestjs/swagger 的裝飾器（Ch7 加的），
  // 它跟上面那三個**不是同一套東西**，這是這一章最重要的一件事：
  //
  //   class-validator 的裝飾器 —— 執行期真的檢查，不合格回 400
  //   @ApiProperty            —— 只是登記「文件上要怎麼描述這個屬性」，
  //                              從不檢查任何東西，拿掉它 API 行為一個字都不變
  //
  // **兩套 metadata 互不相通**：執行期 Swagger 不會去讀 @MaxLength(200)，
  // class-validator 也不知道 @ApiProperty 說了什麼。所以下面的 maxLength: 200
  // 是**第二次**寫同一件事 —— 改了一邊忘了另一邊，文件就開始說謊，
  // 而且不會有任何錯誤訊息（tsc 綠、測試綠、API 行為完全正確）。
  //
  // 「互不相通」只在**這個專案現在的設定下**成立，收尾時實測確認過：
  // @nestjs/swagger 有一個 CLI plugin（nest-cli.json 的 plugins），開了之後
  // 它會在**編譯期**去讀 class-validator，把 @Min/@Max 變成 minimum/maximum、
  // @ArrayNotEmpty 變成 minItems、@IsIn 變成 enum。也就是說那道牆是可以打通的，
  // 只是要用另一套機制（編譯期的 AST 轉換，不是執行期的 metadata）。
  // 這個專案沒有開，理由與四個探針的量測結果寫在 ch07 的「決策取捨」。
  //
  // 為什麼非要它不可：沒有它的話，這份 DTO 在 /docs-json 裡是
  // `{ "type": "object", "properties": {} }` —— 一個空殼。
  // Swagger 拿得到 CreateSurveyDto 這個 class（requestBody 的 $ref 就是證據），
  // 但拿不到它的屬性 —— `title: string` 這個宣告編譯成 JS 之後完全不存在，
  // 執行期要知道一個 class 有哪些屬性，唯一的辦法就是屬性上有裝飾器。
  //
  // 三個欄位各自的作用：
  //   description —— Swagger UI 上顯示的說明文字
  //   maxLength   —— 只是顯示，不會檢查（真正擋人的是上面的 @MaxLength）
  //   example     —— Swagger UI「Try it out」預填的值，也是前端最常看的東西
  @ApiProperty({
    description: '問卷標題',
    maxLength: 200,
    example: '員工滿意度調查',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  // [教學] 巢狀的子資源（Ch17 輪 ②）。三個裝飾器缺一不可，
  // 範本就是 Ch5 的 create-response.dto.ts（那裡是 answers）：
  //
  //   @IsArray()                    它得是一個陣列
  //   @ValidateNested({ each: true }) 陣列裡**每一個元素**都要照它自己的規則檢查
  //   @Type(() => CreateQuestionDto)  告訴 class-transformer 那些元素要轉成哪個 class
  //
  // ⚠️ 少了 @Type 最危險：JSON 進來時裡面是普通物件，class-validator
  // 在普通物件上讀不到任何裝飾器 → **每一個元素都直接通過**。
  // 沒有錯誤訊息，只是那一層驗證整個消失了。
  //
  // 為什麼是選填：建一份沒有題目的空草稿仍然合法（列表上就是 0 題那幾筆）。
  // 「先建再慢慢加題目」跟「一次建好」兩種流程都要能走。
  //
  // 這裡刻意**沒有** order —— 題目的順序由陣列本身決定，service 用索引填。
  // 理由同 create-question.dto.ts 結尾那段：不讓前端指定序號。
  @ApiPropertyOptional({
    description: '一併建立的題目。順序就是陣列的順序；不給就是一份空草稿',
    type: [CreateQuestionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @IsOptional()
  questions?: CreateQuestionDto[];

  // 這裡刻意**沒有** status。
  //
  // 新問卷一律是 DRAFT（schema.prisma 的 @default(DRAFT)），
  // 「發布」是一個獨立的動作而不是建立時的參數 —— 因為它之後會綁上
  // 商業規則（Ch5：只有 PUBLISHED 能被填答）。
  //
  // 把它留在 DTO 外面，配合 ValidationPipe 的 whitelist: true，
  // 前端就算硬送 status: 'PUBLISHED' 也會被無聲丟掉。
}
