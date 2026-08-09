// ============================================================
// [教學] surveys.service.ts —— 真正碰資料庫的地方
//
// 什麼時候被執行：controller 收到請求後呼叫它。
// 它**幾乎**不知道 HTTP 的存在 —— 沒有 request、沒有網址。
//
// 「幾乎」是因為有一個例外：findOne 找不到資料時直接丟 NotFoundException，
// 而 404 是不折不扣的 HTTP 概念。這是一道刻意留著的裂縫，
// 取捨寫在 findOne 裡面，Ch6 有了 Exception Filter 之後會回頭重看。
//
// 為什麼要有這一層，不讓 controller 直接用 Prisma：
// 從 Ch3 開始這裡會長出商業規則（「有人填答就不能改題目」），
// 那種判斷需要一個能被單元測試、且不必假裝發 HTTP 請求的地方。
// Ch2 的方法確實只是薄薄一層轉發，但位置先擺對，之後才有地方放東西。
//
// 下一站：test/setup-env.ts（上面這些怎麼被自動驗證，而且不弄髒開發資料庫）
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSurveyDto } from './dto/create-survey.dto';

@Injectable()
export class SurveysService {
  // PrismaModule 是 @Global()，所以這裡不必 import 它就能注入（見 prisma.module.ts）。
  constructor(private readonly prisma: PrismaService) {}

  /** 列出所有問卷。Ch4 才會加上分頁與篩選。 */
  findAll() {
    // [教學] orderBy 不是可有可無的裝飾 —— **資料表沒有固有順序**
    // （見 docs/關聯式資料庫基礎.md 第 5 節）。不寫的話資料庫可以用任何順序回你，
    // 而且今天的順序不保證等於明天的順序。
    //
    // 「最新的在最上面」是這裡自己決定的預設值；讓前端自由指定排序是 Ch4 的事。
    return this.prisma.survey.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 查一份問卷。找不到就是 404，不會回 200 配一個空的 body。 */
  async findOne(id: string) {
    // [教學] 這是第一個必須寫 async / await 的方法。
    //
    // findAll 和 create 可以直接 return promise，是因為拿到結果之後什麼都不做；
    // 這裡要**檢查結果是不是 null**，就得先把 promise 裡的值 await 出來才能檢查。
    //
    // findUnique 的 where 只吃唯一欄位（@id / @unique / @@unique），
    // 拿 title 來查會被 TypeScript 直接擋下 —— 因為只有「唯一」才保證最多一筆，
    // 否則資料庫回三筆時這個方法不知道該回哪一筆。
    // （對照 findFirst：where 什麼欄位都能用，但要配 orderBy 才有意義。）
    //
    // where 裡的 `{ id }` 是簡寫，完整是 `{ id: id }`：
    // 左邊是資料表的欄位名，右邊是這個方法的參數，只是剛好同名。
    const survey = await this.prisma.survey.findUnique({
      where: { id },
    });

    // [教學] findUnique 找不到時回 null、不丟錯 —— 在 Prisma 眼中「沒找到」是正常結果。
    // 要不要把它當成錯誤，是**這一層**決定的。
    //
    // 不能直接 return null 讓它變成 200 配一個空 body：「查得到但內容是空的」
    // 和「這東西不存在」是兩件事，混在一起會逼前端寫出分不清「壞掉」和「沒有」的判斷。
    //
    // service 丟 HTTP 例外嚴格說是破了分層（見檔頭）。維持這樣是因為另外兩種做法
    // ——controller 接住轉換、或自訂錯誤配 Exception Filter——在 Ch2 都太重。
    if (!survey) {
      throw new NotFoundException('問卷不存在');
    }

    // [教學] 這裡的型別是 Survey 而不是 Survey | null。
    // TypeScript 知道 throw 之後的程式碼走不到，所以型別自動收窄了 ——
    // 換句話說，上面那個 if 不只是執行期的保護，也是在對型別系統交代。
    return survey;
  }

  /** 建立一份新問卷。狀態一律是 DRAFT（由 schema 的預設值決定）。 */
  create(dto: CreateSurveyDto) {
    // [教學] data 裡明確只寫 title，不是 `data: dto`。
    //
    // 就算 whitelist 已經擋過一層，這裡再寫一次「我只接受這個欄位」——
    // 兩道防線的成本很低，而漏掉的代價是有人能直接寫入任意欄位。
    // 之後 dto 多了欄位時，這裡也會逼你想一次「這個該不該進資料庫」。
    return this.prisma.survey.create({
      data: { title: dto.title },
    });
  }
}
