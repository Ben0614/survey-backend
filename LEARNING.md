# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0、Ch1 完成（皆含理解驗收）。**Ch2 進行中 —— 隔離與 `findAll`/`create`/`findOne`
已完成，`update`/`remove` 待寫**（詳見下方「Ch2 接續點」）。

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

原則不變：**確認前一章讀得懂，再進下一章。**

---

### Ch2 接續點（2026-08-09 停在這裡）

**已完成並驗證**（`pnpm test:e2e` **9 passed**、`tsc --noEmit` 0 errors、`pnpm lint` 綠）：

| 檔案 | 內容 |
| --- | --- |
| `test/setup-env.ts` | 載入 `.env.test`；兩道防呆：檔案不存在、或 `DATABASE_URL` 與 `.env` 相同 → 直接 throw |
| `test/helpers/reset-db.ts` | `TRUNCATE` 四張表 `CASCADE`，各 e2e 檔在 `beforeEach` 呼叫 |
| `test/jest-e2e.json` | 加 `setupFiles` |
| `src/setup-app.ts` | `ValidationPipe({ whitelist, transform })`，`main.ts` 與 e2e **都要呼叫** |
| `src/surveys/` | DTO / service / controller / module，目前有 `findAll` + `create` + `findOne` |
| `test/surveys.e2e-spec.ts` | 8 個案例，含「偷塞 `status` 會被 whitelist 無聲丟掉」與 `findOne` 的 404 |

> **換機器後 `.env.test` 不存在，測試會直接失敗**（防呆刻意如此）。重建：
> Neon Console → Branches → New branch 命名 `test` → 複製連線字串寫進 `.env.test` →
> `$env:DATABASE_URL="<test 的字串>"; pnpm exec prisma migrate deploy`（新 branch 是空的，要先建表）。

**下一步：自己寫 `update` / `remove`**（教練模式，寫完再 review）。
完整規格與提示在計畫檔，但那個檔案**不跟著 git 走**，所以重點抄在這裡：

**`update`**

- 新檔案 `src/surveys/dto/update-survey.dto.ts`，body 只有三行：
  `export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}`
  （`PartialType` 來自 `@nestjs/mapped-types`，已安裝）
- `PartialType` 做兩件事：屬性全變可選、**保留驗證裝飾器但只在該屬性出現時才套用**。
  所以 `{}` 通過，`{ title: '' }` 仍被 `@IsNotEmpty()` 擋下回 400
- 路由用 **`@Patch` 不是 `@Put`**（部分更新 vs 整份取代，要跟 `PartialType` 的語義一致）
- 404 的處理**這一章選「先 `findOne` 確認存在，再 `update`」**（兩次查詢但直白、可重用）。
  另一種是 `catch` Prisma 的 `P2025`，那是 Ch6 Exception Filter 的正題，屆時再回頭比較
- `data: { title: dto.title }` 在 `dto.title` 是 `undefined` 時，Prisma **完全不碰這個欄位**。
  `undefined` = 不要動，`null` = 設成空值 —— 兩者在 Prisma 是不同意思
- E2E 5 個案例：改 title / 空 body `{}` 不變 / `title: ''` 回 400 / 不存在回 404 /
  偷塞 `status` 被 whitelist 丟掉
- **新檔案要接進閱讀動線**：插在 `create-survey.dto.ts` 與 `surveys.service.ts` 之間，
  所以要同時改 `create-survey.dto.ts` 的「下一站」

**`remove`**

- 跟 `update` 同一套 404 處理。狀態碼**選回傳被刪的那筆（`200`）**，
  不用 `204`（`prisma.delete()` 本來就回傳被刪的資料，E2E 也好斷言）
- 重點不是端點本身，是 **cascade 的驗證**：用 `prisma` 直接建
  `Survey → Question → Response → Answer`（資料形狀參考 `prisma/seed.ts`），
  `DELETE` 之後用 `count()` 確認三張子表都空了。
  **第 3 步必須用 `prisma` 直接查、不能用 API** —— 要驗的是資料庫層級的行為。
  這是 Ch1 的 `onDelete: Cascade` 第一次被自動化測試實際驗證
- E2E 3 個案例：刪掉後 `GET` 回 404 / 刪不存在的 id 回 404 / cascade

**共通原則：** 一次做完一個端點（service → controller → E2E → 跑測試），不要兩個一起寫。
每個端點**寫的當下**就補 E2E，不要留到最後。
驗收是三個都綠：`pnpm test:e2e`（目標 16 passed）、`pnpm exec tsc --noEmit`、`pnpm lint`。

**寫完之後的 Ch2 剩餘工作：** `docs/chapters/ch02-*.md`（核心概念 / 決策取捨 / 踩到的坑 / 作業）、
`docs/設定檔導讀.md` 補 `setupFiles`、`docs/專案速查.md` 的檔案地圖與閱讀動線、進度表改 ✅。

**已知要寫進 ch02 的坑：**
1. `.env.test` 從 Ch0 起就**從來沒被載入過** —— `jest-e2e.json` 沒有 `setupFiles`，
   `health.e2e-spec.ts` 檔頭那句「連 `.env.test`」一直是錯的（Ch2 開頭發現並修正）
2. `Test.createTestingModule` 建的 app **不套用 `main.ts` 的全域設定** →
   手測回 400、E2E 回 201。解法是抽 `src/setup-app.ts` 兩邊共用
3. `jest-e2e.json` 的 `<rootDir>` 是**設定檔所在目錄**（`test/`），不是專案根目錄
4. DTO 屬性的 `!`（definite assignment assertion）在本專案**不需要** ——
   `tsconfig.json` 只開 `strictNullChecks`，沒開 `strict` / `strictPropertyInitialization`
5. `whitelist: true` 判斷的是「屬性**有沒有驗證裝飾器**」，不是「class 有沒有宣告它」。
   新增欄位忘了加裝飾器 → 該欄位被無聲丟掉，症狀是「怎麼傳都存不進去」
6. **一個 `it` 只驗一件事。** 曾把「200 回傳問卷」和「404」寫在同一個 `it` 裡，測試照樣綠 ——
   但**斷言失敗會中斷整個 `it`**，前面的 200 一紅，後面的 404 根本不會執行，
   等於那條路默默失去保護，而且從測試報告上完全看不出來
7. **改程式碼會讓註解過期。** 加了 `NotFoundException` 之後，`surveys.service.ts` 檔頭
   那句「它不知道 HTTP 的存在 —— 沒有狀態碼」就變成錯的（404 就是狀態碼）。
   **註解寫錯比沒寫更糟**，因為之後你會相信它。順帶帶出一個取捨：
   service 丟 HTTP 例外破了分層，但另外兩種做法在 Ch2 都太重，Ch6 會回頭重看

**Ch2 不做的事：** 分頁/排序/篩選（Ch4）、Question 巢狀資源（Ch3）、
統一錯誤處理 Filter（Ch6）、Swagger（Ch7）、單元測試（這章沒有商業邏輯）。

> **加分項（非前提）：** 讀 NestJS 官方文件 Overview 前四篇
> （First steps / Controllers / Providers / Modules，約一小時）。內容與閱讀動線的九個檔案
> 一一對應，等於同一件事的第二個講法。
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
| Ch2 | 第一個 CRUD（Surveys）+ **測試資料庫隔離** | DTO 驗證、404 處理、`.env.test` 與資料清理 | ⬜ |
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

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束 —— Ch1 的前置觀念（不含 Prisma 語法） |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
