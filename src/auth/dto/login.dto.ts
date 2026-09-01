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
