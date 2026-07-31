// ============================================================
// [教學] health.e2e-spec.ts —— 自動驗證整條路都通
//
// 這個檔案做的事，跟你手動開 api.http 點 Send Request 一模一樣，
// 只是改由程式執行、而且會自己檢查結果對不對。
//
// 跑法：pnpm test:e2e
// 它會連真實資料庫（.env.test 指定的 Neon test branch），不是假資料。
//
// 從 Ch2 開始，每一章的驗收標準就是「該章的 E2E 測試綠燈」，
// 所以這個檔案的形狀你之後會反覆用到。
//
// 動線終點。回到 main.ts 再走一次，看看是不是都串起來了。
// ============================================================

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
// [教學] 測試檔的三層結構，看懂這三個字就看得懂所有測試檔：
//   describe —— 一組相關測試的分類標題
//   it       —— 一個具體的測試案例（一句話描述期望的行為）
//   expect   —— 實際的斷言，不符合就讓測試失敗
//
// beforeAll / afterAll 則是「這組測試開始前 / 全部結束後各做一次」。
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // [教學] 這三行等同於 main.ts 的 NestFactory.create()，
    // 差別是它建立的應用不會真的去佔用 3100 port，只存在於記憶體中。
    // Test.createTestingModule 也讓你有機會替換掉某些零件（之後才會用到）。
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

  // [教學] 測試名稱要寫成「期望的行為」而不是「測什麼函式」。
  // 將來測試失敗時，這行字就是你看到的錯誤標題。
  it('GET /health 回報服務與資料庫都正常', async () => {
    // [教學] supertest 負責發出假的 HTTP 請求。
    // .expect(200) 是第一道斷言：狀態碼不是 200 就直接失敗。
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    // [教學] toMatchObject 是「至少包含這些欄位」，不要求完全相等。
    // 這裡刻意不比對 timestamp —— 它每次都不一樣，寫進斷言就永遠測不過。
    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });
});
