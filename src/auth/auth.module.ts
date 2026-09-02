// ============================================================
// [教學] auth.module.ts —— 第四個 feature module（Ch9），Ch10 長出 imports
//
// 什麼時候被執行：應用啟動時，AppModule 的 imports 展開到這裡。
//
// Ch9 時這裡是全專案唯一沒有 imports 的 feature module；Ch10 加了 JwtModule。
// 三個 module 三種借法，剛好湊成一組對照：
//   PrismaModule  —— @Global()，註冊一次全應用可注入，**不必寫 imports**
//   SurveysModule —— 一般 module，questions / responses 要 imports 才借得到
//   JwtModule     —— 一般 module，而且**要帶設定**才借得到（見下面 registerAsync）
//
// Ch10 輪 2 又多了一件事：**全域 guard 在這裡註冊**（providers 裡的 APP_GUARD）。
// 那個 token 很特別 —— 在任何 module 註冊都會變成全應用生效，
// 所以「註冊在哪裡」純粹是看**它需要的零件在哪裡拿得到**：
// JwtAuthGuard 要注入 JwtService，而 JwtModule 是在這裡被 import 的。
// 寫在 AppModule 就找不到它（除非把 JwtModule 設成 @Global()，
// 但那正好違反這一輪在教的東西 —— PrismaModule 的 @Global() 是例外，不是模式）。
//
// 下一站：src/auth/auth.controller.ts（兩支端點，狀態碼卻不一樣）
// ============================================================

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  imports: [
    // [教學] JwtModule 的 providers / exports 裡有一個 JwtService（同 prisma.module.ts
    // 那段對照）。**imports 寫下去的那一刻**，AuthService 才注入得到它。
    //
    // 為什麼是 registerAsync 而不是 register：兩者交出去的東西不同 ——
    //   register(物件)        物件本身，在這個檔案被載入的那一刻就求值
    //   registerAsync({...})  一個「能算出那個物件」的函式，Nest 等零件備妥才呼叫
    //
    // secret 要從 ConfigService 拿，而 ConfigService 是零件、有它自己的準備時機，
    // 所以只能用後者。寫成 register({ secret: process.env.JWT_SECRET }) 也「會動」，
    // 但那等於繞過整個 ConfigModule 直接讀 Node 的環境變數 ——
    // .env 有沒有被讀進來變成時序運氣，而失敗時是安靜的（見下面 getOrThrow 那段）。
    JwtModule.registerAsync({
      // [教學] inject 與 useFactory 的參數**必須對齊**，順序也要對：
      // Nest 把 inject 陣列裡的零件建好，照同樣的順序當參數傳進 useFactory。
      // 陣列放兩個、函式只收一個，第二個會靜靜消失，tsc 不會叫。
      //
      // 網路上的範例這裡常常還有一行 imports: [ConfigModule]。
      // 這個專案不用寫 —— app.module.ts 的 ConfigModule.forRoot({ isGlobal: true })
      // 已經讓它全域了。
      inject: [ConfigService],

      // useFactory 回傳的物件，就是 register() 本來要吃的那一包。
      useFactory: (config: ConfigService) => ({
        // getOrThrow 而不是 get，理由同 prisma.service.ts 的 DATABASE_URL：
        // 沒設就讓程式起不來，比等到出事才發現容易 debug 得多。
        //
        // 這裡的「出事」特別難看：secret 是 undefined 時 @nestjs/jwt 不會拒絕，
        // 它照樣簽 —— 簽出一批任何人都偽造得出來的 token，而且沒有任何錯誤訊息。
        //
        // ⚠️ 但 getOrThrow **只擋 undefined**（原始碼是 isUndefined(value) 才 throw）。
        // .env 寫成 `JWT_SECRET=` 時 dotenv 給的是空字串，這一關**過得去**，
        // 要到第一次簽 token 才炸 `secretOrPrivateKey must have a value`。
        // 也就是說：應用起得來、/health 是綠的，只有登入會 500。
        secret: config.getOrThrow<string>('JWT_SECRET'),

        // [教學] 泛型寫 JwtSignOptions['expiresIn'] 而不是 <string>，是被型別逼的：
        // expiresIn 的型別是 `StringValue | number`，而 StringValue 是 ms 套件用
        // template literal 拼出來的字面值聯集（'1h' | '30m' | … 這種），**不是 string**。
        // 給 <string> 的話 tsc 會紅。
        //
        // 那為什麼不直接 import ms 的型別？pnpm 沒有把 ms 提到 node_modules 頂層
        // （它是 jsonwebtoken 的間接相依），`from 'ms'` 解析不到。
        // 從 @nestjs/jwt 借它已經公開的型別是最短的路。
        //
        // 要留意這個泛型是**宣告**不是**檢查**：.env 打成 '1hour' 一樣編譯得過，
        // 到執行期才由 ms 判定失敗。
        //
        // 同樣用 getOrThrow：沒設的話 jsonwebtoken 的預設是**永不過期**，
        // 那正好是這一章最不想要的行為，而它同樣是安靜的。
        signOptions: {
          expiresIn:
            config.getOrThrow<JwtSignOptions['expiresIn']>('JWT_EXPIRES_IN'),
        },
      }),
    }),
  ],
})
export class AuthModule {}
