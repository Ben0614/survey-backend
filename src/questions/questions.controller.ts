// ============================================================
// [教學] questions.controller.ts —— 不掛在問卷底下的那兩支路由
//
// 什麼時候被執行：請求打到 /questions/:id 時。
//
// 這個檔案存在的理由只有一個：**一個 @Controller() 只能有一個前綴**，
// 而這兩支的前綴跟隔壁那個檔案不一樣，所以只能分家。
// 兩個 class 注入的是同一個 QuestionsService（見 questions.module.ts）。
//
// 下一站：src/questions/dto/create-question.dto.ts（body 進來之前先被誰檢查）
// ============================================================

import { Controller, Patch, Delete, Param, Body } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { UpdateQuestionDto } from './dto/update-question.dto';

// [教學] 為什麼改與刪是扁平的、不寫成 /surveys/:surveyId/questions/:id：
//
// question.id 是 cuid、**本來就唯一**，光憑它就找得到那一筆 ——
// 網址多帶一個 surveyId 不會多提供任何資訊，卻多了一個「兩者對不起來」的可能
// （/surveys/A/questions/屬於B的題目 該回什麼？）。
//
// 對照列表與建立：那兩支**沒有** id 可用，「哪一份問卷」是唯一的線索，所以非巢狀不可。
// 這個不對稱是刻意的：**父資源出現在網址裡，是因為少了它就講不完整，不是為了整齊。**
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(id, updateQuestionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }

  // [教學] 這裡**刻意沒有** @Get(':id')。
  //
  // service 有 findOne，寫一支 GET /questions/:id 是三行的事 —— 但它不在 Ch3 的範圍，
  // 也就沒有任何測試。一個對外開放、沒被驗證過的端點比沒有它更糟：
  // 前端會在你不知道的時候用上它，然後它壞掉時沒有人會先發現。
  //
  // 同 surveys.module.ts 當初「先不 exports」的理由：**不要預先開放。**
}
