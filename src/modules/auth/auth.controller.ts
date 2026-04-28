import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CheckIdentifierDto } from './dto/check-identifier.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ActivateDto } from './dto/activate.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SetupAdminDto } from './dto/setup-admin.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── POST /auth/register ─────────────────────────────────────────────────────
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user (self-signup)' })
  @ApiResponse({ status: 201, description: 'Registered. Verification OTP sent.' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── POST /auth/login ────────────────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/phone + password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── POST /auth/check ────────────────────────────────────────────────────────
  @Public()
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Identifier-first check — returns account state to guide mobile routing',
    description:
      'Returns `status`: `not_found` → Register | `active` → Login | `pending_activation` → Activate | `suspended` → Error',
  })
  checkIdentifier(@Body() dto: CheckIdentifierDto) {
    return this.authService.checkIdentifier(dto.identifier);
  }

  // ─── POST /auth/activate ─────────────────────────────────────────────────────
  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate pre-created account (identifier-first fallback when deep link not used)',
  })
  activate(@Body() dto: ActivateDto) {
    return this.authService.activate(dto);
  }

  // ─── POST /auth/set-password ─────────────────────────────────────────────────
  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set password via invite token (deep-link happy path)',
  })
  setPassword(@Body() dto: SetPasswordDto) {
    return this.authService.setPassword(dto);
  }

  // ─── POST /auth/verify-otp ───────────────────────────────────────────────────
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email or phone using 6-digit OTP',
    description: 'Submit the OTP received via email or SMS after registration/activation',
  })
  @ApiResponse({ status: 200, description: 'Verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ─── POST /auth/resend-otp ───────────────────────────────────────────────────
  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend OTP (verification or reset) — rate limited to 1 per 60s',
  })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.identifier, dto.purpose);
  }

  // ─── POST /auth/refresh ──────────────────────────────────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refresh(@CurrentUser() payload: any) {
    return this.authService.refreshTokens(payload.sub, payload.jti);
  }

  // ─── POST /auth/logout ───────────────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  // ─── POST /auth/forgot-password ──────────────────────────────────────────────
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset OTP via email and/or SMS',
    description: 'Always returns 200 to prevent account enumeration. OTP expires in 10 minutes.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.identifier);
  }

  // ─── POST /auth/reset-password ───────────────────────────────────────────────
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using OTP received via email/SMS',
  })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─── GET /auth/me ────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user info and roles' })
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  // ─── POST /auth/company/register ────────────────────────────────────────────
  @Public()
  @Post('company/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Self-register a company — awaits admin approval' })
  @ApiResponse({ status: 201, description: 'Company registration submitted' })
  @ApiResponse({ status: 409, description: 'Company email already exists' })
  registerCompany(@Body() dto: RegisterCompanyDto) {
    return this.authService.registerCompany(dto);
  }

  // ─── POST /auth/setup ────────────────────────────────────────────────────────
  @Public()
  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create first super admin — one-time use, requires ADMIN_SETUP_SECRET',
    description:
      'Disabled once any admin exists. For production first-run only. In dev/staging the admin is auto-seeded.',
  })
  @ApiResponse({ status: 201, description: 'Super admin created' })
  @ApiResponse({ status: 403, description: 'Invalid setup secret' })
  @ApiResponse({ status: 409, description: 'Super admin already exists' })
  setupAdmin(@Body() dto: SetupAdminDto) {
    return this.authService.setupSuperAdmin(dto);
  }
}
