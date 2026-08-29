import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a soft-delete marker to sales reps so admins can remove (archive) one
 * without destroying referral/payout history. `deactivated_at IS NOT NULL`
 * means archived — excluded from the default admin list. Additive + idempotent.
 */
export class SalesRepDeactivatedAt1784500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_reps"
        ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_reps" DROP COLUMN IF EXISTS "deactivated_at"
    `);
  }
}
