// ============================================================
// [教學] cors.e2e-spec.ts —— 瀏覽器願不願意讓 JS 讀到回應（Ch14）
//
// 跑法：pnpm test:e2e -- test/cors.e2e-spec.ts
//
// 跟 errors.e2e-spec.ts 同一個定位：**不測某一支端點，測所有端點共同的那一層**。
// 差別在那一層的位置 —— filter 在應用內部，CORS 在應用外面。
//
// **CORS 不是後端擋下請求，是瀏覽器擋下回應。**
// 帶 Origin 的請求照樣進到 controller、照樣執行（如果那是 DELETE，東西已經刪了）；
// 伺服器只是在回應上多貼幾個 Access-Control-* 標頭，瀏覽器拿它跟自己的 origin 比，
// 不合就不讓 JS 讀到那份回應。所以症狀是「Console 一片紅，但 curl 完全正常」——
// 撞到這個時不要去改 guard 或 service，那裡沒有 bug。
//
// 這支是全專案最輕的 e2e：**不連資料庫、不要 token、沒有 beforeEach**。
// 三條都打 @Public() 的 /health —— 選一支要認證的端點，就得同時處理 401，
// 而那跟 CORS 無關；兩個變數混在一起，紅燈時分不出是哪一個壞了。
//
// 下一站：test/swagger.e2e-spec.ts（同樣不驗某一支端點，但驗的是文件有沒有說謊）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // [教學] **這一行就是「enableCors 該放 main.ts 還是 setup-app.ts」的答案。**
    //
    // 放 main.ts 的話，測試環境（走 createNestApplication）永遠不會執行到它，
    // 下面三條會全部拿不到任何 Access-Control-* 標頭 —— CORS 就成了沒有測試守著的設定。
    // setup-app.ts 的定位本來就是「正式環境與測試共用的全域設定」，CORS 屬於那一類。
    //
    // 對照：src/swagger.ts 刻意**不**放進 setup-app（理由見它的檔頭）——
    // 判準是「它產出的是行為還是文件」。
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('帶 Origin 的請求，回應的 Access-Control-Allow-Origin 等於那個 origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });

  it('preflight 回 204，且 Access-Control-Allow-Headers 含 authorization、content-type', async () => {
    const res = await request(app.getHttpServer())
      .options('/surveys')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain(
      'authorization',
    );
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain(
      'content-type',
    );
  });

  // [教學] 直覺會以為「不在白名單就不回這個標頭」—— **實測不是這樣**。
  // origin 給字串時，cors 中介層一律回那個固定值，根本不看請求的 Origin 是什麼。
  //
  // 真正擋下來的是**瀏覽器**：它拿 Access-Control-Allow-Origin 跟自己的 origin 比，
  // 不相等就不讓 JS 讀到回應。伺服器這一端從頭到尾都照常執行。
  //
  // 所以這條驗的是「**答案不會跟著問的人變**」，而它剛好是兩種寫錯的偵測器：
  //   origin: true → 回 https://evil.example.com（反射請求的 origin）→ 紅
  //   origin: '*'  → 回 *                                          → 紅
  //
  // 第一條抓得到 '*'，抓不到 true；這一條兩種都抓得到。
  it('換一個 Origin 來問，Access-Control-Allow-Origin 不會跟著變', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });
});
