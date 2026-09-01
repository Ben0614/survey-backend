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

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

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
    it('正確的 email 與密碼 → 200，回傳 id、email、createdAt、updatedAt', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(200);

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

    it('200 的回應不含 passwordHash', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'zxcv1234' })
        .expect(200);

      const body = res.body as AuthRegisterBody;
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'updatedAt',
      ]);
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('密碼錯誤 → 401，code 是 UNAUTHORIZED', async () => {
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
