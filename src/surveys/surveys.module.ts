// ============================================================
// [教學] surveys.module.ts —— 問卷這個功能領域的零件清單
//
// 什麼時候被執行：啟動時，AppModule 展開 imports 展到這裡。
//
// 形狀跟 health.module.ts 一樣，差別只有一個：這裡多了 providers。
// health 那邊的 controller 直接注入全域的 PrismaService，不需要自己的 service；
// 這裡的 SurveysService 是本 module 自己的零件，所以要註冊在 providers。
//
// exports 是 Ch3 才加上的。Ch2 寫這個檔案時刻意留空，並註明「等 QuestionsModule
// 需要它時再加，不要預先開放」—— 沒 export 就等於 private，這是 module 邊界的意義。
// 現在 QuestionsService 真的要借 findOne 丟 404 了，所以它才出現。
//
// **這一行的意思是「我允許外面用 SurveysService」**，不是「我把它公開給全世界」：
// 對方還是得在自己的 module 寫 imports: [SurveysModule]，兩邊都做才通。
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
