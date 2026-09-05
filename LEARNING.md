# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 **Nuxt 4 + Vuetify**。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

> **⚠️ 教練模式只適用後端（Ch0–Ch12，以及階段三回頭改後端的部分）。**
> 階段三的前端程式碼**由 AI 直接寫** —— 使用者本身是前端工程師，那部分沒有學習目標。
> 這是 2026-09-03 第三次課綱修訂的決定，理由見下方「課綱修訂紀錄」。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0 ~ Ch13 完成。**階段三只剩 Ch14 ~ Ch17。**
線上位址 `https://survey-backend-0dku.onrender.com`（Render 免費方案 + Neon 的 `production` branch）。
`pnpm test:e2e` **133 passed**、`pnpm test` **11 passed**、`tsc --noEmit` 0 errors、`lint` 0 problems。

下一步是 **Ch14（認證串接：CORS 與 401 的一致性）**，接續點在下方「**Ch14 接續點**」。

**⚠️ Ch13 起換一個 repo。** 前端是獨立的 **Nuxt 4** 專案（`survey-frontend`），
跟這個並排放在 `Desktop/train/survey/` 底下，不是這個目錄的子資料夾。
**後端從這裡開始只會因為「前端串接時發現契約不夠用」而被回頭改** ——
而那正是階段三每一章的驗收標準。

**2026-09-03 —— 線上 API 已經上鎖。** Ch10 之前任何人都能對線上服務讀寫刪，
現在除了 `/health`、註冊、登入之外每一支端點都要帶 JWT。`/docs` 仍然公開，
但那**現在是一個重新評估過的決定**（理由見 `ch10`），不再是「反正門本來就開著」。

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
兩個 commit：`afd1cc2`（questions module）、`4fa0b5d`（`maxWorkers` 修正）。

最有價值的一次意外：拔掉 `@IsEnum` 想看「資料庫的 enum 會不會擋」，結果**根本沒到資料庫** ——
`whitelist: true` 判斷的是「屬性有沒有驗證裝飾器」，`type` 少了裝飾器就被整個丟掉，
`prisma.create` 收到 `undefined` 直接炸。**TypeScript 的 `type: QuestionType` 宣告
對 `whitelist` 毫無意義，它只認裝飾器。** 這是 Ch2 坑 #5 的現場重演。

另一個是 `maxWorkers`：Ch2 建的測試隔離只擋了「測試 vs 開發」，
第二個會清資料庫的 e2e 檔一出現就穿幫了。**隔離做得夠不夠，要等第二個參與者出現才知道。**

**2026-08-12 —— Ch3 第一段完成（`PATCH` / `DELETE` / `include`），並把債補完。**
四個 commit：`cf270d1`（PATCH）、`0abfcc5`（DELETE）、`9c3e0cd`（include）、
`732c112`（教學註解＋閱讀動線＋修過期註解＋`api.http`）。**30 passed。**

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
commit `1787548`。加了 `PRISMA_LOG_QUERIES` 開關（預設關），其餘全是觀察：

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

**2026-08-13 —— Ch3 完成。** commit `4b07e74`（實作）＋文件。
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

另外統一了 import 路徑（commit `572e7d1`）：相對路徑一律不帶副檔名。
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
中途另外把 [`docs/Prisma速查.md`](docs/Prisma速查.md) 補了出來（commit `f0f9ee0`）——
起因是實作時卡在「`create` 的 `data` 到底可以帶什麼」，那是跨章節的問題。

**2026-08-22 —— Ch6 輪 1 完成，並把纏了兩章的環境問題連根修掉。**
兩個 commit：`38f1c2c`（環境）、`75855d3`（輪 1）。`74 passed`（+5）。

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

**2026-08-24 —— Ch6 輪 2 完成，並且第一次在教練模式下明確承認「這章寫不出來」。**
`79 passed`（+5）、`pnpm test` 仍 `6 passed`、`tsc --noEmit` 0 errors、`lint` 0 problems。

輪 2 讓 filter 認得 `P2025`/`P2002`/`P2003`，翻成 404/409/400 而不是 500。
但這一輪跟前五章的最大差別是：**使用者第一次完全寫不出東西** —— 前幾章至少都能先寫出一版再 review。

診斷出三個原因，寫進了 `ch06` 坑 #6：

1. **輪 2 一次塞了六個新東西**（`instanceof` 型別收窄、`Record` 查表、三支分支的順序、
   mock、`overrideProvider`、`useLogger`），違反專案自己「一輪一個主題」的規則 ——
   而且這條判準要等紅燈才看得出來，太晚。**新判準：數一數這一輪有幾個沒見過的東西，
   超過兩個就拆**（開工前就能用）。
2. **這一章沒有第二個範例可對照。** `AllExceptionsFilter` 全專案只有一支，
   拿不到「同一條規則的第二次現場」——那正是這個專案讓人學會東西的主要機制。
3. **這一章的主題本身就是「沒有症狀的錯誤」。** 前幾章寫錯了 tsc/測試/API 會有動靜，
   這一章最容易錯的兩點（未知碼跳過 log、鴨子型別誤判）寫錯了什麼都不會發生。

因此**這一章的驗收標準改了**：不是「能不能從零寫出一支 filter」，是「看得懂、
說得出它會怎麼壞」。作業題型跟著改成「看程式碼說症狀」，五題全部實跑出答案，
其中第 3 題**推翻了教練原本的講法**（鴨子型別在這裡實測是全綠的，`instanceof`
真正該用的理由是型別而不是防誤判）——這是「先給結論、沒有先量」的第八次。

新增跨章節文件 [`docs/錯誤處理與狀態碼.md`](docs/錯誤處理與狀態碼.md)：
例外從 `throw` 到前端的完整路徑、`HttpStatus` 實際會用到的九個值、
400/404/409 的判準、Prisma 錯誤碼的分區與陷阱（`PrismaClientValidationError`
沒有 `code`——Ch4 那個「每次都 500」的 bug 丟的正是它）。

事後又追加三題問答補講（`logger.error` 只影響 log 不影響回應、鴨子型別誤判的
具體反例、三條分支 `message` 各自何時被賦值），整理進 `ch06` 的「輪 2 後追加問答」。

**輪 3 收尾**（同一天做完）：`all-exceptions-filters.ts` 依 Nest 慣例改名成
`all-exceptions.filter.ts`；`questions.service.ts` / `responses.service.ts`
裡「Prisma 丟 P2025/P2002 → 500」的過期註解已更新，補上「現在有安全網了，
但安全網不能取代主要防線」；`docs/Prisma速查.md` 第 7 節拿掉「尚未實作」。

Ch6 的完整觀念、取捨、6 條坑（含新增的坑 #6）、追加問答與五題實測作業都在
[`ch06`](docs/chapters/ch06-統一錯誤處理與回應格式.md)，這裡不重複。

---

**2026-08-28 —— Ch7 完成。** `84 passed`（+5）、`pnpm test` 仍 `6 passed`。
15 支端點全部進了契約：請求端、成功回應、錯誤回應，外加一條會紅燈的 e2e。

這一章跟前七章有一個結構性差別：**它產出的東西不會改變任何行為。**
把全部 `@Api*` 裝飾器刪光，15 支端點的回應一個位元組都不會變 ——
所以這一章的每一個錯誤都**沒有症狀**。輪 ④ 那條測試就是為此存在的。

最貴的六課：

1. **陣列的元素型別推不出來時，Swagger 會「猜」而不是留白。** `answers: AnswerDto[]`
   沒寫 `type: [AnswerDto]` → spec 說它是 `string[]`，前端照著送會 400 而文件說它對。
   而隔壁 `options: string[]` 同樣沒寫卻是對的 —— **它猜對了**。
   同一個疏漏、同一份 spec，一個碰巧正確、一個安靜地說謊，`/docs` 上兩個看起來一樣。
2. **`enum: [SurveyStatus]` 的方括號 —— 寫錯一處、spec 錯兩處。**
   合法值清單裡變成一個物件，而且 `type` 連帶被推成 `number`。
   同一個方括號在 `type:` 上代表「陣列」、在 `enum:` 上代表「清單本身」。
   使用者在 `sort` 寫對、在 `status` 寫錯，兩行相距不到 30 行 ——
   差別是傳變數的時候，「這個參數要的是清單」從眼前消失了。
3. **第二份真相：三次抄錯，三次 `tsc` 都是 0 errors。**
   `Question.order`（`Int`）被抄成 `'asc' | 'desc'`、`Answer.responseId` 被抄成 `Date`、
   分頁 `meta` 被標成陣列。entity 跟 service 的回傳值之間**沒有任何型別關係**，
   所以編譯器永遠不會知道。唯一的偵測器是那條 e2e。
4. **「借來的 404」——漏標的四支形狀完全一致。** 它們的 404 不是自己丟的，
   是 `await this.surveysService.assertExists(surveyId)` 借來的，
   在自己的檔案裡搜 `throw new NotFoundException` 找不到。
   其中最貴的是 `POST /surveys/:surveyId/responses` 漏掉的 **409**（問卷未發布不能填）——
   那是 Ch5 整章的核心商業規則，**寫在 service 裡三章了，
   只有寫進 `@ApiConflictResponse` 的那一刻，前端才知道它存在。**
5. **規則有效，但使用時機錯了。** 「query DTO 裡搜到 `@ApiProperty(` 就是錯的」
   這條結構性對策事先給了，10 個屬性仍然 10/10 全錯 ——
   因為它被當成「寫的當下要想起來」的規則在用。**它是收工前 grep 一次的規則**，
   成本三秒、命中率百分之百。
6. **教練第九次「先給結論、沒有先量」，而且方向相反。**
   說「CLI plugin 只看 TS 型別、不看 `@IsIn`」，探針直接推翻：
   把型別改成 `string`、只留 `@IsIn`，`enum` 照樣出現。
   plugin 讀 class-validator 讀得比預期多得多（`@Min`/`@Max`/`@ArrayNotEmpty` 都讀）。
   結論方向對（不建議開），機制講錯了。

**不開 CLI plugin 的真正理由**是第四個探針量出來的：
`nest build` 與 ts-jest 產出的 spec **不一樣**（`minimum` 只有前者有）。
開了之後，那條「文件有沒有說謊」的測試會在一份不是線上那份的 spec 上驗證。
真實專案的作法是「開 plugin，並讓 jest 也跑同一個 transformer」——**知道往哪走就夠了**。

**已知的債（寫進 ch07，不假裝蓋滿了）**：那五條測試只保護了 6 個 entity 裡的 2 個。
`meta` 標成陣列、`@ApiCreatedResponse` 標成 `@ApiOkResponse`、`QuestionEntity` 少一個欄位 ——
三種放回去都是 **84 條全綠**。

觀念、取捨、9 條坑、四個探針與五題**實測**作業都在
[`ch07`](docs/chapters/ch07-swagger-api文件.md)，這裡不重複。

---

**2026-08-31 —— Ch8 完成，階段一結束，後端上線。**
測試數字不變（`84 passed` / `6 passed`）—— **這一章沒有寫任何一條測試，也沒有任何行為改變。**
四輪：production build、`migrate deploy` 與正式資料庫、Render 上線、連線數量測。

這一章跟前八章的結構性差別是：**沒有 e2e 綠燈可以當驗收。** 84 條測試跑的是
ts-jest 直接載入的 `AppModule`，跟 `nest build` 的產物、跟線上那台機器都是不同的路徑，
所以「建置產物對不對」「線上連得到資料庫嗎」它們一條都保護不到。驗收全是手動的。

最貴的五課：

1. **本機 build 綠燈對線上幾乎沒有保證。** `/src/generated` 在 `.gitignore` 裡，
   Prisma Client 是**產物**；平台 clone 的是乾淨的 repo，那個資料夾根本不存在，
   `nest build` 會以 `TS2307` 掛在**建置階段**。而這件事在本機怎麼試都是綠的。
   解法是 `prebuild` 鉤子 —— 讓「build 前一定有最新的 client」變成結構上不可能忘記。
   這是 2026-08-09 換機那次的第二次現場，根因一模一樣。
2. **假綠的第十種：驗收對象是上一次的建置產物。** `nest build` 不清空 `dist/`、
   `node` 又早把檔案載進記憶體，於是「build 掛掉 → `dist/main.js` 還在 → `/health` 回 200」
   整條路成立。證據是 `dist/` 裡同時有兩次 build 的產物。
   **前九種假綠都出在測試或程式碼本身，這次是驗收的對象錯了。**
3. **不要用「改資料夾名字」模擬「資料夾不存在」。** VS Code 把它當成重構，
   16 行 import、14 個檔案一起被改掉。`rm -rf` 就好，`prisma generate` 一秒重建。
4. **兩個機制都能解釋同一個觀測結果時，那個觀測就不是證據。**
   `app.enableShutdownHooks()` 的效果在這個組合下**觀測不到** ——
   `pg` 閒置 10 秒關連線、Neon 免費方案 compute 會 autosuspend，兩者都會搶先把連線收走。
   所以「重啟後連線沒累積」不能當成它有效的證據。**這一章沒有假裝驗證過它**（同 Ch5「症狀減輕不等於找到原因」）。
5. **教練第十一次「先給結論、沒有先量」，這次自己在同一輪內推翻。**
   先建議把 Health Check Path 設成 `/health`，算完 CU-hours 才發現會害 Neon 永遠不休眠
   （100 CU-hours/月，`0.25 × 730 ≈ 182`，額度撐不到月底）。
   對照組是同一輪的另一個問題：`prisma` 在 `devDependencies` 裡會不會被跳過 ——
   那次**沒有猜，直接讓部署當探針**，幾分鐘換到確定的答案。

量到的三個數字：`max_connections` **901**；持續 12 條並發時 `pg_stat_activity`
只有 **7 條**、`application_name` 是 **`pgbouncer`**（所以那張表看到的不是應用開的連線，
是中間那層開的）；熱狀態下台灣打到 Render 新加坡往返 **0.16 ~ 0.22 秒**（五次取樣）。
**冷啟動沒量到** —— 量的時候服務剛好還醒著，沒有硬等它休眠。

兩個刻意的「不做」，都有數字撐著：正式環境**不設 `DATABASE_POOL_MAX`**（離 901 遠得看不到）、
**不設 Health Check Path**（見第 5 點）。

另外收尾時抓到 `docs/專案速查.md` 換機驗收那一節的數字停在 **`4 / 36 passed`**，
過期了四章半 —— 而那一節的用途正是「數字對不上就別開始寫程式」。

觀念、取捨、5 條坑與五題作業都在
[`ch08`](docs/chapters/ch08-第一次部署.md)，這裡不重複。
部署設定值、線上網址、連線的三段結構寫在
[`docs/專案速查.md`](docs/專案速查.md) 的「部署與正式環境」（那份反映現況，隨時更新）。

**現狀要記住的一件事**：這個 API **完全沒有認證**，而它現在在公開網址上 ——
任何人都能建立、修改、刪除問卷與作答。這正是階段二存在的理由。
**Ch10 的 AuthGuard 上線之前，不要把網址貼到公開的地方。**

---

**2026-09-01 —— Ch9 完成。** `95 passed`（+11）、`pnpm test` 仍 `6 passed`。
四輪：`User` model、註冊、登入、`Survey.ownerId`。這是專案第一次處理**機密資料**。

**這一章做完，登入仍然不會有任何效果** —— 沒有 token、沒有 session。
真正讓它有用的是 Ch10。這一章驗證的只有「密碼比對這段邏輯是對的」。

最貴的六課：

1. **「預設拒絕」比「逐一排除」可靠。** `passwordHash` 擋在 `PrismaService` 的全域 `omit`
   而不是每支查詢各寫一次 `select` —— 後者要在 N 個查詢點各對一次，漏一處的症狀是
   雜湊出現在 API 回應裡，而 tsc 綠、測試綠、`/docs` 看起來也正常。
   代價要記住：**之後新增的欄位預設會被送出去**，所以機密欄位一律加進那一層。
2. **`prisma migrate status` 說 `up to date` 不代表資料庫跟 schema 一致。**
   輪 4 把 `onDelete` 改成 `SetNull` 卻沒重新產生 migration，資料庫的外鍵其實還是
   `CASCADE` —— 而 `Question`/`Response`/`Answer` 對 `Survey` 都是 Cascade，
   **刪一個帳號會把所有人填的作答一起帶走**。`migrate status` 只比對「資料夾 vs 已套用清單」，
   唯一抓得到的是 **`prisma migrate diff`**。
   判準：**`schema.prisma` 不是資料庫的真相，`prisma/migrations/` 才是。**
3. **`migrate dev` 不會順帶 `generate`，而 `tsc` 是綠的**（輪 1、輪 4 各一次）。
   還沒有程式碼用到新 model／欄位時，client 有沒有跟上對 `tsc` 完全沒差。
   **改完 schema 直接查產物**：`ls src/generated/prisma/models/`。
4. **三條 branch 裡只有 test 要手動套用 migration**，而忘記的症狀有誤導性：
   e2e 突然 500、訊息是 `The table public.User does not exist` 且指著剛寫的 service。
   因此多了一支 `pnpm migrate:test` —— 靠結構，不靠紀律。
5. **`NOT NULL` 加不上去是資料逼的，不是風格選擇。** 當時有 9 份問卷、0 個使用者，
   而 `ownerId` 有外鍵約束 —— 沒有任何合法的值可以回填。真實專案的標準解是
   三步 migration（先 nullable → 回填 → 再改 `NOT NULL`），這裡連可回填的值都還不存在。
6. **規則存在、但沒被放進逐檔案清單，等於沒有。** `src/auth/` 六個檔案加測試檔的
   `[教學]` 檔頭全部是收尾才補的，動線斷了三輪 —— 因為開工指引裡沒有把「寫檔頭」
   列進「這一輪要改什麼」。這是 Ch7 坑 #5 的同一個形狀：**規則有效，但使用時機錯了。**

安全相關的兩個決定寫在 [`ch09`](docs/chapters/ch09-認證基礎.md)：登入的兩條失敗路徑
用同一句訊息（user enumeration），以及**時間差刻意沒有處理** —— 知道洞在哪，
而不是以為補好了。

觀念、取捨、6 條坑與五題作業都在 [`ch09`](docs/chapters/ch09-認證基礎.md)，這裡不重複。
狀態碼「一個名字三種包裝」的完整對照表補進了
[`docs/錯誤處理與狀態碼.md`](docs/錯誤處理與狀態碼.md)；
`migrate` 與 `generate` 的分工、`migrate diff` 抓漂移、nullable vs optional
補進了 [`docs/Prisma速查.md`](docs/Prisma速查.md)。

---

### Ch10 完成（2026-09-03）—— 三輪

**輪 1** 簽出 token（`login` 回應從 `UserEntity` 改成 `{ accessToken }`），
**輪 2** 全域 AuthGuard 與 `@Public()`（80 條既有 e2e 一度全紅），
**輪 3** `@CurrentUser()`、`ownerId` 終於有值、`GET /auth/me`。

這一章有一個貫穿全部三輪的主題：**看得到內容 ≠ 內容可信**。
JWT 的 payload 是 base64 不是加密，所以 `decode` 拿得到裡面每一個字 ——
正因為它不需要 secret，它也不可能知道那張票是不是你簽的。
guard 裡把 `verifyAsync` 寫成 `decode` 的話認證等於不存在，
而 tsc、lint、110 條測試、手動打 API **全部正常**。
抓得到它的只有一條刻意送假票的測試。

七條坑裡最值得先看的三條（完整版在 [`ch10`](docs/chapters/ch10-JWT與全域AuthGuard.md)）：

1. **`signAsync` 漏了 `await`**，回應是 `{"accessToken":{}}`，而
   `no-floating-promises` 抓不到（有指派也有 return，不算浮空）。
   更要記的是**比對欄位集合的那條測試也抓不到** —— key 仍然只有 `accessToken`。
   **「形狀對」和「值對」是兩條測試，一條蓋不了另一條。**
2. **語法錯誤讓 `tsc` 不報型別錯誤。** 測試檔裡的 `...` 佔位符讓整輪的語意檢查停擺，
   `auth.controller.ts` 少傳一個參數（TS2554）完全沒被印出來。
   卡住時的招式：**`pnpm exec tsc --noEmit -p tsconfig.build.json`**，只看 `src`。
3. **`from 'src/auth/...'` —— `tsc` 綠、jest 整支跑不起來。**
   `CLAUDE.md` 早就寫了這條規則，這是它第一次真的發生。

還有一條不是這一章才有、但已經**第四次**出現的形狀：
**測試名稱與斷言對不上**，而每一次的成因都是「從隔壁複製一段結構正確的程式碼，
然後只改了一半」（Ch2 的動詞、輪 1 的變數名、輪 2 的兩條）。

實測確認的一件事：**`/docs` 不經過 Nest 的請求管線**（`SwaggerModule.setup`
直接跟 Express 註冊路由），所以 guard 攔不到它、也標不了 `@Public()`。
Ch8 留下的「`/docs` 要不要公開」因此變成一個真正的選擇，
**重新評估後仍然維持公開**，理由與代價寫在 `ch10`。

---

### Ch11 完成（2026-09-03）—— 兩輪

**輪 1** 讓 `role` 這個欄位存在並進得了 token，**輪 2** 讓 `@Roles()` + `RolesGuard`
去讀它並據此擋人。功能只有一句話：**只有 `ADMIN` 能刪問卷**。

這一章的主題是**裝飾器只是紙條，擋人的是讀紙條的那支 guard**。
`@Roles(Role.ADMIN)` 本身不會攔任何人 —— 只貼紙條卻忘了註冊 guard 的話，
效果是零，而且 tsc / lint / 既有測試全綠。

> **判準：新 guard 沒讓既有測試變紅，代表它根本沒生效。**

六條坑裡最值得先看的三條（完整版在 [`ch11`](docs/chapters/ch11-RBAC與角色權限.md)）：

1. **`roles.guard.ts` 整支複製了 `jwt-auth.guard.ts`** —— 「複製結構正確的程式碼、
   只改了一半」的**第五次**，前四次都是一行，這次是整個檔案。邏輯完全反過來
   （照抄 `@Public()` 的「有紙條就放行」），零保護，而 3 條既有的 DELETE 測試繼續綠。
2. **`code` 的合法值活在三個地方，兩份漂移了兩章。** Ch9 加 `UNAUTHORIZED`、
   Ch11 加 `FORBIDDEN`，兩次都只改了 filter。`error-response.entity.ts` 的註解
   本來寫著「刻意接受的第二份真相，**偵測器是 e2e**」—— 那句話是錯的，偵測器並不存在。
   **判準更新：「刻意接受第二份真相」的前提是有偵測器；沒有的話那不是取捨，是破口。**
3. **`import { PrismaClient } from '@prisma/client/extension'`** —— 它解析得到、
   但解析到**錯的東西**。實測寫 `p.user.update({ where: { emailTYPO }, ... })`
   和 `p.這個方法不存在()`，`tsc` 一句話都沒說。
   **比「解析不到」更陰險**：解析不到會有紅線（很吵），解析到錯的東西完全安靜。

另外記一個工具面的判準：`@typescript-eslint/...` 那一族的紅線是 **ESLint 行程**報的，
不是 TS server —— 重開 TS server 沒用，要 `ESLint: Restart ESLint Server`。
**看訊息的來源決定該重啟誰。**

---

### Ch12 完成（2026-09-03）—— 兩輪，階段二結束

**輪 1** 問卷自己的三支（`ownerId` 就在那筆資料上），**輪 2** 子資源五支
（題目三支 + 看填答結果兩支，都要**追溯**回問卷）。

`Survey.ownerId` 是 Ch10 輪 3 填進去的，**隔了兩章才第一次被讀** ——
當初那條「比對到 `sub` 而不是 `not.toBeNull()`」的測試守的就是這一刻。

三件值得記住的（完整版在 [`ch12`](docs/chapters/ch12-資源層授權.md)）：

1. **判斷放 service 不放 guard，因為 guard 看不到資料。** service 的 `assertExists`
   本來就在查那筆問卷，`select` 加一格 `ownerId` 就夠了 —— **整章零額外往返**。
   而那是因為 `assertCanManage` 收的是 `ownerId` 而不是 `surveyId`。
2. **授權要排在商業規則之前。** 反過來的話，不相干的人去改別人「已發布」問卷的題目
   會拿到 409「問卷已發布，無法修改題目」—— 洩漏了狀態，而且順序本身說錯了話。
   這個錯很難發現：改題目的正常測試一定用 DRAFT，剛好繞過那個分岔。
3. **前提資料造出了無主問卷。** 輪 1 上線後 6 條測試同時 403，而程式碼是對的 ——
   `prisma.survey.create` 不填 `ownerId`（填它的是 `POST /surveys`）。
   **那個紅燈是好消息**：寫成 `if (ownerId && ownerId !== user.id)` 的話它們會全綠，
   而 `&&` 在 `null` 短路 → 任何人都能改無主問卷。順帶修好三條假綠。

還有一件跨章的事：**`survey.rules.ts` 的檔頭從 Ch5 到 Ch12 一直寫著「兩條商業規則」**，
而 `canSubmitResponse` 是 Ch5 加的 —— 漏了七章。同一句話也錯在 `CLAUDE.md`、
`LEARNING.md` 的「貫穿全程的商業規則」、`src/swagger.ts` 的 `/docs` 說明，
四個地方一起修好了。**加函式時回頭看一眼同一個檔案最上面的檔頭。**

---

### Ch14 接續點（2026-09-05）

**目前狀態**：`pnpm test:e2e` **133 passed**、`pnpm test` **11 passed**、
`tsc --noEmit` 0 errors、`eslint` 0 problems。**Ch0 ~ Ch13 完成。**

> **這一階段跟前面十二章有兩層不一樣**：
> 1. 程式碼寫在**另一個 repo**（獨立的 Nuxt 4 專案）
> 2. **那些程式碼由 AI 寫，不走教練模式** —— 每一章的驗收標準是**後端的交付物**
>
> 這一節記的是「**後端留下了什麼給前端**」、以及回頭改後端時要注意什麼。

#### Ch13 做完了什麼

**前端**（AI 寫的，在 `survey-frontend`）：Nuxt 4.5.2 + `openapi-typescript` 7.13，
`pnpm gen:api` 從 `/docs-json` 產出 `app/model/api/schema.d.ts`（**進版控**，是契約的快照），
`app/model/api/contract-check.ts` 是編譯期的契約斷言、不發請求。
⚠️ Vuetify / Pinia / `useMyService` / `app/api/*.ts` **刻意還沒裝** ——
它們的第一個真實用途在 Ch14 的 `/login` 頁。

**後端**（教練模式，兩輪）：

- **輪 ①** `SurveyEntity.ownerId` 補 `type: String`、`QuestionEntity.order` 拿掉
  不成立的 `default: 0`；抽出 `test/helpers/expect-schema-matches.ts`，
  一致性測試從 2 條變 7 條（126 → 131）
- **輪 ②** 新增 `@ApiAuthenticated()`（`applyDecorators`），5 個 controller
  一行換一行；契約裡有 401 的端點從 2 支變 16 支（131 → 133）

完整記錄見 [`ch13`](docs/chapters/ch13-契約驗收.md)。**一句話的收穫：兩種錯要兩種偵測器**
—— e2e 抓「key 集合漂移」，前端 `pnpm typecheck` 抓「型別標錯」，兩邊漏掉的不重疊。

#### 型別產出實況（實測，Ch13 收尾時的狀態）

| 標的 | 產出來 | |
| --- | --- | :---: |
| `date-time` | `createdAt: string` | ✅ |
| `enum` | `status: "DRAFT" \| "PUBLISHED"`、`code: "BAD_REQUEST" \| ...` | ✅ |
| `optional` | `questions?: QuestionEntity[]` | ✅ |
| 巢狀 `$ref` | `answers: AnswerEntity[]`、`answer.question: QuestionEntity` | ✅ |
| `nullable` | `ownerId: string \| null` | ✅（輪 ① 修好，修之前是 `Record<string, never>`） |
| 401 的 body | 16 支端點各一個 `ErrorResponseEntity` | ✅（輪 ② 補上） |

**前端 `pnpm typecheck` 現在是綠的（exit 0）。** 它從 Ch13 開工到輪 ① 結束之前
刻意紅著一條，那條紅字就是 `ownerId`。

#### Ch14 的起點

主題是**認證串接**，驗收標準見進度表。三件事已經知道了：

1. **CORS 一定要加** —— 見下方「後端還沒完」。這是 Ch14 的第一件事，
   而且是前端發出第一個真請求的前提。
2. **401 的三種來源對前端是否真的一致** —— `/auth/me` 的沒帶票／票無效／
   那個人已被刪，對外一模一樣（`ch10` 的決定）。串接時要確認前端真的不必分辨。
3. **`/auth/me` 夠不夠用** —— `login` 只回 `{ accessToken }`，
   reload 之後要靠它拿回 `id / email / role`。

#### 兩個 repo 怎麼分工（2026-09-03 定的）

```
Desktop/train/survey/
├── survey-backend/     ← 這個 repo（獨立的 GitHub repo，Render 接它的 main）
└── survey-frontend/    ← 新的、也是獨立的 GitHub repo，只放程式碼
```

`survey/` 本身**不要 `git init`** —— 兩個獨立 repo 並排，不要巢狀。

**session 開在 `survey/` 這一層**，不是任一個子資料夾。理由是 Ch13 的第一件事
（跑後端 → 讀 `/docs-json` → 在前端產型別）本來就橫跨兩個 repo，
之後「串接時發現契約不夠用、回頭改後端」也是同一件事的兩半。

**學習紀錄全部留在後端**：`LEARNING.md` 與 `docs/chapters/ch00`～`ch17` 都在
`survey-backend/`，不搬。理由是 `CLAUDE.md` 那條「`LEARNING.md` 是唯一的進度與範圍來源」
—— 拆成兩份，「現在到哪一章」就要看兩個地方。前端 repo 只放程式碼與它自己的
`CLAUDE.md`（Vue / Nuxt 的慣例），共用的教學慣例指回後端這一份。

⚠️ **搬資料夾會孤立現有的對話紀錄**：`~/.claude/projects/` 是用**絕對路徑當 key** 的，
路徑一變，舊的 transcript 就 `--resume` 不到了。這個代價本來就在這份文件的第一段
講過 —— 真正的紀錄是 `LEARNING.md` 與 `docs/`，它們跟著 git 走。

⚠️ **兩個 repo 的 commit 絕對不能混**：Render 接的是 `survey-backend` 的 `main`，
推錯地方會觸發不該有的部署。在 `survey/` 這一層打 `git status` 是沒有 repo 的，
每個 git 指令都要先進到子資料夾。

#### 後端交給前端的三樣東西

| | 在哪 | 給前端做什麼 |
| --- | --- | --- |
| **OpenAPI 規格** | `https://survey-backend-0dku.onrender.com/docs-json`（線上）<br>`http://localhost:3100/docs-json`（本機） | Ch13 用 `openapi-typescript` 產型別。**這是 Ch7 投資的兌現點** |
| **錯誤格式** | 所有端點都是 `{ error: { code, message, details? } }` | 用 `code` 分支，**不要解析 `message`** |
| **認證方式** | `Authorization: Bearer <token>`，token 從 `POST /auth/login` 拿 | 見下面那張表 |

#### 前端一定會撞到的四件事

1. **token 一小時過期，而且不會自動延長**（`exp` 是簽發當下算好的）。
   沒有 refresh token —— 過期就重新登入。Ch14 要處理「使用者填到一半被踢出去」。
2. **401 是唯一有通用處置的狀態碼**：清掉 token、導去登入頁。
   而 `/auth/me` 的三種失敗（沒帶票／票無效／那個人已被刪）**對外一模一樣**，
   前端不必分辨。
3. **403 有兩種來源**，但對外也一樣（`code` 都是 `FORBIDDEN`）：
   角色不足（刪問卷要 `ADMIN`）、不是你的資源（改別人的問卷）。
   前端顯示「權限不足」即可，不要試圖分辨。
4. **`GET /auth/me` 是還原身分的唯一入口**。`login` 只回 `{ accessToken }`，
   reload 之後前端手上只有 token，要靠它拿回 `id / email / role`。

#### 哪些端點不用登入

```
GET  /health
POST /auth/register
POST /auth/login
GET  /docs、/docs-json     ← 這兩支不經過 Nest 的管線，guard 攔不到（實測，見 ch10）
```

**其餘全部要帶 token**，而其中**九支**還要再過一關（見 `ch11` / `ch12`）：

- **8 支看擁有權**（`assertCanManage`）：`PATCH /surveys/:id`、`publish`、`unpublish`、
  題目三支、看填答結果兩支
- **1 支看角色**（`@Roles(Role.ADMIN)`）：`DELETE /surveys/:id`

數法見本節最後的「這些數字怎麼驗」。

#### 回頭改後端時

1. **一般的換機步驟**見 [`docs/專案速查.md`](docs/專案速查.md) 的「換機接續」。
2. **`.env` 與 `.env.test` 各需要一組 `JWT_SECRET` / `JWT_EXPIRES_IN`**，
   三個環境互不相同。⚠️ `getOrThrow` 只擋 undefined：寫成 `JWT_SECRET=`
   應用起得來、`/health` 綠，**只有登入會 500**。
3. **四項驗收**：`test:e2e` **133**、`test` **11**、`tsc` 0、`lint` 0。
4. **改了回應形狀就是改了契約** —— Ch13 之後前端的型別是從 `/docs-json` 產的，
   改一個欄位會讓前端編譯不過。這是好事（改壞了會有人叫），但要預期它。

#### 線上環境

| 項目 | 值 |
| --- | --- |
| 網址 | `https://survey-backend-0dku.onrender.com` |
| 平台 | Render 免費方案，Region Singapore，接 GitHub `main`（push 就自動重新部署） |
| 資料庫 | Neon 的 `production` branch |
| 環境變數 | `DATABASE_URL` + `JWT_SECRET` / `JWT_EXPIRES_IN` |
| `/docs` | 公開（Ch10 重新評估後維持，理由見 `ch10`） |
| 認證 | 除了上面那四支之外全部要帶 JWT |
| 授權 | 刪問卷要 `ADMIN`；改問卷／題目、看填答結果要**擁有者或 `ADMIN`**。線上還沒有任何 admin |
| ⚠️ CORS | **還沒設定**。Ch14 的第一件事 —— 前端跨網域打過來會被瀏覽器擋下 |

#### 後端還沒完 —— 前端一定會推著它改

前面十二章的驗收標準都是 e2e 綠燈，那證明了「**API 行為正確**」，
**沒有證明「這組 API 好不好串」**。Ch13–17 就是那個驗收。

**一定要改的：CORS。**

`src/` 裡沒有任何 `enableCors`。前端在 `localhost:3000`、後端在 `localhost:3100`，
是**不同的 origin**，所以前端第一次發請求就會被瀏覽器擋下。

症狀會騙人：Console 一片紅、`Failed to fetch`，看起來像後端壞了 ——
但你用 `curl` 或 `api.http` 打**完全正常**，因為那兩個不是瀏覽器、沒有同源政策。
Ch13 沒撞到它，因為 `gen:api` 是抓 `/docs-json` 這個檔案、不經瀏覽器。
**Ch14 的第一個真請求就會撞上**（`enableCors` 是那一章的驗收標準之一）。

**很可能要改的：`GET /surveys` 現在回所有人的問卷。**

```ts
const where = { status: query.status, title: { contains: query.q } };
//              ↑ 沒有任何 ownerId 條件
```

Ch12 只保護了「改」，**讀完全沒動** —— 所以任何登入的人都列得出別人的問卷，
連別人**還沒發布的草稿標題**都看得到。前端一做「我的問卷」列表就會需要它。

三種改法（加 `?mine=true`、預設只回自己的、或拆成兩支端點）**是一個設計題**，
不是補一行。順帶這也是一個溫和的資訊洩漏 —— 草稿標題本來不該給別人看。

**可能要改的：**

| | 什麼情況會需要 |
| --- | --- |
| entity 的型別標記 | Ch13 用 `openapi-typescript` 產型別時，`optional` / `required` 標錯會產出難用的型別。`ResponseEntity` 沒有一致性測試（Ch12 發現），最可能出問題 |
| `Response` 加提交者欄位 | 想做「我填過的問卷」就需要 —— 現在 schema 完全沒記錄誰填的（Ch5 的匿名決定） |
| `/auth/me` 之外的東西 | Ch14 串認證時可能發現前端還需要別的 |

**好消息是改起來很安全**：133 條 e2e + 11 條單元測試守著，而 Ch13 之後
前端的型別是從 `/docs-json` 產的 —— **改壞契約前端會編譯不過**，那是一道
比測試更早叫的防線。

#### 前端的技術決定（2026-09-03 定的，不必重新討論）

**技術棧**：Nuxt 4 + Vuetify + Pinia。**前端程式碼由 AI 寫**，使用者不 review 實作細節，
只 review「它有沒有正確反映後端契約」。

**分層與判準定稿在 `survey-frontend/docs/前端分層慣例.md`**（2026-09-05）——
分層與職責、`useMyService` 的骨架、`auth.ts` 與路由守衛兩支小檔、Vuetify 的四處設定，全部在那一份。

一句話的重點：**`useMyService` 要依這個後端的錯誤約定設計。**
Java/Spring 生態常見的 `ApiResponse<T>` 約定（**HTTP 一律 2xx，靠 body 的
`code !== 0` 判斷業務錯誤**）在這裡不適用，這個後端（Ch6 定的）是相反的：**真的 HTTP 狀態碼**
+ `{ error: { code, message } }`。`ok` 的計算、錯誤 toast 的觸發點、`error.message`
的取法都要照這個約定來。

（那份文件記了一個 `msgs` false-success 的失敗模式 —— 封裝跟後端契約脫鉤的代價，
手寫型別的專案只能靠 eslint 的 `no-restricted-syntax` 去擋。**這個專案有結構性的解法**：
型別是產的，寫一個後端不存在的欄位當場編譯不過。值得寫進 ch13 當對照組。）

#### 前端要做哪些頁面（六頁，用到 18 支裡的 17 支）

| 路由 | 用到的端點 | 這一頁會暴露什麼 |
| --- | --- | --- |
| `/login` | `POST /auth/register`、`POST /auth/login`、`GET /auth/me` | **CORS 第一次撞牆**；401 的處置；token 存哪 |
| `/surveys` | `GET /surveys`、**`DELETE /surveys/:id`** | 它**回所有人的問卷**（含別人的草稿標題）—— 已知的第一個 API 設計問題。刪除按鈕只有 `ADMIN` 看得到，**那是第一次用到 `/auth/me` 回的 `role`** |
| `/surveys/new` | `POST /surveys` | `ownerId` 從 token 來，前端不送 |
| `/surveys/:id/edit` | `GET /surveys/:id?includeQuestions=true`、`PATCH /surveys/:id`、題目三支、`publish` / `unpublish` | 擁有權 403 的實際體驗；`DRAFT` 才能改題目那條規則的 409 |
| `/surveys/:id/fill` | `GET /surveys/:id/questions`、`POST /surveys/:id/responses` | **這兩支刻意不保護**，任何登入的人都能填 |
| `/surveys/:id/result` | `GET /surveys/:id/responses`、`GET /responses/:id` | 只有擁有者看得到；分頁參數好不好用 |

**沒被用到的那一支是 `GET /health`** —— 它的呼叫者是 Render 的健康檢查，
前端沒有理由打它。所以覆蓋率的目標是 **17 / 18**，不是全部。

**「端點被前端用過」本身就是驗收的一部分**：沒有被用過的端點等於沒有真正被驗收 ——
e2e 只證明它「行為正確」，沒證明它「好用」。

（**18 支端點分布在 12 條路徑上** —— `swagger.e2e-spec.ts` 斷言的 12 是**路徑**數，
同一條路徑可以有 GET / PATCH / DELETE 好幾支。兩個數字都對，別搞混。）

#### 這些數字怎麼驗（別用推的）

上面那些「18 支」「9 支」是數出來的，不是估的。**下次改完端點請重新數一次**：

```bash
# 端點總數（排除註解行，避免把範例當成真的路由）
grep -hvE "^\s*//" src/*/*.controller.ts | grep -coE "@(Get|Post|Patch|Delete)\("

# 受擁有權保護的（排除方法定義本身）
grep -rn "assertCanManage(" src/ --include=*.ts | grep -v "ownerId: string"

# 受角色保護的
grep -rn "^\s*@Roles(" src/ --include=*.ts
```

**哪幾支端點沒有標 401**（後端要先 `pnpm start:dev`）——
Ch13 輪 ② 的那個數字就是這樣數出來的：

```bash
curl -s http://localhost:3100/docs-json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const doc=JSON.parse(s); let n=0;
  for(const [p,ops] of Object.entries(doc.paths))
    for(const [m,op] of Object.entries(ops)){
      const codes=Object.keys(op.responses).join(',');
      if(!codes.includes('401')){ n++; console.log(m.toUpperCase().padEnd(7)+p.padEnd(34)+codes); }
    }
  console.log('沒標 401 的共 '+n+' 支');
});"
```

Ch13 收尾時實際踩過：`docs` 裡先寫「六頁把 18 支全部用到」，逐條列出來才發現
`GET /health` 前端根本不會打 —— **「看起來夠了」跟「逐條對照過」是兩回事。**

#### 前端 repo 的起手清單（已完成，留著當紀錄）

1. ~~在 `survey/` 底下建 `survey-frontend`，`git init`~~ ✅
2. ~~建一份它自己的 `CLAUDE.md`~~ ✅（Vue / Nuxt 慣例在裡面，共用的教學慣例指回 `../survey-backend/CLAUDE.md`）
3. ~~確認後端跑得起來、`/docs-json` 出得來~~ ✅
4. ~~`openapi-typescript` 產型別~~ ✅（`pnpm gen:api`，吃 **localhost:3100**，
   **不要用線上那條** —— 線上是 production 資料庫）
5. **第一個真請求才會撞到 CORS，而 Ch13 沒有發過任何真請求** ——
   型別是抓 `/docs-json` 這個檔案、不經瀏覽器。CORS 留給 Ch14（它本來就是 Ch14 的驗收標準）

**每次要重產型別的順序**（不能反過來）：

```bash
cd survey-backend && pnpm start:dev        # 先讓 /docs-json 出得來
cd ../survey-frontend && pnpm gen:api      # 產型別
pnpm typecheck                             # 綠 = 契約可用
```

#### 兩件留著的技術債

> **`code` 的合法值有三份**（filter 的 `STATUS_TO_CODE`、`error-response.entity.ts`
> 的 `enum`、`swagger.ts` 的說明字串），而它們之間**沒有偵測器**。
> Ch9 與 Ch11 各漂移過一次。要補得寫一條測試比對「filter 產得出來的 code 集合」與那份 `enum`。

> **`pnpm test:e2e` 大約三次會有一次只失敗 1 條、每次不一樣**（跟改動無關，
> 之前就發生過）。判定是環境問題，刻意不追。**下次遇到請先把錯誤訊息存下來**
> （`pnpm test:e2e 2>&1 | tee /tmp/e2e.log`）—— 要分辨是 `ECONNRESET` 還是斷言失敗。
> 完整紀錄在 `docs/專案速查.md` 的「e2e 測試連線問題怎麼查」。

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
| Ch6 | 統一錯誤處理與回應格式 | Exception Filter 把 Prisma 錯誤碼轉 HTTP | ✅ |
| Ch7 | Swagger API 文件 | 產出前端能直接照著串的契約；**契約與實際回應的一致性要用測試守住** | ✅ |
| Ch8 | **第一次部署（後端先上線）** | `migrate deploy` 的冪等性、產物不進版控、連線其實有三段 | ✅ |

### 階段二：JWT 與權限控管

| 章節 | 主題 | 這章的關鍵收穫 | 狀態 |
| :---: | --- | --- | :---: |
| Ch9 | User model、bcrypt、註冊登入 | 密碼雜湊；預設拒絕比逐一排除可靠；**對已有資料的表加 `ownerId`** | ✅ |
| Ch10 | JWT 與全域 AuthGuard | 認證流程、`@Public()` 的例外機制；**看得到內容 ≠ 內容可信** | ✅ |
| Ch11 | RBAC：只有管理員能刪問卷 | 角色權限、`@Roles()` 自訂裝飾器；**裝飾器只是紙條，擋人的是 guard** | ✅ |
| Ch12 | 資源層授權：只能改自己的問卷 | Guard 層 vs Service 層判斷的取捨；**授權要排在商業規則之前** | ✅ |

### 階段三：串接驗收（2026-09-03 重新定義）

> **這五章的前端程式碼由 AI 寫，使用者不學前端**（他本來就是前端工程師）。
> 每一章的**驗收標準是後端的交付物** —— 串接的價值在於它會暴露
> 「API 行為正確」與「這組 API 好不好用」之間的差距，而那是前十二章驗不到的。

| 章節 | 主題 | **後端的驗收標準** | 狀態 |
| :---: | --- | --- | :---: |
| Ch13 | **契約驗收：從 Swagger 產型別** | 產出來的型別品質 **= entity 標記品質**。修掉 `ownerId` 的聯集型別與 `order` 不成立的 `default`；契約有 401 的端點 2 → 16（`@ApiAuthenticated()`）。**兩種錯要兩種偵測器** | ✅ |
| Ch14 | **認證串接：CORS 與 401 的一致性** | `enableCors` 上線（含 credentials）；401 的三種來源對前端是否真的一致；`/auth/me` 夠不夠用 | ⬜ |
| Ch15 | **串接暴露的 API 設計問題** | `GET /surveys` 回所有人的問卷（含別人的草稿標題）是已知的第一個；其餘由串接過程發現，每改一處都要有測試 | ⬜ |
| Ch16 | 環境變數分離與 production build | CORS 的 origin 依環境切換；前後端各自的 `.env` 分離 | ⬜ |
| Ch17 | 前端部署與端到端驗收 | 線上 origin 加進 CORS；跑通「建立 → 發布 → 填寫 → 看結果」 | ⬜ |

### 貫穿全程的商業規則

四條規則全部住在 `src/surveys/survey.rules.ts`，分散在對應章節實作。
前三條由 `Survey.status` 決定「**這件事現在能不能做**」（違反 → 409）：

- **`DRAFT` 才能自由增刪題目；一旦有人填答就不能再改題目**（Ch3）
- **沒有任何填答才能撤回發布**（Ch3）
- **只有 `PUBLISHED` 的問卷能被填答**（Ch5）

第四條由 `Survey.ownerId` 決定「**你能不能碰**」（違反 → 403）：

- **擁有者本人或 `ADMIN` 才能管這份問卷**（Ch12）

**授權要排在商業規則之前** —— 否則不相干的人會拿到「問卷已發布，無法修改題目」
這種他不該知道的資訊。

這是整個專案唯一有實質商業邏輯的地方，也是**唯一適合寫單元測試**的地方
（純判斷、不碰資料庫）。其餘部分都用 E2E —— 而單元測試還有一個獨有的價值：
**它到得了 e2e 到不了的地方**（`canManageSurvey(null, …)` 要靠無主問卷才觸發，
而 e2e 的前提資料一律有擁有者）。

### 課綱修訂紀錄

**2026-09-03（第三次修訂）** — 階段三從「學前端」改成「串接驗收」：

原課綱的 Ch13–15 是照「**使用者要學前端**」寫的（Nuxt 建置、API client 封裝、
功能頁面）。**那個前提是錯的** —— 使用者本身就是前端工程師，他要學的是後端，
以及「前端串接時需要後端處理的部分」。照原樣走，那三章會變成
「教一個前端工程師寫前端」，而真正該學的東西反而沒有被寫成驗收標準。

改動：**前端程式碼由 AI 寫，五章的驗收標準全部換成後端的交付物。**
串接在這裡的角色是**一種新的測試**：前十二章的 e2e 證明了「API 行為正確」，
串接證明的是「這組 API 好不好用」—— 而後者只有真的有人拿去用才驗得出來。

（`CLAUDE.md` 的教練模式因此也分成兩半：後端維持「使用者自己寫、AI review」，
前端由 AI 直接寫。）

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
| Ch6 — 統一錯誤處理與回應格式 | [`docs/chapters/ch06-統一錯誤處理與回應格式.md`](docs/chapters/ch06-統一錯誤處理與回應格式.md) |
| Ch7 — Swagger API 文件 | [`docs/chapters/ch07-swagger-api文件.md`](docs/chapters/ch07-swagger-api文件.md) |
| Ch8 — 第一次部署 | [`docs/chapters/ch08-第一次部署.md`](docs/chapters/ch08-第一次部署.md) |
| Ch9 — 認證基礎 | [`docs/chapters/ch09-認證基礎.md`](docs/chapters/ch09-認證基礎.md) |
| Ch10 — JWT 與全域 AuthGuard | [`docs/chapters/ch10-JWT與全域AuthGuard.md`](docs/chapters/ch10-JWT與全域AuthGuard.md) |
| Ch11 — RBAC 與角色權限 | [`docs/chapters/ch11-RBAC與角色權限.md`](docs/chapters/ch11-RBAC與角色權限.md) |
| Ch12 — 資源層授權 | [`docs/chapters/ch12-資源層授權.md`](docs/chapters/ch12-資源層授權.md) |
| Ch13 — 契約驗收 | [`docs/chapters/ch13-契約驗收.md`](docs/chapters/ch13-契約驗收.md) |

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束、索引、**交易** —— 不含 Prisma 語法 |
| [`docs/Prisma速查.md`](docs/Prisma速查.md) | 每支方法收哪些參數、`data` / `where` / `include` 能帶什麼、參數對應到什麼 SQL |
| [`docs/錯誤處理與狀態碼.md`](docs/錯誤處理與狀態碼.md) | 例外從 `throw` 到前端的路徑、`HttpStatus`、Prisma 錯誤碼、兩層的翻譯關係 |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
