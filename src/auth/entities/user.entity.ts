import { ApiProperty } from '@nestjs/swagger';

export class UserEntity {
  @ApiProperty({
    description: '用戶 id（cuid）',
    example: 'clx1a2b3c0000abcd1234efgh',
  })
  id: string;

  @ApiProperty({
    description: '電子信箱',
    example: 'someone@example.com',
  })
  email: string;

  @ApiProperty({ description: '建立時間', type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;
}
