// ============================================================
// [教學] user.entity.ts —— 註冊回應的形狀（Ch7 的規則）
//
// Ch9 時這裡寫的是「註冊與登入**共用**」—— Ch10 之後那句話不成立了。
// 登入改回 { accessToken }，形狀由 login.entity.ts 描述；
// 這一份現在只有 register 在用（輪 3 的 GET /auth/me 會是第二個）。
//
// 什麼時候被執行：**執行期完全不被執行。** 它只是 Swagger 的登記表，
// /docs 上那份契約靠它產生。這件事在這一章特別重要：
//
//   **entity 不會過濾任何東西。**
//   這裡沒有寫 passwordHash，不代表它不會被回出去 ——
//   真正擋住它的是 src/prisma/prisma.service.ts 的全域 omit。
//   entity 少寫一個欄位只會讓「文件漏講」，多寫一個只會讓「文件說謊」。
//
// 開發時實際踩過後者：這裡一度寫了 passwordHash，於是文件承諾了一個
// 不存在的欄位，而 tsc 綠、測試綠、/docs 上看起來完全正常。
//
// 判準：**先決定 service 實際回什麼，再讓 entity 如實描述它。**
//
// 下一站：src/auth/entities/login.entity.ts（同一個 auth，為什麼要兩份 entity）
// ============================================================

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
