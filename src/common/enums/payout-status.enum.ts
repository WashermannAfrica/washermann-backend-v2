export enum PayoutStatus {
  PENDING     = 'pending',
  HELD        = 'held',        // withheld for investigation; auto-releases to PENDING after the window
  PROCESSING  = 'processing',
  COMPLETED   = 'completed',
  FAILED      = 'failed',
  CANCELLED   = 'cancelled',
}
