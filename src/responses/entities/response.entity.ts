// ============================================================
// [教學] response.entity.ts —— 同一張資料表，三支端點回三種形狀
//
// 什麼時候被執行：**執行期永遠不會**（理由見 survey.entity.ts 檔頭）。
//
// 這個檔案是「entity 對應的是一次回應的形狀，不是一張資料表」最清楚的例子：
//
//   POST /surveys/:surveyId/responses   ResponseEntity        create 沒有 include，不帶 answers
//   GET  /surveys/:surveyId/responses   ResponseEntity        列表刻意不帶 answers（見 service）
//   GET  /responses/:id                 ResponseDetailEntity  include answers，每筆再 include question
//
// 照著 schema.prisma 抄一份含 answers 的 entity 然後三支都標它，
// 症狀是前端看文件寫 res.answers.length，打 POST 之後拿到 undefined 直接 crash ——
// 文件說有那個欄位，實際上沒有。這條規則在 DTO 那一側已經講過一次
// （create-survey.dto.ts 檔頭：DTO 跟 Model 是兩件事，刻意不共用）。
//
// 下一站：src/responses/responses.service.ts（通過檢查之後誰來處理）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';
import { QuestionEntity } from '../../questions/entities/question.entity';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

export class ResponseEntity {
  @ApiProperty({
    description: '填寫 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  id: string;

  @ApiProperty({
    description: '問卷 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  surveyId: string;

  @ApiProperty({
    description: '建立時間',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;
}

export class AnswerEntity {
  @ApiProperty({
    description: '答案 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  id: string;

  @ApiProperty({
    description: '題目 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  questionId: string;

  @ApiProperty({
    description: '填寫 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  responseId: string;

  @ApiProperty({
    description: '內容',
    example: '回答內容',
  })
  content: string;

  @ApiProperty({
    description: '這則答案對應的題目（GET /responses/:id 會一併帶回）',
  })
  question: QuestionEntity;
}

// ResponseDetailEntity 用 extends 而不是重抄三個欄位：Response 之後多一個欄位時，
// 「只改了其中一份」在結構上不可能發生。同 UpdateSurveyDto 的 PartialType(CreateSurveyDto)。
export class ResponseDetailEntity extends ResponseEntity {
  // 只有 GET /responses/:id 帶 answers —— POST 與列表都不帶（見 responses.service.ts）。
  // 這就是為什麼這裡是兩個 class 而不是一個「Response 的 entity」。
  @ApiProperty({
    description: '回答',
    type: [AnswerEntity],
  })
  answers: AnswerEntity[];
}

export class PaginatedResponsesEntity {
  @ApiProperty({
    description: '回傳資料',
    type: [ResponseEntity],
  })
  data: ResponseEntity[];

  @ApiProperty({
    description: '統計資訊',
    type: PaginationMetaEntity,
  })
  meta: PaginationMetaEntity;
}
