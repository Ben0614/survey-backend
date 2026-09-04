# Ch11 — RBAC：只有管理員能刪問卷

Ch10 讓伺服器知道「你是誰」，這一章讓它知道「**你能做什麼**」。

功能只有一句話：**只有 `ADMIN` 能刪問卷**。為此動了 13 個檔案，兩輪：
`role` 這個欄位存在並進得了 token（輪 1），有人去讀它並據此擋人（輪 2）。

---

## 核心概念

### 認證與授權是兩件事

| | 問題 | 誰負責 | 失敗時 |
| --- | --- | --- | :---: |
| 認證 authentication | 你是誰？ | `JwtAuthGuard`（Ch10） | 401 |
| 授權 authorization | 你能做什麼？ | `RolesGuard`（Ch11） | 403 |

兩支 guard 都是全域的，**順序由 `auth.module.ts` 的 `providers` 陣列決定**。
`JwtAuthGuard` 必須在前 —— `RolesGuard` 要用它放上去的 `request.user`，
**沒有身分就談不上角色**。

### 裝飾器只是紙條

```
@Roles(Role.ADMIN)   在方法上貼一張紙條：['ADMIN']    ← 啟動時一次，本身不擋任何人
RolesGuard           每個請求讀那張紙條並比對          ← 真正擋人的
```

只寫裝飾器、忘了註冊 guard 的話**效果是零，而且完全無聲**。
所以這一輪有一條驗收訊號：**新 guard 沒讓既有測試變紅，代表它根本沒生效。**

### 兩個 guard 的預設方向相反，而那不是不一致

```
@Public()   標了 → 放行     （不標 = 要驗票）
@Roles()    標了 → 才檢查   （不標 = 不看職稱）
```

它們回答的是不同的問題：一個問「這扇門要不要驗票」，另一個問「要不要看職稱」。
多數門不看職稱，那不代表它不驗票 —— 票在上一站驗過了。

### 貼陣列，不是貼開關

`@Public()` 貼 `true`，`@Roles()` 用 `...roles` 收可變參數、貼一個**陣列**。
所以 `@Roles(Role.ADMIN, Role.EDITOR)` 不必改任何程式碼就成立。

讀的時候泛型要寫 `<Role[]>` 而不是 `<boolean>`。寫成 `boolean` 時 tsc **不會叫**
（泛型只是宣告、不做執行期檢查），但你會拿一個陣列當開關用。

---

## 決策取捨

### `role` 放進 JWT payload，不是每次查資料庫

Ch10 的判準是「只有**每個請求都需要、不查就拿不到**的東西才值得放進 payload」，
而 `role` 是第一個真正符合的候選。

換到的是 `RolesGuard` **一句 SQL 都不用下** —— 那支 guard 只注入 `Reflector`，
不碰 token、不碰 secret、不碰資料庫，全部只有六行。

**代價**：payload 是**簽發當下的快照**。管理員被降權之後，那張票在過期前
（最多一小時）仍然是管理員。這個專案接受 —— 但要知道洞在哪，而不是以為沒有。

`email` 仍然不放：它是個資，而且使用者可以改。**看得見不等於改得了**（簽章擋住了），
**但看得見本身就是代價** —— 拿到一批 token 的人光看 `role` 就知道該優先偷哪一張。

### 這次 `NOT NULL` 加得上去

對照 Ch9 的 `ownerId`（加不上去）。差別不是風格，是**有沒有合法的值可以回填**：
`@default(USER)` 讓既有的每一列都填得起來；`ownerId` 當時指向一張空的 `User` 表，
根本不存在任何合法的值。

**能不能加 `NOT NULL` 是資料逼的，不是選擇。**

### `role` 不進 `RegisterDto`

判準：**這個值是「使用者說的」，還是「伺服器知道的」？** 前者才該進 DTO。

進了的話 `whitelist` 就不擋它（規則是「DTO **沒宣告**的欄位丟掉」），
任何人註冊時自己選 `ADMIN`。**這是同一課的第三次**（Ch2 的 `status`、Ch10 的 `ownerId`）。

### 「列出誰可以」，不是「排除誰不行」

```ts
requiredRoles.includes(user.role)   // undefined → false → 擋下   ✅
user.role !== Role.ADMIN            // undefined → true  → 放行   ❌
```

兩種在正常情況下行為一樣，只有遇到**沒有 `role` 的 payload** 才分岔 ——
而那不是假想的：Ch10 簽出去的 token 沒有這個欄位，`JWT_SECRET` 又沒換，
所以它們在過期前都還驗得過。

輪 1 對那批舊票的決定是**接受**（線上還沒有真實使用者、一小時後自然過期），
而那個決定成立的前提，正是這裡往「拒絕」的方向失敗。
這是「預設拒絕」的第五次：全域 `omit`、`@unique`、`whitelist`、`@Public()`，現在是它。

### 第一個管理員只能從系統外面來

沒有任何 API 能給人升權，那是刻意的：**能發放權力的端點是整個系統最有價值的
攻擊目標，而且它保護不了自己** —— 第一個管理員存在之前，沒有人有資格呼叫它。

所以答案永遠是「有資料庫存取權的那個人」：Prisma Studio、一句 SQL、或 seed。
測試裡的管理員也是這樣造的（`registerAndLoginAsAdmin` 中間那一步直接 `prisma.user.update`）。

---

## 踩到的坑

### 坑 1：`roles.guard.ts` 整支複製了 `jwt-auth.guard.ts`

「從隔壁複製一段結構正確的程式碼，然後只改了一半」的**第五次** ——
前四次都是一行，這次是整個檔案。

結果是邏輯完全反過來：`if (isRoles) return true` 照抄了 `@Public()` 的
「有紙條就放行」，於是**有 `@Roles()` 的端點直接放行、沒標的反而被重新驗票一次**。
零保護。而且那 3 條既有的 DELETE 測試**繼續綠**。

順帶還複製了 `JwtPayload` / `AuthUser` / `AuthenticatedRequest` 三個 interface，
專案裡一度有兩份同名型別 —— 之後改一份忘了另一份，tsc 不會叫（兩邊各自都合法）。

**判準：新 guard 沒讓既有測試變紅，代表它根本沒生效。**

### 坑 2：`STATUS_TO_CODE` 沒有 403

`ForbiddenException` 丟出去 → 查表查不到 → `?? FALLBACK_CODE` → 回應是
**狀態碼 403、`code` 卻是 `INTERNAL_ERROR`**。

JSON 完全合法、tsc 綠、lint 綠，測試只寫 `.expect(403)` 也綠。但 `/docs` 白紙黑字
要前端「用 `code` 分支處理，不要解析 `message`」—— 於是前端顯示「伺服器發生錯誤」，
使用者一直重試一個永遠不會成功的操作。

**對策是測試斷言 `error.code`，不是只斷言狀態碼。**

### 坑 3：`code` 的合法值活在三個地方，兩份漂移了兩章

| 在哪 | 狀態 |
| --- | --- |
| `all-exceptions.filter.ts` | 真相 |
| `error-response.entity.ts` 的 `enum` | Ch9 漏 `UNAUTHORIZED`、Ch11 漏 `FORBIDDEN` |
| `src/swagger.ts` 的 description | 同上 |

沒有任何工具會叫：`swagger.e2e-spec.ts` 的一致性測試只比對**欄位名**
（`code` / `message` / `details`），不看 `enum` 裡列了哪些值。

而 `error-response.entity.ts` 的註解本來寫著「這是刻意接受的第二份真相，**偵測器是 e2e**」
—— **那句話是錯的，偵測器並不存在。**

**判準更新：「刻意接受第二份真相」的前提是有偵測器。沒有的話，那不是取捨，是破口。**

### 坑 4：兩個 helper 的預設 email 撞名 → 409

外層 `beforeEach` 用 `registerAndLogin` 註冊了 `e2e-user@example.com`，
內層再用 `registerAndLoginAsAdmin` 註冊同一個 → `@unique` → 409。

而失敗訊息**當場指著 helper 那一行**，不是三十行之後變成一句莫名其妙的 403 ——
那正是 Ch10 寫進 helper 的 `.expect(201)` 在做的事。那段註解當初是預測，這次實際發生。

### 坑 5：`import { PrismaClient } from '@prisma/client/extension'`

編輯器自動補的。它**解析得到，但解析到錯的東西** —— 實測寫

```ts
p.user.update({ where: { emailTYPO: 'x' }, data: { roleTYPO: 'ADMIN' } });
p.這個方法不存在();
```

**`tsc` 一句話都沒說。**

比「解析不到」更陰險：解析不到會有 ESLint 紅線（`error typed value`，很吵），
解析到錯的東西**完全安靜**，你以為有型別保護，其實沒有。

**判準：需要某個型別時，先看同一個資料夾裡已經有人怎麼 import 它**
（`reset-db.ts` 就在旁邊），不要讓編輯器替你選。

### 坑 6：ESLint 的紅線，重開 TS server 沒有用

`@typescript-eslint/no-unsafe-assignment` 這一族**需要型別資訊**，所以長得像型別錯誤，
但它們是 ESLint 說的 —— 而 `eslint.config.mjs` 用 `projectService: true`，
typescript-eslint 自己維護一份 program，跑在 **ESLint 擴充套件自己的行程**裡。

| 訊息長這樣 | 誰報的 | 重啟哪個 |
| --- | --- | --- |
| `TS2339`、`TS2554` | TS server | `TypeScript: Restart TS Server` |
| `@typescript-eslint/...` | ESLint 行程 | `ESLint: Restart ESLint Server` |

**判準：先問指令列。** 指令列跑的是真的 `tsc` 與 `eslint`；編輯器跑的是常駐、
有快取、可能過時的服務。（反例是 Ch10 坑 6：測試檔的語法錯讓 `tsc` 整輪不做語意檢查
—— 所以真正的判準是「知道每個工具在什麼情況下會失準」，不是永遠相信某一個。）

---

## 作業

1. `@Roles(Role.ADMIN)` 貼上去了，但忘記在 `auth.module.ts` 註冊 `RolesGuard`。
   會發生什麼？哪一個訊號會讓你發現？
2. `RolesGuard` 註冊在 `JwtAuthGuard` **前面**，症狀是什麼？為什麼那個症狀不算「安靜」？
3. 一個 Ch10 簽出去、payload 裡沒有 `role` 的 token，現在拿去刪問卷會怎樣？
   換成 `user.role !== Role.ADMIN` 寫法的話呢？
4. 測試裡把「升權」和「登入」的順序換過來，會看到什麼？為什麼那個症狀會騙人？
5. `swagger.e2e-spec.ts` 有一條測「spec 說的跟實際回的一不一致」。
   為什麼它沒有抓到坑 3？

## 作業解答

1. **什麼都不會發生** —— 裝飾器只是貼紙條，沒有人讀就沒有效果。
   `DELETE /surveys/:id` 對所有登入的人開放，tsc / lint / 既有測試全綠。
   發現它的訊號是**既有的 DELETE 測試沒有變紅**：guard 真的生效的話，
   那 3 條用 USER token 的測試必定變 403。
2. `RolesGuard` 先跑時 `request.user` 還是 `undefined`（那是 `JwtAuthGuard`
   第 ④ 步放上去的），於是連管理員都被擋 → 403。**不算安靜是因為它擋錯人**：
   有一條該過的路徑過不去，測試立刻紅。危險的是相反方向 —— 該擋的沒擋。
3. `requiredRoles.includes(undefined)` → `false` → **403，被擋下**。這是對的方向。
   換成 `!==` 的話 `undefined !== 'ADMIN'` → `true` → **放行**，
   一張沒有角色的舊票就成了管理員。**同樣的邏輯，相反的失敗方向。**
4. 資料庫查出來是 `ADMIN`、`GET /auth/me` 也回 `ADMIN`，但刪問卷仍然 403。
   騙人是因為**兩個地方都說他是管理員**，只有那張票不是 ——
   `role` 是簽 token 那一刻寫進 payload 的，先登入就等於拿了一張舊職稱的票。
5. 因為那條測試比對的是**欄位名**（`code` / `message` / `details` 這幾個 key），
   不是欄位的**值域**。`enum` 少列一個值，`code` 這個 key 仍然存在、形狀完全一致。
   要抓到它得寫另一種測試：比對「filter 產得出來的 code 集合」與那份 `enum`。
