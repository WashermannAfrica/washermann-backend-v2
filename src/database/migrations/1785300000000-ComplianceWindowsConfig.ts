import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComplianceWindowsConfig1785300000000 implements MigrationInterface {
  name = 'ComplianceWindowsConfig1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "payout_withholding_days" int NOT NULL DEFAULT 10`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "deduction_response_days" int NOT NULL DEFAULT 5`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "reward_clawback_days" int NOT NULL DEFAULT 60`);
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "abandonment_days" int NOT NULL DEFAULT 30`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "abandonment_days"`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "reward_clawback_days"`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "deduction_response_days"`);
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "payout_withholding_days"`);
  }
}
