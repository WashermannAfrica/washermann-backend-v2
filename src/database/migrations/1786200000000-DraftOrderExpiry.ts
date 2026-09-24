import { MigrationInterface, QueryRunner } from 'typeorm';

export class DraftOrderExpiry1786200000000 implements MigrationInterface {
  name = 'DraftOrderExpiry1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "draft_order_expiry_hours" int NOT NULL DEFAULT 24`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_config" DROP COLUMN IF EXISTS "draft_order_expiry_hours"`);
  }
}
