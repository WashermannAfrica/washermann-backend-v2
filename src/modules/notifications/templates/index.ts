// ─── Washermann brand palette ─────────────────────────────────────────────────
// Sampled from the Washermann landing page / mobile app design.
const BRAND = {
  green:     '#00281c', // deep green — header background, emphasis text
  mint:      '#3bf4be', // bright mint — wordmark accent on the dark header
  button:    '#13c490', // mint-green — buttons & links (reads on white)
  mintSoft:  '#e8faf2', // mint tint — OTP / highlight box background
  bodyBg:    '#eef2f0', // soft green-gray page background
  card:      '#ffffff',
  text:      '#2c3a33', // body text
  muted:     '#7c8b83', // secondary text
  hairline:  '#e7ece9', // dividers
  warnBg:    '#fff8e1',
  warnBar:   '#f59e0b',
  warnText:  '#7a6a3a',
};

// Publicly-hosted white-wordmark PNG for the email header. Email clients can't
// render local files or SVG, so this must be an absolute URL. Unset → text wordmark.
const emailLogoUrl = () => process.env.EMAIL_LOGO_URL || '';

const brandHeader = () => {
  const logo = emailLogoUrl();
  const inner = logo
    ? `<img src="${logo}" alt="Washermann" width="170" style="width:170px;max-width:62%;height:auto;display:block;margin:0 auto;border:0;"/>`
    : `<h1>Washer<span>mann</span></h1><div class="tagline">Laundry, handled</div>`;
  return `<div class="header">${inner}</div>`;
};

// ─── Reusable building blocks ─────────────────────────────────────────────────
const ctaButton = (label: string, link: string) => `
    <div style="text-align:center;margin:28px 0;">
      <a href="${link}"
         style="display:inline-block;background:${BRAND.button};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;mso-padding-alt:0;line-height:1.5;">
        ${label}
      </a>
    </div>`;

const fallbackLink = (link: string) => `
    <div style="height:1px;background:${BRAND.hairline};margin:24px 0;"></div>
    <p style="font-size:13px;color:${BRAND.muted};">
      Button not working? Copy this link into your browser:<br/>
      <a href="${link}" style="color:${BRAND.button};word-break:break-all;">${link}</a>
    </p>`;

const expiryNote = (text: string) => `
    <div style="background:${BRAND.warnBg};border-left:3px solid ${BRAND.warnBar};padding:12px 16px;border-radius:0 6px 6px 0;font-size:13px;color:${BRAND.warnText};margin-top:16px;">
      ${text}
    </div>`;

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
    body { background: ${BRAND.bodyBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${BRAND.text}; }
    .wrapper { max-width: 560px; margin: 40px auto; background: ${BRAND.card}; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,40,28,0.08); }
    .header { background: ${BRAND.green}; padding: 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 24px; font-weight: 800; letter-spacing: -0.4px; }
    .header span { color: ${BRAND.mint}; }
    .header .tagline { color: rgba(255,255,255,0.55); font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 8px; }
    .body { padding: 36px 32px; }
    .body p { font-size: 15px; line-height: 1.7; color: ${BRAND.text}; margin-bottom: 16px; }
    .body strong { color: ${BRAND.green}; }
    .otp-box { background: ${BRAND.mintSoft}; border: 2px dashed ${BRAND.button}; border-radius: 12px; padding: 22px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 10px; color: ${BRAND.green}; }
    .otp-expiry { font-size: 13px; color: ${BRAND.muted}; margin-top: 8px; }
    .btn { display: inline-block; background: ${BRAND.button}; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; margin: 8px 0; }
    .divider { height: 1px; background: ${BRAND.hairline}; margin: 24px 0; }
    .footer { background: #f6f9f7; padding: 22px 32px; text-align: center; border-top: 1px solid ${BRAND.hairline}; }
    .footer p { font-size: 12px; color: ${BRAND.muted}; line-height: 1.6; }
    .warning { background: ${BRAND.warnBg}; border-left: 3px solid ${BRAND.warnBar}; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: ${BRAND.warnText}; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    ${brandHeader()}
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
    <ul style="margin: 0 0 16px 20px; color: ${BRAND.text}; font-size: 15px; line-height: 2;">
      <li>Discover verified laundry vendors near you</li>
      <li>Place and track orders in real time</li>
      <li>Use company benefits or your personal wallet</li>
    </ul>
    <div class="divider"></div>
    <p style="font-size: 13px; color: ${BRAND.muted};">If you didn't create this account, please ignore this email or contact support.</p>
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

// ─── Invite: Company Account ─────────────────────────────────────────────────
export const companyInviteTemplate = (data: {
  companyName: string;
  inviteLink: string;
}) => ({
  subject: `Activate your ${data.companyName} account on Washermann`,
  html: baseLayout(`
    <p>Hello,</p>
    <p>A <strong>Washermann</strong> company account has been created for <strong>${data.companyName}</strong>.</p>
    <p>Click the button below to activate your account and complete your company profile:</p>
    ${ctaButton('Activate Company Account', data.inviteLink)}
    ${fallbackLink(data.inviteLink)}
    ${expiryNote('This link expires in <strong>48 hours</strong> and can only be used once. If you did not request this, please ignore this email.')}
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
    ${ctaButton('Set Up My Account', data.inviteLink)}
    ${fallbackLink(data.inviteLink)}
    ${expiryNote('This invite link expires in <strong>7 days</strong> and can only be used once.')}
  `),
});

// ─── Invite: Vendor Account ──────────────────────────────────────────────────
export const vendorInviteTemplate = (data: {
  fullName: string;
  businessName: string;
  inviteLink: string;
}) => ({
  subject: `You've been added as a vendor on Washermann`,
  html: baseLayout(`
    <p>Hi <strong>${data.fullName}</strong>,</p>
    <p>A vendor account has been created for <strong>${data.businessName}</strong> on the Washermann platform.</p>
    <p>Click the button below to set your password and activate your account:</p>
    ${ctaButton('Activate My Vendor Account', data.inviteLink)}
    ${fallbackLink(data.inviteLink)}
    ${expiryNote('This invite link expires in <strong>7 days</strong> and can only be used once. If you did not expect this invitation, please ignore this email.')}
  `),
});

// ─── Invite: Platform Staff ───────────────────────────────────────────────────
export const staffInviteTemplate = (data: {
  fullName: string;
  role: string;
  inviteLink: string;
}) => ({
  subject: `You've been invited to join the Washermann team`,
  html: baseLayout(`
    <p>Hi <strong>${data.fullName}</strong>,</p>
    <p>You have been invited to join the <strong>Washermann</strong> platform team as a <strong>${data.role}</strong>.</p>
    <p>Click the button below to set your password and activate your account:</p>
    ${ctaButton('Activate My Account', data.inviteLink)}
    ${fallbackLink(data.inviteLink)}
    ${expiryNote('This invite link expires in <strong>7 days</strong> and can only be used once. If you did not expect this invitation, please ignore this email.')}
  `),
});
