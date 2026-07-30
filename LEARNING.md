# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

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

# Ch0 — 環境建置

**成果：** `GET /health` 回傳 `{"status":"ok","database":"connected"}`，並有一支 E2E 測試守住它。

---

## 核心概念

### 依賴注入（Dependency Injection, DI）

這是理解 NestJS 的第一把鑰匙。看這行：

```ts
constructor(private readonly prisma: PrismaService) {}
```

你**沒有**寫 `new PrismaService()`。你只是宣告「我需要一個 PrismaService」，由 NestJS 負責建立實例並傳進來。

為什麼要這樣？三個實際好處：

1. **單例共享** — 整個應用只會有一個 `PrismaService` 實例，也就是只有一個資料庫連線池。如果每個 controller 各自 `new` 一個，連線數會爆掉。
2. **可替換** — 測試時可以叫 Nest 換成假的實作，不用改被測程式碼。
3. **依賴關係外顯** — 看建構子就知道這個類別依賴什麼，不用翻遍整個檔案找 `new`。

**Nest 怎麼知道要注入什麼？** 靠 TypeScript 編譯時寫入的型別 metadata。這就是 `tsconfig.json` 裡 `emitDecoratorMetadata: true` 的用途 —— 它讓 tsc 把「這個參數的型別是 `PrismaService`」這件事編譯進 JS，Nest 在執行期讀出來。

> 這也是為什麼**型別註記在 NestJS 裡不是可選的**。拿掉 `: PrismaService`，Nest 就不知道要注入什麼，會直接報錯。前端寫 TS 時型別純粹給編譯器看，後端在這裡型別會影響執行期行為 —— 這是心態上要調整的一點。

### Module — 應用的組裝單位

```ts
@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],  // 我依賴誰
  controllers: [HealthController],                       // 我提供哪些路由
  providers: [PrismaService],                            // 我內部有哪些可注入的服務
  exports: [PrismaService],                              // 我允許別人注入我的哪些服務
})
```

關鍵規則：**一個 module 只能注入「自己 providers 裡有的」或「imports 進來的 module 有 exports 的」東西。** 沒 export 就等於 private。

這跟前端的 `export` / `import` 概念相通，只是粒度是「模組」而不是「檔案」。

### 生命週期鉤子

```ts
async onModuleInit()    { await this.$connect() }     // module 建好時
async onModuleDestroy() { await this.$disconnect() }  // 應用關閉時
```

搭配 `main.ts` 的 `app.enableShutdownHooks()`，Ctrl+C 時才會真的觸發 `onModuleDestroy`。

**為什麼重要：** 沒有正確斷線的話，Jest 測試跑完不會結束（連線池還開著，Node 的 event loop 不空），部署到雲端每次重啟也會累積殭屍連線。Neon 免費方案有連線數上限，這會直接變成故障。

### Driver Adapter（Prisma 7 的重大改變）

Prisma 6 以前：Prisma 自己用 Rust 引擎連資料庫。
Prisma 7 起：**必須**透過 driver adapter，用 Node 生態的資料庫驅動（這裡是 `pg`）。

```ts
const adapter = new PrismaPg({ connectionString });
super({ adapter });
```

網路上找得到的 NestJS + Prisma 教學幾乎都是 v5/v6 的 `super({ datasources: ... })` 寫法，在 v7 會直接壞掉。**查資料時務必確認版本。**

---

## 決策取捨

### 為什麼 `PrismaModule` 用 `@Global()`

一般來說 `@Global()` 是要避免的 —— 它讓依賴關係變隱晦，看某個 module 的 `imports` 不再能得知它真正依賴什麼。

但資料庫連線是**整個應用共用的單一資源**，而且幾乎每個 feature module 都需要。若不用 `@Global()`，往後每個新 module 都得手動 import 一次 `PrismaModule`，純粹是噪音。

**判斷標準：** 只有「全應用單例、幾乎人人都要用、且不會有第二種實作」的東西才適合 `@Global()`。資料庫連線與設定服務符合，業務邏輯服務不符合。

### 為什麼 TypeScript 從 7 降到 5.9

專案初始裝的是 TypeScript 7（Go 重寫的編譯器）。但 NestJS 的 DI 依賴 `emitDecoratorMetadata`，這條路徑在 TS 7 尚未經過驗證。

**取捨：** 學習專案的目標是學會 NestJS 與資料庫，不是當工具鏈的白老鼠。降版是用「放棄一點新特性」換「排除一整類難以診斷的問題」。

**通則：** 當你同時在學習新東西 A 和使用未驗證的新工具 B，出問題時你無法判斷是 A 沒學好還是 B 有 bug。**一次只引入一個未知數。**

### 為什麼 Prisma client 要輸出到 `src/generated/`

TypeScript 的 `rootDir` 是「所有輸入檔案的共同祖先目錄」自動推導出來的。若 client 產生在根目錄的 `generated/`，`rootDir` 就會從 `src/` 被撐大到專案根目錄，編譯輸出變成 `dist/src/main.js`，`node dist/main` 就找不到進入點。

放進 `src/` 底下讓所有輸入檔案共用同一個根，路徑就穩定了。

**同樣的道理**，`prisma.config.ts` 在專案根目錄，也必須在 `tsconfig.build.json` 排除，否則同一個問題會再發生一次。**以後在根目錄新增任何 `.ts` 檔都要留意這點。**

### 為什麼 `moduleFormat = "cjs"`

`prisma-client` generator 預設輸出 ESM，程式碼裡會用到 `import.meta.url`。而 NestJS 預設編譯成 CommonJS。Node 一偵測到 `import.meta` 就把該檔案當 ES module 載入，於是 CommonJS 的 `exports` 變成未定義 → 執行期爆炸。

**取捨：** 兩種方向都可行 —— 把整個專案改成 ESM，或把 Prisma 輸出改成 CJS。選後者，因為 NestJS 生態（尤其 Jest）在 CommonJS 下摩擦最小，而學習專案不該把預算花在模組系統的邊界問題上。

### 為什麼 E2E 優先於單元測試

後端的價值在於「給定一個 HTTP 請求，回傳正確的結果並正確地改變資料庫狀態」。E2E 測試驗證的正是這件事，而且不 mock 任何東西 —— 連 SQL 有沒有寫錯都測得到。

單元測試在後端的價值相對低：service 層大多是薄薄一層轉發到 Prisma，把 Prisma mock 掉之後，測的其實是 mock 本身。

**例外：** 當 service 裡有真正的商業邏輯（計算分數、判斷條件跳題），那時單元測試才划算。

---

## 踩到的坑

| 症狀 | 根因 | 解法 |
| --- | --- | --- |
| `dist/main.js` 不存在，變成 `dist/src/main.js` | 根目錄的 `prisma.config.ts` 把 tsc 推導的 `rootDir` 撐大 | `tsconfig.build.json` 的 `exclude` 加入 `prisma.config.ts` |
| `ReferenceError: exports is not defined` | Prisma 產生 ESM，NestJS 編譯 CJS | `schema.prisma` 加 `moduleFormat = "cjs"` |
| Jest `Cannot find module '../generated/prisma/client.js'` | Jest 不會把 `.js` 副檔名解析回 `.ts` | jest 設定加 `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}` |
| `A dynamic import callback was invoked without --experimental-vm-modules` | Prisma 7 的 WASM 查詢編譯器用動態 `import()`，Jest 的 CJS 沙箱不支援 | 測試指令改用 `node --experimental-vm-modules node_modules/jest/bin/jest.js` |

> 這四個坑全部來自「Prisma 7 太新，與 NestJS 的預設設定衝突」。它們是**一次性成本** —— 設定已寫死在 repo 裡，之後不會再遇到。

---

## 換機接續（筆電 ↔ 桌電）

這個專案在兩台機器上輪流開發，所以要清楚哪些東西跟著 git 走、哪些不會。

**跟著 git 走的：** 程式碼、`LEARNING.md`、`CLAUDE.md`、`.agents/skills/`。

**不會跟的：**

| 類別 | 內容 |
| --- | --- |
| AI 工具的本機狀態 | 對話歷史、記憶、全域設定（都在 `~/.claude/`，且以絕對路徑當專案識別碼） |
| 有 gitignore 的機密／產物 | `.env`、`.env.test`、`src/generated/` |
| 含絕對路徑的連結 | `.claude/skills/*`、`.windsurf/skills/*` 的 junction |

**因此有一條原則：`LEARNING.md` 是唯一的跨機進度來源。** 一章的決策與踩坑如果只存在於對話裡，換一台機器就等於沒發生過。這也是為什麼每章結束要把這份文件補完再 commit —— 它不是心得感想，是接續工作的依據。

換機開工的步驟：

```bash
git pull
pnpm install
pnpm exec prisma generate   # src/generated 沒進版控，不跑就沒有型別
```

再照 `.env.example` 建立 `.env`（`DATABASE_URL` 從 Neon Console 的 Connection Details 複製）。

> 如果是**專案目錄改名**而非全新 clone，`node_modules` 裡 pnpm 的連結同樣存絕對路徑、同樣會全斷（症狀：`Cannot find module '.../node_modules/prisma/build/index.js'`）。此時 `pnpm install` 會跳出互動式確認，直接用 `pnpm install --force` 重裝。

最後重建 skills 的 junction。**junction 存的是絕對路徑，換機或專案目錄改名一定會斷**（曾因 `survey-api` 更名為 `survey-backend` 而全斷，見 commit `1b83a4d`）。在專案根目錄跑這段 PowerShell，不需要系統管理員權限：

```powershell
$root = $PWD
foreach ($mirror in @('.claude','.windsurf')) {
  foreach ($s in Get-ChildItem "$root\.agents\skills" -Directory) {
    $link = Join-Path "$root\$mirror\skills" $s.Name
    if (Test-Path $link) { (Get-Item $link).Delete() }
    New-Item -ItemType Junction -Path $link -Target $s.FullName | Out-Null
  }
}
```

驗證：`Test-Path .claude\skills\prisma-cli\SKILL.md` 應為 `True`。

---

## 指令速查

```bash
# 開發
pnpm start:dev          # 啟動並監看檔案變更（開發時都用這個）
pnpm build              # 編譯到 dist/
pnpm start:prod         # 跑編譯後的產物，模擬正式環境

# 測試
pnpm test:e2e           # E2E 測試（會連真實資料庫）
pnpm test               # 單元測試
pnpm lint               # ESLint 檢查並自動修正

# Prisma
pnpm exec prisma generate        # 依 schema 重新產生 client（改完 schema 一定要跑）
pnpm exec prisma migrate dev     # 產生並套用 migration（Ch1 開始用）
pnpm exec prisma studio          # 開瀏覽器 GUI 瀏覽資料
pnpm exec prisma migrate deploy  # 正式環境套用 migration（Ch14 部署用）
```

> **最常忘記的一件事：** 改完 `schema.prisma` 之後沒跑 `prisma generate`，於是 TypeScript 型別還是舊的，出現「明明欄位加了卻說不存在」的錯誤。

---

## 檔案地圖

```text
survey-backend/
├── prisma/
│   └── schema.prisma          資料模型定義（migration 與 client 的唯一來源）
├── src/
│   ├── generated/prisma/      ← prisma generate 產生，不進版控
│   ├── prisma/
│   │   ├── prisma.service.ts  PrismaClient 包成可注入的 provider
│   │   └── prisma.module.ts   @Global，讓全應用共用同一個連線池
│   ├── health/
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   ├── app.module.ts          根 module，組裝所有子 module
│   └── main.ts                進入點：建立應用、掛 shutdown hooks、監聽 port
├── test/
│   └── health.e2e-spec.ts
├── .env                       實際設定，已被 gitignore
├── .env.example               設定範本，進版控
├── api.http                   VS Code REST Client 手動測試用
├── prisma.config.ts           Prisma CLI 設定（不屬於 build 產物）
└── tsconfig.build.json        排除 prisma.config.ts，避免 rootDir 被撐大
```

---

## 作業

1. `pnpm start:dev`，開 `api.http` 送出 `GET /health`，確認回 200。
2. 故意把 `.env` 的 `DATABASE_URL` 改錯一個字元，重跑 —— **觀察錯誤發生在哪一刻**：是啟動時就失敗，還是第一次請求才失敗？為什麼？
3. 把 `health.controller.ts` 建構子的型別註記 `: PrismaService` 拿掉，看 Nest 報什麼錯 —— 這會讓你親眼看到上面提到的 metadata 機制。

---

# Ch1 — Schema 設計、第一次 migration、seed 資料

尚未開始。這章會設計四張表（Survey / Question / Response / Answer）、
跑第一次 `prisma migrate dev` 看它產生什麼 SQL，並寫一份 seed 讓開發時有資料可用。
