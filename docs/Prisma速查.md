# Prisma Client 速查

**這份文件回答一件事：某支方法可以帶哪些參數、每個參數在做什麼。**

跨章節的參考資料，隨專案演進更新。資料庫本身的觀念（主鍵、外鍵、一對多、交易）在
[`關聯式資料庫基礎.md`](關聯式資料庫基礎.md)；這裡只講「翻譯成 Prisma 的寫法」。

> **Prisma 7 的教學在網路上九成不適用**（多數是 v5/v6）。查用法優先用
> `.claude/skills/` 底下的官方技能包，不要 Google。

---

## 一句話的心智模型

**每支方法都收一個物件，裡面的 key 是參數。參數只做四件事：**

| 做什麼 | 參數 |
| --- | --- |
| 挑哪些列 | `where` |
| 排序與分頁 | `orderBy` / `skip` / `take` |
| 決定回傳的形狀 | `select` / `include` |
| 給要寫進去的資料 | `data` |

其餘的都是這四類的變形。**巢狀不是新語法**，是同一組參數再來一次（見「`include` 底下能放什麼」）。

---

## 1. 每支方法收什麼、回什麼

| 方法 | 必要參數 | 常用可選 | 回傳 |
| --- | --- | --- | --- |
| `findUnique` | `where`（**只吃唯一欄位**）| `select` / `include` | 一筆 或 **`null`** |
| `findFirst` | — | `where`（任意欄位）/ `orderBy` / `select` / `include` | 一筆 或 `null` |
| `findMany` | — | `where` / `orderBy` / `skip` / `take` / `select` / `include` | **陣列**（可能是空的）|
| `count` | — | `where` | **數字** |
| `create` | `data` | `select` / `include` | 建好的那一筆 |
| `update` | `where`（唯一）+ `data` | `select` / `include` | 更新後那一筆 |
| `delete` | `where`（唯一）| `select` / `include` | **被刪掉的那一筆**（刪除前的快照）|
| `updateMany` / `deleteMany` | `where`（+ `data`）| — | `{ count: 3 }` |
| `upsert` | `where` + `create` + `update` | — | 那一筆 |

### 三個最常踩的點

**① `findUnique` 的 `where` 只吃 `@id` / `@unique` / `@@unique`。**
因為只有「唯一」才保證最多一筆 —— 否則資料庫回三筆時它不知道該回哪一筆。
拿 `title` 去查會被 TypeScript 直接擋下。要用非唯一欄位就換 `findFirst`（但要配 `orderBy` 才有意義）。

**② 找不到時的行為不一樣：**

| 方法 | 找不到 |
| --- | --- |
| `findUnique` / `findFirst` | 回 **`null`**，不丟錯（在 Prisma 眼中「沒找到」是正常結果）|
| `update` / `delete` | **丟 `P2025`** |

所以 `update` / `delete` 前面要先 `assertExists` —— 不然 404 會變成 **500**（Nest 不認識 `P2025`）。
這是 `surveys.service.ts` 那兩支方法開頭那行的由來。

**③ `delete` 回傳的是被刪掉的那一筆，不是「刪了幾筆」。**
那是一張**刪除前的快照** —— body 有內容不代表資料還在。所以 e2e 除了看 body，還要再查一次資料庫。

---

## 2. `data` 能帶什麼（`create` / `update`）

**本表的欄位，加上關聯的「動作」。**

```ts
prisma.response.create({
  data: {
    surveyId: 'xxx',                        // ① 純量欄位：直接給值
    createdAt: new Date('2026-01-01'),      // ② 有 @default 的：可給可不給
    answers: { create: [{ ... }, { ... }] },// ③ 關聯欄位：給一個「動作」
  },
});
```

### 哪些可以省略（照 `schema.prisma` 判斷）

| schema 寫法 | 可以省略嗎 | 為什麼 |
| --- | :---: | --- |
| `title String` | ❌ | 必填 |
| `status SurveyStatus @default(DRAFT)` | ✅ | 有預設值 |
| `id String @id @default(cuid())` | ✅ | Prisma 產生 |
| `updatedAt DateTime @updatedAt` | ✅ | Prisma 每次更新自動填 |
| `deletedAt DateTime?` | ✅ | 可為 null |
| `answers Answer[]` | ✅ | **虛擬欄位，本來就不是資料庫欄位** |

> `@default(cuid())` 與 `@updatedAt` **完全沒有下放到資料庫**（Ch1 的結論）——
> 繞過 Prisma 直接下 SQL 就會失效。`@default(now())` 則是真的寫進資料庫。

### 關聯欄位的三個動作

| 動作 | 意思 | 什麼時候用 |
| --- | --- | --- |
| `create` | 這些是新的，一起建出來 | 一次寫入父子兩張表 |
| `connect` | 這些已經存在，只把關聯接上 | `{ connect: { id: 'xxx' } }` |
| `connectOrCreate` | 有就接、沒有就建 | 標籤那種可重用的東西 |

**巢狀 `create` 不用寫外鍵：**

```ts
answers: {
  create: [{ questionId: 'q1', content: '滿意' }],   // 沒有 responseId
}
```

因為它巢狀在 `response.create` 底下，Prisma 自己知道要填剛產生的那筆 `Response` 的 id ——
而那個 id 是 `@default(cuid())` 產生的，**送出 SQL 之前連你都還不知道它是什麼**。

**而且巢狀 write 本身就是一個交易**（實測 log 有 `COMMIT`），不需要自己包 `$transaction`。
判準見 [`關聯式資料庫基礎.md`](關聯式資料庫基礎.md) 第 7 節與 `ch05`。

### `undefined` = 不要動它

```ts
data: { title: dto.title }   // dto.title 是 undefined → Prisma 把這個欄位整個從 SQL 拿掉
```

**不是寫入空值**。在 Prisma 眼中：

| 值 | 意思 |
| --- | --- |
| `undefined` | 不要動它 |
| `null` | 把它設成空值 |

「空 body 什麼都不改」靠的是這個約定，不是額外寫了 `if`。

---

## 3. `where` 能帶什麼

**第一層的 key 永遠是欄位名**，值有兩種形狀：

```ts
where: {
  status: 'DRAFT',                                     // 給純量 → 等於
  title: { contains: '滿意度', mode: 'insensitive' },   // 給物件 → 用裡面的運算子比
  id: { in: ['a', 'b'] },
  createdAt: { gte: new Date('2026-01-01') },
}
```

### 常用運算子

| 運算子 | 意思 | SQL |
| --- | --- | --- |
| `in` / `notIn` | 是這幾個之一 | `IN (...)`（就是一串 `OR` 的簡寫）|
| `contains` | 包含 | `LIKE '%...%'` |
| `startsWith` / `endsWith` | 開頭／結尾 | `LIKE '...%'` |
| `gt` / `gte` / `lt` / `lte` | 大於／大於等於／小於／小於等於 | `>` `>=` `<` `<=` |
| `not` | 不等於 | `<>` |
| `mode: 'insensitive'` | 不分大小寫（**PostgreSQL 專屬**）| `ILIKE` |

> **`contains` 的代價**：`'%...%'` 前面那個 `%` 讓一般 B-tree 索引完全失效（索引是照開頭排序的）
> → **全表掃描**。加一個搜尋框在資料庫端不是免費的。

### 三個特殊的

```ts
where: {
  status: undefined,                       // ← 這個條件**整條不存在**（不是「等於 null」）
  AND: [{ ... }, { ... }],                 // 也有 OR / NOT
  answers: { some: { content: 'x' } },     // 關聯條件
}
```

**`undefined` = 不加這個條件** —— 所以「沒帶篩選參數就不篩」不需要寫 `if`。
打開 query log 看得到證據：什麼都不帶時 SQL 是 `WHERE 1=1`（`1=1` 是「一個條件都沒有」的佔位符），
**那些條件不是被跳過，是從來沒被產生**。

關聯條件（一對多）有三個：

| | 意思 |
| --- | --- |
| `some` | 至少有一筆符合 |
| `every` | 每一筆都符合 |
| `none` | 一筆都不符合 |

---

## 4. 回傳的形狀：`select` / `include`（**同一層只能擇一**）

```ts
// 什麼都不寫 → 本表所有純量欄位
{ id, surveyId, createdAt }

// include → 本表全部「加上」關聯
include: { answers: true }
{ id, surveyId, createdAt, answers: [...] }

// select → 只有你列的（連純量欄位也要自己列）
select: { id: true, status: true }
{ id, status }
```

**關聯欄位預設不回** —— `schema.prisma` 裡 `answers Answer[]` 不對應任何資料庫欄位，
所以不寫 `include` 就不會出現。要關聯資料就得明講。

### 型別會自己跟著變

```ts
select: { id: true, status: true }   // 型別自己變窄 → { id: string; status: SurveyStatus }
include: { questions: true }         // 型別自己變寬 → Survey & { questions: Question[] }
```

**兩邊都不必寫型別註記** —— 把游標移上去看一眼，這是 Prisma 型別系統最有感的地方。

> ⚠️ **但條件式的 `include` 沒有這個好處**：
> `include: cond ? {...} : undefined` 會讓型別推導**退回保守側**（塌成「沒有關聯」那一種）。
> 執行期是對的，編譯期不知道。取捨見 `ch04` 第三段。

### `include` 底下能放什麼

**跟 `findMany` 是同一套參數**，所以巢狀不是新語法：

```ts
include: {
  answers: {
    include: { question: true },                  // 再往下一層
    orderBy: { question: { order: 'asc' } },      // 可以照**關聯表的欄位**排序
    where: { ... },                               // 也可以
    take: 10,                                     // 也可以
  },
}
```

`orderBy: { question: { order: 'asc' } }` 是「依關聯的欄位排序」——
**這是少數 Prisma 真的會產生 JOIN 的場合**（排序必須在同一句 SQL 裡完成）。

### `include` 是多一句 SQL，不是 JOIN

一個 `include` = **兩句 SELECT**，不是一句 JOIN。Prisma 用「多一次網路往返」換
「不重複傳輸資料 + 語義單純」—— JOIN 會讓每一列重複帶著父資料，多一層就相乘（cartesian explosion）。

**這不是 N+1**：N+1 的查詢數**隨資料量成長**，`include` 是固定的兩句。

---

## 5. 參數 → SQL 對照表

| Prisma | SQL |
| --- | --- |
| `where` | `WHERE` |
| `orderBy` | `ORDER BY` |
| `take` | `LIMIT` |
| `skip` | `OFFSET` |
| `select` / `include` | 決定 `SELECT` 後面那串欄位（`include` 會**多送一句** SQL）|
| `data`（`create`）| `INSERT INTO ... VALUES` |
| `data`（`update`）| `UPDATE ... SET` |
| `$transaction([...])` | `BEGIN` ... `COMMIT` |

---

## 5b. `$transaction` 的兩種形式，以及它保證什麼

```ts
// 陣列形式 —— 兩句都是獨立的查詢，中間不能有 JS 邏輯
prisma.$transaction([queryA, queryB]);

// 互動形式 —— 中間可以寫程式，但**每一句都必須走 tx**
prisma.$transaction(async (tx) => {
  const n = await tx.question.count({ ... });   // 用 this.prisma 就跑到交易外面了
  return tx.question.create({ ... });
});
```

**`tx` 是「這個交易的那一條連線」。** 交易是綁在單一連線上的東西（`BEGIN` 與 `COMMIT`
下在同一條線上），而 `prisma.xxx` 每次是從連線池隨便拿一條 —— 用它就等於開了另一個 session。
**`tsc` 檢查不到這件事**，兩者型別幾乎一樣。

### ⚠️ 交易保證的沒有你以為的多

| | 交易管得到嗎 |
| --- | :---: |
| 多句寫入「做一半」 | ✅ 本業 |
| 多句查詢看到同一份快照 | 🔸 **`Read Committed` 下不保證**（見下） |
| 「我讀到的值在我寫入之前變舊了」 | ❌ 完全不管 |

**PostgreSQL 的預設隔離級別是 `Read Committed`，Prisma 不會自己改它。**

| 隔離級別 | 快照什麼時候取 |
| --- | --- |
| **`Read Committed`**（預設）| **每一句 SQL 各取一次** |
| `Repeatable Read` | 第一句取一次，整個交易共用 |
| `Serializable` | 同上，再加偵測寫入衝突（衝突方拿到 `P2034`）|

要改就明講：

```ts
prisma.$transaction(async (tx) => { ... }, { isolationLevel: 'RepeatableRead' });
```

**所以「讀一個值 → 算 → 寫入」這種形狀，包了交易也擋不住 race**
（兩個交易可以同時讀到同一個舊值）。這個專案的
`questions.service.ts` 算 `order` 就是這個形狀，取捨寫在 `ch05`。

### 幾個 Prisma 自己加上去、你沒寫的東西

看 log 時會遇到，**先問「它會不會改變結果」**：

| 你會看到 | 那是什麼 |
| --- | --- |
| `WHERE 1=1` | 「一個條件都沒有」的恆真佔位符 |
| `LIMIT $n OFFSET $m` 出現在 `findUnique` | Prisma 幾乎每句 SELECT 都帶。**「看到 LIMIT 就是分頁」是錯的推論** |
| `count` 的子查詢裡有 `OFFSET` | 固定模板，值是常數 0 |
| `CAST($1::text AS "SurveyStatus")` | enum 在 PostgreSQL 裡是**真的型別**，值以文字送進去再轉 |
| `"status"::text` | 出來時再轉回文字 |

---

## 6. 打開 query log

```powershell
$env:PRISMA_LOG_QUERIES=1; pnpm start:dev
```

（或改 `.env` 的 `PRISMA_LOG_QUERIES=1`，那會一直生效。）

**注意 log 印的是 `$1` 佔位符，不是實際的值。** 想看到值要把 `prisma.service.ts` 的
`log: ['query']` 改成事件形式才有 `e.params`（目前還沒做）。

**什麼時候該打開它**：

- 用了 `include` 想知道多送了幾句
- 覺得「這一行怎麼可能只有一句 SQL」的時候
- 寫入多張表想確認 `BEGIN` / `COMMIT` 在不在
- **回應完全正確、測試全綠，但你想知道代價** —— Ch3 就是這樣量到「同一批題目撈了兩次」的

> **ORM 讓你用一行程式碼換到不知道幾句 SQL。** 不打開 log，永遠不會有人發現。

---

## 6b. migrate 與 generate 是兩件事（Ch9 兩次踩到）

**`migrate` 系列管「資料庫的結構」，`generate` 管「TypeScript 的型別」。**
改完 `schema.prisma` 之後**兩邊都要更新**，而且不能假設其中一個會順帶做掉另一個。

| 指令 | 資料庫 | `migrations/` | **`src/generated/`** |
| --- | :---: | :---: | :---: |
| `prisma generate` | ❌ | ❌ | ✅ **只做這件事** |
| `prisma migrate dev --name X` | ✅ 套用 | ✅ 產生新資料夾 | ⚠️ **這個專案實測兩次都沒有** |
| `prisma migrate deploy` | ✅ 套用 | 只讀 | ❌ **完全不碰** |
| `prisma migrate status` | 只讀 | 只讀 | ❌ |
| `prisma migrate diff` | 只讀 | ❌ | ❌ |
| `prisma migrate reset` | ✅ 清空後重播 | 只讀 | ⚠️ 同 `migrate dev` |

`migrate deploy` 不產生 client 是刻意的 —— 它設計給正式環境用，而那裡的 client 是 build 時就產好的。
**這就是 `package.json` 要有 `prebuild: prisma generate` 的原因**：Render 的 Build Command
（`pnpm install && pnpm build && prisma migrate deploy`）三段裡沒有一段會產生 client。

> **驗收不能只看 `tsc`。** 還沒有程式碼用到新 model 或新欄位時，client 有沒有跟上對 `tsc` 完全沒差
> —— Ch9 輪 1 就是這樣：`migrate dev` 跑完、`tsc` 0 errors，而 client 停在三小時前、沒有 `User` 型別。
> **改完 schema 直接查產物**：`ls src/generated/prisma/models/` 或 `grep -rl "<新欄位名>" src/generated/`。

### `migrate status` 抓不到 schema 與資料庫的漂移

```
$ pnpm exec prisma migrate status
Database schema is up to date!
```

**這句話回答的不是你以為的問題。** 它只比對「`migrations/` 資料夾」與「資料庫記錄的已套用清單」，
**完全不看 `schema.prisma`**。所以「改了 schema 但沒重新產生 migration」這種漂移它一個字都不會說。

Ch9 輪 4 實際踩過：`schema.prisma` 寫 `onDelete: SetNull`，資料庫的外鍵其實是 `CASCADE`
（先產生 migration、再回頭改 schema 而沒重新產生）。後果不只一張表 —— `Question` / `Response` /
`Answer` 對 `Survey` 都是 `Cascade`，刪一個帳號會把所有人填的作答一起帶走。

**唯一抓得到的工具是 `migrate diff`：**

```bash
pnpm exec prisma migrate diff   --from-config-datasource prisma.config.ts   --to-schema prisma/schema.prisma   --script
```

沒有漂移時它印 `-- This is an empty migration.`；有漂移時它把「要下什麼 SQL 才能追上」直接印出來。

> Prisma 7 拿掉了 `--from-schema-datasource`，要用 `--from-config-datasource` 配設定檔。

**判準：`schema.prisma` 不是資料庫的真相，`prisma/migrations/` 才是。**

### `String?` 是「可為空」，不是「可省略」

中文的「選填」同時蓋住兩件事，這是 Ch9 輪 4 實際卡住的地方。它們在 JSON 裡是不同的東西：

```jsonc
{ "ownerId": null }   // key 一定在，值可能是 null   ← nullable
{ }                   // key 根本不存在              ← optional
```

| 層 | 寫法 | 意思 |
| --- | --- | --- |
| `schema.prisma` | `String?` | 這個欄位**可以沒有值**（`NULL`）；產生的 SQL 少了 `NOT NULL` |
| Prisma 產的型別 | `ownerId: string \| null` | 屬性一定在，**值**可能是 null |
| TypeScript | `ownerId?: string` | **屬性本身**可能不存在 |
| Swagger | `@ApiProperty({ nullable: true })` | 對應第二種 |
| Swagger | `@ApiPropertyOptional` | 對應第三種 |
| DTO | `@IsOptional()` | 請求**可以不給**這個欄位 |

`Survey.ownerId` 是第二種，`SurveyEntity.questions?` 才是第三種 —— **同一個檔案裡兩種都有，寫法必須不一樣**。
而這種錯誤 `swagger.e2e-spec.ts` 抓不到：它只比對 key，不看型別。

---

## 7. 常見錯誤碼

| 碼 | 意思 | 這個專案怎麼處理 |
| --- | --- | --- |
| `P2025` | 要更新／刪除的紀錄不存在 | 先 `assertExists` 擋成 404，不 catch |
| `P2002` | 違反唯一約束 | 在 service 先擋成 400 |
| `P2003` | 違反外鍵約束 | 同上（歸屬檢查順便擋掉）|

**判準：能在自己這一層先擋掉的，就不要讓資料庫的錯誤碼冒上來。**

**Ch6 重新評估過，這個判準不變。** 先擋才給得出「問卷不存在」這種具體訊息 ——
`catch P2025` 只知道「某一筆不見了」，說不出是哪一種資源。

### 萬一真的冒上來了（Ch6 輪 2 之後）

`src/common/filters/all-exceptions.filter.ts` 認得這三個碼，會翻譯成
404 / 409 / 400（對照表與理由見 [`docs/錯誤處理與狀態碼.md`](錯誤處理與狀態碼.md) 第 5 節），
不再是原始的 500。但它的定位是**安全網，不是主要防線**：
漏寫一處 `assertExists` 時，前端拿到的是 404 而不是 500，可是那條路徑本身
仍然是漏洞（filter 只管錯誤格式，不管商業邏輯有沒有先擋住）。

它防的不是假想的情境，是 **TOCTOU** —— `assertExists` 通過之後、`update` 執行之前，
另一個請求把那筆刪掉了。跟 `questions.service.ts` 的 `order` race 是同一族的形狀。
（`test/errors.e2e-spec.ts` 的第二個 `describe` 驗的是「filter 收到這種錯誤時會怎麼做」，
不是「TOCTOU 真的會發生」—— 那個 race 在 e2e 重現不出來，這是誠實記錄的缺口。）

認不得的碼（不在這張表裡的、或根本沒有 `code` 的）仍然是 500，
而且會被 `logger.error` 記下完整堆疊 —— **只翻譯認得的，不對未知的東西亂猜。**
