import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ConversionRate } from './conversion-rate.entity';

export enum VaultPurpose {
  GENERAL = 'general',
  GIFT_CARDS = 'gift_cards',
  COUPONS = 'coupons',
  CUSTOM = 'custom',
}

export enum VaultStatus {
  ACTIVE = 'active',
  EXHAUSTED = 'exhausted',
  DEACTIVATED = 'deactivated',
}

@Entity('vaults')
export class Vault extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'enum', enum: VaultPurpose, default: VaultPurpose.GENERAL })
  purpose: VaultPurpose;

  @Column({
    name: 'total_points', type: 'bigint', default: 0,
    transformer: { to: (v) => v, from: (v) => parseInt(v, 10) },
    comment: 'Total WashPoints this vault can issue. Fixed at creation.',
  })
  totalPoints: number;

  @Column({
    name: 'used_points', type: 'bigint', default: 0,
    transformer: { to: (v) => v, from: (v) => parseInt(v, 10) },
    comment: 'WashPoints issued so far. Incremented on each debit.',
  })
  usedPoints: number;

  @Column({ name: 'conversion_rate_id', nullable: true })
  conversionRateId: string | null;

  @ManyToOne(() => ConversionRate, { nullable: true })
  @JoinColumn({ name: 'conversion_rate_id' })
  conversionRate: ConversionRate;

  @Column({
    name: 'conversion_rate_snapshot', type: 'decimal', precision: 10, scale: 4, nullable: true,
    transformer: { to: (v) => v, from: (v) => v !== null ? parseFloat(v) : null },
    comment: 'pointsPerUnit locked at vault creation. Never changes.',
  })
  conversionRateSnapshot: number | null;

  @Column({ type: 'enum', enum: VaultStatus, default: VaultStatus.ACTIVE })
  status: VaultStatus;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'sequence_order', type: 'int', nullable: true, comment: 'Lower = higher priority in auto-activation sequence' })
  sequenceOrder: number | null;

  @Column({ name: 'auto_create_on_threshold', default: false })
  autoCreateOnThreshold: boolean;

  @Column({
    name: 'auto_create_threshold', type: 'bigint', nullable: true,
    transformer: { to: (v) => v, from: (v) => v !== null ? parseInt(v, 10) : null },
    comment: 'Remaining WP level that triggers auto-creation of next vault',
  })
  autoCreateThreshold: number | null;

  @Column({ name: 'auto_create_use_same_rate', default: true, comment: 'If true, auto-created vault uses same rate snapshot. If false, uses current system rate.' })
  autoCreateUseSameRate: boolean;

  @Column({ name: 'next_vault_id', nullable: true, comment: 'Manually designated next vault in sequence' })
  nextVaultId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ name: 'deactivated_at', type: 'timestamp', nullable: true })
  deactivatedAt: Date | null;

  @Column({ name: 'deactivated_by', nullable: true })
  deactivatedBy: string | null;
}
