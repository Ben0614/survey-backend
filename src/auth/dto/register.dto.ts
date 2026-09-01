import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
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
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
