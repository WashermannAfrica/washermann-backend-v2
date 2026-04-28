import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

export enum GiftCardCreatorType {
  ADMIN = 'admin',
  COMPANY = 'company',
}

export enum GiftCardSourceType {
  VAULT = 'vault',
  COMPANY_WALLET = 'company_wallet',
}

export enum GiftCardStatus {
  ACTIVE = 'active',
  EXHAUSTED = 'exhausted',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('gift_cards')
export class GiftCard extends BaseEntity {
  @Column({ length: 24, unique: true, comment: 'System-generated unique redemption code' })
  code: string;

  @Column({ name: 'creator_type', type: 'enum', enum: GiftCardCreatorType })
  creatorType: GiftCardCreatorType;

  @Column({ name: 'creator_id', comment: 'userId for admin, companyId for company' })
  creatorId: string;

  @Column({ name: 'source_type', type: 'enum', enum: GiftCardSourceType })
  sourceType: GiftCardSourceType;

  @Column({ name: 'source_id', comment: 'vaultId or companyWalletId' })
  sourceId: string;

  @Column({
    name: 'wp_value_per_use', type: 'bigint',
    transformer: { to: (v) => v, from: (v) => parseInt(v, 10) },
    comment: 'WashPoints credited per redemption',
  })
  wpValuePerUse: number;

  @Column({ name: 'max_usages', type: 'int', default: 1 })
  maxUsages: number;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount: number;

  @Column({
    name: 'total_wp_debited', type: 'bigint',
    transformer: { to: (v) => v, from: (v) => parseInt(v, 10) },
    comment: 'wpValuePerUse * maxUsages — debited from source at creation',
  })
  totalWpDebited: number;

  @Column({ name: 'qualification_criteria', type: 'jsonb', nullable: true, comment: 'e.g. { employeeOnly: true, companyId: "..." }' })
  qualificationCriteria: Record<string, any> | null;

  @Column({ name: 'is_public', default: true, comment: 'For company gift cards: can non-employees redeem?' })
  isPublic: boolean;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'enum', enum: GiftCardStatus, default: GiftCardStatus.ACTIVE })
  status: GiftCardStatus;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', nullable: true })
  revokedBy: string | null;

  @Column({
    name: 'refunded_wp', type: 'bigint', nullable: true,
    transformer: { to: (v) => v, from: (v) => v !== null ? parseInt(v, 10) : null },
    comment: 'WP returned to source on revocation',
  })
  refundedWp: number | null;
}
