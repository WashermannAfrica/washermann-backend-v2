import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';
  const env = configService.get<string>('app.env') || 'development';

  // ─── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix);

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: configService.get<string>('app.frontendUrl') || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Washermann-Secret'],
    credentials: true,
  });

  // ─── Global validation pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip properties not in DTO
      forbidNonWhitelisted: true,
      transform: true,           // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Swagger (OpenAPI) ──────────────────────────────────────────────────────
  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Washermann API')
      .setDescription(
        `
## Washermann Platform API

A digital platform connecting individuals and organizations to verified laundry service providers (Washermen), with corporate benefit management and a Wash Points financial system.

### Authentication
All endpoints require a Bearer JWT token unless marked **Public**.
- Obtain tokens via \`POST /auth/login\` or \`POST /auth/register\`
- Refresh tokens via \`POST /auth/refresh\`

### Response Format
All responses follow the standard envelope:
\`\`\`json
{ "success": true, "data": {}, "message": "string" }
\`\`\`

### Roles
- \`user\` — Regular platform user
- \`company_admin\` — Company administrator
- \`washerman\` — Laundry service vendor
- \`admin\` — Platform administrator
      `,
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication, registration and identity flows')
      .addTag('Users', 'User profiles and address management')
      .addServer(`http://localhost:${port}`, 'Local Development')
      .addServer('https://api.washermann.com', 'Production')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'Washermann API Docs',
    });

    console.log(
      `📖 Swagger docs available at: http://localhost:${port}/${apiPrefix}/docs`,
    );
  }

  await app.listen(port);
  console.log(`🚀 Washermann API running on: http://localhost:${port}/${apiPrefix}`);
  console.log(`🌍 Environment: ${env}`);
}

bootstrap();
