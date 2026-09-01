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
import { buildSwaggerDocument } from '../src/swagger';

// [教學] OpenAPI 物件的官方型別非常寬鬆（每個位置都可能是 schema 或 $ref），
// 照著它一層層收窄會寫掉半個檔案。這裡的做法跟 surveys.e2e-spec.ts 的
// SurveyBody 一樣：宣告「我預期它長這樣」的最小形狀，取值時轉一次。
//
// 這不是型別安全 —— 是把「不符預期」變成測試會紅的東西，而不是編譯期的事。
interface SchemaLike {
  properties?: Record<string, unknown>;
  required?: string[];
}

interface ParameterLike {
  name: string;
  in: string;
  required?: boolean;
}

interface JsonContentLike {
  content: Record<string, { schema: { $ref?: string } }>;
}

describe('Swagger 契約（buildSwaggerDocument）', () => {
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

  // [教學] 這三條是便宜的煙霧測試：spec 根本產不出來的時候，
  // 下面兩條主角的失敗訊息會變成「Cannot read properties of undefined」，
  // 完全看不出發生什麼事。先讓最基本的假設各自有一條測試守著。
  it('spec 產得出來：openapi 是 3 開頭，paths 共 11 條路徑', () => {
    const doc = buildSwaggerDocument(app);

    expect(doc.openapi.startsWith('3')).toBe(true);
    // Ch9 加了 /auth/register（輪 2）與 /auth/login（輪 3），9 → 11。
    // 這條會因為新增端點而紅是刻意的：它強迫你回頭確認新端點的契約標齊了。
    expect(Object.keys(doc.paths)).toHaveLength(11);
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
    // required 是 true = @ApiProperty / @ApiPropertyOptional 用錯（輪 ② 踩過，11/11 全中）。
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
      .send({ title: '員工滿意度調查' })
      .expect(201);

    const id = (created.body as { id: string }).id;
    const res = await request(app.getHttpServer())
      .get(`/surveys/${id}`)
      .expect(200);

    const doc = buildSwaggerDocument(app);
    const schema = doc.components?.schemas?.SurveyEntity as SchemaLike;

    const specKeys = Object.keys(schema.properties ?? {});
    const specRequired = schema.required ?? [];
    const realKeys = Object.keys(res.body as Record<string, unknown>);

    // [教學] **兩個方向都要比**，因為兩種錯這一章都真的發生過：
    //
    //   spec 多寫了 → 文件說謊，前端讀一個不存在的欄位（例如 meta 被標成陣列）
    //   spec 少寫了 → 文件漏講，前端不知道有這個欄位（QuestionEntity 一度漏了 surveyId）
    //
    // 只比一個方向的測試會漏掉另一半，而漏掉的那一半不會有任何症狀。

    // 方向一：spec 承諾「一定會有」的 key，實際回應必須都有。
    // 這裡用 required 而不是 properties —— questions 是 @ApiPropertyOptional，
    // 只有 ?includeQuestions=true 才出現，拿 properties 去比會誤判成失敗。
    // **required 的語義正好就是「一定會出現的 key」**，這條測試要的就是它。
    expect(specRequired.sort()).toEqual(
      specRequired.filter((k) => realKeys.includes(k)).sort(),
    );

    // 方向二：實際回應的每一個 key，spec 都必須描述過（不論選填或必填）。
    for (const key of realKeys) {
      expect(specKeys).toContain(key);
    }
  });

  it('ErrorResponseEntity 的屬性，跟實際打一次 404 拿到的 body 完全一致', async () => {
    const res = await request(app.getHttpServer())
      .get(`/surveys/nonexistent-id`)
      .expect(404);

    const doc = buildSwaggerDocument(app);

    const outer = doc.components?.schemas?.ErrorResponseEntity as SchemaLike;
    const inner = doc.components?.schemas?.ErrorBodyEntity as SchemaLike;
    const errorBody = (res.body as { error: Record<string, unknown> }).error;

    expect(outer.required).toEqual(['error']);

    const specKeys = Object.keys(inner.properties ?? {});
    const specRequired = inner.required ?? [];
    const realKeys = Object.keys(errorBody);

    expect(specRequired.sort()).toEqual(
      specRequired.filter((k) => realKeys.includes(k)).sort(),
    );

    for (const key of realKeys) {
      expect(specKeys).toContain(key);
    }
  });
});
