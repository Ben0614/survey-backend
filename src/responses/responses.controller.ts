import { Body, Controller, Get, Param } from '@nestjs/common';
import { ResponsesService } from './responses.service';

// [教學] @Controller('surveys') 是這個 class 所有路由的共同前綴。
// 下面的 @Get() 因此是 GET /surveys，不是 GET /。
@Controller('responses/:id')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Get()
  findOne(@Param('id') id: string) {
    return this.responsesService.findOne(id);
  }
}
