# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0、Ch1、Ch2 完成。**Ch3 第一段進行中 —— `GET` / `POST` 已完成，
剩 `PATCH` / `DELETE` / `include`**（詳見下方「Ch3 接續點」）。

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

原則不變：**確認前一章讀得懂，再進下一章。**

---

### Ch3 接續點（2026-08-11 停在這裡）

**目前狀態**：`pnpm test:e2e` **23 passed**、`tsc --noEmit` 0 errors、`eslint` 0 problems，
working tree 乾淨。

#### Ch3 的四塊與切分（已定案，不要重新討論）

| 塊 | 內容 | 狀態 |
| --- | --- | --- |
| ① Questions 的巢狀 CRUD | 多一層「父資源存不存在」 | 第一段·進行中 |
| ② `include` / `select` | `GET /surveys/:id` 帶出題目 | 第一段·未做 |
| ③ 看 Prisma 產生的 SQL、N+1 | 打開 query log | **第二段** |
| ④ 商業規則 + 第一次單元測試 | 「`DRAFT` 才能改題目」 | **第二段** |

Ch3 內容比 Ch2 多，**切成兩段**：第一段 ①②，第二段 ③④。

#### 已經做出的決策（新對話不必再問）

- **路由用混合形狀**：列表與建立巢狀（語義離不開父問卷），改與刪扁平
  （`question.id` 是 cuid、本來就唯一，不需要父資源才找得到）

  ```text
  GET    /surveys/:surveyId/questions
  POST   /surveys/:surveyId/questions
  PATCH  /questions/:id        ← 還沒做
  DELETE /questions/:id        ← 還沒做
  ```

- **因此拆成兩個 controller**：一個 `@Controller()` 只能有一個前綴。
  巢狀那組在 `survey-questions.controller.ts`（前綴帶路徑參數，`@Param` 照樣抓得到），
  扁平那組之後放 `questions.controller.ts`，**兩者共用同一個 `questions.service.ts`**
- **`questions.controller.ts` 等步驟 ④ 真的有 `PATCH` 時再建**
  （同「不要預先開放」：沒有內容的東西就先不要存在）
- **`order` 不進 DTO**，`create` 時用 `count({ where: { surveyId } })` 算。
  前端給容易撞號，而 Ch1 決定過不加 `@@unique([surveyId, order])`。
  已知的洞：`count` 再 `create` 是兩次查詢，並發時可能撞號 —— 現階段接受，
  真要根治靠交易（Ch5 的主題）
- **`QuestionsModule` 依賴 `SurveysModule`**：`SurveysModule` 加 `exports`、
  `QuestionsModule` 加 `imports`。這是第一次 feature module 依賴另一個 feature module；
  對照 `PrismaModule` 的 `@Global()` 是刻意的例外，**不能套用到業務 service**

#### 已完成

| 檔案 | 內容 |
| --- | --- |
| `src/questions/questions.module.ts` | `imports: [SurveysModule]`，已註冊進 `AppModule` |
| `src/questions/questions.service.ts` | `findAll` / `create`，兩支都先 `await surveysService.findOne(surveyId)` 借它丟 404 |
| `src/questions/survey-questions.controller.ts` | `@Controller('surveys/:surveyId/questions')` + `@Get()` `@Post()` |
| `src/questions/dto/create-question.dto.ts` | `title` / `type` / `options`；第一次出現 `@IsEnum(QuestionType)` 與 `@IsArray` + `@IsString({ each: true })` |
| `test/questions.e2e-spec.ts` | 6 個案例 |
| `test/jest-e2e.json` | 加 `maxWorkers: 1`（說明在 `docs/設定檔導讀.md`） |

`QuestionType` 從產生的程式碼 import：`'../../generated/prisma/enums.js'`（帶 `.js`）。
它**同時是值也是型別**，一次 import 兩種用途都拿到。

#### 下一步

1. **`PATCH /questions/:id`** —— 建 `questions.controller.ts`（第一支扁平路由）、
   `UpdateQuestionDto extends PartialType(CreateQuestionDto)`
2. **`DELETE /questions/:id`**
3. **`GET /surveys/:id` 加 `include: { questions: ... }`** ——
   `include` 是「原本欄位全要、額外再帶關聯」，`select` 是「只要我列的」。
   這一章一律帶題目（由 query 控制是 Ch4 的事）。
   順帶確認既有的 surveys e2e 不會壞（`toMatchObject` 對多出來的欄位寬容）

#### Ch3 已累積的坑（第一段結束後搬進 `ch03`）

1. **「跑起來了」不等於「接上了」。** `QuestionsModule` 忘了註冊進 `AppModule`，
   `pnpm start:dev` 照樣成功 —— 因為那個 module 不在樹上，Nest 根本沒去建立它，
   裡面寫什麼都不會報錯。**沒被載入的程式碼不會報錯。**
2. **假綠第五種樣態：「端點還沒接上」也會讓 404 測試變綠。** 那時的 404 來自
   「Nest 找不到路由」，不是來自 `findOne` 丟的例外，但兩者從測試看起來一模一樣
3. **`whitelist` 只認驗證裝飾器，不認 TypeScript 的型別宣告。**
   拔掉 `@IsEnum` → `type` 被無聲丟掉 → `prisma.create` 收到 `undefined` → 500。
   症狀看起來像「Prisma 的問題」，兇手其實在 `setup-app.ts`
4. **測試裡除了「被驗的那件事」，其他前提都要保持正常。** 驗證測試若打
   `nonexistent-id`，平常是綠的（驗證比 service 早跑），但壞掉時會拿到
   `expected 400, got 404` —— 訊息把人帶往「路由或父資源有問題」的錯方向。
   建一份真的問卷，變因只剩一個
5. **何時需要二次查詢資料庫**：斷言的欄位若**全是自己送進去的**才需要；
   只要有一個是伺服器產生的（例如 `order: 0`），回應本身就有證據力
6. **`maxWorkers: 1` —— 測試檔之間也需要隔離。** Jest 預設並行跑不同測試檔，
   而它們共用同一個測試資料庫、各自 `TRUNCATE`。症狀：**每次失敗的組合都不一樣，
   而且紅的常是「上一章明明會過」的測試**。
   `.env.test` 隔離「測試 vs 開發」，`maxWorkers` 隔離「測試 vs 測試」，兩層不同
7. **複製測試忘了改動詞，第三次發生**（Ch2 兩次）。共同觸發條件都是「從對照版本複製」。
   已升級成習慣：**貼上的當下就核對動詞與路徑跟 `describe` 一致**

#### 欠的債（第一段做完要補，別以為已經做了）

- `src/questions/` 四個檔 + `test/questions.e2e-spec.ts` 的 **`[教學]` 檔頭全部還沒寫**
- **閱讀動線還沒接上** —— `surveys.service.ts` 的「下一站」目前直接跳到
  `test/setup-env.ts`，questions 那幾個檔要插在中間
- `docs/專案速查.md` 的**檔案地圖與閱讀動線還沒有 `src/questions/`**
- `docs/chapters/ch03-*.md` 尚未建立

（`docs/設定檔導讀.md` 的 `maxWorkers` **已補**，不用再做。）

**Ch3 不做的事：** 分頁/排序/篩選（Ch4）、提交作答（Ch5）、
統一錯誤處理 Filter（Ch6）、Swagger（Ch7）。

#### 沿用 Ch2 的工作方式（實際付出代價換來的）

- 一次做完一個端點：service → controller → E2E → **跑測試**
- **每寫一條測試就跑一次**，不要一口氣寫完才跑
- 每個新檔案都要接進閱讀動線（改前一站的「下一站」），別讓鏈斷掉
- **丟給教練 review 之前先自己跑三項驗收**：
  `pnpm test:e2e`、`pnpm exec tsc --noEmit`、`pnpm lint`

> 觀念與取捨全部寫在 [`ch02`](docs/chapters/ch02-第一個CRUD與測試資料庫隔離.md)，
> **它的「作業」五題值得做過一遍** —— 其中三題會讓你親眼看到「測試綠但什麼都沒保護」。

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

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束 —— Ch1 的前置觀念（不含 Prisma 語法） |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
