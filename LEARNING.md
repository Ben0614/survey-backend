# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0、Ch1、Ch2、**Ch3 全部完成**（兩段皆完成並補完文件）。
`pnpm test:e2e` **36 passed**、`pnpm test` **4 passed**、`tsc --noEmit` 0 errors、`lint` 0 problems。
下一步是 Ch4（分頁、排序、篩選），起手式寫在下方「Ch4 接續點」。

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

---

### Ch4 接續點（2026-08-13）

**目前狀態**：`pnpm test:e2e` **36 passed**、`pnpm test` **4 passed**、
`tsc --noEmit` 0 errors、`eslint` 0 problems，working tree 乾淨、已 push。

Ch3 兩段全部完成。觀念、取捨、13 條坑與兩批作業在
[`ch03`](docs/chapters/ch03-巢狀資源與關聯查詢.md)，**這裡不重複**。

#### 進 Ch4 之前先確認的兩件事

1. **Ch3 的程式碼讀得懂嗎。** 進度表的 ✅ 只代表「跑得起來」。
   最值得自己講一遍的三處：
   - `assertExists` 和 `findOne` 為什麼要分成兩支（各自的呼叫者是誰、為什麼）
   - `survey.rules.ts` 為什麼**不是** provider、為什麼回 boolean 而不是直接丟例外
   - `include: { survey: true }` 跟 `include: { questions: { orderBy } }` 差在哪
2. **`ch03` 第二段的五題作業值得做過一遍** —— 尤其第 1 題（把 `where: { surveyId: id }`
   改回 `{ id }`，看哪幾條測試會紅）。那是「假綠第六種」的現場。

#### Ch4 的範圍：分頁、排序、篩選

課綱的關鍵收穫是「**query string 轉型驗證**、`skip/take` vs cursor」。

主要落在 `GET /surveys`（目前是 `findMany({ orderBy: { createdAt: 'desc' } })`，
寫死一種排序、沒有分頁），可能也會擴到 `GET /surveys/:surveyId/questions`。

**Ch3 已經先埋好的三個引子**（Ch4 要正面處理）：

- `surveys.service.ts` 的 `findAll` 註解寫著「『最新的在最上面』是這裡自己決定的預設值；
  讓前端自由指定排序是 Ch4 的事」
- `surveys.controller.ts` 的 `findOne` 註解提到 **`@Param()` 拿到的永遠是字串**
  ——「Ch4 才會有感」。`?page=2` 進來也是字串 `'2'`，這就是 query 轉型驗證的起點
- `findOne` 的 `include` 註解寫著「這一章一律帶題目，由 query 決定要不要帶是 Ch4 的事」

**Ch3 已經備好、Ch4 直接可用的工具：**

- **`PRISMA_LOG_QUERIES=1`** —— 分頁一定要看 `LIMIT` / `OFFSET` 實際長什麼樣，
  也是 `skip/take` vs cursor 差異最直觀的證據。怎麼讀 log 見 `ch03` 的 ③
- **`count()`** —— 分頁回應通常要附總筆數，而 `.length` 在分頁之後只會是「這一頁幾筆」
  （`ch03` ④ 已寫成一節）
- **`docs/專案速查.md` 的「什麼時候用 API、什麼時候用 Prisma」** —— 寫 e2e 卡住時看這裡

#### 工作方式（沿用，實際付出代價換來的）

- **教練模式**：實作自己寫，教練 review 並負責 `[教學]` 註解與文件
- 一次做完一件事：service → controller → E2E → **跑測試**
- **每寫一條測試就跑一次**，不要一口氣寫完才跑
- 貼上測試的當下核對**動詞與路徑**跟 `describe` 一致（這個坑踩過四次）
- 新檔案要接進閱讀動線（改前一站的「下一站」），別讓鏈斷掉。
  目前終點是 `src/surveys/survey.rules.spec.ts`
- **改行為時搜尋一次被改掉的那個名字**，找出過期註解（這個坑踩過五次）
- **import 路徑一律用相對路徑**，看到開頭是 `src/` 直接改掉（`tsc` 不會抓）
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
| Ch4 | 分頁、排序、篩選 | query string 轉型驗證、`skip/take` vs cursor | ⬜ |
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

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束 —— Ch1 的前置觀念（不含 Prisma 語法） |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
