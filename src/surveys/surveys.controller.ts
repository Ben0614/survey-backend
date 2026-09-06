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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { FindSurveysQueryDto } from './dto/find-surveys-query.dto';
import { FindOneSurveyQueryDto } from './dto/find-one-survey-query.dto';
import { SurveysService } from './surveys.service';
import { SurveyEntity, PaginatedSurveysEntity } from './entities/survey.entity';
import { ErrorResponseEntity } from '../common/entities/error-response.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/guards/jwt-auth.guard';
import { ApiAuthenticated } from '../auth/decorators/api-authenticated.decorator';

// [教學] @Controller('surveys') 是這個 class 所有路由的共同前綴。
// 下面的 @Get() 因此是 GET /surveys，不是 GET /。
//
// [教學] @ApiTags 純粹是分類（Ch7 加的）：/docs 上這個 class 的七支端點
// 會被收進一個叫 surveys 的摺疊區塊。不標的話全部散在最上層 default 裡。
// 它不影響任何行為，標在 class 上，底下每一支自動繼承。
@ApiTags('surveys')
@ApiAuthenticated()
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  // [教學] @Query() 是第三個取值來源，補齊了前兩個（Ch4 加的）：
  //
  //   @Param('id')  從**網址路徑**取     /surveys/abc123
  //   @Body()       從 **request body** 取
  //   @Query()      從 **? 後面**取      /surveys?page=2&pageSize=10
  //
  // **括號裡有沒有東西差別非常大**，而且寫錯不會有任何提示：
  //
  //   @Query('page') page: number          只取這一個 key，拿到一個 primitive
  //   @Query() query: FindSurveysQueryDto  整包接成 DTO
  //
  // 只有下面那種會被驗證。ValidationPipe 拿到參數時會先看它的型別，
  // String / Boolean / Number / Array / Object 這五個一律直接放行 ——
  // 因為**驗證規則是掛在 class 的屬性上的**，沒有 class 就沒有屬性，也就沒有規則可查。
  //
  // 所以 @Query('page') 那種寫法等於整份 DTO 沒被用到：驗證沒生效、
  // whitelist 沒生效、預設值也沒地方放。而 `page: number` 這個型別註記
  // 執行期並不存在，它擋不住任何東西（同 create-survey.dto.ts：只認裝飾器）。
  //
  // 對照下面的 create()：@Body() createSurveyDto: CreateSurveyDto 同樣是整包接、
  // 靠型別註記對接。兩者是同一套機制（emitDecoratorMetadata）。
  @ApiOperation({ summary: '查詢所有問卷' })
  @ApiOkResponse({
    description: '問卷列表（一頁）',
    type: PaginatedSurveysEntity,
  })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @Get()
  findAll(@Query() query: FindSurveysQueryDto, @CurrentUser() user: AuthUser) {
    // [教學] 直接回傳 Promise 就好，Nest 會自己 await 再序列化成 JSON。
    // 這裡不用寫 async/await —— 沒有要對結果做任何事。
    return this.surveysService.findAll(query, user);
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
  @ApiOperation({ summary: '查詢單一問卷' })
  @ApiOkResponse({
    description: '單一問卷（?includeQuestions=true 時含題目）',
    type: SurveyEntity,
  })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query() query: FindOneSurveyQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    // [教學] @Param('id') 從**網址**取值，對照 @Body() 從 request body 取值。
    // GET 依規範不帶 body，所以 id 只能放在網址裡 —— 這不是二選一的問題。
    // （另外兩個同類：@Query() 取 ?a=1 的部分，@Headers() 取標頭。）
    //
    // **關鍵：@Get(':id') 的 :id 和 @Param('id') 的 'id' 是靠這個字串對接的。**
    // 兩邊寫不一樣不會報錯，只會安靜地拿到 undefined，然後查不到東西。
    //
    // 還有一點：@Param() 拿到的**永遠是字串**，因為網址本來就是文字。
    // 這裡沒感覺是因為 id 本來就是 string（cuid）——
    // 但 ?page=2 進來也是字串 '2'，那就有感了（見 find-surveys-query.dto.ts 的 @Type）。
    //
    // [教學] 這是第一支**同時吃 @Param 和 @Query** 的方法（Ch4 ③ 加的）：
    //   id               來自路徑 —— 「哪一份問卷」
    //   includeQuestions 來自 ?   —— 「要不要連題目」
    // 對照 update()：那支是 @Param + @Body（「哪一筆」+「改成什麼」）。
    //
    // 判準是**那個資訊在描述什麼**：識別資源用路徑，調整回應內容用 query，
    // 要寫進去的資料用 body。
    //
    // 傳進 service 的是 query.includeQuestions 而不是整包 query，理由見 service 那邊。
    return this.surveysService.findOne(id, query.includeQuestions, user);
  }

  // [教學] @Post() 的預設回應狀態碼是 **201 Created**，
  // 其餘方法（@Get / @Patch / @Put / @Delete）**一律是 200 OK**。
  //
  // 這不是隨便定的：201 的語義是「產生了一個新資源」，只有 POST 符合。
  // 改既有資源、查詢、刪除都沒有「新資源」，所以是 200。
  //
  // 這是 Nest 內建的預設值，不必自己設；要覆蓋才需要 @HttpCode()。
  //
  // [教學] 這兩個裝飾器補的是輪 ① 量到的最後一塊空白：**回應**。
  //
  //   @ApiOperation        —— 這支端點在做什麼（/docs 上端點旁邊那行字）
  //   @ApiCreatedResponse  —— 「201 的時候回這個形狀」
  //
  // 為什麼是 Created 而不是 Ok：這兩個只是 @ApiResponse({ status: 201 })
  // 的別名，選對的那個，狀態碼就不必自己寫。@Post() 的預設是 201（見上面），
  // 所以這裡用 Created；其餘四支用 @ApiOkResponse。
  // **標錯的症狀**：文件上出現一個 200 的欄位、實際卻永遠回 201，
  // 前端寫 `if (res.status === 200)` 就永遠不成立。
  //
  // type 給的是 class 而不是型別 —— 理由見 survey.entity.ts 的檔頭。
  @ApiOperation({ summary: '建立問卷（一律是 DRAFT）' })
  @ApiCreatedResponse({ description: '建立成功', type: SurveyEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @Post()
  create(
    @Body() createSurveyDto: CreateSurveyDto,
    @CurrentUser() user: AuthUser,
  ) {
    // [教學] @Body() 把 request body 取出來塞進這個參數。
    //
    // 關鍵在那個型別註記 `: CreateSurveyDto` —— ValidationPipe 就是靠它
    // 知道該用哪一份規則來檢查。**型別寫錯或漏寫，驗證就靜靜地不生效**，
    // 跟 Ch0 依賴注入靠型別找零件是同一套機制（emitDecoratorMetadata）。
    return this.surveysService.create(createSurveyDto, user.id);
  }

  // [教學] 是 @Patch 不是 @Put。兩者都是「改」，差在語義：
  //   @Put   整份取代 —— 沒給的欄位視為要清空
  //   @Patch 部分更新 —— 沒給的欄位不動
  //
  // 必須跟 UpdateSurveyDto 的 PartialType 對齊：DTO 都說「每個欄位都可以不給」了，
  // 路由卻宣稱自己是整份取代，前端就會照著錯的語義來用這支 API。
  @ApiOperation({ summary: '編輯問卷' })
  @ApiOkResponse({ description: '更新後的問卷', type: SurveyEntity })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @ApiForbiddenResponse({
    description: '無此權限',
    type: ErrorResponseEntity,
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateSurveyDto: UpdateSurveyDto,
    @CurrentUser() user: AuthUser,
  ) {
    // [教學] 這是第一個同時吃兩個來源的方法：
    //   id    來自**網址**（@Param）—— 「要改哪一筆」
    //   title 來自 **body**（@Body）—— 「要改成什麼」
    //
    // 把 id 塞進 body 是很常見的直覺錯誤（照著 create 的形狀想就會這樣）。
    // 那樣路由就不需要 :id，等於整支 API 沒有辦法指定對象，資源識別會整個錯位。
    return this.surveysService.update(id, updateSurveyDto, user);
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
  // [教學] **這支的授權方式在 Ch17 輪 ② 換過一次，過程本身值得記。**
  //
  //   Ch11  @Roles(Role.ADMIN) —— 只有管理員能刪。當時的理由是「刪除不可逆」
  //   Ch17  拿掉那個裝飾器，改成擁有者或管理員（assertCanManage）＋ 有填答就 409
  //
  // 換掉的理由不是「Ch11 想錯了」，是**串接時才看得到的後果**：
  // 使用者建到一半失敗會留下半成品草稿，而他連刪掉自己那份垃圾的權限都沒有。
  // 「刪除很危險」是真的，但「危險」的對象是**別人的資料**，不是自己的草稿。
  //
  // 兩種授權的位置不一樣，這一點沒有變（Ch12 講過）：
  //   @Roles       角色 —— guard 看得到（token 裡就有），擋在 controller 之前
  //   擁有權       資料的歸屬 —— guard 看不到，要先查資料庫，所以判斷在 service
  // 這也是為什麼這裡現在需要 @CurrentUser()：判斷要往下傳。
  @ApiOperation({ summary: '刪除問卷（擁有者或管理員；已有填答則不能刪）' })
  @ApiOkResponse({ description: '刪除前的那一筆問卷', type: SurveyEntity })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiForbiddenResponse({
    description: '無此權限',
    type: ErrorResponseEntity,
  })
  @ApiConflictResponse({
    description: '問卷已被填寫，無法刪除',
    type: ErrorResponseEntity,
  })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // [教學] 只吃網址、不吃 body —— DELETE 依規範不帶 body，
    // 「要刪哪一筆」是它唯一需要知道的事，而那個資訊在網址裡。
    return this.surveysService.remove(id, user);
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
  @ApiOperation({ summary: '公開問卷（至少要有一題）' })
  @ApiOkResponse({ description: '發布後的問卷', type: SurveyEntity })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiForbiddenResponse({
    description: '無此權限',
    type: ErrorResponseEntity,
  })
  @ApiConflictResponse({
    description: '問卷沒有任何題目',
    type: ErrorResponseEntity,
  })
  @Patch(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.surveysService.publish(id, user);
  }

  @ApiOperation({ summary: '不公開問卷' })
  @ApiOkResponse({ description: '撤回後的問卷', type: SurveyEntity })
  @ApiNotFoundResponse({ description: '問卷不存在', type: ErrorResponseEntity })
  @ApiConflictResponse({ description: '已有人填答', type: ErrorResponseEntity })
  @ApiForbiddenResponse({
    description: '無此權限',
    type: ErrorResponseEntity,
  })
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.surveysService.unpublish(id, user);
  }
}
