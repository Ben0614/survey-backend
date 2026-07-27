import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * 把 PrismaClient 包成 NestJS 的 provider，讓其他 service 可以用建構子注入取得。
 *
 * 注意：Prisma 7 起「一定」要透過 driver adapter 連線，不能只給 datasource url。
 * 網路上多數 NestJS + Prisma 教學是 v5/v6 的 `extends PrismaClient` 寫法，在 v7 已經不適用。
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    // ConfigService 讀不到 DATABASE_URL 時直接讓程式起不來，
    // 比等到第一次查詢才炸掉容易 debug 得多。
    const connectionString = config.getOrThrow<string>('DATABASE_URL');

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  /** Nest 建好這個 module 後會呼叫。提早連線，避免第一個請求承擔連線成本。 */
  async onModuleInit() {
    await this.$connect();
  }

  /** 應用程式關閉時釋放連線池，測試時尤其重要，否則 Jest 會卡住不結束。 */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
