import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 14 — Seed the launch WashPoint rate.
 *
 * Locked launch value V = ₦6.86 / WP (buy/payout spreads = 0):
 *   top-up   points_per_unit       = 1 / V      ≈ 0.1458  (WP per ₦1)
 *   payout   payout_rate_naira_per_wp = V        = 6.86    (₦ per WP)
 *
 * NOTE: from here V is governed by the Monetary Policy formula (B4 rate engine);
 * this only seeds the launch anchor and replaces the placeholder defaults.
 */
export class Phase14LaunchWpRate1776580000000 implements MigrationInterface {
  name = 'Phase14LaunchWpRate1776580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // One-time launch seed: make V=₦6.86/WP the active rate (latest effective_from wins).
    await queryRunner.query(`
      INSERT INTO "conversion_rates" ("currency", "points_per_unit", "effective_from", "notes")
      VALUES ('NGN', 0.1458, NOW(), 'Launch rate — V=₦6.86/WP (Phase14 seed)')
    `);
    await queryRunner.query(`UPDATE "platform_config" SET "payout_rate_naira_per_wp" = 6.86`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non-destructive: leave the seeded rate; restore the old placeholder payout.
    await queryRunner.query(`UPDATE "platform_config" SET "payout_rate_naira_per_wp" = 9`);
  }
}
