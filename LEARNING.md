# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0 ~ Ch5 完成，**Ch6 輪 1 完成**（全域 Exception Filter + 統一錯誤格式）。
**階段一剩 Ch6 輪 2 / 輪 3、Ch7、Ch8。**
`pnpm test:e2e` **74 passed**、`pnpm test` **6 passed**、`tsc --noEmit` 0 errors、`lint` 0 problems。
下一步是 **Ch6 輪 2（filter 認得 Prisma 錯誤碼）**，起手式寫在下方「Ch6 輪 2 接續點」。

**重要脈絡：** Ch0 的程式碼是 AI 產生的，因此進度表的 ✅ 起初**只代表環境可用**，
不代表讀得懂 —— 為此補了一批 `[教學]` 註解當作理解鷹架（見 `docs/專案速查.md` 的「閱讀動線」）。

**2026-08-05 —— 閱讀動線已驗收通過。** 八題觀念題答對七題：依賴注入發生的時機、
`@Global()` 的作用、provider 單例、`schema.prisma` 不屬於執行期、`/health` 為何要打真查詢，
全部答對。唯一答錯的是 `app.init()` 與 `app.listen()` 的機制差異，已補講並寫進
`docs/chapters/ch00-環境建置.md`。**Ch0 現在是「環境可用 + 讀得懂」。**

**2026-08-06 —— 關聯式資料庫基礎已補完並驗收。** 六段講解各配一題，全數通過（其中三題經補講）。
定稿在 [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md)。三個補講的重點特別容易再忘：
更新異常的判準是「**同一件事實被存了幾份**」而非「有沒有改動」；
**表是集合、列沒有固有順序**，所以位置與列號永遠不能拿來當資料；
唯一約束的**作用範圍由它所在的表決定**（`(responseId, questionId)` 擋不住重複送出）。

**2026-08-07 —— Ch1 完成。** 四張表建在 Neon（`20260807020256_init_survey_schema`），
seed 可重複執行。三個 model 由自己寫、教練 review，第一輪抓到六項（最嚴重的是
`Answer` 只有 `questionId` 欄位卻沒寫 `@relation`，等於**沒有外鍵**），全部自行修正後 `validate` 通過。

讀 `migration.sql` 的驗收兩題半對半錯，已補講並寫進 [`ch01`](docs/chapters/ch01-schema設計與第一次migration.md)。
兩個補講的重點：**`ON DELETE` 與 `ON UPDATE` 是兩個獨立的觸發時機**（後者盯的是主鍵本身被改）；
**`@default(cuid())` 與 `@updatedAt` 完全沒有下放到資料庫**，繞過 Prisma 直接下 SQL 就會失效 ——
「哪些規則真的活在資料庫裡」是這一章最該帶走的東西。

**2026-08-09 —— 換機後踩到「Prisma Client 沒跟上 schema」，並完成 `findOne`。**

開工前先卡在一個會偽裝成「程式碼寫錯」的錯誤：ESLint 報 `Unsafe call of a type that
could not be resolved`，紅線畫在自己寫的程式碼上，但真正的訊息是 `tsc` 的
`TS2339` —— `PrismaClient<never, ...>`，那個 `never` 代表 client 認識的 model 集合是空的。
根因是 `src/generated/` 的產物停在 08/01（當時 schema 有 0 個 model），
而 **Prisma 7 的 `pnpm install` 不會自動 generate**（已驗證兩個套件都沒有 `postinstall`）。
完整記錄寫進 [`ch01`](docs/chapters/ch01-schema設計與第一次migration.md) 的
「Prisma Client 沒跟上 schema」專節。**這一節換機後值得先看一眼。**

`findOne` 自己寫、教練 review，抓到四項：404 的 E2E 沒寫（等於那條路完全沒被驗證）、
`service` 檔頭「沒有狀態碼」那句話因為加了 `NotFoundException` 而過期、
方法缺 `/** */`、`@Param` 這個新概念沒有教學註解。全部已補。

**2026-08-10 —— `update` 完成（`PATCH /surveys/:id`）。** 自己寫、教練 review 兩輪。

第一輪抓到七項，但**根因只有一個觀念**：`create` 沒有「要改哪一筆」的問題，`update` 有，
而那個識別資訊**屬於網址、不屬於 body**。把 `create` 的 DTO 形狀整份複製過來，
就被迫把 id 塞進 DTO、路由不需要 `:id`、`data` 只能整包展開 —— 一個誤解推倒三個決策。

第二輪抓到兩條**綠燈但什麼都沒測**的假測試：從對照版本複製後忘了改動詞
（404 那條發的是 `.get()`、whitelist 那條發的是 `.post()`），兩條都在 PATCH 的
`describe` 裡卻測著別的端點。假綠比紅燈危險 —— 它讓人以為那條路有被保護。
同時抓到 controller `await` 了卻沒 `return`，導致 200 配空 body。

**2026-08-10 —— Ch2 完成。** `remove` 也寫完（`DELETE /surveys/:id`），
**17 passed**、`tsc --noEmit` 0 errors、`eslint` 0 problems。

`remove` 的 review 抓到第三種假綠：`expect(x()).resolves.toBe(0)` **忘了 `await`**。
實測後發現它比想像中陰險 —— **會不會現形取決於它放在哪一行**：後面還有被 `await` 的斷言時
Jest 30 抓得到（測試紅），但它若是 `it` 的最後一行，rejection 沒人等，**測試就是綠的**。
`pnpm lint` 的 `no-floating-promises` 兩種位置都會叫，比 Jest 可靠 —— **lint 不只是排版**。

章節文件 [`ch02`](docs/chapters/ch02-第一個CRUD與測試資料庫隔離.md) 已寫完，
本節之前累積的 11 條坑全部搬進去了，這裡不再重複。其中兩個作業的答案是**實際跑出來**的，
不是推論：`whitelist: false` 單獨拿掉時測試**全綠**（因為 service 的
`data: { title: dto.title }` 是第二道防線），兩層都拆掉才會紅。

**2026-08-11 —— Ch3 第一段做到一半，`GET` 與 `POST` 完成。**
兩個 commit：`4d03691`（questions module）、`a5818f3`（`maxWorkers` 修正）。

最有價值的一次意外：拔掉 `@IsEnum` 想看「資料庫的 enum 會不會擋」，結果**根本沒到資料庫** ——
`whitelist: true` 判斷的是「屬性有沒有驗證裝飾器」，`type` 少了裝飾器就被整個丟掉，
`prisma.create` 收到 `undefined` 直接炸。**TypeScript 的 `type: QuestionType` 宣告
對 `whitelist` 毫無意義，它只認裝飾器。** 這是 Ch2 坑 #5 的現場重演。

另一個是 `maxWorkers`：Ch2 建的測試隔離只擋了「測試 vs 開發」，
第二個會清資料庫的 e2e 檔一出現就穿幫了。**隔離做得夠不夠，要等第二個參與者出現才知道。**

**2026-08-12 —— Ch3 第一段完成（`PATCH` / `DELETE` / `include`），並把債補完。**
四個 commit：`d43ee9e`（PATCH）、`5544241`（DELETE）、`ad4c408`（include）、
`fb278bc`（教學註解＋閱讀動線＋修過期註解＋`api.http`）。**30 passed。**

這一段最有價值的一次意外，是三條測試裡**那條綠的**：網址都少打一個 `s`，
於是「id 不存在回 404」綠了 —— 它的 404 來自「Nest 找不到路由」，
**404 的邏輯一行都沒被執行過**。而它的診斷價值是負的：看到「兩紅一綠」會去查那兩條，
但三條錯在同一件事。留下的判準是「**404 那條綠、其他全紅 → 先懷疑路由沒接上**」。

另一個是作業第 1、2 題的對比：同樣是「少一行借來的 404」，`remove` 少了會變 **500**、
`findAll` 少了會變 **200 配空陣列**。後者危險得多 —— 它是完全合法的回應，
沒有任何地方會亮紅燈，前端只會以為「這份問卷還沒出題」。**「沒有錯誤」不等於「正確」。**

補債時另外抓到**註解過期第三次**（`surveys.module.ts` 還寫著「沒有 exports」，
但早就加了）。三次的形狀都一樣：**這次改的是 A 檔案，而描述 A 的那句話在 B 檔案。**

觀念、取捨、11 條坑與**五題全部實跑**的作業解答都在
[`ch03`](docs/chapters/ch03-巢狀資源與關聯查詢.md)，這裡不重複。

**2026-08-12（同日稍後）—— 第二段的 ③ 打開 query log，量到三件事。**
commit `d1b7b8b`。加了 `PRISMA_LOG_QUERIES` 開關（預設關），其餘全是觀察：

1. **`include` 是兩句 SQL，不是 JOIN。** Prisma 用「多一次網路往返」換
   「不重複傳輸資料 + 語義單純」—— JOIN 會讓每一列都重複帶著父資料，多一層就相乘
   （cartesian explosion）。**這不是 N+1**：N+1 的查詢數隨資料量成長，這裡固定兩句
2. **`PATCH /surveys/:id` 有一句純粹浪費的** —— `await this.findOne(id)` 借它丟 404，
   卻連題目一起撈回來然後丟掉
3. **`GET /surveys/:surveyId/questions` 把同一批題目撈了兩次**（實測才發現，原本沒預期）。
   最後兩句 SQL 一模一樣

第 3 點是這一段的重點：**回應完全正確、測試全綠、沒有任何錯誤訊息 ——
不打開 log 永遠不會有人發現。ORM 讓你用一行程式碼換到不知道幾句 SQL。**

同一輪還修正了自己寫錯的一處機制解釋（`.env` 在 e2e 裡是被 `AppModule` 的
`ConfigModule` 讀進去的，不是 `setup-env.ts` —— 它只讀進一個丟棄用的物件做比對）。
結論對、機制錯，照錯的理解去推下一步就會出錯。**註解寫錯比沒寫更糟，這是第四次。**

**2026-08-13 —— Ch3 完成。** commit `811b191`（實作）＋文件。
`assertExists` 砍掉重複查詢（`GET /surveys/:surveyId/questions` 3 句 → **2 句**，實測確認）；
兩條商業規則抽成純函式、`publish` / `unpublish` 兩支動作型端點；
**36 passed**（+6）、`pnpm test` **4 passed** —— 專案第一支單元測試，0.5 秒對比 e2e 的 12 秒。

這一段最貴的三課：

1. **`tsc` 綠燈不代表跑得起來。** VS Code 自動補的 `import from 'src/...'` 絕對路徑，
   `tsc --noEmit` 0 errors，`pnpm test:e2e` 卻是 `Tests: 0 total`（三個 suite 全部
   `Cannot find module`）。`baseUrl` 只管編譯期，執行期的 Node 不吃。**同一輪踩了兩次。**
2. **假綠的第六種：查詢語法對、查錯欄位。** `response.count({ where: { id } })` ——
   `Response.id` 是合法欄位、型別完全正確，但它恆為 0，於是「有人填答就不能撤回」
   這條規則**從來不會生效**。三項驗收全綠，唯一的偵測器是那條還沒寫的 e2e。
   **寫規則的當下就要寫那條測試。**
3. **冪等連回應的形狀都算。** 「已經是 PUBLISHED 就提早 return」會回
   `assertExists` 的 `{ id, status }`，正常路徑回完整 `Survey` —— 同一支 API
   第二次呼叫少了 `title`。而這個坑的來源是 ③ 給 `assertExists` 加的 `select`，
   設計 ④ 時沒接上：**改了一支方法的回傳形狀，就要回頭想「誰在用它、用來做什麼」。**

另外把「什麼時候用 API、什麼時候用 Prisma」寫成 `docs/專案速查.md` 的一節 ——
那是實際卡住的地方，而且跨章節（controller / service / e2e 三處判準不同）。

觀念、取捨、13 條坑與兩批作業都在
[`ch03`](docs/chapters/ch03-巢狀資源與關聯查詢.md)，這裡不重複。

原則不變：**確認前一章讀得懂，再進下一章。**

**2026-08-15 —— Ch4 ① 分頁完成。** `40 passed`（+4）。
`page`/`pageSize` 的 query DTO、`{ data, meta }` 回應、`$transaction` 一次取資料與總數。

這一段最貴的四課：

1. **DTO 寫了但沒被用到 —— 一個決定推倒四件事。** 第一版寫成
   `@Query('page') page: number`（帶 key 取單一值），`FindSurveysQueryDto` 從頭到尾
   沒被 import 過。驗證、`whitelist`、預設值**全部沒生效**，七種網址實測有**兩種直接 500**。
   ValidationPipe 只在參數型別是 class 時才驗證 —— **驗證規則住在 class 的屬性上，
   沒有 class 就沒東西可查**。這是 Ch3 坑 #3 的第二次現場。
2. **「既有測試全綠」只證明沒弄壞舊行為。** 上面那個壞掉的版本，`pnpm test:e2e`
   是 **20 passed 全綠** —— 因為沒有任何一條測試帶過 query 參數。跟前幾章的假綠不同：
   那些是測試寫錯，這次是測試**還不存在**。
3. **改共用型別的「意思」，炸掉六個無關的地方。** 把 `SurveyBody` 從「一份問卷」
   改成「列表回應」，紅的測試從 2 條變成 **8 條** —— `POST` / `PATCH` / `publish`
   的回應一個字都沒變，卻被機械地加上 `.data[0]`。正解是**新增**型別而不是改寫。
   而且那六處 **`tsc` 全綠**：`as` 是斷言（「相信我」），關掉的是檢查、不是風險。
4. **測試存在不等於蓋到。** 補完四條分頁測試、24 passed 之後，`totalPages`
   只有一條測試斷言，而它的 `total` 是 0 —— **`0/10` 和 `Math.ceil(0/10)` 都是 0**，
   於是剛修好的 `Math.ceil` bug 放回去照樣全綠。判準：**想知道一條測試有沒有價值，
   就把它該抓的 bug 放回去跑一次。**

觀念、取捨、7 條坑、SQL 觀察、offset vs cursor 與五題作業都在
[`ch04`](docs/chapters/ch04-分頁排序與篩選.md)，這裡不重複。
交易（`$transaction`）寫進了 [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) 第 7 節
—— 它是跨章節的資料庫基礎，Ch5 還要再用一次。

**工作方式的一次修正**：review 只講**會影響行為**的事。註解過期、命名、文件同步
一律不在實作過程中提，那是收尾時統一處理的工作（已寫進 `CLAUDE.md`）。

**2026-08-17 —— Ch4 ② 排序與篩選完成。** `49 passed`（+9）。
`sort` / `order` 走白名單，`status` / `q` 走 `where`，兩輪分開做。

進 ② 之前先驗收 ①，三題答對兩題半 —— 答錯的那半題是「`$transaction` 包住兩句
`SELECT` 是為了什麼」：答成**原子性**（怕一個成功一個失敗），但兩句 `SELECT` 不會做一半。
真正用到的是**一致的讀取視角**。判準是「這幾句查詢的結果會不會被拿來互相比較」，
**跟有沒有寫入無關** —— 照「怕失敗才用交易」的理解去推，這種場合永遠不會想到。

這一段最貴的五課：

1. **動態 key 讓 `tsc` 完全失去檢查能力。** `orderBy: { [query.sort]: query.order }` ——
   實測三個情境：欄位名寫死的錯誤會紅（TS2353），動態 key **一律綠**，
   連宣告成 `string` 都綠、加了型別註記也還是綠。而現場的 bug 是 DTO 三處一致地把
   `createdAt` 寫成 `createAt`：`tsc` 綠、`@IsIn` 綠（白名單裡就是那個錯字）、
   **`GET /surveys` 每一次都 500**。**那一行唯一的防線是 `@IsIn`。**
2. **但隔壁的 `where` 剛好相反。** 欄位名是寫死的，加了 `Prisma.SurveyWhereInput`
   註記之後 `tsc` 就抓得到拼錯。**同一支方法裡兩個相鄰的地方，型別的保護力天差地遠** ——
   判準是「欄位名是寫死的還是動態的」。
3. **字串排序不照中文的語義。** `一 U+4E00 < 三 U+4E09 < 二 U+4E8C`，
   所以「第一/第二/第三份」排出來是 一、三、二。大小由 **PostgreSQL 的 collation** 決定，
   資料庫不知道 `三` 是 3。而這一課是從一條紅燈學到的 —— **錯的是測試的預期，不是實作**。
4. **測試存在不等於蓋到，第二次現場。** `sort=title` 那條的前提資料讓
   `title` asc 和 `createdAt` asc 算出**同一個答案**，於是把 service 改成完全忽略
   `query.sort`，28 條測試全綠。（上一次是 `0/10` 和 `Math.ceil(0/10)` 都等於 0。）
5. **教練講錯兩次，兩次都被實測推翻**（「動態 key 型別會撞」、「`contains: undefined`
   不能寫」）。兩次都是先給結論、沒有先量，而且結論方向對、機制錯 ——
   跟 Ch3 那次「`.env` 是被誰讀進去的」同一種錯。**可以在三分鐘內實測的事，不要用推論代替。**

SQL 觀察三件：`undefined` 的條件**整條不存在**（`WHERE 1=1` 是佔位符，不是「跳過」）；
`count` 子查詢那個 `OFFSET` 從 ① 的**推論**升級成**觀測確認**（用既有測試當證據，比再看一次 log 便宜）；
enum 在 PostgreSQL 裡是真的型別（`CAST($1::text AS "SurveyStatus")`），
所以 `status` 有兩道防線、而 `sort` 只有一道。

觀念、取捨、6 條坑（#8–#13）、SQL 觀察與五題作業都在
[`ch04`](docs/chapters/ch04-分頁排序與篩選.md)，這裡不重複。

**2026-08-18 —— Ch4 ③ 完成，Ch4 收工。** `52 passed`（+3）。
`GET /surveys/:id?includeQuestions=true`，**預設不帶題目**（這一章第二次 breaking change）。

這一段最貴的四課：

1. **boolean 是 query string 轉型唯一「壞掉看不出來」的型別。** `Boolean('false')` 是
   **`true`**（非空字串一律 truthy），所以 `@Type(() => Boolean)` 會讓「明說不要」變成「要」。
   對照 `Number`：它有 `NaN` 這個代表失敗的值，`@IsInt()` 抓得到 → 400；
   **`Boolean` 沒有 `NaB`**，任何字串都變成一個完全合法的布林值，驗證那層分不出真假。
2. **`@Transform` 的 fallback 決定了「非法值回 400 還是被吞掉」。** 寫成
   `value === 'true'` 一種比對，`?includeQuestions=ture`（手誤）→ `false` → **200 配沒有題目**。
   認不得就原封不動回傳，屬性還是 `string`，`@IsBoolean()` 才擋得下來。
3. **假綠的第七種，形狀是新的。** DTO 屬性叫 `includesQuestion`，測試打的是
   `?includeQuestions=false` —— 舊名字被 **whitelist 無聲丟掉**，屬性維持預設 `false`，
   於是測試通過。前六種都是**測試本身寫錯**，這次是**測試沒錯，但參數被伺服器合法地忽略**。
   **判準：query 參數改名時 `whitelist` 會讓舊名字安靜失效，改名當下要全域搜一次。**
4. **在 API 上多給一個選項，型別系統就少知道一件事。** `include: 條件 ? {...} : undefined`
   讓 Prisma 的型別推導退回保守側，回傳型別塌成「沒有 questions」那種
   （`s.questions` 是 TS2339）—— **執行期正確、編譯期不知道**。要型別精確就得寫兩個分支，
   代價是 `where` 與 404 判斷重複一次。這個專案選了重複比較少的那邊。

**收尾之後做了一次查核（「註解與文件都補好了嗎」），抓到三處漏的** ——
最嚴重的是 `findOne` 尾端還留著 Ch3 那句「加了 `include`，回傳型別自己就跟著變了，
把游標移上去看一眼」：③ 之後型別會塌成沒有 `questions` 的那種，
**照著那句話做會看到相反的東西**。而正確版本就寫在同一支方法上方二十行、
是同一輪實測出來的。註解過期第六次，形狀是新的（前五次都是跨檔案）。
另外兩處是 `docs/專案速查.md` 的檔案地圖漏了兩份 query DTO（`find-surveys-query.dto.ts`
從 ① 就漏了）。**兩條新規則已寫進 `CLAUDE.md`**：實測推翻既有說法要全域搜一次、
新增檔案要同時接動線與加地圖。

另外統一了 import 路徑（commit `9022cae`）：相對路徑一律不帶副檔名。
順帶抓到第五次註解過期，以及兩份文件寫錯的機制（「`nodenext` 要求寫編譯後的副檔名」——
它只在 ESM 檔案裡才要求）。**判準與 CJS/ESM 的分水嶺已寫進 `CLAUDE.md` 的「import 路徑的寫法」。**

觀念、取捨、15 條坑、三批 SQL 觀察與三批作業都在
[`ch04`](docs/chapters/ch04-分頁排序與篩選.md)，這裡不重複。

**2026-08-21 —— Ch5 完成。** `69 passed`（+17）、`pnpm test` `6 passed`（+2）。
三支端點分四輪：提交、歸屬檢查、查詢（分頁 + 單筆）、補 Ch3 的 `order` race。

這一章最貴的五課：

1. **交易保證的沒有你以為的多 —— 而且這件事推翻了 Ch4 寫錯的一句話。**
   PostgreSQL 預設是 `Read Committed`，**每一句 SQL 各自取一次快照**，
   不是整個交易共用一個。所以「`count` 讀到 2 → 回到 Node → 寫 `order: 2`」這種形狀，
   **包了 `$transaction` 也擋不住 race**（兩個請求可以同時讀到同一個舊值）。
   而 Ch4 說的「`$transaction` 讓 `data` 與 `total` 來自同一個瞬間」同樣不成立 ——
   包起來買到的是「空檔變小」，不是「空檔消失」。
   **四處說法已全部更正**（`surveys.service.ts`、`關聯式資料庫基礎.md`、`ch04`、`Prisma速查.md`）。
   **這是註解寫錯的第七次，也是最貴的一次**：前六次是「改了程式忘了改註解」，
   這次是一開始就講錯了機制，而後面每一步都建立在那個錯的理解上。
2. **外鍵保證「存在」，不保證「屬於這份問卷」。** 可以把 A 問卷的題目掛到 B 問卷的作答上，
   外鍵、`@@unique` 全都沒被違反、沒有任何錯誤。而**這件事 DTO 永遠做不到** ——
   它只看得到請求本身，看不到資料庫。**跨表檢查一律是 service 的工作。**
3. **三層防線的保護範圍完全不同。** 驗證住在 ValidationPipe（繞過 HTTP 就沒了）、
   商業規則住在 service（所有呼叫者都受保護）、完整性住在 PostgreSQL（一直都在）。
   所以直接呼叫 service 時「空 answers 會成功、`DRAFT` 仍然 409」。
4. **假綠的第八、九種。** 第八種是**空的 `it`**（數字漲了三、保護是零）；
   第九種是**測試繞過了被測的程式碼** —— 前提資料用 `prisma.create` 自己寫死 `order: 0/1/2`，
   驗的是自己剛寫的數字，把 service 的 `order` 改成 `999` 照樣綠。
5. **併發測試綠了不代表修好了。** `Promise.all` 只保證「一起送出」，不保證「同時到達資料庫」。
   判準：**測試綠的時候，問自己「我有沒有辦法說明為什麼它不會發生？」** 說不出來就是還在。

另外量到：**巢狀 write 本身就是一個交易**（log 有 `COMMIT`），所以不必自己包；
N 筆答案**批次成一句 `INSERT`**，查詢數不隨答案數成長。

收尾時還踩到一個環境問題（坑 #6）：`read ECONNRESET`、**每次失敗的測試都不一樣**。
七個假設逐一實測排除（孤兒行程、資料庫、閒置連線、冷啟動、埠耗盡、supertest、Jest 逾時），
**關鍵的一支探針是「把 HTTP 拿掉，直接用 Prisma 跑 70 圈完整工作量」—— 70/70 成功**，
於是確定不是程式碼也不是資料庫，而是這台機器的 HTTP socket 層。沒有繼續往下挖。

**判準：「失敗的測試每次不同」+「錯誤不是斷言」= 先懷疑環境，不要改程式碼。**
而這一輪最貴的是**順序反了** —— 第一個假設（孤兒行程）合理、清掉之後症狀也真的減輕，
於是又重試了好幾輪。**「症狀減輕」不等於「找到原因」。**
排除表與探針腳本已收進 `docs/專案速查.md` 與 `scripts/`，下次是十分鐘的事。

順帶量到：**每次往返 Neon（新加坡）約 500ms**，e2e 的時間幾乎全花在網路上。

觀念、取捨、6 條坑、SQL 觀察與六題作業都在
[`ch05`](docs/chapters/ch05-提交與查詢作答.md)，這裡不重複。
中途另外把 [`docs/Prisma速查.md`](docs/Prisma速查.md) 補了出來（commit `aafd9c4`）——
起因是實作時卡在「`create` 的 `data` 到底可以帶什麼」，那是跨章節的問題。

**2026-08-22 —— Ch6 輪 1 完成，並把纏了兩章的環境問題連根修掉。**
兩個 commit：`51667fe`（環境）、`1d49fe4`（輪 1）。`74 passed`（+5）。

**環境那一半比 Ch6 本身更有價值。** Ch5 坑 #6 的 `read ECONNRESET` 當時停在
「這台機器 HTTP socket 層的問題」，這次拆開來發現底下其實是**三個各自獨立的問題**：
測試跑完不結束（jest 等殘留 handle → `--forceExit`）、
中斷後留下孤兒（Windows 沒有 process group → `pretest:e2e` 自動清）、
以及 ECONNRESET 本身。

**ECONNRESET 的根因**：supertest 底下的 superagent 建構時寫死 `this._agent = false`，
在 Node 裡那代表「每個請求自己開一個一次性 Agent、不做連線池」—— 於是每個請求
都開一條新 TCP 連線、用完就關。換成 keep-alive 之後實測 **16/9/14 條紅 → 0/0/0**。

而 Ch5 排除表裡有一行「試了 `app.listen(0)` 重用同一個 server → 沒用」。
**「重用同一個 server」和「重用同一條連線」是兩件事** —— 前者省 listen，
後者省 TCP 握手與關閉。Ch5 的結論方向對，但停得太早。

修完之後還學到一件：ECONNRESET 歸零後剩下的偶發失敗**確實是 5 秒逾時**，
而排除表寫「`testTimeout` 改 30000 → 沒用」**也是對的**（當時連 HTTP 都沒打通）。
**同一個旋鈕在不同的根因下，結論會完全相反。**

這一段最貴的三課：

1. **「改一個東西之前先問：現在有什麼在保護它？」** 開工前數了一次，31 條測試在斷言
   錯誤**狀態碼**，斷言錯誤 **body** 的是 **0 條** —— 改格式一條都不會紅。
   這跟前面幾次假綠不同：那些是測試寫錯，**這次是那個面向從來就沒有測試**。
2. **「設定寫了但沒生效」同一輪踩兩次，兩次都沒有錯誤訊息。**
   原本要寫的 `http.globalAgent.keepAlive = true` 根本不會有效果（superagent 不走
   globalAgent）；第一版 patch 又打在了沒人用的那一份 superagent 上（pnpm 的隔離讓
   `require('superagent')` 跟 supertest 內部用的**不是同一個檔案**）。
   **判準：改了設定之後先驗證它真的接上了，再去測效果。** 少了這一步，
   兩次都會變成「keep-alive 沒用」這個錯誤結論。
3. **`git show` 看換行會騙人。** 它會套用簽出轉換，在 `autocrlf=true` 的機器上
   一律報 CRLF，看起來像 commit 錯了。**只信 `git ls-files --eol` 的 `i/` 欄。**
   順帶更正了 `CLAUDE.md` 兩處寫錯的說法（`core.autocrlf` 的值、以及檢查方法）。

Ch6 本身的三個決定（不做 domain error、`code` 先做狀態碼鏡像、
不改 `assertExists` 策略）與 5 條坑都在
[`ch06`](docs/chapters/ch06-統一錯誤處理與回應格式.md)，這裡不重複。

---

### Ch6 輪 2 接續點（2026-08-22）

**目前狀態**：`pnpm test:e2e` **74 passed**、`pnpm test` **6 passed**、
`tsc --noEmit` 0 errors、`eslint` 0 problems。
**Ch0 ~ Ch5 完成、Ch6 輪 1 完成**（註解與文件已同步到輪 1 為止）。

兩個 commit：`51667fe`（環境修復）、`1d49fe4`（Ch6 輪 1）。

Ch6 的觀念、取捨與 5 條坑在
[`ch06`](docs/chapters/ch06-統一錯誤處理與回應格式.md)，**這裡不重複**。

#### 換機之後先做這三件事

1. **一般的換機步驟**（`git pull` / `pnpm install` / `pnpm exec prisma generate` /
   重建 `.env`、`.env.test` / 重建 skills junction）—— 見
   [`docs/專案速查.md`](docs/專案速查.md) 的「換機接續」。
2. **跑四項驗收確認數字對得上**：`test:e2e` **74**、`test` **6**、`tsc` 0、`lint` 0。
   對不上就先修環境，別開始寫程式。
3. **確認 `core.autocrlf`**：`git config --get core.autocrlf`。
   這台（桌機）是 `true`，另一台不一定。它是本機設定、不跟著 git 走。
   查換行**只信 `git ls-files --eol` 的 `i/` 欄**，`file` 與 `git show` 都會誤判
   （見 `CLAUDE.md` 的「換行一律 LF」，2026-08-22 更正過）。

> **e2e 的三個防呆已經進版控了**（`--forceExit`、`pretest:e2e`、keep-alive patch），
> 所以換機後 ECONNRESET / 卡死 / 孤兒行程這三件事**不會重演**。
> 如果重演了，先確認 `pnpm test:e2e` 真的有跑到 `pretest:e2e`
> （pnpm 有 `enable-pre-post-scripts` 設定，預設值在不同版本改過 —— 實測方式見
> `docs/設定檔導讀.md`）。

#### 輪 1 已經完成的事

- `src/common/filters/all-exceptions-filters.ts` —— 全域 catch-all filter
- `src/setup-app.ts` —— `useGlobalFilters`，跟 `ValidationPipe` 並排
- `test/errors.e2e-spec.ts` —— 5 條，補上「錯誤 body 從來沒有測試保護」這個缺口
- 回應格式統一成 `{ error: { code, message } }`，驗證失敗多一個 `details`

三個已拍板、**輪 2 不要再翻案**的決定（完整理由在 `ch06` 的「決策取捨」）：

| 決定 | 結論 |
| --- | --- |
| service 要不要改丟 domain error | **不改**，維持丟 HTTP 例外。判準是「除了 HTTP 還有沒有第二個入口」 |
| `code` 要多細 | **狀態碼的鏡像**，五種。細粒度留到 Ch7 寫 Swagger 時評估 |
| Ch2 那筆「查兩次」的債 | **不改策略**，filter 的 Prisma 分支定位成**安全網**不是主要防線 |

#### 輪 2 要做什麼：Prisma 錯誤碼的安全網

##### 逐檔案

**`src/common/filters/all-exceptions-filters.ts`** —— 在 `HttpException` 那支**之前**
多一支 `exception instanceof Prisma.PrismaClientKnownRequestError`。

import 路徑是 `import { Prisma } from '../../generated/prisma/client'`
（`surveys.service.ts` 已經這樣 import 了）。`Prisma.PrismaClientKnownRequestError`
是真的 class，`instanceof` 可用 —— 已確認匯出在
`src/generated/prisma/internal/prismaNamespace.ts`。

對照表（判準是**「前端拿到之後能做什麼」**）：

| 碼 | → | 為什麼 |
| --- | --- | --- |
| `P2025` | 404 `NOT_FOUND` | 「那筆資料不在了」＝前端可以顯示「查無此項目」 |
| `P2002` | 409 `CONFLICT` | 唯一約束衝突＝請求合法但跟現況衝突，語義同 `unpublish` 的 409 |
| `P2003` | 400 `BAD_REQUEST` | 外鍵指向不存在的東西＝**請求內容本身有錯** |
| 其他 `P####` | 500 | 認不得就不翻譯，走既有的 500 分支（含完整 log） |

**`test/errors.e2e-spec.ts`** —— 加第二個 `describe`。它需要一個**不同的 app**：

```ts
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PrismaService)
  .useValue(/* 會丟指定錯誤的替身 */)
```

構造錯誤的形狀：

```ts
new Prisma.PrismaClientKnownRequestError('mocked', {
  code: 'P2025',
  clientVersion: 'test',
});
```

**這是全專案第一次用 mock，而且不違反「E2E 優先」** —— 那條原則的判準是
「mock 掉 Prisma 等於在測 mock」，但這裡要測的**不是業務邏輯**，
是「這種錯誤發生時 filter 會怎麼做」，而正常路徑**製造不出那個錯誤**
（service 三處都先擋掉了，那正是決定 3 的直接後果）。

**不用改**：所有 controller、所有 service、所有 DTO、`setup-app.ts`。

##### 重點：這一輪最容易錯的一件事

**用鴨子型別判斷而不是 `instanceof`。**

寫成 `if ('code' in exception)` 會出事：`HttpException` 也可能有 `code`
（有人用物件形式建構時），於是 404 被誤判成 Prisma 錯誤。
**`instanceof` 問「它是什麼」，屬性存在性問「它長得像什麼」** —— 這裡要問前者。

症狀會很難查：大部分時候正常，只有某些例外被錯誤分類，而且狀態碼看起來仍然合理。

##### 留給自己想的一點

**`P2003` 為什麼是 400 而不是 404？**
線索：`responses.service.ts` 已經對同一件事做過判斷了
（「回 400 而不是 404（那些題目確實存在）也不是 409（不是狀態衝突）」）。
filter 這一層要跟 service 那一層**得出同一個答案**，否則同一個錯誤走兩條路會回兩種狀態碼。

##### 測試名稱（4 條，可直接貼上）

```ts
describe('Prisma 錯誤的安全網 (e2e)', () => {
  it('Prisma 丟 P2025 時回 404 而不是 500', async () => {});

  it('Prisma 丟 P2002 時回 409 而不是 500', async () => {});

  it('Prisma 丟 P2003 時回 400 而不是 500', async () => {});

  it('未知錯誤回 500，且 message 不含原始錯誤內容', async () => {});
});
```

**主角是第 4 條** —— 它是唯一會抓到「把 `exception.message` 直接回給前端」的測試。
斷言要寫成 `expect(res.body.error.message).not.toContain('mocked')`，
不是只驗狀態碼是 500（那三條都在驗了）。

##### 誠實記錄一個缺口

**TOCTOU 的真實 race 在 e2e 重現不出來**（Ch5 已經學過「`Promise.all` 只保證一起送出，
不保證同時到達資料庫」）。這四條驗的是「filter 收到那個錯誤時會怎麼做」，
**不是「那個錯誤真的會發生」**。這個缺口要寫進 `ch06`，不要假裝它不存在。

#### 輪 3（收尾）要做的事

| 檔案 | 要做什麼 |
| --- | --- |
| `src/common/filters/all-exceptions-filters.ts` | **改名成 `all-exceptions.filter.ts`**（Nest 慣例，對照 `.service.ts` / `.controller.ts` / `.dto.ts`）。不影響行為，但 `setup-app.ts` 的 import 與 `docs/專案速查.md` 的檔案地圖／閱讀動線要一起改 |
| `src/questions/questions.service.ts` | `update` / `remove` 提到「Prisma 丟 P2025 → 500」的兩處，輪 2 之後要補上安全網的存在 |
| `src/responses/responses.service.ts` | 「能在自己這一層先擋掉的就不要讓錯誤碼冒上來」仍然成立，補一句「而且現在有安全網了」 |
| `docs/Prisma速查.md` 第 7 節 | 已寫好「現在」與「之後」兩段，輪 2 完成後把「尚未實作」拿掉 |
| `docs/chapters/ch06-*.md` | 補輪 2 的內容與**作業**（目前還沒出） |
| `LEARNING.md` | 進度表 Ch6 → ✅、寫「Ch7 接續點」 |

#### 這一輪已經處理掉的環境問題（不必再碰）

Ch5 坑 #6 的 `read ECONNRESET` **根因找到並修好了**：supertest 底下的 superagent
寫死 `this._agent = false`，每個請求都開一條新 TCP 連線。
`test/setup-env.ts` 換成 keep-alive 的 Agent，實測 **16/9/14 條紅 → 0/0/0**。

同時解決的還有兩件：`--forceExit`（測試跑完不結束）與 `pretest:e2e`（孤兒行程累積）。
完整記錄在 `ch06` 的坑 #3、#4，操作方式在 `docs/專案速查.md` 與 `docs/設定檔導讀.md`。

> **兩個判準值得記住：**
> **「重用同一個 server」和「重用同一條連線」是兩件事**（Ch5 試了前者、以為排除了後者）；
> **同一個旋鈕在不同的根因下結論會完全相反**（`testTimeout` 在 ECONNRESET 還在時沒用、修好後才對症）。

#### 工作方式（沿用，實際付出代價換來的）

- **教練模式**：實作自己寫，教練 review 並負責 `[教學]` 註解與文件
- **review 只講會影響行為的事。** 註解過期、命名、文件同步不在實作過程中提 ——
  那是收尾時統一處理的工作（2026-08-15 修正，已寫進 `CLAUDE.md`）
- 一次做完一件事：service → controller → E2E → **跑測試**
- **每寫一條測試就跑一次**，不要一口氣寫完才跑
- 貼上測試的當下核對**動詞與路徑**跟 `describe` 一致（這個坑踩過五次）
- **測試名稱由教練先給**：要寫幾條就給幾條、含所屬 `describe`、可直接貼上
- **每一輪開工前教練先給一份指引**：逐檔案列出要改什麼（不給實作）、每個決定附
  「為什麼」並指回學過的地方、把最容易錯的那點標成重點並說清楚錯了長什麼樣、
  留一兩個自己想的提示、最後才給測試名稱（五個要素在 `CLAUDE.md`）
- **一輪只做一個能獨立驗收的主題。** 判準：兩件事會不會在同一條測試裡同時失敗？會，就拆
- **新加的功能要問一次「有測試蓋到嗎」。** 既有測試全綠只證明沒弄壞舊行為
- **改一個東西之前先問「現在有什麼在保護它？」**（Ch6 新增）——
  答案是「沒有」的時候，「測試全綠」這個資訊的價值是零
- **改了一個「應該會生效」的設定之後，先驗證它真的接上了，再去測效果**（Ch6 新增）——
  否則「沒生效」會被誤讀成「這個方法沒用」
- 新檔案要接進閱讀動線（改前一站的「下一站」）**並同時加進檔案地圖**，別讓鏈斷掉。
  目前終點是 `src/surveys/survey.rules.spec.ts`
- **import 路徑一律用相對路徑、不帶副檔名**（判準見 `CLAUDE.md`）
- **query 參數改名時要全域搜一次那個字串** —— `whitelist` 會讓舊名字**安靜失效**
- **不要並行跑 `pnpm test:e2e`**（`pretest:e2e` 會把另一個行程殺掉）
- 丟給教練 review 之前先自己跑四項驗收：
  `pnpm test`、`pnpm test:e2e`、`pnpm exec tsc --noEmit`、`pnpm lint`

> **換機器後 `.env.test` 不存在，測試會直接失敗**（防呆刻意如此）。
> 重建步驟見 [`docs/專案速查.md`](docs/專案速查.md) 的「換機接續」。
> `src/generated/` 也不進版控，記得 `pnpm exec prisma generate`。

> **加分項（非前提）：** 讀 NestJS 官方文件 Overview 前四篇
> （First steps / Controllers / Providers / Modules，約一小時）。
> Prisma 則不要上網找教學：v7 太新，網路上九成是 v5/v6；用 `.agents/skills/` 的官方技能包。

---

## 進度表

**測試不獨立成章。** 從 Ch2 開始，每章的驗收標準就是「該章的 E2E 測試綠燈」——
回頭補的測試只會驗證「現在的行為」，而不是在寫的當下幫你發現問題。

### 階段一：NestJS + Prisma + PostgreSQL

| 章節 | 主題 | 這章的關鍵收穫 | 狀態 |
| :---: | --- | --- | :---: |
| Ch0 | 環境建置與 `/health` | DI、module 邊界、生命週期 | ✅ |
| Ch1 | Schema 設計、第一次 migration、seed | 資料模型設計、migration 是什麼 | ✅ |
| Ch2 | 第一個 CRUD（Surveys）+ **測試資料庫隔離** | DTO 驗證、404 處理、`.env.test` 與資料清理 | ✅ |
| Ch3 | 巢狀資源與關聯查詢（Questions） | `include`/`select`、**看 Prisma 產生的 SQL**、商業規則與第一支單元測試 | ✅ |
| Ch4 | 分頁、排序、篩選 | query string 轉型驗證、`skip/take` vs cursor | ✅ |
| Ch5 | 提交與查詢作答（Responses） | 巢狀 write vs `$transaction`、原子性、**商業規則與單元測試** | ✅ |
| Ch6 | 統一錯誤處理與回應格式 | Exception Filter 把 Prisma 錯誤碼轉 HTTP | 🚧 輪 1 完成 |
| Ch7 | Swagger API 文件 | 產出前端能直接照著串的契約 | ⬜ |
| Ch8 | **第一次部署（後端先上線）** | `migrate deploy`、正式環境變數、連線數上限 | ⬜ |

### 階段二：JWT 與權限控管

| 章節 | 主題 | 這章的關鍵收穫 | 狀態 |
| :---: | --- | --- | :---: |
| Ch9 | User model、bcrypt、註冊登入 | 密碼雜湊；**對已有資料的表加 `ownerId`** | ⬜ |
| Ch10 | JWT 與全域 AuthGuard | 認證流程、`@Public()` 的例外機制 | ⬜ |
| Ch11 | RBAC：只有管理員能刪問卷 | 角色權限、`@Roles()` 自訂裝飾器 | ⬜ |
| Ch12 | 資源層授權：只能改自己的問卷 | Guard 層 vs Service 層判斷的取捨 | ⬜ |

### 階段三：前端串接與部署

| 章節 | 主題 | 這章的關鍵收穫 | 狀態 |
| :---: | --- | --- | :---: |
| Ch13 | Nuxt 3 建置、**從 Swagger 產生型別**、API client 封裝 | `openapi-typescript`、統一錯誤處理 | ⬜ |
| Ch14 | 認證流程串接 | token 存放的安全取捨、路由守衛 | ⬜ |
| Ch15 | 問卷功能頁面 | 前端狀態與後端契約的落差 | ⬜ |
| Ch16 | CORS、環境變數分離、production build | 跨網域的實際運作機制 | ⬜ |
| Ch17 | 前端部署與整合驗收 | 端到端跑通「建立 → 填寫 → 看結果」 | ⬜ |

### 貫穿全程的商業規則

`Survey.status` 不是裝飾用的欄位，兩條規則分散在對應章節實作：

- **只有 `PUBLISHED` 的問卷能被填答**（Ch5）
- **`DRAFT` 才能自由增刪題目；一旦有人填答就不能再改題目**（Ch3）

這是整個專案唯一有實質商業邏輯的地方，也是**唯一適合寫單元測試**的地方
（純判斷、不碰資料庫）。其餘部分都用 E2E 測試 —— Ch5 會實際對比兩者的適用時機。

### 課綱修訂紀錄

**2026-07-27（第二次修訂）** — 17 章調整為 18 章：

- **測試資料庫隔離併入 Ch2** — 上一次修訂移除獨立的 E2E 章時，把「Neon test branch 設定」與「測試資料清理」一起刪掉了。這是必要工作，且必須在 Ch2 之前完成，否則 E2E 測試會清掉開發資料庫
- **新增 Ch8「第一次部署」** — 階段一結束就先讓後端上線。部署問題最容易卡人，此時系統最簡單（沒有認證、沒有前端），變數最少
- **`Survey.status` 從死欄位變成實際規則** — 原課綱設計了這個欄位卻沒有任何一章使用它
- **Ch5 補上「查詢作答」** — 問卷平台的核心價值是看結果，原課綱只寫了提交
- **Ch13 的「型別共享」改為「從 Swagger 產生型別」** — 前後端是兩個獨立目錄、不是 monorepo，直接 import 型別做不到；正確做法是用 `openapi-typescript` 從 Ch7 的 Swagger 規格產生。這也讓 Ch7 有真實用途

**2026-07-27（第一次修訂）** — 原訂 14 章調整為 17 章：

- **移除獨立的「E2E 測試」章**，測試併入 Ch2 起的每一章
- **新增分頁章** — 原課綱沒有分頁，`GET /surveys` 回傳全部資料在真實專案就是 bug，而且是面試高頻題
- **錯誤處理章更名為「統一錯誤處理」** — 原名會誤導成「前面幾章可以不管錯誤」，實際上 Ch2 寫 `findOne` 就要處理 404
- **明確寫入「看 Prisma 產生的 SQL」（Ch3）** — 只會 ORM 不懂底下的 SQL 是 ORM 使用者最常見的弱點
- **明確寫入「對已有資料的表加欄位」（Ch9）** — 這是整個專案最真實的一堂 migration 課（既有列要填什麼值？能不能設 NOT NULL？）
- **階段三從 3 章拆為 5 章** — 原本的一章塞了「建置 + 串接 + token + 守衛」四件事

---

## 章節內容

每章的「核心概念 / 決策取捨 / 踩到的坑 / 作業」各自一個檔案，寫到才建立：

| 章節 | 檔案 |
| --- | --- |
| Ch0 — 環境建置 | [`docs/chapters/ch00-環境建置.md`](docs/chapters/ch00-環境建置.md) |
| Ch1 — Schema 設計與第一次 migration | [`docs/chapters/ch01-schema設計與第一次migration.md`](docs/chapters/ch01-schema設計與第一次migration.md) |
| Ch2 — 第一個 CRUD 與測試資料庫隔離 | [`docs/chapters/ch02-第一個CRUD與測試資料庫隔離.md`](docs/chapters/ch02-第一個CRUD與測試資料庫隔離.md) |
| Ch3 — 巢狀資源與關聯查詢 | [`docs/chapters/ch03-巢狀資源與關聯查詢.md`](docs/chapters/ch03-巢狀資源與關聯查詢.md) |
| Ch4 — 分頁、排序、篩選 | [`docs/chapters/ch04-分頁排序與篩選.md`](docs/chapters/ch04-分頁排序與篩選.md) |
| Ch5 — 提交與查詢作答 | [`docs/chapters/ch05-提交與查詢作答.md`](docs/chapters/ch05-提交與查詢作答.md) |
| Ch6 — 統一錯誤處理與回應格式（進行中） | [`docs/chapters/ch06-統一錯誤處理與回應格式.md`](docs/chapters/ch06-統一錯誤處理與回應格式.md) |

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束、索引、**交易** —— 不含 Prisma 語法 |
| [`docs/Prisma速查.md`](docs/Prisma速查.md) | 每支方法收哪些參數、`data` / `where` / `include` 能帶什麼、參數對應到什麼 SQL |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
