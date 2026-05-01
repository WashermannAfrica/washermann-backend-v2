import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Vendor } from './vendor.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * Real earnings wallet for a vendor.
 *
 * Credited on order completion (vendorShareWP).
 * Debited on payout request (Paystack transfer).
 *
 * One-to-one with Vendor.
 */
@Entity('vendor_earnings_wallets')
export class VendorEarningsWallet extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'vendor_id', type: 'uuid', unique: true })
  vendorId: string;

  @ApiProperty({ description: 'Current WashPoints balance — never negative' })
  @Column({
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  balance: number;

  @ApiProperty({ description: 'All-time WashPoints earned (never decremented)' })
  @Column({
    name: 'total_earned',
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  totalEarned: number;

  @ApiProperty({ enum: ['active', 'frozen'] })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'frozen';

  // ─── Relations ───────────────────────────────────────────────────────────────
  @OneToOne(() => Vendor, { eager: false })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;
}
