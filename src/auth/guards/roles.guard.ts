// ============================================================
// [教學] roles.guard.ts —— 第二個驗票口，看的是職稱（Ch11 輪 2）
//
// 什麼時候被執行：**每一個請求都會經過**，而且**排在 JwtAuthGuard 之後**
// （auth.module.ts 的 providers 陣列順序決定的）。順序不能反 ——
// 這支要用 request.user，而那是 JwtAuthGuard 第 ④ 步放上去的。
// 沒有身分就談不上角色。
//
// 它跟 JwtAuthGuard 的分工要分清楚：
//   JwtAuthGuard  驗票 —— 你是誰？票是真的嗎？沒過就 401
//   RolesGuard    看職稱 —— 你的角色能做這件事嗎？沒過就 403
//
// **這支完全不碰 token、不碰 secret、不碰資料庫。** 它只做一件事：
// 比對兩個東西 —— @Roles() 貼在路由上的那張紙條，和 request.user.role。
// 之所以這麼便宜，是因為 Ch11 決定把 role 簽進 payload
// （代價寫在 auth.service.ts 的 payload 那一段）。
//
// 下一站：test/setup-env.ts（上面這些怎麼被自動驗證）
// ============================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { Role } from '../../generated/prisma/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  // 只要 Reflector —— 它是 @nestjs/core 內建的 provider，不必 import 任何 module。
  constructor(private readonly reflector: Reflector) {}

  // [教學] 回傳型別是 boolean 而不是 Promise<boolean>（對照 JwtAuthGuard）：
  // 這支沒有任何非同步的事要做。canActivate 兩種都收。
  canActivate(context: ExecutionContext): boolean {
    // ── ① 這條路由上有 @Roles() 貼的紙條嗎？
    //
    // [教學] 泛型是 Role[] 不是 boolean —— @Roles(Role.ADMIN) 貼上去的是
    // 一個**陣列** ['ADMIN']（見 roles.decorator.ts 的 ...roles）。
    // 寫成 <boolean> 的話 tsc 不會叫（泛型只是宣告、不做執行期檢查），
    // 但你會拿一個陣列去當 true/false 用 —— 而空陣列以外的陣列永遠是 truthy。
    //
    // getAllAndOverride 的陣列參數：方法上找、controller 上也找，
    // **方法蓋過 controller**。這一輪只標在方法上，但 @Roles() 天生適合
    // 標在整個 controller 上（「這區塊全部要管理員」），那時就靠它。
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(), // 這次要執行的那個方法
      context.getClass(), // 它所屬的 controller
    ]);

    // ── ② 沒紙條 → 這扇門不看職稱 → 放行
    //
    // [教學] **這裡的方向跟 @Public() 相反，而那不是不一致。**
    //   @Public()  標了 → 放行     （不標 = 要驗票）
    //   @Roles()   標了 → 才檢查   （不標 = 不看職稱）
    // 兩者回答的是不同的問題：一個問「這扇門要不要驗票」，
    // 另一個問「這扇門要不要看職稱」。多數門不看職稱，
    // 那不代表它不驗票 —— 票在上一站已經驗過了。
    if (!requiredRoles) {
      return true;
    }

    // ── ③ 有紙條 → 比對
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    // [教學] 用 includes（列出誰可以），不要寫成 user.role !== Role.ADMIN
    // （排除誰不行）。兩種在正常情況下行為一樣，只有遇到**沒有 role 的
    // payload** 才分岔：
    //   includes(undefined)      → false → 擋下   ✅ 安全
    //   undefined !== 'ADMIN'    → true  → 放行   ❌ 危險
    //
    // 這不是假想的情況：Ch10 簽出去的 token 沒有 role 欄位，而 JWT_SECRET
    // 沒換，所以它們在過期前都還驗得過（Ch11 輪 1 決定「接受」這件事，
    // 前提就是這裡往「拒絕」的方向失敗）。
    //
    // 這是「預設拒絕」的第五次：全域 omit、@unique、whitelist、@Public()，
    // 現在是它。
    //
    // user 為 undefined 理論上不會發生（JwtAuthGuard 先跑，沒過就 401 了），
    // 但一起擋掉的成本是零，而漏掉的代價是一個 undefined 溜進 includes。
    if (!user || !requiredRoles.includes(user.role)) {
      // [教學] 403 不是 401，這是專案第一次用到它：
      //   401 我不知道你是誰      → 前端該做的是導去登入頁
      //   403 我知道你是誰，但你不能做這件事 → 前端該顯示「權限不足」
      // 訊息刻意不說「需要 ADMIN」—— 沒必要告訴對方門檻在哪。
      throw new ForbiddenException('權限不足');
    }

    return true;
  }
}
