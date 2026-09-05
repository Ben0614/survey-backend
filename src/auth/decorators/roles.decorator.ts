// ============================================================
// [教學] roles.decorator.ts —— 在路由上貼一張「這扇門要看職稱」的紙條（Ch11）
//
// 什麼時候被執行：**應用啟動時一次**（decorator 在 class 被定義的當下就跑完），
// 之後由 roles.guard.ts 在每個請求時讀它。同 public.decorator.ts 的機制。
//
// 跟 @Public() 的差別有兩層：
//
//   1. **貼的東西不同**：@Public() 貼 true（一個開關），
//      @Roles() 貼一個**陣列**。...roles 收可變參數，所以
//      @Roles(Role.ADMIN, Role.EDITOR) 不必改任何程式碼就成立。
//
//   2. **意思相反**：@Public() 標了代表「放行」，@Roles() 標了代表「才要檢查」。
//      兩個 guard 的預設方向因此也相反 —— 理由見 roles.guard.ts 的第 ② 步。
//
// **它本身什麼都不做。** 貼完就沒事了，真正擋人的是讀紙條的那支 guard。
// 只寫了裝飾器卻忘了註冊 guard 的話，效果是零 —— 而且完全無聲。
//
// 下一站：src/auth/decorators/api-authenticated.decorator.ts（第三種：把多個裝飾器打包，而且它誰都不影響）
// ============================================================

import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]): CustomDecorator =>
  SetMetadata(ROLES_KEY, roles);
