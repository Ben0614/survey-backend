# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案性質

這是一個**教學型專案**：目標不只是寫出可運作的問卷平台，而是照著 `LEARNING.md` 的 18 章課綱逐章建立後端能力（NestJS 11 + Prisma 7 + PostgreSQL/Neon，前端另有獨立的 Nuxt 3 專案）。

因此：

- **`LEARNING.md` 是唯一的進度與範圍來源。** 動手前先確認目前在哪一章、該章的驗收標準是什麼；不要提前實作後面章節的功能。它**只放進度表與索引**，不放章節內容。
- 每章完成後：在 `docs/chapters/chNN-<主題>.md` 補上該章的「核心概念 / 決策取捨 / 踩到的坑 / 作業」，然後更新 `LEARNING.md` 的進度表狀態與章節索引。**不要把章節內容寫回 `LEARNING.md`** —— 18 章會把它撐爆。
- 跨章節的參考（指令、檔案地圖、換機步驟、程式碼閱讀動線）放 `docs/專案速查.md`，那份文件反映現況、隨時更新；不要把它們塞進某一章。
- **註解採兩種並行的寫法**（使用者目前是 NestJS / Prisma 初學者）：
  - `// [教學] ...` —— 解釋「這行在做什麼」的鷹架註解。密度是**逐段不逐行**：每個「做一件事」的段落配一個註解區塊，`import` 這種一看就懂的不寫。**同一個概念只解釋一次**，後續檔案改寫「（見 `xxx.ts` 檔頭）」指回去。這批註解是暫時的，使用者熟悉後會搜尋 `[教學]` 整批清除。
  - 無標記的一般註解 —— 解釋「為什麼這樣選」，永久保留（見 `src/prisma/prisma.module.ts` 的 `@Global()` 說明）。**不要把既有的無標記註解改寫或加上標記。**
  - 每個檔案開頭有一段 `[教學]` 檔頭：一句話說明角色、2-4 行說明何時被執行，最後一行是「下一站：<檔案>」。這串「下一站」把所有檔案接成一條閱讀動線，起點是 `src/main.ts`，終點是 `test/surveys.e2e-spec.ts`（完整順序見 `docs/專案速查.md` 的「閱讀動線」）。**新增檔案時要把它插進這條動線，別讓鏈斷掉。**
  - Prisma 7 因版本太新而衍生的相容性設定（`moduleFormat = "cjs"`、`--experimental-vm-modules`、`moduleNameMapper`），註解要明確標示「這現階段可以跳過」，避免使用者把力氣花在與學習目標無關的地方。
  - `package.json` 與 `test/jest-e2e.json` 是純 JSON **不能加註解**，它們的說明寫在 `docs/設定檔導讀.md`。
- 教練模式：使用者要自己寫程式碼再 review。除非明確要求「幫我寫」，否則優先解釋概念與取捨，而非直接產生整段實作。
- **不要用「程式碼能跑」當成使用者已理解的證據。** Ch0 的程式碼由 AI 產生、作業也做出預期結果，但使用者其實看不懂 —— 進度表的 ✅ 只代表環境可用。進入新章節前先確認前一章的程式碼使用者讀得懂。

## 常用指令

套件管理器是 **pnpm**。

```bash
pnpm start:dev                   # 開發（watch）
pnpm build                       # 編譯到 dist/
pnpm start:prod                  # node dist/main

pnpm test                        # 單元測試（rootDir=src，*.spec.ts）
pnpm test:e2e                    # E2E 測試（rootDir=.，test/*.e2e-spec.ts，連真實資料庫）
pnpm lint                        # ESLint --fix
pnpm format                      # Prettier

pnpm exec prisma generate        # 改完 schema.prisma 一定要跑，否則型別是舊的
pnpm exec prisma migrate dev     # 產生並套用 migration
pnpm exec prisma studio
```

跑單一測試檔／單一測試：

```bash
pnpm test -- health.controller.spec.ts
pnpm test -- -t "回傳 404"
pnpm test:e2e -- test/health.e2e-spec.ts
```

> 注意測試指令是 `node --experimental-vm-modules node_modules/jest/bin/jest.js`，不是裸 `jest`——Prisma 7 的 WASM 查詢編譯器用動態 `import()`，Jest 的 CJS 沙箱沒有這個 flag 會失敗。新增測試腳本時務必保留。

## 架構重點

`src/main.ts` → `AppModule`（`ConfigModule.forRoot({ isGlobal: true })` + `PrismaModule` + feature modules）。新增 feature 時：建立 `src/<feature>/` 放 controller / service / module，並在 `AppModule.imports` 註冊。

**`PrismaModule` 是 `@Global()`**，所以 feature module 不需要 import 它，直接在 constructor 注入 `PrismaService` 即可。這是刻意的例外（全應用單一連線池），不要把這個模式套用到業務邏輯 service。

**`PrismaService` 繼承 `PrismaClient`**，並在 `onModuleInit`/`onModuleDestroy` 管理連線。`main.ts` 有 `app.enableShutdownHooks()`，拿掉會導致連線不釋放（Jest 卡住、部署後連線數累積）。

### Prisma 7 的關鍵差異（網路上多數教學是 v5/v6，不適用）

- **必須用 driver adapter 連線**：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`；`schema.prisma` 的 `datasource` **不寫 url**，連線字串由 `prisma.config.ts`（CLI）與 `PrismaService`（執行期，經 `ConfigService.getOrThrow('DATABASE_URL')`）各自提供。
- **Client 產生到 `src/generated/prisma/`**（不進版控），import 路徑為 `../generated/prisma/client.js`（帶 `.js`）。
- **`moduleFormat = "cjs"`** 必須保留，否則 NestJS 的 CJS 輸出會遇到 `exports is not defined`。
- Jest 兩份設定都有 `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}`，用來把上述 `.js` import 解析回 `.ts`。

### 在專案根目錄新增任何 `.ts` 檔時

必須同步加入 `tsconfig.build.json` 的 `exclude`（如同現有的 `prisma.config.ts`）。否則 tsc 推導的 `rootDir` 會從 `src/` 擴大到專案根目錄，編譯輸出變成 `dist/src/main.js`，`pnpm start:prod` 直接找不到進入點。

## 測試策略

**E2E 優先**：後端絕大多數程式碼是「HTTP 請求 → Prisma → 資料庫狀態」的轉發，mock 掉 Prisma 等於在測 mock。E2E 測試連真實資料庫（Neon test branch，`.env.test`），從 Ch2 開始每章的驗收標準就是該章 E2E 綠燈。

**單元測試只寫在有真正商業邏輯的地方**——目前規劃只有 `Survey.status` 那兩條規則：

- 只有 `PUBLISHED` 的問卷能被填答（Ch5）
- `DRAFT` 才能自由增刪題目；一旦有人填答就不能再改題目（Ch3）

不要回頭補測試：測試要在寫功能的當下寫，否則只是驗證「現在的行為」。

## 環境變數

`.env` / `.env.test` 已 gitignore；新增變數時同步更新 `.env.example`（只放 key 的形狀）。本機 `PORT=3100`，`api.http` 也寫死這個 port。

這個專案在兩台機器上輪流開發。若遇到「`src/generated` 不存在」「skills 連結壞掉」「`.env` 缺失」這類環境問題，多半是剛換機器 —— 重建步驟見 `docs/專案速查.md` 的「換機接續」一節。

## 其他

- `.claude/skills/` 下有一組 Prisma 官方 skills（由 `skills-lock.json` 管理，`.agents/` 與 `.windsurf/` 是同一份的鏡像）。查 Prisma CLI / Client API 用法時優先使用它們。
- 手動打 API 用 `api.http`（VS Code REST Client）。
- ESLint 忽略 `src/generated/**`（Prisma 產生的程式碼）。
