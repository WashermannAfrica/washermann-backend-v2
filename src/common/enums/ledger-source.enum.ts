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
}
