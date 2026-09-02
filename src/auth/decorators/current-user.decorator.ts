// ============================================================
// [教學] current-user.decorator.ts —— 把 guard 放上去的身分取下來（Ch10 輪 3）
//
// 什麼時候被執行：**每次那條路由被呼叫時**，在 controller 方法被叫之前
// —— 也就是 guard 跑完之後的下一刻。
//
// 它跟 @Public() 是兩種不同的裝飾器，別混在一起：
//   @Public()      貼資料的裝飾器（SetMetadata），啟動時貼一次
//   @CurrentUser() **參數**裝飾器（createParamDecorator），每個請求取一次值
// 後者跟 @Body() / @Param() / @Query() 同一族 —— 都是「從請求裡挖出一個值，
// 塞進 controller 方法的參數」。這是這個專案的第四種取值來源。
//
// context 跟 jwt-auth.guard.ts 拿到的是**同一份**上下文，差別只有時機：
// guard 先跑、把 user 放上去，這裡後跑、把它拿下來。
//
// 下一站：src/auth/guards/jwt-auth.guard.ts（那個 user 是誰放上去的）
// ============================================================

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser, AuthenticatedRequest } from '../guards/jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user === undefined) {
      throw new Error(
        '@CurrentUser() 用在沒有經過 JwtAuthGuard 的路由上（例如標了 @Public()）',
      );
    }

    return request.user;
  },
);
