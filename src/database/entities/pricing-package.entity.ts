import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BigIntTransformer } from '../../common/transformers/column.transformers';
import { Role } from '../../common/enums/roles.enum';

/**
 * One criteria entry inside a package.
 * Either structured (garmentType + quantity) or descriptive-only.
 *
 * Examples:
 *   { label: "Baby bodysuits",   garmentType: "babygrow",  quantity: 10 }
 *   { label: "Baby blankets",    garmentType: "blanket",   quantity: 3  }
 *   { label: "Free gentle wash", garmentType: null,        quantity: null }
 */
export interface PackageCriteriaItem {
  label:       string;
  garmentType: string | null;   // maps to a known garment type (optional)
  quantity:    number | null;   // null = "any amount" or purely descriptive
}

/**
 * Audience targeting rules for a pricing package.
 * All rules are AND-combined — a user must satisfy every set condition.
 * Unset fields (null/undefined/empty) are ignored (not restrictive).
 */
export interface PackageAudience {
  /** true = visible to everyone (ignores all other rules) */
  allUsers?:         boolean;
  /** Minimum number of completed orders the user must have */
  minOrderCount?:    number;
  /** User must have completed an order within N days */
  activeWithinDays?: number;
  /** User's area must be in this list */
  areaIds?:          string[];
  /** User must hold at least one of these roles */
  roles?:            Role[];
  /** User must belong to one of these companies */
  companyIds?:       string[];
  /** User must have a verified phone */
  requirePhone?:     boolean;
  /** User must have a saved address */
  requireAddress?:   boolean;
}

/**
 * Special pricing packages — promotional or niche bundles separate from the
 * standard bag-size system.
 *
 * Examples:
 *  - "Baby Bundle"     — 15 baby items for X WP
 *  - "Corporate Pack"  — 5 shirts + 3 trousers pressed for X WP
 *  - "Duvet Season"    — 2 duvets washed for X WP (limited time)
 *
 * A package has:
 *  - A fixed WP price (not calculated from items — agreed at creation)
 *  - Optional structured criteria (what's included)
 *  - Audience rules (who can see/use it)
 *  - Optional validity window (promos)
 *  - Display controls (order, image, active flag)
 */
@Entity('pricing_packages')
export class PricingPackage {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Baby Bundle' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ example: 'Perfect for newborns — up to 15 baby garments gently washed and folded.' })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true, description: 'Cloudinary or CDN URL for package artwork' })
  @Column({ name: 'image_url', type: 'varchar', length: 2000, nullable: true })
  imageUrl: string | null;

  @ApiProperty({
    description: 'Fixed WashPoints price for this entire package',
    example: 800,
  })
  @Column({
    name: 'price_wp',
    type: 'bigint',
    transformer: BigIntTransformer,
  })
  priceWP: number;

  @ApiProperty({
    type: 'array',
    description: 'Structured breakdown of what is included. Each item: { label, garmentType?, quantity? }',
  })
  @Column({ type: 'jsonb', default: '[]' })
  criteria: PackageCriteriaItem[];

  @ApiProperty({
    description: 'Audience targeting rules. Unset fields are not restrictive.',
  })
  @Column({ type: 'jsonb', default: '{"allUsers": true}' })
  audience: PackageAudience;

  @ApiProperty({ default: true, description: 'Only active packages are returned on the customer endpoint' })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({
    description: 'Sort order in the UI — lower number appears first',
    example: 1,
  })
  @Column({ name: 'display_order', type: 'int', default: 100 })
  displayOrder: number;

  @ApiProperty({ nullable: true, description: 'Package is only valid from this date (UTC)' })
  @Column({ name: 'valid_from', type: 'timestamp with time zone', nullable: true })
  validFrom: Date | null;

  @ApiProperty({ nullable: true, description: 'Package expires after this date (UTC)' })
  @Column({ name: 'valid_until', type: 'timestamp with time zone', nullable: true })
  validUntil: Date | null;

  @ApiProperty({ nullable: true, description: 'Max times a single user can use this package (null = unlimited)' })
  @Column({ name: 'max_uses_per_user', type: 'int', nullable: true })
  maxUsesPerUser: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
