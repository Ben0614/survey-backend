// ============================================================
// [教學] surveys.e2e-spec.ts —— 一個會「寫入」資料的測試長什麼樣
//
// 跟 health.e2e-spec.ts 的差別只有一個，但很關鍵：
// 這裡的測試會建立資料，所以每個案例開始前都要把資料庫清乾淨。
//
// 跑法：pnpm test:e2e -- test/surveys.e2e-spec.ts
//
// 下一站：test/questions.e2e-spec.ts（測「子資源」時多出來的那些前提）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { SurveyStatus } from '../src/generated/prisma/enums';

// [教學] supertest 的 res.body 型別是 any（它不可能知道你的 API 回什麼）。
// 專案的 ESLint 規則禁止在 any 上直接取欄位，所以宣告一個形狀轉一次。
// 這個型別只是測試自己的斷言用，不是 API 契約 —— 真正的契約 Ch7 用 Swagger 產生。
interface SurveyBody {
  id: string;
  title: string;
  status: string;
}

interface SurveyWithQuestionsBody extends SurveyBody {
  questions: { id: string; title: string; order: number }[];
}

// [教學] 這兩個是 Ch4 加的，而且**是新增、不是改寫 SurveyBody**。
//
// 加分頁時把 SurveyBody 本身改成 { data, meta } 是很自然的直覺，但它有七個使用者，
// 其中六個跟列表無關（POST / PATCH / publish / unpublish 回的都是**一份問卷**，
// 形狀一個字都沒變）。改掉共用型別的意思之後，那六處全部炸成 TypeError。
//
// 判準跟 Ch3 的 assertExists 同一條：**改了一個東西的形狀，先問「誰在用它」。**
// 這裡只有 GET /surveys 的回應變了，所以只該多一個型別。
//
// 順帶一提那六處當時 tsc **全是綠的** —— res.body 是 any，`as SurveyBody`
// 是型別斷言，意思是「相信我」而不是「檢查一下」。as 關掉的是檢查，不是風險。
interface SurveyMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SurveyBodyList {
  data: SurveyBody[];
  meta: SurveyMeta;
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
    it('沒有問卷時 data 為空，total 與 totalPages 都是 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/surveys')
        .expect(200);

      expect(res.body).toEqual({
        data: [],
        meta: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
        },
      });
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

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(2);
      expect(surveys.data[0].title).toBe('第二份');
    });

    // [教學] 這條與下一條是這一章唯二能抓到分頁寫錯的測試，而且分工不同：
    //   這條驗 take（回幾筆）與 meta 算得對不對
    //   下一條驗 skip（回的是哪幾筆）—— 換算寫成 skip: page 只有下一條會紅
    //
    // meta 四個欄位全部釘死是刻意的。只斷言 data.length 的話，把 Math.ceil
    // 拿掉（totalPages 變成 1.5）不會有任何一條測試喊 —— 那正是實作時真的寫錯過的地方。
    it('pageSize=2 只回 2 筆，meta 顯示共 3 筆 2 頁', async () => {
      await prisma.survey.create({
        data: { title: '第一份', createdAt: new Date('2026-01-01') },
      });
      await prisma.survey.create({
        data: { title: '第二份', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: '第三份', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys?page=1&pageSize=2')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(2);
      expect(surveys.meta.page).toBe(1);
      expect(surveys.meta.pageSize).toBe(2);
      expect(surveys.meta.total).toBe(3);
      expect(surveys.meta.totalPages).toBe(2);
    });

    it('page=2 回最後 1 筆，也就是最舊的那筆', async () => {
      await prisma.survey.create({
        data: { title: '第一份', createdAt: new Date('2026-01-01') },
      });
      await prisma.survey.create({
        data: { title: '第二份', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: '第三份', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys?page=2&pageSize=2')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(1);
      expect(surveys.data[0].title).toBe('第一份');
      expect(surveys.meta.page).toBe(2);
      expect(surveys.meta.pageSize).toBe(2);
      expect(surveys.meta.total).toBe(3);
      expect(surveys.meta.totalPages).toBe(2);
    });

    it('不給參數時預設第 1 頁、每頁 10 筆', async () => {
      const res = await request(app.getHttpServer())
        .get('/surveys')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.meta.page).toBe(1);
      expect(surveys.meta.pageSize).toBe(10);
      expect(surveys.meta.total).toBe(0);
      expect(surveys.meta.totalPages).toBe(0);
    });

    it('page 小於 1 時回 400', async () => {
      await request(app.getHttpServer()).get('/surveys?page=0').expect(400);
    });

    it('sort=title&order=asc 依標題由小到大排序', async () => {
      await prisma.survey.create({
        data: { title: 'B問卷', createdAt: new Date('2026-01-01') },
      });
      await prisma.survey.create({
        data: { title: 'A問卷', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: 'C問卷', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys?sort=title&order=asc`)
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data[0].title).toBe('A問卷');
      expect(surveys.data[1].title).toBe('B問卷');
      expect(surveys.data[2].title).toBe('C問卷');
    });

    it('不給 sort 與 order 時，預設依 createdAt 由新到舊排序', async () => {
      await prisma.survey.create({
        data: { title: '第二份', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: '第一份', createdAt: new Date('2026-01-01') },
      });
      await prisma.survey.create({
        data: { title: '第三份', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys`)
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data[0].title).toBe('第三份');
      expect(surveys.data[1].title).toBe('第二份');
      expect(surveys.data[2].title).toBe('第一份');
    });

    it('sort 不在白名單內時回 400，不是 500', async () => {
      await request(app.getHttpServer()).get(`/surveys?sort=name`).expect(400);
    });

    it('order 不是 asc 或 desc 時回 400', async () => {
      await request(app.getHttpServer()).get(`/surveys?order=cac`).expect(400);
    });

    it('status=DRAFT 只回草稿問卷', async () => {
      await prisma.survey.create({
        data: {
          title: '第一份',
          createdAt: new Date('2026-01-01'),
          status: SurveyStatus.PUBLISHED,
        },
      });
      await prisma.survey.create({
        data: { title: '第二份', createdAt: new Date('2026-01-02') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys?status=DRAFT')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(1);
      expect(surveys.data[0].title).toBe('第二份');
    });

    it('q=滿意度 只回標題含「滿意度」的問卷', async () => {
      await prisma.survey.create({
        data: {
          title: '飲食滿意度問卷',
          createdAt: new Date('2026-01-01'),
        },
      });
      await prisma.survey.create({
        data: { title: '交易滿意度問卷', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: '測試問卷', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys?q=滿意度')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(2);
      expect(surveys.data[0].title).toBe('交易滿意度問卷');
      expect(surveys.data[1].title).toBe('飲食滿意度問卷');
    });

    it('q 大小寫不敏感，q=api 找得到標題含 API 的問卷', async () => {
      await prisma.survey.create({
        data: {
          title: '測試API',
          createdAt: new Date('2026-01-01'),
        },
      });
      await prisma.survey.create({
        data: { title: '再次測試api', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: '不相干問卷', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys?q=api')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(2);
      expect(surveys.data[0].title).toBe('再次測試api');
      expect(surveys.data[1].title).toBe('測試API');
    });

    it('status 不是合法的 SurveyStatus 時回 400', async () => {
      await request(app.getHttpServer())
        .get('/surveys?status=PPAP')
        .expect(400);
    });

    it('篩選加分頁時，meta.total 是篩選後的筆數而不是全表筆數', async () => {
      await prisma.survey.create({
        data: {
          title: '測試API',
          createdAt: new Date('2026-01-01'),
        },
      });
      await prisma.survey.create({
        data: { title: '再次測試api', createdAt: new Date('2026-01-02') },
      });
      await prisma.survey.create({
        data: { title: '不相干問卷', createdAt: new Date('2026-01-03') },
      });

      const res = await request(app.getHttpServer())
        .get('/surveys?q=api&page=1&pageSize=1')
        .expect(200);

      const surveys = res.body as SurveyBodyList;
      expect(surveys.data).toHaveLength(1);
      expect(surveys.data[0].title).toBe('再次測試api');
      expect(surveys.meta.total).toBe(2);
    });
  });

  describe('GET /surveys/:id', () => {
    it('回傳指定問卷', async () => {
      // [教學] 這裡要把 create 的回傳值接起來（前面的列表測試沒有這樣做）。
      // 因為 id 是 cuid、是隨機的，測試無法預先知道它會是什麼，
      // 只能從建立的結果拿回來再組進網址。
      const survey = await prisma.survey.create({
        data: { title: '指定問卷' },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: survey.id,
        title: '指定問卷',
      });
    });

    // [教學] 404 刻意獨立成一個 it，不寫在上面那個裡面。
    //
    // 一個 it 只驗一件事，理由有兩層：
    //   表面上 —— 失敗時光看測試名稱就知道壞的是哪一條路，不必進去讀程式碼。
    //   實際上 —— 斷言失敗會**中斷**整個 it。兩件事寫在一起時，
    //             只要前面的 200 先紅，後面的 404 根本不會被執行，
    //             等於這條路默默失去保護，而你從報告上看不出來。
    //
    // 這一條不需要建任何前提資料 —— beforeEach 已經把資料庫清空了，
    // 隨便一個 id 都必然不存在。
    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .get('/surveys/nonexistent-id')
        .expect(404);
    });

    it('includeQuestions=true 時帶出題目，且依 order 排序', async () => {
      const survey = await prisma.survey.create({
        data: { title: '指定問卷' },
      });

      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 1,
          options: ['選項4', '選項5', '選項6'],
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}?includeQuestions=true`)
        .expect(200);

      const body = res.body as SurveyWithQuestionsBody;

      expect(body).toHaveProperty('questions');
      expect(body.questions).toHaveLength(2);
      expect(body.questions[0].order).toBe(0);
      expect(body.questions[1].order).toBe(1);
    });

    it('不帶 includeQuestions 時，回應沒有 questions 欄位', async () => {
      const survey = await prisma.survey.create({
        data: { title: '指定問卷' },
      });

      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 1,
          options: ['選項4', '選項5', '選項6'],
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}`)
        .expect(200);

      const body = res.body as SurveyBody;

      expect(body).not.toHaveProperty('questions');
    });

    it('includeQuestions=false 時，回應沒有 questions 欄位', async () => {
      const survey = await prisma.survey.create({
        data: { title: '指定問卷' },
      });

      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 1,
          options: ['選項4', '選項5', '選項6'],
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}?includeQuestions=false`)
        .expect(200);

      const body = res.body as SurveyBody;

      expect(body).not.toHaveProperty('questions');
    });

    it('includeQuestions 不是 true 或 false 時回 400', async () => {
      const survey = await prisma.survey.create({
        data: { title: '指定問卷' },
      });

      await request(app.getHttpServer())
        .get(`/surveys/${survey.id}?includeQuestions=psads`)
        .expect(400);
    });
  });

  describe('PATCH /surveys/:id', () => {
    it('更新問卷標題', async () => {
      const survey = await prisma.survey.create({
        data: { title: '舊標題' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}`)
        .send({ title: '新標題' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: survey.id,
        title: '新標題',
      });

      // [教學] 上面已經斷言過回應 body 了，這裡再用 prisma 查一次資料庫 ——
      // 看似重複，但兩者驗的不是同一件事。
      //
      // 只看回應 body 有一個盲點：如果哪天 controller 被寫成
      // 「把收到的 body 原封不動回吐」，這個測試照樣綠，但資料庫根本沒被改。
      // 多查這一次，才能分辨「API 說它改了」和「它真的改了」。
      //
      // 這是寫入型端點才需要的加碼；查詢型（GET）沒有這個問題。
      const updated = await prisma.survey.findUnique({
        where: { id: survey.id },
      });
      expect(updated).toMatchObject({
        id: survey.id,
        title: '新標題',
      });
    });

    // [教學] 這一條保護的是 surveys.service.ts 裡 update 開頭的 `await this.findOne(id)`。
    // 把那行刪掉，這裡就會從 404 變成 500 —— 這是唯一會抓到那件事的測試。
    //
    // **動詞一定要跟 describe 一致。** 這條原本誤寫成 .get(...)（從上面的
    // GET 版本複製過來忘了改），結果它照樣綠 —— 因為 GET 的 404 本來就會過。
    // 一條測著別條路的綠燈，比紅燈危險：它讓人以為 PATCH 的 404 有被保護。
    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .patch('/surveys/nonexistent-id')
        .send({ title: '新標題' })
        .expect(404);
    });

    // [教學] 這一條在驗 PartialType 的短路開關（見 dto/update-survey.dto.ts）：
    // title 沒出現 → 驗證整組跳過 → 通過；再往下 dto.title 是 undefined
    // → Prisma 完全不碰這個欄位 → 標題維持原值。
    //
    // 它跟下面「title 是空字串回 400」是一組的：兩條都在驗同一個機制，
    // 一條驗「沒出現就跳過」，一條驗「出現了就照常檢查」。少任何一條都看不出差別。
    it('空 body 不會改動任何欄位', async () => {
      const survey = await prisma.survey.create({
        data: { title: '舊標題' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}`)
        .send({})
        .expect(200);

      expect((res.body as SurveyBody).title).toBe('舊標題');
    });

    it('title 是空字串時回 400', async () => {
      const survey = await prisma.survey.create({
        data: { title: '舊標題' },
      });

      await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}`)
        .send({ title: '' })
        .expect(400);
    });

    // [教學] whitelist 的行為見上面 POST 的同名案例，這裡不重複。
    // 之所以兩支端點各測一次：whitelist 是**逐個路由**套用在該路由的 DTO 上，
    // POST 綠不代表 PATCH 綠 —— 例如 UpdateSurveyDto 若哪天自己宣告了 status，
    // POST 那條照樣過，只有這條會紅。
    it('偷塞 DTO 沒宣告的 status 會被忽略', async () => {
      const survey = await prisma.survey.create({
        data: { title: '舊標題' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}`)
        .send({ title: '想偷跑的問卷', status: 'PUBLISHED' })
        .expect(200);

      expect((res.body as SurveyBody).status).toBe('DRAFT');
    });
  });

  describe('DELETE /surveys/:id', () => {
    // [教學] 這一條的兩段斷言不是重複，它們各自證明不同的事：
    //   res.body   —— 「API 說它刪掉了這一筆」
    //   findUnique —— 「它真的不在資料庫裡了」
    //
    // DELETE 特別需要第二段。因為回應 body 就是刪除前的快照，
    // 一支「只把資料回吐、根本沒執行 DELETE」的爛實作，第一段照樣會過。
    it('刪除問卷', async () => {
      const survey = await prisma.survey.create({
        data: { title: '要刪掉的問卷' },
      });

      const res = await request(app.getHttpServer())
        .delete(`/surveys/${survey.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: survey.id,
        title: '要刪掉的問卷',
      });

      const deleted = await prisma.survey.findUnique({
        where: { id: survey.id },
      });
      expect(deleted).toBeNull();
    });

    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .delete('/surveys/nonexistent-id')
        .expect(404);
    });

    // [教學] 這一條才是 remove 真正的重點。
    //
    // 端點本身跟 update 同一套（借 findOne 丟 404 再操作），沒什麼新東西；
    // 這條測試驗的是 **Ch1 寫下的 onDelete: Cascade 到底有沒有生效** ——
    // 整個專案第一次用自動化測試檢查「活在資料庫裡的規則」。
    //
    // 前提資料必須照順序建，因為外鍵要等上一層的 id 先出來：
    //   Survey → Question（要 survey.id）
    //          → Response（要 survey.id）
    //          → Answer  （要 question.id 和 response.id 兩個）
    //
    // Answer 是三張裡最不能省的：它**沒有直接掛在 Survey 上**（見 schema.prisma），
    // 能被清掉是因為 Question（或 Response）先被清掉、再連鎖一次。
    // 少了它，驗到的只有第一層，多層連鎖哪天壞了不會有人發現。
    it('刪除問卷會連帶刪掉題目、回覆與答案（cascade）', async () => {
      const survey = await prisma.survey.create({
        data: { title: '有題目也有人填過的問卷' },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '你滿意嗎？',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['滿意', '不滿意'],
        },
      });

      const response = await prisma.response.create({
        data: {
          surveyId: survey.id,
        },
      });

      await prisma.answer.create({
        data: {
          questionId: question.id,
          responseId: response.id,
          content: '滿意',
        },
      });

      await request(app.getHttpServer())
        .delete(`/surveys/${survey.id}`)
        .expect(200);

      // [教學] 這三行**必須用 prisma 直接查、不能改用 API**。
      // 要驗的規則活在 PostgreSQL 裡（prisma/migrations/*/migration.sql 的
      // ON DELETE CASCADE），不是 Prisma Client 的行為、更不是 API 的行為 ——
      // 用 API 查就變成在測 API 了。
      //
      // count() 不帶 where 是刻意的：beforeEach 已經清空資料庫，
      // 全表只有剛才建的這一串，所以「全表是 0」就等於「這一串被清光了」。
      //
      // 寫成 expect(await x()).toBe(0)，不要寫 expect(x()).resolves.toBe(0)：
      // 後者回傳一個 Promise，忘了 await 就沒人等結果，it 會立刻結束並判定通過，
      // count() 回 5 也照樣綠。這種假綠 lint 的 no-floating-promises 抓得到。
      expect(await prisma.question.count()).toBe(0);
      expect(await prisma.response.count()).toBe(0);
      expect(await prisma.answer.count()).toBe(0);
    });
  });

  describe('PATCH /surveys/:id/publish', () => {
    it('調整問卷成發布狀態', async () => {
      const survey = await prisma.survey.create({
        data: { title: '待發布問卷' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}/publish`)
        .expect(200);

      expect((res.body as SurveyBody).status).toBe(SurveyStatus.PUBLISHED);
    });
  });

  describe('PATCH /surveys/:id/unpublish', () => {
    it('調整問卷成未發布狀態', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷', status: SurveyStatus.PUBLISHED },
      });

      const res = await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}/unpublish`)
        .expect(200);

      expect((res.body as SurveyBody).status).toBe(SurveyStatus.DRAFT);
    });

    it('已填寫問卷，調整問卷成未發布狀態會顯示409', async () => {
      const survey = await prisma.survey.create({
        data: { title: '已發布問卷', status: SurveyStatus.PUBLISHED },
      });

      await prisma.response.create({
        data: { surveyId: survey.id },
      });

      await request(app.getHttpServer())
        .patch(`/surveys/${survey.id}/unpublish`)
        .expect(409);

      const res = await prisma.survey.findUnique({
        where: { id: survey.id },
      });
      expect(res?.status).toBe(SurveyStatus.PUBLISHED);
    });
  });
});
