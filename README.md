# survey-backend

問卷管理平台的後端 API —— **NestJS 11 + Prisma 7 + PostgreSQL（Neon）**。

前端是並排的獨立 repo：[`survey-frontend`](https://github.com/Ben0614/survey-frontend)（Nuxt 4）。

| | 網址 |
| --- | --- |
| API 健康檢查 | https://survey-backend-0dku.onrender.com/health |
| Swagger UI | https://survey-backend-0dku.onrender.com/docs |
| 前端 | https://survey-frontend-1eep.vercel.app |

> ⚠️ **第一次點會等大約 50 秒。** 後端跑在 Render 免費方案，閒置一段時間後容器會被收掉，
> 下一個請求要等冷啟動。**這不是壞掉**，重新整理就好。

---

## 這個專案是什麼

功能上走通了「註冊 → 建立問卷 → 發布 → 填寫 → 看結果」整條線並部署上線。
工程上花力氣的地方不在 CRUD：

- **帳號與驗證** —— 註冊、登入、bcrypt 雜湊、JWT；
  全域 `AuthGuard` 預設拒絕，只有註冊、登入、健康檢查三支標 `@Public()` 放行
- **兩層授權** —— 角色（ADMIN）與資源擁有權分開判斷，各自對應 403 與 404
- **狀態機** —— 問卷有草稿／發布狀態，什麼狀態能改題目、能撤回、能填答各有規則
- **查詢** —— 列表的分頁、排序、多條件篩選，以及依身分而異的可見範圍
- **契約** —— Swagger 產出 OpenAPI 規格，前端的 TypeScript 型別由它自動產生
- **182 條 e2e 測試**打真實資料庫，加上 32 條單元測試守著純判斷邏輯
- **環境分離** —— 正式／開發／測試三份設定與三條資料庫 branch，互不共用密鑰

它同時是一份學習紀錄：**每一章的決策、踩到的坑、以及刻意不做的事都寫了下來**，
那些內容在 `LEARNING.md` 與程式碼的 `[教學]` 註解裡，篇幅比程式碼本身還多。

三個入口：

| 看什麼 | 內容 |
| --- | --- |
| [**`LEARNING.md`**](LEARNING.md) | 19 章的決策與踩坑紀錄。例如「測試存在不等於蓋到」（`20 passed` 全綠，因為沒有任何一條測試帶過 query 參數）、「三次抄錯，三次 `tsc` 都是 0 errors」 |
| [**「留給之後的事」**](LEARNING.md)（`LEARNING.md` 末段） | 11 條**刻意留著沒做的事**，每條都寫了為什麼現在不做、以及做了會牽動什麼 |
| **commit 訊息** | 例如 [`48bd295`](https://github.com/Ben0614/survey-backend/commit/48bd295)：列出事實、標明判準性證據（`settings/hooks` 是空的）、寫下試過而無效的做法、算出修復成本（服務網址寫在兩個 repo 的 7 個檔案 15 處）之後**決定不修** |

---

## `[教學]` 註解

`src/` 底下有 224 條 `[教學]` 開頭的註解（分佈在 56 個檔案）。密度很高，**這是刻意的**，
而且它們寫的是「為什麼這樣寫」與踩過的坑，不是逐行翻譯程式碼。

想快速判斷值不值得看，可以直接翻 [`src/surveys/surveys.service.ts`](src/surveys/surveys.service.ts) 第 88 行那段：
`where` 條件被抽成變數不是為了少打字，而是因為 `findMany` 與 `count` **必須用完全一樣的條件**——
只給 `findMany` 加篩選、`count` 忘了加的話，回應是**完全合法的 JSON**：
`data` 是篩過的、`total` 卻是全表筆數，分頁器因此顯示錯誤的頁數，而沒有任何工具會報錯。

---

## 技術棧

| | |
| --- | --- |
| 框架 | NestJS 11 —— controller（處理 HTTP）→ service（商業邏輯，幾乎不知道 HTTP 的存在）→ Prisma |
| ORM | Prisma 7 + `@prisma/adapter-pg`（driver adapter） |
| 資料庫 | PostgreSQL on Neon，三條 branch 分開給正式／開發／測試 |
| 驗證授權 | `@nestjs/jwt` + `bcryptjs`、`RolesGuard`、service 層的擁有權判斷 |
| 輸入驗證 | class-validator，搭配統一的錯誤格式與例外過濾器 |
| API 文件 | `@nestjs/swagger` —— `/docs` 給人看，`/docs-json` 給前端產型別 |
| 測試 | Jest（e2e 連真實資料庫）+ supertest |
| 部署 | 後端 Render、前端 Vercel、資料庫 Neon |

資料模型五張表：`User` / `Survey` / `Question` / `Response` / `Answer`。

## 品質基準線

```
pnpm test               32 passed     單元測試，約 3 秒，不連資料庫
pnpm test:e2e          182 passed     打真的資料庫，約 3 分鐘
pnpm exec tsc --noEmit   0 errors
pnpm lint                0 problems
```

單元測試刻意只寫在「拿掉外部依賴之後還剩下判斷邏輯」的地方（例如 CORS 來源解析、
作答規則），其餘交給 e2e——判準寫在 `LEARNING.md`。

---

## 本機跑起來

需要 **Node >= 22** 與 **pnpm 11.17.0**（`package.json` 的 `packageManager` 有釘版本）。

```bash
pnpm install
pnpm exec prisma generate     # Prisma 7 的 install 不會自動 generate，漏了會出現看似程式錯誤的 ESLint 紅線
cp .env.example .env          # 再填入 DATABASE_URL、JWT_SECRET、CORS_ORIGIN
pnpm start:dev                # http://localhost:3100，文件在 /docs
```

`.env.example` 本身就是說明文件——每個變數都寫了為什麼存在、漏填會怎麼壞、
以及哪些坑是實際踩過的（例如 `getOrThrow` 只擋 `undefined`，`JWT_SECRET=` 空字串會過關，
只有第一次登入才 500）。

常用指令：

```bash
pnpm start:dev      # 開發（watch）
pnpm test           # 單元測試
pnpm test:e2e       # e2e（需要 .env.test，指向另一個資料庫）
pnpm lint           # ESLint（--fix）
pnpm build          # 建置（prebuild 會先跑 prisma generate）
```

E2E 連的是**另一條資料庫 branch**，設定在 `.env.test`。少了它，
`test/setup-env.ts` 的防呆會直接擋下並印出步驟——**那是預期行為**，
因為沒有它，測試會安靜地跑在開發資料庫上並把資料 `TRUNCATE` 掉。

完整的環境重建步驟（含換一台機器要做什麼）寫在
[`docs/專案速查.md`](docs/專案速查.md) 的「換機接續」。

---

## 文件

| 文件 | 內容 |
| --- | --- |
| [`LEARNING.md`](LEARNING.md) | 決策與踩坑的主線紀錄，也是進度的唯一來源 |
| [`docs/專案速查.md`](docs/專案速查.md) | 指令、檔案地圖、閱讀動線、換機接續、除錯流程 |
| [`docs/chapters/`](docs/chapters) | 19 章各自的細節（ch00 環境建置 ～ ch18 前端部署） |
| [`docs/關聯式資料庫基礎.md`](docs/關聯式資料庫基礎.md) | 正規化、外鍵、唯一約束的作用範圍 |
| [`docs/錯誤處理與狀態碼.md`](docs/錯誤處理與狀態碼.md) | 這個專案怎麼決定回哪個狀態碼 |
| [`docs/設定檔導讀.md`](docs/設定檔導讀.md) | 每個設定檔為什麼長那樣 |
| [`docs/Prisma速查.md`](docs/Prisma速查.md) | Prisma 的常用操作與陷阱 |
