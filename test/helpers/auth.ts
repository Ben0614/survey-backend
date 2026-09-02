// ============================================================
// [教學] test/helpers/auth.ts —— 測試要一個能通過驗票口的身分
//
// 什麼時候被執行：由各 e2e 測試檔在 beforeEach 裡呼叫（同 reset-db.ts）。
//
// 為什麼抽成 helper：Ch10 輪 2 掛上全域 guard 之後，surveys / questions /
// responses / errors / swagger 五支測試裡的每一個請求都要帶 token。
// 不抽的話同一段「註冊 + 登入」會複製五份，而 Ch11 加角色、Ch12 要
// 「換一個人來打同一支端點」時，得在五個地方各改一次。
//
// **時機必須是 beforeEach 不是 beforeAll**，因為 reset-db 的 TRUNCATE
// 清單裡有 "User"。而這個錯在輪 2 是**看不見的**：token 自我驗證、
// guard 不查資料庫，所以配上一個已經被刪掉的使用者，測試照樣全綠 ——
// 要到輪 3 拿 sub 去填 Survey.ownerId 時才會炸成一個莫名其妙的外鍵錯誤。
//
// 前提資料一律走 HTTP，不用 prisma.user.create ——
// 後者存的是明文、繞過被測的程式碼（同 auth.e2e-spec.ts 檔頭）。
//
// 下一站：test/health.e2e-spec.ts（最小的一個 E2E 測試）
// ============================================================

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

/** 登入成功時的回應形狀（對應 src/auth/entities/login.entity.ts）。 */
interface LoginBody {
  accessToken: string;
}

/**
 * 註冊一個使用者並登入，回傳可以直接放進 Authorization 標頭的 token。
 *
 * email 有預設值，所以多數呼叫端一個參數都不用傳；
 * 需要「另一個人」時才傳（Ch12 的「只能改自己的問卷」會用到）。
 */
export async function registerAndLogin(
  app: INestApplication<App>,
  email = 'e2e-user@example.com',
  password = 'zxcv1234',
): Promise<string> {
  // [教學] 兩支請求都寫 .expect(...)，不是為了「測試」它們 ——
  // auth.e2e-spec.ts 已經在測了。它在這裡的作用是**把失敗擋在源頭**：
  //
  // 少了它的話，註冊若因為 email 重複而回 409，這個函式會安靜地回傳
  // undefined，然後某支測試在三十行之後報「GET /surveys 回 401」——
  // 而真正的原因在這裡。前提資料出問題就該當場紅，不要拖到斷言那一行。
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);

  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return (res.body as LoginBody).accessToken;
}

/**
 * 把 token 包成 supertest 的 .set() 要的那兩個參數。
 *
 * 用法：`.set(...authHeader(token))`
 */
// [教學] 回傳型別寫成 [string, string] 而不是 string[]，是因為 .set()
// 收的是兩個參數 —— 展開一個長度不定的陣列，tsc 不會讓你過。
// 這種「固定長度、每格型別確定」的陣列叫 tuple。
export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
