import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Launch WashPoint rate seed — runs immediately after the Baseline.
 *
 * Locked launch anchor V = ₦6.86 / WP (buy/payout spreads = 0):
 *   top-up  points_per_unit          = 1 / V ≈ 0.1458  (WP credited per ₦1)
 *   payout  payout_rate_naira_per_wp = V     = 6.86     (₦ paid per WP)
 *
 * `conversion_rates` has NO runtime bootstrap, so without this row top-ups fail
 * with "no active conversion rate". `platform_config` DOES self-bootstrap on
 * first access (payout default is already 6.86 in the Baseline), so we only
 * *defensively* correct it here for any environment whose singleton predates
 * the anchor. From here V is governed by the rate engine (Phase18/B4).
 *
 * Idempotent: seeds the launch rate only if no NGN conversion rate exists yet.
 */
export class LaunchWpRate1784120000000 implements MigrationInterface {
  name = 'LaunchWpRate1784120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "conversion_rates" ("currency", "points_per_unit", "effective_from", "notes")
      SELECT 'NGN', 0.1458, NOW(), 'Launch rate — V=₦6.86/WP'
      WHERE NOT EXISTS (
        SELECT 1 FROM "conversion_rates" WHERE "currency" = 'NGN'
      )
    `);
    // Defensive: only touches a pre-existing singleton; a fresh DB has no row yet
    // and the service will lazy-create it at the 6.86 default.
    await queryRunner.query(
      `UPDATE "platform_config" SET "payout_rate_naira_per_wp" = 6.86`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "conversion_rates" WHERE "notes" = 'Launch rate — V=₦6.86/WP'`,
    );
  }
}
