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

import {
  ApiTags,
  ApiCreatedResponse,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { Body, Controller, Post, Param, Get, Query } from '@nestjs/common';
import { CreateResponseDto } from './dto/create-response.dto';
import { FindResponsesQueryDto } from './dto/find-responses-query.dto';
import { ResponsesService } from './responses.service';
import {
  ResponseEntity,
  PaginatedResponsesEntity,
} from './entities/response.entity';
import { ErrorResponseEntity } from '../common/entities/error-response.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from 'src/auth/guards/jwt-auth.guard';
import { ApiAuthenticated } from '../auth/decorators/api-authenticated.decorator';

@ApiTags('responses')
@ApiAuthenticated()
@Controller('surveys/:surveyId/responses')
export class SurveyResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  // [教學] 狀態碼吃 @Post() 的預設值 201（產生了新資源），不必寫 @HttpCode。
  //
  // surveyId 來自**網址**、answers 來自 **body** —— 這個分工不是隨便定的：
  // 「要填哪一份問卷」是資源識別，屬於網址；「答了什麼」才是要寫進去的資料。
  // 把 surveyId 放進 body 的話，這條路由就不需要 :surveyId 了，
  // 而那等於讓外面決定答案要長在誰身上（同 create-question.dto.ts 結尾那段）。
  @ApiOperation({ summary: '送出填寫' })
  @ApiCreatedResponse({
    description: '送出後的作答（不含 answers）',
    type: ResponseEntity,
  })
  // ⚠️ 這一段 description 是**契約的一部分**，加規則就要跟著加 ——
  // 後兩項是 Ch17 輪 ④ 補的。前端讀不到「有哪些 400」的話，只能把每一種
  // 都當成同一句通用訊息（而這幾條是 service 丟的，回應裡沒有 fields）。
  @ApiBadRequestResponse({
    description:
      '請求內容不合法：欄位驗證失敗、題目 ID 重複、題目不屬於這份問卷、沒有答完全部題目、或單選題的答案不在選項裡',
    type: ErrorResponseEntity,
  })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiConflictResponse({ description: '問卷未發布', type: ErrorResponseEntity })
  @Post()
  create(
    @Param('surveyId') surveyId: string,
    @Body() createResponseDto: CreateResponseDto,
  ) {
    return this.responsesService.create(surveyId, createResponseDto);
  }

  // [教學] 這一支同時吃三個來源裡的兩個：@Param 取路徑、@Query 取 ? 後面。
  // 分頁的形狀跟 GET /surveys 完全一樣（見 find-responses-query.dto.ts）。
  @ApiOperation({ summary: '查詢所有填寫' })
  @ApiOkResponse({
    description: '作答列表（一頁，不含 answers）',
    type: PaginatedResponsesEntity,
  })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiForbiddenResponse({
    description: '無此權限',
    type: ErrorResponseEntity,
  })
  @Get()
  findAll(
    @Param('surveyId') surveyId: string,
    @Query() query: FindResponsesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.responsesService.findAll(surveyId, query, user);
  }
}
