// ============================================================
// [教學] pagination-meta.entity.ts —— 分頁回應裡 meta 那一半的形狀
//
// 什麼時候被執行：跟其他 entity 一樣，**執行期永遠不會**。
// 它只是給 PaginatedSurveysEntity / PaginatedResponsesEntity 的
// @ApiProperty({ type: PaginationMetaEntity }) 當參數（見 survey.entity.ts 檔頭）。
//
// 為什麼放在 common/：GET /surveys 與 GET /surveys/:surveyId/responses
// 回的 meta 是同一個形狀，兩邊各抄一份的話，之後多一個欄位就會只改到其中一邊。
//
// 為什麼是 entities/ 而不是 dto/：這個專案的界線是
//   dto/      外面**送進來**什麼（class-validator 檢查它）
//   entities/ 我們**回出去**什麼（只給 Swagger 讀，沒有任何檢查）
// meta 屬於後者。
//
// 下一站：src/surveys/surveys.module.ts（一個真正有業務邏輯的 feature module）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaEntity {
  @ApiProperty({ description: '目前第幾頁（從 1 開始）', example: 1 })
  page: number;

  @ApiProperty({ description: '每頁筆數', example: 10 })
  pageSize: number;

  @ApiProperty({
    description: '符合條件的總筆數（不是這一頁的筆數）',
    example: 42,
  })
  total: number;

  // totalPages 是 Math.ceil(total / pageSize) 算出來的，不是資料庫給的。
  // 這裡只描述形狀 —— 「它跟 total 會不會不一致」是 service 的問題，
  // 而那個坑 Ch4 已經踩過了（data 篩過、total 卻是全表筆數）。
  @ApiProperty({ description: '總頁數', example: 5 })
  totalPages: number;
}
