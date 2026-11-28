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
import { createHmac } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { CompanyAdmin } from '../../database/entities/company-admin.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorEarningsWallet } from '../../database/entities/vendor-earnings-wallet.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { CompanyActivationStatus } from '../../common/enums/company-activation-status.enum';
import { CompanyStatus } from '../../common/enums/company-status.enum';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferralsService } from '../referrals/referrals.service';
import { ConsentService } from '../policies/consent.service';
import { canonicalizePhone } from '../../common/utils/phone.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateDto } from './dto/activate.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetupAdminDto } from './dto/setup-admin.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { VendorSignupDto } from './dto/vendor-signup.dto';

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

// ─── Guest (passwordless, OTP-first) ──────────────────────────────────────────
// Guest OTPs are keyed by phone (not user id) so no user row is created until a
// code is actually verified — unverified numbers never pollute the users table.
const OTP_GUEST_PHONE_PREFIX = 'otp:guest:phone:';
const GUEST_PHONE_COOLDOWN_PREFIX = 'otp:guest:cooldown:phone:';
const GUEST_IP_COOLDOWN_PREFIX = 'otp:guest:cooldown:ip:';
const GUEST_PHONE_COOLDOWN_SECONDS = 60; // per-phone: primary anti-spam gate
const GUEST_IP_COOLDOWN_SECONDS = 8;     // per-IP: coarse burst/enumeration guard

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyAdmin)
    private companyAdminRepository: Repository<CompanyAdmin>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private notificationsService: NotificationsService,
    private referralsService: ReferralsService,
    private consentService: ConsentService,
    private dataSource: DataSource,
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

    // Provision the customer's WashPoints wallet up-front so reads never 404
    // before the first top-up. Idempotent; must never break signup.
    await this.ensureUserWallet(user.id);

    // Referral: issue this customer's own code + record any code they signed up with.
    // Must never break signup.
    try {
      await this.referralsService.issueCode(user.id, 'customer');
      await this.referralsService.attribute(dto.referralCode, user.id, 'customer');
    } catch (err) {
      this.logger.warn(`Referral attribution skipped: ${(err as Error).message}`);
    }

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
    const user = await this.findByIdentifier(dto.identifier, true); // needs the hash

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
        source: dto.source ?? 'user',
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
    // Clicking the invite link (sent to their email) already proves ownership —
    // no verification OTP needed.
    if (user.email) user.emailVerified = true;

    await this.userRepository.save(user);
    await this.redisService.del(`${INVITE_TOKEN_PREFIX}${dto.inviteToken}`);

    this.logger.log(`User activated via invite token: ${user.id}`);

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

    // Send welcome email on the first successful verification only.
    // Vendors get a DIFFERENT email: their account is PENDING_REVIEW at this point,
    // so the customer welcome ("place and track orders") would be wrong and
    // misleading — they must be told they're under review and need to finish KYC.
    if (isFirstVerification) {
      if (user.roles.includes(Role.VENDOR)) {
        this.notificationsService
          .notifyVendorApplicationReceived({ userId: user.id, fallbackName: user.fullName })
          .catch((err) =>
            this.logger.error(`Vendor application-received email failed: ${err.message}`),
          );
      } else {
        this.notificationsService
          .sendWelcome({ fullName: user.fullName, email: user.email, phone: user.phone })
          .catch((err) => this.logger.error(`Welcome email failed: ${err.message}`));
      }
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

    // Always return 200 to prevent enumeration.
    // PENDING users (company self-registrants, invited users awaiting activation)
    // legitimately need to (re)verify their email — allow them through for the
    // 'verification' purpose; password reset stays locked to active accounts.
    const canResend =
      !!user &&
      (user.status === UserStatus.ACTIVE ||
        (purpose === 'verification' && user.status === UserStatus.PENDING));
    if (!canResend) {
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

  // ─── Guest (passwordless, OTP-first) ─────────────────────────────────────────

  /**
   * Send a login/booking OTP to a phone for the account-less guest flow. The OTP
   * is keyed by phone; no user row is created until the code is verified. Always
   * returns a generic message so it never reveals whether the number has an
   * account. Rate-limited per phone (hard) and per IP (coarse).
   */
  async guestStart(phoneRaw: string, ctx: { ip?: string | null } = {}) {
    const phone = this.normalizePhone(phoneRaw);
    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
      throw new BadRequestException('Enter a valid phone number');
    }

    const phoneCooldownKey = `${GUEST_PHONE_COOLDOWN_PREFIX}${phone}`;
    if (await this.redisService.exists(phoneCooldownKey)) {
      throw new BadRequestException('Please wait a minute before requesting another code.');
    }
    if (ctx.ip) {
      const ipCooldownKey = `${GUEST_IP_COOLDOWN_PREFIX}${ctx.ip}`;
      if (await this.redisService.exists(ipCooldownKey)) {
        throw new BadRequestException('Too many requests. Please wait a few seconds and try again.');
      }
      await this.redisService.setEx(ipCooldownKey, GUEST_IP_COOLDOWN_SECONDS, '1');
    }

    const otp = this.generateOtp();
    await this.redisService.setEx(`${OTP_GUEST_PHONE_PREFIX}${phone}`, OTP_TTL_SECONDS, otp);
    await this.redisService.setEx(phoneCooldownKey, GUEST_PHONE_COOLDOWN_SECONDS, '1');

    // Delivery failures must not change the response (no enumeration signal).
    await this.notificationsService
      .sendPhoneVerificationOtp({ phone, otp })
      .catch((err) => this.logger.error(`Guest OTP send failed: ${err.message}`));

    return {
      data: { cooldownSeconds: GUEST_PHONE_COOLDOWN_SECONDS, expiresInMinutes: OTP_EXPIRY_MINUTES },
      message: 'If the number can receive SMS, a code has been sent.',
    };
  }

  /**
   * Verify a guest OTP and hand back a session. Resolves the phone to a user:
   *  - already has a password  → do NOT issue a session (that would bypass the
   *    password); tell them to log in.
   *  - passwordless (returning guest) → reuse the row, issue a session.
   *  - unknown phone → create a passwordless, phone-verified user, issue a session.
   * Consent (NDPA/privacy) is captured here against the current published policies.
   */
  async guestVerify(
    input: { phone: string; otp: string; name?: string },
    ctx: { ip?: string | null; userAgent?: string | null } = {},
  ) {
    const phone = this.normalizePhone(input.phone);
    const key = `${OTP_GUEST_PHONE_PREFIX}${phone}`;
    const stored = await this.redisService.get(key);
    if (!stored || stored !== input.otp) {
      throw new BadRequestException('Invalid or expired code');
    }
    await this.redisService.del(key);

    // Need passwordHash (select:false) to tell a full account from a guest row.
    const existing = await this.userRepository
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.phone = :phone', { phone })
      .getOne();

    if (existing) {
      if (
        existing.status === UserStatus.SUSPENDED ||
        existing.status === UserStatus.DEACTIVATED
      ) {
        throw new UnauthorizedException('This account is not available. Please contact support.');
      }
      if (existing.passwordHash) {
        // Real (password) account — never hand out an OTP-only session for it.
        return {
          data: { accountExists: true },
          message: 'You already have an account. Please log in to continue.',
        };
      }
      // Returning passwordless guest.
      if (!existing.phoneVerified) {
        existing.phoneVerified = true;
        await this.userRepository.save(existing);
      }
      return this.issueGuestSession(existing, ctx, false);
    }

    // Brand-new guest. Guard against a double-submit / concurrent create racing
    // on the unique phone column: on a unique violation, re-resolve and reuse.
    try {
      const user = this.userRepository.create({
        fullName: (input.name ?? '').trim() || 'Guest',
        email: null,
        phone,
        passwordHash: null,
        roles: [Role.USER],
        status: UserStatus.ACTIVE,
        emailVerified: false,
        phoneVerified: true,
      });
      await this.userRepository.save(user);
      this.logger.log(`Guest user created via OTP: ${user.id}`);
      return this.issueGuestSession(user, ctx, true);
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const raced = await this.userRepository
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.phone = :phone', { phone })
        .getOne();
      if (!raced) throw err;
      if (raced.passwordHash) {
        return {
          data: { accountExists: true },
          message: 'You already have an account. Please log in to continue.',
        };
      }
      return this.issueGuestSession(raced, ctx, false);
    }
  }

  private async issueGuestSession(
    user: User,
    ctx: { ip?: string | null; userAgent?: string | null },
    isNew: boolean,
  ) {
    await this.afterGuestIdentified(user, ctx);
    const tokens = await this.generateTokenPair(user);
    return {
      data: { user: this.sanitizeUser(user), ...tokens, isNew },
      message: 'Verified',
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (err as { code?: string })?.code === '23505'; // Postgres unique_violation
  }

  /** Shared post-identification side-effects for a guest: wallet + consent. Best-effort. */
  private async afterGuestIdentified(
    user: User,
    ctx: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    await this.ensureUserWallet(user.id).catch((err) =>
      this.logger.warn(`Guest wallet provisioning skipped: ${err.message}`),
    );
    try {
      // Accepts whatever privacy/terms policies are currently pending for the
      // 'user' audience; idempotent and a no-op when none are published yet.
      await this.consentService.accept(user.id, ['user'], undefined, 'explicit', {
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    } catch (err) {
      this.logger.warn(`Guest consent capture skipped: ${(err as Error).message}`);
    }
  }

  /** Create a vendor profile + earnings wallet for a user (within a transaction). */
  private async createVendorProfile(
    manager: EntityManager,
    userId: string,
    phone: string,
  ): Promise<void> {
    const vendor = manager.create(Vendor, {
      userId,
      businessName: null,
      phone,
      areaIds: [],
      verificationStatus: VendorVerificationStatus.PENDING_REVIEW,
      isAvailable: false,
      rating: 0,
      ratingCount: 0,
    });
    await manager.save(vendor);

    const wallet = manager.create(VendorEarningsWallet, {
      vendorId: vendor.id,
      balance: 0,
      totalEarned: 0,
      status: 'active',
    });
    await manager.save(wallet);
  }

  /** Canonical phone form shared by the guest and vendor-signup flows (see util). */
  private normalizePhone(raw: string): string {
    return canonicalizePhone(raw);
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

    // Company owners/admins need their companyId to call every /:companyId/... route.
    // The company app reads this off /auth/me right after login to hydrate its store.
    // A user maps to a company through the company_admins link (covers owner AND admin).
    let company: {
      id: string;
      name: string;
      activationStatus: string; // PENDING until invite-activation / admin approval completes
      status: string; // platform status (ACTIVE / INACTIVE)
      role: string; // this user's role within the company (owner / admin)
    } | null = null;
    const link = await this.companyAdminRepository.findOne({ where: { userId } });
    if (link) {
      const c = await this.companyRepository.findOne({ where: { id: link.companyId } });
      if (c) {
        company = {
          id: c.id,
          name: c.name,
          activationStatus: c.activationStatus,
          status: c.status,
          role: link.companyRole,
        };
      }
    }

    return { data: { ...this.sanitizeUser(user), company } };
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

  // ─── Company Self-Registration ────────────────────────────────────────────────

  async registerCompany(dto: RegisterCompanyDto) {
    // Check if company email already registered
    const existing = await this.companyRepository.findOne({
      where: { ownerEmail: dto.companyEmail.toLowerCase() },
    });
    if (existing) throw new ConflictException('A company with this email already exists');

    // Create the company in AWAITING_APPROVAL state
    const company = this.companyRepository.create({
      name: dto.companyName,
      ownerEmail: dto.companyEmail.toLowerCase(),
      activationStatus: CompanyActivationStatus.AWAITING_APPROVAL,
      status: CompanyStatus.INACTIVE,
      industry: dto.industry,
      phone: dto.phone,
      address: dto.address,
      website: dto.website,
      numberOfWorkers: dto.numberOfWorkers ? parseInt(dto.numberOfWorkers) : undefined,
    });
    await this.companyRepository.save(company);

    // Create or find contact person user account (PENDING status until company approved)
    let user = await this.userRepository.findOne({
      where: dto.contactPersonPhone
        ? [
            { email: dto.contactPersonEmail.toLowerCase() },
            { phone: dto.contactPersonPhone },
          ]
        : [{ email: dto.contactPersonEmail.toLowerCase() }],
    });

    if (!user) {
      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      user = this.userRepository.create({
        fullName: dto.contactPersonName,
        email: dto.contactPersonEmail.toLowerCase(),
        phone: dto.contactPersonPhone ?? null,
        passwordHash,
        roles: [Role.USER],
        status: UserStatus.PENDING,
        emailVerified: false,
        phoneVerified: false,
      });
      await this.userRepository.save(user);
    }

    // Send the verification OTP to the official company email (not the contact
    // person's personal email). Keyed by user.id, so verification still uses the
    // contact's identifier via /auth/verify-otp. Fire-and-forget.
    this.sendVerificationOtp(user, company.ownerEmail).catch((err) =>
      this.logger.error(`Company registration OTP failed: ${err.message}`),
    );

    this.logger.log(
      `Company self-registered: ${company.id} — "${company.name}" by contact ${user.id}`,
    );

    return {
      data: {
        companyId: company.id,
        verificationEmail: company.ownerEmail,
        message: `Company registration submitted. Pending admin approval. We sent a verification code to your company email (${company.ownerEmail}).`,
      },
    };
  }

  // ─── Vendor Self-Registration ─────────────────────────────────────────────────

  /**
   * Public vendor signup. Coexists with the admin-create/invite flow.
   *
   * Creates the User (VENDOR role, ACTIVE so they can log in), an empty Vendor
   * profile in PENDING_REVIEW (businessName/phone/etc. filled later in KYC) and
   * the earnings wallet — all atomically. A verification OTP is sent; the vendor
   * verifies via /auth/verify-otp, then completes KYC. The account cannot go
   * available / receive orders until an admin verifies it.
   */
  async registerVendor(dto: VendorSignupDto) {
    const phone = this.normalizePhone(dto.phone);
    const email = dto.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // A phone that already booked as a guest is a passwordless user row. Upgrade
    // THAT row (set a password, add the VENDOR role, attach a vendor profile)
    // rather than inserting a second user — the phone column is unique, so a
    // plain insert would 409 and the guest's booking history would be orphaned.
    const existing = await this.userRepository
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.phone = :phone OR u.email = :email', { phone, email })
      .getOne();

    // A phone/email that already belongs to a real (password) account conflicts,
    // exactly as before.
    if (existing?.passwordHash) {
      throw new ConflictException(
        existing.email === email
          ? 'An account with this email already exists'
          : 'An account with this phone number already exists',
      );
    }

    let user: User;
    let upgraded = false;

    if (existing && existing.phone === phone) {
      // Passwordless guest on this phone → upgrade in place. Guard the email: it
      // must not belong to a different user.
      const emailOwner = await this.userRepository.findOne({ where: { email } });
      if (emailOwner && emailOwner.id !== existing.id) {
        throw new ConflictException('An account with this email already exists');
      }
      user = await this.dataSource.transaction(async (manager) => {
        existing.fullName = dto.fullName.trim();
        existing.email = existing.email ?? email;
        existing.passwordHash = passwordHash;
        existing.status = UserStatus.ACTIVE;
        if (!existing.roles.includes(Role.VENDOR)) {
          existing.roles = [...existing.roles, Role.VENDOR];
        }
        await manager.save(existing);
        await this.createVendorProfile(manager, existing.id, phone);
        return existing;
      });
      upgraded = true;
    } else if (existing) {
      // Passwordless row matched by EMAIL only (e.g. an invited/pending user) —
      // not a guest on this phone. Treat the email as taken.
      throw new ConflictException('An account with this email already exists');
    } else {
      // Brand-new vendor.
      user = await this.dataSource.transaction(async (manager) => {
        const newUser = manager.create(User, {
          fullName: dto.fullName.trim(),
          email,
          phone,
          passwordHash,
          roles: [Role.VENDOR],
          status: UserStatus.ACTIVE,
          emailVerified: false,
          phoneVerified: false,
        });
        await manager.save(newUser);
        await this.createVendorProfile(manager, newUser.id, phone);
        return newUser;
      });
    }

    this.logger.log(
      `Vendor ${upgraded ? 'upgraded from guest' : 'self-registered'}: ${user.id}`,
    );

    // Referral: issue this vendor's own code + record any code they signed up with.
    try {
      await this.referralsService.issueCode(user.id, 'vendor');
      await this.referralsService.attribute(dto.referralCode, user.id, 'vendor');
    } catch (err) {
      this.logger.warn(`Vendor referral attribution skipped: ${(err as Error).message}`);
    }

    // Send verification OTP — welcome email is sent after OTP is verified
    this.sendVerificationOtp(user).catch((err) =>
      this.logger.error(`Vendor registration OTP failed: ${err.message}`),
    );

    const tokens = await this.generateTokenPair(user);

    return {
      data: {
        user: this.sanitizeUser(user),
        ...tokens,
        verificationSent: true,
      },
      message:
        'Vendor registration successful. A verification code has been sent. ' +
        'Verify your email, then complete your business profile.',
    };
  }

  // ─── Helpers used by other modules ───────────────────────────────────────────

  /** Idempotently provision a user's WashPoints wallet. Never throws into the caller. */
  private async ensureUserWallet(userId: string): Promise<void> {
    try {
      const walletRepo = this.dataSource.getRepository(Wallet);
      const existing = await walletRepo.findOne({ where: { userId } });
      if (!existing) {
        await walletRepo.save(walletRepo.create({ userId, balance: 0, fiatBalanceKobo: 0, isActive: true }));
        this.logger.log(`Wallet provisioned for user ${userId}`);
      }
    } catch (err) {
      this.logger.warn(`Wallet provisioning skipped for ${userId}: ${(err as Error).message}`);
    }
  }

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

  /**
   * Sends verification OTP(s) for a user.
   *
   * @param emailOverride  Deliver the email OTP to this address instead of
   *   user.email (used by company self-registration, where the code goes to the
   *   official company email rather than the contact person's personal email).
   *   The OTP is still keyed by user.id, so verification continues to use the
   *   user's own identifier (email/phone) via /auth/verify-otp.
   */
  private async sendVerificationOtp(user: User, emailOverride?: string): Promise<void> {
    const targetEmail = emailOverride ?? user.email;
    if (targetEmail && !user.emailVerified) {
      const otp = this.generateOtp();
      await this.redisService.setEx(
        `${OTP_VERIFY_EMAIL_PREFIX}${user.id}`,
        OTP_TTL_SECONDS,
        otp,
      );
      await this.notificationsService.sendEmailVerificationOtp({
        fullName: user.fullName,
        email: targetEmail,
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

    // ── topupKey ──────────────────────────────────────────────────────────────
    // Deterministic per-user key derived from TOPUP_SIGNING_SECRET + userId.
    // Never stored in DB. The mobile app uses this to generate the time-based
    // HMAC code (X-WM-Topup-Code) required on every top-up request.
    const signingSecret = this.configService.get<string>('topup.signingSecret') || '';
    const topupKey = signingSecret
      ? createHmac('sha256', signingSecret).update(user.id).digest('hex')
      : '';

    return { accessToken, refreshToken, topupKey };
  }

  // ─── Misc helpers ─────────────────────────────────────────────────────────────

  private async findByIdentifier(
    identifier: string,
    withPassword = false,
  ): Promise<User | null> {
    // passwordHash is select:false, so it's only loaded when a caller (login)
    // explicitly needs it to compare — never returned to any response otherwise.
    const qb = this.userRepository
      .createQueryBuilder('u')
      .where('u.email = :email OR u.phone = :phone', {
        email: identifier.toLowerCase(),
        phone: identifier,
      });
    if (withPassword) qb.addSelect('u.passwordHash');
    return qb.getOne();
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
