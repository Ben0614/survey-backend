import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

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

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException('題目不存在');
    }

    return question;
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

  async update(id: string, dto: UpdateQuestionDto) {
    await this.findOne(id);

    return this.prisma.question.update({
      where: { id },
      data: { title: dto.title, type: dto.type, options: dto.options },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.question.delete({
      where: { id },
    });
  }
}
