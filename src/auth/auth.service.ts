// ============================================================
// [教學] auth.service.ts —— 註冊與登入的實際邏輯
//
// 什麼時候被執行：controller 收到請求、DTO 驗證通過之後。
// 這是這一章唯一有「決定」的檔案，三個決定各自有代價：
//
// 1. **register 沒有「先查有沒有重複」那一段。** 重複 email 的 409 是
//    schema 的 @unique 讓 Prisma 丟 P2002、再由 Ch6 的 filter 翻譯來的。
//    自己先查一次擋不住併發（兩個請求可以同時查到「沒有」），
//    真正的防線一直是資料庫那個 UNIQUE INDEX。
//
// 2. **login 的兩條失敗路徑丟同一個例外、同一句訊息。**
//    分開回（404 查無此帳號 / 401 密碼錯誤）的話，任何人拿一份 email 清單
//    掃一遍就能篩出誰是使用者，連猜密碼都不用（user enumeration）。
//    訊息抽成常數不是為了少打字，是讓「兩處分岔」在結構上不可能發生。
//
//    嚴格做的話連**時間差**都要處理（帳號不存在時比走完 bcrypt.compare 快得多，
//    時間本身就洩漏答案）。這個專案不做 —— 但要知道那個洞還在，
//    而不是以為統一訊息就完事了。
//
// 3. **login 是全專案唯一寫 omit: { passwordHash: false } 的地方。**
//    全域 omit 是「預設拒絕」，比對密碼是唯一有正當理由要回它的場合。
//    代價是：要回來之後那個物件就帶著雜湊了，所以回傳前必須剔除
//    （下面那行解構）。register 不需要做這件事，因為它從來沒把它撈出來。
//
// 下一站：test/setup-env.ts（上面這些怎麼被自動驗證）
// ============================================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import bcrypt from 'bcryptjs';

const unauthorizedExceptionDescription = '帳號或密碼錯誤';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
      omit: { passwordHash: false },
    });

    if (!user) {
      throw new UnauthorizedException(unauthorizedExceptionDescription);
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException(unauthorizedExceptionDescription);
    }

    const { passwordHash, ...safe } = user;

    return safe;
  }
}
