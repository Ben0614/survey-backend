import { Body, Controller, Post, Param, Get, Query } from '@nestjs/common';
import { CreateResponseDto } from './dto/create-response.dto';
import { FindResponsesQueryDto } from './dto/find-responses-query.dto';
import { ResponsesService } from './responses.service';

// [教學] @Controller('surveys') 是這個 class 所有路由的共同前綴。
// 下面的 @Get() 因此是 GET /surveys，不是 GET /。
@Controller('surveys/:surveyId/responses')
export class SurveyResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  create(
    @Param('surveyId') surveyId: string,
    @Body() createResponseDto: CreateResponseDto,
  ) {
    return this.responsesService.create(surveyId, createResponseDto);
  }

  @Get()
  findAll(
    @Param('surveyId') surveyId: string,
    @Query() query: FindResponsesQueryDto,
  ) {
    return this.responsesService.findAll(surveyId, query);
  }
}
