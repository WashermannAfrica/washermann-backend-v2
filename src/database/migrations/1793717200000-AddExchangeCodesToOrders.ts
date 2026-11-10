import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two additional per-exchange verification codes so each of the four physical
 * handoffs has its own code (previously first/second_leg_code were reused across
 * two exchanges each):
 *   - dropoff_code    — rep → vendor hand-off (→ with_vendor)
 *   - collection_code — vendor → rep collection (→ rep_collected)
 * (first_leg_code = pickup, second_leg_code = delivery, already present.)
 */
export class AddExchangeCodesToOrders1793717200000 implements MigrationInterface {
  name = 'AddExchangeCodesToOrders1793717200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dropoff_code" character varying(4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "collection_code" character varying(4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "collection_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "dropoff_code"`,
    );
  }
}
