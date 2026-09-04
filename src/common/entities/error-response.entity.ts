// ============================================================
// [教學] error-response.entity.ts —— 所有錯誤回應的形狀
//
// 什麼時候被執行：跟其他 entity 一樣，**執行期永遠不會**
// （見 survey.entity.ts 檔頭）。真正產生這個形狀的是
// src/common/filters/all-exceptions.filter.ts 最後那句 res.status(status).json(...)。
//
// **這一份是全專案風險最高的 entity**：其他 entity 只描述一支端點的回應，
// 這一份描述的是 15 支端點的每一條錯誤路徑。filter 那邊改了形狀而這裡沒跟上，
// 說謊的範圍是整份文件。
//
// 兩個 class 而不是一個，是因為錯誤 body 外面包了一層 error ——
// { "error": { "code": ..., "message": ... } }，不是把三個欄位攤在最外層。
// 那層包裝是 Ch6 刻意加的（見該檔案），這裡只是照實描述。
//
// 下一站：src/common/entities/pagination-meta.entity.ts（分頁回應裡 meta 的形狀）
// ============================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorBodyEntity {
  // enum 用寫死的清單，不是從 filter import 常數過來 ——
  // 那些常數在 filter 裡是幾個獨立的變數（STATUS_TO_CODE 的值、
  // VALIDATION_CODE、FALLBACK_CODE），沒有一份現成的「全部合法值」清單可以借。
  // 硬要共用得先在 filter 那邊多開一個 as const 陣列，而那會為了文件去改錯誤處理，
  // 代價比收益大。這是刻意接受的第二份真相。
  //
  // **而它在 Ch11 收尾時被發現漂移了兩章**：Ch9 加了 UNAUTHORIZED、
  // Ch11 加了 FORBIDDEN，兩次都只改了 filter，這裡都沒跟上。
  // 沒有任何工具會叫 —— swagger 的一致性測試只比對**欄位名**
  // （code / message / details），不看 enum 裡列了哪些值。
  //
  // 判準：**「刻意接受第二份真相」的前提是有偵測器。** 這裡實際上沒有，
  // 所以它不是取捨，是一個已知的破口。要補得寫一條測試比對
  // 「filter 產得出來的 code 集合」與「這份 enum」—— Ch12 有機會時再處理。
  //
  // 順帶：同一份清單其實有**三個**地方（第三個是 src/swagger.ts 的
  // description 字串），而那一份也一起漏了同樣兩個值。
  @ApiProperty({
    description: '錯誤代碼，前端用它分支處理（不要解析 message）',
    enum: [
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'VALIDATION_FAILED',
      'INTERNAL_ERROR',
    ],
    example: 'NOT_FOUND',
  })
  code: string;

  @ApiProperty({
    description: '給人看的錯誤訊息，內容可能隨版本變動',
    example: '問卷不存在',
  })
  message: string;

  // details 只有 ValidationPipe 那條路徑會出現（filter 的 ...(details ? ... : {})），
  // 所以是選填 —— 404 / 409 的回應裡根本沒有這個 key。
  @ApiPropertyOptional({
    description: '驗證失敗時每條規則的訊息，只有 400 VALIDATION_FAILED 會有',
    type: [String],
    example: ['title should not be empty'],
  })
  details?: string[];
}

export class ErrorResponseEntity {
  @ApiProperty({ description: '錯誤內容', type: ErrorBodyEntity })
  error: ErrorBodyEntity;
}
