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
//    代價是：查回來之後那個物件就帶著雜湊了。
//
//    Ch9 時靠回傳前解構把它剔除，**Ch10 之後那一步消失了** ——
//    login 只回 { accessToken }，整個 user 物件根本沒有被送出去。
//    但風險只是換了位置：現在要小心的是別把它放進 payload（見下一點）。
//    register 兩種情況都不必處理，因為它從來沒把雜湊撈出來。
//
// 4. **payload 只放 sub（Ch10）。** 兩個理由，都跟「payload 是什麼」有關：
//    它是 **base64 編碼、不是加密**，任何拿到 token 的人都看得見裡面每個字；
//    而且它是**簽發當下的快照**，不會跟著資料庫更新（exp 也是同一個道理）。
//
//    所以放進去的東西必須「不機密」而且「有效期內不會變」。
//    email 兩條都踩線（是個資，而且使用者可以改 —— 改完 token 裡那份就是舊的），
//    id 兩條都安全。輪 3 的 Survey.ownerId 直接拿 sub 來填，不必再查一次資料庫。
//
//    iat / exp 不是我們寫的，是 auth.module.ts 的 signOptions 自動塞進去的。
//
// 4.5 **findMe 查不到時丟 401 而不是 404（Ch10 輪 3）。**
//    判準是「這個『找不到』找的是資源，還是身分」：
//    /surveys/:id 的識別資訊在網址裡，找不到就是 404；
//    /auth/me 的識別資訊在**憑證**裡，找不到代表那張票已經失效 —— 401。
//
//    實務上的差別在前端：401 是唯一有「通用處置」的狀態碼（清 token、回登入頁），
//    回 404 的話前端要嘛為這支寫特例，要嘛卡在「有票但拿不到自己是誰」轉圈圈。
//
//    這個情境不是假想的：guard 只驗簽章與 exp、**完全不查資料庫**，
//    所以「票有效、但那個人已經被刪掉」是一個真的會發生的狀態。
//
// 下一站：src/auth/decorators/public.decorator.ts（票發出去了，誰在門口收）
// ============================================================

import { JwtService } from '@nestjs/jwt';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import bcrypt from 'bcryptjs';

const unauthorizedExceptionDescription = '帳號或密碼錯誤';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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

    const payload = { sub: user.id };
    const token = await this.jwtService.signAsync(payload);

    return { accessToken: token };
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException('查無此用戶');
    }

    return user;
  }
}
