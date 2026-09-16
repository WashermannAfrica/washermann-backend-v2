import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Account deletion marker. `deleted_at IS NOT NULL` means the account was deleted
 * (soft-delete + PII anonymised); the row is kept so financial/order/audit history
 * stays intact and attributable. Distinct from an admin suspension (status only).
 */
export class UserDeletedAt1784900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
