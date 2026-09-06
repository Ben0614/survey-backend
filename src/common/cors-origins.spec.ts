// ============================================================
// [教學] cors-origins.spec.ts —— 專案第二支單元測試（Ch16）
//
// 什麼時候被執行：`pnpm test`（**不是** `pnpm test:e2e`）。
// 兩份設定是分開的：pnpm test 的 rootDir 是 src、只找 *.spec.ts，
// 所以這個檔案要跟被測的那一支並排放（見 survey.rules.spec.ts 的檔頭）。
//
// 為什麼這一支測得起來：parseCorsOrigins 是**純函式** ——
// 不注入零件、不碰資料庫、不丟 HTTP 例外。跟 survey.rules.ts 同一條判準：
// **拿掉外部依賴之後還剩下判斷邏輯的，就用單元測試。**
//
// 而這裡有一件 e2e **做不到**的事：e2e 跑起來時 CORS_ORIGIN 一定是對的
// （test/setup-env.ts 灌好了），所以「沒設 / 空字串 / 只有逗號」那三條路
// 在 e2e 裡永遠走不到。**要驗防呆，就得能直接餵壞值給那個函式。**
//
// ⚠️ 驗「會不會丟例外」時，expect 要收一個**還沒被呼叫的函式**：
//
//     expect(() => parseCorsOrigins('')).toThrow('CORS_ORIGIN');
//     //     └─ 少了這個箭頭，例外會在 expect 被呼叫之前就往外跑掉，
//     //        測試紅的原因會變成「測試自己炸了」而不是斷言失敗
//
// toThrow 帶字串是**包含**比對，不是完全相等。這裡刻意都帶了參數 ——
// 只寫 toThrow() 的話，把訊息整段改成 'x' 測試照樣綠，
// 而那幾條測試的名稱裡寫著「訊息說得出…」，那就成了一句謊話。
//
// 下一站：src/swagger.ts（回到主動線；它產出的是文件而不是行為，
//         所以刻意不放進 setup-app）
// ============================================================

import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  // 前三條長得幾乎一樣（同樣的斷言、只換傳進去的值），而它們**不是重複的** ——
  // 突變測試證明各自守著不同的東西：
  //
  //   把 `raw ?? ''` 拿掉         → 只有 undefined 那條紅
  //   把 `.filter(...)` 拿掉      → 只有 ',' / ' ' 那條紅
  //   把整個 if 拿掉              → 三條都紅
  //
  // 對應的是三種**人真的會在部署平台的輸入框裡打出來**的東西：
  // 沒填、填了又刪光、貼上時多帶了逗號。
  it('逗號分隔的字串，切成陣列並去掉每一段前後的空白', () => {
    const raw = ' http://localhost:3000 ,https://a.com ';
    const origins = parseCorsOrigins(raw);

    expect(origins.length).toBe(2);
    expect(origins[0]).toBe('http://localhost:3000');
    expect(origins[1]).toBe('https://a.com');
  });

  it('沒設（undefined）時丟出錯誤，訊息說得出漏了哪個環境變數', () => {
    expect(() => parseCorsOrigins(undefined)).toThrow('CORS_ORIGIN');
  });

  it('設成空字串時同樣丟出錯誤 —— 那正是 getOrThrow 擋不到的那一種', () => {
    expect(() => parseCorsOrigins('')).toThrow('CORS_ORIGIN');
  });

  it('只有逗號與空白時丟出錯誤，不會產出一個空字串的 origin', () => {
    expect(() => parseCorsOrigins(',')).toThrow('CORS_ORIGIN');
    expect(() => parseCorsOrigins(' ')).toThrow('CORS_ORIGIN');
  });

  // 結尾斜線是 CORS 最常見的填錯法，而且它跟空字串一樣不會有任何症狀 ——
  // 除了「瀏覽器 100% 紅」。斷言到那個錯的值本身，是為了確認訊息真的
  // **指出是哪一個** origin 有問題（清單有五個時，只說「有斜線」沒有用）。
  it('origin 帶結尾斜線時丟出錯誤，訊息指得出是哪一個', () => {
    expect(() => parseCorsOrigins('http://localhost:3000/')).toThrow(
      'http://localhost:3000/',
    );
  });

  // 只有一個有問題也要擋 —— 不能因為「其他都對」就放過。
  it('清單裡只要有一個帶結尾斜線，整組都不通過', () => {
    expect(() =>
      parseCorsOrigins('http://localhost:3000,https://a.com/'),
    ).toThrow('https://a.com/');
  });
});
