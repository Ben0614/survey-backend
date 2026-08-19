# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0 ~ Ch4 全部完成。
`pnpm test:e2e` **52 passed**、`pnpm test` **4 passed**、`tsc --noEmit` 0 errors、`lint` 0 problems。
下一步是 **Ch5（提交與查詢作答）**，起手式寫在下方「Ch5 接續點」。

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

---

### Ch5 接續點（2026-08-18）

**目前狀態**：`pnpm test:e2e` **52 passed**、`pnpm test` **4 passed**、
`tsc --noEmit` 0 errors、`eslint` 0 problems。**Ch4 三段全部完成**、註解與文件已收尾。

Ch4 的觀念、取捨、15 條坑、三批 SQL 觀察與三批作業在
[`ch04`](docs/chapters/ch04-分頁排序與篩選.md)，**這裡不重複**。

#### 進 Ch5 之前先確認的兩件事

1. **Ch4 的程式碼讀得懂嗎。** 最值得自己講一遍的三處：
   - `@Type(() => Number)` 用在 `page` 沒問題、`@Type(() => Boolean)` 用在
     `includeQuestions` 卻會壞，**為什麼**（提示：哪一個有「失敗」的值）
   - `where` 為什麼抽成變數，而 `include` 為什麼不用（一個是「兩處必須一致」，
     一個是「有沒有這個參數」）
   - `orderBy` 的動態 key 為什麼 `tsc` 檢查不到，而同一支方法裡的 `where` 檢查得到
2. **`ch04` 三批作業各挑一題實跑** —— 第一段第 1 題、第二段第 3 題、第三段第 5 題。
   三題分別是「測試存在不等於蓋到」「`tsc` 綠不代表對」「whitelist 讓舊參數安靜失效」
   的現場，都是**推論不出來、要跑才知道**的那種。

#### Ch5 的範圍：提交與查詢作答（Responses）

這是整個專案**第一次寫入多張表**，也是 `Survey.status` 那條規則真正生效的地方。

| 端點 | 做什麼 |
| --- | --- |
| `POST /surveys/:surveyId/responses` | 提交一份作答（一筆 `Response` + N 筆 `Answer`）|
| `GET /surveys/:surveyId/responses` | 看這份問卷的所有作答 |
| `GET /responses/:id` | 看單一份作答 |

**五個要點：**

1. **第三條商業規則進 `survey.rules.ts`：只有 `PUBLISHED` 的問卷能被填答。**
   純判斷、不碰資料庫，所以是專案第三支單元測試（前兩支是 `canEditQuestions`
   與 `canUnpublish`）。**寫規則的當下就要寫那條 e2e** —— Ch3 坑「查錯欄位」
   就是規則寫了卻從來不生效，而唯一的偵測器是那條沒寫的測試。
2. **原子性第一次真的用到。** 一筆 `Response` + N 筆 `Answer` 要嘛全寫、要嘛全不寫 ——
   寫到一半失敗會留下一份沒有答案的作答紀錄。這是 `$transaction` 的**另一面**：
   Ch4 用的是「一致的讀取視角」（兩句 SELECT），Ch5 用的是「全有或全無」。
   （交易本身寫在 [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) 第 7 節。）
3. **巢狀 write vs `$transaction` 要做一次對比。** Prisma 的巢狀 create
   （`data: { surveyId, answers: { create: [...] } }`）本身就是一個交易，
   不必自己包 —— 那什麼時候才需要 `$transaction`？判準是「**中間有沒有需要程式判斷的步驟**」。
4. **驗證會比前幾章難一級。** body 是一個陣列（`answers`），要驗
   `@ValidateNested({ each: true })` + `@Type(() => AnswerDto)` ——
   **`@Type` 在這裡是「建成哪個 class 的實例」的原意**，不是 Ch4 那種 primitive 轉型。
   另外「送來的 `questionId` 真的屬於這份問卷嗎」是**驗證裝飾器管不到的**，
   那是 service 的事（跨表檢查）。
5. **`Answer` 是專案裡唯一沒有直接掛在 `Survey` 上的表**（見 Ch2 的 cascade 測試）。
   查詢作答時要想清楚 `include` 要帶幾層、會變成幾句 SQL —— **打開 query log 看**。

#### 現成可用的工具

- **`PRISMA_LOG_QUERIES=1`** —— Ch5 要看的是「巢狀 create 產生幾句 SQL、有沒有 `BEGIN`/`COMMIT`」，
  以及查詢作答時多層 `include` 的成本。PowerShell 是 `$env:PRISMA_LOG_QUERIES=1; pnpm start:dev`。
  **注意 log 印的是 `$1` 佔位符不是值**（`ch04` 坑 #7）；想看到值要把
  `prisma.service.ts` 的 `log: ['query']` 改成事件形式才有 `e.params`（一直還沒做）
- **`api.http`** 已經有 Surveys / 分頁 / 排序篩選 / include / Questions 五整組請求，往下加
- **`src/questions/`** 是最接近的參考：巢狀路由（`survey-questions.controller.ts`）
  與扁平路由（`questions.controller.ts`）拆兩個 controller 的理由、
  以及 `assertExists` 怎麼處理「父資源存不存在」
- **`docs/專案速查.md` 的「什麼時候用 API、什麼時候用 Prisma」** —— 寫 e2e 卡住時看這裡

#### 工作方式（沿用，實際付出代價換來的）

- **教練模式**：實作自己寫，教練 review 並負責 `[教學]` 註解與文件
- **review 只講會影響行為的事。** 註解過期、命名、文件同步不在實作過程中提 ——
  那是收尾時統一處理的工作（2026-08-15 修正，已寫進 `CLAUDE.md`）
- 一次做完一件事：service → controller → E2E → **跑測試**
- **每寫一條測試就跑一次**，不要一口氣寫完才跑
- 貼上測試的當下核對**動詞與路徑**跟 `describe` 一致（這個坑踩過五次，
  第五次錯在**名字**：兩條測試同名，其中一條的名字描述的是別條在做的事）
- **測試名稱要說「驗什麼」不是「測哪個功能」** —— 失敗時它是唯一的線索。
  **名稱由教練先給**：要寫幾條就給幾條、含所屬 `describe`、可直接貼上
  （2026-08-16 加的分工，已寫進 `CLAUDE.md`）
- **每一輪開工前教練先給一份指引**：逐檔案列出要改什麼（不給實作）、每個決定附
  「為什麼」並指回學過的地方、把最容易錯的那點標成重點並說清楚錯了長什麼樣、
  留一兩個自己想的提示、最後才給測試名稱
  （2026-08-18 由使用者確認有效後寫進 `CLAUDE.md`，五個要素在那裡）
- **一輪只做一個能獨立驗收的主題。** 判準：兩件事會不會在同一條測試裡同時失敗？會，就拆
- **新加的功能要問一次「有測試蓋到嗎」。** 既有測試全綠只證明沒弄壞舊行為
- 新檔案要接進閱讀動線（改前一站的「下一站」），別讓鏈斷掉。
  目前終點是 `src/surveys/survey.rules.spec.ts`
- **import 路徑一律用相對路徑、不帶副檔名**，看到開頭是 `src/` 或結尾是 `.js` 直接改掉
  （`tsc` 不會抓絕對路徑那種；判準見 `CLAUDE.md` 的「import 路徑的寫法」）
- **query 參數改名時要全域搜一次那個字串** —— `whitelist` 會讓舊名字**安靜失效**
  而不是報錯，測試照樣綠（Ch4 ③ 坑 #14）
- 丟給教練 review 之前先自己跑四項驗收：
  `pnpm test`、`pnpm test:e2e`、`pnpm exec tsc --noEmit`、`pnpm lint`

> **換機器後 `.env.test` 不存在，測試會直接失敗**（防呆刻意如此）。
> 重建步驟見 [`docs/專案速查.md`](docs/專案速查.md) 的「換機接續」。
> `src/generated/` 也不進版控，記得 `pnpm exec prisma generate`。

> **加分項（非前提）：** 讀 NestJS 官方文件 Overview 前四篇
> （First steps / Controllers / Providers / Modules，約一小時）。內容與閱讀動線上的
> `src/` 檔案一一對應，等於同一件事的第二個講法。
> Prisma 則不要上網找教學：v7 太新，網路上九成是 v5/v6，會是負收益；用 `.agents/skills/` 的官方技能包。

> 如果卡住的是 TypeScript 本身（型別註記、interface、async/await、泛型），那要先處理那一層 ——
> NestJS 與 Prisma 都站在它上面。

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
| Ch5 | 提交與查詢作答（Responses） | 巢狀 write vs `$transaction`、原子性、**商業規則與單元測試** | ⬜ |
| Ch6 | 統一錯誤處理與回應格式 | Exception Filter 把 Prisma 錯誤碼轉 HTTP | ⬜ |
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

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束、索引、**交易** —— 不含 Prisma 語法 |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
