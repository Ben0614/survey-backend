// ============================================================
// [教學] replace-questions.dto.ts —— PUT /surveys/:surveyId/questions 的 body
//
// 什麼時候被執行：整份取代題目時，ValidationPipe 拿它檢查 body。
//
// 它只有一個屬性，卻是這一輪最值得看的地方 —— 因為它示範了
// **「整份取代」與「部分更新」在 DTO 上長得完全不一樣**：
//
//   UpdateQuestionDto     PartialType，每個欄位都可以不給 → 「沒給就別動」
//   ReplaceQuestionsDto   questions 必填              → 「你送什麼，那份問卷就變成什麼」
//
// 所以這裡**刻意不是** @ApiPropertyOptional（第一版寫成 Optional，見下方）。
//
// 下一站：src/questions/entities/question.entity.ts（這幾支 API 回什麼的形狀）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateQuestionDto } from './create-question.dto';

export class ReplaceQuestionsDto {
  // [教學] 三個裝飾器缺一不可，而且少了誰都**不會有錯誤訊息**：
  //
  //   @IsArray()                    它是不是陣列
  //   @ValidateNested({ each: true }) 裡面每一個元素都要照 CreateQuestionDto 檢查
  //   @Type(() => CreateQuestionDto)  ⚠️ 少了它，上一行等於沒寫
  //
  // 最後那個是 class-transformer 的，不是 class-validator 的。原因是
  // JSON 進來時每個元素只是普通的 object，身上沒有任何裝飾器 ——
  // @Type 才會把它轉成 CreateQuestionDto 的實例，規則才找得到。
  // 少了它送 `{ questions: [{ title: 123 }] }` 一樣是 200。
  //（同 create-survey.dto.ts 的 questions，Ch17 輪 ② 已經踩過一次。）
  //
  // **這裡沒有 @IsOptional()，那是刻意的決定。**
  // 第一版寫成 @ApiPropertyOptional，於是契約說「可以不給」、驗證卻要求一定要給
  // —— 那是「文件說了一句不成立的話」，跟 Ch13 修掉的那個假 `default: 0` 同一種形狀。
  //
  // 判準是**那件事有沒有意義**：整份取代時「不給 questions」講不出一個意思
  // （要清空就送 []，那是明確的），而 create-survey.dto.ts 的 questions 可以不給，
  // 因為「先建一份空草稿、之後再補題目」是真的用法。同一個屬性名，兩個答案。
  //
  // 順帶一個實際的後果：若放行 undefined，service 的 dto.questions.map() 會丟
  // TypeError → **500**。使用者輸入造成 500 一律算 bug，而必填讓那條路徑不存在，
  // 不必在 service 寫任何 if。
  @ApiProperty({
    description:
      '這份問卷取代後的完整題目清單。**順序就是陣列的順序**；送 [] 代表清空所有題目',
    type: [CreateQuestionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}
