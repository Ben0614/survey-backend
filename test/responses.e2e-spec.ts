// ============================================================
// [教學] responses.e2e-spec.ts —— 前提資料疊到三層時長什麼樣
//
// 跑法：pnpm test:e2e -- test/responses.e2e-spec.ts
//
// 跟前面幾個 e2e 檔的差別有兩個：
//
// 1. **前提資料有三層**：問卷 → 題目 → 作答。而且問卷要先是 DRAFT 才能加題目、
//    再改成 PUBLISHED 才能被填答 —— 這裡直接用 prisma 建成 PUBLISHED，
//    繞過那條規則（測試可以，API 不行，見 ch05 的「決策取捨」）。
//
// 2. **Response 沒有任何可讀的欄位**（沒有 title），所以認人要靠**建立時拿回的 id**。
//    前面幾個檔案都能用 title 分辨「哪一筆是哪一筆」，這裡不行。
//
// 還有一條是專案第一次的併發測試（在 questions.e2e-spec.ts），
// 那條的結論寫在 ch05 坑 #5：**綠不代表修好了。**
//
// **Ch12 在這裡留了一條反面對照**：「任何人都能填別人的問卷 → 201」。
// 這一輪的風險有一半是保護過頭 —— 把 POST /responses 也加上擁有權檢查的話，
// 這個問卷平台就沒有人能填問卷了，而其他測試不會叫。
//
// 另外還有一條守契約的：「GET /responses/:id 的回應不含 survey 欄位」。
// findOne 為了授權把 survey.ownerId 撈了進來，忘了剔除就會靜默地多一個欄位 ——
// 而 ResponseEntity 沒有 swagger 一致性測試，沒有人會替你發現。
//
// 下一站：test/auth.e2e-spec.ts（第一次測「回應裡不該有什麼」）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { registerAndLogin, authHeader } from './helpers/auth';
import { JwtService } from '@nestjs/jwt';

// [教學] supertest 的 res.body 型別是 any，而專案的 ESLint 禁止在 any 上直接取欄位，
// 所以宣告形狀轉一次（同 surveys.e2e-spec.ts 開頭那批）。
// 這些型別只是測試自己的斷言用，不是 API 契約 —— 真正的契約 Ch7 用 Swagger 產生。
//
// createdAt 是 string 不是 Date：它經過 JSON 序列化，回來就是 ISO 字串了。
interface ResponseBody {
  id: string;
  surveyId: string;
  createdAt: string;
}

interface ResponseBodyList {
  data: ResponseBody[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

// 單筆那支才會用到 —— 它是唯一會帶 answers 的端點（列表刻意不帶）。
interface ResponseWithAnswersBody extends ResponseBody {
  answers: {
    id: string;
    questionId: string;
    content: string;
    question: { id: string; title: string; order: number };
  }[];
}

interface LoginBody {
  accessToken: string;
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

describe('Responses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;

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
    authToken = await registerAndLogin(app);
    userId = app.get(JwtService).decode<{ sub: string }>(authToken).sub;
  });

  describe('POST /surveys/:surveyId/responses', () => {
    it('提交作答後回 201，資料庫裡有 1 筆 Response 與 2 筆 Answer', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      const question1 = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const question2 = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'TEXT',
          order: 1,
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: question1.id,
              content: '選項1',
            },
            {
              questionId: question2.id,
              content: '第二題',
            },
          ],
        })
        .expect(201);

      expect(await prisma.response.count()).toBe(1);
      expect(await prisma.answer.count()).toBe(2);
    });

    it('問卷是 DRAFT 時回 409，而且沒有寫入任何 Response', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '未發布問卷',
          ownerId: userId,
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: question.id,
              content: '選項1',
            },
          ],
        })
        .expect(409);

      expect(await prisma.response.count()).toBe(0);
    });

    it('問卷不存在時回 404', async () => {
      await request(app.getHttpServer())
        .post('/surveys/nonexistent-id/responses')
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: 'nonexistent-id',
              content: '選項1',
            },
          ],
        })
        .expect(404);

      expect(await prisma.response.count()).toBe(0);
    });

    it('answers 是空陣列時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [],
        })
        .expect(400);

      expect(await prisma.response.count()).toBe(0);
    });

    it('answers 裡的物件缺 content 時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: question.id,
            },
          ],
        })
        .expect(400);

      expect(await prisma.response.count()).toBe(0);
    });

    it('questionId 屬於別份問卷時回 400，且沒有寫入任何 Response', async () => {
      const survey1 = await prisma.survey.create({
        data: {
          title: '已發布問卷一',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      const survey2 = await prisma.survey.create({
        data: {
          title: '已發布問卷二',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      const question2 = await prisma.question.create({
        data: {
          surveyId: survey2.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey1.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: question2.id,
              content: '選項3',
            },
          ],
        })
        .expect(400);

      expect(await prisma.response.count()).toBe(0);
    });

    it('questionId 不存在時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷一',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: 'nonexistent-id',
              content: '選項3',
            },
          ],
        })
        .expect(400);

      expect(await prisma.response.count()).toBe(0);
    });

    it('同一個 questionId 送兩次時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷一',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            {
              questionId: question.id,
              content: '選項1',
            },
            {
              questionId: question.id,
              content: '選項2',
            },
          ],
        })
        .expect(400);

      expect(await prisma.response.count()).toBe(0);
    });

    it('任何人都能填別人的問卷 → 201', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      const question1 = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const email = 'new-email@example.com';
      const password = 'newpassword';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const newUser = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const newUserBody = newUser.body as LoginBody;

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(newUserBody.accessToken))
        .send({
          answers: [
            {
              questionId: question1.id,
              content: '選項1',
            },
          ],
        })
        .expect(201);

      expect(await prisma.response.count()).toBe(1);
      expect(await prisma.answer.count()).toBe(1);
    });
  });

  describe('GET /surveys/:surveyId/responses', () => {
    it('回傳這份問卷的作答，最新的在前面', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷', ownerId: userId, status: 'PUBLISHED' },
      });

      // [教學] 這一條只驗排序，所以不必建題目、也不必帶 answers ——
      // 前提資料越少，紅燈時越好定位是哪裡壞了。
      //
      // createdAt 明確指定，理由同 surveys.e2e-spec.ts 的排序測試：
      // 兩筆連續建立可能落在同一毫秒（欄位是 TIMESTAMP(3)），順序就不確定，
      // 測試會偶爾紅一次 —— 最惹人厭的那種 bug。
      const older = await prisma.response.create({
        data: { surveyId: survey.id, createdAt: new Date('2026-01-01') },
      });
      const newer = await prisma.response.create({
        data: { surveyId: survey.id, createdAt: new Date('2026-01-02') },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      // [教學] Response 沒有任何可讀的欄位（沒有 title），所以要靠**建立時拿回的 id**
      // 來認人 —— 前面那些測試都能用 title 分辨，這裡不行。
      const body = res.body as ResponseBodyList;
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe(newer.id);
      expect(body.data[1].id).toBe(older.id);
    });

    it('只回這份問卷的作答，不會混到別份問卷的', async () => {
      const survey1 = await prisma.survey.create({
        data: { title: '已發布問卷一', ownerId: userId, status: 'PUBLISHED' },
      });
      const survey2 = await prisma.survey.create({
        data: { title: '已發布問卷二', ownerId: userId, status: 'PUBLISHED' },
      });
      await prisma.response.create({
        data: {
          surveyId: survey2.id,
          createdAt: new Date('2026-01-01'),
        },
      });

      const res1 = await request(app.getHttpServer())
        .get(`/surveys/${survey1.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      const body1 = res1.body as ResponseBodyList;
      expect(body1.data).toHaveLength(0);

      const res2 = await request(app.getHttpServer())
        .get(`/surveys/${survey2.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      const body2 = res2.body as ResponseBodyList;
      expect(body2.data).toHaveLength(1);
    });

    it('pageSize=1 時只回 1 筆，meta 顯示共 2 筆 2 頁', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷一', ownerId: userId, status: 'PUBLISHED' },
      });

      await prisma.response.create({
        data: {
          surveyId: survey.id,
          createdAt: new Date('2026-01-01'),
        },
      });

      await prisma.response.create({
        data: {
          surveyId: survey.id,
          createdAt: new Date('2026-01-02'),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses?pageSize=1`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as ResponseBodyList;

      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(2);
    });

    it('還沒有人填答時 data 是空陣列、total 是 0', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷一', ownerId: userId, status: 'PUBLISHED' },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as ResponseBodyList;

      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    it('問卷不存在時回 404，不是 200 配空陣列', async () => {
      await request(app.getHttpServer())
        .get('/surveys/nonexistent-id/responses')
        .set(...authHeader(authToken))
        .expect(404);
    });

    it('看別人問卷的填答列表 → 403，code 是 FORBIDDEN', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷', ownerId: userId, status: 'PUBLISHED' },
      });

      await prisma.response.create({
        data: { surveyId: survey.id, createdAt: new Date('2026-01-01') },
      });

      const email = 'new-email@example.com';
      const password = 'newpassword';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const newUser = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const newUserBody = newUser.body as LoginBody;

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .set(...authHeader(newUserBody.accessToken))
        .expect(403);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /responses/:id', () => {
    it('回傳這份作答，並帶出每筆答案對應的題目', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷一', ownerId: userId, status: 'PUBLISHED' },
      });

      const q1 = await prisma.question.create({
        data: { surveyId: survey.id, title: '題目一', type: 'TEXT', order: 0 },
      });

      const q2 = await prisma.question.create({
        data: { surveyId: survey.id, title: '題目二', type: 'TEXT', order: 1 },
      });

      const response = await prisma.response.create({
        data: {
          surveyId: survey.id,
          answers: {
            create: [
              { questionId: q2.id, content: '回答二' },
              { questionId: q1.id, content: '回答一' },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/responses/${response.id}`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as ResponseWithAnswersBody;

      expect(body.answers).toHaveLength(2);
      expect(body.answers[0].content).toBe('回答一');
      expect(body.answers[0].question.title).toBe('題目一');
      expect(body.answers[1].question.title).toBe('題目二');
    });

    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .get(`/responses/nonexistent-id`)
        .set(...authHeader(authToken))
        .expect(404);
    });

    it('看別人問卷的單筆作答 → 403', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷', ownerId: userId, status: 'PUBLISHED' },
      });

      const response = await prisma.response.create({
        data: { surveyId: survey.id, createdAt: new Date('2026-01-01') },
      });

      const email = 'new-email@example.com';
      const password = 'newpassword';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const newUser = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const newUserBody = newUser.body as LoginBody;

      const res = await request(app.getHttpServer())
        .get(`/responses/${response.id}`)
        .set(...authHeader(newUserBody.accessToken))
        .expect(403);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('GET /responses/:id 的回應不含 survey 欄位', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷一', ownerId: userId, status: 'PUBLISHED' },
      });

      const q1 = await prisma.question.create({
        data: { surveyId: survey.id, title: '題目一', type: 'TEXT', order: 0 },
      });

      const response = await prisma.response.create({
        data: {
          surveyId: survey.id,
          answers: {
            create: [{ questionId: q1.id, content: '回答一' }],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/responses/${response.id}`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as ResponseWithAnswersBody;

      expect(Object.keys(body).sort()).toEqual([
        'answers',
        'createdAt',
        'id',
        'surveyId',
      ]);
      expect(body).not.toHaveProperty('survey');
    });
  });
});
