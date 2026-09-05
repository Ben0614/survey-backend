// ============================================================
// [教學] auth-guard.e2e-spec.ts —— 驗票口本身的 E2E（Ch10 輪 2）
//
// 跑法：pnpm test:e2e -- test/auth-guard.e2e-spec.ts
//
// 它跟 errors.e2e-spec.ts 是同一種測試：**不測某一支端點，測所有端點
// 共同的那一層**。差別只在那邊測的是 Filter（回應出去的路上），
// 這邊測的是 Guard（請求進來的路上）。
//
// 用 GET /surveys 當白老鼠純粹因為它最便宜（不必準備任何前提資料）——
// 換成任何一支受保護的端點，結論都一樣。
//
// 主角是「用別的 secret 簽出來的 token → 401」。它守的是 guard 裡
// verifyAsync 被寫成 decode：兩者都拿得出 payload，但 decode 不需要 secret，
// 所以它**不可能**知道這張票是不是你簽的，也不看 exp。
// 用了 decode 的話任何人都能偽造任何身分，而 tsc 綠、lint 綠、
// 其餘 104 條測試全綠（它們用的都是真 token）、手動打 API 也正常。
// **抓得到它的只有這一條刻意送假票的測試。**
//
// 「已過期的 token」抓的是**另一件事**：decode 兩條都會漏，但
// 「有驗簽章、忘了驗 exp」只有那條抓得到。
//
// 合法的 token 一律走 registerAndLogin（真實端點），不自己 sign ——
// 自己造一張「應該合法」的票等於繞過 AuthService.login。
// 反過來，不合法的票只能自己造，因為真實端點不可能發給你一張壞票。
//
// 下一站：test/errors.e2e-spec.ts（同一層的另一邊：例外出去時誰在翻譯）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { JwtService } from '@nestjs/jwt';
import { registerAndLogin, authHeader } from './helpers/auth';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

describe('AuthGuard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    setupApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  describe('沒帶 token', () => {
    it('GET /surveys 不帶 Authorization → 401', async () => {
      await request(app.getHttpServer()).get('/surveys').expect(401);
    });

    it('GET /health 不帶 Authorization → 200', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });

    it('POST /auth/register 不帶 Authorization → 201', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'zxcv1234',
        })
        .expect(201);
    });

    it('POST /auth/login 不帶 Authorization → 200', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'zxcv1234',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'zxcv1234',
        })
        .expect(200);
    });
  });

  describe('token 有問題', () => {
    it('用別的 secret 簽出來的 token → 401', async () => {
      const forged = new JwtService({ secret: 'not-the-real-secret' }).sign({
        sub: 'whatever',
      });
      await request(app.getHttpServer())
        .get('/surveys')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('已過期的 token → 401', async () => {
      const jwt = app.get(JwtService);
      const expired = jwt.sign({ sub: 'x' }, { expiresIn: '-1s' });
      await request(app.getHttpServer())
        .get('/surveys')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('不是三段式的字串當 token → 401 而不是 500', async () => {
      await request(app.getHttpServer())
        .get('/surveys')
        .set('Authorization', 'Bearer not-a-jwt-token')
        .expect(401);
    });

    it('只給 token、沒有 Bearer 前綴 → 401', async () => {
      const token = await registerAndLogin(app);

      await request(app.getHttpServer())
        .get('/surveys')
        .set('Authorization', token)
        .expect(401);
    });

    it('不帶 token 打 /auth/me，code 是 UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('用別的 secret 簽的 token 打 /auth/me，code 一樣是 UNAUTHORIZED', async () => {
      const forged = new JwtService({ secret: 'not-the-real-secret' }).sign({
        sub: 'whatever',
      });

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set(...authHeader(forged))
        .expect(401);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    // [教學] **第三種失敗（票有效、但那個人已經被刪掉）刻意不在這裡測。**
    // test/auth.e2e-spec.ts 的「token 的 sub 指向已被刪除的使用者 → 401」
    // 已經完整守著它，連 error.code 都驗了。
    //
    // 這一段是 Ch14 輪 ② 留下的紀錄：那一輪開工前只掃了這個檔案的 9 條
    // （當時全部只斷言狀態碼），就下結論「三種失敗都沒有測試守著」——
    // 漏看了另一個檔案裡名字完全不同的那一條。差點多寫一條重複的測試。
    //
    // ch05 那條「測試數字漲了不代表覆蓋增加了」在這裡有第二種形狀：
    // **不只可能沒增加，還可能是重複的。** 回頭補測試之前，先確認沒人補過。
  });

  describe('token 正確', () => {
    it('帶合法 token 打 GET /surveys → 200', async () => {
      const token = await registerAndLogin(app);
      await request(app.getHttpServer())
        .get('/surveys')
        .set(...authHeader(token))
        .expect(200);
    });
  });
});
