// ============================================================
// [教學] survey.rules.ts —— 四條規則，全部寫成純函式
//
// 什麼時候被執行：service 在動資料之前呼叫它們問一句「可以嗎」。
//   canEditQuestions   → QuestionsService 的 create / update / remove
//   canUnpublish       → SurveysService 的 unpublish
//   canSubmitResponse  → ResponsesService 的 create（Ch5）
//   canManageSurvey    → 八個地方（Ch12），但都經由 SurveysService.assertCanManage
//
// **前三條是「這件事現在能不能做」（→ 409），第四條是「你能不能碰」（→ 403）。**
// 兩者的順序有意義：授權要排在商業規則之前，否則一個不相干的人會拿到
// 「問卷已發布，無法修改題目」這種他不該知道的資訊（見 ch12 的坑 2）。
//
// ⚠️ 這個檔頭從 Ch5 到 Ch12 一直寫著「兩條」—— canSubmitResponse 加進來時沒改，
// 漏了七章才被發現。**加函式時回頭看一眼檔頭**，它就在同一個檔案的最上面。
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
//    canManageSurvey 的翻譯層是 SurveysService.assertCanManage（Ch12 抽的）——
//    因為它有**八個**呼叫點，八處各寫一次 `if (!canManageSurvey(...)) throw`
//    就是八次寫反條件的機會。規則一個出口，翻譯也一個出口。
//
// 下一站：src/questions/questions.module.ts（子資源怎麼借用 SurveysService）
// ============================================================

import { SurveyStatus } from '../generated/prisma/enums';
import type { AuthUser } from '../auth/guards/jwt-auth.guard';
import { Role } from '../generated/prisma/enums';

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

export function canManageSurvey(
  ownerId: string | null,
  user: AuthUser,
): boolean {
  return ownerId === user.id || user.role === Role.ADMIN;
}
