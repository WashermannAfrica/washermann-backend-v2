import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { AdminCreditDto, AdminDebitDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import { PaystackService } from '../payments/paystack.service';
import { TopupGuardService } from '../payments/topup-guard.service';
import { InitiateTopupDto } from '../payments/dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly paystackService: PaystackService,
    private readonly topupGuardService: TopupGuardService,
  ) {}

  // ─── Self ─────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get own wallet balance and total fiat spent' })
  getMyWallet(@CurrentUser('id') userId: string) {
    return this.walletsService.getWallet(userId);
  }

  @Get('me/ledger')
  @ApiOperation({ summary: 'Get paginated WashPoint transaction history' })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyLedger(
    @CurrentUser('id') userId: string,
    @Query('page')  page  = 1,
    @Query('limit') limit = 20,
  ) {
    return this.walletsService.getLedger(userId, Number(page), Number(limit));
  }

  @Post('me/topup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate a WashPoints top-up via Paystack',
    description:
      'Creates a pending Paystack transaction at the active default vault\'s locked conversion rate and ' +
      'returns an authorizationUrl for checkout. WP are credited later, when the charge.success webhook ' +
      '(or GET /wallets/me/topup/:reference verify fallback) confirms payment.\n\n' +
      '**Requires the `X-WM-Topup-Code` header** — a time-based HMAC proving the request comes from the ' +
      'official app AND a live session. Derivation (hex-encoded HMAC-SHA256):\n\n' +
      '```\n' +
      'topupKey   = HMAC-SHA256(TOPUP_SIGNING_SECRET, userId)      // returned as `topupKey` by /auth/login, /auth/register, /auth/refresh\n' +
      'timeWindow = floor(now_ms / (TOPUP_CODE_WINDOW_SECONDS * 1000))  // default window 30s; server accepts windows -1/0/+1\n' +
      'code       = HMAC-SHA256(TOPUP_CLIENT_APP_SECRET, userId + ":" + topupKey + ":" + timeWindow)\n' +
      '```\n\n' +
      'QA/testers: open `scripts/topup-code-generator.html` in a browser (paste the values, get a live ' +
      'auto-refreshing code) or run `node scripts/topup-code.js <userId>` (reads secrets from .env) and send ' +
      'the code within ~30s. If TOPUP_SIGNING_SECRET / TOPUP_CLIENT_APP_SECRET are unset on the target ' +
      'environment, validation is skipped entirely (dev-only behaviour — never leave unset in prod).',
  })
  @ApiHeader({
    name:        'X-WM-Topup-Code',
    description:
      'Time-based HMAC-SHA256 code (hex), valid ~30s: HMAC(TOPUP_CLIENT_APP_SECRET, "<userId>:<topupKey>:<timeWindow>") ' +
      'where topupKey comes from the auth response and timeWindow = floor(now_ms/30000). ' +
      'Generate for testing with `node scripts/topup-code.js <userId>`.',
    required:    true,
  })
  async initiateTopup(
    @CurrentUser('id')    userId:    string,
    @CurrentUser('email') userEmail: string,
    @Headers('x-wm-topup-code') topupCode: string,
    @Body() dto: InitiateTopupDto,
  ) {
    // Validate the HMAC code before doing anything with money
    this.topupGuardService.validateTopupCode(userId, topupCode);
    return this.paystackService.initiateTopup(userId, userEmail, dto);
  }

  @Get('me/topup/:reference')
  @ApiOperation({ summary: 'Verify a top-up payment status (mobile fallback)' })
  verifyTopup(
    @CurrentUser('id') userId: string,
    @Param('reference') reference: string,
  ) {
    return this.paystackService.verifyTopup(userId, reference);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  @Get(':userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] View any user wallet' })
  getWalletByUserId(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.walletsService.getWalletByUserId(userId);
  }

  @Post(':userId/credit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Manual WashPoint credit' })
  adminCredit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminCreditDto,
  ) {
    return this.walletsService.adminCredit(userId, dto);
  }

  @Post(':userId/debit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Manual WashPoint debit' })
  adminDebit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminDebitDto,
  ) {
    return this.walletsService.adminDebit(userId, dto);
  }
}
