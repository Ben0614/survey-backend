// ============================================================
// [教學] test/helpers/expect-schema-matches.ts —— 「spec 說的」與「伺服器真的回的」對得上嗎
//
// 什麼時候被執行：由 test/swagger.e2e-spec.ts 的各條測試呼叫（同 helpers/auth.ts）。
// 它不發請求、不碰資料庫 —— 呼叫端負責把「spec」與「實際回應」兩樣東西準備好，
// 這裡只負責比對。
//
// 為什麼要抽出來：Ch7 留下兩條一致性測試，用的是同一段雙向比對。
// Ch13 輪 ① 要再加五條，不抽的話同一段邏輯會有七份 ——
// 而「兩個方向都要比」這件事只要有一份漏抄一半，那條測試就會安靜地少驗一半。
//
// 下一站：src/surveys/survey.rules.spec.ts（同樣是測試，但什麼都不必準備 —— 動線終點）
// ============================================================

import { OpenAPIObject } from '@nestjs/swagger';

// [教學] OpenAPI 物件的官方型別非常寬鬆（每個位置都可能是 schema 或 $ref），
// 照著它一層層收窄會寫掉半個檔案。這裡的做法跟 surveys.e2e-spec.ts 的
// SurveyBody 一樣：宣告「我預期它長這樣」的最小形狀，取值時轉一次。
//
// 這不是型別安全 —— 是把「不符預期」變成測試會紅的東西，而不是編譯期的事。
export interface SchemaLike {
  properties?: Record<string, unknown>;
  required?: string[];
}

/**
 * 比對 `components.schemas.<schemaName>` 與一份實際的回應內容，兩個方向都比。
 *
 * @param doc        buildSwaggerDocument(app) 的產物
 * @param schemaName components.schemas 底下的名字，例如 'SurveyEntity'
 * @param realBody   要拿去比的那一塊實際回應
 */
export function expectSchemaMatches(
  doc: OpenAPIObject,
  schemaName: string,
  realBody: Record<string, unknown>,
): void {
  // 第三個參數收的是「一塊 body」而不是整個 res —— 所以**要比哪一塊由呼叫端決定**。
  // ErrorResponseEntity 那條比的是 body.error、AnswerEntity 那條比的是 answers[0]，
  // 形狀各不相同。把那個選擇留在呼叫端，這裡就不必為每個 entity 加一個分支。
  const schema = doc.components?.schemas?.[schemaName] as
    SchemaLike | undefined;

  // schemaName 打錯字時，下一行的 schema.properties 會丟出
  // 「Cannot read properties of undefined」—— 看不出是名字錯了。先擋在這裡說清楚。
  if (!schema) {
    throw new Error(
      `components.schemas.${schemaName} 不存在。` +
        `可能是名字打錯，或那個 entity 還沒有被任何端點的 @ApiResponse 引用到。`,
    );
  }

  const specKeys = Object.keys(schema.properties ?? {});
  const specRequired = schema.required ?? [];
  const realKeys = Object.keys(realBody);

  // [教學] 這一行是**防呆，不是斷言**：拿一個空物件進來比，下面兩個方向都會通過
  // （沒有 key 要檢查，迴圈跑 0 次），測試不會紅，只會悄悄什麼都沒比到。
  //
  // 最容易踩到的場合是巢狀資料：GET /responses/:id 若沒準備到「有題目、有人填答」，
  // answers[0] 就是 undefined，呼叫端補一個 `?? {}` 就正好掉進這裡。
  expect(realKeys.length).toBeGreaterThan(0);

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
  //
  // slice() 是為了不就地排序 schema.required —— 那是 doc 裡的陣列，
  // 同一個 doc 會被後面的斷言再讀一次。
  expect(specRequired.slice().sort()).toEqual(
    specRequired.filter((k) => realKeys.includes(k)).sort(),
  );

  // 方向二：實際回應的每一個 key，spec 都必須描述過（不論選填或必填）。
  for (const key of realKeys) {
    expect(specKeys).toContain(key);
  }
}
