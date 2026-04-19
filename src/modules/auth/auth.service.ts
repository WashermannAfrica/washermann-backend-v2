import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../database/entities/user.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateDto } from './dto/activate.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetupAdminDto } from './dto/setup-admin.dto';

const SALT_ROUNDS = 12;
const OTP_TTL_SECONDS = 600;       // 10 minutes
const OTP_EXPIRY_MINUTES = 10;
const REFRESH_TOKEN_PREFIX = 'refresh:';
const INVITE_TOKEN_PREFIX = 'invite:';
const OTP_VERIFY_EMAIL_PREFIX = 'otp:verify:email:';
const OTP_VERIFY_PHONE_PREFIX = 'otp:verify:phone:';
const OTP_RESET_PREFIX = 'otp:reset:';
const OTP_RESEND_COOLDOWN_PREFIX = 'otp:cooldown:';
const OTP_RESEND_COOLDOWN_SECONDS = 60; // 1 minute between resends

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email or phone number is required');
    }

    await this.assertIdentifierNotTaken(dto.email, dto.phone);

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email?.toLowerCase() || null,
      phone: dto.phone || null,
      passwordHash,
      roles: [Role.USER],
      status: UserStatus.ACTIVE,
      emailVerified: false,
      phoneVerified: false,
    });

    await this.userRepository.save(user);
    this.logger.log(`New user registered: ${user.id}`);

    // Send verification OTP only — welcome email is sent after OTP is verified
    this.sendVerificationOtp(user).catch((err) =>
      this.logger.error(`Post-registration OTP failed: ${err.message}`),
    );

    const tokens = await this.generateTokenPair(user);

    return {
      data: {
        user: this.sanitizeUser(user),
        ...tokens,
        verificationSent: true,
      },
      message: 'Registration successful. A verification code has been sent.',
    };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.findByIdentifier(dto.identifier);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException(
        'Account not activated. Please complete your account setup.',
      );
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account suspended. Please contact support.');
    }
    if (!user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokenPair(user);

    return {
      data: {
        user: this.sanitizeUser(user),
        ...tokens,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
      message: 'Login successful',
    };
  }

  // ─── Identifier Check ────────────────────────────────────────────────────────

  async checkIdentifier(identifier: string) {
    const user = await this.findByIdentifier(identifier);

    if (!user) {
      return { data: { status: 'not_found' } };
    }

    const maskedContact = this.maskContact(user);

    if (user.status === UserStatus.PENDING) {
      return {
        data: {
          status: 'pending_activation',
          hint: 'Account pre-registered. Please complete your setup.',
          maskedContact,
        },
      };
    }

    if (user.status === UserStatus.SUSPENDED) {
      return {
        data: {
          status: 'suspended',
          message: 'This account has been suspended. Please contact support.',
        },
      };
    }

    return { data: { status: 'active', maskedContact } };
  }

  // ─── Activate (identifier-first invite flow) ─────────────────────────────────

  async activate(dto: ActivateDto) {
    const user = await this.findByIdentifier(dto.identifier);

    if (!user) throw new NotFoundException('No account found with this identifier');

    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Account is already active. Please login instead.');
    }

    user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    user.status = UserStatus.ACTIVE;
    if (dto.fullName && !user.fullName) user.fullName = dto.fullName;

    await this.userRepository.save(user);
    this.logger.log(`User activated: ${user.id}`);

    // Send verification OTP only — welcome email is sent after OTP is verified
    this.sendVerificationOtp(user).catch((err) =>
      this.logger.error(`Post-activation OTP failed: ${err.message}`),
    );

    const tokens = await this.generateTokenPair(user);

    return {
      data: { user: this.sanitizeUser(user), ...tokens },
      message: 'Account activated successfully. A verification code has been sent.',
    };
  }

  // ─── Set Password (deep-link invite token) ───────────────────────────────────

  async setPassword(dto: SetPasswordDto) {
    const userId = await this.redisService.get(`${INVITE_TOKEN_PREFIX}${dto.inviteToken}`);

    if (!userId) throw new BadRequestException('Invite token is invalid or has expired');

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Account is already activated');
    }

    user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    user.status = UserStatus.ACTIVE;

    await this.userRepository.save(user);
    await this.redisService.del(`${INVITE_TOKEN_PREFIX}${dto.inviteToken}`);

    this.logger.log(`User activated via invite token: ${user.id}`);

    this.sendVerificationOtp(user).catch((err) =>
      this.logger.error(`Post-set-password OTP failed: ${err.message}`),
    );

    const tokens = await this.generateTokenPair(user);

    return {
      data: { user: this.sanitizeUser(user), ...tokens },
      message: 'Password set successfully. Account activated.',
    };
  }

  // ─── Verify OTP ──────────────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.findByIdentifier(dto.identifier);

    if (!user) throw new NotFoundException('No account found with this identifier');

    const prefix =
      dto.channel === 'email' ? OTP_VERIFY_EMAIL_PREFIX : OTP_VERIFY_PHONE_PREFIX;

    const storedOtp = await this.redisService.get(`${prefix}${user.id}`);

    if (!storedOtp || storedOtp !== dto.otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Track whether this is the user's first verification
    const isFirstVerification = !user.emailVerified && !user.phoneVerified;

    // Mark as verified
    if (dto.channel === 'email') {
      user.emailVerified = true;
    } else {
      user.phoneVerified = true;
    }

    await this.userRepository.save(user);
    await this.redisService.del(`${prefix}${user.id}`);

    this.logger.log(`${dto.channel} verified for user: ${user.id}`);

    // Send welcome email on the first successful verification only
    if (isFirstVerification) {
      this.notificationsService
        .sendWelcome({ fullName: user.fullName, email: user.email, phone: user.phone })
        .catch((err) => this.logger.error(`Welcome email failed: ${err.message}`));
    }

    return {
      data: {
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
      message: `${dto.channel === 'email' ? 'Email' : 'Phone'} verified successfully`,
    };
  }

  // ─── Resend OTP ──────────────────────────────────────────────────────────────

  async resendOtp(identifier: string, purpose: 'verification' | 'reset') {
    const user = await this.findByIdentifier(identifier);

    // Always return 200 to prevent enumeration
    if (!user || user.status !== UserStatus.ACTIVE) {
      return {
        data: null,
        message: 'If an account exists, a new OTP has been sent.',
      };
    }

    // Rate limiting — 1 resend per minute per user per purpose
    const cooldownKey = `${OTP_RESEND_COOLDOWN_PREFIX}${purpose}:${user.id}`;
    const onCooldown = await this.redisService.exists(cooldownKey);

    if (onCooldown) {
      throw new BadRequestException(
        'Please wait 60 seconds before requesting a new code.',
      );
    }

    await this.redisService.setEx(cooldownKey, OTP_RESEND_COOLDOWN_SECONDS, '1');

    if (purpose === 'verification') {
      await this.sendVerificationOtp(user);
    } else {
      await this.sendPasswordResetOtp(user);
    }

    return {
      data: null,
      message: 'If an account exists, a new OTP has been sent.',
    };
  }

  // ─── Forgot Password ─────────────────────────────────────────────────────────

  async forgotPassword(identifier: string) {
    const user = await this.findByIdentifier(identifier);

    if (!user || user.status !== UserStatus.ACTIVE) {
      return {
        data: null,
        message: 'If an account exists with this identifier, a reset code has been sent.',
      };
    }

    // Rate limiting
    const cooldownKey = `${OTP_RESEND_COOLDOWN_PREFIX}reset:${user.id}`;
    const onCooldown = await this.redisService.exists(cooldownKey);

    if (onCooldown) {
      throw new BadRequestException(
        'Please wait 60 seconds before requesting a new reset code.',
      );
    }

    await this.redisService.setEx(cooldownKey, OTP_RESEND_COOLDOWN_SECONDS, '1');
    await this.sendPasswordResetOtp(user);

    return {
      data: null,
      message: 'If an account exists with this identifier, a reset code has been sent.',
    };
  }

  // ─── Reset Password (OTP-based) ───────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.findByIdentifier(dto.identifier);

    if (!user) throw new NotFoundException('No account found with this identifier');

    const storedOtp = await this.redisService.get(`${OTP_RESET_PREFIX}${user.id}`);

    if (!storedOtp || storedOtp !== dto.otp) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    await this.userRepository.save(user);

    // Consume OTP + invalidate all refresh tokens
    await Promise.all([
      this.redisService.del(`${OTP_RESET_PREFIX}${user.id}`),
      this.redisService.del(`${REFRESH_TOKEN_PREFIX}${user.id}`),
    ]);

    return { data: null, message: 'Password reset successful. Please login.' };
  }

  // ─── Token Refresh ───────────────────────────────────────────────────────────

  async refreshTokens(userId: string, jti: string) {
    const stored = await this.redisService.get(`${REFRESH_TOKEN_PREFIX}${userId}`);

    if (!stored || stored !== jti) {
      await this.redisService.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
      throw new UnauthorizedException('Refresh token reuse detected. Please login again.');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const tokens = await this.generateTokenPair(user);

    return { data: tokens, message: 'Tokens refreshed' };
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string) {
    await this.redisService.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    return { data: null, message: 'Logged out successfully' };
  }

  // ─── Get Me ──────────────────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { data: this.sanitizeUser(user) };
  }

  // ─── Setup: Create First Super Admin ─────────────────────────────────────────

  async setupSuperAdmin(dto: SetupAdminDto) {
    const setupSecret = this.configService.get<string>('app.adminSetupSecret');

    if (!setupSecret || dto.setupSecret !== setupSecret) {
      throw new ForbiddenException('Invalid setup secret');
    }

    // Only allow if no admin exists
    // roles is stored as simple-array (plain text) — use LIKE not a direct match
    const adminExists = await this.userRepository
      .createQueryBuilder('user')
      .where('user.roles LIKE :role', { role: `%${Role.ADMIN}%` })
      .getOne();

    if (adminExists) {
      throw new ConflictException(
        'Super admin already exists. This endpoint is disabled.',
      );
    }

    await this.assertIdentifierNotTaken(dto.email, dto.phone);

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const admin = this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      phone: dto.phone || null,
      passwordHash,
      roles: [Role.ADMIN],
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: !!dto.phone,
    });

    await this.userRepository.save(admin);
    this.logger.log(`Super admin created: ${admin.id}`);

    return {
      data: { user: this.sanitizeUser(admin) },
      message: 'Super admin created successfully',
    };
  }

  // ─── Helpers used by other modules ───────────────────────────────────────────

  async createInviteToken(userId: string): Promise<string> {
    const token = uuidv4();
    const ttl = this.parseTtlToSeconds(
      this.configService.get<string>('jwt.inviteExpiresIn') || '7d',
    );
    await this.redisService.setEx(`${INVITE_TOKEN_PREFIX}${token}`, ttl, userId);
    return token;
  }

  // ─── Internal: OTP generation ─────────────────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendVerificationOtp(user: User): Promise<void> {
    if (user.email && !user.emailVerified) {
      const otp = this.generateOtp();
      await this.redisService.setEx(
        `${OTP_VERIFY_EMAIL_PREFIX}${user.id}`,
        OTP_TTL_SECONDS,
        otp,
      );
      await this.notificationsService.sendEmailVerificationOtp({
        fullName: user.fullName,
        email: user.email,
        otp,
      });
    }

    if (user.phone && !user.phoneVerified) {
      const otp = this.generateOtp();
      await this.redisService.setEx(
        `${OTP_VERIFY_PHONE_PREFIX}${user.id}`,
        OTP_TTL_SECONDS,
        otp,
      );
      await this.notificationsService.sendPhoneVerificationOtp({
        phone: user.phone,
        otp,
      });
    }
  }

  private async sendPasswordResetOtp(user: User): Promise<void> {
    const otp = this.generateOtp();
    await this.redisService.setEx(`${OTP_RESET_PREFIX}${user.id}`, OTP_TTL_SECONDS, otp);

    await this.notificationsService.sendPasswordResetOtp({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      otp,
    });
  }

  // ─── Token generation ─────────────────────────────────────────────────────────

  private async generateTokenPair(user: User) {
    const jti = uuidv4();

    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, phone: user.phone, roles: user.roles, type: 'access' },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get('jwt.accessExpiresIn') as any,
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti, type: 'refresh' },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn') as any,
      },
    );

    const ttl = this.parseTtlToSeconds(
      this.configService.get<string>('jwt.refreshExpiresIn') || '7d',
    );
    await this.redisService.setEx(`${REFRESH_TOKEN_PREFIX}${user.id}`, ttl, jti);

    return { accessToken, refreshToken };
  }

  // ─── Misc helpers ─────────────────────────────────────────────────────────────

  private async findByIdentifier(identifier: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: [
        { email: identifier.toLowerCase() },
        { phone: identifier },
      ],
    });
  }

  private async assertIdentifierNotTaken(email?: string, phone?: string) {
    if (email) {
      const exists = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
      });
      if (exists) throw new ConflictException('An account with this email already exists');
    }
    if (phone) {
      const exists = await this.userRepository.findOne({ where: { phone } });
      if (exists) throw new ConflictException('An account with this phone number already exists');
    }
  }

  sanitizeUser(user: User) {
    const { passwordHash, ...safe } = user as any;
    return safe;
  }

  private maskContact(user: User): string {
    if (user.email) {
      const [local, domain] = user.email.split('@');
      return `${local[0]}***@${domain}`;
    }
    if (user.phone) {
      return `${user.phone.slice(0, 4)}****${user.phone.slice(-2)}`;
    }
    return '***';
  }

  private parseTtlToSeconds(ttl: string): number {
    const unit = ttl.slice(-1);
    const value = parseInt(ttl.slice(0, -1), 10);
    const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (map[unit] || 1);
  }
}
