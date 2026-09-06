// ============================================================
// [教學] responses.rules.ts —— 作答自己的規則，同樣寫成純函式
//
// 什麼時候被執行：ResponsesService 的 create 在寫入之前呼叫它們。
//   isCompleteAnswerSet  這份問卷的題目都答了嗎？
//   isValidAnswer        這個答案對這一題合不合法？
//
// **為什麼不放進 survey.rules.ts**（Ch17 輪 ④ 的決定）：
// 那個檔案的檔頭寫的是「問卷的商業規則與授權」，而這兩條講的是**作答**。
// 判準不是「規則都放同一個檔案」，是**這條規則屬於哪個概念** ——
// 混進去之後，「作答的規則有哪些」就要在一份談問卷的檔案裡找。
//
// 兩條都符合那條老判準（見 CLAUDE.md 的測試策略）：
// **拿掉外部依賴之後還剩下判斷邏輯**。它們不注入零件、不碰資料庫、不丟 HTTP 例外，
// 所以 responses.rules.spec.ts 不必啟動 Nest 就測得到 ——
// 這是全專案第三個這樣的檔案（另外兩個是 survey.rules 與 common/cors-origins）。
//
// 下一站：src/responses/responses.rules.spec.ts（不啟動任何東西就測得到的第三個地方）
// ============================================================

import { QuestionType } from '../generated/prisma/enums';

/**
 * 這份問卷的題目是不是都答了。
 *
 * **它只比對兩個數字，成立的前提在呼叫端**：service 已經先擋掉重複的 questionId、
 * 也確認過每個答案都對得上這份問卷的某一題。有那兩個前提，
 * 「題數 === 答案數」才等於「一題一個答案」。
 *
 * 為什麼要有這條（Ch17 輪 ④ 補的）：在此之前驗證只有 `@ArrayNotEmpty()`，
 * 一份 10 題的問卷送一題的答案就成立。後果會延到結果頁才爆 ——
 * 算「滿意 60%」時分母到底是填答人數還是這題的作答數，兩者不一樣。
 * **「整份必答」讓那個分母有唯一解。**
 */
export function isCompleteAnswerSet(
  questionCount: number,
  answerCount: number,
): boolean {
  return questionCount === answerCount;
}

/**
 * 這個答案對這一題合不合法。
 *
 * 目前只有一條：**單選題的答案必須是選項之一**。簡答題不管內容
 *（長度上限由 AnswerDto 的 @MaxLength(500) 管，那是 body 就看得出來的事）。
 *
 * ⚠️ **一定要先分岔 type。** 寫成「content 必須在 options 裡」而漏掉那一步的話，
 * 簡答題的 options 是空陣列，`[].includes(任何東西)` 永遠是 false ——
 * **所有簡答題的作答都會被擋下來**。
 *
 * 另一個刻意的決定：選項是空陣列的單選題，**任何答案都不合法**。
 * 不加 `options.length > 0 ||` 這種放行條件 —— 一個沒有選項的單選題本來就無法作答，
 * 放行等於讓髒資料繼續長。（Ch17 輪 ② 的 SingleChoiceNeedsOptions 已經擋住新的，
 * 但更早以前建的資料還在。）
 *
 * 前端會用 v-radio-group 讓使用者只能選，所以正常不會走到這裡 ——
 * 它是繞過前端時的第二道。差別在**這一條的後果會留在資料庫裡**：
 * 一個不在選項裡的值進去之後，結果頁會多出一個沒人認得的分類，而且沒有任何錯誤。
 */
export function isValidAnswer(
  type: QuestionType,
  options: string[],
  content: string,
): boolean {
  if (type !== QuestionType.SINGLE_CHOICE) {
    return true;
  }

  return options.includes(content);
}
