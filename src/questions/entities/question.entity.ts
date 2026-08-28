// ============================================================
// [教學] question.entity.ts —— 題目相關端點回什麼的形狀
//
// 什麼時候被執行：**執行期永遠不會**（理由見 survey.entity.ts 檔頭）。
//
// 四支端點共用這一份，因為它們回的形狀真的一樣：
//   GET  /surveys/:surveyId/questions   QuestionEntity[]（isArray: true）
//   POST /surveys/:surveyId/questions   QuestionEntity
//   PATCH / DELETE /questions/:id       QuestionEntity
//
// 對照 response.entity.ts：那邊三支端點回三種形狀，所以有三個 class。
// **判準是「回應的形狀」，不是「資料表」** —— 剛好一樣才共用。
//
// 下一站：src/questions/questions.service.ts（通過檢查之後誰來處理）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';
import { QuestionType } from '../../generated/prisma/enums';

export class QuestionEntity {
  @ApiProperty({
    description: '題目 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  id: string;

  @ApiProperty({
    description: '問卷 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  surveyId: string;

  @ApiProperty({
    description: '題目',
    example: '題目一',
  })
  title: string;

  @ApiProperty({
    description: '類型',
    enum: QuestionType,
    example: QuestionType.TEXT,
  })
  type: QuestionType;

  @ApiProperty({
    description: '題號',
    default: 0,
    type: Number,
  })
  order: number;

  @ApiProperty({
    description: '選項',
    type: [String],
  })
  options: string[];
}
