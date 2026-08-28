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
// 下一站：test/swagger.e2e-spec.ts（唯一一支不打 API、改去驗「文件有沒有說謊」的測試）
// ============================================================

import { INestApplication, LoggerService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { SurveyStatus, QuestionType } from '../src/generated/prisma/enums';
import { Prisma } from '../src/generated/prisma/client';

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

// ============================================================
// [教學] 第二個 describe —— 這是全專案第一次用 mock
//
// 上面那個 describe 連真實資料庫，這個一次都不碰：它把 PrismaService 整支
// 換成替身，逼它丟出指定的 Prisma 錯誤，然後看 filter 怎麼處理。
//
// 為什麼這不違反「E2E 優先」（見 CLAUDE.md 的測試策略）：
// 那條原則的判準是「mock 掉 Prisma 等於在測 mock」—— 針對的是**業務邏輯**。
// 這裡要測的是「這種錯誤發生時 filter 會怎麼做」，而正常路徑**製造不出那個錯誤**
// （service 三處都先擋掉了，那正是輪 1「不改 assertExists 策略」的直接後果）。
// 換句話說：不 mock 的話，這四條路徑一條都跑不到。
// ============================================================
describe('Prisma 錯誤的安全網 (e2e)', () => {
  let app: INestApplication<App>;

  // [教學] filter 寫的 log 攔在這裡，不是攔在 console。
  //
  // Nest 的 Logger 是可以整支換掉的（app.useLogger）—— 所以不需要去 mock
  // 全域的 jest.spyOn，換一個「把訊息記進陣列」的實作就好。
  // 附帶好處：500 那條測試不會再把整段堆疊印到測試輸出裡。
  const loggedErrors: unknown[] = [];
  const testLogger: LoggerService = {
    log: () => {},
    warn: () => {},
    error: (message: unknown) => {
      loggedErrors.push(message);
    },
  };

  // [教學] 替身要丟哪個錯誤，由每條測試在發請求前寫進這個變數。
  //
  // 為什麼不是「每條測試各建一個 app」：建 app 要跑一次完整的 DI（約 1 秒），
  // 四條就是四次。把「會變的部分」抽成一個變數，app 就只需要建一次。
  let nextError: unknown;

  // [教學] 替身只需要長得夠像「被呼叫到的那一部分」，不必是完整的 PrismaClient。
  //
  // 這一輪打的是 GET /surveys/:id，它的路徑是
  //   surveys.controller → surveys.service.findOne → assertExists → prisma.survey.findUnique
  // 所以整個 PrismaService 只有 survey.findUnique 會被碰到，替身就只寫這一支。
  // 換一支端點測就得換替身的形狀 —— 這是 mock 的代價：它跟被測程式碼的內部實作綁在一起。
  //
  // 同步 throw 而不是 Promise.reject：service 那一行是 `await this.prisma...`，
  // 在 async 函式裡同步丟出的錯誤一樣會變成 rejected promise，對 filter 沒有差別。
  const prismaMock = {
    survey: {
      findUnique: () => {
        throw nextError;
      },
    },
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      // [教學] overrideProvider 換掉的是 DI 容器裡那一份，不是檔案。
      // AppModule 底下所有注入 PrismaService 的地方（surveys / questions /
      // responses / health）拿到的都會是這個替身 —— 這也是為什麼上面那個
      // describe 必須是獨立的 app，不能共用。
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(testLogger);
    setupApp(app); // 少了這行 filter 不會掛上，回的是 Nest 內建格式
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // 每條測試各自從空的開始，否則前一條留下的 log 會讓後一條誤判。
  beforeEach(() => {
    loggedErrors.length = 0;
  });

  // [教學] 沒有 beforeEach / resetDb —— 這個 describe 一次資料庫都不碰，
  // 沒有任何前提資料需要準備或清掉。這也是它比上面那個快很多的原因。

  // [教學] 這四條寫成 it.todo 而不是空的 it()，是刻意的：
  // 空的 it() 會**通過**，於是 jest 的數字從 74 漲到 78，而保護是零 ——
  // 那正是 Ch5 記下的假綠第八種。it.todo 會被印成 todo，數字不會說謊。
  // 你填內容時把 it.todo('...') 改回 it('...', async () => { ... })。
  it('Prisma 丟 P2025 時回 404 而不是 500', async () => {
    // [教學] 三步：設定替身要丟的錯誤 → 發請求 → 斷言。
    //
    // 網址裡的 id 是什麼完全不重要 —— 替身根本不會去查，它只負責丟錯。
    // 這一條驗的不是「這個 id 不存在」，是「這個錯誤冒上來時 filter 會怎麼做」。
    nextError = new Prisma.PrismaClientKnownRequestError('mocked', {
      code: 'P2025',
      clientVersion: 'test',
    });

    const res = await request(app.getHttpServer())
      .get('/surveys/隨便一個id')
      .expect(404);

    const body = res.body as ErrorBody;
    // 狀態碼之外一定要驗 code：只驗 404 的話，「狀態碼對但 code 是
    // INTERNAL_ERROR」這種半調子實作照樣綠。
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('Prisma 丟 P2002 時回 409 而不是 500', async () => {
    nextError = new Prisma.PrismaClientKnownRequestError('mocked', {
      code: 'P2002',
      clientVersion: 'test',
    });

    const res = await request(app.getHttpServer())
      .get('/surveys/隨便一個id')
      .expect(409);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('CONFLICT');
  });

  it('Prisma 丟 P2003 時回 400 而不是 500', async () => {
    nextError = new Prisma.PrismaClientKnownRequestError('mocked', {
      code: 'P2003',
      clientVersion: 'test',
    });

    const res = await request(app.getHttpServer())
      .get('/surveys/隨便一個id')
      .expect(400);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('未知錯誤回 500，且 message 不含原始錯誤內容', async () => {
    nextError = new Prisma.PrismaClientKnownRequestError('mocked', {
      code: 'P1001',
      clientVersion: 'test',
    });

    const res = await request(app.getHttpServer())
      .get('/surveys/隨便一個id')
      .expect(500);

    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).not.toContain('mocked');
  });

  it('未知的 Prisma 錯誤碼會留下 logger.error，不被安全網吞掉', async () => {
    // [教學] 這一條驗的東西在 body 裡看不見 —— 它是唯一保護「認不得的碼要走進
    // 既有的 500 分支」那個決定的測試。
    //
    // 沒有它的話，把 filter 改成在 Prisma 分支裡自己補一份 ?? 500，
    // 上面四條**全部照樣綠**（實測過）：狀態碼、code、message 一字不差，
    // 唯一的差別是伺服器 log 從此一片空白，線上出事時查不到任何線索。
    nextError = new Prisma.PrismaClientKnownRequestError('mocked', {
      code: 'P1001',
      clientVersion: 'test',
    });

    await request(app.getHttpServer()).get('/surveys/隨便一個id').expect(500);

    expect(loggedErrors.length).toBeGreaterThan(0);
  });
});
