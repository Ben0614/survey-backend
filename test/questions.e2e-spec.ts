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
    // Ch15 輪 ③ 把 details: string[] 換成結構化的 fields，
    // 這份手寫的介面漏掉了兩章（surveys.e2e-spec.ts 那份在 Ch17 輪 ② 已經改過）。
    // 沒有症狀，因為在此之前沒有測試用到它 —— 手寫型別會安靜地過期，
    // 那正是前端 Ch15 那個 ApiError 的同一課。
    fields?: { field: string; rule: string }[];
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

    it('看別人未發布問卷的題目 → 404', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '別人未發布問卷',
          ownerId: userId,
        },
      });

      // [教學] 拿「第二個使用者」用 helper，不要手寫 register + login 兩段。
      // registerAndLogin 的第二個參數就是為這個情境準備的（見 helpers/auth.ts 檔頭），
      // 而且它裡面的 .expect(201) 會把前提資料的失敗擋在源頭 ——
      // 手寫的話漏掉那一行，註冊失敗會安靜地回 undefined，錯誤要三十行後才浮現。
      //
      // ⚠️ email 不能用預設值：beforeEach 已經註冊過它了，撞名就是 409。
      const otherToken = await registerAndLogin(app, 'other-user@example.com');
      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/questions`)
        .set(...authHeader(otherToken))
        .expect(404);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('看別人已發布問卷的題目 → 200，因為那是填答需要的', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '別人已發布問卷',
          ownerId: userId,
          status: 'PUBLISHED',
        },
      });

      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 1,
        },
      });

      const otherToken = await registerAndLogin(app, 'other-user@example.com');
      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/questions`)
        .set(...authHeader(otherToken))
        .expect(200);

      const questions = res.body as QuestionBody[];

      expect(questions.length).toBe(2);
      expect(questions[0].title).toBe('題目一');
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

    it('在別人的問卷新增題目 → 404，code 是 NOT_FOUND', async () => {
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
        .expect(404);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('NOT_FOUND');
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

    it('改別人問卷的題目 → 404，code 是 NOT_FOUND', async () => {
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
        .expect(404);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('NOT_FOUND');
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

    it('刪別人問卷的題目 → 404，code 是 NOT_FOUND', async () => {
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
        .expect(404);

      const body = res.body as ErrorBody;

      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // [教學] 整份取代這一組的斷言有兩種形狀，混在一起就會漏掉一半：
  //
  //   成功的路徑  斷言**回傳值**（幾題、順序、id 是不是新的）
  //   失敗的路徑  斷言**副作用沒有發生**（題目一題都沒少）
  //
  // 第二種特別容易漏。403 / 409 / 404 只看狀態碼的話，「檢查排在 deleteMany
  // 之後」這個 bug 完全抓不到 —— 狀態碼照樣正確，題目已經被刪光了。
  describe('PUT /surveys/:surveyId/questions', () => {
    it('原本 3 題，送 2 題上去 → 200，回傳 2 題，順序照送出的順序', async () => {
      const survey = await prisma.survey.create({
        data: { title: '要被整份取代的問卷', ownerId: userId },
      });
      await prisma.question.createMany({
        data: [
          { surveyId: survey.id, title: '舊題一', type: 'TEXT', order: 0 },
          { surveyId: survey.id, title: '舊題二', type: 'TEXT', order: 1 },
          { surveyId: survey.id, title: '舊題三', type: 'TEXT', order: 2 },
        ],
      });

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          // 刻意讓送出的順序跟任何「自然排序」都不一樣（B 在 A 前面），
          // 否則就算 order 是亂算的、或 findMany 沒有 orderBy，也可能剛好對。
          questions: [
            { title: '新題 B', type: 'SINGLE_CHOICE', options: ['甲', '乙'] },
            { title: '新題 A', type: 'TEXT', options: [] },
          ],
        })
        .expect(200);

      const body = res.body as QuestionBody[];

      // 這三行合起來才是「主角」：它們同時要求回傳值真的是**題目陣列**。
      // service 若把 createMany 的結果直接回傳（`{ count: 2 }`），
      // 第一行就會紅 —— 而只斷言狀態碼 200 的測試完全看不出來。
      expect(body).toHaveLength(2);
      expect(body.map((q) => q.title)).toEqual(['新題 B', '新題 A']);
      expect(body.map((q) => q.order)).toEqual([0, 1]);
    });

    // [教學] 這一條看起來在測一件廢話，它其實是**把整份取代的代價寫成規格**：
    // 「更新」在這支端點裡是刪掉重建，所以 id 全換。前端存完之後若沒有用
    // 回傳值取代本地狀態，手上那些舊 id 會在下一個動作變成 404。
    //
    // 哪天有人把實作改成 diff（依 id 分成 create / update / delete，實務上
    // master-detail save 的標準做法），這條會紅 —— 而那是**正確的紅**，
    // 它在提醒「這個對外承諾變了」。
    it('回傳的題目 id 全是新的 —— 舊的三個 id 一個都不在', async () => {
      const survey = await prisma.survey.create({
        data: { title: '要被整份取代的問卷', ownerId: userId },
      });

      await prisma.question.createMany({
        data: [
          { surveyId: survey.id, title: '舊題一', type: 'TEXT', order: 0 },
          { surveyId: survey.id, title: '舊題二', type: 'TEXT', order: 1 },
          { surveyId: survey.id, title: '舊題三', type: 'TEXT', order: 2 },
        ],
      });

      // ⚠️ 舊 id 一定要**在打 API 之前**先撈出來。取代之後那三筆就不存在了，
      // 事後再查只會拿到新的三個，變成自己跟自己比，測試永遠綠。
      const before = await prisma.question.findMany({
        where: { surveyId: survey.id },
        select: { id: true },
      });
      const oldIds = before.map((q) => q.id);
      expect(oldIds).toHaveLength(3);

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          questions: [
            { title: '新題 B', type: 'SINGLE_CHOICE', options: ['甲', '乙'] },
            { title: '新題 A', type: 'TEXT', options: [] },
            { title: '新題 C', type: 'TEXT', options: [] },
          ],
        })
        .expect(200);

      const body = res.body as QuestionBody[];

      expect(body).toHaveLength(3);
      // 逐一比對，而不是 expect(newIds).not.toEqual(oldIds) ——
      // 後者只要求「兩個陣列不完全相同」，三個裡面留了兩個舊的照樣通過。
      for (const question of body) {
        expect(oldIds).not.toContain(question.id);
      }
    });

    it('送空陣列 → 200 回 []，再打 GET 也是 0 題', async () => {
      const survey = await prisma.survey.create({
        data: { title: '要被整份取代的問卷', ownerId: userId },
      });
      await prisma.question.createMany({
        data: [
          { surveyId: survey.id, title: '舊題一', type: 'TEXT', order: 0 },
          { surveyId: survey.id, title: '舊題二', type: 'TEXT', order: 1 },
          { surveyId: survey.id, title: '舊題三', type: 'TEXT', order: 2 },
        ],
      });

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          questions: [],
        })
        .expect(200);

      const body = res.body as QuestionBody[];

      expect(body).toHaveLength(0);

      // 名稱裡承諾了「再打 GET 也是 0 題」，就要真的打。
      // 只看回傳值的話，一個「什麼都沒做、直接回 []」的實作也會通過 ——
      // 這一段才是在確認**資料庫真的被清空了**（同 ch02「寫入型端點要二次查詢」）。
      const after = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .expect(200);

      expect(after.body as QuestionBody[]).toHaveLength(0);
    });

    it('別人的草稿 → 404（不是 403），而且原本的題目一題都沒被動到', async () => {
      // ⚠️ 這條的狀態碼是 404 不是 403，而且那是對的：
      // assertCanManage 先問 canSeeSurvey —— 看不到就當它不存在（Ch15）。
      // 回 403 等於承認「這個 id 存在」，別人就能靠掃 id 列舉全站的草稿。
      // 會拿到 403 的是「別人**已發布**的問卷」（看得到，但不能碰），那是下一條。
      const survey = await prisma.survey.create({
        data: { title: '別人的草稿', ownerId: userId },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '原本就有的題目',
          type: 'TEXT',
          order: 0,
        },
      });

      // email 不能用預設值 —— beforeEach 已經註冊過它了（見上面 GET 那組的說明）。
      const otherToken = await registerAndLogin(app, 'other-user@example.com');

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(otherToken))
        .send({ questions: [] })
        .expect(404);

      expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');

      // 這一段才是這條測試真正的價值：三道檢查必須排在交易裡的 deleteMany **之前**。
      // 順序寫反的話狀態碼照樣是 404，但那一題已經沒了。
      const remaining = await prisma.question.findMany({
        where: { surveyId: survey.id },
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.title).toBe('原本就有的題目');
    });

    // [教學] 這一條跟上一條是**同一組**：同樣是「別人的問卷」，只因為狀態不同，
    // 正確答案就從 404 變成 403。兩條都要有，少一條等於沒測到那個分界。
    //
    //   別人的 DRAFT      canSeeSurvey 就 false  → 404（連存在都不承認）
    //   別人的 PUBLISHED  看得到、但不能碰       → 403
    //
    // 而且這裡的 403 還壓過了 409（已發布不能改題目）——「授權排在商業規則之前」
    // 那條原則的現場：回 409 等於告訴一個不相干的人「這份問卷已經發布了」。
    // 上面 PATCH 那組的「改別人『已發布』問卷的題目 → 403 而不是 409」是同一件事。
    it('別人已發布的問卷 → 403 而不是 409，題目也一題都沒被動到', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '別人已發布的問卷',
          ownerId: userId,
          status: SurveyStatus.PUBLISHED,
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '原本就有的題目',
          type: 'TEXT',
          order: 0,
        },
      });

      const otherToken = await registerAndLogin(app, 'other-user@example.com');

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(otherToken))
        .send({ questions: [{ title: '想偷改', type: 'TEXT', options: [] }] })
        .expect(403);

      expect((res.body as ErrorBody).error.code).toBe('FORBIDDEN');

      const remaining = await prisma.question.findMany({
        where: { surveyId: survey.id },
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.title).toBe('原本就有的題目');
    });

    // 這一條才是 409 真正的現場：問卷是**自己的**（看得到、也能碰），
    // 純粹卡在「已發布就不能改題目」這條商業規則上。
    // 正式路徑是先 unpublish 再改 —— 那也是為什麼 canUnpublish 要求零填答。
    it('自己已發布的問卷 → 409，而且題目一題都沒被動到', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '自己已發布的問卷',
          ownerId: userId,
          status: SurveyStatus.PUBLISHED,
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '原本就有的題目',
          type: 'TEXT',
          order: 0,
        },
      });

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({ questions: [{ title: '想改題目', type: 'TEXT', options: [] }] })
        .expect(409);

      expect((res.body as ErrorBody).error.code).toBe('CONFLICT');

      const remaining = await prisma.question.findMany({
        where: { surveyId: survey.id },
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.title).toBe('原本就有的題目');
    });

    it('問卷不存在 → 404', async () => {
      const res = await request(app.getHttpServer())
        .put('/surveys/nonexistent-id/questions')
        .set(...authHeader(authToken))
        .send({ questions: [{ title: '題目一', type: 'TEXT', options: [] }] })
        .expect(404);

      expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');
    });

    // [教學] 這一條同時在驗**兩件事**，而它們是兩個不同的機制：
    //
    //   1. 巢狀驗證真的有跑            ← @ValidateNested + @Type(() => CreateQuestionDto)
    //   2. 錯誤指得出是「第 1 題的 options」← Ch15 的 flattenValidationErrors
    //
    // 少了 @Type 的話，元素只是普通 object、身上沒有裝飾器，規則整組不生效，
    // 這條會拿到 200。ReplaceQuestionsDto 重用 CreateQuestionDto，所以那條
    // 跨欄位規則（SingleChoiceNeedsOptions）是免費跟過來的。
    //
    // 斷言到 fields 的**值**而不是「有沒有 fields」，理由見 surveys.e2e-spec.ts
    // 的同一條測試：只驗「有」的話，規則失效時 fields 變成別的東西照樣綠。
    //
    // 前提資料照樣建一份正常的問卷 —— 驗證比 service 早跑，不建也會 400，
    // 但驗證真的失效那一刻，訊息會變成 404 把人帶去查錯的地方（見上面 POST 那組）。
    it('第 1 題是單選卻只給一個選項 → 400，fields 指到 questions.0.options', async () => {
      const survey = await prisma.survey.create({
        data: { title: '要被整份取代的問卷', ownerId: userId },
      });

      const res = await request(app.getHttpServer())
        .put(`/surveys/${survey.id}/questions`)
        .set(...authHeader(authToken))
        .send({
          questions: [
            {
              title: '你選哪一個',
              type: 'SINGLE_CHOICE',
              options: ['只有一個'],
            },
            { title: '簡答題', type: 'TEXT', options: [] },
          ],
        })
        .expect(400);

      expect((res.body as ErrorBody).error.fields).toContainEqual({
        field: 'questions.0.options',
        rule: 'singleChoiceNeedsOptions',
      });
    });
  });
});
