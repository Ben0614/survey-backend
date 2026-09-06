// ============================================================
// [教學] update-question.dto.ts —— PATCH /questions/:id 專用的那一份規則
//
// 什麼時候被執行：每次有人打 PATCH /questions/:id 時，ValidationPipe 拿它檢查 body。
//
// PartialType 是什麼、@IsOptional() 為什麼是「短路開關」而不是多一條規則，
// 已經寫在 src/surveys/dto/update-survey.dto.ts 的檔頭，這裡不重複。
// 這個檔案只有一個新東西：它是**全開**的，而那是一個有代價的選擇（見下方）。
//
// 下一站：src/questions/dto/replace-questions.dto.ts（整份取代那一支的 body）
// ============================================================

import { PartialType } from '@nestjs/swagger';
import { CreateQuestionDto } from './create-question.dto';

// 三個欄位全部可改，包含 type。
//
// 另一個選項是 PartialType(OmitType(CreateQuestionDto, ['type']))，把 type 擋掉——
// 因為現在能把 SINGLE_CHOICE 改成 TEXT 卻留著 options，做出「不需要選項卻有選項」的髒資料。
//
// 選全開的理由是**這一章的主題不是驗證**，而 OmitType 擋掉的方式也不乾淨：
// 沒有裝飾器的屬性會被 whitelist **無聲丟掉**（不是回 400 說「不准改」），
// 前端送了 type 卻沒生效、也沒有錯誤訊息，反而更難查。
// 要真的拒絕得改用 forbidNonWhitelisted，那是另一個全域決定。
//
// 這個洞現階段接受，記在 LEARNING.md。「type 與 options 要一致」本質上是一條
// 商業規則，適合跟 Ch3 第二段那條「DRAFT 才能改題目」放在一起處理。
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}
