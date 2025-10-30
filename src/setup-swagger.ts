import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  API_PREFIX,
  PUBLIC_AUTH_SUFFIXES,
  VERSION_REGEX,
} from './helpers/constants';

/**
 * Sets up Swagger for the NestJS application.
 */
export function setupSwagger(app: INestApplication) {
  const DOCS_PATH = 'docs';

  // --- Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Minara API')
    .setDescription('API documentation for Minara')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        description: 'Paste your JWT access token here',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Apply Bearer auth globally
  document.security = [{ bearer: [] }];

  // --- Remove auth requirement for public endpoints
  for (const [pathKey, pathItem] of Object.entries(document.paths)) {
    const normalized = stripApiPrefixAndVersion(
      pathKey,
      API_PREFIX,
      VERSION_REGEX,
    );
    const isPublic = PUBLIC_AUTH_SUFFIXES.some((suffix) =>
      normalized.endsWith(suffix),
    );
    if (!isPublic) continue;

    for (const method of Object.keys(pathItem)) {
      const op: any = (pathItem as any)[method];
      if (op && typeof op === 'object') op.security = [];
    }
  }

  // --- Mount Swagger UI
  SwaggerModule.setup(DOCS_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      customSiteTitle: 'Minara Documentation',
    },
  });

  console.log(`📘 Swagger docs available at /${DOCS_PATH}`);
}

// --- Helpers
function stripApiPrefixAndVersion(
  path: string,
  apiPrefix: string,
  versionRe: RegExp,
): string {
  const clean = path.split('?')[0];
  const parts = clean.split('/').filter(Boolean);

  let i = 0;
  if (parts[i] === apiPrefix) i += 1;
  if (parts[i] && versionRe.test(parts[i])) i += 1;

  return '/' + parts.slice(i).join('/');
}
