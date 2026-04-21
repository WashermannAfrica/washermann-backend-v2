import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBody,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PaystackService } from './paystack.service';

/**
 * Receives inbound webhook events from payment providers.
 *
 * All endpoints here are @Public() — JWT auth is not applicable.
 * Each provider has its own authentication mechanism:
 *   - Paystack: HMAC-SHA512 of raw body, verified inside PaystackService.handleWebhook()
 *
 * IMPORTANT: main.ts must be bootstrapped with { rawBody: true } so that
 * @RawBody() delivers the original bytes before any parsing. Paystack's
 * signature is computed against the exact bytes sent — even whitespace matters.
 */
@ApiExcludeController()   // hide from Swagger UI
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly paystackService: PaystackService) {}

  @Post('paystack')
  @Public()
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<{ received: boolean }> {
    try {
      await this.paystackService.handleWebhook(rawBody, signature);
    } catch (err) {
      // Log but always return 200 to Paystack — a non-2xx causes retries
      // which can cause duplicate processing. Errors are logged for investigation.
      this.logger.error(`Webhook processing error: ${(err as Error).message}`);
    }

    return { received: true };
  }
}
