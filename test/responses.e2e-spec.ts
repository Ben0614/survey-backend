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
import { QuestionType } from '../src/generated/prisma/enums';

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

interface PaginatedResponseListBody {
  data: {
    id: string;
    surveyId: string;
    createdAt: string;
    answers: { id: string; questionId: string; content: string }[];
  }[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

interface SummaryBody {
  surveyId: string;
  responseCount: number;
  questions: {
    questionId: string;
    title: string;
    type: QuestionType;
    order: number;
    answerCount: number;
    options?: { option: string; count: number }[];
    samples?: string[];
  }[];
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    // Ch15 輪 ③ 把 details: string[] 換成結構化的 fields，這份手寫的介面漏掉了。
    // 沒有症狀，因為沒有測試用到它 —— 手寫型別會安靜地過期。
    fields?: { field: string; rule: string }[];
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

    // [教學] 底下五條是 Ch17 輪 ④ 加的，全部圍繞同一件事：
    // **「這份作答完整嗎、每個答案合法嗎」是 DTO 永遠做不到的檢查。**
    //
    // 前提資料都用 prisma 直接建（不走 API），理由見檔頭：
    // 題目只有 DRAFT 能加、作答只有 PUBLISHED 能送，走 API 就得先建再發布，
    // 而那不是這幾條要驗的東西。
    //
    // 一個共用的小工具：這一組每條都要「一份已發布、有 N 題的問卷」。
    async function seedPublishedSurvey(
      titles: { title: string; type: 'TEXT' | 'SINGLE_CHOICE' }[],
    ) {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷', ownerId: userId, status: 'PUBLISHED' },
      });

      // 只標得到的最小形狀：這幾條測試需要的只有 id。
      // 不寫型別的話 TS 會把 [] 推成 never[]，push 進去就編譯不過。
      const questions: { id: string }[] = [];
      for (const [index, q] of titles.entries()) {
        questions.push(
          await prisma.question.create({
            data: {
              surveyId: survey.id,
              title: q.title,
              type: q.type,
              order: index,
              options: q.type === 'SINGLE_CHOICE' ? ['甲', '乙'] : [],
            },
          }),
        );
      }

      return { survey, questions };
    }

    it('一份 3 題的問卷只答 2 題 → 400', async () => {
      const { survey, questions } = await seedPublishedSurvey([
        { title: '題目一', type: 'TEXT' },
        { title: '題目二', type: 'TEXT' },
        { title: '題目三', type: 'TEXT' },
      ]);

      const res = await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            { questionId: questions[0].id, content: '答一' },
            { questionId: questions[1].id, content: '答二' },
          ],
        })
        .expect(400);

      expect((res.body as ErrorBody).error.code).toBe('BAD_REQUEST');
      expect(await prisma.response.count()).toBe(0);
    });

    // ← 這一輪的主角。
    //
    // 它是唯一會抓到「以為『題數對得上』就代表『題目都是這份問卷的』、
    // 於是把歸屬檢查刪掉」那個 bug 的測試 —— 而那個 bug 的症狀是 **201**：
    // 作答掛在 A 問卷底下，答案卻指向 B 問卷的題目，資料庫一聲都不吭。
    //
    // 後半段「沒有寫進任何作答」不能省：只看 400 的話，
    // 「先寫入再檢查」的實作一樣是 400。
    it('答案數對得上，但其中一題是別份問卷的 → 400，而且沒有寫進任何作答', async () => {
      const { survey, questions } = await seedPublishedSurvey([
        { title: '題目一', type: 'TEXT' },
        { title: '題目二', type: 'TEXT' },
      ]);

      // 另一份問卷的題目 —— 它**真的存在**，所以外鍵擋不住它。
      const other = await seedPublishedSurvey([
        { title: '別份問卷的題目', type: 'TEXT' },
      ]);

      const res = await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          // 兩個答案對兩題，數量剛好對得上 —— 但第二個是別份問卷的。
          answers: [
            { questionId: questions[0].id, content: '答一' },
            { questionId: other.questions[0].id, content: '答二' },
          ],
        })
        .expect(400);

      expect((res.body as ErrorBody).error.code).toBe('BAD_REQUEST');
      expect(await prisma.response.count()).toBe(0);
      expect(await prisma.answer.count()).toBe(0);
    });

    it('單選題送一個不在選項裡的內容 → 400', async () => {
      const { survey, questions } = await seedPublishedSurvey([
        { title: '你選哪一個', type: 'SINGLE_CHOICE' },
      ]);

      const res = await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [{ questionId: questions[0].id, content: '隨便打的' }],
        })
        .expect(400);

      expect((res.body as ErrorBody).error.code).toBe('BAD_REQUEST');
      expect(await prisma.response.count()).toBe(0);
    });

    it('單選題送選項裡的內容 → 201', async () => {
      const { survey, questions } = await seedPublishedSurvey([
        { title: '你選哪一個', type: 'SINGLE_CHOICE' },
      ]);

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [{ questionId: questions[0].id, content: '甲' }],
        })
        .expect(201);

      expect(await prisma.answer.count()).toBe(1);
    });

    // 這條看起來像廢話，它守的是**規則沒有誤擋**：
    // isValidAnswer 若忘了先分岔 type，簡答題的 options 是空陣列，
    // `[].includes(任何東西)` 永遠是 false —— 所有簡答作答都會被擋下來。
    it('簡答題送任意內容 → 201，不受選項規則影響', async () => {
      const { survey, questions } = await seedPublishedSurvey([
        { title: '你想說什麼', type: 'TEXT' },
      ]);

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .send({
          answers: [
            { questionId: questions[0].id, content: '這句話不在任何選項裡' },
          ],
        })
        .expect(201);

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

    // [教學] 底下五條是 Ch17 輪 ⑤b 加的。前提資料共用同一個 helper，
    // 而它把 createdAt 寫死 —— 兩條排序測試靠的就是那個順序，
    // 用 default(now()) 的話三筆只差幾微秒，測試會變成靠運氣。
    async function seedThreeResponses() {
      const survey = await prisma.survey.create({
        data: { title: '列表用問卷', ownerId: userId, status: 'PUBLISHED' },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '整體滿意度',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['滿意', '普通'],
        },
      });

      for (const [content, at] of [
        ['最舊的', '2026-01-01T00:00:00Z'],
        ['中間的', '2026-01-02T00:00:00Z'],
        ['最新的', '2026-01-03T00:00:00Z'],
      ] as const) {
        await prisma.response.create({
          data: {
            surveyId: survey.id,
            createdAt: new Date(at),
            answers: { create: [{ questionId: question.id, content }] },
          },
        });
      }

      return { survey, question };
    }

    it('列表的每一筆都帶著 answers，不必再打 GET /responses/:id', async () => {
      const { survey, question } = await seedThreeResponses();

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as PaginatedResponseListBody;

      expect(body.data).toHaveLength(3);
      // 斷言到**內容**而不是「有 answers」：只驗「有」的話，
      // 一個回空陣列的實作照樣綠。
      for (const item of body.data) {
        expect(item.answers).toHaveLength(1);
        expect(item.answers[0].questionId).toBe(question.id);
        expect(typeof item.answers[0].content).toBe('string');
      }
    });

    // 這條看起來在測「沒有什麼」，它其實是**把設計決定寫成規格**：
    // AnswerEntity 身上有一個必填的 question，重用它的話題目文字會在
    // 每一筆填答裡重複一次（10 筆 × 4 題 = 40 份）。
    // 哪天有人為了方便把 include: { answers: { include: { question: true } } }
    // 加回去，這條會紅 —— **而那是正確的紅**。
    it('列表的 answers 不含 question —— 題目資料不在每一筆裡重複', async () => {
      const { survey } = await seedThreeResponses();

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      const answer = (res.body as PaginatedResponseListBody).data[0].answers[0];

      expect(answer).not.toHaveProperty('question');
      // responseId 也挑掉了：它就是外層那筆 Response 的 id。
      expect(answer).not.toHaveProperty('responseId');
      expect(Object.keys(answer).sort()).toEqual([
        'content',
        'id',
        'questionId',
      ]);
    });

    it('不給 order 時，最新的填答排在第一筆', async () => {
      const { survey } = await seedThreeResponses();

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .set(...authHeader(authToken))
        .expect(200);

      const contents = (res.body as PaginatedResponseListBody).data.map(
        (item) => item.answers[0].content,
      );

      expect(contents).toEqual(['最新的', '中間的', '最舊的']);
    });

    it('order=asc 時，最舊的填答排在第一筆', async () => {
      const { survey } = await seedThreeResponses();

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .query({ order: 'asc' })
        .set(...authHeader(authToken))
        .expect(200);

      const contents = (res.body as PaginatedResponseListBody).data.map(
        (item) => item.answers[0].content,
      );

      expect(contents).toEqual(['最舊的', '中間的', '最新的']);
    });

    // ← 這一輪的主角。
    //
    // order 若只宣告成 string 而沒有白名單，ValidationPipe 會放行（它確實是字串），
    // 然後 `orderBy: { createdAt: 'whatever' }` 讓 Prisma 丟例外 → **500**。
    // **使用者輸入造成 500 一律算 bug**，而且 500 對前端毫無資訊。
    // 這是 Ch4 那條「排序要用白名單」的第二個現場：那時擋的是欄位名，這次是方向。
    it('order 不是 asc 或 desc → 400', async () => {
      const { survey } = await seedThreeResponses();

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses`)
        .query({ order: 'whatever' })
        .set(...authHeader(authToken))
        .expect(400);

      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
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

  // [教學] 摘要這一組跟上面每一組的差別：**它斷言的是「算出來的數字」**，
  // 而不是「有沒有寫進去」。所以前提資料要造得剛好 —— 每個選項幾票是預先設計的，
  // 不能靠「有就好」。
  describe('GET /surveys/:surveyId/responses/summary', () => {
    // 這一組共用的前提：一份已發布的問卷、一個單選題、一個簡答題。
    // 填答用 prisma 直接建（不走 API），因為要控制 createdAt 才驗得了排序。
    async function seedSurveyWithAnswers(
      picks: { choice: string; text: string; at: string }[],
    ) {
      const survey = await prisma.survey.create({
        data: { title: '摘要用問卷', ownerId: userId, status: 'PUBLISHED' },
      });

      const choice = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '整體滿意度',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['滿意', '普通', '不滿意'],
        },
      });

      const text = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '還有什麼想說的',
          type: 'TEXT',
          order: 1,
          options: [],
        },
      });

      for (const pick of picks) {
        await prisma.response.create({
          data: {
            surveyId: survey.id,
            // ⚠️ createdAt 寫死而不是靠 default(now())：
            // 三筆連續建立的時間可能只差幾微秒，「最新的排在前面」那條測試
            // 會變成靠運氣。**要驗排序，就要自己決定順序。**
            createdAt: new Date(pick.at),
            answers: {
              create: [
                { questionId: choice.id, content: pick.choice },
                { questionId: text.id, content: pick.text },
              ],
            },
          },
        });
      }

      return { survey, choice, text };
    }

    it('三份填答，單選題的每個選項各算出正確的筆數', async () => {
      const { survey } = await seedSurveyWithAnswers([
        { choice: '滿意', text: '很好', at: '2026-01-01T00:00:00Z' },
        { choice: '滿意', text: '不錯', at: '2026-01-02T00:00:00Z' },
        { choice: '普通', text: '還可以', at: '2026-01-03T00:00:00Z' },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses/summary`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as SummaryBody;

      expect(body.responseCount).toBe(3);
      expect(body.questions).toHaveLength(2);

      const choice = body.questions[0];
      expect(choice.type).toBe('SINGLE_CHOICE');
      expect(choice.answerCount).toBe(3);
      // 斷言到**值**而不是「有 options」：只驗「有」的話，數字全錯也會綠。
      expect(choice.options).toEqual([
        { option: '滿意', count: 2 },
        { option: '普通', count: 1 },
        { option: '不滿意', count: 0 },
      ]);
    });

    // ← 這一輪的主角。
    //
    // groupBy **只回出現過的值** —— 沒有人選的「不滿意」那一組根本不會出現在
    // 查詢結果裡。以 groupBy 的結果為基準去組裝的話，那個選項會**整個消失**：
    // 畫面上只有兩條長條，使用者理解成「這題只有兩個選項」，
    // 而且百分比還會算對（2/3、1/3）—— 沒有錯誤、沒有 0、完全看不出來。
    //
    // 上一條全綠也擋不住它，因為有人選的那些數字都是對的。
    it('沒有人選的選項也要出現，count 是 0', async () => {
      const { survey } = await seedSurveyWithAnswers([
        { choice: '滿意', text: 'a', at: '2026-01-01T00:00:00Z' },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses/summary`)
        .set(...authHeader(authToken))
        .expect(200);

      const options = (res.body as SummaryBody).questions[0].options!;

      expect(options).toHaveLength(3);
      expect(options.map((o) => o.option)).toEqual(['滿意', '普通', '不滿意']);
      expect(options.find((o) => o.option === '不滿意')!.count).toBe(0);
    });

    it('簡答題回 answerCount 與最近幾筆原文，最新的排在前面', async () => {
      const { survey } = await seedSurveyWithAnswers([
        { choice: '滿意', text: '最舊的', at: '2026-01-01T00:00:00Z' },
        { choice: '普通', text: '中間的', at: '2026-01-02T00:00:00Z' },
        { choice: '不滿意', text: '最新的', at: '2026-01-03T00:00:00Z' },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses/summary`)
        .set(...authHeader(authToken))
        .expect(200);

      const text = (res.body as SummaryBody).questions[1];

      expect(text.type).toBe('TEXT');
      expect(text.answerCount).toBe(3);
      // 簡答題沒有 options —— 兩種型別回的是不同的東西。
      expect(text.options).toBeUndefined();
      expect(text.samples).toEqual(['最新的', '中間的', '最舊的']);
    });

    // 上一條主角的極端版：groupBy 這時回**空陣列**。
    // 以它為基準的實作會回一個「沒有任何題目」的摘要，
    // 而正確答案是「每一題都在，每個選項都是 0」。
    it('一份填答都沒有 → 200，responseCount 是 0，每個選項也都是 0', async () => {
      const { survey } = await seedSurveyWithAnswers([]);

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses/summary`)
        .set(...authHeader(authToken))
        .expect(200);

      const body = res.body as SummaryBody;

      expect(body.responseCount).toBe(0);
      expect(body.questions).toHaveLength(2);
      expect(body.questions[0].answerCount).toBe(0);
      expect(body.questions[0].options).toEqual([
        { option: '滿意', count: 0 },
        { option: '普通', count: 0 },
        { option: '不滿意', count: 0 },
      ]);
      expect(body.questions[1].samples).toEqual([]);
    });

    // 摘要是「看結果」，跟 findAll 用同一套授權：只有擁有者與 ADMIN 看得到。
    // 已發布的問卷別人看得到（canSeeSurvey），但不能碰 → 403 而不是 404。
    it('別人已發布的問卷 → 403', async () => {
      const { survey } = await seedSurveyWithAnswers([
        { choice: '滿意', text: 'a', at: '2026-01-01T00:00:00Z' },
      ]);

      const otherToken = await registerAndLogin(app, 'other-user@example.com');

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/responses/summary`)
        .set(...authHeader(otherToken))
        .expect(403);

      expect((res.body as ErrorBody).error.code).toBe('FORBIDDEN');
    });

    it('問卷不存在 → 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/surveys/nonexistent-id/responses/summary')
        .set(...authHeader(authToken))
        .expect(404);

      expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');
    });
  });
});
