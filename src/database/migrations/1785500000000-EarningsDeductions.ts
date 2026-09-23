import { MigrationInterface, QueryRunner } from 'typeorm';

export class EarningsDeductions1785500000000 implements MigrationInterface {
  name = 'EarningsDeductions1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "earnings_deductions" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id"       UUID          NOT NULL,
        "order_id"        UUID,
        "dispute_id"      UUID,
        "amount_wp"       BIGINT        NOT NULL,
        "naira_snapshot"  DECIMAL(12,2),
        "reason"          VARCHAR(1000) NOT NULL,
        "status"          VARCHAR(20)   NOT NULL DEFAULT 'pending_response',
        "respond_by"      TIMESTAMPTZ   NOT NULL,
        "responded_at"    TIMESTAMPTZ,
        "vendor_response" VARCHAR(1000),
        "applied_at"      TIMESTAMPTZ,
        "cancelled_at"    TIMESTAMPTZ,
        "cancel_reason"   VARCHAR(1000),
        "created_by"      UUID          NOT NULL,
        "created_at"      TIMESTAMP     NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMP     NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_earnings_deductions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_earnings_deductions_vendor" ON "earnings_deductions" ("vendor_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_earnings_deductions_status" ON "earnings_deductions" ("status");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "earnings_deductions";`);
  }
}
