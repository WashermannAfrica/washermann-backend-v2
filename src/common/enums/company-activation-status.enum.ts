export enum CompanyActivationStatus {
  PENDING = 'pending',                     // Created by platform admin; awaiting owner activation
  ACTIVE = 'active',                       // Owner has completed the activation flow
  AWAITING_APPROVAL = 'awaiting_approval', // Self-registered; awaiting admin approval
}
