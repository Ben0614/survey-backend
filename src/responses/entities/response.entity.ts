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
    description: '問卷',
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
