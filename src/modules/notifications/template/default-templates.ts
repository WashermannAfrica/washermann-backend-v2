import { NotificationChannel, EmailStyle } from '../../../database/entities/notification-template.entity';

// Washermann brand palette — see also notifications/templates/index.ts
const DEFAULT_EMAIL_STYLE: EmailStyle = {
  primaryColor:  '#00281c', // deep green — header background, emphasis
  accentColor:   '#13c490', // mint-green — buttons, links, highlights
  bodyBgColor:   '#eef2f0', // soft green-gray page background
  cardBgColor:   '#ffffff',
  textColor:     '#2c3a33',
  logoUrl:       null,
  logoAlt:       'Washermann',
  footerText:    '© {{year}} Washermann. All rights reserved.',
  fontFamily:    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

/**
 * Generates the full HTML email using stored style + content block.
 * This template is itself a Handlebars template — the final render
 * replaces {{variables}} with real data at send time.
 */
export const buildEmailHtml = (contentBlock: string, style: EmailStyle = DEFAULT_EMAIL_STYLE) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Washermann</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:${style.bodyBgColor};font-family:${style.fontFamily};color:${style.textColor};}
    a{color:${style.accentColor};}
    .wrapper{max-width:560px;margin:40px auto;background:${style.cardBgColor};border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,40,28,.08);}
    .header{background:${style.primaryColor};padding:32px;text-align:center;}
    .header-logo{width:170px;max-width:62%;height:auto;display:block;margin:0 auto;border:0;}
    .header h1{color:#fff;font-size:24px;font-weight:800;letter-spacing:-.4px;}
    .header h1 span{color:#3bf4be;}
    .header .tagline{color:rgba(255,255,255,.55);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin-top:8px;}
    .body{padding:36px 32px;}
    .body p{font-size:15px;line-height:1.7;color:${style.textColor};margin-bottom:16px;}
    .body strong{color:${style.primaryColor};}
    .highlight-box{background:#e8faf2;border:2px dashed ${style.accentColor};border-radius:12px;padding:22px;text-align:center;margin:24px 0;}
    .highlight-value{font-size:28px;font-weight:800;color:${style.primaryColor};}
    .highlight-label{font-size:13px;color:#7c8b83;margin-top:6px;}
    .btn{display:inline-block;background:${style.accentColor};color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;margin:8px 0;}
    .divider{height:1px;background:#e7ece9;margin:24px 0;}
    .info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f3f1;font-size:14px;}
    .info-row span:first-child{color:#7c8b83;}
    .info-row span:last-child{font-weight:600;color:${style.primaryColor};}
    .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;}
    .badge-success{background:#e8f5e9;color:#2e7d32;}
    .badge-warning{background:#fff8e1;color:#f57f17;}
    .badge-danger{background:#ffebee;color:#c62828;}
    .warning{background:#fff8e1;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;font-size:13px;color:#7a6a3a;margin-top:16px;}
    .footer{background:#f6f9f7;padding:22px 32px;text-align:center;border-top:1px solid #e7ece9;}
    .footer p{font-size:12px;color:#7c8b83;line-height:1.6;}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      {{#if logoUrl}}<img src="{{logoUrl}}" alt="Washermann" class="header-logo" width="170"/>{{else}}<h1>Washer<span>mann</span></h1><div class="tagline">Laundry, handled</div>{{/if}}
    </div>
    <div class="body">${contentBlock}</div>
    <div class="footer">
      <p>${style.footerText}</p>
    </div>
  </div>
</body>
</html>`;

// ─── Default template definitions ─────────────────────────────────────────────

interface DefaultTemplate {
  key:       string;
  channel:   NotificationChannel;
  name:      string;
  subject?:  string;
  body:      string;
  htmlBody?: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [

  // ── Order Placed ─────────────────────────────────────────────────────────────

  {
    key: 'order.placed.customer', channel: 'email',
    name: 'Order Placed — Customer Email',
    subject: 'Order Confirmed: {{orderRef}} 🧺',
    variables: ['customerName', 'orderRef', 'totalWP', 'nairaEquivalent', 'pickupAddress', 'scheduledPickupAt', 'vendorName'],
    body: 'Hi {{customerName}}, your order {{orderRef}} has been placed and is waiting for a rep to be assigned.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{customerName}}</strong>,</p>
      <p>Your laundry order has been confirmed. Here's your receipt:</p>
      <div class="highlight-box">
        <div class="highlight-value">{{orderRef}}</div>
        <div class="highlight-label">Order Reference</div>
      </div>
      <div class="info-row"><span>Total</span><span>{{totalWP}} WP (~₦{{nairaEquivalent}})</span></div>
      <div class="info-row"><span>Pickup Address</span><span>{{pickupAddress}}</span></div>
      <div class="info-row"><span>Scheduled Pickup</span><span>{{scheduledPickupAt}}</span></div>
      <div class="divider"></div>
      <p style="font-size:13px;color:#888;">A rep will be assigned shortly. You'll be notified when they're on their way.</p>
    `),
  },
  {
    key: 'order.placed.customer', channel: 'sms',
    name: 'Order Placed — Customer SMS',
    variables: ['customerName', 'orderRef', 'totalWP'],
    body: 'Hi {{customerName}}, your Washermann order {{orderRef}} is confirmed ({{totalWP}} WP). A rep will be assigned shortly.',
  },
  {
    key: 'order.placed.customer', channel: 'push',
    name: 'Order Placed — Customer Push',
    variables: ['orderRef', 'totalWP'],
    subject: 'Order Confirmed 🧺',
    body: 'Order {{orderRef}} placed for {{totalWP}} WP. A rep will be assigned shortly.',
  },
  {
    key: 'order.placed.customer', channel: 'in_app',
    name: 'Order Placed — Customer In-App',
    variables: ['orderRef', 'totalWP'],
    subject: 'Order Confirmed',
    body: 'Your order {{orderRef}} has been placed ({{totalWP}} WP). We\'re finding a rep for you.',
  },
  {
    key: 'order.placed.customer', channel: 'whatsapp',
    name: 'Order Placed — Customer WhatsApp',
    variables: ['customerName', 'orderRef', 'totalWP', 'pickupAddress', 'scheduledPickupAt'],
    body: `🧺 *Order Confirmed*\n\nHi {{customerName}}, your Washermann order is confirmed!\n\n📋 Ref: *{{orderRef}}*\n💰 Total: *{{totalWP}} WP*\n📍 Pickup: {{pickupAddress}}\n⏰ Scheduled: {{scheduledPickupAt}}\n\nWe're assigning a rep to your order now.`,
  },

  // ── Rep Assigned ─────────────────────────────────────────────────────────────

  {
    key: 'order.rep_assigned.customer', channel: 'push',
    name: 'Rep Assigned — Customer Push',
    variables: ['repName', 'orderRef'],
    subject: 'Rep Assigned 🛵',
    body: '{{repName}} has been assigned to your order {{orderRef}} and will pick up your laundry soon.',
  },
  {
    key: 'order.rep_assigned.customer', channel: 'in_app',
    name: 'Rep Assigned — Customer In-App',
    variables: ['repName', 'orderRef'],
    subject: 'Rep Assigned',
    body: '{{repName}} is your rep for order {{orderRef}}. They\'ll be picking up your laundry.',
  },
  {
    key: 'order.rep_assigned.customer', channel: 'whatsapp',
    name: 'Rep Assigned — Customer WhatsApp',
    variables: ['customerName', 'repName', 'orderRef'],
    body: `🛵 *Rep Assigned*\n\nHi {{customerName}}, *{{repName}}* has been assigned to your order *{{orderRef}}* and will pick up your laundry soon.`,
  },

  // ── Picked Up ────────────────────────────────────────────────────────────────

  {
    key: 'order.picked_up.customer', channel: 'push',
    name: 'Order Picked Up — Customer Push',
    variables: ['orderRef'],
    subject: 'Laundry Picked Up 📦',
    body: 'Your laundry for order {{orderRef}} has been picked up and is on its way to the vendor.',
  },
  {
    key: 'order.picked_up.customer', channel: 'in_app',
    name: 'Order Picked Up — Customer In-App',
    variables: ['orderRef'],
    subject: 'Laundry Picked Up',
    body: 'Your laundry (order {{orderRef}}) has been collected and is heading to the vendor.',
  },
  {
    key: 'order.picked_up.customer', channel: 'whatsapp',
    name: 'Order Picked Up — Customer WhatsApp',
    variables: ['customerName', 'orderRef'],
    body: `📦 *Laundry Picked Up*\n\nHi {{customerName}}, your laundry for order *{{orderRef}}* has been collected and is heading to the vendor. We'll update you when it's done.`,
  },

  // ── Delivered ────────────────────────────────────────────────────────────────

  {
    key: 'order.delivered.customer', channel: 'email',
    name: 'Order Delivered — Customer Email',
    subject: 'Your laundry is back! — Order {{orderRef}} ✅',
    variables: ['customerName', 'orderRef', 'vendorName', 'repName'],
    body: 'Hi {{customerName}}, your order {{orderRef}} has been delivered. Please confirm delivery in the app.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{customerName}}</strong>,</p>
      <p>Great news — your laundry for order <strong>{{orderRef}}</strong> has been delivered!</p>
      <div class="highlight-box">
        <div class="highlight-value">✅</div>
        <div class="highlight-label">Delivered successfully</div>
      </div>
      <div class="info-row"><span>Order Ref</span><span>{{orderRef}}</span></div>
      <div class="info-row"><span>Vendor</span><span>{{vendorName}}</span></div>
      <div class="info-row"><span>Delivered by</span><span>{{repName}}</span></div>
      <div class="divider"></div>
      <p>Please confirm delivery in the app to release payment to the vendor. If you don't confirm within 24 hours, it will be confirmed automatically.</p>
      <div class="warning">💬 Was everything satisfactory? Rate your experience in the app — your feedback helps us improve.</div>
    `),
  },
  {
    key: 'order.delivered.customer', channel: 'sms',
    name: 'Order Delivered — Customer SMS',
    variables: ['customerName', 'orderRef'],
    body: 'Hi {{customerName}}, your laundry order {{orderRef}} has been delivered! Please confirm in the Washermann app.',
  },
  {
    key: 'order.delivered.customer', channel: 'push',
    name: 'Order Delivered — Customer Push',
    variables: ['orderRef'],
    subject: 'Laundry Delivered! 🎉',
    body: 'Your order {{orderRef}} has been delivered. Tap to confirm and rate your experience.',
  },
  {
    key: 'order.delivered.customer', channel: 'in_app',
    name: 'Order Delivered — Customer In-App',
    variables: ['orderRef'],
    subject: 'Laundry Delivered!',
    body: 'Your order {{orderRef}} has been delivered. Please confirm delivery to release payment.',
  },
  {
    key: 'order.delivered.customer', channel: 'whatsapp',
    name: 'Order Delivered — Customer WhatsApp',
    variables: ['customerName', 'orderRef'],
    body: `🎉 *Laundry Delivered!*\n\nHi {{customerName}}, your order *{{orderRef}}* has been delivered!\n\nPlease confirm delivery in the Washermann app. Your payment will be released to the vendor automatically after 24 hours if not confirmed.`,
  },

  // ── Order Completed ───────────────────────────────────────────────────────────

  {
    key: 'order.completed.customer', channel: 'email',
    name: 'Order Completed — Customer Email',
    subject: 'Order {{orderRef}} Complete — Thank you!',
    variables: ['customerName', 'orderRef'],
    body: 'Hi {{customerName}}, your order {{orderRef}} is now complete. Thank you for using Washermann!',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{customerName}}</strong>,</p>
      <p>Your order <strong>{{orderRef}}</strong> is now complete. Payment has been released to the vendor.</p>
      <p>Thank you for choosing Washermann! We hope to serve you again soon.</p>
      <div class="warning">💬 Haven't rated yet? Open the app to share your feedback — it only takes a moment.</div>
    `),
  },
  {
    key: 'order.completed.customer', channel: 'push',
    name: 'Order Completed — Customer Push',
    variables: ['orderRef'],
    subject: 'Order Complete ✅',
    body: 'Order {{orderRef}} is complete. Thanks for using Washermann!',
  },
  {
    key: 'order.completed.customer', channel: 'in_app',
    name: 'Order Completed — Customer In-App',
    variables: ['orderRef'],
    subject: 'Order Complete',
    body: 'Order {{orderRef}} has been completed. Payment released to vendor.',
  },

  // ── Order Cancelled ───────────────────────────────────────────────────────────

  {
    key: 'order.cancelled.customer', channel: 'email',
    name: 'Order Cancelled — Customer Email',
    subject: 'Order {{orderRef}} Cancelled — Refund Issued',
    variables: ['customerName', 'orderRef', 'totalWP'],
    body: 'Hi {{customerName}}, your order {{orderRef}} has been cancelled. {{totalWP}} WP has been refunded to your wallet.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{customerName}}</strong>,</p>
      <p>Your order <strong>{{orderRef}}</strong> has been cancelled.</p>
      <div class="highlight-box">
        <div class="highlight-value">{{totalWP}} WP</div>
        <div class="highlight-label">Refunded to your wallet</div>
      </div>
      <p>The refund is available in your Washermann wallet immediately.</p>
    `),
  },
  {
    key: 'order.cancelled.customer', channel: 'sms',
    name: 'Order Cancelled — Customer SMS',
    variables: ['orderRef', 'totalWP'],
    body: 'Your Washermann order {{orderRef}} has been cancelled. {{totalWP}} WP refunded to your wallet.',
  },
  {
    key: 'order.cancelled.customer', channel: 'push',
    name: 'Order Cancelled — Customer Push',
    variables: ['orderRef', 'totalWP'],
    subject: 'Order Cancelled',
    body: 'Order {{orderRef}} cancelled. {{totalWP}} WP refunded to your wallet.',
  },
  {
    key: 'order.cancelled.customer', channel: 'in_app',
    name: 'Order Cancelled — Customer In-App',
    variables: ['orderRef', 'totalWP'],
    subject: 'Order Cancelled',
    body: 'Order {{orderRef}} cancelled. {{totalWP}} WP has been refunded to your wallet.',
  },

  // ── Assignment Broadcast → Rep ────────────────────────────────────────────────

  {
    key: 'assignment.broadcast.rep', channel: 'sms',
    name: 'Assignment Broadcast — Rep SMS',
    variables: ['repName', 'orderRef', 'pickupAddress', 'scheduledPickupAt'],
    body: 'Hi {{repName}}, new job alert! Order {{orderRef}} — Pickup: {{pickupAddress}} at {{scheduledPickupAt}}. Open the Washermann app to accept.',
  },
  {
    key: 'assignment.broadcast.rep', channel: 'push',
    name: 'Assignment Broadcast — Rep Push',
    variables: ['orderRef', 'pickupAddress'],
    subject: 'New Job Available 🛵',
    body: 'Order {{orderRef}} — {{pickupAddress}}. Tap to accept before time runs out!',
  },
  {
    key: 'assignment.broadcast.rep', channel: 'in_app',
    name: 'Assignment Broadcast — Rep In-App',
    variables: ['orderRef', 'pickupAddress', 'scheduledPickupAt'],
    subject: 'New Job Available',
    body: 'Order {{orderRef}} available — pickup at {{pickupAddress}} on {{scheduledPickupAt}}.',
  },
  {
    key: 'assignment.broadcast.rep', channel: 'whatsapp',
    name: 'Assignment Broadcast — Rep WhatsApp',
    variables: ['repName', 'orderRef', 'pickupAddress', 'scheduledPickupAt'],
    body: `🛵 *New Job Available!*\n\nHi {{repName}}, a new order is available:\n\n📋 Order: *{{orderRef}}*\n📍 Pickup: {{pickupAddress}}\n⏰ Time: {{scheduledPickupAt}}\n\nOpen the Washermann app to accept — first come first served!`,
  },

  // ── Assignment Confirmed → Rep ────────────────────────────────────────────────

  {
    key: 'assignment.confirmed.rep', channel: 'push',
    name: 'Assignment Confirmed — Rep Push',
    variables: ['orderRef', 'pickupAddress', 'customerName'],
    subject: 'Job Confirmed ✅',
    body: 'You\'ve been assigned order {{orderRef}}. Pickup from {{pickupAddress}}.',
  },
  {
    key: 'assignment.confirmed.rep', channel: 'in_app',
    name: 'Assignment Confirmed — Rep In-App',
    variables: ['orderRef', 'pickupAddress'],
    subject: 'Job Confirmed',
    body: 'You\'ve accepted order {{orderRef}}. Head to {{pickupAddress}} for pickup.',
  },

  // ── Earning Credited → Rep ────────────────────────────────────────────────────

  {
    key: 'order.earning_credited.rep', channel: 'push',
    name: 'Earning Credited — Rep Push',
    variables: ['orderRef', 'earnedWP'],
    subject: 'Earnings Credited 💰',
    body: '{{earnedWP}} WP credited for order {{orderRef}}. Keep it up!',
  },
  {
    key: 'order.earning_credited.rep', channel: 'in_app',
    name: 'Earning Credited — Rep In-App',
    variables: ['orderRef', 'earnedWP'],
    subject: 'Earnings Credited',
    body: '{{earnedWP}} WP has been credited to your account for completing order {{orderRef}}.',
  },

  // ── Rep Flagged for Review ────────────────────────────────────────────────────

  {
    key: 'rep.flagged_for_review', channel: 'email',
    name: 'Rep Flagged for Review — Rep Email',
    subject: 'Action Required — Account Review',
    variables: ['repName', 'rating'],
    body: 'Hi {{repName}}, your current rating of {{rating}} has fallen below the platform threshold. Your account has been flagged for review.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{repName}}</strong>,</p>
      <p>Your current Washermann rating of <strong>{{rating}}/5</strong> has fallen below the platform minimum threshold.</p>
      <p>Your account has been flagged for review. An admin will be in touch shortly.</p>
      <div class="warning">⚠️ During the review period, you may continue working. Focus on punctuality, communication, and care with customer items to improve your score.</div>
    `),
  },
  {
    key: 'rep.flagged_for_review', channel: 'push',
    name: 'Rep Flagged for Review — Push',
    variables: ['rating'],
    subject: 'Account Review Notice',
    body: 'Your rating ({{rating}}/5) is below the threshold. Your account is under review — check the app for details.',
  },
  {
    key: 'rep.flagged_for_review', channel: 'in_app',
    name: 'Rep Flagged for Review — In-App',
    variables: ['rating'],
    subject: 'Account Under Review',
    body: 'Your rating of {{rating}}/5 is below the platform threshold. Your account has been flagged for review.',
  },

  // ── Assignment Broadcast → Vendor ─────────────────────────────────────────────

  {
    key: 'assignment.broadcast.vendor', channel: 'sms',
    name: 'Assignment Broadcast — Vendor SMS',
    variables: ['vendorName', 'orderRef', 'scheduledPickupAt'],
    body: 'Hi {{vendorName}}, new order {{orderRef}} incoming — pickup at {{scheduledPickupAt}}. Accept in the Washermann app.',
  },
  {
    key: 'assignment.broadcast.vendor', channel: 'push',
    name: 'Assignment Broadcast — Vendor Push',
    variables: ['orderRef'],
    subject: 'New Order Incoming 📋',
    body: 'Order {{orderRef}} has been sent to you. Accept in the app now!',
  },
  {
    key: 'assignment.broadcast.vendor', channel: 'in_app',
    name: 'Assignment Broadcast — Vendor In-App',
    variables: ['orderRef', 'scheduledPickupAt'],
    subject: 'New Order Assigned',
    body: 'Order {{orderRef}} has been assigned to you. Rep pickup scheduled for {{scheduledPickupAt}}.',
  },
  {
    key: 'assignment.broadcast.vendor', channel: 'whatsapp',
    name: 'Assignment Broadcast — Vendor WhatsApp',
    variables: ['vendorName', 'orderRef', 'scheduledPickupAt'],
    body: `📋 *New Order Assigned!*\n\nHi {{vendorName}}, you have a new order!\n\n📋 Order: *{{orderRef}}*\n⏰ Rep Pickup: {{scheduledPickupAt}}\n\nOpen the Washermann app to accept.`,
  },

  // ── Vendor: Rep En Route ──────────────────────────────────────────────────────

  {
    key: 'order.picked_up.vendor', channel: 'push',
    name: 'Rep En Route — Vendor Push',
    variables: ['orderRef', 'repName'],
    subject: 'Rep Collected Order 🛵',
    body: '{{repName}} has collected order {{orderRef}} from the customer and is heading your way.',
  },
  {
    key: 'order.picked_up.vendor', channel: 'in_app',
    name: 'Rep En Route — Vendor In-App',
    variables: ['orderRef', 'repName'],
    subject: 'Rep On the Way',
    body: '{{repName}} collected order {{orderRef}} from the customer and is heading to your location.',
  },
  {
    key: 'order.picked_up.vendor', channel: 'whatsapp',
    name: 'Rep En Route — Vendor WhatsApp',
    variables: ['vendorName', 'orderRef', 'repName'],
    body: `🛵 *Rep On the Way*\n\nHi {{vendorName}}, *{{repName}}* has collected order *{{orderRef}}* from the customer and is heading to you. Please prepare to receive the laundry.`,
  },

  // ── Vendor Earning Credited ───────────────────────────────────────────────────

  {
    key: 'order.earning_credited.vendor', channel: 'email',
    name: 'Earning Credited — Vendor Email',
    subject: 'You\'ve been paid ₦{{nairaEquivalent}} — Order {{orderRef}}',
    variables: ['vendorName', 'orderRef', 'earnedWP', 'nairaEquivalent'],
    body: 'Hi {{vendorName}}, ₦{{nairaEquivalent}} has been credited to your wallet for order {{orderRef}}.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>Payment for order <strong>{{orderRef}}</strong> has been released to your wallet.</p>
      <div class="highlight-box">
        <div class="highlight-value">₦{{nairaEquivalent}}</div>
        <div class="highlight-label">{{earnedWP}} WP</div>
      </div>
      <p>You can request a payout from your vendor dashboard at any time.</p>
    `),
  },
  {
    key: 'order.earning_credited.vendor', channel: 'push',
    name: 'Earning Credited — Vendor Push',
    variables: ['orderRef', 'earnedWP', 'nairaEquivalent'],
    subject: 'You\'ve been paid 💰',
    body: '₦{{nairaEquivalent}} credited for order {{orderRef}}.',
  },
  {
    key: 'order.earning_credited.vendor', channel: 'in_app',
    name: 'Earning Credited — Vendor In-App',
    variables: ['orderRef', 'earnedWP', 'nairaEquivalent'],
    subject: 'Payment Received',
    body: '₦{{nairaEquivalent}} credited to your wallet for completing order {{orderRef}} ({{earnedWP}} WP).',
  },

  // ── Vendor Account Verified ───────────────────────────────────────────────────

  {
    key: 'vendor.account_verified', channel: 'email',
    name: 'Account Verified — Vendor Email',
    subject: 'Your Washermann vendor account is verified ✅',
    variables: ['vendorName'],
    body: 'Hi {{vendorName}}, your vendor account has been verified. You can now receive orders on the Washermann platform.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>Congratulations! Your Washermann vendor account has been <strong>verified</strong>.</p>
      <div class="highlight-box">
        <div class="highlight-value">✅ Verified</div>
        <div class="highlight-label">Your account is now active</div>
      </div>
      <p>You can now receive orders from customers in your area. Make sure your availability is set to <strong>ON</strong> in the app to start receiving jobs.</p>
    `),
  },
  {
    key: 'vendor.account_verified', channel: 'sms',
    name: 'Account Verified — Vendor SMS',
    variables: ['vendorName'],
    body: 'Congratulations {{vendorName}}! Your Washermann vendor account is verified. You can now receive orders.',
  },
  {
    key: 'vendor.account_verified', channel: 'push',
    name: 'Account Verified — Vendor Push',
    variables: ['vendorName'],
    subject: 'Account Verified ✅',
    body: 'Your vendor account is now verified. Turn on availability in the app to start receiving orders!',
  },
  {
    key: 'vendor.account_verified', channel: 'in_app',
    name: 'Account Verified — Vendor In-App',
    variables: [],
    subject: 'Account Verified',
    body: 'Your vendor account has been verified by the Washermann team. You can now receive orders.',
  },

  // ── Vendor Pricing Approved ───────────────────────────────────────────────────

  {
    key: 'pricing.approved.vendor', channel: 'email',
    name: 'Pricing Approved — Vendor Email',
    subject: 'Your pricing proposal has been approved',
    variables: ['vendorName'],
    body: 'Hi {{vendorName}}, your pricing proposal has been reviewed and approved. Your new rates are now live.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>Your pricing proposal has been reviewed and <strong>approved</strong> by the Washermann team.</p>
      <p>Your new rates are now live and will be applied to all new orders in your area.</p>
    `),
  },
  {
    key: 'pricing.approved.vendor', channel: 'push',
    name: 'Pricing Approved — Vendor Push',
    variables: [],
    subject: 'Pricing Approved ✅',
    body: 'Your pricing proposal has been approved. New rates are now live.',
  },
  {
    key: 'pricing.approved.vendor', channel: 'in_app',
    name: 'Pricing Approved — Vendor In-App',
    variables: [],
    subject: 'Pricing Approved',
    body: 'Your pricing proposal has been approved. Your new rates are now live for all new orders.',
  },

  // ── Vendor: garment list logged on an order ─────────────────────────────────

  {
    key: 'order.garments_logged.vendor', channel: 'email',
    name: 'Garments Logged — Vendor Email',
    subject: 'Order {{orderRef}} — {{itemCount}} garments received',
    variables: ['vendorName', 'orderRef', 'itemsRowsHtml', 'itemsText', 'itemCount', 'earningNaira', 'unpricedCount', 'unpricedNote', 'unpricedNoteHtml'],
    body: 'Hi {{vendorName}}, the rep has logged the garments for order {{orderRef}}: {{itemsText}}. You will earn ₦{{earningNaira}} on this order.{{unpricedNote}}',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>The rep has logged the garments for order <strong>{{orderRef}}</strong>. Here is the full list:</p>
      {{itemsRowsHtml}}
      <div class="highlight-box">
        <div class="highlight-value">₦{{earningNaira}}</div>
        <div class="highlight-label">your earning on this order</div>
      </div>
      {{unpricedNoteHtml}}
      <p>The laundry is on its way to you — you can mark it in progress from your dashboard once you receive it.</p>
    `),
  },
  {
    key: 'order.garments_logged.vendor', channel: 'push',
    name: 'Garments Logged — Vendor Push',
    variables: ['orderRef', 'itemCount', 'earningNaira'],
    subject: 'Order {{orderRef}} — {{itemCount}} garments',
    body: 'Garment list logged. You earn ₦{{earningNaira}} on this order. Tap for the full list.',
  },
  {
    key: 'order.garments_logged.vendor', channel: 'in_app',
    name: 'Garments Logged — Vendor In-App',
    variables: ['orderRef', 'itemsText', 'earningNaira', 'unpricedNote'],
    subject: 'Order {{orderRef}} garment list',
    body: '{{itemsText}}. You earn ₦{{earningNaira}} on this order.{{unpricedNote}}',
  },

  // ── Pricing Reviewed (per-item approve/reject summary) ──────────────────────────

  {
    key: 'pricing.reviewed.vendor', channel: 'email',
    name: 'Pricing Reviewed — Vendor Email',
    subject: 'Your pricing has been reviewed — {{approvedCount}} approved, {{rejectedCount}} need changes',
    variables: ['vendorName', 'approvedCount', 'rejectedCount', 'approvedRowsHtml', 'rejectedRowsHtml'],
    body: 'Hi {{vendorName}}, your pricing has been reviewed. Approved: {{approvedText}}. Needs changes: {{rejectedText}}.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>Our team has reviewed your pricing. Here's the outcome:</p>
      <p style="font-weight:700;color:#2e7d32;margin-top:20px;">✅ Approved ({{approvedCount}}) — now live</p>
      {{approvedRowsHtml}}
      <p style="font-weight:700;color:#c62828;margin-top:20px;">✕ Needs changes ({{rejectedCount}})</p>
      {{rejectedRowsHtml}}
      <div class="divider"></div>
      <p>Approved prices are already live for new orders. For the lines that need changes, please review the reasons above and submit updated prices from your vendor dashboard.</p>
    `),
  },
  {
    key: 'pricing.reviewed.vendor', channel: 'push',
    name: 'Pricing Reviewed — Vendor Push',
    variables: ['approvedCount', 'rejectedCount'],
    subject: 'Pricing reviewed',
    body: '{{approvedCount}} price(s) approved, {{rejectedCount}} need changes. Tap to view.',
  },
  {
    key: 'pricing.reviewed.vendor', channel: 'in_app',
    name: 'Pricing Reviewed — Vendor In-App',
    variables: ['approvedCount', 'rejectedCount'],
    subject: 'Pricing reviewed',
    body: 'Your pricing was reviewed: {{approvedCount}} approved (now live), {{rejectedCount}} need changes. Approved: {{approvedText}}. Needs changes: {{rejectedText}}.',
  },

  // ── Payout Approved ───────────────────────────────────────────────────────────

  {
    key: 'payout.approved.vendor', channel: 'email',
    name: 'Payout Approved — Vendor Email',
    subject: 'Payout Initiated — ₦{{nairaAmount}}',
    variables: ['vendorName', 'nairaAmount', 'amountWP', 'accountName', 'bankCode', 'accountNumber', 'payoutId'],
    body: 'Hi {{vendorName}}, your payout of ₦{{nairaAmount}} ({{amountWP}} WP) has been approved and the bank transfer has been initiated.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>Your payout request has been approved and the bank transfer has been initiated.</p>
      <div class="highlight-box">
        <div class="highlight-value">₦{{nairaAmount}}</div>
        <div class="highlight-label">{{amountWP}} WP · Transfer Initiated</div>
      </div>
      <div class="info-row"><span>Account Name</span><span>{{accountName}}</span></div>
      <div class="info-row"><span>Account Number</span><span>{{accountNumber}}</span></div>
      <div class="info-row"><span>Reference</span><span>{{payoutId}}</span></div>
      <div class="divider"></div>
      <p style="font-size:13px;color:#888;">Bank transfers typically arrive within 24 hours. If you have any issues, contact support with your payout reference.</p>
    `),
  },
  {
    key: 'payout.approved.vendor', channel: 'sms',
    name: 'Payout Approved — Vendor SMS',
    variables: ['vendorName', 'nairaAmount', 'accountNumber'],
    body: 'Hi {{vendorName}}, your Washermann payout of ₦{{nairaAmount}} has been approved and sent to account ending {{accountNumber}}.',
  },
  {
    key: 'payout.approved.vendor', channel: 'push',
    name: 'Payout Approved — Vendor Push',
    variables: ['nairaAmount'],
    subject: 'Payout Initiated 🏦',
    body: '₦{{nairaAmount}} payout approved. Bank transfer in progress.',
  },
  {
    key: 'payout.approved.vendor', channel: 'in_app',
    name: 'Payout Approved — Vendor In-App',
    variables: ['nairaAmount', 'amountWP'],
    subject: 'Payout Approved',
    body: 'Your payout of ₦{{nairaAmount}} ({{amountWP}} WP) has been approved. Bank transfer in progress.',
  },
  {
    key: 'payout.approved.vendor', channel: 'whatsapp',
    name: 'Payout Approved — Vendor WhatsApp',
    variables: ['vendorName', 'nairaAmount', 'amountWP', 'accountName'],
    body: `🏦 *Payout Approved!*\n\nHi {{vendorName}}, your payout has been approved!\n\n💰 Amount: *₦{{nairaAmount}}* ({{amountWP}} WP)\n🏦 To: {{accountName}}\n\nThe bank transfer has been initiated. Funds typically arrive within 24 hours.`,
  },

  // ── Payout Failed ─────────────────────────────────────────────────────────────

  {
    key: 'payout.failed.vendor', channel: 'email',
    name: 'Payout Failed — Vendor Email',
    subject: 'Payout Failed — Action Required',
    variables: ['vendorName', 'nairaAmount', 'failureReason', 'payoutId'],
    body: 'Hi {{vendorName}}, your payout of ₦{{nairaAmount}} could not be processed. Reason: {{failureReason}}. Your wallet balance has been restored — you can request the payout again, or contact support if the problem persists.',
    htmlBody: buildEmailHtml(`
      <p>Hi <strong>{{vendorName}}</strong>,</p>
      <p>Unfortunately, your payout request of <strong>₦{{nairaAmount}}</strong> could not be processed.</p>
      <div class="highlight-box">
        <div class="highlight-value" style="color:#c62828;">❌ Failed</div>
        <div class="highlight-label">{{failureReason}}</div>
      </div>
      <p>Your wallet balance has been <strong>restored in full</strong> — you can check your bank details and request the payout again. If the problem persists, contact support with reference <strong>{{payoutId}}</strong>.</p>
    `),
  },
  {
    key: 'payout.failed.vendor', channel: 'sms',
    name: 'Payout Failed — Vendor SMS',
    variables: ['nairaAmount'],
    body: 'Your Washermann payout of ₦{{nairaAmount}} failed. Your balance has been restored — you can request again.',
  },
  {
    key: 'payout.failed.vendor', channel: 'push',
    name: 'Payout Failed — Vendor Push',
    variables: ['nairaAmount'],
    subject: 'Payout Failed ❌',
    body: 'Your ₦{{nairaAmount}} payout could not be processed. Tap for details.',
  },
  {
    key: 'payout.failed.vendor', channel: 'in_app',
    name: 'Payout Failed — Vendor In-App',
    variables: ['nairaAmount', 'failureReason'],
    subject: 'Payout Failed',
    body: 'Your ₦{{nairaAmount}} payout failed: {{failureReason}}. Your balance has been restored — you can request again.',
  },

  // ── Admin: New Payout Request ─────────────────────────────────────────────────

  {
    key: 'payout.new_request.admin', channel: 'email',
    name: 'New Payout Request — Admin Email',
    subject: 'New Payout Request: ₦{{nairaAmount}} from {{vendorName}}',
    variables: ['vendorName', 'nairaAmount', 'amountWP', 'payoutId'],
    body: 'Vendor {{vendorName}} has requested a payout of ₦{{nairaAmount}} ({{amountWP}} WP). Payout ID: {{payoutId}}.',
    htmlBody: buildEmailHtml(`
      <p>A new payout request requires your approval.</p>
      <div class="info-row"><span>Vendor</span><span>{{vendorName}}</span></div>
      <div class="info-row"><span>Amount</span><span>₦{{nairaAmount}} ({{amountWP}} WP)</span></div>
      <div class="info-row"><span>Payout ID</span><span>{{payoutId}}</span></div>
    `),
  },
  {
    key: 'payout.new_request.admin', channel: 'push',
    name: 'New Payout Request — Admin Push',
    variables: ['vendorName', 'nairaAmount'],
    subject: 'New Payout Request',
    body: '{{vendorName}} requested ₦{{nairaAmount}} payout. Approve in the admin panel.',
  },
  {
    key: 'payout.new_request.admin', channel: 'in_app',
    name: 'New Payout Request — Admin In-App',
    variables: ['vendorName', 'nairaAmount', 'payoutId'],
    subject: 'New Payout Request',
    body: '{{vendorName}} has requested a payout of ₦{{nairaAmount}}. ID: {{payoutId}}.',
  },

  // ── Admin: No Reps Available (Escalation) ─────────────────────────────────────

  {
    key: 'assignment.no_reps.admin', channel: 'email',
    name: 'No Reps Available — Admin Email',
    subject: 'Action Required: No Reps Available for Order {{orderRef}}',
    variables: ['orderRef', 'areaName'],
    body: 'Order {{orderRef}} in {{areaName}} could not be assigned — no available reps found. Manual assignment required.',
    htmlBody: buildEmailHtml(`
      <p>Order <strong>{{orderRef}}</strong> in area <strong>{{areaName}}</strong> could not be automatically assigned to a rep.</p>
      <div class="warning">⚠️ No available reps were found in this area or any adjacent areas. Please assign a rep manually from the admin panel.</div>
    `),
  },
  {
    key: 'assignment.no_reps.admin', channel: 'push',
    name: 'No Reps Available — Admin Push',
    variables: ['orderRef'],
    subject: 'Manual Assignment Required',
    body: 'No reps available for order {{orderRef}}. Manual assignment needed.',
  },
  {
    key: 'assignment.no_reps.admin', channel: 'in_app',
    name: 'No Reps Available — Admin In-App',
    variables: ['orderRef', 'areaName'],
    subject: 'Manual Assignment Required',
    body: 'No reps available for order {{orderRef}} in {{areaName}}. Please assign a rep manually.',
  },

  // ── No Vendors Available (admin escalation) ─────────────────────────────────────

  {
    key: 'assignment.no_vendors.admin', channel: 'email',
    name: 'No Vendors Available — Admin Email',
    subject: 'Action Required: No Vendors Available for Order {{orderRef}}',
    variables: ['orderRef', 'areaName'],
    body: 'Order {{orderRef}} in {{areaName}} could not be assigned — no available vendors found. Manual assignment required.',
    htmlBody: buildEmailHtml(`
      <p>Order <strong>{{orderRef}}</strong> in area <strong>{{areaName}}</strong> could not be automatically assigned to a vendor.</p>
      <div class="warning">⚠️ No available vendors were found in this area or any adjacent areas. Please assign a vendor manually from the admin panel.</div>
    `),
  },
  {
    key: 'assignment.no_vendors.admin', channel: 'push',
    name: 'No Vendors Available — Admin Push',
    variables: ['orderRef'],
    subject: 'Manual Assignment Required',
    body: 'No vendors available for order {{orderRef}}. Manual assignment needed.',
  },
  {
    key: 'assignment.no_vendors.admin', channel: 'in_app',
    name: 'No Vendors Available — Admin In-App',
    variables: ['orderRef', 'areaName'],
    subject: 'Manual Assignment Required',
    body: 'No vendors available for order {{orderRef}} in {{areaName}}. Please assign a vendor manually.',
  },

  // ── Admin: Vendor Pending Verification ───────────────────────────────────────

  {
    key: 'vendor.pending_verification.admin', channel: 'email',
    name: 'Vendor Pending Verification — Admin Email',
    subject: 'New Vendor Awaiting Verification: {{vendorName}}',
    variables: ['vendorName', 'vendorId'],
    body: 'New vendor {{vendorName}} has submitted their documents and is awaiting verification. Vendor ID: {{vendorId}}.',
    htmlBody: buildEmailHtml(`
      <p>A new vendor has submitted their documents and is awaiting your review.</p>
      <div class="info-row"><span>Business Name</span><span>{{vendorName}}</span></div>
      <div class="info-row"><span>Vendor ID</span><span>{{vendorId}}</span></div>
      <p>Please review their documents and verify or reject their account in the admin panel.</p>
    `),
  },
  {
    key: 'vendor.pending_verification.admin', channel: 'in_app',
    name: 'Vendor Pending Verification — Admin In-App',
    variables: ['vendorName', 'vendorId'],
    subject: 'New Vendor Pending Review',
    body: '{{vendorName}} is awaiting document verification. Vendor ID: {{vendorId}}.',
  },
];
