import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * E2E 測試：不 mock 任何東西，把整個 Nest 應用（含真實資料庫連線）跑起來，
 * 用 HTTP 請求驗證行為。這是後端最有價值的測試型態 ——
 * 它驗證的是「使用者實際會拿到什麼」，而不是「某個函式內部怎麼運作」。
 *
 * beforeAll 而非 beforeEach：建立應用實例與資料庫連線很慢，
 * 整個檔案共用一個實例即可。
 */
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // 一定要 close，否則資料庫連線池不會釋放，Jest 會卡住不結束。
    await app.close();
  });

  it('GET /health 回報服務與資料庫都正常', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });
});
