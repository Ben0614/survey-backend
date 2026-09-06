// ============================================================
// [教學] field-errors.ts —— 「哪個欄位、違反哪條規則」（Ch15 輪 ③）
//
// 什麼時候被執行：
//   flattenValidationErrors  → setup-app.ts 的 ValidationPipe exceptionFactory
//   extractConflictFields    → all-exceptions.filter.ts 的 Prisma P2002 分支
//
// **為什麼要有這個檔案：錯誤回應要給「機器能判斷的東西」，不是「人能讀的句子」。**
//
// 改之前，兩種錯誤都只給句子：
//   驗證失敗  details: ["password must be longer than or equal to 8 characters"]
//   唯一衝突  message: "資料已存在"          ← 連哪個欄位都沒說
//
// 前端要標紅那個輸入框，就得**解析英文字串** —— 而那正是專案規則
// 「用 error.code 分支，不要解析 message」禁止的事。
//
// 業界的做法一致：欄位名是獨立的資料，不是句子的一部分。
//   GitHub  errors: [{ field, code: "already_exists" }]
//   Stripe  error:  { code: "email_invalid", param: "email" }
//   Google  details: [{ fieldViolations: [{ field, description }] }]
//
// 這兩個函式都是**純函式**：不注入零件、不碰資料庫、不丟 HTTP 例外。
// 所以它們跟 survey.rules.ts 一樣，是「不必啟動任何東西就能測」的地方 ——
// 而 flattenValidationErrors 的遞迴特別需要那種測試（巢狀錯誤用 e2e 很難造）。
//
// 下一站：src/common/entities/error-response.entity.ts（上面這個形狀在契約裡怎麼描述）
// ============================================================

import { ValidationError } from 'class-validator';
import { Prisma } from '../generated/prisma/client';

/** 一筆「哪個欄位違反哪條規則」。 */
export interface FieldError {
  /** 欄位路徑。巢狀時是完整路徑，例如 answers.0.questionId */
  field: string;
  /** 違反的規則名。驗證錯誤是 class-validator 的裝飾器名，唯一衝突固定是 unique */
  rule: string;
}

/**
 * 把 class-validator 的 ValidationError 樹攤平成一維的 FieldError 清單。
 *
 * ValidationError 是**巢狀**的，而巢狀的那一層自己沒有 constraints：
 *
 *   { property: 'answers', constraints: undefined, children: [
 *       { property: '0', children: [
 *           { property: 'questionId', constraints: { isNotEmpty: '...' } } ] } ] }
 *
 * 陣列的索引也是一層（property 是 '0'），所以路徑接起來會是
 * `answers.0.questionId` —— 跟 NestJS 預設訊息裡的路徑格式一致，
 * 前端拿它去對應輸入框不必再轉換。
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  prefix = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;

    // constraints 的 **key 就是規則名**（minLength / isEmail / isNotEmpty），
    // value 才是那句英文訊息。我們要的是 key —— 那是機器能判斷的東西。
    //
    // 一個欄位可能同時違反多條（例如 content 既不是字串、又超過 500 字），
    // 所以這裡是 map 不是取第一個。
    const own = Object.keys(error.constraints ?? {}).map((rule) => ({
      field,
      rule,
    }));

    // children 是空陣列而不是 undefined 的情況也存在，所以用 length 判斷。
    const nested = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...own, ...nested];
  });
}

/**
 * 從 Prisma 的唯一約束衝突（P2002）取出衝突的欄位名。
 *
 * ⚠️ **這個路徑是 Prisma 7 + driver adapter 的內部結構，不是公開契約。**
 *
 *   Prisma 5/6（網路上所有教學）  meta.target = ['email']
 *   Prisma 7 + PrismaPg（這裡）   meta.driverAdapterError.cause.constraint.fields
 *
 * 四層深，而且升級版本就可能變。所以每一層都用可選鏈，
 * **拿不到就回 undefined，讓 409 照樣回、只是少了欄位名** ——
 * 不能讓它丟 TypeError，那會掉進 filter 最後那支 else 變成 500：
 * 使用者註冊撞 email 會看到「伺服器發生錯誤」，而 log 裡是一句看不懂的
 * 「Cannot read properties of undefined」。**降級，不要炸掉。**
 */
export function extractConflictFields(
  exception: Prisma.PrismaClientKnownRequestError,
): FieldError[] | undefined {
  const meta = exception.meta as
    | {
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
      }
    | undefined;

  const fields = meta?.driverAdapterError?.cause?.constraint?.fields;

  if (!Array.isArray(fields)) return undefined;

  const named = fields
    .filter((field): field is string => typeof field === 'string')
    .map((field) => ({ field, rule: 'unique' }));

  // 空陣列跟「拿不到」一樣，都回 undefined —— 讓呼叫端只要判斷一次。
  return named.length > 0 ? named : undefined;
}
