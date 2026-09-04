// ============================================================
// [教學] questions.e2e-spec.ts —— 測試「子資源」時多出來的那些前提
//
// 跑法：pnpm test:e2e -- test/questions.e2e-spec.ts
//
// 結構跟 surveys.e2e-spec.ts 一樣（那邊的檔頭講了「會寫入資料的測試」長什麼樣），
// 差別在每個案例都要先建一份**父問卷** —— 題目不能單獨存在。
// 這件小事帶出這一段最貴的一課，寫在下面 PATCH 那組的註解裡。
//
// **Ch12 之後前提資料多了一件事：問卷要有 ownerId。**
// prisma.survey.create 不會填它（填的是 POST /surveys，從 token 拿），
// 所以繞過 HTTP 建出來的是「無主問卷」，而擁有權檢查會正確地擋下它 ——
// 症狀是一批測試突然 403，而程式碼是對的（ch12 坑 1）。
//
// 下一站：test/responses.e2e-spec.ts（前提資料疊到三層時長什麼樣）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { QuestionType } from '../src/generated/prisma/enums';
import { SurveyStatus } from '../src/generated/prisma/enums';
import { registerAndLogin, authHeader } from './helpers/auth';
import { JwtService } from '@nestjs/jwt';

// [教學] supertest 的 res.body 是 any，專案的 ESLint 禁止在 any 上直接取欄位，
// 所以宣告一個形狀轉一次（同 surveys.e2e-spec.ts 的 SurveyBody）。
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

interface QuestionBody {
  id: string;
  surveyId: string;
  title: string;
  order: number;
  type: QuestionType;
}

interface LoginBody {
  accessToken: string;
}

describe('Questions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;

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
    authToken = await registerAndLogin(app);
    userId = app.get(JwtService).decode<{ sub: string }>(authToken).sub;
  });

  describe('GET /surveys/:surveyId/questions', () => {
    it('回傳指定問卷的題目', async () => {
      // [教學] 前提資料一律用 prisma 直接建、不透過 API（理由見 ch02）。
      // 子資源的測試比 surveys 多一步：要先有問卷才建得出題目 ——
      // question.surveyId 是外鍵，指向不存在的問卷會被資料庫直接擋下。
      const survey = await prisma.survey.create({
        data: { title: '指定問卷', ownerId: userId },
      });

      // [教學] 故意**倒著建**（先 order: 1 再 order: 0）。
      // 照順序建的話，就算 service 的 orderBy 被拿掉，資料庫大多也會照插入順序回，
      // 測試照樣綠 —— 那條測試就等於沒在保護排序。
      //
      // 通則：**要驗排序，前提資料的順序就必須跟期望的順序不一樣。**
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 1,
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 0,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .expect(200);

      const questions = res.body as QuestionBody[];

      expect(questions.length).toBe(2);
      expect(questions[0].title).toBe('題目二');
    });

    // [教學] 這條驗的是 service 那行 `await this.surveysService.findOne(surveyId)`。
    // 沒有它的話，這個網址會回 **200 配一個空陣列**（找不到符合的列不是錯誤），
    // 前端就分不出「這份問卷沒有題目」和「根本沒有這份問卷」。
    it('surveyId 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .get('/surveys/nonexistent-id/questions')
        .set(...authHeader(authToken))
        .expect(404);
    });
  });

  describe('POST /surveys/:surveyId/questions', () => {
    it('建立指定問卷的題目', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
          ownerId: userId,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(201);

      // [教學] 這裡**不需要**再查一次資料庫，跟 ch02 說「寫入型端點要二次查詢」不衝突。
      // 判準是：斷言的欄位如果**全是自己送進去的**，那回應可能只是原封不動吐回來，
      // 沒有證據力。這裡的 order: 0 是伺服器算出來的（count 的結果），
      // surveyId 是從網址讀的 —— 兩個都不可能是「把 body 吐回來」湊出來的。
      expect(res.body).toMatchObject({
        surveyId: survey.id,
        title: '題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['選項1', '選項2', '選項3'],
      });
    });

    it('surveyId 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .post('/surveys/nonexistent-id/questions')
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(404);
    });

    // [教學] 這兩條驗證測試都**先建了一份真的問卷**，看起來多餘 ——
    // 驗證比 service 早跑，就算打 nonexistent-id 平常也是綠的。
    //
    // 理由是壞掉的那一刻：驗證真的失效時，請求會往下走到 service，
    // 然後拿到 `expected 400, got 404`，訊息把人帶去查「路由或父資源是不是有問題」，
    // 而真正的兇手在 DTO。**測試裡除了被驗的那件事，其他前提都要保持正常**，
    // 變因只留一個。
    it('type 不在允許的值之內時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
          ownerId: userId,
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'MULTIPLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(400);
    });

    it('options 含有非字串元素時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
          ownerId: userId,
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', 2, 3],
        })
        .expect(400);
    });

    it('問卷已發布時新增題目回 409', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '已發布問卷',
          ownerId: userId,
          status: SurveyStatus.PUBLISHED,
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(409);

      const count = await prisma.question.count({
        where: { surveyId: survey.id },
      });
      expect(count).toBe(0);
    });

    it('連續新增三題時 order 依序是 0、1、2', async () => {
      const survey = await prisma.survey.create({
        data: { title: '普通問卷', ownerId: userId },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目二',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          title: '題目三',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(201);

      const questions = await prisma.question.findMany({
        where: { surveyId: survey.id },
        orderBy: { order: 'asc' },
      });

      expect(questions.map((q) => q.order)).toEqual([0, 1, 2]);
    });

    it('同時新增兩題時 order 不會重複', async () => {
      const survey = await prisma.survey.create({
        data: { title: '普通問卷', ownerId: userId },
      });

      await Promise.all([
        request(app.getHttpServer())
          .post(`/surveys/${survey.id}/questions`)
          .set(...authHeader(authToken))
          .send({
            title: '題目一',
            type: 'SINGLE_CHOICE',
            options: ['選項1', '選項2', '選項3'],
          })
          .expect(201),
        request(app.getHttpServer())
          .post(`/surveys/${survey.id}/questions`)
          .set(...authHeader(authToken))
          .send({
            title: '題目二',
            type: 'SINGLE_CHOICE',
            options: ['選項1', '選項2', '選項3'],
          })
          .expect(201),
      ]);

      const questions = await prisma.question.findMany({
        where: { surveyId: survey.id },
        orderBy: { order: 'asc' },
      });

      expect(questions.map((q) => q.order)).toEqual([0, 1]);
    });

    it('在別人的問卷新增題目 → 403，code 是 FORBIDDEN', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '別人的問卷',
          ownerId: userId,
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

      const res = await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .set(...authHeader(newUserBody.accessToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(403);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // [教學] 這一組是整個 Ch3 第一段最貴的一課，值得停下來看。
  //
  // 第一次寫完跑出來是「2 紅 1 綠」，三條的網址都少了一個 s（打成 /question/）。
  // 而那條綠的正是 `id 不存在時回 404` —— 它的 404 來自「Nest 找不到路由」，
  // 不是來自 service 丟的 NotFoundException。**404 的邏輯一行都沒被執行過，測試卻是綠的。**
  //
  // 這是「假綠」的第五種樣態（前四種在 ch02），而且它的診斷價值是負的：
  // 看到「兩紅一綠」會直覺去查那兩條，但三條錯在同一件事，綠的那條只是被自己的錯誤救了。
  //
  // 留下一個判準：**同一組測試裡「404 那條綠、其他全紅」時，先懷疑路由沒接上。**
  describe('PATCH /questions/:id', () => {
    it('修改題目', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
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

      const res = await request(app.getHttpServer())
        .patch(`/questions/${question.id}`)
        .set(...authHeader(authToken))
        .send({
          title: '修改後的題目一',
          options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
        })
        .expect(200);

      // [教學] PATCH 的斷言要同時涵蓋兩件事，缺一條都不算驗到：
      //   有送的欄位 —— 真的變了（title / options）
      //   沒送的欄位 —— **沒有**被動到（type / order / surveyId）
      //
      // 只斷言前者的話，一個「把整筆資料清空只留 title」的實作照樣會綠。
      expect(res.body).toMatchObject({
        surveyId: survey.id,
        title: '修改後的題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
      });
    });

    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .patch('/questions/nonexistent-id')
        .set(...authHeader(authToken))
        .send({
          title: '修改後的題目一',
          type: 'SINGLE_CHOICE',
          options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
        })
        .expect(404);
    });

    it('options 含有非字串元素時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
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
        .patch(`/questions/${question.id}`)
        .set(...authHeader(authToken))
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', 2, 3],
        })
        .expect(400);
    });

    // [教學] 這條同時保護**兩個各自獨立的機制**，弄壞任何一個它都會叫：
    //   PartialType   —— 讓 {} 通過驗證（換成 CreateQuestionDto 就變 400）
    //   Prisma 的 undefined —— 「不要動這個欄位」（改成 dto.title ?? '' 就會被清空）
    //
    // 名稱寫的是**保證什麼行為**，不是「用了什麼工具」。
    // 叫「PartialType 測試」的話，哪天換成手寫 DTO 名字就變成謊，
    // 而且紅燈時 Jest 只印名字 —— 「PartialType 測試失敗」不告訴你什麼壞了。
    it('空 body 回 200 且不改動任何欄位', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
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

      const res = await request(app.getHttpServer())
        .patch(`/questions/${question.id}`)
        .set(...authHeader(authToken))
        .send({})
        .expect(200);

      expect(res.body).toMatchObject({
        title: '題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['選項1', '選項2', '選項3'],
      });
    });

    it('問卷已發布時修改題目回 409', async () => {
      const survey = await prisma.survey.create({
        data: { title: '未發布問卷', ownerId: userId },
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

      await prisma.survey.update({
        where: { id: survey.id },
        data: { title: '已發布問卷', status: SurveyStatus.PUBLISHED },
      });

      await request(app.getHttpServer())
        .patch(`/questions/${question.id}`)
        .set(...authHeader(authToken))
        .send({
          title: '修改後的題目一',
          options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
        })
        .expect(409);

      const unchanged = await prisma.question.findUnique({
        where: { id: question.id },
      });
      expect(unchanged?.title).toBe('題目一');
    });

    it('改別人問卷的題目 → 403', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '別人的問卷',
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
        .patch(`/questions/${question.id}`)
        .set(...authHeader(newUserBody.accessToken))
        .send({
          title: '修改後的題目一',
          options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
        })
        .expect(403);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('改別人「已發布」問卷的題目 → 403 而不是 409', async () => {
      const survey = await prisma.survey.create({
        data: { title: '未發布問卷', ownerId: userId },
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

      await prisma.survey.update({
        where: { id: survey.id },
        data: { title: '已發布問卷', status: SurveyStatus.PUBLISHED },
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
        .delete(`/questions/${question.id}`)
        .set(...authHeader(newUserBody.accessToken))
        .expect(403);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /questions/:id', () => {
    it('刪除題目', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
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

      const res = await request(app.getHttpServer())
        .delete(`/questions/${question.id}`)
        .set(...authHeader(authToken))
        .expect(200);

      expect(res.body).toMatchObject({
        surveyId: survey.id,
        title: '題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['選項1', '選項2', '選項3'],
      });

      // [教學] DELETE **一定**要二次查詢資料庫，這是它跟 PATCH 最不一樣的地方。
      //
      // 上面那段斷言只能證明「回應長得像那筆題目」—— 而 delete 的回應本來就是
      // **刪除前的快照**，它有內容不代表資料還在。一個「查完就回傳、忘了真的刪」的實作，
      // 上面全綠、下面才會紅。
      const deleted = await prisma.question.findUnique({
        where: { id: question.id },
      });

      expect(deleted).toBeNull();
    });

    // [教學] 這條驗的是 service 那行 `await this.findOne(id)`。
    // 實際漏寫過一次，拿到的是 **500**（Prisma 丟 P2025，Nest 不認識這個錯誤碼），
    // 不是「一樣 404 只是訊息不同」。
    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .delete('/questions/nonexistent-id')
        .set(...authHeader(authToken))
        .expect(404);
    });

    it('問卷已發布時刪除題目回 409', async () => {
      const survey = await prisma.survey.create({
        data: { title: '未發布問卷', ownerId: userId },
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

      await prisma.survey.update({
        where: { id: survey.id },
        data: { title: '已發布問卷', status: SurveyStatus.PUBLISHED },
      });

      await request(app.getHttpServer())
        .delete(`/questions/${question.id}`)
        .set(...authHeader(authToken))
        .expect(409);

      const still = await prisma.question.findUnique({
        where: { id: question.id },
      });
      expect(still).not.toBeNull();
    });

    it('刪別人問卷的題目 → 403', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
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
        .delete(`/questions/${question.id}`)
        .set(...authHeader(newUserBody.accessToken))
        .expect(403);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('FORBIDDEN');
    });
  });
});
