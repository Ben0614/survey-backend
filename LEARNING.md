# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0、Ch1、Ch2 完成。**Ch3 第一段完成（含補債），下一步是第二段**
（詳見下方「Ch3 接續點」）。

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

原則不變：**確認前一章讀得懂，再進下一章。**

---

### Ch3 接續點（2026-08-12 更新）

**目前狀態**：`pnpm test:e2e` **30 passed**、`pnpm test` 0 個 spec（靠 `--passWithNoTests`）、
`tsc --noEmit` 0 errors、`eslint` 0 problems，working tree 乾淨、已 push。

#### Ch3 的四塊與切分（已定案，不要重新討論）

| 塊 | 內容 | 狀態 |
| --- | --- | --- |
| ① Questions 的巢狀 CRUD | 多一層「父資源存不存在」 | ✅ |
| ② `include` / `select` | `GET /surveys/:id` 帶出題目 | ✅ |
| ③ 看 Prisma 產生的 SQL、N+1 | 打開 query log | **觀察完成，修正未做** |
| ④ 商業規則 + 第一次單元測試 | 「`DRAFT` 才能改題目」 | **未開始** |

已完成部分的決策、取捨、坑、作業解答、以及 ③ 的完整觀察結果（含真實 SQL）
全部在 [`ch03`](docs/chapters/ch03-巢狀資源與關聯查詢.md)，**這裡不再重複**。

---

#### 第二段·已經做出的決策（換機後不必重問）

**規則定案 —— 這是兩條規則，不是一條。** 原本課綱寫「`DRAFT` 才能自由增刪題目；
一旦有人填答就不能再改題目」，但因為只有 `PUBLISHED` 能被填答，`DRAFT` 永遠沒有填答 ——
兩句只在「已發布但還沒人填答」這一種狀態下會給出不同答案。定案：

| 規則 | 判準 | 為什麼 |
| --- | --- | --- |
| 能不能**改題目** | `status === 'DRAFT'` | 「已發布」代表**可能有人正在填寫**，那跟「目前有幾筆填答紀錄」不是同一件事 —— 有人開著頁面還沒送出時 `responseCount` 仍是 0，用它當判準會漏掉這種人 |
| 能不能**撤回發布** | 還沒有任何填答 | 這是「要改已發布的問卷」的正式路徑：先撤回、再改。已經有人填過就不給撤回，否則舊答案會對不上新題目 |

其餘定案：

- **錯誤一律回 409 Conflict** —— 請求本身沒錯，是跟資源目前的狀態衝突。
  不用 403（不是權限問題，換一個人來也一樣不能改）、
  不用 400（body 完全合法，而且會跟 `ValidationPipe` 的 400 混在一起分不出來）
- **一併做「發布 / 撤回發布」兩支端點。** 現在 API 上根本沒有辦法把問卷變成 `PUBLISHED`
  （`UpdateSurveyDto` 只有 `title`，`status` 被 whitelist 擋掉），不做的話規則等於死程式碼
- **`status` 不進 `UpdateSurveyDto`**，用自己的動作型路由。
  `create-survey.dto.ts` 的註解早就寫了「發布是一個獨立的動作」，現在兌現
- **query log 開關已完成**：`PRISMA_LOG_QUERIES=1`，預設關（見 `ch03` 第二段）

#### 下一步（依序做，每一步做完跑驗收）

**步驟 1 — ③ 的修正：`SurveysService.assertExists`**

`ch03` 第二段量到三個浪費，最嚴重的是 `GET /surveys/:surveyId/questions`
**把同一批題目撈了兩次**。修法（完整說明與 `select` 的寫法在 `ch03`）：

1. `SurveysService` 新增 `assertExists(id)` ——
   `findUnique({ where: { id }, select: { id: true, status: true } })`，找不到丟 404
2. 四個呼叫點從 `findOne` 改成 `assertExists`：
   `SurveysService.update` / `remove`、`QuestionsService.findAll` / `create`
3. `GET /surveys/:id` 那條路徑**維持 `findOne`**（它要完整內容）
4. 跑 `pnpm test:e2e` —— **30 passed 不該變**（行為沒變，只是少撈東西）
5. **把 `.env` 的 `PRISMA_LOG_QUERIES` 設成 1 再跑那兩條，親眼確認查詢真的少了。**
   這一步不能省，否則只是相信文件寫的

**步驟 2 — ④ 規則抽成純函式 + 專案第一支單元測試**

新檔 `src/surveys/survey.rules.ts`，兩個**純述詞**（回 boolean、不丟例外、不碰資料庫、
**不需要 `@Injectable()` 也不必註冊進 module**，直接 `import` 就好 ——
這是順帶的觀念：**不是所有東西都要變成可注入的零件**）：

```ts
export function canEditQuestions(status: SurveyStatus): boolean
export function canUnpublish(responseCount: number): boolean
```

回 boolean 而不是直接 `throw`：丟 `ConflictException` 是 HTTP 的事，
放進規則檔會把「純判斷」這個唯一的好處弄丟。由 service 翻譯成 409。

新檔 `src/surveys/survey.rules.spec.ts` —— **專案第一支單元測試**
（`pnpm test` 跑的是 `rootDir: src` + `*.spec.ts`，設定在 `package.json`）。四個案例起跳：
`canEditQuestions('DRAFT')` → true、`('PUBLISHED')` → false、
`canUnpublish(0)` → true、`canUnpublish(1)` → false。

**這裡是全專案唯一適合單元測試的地方** —— 純判斷，不必啟動 Nest、不必連資料庫、
不必 mock 任何東西。跟 e2e 的適用時機對比要寫進 `ch03`（Ch5 會再對比一次）。

**步驟 3 — 規則套用 + 兩支新端點**

- **改題目**：`QuestionsService` 的 `create` / `update` / `remove` 三支都要擋
  - `create` 已經有 `await this.surveysService.assertExists(surveyId)`（步驟 1 改的），
    把回傳值接起來就有 `status`
  - `update` / `remove` 只有 `question.id`，拿不到問卷 →
    **把 `QuestionsService.findOne` 改成 `include: { survey: true }`**，
    一次查詢同時拿到題目與問卷狀態，不必再多呼叫一次。
    （`include` 第二次出場，而且這次它是**省查詢**的那一邊，正好跟步驟 1 的觀察對照）
- **撤回發布**：`SurveysService.unpublish` 要先
  `prisma.response.count({ where: { surveyId: id } })`
- **兩支端點**寫在既有的 `src/surveys/surveys.controller.ts`：
  `PATCH /surveys/:id/publish`、`PATCH /surveys/:id/unpublish`
  - 路徑段數跟 `@Patch(':id')` 不同，**不會互相吃掉** ——
    但 controller 裡已經有一段講「路由依宣告順序比對」的註解，這裡值得標一句為什麼這次不衝突
  - **冪等**：已經是 `PUBLISHED` 再 publish 回 200（不當錯誤），unpublish 同理。PATCH 本該冪等

**步驟 4 — E2E（6 條）**

| 檔案 | 案例 |
| --- | --- |
| `test/surveys.e2e-spec.ts` | publish 後 `status` 變 `PUBLISHED` |
| `test/surveys.e2e-spec.ts` | unpublish 後變回 `DRAFT` |
| `test/surveys.e2e-spec.ts` | **有填答時 unpublish 回 409** |
| `test/questions.e2e-spec.ts` | 問卷是 `PUBLISHED` 時 `POST` 題目回 409 |
| `test/questions.e2e-spec.ts` | 問卷是 `PUBLISHED` 時 `PATCH` 題目回 409 |
| `test/questions.e2e-spec.ts` | 問卷是 `PUBLISHED` 時 `DELETE` 題目回 409 |

`Response` / `Answer` 到 Ch5 才有端點，所以「有人填答」的前提**只能用 `prisma` 直接建** ——
這剛好符合專案原則（前提資料一律不透過 API）。

**步驟 5 — 文件與註解（別忘了，Ch3 第一段就是因為累積才變成一大筆債）**

- `[教學]` 檔頭：`survey.rules.ts`、`survey.rules.spec.ts`
- **接進閱讀動線**：`surveys.service.ts → survey.rules.ts → questions.module.ts`；
  `survey.rules.spec.ts` 接在 `test/questions.e2e-spec.ts` 之後**成為新終點**
  （最後看一支單元測試，正好跟前面全部的 e2e 對照）。**`CLAUDE.md` 的終點要同步**
- `docs/專案速查.md`：檔案地圖 + 動線 + `pnpm test` 的說明
- `docs/chapters/ch03-*.md`：往「第二段」那一節繼續追加 ④ 的內容、新的坑、新的作業
- `LEARNING.md`：進度表 Ch3 改 ✅、這一節改寫成 Ch4 的起手式

#### 第二段的驗收

```bash
pnpm test                # 4 passed（目前是 0 個 spec）
pnpm test:e2e            # 30 + 6 = 36 passed
pnpm exec tsc --noEmit   # 0 errors
pnpm lint                # 0 problems
```

**Ch3 不做的事：** 分頁/排序/篩選（Ch4）、提交作答（Ch5）、
統一錯誤處理 Filter（Ch6）、Swagger（Ch7）。

#### 沿用 Ch2 的工作方式（實際付出代價換來的）

- 一次做完一個端點：service → controller → E2E → **跑測試**
- **每寫一條測試就跑一次**，不要一口氣寫完才跑
- 每個新檔案都要接進閱讀動線（改前一站的「下一站」），別讓鏈斷掉
- **丟給教練 review 之前先自己跑三項驗收**：
  `pnpm test:e2e`、`pnpm exec tsc --noEmit`、`pnpm lint`

> **[`ch03`](docs/chapters/ch03-巢狀資源與關聯查詢.md) 的「作業」五題值得做過一遍**
> —— 解答全部是實跑的輸出。其中第 1、2 題是一組對照：同樣少一行借來的 404，
> 一個變 500、一個變 200 配空陣列。
> （[`ch02`](docs/chapters/ch02-第一個CRUD與測試資料庫隔離.md) 的五題同樣值得做。）

> **換機器後 `.env.test` 不存在，測試會直接失敗**（防呆刻意如此）。
> 重建步驟見 [`docs/專案速查.md`](docs/專案速查.md) 的「換機接續」。

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
| Ch3 | 巢狀資源與關聯查詢（Questions） | `include`/`select`、**看 Prisma 產生的 SQL**、N+1 | ⬜ |
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
| Ch3 — 巢狀資源與關聯查詢（第一段） | [`docs/chapters/ch03-巢狀資源與關聯查詢.md`](docs/chapters/ch03-巢狀資源與關聯查詢.md) |

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束 —— Ch1 的前置觀念（不含 Prisma 語法） |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
