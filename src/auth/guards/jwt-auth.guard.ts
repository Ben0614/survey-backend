// ============================================================
// [教學] jwt-auth.guard.ts —— 每個請求的驗票口（Ch10 輪 2）
//
// 什麼時候被執行：**每一個請求都會經過**（在 auth.module.ts 用 APP_GUARD
// 註冊成全域 guard）。順序是：
//
//   請求 → Guard → Pipe（ValidationPipe）→ Controller → Service
//                ↑ 這裡擋下來的話，後面完全不會執行
//
// Guard 是這個專案的第三種中介層，跟前兩種放在一起看就清楚了：
//   Pipe   —— 請求進來的路上，負責「參數對不對」（→ 400）
//   Guard  —— 更前面一站，負責「你能不能進來」（→ 401 / 403）
//   Filter —— 回應出去的路上，只有例外被丟出來時才跑
//
// **Ch11 之後 guard 有兩支**，而且分工要記清楚：
//   JwtAuthGuard（這一支）驗票   —— 你是誰？票是真的嗎？→ 401
//   RolesGuard            看職稱 —— 你的角色能做這件事嗎？→ 403
// 這一支排在前面（auth.module.ts 的 providers 順序），因為 RolesGuard
// 要用它放上去的 request.user —— 沒有身分就談不上角色。
// 三者都在 setup-app.ts 那段註解畫的那條路上，只是位置不同。
//
// **Guard 比 Pipe 更早跑**，所以沒帶 token 的請求連 DTO 驗證都到不了。
// 這是對的：身分不明的人不該讓他知道你的參數規則。
//
// 為什麼放 src/auth/ 而不是 src/common/：common/ 裡的 filter 與 error entity
// 不認識任何 feature，這一支認識 JwtService 和 @Public() —— 它是 auth 的東西。
//
// 下一站：src/auth/guards/roles.guard.ts（第二個驗票口，看的是職稱）
// ============================================================

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../../generated/prisma/enums';

/**
 * token 解開之後長什麼樣。auth.service.ts 只放了 sub，
 * iat / exp 是 auth.module.ts 的 signOptions 自動塞的。
 */
export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  role: Role;
}

/** 通過驗票之後掛在 request 上的東西。輪 3 的 @CurrentUser() 會來拿它。 */
export interface AuthUser {
  id: string;
  role: Role;
}

// [教學] Express 原本的 Request 沒有 user 這個屬性，所以自己擴一個型別出來。
// 另一種常見寫法是全域宣告合併（declare global ... namespace Express），
// 這裡刻意不用：那會讓**全專案**的 Request 都長出 user，
// 包括那些根本沒經過 guard 的地方，型別就開始說謊了。
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  // [教學] JwtService 注入得到，是因為 auth.module.ts imports 了 JwtModule；
  // Reflector 則不必 import 任何東西，它是 @nestjs/core 內建的 provider。
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  // [教學] implements CanActivate 的意思是「我承諾提供 canActivate 這個方法」，
  // 形狀跟 PrismaService 的 implements OnModuleInit 一樣 —— 都是跟框架的約定。
  //
  // 回傳 true 就放行、false 就擋下。這裡一律用 throw 而不是 return false，
  // 因為 throw 才給得出**訊息**、也才選得了狀態碼 ——
  // return false 一律變成框架預設的 403，而這一支要的是 401。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // [教學] ExecutionContext 是「這次請求的上下文」。它刻意不綁死 HTTP ——
    // 同一個 guard 也可以用在 WebSocket、gRPC 上，所以要拿 HTTP 的東西
    // 得先 switchToHttp()。這個專案只有 HTTP，但 API 長這樣是有原因的。

    // ── ① 這條路由標了 @Public() 嗎？
    //
    // getAllAndOverride 而不是 get：陣列的意思是「兩個地方都找，
    // 前面的蓋過後面的」——也就是**方法上的標記蓋過 controller 上的**。
    // 這一輪三處都標在方法上，寫成 get() 也會過；但 Ch11 的 @Roles()
    // 會需要「整個 controller 標一次」，那時 get() 就讀不到了。
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // 這次要執行的那個方法
      context.getClass(), // 它所屬的 controller
    ]);

    if (isPublic) {
      return true;
    }

    // ── ② 從 Authorization 標頭取出 token
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('缺少存取權杖');
    }

    // ── ③ 驗證它
    try {
      // [教學] **一定是 verifyAsync，不能是 decode。** 兩者都拿得出 payload，
      // 但 decode 只是把中間那段 base64 解開 —— 它不需要 secret，
      // 所以它不可能知道這張票是不是你簽的，也不會看 exp。
      //
      // 用 decode 的後果：任何人自己組一個 { sub: '任意 id' } 都能通過，
      // 過期的 token 也永遠有效 —— 而 tsc、lint、所有用真 token 的測試全綠。
      // 抓得到它的只有「用別的 secret 簽一個 token」那條測試。
      //
      // 這裡不必傳 secret：JwtService 是 JwtModule 設定好才給出來的，
      // 它自己記得（見 auth.module.ts 的 registerAsync）。
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      // ── ④ 把「這是誰」掛到 request 上，交給後面的人用
      //
      // 只挑要用的欄位，不放整個 payload：iat / exp 是 token 的事，
      // 業務程式碼不該碰。讀這裡的有兩個人 ——
      // @CurrentUser()（Ch10 輪 3）拿 id，RolesGuard（Ch11）拿 role。
      //
      // role 是 Ch11 加的。**它的值是簽 token 那一刻的快照**，
      // 不會跟著資料庫更新 —— 管理員被降權之後，那張票在過期前仍然是管理員。
      // 這是「role 放進 payload」換掉「每個請求查一次資料庫」的代價，
      // 已知並接受（見 ch11 的決策取捨）。
      request.user = { id: payload.sub, role: payload.role };
    } catch {
      // [教學] 這個 catch 不是裝飾用的。verifyAsync 遇到簽章不符、已過期、
      // 或根本不是三段式的字串，都會 throw；沒接住的話那些例外會冒到
      // Filter 變成 **500**。
      //
      // 但「token 壞掉」是使用者送得出來的東西，不是伺服器故障 ——
      // 500 會讓監控在半夜叫你起床看一個根本沒壞的服務。
      //
      // 訊息刻意不分「無效」與「過期」：這跟 auth.service.ts 那兩條失敗路徑
      // 用同一句訊息是同一個理由，只是這裡洩漏的東西比較沒價值。
      throw new UnauthorizedException('存取權杖無效或已過期');
    }

    return true;
  }

  /** 從 `Authorization: Bearer <token>` 取出 token 那一段。 */
  private extractToken(request: AuthenticatedRequest): string | undefined {
    // [教學] 標頭的格式是「型別 空格 值」，Bearer 是 HTTP 規格裡的一種
    // 授權型別（意思大概是「持票人」——誰拿著這張票，誰就是那個人）。
    //
    // 一定要檢查 type === 'Bearer'，不能只切最後一段：
    // 沒檢查的話，Basic 認證的標頭也會被當成 token 送去驗，
    // 而那會走到 catch 變成一句誤導的「權杖無效」。
    //
    // ?? [] 是為了沒有 Authorization 標頭的情況：那時 ?. 給的是 undefined，
    // 直接解構 undefined 會炸。給一個空陣列，兩個變數都會是 undefined。
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    return type === 'Bearer' ? token : undefined;
  }
}
