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
import { ErrorResponseEntity } from '../common/entities/error-response.entity';

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
  @Post('register')
  create(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用戶登入' })
  @ApiOkResponse({ description: '登入成功', type: UserEntity })
  @ApiBadRequestResponse({ description: '參數錯誤', type: ErrorResponseEntity })
  @ApiUnauthorizedResponse({
    description: '帳號或密碼錯誤',
    type: ErrorResponseEntity,
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
