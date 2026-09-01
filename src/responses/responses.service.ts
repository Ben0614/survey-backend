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
// 下一站：src/auth/auth.module.ts（第四個 feature：註冊登入，這個專案第一次處理機密資料）
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
import { CreateResponseDto } from './dto/create-response.dto';
import { FindResponsesQueryDto } from './dto/find-responses-query.dto';

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
    // **「這些題目裡，有幾筆是這份問卷的？」** —— 數量對得上就全部合格。
    //
    // 為什麼非查不可：外鍵只保證「這個 questionId 在 Question 表裡找得到」，
    // **不保證它屬於這份問卷**。不查的話可以把 A 問卷的題目掛到 B 問卷的作答上，
    // 而外鍵、@@unique 全都沒被違反 —— 資料庫一聲都不吭。
    // 這是 Ch1 那句「唯一約束的作用範圍由它所在的表決定」的同族問題：
    // **約束只知道自己那張表的事**，「兩根外鍵的爸爸是不是同一個」超出它的視野。
    //
    // 用 count 而不是 findMany：要的是「幾筆」，數數在資料庫裡完成就好（同 Ch3）。
    // id: { in: [...] } 就是 SQL 的 IN (...)，也就是一串 OR 的簡寫。
    const count = await this.prisma.question.count({
      where: {
        surveyId,
        id: { in: questionIds },
      },
    });

    // 回 400 而不是 404（那些題目確實存在）也不是 409（不是狀態衝突）——
    // 是**請求內容本身有錯**。
    if (count !== questionIds.length) {
      throw new BadRequestException('有題目不屬於這份問卷');
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
  async findAll(surveyId: string, query: FindResponsesQueryDto) {
    // [教學] 這行沒接回傳值，作用是**借 SurveysService 丟 404**（同 questions.service.ts）。
    //
    // 少了它不會壞掉，但會壞在一個很難察覺的地方：問卷不存在時 findMany
    // 找不到符合的列 → 回 200 配 { data: [], meta: { total: 0, totalPages: 0 } }。
    // 於是「這份問卷還沒有人填」和「根本沒有這份問卷」變成**完全一樣的回應**。
    //
    // 而且它比 Ch3 那次更隱蔽：那邊回的是裸的空陣列 []，比較容易讓人起疑；
    // 這裡回的是一個 meta 四個欄位齊全的合法 JSON，**看起來非常正常**。
    await this.surveysService.assertExists(surveyId);

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
  async findOne(id: string) {
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

    return response;
  }
}
