import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderLogistics1786600000000 implements MigrationInterface {
  name = 'OrderLogistics1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "requester_type" varchar(12) NOT NULL DEFAULT 'customer'`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dropoff_latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dropoff_longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "recipient" jsonb`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "mobility_fee_wp" bigint`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "parent_order_id" uuid`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ready_to_deliver_at" timestamp with time zone`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_token" varchar(64)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_tracking_token" ON "orders" ("tracking_token")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_tracking_token"`);
    for (const col of [
      'tracking_token', 'ready_to_deliver_at', 'parent_order_id', 'mobility_fee_wp',
      'recipient', 'dropoff_longitude', 'dropoff_latitude', 'requester_type',
    ]) {
      await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
