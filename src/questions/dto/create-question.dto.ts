// ============================================================
// [教學] create-question.dto.ts —— 建立題目時的形狀與規則
//
// 什麼時候被執行：每次有人打 POST /surveys/:surveyId/questions 時，
// ValidationPipe 拿這個 class 上的規則檢查 request body，不合格直接回 400。
//
// DTO 是什麼、它跟 Prisma 的 Model 差在哪，見 create-survey.dto.ts 的檔頭。
// 這裡有兩個新的驗證裝飾器，以及一個「欄位刻意不放進來」的決定。
//
// 下一站：src/questions/dto/update-question.dto.ts（同一份規則的部分更新版）
// ============================================================

import {
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsEnum,
  // [教學] 下面這四個是「自己寫一條規則」用的（Ch17 輪 ②）。
  // 它們跟 @IsString 出自**同一個套件** class-validator，不是別的東西 ——
  // @IsString 之類的內建裝飾器，底下也是用同一組機制做出來的。
  //
  //   ValidatorConstraint          貼在 class 上，宣告「這個 class 是一條規則」
  //   ValidatorConstraintInterface 那個 class 要實作的介面（validate + defaultMessage）
  //   ValidationArguments          validate 收到的第二個參數的型別
  //   Validate                     把那條規則掛到某個屬性上（用法同 @IsString()）
  Validate,
  ValidatorConstraint,
} from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
// [教學] QuestionType 是 schema.prisma 的 enum，由 prisma generate 產生。
//
// 相對路徑一律**不帶副檔名**（`.js` / `.ts` 都不寫）。這是 CJS 專案的慣例，
// 也是 NestJS 的預設 —— 只有 ESM 專案（package.json 有 "type": "module"）
// 才**規定**要帶 `.js`。src/generated 底下 Prisma 產的程式碼帶著 `.js`，
// 那是為了讓 ESM 專案也能用它，不是這個專案的寫法。
//
// 值得記的是另一件事：它**同時是值也是型別**。下面 @IsEnum(QuestionType) 用的是「值」
// （執行期要拿它去比對），type: QuestionType 用的是「型別」（編譯期的事）。
// 一次 import 兩種用途都拿到。
import { ApiProperty } from '@nestjs/swagger';
import { QuestionType } from '../../generated/prisma/enums';

// [教學] 一條「規則取決於另一個欄位」的驗證（Ch17 輪 ②）。
//
// 內建的裝飾器一次只看一個值（@MaxLength 只看那個字串多長），
// 但「單選題至少要有兩個選項」要同時看 options **與** type ——
// 這種跨欄位的規則，class-validator 給的工具就是自訂 constraint。
//
// ⚠️ **這個 class 必須寫在 CreateQuestionDto 上面。**
// 裝飾器是在 class 定義的當下就執行的，而 class 宣告不會被提升
//（跟 function 不一樣）。寫在下面的話啟動時就是
// `ReferenceError: Cannot access 'SingleChoiceNeedsOptions' before initialization`。
//
// ⚠️ **為什麼不用 @ValidateIf。** 最自然的寫法是這樣，而它是錯的：
//
//     @IsArray()
//     @IsString({ each: true })
//     @ValidateIf((o) => o.type === QuestionType.SINGLE_CHOICE)
//     @ArrayMinSize(2)
//     options: string[];
//
// @ValidateIf 的條件為 false 時，跳過的**不是它下面那一個裝飾器，
// 是這個屬性的全部**。於是 TEXT 題送 `options: "我是字串不是陣列"` 會通過，
// 而 @IsArray 那道防線安靜地消失了 —— 單選題那條規則看起來完全正常
//（你會去測它），壞掉的是你沒想到要測的那一邊。
//
// @Validate 是獨立的一個裝飾器，不影響旁邊任何一個。
@ValidatorConstraint({ name: 'singleChoiceNeedsOptions' })
export class SingleChoiceNeedsOptions implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { type?: QuestionType };

    // 不是單選題就一律通過 —— 這條規則管的只有單選題。
    //
    // type 是 undefined 時也走這裡。那發生在 UpdateQuestionDto
    //（PartialType(CreateQuestionDto)，每個欄位都變選填）只送 options
    // 不送 type 的時候 —— 也就是「把一個單選題的選項清空」目前擋不住。
    // 那要拿資料庫裡現有的 type 才判斷得出來，是 service 的事，不是 DTO 的事。
    // 輪 ③（編輯頁）會撞到，留在那裡處理。
    if (dto.type !== QuestionType.SINGLE_CHOICE) return true;

    return Array.isArray(value) && value.length >= 2;
  }

  defaultMessage(): string {
    return '單選題至少要有兩個選項';
  }
}

export class CreateQuestionDto {
  @ApiProperty({
    description: '題目標題',
    maxLength: 200,
    example: '題目',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  // [教學] @IsEnum(X) 檢查「值必須是 X 裡列出的其中一個」。
  //
  // 底下的 `type: QuestionType` 這個型別註記**對驗證毫無作用** ——
  // TypeScript 的型別在編譯後就消失了，執行期擋不了任何東西。
  // 拔掉 @IsEnum 的下場不是「改由資料庫的 enum 擋」，而是
  // whitelist 認定這個屬性沒有驗證裝飾器 → 整個丟掉 → prisma 收到 undefined → 500。
  // （whitelist 的判準見 create-survey.dto.ts 與 ch02。）
  @ApiProperty({
    description: '類型',
    enum: QuestionType,
  })
  @IsEnum(QuestionType)
  type: QuestionType;

  // [教學] 陣列要兩層規則：@IsArray() 管「它是不是陣列」，
  // @IsString({ each: true }) 的 each 管「裡面**每一個元素**都要是字串」。
  //
  // 少了 each 就變成「這個陣列本身必須是字串」，永遠不會通過。
  // 這個 { each: true } 幾乎所有 @Is... 裝飾器都支援。
  //
  // @Validate 掛的是上面那條跨欄位規則（Ch17 輪 ②）。
  //
  // ⚠️ @ValidatorConstraint 的 name **不是裝飾用的** ——
  // 它會變成錯誤回應裡 fields 的 rule（Ch15 輪 ③ 的形狀）：
  //     { field: 'options', rule: 'singleChoiceNeedsOptions' }
  // 前端拿那個 rule 去查文案表。取名時要當成 API 的一部分。
  @ApiProperty({
    description: '選項。SINGLE_CHOICE 至少兩個；TEXT 送空陣列',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true }
  @Validate(SingleChoiceNeedsOptions)
  options: string[];

  // 這裡刻意**沒有** order。
  //
  // 「這題排第幾」是伺服器算的（service 用 count 數現有題數），不讓前端指定：
  // 前端各自算容易撞號，而 Ch1 決定過不加 @@unique([surveyId, order])，
  // 撞了資料庫也不會擋。既然沒有守門員，就不要把球交給外面。
  //
  // surveyId 同樣不在這裡 —— 它在網址上（見 survey-questions.controller.ts）。
}
