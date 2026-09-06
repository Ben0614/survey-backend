// ============================================================
// [教學] survey-questions.controller.ts —— 掛在問卷底下的那兩支路由
//
// 什麼時候被執行：請求打到 /surveys/:surveyId/questions 時。
//
// controller 的職責與 @Param / @Body 的基本用法見 surveys.controller.ts 檔頭，
// 這裡只講新的東西：**巢狀路由**，也就是網址裡出現「父資源」的那一層。
//
// **Ch12 的分工在這個檔案裡看得最清楚**：同樣掛在 /surveys/:surveyId 底下，
//   POST（新增題目）—— 加了 @CurrentUser()，只有問卷的主人能加
//   GET （列出題目）—— **刻意不保護**，填答的人要看得到題目
// 「都在同一個 controller、都吃同一個 surveyId」不代表權限一樣。
//
// 下一站：src/questions/questions.controller.ts（同一個功能的另一半路由，形狀不一樣）
// ============================================================

import {
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionEntity } from './entities/question.entity';
import { ErrorResponseEntity } from '../common/entities/error-response.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from 'src/auth/guards/jwt-auth.guard';
import { ApiAuthenticated } from '../auth/decorators/api-authenticated.decorator';

// [教學] 前綴裡可以放**路徑參數**（:surveyId），不是只能放固定文字。
// 底下每一支路由都自動帶著這一段，@Param('surveyId') 照樣抓得到。
//
// 為什麼這兩支要巢狀：它們的語義**離不開父問卷**。
//   「列出題目」——列誰的題目？沒有問卷這句話不完整
//   「建立題目」——建在哪份問卷底下？同上
// 網址把這件事講明白了，就不必再靠 body 傳一個 surveyId 進來
// （那樣等於讓呼叫端自己決定題目要長在誰身上）。
//
// 改與刪為什麼**不**巢狀，見 questions.controller.ts 的檔頭 —— 那是刻意的不對稱。
@ApiTags('questions')
@ApiAuthenticated()
@Controller('surveys/:surveyId/questions')
export class SurveysQuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @ApiOperation({ summary: '查詢問卷所有題目' })
  @ApiOkResponse({
    description: '這份問卷的全部題目，依 order 由小到大',
    type: QuestionEntity,
    isArray: true,
  })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @Get()
  findAll(@Param('surveyId') surveyId: string, @CurrentUser() user: AuthUser) {
    // [教學] @Get() 是空的，實際網址是 GET /surveys/:surveyId/questions ——
    // 前綴已經寫掉全部路徑了。
    return this.questionsService.findAll(surveyId, user);
  }

  @ApiOperation({ summary: '建立題目' })
  @ApiCreatedResponse({ description: '新增後的題目', type: QuestionEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @ApiConflictResponse({
    description: '問卷已發布，無法新增題目',
    type: ErrorResponseEntity,
  })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiForbiddenResponse({
    description: '無此權限',
    type: ErrorResponseEntity,
  })
  @Post()
  create(
    // [教學] 第一次出現「兩個來源」的巢狀版本：
    //   surveyId 來自**網址** —— 要建在誰底下（父資源的識別）
    //   dto      來自 **body** —— 題目本身的內容
    //
    // 跟 surveys 的 PATCH 是同一個原則（識別屬於網址、內容屬於 body），
    // 只是這裡的識別指的是**父資源**而不是自己。
    @Param('surveyId') surveyId: string,
    @Body() createQuestionDto: CreateQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.questionsService.create(surveyId, createQuestionDto, user);
  }
}
