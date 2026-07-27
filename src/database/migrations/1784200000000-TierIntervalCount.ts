import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `interval_count` to tiers — the recurrence interval multiplier for a
 * tier's `duration` (e.g. interval 3 + duration "daily" = "every 3 days"),
 * driving the company "Count" field. Additive; existing tiers default to 1.
 *
 * `duration` already stores free text (varchar), so the new "daily" enum value
 * needs no schema change.
 */
export class TierIntervalCount1784200000000 implements MigrationInterface {
  name = 'TierIntervalCount1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tiers" ADD COLUMN IF NOT EXISTS "interval_count" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tiers" DROP COLUMN IF EXISTS "interval_count"`);
  }
}
