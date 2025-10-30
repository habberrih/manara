import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
  });
  app.use(helmet());

  app.setGlobalPrefix('api');

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

  const config = new DocumentBuilder()
    .setTitle('Minara API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        description: 'Paste your JWT access token',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Apply Bearer auth to ALL operations by default
  document.security = [{ bearer: [] }];

  const PUBLIC_PATH_SUFFIXES = ['/auth/login', '/auth/refresh', '/auth/signup'];

  // Helper: clears "security" for ops whose path ends with any of the suffixes
  for (const [pathKey, pathItem] of Object.entries(document.paths)) {
    const isPublic = PUBLIC_PATH_SUFFIXES.some(
      (suffix) => pathKey.endsWith(suffix) || pathKey.endsWith('/api' + suffix),
    );
    if (!isPublic) continue;

    for (const method of Object.keys(pathItem)) {
      const op: any = (pathItem as any)[method]; // get, post, put, ...
      if (op && typeof op === 'object') op.security = []; // no auth in docs
    }
  }

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      customSiteTitle: 'Minara Documentation',
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
