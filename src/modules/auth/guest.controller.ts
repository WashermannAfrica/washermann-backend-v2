import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { GuestStartDto } from './dto/guest-start.dto';
import { GuestVerifyDto } from './dto/guest-verify.dto';

type ReqCtx = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Real client IP for rate-limiting. The guest endpoints are normally reached
 * through the landing app's server-side proxy, so the socket IP is the proxy's;
 * the proxy forwards the caller's IP in `x-forwarded-for`. Take the first hop
 * and fall back to the socket IP for direct calls.
 */
function clientIp(req: ReqCtx): string | null {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) return raw.split(',')[0].trim() || null;
  return req.ip ?? null;
}

/**
 * Account-less guest flow for the public (landing-page) logistics funnel. A guest
 * proves phone ownership by SMS OTP and receives a session bound to a passwordless
 * user. If the phone already belongs to a password account, verify returns
 * { accountExists: true } instead of a session (OTP must not bypass a password).
 */
@ApiTags('Guest')
@Controller('guest')
export class GuestController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request an SMS OTP for the account-less logistics flow',
  })
  start(@Body() dto: GuestStartDto, @Req() req: ReqCtx) {
    return this.authService.guestStart(dto.phone, { ip: clientIp(req) });
  }

  @Public()
  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the SMS OTP (same rate limits as start)' })
  resend(@Body() dto: GuestStartDto, @Req() req: ReqCtx) {
    return this.authService.guestStart(dto.phone, { ip: clientIp(req) });
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify the OTP and receive a session (or be told to log in)',
  })
  @ApiResponse({
    status: 200,
    description: 'Verified — returns tokens, or { accountExists: true }',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  verify(@Body() dto: GuestVerifyDto, @Req() req: ReqCtx) {
    const userAgent = (req.headers['user-agent'] as string) ?? null;
    return this.authService.guestVerify(
      { phone: dto.phone, otp: dto.otp, name: dto.name },
      { ip: clientIp(req), userAgent },
    );
  }
}
