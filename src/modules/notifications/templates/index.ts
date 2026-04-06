// ─── Base layout ─────────────────────────────────────────────────────────────
const baseLayout = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Washermann</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .header { background: #1a1a2e; padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header span { color: #4fc3f7; }
    .body { padding: 36px 32px; }
    .body p { font-size: 15px; line-height: 1.7; color: #444; margin-bottom: 16px; }
    .otp-box { background: #f0f7ff; border: 2px dashed #4fc3f7; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #1a1a2e; }
    .otp-expiry { font-size: 13px; color: #888; margin-top: 8px; }
    .btn { display: inline-block; background: #1a1a2e; color: #fff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
    .divider { height: 1px; background: #f0f0f0; margin: 24px 0; }
    .footer { background: #fafafa; padding: 20px 32px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { font-size: 12px; color: #aaa; line-height: 1.6; }
    .warning { background: #fff8e1; border-left: 3px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #666; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Washer<span>mann</span></h1>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Washermann. All rights reserved.<br/>
      You are receiving this email because you have an account on the Washermann platform.</p>
    </div>
  </div>
</body>
</html>`;

// ─── Welcome Email ────────────────────────────────────────────────────────────
export const welcomeTemplate = (data: { fullName: string }) => ({
  subject: 'Welcome to Washermann 👕',
  html: baseLayout(`
    <p>Hi <strong>${data.fullName}</strong>,</p>
    <p>Welcome to <strong>Washermann</strong> — your laundry, handled professionally.</p>
    <p>You can now:</p>
    <ul style="margin: 0 0 16px 20px; color: #444; font-size: 15px; line-height: 2;">
      <li>Discover verified laundry vendors near you</li>
      <li>Place and track orders in real time</li>
      <li>Use company benefits or your personal wallet</li>
    </ul>
    <div class="divider"></div>
    <p style="font-size: 13px; color: #888;">If you didn't create this account, please ignore this email or contact support.</p>
  `),
});

// ─── OTP: Email Verification ──────────────────────────────────────────────────
export const emailVerificationOtpTemplate = (data: {
  fullName: string;
  otp: string;
  expiresInMinutes: number;
}) => ({
  subject: `${data.otp} — Your Washermann verification code`,
  html: baseLayout(`
    <p>Hi <strong>${data.fullName}</strong>,</p>
    <p>Use the code below to verify your email address.</p>
    <div class="otp-box">
      <div class="otp-code">${data.otp}</div>
      <div class="otp-expiry">Expires in ${data.expiresInMinutes} minutes</div>
    </div>
    <div class="warning">
      🔒 Never share this code with anyone. Washermann will never ask for your OTP.
    </div>
  `),
});

// ─── OTP: Password Reset ──────────────────────────────────────────────────────
export const passwordResetOtpTemplate = (data: {
  fullName: string;
  otp: string;
  expiresInMinutes: number;
}) => ({
  subject: `${data.otp} — Reset your Washermann password`,
  html: baseLayout(`
    <p>Hi <strong>${data.fullName}</strong>,</p>
    <p>We received a request to reset your password. Use the code below:</p>
    <div class="otp-box">
      <div class="otp-code">${data.otp}</div>
      <div class="otp-expiry">Expires in ${data.expiresInMinutes} minutes</div>
    </div>
    <p>If you did not request a password reset, you can safely ignore this email — your account is secure.</p>
    <div class="warning">
      🔒 Never share this code with anyone. Washermann will never ask for your OTP.
    </div>
  `),
});

// ─── Invite: Company Employee ─────────────────────────────────────────────────
export const employeeInviteTemplate = (data: {
  fullName: string;
  companyName: string;
  inviteLink: string;
}) => ({
  subject: `${data.companyName} has invited you to Washermann`,
  html: baseLayout(`
    <p>Hi <strong>${data.fullName}</strong>,</p>
    <p><strong>${data.companyName}</strong> has added you to their Washermann account. You now have access to laundry benefits provided by your company.</p>
    <p>Click the button below to set up your account:</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${data.inviteLink}" class="btn">Set Up My Account</a>
    </div>
    <div class="divider"></div>
    <p style="font-size: 13px; color: #888;">
      Or copy this link into your browser:<br/>
      <span style="color: #4fc3f7; word-break: break-all;">${data.inviteLink}</span>
    </p>
    <div class="warning">
      This invite link expires in 7 days.
    </div>
  `),
});
