// ============================================================
// [教學] survey-responses.controller.ts —— 掛在問卷底下的那兩支路由
//
// 什麼時候被執行：請求打到 /surveys/:surveyId/responses 時。
//
// 為什麼作答要拆成兩個 controller（跟 questions 同一套判準）：
//   **需要知道「是哪一份問卷」的操作** → 巢狀路由，放這裡
//     POST   /surveys/:surveyId/responses   提交（要知道填的是哪份）
//     GET    /surveys/:surveyId/responses   列表（要知道看哪份的）
//   **已經知道自己 id 的操作** → 扁平路由，放 responses.controller.ts
//     GET    /responses/:id
//
// 下一站：src/responses/responses.controller.ts（另一半路由，形狀不一樣）
// ============================================================

import { Body, Controller, Post, Param, Get, Query } from '@nestjs/common';
import { CreateResponseDto } from './dto/create-response.dto';
import { FindResponsesQueryDto } from './dto/find-responses-query.dto';
import { ResponsesService } from './responses.service';

@Controller('surveys/:surveyId/responses')
export class SurveyResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  // [教學] 狀態碼吃 @Post() 的預設值 201（產生了新資源），不必寫 @HttpCode。
  //
  // surveyId 來自**網址**、answers 來自 **body** —— 這個分工不是隨便定的：
  // 「要填哪一份問卷」是資源識別，屬於網址；「答了什麼」才是要寫進去的資料。
  // 把 surveyId 放進 body 的話，這條路由就不需要 :surveyId 了，
  // 而那等於讓外面決定答案要長在誰身上（同 create-question.dto.ts 結尾那段）。
  @Post()
  create(
    @Param('surveyId') surveyId: string,
    @Body() createResponseDto: CreateResponseDto,
  ) {
    return this.responsesService.create(surveyId, createResponseDto);
  }

  // [教學] 這一支同時吃三個來源裡的兩個：@Param 取路徑、@Query 取 ? 後面。
  // 分頁的形狀跟 GET /surveys 完全一樣（見 find-responses-query.dto.ts）。
  @Get()
  findAll(
    @Param('surveyId') surveyId: string,
    @Query() query: FindResponsesQueryDto,
  ) {
    return this.responsesService.findAll(surveyId, query);
  }
}
