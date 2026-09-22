import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderAllocationMode1786400000000 implements MigrationInterface {
  name = 'OrderAllocationMode1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "allocation_mode" varchar(12) NOT NULL DEFAULT 'automatic'`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "chosen_vendor_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "chosen_vendor_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "allocation_mode"`);
  }
}
