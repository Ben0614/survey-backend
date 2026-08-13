import { SurveyStatus } from '../generated/prisma/enums';

export function canEditQuestions(status: SurveyStatus): boolean {
  return status === SurveyStatus.DRAFT;
}

export function canUnpublish(responseCount: number): boolean {
  return responseCount === 0;
}
