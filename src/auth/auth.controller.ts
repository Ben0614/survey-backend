// ============================================================
// [教學] auth.controller.ts —— 註冊與登入兩支端點
//
// 什麼時候被執行：有人打 POST /auth/register 或 POST /auth/login 時。
// 同其他 controller，它不碰 prisma，只負責「收參數、叫 service、回結果」。
//
// 這個檔案有一件前面八章都沒出現過的事：**@HttpCode(HttpStatus.OK)**。
// @Post 的預設狀態碼是 201 Created，而登入**沒有建立任何資源** ——
// 它只是驗證身分，所以要覆蓋成 200。註冊則吃預設值 201，不必寫。
// （surveys.controller.ts 那段「要覆蓋才需要 @HttpCode()」講的就是這一刻。）
//
// 三個回應裝飾器怎麼挑：**這支端點實際會回哪些狀態碼，就標哪幾個**。
// register 是 201/409/400，login 是 200/401/400 —— 兩支各三個，但只有 400 重疊。
// 查漏的方法不是靠記憶，是問「這支端點有幾條路可以走出去」。
//
// **Ch10 之後兩支的成功回應不再是同一種形狀**：register 是 UserEntity、
// login 是 LoginEntity。這兩個 type: 是純文件，service 實際回什麼跟它們無關 ——
// 分岔了也沒有任何工具會叫（理由與踩過的坑見 entities/login.entity.ts 檔頭）。
//
// **Ch10 輪 2：兩支都標了 @Public()。** 全域 guard 是「預設拒絕」，
// 而這兩支是不可能要求先登入的 —— 沒有它們就沒有人拿得到 token。
// 漏標任何一支的後果是服務把自己鎖死：沒有人能註冊、或沒有人能登入，
// 而且**你連修復用的請求都發不出去**。
//
// 下一站：src/auth/dto/register.dto.ts（body 進來之前先被誰檢查）
// ============================================================

import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserEntity } from './entities/user.entity';
import { LoginEntity } from './entities/login.entity';
import { ErrorResponseEntity } from '../common/entities/error-response.entity';
import { Public } from './decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: '用戶註冊' })
  @ApiCreatedResponse({ description: '註冊成功', type: UserEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @ApiConflictResponse({
    description: 'email已被註冊',
    type: ErrorResponseEntity,
  })
  @Public()
  @Post('register')
  create(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用戶登入' })
  @ApiOkResponse({ description: '登入成功', type: LoginEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @ApiUnauthorizedResponse({
    description: '帳號或密碼錯誤',
    type: ErrorResponseEntity,
  })
  @Public()
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
