# Ch15 — 串接暴露的 API 設計問題

> 階段三第三章,三輪:① 讀取的擁有權 ② 驗證規則寫進契約 ③ 統一的欄位級錯誤。

這一章的問題**不是想出來的,是串接送來的**。三個問題有同一個共同點:

> **前十四章的 138 條 e2e 一條都抓不到,而且 `/docs` 也看不出來。**

因為它們驗的是「行為正確」,而這一章問的是「**好不好用**」。

---

## 核心概念

### 1. 安全邊界不能被使用者的參數影響

`GET /surveys` 的 `where` 有兩件不同的事:

```
status / title  ← 使用者「想看什麼」，由參數決定
擁有權條件      ← 使用者「能看什麼」，是安全邊界
```

輪 ① 第一版把 `query.status` 放進了 `OR` 的左半邊 —— 於是使用者送
`?status=DRAFT` 就能列出全站所有人的草稿。**參數跑進了安全邊界裡。**

### 2. `undefined` 在 `AND` 裡無害,在 `OR` 裡是恆真

Ch4 學過「`undefined` 在 Prisma 裡代表這個條件不存在」。同一個機制,放進 `OR` 之後後果相反:

```ts
{ title: X, status: undefined }              // → WHERE title = X          少一個限制
{ OR: [{ status: undefined }, { ... }] }     // → 那個分支恆真，整個 OR 失效
```

### 3. 403 會洩漏「這個 id 存在」

看不到的東西一律 404,包括「你想改它」的時候。回 403 等於承認它存在,對方就能
拿一串 id 去掃,靠 403 與 404 的差別列舉出全站有哪些問卷。

於是判斷的順序又往前推了一層:

```
canSeeSurvey     你看得到嗎？          看不到 → 404
canManageSurvey  你能不能碰？          不能碰 → 403
商業規則          這件事現在能不能做？  不能做 → 409
```

Ch12 說「授權要排在商業規則之前」,Ch15 說「**看得到才談得上授權**」。
修完之後 403 只剩一種情況:**你看得到、但它不是你的**(別人的已發布問卷)。

### 4. 錯誤回應要給「機器能判斷的東西」

```
改之前  details: ["password must be longer than or equal to 8 characters"]
        message: "資料已存在"          ← 409 連哪個欄位都沒說
改之後  fields: [{ field: "password", rule: "minLength" }]
        fields: [{ field: "email",    rule: "unique" }]
```

前端要標紅輸入框,改之前只能**解析英文字串** —— 而那正是專案規則
「用 `code` 分支,不要解析 `message`」禁止的事。

業界做法一致(GitHub 的 `errors[{field, code}]`、Stripe 的 `param`、
Google 的 `fieldViolations`):**欄位名是獨立的資料,不是句子的一部分。**

---

## 決策取捨

### 「看得到 = PUBLISHED,或者是我的」

規則由使用者的分類推導出來:能填的(PUBLISHED)、我建立的、我的草稿。
而「能看就是能填」,所以看題目的規則跟看問卷是同一條。

漂亮的地方是**第三種分類不必寫任何程式碼**:`?status=DRAFT` 化簡之後
(`DRAFT AND (PUBLISHED OR 我的)`)自動變成「我的草稿」——`DRAFT` 與 `PUBLISHED` 互斥。

### 補了 `minLength` 到契約,前端的硬寫**不會**消失

`openapi-typescript` 產出來的 `password` 仍然是 `string`,`minLength` 連 JSDoc 都沒進去。
TypeScript 沒有「最短 8 字的字串」這種型別。

收益是「`/docs` 看得到、IDE hover 看得到、前端硬寫時有依據可對照」,不是消除硬寫。
**表單驗證本來就該前端一份、後端一份** —— 前者是 UX(即時回饋),後者是防守。

### `details` 不翻成中文

三個理由:i18n(中文寫死在後端就鎖死了)、文案是產品的決定(改一次要重新部署後端)、
**前端本來就有一份**(`login.vue` 已經寫了「密碼至少 8 個字」)。

所以後端給結構化的 `{ field, rule }`,前端做文案。

### `LoginDto` 的密碼刻意不補長度

登入的 `password` 只有 `@IsNotEmpty()` —— 密碼規則會變,而舊帳號的密碼可能不符合新規則。
把 register 那份抄過去就是「文件說謊的第三種形狀」:寫了一句不成立的話。

---

## 踩到的坑

### 1. `canSeeSurvey` 第一版跟 `canManageSurvey` 一模一樣

漏了 `PUBLISHED` 那半邊,後果是**別人的已發布問卷全部消失** —— 沒有人能填別人的問卷,
而其他測試不會叫。`responses.e2e-spec.ts` 的檔頭早就警告過同一個陷阱(在「改」那一側)。

根因是**簽名少了一個參數**:`canSeeSurvey(ownerId, user)` 問不出「這份問卷是不是已發布」,
函式再怎麼寫都不可能得出正確答案。

### 2. `survey.rules.ts` 的檔頭第三次過期

Ch5→Ch12 一直寫著「兩條」(漏了七章),Ch15 加 `canSeeSurvey` 時又寫著「四條」——
**而上一次的警告就寫在那個檔頭裡,卻沒能阻止第二次。**

結論:「寫一句提醒」不是有效的對策,那是靠紀律。**把那個數字整個拿掉** ——
下面的清單本身就是答案。

### 3. Prisma 7 的 P2002 拿不到 `meta.target`

```
Prisma 5/6（網路上所有教學）   meta.target = ['email']
Prisma 7 + driver adapter      meta.driverAdapterError.cause.constraint.fields
```

四層深,而且是內部結構、不是公開契約。**每一層都要可選鏈** ——
讓它丟 `TypeError` 的話會掉進 filter 最後那支 `else` 變成 500:
使用者註冊撞 email 會看到「伺服器發生錯誤」。**降級,不要炸掉。**

而那條測試要斷言到**值**(`[{ field: 'email', rule: 'unique' }]`)而不是「有沒有 fields」——
只驗「有」的話,路徑失效時 `fields` 是 `undefined`,測試不會紅。

### 4. 前端的 `ApiError` 是手寫的,所以契約改了 `typecheck` 不紅

後端把 `details` 換成 `fields` 之後,前端 `pnpm typecheck` **一個字都沒紅** ——
它只是安靜地讀到 `undefined`,然後掉回 `?? err.message`。

改成 `type ApiError = components['schemas']['ErrorBodyEntity']` 之後,同一行程式碼立刻
`Property 'details' does not exist`。這條規則 Ch13 就寫進 `CLAUDE.md` 了,
而**每一支請求都會經過**的那個型別一直是漏網之魚。

### 5. 突變測試要往「放寬」的方向做

第一次驗證「契約說的 minLength 是真的」時,把 `@MinLength(8)` 改成 `10` ——
結果 15 條全紅。那不是測試抓到了,是 `beforeEach` 的 `registerAndLogin` 用 8 碼密碼、
**前提資料整個炸掉**。改成放寬(`8` → `7`)才分得出是誰抓到的。

---

## 作業

1. `GET /surveys` 不帶參數、帶 `?status=DRAFT`、帶 `?mine=true` 各回什麼?
   為什麼「我的草稿」不必寫額外的程式碼?
2. 看不到別人的草稿時回 404 而不是 403。那 `PATCH` 別人的**已發布**問卷呢?
   為什麼那裡 403 是對的?
3. 契約補了 `minLength: 8` 之後,前端產出的 `password` 型別變了嗎?
   那這一輪的收益到底是什麼?
4. `extractConflictFields` 每一層都用可選鏈。如果哪一層直接用 `.`,
   使用者註冊撞 email 時會看到什麼?
