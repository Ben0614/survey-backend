// ============================================================
// [教學] auth.e2e-spec.ts —— 註冊與登入的 E2E（Ch9 建立，Ch10 改寫登入那一組）
//
// 跑法：pnpm test:e2e -- test/auth.e2e-spec.ts
//
// 這一支有三條「主角」測試，各自守著一個沒有症狀的錯誤：
//
//   「201 的回應不含 passwordHash」
//       用 Object.keys(body).sort() 比對**整個欄位集合**，而不是只寫
//       not.toHaveProperty('passwordHash')。後者只要字串拼錯（passwordhash、
//       或哪天欄位改名）就永遠是綠的，而雜湊每天照樣送出去。
//       列「該有的」比列「不該有的」可靠 —— 前者不依賴你把名字拼對。
//
//   「email 沒註冊過 → message 與密碼錯誤時完全相同」
//       它是 user enumeration 唯一的守衛，而且刻意**比對兩個回應**
//       而不是寫死字串：改文案時測試不用跟著改，但兩邊分岔立刻紅。
//       已實測 —— 把其中一支的訊息改掉，剛好只有這一條變紅。
//
//   「回傳的 accessToken 解開後 sub 等於註冊時那個使用者的 id」（Ch10）
//       它守的是 signAsync 漏掉 await。那時回應是 {"accessToken":{}} ——
//       key 集合仍然只有 accessToken，所以上面那條「body 只有一個欄位」是**綠的**；
//       tsc 也綠、lint 也綠（Promise 有被指派也有被 return，不算浮空）。
//       只有把 token 真的解開才抓得到。
//       **「形狀對」和「值對」是兩條測試，一條蓋不了另一條。**
//
// 前提資料一律用 POST /auth/register 產生，不用 prisma.user.create ——
// 後者存的是明文、繞過被測的程式碼（Ch5 假綠的第九種）。
//
// 下一站：test/auth-guard.e2e-spec.ts（登入拿到票之後，誰在門口驗它）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';

interface AuthRegisterBody {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthLoginBody {
  accessToken: string;
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

const decodeFunc = (body: AuthLoginBody) => {
  return JSON.parse(
    Buffer.from(body.accessToken.split('.')[1], 'base64').toString(),
  ) as { sub: string; iat: number; exp: number };
};

describe('Auth (e2e)', () => {
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

  describe('POST /auth/register', () => {
    it('合法的 email 與密碼 → 201，回傳 id、email、createdAt、updatedAt', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'zxcv1234',
        })
        .expect(201);

      const body = res.body as AuthRegisterBody;
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'updatedAt',
      ]);
      expect(body.email).toBe('user@example.com');
      expect(body.id).toEqual(expect.any(String));
    });

    it('201 的回應不含 passwordHash', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'zxcv1234',
        })
        .expect(201);

      const body = res.body as AuthRegisterBody;
      expect(body.email).toBe('user@example.com');
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'updatedAt',
      ]);
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('資料庫存的是 bcrypt 雜湊，不是明文密碼', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'zxcv1234',
        })
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { email: 'user@example.com' },
        omit: { passwordHash: false },
      });

      expect(user?.passwordHash).not.toBe('zxcv1234');
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('email 已經註冊過 → 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(409);
      const body = res.body as ErrorBody;
      expect(body.error.code).toBe('CONFLICT');
    });

    it('email 格式不合法 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'asd', password: 'zxcv1234' })
        .expect(400);

      const body = res.body as ErrorBody;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('密碼少於 8 碼 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv' })
        .expect(400);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /auth/login', () => {
    it('正確的 email 與密碼 → 200，body 只有 accessToken 一個欄位', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(200);

      const body = res.body as AuthLoginBody;
      expect(Object.keys(body).sort()).toEqual(['accessToken']);
      expect(body.accessToken).toEqual(expect.any(String));
    });

    it('回傳的 accessToken 解開後 sub 等於註冊時那個使用者的 id', async () => {
      const user = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const userBody = user.body as AuthRegisterBody;

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(200);

      const resBody = res.body as AuthLoginBody;
      const payload = decodeFunc(resBody);
      expect(payload.sub).toBe(userBody.id);
    });

    it('回傳的 accessToken 裡不含 passwordHash', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(200);

      const body = res.body as AuthLoginBody;
      const payload = decodeFunc(body);
      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    });

    it('密碼錯誤 → 401，code 是 UNAUTHORIZED，且不回 accessToken', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrongpassword' })
        .expect(401);

      const body = res.body as ErrorBody;
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(Object.keys(body).sort()).toEqual(['error']);
    });

    it('email 沒註冊過 → 401，message 與密碼錯誤時完全相同', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      // 兩條失敗路徑各打一次：已註冊但密碼錯 / 根本沒註冊
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrongpassword' })
        .expect(401);

      const noSuchUser = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'other@example.com', password: 'wrongpassword' })
        .expect(401);

      expect((noSuchUser.body as ErrorBody).error.code).toBe('UNAUTHORIZED');

      // 這一條才是這個測試的主角：兩條路徑的 message 必須一字不差。
      // 比對兩者、而不是寫死字串 —— 改文案時測試不用跟著改，
      // 但只要有人讓兩邊分岔（user enumeration 就是這樣漏的），它立刻紅。
      expect((noSuchUser.body as ErrorBody).error.message).toBe(
        (wrongPassword.body as ErrorBody).error.message,
      );
    });

    it('email 格式不合法 → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'asd', password: 'zxcv1234' })
        .expect(400);

      const body = res.body as ErrorBody;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
