import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 21 — Vendor money hardening.
 * - vendor_pricing locks the WP/₦ conversion rate at admin approval (drift Option 2):
 *   earnings mint AND payout burn for a sheet use the same locked rate.
 * - orders record which logged garment types the vendor had no price for
 *   (their share used the cross-vendor average; vendor is flagged to set a price).
 */
export class Phase21VendorRateLock1777010000000 implements MigrationInterface {
  name = 'Phase21VendorRateLock1777010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendor_pricing" ADD COLUMN IF NOT EXISTS "conversion_rate_id" uuid`);
    await queryRunner.query(`ALTER TABLE "vendor_pricing" ADD COLUMN IF NOT EXISTS "points_per_unit_snapshot" decimal(10,4)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "unpriced_garment_types" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "unpriced_garment_types"`);
    await queryRunner.query(`ALTER TABLE "vendor_pricing" DROP COLUMN IF EXISTS "points_per_unit_snapshot"`);
    await queryRunner.query(`ALTER TABLE "vendor_pricing" DROP COLUMN IF EXISTS "conversion_rate_id"`);
  }
}
