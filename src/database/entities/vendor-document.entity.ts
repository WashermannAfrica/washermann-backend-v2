import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Vendor } from './vendor.entity';

/** Supported document types for vendor verification */
export type VendorDocumentType =
  | 'nin'
  | 'cac'
  | 'address_proof'
  | 'photo'            // legacy "owner photo" — retained for older uploads
  | 'personal_photo'
  | 'shop_photo'
  | 'other';

/**
 * Uploaded verification documents for a vendor.
 * Append-only — never deleted or updated. Admin reads these during verification.
 */
@Entity('vendor_documents')
export class VendorDocument {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @ApiProperty({ example: 'nin' })
  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType: VendorDocumentType;

  @ApiProperty({ description: 'URL of the uploaded file (S3/Cloudinary/etc.)' })
  @Column({ name: 'file_url', type: 'varchar', length: 2000 })
  fileUrl: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'original_name', type: 'varchar', length: 500, nullable: true })
  originalName: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Vendor, { eager: false })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;
}
