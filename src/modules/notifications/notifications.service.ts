import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../../database/entities/user.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { PushService } from './push/push.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { InAppService } from './in-app/in-app.service';
import { TemplateService } from './template/template.service';
import { InAppNotificationType } from '../../database/entities/in-app-notification.entity';
import {
  welcomeTemplate,
  emailVerificationOtpTemplate,
  passwordResetOtpTemplate,
  companyInviteTemplate,
  employeeInviteTemplate,
  staffInviteTemplate,
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
    const meta = { orderRef: params.orderRef, orderId: params.orderId };

    fire(async () => {
      await Promise.all([
        adminEmail && this.sendEmail('assignment.no_reps.admin', adminEmail, vars),
        // In-app for all admin users would require a query — push to a fixed admin account or skip
        // For now, log only (admin will see it in the dashboard)
      ]);
    }, this.logger, 'assignment.no_reps.admin');
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
