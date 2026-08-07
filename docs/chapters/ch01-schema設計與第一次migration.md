# Ch1 — Schema 設計、第一次 migration、seed

**成果：** `Survey` / `Question` / `Response` / `Answer` 四張表建在 Neon 上，變更歷史進版控，`pnpm exec prisma db seed` 可重複執行塞入開發資料。

> 這一章的**前置觀念**（主鍵、外鍵、一對多、唯一約束）在 [`docs/關聯式資料庫基礎.md`](../關聯式資料庫基礎.md)。
> 那份文件講「為什麼要這樣設計」，這一章只講「怎麼翻譯成 Prisma 的寫法，以及翻譯出來的 SQL 長怎樣」。

---

## 核心概念

### migration 是什麼

`schema.prisma` 描述的是**目的地**：「我希望資料庫長這樣」。但資料庫不會讀心術，它只接受指令：`CREATE TABLE`、`ALTER TABLE ADD COLUMN`。

`prisma migrate dev` 做的就是這件翻譯工作：

```text
上一版 schema  ──┐
                 ├──→ 比對差異 ──→ 產生 migration.sql ──→ 對資料庫執行
現在的 schema  ──┘
```

產物是一個帶時間戳的資料夾，裡面一份純 SQL：

```text
prisma/migrations/20260807020256_init_survey_schema/migration.sql
```

**這個資料夾必須進版控。** 它是資料庫結構的變更歷史 —— 正式環境靠 `prisma migrate deploy` 依序重播這些檔案，重建出一模一樣的表。少了它，你的資料庫結構就只存在於某一台機器的某一個時刻。

> 對照 `prisma db push`：它直接把資料庫改成 schema 的樣子，**不留任何歷史**。快，但無法用在正式環境，也無法回答「上週三那個欄位是誰加的」。

### 語法對照表

左邊的觀念在 `docs/關聯式資料庫基礎.md` 都講過，這一章只是換一種寫法：

| 觀念 | Prisma | 產生的 SQL |
| --- | --- | --- |
| 主鍵 | `@id @default(cuid())` | `CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")` |
| 外鍵欄位 | `surveyId String` | `"surveyId" TEXT NOT NULL` |
| 關聯 + 刪除行為 | `@relation(fields: [surveyId], references: [id], onDelete: Cascade)` | `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE CASCADE` |
| 一對多的「一」那邊 | `questions Question[]` | **沒有對應的 SQL** |
| 複合唯一約束 | `@@unique([responseId, questionId])` | `CREATE UNIQUE INDEX "Answer_responseId_questionId_key"` |
| 索引 | `@@index([surveyId])` | `CREATE INDEX "Question_surveyId_idx"` |
| 列舉 | `enum QuestionType { ... }` | `CREATE TYPE "QuestionType" AS ENUM (...)` |
| 陣列 | `options String[]` | `"options" TEXT[]` |

`@relation` 那一行讀起來是：**「我這張表的 `surveyId`，指向 `Survey` 的 `id`」**。`fields` 是自己的欄位、`references` 是對方的欄位 —— 兩者屬於不同的表，這是最容易看混的地方。

`references` 之所以是陣列，是為了支援複合主鍵。我們用單一 cuid 主鍵，永遠只有一個元素。

### 哪些規則真的下放到資料庫？（本章最重要的一節）

打開 `migration.sql` 逐條對回 schema，會發現**有四個地方找不到對應**：

| schema 寫了 | SQL 裡 | 誰負責 |
| --- | --- | --- |
| `questions Question[]` 等虛擬欄位 | 完全沒有 | 只給 Prisma Client 用，資料庫不知道它存在 |
| `@default(cuid())` | 完全沒有 | **Prisma 在 Node 程式裡算好再送出** |
| `@updatedAt` | 只有 `NOT NULL`，沒有 DEFAULT | **Prisma 每次 update 時自己塞** |
| `@default(now())` | `DEFAULT CURRENT_TIMESTAMP` | 資料庫（這個**有**下放） |

推論很直接：**如果有人繞過 Prisma 直接下 SQL 寫入，`id` 會是 null 而噴錯、`updatedAt` 永遠不會更新，但 `createdAt` 照樣正確。**

> 隨手寫的驗證：在 Neon 的 SQL 編輯器下
> `INSERT INTO "Answer" (questionId, responseId, content) VALUES ('q1','r1','hi');`
> 會失敗兩次 —— 先是 `id` 違反 not-null（**ORM 的功能沒生效**），就算補上 id，外鍵約束也會擋下不存在的 `q1`（**資料庫真的在把關**）。

這個區分之後會一直用到：**約束寫在資料庫，才是所有寫入路徑都躲不掉的保證；寫在 Prisma 或 service，就只保護走那條路的人。**

### `ON DELETE` 與 `ON UPDATE` 是兩個獨立的時機

schema 只寫了 `onDelete: Cascade`，但 SQL 多出一個 `ON UPDATE CASCADE` —— 那是 Prisma 的預設值。它們不是包含關係：

| | 什麼時候觸發 | Cascade 的意思 |
| --- | --- | --- |
| `ON DELETE` | 有人**刪掉** `Survey` 那一列 | 把指向它的 `Question` 一起刪 |
| `ON UPDATE` | 有人**改掉** `Survey.id` 這個值 | 把 `Question.surveyId` 一起改成新值 |

注意 `ON UPDATE` 盯的**不是整列的任何更新**，而是專門盯**被指向的那一欄（主鍵）本身變了**。改 `title` 不會觸發它。

而因為主鍵是 cuid、而主鍵的第三條性質是「永不改變」，**這條規則在本專案永遠不會作用**。留著無害，但知道它是什麼。

### 唯一約束在 Postgres 就是唯一索引

`@@unique` 產生的是 `CREATE UNIQUE INDEX`，不是某種獨立的約束語法。這帶來一個實用的結論：

**複合索引只有「從最左邊開始的前綴」能單獨拿來查。**

`Answer_responseId_questionId_key` 的最左欄是 `responseId`，所以「查某一次填答的所有答案」已經有索引可用，不必再寫 `@@index([responseId])`。但 `questionId` 不是最左前綴，統計某一題的所有答案就需要自己補 `@@index([questionId])`。

同理，`@@unique` 裡兩欄的順序**不影響擋重複的效果**（`(A,B)` 唯一等於 `(B,A)` 唯一），但會影響：

1. 順便加速哪一種查詢
2. Prisma Client 產生的欄位名 —— `where: { responseId_questionId: {...} }`

---

## 決策取捨

### 主鍵用 cuid，不用自增整數

問卷 id 會出現在給外部填答的網址裡。`/surveys/7` 只要改成 `8` 就能看到別人的問卷，而且等於對外公告「我們總共有幾份問卷、成長速度多快」。

代價：cuid 比整數佔空間、排序沒有意義、肉眼難比對。**在有外部網址的資源上這個代價值得付。**

### `options` 用字串陣列，不另拆一張 `Option` 表

選項存成 `String[]`，代表**選項沒有自己的 id**。Ch10 做統計時，「A 選項被選了幾次」只能靠**比對文字**算出來 —— 一旦有人改了選項文字，舊資料就對不上。

正規做法是再拆一張表讓每個選項有 id。**沒有這樣做，是因為那會讓 Ch1 多一張表、多一層關聯，成本大於這一章的收穫。** 這是知情的技術債，不是疏忽。

### 題型只做 `TEXT` / `SINGLE_CHOICE`

只有這兩種時，一個答案就是一個字串，`Answer.content String` 結構最乾淨。多選會逼出「一個答案多個值」的問題。

真的需要多選時再加 —— **對已經有資料的表加欄位本來就是 Ch9 要練的功課**，先做等於提前把作業寫掉。

### 三個 `onDelete` 都選 `Cascade`

前兩個沒有懸念：刪問卷就該連題目和回覆一起消失；刪一次回覆就該連它的答案一起消失。

第三個（刪題目 → 它的答案）曾考慮 `Restrict`，把「有人填答就不能改題目」這條商業規則直接刻進資料庫。**否決的理由是它會讓「刪整份問卷」變成間歇性失敗：**

```text
DELETE Survey
  ├─→ cascade 刪 Question ──→ 此時 Answer 還在 → Restrict 擋下 → 整個刪除失敗
  └─→ cascade 刪 Response ──→ cascade 刪 Answer
```

PostgreSQL **不保證這兩條路的執行順序**。`Response` 那條先跑就沒事，`Question` 那條先跑就報錯 —— 這種時好時壞的 bug 最難查。

**結論：用 `Cascade`，那條商業規則寫在 service 層**（Ch3 的單元測試之一）。歸納成通則：

> **資料庫約束擅長守「結構」的正確性**（這個 id 存不存在、這個組合重不重複）；
> **「狀態相關」的商業規則**（這份問卷現在是什麼狀態、能不能改）**交給 service。**
> 後者需要先查狀態再判斷，硬塞進資料庫換來的往往是你控制不了的連鎖反應。

### 唯一約束放 `[responseId, questionId]`，不是 `[surveyId, questionId]`

一列 `Answer` 的意思是「**在第 R 次填答裡，第 Q 題的答案是 ___**」，所以規則自然是「(R, Q) 不能重複」。

拆開或換掉任何一欄都會壞掉：

| 寫法 | 實際效果 |
| --- | --- |
| `questionId` 單獨 unique | 第 3 題全世界只能有一列答案 → 第二個人填就被擋 |
| `responseId` 單獨 unique | 一次填答只能有一列答案 → 整份問卷只能答一題 |
| `[surveyId, questionId]` | 每一題全世界只有一個答案 → 3 題的問卷總共只收得到 3 列 |
| `[responseId, questionId]` | 每次填答的每一題各一個答案 ✔ |

**關鍵在中間那一欄是「問卷」還是「這次填答」。** 換成 `responseId` 之後，重複填答會產生**新的 `Response`、新的 `responseId`**，於是 `(r_001, q1)` 和 `(r_002, q1)` 是不同組合，一個都不會被擋 —— 而這正是我們要的：重複填答是兩份獨立的回覆，不是改寫上一次的答案。

（真要做「一人一份只能填一次」，該加的是 `Response` 的 `@@unique([userId, surveyId])`，擋在產生新 `Response` 那一步。需要先有使用者，是 Ch6 的事。）

### 沒有加的約束

| 想過但沒加 | 理由 |
| --- | --- |
| `Survey.title` unique | 不同部門各出一份「員工滿意度調查」完全合理 |
| `Question @@unique([surveyId, order])` | 往中間插一題時要先挪動後面所有題的 `order` 才不會撞到，麻煩大於好處 |
| `SurveyStatus.CLOSED` | 沒有任何一章會用到。課綱修訂紀錄裡檢討過的「死欄位」 |

> 判斷原則：**`@@unique` 是在寫一條商業規則，不是裝飾。想不出「不加會出現什麼壞資料」，就不要加。**

### seed 用寫死的 id + `upsert`

seed 必須能重複執行不出事，而 `upsert`（有就更新、沒有就新增）需要一個固定的識別碼判斷「這筆存不存在」。若讓 `@default(cuid())` 隨機產生，跑五次就會有五份一模一樣的問卷。

所以 seed 資料的 id 一律寫死並加 `seed-` 前綴（在 Prisma Studio 裡一眼看出哪些是假資料）。**只有 seed 這樣做**，正式流程建立的問卷還是交給 cuid。

---

## 踩到的坑

| 症狀 | 根因 | 解法 |
| --- | --- | --- |
| `Type "Question" is neither a built-in type, nor refers to another model...` | schema 寫到一半，`Survey` 引用了還不存在的 model | **這是正常的，不是 bug。** 四個 model 都寫完就會消失。**千萬不要為了消掉錯誤去改 `Survey`** |
| 存檔後自動多出 `survey Survey @relation(...)` | VS Code 的 Prisma 擴充套件跑 `prisma format`，自動補完「只寫了一半的關聯」 | 是幫忙，不用擋。反過來說，**某個 model 沒被自動補，代表它兩邊都沒宣告關聯** |
| `Answer` 有 `questionId` 欄位卻沒有外鍵約束 | 只寫了 `questionId String`，沒寫 `@relation` | 光有欄位不會產生 `FOREIGN KEY`，資料庫不會擋亂填的 id。要補 `@relation`，並在對方 model 加 `answers Answer[]` |
| 外鍵查詢很慢 | PostgreSQL 只對主鍵和唯一約束自動建索引，**外鍵不會** | 每個外鍵欄位自己加 `@@index` |
| `pnpm lint` / `pnpm format` 不檢查 `prisma/seed.ts` | 兩個指令的 glob 是 `{src,apps,libs,test}/**/*.ts`，不含 `prisma/` | 目前靠 IDE 的 ESLint 外掛與手動 `pnpm exec prettier --write prisma/seed.ts`。若之後 `prisma/` 底下的程式碼變多，再考慮擴大 glob |

**`prisma/seed.ts` 必須加進 `tsconfig.build.json` 的 `exclude`。** 它在 `src/` 外面，不排除的話 tsc 推導的 `rootDir` 會從 `src/` 擴大到專案根目錄，`pnpm build` 的輸出變成 `dist/src/main.js`，`pnpm start:prod` 直接找不到進入點。這跟 Ch0 的 `prisma.config.ts` 是同一個坑 —— **在專案根目錄或 `src/` 外面新增任何 `.ts` 檔都要記得這件事。**

### 沒踩到的坑：shadow database

`migrate dev` 需要一個臨時資料庫做 drift 偵測。本機 PostgreSQL 會自動建，**雲端服務不一定允許 CLI 自己建** —— 這是這一章原本預期最可能爆掉的地方。

實際上 Neon 允許，一次就過。但若之後換供應商時遇到，處理順序是：

1. 在 Console 開一個 branch 當 shadow
2. `.env` 加 `SHADOW_DATABASE_URL`，同步把 key 的形狀補進 `.env.example`
3. `prisma.config.ts` 的 `datasource` 加 `shadowDatabaseUrl`

> **migration 出錯時不要亂試指令**（`reset`、改 schema 再跑一次、手動去資料庫建表）。**migration 歷史一旦搞亂，比原本的錯誤難救得多。先讀錯誤訊息。**

---

## 作業

1. 打開 `prisma/migrations/20260807020256_init_survey_schema/migration.sql`，找出 `questions Question[]` 對應到哪一行 SQL。
2. `pnpm exec prisma studio`，打開 `Answer` 表，確認那三列的 `responseId` 都指向同一個 `Response`、`questionId` 各不相同。
3. 再跑一次 `pnpm exec prisma db seed`，然後回 Studio 看 —— 資料有變多嗎？為什麼？
4. 把 `prisma/seed.ts` 裡 `answers` 陣列的第一個值改掉，重跑 seed。這次 Studio 裡變了什麼？這說明 `upsert` 的哪一個參數生效了？

### 解答

**第 1 題 —— 找不到，這就是答案。**

`questions Question[]` 是給 Prisma Client 用的**虛擬欄位**，存在的唯一理由是讓你能寫 `include: { questions: true }`。真正的外鍵在 `Question.surveyId`（外鍵永遠放在「多」那一邊），所以整份 SQL 裡沒有任何一行對應它。

**第 2 題 —— 三列的 `responseId` 都是 `seed-response-1`。**

這正是 `@@unique([responseId, questionId])` 允許的形狀：同一次填答可以有很多列答案，只要題目不重複。

**第 3 題 —— 資料沒有變多。**

`upsert` 的 `where` 用寫死的 id 找到既有的那筆，走的是 `update` 而不是 `create`。這就是 seed 能重複執行的原因。若當初用 `create`，第二次會直接撞主鍵重複而失敗。

**第 4 題 —— 那一列的 `content` 被改成新值，但列數不變、`id` 也沒變。**

生效的是 `update` 參數。`create` 只在資料不存在時才會被用到。

順帶注意 `Answer` 的 `where` 長這樣：

```ts
where: { responseId_questionId: { responseId: RESPONSE_ID, questionId } }
```

那個欄位名是 Prisma 依照 `@@unique([responseId, questionId])` 的**順序**自動組出來的。schema 裡兩欄對調，這裡的名字也會跟著變成 `questionId_responseId`。
