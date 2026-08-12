# Ch3 第一段補債設計（2026-08-12）

## 背景

Ch3 第一段的**實作**已完成並 push（`4d03691` GET/POST、`d43ee9e` PATCH、`5544241` DELETE、
`ad4c408` include），`pnpm test:e2e` 30 passed。但整段是連續四次「寫端點 → review → 跑測試 → commit」
推進的，教學註解與文件一次都沒補 —— `LEARNING.md` 的「欠的債」那一節就是為了記住這件事而存在。

債務累積到現在有三個性質：

1. **`src/questions/` 六個檔一個 `[教學]` 檔頭都沒有**，而它們是專案裡概念密度最高的一批
   （巢狀路由、兩個 controller 共用一個 service、feature module 互相依賴、`@IsEnum`、`PartialType` 第二次）
2. **閱讀動線斷了。** `surveys.service.ts` 的「下一站」直接跳過 questions 指向 `test/setup-env.ts`
3. **三處註解已經過期**（探索時才發現，不在原本的債務清單裡）

第 3 點是這次最值得記錄的發現，因為它正是 `ch02` 寫過的坑「改程式碼會讓註解過期」的**第三次**發生。

## 決策

### 1. 三處過期註解一併修掉

| 位置 | 現在寫的 | 實際狀況 |
| --- | --- | --- |
| `src/surveys/surveys.module.ts` 檔頭 | 「沒有 exports —— 等 Ch3 的 QuestionsModule 需要它時再加」 | `exports: [SurveysService]` 已經加了 |
| `src/surveys/surveys.service.ts` 的 `findOne` | 「查一份問卷」，沒提到會一併帶出題目 | 已加 `include`，回傳型別變成 `Survey & { questions: Question[] }` |
| `test/surveys.e2e-spec.ts` 檔頭 | 「動線終點」 | questions 的 e2e 接上去之後不再是終點 |

連帶 `CLAUDE.md` 第 17 行寫死的「終點是 `test/surveys.e2e-spec.ts`」也要改。

**理由：** 過期註解比沒有註解更糟 —— 讀的人會相信它。`surveys.module.ts` 那條特別誤導，
它讓人以為 module 邊界還是關著的，而「什麼時候該開放 export」正是 Ch3 的教學重點之一。

### 2. 閱讀動線：src 全部走完再走 test，questions 的 e2e 成為新終點

```text
… → src/surveys/surveys.service.ts        （改「下一站」）
  ↓
src/questions/questions.module.ts             feature module 依賴另一個 feature module
  ↓
src/questions/survey-questions.controller.ts  巢狀路由：前綴帶路徑參數
  ↓
src/questions/questions.controller.ts         扁平路由：為什麼拆成兩個 controller
  ↓
src/questions/dto/create-question.dto.ts      @IsEnum / @IsArray + { each: true }
  ↓
src/questions/dto/update-question.dto.ts      PartialType 第二次（指回 update-survey.dto.ts）
  ↓
src/questions/questions.service.ts            借父資源的 findOne 丟 404；order 用 count 算
  ↓
test/setup-env.ts → … → test/surveys.e2e-spec.ts （改：不再是終點）
  ↓
test/questions.e2e-spec.ts                    **新終點**
```

**取捨：** 也可以把 questions 的 e2e 留在動線外、維持 `surveys.e2e-spec.ts` 當終點。
否決的理由是它有這一段最貴的一課（假綠的第五種樣態），把它排除等於把那一課藏起來。

**一個概念只講一次**照舊：`PartialType` 在 `update-survey.dto.ts` 已經講完，
`update-question.dto.ts` 只寫「見 `update-survey.dto.ts` 檔頭」加上「這裡是全開版，
為什麼不用 `OmitType` 擋掉 `type`」這個新決策。

### 3. `ch03` 只寫第一段，第二段做完再往同一份檔案追加

第一段的範圍是 ① 巢狀 CRUD 與 ② `include`/`select`；③ 看 SQL / N+1 與 ④ 商業規則與單元測試
還沒做。文件先寫已經發生的部分，`LEARNING.md` 累積的 10 條坑全部搬進去、原處只留指標。

**理由：** 這是 `LEARNING.md` 已定的做法（「第一段結束後搬進 `ch03`」）。等整章做完再寫，
第一段的細節會流失 —— 而這一段的坑有一半是「當下才看得到」的診斷過程。

### 4. `api.http` 補齊九支端點（超出原債務清單）

這份檔案至今只有 `GET /health`。`CLAUDE.md` 說「手動打 API 用 `api.http`」，但實際上
Ch2 的五支與 Ch3 的四支都不在裡面，等於那句話是空的。

用 REST Client 的變數把建立出來的 id 串起來，讓九支可以照順序點完一輪。

### 5. `ch03` 的「作業」解答一律實跑，不推導

`ch02` 的作業第 3 題是唯一用推導的（因為 `migrate dev` 會在版控裡留下實驗用的 migration），
其餘都標明「實際跑出來的」。這一章的題目**全部避開 schema 改動**，所以沒有例外 ——
每一題都真的跑一次、貼真實輸出。

題目一律是同一個形狀：**把某個東西弄壞，看測試會不會叫。** 這是 `ch02`
「綠燈不等於有被保護」那節的判準，作業是它的操作版本。

## 明確不做

- **不改任何程式邏輯。** 這次是純註解與文件，`git diff` 應該看不到邏輯行異動
  （唯一例外是 `api.http`，它不是程式）
- **不碰 Ch3 第二段的內容**（query log、N+1、`DRAFT` 才能改題目的商業規則與單元測試）
- **不回頭補測試。** 專案原則是測試要在寫功能的當下寫
- **不重寫既有的無標記註解**（`CLAUDE.md` 的規則），只修真的已經錯掉的那三處

## 後續影響

`CLAUDE.md` 的動線終點、`docs/專案速查.md` 的檔案地圖與動線圖、`LEARNING.md` 的進度表與
「Ch3 接續點」都要同步。這三份加上 `ch03` 構成「換機後接得下去」的完整資訊 ——
`docs/專案速查.md` 自己寫過：**一章的決策與踩坑如果只存在於對話裡，換一台機器就等於沒發生過。**

## 驗收

- `pnpm test:e2e` 30 passed、`pnpm exec tsc --noEmit` 0 errors、`pnpm lint` 0 problems
  （註解不該動到行為，數字必須跟補債前一模一樣）
- 從 `src/main.ts` 照「下一站」走一遍，能不斷鏈地走到 `test/questions.e2e-spec.ts`
- 全域搜尋 `[教學]`，`src/questions/` 六個檔與 `test/questions.e2e-spec.ts` 都有檔頭
- `ch03` 的每一題作業都附實際輸出，沒有「推導」字樣
