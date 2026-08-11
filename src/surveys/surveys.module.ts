// ============================================================
// [教學] surveys.module.ts —— 問卷這個功能領域的零件清單
//
// 什麼時候被執行：啟動時，AppModule 展開 imports 展到這裡。
//
// 形狀跟 health.module.ts 一樣，差別只有一個：這裡多了 providers。
// health 那邊的 controller 直接注入全域的 PrismaService，不需要自己的 service；
// 這裡的 SurveysService 是本 module 自己的零件，所以要註冊在 providers。
//
// 沒有 exports —— 目前沒有別的 module 需要用 SurveysService。
// 等 Ch3 的 QuestionsModule 需要它時再加，**不要預先開放**
// （沒 export 就等於 private，這是 module 邊界的意義）。
//
// 下一站：src/surveys/surveys.controller.ts（請求進來誰接手）
// ============================================================

import { Module } from '@nestjs/common';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

@Module({
  controllers: [SurveysController],
  providers: [SurveysService],
  exports: [SurveysService],
})
export class SurveysModule {}
