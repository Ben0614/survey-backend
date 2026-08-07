// ============================================================
// [教學] surveys.controller.ts —— 路由、參數、狀態碼
//
// 什麼時候被執行：每次有請求打到 /surveys 開頭的網址。
//
// 它的職責只有「翻譯」：把 HTTP 的東西（網址、body、狀態碼）
// 翻成一次普通的方法呼叫，交給 service。**這裡不該出現任何 prisma。**
//
// 下一站：src/surveys/dto/create-survey.dto.ts（body 進來之前先被誰檢查）
// ============================================================

import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SurveysService } from './surveys.service';

// [教學] @Controller('surveys') 是這個 class 所有路由的共同前綴。
// 下面的 @Get() 因此是 GET /surveys，不是 GET /。
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Get()
  findAll() {
    // [教學] 直接回傳 Promise 就好，Nest 會自己 await 再序列化成 JSON。
    // 這裡不用寫 async/await —— 沒有要對結果做任何事。
    return this.surveysService.findAll();
  }

  // [教學] @Post() 的預設回應狀態碼是 **201 Created**（@Get() 是 200）。
  // 這是 Nest 內建的慣例，不必自己設；要改才需要 @HttpCode()。
  @Post()
  create(@Body() createSurveyDto: CreateSurveyDto) {
    // [教學] @Body() 把 request body 取出來塞進這個參數。
    //
    // 關鍵在那個型別註記 `: CreateSurveyDto` —— ValidationPipe 就是靠它
    // 知道該用哪一份規則來檢查。**型別寫錯或漏寫，驗證就靜靜地不生效**，
    // 跟 Ch0 依賴注入靠型別找零件是同一套機制（emitDecoratorMetadata）。
    return this.surveysService.create(createSurveyDto);
  }
}
