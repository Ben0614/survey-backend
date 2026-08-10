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

import { Body, Controller, Get, Post, Patch, Param } from '@nestjs/common';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
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

  // [教學] @Get() 括號裡放的是**路徑樣式**，不是一段固定文字。
  // 冒號開頭代表「這一段我不管內容是什麼，但取出來叫做 id」：
  //
  //   @Get()            → GET /surveys
  //   @Get('published') → GET /surveys/published（固定字串，一字不差）
  //   @Get(':id')       → GET /surveys/任何東西
  //
  // 路由是**依宣告順序**比對的。之後要加 @Get('published') 這類固定路徑時，
  // 必須放在 @Get(':id') **上面** —— 否則 /surveys/published 會先被 :id 吃掉，
  // 變成「查一份 id 是 published 的問卷」，然後回 404。
  @Get(':id')
  findOne(@Param('id') id: string) {
    // [教學] @Param('id') 從**網址**取值，對照 @Body() 從 request body 取值。
    // GET 依規範不帶 body，所以 id 只能放在網址裡 —— 這不是二選一的問題。
    // （另外兩個同類：@Query() 取 ?a=1 的部分，@Headers() 取標頭。）
    //
    // **關鍵：@Get(':id') 的 :id 和 @Param('id') 的 'id' 是靠這個字串對接的。**
    // 兩邊寫不一樣不會報錯，只會安靜地拿到 undefined，然後查不到東西。
    //
    // 還有一點 Ch4 才會有感：@Param() 拿到的**永遠是字串**，因為網址本來就是文字。
    // 這裡沒感覺是因為 id 本來就是 string（cuid）。
    return this.surveysService.findOne(id);
  }

  // [教學] @Post() 的預設回應狀態碼是 **201 Created**，
  // 其餘方法（@Get / @Patch / @Put / @Delete）**一律是 200 OK**。
  //
  // 這不是隨便定的：201 的語義是「產生了一個新資源」，只有 POST 符合。
  // 改既有資源、查詢、刪除都沒有「新資源」，所以是 200。
  //
  // 這是 Nest 內建的預設值，不必自己設；要覆蓋才需要 @HttpCode()。
  @Post()
  create(@Body() createSurveyDto: CreateSurveyDto) {
    // [教學] @Body() 把 request body 取出來塞進這個參數。
    //
    // 關鍵在那個型別註記 `: CreateSurveyDto` —— ValidationPipe 就是靠它
    // 知道該用哪一份規則來檢查。**型別寫錯或漏寫，驗證就靜靜地不生效**，
    // 跟 Ch0 依賴注入靠型別找零件是同一套機制（emitDecoratorMetadata）。
    return this.surveysService.create(createSurveyDto);
  }

  // [教學] 是 @Patch 不是 @Put。兩者都是「改」，差在語義：
  //   @Put   整份取代 —— 沒給的欄位視為要清空
  //   @Patch 部分更新 —— 沒給的欄位不動
  //
  // 必須跟 UpdateSurveyDto 的 PartialType 對齊：DTO 都說「每個欄位都可以不給」了，
  // 路由卻宣稱自己是整份取代，前端就會照著錯的語義來用這支 API。
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSurveyDto: UpdateSurveyDto) {
    // [教學] 這是第一個同時吃兩個來源的方法：
    //   id    來自**網址**（@Param）—— 「要改哪一筆」
    //   title 來自 **body**（@Body）—— 「要改成什麼」
    //
    // 把 id 塞進 body 是很常見的直覺錯誤（照著 create 的形狀想就會這樣）。
    // 那樣路由就不需要 :id，等於整支 API 沒有辦法指定對象，資源識別會整個錯位。
    return this.surveysService.update(id, updateSurveyDto);
  }
}
