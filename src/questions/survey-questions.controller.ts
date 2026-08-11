import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';

@Controller('surveys/:surveyId/questions')
export class SurveysQuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  findAll(@Param('surveyId') surveyId: string) {
    return this.questionsService.findAll(surveyId);
  }

  @Post()
  create(
    @Param('surveyId') surveyId: string,
    @Body() createQuestionDto: CreateQuestionDto,
  ) {
    return this.questionsService.create(surveyId, createQuestionDto);
  }
}
