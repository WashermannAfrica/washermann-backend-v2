import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pay-on-arrival for logistics legs. A nullable `payment_timing` marks whether a
 * logistics leg is paid up front ('on_creation', the default/legacy behaviour) or
 * on arrival ('on_arrival' — a rep may be dispatched while the leg is still unpaid,
 * and paying on arrival funds escrow and advances it to SCHEDULED). Null for all
 * existing rows and for non-logistics orders (treated as on_creation).
 */
export class OrderPaymentTiming1793717500000 implements MigrationInterface {
  name = 'OrderPaymentTiming1793717500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_timing" varchar(12)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_timing"`,
    );
  }
}
