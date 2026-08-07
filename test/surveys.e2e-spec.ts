// ============================================================
// [教學] surveys.e2e-spec.ts —— 一個會「寫入」資料的測試長什麼樣
//
// 跟 health.e2e-spec.ts 的差別只有一個，但很關鍵：
// 這裡的測試會建立資料，所以每個案例開始前都要把資料庫清乾淨。
//
// 跑法：pnpm test:e2e -- test/surveys.e2e-spec.ts
//
// 動線終點。回到 src/main.ts 再走一次，看看是不是都串起來了。
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';

// [教學] supertest 的 res.body 型別是 any（它不可能知道你的 API 回什麼）。
// 專案的 ESLint 規則禁止在 any 上直接取欄位，所以宣告一個形狀轉一次。
// 這個型別只是測試自己的斷言用，不是 API 契約 —— 真正的契約 Ch7 用 Swagger 產生。
interface SurveyBody {
  id: string;
  title: string;
  status: string;
}

describe('Surveys (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // 沒有這行，測試裡的驗證不會生效 —— 手動打 API 回 400、測試卻回 201。
    setupApp(app);
    await app.init();

    // [教學] app.get() 從已經建好的應用裡把某個零件拿出來。
    // 測試需要它來直接操作資料庫（準備前提資料、清資料），
    // 這是唯一適合繞過 HTTP 的場合。
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // [教學] beforeEach 是「每一個 it 開始前都跑一次」。
  //
  // 用 beforeEach 而不是 beforeAll，是為了讓每個測試都從空的資料庫開始。
  // 共用資料會讓測試互相污染：A 刪掉某筆、B 就找不到，而且 Jest
  // 不保證執行順序 —— 症狀是「單獨跑會過、一起跑會失敗」。
  beforeEach(async () => {
    await resetDb(prisma);
  });

  describe('POST /surveys', () => {
    it('建立問卷後回 201，狀態預設為 DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .post('/surveys')
        .send({ title: '員工滿意度調查' })
        .expect(201);

      expect(res.body).toMatchObject({
        title: '員工滿意度調查',
        status: 'DRAFT',
      });
      // id 由 Prisma 產生（不是資料庫），這裡順便確認它真的有值。
      expect((res.body as SurveyBody).id).toEqual(expect.any(String));
    });

    it('title 是空字串時回 400', async () => {
      await request(app.getHttpServer())
        .post('/surveys')
        .send({ title: '' })
        .expect(400);
    });

    it('沒有 title 時回 400', async () => {
      await request(app.getHttpServer()).post('/surveys').send({}).expect(400);
    });

    // [教學] 這一題測的是 whitelist: true。
    // 前端硬送 status，DTO 沒宣告它 → 被無聲丟掉 → 建出來還是 DRAFT。
    // 不是回 400，是「當作沒看到」——這正是 whitelist 的行為。
    it('偷塞 DTO 沒宣告的 status 會被忽略', async () => {
      const res = await request(app.getHttpServer())
        .post('/surveys')
        .send({ title: '想偷跑的問卷', status: 'PUBLISHED' })
        .expect(201);

      expect((res.body as SurveyBody).status).toBe('DRAFT');
    });
  });

  describe('GET /surveys', () => {
    it('沒有任何問卷時回空陣列', async () => {
      const res = await request(app.getHttpServer())
        .get('/surveys')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('回傳所有問卷，最新的在前面', async () => {
      // [教學] 前提資料直接用 prisma 建，不透過 API。
      //
      // 因為這個測試要驗的是「列表」，不是「建立」。用 API 準備資料
      // 會讓這個測試在 POST 壞掉時也跟著紅，看不出真正的問題在哪。
      // [教學] createdAt 這裡明確指定，不讓 @default(now()) 決定。
      // 兩筆連續建立可能落在同一毫秒（欄位是 TIMESTAMP(3)），
      // 那樣排序結果就不確定，測試會偶爾紅一次 —— 最惹人厭的那種 bug。
      await prisma.survey.create({
        data: { title: '第一份', createdAt: new Date('2026-01-01') },
      });
      await prisma.survey.create({
        data: { title: '第二份', createdAt: new Date('2026-01-02') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys')
        .expect(200);

      const surveys = res.body as SurveyBody[];
      expect(surveys).toHaveLength(2);
      expect(surveys[0].title).toBe('第二份');
    });
  });
});
