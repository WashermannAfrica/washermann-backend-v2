import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogueDryCleanEligible1786100000000 implements MigrationInterface {
  name = 'CatalogueDryCleanEligible1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "catalogue_items" ADD COLUMN IF NOT EXISTS "dry_clean_eligible" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "catalogue_items" DROP COLUMN IF EXISTS "dry_clean_eligible"`);
  }
}
