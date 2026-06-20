import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

/**
 * Top-level catalogue grouping (e.g. Tops, Bedding, Special Items).
 * Seeded from the catalogue framework; admins can add/edit and enable/disable.
 *
 * Categories carry no price. An item belongs to a category (and optionally a
 * sub-category) and is priced via the P70 engine (later phase).
 */
@Entity('catalogue_categories')
export class CatalogueCategory extends BaseEntity {
  @ApiProperty({ example: 'Tops' })
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @ApiProperty({ example: 'tops' })
  @Column({ type: 'varchar', length: 160, unique: true })
  slug: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true, description: 'SVG markup or asset URL for the category icon' })
  @Column({ name: 'svg_icon', type: 'text', nullable: true })
  svgIcon: string | null;

  @ApiProperty({ description: 'Display order' })
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @ApiProperty({ description: 'Enable/disable — disabled categories are hidden from selection' })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ enum: ['seeded', 'admin'] })
  @Column({ type: 'varchar', length: 20, default: 'admin' })
  source: 'seeded' | 'admin';

  @ApiProperty({ nullable: true })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
