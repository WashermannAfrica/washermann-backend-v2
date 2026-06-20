import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { CatalogueCategory } from './catalogue-category.entity';

/**
 * Grouping within a category (e.g. "Casual Tops" under "Tops").
 * Optional layer — items may sit directly under a category with no sub-category.
 */
@Entity('catalogue_subcategories')
export class CatalogueSubCategory extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ApiProperty({ example: 'Casual Tops' })
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @ApiProperty({ example: 'casual-tops' })
  @Column({ type: 'varchar', length: 200, unique: true })
  slug: string;

  @ApiProperty({ description: 'Display order' })
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @ApiProperty({ description: 'Enable/disable' })
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

  @ManyToOne(() => CatalogueCategory, { eager: false })
  @JoinColumn({ name: 'category_id' })
  category: CatalogueCategory;
}
