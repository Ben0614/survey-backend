// ============================================================
// [教學] api-authenticated.decorator.ts —— 把「要帶票」與「不帶票會怎樣」綁成一個（Ch13 輪 ②）
//
// 什麼時候被執行：**應用啟動時一次**（同 roles.decorator.ts）。
// 但它跟前面那些裝飾器有一個根本差別：
//
//   **它完全不影響執行期行為。** 拿掉它，401 照樣會回、133 條測試照樣全綠 ——
//   變的只有 /docs 上那份契約。真正擋人的一直是 jwt-auth.guard.ts。
//
// 為什麼要綁在一起（這一輪的重點）：
//
//   @ApiBearerAuth()          說「這支**要帶** token」  → spec 的 security
//   @ApiUnauthorizedResponse  說「**不帶**會回什麼」    → spec 的 responses.401
//
// 這是 spec 裡兩個獨立的欄位，而**只標前者不會有任何症狀**：tsc 綠、lint 綠、
// 測試全綠、/docs 看起來也正常。Ch13 開工前實測的結果是 18 支端點裡 16 支沒標 401，
// 其中 14 支是要帶 token 的 —— 那 14 支全都標了 @ApiBearerAuth()。
//
// 成因不是誰偷懶：Ch7 標 Swagger 時還沒有認證這回事（那次的 diff 裡
// ApiBearerAuth 出現 0 次），Ch10 一個全域 guard 讓所有端點同時多了一種回應，
// 而契約是逐支標的。**行為的改變是集中的，契約的更新卻是分散的。**
// 綁成一個裝飾器之後，「標了認證卻忘了說 401」在結構上不可能發生。
//
// 跟 @Roles() 是兩種不同的自訂裝飾器，別混在一起：
//
//   @Roles()            SetMetadata     —— 貼一筆資料，等 guard 來讀
//   @ApiAuthenticated() applyDecorators —— 把多個現成的裝飾器打包成一個
//
// 連帶一個差別：roles.decorator.ts 檔頭說「忘了註冊 guard 的話效果是零」，
// 這一支沒有那個問題 —— 它不需要任何人配合，因為它要影響的只有那份 JSON。
//
// **什麼時候不要用它**：某支端點的 401 有它自己要講的話。例如 GET /auth/me 的
// 三種失敗（沒帶票／票無效／那個人已被刪）對外一模一樣，但值得寫在描述裡，
// 所以那支維持自己的 @ApiUnauthorizedResponse。判準：**組合裝飾器只適合
// 「每一支都一樣」的情況。**
//
// 下一站：src/auth/decorators/current-user.decorator.ts（另一種裝飾器：取值而不是貼資料）
// ============================================================

import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorResponseEntity } from '../../common/entities/error-response.entity';

/**
 * 標在 controller 的 class 上，代表這個 controller 的每一支端點都要帶 token。
 *
 * 產生兩件事：spec 的 `security`（要帶票）與 `responses.401`（不帶票會回什麼）。
 */
export function ApiAuthenticated() {
  // [教學] applyDecorators 收的是**裝飾器本身**，不是「套用的動作」——
  // 所以裡面寫 ApiBearerAuth() 而不是 @ApiBearerAuth()。
  //
  // @Foo() 這個語法其實是兩件事：Foo() 呼叫工廠拿到一個裝飾器，
  // @ 把它貼到下面的 class 上。這裡只做第一件事，貼的動作等到
  // controller 上寫 @ApiAuthenticated() 時才由 applyDecorators 一次完成。
  return applyDecorators(
    ApiBearerAuth(),
    // type 不能省。少了它，spec 裡的 401 會是一個沒有 body 形狀的回應，
    // 而 401 是前端唯一有通用處置的狀態碼（清 token、導登入），
    // 它要靠 error.code === 'UNAUTHORIZED' 分支 —— 沒有形狀就沒有型別可依。
    ApiUnauthorizedResponse({
      description: '未登入，或權杖無效／已過期',
      type: ErrorResponseEntity,
    }),
  );
}
