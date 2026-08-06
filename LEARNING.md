# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 目前狀態與下一步

> 換機或開新對話時**先讀這一節**。對話歷史與 AI 記憶都在 `~/.claude/` 底下，不跟 git 走 ——
> 這裡沒寫的東西，換一台機器就等於沒發生過。

**進度：** Ch0 完成（含理解驗收），**Ch1 進行中 —— 停在 schema 寫到一半**（詳見下方「Ch1 接續點」）。

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

原則不變：**確認前一章讀得懂，再進下一章。**

---

### Ch1 接續點（2026-08-06 停在這裡）

`prisma/schema.prisma` 目前**只寫了 `Survey` 與 `enum SurveyStatus`**，是教練示範的範本
（`[教學]` 註解裡寫了三個決策的理由：為什麼用 cuid、為什麼狀態只放兩個值、
為什麼 `questions Question[]` 不會產生欄位）。

> **`pnpm exec prisma validate` 現在一定會報
> `Type "Question" is neither a built-in type...` —— 這是預期的，不是 bug。**
> `Survey` 已經提到了還不存在的 model，三個補齊後就會消失。不要為了消掉紅線去改 `Survey`。

**下一步：自己寫 `Question` / `Response` / `Answer` 三個 model**（教練模式，寫完再 review）。
背後的觀念全在 [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md)，這一步只是翻譯成 Prisma 語法：

| model | 要有的東西 |
| --- | --- |
| `Question` | 主鍵、外鍵 → Survey、題目文字、`enum QuestionType`（**只做 `SINGLE_CHOICE` / `TEXT`**）、`options String[]`、`order Int`（**表沒有固有順序**，所以排序必須是欄位）、`answers Answer[]`、外鍵索引 |
| `Response` | 主鍵、外鍵 → Survey、填答時間、`answers Answer[]`、外鍵索引。**`userId` 是 Ch9 才加，現在不要預留** |
| `Answer` | 主鍵、**兩個**外鍵（Response 與 Question）、內容字串、`@@unique([responseId, questionId])`、兩個外鍵各自的索引 |

**三個要自己判斷並說得出理由的地方：**
`Answer.responseId` 的 `onDelete`、`Answer.questionId` 的 `onDelete`
（跟「一旦有人填答就不能再改題目」這條規則是什麼關係？）、
以及 `Question.surveyId` 與 `Response.surveyId` 的 `onDelete` 是否相同。

三個 model 寫完之後的 Ch1 剩餘工作：

1. `pnpm exec prisma validate` → `pnpm exec prisma migrate dev --name init_survey_schema`
   → `pnpm exec prisma generate`（**`migrate dev` 不會自動產生 client**）
   - **可能踩的坑：shadow database。** Neon 不一定允許 CLI 自己建臨時資料庫。
     真的失敗再處理：Neon 開一個 branch 當 shadow → `.env` 加 `SHADOW_DATABASE_URL`
     （同步補進 `.env.example`）→ `prisma.config.ts` 的 `datasource` 加 `shadowDatabaseUrl`。
     **失敗時不要亂試 `reset` 或手動去 Neon 建表**，migration 歷史搞亂比原錯誤難救。
2. **讀 `prisma/migrations/<timestamp>_init_survey_schema/migration.sql`** ——
   本章 CP 值最高的一步，把 `@relation` → `FOREIGN KEY`、`@@unique` → `CREATE UNIQUE INDEX`
   一條一條對回去，並確認 `questions Question[]` 在 SQL 裡找不到對應欄位。
   `prisma/migrations/` **要進版控**。
3. `prisma/seed.ts`（一份 DRAFT + 一份 PUBLISHED 問卷，用 `upsert` 保證可重複執行）；
   `prisma.config.ts` 的 `migrations` 加 `seed: 'tsx prisma/seed.ts'`（`tsx` 已安裝）。
   **`prisma/seed.ts` 要加進 `tsconfig.build.json` 的 `exclude`** ——
   它在 `src/` 外面，不排除會把 `rootDir` 撐大，輸出變成 `dist/src/main.js`
   （跟 `prisma.config.ts` 同一個坑）。
4. 把 `prisma/seed.ts` 插進閱讀動線的「下一站」鏈（接在 `prisma.config.ts` 之後），
   並更新 `docs/專案速查.md` 的閱讀動線圖與檔案地圖。
5. 補 `docs/chapters/ch01-*.md`，更新進度表。

**Ch1 不做的事：** 不寫 E2E 測試（Ch2 才開始）、不建 `.env.test`（Ch2）、
不寫任何 controller / service / DTO、不用 `db push` 取代 `migrate dev`。

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
| Ch1 | Schema 設計、第一次 migration、seed | 資料模型設計、migration 是什麼 | ⬜ |
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

## 跨章節文件

| 文件 | 內容 |
| --- | --- |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 主鍵、外鍵、一對多、唯一約束 —— Ch1 的前置觀念（不含 Prisma 語法） |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令速查、檔案地圖、換機接續、程式碼閱讀動線 |
| [`docs/從零建置.md`](docs/從零建置.md) | 空資料夾 → `GET /health` 的完整建置過程 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | `package.json` 與 `test/jest-e2e.json` 各欄位的意思 |

> **這個檔案只放進度與索引，不放章節內容。** 這樣它不會隨章節增加而膨脹，
> 每次開工第一眼看到的永遠是「我到哪了、下一步是什麼」。
