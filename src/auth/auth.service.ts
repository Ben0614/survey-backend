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
