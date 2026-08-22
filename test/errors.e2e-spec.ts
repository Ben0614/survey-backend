// ============================================================
// [教學] errors.e2e-spec.ts —— 錯誤回應長什麼樣，由這個檔案定義
//
// 跟其他 e2e 檔的差別：它們各自測一支端點的行為，
// 這一支測的是**所有端點共同的那一層** —— Exception Filter。
//
// 為什麼需要它：Ch6 之前，69 條測試裡有 31 條在斷言錯誤的**狀態碼**，
// 但斷言錯誤 **body** 的是 0 條。也就是說錯誤回應的格式從來沒有被保護過，
// 隨便改都不會有測試變紅。這個檔案就是那道缺掉的保護。
//
// 跑法：pnpm test:e2e -- test/errors.e2e-spec.ts
//
// 下一站：src/surveys/survey.rules.spec.ts（同樣是測試，但什麼都不必準備 —— 動線終點）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { SurveyStatus, QuestionType } from '../src/generated/prisma/enums';

// [教學] 這個 interface 就是 Ch6 定下來的契約，寫在這裡等於把它變成可執行的規格。
// details 是選擇性的 —— 只有驗證失敗那一種才有（見第 4 條測試）。
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

interface SurveyBody {
  id: string;
  title: string;
  status: string;
  error?: unknown;
}

describe('錯誤回應格式 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // 沒有這行，filter 不會被掛上去，回應會是 Nest 內建的舊格式。
    setupApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('id 不存在時 body 是 { error: { code: NOT_FOUND, message } }', async () => {
    const res = await request(app.getHttpServer())
      .get('/surveys/不存在的id')
      .expect(404);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
    // message 是 service 寫的那句中文，不是 filter 自己編的。
    expect(body.error.message).toBe('問卷不存在');
    // 舊格式的三個欄位要確實消失，不是「新的加上去、舊的還留著」。
    expect(res.body).not.toHaveProperty('statusCode');
  });

  it('驗證失敗時 code 是 VALIDATION_FAILED，details 列出每一條錯誤', async () => {
    const res = await request(app.getHttpServer())
      .post('/surveys')
      .send({})
      .expect(400);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    // [教學] 這一條是這一章的核心：message **一律是字串**。
    // 改格式之前它在這種情況下是陣列、在其他情況是字串，前端每次都得先判斷型別。
    expect(typeof body.error.message).toBe('string');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details?.length).toBeGreaterThan(0);
  });

  it('商業規則衝突時 code 是 CONFLICT，message 是 service 寫的那句中文', async () => {
    const survey = await prisma.survey.create({
      data: { title: '草稿問卷', status: SurveyStatus.DRAFT },
    });
    const question = await prisma.question.create({
      data: {
        surveyId: survey.id,
        title: '第一題',
        type: QuestionType.TEXT,
        order: 0,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/surveys/${survey.id}/responses`)
      .send({ answers: [{ questionId: question.id, content: '答案' }] })
      .expect(409);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('問卷未發布，無法填寫');
  });

  it('service 丟的 400 code 是 BAD_REQUEST，不是 VALIDATION_FAILED', async () => {
    // [教學] 這一條是這一輪的主角 —— 它是唯一會抓到「把兩種 400 混成一種」的測試。
    //
    // 前提刻意用 PUBLISHED（上一條是 DRAFT）：要讓請求通過商業規則那一關，
    // 才走得到 service 自己的重複檢查。兩條測試的前提只差一個 status。
    const survey = await prisma.survey.create({
      data: { title: '已發布問卷', status: SurveyStatus.PUBLISHED },
    });
    const question = await prisma.question.create({
      data: {
        surveyId: survey.id,
        title: '第一題',
        type: QuestionType.TEXT,
        order: 0,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/surveys/${survey.id}/responses`)
      .send({
        answers: [
          { questionId: question.id, content: 'a' },
          { questionId: question.id, content: 'b' },
        ],
      })
      .expect(400);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('有重複的題目ID');
    // 這一條 400 不是驗證失敗，所以**不該有 details 欄位**。
    // 混成一種的話前端會去讀 details 準備標紅欄位，拿到 undefined → 畫面空白。
    expect(body.error.details).toBeUndefined();
  });

  it('成功的回應完全不受影響，body 沒有 error 欄位', async () => {
    // filter 只在例外被丟出來時才跑。這一條把那個邊界寫成可執行的斷言 ——
    // 這一輪改的是全域設定，就該有一條測試說清楚它管不到哪裡。
    const res = await request(app.getHttpServer())
      .post('/surveys')
      .send({ title: '正常的問卷' })
      .expect(201);

    const body = res.body as SurveyBody;
    expect(body.error).toBeUndefined();
    expect(body.title).toBe('正常的問卷');
    expect(body.status).toBe(SurveyStatus.DRAFT);
  });
});
