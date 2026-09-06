// ============================================================
// [教學] register.dto.ts —— 註冊請求的形狀與驗證規則
//
// 什麼時候被執行：每次有人打 POST /auth/register，ValidationPipe 拿它擋一次。
// DTO 與 Model 是兩件事這個觀念見 create-survey.dto.ts 檔頭，這裡不重複。
//
// 這份 DTO 唯一特別的是 @MaxLength(72)：**那是 bcrypt 演算法的硬上限**，
// 超過 72 bytes 的部分會被直接忽略。不設上限的話，兩個前 72 bytes 相同、
// 後面不同的長密碼會被視為同一個密碼 —— 那是規格，不是實作 bug。
// 所以它不是「防止有人塞小說進來」那種上限，拿掉會有實際後果。
//
// 另外注意：class-validator **沒有「必填」這個宣告**。
// 沒寫 @IsOptional() 就是必填，機制是「驗證裝飾器對 undefined 也會判失敗」——
// 所以「完全不給 email」和「email 格式錯」拿到的是同一句訊息。
//
// 下一站：src/auth/dto/login.dto.ts（為什麼登入不重用這一份）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: '電子信箱',
    example: 'someone@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '密碼（bcrypt 的硬上限是 72 字元）',
    minLength: 8,
    maxLength: 72,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
