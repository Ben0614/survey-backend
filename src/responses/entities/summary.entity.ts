// ============================================================
// [教學] summary.entity.ts —— 填答摘要的回應形狀（Ch17 輪 ⑤a）
//
// 什麼時候被執行：class 定義時（裝飾器就地執行），Swagger 據此產文件。
//
// 這一份跟 response.entity.ts 的差別值得記：那邊三個 class 對應**三支端點**，
// 這邊三個 class 對應**同一支端點的三層巢狀**。
// entity 對應的是「回應長什麼樣」，不是資料表，也不是端點數量。
//
// ⚠️ **宣告順序不能反過來：最內層的要寫在最外層的上面。**
// `@ApiProperty({ type: [QuestionSummaryEntity] })` 是**裝飾器的參數**，
// 在 SurveySummaryEntity 定義的當下就要求出值 —— 而 class 宣告不會被提升
//（同 create-question.dto.ts 的 SingleChoiceNeedsOptions，Ch17 輪 ② 踩過）。
// 寫反的結果是執行期 `Cannot access 'X' before initialization`，不是編譯錯。
//
// 下一站：src/responses/responses.service.ts（誰把資料組成這個形狀）
// ============================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '../../generated/prisma/enums';

/** 單選題某一個選項拿到幾票。 */
export class OptionSummaryEntity {
  @ApiProperty({ description: '選項的文字', example: '滿意' })
  option: string;

  @ApiProperty({ description: '這個選項被選了幾次', example: 18 })
  count: number;
}

/**
 * 一題的摘要。
 *
 * `options` 與 `samples` **看型別才有其中一個** —— 這是刻意的：
 * 單選題數次數、簡答題數不出來（每個人寫的都不一樣），
 * 所以它們回的是兩種不同的東西，硬塞進同一個欄位只會讓前端猜。
 */
export class QuestionSummaryEntity {
  @ApiProperty({
    description: '題目 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  questionId: string;

  @ApiProperty({ description: '題目', example: '整體滿意度' })
  title: string;

  @ApiProperty({
    description: '題目類型',
    enum: QuestionType,
    example: QuestionType.SINGLE_CHOICE,
  })
  type: QuestionType;

  @ApiProperty({ description: '這題排第幾（從 0 開始）', example: 0 })
  order: number;

  /**
   * ⚠️ 這是**這一題實際收到幾筆答案**，不是「這份問卷有幾份填答」。
   *
   * Ch17 輪 ④ 之後兩者對新的填答一定相等（整份必答），
   * 但輪 ④ 之前存進去的資料可以只答一題 —— 那時候兩者會不一樣。
   * **算百分比時分母要用這個**，用 responseCount 會讓舊資料的百分比偏低。
   */
  @ApiProperty({ description: '這一題實際收到幾筆答案', example: 27 })
  answerCount: number;

  @ApiPropertyOptional({
    description:
      '每個選項各拿到幾票，**只有 SINGLE_CHOICE 才有**。以題目的 options 為基準，' +
      '所以沒有人選的選項也會出現（count 是 0）',
    type: [OptionSummaryEntity],
  })
  options?: OptionSummaryEntity[];

  @ApiPropertyOptional({
    description:
      '最近幾筆回答的原文，**只有 TEXT 才有**，最新的排在前面。' +
      '這是抽樣不是全部 —— 要看全部請用 GET /surveys/:surveyId/responses',
    type: [String],
  })
  samples?: string[];
}

/**
 * 一份問卷的填答摘要。
 *
 * **這一支刻意不分頁**，而那正是 Ch17 輪 ⑤ 對「分頁參數好不好用」的回答：
 * 分頁是為了「不給你全部」而設計的，統計卻需要全部 —— 兩者是相反的需求。
 * 但回傳量並不隨填答數成長：資料庫用 GROUP BY 算完才回來，
 * 大小只跟「有幾題、幾個選項」有關（見 responses.service.ts 的 summarize）。
 */
export class SurveySummaryEntity {
  @ApiProperty({
    description: '問卷 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  surveyId: string;

  @ApiProperty({ description: '這份問卷總共有幾份填答', example: 30 })
  responseCount: number;

  @ApiProperty({
    description: '每一題的摘要，依 order 由小到大',
    type: [QuestionSummaryEntity],
  })
  questions: QuestionSummaryEntity[];
}
