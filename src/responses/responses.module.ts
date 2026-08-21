// ============================================================
// [教學] responses.module.ts —— 作答這個 feature 的零件清單
//
// 什麼時候被執行：應用啟動時，AppModule 把它 import 進來。
//
// 跟 questions.module.ts 幾乎一模一樣（同樣是子資源、同樣借 SurveysService），
// 所以那邊的註解不重複。唯一值得注意的是 controllers 有**兩個** ——
// 理由見下面兩支 controller 各自的檔頭。
//
// 下一站：src/responses/survey-responses.controller.ts（掛在問卷底下的那兩支路由）
// ============================================================

import { Module } from '@nestjs/common';
import { ResponsesController } from './responses.controller';
import { SurveyResponsesController } from './survey-responses.controller';
import { ResponsesService } from './responses.service';
import { SurveysModule } from '../surveys/surveys.module';

@Module({
  // [教學] 兩個 controller、**一個** service。它們注入的是同一個實例
  // （provider 預設是單例），所以「同一件事拆成兩支路由」不會變成兩份邏輯。
  controllers: [ResponsesController, SurveyResponsesController],
  providers: [ResponsesService],

  // [教學] 少了這行，ResponsesService 注入 SurveysService 會直接啟動失敗。
  // 要通得兩邊都做：SurveysModule 的 exports + 這裡的 imports（見 questions.module.ts）。
  //
  // 對照 PrismaService —— 它不必 import，因為 PrismaModule 是 @Global()。
  imports: [SurveysModule],
})
export class ResponsesModule {}
