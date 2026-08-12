// ============================================================
// [教學] questions.module.ts —— 題目這個功能領域的零件清單
//
// 什麼時候被執行：啟動時，AppModule 展開 imports 展到這裡。
//
// 跟 surveys.module.ts 比多了兩件事，兩件都是這一章的新概念：
//   1. 兩個 controller 共用一個 service（為什麼要兩個，見下面的 controllers）
//   2. imports 裡有另一個 **feature module**（見下面的 imports）
//
// 下一站：src/questions/survey-questions.controller.ts（巢狀路由長什麼樣）
// ============================================================

import { Module } from '@nestjs/common';
import { SurveysQuestionsController } from './survey-questions.controller';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { SurveysModule } from '../surveys/surveys.module';

@Module({
  // [教學] 一個 @Controller() 只能有一個路徑前綴，而這個功能的路由**形狀不一致**：
  // 列表與建立掛在問卷底下（/surveys/:surveyId/questions），改與刪是扁平的
  // （/questions/:id）。所以拆成兩個 class，理由與取捨見各自的檔頭。
  //
  // 兩個 controller 注入的是**同一個** QuestionsService 實例
  // （provider 預設是單例，見 health.controller.ts 檔頭）。
  // 路由形狀可以有兩種，但「題目該怎麼被建立」只能有一份。
  controllers: [SurveysQuestionsController, QuestionsController],
  providers: [QuestionsService],

  // [教學] 這是**第一次 feature module 依賴另一個 feature module**。
  //
  // 為什麼需要：QuestionsService 要注入 SurveysService，借它的 findOne 丟 404
  // （「這份問卷存不存在」）。而注入得到零件的前提是那個零件在**本 module 的可見範圍**內 ——
  // 光是 SurveysModule 有 providers 還不夠，它必須 exports，這裡也必須 imports，兩邊都做才通。
  //
  // 對照組是 PrismaService：它同樣來自別的 module，但那個 module 是 @Global()，
  // 所以誰都不必 import。**那是刻意的例外（全應用一個連線池），不要套用到業務 service** ——
  // 全部 @Global() 等於沒有 module 邊界，「誰用了誰」就再也看不出來了。
  imports: [SurveysModule],
})
export class QuestionsModule {}
