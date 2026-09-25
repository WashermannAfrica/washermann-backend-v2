import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticsMobilityFee1786700000000 implements MigrationInterface {
  name = 'LogisticsMobilityFee1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "logistics_mobility_fee_wp" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "logistics_mobility_fee_percent" decimal(6,2) NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "logistics_mobility_fee_percent"`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "logistics_mobility_fee_wp"`);
  }
}
