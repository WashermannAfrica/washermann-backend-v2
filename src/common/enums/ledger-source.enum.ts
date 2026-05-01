export enum LedgerSource {
  /** User topped up wallet via Paystack — fiat → WashPoints */
  TOPUP           = 'topup',

  /** WashPoints spent on an order */
  ORDER_PAYMENT   = 'order_payment',

  /** Refund issued after a failed/disputed order */
  REFUND          = 'refund',

  /** WashPoints held in escrow when an order is placed */
  ESCROW_HOLD     = 'escrow_hold',

  /** Escrow released to washerman on delivery confirmation */
  ESCROW_RELEASE  = 'escrow_release',

  /** Monthly company benefit credit allocated to employee */
  BENEFIT_CREDIT  = 'benefit_credit',

  /** Unused benefit points expired at end of cycle */
  BENEFIT_EXPIRY  = 'benefit_expiry',

  /** Manual credit by platform admin (with mandatory description) */
  ADMIN_CREDIT    = 'admin_credit',

  /** Manual debit by platform admin (with mandatory description) */
  ADMIN_DEBIT     = 'admin_debit',

  /** Coupon discount applied at checkout */
  COUPON          = 'coupon',

  /** WashPoints from gift card redemption */
  GIFT_CARD       = 'gift_card',

  // ─── Phase 6 — Orders & Ops ──────────────────────────────────────────────────

  /** WP deducted from user wallet when an order is paid */
  ORDER_DEBIT          = 'order_debit',

  /** WP credited to vendor earnings wallet on order completion */
  VENDOR_EARNING       = 'vendor_earning',

  /** WP credited to rep pseudo-wallet on order completion */
  REP_EARNING          = 'rep_earning',

  /** Platform revenue credited on order completion */
  PLATFORM_REVENUE     = 'platform_revenue',

  /** Cancellation refund back to user wallet */
  CANCELLATION_REFUND  = 'cancellation_refund',

  /** Rep bonus credit at end of bonus cycle */
  REP_BONUS            = 'rep_bonus',

  /** Vendor payout debit from earnings wallet */
  VENDOR_PAYOUT        = 'vendor_payout',

  /** Manual admin credit to vendor wallet */
  ADMIN_VENDOR_CREDIT  = 'admin_vendor_credit',

  /** Manual admin debit from vendor wallet */
  ADMIN_VENDOR_DEBIT   = 'admin_vendor_debit',
}
