import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderTransport1786000000000 implements MigrationInterface {
  name = 'OrderTransport1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "transport_estimate_wp" bigint`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "actual_transport_wp" bigint`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "rep_transport_wp" bigint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "rep_transport_wp"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "actual_transport_wp"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "transport_estimate_wp"`);
  }
}
