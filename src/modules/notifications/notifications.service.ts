import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../../database/entities/user.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { GarmentPriceItem } from '../../database/entities/vendor-pricing.entity';
import { Rep } from '../../database/entities/rep.entity';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { PushService } from './push/push.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { InAppService } from './in-app/in-app.service';
import { TemplateService } from './template/template.service';
import { InAppNotificationType } from '../../database/entities/in-app-notification.entity';
import { Role } from '../../common/enums/roles.enum';
import {
  welcomeTemplate,
  emailVerificationOtpTemplate,
  passwordResetOtpTemplate,
  companyInviteTemplate,
  employeeInviteTemplate,
  staffInviteTemplate,
  vendorInviteTemplate,
  salesRepRejectionTemplate,
} from './templates';

const OTP_EXPIRY_MINUTES = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fire-and-forget wrapper — notification failures must never crash business logic */
function fire(fn: () => Promise<unknown>, logger: Logger, label: string) {
  fn().catch((err) => logger.warn(`Notification failed [${label}]: ${err?.message ?? err}`));
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Vendor)
    private vendorRepo: Repository<Vendor>,

    @InjectRepository(Rep)
    private repRepo: Repository<Rep>,

    private readonly emailService:    EmailService,
    private readonly smsService:      SmsService,
    private readonly pushService:     PushService,
    private readonly whatsappService: WhatsappService,
    private readonly inAppService:    InAppService,
    private readonly templateService: TemplateService,
    private readonly configService:   ConfigService,
  ) {}

  // ─── User contact lookup helpers ─────────────────────────────────────────────

  private async getUser(userId: string) {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  private async getVendorUser(vendorId: string) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) return { vendor: null, user: null };
    const user = await this.userRepo.findOne({ where: { id: vendor.userId } });
    return { vendor, user };
  }

  private async getRepUser(repId: string) {
    const rep = await this.repRepo.findOne({ where: { id: repId } });
    if (!rep) return { rep: null, user: null };
    const user = await this.userRepo.findOne({ where: { id: rep.userId } });
    return { rep, user };
  }

  private adminEmail(): string {
    return this.configService.get<string>('notifications.adminEmail') || '';
  }

  // ─── Core render + dispatch ───────────────────────────────────────────────────

  private async sendEmail(key: string, to: string, vars: Record<string, string | number>) {
    const tpl = await this.templateService.render(key, 'email', vars);
    if (!tpl) return;
    await this.emailService.send({ to, subject: tpl.subject ?? '', html: tpl.htmlBody ?? tpl.body });
  }

  /**
   * Notify all admins/finance that a WashPoint rate review is due — in-app
   * (dashboard) + email. The engine never changes the rate itself; an admin must
   * input the live economic values and approve the advised V.
   */
  async sendRateReviewPrompt(trigger: 'scheduled' | 'manual' = 'scheduled') {
    const all = await this.userRepo.find();
    const admins = all.filter(
      (u) => Array.isArray(u.roles) && (u.roles.includes(Role.ADMIN) || u.roles.includes(Role.FINANCE)),
    );
    const title = 'WashPoint rate review due';
    const body =
      'Open the rate console, enter the current economic indicators (USD/NGN, diesel, median vendor cost), run the calculation and approve or hold the advised WashPoint rate.';
    for (const a of admins) {
      try {
        await this.inAppService.create({ userId: a.id, title, body, type: 'account', metadata: { kind: 'wp_rate_review', trigger } });
      } catch (err) {
        this.logger.warn(`In-app rate prompt failed for ${a.id}: ${(err as Error).message}`);
      }
      if (a.email) {
        try {
          await this.emailService.send({
            to: a.email,
            subject: 'Action needed: WashPoint rate review',
            html:
              `<p>Hi ${a.fullName ?? 'Admin'},</p>` +
              `<p>A WashPoint conversion-rate (V) review is due (${trigger}). Please open the admin rate console, ` +
              `enter the current economic indicators, run the calculation, and approve or hold the advised rate. ` +
              `Every calculation is logged whether approved or not.</p>`,
          });
        } catch (err) {
          this.logger.warn(`Email rate prompt failed for ${a.email}: ${(err as Error).message}`);
        }
      }
    }
    this.logger.log(`Rate review prompt (${trigger}) sent to ${admins.length} admin(s)`);
    return { notified: admins.length };
  }

  private async sendSms(key: string, to: string, vars: Record<string, string | number>) {
    const tpl = await this.templateService.render(key, 'sms', vars);
    if (!tpl) return;
    await this.smsService.send({ to, message: tpl.body });
  }

  private async sendPush(key: string, token: string, vars: Record<string, string | number>, data?: Record<string, string>) {
    const tpl = await this.templateService.render(key, 'push', vars);
    if (!tpl) return;
    await this.pushService.send({ token, title: tpl.subject ?? '', body: tpl.body, data });
  }

  private async sendWhatsapp(key: string, to: string, vars: Record<string, string | number>) {
    const tpl = await this.templateService.render(key, 'whatsapp', vars);
    if (!tpl) return;
    await this.whatsappService.send({ to, message: tpl.body });
  }

  private async sendInApp(
    key:      string,
    userId:   string,
    vars:     Record<string, string | number>,
    type:     InAppNotificationType,
    metadata?: Record<string, any>,
  ) {
    const tpl = await this.templateService.render(key, 'in_app', vars);
    if (!tpl) return;
    await this.inAppService.create({
      userId,
      title:    tpl.subject ?? '',
      body:     tpl.body,
      type,
      metadata: metadata ?? null,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH — kept from previous version (hardcoded templates, pre-Phase 6)
  // ═══════════════════════════════════════════════════════════════════════════

  async sendWelcome(data: { fullName: string; email?: string; phone?: string }) {
    if (data.email) {
      const template = welcomeTemplate({ fullName: data.fullName });
      await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
    }
  }

  async sendEmailVerificationOtp(data: { fullName: string; email: string; otp: string }) {
    const template = emailVerificationOtpTemplate({
      fullName: data.fullName, otp: data.otp, expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
    await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
  }

  async sendPhoneVerificationOtp(data: { phone: string; otp: string }) {
    await this.smsService.send({
      to:      data.phone,
      message: `Your Washermann verification code is: ${data.otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`,
    });
  }

  async sendPasswordResetOtp(data: { fullName: string; email?: string; phone?: string; otp: string }) {
    if (data.email) {
      const template = passwordResetOtpTemplate({
        fullName: data.fullName, otp: data.otp, expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
      await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
    }
    if (data.phone) {
      await this.smsService.send({
        to:      data.phone,
        message: `Your Washermann password reset code is: ${data.otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`,
      });
    }
  }

  async sendCompanyInvite(data: { companyName: string; ownerEmail: string; inviteToken: string; deepLinkBase: string }) {
    const inviteLink = `${data.deepLinkBase}/company/activate?token=${data.inviteToken}`;
    const template   = companyInviteTemplate({ companyName: data.companyName, inviteLink });
    await this.emailService.send({ to: data.ownerEmail, subject: template.subject, html: template.html });
  }

  async sendEmployeeInvite(data: { fullName: string; email?: string; phone?: string; companyName: string; inviteToken: string; deepLinkBase: string }) {
    const inviteLink = `${data.deepLinkBase}/invite?token=${data.inviteToken}`;
    if (data.email) {
      const template = employeeInviteTemplate({ fullName: data.fullName, companyName: data.companyName, inviteLink });
      await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
    }
    if (data.phone) {
      await this.smsService.send({ to: data.phone, message: `${data.companyName} has added you to Washermann. Set up your account: ${inviteLink}` });
    }
  }

  async sendStaffInvite(data: { fullName: string; email: string; role: string; inviteToken: string; deepLinkBase: string }) {
    const inviteLink = `${data.deepLinkBase}/invite?token=${data.inviteToken}`;
    const template   = staffInviteTemplate({ fullName: data.fullName, role: data.role, inviteLink });
    await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
  }

  async sendSalesRepRejection(data: { fullName: string; email: string; reason?: string | null }) {
    const template = salesRepRejectionTemplate({ fullName: data.fullName, reason: data.reason });
    await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
  }

  async sendVendorInvite(data: { fullName: string; email: string; businessName: string; inviteToken: string; deepLinkBase: string }) {
    const inviteLink = `${data.deepLinkBase}/invite?token=${data.inviteToken}`;
    const template   = vendorInviteTemplate({ fullName: data.fullName, businessName: data.businessName, inviteLink });
    await this.emailService.send({ to: data.email, subject: template.subject, html: template.html });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORDER EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fire when a customer places an order (OrderStatus.PAID).
   */
  async notifyOrderPlaced(params: {
    customerId:       string;
    orderRef:         string;
    totalWP:          number;
    nairaEquivalent:  number;
    pickupAddress:    string;
    scheduledPickupAt: string;
  }) {
    const user = await this.getUser(params.customerId);
    if (!user) return;

    const vars: Record<string, string | number> = {
      customerName:     user.fullName,
      orderRef:         params.orderRef,
      totalWP:          params.totalWP,
      nairaEquivalent:  params.nairaEquivalent,
      pickupAddress:    params.pickupAddress,
      scheduledPickupAt: params.scheduledPickupAt,
    };
    const key = 'order.placed.customer';
    const meta = { orderRef: params.orderRef };

    fire(async () => {
      await Promise.all([
        user.email && this.sendEmail(key, user.email, vars),
        user.phone && this.sendSms(key, user.phone, vars),
        user.fcmToken && this.sendPush(key, user.fcmToken, vars, { orderRef: params.orderRef }),
        this.sendInApp(key, user.id, vars, 'order', meta),
        user.phone && this.sendWhatsapp(key, user.phone, vars),
      ]);
    }, this.logger, key);
  }

  /**
   * Fire when a rep is assigned to an order.
   */
  async notifyRepAssigned(params: {
    customerId: string;
    repId:      string;
    orderRef:   string;
  }) {
    const [customer, repInfo] = await Promise.all([
      this.getUser(params.customerId),
      this.getRepUser(params.repId),
    ]);
    if (!customer) return;

    const repName = repInfo.user?.fullName ?? 'Your rep';
    const vars: Record<string, string | number> = {
      customerName: customer.fullName,
      repName,
      orderRef: params.orderRef,
    };
    const key  = 'order.rep_assigned.customer';
    const meta = { orderRef: params.orderRef };

    fire(async () => {
      await Promise.all([
        customer.fcmToken && this.sendPush(key, customer.fcmToken, vars, { orderRef: params.orderRef }),
        this.sendInApp(key, customer.id, vars, 'order', meta),
        customer.phone && this.sendWhatsapp(key, customer.phone, vars),
      ]);
    }, this.logger, key);
  }

  /**
   * Fire when a rep marks an order as PICKED_UP.
   */
  async notifyOrderPickedUp(params: {
    customerId: string;
    vendorId:   string;
    repId:      string;
    orderRef:   string;
  }) {
    const [customer, vendorInfo, repInfo] = await Promise.all([
      this.getUser(params.customerId),
      this.getVendorUser(params.vendorId),
      this.getRepUser(params.repId),
    ]);

    const repName = repInfo.user?.fullName ?? 'Rep';
    const meta    = { orderRef: params.orderRef };

    fire(async () => {
      const customerVars: Record<string, string | number> = {
        customerName: customer?.fullName ?? '',
        orderRef:     params.orderRef,
      };
      const vendorVars: Record<string, string | number> = {
        vendorName: vendorInfo.vendor?.businessName ?? '',
        orderRef:   params.orderRef,
        repName,
      };

      await Promise.all([
        // Customer
        customer?.fcmToken && this.sendPush('order.picked_up.customer', customer.fcmToken, customerVars, { orderRef: params.orderRef }),
        customer && this.sendInApp('order.picked_up.customer', customer.id, customerVars, 'order', meta),
        customer?.phone && this.sendWhatsapp('order.picked_up.customer', customer.phone, customerVars),
        // Vendor
        vendorInfo.user?.fcmToken && this.sendPush('order.picked_up.vendor', vendorInfo.user.fcmToken, vendorVars, { orderRef: params.orderRef }),
        vendorInfo.vendor && this.sendInApp('order.picked_up.vendor', vendorInfo.vendor.userId, vendorVars, 'order', meta),
        vendorInfo.user?.phone && this.sendWhatsapp('order.picked_up.vendor', vendorInfo.user.phone, vendorVars),
      ]);
    }, this.logger, 'order.picked_up');
  }

  /**
   * Fire when a rep delivers laundry back to the customer.
   */
  async notifyOrderDelivered(params: {
    customerId: string;
    vendorId:   string | null;
    repId:      string | null;
    orderRef:   string;
  }) {
    const [customer, vendorInfo, repInfo] = await Promise.all([
      this.getUser(params.customerId),
      params.vendorId ? this.getVendorUser(params.vendorId) : Promise.resolve({ vendor: null, user: null }),
      params.repId    ? this.getRepUser(params.repId)       : Promise.resolve({ rep:    null, user: null }),
    ]);
    if (!customer) return;

    const vars: Record<string, string | number> = {
      customerName: customer.fullName,
      orderRef:     params.orderRef,
      vendorName:   vendorInfo.vendor?.businessName ?? '',
      repName:      repInfo.user?.fullName ?? '',
    };
    const key  = 'order.delivered.customer';
    const meta = { orderRef: params.orderRef };

    fire(async () => {
      await Promise.all([
        customer.email    && this.sendEmail(key, customer.email, vars),
        customer.phone    && this.sendSms(key, customer.phone, vars),
        customer.fcmToken && this.sendPush(key, customer.fcmToken, vars, { orderRef: params.orderRef }),
        this.sendInApp(key, customer.id, vars, 'order', meta),
        customer.phone    && this.sendWhatsapp(key, customer.phone, vars),
      ]);
    }, this.logger, key);
  }

  /**
   * Fire when order is completed and escrow released.
   */
  async notifyOrderCompleted(params: {
    customerId:  string;
    vendorId:    string | null;
    repId:       string | null;
    orderRef:    string;
    vendorShareWP: number;
    repShareWP:    number;
    nairaEquivalent: number;
  }) {
    const [customer, vendorInfo, repInfo] = await Promise.all([
      this.getUser(params.customerId),
      params.vendorId ? this.getVendorUser(params.vendorId) : Promise.resolve({ vendor: null, user: null }),
      params.repId    ? this.getRepUser(params.repId)       : Promise.resolve({ rep:    null, user: null }),
    ]);

    const meta = { orderRef: params.orderRef };

    fire(async () => {
      // Customer
      if (customer) {
        const cv: Record<string, string | number> = { customerName: customer.fullName, orderRef: params.orderRef };
        await Promise.all([
          customer.email    && this.sendEmail('order.completed.customer', customer.email, cv),
          customer.fcmToken && this.sendPush('order.completed.customer', customer.fcmToken, cv, { orderRef: params.orderRef }),
          this.sendInApp('order.completed.customer', customer.id, cv, 'order', meta),
        ]);
      }

      // Vendor earning credited
      if (vendorInfo.vendor && params.vendorShareWP > 0) {
        const vv: Record<string, string | number> = {
          vendorName:       vendorInfo.vendor.businessName,
          orderRef:         params.orderRef,
          earnedWP:         params.vendorShareWP,
          nairaEquivalent:  Math.round(params.nairaEquivalent),
        };
        await Promise.all([
          vendorInfo.user?.email    && this.sendEmail('order.earning_credited.vendor', vendorInfo.user.email, vv),
          vendorInfo.user?.fcmToken && this.sendPush('order.earning_credited.vendor', vendorInfo.user.fcmToken, vv, { orderRef: params.orderRef }),
          vendorInfo.vendor && this.sendInApp('order.earning_credited.vendor', vendorInfo.vendor.userId, vv, 'order', meta),
        ]);
      }

      // Rep earning credited
      if (repInfo.rep && params.repShareWP > 0) {
        const rv: Record<string, string | number> = {
          repName:  repInfo.user?.fullName ?? '',
          orderRef: params.orderRef,
          earnedWP: params.repShareWP,
        };
        await Promise.all([
          repInfo.user?.fcmToken && this.sendPush('order.earning_credited.rep', repInfo.user.fcmToken, rv, { orderRef: params.orderRef }),
          repInfo.rep && this.sendInApp('order.earning_credited.rep', repInfo.rep.userId, rv, 'order', meta),
        ]);
      }
    }, this.logger, 'order.completed');
  }

  /**
   * Fire when an order is cancelled (refund already processed).
   */
  async notifyOrderCancelled(params: {
    customerId: string;
    orderRef:   string;
    totalWP:    number;
  }) {
    const user = await this.getUser(params.customerId);
    if (!user) return;

    const vars: Record<string, string | number> = {
      customerName: user.fullName,
      orderRef:     params.orderRef,
      totalWP:      params.totalWP,
    };
    const key  = 'order.cancelled.customer';
    const meta = { orderRef: params.orderRef };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail(key, user.email, vars),
        user.phone    && this.sendSms(key, user.phone, vars),
        user.fcmToken && this.sendPush(key, user.fcmToken, vars, { orderRef: params.orderRef }),
        this.sendInApp(key, user.id, vars, 'order', meta),
      ]);
    }, this.logger, key);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSIGNMENT EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fire for each rep in a broadcast batch.
   */
  async notifyAssignmentBroadcastRep(params: {
    repId:            string;
    orderRef:         string;
    pickupAddress:    string;
    scheduledPickupAt: string;
    orderId:          string;
  }) {
    const { rep, user } = await this.getRepUser(params.repId);
    if (!user) return;

    const vars: Record<string, string | number> = {
      repName:          user.fullName,
      orderRef:         params.orderRef,
      pickupAddress:    params.pickupAddress,
      scheduledPickupAt: params.scheduledPickupAt,
    };
    const key  = 'assignment.broadcast.rep';
    const meta = { orderRef: params.orderRef, orderId: params.orderId };

    fire(async () => {
      await Promise.all([
        user.phone    && this.sendSms(key, user.phone, vars),
        user.fcmToken && this.sendPush(key, user.fcmToken, vars, { orderRef: params.orderRef, orderId: params.orderId }),
        rep && this.sendInApp(key, rep.userId, vars, 'assignment', meta),
        user.phone && this.sendWhatsapp(key, user.phone, vars),
      ]);
    }, this.logger, key);
  }

  /**
   * Fire when a rep accepts an assignment.
   */
  async notifyAssignmentConfirmedRep(params: {
    repId:         string;
    orderRef:      string;
    pickupAddress: string;
    customerName:  string;
    orderId:       string;
  }) {
    const { rep, user } = await this.getRepUser(params.repId);
    if (!user) return;

    const vars: Record<string, string | number> = {
      repName:       user.fullName,
      orderRef:      params.orderRef,
      pickupAddress: params.pickupAddress,
      customerName:  params.customerName,
    };
    const key  = 'assignment.confirmed.rep';
    const meta = { orderRef: params.orderRef, orderId: params.orderId };

    fire(async () => {
      await Promise.all([
        user.fcmToken && this.sendPush(key, user.fcmToken, vars, { orderRef: params.orderRef }),
        rep && this.sendInApp(key, rep.userId, vars, 'assignment', meta),
      ]);
    }, this.logger, key);
  }

  /**
   * Fire for each vendor in a broadcast batch.
   */
  async notifyAssignmentBroadcastVendor(params: {
    vendorId:         string;
    orderRef:         string;
    scheduledPickupAt: string;
    orderId:          string;
  }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!user || !vendor) return;

    const vars: Record<string, string | number> = {
      vendorName:       vendor.businessName,
      orderRef:         params.orderRef,
      scheduledPickupAt: params.scheduledPickupAt,
    };
    const key  = 'assignment.broadcast.vendor';
    const meta = { orderRef: params.orderRef, orderId: params.orderId };

    fire(async () => {
      await Promise.all([
        user.phone    && this.sendSms(key, user.phone, vars),
        user.fcmToken && this.sendPush(key, user.fcmToken, vars, { orderRef: params.orderRef, orderId: params.orderId }),
        this.sendInApp(key, vendor.userId, vars, 'assignment', meta),
        user.phone && this.sendWhatsapp(key, user.phone, vars),
      ]);
    }, this.logger, key);
  }

  /**
   * Escalation: no reps available → notify admin.
   */
  async notifyNoRepsAvailableAdmin(params: { orderRef: string; areaName: string; orderId: string }) {
    const adminEmail = this.adminEmail();
    const vars: Record<string, string | number> = { orderRef: params.orderRef, areaName: params.areaName };

    fire(async () => {
      await Promise.all([
        adminEmail && this.sendEmail('assignment.no_reps.admin', adminEmail, vars),
      ]);
    }, this.logger, 'assignment.no_reps.admin');
  }

  /** Fire when no vendors can be found for an order in any area — admin must assign manually. */
  async notifyNoVendorsAvailableAdmin(params: { orderRef: string; areaName: string; orderId: string }) {
    const adminEmail = this.adminEmail();
    const vars: Record<string, string | number> = { orderRef: params.orderRef, areaName: params.areaName };

    fire(async () => {
      await Promise.all([
        adminEmail && this.sendEmail('assignment.no_vendors.admin', adminEmail, vars),
      ]);
    }, this.logger, 'assignment.no_vendors.admin');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REP EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fire when a rep's rating drops below the platform threshold.
   */
  async notifyRepFlaggedForReview(params: { repId: string; rating: number }) {
    const { rep, user } = await this.getRepUser(params.repId);
    if (!user) return;

    const vars: Record<string, string | number> = {
      repName: user.fullName,
      rating:  params.rating.toFixed(1),
    };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('rep.flagged_for_review', user.email, vars),
        user.fcmToken && this.sendPush('rep.flagged_for_review', user.fcmToken, vars),
        rep && this.sendInApp('rep.flagged_for_review', rep.userId, vars, 'account'),
      ]);
    }, this.logger, 'rep.flagged_for_review');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VENDOR EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fire when admin verifies a vendor account.
   */
  /**
   * Fire when a vendor finishes signup (OTP verified). Deliberately separate from
   * the customer welcome: a new vendor is PENDING_REVIEW and must not be told they
   * can take orders. Looked up by userId because at signup we only have the user.
   */
  async notifyVendorApplicationReceived(params: { userId: string; fallbackName?: string }) {
    const vendor = await this.vendorRepo.findOne({ where: { userId: params.userId } });
    const user = await this.userRepo.findOne({ where: { id: params.userId } });
    if (!user) return;

    const vars: Record<string, string | number> = {
      vendorName: vendor?.businessName || params.fallbackName || user.fullName,
    };

    fire(async () => {
      await Promise.all([
        user.email && this.sendEmail('vendor.application_received', user.email, vars),
        user.phone && this.sendSms('vendor.application_received', user.phone, vars),
        user.fcmToken && this.sendPush('vendor.application_received', user.fcmToken, vars),
        this.sendInApp('vendor.application_received', user.id, vars, 'account'),
      ]);
    }, this.logger, 'vendor.application_received');
  }

  /** Fire when an admin REJECTS a vendor's verification. */
  async notifyVendorRejected(params: { vendorId: string; reason?: string | null }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const vars: Record<string, string | number> = {
      vendorName: vendor.businessName,
      reason: params.reason || 'Your application did not meet our onboarding requirements.',
    };

    fire(async () => {
      await Promise.all([
        user.email && this.sendEmail('vendor.account_rejected', user.email, vars),
        user.phone && this.sendSms('vendor.account_rejected', user.phone, vars),
        user.fcmToken && this.sendPush('vendor.account_rejected', user.fcmToken, vars),
        this.sendInApp('vendor.account_rejected', vendor.userId, vars, 'account'),
      ]);
    }, this.logger, 'vendor.account_rejected');
  }

  /** Fire when a vendor account is suspended / deactivated. */
  async notifyVendorSuspended(params: { vendorId: string; reason?: string | null }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const vars: Record<string, string | number> = {
      vendorName: vendor.businessName,
      reason: params.reason || 'Please contact support for details.',
    };

    fire(async () => {
      await Promise.all([
        user.email && this.sendEmail('vendor.account_suspended', user.email, vars),
        user.phone && this.sendSms('vendor.account_suspended', user.phone, vars),
        user.fcmToken && this.sendPush('vendor.account_suspended', user.fcmToken, vars),
        this.sendInApp('vendor.account_suspended', vendor.userId, vars, 'account'),
      ]);
    }, this.logger, 'vendor.account_suspended');
  }

  async notifyVendorVerified(params: { vendorId: string }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const vars: Record<string, string | number> = { vendorName: vendor.businessName };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('vendor.account_verified', user.email, vars),
        user.phone    && this.sendSms('vendor.account_verified', user.phone, vars),
        user.fcmToken && this.sendPush('vendor.account_verified', user.fcmToken, vars),
        this.sendInApp('vendor.account_verified', vendor.userId, vars, 'account'),
      ]);
    }, this.logger, 'vendor.account_verified');
  }

  /**
   * Fire when admin submits vendor for verification (notify admin team).
   */
  async notifyVendorPendingVerificationAdmin(params: { vendorId: string; vendorName: string }) {
    const adminEmail = this.adminEmail();
    const vars: Record<string, string | number> = {
      vendorName: params.vendorName,
      vendorId:   params.vendorId,
    };

    fire(async () => {
      if (adminEmail) {
        await this.sendEmail('vendor.pending_verification.admin', adminEmail, vars);
      }
    }, this.logger, 'vendor.pending_verification.admin');
  }

  /**
   * Fire when admin approves a vendor's pricing proposal.
   */
  async notifyPricingApproved(params: { vendorId: string }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const vars: Record<string, string | number> = { vendorName: vendor.businessName };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('pricing.approved.vendor', user.email, vars),
        user.fcmToken && this.sendPush('pricing.approved.vendor', user.fcmToken, vars),
        this.sendInApp('pricing.approved.vendor', vendor.userId, vars, 'account'),
      ]);
    }, this.logger, 'pricing.approved.vendor');
  }

  /**
   * Fire ONCE when an admin finalizes a pricing review — summarises which lines
   * were approved and which were rejected (with reasons) in a single message.
   */
  async notifyPricingReviewed(params: { vendorId: string; items: GarmentPriceItem[] }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const label = (i: GarmentPriceItem) =>
      (i.garmentType ?? '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim() || 'Item';
    const naira = (n: number) => `₦${Number(n).toLocaleString()}`;

    const approved = params.items.filter((i) => i.status === 'approved');
    const rejected = params.items.filter((i) => i.status === 'rejected');

    const approvedRowsHtml = approved
      .map((i) => `<div class="info-row"><span>${label(i)}</span><span>${naira(i.priceNaira)}</span></div>`)
      .join('') || '<p style="color:#7c8b83;font-size:14px;">None this time.</p>';
    const rejectedRowsHtml = rejected
      .map((i) => `<div class="info-row"><span>${label(i)} — <em>${i.rejectionReason ?? 'not approved'}</em></span><span>${naira(i.priceNaira)}</span></div>`)
      .join('') || '<p style="color:#7c8b83;font-size:14px;">None — everything was approved. 🎉</p>';

    const approvedText = approved.length
      ? approved.map((i) => `${label(i)}: ${naira(i.priceNaira)}`).join('; ')
      : 'None this time.';
    const rejectedText = rejected.length
      ? rejected.map((i) => `${label(i)} (${i.rejectionReason ?? 'not approved'})`).join('; ')
      : 'None — everything was approved.';

    const vars: Record<string, string | number> = {
      vendorName:    vendor.businessName,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      approvedRowsHtml,
      rejectedRowsHtml,
      approvedText,
      rejectedText,
    };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('pricing.reviewed.vendor', user.email, vars),
        user.fcmToken && this.sendPush('pricing.reviewed.vendor', user.fcmToken, vars),
        this.sendInApp('pricing.reviewed.vendor', vendor.userId, vars, 'account'),
      ]);
    }, this.logger, 'pricing.reviewed.vendor');
  }

  /**
   * Fire when the rep logs the garment count for an order — sends the assigned
   * vendor the FULL garment list, their earning for the order in ₦, and flags
   * any items they have no price for (those were paid at the cross-vendor
   * average; the note prompts them to set their own price).
   */
  async notifyVendorGarmentsLogged(params: {
    vendorId:      string;
    orderRef:      string;
    garmentLog:    Record<string, number>;
    unpricedTypes: string[];
    earningNaira:  number;
  }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const pretty = (s: string) =>
      s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    const unpricedSet = new Set(params.unpricedTypes);
    const entries = Object.entries(params.garmentLog).filter(([, count]) => Number(count) > 0);
    const itemCount = entries.reduce((sum, [, count]) => sum + Number(count), 0);

    const itemsRowsHtml = entries
      .map(([type, count]) => {
        const flag = unpricedSet.has(type)
          ? ' <em style="color:#c62828;font-style:normal;font-size:12px;">· no price set — market average used</em>'
          : '';
        return `<div class="info-row"><span>${pretty(type)}${flag}</span><span>× ${count}</span></div>`;
      })
      .join('');
    const itemsText = entries.map(([type, count]) => `${pretty(type)} × ${count}`).join(', ');

    const unpricedText = params.unpricedTypes.map(pretty).join(', ');
    const unpricedNote = params.unpricedTypes.length
      ? ` Note: you have no price set for ${unpricedText} — the market average was used for your earnings on ${params.unpricedTypes.length > 1 ? 'those items' : 'that item'}. Set your own price from your dashboard.`
      : '';
    const unpricedNoteHtml = params.unpricedTypes.length
      ? `<p style="color:#c62828;">You have <strong>no price set</strong> for: <strong>${unpricedText}</strong>. Your earnings on ${params.unpricedTypes.length > 1 ? 'these items' : 'this item'} used the <strong>average price of other vendors</strong> — set your own price from your dashboard so future orders pay <em>your</em> rate.</p>`
      : '';

    const vars: Record<string, string | number> = {
      vendorName:       vendor.businessName ?? 'there',
      orderRef:         params.orderRef,
      itemsRowsHtml,
      itemsText,
      itemCount,
      earningNaira:     Math.round(params.earningNaira).toLocaleString(),
      unpricedCount:    params.unpricedTypes.length,
      unpricedNote,
      unpricedNoteHtml,
    };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('order.garments_logged.vendor', user.email, vars),
        user.fcmToken && this.sendPush('order.garments_logged.vendor', user.fcmToken, vars, { orderRef: params.orderRef }),
        this.sendInApp('order.garments_logged.vendor', vendor.userId, vars, 'order', { orderRef: params.orderRef }),
      ]);
    }, this.logger, 'order.garments_logged.vendor');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOG (maker-checker review)
  // ═══════════════════════════════════════════════════════════════════════════

  /** All active users holding the admin role — recipients for review requests. */
  private async adminUsers(): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .where(`string_to_array(user.roles, ',') && ARRAY['admin']::text[]`)
      .andWhere(`user.status = 'active'`)
      .getMany();
  }

  /** Fire when a post is submitted for review — nudge every other admin. */
  async notifyBlogSubmitted(params: {
    postId: string;
    title: string;
    authorName: string;
    excludeUserId: string;
  }) {
    const vars: Record<string, string | number> = {
      postTitle: params.title,
      authorName: params.authorName,
      postId: params.postId,
    };
    const meta = { postId: params.postId };

    fire(async () => {
      const admins = (await this.adminUsers()).filter((u) => u.id !== params.excludeUserId);
      const adminEmail = this.adminEmail();
      await Promise.all([
        adminEmail && this.sendEmail('blog.submitted.admin', adminEmail, vars),
        ...admins.map((a) => this.sendInApp('blog.submitted.admin', a.id, vars, 'general', meta)),
      ]);
    }, this.logger, 'blog.submitted.admin');
  }

  /** Fire when a reviewer approves or requests changes — tell the author. */
  async notifyBlogReviewDecision(params: {
    postId: string;
    title: string;
    slug: string;
    authorUserId: string;
    approved: boolean;
    note: string | null;
  }) {
    const author = await this.getUser(params.authorUserId);
    if (!author) return;

    const key = params.approved ? 'blog.approved.author' : 'blog.changes_requested.author';
    const vars: Record<string, string | number> = {
      authorName: author.fullName,
      postTitle: params.title,
      postSlug: params.slug,
      reviewNote: params.note ?? '',
    };
    const meta = { postId: params.postId };

    fire(async () => {
      await Promise.all([
        author.email && this.sendEmail(key, author.email, vars),
        this.sendInApp(key, author.id, vars, 'general', meta),
      ]);
    }, this.logger, key);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYOUT EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fire when a vendor requests a payout (notify admin).
   */
  async notifyNewPayoutRequest(params: {
    vendorId:   string;
    vendorName: string;
    amountWP:   number;
    nairaAmount: number;
    payoutId:   string;
  }) {
    const adminEmail = this.adminEmail();
    const vars: Record<string, string | number> = {
      vendorName:  params.vendorName,
      amountWP:    params.amountWP,
      nairaAmount: Math.round(params.nairaAmount),
      payoutId:    params.payoutId,
    };

    fire(async () => {
      if (adminEmail) {
        await this.sendEmail('payout.new_request.admin', adminEmail, vars);
      }
    }, this.logger, 'payout.new_request.admin');
  }

  /**
   * Fire when admin approves a payout (bank transfer initiated).
   */
  async notifyPayoutApproved(params: {
    vendorId:      string;
    nairaAmount:   number;
    amountWP:      number;
    accountName:   string;
    accountNumber: string;
    bankCode:      string;
    payoutId:      string;
  }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const vars: Record<string, string | number> = {
      vendorName:    vendor.businessName,
      nairaAmount:   Math.round(params.nairaAmount),
      amountWP:      params.amountWP,
      accountName:   params.accountName,
      accountNumber: params.accountNumber,
      bankCode:      params.bankCode,
      payoutId:      params.payoutId,
    };
    const meta = { payoutId: params.payoutId };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('payout.approved.vendor', user.email, vars),
        user.phone    && this.sendSms('payout.approved.vendor', user.phone, vars),
        user.fcmToken && this.sendPush('payout.approved.vendor', user.fcmToken, vars, { payoutId: params.payoutId }),
        this.sendInApp('payout.approved.vendor', vendor.userId, vars, 'payout', meta),
        user.phone    && this.sendWhatsapp('payout.approved.vendor', user.phone, vars),
      ]);
    }, this.logger, 'payout.approved.vendor');
  }

  /**
   * Fire when a payout transfer fails.
   */
  async notifyPayoutFailed(params: {
    vendorId:      string;
    nairaAmount:   number;
    amountWP:      number;
    failureReason: string;
    payoutId:      string;
  }) {
    const { vendor, user } = await this.getVendorUser(params.vendorId);
    if (!vendor || !user) return;

    const vars: Record<string, string | number> = {
      vendorName:    vendor.businessName,
      nairaAmount:   Math.round(params.nairaAmount),
      amountWP:      params.amountWP,
      failureReason: params.failureReason,
      payoutId:      params.payoutId,
    };
    const meta = { payoutId: params.payoutId };

    fire(async () => {
      await Promise.all([
        user.email    && this.sendEmail('payout.failed.vendor', user.email, vars),
        user.phone    && this.sendSms('payout.failed.vendor', user.phone, vars),
        user.fcmToken && this.sendPush('payout.failed.vendor', user.fcmToken, vars, { payoutId: params.payoutId }),
        this.sendInApp('payout.failed.vendor', vendor.userId, vars, 'payout', meta),
      ]);
    }, this.logger, 'payout.failed.vendor');
  }
}
