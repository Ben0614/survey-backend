# Ch10 — JWT 與全域 AuthGuard

Ch9 做完「驗證身分」，但登入完伺服器就忘了。這一章讓它記得。三輪：
簽出 token、全域 guard、把身分拿來用。

做完之後線上服務**不再對全世界開放讀寫刪**，`Survey.ownerId` 也終於有值。

---

## 核心概念

### JWT：看得到內容 ≠ 內容可信

一張 token 是三段 base64：`header.payload.signature`。

**payload 是編碼，不是加密** —— 任何拿到 token 的人都看得見裡面每一個字，
所以「不要放 `passwordHash`」是廢話，真正該問的是「這個欄位被看見有沒有代價」。

保護在第三段：簽章用 `JWT_SECRET` 算出來，**沒有 secret 就偽造不出來**。
驗證一張票的全部動作就是「拿 secret 重算一次簽章，對得上就相信裡面的 `sub`」。
推論：**知道 secret 的人能偽造任何人的身分**，所以三個環境的 secret 必須不同 ——
「三條資料庫是分開的」擋不住，偽造者可以填任何 `sub`。

### `decode` 與 `verify` 差在哪

| | 驗簽章 | 檢查 `exp` | 需要 secret |
| --- | :---: | :---: | :---: |
| `decode()` | ❌ | ❌ | ❌ |
| `verifyAsync()` | ✅ | ✅ | ✅ |

`decode` 就是「把中間那段 base64 解開」。它在**測試裡**是對的工具（要讀自己剛簽的
token 的內容），在 **guard 裡**是災難（它不可能知道這張票是不是你簽的）。
差別不在準不準，在**驗不驗證來源**。

### Guard 是第三種中介層

```
請求 → Guard → Pipe → Controller → Service
       能不能進來   參數對不對          ↓ 丟例外時 → Filter → 回應
```

Pipe（Ch2）與 Filter（Ch6）已經認識了，Guard 比 Pipe **更早**。
所以沒帶 token 的請求連 DTO 驗證都到不了 —— 身分不明的人不該從 400 的訊息裡
知道你的參數規則。機制細節在 `jwt-auth.guard.ts` 檔頭。

### 兩種自己寫的裝飾器

| | 做什麼 | 機制 | 同類 |
| --- | --- | --- | --- |
| `@Public()` | 貼資料 | `SetMetadata` 貼 / `Reflector` 撕 | `@ApiTags` |
| `@CurrentUser()` | **取值** | `createParamDecorator` | `@Body()` / `@Param()` |

metadata 的 key 一定要是**共用常數** —— 兩邊各打一次字串，拼錯就是 `@Public()`
完全失效，而 tsc 綠、lint 綠、沒有任何訊息。同 `findAll` 把 `where` 抽成變數那一招。

---

## 決策取捨

### 預設拒絕，例外明說

`APP_GUARD` 讓 guard 全域生效，`@Public()` 是「例外」那一半。同一條原則的第四次
（全域 `omit`、`@unique`、`prebuild`）。代價：**之後新增的端點預設需要登入**，
忘了標的會安靜把自己鎖上。而 `/health`、`register`、`login` 漏掉任何一個，
服務就自己鎖死 —— **連修復用的請求都發不出去**。

### guard 註冊在 `AuthModule` 而不是 `AppModule`

`APP_GUARD` 在哪註冊都全域生效，所以位置純粹看**它需要的零件在哪拿得到**：
guard 要注入 `JwtService`，而 `JwtModule` 是在 `AuthModule` 被 import 的。
另一條路是把 `JwtModule` 設成 `@Global()` —— 那正好違反這一章在教的東西。

### payload 只放 `sub`

放進去的東西必須「不機密」而且「有效期內不會變」，因為 payload 是**簽發當下的快照**，
不會跟著資料庫更新。email 兩條都踩線（是個資，而且使用者可以改）；`id` 兩條都安全，
而且輪 3 拿它直接填 `ownerId`，中間不必再查一次資料庫。

判準：**只有「每個請求都需要、不查就拿不到」的東西才值得放進 payload。**
Ch11 的 `role` 會是下一個候選。

### guard 不查資料庫

只驗簽章與 `exp`，兩者都在 token 字串裡。省下每個請求一句 SQL，代價是
**帳號被刪掉之後，那個人的 token 在過期前仍然通行**。

這不是假想的 —— `errors.e2e` 的第二個 describe 就是靠這個性質才能在
「Prisma 被換成替身」的情況下拿到一張能用的票。

### `login` 只回 `{ accessToken }`

「登入」與「我是誰」是兩件事：前端 reload 之後手上只剩 token，本來就得靠
`GET /auth/me` 還原身分。而 `/auth/me` **真的查資料庫**，回的是最新資料，
不是簽 token 當下的快照。

### `ownerId` 不進 DTO

判準：**這個值是「使用者說的」還是「伺服器知道的」？** 前者才該進 DTO。
寫進 `CreateSurveyDto` 的話 `whitelist` 就不擋它（規則是「DTO **沒宣告**的欄位丟掉」），
任何人都能建立一份掛在別人名下的問卷。同 Ch2 把 `status` 留在 DTO 外面的決定，
但後果嚴重得多。

### `/auth/me` 查不到回 401 不是 404

判準是**這個「找不到」找的是資源還是身分**：`/surveys/:id` 的識別資訊在網址裡 → 404；
`/auth/me` 的識別資訊在**憑證**裡 → 憑證失效 → 401。

實務上的差別在前端：401 是唯一有「通用處置」的狀態碼（清 token、回登入頁）。
回 404 的話前端要嘛為這支寫特例，要嘛卡在「有票卻拿不到自己是誰」轉圈圈。

### 1 小時、不做 refresh token

`exp` 是**簽發當下就算好、寫死在 token 裡**的，每次請求都不會往後延 ——
所以 1h 的意思是「登入後一小時，不管有沒有在用都要重新登入」。
refresh token 要存資料庫、要處理撤銷，是另一個完整主題。

### `/docs` 維持公開 —— 這次是決定，不是預設

Ch8 的理由是「API 本來就對全世界開放，關掉文件只是把門牌拿掉」。**那個前提今天消失了**，
重新評估後結論仍是公開，但理由換了：Ch13 要靠 `/docs-json` 產型別；API 已全部要登入，
文件洩漏的價值掉了一個數量級。代價是等於公告「用 JWT bearer、12 條路徑（18 支端點）、註冊只要
email + 8 碼」。

技術上還有一件事：**想鎖也不能用 `@Public()` 的反面**。實測確認 `/docs` 不經過
Nest 的管線（`SwaggerModule.setup` 直接跟 Express 註冊路由），guard 攔不到、
也標不了裝飾器。真要鎖得在更外層，那屬於 Ch16。

---

## 踩到的坑

### 坑 1：`signAsync` 漏了 `await`，回應是 `{"accessToken":{}}`

`token` 是一個 Promise，序列化成 JSON 就是 `{}`。**tsc 綠、lint 綠** ——
`no-floating-promises` 抓不到，因為它有被指派也有被 return，不算浮空。

更值得記的是**比對欄位集合的那條測試也抓不到**：`Object.keys(body)` 仍然只有
`accessToken`。只有把 token 解開比對 `sub` 才會紅。
**「形狀對」和「值對」是兩條測試，一條蓋不了另一條。**

### 坑 2：`accessToken` 加在 `UserEntity` 上，兩支端點的文件同時說謊

`UserEntity` 被 `register`（201）與 `login`（200）共用。加一個欄位上去的後果是
**兩邊往相反方向錯**：register 承諾一個它不回的 `accessToken`，login 承諾四個它不回的欄位。

而 entity 執行期不被執行，所以 tsc / lint / e2e / `/docs` 全部正常。
**判準：一份 entity 對應一種回應。想共用之前先確認兩邊真的一樣。**

### 坑 3：`errors.e2e` 的 Prisma 替身沒有 `user.create`

第二個 describe 把 `PrismaService` 換成只有 `survey.findUnique` 的替身，
於是 `registerAndLogin` 打 `POST /auth/register` 直接 500 —— **前提資料在還沒輪到
被測程式碼之前就死了**。

改成 `app.get(JwtService).sign({ sub: 'mocked-user-id' })` 直接造票，
而它行得通的理由正好是那個取捨：**guard 不查資料庫**。

（附帶收穫：helper 裡的 `.expect(201)` 讓失敗當場現形。少了它，那個函式會安靜
回傳 `undefined`，症狀變成三十行外的一句 401。）

### 坑 4：`create` 收了 `ownerId` 卻沒放進 `data`

參數收了、controller 也傳了，就是沒寫進 `data`。資料庫不擋（schema 是 `String?`，
Ch9 那一章的整堂課）、tsc 綠、105 條測試綠、連 swagger 的一致性測試也綠
（`SurveyEntity` 早就宣告了這個欄位）。

**抓到它的是 `lint`** 的 `no-unused-vars` ——「**lint 不只是排版**」的第二次現場
（第一次是 Ch2 的 `no-floating-promises`）。但測試還是要寫，而且要**比對到 `sub`**：
lint 抓「沒被用到」，抓不到「用錯了值」。否則帳單會在 Ch12 才到。

### 坑 5：`from 'src/auth/...'` —— tsc 綠，jest 整支跑不起來

編輯器自動補的絕對路徑。`baseUrl` 只管編譯期，執行期的 Node 不吃：
`tsc --noEmit` 0 errors，`pnpm test:e2e` 是 `Cannot find module`。

`CLAUDE.md` 早就寫了這條規則，這是它第一次真的發生。

### 坑 6：語法錯誤讓 `tsc` 不報型別錯誤

測試檔裡的 `...` 佔位符是**語法**錯誤，而 tsc 遇到語法錯誤就不做語意檢查 ——
**整輪的型別錯誤全被吞掉，包括其他檔案的**。當時 `auth.controller.ts` 少傳一個參數
（TS2554）完全沒被印出來。

**卡住時的可用招式：`pnpm exec tsc --noEmit -p tsconfig.build.json`**，只看 `src`。

### 坑 7：測試名稱與斷言對不上（第三、四次）

兩次都是**從隔壁複製一段結構正確的程式碼，然後只改了一半**：

- 「密碼錯誤 → 401」整段複製了「email 沒註冊過」那條，斷言的卻是 `noSuchUser`
  的 code —— 名稱說密碼錯誤，驗的是帳號不存在
- 「只給 token、沒有 Bearer 前綴」送的是 `'not-a-jwt-token'`（根本不是 token），
  所以把 `type === 'Bearer'` 檢查整個拿掉也照樣綠

前兩次是 Ch2 的動詞、輪 1 的變數名。**這個形狀已經出現四次了。**

---

## 作業

1. `decode` 和 `verify` 都拿得出 payload。為什麼 guard 裡用 `decode` 是災難，
   測試裡用它卻是對的？
2. 全域 guard 上線後，`@Public()` 漏標在 `POST /auth/login` 上會發生什麼？
   為什麼這個錯特別難救？
3. `test/helpers/auth.ts` 的 token 如果在 `beforeAll` 取一次，輪 2 的 110 條測試
   會不會紅？那什麼時候才會出事？
4. `CreateSurveyDto` 加上 `ownerId` 欄位之後，`whitelist: true` 還擋得住
   `{ "title": "x", "ownerId": "別人的id" }` 嗎？
5. `/auth/me` 查不到使用者時回 404，前端會怎麼壞掉？

## 作業解答

1. 差別不在準不準，在**驗不驗證來源**。guard 收到的 token 是外面送進來的、不可信，
   而 `decode` 不需要 secret，所以它不可能判斷這張票是不是你簽的（過期也不看）。
   測試裡那張 token 是自己幾行前才拿到的，來源已知，要的只是讀出內容。
2. **沒有人拿得到 token，於是所有端點都進不去** —— 包括你想用來修的那些。
   服務把自己鎖死，只能改程式碼重新部署。這是「預設拒絕」的代價，
   所以例外必須在同一輪就標齊。
3. **不會紅。** token 自我驗證、guard 不查資料庫，所以配上一個已被 `TRUNCATE`
   掉的使用者照樣通行。要到輪 3 拿 `sub` 去填 `Survey.ownerId` 時才會炸 ——
   那是外鍵，指向不存在的 `User.id` 會被資料庫擋下（P2003）。
   **輪 2 看不見的錯，帳單在輪 3。**
4. **擋不住。** whitelist 的規則是「DTO **沒宣告**的欄位丟掉」——
   宣告了它就不再是「沒宣告」。第二道防線（service 的 `data` 明寫欄位）還在，
   但那時是靠紀律，不是靠結構。
5. 前端會卡在「有 token、但拿不到自己是誰」的狀態：401 有通用處置（清 token、
   回登入頁），404 沒有 —— 它的意思是「你要的東西不存在」，前端不會知道該登出。
   除非為這支端點寫特例，否則畫面永遠轉圈圈。
