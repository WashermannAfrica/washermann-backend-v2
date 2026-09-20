import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 17 — Admin oversight: audit columns on referrals (admin note + reviewer)
 * for flag / reject / manual-adjust actions.
 */
export class Phase17ReferralAudit1776880000000 implements MigrationInterface {
  name = 'Phase17ReferralAudit1776880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "admin_note" text NULL`);
    await queryRunner.query(`ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "referrals" DROP COLUMN IF EXISTS "reviewed_by"`);
    await queryRunner.query(`ALTER TABLE "referrals" DROP COLUMN IF EXISTS "admin_note"`);
  }
}
