// ============================================================
// [教學] prisma.service.ts —— 資料庫連線的本體
//
// 這是全專案唯一真正碰到資料庫的地方。它把 Prisma 官方的 PrismaClient
// 包成一個 Nest 認得的零件，並且把「開連線 / 關連線」掛到應用的生命週期上。
//
// Ch1 之後你寫的每一句查詢（this.prisma.survey.findMany() 之類），
// 用的都是這個 class 從 PrismaClient 繼承來的方法。
//
// 下一站：prisma/schema.prisma（PrismaClient 那些方法是怎麼來的）
// ============================================================

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
// [教學] 這個 import 路徑很奇怪（帶 .js、指向 src/generated），
// 是因為 PrismaClient 不是套件、是 `prisma generate` 產生出來的程式碼。
// 換一台電腦後這個資料夾不存在是正常的，跑一次 generate 就會回來。
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * 把 PrismaClient 包成 NestJS 的 provider，讓其他 service 可以用建構子注入取得。
 *
 * 注意：Prisma 7 起「一定」要透過 driver adapter 連線，不能只給 datasource url。
 * 網路上多數 NestJS + Prisma 教學是 v5/v6 的 `extends PrismaClient` 寫法，在 v7 已經不適用。
 */
// [教學] 這行 class 宣告一次做了三件事：
//   @Injectable()          —— 標記「我可以被 Nest 注入到別人身上」。
//                             沒有它，PrismaModule 的 providers 註冊會失敗。
//   extends PrismaClient   —— 繼承。PrismaService 自動擁有 PrismaClient 的
//                             所有查詢方法，所以才能寫 this.prisma.$queryRaw。
//   implements On...       —— 承諾「我會實作 onModuleInit / onModuleDestroy」。
//                             Nest 靠這個約定在對的時機呼叫下面兩個方法。
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    // ConfigService 讀不到 DATABASE_URL 時直接讓程式起不來，
    // 比等到第一次查詢才炸掉容易 debug 得多。
    const connectionString = config.getOrThrow<string>('DATABASE_URL');

    // [教學] super() 是「呼叫父類別的建構子」，也就是把設定交給 PrismaClient。
    // 這裡交出去的是一個 driver adapter：Prisma 7 自己不連資料庫了，
    // 改由 Node 生態的 pg 套件負責，PrismaPg 就是兩者之間的轉接頭。
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  /** Nest 建好這個 module 後會呼叫。提早連線，避免第一個請求承擔連線成本。 */
  // [教學] 這兩個方法你不會自己呼叫，是 Nest 在對的時機幫你呼叫的：
  //   onModuleInit    —— 應用啟動、所有零件都建好之後
  //   onModuleDestroy —— 應用要關閉時（需要 main.ts 的 enableShutdownHooks）
  //
  // 有個細節值得記住：$connect() 在 adapter 模式下其實不會真的去驗證帳密。
  // 底層的 pg 連線池是 lazy 的，要等第一次查詢才會真正連上去 ——
  // 這就是 Ch0 作業第 2 題「密碼改錯卻能正常啟動」的原因。
  async onModuleInit() {
    await this.$connect();
  }

  /** 應用程式關閉時釋放連線池，測試時尤其重要，否則 Jest 會卡住不結束。 */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
