// ============================================================
// [教學] survey.rules.spec.ts —— 專案的第一支「單元測試」
//
// 跑法：pnpm test（不是 pnpm test:e2e）
//   pnpm test      → rootDir 是 src、只找 *.spec.ts     ← 這個檔案
//   pnpm test:e2e  → rootDir 是專案根目錄、只找 test/*.e2e-spec.ts
// 兩份設定是分開的（見 docs/設定檔導讀.md），所以兩種測試永遠不會互相干擾。
//
// 跟你寫過的 e2e 比，這個檔案最值得注意的是**它沒有什麼**：
// 沒有 beforeAll、沒有 Test.createTestingModule、沒有 app.init()、
// 沒有 resetDb、沒有 supertest、沒有連任何一個資料庫。
// 就只是 import 一個函式，呼叫它，看回傳值。
//
// 能這樣寫的唯一原因是 survey.rules.ts 裡的函式**沒有依賴**——
// 不注入東西、不碰資料庫、不丟 HTTP 例外。「純函式好測」不是抽象的口號，
// 這裡看到的就是它的具體形狀：省掉的每一行都是被依賴逼出來的準備工作。
//
// 反過來說也成立：這也是為什麼專案其他地方**刻意不寫**單元測試。
// service 幾乎都是「收參數 → 交給 Prisma → 回結果」，把 Prisma mock 掉之後
// 測到的只剩下 mock 自己（見 CLAUDE.md 的「測試策略」）。
//
// 動線終點。回到 src/main.ts 再走一次，看看是不是都串起來了。
// ============================================================

import { SurveyStatus } from '../generated/prisma/enums';
import {
  canEditQuestions,
  canUnpublish,
  canSubmitResponse,
  canManageSurvey,
  canSeeSurvey,
  canDelete,
} from './survey.rules';
import { Role } from '../generated/prisma/enums';

describe('canEditQuestions', () => {
  // [教學] 用 SurveyStatus.DRAFT 而不是字串 'DRAFT'，理由跟 survey.rules.ts 裡一樣：
  // 哪天 schema 改了名字，這裡會編譯失敗而不是安靜地測錯東西。
  it('DRAFT 的問卷可以改題目', () => {
    expect(canEditQuestions(SurveyStatus.DRAFT)).toBe(true);
  });

  // 這一條才是規則存在的理由。已發布代表**可能有人正在填寫**，
  // 那跟「目前有幾筆填答紀錄」不是同一件事 —— 有人開著頁面還沒送出時，
  // 填答數仍然是 0。要改已發布的問卷，正式路徑是先撤回發布（見下面那組）。
  it('PUBLISHED 的問卷不能改題目', () => {
    expect(canEditQuestions(SurveyStatus.PUBLISHED)).toBe(false);
  });
});

describe('canUnpublish', () => {
  it('沒有任何人填答時可以撤回發布', () => {
    expect(canUnpublish(0)).toBe(true);
  });

  // 已經有人填過就不給撤回：撤回之後題目就能改，
  // 而舊的答案是綁在舊題目上的，改完會對不起來。
  it('已經有人填答就不能撤回發布', () => {
    expect(canUnpublish(1)).toBe(false);
  });
});

describe('canSubmitResponse', () => {
  it('PUBLISHED 的問卷可以被填答', () => {
    expect(canSubmitResponse(SurveyStatus.PUBLISHED)).toBe(true);
  });
  it('DRAFT 的問卷不能被填答', () => {
    expect(canSubmitResponse(SurveyStatus.DRAFT)).toBe(false);
  });
});

describe('canManageSurvey', () => {
  it('擁有者本人 → true', () => {
    const ownerId = 'asdfg123456';
    const user = {
      id: 'asdfg123456',
      role: Role.USER,
    };
    expect(canManageSurvey(ownerId, user)).toBe(true);
  });

  it('不是擁有者、也不是管理員 → false', () => {
    const ownerId = 'asdfg123456';
    const user = {
      id: 'zxcvb78945614',
      role: Role.USER,
    };
    expect(canManageSurvey(ownerId, user)).toBe(false);
  });

  it('管理員改別人的問卷 → true', () => {
    const ownerId = 'asdfg123456';
    const user = {
      id: 'zxcvb78945614',
      role: Role.ADMIN,
    };
    expect(canManageSurvey(ownerId, user)).toBe(true);
  });

  it('ownerId 是 null 的無主問卷，一般使用者 → false', () => {
    const ownerId = null;
    const user = {
      id: 'zxcvb78945614',
      role: Role.USER,
    };
    expect(canManageSurvey(ownerId, user)).toBe(false);
  }); // ← 主角

  it('ownerId 是 null 的無主問卷，管理員 → true', () => {
    const ownerId = null;
    const user = {
      id: 'zxcvb78945614',
      role: Role.ADMIN,
    };
    expect(canManageSurvey(ownerId, user)).toBe(true);
  });
});

describe('canSeeSurvey', () => {
  it('PUBLISHED 的問卷，不是自己的也看得到', () => {
    const status = 'PUBLISHED';
    const ownerId = 'asdfg123456';
    const user = {
      id: 'zxcvb78945614',
      role: Role.USER,
    };
    expect(canSeeSurvey(status, ownerId, user)).toBe(true);
  });

  it('DRAFT 的問卷，自己的看得到', () => {
    const status = 'DRAFT';
    const ownerId = 'asdfg123456';
    const user = {
      id: 'asdfg123456',
      role: Role.USER,
    };
    expect(canSeeSurvey(status, ownerId, user)).toBe(true);
  });

  it('DRAFT 的問卷，別人的看不到', () => {
    const status = 'DRAFT';
    const ownerId = 'asdfg123456';
    const user = {
      id: 'zxcvb78945614',
      role: Role.USER,
    };
    expect(canSeeSurvey(status, ownerId, user)).toBe(false);
  });

  it('DRAFT 且無主（ownerId 為 null）的問卷，ADMIN 看得到、一般使用者看不到', () => {
    const status = 'DRAFT';
    const ownerId = null;
    const user = {
      id: 'zxcvb78945614',
      role: Role.USER,
    };
    const user2 = {
      id: 'rtyui78945614',
      role: Role.ADMIN,
    };
    expect(canSeeSurvey(status, ownerId, user)).toBe(false);
    expect(canSeeSurvey(status, ownerId, user2)).toBe(true);
  });
});

describe('canDelete', () => {
  it('沒有任何人填答時可以刪除', () => {
    expect(canDelete(0)).toBe(true);
  });

  it('已經有人填答就不能刪除', () => {
    expect(canDelete(1)).toBe(false);
  });
});
