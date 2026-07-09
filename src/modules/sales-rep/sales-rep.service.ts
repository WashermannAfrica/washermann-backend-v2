import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, Repository } from 'typeorm';
import { SalesRepApplication } from '../../database/entities/sales-rep-application.entity';
import { SalesRep } from '../../database/entities/sales-rep.entity';
import { TutorialStep } from '../../database/entities/tutorial-step.entity';
import { AssessmentQuestion } from '../../database/entities/assessment-question.entity';
import { AssessmentAttempt } from '../../database/entities/assessment-attempt.entity';
import { SalesRepPayout } from '../../database/entities/sales-rep-payout.entity';
import { Referral } from '../../database/entities/referral.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/roles.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { AuthService } from '../auth/auth.service';
import { ReferralsService } from '../referrals/referrals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSalesRepApplicationDto } from './dto/create-sales-rep-application.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { RequestSalesRepPayoutDto } from './dto/request-payout.dto';
import { CreateTutorialStepDto, UpdateTutorialStepDto } from './dto/tutorial-step.dto';
import { CreateAssessmentQuestionDto, UpdateAssessmentQuestionDto } from './dto/assessment-question.dto';

/** Hard pass gate for the onboarding assessment (configurable in B3). */
const PASS_MARK_PCT = 70;

@Injectable()
export class SalesRepService implements OnModuleInit {
  private readonly logger = new Logger(SalesRepService.name);

  constructor(
    @InjectRepository(SalesRepApplication) private readonly applications: Repository<SalesRepApplication>,
    @InjectRepository(SalesRep) private readonly reps: Repository<SalesRep>,
    @InjectRepository(TutorialStep) private readonly steps: Repository<TutorialStep>,
    @InjectRepository(AssessmentQuestion) private readonly questions: Repository<AssessmentQuestion>,
    @InjectRepository(AssessmentAttempt) private readonly attempts: Repository<AssessmentAttempt>,
    @InjectRepository(SalesRepPayout) private readonly payouts: Repository<SalesRepPayout>,
    @InjectRepository(Referral) private readonly referrals: Repository<Referral>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly referralsService: ReferralsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedTutorial();
      await this.seedAssessment();
    } catch (err) {
      this.logger.warn(`Skipped sales-rep content seeding (${(err as Error).message})`);
    }
  }

  // ─── Seeds (admin-editable placeholders) ──────────────────────────────────────
  private async seedTutorial() {
    if ((await this.steps.count()) > 0) return;
    const seed: Array<[number, string, string]> = [
      [1, 'Welcome to the Washermann Sales Rep program', 'You earn cash for every customer and vendor you bring onto Washermann. This short course explains how it works and how you get paid.'],
      [2, 'How referrals work', 'You get a unique referral code (e.g. WM-AB12CD). When someone signs up with your code, they are permanently linked to you. A customer referral unlocks after their first completed order; a vendor referral unlocks when the vendor is approved.'],
      [3, 'Getting paid', 'Rewards accrue as cash in your dashboard. Once a referral is "available", you can request a payout to your bank account. Payouts are reviewed and disbursed by the Washermann finance team.'],
      [4, 'Playing fair', 'Self-referrals and fake signups are not rewarded and can get you suspended. Only refer real customers and vendors. Be honest about Washermann’s pricing and service.'],
    ];
    for (const [orderIndex, title, body] of seed) {
      await this.steps.save(this.steps.create({ orderIndex, title, body, active: true }));
    }
    this.logger.log(`Seeded ${seed.length} tutorial step(s)`);
  }

  private async seedAssessment() {
    if ((await this.questions.count()) > 0) return;
    const seed: Array<[string, string[], number]> = [
      ['When does a CUSTOMER referral become payable?', ['Immediately at signup', 'After their first completed order', 'After 30 days', 'Never'], 1],
      ['When does a VENDOR referral become payable?', ['When the vendor signs up', 'When the vendor is approved by admin', 'After the vendor’s 10th order', 'It is not payable'], 1],
      ['In what currency are sales reps paid their rewards?', ['WashPoints', 'Airtime', 'Cash (bank transfer)', 'Vouchers'], 2],
      ['Is referring yourself with your own code rewarded?', ['Yes, always', 'No — self-referrals are blocked', 'Only the first time', 'Only for vendors'], 1],
      ['How do you receive your earnings?', ['Automatically every day', 'By requesting a payout from your dashboard', 'By calling support', 'You cannot withdraw'], 1],
    ];
    for (const [prompt, options, correctIndex] of seed) {
      await this.questions.save(this.questions.create({ prompt, options, correctIndex, active: true }));
    }
    this.logger.log(`Seeded ${seed.length} assessment question(s)`);
  }

  // ─── Public application ───────────────────────────────────────────────────────
  /**
   * Public pre-submit check for the application form: is this email/phone already
   * tied to a user account? Mirrors the accept-time conflict (phone is UNIQUE on
   * users; an existing email account would just gain the SALES_REP role, but we
   * still surface it so the applicant knows to log in instead of re-registering).
   */
  async checkAvailability(email?: string, phone?: string) {
    const e = email?.trim().toLowerCase();
    const p = phone?.trim();
    const [emailTaken, phoneTaken] = await Promise.all([
      e ? this.users.exists({ where: { email: e } }) : Promise.resolve(false),
      p ? this.users.exists({ where: { phone: p } }) : Promise.resolve(false),
    ]);
    return { emailTaken, phoneTaken };
  }

  async apply(dto: CreateSalesRepApplicationDto) {
    const application = this.applications.create({
      fullName: dto.fullName.trim(),
      phone: dto.phone.trim(),
      email: dto.email.trim().toLowerCase(),
      areaOfLagos: dto.areaOfLagos.trim(),
      address: dto.address.trim(),
      hasSalesExperience: dto.hasSalesExperience ?? false,
      whyJoin: dto.whyJoin?.trim() ?? null,
      status: 'new',
    });
    await this.applications.save(application);
    return { submitted: true };
  }

  // ─── Admin: applications ──────────────────────────────────────────────────────
  async listApplications(query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const [data, total] = await this.applications.findAndCount({
      where: query.status ? { status: query.status as any } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async acceptApplication(applicationId: string, adminId: string) {
    const app = await this.applications.findOne({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status === 'accepted' && app.userId) {
      return { application: app, inviteToken: null, note: 'Already accepted' };
    }

    const email = app.email.toLowerCase().trim();
    let inviteToken: string | null = null;

    const userId = await this.dataSource.transaction(async (manager) => {
      let user = await manager.findOne(User, { where: { email } });
      if (user) {
        if (!user.roles.includes(Role.SALES_REP)) {
          user.roles = [...user.roles, Role.SALES_REP];
          await manager.save(user);
        }
      } else {
        // Phone is UNIQUE on users. If this application's phone already belongs to
        // another account, block the accept with a clear reason so the admin can
        // reach out (phone, then email) and have one applicant reapply with a
        // unique number.
        const phone = app.phone?.trim() || null;
        if (phone && (await manager.findOne(User, { where: { phone } }))) {
          throw new ConflictException(
            `Phone number ${phone} is already registered to another account. ` +
              `Confirm with the applicant — they must reapply with a unique phone number.`,
          );
        }
        user = manager.create(User, {
          fullName: app.fullName.trim(),
          email,
          phone,
          passwordHash: null,
          roles: [Role.SALES_REP],
          status: UserStatus.PENDING,
          emailVerified: false,
          phoneVerified: false,
        });
        await manager.save(user);
      }

      const existingProfile = await manager.findOne(SalesRep, { where: { userId: user.id } });
      if (!existingProfile) {
        await manager.save(
          manager.create(SalesRep, {
            userId: user.id,
            applicationId: app.id,
            status: 'onboarding',
            assessmentPassed: false,
            bestScorePct: 0,
          }),
        );
      }

      app.status = 'accepted';
      app.reviewedBy = adminId;
      app.reviewedAt = new Date();
      app.userId = user.id;
      await manager.save(app);
      return { id: user.id, status: user.status, fullName: user.fullName };
    });

    // New (pending) accounts get an invite to set their password; existing
    // accounts already have credentials.
    const created = await this.users.findOne({ where: { id: userId.id } });
    if (created && created.status === UserStatus.PENDING) {
      inviteToken = await this.authService.createInviteToken(created.id);
      // Invite must route to the sales-rep portal's /invite page, not the app deep link.
      const deepLinkBase =
        this.configService.get<string>('app.salesRepPortalUrl') || 'http://localhost:3005';
      try {
        await this.notificationsService.sendStaffInvite({
          fullName: created.fullName,
          email,
          role: 'Sales Rep',
          inviteToken,
          deepLinkBase,
        });
      } catch (err) {
        this.logger.warn(`Sales-rep invite email failed for ${email}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Sales-rep application ${app.id} accepted → user ${userId.id} by ${adminId}`);
    return { application: app, inviteToken };
  }

  async rejectApplication(applicationId: string, adminId: string, reason?: string) {
    const app = await this.applications.findOne({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');
    app.status = 'rejected';
    app.reviewedBy = adminId;
    app.reviewedAt = new Date();
    app.rejectionReason = reason ?? null;
    await this.applications.save(app);

    // Notify the applicant (best-effort; never block the rejection).
    this.notificationsService
      .sendSalesRepRejection({ fullName: app.fullName, email: app.email, reason: app.rejectionReason })
      .catch((err) => this.logger.warn(`Sales-rep rejection email failed for ${app.email}: ${(err as Error).message}`));

    return { application: app };
  }

  // ─── Onboarding: tutorial + assessment ────────────────────────────────────────
  getTutorial() {
    return this.steps.find({ where: { active: true }, order: { orderIndex: 'ASC' } });
  }

  /** Questions WITHOUT the correct answer (never leak correctIndex to the rep). */
  async getAssessment() {
    const qs = await this.questions.find({ where: { active: true }, order: { createdAt: 'ASC' } });
    return {
      passMark: PASS_MARK_PCT,
      questions: qs.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })),
    };
  }

  private async getProfileOrThrow(userId: string): Promise<SalesRep> {
    const profile = await this.reps.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Sales-rep profile not found');
    return profile;
  }

  async submitAssessment(userId: string, dto: SubmitAssessmentDto) {
    const profile = await this.getProfileOrThrow(userId);

    const qs = await this.questions.find({ where: { active: true } });
    if (qs.length === 0) throw new BadRequestException('No assessment is configured');

    const answers = dto.answers ?? {};
    const score = qs.reduce((acc, q) => (answers[q.id] === q.correctIndex ? acc + 1 : acc), 0);
    const total = qs.length;
    const scorePct = Math.round((score / total) * 10000) / 100;
    const passed = scorePct >= PASS_MARK_PCT;

    await this.attempts.save(
      this.attempts.create({ salesRepUserId: userId, score, totalQuestions: total, scorePct, passed, answers }),
    );

    if (scorePct > Number(profile.bestScorePct)) profile.bestScorePct = scorePct;

    let code: string | null = null;
    if (passed && !profile.assessmentPassed) {
      profile.assessmentPassed = true;
      profile.passedAt = new Date();
      profile.status = 'active';
      await this.reps.save(profile);
      const issued = await this.referralsService.issueCode(userId, 'sales_rep');
      code = issued.code;
      this.logger.log(`Sales rep ${userId} passed assessment (${scorePct}%) → code ${code}`);
    } else {
      await this.reps.save(profile);
      if (profile.assessmentPassed) {
        const issued = await this.referralsService.issueCode(userId, 'sales_rep');
        code = issued.code;
      }
    }

    return { passed, scorePct, score, total, passMark: PASS_MARK_PCT, code };
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────────
  async getDashboard(userId: string) {
    const profile = await this.getProfileOrThrow(userId);
    const referral = await this.referralsService.myReferrals(userId);
    const payouts = await this.payouts.find({ where: { salesRepUserId: userId }, order: { createdAt: 'DESC' } });
    return {
      profile: {
        status: profile.status,
        assessmentPassed: profile.assessmentPassed,
        bestScorePct: Number(profile.bestScorePct),
        passedAt: profile.passedAt,
        bank: {
          bankCode: profile.bankCode,
          accountNumber: profile.accountNumber,
          accountName: profile.accountName,
        },
      },
      referral,
      payouts,
    };
  }

  /** Admin: full detail for one sales rep — profile, user, earnings + referrals (named), payouts. */
  async salesRepDetail(userId: string) {
    const profile = await this.getProfileOrThrow(userId);
    const user = await this.users.findOne({ where: { id: userId } });
    const referral = await this.referralsService.myReferrals(userId);
    const payouts = await this.payouts.find({ where: { salesRepUserId: userId }, order: { createdAt: 'DESC' } });
    return {
      user: user ? { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone } : null,
      profile: {
        status: profile.status,
        assessmentPassed: profile.assessmentPassed,
        bestScorePct: Number(profile.bestScorePct),
        passedAt: profile.passedAt,
        upgradedToRepAt: profile.upgradedToRepAt,
        createdAt: profile.createdAt,
        bank: { bankCode: profile.bankCode, accountNumber: profile.accountNumber, accountName: profile.accountName },
      },
      referral,
      payouts,
    };
  }

  // ─── Payouts ──────────────────────────────────────────────────────────────────
  private async availableCashReferrals(userId: string): Promise<Referral[]> {
    return this.referrals.find({
      where: { referrerUserId: userId, status: 'available', rewardCurrency: 'cash' },
    });
  }

  async requestPayout(userId: string, dto: RequestSalesRepPayoutDto) {
    const profile = await this.getProfileOrThrow(userId);
    if (!profile.assessmentPassed || profile.status !== 'active') {
      throw new ForbiddenException('Complete onboarding before requesting a payout');
    }

    const open = await this.payouts.findOne({
      where: [
        { salesRepUserId: userId, status: 'pending' },
        { salesRepUserId: userId, status: 'processing' },
      ],
    });
    if (open) throw new ConflictException('You already have a payout in progress');

    const available = await this.availableCashReferrals(userId);
    const amount = available.reduce((a, r) => a + Number(r.rewardAmount ?? 0), 0);
    if (amount <= 0) throw new BadRequestException('No available balance to pay out');

    // remember the bank destination on the profile for convenience
    profile.bankCode = dto.bankCode.trim();
    profile.accountNumber = dto.accountNumber.trim();
    profile.accountName = dto.accountName.trim();
    await this.reps.save(profile);

    const payout = await this.payouts.save(
      this.payouts.create({
        salesRepUserId: userId,
        amountNaira: Math.round(amount * 100) / 100,
        referralIds: available.map((r) => r.id),
        status: 'pending',
        bankCode: dto.bankCode.trim(),
        accountNumber: dto.accountNumber.trim(),
        accountName: dto.accountName.trim(),
      }),
    );
    this.logger.log(`Sales-rep payout requested: ${payout.id} | ${userId} | ₦${payout.amountNaira}`);
    return payout;
  }

  // ─── Admin: payouts ───────────────────────────────────────────────────────────
  async listPayouts(query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const [rows, total] = await this.payouts.findAndCount({
      where: query.status ? { status: query.status as any } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    // Attach the sales rep's name/email so the admin table shows who, not a UUID.
    const ids = [...new Set(rows.map((r) => r.salesRepUserId))];
    const users = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = rows.map((r) => ({
      ...r,
      salesRepName: byId.get(r.salesRepUserId)?.fullName ?? null,
      salesRepEmail: byId.get(r.salesRepUserId)?.email ?? null,
    }));
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /**
   * Admin confirms the cash transfer was made. Marks the covered referrals paid
   * and the payout completed. (Real bank disbursement via the Paystack transfer
   * rail can be wired here later — reuses short-code-backend payment builders.)
   */
  async approvePayout(payoutId: string, adminId: string, reference?: string) {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'pending') throw new BadRequestException(`Payout is ${payout.status}, not pending`);

    await this.dataSource.transaction(async (manager) => {
      if (payout.referralIds.length > 0) {
        await manager.update(
          Referral,
          { id: In(payout.referralIds), status: 'available' },
          { status: 'paid', paidAt: new Date() },
        );
      }
      payout.status = 'completed';
      payout.approvedBy = adminId;
      payout.approvedAt = new Date();
      payout.completedAt = new Date();
      payout.reference = reference ?? null;
      await manager.save(payout);
    });
    this.logger.log(`Sales-rep payout ${payout.id} approved/completed by ${adminId}`);
    return payout;
  }

  async failPayout(payoutId: string, adminId: string, reason?: string) {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status === 'completed') throw new BadRequestException('Payout already completed');
    payout.status = 'failed';
    payout.approvedBy = adminId;
    payout.approvedAt = new Date();
    payout.failureReason = reason ?? null;
    await this.payouts.save(payout);
    // referrals were never marked paid → they remain 'available' and re-requestable
    return payout;
  }

  // ─── Admin: sales reps ────────────────────────────────────────────────────────
  async listSalesReps(query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const [data, total] = await this.reps.findAndCount({
      where: query.status ? { status: query.status as any } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Attach the rep's user (name/email/phone) so the admin list is recognisable.
    const ids = data.map((r) => r.userId);
    const users = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const enriched = data.map((r) => {
      const u = userById.get(r.userId);
      return { ...r, user: u ? { fullName: u.fullName, email: u.email, phone: u.phone } : null };
    });

    return { data: enriched, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /**
   * Internal upgrade: grant the user the wash-rep (field logistics) role and flag
   * the upgrade. Operational Rep provisioning (zones, vehicle) remains the existing
   * reps admin flow; the rep keeps their existing referral code.
   */
  async upgradeToWashRep(userId: string, adminId: string) {
    const profile = await this.getProfileOrThrow(userId);
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.roles.includes(Role.REP)) {
      user.roles = [...user.roles, Role.REP];
      await this.users.save(user);
    }
    profile.upgradedToRepAt = new Date();
    await this.reps.save(profile);
    this.logger.log(`Sales rep ${userId} upgraded to wash rep by ${adminId}`);
    return { userId, roles: user.roles, upgradedAt: profile.upgradedToRepAt };
  }

  // ─── Admin: content management (tutorial steps) ───────────────────────────────
  adminListSteps() {
    return this.steps.find({ order: { orderIndex: 'ASC', createdAt: 'ASC' } });
  }

  createStep(dto: CreateTutorialStepDto) {
    return this.steps.save(
      this.steps.create({
        orderIndex: dto.orderIndex ?? 0,
        title: dto.title.trim(),
        body: dto.body.trim(),
        active: dto.active ?? true,
      }),
    );
  }

  async updateStep(id: string, dto: UpdateTutorialStepDto) {
    const step = await this.steps.findOne({ where: { id } });
    if (!step) throw new NotFoundException('Tutorial step not found');
    if (dto.orderIndex != null) step.orderIndex = dto.orderIndex;
    if (dto.title != null) step.title = dto.title.trim();
    if (dto.body != null) step.body = dto.body.trim();
    if (dto.active != null) step.active = dto.active;
    return this.steps.save(step);
  }

  async deleteStep(id: string) {
    const step = await this.steps.findOne({ where: { id } });
    if (!step) throw new NotFoundException('Tutorial step not found');
    await this.steps.remove(step);
    return { deleted: true };
  }

  // ─── Admin: content management (assessment questions) ─────────────────────────
  adminListQuestions() {
    return this.questions.find({ order: { createdAt: 'ASC' } });
  }

  private assertCorrectIndex(options: string[], correctIndex: number) {
    if (correctIndex < 0 || correctIndex >= options.length) {
      throw new BadRequestException('correctIndex is out of range for the given options');
    }
  }

  createQuestion(dto: CreateAssessmentQuestionDto) {
    const options = dto.options.map((o) => o.trim());
    this.assertCorrectIndex(options, dto.correctIndex);
    return this.questions.save(
      this.questions.create({
        prompt: dto.prompt.trim(),
        options,
        correctIndex: dto.correctIndex,
        active: dto.active ?? true,
      }),
    );
  }

  async updateQuestion(id: string, dto: UpdateAssessmentQuestionDto) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    if (dto.prompt != null) q.prompt = dto.prompt.trim();
    if (dto.options != null) q.options = dto.options.map((o) => o.trim());
    if (dto.correctIndex != null) q.correctIndex = dto.correctIndex;
    this.assertCorrectIndex(q.options, q.correctIndex);
    if (dto.active != null) q.active = dto.active;
    return this.questions.save(q);
  }

  async deleteQuestion(id: string) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    await this.questions.remove(q);
    return { deleted: true };
  }

  // ─── Admin: consolidated overview ─────────────────────────────────────────────
  async adminSummary() {
    const [apps, reps, payouts] = await Promise.all([
      this.applications.find(),
      this.reps.find(),
      this.payouts.find(),
    ]);
    const tally = <T extends { status: string }>(rows: T[]) =>
      rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
    const outstandingPayout = payouts
      .filter((p) => p.status === 'pending' || p.status === 'processing')
      .reduce((a, p) => a + Number(p.amountNaira), 0);
    const paidOut = payouts
      .filter((p) => p.status === 'completed')
      .reduce((a, p) => a + Number(p.amountNaira), 0);
    return {
      applications: { total: apps.length, byStatus: tally(apps) },
      salesReps: { total: reps.length, byStatus: tally(reps) },
      payouts: { total: payouts.length, byStatus: tally(payouts), outstandingNaira: outstandingPayout, paidNaira: paidOut },
    };
  }
}
