import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
    rawBody: true,  // Required for Paystack webhook HMAC-SHA512 signature verification
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';
  const env = configService.get<string>('app.env') || 'development';
  const appUrl = configService.get<string>('app.appUrl') || `http://localhost:${port}`;

  // ─── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix);

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: configService.get<string>('app.frontendUrl') || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Washermann-Secret', 'X-WM-Topup-Code'],
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
      .addTag('Companies', 'Company management, tiers, employees and admin grants')
      .addTag('Teams', 'Self-service teams — create, manage members and assign roles')
      .addTag('Wallets', 'WashPoint wallet balance, ledger history and top-up flows')
      .addTag('Conversion Rates', 'WashPoint ↔ fiat conversion rate management (admin)')
      .addTag('Company Wallet', 'Company WashPoint wallet, ledger and admin operations')
      .addServer(`http://localhost:${port}`, 'Local')
      .addServer('https://dev-api.washermann.com', 'Development')
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

    console.log(`📖 Swagger docs: ${appUrl}/${apiPrefix}/docs`);
  }

  await app.listen(port);
  console.log(`🚀 Washermann API running on: ${appUrl}/${apiPrefix}`);
  console.log(`🌍 Environment: ${env}`);
}

bootstrap();
