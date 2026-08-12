import { Module } from '@nestjs/common';
import { SurveysQuestionsController } from './survey-questions.controller';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { SurveysModule } from '../surveys/surveys.module';

@Module({
  controllers: [SurveysQuestionsController, QuestionsController],
  providers: [QuestionsService],
  imports: [SurveysModule],
})
export class QuestionsModule {}
