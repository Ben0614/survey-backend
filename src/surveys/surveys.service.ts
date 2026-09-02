// ============================================================
// [教學] surveys.service.ts —— 真正碰資料庫的地方
//
// 什麼時候被執行：controller 收到請求後呼叫它。
// 它**幾乎**不知道 HTTP 的存在 —— 沒有 request、沒有網址。
//
// 「幾乎」是因為有一個例外：findOne 與 assertExists 找不到資料時直接丟
// NotFoundException，而 404 是不折不扣的 HTTP 概念。
//
// **Ch6 回頭重看過了，結論是維持現狀**（Ch2 的註解說「會回頭重看」，
// 不是「一定會改」—— 決定不改也是一個決定，所以理由寫在這裡）。
//
// 另一條路是 service 改丟自訂的 domain error（例如 SurveyNotFoundError），
// 由 Exception Filter 翻譯成 404，service 就徹底不認識 HTTP。
//
// 判準是**「這支 service 除了 HTTP 之外，還有沒有第二個呼叫者」**：
//   有  —— 同一個 SurveyNotFoundError 在 gRPC 要變 NOT_FOUND(5)、
//          在排程只要寫一行 log、在訊息佇列要決定重不重試。一個錯誤四種翻譯，
//          那時候把翻譯抽出來才划算
//   沒有 —— 多一層錯誤類別，換到的好處是假想的
//
// 這個專案是後者：唯一的入口就是 controller，而課綱到 Ch17（認證、Swagger、
// 前端）全部還是走 HTTP。NestJS 官方文件的範例也是直接在 service 丟
// NotFoundException —— 這不是反模式，是框架刻意把 HTTP 例外設計成通用的錯誤語彙。
//
// **會後悔的情境很具體**：哪天出現排程（每天寄提醒信）、CLI（匯出報表）、
// 或訊息佇列的消費者去呼叫這支 service，NotFoundException 會冒到一個
// 根本沒有 HTTP 回應可寫的地方。到時候再改也來得及，而且那時你會確切知道
// 第二個入口長什麼樣 —— 現在猜是猜不準的。
//
// 為什麼要有這一層，不讓 controller 直接用 Prisma：
// 從 Ch3 開始這裡會長出商業規則（「有人填答就不能改題目」），
// 那種判斷需要一個能被單元測試、且不必假裝發 HTTP 請求的地方。
// Ch2 的方法確實只是薄薄一層轉發，但位置先擺對，之後才有地方放東西。
//
// **Ch10 輪 3：create 多收一個 ownerId，而它不來自 DTO。**
// 判準是「這個值是**使用者說的**，還是**伺服器知道的**」——
// 前者才該進 DTO。ownerId 若寫進 CreateSurveyDto，whitelist 就不會擋它
// （它的規則是「DTO 沒宣告的欄位丟掉」），於是任何人都能建立一份掛在
// 別人名下的問卷。這是 Ch2 把 status 留在 DTO 外面的同一個決定，
// 但後果嚴重得多。
//
// 下一站：src/surveys/survey.rules.ts（publish / unpublish 借去問「可以嗎」的那兩條規則）
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { FindSurveysQueryDto } from './dto/find-surveys-query.dto';
import { canUnpublish } from './survey.rules';
import { SurveyStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class SurveysService {
  // PrismaModule 是 @Global()，所以這裡不必 import 它就能注入（見 prisma.module.ts）。
  constructor(private readonly prisma: PrismaService) {}

  /** 列出問卷，一次一頁。回的是 { data, meta }，不是裸的陣列。 */
  async findAll(query: FindSurveysQueryDto) {
    // [教學] 把 API 的概念換算成 ORM 的概念（Ch4 加的）：
    //
    //   skip → SQL 的 OFFSET，「前面幾筆不要」
    //   take → SQL 的 LIMIT， 「最多給我幾筆」
    //
    // 第 1 頁 skip 0、第 2 頁 skip pageSize、第 3 頁 skip 2×pageSize，
    // 也就是 (page - 1) * pageSize。寫成 skip: page 是很自然的誤解，
    // 而且它**第 1 頁看不出來**（兩種寫法都是 0），要翻到第 2 頁才會現形。
    //
    // 這一層換算是刻意的，不是多餘的工：`page` 是我們對前端的契約，
    // `skip` 是 Prisma 的參數，中間隔一層，哪天換掉 ORM 也不必叫前端改網址。
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    // [教學] where 抽成一個變數，不是為了少打幾個字（Ch4 ② 加的）。
    //
    // 下面的 findMany 與 count **必須用完全一樣的條件**。只給 findMany 加篩選、
    // count 忘了加的話，回應是完全合法的 JSON：data 是篩過的、total 卻是全表筆數，
    // totalPages 算出 5 頁但第 2 頁開始全是空的。沒有任何錯誤訊息、沒有任何測試會自己紅。
    //
    // 對策不是「記得兩邊都加」（人一定會忘），是**抽成同一個變數，
    // 讓「兩邊不一致」在結構上不可能發生**。
    //
    // [教學] 這裡沒有任何 if —— **undefined 在 Prisma 眼中就是「不加這個條件」**。
    // 這是 Ch2 update 那個約定（見下面的 update：undefined = 不要動它）
    // 用在 where 而不是 data。連巢狀的 contains: undefined 也一樣被忽略，
    // 整個 title 條件會消失，而不是變成「比對空字串」。
    //
    // 打開 query log 看得到證據：什麼參數都不給時 SQL 是 `WHERE 1=1`
    // （1=1 是「一個條件都沒有」的佔位符），帶了 q 才長出 title ILIKE。
    // **那些條件不是被跳過，是從來沒被產生。**
    //
    // [教學] 型別註記 `Prisma.SurveyWhereInput` 有兩個作用，第二個才是重點：
    //   1. 讓 mode: 'insensitive' 被認成 QueryMode 而不是 string。抽成變數之後，
    //      TypeScript 失去了「這個物件要餵給誰」的線索（內嵌在 findMany 裡時它有），
    //      只好把字面值猜成 string，於是型別對不上
    //   2. **它讓 tsc 真的幫你檢查欄位名** —— 打錯 titel 會紅
    //
    // 第 2 點值得跟正下方的 orderBy 對照：那裡是動態 key，tsc 什麼都檢查不到，
    // 只能靠 DTO 的 @IsIn 白名單擋。**同一支方法裡，一個地方型別有用、一個地方沒用；
    // 有用的地方就別放過。**
    //
    // mode: 'insensitive' 會翻成 PostgreSQL 的 ILIKE ('%' || $1 || '%')。
    // 前面那個 % 讓一般的 B-tree 索引完全失效（索引是照開頭排序的）→ 全表掃描。
    // 這一章不做索引優化，但要知道「加一個搜尋框」在資料庫端不是免費的。
    const where: Prisma.SurveyWhereInput = {
      status: query.status,
      title: { contains: query.q, mode: 'insensitive' },
    };

    // [教學] orderBy 不是可有可無的裝飾 —— **資料表沒有固有順序**
    // （見 docs/關聯式資料庫基礎.md 第 5 節）。不寫的話資料庫可以用任何順序回你，
    // 而且今天的順序不保證等於明天的順序。
    //
    // 加了分頁之後它從「好習慣」升級成**必要條件**：順序不固定的話，
    // 第 1 頁和第 2 頁可能是用兩種不同順序排出來的，同一筆資料會在兩頁都出現、
    // 另一筆一頁都不出現。**沒有穩定排序的分頁是壞的。**
    //
    // 「最新的在最上面」現在是 DTO 的預設值（sort='createdAt' / order='desc'），
    // 前端可以覆蓋 —— 但**覆蓋的範圍被白名單框死**，理由見 find-surveys-query.dto.ts。
    //
    // [教學] `{ [query.sort]: query.order }` 的方括號是 computed property name：
    // 物件字面值的 key 預設是「字面上那串文字」，方括號才代表「先求值，結果當 key」。
    //   { query.sort: ... }   語法錯誤
    //   { sort: ... }         合法，但意思是「照一個叫 sort 的欄位排」——沒這欄位
    //   { [query.sort]: ... } query.sort 是 'title' → { title: 'desc' }
    // 值那一側本來就是運算式，不需要方括號（對照下面 where 的 `{ id }` 簡寫：
    // 左邊是欄位名、右邊是變數，只是剛好同名）。
    //
    // **這一行 tsc 完全檢查不到**（動態 key 會關掉檢查），欄位名寫錯是執行期 500。
    //
    // [教學] $transaction 把兩句 SQL 綁成一件事。`$` 開頭代表這是 client 自己的方法，
    // 沒有 `$` 的（prisma.survey）才是你在 schema.prisma 定義的 model。
    //
    // **注意陣列裡那兩句都沒有 await。** Prisma 的查詢方法回傳的不是一個已經在跑的
    // Promise，而是一個「還沒送出的查詢」——你 await 它才送出；交給 $transaction
    // 就換成由它決定何時送。先各自 await 再丟進來的話，它收到的是「結果」不是「查詢」。
    //
    // 為什麼要包起來：這兩句都是 SELECT、不可能「做一半」，所以用的不是交易的原子性。
    // 分開跑的話兩句之間有一段空檔，中間有人新增一筆問卷，回應就會自相矛盾：
    // data 來自 47 筆的世界、total 說 48。這種 bug 只在有人同時操作時出現，
    // 本機測不到、e2e 也測不到。
    //
    // ⚠️ **但它買到的是「空檔變小」，不是「空檔消失」**（這句話 Ch5 實測後改寫過）。
    //
    // PostgreSQL 的預設隔離級別是 Read Committed，而它的規則是
    // **每一句 SQL 各自取一次快照**，不是整個交易共用一個。所以嚴格說，
    // 這兩句仍然可能看到不同的資料 —— 包起來的好處是它們跑在同一條連線上、
    // 由資料庫連續執行，中間不會回到 Node 等待，於是那個空檔小到幾乎量不到。
    //
    // 要真正保證一致，得明講 { isolationLevel: 'RepeatableRead' }。
    // 這個專案維持預設：差一筆的代價只是頁數少算一頁，不值得付鎖與重試的成本。
    // 完整的隔離級別對照見 docs/關聯式資料庫基礎.md 第 7 節。
    //
    // （原子性那一面 Ch5 用到了：一筆 Response + N 筆 Answer 要嘛全寫、要嘛全不寫 ——
    // 那裡用的是巢狀 write，Prisma 自己包了交易，不必自己寫 $transaction。）
    const [data, total] = await this.prisma.$transaction([
      this.prisma.survey.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip,
        take,
      }),

      // [教學] count 沒有帶 skip / take —— 它要數的是**符合條件的全部**，不是這一頁。
      // 跟著分頁一起切的話 total 會永遠等於 pageSize，分頁就變成自己證明自己了。
      //
      // 但 where **一定要帶**，而且必須跟上面那句一模一樣（理由見 where 的宣告處）。
      // 這裡把 where 拿掉，49 條測試只有一條會紅 —— 「meta.total 是篩選後的筆數」那條。
      this.prisma.survey.count({ where }),
    ]);

    // 回應包成 { data, meta } 而不是裸陣列：分頁之後光有資料不夠用，
    // 前端要畫頁碼就得知道總共幾筆、幾頁。對照組（陣列 + X-Total-Count 標頭）
    // 與取捨寫在 ch04 的「決策取捨」。
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,

        // [教學] Math.ceil 是無條件進位，不是四捨五入。
        // 47 筆、每頁 10 筆 → 4.7 → 需要 **5** 頁（第 5 頁只裝 7 筆）。
        // 四捨五入的話 41 筆會算出 4 頁，最後那 1 筆沒有任何頁面裝得到它。
        //
        // 少了 Math.ceil 沒有任何工具會抗議：number 除以 number 就是 number，
        // 3.5 是完全合法的值，tsc 與 lint 都會是綠的。只有把實際數字看一眼才抓得到。
        //
        // total 是 0 時這裡算出 0（「沒有任何一頁裝得到資料」）而不是 1。
        // 「page: 1, totalPages: 0」乍看很怪，但那兩個欄位回答的是不同問題：
        // page 是「你要求第幾頁」的回音，totalPages 是「資料有幾頁」。
        // 完整理由見 ch04 的「決策取捨」。
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** 只確認問卷存在（並取得判斷用的狀態），不撈題目。找不到就丟 404。 */
  async assertExists(id: string) {
    // [教學] 這支跟 findOne 查的是同一筆資料，差別只在**撈多少**。
    //
    // select 是「只要我列的欄位」——連 title、createdAt 都不會回來，
    // 更不會去碰 Question 表。對照下面 findOne 的 include（本表全要，
    // 額外再帶關聯 —— Ch4 ③ 之後改成由 query 決定要不要帶），兩者在同一層互斥。
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
    // 我們沒有寫任何型別註記，是 select 讓它自己變窄的。把游標移上去看一眼。
    //
    // 反方向（include 讓型別自己變寬）本來可以看下面的 findOne，
    // 但 Ch4 ③ 把它的 include 改成有條件的之後，那個示範已經不成立了 ——
    // 理由見 findOne 裡 include 那一段。**這種「型別自己跟著參數變」的能力
    // 只在參數寫死時才有。**
    return survey;
  }

  /** 查一份問卷。帶 includeQuestions 才連題目一起回。找不到就是 404，不會回 200 配一個空的 body。 */
  async findOne(id: string, includeQuestions: boolean = false) {
    // [教學] 第二個參數收的是 boolean，**不是整包 DTO**（對照上面 findAll 收 DTO）。
    //
    // 判準是「這支方法需要幾個值」，不是「service 能不能碰 DTO」這種鐵律：
    //   findAll 需要六個（page/pageSize/sort/order/status/q）→ 包成一個物件本來就合理
    //   findOne 需要一個 → 為了一個 boolean 而依賴一份由 HTTP 形狀決定的 class，
    //                      換不到任何東西
    //
    // 檢驗方式：如果哪天不是 HTTP 在呼叫它（單元測試、排程、其他 service），
    // 它得先準備什麼？這裡的答案是 true / false，不是「先 new 一個 DTO」。
    // 之後若長出第二個參數，再改成傳 DTO 是很自然的一步。
    //
    // `= false` 讓「不指定就是不帶題目」變成這支方法自己的規則，
    // 而不是靠每個呼叫端各自記得。DTO 那邊也有一份預設值，兩者不衝突：
    // 一份是對前端的契約，一份是對程式內部呼叫者的契約。
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
      // 同一層只能擇一。orderBy 一樣不能省，理由同 findAll。
      //
      // [教學] Ch4 ③ 把它改成由 query 決定，而且**預設不帶**。
      //
      // 三元運算式的 `: undefined` 才是關鍵：**undefined 在 Prisma 眼中就是
      // 「這個參數不存在」**，所以不必寫兩個 findUnique 分支。這是同一條約定的第三次
      //   Ch2 update  —— 用在 data  的欄位上（undefined = 不要動它）
      //   Ch4 ②       —— 用在 where 的欄位上（undefined = 不加這個條件）
      //   這裡        —— 用在**最外層的參數**上（undefined = 不加 include）
      //
      // 代價在型別上，而且看不到：三元運算式讓 Prisma 的型別推導**退回保守的那一邊**，
      // 回傳型別會塌成「沒有 questions」那一種。實測：
      //
      //   const s = await this.findOne(id, true);
      //   s.questions;   // TS2339: Property 'questions' does not exist
      //
      // **執行期是對的**（真的有題目、JSON 也有），只是編譯期不知道 ——
      // 因為 Prisma 的型別魔法靠「include 字面上長什麼樣」推導，
      // 而編譯期它只看得到 `X | undefined`。
      //
      // 這個專案接受這個代價：沒有任何 TypeScript 程式碼會去讀 .questions
      // （controller 直接回傳、Nest 序列化、e2e 用 as 斷言）。想要型別精確就得寫成
      // 兩個分支各自一句 findUnique，代價是 where 與 404 判斷重複一次。
      // **在 API 上多給一個選項，型別系統就少知道一件事** —— 取捨見 ch04 第三段。
      include: includeQuestions
        ? {
            questions: {
              orderBy: { order: 'asc' },
            },
          }
        : undefined,
    });

    // [教學] findUnique 找不到時回 null、不丟錯 —— 在 Prisma 眼中「沒找到」是正常結果。
    // 要不要把它當成錯誤，是**這一層**決定的。
    //
    // 不能直接 return null 讓它變成 200 配一個空 body：「查得到但內容是空的」
    // 和「這東西不存在」是兩件事，混在一起會逼前端寫出分不清「壞掉」和「沒有」的判斷。
    //
    // service 丟 HTTP 例外嚴格說是破了分層。Ch2 當時的理由是「另外兩種做法
    // ——controller 接住轉換、或自訂錯誤配 Exception Filter——在 Ch2 都太重」；
    // Ch6 真的有了 Exception Filter 之後重新評估，結論仍是維持（判準見檔頭）。
    //
    // 順帶一個 Ch6 才看得見的後果：filter 收到這個例外時，**它只看得到
    // 狀態碼 404 和這句訊息** —— 沒有「這是問卷還是作答不存在」的資訊。
    // 所以回應裡的 code 只能是狀態碼的鏡像（NOT_FOUND），要更細的 code
    // 就得讓 service 送上來。這是「決定不改 service」的直接代價。
    if (!survey) {
      throw new NotFoundException('問卷不存在');
    }

    // [教學] 這裡的型別不是 Survey | null。TypeScript 知道 throw 之後的程式碼走不到，
    // 所以型別自動收窄了 —— 上面那個 if 不只是執行期的保護，也是在對型別系統交代。
    //
    // [教學] 這裡本來有一句「回傳型別是 `Survey & { questions: Question[] }` ——
    // 加了 include，型別自己就跟著變了」。**Ch4 ③ 之後那句話是錯的**，所以改掉。
    //
    // 現在的型別是**沒有 questions** 的那一種（把游標移上去看一眼，就是這樣）。
    // 原因是 include 改成了三元運算式，Prisma 的型別推導只好退回保守側 ——
    // 完整說明在上面 include 那一段。
    //
    // Ch3 當時那句話是對的（include 寫死，型別確實自己變寬），
    // 而 Ch4 ③ 用「多一個 query 參數」換掉了那個好處。
    // 想看「型別自己變窄」的版本，看上面的 assertExists（select）。
    //
    // 這支現在**只有一個呼叫者**：GET /surveys/:id，也就是唯一真的要完整內容的那條路徑。
    // 原本 update / remove / QuestionsService 也借它丟 404、卻被迫連題目一起撈，
    // Ch3 第二段量出那筆浪費之後改用 assertExists 了（見上面那支）。
    return survey;
  }

  /** 建立一份新問卷。狀態一律是 DRAFT（由 schema 的預設值決定）。 */
  create(dto: CreateSurveyDto, ownerId: string) {
    // [教學] data 裡明確只寫 title，不是 `data: dto`。
    //
    // 就算 whitelist 已經擋過一層，這裡再寫一次「我只接受這個欄位」——
    // 兩道防線的成本很低，而漏掉的代價是有人能直接寫入任意欄位。
    // 之後 dto 多了欄位時，這裡也會逼你想一次「這個該不該進資料庫」。
    return this.prisma.survey.create({
      data: { title: dto.title, ownerId },
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
    // 另一種做法是 catch P2025。
    //
    // **Ch6 重新評估後仍然選「先擋」**：先擋才給得出「問卷不存在」這種具體訊息，
    // catch P2025 只知道「某一筆不見了」。Ch6 輪 2 會讓 filter 也認得 P2025，
    // 但那是**縱深防禦**（漏寫一處 assertExists 時不會變成 500），不是主要防線。
    //
    // 它防的不是假想的情境，是 TOCTOU：assertExists 通過之後、update 執行之前，
    // 另一個請求把那筆刪掉了 → P2025 → 500。這跟 questions.service.ts 的
    // order race 是同一族的形狀（「讀 → 回到 Node 判斷 → 寫」中間那段空檔）。
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

  /** 發布問卷。沒有任何前置條件，重複發布也不算錯誤。 */
  async publish(id: string) {
    // [教學] 這裡沒有「已經是 PUBLISHED 就提早 return」的判斷，是刻意的。
    //
    // PATCH 應該是**冪等**的：送幾次結果都一樣，第二次不該被當成失敗。
    // 而「冪等」不只指資料庫的狀態，**回應內容也算在內** ——
    // 如果提早 return assertExists 的結果，第二次呼叫拿到的會是 { id, status }，
    // 少了 title；同一支 API 回兩種形狀，前端就得判斷自己拿到的是哪一種。
    //
    // 把已發布的問卷再設成已發布是無害的，代價只是那一句 UPDATE 照樣發出去。
    // 一個出口、一種形狀，換一句 SQL —— 這個交易划算。
    await this.assertExists(id);

    return this.prisma.survey.update({
      where: { id },
      data: {
        status: SurveyStatus.PUBLISHED,
      },
    });
  }

  /** 撤回發布。已經有人填答就不給撤回（409）。 */
  async unpublish(id: string) {
    await this.assertExists(id);

    // [教學] 要的是「幾筆」，就用 count —— 不要撈出來再自己數 .length。
    //
    // count 發出的是 SELECT COUNT(*)，數數在資料庫裡完成，網路上只回一個數字。
    // 換成 include: { responses: true } 再取 .length 的話，500 筆填答就要把
    // 500 筆完整資料搬過網路，只為了看它有幾筆 —— 那正是 assertExists
    // 當初要消滅的那種浪費，只是換了個位置。
    //
    // 另一個理由 Ch4 已經兌現了（見 findAll 的 meta.total）：分頁之後 .length
    // 只會是「這一頁幾筆」，count 則完全不受 take / skip 影響 —— 它根本沒在取資料。
    //
    // where 是 { surveyId: id } 不是 { id }。後者會變成「回覆的 id 等於這個字串」，
    // 拿問卷 id 去比對回覆 id，永遠是 0 —— 而它型別完全正確，
    // tsc 與 lint 都不會抗議，只有 e2e 那條「有填答時回 409」抓得到。
    const responseCount = await this.prisma.response.count({
      where: { surveyId: id },
    });

    // [教學] 規則檔回 boolean，這裡才把它翻譯成 HTTP 的 409。
    //
    // 選 409 Conflict 而不是 403 或 400：
    //   403 是權限問題（換一個人來就可以），但這裡換誰來都一樣不行
    //   400 是請求本身有錯，但這個請求完全合法，而且會跟 ValidationPipe 的 400 混在一起
    // 409 的語義正是「請求沒問題，是跟資源目前的狀態衝突」。
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
