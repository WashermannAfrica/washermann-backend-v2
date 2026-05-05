import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Laundry operator record.
 *
 * One-to-one with a User account that carries the 'vendor' role.
 * Vendor must be verified by admin before they can receive orders.
 *
 * areaIds: UUIDs of Area records the vendor serves (stored as JSONB array).
 * rating: rolling 30-day average computed from RatingEvents.
 */
@Entity('vendors')
export class Vendor extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @ApiProperty({ example: 'Sparkle Cleaners' })
  @Column({ name: 'business_name', type: 'varchar', length: 255 })
  businessName: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @ApiProperty({ description: 'Area UUIDs this vendor serves', type: [String] })
  @Column({ name: 'area_ids', type: 'jsonb', default: '[]' })
  areaIds: string[];

  @ApiProperty({ enum: VendorVerificationStatus })
  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 50,
    default: VendorVerificationStatus.PENDING_REVIEW,
  })
  verificationStatus: VendorVerificationStatus;

  @ApiProperty({ nullable: true })
  @Column({ name: 'rejection_reason', type: 'varchar', length: 1000, nullable: true })
  rejectionReason: string | null;

  @ApiProperty({ default: false })
  @Column({ name: 'is_available', type: 'boolean', default: false })
  isAvailable: boolean;

  @ApiProperty({ description: 'Rolling 30-day average rating (1–5)', example: 4.7 })
  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: DecimalTransformer,
  })
  rating: number;

  @ApiProperty({ description: 'Total number of ratings ever received' })
  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'pricing_last_updated_at', type: 'timestamp with time zone', nullable: true })
  pricingLastUpdatedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Cloudinary URL of vendor business logo / shop photo' })
  @Column({ name: 'logo_url', type: 'varchar', length: 2000, nullable: true })
  logoUrl: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'verified_at', type: 'timestamp with time zone', nullable: true })
  verifiedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy: string | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
