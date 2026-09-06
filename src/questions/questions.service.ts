// ============================================================
// [教學] questions.service.ts —— 題目這邊真正碰資料庫的地方
//
// 什麼時候被執行：兩個 controller 收到請求後都呼叫它（同一個實例）。
//
// 跟 surveys.service.ts 的差別只有一個，但它是 Ch3 的主題：
// **題目是「子資源」，所以多了一層「父資源存不存在」要處理。**
// 那件事不歸這個 service 判斷 —— 它借 SurveysService 去問（見 findAll）。
//
// **Ch12 讓它多借了第二件事：擁有權。** 題目自己沒有 ownerId，
// 「這題是不是你的」要**追溯**到它所屬的問卷：
//   create  —— 手上就有 surveyId，assertExists 的回傳值直接用
//   update / remove —— 手上只有題目 id，但 findOne 早就 include 了 survey，
//                      所以 question.survey.ownerId 是免費的
// 三支都沒有為了授權多查一次 —— 那些查詢本來就在，只是以前沒人讀 ownerId。
//
// **順序：授權要在商業規則之前。** update / remove 先問 assertCanManage
// 再問 canEditQuestions，否則別人的「已發布」問卷會回 409 而不是 403 ——
// 那句「問卷已發布，無法修改題目」等於告訴一個不相干的人這份問卷的狀態。
//
// 下一站：src/responses/responses.module.ts（第三個 feature：作答，第一次寫入兩張表）
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ReplaceQuestionsDto } from './dto/replace-questions.dto';
import { canEditQuestions, canSeeSurvey } from '../surveys/survey.rules';
import type { AuthUser } from '../auth/guards/jwt-auth.guard';

@Injectable()
export class QuestionsService {
  // [教學] 這是第一個注入「別的 feature module 的 service」的地方。
  // PrismaService 不必 import 是因為 PrismaModule 是 @Global()；
  // SurveysService 要通，靠的是 SurveysModule 的 exports + 本 module 的 imports
  // 兩邊都做（見 questions.module.ts）。
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveysService: SurveysService,
  ) {}

  /** 列出一份問卷的所有題目，依 order 由小到大。父問卷不存在就是 404。 */
  async findAll(surveyId: string, user: AuthUser) {
    // [教學] 這行沒接回傳值，作用是**借 SurveysService 丟例外**
    // （同 surveys.service.ts 的 update，只是那裡借的是自己的 assertExists）。
    //
    // 少了它不會壞掉，但會壞在一個更難察覺的地方：問卷不存在時
    // findMany 找不到符合的列 → 回**空陣列** → 200 []。
    // 於是「這份問卷沒有題目」和「根本沒有這份問卷」變成同一個回應，
    // 前端沒有辦法分辨。子資源的列表**幾乎都要先確認父資源**，理由就是這個。
    const survey = await this.surveysService.assertExists(surveyId);

    // 看不到那份問卷 → 連它有沒有題目都不該知道（理由見 surveys.service.ts 的 findOne）。
    //
    // 這支用 canSeeSurvey 而不是 canManageSurvey 是刻意的：**能看就是能填**，
    // 而填答者需要看得到題目。用擁有權去擋的話，別人的已發布問卷就沒有人填得了
    // —— 那是「保護過頭」，而其他測試不會叫（見 responses.e2e-spec.ts 檔頭的同一條警告）。
    if (!canSeeSurvey(survey.status, survey.ownerId, user)) {
      throw new NotFoundException('問卷不存在');
    }

    return this.prisma.question.findMany({
      where: { surveyId },
      // orderBy 不能省 —— 表沒有固有順序（見 surveys.service.ts 的 findAll）。
      orderBy: { order: 'asc' },
    });
  }

  /** 查一題。目前沒有對應的端點，只被 update / remove 借去丟 404。 */
  async findOne(id: string) {
    // [教學] 這支方法**沒有任何 controller 呼叫它** —— 專案裡沒有 GET /questions/:id
    // （理由見 questions.controller.ts 結尾）。它存在純粹是因為下面兩支都需要
    // 「不存在就 404」這件事，抽出來就不必寫兩次。
    //
    // 「service 的方法不一定要對應到端點」是這裡值得帶走的一點：
    // service 是按**要做的事**切的，不是按路由切的。
    const question = await this.prisma.question.findUnique({
      where: { id },

      // [教學] include 第二次出場，而且方向反過來了：
      // surveys.service.ts 的 findOne 是「問卷帶題目」（一對多），這裡是「題目帶問卷」。
      //
      // 兩個方向都走得通，因為 schema.prisma 兩邊都宣告了關聯欄位
      // （Survey.questions 與 Question.survey），而它們靠的是同一根外鍵 Question.surveyId。
      //
      // 形狀不同：往下拿到的是 Question[]（0 到 N 筆，所以要 orderBy），
      // 往上拿到的是 Survey 而不是 Survey | null —— surveyId 在 schema 是 String 不是 String?，
      // 題目沒有「不屬於任何問卷」這個狀態，所以下面可以直接寫 question.survey.status。
      //
      // 為什麼是 include: { survey: true } 而不是 select 只挑 status：
      // 判準是**有沒有上界**，不是「有沒有多撈」。assertExists 之所以值得用 select，
      // 是因為它避開的是「一份問卷的所有題目」（500 題就 500 筆）；
      // 這裡多撈的是一筆問卷的幾個欄位，永遠是一筆。
      include: { survey: true },
    });

    if (!question) {
      throw new NotFoundException('題目不存在');
    }

    return question;
  }

  /** 在指定問卷底下新增一題，order 自動接在最後。 */
  async create(surveyId: string, dto: CreateQuestionDto, user: AuthUser) {
    // [教學] 這行跟 findAll 那行是同一個呼叫，差別只在**這次接了回傳值**。
    // assertExists 的 select 裡放 status 就是為了這一刻 —— 一次查詢同時滿足
    // 「問卷存不存在」（404）和「能不能改題目」（409）兩個問題。
    const survey = await this.surveysService.assertExists(surveyId);

    this.surveysService.assertCanManage(survey.status, survey.ownerId, user);
    // [教學] 規則本身寫在 survey.rules.ts，這裡只負責把 false 翻譯成 409。
    // 那個分工的好處在 survey.rules.spec.ts 看得最清楚：規則不認識 HTTP，
    // 所以測它不必啟動 Nest。
    //
    // 注意是 `!canEditQuestions(...)` —— 少一個驚嘆號，意思會變成
    // 「可以改就丟錯」，DRAFT 全被擋、PUBLISHED 反而放行。實際寫反過一次，
    // 是既有的 e2e（前提資料全是 DRAFT）把它抓出來的。
    if (!canEditQuestions(survey.status)) {
      throw new ConflictException('問卷已發布，無法新增題目');
    }

    // [教學] order 由伺服器算，不由前端給（理由見 create-question.dto.ts 結尾）。
    // count 回傳現有題數，剛好就是下一個 index：0 題 → 新的是 0，3 題 → 新的是 3。
    //
    // [教學] Ch5 把這兩句包進了 $transaction，但**這個洞沒有被補起來**，
    // 而且 Ch3 當時寫的「要根治得包成一個交易」那句話**是錯的**（Ch5 實測推翻）。
    //
    // 為什麼包了還是有洞：PostgreSQL 預設的隔離級別是 Read Committed，
    // 它保證的是「不會讀到別人還沒 commit 的資料」，
    // **不保證「我讀完之後沒人插隊」**：
    //
    //   請求 A：  BEGIN ── count 讀到 2 ──────────── INSERT order:2 ── COMMIT
    //   請求 B：       BEGIN ── count 讀到 2 ── INSERT order:2 ── COMMIT
    //
    // 兩題都拿到 order: 2，而且**整個過程沒有任何錯誤**。
    // 交易保證的是「這幾句要嘛全成功要嘛全失敗」，不是「我讀到的值不會過期」。
    //
    // **「讀一個值 → 用它算出要寫什麼 → 寫入」這個形狀，交易本身擋不住 race。**
    // 三條可行的路，這個專案三條都沒選：
    //   1. { isolationLevel: 'Serializable' } —— 資料庫偵測衝突，失敗方拿 P2034，
    //      但**必須配重試**，否則使用者拿到 500
    //   2. @@unique([surveyId, order]) —— 資料庫直接拒絕，同樣要配重試
    //   3. 把「讀 + 算」交給資料庫在同一句 SQL 裡做完
    //
    // **延後的理由（不是「沒問題」，是「代價還不值得」）**：題目只有在 DRAFT 時能加，
    // 那個階段通常只有作者一個人在編輯；而三條路都需要「重試」這個獨立主題。
    // 撞到時的症狀：兩題 order 相同 → 列表順序不確定 → **沒有任何錯誤日誌**。
    //
    // 那 $transaction 還留著做什麼？它讓這兩句跑在同一條連線上、中間不回到 Node，
    // 把窗口縮到最小 —— 縮小不等於消滅。完整說明見 docs/關聯式資料庫基礎.md 第 7 節。
    //
    // e2e 有一條「同時新增兩題時 order 不會重複」，本機是綠的 ——
    // **那只代表重現不出來，不代表修好了**（見 ch05 坑 #5）。

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.question.count({ where: { surveyId } });
      return tx.question.create({
        data: {
          // data 明確列欄位、不寫 data: dto，理由見 surveys.service.ts 的 create。
          title: dto.title,
          type: dto.type,
          options: dto.options,
          order,
          // surveyId 來自網址、不來自 body —— 外面不能決定題目要長在誰身上。
          surveyId,
        },
      });
    });
  }

  /** 更新一題。只有 dto 裡實際出現的欄位會被改動。 */
  async update(id: string, dto: UpdateQuestionDto, user: AuthUser) {
    // 借 findOne 丟 404。沒有這行的話 Prisma 會丟 P2025 ——
    // Ch6 之後這種情況有安全網接住、不再是 500，而是 filter 翻譯成的 404
    // （見 all-exceptions.filter.ts）。但兩者的 404 不是同一件事：
    // 這裡查一次就先擋掉，安全網只在漏掉這一行時才會被觸發。
    // 判準沒變（完整說明見 surveys.service.ts 的 update）：
    // 主要防線永遠是這一行，安全網只是它失守時的備援。
    const question = await this.findOne(id);

    this.surveysService.assertCanManage(
      question.survey.status,
      question.survey.ownerId,
      user,
    );

    // [教學] 這裡的 question.survey 就是上面 include 帶回來的東西。
    // 沒有它的話，這行得改成再呼叫一次 surveysService.assertExists(question.surveyId)
    // —— 多一次來回。這是 include 少見的**省事**用法（多數時候它是多撈）。
    if (!canEditQuestions(question.survey.status)) {
      throw new ConflictException('問卷已發布，無法修改題目');
    }

    return this.prisma.question.update({
      where: { id },
      // [教學] dto 的三個欄位都可能是 undefined，而 Prisma 對 undefined 的解讀是
      // 「不要動這個欄位」（不是「寫入空值」）。所以「空 body 什麼都不改」
      // 不需要任何 if 判斷 —— 這一點跟 PartialType 是**兩個各自獨立的機制**，
      // e2e 的「空 body 回 200 且不改動任何欄位」同時保護著它們。
      data: { title: dto.title, type: dto.type, options: dto.options },
    });
  }

  /** 刪除一題，回傳被刪掉的那一筆。 */
  async remove(id: string, user: AuthUser) {
    // 這一行就是當初選「先 findOne 再操作」而不是 catch P2025 的理由兌現：
    // 第二次要用的時候，原封不動搬過來就成立了。
    //
    // 這裡實際漏寫過一次，結果是 `id 不存在時回 404` 那條測試拿到 500 ——
    // 少了它不是「一樣 404、訊息不同」，是完全不同的狀態碼。
    // （Ch6 之後：現在漏掉這一行不會再是原始的 500，filter 的安全網會把
    // Prisma 丟出的 P2025 翻譯成 404。但這不代表這一行可以省 —— 少了它，
    // 「問卷已發布不能刪題目」那條商業規則檢查也一起消失，安全網只管錯誤格式，
    // 不管商業邏輯。）
    const question = await this.findOne(id);

    this.surveysService.assertCanManage(
      question.survey.status,
      question.survey.ownerId,
      user,
    );

    // 規則檢查跟 update 同一套（說明見上面那支）。
    if (!canEditQuestions(question.survey.status)) {
      throw new ConflictException('問卷已發布，無法刪除題目');
    }

    // 這一題底下的 Answer 會一起消失，但這裡沒有任何一行去刪它們 ——
    // 那是 schema.prisma 的 onDelete: Cascade 由 PostgreSQL 執行的（見 ch01 / ch02）。
    return this.prisma.question.delete({
      where: { id },
    });
  }

  /**
   * 整份取代一份問卷的題目，回傳取代後的完整清單（依 order）。
   *
   * 這一支是 Ch17 輪 ③ 加的，補的是「編輯」這一側的原子性 ——
   * 輪 ② 已經讓「建立」變成一次請求一個交易，編輯卻還要 1 + N 次呼叫
   * （改標題、改題、加題、刪題各一支），中途失敗就留下改到一半的問卷。
   *
   * **順序由陣列位置決定**，這也順便解掉「order 完全改不了」那個洞。
   */
  async replace(surveyId: string, dto: ReplaceQuestionsDto, user: AuthUser) {
    // 三道檢查與順序跟 create 完全一樣（理由見檔頭：看得到 → 能不能碰 → 現在能不能做）。
    // 它們在交易**之前**，這一點對這支特別重要：底下第一件事就是 deleteMany，
    // 檢查若排在交易裡面的刪除之後，403 / 409 照樣會回，但題目已經沒了。
    const survey = await this.surveysService.assertExists(surveyId);

    this.surveysService.assertCanManage(survey.status, survey.ownerId, user);

    if (!canEditQuestions(survey.status)) {
      throw new ConflictException('問卷已發布，無法編輯題目');
    }

    return this.prisma.$transaction(async (tx) => {
      // 這道保險**預期永遠不會觸發**，而那正是它存在的理由。
      //
      // 「全刪重建」之所以安全，靠的是三條各自訂下的規則湊出來的結論：
      //   canEditQuestions   只有 DRAFT 能改題目
      //   canSubmitResponse  只有 PUBLISHED 能被填答
      //   canUnpublish       有填答就不能撤回發布
      // → **DRAFT 的問卷不可能有答案**，所以刪掉題目不會連帶銷毀任何人的填答。
      //
      // 那是一個**推導**，不是一個保證。哪天有人放寬 canEditQuestions（例如
      // 「已發布也能改錯字」），這裡會安靜地把別人的答案 cascade 掉，
      // 而且沒有任何測試會紅。這三行把推導變成執行期的事實。
      //
      // 為什麼不寫進 survey.rules.ts（CLAUDE.md 說新規則都要進去）：
      // 那裡的規則回答「這件事現在能不能做」，而使用者**真的做得到**那件事，
      // 每一條都有對應的使用情境與單元測試。這一條回答的是
      // 「我推導出來的前提還成立嗎」，它沒有使用情境 —— 是斷言，不是規則。
      const responseCount = await tx.response.count({ where: { surveyId } });
      if (responseCount > 0) {
        throw new ConflictException('已經有人填答，無法整份取代題目');
      }

      // 舊題目全刪。它們底下的 Answer 會被 PostgreSQL 一起 cascade 掉
      //（見 schema.prisma），但上面那道保險已經確定了「沒有 Answer」。
      await tx.question.deleteMany({ where: { surveyId } });

      // [教學] createMany 是一句 SQL 插入 N 列，對照 for 迴圈裡呼叫 N 次 create。
      // 3 題看不出差別，50 題就是 50 次來回。
      //
      // order 用陣列的 index —— 這是這支跟 create 最大的差別：create 要
      // 「數現有幾題」才知道接在第幾號（而那個讀-算-寫的形狀有 race，見上面），
      // 整份取代則是**先刪光再重建**，index 就是最終答案，不必去讀任何東西。
      await tx.question.createMany({
        data: dto.questions.map((question, index) => ({
          title: question.title,
          type: question.type,
          options: question.options,
          order: index,
          // surveyId 來自網址、不來自 body —— 外面不能決定題目要長在誰身上。
          surveyId,
        })),
      });

      // ⚠️ **這一句不能省，也不能拿 createMany 的回傳值代替。**
      // createMany 回的是 `{ count: 3 }`，不是那三列資料。直接回傳它的話：
      // 狀態碼還是 200、@ApiOkResponse 照樣宣稱是 QuestionEntity[]（它只是文件，
      // 不驗證任何東西），而前端拿到 { count: 3 } 去 .map() 才炸 ——
      // 後端日誌一片乾淨。
      //
      // 前端也**必須**拿這份回傳值取代本地狀態：這些題目是刪掉重建的，
      // id 全部是新的，舊 id 一個都不能再用。那是整份取代的代價。
      return tx.question.findMany({
        where: { surveyId },
        orderBy: { order: 'asc' },
      });
    });
  }
}
