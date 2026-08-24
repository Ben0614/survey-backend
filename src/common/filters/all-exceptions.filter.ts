// ============================================================
// [教學] all-exceptions.filter.ts —— 所有錯誤回應的唯一出口
//
// 什麼時候被執行：**只有例外被丟出來時**。正常回應完全不經過這裡。
// 不管例外從哪一層冒出來（ValidationPipe / controller / service / Prisma），
// 最後都會走到這一個方法，由它決定回給前端什麼。
//
// Nest 本來就內建一個 filter（Ch5 以前看到的
// {"statusCode":404,"message":"問卷不存在","error":"Not Found"} 就是它產生的），
// setup-app.ts 掛上這一支之後就換成由它負責。
//
// 下一站：src/surveys/surveys.module.ts（一個真正有業務邏輯的 feature module）
// ============================================================

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

// [教學] 狀態碼 → code 的對照表，寫成白名單。
//
// 判準跟 find-surveys-query.dto.ts 的排序白名單同一條：**不在清單上的東西
// 不該有機會冒出去**。差別只在那裡擋的是進來的參數，這裡擋的是出去的欄位。
//
// 方括號是 computed property name（同 surveys.service.ts 的 orderBy）：
// HttpStatus.NOT_FOUND 求值成 404，才拿它當 key。直接寫 404 也行，
// 用常數是為了讓「這個數字是什麼意思」寫在程式碼裡。
//
// 型別寫成 `string | undefined` 而不是 `string`：查不到時真的會拿到 undefined，
// 型別要說實話，下面的 ?? 才不會被當成多餘的判斷。
const STATUS_TO_CODE: Record<number, string | undefined> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
};

// [教學] Prisma 錯誤碼 → 狀態碼與訊息。這是這一輪唯一新增的知識。
//
// 判準是**「前端拿到之後能做什麼」**，不是「這個錯誤有多嚴重」：
//   P2025 記錄不存在   → 404，前端可以顯示「查無此項目」
//   P2002 唯一約束衝突 → 409，請求合法但跟現況衝突（語義同 unpublish 的 409）
//   P2003 外鍵不存在   → 400，**請求內容本身有錯**（那些 id 指向不存在的東西）
//
// P2003 選 400 而不是 404，是為了跟 responses.service.ts 已經做過的同一個判斷
// 保持一致（那裡對「題目不屬於這份問卷」也是回 400）。**同一種錯誤走兩條路
// 卻回兩種狀態碼**，前端只會覺得這支 API 反覆無常。
//
// 表裡沒有的碼**刻意不列**，不是漏掉 —— 見下面 catch() 裡的說明。
//
// message 為什麼要一碼一句、不共用 FALLBACK_MESSAGE：
// 404 配「伺服器發生未預期的錯誤」是在說謊（伺服器好得很，是那筆資料不在）。
// 但也不能用 exception.message，理由見 FALLBACK_MESSAGE 上方那段。
// 所以是第三條路：**自己寫的、不含任何資料庫細節的句子**。
const PRISMA_ERRORS: Record<
  string,
  { status: number; message: string } | undefined
> = {
  P2025: { status: HttpStatus.NOT_FOUND, message: '找不到指定的資料' },
  P2002: { status: HttpStatus.CONFLICT, message: '資料已存在' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: '關聯的資料不存在' },
};

const FALLBACK_CODE = 'INTERNAL_ERROR';

// [教學] 這一句是寫死的常數，不是從例外身上取的 —— 這是刻意的結構性防護。
//
// Prisma 的錯誤訊息會帶著完整檔案路徑、表名、約束名（例如
// "Foreign key constraint violated on the constraint: `Question_surveyId_fkey`"）。
// 直接回給前端等於免費送出一張資料庫地圖，而且**沒有任何症狀**：
// 測試綠、狀態碼對、body 形狀完全正確。
//
// 對策不是「記得不要放 exception.message」（人一定會忘），
// 是讓那條路徑上根本沒有變數可以放 —— 只有這個常數。
const FALLBACK_MESSAGE = '伺服器發生未預期的錯誤';

const VALIDATION_CODE = 'VALIDATION_FAILED';
const VALIDATION_MESSAGE = '請求內容不合法';

// [教學] @Catch() 不帶參數 = 什麼例外都接。
//
// 寫成 @Catch(HttpException) 的話，只有「有人明確丟出的 HTTP 例外」會進來，
// 而 TypeError、Prisma 的錯誤碼這些**沒人預期的**東西會落回 Nest 內建的 filter
// —— 於是 500 的格式跟其他錯誤不一樣，統一格式就破了一個洞。
// 「未預期的錯誤」正是最需要被統一格式接住的那一種。
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // [教學] host 是「能拿到 req / res 的把手」。switchToHttp() 的存在是因為
    // Nest 不只跑 HTTP（還有 WebSocket、gRPC、微服務），所以要先講明是哪一種。
    const res = host.switchToHttp().getResponse<Response>();

    // 這個方法的工作只有兩句話：**算出這四個值 → 送出去**。
    let status: number;
    let code: string;
    let message: string;
    let details: string[] | undefined;

    // [教學] 先把「這是不是一個我認得的 Prisma 錯誤」算成兩個區域變數，
    // 再拿它當分支條件 —— 而不是直接寫 if (exception instanceof Prisma...)。
    //
    // 差別在**認不得的碼（例如 P1001 連不到資料庫）會走去哪裡**：
    //   直接用 instanceof 當條件 → 進到這支分支，然後被迫在裡面自己補一份
    //     「查不到就 500」的邏輯，而那份複製品**不會有下面 else 的 logger.error**。
    //     症狀：前端拿到 500（正確），伺服器 log 一個字都沒有 —— 出事時你查不到原因。
    //   先查表再判斷（現在這樣）→ 查不到就當作「不是我認得的東西」，
    //     整個掉進最後那支 else，走既有的 500 + 完整堆疊。
    //
    // 一句話：**認得的才翻譯，認不得的原樣交給既有的 500 分支**，
    // 不要在新分支裡複製一份 500 的行為。
    const prismaCode =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.code
        : undefined;
    const prismaError = prismaCode ? PRISMA_ERRORS[prismaCode] : undefined;

    // [教學] 用 instanceof 而不是 'code' in exception 這種鴨子型別判斷。
    //
    // 理由**不是**「鴨子型別會誤判」—— 這件事實測過（ch06 作業第 3 題）：
    // 換成 'code' in exception 之後 79 條測試**全綠**。因為下一行還有
    // PRISMA_ERRORS[prismaCode] 這道查表，Node 的 'ECONNRESET' 之類查不到，
    // 一樣掉進 500。要誤判得有個「不是 Prisma 例外、卻剛好帶著 P2025 形狀的 code」
    // 的東西，實務上很罕見。
    //
    // 真正的理由是**型別**：鴨子型別那個版本 TypeScript 不知道 .code 是什麼，
    // 得寫成 String((exception as { code: unknown }).code) 才拿得到。
    // 而 as 是斷言（「相信我」），關掉的是檢查、不是風險（Ch4 學過的那句）。
    // instanceof 讓型別自己收窄成 PrismaClientKnownRequestError，
    // exception.code 直接就是 string —— 一個 as 都不需要。
    //
    // 判準：**instanceof 問「它是什麼」，屬性存在性問「它長得像什麼」。**
    // 問前者，型別系統才有辦法幫你。
    if (prismaError) {
      status = prismaError.status;

      // [教學] code 不自己寫，回頭查 STATUS_TO_CODE。
      //
      // 寫成 code = 'NOT_FOUND' 也會過，但那樣「404 叫什麼名字」就有了兩個真相來源：
      // 以後改命名時兩處會不一致，而且**不會有任何測試變紅**（每條測試各驗各的分支）。
      // 讓它們共用同一張表，不一致在結構上就不可能發生。
      code = STATUS_TO_CODE[status] ?? FALLBACK_CODE;
      message = prismaError.message;

      // [教學] 翻譯成功了還是要留一筆 log —— 用 warn 不是 error。
      //
      // 理由是這支分支的定位：它是**安全網，不是主要防線**（輪 1 拍板的決定 3）。
      // service 本來就該先擋掉這些情況，所以每一次安全網被觸發，都代表
      // 「有一條路徑漏掉了 service 那一層的檢查」。前端拿到的回應是好的，
      // 但這件事你會想知道 —— 沒有這一句，它就是一個永遠不會被發現的靜默降級。
      this.logger.warn(`Prisma 錯誤 ${prismaCode} 被安全網翻譯成 ${status}`);
    }
    // [教學] instanceof 這一行做了兩件事，第二件是 TypeScript 的：
    //   1. 執行期判斷「它是不是 HttpException」
    //   2. 在這個 if 裡面，exception 的型別自動從 unknown 收窄成 HttpException
    //      —— 所以下一行才能直接呼叫 .getStatus()
    // 跟 surveys.service.ts 的 `if (!survey) throw` 之後型別自動變窄是同一個機制。
    //
    // 用 instanceof 而不是 'getStatus' in exception 這種「長得像不像」的判斷：
    // 前者問「它是什麼」，後者問「它剛好有沒有這個屬性」。
    // 這裡是 else if：三支分支互斥，而且順序有意義 ——
    // Prisma 錯誤先被挑走，剩下的才問「是不是 HttpException」，
    // 都不是的才落到最後的 500。
    else if (exception instanceof HttpException) {
      status = exception.getStatus();

      // [教學] getResponse() 的回傳型別是 string | object，因為 HttpException
      // 有兩種建構方式（new NotFoundException('訊息') 給的是物件、
      // new HttpException('訊息', 404) 給的是字串）。這個專案全部用前者，
      // 但型別逼你把兩種都處理掉。
      //
      // as 是必要的：getResponse() 只宣告成 object，TS 不知道裡面有什麼欄位。
      // Ch4 說過「as 是斷言（相信我），關掉的是檢查不是風險」——
      // 這裡的「相信我」有證據：實際量過的形狀就是 { message, error, statusCode }。
      const payload = exception.getResponse();
      const raw =
        typeof payload === 'string'
          ? payload
          : (payload as { message?: string | string[] }).message;

      // [教學] 這個 if 是整支 filter 最容易寫錯的地方。
      //
      // ValidationPipe 的 400 跟 service 丟的 BadRequestException **狀態碼一樣、
      // 型別一樣、error 欄位也一樣**，唯一的差別是 message 的型別：
      //
      //   ValidationPipe → message 是陣列  ["title should not be empty", ...]
      //   service        → message 是字串  "有重複的題目ID"
      //
      // 混成一種的後果：前端拿到 VALIDATION_FAILED 就會去讀 details 準備標紅欄位，
      // 結果 details 是 undefined → 畫面空白，而**狀態碼完全正確、沒有任何錯誤訊息**。
      // e2e 的「service 丟的 400 code 是 BAD_REQUEST」就是專門抓這個的。
      if (Array.isArray(raw)) {
        code = VALIDATION_CODE;

        // message 一律是「一句給人看的字串」，逐條細節搬到 details。
        // 改成這樣的理由：原本 message 這個欄位在驗證錯誤是陣列、其他錯誤是字串，
        // 前端每次都得先判斷自己拿到的是哪一種。
        message = VALIDATION_MESSAGE;
        details = raw;
      } else {
        code = STATUS_TO_CODE[status] ?? FALLBACK_CODE;
        message = typeof raw === 'string' ? raw : FALLBACK_MESSAGE;
      }
    } else {
      // [教學] 認不得的錯誤：狀態碼 500、訊息用常數、**但堆疊一定要留下**。
      //
      // LEARNING.md 要點 5 說「認得的才翻譯，認不得的原樣往上丟」，
      // 但 @Catch() 是 catch-all，**沒有「往上丟」這個選項**（上面沒有東西了）。
      // 所以「往上丟」在這裡的正確兌現就是這一句 logger.error ——
      // 吞掉之後最貴的代價是線上出事時你只看得到「伺服器發生未預期的錯誤」，
      // 完全不知道發生什麼事。
      //
      // instanceof Error 的檢查不能省：JS 什麼東西都能 throw（字串、數字、null），
      // 不保證有 .stack。
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = FALLBACK_CODE;
      message = FALLBACK_MESSAGE;

      this.logger.error(
        '未預期的例外',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // [教學] ...(details ? { details } : {}) 是「有才加這個欄位」。
    //
    // 直接寫 { code, message, details } 的話，沒有 details 時回應會出現
    // "details": undefined —— JSON.stringify 雖然會把它拿掉，但語意上是在說
    // 「這個欄位存在，只是沒值」。展開空物件則是**這個欄位根本不存在**。
    //
    // 注意不能寫成 ...details：details 是陣列，展開陣列到物件裡會變成
    // { 0: 'a', 1: 'b' }。展開的必須是物件。
    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
    });
  }
}
