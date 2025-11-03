import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  API_PREFIX,
  PUBLIC_HEALTH_SUFFIX,
  STRIPE_WEBHOOK_SUFFIX,
} from './common';
import { setupSwagger } from './setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    `/${API_PREFIX}/${STRIPE_WEBHOOK_SUFFIX}`,
    raw({ type: 'application/json' }),
  );

  app.enableCors({
    origin: '*',
  });
  app.use(helmet());

  app.setGlobalPrefix(API_PREFIX, { exclude: [PUBLIC_HEALTH_SUFFIX] });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  app.enableVersioning({
    type: VersioningType.URI,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
