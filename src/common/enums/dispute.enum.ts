export enum DisputeStatus {
  REPORTED = 'reported',
  UNDER_REVIEW = 'under_review',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

/** Open statuses (not yet closed). */
export const OPEN_DISPUTE_STATUSES = [
  DisputeStatus.REPORTED,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.INVESTIGATING,
];

export enum DisputeIssueType {
  TORN = 'torn',
  DAMAGED = 'damaged',
  STAINED = 'stained',
  MISSING_ITEM = 'missing_item',
  WRONG_ITEM = 'wrong_item',
  NOT_CLEANED = 'not_cleaned',
  SHRUNK = 'shrunk',
  COLOUR_RUN = 'colour_run',
  LATE_DELIVERY = 'late_delivery',
  OTHER = 'other',
}

export enum DisputeResolution {
  REFUND = 'refund',
  REWASH = 'rewash',
  COMPENSATION = 'compensation',
}
