// ============================================================
// [教學] app.module.ts —— 根 module，整個應用的「零件清單」
//
// main.ts 把這個 class 交給 NestFactory，Nest 就照它往下展開：
// 先建立 imports 裡的每個 module，再建立那些 module 各自的零件。
//
// 名詞：module 是 NestJS 的功能分組單位。一個 module 通常對應一個
// 功能領域（健康檢查、問卷、使用者……），裡面裝著該領域用到的
// controller 與 service。新增功能時就是多一個 module 掛到這裡。
//
// 下一站：src/health/health.module.ts（一個 feature module 長什麼樣）
// ============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SurveysModule } from './surveys/surveys.module';
import { QuestionsModule } from './questions/questions.module';

// [教學] @Module({...}) 是一個 decorator —— 寫在 class 上方、以 @ 開頭的東西。
// decorator 本身不執行邏輯，只是把設定資料「貼」在 class 上，讓 Nest
// 啟動掃描時讀得到。這是整個 NestJS 最常見的語法，之後到處都會看到。
//
// @Module 可以貼三種欄位，這裡只用到第一種：
//   imports     —— 這個 module 需要用到哪些別的 module
//   controllers —— 這個 module 負責處理哪些 HTTP 路由
//   providers   —— 這個 module 提供哪些可被注入的服務
// AppModule 自己不接路由也不提供服務，純粹負責組裝，所以只有 imports。
@Module({
  imports: [
    // [教學] ConfigModule 負責讀取 .env 檔。forRoot() 是「帶設定的 import」——
    // 有些 module 需要參數才能決定行為，就會提供這種靜態方法。

    // isGlobal: true 讓 ConfigService 到處都能注入。
    // 沒有這行的話，每個要讀環境變數的 module 都得自己 import ConfigModule。
    ConfigModule.forRoot({ isGlobal: true }),

    // [教學] 以下是專案自己寫的 module。排列順序不影響結果，
    // Nest 會依照彼此的依賴關係自行決定實際的建立順序。
    PrismaModule,
    HealthModule,
    SurveysModule,
    QuestionsModule,
  ],
})
export class AppModule {}
