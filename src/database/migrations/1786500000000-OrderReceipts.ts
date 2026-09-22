import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderReceipts1786500000000 implements MigrationInterface {
  name = 'OrderReceipts1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_receipts" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at"  timestamp NOT NULL DEFAULT now(),
        "updated_at"  timestamp NOT NULL DEFAULT now(),
        "order_id"    uuid NOT NULL,
        "party"       varchar(12) NOT NULL,
        "url"         varchar(2000) NOT NULL,
        "storage_key" varchar(500),
        CONSTRAINT "PK_order_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_receipts_order_party" UNIQUE ("order_id", "party")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_order_receipts_order_id" ON "order_receipts" ("order_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_receipts"`);
  }
}
