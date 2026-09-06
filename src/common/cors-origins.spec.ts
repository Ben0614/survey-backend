import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
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
