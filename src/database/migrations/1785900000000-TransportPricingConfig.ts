import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransportPricingConfig1785900000000 implements MigrationInterface {
  name = 'TransportPricingConfig1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "transport_base_fare_wp" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "transport_per_km_wp" decimal(12,4) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "transport_min_wp" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "transport_max_wp" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "transport_estimate_basis" varchar(12) NOT NULL DEFAULT 'average'`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "transport_distance_provider" varchar(12) NOT NULL DEFAULT 'haversine'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['transport_distance_provider', 'transport_estimate_basis', 'transport_max_wp', 'transport_min_wp', 'transport_per_km_wp', 'transport_base_fare_wp']) {
      await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
