import { Module } from '@nestjs/common';
import { ResponsesController } from './responses.controller';
import { SurveyResponsesController } from './survey-responses.controller';
import { ResponsesService } from './responses.service';
import { SurveysModule } from '../surveys/surveys.module';

@Module({
  controllers: [ResponsesController, SurveyResponsesController],
  providers: [ResponsesService],
  imports: [SurveysModule],
})
export class ResponsesModule {}
