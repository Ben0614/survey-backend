import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { CreateQuestionDto } from './dto/create-question.dto';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveysService: SurveysService,
  ) {}

  async findAll(surveyId: string) {
    await this.surveysService.findOne(surveyId);

    return this.prisma.question.findMany({
      where: { surveyId },
      orderBy: { order: 'asc' },
    });
  }

  async create(surveyId: string, dto: CreateQuestionDto) {
    await this.surveysService.findOne(surveyId);
    const order = await this.prisma.question.count({ where: { surveyId } });

    return this.prisma.question.create({
      data: {
        title: dto.title,
        type: dto.type,
        options: dto.options,
        order,
        surveyId,
      },
    });
  }
}
