import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Logistics legs get their own transport pricing, separate from wash-order transport
 * (which is customer⇄vendor round-trip). A leg is one-way and priced as:
 *
 *   base + perKm × ceil(max(0, km − includedKm))
 *
 * Pilot unit economics (ops): ₦1,600 base covering the first 3 km, then ₦300 per
 * extra km. Columns are added as numeric(12,2) and any existing config row is
 * backfilled with the pilot values (admins can change them on Admin → Transport).
 */
export class LogisticsLegPricing1793717400000 implements MigrationInterface {
  name = 'LogisticsLegPricing1793717400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "logistics_base_fare_ngn" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "logistics_per_km_ngn" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "logistics_included_km" numeric(6,2) NOT NULL DEFAULT 0`,
    );

    // Backfill the pilot values on the existing (single) config row only where they
    // are still at the column default, so a re-run never clobbers admin-set values.
    await queryRunner.query(`
      UPDATE "platform_config"
         SET "logistics_base_fare_ngn" = 1600,
             "logistics_per_km_ngn"    = 300,
             "logistics_included_km"   = 3
       WHERE "logistics_base_fare_ngn" = 0
         AND "logistics_per_km_ngn"    = 0
         AND "logistics_included_km"   = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "logistics_included_km"`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "logistics_per_km_ngn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "logistics_base_fare_ngn"`,
    );
  }
}
