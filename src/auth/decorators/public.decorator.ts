// ============================================================
// [教學] public.decorator.ts —— 在路由上貼一張「這條不用登入」的便利貼
//
// 什麼時候被執行：**應用啟動時執行一次**（decorator 是在 class 被定義的當下
// 就跑完的），把一筆資料掛到那個方法上。之後每個請求進來時由 guard 讀它。
//
// 這是專案第一次自己寫 decorator。前面用過的 @Get()、@Body()、@ApiProperty()
// 都是別人寫好的，長相一樣：**一個回傳 decorator 的函式**。
//
// 這個機制叫 metadata，可以想成兩個動作：
//   SetMetadata(key, value)  —— 貼便利貼（這個檔案做的事）
//   Reflector.get(key, ...)  —— 撕下來看（jwt-auth.guard.ts 做的事）
// 中間靠 key 對上，所以 key 一定要是**同一個常數**，不能兩邊各打一次字串。
//
// 為什麼不能兩邊各寫 'isPublic'：拼錯的話 guard 永遠讀到 undefined，
// 於是 @Public() **完全失效**，而 tsc 綠、lint 綠、沒有任何錯誤訊息 ——
// 症狀只有「那條路由變成需要登入」。這跟 findAll 把 where 抽成變數
// 是同一個形狀的對策：讓「兩邊不一致」在結構上不可能發生。
//
// 下一站：src/auth/guards/jwt-auth.guard.ts（誰在讀這張便利貼）
// ============================================================

import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * metadata 的 key。裝飾器與 guard 共用同一個常數，不要各自寫字串。
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 標在路由（或整個 controller）上，讓全域的 JwtAuthGuard 放行。
 *
 * 全域 guard 是「預設拒絕」，這個裝飾器就是「例外明說」的那一半 ——
 * 同一條原則的第四次：全域 omit、@unique、prebuild，現在是它。
 */
// [教學] Public 本身**不是** decorator，它是一個「呼叫之後才回傳 decorator」
// 的函式。所以用的時候要加括號寫成 @Public()，跟 @Get() 一樣。
// （對照 @Injectable() —— 也是括號版；真正不加括號的很少見。）
//
// 回傳型別 CustomDecorator 是 SetMetadata 的回傳型別，寫出來只是為了
// 讓 eslint 的「公開 API 要有明確型別」那條規則安靜，行為沒有差別。
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
