// ============================================================
// [教學] cors-origins.ts —— 把一串環境變數切成 origin 清單（Ch16）
//
// 什麼時候被執行：**整個 process 一輩子只跑一次**，在 setup-app.ts
// 呼叫 enableCors 之前。跟同一個資料夾的 field-errors.ts 剛好是對照組 ——
// 那兩個函式每個請求都可能跑，這一個跑完就再也不會被呼叫。
//
// **那個差別決定了它出錯時該怎麼辦：把整個 process 弄死。**
// 每個請求都會跑的東西要「降級，不要炸掉」（field-errors.ts 的檔頭寫了原因）；
// 啟動時只跑一次的東西相反 —— 這裡不炸，後果是一台「看起來活著、
// 但瀏覽器全紅」的伺服器，而那個症狀 Ch14 已經確認過會騙人：
// /health 綠、curl 正常、Swagger 打得開，錯的只有真的瀏覽器。
//
// 為什麼不直接在 setup-app.ts 裡寫三行：判準跟 survey.rules.ts、
// field-errors.ts 同一條 —— **拿掉外部依賴之後還剩下判斷邏輯**。
// 這裡剩下的是「怎麼切、什麼算沒設」，不必啟動任何東西就測得到；
// setup-app.ts 則需要一個 INestApplication 才跑得起來。
//
// 下一站：src/swagger.ts（同樣由 main.ts 那一段組裝流程呼叫，
//         但它產出的是「文件」而不是行為，所以刻意不進 setup-app）
// ============================================================

/**
 * 把 `CORS_ORIGIN` 的值切成允許的來源清單。
 *
 * @param raw 環境變數的原始值，逗號分隔（`http://localhost:3000,https://a.com`）
 * @throws 沒設、空字串、或切完一個都不剩時，丟出 Error 讓應用起不來
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  // `raw ?? ''` 是刻意的：它讓 undefined 跟空字串從第一行就走同一條路。
  // 沒有它的話 undefined.split 會炸成 TypeError，而那種訊息看不懂。
  const origins = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

  // 三種「沒設」的形狀（undefined、''、',  ,'）上面都已經收斂成 []，
  // 所以這裡只要判斷一件事，不必各寫一個分支。
  //
  // ⚠️ **這一段就是 ConfigService.getOrThrow 擋不到的那個缺口。**
  // 它的原始碼是 isUndefined(value) 才 throw，而 dotenv 讀到 `CORS_ORIGIN=`
  // 給的是空字串 —— 那一關會過。同一個坑 .env.example 在 JWT_SECRET 那段
  // 記過一次了，這是第二次現場。
  //
  // 空字串沒被擋下來的後果：''.split(',') 得到 ['']，那是一個永遠不會
  // 等於任何 Origin 標頭的字串。應用起得來、部署顯示成功、e2e 全綠，
  // 只有真的瀏覽器 100% 紅。
  if (origins.length === 0) {
    throw new Error(
      [
        '環境變數 CORS_ORIGIN 沒有設定（或設成了空值）—— 應用刻意不啟動。',
        '',
        '它是「允許哪些前端來源」的清單，多個用逗號分隔：',
        '  CORS_ORIGIN=http://localhost:3000',
        '  CORS_ORIGIN=http://localhost:3000,https://survey.example.com',
        '',
        '本機填在 .env（格式與注意事項見 .env.example），',
        '正式環境填在部署平台的環境變數，不在任何檔案裡。',
      ].join('\n'),
    );
  }

  // 結尾斜線是 CORS 最常見的填錯法，而它的壞法跟空字串一樣安靜：
  // 應用起得來、部署成功、e2e 全綠，只有真的瀏覽器 100% 紅。
  //
  // 原因是**瀏覽器送來的 Origin 標頭永遠沒有路徑部分** —— 規格就是
  // `scheme://host:port`，沒有結尾的 /。所以 'http://localhost:3000/'
  // 這個值永遠不會等於任何一個請求的 Origin。
  //
  // 選擇「拒絕」而不是「自動去掉」：CORS 是安全設定，而靜默修正會讓
  // 「你以為設的」跟「實際生效的」不一致 —— 下一個看的人不知道發生過修正。
  // 業界對安全相關設定也是這一派（express 的 cors、Spring、Rails 都不驗，
  // 所以這是應用自己要做的決定）。
  const trailingSlash = origins.filter((origin) => origin.endsWith('/'));

  if (trailingSlash.length > 0) {
    throw new Error(
      [
        `CORS_ORIGIN 有結尾斜線：${trailingSlash.join(', ')}`,
        '',
        'origin 只到 port 為止，不能有路徑 —— 瀏覽器送來的 Origin 標頭',
        '永遠是 scheme://host:port，帶斜線的值永遠匹配不到任何請求。',
        '',
        '  ✅ http://localhost:3000',
        '  ❌ http://localhost:3000/',
      ].join('\n'),
    );
  }

  return origins;
}
