import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 12 — Flow-based orders (catalogue model).
 *
 * An order is now exactly one flow: wash_fold (a bag), wash_iron (catalogue
 * items + qty), or bundle. Adds the flow fields and relaxes the legacy bag_size
 * NOT NULL (wash_iron orders have no bag size). Legacy columns are retained.
 */
export class Phase12OrderFlow1776380000000 implements MigrationInterface {
  name = 'Phase12OrderFlow1776380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "flow" varchar(20) NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bag_id" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "item_selections" jsonb NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bundle_id" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "bag_size" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfill so the NOT NULL can be restored, then drop the new columns.
    await queryRunner.query(`UPDATE "orders" SET "bag_size" = 'medium' WHERE "bag_size" IS NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "bag_size" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "bundle_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "item_selections"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "bag_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "flow"`);
  }
}
