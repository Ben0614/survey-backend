import {
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { QuestionType } from '../../generated/prisma/enums.js';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsArray()
  @IsString({ each: true })
  options: string[];
}
