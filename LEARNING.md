# 問卷管理平台 — 後端學習歷程

從零打造一個前後端分離的問卷平台，補齊資料庫與後端能力。
技術棧：**NestJS 11 + Prisma 7 + PostgreSQL (Neon)**，前端 Nuxt 3。

學習方式是**教練模式**：每章由教練講解概念與取捨、示範第一個範例，其餘同類程式碼自己寫完再 review。

---

## 進度表

### 階段一：NestJS + Prisma + PostgreSQL

| 章節 | 主題 | 狀態 |
|:---:|---|:---:|
| Ch0 | 環境建置與 `/health` | ✅ |
| Ch1 | Schema 設計與第一次 migration | ⬜ |
| Ch2 | 第一個 CRUD（Surveys） | ⬜ |
| Ch3 | 巢狀資源與關聯查詢（Questions） | ⬜ |
| Ch4 | 交易與巢狀寫入（Responses） | ⬜ |
| Ch5 | 錯誤處理與例外過濾器 | ⬜ |
| Ch6 | Swagger API 文件 | ⬜ |
| Ch7 | E2E 測試 | ⬜ |

### 階段二：JWT 與權限控管

| 章節 | 主題 | 狀態 |
|:---:|---|:---:|
| Ch8 | User model、bcrypt、註冊登入 | ⬜ |
| Ch9 | JWT 與全域 AuthGuard | ⬜ |
| Ch10 | RBAC：只有管理員能刪問卷 | ⬜ |
| Ch11 | 資源層授權：只能改自己的問卷 | ⬜ |

### 階段三：前端串接與部署

| 章節 | 主題 | 狀態 |
|:---:|---|:---:|
| Ch12 | Nuxt 3 串接與 token 存放 | ⬜ |
| Ch13 | CORS 與環境變數分離 | ⬜ |
| Ch14 | 部署上雲（Render + Neon） | ⬜ |

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
|---|---|---|
| `dist/main.js` 不存在，變成 `dist/src/main.js` | 根目錄的 `prisma.config.ts` 把 tsc 推導的 `rootDir` 撐大 | `tsconfig.build.json` 的 `exclude` 加入 `prisma.config.ts` |
| `ReferenceError: exports is not defined` | Prisma 產生 ESM，NestJS 編譯 CJS | `schema.prisma` 加 `moduleFormat = "cjs"` |
| Jest `Cannot find module '../generated/prisma/client.js'` | Jest 不會把 `.js` 副檔名解析回 `.ts` | jest 設定加 `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}` |
| `A dynamic import callback was invoked without --experimental-vm-modules` | Prisma 7 的 WASM 查詢編譯器用動態 `import()`，Jest 的 CJS 沙箱不支援 | 測試指令改用 `node --experimental-vm-modules node_modules/jest/bin/jest.js` |

> 這四個坑全部來自「Prisma 7 太新，與 NestJS 的預設設定衝突」。它們是**一次性成本** —— 設定已寫死在 repo 裡，之後不會再遇到。

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

```
survey-api/
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

# Ch1 — Schema 設計與第一次 migration

*（尚未開始）*
