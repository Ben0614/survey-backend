import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { canSubmitResponse } from '../surveys/survey.rules';
import { CreateResponseDto } from './dto/create-response.dto';
import { FindResponsesQueryDto } from './dto/find-responses-query.dto';

@Injectable()
export class ResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveysService: SurveysService,
  ) {}

  async create(surveyId: string, dto: CreateResponseDto) {
    const survey = await this.surveysService.assertExists(surveyId);
    const res = canSubmitResponse(survey.status);

    if (!res) {
      throw new ConflictException('問卷未發布，無法填寫');
    }

    const questionIds = dto.answers.map((item) => item.questionId);
    const hasDuplicates = new Set(questionIds).size !== questionIds.length;
    if (hasDuplicates) {
      throw new BadRequestException('有重複的題目ID');
    }

    const count = await this.prisma.question.count({
      where: {
        surveyId,
        id: { in: questionIds },
      },
    });

    if (count !== questionIds.length) {
      throw new BadRequestException('有題目不屬於這份問卷');
    }

    return this.prisma.response.create({
      data: {
        surveyId,
        answers: {
          create: dto.answers.map((item) => ({
            questionId: item.questionId,
            content: item.content,
          })),
        },
      },
    });
  }

  async findAll(surveyId: string, query: FindResponsesQueryDto) {
    await this.surveysService.assertExists(surveyId);

    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    const where = {
      surveyId,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.response.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.response.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,

        // [教學] Math.ceil 是無條件進位，不是四捨五入。
        // 47 筆、每頁 10 筆 → 4.7 → 需要 **5** 頁（第 5 頁只裝 7 筆）。
        // 四捨五入的話 41 筆會算出 4 頁，最後那 1 筆沒有任何頁面裝得到它。
        //
        // 少了 Math.ceil 沒有任何工具會抗議：number 除以 number 就是 number，
        // 3.5 是完全合法的值，tsc 與 lint 都會是綠的。只有把實際數字看一眼才抓得到。
        //
        // total 是 0 時這裡算出 0（「沒有任何一頁裝得到資料」）而不是 1。
        // 「page: 1, totalPages: 0」乍看很怪，但那兩個欄位回答的是不同問題：
        // page 是「你要求第幾頁」的回音，totalPages 是「資料有幾頁」。
        // 完整理由見 ch04 的「決策取捨」。
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(id: string) {
    const response = await this.prisma.response.findUnique({
      where: { id },
      include: {
        answers: {
          include: { question: true },
          orderBy: {
            question: {
              order: 'asc',
            },
          },
        },
      },
    });

    if (!response) {
      throw new NotFoundException('ID不存在');
    }

    return response;
  }
}
