import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogueFloorPrice1785200000000 implements MigrationInterface {
  name = 'CatalogueFloorPrice1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "catalogue_items" ADD COLUMN IF NOT EXISTS "floor_price_ngn" decimal(12,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "catalogue_items" DROP COLUMN IF EXISTS "floor_price_ngn"`,
    );
  }
}
