# Ch2 — 第一個 CRUD（Surveys）+ 測試資料庫隔離

**成果：** `/surveys` 五支端點（`findAll` / `create` / `findOne` / `update` / `remove`）全部可用，E2E 連 Neon 的 test branch 執行，`pnpm test:e2e` **17 passed**。

> 這一章第一次出現「一個請求從進來到回應，經過哪些檔案」的完整路徑。
> 檔案本身的閱讀順序在 [`docs/專案速查.md`](../專案速查.md) 的「閱讀動線」，這裡講的是**為什麼要分成這些檔案**。

---

## 核心概念

### 三層的分工

Ch0 只有一支 `/health`，controller 直接呼叫 prisma 也不會怎樣。這一章開始有五支端點、有驗證、有 404，分層才開始有意義。

| | 它回答的問題 | 它知道什麼 | 它**不**知道什麼 |
| --- | --- | --- | --- |
| **DTO** | 「外面**可以送進來**什麼？」 | 資料的形狀與驗證規則 | 誰會用它、資料要存去哪 |
| **Controller** | 「HTTP 的東西怎麼翻成一次方法呼叫？」 | 網址、狀態碼、body、header | 資料庫（**不該出現 prisma**） |
| **Service** | 「這件事實際上怎麼做？」 | 資料庫、商業規則 | HTTP（本章刻意破例一次，見下方取捨） |

依賴方向是**單向**的，這比上面那張表更重要：

```text
Controller ──→ Service ──→ PrismaService ──→ 資料庫
     └────→ DTO ←────┘      （DTO 誰都不依賴，只是被拿來用）
```

`Service` 完全不認識 `Controller`。三個實際的好處：

1. **換入口不用改 service。** 之後加一個 CLI 指令或排程去建問卷，直接呼叫 `surveysService.create(...)`，不必假裝發一個 HTTP 請求。
2. **商業規則有地方放，而且能單元測試。** Ch3 的「有人填答就不能改題目」會住在 service，測它不需要啟動 HTTP 伺服器。
3. **改動的影響範圍可預測。** 改 controller 不會弄壞資料庫邏輯。

Ch2 的 service 看起來只是薄薄一層轉發 —— 那是因為現在還沒有規則可放。**位置先擺對，之後才有地方放東西。**

> 卡住時的自我檢查法：**「這段需要知道 HTTP 嗎？」** 需要 → controller。
> **「需要知道資料庫嗎？」** 需要 → service。**「它只是在描述資料長什麼樣？」** → DTO。

### 一個請求的完整路徑

以 `PATCH /surveys/abc123` 帶 `{ "title": "新標題" }` 為例：

```text
① Nest 比對路由 → 找到 @Patch(':id') 對應 SurveysController.update
     ↓
② ValidationPipe 攔截（setup-app.ts 註冊的全域 pipe）
   看 @Body() 的型別註記是 UpdateSurveyDto → 拿它的規則檢查 body
   不合格 → 直接回 400，controller 根本不會被呼叫
     ↓
③ controller.update(id, dto)
   從網址抽 id、從 body 抽 dto，呼叫 service。就這樣，沒別的事
     ↓
④ service.update(id, dto)
   先 await findOne(id)（不存在就丟 404），再 prisma.survey.update
     ↓
⑤ Nest 把回傳值序列化成 JSON，配上狀態碼送出
```

第 ② 步是這一章最容易被忽略的一環：**驗證發生在 controller 之前。** 所以 controller 裡不需要寫任何 `if (!title) return 400`。

而 ValidationPipe 之所以知道要用哪一份 DTO，靠的是**參數的型別註記**（`@Body() dto: UpdateSurveyDto`）。這跟 Ch0 依賴注入靠型別找零件是同一套機制（`emitDecoratorMetadata`）——**型別寫錯或漏寫，驗證就靜靜地不生效。**

### `whitelist: true`：實質的安全措施

`setup-app.ts` 的 `ValidationPipe({ whitelist: true })` 做的事是：**DTO 沒宣告的欄位無聲丟掉**，不是報錯。

沒有它，前端硬送 `{ title: 'x', status: 'PUBLISHED' }`，那個 `status` 就有機會被塞進 `prisma.create()`，繞過「只有 PUBLISHED 的問卷能被填答」這類規則。這種漏洞有名字：**mass assignment**。

有一個關鍵細節：**`whitelist` 判斷的是「這個屬性有沒有驗證裝飾器」，不是「class 有沒有宣告它」。**

```ts
export class CreateSurveyDto {
  @IsString()
  @IsNotEmpty()
  title: string;   // 有裝飾器 → 留下

  description: string;  // 只宣告、沒裝飾器 → 一樣被丟掉
}
```

日後新增欄位忘了加裝飾器，症狀是「怎麼傳都存不進去」，而且**完全不報錯**。

> 兩道防線：`whitelist` 擋一層之後，service 的 `data: { title: dto.title }` 再明確寫一次「我只接受這個欄位」。成本很低，漏掉的代價是有人能寫入任意欄位。

### `PartialType`：把驗證變成「條件式套用」

`update-survey.dto.ts` 的 body 只有一行：

```ts
export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}
```

**`PartialType(X)` 是一個函式呼叫，不是特殊的型別語法。** 它當場算出一個新的 class，`UpdateSurveyDto` 再去繼承那個結果 —— `extends` 後面可以放任何「算得出 class 的運算式」。

它複製 `CreateSurveyDto` 時做兩件事：

- **型別層** —— `title: string` 變成 `title?: string`
- **驗證層** —— 幫每個屬性補上一個 `@IsOptional()`

關鍵在 `@IsOptional()` **不是「多一條規則」，是短路開關**：值是 `undefined` 就把該屬性其餘的規則整組跳過。

| body | `title` 的值 | 結果 |
| --- | --- | --- |
| `{}` | `undefined` | 短路 → 通過，什麼都不改 |
| `{ "title": "" }` | `""`（不是 undefined） | 不短路 → `@IsNotEmpty()` 擋下 → 400 |

這也是不能直接沿用 `CreateSurveyDto` 的原因：那一份的 `title` 是必填，「這次不想改標題」的請求會被擋在門外，**部分更新等於不成立**。

而空 body 能安全通過，還靠 Prisma 的另一個約定：

```ts
data: { title: dto.title }   // dto.title 是 undefined 時
```

**Prisma 會把這個欄位整個從 SQL 拿掉**，而不是寫入空值。所以在 Prisma 眼中 `undefined` 是「不要動它」、`null` 才是「設成空值」。我們沒有寫任何 `if` 判斷。

### 狀態碼：預設值不是限制

Nest 的預設值：

| 裝飾器 | 預設狀態碼 |
| --- | --- |
| `@Post()` | **201 Created** |
| `@Get()` / `@Patch()` / `@Put()` / `@Delete()` | **200 OK** |

只有 POST 是 201，因為 **201 的語義是「產生了一個新資源」**，只有它符合。改既有資源、查詢、刪除都沒有「新資源」。

要覆蓋才用 `@HttpCode()`。`remove` 是這一章第一個「真的可以選」的場合（見下方取捨）。

### 測試資料庫隔離：三道機制

E2E 會 `TRUNCATE` 資料表。連錯資料庫的代價是把開發資料清光，所以這一章的隔離不是可選項。

| 檔案 | 負責什麼 |
| --- | --- |
| `test/jest-e2e.json` 的 `setupFiles` | 指定一個「比所有測試檔都早」執行的檔案 |
| `test/setup-env.ts` | 把 `DATABASE_URL` 換成測試資料庫，並做兩道防呆 |
| `test/helpers/reset-db.ts` | 一句 `TRUNCATE ... CASCADE` 清四張表，各測試在 `beforeEach` 呼叫 |

**`setupFiles` 的時機是關鍵。** 它在測試框架載入任何測試檔之前執行，比 `beforeAll` 更早 —— 剛好趕在 `AppModule` 的 `ConfigModule` 去讀 `.env` 之前。而 dotenv 的 `config()` **預設不覆寫已存在的 `process.env`**，所以先灌進去的 `.env.test` 就搶贏了。

兩道防呆都刻意選擇「大聲失敗」而不是「有預設值」：

1. **`.env.test` 不存在 → throw**，並印出重建步驟。fallback 到 `.env` 等於安靜地清空開發資料庫。
2. **`.env.test` 的 `DATABASE_URL` 與 `.env` 相同 → throw**。因為「複製 `.env` 過來改個檔名」是很自然的動作，而那樣做出來的檔案指向同一個資料庫。

> 通則：**會造成資料遺失的設定，寧可大聲失敗，也不要有預設值。**

`beforeEach` 而不是 `beforeAll`，是為了讓每個測試從空資料庫開始。共用資料會讓測試互相污染，而 Jest 不保證執行順序 —— 症狀是「單獨跑會過、一起跑會失敗」，最難查的那種。

### 「綠燈」不等於「有被保護」

這是這一章實際付出最多代價換來的一課，值得獨立成節：**一條測試會不會抓到問題，跟它是不是綠的，是兩件事。**

判準只有一個：**把它該抓的東西弄壞，看它會不會叫。**

`remove` 的 cascade 測試就是用這個方法確認的 —— 拿掉 `schema.prisma` 裡 `Question` 的 `onDelete: Cascade`、跑 `migrate dev`，那條測試必須變紅。不會變紅的測試，不管寫得多漂亮，都只是佔位子。

具體踩到的四種「假綠」樣態記在下方「踩到的坑」。

---

## 決策取捨

### E2E 優先，這一章不寫單元測試

後端絕大多數程式碼是「HTTP 請求 → Prisma → 資料庫狀態」的轉發。把 Prisma mock 掉之後，測的其實是 mock 本身。

Ch2 的五個方法**沒有任何一行商業判斷** —— 沒有東西值得單元測試。單元測試留給真正有判斷邏輯的地方（`Survey.status` 那兩條規則，Ch3 / Ch5）。

代價是每次跑測試都要連真實資料庫，慢一點、而且需要網路。**接受這個代價，換取「測到的是真的行為」。**

### service 丟 HTTP 例外（刻意破分層）

`findOne` 找不到資料時直接 `throw new NotFoundException`，而 404 是不折不扣的 HTTP 概念 —— 嚴格說這破了「service 不知道 HTTP」的分層。

另外兩種做法都更「正確」，但在 Ch2 都太重：

| 做法 | 為什麼這一章不用 |
| --- | --- |
| controller 接住 `null` 再轉成 404 | 每一支端點都要重寫一次同樣的判斷 |
| 自訂錯誤型別 + Exception Filter | 那是 Ch6 的正題，現在做等於提前把作業寫掉 |

**這是一道刻意留著的裂縫，Ch6 有了 Exception Filter 之後會回頭重看。** 註解裡明確標記了它，才不會被誤讀成疏忽。

### 404 用「先 `findOne` 再操作」，不用 `catch P2025`

`update` 和 `remove` 都是先 `await this.findOne(id)` 借它丟例外，再執行真正的操作。

代價是**同一筆資料查了兩次**。另一種寫法是直接操作、`catch` Prisma 的 `P2025`（紀錄不存在），一次查詢就夠。

選前者的理由是**直白且可重用**：`remove` 寫的時候，那一行原封不動搬過來就成立了。而 `catch P2025` 的路徑是 Ch6 Exception Filter 的正題，屆時會回頭比較兩者。

**少了那一行不是「一樣 404、只是訊息不同」，而是 500** —— Prisma 丟 `P2025`，Nest 不認識這個錯誤碼，就當成沒預期的例外。對前端差很多：404 是「這東西不存在」（可以顯示「查無此問卷」），500 是「伺服器壞了」。

### `@Patch` 而非 `@Put`

| | 語義 |
| --- | --- |
| `@Put` | 整份取代 —— 沒給的欄位視為要清空 |
| `@Patch` | 部分更新 —— 沒給的欄位不動 |

必須跟 `UpdateSurveyDto` 的 `PartialType` 對齊。DTO 都說「每個欄位都可以不給」了，路由卻宣稱自己是整份取代，前端就會照著錯的語義來用這支 API。

### `DELETE` 回 200 而非 204

兩種都常見：

- **200 OK** —— 回傳被刪掉的那筆資料（`@Delete` 的預設值）
- **204 No Content** —— 成功但完全沒有 body，要寫 `@HttpCode(204)` 覆蓋

選 200 的理由：`prisma.delete()` 本來就回傳那筆資料，不給白不給（前端可以顯示「已刪除《員工滿意度調查》」），而且 E2E 好斷言。

**但那個 body 是「刪除前的快照」** —— 它有內容，不代表資料還在。所以 E2E 除了看 body，還要再查一次資料庫確認真的沒了。

### `data` 明確寫欄位，不用 `data: dto`

就算 `whitelist` 已經擋過一層，service 再寫一次「我只接受這個欄位」。兩道防線成本很低，而漏掉的代價是有人能直接寫入任意欄位。

附帶好處：之後 DTO 多了欄位時，這裡會**逼你想一次**「這個該不該進資料庫」。

### 測試的前提資料用 `prisma` 直接建，不透過 API

「列表」的測試如果用 `POST /surveys` 準備資料，那麼 POST 壞掉時這條也會跟著紅 —— 但真正的問題不在列表。**測試應該只因為它要驗的那件事而失敗。**

cascade 那條更進一步：**斷言也必須用 `prisma`**。要驗的規則活在 PostgreSQL 裡（`migration.sql` 的 `ON DELETE CASCADE`），不是 Prisma Client 的行為、更不是 API 的行為。用 API 查就變成在測 API 了。

---

## 踩到的坑

| 症狀 | 根因 | 解法 |
| --- | --- | --- |
| 手動打 API 回 400，E2E 卻回 201 | `Test.createTestingModule()` 建的應用**不會**套用 `main.ts` 的全域設定 | 抽出 `src/setup-app.ts`，兩邊都呼叫 |
| `.env.test` 從 Ch0 起從來沒被載入過 | `jest-e2e.json` 沒有 `setupFiles` | 補上。`health.e2e-spec.ts` 檔頭那句「連 `.env.test`」一直是錯的 |
| `Module <rootDir>/test/setup-env.ts ... was not found` | `<rootDir>` 是**設定檔所在目錄**（`test/`），不是專案根目錄 | 寫 `<rootDir>/setup-env.ts`。錯誤訊息會印出它認定的 `<rootDir>`，卡住時看那一行最快 |
| 新增欄位「怎麼傳都存不進去」，且不報錯 | `whitelist` 判斷的是「有沒有驗證裝飾器」，不是「class 有沒有宣告」 | 補上 `@IsString()` 之類的裝飾器 |
| 換機後 ESLint 報 `Unsafe call of a type that could not be resolved` | `src/generated/` 沒跟上 schema | `pnpm exec prisma generate`（Ch1 專節） |
| 新增檔案後 ESLint 報同一句話，但 CLI 是乾淨的 | 編輯器的 program 是舊的 | 重啟 TS / ESLint server，**見下方專節** |

**DTO 屬性不需要 `!`（definite assignment assertion）。** `tsconfig.json` 只開了 `strictNullChecks`，沒開 `strict` / `strictPropertyInitialization`。網路上很多範例寫 `title!: string`，在這個專案是多餘的。

### 「假綠」的四種樣態（這一章最貴的一課）

一條永遠是綠的測試，比一條紅的測試危險 —— 因為它讓人以為那條路有被保護。這一章四種都踩到了：

#### 1. 複製了對照版本，卻忘了改動詞

```ts
describe('PATCH /surveys/:id', () => {
  it('id 不存在時回 404', async () => {
    await request(app.getHttpServer())
      .get('/surveys/nonexistent-id')   // ← 應該是 .patch
      .expect(404);
  });
});
```

它綠，是因為 GET 的 404 本來就會過。結果是 `update` 開頭那行 `await this.findOne(id)` **沒有任何測試在保護** —— 刪掉它，這條照樣綠。

同一輪還有另一條：whitelist 測試整段從 POST 版本複製過來，`.post('/surveys')` 和 `.expect(201)` 都沒改，於是它在 PATCH 的 `describe` 裡測著 POST，而且跟上面那條完全重複。

> **測試的動詞與路徑一定要跟它所在的 `describe` 一致。** 這是 review 時最該先掃一遍的東西。

#### 2. 漏了 `.expect(狀態碼)`

```ts
const res = await request(app.getHttpServer())
  .patch(`/surveys/${survey.id}`)
  .send({ title: '新標題' });   // ← 沒有 .expect(200)
```

不會讓測試恆綠，但會**讓失敗訊息指向錯的地方**：回 500 的症狀會偽裝成「body 不對」，然後你去查 body 為什麼不對。

#### 3. 忘了 `await` 的非同步斷言

```ts
expect(prisma.question.count()).resolves.toBe(0);   // ← 少了 await
```

`.resolves.toBe()` **回傳一個 Promise**。沒有 `await`，這一行只是發動了一個非同步斷言就往下走，`it` 立刻結束、判定通過 —— `count()` 回 5 也照樣綠。

兩種正確寫法，**建議統一用後者**（跟其他斷言形狀一致，而且少一個容易忘的 `await`）：

```ts
await expect(prisma.question.count()).resolves.toBe(0);
expect(await prisma.question.count()).toBe(0);        // ← 用這個
```

`pnpm lint` 的 `no-floating-promises` 抓得到它。**lint 不只是排版** —— 它這次抓到的是一個會讓測試失效的錯誤。

#### 4. 只斷言回應 body

```ts
expect(res.body).toMatchObject({ title: '新標題' });
```

如果哪天 controller 被寫成「把收到的 body 原封不動回吐」，這條照樣綠，但資料庫根本沒被改。

**寫入型端點（POST / PATCH / DELETE）值得再用 `prisma` 查一次資料庫**，才能分辨「API 說它改了」和「它真的改了」。DELETE 特別需要，因為它的回應 body 就是刪除前的快照，看起來永遠像成功。

#### 共同的解法

**測試沒跑過等於沒寫，而且要一條一條跑。** `update` 那次一口氣寫完五條才跑，結果兩條是假綠、一條的斷言字串多打了一個空格。每寫一條就跑一次，這些都會當場現形。

還有一條額外的：**`it` 的名稱是給失敗的那一刻看的。** `it('完整跑一趟')` 紅掉時只告訴你「完整跑一趟失敗」；`it('刪除問卷會連帶刪掉題目、回覆與答案（cascade）')` 一眼就知道壞在哪。

### 編輯器的紅線不代表程式碼有錯

新增 `update-survey.dto.ts` 之後，`surveys.service.ts` 冒出：

```text
Unsafe assignment of an error typed value.
Unsafe member access .title on a type that cannot be resolved.
```

但 CLI 是乾淨的：

```bash
pnpm exec eslint src/surveys/surveys.service.ts   # 無輸出
```

根因是 **TS / ESLint server 的 program 建立於那個檔案存在之前**，解析不到 `UpdateSurveyDto` → `dto.title` 成為 error type。CLI 每次都建全新的 program，所以看得到真相。

同一輪還有一條「應有 1 個引數，但得到 2 個」，那是 controller 看到的還是舊版的 service 簽章 —— 存檔後自己消失了。

**解法是重啟 server（`Ctrl+Shift+P` → `TypeScript: Restart TS Server` / `ESLint: Restart ESLint Server`），不是改程式碼。**

跟 Ch1 的坑合起來是一張完整的判斷表：

| 情況 | 誰是舊的 | 症狀 | 解法 |
| --- | --- | --- | --- |
| **Ch1** | 磁碟上的產物（`src/generated/`） | 編輯器與 CLI **都**報錯 | `pnpm exec prisma generate` |
| **Ch2** | 編輯器記憶體裡的 program | 只有編輯器報錯，**CLI 乾淨** | 重啟 TS / ESLint server |

> **判斷法只有一條：紅線出現時先用 CLI 跑一次**（`pnpm exec tsc --noEmit`、`pnpm exec eslint <檔案>`）。CLI 是唯一權威。
> **新增檔案之後特別容易踩到 —— 這是最容易讓人「改一個沒壞的東西、結果真的改壞」的時刻。**

### `update` 的資源識別：一個誤解推倒三個決策

第一版的 `update` 是這樣寫的：

```ts
// service
update(dto: UpdateSurveyDto) {
  return this.prisma.survey.update({ where: { id: dto.id }, data: { ...dto } });
}
// controller
@Put()
update(@Body() dto: UpdateSurveyDto) { ... }
```

七項問題，但根因只有一個觀念：

> **`create` 沒有「要改哪一筆」的問題，`update` 有 —— 而那個識別資訊屬於網址，不屬於 body。**

照著 `create` 的 DTO 形狀想，就會把 `id` 塞進 body；一旦 `id` 在 body 裡，路由就不需要 `:id`（於是寫成 `@Put()`）、`data` 也只能整包展開（因為要把 `id` 一起帶進來）。**逐項修是修不完的，要先把那個觀念換掉。**

而 `dto.id` 在 `UpdateSurveyDto` 上根本不存在，所以這份程式碼連 `tsc` 都過不了 —— 也就是說**它從來沒被執行過**。

### `remove` 的重點不是端點，是 cascade

`remove` 本身三行，跟 `update` 同一套 404 處理，沒有新東西。它值得一個位置，是因為它是 **Ch1 寫下的 `onDelete: Cascade` 第一次被自動化測試實際驗證**。

而且驗的**不只一層**：

```text
Survey
 ├── Question  (Cascade)  ← 第一層
 │    └── Answer (Cascade) ← 第二層
 └── Response  (Cascade)  ← 第一層
      └── Answer (Cascade) ← 第二層
```

`Answer` **沒有直接掛在 `Survey` 上**。它能被清掉，是因為 `Question`（或 `Response`）先被清掉、再連鎖一次。所以那條測試如果少建 `Answer`，驗到的就只有第一層 —— 而多層連鎖正是 schema 改動時最容易默默壞掉的部分。

`service.remove` 裡**沒有任何一行程式碼**去刪題目和回覆，但它們真的會消失。**規則不在那個檔案裡，在 `migration.sql` 裡、活在 PostgreSQL 裡。** Ch1 那句「哪些規則真的活在資料庫裡」，這是最直接的例子：看 service 永遠看不出來，只有那條 E2E 會告訴你它還活著。

### 測試裡多餘的程式碼是有害的

DELETE 的 404 案例一度掛著 `.send({ title: '要刪掉的問卷' })`，是從 PATCH 版本複製的殘留。它不會讓測試失敗，但**測試同時也是文件** —— 多寫的每一行都在暗示「這是必要的」，讀的人會以為 DELETE 需要 body。

### 改程式碼會讓註解過期

這一章犯了兩次：

1. 加了 `NotFoundException` 之後，`surveys.service.ts` 檔頭那句「它不知道 HTTP 的存在 —— 沒有狀態碼」變成錯的。
2. `update` 的 `await this.findOne(id)` 旁邊寫「否則會回 404，只是訊息是 Prisma 的預設訊息」—— 實際上是 **500**。

**註解寫錯比沒寫更糟，因為之後你會相信它。** 第二個尤其危險：它描述的是一個你不會主動去驗證的分支。

---

## 作業

1. 把 `src/setup-app.ts` 裡的 `whitelist: true` 改成 `false`，跑 `pnpm test:e2e`。哪幾條會紅？
   接著**再**把 `surveys.service.ts` 的 `create` 改成 `data: dto`，重跑。這次呢？
2. 把 `surveys.service.ts` 的 `update` 開頭那行 `await this.findOne(id)` 註解掉，跑測試。回的是幾？跟你預期的一樣嗎？
3. 拿掉 `schema.prisma` 裡 `Question` 的 `onDelete: Cascade`，跑 `pnpm exec prisma migrate dev`，再跑測試。cascade 那條紅了 —— 但它**紅在哪一行**？（先猜再看）
4. 把 cascade 測試的第一行斷言改成 `expect(prisma.question.count()).resolves.toBe(999)`（去掉 `await`、期望值故意寫錯）。測試會紅嗎？
5. 不改任何程式碼，讓 `pnpm test:e2e` 印出 `找不到 .env.test`。你做了什麼？

> 做完第 3 題記得把 `onDelete: Cascade` 加回去並重跑 `migrate dev`，第 4 題把 `await` 和 `0` 改回來。

### 解答

**第 1 題 —— 第一步：一條都不會紅（17 passed）。第二步：POST 那條紅了。**

這題的答案跟直覺相反，值得慢慢看。以下是實際跑出來的結果。

**只拿掉 `whitelist`：全綠。**

`status: 'PUBLISHED'` 確實不再被 ValidationPipe 丟掉，它一路進到了 `create(dto)`。但它**仍然沒有被寫進資料庫** —— 因為 service 的 `data: { title: dto.title }` 明確只挑了 `title`，`dto` 上多出來的 `status` 根本沒人理它。回傳的 status 還是 `DRAFT`，測試照樣綠。

**兩層都拿掉：POST 那條紅。**

```text
● Surveys (e2e) › POST /surveys › 偷塞 DTO 沒宣告的 status 會被忽略
    Expected: "DRAFT"
    Received: "PUBLISHED"
```

`data: dto` 把整個物件交給 Prisma，而 `status` 剛好是 `Survey` 真實存在的欄位，於是它真的被寫進去了。這就是 mass assignment 實際發生的樣子。

（PATCH 那條這時仍然是綠的，因為 `update` 的 `data: { title: dto.title }` 沒被動到。**兩支端點各有各的第二層防線。**）

**這題真正的收穫：**

> **兩道防線的意思是「拆掉任何一道，測試都不會告訴你」。**

這聽起來像缺點，其實正是縱深防禦的定義 —— 它換來的是「單一疏忽不會造成災難」。但代價要認清楚：**你的測試只驗證結果，不驗證有幾層保護。** 哪天有人為了「簡潔」把 `data: { title: dto.title }` 改成 `data: dto`，全綠，沒有人會知道防線從兩層變成一層。

這種東西測試守不住，只有 code review 和註解守得住 —— 這也是為什麼 `create` 裡那段「為什麼不寫 `data: dto`」的註解要留著。

**第 2 題 —— 回 500，不是 404。**

`PATCH /surveys/不存在的id` 會讓 Prisma 丟 `P2025`（要更新的紀錄不存在）。Nest 不認識這個錯誤碼，當成沒預期的例外處理，回 500 Internal Server Error。

紅的是 `it('id 不存在時回 404')` 那條 —— 而且是 PATCH 那條，不是 GET 那條。這也順便驗證了：那兩條看起來很像的測試，各自保護不同的東西。

**第 3 題 —— 紅在 `.expect(200)`，不是紅在 `count()`。回的是 500。**

如果你猜「`question.count()` 會是 1」，那是很自然但錯誤的推論 —— 它假設了「拿掉 `onDelete` = 什麼都不做，題目就留在那裡」。

實際上 **Prisma 對沒寫 `onDelete` 的關聯有預設值，而且預設值不是「不做事」**：

| | 選填關聯 | **必填關聯** |
| --- | --- | --- |
| `onDelete` | `SetNull` | **`Restrict`** |
| `onUpdate` | `Cascade` | `Cascade` |

`Question.survey` 是必填關聯（`surveyId String` 沒有 `?`），所以拿掉 `Cascade` 之後它變成 **`Restrict`** —— 「還有子紀錄就不准刪」。於是：

```text
DELETE /surveys/:id
  → PostgreSQL 的外鍵約束擋下
  → Prisma 丟錯
  → Nest 不認識 → 500
  → supertest 的 .expect(200) 失敗
```

測試根本走不到那三行 `count()`。

這正好接上 Ch1「三個 `onDelete` 都選 `Cascade`」那節 —— 當時討論過 `Restrict` 會讓「刪整份問卷」失敗，這題讓你親眼看到它失敗的樣子。

> 收穫：**「沒寫」不等於「沒有」。** 很多設定省略時是有預設值的，而預設值可能跟你的直覺相反。
> 判斷「拿掉某個設定會怎樣」之前，先確認它的預設值是什麼。

**（順帶一提）** 把 `Cascade` 加回去再跑一次 `migrate dev`，會**產生第二個 migration**，而不是把第一個改掉。這是對的：**migration 是歷史，不是現況的快照。** 兩份都留著、都進版控 —— 正式環境靠依序重播它們得到相同結果。

**第 4 題 —— 不會紅。測試全綠。**

期望值明明是 `999`、實際是 `0`，但 `.resolves.toBe()` **回傳一個 Promise**。沒有 `await`，這一行只是發動了一個非同步斷言就往下走，`it` 立刻結束並判定通過。那個斷言的失敗結果沒有人在等。

這是「假綠」最乾淨的示範：**斷言本身寫對了、期望值也確實不符，測試還是綠的。**

**一條在該叫的時候不叫的測試比沒有更糟** —— 它佔著位子，讓人以為那件事有被檢查。

跑 `pnpm lint` 會看到 `no-floating-promises` 警告。這題的收穫是：**lint 的警告不全是風格建議，有些是在告訴你「這段程式碼沒有做你以為它在做的事」。**

> 避開它最簡單的方法就是統一寫 `expect(await x()).toBe(...)` ——
> 把 `await` 放在你一定會注意到的位置，而不是行尾。

**第 5 題 —— 把 `.env.test` 改名（例如改成 `.env.test.bak`）。**

`test/setup-env.ts` 的第一道防呆會 throw，並印出重建步驟。

重點是它的設計：**沒有 fallback 到 `.env`。** 有 fallback 的話，換一台機器忘了建 `.env.test`，測試就會安靜地跑在開發資料庫上並把資料 `TRUNCATE` 掉 —— 而你看到的是「測試全綠」。

> 這題和第 4 題其實是同一個主題的兩面：**沉默的失敗最貴。**
