// ============================================================
// [教學] questions.service.ts —— 題目這邊真正碰資料庫的地方
//
// 什麼時候被執行：兩個 controller 收到請求後都呼叫它（同一個實例）。
//
// 跟 surveys.service.ts 的差別只有一個，但它是這一章的主題：
// **題目是「子資源」，所以多了一層「父資源存不存在」要處理。**
// 那件事不歸這個 service 判斷 —— 它借 SurveysService 去問（見 findAll）。
//
// 下一站：test/setup-env.ts（上面這些怎麼被自動驗證，而且不弄髒開發資料庫）
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

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
  async findAll(surveyId: string) {
    // [教學] 這行沒接回傳值，作用是**借 SurveysService 丟例外**
    // （同 surveys.service.ts 的 update，只是那裡借的是自己的 findOne）。
    //
    // 少了它不會壞掉，但會壞在一個更難察覺的地方：問卷不存在時
    // findMany 找不到符合的列 → 回**空陣列** → 200 []。
    // 於是「這份問卷沒有題目」和「根本沒有這份問卷」變成同一個回應，
    // 前端沒有辦法分辨。子資源的列表**幾乎都要先確認父資源**，理由就是這個。
    await this.surveysService.findOne(surveyId);

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
    });

    if (!question) {
      throw new NotFoundException('題目不存在');
    }

    return question;
  }

  /** 在指定問卷底下新增一題，order 自動接在最後。 */
  async create(surveyId: string, dto: CreateQuestionDto) {
    await this.surveysService.findOne(surveyId);

    // [教學] order 由伺服器算，不由前端給（理由見 create-question.dto.ts 結尾）。
    // count 回傳現有題數，剛好就是下一個 index：0 題 → 新的是 0，3 題 → 新的是 3。
    //
    // 已知的洞：count 和 create 是**兩次獨立的查詢**，兩個請求同時進來時
    // 可能都讀到 2、於是都寫 order: 2。現階段接受 ——
    // 要根治得把兩件事包成一個交易，那是 Ch5 的主題。
    const order = await this.prisma.question.count({ where: { surveyId } });

    return this.prisma.question.create({
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
  }

  /** 更新一題。只有 dto 裡實際出現的欄位會被改動。 */
  async update(id: string, dto: UpdateQuestionDto) {
    // 借 findOne 丟 404。沒有這行的話 Prisma 會丟 P2025，Nest 不認識 → 500
    // （完整說明見 surveys.service.ts 的 update）。
    await this.findOne(id);

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
  async remove(id: string) {
    // 這一行就是當初選「先 findOne 再操作」而不是 catch P2025 的理由兌現：
    // 第二次要用的時候，原封不動搬過來就成立了。
    //
    // 這裡實際漏寫過一次，結果是 `id 不存在時回 404` 那條測試拿到 500 ——
    // 少了它不是「一樣 404、訊息不同」，是完全不同的狀態碼。
    await this.findOne(id);

    // 這一題底下的 Answer 會一起消失，但這裡沒有任何一行去刪它們 ——
    // 那是 schema.prisma 的 onDelete: Cascade 由 PostgreSQL 執行的（見 ch01 / ch02）。
    return this.prisma.question.delete({
      where: { id },
    });
  }
}
