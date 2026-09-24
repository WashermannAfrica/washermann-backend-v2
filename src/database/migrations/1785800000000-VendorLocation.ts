import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorLocation1785800000000 implements MigrationInterface {
  name = 'VendorLocation1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "location_updated_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "location_updated_at"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "longitude"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "latitude"`);
  }
}
