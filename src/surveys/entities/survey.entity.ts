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

  @ApiPropertyOptional({ type: [QuestionEntity] })
  questions?: QuestionEntity[];
}

export class PaginatedSurveysEntity {
  @ApiProperty({
    description: '回傳資料',
    type: [SurveyEntity],
  })
  data: SurveyEntity[];

  @ApiProperty({
    description: '統計資訊',
    type: PaginationMetaEntity,
  })
  meta: PaginationMetaEntity;
}
