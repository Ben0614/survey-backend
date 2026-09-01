// ============================================================
// [教學] login.dto.ts —— 登入請求的形狀
//
// 什麼時候被執行：每次有人打 POST /auth/login。
//
// **為什麼不直接重用 RegisterDto？** 兩個理由，都跟 @MinLength(8) 有關：
//
//   1. 密碼規則是會變的。今天要求 8 碼，明天改成 12 碼 —— 如果登入也套用
//      新規則，所有用舊密碼的人會被鎖在門外，而他們的密碼明明是對的。
//      **驗證「新密碼合不合規」和驗證「這個密碼對不對」是兩件事。**
//   2. 400 這個回應本身會說話。登入時回「密碼至少要 8 碼」，等於免費
//      告訴攻擊者你的密碼規則 —— 而登入的失敗回應應該盡量少說（見 auth.service.ts）。
//
// 所以這裡只有 @IsString() + @IsNotEmpty()：**有給就好，對不對交給 service 判斷**。
//
// 下一站：src/auth/entities/user.entity.ts（回應的形狀）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: '電子信箱',
    example: 'someone@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '密碼',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
