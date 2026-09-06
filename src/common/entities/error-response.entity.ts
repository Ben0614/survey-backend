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

/**
 * 一筆「哪個欄位違反哪條規則」。對應 common/field-errors.ts 的 FieldError。
 *
 * 這是給**機器**看的，跟 message 的分工很清楚：
 *   message  給人看，可能隨版本變動，前端不要解析它
 *   field    給程式看，前端拿它標紅對應的輸入框
 *   rule     給程式看，前端拿它查自己的文案表
 */
export class FieldErrorEntity {
  @ApiProperty({
    description: '出錯的欄位路徑；巢狀時是完整路徑',
    example: 'answers.0.questionId',
  })
  field: string;

  @ApiProperty({
    description:
      '違反的規則名。驗證失敗時是 class-validator 的裝飾器名，唯一衝突時是 unique',
    example: 'minLength',
  })
  rule: string;
}

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
  // （code / message / fields），不看 enum 裡列了哪些值。
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

  // fields 只有「驗證失敗」與「唯一衝突」兩條路徑會出現
  //（filter 的 ...(fields ? ... : {})），所以是選填 —— 404 的回應裡根本沒有這個 key。
  // [教學] type: [FieldErrorEntity] 不能省 —— 陣列的元素型別**反射記不到**
  // （design:type 只會記成 Array）。這是 Ch13 那條判準的另一面：
  // 聯集要自己寫 type，陣列也要。
  //
  // 兩種錯誤都會有它，而且形狀一樣：
  //   VALIDATION_FAILED  [{ field: 'password', rule: 'minLength' }]
  //   CONFLICT           [{ field: 'email',    rule: 'unique' }]
  //
  // 這是刻意的：前端一套邏輯處理兩者。Ch15 輪 ③ 之前這個欄位叫 details，
  // 裝的是英文句子陣列，而且只有驗證失敗會有 —— 409 連哪個欄位衝突都沒說。
  @ApiPropertyOptional({
    description:
      '出錯的欄位清單。驗證失敗（400）與唯一衝突（409）會有，其餘錯誤沒有',
    type: [FieldErrorEntity],
  })
  fields?: FieldErrorEntity[];
}

export class ErrorResponseEntity {
  @ApiProperty({ description: '錯誤內容', type: ErrorBodyEntity })
  error: ErrorBodyEntity;
}
