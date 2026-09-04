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
  - 每個檔案開頭有一段 `[教學]` 檔頭：一句話說明角色、2-4 行說明何時被執行，最後一行是「下一站：<檔案>」。這串「下一站」把所有檔案接成一條閱讀動線，起點是 `src/main.ts`，終點是 `src/surveys/survey.rules.spec.ts`（完整順序見 `docs/專案速查.md` 的「閱讀動線」）。**新增檔案時要把它插進這條動線，別讓鏈斷掉 —— 而且同一份文件的「檔案地圖」也要一起加。** 只寫了動線那條規則的結果是檔案地圖漏了兩份 DTO、漏了兩章才被發現（Ch4 ③ 坑 #16）。
  - **實測推翻既有說法時，要立刻全域搜一次那個說法。** 只在新寫的地方記錄正確版本不夠 —— 舊的那句還躺在原地，而且常常更容易被先讀到。註解過期已經六次，第六次錯的那句就在同一支方法的結尾，正確版本則在同一輪剛寫進去的上方註解裡。
  - Prisma 7 因版本太新而衍生的相容性設定（`moduleFormat = "cjs"`、`--experimental-vm-modules`、`moduleNameMapper`），註解要明確標示「這現階段可以跳過」，避免使用者把力氣花在與學習目標無關的地方。
  - `package.json` 與 `test/jest-e2e.json` 是純 JSON **不能加註解**，它們的說明寫在 `docs/設定檔導讀.md`。
- 教練模式：使用者要自己寫程式碼再 review。除非明確要求「幫我寫」，否則優先解釋概念與取捨，而非直接產生整段實作。
- **每一輪開工前先給一份指引。** 「解釋概念與取捨」可以有一百種長相，這裡指定的是實際有效的那一種（2026-08-18 由使用者確認）。五個要素，缺一個就少一半價值：
  1. **逐檔案列出「這一輪要改什麼」，但不給實作程式碼。** 說到屬性名、裝飾器、方法簽名為止。`const where = { ... };  // 你來寫` 這種「形狀給你、內容你填」的骨架可以，完整實作不行。不必改的檔案也要點名（「controller 不用改 —— 想一下為什麼」），那本身就是一題。
  2. **每個決定都附「為什麼」，並指回已經學過的地方。** 例：「`status` 要 `@IsOptional()` 而 `sort` 不用 —— 差別是有沒有預設值（同 `update-survey.dto.ts` 的 `PartialType`）」。指回去的動作本身就是複習，也讓使用者看到同一條規則的第二次現場。
  3. **把這一輪最容易錯的那一點單獨標成「重點」，並說清楚錯了會長什麼樣。** 要具體到症狀：「`data` 是篩過的、`total` 卻是全表筆數，`totalPages` 算出 5 頁但第 2 頁開始全是空的 —— 完全合法的 JSON，沒有任何錯誤訊息」。**只說「要小心 X」沒有用**，要讓人看見壞掉的樣子。能給結構性對策就給（「抽成同一個變數，讓兩邊不一致在結構上不可能發生」），不要只給「記得兩邊都加」這種靠紀律的對策。
  4. **留一到兩個「自己想」的提示 —— 給線索，不給答案。** 例：「`q` 是 `undefined` 時不能寫成 `{ contains: undefined, mode: 'insensitive' }` —— 想一下那樣 Prisma 收到的是什麼」。判準：**卡住只會白費時間的（語法、API 形狀、套件慣例）直接給；想得出來的（機制、後果、取捨）留白。**
  5. **最後才給測試名稱**（規格見下一條），並點名哪一條是「這一輪的主角」——也就是唯一會抓到第 3 點那個 bug 的測試。
  **順序不能反過來**：先講結構與取捨，最後給測試名稱。反過來會變成照著測試名稱猜實作的填空題。
- **一輪只做一個能獨立驗收的主題。** Ch4 ② 拆成「先排序、再篩選」兩輪，因為兩者踩的坑性質完全不同（一個動 `orderBy`、一個動 `where`），混在一起紅燈時難定位。**判準：這兩件事會不會在同一條測試裡同時失敗？會，就拆成兩輪。**
- **review 只講會影響行為的事。** 註解過期、命名、文件同步**一律不要在實作過程中提** —— 那些是 AI 在該章收尾時統一處理的工作，不是丟回給使用者的 review 項目。實作階段的 review 只該包含：正確性錯誤、會炸的邊界、測試沒蓋到的路徑、以及「這個決定之後會付什麼代價」。收尾時再一次掃過所有註解與文件。
  （「註解過期」仍然是這個專案的重要教訓，值得寫進章節文件的「踩到的坑」；差別在**寫下來**而不是**在實作中途反覆提醒**。）
- **收尾要有終點線。** 實作階段有 e2e 綠燈當驗收，收尾沒有，所以會一直「再掃一次註解」「再補一句」—— Ch7 的收尾動了 4 個 commit，其中 `fcddc29` 回頭改的 `src/swagger.ts`，`5fb759d` 已經改過同一支。三條規矩：
  1. **先列清單再動手，一次改完一次 commit。** 開始收尾前把要改的東西點名（哪幾份檔頭、哪幾句過期註解、文件哪幾節、`api.http` 與 `LEARNING.md` 要加什麼），照清單做完再 commit。不要出現「補完發現還有」而回頭碰同一支檔案第二次。
  2. **章節文件目標 200 行以內**（`docs/chapters/chNN-*.md`）。Ch7 寫了 477 行。四節照舊（核心概念 / 決策取捨 / 踩到的坑 / 作業），但「坑」只寫**真的踩到並改過程式碼**的，不寫「可能會踩」。
  3. **檔頭在實作最後一輪就寫完，不留到收尾。** 檔案剛寫完的當下最清楚它的角色與「下一站」，隔幾輪再補等於重讀一次。收尾只負責「掃一遍有沒有漏」，不負責從頭寫。
- **請使用者寫測試時，先把測試名稱給他。** 要幾條就給幾條，一條不多一條不少 —— 數量本身就是「這一輪要蓋到哪些路徑」的清單。做法：
  - 給一個**可直接貼上的程式碼區塊**，標明每條所屬的 `describe`（`describe` 與實際請求對不上是踩過五次的坑）。
  - 名稱要說「**驗什麼**」而不是「測哪個功能」，包含**具體輸入 + 預期結果**（含狀態碼）。好的例子：`不給參數時預設第 1 頁、每頁 10 筆`、`page=2 回最後 1 筆，也就是最舊的那筆`、`page 小於 1 時回 400`。壞的例子：`分頁`、`分頁2`、`不帶參數`。
  - **同一個 `describe` 內不得有重複名稱** —— Jest 失敗時只印名稱，撞名等於診斷價值歸零。
  - 名稱之後再用散文補每條的前提資料與斷言重點（這部分照舊）。
  - 理由：命名本來就是 AI 該負責的部分（同上一條）。讓使用者先取名、review 時再要求改，是同一件事做兩次。**只往前套用，不要回頭改既有測試的名稱。**
- **不要用「程式碼能跑」當成使用者已理解的證據。** Ch0 的程式碼由 AI 產生、作業也做出預期結果，但使用者其實看不懂 —— 進度表的 ✅ 只代表環境可用。進入新章節前先確認前一章的程式碼使用者讀得懂。

## 常用指令

套件管理器是 **pnpm**。

```bash
pnpm start:dev                   # 開發（watch）
pnpm build                       # 編譯到 dist/
pnpm start:prod                  # node dist/main

pnpm test                        # 單元測試（rootDir=src，*.spec.ts）
pnpm test:e2e                    # E2E 測試（rootDir=.，test/*.e2e-spec.ts，連真實資料庫）
pnpm kill:jest                   # 清掉殘留的 jest 行程（test:e2e 之前會自動跑，很少要手動）
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

> **e2e 的三個防呆（2026-08-22 加，別隨手拿掉）**：`test:e2e` 的 `--forceExit`（否則 jest 跑完不結束）、`pretest:e2e` 自動清殘留行程（否則孤兒累積到下一輪炸掉）、`test/setup-env.ts` 的 keep-alive patch（否則隨機 ECONNRESET，實測 16/9/14 條 → 0/0/0）。三者各自解決不同的問題，說明分別在 `docs/設定檔導讀.md` 與 `docs/專案速查.md`。

## 架構重點

`src/main.ts` → `AppModule`（`ConfigModule.forRoot({ isGlobal: true })` + `PrismaModule` + feature modules）。新增 feature 時：建立 `src/<feature>/` 放 controller / service / module，並在 `AppModule.imports` 註冊。

**`PrismaModule` 是 `@Global()`**，所以 feature module 不需要 import 它，直接在 constructor 注入 `PrismaService` 即可。這是刻意的例外（全應用單一連線池），不要把這個模式套用到業務邏輯 service。

**`PrismaService` 繼承 `PrismaClient`**，並在 `onModuleInit`/`onModuleDestroy` 管理連線。`main.ts` 有 `app.enableShutdownHooks()`，拿掉會導致連線不釋放（Jest 卡住、部署後連線數累積）。

### Prisma 7 的關鍵差異（網路上多數教學是 v5/v6，不適用）

- **必須用 driver adapter 連線**：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`；`schema.prisma` 的 `datasource` **不寫 url**，連線字串由 `prisma.config.ts`（CLI）與 `PrismaService`（執行期，經 `ConfigService.getOrThrow('DATABASE_URL')`）各自提供。
- **Client 產生到 `src/generated/prisma/`**（不進版控），import 路徑為 `../generated/prisma/client`。
- **`moduleFormat = "cjs"`** 必須保留，否則 NestJS 的 CJS 輸出會遇到 `exports is not defined`。
- Jest 兩份設定都有 `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}`，用來把 `.js` import 解析回 `.ts`。**這個設定仍然必要**：`src/generated/` 底下 Prisma 產的程式碼**內部互相 import 時帶著 `.js`**（例如 `client.ts` 裡的 `from "./enums.js"`），Jest 得靠它才找得到。

### import 路徑的寫法

**相對路徑一律不帶副檔名**（`.js` / `.ts` 都不寫），也**一律不用 `src/` 開頭的絕對路徑**（`baseUrl` 只管編譯期，執行期的 Node 不吃 —— `tsc --noEmit` 會是綠的，`pnpm test:e2e` 卻 `Cannot find module`）。

專案是 CJS（`package.json` 沒有 `"type": "module"`），CJS 解析規則允許省略副檔名，這也是 NestJS 的預設寫法。只有 ESM 專案才**規定**要帶 `.js`（而且要寫編譯後的 `.js` 指向 `.ts` 檔）—— Prisma 產物帶 `.js` 是為了同時支援 ESM 使用者，不是這個專案的寫法，**不要跟著抄**。

### 換行一律 LF

**repo 裡（也就是 git 索引裡）存的一律是 LF**，工作區是什麼則要看這台機器的 `core.autocrlf`。

```bash
git config --get core.autocrlf     # 這台機器是什麼
git ls-files --eol <檔案>          # 權威答案：i/ 是索引、w/ 是工作區
```

`git ls-files --eol` 印出 `i/lf w/crlf` 代表**索引是 LF、工作區被轉成 CRLF** —— 那是 `core.autocrlf=true` 的正常結果，**不是問題**。要盯的只有 `i/` 那一欄。

> **2026-08-22 更正兩件事**（原本這裡寫錯了）：
>
> 1. 這台機器的 `core.autocrlf` 實際是 **`true`**（原本寫 `false`）。它是**每台機器各自的本機設定、不跟著 git 走**，所以另一台可能不一樣 —— 用上面那行指令確認，不要假設。
> 2. **原本教的檢查法會誤判。** 用 `file <檔案>` 看工作區、或把 `git show HEAD:<檔案>` 的輸出拿去數 CR，都會受簽出轉換影響，在 `autocrlf=true` 的機器上一律報 CRLF，看起來像是 commit 錯了。今天實際被這個假警報騙過一次。**唯一可信的是 `git ls-files --eol` 的 `i/` 欄。**

用腳本批次改檔案時仍然要注意：Windows 上 Python 的 `open(..., 'w')`、PowerShell 的 `Out-File` 預設寫出 CRLF。`autocrlf=true` 會在 commit 時幫你轉回 LF，但**不要依賴它** —— 另一台機器若是 `false` 就不會轉，於是 git 認為整個檔案每一行都變了：內容只改 500 行、diff 卻是 2600 行（實際發生過，commit `a1b5e45`，已 amend 修掉）。

安全的寫法：讀檔用 `newline=''` 保留原樣、寫回也用 `newline=''`，不要讓工具自作主張。真的跑掉了用 `sed -i` 把行尾的 CR 去掉。

（`tsconfig.json` 與 `eslint.config.mjs` 本來就是 CRLF，不用動它們。）

### 在專案根目錄新增任何 `.ts` 檔時

必須同步加入 `tsconfig.build.json` 的 `exclude`（如同現有的 `prisma.config.ts`）。否則 tsc 推導的 `rootDir` 會從 `src/` 擴大到專案根目錄，編譯輸出變成 `dist/src/main.js`，`pnpm start:prod` 直接找不到進入點。

## 測試策略

**E2E 優先**：後端絕大多數程式碼是「HTTP 請求 → Prisma → 資料庫狀態」的轉發，mock 掉 Prisma 等於在測 mock。E2E 測試連真實資料庫（Neon test branch，`.env.test`），從 Ch2 開始每章的驗收標準就是該章 E2E 綠燈。

**單元測試只寫在有真正商業邏輯的地方**——目前全專案只有一支：`src/surveys/survey.rules.spec.ts`。

判準不是「這段程式碼重不重要」，而是**「拿掉外部依賴之後還剩下什麼」**——剩下判斷邏輯才值得單元測試，什麼都不剩就別寫。`survey.rules.ts` 的四個函式都符合（純判斷、無依賴、不碰 HTTP）：

- `canEditQuestions(status)` —— 只有 `DRAFT` 能增刪改題目（Ch3）
- `canUnpublish(responseCount)` —— 沒有任何填答才能撤回發布（Ch3）
- `canSubmitResponse(status)` —— 只有 `PUBLISHED` 的問卷能被填答（Ch5）
- `canManageSurvey(ownerId, user)` —— 擁有者或 `ADMIN` 才能管這份問卷（Ch12）

前三條回答「這件事現在能不能做」（→ 409），第四條回答「你能不能碰」（→ 403），而**授權要排在商業規則之前**。

**新規則一律加進 `survey.rules.ts`，不要寫進 service**——寫進 service 就得啟動 Nest 才測得到。加完**回頭改一次那個檔案的檔頭**：它從 Ch5 到 Ch12 一直寫著「兩條商業規則」，漏了七章沒人發現。

單元測試另一個獨有的價值是**它到得了 e2e 到不了的地方**：`canManageSurvey(null, 一般使用者)` 這個分支要靠「無主問卷」才觸發，而 e2e 的前提資料一律有擁有者，造不出來。

不要回頭補測試：測試要在寫功能的當下寫，否則只是驗證「現在的行為」。

## 環境變數

`.env` / `.env.test` 已 gitignore；新增變數時同步更新 `.env.example`（只放 key 的形狀）。本機 `PORT=3100`，`api.http` 也寫死這個 port。

這個專案在兩台機器上輪流開發。若遇到「`src/generated` 不存在」「skills 連結壞掉」「`.env` 缺失」這類環境問題，多半是剛換機器 —— 重建步驟見 `docs/專案速查.md` 的「換機接續」一節。

## 其他

- `.claude/skills/` 下有一組 Prisma 官方 skills（由 `skills-lock.json` 管理，`.agents/` 與 `.windsurf/` 是同一份的鏡像）。查 Prisma CLI / Client API 用法時優先使用它們。
- 手動打 API 用 `api.http`（VS Code REST Client，擴充套件 `humao.rest-client`）。用法與踩過的坑寫在 `docs/專案速查.md` 的「`api.http` 怎麼用」。
- ESLint 忽略 `src/generated/**`（Prisma 產生的程式碼）。
