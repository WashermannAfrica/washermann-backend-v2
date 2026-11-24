import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transport & logistics pricing config is now authored in NAIRA (₦) instead of
 * WashPoints. The engine computes the fare in ₦ and converts to WP at the live
 * rate (the WP ledger is unchanged). This renames the config columns and widens
 * them to numeric(12,2) so ₦ values (incl. kobo) fit.
 *
 *   transport_base_fare_wp      → transport_base_fare_ngn
 *   transport_per_km_wp         → transport_per_km_ngn
 *   transport_min_wp            → transport_min_ngn
 *   transport_max_wp            → transport_max_ngn
 *   logistics_mobility_fee_wp   → logistics_mobility_fee_ngn
 *
 * NOTE: existing numeric values are carried over verbatim (not rate-converted) —
 * they were placeholder config and must be re-entered as ₦ on the Admin → Transport
 * page after deploy.
 */
export class TransportConfigToNaira1793717300000 implements MigrationInterface {
  name = 'TransportConfigToNaira1793717300000';

  private readonly map: [string, string][] = [
    ['transport_base_fare_wp', 'transport_base_fare_ngn'],
    ['transport_per_km_wp', 'transport_per_km_ngn'],
    ['transport_min_wp', 'transport_min_ngn'],
    ['transport_max_wp', 'transport_max_ngn'],
    ['logistics_mobility_fee_wp', 'logistics_mobility_fee_ngn'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName, newName] of this.map) {
      // Rename only if the old column still exists and the new one doesn't (idempotent).
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'platform_config' AND column_name = '${oldName}')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'platform_config' AND column_name = '${newName}') THEN
            ALTER TABLE "platform_config" RENAME COLUMN "${oldName}" TO "${newName}";
          END IF;
        END $$;
      `);
      await queryRunner.query(
        `ALTER TABLE "platform_config" ALTER COLUMN "${newName}" TYPE numeric(12,2) USING "${newName}"::numeric`,
      );
      await queryRunner.query(
        `ALTER TABLE "platform_config" ALTER COLUMN "${newName}" SET DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const revertType: Record<string, string> = {
      transport_per_km_ngn: 'numeric(12,4)',
      transport_base_fare_ngn: 'integer',
      transport_min_ngn: 'integer',
      transport_max_ngn: 'integer',
      logistics_mobility_fee_ngn: 'integer',
    };
    for (const [oldName, newName] of this.map) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'platform_config' AND column_name = '${newName}')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'platform_config' AND column_name = '${oldName}') THEN
            ALTER TABLE "platform_config" RENAME COLUMN "${newName}" TO "${oldName}";
          END IF;
        END $$;
      `);
      await queryRunner.query(
        `ALTER TABLE "platform_config" ALTER COLUMN "${oldName}" TYPE ${revertType[newName]} USING "${oldName}"::${revertType[newName].startsWith('numeric') ? 'numeric' : 'integer'}`,
      );
      await queryRunner.query(
        `ALTER TABLE "platform_config" ALTER COLUMN "${oldName}" SET DEFAULT 0`,
      );
    }
  }
}
