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
