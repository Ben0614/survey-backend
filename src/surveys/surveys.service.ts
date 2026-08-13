// ============================================================
// [教學] surveys.service.ts —— 真正碰資料庫的地方
//
// 什麼時候被執行：controller 收到請求後呼叫它。
// 它**幾乎**不知道 HTTP 的存在 —— 沒有 request、沒有網址。
//
// 「幾乎」是因為有一個例外：findOne 與 assertExists 找不到資料時直接丟
// NotFoundException，而 404 是不折不扣的 HTTP 概念。
// 這是一道刻意留著的裂縫，取捨寫在 findOne 裡面，
// Ch6 有了 Exception Filter 之後會回頭重看。
//
// 為什麼要有這一層，不讓 controller 直接用 Prisma：
// 從 Ch3 開始這裡會長出商業規則（「有人填答就不能改題目」），
// 那種判斷需要一個能被單元測試、且不必假裝發 HTTP 請求的地方。
// Ch2 的方法確實只是薄薄一層轉發，但位置先擺對，之後才有地方放東西。
//
// 下一站：src/questions/questions.module.ts（子資源怎麼借用這裡的 assertExists）
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { canUnpublish } from './survey.rules';
import { SurveyStatus } from '../generated/prisma/enums';

@Injectable()
export class SurveysService {
  // PrismaModule 是 @Global()，所以這裡不必 import 它就能注入（見 prisma.module.ts）。
  constructor(private readonly prisma: PrismaService) {}

  /** 列出所有問卷。Ch4 才會加上分頁與篩選。 */
  findAll() {
    // [教學] orderBy 不是可有可無的裝飾 —— **資料表沒有固有順序**
    // （見 docs/關聯式資料庫基礎.md 第 5 節）。不寫的話資料庫可以用任何順序回你，
    // 而且今天的順序不保證等於明天的順序。
    //
    // 「最新的在最上面」是這裡自己決定的預設值；讓前端自由指定排序是 Ch4 的事。
    return this.prisma.survey.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 只確認問卷存在（並取得判斷用的狀態），不撈題目。找不到就丟 404。 */
  async assertExists(id: string) {
    // [教學] 這支跟 findOne 查的是同一筆資料，差別只在**撈多少**。
    //
    // select 是「只要我列的欄位」——連 title、createdAt 都不會回來，
    // 更不會去碰 Question 表。對照下面 findOne 的 include（本表全要、額外再帶關聯），
    // 兩者在同一層互斥。
    //
    // 為什麼要多這一支：findOne 有四個呼叫者，其中三個只是想確認「這份問卷在不在」、
    // 根本不看回傳值，卻被迫連題目一起撈。Ch3 第二段打開 query log 量到的結果是
    // GET /surveys/:surveyId/questions 跑了三句 SQL，而**最後兩句一模一樣**——
    // 同一批題目撈了兩次，第一次的結果直接丟掉。詳細的 log 在 ch03。
    //
    // 名字用 assertExists 而不是 findOneLite：**它的用途是斷言，不是取值。**
    // 名字說清楚「呼叫我是為了讓不存在的情況直接中止」，
    // 才不會有人拿它的回傳值當完整問卷用（它沒有 title，也沒有 questions）。
    const survey = await this.prisma.survey.findUnique({
      where: { id },

      // status 不是湊的 —— Ch3 第二段的「DRAFT 才能改題目」剛好需要它。
      // 一個 select 同時滿足兩個需求，而且它便宜到不值得為此再查一次。
      select: { id: true, status: true },
    });

    if (!survey) {
      throw new NotFoundException('問卷不存在');
    }

    // [教學] 回傳型別是 `{ id: string; status: SurveyStatus }`，**不是 Survey**。
    // 加 include 會讓型別自己變寬（見 findOne），用 select 則是自己變窄 ——
    // 兩邊都不必寫型別註記。把游標移上去看一眼。
    return survey;
  }

  /** 查一份問卷，連同它的題目。找不到就是 404，不會回 200 配一個空的 body。 */
  async findOne(id: string) {
    // [教學] 這是第一個必須寫 async / await 的方法。
    //
    // findAll 和 create 可以直接 return promise，是因為拿到結果之後什麼都不做；
    // 這裡要**檢查結果是不是 null**，就得先把 promise 裡的值 await 出來才能檢查。
    //
    // findUnique 的 where 只吃唯一欄位（@id / @unique / @@unique），
    // 拿 title 來查會被 TypeScript 直接擋下 —— 因為只有「唯一」才保證最多一筆，
    // 否則資料庫回三筆時這個方法不知道該回哪一筆。
    // （對照 findFirst：where 什麼欄位都能用，但要配 orderBy 才有意義。）
    //
    // where 裡的 `{ id }` 是簡寫，完整是 `{ id: id }`：
    // 左邊是資料表的欄位名，右邊是這個方法的參數，只是剛好同名。
    const survey = await this.prisma.survey.findUnique({
      where: { id },

      // [教學] include（Ch3 加的）—— 「本表欄位全要，額外再把關聯帶回來」。
      //
      // 沒有它的話回應只有 Survey 自己的欄位：schema.prisma 裡的 `questions Question[]`
      // 是虛擬欄位、不對應任何資料庫欄位（見 Ch1 那段註解），所以預設不會出現在結果裡，
      // 前端要顯示一份完整問卷得再打一次 /surveys/:id/questions。
      //
      // 對照 select：include 是「加東西」，select 是「只要我列的」（連純量欄位也是）。
      // 同一層只能擇一。這一章一律帶題目，由 query 決定要不要帶是 Ch4 的事。
      //
      // orderBy 一樣不能省，理由同 findAll。
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    // [教學] findUnique 找不到時回 null、不丟錯 —— 在 Prisma 眼中「沒找到」是正常結果。
    // 要不要把它當成錯誤，是**這一層**決定的。
    //
    // 不能直接 return null 讓它變成 200 配一個空 body：「查得到但內容是空的」
    // 和「這東西不存在」是兩件事，混在一起會逼前端寫出分不清「壞掉」和「沒有」的判斷。
    //
    // service 丟 HTTP 例外嚴格說是破了分層（見檔頭）。維持這樣是因為另外兩種做法
    // ——controller 接住轉換、或自訂錯誤配 Exception Filter——在 Ch2 都太重。
    if (!survey) {
      throw new NotFoundException('問卷不存在');
    }

    // [教學] 這裡的型別不是 Survey | null。TypeScript 知道 throw 之後的程式碼走不到，
    // 所以型別自動收窄了 —— 上面那個 if 不只是執行期的保護，也是在對型別系統交代。
    //
    // 而且它現在也不只是 Survey，是 `Survey & { questions: Question[] }` ——
    // **加了 include，回傳型別自己就跟著變了**，我們沒有寫任何型別註記。
    // 把游標移到 survey 上看一眼，這是 Prisma 型別系統最有感的地方。
    //
    // 這支現在**只有一個呼叫者**：GET /surveys/:id，也就是唯一真的要完整內容的那條路徑。
    // 原本 update / remove / QuestionsService 也借它丟 404、卻被迫連題目一起撈，
    // Ch3 第二段量出那筆浪費之後改用 assertExists 了（見上面那支）。
    return survey;
  }

  /** 建立一份新問卷。狀態一律是 DRAFT（由 schema 的預設值決定）。 */
  create(dto: CreateSurveyDto) {
    // [教學] data 裡明確只寫 title，不是 `data: dto`。
    //
    // 就算 whitelist 已經擋過一層，這裡再寫一次「我只接受這個欄位」——
    // 兩道防線的成本很低，而漏掉的代價是有人能直接寫入任意欄位。
    // 之後 dto 多了欄位時，這裡也會逼你想一次「這個該不該進資料庫」。
    return this.prisma.survey.create({
      data: { title: dto.title },
    });
  }

  /** 更新一份問卷。只有 dto 裡實際出現的欄位會被改動。 */
  async update(id: string, dto: UpdateSurveyDto) {
    // [教學] 這行沒有接回傳值，看起來像白呼叫一次 ——
    // 它的作用不是取值，是**借 assertExists 丟例外**。
    //
    // 找不到時 assertExists 會 throw，一 throw 下面整段就不會執行，
    // 例外往上冒到 Nest 變成 404 回應；查得到就安靜通過，程式往下走。
    //
    // 少了這行不是「一樣 404、只是訊息不同」，而是 **500**：
    // Prisma 會丟 P2025（要更新的紀錄不存在），Nest 不認識這個錯誤碼，
    // 就當成沒預期的例外。這對前端差很多 ——
    // 404 是「這東西不存在」（可以顯示「查無此問卷」），500 是「伺服器壞了」。
    //
    // 代價是同一筆資料查了兩次。這一章選直白，remove 也會原封不動再用一次；
    // 另一種做法是 catch P2025，那是 Ch6 Exception Filter 的正題。
    await this.assertExists(id);

    // [教學] dto.title 是 undefined 時（例如空 body），Prisma **完全不碰這個欄位** ——
    // 它把該欄位整個從 SQL 拿掉，而不是寫入空值。所以在 Prisma 眼中：
    //   undefined —— 不要動它
    //   null      —— 把它設成空值
    // 「空 body 什麼都不改」靠的是這個約定，不是我們額外寫了 if 判斷。
    //
    // data 明確只寫 title、不是 `data: dto`，理由同 create（見上面那段）。
    return this.prisma.survey.update({
      where: { id },
      data: { title: dto.title },
    });
  }

  /** 刪除一份問卷，連同它的題目與回覆。回傳被刪掉的那一筆。 */
  async remove(id: string) {
    // 404 的處理跟 update 同一套（理由見上面那段）。
    // 這正是當初選「先 assertExists 再操作」而不是 catch P2025 的好處 ——
    // 第二次要用的時候，一行原封不動搬過來就成立了。
    await this.assertExists(id);

    // [教學] delete 回傳的是**被刪掉的那一筆資料**，不是「刪了幾筆」。
    // 它等於一張刪除前的快照 —— 那筆資料在資料庫裡此刻已經不存在了。
    //
    // 另一件事更重要：這裡**沒有任何一行程式碼**去刪題目、回覆、答案，
    // 但它們真的會一起消失。那是 schema.prisma 的 onDelete: Cascade
    // 被寫進 migration.sql、由 PostgreSQL 自己執行的，跟這一行無關。
    //
    // Ch1 那句「哪些規則真的活在資料庫裡」，這是最直接的一個例子：
    // 規則不在這裡，所以看這個檔案永遠看不出來 ——
    // 只有 e2e 的 cascade 那條測試會告訴你它還活著。
    return this.prisma.survey.delete({
      where: { id },
    });
  }

  async publish(id: string) {
    await this.assertExists(id);

    return this.prisma.survey.update({
      where: { id },
      data: {
        status: SurveyStatus.PUBLISHED,
      },
    });
  }

  async unpublish(id: string) {
    await this.assertExists(id);

    const responseCount = await this.prisma.response.count({
      where: { surveyId: id },
    });

    if (!canUnpublish(responseCount)) {
      throw new ConflictException('問卷已被填寫，無法恢復成未發布狀態');
    }

    return this.prisma.survey.update({
      where: { id },
      data: {
        status: SurveyStatus.DRAFT,
      },
    });
  }
}
