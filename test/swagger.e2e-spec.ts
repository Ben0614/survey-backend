// ============================================================
// [教學] swagger.e2e-spec.ts —— 驗「文件有沒有說謊」的測試
//
// 跑法：pnpm test:e2e -- test/swagger.e2e-spec.ts
//
// 跟前面四支 e2e 的差別：它們驗的是「API 行為對不對」，這一支驗的是
// **API 行為與 /docs 上那份契約一不一致**。Ch7 的 entity 是第二份真相
// （見 src/surveys/entities/survey.entity.ts 檔頭），tsc 管不到它，
// 這支測試是它唯一的偵測器。
//
// 下一站：test/helpers/expect-schema-matches.ts（下面幾條共用的雙向比對，實作在那裡）
// ============================================================

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { buildSwaggerDocument } from '../src/swagger';
import { OpenAPIObject } from '@nestjs/swagger';
import { registerAndLogin, authHeader } from './helpers/auth';
import {
  expectSchemaMatches,
  SchemaLike,
} from './helpers/expect-schema-matches';

// [教學] 這兩個介面跟 helper 裡的 SchemaLike 是同一種做法：宣告「我預期它長這樣」
// 的最小形狀，取值時轉一次（理由見 helpers/expect-schema-matches.ts 檔頭）。
// 一個屬性在 spec 裡長什麼樣。SchemaLike.properties 是 Record<string, unknown>，
// 取出來的東西要先收窄成這個形狀才讀得到 minLength 之類的欄位。
interface PropertyLike {
  type?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
}

interface ParameterLike {
  name: string;
  in: string;
  required?: boolean;
}

interface OperationLike {
  // security 存在 = 這支要帶 token（@ApiBearerAuth() 產生的，見 api-authenticated.decorator.ts）
  security?: unknown[];
  responses?: Record<string, unknown>;
}

// doc.paths[路徑] 底下除了方法之外還有 parameters 之類的 key，要濾掉。
const HTTP_METHODS = ['get', 'post', 'patch', 'delete', 'put'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/** 從 spec 撈出所有「要帶 token」的端點（= 有 security 的）。 */
function collectSecuredOperations(doc: OpenAPIObject) {
  const out: { method: HttpMethod; path: string; op: OperationLike }[] = [];

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(
      item as Record<string, OperationLike>,
    )) {
      if (!HTTP_METHODS.includes(method as HttpMethod)) continue;
      if (!op.security) continue;
      out.push({ method: method as HttpMethod, path, op });
    }
  }

  return out;
}

interface JsonContentLike {
  content: Record<string, { schema: { $ref?: string } }>;
}

describe('Swagger 契約（buildSwaggerDocument）', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authToken: string;

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
  });

  // [教學] 這三條是便宜的煙霧測試：spec 根本產不出來的時候，
  // 下面兩條主角的失敗訊息會變成「Cannot read properties of undefined」，
  // 完全看不出發生什麼事。先讓最基本的假設各自有一條測試守著。
  it('spec 產得出來：openapi 是 3 開頭，paths 共 12 條路徑', () => {
    const doc = buildSwaggerDocument(app);

    expect(doc.openapi.startsWith('3')).toBe(true);
    // Ch9 加了 /auth/register 與 /auth/login（9 → 11），Ch10 輪 3 加了
    // /auth/me（11 → 12）。
    // 這條會因為新增端點而紅是刻意的：它強迫你回頭確認新端點的契約標齊了。
    expect(Object.keys(doc.paths)).toHaveLength(12);
  });

  it('POST /surveys 的 requestBody 指向 CreateSurveyDto，title 在 required 裡', () => {
    const doc = buildSwaggerDocument(app);

    // requestBody 只記一個 $ref，屬性長什麼樣要去 components.schemas 找 ——
    // 這個兩段式就是輪 ① 量到的那件事：Swagger 認得 class，但屬性要靠 @ApiProperty。
    const body = doc.paths['/surveys'].post?.requestBody as JsonContentLike;
    expect(body.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/CreateSurveyDto',
    );

    const schema = doc.components?.schemas?.CreateSurveyDto as SchemaLike;
    expect(schema.required).toContain('title');
  });

  it('GET /surveys 的 page 參數存在，且 required 是 false', () => {
    const doc = buildSwaggerDocument(app);

    const params = doc.paths['/surveys'].get?.parameters as ParameterLike[];
    const page = params.find((p) => p.name === 'page');

    // 兩條斷言各自抓不同的錯：不存在 = 整份 query DTO 沒被標到；
    // required 是 true = @ApiProperty / @ApiPropertyOptional 用錯（輪 ② 踩過，12/12 全中）。
    expect(page).toBeDefined();
    expect(page?.required).toBe(false);
  });

  // [教學] 從這裡開始是這一章真正的產出。
  //
  // 上面三條驗的是「spec 自己說了什麼」，這一條驗的是
  // **spec 說的跟伺服器實際回的一不一樣** —— 那是 tsc 永遠不會知道的事。
  it('SurveyEntity 的屬性，跟實際打 GET /surveys/:id 拿到的 key 完全一致', async () => {
    const created = await request(app.getHttpServer())
      .post('/surveys')
      .set(...authHeader(authToken))
      .send({ title: '員工滿意度調查' })
      .expect(201);

    const id = (created.body as { id: string }).id;
    const res = await request(app.getHttpServer())
      .get(`/surveys/${id}`)
      .set(...authHeader(authToken))
      .expect(200);

    const doc = buildSwaggerDocument(app);

    expectSchemaMatches(
      doc,
      'SurveyEntity',
      res.body as Record<string, unknown>,
    );
  });

  it('ErrorResponseEntity 的屬性，跟實際打一次 404 拿到的 body 完全一致', async () => {
    const res = await request(app.getHttpServer())
      .get(`/surveys/nonexistent-id`)
      .set(...authHeader(authToken))
      .expect(404);

    const doc = buildSwaggerDocument(app);

    const outer = doc.components?.schemas?.ErrorResponseEntity as SchemaLike;
    const errorBody = (res.body as { error: Record<string, unknown> }).error;

    // 外層只有 error 一個 key —— 這條斷言 helper 幫不上忙（它比的是屬性集合對不對得上，
    // 不是「required 剛好等於某個清單」），所以留在這裡。真正的內容在 ErrorBodyEntity。
    expect(outer.required).toEqual(['error']);

    expectSchemaMatches(doc, 'ErrorBodyEntity', errorBody);
  });

  // [教學] 前提資料一律走 HTTP，不用 prisma.question.create ——
  // 這條驗的就是「**那支端點**回什麼」，繞過它等於改成測資料庫欄位。
  //
  // （responses.e2e-spec.ts 用 prisma 直接建 PUBLISHED 問卷是另一回事：
  //   那邊繞過的是「不該由那支測試負責」的前置規則，不是被測的對象本身。）
  it('QuestionEntity 的屬性，跟實際打 POST /surveys/:surveyId/questions 拿到的 key 完全一致', async () => {
    const survey = await request(app.getHttpServer())
      .post('/surveys')
      .set(...authHeader(authToken))
      .send({ title: '員工滿意度調查' })
      .expect(201);

    const surveyId = (survey.body as { id: string }).id;

    const res = await request(app.getHttpServer())
      .post(`/surveys/${surveyId}/questions`)
      .set(...authHeader(authToken))
      .send({
        title: '題目一',
        type: 'SINGLE_CHOICE',
        options: ['選項1', '選項2', '選項3'],
      })
      .expect(201);

    const doc = buildSwaggerDocument(app);

    expectSchemaMatches(
      doc,
      'QuestionEntity',
      res.body as Record<string, unknown>,
    );
  });

  // [教學] 下面三條都要「一份已發布、有題目、而且有人填過的問卷」——
  // 四個請求，抄三次就是三份會各自演化的前提資料。
  //
  // 這跟這一輪開頭把雙向比對抽成 expectSchemaMatches 是同一個判準：
  // **同一段東西要出現第三次的時候，就是抽的時候。**
  //
  // 回傳四樣，呼叫端要哪個解構哪個。
  async function seedPublishedSurveyWithResponse() {
    const survey = await request(app.getHttpServer())
      .post('/surveys')
      .set(...authHeader(authToken))
      .send({ title: '員工滿意度調查' })
      .expect(201);

    const surveyId = (survey.body as { id: string }).id;

    const question = await request(app.getHttpServer())
      .post(`/surveys/${surveyId}/questions`)
      .set(...authHeader(authToken))
      .send({
        title: '題目一',
        type: 'SINGLE_CHOICE',
        options: ['選項1', '選項2', '選項3'],
      })
      .expect(201);

    const questionId = (question.body as { id: string }).id;

    // 題目只有 DRAFT 能加、作答只有 PUBLISHED 能送 —— 順序不能換（Ch3 / Ch5 的規則）。
    await request(app.getHttpServer())
      .patch(`/surveys/${surveyId}/publish`)
      .set(...authHeader(authToken))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/surveys/${surveyId}/responses`)
      .set(...authHeader(authToken))
      .send({ answers: [{ questionId, content: '選項1' }] })
      .expect(201);

    return {
      surveyId,
      questionId,
      responseId: (response.body as { id: string }).id,
      responseBody: response.body as Record<string, unknown>,
    };
  }

  it('ResponseEntity 的屬性，跟實際打 POST /surveys/:surveyId/responses 拿到的 key 完全一致', async () => {
    const { responseBody } = await seedPublishedSurveyWithResponse();

    const doc = buildSwaggerDocument(app);

    // POST 回的是 ResponseEntity（不帶 answers），GET /responses/:id 才是
    // ResponseDetailEntity —— 同一張表、兩種形狀（見 response.entity.ts 檔頭）。
    expectSchemaMatches(doc, 'ResponseEntity', responseBody);
  });

  it('ResponseDetailEntity 的屬性，跟實際打 GET /responses/:id 拿到的 key 完全一致', async () => {
    const { responseId } = await seedPublishedSurveyWithResponse();

    const res = await request(app.getHttpServer())
      .get(`/responses/${responseId}`)
      .set(...authHeader(authToken))
      .expect(200);

    const doc = buildSwaggerDocument(app);

    expectSchemaMatches(
      doc,
      'ResponseDetailEntity',
      res.body as Record<string, unknown>,
    );
  });

  // [教學] 這一輪的主角。上面那條只比得到第一層的
  // { id, surveyId, createdAt, answers } —— 四個 key 全中就綠，
  // 而 AnswerEntity 與 QuestionEntity 的任何錯都躺在 answers 裡面，它一個都碰不到。
  it('GET /responses/:id 的 answers[0] 與 answers[0].question，分別對得上 AnswerEntity 與 QuestionEntity', async () => {
    const { responseId } = await seedPublishedSurveyWithResponse();

    const res = await request(app.getHttpServer())
      .get(`/responses/${responseId}`)
      .set(...authHeader(authToken))
      .expect(200);

    const body = res.body as {
      answers: { question: Record<string, unknown> }[] &
        Record<string, unknown>[];
    };

    // **這一行不能省。** 前提資料若沒準備到「有題目、有人填答」，answers 會是空陣列，
    // 下面兩個比對就變成拿 undefined 去比 —— 而那不會紅，只會悄悄什麼都沒比到。
    // expectSchemaMatches 裡還有第二道防線，但第一道要下在這裡：
    // 只有這裡知道 answers 該有幾筆。
    expect(body.answers.length).toBeGreaterThanOrEqual(1);

    const doc = buildSwaggerDocument(app);

    expectSchemaMatches(doc, 'AnswerEntity', body.answers[0]);
    expectSchemaMatches(doc, 'QuestionEntity', body.answers[0].question);
  });

  it('UserEntity 的屬性，跟實際打 POST /auth/register 拿到的 key 完全一致', async () => {
    // beforeEach 的 registerAndLogin 已經用掉預設那組 email，這裡要另一組 ——
    // 撞名的話 email 的 @unique 會讓註冊回 409，而 .expect(201) 會當場紅在這裡
    // （那正是 helpers/auth.ts 檔頭說的「前提資料出問題就該當場紅」）。
    //
    // 註冊是 @Public()，所以這支不帶 token。
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'swagger-contract@example.com', password: 'zxcv1234' })
      .expect(201);

    const doc = buildSwaggerDocument(app);

    expectSchemaMatches(doc, 'UserEntity', res.body as Record<string, unknown>);
  });

  // [教學] 這兩條是 Ch13 輪 ② 的產出，驗的是同一件事的兩半：
  //   第一條 —— 契約**說了**「不帶票會 401」嗎？（只讀 spec，不發請求）
  //   第二條 —— 契約說的那件事**是真的**嗎？（實際打，不帶 token）
  //
  // 少了第二條，契約可以在完全沒人發現的情況下說謊。
  it('spec 裡每一支要帶 token 的端點，都標了 401', () => {
    const doc = buildSwaggerDocument(app);
    const secured = collectSecuredOperations(doc);

    // 沒撈到任何端點 = 撈的邏輯壞了，而下面的迴圈跑 0 次照樣綠。
    expect(secured.length).toBeGreaterThan(0);

    // [教學] 收集成清單再一次比對，而不是在迴圈裡逐個 expect ——
    // 後者失敗時只印得出第一個漏標的端點，前者一次列出全部。
    const missing = secured
      .filter(({ op }) => !('401' in (op.responses ?? {})))
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`);

    expect(missing).toEqual([]);
  });

  // [教學] 這一輪的主角。
  //
  // 它便宜得出乎意料，理由是 **guard 跑在路由 handler 之前**：
  // 不帶 token 的請求在「這個 id 存不存在」被問到之前就已經被擋下，
  // 所以路徑參數隨便填一個字串就好，一筆前提資料都不必準備。
  //
  // 它也是「誤標」的偵測器：哪天有人把 @ApiAuthenticated() 貼到 @Public()
  // 的端點上（例如 /health），那支會進到下面的清單，而它實際回 200 —— 當場紅。
  it('每一支要帶 token 的端點，不帶 token 打過去實際回 401', async () => {
    const doc = buildSwaggerDocument(app);
    const secured = collectSecuredOperations(doc);

    expect(secured.length).toBeGreaterThan(0);

    const wrong: string[] = [];

    for (const { method, path } of secured) {
      const url = path.replace(/\{[^}]+\}/g, 'any-id');
      const res = await request(app.getHttpServer())[method](url);

      if (res.status !== 401) {
        wrong.push(`${method.toUpperCase()} ${url} → ${res.status}`);
      }
    }

    // 同上：收集完再比，失敗訊息會一次列出所有不符的端點與它實際回的狀態碼。
    expect(wrong).toEqual([]);
  });

  // [教學] 這三條驗的是 Ch15 輪 ② 的產出：**把驗證規則寫進契約**。
  //
  // 後端的 @MinLength(8) 與 @ApiProperty 的 minLength: 8 是**兩個獨立的裝飾器**，
  // 改一個忘了另一個不會有任何東西叫 —— 所以第一條只證明「契約寫了」，
  // 第二條才證明「契約沒說謊」。這是這一章反覆出現的同一種測試
  //（同 Ch13 那條「spec 說會回 401 的端點，不帶 token 打真的回 401」）。
  it('RegisterDto 的 password 契約標了 minLength 8 / maxLength 72，email 標了 format email', () => {
    const doc = buildSwaggerDocument(app);
    const schema = doc.components?.schemas?.RegisterDto as SchemaLike;

    const password = schema.properties?.password as PropertyLike;
    const email = schema.properties?.email as PropertyLike;

    // 8 與 72 不是隨便訂的：72 是 bcrypt 的硬上限（見 register.dto.ts 檔頭）。
    expect(password.minLength).toBe(8);
    expect(password.maxLength).toBe(72);

    // format 是 OpenAPI 的標準字串，跟 createdAt 的 'date-time' 同一個位置。
    expect(email.format).toBe('email');
  });

  // [教學] 這一輪的主角。上面那條只讀 spec，這條實際打一次 ——
  // 它是唯一會抓到「@MinLength 改了、@ApiProperty 沒跟上」的測試。
  //
  // 壞掉的樣子：有人把 @MinLength(8) 改成 10，契約還寫著 8。
  // 前端照契約做表單驗證，使用者輸入 9 碼、前端放行、後端回 400 ——
  // 而 /docs 上白紙黑字寫著 8。沒有任何測試會紅。
  it('契約說的 minLength 是真的：註冊送 7 碼密碼會被擋下', async () => {
    const doc = buildSwaggerDocument(app);
    const schema = doc.components?.schemas?.RegisterDto as SchemaLike;
    const password = schema.properties?.password as PropertyLike;

    // 不寫死 7，從契約讀出「最短幾碼」再送少一碼 ——
    // 這樣規則改成 10 的時候，這條測試會跟著送 9 碼，不必手動改。
    const tooShort = 'a'.repeat((password.minLength ?? 8) - 1);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'min-length-check@example.com', password: tooShort })
      .expect(400);

    const body = res.body as { error: { code: string } };

    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  // [教學] 反面對照，防的是「順手把 register 那份抄過去」。
  //
  // 登入的 password 只有 @IsNotEmpty()，**沒有長度限制是刻意的**：
  // 密碼規則會變，而舊帳號的密碼可能不符合新規則 —— 那些人還是要登得進來
  //（理由見 login.dto.ts 的檔頭：為什麼不重用 register 那份 DTO）。
  //
  // 抄過去就是「文件說謊的第三種形狀」：寫了一句不成立的話
  //（契約說最少 8 碼，實際上 1 碼也收）。同 Ch13 的 QuestionEntity.order 那個 default: 0。
  it('LoginDto 的 password 刻意沒有長度限制，契約也不能寫', () => {
    const doc = buildSwaggerDocument(app);
    const schema = doc.components?.schemas?.LoginDto as SchemaLike;
    const password = schema.properties?.password as PropertyLike;

    expect(password.minLength).toBeUndefined();
    expect(password.maxLength).toBeUndefined();
  });
});
