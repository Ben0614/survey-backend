import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { resetDb } from './helpers/reset-db';
import { QuestionType } from '../src/generated/prisma/enums.js';

interface QuestionBody {
  id: string;
  surveyId: string;
  title: string;
  order: number;
  type: QuestionType;
}

describe('Questions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    setupApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  describe('GET /surveys/:surveyId/questions', () => {
    it('回傳指定問卷的題目', async () => {
      const survey = await prisma.survey.create({
        data: { title: '指定問卷' },
      });

      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 1,
        },
      });
      await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目二',
          type: 'SINGLE_CHOICE',
          order: 0,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/surveys/${survey.id}/questions`)
        .expect(200);

      const questions = res.body as QuestionBody[];

      expect(questions.length).toBe(2);
      expect(questions[0].title).toBe('題目二');
    });

    it('surveyId 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .get('/surveys/nonexistent-id/questions')
        .expect(404);
    });
  });

  describe('POST /surveys/:surveyId/questions', () => {
    it('建立指定問卷的題目', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        surveyId: survey.id,
        title: '題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['選項1', '選項2', '選項3'],
      });
    });

    it('surveyId 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .post('/surveys/nonexistent-id/questions')
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(404);
    });

    it('type 不在允許的值之內時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .send({
          title: '題目一',
          type: 'MULTIPLE_CHOICE',
          options: ['選項1', '選項2', '選項3'],
        })
        .expect(400);
    });

    it('options 含有非字串元素時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      await request(app.getHttpServer())
        .post(`/surveys/${survey.id}/questions`)
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', 2, 3],
        })
        .expect(400);
    });
  });

  describe('PATCH /questions/:id', () => {
    it('修改題目', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/questions/${question.id}`)
        .send({
          title: '修改後的題目一',
          options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
        })
        .expect(200);

      expect(res.body).toMatchObject({
        surveyId: survey.id,
        title: '修改後的題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
      });
    });

    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .patch('/questions/nonexistent-id')
        .send({
          title: '修改後的題目一',
          type: 'SINGLE_CHOICE',
          options: ['修改後的選項1', '修改後的選項2', '修改後的選項3'],
        })
        .expect(404);
    });

    it('options 含有非字串元素時回 400', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      await request(app.getHttpServer())
        .patch(`/questions/${question.id}`)
        .send({
          title: '題目一',
          type: 'SINGLE_CHOICE',
          options: ['選項1', 2, 3],
        })
        .expect(400);
    });

    it('空 body 回 200 且不改動任何欄位', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/questions/${question.id}`)
        .send({})
        .expect(200);

      expect(res.body).toMatchObject({
        title: '題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['選項1', '選項2', '選項3'],
      });
    });
  });

  describe('DELETE /questions/:id', () => {
    it('刪除題目', async () => {
      const survey = await prisma.survey.create({
        data: {
          title: '指定問卷',
        },
      });

      const question = await prisma.question.create({
        data: {
          surveyId: survey.id,
          title: '題目一',
          type: 'SINGLE_CHOICE',
          order: 0,
          options: ['選項1', '選項2', '選項3'],
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/questions/${question.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        surveyId: survey.id,
        title: '題目一',
        type: 'SINGLE_CHOICE',
        order: 0,
        options: ['選項1', '選項2', '選項3'],
      });

      const deleted = await prisma.question.findUnique({
        where: { id: question.id },
      });

      expect(deleted).toBeNull();
    });

    it('id 不存在時回 404', async () => {
      await request(app.getHttpServer())
        .delete('/questions/nonexistent-id')
        .expect(404);
    });
  });
});
