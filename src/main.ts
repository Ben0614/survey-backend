import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 讓 Ctrl+C / SIGTERM 時能觸發 onModuleDestroy，正常關閉資料庫連線池。
  // 部署到 Render 之後這件事更重要，否則每次重啟都會留下沒關掉的連線。
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
