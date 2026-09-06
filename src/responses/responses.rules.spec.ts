// ============================================================
// [教學] responses.rules.spec.ts —— 第三個「不必啟動任何東西」的測試
//
// 跑法：pnpm test -- responses.rules.spec.ts
//
// 沒有 beforeAll、沒有 Test.createTestingModule、沒有 app.init()、也沒有資料庫。
// 理由與 survey.rules.spec.ts 完全一樣，那邊的檔頭寫過，這裡不重複。
//
// 這一組值得單獨看的是 **isValidAnswer 的四種情況**：
// 兩種型別 × 合法／不合法。其中「簡答題送任何內容都合法」看起來像廢話，
// 它守的是**規則沒有誤擋** —— 忘了先分岔 type 的話，簡答題的 options 是空陣列，
// `[].includes(...)` 永遠 false，所有簡答作答都會被擋下來。
//
// 下一站：src/auth/auth.module.ts（第四個 feature：註冊登入）
// ============================================================

import { QuestionType } from '../generated/prisma/enums';
import { isCompleteAnswerSet, isValidAnswer } from './responses.rules';

describe('isCompleteAnswerSet', () => {
  it('3 題的問卷收到 3 個答案 → true', () => {
    expect(isCompleteAnswerSet(3, 3)).toBe(true);
  });

  it('3 題的問卷只收到 2 個答案 → false', () => {
    expect(isCompleteAnswerSet(3, 2)).toBe(false);
  });

  // 送得比題目還多也是 false。實際上 service 那邊會先被「有題目不屬於這份問卷」
  // 擋掉（多出來的那個 id 找不到對應題目），但規則本身不該預設呼叫端有做那件事。
  it('3 題的問卷收到 4 個答案 → false', () => {
    expect(isCompleteAnswerSet(3, 4)).toBe(false);
  });
});

describe('isValidAnswer', () => {
  it('單選題，content 是選項之一 → true', () => {
    expect(
      isValidAnswer(QuestionType.SINGLE_CHOICE, ['滿意', '普通'], '滿意'),
    ).toBe(true);
  });

  it('單選題，content 不在選項裡 → false', () => {
    expect(
      isValidAnswer(QuestionType.SINGLE_CHOICE, ['滿意', '普通'], '隨便打的'),
    ).toBe(false);
  });

  // ← 主角：它是唯一會抓到「忘了先分岔 type」的測試。
  it('簡答題，任何 content 都 → true（options 是空陣列也一樣）', () => {
    expect(isValidAnswer(QuestionType.TEXT, [], '我想說的話')).toBe(true);
  });

  // 沒有選項的單選題**無法作答**，這是刻意的（見 responses.rules.ts 的說明）。
  it('單選題但選項是空的 → false，任何答案都不合法', () => {
    expect(isValidAnswer(QuestionType.SINGLE_CHOICE, [], '任何東西')).toBe(
      false,
    );
  });
});
