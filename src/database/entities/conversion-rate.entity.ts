import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Versioned, append-only table of WashPoint conversion rates per fiat currency.
 *
 * Active rate query:
 *   WHERE currency = ? AND effective_from <= NOW()
 *   ORDER BY effective_from DESC LIMIT 1
 *
 * New rates are always inserted with effective_from = NOW() + delay (default 60 min).
 * Rows are NEVER updated or deleted.
 */
@Entity('conversion_rates')
export class ConversionRate {
  @ApiProperty({ description: 'UUID primary key' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'NGN', description: 'ISO 4217 currency code' })
  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @ApiProperty({
    example: 2.0,
    description: 'WashPoints issued per 1 major currency unit (e.g. per ₦1)',
  })
  @Column({
    name: 'points_per_unit',
    type: 'decimal',
    precision: 10,
    scale: 4,
    transformer: DecimalTransformer,
  })
  pointsPerUnit: number;

  @ApiProperty({ description: 'Timestamp from which this rate becomes effective' })
  @Column({ name: 'effective_from', type: 'timestamp with time zone' })
  effectiveFrom: Date;

  @ApiProperty({ description: 'UUID of the admin who created this rate', nullable: true })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ApiProperty({ description: 'Reason / notes for this rate change', nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
