import { MigrationInterface, QueryRunner } from 'typeorm';

export class PayoutWithholding1785400000000 implements MigrationInterface {
  name = 'PayoutWithholding1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "held_reason" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "held_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "held_by" uuid`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "auto_release_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN IF EXISTS "auto_release_at"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN IF EXISTS "held_by"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN IF EXISTS "held_at"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN IF EXISTS "held_reason"`);
  }
}
