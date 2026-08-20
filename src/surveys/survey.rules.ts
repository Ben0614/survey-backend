// ============================================================
// [教學] survey.rules.ts —— 兩條商業規則，寫成純函式
//
// 什麼時候被執行：service 在動資料之前呼叫它們問一句「可以嗎」。
//   canEditQuestions → QuestionsService 的 create / update / remove
//   canUnpublish     → SurveysService 的 unpublish
//
// 這個檔案是全專案唯一「不必啟動任何東西就能測」的地方，因為它三件事都沒做：
// 不注入零件、不碰資料庫、不丟 HTTP 例外。省下來的準備工作有多少，
// 看 survey.rules.spec.ts 就知道（它是動線的終點）。
//
// 兩個刻意的決定：
//
// 1. **沒有 @Injectable()，也不註冊進任何 module。**
//    到目前為止看到的零件（SurveysService、PrismaService）都是 provider，
//    很容易以為「NestJS 的東西都要注入」。不是 —— DI 是用來解決
//    「我需要別人幫我準備好的東西」，這裡沒有任何東西要準備，import 就能用。
//
// 2. **回 boolean，不直接 throw。**
//    丟 ConflictException 是 HTTP 的事，由 service 負責翻譯成 409。
//    規則檔一旦認識 HTTP，「不必假裝發請求就能測」這個唯一的好處就沒了。
//
// 下一站：src/questions/questions.module.ts（子資源怎麼借用 SurveysService）
// ============================================================

import { SurveyStatus } from '../generated/prisma/enums';

/**
 * 只有 DRAFT 的問卷能增刪改題目。
 *
 * 判準是「狀態」而不是「目前有幾筆填答」：已發布代表**可能有人正在填寫**，
 * 而有人開著頁面還沒送出時，填答數仍然是 0 —— 用填答數當判準會漏掉這些人。
 * 要改已發布的問卷，正式路徑是先 unpublish 再改。
 */
export function canEditQuestions(status: SurveyStatus): boolean {
  // [教學] 用 SurveyStatus.DRAFT 而不是字串 'DRAFT'：
  // 兩者在型別上都會過，但常數在 schema 改名時會編譯失敗提醒你，
  // 字串則會安靜地永遠回 false。
  return status === SurveyStatus.DRAFT;
}

/**
 * 已經有人填答就不能撤回發布 —— 撤回之後題目就能改，
 * 而舊答案是綁在舊題目上的，改完會對不起來。
 */
export function canUnpublish(responseCount: number): boolean {
  return responseCount === 0;
}

export function canSubmitResponse(status: SurveyStatus): boolean {
  return status === SurveyStatus.PUBLISHED;
}
