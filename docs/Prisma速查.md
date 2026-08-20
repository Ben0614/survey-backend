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

## 7. 常見錯誤碼

| 碼 | 意思 | 這個專案怎麼處理 |
| --- | --- | --- |
| `P2025` | 要更新／刪除的紀錄不存在 | 先 `assertExists` 擋成 404，不 catch |
| `P2002` | 違反唯一約束 | 在 service 先擋成 400 |
| `P2003` | 違反外鍵約束 | 同上（歸屬檢查順便擋掉）|

**判準：能在自己這一層先擋掉的，就不要讓資料庫的錯誤碼冒上來。**
Nest 不認識這些碼，一律變成 **500**。（統一 catch 是 Ch6 Exception Filter 的正題。）
