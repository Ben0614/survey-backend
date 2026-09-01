// ============================================================
// [教學] login.entity.ts —— 登入回應的形狀（Ch10 新增）
//
// 什麼時候被執行：**執行期完全不被執行**，同 user.entity.ts ——
// 它只是 Swagger 的登記表，/docs 上 POST /auth/login 那份契約靠它產生。
//
// 這個檔案存在的理由，就是 Ch10 這一輪做的事：
// Ch9 時註冊與登入回一模一樣的東西，所以共用 UserEntity；
// Ch10 讓登入改回 { accessToken }，**兩支端點從此不是同一種形狀**。
//
// 開發時實際踩過的路：一開始是把 accessToken 直接加在 UserEntity 上，
// 結果**兩支端點的文件同時說謊，而且方向相反** ——
// register 承諾一個它不會回的 accessToken，login 承諾四個它不會回的欄位。
// 而 entity 執行期不被執行，所以 tsc 綠、lint 綠、e2e 綠、/docs 看起來也正常。
//
// 判準：**一份 entity 對應一種回應。** 想共用之前先確認兩邊真的一樣。
//
// 下一站：src/auth/auth.service.ts（唯一碰資料庫、也是唯一做決定的地方）
// ============================================================

import { ApiProperty } from '@nestjs/swagger';

export class LoginEntity {
  @ApiProperty({
    description: 'JWT 存取權杖',
    example: 'eyJhbGci.......',
  })
  accessToken: string;
}
