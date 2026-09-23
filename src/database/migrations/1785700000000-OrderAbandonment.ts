import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderAbandonment1785700000000 implements MigrationInterface {
  name = 'OrderAbandonment1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_attempts" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "uncollected_notice_count" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "first_uncollected_notice_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_uncollected_notice_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "abandoned_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "disposal_method" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "disposal_note" varchar(1000)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['disposal_note', 'disposal_method', 'abandoned_at', 'last_uncollected_notice_at', 'first_uncollected_notice_at', 'uncollected_notice_count', 'delivery_attempts']) {
      await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
