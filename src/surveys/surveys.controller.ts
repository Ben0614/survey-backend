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

import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
} from '@nestjs/common';
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

  // [教學] 狀態碼在這一支第一次是「可以選的」——前面四支都直接吃預設值。
  //
  //   200 OK          回傳被刪掉的那筆資料（@Delete 的預設值）
  //   204 No Content  成功但完全沒有 body，要寫 @HttpCode(204) 覆蓋
  //
  // 兩種都常見。這裡選 200：prisma.delete() 本來就回傳那筆資料，
  // 不給白不給（前端可以顯示「已刪除《員工滿意度調查》」），E2E 也好斷言。
  //
  // 但要記得那個 body 是**刪除前的快照** —— 它有內容，不代表資料還在。
  // 所以 e2e 除了看 body，還要再查一次資料庫確認真的沒了。
  @Delete(':id')
  remove(@Param('id') id: string) {
    // [教學] 只吃網址、不吃 body —— DELETE 依規範不帶 body，
    // 「要刪哪一筆」是它唯一需要知道的事，而那個資訊在網址裡。
    return this.surveysService.remove(id);
  }

  // [教學] 這兩支是**動作型端點**：網址表達的不是「哪一個資源」，而是「對它做什麼」。
  //
  // 另一種做法是把 status 加進 UpdateSurveyDto，讓前端送 PATCH { status: 'PUBLISHED' }。
  // 沒有選它的理由：發布不只是改一個欄位，它還帶著「撤回時要檢查有沒有人填答」
  // 這種規則。混進 update 之後，那支方法就得依 dto 裡有沒有 status 分岔判斷，
  // 而網址完全看不出來這件事會發生。create-survey.dto.ts 的註解早就寫了
  // 「發布是一個獨立的動作而不是建立時的參數」—— 這裡是它的兌現。
  //
  // 上面 @Get(':id') 那段講過「路由依宣告順序比對」，那這兩支放在 @Patch(':id')
  // 下面會不會被吃掉？**不會。** :id 是一段路徑，:id/publish 是兩段，
  // 段數不同就不可能撞上 —— 順序問題只發生在**同樣段數**的路由之間。
  //
  // 兩支都沒有 @Body()，所以也不需要 DTO：要做什麼已經寫在網址裡了。
  // 網址也要注意大小寫 —— /unpublish 和 /unPublish 是兩條不同的路由。
  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.surveysService.publish(id);
  }

  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.surveysService.unpublish(id);
  }
}
