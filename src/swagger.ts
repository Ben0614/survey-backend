import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('問卷')
    .setDescription('問卷swagger')
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}
