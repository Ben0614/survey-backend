// ============================================================
// [教學] responses.controller.ts —— 不掛在問卷底下的那一支路由
//
// 什麼時候被執行：請求打到 /responses/:id 時。
//
// 為什麼查單筆作答是扁平的、不寫成 /surveys/:surveyId/responses/:id：
// 理由跟 questions.controller.ts 那段一模一樣 —— 作答 id 本身就唯一，
// 網址裡再放一個 surveyId 只會製造出「兩個參數互相矛盾」的可能
// （/surveys/A/responses/屬於B的作答 該回什麼？404？403？）。
// **不要在網址裡放兩份可能對不起來的資訊。**
//
// 下一站：src/responses/dto/create-response.dto.ts（提交的 body 進來之前先被誰檢查）
// ============================================================
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Controller, Get, Param } from '@nestjs/common';
import { ResponsesService } from './responses.service';
import { ResponseDetailEntity } from './entities/response.entity';
import { ErrorResponseEntity } from '../common/entities/error-response.entity';

// [教學] 前綴只寫 'responses'，`:id` 放在 @Get() 裡。
//
// 寫成 @Controller('responses/:id') + @Get() 也能動，路由一樣是 /responses/:id，
// 但那樣**這個 class 之後每一條路由都會繼承那個 :id** ——
// 哪天要加 GET /responses（列表）就卡住了。
// **前綴放「這組路由共同的部分」，變動的部分放在方法上。**
@ApiTags('responses')
@Controller('responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @ApiOperation({ summary: '查詢填寫' })
  @ApiOkResponse({ type: ResponseDetailEntity })
  @ApiNotFoundResponse({ description: '填寫不存在', type: ErrorResponseEntity })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.responsesService.findOne(id);
  }
}
