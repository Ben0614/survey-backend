// ============================================================
// [教學] survey.entity.ts —— 「這支 API 會回什麼」的形狀
//
// 什麼時候被執行：**執行期永遠不會**。沒有任何程式碼會 new 它，
// service 回的是 Prisma 產出來的普通物件，不是這個 class 的實例。
// 它存在的唯一理由，是給 @ApiOkResponse({ type: SurveyEntity }) 當參數，
// 讓 Swagger 有個地方讀 @ApiProperty。
//
// 為什麼不能直接用 Prisma 的 Survey 型別：那是一個 TypeScript **型別**，
// 編譯成 JS 之後完全不存在，執行期沒有東西可以拿來讀 metadata。
// Swagger 只認得 class（同 DTO：驗證規則住在 class 的屬性上）。
//
// **代價寫在這裡，別假裝沒有**：這是第二份真相。
// schema.prisma 加一個欄位、prisma generate、tsc 全綠、這個檔案不會紅 ——
// 而 /docs 從那一刻起就開始說謊。偵測器是輪 ④ 那條 e2e，不是紀律。
//
// 下一站：src/surveys/surveys.service.ts（通過檢查之後誰來處理）
// ============================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SurveyStatus } from '../../generated/prisma/enums';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { QuestionEntity } from '../../questions/entities/question.entity';

export class SurveyEntity {
  @ApiProperty({
    description: '問卷 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  id: string;

  @ApiProperty({ description: '問卷標題', example: '員工滿意度調查' })
  title: string;

  // enum 不加方括號 —— 它收的是「合法值的清單」，而 SurveyStatus 這個物件
  // Swagger 自己會攤平成 ['DRAFT', 'PUBLISHED']（輪 ② 踩過的坑）。
  @ApiProperty({
    description: '問卷狀態',
    enum: SurveyStatus,
    example: SurveyStatus.DRAFT,
  })
  status: SurveyStatus;

  // [教學] 這裡有一個 DTO 那邊不會遇到的問題：**JSON 沒有日期這種型別**。
  //
  // TypeScript 說它是 Date，但序列化成 JSON 之後前端收到的是字串
  // "2026-08-25T10:30:00.000Z"。所以文件上必須說它是 string，
  // 再用 format: 'date-time' 補上「這個字串是 ISO 8601 的日期時間」。
  //
  // 寫成 Date 會讓 Ch13 產出 `createdAt: Date`，前端拿到字串卻以為是 Date，
  // 直接 .getTime() 就炸 —— 又是一個「文件說謊」的形狀。
  @ApiProperty({ description: '建立時間', type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;

  // questions 是**選填**，因為它取決於呼叫端問不問：
  // GET /surveys/:id 預設不帶題目，?includeQuestions=true 才會多這個欄位（Ch4 ③）。
  //
  // 另外兩條路沒有走：為兩種形狀各寫一個 class 再用 oneOf（兩者只差一個欄位，
  // 前端拿到 union 卻沒有東西可以 narrow，反而更難用），或拆成兩支端點（Ch4 ③
  // 已經決定過不拆）。選填是唯一「說實話」的表達方式 —— 那個欄位真的可能有、可能沒有。
  //
  // 代價：Ch13 產出的型別是 questions?: QuestionEntity[]，前端要自己判斷。
  // 這跟 Ch4 ③ 當時的選擇是同一個方向（執行期正確、編譯期不精確）。
  @ApiPropertyOptional({
    description: '題目清單，只有 ?includeQuestions=true 時才會出現',
    type: [QuestionEntity],
  })
  questions?: QuestionEntity[];

  @ApiProperty({
    description: '建立者的 User id，尚未有值時為 null',
    nullable: true,
    type: String,
  })
  ownerId: string | null;
}

/**
 * 列表用的問卷：比 SurveyEntity 多兩個統計數字（Ch17 輪 ①）。
 *
 * **為什麼是獨立的 class，而不是在 SurveyEntity 加兩個選填欄位：**
 *
 *   選填  契約說的是「可能有、可能沒有」→ 前端每一行都要 `?? 0`
 *   分開  契約說的是「列表**一定有**、詳情**一定沒有**」→ 直接用
 *
 * 這是 Ch13 那句「**型別品質 = entity 標記品質**」的正面示範：
 * 標成選填等於把「我沒想清楚」寫進契約，而代價由前端每一次存取付。
 * `openapi-typescript` 會產出兩個型別，前端拿詳情的資料去讀 questionCount
 * 會編譯不過 —— 那比任何測試都早。
 *
 * **為什麼詳情不需要這兩個數字：** 它已經有 `?includeQuestions=true`
 * 可以把題目整包拿走，數量是 `questions.length`；而填答數在
 * `GET /surveys/:id/responses` 的 `meta.total` 裡。列表不同 ——
 * 列表**不可能**為了兩個數字對每一筆再打兩次 API（那是 N+1：
 * 十筆問卷 = 二十一次往返），而 Prisma 的 `_count` 實測**多出零句 SQL**。
 *
 * `extends` 讓共同的七個欄位只寫一次；NestJS Swagger 會沿著原型鏈
 * 把父類的 @ApiProperty 一起收進 spec，所以這裡只寫「新增的」。
 */
export class SurveyListItemEntity extends SurveyEntity {
  @ApiProperty({
    description: '這份問卷有幾題',
    example: 5,
  })
  questionCount: number;

  @ApiProperty({
    description: '這份問卷被填寫多少次',
    example: 10,
  })
  responseCount: number;
}

export class PaginatedSurveysEntity {
  @ApiProperty({
    description: '回傳資料',
    type: [SurveyListItemEntity],
  })
  data: SurveyListItemEntity[];

  @ApiProperty({
    description: '統計資訊',
    type: PaginationMetaEntity,
  })
  meta: PaginationMetaEntity;
}
