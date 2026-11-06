import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegCodesToOrders1793717100000 implements MigrationInterface {
  name = 'AddLegCodesToOrders1793717100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "first_leg_code" character varying(4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "second_leg_code" character varying(4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "second_leg_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "first_leg_code"`,
    );
  }
}
