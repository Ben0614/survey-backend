// ============================================================
// [教學] update-survey.dto.ts —— PATCH 專用的那一份規則
//
// 什麼時候被執行：每次有人打 PATCH /surveys/:id 時，ValidationPipe 拿
// 這個 class 上的規則檢查 request body，不合格直接回 400。
// DTO 是什麼、它跟 Prisma 的 Model 差在哪，見 create-survey.dto.ts 的檔頭。
//
// 這個檔案唯一的新東西是 PartialType —— 也就是「為什麼部分更新需要另一份 DTO，
// 不能直接沿用 CreateSurveyDto」。
//
// 下一站：src/surveys/surveys.service.ts（通過檢查之後誰來處理）
// ============================================================

import { PartialType } from '@nestjs/mapped-types';
import { CreateSurveyDto } from './create-survey.dto';

// [教學] PartialType(CreateSurveyDto) 是一個**函式呼叫**，不是什麼特殊的型別語法。
// 它當場算出一個新的 class，UpdateSurveyDto 再去繼承那個結果 ——
// extends 後面可以放任何「算得出 class 的運算式」，不是只能放一個名字。
//
// 它複製 CreateSurveyDto 的時候做兩件事：
//   型別層 —— title: string 變成 title?: string
//   驗證層 —— 幫每個屬性補上一個 @IsOptional()
//
// 關鍵在 @IsOptional() **不是「多一條規則」，是短路開關**：
// 值是 undefined 就把該屬性其餘的規則整組跳過。於是：
//
//   {}            → title 是 undefined → 短路 → 通過，什麼都不改
//   { title: '' } → title 有出現（'' 不是 undefined）→ @IsNotEmpty() 照常擋 → 400
//
// 這就是不能沿用 CreateSurveyDto 的原因：那一份的 title 是必填，
// 「這次不想改標題」的請求會被擋在門外，部分更新等於不成立。
//
// 也因為規則全是繼承來的，這裡**不要**再寫一次 @IsString() 那三行 —— 寫了會蓋掉。
export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}
