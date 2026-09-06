// ============================================================
// [教學] responses.service.ts —— 作答這邊真正碰資料庫的地方
//
// 什麼時候被執行：兩個 controller 收到請求後都呼叫它（同一個實例）。
//
// 這支 service 是全專案第一個**同時寫入兩張表**的地方，也是三條商業規則裡
// 最後一條（只有 PUBLISHED 能被填答）真正生效的地方。
//
// 跟 questions.service.ts 的差別：那邊的子資源只有一層（題目掛在問卷底下），
// 這邊是兩層（答案掛在作答底下、作答掛在問卷底下），
// 而且 Answer 還額外指向 Question —— 所以「答案合不合法」不是外鍵管得完的事。
//
// **Ch12 加了擁有權檢查，但只加在「看結果」那兩支**：
//   findAll / findOne —— 別人問卷的填答結果不該給你看
//   create（填答）  —— **刻意不保護**。任何登入的人都能填任何已發布的問卷，
//                       那就是這個產品的用途。保護它等於讓問卷沒有人能填。
// 這一輪的風險有一半是「保護過頭」，不是保護不足 ——
// e2e 因此有一條「任何人都能填別人的問卷 → 201」當反面對照。
//
// findOne 為了授權多撈了 survey.ownerId，**但回傳前要剔除**：
// 它撈回來的那個物件就是 API 的回應本身（對照 questions 的 update／remove，
// 那兩支回的是另一次查詢的結果，include 不會漏出去）。
// 忘了剔除的話回應會多一個 survey 欄位，而 ResponseEntity 沒有一致性測試 ——
// 所以 Ch12 順手補了一條「回應不含 survey 欄位」來守它。
//
// 下一站：src/responses/responses.rules.ts（作答自己的兩條規則，Ch17 輪 ④ 加的）
// ============================================================

import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { canSubmitResponse } from '../surveys/survey.rules';
import { isCompleteAnswerSet, isValidAnswer } from './responses.rules';
import { CreateResponseDto } from './dto/create-response.dto';
import { FindResponsesQueryDto } from './dto/find-responses-query.dto';
import type { AuthUser } from '../auth/guards/jwt-auth.guard';
import { QuestionType } from '../generated/prisma/enums';

/**
 * 簡答題的摘要最多回幾筆原文。
 *
 * 抽出成常數是為了讓「這是抽樣不是全部」這件事在程式碼裡看得見 ——
 * 寫死一個 5 在 take 裡，讀的人不會知道那是產品決定還是隨手打的。
 */
const TEXT_SAMPLE_LIMIT = 5;

@Injectable()
export class ResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveysService: SurveysService,
  ) {}

  /** 提交一份作答：一筆 Response 加 N 筆 Answer，一次寫進去。 */
  async create(surveyId: string, dto: CreateResponseDto) {
    // [教學] 這行**接了回傳值**（對照 findAll 那行沒接）。
    // assertExists 的 select 裡放 status 就是為了這一刻 —— 一次查詢同時滿足
    // 「問卷存不存在」（404）和「能不能填答」（409）兩個問題。
    // 這是那個 select 的第三次兌現（前兩次在 questions.service.ts）。
    const survey = await this.surveysService.assertExists(surveyId);

    // [教學] 規則本身寫在 survey.rules.ts，這裡只負責把 false 翻譯成 409。
    // 選 409 而不是 403 / 400 的理由同 unpublish：
    // 請求本身完全合法，是**跟資源目前的狀態衝突**。
    const canSubmit = canSubmitResponse(survey.status);
    if (!canSubmit) {
      throw new ConflictException('問卷未發布，無法填寫');
    }

    // [教學] 以下兩段檢查是這一章最該帶走的東西：
    // **它們是 DTO 永遠做不到的事。**
    //
    // DTO 只看得到「這個請求本身」，而「這個 questionId 屬不屬於這份問卷」
    // 得查資料庫才知道 —— 跨表的檢查一律是 service 的工作。
    const questionIds = dto.answers.map((item) => item.questionId);

    // [教學] 先擋重複，再查歸屬，**順序不能反過來**。
    //
    // 反過來的話：送兩次同一個合法 id → questionIds.length 是 2、
    // 下面的 count 回 1（IN 不會因為你問兩次就回兩筆）→ 數量對不上 → 回 400。
    // **行為是對的，但訊息會說「有題目不屬於這份問卷」** ——
    // 照著那個訊息去查會查錯方向。先擋重複，每個 400 才說得出真正的原因。
    //
    // 為什麼不交給資料庫擋：schema 有 @@unique([responseId, questionId])，
    // 但那會讓 Prisma 丟 P2002。Ch6 之後 filter 認得這個碼、會翻成 409 ——
    // 不再是原始的 500，**但這裡的判準沒有變**：409（CONFLICT）跟這裡要回的
    // 400（BAD_REQUEST，見上面「行為是對的，但訊息會說錯方向」那段）
    // 是兩種不同的語義，讓資料庫擋只會拿到錯的狀態碼跟一句英文的約束名。
    // 判準同 Ch2「先 assertExists 再操作，而不是 catch P2025」：
    // **能在自己這一層先擋掉的，就不要讓資料庫的錯誤碼冒上來 ——
    // 即使現在冒上來也有安全網接住，那也是安全網、不是替代方案。**
    const hasDuplicates = new Set(questionIds).size !== questionIds.length;
    if (hasDuplicates) {
      throw new BadRequestException('有重複的題目ID');
    }

    // [教學] 要問資料庫的問題不是「這些題目存在嗎」，而是
    // **「這份問卷有哪些題目？」** —— 拿到那份清單之後，底下三件事都從它推出來。
    //
    // 為什麼非查不可：外鍵只保證「這個 questionId 在 Question 表裡找得到」，
    // **不保證它屬於這份問卷**。不查的話可以把 A 問卷的題目掛到 B 問卷的作答上，
    // 而外鍵、@@unique 全都沒被違反 —— 資料庫一聲都不吭。
    // 這是 Ch1 那句「唯一約束的作用範圍由它所在的表決定」的同族問題：
    // **約束只知道自己那張表的事**，「兩根外鍵的爸爸是不是同一個」超出它的視野。
    //
    // ⚠️ **Ch17 輪 ④ 把這裡從 count 換成 findMany，而且 where 也變了。** 兩個都要改：
    //
    //   舊：count({ where: { surveyId, id: { in: questionIds } } })
    //       只回一個數字，而且只看「送來的那幾題」
    //   新：findMany({ where: { surveyId } })
    //       回這份問卷的**全部**題目，含 type / options / order
    //
    // 兩個改動各有各的理由，缺一個就做不到這一輪要的事：
    //   where 不能再帶 id: { in: ... } —— 那樣「少答一題」永遠查不出來，
    //                                     沒送的那一題本來就不在 IN 裡面
    //   不能再用 count           —— 「答案在不在選項裡」要知道 type 與 options，
    //                               數字給不了
    //
    // 這算「多撈」嗎？對照 assertExists 用 select 的判準是**有沒有上界**：
    // 這裡的上界是一份問卷的題數，而我們本來就得認識每一題才判斷得出「答完了沒」。
    // 而且**查詢次數沒有增加** —— 原本那一次 count 被換掉了，不是多加一次。
    const questions = await this.prisma.question.findMany({
      where: { surveyId },
      // select 只挑用得到的四個欄位：title 這種拿來顯示的東西這裡不需要。
      select: { id: true, type: true, options: true, order: true },
    });

    // 用 Map 而不是每次 questions.find(...)：N 個答案 × M 題會變成 N×M 次比對，
    // 而且**更重要的是下面兩個檢查因此共用同一份資料**（見接下來那段）。
    const questionById = new Map(questions.map((q) => [q.id, q]));

    // [教學] 這裡有兩個檢查，而且**看起來重疊、其實防的是不同的東西**：
    //
    //   A. 送來的題目，都屬於這份問卷嗎？
    //   B. 這份問卷的題目，都答了嗎？（Ch17 輪 ④ 新增）
    //
    // 很容易覺得「B 成立就代表 A 成立」然後把 A 刪掉。**不成立。**
    // 一份 3 題的問卷，送三個**別人問卷的題目 id**：
    //   B 檢查 → 答案 3 筆、本問卷 3 題，通過
    //   外鍵   → 那三個 questionId 真的存在（在別人的問卷裡），資料庫也不擋
    //   結果   → 一筆作答掛在 A 問卷底下，答案卻指向 B 問卷的題目
    // **201 Created，沒有任何錯誤**，要到看結果時才發現有一批答案對不上任何題目。
    //
    // 反過來刪掉 B 也不行 —— 那就退回「只答一題就能送出」。
    //
    // 對策是結構性的：兩個檢查都從上面那個 Map 推出來，
    // A 是「每個答案都查得到」、B 是「題數等於答案數」，同一個來源，
    // 就不會有人以為可以只留一個。
    //
    // 而且 A 加上「先擋重複」（上一段）之後，B 才等於「一題一個答案」——
    // 三個檢查是一組，這也是 responses.rules.ts 裡 isCompleteAnswerSet
    // 的註解說「成立的前提在呼叫端」的意思。
    for (const answer of dto.answers) {
      const question = questionById.get(answer.questionId);

      // 回 400 而不是 404（那些題目確實存在）也不是 409（不是狀態衝突）——
      // 是**請求內容本身有錯**。
      if (!question) {
        throw new BadRequestException('有題目不屬於這份問卷');
      }

      // 訊息帶上題號：這兩條 400 是 **service 丟的，不是 ValidationPipe 丟的**，
      // 所以回應**沒有 fields**（那是 Ch15 攤平巢狀驗證錯誤時產的），
      // 前端標不到那一格、只拿得到一句話。訊息裡沒有題號就等於沒有線索。
      if (!isValidAnswer(question.type, question.options, answer.content)) {
        throw new BadRequestException(
          `第 ${question.order + 1} 題的答案不在選項裡`,
        );
      }
    }

    if (!isCompleteAnswerSet(questions.length, dto.answers.length)) {
      throw new BadRequestException(
        `這份問卷有 ${questions.length} 題，必須全部作答`,
      );
    }

    // [教學] 巢狀 write：一次呼叫寫兩張表。
    //
    // answers 底下那個 create 是**動作**，不是欄位（見 docs/Prisma速查.md）——
    // Prisma 需要知道「這些關聯資料要新建、還是接上既有的」，所以動詞要寫出來。
    //
    // 陣列裡**不用寫 responseId**：它巢狀在 response.create 底下，
    // Prisma 自己會把剛產生的那筆 Response 的 id 填進去 ——
    // 而那個 id 是 @default(cuid()) 產生的，**送出 SQL 之前連我們都還不知道**。
    //
    // **這裡不需要 $transaction，因為巢狀 write 本身就是一個交易。**
    // 實測 log（ch05 的「SQL 觀察」）：
    //   INSERT INTO "Response" ... RETURNING id
    //   INSERT INTO "Answer" ... VALUES ($1..$4), ($5..$8)   ← N 筆批次成一句
    //   SELECT "Response".* WHERE id = $1
    //   COMMIT                                                ← 證據在這
    // 所以「Response 寫進去了但 Answer 失敗」不可能發生。
    //
    // 判準：**需要自己包 $transaction 的是「讀 → 程式判斷／計算 → 寫」那種形狀**，
    // 因為中間隔著一段回到 Node 的空檔。這裡從頭到尾是一句呼叫，沒有那個空檔。
    // （而且就算包了交易，那種形狀的 race 也擋不住 —— 見 questions.service.ts 的 order。）
    //
    // map 明確列出兩個欄位、不寫 create: dto.answers，理由同 Ch2 的
    // data: { title: dto.title } —— 兩道防線，而且之後 AnswerDto 多欄位時
    // 這裡會逼你想一次「這個該不該進資料庫」。
    return this.prisma.response.create({
      data: {
        surveyId,
        answers: {
          create: dto.answers.map((item) => ({
            questionId: item.questionId,
            content: item.content,
          })),
        },
      },
    });
  }

  /** 列出一份問卷的所有作答，一次一頁。回的是 { data, meta }。 */
  async findAll(
    surveyId: string,
    query: FindResponsesQueryDto,
    user: AuthUser,
  ) {
    // [教學] 這行沒接回傳值，作用是**借 SurveysService 丟 404**（同 questions.service.ts）。
    //
    // 少了它不會壞掉，但會壞在一個很難察覺的地方：問卷不存在時 findMany
    // 找不到符合的列 → 回 200 配 { data: [], meta: { total: 0, totalPages: 0 } }。
    // 於是「這份問卷還沒有人填」和「根本沒有這份問卷」變成**完全一樣的回應**。
    //
    // 而且它比 Ch3 那次更隱蔽：那邊回的是裸的空陣列 []，比較容易讓人起疑；
    // 這裡回的是一個 meta 四個欄位齊全的合法 JSON，**看起來非常正常**。
    const survey = await this.surveysService.assertExists(surveyId);

    this.surveysService.assertCanManage(survey.status, survey.ownerId, user);

    // 分頁的換算與 { data, meta } 的形狀完全照 surveys.service.ts 的 findAll，
    // 那邊的註解不重複。where 抽成變數的理由也一樣：讓 findMany 與 count
    // **在結構上不可能不一致**（這裡只有一個條件，但習慣要一致）。
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    const where = {
      surveyId,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.response.findMany({
        where,
        // [教學] 列表**刻意不帶 answers**：100 份作答 × 每份 20 題 = 2000 筆答案
        // 塞進一個回應。要細節就打 GET /responses/:id ——
        // 這是 Ch4 ③「回傳形狀由呼叫端決定」的第二次應用。
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.response.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,

        // [教學] Math.ceil 是無條件進位，不是四捨五入（完整理由見 surveys.service.ts）。
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** 查一份作答，連同每一題的答案與題目本身。找不到就是 404。 */
  async findOne(id: string, user: AuthUser) {
    // [教學] include 走了**兩步**，這是專案裡最深的一次：
    //
    //   Response → answers   往下，一對多 → 拿到陣列（所以要 orderBy）
    //   Answer   → question  往上，多對一 → 拿到單一物件，而且不會是 null
    //                        （questionId 在 schema 是 String 不是 String?）
    //
    // 為什麼要帶 question：不帶的話前端拿到的是一堆 questionId + content，
    // 畫不出「題目：答案」的畫面，只能對每一筆再打一次 API ——
    // **這一層是在避免前端的 N+1。**
    //
    // [教學] orderBy 依的是**關聯表的欄位**（Answer 自己沒有 order 欄位）。
    // 這是少數 Prisma 真的會產生 JOIN 的場合 —— 排序必須在同一句 SQL 裡完成，
    // 沒辦法像 include 那樣分兩句做。
    //
    // 方向是 asc，跟 GET /surveys/:id?includeQuestions=true 一致。
    // 用 desc 的話同一批題目在兩支 API 裡順序相反，前端會很困惑。
    const response = await this.prisma.response.findUnique({
      where: { id },
      include: {
        survey: {
          select: {
            ownerId: true,
            status: true,
          },
        },
        answers: {
          include: { question: true },
          orderBy: {
            question: {
              order: 'asc',
            },
          },
        },
      },
    });

    // [教學] findUnique 找不到時回 null 而不丟錯 —— 要不要把它當成錯誤是**這一層**決定的。
    // 直接 return null 會變成 200 配一個空 body，而「查得到但內容是空的」
    // 和「這東西不存在」是兩件事（完整理由見 surveys.service.ts 的 findOne）。
    if (!response) {
      throw new NotFoundException('作答不存在');
    }

    const { survey, ...rest } = response;

    this.surveysService.assertCanManage(survey.status, survey.ownerId, user);

    return rest;
  }

  /**
   * 一份問卷的填答摘要：每題的分佈（單選）或最近幾筆原文（簡答）。
   *
   * **這一支刻意不分頁。** 分頁是為了「不給你全部」而設計的，統計卻需要全部 ——
   * 這就是 Ch17 輪 ⑤ 對「Ch4 定的分頁參數好不好用」的回答：
   * 對「逐筆瀏覽」很好用，對「統計」完全不能用。
   *
   * 不分頁不等於把全部資料搬回來：底下的 groupBy 是一句 SQL，
   * **回傳量只跟「有幾題、幾種不同的答案」有關，跟填答數無關**。
   * 3000 份填答與 30 份填答，回來的東西一樣大。
   */
  async summarize(surveyId: string, user: AuthUser) {
    // 授權跟 findAll 一模一樣：結果只有擁有者與 ADMIN 看得到。
    const survey = await this.surveysService.assertExists(surveyId);
    this.surveysService.assertCanManage(survey.status, survey.ownerId, user);

    const [questions, responseCount, grouped] = await Promise.all([
      this.prisma.question.findMany({
        where: { surveyId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          type: true,
          options: true,
          order: true,
        },
      }),

      this.prisma.response.count({ where: { surveyId } }),

      // [教學] groupBy 就是 SQL 的 GROUP BY：
      //   by      要用哪幾個欄位分組（這裡是「哪一題 × 什麼答案」）
      //   _count  每一組各有幾筆
      //
      // **Answer 表沒有 surveyId**（去看 schema.prisma，它只有 questionId 與
      // responseId），所以要靠關聯往上過濾。兩條路都通：
      //   { question: { surveyId } }  經由題目
      //   { response: { surveyId } }  經由那份填答
      // 選前者，因為底下組裝時本來就以「這份問卷的題目」為基準 ——
      // 兩邊用同一個判準，就不會出現「groupBy 撈到了但組裝時找不到對應題目」的資料。
      this.prisma.answer.groupBy({
        by: ['questionId', 'content'],
        where: { question: { surveyId } },
        _count: { _all: true },
      }),
    ]);

    // questionId → (答案內容 → 幾筆)
    const countsByQuestion = new Map<string, Map<string, number>>();
    for (const row of grouped) {
      const byContent =
        countsByQuestion.get(row.questionId) ?? new Map<string, number>();
      byContent.set(row.content, row._count._all);
      countsByQuestion.set(row.questionId, byContent);
    }

    // [教學] 簡答題的樣本 —— 這是 N+1，而且**這一次是可以接受的**。
    //
    // 判準不是「有沒有 N+1」，是 **N 有沒有上界**：
    //   Ch17 輪 ①  N = 這一頁的問卷數 → 使用者改 pageSize 就能拉大，沒有上界
    //   這裡        N = 這份問卷的簡答題數 → 由問卷本身決定，而且只算簡答題
    //
    // Answer 表沒有 createdAt，所以「最近」要從關聯的那一端排序
    //（orderBy: { response: { createdAt: 'desc' } }）。
    const textQuestions = questions.filter((q) => q.type === QuestionType.TEXT);
    const samplesByQuestion = new Map(
      await Promise.all(
        textQuestions.map(async (question) => {
          const rows = await this.prisma.answer.findMany({
            where: { questionId: question.id },
            orderBy: { response: { createdAt: 'desc' } },
            take: TEXT_SAMPLE_LIMIT,
            select: { content: true },
          });

          return [question.id, rows.map((row) => row.content)] as [
            string,
            string[],
          ];
        }),
      ),
    );

    return {
      surveyId,
      responseCount,

      // ⚠️ **以 questions 為基準跑迴圈，不是以 groupBy 的結果為基準。**
      //
      // groupBy **只回出現過的值**。一個「滿意／普通／不滿意」的題目，如果沒有人
      // 選「不滿意」，那一組根本不會出現在結果裡 —— 以 grouped 為基準的話，
      // 畫面上就只有兩條長條，而使用者會理解成「這題只有兩個選項」。
      // 沒有錯誤、沒有 0、百分比還會算對（18/27、9/27），完全看不出來。
      //
      // 這個方向也順便處理了另一個極端：一份填答都沒有時 grouped 是空陣列，
      // 以它為基準會回一個「沒有任何題目」的摘要，而正確答案是
      // 「每一題都在，每個選項都是 0」。
      questions: questions.map((question) => {
        const byContent =
          countsByQuestion.get(question.id) ?? new Map<string, number>();

        // answerCount 用 groupBy 的**總和**而不是 options 的總和：
        // 前者是「這一題實際收到幾筆答案」，包含 Ch17 輪 ④ 之前存進去的、
        // 不在 options 裡的髒答案。那些答案不會出現在下面的 options 裡
        //（以 options 為基準就是會丟掉它們），所以兩個總和可能對不上 ——
        // 那是刻意的，而且分母該用 answerCount（見 summary.entity.ts）。
        const answerCount = [...byContent.values()].reduce(
          (sum, count) => sum + count,
          0,
        );

        return {
          questionId: question.id,
          title: question.title,
          type: question.type,
          order: question.order,
          answerCount,

          // 只回原始數字，**不回百分比**。四捨五入之後加總不等於 100% 是常見的事，
          // 而那是「怎麼呈現」的問題，該由畫面決定 —— 後端一旦回了百分比，
          // 前端想改成一位小數就得改後端。
          options:
            question.type === QuestionType.SINGLE_CHOICE
              ? question.options.map((option) => ({
                  option,
                  count: byContent.get(option) ?? 0,
                }))
              : undefined,

          samples:
            question.type === QuestionType.TEXT
              ? (samplesByQuestion.get(question.id) ?? [])
              : undefined,
        };
      }),
    };
  }
}
