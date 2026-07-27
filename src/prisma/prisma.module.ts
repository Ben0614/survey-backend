import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global() 讓 PrismaService 註冊一次就能被任何 module 注入，
 * 不必在每個 feature module 的 imports 重複寫 PrismaModule。
 *
 * 一般不建議濫用 @Global（會讓依賴關係變隱晦），但資料庫連線是
 * 整個應用共用的單一資源，屬於少數合理的例外。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
