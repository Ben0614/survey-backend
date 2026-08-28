# Ch7 — Swagger API 文件

> **狀態：完成。**
> `pnpm test:e2e` **84 passed**（79 → +5）、`pnpm test` **6 passed**（不變）、
> `tsc --noEmit` 0 errors、`eslint` 0 problems。
> 接續點寫在 `LEARNING.md`。

分五輪做，每一輪只放**兩個沒見過的東西**（`ch06` 坑 #6 的新判準：開工前先數，超過兩個就拆）：

| 輪 | 內容 | 驗收 |
| :---: | --- | --- |
| ① | 掛上 Swagger，**一個裝飾器都不加** | `/docs` 打得開，量基線 |
| ② | 八份 DTO 的請求端（`@ApiProperty` / `@ApiPropertyOptional`） | `/docs` 上 body 與 query 完整 |
| ③a | 六個 entity + 單筆回應的標註 | 回應區塊看得到 schema |
| ③b | 分頁包裝（`{ data, meta }`） | 兩支列表也有 schema |
| ④ | 錯誤回應 + 一條會紅燈的 e2e | `test:e2e` 84 passed |

這一章跟前面六章有一個結構性差別：**它產出的東西不會改變任何行為。**
把全部 `@Api*` 裝飾器刪光，15 支端點的回應一個位元組都不會變。
也因此，這一章的每一個錯誤都**沒有症狀** —— 這是它真正的難處，也是輪 ④ 那條測試存在的理由。

---

## 核心概念

### `/docs` 不是一個網頁，是一份契約

`SwaggerModule.setup('docs', ...)` 掛出來的其實是兩個東西：

| 網址 | 給誰看 | 用途 |
| --- | --- | --- |
| `GET /docs` | 人 | Swagger UI，可以直接按「Try it out」發請求 |
| `GET /docs-json` | 機器 | OpenAPI 規格（JSON），**Ch13 `openapi-typescript` 的輸入** |

真正的產品是後者。前端不會照著網頁抄型別，他們會拿 `/docs-json` 產生 TypeScript ——
**所以 spec 裡缺什麼，前端那邊就是 `any`；spec 裡寫錯什麼，前端就會照著錯的寫。**

### Swagger 從哪裡拿到資訊：兩類來源，只有一類是免費的

輪 ① 刻意不加任何裝飾器，就是為了把這件事量出來。結果：

| 它推得出來 | 為什麼 |
| --- | --- |
| 9 條路徑、15 支端點、HTTP 動詞 | `@Controller('surveys')` / `@Post()` 括號裡的字串是**你直接寫給它的** |
| path 參數 `{id}` / `{surveyId}` | 同上，`@Param('id')` 的 `'id'` 也是字串 |
| `POST` 是 201、其餘 200 | Nest 的預設狀態碼，框架自己知道 |
| requestBody **指向哪一份 DTO** | `emitDecoratorMetadata` 寫進去的 `design:paramtypes` |

| 它推不出來 | 為什麼 |
| --- | --- |
| DTO 的**屬性** | `design:paramtypes` 給的是「參數的型別是這個 class」——**一個 class 的參考**，不是屬性清單 |
| query 參數 | 同上，`@Query() query: FindSurveysQueryDto` 只讓它知道有這個 class |
| 回應 | 方法沒有寫回傳型別，而且就算寫了，執行期也什麼都不剩 |

**`title: string` 這個宣告編譯成 JS 之後完全不存在。**
執行期要知道一個 class 有哪些屬性，唯一的辦法是**屬性上有裝飾器** ——
那就是 `@ApiProperty` 的全部工作。

### 驗證與文件是兩套互不相通的 metadata

這是這一章最重要的一句話。

```ts
@ApiProperty({ maxLength: 200 })   // 只登記「文件上怎麼描述」，從不檢查
@MaxLength(200)                    // 執行期真的檢查，不合格回 400
title: string;
```

兩個 `200` 是**分別寫的兩件事**，而且沒有任何機制保證它們一致。
改了 `@MaxLength(200)` 忘了改 `maxLength`，文件就開始說謊 ——
`tsc` 綠、測試綠、API 行為完全正確。

> **收尾時實測發現這道牆是可以打通的**，只是要換一套機制：
> `@nestjs/swagger` 的 CLI plugin 會在**編譯期**讀 class-validator。
> 詳見下面「決策取捨」的四個探針 —— 這個專案沒有開，理由不是「它沒用」。

### entity：為什麼「回什麼」還要再寫一次

Swagger 只認得 **class**（執行期才有東西可以讀 metadata），
而 Prisma 的 `Survey` 是一個 **TypeScript 型別**，編譯後不存在。
所以「這支 API 回什麼」得另外用 class 描述一遍。

這些 class **執行期永遠不會被 `new`** —— service 回的是 Prisma 產出來的普通物件。
它們唯一的用途是給 `@ApiOkResponse({ type: SurveyEntity })` 當參數。

**代價：這是第二份真相。** `schema.prisma` 加一個欄位 → `prisma generate` →
`tsc --noEmit` 全綠 → entity 不會紅 → `/docs` 從那一刻起說謊。

### entity 對應的是「一次回應的形狀」，不是「一張資料表」

`Response` 這張表在三支端點回三種東西：

| 端點 | 回什麼 | entity |
| --- | --- | --- |
| `POST /surveys/:surveyId/responses` | `{ id, surveyId, createdAt }` | `ResponseEntity` |
| `GET /surveys/:surveyId/responses` | 同上（列表刻意不帶 answers） | `ResponseEntity` |
| `GET /responses/:id` | 多一層 `answers[]`，每筆再帶 `question` | `ResponseDetailEntity` |

照著 `schema.prisma` 抄一份含 `answers` 的 entity 然後三支都標它，
症狀是前端看文件寫 `res.answers.length`，打 `POST` 之後拿到 `undefined` 直接 crash。

**這條規則在 DTO 那一側已經講過一次**（`create-survey.dto.ts` 檔頭：
DTO 說「外面可以送進來什麼」、Model 說「資料庫實際存什麼」，兩者刻意不共用）。
Ch7 是它在回應那一側的第二次現場。

### `required` 的語義是「一定會出現的 key」

這一點決定了輪 ④ 那條測試怎麼寫。

`SurveyEntity.questions` 標成 `@ApiPropertyOptional`，於是它在 `properties` 裡、
**不在 `required` 裡**。而 `GET /surveys/:id` 不帶 `?includeQuestions=true` 時
回應真的沒有那個 key。

所以比對「spec 承諾的」與「實際回的」時，要拿 `required` 去比而不是 `properties` ——
拿 `properties` 比會誤判成失敗，然後你會去「修」一個沒壞的東西。
`ErrorBodyEntity.details`（只有驗證失敗才出現）是同一種情況。

---

## 決策取捨

### `buildSwaggerDocument` 抽成獨立檔案，而不是三行寫在 `main.ts`

理由跟 Ch6 抽出 `setup-app.ts` 一模一樣：**測試要拿到同一份東西**。
差別是那邊共用的是「套用設定」，這裡共用的是「產生 document」。
寫在 `main.ts` 裡的東西 e2e 構不到，而輪 ④ 整章的產出就靠那個 document。

**也沒有放進 `setup-app.ts`**：那裡的通則是「改變應用整體行為的設定」，
而 Swagger 只是多掛一條路由，不影響任何既有端點；
且 84 條 e2e 每一條都建一次應用，每條都掃一次全部 metadata 純粹是成本。

### 手寫 `@ApiProperty`，不開 CLI plugin —— 四個探針

收尾時實際打開 `nest-cli.json` 的 `plugins` 量了一輪：

| 探針 | 問題 | 量到的答案 |
| :---: | --- | --- |
| A | plugin 會自己補 `enum` 嗎 | 會 |
| B | `tsconfig` 的 `removeComments: true` 會吃掉 JSDoc 嗎 | **不會**（plugin 在 emit 前讀 AST）；但要 `introspectComments: true` 才會抽成 `description` |
| C | `enum` 來自 TS union 還是 `@IsIn` | **`@IsIn`** —— 型別改成 `string` 之後 `enum` 照樣在 |
| D | ts-jest 跟 `nest build` 產出同一份 spec 嗎 | **不同** |

plugin 實際加了四類東西，**全部來自 class-validator**：

```text
@Min(1) @Max(100)   ->  minimum: 1, maximum: 100
@ArrayNotEmpty()    ->  minItems: 1
@IsIn([...])        ->  enum: [...]
JSDoc（要開 introspectComments）-> description
```

而探針 D 是決定性的：

```text
nest build 產出的 page = {"minimum":1,"default":1,"type":"number"}
ts-jest  產出的 page = {"default":1,"type":"number"}          <- 沒有 minimum
```

**同一份程式碼、兩條編譯路徑、兩份不同的 spec。**
這一章的產出就是那條「文件有沒有說謊」的測試，讓它在一份不是線上那份的 spec 上驗證，
等於自廢武功。

**所以不開，但理由不是「plugin 沒用」** —— 它做的事正好是手寫時最容易漏的那類。
真實專案的作法是「開 plugin，並讓 jest 也跑同一個 transformer」；
這個專案不做，因為那是設定檔的工程，跟學習目標無關。**需要時知道往哪走就夠了。**

> 這一輪也推翻了教練原本的說法（「plugin 只看 TS 型別、不看 `@IsIn`」）。見坑 #9。

### 分頁包裝：兩個 class，而不是 `getSchemaPath` 泛型

OpenAPI 沒有泛型。`{ data: T[], meta }` 有兩條路：
為每種 `T` 各寫一個 class，或用 `@ApiExtraModels` + `getSchemaPath` 組 `allOf`。

選前者。只有兩種 `T`，重複兩次比較便宜，而且這一章的重點不是泛型技巧。
（同 Ch4 ③ 的判準：這個專案選重複比較少的那邊。）

`meta` 那一半共用 `PaginationMetaEntity`，因為兩支列表的 `meta` 形狀真的一樣。

### `ResponseDetailEntity` 用 `extends` 而不是重抄三個欄位

問使用者「`Response` 哪天加一個欄位，你會記得改兩個地方嗎」，答案是「不會」。
於是改成繼承 —— **讓「只改了其中一份」在結構上不可能發生**，
跟 `UpdateSurveyDto` 用 `PartialType(CreateSurveyDto)` 是同一個形狀。

`extends` 之後父類別的 `@ApiProperty` 會不會被讀到，是**量出來的**：

```text
ResponseDetailEntity 的欄位: [ 'id', 'surveyId', 'createdAt', 'answers' ]
```

### `/health` 不進契約，而理由要寫下來

判準是「**誰照著這份文件寫程式**」：`/docs` 的產品是給前端串接的契約，
而 `/health` 的呼叫者是 Render 的健康檢查與人工排錯，它們只看狀態碼。
為一個沒有前端讀者的回應維護一份 entity，等於多養一份會過期的真相。

留 `@ApiOperation` 是因為「**有這支端點、但它不是給你串的**」本身就是有用的資訊。
決定不做也是一個決定，理由寫在 `health.controller.ts`（同 `surveys.service.ts` 檔頭那段）。

### `dto/` 與 `entities/` 的界線

```text
dto/       外面**送進來**什麼（class-validator 真的會檢查）
entities/  我們**回出去**什麼（只給 Swagger 讀，沒有任何檢查）
```

跨 feature 共用的兩份（`error-response`、`pagination-meta`）放 `src/common/entities/`。
原本計畫寫的是 `common/dto/`，改掉了 —— 放進 `dto/` 會讓這條界線在第一個共用型別上就破功。

---

## 踩到的坑

### 1. 空殼 spec 看起來是成功的

輪 ① 掛上 Swagger 之後，`/docs` 打得開、15 支端點全在、路徑與動詞全對。
但每一份 DTO 都是：

```json
"CreateSurveyDto": { "type": "object", "properties": {} }
```

query 參數一條都沒有，回應全部沒有 schema。**頁面打得開 ≠ 契約有內容。**
沒有任何地方會亮紅燈 —— 跟 Ch3 那個「少一行 404 變成 200 配空陣列」是同一種形狀。

### 2. 陣列的元素型別推不出來時，Swagger 會「猜」

`design:type` 對陣列只給得出 `Array`，裡面裝什麼從來不知道。
而 Swagger 拿不到時**不會留白，它會猜一個 `string`**：

```jsonc
// answers: AnswerDto[]，沒寫 type: [AnswerDto] 的結果
"answers": { "type": "array", "items": { "type": "string" } }
```

前端照著產型別會得到 `answers: string[]`，寫 `answers: ["abc"]` 送出去 → **400**，
而文件從頭到尾說它是對的。`AnswerDto` 則整個沒進 `components.schemas`。

**而隔壁的 `options: string[]` 同樣沒寫 `type: [String]`，卻是對的** —— 它猜對了。

> **同一個疏漏、同一份 spec：一個碰巧正確、一個安靜地說謊，而 `/docs` 上兩個看起來一樣。**
> 判準因此不能是「看起來對就好」，而是「**看到 `[]` 就一定要寫 `type`**」。

### 3. `enum` 的方括號 —— 寫錯一處、spec 錯兩處

```ts
enum: [SurveyStatus]   // 錯
enum: SurveyStatus     // 對
```

錯的那個產出：

```json
"status": { "type": "number", "enum": [ { "DRAFT": "DRAFT", "PUBLISHED": "PUBLISHED" } ] }
```

兩個症狀，第二個是**連帶的**：合法值清單裡是一個物件；而且 `type` 變成了 `number` ——
Swagger 看到清單元素不是字串，就放棄推導、退回猜 `number`。

**同一個方括號，在兩個欄位上意思完全不同**：

| 寫法 | 方括號的意思 |
| --- | --- |
| `type: [AnswerDto]` | **陣列** |
| `enum: ['asc', 'desc']` | **清單本身** |

而且使用者在 `sort` 上寫對了（手寫清單）、在 `status` 上寫錯了（傳變數），
**兩行相距不到 30 行**。差別是傳變數的時候，「這個參數要的是清單」這件事從眼前消失了。

### 4. `required` 與 `@IsOptional()` 是兩個判準，而且答案剛好相反

`page: number = 1` **沒有** `@IsOptional()`（有預設值 → 建實例時就不是 `undefined`），
但文件上它必須是 **optional**（前端不給也完全合法）。

寫成 `@ApiProperty()` 的症狀：Ch13 產出的型別是 `page: number` 而不是 `page?: number`，
**前端每一次呼叫都被 TypeScript 逼著帶 `?page=1`**。
伺服器行為完全正確、測試全綠、沒有任何錯誤訊息。

這一輪 10 個 query 屬性**全部**標成了 `required: true` —— 而它事先被單獨標成「這一輪的重點」，
寫了症狀，也給了結構性對策（那兩份 query DTO 裡搜到 `@ApiProperty(` 就是錯的）。

> **最該記的不是這條規則，是它為什麼失效：規則被當成「寫的當下要想起來」的規則在用。**
> 人連寫六個屬性時不會逐一重新判斷。它是**收工前 grep 一次**的規則 ——
> 成本三秒、命中率百分之百。**規則本身有效，錯的是使用時機。**

### 5. `PartialType` 有兩個版本，只有一個認得 `@ApiProperty`

| 版本 | 複製 class-validator 的規則 | 複製 `@ApiProperty` |
| --- | :---: | :---: |
| `@nestjs/mapped-types` | 會 | **不會**（它根本不知道有這套） |
| `@nestjs/swagger` | 會 | 會 |

症狀：`PATCH /surveys/:id` 的 request body 在文件上是空的，但驗證完全正常
（送數字進去照樣 400）。這是「兩套 metadata 互不相通」的第三次現場，
而且**不是漏寫，是選的工具只認得其中一套**。

換掉 import 之後 79 條 e2e 一條不少 —— 證明驗證行為沒變，只補上了文件那半邊。

### 6. 「借來的 404」—— 漏標的四支形狀完全一致

輪 ④ 標錯誤回應時漏了四支，全部在巢狀資源的兩個 controller：

```ts
// questions.service.ts:44 / responses.service.ts:149
await this.surveysService.assertExists(surveyId);
```

**它們的 404 不是自己丟的，是借來的。** 在自己的檔案裡搜 `throw new NotFoundException`
只會找到「題目不存在」那個，「問卷不存在」藏在一行看起來像前置檢查的 `await` 裡。

> **判準：`await someOtherService.xxx()` 這一行會不會丟例外，要去那支方法裡看。**

而答案早就寫在那一行的正上方 —— `responses.service.ts:149` 上方有六行註解說明
「這行沒接回傳值，作用是**借 SurveysService 丟 404**」。
這是「改的是 A，而描述 A 的資訊在 B」的又一次。

**最貴的是 `POST /surveys/:surveyId/responses` 漏掉的 409**（問卷未發布，無法填寫）：
那是 Ch5 整章的核心商業規則。漏標的後果不是少一個分支，
是**前端完全不知道「問卷要先發布才能填」這件事存在**。

> 這條規則寫在 service 裡三章了。**只有寫進 `@ApiConflictResponse` 的那一刻，
> 它才從「後端知道」變成「契約的一部分」。** 這就是這一章的價值。

### 7. 第二份真相：三次抄錯，三次 `tsc` 都是 0 errors

| 錯誤 | 實際型別 | entity 寫成 |
| --- | --- | --- |
| `Question.order` | `Int`（第幾題） | `'asc' \| 'desc'`（抄自 query DTO 的排序方向） |
| `Answer.responseId` | `String`（cuid） | `Date`（連 `format: 'date-time'` 一起抄自 `createdAt`） |
| 分頁的 `meta` | 單一物件 | `PaginationMetaEntity[]` |

三次都是**複製貼上時欄位名改對了、跟著那個欄位的三行沒改**。
而三次 `pnpm exec tsc --noEmit` 都是 **0 errors** ——
因為沒有任何程式碼把 service 的回傳值指派給 entity，兩邊在型別系統裡毫無關係。

**唯一的偵測器是輪 ④ 那條測試。** 可用的對策：entity 寫完之後
**拿實際回應的 JSON 逐欄對一次**，而不是逐欄回想。

### 8. `@ApiPropertyOptional` 標在 controller 的方法上，什麼都沒發生

```ts
@ApiOkResponse({ type: SurveyEntity })
@ApiPropertyOptional({ type: [QuestionEntity] })   // 標在方法上
@Get(':id')
```

TypeScript 不擋（裝飾器的型別簽名夠寬鬆）、Swagger 不報錯，**它只是沒有效果**。

> **判準：名字裡有 `Property` 的一律標在 class 的屬性上**，
> 其餘（`@ApiTags` / `@ApiOperation` / `@Api*Response`）描述端點、標在 controller。
> 這個分界跟 class-validator 完全一致 —— 你不會把 `@IsString()` 標在 controller 方法上。

### 9. 教練第九次「先給結論、沒有先量」——而且方向相反

決定要不要開 CLI plugin 時，教練說：

> 「它推的是 TS 型別，不看 `@IsIn` 的白名單。」

**探針 C 直接推翻**：把 `sort` 的型別從 `'createdAt' | 'title'` 改成 `string`、
只留 `@IsIn`，`enum` 照樣出現。plugin 讀 class-validator 讀得比預期多得多。

前八次的清單在 `LEARNING.md`。這一次的形狀跟 Ch4 那次（「動態 key 型別會撞」）一樣：
**結論方向對（不建議開），機制講錯了（理由完全不是那個）。**
如果照錯的理由做決定，遇到「那我把型別寫精確一點就好了」這種提議時會答錯。

**可以在三分鐘內實測的事，不要用推論代替。** 這一輪最後花的是四個探針、約十分鐘。

---

## 已知的缺口

輪 ④ 那五條測試**只保護得住一部分**。作業第 3、4、5 題是實測出來的證據：

| 沒被保護的 | 症狀 |
| --- | --- |
| 六個 entity 裡的四個 | `QuestionEntity` / `ResponseEntity` / `ResponseDetailEntity` / `PaginationMetaEntity` 寫錯不會紅 |
| 回應的**狀態碼**標註 | `@ApiCreatedResponse` 標成 `@ApiOkResponse` 不會紅 |
| `enum` 的**值** | 測試只比對欄位名，`code` 的合法值少列一個不會紅 |
| 分頁包裝的形狀 | 坑 #7 的第三個（`meta` 標成陣列）放回去，**84 條全綠** |

擴充的方式是明顯的（把第 4、5 條的比對抽成一個 helper，對每個 entity 各跑一次），
**但沒有做** —— 那會讓這一輪從「兩個新東西」變成「兩個新東西加一次重構」。
留在這裡當作已知的債，而不是假裝測試蓋滿了。

> 這件事本身也是這個專案反覆出現的一課：**「有測試」不等於「蓋到了」。**
> 判準永遠是把 bug 放回去跑一次。

---

## 作業

題型跟 Ch6 一樣是「**看程式碼說症狀**」。五題都先自己想，再往下看答案。

> 五題的答案**全部是實際跑出來的**，做法就是這一章用了三次的「把 bug 放回去跑一次」。

### 第 1 題

把 `create-survey.dto.ts` 的 `@ApiProperty({ ... })` 整段刪掉，其他不動。
`pnpm test:e2e` 會紅幾條？紅在哪一條？

### 第 2 題

把 `SurveyEntity.questions` 的 `@ApiPropertyOptional` 改成 `@ApiProperty`
（內容一個字不改）。會紅嗎？**為什麼？**

### 第 3 題

把分頁的 `meta` 改回這一章踩過的那個錯：

```ts
@ApiProperty({ description: '統計資訊', type: [PaginationMetaEntity] })
meta: PaginationMetaEntity[];
```

會紅幾條？

### 第 4 題

把 `survey-responses.controller.ts` 的 `@ApiCreatedResponse` 改回 `@ApiOkResponse`
（實際回應仍然是 201）。會紅嗎？

### 第 5 題

把 `QuestionEntity` 的 `surveyId` 整個屬性刪掉（實際回應仍然有那個欄位）。會紅嗎？
如果不會，**那第 4、5 條測試到底保護了什麼**？

---

## 作業解答

### 第 1 題 —— 1 條紅，第 2 條測試

```text
Swagger 契約（buildSwaggerDocument） > POST /surveys 的 requestBody 指向 CreateSurveyDto，title 在 required 裡
Tests: 1 failed, 83 passed, 84 total
```

`CreateSurveyDto` 退回輪 ① 的空殼 `{ "properties": {} }`，`required` 是 `undefined`，
所以 `expect(schema.required).toContain('title')` 失敗。

值得注意的是**另外 83 條全綠** —— 包含所有驗證行為的測試。
再一次證明「`@ApiProperty` 從不檢查任何東西」：拿掉它，API 行為一個位元組都沒變。

### 第 2 題 —— 1 條紅，第 4 條測試

```text
Swagger 契約（buildSwaggerDocument） > SurveyEntity 的屬性，跟實際打 GET /surveys/:id 拿到的 key 完全一致
```

改成 `@ApiProperty` 之後 `questions` 進了 `required`，也就是文件承諾「這個 key 一定會出現」。
但 `GET /surveys/:id` 不帶 `?includeQuestions=true` 時它不存在，方向一因此失敗。

**這一題證明了 `required` 那個選擇是對的**：如果測試拿 `properties` 去比，
這個真正的錯誤反而抓不到（`questions` 在 `properties` 裡，改不改都在）。

### 第 3 題 —— 0 條紅，全綠

```text
Tests: 84 passed, 84 total
```

`PaginatedSurveysEntity` 沒有被任何一條測試碰到。**這一章實際踩到的三個 entity 錯誤裡，
只有發生在 `SurveyEntity` 上的那一種會被抓到。**

### 第 4 題 —— 0 條紅，全綠

狀態碼的**標註**沒有任何測試。文件說 200、伺服器回 201，
前端寫 `if (res.status === 200)` 永遠不成立，而 84 條測試沒有一條有意見。

### 第 5 題 —— 0 條紅，全綠

第 4、5 條測試只比對了 **`SurveyEntity`** 與 **`ErrorBodyEntity`** 兩個 class。
其餘四個 entity 完全沒有被保護。

**所以那兩條測試保護的是「這個模式」，不是「全部的 entity」。**
它們證明了比對法可行、也真的抓得到坑 #7 那類錯誤（第 1、2 題就是證據），
但覆蓋範圍只有 2/6。這件事寫在上面的「已知的缺口」，不假裝它蓋滿了。
