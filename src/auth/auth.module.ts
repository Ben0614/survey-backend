// ============================================================
// [教學] auth.module.ts —— 第四個 feature module（Ch9）
//
// 什麼時候被執行：應用啟動時，AppModule 的 imports 展開到這裡。
// 跟前三個 feature 的差別只有一個：它**不需要 imports**。
// questions / responses 都要 imports SurveysModule（借 assertExists 丟 404），
// 而註冊登入不依賴任何別的 feature —— PrismaModule 是 @Global()，不必寫。
//
// 下一站：src/auth/auth.controller.ts（兩支端點，狀態碼卻不一樣）
// ============================================================

import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
