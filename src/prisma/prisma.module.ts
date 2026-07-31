// ============================================================
// [教學] prisma.module.ts —— 把資料庫連線包成全應用共用的零件
//
// 這個檔案沒有任何邏輯，它只做兩件宣告：
//   1. PrismaService 這個零件存在
//   2. 而且開放給別的 module 使用
//
// 下一站：prisma.service.ts（連線實際上是怎麼建立的）
// ============================================================

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global() 讓 PrismaService 註冊一次就能被任何 module 注入，
 * 不必在每個 feature module 的 imports 重複寫 PrismaModule。
 *
 * 一般不建議濫用 @Global（會讓依賴關係變隱晦），但資料庫連線是
 * 整個應用共用的單一資源，屬於少數合理的例外。
 */
// [教學] providers 與 exports 的差別（初學最容易混淆的一組）：
//   providers —— 「這個 module 內部有哪些可被注入的零件」
//   exports   —— 「其中哪些願意借給別的 module 用」
// 只寫 providers 不寫 exports，PrismaService 就會變成 PrismaModule 的私有物，
// HealthController 注入時會直接報找不到。
//
// 還有一件事值得記住：Nest 的 provider 預設是**單例**。
// 整個應用從頭到尾只會有一個 PrismaService 實例、一個連線池，
// 不會因為多個 controller 注入它就開出多條連線。
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
