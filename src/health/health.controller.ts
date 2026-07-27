import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  // 這行就是 NestJS 的依賴注入：宣告「我需要 PrismaService」，
  // 由 Nest 負責建立與傳入。這也是為什麼 tsconfig 需要 emitDecoratorMetadata —
  // Nest 靠編譯期產生的型別 metadata 才知道要注入什麼。
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // 目前 schema 還沒有任何 model，所以用 raw query 確認連線真的通。
    // Ch1 建好 model 之後就會改用型別安全的查詢。
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
