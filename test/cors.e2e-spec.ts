// ============================================================
// [教學] cors.e2e-spec.ts —— 瀏覽器願不願意讓 JS 讀到回應（Ch14 建立，Ch16 擴充）
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
// 打的都是 @Public() 的端點 —— 選一支要認證的，就得同時處理 401，
// 而那跟 CORS 無關；兩個變數混在一起，紅燈時分不出是哪一個壞了。
//
// **白名單本身不是寫死的**（Ch16）：值來自環境變數 CORS_ORIGIN，
// 而測試用的那份由 test/setup-env.ts 灌進去 —— 不是讀你本機的 .env。
// 理由見那個檔案裡的說明：斷言的值與被測的設定要一起進版控，才看得懂為什麼紅。
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
    // 下面每一條都會拿不到任何 Access-Control-* 標頭 —— CORS 就成了沒有測試守著的設定。
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

  // [教學] ⚠️ **這條測試的名稱被改過兩次，而兩次都是對的** —— 因為它驗的東西
  // 取決於 origin 給的是哪一種型別，而 Ch16 把型別換掉了。
  //
  //   Ch14  origin: 'http://localhost:3000'（字串）
  //         cors 一律回那個固定值，**根本不看請求的 Origin** ——
  //         沒有「不匹配」這回事，所以當時的名稱只能是
  //         「換一個 Origin 來問，Allow-Origin 不會跟著變」。
  //
  //   Ch16  origin: ['http://localhost:3000', 'https://survey.example.com']（陣列）
  //         cors 改成真的比對請求的 Origin：中了就把**它**原樣回去，
  //         沒中就**完全不加這個標頭** —— 於是「不在白名單」才第一次成立。
  //
  // 教訓不是「當初寫錯了」，而是：**測試名稱的對錯是綁在實作的形狀上的**，
  // 換了形狀就要回頭讀一次那些名稱還成不成立。
  //
  // 不管哪一版，真正擋下來的都是**瀏覽器**：它拿 Access-Control-Allow-Origin
  // 跟自己的 origin 比，不合就不讓 JS 讀到回應。伺服器這一端從頭到尾都照常執行。
  //
  // 這條是 origin: true（反射請求的 origin）唯一的偵測器：
  // 那樣寫的話 evil.example.com 會拿到自己的 origin，只有這條會紅。
  it('不在白名單的 Origin，回應不帶 Access-Control-Allow-Origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(res.headers).not.toHaveProperty('access-control-allow-origin');
  });

  // [教學] 白名單有兩個 origin，這條問的是第二個（Ch16）。
  //
  // ⚠️ **逗號分隔是環境變數的格式，不是 HTTP 標頭的格式。**
  // Origin 標頭永遠只有一個值（就是「我是誰」），瀏覽器不會送逗號分隔的清單。
  // 所以「測第二個」的意思是拿第二個當 Origin 去問，不是把兩個串起來送。
  //
  // 這條是「只取了 origins[0]」唯一的偵測器 —— 那樣寫的話這個檔案其餘的測試全綠。
  // 期望值刻意自己寫一次，不去 import test/setup-env.ts 裡那個常數：
  // 兩邊讀同一個變數的話，值被改錯了測試照樣綠。
  it('清單裡的第二個 origin，也拿得到 Access-Control-Allow-Origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://survey.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(
      'https://survey.example.com',
    );
  });
});
