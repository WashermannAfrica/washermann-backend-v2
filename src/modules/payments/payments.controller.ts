import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaystackService } from './paystack.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paystackService: PaystackService) {}

  // Any authenticated user (rep/vendor) may load the bank list to fill a payout
  // account. Cached 24h server-side. Guarded by the global JWT guard.
  @Get('banks')
  @ApiOperation({ summary: 'List Nigerian banks (name + code) for payout account entry' })
  listBanks() {
    return this.paystackService.listBanks();
  }
}
