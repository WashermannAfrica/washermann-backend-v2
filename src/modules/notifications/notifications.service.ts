import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import {
  welcomeTemplate,
  emailVerificationOtpTemplate,
  passwordResetOtpTemplate,
  employeeInviteTemplate,
} from './templates';

const OTP_EXPIRY_MINUTES = 10;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  // ─── Welcome ─────────────────────────────────────────────────────────────────

  async sendWelcome(data: { fullName: string; email?: string; phone?: string }) {
    if (data.email) {
      const template = welcomeTemplate({ fullName: data.fullName });
      await this.emailService.send({
        to: data.email,
        subject: template.subject,
        html: template.html,
      });
    }
    // No SMS for welcome — keep SMS reserved for critical OTPs
  }

  // ─── Email Verification OTP ───────────────────────────────────────────────────

  async sendEmailVerificationOtp(data: {
    fullName: string;
    email: string;
    otp: string;
  }) {
    const template = emailVerificationOtpTemplate({
      fullName: data.fullName,
      otp: data.otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });

    await this.emailService.send({
      to: data.email,
      subject: template.subject,
      html: template.html,
    });
  }

  // ─── Phone Verification OTP (SMS) ────────────────────────────────────────────

  async sendPhoneVerificationOtp(data: { phone: string; otp: string }) {
    await this.smsService.send({
      to: data.phone,
      message: `Your Washermann verification code is: ${data.otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`,
    });
  }

  // ─── Password Reset OTP ───────────────────────────────────────────────────────

  async sendPasswordResetOtp(data: {
    fullName: string;
    email?: string;
    phone?: string;
    otp: string;
  }) {
    const sent: string[] = [];

    if (data.email) {
      const template = passwordResetOtpTemplate({
        fullName: data.fullName,
        otp: data.otp,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
      await this.emailService.send({
        to: data.email,
        subject: template.subject,
        html: template.html,
      });
      sent.push('email');
    }

    if (data.phone) {
      await this.smsService.send({
        to: data.phone,
        message: `Your Washermann password reset code is: ${data.otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`,
      });
      sent.push('SMS');
    }

    this.logger.log(
      `Password reset OTP sent via: ${sent.join(', ')} for ${data.email || data.phone}`,
    );
  }

  // ─── Company Activation Invite ────────────────────────────────────────────────

  async sendCompanyInvite(data: {
    companyName: string;
    ownerEmail: string;
    inviteToken: string;
    deepLinkBase: string;
  }) {
    const activationLink = `${data.deepLinkBase}/company/activate?token=${data.inviteToken}`;

    await this.emailService.send({
      to: data.ownerEmail,
      subject: `Activate your ${data.companyName} account on Washermann`,
      html: `
        <p>Hello,</p>
        <p>A Washermann account has been created for <strong>${data.companyName}</strong>.</p>
        <p>Click the link below to activate your company account and set up your profile:</p>
        <p><a href="${activationLink}" style="padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;">
          Activate Company Account
        </a></p>
        <p>This link expires in <strong>48 hours</strong> and can only be used once.</p>
        <p>If you did not request this, please ignore this email or contact support.</p>
        <p>— The Washermann Team</p>
      `,
    });

    this.logger.log(
      `Company activation invite sent to ${data.ownerEmail} for "${data.companyName}"`,
    );
  }

  // ─── Employee Invite ──────────────────────────────────────────────────────────

  async sendEmployeeInvite(data: {
    fullName: string;
    email?: string;
    phone?: string;
    companyName: string;
    inviteToken: string;
    deepLinkBase: string;
  }) {
    const inviteLink = `${data.deepLinkBase}/invite?token=${data.inviteToken}`;

    if (data.email) {
      const template = employeeInviteTemplate({
        fullName: data.fullName,
        companyName: data.companyName,
        inviteLink,
      });
      await this.emailService.send({
        to: data.email,
        subject: template.subject,
        html: template.html,
      });
    }

    if (data.phone) {
      await this.smsService.send({
        to: data.phone,
        message: `${data.companyName} has added you to Washermann. Set up your account: ${inviteLink}`,
      });
    }
  }
}
